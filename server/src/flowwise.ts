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

  // First, replace template variables in the condition
  // For arrays and objects, we need special handling - they should be evaluated as truthy/falsy
  // For primitives, we can use them directly in comparisons
  let processedCondition = condition;
  
  // Handle special cases where we need to evaluate arrays/objects as truthy
  // Pattern: {{variable}} (without any comparison) should check if variable exists and is truthy
  const simpleExistencePattern = /^\{\{(\w+(?:\.\w+)*)\}\}$/;
  if (simpleExistencePattern.test(condition.trim())) {
    const path = condition.trim().match(simpleExistencePattern)?.[1];
    if (path) {
      const value = getNestedValue(context, path);
      // For arrays, check if it exists and has length > 0
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      // For objects, check if it exists and is not null/undefined
      if (value && typeof value === 'object') {
        return Object.keys(value).length > 0;
      }
      // For primitives, check truthiness
      return !!value;
    }
  }
  
  // Handle negation of simple existence: !{{variable}}
  const negationPattern = /^!\{\{(\w+(?:\.\w+)*)\}\}$/;
  if (negationPattern.test(condition.trim())) {
    const path = condition.trim().match(negationPattern)?.[1];
    if (path) {
      const value = getNestedValue(context, path);
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      if (value && typeof value === 'object') {
        return Object.keys(value).length === 0;
      }
      return !value;
    }
  }
  
  // For conditions with comparisons, replace template variables
  processedCondition = processedCondition.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    const value = getNestedValue(context, path);
    if (value === undefined || value === null) {
      return 'undefined';
    }
    // If value is an array or object, we can't use it directly in string comparisons
    // Instead, we'll use a special marker that we'll handle separately
    if (Array.isArray(value)) {
      return `__ARRAY_LENGTH_${value.length}__`;
    }
    if (typeof value === 'object') {
      return `__OBJECT_KEYS_${Object.keys(value).length}__`;
    }
    // If value is a string, wrap it in quotes for comparison
    if (typeof value === 'string') {
      return `'${value}'`;
    }
    return String(value);
  });
  
  // Replace array length markers with actual numbers for comparison
  processedCondition = processedCondition.replace(/__ARRAY_LENGTH_(\d+)__/g, '$1');
  processedCondition = processedCondition.replace(/__OBJECT_KEYS_(\d+)__/g, '$1');

  // Handle logical operators (&&, ||) FIRST, before comparison operators
  // This ensures proper operator precedence
  if (processedCondition.includes(' && ') || processedCondition.includes(' || ')) {
    // Split by && first, then by ||
    if (processedCondition.includes(' && ')) {
      const parts = processedCondition.split(' && ');
      // For each part, check if it's a simple template variable that needs special handling
      return parts.every(part => {
        const trimmed = part.trim();
        // Check if it's a simple template variable like {{listings}}
        const templateMatch = trimmed.match(/^\{\{(\w+(?:\.\w+)*)\}\}$/);
        if (templateMatch) {
          const path = templateMatch[1];
          const value = getNestedValue(context, path);
          if (Array.isArray(value)) {
            return value.length > 0;
          }
          if (value && typeof value === 'object') {
            return Object.keys(value).length > 0;
          }
          return !!value;
        }
        // Otherwise, recursively evaluate the condition
        return evaluateCondition(trimmed, context);
      });
    }
    
    if (processedCondition.includes(' || ')) {
      const parts = processedCondition.split(' || ');
      return parts.some(part => {
        const trimmed = part.trim();
        const templateMatch = trimmed.match(/^\{\{(\w+(?:\.\w+)*)\}\}$/);
        if (templateMatch) {
          const path = templateMatch[1];
          const value = getNestedValue(context, path);
          if (Array.isArray(value)) {
            return value.length > 0;
          }
          if (value && typeof value === 'object') {
            return Object.keys(value).length > 0;
          }
          return !!value;
        }
        return evaluateCondition(trimmed, context);
      });
    }
  }

  // Handle template syntax {{variable}} (simple existence check)
  const templateMatch = condition.match(/\{\{(\w+(?:\.\w+)*)\}\}/);
  if (templateMatch) {
    const path = templateMatch[1];
    return !!getNestedValue(context, path);
  }

  // Handle negation
  if (processedCondition.startsWith("!")) {
    const rest = processedCondition.substring(1).trim();
    // Check if it's a number (after template replacement)
    if (!isNaN(Number(rest))) {
      return !Number(rest);
    }
    // Check if it's a boolean string
    if (rest === 'true' || rest === 'false') {
      return rest !== 'true';
    }
    // Otherwise try to get from context
    return !getNestedValue(context, rest);
  }
  
  // Handle simple numeric comparisons (>, <, >=, <=)
  if (processedCondition.includes(' > ')) {
    const [left, right] = processedCondition.split(' > ').map(s => s.trim());
    const leftNum = Number(left);
    const rightNum = Number(right);
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      return leftNum > rightNum;
    }
  }
  
  if (processedCondition.includes(' < ')) {
    const [left, right] = processedCondition.split(' < ').map(s => s.trim());
    const leftNum = Number(left);
    const rightNum = Number(right);
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      return leftNum < rightNum;
    }
  }
  
  if (processedCondition.includes(' >= ')) {
    const [left, right] = processedCondition.split(' >= ').map(s => s.trim());
    const leftNum = Number(left);
    const rightNum = Number(right);
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      return leftNum >= rightNum;
    }
  }
  
  if (processedCondition.includes(' <= ')) {
    const [left, right] = processedCondition.split(' <= ').map(s => s.trim());
    const leftNum = Number(left);
    const rightNum = Number(right);
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      return leftNum <= rightNum;
    }
  }
  
  // Check if processedCondition is just a number (after template replacement)
  if (!isNaN(Number(processedCondition.trim()))) {
    return Number(processedCondition.trim()) !== 0;
  }
  
  // Check if it's a boolean string
  if (processedCondition.trim() === 'true') {
    return true;
  }
  if (processedCondition.trim() === 'false') {
    return false;
  }
  
  // Default: check if value exists and is truthy
  return !!getNestedValue(context, processedCondition);
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

