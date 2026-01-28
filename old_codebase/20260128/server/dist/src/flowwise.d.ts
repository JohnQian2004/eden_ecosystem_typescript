/**
 * FlowWise Workflow Engine Integration
 * Controls the complete lifecycle of chat interactions including
 * ledger, cashier, LLM, payment, and notification steps
 */
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
    executionId: string;
    currentStep: string;
    context: WorkflowContext;
    history: Array<{
        step: string;
        timestamp: number;
        data?: any;
    }>;
}
/**
 * Initialize FlowWise with dependencies
 */
export declare function initializeFlowWise(broadcastFn: (event: any) => void, dataPath?: string): void;
/**
 * Load workflow definition from JSON file
 * DYNAMIC MAPPING: serviceType → ${serviceType}.json
 * Supports any service type without code changes
 */
export declare function loadWorkflow(serviceType: string): FlowWiseWorkflow | null;
/**
 * Wait for user decision
 */
export declare function waitForUserDecision(executionId: string, stepId: string, timeout?: number): Promise<string>;
/**
 * Submit user decision
 */
export declare function submitUserDecision(executionId: string, decision: string): boolean;
/**
 * Replace template variables in strings/objects
 */
export declare function replaceTemplateVariables(template: any, context: WorkflowContext): any;
/**
 * Evaluate condition
 */
export declare function evaluateCondition(condition: string, context: WorkflowContext): boolean;
/**
 * Execute workflow
 */
export declare function executeWorkflow(workflow: FlowWiseWorkflow, initialContext: WorkflowContext, actionHandlers: Map<string, (action: any, context: WorkflowContext) => Promise<any>>): Promise<WorkflowExecution>;
//# sourceMappingURL=flowwise.d.ts.map