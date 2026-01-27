/**
 * FlowWise Workflow Engine Integration
 * Controls the complete lifecycle of chat interactions including
 * ledger, cashier, LLM, payment, and notification steps
 */

import * as fs from "fs";
import * as path from "path";

export interface WorkflowStep {
  id: string;
  name: string;
  type: "input" | "process" | "output" | "error" | "decision";
  component: string;
  description: string;
  requiresUserDecision?: boolean;
  decisionPrompt?: string;
  decisionOptions?: Array<{
    value: string;
    label: string;
    action: string;
  }>;
  timeout?: number;
  onTimeout?: string;
  actions?: Array<{
    type: string;
    [key: string]: any;
  }>;
  websocketEvents?: Array<{
    type: string;
    component: string;
    message: string;
    data?: any;
  }>;
  outputs?: Record<string, any>;
  conditions?: Array<{
    if: string;
    then: string;
  }>;
  errorHandling?: {
    onError: string;
    errorEvents?: Array<{
      type: string;
      component: string;
      message: string;
    }>;
  };
}

export interface WorkflowTransition {
  from: string;
  to: string;
  condition?: string;
}

export interface FlowWiseWorkflow {
  name: string;
  version: string;
  description: string;
  steps: WorkflowStep[];
  transitions: WorkflowTransition[];
  initialStep: string;
  finalSteps: string[];
}

export interface WorkflowContext {
  [key: string]: any;
}

export interface WorkflowExecution {
  workflowId: string;
  executionId: string; // Unique ID for this execution instance
  currentStep: string;
  context: WorkflowContext;
  history: Array<{
    step: string;
    timestamp: number;
    data?: any;
  }>;
}

// Dependencies that need to be injected
let broadcastEvent: (event: any) => void;
let workflowDataPath: string = path.join(__dirname, "../data");

/**
 * Initialize FlowWise with dependencies
 */
export function initializeFlowWise(
  broadcastFn: (event: any) => void,
  dataPath?: string
): void {
  broadcastEvent = broadcastFn;
  if (dataPath) {
    workflowDataPath = dataPath;
  }
  console.log(`✅ [FlowWise] Initialized with broadcastEvent: ${typeof broadcastEvent === 'function' ? 'OK' : 'MISSING'}`);
  console.log(`✅ [FlowWise] Workflow data path: ${workflowDataPath}`);
}

/**
 * Load workflow definition from JSON file
 * DYNAMIC MAPPING: serviceType → ${serviceType}.json
 * Supports any service type without code changes
 */
