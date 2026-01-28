/**
 * FlowWise Action Handlers
 * Maps workflow actions to actual function calls
 */
import type { WorkflowContext } from "./flowwise";
/**
 * Create action handlers map for FlowWise workflows
 */
export declare function createActionHandlers(): Map<string, (action: any, context: WorkflowContext) => Promise<any>>;
//# sourceMappingURL=flowwiseHandlers.d.ts.map