"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var flowwise_exports = {};
__export(flowwise_exports, {
  evaluateCondition: () => evaluateCondition,
  executeWorkflow: () => executeWorkflow,
  initializeFlowWise: () => initializeFlowWise,
  loadWorkflow: () => loadWorkflow,
  replaceTemplateVariables: () => replaceTemplateVariables,
  submitUserDecision: () => submitUserDecision,
  waitForUserDecision: () => waitForUserDecision
});
module.exports = __toCommonJS(flowwise_exports);
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
let broadcastEvent;
let workflowDataPath = path.join(__dirname, "../data");
function initializeFlowWise(broadcastFn, dataPath) {
  broadcastEvent = broadcastFn;
  if (dataPath) {
    workflowDataPath = dataPath;
  }
  console.log(`\u2705 [FlowWise] Initialized with broadcastEvent: ${typeof broadcastEvent === "function" ? "OK" : "MISSING"}`);
  console.log(`\u2705 [FlowWise] Workflow data path: ${workflowDataPath}`);
}
function loadWorkflow(serviceType) {
  try {
    const filename = `${serviceType}.json`;
    let filePath = path.join(workflowDataPath, filename);
    if (!fs.existsSync(filePath) && serviceType === "movie") {
      const legacyPath = path.join(workflowDataPath, "amc_cinema.json");
      if (fs.existsSync(legacyPath)) {
        console.log(`\u26A0\uFE0F [FlowWise] Using legacy workflow file: amc_cinema.json (consider renaming to movie.json)`);
        filePath = legacyPath;
      }
    }
    if (!fs.existsSync(filePath)) {
      console.error(`\u274C [FlowWise] Workflow file not found: ${filePath}`);
      console.error(`\u274C [FlowWise] Expected file: ${filename} in ${workflowDataPath}`);
      return null;
    }
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(fileContent);
    if (!data.flowwiseWorkflow) {
      console.error(`\u274C [FlowWise] No flowwiseWorkflow found in ${filename}`);
      return null;
    }
    console.log(`\u2705 [FlowWise] Loaded workflow: ${data.flowwiseWorkflow.name} (${data.flowwiseWorkflow.version || "1.0.0"})`);
    return data.flowwiseWorkflow;
  } catch (error) {
    console.error(`\u274C [FlowWise] Error loading workflow:`, error.message);
    return null;
  }
}
const pendingDecisions = /* @__PURE__ */ new Map();
async function waitForUserDecision(executionId, stepId, timeout = 3e4) {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      pendingDecisions.delete(executionId);
      reject(new Error(`User decision timeout after ${timeout}ms`));
    }, timeout);
    pendingDecisions.set(executionId, {
      stepId,
      resolve: (decision) => {
        clearTimeout(timeoutHandle);
        pendingDecisions.delete(executionId);
        resolve(decision);
      },
      reject: (error) => {
        clearTimeout(timeoutHandle);
        pendingDecisions.delete(executionId);
        reject(error);
      },
      timeout: timeoutHandle
    });
  });
}
function submitUserDecision(executionId, decision) {
  const pending = pendingDecisions.get(executionId);
  if (pending) {
    pending.resolve(decision);
    return true;
  }
  return false;
}
async function executeStep(step, context, actionHandlers, executionId) {
  console.log(`\u{1F504} [FlowWise] Executing step: ${step.name} (${step.id})`);
  try {
    if (step.type === "decision" && step.requiresUserDecision) {
      console.log(`\u{1F914} [FlowWise] Waiting for user decision: ${step.decisionPrompt}`);
      if (step.websocketEvents && broadcastEvent) {
        for (const event of step.websocketEvents) {
          const eventData = replaceTemplateVariables(event.data || {}, context);
          const eventMessage = replaceTemplateVariables(event.message, context);
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
      const timeout = step.timeout || 3e4;
      try {
        const userDecision = await waitForUserDecision(executionId, step.id, timeout);
        console.log(`\u2705 [FlowWise] User decision received: ${userDecision}`);
        context.userDecision = userDecision;
        const outputs2 = {};
        if (step.outputs) {
          for (const [key, value] of Object.entries(step.outputs)) {
            outputs2[key] = replaceTemplateVariables(value, { ...context, userDecision });
          }
        }
        return { success: true, outputs: outputs2 };
      } catch (error) {
        console.error(`\u274C [FlowWise] User decision timeout or error:`, error.message);
        if (step.onTimeout) {
          return { success: false, error: { type: "timeout", message: error.message, routeTo: step.onTimeout } };
        }
        return { success: false, error };
      }
    }
    if (step.actions) {
      for (const action of step.actions) {
        const handler = actionHandlers.get(action.type);
        if (handler) {
          const result = await handler(action, context);
          Object.assign(context, result || {});
        } else {
          console.warn(`\u26A0\uFE0F [FlowWise] No handler for action type: ${action.type}`);
        }
      }
    }
    if (step.websocketEvents && broadcastEvent) {
      for (const event of step.websocketEvents) {
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
    const outputs = {};
    if (step.outputs) {
      for (const [key, value] of Object.entries(step.outputs)) {
        outputs[key] = replaceTemplateVariables(value, context);
      }
    }
    console.log(`\u2705 [FlowWise] Step completed: ${step.name}`);
    return { success: true, outputs };
  } catch (error) {
    console.error(`\u274C [FlowWise] Step failed: ${step.name}`, error);
    return { success: false, error };
  }
}
function replaceTemplateVariables(template, context) {
  if (typeof template === "string") {
    const fullMatch = template.match(/^\{\{(\w+(?:\.\w+)*)\}\}$/);
    if (fullMatch) {
      const value = getNestedValue(context, fullMatch[1]);
      if (value !== void 0 && value !== null) {
        return value;
      }
      if (fullMatch[1] === "snapshot.feeSplit" && context.snapshot) {
        return {};
      }
      if (fullMatch[1] !== "snapshot.feeSplit") {
        console.warn(`\u26A0\uFE0F  [Template] Variable not found in context: ${fullMatch[1]}`);
      }
      return null;
    }
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path2) => {
      const value = getNestedValue(context, path2);
      if (value !== void 0 && value !== null) {
        if (typeof value === "object") {
          return JSON.stringify(value);
        }
        return String(value);
      }
      if (path2 === "snapshot.feeSplit" && context.snapshot) {
        return "{}";
      }
      if (path2 !== "snapshot.feeSplit") {
        console.warn(`\u26A0\uFE0F  [Template] Variable not found in context: ${path2}`);
      }
      return "";
    });
  } else if (Array.isArray(template)) {
    return template.map((item) => replaceTemplateVariables(item, context));
  } else if (template && typeof template === "object") {
    const result = {};
    for (const [key, value] of Object.entries(template)) {
      result[key] = replaceTemplateVariables(value, context);
    }
    return result;
  }
  return template;
}
function getNestedValue(obj, path2) {
  if (path2 === "snapshot.feeSplit") {
    if (obj?.snapshot) {
      if (obj.snapshot.feeSplit !== void 0 && obj.snapshot.feeSplit !== null) {
        return obj.snapshot.feeSplit;
      }
      return {};
    }
    return void 0;
  }
  const parts = path2.split(".");
  let current = obj;
  for (const prop of parts) {
    if (current === null || current === void 0) {
      return void 0;
    }
    current = current[prop];
  }
  return current;
}
function evaluateCondition(condition, context) {
  if (condition === "always")
    return true;
  let workingCondition = condition;
  if (workingCondition.includes(".length")) {
    const lengthMatches = workingCondition.matchAll(/\{\{(\w+(?:\.\w+)*)\.length\}\}/g);
    for (const match of lengthMatches) {
      const arrayPath = match[1];
      const arrayValue = getNestedValue(context, arrayPath);
      const arrayLength = Array.isArray(arrayValue) ? arrayValue.length : arrayValue?.length || 0;
      workingCondition = workingCondition.replace(match[0], String(arrayLength));
      console.log(`   \u{1F50D} [evaluateCondition] Replaced ${match[0]} with ${arrayLength}`);
    }
  }
  let processedCondition = workingCondition;
  processedCondition = processedCondition.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path2) => {
    const value = getNestedValue(context, path2);
    if (value === void 0 || value === null) {
      return "undefined";
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? "true" : "false";
    }
    if (typeof value === "string") {
      return `'${value}'`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return value ? "true" : "false";
  });
  if (processedCondition.includes(" > ")) {
    const [left, right] = processedCondition.split(" > ").map((s) => s.trim());
    const leftNum = parseFloat(left.replace(/^['"]|['"]$/g, ""));
    const rightNum = parseFloat(right.replace(/^['"]|['"]$/g, ""));
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      const result = leftNum > rightNum;
      console.log(`   \u{1F50D} [evaluateCondition] Comparison: ${leftNum} > ${rightNum} = ${result}`);
      return result;
    }
  }
  if (processedCondition.includes(" < ")) {
    const [left, right] = processedCondition.split(" < ").map((s) => s.trim());
    const leftNum = parseFloat(left.replace(/^['"]|['"]$/g, ""));
    const rightNum = parseFloat(right.replace(/^['"]|['"]$/g, ""));
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      return leftNum < rightNum;
    }
  }
  if (processedCondition.includes(" >= ")) {
    const [left, right] = processedCondition.split(" >= ").map((s) => s.trim());
    const leftNum = parseFloat(left.replace(/^['"]|['"]$/g, ""));
    const rightNum = parseFloat(right.replace(/^['"]|['"]$/g, ""));
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      return leftNum >= rightNum;
    }
  }
  if (processedCondition.includes(" <= ")) {
    const [left, right] = processedCondition.split(" <= ").map((s) => s.trim());
    const leftNum = parseFloat(left.replace(/^['"]|['"]$/g, ""));
    const rightNum = parseFloat(right.replace(/^['"]|['"]$/g, ""));
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      return leftNum <= rightNum;
    }
  }
  if (processedCondition.includes(" === ")) {
    const [left, right] = processedCondition.split(" === ").map((s) => s.trim());
    const leftValue = left.replace(/^['"]|['"]$/g, "");
    const rightValue = right.replace(/^['"]|['"]$/g, "");
    const result = leftValue === rightValue;
    console.log(`   \u{1F50D} [evaluateCondition] Comparison: "${leftValue}" === "${rightValue}" = ${result}`);
    return result;
  }
  if (processedCondition.includes(" !== ")) {
    const [left, right] = processedCondition.split(" !== ").map((s) => s.trim());
    const leftValue = left.replace(/^'|'$/g, "");
    const rightValue = right.replace(/^'|'$/g, "");
    return leftValue !== rightValue;
  }
  const trimmedProcessed = processedCondition.trim();
  if (trimmedProcessed === "true")
    return true;
  if (trimmedProcessed === "false")
    return false;
  if (processedCondition.includes(" && ")) {
    const parts = processedCondition.split(" && ").map((p) => p.trim());
    console.log(`   \u{1F50D} [evaluateCondition] Splitting by &&: [${parts.join(", ")}]`);
    const results = parts.map((part, index) => {
      if (part === "true") {
        console.log(`   \u{1F50D} [evaluateCondition] Part ${index} is 'true' \u2192 true`);
        return true;
      }
      if (part === "false") {
        console.log(`   \u{1F50D} [evaluateCondition] Part ${index} is 'false' \u2192 false`);
        return false;
      }
      console.log(`   \u{1F50D} [evaluateCondition] Evaluating part ${index} recursively: "${part}"`);
      const result = evaluateCondition(part, context);
      console.log(`   \u{1F50D} [evaluateCondition] Part ${index} result: ${result}`);
      return result;
    });
    const finalResult = results.every((r) => r === true);
    console.log(`   \u{1F50D} [evaluateCondition] && evaluation result: ${finalResult} (all parts: [${results.join(", ")}])`);
    return finalResult;
  }
  if (processedCondition.includes(" || ")) {
    const parts = processedCondition.split(" || ").map((p) => p.trim());
    console.log(`   \u{1F50D} [evaluateCondition] Splitting by ||: [${parts.join(", ")}]`);
    const results = parts.map((part, index) => {
      if (part === "true")
        return true;
      if (part === "false")
        return false;
      return evaluateCondition(part, context);
    });
    const finalResult = results.some((r) => r === true);
    console.log(`   \u{1F50D} [evaluateCondition] || evaluation result: ${finalResult} (any part: [${results.join(", ")}])`);
    return finalResult;
  }
  const templateMatch = condition.match(/\{\{(\w+(?:\.\w+)*)\}\}/);
  if (templateMatch) {
    const path2 = templateMatch[1];
    return !!getNestedValue(context, path2);
  }
  if (condition.startsWith("!")) {
    const path2 = condition.substring(1);
    return !getNestedValue(context, path2);
  }
  return !!getNestedValue(context, condition);
}
async function executeWorkflow(workflow, initialContext, actionHandlers) {
  const executionId = `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const execution = {
    workflowId: workflow.name,
    executionId,
    currentStep: workflow.initialStep,
    context: { ...initialContext },
    history: []
  };
  console.log(`\u{1F680} [FlowWise] Starting workflow: ${workflow.name}`);
  console.log(`\u{1F4CB} [FlowWise] Initial context:`, Object.keys(execution.context));
  let currentStepId = workflow.initialStep;
  const stepMap = /* @__PURE__ */ new Map();
  workflow.steps.forEach((step) => stepMap.set(step.id, step));
  while (currentStepId) {
    const step = stepMap.get(currentStepId);
    if (!step) {
      console.error(`\u274C [FlowWise] Step not found: ${currentStepId}`);
      break;
    }
    execution.history.push({
      step: currentStepId,
      timestamp: Date.now()
    });
    const result = await executeStep(step, execution.context, actionHandlers, execution.executionId);
    if (!result.success) {
      if (result.error?.routeTo) {
        console.log(`\u26A0\uFE0F [FlowWise] Routing to timeout handler: ${result.error.routeTo}`);
        currentStepId = result.error.routeTo;
        continue;
      }
      if (step.errorHandling) {
        console.log(`\u26A0\uFE0F [FlowWise] Handling error in step: ${currentStepId}`);
        currentStepId = step.errorHandling.onError;
        continue;
      } else {
        console.error(`\u274C [FlowWise] Workflow failed at step: ${currentStepId}`);
        break;
      }
    }
    if (result.outputs) {
      Object.assign(execution.context, result.outputs);
    }
    const transitions = workflow.transitions.filter((t) => t.from === currentStepId);
    let nextStepId = null;
    for (const transition of transitions) {
      if (!transition.condition || evaluateCondition(transition.condition, execution.context)) {
        nextStepId = transition.to;
        break;
      }
    }
    if (workflow.finalSteps.includes(currentStepId)) {
      console.log(`\u2705 [FlowWise] Workflow completed at final step: ${currentStepId}`);
      break;
    }
    if (!nextStepId) {
      console.warn(`\u26A0\uFE0F [FlowWise] No valid transition from step: ${currentStepId}`);
      break;
    }
    currentStepId = nextStepId;
    execution.currentStep = currentStepId;
  }
  console.log(`\u{1F3C1} [FlowWise] Workflow execution completed: ${workflow.name}`);
  return execution;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  evaluateCondition,
  executeWorkflow,
  initializeFlowWise,
  loadWorkflow,
  replaceTemplateVariables,
  submitUserDecision,
  waitForUserDecision
});
//# sourceMappingURL=flowwise.js.map