export function loadWorkflow(serviceType: string): FlowWiseWorkflow | null {
  try {
    // Dynamic filename mapping: ${serviceType}.json
    const filename = `${serviceType}.json`;
    let filePath = path.join(workflowDataPath, filename);
    
    // Backward compatibility: Check for amc_cinema.json if movie.json doesn't exist
    if (!fs.existsSync(filePath) && serviceType === "movie") {
      const legacyPath = path.join(workflowDataPath, "amc_cinema.json");
      if (fs.existsSync(legacyPath)) {
        console.log(`⚠️ [FlowWise] Using legacy workflow file: amc_cinema.json (consider renaming to movie.json)`);
        filePath = legacyPath;
      }
    }
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ [FlowWise] Workflow file not found: ${filePath}`);
      console.error(`❌ [FlowWise] Expected file: ${filename} in ${workflowDataPath}`);
      return null;
    }
    
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(fileContent);
    
    if (!data.flowwiseWorkflow) {
      console.error(`❌ [FlowWise] No flowwiseWorkflow found in ${filename}`);
      return null;
    }
    
    console.log(`✅ [FlowWise] Loaded workflow: ${data.flowwiseWorkflow.name} (${data.flowwiseWorkflow.version || '1.0.0'})`);
    return data.flowwiseWorkflow;
  } catch (error: any) {
    console.error(`❌ [FlowWise] Error loading workflow:`, error.message);
    return null;
  }
}

// User decision waiting map (executionId -> { stepId, resolve, reject, timeout })
const pendingDecisions = new Map<string, {
  stepId: string;
  resolve: (decision: string) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}>();

/**
 * Wait for user decision
 */
export async function waitForUserDecision(
  executionId: string,
  stepId: string,
  timeout: number = 30000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      pendingDecisions.delete(executionId);
      reject(new Error(`User decision timeout after ${timeout}ms`));
    }, timeout);
    
    pendingDecisions.set(executionId, {
      stepId,
      resolve: (decision: string) => {
        clearTimeout(timeoutHandle);
        pendingDecisions.delete(executionId);
        resolve(decision);
      },
      reject: (error: Error) => {
        clearTimeout(timeoutHandle);
        pendingDecisions.delete(executionId);
        reject(error);
      },
      timeout: timeoutHandle
    });
  });
}

/**
 * Submit user decision
 */
export function submitUserDecision(executionId: string, decision: string): boolean {
  const pending = pendingDecisions.get(executionId);
  if (pending) {
    pending.resolve(decision);
    return true;
  }
  return false;
}

/**
 * Execute a workflow step
 */
async function executeStep(
  step: WorkflowStep,
  context: WorkflowContext,
  actionHandlers: Map<string, (action: any, context: WorkflowContext) => Promise<any>>,
  executionId: string
): Promise<{ success: boolean; outputs?: Record<string, any>; error?: any }> {
  console.log(`🔄 [FlowWise] Executing step: ${step.name} (${step.id})`);
  
  try {
    // Handle user decision steps
    if (step.type === "decision" && step.requiresUserDecision) {
      console.log(`🤔 [FlowWise] Waiting for user decision: ${step.decisionPrompt}`);
      
      // Broadcast decision request
      if (step.websocketEvents && broadcastEvent) {
        for (const event of step.websocketEvents) {
          const eventData = replaceTemplateVariables(event.data || {}, context);
          const eventMessage = replaceTemplateVariables(event.message, context);
          
          // Add executionId to event data for response routing
          eventData.workflowId = executionId;
          eventData.stepId = step.id;
          
          broadcastEvent({
            type: event.type,
            component: event.component,
            message: eventMessage,
            timestamp: Date.now(),
            data: eventData
          });
        }
      }
      
      // Wait for user decision
      const timeout = step.timeout || 30000;
      try {
        const userDecision = await waitForUserDecision(executionId, step.id, timeout);
        console.log(`✅ [FlowWise] User decision received: ${userDecision}`);
        context.userDecision = userDecision;
        
        // Prepare outputs
        const outputs: Record<string, any> = {};
        if (step.outputs) {
          for (const [key, value] of Object.entries(step.outputs)) {
            outputs[key] = replaceTemplateVariables(value, { ...context, userDecision });
          }
        }
        
        return { success: true, outputs };
      } catch (error: any) {
        console.error(`❌ [FlowWise] User decision timeout or error:`, error.message);
        if (step.onTimeout) {
          // Route to timeout handler
          return { success: false, error: { type: "timeout", message: error.message, routeTo: step.onTimeout } };
        }
        return { success: false, error };
      }
    }
    
    // Execute actions for non-decision steps
    if (step.actions) {
      for (const action of step.actions) {
        const handler = actionHandlers.get(action.type);
        if (handler) {
          const result = await handler(action, context);
          // Merge results into context
          Object.assign(context, result || {});
        } else {
          console.warn(`⚠️ [FlowWise] No handler for action type: ${action.type}`);
        }
      }
    }
    
    // Broadcast WebSocket events
    if (step.websocketEvents && broadcastEvent) {
      for (const event of step.websocketEvents) {
        // Replace template variables in event data
        const eventData = replaceTemplateVariables(event.data || {}, context);
        const eventMessage = replaceTemplateVariables(event.message, context);
        
        broadcastEvent({
          type: event.type,
          component: event.component,
          message: eventMessage,
          timestamp: Date.now(),
          data: eventData
        });
      }
    }
    
    // Prepare outputs
    const outputs: Record<string, any> = {};
    if (step.outputs) {
      for (const [key, value] of Object.entries(step.outputs)) {
        outputs[key] = replaceTemplateVariables(value, context);
      }
    }
    
    console.log(`✅ [FlowWise] Step completed: ${step.name}`);
    return { success: true, outputs };
  } catch (error: any) {
    console.error(`❌ [FlowWise] Step failed: ${step.name}`, error);
    return { success: false, error };
  }
}

/**
 * Replace template variables in strings/objects
 */
export function replaceTemplateVariables(template: any, context: WorkflowContext): any {
  if (typeof template === "string") {
    // Check if the entire string is a template variable (e.g., "{{snapshot}}")
    const fullMatch = template.match(/^\{\{(\w+(?:\.\w+)*)\}\}$/);
    if (fullMatch) {
      // If the entire string is a template variable, return the actual value (not stringified)
      const value = getNestedValue(context, fullMatch[1]);
      if (value !== undefined && value !== null) {
        return value; // Return the actual object/value, not stringified
      }
      console.warn(`⚠️  [Template] Variable not found in context: ${fullMatch[1]}`);
      return null;
    }
    // Otherwise, replace template variables within the string
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const value = getNestedValue(context, path);
      if (value !== undefined && value !== null) {
        // For objects/arrays, stringify them; for primitives, convert to string
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value);
      }
      // If template variable not found, return empty string instead of keeping the template
      // This prevents showing "{{variableName}}" in the UI
      console.warn(`⚠️  [Template] Variable not found in context: ${path}`);
      return '';
    });
  } else if (Array.isArray(template)) {
    return template.map(item => replaceTemplateVariables(item, context));
  } else if (template && typeof template === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(template)) {
      result[key] = replaceTemplateVariables(value, context);
    }
    return result;
  }
  return template;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, prop) => current?.[prop], obj);
}

/**
 * Evaluate condition
 */
export function evaluateCondition(condition: string, context: WorkflowContext): boolean {
  // Simple condition evaluation - can be enhanced
  if (condition === "always") return true;

  // CRITICAL: Handle array length checks first (e.g., {{listings.length}} > 0)
  // This must be done before general template replacement
  let workingCondition = condition;
  if (workingCondition.includes('.length')) {
    const lengthMatches = workingCondition.matchAll(/\{\{(\w+(?:\.\w+)*)\.length\}\}/g);
    for (const match of lengthMatches) {
      const arrayPath = match[1];
      const arrayValue = getNestedValue(context, arrayPath);
      const arrayLength = Array.isArray(arrayValue) ? arrayValue.length : (arrayValue?.length || 0);
      
      // Replace {{array.length}} with the actual number
      workingCondition = workingCondition.replace(match[0], String(arrayLength));
      console.log(`   🔍 [evaluateCondition] Replaced ${match[0]} with ${arrayLength}`);
    }
  }

  // First, replace template variables in the condition
  let processedCondition = workingCondition;
  processedCondition = processedCondition.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    const value = getNestedValue(context, path);
    if (value === undefined || value === null) {
      return 'undefined';
    }
    // If value is an array, evaluate as truthy (exists and has length > 0)
    if (Array.isArray(value)) {
      return value.length > 0 ? 'true' : 'false';
    }
    // If value is a string, wrap it in quotes for comparison
    if (typeof value === 'string') {
      return `'${value}'`;
    }
    // For numbers and booleans, convert to string
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    // For objects, check if they exist (truthy)
    return value ? 'true' : 'false';
  });

  // Handle comparison operators (>, <, >=, <=) - must check before ===
  if (processedCondition.includes(' > ')) {
    const [left, right] = processedCondition.split(' > ').map(s => s.trim());
    const leftNum = parseFloat(left.replace(/^['"]|['"]$/g, ''));
    const rightNum = parseFloat(right.replace(/^['"]|['"]$/g, ''));
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      const result = leftNum > rightNum;
      console.log(`   🔍 [evaluateCondition] Comparison: ${leftNum} > ${rightNum} = ${result}`);
      return result;
    }
  }
  
  if (processedCondition.includes(' < ')) {
    const [left, right] = processedCondition.split(' < ').map(s => s.trim());
    const leftNum = parseFloat(left.replace(/^['"]|['"]$/g, ''));
    const rightNum = parseFloat(right.replace(/^['"]|['"]$/g, ''));
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      return leftNum < rightNum;
    }
  }
  
  if (processedCondition.includes(' >= ')) {
    const [left, right] = processedCondition.split(' >= ').map(s => s.trim());
    const leftNum = parseFloat(left.replace(/^['"]|['"]$/g, ''));
    const rightNum = parseFloat(right.replace(/^['"]|['"]$/g, ''));
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      return leftNum >= rightNum;
    }
  }
  
  if (processedCondition.includes(' <= ')) {
    const [left, right] = processedCondition.split(' <= ').map(s => s.trim());
    const leftNum = parseFloat(left.replace(/^['"]|['"]$/g, ''));
    const rightNum = parseFloat(right.replace(/^['"]|['"]$/g, ''));
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      return leftNum <= rightNum;
    }
  }

  // Handle comparison operators (===, !==, ==, !=)
  if (processedCondition.includes(' === ')) {
    const [left, right] = processedCondition.split(' === ').map(s => s.trim());
    // Remove quotes if present (handle both single and double quotes)
    const leftValue = left.replace(/^['"]|['"]$/g, '');
    const rightValue = right.replace(/^['"]|['"]$/g, '');
    const result = leftValue === rightValue;
    console.log(`   🔍 [evaluateCondition] Comparison: "${leftValue}" === "${rightValue}" = ${result}`);
    return result;
  }
  
  if (processedCondition.includes(' !== ')) {
    const [left, right] = processedCondition.split(' !== ').map(s => s.trim());
    const leftValue = left.replace(/^'|'$/g, '');
    const rightValue = right.replace(/^'|'$/g, '');
    return leftValue !== rightValue;
  }

  // Handle boolean string literals (true/false)
  const trimmedProcessed = processedCondition.trim();
  if (trimmedProcessed === 'true') return true;
  if (trimmedProcessed === 'false') return false;

  // Handle logical operators (&&, ||)
  // CRITICAL: Must check for && and || AFTER handling comparison operators
  // because conditions like "2 > 0" need to be evaluated before splitting
  if (processedCondition.includes(' && ')) {
    const parts = processedCondition.split(' && ').map(p => p.trim());
    console.log(`   🔍 [evaluateCondition] Splitting by &&: [${parts.join(', ')}]`);
    // Evaluate each part recursively
    const results = parts.map((part, index) => {
      // If part is a simple boolean string, return it directly
      if (part === 'true') {
        console.log(`   🔍 [evaluateCondition] Part ${index} is 'true' → true`);
        return true;
      }
      if (part === 'false') {
        console.log(`   🔍 [evaluateCondition] Part ${index} is 'false' → false`);
        return false;
      }
      // Otherwise, evaluate recursively
      console.log(`   🔍 [evaluateCondition] Evaluating part ${index} recursively: "${part}"`);
      const result = evaluateCondition(part, context);
      console.log(`   🔍 [evaluateCondition] Part ${index} result: ${result}`);
      return result;
    });
    const finalResult = results.every(r => r === true);
    console.log(`   🔍 [evaluateCondition] && evaluation result: ${finalResult} (all parts: [${results.join(', ')}])`);
    return finalResult;
  }
  
  if (processedCondition.includes(' || ')) {
    const parts = processedCondition.split(' || ').map(p => p.trim());
    console.log(`   🔍 [evaluateCondition] Splitting by ||: [${parts.join(', ')}]`);
    // Evaluate each part recursively
    const results = parts.map((part, index) => {
      // If part is a simple boolean string, return it directly
      if (part === 'true') return true;
      if (part === 'false') return false;
      // Otherwise, evaluate recursively
      return evaluateCondition(part, context);
    });
    const finalResult = results.some(r => r === true);
    console.log(`   🔍 [evaluateCondition] || evaluation result: ${finalResult} (any part: [${results.join(', ')}])`);
    return finalResult;
  }

  // Handle template syntax {{variable}} (simple existence check)
  const templateMatch = condition.match(/\{\{(\w+(?:\.\w+)*)\}\}/);
  if (templateMatch) {
    const path = templateMatch[1];
    return !!getNestedValue(context, path);
  }

  // Handle negation
  if (condition.startsWith("!")) {
    const path = condition.substring(1);
    return !getNestedValue(context, path);
  }
  
  // Default: check if value exists and is truthy
  return !!getNestedValue(context, condition);
}

/**
 * Execute workflow
 */
export async function executeWorkflow(
  workflow: FlowWiseWorkflow,
  initialContext: WorkflowContext,
  actionHandlers: Map<string, (action: any, context: WorkflowContext) => Promise<any>>
): Promise<WorkflowExecution> {
  // Generate unique execution ID for this workflow instance
  const executionId = `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const execution: WorkflowExecution = {
    workflowId: workflow.name,
    executionId: executionId,
    currentStep: workflow.initialStep,
    context: { ...initialContext },
    history: []
  };
  
  console.log(`🚀 [FlowWise] Starting workflow: ${workflow.name}`);
  console.log(`📋 [FlowWise] Initial context:`, Object.keys(execution.context));
  
  let currentStepId = workflow.initialStep;
  const stepMap = new Map<string, WorkflowStep>();
  workflow.steps.forEach(step => stepMap.set(step.id, step));
  
  while (currentStepId) {
    const step = stepMap.get(currentStepId);
    if (!step) {
      console.error(`❌ [FlowWise] Step not found: ${currentStepId}`);
      break;
    }
    
    // Record step start
    execution.history.push({
      step: currentStepId,
      timestamp: Date.now()
    });
    
    // Execute step
    const result = await executeStep(step, execution.context, actionHandlers, execution.executionId);
    
    if (!result.success) {
      // Handle timeout routing
      if (result.error?.routeTo) {
        console.log(`⚠️ [FlowWise] Routing to timeout handler: ${result.error.routeTo}`);
        currentStepId = result.error.routeTo;
        continue;
      }
      
      // Handle error
      if (step.errorHandling) {
        console.log(`⚠️ [FlowWise] Handling error in step: ${currentStepId}`);
        currentStepId = step.errorHandling.onError;
        continue;
      } else {
        console.error(`❌ [FlowWise] Workflow failed at step: ${currentStepId}`);
        break;
      }
    }
    
    // Merge outputs into context
    if (result.outputs) {
      Object.assign(execution.context, result.outputs);
    }
    
    // Find next step
    const transitions = workflow.transitions.filter(t => t.from === currentStepId);
    let nextStepId: string | null = null;
    
    for (const transition of transitions) {
      if (!transition.condition || evaluateCondition(transition.condition, execution.context)) {
        nextStepId = transition.to;
        break;
      }
    }
    
    // Check if we've reached a final step
    if (workflow.finalSteps.includes(currentStepId)) {
      console.log(`✅ [FlowWise] Workflow completed at final step: ${currentStepId}`);
      break;
    }
    
    if (!nextStepId) {
      console.warn(`⚠️ [FlowWise] No valid transition from step: ${currentStepId}`);
      break;
    }
    
    currentStepId = nextStepId;
    execution.currentStep = currentStepId;
  }
  
  console.log(`🏁 [FlowWise] Workflow execution completed: ${workflow.name}`);
  return execution;
}

