/**
 * FlowWise Service - ROOT CA Level Workflow Orchestration
 * 
 * ARCHITECTURAL PRINCIPLE:
 * - Server (ROOT CA) is the SINGLE SOURCE OF TRUTH for workflow execution
 * - Angular is a "dumb" client that only listens and responds to decisions
 * - System steps (ledger, cashier) are FULLY AUTOMATED on server
 * - User knows nothing about workflow structure - just tells what to do
 * - FlowWiseService directly interacts with ROOT CA's EDGENCODE without limitation
 */

import * as fs from "fs";
import * as path from "path";
import { replaceTemplateVariables, evaluateCondition, type FlowWiseWorkflow, type WorkflowStep, type WorkflowContext, type WorkflowExecution } from "../flowwise";
import type { LedgerEntry, User } from "../types";
import { addLedgerEntry, processPayment, getCashierStatus } from "../ledger";
import { getWalletBalance } from "../wallet";

// Dependencies that need to be injected
let broadcastEvent: (event: any) => void;
let workflowDataPath: string = path.join(__dirname, "../../data");
let redisInstance: any = null; // InMemoryRedisServer instance

// FlowWiseService Certificate (issued by ROOT CA)
let FLOWWISE_SERVICE_UUID: string | null = null;
let FLOWWISE_SERVICE_CERTIFICATE: any | null = null;

/**
 * Initialize FlowWise Service with dependencies and issue ROOT CA certificate
 * SECURITY: FlowWiseService MUST be certified by ROOT CA to prevent ghost workflows
 */
export function initializeFlowWiseService(
  broadcastFn: (event: any) => void,
  dataPath?: string,
  rootCA?: any,
  rootCAIdentity?: any,
  redis?: any
): void {
  broadcastEvent = broadcastFn;
  redisInstance = redis; // Store redis instance
  if (dataPath) {
    workflowDataPath = dataPath;
  }
  
  // SECURITY: Issue ROOT CA certificate for FlowWiseService
  if (rootCA && rootCAIdentity) {
    try {
      FLOWWISE_SERVICE_UUID = `flowwise-service-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const { CERTIFICATE_REGISTRY } = require("../state");
      
      // Issue certificate from ROOT CA (subject is the UUID, not an identity object)
      FLOWWISE_SERVICE_CERTIFICATE = rootCA.issueCertificate({
        subject: FLOWWISE_SERVICE_UUID,
        capabilities: ["WORKFLOW_EXECUTE", "WORKFLOW_ORCHESTRATE", "LEDGER_CREATE", "PAYMENT_PROCESS"],
        constraints: {
          serviceName: "FlowWise Service",
          serviceType: "workflow-orchestration",
          version: "1.0.0"
        },
        ttlSeconds: 365 * 24 * 60 * 60 // 1 year
      });
      
      // Register certificate
      CERTIFICATE_REGISTRY.set(FLOWWISE_SERVICE_UUID, FLOWWISE_SERVICE_CERTIFICATE);
      
      console.log(`✅ [FlowWiseService] ROOT CA certificate issued: ${FLOWWISE_SERVICE_UUID}`);
      console.log(`✅ [FlowWiseService] Certificate capabilities: WORKFLOW_EXECUTE, WORKFLOW_ORCHESTRATE, LEDGER_CREATE, PAYMENT_PROCESS`);
      console.log(`✅ [FlowWiseService] Certificate expires: ${new Date(FLOWWISE_SERVICE_CERTIFICATE.expiresAt).toISOString()}`);
    } catch (error: any) {
      console.error(`❌ [FlowWiseService] Failed to issue ROOT CA certificate:`, error.message);
      throw new Error(`FlowWiseService certification failed: ${error.message}`);
    }
  } else {
    console.warn(`⚠️ [FlowWiseService] ROOT CA not provided - FlowWiseService will run without certificate (UNSAFE)`);
  }
  
  console.log(`✅ [FlowWiseService] Initialized as ROOT CA service`);
  console.log(`✅ [FlowWiseService] Workflow data path: ${workflowDataPath}`);
}

/**
 * Get FlowWiseService certificate UUID
 */
export function getFlowWiseServiceUUID(): string | null {
  return FLOWWISE_SERVICE_UUID;
}

/**
 * Validate FlowWiseService certificate
 * SECURITY: This prevents unauthorized/ghost workflows from executing
 */
export async function validateFlowWiseServiceCertificate(): Promise<boolean> {
  if (!FLOWWISE_SERVICE_UUID || !FLOWWISE_SERVICE_CERTIFICATE) {
    console.error(`❌ [FlowWiseService] No certificate issued - FlowWiseService is not certified`);
    return false;
  }
  
  const { CERTIFICATE_REGISTRY, REVOCATION_REGISTRY, ROOT_CA_IDENTITY } = require("../state");
  const { EdenPKI } = await import("../../EdenPKI");
  
  // Check if certificate exists in registry
  const cert = CERTIFICATE_REGISTRY.get(FLOWWISE_SERVICE_UUID);
  if (!cert) {
    console.error(`❌ [FlowWiseService] Certificate not found in registry: ${FLOWWISE_SERVICE_UUID}`);
    return false;
  }
  
  // Check if certificate is revoked
  if (REVOCATION_REGISTRY.has(FLOWWISE_SERVICE_UUID)) {
    console.error(`❌ [FlowWiseService] Certificate revoked: ${FLOWWISE_SERVICE_UUID}`);
    return false;
  }
  
  // Validate certificate signature
  if (!ROOT_CA_IDENTITY) {
    console.error(`❌ [FlowWiseService] ROOT CA identity not available`);
    return false;
  }
  
  const isValid = EdenPKI.validateCertificate(cert, ROOT_CA_IDENTITY.publicKey);
  if (!isValid) {
    console.error(`❌ [FlowWiseService] Certificate validation failed: ${FLOWWISE_SERVICE_UUID}`);
    return false;
  }
  
  console.log(`✅ [FlowWiseService] Certificate validated: ${FLOWWISE_SERVICE_UUID}`);
  return true;
}

/**
 * Load workflow definition from JSON file
 */
export function loadWorkflowDefinition(serviceType: "movie" | "dex"): FlowWiseWorkflow | null {
  try {
    const filename = serviceType === "movie" ? "amc_cinema.json" : "dex.json";
    const filePath = path.join(workflowDataPath, filename);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ [FlowWiseService] Workflow file not found: ${filePath}`);
      return null;
    }
    
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(fileContent);
    
    if (!data.flowwiseWorkflow) {
      console.error(`❌ [FlowWiseService] No flowwiseWorkflow found in ${filename}`);
      return null;
    }
    
    console.log(`✅ [FlowWiseService] Loaded workflow: ${data.flowwiseWorkflow.name} (${data.flowwiseWorkflow.version})`);
    return data.flowwiseWorkflow;
  } catch (error: any) {
    console.error(`❌ [FlowWiseService] Error loading workflow:`, error.message);
    return null;
  }
}

