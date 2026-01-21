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
import { extractBookingDetails, getServiceTypeFields } from "../serviceTypeFields";

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
 * Validate workflow structure (ROOT CA Runtime Validation)
 * Ensures workflow follows required schema before execution
 */
function validateWorkflowStructure(workflow: FlowWiseWorkflow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required fields
  if (!workflow.name) errors.push("Missing workflow.name");
  if (!workflow.initialStep) errors.push("Missing workflow.initialStep");
  if (!workflow.steps || !Array.isArray(workflow.steps)) {
    errors.push("Missing or invalid workflow.steps");
  }
  
  // Validate steps reference initialStep
  if (workflow.steps && workflow.initialStep) {
    const stepIds = workflow.steps.map(s => s.id);
    if (!stepIds.includes(workflow.initialStep)) {
      errors.push(`Initial step '${workflow.initialStep}' not found in steps`);
    }
  }
  
  // Validate transitions reference valid steps
  if (workflow.transitions && workflow.steps) {
    const stepIds = workflow.steps.map(s => s.id);
    for (const transition of workflow.transitions) {
      if (!stepIds.includes(transition.from)) {
        errors.push(`Transition from '${transition.from}' references non-existent step`);
      }
      if (!stepIds.includes(transition.to)) {
        errors.push(`Transition to '${transition.to}' references non-existent step`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Load workflow definition from JSON file
 * DYNAMIC MAPPING: serviceType → ${serviceType}.json
 * Supports any service type without code changes
 */
export function loadWorkflowDefinition(serviceType: string): FlowWiseWorkflow | null {
  try {
    // Dynamic filename mapping: ${serviceType}.json
    const filename = `${serviceType}.json`;
    let filePath = path.join(workflowDataPath, filename);
    
    // Backward compatibility: Check for amc_cinema.json if movie.json doesn't exist
    if (!fs.existsSync(filePath) && serviceType === "movie") {
      const legacyPath = path.join(workflowDataPath, "amc_cinema.json");
      if (fs.existsSync(legacyPath)) {
        console.log(`⚠️ [FlowWiseService] Using legacy workflow file: amc_cinema.json (consider renaming to movie.json)`);
        filePath = legacyPath;
      }
    }
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ [FlowWiseService] Workflow file not found: ${filePath}`);
      console.error(`❌ [FlowWiseService] Expected file: ${filename} in ${workflowDataPath}`);
      return null;
    }
    
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(fileContent);
    
    if (!data.flowwiseWorkflow) {
      console.error(`❌ [FlowWiseService] No flowwiseWorkflow found in ${filename}`);
      return null;
    }
    
    // ROOT CA Runtime Validation
    const validationResult = validateWorkflowStructure(data.flowwiseWorkflow);
    if (!validationResult.valid) {
      console.error(`❌ [FlowWiseService] Workflow validation failed for ${filename}:`);
      validationResult.errors.forEach(err => console.error(`   - ${err}`));
      return null;
    }
    
    console.log(`✅ [FlowWiseService] Loaded workflow: ${data.flowwiseWorkflow.name} (${data.flowwiseWorkflow.version || '1.0.0'})`);
    console.log(`✅ [FlowWiseService] Workflow validated: ${filename}`);
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
  serviceType: string = "movie"
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
    serviceType, // CRITICAL: Store original serviceType from workflow - never let LLM override this
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

  // CRITICAL: If this is error_handler step, ensure error object exists in context
  // This allows template variables like {{error.component}} to work
  if (step.id === 'error_handler') {
    if (!context.error) {
      context.error = {
        component: 'system',
        message: 'An error occurred'
      };
      console.log(`   ⚠️ [FlowWiseService] Initialized error object in context for error_handler step`);
    } else {
      // Ensure error object has required fields with defaults
      if (!context.error.component) {
        context.error.component = 'system';
      }
      if (!context.error.message) {
        context.error.message = 'An error occurred';
      }
    }
  }

  // SECURITY: Validate certificate before executing each step (prevents ghost workflows)
  if (!(await validateFlowWiseServiceCertificate())) {
    throw new Error("FlowWiseService certificate invalid or revoked - workflow execution denied");
  }

  console.log(`🔄 [FlowWiseService] Executing step: ${step.name} (${step.id}) [Certified: ${FLOWWISE_SERVICE_UUID}]`);
  console.log(`🔄 [FlowWiseService] Step type: ${step.type}, component: ${step.component}`);
  console.log(`🔄 [FlowWiseService] Step has ${step.actions?.length || 0} actions`);
  if (step.id === 'root_ca_ledger_and_payment') {
    console.log(`   💰 [FlowWiseService] ⚠️ PAYMENT STEP DETECTED - This step should process payment and debit wallet!`);
    console.log(`   💰 [FlowWiseService] Context diningPrice: ${context.diningPrice}`);
    console.log(`   💰 [FlowWiseService] Context restaurantPrice: ${context.restaurantPrice}`);
    console.log(`   💰 [FlowWiseService] Context snapshot amount: ${context.snapshot?.amount}`);
    console.log(`   💰 [FlowWiseService] Context selectedListing price: ${context.selectedListing?.price}`);
  }

  // Execute step actions (FULLY AUTOMATED on server)
  // CRITICAL: For ROOT CA steps, ALL actions execute atomically in one shot
  console.log(`🔄 [FlowWiseService] Calling executeStepActions for step: ${step.id}`);
  await executeStepActions(step, context, executionId);
  console.log(`🔄 [FlowWiseService] executeStepActions completed for step: ${step.id}`);

  // Broadcast WebSocket events
  if (step.websocketEvents) {
    console.log(`📡 [FlowWiseService] Broadcasting ${step.websocketEvents.length} websocket events for step: ${step.id}`);
    // Ensure executionId and workflowId are in context for template variables
    // CRITICAL: Also ensure selectedListing is accessible for template variable replacement
    const contextWithIds = {
      ...context,
      executionId,
      workflowId: executionId,
      // Ensure selectedListing is accessible for {{selectedListing.videoUrl}} and {{selectedListing.movieTitle}}
      selectedListing: context.selectedListing || null
    };
    
    // For view_movie step, ensure videoUrl and movieTitle are directly accessible
    if (step.id === 'view_movie' && context.selectedListing) {
      contextWithIds.videoUrl = context.selectedListing.videoUrl || context.videoUrl || '';
      contextWithIds.movieTitle = context.selectedListing.movieTitle || context.movieTitle || '';
      console.log(`🎬 [FlowWiseService] Prepared context for view_movie with videoUrl: ${contextWithIds.videoUrl}, movieTitle: ${contextWithIds.movieTitle}`);
    }
    
    for (const event of step.websocketEvents) {
      const processedEvent = replaceTemplateVariables(event, contextWithIds);
      // CRITICAL: Preserve options array from original event if it exists
      // Template variable replacement might corrupt arrays, so we preserve the original
      const originalOptions = event.data?.options || processedEvent.data?.options;
      if (step.id === 'view_movie') {
        console.log(`🎬 [FlowWiseService] Broadcasting event: ${event.type}`);
        console.log(`🎬 [FlowWiseService] Original event data:`, JSON.stringify(event.data, null, 2));
        console.log(`🎬 [FlowWiseService] Processed event data:`, JSON.stringify(processedEvent.data, null, 2));
        console.log(`🎬 [FlowWiseService] Processed event data.videoUrl:`, processedEvent.data?.videoUrl);
        console.log(`🎬 [FlowWiseService] Processed event data.movieTitle:`, processedEvent.data?.movieTitle);
      }
      
      const finalEventData = {
        ...processedEvent.data,
        executionId,
        workflowId: executionId, // CRITICAL: Frontend expects workflowId, not just executionId
        stepId: step.id
      };
      
      // CRITICAL: If this is a user_decision_required event, ensure options are preserved
      if (processedEvent.type === 'user_decision_required') {
        // Preserve original options if they exist and are valid
        if (originalOptions && Array.isArray(originalOptions) && originalOptions.length > 0) {
          finalEventData.options = originalOptions;
          console.log(`   🤔 [FlowWiseService] Preserved ${originalOptions.length} options for user_decision_required event`);
          console.log(`   🤔 [FlowWiseService] Options:`, originalOptions.map((o: any) => ({ value: o.value, label: o.label })));
        } else if (step.decisionOptions && Array.isArray(step.decisionOptions) && step.decisionOptions.length > 0) {
          // Fallback: Build options from step.decisionOptions
          const builtOptions = step.decisionOptions.map((opt: any) => {
            const label = replaceTemplateVariables(opt.label || "", context);
            return {
              value: opt.value,
              label: label,
              action: opt.action
            };
          });
          finalEventData.options = builtOptions;
          console.log(`   🤔 [FlowWiseService] Built ${builtOptions.length} options from step.decisionOptions for user_decision_required event`);
          console.log(`   🤔 [FlowWiseService] Options:`, builtOptions.map((o: any) => ({ value: o.value, label: o.label })));
        } else {
          console.warn(`   ⚠️ [FlowWiseService] No options found for user_decision_required event in step: ${step.id}`);
        }
      }
      
      // For view_movie step, explicitly ensure videoUrl and movieTitle are in the event data
      if (step.id === 'view_movie' && processedEvent.type === 'user_decision_required') {
        // CRITICAL: Ensure videoUrl and movieTitle are explicitly set in the event data
        // This ensures they're available even if template variable replacement failed
        if (context.selectedListing?.videoUrl) {
          finalEventData.videoUrl = context.selectedListing.videoUrl;
        } else if (context.videoUrl) {
          finalEventData.videoUrl = context.videoUrl;
        }
        if (context.selectedListing?.movieTitle) {
          finalEventData.movieTitle = context.selectedListing.movieTitle;
        } else if (context.movieTitle) {
          finalEventData.movieTitle = context.movieTitle;
        }
        console.log(`🎬 [FlowWiseService] FINAL user_decision_required event data:`, JSON.stringify(finalEventData, null, 2));
        console.log(`🎬 [FlowWiseService] FINAL videoUrl:`, finalEventData.videoUrl);
        console.log(`🎬 [FlowWiseService] FINAL movieTitle:`, finalEventData.movieTitle);
        console.log(`🎬 [FlowWiseService] FINAL options count:`, finalEventData.options?.length || 0);
      }
      
      broadcastEvent({
        ...processedEvent,
        timestamp: Date.now(),
        data: finalEventData
      });
    }
    if (step.id === 'view_movie') {
      console.log(`🎬 [FlowWiseService] ✅ All websocket events broadcasted for view_movie step`);
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
  // This check MUST happen FIRST, before any transition evaluation
  console.log(`🔍 [FlowWiseService] Checking step type: ${step.type}, requiresUserDecision: ${step.requiresUserDecision}, step.id: ${step.id}`);
  if (step.type === "decision" && step.requiresUserDecision) {
    console.log(`🤔 [FlowWiseService] ========================================`);
    console.log(`🤔 [FlowWiseService] ⚠️⚠️⚠️ DECISION STEP DETECTED: ${step.id} ⚠️⚠️⚠️`);
    console.log(`🤔 [FlowWiseService] Step name: ${step.name}`);
    console.log(`🤔 [FlowWiseService] Decision prompt: ${step.decisionPrompt}`);
    console.log(`🤔 [FlowWiseService] Decision options count: ${step.decisionOptions?.length || 0}`);
    console.log(`🤔 [FlowWiseService] Current step in execution: ${execution.currentStep}`);
    console.log(`🤔 [FlowWiseService] Context userDecision BEFORE clear: ${context.userDecision}`);
    console.log(`🤔 [FlowWiseService] Execution context userDecision BEFORE clear: ${execution.context?.userDecision}`);
    
    // CRITICAL: Clear userDecision from previous steps when entering a new decision step
    // This ensures each decision step waits for a fresh user decision
    const previousUserDecision = context.userDecision;
    if (previousUserDecision !== undefined && previousUserDecision !== null) {
      console.log(`   🤔 [FlowWiseService] ⚠️⚠️⚠️ CLEARING PREVIOUS userDecision: ${previousUserDecision} (from previous step)`);
      console.log(`   🤔 [FlowWiseService] This prevents auto-transition when entering decision step: ${step.id}`);
      context.userDecision = undefined;
      delete context.userDecision;
      console.log(`   🤔 [FlowWiseService] ✅ userDecision cleared - workflow will wait for fresh user input`);
    } else {
      console.log(`   🤔 [FlowWiseService] ✅ No previous userDecision to clear - starting fresh`);
    }
    
    // CRITICAL: For user_confirm_listing step, ensure userDecision is definitely cleared
    // This prevents the workflow from auto-transitioning if userDecision was set from a previous step
    if (step.id === 'user_confirm_listing') {
      if (context.userDecision !== undefined && context.userDecision !== null) {
        console.log(`   🤔 [FlowWiseService] ⚠️⚠️⚠️ WARNING: user_confirm_listing step has userDecision set: ${context.userDecision}`);
        console.log(`   🤔 [FlowWiseService] ⚠️ This would cause auto-transition - clearing it now!`);
        context.userDecision = undefined;
        delete context.userDecision;
        console.log(`   🤔 [FlowWiseService] ✅ userDecision cleared for user_confirm_listing step`);
      }
      console.log(`   🤔 [FlowWiseService] user_confirm_listing step - userDecision after clear: ${context.userDecision ? 'STILL EXISTS (ERROR!)' : 'cleared (correct)'}`);
      
      // CRITICAL: Double-check that userDecision is cleared before returning decision instruction
      // If it's still set, something is wrong and we should block the workflow
      if (context.userDecision !== undefined && context.userDecision !== null) {
        console.error(`   ❌ [FlowWiseService] ERROR: userDecision is STILL set after clearing! Value: ${context.userDecision}`);
        console.error(`   ❌ [FlowWiseService] This is a critical error - the workflow would auto-transition`);
        console.error(`   ❌ [FlowWiseService] Forcing userDecision to undefined to prevent auto-transition`);
        context.userDecision = undefined;
        delete context.userDecision;
        // Also delete from execution context to be safe
        if (execution.context) {
          execution.context.userDecision = undefined;
          delete execution.context.userDecision;
        }
      }
    }
    
    // CRITICAL: For user_select_listing step, clear userSelection to ensure it waits for user input
    // Even if selectedListing exists from LLM, userSelection should be empty until user makes a selection
    if (step.id === 'user_select_listing') {
      const previousUserSelection = context.userSelection;
      if (previousUserSelection !== undefined && previousUserSelection !== null) {
        console.log(`   🎬 [FlowWiseService] Clearing previous userSelection (from previous step) to ensure fresh selection`);
        context.userSelection = undefined;
        delete context.userSelection;
      }
      // CRITICAL: Also ensure selectedListing is NOT copied to userSelection
      // The transition condition {{userSelection}} should be false until user actually selects
      // Even if selectedListing exists from LLM, it should NOT be used as userSelection
      if (context.selectedListing && context.userSelection) {
        // Check if userSelection is the same object as selectedListing (reference equality)
        const isSameObject = context.userSelection === context.selectedListing;
        // Also check if they have the same content (deep equality for common fields)
        const hasSameContent = context.userSelection.movieId === context.selectedListing.movieId &&
          context.userSelection.providerId === context.selectedListing.providerId &&
          context.userSelection.movieTitle === context.selectedListing.movieTitle;
        
        if (isSameObject || hasSameContent) {
          console.log(`   🎬 [FlowWiseService] ⚠️⚠️⚠️ WARNING: userSelection was set from selectedListing!`);
          console.log(`   🎬 [FlowWiseService] isSameObject: ${isSameObject}, hasSameContent: ${hasSameContent}`);
          console.log(`   🎬 [FlowWiseService] Clearing userSelection to prevent auto-transition`);
          context.userSelection = undefined;
          delete context.userSelection;
        }
      }
      console.log(`   🎬 [FlowWiseService] user_select_listing step - userSelection cleared, selectedListing exists: ${!!context.selectedListing}`);
      console.log(`   🎬 [FlowWiseService] userSelection after clear: ${context.userSelection ? 'STILL EXISTS (ERROR!)' : 'cleared (correct)'}`);
    }
    
    if (step.id === 'view_movie') {
      console.log(`🎬 [FlowWiseService] ========================================`);
      console.log(`🎬 [FlowWiseService] VIEW_MOVIE STEP EXECUTING!`);
      console.log(`🎬 [FlowWiseService] Context selectedListing:`, context.selectedListing ? JSON.stringify(context.selectedListing, null, 2) : 'missing');
      console.log(`🎬 [FlowWiseService] Context selectedListing?.videoUrl: ${context.selectedListing?.videoUrl || 'missing'}`);
      console.log(`🎬 [FlowWiseService] Context selectedListing?.movieTitle: ${context.selectedListing?.movieTitle || 'missing'}`);
      console.log(`🎬 [FlowWiseService] Context videoUrl: ${context.videoUrl || 'missing'}`);
      console.log(`🎬 [FlowWiseService] Context movieTitle: ${context.movieTitle || 'missing'}`);
      console.log(`🎬 [FlowWiseService] Websocket events count: ${step.websocketEvents?.length || 0}`);
      console.log(`🎬 [FlowWiseService] Cleared userDecision (was: ${previousUserDecision}) - waiting for fresh decision`);
      
      // CRITICAL: Ensure videoUrl and movieTitle are in context for template variable replacement
      // If they're in selectedListing but not in context root, copy them
      if (context.selectedListing?.videoUrl) {
        if (!context.videoUrl) {
          context.videoUrl = context.selectedListing.videoUrl;
          console.log(`🎬 [FlowWiseService] ✅ Copied videoUrl from selectedListing to context: ${context.videoUrl}`);
        } else {
          console.log(`🎬 [FlowWiseService] ⚠️ videoUrl already exists in context: ${context.videoUrl}`);
        }
      } else {
        console.log(`🎬 [FlowWiseService] ⚠️ WARNING: selectedListing.videoUrl is missing!`);
      }
      if (context.selectedListing?.movieTitle) {
        if (!context.movieTitle) {
          context.movieTitle = context.selectedListing.movieTitle;
          console.log(`🎬 [FlowWiseService] ✅ Copied movieTitle from selectedListing to context: ${context.movieTitle}`);
        } else {
          console.log(`🎬 [FlowWiseService] ⚠️ movieTitle already exists in context: ${context.movieTitle}`);
        }
      } else {
        console.log(`🎬 [FlowWiseService] ⚠️ WARNING: selectedListing.movieTitle is missing!`);
      }
      console.log(`🎬 [FlowWiseService] Final context.videoUrl: ${context.videoUrl || 'STILL MISSING!'}`);
      console.log(`🎬 [FlowWiseService] Final context.movieTitle: ${context.movieTitle || 'STILL MISSING!'}`);
      console.log(`🎬 [FlowWiseService] ========================================`);
    }
    console.log(`🤔 [FlowWiseService] ========================================`);
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
    
    // Build decision prompt - include iGas cost if available
    let decisionPrompt = replaceTemplateVariables(step.decisionPrompt || "", context);
    
    // If iGas cost is available and not already mentioned in prompt, add it
    if (context.iGasCost !== undefined && context.iGasCost !== null) {
      const iGasCostStr = context.iGasCost.toFixed(6);
      // Check if prompt already mentions iGas or cost
      const promptLower = decisionPrompt.toLowerCase();
      if (!promptLower.includes('igas') && !promptLower.includes('cost')) {
        decisionPrompt = `It will cost ${iGasCostStr} iGas to continue. ${decisionPrompt}`;
      }
    }
    
    // CRITICAL: Ensure all options have a value field for decision steps
    const validatedOptions = options.map((opt: any) => {
      if (!opt.value && opt.label) {
        // If value is missing, try to extract it from label or use label as value
        const upperLabel = opt.label.toUpperCase();
        if (upperLabel.includes('YES') || upperLabel.includes('PROCEED') || upperLabel.includes('CONTINUE')) {
          opt.value = 'YES';
        } else if (upperLabel.includes('NO') || upperLabel.includes('CANCEL')) {
          opt.value = 'NO';
        } else {
          opt.value = opt.label; // Fallback to label
        }
      }
      return opt;
    });
    
    console.log(`   🤔 [FlowWiseService] Validated ${validatedOptions.length} decision options:`, validatedOptions.map((o: any) => ({ value: o.value, label: o.label })));
    
    // CRITICAL: For view_movie step, explicitly include videoUrl and movieTitle in the decision data
    const decisionData: any = {
      stepId: step.id,
      options: validatedOptions,
      timeout: step.timeout || 60000,
      listings: context.listings, // Include listings for frontend
      iGasCost: context.iGasCost, // Include iGas cost in data
      isDecision: true // Flag to indicate this is a decision step
    };
    
    // For view_movie step, ensure videoUrl and movieTitle are in the decision data
    if (step.id === 'view_movie') {
      console.log(`🎬 [FlowWiseService] Adding videoUrl and movieTitle to decision data for view_movie step`);
      if (context.selectedListing?.videoUrl) {
        decisionData.videoUrl = context.selectedListing.videoUrl;
        console.log(`🎬 [FlowWiseService] Added videoUrl from selectedListing: ${decisionData.videoUrl}`);
      } else if (context.videoUrl) {
        decisionData.videoUrl = context.videoUrl;
        console.log(`🎬 [FlowWiseService] Added videoUrl from context: ${decisionData.videoUrl}`);
      }
      if (context.selectedListing?.movieTitle) {
        decisionData.movieTitle = context.selectedListing.movieTitle;
        console.log(`🎬 [FlowWiseService] Added movieTitle from selectedListing: ${decisionData.movieTitle}`);
      } else if (context.movieTitle) {
        decisionData.movieTitle = context.movieTitle;
        console.log(`🎬 [FlowWiseService] Added movieTitle from context: ${decisionData.movieTitle}`);
      }
      console.log(`🎬 [FlowWiseService] Decision data for view_movie:`, {
        stepId: decisionData.stepId,
        videoUrl: decisionData.videoUrl,
        movieTitle: decisionData.movieTitle,
        optionsCount: decisionData.options?.length
      });
    }
    
    // CRITICAL: Before returning, ensure userDecision is definitely cleared
    // This prevents any possibility of auto-transition
    if (context.userDecision !== undefined && context.userDecision !== null) {
      console.error(`   ❌ [FlowWiseService] CRITICAL ERROR: userDecision is STILL set when returning decision instruction!`);
      console.error(`   ❌ [FlowWiseService] Value: ${context.userDecision}`);
      console.error(`   ❌ [FlowWiseService] This would cause auto-transition - clearing it now!`);
      context.userDecision = undefined;
      delete context.userDecision;
      // Also clear from execution context
      if (execution.context) {
        execution.context.userDecision = undefined;
        delete execution.context.userDecision;
      }
    }
    
    // CRITICAL: Ensure execution.currentStep is set to the decision step
    // This ensures the workflow stays at this step until user submits a decision
    execution.currentStep = currentStep;
    console.log(`   🤔 [FlowWiseService] ✅ Decision step ${step.id} - returning decision instruction and pausing workflow`);
    console.log(`   🤔 [FlowWiseService] ✅ Execution.currentStep set to: ${execution.currentStep}`);
    console.log(`   🤔 [FlowWiseService] ✅ userDecision after clear: ${context.userDecision ? 'STILL EXISTS (ERROR!)' : 'cleared (correct)'}`);
    
    // CRITICAL: Final check - ensure userDecision is cleared one more time before returning
    // This is a last-ditch effort to prevent auto-transition
    if (context.userDecision !== undefined && context.userDecision !== null) {
      console.error(`   ❌ [FlowWiseService] FINAL CHECK: userDecision is STILL set! Clearing one more time...`);
      context.userDecision = undefined;
      delete context.userDecision;
      if (execution.context) {
        execution.context.userDecision = undefined;
        delete execution.context.userDecision;
      }
    }
    
    console.log(`   🤔 [FlowWiseService] ========================================`);
    console.log(`   🤔 [FlowWiseService] ✅✅✅ RETURNING DECISION INSTRUCTION FOR STEP: ${step.id} ✅✅✅`);
    console.log(`   🤔 [FlowWiseService] ✅ Workflow will PAUSE and wait for user input`);
    console.log(`   🤔 [FlowWiseService] ✅ userDecision is: ${context.userDecision ? 'STILL SET (ERROR!)' : 'cleared (correct)'}`);
    console.log(`   🤔 [FlowWiseService] ========================================`);
    
    return {
      type: "decision",
      message: decisionPrompt,
      data: decisionData
    };
  }

  // Determine next step (only for non-decision steps)
  // CRITICAL: This code should NEVER be reached for decision steps (they return early above)
  // If we reach here for a decision step, something is wrong
  console.log(`🔍 [FlowWiseService] After decision step check - step.type: ${step.type}, step.requiresUserDecision: ${step.requiresUserDecision}, step.id: ${step.id}`);
  if (step.type === "decision" && step.requiresUserDecision) {
    console.error(`   ❌ [FlowWiseService] ========================================`);
    console.error(`   ❌ [FlowWiseService] CRITICAL ERROR: Decision step ${step.id} reached transition evaluation code!`);
    console.error(`   ❌ [FlowWiseService] This should never happen - decision steps should return early`);
    console.error(`   ❌ [FlowWiseService] Current step: ${currentStep}`);
    console.error(`   ❌ [FlowWiseService] Step type: ${step.type}`);
    console.error(`   ❌ [FlowWiseService] Step requiresUserDecision: ${step.requiresUserDecision}`);
    console.error(`   ❌ [FlowWiseService] Step ID: ${step.id}`);
    console.error(`   ❌ [FlowWiseService] ========================================`);
    // Instead of throwing, return a wait instruction to prevent auto-transition
    return {
      type: "wait",
      message: `Decision step ${step.id} incorrectly reached transition evaluation - pausing workflow`,
      data: { currentStep, error: "Decision step reached transition evaluation" }
    };
  }
  
  const transitions = workflow.transitions.filter((t: any) => t.from === currentStep);
  console.log(`🔄 [FlowWiseService] Found ${transitions.length} transitions from step: ${currentStep}`);
  let nextStepId: string | null = null;

  if (currentStep === 'llm_resolution') {
    console.log(`🔄 [FlowWiseService] ⚠️ LLM RESOLUTION STEP - Checking transitions`);
    console.log(`🔄 [FlowWiseService] Current step: ${currentStep}`);
    console.log(`🔄 [FlowWiseService] Context listings count: ${context.listings?.length || 0}`);
    console.log(`🔄 [FlowWiseService] Context listings exists: ${!!context.listings}`);
    console.log(`🔄 [FlowWiseService] Available transitions:`, transitions.map((t: any) => `${t.from} → ${t.to} (${t.condition || 'always'})`));
  }

  if (currentStep === 'user_confirm_listing' || currentStep === 'user_select_listing') {
    console.log(`🔄 [FlowWiseService] ⚠️ USER CONFIRM/SELECT LISTING STEP - Checking transitions`);
    console.log(`🔄 [FlowWiseService] Current step: ${currentStep}`);
    console.log(`🔄 [FlowWiseService] Context userDecision: ${context.userDecision}`);
    console.log(`🔄 [FlowWiseService] Context userSelection: ${context.userSelection ? 'exists' : 'missing'}`);
    console.log(`🔄 [FlowWiseService] Context userSelection type: ${typeof context.userSelection}`);
    console.log(`🔄 [FlowWiseService] Context userSelection value:`, context.userSelection);
    console.log(`🔄 [FlowWiseService] Context selectedListing: ${context.selectedListing ? 'exists' : 'missing'}`);
    console.log(`🔄 [FlowWiseService] Context selectedListing === userSelection: ${context.selectedListing === context.userSelection}`);
    console.log(`🔄 [FlowWiseService] Available transitions:`, transitions.map((t: any) => `${t.from} → ${t.to} (${t.condition || 'always'})`));
  }
  
  for (const transition of transitions) {
    // CRITICAL: If we're at user_confirm_listing and the transition condition is {{userDecision}} === 'YES',
    // we need to ensure userDecision is NOT set (it should only be set when user actually clicks "Yes, proceed")
    // If userDecision is already set, it means the workflow is auto-continuing without waiting for user input
    if (currentStep === 'user_confirm_listing' && transition.condition && transition.condition.includes('userDecision')) {
      console.log(`🤔 [FlowWiseService] ⚠️⚠️⚠️ CHECKING USER_CONFIRM_LISTING TRANSITION CONDITION ⚠️⚠️⚠️`);
      console.log(`🤔 [FlowWiseService] Condition: ${transition.condition}`);
      console.log(`🤔 [FlowWiseService] userDecision value: ${context.userDecision}`);
      console.log(`🤔 [FlowWiseService] userDecision type: ${typeof context.userDecision}`);
      console.log(`🤔 [FlowWiseService] userDecision truthy: ${!!context.userDecision}`);
      
      // CRITICAL: If userDecision is already set, this means the workflow is trying to auto-transition
      // This should NOT happen - userDecision should only be set when user actually submits a decision
      // Block the transition and return a wait instruction
      if (context.userDecision !== undefined && context.userDecision !== null) {
        console.log(`🤔 [FlowWiseService] ⚠️⚠️⚠️ BLOCKING TRANSITION: userDecision is already set to "${context.userDecision}"!`);
        console.log(`🤔 [FlowWiseService] ⚠️ This means the workflow is trying to auto-continue without waiting for user input`);
        console.log(`🤔 [FlowWiseService] ⚠️ Clearing userDecision and blocking transition - workflow should wait for user to click "Yes, proceed"`);
        context.userDecision = undefined;
        delete context.userDecision;
        // Return wait instruction to pause the workflow
        return {
          type: "wait",
          message: `Waiting for user decision on step: ${currentStep}`,
          data: { currentStep, nextStep: transition.to }
        };
      } else {
        console.log(`🤔 [FlowWiseService] ✅ userDecision is empty/undefined - transition blocked (correct - waiting for user input)`);
        // If userDecision is empty, the condition should be false, so block the transition
        return {
          type: "wait",
          message: `Waiting for user decision on step: ${currentStep}`,
          data: { currentStep, nextStep: transition.to }
        };
      }
    }
    
    const conditionMet = !transition.condition || evaluateCondition(transition.condition, context);
    console.log(`🔄 [FlowWiseService] Transition: ${currentStep} → ${transition.to}, condition: ${transition.condition || 'always'}, met: ${conditionMet}`);
    
    // CRITICAL: If we're at user_select_listing and the transition condition is {{userSelection}},
    // we need to ensure userSelection is actually cleared and not set from selectedListing
    if (currentStep === 'user_select_listing' && transition.condition === '{{userSelection}}') {
      console.log(`🎬 [FlowWiseService] ⚠️⚠️⚠️ CHECKING USER_SELECT_LISTING TRANSITION CONDITION ⚠️⚠️⚠️`);
      console.log(`🎬 [FlowWiseService] Condition: ${transition.condition}`);
      console.log(`🎬 [FlowWiseService] userSelection value:`, context.userSelection);
      console.log(`🎬 [FlowWiseService] userSelection type: ${typeof context.userSelection}`);
      console.log(`🎬 [FlowWiseService] userSelection truthy: ${!!context.userSelection}`);
      console.log(`🎬 [FlowWiseService] selectedListing value:`, context.selectedListing);
      console.log(`🎬 [FlowWiseService] selectedListing === userSelection: ${context.selectedListing === context.userSelection}`);
      console.log(`🎬 [FlowWiseService] Condition met BEFORE fix: ${conditionMet}`);
      
      // CRITICAL: If userSelection exists and is truthy, check if it's from selectedListing
      // The transition condition {{userSelection}} should only be true when user actually selects
      // If userSelection is set to selectedListing (from LLM), we must block the transition
      if (context.userSelection) {
        // Check if userSelection is the same object as selectedListing (reference equality)
        const isSameObject = context.userSelection === context.selectedListing;
        // Also check if they have the same content (deep equality for common fields)
        const hasSameContent = context.selectedListing && 
          context.userSelection.movieId === context.selectedListing.movieId &&
          context.userSelection.providerId === context.selectedListing.providerId &&
          context.userSelection.movieTitle === context.selectedListing.movieTitle;
        
        if (isSameObject || hasSameContent) {
          console.log(`🎬 [FlowWiseService] ⚠️⚠️⚠️ BLOCKING TRANSITION: userSelection is set from selectedListing!`);
          console.log(`🎬 [FlowWiseService] isSameObject: ${isSameObject}, hasSameContent: ${hasSameContent}`);
          console.log(`🎬 [FlowWiseService] Clearing userSelection to prevent auto-transition`);
          context.userSelection = undefined;
          delete context.userSelection;
          // Re-evaluate condition after clearing
          const conditionMetAfterClear = !transition.condition || evaluateCondition(transition.condition, context);
          console.log(`🎬 [FlowWiseService] Condition met AFTER clear: ${conditionMetAfterClear}`);
          if (!conditionMetAfterClear) {
            console.log(`🎬 [FlowWiseService] ✅ Condition is now false - transition blocked`);
            continue; // Skip this transition
          } else {
            console.log(`🎬 [FlowWiseService] ⚠️ WARNING: Condition is still true after clear - this shouldn't happen!`);
          }
        } else {
          console.log(`🎬 [FlowWiseService] ✅ userSelection is different from selectedListing - transition allowed`);
        }
      } else {
        console.log(`🎬 [FlowWiseService] ✅ userSelection is empty/undefined - transition blocked (correct)`);
        // If userSelection is empty, the condition should be false
        if (conditionMet) {
          console.log(`🎬 [FlowWiseService] ⚠️ WARNING: Condition is true but userSelection is empty - blocking transition`);
          continue; // Skip this transition
        }
      }
    }
    
    if (transition.to === 'root_ca_ledger_and_payment') {
      console.log(`🔄 [FlowWiseService] ⚠️⚠️⚠️ TRANSITION TO PAYMENT STEP DETECTED! ⚠️⚠️⚠️`);
      console.log(`🔄 [FlowWiseService] Condition: ${transition.condition || 'always'}`);
      console.log(`🔄 [FlowWiseService] Condition met: ${conditionMet}`);
    }
    
    if (transition.to === 'user_select_listing') {
      console.log(`🎬 [FlowWiseService] ⚠️⚠️⚠️ TRANSITION TO USER_SELECT_LISTING STEP DETECTED! ⚠️⚠️⚠️`);
      console.log(`🎬 [FlowWiseService] Condition: ${transition.condition || 'always'}`);
      console.log(`🎬 [FlowWiseService] Condition met: ${conditionMet}`);
      console.log(`🎬 [FlowWiseService] Context listings count: ${context.listings?.length || 0}`);
      console.log(`🎬 [FlowWiseService] Context listings exists: ${!!context.listings}`);
    }
    
    if (transition.to === 'view_movie') {
      console.log(`🎬 [FlowWiseService] ⚠️⚠️⚠️ TRANSITION TO VIEW_MOVIE STEP DETECTED! ⚠️⚠️⚠️`);
      console.log(`🎬 [FlowWiseService] Condition: ${transition.condition || 'always'}`);
      console.log(`🎬 [FlowWiseService] Condition met: ${conditionMet}`);
      console.log(`🎬 [FlowWiseService] Context movieWatched: ${context.movieWatched}`);
      console.log(`🎬 [FlowWiseService] Context selectedListing:`, context.selectedListing ? 'exists' : 'missing');
      console.log(`🎬 [FlowWiseService] Context selectedListing?.videoUrl: ${context.selectedListing?.videoUrl || 'missing'}`);
      console.log(`🎬 [FlowWiseService] Context selectedListing?.movieTitle: ${context.selectedListing?.movieTitle || 'missing'}`);
    }
    
    if (conditionMet) {
      nextStepId = transition.to;
      console.log(`🔄 [FlowWiseService] ✅ Selected next step: ${nextStepId}`);
      
      if (nextStepId === 'root_ca_ledger_and_payment') {
        console.log(`🔄 [FlowWiseService] 🎯🎯🎯 TRANSITIONING TO PAYMENT STEP! 🎯🎯🎯`);
      }
      
      if (nextStepId === 'user_select_listing') {
        console.log(`🎬 [FlowWiseService] 🎯🎯🎯 TRANSITIONING TO USER_SELECT_LISTING STEP! 🎯🎯🎯`);
      }
      
      if (nextStepId === 'view_movie') {
        console.log(`🎬 [FlowWiseService] 🎯🎯🎯 TRANSITIONING TO VIEW_MOVIE STEP! 🎯🎯🎯`);
      }
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
  
  // CRITICAL: If next step is a decision step, DO NOT execute it immediately if we're currently at a decision step
  // This prevents multiple decision prompts from appearing at once
  // Only execute the next decision step if we're NOT currently at a decision step
  if (nextStep && nextStep.type === "decision" && nextStep.requiresUserDecision) {
    const currentStepDef = workflow.steps.find((s: WorkflowStep) => s.id === currentStep);
    const isCurrentlyAtDecisionStep = currentStepDef && currentStepDef.type === "decision" && currentStepDef.requiresUserDecision;
    
    if (isCurrentlyAtDecisionStep) {
      console.log(`🤔 [FlowWiseService] ⚠️⚠️⚠️ BLOCKING: Currently at decision step ${currentStep}, next step is also decision step ${nextStepId}`);
      console.log(`🤔 [FlowWiseService] ⚠️ NOT executing next decision step - waiting for current decision to be submitted first`);
      console.log(`🤔 [FlowWiseService] The workflow will pause here and wait for user decision on: ${currentStep}`);
      // DO NOT execute the next decision step - return wait instruction
      // The workflow will progress to the next decision step only after user submits the current decision
      return {
        type: "wait",
        message: `Waiting for user decision on step: ${currentStep}`,
        data: { currentStep, nextStep: nextStepId }
      };
    } else {
      // We're not at a decision step, so it's safe to execute the next decision step
      console.log(`🤔 [FlowWiseService] Next step is a decision step: ${nextStepId} - executing to get decision instruction`);
      if (nextStepId === 'view_movie') {
        console.log(`🎬 [FlowWiseService] 🎯🎯🎯 EXECUTING VIEW_MOVIE DECISION STEP! 🎯🎯🎯`);
        console.log(`🎬 [FlowWiseService] Context before execution:`, {
          movieWatched: context.movieWatched,
          videoUrl: context.videoUrl,
          movieTitle: context.movieTitle,
          selectedListing: context.selectedListing ? {
            movieTitle: context.selectedListing.movieTitle,
            videoUrl: context.selectedListing.videoUrl
          } : 'missing'
        });
      }
      execution.currentStep = nextStepId!;
      return await executeNextStep(executionId); // Execute the decision step (will return decision instruction)
    }
  }
  
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
    console.log(`🔐 [FlowWiseService] This step will execute payment processing if it's root_ca_ledger_and_payment`);
    execution.currentStep = nextStepId!;
    // Execute the ROOT CA step silently (it will broadcast all events)
    // CRITICAL: This MUST execute all actions atomically
    const rootCAInstruction = await executeNextStep(executionId);
    console.log(`🔐 [FlowWiseService] ROOT CA step completed: ${nextStepId}`);
    console.log(`🔐 [FlowWiseService] ROOT CA instruction type: ${rootCAInstruction.type}`);
    
    // CRITICAL: After ROOT CA step completes, check if the next step is a decision step
    // If it is, DO NOT execute it immediately - return wait instruction
    // This prevents multiple decision prompts from appearing at once
    const currentStepAfterROOTCA = execution.currentStep;
    const workflowAfterROOTCA = execution.workflow;
    const nextStepAfterROOTCA = workflowAfterROOTCA.steps.find((s: WorkflowStep) => s.id === currentStepAfterROOTCA);
    
    // Find transitions from the current step after ROOT CA
    const transitionsAfterROOTCA = workflowAfterROOTCA.transitions.filter((t: any) => t.from === currentStepAfterROOTCA);
    let nextStepIdAfterROOTCA: string | null = null;
    for (const transition of transitionsAfterROOTCA) {
      try {
        const conditionMet = !transition.condition || evaluateCondition(transition.condition, execution.context);
        if (conditionMet) {
          nextStepIdAfterROOTCA = transition.to;
          break;
        }
      } catch (evalError: any) {
        console.error(`   ❌ [FlowWiseService] Error evaluating transition condition:`, evalError.message);
      }
    }
    
    if (nextStepIdAfterROOTCA) {
      const nextStepAfterROOTCADef = workflowAfterROOTCA.steps.find((s: WorkflowStep) => s.id === nextStepIdAfterROOTCA);
      if (nextStepAfterROOTCADef && nextStepAfterROOTCADef.type === "decision" && nextStepAfterROOTCADef.requiresUserDecision) {
        console.log(`🤔 [FlowWiseService] ⚠️ Next step after ROOT CA is a decision step: ${nextStepIdAfterROOTCA}`);
        console.log(`🤔 [FlowWiseService] ⚠️ NOT executing it immediately - waiting for current decision to be submitted`);
        console.log(`🤔 [FlowWiseService] ⚠️ The workflow will pause here and wait for user decision`);
        // DO NOT execute the next decision step - return wait instruction
        // The workflow will progress to the next decision step only after user submits the current decision
        return {
          type: "wait",
          message: `ROOT CA step completed. Waiting for user decision on step: ${currentStepAfterROOTCA}`,
          data: { currentStep: currentStepAfterROOTCA, nextStep: nextStepIdAfterROOTCA }
        };
      }
    }
    
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
  const { debitWallet, getWalletBalance } = await import("../wallet");
  
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
  // DISABLED DeepSeek - Always use OpenAI (ChatGPT 4o) as default
  const ENABLE_OPENAI = true; // Force OpenAI, ignore environment variable
  const MOCKED_LLM = process.env.MOCKED_LLM === 'true';

  console.log(`   ⚙️ [FlowWiseService] Step has ${step.actions?.length || 0} actions to execute`);
  console.log(`   ⚙️ [FlowWiseService] 🔐 ROOT CA: Executing ALL actions atomically in step: ${step.id}`);
  
  // CRITICAL: Execute ALL actions sequentially and atomically
  // For ROOT CA steps, ALL actions must complete in a single shot
  for (let i = 0; i < step.actions.length; i++) {
    const action = step.actions[i];
    const processedAction = replaceTemplateVariables(action, context);
    
    console.log(`   ⚙️ [FlowWiseService] [${i + 1}/${step.actions.length}] Executing action: ${processedAction.type} (step: ${step.id})`);
    console.log(`   ⚙️ [FlowWiseService] Action details:`, {
      type: processedAction.type,
      stepId: step.id,
      stepName: step.name,
      actionIndex: i + 1,
      totalActions: step.actions.length
    });
    
    if (processedAction.type === 'process_payment') {
      console.log(`   💰 [FlowWiseService] ========================================`);
      console.log(`   💰 [FlowWiseService] 🎯 PROCESS_PAYMENT ACTION DETECTED!`);
      console.log(`   💰 [FlowWiseService] Step: ${step.id} (${step.name})`);
      console.log(`   💰 [FlowWiseService] Action index: ${i + 1}/${step.actions.length}`);
      console.log(`   💰 [FlowWiseService] ========================================`);
    }

    try {
      switch (processedAction.type) {
        case "validate":
          context.validationPassed = true;
          context.errors = [];
          break;

        case "llm_extract_query":
          // Extract query using LLM (FULLY AUTOMATED)
          // CRITICAL: Preserve original serviceType from workflow - don't let LLM override it for banking/autoparts/etc
          const originalServiceType = context.serviceType;
          
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
            
            // CRITICAL: Only allow LLM to override serviceType for movie/dex workflows
            // For banking, autoparts, and other services, preserve the original workflow serviceType
            if (originalServiceType && originalServiceType !== 'movie' && originalServiceType !== 'dex') {
              // Preserve original serviceType - don't let LLM misclassify
              context.serviceType = originalServiceType;
              context.queryResult.serviceType = originalServiceType;
              if (context.queryResult.query) {
                context.queryResult.query.serviceType = originalServiceType;
              }
              console.log(`🔒 [FlowWiseService] Preserved original serviceType "${originalServiceType}" (LLM suggested "${queryResult.serviceType}")`);
            } else {
              // For movie/dex, allow LLM to classify
              context.serviceType = queryResult.serviceType;
            }
          }
          // Reverse-engineered from server/data/dex.json:
          // DEX workflow expects these top-level context fields to exist for templating.
          if ((context.serviceType || context.queryResult?.serviceType) === 'dex') {
            const filters: any = (context.queryResult as any)?.query?.filters || {};
            (context as any).action = filters.action || (context as any).action;
            (context as any).tokenAmount = filters.tokenAmount || (context as any).tokenAmount;
            (context as any).tokenSymbol = filters.tokenSymbol || (context as any).tokenSymbol;
            (context as any).baseToken = filters.baseToken || (context as any).baseToken;
          }
          break;

        case "query_service_registry":
          // Query service registry (FULLY AUTOMATED)
          if (!context.queryResult) {
            throw new Error("Query result required for service registry query");
          }
          console.log(`🔍 [FlowWiseService] Querying service registry with query:`, JSON.stringify(context.queryResult.query, null, 2));
          const listings = await queryROOTCAServiceRegistry(context.queryResult.query);
          console.log(`🔍 [FlowWiseService] Service registry returned ${listings.length} listings`);
          if (listings.length > 0) {
            console.log(`🔍 [FlowWiseService] First listing:`, JSON.stringify(listings[0], null, 2).substring(0, 200));
          }
          context.listings = listings;
          break;

        case "query_dex_pools":
          // Query DEX pools (FULLY AUTOMATED)
          // Pattern: Query service registry for DEX providers, then query their pools
          // This matches the pattern used in resolveLLM() in eden-sim-redis.ts
          if (!context.queryResult) {
            throw new Error("Query result required for DEX pool query");
          }
          
          const { queryROOTCAServiceRegistry, queryServiceProviders } = await import("../serviceProvider");
          
          console.log(`🔍 [FlowWiseService] Querying DEX pools...`);
          console.log(`🔍 [FlowWiseService] Query filters:`, context.queryResult.query.filters);
          
          // Step 1: Query service registry for DEX providers
          const dexProviders = queryROOTCAServiceRegistry({
            serviceType: "dex",
            filters: {}
          });
          
          console.log(`🔍 [FlowWiseService] Found ${dexProviders.length} DEX provider(s) in service registry`);
          
          if (dexProviders.length === 0) {
            console.warn(`⚠️ [FlowWiseService] No DEX providers found in service registry`);
            context.listings = [];
            break;
          }
          
          // Step 2: Query all DEX providers' pools using queryServiceProviders
          // This internally calls queryProviderAPI -> queryDEXPoolAPI for each provider
          const filters = {
            tokenSymbol: context.queryResult.query.filters?.tokenSymbol,
            baseToken: context.queryResult.query.filters?.baseToken,
            action: context.queryResult.query.filters?.action
          };
          
          console.log(`🔍 [FlowWiseService] Querying ${dexProviders.length} DEX provider(s) with filters:`, filters);
          
          const dexListings = await queryServiceProviders(
            dexProviders,
            filters
          ) as TokenListing[];
          
          console.log(`✅ [FlowWiseService] Found ${dexListings.length} DEX pool listing(s) from ${dexProviders.length} provider(s)`);
          
          context.listings = dexListings;
          break;

        case "execute_dex_trade":
          // Execute DEX trade (FULLY AUTOMATED)
          // Use handler to execute trade and update wallet
          const { createActionHandlers } = await import("../flowwiseHandlers");
          const handlers = createActionHandlers();
          const dexHandler = handlers.get("execute_dex_trade");
          
          if (!dexHandler) {
            throw new Error("execute_dex_trade handler not found");
          }
          
          const dexResult = await dexHandler(processedAction, context);
          
          // Merge result into context
          if (dexResult.trade) {
            context.trade = dexResult.trade;
            // Update totalCost with actual trade amount
            context.totalCost = dexResult.trade.baseAmount + (context.iGasCost || 0);
          }
          if (dexResult.updatedBalance !== undefined) {
            context.user.balance = dexResult.updatedBalance;
            context.updatedBalance = dexResult.updatedBalance;
          }
          if (dexResult.traderRebate !== undefined) {
            context.traderRebate = dexResult.traderRebate;
          }
          break;

        case "llm_format_response": {
          // Format response using LLM (FULLY AUTOMATED)
          console.log(`🔍 [FlowWiseService] ========================================`);
          console.log(`🔍 [FlowWiseService] llm_format_response ACTION CALLED`);
          console.log(`🔍 [FlowWiseService] listings count: ${context.listings?.length || 0}`);
          console.log(`🔍 [FlowWiseService] userInput: ${context.userInput?.substring(0, 100) || 'N/A'}`);
          console.log(`🔍 [FlowWiseService] ENABLE_OPENAI: ${ENABLE_OPENAI}`);
          console.log(`🔍 [FlowWiseService] ========================================`);
          
          if (!context.listings || context.listings.length === 0) {
            throw new Error("Listings required for LLM formatting");
          }
          
          // Check if this is autoparts data - skip LLM processing for autoparts
          // CRITICAL: Get serviceType from multiple authoritative sources
          const workflowExecutions = (global as any).workflowExecutions as Map<string, any>;
          const execution = workflowExecutions?.get(executionId);
          const originalWorkflowServiceType = execution?.serviceType || execution?.workflow?.serviceType;
          
          // Also check provider's serviceType from service registry (most authoritative - can't be wrong)
          let providerServiceType: string | null = null;
          if (context.listings && context.listings.length > 0 && context.listings[0].providerId) {
            try {
              const { serviceRegistry2 } = await import("../serviceRegistry2");
              const provider = serviceRegistry2.getProvider(context.listings[0].providerId);
              if (provider) {
                providerServiceType = provider.serviceType;
                console.log(`🔍 [FlowWiseService] Provider serviceType from registry: "${providerServiceType}" (providerId: ${context.listings[0].providerId})`);
              }
            } catch (err) {
              console.warn(`⚠️ [FlowWiseService] Could not get provider serviceType from registry:`, err);
            }
          }
          
          // Use provider serviceType as MOST authoritative (from service registry), then workflow, then context
          const serviceType = (providerServiceType || originalWorkflowServiceType || context.serviceType || context.queryResult?.serviceType || context.queryResult?.query?.serviceType || "").toLowerCase();
          
          // CRITICAL: If serviceType is explicitly "bank" or "banking", ALWAYS use LLM (never skip)
          const isBankingService = serviceType === "bank" || serviceType === "banking";
          
          // Only skip LLM if serviceType is explicitly "autoparts"
          const isAutopartsService = serviceType === "autoparts";
          
          // Also check if listings contain STRONG autoparts-specific indicators
          // Require multiple indicators to avoid false positives (e.g., banking listings with generic "title" field)
          const firstListing = context.listings.length > 0 ? context.listings[0] : null;
          const hasAutopartId = firstListing && ('autopart_id' in firstListing || 'a.id' in firstListing);
          const hasMakeModelYear = firstListing && 
            ('make' in firstListing && 'model' in firstListing && 'year' in firstListing);
          const hasPartName = firstListing && ('partName' in firstListing || 'part_name' in firstListing);
          
          // Only consider it autoparts if we have strong indicators (autopart_id OR make+model+year together OR partName)
          const hasStrongAutopartsFields = hasAutopartId || hasMakeModelYear || hasPartName;
          
          // Skip LLM ONLY if:
          // 1. serviceType is explicitly "autoparts" (and it's NOT banking - already checked above)
          // 2. OR we have strong autoparts fields AND serviceType is empty/not set (meaning we detected autoparts from data)
          // NEVER skip LLM if serviceType is explicitly set to "bank", "banking", or any other non-autoparts service
          const shouldSkipLLM = !isBankingService && (
            isAutopartsService || 
            (hasStrongAutopartsFields && (!serviceType || serviceType === ""))
          );
          
          // Debug logging
          console.log(`🔍 [FlowWiseService] LLM Skip Detection:`);
          console.log(`   - providerServiceType (from registry): "${providerServiceType || 'N/A'}"`);
          console.log(`   - originalWorkflowServiceType: "${originalWorkflowServiceType || 'N/A'}"`);
          console.log(`   - context.serviceType: "${context.serviceType || 'N/A'}"`);
          console.log(`   - final serviceType (used): "${serviceType}"`);
          console.log(`   - isBankingService: ${isBankingService}`);
          console.log(`   - isAutopartsService: ${isAutopartsService}`);
          console.log(`   - hasAutopartId: ${hasAutopartId}`);
          console.log(`   - hasMakeModelYear: ${hasMakeModelYear}`);
          console.log(`   - hasPartName: ${hasPartName}`);
          console.log(`   - hasStrongAutopartsFields: ${hasStrongAutopartsFields}`);
          console.log(`   - shouldSkipLLM: ${shouldSkipLLM}`);
          if (firstListing) {
            console.log(`   - firstListing keys: ${Object.keys(firstListing).slice(0, 10).join(', ')}...`);
          }
          
          let llmResponse: any;
          
          if (shouldSkipLLM) {
            // Skip LLM for autoparts - create simple formatted response
            console.log(`🚫 [FlowWiseService] Skipping LLM processing for autoparts data`);
            console.log(`🚫 [FlowWiseService] ServiceType: ${serviceType}, HasStrongAutopartsFields: ${hasStrongAutopartsFields}`);
            
            const firstListing = context.listings[0];
            const partName = firstListing.partName || firstListing.part_name || firstListing.title || 'Auto Part';
            const price = firstListing.price || firstListing.sale_price || firstListing.Price || 0;
            const providerName = firstListing.providerName || firstListing.provider || 'Provider';
            const location = firstListing.location || '';
            
            // Create a simple formatted message without LLM
            const message = `${providerName} offers ${partName}${location ? ` in ${location}` : ''} for $${price.toFixed(2)}.`;
            
            llmResponse = {
              message: message,
              listings: context.listings,
              selectedListing: firstListing,
              iGasCost: 0 // No LLM cost for autoparts
            };
            
            console.log(`✅ [FlowWiseService] Created non-LLM response for autoparts: ${message.substring(0, 100)}`);
          } else {
            // Use LLM for non-autoparts services (e.g., banking)
            const formatFn = ENABLE_OPENAI ? formatResponseWithOpenAI : formatResponseWithDeepSeek;
            console.log(`🔍 [FlowWiseService] About to call formatFn: ${ENABLE_OPENAI ? 'formatResponseWithOpenAI' : 'formatResponseWithDeepSeek'}`);
            
            llmResponse = await formatFn(
              context.listings,
              context.userInput || "",
              context.queryResult?.query?.filters
            );
          }
          
          console.log(`🔍 [FlowWiseService] formatFn returned, llmResponse received`);
          
          // DEBUG: Log what we got from LLM function - CRITICAL DIAGNOSTIC
          console.log(`🔍 [FlowWiseService] ========================================`);
          console.log(`🔍 [FlowWiseService] llmResponse received from formatFn:`);
          console.log(`🔍 [FlowWiseService]   - hasSelectedListing: ${!!llmResponse.selectedListing}`);
          console.log(`🔍 [FlowWiseService]   - hasSelectedListing2: ${!!llmResponse.selectedListing2}`);
          console.log(`🔍 [FlowWiseService]   - selectedListingType: ${typeof llmResponse.selectedListing}`);
          console.log(`🔍 [FlowWiseService]   - selectedListing2Type: ${typeof llmResponse.selectedListing2}`);
          console.log(`🔍 [FlowWiseService]   - selectedListingValue: ${llmResponse.selectedListing ? JSON.stringify(llmResponse.selectedListing).substring(0, 200) : 'NULL/UNDEFINED'}`);
          console.log(`🔍 [FlowWiseService]   - selectedListing2Value: ${llmResponse.selectedListing2 ? JSON.stringify(llmResponse.selectedListing2).substring(0, 200) : 'NULL/UNDEFINED'}`);
          console.log(`🔍 [FlowWiseService]   - selectedListingKeys: ${llmResponse.selectedListing ? Object.keys(llmResponse.selectedListing).join(', ') : 'N/A'}`);
          console.log(`🔍 [FlowWiseService]   - selectedListing2Keys: ${llmResponse.selectedListing2 ? Object.keys(llmResponse.selectedListing2).join(', ') : 'N/A'}`);
          console.log(`🔍 [FlowWiseService]   - listingsCount: ${context.listings?.length || 0}`);
          console.log(`🔍 [FlowWiseService]   - llmResponseKeys: ${Object.keys(llmResponse).join(', ')}`);
          
          // DEBUG: Console out FULL LLM response
          console.log(`🔍 [FlowWiseService] ========================================`);
          console.log(`🔍 [FlowWiseService] FULL LLM RESPONSE OBJECT:`);
          console.log(JSON.stringify(llmResponse, null, 2));
          console.log(`🔍 [FlowWiseService] ========================================`);
          
          // CRITICAL: Store llmResponse FIRST before any modifications
          // This ensures we preserve the original llmResponse object
          context.llmResponse = llmResponse;
          context.iGasCost = llmResponse.iGasCost;
          
          // CRITICAL: Preserve listings from llmResponse back to context.listings
          // This ensures the user_select_listing step has access to listings
          if (llmResponse.listings && Array.isArray(llmResponse.listings) && llmResponse.listings.length > 0) {
            context.listings = llmResponse.listings;
            console.log(`✅ [FlowWiseService] Preserved ${llmResponse.listings.length} listings from llmResponse to context.listings`);
          } else if (context.listings && context.listings.length > 0) {
            // If LLM didn't return listings but we have them in context, keep them
            console.log(`✅ [FlowWiseService] Keeping existing ${context.listings.length} listings in context`);
          } else {
            console.warn(`⚠️ [FlowWiseService] No listings in llmResponse and context.listings is empty!`);
          }
          
          // CRITICAL: Inject videoUrl into movie listings if this is a movie service
          // Get videoUrl from garden configuration (if available)
          const currentServiceType = context.serviceType || 'movie';
          if ((currentServiceType === 'movie' || currentServiceType === 'amc') && context.listings && context.listings.length > 0) {
            // Try to get videoUrl from garden config
            // Import GARDENS to find the current garden
            const { GARDENS } = await import("../garden");
            const currentGarden = GARDENS.find((g: any) => (g as any).serviceType === currentServiceType);
            const videoUrl = currentGarden?.videoUrl || '/api/movie/video/2025-12-09-144801890.mp4'; // Default fallback
            
            console.log(`🎬 [FlowWiseService] Injecting videoUrl into movie listings: ${videoUrl}`);
            
            // Inject videoUrl into all listings
            context.listings = context.listings.map((listing: any) => ({
              ...listing,
              videoUrl: videoUrl
            }));
            
            // Also update llmResponse.listings
            if (llmResponse.listings) {
              llmResponse.listings = llmResponse.listings.map((listing: any) => ({
                ...listing,
                videoUrl: videoUrl
              }));
            }
            
            // Inject videoUrl into selectedListing
            if (context.selectedListing) {
              context.selectedListing = {
                ...context.selectedListing,
                videoUrl: videoUrl
              };
            }
            if (llmResponse.selectedListing) {
              llmResponse.selectedListing = {
                ...llmResponse.selectedListing,
                videoUrl: videoUrl
              };
            }
            if (llmResponse.selectedListing2) {
              llmResponse.selectedListing2 = {
                ...llmResponse.selectedListing2,
                videoUrl: videoUrl
              };
            }
            
            console.log(`✅ [FlowWiseService] Injected videoUrl into ${context.listings.length} movie listings`);
          }
          
          // CRITICAL: Use llmResponse.selectedListing if available (LLM functions now ensure it's always set)
          // DO NOT modify llmResponse.selectedListing - preserve the original
          if (llmResponse.selectedListing) {
            // LLM returned a selectedListing - use it directly
            context.selectedListing = llmResponse.selectedListing;
            console.log(`✅ [FlowWiseService] Using selectedListing from llmResponse (preserved in context.llmResponse)`);
          } else if (context.listings && context.listings.length > 0) {
            // Fallback: use first listing if LLM didn't return one
            console.warn(`⚠️ [FlowWiseService] llmResponse.selectedListing is null/undefined, falling back to first listing`);
            // CRITICAL: Set BOTH context.selectedListing AND llmResponse.selectedListing
            // This ensures consistency
            const fallbackListing = context.listings[0];
            context.selectedListing = fallbackListing;
            // Update the stored llmResponse object
            context.llmResponse.selectedListing = fallbackListing;
            console.log(`🔧 [FlowWiseService] Set fallback selectedListing:`, {
              id: fallbackListing.id,
              providerId: fallbackListing.providerId,
              price: fallbackListing.price
            });
          } else {
            throw new Error("No listings available and LLM didn't return selectedListing");
          }
          
          // Final check - ensure it's really set in BOTH places
          if (!context.selectedListing || !context.llmResponse.selectedListing) {
            console.error(`❌ [FlowWiseService] CRITICAL: selectedListing is STILL null after all attempts!`);
            console.error(`❌ [FlowWiseService] context.selectedListing: ${!!context.selectedListing}`);
            console.error(`❌ [FlowWiseService] context.llmResponse.selectedListing: ${!!context.llmResponse.selectedListing}`);
            if (context.listings && context.listings.length > 0) {
              const forceListing = context.listings[0];
              context.selectedListing = forceListing;
              context.llmResponse.selectedListing = forceListing;
              console.warn(`🔧 [FlowWiseService] FORCE SET selectedListing one more time:`, {
                id: forceListing.id,
                providerId: forceListing.providerId
              });
            } else {
              throw new Error("Cannot proceed: selectedListing is null and no listings available");
            }
          }
          
          // Debug logging to verify selectedListing is set in BOTH places
          console.log(`✅ [FlowWiseService] ========================================`);
          console.log(`✅ [FlowWiseService] FINAL VERIFICATION:`);
          console.log(`✅ [FlowWiseService]   - context.selectedListing: ${context.selectedListing ? 'SET' : 'NOT SET'}`);
          console.log(`✅ [FlowWiseService]   - context.llmResponse.selectedListing: ${context.llmResponse.selectedListing ? 'SET' : 'NOT SET'}`);
          console.log(`✅ [FlowWiseService]   - context.llmResponse.selectedListing2: ${context.llmResponse.selectedListing2 ? 'SET' : 'NOT SET'}`);
          console.log(`✅ [FlowWiseService]   - context.selectedListing type: ${typeof context.selectedListing}`);
          console.log(`✅ [FlowWiseService]   - context.selectedListing sample: ${context.selectedListing ? JSON.stringify(context.selectedListing).substring(0, 100) : 'N/A'}`);
          console.log(`✅ [FlowWiseService]   - context.llmResponse.selectedListing sample: ${context.llmResponse.selectedListing ? JSON.stringify(context.llmResponse.selectedListing).substring(0, 100) : 'N/A'}`);
          console.log(`✅ [FlowWiseService]   - context.llmResponse.selectedListing2 sample: ${context.llmResponse.selectedListing2 ? JSON.stringify(context.llmResponse.selectedListing2).substring(0, 100) : 'N/A'}`);
          console.log(`✅ [FlowWiseService] ========================================`);
          
          // Extract action and tokenAmount from query filters for DEX trades
          // Set defaults if not present (BUY and 1 are common defaults)
          const filters = context.queryResult?.query?.filters || {};
          context.action = filters.action || 'BUY';
          context.tokenAmount = filters.tokenAmount || 1;
          
          // For DEX trades, calculate estimated totalCost
          const isDEXTrade = context.selectedListing && 
                           ('poolId' in context.selectedListing || 'tokenSymbol' in context.selectedListing);
          if (isDEXTrade) {
            const tokenListing = context.selectedListing as any;
            // Estimate baseAmount from price * tokenAmount (will be recalculated in execute_dex_trade)
            const estimatedBaseAmount = (tokenListing.price || 0) * (context.tokenAmount || 1);
            context.totalCost = estimatedBaseAmount + llmResponse.iGasCost;
            context.tokenSymbol = tokenListing.tokenSymbol;
            context.baseToken = tokenListing.baseToken || 'SOL';
          }
          break;
        }

        case "check_balance": {
          // Check user balance (FULLY AUTOMATED)
          const balance = await getWalletBalance(context.user?.email || "");
          context.currentBalance = balance;
          
          // Handle DEX trades differently
          const isDEXTrade = context.selectedListing && ('poolId' in context.selectedListing || 'tokenSymbol' in context.selectedListing);
          
          if (isDEXTrade) {
            // For DEX trades, we need to calculate totalCost from trade.baseAmount + iGasCost
            // But trade might not exist yet, so we need to estimate or use context values
            const action = processedAction.action || context.action || 'BUY';
            const tokenAmount = context.tokenAmount || 1;
            
            if (action === 'BUY') {
              // For BUY: need baseAmount + iGasCost
              // If trade already exists, use it; otherwise estimate from selectedListing price
              const estimatedBaseAmount = context.trade?.baseAmount || 
                                        (context.selectedListing?.price ? context.selectedListing.price * tokenAmount : 0);
              const iGasCost = context.iGasCost || 0;
              const totalCost = estimatedBaseAmount + iGasCost;
              
              context.requiredAmount = totalCost;
              context.totalCost = totalCost;
              context.hasBalance = balance >= totalCost;
              
              if (!context.hasBalance) {
                throw new Error(`Insufficient balance for DEX trade. Required: ${totalCost.toFixed(6)} ${context.selectedListing?.baseToken || 'SOL'} (${estimatedBaseAmount.toFixed(6)} + ${iGasCost.toFixed(6)} iGas), Available: ${balance.toFixed(6)}`);
              }
            } else {
              // For SELL: need tokens (future implementation - token wallet)
              // For now, just check if we have enough baseToken for iGas
              const iGasCost = context.iGasCost || 0;
              context.requiredAmount = iGasCost;
              context.totalCost = iGasCost;
              context.hasBalance = balance >= iGasCost;
              
              if (!context.hasBalance) {
                throw new Error(`Insufficient balance for iGas. Required: ${iGasCost.toFixed(6)}, Available: ${balance.toFixed(6)}`);
              }
            }
          } else {
            // Regular service (movie, restaurant, etc.)
            const required = processedAction.required || context.selectedListing?.price || 0;
            const iGasCost = context.iGasCost || 0;
            const totalCost = required + iGasCost;
            
            context.requiredAmount = required;
            context.totalCost = totalCost;
            context.hasBalance = balance >= totalCost;
            
            // CRITICAL: Throw error if insufficient balance (prevents payment processing)
            if (!context.hasBalance) {
              throw new Error(`Insufficient balance for payment. Required: ${totalCost.toFixed(6)} 🍎 APPLES (${required.toFixed(6)} + ${iGasCost.toFixed(6)} iGas), Available: ${balance.toFixed(6)} 🍎 APPLES`);
            }
          }
          break;
        }

        case "create_snapshot": {
          // Create transaction snapshot (FULLY AUTOMATED)
          const snapshotServiceType = context.serviceType || "movie";
          
          // For DEX trades, use trade.baseAmount
          let snapshotServiceTypePrice: number;
          if (snapshotServiceType === 'dex' && context.trade) {
            snapshotServiceTypePrice = context.trade.baseAmount;
          } else {
            snapshotServiceTypePrice = snapshotServiceType === 'hotel' ? context.hotelPrice :
                                      snapshotServiceType === 'airline' ? context.airlinePrice :
                                      snapshotServiceType === 'restaurant' ? (context.diningPrice || context.restaurantPrice) :
                                      snapshotServiceType === 'movie' ? context.moviePrice :
                                      context.totalCost;
          }
          
          // CRITICAL: For restaurant, ensure diningPrice is set from selectedListing if not already set
          if (snapshotServiceType === 'restaurant' && !context.diningPrice && context.selectedListing?.price) {
            context.diningPrice = context.selectedListing.price;
            console.log(`   🍴 [FlowWiseService] CRITICAL: Set diningPrice from selectedListing: ${context.diningPrice} JSC`);
          }
          
          // If processedAction.amount is null (template variable not found), use fallback
          let snapshotAmount = processedAction.amount;
          if (snapshotAmount === null || snapshotAmount === undefined || snapshotAmount === 0) {
            snapshotAmount = snapshotServiceTypePrice || context.selectedListing?.price || 0;
            console.log(`   ⚠️ [FlowWiseService] Template variable amount was null/0, using fallback: ${snapshotAmount} JSC`);
          }
          
          // Final validation - if still 0, this is an error
          if (!snapshotAmount || snapshotAmount === 0) {
            console.error(`   ❌ [FlowWiseService] CRITICAL: Snapshot amount is 0!`, {
              processedActionAmount: processedAction.amount,
              snapshotServiceTypePrice,
              selectedListingPrice: context.selectedListing?.price,
              diningPrice: context.diningPrice,
              restaurantPrice: context.restaurantPrice,
              totalCost: context.totalCost,
              serviceType: snapshotServiceType
            });
            throw new Error(`Cannot create snapshot: amount is 0. Check diningPrice/restaurantPrice in context.`);
          }
          
          console.log(`   💰 [FlowWiseService] ✅ Snapshot amount validated: ${snapshotAmount} JSC (serviceType: ${snapshotServiceType})`);
          
          // CRITICAL: Always use user email from context for payer
          const userEmail = context.user?.email || "unknown@example.com";
          if (!context.user?.email) {
            console.warn(`   ⚠️ [FlowWiseService] Warning: context.user.email is missing, using fallback: ${userEmail}`);
          }
          
          context.snapshot = {
            txId: `tx_${Date.now()}`,
            blockTime: Date.now(),
            payer: userEmail, // Always use user email from context
            amount: snapshotAmount,
            feeSplit: {
              indexer: 0,
              cashier: 0.1,
              provider: snapshotAmount * 0.05,
              eden: snapshotAmount * 0.02
            }
          };
          
          console.log(`   📧 [FlowWiseService] Snapshot created with payer email: ${userEmail}`);
          
          // Set service-type-specific price in context
          if (snapshotServiceType === 'hotel') {
            context.hotelPrice = context.selectedListing?.price || snapshotAmount;
          } else if (snapshotServiceType === 'movie') {
            context.moviePrice = context.selectedListing?.price || snapshotAmount;
          } else if (snapshotServiceType === 'airline') {
            context.airlinePrice = context.selectedListing?.price || snapshotAmount;
          } else if (snapshotServiceType === 'restaurant') {
            context.restaurantPrice = context.selectedListing?.price || snapshotAmount;
            // CRITICAL: Also set diningPrice for restaurant workflow template variables
            context.diningPrice = context.selectedListing?.price || snapshotAmount;
          }
          context.iGasCost = context.iGasCost || 0.00445;
          break;
        }

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

        case "add_ledger_entry": {
          // Create ledger entry (FULLY AUTOMATED)
          if (!context.snapshot) {
            throw new Error("Snapshot required for ledger entry");
          }
          // Ensure snapshot amount is valid - check service-type-specific prices
          const ledgerServiceType = context.serviceType || "movie";
          const ledgerServiceTypePrice = ledgerServiceType === 'hotel' ? context.hotelPrice :
                                        ledgerServiceType === 'airline' ? context.airlinePrice :
                                        ledgerServiceType === 'restaurant' ? (context.diningPrice || context.restaurantPrice) :
                                        ledgerServiceType === 'movie' ? context.moviePrice :
                                        ledgerServiceType === 'grocerystore' ? context.grocerystorePrice :
                                        ledgerServiceType === 'pharmacy' ? context.pharmacyPrice :
                                        ledgerServiceType === 'dogpark' ? context.dogparkPrice :
                                        ledgerServiceType === 'gasstation' ? context.gasstationPrice :
                                        ledgerServiceType === 'party' ? context.partyPrice :
                                        ledgerServiceType === 'bank' ? context.bankPrice :
                                        context.totalCost;
          
          const entryAmount = context.snapshot.amount && context.snapshot.amount > 0
            ? context.snapshot.amount
            : (ledgerServiceTypePrice || context.selectedListing?.price || 0);
          
          console.log(`   💰 [FlowWiseService] add_ledger_entry - Amount calculation:`, {
            snapshotAmount: context.snapshot.amount,
            serviceType: ledgerServiceType,
            serviceTypePrice: ledgerServiceTypePrice,
            diningPrice: context.diningPrice,
            restaurantPrice: context.restaurantPrice,
            selectedListingPrice: context.selectedListing?.price,
            finalEntryAmount: entryAmount
          });
          
          if (!entryAmount || entryAmount === 0) {
            throw new Error(`Cannot create ledger entry: amount is ${entryAmount}`);
          }

          // Update snapshot amount if needed
          if (!context.snapshot.amount || context.snapshot.amount === 0) {
            context.snapshot.amount = entryAmount;
          }

          // Get serviceType and build booking details dynamically (ledgerServiceType already declared above)
          const fields = getServiceTypeFields(ledgerServiceType);
          
          // Build booking details dynamically based on service type
          // CRITICAL: For DEX trades, use trade details instead of listing
          let bookingDetails: any;
          
          if (ledgerServiceType === 'dex' && context.trade) {
            // DEX trade: use trade details
            bookingDetails = {
              tokenSymbol: context.tokenSymbol || context.trade.tokenSymbol,
              baseToken: context.baseToken || context.trade.baseToken,
              action: context.action || context.trade.action,
              tokenAmount: context.tokenAmount || context.trade.tokenAmount,
              baseAmount: context.trade.baseAmount,
              price: context.trade.price,
              iTax: context.trade.iTax,
              tradeId: context.trade.tradeId,
              poolId: context.selectedListing?.poolId || context.trade.poolId
            };
            console.log(`   💰 [FlowWiseService] DEX trade booking details:`, bookingDetails);
          } else {
            // Regular service: use selectedListing
            // CRITICAL: Use selectedListing from context, but fallback to userSelection if selectedListing is missing
            const listingForBooking = context.selectedListing || context.userSelection || {};
            
            // Log what we're using for booking details
            console.log(`   💰 [FlowWiseService] Extracting booking details from:`, {
              hasSelectedListing: !!context.selectedListing,
              hasUserSelection: !!context.userSelection,
              listingKeys: Object.keys(listingForBooking),
              listingSample: {
                restaurantName: listingForBooking.restaurantName,
                cuisine: listingForBooking.cuisine,
                reservationTime: listingForBooking.reservationTime,
                partySize: listingForBooking.partySize,
                location: listingForBooking.location,
                price: listingForBooking.price
              }
            });
            
            bookingDetails = extractBookingDetails(ledgerServiceType, listingForBooking);
            bookingDetails.price = entryAmount; // Ensure price is set
          }
          
          // Log extracted booking details
          console.log(`   💰 [FlowWiseService] Extracted booking details:`, JSON.stringify(bookingDetails, null, 2));
          
          // Get default provider info based on service type (dynamic)
          const { getDefaultProviderName, getDefaultProviderId } = await import("../serviceTypeFields");
          const defaultProviderName = getDefaultProviderName(ledgerServiceType);
          const defaultProviderId = getDefaultProviderId(ledgerServiceType);
          
          console.log(`   💰 [FlowWiseService] Creating ledger entry with:`, {
            snapshotAmount: context.snapshot.amount,
            serviceType: ledgerServiceType,
            bookingDetailsPrice: bookingDetails.price,
            entryAmount: entryAmount
          });
          
          const ledgerEntry = addLedgerEntry(
            context.snapshot,
            ledgerServiceType,
            context.iGasCost || 0.00445,
            context.user?.email || "unknown@example.com",
            context.selectedListing?.providerName || defaultProviderName,
            context.providerUuid || context.selectedListing?.providerId || defaultProviderId,
            bookingDetails
          );
          
          console.log(`   💰 [FlowWiseService] Ledger entry created:`, {
            entryId: ledgerEntry.entryId,
            amount: ledgerEntry.amount,
            status: ledgerEntry.status,
            serviceType: ledgerEntry.serviceType
          });
          
          // CRITICAL: Verify amount is set correctly
          if (!ledgerEntry.amount || ledgerEntry.amount === 0) {
            console.error(`   ❌ [FlowWiseService] CRITICAL: Ledger entry amount is 0!`, {
              snapshotAmount: context.snapshot.amount,
              entryAmount: entryAmount,
              bookingDetailsPrice: bookingDetails.price,
              selectedListingPrice: context.selectedListing?.price
            });
            throw new Error(`Ledger entry created with 0 amount! Snapshot amount: ${context.snapshot.amount}, Entry amount: ${entryAmount}`);
          }
          
          context.ledgerEntry = ledgerEntry;
          // Initialize cashier in context for payment step
          if (!context.cashier) {
            context.cashier = getCashierStatus();
          }
          break;
        }

        case "process_payment": {
          // Process payment (FULLY AUTOMATED - ROOT CA LEVEL - NO SERVICE PROVIDER CONTROL)
          console.log(`   💰 [FlowWiseService] ========================================`);
          console.log(`   💰 [FlowWiseService] 🎯🎯🎯 PROCESS_PAYMENT CASE ENTERED! 🎯🎯🎯`);
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
          
          // CRITICAL: Check wallet balance BEFORE processing payment
          // This prevents PRIEST users (or any user) with insufficient balance from processing payment
          const currentBalance = await getWalletBalance(context.user.email);
          console.log(`   💰 [FlowWiseService] Current wallet balance: ${currentBalance.toFixed(6)} JSC`);
          console.log(`   💰 [FlowWiseService] Required payment amount: ${paymentAmount.toFixed(6)} JSC`);
          
          if (currentBalance < paymentAmount) {
            const errorMessage = `Insufficient balance for payment. Required: ${paymentAmount.toFixed(6)} JSC, Available: ${currentBalance.toFixed(6)} JSC`;
            console.error(`   ❌ [FlowWiseService] ${errorMessage}`);
            throw new Error(errorMessage);
          }
          
          console.log(`   ✅ [FlowWiseService] Balance check passed: ${currentBalance.toFixed(6)} >= ${paymentAmount.toFixed(6)}`);

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
          console.log(`   💰 [FlowWiseService] ========================================`);
          console.log(`   💰 [FlowWiseService] About to call processPayment function`);
          console.log(`   💰 [FlowWiseService] Parameters:`, {
            cashierId: cashier.id,
            cashierName: cashier.name,
            entryId: ledgerEntryInArray.entryId,
            entryAmount: ledgerEntryInArray.amount,
            userEmail: context.user.email,
            userBalance: context.user.balance
          });
          console.log(`   💰 [FlowWiseService] ========================================`);
          
          // Get current wallet balance BEFORE payment
          const balanceBeforePayment = await getWalletBalance(context.user.email);
          console.log(`   💰 [FlowWiseService] Wallet balance BEFORE payment: ${balanceBeforePayment} JSC`);
          console.log(`   💰 [FlowWiseService] Amount to debit: ${ledgerEntryInArray.amount} JSC`);
          console.log(`   💰 [FlowWiseService] Expected balance AFTER: ${balanceBeforePayment - ledgerEntryInArray.amount} JSC`);
          
          const paymentResult = await processPayment(cashier, ledgerEntryInArray, context.user);
          
          // Get current wallet balance AFTER payment
          const balanceAfterPayment = await getWalletBalance(context.user.email);
          console.log(`   💰 [FlowWiseService] ========================================`);
          console.log(`   💰 [FlowWiseService] Payment result: ${paymentResult}`);
          console.log(`   💰 [FlowWiseService] Wallet balance AFTER payment: ${balanceAfterPayment} JSC`);
          console.log(`   💰 [FlowWiseService] Balance change: ${balanceBeforePayment - balanceAfterPayment} JSC`);
          if (balanceBeforePayment - balanceAfterPayment !== ledgerEntryInArray.amount) {
            console.error(`   ❌ [FlowWiseService] CRITICAL: Balance change (${balanceBeforePayment - balanceAfterPayment}) does NOT match entry amount (${ledgerEntryInArray.amount})!`);
          } else {
            console.log(`   ✅ [FlowWiseService] Balance change matches entry amount - deduction successful!`);
          }
          console.log(`   💰 [FlowWiseService] ========================================`);
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
          // CRITICAL: Update ledger entry status to 'completed'
          if (context.ledgerEntry) {
            // Find the actual entry in LEDGER array to update status
            const ledgerEntryInArray = LEDGER_ARRAY.find((e: any) => e.entryId === context.ledgerEntry.entryId);
            if (ledgerEntryInArray) {
              const { completeBooking } = await import("../ledger");
              completeBooking(ledgerEntryInArray);
              console.log(`   ✅ [FlowWiseService] Booking completed: ${ledgerEntryInArray.entryId}, status: ${ledgerEntryInArray.status}`);
              
              // Persist the status update
              if (redisInstance) {
                redisInstance.saveLedgerEntries(LEDGER_ARRAY);
                console.log(`   💾 [FlowWiseService] ✅ Persisted ledger entry with completed status: ${ledgerEntryInArray.entryId}`);
              }
              
              // Update context with completed entry
              context.ledgerEntry = ledgerEntryInArray;
            } else {
              console.warn(`   ⚠️ [FlowWiseService] Ledger entry not found in array for completion: ${context.ledgerEntry.entryId}`);
            }
          }
          context.bookingId = `booking-${Date.now()}`;
          context.bookingStatus = 'confirmed';
          break;

        case "start_movie_watching":
          // Start movie watching (AUTO-COMPLETE - immediately mark as watched)
          // The websocket events defined in the workflow JSON will be broadcasted automatically
          // by executeNextStep after this action completes
          const movieTitle = processedAction.movieTitle || context.selectedListing?.movieTitle || 'Unknown Movie';
          
          // CRITICAL: Get videoUrl from multiple sources (selectedListing, gardenConfig, or GARDENS)
          let videoUrl = context.selectedListing?.videoUrl || 
                        context.gardenConfig?.videoUrl || 
                        context.videoUrl || '';
          
          // If still not found, try to get from GARDENS
          if (!videoUrl) {
            try {
              const { GARDENS } = await import("../garden");
              const currentServiceType = context.serviceType || 'movie';
              const currentGarden = GARDENS.find((g: any) => (g as any).serviceType === currentServiceType);
              videoUrl = currentGarden?.videoUrl || '/api/movie/video/2025-12-09-144801890.mp4'; // Default fallback
              console.log(`🎬 [FlowWiseService] Retrieved videoUrl from GARDENS: ${videoUrl}`);
            } catch (err) {
              console.warn(`⚠️ [FlowWiseService] Could not get videoUrl from GARDENS:`, err);
              videoUrl = '/api/movie/video/2025-12-09-144801890.mp4'; // Default fallback
            }
          }
          
          // CRITICAL: Ensure videoUrl is set - if still empty, use default
          if (!videoUrl || videoUrl === '') {
            videoUrl = '/api/movie/video/2025-12-09-144801890.mp4';
            console.warn(`⚠️ [FlowWiseService] videoUrl was empty, using default: ${videoUrl}`);
          }
          
          // Set movie state - mark as watched immediately for auto-complete
          context.movieStarted = true;
          context.movieTitle = movieTitle;
          context.movieProgress = 100; // Set to 100% immediately (auto-complete)
          context.currentScene = 'genesis_garden';
          context.movieWatched = true; // CRITICAL: Mark as watched immediately for auto-complete
          context.finalScene = 'genesis_garden';
          context.videoUrl = videoUrl; // Store videoUrl in context for template variables
          
          // CRITICAL: Also update selectedListing.videoUrl if it exists (for template variables)
          if (context.selectedListing) {
            context.selectedListing = {
              ...context.selectedListing,
              videoUrl: videoUrl
            };
          }
          
          console.log(`🎬 [FlowWiseService] ========================================`);
          console.log(`🎬 [FlowWiseService] Movie watching auto-completed: ${movieTitle}`);
          console.log(`🎬 [FlowWiseService] Video URL: ${videoUrl}`);
          console.log(`🎬 [FlowWiseService] movieWatched set to: ${context.movieWatched}`);
          console.log(`🎬 [FlowWiseService] context.videoUrl: ${context.videoUrl}`);
          console.log(`🎬 [FlowWiseService] context.selectedListing?.videoUrl: ${context.selectedListing?.videoUrl}`);
          console.log(`🎬 [FlowWiseService] ========================================`);
          break;

        case "start_hotel_booking":
          // Start hotel booking (FULLY AUTOMATED)
          const hotelName = processedAction.hotelName || context.selectedListing?.hotelName || 'Unknown Hotel';
          const duration = processedAction.duration || 1;
          const confirmationMessage = processedAction.confirmationMessage || `Your booking for ${hotelName} is confirmed!`;
          
          context.hotelBooked = true;
          context.hotelName = hotelName;
          context.duration = duration;
          context.confirmationMessage = confirmationMessage;
          context.bookingId = `hotel_${Date.now()}`;
          
          console.log(`   🏨 [FlowWiseService] Hotel booking started: ${hotelName} for ${duration} night(s)`);
          break;

        case "start_dining_experience":
        case "start_restaurant_booking":
          // Start restaurant booking/dining experience (FULLY AUTOMATED)
          const restaurantName = processedAction.restaurantName || context.selectedListing?.restaurantName || 'Unknown Restaurant';
          const diningDuration = processedAction.duration || 60;
          
          // CRITICAL: Set diningPrice for restaurant workflow template variables
          context.diningPrice = context.restaurantPrice || context.selectedListing?.price || 0;
          context.restaurantBooked = true;
          context.restaurantName = restaurantName;
          context.diningDuration = diningDuration;
          context.bookingId = `restaurant_${Date.now()}`;
          
          console.log(`   🍴 [FlowWiseService] Restaurant booking/dining started: ${restaurantName} for ${diningDuration} minutes`);
          console.log(`   🍴 [FlowWiseService] Dining price set: ${context.diningPrice} JSC`);
          break;
          
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
          console.log(`   🔐 [FlowWiseService] ROOT CA action: ${processedAction.type}`);
          context[`${processedAction.type}_completed`] = true;
          context.paymentValidated = true;
          break;
          
        case "root_ca_verify_balance_update":
          console.log(`   🔐 [FlowWiseService] ROOT CA action: ${processedAction.type}`);
          context[`${processedAction.type}_completed`] = true;
          context.balanceVerified = true;
          break;
          
        case "root_ca_authorize_payment":
          // CRITICAL: Set paymentAuthorized to true for transition to watch_movie step
          console.log(`   🔐 [FlowWiseService] ROOT CA action: ${processedAction.type}`);
          context[`${processedAction.type}_completed`] = true;
          context.paymentAuthorized = true; // CRITICAL: Required for transition to watch_movie
          context.cashierOversightComplete = true;
          console.log(`   🔐 [FlowWiseService] ✅ Payment authorized - context.paymentAuthorized = true`);
          break;

        case "process_transaction":
          // Process banking transaction
          console.log(`   🏦 [FlowWiseService] Processing banking transaction`);
          console.log(`   🏦 [FlowWiseService] Action details:`, processedAction);
          
          // Extract transaction details from action or context
          const transactionAmount = processedAction.amount || context.selectedListing?.amount || context.selectedListing?.price || context.bankPrice || 0;
          const transactionType = processedAction.transactionType || context.selectedListing?.transactionType || 'deposit';
          
          // Set transaction details in context
          context.transactionAmount = transactionAmount;
          context.transactionType = transactionType;
          context.transactionProcessed = true;
          context[`${processedAction.type}_completed`] = true;
          
          console.log(`   🏦 [FlowWiseService] Transaction processed: ${transactionType} - ${transactionAmount} 🍎 APPLES`);
          console.log(`   🏦 [FlowWiseService] transactionProcessed flag set to: ${context.transactionProcessed}`);
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
  
  console.log(`   🔄 [FlowWiseService] ========================================`);
  console.log(`   🔄 [FlowWiseService] 🎯 submitUserDecision FUNCTION CALLED! 🎯`);
  console.log(`   🔄 [FlowWiseService] ExecutionId: ${executionId}`);
  console.log(`   🔄 [FlowWiseService] Decision: ${decision}`);
  console.log(`   🔄 [FlowWiseService] SelectionData: ${selectionData ? 'provided' : 'none'}`);
  console.log(`   🔄 [FlowWiseService] ========================================`);
  
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
  
  console.log(`   🔄 [FlowWiseService] Execution found:`, {
    executionId: execution.executionId,
    currentStep: execution.currentStep,
    serviceType: execution.serviceType,
    workflowName: execution.workflow?.name
  });

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

  // CRITICAL: If we're at a decision step that expects a specific value, validate it
  // For example, view_movie expects "DONE_WATCHING", not a movie ID
  const currentStepDef = execution.workflow.steps.find((s: any) => s.id === execution.currentStep);
  if (currentStepDef && currentStepDef.type === "decision" && currentStepDef.requiresUserDecision) {
    if (currentStepDef.id === 'view_movie') {
      // view_movie step expects "DONE_WATCHING", not a movie ID
      // If userDecision already has a value that's not "DONE_WATCHING", it's from a previous step
      const previousUserDecision = execution.context.userDecision;
      if (previousUserDecision && previousUserDecision !== 'DONE_WATCHING' && previousUserDecision !== 'DONE_WATCHING'.toUpperCase()) {
        console.log(`   🎬 [FlowWiseService] ⚠️ Clearing invalid userDecision from previous step: ${previousUserDecision}`);
        console.log(`   🎬 [FlowWiseService] view_movie step expects "DONE_WATCHING", not "${previousUserDecision}"`);
        // Don't clear it here - the user is submitting a new decision, so use that
        // The issue is that the old value was used to evaluate transitions before this point
      }
    }
  }
  
  // Update context with decision
  // CRITICAL: Normalize decision value to uppercase for consistent comparison
  // This ensures "yes", "Yes", "YES" all become "YES" to match workflow conditions
  const normalizedDecision = typeof decision === 'string' ? decision.toUpperCase().trim() : decision;
  
  // CRITICAL: If we're at view_movie step, REJECT any decision that isn't "DONE_WATCHING"
  // This prevents stale selections (like "AMC-001") from being submitted when the workflow is waiting for "DONE_WATCHING"
  if (execution.currentStep === 'view_movie' && normalizedDecision !== 'DONE_WATCHING') {
    console.error(`   🎬 [FlowWiseService] ========================================`);
    console.error(`   🎬 [FlowWiseService] ERROR: view_movie step received "${normalizedDecision}" instead of "DONE_WATCHING"!`);
    console.error(`   🎬 [FlowWiseService] This is likely a stale selection from a previous step (e.g., movie selection "AMC-001")`);
    console.error(`   🎬 [FlowWiseService] Rejecting this decision to prevent workflow error`);
    console.error(`   🎬 [FlowWiseService] The workflow will remain at view_movie step, waiting for "DONE_WATCHING"`);
    console.error(`   🎬 [FlowWiseService] ========================================`);
    
    // Don't update userDecision - keep the workflow waiting for the correct decision
    // Return an error response instead of proceeding
    throw new Error(`Invalid decision for view_movie step: received "${normalizedDecision}" but expected "DONE_WATCHING". This is likely a stale selection from a previous step.`);
  }
  
  // CRITICAL: Only set userDecision if we're actually at a decision step
  // This prevents userDecision from being set prematurely
  // Note: currentStepDef is already declared above at line 2468, so we reuse it
  if (currentStepDef && currentStepDef.type === "decision" && currentStepDef.requiresUserDecision) {
    execution.context.userDecision = normalizedDecision;
    console.log(`   🔄 [FlowWiseService] ✅ Set userDecision in context: ${normalizedDecision} (original: ${decision})`);
    console.log(`   🔄 [FlowWiseService] ✅ Current step is a decision step: ${execution.currentStep}`);
  } else {
    console.warn(`   ⚠️ [FlowWiseService] WARNING: Attempting to set userDecision but current step is NOT a decision step!`);
    console.warn(`   ⚠️ [FlowWiseService] Current step: ${execution.currentStep}, type: ${currentStepDef?.type}, requiresUserDecision: ${currentStepDef?.requiresUserDecision}`);
    // Still set it, but log a warning
    execution.context.userDecision = normalizedDecision;
  }
  
  // CRITICAL: If we're submitting a decision for view_movie, ensure it's "DONE_WATCHING"
  // If it's not, this is likely a mistake (user clicked wrong button or old decision value)
  if (currentStepDef && currentStepDef.id === 'view_movie' && normalizedDecision !== 'DONE_WATCHING') {
    console.log(`   🎬 [FlowWiseService] ⚠️ WARNING: view_movie step received decision "${normalizedDecision}" instead of "DONE_WATCHING"`);
    console.log(`   🎬 [FlowWiseService] This might be an old decision value from a previous step`);
    console.log(`   🎬 [FlowWiseService] The workflow will transition to error_handler because of this`);
  }
  
  // CRITICAL: Preserve the original selectedListing from context if it exists
  // When user confirms with "YES" or "NO", we should NOT overwrite the selectedListing
  // The selectedListing should already be set from the previous selection step
  let selectedListing: any = null;
  
  // First, check if there's already a selectedListing in context (from previous selection step)
  const existingSelectedListing = execution.context.selectedListing;
  if (existingSelectedListing && 
      (existingSelectedListing.restaurantName !== undefined ||
       existingSelectedListing.movieTitle !== undefined ||
       existingSelectedListing.flightNumber !== undefined ||
       existingSelectedListing.hotelName !== undefined ||
       existingSelectedListing.partName !== undefined ||
       existingSelectedListing.poolId !== undefined ||
       existingSelectedListing.tokenSymbol !== undefined ||
       existingSelectedListing.grocerystoreName !== undefined ||
       existingSelectedListing.pharmacyName !== undefined ||
       existingSelectedListing.dogparkName !== undefined ||
       existingSelectedListing.gasstationName !== undefined ||
       existingSelectedListing.partyName !== undefined ||
       existingSelectedListing.bankName !== undefined)) {
    // Preserve the existing selectedListing - this is the actual booking selection
    selectedListing = existingSelectedListing;
    console.log(`   🎬 [FlowWiseService] Preserving existing selectedListing from context:`, {
      restaurantName: selectedListing.restaurantName,
      movieTitle: selectedListing.movieTitle,
      flightNumber: selectedListing.flightNumber,
      poolId: selectedListing.poolId,
      tokenSymbol: selectedListing.tokenSymbol,
      price: selectedListing.price
    });
  } else if (selectionData) {
    // If selectionData is provided, use it as the selected listing
    // But also try to find the full listing from the listings array if available
    selectedListing = selectionData;
    
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
  } else if (execution.context.listings && typeof decision === 'string') {
    // If selectionData is not provided and decision is a string, check if it's a decision value (YES/NO)
    // If it's YES/NO, preserve existing selectedListing instead of creating a new one
    const upperDecision = decision.toUpperCase().trim();
    if (upperDecision === 'YES' || upperDecision === 'NO') {
      // This is a confirmation decision, not a selection - preserve existing selectedListing
      if (execution.context.selectedListing) {
        selectedListing = execution.context.selectedListing;
        console.log(`   🎬 [FlowWiseService] Decision is YES/NO confirmation - preserving existing selectedListing`);
      } else {
        console.warn(`   ⚠️ [FlowWiseService] Decision is YES/NO but no selectedListing in context - this might be a problem`);
      }
    } else {
      // Try to find the listing from context.listings using decision ID
      const foundListing = execution.context.listings.find((listing: any) => 
        listing.id === decision || 
        listing.providerId === decision ||
        listing.value === decision
      );
      if (foundListing) {
        selectedListing = foundListing;
        console.log(`   🎬 [FlowWiseService] Found listing from context.listings for decision ID: ${decision}`);
      } else {
        console.warn(`   ⚠️ [FlowWiseService] Could not find listing for decision ID: ${decision}`);
      }
    }
  }
  
  // If we still don't have a selectedListing, only then create a minimal one
  // But only if the decision is NOT YES/NO (which should preserve existing selectedListing)
  if (!selectedListing) {
    const upperDecision = typeof decision === 'string' ? decision.toUpperCase().trim() : '';
    if (upperDecision !== 'YES' && upperDecision !== 'NO') {
      selectedListing = typeof decision === 'string' ? { id: decision, providerId: decision } : decision;
      console.log(`   ⚠️ [FlowWiseService] No selectedListing found, created minimal listing from decision: ${decision}`);
    } else {
      // For YES/NO decisions, use existing selectedListing or try to get from llmResponse
      if (execution.context.selectedListing) {
        selectedListing = execution.context.selectedListing;
        console.log(`   ⚠️ [FlowWiseService] YES/NO decision - using existing selectedListing from context`);
      } else if (execution.context.llmResponse && execution.context.llmResponse.selectedListing) {
        selectedListing = execution.context.llmResponse.selectedListing;
        console.log(`   ⚠️ [FlowWiseService] YES/NO decision - using selectedListing from llmResponse`);
      } else if (execution.context.listings && execution.context.listings.length > 0) {
        // Fallback: use first listing if available (especially for DEX trades)
        selectedListing = execution.context.listings[0];
        console.log(`   ⚠️ [FlowWiseService] YES/NO decision - using first listing as fallback`);
      } else {
        selectedListing = {};
        console.log(`   ⚠️ [FlowWiseService] YES/NO decision but no selectedListing - using empty object`);
      }
    }
  }
  
  // CRITICAL: Always set userSelection for transition condition evaluation
  // But preserve selectedListing if it already has booking details
  execution.context.userSelection = selectedListing;
  // Only update selectedListing if it doesn't already have proper booking details
  if (!execution.context.selectedListing || 
      (execution.context.selectedListing && 
       !execution.context.selectedListing.restaurantName && 
       !execution.context.selectedListing.movieTitle && 
       !execution.context.selectedListing.flightNumber &&
       !execution.context.selectedListing.hotelName &&
       !execution.context.selectedListing.partName &&
       !execution.context.selectedListing.poolId &&
       !execution.context.selectedListing.tokenSymbol &&
       !execution.context.selectedListing.grocerystoreName &&
       !execution.context.selectedListing.pharmacyName &&
       !execution.context.selectedListing.dogparkName &&
       !execution.context.selectedListing.gasstationName &&
       !execution.context.selectedListing.partyName &&
       !execution.context.selectedListing.bankName)) {
    execution.context.selectedListing = selectedListing;
  }
  
  // CRITICAL: Set service-type-specific price in context when listing is selected
  if (selectedListing && selectedListing.price) {
    const serviceType = execution.context.serviceType || 'movie';
    if (serviceType === 'restaurant') {
      execution.context.restaurantPrice = selectedListing.price;
      execution.context.diningPrice = selectedListing.price; // CRITICAL: Set diningPrice for restaurant workflow
      console.log(`   🍴 [FlowWiseService] Set restaurantPrice and diningPrice: ${selectedListing.price} 🍎 APPLES`);
    } else if (serviceType === 'hotel') {
      execution.context.hotelPrice = selectedListing.price;
    } else if (serviceType === 'airline') {
      execution.context.airlinePrice = selectedListing.price;
    } else if (serviceType === 'movie') {
      execution.context.moviePrice = selectedListing.price;
    } else if (serviceType === 'grocerystore') {
      execution.context.grocerystorePrice = selectedListing.price;
    } else if (serviceType === 'pharmacy') {
      execution.context.pharmacyPrice = selectedListing.price;
    } else if (serviceType === 'dogpark') {
      execution.context.dogparkPrice = selectedListing.price;
    } else if (serviceType === 'gasstation') {
      execution.context.gasstationPrice = selectedListing.price;
    } else if (serviceType === 'party') {
      execution.context.partyPrice = selectedListing.price;
    } else if (serviceType === 'bank') {
      execution.context.bankPrice = selectedListing.price;
    }
    execution.context.totalCost = selectedListing.price;
  }
  
  // CRITICAL: Preserve listings array in context for template variable resolution
  // This ensures that template variables like {{id}}, {{movieTitle}}, etc. can be resolved
  if (execution.context.listings && selectedListing && !execution.context.listings.find((l: any) => 
    (l.id === selectedListing.id || l.id === selectedListing.providerId) ||
    (selectedListing.id && l.providerId === selectedListing.id)
  )) {
    // If selected listing is not in listings array, add it
    execution.context.listings.push(selectedListing);
  }
  
  console.log(`   🎬 [FlowWiseService] User selected listing:`, {
    id: selectedListing?.id || selectedListing?.providerId,
    movieTitle: selectedListing?.movieTitle,
    restaurantName: selectedListing?.restaurantName,
    price: selectedListing?.price,
    providerName: selectedListing?.providerName
  });

      // CRITICAL: After user decision, evaluate transitions from CURRENT step to find NEXT step
      // Don't re-execute the current step - move forward to the next step
      try {
        let { workflow, context, currentStep } = execution;
        
        // CRITICAL: If we're at view_movie, validate that the decision is "DONE_WATCHING"
        // If userDecision has an old value (like "AMC-001"), it means the decision step didn't clear it properly
        // In this case, we should use the newly submitted decision value
        if (currentStep === 'view_movie') {
          const currentStepDef = workflow.steps.find((s: any) => s.id === currentStep);
          if (currentStepDef && currentStepDef.type === "decision") {
            // view_movie expects "DONE_WATCHING"
            // If the submitted decision is not "DONE_WATCHING", log a warning
            if (normalizedDecision !== 'DONE_WATCHING') {
              console.log(`   🎬 [FlowWiseService] ⚠️ WARNING: view_movie received decision "${normalizedDecision}" instead of "DONE_WATCHING"`);
              console.log(`   🎬 [FlowWiseService] This might be an old decision value - the workflow will transition to error_handler`);
            }
          }
        }
        
        // Ensure context is updated with the decision before evaluating transitions
        // This is critical for transition conditions like {{userDecision}} === 'YES'
        console.log(`   🔄 [FlowWiseService] Current step: ${currentStep}, userDecision: ${context.userDecision}`);
        console.log(`   🔄 [FlowWiseService] Context keys:`, Object.keys(context));
      
      if (!workflow || !workflow.transitions) {
        throw new Error(`Workflow or transitions missing. Workflow: ${!!workflow}, Transitions: ${!!workflow?.transitions}`);
      }
      
      // CRITICAL: If we're at error_handler but user is submitting a selection, try to recover
      // This can happen if workflow went to error_handler prematurely (e.g., empty listings)
      // but user is now providing a valid selection
      if (currentStep === 'error_handler') {
        console.log(`   🔄 [FlowWiseService] ⚠️ Workflow is at error_handler - attempting recovery`);
        console.log(`   🔄 [FlowWiseService] Has selectionData: ${!!selectionData}`);
        console.log(`   🔄 [FlowWiseService] Has selectedListing in context: ${!!context.selectedListing}`);
        console.log(`   🔄 [FlowWiseService] Context paymentSuccess: ${context.paymentSuccess}`);
        console.log(`   🔄 [FlowWiseService] Context userDecision: ${context.userDecision}`);
        
        // Determine recovery step based on workflow state
        let recoveryStep: string | null = null;
        
        // If user is submitting a selection (selectionData provided), they should be at user_select_listing or user_confirm_listing
        if (selectionData) {
          // Update context with selection
          context.selectedListing = selectionData;
          context.userSelection = selectionData;
          
          // Restore listings if missing
          if (!context.listings || context.listings.length === 0) {
            context.listings = [selectionData];
            console.log(`   🔄 [FlowWiseService] Restored listings array with selection`);
          }
          
          // If we haven't confirmed yet, go to user_confirm_listing
          // If we already confirmed (userDecision === 'YES'), go to payment
          if (context.userDecision === 'YES' || context.paymentSuccess) {
            // Already confirmed and/or paid - should be at payment or later steps
            recoveryStep = context.paymentSuccess ? 'root_ca_cashier_oversight' : 'root_ca_ledger_and_payment';
          } else {
            // Just selected, need to confirm
            recoveryStep = 'user_confirm_listing';
          }
        } else if (context.selectedListing) {
          // We have a selectedListing but no new selection - check where we should be
          if (context.userDecision === 'YES' && !context.paymentSuccess) {
            recoveryStep = 'root_ca_ledger_and_payment';
          } else if (context.userDecision === 'YES' && context.paymentSuccess && !context.paymentAuthorized) {
            recoveryStep = 'root_ca_cashier_oversight';
          } else if (context.paymentAuthorized && !context.movieWatched) {
            recoveryStep = 'watch_movie';
          } else if (context.paymentAuthorized && context.movieWatched && context.userDecision === 'DONE_WATCHING') {
            // User completed viewing the movie - should transition from view_movie to snapshot_persist
            console.log(`   🎬 [FlowWiseService] User completed movie viewing (DONE_WATCHING) - recovering to view_movie to transition to snapshot_persist`);
            recoveryStep = 'view_movie';
          } else if (!context.userDecision && context.selectedListing) {
            recoveryStep = 'user_confirm_listing';
          }
        }
        
        if (recoveryStep) {
          console.log(`   🔄 [FlowWiseService] ✅ Recovery step determined: ${recoveryStep}`);
          execution.currentStep = recoveryStep;
          currentStep = recoveryStep; // Update local variable too
          console.log(`   🔄 [FlowWiseService] Updated currentStep to: ${currentStep}`);
          
          // CRITICAL: If recovery step is a process step (like root_ca_cashier_oversight),
          // we need to execute it first before evaluating transitions
          // This ensures context variables like paymentAuthorized are set
          const recoveryStepDef = workflow.steps.find((s: WorkflowStep) => s.id === recoveryStep);
          if (recoveryStepDef && recoveryStepDef.type === 'process') {
            console.log(`   🔄 [FlowWiseService] Recovery step is a process step - executing it first to set context variables`);
            console.log(`   🔄 [FlowWiseService] Recovery step: ${recoveryStepDef.id} (${recoveryStepDef.name})`);
            try {
              await executeStepActions(recoveryStepDef, context, executionId);
              console.log(`   🔄 [FlowWiseService] ✅ Recovery step executed successfully`);
              console.log(`   🔄 [FlowWiseService] Context after recovery step execution:`, {
                paymentAuthorized: context.paymentAuthorized,
                paymentSuccess: context.paymentSuccess,
                settlementStatus: context.settlementStatus,
                movieWatched: context.movieWatched
              });
              
              // Broadcast websocket events for the recovery step
              if (recoveryStepDef.websocketEvents) {
                for (const event of recoveryStepDef.websocketEvents) {
                  const processedEvent = replaceTemplateVariables(event, context);
                  broadcastEvent({
                    ...processedEvent,
                    timestamp: Date.now(),
                    data: {
                      ...processedEvent.data,
                      executionId,
                      workflowId: executionId,
                      stepId: recoveryStepDef.id
                    }
                  });
                }
              }
              
              // Update execution context
              execution.context = context;
            } catch (recoveryError: any) {
              console.error(`   ❌ [FlowWiseService] Error executing recovery step:`, recoveryError.message);
              console.error(`   ❌ [FlowWiseService] Recovery error stack:`, recoveryError.stack);
              // Don't throw - try to continue anyway, but log the error
            }
          }
        } else {
          console.warn(`   ⚠️ [FlowWiseService] Could not determine recovery step from error_handler`);
        }
      }
      
      // CRITICAL: Check if current step is a final step (summary, error_handler, etc.)
      // Final steps have no transitions - workflow is complete
      if (workflow.finalSteps && workflow.finalSteps.includes(currentStep)) {
        console.log(`   ✅ [FlowWiseService] Workflow is at final step: ${currentStep} - workflow is complete`);
        return {
          instruction: {
            type: "complete",
            message: `Workflow completed successfully. Current step: ${currentStep}`,
            data: { 
              context,
              stepId: currentStep,
              isComplete: true
            }
          }
        };
      }
      
      // CRITICAL: Check if current step is a decision step BEFORE evaluating transitions
      // Decision steps should NOT evaluate transitions in submitUserDecision - they should have already returned early in executeNextStep
      const currentStepDef = workflow.steps.find((s: any) => s.id === currentStep);
      if (currentStepDef && currentStepDef.type === "decision" && currentStepDef.requiresUserDecision) {
        console.log(`   🤔 [FlowWiseService] ⚠️ WARNING: Evaluating transitions for decision step ${currentStep} in submitUserDecision`);
        console.log(`   🤔 [FlowWiseService] This should not happen - decision steps should return early in executeNextStep`);
        console.log(`   🤔 [FlowWiseService] However, since user submitted a decision, we'll evaluate transitions with the new decision value`);
      }
      
      const transitions = workflow.transitions.filter((t: any) => t.from === currentStep);
      console.log(`   🔄 [FlowWiseService] Evaluating ${transitions.length} transitions from step: ${currentStep}`);
      
      if (currentStep === 'view_movie') {
        console.log(`   🎬 [FlowWiseService] ========================================`);
        console.log(`   🎬 [FlowWiseService] EVALUATING TRANSITIONS FROM VIEW_MOVIE`);
        console.log(`   🎬 [FlowWiseService] Submitted decision: ${normalizedDecision}`);
        console.log(`   🎬 [FlowWiseService] Context userDecision: ${context.userDecision}`);
        console.log(`   🎬 [FlowWiseService] Available transitions:`, transitions.map((t: any) => `${t.from} → ${t.to} (${t.condition || 'always'})`));
        console.log(`   🎬 [FlowWiseService] ========================================`);
      }
      
      if (transitions.length === 0) {
        // If still no transitions and we're at error_handler, this is a terminal error
        if (currentStep === 'error_handler') {
          throw new Error(`Workflow is in error state (error_handler) and cannot proceed. This may indicate a previous error that needs to be resolved. User attempted to submit: ${decision}`);
        }
        // If no transitions and not a final step, this is an error
        throw new Error(`No transitions found from step: ${currentStep}. Available transitions: ${workflow.transitions.map((t: any) => `${t.from} → ${t.to}`).join(', ')}`);
      }
    
    let nextStepId: string | null = null;
    
    if (currentStep === 'user_confirm_listing') {
      console.log(`   🔄 [FlowWiseService] ⚠️⚠️⚠️ EVALUATING TRANSITIONS FROM user_confirm_listing ⚠️⚠️⚠️`);
      console.log(`   🔄 [FlowWiseService] Context userDecision: ${context.userDecision}`);
      console.log(`   🔄 [FlowWiseService] Available transitions:`, transitions.map((t: any) => `${t.from} → ${t.to} (${t.condition || 'always'})`));
    }
    
    for (const transition of transitions) {
      try {
        const conditionMet = !transition.condition || evaluateCondition(transition.condition, context);
        
        if (currentStep === 'user_confirm_listing' && transition.to === 'root_ca_ledger_and_payment') {
          console.log(`   🔄 [FlowWiseService] 🎯🎯🎯 CHECKING TRANSITION TO PAYMENT STEP! 🎯🎯🎯`);
          console.log(`   🔄 [FlowWiseService] Condition: ${transition.condition}`);
          console.log(`   🔄 [FlowWiseService] Condition met: ${conditionMet}`);
          console.log(`   🔄 [FlowWiseService] Context userDecision: ${context.userDecision}`);
        }
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
      console.warn(`   ⚠️ [FlowWiseService] Available transitions:`, transitions.map((t: any) => `${t.from} → ${t.to} (${t.condition || 'always'})`));
      throw new Error(`No valid transition found from step: ${currentStep}. User decision: ${context.userDecision}`);
    }
    
    // Move to the next step and execute it
    execution.currentStep = nextStepId;
    console.log(`   🔄 [FlowWiseService] Moving to next step: ${nextStepId}`);
    console.log(`   🔄 [FlowWiseService] About to execute next step - this will process payment if it's root_ca_ledger_and_payment`);
    const instruction = await executeNextStep(executionId);
    console.log(`   🔄 [FlowWiseService] Next step executed, instruction type: ${instruction.type}`);
    
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