/**
 * Calculate workflow processing iGas
 * NEW: Workflow processing gas for orchestrating workflows
 */
function calculateWorkflowProcessingGas(
  stepCount: number,
  actionCount: number,
  complexity: number = 1
): number {
  const { WORKFLOW_BASE_COST, WORKFLOW_STEP_COST, WORKFLOW_ACTION_COST, WORKFLOW_COMPLEXITY_MULTIPLIER } = require("../constants");
  
  const baseCost = WORKFLOW_BASE_COST || 0.001; // Base cost for workflow orchestration
  const stepCost = (WORKFLOW_STEP_COST || 0.0001) * stepCount; // Cost per step
  const actionCost = (WORKFLOW_ACTION_COST || 0.00005) * actionCount; // Cost per action
  const complexityMultiplier = WORKFLOW_COMPLEXITY_MULTIPLIER || 1.0;
  
  return (baseCost + stepCost + actionCost) * complexity * complexityMultiplier;
}

/**
 * Start workflow execution from user input
 * This is the main entry point - user just provides input, server orchestrates everything
 * SECURITY: Validates FlowWiseService certificate before execution
 */
export async function startWorkflowFromUserInput(
  userInput: string,
  user: User,
  serviceType: "movie" | "dex" = "movie"
): Promise<{
  executionId: string;
  currentStep: string;
  instruction: {
    type: "wait" | "decision" | "display" | "complete";
    message: string;
    data?: any;
  };
  workflowProcessingGas?: number;
}> {
  // SECURITY: Validate FlowWiseService certificate before executing workflow
  if (!(await validateFlowWiseServiceCertificate())) {
    throw new Error("FlowWiseService is not certified by ROOT CA - workflow execution denied");
  }
  
  const executionId = `workflow-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  // Load workflow definition
  const workflow = loadWorkflowDefinition(serviceType);
  if (!workflow) {
    throw new Error(`Workflow not found for service type: ${serviceType}`);
  }

  // Calculate workflow processing gas
  const totalActions = workflow.steps.reduce((sum, step) => sum + (step.actions?.length || 0), 0);
  const workflowProcessingGas = calculateWorkflowProcessingGas(
    workflow.steps.length,
    totalActions,
    1 // Default complexity
  );

  // Initialize context with user input
  const context: WorkflowContext = {
    userInput,
    user,
    serviceType,
    timestamp: Date.now(),
    workflowProcessingGas, // Include workflow processing gas in context
    flowwiseServiceUUID: FLOWWISE_SERVICE_UUID // Include certificate UUID for audit
  };

  // Store execution
  if (!(global as any).workflowExecutions) {
    (global as any).workflowExecutions = new Map();
  }
  const workflowExecutions = (global as any).workflowExecutions as Map<string, any>;
  workflowExecutions.set(executionId, {
    executionId,
    workflow,
    context,
    currentStep: workflow.initialStep,
    history: [],
    flowwiseServiceUUID: FLOWWISE_SERVICE_UUID // Store certificate UUID for audit trail
  });

  // Execute initial step and return instruction
  const instruction = await executeNextStep(executionId);

  return {
    executionId,
    currentStep: workflow.initialStep,
    instruction,
    workflowProcessingGas
  };
}

/**
 * Execute next step in workflow
 * Returns instruction for Angular (what to display/ask user)
 */
export async function executeNextStep(executionId: string): Promise<{
  type: "wait" | "decision" | "display" | "complete";
  message: string;
  data?: any;
}> {
  const workflowExecutions = (global as any).workflowExecutions as Map<string, any>;
  const execution = workflowExecutions.get(executionId);
  
  if (!execution) {
    throw new Error(`Execution not found: ${executionId}`);
  }

  // Ensure execution has all required properties
  if (!execution.workflow) {
    throw new Error(`Execution ${executionId} is missing workflow definition. Execution keys: ${Object.keys(execution).join(', ')}`);
  }

  if (!execution.context) {
    console.warn(`⚠️ [FlowWiseService] Execution context is undefined in executeNextStep, initializing...`);
    execution.context = {};
  }

  if (!execution.currentStep) {
    console.warn(`⚠️ [FlowWiseService] Execution currentStep is undefined, using workflow initialStep...`);
    execution.currentStep = execution.workflow.initialStep;
  }

  const { workflow, context, currentStep } = execution;
  const step = workflow.steps.find((s: WorkflowStep) => s.id === currentStep);

  if (!step) {
    throw new Error(`Step not found: ${currentStep}`);
  }

  // SECURITY: Validate certificate before executing each step (prevents ghost workflows)
  if (!(await validateFlowWiseServiceCertificate())) {
    throw new Error("FlowWiseService certificate invalid or revoked - workflow execution denied");
  }

  console.log(`🔄 [FlowWiseService] Executing step: ${step.name} (${step.id}) [Certified: ${FLOWWISE_SERVICE_UUID}]`);
  console.log(`🔄 [FlowWiseService] Step type: ${step.type}, component: ${step.component}`);
  console.log(`🔄 [FlowWiseService] Step has ${step.actions?.length || 0} actions`);

  // Execute step actions (FULLY AUTOMATED on server)
  // CRITICAL: For ROOT CA steps, ALL actions execute atomically in one shot
  console.log(`🔄 [FlowWiseService] Calling executeStepActions for step: ${step.id}`);
  await executeStepActions(step, context, executionId);
  console.log(`🔄 [FlowWiseService] executeStepActions completed for step: ${step.id}`);

  // Broadcast WebSocket events
  if (step.websocketEvents) {
    for (const event of step.websocketEvents) {
      const processedEvent = replaceTemplateVariables(event, context);
      broadcastEvent({
        ...processedEvent,
        timestamp: Date.now(),
        data: {
          ...processedEvent.data,
          executionId,
          workflowId: executionId, // CRITICAL: Frontend expects workflowId, not just executionId
          stepId: step.id
        }
      });
    }
  }

  // Update execution
  execution.context = context;
  execution.history.push({
    step: currentStep,
    timestamp: Date.now()
  });

  // CRITICAL: Check if this is a decision step BEFORE evaluating transitions
  // Decision steps must wait for user input and should NOT auto-transition
  if (step.type === "decision" && step.requiresUserDecision) {
    execution.currentStep = currentStep; // Stay on decision step until user responds
    
    // Build options for decision step
    let options: any[] = [];
    
    // Handle dynamic options from listings (for user_select_listing step)
    if (step.dynamicOptions && step.dynamicOptions.source === "listings" && context.listings) {
      console.log(`   🎬 [FlowWiseService] Building dynamic options from ${context.listings.length} listings`);
      options = context.listings.map((listing: any) => {
        const label = replaceTemplateVariables(step.dynamicOptions!.labelTemplate, listing);
        const data: any = {};
        if (step.dynamicOptions.dataTemplate) {
          Object.keys(step.dynamicOptions.dataTemplate).forEach(key => {
            const template = step.dynamicOptions!.dataTemplate[key];
            data[key] = replaceTemplateVariables(template, listing);
          });
        }
        return {
          value: listing[step.dynamicOptions!.valueField] || listing.id,
          label: label,
          data: { ...listing, ...data }
        };
      });
      console.log(`   🎬 [FlowWiseService] Built ${options.length} options for user selection`);
    } else if (step.decisionOptions && Array.isArray(step.decisionOptions) && step.decisionOptions.length > 0) {
      // Use static decision options (for user_confirm_listing and other decision steps)
      console.log(`   🤔 [FlowWiseService] Building static decision options from ${step.decisionOptions.length} options`);
      options = step.decisionOptions.map((opt: any) => {
        const label = replaceTemplateVariables(opt.label || "", context);
        return {
          value: opt.value,
          label: label,
          action: opt.action // Preserve action if present
        };
      });
      console.log(`   🤔 [FlowWiseService] Built ${options.length} decision options:`, options.map(o => o.label));
    } else {
      console.warn(`   ⚠️ [FlowWiseService] No options found for decision step: ${step.id}`);
    }
    
    return {
      type: "decision",
      message: replaceTemplateVariables(step.decisionPrompt || "", context),
      data: {
        stepId: step.id,
        options: options,
        timeout: step.timeout || 60000,
        listings: context.listings // Include listings for frontend
      }
    };
  }

  // Determine next step (only for non-decision steps)
  const transitions = workflow.transitions.filter((t: any) => t.from === currentStep);
  console.log(`🔄 [FlowWiseService] Found ${transitions.length} transitions from step: ${currentStep}`);
  let nextStepId: string | null = null;

  for (const transition of transitions) {
    const conditionMet = !transition.condition || evaluateCondition(transition.condition, context);
    console.log(`🔄 [FlowWiseService] Transition: ${currentStep} → ${transition.to}, condition: ${transition.condition || 'always'}, met: ${conditionMet}`);
    if (conditionMet) {
      nextStepId = transition.to;
      console.log(`🔄 [FlowWiseService] ✅ Selected next step: ${nextStepId}`);
      break;
    }
  }
  
  if (!nextStepId) {
    console.warn(`⚠️ [FlowWiseService] No valid transition found from step: ${currentStep}`);
  }

  // Check if workflow is complete
  if (workflow.finalSteps.includes(currentStep) || !nextStepId) {
    execution.currentStep = currentStep;
    return {
      type: "complete",
      message: "Workflow completed successfully",
      data: { context }
    };
  }

  // CRITICAL: ROOT CA steps (ledger, cashier, settlement) execute silently but do NOT auto-continue
  // This prevents service providers from dictating ROOT CA level operations
  // ROOT CA steps broadcast all data to Angular but wait for explicit workflow progression
  const nextStep = workflow.steps.find((s: WorkflowStep) => s.id === nextStepId);
  const isROOTCAStep = nextStep && (
    nextStep.component === "root-ca" || 
    nextStep.id === "root_ca_ledger_and_payment" ||
    nextStep.id === "root_ca_ledger_settlement" ||
    nextStep.id === "root_ca_cashier_oversight"
  );
  
  // Auto-continue only for non-ROOT CA system steps (not requiring user input)
  // ROOT CA steps execute silently but do NOT auto-continue - they broadcast and wait
  if (nextStep && nextStep.type !== "decision" && nextStep.type !== "input" && !isROOTCAStep) {
    // System step - auto-execute
    execution.currentStep = nextStepId!;
    return await executeNextStep(executionId); // Recursively execute next step
  }
  
  // ROOT CA steps: Execute silently, broadcast all data, but do NOT auto-continue
  // This ensures ROOT CA maintains control and service providers cannot dictate these steps
  if (isROOTCAStep) {
    console.log(`🔐 [FlowWiseService] ROOT CA step detected: ${nextStepId}`);
    console.log(`🔐 [FlowWiseService] Executing ROOT CA step atomically (all actions in one shot)`);
    execution.currentStep = nextStepId!;
    // Execute the ROOT CA step silently (it will broadcast all events)
    // CRITICAL: This MUST execute all actions atomically
    const rootCAInstruction = await executeNextStep(executionId);
    console.log(`🔐 [FlowWiseService] ROOT CA step completed: ${nextStepId}`);
    // Return the instruction but do NOT auto-continue - workflow progression is explicit
    return rootCAInstruction;
  }

  // User input or display step
  execution.currentStep = nextStepId!;
  return {
    type: "display",
    message: `Step: ${nextStep?.name || nextStepId}`,
    data: {
      stepId: nextStepId,
      context
    }
  };
}

/**
 * Execute step actions (FULLY AUTOMATED on server)
 * System steps like ledger, cashier are executed here without Angular involvement
 * FlowWiseService has DIRECT ACCESS to ROOT CA services (ledger, wallet, LLM, etc.)
 */
async function executeStepActions(
  step: WorkflowStep,
  context: WorkflowContext,
  executionId: string
): Promise<void> {
  console.log(`   ⚙️ [FlowWiseService] executeStepActions called for step: ${step.id}`);
  console.log(`   ⚙️ [FlowWiseService] Step has ${step.actions?.length || 0} actions`);
  
  if (!step.actions || step.actions.length === 0) {
    console.log(`   ⚙️ [FlowWiseService] No actions to execute for step: ${step.id}`);
    return;
  }

  // Import action handlers - FlowWiseService has DIRECT ACCESS to ROOT CA services
  // Import from state and other modules directly
  const { 
    CERTIFICATE_REGISTRY, 
    REVOCATION_REGISTRY, 
    ROOT_CA_IDENTITY,
    LEDGER: LEDGER_ARRAY
  } = await import("../state");
  const { EdenPKI } = await import("../../EdenPKI");
  
  // Import LLM and service registry functions
  const { 
    extractQueryWithOpenAI, 
    extractQueryWithDeepSeek,
    formatResponseWithOpenAI,
    formatResponseWithDeepSeek
  } = await import("../llm");
  const { queryROOTCAServiceRegistry } = await import("../serviceProvider");
  const { debitWallet } = await import("../wallet");
  
  // Certificate functions (local to this function)
  function getCertificate(uuid: string): any {
    return CERTIFICATE_REGISTRY.get(uuid);
  }
  
  function validateCertificate(uuid: string): boolean {
    const cert = CERTIFICATE_REGISTRY.get(uuid);
    if (!cert) return false;
    if (REVOCATION_REGISTRY.has(uuid)) return false;
    if (!ROOT_CA_IDENTITY) return false;
    return EdenPKI.validateCertificate(cert, ROOT_CA_IDENTITY.publicKey);
  }
  
  // Get LLM config from environment
  const ENABLE_OPENAI = process.env.ENABLE_OPENAI === 'true';
  const MOCKED_LLM = process.env.MOCKED_LLM === 'true';

  console.log(`   ⚙️ [FlowWiseService] Step has ${step.actions?.length || 0} actions to execute`);
  console.log(`   ⚙️ [FlowWiseService] 🔐 ROOT CA: Executing ALL actions atomically in step: ${step.id}`);
  
  // CRITICAL: Execute ALL actions sequentially and atomically
  // For ROOT CA steps, ALL actions must complete in a single shot
  for (let i = 0; i < step.actions.length; i++) {
    const action = step.actions[i];
    const processedAction = replaceTemplateVariables(action, context);
    
    console.log(`   ⚙️ [FlowWiseService] [${i + 1}/${step.actions.length}] Executing action: ${processedAction.type} (step: ${step.id})`);

    try {
      switch (processedAction.type) {
        case "validate":
          context.validationPassed = true;
          context.errors = [];
          break;

        case "llm_extract_query":
          // Extract query using LLM (FULLY AUTOMATED)
          if (MOCKED_LLM) {
            context.queryResult = {
              serviceType: context.serviceType || "movie",
              query: {
                filters: {
                  genre: 'sci-fi',
                  time: 'evening'
                }
              }
            };
          } else {
            const extractFn = ENABLE_OPENAI ? extractQueryWithOpenAI : extractQueryWithDeepSeek;
            const queryResult = await extractFn(context.userInput || "");
            context.queryResult = queryResult;
            context.serviceType = queryResult.serviceType;
          }
          break;

        case "query_service_registry":
          // Query service registry (FULLY AUTOMATED)
          if (!context.queryResult) {
            throw new Error("Query result required for service registry query");
          }
          const listings = await queryROOTCAServiceRegistry(context.queryResult.query);
          context.listings = listings;
          break;

        case "llm_format_response":
          // Format response using LLM (FULLY AUTOMATED)
          if (!context.listings || context.listings.length === 0) {
            throw new Error("Listings required for LLM formatting");
          }
          const formatFn = ENABLE_OPENAI ? formatResponseWithOpenAI : formatResponseWithDeepSeek;
          const llmResponse = await formatFn(
            context.listings,
            context.userInput || "",
            context.queryResult?.query?.filters
          );
          context.llmResponse = llmResponse;
          context.iGasCost = llmResponse.iGasCost;
          if (llmResponse.selectedListing) {
            context.selectedListing = llmResponse.selectedListing;
          }
          break;

        case "check_balance":
          // Check user balance (FULLY AUTOMATED)
          const balance = await getWalletBalance(context.user?.email || "");
          context.hasBalance = balance >= (context.selectedListing?.price || 0);
          context.currentBalance = balance;
          context.requiredAmount = context.selectedListing?.price || 0;
          break;

        case "create_snapshot":
          // Create transaction snapshot (FULLY AUTOMATED)
          context.snapshot = {
            txId: `tx_${Date.now()}`,
            blockTime: Date.now(),
            payer: context.user?.email || "unknown@example.com",
            amount: processedAction.amount || context.moviePrice || context.selectedListing?.price || 0,
            feeSplit: {
              indexer: 0,
              cashier: 0.1,
              provider: (processedAction.amount || context.selectedListing?.price || 0) * 0.05,
              eden: (processedAction.amount || context.selectedListing?.price || 0) * 0.02
            }
          };
          context.moviePrice = context.selectedListing?.price || context.snapshot.amount;
          context.iGasCost = context.iGasCost || 0.00445;
          break;

        case "validate_certificate":
          // Validate provider certificate (FULLY AUTOMATED)
          const providerUuid = processedAction.providerUuid || context.selectedListing?.providerId || context.providerUuid;
          if (providerUuid) {
            const certificate = getCertificate(providerUuid);
            const isValid = certificate ? validateCertificate(providerUuid) : false;
            context.certificateValid = isValid;
            context.providerUuid = providerUuid;
          }
          break;

        case "add_ledger_entry":
          // Create ledger entry (FULLY AUTOMATED)
          if (!context.snapshot) {
            throw new Error("Snapshot required for ledger entry");
          }
          // Ensure snapshot amount is valid
          const entryAmount = context.snapshot.amount && context.snapshot.amount > 0
            ? context.snapshot.amount
            : (context.moviePrice || context.selectedListing?.price || 0);
          
          if (!entryAmount || entryAmount === 0) {
            throw new Error(`Cannot create ledger entry: amount is ${entryAmount}`);
          }

          // Update snapshot amount if needed
          if (!context.snapshot.amount || context.snapshot.amount === 0) {
            context.snapshot.amount = entryAmount;
          }

          const ledgerEntry = addLedgerEntry(
            context.snapshot,
            context.serviceType || "movie",
            context.iGasCost || 0.00445,
            context.user?.email || "unknown@example.com",
            context.selectedListing?.providerName || "AMC Theatres",
            context.providerUuid || context.selectedListing?.providerId || "amc-001",
            {
              movieTitle: context.selectedListing?.movieTitle,
              showtime: context.selectedListing?.showtime,
              location: context.selectedListing?.location,
              price: entryAmount
            }
          );
          context.ledgerEntry = ledgerEntry;
          // Initialize cashier in context for payment step
          if (!context.cashier) {
            context.cashier = getCashierStatus();
          }
          break;

        case "process_payment": {
          // Process payment (FULLY AUTOMATED - ROOT CA LEVEL - NO SERVICE PROVIDER CONTROL)
          console.log(`   💰 [FlowWiseService] ========================================`);
          console.log(`   💰 [FlowWiseService] 🔐 ROOT CA: PROCESSING PAYMENT (ATOMIC)`);
          console.log(`   💰 [FlowWiseService] ========================================`);
          
          if (!context.ledgerEntry || !context.user) {
            throw new Error("Ledger entry and user required for payment");
          }
          
          // Find ledger entry in LEDGER array (CRITICAL: Must find actual entry to update status)
          const ledgerEntryInArray = LEDGER_ARRAY.find((e: any) => e.entryId === context.ledgerEntry.entryId);
          if (!ledgerEntryInArray) {
            console.error(`   ❌ [FlowWiseService] Ledger entry not found in LEDGER array: ${context.ledgerEntry.entryId}`);
            console.error(`   ❌ [FlowWiseService] Available entryIds:`, LEDGER_ARRAY.map((e: any) => e.entryId));
            throw new Error(`Ledger entry ${context.ledgerEntry.entryId} not found in LEDGER array`);
          }

          console.log(`   💰 [FlowWiseService] Found ledger entry in array:`, {
            entryId: ledgerEntryInArray.entryId,
            amount: ledgerEntryInArray.amount,
            status: ledgerEntryInArray.status
          });

          // Ensure amount is set
          const paymentAmount = ledgerEntryInArray.amount || context.selectedListing?.price || 0;
          if (!paymentAmount || paymentAmount === 0) {
            throw new Error(`Cannot process payment: amount is ${paymentAmount}`);
          }

          console.log(`   💰 [FlowWiseService] Payment amount: ${paymentAmount}`);

          // Get cashier (CRITICAL: Must get actual CASHIER object, not a copy)
          // Note: getCashierStatus() now returns the actual CASHIER object
          const cashier = getCashierStatus();
          console.log(`   💰 [FlowWiseService] Cashier before payment:`, {
            id: cashier.id,
            name: cashier.name,
            processedCount: cashier.processedCount,
            totalProcessed: cashier.totalProcessed
          });

          // Process payment (processPayment handles wallet debiting internally via processWalletIntent)
          // This will update ledger entry status to 'processed' and persist
          console.log(`   💰 [FlowWiseService] Calling processPayment function...`);
          const paymentResult = await processPayment(cashier, ledgerEntryInArray, context.user);
          
          console.log(`   💰 [FlowWiseService] Payment result:`, paymentResult);
          console.log(`   💰 [FlowWiseService] Ledger entry status after payment:`, ledgerEntryInArray.status);
          console.log(`   💰 [FlowWiseService] Cashier after payment:`, {
            id: cashier.id,
            processedCount: cashier.processedCount,
            totalProcessed: cashier.totalProcessed
          });

          if (!paymentResult) {
            console.error(`   ❌ [FlowWiseService] Payment processing returned false`);
            throw new Error("Payment processing failed");
          }

          // CRITICAL: Verify ledger entry status is 'processed' and persist
          if (ledgerEntryInArray.status !== 'processed') {
            console.warn(`   ⚠️ [FlowWiseService] Ledger entry status is ${ledgerEntryInArray.status}, expected 'processed'. Updating...`);
            ledgerEntryInArray.status = 'processed';
          }
          
          // CRITICAL: Always persist after payment processing to ensure status is saved
          if (redisInstance) {
            redisInstance.saveLedgerEntries(LEDGER_ARRAY);
            console.log(`   💾 [FlowWiseService] ✅ Persisted ledger entry with processed status: ${ledgerEntryInArray.entryId}`);
            console.log(`   💾 [FlowWiseService] Total entries in LEDGER: ${LEDGER_ARRAY.length}`);
          } else {
            console.error(`   ❌ [FlowWiseService] Redis instance not available! Cannot persist ledger entry!`);
            throw new Error("Redis instance not available - cannot persist processed status. Ensure redis is passed to initializeFlowWiseService.");
          }

          // Update context with payment results
          context.paymentSuccess = paymentResult;
          context.paymentProcessed = paymentResult;
          context.ledgerEntry = ledgerEntryInArray; // Update with processed entry (status: 'processed')
          context.cashier = cashier; // Update with processed cashier
          
          // Get updated user balance (processPayment already updated it via wallet service)
          const updatedBalance = await getWalletBalance(context.user.email);
          context.user.balance = updatedBalance;
          context.newBalance = updatedBalance;

          // CRITICAL: Final verification - ensure status is 'processed' before completing
          if (ledgerEntryInArray.status !== 'processed') {
            console.error(`   ❌ [FlowWiseService] CRITICAL: Payment processed but entry status is still ${ledgerEntryInArray.status}!`);
            console.error(`   ❌ [FlowWiseService] Forcing status update to 'processed'...`);
            ledgerEntryInArray.status = 'processed';
            // Persist immediately
            if (redisInstance) {
              redisInstance.saveLedgerEntries(LEDGER_ARRAY);
              console.log(`   💾 [FlowWiseService] ✅ Forced status update and persisted`);
            }
          }
          
          console.log(`   💰 [FlowWiseService] ========================================`);
          console.log(`   💰 [FlowWiseService] ✅ ROOT CA: PAYMENT PROCESSED SUCCESSFULLY`);
          console.log(`   💰 [FlowWiseService] Entry ID: ${ledgerEntryInArray.entryId}`);
          console.log(`   💰 [FlowWiseService] Entry Status: ${ledgerEntryInArray.status} (VERIFIED)`);
          console.log(`   💰 [FlowWiseService] Cashier processedCount: ${cashier.processedCount}`);
          console.log(`   💰 [FlowWiseService] Cashier totalProcessed: ${cashier.totalProcessed}`);
          console.log(`   💰 [FlowWiseService] User Balance: ${updatedBalance}`);
          console.log(`   💰 [FlowWiseService] ========================================`);
          break;
        }

        case "complete_booking":
          // Complete booking (FULLY AUTOMATED)
          context.bookingId = `booking-${Date.now()}`;
          context.bookingStatus = 'confirmed';
          break;

        case "start_movie_watching":
          // Start movie watching (FULLY AUTOMATED - async simulation)
          context.movieStarted = true;
          context.movieTitle = processedAction.movieTitle || context.selectedListing?.movieTitle || 'Unknown Movie';
          context.movieProgress = 0;
          context.currentScene = 'garden';
          
          // Simulate movie watching (async)
          await new Promise<void>((resolve) => {
            const duration = processedAction.duration || 10;
            
            setTimeout(() => {
              context.movieProgress = 30;
              context.currentScene = 'cross';
              broadcastEvent({
                type: "scene_transition",
                component: "movie_theater",
                message: "Transitioning to the Cross scene",
                timestamp: Date.now(),
                data: { scene: 'cross', progress: 30 }
              });
            }, duration * 1000 * 0.3);

            setTimeout(() => {
              context.movieProgress = 60;
              context.currentScene = 'utah_action';
              broadcastEvent({
                type: "scene_transition",
                component: "movie_theater",
                message: "Initiating Utah Action Consensus",
                timestamp: Date.now(),
                data: { scene: 'utah_action', progress: 60 }
              });
            }, duration * 1000 * 0.6);

            setTimeout(() => {
              context.movieProgress = 90;
              context.currentScene = 'garden_return';
              broadcastEvent({
                type: "scene_transition",
                component: "movie_theater",
                message: "Fading to white for the Garden return",
                timestamp: Date.now(),
                data: { scene: 'garden_return', progress: 90 }
              });
            }, duration * 1000 * 0.9);

            setTimeout(() => {
              context.movieWatched = true;
              context.movieProgress = 100;
              context.finalScene = 'genesis_garden';
              broadcastEvent({
                type: "movie_finished",
                component: "movie_theater",
                message: "Movie finished. Returning to Garden Genesis state.",
                timestamp: Date.now(),
                data: { completed: true, finalScene: 'genesis_garden' }
              });
              resolve();
            }, duration * 1000);
          });
          break;

        // ROOT CA actions (ledger settlement, cashier oversight)
        case "root_ca_consume_ledger":
          console.log(`   🔐 [FlowWiseService] ========================================`);
          console.log(`   🔐 [FlowWiseService] ROOT CA: CONSUMING LEDGER ENTRY`);
          console.log(`   🔐 [FlowWiseService] ========================================`);
          
          if (context.ledgerEntry && context.ledgerEntry.entryId) {
            // Push ledger entry to settlement stream (for ROOT CA processing)
            const { pushLedgerEntryToSettlementStream } = await import("../ledger");
            await pushLedgerEntryToSettlementStream(context.ledgerEntry);
            console.log(`   🔐 [FlowWiseService] ✅ Pushed ledger entry ${context.ledgerEntry.entryId} to settlement stream`);
            context[`${processedAction.type}_completed`] = true;
            console.log(`   🔐 [FlowWiseService] ========================================`);
          } else {
            console.error(`   ❌ [FlowWiseService] No ledger entry in context to consume`);
          }
          break;

        case "root_ca_validate_entry":
          console.log(`   🔐 [FlowWiseService] ROOT CA action: ${processedAction.type}`);
          // Validate ledger entry and certificate
          if (context.ledgerEntry && context.providerUuid) {
            // Certificate validation is already done in validate_certificate action
            context.certificateValid = true;
            context[`${processedAction.type}_completed`] = true;
          }
          break;

        case "root_ca_settle_entry": {
          console.log(`   🔐 [FlowWiseService] ========================================`);
          console.log(`   🔐 [FlowWiseService] ROOT CA: SETTLING LEDGER ENTRY`);
          console.log(`   🔐 [FlowWiseService] ========================================`);
          
          // CRITICAL: Update ledger entry status from 'processed' to 'completed'
          if (!context.ledgerEntry) {
            console.error(`   ❌ [FlowWiseService] CRITICAL: No ledger entry in context!`);
            console.error(`   ❌ [FlowWiseService] Context keys:`, Object.keys(context));
            throw new Error("No ledger entry in context to settle");
          }
          
          if (!context.ledgerEntry.entryId) {
            console.error(`   ❌ [FlowWiseService] CRITICAL: Ledger entry has no entryId!`);
            console.error(`   ❌ [FlowWiseService] Ledger entry:`, context.ledgerEntry);
            throw new Error("Ledger entry missing entryId");
          }
          
          // Use the LEDGER_ARRAY already imported at the start of executeStepActions
          // This ensures we're working with the same reference that was used in process_payment
          console.log(`   🔐 [FlowWiseService] Searching for entryId: ${context.ledgerEntry.entryId}`);
          console.log(`   🔐 [FlowWiseService] LEDGER_ARRAY length: ${LEDGER_ARRAY.length}`);
          console.log(`   🔐 [FlowWiseService] Available entryIds:`, LEDGER_ARRAY.map((e: LedgerEntry) => e.entryId));
          
          const ledgerEntryInArray = LEDGER_ARRAY.find((e: LedgerEntry) => e.entryId === context.ledgerEntry.entryId);
          
          if (!ledgerEntryInArray) {
            console.error(`   ❌ [FlowWiseService] CRITICAL: Ledger entry not found in LEDGER array!`);
            console.error(`   ❌ [FlowWiseService] Looking for: ${context.ledgerEntry.entryId}`);
            throw new Error(`Ledger entry ${context.ledgerEntry.entryId} not found in LEDGER array`);
          }
          
          console.log(`   🔐 [FlowWiseService] ✅ Found ledger entry: ${ledgerEntryInArray.entryId}`);
          console.log(`   🔐 [FlowWiseService] Current status: ${ledgerEntryInArray.status}`);
          
          // CRITICAL: Update status to 'completed' (settled)
          ledgerEntryInArray.status = 'completed';
          console.log(`   🔐 [FlowWiseService] ✅ Updated status to: ${ledgerEntryInArray.status}`);
          
          // Update context ledger entry (use the same reference from LEDGER array)
          context.ledgerEntry = ledgerEntryInArray;
          context.settlementStatus = 'settled';
          
          // CRITICAL: Persist immediately (ROOT CA operation - no debounce)
          // Use the redis instance passed during initialization
          if (redisInstance) {
            console.log(`   💾 [FlowWiseService] Persisting LEDGER_ARRAY with ${LEDGER_ARRAY.length} entries...`);
            redisInstance.saveLedgerEntries(LEDGER_ARRAY);
            console.log(`   💾 [FlowWiseService] ✅ ROOT CA: Persisted ledger entry with completed status: ${ledgerEntryInArray.entryId}`);
            
            // Verify persistence by checking the entry again
            const verifyEntry = LEDGER_ARRAY.find((e: LedgerEntry) => e.entryId === ledgerEntryInArray.entryId);
            if (verifyEntry) {
              console.log(`   🔐 [FlowWiseService] Verification - Entry status: ${verifyEntry.status}`);
              if (verifyEntry.status !== 'completed') {
                console.error(`   ❌ [FlowWiseService] CRITICAL: Entry status verification failed! Expected 'completed', got '${verifyEntry.status}'`);
                // Force update again
                verifyEntry.status = 'completed';
                redisInstance.saveLedgerEntries(LEDGER_ARRAY);
                console.log(`   🔐 [FlowWiseService] ✅ Forced status update and re-persisted`);
              } else {
                console.log(`   🔐 [FlowWiseService] ✅ Verification passed - Entry status is 'completed'`);
              }
            } else {
              console.error(`   ❌ [FlowWiseService] CRITICAL: Could not find entry for verification!`);
            }
          } else {
            console.error(`   ❌ [FlowWiseService] CRITICAL: Redis instance not available! Cannot persist completed status!`);
            console.error(`   ❌ [FlowWiseService] Redis instance was not passed to initializeFlowWiseService`);
            throw new Error("Redis instance not available - cannot persist completed status. Ensure redis is passed to initializeFlowWiseService.");
          }
          
          // Broadcast settlement event
          broadcastEvent({
            type: "ledger_entry_settled",
            component: "root-ca",
            message: `Ledger entry settled: ${ledgerEntryInArray.entryId}`,
            timestamp: Date.now(),
            data: {
              entryId: ledgerEntryInArray.entryId,
              status: 'completed',
              ledgerEntry: ledgerEntryInArray
            }
          });
          
          context[`${processedAction.type}_completed`] = true;
          console.log(`   🔐 [FlowWiseService] ========================================`);
          break;
        }

        case "root_ca_update_balances":
          console.log(`   🔐 [FlowWiseService] ========================================`);
          console.log(`   🔐 [FlowWiseService] ROOT CA: UPDATING BALANCES`);
          console.log(`   🔐 [FlowWiseService] ========================================`);
          
          if (context.ledgerEntry && context.ledgerEntry.entryId) {
            // Import required modules
            const { ROOT_BALANCES, ROOT_CA_SERVICE_REGISTRY } = await import("../state");
            const { ROOT_CA_FEE, INDEXER_FEE, ITAX_DISTRIBUTION } = await import("../constants");
            
            const entry = context.ledgerEntry;
            const iGas = entry.iGasCost || 0;
            const iTax = entry.bookingDetails?.iTax || 0;
            const fees = entry.fees || {};
            
            // Calculate fees
            const rootCAFee = fees.rootCA || (iGas * ROOT_CA_FEE);
            const indexerFee = fees.indexer || (iGas * INDEXER_FEE);
            const providerFee = fees.provider || 0;
            
            // Get indexer ID from provider's garden
            const provider = ROOT_CA_SERVICE_REGISTRY.find((p: any) => p.uuid === entry.providerUuid);
            const indexerId = provider?.gardenId || 'unknown';
            
            console.log(`   🔐 [FlowWiseService] Entry: ${entry.entryId}`);
            console.log(`   🔐 [FlowWiseService] iGas: ${iGas}, iTax: ${iTax}`);
            console.log(`   🔐 [FlowWiseService] ROOT CA Fee: ${rootCAFee}, Indexer Fee: ${indexerFee}, Provider Fee: ${providerFee}`);
            console.log(`   🔐 [FlowWiseService] Indexer ID: ${indexerId}`);
            
            // Update ROOT CA balance
            ROOT_BALANCES.rootCA += rootCAFee;
            console.log(`   🔐 [FlowWiseService] ROOT CA Balance (before): ${(ROOT_BALANCES.rootCA - rootCAFee).toFixed(6)}`);
            console.log(`   🔐 [FlowWiseService] ROOT CA Balance (after): ${ROOT_BALANCES.rootCA.toFixed(6)}`);
            
            // Update indexer balance
            if (iTax > 0) {
              // iTax distribution: 40% ROOT CA, 30% Indexer, 30% Trader (already applied)
              const iTaxRootCA = iTax * ITAX_DISTRIBUTION.rootCA;
              ROOT_BALANCES.rootCA += iTaxRootCA;
              
              const currentIndexerBalance = ROOT_BALANCES.indexers.get(indexerId) || 0;
              const iTaxIndexer = iTax * ITAX_DISTRIBUTION.indexer;
              ROOT_BALANCES.indexers.set(indexerId, currentIndexerBalance + indexerFee + iTaxIndexer);
              console.log(`   🔐 [FlowWiseService] Indexer ${indexerId} Balance: ${ROOT_BALANCES.indexers.get(indexerId)?.toFixed(6) || "0"}`);
            } else {
              // Regular iGas fee distribution
              const currentIndexerBalance = ROOT_BALANCES.indexers.get(indexerId) || 0;
              ROOT_BALANCES.indexers.set(indexerId, currentIndexerBalance + indexerFee);
              console.log(`   🔐 [FlowWiseService] Indexer ${indexerId} Balance: ${ROOT_BALANCES.indexers.get(indexerId)?.toFixed(6) || "0"}`);
            }
            
            // Update provider balance (if provider UUID exists)
            if (entry.providerUuid && entry.providerUuid !== 'MISSING-UUID') {
              const currentProviderBalance = ROOT_BALANCES.providers.get(entry.providerUuid) || 0;
              ROOT_BALANCES.providers.set(entry.providerUuid, currentProviderBalance + providerFee);
              console.log(`   🔐 [FlowWiseService] Provider ${entry.providerUuid} Balance: ${ROOT_BALANCES.providers.get(entry.providerUuid)?.toFixed(6) || "0"}`);
            }
            
            context.balancesUpdated = true;
            context[`${processedAction.type}_completed`] = true;
            console.log(`   🔐 [FlowWiseService] ========================================`);
          } else {
            console.error(`   ❌ [FlowWiseService] No ledger entry in context to update balances`);
          }
          break;

        case "root_ca_finalize_fees":
          console.log(`   🔐 [FlowWiseService] ROOT CA action: ${processedAction.type}`);
          // Fees are already calculated and applied in root_ca_update_balances
          // This action just confirms finalization
          if (context.ledgerEntry) {
            const fees = context.ledgerEntry.fees || {};
            console.log(`   🔐 [FlowWiseService] Finalized fees:`, fees);
            context.feesFinalized = true;
          }
          context[`${processedAction.type}_completed`] = true;
          break;

        case "root_ca_validate_payment":
        case "root_ca_verify_balance_update":
        case "root_ca_authorize_payment":
          // ROOT CA actions are handled in the workflow but can be extended here
          console.log(`   🔐 [FlowWiseService] ROOT CA action: ${processedAction.type}`);
          context[`${processedAction.type}_completed`] = true;
          break;

        default:
          console.warn(`   ⚠️ [FlowWiseService] Unknown action type: ${processedAction.type}`);
      }
    } catch (actionError: any) {
      console.error(`   ❌ [FlowWiseService] Error executing action ${processedAction.type}:`, actionError);
      throw actionError; // Re-throw to fail the step
    }
  }
}

/**
 * Submit user decision and continue workflow
 */
export async function submitUserDecision(
  executionId: string,
  decision: string,
  selectionData?: any
): Promise<{
  instruction: {
    type: "wait" | "decision" | "display" | "complete";
    message: string;
    data?: any;
  };
}> {
  // Ensure workflowExecutions Map exists
  if (!(global as any).workflowExecutions) {
    console.error(`❌ [FlowWiseService] workflowExecutions Map not initialized!`);
    (global as any).workflowExecutions = new Map();
    throw new Error(`WorkflowExecutions Map not initialized. This should not happen.`);
  }
  
  const workflowExecutions = (global as any).workflowExecutions as Map<string, any>;
  console.log(`   🔍 [FlowWiseService] Looking for executionId: ${executionId}`);
  console.log(`   🔍 [FlowWiseService] workflowExecutions size: ${workflowExecutions.size}`);
  console.log(`   🔍 [FlowWiseService] Available executionIds:`, Array.from(workflowExecutions.keys()));
  
  const execution = workflowExecutions.get(executionId);
  
  if (!execution) {
    console.error(`   ❌ [FlowWiseService] Execution not found: ${executionId}`);
    console.error(`   ❌ [FlowWiseService] Available executions:`, Array.from(workflowExecutions.keys()));
    throw new Error(`Execution not found: ${executionId}. Available executions: ${Array.from(workflowExecutions.keys()).join(', ')}`);
  }

  // Ensure execution has all required properties
  if (!execution.workflow) {
    throw new Error(`Execution ${executionId} is missing workflow definition. Execution keys: ${Object.keys(execution).join(', ')}`);
  }

  if (!execution.context) {
    console.warn(`⚠️ [FlowWiseService] Execution context is undefined, initializing...`);
    execution.context = {};
  }

  if (!execution.currentStep) {
    console.warn(`⚠️ [FlowWiseService] Execution currentStep is undefined, using workflow initialStep...`);
    execution.currentStep = execution.workflow.initialStep;
  }

  // Update context with decision
  // CRITICAL: Set userDecision in context BEFORE evaluating transitions
  execution.context.userDecision = decision;
  console.log(`   🔄 [FlowWiseService] Set userDecision in context: ${decision}`);
  
  if (selectionData) {
    // If selectionData is provided, use it as the selected listing
    // But also try to find the full listing from the listings array if available
    let selectedListing = selectionData;
    
    // If selectionData is just an ID string, try to find the full listing from context.listings
    if (typeof selectionData === 'string' && execution.context.listings) {
      const foundListing = execution.context.listings.find((listing: any) => 
        listing.id === selectionData || listing.providerId === selectionData
      );
      if (foundListing) {
        selectedListing = foundListing;
        console.log(`   🎬 [FlowWiseService] Found full listing from listings array for ID: ${selectionData}`);
      } else {
        console.warn(`   ⚠️ [FlowWiseService] Could not find listing in context.listings for ID: ${selectionData}`);
      }
    } else if (typeof selectionData === 'object' && execution.context.listings) {
      // If selectionData is an object but might be missing fields, try to merge with full listing
      const foundListing = execution.context.listings.find((listing: any) => 
        listing.id === selectionData.id || 
        listing.id === selectionData.providerId ||
        (selectionData.id && listing.providerId === selectionData.id)
      );
      if (foundListing) {
        // Merge to ensure all fields are present
        selectedListing = { ...foundListing, ...selectionData };
        console.log(`   🎬 [FlowWiseService] Merged selectionData with full listing from listings array`);
      }
    }
    
    execution.context.userSelection = selectedListing;
    execution.context.selectedListing = selectedListing;
    
    // CRITICAL: Preserve listings array in context for template variable resolution
    // This ensures that template variables like {{id}}, {{movieTitle}}, etc. can be resolved
    if (execution.context.listings && !execution.context.listings.find((l: any) => 
      (l.id === selectedListing.id || l.id === selectedListing.providerId) ||
      (selectedListing.id && l.providerId === selectedListing.id)
    )) {
      // If selected listing is not in listings array, add it
      execution.context.listings.push(selectedListing);
    }
    
    console.log(`   🎬 [FlowWiseService] User selected listing:`, {
      id: selectedListing.id || selectedListing.providerId,
      movieTitle: selectedListing.movieTitle,
      price: selectedListing.price,
      providerName: selectedListing.providerName
    });
  }

  // CRITICAL: After user decision, evaluate transitions from CURRENT step to find NEXT step
  // Don't re-execute the current step - move forward to the next step
  try {
    const { workflow, context, currentStep } = execution;
    
    // Ensure context is updated with the decision before evaluating transitions
    // This is critical for transition conditions like {{userDecision}} === 'YES'
    console.log(`   🔄 [FlowWiseService] Current step: ${currentStep}, userDecision: ${context.userDecision}`);
    console.log(`   🔄 [FlowWiseService] Context keys:`, Object.keys(context));
    
    if (!workflow || !workflow.transitions) {
      throw new Error(`Workflow or transitions missing. Workflow: ${!!workflow}, Transitions: ${!!workflow?.transitions}`);
    }
    
    const transitions = workflow.transitions.filter((t: any) => t.from === currentStep);
    console.log(`   🔄 [FlowWiseService] Evaluating ${transitions.length} transitions from step: ${currentStep}`);
    
    if (transitions.length === 0) {
      throw new Error(`No transitions found from step: ${currentStep}. Available transitions: ${workflow.transitions.map((t: any) => `${t.from} → ${t.to}`).join(', ')}`);
    }
    
    let nextStepId: string | null = null;
    for (const transition of transitions) {
      try {
        const conditionMet = !transition.condition || evaluateCondition(transition.condition, context);
        console.log(`   🔄 [FlowWiseService] Transition: ${currentStep} → ${transition.to}, condition: ${transition.condition || 'always'}, met: ${conditionMet}`);
        if (conditionMet) {
          nextStepId = transition.to;
          console.log(`   🔄 [FlowWiseService] ✅ Selected next step: ${nextStepId}`);
          break;
        }
      } catch (evalError: any) {
        console.error(`   ❌ [FlowWiseService] Error evaluating transition condition "${transition.condition}":`, evalError.message);
        console.error(`   ❌ [FlowWiseService] Error stack:`, evalError.stack);
        // Continue to next transition
      }
    }
    
    if (!nextStepId) {
      console.warn(`   ⚠️ [FlowWiseService] No valid transition found from step: ${currentStep} after user decision`);
      console.warn(`   ⚠️ [FlowWiseService] Available transitions:`, transitions.map(t => `${t.from} → ${t.to} (${t.condition || 'always'})`));
      throw new Error(`No valid transition found from step: ${currentStep}. User decision: ${context.userDecision}`);
    }
    
    // Move to the next step and execute it
    execution.currentStep = nextStepId;
    console.log(`   🔄 [FlowWiseService] Moving to next step: ${nextStepId}`);
    const instruction = await executeNextStep(executionId);
    
    return { instruction };
  } catch (error: any) {
    console.error(`   ❌ [FlowWiseService] Error in submitUserDecision:`, error.message);
    console.error(`   ❌ [FlowWiseService] Error stack:`, error.stack);
    console.error(`   ❌ [FlowWiseService] ExecutionId: ${executionId}`);
    console.error(`   ❌ [FlowWiseService] Decision: ${decision}`);
    console.error(`   ❌ [FlowWiseService] Execution exists: ${!!execution}`);
    if (execution) {
      console.error(`   ❌ [FlowWiseService] Execution keys: ${Object.keys(execution).join(', ')}`);
      console.error(`   ❌ [FlowWiseService] Current step: ${execution.currentStep}`);
      console.error(`   ❌ [FlowWiseService] Workflow exists: ${!!execution.workflow}`);
      if (execution.workflow) {
        console.error(`   ❌ [FlowWiseService] Workflow name: ${execution.workflow.name}`);
        console.error(`   ❌ [FlowWiseService] Workflow steps: ${execution.workflow.steps?.length || 0}`);
      }
    }
    throw error; // Re-throw to be caught by the endpoint handler
  }
}

/**
 * Get current workflow state (for debugging/monitoring)
 */
export function getWorkflowState(executionId: string): any {
  const workflowExecutions = (global as any).workflowExecutions as Map<string, any>;
  return workflowExecutions.get(executionId) || null;
}

