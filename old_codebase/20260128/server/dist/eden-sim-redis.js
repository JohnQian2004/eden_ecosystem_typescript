#!/usr/bin/env ts-node
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
var eden_sim_redis_exports = {};
__export(eden_sim_redis_exports, {
  broadcastEvent: () => broadcastEvent
});
module.exports = __toCommonJS(eden_sim_redis_exports);
var http = __toESM(require("http"));
var https = __toESM(require("https"));
var crypto = __toESM(require("crypto"));
var process = __toESM(require("process"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var url = __toESM(require("url"));
var import_ws = require("ws");
var import_EdenPKI = require("./EdenPKI");
var import_stripe = __toESM(require("stripe"));
var import_redis = require("./src/redis");
var import_config = require("./src/config");
var import_state = require("./src/state");
var import_constants = require("./src/constants");
var import_wallet = require("./src/wallet");
var import_serviceProvider = require("./src/serviceProvider");
var import_serviceRegistry2 = require("./src/serviceRegistry2");
var import_providerPluginRegistry = require("./src/plugins/providerPluginRegistry");
var import_mysql = require("./src/plugins/mysql");
var import_garden = require("./src/garden");
var import_dex = require("./src/dex");
var import_ledger = require("./src/ledger");
var import_llm = require("./src/llm");
var import_flowwise = require("./src/flowwise");
var import_flowwiseService = require("./src/components/flowwiseService");
var import_priceBroadcaster = require("./src/dex/priceBroadcaster");
var import_priesthoodCertification = require("./src/priesthoodCertification");
var import_conversationService = require("./src/messaging/conversationService");
var import_identity = require("./src/identity");
var import_llm2 = require("./src/llm");
var import_logger = require("./src/logger");
var import_serviceTypeFields = require("./src/serviceTypeFields");
const stripe = new import_stripe.default(import_config.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
  // Use compatible API version
});
let httpServer;
if (import_config.ENABLE_HTTPS) {
  if (!fs.existsSync(import_config.SERVER_KEY_PATH) || !fs.existsSync(import_config.SERVER_CERT_PATH)) {
    console.error("\u274C HTTPS enabled but certificates not found!");
    console.error(`   Server key: ${import_config.SERVER_KEY_PATH}`);
    console.error(`   Server cert: ${import_config.SERVER_CERT_PATH}`);
    console.error("\n\u{1F4DD} Please run: node server/scripts/generate-pki-certs.js");
    process.exit(1);
  }
  const serverKey = fs.readFileSync(import_config.SERVER_KEY_PATH, "utf8");
  const serverCert = fs.readFileSync(import_config.SERVER_CERT_PATH, "utf8");
  const caCert = fs.existsSync(import_config.CA_CERT_PATH) ? fs.readFileSync(import_config.CA_CERT_PATH, "utf8") : void 0;
  const httpsOptions = {
    key: serverKey,
    cert: serverCert,
    ca: caCert ? [caCert] : void 0,
    requestCert: false,
    // Don't require client certificates for now
    rejectUnauthorized: false
    // Allow self-signed certificates
  };
  httpServer = https.createServer(httpsOptions);
  console.log("\u{1F510} HTTPS enabled - using SSL/TLS certificates");
} else {
  httpServer = http.createServer();
  console.log("\u{1F310} HTTP mode (HTTPS disabled)");
}
const wss = new import_ws.WebSocketServer({
  server: httpServer,
  path: "/ws"
  // Optional: specific WebSocket path
});
const wsClients = /* @__PURE__ */ new Set();
wss.on("connection", (ws, req) => {
  console.log(`\u{1F50C} WebSocket client connected from ${req.socket.remoteAddress} (${wsClients.size + 1} total)`);
  wsClients.add(ws);
  ws.on("close", () => {
    wsClients.delete(ws);
    console.log(`\u{1F50C} WebSocket client disconnected (${wsClients.size} remaining)`);
  });
  ws.on("error", (error) => {
    console.error("\u274C WebSocket error:", error.message);
  });
  ws.send(JSON.stringify({
    type: "connection",
    component: "websocket",
    message: "Connected to Eden Simulator",
    timestamp: Date.now()
  }));
});
wss.on("error", (error) => {
  console.error("\u274C WebSocketServer error:", error.message);
});
function broadcastEvent(event) {
  const message = JSON.stringify(event);
  const connectedClients = Array.from(wsClients).filter((client) => client.readyState === import_ws.WebSocket.OPEN);
  const eventType = event.type || "unknown";
  const component = event.component || "unknown";
  const timestamp = event.timestamp || Date.now();
  console.log(`\u{1F4E1} [Broadcast] ========================================`);
  console.log(`\u{1F4E1} [Broadcast] Event Type: "${eventType}"`);
  console.log(`\u{1F4E1} [Broadcast] Component: "${component}"`);
  console.log(`\u{1F4E1} [Broadcast] Message: ${event.message || "N/A"}`);
  console.log(`\u{1F4E1} [Broadcast] Timestamp: ${new Date(timestamp).toISOString()}`);
  if (eventType === "ledger_entry_added" || eventType === "ledger_entry_created" || eventType === "cashier_payment_processed" || eventType === "cashier_start") {
    console.log(`\u{1F4E1} [Broadcast] \u2B50 CRITICAL EVENT - LEDGER/CASHIER`);
    console.log(`\u{1F4E1} [Broadcast] Event data:`, JSON.stringify(event.data || {}, null, 2));
  }
  if (eventType.includes("workflow") || eventType.includes("step") || eventType === "user_decision_required" || eventType === "user_selection_required") {
    console.log(`\u{1F4E1} [Broadcast] \u{1F504} WORKFLOW EVENT`);
    if (event.data?.stepId) {
      console.log(`\u{1F4E1} [Broadcast] Step ID: ${event.data.stepId}`);
      console.log(`\u{1F4E1} [Broadcast] Step Name: ${event.data.stepName || "N/A"}`);
    }
    if (event.data?.selectedListing) {
      console.log(`\u{1F4E1} [Broadcast] Selected Listing:`, JSON.stringify(event.data.selectedListing, null, 2));
    }
  }
  if (eventType.includes("movie") || component === "movie_theater") {
    console.log(`\u{1F4E1} [Broadcast] \u{1F3AC} MOVIE EVENT`);
    if (event.data?.movieTitle) {
      console.log(`\u{1F4E1} [Broadcast] Movie Title: ${event.data.movieTitle}`);
    }
    if (event.data?.movieProgress !== void 0) {
      console.log(`\u{1F4E1} [Broadcast] Movie Progress: ${event.data.movieProgress}%`);
    }
  }
  if (connectedClients.length === 0) {
    console.log(`\u{1F4E1} [Broadcast] \u26A0\uFE0F  No WebSocket clients connected, event NOT sent`);
    console.log(`\u{1F4E1} [Broadcast] ========================================`);
    return;
  }
  console.log(`\u{1F4E1} [Broadcast] Sending to ${connectedClients.length} WebSocket client(s)`);
  console.log(`\u{1F4E1} [Broadcast] Message size: ${message.length} bytes`);
  let successCount = 0;
  let failCount = 0;
  connectedClients.forEach((client, index) => {
    try {
      client.send(message);
      successCount++;
      if (eventType === "ledger_entry_added" || eventType === "cashier_payment_processed" || eventType.includes("workflow") || eventType.includes("step")) {
        console.log(`\u{1F4E1} [Broadcast] \u2705 Client ${index + 1}/${connectedClients.length}: Sent "${eventType}"`);
      }
    } catch (err) {
      failCount++;
      console.error(`\u{1F4E1} [Broadcast] \u274C Client ${index + 1}/${connectedClients.length}: Failed to send "${eventType}": ${err.message}`);
    }
  });
  console.log(`\u{1F4E1} [Broadcast] Result: ${successCount} sent, ${failCount} failed`);
  console.log(`\u{1F4E1} [Broadcast] ========================================`);
}
function bigIntReplacer(key, value) {
  if (typeof value === "bigint") {
    if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
      return Number(value);
    } else {
      return value.toString();
    }
  }
  return value;
}
httpServer.on("request", async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`\u{1F4E5} [${requestId}] ${req.method} ${req.url}`);
  const parsedUrl = url.parse(req.url || "/", true);
  const pathname = parsedUrl.pathname || "/";
  if (req.headers.upgrade === "websocket") {
    console.log(`   \u26A1 WebSocket upgrade request, skipping HTTP handler`);
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
  if (req.method === "OPTIONS") {
    console.log(`   \u2705 [${requestId}] OPTIONS request, sending CORS preflight`);
    res.writeHead(200);
    res.end();
    return;
  }
  if (pathname === "/api/workflow/list" && req.method === "GET") {
    console.log(`   \u{1F4CB} [${requestId}] GET /api/workflow/list - Listing available workflows`);
    try {
      const dataPath = path.join(__dirname, "data");
      const workflows = [];
      if (fs.existsSync(dataPath)) {
        const files = fs.readdirSync(dataPath);
        const jsonFiles = files.filter((file) => file.endsWith(".json") && !file.startsWith("."));
        const foundServiceTypes = /* @__PURE__ */ new Set();
        for (const file of jsonFiles) {
          const serviceType = file.replace(".json", "");
          if (serviceType && !foundServiceTypes.has(serviceType)) {
            foundServiceTypes.add(serviceType);
            const filePath2 = path.join(dataPath, file);
            const exists = fs.existsSync(filePath2);
            let stepCount = void 0;
            if (exists) {
              try {
                const fileContent = fs.readFileSync(filePath2, "utf-8");
                const data = JSON.parse(fileContent);
                if (data.flowwiseWorkflow && data.flowwiseWorkflow.steps && Array.isArray(data.flowwiseWorkflow.steps)) {
                  stepCount = data.flowwiseWorkflow.steps.length;
                  console.log(`   \u{1F4CB} [${requestId}] Workflow ${serviceType}: ${file} - ${stepCount} steps`);
                } else {
                  console.log(`   \u26A0\uFE0F [${requestId}] Workflow ${serviceType}: ${file} - exists but no steps found`);
                }
              } catch (parseError) {
                console.error(`   \u26A0\uFE0F [${requestId}] Error parsing workflow ${serviceType}: ${parseError.message}`);
              }
            }
            workflows.push({
              serviceType,
              filename: file,
              exists,
              stepCount
            });
          }
        }
        const knownServiceTypes = [
          "movie",
          "amc",
          "autobodyshop",
          "autorepairshop",
          "bank",
          "church",
          "court",
          "dex",
          "dogpark",
          "gasstation",
          "grocerystore",
          "gym",
          "hospital",
          "hotel",
          "jail",
          "laborcamp",
          "library",
          "pharmacy",
          "policestation",
          "postoffice",
          "priest",
          "restaurant",
          "school",
          "university",
          "airline",
          "autoparts",
          "snake"
        ];
        for (const knownType of knownServiceTypes) {
          if (!foundServiceTypes.has(knownType)) {
            const filename = `${knownType}.json`;
            workflows.push({
              serviceType: knownType,
              filename,
              exists: false,
              stepCount: void 0
            });
          }
        }
        workflows.sort((a, b) => a.serviceType.localeCompare(b.serviceType));
        console.log(`   \u{1F4CB} [${requestId}] Found ${workflows.filter((w) => w.exists).length} existing workflows out of ${workflows.length} total`);
      } else {
        console.warn(`   \u26A0\uFE0F [${requestId}] Data directory does not exist: ${dataPath}`);
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: true,
        workflows
      }));
    } catch (error) {
      console.error(`   \u274C [${requestId}] Error listing workflows:`, error.message);
      res.writeHead(500, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
    return;
  }
  if (pathname.startsWith("/api/workflow/") && req.method === "GET" && pathname !== "/api/workflow/decision" && pathname !== "/api/workflow/list") {
    const serviceType = pathname.split("/").pop();
    console.log(`   \u{1F4CB} [${requestId}] GET /api/workflow/${serviceType} - Loading workflow definition`);
    console.log(`   \u{1F50D} [${requestId}] Service type from URL: "${serviceType}"`);
    console.log(`   \u{1F50D} [${requestId}] Full pathname: "${pathname}"`);
    if (!serviceType) {
      res.writeHead(400, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: false,
        error: "Service type is required"
      }));
      return;
    }
    try {
      const workflow2 = (0, import_flowwise.loadWorkflow)(serviceType);
      console.log(`   \u{1F504} [${requestId}] Workflow loaded: ${workflow2 ? "SUCCESS" : "FAILED"} - ${workflow2?.name || "N/A"}`);
      if (workflow2) {
        console.log(`   \u{1F50D} [${requestId}] Workflow name: "${workflow2.name}"`);
        console.log(`   \u{1F50D} [${requestId}] Workflow serviceType check: First step serviceType = "${workflow2.steps[0]?.actions?.find((a) => a.serviceType)?.serviceType || "N/A"}"`);
      }
      if (workflow2) {
        const responseData = {
          success: true,
          flowwiseWorkflow: workflow2
        };
        console.log(`   \u2705 [${requestId}] Sending workflow response with ${workflow2.steps.length} steps`);
        console.log(`   \u{1F4E4} [${requestId}] Response: 200 OK (workflow definition)`);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(JSON.stringify(responseData));
      } else {
        console.log(`   \u274C [${requestId}] Workflow not found for service type: ${serviceType}`);
        res.writeHead(404, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(JSON.stringify({
          success: false,
          error: `Workflow not found for service type: ${serviceType}`
        }));
      }
    } catch (error) {
      console.error(`   \u274C [${requestId}] Error loading workflow:`, error.message);
      console.error(`   \u274C [${requestId}] Stack trace:`, error.stack);
      res.writeHead(500, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
    return;
  }
  if (pathname.startsWith("/api/workflow/pending-decision/") && req.method === "GET") {
    const email = decodeURIComponent(pathname.split("/").pop() || "");
    console.log(`   \u{1F914} [${requestId}] GET /api/workflow/pending-decision/${email} - Checking for pending decisions`);
    try {
      if (!global.workflowExecutions) {
        global.workflowExecutions = /* @__PURE__ */ new Map();
      }
      const workflowExecutions = global.workflowExecutions;
      const pendingExecutions = [];
      for (const [executionId2, execution] of workflowExecutions.entries()) {
        if (execution.context?.user?.email === email || execution.userEmail === email) {
          const currentStep = execution.workflow?.steps?.find((s) => s.id === execution.currentStep);
          if (currentStep?.type === "decision" && currentStep?.requiresUserDecision) {
            pendingExecutions.push({
              executionId: execution.executionId,
              stepId: execution.currentStep,
              stepName: currentStep.name,
              prompt: currentStep.decisionPrompt,
              options: currentStep.decisionOptions || []
            });
          }
        }
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: true,
        hasPendingDecision: pendingExecutions.length > 0,
        pendingExecutions
      }));
    } catch (error) {
      console.error(`   \u274C [${requestId}] Error checking pending decisions:`, error.message);
      res.writeHead(500, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
    return;
  }
  if (pathname === "/api/igas/total" && req.method === "GET") {
    console.log(`   \u26FD [${requestId}] GET /api/igas/total - Fetching total iGas`);
    let totalIGas = 0;
    try {
      const { getAccountantState } = await import("./src/accountant");
      totalIGas = getAccountantState().totalIGas || 0;
    } catch (err) {
      console.warn(`\u26A0\uFE0F  [${requestId}] Failed to load Accountant totalIGas, falling back to TOTAL_IGAS: ${err.message}`);
      totalIGas = (0, import_state.getTOTAL_IGAS)() || 0;
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify({
      success: true,
      totalIGas,
      timestamp: Date.now()
    }));
    return;
  }
  if (pathname === "/api/liquidity-accountant/summary" && req.method === "GET") {
    console.log(`   \u{1F4A7} [${requestId}] GET /api/liquidity-accountant/summary - Fetching liquidity summary`);
    try {
      const { getLiquiditySummary } = await import("./src/liquidityAccountant");
      const summary = getLiquiditySummary();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, summary }));
    } catch (err) {
      console.error(`   \u274C Error fetching liquidity summary:`, err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname.startsWith("/api/liquidity-accountant/pool/") && req.method === "GET") {
    const poolId = pathname.split("/").pop();
    console.log(`   \u{1F4A7} [${requestId}] GET /api/liquidity-accountant/pool/${poolId} - Fetching liquidity record`);
    try {
      const { getLiquidityRecord } = await import("./src/liquidityAccountant");
      const record = getLiquidityRecord(poolId || "");
      if (record) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, record }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Liquidity record not found" }));
      }
    } catch (err) {
      console.error(`   \u274C Error fetching liquidity record:`, err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname.startsWith("/api/liquidity-accountant/garden/") && req.method === "GET") {
    const gardenId = pathname.split("/").pop();
    console.log(`   \u{1F4A7} [${requestId}] GET /api/liquidity-accountant/garden/${gardenId} - Fetching liquidity records`);
    try {
      const { getLiquidityRecordsByGarden } = await import("./src/liquidityAccountant");
      const records = getLiquidityRecordsByGarden(gardenId || "");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, records }));
    } catch (err) {
      console.error(`   \u274C Error fetching garden liquidity records:`, err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname === "/api/accountant/summary" && req.method === "GET") {
    console.log(`   \u{1F4CA} [${requestId}] GET /api/accountant/summary - Fetching financial summary`);
    try {
      const { getFinancialSummary } = await import("./src/accountant");
      const summary = getFinancialSummary();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: true,
        ...summary,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error(`   \u274C [${requestId}] Error fetching accountant summary:`, error.message);
      res.writeHead(500, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
    return;
  }
  if (pathname === "/api/workflow/action" && req.method === "POST") {
    console.log(`   \u2699\uFE0F [${requestId}] POST /api/workflow/action - Workflow action execution`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      const sendResponse = (statusCode, data) => {
        if (!res.headersSent) {
          console.log(`   \u{1F4E4} [${requestId}] Response: ${statusCode} ${statusCode === 200 ? "OK" : "ERROR"} (${JSON.stringify(data).length} bytes)`);
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        }
      };
      try {
        const parsedBody = JSON.parse(body);
        const { executionId: executionId2, action, context } = parsedBody;
        if (!executionId2 || !action) {
          sendResponse(400, { success: false, error: "executionId and action are required" });
          return;
        }
        console.log(`   \u{1F504} [${requestId}] Executing action ${action.type} in execution ${executionId2}`);
        let result = {
          actionExecuted: action.type,
          timestamp: Date.now()
        };
        try {
          switch (action.type) {
            case "check_balance":
              const userEmail = action.email || context?.user?.email;
              const requiredAmount = action.required || context?.totalCost || action.amount;
              if (!userEmail || !requiredAmount) {
                throw new Error("Missing user email or amount for balance check");
              }
              const balance = (0, import_wallet.getWalletBalance)(userEmail);
              const hasBalance = balance >= requiredAmount;
              result = {
                ...result,
                balanceChecked: true,
                userEmail,
                requiredAmount,
                currentBalance: balance,
                sufficientFunds: hasBalance
              };
              break;
            case "process_payment":
              const paymentUser = action.user || context?.user;
              const paymentAmount = action.amount || context?.totalCost || context?.moviePrice;
              const ledgerEntry = action.ledgerEntry || context?.ledgerEntry;
              if (!paymentUser?.email || !paymentAmount || !ledgerEntry) {
                throw new Error("Missing payment details");
              }
              const debitResult = (0, import_wallet.debitWallet)(paymentUser.email, paymentAmount);
              if (!debitResult.success) {
                throw new Error(`Payment failed: ${debitResult.error}`);
              }
              const paymentResult = processPayment(ledgerEntry, paymentUser);
              result = {
                ...result,
                paymentProcessed: true,
                paymentSuccess: true,
                amount: paymentAmount,
                newBalance: debitResult.newBalance,
                ledgerEntry: paymentResult
              };
              break;
            case "complete_booking":
              const bookingEntry = action.ledgerEntry || context?.ledgerEntry;
              if (!bookingEntry) {
                throw new Error("Missing ledger entry for booking completion");
              }
              const bookingResult = completeBooking(bookingEntry);
              result = {
                ...result,
                bookingCompleted: true,
                bookingResult
              };
              break;
            default:
              console.log(`   \u2699\uFE0F [${requestId}] Action ${action.type} acknowledged (no specific handler)`);
          }
          sendResponse(200, {
            success: true,
            message: `Action ${action.type} executed successfully`,
            result
          });
        } catch (actionError) {
          console.error(`   \u274C [${requestId}] Action execution error for ${action.type}:`, actionError.message);
          sendResponse(500, {
            success: false,
            error: `Action ${action.type} failed: ${actionError.message}`,
            result: {
              actionExecuted: action.type,
              success: false,
              error: actionError.message,
              timestamp: Date.now()
            }
          });
        }
      } catch (error) {
        console.error(`   \u274C [${requestId}] Error executing workflow action:`, error.message);
        sendResponse(500, { success: false, error: error.message });
      }
    });
    return;
  }
  if (pathname === "/api/workflow/execute-step" && req.method === "POST") {
    console.log(`   \u25B6\uFE0F [${requestId}] POST /api/workflow/execute-step - Atomic step execution`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      const sendResponse = (statusCode, data) => {
        if (!res.headersSent) {
          console.log(`   \u{1F4E4} [${requestId}] Response: ${statusCode} ${statusCode === 200 ? "OK" : "ERROR"} (${JSON.stringify(data).length} bytes)`);
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        }
      };
      try {
        const parsedBody = JSON.parse(body);
        const { executionId: executionId2, stepId: stepId2, context, serviceType } = parsedBody;
        if (!executionId2 || !stepId2 || !serviceType) {
          sendResponse(400, { success: false, error: "executionId, stepId, and serviceType are required" });
          return;
        }
        console.log(`   \u{1F504} [${requestId}] Executing step ${stepId2} atomically for ${serviceType} workflow`);
        const { replaceTemplateVariables: replaceTemplateVariables2 } = await import("./src/flowwise");
        const workflow2 = (0, import_flowwise.loadWorkflow)(serviceType);
        if (!workflow2) {
          sendResponse(400, { success: false, error: "Invalid workflow definition" });
          return;
        }
        const step2 = workflow2.steps.find((s) => s.id === stepId2);
        if (!step2) {
          sendResponse(404, { success: false, error: `Step not found: ${stepId2}` });
          return;
        }
        console.log(`   \u2699\uFE0F [${requestId}] ========================================`);
        console.log(`   \u2699\uFE0F [${requestId}] \u{1F680} EXECUTE-STEP ENDPOINT: STEP EXECUTION START`);
        console.log(`   \u2699\uFE0F [${requestId}] Step ID: ${stepId2}`);
        console.log(`   \u2699\uFE0F [${requestId}] Step Name: ${step2.name}`);
        console.log(`   \u2699\uFE0F [${requestId}] Step Type: ${step2.type}`);
        console.log(`   \u2699\uFE0F [${requestId}] Step Component: ${step2.component}`);
        console.log(`   \u2699\uFE0F [${requestId}] Actions Count: ${step2.actions?.length || 0}`);
        if (step2.actions) {
          console.log(`   \u2699\uFE0F [${requestId}] Action Types:`, step2.actions.map((a) => a.type));
        }
        console.log(`   \u2699\uFE0F [${requestId}] ========================================`);
        const updatedContext2 = { ...context };
        console.log(`   \u{1F50D} [${requestId}] ========================================`);
        console.log(`   \u{1F50D} [${requestId}] CONTEXT INITIALIZATION FOR STEP: ${stepId2}`);
        console.log(`   \u{1F50D} [${requestId}] ========================================`);
        console.log(`   \u{1F50D} [${requestId}] Request context keys:`, Object.keys(context || {}));
        console.log(`   \u{1F50D} [${requestId}] Request context has listings: ${!!context?.listings} (${context?.listings?.length || 0})`);
        console.log(`   \u{1F50D} [${requestId}] Request context listings type: ${typeof context?.listings}`);
        console.log(`   \u{1F50D} [${requestId}] Request context listings is array: ${Array.isArray(context?.listings)}`);
        if (context?.listings && Array.isArray(context.listings) && context.listings.length > 0) {
          console.log(`   \u{1F50D} [${requestId}] First listing keys:`, Object.keys(context.listings[0]));
          console.log(`   \u{1F50D} [${requestId}] First listing:`, JSON.stringify(context.listings[0], null, 2).substring(0, 500));
        }
        console.log(`   \u{1F50D} [${requestId}] Request context has llmResponse: ${!!context?.llmResponse}`);
        console.log(`   \u{1F50D} [${requestId}] Request context llmResponse keys:`, context?.llmResponse ? Object.keys(context.llmResponse) : "N/A");
        console.log(`   \u{1F50D} [${requestId}] Request context llmResponse has listings: ${!!context?.llmResponse?.listings} (${context?.llmResponse?.listings?.length || 0})`);
        if (context?.llmResponse?.listings && Array.isArray(context.llmResponse.listings) && context.llmResponse.listings.length > 0) {
          console.log(`   \u{1F50D} [${requestId}] llmResponse first listing keys:`, Object.keys(context.llmResponse.listings[0]));
        }
        console.log(`   \u{1F50D} [${requestId}] Final updatedContext has listings: ${!!updatedContext2.listings} (${updatedContext2.listings?.length || 0})`);
        console.log(`   \u{1F50D} [${requestId}] ========================================`);
        if ((!updatedContext2.listings || updatedContext2.listings.length === 0) && updatedContext2.llmResponse?.listings && Array.isArray(updatedContext2.llmResponse.listings) && updatedContext2.llmResponse.listings.length > 0) {
          updatedContext2.listings = updatedContext2.llmResponse.listings;
          console.log(`   \u{1F504} [${requestId}] \u2705 Using listings from llmResponse (${updatedContext2.llmResponse.listings.length} listings)`);
        } else if (!updatedContext2.listings || updatedContext2.listings.length === 0) {
          console.warn(`   \u26A0\uFE0F [${requestId}] \u26A0\uFE0F NO LISTINGS FOUND in context or llmResponse!`);
          console.warn(`   \u26A0\uFE0F [${requestId}] This will cause empty options array for user_select_listing step`);
        }
        if (stepId2 === "error_handler") {
          console.log(`   \u{1F50D} [${requestId}] ========================================`);
          console.log(`   \u{1F50D} [${requestId}] ERROR_HANDLER STEP EXECUTING`);
          console.log(`   \u{1F50D} [${requestId}] Initial context has error:`, !!updatedContext2.error);
          console.log(`   \u{1F50D} [${requestId}] Initial context error value:`, updatedContext2.error);
          if (!updatedContext2.error) {
            console.log(`   \u26A0\uFE0F [${requestId}] error_handler step executing but error not in context, checking execution state`);
            if (!global.workflowExecutions) {
              global.workflowExecutions = /* @__PURE__ */ new Map();
            }
            const workflowExecutions = global.workflowExecutions;
            const existingExecution2 = workflowExecutions.get(executionId2);
            console.log(`   \u{1F50D} [${requestId}] Existing execution found:`, !!existingExecution2);
            if (existingExecution2) {
              console.log(`   \u{1F50D} [${requestId}] Existing execution context keys:`, Object.keys(existingExecution2.context || {}));
              console.log(`   \u{1F50D} [${requestId}] Existing execution context has error:`, !!existingExecution2.context?.error);
              console.log(`   \u{1F50D} [${requestId}] Existing execution context error:`, existingExecution2.context?.error);
            }
            if (existingExecution2 && existingExecution2.context && existingExecution2.context.error) {
              console.log(`   \u2705 [${requestId}] Found error in existing execution context, copying to updatedContext`);
              updatedContext2.error = existingExecution2.context.error;
              console.log(`   \u2705 [${requestId}] Error copied:`, JSON.stringify(updatedContext2.error, null, 2));
            } else {
              console.warn(`   \u26A0\uFE0F [${requestId}] No error found in execution context for error_handler step`);
              console.warn(`   \u26A0\uFE0F [${requestId}] This means the error_handler step was called without a previous error`);
              const stepsWithErrorHandling = workflow2.steps.filter((s) => s.errorHandling && s.errorHandling.onError === "error_handler");
              console.log(`   \u{1F50D} [${requestId}] Steps with errorHandling pointing to error_handler:`, stepsWithErrorHandling.map((s) => s.id));
              updatedContext2.error = {
                component: "unknown",
                message: "Unknown error occurred - error_handler step executed without error context",
                stepId: "unknown",
                stepName: "Unknown Step",
                error: "Unknown error occurred - error_handler step executed without error context"
              };
            }
          } else {
            console.log(`   \u2705 [${requestId}] Error object already in context:`, JSON.stringify(updatedContext2.error, null, 2));
          }
          console.log(`   \u{1F50D} [${requestId}] Final context error:`, JSON.stringify(updatedContext2.error, null, 2));
          console.log(`   \u{1F50D} [${requestId}] ========================================`);
        }
        if (updatedContext2.selectedListing && updatedContext2.selectedListing.price) {
          const currentServiceType = updatedContext2.serviceType || serviceType || "movie";
          if (currentServiceType === "hotel") {
            updatedContext2.hotelPrice = updatedContext2.selectedListing.price;
          } else if (currentServiceType === "movie") {
            updatedContext2.moviePrice = updatedContext2.selectedListing.price;
          } else if (currentServiceType === "airline") {
            updatedContext2.airlinePrice = updatedContext2.selectedListing.price;
          } else if (currentServiceType === "restaurant") {
            updatedContext2.restaurantPrice = updatedContext2.selectedListing.price;
          } else if (currentServiceType === "grocerystore") {
            updatedContext2.grocerystorePrice = updatedContext2.selectedListing.price;
          } else if (currentServiceType === "pharmacy") {
            updatedContext2.pharmacyPrice = updatedContext2.selectedListing.price;
          } else if (currentServiceType === "dogpark") {
            updatedContext2.dogparkPrice = updatedContext2.selectedListing.price;
          } else if (currentServiceType === "gasstation") {
            updatedContext2.gasstationPrice = updatedContext2.selectedListing.price;
          } else if (currentServiceType === "party") {
            updatedContext2.partyPrice = updatedContext2.selectedListing.price;
          } else if (currentServiceType === "bank") {
            updatedContext2.bankPrice = updatedContext2.selectedListing.price;
          }
          updatedContext2.totalCost = updatedContext2.selectedListing.price;
        }
        if (!updatedContext2.cashier && (step2.component === "cashier" || step2.id === "cashier_process_payment")) {
          updatedContext2.cashier = (0, import_ledger.getCashierStatus)();
          console.log(`   \u{1F4B0} [${requestId}] ========================================`);
          console.log(`   \u{1F4B0} [${requestId}] \u{1F4B0} CASHIER INITIALIZED IN CONTEXT`);
          console.log(`   \u{1F4B0} [${requestId}] Step ID: ${step2.id}`);
          console.log(`   \u{1F4B0} [${requestId}] Cashier:`, {
            id: updatedContext2.cashier.id,
            name: updatedContext2.cashier.name,
            processedCount: updatedContext2.cashier.processedCount,
            totalProcessed: updatedContext2.cashier.totalProcessed
          });
          console.log(`   \u{1F4B0} [${requestId}] ========================================`);
        }
        const executedActions = [];
        const events2 = [];
        if (step2.type === "decision" && step2.requiresUserDecision) {
          console.log(`   \u{1F914} [${requestId}] ========================================`);
          console.log(`   \u{1F914} [${requestId}] DECISION STEP DETECTED: ${step2.id}`);
          console.log(`   \u{1F914} [${requestId}] Step name: ${step2.name}`);
          console.log(`   \u{1F914} [${requestId}] Step type: ${step2.type}`);
          console.log(`   \u{1F914} [${requestId}] requiresUserDecision: ${step2.requiresUserDecision}`);
          console.log(`   \u{1F914} [${requestId}] Has websocketEvents: ${!!step2.websocketEvents}`);
          console.log(`   \u{1F914} [${requestId}] websocketEvents count: ${step2.websocketEvents?.length || 0}`);
          console.log(`   \u{1F914} [${requestId}] updatedContext keys:`, Object.keys(updatedContext2));
          console.log(`   \u{1F914} [${requestId}] ========================================`);
          if (step2.id === "user_select_listing" && (!updatedContext2.listings || updatedContext2.listings.length === 0)) {
            if (updatedContext2.llmResponse?.listings && Array.isArray(updatedContext2.llmResponse.listings) && updatedContext2.llmResponse.listings.length > 0) {
              updatedContext2.listings = updatedContext2.llmResponse.listings;
              console.log(`   \u{1F504} [${requestId}] Populated updatedContext.listings from llmResponse (${updatedContext2.llmResponse.listings.length} listings)`);
            } else {
              console.warn(`   \u26A0\uFE0F [${requestId}] No listings found in updatedContext or llmResponse for user_select_listing step`);
              console.warn(`   \u26A0\uFE0F [${requestId}] updatedContext keys:`, Object.keys(updatedContext2));
              console.warn(`   \u26A0\uFE0F [${requestId}] updatedContext.llmResponse:`, updatedContext2.llmResponse ? Object.keys(updatedContext2.llmResponse) : "N/A");
            }
          }
          if (step2.websocketEvents) {
            for (const event of step2.websocketEvents) {
              const processedEvent = replaceTemplateVariables2(event, updatedContext2);
              events2.push(processedEvent);
              processedEvent.data = {
                ...processedEvent.data,
                workflowId: executionId2,
                stepId: step2.id
              };
              console.log(`   \u{1F50D} [${requestId}] ========================================`);
              console.log(`   \u{1F50D} [${requestId}] BUILDING OPTIONS FOR user_select_listing`);
              console.log(`   \u{1F50D} [${requestId}] ========================================`);
              console.log(`   \u{1F50D} [${requestId}] Step ID: ${step2.id}`);
              console.log(`   \u{1F50D} [${requestId}] Step ID matches "user_select_listing": ${step2.id === "user_select_listing"}`);
              console.log(`   \u{1F50D} [${requestId}] FULL updatedContext DUMP:`);
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext keys:`, Object.keys(updatedContext2));
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext.listings:`, updatedContext2.listings);
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext.listings exists: ${!!updatedContext2.listings}`);
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext.listings type: ${typeof updatedContext2.listings}`);
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext.listings is array: ${Array.isArray(updatedContext2.listings)}`);
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext.listings length: ${updatedContext2.listings?.length || 0}`);
              if (updatedContext2.listings && Array.isArray(updatedContext2.listings) && updatedContext2.listings.length > 0) {
                console.log(`   \u{1F50D} [${requestId}]   - First listing:`, JSON.stringify(updatedContext2.listings[0], null, 2));
              }
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext.llmResponse:`, updatedContext2.llmResponse ? "EXISTS" : "MISSING");
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext.llmResponse?.listings:`, updatedContext2.llmResponse?.listings);
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext.llmResponse?.listings length: ${updatedContext2.llmResponse?.listings?.length || 0}`);
              if (updatedContext2.llmResponse?.listings && Array.isArray(updatedContext2.llmResponse.listings) && updatedContext2.llmResponse.listings.length > 0) {
                console.log(`   \u{1F50D} [${requestId}]   - First llmResponse listing:`, JSON.stringify(updatedContext2.llmResponse.listings[0], null, 2));
              }
              console.log(`   \u{1F50D} [${requestId}] TEMPLATE REPLACEMENT RESULT:`);
              console.log(`   \u{1F50D} [${requestId}]   - Original event.data.options:`, event.data?.options);
              console.log(`   \u{1F50D} [${requestId}]   - processedEvent.data.options:`, processedEvent.data?.options);
              console.log(`   \u{1F50D} [${requestId}]   - processedEvent.data.options type:`, typeof processedEvent.data?.options);
              console.log(`   \u{1F50D} [${requestId}]   - processedEvent.data.options is array:`, Array.isArray(processedEvent.data?.options));
              console.log(`   \u{1F50D} [${requestId}]   - processedEvent.data.options length: ${Array.isArray(processedEvent.data?.options) ? processedEvent.data.options.length : "N/A"}`);
              if (processedEvent.data?.options && Array.isArray(processedEvent.data.options) && processedEvent.data.options.length > 0) {
                console.log(`   \u{1F50D} [${requestId}]   - First option from template:`, JSON.stringify(processedEvent.data.options[0], null, 2));
              }
              console.log(`   \u{1F50D} [${requestId}] ========================================`);
              const listingsFromContext = updatedContext2.listings;
              const listingsFromLlmResponse = updatedContext2.llmResponse?.listings;
              const listingsFromEvent = Array.isArray(processedEvent.data?.options) ? processedEvent.data.options : null;
              let listingsFromSelectedListing2 = null;
              if (updatedContext2.selectedListing2 && Array.isArray(updatedContext2.selectedListing2)) {
                listingsFromSelectedListing2 = updatedContext2.selectedListing2;
                console.log(`   \u{1F50D} [${requestId}] selectedListing2 is an array with ${listingsFromSelectedListing2.length} items`);
              } else if (updatedContext2.llmResponse?.selectedListing2 && Array.isArray(updatedContext2.llmResponse.selectedListing2)) {
                listingsFromSelectedListing2 = updatedContext2.llmResponse.selectedListing2;
                console.log(`   \u{1F50D} [${requestId}] llmResponse.selectedListing2 is an array with ${listingsFromSelectedListing2.length} items`);
              } else if (updatedContext2.selectedListing2 || updatedContext2.llmResponse?.selectedListing2) {
                const singleListing = updatedContext2.selectedListing2 || updatedContext2.llmResponse?.selectedListing2;
                listingsFromSelectedListing2 = [singleListing];
                console.log(`   \u{1F50D} [${requestId}] selectedListing2 is a single listing, creating array with 1 item`);
              }
              let listingsSource = null;
              if (listingsFromSelectedListing2 && listingsFromSelectedListing2.length > 0) {
                listingsSource = listingsFromSelectedListing2;
                console.log(`   \u2705 [${requestId}] Using listingsFromSelectedListing2 (${listingsSource.length} items)`);
              } else if (listingsFromContext && listingsFromContext.length > 0) {
                listingsSource = listingsFromContext;
                console.log(`   \u2705 [${requestId}] Using listingsFromContext (${listingsSource.length} items)`);
              } else if (listingsFromLlmResponse && listingsFromLlmResponse.length > 0) {
                listingsSource = listingsFromLlmResponse;
                console.log(`   \u2705 [${requestId}] Using listingsFromLlmResponse (${listingsSource.length} items)`);
              } else if (listingsFromEvent && listingsFromEvent.length > 0) {
                listingsSource = listingsFromEvent;
                console.log(`   \u2705 [${requestId}] Using listingsFromEvent (${listingsSource.length} items)`);
              }
              if (!listingsSource && processedEvent.data?.options === null) {
                console.log(`   \u26A0\uFE0F [${requestId}] Template replacement returned null for "{{listings}}", checking context directly`);
                if (listingsFromSelectedListing2 && listingsFromSelectedListing2.length > 0) {
                  listingsSource = listingsFromSelectedListing2;
                  console.log(`   \u2705 [${requestId}] Fallback: Using listingsFromSelectedListing2 (${listingsSource.length} items)`);
                } else if (updatedContext2.listings && updatedContext2.listings.length > 0) {
                  listingsSource = updatedContext2.listings;
                  console.log(`   \u2705 [${requestId}] Fallback: Using updatedContext.listings (${listingsSource.length} items)`);
                } else if (updatedContext2.llmResponse?.listings && updatedContext2.llmResponse.listings.length > 0) {
                  listingsSource = updatedContext2.llmResponse.listings;
                  console.log(`   \u2705 [${requestId}] Fallback: Using updatedContext.llmResponse.listings (${listingsSource.length} items)`);
                }
              }
              console.log(`   \u{1F50D} [${requestId}] Listing sources check:`);
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext.listings: ${listingsFromContext?.length || 0} (${listingsFromContext ? "EXISTS" : "MISSING"})`);
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext.llmResponse?.listings: ${listingsFromLlmResponse?.length || 0} (${listingsFromLlmResponse ? "EXISTS" : "MISSING"})`);
              console.log(`


`);
              console.log(`\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
              console.log(`\u2551         \u{1F50D}\u{1F50D}\u{1F50D} selectedListing2 IN user_select_listing DEBUG \u{1F50D}\u{1F50D}\u{1F50D}              \u2551`);
              console.log(`\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`);
              console.log(`[${requestId}] ========================================`);
              console.log(`[${requestId}] selectedListing2 IN user_select_listing STEP:`);
              console.log(`[${requestId}]   - updatedContext.selectedListing2:`, updatedContext2.selectedListing2 ? Array.isArray(updatedContext2.selectedListing2) ? `ARRAY[${updatedContext2.selectedListing2.length}]` : "OBJECT" : "MISSING");
              if (updatedContext2.selectedListing2) {
                console.log(`[${requestId}]   - updatedContext.selectedListing2 (FULL):`, JSON.stringify(updatedContext2.selectedListing2, null, 2));
              }
              console.log(`[${requestId}]   - updatedContext.llmResponse?.selectedListing2:`, updatedContext2.llmResponse?.selectedListing2 ? Array.isArray(updatedContext2.llmResponse.selectedListing2) ? `ARRAY[${updatedContext2.llmResponse.selectedListing2.length}]` : "OBJECT" : "MISSING");
              if (updatedContext2.llmResponse?.selectedListing2) {
                console.log(`[${requestId}]   - updatedContext.llmResponse.selectedListing2 (FULL):`, JSON.stringify(updatedContext2.llmResponse.selectedListing2, null, 2));
              }
              console.log(`[${requestId}] ========================================`);
              console.log(`\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
              console.log(`\u2551         \u{1F50D}\u{1F50D}\u{1F50D} END selectedListing2 IN user_select_listing DEBUG \u{1F50D}\u{1F50D}\u{1F50D}        \u2551`);
              console.log(`\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`);
              console.log(`


`);
              console.log(`   \u{1F50D} [${requestId}]   - listingsFromSelectedListing2: ${listingsFromSelectedListing2?.length || 0} (${listingsFromSelectedListing2 ? "EXISTS" : "MISSING"})`);
              console.log(`   \u{1F50D} [${requestId}]   - processedEvent.data.options: ${listingsFromEvent?.length || 0} (${listingsFromEvent ? "EXISTS" : "MISSING"})`);
              console.log(`   \u{1F50D} [${requestId}]   - processedEvent.data.options value:`, processedEvent.data?.options);
              console.log(`   \u{1F50D} [${requestId}]   - Final listingsSource: ${listingsSource?.length || 0} (${listingsSource ? "EXISTS" : "MISSING"})`);
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext keys:`, Object.keys(updatedContext2));
              console.log(`   \u{1F50D} [${requestId}]   - updatedContext.llmResponse keys:`, updatedContext2.llmResponse ? Object.keys(updatedContext2.llmResponse) : "N/A");
              console.log(`


`);
              console.log(`\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
              if (listingsSource === listingsFromSelectedListing2) {
                console.log(`\u2551     \u2705\u2705\u2705 USING selectedListing2 AS LISTINGS SOURCE! \u2705\u2705\u2705                    \u2551`);
                console.log(`\u2551     listingsSource === listingsFromSelectedListing2                             \u2551`);
                console.log(`\u2551     listingsFromSelectedListing2 length: ${listingsFromSelectedListing2?.length || 0} \u2551`);
              } else if (listingsSource === listingsFromContext) {
                console.log(`\u2551     \u26A0\uFE0F Using listingsFromContext (NOT selectedListing2)                          \u2551`);
                console.log(`\u2551     listingsFromContext length: ${listingsFromContext?.length || 0}              \u2551`);
              } else if (listingsSource === listingsFromLlmResponse) {
                console.log(`\u2551     \u26A0\uFE0F Using listingsFromLlmResponse (NOT selectedListing2)                     \u2551`);
                console.log(`\u2551     listingsFromLlmResponse length: ${listingsFromLlmResponse?.length || 0}        \u2551`);
              } else if (listingsSource === listingsFromEvent) {
                console.log(`\u2551     \u26A0\uFE0F Using listingsFromEvent (NOT selectedListing2)                         \u2551`);
                console.log(`\u2551     listingsFromEvent length: ${listingsFromEvent?.length || 0}                  \u2551`);
              } else {
                console.log(`\u2551     \u274C NO LISTINGS SOURCE SELECTED! listingsSource is null/undefined            \u2551`);
              }
              console.log(`\u2551     Final listingsSource length: ${listingsSource?.length || 0}                  \u2551`);
              console.log(`\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`);
              console.log(`


`);
              if (step2.id === "user_select_listing" && listingsSource && Array.isArray(listingsSource) && listingsSource.length > 0) {
                const selectServiceType = updatedContext2.serviceType || serviceType || "movie";
                const selectFields = (0, import_serviceTypeFields.getServiceTypeFields)(selectServiceType);
                console.log(`   \u{1F4CB} [${requestId}] \u2705 Building ${selectServiceType} selection options from ${listingsSource.length} listings`);
                let sourceName = "unknown";
                if (listingsSource === listingsFromContext)
                  sourceName = "updatedContext.listings";
                else if (listingsSource === listingsFromLlmResponse)
                  sourceName = "updatedContext.llmResponse.listings";
                else if (listingsSource === listingsFromSelectedListing2)
                  sourceName = "selectedListing2 (array or single)";
                else if (listingsSource === listingsFromEvent)
                  sourceName = "processedEvent.data.options";
                console.log(`   \u{1F4CB} [${requestId}] \u2705 Using listings from: ${sourceName}`);
                processedEvent.data.options = listingsSource.map((listing) => {
                  let label = "";
                  if (selectServiceType === "movie") {
                    label = `${listing.movieTitle || listing.name} at ${listing.showtime} - $${listing.price}`;
                  } else if (selectServiceType === "airline") {
                    label = `${listing.flightNumber || listing.name} to ${listing.destination} on ${listing.date} - $${listing.price}`;
                  } else {
                    const primary = listing[selectFields.primary] || listing.name;
                    const time = listing[selectFields.time] || "";
                    label = `${primary}${time ? ` - ${time}` : ""} - $${listing.price || listing[selectFields.price]}`;
                  }
                  return {
                    value: listing.id,
                    label,
                    data: {
                      // Include all listing fields dynamically
                      ...listing,
                      // Ensure key fields are present
                      id: listing.id,
                      price: listing.price || listing[selectFields.price],
                      providerId: listing.providerId,
                      providerName: listing.providerName || listing.provider
                    }
                  };
                });
                console.log(`   \u{1F4CB} [${requestId}] \u2705 Built ${processedEvent.data.options.length} selection options`);
                console.log(`   \u{1F4CB} [${requestId}] First option:`, JSON.stringify(processedEvent.data.options[0], null, 2));
              } else {
                console.log(`   \u26A0\uFE0F [${requestId}] \u26A0\uFE0F NOT building options because:`);
                if (step2.id !== "user_select_listing") {
                  console.log(`   \u26A0\uFE0F [${requestId}]   - Step ID "${step2.id}" does not match "user_select_listing"`);
                }
                const listingsSource2 = updatedContext2.listings || (Array.isArray(processedEvent.data?.options) ? processedEvent.data.options : null);
                if (!listingsSource2 || !Array.isArray(listingsSource2) || listingsSource2.length === 0) {
                  console.log(`   \u26A0\uFE0F [${requestId}]   - No listings found in updatedContext.listings or processedEvent.data.options`);
                  console.log(`   \u26A0\uFE0F [${requestId}]   - updatedContext.listings:`, updatedContext2.listings);
                  console.log(`   \u26A0\uFE0F [${requestId}]   - processedEvent.data.options:`, processedEvent.data?.options);
                  console.log(`   \u26A0\uFE0F [${requestId}]   - Available context keys:`, Object.keys(updatedContext2));
                }
              }
              if (processedEvent.data?.options && !Array.isArray(processedEvent.data.options)) {
                console.warn(`   \u26A0\uFE0F [${requestId}] \u26A0\uFE0F processedEvent.data.options is not an array! Converting...`);
                console.warn(`   \u26A0\uFE0F [${requestId}] Current value:`, processedEvent.data.options);
                console.warn(`   \u26A0\uFE0F [${requestId}] Type:`, typeof processedEvent.data.options);
                processedEvent.data.options = [];
              }
              console.log(`   \u{1F4E1} [${requestId}] Broadcasting decision event: ${event.type}`);
              console.log(`   \u{1F4E1} [${requestId}] Event structure:`, JSON.stringify(processedEvent, null, 2));
              console.log(`   \u{1F4E1} [${requestId}] Event data.options:`, processedEvent.data?.options);
              console.log(`   \u{1F4E1} [${requestId}] Event data.options count:`, processedEvent.data?.options?.length || 0);
              try {
                broadcastEvent(processedEvent);
                console.log(`   \u2705 [${requestId}] Successfully broadcasted event: ${event.type}`);
              } catch (broadcastError) {
                console.warn(`   \u26A0\uFE0F [${requestId}] Failed to broadcast event: ${event.type}`, broadcastError);
              }
            }
          }
          console.log(`   \u23F8\uFE0F [${requestId}] ========================================`);
          console.log(`   \u23F8\uFE0F [${requestId}] STEP PAUSED FOR USER INTERACTION`);
          console.log(`   \u23F8\uFE0F [${requestId}] Step ID: ${stepId2}`);
          console.log(`   \u23F8\uFE0F [${requestId}] Decision type: ${step2.id.includes("select") ? "selection" : "decision"}`);
          console.log(`   \u23F8\uFE0F [${requestId}] Events count: ${events2.length}`);
          console.log(`   \u23F8\uFE0F [${requestId}] Events summary:`, events2.map((e) => ({
            type: e.type,
            hasOptions: !!e.data?.options,
            optionsCount: Array.isArray(e.data?.options) ? e.data.options.length : 0,
            optionsType: typeof e.data?.options
          })));
          if (events2.length > 0) {
            console.log(`   \u23F8\uFE0F [${requestId}] First event full structure:`, JSON.stringify(events2[0], null, 2));
          }
          console.log(`   \u23F8\uFE0F [${requestId}] ========================================`);
          sendResponse(200, {
            success: true,
            message: `Step ${stepId2} paused for user interaction`,
            result: {
              stepId: stepId2,
              pausedForDecision: true,
              decisionType: step2.id.includes("select") ? "selection" : "decision",
              events: events2,
              updatedContext: updatedContext2
            }
          });
          return;
        }
        console.log(`   \u{1F4CB} [${requestId}] Initial context has listings:`, !!updatedContext2.listings);
        if (step2.actions) {
          for (const action of step2.actions) {
            const processedAction = replaceTemplateVariables2(action, updatedContext2);
            console.log(`   \u{1F916} [${requestId}] Processing action: ${action.type}`);
            try {
              let actionResult = {};
              console.log(`   \u{1F50D} [${requestId}] Processing action type: "${action.type}"`);
              if (action.type === "start_movie_watching") {
                await processMovieWatchingAction(processedAction, updatedContext2, broadcastEvent);
                actionResult = { movieStarted: true, movieWatched: true };
                executedActions.push({ type: action.type, result: actionResult });
                continue;
              }
              async function formatResponseWithOpenAI_CLONED(listings, userQuery, queryFilters) {
                console.log(`\u{1F50D} [LLM] ========================================`);
                console.log(`\u{1F50D} [LLM] formatResponseWithOpenAI_CLONED FUNCTION ENTRY - CLONED DIRECTLY IN EDEN-SIM-REDIS`);
                console.log(`\u{1F50D} [LLM] This is the CLONED function - NOT imported`);
                console.log(`\u{1F50D} [LLM] listings count: ${listings.length}`);
                console.log(`\u{1F50D} [LLM] userQuery: ${userQuery ? userQuery.substring(0, 100) : "(empty)"}`);
                console.log(`\u{1F50D} [LLM] queryFilters:`, JSON.stringify(queryFilters));
                console.log(`\u{1F50D} [LLM] ========================================`);
                if (!userQuery || userQuery.trim().length === 0) {
                  const serviceType2 = queryFilters?.serviceType || "movie";
                  const fallbackQuery = serviceType2 === "dex" ? `Find ${queryFilters?.tokenSymbol || "TOKEN"} token trading options` : serviceType2 === "movie" ? `Find ${queryFilters?.genre || ""} ${queryFilters?.time || ""} movies`.trim() : `Find ${serviceType2} service options`;
                  userQuery = fallbackQuery;
                  console.warn(`\u26A0\uFE0F [LLM] userQuery was empty, using fallback: "${userQuery}"`);
                }
                const listingsJson = JSON.stringify(listings);
                const filtersJson = queryFilters ? JSON.stringify(queryFilters) : "{}";
                const userMessage = `User query: ${userQuery}

Query filters: ${filtersJson}

Available listings:
${listingsJson}

Filter listings based on the query filters and format the best option as a user-friendly message.`;
                const messages = [
                  { role: "system", content: import_llm2.LLM_RESPONSE_FORMATTING_PROMPT },
                  { role: "user", content: userMessage }
                ];
                const OPENAI_API_KEY2 = process.env.OPENAI_API_KEY || "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";
                const payloadObj = {
                  model: "gpt-4o",
                  messages,
                  response_format: { type: "json_object" },
                  temperature: 0.7
                };
                let payload;
                try {
                  payload = JSON.stringify(payloadObj);
                  JSON.parse(payload);
                } catch (err) {
                  console.error(`\u274C [LLM] Failed to stringify payload:`, err);
                  return Promise.reject(new Error(`Failed to create valid JSON payload: ${err.message}`));
                }
                const payloadBuffer = Buffer.from(payload, "utf8");
                const contentLength = payloadBuffer.length;
                return new Promise((resolve, reject) => {
                  const req2 = https.request(
                    {
                      hostname: "api.openai.com",
                      port: 443,
                      path: "/v1/chat/completions",
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${OPENAI_API_KEY2}`,
                        "Content-Length": contentLength
                      }
                    },
                    (res2) => {
                      let data = "";
                      res2.on("data", (c) => data += c);
                      res2.on("end", () => {
                        console.log(`\u{1F50D} [LLM] OpenAI response received, data length: ${data.length}`);
                        try {
                          const parsed = JSON.parse(data);
                          console.log(`\u{1F50D} [LLM] OpenAI response parsed successfully`);
                          if (parsed.error) {
                            reject(new Error(`OpenAI API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
                            return;
                          }
                          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
                            let content;
                            try {
                              const contentStr = parsed.choices[0].message.content;
                              console.log(`\u{1F527} [LLM] Raw content from OpenAI: ${contentStr?.substring(0, 200)}...`);
                              content = JSON.parse(contentStr);
                              console.log(`\u{1F527} [LLM] Parsed content keys: ${Object.keys(content || {}).join(", ")}`);
                              console.log(`\u{1F527} [LLM] content.selectedListing exists: ${!!content.selectedListing}, type: ${typeof content.selectedListing}`);
                              console.log(`\u{1F527} [LLM] content.selectedListing2 exists: ${!!content.selectedListing2}, type: ${typeof content.selectedListing2}`);
                              console.log(`


`);
                              console.log(`\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
                              console.log(`\u2551        \u{1F50D}\u{1F50D}\u{1F50D} LLM RESPONSE selectedListing2 CHECK \u{1F50D}\u{1F50D}\u{1F50D}                        \u2551`);
                              console.log(`\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`);
                              if (content.selectedListing2) {
                                console.log(`\u2705\u2705\u2705 [LLM] LLM RETURNED selectedListing2! \u2705\u2705\u2705`);
                                console.log(`[LLM] selectedListing2 (FULL):`, JSON.stringify(content.selectedListing2, null, 2));
                              } else {
                                console.log(`\u26A0\uFE0F\u26A0\uFE0F\u26A0\uFE0F [LLM] LLM did NOT return selectedListing2! \u26A0\uFE0F\u26A0\uFE0F\u26A0\uFE0F`);
                                console.log(`[LLM] Will set it to selectedListing later.`);
                              }
                              console.log(`\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
                              console.log(`\u2551        \u{1F50D}\u{1F50D}\u{1F50D} END LLM RESPONSE selectedListing2 CHECK \u{1F50D}\u{1F50D}\u{1F50D}                   \u2551`);
                              console.log(`\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`);
                              console.log(`


`);
                              if (content.selectedListing) {
                                const isGenericDemo = content.selectedListing?.name === "Demo Service" || content.selectedListing?.providerId === "provider-001" && !content.selectedListing?.poolId && !content.selectedListing?.movieTitle;
                                if (isGenericDemo) {
                                  console.warn(`\u26A0\uFE0F [LLM] BLOCKED generic "Demo Service" response from LLM`);
                                  if (listings.length > 0) {
                                    content.selectedListing = listings[0];
                                    console.log(`\u2705 [LLM] Replaced LLM's "Demo Service" with first actual listing`);
                                  } else {
                                    content.selectedListing = null;
                                  }
                                }
                              }
                            } catch (parseError) {
                              console.error(`\u274C [LLM] Failed to parse OpenAI content as JSON: ${parseError.message}`);
                              content = { message: parsed.choices[0].message.content || "Service found", selectedListing: null };
                            }
                            let selectedListing = content.selectedListing || (listings.length > 0 ? listings[0] : null);
                            if (selectedListing) {
                              const isTokenListing = "poolId" in selectedListing || "tokenSymbol" in selectedListing;
                              if (isTokenListing) {
                                const tokenListing = selectedListing;
                                if (!tokenListing.poolId || !tokenListing.providerId) {
                                  const matchedListing = listings.find(
                                    (l) => "poolId" in l && l.poolId === tokenListing.poolId || "tokenSymbol" in l && l.tokenSymbol === tokenListing.tokenSymbol && l.baseToken === tokenListing.baseToken
                                  );
                                  if (matchedListing) {
                                    selectedListing = { ...matchedListing, ...tokenListing };
                                    console.log(`\u2705 [LLM] Matched DEX pool listing by poolId/tokenSymbol`);
                                  } else if (listings.length > 0) {
                                    const firstListing = listings[0];
                                    selectedListing = { ...firstListing, ...tokenListing };
                                    console.warn(`\u26A0\uFE0F [LLM] No DEX pool match found, using first listing`);
                                  }
                                }
                              } else {
                                if (!selectedListing.providerId) {
                                  const matchedListing = listings.find(
                                    (l) => l.movieTitle === selectedListing.movieTitle && l.providerName === selectedListing.providerName
                                  );
                                  if (matchedListing) {
                                    selectedListing = { ...selectedListing, providerId: matchedListing.providerId };
                                  } else if (listings.length > 0) {
                                    selectedListing = { ...selectedListing, providerId: listings[0].providerId };
                                  }
                                }
                              }
                            }
                            let selectedListing2 = null;
                            if (content.selectedListing2) {
                              selectedListing2 = content.selectedListing2;
                              console.log(`\u2705 [LLM] Using selectedListing2 from LLM response`);
                              if (selectedListing2) {
                                const isTokenListing2 = "poolId" in selectedListing2 || "tokenSymbol" in selectedListing2;
                                if (isTokenListing2) {
                                  const tokenListing2 = selectedListing2;
                                  if (!tokenListing2.poolId || !tokenListing2.providerId) {
                                    const matchedListing2 = listings.find(
                                      (l) => "poolId" in l && l.poolId === tokenListing2.poolId || "tokenSymbol" in l && l.tokenSymbol === tokenListing2.tokenSymbol && l.baseToken === tokenListing2.baseToken
                                    );
                                    if (matchedListing2) {
                                      selectedListing2 = { ...matchedListing2, ...tokenListing2 };
                                      console.log(`\u2705 [LLM] Matched selectedListing2 DEX pool listing by poolId/tokenSymbol`);
                                    }
                                  }
                                } else {
                                  if (!selectedListing2.providerId) {
                                    const matchedListing2 = listings.find(
                                      (l) => l.movieTitle === selectedListing2.movieTitle && l.providerName === selectedListing2.providerName
                                    );
                                    if (matchedListing2) {
                                      selectedListing2 = { ...selectedListing2, providerId: matchedListing2.providerId };
                                    }
                                  }
                                }
                              }
                            } else {
                              console.warn(`\u26A0\uFE0F [LLM] LLM did not return selectedListing2, using selectedListing as selectedListing2`);
                              const isDEXQuery = listings.length > 0 && ("poolId" in listings[0] || "tokenSymbol" in listings[0]);
                              const filters = queryFilters || {};
                              const isDEXFromFilters = filters?.tokenSymbol || filters?.baseToken;
                              if (isDEXQuery || isDEXFromFilters) {
                                console.log(`\u{1F527} [LLM] DEX QUERY DETECTED - USING FIRST LISTING`);
                                if (listings.length > 0 && "poolId" in listings[0]) {
                                  selectedListing = listings[0];
                                  selectedListing2 = listings[0];
                                  console.log(`\u{1F527} [LLM] Using first actual DEX pool listing`);
                                } else {
                                  const mockDEXPool = {
                                    poolId: "pool-solana-tokena",
                                    providerId: "dex-pool-tokena",
                                    providerName: "DEX Pool Provider",
                                    tokenSymbol: filters?.tokenSymbol || "TOKENA",
                                    tokenName: "Token A",
                                    baseToken: filters?.baseToken || "SOL",
                                    price: 1.5,
                                    liquidity: 1e4,
                                    volume24h: 5e3,
                                    indexerId: "T1"
                                  };
                                  selectedListing = mockDEXPool;
                                  selectedListing2 = mockDEXPool;
                                  console.log(`\u{1F527} [LLM] No listings available, using hardcoded mock DEX pool`);
                                }
                              } else {
                                selectedListing2 = selectedListing;
                              }
                            }
                            const result = {
                              message: content.message || "Service found",
                              listings: content.listings || listings,
                              selectedListing,
                              selectedListing2,
                              iGasCost: 0
                            };
                            if (!result.selectedListing && listings.length > 0) {
                              result.selectedListing = listings[0];
                              result.selectedListing2 = listings[0];
                              console.warn(`\u26A0\uFE0F [LLM] FINAL SAFETY: Setting selectedListing to first listing`);
                            }
                            if (!result.selectedListing2 && result.selectedListing) {
                              result.selectedListing2 = result.selectedListing;
                              console.log(`\u2705 [LLM] Set selectedListing2 to selectedListing as final fallback`);
                            }
                            console.log(`


`);
                            console.log(`\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
                            console.log(`\u2551              \u{1F50D}\u{1F50D}\u{1F50D} FINAL RESULT selectedListing2 DEBUG \u{1F50D}\u{1F50D}\u{1F50D}                 \u2551`);
                            console.log(`\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`);
                            console.log(`[LLM] ========================================`);
                            console.log(`[LLM] FINAL RESULT selectedListing2:`);
                            console.log(`[LLM]   - result.selectedListing2 exists: ${!!result.selectedListing2}`);
                            console.log(`[LLM]   - result.selectedListing2 (FULL):`, JSON.stringify(result.selectedListing2, null, 2));
                            console.log(`[LLM] ========================================`);
                            console.log(`\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
                            console.log(`\u2551              \u{1F50D}\u{1F50D}\u{1F50D} END FINAL RESULT selectedListing2 DEBUG \u{1F50D}\u{1F50D}\u{1F50D}             \u2551`);
                            console.log(`\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`);
                            console.log(`


`);
                            resolve(result);
                          } else {
                            reject(new Error("Invalid OpenAI response format"));
                          }
                        } catch (err) {
                          reject(new Error(`Failed to parse OpenAI response: ${err.message}`));
                        }
                      });
                    }
                  );
                  req2.on("error", (err) => {
                    reject(new Error(`OpenAI request failed: ${err.message}`));
                  });
                  req2.write(payloadBuffer);
                  req2.end();
                });
              }
              switch (action.type) {
                case "validate":
                  actionResult = {
                    validationPassed: true,
                    errors: [],
                    input: updatedContext2.input,
                    email: updatedContext2.email
                  };
                  break;
                case "eden_chat_init": {
                  const resolvedServiceType = processedAction.serviceType || updatedContext2.serviceType || updatedContext2.queryResult?.serviceType || serviceType || "movie";
                  const resolvedEmail = updatedContext2.email || updatedContext2.user?.email || processedAction.email || processedAction.userEmail || "unknown@example.com";
                  if (!updatedContext2.user) {
                    updatedContext2.user = { email: resolvedEmail, id: resolvedEmail };
                  } else if (!updatedContext2.user.email) {
                    updatedContext2.user.email = resolvedEmail;
                  }
                  const existingSession = updatedContext2.edenChatSession;
                  const edenChatSession = existingSession && typeof existingSession === "object" ? {
                    sessionId: existingSession.sessionId || `session_${Date.now()}`,
                    serviceType: existingSession.serviceType || resolvedServiceType,
                    startTime: existingSession.startTime || Date.now()
                  } : {
                    sessionId: `session_${Date.now()}`,
                    serviceType: resolvedServiceType,
                    startTime: Date.now()
                  };
                  updatedContext2.serviceType = resolvedServiceType;
                  updatedContext2.edenChatSession = edenChatSession;
                  actionResult = {
                    edenChatSession,
                    chatInitialized: true,
                    serviceType: resolvedServiceType
                  };
                  break;
                }
                case "create_snapshot":
                  console.log(`\u{1F4F8} [${requestId}] Creating transaction snapshot`);
                  try {
                    const currentServiceType2 = updatedContext2.serviceType || serviceType || "movie";
                    const listingPrice = updatedContext2.selectedListing?.price || 0;
                    const dexTradeBaseAmount = updatedContext2?.trade?.baseAmount;
                    const rawActionAmount = processedAction.amount;
                    const parsedActionAmount = typeof rawActionAmount === "string" ? parseFloat(rawActionAmount) : rawActionAmount;
                    const snapshotAmount = (parsedActionAmount ?? (currentServiceType2 === "dex" ? dexTradeBaseAmount : void 0)) || updatedContext2.moviePrice || updatedContext2.hotelPrice || updatedContext2.restaurantPrice || updatedContext2.grocerystorePrice || updatedContext2.pharmacyPrice || updatedContext2.dogparkPrice || updatedContext2.gasstationPrice || updatedContext2.partyPrice || updatedContext2.bankPrice || updatedContext2.totalCost || listingPrice || 0;
                    const userEmail2 = updatedContext2.user?.email || processedAction.payer || "unknown@example.com";
                    if (!updatedContext2.user?.email && processedAction.payer) {
                      console.log(`\u{1F4E7} [${requestId}] Using processedAction.payer (${processedAction.payer}) as user email is not in context`);
                    }
                    const snapshot = {
                      txId: `tx_${Date.now()}`,
                      blockTime: Date.now(),
                      payer: userEmail2,
                      // Always use user email from context
                      amount: snapshotAmount,
                      feeSplit: {
                        indexer: 0,
                        cashier: 0.1,
                        provider: snapshotAmount * 0.05,
                        eden: snapshotAmount * 0.02
                      }
                    };
                    console.log(`\u{1F4E7} [${requestId}] Snapshot created with payer email: ${userEmail2}`);
                    actionResult = { snapshot };
                    updatedContext2.snapshot = snapshot;
                    const rawIGas = updatedContext2.iGasCost;
                    const normalizedIGas = rawIGas === void 0 || rawIGas === null ? 445e-5 : typeof rawIGas === "string" ? parseFloat(rawIGas) : Number(rawIGas);
                    updatedContext2.iGasCost = !isNaN(normalizedIGas) ? normalizedIGas : 445e-5;
                    try {
                      let totalIGasForUI = void 0;
                      try {
                        const { getAccountantState } = await import("./src/accountant");
                        totalIGasForUI = getAccountantState()?.totalIGas;
                      } catch (e) {
                      }
                      const currentIGasForUI = typeof updatedContext2.iGasCost === "number" ? updatedContext2.iGasCost : parseFloat(String(updatedContext2.iGasCost || 0));
                      broadcastEvent({
                        type: "igas",
                        component: "igas",
                        message: `iGas Cost: ${(currentIGasForUI || 0).toFixed(6)}`,
                        timestamp: Date.now(),
                        data: {
                          igas: currentIGasForUI || 0,
                          ...totalIGasForUI !== void 0 ? { totalIGas: totalIGasForUI } : {}
                        }
                      });
                    } catch (e) {
                      console.warn(`\u26A0\uFE0F  [${requestId}] Failed to broadcast igas event: ${e.message}`);
                    }
                    if (currentServiceType2 === "movie") {
                      updatedContext2.moviePrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType2 === "hotel") {
                      updatedContext2.hotelPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType2 === "airline") {
                      updatedContext2.airlinePrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType2 === "restaurant") {
                      updatedContext2.restaurantPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType2 === "grocerystore") {
                      updatedContext2.grocerystorePrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType2 === "pharmacy") {
                      updatedContext2.pharmacyPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType2 === "dogpark") {
                      updatedContext2.dogparkPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType2 === "gasstation") {
                      updatedContext2.gasstationPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType2 === "party") {
                      updatedContext2.partyPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType2 === "bank") {
                      updatedContext2.bankPrice = listingPrice || snapshotAmount;
                    }
                    updatedContext2.totalCost = listingPrice || snapshotAmount;
                    console.log(`\u{1F4F8} [${requestId}] Snapshot created:`, {
                      txId: snapshot.txId,
                      payer: snapshot.payer,
                      amount: snapshot.amount,
                      serviceType: currentServiceType2
                    });
                    console.log(`\u{1F4F8} [${requestId}] Context now has: snapshot=${!!updatedContext2.snapshot}, iGasCost=${updatedContext2.iGasCost}, price=${listingPrice || snapshotAmount}`);
                  } catch (snapshotError) {
                    console.error(`\u274C [${requestId}] Error creating snapshot:`, snapshotError);
                    actionResult = { error: snapshotError.message };
                  }
                  break;
                case "persist_snapshot": {
                  console.log(`\u{1F4BE} [${requestId}] Persisting transaction snapshot`);
                  const snapshotToPersist = processedAction.snapshot || updatedContext2.snapshot || actionResult?.snapshot;
                  if (!snapshotToPersist) {
                    throw new Error(`persist_snapshot requires snapshot in action or context`);
                  }
                  await persistSnapshot(snapshotToPersist);
                  actionResult = { snapshotPersisted: true, snapshot: snapshotToPersist };
                  updatedContext2.snapshot = snapshotToPersist;
                  updatedContext2.snapshotPersisted = true;
                  console.log(`\u2705 [${requestId}] Snapshot persisted: ${snapshotToPersist.txId || snapshotToPersist.id || "unknown"}`);
                  break;
                }
                case "stream_to_indexers": {
                  console.log(`\u{1F4E1} [${requestId}] Streaming snapshot to indexers`);
                  const snapshotToStream = processedAction.snapshot || updatedContext2.snapshot || actionResult?.snapshot;
                  if (!snapshotToStream) {
                    throw new Error(`stream_to_indexers requires snapshot in action or context`);
                  }
                  await streamToIndexers(snapshotToStream);
                  actionResult = { streamed: true, snapshot: snapshotToStream };
                  updatedContext2.snapshot = snapshotToStream;
                  updatedContext2.streamedToIndexers = true;
                  console.log(`\u2705 [${requestId}] Streamed snapshot: ${snapshotToStream.txId || snapshotToStream.id || "unknown"}`);
                  break;
                }
                case "deliver_webhook": {
                  const currentServiceType2 = (updatedContext2.serviceType || serviceType || "").toString().toLowerCase();
                  if (currentServiceType2 === "dex") {
                    console.log(`\u{1F6AB} [${requestId}] deliver_webhook skipped for DEX workflow`);
                    actionResult = { webhookDelivered: false, skipped: true, reason: "DEX workflow does not use webhooks" };
                    break;
                  }
                  const providerId = processedAction.providerId || updatedContext2.selectedListing?.providerId;
                  const snapshot = processedAction.snapshot || updatedContext2.snapshot;
                  const ledgerEntry = processedAction.ledgerEntry || updatedContext2.ledgerEntry;
                  if (!providerId || !snapshot || !ledgerEntry) {
                    throw new Error(`deliver_webhook requires providerId, snapshot, and ledgerEntry`);
                  }
                  await deliverWebhook(providerId, snapshot, ledgerEntry);
                  actionResult = { webhookDelivered: true, providerId };
                  break;
                }
                case "validate_certificate":
                  console.log(`\u{1F510} [${requestId}] Validating certificate for provider:`, processedAction.providerUuid || updatedContext2.selectedListing?.providerId);
                  actionResult = {
                    certificateValid: true,
                    providerUuid: processedAction.providerUuid || updatedContext2.selectedListing?.providerId,
                    validationTimestamp: Date.now()
                  };
                  console.log(`\u{1F510} [${requestId}] Certificate validation passed`);
                  break;
                case "llm_extract_query":
                  const userInputForExtraction = processedAction.input || updatedContext2.input || updatedContext2.userInput || "";
                  console.log(`   \u{1F50D} [${requestId}] llm_extract_query: Extracting query from input: "${userInputForExtraction.substring(0, 100)}..."`);
                  let queryResult;
                  const forcedServiceType = processedAction.serviceType || updatedContext2.serviceType || serviceType || "movie";
                  if (import_config.MOCKED_LLM) {
                    const extractServiceType = processedAction.serviceType || updatedContext2.serviceType || serviceType || "movie";
                    console.log(`   \u{1F50D} [${requestId}] llm_extract_query: Using MOCKED_LLM with serviceType: ${extractServiceType}`);
                    queryResult = {
                      serviceType: extractServiceType,
                      query: {
                        filters: extractServiceType === "movie" ? {
                          genre: "sci-fi",
                          time: "evening"
                        } : extractServiceType === "airline" ? {
                          destination: "any",
                          date: "any"
                        } : extractServiceType === "dex" ? {
                          tokenSymbol: "TOKENA",
                          baseToken: "SOL",
                          action: "BUY",
                          tokenAmount: 1
                        } : {}
                      }
                    };
                  } else {
                    const extractFn = import_config.ENABLE_OPENAI ? import_llm2.extractQueryWithOpenAI : extractQueryWithDeepSeek;
                    console.log(`   \u{1F50D} [${requestId}] llm_extract_query: Using ${import_config.ENABLE_OPENAI ? "OpenAI" : "DeepSeek"} for extraction`);
                    queryResult = await extractFn(userInputForExtraction);
                    console.log(`   \u2705 [${requestId}] llm_extract_query: Extracted query result:`, JSON.stringify(queryResult, null, 2));
                  }
                  if (forcedServiceType && forcedServiceType !== "movie" && forcedServiceType !== "dex") {
                    queryResult.serviceType = forcedServiceType;
                    queryResult.query = queryResult.query || { serviceType: forcedServiceType, filters: {} };
                    queryResult.query.serviceType = forcedServiceType;
                    queryResult.query.filters = queryResult.query.filters || {};
                    updatedContext2.serviceType = forcedServiceType;
                  } else {
                    queryResult.serviceType = queryResult.serviceType || forcedServiceType;
                    queryResult.query = queryResult.query || { serviceType: queryResult.serviceType, filters: {} };
                    queryResult.query.serviceType = queryResult.query.serviceType || queryResult.serviceType;
                    queryResult.query.filters = queryResult.query.filters || {};
                    updatedContext2.serviceType = queryResult.serviceType;
                  }
                  updatedContext2.queryResult = queryResult;
                  if (queryResult.serviceType === "dex" && queryResult.query.filters) {
                    const filters = queryResult.query.filters;
                    updatedContext2.action = filters.action || "BUY";
                    updatedContext2.tokenAmount = filters.tokenAmount;
                    updatedContext2.baseAmount = filters.baseAmount;
                    updatedContext2.tokenSymbol = filters.tokenSymbol;
                    updatedContext2.baseToken = filters.baseToken;
                    console.log(`   \u{1F50D} [${requestId}] llm_extract_query: Extracted DEX trade parameters:`);
                    console.log(`      action: ${updatedContext2.action}`);
                    console.log(`      tokenAmount: ${updatedContext2.tokenAmount || "not specified"}`);
                    console.log(`      baseAmount: ${updatedContext2.baseAmount || "not specified"}`);
                    console.log(`      tokenSymbol: ${updatedContext2.tokenSymbol}`);
                    console.log(`      baseToken: ${updatedContext2.baseToken}`);
                  }
                  actionResult = {
                    queryResult
                  };
                  break;
                case "query_dex_pools": {
                  if (!updatedContext2.queryResult) {
                    throw new Error("Query result required for DEX pool query");
                  }
                  console.log(`\u{1F50D} [${requestId}] Querying DEX pools...`);
                  console.log(`\u{1F50D} [${requestId}] Query filters:`, updatedContext2.queryResult.query.filters);
                  const dexProviders = (0, import_serviceProvider.queryROOTCAServiceRegistry)({
                    serviceType: "dex",
                    filters: {}
                  });
                  console.log(`\u{1F50D} [${requestId}] Found ${dexProviders.length} DEX provider(s) in service registry`);
                  if (dexProviders.length === 0) {
                    console.warn(`\u26A0\uFE0F [${requestId}] No DEX providers found in service registry`);
                    updatedContext2.listings = [];
                    actionResult = { listings: [] };
                    break;
                  }
                  const filters = {
                    tokenSymbol: updatedContext2.queryResult.query.filters?.tokenSymbol,
                    baseToken: updatedContext2.queryResult.query.filters?.baseToken,
                    action: updatedContext2.queryResult.query.filters?.action
                  };
                  console.log(`\u{1F50D} [${requestId}] Querying ${dexProviders.length} DEX provider(s) with filters:`, filters);
                  const dexListings = await (0, import_serviceProvider.queryServiceProviders)(
                    dexProviders,
                    filters
                  );
                  console.log(`\u2705 [${requestId}] Found ${dexListings.length} DEX pool listing(s) from ${dexProviders.length} provider(s)`);
                  updatedContext2.listings = dexListings;
                  actionResult = { listings: dexListings };
                  break;
                }
                case "query_service_registry": {
                  const queryServiceType = processedAction.serviceType || updatedContext2.serviceType || updatedContext2.queryResult?.serviceType || serviceType || "movie";
                  console.log(`   \u{1F50D} [${requestId}] query_service_registry: Querying for serviceType: ${queryServiceType}`);
                  const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
                  const providers = serviceRegistry2.queryProviders(queryServiceType, processedAction.filters || updatedContext2.queryResult?.query?.filters || {});
                  console.log(`   \u{1F4CB} [${requestId}] Found ${providers.length} providers for serviceType: ${queryServiceType}`);
                  const filters = processedAction.filters || updatedContext2.queryResult?.query?.filters || {};
                  if (updatedContext2.input || updatedContext2.userInput) {
                    filters.rawQuery = updatedContext2.input || updatedContext2.userInput;
                  }
                  let listings = [];
                  if (providers.length > 0) {
                    console.log(`   \u{1F50D} [${requestId}] Querying ${providers.length} provider(s) with filters:`, filters);
                    try {
                      listings = await (0, import_serviceProvider.queryServiceProviders)(providers, filters);
                      console.log(`   \u2705 [${requestId}] Retrieved ${listings.length} listing(s) from provider APIs (including plugin providers)`);
                    } catch (queryErr) {
                      console.error(`   \u274C [${requestId}] Failed to query providers:`, queryErr.message);
                      listings = [];
                    }
                  } else {
                    console.log(`   \u26A0\uFE0F  [${requestId}] No providers found for serviceType: ${queryServiceType}, generating fallback mock listings`);
                    const queryFields = (0, import_serviceTypeFields.getServiceTypeFields)(queryServiceType);
                    const mockListings = Array.from({ length: 3 }, (_, index) => {
                      const provider = { id: `mock-${index}`, name: `Mock Provider ${index + 1}`, serviceType: queryServiceType, location: "Unknown" };
                      const baseListing = {
                        id: provider.id,
                        name: provider.name,
                        serviceType: queryServiceType,
                        location: provider.location,
                        providerId: provider.id,
                        providerName: provider.name,
                        price: 15.99 + index * 2.5,
                        // Vary prices
                        rating: 4.5 + Math.random() * 0.5
                        // Random rating between 4.5-5.0
                      };
                      if (queryServiceType === "movie") {
                        baseListing.movieTitle = ["The Dark Knight", "Inception", "Avatar", "Interstellar", "The Matrix"][index % 5];
                        baseListing.showtime = ["7:00 PM", "8:30 PM", "6:15 PM", "9:00 PM", "5:30 PM"][index % 5];
                        baseListing.genre = ["Action", "Sci-Fi", "Adventure", "Thriller", "Drama"][index % 5];
                        baseListing.duration = "152 min";
                        baseListing.format = ["IMAX", "3D", "4DX", "Standard", "Premium"][index % 5];
                      } else if (queryServiceType === "airline") {
                        baseListing.flightNumber = ["AA123", "UA456", "DL789", "SW012", "JB345"][index % 5];
                        baseListing.destination = ["Los Angeles", "New York", "Chicago", "Miami", "Seattle"][index % 5];
                        baseListing.date = ["2026-01-20", "2026-01-21", "2026-01-22", "2026-01-23", "2026-01-24"][index % 5];
                        baseListing.departure = ["8:00 AM", "10:30 AM", "2:00 PM", "6:00 PM", "9:30 PM"][index % 5];
                        baseListing.arrival = ["11:00 AM", "1:30 PM", "5:00 PM", "9:00 PM", "12:30 AM"][index % 5];
                      } else if (queryServiceType === "autoparts") {
                        baseListing.partName = ["Brake Pads", "Oil Filter", "Air Filter", "Spark Plugs", "Battery"][index % 5];
                        baseListing.partNumber = [`BP-${1e3 + index}`, `OF-${2e3 + index}`, `AF-${3e3 + index}`, `SP-${4e3 + index}`, `BAT-${5e3 + index}`][index % 5];
                        baseListing.category = ["Brakes", "Filters", "Filters", "Ignition", "Electrical"][index % 5];
                        baseListing.warehouse = ["Warehouse A", "Warehouse B", "Warehouse C", "Warehouse D", "Warehouse E"][index % 5];
                        baseListing.availability = ["In Stock", "In Stock", "Low Stock", "In Stock", "In Stock"][index % 5];
                      } else if (queryServiceType === "hotel") {
                        baseListing.hotelName = ["Grand Plaza Hotel", "Oceanview Resort", "City Center Inn", "Mountain Lodge", "Beachside Suites"][index % 5];
                        baseListing.checkIn = ["2026-01-20", "2026-01-21", "2026-01-22", "2026-01-23", "2026-01-24"][index % 5];
                        baseListing.checkOut = ["2026-01-22", "2026-01-23", "2026-01-24", "2026-01-25", "2026-01-26"][index % 5];
                        baseListing.roomType = ["Standard", "Deluxe", "Suite", "Executive", "Presidential"][index % 5];
                        baseListing.location = ["Downtown", "Beachfront", "City Center", "Airport", "Resort Area"][index % 5];
                      } else if (queryServiceType === "restaurant") {
                        baseListing.restaurantName = ["The Gourmet Bistro", "Seaside Grill", "Mountain View Restaurant", "Downtown Diner", "Garden Cafe"][index % 5];
                        baseListing.reservationTime = ["7:00 PM", "8:00 PM", "6:30 PM", "7:30 PM", "8:30 PM"][index % 5];
                        baseListing.cuisine = ["Italian", "French", "Asian Fusion", "American", "Mediterranean"][index % 5];
                        baseListing.partySize = [2, 4, 2, 6, 4][index % 5];
                        baseListing.location = ["Downtown", "Waterfront", "Uptown", "Historic District", "Shopping District"][index % 5];
                      } else if (queryServiceType === "grocerystore") {
                        baseListing.grocerystoreName = ["Fresh Market", "Super Grocer", "Neighborhood Market", "City Grocery", "Green Valley Store"][index % 5];
                        baseListing.storeType = ["Supermarket", "Grocery Store", "Convenience Store", "Organic Market", "Discount Store"][index % 5];
                        baseListing.department = ["Produce", "Dairy", "Meat", "Bakery", "Frozen"][index % 5];
                        baseListing.location = ["Downtown", "Suburban", "City Center", "Shopping Plaza", "Neighborhood"][index % 5];
                        baseListing.hours = ["8 AM - 9 PM", "7 AM - 10 PM", "6 AM - 11 PM", "24 Hours", "9 AM - 8 PM"][index % 5];
                      } else if (queryServiceType === "pharmacy") {
                        baseListing.pharmacyName = ["Health Pharmacy", "Community Drug Store", "Wellness Pharmacy", "Family Pharmacy", "Care Pharmacy"][index % 5];
                        baseListing.pharmacyType = ["Retail Pharmacy", "Chain Pharmacy", "Independent Pharmacy", "Hospital Pharmacy", "Compounding Pharmacy"][index % 5];
                        baseListing.services = ["Prescriptions", "Over-the-counter", "Health Consultations", "Vaccinations", "Medical Supplies"][index % 5];
                        baseListing.location = ["Downtown", "Medical District", "Shopping Center", "Hospital Area", "Residential"][index % 5];
                        baseListing.hours = ["9 AM - 6 PM", "8 AM - 8 PM", "24 Hours", "9 AM - 9 PM", "7 AM - 7 PM"][index % 5];
                      } else if (queryServiceType === "dogpark") {
                        baseListing.dogparkName = ["Happy Tails Park", "Paws & Play Park", "Canine Commons", "Dogwood Park", "Bark & Run Park"][index % 5];
                        baseListing.parkType = ["Off-Leash Park", "Fenced Park", "Community Park", "Private Park", "Dog Run"][index % 5];
                        baseListing.amenities = ["Water Fountains", "Agility Equipment", "Separate Small Dog Area", "Waste Stations", "Shaded Areas"][index % 5];
                        baseListing.location = ["Downtown", "Residential", "Suburban", "Park District", "Neighborhood"][index % 5];
                        baseListing.hours = ["6 AM - 10 PM", "Dawn to Dusk", "24 Hours", "7 AM - 9 PM", "5 AM - 11 PM"][index % 5];
                      } else if (queryServiceType === "gasstation") {
                        baseListing.gasstationName = ["Quick Fill Station", "Express Gas", "Fuel Stop", "Corner Gas", "Highway Fuel"][index % 5];
                        baseListing.stationType = ["Full Service", "Self Service", "Convenience Store", "Truck Stop", "Premium Station"][index % 5];
                        baseListing.fuelTypes = ["Regular", "Premium", "Diesel", "E85", "Electric Charging"][index % 5];
                        baseListing.location = ["Highway", "Downtown", "Suburban", "Shopping Center", "Residential"][index % 5];
                        baseListing.hours = ["24 Hours", "6 AM - 11 PM", "5 AM - Midnight", "24 Hours", "7 AM - 10 PM"][index % 5];
                      } else if (queryServiceType === "party") {
                        baseListing.partyName = ["New Year's Eve Gala", "Summer Music Festival", "Rooftop Celebration", "Dance Party Night", "VIP Exclusive Event"][index % 5];
                        baseListing.partyType = ["Concert", "Festival", "Nightclub", "Private Event", "Corporate Party"][index % 5];
                        baseListing.eventDate = ["2026-12-31", "2026-07-15", "2026-06-20", "2026-08-10", "2026-09-05"][index % 5];
                        baseListing.eventTime = ["9:00 PM", "6:00 PM", "8:00 PM", "10:00 PM", "7:00 PM"][index % 5];
                        baseListing.location = ["Convention Center", "Outdoor Venue", "Rooftop", "Nightclub", "Hotel Ballroom"][index % 5];
                        baseListing.capacity = [500, 1e3, 200, 300, 150][index % 5];
                      } else if (queryServiceType === "bank") {
                        baseListing.bankName = ["First National Bank", "Community Credit Union", "Metro Savings Bank", "Trust Financial", "Heritage Bank"][index % 5];
                        baseListing.bankType = ["Commercial Bank", "Credit Union", "Savings Bank", "Investment Bank", "Community Bank"][index % 5];
                        baseListing.services = ["Checking Account", "Savings Account", "Loans", "Investment Services", "Business Banking"][index % 5];
                        baseListing.location = ["Downtown", "Financial District", "Shopping Center", "Suburban", "City Center"][index % 5];
                        baseListing.hours = ["9 AM - 5 PM", "8 AM - 6 PM", "10 AM - 4 PM", "9 AM - 4 PM", "8 AM - 5 PM"][index % 5];
                        baseListing.atmAvailable = [true, true, false, true, true][index % 5];
                      } else {
                        baseListing.name = `Mock ${queryServiceType} Service ${index + 1}`;
                        baseListing.date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
                      }
                      return baseListing;
                    });
                    listings = mockListings;
                  }
                  actionResult = {
                    listings,
                    providers: providers.map((p) => ({
                      id: p.id,
                      name: p.name,
                      serviceType: p.serviceType,
                      location: p.location
                    }))
                  };
                  updatedContext2.serviceType = queryServiceType;
                  updatedContext2.listings = listings;
                  actionResult = { listings };
                  console.log(`   \u{1F4CB} [${requestId}] Set ${listings.length} ${queryServiceType} listings in context and actionResult`);
                  break;
                }
                case "add_ledger_entry": {
                  console.log(`\u{1F50D} [${requestId}] Executing add_ledger_entry action - START`);
                  try {
                    const snapshot = processedAction.snapshot || updatedContext2.snapshot;
                    if (!snapshot) {
                      throw new Error("No snapshot available for ledger entry creation");
                    }
                    const ledgerServiceType = processedAction.serviceType || updatedContext2.serviceType || serviceType || "movie";
                    const ledgerFields = (0, import_serviceTypeFields.getServiceTypeFields)(ledgerServiceType);
                    const bookingDetails = (0, import_serviceTypeFields.extractBookingDetails)(ledgerServiceType, updatedContext2.selectedListing || {});
                    const { getDefaultProviderName, getDefaultProviderId } = await import("./src/serviceTypeFields");
                    const defaultProviderName = getDefaultProviderName(ledgerServiceType);
                    const defaultProviderId = getDefaultProviderId(ledgerServiceType);
                    console.log(`\u{1F4DD} [${requestId}] Adding ledger entry for ${ledgerServiceType} booking:`, {
                      amount: snapshot.amount,
                      payer: snapshot.payer,
                      merchant: processedAction.merchantName || updatedContext2.selectedListing?.providerName || defaultProviderName,
                      bookingDetails,
                      selectedListing: updatedContext2.selectedListing
                    });
                    console.log(`\u{1F4DD} [${requestId}] Extracted booking details for ${ledgerServiceType}:`, JSON.stringify(bookingDetails, null, 2));
                    console.log(`\u{1F4DD} [${requestId}] Calling addLedgerEntry with:`, {
                      snapshotTxId: snapshot.txId,
                      serviceType: ledgerServiceType,
                      payerId: processedAction.payerId || updatedContext2.user?.email,
                      merchantName: processedAction.merchantName || updatedContext2.selectedListing?.providerName || defaultProviderName
                    });
                    if (ledgerServiceType.toLowerCase() === "dex") {
                      const providerIdFromContext = processedAction.providerId || updatedContext2.selectedListing?.providerId || updatedContext2?.trade?.tokenSymbol ? `dex-pool-${String(updatedContext2?.trade?.tokenSymbol || updatedContext2.tokenSymbol || "").toLowerCase()}` : void 0;
                      const providerIdNormalized = providerIdFromContext ? String(providerIdFromContext) : void 0;
                      const providerFromRegistry = providerIdNormalized ? ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === providerIdNormalized) : void 0;
                      if (!updatedContext2.providerUuid && providerFromRegistry?.uuid) {
                        updatedContext2.providerUuid = providerFromRegistry.uuid;
                        console.log(`\u2705 [${requestId}] DEX: Resolved providerUuid from registry: ${updatedContext2.providerUuid} (providerId=${providerIdNormalized})`);
                      }
                      const isGenericDemo = updatedContext2.selectedListing?.name === "Demo Service" || updatedContext2.selectedListing?.providerId === "provider-001";
                      if (isGenericDemo) {
                        const tokenSymbol = updatedContext2?.trade?.tokenSymbol || updatedContext2.tokenSymbol || "TOKENA";
                        const poolId = updatedContext2?.trade?.poolId || `pool-solana-${String(tokenSymbol).toLowerCase()}`;
                        const providerId = providerIdNormalized || `dex-pool-${String(tokenSymbol).toLowerCase()}`;
                        updatedContext2.selectedListing = {
                          poolId,
                          providerId,
                          providerName: providerFromRegistry?.name || "DEX Pool Provider",
                          tokenSymbol,
                          tokenName: `Token ${String(tokenSymbol).replace(/^TOKEN/i, "")}`,
                          baseToken: updatedContext2?.trade?.baseToken || updatedContext2.baseToken || "SOL",
                          price: updatedContext2?.trade?.price || 0,
                          liquidity: 0,
                          volume24h: 0,
                          indexerId: providerFromRegistry?.gardenId || "T1"
                        };
                        console.warn(`\u26A0\uFE0F [${requestId}] DEX: Replaced generic Demo Service selectedListing with synthesized DEX listing`);
                      }
                    }
                    const ledgerEntry = await (0, import_ledger.addLedgerEntry)(
                      snapshot,
                      ledgerServiceType,
                      processedAction.iGasCost || updatedContext2.iGasCost || 445e-5,
                      processedAction.payerId || updatedContext2.user?.email || "unknown@example.com",
                      processedAction.merchantName || updatedContext2.selectedListing?.providerName || defaultProviderName,
                      processedAction.providerUuid || updatedContext2.providerUuid || updatedContext2.selectedListing?.providerId || defaultProviderId,
                      bookingDetails
                    );
                    console.log(`\u{1F4DD} [${requestId}] addLedgerEntry returned:`, {
                      entryId: ledgerEntry.entryId,
                      txId: ledgerEntry.txId,
                      payer: ledgerEntry.payer,
                      merchant: ledgerEntry.merchant,
                      amount: ledgerEntry.amount
                    });
                    console.log(`\u{1F4DD} [${requestId}] LEDGER array now has ${import_state.LEDGER.length} entries`);
                    actionResult = { ledgerEntry };
                    updatedContext2.ledgerEntry = ledgerEntry;
                    console.log(`\u{1F4DD} [${requestId}] Stored ledgerEntry in context:`, {
                      entryId: ledgerEntry.entryId,
                      txId: ledgerEntry.txId,
                      merchant: ledgerEntry.merchant,
                      amount: ledgerEntry.amount
                    });
                    console.log(`\u{1F4E1} [${requestId}] Broadcasting ledger_entry_added from workflow action handler`);
                    broadcastEvent({
                      type: "ledger_entry_added",
                      component: "ledger",
                      message: `Ledger entry created: ${ledgerEntry.entryId}`,
                      timestamp: Date.now(),
                      data: { entry: ledgerEntry }
                    });
                  } catch (ledgerError) {
                    console.error(`\u274C [${requestId}] Error adding ledger entry:`, ledgerError);
                    actionResult = { error: ledgerError.message };
                  }
                  break;
                }
                case "check_balance":
                  const userEmail = processedAction.email || updatedContext2.user?.email;
                  const requiredAmount = processedAction.required || updatedContext2.totalCost || processedAction.amount;
                  if (!userEmail || !requiredAmount) {
                    throw new Error("Missing user email or amount for balance check");
                  }
                  const balance = (0, import_wallet.getWalletBalance)(userEmail);
                  const hasBalance = balance >= requiredAmount;
                  actionResult = {
                    balanceChecked: true,
                    userEmail,
                    requiredAmount,
                    currentBalance: balance,
                    sufficientFunds: hasBalance
                  };
                  break;
                case "process_payment":
                  const paymentUser = processedAction.user || updatedContext2.user;
                  const currentServiceType = (updatedContext2.serviceType || serviceType || "").toString().toLowerCase();
                  const paymentAmountRaw = processedAction.amount || updatedContext2.totalCost || updatedContext2.moviePrice;
                  const paymentAmount = typeof paymentAmountRaw === "string" ? parseFloat(paymentAmountRaw) : paymentAmountRaw;
                  if (!paymentUser?.email || !paymentAmount) {
                    throw new Error("Missing payment details");
                  }
                  const ledgerEntryForPayment = processedAction.ledgerEntry || updatedContext2.ledgerEntry;
                  const cashierForPayment = processedAction.cashier || (0, import_ledger.getCashierStatus)();
                  if (!ledgerEntryForPayment) {
                    throw new Error("Missing ledger entry for payment processing");
                  }
                  const ledgerEntryInArray = import_state.LEDGER.find((e) => e.entryId === ledgerEntryForPayment.entryId);
                  if (!ledgerEntryInArray) {
                    throw new Error(`Ledger entry ${ledgerEntryForPayment.entryId} not found in LEDGER array`);
                  }
                  if (!ledgerEntryInArray.amount || ledgerEntryInArray.amount === 0) {
                    console.warn(`\u26A0\uFE0F [${requestId}] Ledger entry ${ledgerEntryInArray.entryId} has no amount, using paymentAmount: ${paymentAmount}`);
                    ledgerEntryInArray.amount = paymentAmount;
                    if (redis) {
                      redis.saveLedgerEntries(import_state.LEDGER);
                      console.log(`\u{1F4BE} [${requestId}] Persisted ledger entry with updated amount: ${ledgerEntryInArray.entryId}`);
                    }
                  }
                  if (currentServiceType === "dex") {
                    console.log(`\u{1F4B0} [${requestId}] DEX: Skipping wallet debit in process_payment (trade already executed). Updating cashier + ledger status...`);
                    try {
                      cashierForPayment.processedCount = (cashierForPayment.processedCount || 0) + 1;
                      cashierForPayment.totalProcessed = (cashierForPayment.totalProcessed || 0) + (ledgerEntryInArray.amount || 0);
                    } catch {
                    }
                    ledgerEntryInArray.status = "processed";
                    if (redis) {
                      redis.saveLedgerEntries(import_state.LEDGER);
                      console.log(`\u{1F4BE} [${requestId}] \u2705 Persisted ledger entry with processed status (DEX): ${ledgerEntryInArray.entryId}`);
                    }
                    const { getWalletBalance: getWalletBalanceAsync } = await import("./src/wallet");
                    const balance2 = await getWalletBalanceAsync(paymentUser.email);
                    if (updatedContext2.user)
                      updatedContext2.user.balance = balance2;
                    updatedContext2.paymentSuccess = true;
                    updatedContext2.cashier = cashierForPayment;
                    updatedContext2.updatedBalance = balance2;
                    updatedContext2.ledgerEntry = ledgerEntryInArray;
                    actionResult = {
                      paymentProcessed: true,
                      paymentSuccess: true,
                      amount: ledgerEntryInArray.amount,
                      skippedDebit: true,
                      updatedBalance: balance2,
                      ledgerEntry: ledgerEntryInArray,
                      cashier: cashierForPayment
                    };
                    break;
                  }
                  console.log(`\u{1F4B0} [${requestId}] ========================================`);
                  console.log(`\u{1F4B0} [${requestId}] \u{1F4B0} CASHIER PAYMENT PROCESSING START`);
                  console.log(`\u{1F4B0} [${requestId}] Entry ID: ${ledgerEntryInArray.entryId}`);
                  console.log(`\u{1F4B0} [${requestId}] Amount: ${ledgerEntryInArray.amount}`);
                  console.log(`\u{1F4B0} [${requestId}] User: ${paymentUser.email}`);
                  console.log(`\u{1F4B0} [${requestId}] Cashier Before: processedCount=${cashierForPayment.processedCount}, totalProcessed=${cashierForPayment.totalProcessed}`);
                  console.log(`\u{1F4B0} [${requestId}] ========================================`);
                  const paymentResult = await processPayment(cashierForPayment, ledgerEntryInArray, paymentUser);
                  const cashierAfter = (0, import_ledger.getCashierStatus)();
                  console.log(`\u{1F4B0} [${requestId}] ========================================`);
                  console.log(`\u{1F4B0} [${requestId}] \u{1F4B0} CASHIER PAYMENT PROCESSING RESULT`);
                  console.log(`\u{1F4B0} [${requestId}] Payment Result: ${paymentResult}`);
                  console.log(`\u{1F4B0} [${requestId}] Entry Status: ${ledgerEntryInArray.status}`);
                  console.log(`\u{1F4B0} [${requestId}] Cashier After: processedCount=${cashierAfter.processedCount}, totalProcessed=${cashierAfter.totalProcessed}`);
                  console.log(`\u{1F4B0} [${requestId}] ========================================`);
                  if (!paymentResult) {
                    if (redis) {
                      redis.saveLedgerEntries(import_state.LEDGER);
                      console.log(`\u{1F4BE} [${requestId}] Persisted ledger entry with failed status after payment failure: ${ledgerEntryInArray.entryId}`);
                    }
                    throw new Error("Payment processing failed");
                  }
                  if (ledgerEntryInArray.status !== "processed") {
                    console.warn(`\u26A0\uFE0F [${requestId}] Ledger entry status is ${ledgerEntryInArray.status}, expected 'processed'. Updating...`);
                    ledgerEntryInArray.status = "processed";
                  }
                  if (redis) {
                    redis.saveLedgerEntries(import_state.LEDGER);
                    console.log(`\u{1F4BE} [${requestId}] \u2705 Persisted ledger entry with processed status after payment: ${ledgerEntryInArray.entryId}`);
                  } else {
                    console.error(`\u274C [${requestId}] Redis not available! Cannot persist processed status for entry: ${ledgerEntryInArray.entryId}`);
                  }
                  updatedContext2.ledgerEntry = ledgerEntryInArray;
                  actionResult = {
                    paymentProcessed: true,
                    paymentSuccess: true,
                    amount: paymentAmount,
                    newBalance: paymentUser.balance,
                    ledgerEntry: ledgerEntryForPayment
                  };
                  updatedContext2.paymentSuccess = true;
                  break;
                case "start_movie_watching":
                  console.warn(`\u26A0\uFE0F [${requestId}] start_movie_watching reached switch case - should be handled asynchronously`);
                  actionResult = { movieStarted: false, error: "Should be handled asynchronously" };
                  break;
                case "start_hotel_booking":
                  console.log(`\u{1F3E8} [${requestId}] Starting hotel booking`);
                  const hotelName = processedAction.hotelName || updatedContext2.selectedListing?.hotelName || "Unknown Hotel";
                  const duration = processedAction.duration || 1;
                  const confirmationMessage = processedAction.confirmationMessage || `Your booking for ${hotelName} is confirmed!`;
                  actionResult = {
                    hotelBooked: true,
                    hotelName,
                    duration,
                    confirmationMessage,
                    bookingId: `hotel_${Date.now()}`
                  };
                  updatedContext2.hotelBooked = true;
                  updatedContext2.confirmationMessage = confirmationMessage;
                  console.log(`\u{1F3E8} [${requestId}] Hotel booking completed: ${hotelName} for ${duration} night(s)`);
                  break;
                case "complete_booking":
                  const bookingEntry = processedAction.ledgerEntry || updatedContext2.ledgerEntry;
                  if (!bookingEntry) {
                    throw new Error("Missing ledger entry for booking completion");
                  }
                  const bookingResult = completeBooking(bookingEntry);
                  actionResult = {
                    bookingCompleted: true,
                    bookingResult
                  };
                  break;
                case "root_ca_consume_ledger":
                  console.log(`\u2696\uFE0F  [${requestId}] ROOT CA: Consuming ledger entry from settlement stream`);
                  const ledgerEntryForSettlement = processedAction.ledgerEntry || updatedContext2.ledgerEntry;
                  if (!ledgerEntryForSettlement) {
                    throw new Error("Missing ledger entry for ROOT CA settlement");
                  }
                  const entryInStream = ledgerEntryForSettlement.entryId;
                  console.log(`\u2696\uFE0F  [${requestId}] ROOT CA: Verifying entry ${entryInStream} is in settlement stream`);
                  actionResult = {
                    entryConsumed: true,
                    entryId: entryInStream,
                    stream: LEDGER_SETTLEMENT_STREAM
                  };
                  break;
                case "root_ca_validate_entry":
                  console.log(`\u2696\uFE0F  [${requestId}] ROOT CA: Validating ledger entry`);
                  const entryToValidate = processedAction.ledgerEntry || updatedContext2.ledgerEntry;
                  const providerUuidToValidate = processedAction.certificate || updatedContext2.providerUuid;
                  if (!entryToValidate) {
                    throw new Error("Missing ledger entry for validation");
                  }
                  const hasRequiredFields = entryToValidate.entryId && entryToValidate.txId && entryToValidate.amount;
                  if (!hasRequiredFields) {
                    throw new Error("Ledger entry missing required fields");
                  }
                  let certificateValid = true;
                  if (providerUuidToValidate && providerUuidToValidate !== "MISSING-UUID") {
                    const cert = getCertificate(providerUuidToValidate);
                    certificateValid = cert ? validateCertificate(providerUuidToValidate) : false;
                    if (!certificateValid) {
                      console.warn(`\u26A0\uFE0F  [${requestId}] ROOT CA: Invalid certificate for provider ${providerUuidToValidate}`);
                    }
                  }
                  actionResult = {
                    entryValidated: true,
                    validationStatus: certificateValid ? "valid" : "invalid_certificate",
                    entryId: entryToValidate.entryId,
                    certificateValid
                  };
                  break;
                case "root_ca_settle_entry":
                  console.log(`\u2696\uFE0F  [${requestId}] ROOT CA: Settling ledger entry`);
                  const entryToSettle = processedAction.ledgerEntry || updatedContext2.ledgerEntry;
                  if (!entryToSettle) {
                    throw new Error("Missing ledger entry for settlement");
                  }
                  const ledgerEntryToSettle = import_state.LEDGER.find((e) => e.entryId === entryToSettle.entryId);
                  if (!ledgerEntryToSettle) {
                    throw new Error(`Ledger entry ${entryToSettle.entryId} not found`);
                  }
                  let settled = false;
                  const maxWaitTime = 5e3;
                  const pollInterval = 100;
                  const startTime = Date.now();
                  while (!settled && Date.now() - startTime < maxWaitTime) {
                    if (ledgerEntryToSettle.status === "completed") {
                      settled = true;
                      console.log(`\u2705 [${requestId}] ROOT CA: Entry ${entryToSettle.entryId} settled (waited ${Date.now() - startTime}ms)`);
                    } else {
                      await new Promise((resolve) => setTimeout(resolve, pollInterval));
                    }
                  }
                  if (!settled) {
                    console.log(`\u2696\uFE0F  [${requestId}] ROOT CA: Entry not settled yet, triggering manual settlement`);
                    try {
                      const snapshot = updatedContext2.snapshot;
                      const settlementMsg = {
                        entryId: entryToSettle.entryId,
                        txId: entryToSettle.txId,
                        timestamp: entryToSettle.timestamp.toString(),
                        payer: entryToSettle.payer,
                        payerId: entryToSettle.payerId,
                        merchant: entryToSettle.merchant,
                        providerUuid: entryToSettle.providerUuid,
                        indexerId: snapshot?.gardenId || "unknown",
                        serviceType: entryToSettle.serviceType,
                        amount: entryToSettle.amount.toString(),
                        iGas: entryToSettle.iGasCost.toString(),
                        iTax: (entryToSettle.bookingDetails?.iTax || 0).toString(),
                        fees: JSON.stringify(entryToSettle.fees || {}),
                        status: entryToSettle.status
                      };
                      await processSettlementEntry(settlementMsg);
                      if (ledgerEntryToSettle.status === "completed") {
                        settled = true;
                        console.log(`\u2705 [${requestId}] ROOT CA: Entry ${entryToSettle.entryId} settled manually`);
                        if (redis) {
                          redis.saveLedgerEntries(import_state.LEDGER);
                          console.log(`\u{1F4BE} [${requestId}] ROOT CA: Persisted ledger entry with completed status: ${entryToSettle.entryId}`);
                        }
                      } else {
                        console.warn(`\u26A0\uFE0F  [${requestId}] ROOT CA: Entry ${entryToSettle.entryId} status is ${ledgerEntryToSettle.status}, expected 'completed'`);
                      }
                    } catch (settleError) {
                      console.error(`\u274C [${requestId}] ROOT CA: Failed to settle entry:`, settleError.message);
                      throw new Error(`Settlement failed: ${settleError.message}`);
                    }
                  }
                  actionResult = {
                    settlementStatus: "settled",
                    entryId: entryToSettle.entryId,
                    status: ledgerEntryToSettle.status
                  };
                  updatedContext2.settlementStatus = "settled";
                  break;
                case "root_ca_update_balances":
                  console.log(`\u2696\uFE0F  [${requestId}] ROOT CA: Updating authoritative balances`);
                  const entryForBalances = processedAction.ledgerEntry || updatedContext2.ledgerEntry;
                  const feeSplit = processedAction.feeSplit || updatedContext2.snapshot?.feeSplit;
                  if (!entryForBalances) {
                    throw new Error("Missing ledger entry for balance update");
                  }
                  const entryInLedger = import_state.LEDGER.find((e) => e.entryId === entryForBalances.entryId);
                  if (!entryInLedger) {
                    throw new Error(`Ledger entry ${entryForBalances.entryId} not found`);
                  }
                  const rootCABalance = ROOT_BALANCES.rootCA;
                  console.log(`\u2696\uFE0F  [${requestId}] ROOT CA: Current ROOT CA balance: ${rootCABalance.toFixed(6)}`);
                  actionResult = {
                    balancesUpdated: true,
                    entryId: entryForBalances.entryId,
                    rootCABalance,
                    feeSplit
                  };
                  updatedContext2.balancesUpdated = true;
                  break;
                case "root_ca_finalize_fees":
                  console.log(`\u2696\uFE0F  [${requestId}] ROOT CA: Finalizing fee distributions`);
                  const entryForFees = processedAction.ledgerEntry || updatedContext2.ledgerEntry;
                  const feesToFinalize = processedAction.fees || updatedContext2.snapshot?.feeSplit;
                  if (!entryForFees) {
                    throw new Error("Missing ledger entry for fee finalization");
                  }
                  const entryForFeeCheck = import_state.LEDGER.find((e) => e.entryId === entryForFees.entryId);
                  if (!entryForFeeCheck) {
                    throw new Error(`Ledger entry ${entryForFees.entryId} not found`);
                  }
                  if (entryForFeeCheck.status !== "completed") {
                    console.warn(`\u26A0\uFE0F  [${requestId}] ROOT CA: Entry ${entryForFees.entryId} status is ${entryForFeeCheck.status}, updating to 'completed'`);
                    entryForFeeCheck.status = "completed";
                    if (redis) {
                      redis.saveLedgerEntries(import_state.LEDGER);
                      console.log(`\u{1F4BE} [${requestId}] ROOT CA: Persisted ledger entry with completed status after fee finalization`);
                    }
                  }
                  actionResult = {
                    feesFinalized: true,
                    entryId: entryForFees.entryId,
                    fees: feesToFinalize,
                    status: "completed"
                  };
                  updatedContext2.feesFinalized = true;
                  updatedContext2.settlementStatus = "settled";
                  break;
                case "root_ca_validate_payment":
                  console.log(`\u2696\uFE0F  [${requestId}] ROOT CA: Validating cashier payment`);
                  const paymentEntry = processedAction.ledgerEntry || updatedContext2.ledgerEntry;
                  const paymentResultForValidation = processedAction.paymentResult || updatedContext2.paymentSuccess;
                  const cashierInfo = processedAction.cashier || updatedContext2.cashier;
                  if (!paymentEntry) {
                    throw new Error("Missing ledger entry for payment validation");
                  }
                  if (!paymentResultForValidation) {
                    throw new Error("Payment was not successful");
                  }
                  if (!cashierInfo) {
                    throw new Error("Cashier information missing");
                  }
                  actionResult = {
                    paymentValidated: true,
                    entryId: paymentEntry.entryId,
                    paymentStatus: paymentResultForValidation,
                    cashier: cashierInfo.name
                  };
                  break;
                case "root_ca_verify_balance_update":
                  console.log(`\u2696\uFE0F  [${requestId}] ROOT CA: Verifying balance update`);
                  const userEmailForVerify = processedAction.userEmail || updatedContext2.user?.email;
                  const expectedBalance = processedAction.expectedBalance || updatedContext2.updatedBalance;
                  const entryForVerify = processedAction.ledgerEntry || updatedContext2.ledgerEntry;
                  if (!userEmailForVerify || expectedBalance === void 0) {
                    throw new Error("Missing user email or expected balance for verification");
                  }
                  const actualBalance = (0, import_wallet.getWalletBalance)(userEmailForVerify);
                  const balanceMatches = Math.abs(actualBalance - expectedBalance) < 1e-6;
                  if (!balanceMatches) {
                    console.warn(`\u26A0\uFE0F  [${requestId}] ROOT CA: Balance mismatch - Expected: ${expectedBalance}, Actual: ${actualBalance}`);
                  }
                  actionResult = {
                    balanceVerified: balanceMatches,
                    userEmail: userEmailForVerify,
                    expectedBalance,
                    actualBalance,
                    entryId: entryForVerify?.entryId
                  };
                  updatedContext2.balanceVerified = balanceMatches;
                  break;
                case "root_ca_authorize_payment":
                  console.log(`\u2696\uFE0F  [${requestId}] ROOT CA: Authorizing payment`);
                  const entryToAuthorize = processedAction.ledgerEntry || updatedContext2.ledgerEntry;
                  const paymentStatus = processedAction.paymentStatus || updatedContext2.paymentSuccess;
                  if (!entryToAuthorize) {
                    throw new Error("Missing ledger entry for payment authorization");
                  }
                  if (!paymentStatus) {
                    throw new Error("Payment was not successful, cannot authorize");
                  }
                  actionResult = {
                    paymentAuthorized: true,
                    entryId: entryToAuthorize.entryId,
                    authorizationTimestamp: Date.now()
                  };
                  updatedContext2.paymentAuthorized = true;
                  updatedContext2.cashierOversightComplete = true;
                  break;
                case "execute_dex_trade":
                  console.log(`\u{1F4B0} [${requestId}] Executing DEX trade...`);
                  const selectedListingForTrade = updatedContext2.selectedListing || updatedContext2.llmResponse?.selectedListing || updatedContext2.llmResponse?.selectedListing2 || updatedContext2.selectedListing2;
                  console.log(`\u{1F4B0} [${requestId}] selectedListing sources:`);
                  console.log(`\u{1F4B0} [${requestId}]   - updatedContext.selectedListing: ${!!updatedContext2.selectedListing}`);
                  console.log(`\u{1F4B0} [${requestId}]   - updatedContext.llmResponse?.selectedListing: ${!!updatedContext2.llmResponse?.selectedListing}`);
                  console.log(`\u{1F4B0} [${requestId}]   - updatedContext.llmResponse?.selectedListing2: ${!!updatedContext2.llmResponse?.selectedListing2}`);
                  console.log(`\u{1F4B0} [${requestId}]   - updatedContext.selectedListing2: ${!!updatedContext2.selectedListing2}`);
                  console.log(`\u{1F4B0} [${requestId}]   - selectedListingForTrade: ${!!selectedListingForTrade}`);
                  if (selectedListingForTrade) {
                    console.log(`\u{1F4B0} [${requestId}]   - selectedListingForTrade.poolId: ${selectedListingForTrade?.poolId}`);
                    console.log(`\u{1F4B0} [${requestId}]   - selectedListingForTrade keys: ${Object.keys(selectedListingForTrade).join(", ")}`);
                  }
                  let poolIdForTrade = processedAction.poolId || selectedListingForTrade?.poolId || updatedContext2.selectedListing?.poolId || updatedContext2.llmResponse?.selectedListing?.poolId || updatedContext2.llmResponse?.selectedListing2?.poolId;
                  if (!poolIdForTrade) {
                    console.warn(`\u26A0\uFE0F [${requestId}] poolId not found in selectedListing, trying fallback...`);
                    const listings = updatedContext2.listings || [];
                    const dexListing = listings.find((l) => l.poolId || l.tokenSymbol && l.baseToken);
                    if (dexListing && dexListing.poolId) {
                      poolIdForTrade = dexListing.poolId;
                      console.log(`\u2705 [${requestId}] Found poolId from listings: ${poolIdForTrade}`);
                    } else if (dexListing && dexListing.tokenSymbol) {
                      poolIdForTrade = `pool-solana-${dexListing.tokenSymbol.toLowerCase()}`;
                      console.log(`\u2705 [${requestId}] Constructed poolId from tokenSymbol: ${poolIdForTrade}`);
                    } else {
                      const tokenSymbol = updatedContext2.tokenSymbol || updatedContext2.queryResult?.query?.filters?.tokenSymbol;
                      if (tokenSymbol) {
                        poolIdForTrade = `pool-solana-${tokenSymbol.toLowerCase()}`;
                        console.log(`\u2705 [${requestId}] Constructed poolId from context tokenSymbol: ${poolIdForTrade}`);
                      } else {
                        const { DEX_POOLS: DEX_POOLS2 } = await import("./src/state");
                        if (DEX_POOLS2 && DEX_POOLS2.size > 0) {
                          const firstPool = Array.from(DEX_POOLS2.values())[0];
                          poolIdForTrade = firstPool.poolId;
                          console.log(`\u2705 [${requestId}] Using first available pool from DEX_POOLS: ${poolIdForTrade}`);
                        } else {
                          console.error(`\u274C [${requestId}] No DEX pools available! DEX_POOLS.size: ${DEX_POOLS2?.size || 0}`);
                          console.log(`\u{1F527} [${requestId}] Attempting to initialize DEX pools...`);
                          (0, import_dex.initializeDEXPools)();
                          if (DEX_POOLS2 && DEX_POOLS2.size > 0) {
                            const firstPool = Array.from(DEX_POOLS2.values())[0];
                            poolIdForTrade = firstPool.poolId;
                            console.log(`\u2705 [${requestId}] Initialized pools and using first pool: ${poolIdForTrade}`);
                          }
                        }
                      }
                    }
                  }
                  console.log(`\u{1F4B0} [${requestId}] poolId: ${poolIdForTrade}`);
                  console.log(`\u{1F4B0} [${requestId}] action: ${processedAction.action || updatedContext2.action}`);
                  console.log(`\u{1F4B0} [${requestId}] tokenAmount: ${processedAction.tokenAmount || updatedContext2.tokenAmount}`);
                  console.log(`\u{1F4B0} [${requestId}] userEmail: ${processedAction.userEmail || updatedContext2.user?.email}`);
                  const { createActionHandlers } = await import("./src/flowwiseHandlers");
                  const handlers = createActionHandlers();
                  const dexHandler = handlers.get("execute_dex_trade");
                  if (!dexHandler) {
                    throw new Error("execute_dex_trade handler not found");
                  }
                  const dexAction = {
                    poolId: poolIdForTrade,
                    action: processedAction.action || updatedContext2.action,
                    tokenAmount: processedAction.tokenAmount || updatedContext2.tokenAmount,
                    userEmail: processedAction.userEmail || updatedContext2.user?.email
                  };
                  if (!dexAction.poolId || !dexAction.action || !dexAction.tokenAmount || !dexAction.userEmail) {
                    console.error(`\u274C [${requestId}] Missing DEX trade parameters:`);
                    console.error(`\u274C [${requestId}]   - poolId: ${dexAction.poolId || "MISSING"}`);
                    console.error(`\u274C [${requestId}]   - action: ${dexAction.action || "MISSING"}`);
                    console.error(`\u274C [${requestId}]   - tokenAmount: ${dexAction.tokenAmount || "MISSING"}`);
                    console.error(`\u274C [${requestId}]   - userEmail: ${dexAction.userEmail || "MISSING"}`);
                    console.error(`\u274C [${requestId}] Context keys:`, Object.keys(updatedContext2));
                    console.error(`\u274C [${requestId}] selectedListing:`, selectedListingForTrade ? JSON.stringify(selectedListingForTrade, null, 2) : "NOT FOUND");
                    throw new Error(`Missing required DEX trade parameters: poolId=${!!dexAction.poolId}, action=${!!dexAction.action}, tokenAmount=${!!dexAction.tokenAmount}, userEmail=${!!dexAction.userEmail}`);
                  }
                  const dexResult = await dexHandler(dexAction, updatedContext2);
                  if (dexResult.trade) {
                    updatedContext2.trade = dexResult.trade;
                    updatedContext2.totalCost = dexResult.trade.baseAmount + (updatedContext2.iGasCost || 0);
                    console.log(`\u{1F4B0} [${requestId}] DEX trade executed: ${dexResult.trade.action} ${dexResult.trade.tokenAmount} ${dexResult.trade.tokenSymbol} for ${dexResult.trade.baseAmount} ${dexResult.trade.baseToken}`);
                  }
                  if (dexResult.updatedBalance !== void 0) {
                    if (updatedContext2.user) {
                      updatedContext2.user.balance = dexResult.updatedBalance;
                    }
                    updatedContext2.updatedBalance = dexResult.updatedBalance;
                    console.log(`\u{1F4B0} [${requestId}] Updated balance: ${dexResult.updatedBalance}`);
                  }
                  if (dexResult.traderRebate !== void 0) {
                    updatedContext2.traderRebate = dexResult.traderRebate;
                    console.log(`\u{1F4B0} [${requestId}] Trader rebate: ${dexResult.traderRebate}`);
                  }
                  actionResult = {
                    trade: dexResult.trade,
                    updatedBalance: dexResult.updatedBalance,
                    traderRebate: dexResult.traderRebate
                  };
                  break;
                default:
                  console.log(`\u{1F50D} [${requestId}] ========================================`);
                  console.log(`\u{1F50D} [${requestId}] DEFAULT CASE HIT - action.type: "${action.type}"`);
                  console.log(`\u{1F50D} [${requestId}] ========================================`);
                  if (action.type === "llm_format_response") {
                    const availableListings = updatedContext2.listings || [];
                    const formatServiceType = updatedContext2.serviceType || updatedContext2.queryResult?.serviceType || serviceType || "movie";
                    console.log(`\u{1F50D} [${requestId}] ========================================`);
                    console.log(`\u{1F50D} [${requestId}] llm_format_response ACTION CALLED (EDEN-SIM-REDIS) - DEFAULT CASE`);
                    console.log(`\u{1F50D} [${requestId}] listings count: ${availableListings.length}`);
                    console.log(`\u{1F50D} [${requestId}] userInput: ${updatedContext2.userInput?.substring(0, 100) || "N/A"}`);
                    console.log(`\u{1F50D} [${requestId}] serviceType: ${formatServiceType}`);
                    console.log(`\u{1F50D} [${requestId}] ENABLE_OPENAI: ${import_config.ENABLE_OPENAI}`);
                    console.log(`\u{1F50D} [${requestId}] Context keys:`, Object.keys(updatedContext2));
                    console.log(`\u{1F50D} [${requestId}] Context.queryResult:`, updatedContext2.queryResult ? {
                      serviceType: updatedContext2.queryResult.serviceType,
                      hasQuery: !!updatedContext2.queryResult.query,
                      hasFilters: !!updatedContext2.queryResult.query?.filters,
                      filters: updatedContext2.queryResult.query?.filters
                    } : "null/undefined");
                    console.log(`\u{1F50D} [${requestId}] Available listings:`, availableListings.length > 0 ? availableListings.map((l) => ({
                      id: l.id,
                      providerId: l.providerId,
                      providerName: l.providerName,
                      poolId: l.poolId,
                      tokenSymbol: l.tokenSymbol,
                      baseToken: l.baseToken,
                      price: l.price
                    })) : "[]");
                    console.log(`\u{1F50D} [${requestId}] ========================================`);
                    if (availableListings.length === 0) {
                      console.warn(`\u26A0\uFE0F [${requestId}] No listings available for LLM formatting`);
                      console.warn(`\u26A0\uFE0F [${requestId}] Context state:`, {
                        hasListings: !!updatedContext2.listings,
                        listingsLength: updatedContext2.listings?.length || 0,
                        hasQueryResult: !!updatedContext2.queryResult,
                        serviceType: formatServiceType,
                        hasExistingLlmResponse: !!updatedContext2.llmResponse,
                        hasExistingSelectedListing: !!updatedContext2.llmResponse?.selectedListing,
                        hasExistingSelectedListing2: !!updatedContext2.llmResponse?.selectedListing2
                      });
                      if (updatedContext2.llmResponse?.selectedListing2) {
                        console.log(`\u2705 [${requestId}] Using existing selectedListing2 from previous llmResponse`);
                        updatedContext2.selectedListing = updatedContext2.llmResponse.selectedListing2;
                        updatedContext2.selectedListing2 = updatedContext2.llmResponse.selectedListing2;
                        updatedContext2.llmResponse.selectedListing = updatedContext2.llmResponse.selectedListing2;
                        actionResult = {
                          llmResponse: updatedContext2.llmResponse,
                          listings: [],
                          iGasCost: updatedContext2.llmResponse.iGasCost || 0,
                          currentIGas: updatedContext2.llmResponse.iGasCost || 0
                        };
                        console.log(`\u2705 [${requestId}] Reused selectedListing2:`, {
                          hasSelectedListing: !!actionResult.llmResponse.selectedListing,
                          hasSelectedListing2: !!actionResult.llmResponse.selectedListing2,
                          hasContextSelectedListing2: !!updatedContext2.selectedListing2,
                          poolId: actionResult.llmResponse.selectedListing?.poolId,
                          tokenSymbol: actionResult.llmResponse.selectedListing?.tokenSymbol
                        });
                        break;
                      } else if (updatedContext2.llmResponse?.selectedListing) {
                        console.log(`\u2705 [${requestId}] Using existing selectedListing from previous llmResponse`);
                        updatedContext2.selectedListing = updatedContext2.llmResponse.selectedListing;
                        updatedContext2.selectedListing2 = updatedContext2.llmResponse.selectedListing;
                        updatedContext2.llmResponse.selectedListing2 = updatedContext2.llmResponse.selectedListing;
                        actionResult = {
                          llmResponse: updatedContext2.llmResponse,
                          listings: [],
                          iGasCost: updatedContext2.llmResponse.iGasCost || 0,
                          currentIGas: updatedContext2.llmResponse.iGasCost || 0
                        };
                        console.log(`\u2705 [${requestId}] Reused selectedListing:`, {
                          hasSelectedListing: !!actionResult.llmResponse.selectedListing,
                          hasSelectedListing2: !!actionResult.llmResponse.selectedListing2,
                          hasContextSelectedListing2: !!updatedContext2.selectedListing2,
                          poolId: actionResult.llmResponse.selectedListing?.poolId,
                          tokenSymbol: actionResult.llmResponse.selectedListing?.tokenSymbol
                        });
                        break;
                      } else if (updatedContext2.selectedListing) {
                        console.log(`\u2705 [${requestId}] Using existing selectedListing from context`);
                        const existingLlmResponse = {
                          message: "Using previously selected listing",
                          listings: [],
                          selectedListing: updatedContext2.selectedListing,
                          selectedListing2: updatedContext2.selectedListing,
                          iGasCost: updatedContext2.iGasCost || 0
                        };
                        updatedContext2.llmResponse = existingLlmResponse;
                        updatedContext2.selectedListing2 = updatedContext2.selectedListing;
                        actionResult = {
                          llmResponse: existingLlmResponse,
                          listings: [],
                          iGasCost: existingLlmResponse.iGasCost,
                          currentIGas: existingLlmResponse.iGasCost
                        };
                        console.log(`\u2705 [${requestId}] Created llmResponse from existing selectedListing:`, {
                          hasSelectedListing: !!actionResult.llmResponse.selectedListing,
                          hasSelectedListing2: !!actionResult.llmResponse.selectedListing2,
                          hasContextSelectedListing2: !!updatedContext2.selectedListing2,
                          poolId: actionResult.llmResponse.selectedListing?.poolId,
                          tokenSymbol: actionResult.llmResponse.selectedListing?.tokenSymbol
                        });
                        break;
                      }
                      console.warn(`\u26A0\uFE0F [${requestId}] No listings available and no existing selectedListing/selectedListing2 to use - creating "no results" response`);
                      const userInput = updatedContext2.userInput || "your request";
                      const serviceType2 = formatServiceType || updatedContext2.serviceType || updatedContext2.queryResult?.query?.serviceType || "service";
                      const noResultsResponse = {
                        message: `I couldn't find any ${serviceType2} options matching "${userInput}". Please try a different search term or check back later.`,
                        listings: [],
                        selectedListing: null,
                        selectedListing2: null,
                        iGasCost: 0
                        // No LLM cost for no-results response
                      };
                      updatedContext2.llmResponse = noResultsResponse;
                      updatedContext2.iGasCost = 0;
                      actionResult = {
                        llmResponse: noResultsResponse,
                        listings: [],
                        iGasCost: 0,
                        currentIGas: 0
                      };
                      console.log(`\u2705 [${requestId}] Created "no results" response for empty listings`);
                      break;
                    }
                    const formatFn = import_config.ENABLE_OPENAI ? formatResponseWithOpenAI_CLONED : import_llm2.formatResponseWithDeepSeek;
                    console.log(`\u{1F50D} [${requestId}] About to call formatFn: ${import_config.ENABLE_OPENAI ? "formatResponseWithOpenAI_CLONED" : "formatResponseWithDeepSeek"}`);
                    console.log(`\u{1F50D} [${requestId}] ========================================`);
                    console.log(`\u{1F50D} [${requestId}] LISTINGS BEING PASSED TO LLM:`);
                    console.log(`\u{1F50D} [${requestId}]   - listingsCount: ${availableListings.length}`);
                    console.log(`\u{1F50D} [${requestId}]   - serviceType: ${updatedContext2.serviceType || "N/A"}`);
                    if (availableListings.length > 0) {
                      const firstListing = availableListings[0];
                      console.log(`\u{1F50D} [${requestId}]   - First listing keys:`, Object.keys(firstListing));
                      console.log(`\u{1F50D} [${requestId}]   - First listing (full):`, JSON.stringify(firstListing, null, 2));
                      console.log(`\u{1F50D} [${requestId}]   - Is DEX pool:`, !!(firstListing?.poolId || firstListing?.tokenSymbol));
                      console.log(`\u{1F50D} [${requestId}]   - Has poolId: ${!!firstListing?.poolId}, has tokenSymbol: ${!!firstListing?.tokenSymbol}, has baseToken: ${!!firstListing?.baseToken}`);
                    } else {
                      console.warn(`\u26A0\uFE0F [${requestId}]   - WARNING: No listings available to pass to LLM!`);
                    }
                    console.log(`\u{1F50D} [${requestId}]   - userInput: ${updatedContext2.userInput?.substring(0, 100) || "N/A"}`);
                    console.log(`\u{1F50D} [${requestId}]   - filters:`, JSON.stringify(updatedContext2.queryResult?.query?.filters || {}));
                    console.log(`\u{1F50D} [${requestId}] ========================================`);
                    console.log(`\u{1F50D} [${requestId}] Calling formatFn with:`, {
                      listingsCount: availableListings.length,
                      userInput: updatedContext2.userInput?.substring(0, 50) || "N/A",
                      filters: updatedContext2.queryResult?.query?.filters
                    });
                    const userInputForFormatting = updatedContext2.userInput?.trim() || updatedContext2.input?.trim() || `Find ${processedAction.serviceType || updatedContext2.serviceType || updatedContext2.queryResult?.serviceType || serviceType || "movie"} service options`;
                    if (!updatedContext2.userInput?.trim() && !updatedContext2.input?.trim()) {
                      console.warn(`\u26A0\uFE0F [${requestId}] userInput is empty, using fallback: "${userInputForFormatting}"`);
                    }
                    const llmResponse = await formatFn(
                      availableListings,
                      userInputForFormatting,
                      {
                        ...updatedContext2.queryResult?.query?.filters || {},
                        serviceType: processedAction.serviceType || updatedContext2.serviceType || updatedContext2.queryResult?.serviceType || serviceType || "movie"
                      }
                    );
                    console.log(`\u{1F50D} [${requestId}] ========================================`);
                    console.log(`\u{1F50D} [${requestId}] formatFn returned, llmResponse received`);
                    console.log(`\u{1F50D} [${requestId}] llmResponse keys:`, Object.keys(llmResponse));
                    console.log(`\u{1F50D} [${requestId}]   - hasSelectedListing: ${!!llmResponse.selectedListing}`);
                    console.log(`\u{1F50D} [${requestId}]   - hasSelectedListing2: ${!!llmResponse.selectedListing2}`);
                    console.log(`\u{1F50D} [${requestId}]   - selectedListingType: ${typeof llmResponse.selectedListing}`);
                    console.log(`\u{1F50D} [${requestId}]   - selectedListing2Type: ${typeof llmResponse.selectedListing2}`);
                    console.log(`\u{1F50D} [${requestId}]   - selectedListingValue:`, llmResponse.selectedListing ? JSON.stringify(llmResponse.selectedListing).substring(0, 200) : "NULL/UNDEFINED");
                    console.log(`\u{1F50D} [${requestId}]   - selectedListing2Value:`, llmResponse.selectedListing2 ? JSON.stringify(llmResponse.selectedListing2).substring(0, 200) : "NULL/UNDEFINED");
                    console.log(`\u{1F50D} [${requestId}]   - selectedListingKeys:`, llmResponse.selectedListing ? Object.keys(llmResponse.selectedListing).join(", ") : "N/A");
                    console.log(`\u{1F50D} [${requestId}]   - selectedListing2Keys:`, llmResponse.selectedListing2 ? Object.keys(llmResponse.selectedListing2).join(", ") : "N/A");
                    console.log(`\u{1F50D} [${requestId}]   - listingsCount: ${llmResponse.listings?.length || 0}`);
                    console.log(`\u{1F50D} [${requestId}]   - message: ${llmResponse.message?.substring(0, 100) || "N/A"}`);
                    console.log(`\u{1F50D} [${requestId}]   - iGasCost: ${llmResponse.iGasCost}`);
                    console.log(`\u{1F50D} [${requestId}] ========================================`);
                    console.log(`\u{1F50D} [${requestId}] FULL LLM RESPONSE OBJECT:`);
                    console.log(JSON.stringify(llmResponse, null, 2));
                    console.log(`\u{1F50D} [${requestId}] ========================================`);
                    console.log(`


`);
                    console.log(`\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
                    console.log(`\u2551                    \u{1F50D}\u{1F50D}\u{1F50D} selectedListing2 DEBUG \u{1F50D}\u{1F50D}\u{1F50D}                        \u2551`);
                    console.log(`\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`);
                    console.log(`[${requestId}] ========================================`);
                    console.log(`[${requestId}] SELECTEDLISTING2 DETAILED INSPECTION:`);
                    console.log(`[${requestId}]   - llmResponse.selectedListing2 exists: ${!!llmResponse.selectedListing2}`);
                    console.log(`[${requestId}]   - llmResponse.selectedListing2 type: ${typeof llmResponse.selectedListing2}`);
                    console.log(`[${requestId}]   - llmResponse.selectedListing2 is array: ${Array.isArray(llmResponse.selectedListing2)}`);
                    if (llmResponse.selectedListing2) {
                      console.log(`[${requestId}]   - llmResponse.selectedListing2 (FULL):`, JSON.stringify(llmResponse.selectedListing2, null, 2));
                      if (Array.isArray(llmResponse.selectedListing2)) {
                        console.log(`[${requestId}]   - selectedListing2 array length: ${llmResponse.selectedListing2.length}`);
                        if (llmResponse.selectedListing2.length > 0) {
                          console.log(`[${requestId}]   - First item in selectedListing2 array:`, JSON.stringify(llmResponse.selectedListing2[0], null, 2));
                        }
                      } else {
                        console.log(`[${requestId}]   - selectedListing2 keys:`, Object.keys(llmResponse.selectedListing2));
                      }
                    } else {
                      console.log(`[${requestId}]   - \u26A0\uFE0F\u26A0\uFE0F\u26A0\uFE0F WARNING: llmResponse.selectedListing2 is NULL/UNDEFINED! \u26A0\uFE0F\u26A0\uFE0F\u26A0\uFE0F`);
                    }
                    console.log(`[${requestId}] ========================================`);
                    console.log(`\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
                    console.log(`\u2551                    \u{1F50D}\u{1F50D}\u{1F50D} END selectedListing2 DEBUG \u{1F50D}\u{1F50D}\u{1F50D}                    \u2551`);
                    console.log(`\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`);
                    console.log(`


`);
                    updatedContext2.llmResponse = llmResponse;
                    updatedContext2.iGasCost = llmResponse.iGasCost;
                    if (llmResponse.selectedListing) {
                      updatedContext2.selectedListing = llmResponse.selectedListing;
                      if (llmResponse.selectedListing2) {
                        updatedContext2.selectedListing2 = llmResponse.selectedListing2;
                        console.log(`\u2705 [${requestId}] Using selectedListing and selectedListing2 from llmResponse`);
                      } else {
                        updatedContext2.selectedListing2 = llmResponse.selectedListing;
                        llmResponse.selectedListing2 = llmResponse.selectedListing;
                        console.log(`\u2705 [${requestId}] Using selectedListing from llmResponse, also set as selectedListing2`);
                      }
                    } else if (availableListings.length > 0) {
                      console.warn(`\u26A0\uFE0F [${requestId}] llmResponse.selectedListing is null/undefined, falling back to first listing`);
                      const fallbackListing = availableListings[0];
                      updatedContext2.selectedListing = fallbackListing;
                      updatedContext2.selectedListing2 = fallbackListing;
                      llmResponse.selectedListing = fallbackListing;
                      llmResponse.selectedListing2 = fallbackListing;
                      console.log(`\u2705 [${requestId}] Set fallback selectedListing and selectedListing2:`, {
                        id: fallbackListing.id,
                        providerId: fallbackListing.providerId,
                        poolId: fallbackListing?.poolId,
                        tokenSymbol: fallbackListing?.tokenSymbol
                      });
                    } else {
                      throw new Error("No listings available and LLM didn't return selectedListing");
                    }
                    const finalListings = llmResponse.listings && Array.isArray(llmResponse.listings) && llmResponse.listings.length > 0 ? llmResponse.listings : availableListings;
                    updatedContext2.listings = finalListings;
                    actionResult = {
                      llmResponse,
                      listings: finalListings,
                      // Use final listings (from LLM or original)
                      iGasCost: llmResponse.iGasCost,
                      currentIGas: llmResponse.iGasCost,
                      // CRITICAL: Also include selectedListing directly in actionResult so it's merged into context
                      selectedListing: updatedContext2.selectedListing,
                      selectedListing2: updatedContext2.selectedListing2
                    };
                    console.log(`\u2705 [${requestId}] Set listings in actionResult: ${finalListings.length} listings`);
                    console.log(`\u2705 [${requestId}] Updated updatedContext.listings: ${updatedContext2.listings?.length || 0} listings`);
                    console.log(`\u2705 [${requestId}] ========================================`);
                    console.log(`\u2705 [${requestId}] FINAL VERIFICATION:`);
                    console.log(`\u2705 [${requestId}]   - actionResult.llmResponse.selectedListing: ${actionResult.llmResponse.selectedListing ? "SET" : "NOT SET"}`);
                    console.log(`\u2705 [${requestId}]   - actionResult.llmResponse.selectedListing2: ${actionResult.llmResponse.selectedListing2 ? "SET" : "NOT SET"}`);
                    console.log(`\u2705 [${requestId}]   - updatedContext.selectedListing: ${updatedContext2.selectedListing ? "SET" : "NOT SET"}`);
                    console.log(`\u2705 [${requestId}]   - updatedContext.selectedListing2: ${updatedContext2.selectedListing2 ? "SET" : "NOT SET"}`);
                    console.log(`\u2705 [${requestId}] ========================================`);
                  } else {
                    console.warn(`\u26A0\uFE0F [${requestId}] Unmatched action type in default case: "${action.type}"`);
                    console.warn(`\u26A0\uFE0F [${requestId}] This action type is not handled by any case in the switch statement`);
                    console.warn(`\u26A0\uFE0F [${requestId}] Available action types should include: llm_format_response, query_dex_pools, etc.`);
                    throw new Error(`Unknown action type: ${action.type}. This action is not implemented in the workflow execution handler.`);
                  }
              }
              Object.assign(updatedContext2, actionResult);
              if (actionResult.listings && Array.isArray(actionResult.listings) && actionResult.listings.length > 0) {
                updatedContext2.listings = actionResult.listings;
                console.log(`   \u2705 [${requestId}] Preserved ${actionResult.listings.length} listings from actionResult`);
              } else if (actionResult.llmResponse?.listings && Array.isArray(actionResult.llmResponse.listings) && actionResult.llmResponse.listings.length > 0) {
                updatedContext2.listings = actionResult.llmResponse.listings;
                console.log(`   \u2705 [${requestId}] Preserved ${actionResult.llmResponse.listings.length} listings from actionResult.llmResponse`);
              }
              console.log(`   \u{1F4CB} [${requestId}] After ${action.type}: listings=${updatedContext2.listings?.length || 0}, llmResponse=${!!updatedContext2.llmResponse}, selectedListing=${!!updatedContext2.selectedListing}`);
              executedActions.push({
                type: action.type,
                success: true,
                result: actionResult
              });
            } catch (actionError) {
              console.error(`   \u274C [${requestId}] Action failed: ${action.type}`, actionError.message);
              executedActions.push({
                type: action.type,
                success: false,
                error: actionError.message
              });
              throw actionError;
            }
          }
        }
        if (step2.websocketEvents) {
          for (const event of step2.websocketEvents) {
            const processedEvent = replaceTemplateVariables2(event, updatedContext2);
            processedEvent.data = processedEvent.data || {};
            processedEvent.data.executionId = executionId2;
            processedEvent.data.serviceType = serviceType;
            processedEvent.data.stepId = stepId2;
            if (!processedEvent.timestamp || isNaN(processedEvent.timestamp)) {
              processedEvent.timestamp = Date.now();
            }
            events2.push(processedEvent);
            if (processedEvent.type === "igas") {
              console.log(`   \u26FD [${requestId}] iGas event data:`, processedEvent.data);
              console.log(`   \u26FD [${requestId}] iGas value type:`, typeof processedEvent.data?.igas);
              console.log(`   \u26FD [${requestId}] Full processed iGas event:`, JSON.stringify(processedEvent, null, 2));
            }
            try {
              broadcastEvent(processedEvent);
              console.log(`   \u{1F4E1} [${requestId}] Broadcast event: ${event.type}`);
            } catch (broadcastError) {
              console.warn(`   \u26A0\uFE0F [${requestId}] Failed to broadcast event: ${event.type}`, broadcastError);
            }
          }
        }
        if (step2.outputs) {
          const processedOutputs = replaceTemplateVariables2(step2.outputs, updatedContext2);
          Object.assign(updatedContext2, processedOutputs);
        }
        let nextStepId = null;
        const transitions = workflow2.transitions.filter((t) => t.from === stepId2);
        console.log(`   \u{1F50D} [${requestId}] ========================================`);
        console.log(`   \u{1F50D} [${requestId}] EVALUATING TRANSITIONS FROM STEP: ${stepId2}`);
        console.log(`   \u{1F50D} [${requestId}] ========================================`);
        console.log(`   \u{1F50D} [${requestId}] Context keys:`, Object.keys(updatedContext2));
        console.log(`   \u{1F50D} [${requestId}] updatedContext.listings: ${updatedContext2.listings?.length || 0} (${updatedContext2.listings ? "EXISTS" : "MISSING"})`);
        console.log(`   \u{1F50D} [${requestId}] updatedContext.llmResponse: ${!!updatedContext2.llmResponse}`);
        console.log(`   \u{1F50D} [${requestId}] updatedContext.llmResponse.listings: ${updatedContext2.llmResponse?.listings?.length || 0} (${updatedContext2.llmResponse?.listings ? "EXISTS" : "MISSING"})`);
        console.log(`   \u{1F50D} [${requestId}] llmResponse.selectedListing:`, updatedContext2.llmResponse?.selectedListing);
        console.log(`   \u{1F50D} [${requestId}] llmResponse.selectedListing2:`, updatedContext2.llmResponse?.selectedListing2);
        console.log(`   \u{1F50D} [${requestId}] Found ${transitions.length} transitions from ${stepId2}`);
        for (const transition of transitions) {
          let conditionMet = false;
          if (transition.condition === "always") {
            conditionMet = true;
          } else if (transition.condition) {
            const processedCondition = replaceTemplateVariables2(transition.condition, updatedContext2);
            console.log(`   \u{1F50D} [${requestId}] Evaluating transition: ${stepId2} -> ${transition.to}`);
            console.log(`   \u{1F50D} [${requestId}]   - Original condition: ${transition.condition}`);
            console.log(`   \u{1F50D} [${requestId}]   - Processed condition: ${processedCondition}`);
            if (transition.condition.includes("listings")) {
              console.log(`   \u{1F50D} [${requestId}]   - Condition references listings, checking context:`);
              console.log(`   \u{1F50D} [${requestId}]     - updatedContext.listings: ${updatedContext2.listings?.length || 0}`);
              console.log(`   \u{1F50D} [${requestId}]     - updatedContext.llmResponse?.listings: ${updatedContext2.llmResponse?.listings?.length || 0}`);
            }
            if (processedCondition === transition.condition && processedCondition.includes("{{")) {
              conditionMet = false;
            } else {
              conditionMet = !!processedCondition;
            }
          }
          console.log(`   \u{1F500} [${requestId}] Transition condition "${transition.condition}" -> "${transition.condition === "always" ? "always" : replaceTemplateVariables2(transition.condition, updatedContext2)}" = ${conditionMet ? "TRUE" : "FALSE"} -> ${transition.to}`);
          if (conditionMet) {
            nextStepId = transition.to;
            break;
          }
        }
        console.log(`   \u2705 [${requestId}] ========================================`);
        console.log(`   \u2705 [${requestId}] \u2705 STEP EXECUTION COMPLETE`);
        console.log(`   \u2705 [${requestId}] Step ID: ${stepId2}`);
        console.log(`   \u2705 [${requestId}] Step Name: ${step2.name}`);
        console.log(`   \u2705 [${requestId}] Actions Executed: ${executedActions.length}`);
        console.log(`   \u2705 [${requestId}] Next Step ID: ${nextStepId || "NONE"}`);
        if (nextStepId) {
          const nextStep = workflow2.steps.find((s) => s.id === nextStepId);
          console.log(`   \u2705 [${requestId}] Next Step Name: ${nextStep?.name || "N/A"}`);
          console.log(`   \u2705 [${requestId}] Next Step Component: ${nextStep?.component || "N/A"}`);
        }
        console.log(`   \u2705 [${requestId}] Should Auto-Continue: ${nextStepId && step2.type !== "decision" ? true : false}`);
        console.log(`   \u2705 [${requestId}] ========================================`);
        if (!global.workflowExecutions) {
          global.workflowExecutions = /* @__PURE__ */ new Map();
        }
        const workflowExecutionsForUpdate = global.workflowExecutions;
        const existingExecution = workflowExecutionsForUpdate.get(executionId2);
        if (existingExecution && existingExecution.workflow) {
          existingExecution.context = updatedContext2;
          existingExecution.currentStep = nextStepId || existingExecution.currentStep;
          workflowExecutionsForUpdate.set(executionId2, existingExecution);
        } else {
          console.warn(`\u26A0\uFE0F [${requestId}] No existing execution found for ${executionId2}, creating minimal structure`);
          workflowExecutionsForUpdate.set(executionId2, {
            executionId: executionId2,
            workflow: workflow2,
            context: updatedContext2,
            currentStep: nextStepId || stepId2,
            history: []
          });
        }
        if ((!updatedContext2.listings || updatedContext2.listings.length === 0) && updatedContext2.llmResponse?.listings && Array.isArray(updatedContext2.llmResponse.listings) && updatedContext2.llmResponse.listings.length > 0) {
          updatedContext2.listings = updatedContext2.llmResponse.listings;
          console.log(`   \u{1F504} [${requestId}] Final check: Populated updatedContext.listings from llmResponse (${updatedContext2.llmResponse.listings.length} listings) before returning response`);
        }
        console.log(`   \u{1F4E4} [${requestId}] ========================================`);
        console.log(`   \u{1F4E4} [${requestId}] RETURNING RESPONSE FOR STEP: ${stepId2}`);
        console.log(`   \u{1F4E4} [${requestId}] ========================================`);
        console.log(`   \u{1F4E4} [${requestId}] updatedContext.listings: ${updatedContext2.listings?.length || 0} (${updatedContext2.listings ? "EXISTS" : "MISSING"})`);
        console.log(`   \u{1F4E4} [${requestId}] updatedContext.llmResponse?.listings: ${updatedContext2.llmResponse?.listings?.length || 0} (${updatedContext2.llmResponse?.listings ? "EXISTS" : "MISSING"})`);
        console.log(`   \u{1F4E4} [${requestId}] updatedContext keys:`, Object.keys(updatedContext2));
        if (updatedContext2.listings && Array.isArray(updatedContext2.listings) && updatedContext2.listings.length > 0) {
          console.log(`   \u{1F4E4} [${requestId}] First listing in response:`, JSON.stringify(updatedContext2.listings[0], null, 2).substring(0, 500));
        }
        console.log(`   \u{1F4E4} [${requestId}] nextStepId: ${nextStepId}`);
        console.log(`   \u{1F4E4} [${requestId}] events count: ${events2.length}`);
        if (events2.length > 0 && events2[0].data?.options) {
          console.log(`   \u{1F4E4} [${requestId}] First event options count: ${Array.isArray(events2[0].data.options) ? events2[0].data.options.length : "N/A"}`);
        }
        console.log(`   \u{1F4E4} [${requestId}] ========================================`);
        sendResponse(200, {
          success: true,
          message: `Step ${stepId2} executed atomically`,
          result: {
            stepId: stepId2,
            executedActions,
            events: events2,
            updatedContext: updatedContext2,
            nextStepId,
            shouldAutoContinue: nextStepId && step2.type !== "decision" ? true : false
          }
        });
        const shouldAutoContinue = nextStepId && step2.type !== "decision";
        const autoContinueStepId = shouldAutoContinue ? nextStepId : null;
        const autoContinueStep = shouldAutoContinue ? workflow2.steps.find((s) => s.id === nextStepId) : null;
        const hasAlwaysTransition = shouldAutoContinue && autoContinueStep ? workflow2.transitions.filter((t) => t.from === stepId2 && t.to === nextStepId).some((t) => t.condition === "always" || !t.condition) : false;
        console.log(`   \u{1F50D} [${requestId}] ========================================`);
        console.log(`   \u{1F50D} [${requestId}] \u{1F50D} CHECKING AUTO-CONTINUATION CONDITIONS`);
        console.log(`   \u{1F50D} [${requestId}] hasAlwaysTransition: ${hasAlwaysTransition}`);
        console.log(`   \u{1F50D} [${requestId}] autoContinueStep: ${autoContinueStep ? autoContinueStep.name : "null"}`);
        console.log(`   \u{1F50D} [${requestId}] autoContinueStepId: ${autoContinueStepId}`);
        console.log(`   \u{1F50D} [${requestId}] stepId: ${stepId2}`);
        console.log(`   \u{1F50D} [${requestId}] nextStepId: ${nextStepId}`);
        console.log(`   \u{1F50D} [${requestId}] ========================================`);
        const autoContinueInfo = hasAlwaysTransition && autoContinueStep && autoContinueStep.type !== "decision" && autoContinueStepId ? {
          stepId: autoContinueStepId,
          step: autoContinueStep,
          context: updatedContext2,
          workflow: workflow2,
          executionId: executionId2
        } : null;
        console.log(`   \u{1F50D} [${requestId}] autoContinueInfo: ${autoContinueInfo ? "SET" : "NULL"}`);
        if (autoContinueInfo) {
          console.log(`   \u{1F50D} [${requestId}] autoContinueInfo.stepId: ${autoContinueInfo.stepId}`);
          console.log(`   \u{1F50D} [${requestId}] autoContinueInfo.step.name: ${autoContinueInfo.step.name}`);
        }
      } catch (error) {
        console.error(`   \u274C [${requestId}] Error executing step atomically:`, error.message);
        if (step.errorHandling && step.errorHandling.onError) {
          console.log(`   \u26A0\uFE0F [${requestId}] Step has errorHandling, transitioning to: ${step.errorHandling.onError}`);
          updatedContext.error = {
            component: step.component || "unknown",
            message: error.message,
            stepId,
            stepName: step.name,
            error: error.message,
            stack: error.stack
          };
          console.log(`   \u274C [${requestId}] ========================================`);
          console.log(`   \u274C [${requestId}] ERROR OCCURRED IN STEP: ${stepId} (${step.name})`);
          console.log(`   \u274C [${requestId}] Component: ${step.component || "unknown"}`);
          console.log(`   \u274C [${requestId}] Error Message: ${error.message}`);
          console.log(`   \u274C [${requestId}] Error Stack: ${error.stack?.substring(0, 200) || "N/A"}`);
          console.log(`   \u274C [${requestId}] Error object set in context:`, JSON.stringify(updatedContext.error, null, 2));
          console.log(`   \u274C [${requestId}] Context keys after setting error:`, Object.keys(updatedContext));
          console.log(`   \u274C [${requestId}] Transitioning to error handler: ${step.errorHandling.onError}`);
          console.log(`   \u274C [${requestId}] ========================================`);
          if (step.errorHandling.errorEvents) {
            for (const event of step.errorHandling.errorEvents) {
              const processedEvent = (0, import_flowwise.replaceTemplateVariables)(event, updatedContext);
              if (!processedEvent.timestamp || isNaN(processedEvent.timestamp)) {
                processedEvent.timestamp = Date.now();
              }
              events.push(processedEvent);
              try {
                broadcastEvent(processedEvent);
                console.log(`   \u{1F4E1} [${requestId}] Broadcast error event: ${event.type}`);
              } catch (broadcastError) {
                console.warn(`   \u26A0\uFE0F [${requestId}] Failed to broadcast error event: ${event.type}`, broadcastError);
              }
            }
          }
          const errorHandlerStep = workflow.steps.find((s) => s.id === step.errorHandling.onError);
          if (errorHandlerStep) {
            console.log(`   \u{1F504} [${requestId}] Transitioning to error handler step: ${errorHandlerStep.id} (${errorHandlerStep.name})`);
            if (errorHandlerStep.websocketEvents) {
              for (const event of errorHandlerStep.websocketEvents) {
                const processedEvent = (0, import_flowwise.replaceTemplateVariables)(event, updatedContext);
                if (!processedEvent.timestamp || isNaN(processedEvent.timestamp)) {
                  processedEvent.timestamp = Date.now();
                }
                events.push(processedEvent);
                try {
                  broadcastEvent(processedEvent);
                  console.log(`   \u{1F4E1} [${requestId}] Broadcast event: ${event.type}`);
                } catch (broadcastError) {
                  console.warn(`   \u26A0\uFE0F [${requestId}] Failed to broadcast event: ${event.type}`, broadcastError);
                }
              }
            }
            if (!global.workflowExecutions) {
              global.workflowExecutions = /* @__PURE__ */ new Map();
            }
            const workflowExecutions = global.workflowExecutions;
            const existingExecution = workflowExecutions.get(executionId);
            if (existingExecution && existingExecution.workflow) {
              existingExecution.context = updatedContext;
              existingExecution.currentStep = step.errorHandling.onError;
              workflowExecutions.set(executionId, existingExecution);
            } else {
              workflowExecutions.set(executionId, {
                executionId,
                workflow,
                context: updatedContext,
                currentStep: step.errorHandling.onError,
                history: []
              });
            }
            sendResponse(200, {
              success: true,
              message: `Step ${stepId} failed, transitioned to error handler`,
              result: {
                stepId: step.errorHandling.onError,
                errorStepId: stepId,
                error: error.message,
                events,
                updatedContext,
                nextStepId: null,
                shouldAutoContinue: false
              }
            });
            return;
          } else {
            console.error(`   \u274C [${requestId}] Error handler step not found: ${step.errorHandling.onError}`);
          }
        }
        sendResponse(500, { success: false, error: error.message });
      }
    });
    return;
  }
  if (pathname === "/api/workflow/generate" && req.method === "POST") {
    console.log(`   \u{1F527} [${requestId}] POST /api/workflow/generate - Generating workflow`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      const sendResponse = (statusCode, data) => {
        if (!res.headersSent) {
          res.writeHead(statusCode, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          });
          res.end(JSON.stringify(data));
        }
      };
      try {
        const parsedBody = JSON.parse(body);
        const { serviceType } = parsedBody;
        if (!serviceType) {
          sendResponse(400, { success: false, error: "serviceType is required" });
          return;
        }
        let templatePath = path.join(__dirname, "data", "movie.json");
        if (!fs.existsSync(templatePath)) {
          templatePath = path.join(__dirname, "data", "amc_cinema.json");
          if (!fs.existsSync(templatePath)) {
            sendResponse(404, { success: false, error: "Template workflow not found" });
            return;
          }
        }
        const templateContent = fs.readFileSync(templatePath, "utf-8");
        const template = JSON.parse(templateContent);
        console.log(`   \u{1F916} [${requestId}] Generating workflow for service type: ${serviceType}`);
        const OPENAI_API_KEY2 = process.env.OPENAI_API_KEY;
        if (!OPENAI_API_KEY2 && import_config.ENABLE_OPENAI) {
          console.error(`   \u274C [${requestId}] OpenAI API key not configured`);
          sendResponse(400, {
            success: false,
            error: "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable or disable OpenAI in config."
          });
          return;
        }
        const generatedWorkflow = await generateWorkflowFromTemplate(template, serviceType);
        const outputPath = path.join(__dirname, "data", `${serviceType}.json`);
        const outputContent = JSON.stringify(generatedWorkflow, null, 2);
        fs.writeFileSync(outputPath, outputContent, "utf-8");
        console.log(`   \u2705 [${requestId}] Workflow generated and saved: ${outputPath}`);
        sendResponse(200, {
          success: true,
          workflow: generatedWorkflow.flowwiseWorkflow,
          filename: `${serviceType}.json`
        });
      } catch (error) {
        console.error(`   \u274C [${requestId}] Error generating workflow:`, error.message);
        sendResponse(500, { success: false, error: error.message });
      }
    });
    return;
  }
  if (pathname === "/api/workflow/decision" && req.method === "POST") {
    console.log(`   \u{1F914} [${requestId}] POST /api/workflow/decision - User decision submission (NEW ARCHITECTURE: Using FlowWiseService)`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      const sendResponse = (statusCode, data) => {
        if (!res.headersSent) {
          console.log(`   \u{1F4E4} [${requestId}] Response: ${statusCode} ${statusCode === 200 ? "OK" : "ERROR"} (${JSON.stringify(data).length} bytes)`);
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        }
      };
      try {
        const parsedBody = JSON.parse(body);
        const { workflowId, decision, selectionData, stepId: stepId2 } = parsedBody;
        console.log(`   \u{1F50D} [${requestId}] Request body parsed:`, {
          hasWorkflowId: !!workflowId,
          workflowId,
          hasDecision: !!decision,
          decision,
          hasSelectionData: !!selectionData,
          hasStepId: !!stepId2,
          stepId: stepId2,
          bodyKeys: Object.keys(parsedBody)
        });
        if (!workflowId) {
          console.error(`   \u274C [${requestId}] Missing required field: workflowId`);
          console.error(`   \u274C [${requestId}] Parsed body:`, JSON.stringify(parsedBody, null, 2));
          sendResponse(400, {
            success: false,
            error: `Missing required field: workflowId`,
            received: {
              workflowId: workflowId || null,
              decision: decision || null,
              selectionData: selectionData || null,
              stepId: stepId2 || null
            }
          });
          return;
        }
        let currentStep;
        try {
          if (!global.workflowExecutions) {
            global.workflowExecutions = /* @__PURE__ */ new Map();
          }
          const workflowExecutions = global.workflowExecutions;
          const execution = workflowExecutions.get(workflowId);
          currentStep = execution?.currentStep;
        } catch (e) {
        }
        let finalDecision = decision;
        if (!finalDecision && selectionData) {
          if (currentStep === "view_movie") {
            console.error(`   \u{1F3AC} [${requestId}] ========================================`);
            console.error(`   \u{1F3AC} [${requestId}] ERROR: view_movie step received selectionData instead of explicit decision!`);
            console.error(`   \u{1F3AC} [${requestId}] view_movie requires an explicit decision: "DONE_WATCHING"`);
            console.error(`   \u{1F3AC} [${requestId}] SelectionData provided:`, selectionData);
            console.error(`   \u{1F3AC} [${requestId}] This is likely a stale selection from a previous step`);
            console.error(`   \u{1F3AC} [${requestId}] ========================================`);
            sendResponse(400, {
              success: false,
              error: `Invalid request for view_movie step: received selectionData but expected explicit decision "DONE_WATCHING". This is likely a stale selection from a previous step.`,
              code: "INVALID_SELECTION_FOR_VIEW_MOVIE",
              currentStep: "view_movie",
              requiredDecision: "DONE_WATCHING"
            });
            return;
          }
          finalDecision = selectionData.id || selectionData.providerId || selectionData.movieId || selectionData.poolId || JSON.stringify(selectionData);
          console.log(`   \u{1F504} [${requestId}] No decision provided, extracted from selectionData: ${finalDecision}`);
        }
        if (!finalDecision) {
          console.error(`   \u274C [${requestId}] Missing required field: decision (and no selectionData to extract from)`);
          console.error(`   \u274C [${requestId}] Parsed body:`, JSON.stringify(parsedBody, null, 2));
          sendResponse(400, {
            success: false,
            error: `Missing required field: decision (or selectionData to extract decision from)`,
            received: {
              workflowId: workflowId || null,
              decision: decision || null,
              selectionData: selectionData || null,
              stepId: stepId2 || null
            }
          });
          return;
        }
        console.log(`   \u2705 [${requestId}] ========================================`);
        console.log(`   \u2705 [${requestId}] \u{1F3AF} USER DECISION ENDPOINT HIT! \u{1F3AF}`);
        console.log(`   \u2705 [${requestId}] User ${selectionData ? "selection" : "decision"} submitted: ${finalDecision} for workflow ${workflowId}`);
        console.log(`   \u2705 [${requestId}] Original decision value: ${decision || "none"}`);
        console.log(`   \u2705 [${requestId}] Final decision value: ${finalDecision}`);
        console.log(`   \u2705 [${requestId}] SelectionData provided: ${selectionData ? "yes" : "no"}`);
        if (selectionData) {
          console.log(`   \u2705 [${requestId}] SelectionData type: ${typeof selectionData}`);
          console.log(`   \u2705 [${requestId}] SelectionData keys: ${typeof selectionData === "object" ? Object.keys(selectionData).join(", ") : "N/A"}`);
        }
        console.log(`   \u2705 [${requestId}] StepId: ${stepId2 || "not provided"}`);
        console.log(`   \u2705 [${requestId}] ========================================`);
        const executionId2 = workflowId;
        console.log(`   \u{1F510} [${requestId}] ========================================`);
        console.log(`   \u{1F510} [${requestId}] Using FlowWiseService to process user decision`);
        console.log(`   \u{1F510} [${requestId}] ExecutionId: ${executionId2}, Decision: ${finalDecision}, SelectionData: ${selectionData ? "provided" : "none"}`);
        console.log(`   \u{1F510} [${requestId}] About to call submitUserDecisionToFlowWise...`);
        console.log(`   \u{1F510} [${requestId}] ========================================`);
        try {
          const result = await (0, import_flowwiseService.submitUserDecision)(executionId2, finalDecision, selectionData);
          console.log(`   \u2705 [${requestId}] FlowWiseService processed decision successfully`);
          console.log(`   \u2705 [${requestId}] Next instruction type: ${result.instruction.type}`);
          sendResponse(200, {
            success: true,
            message: `${selectionData ? "Selection" : "Decision"} submitted successfully`,
            decision: finalDecision,
            selectionData,
            instruction: result.instruction
          });
        } catch (error) {
          console.error(`   \u274C [${requestId}] Error processing decision with FlowWiseService:`, error.message);
          console.error(`   \u274C [${requestId}] Error stack:`, error.stack);
          console.error(`   \u274C [${requestId}] Full error:`, error);
          if (error.message && error.message.includes("Invalid decision for view_movie step")) {
            sendResponse(400, {
              success: false,
              error: error.message,
              message: 'Invalid decision submitted. The workflow is waiting for "DONE_WATCHING" decision, but received a movie selection instead. Please click "Done Watching" button.',
              code: "INVALID_DECISION_FOR_VIEW_MOVIE"
            });
          } else {
            sendResponse(500, { success: false, error: error.message, stack: error.stack });
          }
        }
      } catch (error) {
        console.error(`   \u274C [${requestId}] Error parsing request:`, error.message);
        sendResponse(500, { success: false, error: error.message });
      }
    });
    return;
  }
  const sendChatHistoryResponse = (statusCode, data) => {
    if (!res.headersSent) {
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    }
  };
  if ((pathname === "/api/chat-history/history" || pathname === "/api/chat-history/history/") && req.method === "GET") {
    try {
      const queryParams = new URL(req.url || "", `http://${req.headers.host}`).searchParams;
      const conversationId = String(queryParams.get("conversationId") || "").trim();
      const limitRaw = parseInt(String(queryParams.get("limit") || "50"));
      const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
      const beforeRaw = queryParams.get("before") ? parseInt(String(queryParams.get("before"))) : void 0;
      const before = typeof beforeRaw === "number" && Number.isFinite(beforeRaw) ? beforeRaw : void 0;
      if (!conversationId || !conversationId.startsWith("conv:")) {
        sendChatHistoryResponse(200, { success: true, conversationId, messages: [] });
        return;
      }
      const { getConversationMessages: getConversationMessages2 } = require("./src/chatHistory");
      const startTime = Date.now();
      const messages = getConversationMessages2(conversationId, limit, before);
      const loadTime = Date.now() - startTime;
      if (loadTime > 100) {
        console.log(`\u26A0\uFE0F [Chat History] Slow load: ${loadTime}ms for ${conversationId} (${messages.length} messages)`);
      }
      sendChatHistoryResponse(200, { success: true, conversationId, messages });
    } catch (e) {
      sendChatHistoryResponse(500, { success: false, error: e?.message || "Failed to load chat history" });
    }
    return;
  }
  if ((pathname === "/api/chat-history/append" || pathname === "/api/chat-history/append/") && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk.toString());
    req.on("end", () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const { appendChatMessage } = require("./src/chatHistory");
        const saved = appendChatMessage({
          conversationId: parsed.conversationId,
          id: parsed.id,
          role: parsed.role,
          content: parsed.content,
          timestamp: parsed.timestamp,
          userEmail: parsed.userEmail,
          mode: parsed.mode,
          scope: parsed.scope,
          gardenId: parsed.gardenId,
          serviceType: parsed.serviceType,
          linkedTransactionId: parsed.linkedTransactionId,
          status: parsed.status
        });
        broadcastEvent({
          type: "chat_history_message",
          component: "chatHistory",
          message: "Chat message appended",
          timestamp: Date.now(),
          data: { message: saved }
        });
        sendChatHistoryResponse(200, { success: true, message: saved });
      } catch (e) {
        sendChatHistoryResponse(400, { success: false, error: e?.message || "Failed to append" });
      }
    });
    return;
  }
  if ((pathname === "/api/chat-history/delete" || pathname === "/api/chat-history/delete/") && req.method === "DELETE") {
    let body = "";
    req.on("data", (chunk) => body += chunk.toString());
    req.on("end", () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const conversationId = String(parsed.conversationId || "").trim();
        if (!conversationId || !conversationId.startsWith("conv:")) {
          sendChatHistoryResponse(400, { success: false, error: "Valid conversationId required" });
          return;
        }
        const { deleteConversation } = require("./src/chatHistory");
        const deleted = deleteConversation(conversationId);
        if (deleted) {
          broadcastEvent({
            type: "chat_history_deleted",
            component: "chatHistory",
            message: "Chat history deleted",
            timestamp: Date.now(),
            data: { conversationId }
          });
          sendChatHistoryResponse(200, { success: true, conversationId, deleted: true });
        } else {
          sendChatHistoryResponse(404, { success: false, error: "Conversation not found" });
        }
      } catch (e) {
        sendChatHistoryResponse(500, { success: false, error: e?.message || "Failed to delete chat history" });
      }
    });
    return;
  }
  if (pathname === "/api/identity/register" && req.method === "POST") {
    console.log(`   \u{1F3AD} [${requestId}] POST /api/identity/register - Username registration`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const { googleUserId, email, globalUsername, globalNickname } = parsed;
        if (!googleUserId || !email || !globalUsername) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Missing required fields" }));
          return;
        }
        const user = (0, import_identity.createEdenUser)(googleUserId, email, globalUsername, globalNickname);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, user }));
      } catch (error) {
        console.error(`   \u274C [${requestId}] Registration error:`, error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message || "Registration failed" }));
      }
    });
    return;
  }
  if (pathname === "/api/identity/username/check" && req.method === "GET") {
    const parsed = url.parse(req.url || "/", true);
    const username = parsed.query.username;
    if (!username) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ available: false, error: "Username parameter required" }));
      return;
    }
    const available = (0, import_identity.isUsernameAvailable)(username);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ available }));
    return;
  }
  if (pathname?.startsWith("/api/identity/user/") && req.method === "GET") {
    const userId = pathname.split("/").pop();
    if (!userId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "User ID required" }));
      return;
    }
    const user = (0, import_identity.getEdenUser)(userId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: !!user, user: user || null }));
    return;
  }
  if (pathname?.startsWith("/api/identity/user-by-google/") && req.method === "GET") {
    const googleUserId = pathname.split("/").pop();
    if (!googleUserId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Google User ID required" }));
      return;
    }
    const user = (0, import_identity.getEdenUserByGoogleId)(googleUserId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: !!user, user: user || null }));
    return;
  }
  if (pathname?.startsWith("/api/identity/user-by-email/") && req.method === "GET") {
    const email = decodeURIComponent(pathname.split("/").pop() || "");
    if (!email) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Email required" }));
      return;
    }
    const user = (0, import_identity.getEdenUserByEmail)(email);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: !!user, user: user || null }));
    return;
  }
  if (pathname === "/api/identity/garden-user" && req.method === "GET") {
    const parsed = url.parse(req.url || "/", true);
    const userId = parsed.query.userId;
    const gardenId = parsed.query.gardenId;
    if (!userId || !gardenId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "userId and gardenId required" }));
      return;
    }
    const gardenUser = (0, import_identity.getGardenUser)(userId, gardenId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, gardenUser: gardenUser || null }));
    return;
  }
  if (pathname === "/api/identity/garden/join" && req.method === "POST") {
    console.log(`   \u{1F3AD} [${requestId}] POST /api/identity/garden/join - Garden join`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const { userId, gardenId, gardenUsername, gardenNickname } = parsed;
        if (!userId || !gardenId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "userId and gardenId required" }));
          return;
        }
        const gardenUser = (0, import_identity.joinGarden)(userId, gardenId, gardenUsername, gardenNickname);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, gardenUser }));
      } catch (error) {
        console.error(`   \u274C [${requestId}] Garden join error:`, error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message || "Garden join failed" }));
      }
    });
    return;
  }
  if (pathname === "/api/identity/garden-user/nickname" && req.method === "PUT") {
    console.log(`   \u{1F3AD} [${requestId}] PUT /api/identity/garden-user/nickname - Update nickname`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const { userId, gardenId, nickname } = parsed;
        if (!userId || !gardenId || !nickname) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "userId, gardenId, and nickname required" }));
          return;
        }
        const gardenUser = (0, import_identity.updateGardenNickname)(userId, gardenId, nickname);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, gardenUser }));
      } catch (error) {
        console.error(`   \u274C [${requestId}] Nickname update error:`, error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message || "Nickname update failed" }));
      }
    });
    return;
  }
  if (pathname === "/api/messaging/conversations" && req.method === "POST") {
    console.log(`   \u{1F4AC} [${requestId}] POST /api/messaging/conversations - Create conversation`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const { scope, participants, policy, initialMessage, creatorId, creatorType } = parsed;
        if (!scope || !participants || !creatorId || !creatorType) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "scope, participants, creatorId, and creatorType required" }));
          return;
        }
        const conversation = (0, import_conversationService.createConversation)(
          { scope, participants, policy, initialMessage },
          creatorId,
          creatorType
        );
        broadcastEvent({
          type: "conversation_created",
          component: "messaging",
          message: `Conversation created: ${conversation.conversationId}`,
          data: { conversation },
          timestamp: Date.now()
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, conversation }));
      } catch (error) {
        console.error(`   \u274C [${requestId}] Create conversation error:`, error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message || "Failed to create conversation" }));
      }
    });
    return;
  }
  if (pathname === "/api/messaging/conversations" && req.method === "GET") {
    console.log(`   \u{1F4AC} [${requestId}] GET /api/messaging/conversations - List conversations`);
    const parsed = url.parse(req.url || "/", true);
    const filters = {};
    if (parsed.query.scopeType)
      filters.scopeType = parsed.query.scopeType;
    if (parsed.query.referenceId)
      filters.referenceId = parsed.query.referenceId;
    if (parsed.query.participantId)
      filters.participantId = parsed.query.participantId;
    if (parsed.query.state)
      filters.state = parsed.query.state;
    if (parsed.query.gardenId)
      filters.gardenId = parsed.query.gardenId;
    try {
      const conversations = (0, import_conversationService.getConversations)(filters);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, conversations }));
    } catch (error) {
      console.error(`   \u274C [${requestId}] List conversations error:`, error);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message || "Failed to list conversations" }));
    }
    return;
  }
  if (pathname?.startsWith("/api/messaging/conversations/") && req.method === "GET") {
    const conversationId = pathname.split("/").pop() || "";
    console.log(`   \u{1F4AC} [${requestId}] GET /api/messaging/conversations/${conversationId}`);
    if (!conversationId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "conversationId required" }));
      return;
    }
    const conversation = (0, import_conversationService.getConversation)(conversationId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: !!conversation, conversation: conversation || null }));
    return;
  }
  if (pathname?.startsWith("/api/messaging/conversations/") && pathname.endsWith("/messages") && req.method === "POST") {
    const pathParts = pathname.split("/");
    const conversationId = pathParts[pathParts.length - 2] || "";
    console.log(`   \u{1F4AC} [${requestId}] POST /api/messaging/conversations/${conversationId}/messages`);
    console.log(`   \u{1F4AC} [${requestId}] Full pathname: ${pathname}, Extracted conversationId: ${conversationId}`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const { messageType, payload, replyTo, senderId, senderType, senderRole } = parsed;
        if (!messageType || !payload || !senderId || !senderType) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "messageType, payload, senderId, and senderType required" }));
          return;
        }
        console.log(`   \u{1F4AC} [${requestId}] Sending message: conversationId=${conversationId}, senderId=${senderId}, senderType=${senderType}`);
        const message = (0, import_conversationService.sendMessage)(
          { conversationId, messageType, payload, replyTo },
          senderId,
          senderType,
          senderRole
        );
        console.log(`   \u2705 [${requestId}] Message created: ${message.messageId}`);
        console.log(`   \u2705 [${requestId}] Verifying message storage...`);
        try {
          const verifyMessages = (0, import_conversationService.getConversationMessages)(conversationId, senderId, senderType, senderRole);
          console.log(`   \u2705 [${requestId}] Verification: Found ${verifyMessages.length} messages in conversation (including the one just sent)`);
        } catch (verifyError) {
          console.error(`   \u26A0\uFE0F [${requestId}] Verification failed:`, verifyError.message);
        }
        broadcastEvent({
          type: "message_sent",
          component: "messaging",
          message: `Message sent: ${message.messageId}`,
          data: { message, conversationId },
          timestamp: Date.now()
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message }));
      } catch (error) {
        console.error(`   \u274C [${requestId}] Send message error:`, error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message || "Failed to send message" }));
      }
    });
    return;
  }
  if (pathname?.startsWith("/api/messaging/conversations/") && pathname.endsWith("/messages") && req.method === "GET") {
    const pathParts = pathname.split("/");
    const conversationId = pathParts[pathParts.length - 2] || "";
    console.log(`   \u{1F4AC} [${requestId}] GET /api/messaging/conversations/${conversationId}/messages`);
    console.log(`   \u{1F4AC} [${requestId}] Full pathname: ${pathname}, Extracted conversationId: ${conversationId}`);
    const parsed = url.parse(req.url || "/", true);
    const entityId = parsed.query.entityId;
    const entityType = parsed.query.entityType;
    const entityRole = parsed.query.entityRole;
    console.log(`   \u{1F4AC} [${requestId}] Query params: entityId=${entityId}, entityType=${entityType}, entityRole=${entityRole}`);
    if (!entityId || !entityType) {
      console.error(`   \u274C [${requestId}] Missing required params: entityId=${entityId}, entityType=${entityType}`);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "entityId and entityType required" }));
      return;
    }
    if (!conversationId) {
      console.error(`   \u274C [${requestId}] Missing conversationId from path: ${pathname}`);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Conversation ID required" }));
      return;
    }
    try {
      console.log(`   \u{1F4AC} [${requestId}] Getting messages for conversation ${conversationId}, entity: ${entityId} (${entityType})`);
      const messages = (0, import_conversationService.getConversationMessages)(conversationId, entityId, entityType, entityRole);
      console.log(`   \u2705 [${requestId}] Retrieved ${messages.length} messages`);
      const response = { success: true, messages };
      console.log(`   \u2705 [${requestId}] Sending response with ${messages.length} messages`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      console.log(`   \u2705 [${requestId}] Response sent successfully`);
    } catch (error) {
      console.error(`   \u274C [${requestId}] Get messages error:`, error);
      console.error(`   \u274C [${requestId}] Error details:`, {
        conversationId,
        entityId,
        entityType,
        errorMessage: error.message,
        errorStack: error.stack
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message || "Failed to get messages" }));
    }
    return;
  }
  if (pathname?.startsWith("/api/messaging/messages/") && pathname.endsWith("/forgive") && req.method === "POST") {
    const messageId = pathname.split("/")[4] || "";
    console.log(`   \u{1F4AC} [${requestId}] POST /api/messaging/messages/${messageId}/forgive`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const { reason, forgiverId, forgiverType, forgiverRole } = parsed;
        if (!forgiverId || !forgiverType) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "forgiverId and forgiverType required" }));
          return;
        }
        const message = (0, import_conversationService.forgiveMessage)({ messageId, reason }, forgiverId, forgiverType, forgiverRole);
        broadcastEvent({
          type: "message_forgiven",
          component: "messaging",
          message: `Message forgiven: ${messageId}`,
          data: { message },
          timestamp: Date.now()
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message }));
      } catch (error) {
        console.error(`   \u274C [${requestId}] Forgive message error:`, error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message || "Failed to forgive message" }));
      }
    });
    return;
  }
  if (pathname?.startsWith("/api/messaging/conversations/") && pathname.endsWith("/state") && req.method === "POST") {
    const conversationId = pathname.split("/")[4] || "";
    console.log(`   \u{1F4AC} [${requestId}] POST /api/messaging/conversations/${conversationId}/state`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const { state, reason, updaterId, updaterType, updaterRole } = parsed;
        if (!state || !updaterId || !updaterType) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "state, updaterId, and updaterType required" }));
          return;
        }
        const conversation = (0, import_conversationService.updateConversationState)(
          { conversationId, state, reason },
          updaterId,
          updaterType,
          updaterRole
        );
        broadcastEvent({
          type: "conversation_state_changed",
          component: "messaging",
          message: `Conversation ${conversationId} state changed to ${state}`,
          data: { conversation },
          timestamp: Date.now()
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, conversation }));
      } catch (error) {
        console.error(`   \u274C [${requestId}] Update conversation state error:`, error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message || "Failed to update conversation state" }));
      }
    });
    return;
  }
  if (pathname?.startsWith("/api/messaging/conversations/") && pathname.endsWith("/escalate") && req.method === "POST") {
    const conversationId = pathname.split("/")[4] || "";
    console.log(`   \u{1F4AC} [${requestId}] POST /api/messaging/conversations/${conversationId}/escalate`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const { additionalParticipants, reason, escalatorId, escalatorType, escalatorRole } = parsed;
        if (!additionalParticipants || !reason || !escalatorId || !escalatorType) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "additionalParticipants, reason, escalatorId, and escalatorType required" }));
          return;
        }
        const conversation = (0, import_conversationService.escalateConversation)(
          { conversationId, additionalParticipants, reason },
          escalatorId,
          escalatorType,
          escalatorRole
        );
        broadcastEvent({
          type: "conversation_escalated",
          component: "messaging",
          message: `Conversation ${conversationId} escalated`,
          data: { conversation },
          timestamp: Date.now()
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, conversation }));
      } catch (error) {
        console.error(`   \u274C [${requestId}] Escalate conversation error:`, error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message || "Failed to escalate conversation" }));
      }
    });
    return;
  }
  if (pathname === "/api/chat" && req.method === "POST") {
    console.log(`   \u{1F4E8} [${requestId}] POST /api/chat - Processing chat request`);
    let body = "";
    let bodyReceived = false;
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      if (bodyReceived) {
        console.warn(`   \u26A0\uFE0F  [${requestId}] Request body already processed, ignoring duplicate end event`);
        return;
      }
      bodyReceived = true;
      const sendResponse = (statusCode, data) => {
        if (!res.headersSent) {
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        } else {
          console.warn(`\u26A0\uFE0F  Response already sent, cannot send:`, data);
        }
      };
      let email = "unknown";
      try {
        if (!body || body.trim().length === 0) {
          sendResponse(400, { success: false, error: "Request body is required" });
          return;
        }
        let parsedBody;
        try {
          parsedBody = JSON.parse(body);
        } catch (parseError) {
          sendResponse(400, { success: false, error: "Invalid JSON in request body" });
          return;
        }
        const { input, email: requestEmail } = parsedBody;
        email = requestEmail || "unknown";
        if (!input || typeof input !== "string" || input.trim().length === 0) {
          sendResponse(400, { success: false, error: "Valid input message required" });
          return;
        }
        if (!email || typeof email !== "string" || !email.includes("@")) {
          sendResponse(400, { success: false, error: "Valid email address required" });
          return;
        }
        console.log(`\u{1F4E8} [Chat] ========================================`);
        console.log(`\u{1F4E8} [Chat] Processing chat request from ${email}`);
        console.log(`\u{1F4E8} [Chat] User Input: "${input.trim()}"`);
        console.log(`\u{1F4E8} [Chat] ========================================`);
        let user = import_state.USERS.find((u) => u.email === email);
        if (!user) {
          const nextId = `u${import_state.USERS.length + 1}`;
          user = {
            id: nextId,
            email,
            balance: 0
          };
          import_state.USERS.push(user);
          console.log(`\u{1F464} Created new user: ${email} with ID: ${nextId}`);
        }
        const currentWalletBalance = await (0, import_wallet.getWalletBalance)(email);
        user.balance = currentWalletBalance;
        const isGodChat = body.isGodChat === true;
        console.log(`\u{1F4AC} [Chat] Processing REGULAR TEXT CHAT (informational query only)${isGodChat ? " - GOD CHAT MODE" : ""}`);
        const { buildConversationId } = await import("./src/chatHistory");
        const conversationId = isGodChat ? buildConversationId("service", "god") : buildConversationId("service", "chat", "user");
        const { appendChatMessage } = await import("./src/chatHistory");
        appendChatMessage({
          conversationId,
          role: "USER",
          content: input.trim(),
          userEmail: email,
          serviceType: "chat"
        });
        const hasQuestionPattern = /how (to|does|do|can|will|works?)|what (is|are|does|do|can|will)|who (is|are|does|do|can|will)|explain|tell me about|help|guide/i.test(input.trim());
        const queryLower = input.trim().toLowerCase();
        const isEdenRelated = /\b(eden|garden|workflow|service|messaging|token|movie|ticket|pharmacy|flight|hotel|restaurant|autopart|dex|pool|trade|swap|buy|sell|book|find|order|god|root\s*ca|roca|judgment|settlement)\b/i.test(queryLower) || /\b(book|buy|sell|find|order|trade|swap)\s+(a|an|the|some|my|your)?\s*(movie|ticket|token|pharmacy|flight|hotel|restaurant|autopart)\b/i.test(queryLower);
        const isRAGQuery = hasQuestionPattern && isEdenRelated;
        if (isRAGQuery) {
          console.log(`\u{1F4DA} [Chat] Detected RAG query (Eden-related informational) - using RAG knowledge base`);
          try {
            const { formatResponseWithOpenAI: formatResponseWithOpenAI2 } = await import("./src/llm");
            const llmResponse = await formatResponseWithOpenAI2([], input.trim(), { serviceType: "informational" });
            appendChatMessage({
              conversationId,
              role: "ASSISTANT",
              content: llmResponse.message,
              userEmail: email,
              serviceType: "chat"
            });
            broadcastEvent({
              type: "llm_response",
              component: "llm",
              message: llmResponse.message,
              timestamp: Date.now(),
              data: {
                query: input.trim(),
                response: llmResponse,
                isRAG: true
              }
            });
            sendResponse(200, {
              success: true,
              message: llmResponse.message,
              isRAG: true
            });
            console.log(`\u2705 [Chat] RAG query answered for ${email}`);
            return;
          } catch (error) {
            console.error(`\u274C [Chat] Error processing RAG query:`, error);
            sendResponse(500, {
              success: false,
              error: error.message || "Failed to process RAG query"
            });
            return;
          }
        }
        console.log(`\u{1F4AC} [Chat] Processing as LLM query (general knowledge or informational) - letting LLM handle it`);
        const inputLower = input.trim().toLowerCase();
        const isMessageToGod = isGodChat || /message\s+to\s+god|send\s+to\s+god|tell\s+god|god\s+please|bless\s+me|prayer|pray\s+to|message\s+god|god\s+help|god\s+i\s+need/i.test(inputLower) || inputLower.includes("god") && (inputLower.includes("bless") || inputLower.includes("help") || inputLower.includes("thank"));
        const { formatResponseWithOpenAI, formatResponseWithDeepSeek: formatResponseWithDeepSeek2 } = await import("./src/llm");
        const formatFn = import_config.ENABLE_OPENAI ? formatResponseWithOpenAI : formatResponseWithDeepSeek2;
        try {
          const processedInput = isMessageToGod ? `[GOD CHAT MODE] You are GOD in the Eden ecosystem. The user is directly addressing you. Respond as GOD would - with wisdom, compassion, and understanding. This is a personal message, not a system query. User message: ${input.trim()}` : input.trim();
          const llmResponse = await formatFn(
            [],
            // No listings for informational queries
            processedInput,
            { serviceType: isMessageToGod ? "god_chat" : "informational" }
          );
          if (llmResponse.shouldRouteToGodInbox || isMessageToGod) {
            console.log(`\u26A1 [Chat] Routing message to GOD's inbox for ${email}`);
            try {
              const { createConversation: createConversation2, sendMessage: sendMessage2, getConversations: getConversations2 } = await import("./src/messaging/conversationService");
              const existingConversations = getConversations2({
                scopeType: "GOVERNANCE",
                participantId: email
              });
              let godConversation = existingConversations.find(
                (conv) => conv.participants.includes("ROOT_AUTHORITY") && conv.state === "OPEN"
              );
              if (!godConversation) {
                godConversation = createConversation2(
                  {
                    scope: {
                      type: "GOVERNANCE",
                      referenceId: `god_inbox_${Date.now()}`
                    },
                    participants: [email, "ROOT_AUTHORITY"],
                    policy: {
                      readPermissions: [
                        { entityType: "USER", entityId: email },
                        { entityType: "ROOT_AUTHORITY" }
                      ],
                      writePermissions: [
                        { entityType: "USER", entityId: email },
                        { entityType: "ROOT_AUTHORITY" }
                      ],
                      invitePermissions: [
                        { entityType: "USER", entityId: email },
                        { entityType: "ROOT_AUTHORITY" }
                      ],
                      escalatePermissions: [
                        { entityType: "PRIEST" },
                        { entityType: "ROOT_AUTHORITY" }
                      ],
                      closePermissions: [
                        { entityType: "USER", entityId: email },
                        { entityType: "PRIEST" },
                        { entityType: "ROOT_AUTHORITY" }
                      ]
                    },
                    initialMessage: {
                      messageType: "TEXT",
                      payload: { text: input.trim() },
                      senderId: email,
                      senderType: "USER"
                    }
                  },
                  email,
                  "USER"
                );
                console.log(`\u2705 [Chat] Created GOD inbox conversation: ${godConversation.conversationId}`);
              } else {
                sendMessage2(
                  {
                    conversationId: godConversation.conversationId,
                    messageType: "TEXT",
                    payload: { text: input.trim() },
                    replyTo: void 0
                  },
                  email,
                  "USER",
                  void 0
                  // senderRole
                );
                console.log(`\u2705 [Chat] Sent message to existing GOD inbox conversation: ${godConversation.conversationId}`);
              }
              llmResponse.message = `\u2705 Your message has been sent to GOD's inbox. GOD will review it and respond when appropriate.

Your message: "${input.trim()}"`;
            } catch (godInboxError) {
              console.error(`\u274C [Chat] Error routing to GOD inbox:`, godInboxError);
            }
          }
          appendChatMessage({
            conversationId,
            role: "ASSISTANT",
            content: llmResponse.message,
            userEmail: email,
            serviceType: "chat"
          });
          broadcastEvent({
            type: "llm_response",
            component: "llm",
            message: llmResponse.message,
            timestamp: Date.now(),
            data: {
              query: input.trim(),
              response: llmResponse,
              isLLM: true,
              routedToGodInbox: llmResponse.shouldRouteToGodInbox || isGodChat
            }
          });
          sendResponse(200, {
            success: true,
            message: llmResponse.message,
            isLLM: true,
            routedToGodInbox: llmResponse.shouldRouteToGodInbox || isGodChat
          });
          console.log(`\u2705 [Chat] LLM query handled for ${email}`);
          console.log(`\u{1F4AC} [Chat] Response: "${llmResponse.message.substring(0, 100)}${llmResponse.message.length > 100 ? "..." : ""}"`);
        } catch (error) {
          console.error(`\u274C [Chat] Error processing chat query:`, error);
          sendResponse(500, {
            success: false,
            error: error.message || "Failed to process chat query"
          });
        }
      } catch (outerError) {
        console.error(`\u274C Outer error processing request:`, outerError);
        if (!res.headersSent) {
          sendResponse(500, {
            success: false,
            error: outerError.message || "Internal server error",
            timestamp: Date.now()
          });
        }
      }
    });
    req.on("error", (error) => {
      console.error(`\u274C Request error:`, error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Request processing error" }));
      }
    });
    req.setTimeout(6e4, () => {
      console.error(`\u274C Request timeout`);
      if (!res.headersSent) {
        res.writeHead(408, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Request timeout" }));
      }
      req.destroy();
    });
    return;
  }
  if (pathname === "/api/eden-chat" && req.method === "POST") {
    console.log(`   \u{1F504} [${requestId}] POST /api/eden-chat - Processing Eden workflow chat request`);
    let body = "";
    let bodyReceived = false;
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      if (bodyReceived) {
        console.warn(`   \u26A0\uFE0F  [${requestId}] Request body already processed, ignoring duplicate end event`);
        return;
      }
      bodyReceived = true;
      const sendResponse = (statusCode, data) => {
        if (!res.headersSent) {
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        } else {
          console.warn(`\u26A0\uFE0F  Response already sent, cannot send:`, data);
        }
      };
      let email = "unknown";
      try {
        if (!body || body.trim().length === 0) {
          sendResponse(400, { success: false, error: "Request body is required" });
          return;
        }
        let parsedBody;
        try {
          parsedBody = JSON.parse(body);
        } catch (parseError) {
          sendResponse(400, { success: false, error: "Invalid JSON in request body" });
          return;
        }
        const { input, email: requestEmail } = parsedBody;
        email = requestEmail || "unknown";
        if (!input || typeof input !== "string" || input.trim().length === 0) {
          sendResponse(400, { success: false, error: "Valid input message required" });
          return;
        }
        if (!email || typeof email !== "string" || !email.includes("@")) {
          sendResponse(400, { success: false, error: "Valid email address required" });
          return;
        }
        if (!global.workflowExecutions) {
          global.workflowExecutions = /* @__PURE__ */ new Map();
        }
        const workflowExecutions = global.workflowExecutions;
        for (const [executionId2, execution] of workflowExecutions.entries()) {
          const executionUserEmail = execution.context?.user?.email;
          if (executionUserEmail === email) {
            const currentStep = execution.workflow?.steps?.find((s) => s.id === execution.currentStep);
            if (currentStep?.type === "decision" && currentStep?.requiresUserDecision) {
              console.log(`   \u{1F914} [${requestId}] Found pending decision for execution ${executionId2}, using LLM to determine if input is a decision response...`);
              try {
                const { replaceTemplateVariables: replaceTemplateVariables2 } = await import("./src/flowwise");
                const context = execution.context || {};
                let decisionPrompt = currentStep.decisionPrompt || "Please make a decision";
                if (currentStep.decisionPrompt) {
                  decisionPrompt = replaceTemplateVariables2(currentStep.decisionPrompt, context);
                  console.log(`   \u{1F50D} [${requestId}] Processed decision prompt: "${decisionPrompt}"`);
                }
                let decisionOptions = [];
                if (currentStep.decisionOptions && Array.isArray(currentStep.decisionOptions) && currentStep.decisionOptions.length > 0) {
                  decisionOptions = currentStep.decisionOptions.map((opt) => ({
                    value: opt.value,
                    label: replaceTemplateVariables2(opt.label || "", context)
                  }));
                  console.log(`   \u{1F50D} [${requestId}] Processed ${decisionOptions.length} decision options`);
                }
                const { determineDecisionResponse } = await import("./src/llm");
                const decisionResult = await determineDecisionResponse(
                  input,
                  decisionPrompt,
                  decisionOptions
                );
                if (decisionResult.isDecisionResponse) {
                  console.log(`   \u2705 [${requestId}] LLM determined input "${input}" is a decision response: ${decisionResult.decisionValue}`);
                  const { submitUserDecisionToFlowWise: submitUserDecisionToFlowWise2 } = await import("./src/components/flowwiseService");
                  const result = await submitUserDecisionToFlowWise2(executionId2, decisionResult.decisionValue);
                  sendResponse(200, {
                    success: true,
                    message: "Decision processed successfully",
                    decision: decisionResult.decisionValue,
                    instruction: result.instruction
                  });
                  return;
                } else {
                  console.log(`   \u2139\uFE0F  [${requestId}] LLM determined input "${input}" is NOT a decision response, continuing with normal chat processing`);
                }
              } catch (error) {
                console.error(`   \u274C [${requestId}] Error using LLM to determine decision:`, error.message);
                console.error(`   \u274C [${requestId}] Error stack:`, error.stack);
              }
            }
          }
        }
        console.log(`\u{1F504} [Eden Chat] ========================================`);
        console.log(`\u{1F504} [Eden Chat] Processing Eden workflow chat request from ${email}`);
        console.log(`\u{1F504} [Eden Chat] User Input: "${input.trim()}"`);
        console.log(`\u{1F504} [Eden Chat] ========================================`);
        let user = import_state.USERS.find((u) => u.email === email);
        if (!user) {
          const nextId = `u${import_state.USERS.length + 1}`;
          user = {
            id: nextId,
            email,
            balance: 0
          };
          import_state.USERS.push(user);
          console.log(`\u{1F464} Created new user: ${email} with ID: ${nextId}`);
        }
        const currentWalletBalance = await (0, import_wallet.getWalletBalance)(email);
        user.balance = currentWalletBalance;
        console.log(`\u{1F504} [Eden Chat] Processing EDEN CHAT (workflow/service query) - starting workflow`);
        try {
          const { startWorkflowFromUserInput: startWorkflowFromUserInput2 } = await import("./src/components/flowwiseService");
          const workflowResult = await startWorkflowFromUserInput2(
            input.trim(),
            user
            // serviceType is now optional - LLM service mapper will determine it from user input
          );
          broadcastEvent({
            type: "workflow_started",
            component: "workflow",
            message: `Workflow started: ${workflowResult.executionId}`,
            timestamp: Date.now(),
            data: {
              executionId: workflowResult.executionId,
              currentStep: workflowResult.currentStep,
              instruction: workflowResult.instruction,
              workflowProcessingGas: workflowResult.workflowProcessingGas,
              serviceSelection: workflowResult.serviceSelection
              // Include LLM-selected services
            }
          });
          if (!res.headersSent) {
            sendResponse(200, {
              success: true,
              message: "Eden chat processed successfully",
              executionId: workflowResult.executionId,
              instruction: workflowResult.instruction
            });
            console.log(`\u2705 Eden chat request processed successfully for ${email}, workflow: ${workflowResult.executionId}`);
          } else {
            console.warn(`\u26A0\uFE0F  Response already sent, skipping success response`);
          }
        } catch (error) {
          console.error(`\u274C Error processing Eden chat input:`, error);
          console.error(`   Error stack:`, error.stack);
          if (!res.headersSent) {
            const statusCode = error.message?.includes("Payment failed") ? 402 : error.message?.includes("No listing") ? 404 : error.message?.includes("timeout") ? 408 : 500;
            sendResponse(statusCode, {
              success: false,
              error: error.message || "Internal server error",
              timestamp: Date.now()
            });
          } else {
            console.warn(`\u26A0\uFE0F  Response already sent, cannot send error response`);
          }
        } finally {
          if (!res.headersSent) {
            console.error(`\u274C CRITICAL: No response sent for Eden chat request from ${email}!`);
            sendResponse(500, {
              success: false,
              error: "Unexpected server error - no response was sent",
              timestamp: Date.now()
            });
          } else {
            console.log(`\u2705 Response sent for Eden chat request from ${email}`);
          }
        }
      } catch (outerError) {
        console.error(`\u274C Outer error processing Eden chat request:`, outerError);
        if (!res.headersSent) {
          sendResponse(500, {
            success: false,
            error: outerError.message || "Internal server error",
            timestamp: Date.now()
          });
        }
      }
    });
    req.on("error", (error) => {
      console.error(`\u274C Eden chat request error:`, error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Request processing error" }));
      }
    });
    req.setTimeout(6e4, () => {
      console.error(`\u274C Eden chat request timeout`);
      if (!res.headersSent) {
        res.writeHead(408, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Request timeout" }));
      }
      req.destroy();
    });
    return;
  }
  if (pathname === "/api/test" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /api/test - Test endpoint`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Server is responding", timestamp: Date.now() }));
    return;
  }
  if (pathname === "/api/root-ca/service-registry" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /api/root-ca/service-registry - Listing all service providers`);
    const url2 = new URL(req.url || "", `http://${req.headers.host}`);
    const serviceType = url2.searchParams.get("serviceType");
    const ownerEmail = url2.searchParams.get("ownerEmail");
    const cleanupOrphans = (url2.searchParams.get("cleanupOrphans") || "").toLowerCase() === "true";
    const debugRegistryApi = String(process.env.EDEN_DEBUG_REGISTRY_API || "").toLowerCase() === "true";
    const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
    let allProviders = serviceRegistry2.getAllProviders();
    if (debugRegistryApi) {
      console.log(
        `   \u{1F4CA} [Service Registry API] Total providers in ServiceRegistry2: ${allProviders.length} (by type: movie=${allProviders.filter((p) => p.serviceType === "movie").length}, dex=${allProviders.filter((p) => p.serviceType === "dex").length}, airline=${allProviders.filter((p) => p.serviceType === "airline").length}, infrastructure=${allProviders.filter((p) => ["payment-rail", "settlement", "registry", "webserver", "websocket", "wallet"].includes(p.serviceType)).length})`
      );
    }
    const getOwnerEmailForProvider = (gardenId) => {
      if (gardenId === "HG") {
        return void 0;
      }
      const garden = import_state.GARDENS.find((g) => g.id === gardenId) || import_state.TOKEN_GARDENS.find((g) => g.id === gardenId);
      if (!garden) {
        console.warn(`   \u26A0\uFE0F  [Service Registry API] Provider has gardenId "${gardenId}" but garden not found - this provider may be orphaned`);
        return void 0;
      }
      return garden?.ownerEmail || garden?.priestEmail || void 0;
    };
    const allGardenIds = [...import_state.GARDENS.map((g) => g.id), ...import_state.TOKEN_GARDENS.map((g) => g.id)];
    let persistedGardenIds = [];
    if (cleanupOrphans) {
      const gardensPersistenceFile = path.join(__dirname, "eden-gardens-persistence.json");
      if (fs.existsSync(gardensPersistenceFile)) {
        try {
          const fileContent = fs.readFileSync(gardensPersistenceFile, "utf-8");
          const persisted = JSON.parse(fileContent);
          const persistedGardens = persisted.gardens || persisted.indexers || [];
          persistedGardenIds = persistedGardens.map((g) => g.id);
        } catch (err) {
          console.warn(`   \u26A0\uFE0F  [Service Registry API] Failed to load gardens from persistence file for orphaned check: ${err.message}`);
        }
      }
    }
    const validGardenIds = /* @__PURE__ */ new Set([...allGardenIds, ...persistedGardenIds, "HG"]);
    const orphanedProviders = allProviders.filter((p) => p.gardenId && p.gardenId !== "HG" && !validGardenIds.has(p.gardenId));
    if (orphanedProviders.length > 0) {
      console.warn(`   \u26A0\uFE0F  [Service Registry API] Found ${orphanedProviders.length} orphaned provider(s) with invalid gardenIds: ${orphanedProviders.map((p) => `${p.id} (gardenId: ${p.gardenId})`).join(", ")}`);
      if (cleanupOrphans) {
        const serviceRegistry22 = (0, import_serviceRegistry2.getServiceRegistry2)();
        for (const orphaned of orphanedProviders) {
          try {
            if (serviceRegistry22.hasProvider(orphaned.id)) {
              serviceRegistry22.removeProvider(orphaned.id);
              console.log(`   \u{1F5D1}\uFE0F  Removed orphaned provider ${orphaned.id} from ServiceRegistry2`);
            } else {
              console.log(`   \u2139\uFE0F  Orphaned provider ${orphaned.id} not found in ServiceRegistry2 (may have been already removed)`);
            }
          } catch (err) {
            console.warn(`   \u26A0\uFE0F  Failed to remove orphaned provider ${orphaned.id}: ${err.message}`);
          }
          const index = ROOT_CA_SERVICE_REGISTRY.findIndex((p) => p.id === orphaned.id || p.uuid === orphaned.uuid);
          if (index !== -1) {
            ROOT_CA_SERVICE_REGISTRY.splice(index, 1);
            console.log(`   \u{1F5D1}\uFE0F  Removed orphaned provider ${orphaned.id} from ROOT_CA_SERVICE_REGISTRY`);
          }
        }
        allProviders = allProviders.filter((p) => !orphanedProviders.includes(p));
        try {
          serviceRegistry22.savePersistence();
          console.log(`   \u{1F4BE} Service registry saved after removing ${orphanedProviders.length} orphaned provider(s)`);
        } catch (saveErr) {
          console.warn(`   \u26A0\uFE0F  Failed to save service registry after cleanup: ${saveErr.message}`);
        }
      } else {
        console.warn(`   \u26A0\uFE0F  [Service Registry API] Not deleting orphaned providers on GET. Pass ?cleanupOrphans=true to apply cleanup.`);
      }
    }
    let providers = allProviders.map((p) => {
      const providerOwnerEmail = getOwnerEmailForProvider(p.gardenId);
      return {
        id: p.id,
        name: p.name,
        serviceType: p.serviceType,
        // Snake is a service type (serviceType: "snake")
        location: p.location,
        bond: p.bond,
        reputation: p.reputation,
        gardenId: p.gardenId,
        // Use gardenId directly - everything is in sync
        status: p.status || "active",
        ownerEmail: providerOwnerEmail,
        // Add ownerEmail field
        // Snake service fields (transparent in ServiceRegistry)
        insuranceFee: p.insuranceFee,
        iGasMultiplier: p.iGasMultiplier || 1,
        iTaxMultiplier: p.iTaxMultiplier || 1,
        maxInfluence: p.maxInfluence,
        contextsAllowed: p.contextsAllowed,
        contextsForbidden: p.contextsForbidden,
        adCapabilities: p.adCapabilities
      };
    });
    if (serviceType) {
      providers = providers.filter((p) => p.serviceType === serviceType);
    }
    if (ownerEmail) {
      const ownerEmailLower = ownerEmail.toLowerCase();
      providers = providers.filter((p) => {
        if (!p.ownerEmail)
          return false;
        return p.ownerEmail.toLowerCase() === ownerEmailLower;
      });
      console.log(`   \u{1F50D} [Service Registry API] Filtered by ownerEmail: ${ownerEmail} \u2192 ${providers.length} provider(s)`);
    }
    if (debugRegistryApi) {
      const movieProviders = providers.filter((p) => p.serviceType === "movie");
      const nonHGProviders = movieProviders.filter((p) => p.gardenId !== "HG");
      if (movieProviders.length > 0) {
        console.log(`   \u{1F50D} [Service Registry API] Movie providers: ${movieProviders.map((p) => `${p.name} (${p.id}) \u2192 gardenId: ${p.gardenId}, ownerEmail: ${p.ownerEmail || "N/A"}`).join(", ")}`);
        console.log(`   \u{1F50D} [Service Registry API] Non-HG movie providers: ${nonHGProviders.length} (${nonHGProviders.map((p) => p.name).join(", ")})`);
      }
    }
    const responseData = {
      success: true,
      providers,
      count: providers.length,
      timestamp: Date.now()
    };
    const responseJson = JSON.stringify(responseData);
    const etag = `"${crypto.createHash("md5").update(responseJson).digest("hex")}"`;
    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch === etag) {
      res.writeHead(304, {
        "ETag": etag,
        "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600"
        // Cache for 30 minutes, serve stale for 60 minutes
      });
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "ETag": etag,
      "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
      // Cache for 30 minutes, serve stale for 60 minutes
      "Last-Modified": (/* @__PURE__ */ new Date()).toUTCString()
    });
    res.end(responseJson);
    return;
  }
  if (pathname === "/api/root-ca/service-registry/register" && req.method === "POST") {
    console.log(`   \u2705 [${requestId}] POST /api/root-ca/service-registry/register - Registering service provider`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const providerData = JSON.parse(body);
        if (!providerData.id || !providerData.name || !providerData.serviceType || !providerData.gardenId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Missing required fields: id, name, serviceType, gardenId" }));
          return;
        }
        const provider = {
          id: providerData.id,
          uuid: providerData.uuid || crypto.randomUUID(),
          name: providerData.name,
          serviceType: providerData.serviceType,
          location: providerData.location || "Unknown",
          bond: providerData.bond || 0,
          reputation: providerData.reputation || 5,
          gardenId: providerData.gardenId || "HG",
          // Use gardenId
          apiEndpoint: providerData.apiEndpoint || "",
          status: providerData.status || "active",
          // Snake service fields (if serviceType is "snake")
          insuranceFee: providerData.insuranceFee !== void 0 ? providerData.insuranceFee : providerData.serviceType === "snake" ? Math.max(providerData.bond || 0, 1e4) : providerData.bond || 0,
          iGasMultiplier: providerData.iGasMultiplier !== void 0 ? providerData.iGasMultiplier : providerData.serviceType === "snake" ? 2 : 1,
          iTaxMultiplier: providerData.iTaxMultiplier !== void 0 ? providerData.iTaxMultiplier : providerData.serviceType === "snake" ? 2 : 1,
          maxInfluence: providerData.maxInfluence !== void 0 ? providerData.maxInfluence : providerData.serviceType === "snake" ? 0.15 : void 0,
          contextsAllowed: providerData.contextsAllowed,
          contextsForbidden: providerData.contextsForbidden,
          adCapabilities: providerData.adCapabilities
        };
        (0, import_serviceProvider.registerServiceProviderWithROOTCA)(provider);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: `Service provider ${provider.name} registered successfully`,
          provider: {
            id: provider.id,
            uuid: provider.uuid,
            name: provider.name
          }
        }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/root-balances" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /api/root-balances - Sending ROOT CA balances`);
    res.writeHead(200, { "Content-Type": "application/json" });
    const balances = {
      rootCA: ROOT_BALANCES.rootCA,
      indexers: Object.fromEntries(ROOT_BALANCES.indexers),
      providers: Object.fromEntries(ROOT_BALANCES.providers),
      rootCALiquidity,
      timestamp: Date.now()
    };
    res.end(JSON.stringify({
      success: true,
      balances,
      timestamp: Date.now()
    }));
    return;
  }
  if ((pathname === "/api/gardens" || pathname === "/api/indexers") && req.method === "GET") {
    const endpointName = pathname === "/api/gardens" ? "gardens" : "indexers";
    console.log(`   \u2705 [${requestId}] GET /api/${endpointName} - Sending garden list`);
    res.writeHead(200, { "Content-Type": "application/json" });
    const parsedForEcosystem = url.parse(req.url || "/", true);
    const ecosystemRaw = parsedForEcosystem.query.ecosystem || "saas";
    const ecosystem = ecosystemRaw.toLowerCase();
    let persistedGardens = [];
    let persistedTokenGardens = [];
    try {
      const gardensFile = path.join(__dirname, "eden-gardens-persistence.json");
      let gardensFromFile = [];
      if (fs.existsSync(gardensFile)) {
        try {
          const fileContent = fs.readFileSync(gardensFile, "utf-8");
          const persisted = JSON.parse(fileContent);
          gardensFromFile = persisted.gardens || persisted.indexers || [];
          console.log(`\u{1F4CB} [Indexer API] Loaded ${gardensFromFile.length} gardens from separate file: ${gardensFile}`);
        } catch (err) {
          console.warn(`\u26A0\uFE0F  [Indexer API] Failed to load from separate gardens file: ${err.message}`);
        }
      }
      if (gardensFromFile.length === 0) {
        const persistenceFile = path.join(__dirname, "eden-wallet-persistence.json");
        if (fs.existsSync(persistenceFile)) {
          const fileContent = fs.readFileSync(persistenceFile, "utf-8");
          const persisted = JSON.parse(fileContent);
          gardensFromFile = persisted.gardens || persisted.indexers || [];
          console.log(`\u{1F4CB} [Indexer API] Loaded ${gardensFromFile.length} gardens from old combined file (backward compatibility)`);
        }
      }
      if (gardensFromFile && Array.isArray(gardensFromFile) && gardensFromFile.length > 0) {
        if (gardensFromFile && Array.isArray(gardensFromFile)) {
          const regularIndexersFromArray = gardensFromFile.filter(
            (idx) => !(idx.tokenServiceType === "dex" || idx.serviceType === "dex" && idx.id && idx.id.startsWith("T"))
          );
          const tokenIndexersFromArray = gardensFromFile.filter(
            (idx) => idx.tokenServiceType === "dex" || idx.serviceType === "dex" && idx.id && idx.id.startsWith("T")
          );
          if (import_config.DEPLOYED_AS_ROOT) {
            persistedGardens = regularIndexersFromArray.filter((idx) => idx.id && (idx.id.startsWith("garden-") || idx.id.startsWith("indexer-")));
            persistedTokenGardens = tokenIndexersFromArray;
          } else {
            persistedGardens = regularIndexersFromArray;
            if (import_config.NUM_TOKEN_GARDENS > 0) {
              const defaultTokenIds = Array.from({ length: import_config.NUM_TOKEN_GARDENS }, (_, i) => `T${i + 1}`);
              persistedTokenGardens = tokenIndexersFromArray.filter((idx) => !defaultTokenIds.includes(idx.id));
            } else {
              persistedTokenGardens = tokenIndexersFromArray;
            }
          }
        }
        if (gardensFromFile.length === 0) {
          const persistenceFile = path.join(__dirname, "eden-wallet-persistence.json");
          if (fs.existsSync(persistenceFile)) {
            try {
              const fileContent = fs.readFileSync(persistenceFile, "utf-8");
              const persisted = JSON.parse(fileContent);
              if (persisted.tokenIndexers && Array.isArray(persisted.tokenIndexers)) {
                console.log(`\u{1F4CB} [Indexer API] Found tokenIndexers field (backward compatibility) - using it`);
                if (import_config.DEPLOYED_AS_ROOT) {
                  persistedTokenGardens = persisted.tokenIndexers;
                } else {
                  if (import_config.NUM_TOKEN_GARDENS > 0) {
                    const defaultTokenIds = Array.from({ length: import_config.NUM_TOKEN_GARDENS }, (_, i) => `T${i + 1}`);
                    persistedTokenGardens = persisted.tokenIndexers.filter((idx) => !defaultTokenIds.includes(idx.id));
                  } else {
                    persistedTokenGardens = persisted.tokenIndexers;
                  }
                }
              }
            } catch (err) {
            }
          }
        }
      }
    } catch (err) {
      console.warn(`\u26A0\uFE0F  [Indexer API] Failed to load persisted indexers: ${err.message}`);
    }
    const inMemoryRegularGardens = import_state.GARDENS.filter((g) => g.active);
    const inMemoryTokenGardens = import_state.TOKEN_GARDENS.filter((g) => g.active);
    const allRegularGardens = /* @__PURE__ */ new Map();
    inMemoryRegularGardens.forEach((g) => allRegularGardens.set(g.id, g));
    persistedGardens.forEach((g) => {
      if (!allRegularGardens.has(g.id)) {
        allRegularGardens.set(g.id, g);
      }
    });
    const allTokenGardens = /* @__PURE__ */ new Map();
    inMemoryTokenGardens.forEach((g) => allTokenGardens.set(g.id, g));
    persistedTokenGardens.forEach((g) => {
      if (!allTokenGardens.has(g.id)) {
        allTokenGardens.set(g.id, g);
      }
    });
    const allIndexers = [
      // Holy Ghost (ROOT CA's infrastructure indexer) - listed first
      ...ecosystem === "dex" ? [] : [{
        id: import_state.HOLY_GHOST_GARDEN.id,
        name: import_state.HOLY_GHOST_GARDEN.name,
        stream: import_state.HOLY_GHOST_GARDEN.stream,
        active: import_state.HOLY_GHOST_GARDEN.active,
        uuid: import_state.HOLY_GHOST_GARDEN.uuid,
        hasCertificate: !!import_state.HOLY_GHOST_GARDEN.certificate,
        type: "root",
        ownerEmail: void 0
        // ROOT CA doesn't have an owner
      }],
      // Return in-memory gardens (source of truth) + persisted gardens not in memory
      ...ecosystem === "dex" ? [] : Array.from(allRegularGardens.values()).map((i) => ({
        id: i.id,
        name: i.name,
        stream: i.stream,
        active: i.active,
        uuid: i.uuid,
        hasCertificate: !!i.certificate,
        type: "regular",
        // IMPORTANT: include serviceType so frontend can load the correct workflow JSON
        // (otherwise it falls back to type=regular => tries /api/workflow/regular which does not exist)
        serviceType: i.serviceType,
        ownerEmail: i.ownerEmail || i.priestEmail || void 0
      })),
      ...ecosystem === "saas" ? [] : Array.from(allTokenGardens.values()).map((i) => ({
        id: i.id,
        name: i.name,
        stream: i.stream,
        active: i.active,
        uuid: i.uuid,
        hasCertificate: !!i.certificate,
        type: "token",
        // Include serviceType for completeness (some clients may rely on it)
        serviceType: i.serviceType || "dex",
        ownerEmail: i.ownerEmail || i.priestEmail || void 0
      }))
    ];
    console.log(`   \u{1F4CB} [Garden API] Returning ${allIndexers.length} garden(s): ${allIndexers.map((i) => i.name).join(", ")}`);
    res.end(JSON.stringify({
      success: true,
      gardens: allIndexers,
      timestamp: Date.now()
    }));
    return;
  }
  if (pathname === "/api/dex-gardens" && req.method === "GET") {
    const rewrittenUrl = (req.url || "/api/dex-gardens") + ((req.url || "").includes("?") ? "&" : "?") + "ecosystem=dex";
    req.url = rewrittenUrl;
    res.writeHead(200, { "Content-Type": "application/json" });
    const tokenGardens = import_state.TOKEN_GARDENS.filter((g) => g.active).map((g) => {
      let totalTrades = 0;
      let totalVolume = 0;
      for (const [poolId, pool] of DEX_POOLS.entries()) {
        if (pool.gardenId === g.id) {
          totalTrades += pool.totalTrades || 0;
          totalVolume += pool.totalVolume || 0;
        }
      }
      return {
        id: g.id,
        name: g.name,
        stream: g.stream,
        active: g.active,
        uuid: g.uuid,
        hasCertificate: !!g.certificate,
        type: "token",
        ownerEmail: g.ownerEmail || g.priestEmail || void 0,
        initialLiquidity: g.initialLiquidity || 0,
        liquidityCertified: g.liquidityCertified || false,
        stripePaymentRailBound: g.stripePaymentRailBound || false,
        totalTrades,
        totalVolume
      };
    });
    res.end(JSON.stringify({ success: true, gardens: tokenGardens, timestamp: Date.now() }));
    return;
  }
  if (pathname === "/api/dex-gardens/by-owner" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /api/dex-gardens/by-owner - Getting DEX gardens by owner email`);
    try {
      const u = new URL(req.url || "", `http://${req.headers.host}`);
      const ownerEmail = u.searchParams.get("email");
      if (!ownerEmail) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "email query parameter required" }));
        return;
      }
      const ownerDexGardens = import_state.TOKEN_GARDENS.filter((g) => (g.ownerEmail || g.priestEmail)?.toLowerCase() === ownerEmail.toLowerCase()).map((g) => {
        let totalTrades = 0;
        let totalVolume = 0;
        for (const [poolId, pool] of DEX_POOLS.entries()) {
          if (pool.gardenId === g.id) {
            totalTrades += pool.totalTrades || 0;
            totalVolume += pool.totalVolume || 0;
          }
        }
        return {
          id: g.id,
          name: g.name,
          stream: g.stream,
          active: g.active,
          uuid: g.uuid,
          ownerEmail: g.ownerEmail || g.priestEmail,
          serviceType: g.serviceType || "dex",
          hasCertificate: !!g.certificate,
          certificate: g.certificate,
          initialLiquidity: g.initialLiquidity || 0,
          liquidityCertified: g.liquidityCertified || false,
          stripePaymentRailBound: g.stripePaymentRailBound || false,
          totalTrades,
          totalVolume
        };
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, gardens: ownerDexGardens, count: ownerDexGardens.length }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname === "/api/certificates" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /api/certificates - Sending certificate list`);
    const parsedUrl2 = url.parse(req.url || "/", true);
    const uuid = parsedUrl2.query.uuid;
    if (uuid) {
      const cert = getCertificate(uuid);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        certificate: cert || null,
        isValid: cert ? validateCertificate(uuid) : false,
        timestamp: Date.now()
      }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        certificates: getAllCertificates(),
        revoked: getRevokedCertificates(),
        total: import_state.CERTIFICATE_REGISTRY.size,
        timestamp: Date.now()
      }));
    }
    return;
  }
  if (pathname === "/api/revoke" && req.method === "POST") {
    console.log(`   \u2705 [${requestId}] POST /api/revoke - Revoking certificate`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { uuid, reason, revoked_type, severity } = JSON.parse(body);
        if (!uuid || !reason) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "uuid and reason required" }));
          return;
        }
        let revokedType = revoked_type || "provider";
        if (!revokedType) {
          if (uuid.includes("indexer") || uuid.includes("garden")) {
            revokedType = "indexer";
          } else if (uuid.includes("service")) {
            revokedType = "service";
          } else {
            revokedType = "provider";
          }
        }
        const revokeSeverity = severity || "hard";
        const revocation = revokeCertificate(
          uuid,
          reason,
          revokedType,
          revokeSeverity
        );
        let revokedProvidersCount = 0;
        if (revokeSeverity === "hard" && revokedType === "indexer") {
          const garden = import_state.GARDENS.find((g) => g.uuid === uuid) || import_state.TOKEN_GARDENS.find((g) => g.uuid === uuid);
          if (garden) {
            const providers = ROOT_CA_SERVICE_REGISTRY.filter(
              (p) => p.gardenId === garden.id || p.gardenId === garden.id
            );
            for (const provider of providers) {
              try {
                revokeCertificate(
                  provider.uuid,
                  `Garden revoked: ${reason}`,
                  "provider",
                  "hard"
                );
                revokedProvidersCount++;
              } catch (err) {
                console.warn(`\u26A0\uFE0F  Failed to revoke provider ${provider.id}: ${err.message}`);
              }
            }
          }
        }
        if (revokeSeverity === "hard") {
          try {
            await ensureRedisConnection();
            const gardensFile = path.join(__dirname, "eden-gardens-persistence.json");
            if (fs.existsSync(gardensFile)) {
              try {
                const fileContent = fs.readFileSync(gardensFile, "utf-8");
                const persisted = JSON.parse(fileContent);
                if (persisted.gardens && Array.isArray(persisted.gardens)) {
                  const activeGardens = persisted.gardens.filter((g) => {
                    const isRevoked = import_state.REVOCATION_REGISTRY.has(g.uuid);
                    return !isRevoked;
                  });
                  const gardensData2 = {
                    gardens: activeGardens,
                    lastSaved: (/* @__PURE__ */ new Date()).toISOString()
                  };
                  fs.writeFileSync(gardensFile, JSON.stringify(gardensData2, null, 2), "utf-8");
                  console.log(`   \u{1F4BE} Removed revoked gardens from ${gardensFile} (${activeGardens.length} gardens remaining)`);
                }
              } catch (fileErr) {
                console.warn(`\u26A0\uFE0F  Failed to update gardens persistence file: ${fileErr.message}`);
              }
            }
            const allGardens = [...import_state.GARDENS, ...import_state.TOKEN_GARDENS];
            const gardensData = {
              gardens: allGardens,
              lastSaved: (/* @__PURE__ */ new Date()).toISOString()
            };
            fs.writeFileSync(gardensFile, JSON.stringify(gardensData, null, 2), "utf-8");
            console.log(`   \u{1F4BE} Saved ${allGardens.length} active gardens to ${gardensFile}`);
            const serviceRegistryFile = path.join(__dirname, "eden-serviceRegistry-persistence.json");
            if (fs.existsSync(serviceRegistryFile)) {
              try {
                const fileContent = fs.readFileSync(serviceRegistryFile, "utf-8");
                const persisted = JSON.parse(fileContent);
                if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry)) {
                  const activeProviders = persisted.serviceRegistry.filter((p) => {
                    const isRevoked = import_state.REVOCATION_REGISTRY.has(p.uuid);
                    return !isRevoked;
                  });
                  const registryData = {
                    serviceRegistry: activeProviders,
                    lastSaved: (/* @__PURE__ */ new Date()).toISOString()
                  };
                  fs.writeFileSync(serviceRegistryFile, JSON.stringify(registryData, null, 2), "utf-8");
                  console.log(`   \u{1F4BE} Removed revoked providers from ${serviceRegistryFile} (${activeProviders.length} providers remaining)`);
                }
              } catch (fileErr) {
                console.warn(`\u26A0\uFE0F  Failed to update service registry persistence file: ${fileErr.message}`);
              }
            }
            if (redis) {
              redis.saveServiceRegistry();
              console.log(`   \u{1F4BE} Saved service registry to persistence (${ROOT_CA_SERVICE_REGISTRY.length} providers remaining)`);
            }
          } catch (persistErr) {
            console.warn(`\u26A0\uFE0F  Failed to save persistence after revocation: ${persistErr.message}`);
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          revocation,
          revokedProvidersCount: revokedType === "indexer" ? revokedProvidersCount : 0,
          timestamp: Date.now()
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/gardens/by-owner" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /api/gardens/by-owner - Getting gardens by owner email`);
    try {
      const url2 = new URL(req.url || "", `http://${req.headers.host}`);
      const ownerEmail = url2.searchParams.get("email");
      if (!ownerEmail) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "email query parameter required" }));
        return;
      }
      const ownerGardens = [
        ...import_state.GARDENS.filter((g) => (g.ownerEmail || g.priestEmail)?.toLowerCase() === ownerEmail.toLowerCase()),
        ...import_state.TOKEN_GARDENS.filter((g) => (g.ownerEmail || g.priestEmail)?.toLowerCase() === ownerEmail.toLowerCase())
      ].map((g) => ({
        id: g.id,
        name: g.name,
        stream: g.stream,
        active: g.active,
        uuid: g.uuid,
        ownerEmail: g.ownerEmail || g.priestEmail,
        serviceType: g.serviceType,
        hasCertificate: !!g.certificate,
        certificate: g.certificate
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        gardens: ownerGardens,
        count: ownerGardens.length
      }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname === "/api/garden/shutdown" && req.method === "POST") {
    console.log(`   \u2705 [${requestId}] POST /api/garden/shutdown - Hard shutdown garden`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { gardenId, reason, requestedBy, revokeProviders = true } = JSON.parse(body);
        if (!gardenId || !reason || !requestedBy) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "gardenId, reason, and requestedBy are required" }));
          return;
        }
        const garden = import_state.GARDENS.find((g) => g.id === gardenId || g.uuid === gardenId) || import_state.TOKEN_GARDENS.find((g) => g.id === gardenId || g.uuid === gardenId);
        if (!garden) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Garden not found: ${gardenId}` }));
          return;
        }
        const ownerEmail = (garden.ownerEmail || garden.priestEmail)?.toLowerCase();
        const requestedByLower = requestedBy.toLowerCase();
        const isRootCA = requestedByLower === "bill.draper.auto@gmail.com";
        const isOwner = ownerEmail === requestedByLower;
        if (isOwner && !isRootCA) {
          const hasCert = (0, import_priesthoodCertification.hasPriesthoodCertification)(requestedBy);
          if (!hasCert) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: false,
              error: "Priesthood certification required to shutdown gardens. Please apply for priesthood certification first."
            }));
            return;
          }
        }
        if (!isRootCA && !isOwner) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: `Unauthorized: Only garden owner (${ownerEmail}) or ROOT CA can shutdown this garden`
          }));
          return;
        }
        const revocation = revokeCertificate(
          garden.uuid,
          reason,
          "indexer",
          "hard",
          { requestedBy, gardenId, revokeProviders }
        );
        let revokedProvidersCount = 0;
        const providersToRevoke = [];
        if (revokeProviders) {
          const providers = ROOT_CA_SERVICE_REGISTRY.filter(
            (p) => p.gardenId === gardenId || p.gardenId === garden.id
          );
          providersToRevoke.push(...providers);
          for (const provider of providers) {
            try {
              revokeCertificate(
                provider.uuid,
                `Garden shutdown: ${reason}`,
                "provider",
                "hard",
                { requestedBy, gardenId }
              );
              revokedProvidersCount++;
            } catch (err) {
              console.warn(`\u26A0\uFE0F  Failed to revoke provider ${provider.id}: ${err.message}`);
            }
          }
        }
        for (const provider of providersToRevoke) {
          const providerIndex = ROOT_CA_SERVICE_REGISTRY.findIndex((p) => p.uuid === provider.uuid);
          if (providerIndex !== -1) {
            ROOT_CA_SERVICE_REGISTRY.splice(providerIndex, 1);
            console.log(`   \u{1F5D1}\uFE0F  Removed provider ${provider.id} (${provider.name}) from ROOT_CA_SERVICE_REGISTRY`);
          }
        }
        const gardenIndex = import_state.GARDENS.findIndex((g) => g.id === gardenId || g.uuid === garden.uuid);
        if (gardenIndex !== -1) {
          import_state.GARDENS.splice(gardenIndex, 1);
          console.log(`   \u{1F5D1}\uFE0F  Removed garden ${garden.id} (${garden.name}) from GARDENS array`);
        } else {
          const tokenGardenIndex = import_state.TOKEN_GARDENS.findIndex((g) => g.id === gardenId || g.uuid === garden.uuid);
          if (tokenGardenIndex !== -1) {
            import_state.TOKEN_GARDENS.splice(tokenGardenIndex, 1);
            console.log(`   \u{1F5D1}\uFE0F  Removed garden ${garden.id} (${garden.name}) from TOKEN_GARDENS array`);
          }
        }
        try {
          await ensureRedisConnection();
          const gardensFile = path.join(__dirname, "eden-gardens-persistence.json");
          if (fs.existsSync(gardensFile)) {
            try {
              const fileContent = fs.readFileSync(gardensFile, "utf-8");
              const persisted = JSON.parse(fileContent);
              if (persisted.gardens && Array.isArray(persisted.gardens)) {
                const activeGardens = persisted.gardens.filter((g) => {
                  const isRevoked = import_state.REVOCATION_REGISTRY.has(g.uuid);
                  return !isRevoked;
                });
                const gardensData2 = {
                  gardens: activeGardens,
                  lastSaved: (/* @__PURE__ */ new Date()).toISOString()
                };
                fs.writeFileSync(gardensFile, JSON.stringify(gardensData2, null, 2), "utf-8");
                console.log(`   \u{1F4BE} Removed revoked gardens from ${gardensFile} (${activeGardens.length} gardens remaining)`);
              }
            } catch (fileErr) {
              console.warn(`\u26A0\uFE0F  Failed to update gardens persistence file: ${fileErr.message}`);
            }
          }
          const allGardens = [...import_state.GARDENS, ...import_state.TOKEN_GARDENS];
          const gardensData = {
            gardens: allGardens,
            lastSaved: (/* @__PURE__ */ new Date()).toISOString()
          };
          fs.writeFileSync(gardensFile, JSON.stringify(gardensData, null, 2), "utf-8");
          console.log(`   \u{1F4BE} Saved ${allGardens.length} active gardens to ${gardensFile}`);
          const serviceRegistryFile = path.join(__dirname, "eden-serviceRegistry-persistence.json");
          if (fs.existsSync(serviceRegistryFile)) {
            try {
              const fileContent = fs.readFileSync(serviceRegistryFile, "utf-8");
              const persisted = JSON.parse(fileContent);
              if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry)) {
                const activeProviders = persisted.serviceRegistry.filter((p) => {
                  const isRevoked = import_state.REVOCATION_REGISTRY.has(p.uuid);
                  return !isRevoked;
                });
                const registryData = {
                  serviceRegistry: activeProviders,
                  lastSaved: (/* @__PURE__ */ new Date()).toISOString()
                };
                fs.writeFileSync(serviceRegistryFile, JSON.stringify(registryData, null, 2), "utf-8");
                console.log(`   \u{1F4BE} Removed revoked providers from ${serviceRegistryFile} (${activeProviders.length} providers remaining)`);
              }
            } catch (fileErr) {
              console.warn(`\u26A0\uFE0F  Failed to update service registry persistence file: ${fileErr.message}`);
            }
          }
          if (redis) {
            redis.saveServiceRegistry();
            console.log(`   \u{1F4BE} Saved service registry to persistence (${ROOT_CA_SERVICE_REGISTRY.length} providers remaining)`);
          }
        } catch (persistErr) {
          console.warn(`\u26A0\uFE0F  Failed to save persistence after shutdown: ${persistErr.message}`);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          revocation,
          garden: {
            id: garden.id,
            name: garden.name,
            uuid: garden.uuid,
            active: false,
            removed: true
          },
          revokedProvidersCount,
          removedProvidersCount: providersToRevoke.length,
          timestamp: Date.now()
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/reinstate" && req.method === "POST") {
    console.log(`   \u2705 [${requestId}] POST /api/reinstate - Reinstating certificate`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const { uuid } = JSON.parse(body);
        if (!uuid) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "uuid required" }));
          return;
        }
        const wasRevoked = import_state.REVOCATION_REGISTRY.has(uuid);
        if (wasRevoked) {
          import_state.REVOCATION_REGISTRY.delete(uuid);
          const indexer = import_state.GARDENS.find((i) => i.uuid === uuid);
          if (indexer) {
            indexer.active = true;
          }
          const provider = ROOT_CA_SERVICE_REGISTRY.find((p) => p.uuid === uuid);
          if (provider) {
            provider.status = "active";
            console.log(`   Service provider ${provider.name} (${provider.id}) reactivated in ROOT_CA_SERVICE_REGISTRY`);
          }
          console.log(`\u2705 Certificate reinstated: ${uuid}`);
          broadcastEvent({
            type: "certificate_reinstated",
            component: "root-ca",
            message: `Certificate reinstated: ${uuid}`,
            timestamp: Date.now(),
            data: { uuid }
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            message: "Certificate reinstated",
            uuid,
            timestamp: Date.now()
          }));
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Certificate not found in revocation registry" }));
        }
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/status" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /api/status - Sending status`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "online",
      websocketClients: wsClients.size,
      timestamp: Date.now()
    }));
    return;
  }
  if (pathname === "/api/jsc/buy" && req.method === "POST") {
    console.log(`   \u{1F4B0} [${requestId}] POST /api/jsc/buy - Creating Stripe Checkout session`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, amount } = JSON.parse(body);
        if (!email || typeof email !== "string" || !email.includes("@")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid email address required" }));
          return;
        }
        if (!amount || typeof amount !== "number" || amount <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid amount required (must be > 0)" }));
          return;
        }
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "\u{1F34E} APPLES",
                  description: `Purchase ${amount} \u{1F34E} APPLES (1 \u{1F34E} = 1 USD)`
                },
                unit_amount: Math.round(amount * 100)
                // Convert to cents
              },
              quantity: 1
            }
          ],
          mode: "payment",
          success_url: `${req.headers.origin || "http://localhost:4200"}/?jsc_success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.headers.origin || "http://localhost:4200"}/?jsc_canceled=true`,
          customer_email: email,
          metadata: {
            user_email: email,
            jsc_amount: amount.toString()
          }
        });
        console.log(`   \u2705 Stripe Checkout session created: ${session.id} for ${email} (${amount} \u{1F34E} APPLES)`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          sessionId: session.id,
          url: session.url,
          publishableKey: import_config.STRIPE_PUBLISHABLE_KEY
        }));
      } catch (err) {
        console.error(`   \u274C Error creating Stripe Checkout session:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/dex-liquidity/buy" && req.method === "POST") {
    console.log(`   \u{1F4B0} [${requestId}] POST /api/dex-liquidity/buy - Creating Stripe Checkout session for DEX liquidity`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, amount, gardenName, tokenSymbol, baseToken } = JSON.parse(body);
        if (!email || typeof email !== "string" || !email.includes("@")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid email address required" }));
          return;
        }
        const MIN_LIQUIDITY_AMOUNT = 1e4;
        if (!amount || typeof amount !== "number" || amount < MIN_LIQUIDITY_AMOUNT) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Initial liquidity must be at least ${MIN_LIQUIDITY_AMOUNT} \u{1F34E} APPLES` }));
          return;
        }
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "DEX Initial Liquidity",
                  description: `Load ${amount} \u{1F34E} APPLES initial liquidity for ${gardenName || "DEX Garden"} (${tokenSymbol || "TOKEN"}/${baseToken || "SOL"})`
                },
                unit_amount: Math.round(amount * 100)
                // Convert to cents
              },
              quantity: 1
            }
          ],
          mode: "payment",
          success_url: `${req.headers.origin || "http://localhost:4200"}/dex-garden-wizard?dex_liquidity_success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.headers.origin || "http://localhost:4200"}/dex-garden-wizard?dex_liquidity_canceled=true`,
          customer_email: email,
          metadata: {
            user_email: email,
            liquidity_amount: amount.toString(),
            purchase_type: "dex_initial_liquidity",
            purpose: "dex_initial_liquidity",
            garden_name: gardenName || "DEX Garden",
            token_symbol: tokenSymbol || "TOKEN",
            base_token: baseToken || "SOL"
          }
        });
        console.log(`   \u2705 Stripe Checkout session created for DEX liquidity: ${session.id} for ${email} (${amount} \u{1F34E} APPLES)`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          sessionId: session.id,
          url: session.url
        }));
      } catch (err) {
        console.error(`   \u274C Error creating Stripe Checkout session for DEX liquidity:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message || "Failed to create Stripe checkout session" }));
      }
    });
    return;
  }
  if (pathname === "/api/garden/buy" && req.method === "POST") {
    console.log(`   \u{1F3AC} [${requestId}] POST /api/garden/buy - Creating Stripe Checkout session for garden purchase`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, amount, gardenType } = JSON.parse(body);
        if (!email || typeof email !== "string" || !email.includes("@")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid email address required" }));
          return;
        }
        if (!amount || typeof amount !== "number" || amount <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid amount required (must be > 0)" }));
          return;
        }
        if (!gardenType || gardenType !== "movie") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Only 'movie' garden type is supported" }));
          return;
        }
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "Movie Service Garden",
                  description: `Install a new movie service garden (${amount} \u{1F34E} APPLES)`
                },
                unit_amount: Math.round(amount * 100)
                // Convert to cents
              },
              quantity: 1
            }
          ],
          mode: "payment",
          success_url: `${req.headers.origin || "http://localhost:4200"}/?garden_success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.headers.origin || "http://localhost:4200"}/?garden_canceled=true`,
          customer_email: email,
          metadata: {
            user_email: email,
            jsc_amount: amount.toString(),
            garden_type: gardenType,
            purchase_type: "garden"
          }
        });
        console.log(`   \u2705 Stripe Checkout session created for garden purchase: ${session.id} for ${email} (${amount} \u{1F34E} APPLES)`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          sessionId: session.id,
          url: session.url,
          publishableKey: import_config.STRIPE_PUBLISHABLE_KEY
        }));
      } catch (err) {
        console.error(`   \u274C Error creating Stripe Checkout session for garden:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/garden/purchase" && req.method === "POST") {
    console.log(`   \u{1F3AC} [${requestId}] POST /api/garden/purchase - Purchasing garden from wallet`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, amount, gardenType } = JSON.parse(body);
        if (!email || typeof email !== "string" || !email.includes("@")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid email address required" }));
          return;
        }
        if (!amount || typeof amount !== "number" || amount <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid amount required (must be > 0)" }));
          return;
        }
        if (!gardenType || gardenType !== "movie") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Only 'movie' garden type is supported" }));
          return;
        }
        const balance = await (0, import_wallet.getWalletBalance)(email);
        if (balance < amount) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: `Insufficient balance. Required: ${amount} \u{1F34E} APPLES, Available: ${balance} \u{1F34E} APPLES`
          }));
          return;
        }
        const txId = crypto.randomUUID();
        const debitResult = await (0, import_wallet.debitWallet)(
          email,
          amount,
          txId,
          "garden_purchase",
          { gardenType }
        );
        if (!debitResult.success) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: debitResult.error || "Failed to debit wallet" }));
          return;
        }
        if (import_config.DEPLOYED_AS_ROOT) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: "Cannot create indexers via this endpoint in ROOT mode. Use the Angular wizard (/api/wizard/create-indexer) instead."
          }));
          return;
        }
        console.log(`   \u{1F3AC} Registering new movie garden for ${email} (wallet purchase)...`);
        const newGarden = await (0, import_garden.registerNewMovieGarden)(
          email,
          `wallet:${txId}`,
          // Use wallet transaction ID instead of Stripe payment intent
          void 0,
          // No Stripe customer ID
          void 0,
          // No Stripe payment method ID
          void 0
          // No Stripe session ID
        );
        const newBalance = await (0, import_wallet.getWalletBalance)(email);
        console.log(`   \u2705 Garden purchased from wallet: ${newGarden.name} (${newGarden.id})`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          gardenId: newGarden.id,
          gardenName: newGarden.name,
          gardenUuid: newGarden.uuid,
          balance: newBalance,
          amount
        }));
      } catch (err) {
        console.error(`   \u274C Error purchasing indexer from wallet:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/stripe/webhook" && req.method === "POST") {
    console.log(`   \u{1F514} [${requestId}] POST /api/stripe/webhook - Processing Stripe webhook`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      const sig = req.headers["stripe-signature"];
      const isTestMode = import_config.STRIPE_WEBHOOK_SECRET === "whsec_your_webhook_secret_here";
      let event;
      if (isTestMode) {
        console.log(`   \u26A0\uFE0F  Test mode: Skipping webhook signature verification`);
        try {
          const jsonBody = JSON.parse(body);
          event = jsonBody;
          console.log(`   \u2705 Test mode: Parsed webhook event: ${event.type} (${event.id || "no-id"})`);
        } catch (err) {
          console.error(`   \u274C Failed to parse webhook body:`, err.message);
          console.log(`   \u{1F4C4} Raw body:`, body.substring(0, 500));
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Failed to parse webhook body: ${err.message}` }));
          return;
        }
      } else {
        if (!sig) {
          console.error(`   \u274C Missing Stripe signature header`);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Missing stripe-signature header" }));
          return;
        }
        try {
          event = stripe.webhooks.constructEvent(body, sig, import_config.STRIPE_WEBHOOK_SECRET);
          console.log(`   \u2705 Stripe webhook verified: ${event.type} (${event.id})`);
        } catch (err) {
          console.error(`   \u274C Stripe webhook signature verification failed:`, err.message);
          const sigStr = Array.isArray(sig) ? sig[0] : sig;
          console.log(`   \u{1F4C4} Body length: ${body.length}, Signature: ${sigStr ? sigStr.substring(0, 50) : "N/A"}...`);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Webhook signature verification failed: ${err.message}` }));
          return;
        }
      }
      try {
        if (event.type === "checkout.session.completed") {
          const session = event.data.object;
          console.log(`   \u{1F4CB} Processing checkout.session.completed:`);
          console.log(`      Session ID: ${session.id}`);
          console.log(`      Payment Status: ${session.payment_status}`);
          console.log(`      Customer Email: ${session.customer_email || session.metadata?.user_email || "N/A"}`);
          console.log(`      Metadata:`, JSON.stringify(session.metadata || {}, null, 2));
          if (session.payment_status === "paid") {
            const email = session.customer_email || session.metadata?.user_email;
            const jscAmount = parseFloat(session.metadata?.jsc_amount || "0");
            const liquidityAmount = parseFloat(session.metadata?.liquidity_amount || "0");
            const paymentIntentId = session.payment_intent;
            const customerId = session.customer;
            const purchaseType = session.metadata?.purchase_type;
            const gardenType = session.metadata?.garden_type;
            const purpose = session.metadata?.purpose;
            if (!email) {
              console.error(`   \u274C Missing email in Stripe session: ${session.id}`);
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Missing email in session" }));
              return;
            }
            if (jscAmount <= 0) {
              console.error(`   \u274C Invalid JSC amount in session metadata: ${session.metadata?.jsc_amount}`);
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Invalid \u{1F34E} APPLES amount" }));
              return;
            }
            let paymentMethodId = null;
            if (paymentIntentId) {
              try {
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                paymentMethodId = typeof paymentIntent.payment_method === "string" ? paymentIntent.payment_method : paymentIntent.payment_method?.id || null;
                console.log(`   \u{1F4B3} Retrieved payment intent: ${paymentIntentId}, Payment Method: ${paymentMethodId || "N/A"}`);
              } catch (err) {
                console.warn(`   \u26A0\uFE0F  Could not retrieve payment intent ${paymentIntentId}:`, err.message);
              }
            }
            if (purchaseType === "garden" && gardenType === "movie") {
              if (import_config.DEPLOYED_AS_ROOT) {
                console.warn(`   \u26A0\uFE0F  [Stripe Webhook] Cannot create garden via webhook in ROOT mode. Use Angular wizard instead.`);
                return;
              }
              console.log(`   \u{1F3AC} Registering new movie garden for ${email}...`);
              const newGarden = await (0, import_garden.registerNewMovieGarden)(email, paymentIntentId, customerId, paymentMethodId, session.id);
              console.log(`   \u2705 Movie garden registered successfully: ${newGarden.id} (${newGarden.name})`);
              console.log(`      Stripe Customer ID: ${customerId}`);
              console.log(`      Payment Intent ID: ${paymentIntentId}`);
              console.log(`      Session ID: ${session.id}`);
            } else {
              console.log(`   \u{1FA99} Minting ${jscAmount} \u{1F34E} APPLES for ${email}...`);
              await mintJSC(email, jscAmount, paymentIntentId, customerId, paymentMethodId, session.id);
              console.log(`   \u2705 \u{1F34E} APPLES minted successfully: ${jscAmount} \u{1F34E} APPLES for ${email}`);
              console.log(`      Stripe Customer ID: ${customerId}`);
              console.log(`      Payment Intent ID: ${paymentIntentId}`);
              console.log(`      Payment Method ID: ${paymentMethodId || "N/A"}`);
              console.log(`      Session ID: ${session.id}`);
            }
          } else {
            console.log(`   \u26A0\uFE0F  Payment status is not 'paid': ${session.payment_status}`);
          }
        } else {
          console.log(`   \u2139\uFE0F  Unhandled webhook event type: ${event.type}`);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ received: true }));
      } catch (err) {
        console.error(`   \u274C Error processing webhook:`, err);
        console.error(`   \u{1F4C4} Stack:`, err.stack);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: `Webhook processing error: ${err.message}` }));
      }
    });
    return;
  }
  if (pathname.startsWith("/api/jsc/check-session/") && req.method === "GET") {
    const sessionId = pathname.split("/").pop();
    console.log(`   \u{1F50D} [${requestId}] GET /api/jsc/check-session/${sessionId} - Checking Stripe session status`);
    if (!sessionId || !sessionId.startsWith("cs_")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Invalid session ID" }));
      return;
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log(`   \u{1F4CB} Session status: ${session.payment_status} (${session.status})`);
      const existingMint = import_state.LEDGER.find(
        (entry) => entry.serviceType === "mint" && entry.bookingDetails?.stripeSessionId === sessionId
      );
      if (existingMint) {
        console.log(`   \u2705 JSC already minted for this session (entry: ${existingMint.entryId})`);
        const email = session.customer_email || session.metadata?.user_email;
        const balance = email ? await (0, import_wallet.getWalletBalance)(email) : 0;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          alreadyMinted: true,
          sessionId: session.id,
          paymentStatus: session.payment_status,
          email: email || null,
          balance
        }));
        return;
      }
      if (session.payment_status === "paid" && session.status === "complete") {
        const email = session.customer_email || session.metadata?.user_email;
        const jscAmount = parseFloat(session.metadata?.jsc_amount || "0");
        const liquidityAmount = parseFloat(session.metadata?.liquidity_amount || "0");
        const paymentIntentId = session.payment_intent;
        const customerId = session.customer;
        const purchaseType = session.metadata?.purchase_type;
        const gardenType = session.metadata?.garden_type;
        const purpose = session.metadata?.purpose;
        if (!email) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Missing email in session" }));
          return;
        }
        if (purpose === "dex_initial_liquidity") {
          const MIN_LIQUIDITY_AMOUNT = 1e4;
          if (liquidityAmount < MIN_LIQUIDITY_AMOUNT) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: `Invalid liquidity amount: ${liquidityAmount} (minimum: ${MIN_LIQUIDITY_AMOUNT} \u{1F34E} APPLES)` }));
            return;
          }
          console.log(`   \u2705 DEX liquidity payment confirmed: ${liquidityAmount} \u{1F34E} APPLES`);
          console.log(`      Payment Intent ID: ${paymentIntentId}`);
          console.log(`      Garden: ${session.metadata?.garden_name || "N/A"}`);
          console.log(`      Token Pair: ${session.metadata?.token_symbol || "TOKEN"}/${session.metadata?.base_token || "SOL"}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            session,
            paymentIntentId,
            liquidityAmount,
            paymentStatus: session.payment_status
          }));
          return;
        }
        if (jscAmount <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Invalid \u{1F34E} APPLES amount in session metadata" }));
          return;
        }
        let paymentMethodId = null;
        if (paymentIntentId) {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            paymentMethodId = typeof paymentIntent.payment_method === "string" ? paymentIntent.payment_method : paymentIntent.payment_method?.id || null;
          } catch (err) {
            console.warn(`   \u26A0\uFE0F  Could not retrieve payment intent ${paymentIntentId}:`, err.message);
          }
        }
        if (purchaseType === "garden" && gardenType === "movie") {
          const existingGarden = import_state.LEDGER.find(
            (entry) => entry.serviceType === "garden_purchase" && entry.bookingDetails?.stripeSessionId === sessionId
          );
          if (existingGarden) {
            console.log(`   \u2705 Garden already registered for this session`);
            const balance2 = await (0, import_wallet.getWalletBalance)(email);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: true,
              alreadyRegistered: true,
              sessionId: session.id,
              paymentStatus: session.payment_status,
              email,
              balance: balance2,
              gardenId: existingGarden.bookingDetails?.gardenId,
              gardenName: existingGarden.bookingDetails?.gardenName
            }));
            return;
          }
          if (import_config.DEPLOYED_AS_ROOT) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: false,
              error: "Cannot create indexers via this endpoint in ROOT mode. Use the Angular wizard (/api/wizard/create-indexer) instead."
            }));
            return;
          }
          console.log(`   \u{1F3AC} Registering new movie garden for ${email} (fallback mechanism)...`);
          const newGarden = await (0, import_garden.registerNewMovieGarden)(email, paymentIntentId, customerId, paymentMethodId, session.id);
          const balance = await (0, import_wallet.getWalletBalance)(email);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            registered: true,
            sessionId: session.id,
            paymentStatus: session.payment_status,
            email,
            amount: jscAmount,
            balance,
            gardenId: newGarden.id,
            gardenName: newGarden.name
          }));
          return;
        } else {
          console.log(`   \u{1FA99} Minting ${jscAmount} \u{1F34E} APPLES for ${email} (fallback mechanism)...`);
          await mintJSC(email, jscAmount, paymentIntentId, customerId, paymentMethodId, session.id);
          const balance = await (0, import_wallet.getWalletBalance)(email);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            minted: true,
            sessionId: session.id,
            paymentStatus: session.payment_status,
            email,
            amount: jscAmount,
            balance
          }));
          return;
        }
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          minted: false,
          sessionId: session.id,
          paymentStatus: session.payment_status,
          status: session.status,
          message: "Payment not completed yet"
        }));
        return;
      }
    } catch (err) {
      console.error(`   \u274C Error checking Stripe session:`, err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname.startsWith("/api/jsc/balance/") && req.method === "GET") {
    const email = decodeURIComponent(pathname.split("/api/jsc/balance/")[1]);
    console.log(`   \u{1F4B0} [${requestId}] GET /api/jsc/balance/${email} - Getting JSC balance from Wallet Service`);
    const balance = await (0, import_wallet.getWalletBalance)(email);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      email,
      balance,
      currency: "JSC",
      walletService: "wallet-service-001",
      indexerId: "HG"
      // Holy Ghost indexer
    }));
    return;
  }
  if (pathname === "/api/wallet/reset" && req.method === "POST") {
    console.log(`   \u{1F504} [${requestId}] POST /api/wallet/reset - Clearing generated indexers only`);
    try {
      let getDefaultGardenIdForProvider2 = function(providerId) {
        const defaults = {
          "amc-001": "garden-1",
          "cinemark-001": "garden-1",
          "moviecom-001": "garden-2",
          "snake-premium-cinema-001": "garden-1",
          "snake-shopping-deals-001": "garden-2"
        };
        return defaults[providerId];
      };
      var getDefaultGardenIdForProvider = getDefaultGardenIdForProvider2;
      await ensureRedisConnection();
      const dynamicIndexers = import_state.GARDENS.filter((i) => i.id.startsWith("garden-") || i.id.startsWith("indexer-"));
      const dynamicTokenIndexers = import_state.TOKEN_GARDENS.filter((i) => i.id.startsWith("garden-") || i.id.startsWith("indexer-"));
      const clearedIndexersCount = dynamicIndexers.length + dynamicTokenIndexers.length;
      const filteredIndexers = import_state.GARDENS.filter((i) => !i.id.startsWith("garden-") && !i.id.startsWith("indexer-"));
      const filteredTokenIndexers = import_state.TOKEN_GARDENS.filter((i) => !i.id.startsWith("garden-") && !i.id.startsWith("indexer-"));
      import_state.GARDENS.length = 0;
      import_state.GARDENS.push(...filteredIndexers);
      import_state.TOKEN_GARDENS.length = 0;
      import_state.TOKEN_GARDENS.push(...filteredTokenIndexers);
      if (!import_config.DEPLOYED_AS_ROOT) {
        redis.saveIndexers([]);
      } else {
        console.log(`\u{1F4CB} [Reset] ROOT mode: Skipping saveIndexers() - indexers are managed via persistence file`);
      }
      let providersReset = 0;
      for (const provider of ROOT_CA_SERVICE_REGISTRY) {
        if (provider.gardenId === "HG") {
          continue;
        }
        if (import_config.DEPLOYED_AS_ROOT) {
          continue;
        } else {
          const defaultGardenId = getDefaultGardenIdForProvider2(provider.id);
          if (provider.gardenId !== defaultGardenId) {
            provider.gardenId = defaultGardenId || "HG";
            providersReset++;
          }
        }
      }
      const persistenceFile = path.join(__dirname, "eden-wallet-persistence.json");
      const gardensFile = path.join(__dirname, "eden-gardens-persistence.json");
      const serviceRegistryFile = path.join(__dirname, "eden-serviceRegistry-persistence.json");
      let walletBalances = {};
      if (fs.existsSync(persistenceFile)) {
        try {
          const fileContent = fs.readFileSync(persistenceFile, "utf-8");
          const currentPersistence = JSON.parse(fileContent);
          walletBalances = currentPersistence.walletBalances || {};
        } catch (err) {
          console.warn(`   \u26A0\uFE0F  Could not load existing wallet persistence file:`, err.message);
        }
      }
      const updatedPersistence = {
        walletBalances,
        lastSaved: (/* @__PURE__ */ new Date()).toISOString(),
        resetAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      fs.writeFileSync(persistenceFile, JSON.stringify(updatedPersistence, null, 2), "utf-8");
      console.log(`   \u{1F4BE} [Reset] Updated wallet persistence file (preserved ${Object.keys(walletBalances).length} wallet balances)`);
      const emptyGardensData = {
        gardens: [],
        lastSaved: (/* @__PURE__ */ new Date()).toISOString(),
        resetAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      fs.writeFileSync(gardensFile, JSON.stringify(emptyGardensData, null, 2), "utf-8");
      console.log(`   \u{1F4BE} [Reset] Cleared gardens file`);
      const emptyServiceRegistryData = {
        serviceRegistry: [],
        lastSaved: (/* @__PURE__ */ new Date()).toISOString(),
        resetAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      fs.writeFileSync(serviceRegistryFile, JSON.stringify(emptyServiceRegistryData, null, 2), "utf-8");
      console.log(`   \u{1F4BE} [Reset] Cleared service registry file`);
      console.log(`   \u2705 Cleared ${clearedIndexersCount} generated indexers and reset ${providersReset} provider assignments. Wallet balances and ledger entries preserved.`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        message: `Reset successful. Cleared ${clearedIndexersCount} generated indexers and reset ${providersReset} provider assignments. Wallet balances and ledger entries preserved.`,
        clearedIndexers: clearedIndexersCount,
        resetProviders: providersReset,
        remainingIndexers: import_state.GARDENS.length + import_state.TOKEN_GARDENS.length,
        persistenceFile
      }));
    } catch (err) {
      console.error(`   \u274C Error resetting:`, err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname === "/api/wallet/persistence/system-prompt" && req.method === "POST") {
    console.log(`   \u{1F4BE} [${requestId}] POST /api/wallet/persistence/system-prompt - Saving system prompt`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const systemPromptData = JSON.parse(body);
        const persistenceFile = path.join(__dirname, "eden-wallet-persistence.json");
        let currentPersistence = {
          walletBalances: {},
          ledgerEntries: [],
          gardens: [],
          systemPrompts: []
        };
        if (fs.existsSync(persistenceFile)) {
          try {
            const fileContent = fs.readFileSync(persistenceFile, "utf-8");
            currentPersistence = JSON.parse(fileContent);
          } catch (err) {
            console.warn(`   \u26A0\uFE0F  Could not load existing persistence file:`, err.message);
          }
        }
        if (!currentPersistence.systemPrompts) {
          currentPersistence.systemPrompts = [];
        }
        const existingIndex = currentPersistence.systemPrompts.findIndex(
          (sp) => sp.serviceType === systemPromptData.serviceType
        );
        if (existingIndex >= 0) {
          currentPersistence.systemPrompts[existingIndex] = systemPromptData;
        } else {
          currentPersistence.systemPrompts.push(systemPromptData);
        }
        currentPersistence.lastSaved = (/* @__PURE__ */ new Date()).toISOString();
        fs.writeFileSync(persistenceFile, JSON.stringify(currentPersistence, null, 2), "utf-8");
        console.log(`   \u2705 System prompt saved for service type: ${systemPromptData.serviceType}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: `System prompt saved for service type: ${systemPromptData.serviceType}`
        }));
      } catch (err) {
        console.error(`   \u274C Failed to save system prompt:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname.startsWith("/api/jsc/transactions/") && req.method === "GET") {
    const email = decodeURIComponent(pathname.split("/api/jsc/transactions/")[1]);
    console.log(`   \u{1F4DC} [${requestId}] GET /api/jsc/transactions/${email} - Getting transaction history`);
    const userTransactions = import_state.LEDGER.filter((entry) => entry.payer === email);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      email,
      transactions: userTransactions,
      count: userTransactions.length
    }));
    return;
  }
  if (pathname === "/api/stripe/ledger/query" && req.method === "GET") {
    const query = parsedUrl.query;
    const paymentIntentId = query.payment_intent_id;
    const customerId = query.customer_id;
    const sessionId = query.session_id;
    console.log(`   \u{1F50D} [${requestId}] GET /api/stripe/ledger/query - Querying ledger by Stripe IDs`);
    let matchingEntries = import_state.LEDGER.filter((entry) => {
      if (entry.serviceType !== "mint")
        return false;
      const details = entry.bookingDetails;
      if (!details)
        return false;
      let matches = true;
      if (paymentIntentId && details.stripePaymentIntentId !== paymentIntentId) {
        matches = false;
      }
      if (customerId && details.stripeCustomerId !== customerId) {
        matches = false;
      }
      if (sessionId && details.stripeSessionId !== sessionId) {
        matches = false;
      }
      return matches;
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      query: { paymentIntentId, customerId, sessionId },
      entries: matchingEntries,
      count: matchingEntries.length
    }));
    return;
  }
  if (pathname === "/rpc/getTransactionByPayer" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /rpc/getTransactionByPayer`);
    const queryParams = new URL(req.url || "", `http://${req.headers.host}`).searchParams;
    const payer = queryParams.get("payer");
    if (!payer) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "payer parameter required" }));
      return;
    }
    const transactions = getTransactionByPayer(payer);
    console.log(`   \u{1F4E1} [Service Provider] RPC Query: getTransactionByPayer(payer=${payer}) \u2192 Found ${transactions.length} transaction(s)`);
    broadcastEvent({
      type: "provider_rpc_query",
      component: "service_provider",
      message: `Service Provider RPC Query: getTransactionByPayer`,
      timestamp: Date.now(),
      data: {
        method: "getTransactionByPayer",
        payer,
        transactionCount: transactions.length,
        requestId
      }
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      payer,
      transactions,
      count: transactions.length,
      timestamp: Date.now()
    }));
    return;
  }
  if (pathname === "/rpc/getTransactionBySnapshot" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /rpc/getTransactionBySnapshot`);
    const queryParams = new URL(req.url || "", `http://${req.headers.host}`).searchParams;
    const snapshotId = queryParams.get("snapshot_id");
    if (!snapshotId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "snapshot_id parameter required" }));
      return;
    }
    const transaction = getTransactionBySnapshot(snapshotId);
    if (!transaction) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Transaction not found" }));
      return;
    }
    console.log(`   \u{1F4E1} [Service Provider] RPC Query: getTransactionBySnapshot(snapshotId=${snapshotId.substring(0, 8)}...) \u2192 Found`);
    broadcastEvent({
      type: "provider_rpc_query",
      component: "service_provider",
      message: `Service Provider RPC Query: getTransactionBySnapshot`,
      timestamp: Date.now(),
      data: {
        method: "getTransactionBySnapshot",
        snapshotId,
        found: true,
        requestId
      }
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      transaction,
      timestamp: Date.now()
    }));
    return;
  }
  if (pathname === "/rpc/getLatestSnapshot" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /rpc/getLatestSnapshot`);
    const queryParams = new URL(req.url || "", `http://${req.headers.host}`).searchParams;
    const providerId = queryParams.get("provider_id");
    if (!providerId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "provider_id parameter required" }));
      return;
    }
    const snapshot = getLatestSnapshot(providerId);
    if (!snapshot) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No transactions found for provider" }));
      return;
    }
    console.log(`   \u{1F4E1} [Service Provider] RPC Query: getLatestSnapshot(providerId=${providerId}) \u2192 Found TX: ${snapshot.txId.substring(0, 8)}...`);
    broadcastEvent({
      type: "provider_rpc_query",
      component: "service_provider",
      message: `Service Provider RPC Query: getLatestSnapshot`,
      timestamp: Date.now(),
      data: {
        method: "getLatestSnapshot",
        providerId,
        found: true,
        txId: snapshot.txId,
        requestId
      }
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      snapshot,
      timestamp: Date.now()
    }));
    return;
  }
  if (pathname === "/rpc/tx/status" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /rpc/tx/status`);
    const queryParams = new URL(req.url || "", `http://${req.headers.host}`).searchParams;
    const payer = queryParams.get("payer");
    const snapshotId = queryParams.get("snapshot_id");
    if (!payer && !snapshotId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "payer or snapshot_id parameter required" }));
      return;
    }
    let transaction = null;
    if (snapshotId) {
      transaction = getTransactionBySnapshot(snapshotId);
    } else if (payer) {
      const transactions = getTransactionByPayer(payer);
      transaction = transactions.length > 0 ? transactions[transactions.length - 1] : null;
    }
    if (!transaction) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        status: "not_found",
        message: "Transaction not found"
      }));
      return;
    }
    console.log(`   \u{1F504} [Service Provider] RPC Poll: tx/status(${payer ? `payer=${payer}` : `snapshotId=${snapshotId?.substring(0, 8)}...`}) \u2192 Status: ${transaction.status}`);
    broadcastEvent({
      type: "provider_rpc_poll",
      component: "service_provider",
      message: `Service Provider Polling: tx/status`,
      timestamp: Date.now(),
      data: {
        method: "tx/status",
        payer: payer || null,
        snapshotId: snapshotId || null,
        status: transaction.status,
        txId: transaction.txId,
        requestId
      }
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      status: transaction.status,
      transaction: {
        txId: transaction.txId,
        entryId: transaction.entryId,
        payer: transaction.payer,
        merchant: transaction.merchant,
        amount: transaction.amount,
        status: transaction.status,
        timestamp: transaction.timestamp
      },
      timestamp: Date.now()
    }));
    return;
  }
  if (pathname === "/rpc/webhook/register" && req.method === "POST") {
    console.log(`   \u2705 [${requestId}] POST /rpc/webhook/register`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const { providerId, webhookUrl } = JSON.parse(body);
        if (!providerId || !webhookUrl) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "providerId and webhookUrl required" }));
          return;
        }
        try {
          new URL(webhookUrl);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid webhook URL" }));
          return;
        }
        PROVIDER_WEBHOOKS.set(providerId, {
          providerId,
          webhookUrl,
          registeredAt: Date.now(),
          failureCount: 0
        });
        console.log(`\u{1F4E1} [Service Provider] Webhook Registered: ${providerId} \u2192 ${webhookUrl}`);
        broadcastEvent({
          type: "provider_webhook_registered",
          component: "service_provider",
          message: `Webhook Registered: ${providerId}`,
          timestamp: Date.now(),
          data: {
            providerId,
            webhookUrl,
            requestId
          }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: "Webhook registered",
          providerId,
          webhookUrl,
          timestamp: Date.now()
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/rpc/webhook/unregister" && req.method === "POST") {
    console.log(`   \u2705 [${requestId}] POST /rpc/webhook/unregister`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const { providerId } = JSON.parse(body);
        if (!providerId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "providerId required" }));
          return;
        }
        const removed = PROVIDER_WEBHOOKS.delete(providerId);
        if (removed) {
          console.log(`\u{1F50C} [Service Provider] Webhook Unregistered: ${providerId}`);
          broadcastEvent({
            type: "provider_webhook_unregistered",
            component: "service_provider",
            message: `Webhook Unregistered: ${providerId}`,
            timestamp: Date.now(),
            data: {
              providerId,
              requestId
            }
          });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: removed ? "Webhook unregistered" : "Webhook not found",
          providerId,
          timestamp: Date.now()
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/rpc/webhook/list" && req.method === "GET") {
    console.log(`   \u2705 [${requestId}] GET /rpc/webhook/list`);
    const webhooks = Array.from(PROVIDER_WEBHOOKS.values());
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      webhooks,
      count: webhooks.length,
      timestamp: Date.now()
    }));
    return;
  }
  if (pathname.startsWith("/mock/webhook/") && req.method === "POST") {
    const providerId = pathname.split("/mock/webhook/")[1];
    console.log(`   \u{1F4E5} [Mock Webhook] Received webhook for provider: ${providerId}`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        console.log(`   \u2705 [Mock Webhook] Successfully received webhook for ${providerId}:`, {
          event: payload.event,
          txId: payload.snapshot?.txId,
          payer: payload.snapshot?.payer,
          amount: payload.snapshot?.amount
        });
        broadcastEvent({
          type: "provider_webhook_received",
          component: "service_provider",
          message: `Mock Webhook Received: ${providerId}`,
          timestamp: Date.now(),
          data: {
            providerId,
            event: payload.event,
            txId: payload.snapshot?.txId,
            payer: payload.snapshot?.payer,
            amount: payload.snapshot?.amount
          }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: "Webhook received",
          providerId,
          receivedAt: Date.now()
        }));
      } catch (err) {
        console.error(`   \u274C [Mock Webhook] Error parsing webhook payload for ${providerId}:`, err.message);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload" }));
      }
    });
    return;
  }
  if (pathname === "/api/ledger" && req.method === "GET") {
    console.log(`\u{1F4E1} [API] \u2B50 GET /api/ledger endpoint called`);
    const parsedUrl2 = url.parse(req.url || "/", true);
    const payerEmail = parsedUrl2.query.email;
    const pageParam = parsedUrl2.query.page;
    const limitParam = parsedUrl2.query.limit;
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    console.log(`\u{1F4E1} [API] Query params:`, parsedUrl2.query);
    console.log(`\u{1F4E1} [API] Pagination: page=${page}, limit=${limit}`);
    console.log(`\u{1F4E1} [API] Checking LEDGER array before getLedgerEntries call: ${import_state.LEDGER.length} entries`);
    console.log(`\u{1F4E1} [API] LEDGER array reference check:`, typeof import_state.LEDGER);
    import_state.LEDGER.forEach((entry, index) => {
      if (index < 5) {
        console.log(`\u{1F4E1} [API] Entry ${index}:`, {
          entryId: entry.entryId,
          txId: entry.txId,
          payer: entry.payer,
          merchant: entry.merchant,
          amount: entry.amount,
          serviceType: entry.serviceType,
          status: entry.status,
          movieTitle: entry.bookingDetails?.movieTitle,
          timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : "no timestamp"
        });
      }
    });
    let allEntries = getLedgerEntries(payerEmail);
    console.log(`\u{1F4E1} [API] getLedgerEntries returned ${allEntries.length} entries${payerEmail ? ` for ${payerEmail}` : " (all entries)"}`);
    allEntries.sort((a, b) => {
      const timestampA = a.timestamp || 0;
      const timestampB = b.timestamp || 0;
      return timestampB - timestampA;
    });
    const total = allEntries.length;
    const totalPages = Math.ceil(total / limit);
    const validPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (validPage - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedEntries = allEntries.slice(startIndex, endIndex);
    console.log(`\u{1F4E1} [API] Pagination: total=${total}, totalPages=${totalPages}, page=${validPage}, showing ${paginatedEntries.length} entries (${startIndex + 1}-${Math.min(endIndex, total)})`);
    console.log(`\u{1F4E1} [API] LEDGER array has ${import_state.LEDGER.length} entries in memory`);
    if (import_state.LEDGER.length > 0) {
      console.log(`\u{1F4E1} [API] First entry:`, JSON.stringify(import_state.LEDGER[0], null, 2));
    }
    const response = {
      success: true,
      entries: paginatedEntries,
      pagination: {
        page: validPage,
        limit,
        total,
        totalPages,
        hasNextPage: validPage < totalPages,
        hasPreviousPage: validPage > 1
      }
    };
    console.log(`\u{1F4E1} [API] Sending response with pagination:`, {
      entriesCount: paginatedEntries.length,
      page: validPage,
      totalPages,
      total
    });
    console.log(`\u{1F4E4} [${requestId}] Response: 200 OK (${paginatedEntries.length} ledger entries, page ${validPage}/${totalPages})`);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
      // Ensure CORS is allowed
    });
    res.end(JSON.stringify(response));
    return;
  }
  if ((pathname === "/api/cashier" || pathname === "/api/cachier") && req.method === "GET") {
    console.log(`   \u{1F4B0} [${requestId}] GET ${pathname} - Getting cashier status`);
    try {
      const cashierStatus = (0, import_ledger.getCashierStatus)();
      console.log(`   \u2705 [${requestId}] Cashier status retrieved:`, cashierStatus.name);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: true,
        cashier: cashierStatus
      }));
    } catch (error) {
      console.error(`   \u274C [${requestId}] Error getting cashier status:`, error.message);
      res.writeHead(500, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
    return;
  }
  if (pathname === "/api/rag/generate" && req.method === "POST") {
    console.log(`   \u{1F4DA} [${requestId}] POST /api/rag/generate - Generating RAG knowledge from white paper`);
    req.on("end", async () => {
      try {
        const { generateAndSaveRAGKnowledge } = await import("./src/rag/ragGenerator");
        await generateAndSaveRAGKnowledge();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: "RAG knowledge base generated successfully from white paper"
        }));
      } catch (err) {
        console.error(`   \u274C [${requestId}] Failed to generate RAG knowledge:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          error: err.message || "Failed to generate RAG knowledge base"
        }));
      }
    });
    return;
  }
  if (pathname === "/api/system-prompt/generate" && req.method === "POST") {
    console.log(`   \u{1F916} [${requestId}] POST /api/system-prompt/generate - Generating system prompt`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { description, serviceType } = JSON.parse(body);
        if (!description || !serviceType) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "description and serviceType required" }));
          return;
        }
        const prompts = await generateSystemPrompts(description, serviceType);
        const redisKey = `eden:system-prompts:${serviceType}`;
        redis.set(redisKey, JSON.stringify(prompts));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, prompts, redisKey }));
      } catch (err) {
        console.error(`   \u274C Failed to generate system prompt:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          error: err.message || "Failed to generate system prompt"
        }));
      }
    });
    return;
  }
  if (pathname.startsWith("/api/system-prompt/") && req.method === "GET") {
    const serviceType = pathname.split("/").pop();
    console.log(`   \u{1F4CB} [${requestId}] GET /api/system-prompt/${serviceType} - Retrieving system prompt`);
    try {
      const redisKey = `eden:system-prompts:${serviceType}`;
      const promptsJson = redis.get(redisKey);
      if (promptsJson) {
        const prompts = JSON.parse(promptsJson);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, prompts }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "System prompt not found" }));
      }
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname === "/api/notification-code/generate" && req.method === "POST") {
    console.log(`   \u{1F514} [${requestId}] POST /api/notification-code/generate - Generating notification code`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { providerId, providerName, language, framework, indexerEndpoint, webhookUrl, serviceType, notificationMethods } = JSON.parse(body);
        if (!providerId || !language || !framework) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "providerId, language, and framework required" }));
          return;
        }
        const code = await generateNotificationCode({
          providerId,
          providerName: providerName || providerId,
          language,
          framework,
          indexerEndpoint: indexerEndpoint || `http://localhost:${import_config.HTTP_PORT}`,
          webhookUrl: webhookUrl || `http://localhost:${import_config.HTTP_PORT}/api/provider-plugin/webhook/${providerId}`,
          serviceType: serviceType || "movie",
          notificationMethods: notificationMethods || ["webhook", "pull", "rpc"]
        });
        const redisKey = `eden:notification-code:${providerId}`;
        redis.set(redisKey, JSON.stringify(code));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, code, redisKey }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname.startsWith("/api/notification-code/") && req.method === "GET") {
    const providerId = pathname.split("/").pop();
    console.log(`   \u{1F4CB} [${requestId}] GET /api/notification-code/${providerId} - Retrieving notification code`);
    try {
      const redisKey = `eden:notification-code:${providerId}`;
      const codeJson = redis.get(redisKey);
      if (codeJson) {
        const code = JSON.parse(codeJson);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, code }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Notification code not found" }));
      }
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname === "/api/provider-plugin/mysql/test-query" && req.method === "POST") {
    console.log(`   \u{1F9E9} [${requestId}] POST /api/provider-plugin/mysql/test-query`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const connection = parsed.connection;
        const sql = parsed.sql;
        const params = Array.isArray(parsed.params) ? parsed.params : [];
        const maxRows = parsed.maxRows;
        console.log(`   \u{1F50D} [${requestId}] Received connection:`, {
          host: connection?.host,
          port: connection?.port,
          user: connection?.user,
          database: connection?.database,
          hasPassword: !!connection?.password
        });
        if (!connection?.host || !connection?.user || !connection?.password || !connection?.database) {
          const missing = [];
          if (!connection?.host)
            missing.push("host");
          if (!connection?.user)
            missing.push("user");
          if (!connection?.password)
            missing.push("password");
          if (!connection?.database)
            missing.push("database");
          console.log(`   \u274C [${requestId}] Missing fields: ${missing.join(", ")}`);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `connection.${missing.join("/")} required` }));
          return;
        }
        if (!sql || typeof sql !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "sql required" }));
          return;
        }
        console.log(`   \u{1F4DD} [${requestId}] SQL Query:`, sql);
        console.log(`   \u{1F4DD} [${requestId}] SQL Params:`, params);
        console.log(`   \u{1F4DD} [${requestId}] Max Rows:`, maxRows);
        const result = await (0, import_mysql.testMySQLQuery)({
          connection: {
            host: String(connection.host),
            port: connection.port ? Number(connection.port) : 3306,
            user: String(connection.user),
            password: String(connection.password),
            database: String(connection.database)
          },
          sql,
          params,
          maxRows
        });
        console.log(`   \u{1F4CA} [${requestId}] SQL Query Results:`);
        console.log(`   \u{1F4CA} [${requestId}] - Row Count: ${result.rowCount}`);
        console.log(`   \u{1F4CA} [${requestId}] - Columns: ${result.columns.join(", ")}`);
        console.log(`   \u{1F4CA} [${requestId}] - Elapsed: ${result.elapsedMs}ms`);
        if (result.rows.length > 0) {
          console.log(`   \u{1F4CA} [${requestId}] - First Row:`, JSON.stringify(result.rows[0], bigIntReplacer, 2));
          if (result.rows.length > 1) {
            console.log(`   \u{1F4CA} [${requestId}] - All Rows (${result.rows.length}):`, JSON.stringify(result.rows, bigIntReplacer, 2));
          }
        } else {
          console.log(`   \u{1F4CA} [${requestId}] - No rows returned`);
        }
        let groupedResults = result.rows;
        const rows = result.rows || [];
        const serviceType = parsed.serviceType || "autoparts";
        const hasImageColumns = rows.length > 0 && ("autopart_id" in rows[0] || "image_id" in rows[0] || "image_url" in rows[0] || "i.id" in rows[0] || Object.keys(rows[0]).some((k) => k.startsWith("image_") || k.startsWith("i.") || k.toLowerCase().includes("image")));
        const hasAutopartId = rows.length > 0 && ("id" in rows[0] || "a.id" in rows[0] || "autopart_id" in rows[0]);
        const hasAutopartsColumns = rows.length > 0 && ("make" in rows[0] || "model" in rows[0] || "year" in rows[0] || "title" in rows[0] || "part_name" in rows[0] || "sale_price" in rows[0] || "stock_number" in rows[0]);
        const effectiveServiceType = (serviceType || "").toLowerCase().trim();
        const shouldGroup = (effectiveServiceType === "autoparts" || hasAutopartsColumns) && hasImageColumns && hasAutopartId;
        if (shouldGroup) {
          console.log(`   \u{1F504} [${requestId}] Grouping autoparts with images (${rows.length} rows)`);
          const autopartsMap = /* @__PURE__ */ new Map();
          for (const row of rows) {
            const autopartId = row.id || row["a.id"] || row.autopart_id;
            if (!autopartId)
              continue;
            if (!autopartsMap.has(autopartId)) {
              const autopart2 = { imageModals: [] };
              for (const [k, v] of Object.entries(row || {})) {
                if (k.startsWith("image_") || k.startsWith("i.") || k.toLowerCase().includes("image") && k !== "imageModals" || k === "autopart_id") {
                  continue;
                }
                if (k.startsWith("a.")) {
                  autopart2[k.substring(2)] = v;
                } else {
                  autopart2[k] = v;
                }
              }
              if (autopart2.price === void 0 || autopart2.price === null) {
                const maybePrice = autopart2.Price ?? autopart2.price_usd ?? autopart2.amount ?? autopart2.cost ?? autopart2.sale_price;
                autopart2.price = typeof maybePrice === "string" ? parseFloat(maybePrice) : typeof maybePrice === "number" ? maybePrice : 0;
              }
              if (!autopart2.partName && autopart2.part_name)
                autopart2.partName = autopart2.part_name;
              if (!autopart2.partName && autopart2.title)
                autopart2.partName = autopart2.title;
              autopartsMap.set(autopartId, autopart2);
            }
            const autopart = autopartsMap.get(autopartId);
            const imageData = {};
            let hasImageData = false;
            for (const [k, v] of Object.entries(row || {})) {
              if (k.startsWith("image_")) {
                const cleanKey = k.substring(6);
                if (v !== null && v !== void 0) {
                  imageData[cleanKey] = v;
                  hasImageData = true;
                }
              } else if (k === "autopart_id" && v !== null && v !== void 0) {
                imageData[k] = v;
              } else if (k.startsWith("i.")) {
                const cleanKey = k.substring(2);
                if (v !== null && v !== void 0) {
                  imageData[cleanKey] = v;
                  hasImageData = true;
                }
              }
            }
            if (hasImageData && Object.keys(imageData).length > 0) {
              const imageId = imageData.id || imageData.image_id;
              if (imageId && !autopart.imageModals.find((img) => (img.id || img.image_id) === imageId)) {
                autopart.imageModals.push(imageData);
              } else if (!imageId) {
                const imageUrl = imageData.url || imageData.image_url;
                if (imageUrl && !autopart.imageModals.find((img) => (img.url || img.image_url) === imageUrl)) {
                  autopart.imageModals.push(imageData);
                } else if (!imageUrl) {
                  autopart.imageModals.push(imageData);
                }
              }
            }
          }
          groupedResults = Array.from(autopartsMap.values());
          console.log(`   \u2705 [${requestId}] Grouped ${rows.length} rows into ${groupedResults.length} autopart(s) with images`);
          console.log(`   \u{1F4CB} [${requestId}] Returning all fields (no hardcoded filtering)`);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          result: {
            ...result,
            rows: groupedResults,
            rowCount: groupedResults.length
          },
          timestamp: Date.now()
        }, bigIntReplacer));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
      }
    });
    return;
  }
  if (pathname === "/api/provider-plugin/mysql/test-getdata" && req.method === "POST") {
    console.log(`

`);
    console.log(`   ============================================================`);
    console.log(`   \u{1F9EA} [${requestId}] POST /api/provider-plugin/mysql/test-getdata`);
    console.log(`   \u{1F9EA} [${requestId}] getData wrapper pre-flight test STARTING`);
    console.log(`   ============================================================`);
    console.log(`
`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const connection = parsed.connection;
        const sql = String(parsed.sql || "").trim();
        const userQuery = String(parsed.userQuery || "").trim();
        const serviceType = String(parsed.serviceType || "autoparts").trim();
        const returnFields = parsed.returnFields ? String(parsed.returnFields).trim() : "";
        if (!connection || !connection.host || !connection.user || !connection.password || !connection.database) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "connection.host/user/password/database required" }));
          return;
        }
        if (!sql) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "sql required" }));
          return;
        }
        if (!userQuery) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "userQuery required" }));
          return;
        }
        console.log(`   \u{1F9EA} [${requestId}] getData Wrapper Test:`);
        console.log(`   \u{1F4DD} [${requestId}] - User Query: "${userQuery}"`);
        console.log(`   \u{1F4DD} [${requestId}] - Service Type: ${serviceType}`);
        console.log(`   \u{1F4DD} [${requestId}] - Original SQL:`, sql);
        console.log(`   \u{1F451} [${requestId}] Step 1: Extracting getData() params from user query...`);
        const getDataParams = await (0, import_llm.extractGetDataParamsWithOpenAI)(userQuery);
        console.log(`   \u2705 [${requestId}] Step 1 Complete:`, {
          serviceType: getDataParams.serviceType,
          params: getDataParams.params,
          maxCount: getDataParams.maxCount,
          sortBy: getDataParams.sortBy,
          order: getDataParams.order
        });
        console.log(`   \u{1F451} [${requestId}] Step 2: Parameterizing SQL query...`);
        const sqlParamResult = await (0, import_llm.parameterizeSQLWithOpenAI)(sql);
        console.log(`   \u2705 [${requestId}] Step 2 Complete:`, {
          parameterizedSql: sqlParamResult.parameterizedSql,
          paramOrder: sqlParamResult.paramOrder,
          extractedParams: sqlParamResult.params
        });
        console.log(`   \u{1F504} [${requestId}] Step 3: Mapping getData params to SQL params...`);
        const sqlParams = [];
        const paramOrder = sqlParamResult.paramOrder || [];
        const getDataParamsArray = getDataParams.params || [];
        const parameterizedSql = sqlParamResult.parameterizedSql;
        const hasLimitPlaceholder = /LIMIT\s+\?/i.test(parameterizedSql);
        const hasOffsetPlaceholder = /OFFSET\s+\?/i.test(parameterizedSql);
        let placeholdersBeforeLimit = 0;
        if (hasLimitPlaceholder) {
          const beforeLimit = parameterizedSql.substring(0, parameterizedSql.toUpperCase().indexOf("LIMIT"));
          placeholdersBeforeLimit = (beforeLimit.match(/\?/g) || []).length;
        }
        if (sqlParamResult.params.length > 0) {
          const paramsToUse = sqlParamResult.params.slice(0, placeholdersBeforeLimit);
          sqlParams.push(...paramsToUse);
        } else if (getDataParamsArray.length > 0) {
          sqlParams.push(...getDataParamsArray.slice(0, Math.min(paramOrder.length, placeholdersBeforeLimit)));
        }
        if (hasLimitPlaceholder && hasOffsetPlaceholder) {
          sqlParams.push(getDataParams.maxCount || 30);
          sqlParams.push(0);
        } else if (hasLimitPlaceholder) {
          sqlParams.push(getDataParams.maxCount || 30);
        }
        console.log(`   \u2705 [${requestId}] Step 3 Complete: SQL params:`, sqlParams);
        console.log(`   \u{1F5C4}\uFE0F  [${requestId}] Step 4: Executing parameterized SQL query...`);
        const maxRows = Math.min(getDataParams.maxCount || 30, 50);
        const sqlResult = await (0, import_mysql.testMySQLQuery)({
          connection: {
            host: String(connection.host),
            port: connection.port ? Number(connection.port) : 3306,
            user: String(connection.user),
            password: String(connection.password),
            database: String(connection.database)
          },
          sql: sqlParamResult.parameterizedSql,
          params: sqlParams,
          maxRows
        });
        console.log(`   \u2705 [${requestId}] Step 4 Complete: ${sqlResult.rowCount} row(s) returned`);
        console.log(`   \u{1F50D} [${requestId}] ========== STEP 5: GROUPING CHECK START ==========`);
        console.log(`   \u{1F50D} [${requestId}] Raw SQL result: ${sqlResult.rowCount} rows`);
        if (sqlResult.rows && sqlResult.rows.length > 0) {
          const autopartIds = sqlResult.rows.map((r) => r.id || r["a.id"] || r.autopart_id).filter((id) => id !== void 0);
          console.log(`   \u{1F50D} [${requestId}] Autopart IDs in raw rows: ${autopartIds.join(", ")}`);
          console.log(`   \u{1F50D} [${requestId}] Unique autopart IDs: ${[...new Set(autopartIds)].join(", ")} (${[...new Set(autopartIds)].length} unique)`);
        }
        let groupedResults = sqlResult.rows;
        const rows = sqlResult.rows || [];
        console.log(`   \u{1F50D} [${requestId}] Raw input values:`);
        console.log(`   \u{1F50D} [${requestId}]   - getDataParams.serviceType: "${getDataParams.serviceType}"`);
        console.log(`   \u{1F50D} [${requestId}]   - parsed serviceType: "${serviceType}"`);
        console.log(`   \u{1F50D} [${requestId}]   - rows.length: ${rows.length}`);
        const effectiveServiceType = (getDataParams.serviceType || serviceType || "").toLowerCase().trim();
        console.log(`   \u{1F50D} [${requestId}]   - effectiveServiceType (after lower/trim): "${effectiveServiceType}"`);
        const hasImageColumns = rows.length > 0 && ("autopart_id" in rows[0] || "image_id" in rows[0] || "image_url" in rows[0] || "i.id" in rows[0] || Object.keys(rows[0]).some((k) => k.startsWith("image_") || k.startsWith("i.") || k.toLowerCase().includes("image")));
        const hasAutopartId = rows.length > 0 && ("id" in rows[0] || "a.id" in rows[0] || "autopart_id" in rows[0]);
        const hasAutopartsColumns = rows.length > 0 && ("make" in rows[0] || "model" in rows[0] || "year" in rows[0] || "title" in rows[0] || "part_name" in rows[0] || "sale_price" in rows[0] || "stock_number" in rows[0]);
        console.log(`   \u{1F50D} [${requestId}] Step 5: Checking grouping conditions:`);
        console.log(`   \u{1F50D} [${requestId}]   - effectiveServiceType: "${effectiveServiceType}"`);
        console.log(`   \u{1F50D} [${requestId}]   - hasImageColumns: ${hasImageColumns}`);
        console.log(`   \u{1F50D} [${requestId}]   - hasAutopartId: ${hasAutopartId}`);
        console.log(`   \u{1F50D} [${requestId}]   - hasAutopartsColumns: ${hasAutopartsColumns}`);
        if (rows.length > 0) {
          console.log(`   \u{1F50D} [${requestId}]   - First row keys:`, Object.keys(rows[0]).join(", "));
          console.log(`   \u{1F50D} [${requestId}]   - First row has 'image_id':`, "image_id" in rows[0]);
          console.log(`   \u{1F50D} [${requestId}]   - First row has 'autopart_id':`, "autopart_id" in rows[0]);
          console.log(`   \u{1F50D} [${requestId}]   - First row has 'id':`, "id" in rows[0]);
        }
        const serviceTypeMatch = effectiveServiceType === "autoparts";
        const condition1 = serviceTypeMatch || hasAutopartsColumns;
        const condition2 = hasImageColumns;
        const condition3 = hasAutopartId;
        const shouldGroup = condition1 && condition2 && condition3;
        console.log(`   \u{1F50D} [${requestId}] ========== GROUPING CONDITION EVALUATION ==========`);
        console.log(`   \u{1F50D} [${requestId}] Condition 1 (serviceType OR autoparts columns): ${condition1}`);
        console.log(`   \u{1F50D} [${requestId}]   - serviceType === "autoparts": ${serviceTypeMatch} (effectiveServiceType="${effectiveServiceType}")`);
        console.log(`   \u{1F50D} [${requestId}]   - hasAutopartsColumns: ${hasAutopartsColumns}`);
        console.log(`   \u{1F50D} [${requestId}] Condition 2 (hasImageColumns): ${condition2}`);
        console.log(`   \u{1F50D} [${requestId}] Condition 3 (hasAutopartId): ${condition3}`);
        console.log(`   \u{1F50D} [${requestId}] FINAL DECISION: shouldGroup = ${shouldGroup} (${condition1} && ${condition2} && ${condition3})`);
        console.log(`   \u{1F50D} [${requestId}] ==================================================`);
        if (shouldGroup) {
          console.log(`   \u{1F504} [${requestId}] ========== ENTERING GROUPING BLOCK ==========`);
          console.log(`   \u{1F504} [${requestId}] Step 5: Grouping autoparts with images (${rows.length} rows)`);
          const autopartsMap = /* @__PURE__ */ new Map();
          let rowIndex = 0;
          for (const row of rows) {
            rowIndex++;
            console.log(`   \u{1F4E6} [${requestId}] Processing row ${rowIndex}/${rows.length}:`);
            console.log(`   \u{1F4E6} [${requestId}]   - Row keys: ${Object.keys(row).join(", ")}`);
            console.log(`   \u{1F4E6} [${requestId}]   - Row id: ${row.id}, row['a.id']: ${row["a.id"]}, row.autopart_id: ${row.autopart_id}`);
            const autopartId = row.id || row["a.id"] || row.autopart_id;
            console.log(`   \u{1F4E6} [${requestId}]   - Autopart ID: ${autopartId} (from: ${row.id ? "id" : row["a.id"] ? "a.id" : "autopart_id"})`);
            if (!autopartId) {
              console.log(`   \u26A0\uFE0F  [${requestId}]   - Skipping row ${rowIndex}: No autopart ID found`);
              console.log(`   \u26A0\uFE0F  [${requestId}]   - Full row data: ${JSON.stringify(row, null, 2)}`);
              continue;
            }
            const isNewAutopart = !autopartsMap.has(autopartId);
            console.log(`   \u{1F4E6} [${requestId}]   - Is new autopart: ${isNewAutopart}`);
            if (isNewAutopart) {
              console.log(`   \u{1F195} [${requestId}]   - Creating new autopart entry for ID: ${autopartId}`);
              const autopart2 = {
                imageModals: []
              };
              let copiedColumns = 0;
              let skippedColumns = 0;
              for (const [k, v] of Object.entries(row || {})) {
                if (k.startsWith("image_") || k.startsWith("i.") || k.toLowerCase().includes("image") && k !== "imageModals" || k === "autopart_id") {
                  skippedColumns++;
                  continue;
                }
                if (k.startsWith("a.")) {
                  const cleanKey = k.substring(2);
                  autopart2[cleanKey] = v;
                  copiedColumns++;
                } else {
                  autopart2[k] = v;
                  copiedColumns++;
                }
              }
              console.log(`   \u{1F4CB} [${requestId}]   - Copied ${copiedColumns} autopart columns, skipped ${skippedColumns} image columns`);
              if (autopart2.price === void 0 || autopart2.price === null) {
                const maybePrice = autopart2.Price ?? autopart2.price_usd ?? autopart2.amount ?? autopart2.cost ?? autopart2.sale_price;
                autopart2.price = typeof maybePrice === "string" ? parseFloat(maybePrice) : typeof maybePrice === "number" ? maybePrice : 0;
                console.log(`   \u{1F4B0} [${requestId}]   - Set price: ${autopart2.price} (from: ${maybePrice !== void 0 ? "sale_price/Price/etc" : "default 0"})`);
              }
              if (!autopart2.partName && autopart2.part_name) {
                autopart2.partName = autopart2.part_name;
                console.log(`   \u{1F4DD} [${requestId}]   - Set partName from part_name: ${autopart2.partName}`);
              }
              if (!autopart2.partName && autopart2.title) {
                autopart2.partName = autopart2.title;
                console.log(`   \u{1F4DD} [${requestId}]   - Set partName from title: ${autopart2.partName}`);
              }
              autopartsMap.set(autopartId, autopart2);
              console.log(`   \u2705 [${requestId}]   - Autopart entry created with ${Object.keys(autopart2).length} properties`);
              console.log(`   \u{1F4CB} [${requestId}]   - Autopart fields: ${Object.keys(autopart2).join(", ")}`);
            } else {
              console.log(`   \u{1F504} [${requestId}]   - Using existing autopart entry for ID: ${autopartId}`);
            }
            const autopart = autopartsMap.get(autopartId);
            const imageData = {};
            let hasImageData = false;
            console.log(`   \u{1F5BC}\uFE0F  [${requestId}]   - Extracting image data from row ${rowIndex}:`);
            for (const [k, v] of Object.entries(row || {})) {
              if (k.startsWith("image_")) {
                const cleanKey = k.substring(6);
                if (v !== null && v !== void 0) {
                  imageData[cleanKey] = v;
                  hasImageData = true;
                  console.log(`   \u{1F5BC}\uFE0F  [${requestId}]     - Found image column '${k}' -> '${cleanKey}': ${v}`);
                }
              } else if (k === "autopart_id" && v !== null && v !== void 0) {
                imageData[k] = v;
                console.log(`   \u{1F5BC}\uFE0F  [${requestId}]     - Found autopart_id: ${v}`);
              } else if (k.startsWith("i.")) {
                const cleanKey = k.substring(2);
                if (v !== null && v !== void 0) {
                  imageData[cleanKey] = v;
                  hasImageData = true;
                  console.log(`   \u{1F5BC}\uFE0F  [${requestId}]     - Found image column '${k}' -> '${cleanKey}': ${v}`);
                }
              }
            }
            console.log(`   \u{1F5BC}\uFE0F  [${requestId}]   - Image data extracted: hasImageData=${hasImageData}, keys: ${Object.keys(imageData).join(", ")}`);
            if (hasImageData && Object.keys(imageData).length > 0) {
              const imageId = imageData.id || imageData.image_id;
              const existingImageCount = autopart.imageModals.length;
              if (imageId) {
                const isDuplicate = autopart.imageModals.find((img) => (img.id || img.image_id) === imageId);
                if (!isDuplicate) {
                  autopart.imageModals.push(imageData);
                  console.log(`   \u2705 [${requestId}]   - Added image with ID ${imageId} (total images: ${autopart.imageModals.length})`);
                } else {
                  console.log(`   \u23ED\uFE0F  [${requestId}]   - Skipped duplicate image with ID ${imageId}`);
                }
              } else {
                const imageUrl = imageData.url || imageData.image_url;
                if (imageUrl) {
                  const isDuplicate = autopart.imageModals.find((img) => (img.url || img.image_url) === imageUrl);
                  if (!isDuplicate) {
                    autopart.imageModals.push(imageData);
                    console.log(`   \u2705 [${requestId}]   - Added image with URL ${imageUrl} (total images: ${autopart.imageModals.length})`);
                  } else {
                    console.log(`   \u23ED\uFE0F  [${requestId}]   - Skipped duplicate image with URL ${imageUrl}`);
                  }
                } else {
                  autopart.imageModals.push(imageData);
                  console.log(`   \u2705 [${requestId}]   - Added image without ID/URL (total images: ${autopart.imageModals.length})`);
                }
              }
            } else {
              console.log(`   \u26A0\uFE0F  [${requestId}]   - No image data to add (hasImageData=${hasImageData}, keys.length=${Object.keys(imageData).length})`);
            }
          }
          if (returnFields && returnFields.length > 0) {
            const returnFieldsList = returnFields.split(",").map((f) => f.trim()).filter((f) => f.length > 0);
            const fieldsToInclude = [...returnFieldsList, "imageModals"];
            groupedResults = Array.from(autopartsMap.values()).map((ap) => {
              const filtered = {};
              for (const field of fieldsToInclude) {
                if (field === "imageModals") {
                  filtered[field] = ap[field] || [];
                } else if (ap[field] !== void 0) {
                  filtered[field] = ap[field];
                }
              }
              return filtered;
            });
            console.log(`   \u2705 [${requestId}] Step 5 Complete: Grouped ${rows.length} rows into ${groupedResults.length} autopart(s) with images`);
            console.log(`   \u{1F4CB} [${requestId}] Filtered to return fields: ${returnFieldsList.join(", ")}, + imageModals`);
            console.log(`   \u{1F4CB} [${requestId}] Autopart IDs in map: ${Array.from(autopartsMap.keys()).join(", ")}`);
            const firstAutopartBeforeFilter = Array.from(autopartsMap.values())[0];
            if (firstAutopartBeforeFilter) {
              console.log(`   \u{1F4CB} [${requestId}] Available fields in first autopart (before filtering): ${Object.keys(firstAutopartBeforeFilter).join(", ")}`);
            }
            for (let i = 0; i < groupedResults.length; i++) {
              const ap = groupedResults[i];
              const fieldValues = returnFieldsList.map((f) => `${f}=${ap[f] !== void 0 ? JSON.stringify(ap[f]) : "N/A"}`).join(", ");
              console.log(`   \u{1F4CA} [${requestId}]   - Autopart ${i + 1}: ${fieldValues}, images=${ap.imageModals?.length || 0}`);
              console.log(`   \u{1F4CA} [${requestId}]   - Autopart ${i + 1} all fields after filtering: ${Object.keys(ap).join(", ")}`);
            }
          } else {
            groupedResults = Array.from(autopartsMap.values());
            console.log(`   \u2705 [${requestId}] Step 5 Complete: Grouped ${rows.length} rows into ${groupedResults.length} autopart(s) with images`);
            console.log(`   \u{1F4CB} [${requestId}] Returning all fields (no returnFields specified, no filtering)`);
          }
          const groupedColumns = groupedResults.length > 0 ? Object.keys(groupedResults[0]).filter((k) => k !== "imageModals") : sqlResult.columns;
          console.log(`   \u{1F4CB} [${requestId}] Grouped columns:`, groupedColumns.join(", "), "+ imageModals array");
        } else {
          console.log(`   \u23ED\uFE0F  [${requestId}] ========== SKIPPING GROUPING ==========`);
          console.log(`   \u23ED\uFE0F  [${requestId}] Reason: Grouping condition not met`);
          console.log(`   \u23ED\uFE0F  [${requestId}]   - effectiveServiceType: "${effectiveServiceType}"`);
          console.log(`   \u23ED\uFE0F  [${requestId}]   - serviceType === "autoparts": ${serviceTypeMatch}`);
          console.log(`   \u23ED\uFE0F  [${requestId}]   - hasAutopartsColumns: ${hasAutopartsColumns}`);
          console.log(`   \u23ED\uFE0F  [${requestId}]   - hasImageColumns: ${hasImageColumns}`);
          console.log(`   \u23ED\uFE0F  [${requestId}]   - hasAutopartId: ${hasAutopartId}`);
          console.log(`   \u23ED\uFE0F  [${requestId}] ==========================================`);
        }
        console.log(`   \u{1F4CA} [${requestId}] getData Wrapper Test Results:`);
        console.log(`   \u{1F4CA} [${requestId}] - Raw Row Count: ${sqlResult.rowCount}`);
        console.log(`   \u{1F4CA} [${requestId}] - Grouped Result Count: ${groupedResults.length}`);
        console.log(`   \u{1F4CA} [${requestId}] - Columns: ${sqlResult.columns.join(", ")}`);
        console.log(`   \u{1F4CA} [${requestId}] - Elapsed: ${sqlResult.elapsedMs}ms`);
        if (groupedResults.length > 0) {
          console.log(`   \u{1F4CA} [${requestId}] - First Result:`, JSON.stringify(groupedResults[0], bigIntReplacer, 2));
          if (groupedResults.length > 1) {
            console.log(`   \u{1F4CA} [${requestId}] - All Results (${groupedResults.length}):`, JSON.stringify(groupedResults, bigIntReplacer, 2));
          }
        } else {
          console.log(`   \u{1F4CA} [${requestId}] - No results returned`);
        }
        const wasGrouped = groupedResults.length !== sqlResult.rowCount || groupedResults.length > 0 && groupedResults[0].imageModals !== void 0;
        const displayColumns = wasGrouped && groupedResults.length > 0 ? Object.keys(groupedResults[0]).filter((k) => k !== "imageModals") : sqlResult.columns;
        console.log(`   \u{1F4E4} [${requestId}] Final Response:`);
        console.log(`   \u{1F4E4} [${requestId}]   - Was grouped: ${wasGrouped}`);
        console.log(`   \u{1F4E4} [${requestId}]   - Returning ${groupedResults.length} result(s) (was ${sqlResult.rowCount} raw rows)`);
        console.log(`   \u{1F4E4} [${requestId}]   - Display columns: ${displayColumns.length} columns`);
        res.writeHead(200, { "Content-Type": "application/json" });
        const responseData = {
          success: true,
          result: {
            getDataParams,
            sqlParameterization: sqlParamResult,
            sqlExecution: {
              ...sqlResult,
              rows: groupedResults,
              // Return grouped results instead of raw rows
              rowCount: groupedResults.length,
              // Update row count to reflect grouped results
              columns: displayColumns
              // Update columns to match grouped structure
            },
            summary: {
              userQuery,
              serviceType: getDataParams.serviceType,
              sqlParamsUsed: sqlParams,
              rawRowsReturned: sqlResult.rowCount,
              groupedResultsReturned: groupedResults.length,
              wasGrouped,
              elapsedMs: sqlResult.elapsedMs
            }
          },
          timestamp: Date.now()
        };
        console.log(`   \u{1F4E4} [${requestId}] Response JSON size: ${JSON.stringify(responseData, bigIntReplacer).length} bytes`);
        res.end(JSON.stringify(responseData, bigIntReplacer));
      } catch (err) {
        console.error(`   \u274C [${requestId}] getData Wrapper Test failed:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
      }
    });
    return;
  }
  if (pathname === "/api/root-ca/llm/parameterize-sql" && req.method === "POST") {
    console.log(`   \u{1F451} [${requestId}] POST /api/root-ca/llm/parameterize-sql - ROOT CA LLM SQL parameterization`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const sql = String(parsed.sql || "").trim();
        if (!sql) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "sql is required" }));
          return;
        }
        const result = await (0, import_llm.parameterizeSQLWithOpenAI)(sql);
        broadcastEvent({
          type: "root_ca_llm_sql_parameterization_complete",
          component: "root-ca-llm",
          message: `SQL parameterized: ${result.paramOrder.length} parameters extracted`,
          timestamp: Date.now(),
          data: { result }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, result, timestamp: Date.now() }));
      } catch (err) {
        console.error(`   \u274C [${requestId}] Error parameterizing SQL: ${err.message}`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
      }
    });
    return;
  }
  if (pathname === "/api/root-ca/llm/get-data-params" && req.method === "POST") {
    console.log(`   \u{1F451} [${requestId}] POST /api/root-ca/llm/get-data-params - ROOT CA LLM getData() parameter extraction`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const userInput = String(parsed.userInput || parsed.query || "").trim();
        const serviceType = parsed.serviceType;
        if (!userInput) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "userInput or query is required" }));
          return;
        }
        console.log(`   \u{1F451} [${requestId}] ROOT CA LLM: Translating user query to getData() params`);
        console.log(`   \u{1F4DD} [${requestId}] User input: "${userInput}"`);
        const result = await (0, import_llm.extractGetDataParamsWithOpenAI)(userInput);
        if (serviceType && result.serviceType !== serviceType) {
          console.log(`   \u{1F504} [${requestId}] Overriding serviceType from "${result.serviceType}" to "${serviceType}" (hint provided)`);
          result.serviceType = serviceType;
        }
        console.log(`   \u2705 [${requestId}] ROOT CA LLM extracted getData() params:`, {
          serviceType: result.serviceType,
          params: result.params,
          maxCount: result.maxCount,
          sortBy: result.sortBy,
          order: result.order,
          confidence: result.confidence
        });
        broadcastEvent({
          type: "root_ca_llm_getdata_extracted",
          component: "root-ca",
          message: `ROOT CA LLM extracted getData() parameters for ${result.serviceType}`,
          timestamp: Date.now(),
          data: {
            userInput,
            result,
            provider: "openai"
          }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, result, timestamp: Date.now() }));
      } catch (err) {
        console.error(`   \u274C [${requestId}] ROOT CA LLM getData() extraction failed:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
      }
    });
    return;
  }
  if (pathname.startsWith("/api/provider-plugin/webhook/") && req.method === "POST") {
    const providerId = pathname.split("/api/provider-plugin/webhook/")[1] || "";
    console.log(`   \u{1F9E9} [${requestId}] POST /api/provider-plugin/webhook/${providerId}`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        let payload = null;
        try {
          payload = body ? JSON.parse(body) : null;
        } catch {
          payload = body;
        }
        broadcastEvent({
          type: "provider_plugin_webhook_received",
          component: "provider-plugin",
          message: `Webhook received for ${providerId}`,
          timestamp: Date.now(),
          data: { providerId, payload, requestId }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, providerId, received: true, timestamp: Date.now() }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
      }
    });
    return;
  }
  if (pathname === "/api/wizard/service-types" && req.method === "GET") {
    console.log(`   \u{1F9D9} [${requestId}] GET /api/wizard/service-types - Getting service types`);
    const serviceTypes = [
      { type: "movie", icon: "\u{1F3AC}", name: "Movie Tickets", description: "Movie ticket booking service" },
      { type: "dex", icon: "\u{1F4B0}", name: "DEX Tokens", description: "Decentralized exchange token pools" },
      { type: "airline", icon: "\u2708\uFE0F", name: "Airline Tickets", description: "Airline ticket booking service" },
      { type: "autoparts", icon: "\u{1F527}", name: "Auto Parts", description: "Automotive parts marketplace" },
      { type: "hotel", icon: "\u{1F3E8}", name: "Hotel Booking", description: "Hotel reservation service" },
      { type: "restaurant", icon: "\u{1F37D}\uFE0F", name: "Restaurant Reservations", description: "Restaurant booking service" },
      { type: "snake", icon: "\u{1F40D}", name: "Snake (Advertiser)", description: "Advertising service provider" }
    ];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, serviceTypes }));
    return;
  }
  if (pathname === "/api/dex-gardens/create" && req.method === "POST") {
    console.log(`   \u{1F537} [${requestId}] POST /api/dex-gardens/create - Creating DEX garden (no \u{1F34E} APPLES ledger)`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const requestData = JSON.parse(body);
        const gardenName = requestData.gardenName || requestData.indexerName;
        const { serverIp, serverDomain, serverPort, networkType, email, tokenSymbol, baseToken, initialLiquidity, stripePaymentIntentId } = requestData;
        const serviceType = "dex";
        const finalTokenSymbol2 = tokenSymbol || "TOKEN";
        const finalBaseToken2 = baseToken || "SOL";
        console.log(`   \u{1F4B0} [DEX Garden] Token pair configuration: ${finalTokenSymbol2}/${finalBaseToken2}`);
        if (!gardenName) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "gardenName required" }));
          return;
        }
        if (!email || typeof email !== "string" || !email.includes("@")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid email address required. Please sign in first." }));
          return;
        }
        const MIN_LIQUIDITY_AMOUNT = 1e4;
        if (!initialLiquidity || initialLiquidity < MIN_LIQUIDITY_AMOUNT) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: `Initial liquidity must be at least ${MIN_LIQUIDITY_AMOUNT.toLocaleString()} \u{1F34E} APPLES to prevent spam and ensure pool stability.`
          }));
          return;
        }
        let liquidityCertified = false;
        let stripePaymentRailBound = false;
        let finalStripePaymentIntentId = stripePaymentIntentId || "";
        if (stripePaymentIntentId && typeof stripePaymentIntentId === "string") {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
            if (paymentIntent.status !== "succeeded") {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                success: false,
                error: `Stripe payment not completed. Payment status: ${paymentIntent.status}. Please complete the payment first.`
              }));
              return;
            }
            const paidAmount = paymentIntent.amount / 100;
            if (paidAmount < initialLiquidity) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                success: false,
                error: `Payment amount (${paidAmount} \u{1F34E} APPLES) is less than requested liquidity (${initialLiquidity} \u{1F34E} APPLES).`
              }));
              return;
            }
            liquidityCertified = true;
            stripePaymentRailBound = true;
            console.log(`   \u2705 [DEX Garden] Stripe Payment Rail verified: ${paidAmount} \u{1F34E} APPLES paid via ${stripePaymentIntentId}`);
          } catch (stripeErr) {
            console.warn(`   \u26A0\uFE0F [DEX Garden] Stripe payment verification failed: ${stripeErr.message}`);
            finalStripePaymentIntentId = "";
          }
        }
        if (!liquidityCertified) {
          const userBalance = await (0, import_wallet.getWalletBalance)(email);
          if (userBalance < initialLiquidity) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: false,
              error: `Insufficient balance. You have ${userBalance.toLocaleString()} \u{1F34E} APPLES but need ${initialLiquidity.toLocaleString()} \u{1F34E} APPLES for initial liquidity.`
            }));
            return;
          }
          console.log(`   \u{1F4B0} [DEX Garden] Using user balance for initial liquidity: ${initialLiquidity} \u{1F34E} APPLES (balance: ${userBalance.toLocaleString()} \u{1F34E} APPLES)`);
        }
        if (email && email !== "bill.draper.auto@gmail.com") {
          const hasCert = (0, import_priesthoodCertification.hasPriesthoodCertification)(email);
          if (!hasCert) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: false,
              error: "Priesthood certification required to create DEX gardens. Please apply for priesthood certification first."
            }));
            return;
          }
        }
        let finalPort = serverPort;
        if (!finalPort || finalPort < 3001) {
          const basePort = 3001;
          const existingIndexers = [...import_state.GARDENS, ...import_state.TOKEN_GARDENS];
          const usedPorts = existingIndexers.map((i) => i.serverPort || null).filter((p) => p !== null && p !== void 0);
          let nextPort = basePort;
          while (usedPorts.includes(nextPort))
            nextPort++;
          finalPort = nextPort;
        }
        const allExistingIndexers = [...import_state.GARDENS, ...import_state.TOKEN_GARDENS];
        const tokenGardenIds = allExistingIndexers.filter((i) => i.id && i.id.startsWith("T")).map((ti) => {
          const match = ti.id.match(/^T(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        });
        const maxTokenNumber = tokenGardenIds.length > 0 ? Math.max(...tokenGardenIds) : 0;
        const gardenId = `T${maxTokenNumber + 1}`;
        const existingTokenGarden = import_state.TOKEN_GARDENS.find((tg) => tg.id === gardenId);
        if (existingTokenGarden) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Token garden with ID "${gardenId}" already exists` }));
          return;
        }
        const gardenConfig = {
          id: gardenId,
          name: gardenName,
          stream: `eden:token-garden:${gardenId}`,
          active: true,
          uuid: `eden:garden:${crypto.randomUUID()}`,
          ownerEmail: email,
          priestEmail: email,
          serverIp: serverIp || "localhost",
          serverDomain: serverDomain || `dex-${gardenId.toLowerCase()}.eden.local`,
          serverPort: finalPort,
          networkType: networkType || "http",
          serviceType,
          tokenServiceType: "dex",
          // Stripe Payment Rail binding and liquidity certification
          stripePaymentRailBound,
          liquidityCertified,
          initialLiquidity,
          stripePaymentIntentId: finalStripePaymentIntentId,
          liquidityLoadedAt: Date.now()
        };
        console.log(`   \u{1F4DC} [DEX Gardens] Issuing certificate for ${gardenConfig.name} (${gardenConfig.id})...`);
        (0, import_garden.issueGardenCertificate)(gardenConfig);
        if (!gardenConfig.certificate) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Failed to issue certificate to DEX garden ${gardenConfig.id}` }));
          return;
        }
        import_state.TOKEN_GARDENS.push(gardenConfig);
        console.log(`   \u2705 Created DEX garden: ${gardenConfig.name} (${gardenConfig.id}). Total DEX gardens: ${import_state.TOKEN_GARDENS.length}`);
        try {
          const gardensFile = path.join(__dirname, "eden-gardens-persistence.json");
          let existingGardensFromFile = [];
          if (fs.existsSync(gardensFile)) {
            try {
              const fileContent = fs.readFileSync(gardensFile, "utf-8");
              const persisted = JSON.parse(fileContent);
              existingGardensFromFile = persisted.gardens || persisted.indexers || [];
            } catch (err) {
              console.warn(`\u26A0\uFE0F  [DEX Gardens] Failed to read existing gardens file for preservation: ${err.message}`);
            }
          }
          const inMemoryAllGardens = [...import_state.GARDENS, ...import_state.TOKEN_GARDENS];
          const inMemoryById = /* @__PURE__ */ new Map();
          for (const g of inMemoryAllGardens) {
            if (!g?.id)
              continue;
            const existing = inMemoryById.get(g.id);
            if (!existing) {
              inMemoryById.set(g.id, g);
            } else {
              const hasCert = !!g.certificate;
              const existingHasCert = !!existing.certificate;
              if (hasCert && !existingHasCert) {
                inMemoryById.set(g.id, g);
              }
            }
          }
          const inMemoryIds = new Set(Array.from(inMemoryById.keys()));
          const preservedGardens = existingGardensFromFile.filter((g) => g?.id && !inMemoryIds.has(g.id));
          const allGardensToSave = [...Array.from(inMemoryById.values()), ...preservedGardens];
          fs.writeFileSync(
            gardensFile,
            JSON.stringify({ gardens: allGardensToSave, lastSaved: (/* @__PURE__ */ new Date()).toISOString() }, null, 2),
            "utf-8"
          );
          console.log(`\u{1F4BE} [DEX Gardens] Saved ${allGardensToSave.length} total garden(s) to ${gardensFile} (includes DEX garden ${gardenConfig.id})`);
        } catch (persistErr) {
          console.warn(`\u26A0\uFE0F  [DEX Gardens] Failed to persist gardens file after DEX garden creation: ${persistErr.message}`);
        }
        try {
          const tokenGardenIndex = import_state.TOKEN_GARDENS.findIndex((tg) => tg.id === gardenConfig.id);
          const tokenSymbol2 = finalTokenSymbol2;
          const poolId = `pool-${finalBaseToken2.toLowerCase()}-${tokenSymbol2.toLowerCase()}-${tokenGardenIndex + 1}`;
          const providerId = `dex-pool-${tokenSymbol2.toLowerCase()}-${tokenGardenIndex + 1}`;
          if (!DEX_POOLS.has(poolId)) {
            const baseReserve2 = initialLiquidity || 1e4;
            const poolPrice = 1e-3;
            const tokenReserve2 = baseReserve2 / poolPrice;
            const pool = {
              poolId,
              tokenSymbol: tokenSymbol2,
              tokenName: `${tokenSymbol2} ${tokenGardenIndex + 1}`,
              baseToken: finalBaseToken2,
              poolLiquidity: baseReserve2,
              // Use actual paid liquidity
              tokenReserve: tokenReserve2,
              baseReserve: baseReserve2,
              // Use actual paid liquidity
              price: poolPrice,
              bond: 5e3,
              gardenId: gardenConfig.id,
              createdAt: Date.now(),
              totalVolume: 0,
              totalTrades: 0,
              // Stripe Payment Rail metadata
              stripePaymentRailBound,
              liquidityCertified,
              initialLiquidity,
              stripePaymentIntentId: finalStripePaymentIntentId
            };
            DEX_POOLS.set(poolId, pool);
            console.log(`   \u2705 [DEX Gardens] Created DEX pool with ${liquidityCertified ? "Stripe-certified" : "balance-funded"} liquidity: ${tokenSymbol2}/${finalBaseToken2} (${poolId})`);
            console.log(`      Initial liquidity: ${baseReserve2} ${finalBaseToken2}${finalStripePaymentIntentId ? ` (Stripe Payment Rail: ${finalStripePaymentIntentId})` : " (from user balance)"}`);
            console.log(`      Token reserve: ${tokenReserve2} ${tokenSymbol2}, Base reserve: ${baseReserve2} ${finalBaseToken2}`);
            try {
              const { registerInitialLiquidity } = await import("./src/liquidityAccountant");
              registerInitialLiquidity(
                poolId,
                tokenSymbol2,
                finalBaseToken2,
                gardenConfig.id,
                baseReserve2,
                baseReserve2,
                tokenReserve2,
                finalStripePaymentIntentId || void 0
              );
              console.log(`   \u{1F4A7} [LiquidityAccountant] Registered initial liquidity for ${tokenSymbol2}/${finalBaseToken2}`);
            } catch (err) {
              console.warn(`   \u26A0\uFE0F  [DEX Gardens] Failed to register liquidity with accountant: ${err.message}`);
            }
          }
          const existing = ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === providerId && p.gardenId === gardenConfig.id);
          let provider = null;
          if (!existing) {
            provider = {
              id: providerId,
              uuid: crypto.randomUUID(),
              name: `${tokenSymbol2} Pool (${gardenConfig.name})`,
              serviceType: "dex",
              location: "Eden DEX",
              bond: 5e3,
              reputation: 5,
              gardenId: gardenConfig.id,
              apiEndpoint: `https://dex.eden.com/pools/${poolId}`,
              status: "active"
            };
            (0, import_serviceProvider.registerServiceProviderWithROOTCA)(provider);
            try {
              (0, import_serviceProvider.issueServiceProviderCertificate)(provider);
            } catch (certErr) {
              console.warn(`\u26A0\uFE0F  [DEX Gardens] Failed to issue certificate to DEX pool provider ${providerId}: ${certErr.message}`);
            }
            console.log(`\u2705 [DEX Gardens] Registered DEX pool provider: ${provider.name} (${provider.id}) \u2192 gardenId ${provider.gardenId}`);
          } else {
            console.log(`\u2713 [DEX Gardens] DEX pool provider already exists: ${providerId} \u2192 gardenId ${gardenConfig.id}`);
          }
          try {
            const finalProvider = existing || provider;
            const providerUuid = finalProvider?.uuid || crypto.randomUUID();
            const snapshot = {
              chainId: "eden",
              txId: `dex_liquidity_${poolId}_${Date.now()}`,
              slot: Date.now(),
              blockTime: Date.now(),
              payer: email,
              merchant: `${tokenSymbol2} Pool (${gardenConfig.name})`,
              amount: initialLiquidity,
              feeSplit: {}
            };
            const liquiditySource = finalStripePaymentIntentId ? `Stripe Payment Rail (${finalStripePaymentIntentId})` : "User Wallet Balance";
            const ledgerEntry = (0, import_ledger.addLedgerEntry)(
              snapshot,
              "dex",
              0,
              // No iGas cost for liquidity provisioning
              email,
              `${tokenSymbol2} Pool (${gardenConfig.name})`,
              providerUuid,
              {
                action: "PROVISION_LIQUIDITY",
                poolId,
                gardenId: gardenConfig.id,
                tokenSymbol: tokenSymbol2,
                baseToken: finalBaseToken2,
                initialLiquidity,
                baseReserve,
                tokenReserve,
                liquiditySource,
                stripePaymentIntentId: finalStripePaymentIntentId || void 0,
                liquidityCertified,
                stripePaymentRailBound,
                provisionedAt: Date.now()
              }
            );
            ledgerEntry.status = "completed";
            console.log(`   \u{1F4DD} [DEX Gardens] Created ledger entry for initial liquidity: ${initialLiquidity} \u{1F34E} APPLES (${ledgerEntry.entryId})`);
            console.log(`      Source: ${liquiditySource}`);
            console.log(`      Pool: ${tokenSymbol2}/${finalBaseToken2} (${poolId})`);
            console.log(`      Provider UUID: ${providerUuid}`);
          } catch (ledgerErr) {
            console.warn(`   \u26A0\uFE0F  [DEX Gardens] Failed to create ledger entry for initial liquidity: ${ledgerErr.message}`);
          }
          try {
            const sr2 = (0, import_serviceRegistry2.getServiceRegistry2)();
            sr2.savePersistence();
          } catch (srErr) {
            console.warn(`\u26A0\uFE0F  [DEX Gardens] Failed to save ServiceRegistry2 persistence: ${srErr.message}`);
          }
          try {
            if (redis) {
              redis.saveServiceRegistry();
            }
          } catch (legacyErr) {
            console.warn(`\u26A0\uFE0F  [DEX Gardens] Failed to save legacy service registry persistence: ${legacyErr.message}`);
          }
        } catch (providerErr) {
          console.warn(`\u26A0\uFE0F  [DEX Gardens] Failed to register/persist DEX provider: ${providerErr.message}`);
        }
        try {
          (0, import_dex.initializeDEXPools)();
        } catch (err) {
          console.warn(`\u26A0\uFE0F  [DEX Gardens] initializeDEXPools failed: ${err.message}`);
        }
        broadcastEvent({
          type: "dex_garden_created",
          component: "dex-gardens",
          message: `DEX Garden ${gardenConfig.name} created successfully`,
          timestamp: Date.now(),
          data: {
            gardenId: gardenConfig.id,
            gardenName: gardenConfig.name,
            serviceType: "dex",
            ownerEmail: gardenConfig.ownerEmail,
            hasCertificate: !!gardenConfig.certificate
          }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, garden: gardenConfig }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/wizard/create-garden" && req.method === "POST") {
    console.log(`   \u{1F9D9} [${requestId}] POST /api/wizard/create-garden - Creating garden via wizard`);
    console.log(`   \u{1F50D} [${requestId}] Current state: ${import_state.GARDENS.length} regular gardens, ${import_state.TOKEN_GARDENS.length} token gardens`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const requestData = JSON.parse(body);
        const gardenName = requestData.gardenName || requestData.indexerName;
        const { serviceType, serverIp, serverDomain, serverPort, networkType, isSnake, email, amount, selectedProviders, videoUrl } = requestData;
        if ((serviceType || "").toLowerCase() === "dex") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: "DEX gardens are managed by DexGardensService. Use POST /api/dex-gardens/create (no \u{1F34E} APPLES deployment fee)."
          }));
          return;
        }
        if (email && email !== "bill.draper.auto@gmail.com") {
          const hasCert = (0, import_priesthoodCertification.hasPriesthoodCertification)(email);
          if (!hasCert) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: false,
              error: "Priesthood certification required to create gardens. Please apply for priesthood certification first."
            }));
            return;
          }
        }
        console.log(`   \u{1F4E5} [${requestId}] Received create-garden request:`, {
          serviceType,
          gardenName,
          selectedProviders: selectedProviders || "NOT PROVIDED",
          selectedProvidersType: typeof selectedProviders,
          selectedProvidersIsArray: Array.isArray(selectedProviders),
          currentTokenIndexersCount: import_state.TOKEN_GARDENS.length,
          currentTokenIndexerIds: import_state.TOKEN_GARDENS.map((ti) => ti.id).join(", ")
        });
        if (!serviceType || !gardenName) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "serviceType and gardenName required" }));
          return;
        }
        if (!email || typeof email !== "string" || !email.includes("@")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid email address required. Please sign in with Google first." }));
          return;
        }
        if (!amount || typeof amount !== "number" || amount <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid deployment fee amount required" }));
          return;
        }
        const balance = await (0, import_wallet.getWalletBalance)(email);
        if (balance < amount) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: `Insufficient balance. Required: ${amount} \u{1F34E} APPLES, Available: ${balance} \u{1F34E} APPLES. Please purchase more \u{1F34E} APPLES first.`,
            balance
          }));
          return;
        }
        const txId = crypto.randomUUID();
        const debitResult = await (0, import_wallet.debitWallet)(
          email,
          amount,
          txId,
          "indexer_deployment",
          {
            serviceType,
            gardenName,
            createdBy: email
          }
        );
        if (!debitResult.success) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: debitResult.error || "Failed to debit wallet",
            balance: debitResult.balance
          }));
          return;
        }
        const snapshot = {
          chainId: "eden:mainnet",
          txId,
          slot: Date.now(),
          blockTime: Date.now(),
          payer: email,
          merchant: "ROOT CA",
          amount,
          feeSplit: {}
        };
        const ledgerEntry = (0, import_ledger.addLedgerEntry)(
          snapshot,
          "garden_deployment",
          0,
          // iGasCost (no iGas for garden creation)
          email,
          // payerId
          "ROOT CA",
          // merchantName
          import_constants.ROOT_CA_UUID,
          // providerUuid
          {
            type: "garden_deployment",
            description: `Garden deployment: ${gardenName || "Unknown"}`,
            price: amount,
            serviceType,
            gardenName,
            createdBy: email
          }
        );
        let user = import_state.USERS.find((u) => u.email === email);
        if (!user) {
          user = {
            id: email,
            email,
            balance: debitResult.balance
          };
          import_state.USERS.push(user);
        } else {
          user.balance = debitResult.balance;
        }
        const cashier = (0, import_ledger.getCashierStatus)();
        cashier.processedCount++;
        cashier.totalProcessed += amount;
        ledgerEntry.status = "processed";
        broadcastEvent({
          type: "cashier_payment_processed",
          component: "cashier",
          message: `${cashier.name} processed payment: ${amount} \u{1F34E} APPLES`,
          timestamp: Date.now(),
          data: { entry: ledgerEntry, cashier, userBalance: debitResult.balance, walletService: "wallet-service-001" }
        });
        completeBooking(ledgerEntry);
        broadcastEvent({
          type: "ledger_entry_created",
          component: "ledger",
          message: `Ledger entry created for garden deployment: ${ledgerEntry.entryId}`,
          timestamp: Date.now(),
          data: { entry: ledgerEntry }
        });
        broadcastEvent({
          type: "ledger_entry_added",
          component: "ledger",
          message: `Ledger entry created: ${ledgerEntry.entryId}`,
          timestamp: Date.now(),
          data: { entry: ledgerEntry }
        });
        let finalPort = serverPort;
        if (!finalPort || finalPort < 3001) {
          const basePort = 3001;
          const existingIndexers = [...import_state.GARDENS, ...import_state.TOKEN_GARDENS];
          const usedPorts = existingIndexers.map((i) => {
            return i.serverPort || null;
          }).filter((p) => p !== null && p !== void 0);
          let nextPort = basePort;
          while (usedPorts.includes(nextPort)) {
            nextPort++;
          }
          finalPort = nextPort;
        }
        const persistenceFile = path.join(__dirname, "eden-wallet-persistence.json");
        let persistedGardens = [];
        if (fs.existsSync(persistenceFile)) {
          try {
            const fileContent = fs.readFileSync(persistenceFile, "utf-8");
            const persisted = JSON.parse(fileContent);
            persistedGardens = persisted.gardens || persisted.indexers || [];
            const persistedMap = /* @__PURE__ */ new Map();
            for (const g of persistedGardens) {
              if (!persistedMap.has(g.id)) {
                persistedMap.set(g.id, g);
              }
            }
            persistedGardens = Array.from(persistedMap.values());
          } catch (err) {
            console.warn(`   \u26A0\uFE0F  [${requestId}] Failed to read persistence file for ID generation: ${err.message}`);
          }
        }
        const allExistingIndexers = [...import_state.GARDENS, ...import_state.TOKEN_GARDENS, ...persistedGardens];
        const allIndexersMap = /* @__PURE__ */ new Map();
        for (const idx of allExistingIndexers) {
          if (!allIndexersMap.has(idx.id)) {
            allIndexersMap.set(idx.id, idx);
          }
        }
        const uniqueExistingIndexers = Array.from(allIndexersMap.values());
        let gardenId;
        if (isSnake) {
          const snakeIds = uniqueExistingIndexers.filter((i) => i.isSnake).map((i) => {
            const match = i.id.match(/^S(\d+)$/);
            return match ? parseInt(match[1], 10) : 0;
          });
          const maxSnakeNumber = snakeIds.length > 0 ? Math.max(...snakeIds) : 0;
          gardenId = `S${maxSnakeNumber + 1}`;
        } else if (serviceType === "dex") {
          const tokenGardenIds = uniqueExistingIndexers.filter((i) => i.id && i.id.startsWith("T")).map((ti) => {
            const match = ti.id.match(/^T(\d+)$/);
            return match ? parseInt(match[1], 10) : 0;
          });
          const maxTokenNumber = tokenGardenIds.length > 0 ? Math.max(...tokenGardenIds) : 0;
          gardenId = `T${maxTokenNumber + 1}`;
          console.log(`   \u{1F522} [${requestId}] Generated token garden ID: ${gardenId} (max existing: ${maxTokenNumber}, total unique token gardens found: ${tokenGardenIds.length})`);
        } else {
          const regularGardenIds = uniqueExistingIndexers.filter((i) => i.id && (i.id.startsWith("garden-") || i.id.startsWith("indexer-"))).map((i) => {
            const gardenMatch = i.id.match(/^garden-(\d+)$/);
            const indexerMatch = i.id.match(/^indexer-(\d+)$/);
            if (gardenMatch)
              return parseInt(gardenMatch[1], 10);
            if (indexerMatch)
              return parseInt(indexerMatch[1], 10);
            return 0;
          });
          const maxRegularNumber = regularGardenIds.length > 0 ? Math.max(...regularGardenIds) : 0;
          gardenId = `garden-${maxRegularNumber + 1}`;
        }
        const existingGardenById = uniqueExistingIndexers.find((i) => i.id === gardenId);
        if (existingGardenById) {
          console.error(`   \u274C [${requestId}] DUPLICATE DETECTED: Garden ID "${gardenId}" already exists!`);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: `Garden with ID "${gardenId}" already exists (Name: ${existingGardenById.name})`,
            existingGarden: existingGardenById
          }));
          return;
        }
        const gardenConfig = {
          id: gardenId,
          name: gardenName,
          stream: isSnake ? `eden:snake:${gardenId}` : serviceType === "dex" ? `eden:token-garden:${gardenId}` : `eden:garden:${gardenId}`,
          active: true,
          uuid: `eden:garden:${crypto.randomUUID()}`,
          ownerEmail: email,
          // CRITICAL: Store Priest user email for garden ownership and lifecycle management
          priestEmail: email
          // Alias for backward compatibility
        };
        gardenConfig.serverIp = serverIp || "localhost";
        gardenConfig.serverDomain = serverDomain || `garden-${gardenId.toLowerCase().replace("garden-", "").replace("indexer-", "")}.eden.local`;
        gardenConfig.serverPort = finalPort;
        gardenConfig.networkType = networkType || "http";
        gardenConfig.serviceType = serviceType;
        gardenConfig.isSnake = isSnake || false;
        if (videoUrl && (serviceType === "movie" || serviceType === "amc")) {
          gardenConfig.videoUrl = videoUrl;
          console.log(`   \u{1F3AC} [${requestId}] Video URL configured for movie garden: ${videoUrl}`);
        }
        console.log(`   \u{1F464} [${requestId}] Garden ownership assigned to Priest user: ${email}`);
        console.log(`   \u{1F4DC} [Certificate] Issuing certificate for ${gardenConfig.name} (${gardenConfig.id})...`);
        (0, import_garden.issueGardenCertificate)(gardenConfig);
        if (!gardenConfig.certificate) {
          console.error(`   \u274C [Certificate] Certificate was NOT issued to ${gardenConfig.name} (${gardenConfig.id})!`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: `Failed to issue certificate to garden ${gardenConfig.id}`
          }));
          return;
        }
        console.log(`   \u2705 [Certificate] Certificate issued successfully to ${gardenConfig.name} (${gardenConfig.id})`);
        if (serviceType === "dex") {
          const existingTokenGarden = import_state.TOKEN_GARDENS.find((ti) => ti.id === gardenConfig.id);
          if (existingTokenGarden) {
            console.error(`   \u274C [DUPLICATE PREVENTION] Token garden ${gardenConfig.id} already exists in TOKEN_GARDENS! Skipping duplicate.`);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: false,
              error: `Token garden with ID "${gardenConfig.id}" already exists`,
              existingGarden: existingTokenGarden
            }));
            return;
          }
          const tokenGardenWithCert = { ...gardenConfig, tokenServiceType: "dex", certificate: gardenConfig.certificate };
          import_state.TOKEN_GARDENS.push(tokenGardenWithCert);
          console.log(`   \u2705 Created token garden: ${gardenConfig.name} (${gardenConfig.id}). Total token gardens in memory: ${import_state.TOKEN_GARDENS.length}`);
          console.log(`   \u{1F50D} [Token Garden Debug] TOKEN_GARDENS IDs: ${import_state.TOKEN_GARDENS.map((ti) => ti.id).join(", ")}`);
          console.log(`   \u{1F50D} [Certificate Check] Token garden ${gardenConfig.id} has certificate: ${!!tokenGardenWithCert.certificate}`);
        } else {
          const existingRegularGarden = import_state.GARDENS.find((i) => i.id === gardenConfig.id);
          if (existingRegularGarden) {
            console.error(`   \u274C [DUPLICATE PREVENTION] Regular garden ${gardenConfig.id} already exists in GARDENS! Skipping duplicate.`);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: false,
              error: `Regular garden with ID "${gardenConfig.id}" already exists`,
              existingGarden: existingRegularGarden
            }));
            return;
          }
          import_state.GARDENS.push({ ...gardenConfig, certificate: gardenConfig.certificate });
          console.log(`   \u2705 Created regular garden: ${gardenConfig.name} (${gardenConfig.id}). Total regular gardens: ${import_state.GARDENS.length}`);
          console.log(`   \u{1F50D} [Certificate Check] Regular garden ${gardenConfig.id} has certificate: ${!!gardenConfig.certificate}`);
          console.log(`   \u{1F50D} [Service Type] Regular garden ${gardenConfig.id} has serviceType: ${gardenConfig.serviceType || "undefined"}`);
          if (gardenConfig.serviceType === "movie") {
            console.log(`   \u{1F3AC} [Movie Garden] Movie garden created via Angular wizard: ${gardenConfig.name} (${gardenConfig.id})`);
          }
          const gardenLogData = {
            gardenId: gardenConfig.id,
            gardenName: gardenConfig.name,
            serviceType: gardenConfig.serviceType,
            hasCertificate: !!gardenConfig.certificate,
            totalGardens: import_state.GARDENS.length
          };
          console.log(`\u{1F4DD} [Garden Lifecycle] \u2705 Garden added to memory:`, gardenLogData);
          (0, import_logger.getLogger)().log("garden-lifecycle", "garden-added-to-memory", gardenLogData);
          broadcastEvent({
            type: "garden_created",
            component: "root-ca",
            message: `Garden ${gardenConfig.name} created successfully`,
            timestamp: Date.now(),
            data: {
              gardenId: gardenConfig.id,
              gardenName: gardenConfig.name,
              serviceType: gardenConfig.serviceType,
              hasCertificate: !!gardenConfig.certificate,
              ownerEmail: gardenConfig.ownerEmail,
              // Include owner email for lifecycle management
              totalGardens: import_state.GARDENS.length
            }
          });
        }
        try {
          const pluginRoot = requestData.providerPlugins;
          const mysqlConfigs = pluginRoot?.mysql;
          const list = Array.isArray(mysqlConfigs) ? mysqlConfigs : mysqlConfigs ? [mysqlConfigs] : [];
          if (list.length > 0) {
            for (const cfg of list) {
              if (!cfg?.providerId || !cfg?.connection || !cfg?.sql || !cfg?.serviceType)
                continue;
              (0, import_providerPluginRegistry.setMySQLProviderPluginConfig)({
                providerId: String(cfg.providerId),
                serviceType: String(cfg.serviceType),
                connection: {
                  host: String(cfg.connection.host),
                  port: cfg.connection.port ? Number(cfg.connection.port) : 3306,
                  user: String(cfg.connection.user),
                  password: String(cfg.connection.password),
                  database: String(cfg.connection.database)
                },
                sql: String(cfg.sql),
                paramOrder: Array.isArray(cfg.paramOrder) ? cfg.paramOrder.map((x) => String(x)) : void 0,
                fieldMap: cfg.fieldMap && typeof cfg.fieldMap === "object" ? cfg.fieldMap : void 0,
                maxRows: cfg.maxRows ? Number(cfg.maxRows) : void 0
              });
            }
            (0, import_providerPluginRegistry.saveProviderPluginPersistence)();
            console.log(`   \u{1F9E9} [${requestId}] Saved MySQL provider plugin config(s): ${list.map((c) => c?.providerId).filter(Boolean).join(", ")}`);
            const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
            for (const cfg of list) {
              if (!cfg?.providerId)
                continue;
              const provider = serviceRegistry2.getProvider(String(cfg.providerId));
              if (provider) {
                if (provider.apiEndpoint !== "eden:plugin:mysql") {
                  provider.apiEndpoint = "eden:plugin:mysql";
                  serviceRegistry2.updateProvider(provider);
                  console.log(`   \u{1F50C} [${requestId}] Updated provider ${provider.id} (${provider.name}) to use MySQL plugin endpoint`);
                }
              } else {
                console.warn(`   \u26A0\uFE0F  [${requestId}] Provider ${cfg.providerId} not found in registry - plugin config saved but provider not updated`);
              }
            }
            try {
              serviceRegistry2.savePersistence();
              console.log(`   \u{1F4BE} [${requestId}] Service registry saved after plugin deployment`);
            } catch (saveErr) {
              console.error(`   \u274C [${requestId}] Failed to save service registry after plugin deployment:`, saveErr.message);
            }
          }
        } catch (err) {
          console.warn(`   \u26A0\uFE0F  [${requestId}] Failed to save provider plugin configs: ${err.message}`);
        }
        try {
          const providerWebhooks = requestData.providerWebhooks;
          if (providerWebhooks && typeof providerWebhooks === "object") {
            for (const [providerId, webhookUrl] of Object.entries(providerWebhooks)) {
              if (!providerId || !webhookUrl)
                continue;
              try {
                new URL(String(webhookUrl));
              } catch {
                console.warn(`   \u26A0\uFE0F  [${requestId}] Skipping invalid webhook URL for ${providerId}: ${webhookUrl}`);
                continue;
              }
              PROVIDER_WEBHOOKS.set(String(providerId), {
                providerId: String(providerId),
                webhookUrl: String(webhookUrl),
                registeredAt: Date.now(),
                failureCount: 0
              });
              console.log(`   \u2705 [${requestId}] Registered provider webhook: ${providerId} \u2192 ${webhookUrl}`);
            }
          }
        } catch (err) {
          console.warn(`   \u26A0\uFE0F  [${requestId}] Failed to register provider webhooks: ${err.message}`);
        }
        let providersCreated = 0;
        let providerResults = [];
        let providersToCreate = [];
        if (serviceType === "movie" && selectedProviders && Array.isArray(selectedProviders) && selectedProviders.length > 0) {
          console.log(`   \u{1F3AC} Converting ${selectedProviders.length} selectedProviders to provider configs for movie garden...`);
          console.log(`   \u{1F50D} [DEBUG] serviceType="${serviceType}", selectedProviders=[${selectedProviders.join(", ")}]`);
          const movieProviderMap = {
            "amc-001": {
              name: "AMC Theatres",
              uuid: "550e8400-e29b-41d4-a716-446655440001",
              location: "Baltimore, Maryland",
              bond: 1e3,
              reputation: 4.8,
              apiEndpoint: "https://api.amctheatres.com/v1/listings"
            },
            "cinemark-001": {
              name: "Cinemark",
              uuid: "550e8400-e29b-41d4-a716-446655440003",
              location: "Baltimore, Maryland",
              bond: 1200,
              reputation: 4.7,
              apiEndpoint: "https://api.cinemark.com/movies"
            },
            "moviecom-001": {
              name: "MovieCom",
              uuid: "550e8400-e29b-41d4-a716-446655440002",
              location: "Baltimore, Maryland",
              bond: 800,
              reputation: 4.5,
              apiEndpoint: "https://api.moviecom.com/showtimes"
            }
          };
          for (const providerId of selectedProviders) {
            const predefined = movieProviderMap[providerId];
            if (predefined) {
              providersToCreate.push({
                id: providerId,
                name: predefined.name,
                location: predefined.location,
                bond: predefined.bond,
                reputation: predefined.reputation,
                apiEndpoint: predefined.apiEndpoint,
                uuid: predefined.uuid
              });
            } else {
              console.warn(`   \u26A0\uFE0F  Provider ID ${providerId} not found in movie provider map. Skipping.`);
            }
          }
        } else if (selectedProviders && Array.isArray(selectedProviders) && selectedProviders.length > 0 && serviceType !== "movie") {
          console.warn(`   \u26A0\uFE0F  [CRITICAL] selectedProviders provided for non-movie service type "${serviceType}": [${selectedProviders.join(", ")}]`);
          console.warn(`   \u26A0\uFE0F  [CRITICAL] Ignoring selectedProviders - they are only valid for movie service type`);
          console.warn(`   \u26A0\uFE0F  [CRITICAL] Use 'providers' array instead for ${serviceType} service type`);
        }
        if (requestData.providers && Array.isArray(requestData.providers)) {
          if (requestData.providers.length > 0) {
            console.log(`   \u{1F4CB} Using new providers array format: ${requestData.providers.length} provider(s)`);
            providersToCreate = requestData.providers;
          } else {
            console.log(`   \u{1F4CB} Empty providers array provided for ${serviceType} garden`);
          }
        }
        if (providersToCreate.length > 0) {
          console.log(`   \u{1F527} Creating ${providersToCreate.length} service provider(s) for ${serviceType} garden ${gardenConfig.id}...`);
          console.log(`   \u{1F50D} [DEBUG] providersToCreate:`, providersToCreate.map((p) => ({ id: p.id, name: p.name })));
          const movieProviderIds = ["amc-001", "cinemark-001", "moviecom-001"];
          const mismatchedProviders = providersToCreate.filter((p) => {
            return p.id && movieProviderIds.includes(p.id) && serviceType !== "movie";
          });
          if (mismatchedProviders.length > 0) {
            console.error(`   \u274C [CRITICAL] Provider type mismatch detected!`);
            console.error(`   \u274C [CRITICAL] Service type: "${serviceType}", but movie providers found:`, mismatchedProviders.map((p) => p.id).join(", "));
            console.error(`   \u274C [CRITICAL] Removing mismatched providers to prevent incorrect provider creation`);
            providersToCreate = providersToCreate.filter((p) => {
              return !(p.id && movieProviderIds.includes(p.id) && serviceType !== "movie");
            });
            console.log(`   \u2705 [CRITICAL] Filtered providers list (${providersToCreate.length} remaining):`, providersToCreate.map((p) => ({ id: p.id, name: p.name })));
            if (providersToCreate.length === 0) {
              console.warn(`   \u26A0\uFE0F  [CRITICAL] All providers were filtered out due to type mismatch. Skipping provider creation.`);
              console.warn(`   \u26A0\uFE0F  [CRITICAL] Default provider will be created instead (if applicable).`);
            }
          }
          const predefinedProviderMap = serviceType === "movie" ? {
            "amc-001": {
              name: "AMC Theatres",
              uuid: "550e8400-e29b-41d4-a716-446655440001",
              location: "Baltimore, Maryland",
              bond: 1e3,
              reputation: 4.8,
              apiEndpoint: "https://api.amctheatres.com/v1/listings"
            },
            "cinemark-001": {
              name: "Cinemark",
              uuid: "550e8400-e29b-41d4-a716-446655440003",
              location: "Baltimore, Maryland",
              bond: 1200,
              reputation: 4.7,
              apiEndpoint: "https://api.cinemark.com/movies"
            },
            "moviecom-001": {
              name: "MovieCom",
              uuid: "550e8400-e29b-41d4-a716-446655440002",
              location: "Baltimore, Maryland",
              bond: 800,
              reputation: 4.5,
              apiEndpoint: "https://api.moviecom.com/showtimes"
            }
          } : void 0;
          try {
            providerResults = (0, import_serviceProvider.createServiceProvidersForGarden)(
              serviceType,
              gardenConfig.id,
              providersToCreate,
              predefinedProviderMap
            );
            providersCreated = providerResults.filter((r) => r.created || r.assigned).length;
            console.log(`   \u2705 Successfully processed ${providersCreated} provider(s): ${providerResults.map((r) => r.providerName).join(", ")}`);
            try {
              const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
              serviceRegistry2.savePersistence();
              console.log(`   \u{1F4BE} Service registry saved to persistence after provider creation`);
            } catch (saveErr) {
              console.error(`   \u274C Failed to save service registry after provider creation:`, saveErr.message);
            }
          } catch (providerErr) {
            console.error(`   \u274C Failed to create providers:`, providerErr.message);
            console.warn(`   \u26A0\uFE0F  Continuing with garden creation despite provider creation failure`);
          }
        } else {
          console.log(`   \u2139\uFE0F  No providers specified for ${serviceType} garden. Skipping provider creation.`);
          if (serviceType !== "movie" && serviceType !== "dex" && serviceType !== "snake") {
            const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
            const existingProvidersForGarden = serviceRegistry2.getAllProviders().filter(
              (p) => p.gardenId === gardenConfig.id && p.serviceType === serviceType
            );
            if (existingProvidersForGarden.length > 0) {
              console.log(`   \u26A0\uFE0F  Garden ${gardenConfig.id} already has ${existingProvidersForGarden.length} provider(s) for ${serviceType}, skipping default provider creation`);
            } else {
              console.log(`   \u{1F527} Creating default provider for ${serviceType} garden ${gardenConfig.id}...`);
              try {
                const defaultProviderConfig = {
                  name: `${gardenConfig.name} Provider`,
                  location: "Unknown",
                  bond: 1e3,
                  reputation: 5,
                  apiEndpoint: `https://api.${serviceType}.com/v1`
                };
                providerResults = (0, import_serviceProvider.createServiceProvidersForGarden)(
                  serviceType,
                  gardenConfig.id,
                  [defaultProviderConfig],
                  void 0
                );
                providersCreated = providerResults.filter((r) => r.created || r.assigned).length;
                console.log(`   \u2705 Created default provider for ${serviceType} garden: ${providerResults.map((r) => r.providerName).join(", ")}`);
                try {
                  serviceRegistry2.savePersistence();
                  console.log(`   \u{1F4BE} Service registry saved to persistence after default provider creation`);
                } catch (saveErr) {
                  console.error(`   \u274C Failed to save service registry after default provider creation:`, saveErr.message);
                }
              } catch (defaultProviderErr) {
                console.warn(`   \u26A0\uFE0F  Failed to create default provider for ${serviceType} garden:`, defaultProviderErr.message);
              }
            }
          }
        }
        if (serviceType === "dex") {
          console.log(`   \u{1F4B0} Creating DEX pool service providers for token garden ${gardenConfig.id}...`);
          const tokenGardenIndex = import_state.TOKEN_GARDENS.findIndex((ti) => ti.id === gardenConfig.id);
          if (tokenGardenIndex === -1) {
            console.warn(`   \u26A0\uFE0F  Token garden ${gardenConfig.id} not found in TOKEN_GARDENS array`);
            console.warn(`   \u26A0\uFE0F  Current TOKEN_GARDENS IDs: ${import_state.TOKEN_GARDENS.map((ti) => ti.id).join(", ")}`);
            console.warn(`   \u26A0\uFE0F  Skipping DEX pool and provider creation for ${gardenConfig.id}`);
          } else {
            const tokenSymbol = finalTokenSymbol;
            const tokenName = `${tokenSymbol} ${tokenGardenIndex + 1}`;
            const poolId = `pool-${finalBaseToken.toLowerCase()}-${tokenSymbol.toLowerCase()}-${tokenGardenIndex + 1}`;
            if (DEX_POOLS.has(poolId)) {
              console.log(`   \u26A0\uFE0F  Pool ${poolId} already exists, skipping pool creation...`);
            } else {
              const pool = {
                poolId,
                tokenSymbol,
                tokenName,
                baseToken: finalBaseToken,
                poolLiquidity: 100 - tokenGardenIndex * 10,
                // Decreasing liquidity for variety: 100, 90, 80...
                tokenReserve: 1e5 - tokenGardenIndex * 1e4,
                // 100k, 90k, 80k...
                baseReserve: 100 - tokenGardenIndex * 10,
                // 100, 90, 80...
                price: 1e-3,
                // 1 Token = 0.001 SOL
                bond: 5e3,
                gardenId: gardenConfig.id,
                // Assign to this token garden
                createdAt: Date.now(),
                totalVolume: 0,
                totalTrades: 0
              };
              DEX_POOLS.set(poolId, pool);
              console.log(`   \u2705 Created DEX pool: ${tokenSymbol} (${poolId}) \u2192 ${gardenConfig.id}`);
            }
            const providerId = `dex-pool-${tokenSymbol.toLowerCase()}`;
            const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
            const existingProvider = serviceRegistry2.getProvider(providerId);
            if (existingProvider && existingProvider.gardenId === gardenConfig.id) {
              console.log(`   \u26A0\uFE0F  Provider ${providerId} already exists for garden ${gardenConfig.id}, skipping...`);
            } else {
              const provider = {
                id: providerId,
                uuid: crypto.randomUUID(),
                name: `${tokenSymbol} Pool (${gardenConfig.name})`,
                serviceType: "dex",
                location: "Eden DEX",
                bond: 5e3,
                reputation: 5,
                gardenId: gardenConfig.id,
                // Assign to this garden
                apiEndpoint: `https://dex.eden.com/pools/${poolId}`,
                status: "active"
              };
              try {
                serviceRegistry2.addProvider(provider);
                ROOT_CA_SERVICE_REGISTRY.push(provider);
              } catch (err) {
                console.error(`   \u274C Failed to add DEX provider to ServiceRegistry2: ${err.message}`);
                throw err;
              }
              try {
                (0, import_serviceProvider.issueServiceProviderCertificate)(provider);
                console.log(`   \u{1F4DC} Certificate issued to ${provider.name}`);
              } catch (err) {
                console.warn(`   \u26A0\uFE0F  Failed to issue certificate to ${provider.name}:`, err.message);
              }
              providersCreated++;
              console.log(`   \u2705 Registered DEX pool provider: ${provider.name} (${provider.id}) \u2192 ${gardenConfig.name}`);
              broadcastEvent({
                type: "service_provider_created",
                component: "root-ca",
                message: `DEX pool service provider ${provider.name} created and assigned to ${gardenConfig.name}`,
                timestamp: Date.now(),
                data: {
                  providerId: provider.id,
                  providerName: provider.name,
                  gardenId: gardenConfig.id,
                  gardenName: gardenConfig.name,
                  poolId
                }
              });
            }
            console.log(`   \u2705 Created DEX pool and service provider for token garden ${gardenConfig.id}`);
          }
        }
        const tokenIndexersInRegularArray = import_state.GARDENS.filter(
          (idx) => idx.tokenServiceType === "dex" || idx.serviceType === "dex" && idx.id && idx.id.startsWith("T")
        );
        if (tokenIndexersInRegularArray.length > 0) {
          console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found ${tokenIndexersInRegularArray.length} token indexer(s) in GARDENS array! Moving them to TOKEN_GARDENS...`);
          for (const tokenIdx of tokenIndexersInRegularArray) {
            const index = import_state.GARDENS.indexOf(tokenIdx);
            if (index > -1) {
              import_state.GARDENS.splice(index, 1);
            }
            if (!import_state.TOKEN_GARDENS.some((ti) => ti.id === tokenIdx.id)) {
              import_state.TOKEN_GARDENS.push(tokenIdx);
            }
          }
        }
        const deduplicatedRegularIndexers = /* @__PURE__ */ new Map();
        for (const idx of import_state.GARDENS) {
          const existing = deduplicatedRegularIndexers.get(idx.id);
          if (!existing) {
            deduplicatedRegularIndexers.set(idx.id, idx);
          } else {
            const hasCert = !!idx.certificate;
            const existingHasCert = !!existing.certificate;
            if (hasCert && !existingHasCert) {
              deduplicatedRegularIndexers.set(idx.id, idx);
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found duplicate regular indexer ${idx.id} in GARDENS - keeping version with certificate`);
            } else {
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found duplicate regular indexer ${idx.id} in GARDENS - keeping existing version`);
            }
          }
        }
        const cleanRegularIndexers = Array.from(deduplicatedRegularIndexers.values());
        console.log(`\u{1F4CB} [Indexer Persistence] After deduplication, GARDENS has ${cleanRegularIndexers.length} garden(s): ${cleanRegularIndexers.map((g) => `${g.id}(${g.serviceType || "no-type"})`).join(", ")}`);
        let regularIndexersToSave = [];
        let tokenIndexersToSave = [];
        if (import_config.NUM_GARDENS > 0) {
          const defaultIds = Array.from({ length: import_config.NUM_GARDENS }, (_, i) => String.fromCharCode(65 + i));
          regularIndexersToSave = cleanRegularIndexers.filter((idx) => {
            if (idx.tokenServiceType === "dex" || idx.serviceType === "dex" && idx.id && idx.id.startsWith("T")) {
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Token indexer ${idx.id} found in GARDENS during save - excluding from regular indexers`);
              return false;
            }
            const isDefault = defaultIds.includes(idx.id);
            if (isDefault) {
              console.log(`\u{1F4CB} [Indexer Persistence] Excluding default garden ${idx.id} from save`);
            }
            return !isDefault;
          });
          console.log(`\u{1F4CB} [Indexer Persistence] After filtering defaults, ${regularIndexersToSave.length} regular garden(s) to save: ${regularIndexersToSave.map((g) => `${g.id}(${g.serviceType || "no-type"})`).join(", ")}`);
        } else {
          regularIndexersToSave = cleanRegularIndexers.filter((idx) => {
            if (idx.tokenServiceType === "dex" || idx.serviceType === "dex" && idx.id && idx.id.startsWith("T")) {
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Token indexer ${idx.id} found in GARDENS during save - excluding from regular indexers`);
              return false;
            }
            const matchesFormat = idx.id.startsWith("garden-") || idx.id.startsWith("indexer-");
            if (!matchesFormat) {
              console.log(`\u{1F4CB} [Indexer Persistence] Excluding garden ${idx.id} - doesn't match garden-N or indexer-N format`);
            }
            return matchesFormat;
          });
          console.log(`\u{1F4CB} [Indexer Persistence] After filtering format, ${regularIndexersToSave.length} regular garden(s) to save: ${regularIndexersToSave.map((g) => `${g.id}(${g.serviceType || "no-type"})`).join(", ")}`);
        }
        const deduplicatedTokenIndexers = /* @__PURE__ */ new Map();
        for (const ti of import_state.TOKEN_GARDENS) {
          const existing = deduplicatedTokenIndexers.get(ti.id);
          if (!existing) {
            deduplicatedTokenIndexers.set(ti.id, ti);
          } else {
            const hasCert = !!ti.certificate;
            const existingHasCert = !!existing.certificate;
            if (hasCert && !existingHasCert) {
              deduplicatedTokenIndexers.set(ti.id, ti);
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found duplicate token indexer ${ti.id} in TOKEN_GARDENS - keeping version with certificate`);
            } else if (!hasCert && existingHasCert) {
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found duplicate token indexer ${ti.id} in TOKEN_GARDENS - keeping existing version with certificate`);
            } else {
              deduplicatedTokenIndexers.set(ti.id, ti);
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found duplicate token indexer ${ti.id} in TOKEN_GARDENS - keeping current version`);
            }
          }
        }
        const cleanTokenIndexers = Array.from(deduplicatedTokenIndexers.values());
        import_state.TOKEN_GARDENS.length = 0;
        import_state.TOKEN_GARDENS.push(...cleanTokenIndexers);
        if (cleanTokenIndexers.length !== import_state.TOKEN_GARDENS.length) {
          console.error(`\u274C [Indexer Persistence] CRITICAL: TOKEN_GARDENS length mismatch after deduplication!`);
        }
        console.log(`\u{1F50D} [Indexer Persistence] TOKEN_GARDENS array has ${cleanTokenIndexers.length} indexer(s) after deduplication: ${cleanTokenIndexers.map((ti) => ti.id).join(", ")}`);
        console.log(`\u{1F50D} [Indexer Persistence] NUM_TOKEN_GARDENS = ${import_config.NUM_TOKEN_GARDENS}, DEPLOYED_AS_ROOT = ${import_config.DEPLOYED_AS_ROOT}`);
        if (import_config.NUM_TOKEN_GARDENS > 0) {
          const defaultTokenIds = Array.from({ length: import_config.NUM_TOKEN_GARDENS }, (_, i) => `T${i + 1}`);
          console.log(`\u{1F50D} [Indexer Persistence] Filtering out default token IDs: ${defaultTokenIds.join(", ")}`);
          tokenIndexersToSave = cleanTokenIndexers.filter((idx) => !defaultTokenIds.includes(idx.id));
        } else {
          tokenIndexersToSave = cleanTokenIndexers;
          console.log(`\u{1F50D} [Indexer Persistence] ROOT mode: saving all ${cleanTokenIndexers.length} token indexer(s) after deduplication`);
        }
        console.log(`\u{1F4CB} [Indexer Persistence] Preparing to save: ${regularIndexersToSave.length} regular indexer(s), ${tokenIndexersToSave.length} token indexer(s)`);
        if (tokenIndexersToSave.length > 0) {
          console.log(`\u{1F4CB} [Indexer Persistence] Token indexers to save: ${tokenIndexersToSave.map((ti) => `${ti.name} (${ti.id})`).join(", ")}`);
        }
        const uniqueRegularIndexers = /* @__PURE__ */ new Map();
        for (const idx of regularIndexersToSave) {
          const existing = uniqueRegularIndexers.get(idx.id);
          if (!existing) {
            uniqueRegularIndexers.set(idx.id, idx);
          } else {
            const hasCert = !!idx.certificate;
            const existingHasCert = !!existing.certificate;
            if (hasCert && !existingHasCert) {
              uniqueRegularIndexers.set(idx.id, idx);
            } else if (!hasCert && existingHasCert) {
            } else {
              uniqueRegularIndexers.set(idx.id, idx);
            }
          }
        }
        regularIndexersToSave = Array.from(uniqueRegularIndexers.values());
        const uniqueTokenIndexers = /* @__PURE__ */ new Map();
        for (const idx of tokenIndexersToSave) {
          const existing = uniqueTokenIndexers.get(idx.id);
          if (!existing) {
            uniqueTokenIndexers.set(idx.id, idx);
          } else {
            const hasCert = !!idx.certificate;
            const existingHasCert = !!existing.certificate;
            if (hasCert && !existingHasCert) {
              uniqueTokenIndexers.set(idx.id, idx);
            } else if (!hasCert && existingHasCert) {
            } else {
              uniqueTokenIndexers.set(idx.id, idx);
            }
          }
        }
        tokenIndexersToSave = Array.from(uniqueTokenIndexers.values());
        try {
          const persistenceFile2 = path.join(__dirname, "eden-wallet-persistence.json");
          let existing = {
            walletBalances: {},
            ledgerEntries: [],
            gardens: [],
            serviceRegistry: [],
            lastSaved: (/* @__PURE__ */ new Date()).toISOString()
          };
          if (fs.existsSync(persistenceFile2)) {
            try {
              const fileContent = fs.readFileSync(persistenceFile2, "utf-8");
              existing = JSON.parse(fileContent);
              if (!existing.gardens || !Array.isArray(existing.gardens)) {
                existing.gardens = [];
              }
              if (existing.indexers && Array.isArray(existing.indexers)) {
                console.log(`\u{1F4CB} [Indexer Persistence] Found 'indexers' field - migrating to 'gardens' array`);
                const existingGardenIds2 = new Set(existing.gardens.map((idx) => idx.id));
                for (const idx of existing.indexers) {
                  if (!existingGardenIds2.has(idx.id)) {
                    existing.gardens.push(idx);
                  }
                }
                delete existing.indexers;
              }
              if (existing.tokenIndexers && Array.isArray(existing.tokenIndexers)) {
                console.log(`\u{1F4CB} [Indexer Persistence] Found 'tokenIndexers' field - migrating to 'gardens' array`);
                const existingGardenIds2 = new Set(existing.gardens.map((idx) => idx.id));
                for (const tokenIdx of existing.tokenIndexers) {
                  if (!existingGardenIds2.has(tokenIdx.id)) {
                    existing.gardens.push(tokenIdx);
                  }
                }
                delete existing.tokenIndexers;
              }
            } catch (err) {
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Failed to load existing file: ${err.message}`);
            }
          }
          const allIndexersToSave = [];
          for (const regIdx of regularIndexersToSave) {
            if (!regIdx.certificate) {
              console.error(`\u274C [Indexer Persistence] Regular indexer ${regIdx.id} is missing certificate! Re-issuing...`);
              try {
                (0, import_garden.issueGardenCertificate)(regIdx);
                console.log(`\u2705 [Indexer Persistence] Certificate re-issued for ${regIdx.id}`);
              } catch (err) {
                console.error(`\u274C [Indexer Persistence] Failed to re-issue certificate for ${regIdx.id}:`, err.message);
              }
            }
            allIndexersToSave.push(regIdx);
          }
          for (const tokenIdx of tokenIndexersToSave) {
            if (!tokenIdx.certificate) {
              console.error(`\u274C [Indexer Persistence] Token indexer ${tokenIdx.id} is missing certificate! Re-issuing...`);
              try {
                (0, import_garden.issueGardenCertificate)(tokenIdx);
                console.log(`\u2705 [Indexer Persistence] Certificate re-issued for ${tokenIdx.id}`);
              } catch (err) {
                console.error(`\u274C [Indexer Persistence] Failed to re-issue certificate for ${tokenIdx.id}:`, err.message);
              }
            }
            allIndexersToSave.push(tokenIdx);
          }
          const finalDeduplicatedMap = /* @__PURE__ */ new Map();
          for (const idx of allIndexersToSave) {
            const existing2 = finalDeduplicatedMap.get(idx.id);
            if (!existing2) {
              finalDeduplicatedMap.set(idx.id, idx);
            } else {
              const hasCert = !!idx.certificate;
              const existingHasCert = !!existing2.certificate;
              if (hasCert && !existingHasCert) {
                finalDeduplicatedMap.set(idx.id, idx);
                console.warn(`\u26A0\uFE0F  [Indexer Persistence] Final safety check: Found duplicate ${idx.id} - keeping version with certificate`);
              } else {
                console.warn(`\u26A0\uFE0F  [Indexer Persistence] Final safety check: Found duplicate ${idx.id} - keeping existing version`);
              }
            }
          }
          const finalIndexersToSave = Array.from(finalDeduplicatedMap.values());
          const duplicatesRemoved = allIndexersToSave.length - finalIndexersToSave.length;
          if (duplicatesRemoved > 0) {
            console.warn(`\u26A0\uFE0F  [Indexer Persistence] Removed ${duplicatesRemoved} duplicate indexer(s) in final safety check`);
          }
          console.log(`\u{1F4CB} [Indexer Persistence] Saving ${regularIndexersToSave.length} regular indexer(s) and ${tokenIndexersToSave.length} token indexer(s) to 'gardens' array`);
          console.log(`\u{1F4CB} [Indexer Persistence] Final deduplicated count: ${finalIndexersToSave.length} indexer(s)`);
          console.log(`\u{1F4CB} [Indexer Persistence] Final indexer IDs: ${finalIndexersToSave.map((i) => i.id).join(", ")}`);
          console.log(`\u{1F50D} [Indexer Persistence] Final check before save:`);
          console.log(`   - Regular indexers: ${regularIndexersToSave.length}`);
          console.log(`   - Token indexers: ${tokenIndexersToSave.length}`);
          console.log(`   - Total indexers to save: ${finalIndexersToSave.length}`);
          const indexersWithoutCert = finalIndexersToSave.filter((idx) => !idx.certificate);
          if (indexersWithoutCert.length > 0) {
            console.error(`\u274C [Indexer Persistence] ${indexersWithoutCert.length} indexer(s) missing certificates: ${indexersWithoutCert.map((i) => i.id).join(", ")}`);
            console.error(`\u274C [Indexer Persistence] Re-issuing certificates before save...`);
            for (const idx of indexersWithoutCert) {
              try {
                (0, import_garden.issueGardenCertificate)(idx);
                console.log(`\u2705 [Indexer Persistence] Certificate issued to ${idx.id}`);
              } catch (err) {
                console.error(`\u274C [Indexer Persistence] Failed to issue certificate to ${idx.id}:`, err.message);
              }
            }
            for (const idx of finalIndexersToSave) {
              const withoutCert = indexersWithoutCert.find((w) => w.id === idx.id);
              if (withoutCert && withoutCert.certificate) {
                idx.certificate = withoutCert.certificate;
              }
            }
          }
          const gardensFile = path.join(__dirname, "eden-gardens-persistence.json");
          let existingGardensFromFile = [];
          if (fs.existsSync(gardensFile)) {
            try {
              const fileContent = fs.readFileSync(gardensFile, "utf-8");
              const persisted = JSON.parse(fileContent);
              existingGardensFromFile = persisted.gardens || [];
              console.log(`\u{1F4CB} [Indexer Persistence] Loaded ${existingGardensFromFile.length} existing garden(s) from file to preserve`);
              console.log(`\u{1F4CB} [Indexer Persistence] Gardens in file: ${existingGardensFromFile.map((g) => `${g.id}(${g.serviceType || "no-type"})`).join(", ")}`);
            } catch (err) {
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Failed to load existing gardens from file: ${err.message}`);
            }
          }
          console.log(`\u{1F4CB} [Indexer Persistence] Gardens in memory (finalIndexersToSave): ${finalIndexersToSave.map((g) => `${g.id}(${g.serviceType || "no-type"})`).join(", ")}`);
          const existingGardenIds = new Set(finalIndexersToSave.map((g) => g.id));
          const preservedGardens = existingGardensFromFile.filter((g) => {
            const shouldPreserve = !existingGardenIds.has(g.id);
            if (!shouldPreserve) {
              console.log(`\u{1F4CB} [Indexer Persistence] Garden ${g.id}(${g.serviceType || "no-type"}) is in memory, using in-memory version`);
            }
            return shouldPreserve;
          });
          if (preservedGardens.length > 0) {
            console.log(`\u{1F4CB} [Indexer Persistence] \u2705 Preserving ${preservedGardens.length} garden(s) from file that aren't in memory: ${preservedGardens.map((g) => `${g.id}(${g.serviceType || "no-type"})`).join(", ")}`);
          } else if (existingGardensFromFile.length > 0) {
            console.log(`\u{1F4CB} [Indexer Persistence] \u2139\uFE0F  All ${existingGardensFromFile.length} garden(s) from file are already in memory, no preservation needed`);
          }
          const allGardensToSave = [...finalIndexersToSave, ...preservedGardens];
          console.log(`\u{1F4CB} [Indexer Persistence] \u{1F4BE} Saving ${allGardensToSave.length} total garden(s): ${allGardensToSave.map((g) => `${g.id}(${g.serviceType || "no-type"})`).join(", ")}`);
          const gardensData = {
            gardens: allGardensToSave,
            lastSaved: (/* @__PURE__ */ new Date()).toISOString()
          };
          fs.writeFileSync(gardensFile, JSON.stringify(gardensData, null, 2), "utf-8");
          console.log(`\u{1F4BE} [Indexer Persistence] \u2705 IMMEDIATELY saved ${allGardensToSave.length} total garden(s) (${finalIndexersToSave.length} from memory + ${preservedGardens.length} preserved from file) to ${gardensFile}`);
          if (regularIndexersToSave.length > 0) {
            console.log(`\u{1F4BE} [Indexer Persistence] Saved regular gardens: ${regularIndexersToSave.map((i) => `${i.name} (${i.id})`).join(", ")}`);
          }
          if (tokenIndexersToSave.length > 0) {
            console.log(`\u{1F4BE} [Indexer Persistence] Saved token gardens: ${tokenIndexersToSave.map((i) => `${i.name} (${i.id})${i.certificate ? " \u2713cert" : " \u274Cno cert"}`).join(", ")}`);
          }
          import_state.GARDENS.length = 0;
          const savedRegularGardens = allGardensToSave.filter((g) => {
            const isToken = g.tokenServiceType === "dex" || g.serviceType === "dex" && g.id && g.id.startsWith("T");
            return !isToken;
          });
          import_state.GARDENS.push(...savedRegularGardens);
          console.log(`\u{1F4CB} [Indexer Persistence] Updated in-memory GARDENS array to ${import_state.GARDENS.length} garden(s) to match saved file: ${import_state.GARDENS.map((g) => `${g.id}(${g.serviceType || "no-type"})`).join(", ")}`);
          const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
          const allProviders = serviceRegistry2.getAllProviders();
          console.log(`\u{1F4CB} [ServiceRegistry2] Saving ALL ${allProviders.length} providers (NO FILTERING)`);
          console.log(`\u{1F4CB} [ServiceRegistry2] All providers:`, allProviders.map((p) => ({
            id: p.id,
            name: p.name,
            serviceType: p.serviceType,
            gardenId: p.gardenId || "MISSING"
          })));
          console.log(`\u{1F4CB} [ServiceRegistry2] Movie providers:`, allProviders.filter((p) => p.serviceType === "movie").map((p) => ({
            id: p.id,
            name: p.name,
            gardenId: p.gardenId || "MISSING"
          })));
          const saveLogData = {
            totalInMemory: allProviders.length,
            totalSaved: allProviders.length,
            movieProviders: allProviders.filter((p) => p.serviceType === "movie").length,
            dexProviders: allProviders.filter((p) => p.serviceType === "dex").length,
            movieProviderIds: allProviders.filter((p) => p.serviceType === "movie").map((p) => `${p.id}(${p.gardenId})`),
            allProviderIds: allProviders.map((p) => `${p.id}(${p.gardenId})`)
          };
          console.log(`\u{1F4DD} [Garden Lifecycle] \u{1F4BE} ServiceRegistry2 save:`, JSON.stringify(saveLogData, null, 2));
          (0, import_logger.getLogger)().log("garden-lifecycle", "service-registry-save", saveLogData);
          serviceRegistry2.savePersistence();
          console.log(`\u{1F4BE} [Indexer Persistence] \u2705 IMMEDIATELY saved ${allProviders.length} service provider(s) via ServiceRegistry2`);
          if (gardenConfig.serviceType && gardenConfig.serviceType !== "movie" && gardenConfig.serviceType !== "dex" && gardenConfig.serviceType !== "snake") {
            const finalProvidersForGarden = serviceRegistry2.queryProviders(gardenConfig.serviceType, {});
            const finalHasProviderForThisGarden = finalProvidersForGarden.some((p) => p.gardenId === gardenConfig.id);
            if (!finalHasProviderForThisGarden) {
              console.log(`   \u{1F527} [Final Check] Garden ${gardenConfig.id} still has no providers, creating default provider...`);
              try {
                const defaultProviderConfig = {
                  name: `${gardenConfig.name} Provider`,
                  location: "Unknown",
                  bond: 1e3,
                  reputation: 5,
                  apiEndpoint: `https://api.${gardenConfig.serviceType}.com/v1`
                };
                const finalProviderResults = (0, import_serviceProvider.createServiceProvidersForGarden)(
                  gardenConfig.serviceType,
                  gardenConfig.id,
                  [defaultProviderConfig],
                  void 0
                );
                const finalProvidersCreated = finalProviderResults.filter((r) => r.created || r.assigned).length;
                console.log(`   \u2705 [Final Check] Created default provider for ${gardenConfig.serviceType} garden: ${finalProviderResults.map((r) => r.providerName).join(", ")}`);
                serviceRegistry2.savePersistence();
                console.log(`   \u{1F4BE} [Final Check] Service registry saved to persistence`);
              } catch (finalErr) {
                console.warn(`   \u26A0\uFE0F  [Final Check] Failed to create default provider:`, finalErr.message);
              }
            }
          }
        } catch (err) {
          console.error(`\u274C [Indexer Persistence] Failed to save immediately: ${err.message}`);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          garden: {
            id: gardenConfig.id,
            name: gardenConfig.name,
            uuid: gardenConfig.uuid,
            port: gardenConfig.serverPort,
            hasCertificate: !!gardenConfig.certificate,
            ownerEmail: gardenConfig.ownerEmail
            // Include owner email for lifecycle management
          },
          balance: debitResult.balance,
          // Return updated balance
          createdBy: email,
          // Return the Google user email (same as ownerEmail)
          ownerEmail: gardenConfig.ownerEmail,
          // Explicit owner email field
          providersCreated
          // Return number of providers created
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/priesthood/apply" && req.method === "POST") {
    console.log(`   \u{1F4DC} [${requestId}] POST /api/priesthood/apply - Applying for priesthood`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, reason } = JSON.parse(body);
        if (!email) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "email required" }));
          return;
        }
        const APPLICATION_FEE = 1;
        const userBalance = (0, import_wallet.getWalletBalance)(email);
        if (userBalance < APPLICATION_FEE) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: `Insufficient balance. Application fee is ${APPLICATION_FEE} \u{1F34E} APPLES. Your balance: ${userBalance} \u{1F34E} APPLES`
          }));
          return;
        }
        const feeTxId = `priesthood_app_fee_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
        const snapshot = {
          chainId: "eden:mainnet",
          txId: feeTxId,
          slot: Date.now(),
          blockTime: Date.now(),
          payer: email,
          merchant: "Eden Treasury",
          amount: APPLICATION_FEE,
          feeSplit: {}
        };
        const ledgerEntry = (0, import_ledger.addLedgerEntry)(
          snapshot,
          "priesthood",
          0,
          // iGasCost
          email,
          // payerId
          "Eden Treasury",
          // merchantName
          "eden:root:ca:priesthood",
          // providerUuid
          {
            type: "application_fee",
            description: "Priesthood Application Fee (Non-refundable)",
            price: APPLICATION_FEE
          }
        );
        const user = import_state.USERS.find((u) => u.email === email) || {
          id: email,
          email,
          balance: (0, import_wallet.getWalletBalance)(email)
        };
        const cashier = (0, import_ledger.getCashierStatus)();
        const paymentSuccess = await processPayment(cashier, ledgerEntry, user);
        if (!paymentSuccess) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: `Payment processing failed. Please check your balance.`
          }));
          return;
        }
        completeBooking(ledgerEntry);
        await pushLedgerEntryToSettlementStream(ledgerEntry);
        const certification = (0, import_priesthoodCertification.applyForPriesthood)(email, reason);
        const { updateCertificationBilling, getCertificationStatus: getCertificationStatus2 } = await import("./src/priesthoodCertification");
        updateCertificationBilling(email, {
          applicationFeePaid: true,
          applicationFeeTxId: feeTxId
        });
        const updatedCertification = getCertificationStatus2(email);
        broadcastEvent({
          type: "priesthood_application_submitted",
          component: "priesthood-certification",
          message: `New priesthood application from ${email} (Application fee: ${APPLICATION_FEE} \u{1F34E} APPLES paid)`,
          timestamp: Date.now(),
          data: {
            email,
            status: updatedCertification?.status || certification.status,
            appliedAt: updatedCertification?.appliedAt || certification.appliedAt,
            applicationFeePaid: true,
            applicationFeeTxId: feeTxId
          }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          certification: updatedCertification || certification,
          applicationFeePaid: true,
          applicationFee: APPLICATION_FEE
        }));
      } catch (err) {
        console.error(`   \u274C [${requestId}] Error applying for priesthood:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/priesthood/status" && req.method === "GET") {
    console.log(`   \u{1F4DC} [${requestId}] GET /api/priesthood/status - Getting certification status`);
    try {
      const parsedUrl2 = url.parse(req.url || "/", true);
      const email = parsedUrl2.query.email;
      if (!email) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "email query parameter required" }));
        return;
      }
      const certification = (0, import_priesthoodCertification.getCertificationStatus)(email);
      const hasCert = (0, import_priesthoodCertification.hasPriesthoodCertification)(email);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        certification,
        hasCertification: hasCert
      }));
    } catch (err) {
      console.error(`   \u274C [${requestId}] Error getting certification status:`, err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname === "/api/priesthood/applications" && req.method === "GET") {
    console.log(`   \u{1F4DC} [${requestId}] GET /api/priesthood/applications - Getting all applications (GOD mode)`);
    try {
      const parsedUrl2 = url.parse(req.url || "/", true);
      const status = parsedUrl2.query.status;
      let certifications;
      if (status) {
        certifications = (0, import_priesthoodCertification.getCertificationsByStatus)(status);
      } else {
        certifications = (0, import_priesthoodCertification.getAllCertifications)();
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        certifications,
        count: certifications.length
      }));
    } catch (err) {
      console.error(`   \u274C [${requestId}] Error getting applications:`, err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname === "/api/priesthood/approve" && req.method === "POST") {
    console.log(`   \u{1F4DC} [${requestId}] POST /api/priesthood/approve - Approving priesthood application`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, approvedBy, reason } = JSON.parse(body);
        if (!email || !approvedBy) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "email and approvedBy required" }));
          return;
        }
        const certification = (0, import_priesthoodCertification.approvePriesthood)(email, approvedBy, reason);
        broadcastEvent({
          type: "priesthood_application_approved",
          component: "priesthood-certification",
          message: `Priesthood application approved for ${email}`,
          timestamp: Date.now(),
          data: {
            email,
            approvedBy,
            approvedAt: certification.approvedAt
          }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          certification
        }));
      } catch (err) {
        console.error(`   \u274C [${requestId}] Error approving application:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/priesthood/reject" && req.method === "POST") {
    console.log(`   \u{1F4DC} [${requestId}] POST /api/priesthood/reject - Rejecting priesthood application`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, rejectedBy, reason } = JSON.parse(body);
        if (!email || !rejectedBy) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "email and rejectedBy required" }));
          return;
        }
        const certification = (0, import_priesthoodCertification.rejectPriesthood)(email, rejectedBy, reason);
        broadcastEvent({
          type: "priesthood_application_rejected",
          component: "priesthood-certification",
          message: `Priesthood application rejected for ${email}`,
          timestamp: Date.now(),
          data: {
            email,
            rejectedBy,
            rejectedAt: certification.rejectedAt
          }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          certification
        }));
      } catch (err) {
        console.error(`   \u274C [${requestId}] Error rejecting application:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/priesthood/revoke" && req.method === "POST") {
    console.log(`   \u{1F4DC} [${requestId}] POST /api/priesthood/revoke - Revoking priesthood certification`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, revokedBy, reason } = JSON.parse(body);
        if (!email || !revokedBy) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "email and revokedBy required" }));
          return;
        }
        const certification = (0, import_priesthoodCertification.revokePriesthood)(email, revokedBy, reason);
        broadcastEvent({
          type: "priesthood_certification_revoked",
          component: "priesthood-certification",
          message: `Priesthood certification revoked for ${email}`,
          timestamp: Date.now(),
          data: {
            email,
            revokedBy,
            revokedAt: certification.revokedAt
          }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          certification
        }));
      } catch (err) {
        console.error(`   \u274C [${requestId}] Error revoking certification:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/priesthood/pay-membership" && req.method === "POST") {
    console.log(`   \u{1F4DC} [${requestId}] POST /api/priesthood/pay-membership - Activating membership (FREE)`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email } = JSON.parse(body);
        if (!email) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "email required" }));
          return;
        }
        const certification = (0, import_priesthoodCertification.getCertificationStatus)(email);
        if (!certification) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "No priesthood certification found" }));
          return;
        }
        if (certification.status !== "approved" && certification.status !== "suspended") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Cannot activate membership. Current status: ${certification.status}` }));
          return;
        }
        const MEMBERSHIP_PERIOD_MS = 30 * 24 * 60 * 60 * 1e3;
        const now = Date.now();
        const activeUntil = certification.membershipActiveUntil && certification.membershipActiveUntil > now ? certification.membershipActiveUntil + MEMBERSHIP_PERIOD_MS : now + MEMBERSHIP_PERIOD_MS;
        const { updateCertificationBilling } = await import("./src/priesthoodCertification");
        updateCertificationBilling(email, {
          membershipActiveUntil: activeUntil,
          lastActivityDate: now,
          activityCount: (certification.activityCount || 0) + 1,
          suspendedForNonPayment: false
        });
        if (certification.status === "suspended" && certification.suspendedForNonPayment) {
          const { getCertificationStatus: getCert } = await import("./src/priesthoodCertification");
          const updated = getCert(email);
          if (updated && updated.status === "suspended") {
          }
        }
        const updatedCertification = (0, import_priesthoodCertification.getCertificationStatus)(email);
        broadcastEvent({
          type: "priesthood_membership_activated",
          component: "priesthood-certification",
          message: `Membership activated for ${email} (FREE). Active until ${new Date(activeUntil).toISOString()}. Authority is trust-based and rate-limited.`,
          timestamp: Date.now(),
          data: {
            email,
            membershipFee: 0,
            // FREE
            activeUntil,
            trustScore: updatedCertification?.trustScore || 0
          }
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          certification: updatedCertification,
          membershipActivated: true,
          membershipFee: 0,
          // FREE
          activeUntil,
          message: "Membership is FREE. Authority is trust-based and rate-limited."
        }));
      } catch (err) {
        console.error(`   \u274C [${requestId}] Error paying membership fee:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  if (pathname === "/api/governance/evaluate" && req.method === "POST") {
    console.log(`   \u{1F702} [${requestId}] POST /api/governance/evaluate - Evaluating action against governance rules`);
    let body = "";
    let bodyReceived = false;
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      if (bodyReceived)
        return;
      bodyReceived = true;
      try {
        const parsedBody = JSON.parse(body);
        const { getGovernanceService } = await import("./src/governance/governanceService");
        const governanceService = getGovernanceService();
        const result = governanceService.evaluateAction(parsedBody);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          result
        }));
      } catch (error) {
        console.error(`   \u274C [${requestId}] Error evaluating governance action:`, error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          error: error.message || "Failed to evaluate action"
        }));
      }
    });
    return;
  }
  if (pathname === "/api/governance/rules" && req.method === "GET") {
    console.log(`   \u{1F702} [${requestId}] GET /api/governance/rules - Getting all governance rules`);
    try {
      const { getGovernanceService } = await import("./src/governance/governanceService");
      const governanceService = getGovernanceService();
      const rules = governanceService.getAllRules();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        rules
      }));
    } catch (error) {
      console.error(`   \u274C [${requestId}] Error getting governance rules:`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        error: error.message || "Failed to get rules"
      }));
    }
    return;
  }
  if (pathname.startsWith("/api/governance/rules/") && req.method === "GET") {
    const ruleId = pathname.split("/").pop();
    console.log(`   \u{1F702} [${requestId}] GET /api/governance/rules/${ruleId} - Getting rule by ID`);
    try {
      const { getGovernanceService } = await import("./src/governance/governanceService");
      const governanceService = getGovernanceService();
      const rule = governanceService.getRule(ruleId || "");
      if (!rule) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          error: "Rule not found"
        }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        rule
      }));
    } catch (error) {
      console.error(`   \u274C [${requestId}] Error getting governance rule:`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        error: error.message || "Failed to get rule"
      }));
    }
    return;
  }
  if (pathname === "/api/governance/rules" && req.method === "POST") {
    console.log(`   \u{1F702} [${requestId}] POST /api/governance/rules - Creating/updating governance rule`);
    let body = "";
    let bodyReceived = false;
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      if (bodyReceived)
        return;
      bodyReceived = true;
      try {
        const parsedBody = JSON.parse(body);
        const { rule, actorRole } = parsedBody;
        if (!rule || !actorRole) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: "Rule and actorRole are required"
          }));
          return;
        }
        const { getGovernanceService } = await import("./src/governance/governanceService");
        const { ActorRole } = await import("./src/governance/types");
        const governanceService = getGovernanceService();
        governanceService.upsertRule(rule, actorRole);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: "Rule created/updated successfully"
        }));
      } catch (error) {
        console.error(`   \u274C [${requestId}] Error creating/updating governance rule:`, error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          error: error.message || "Failed to create/update rule"
        }));
      }
    });
    return;
  }
  if (pathname.startsWith("/api/governance/rules/") && req.method === "DELETE") {
    const ruleId = pathname.split("/").pop();
    console.log(`   \u{1F702} [${requestId}] DELETE /api/governance/rules/${ruleId} - Deleting governance rule`);
    let body = "";
    let bodyReceived = false;
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      if (bodyReceived)
        return;
      bodyReceived = true;
      try {
        const parsedBody = body ? JSON.parse(body) : {};
        const { actorRole } = parsedBody;
        if (!actorRole) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: "actorRole is required"
          }));
          return;
        }
        const { getGovernanceService } = await import("./src/governance/governanceService");
        const governanceService = getGovernanceService();
        const deleted = governanceService.deleteRule(ruleId || "", actorRole);
        if (!deleted) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: "Rule not found"
          }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: "Rule deleted successfully"
        }));
      } catch (error) {
        console.error(`   \u274C [${requestId}] Error deleting governance rule:`, error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          error: error.message || "Failed to delete rule"
        }));
      }
    });
    return;
  }
  if (pathname === "/api/governance/history" && req.method === "GET") {
    console.log(`   \u{1F702} [${requestId}] GET /api/governance/history - Getting evaluation history`);
    try {
      const { getGovernanceService } = await import("./src/governance/governanceService");
      const governanceService = getGovernanceService();
      const url2 = new URL(req.url || "", `http://${req.headers.host}`);
      const limit = parseInt(url2.searchParams.get("limit") || "100", 10);
      const history = governanceService.getEvaluationHistory(limit);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        history
      }));
    } catch (error) {
      console.error(`   \u274C [${requestId}] Error getting evaluation history:`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        error: error.message || "Failed to get evaluation history"
      }));
    }
    return;
  }
  if (pathname === "/api/governance/stats" && req.method === "GET") {
    console.log(`   \u{1F702} [${requestId}] GET /api/governance/stats - Getting evaluation statistics`);
    try {
      const { getGovernanceService } = await import("./src/governance/governanceService");
      const governanceService = getGovernanceService();
      const stats = governanceService.getEvaluationStats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        stats
      }));
    } catch (error) {
      console.error(`   \u274C [${requestId}] Error getting evaluation stats:`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        error: error.message || "Failed to get evaluation stats"
      }));
    }
    return;
  }
  if (pathname === "/api/priesthood/stats" && req.method === "GET") {
    console.log(`   \u{1F4DC} [${requestId}] GET /api/priesthood/stats - Getting certification statistics`);
    try {
      const stats = (0, import_priesthoodCertification.getCertificationStats)();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        stats
      }));
    } catch (err) {
      console.error(`   \u274C [${requestId}] Error getting stats:`, err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  if (pathname.startsWith("/api/movie/video/")) {
    if (req.method === "OPTIONS") {
      console.log(`   \u2705 [${requestId}] OPTIONS preflight for video endpoint`);
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type",
        "Access-Control-Max-Age": "86400"
        // 24 hours
      });
      res.end();
      return;
    }
    const videoFile = pathname.substring("/api/movie/video/".length);
    const videoPath = path.join(__dirname, "data", videoFile);
    const resolvedPath2 = path.resolve(videoPath);
    const dataDir = path.resolve(path.join(__dirname, "data"));
    if (!resolvedPath2.startsWith(dataDir)) {
      console.log(`   \u{1F6AB} [${requestId}] Forbidden video access attempt: ${pathname}`);
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    fs.access(videoPath, fs.constants.F_OK, (err) => {
      if (err) {
        console.log(`   \u274C [${requestId}] Video file not found: ${videoPath}`);
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Video not found");
        return;
      }
      const stat = fs.statSync(videoPath);
      if (videoPath.endsWith(".txt")) {
        console.log(`   \u26A0\uFE0F [${requestId}] Video file is a .txt file (placeholder): ${videoFile} (${stat.size} bytes)`);
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Video file is a placeholder - please provide a real video file");
        return;
      }
      if (stat.size < 1e3) {
        console.log(`   \u26A0\uFE0F [${requestId}] Warning: Video file is very small (${stat.size} bytes) - may be a placeholder`);
        console.log(`   \u26A0\uFE0F [${requestId}] Serving anyway for development/testing purposes`);
      }
      console.log(`   \u{1F3AC} [${requestId}] Serving video file via /api/movie/video/: ${videoFile} (${stat.size} bytes)`);
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": "video/mp4",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range"
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": stat.size,
          "Content-Type": "video/mp4",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range"
        });
        fs.createReadStream(videoPath).pipe(res);
      }
    });
    return;
  }
  if (pathname.startsWith("/videos/")) {
    if (req.method === "OPTIONS") {
      console.log(`   \u2705 [${requestId}] OPTIONS preflight for legacy video endpoint`);
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type",
        "Access-Control-Max-Age": "86400"
        // 24 hours
      });
      res.end();
      return;
    }
    const videoFile = pathname.substring(8);
    const videoPath = path.join(__dirname, "data", videoFile);
    const resolvedPath2 = path.resolve(videoPath);
    const resolvedDataDir = path.resolve(path.join(__dirname, "data"));
    if (!resolvedPath2.startsWith(resolvedDataDir)) {
      console.log(`   \u{1F6AB} [${requestId}] Forbidden video access attempt: ${pathname}`);
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.access(videoPath, fs.constants.F_OK, (err) => {
      if (err) {
        console.log(`   \u274C [${requestId}] Video file not found: ${videoPath}`);
        res.writeHead(404);
        res.end("Video not found");
        return;
      }
      const stat = fs.statSync(videoPath);
      if (stat.size < 1e3 || videoPath.endsWith(".txt")) {
        console.log(`   \u26A0\uFE0F [${requestId}] Video file appears to be a placeholder: ${videoFile} (${stat.size} bytes)`);
        res.writeHead(404);
        res.end("Video file is a placeholder - please provide a real video file");
        return;
      }
      console.log(`   \u{1F3AC} [${requestId}] Serving video file: ${videoFile} (${stat.size} bytes)`);
      const fileSize = stat.size;
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": "video/mp4",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range"
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": "video/mp4",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range"
        });
        fs.createReadStream(videoPath).pipe(res);
      }
    });
    return;
  }
  let filePath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.join(import_config.FRONTEND_PATH, filePath);
  const resolvedPath = path.resolve(fullPath);
  const resolvedFrontend = path.resolve(import_config.FRONTEND_PATH);
  if (!resolvedPath.startsWith(resolvedFrontend)) {
    console.log(`   \u26A0\uFE0F [${requestId}] Security: Path traversal attempt blocked`);
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (pathname === "/" || pathname === "/index.html") {
    console.log(`   \u{1F4C1} [${requestId}] Frontend path: ${import_config.FRONTEND_PATH}`);
    console.log(`   \u{1F4C1} [${requestId}] Full path: ${fullPath}`);
    console.log(`   \u{1F4C1} [${requestId}] Resolved path: ${resolvedPath}`);
    console.log(`   \u{1F4C1} [${requestId}] Path exists: ${fs.existsSync(fullPath)}`);
  }
  fs.access(fullPath, fs.constants.F_OK, (err) => {
    if (err) {
      const indexPath = path.join(import_config.FRONTEND_PATH, "index.html");
      console.log(`   \u{1F4C1} [${requestId}] File not found: ${fullPath}, trying index.html: ${indexPath}`);
      console.log(`   \u{1F4C1} [${requestId}] Index.html exists: ${fs.existsSync(indexPath)}`);
      fs.readFile(indexPath, (err2, data) => {
        if (err2) {
          console.error(`   \u274C [${requestId}] Failed to read index.html: ${err2.message}`);
          console.error(`   \u274C [${requestId}] FRONTEND_PATH: ${import_config.FRONTEND_PATH}`);
          console.error(`   \u274C [${requestId}] indexPath: ${indexPath}`);
          console.error(`   \u274C [${requestId}] Directory exists: ${fs.existsSync(import_config.FRONTEND_PATH)}`);
          if (fs.existsSync(import_config.FRONTEND_PATH)) {
            const files = fs.readdirSync(import_config.FRONTEND_PATH);
            console.error(`   \u274C [${requestId}] Files in directory: ${files.join(", ")}`);
          }
          res.writeHead(404, { "Content-Type": "text/html" });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Frontend Not Found</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
                h1 { color: #d32f2f; }
                code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
              </style>
            </head>
            <body>
              <h1>404 - Frontend Not Found</h1>
              <p>The Angular frontend has not been built yet.</p>
              <p>Please run: <code>cd frontend && ng build</code></p>
              <p>Or use the Angular dev server: <code>cd frontend && ng serve</code></p>
              <p><small>FRONTEND_PATH: ${import_config.FRONTEND_PATH}</small></p>
            </body>
            </html>
          `);
        } else {
          res.writeHead(200, {
            "Content-Type": "text/html",
            "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; media-src 'self' http: https:; connect-src 'self' ws: wss: http: https: https://accounts.google.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com;"
          });
          res.end(data);
        }
      });
    } else {
      fs.readFile(fullPath, (err2, data) => {
        if (err2) {
          res.writeHead(500);
          res.end("Internal Server Error");
        } else {
          const ext = path.extname(fullPath);
          const contentType = getContentType(ext);
          res.writeHead(200, { "Content-Type": contentType });
          res.end(data);
        }
      });
    }
  });
});
function getContentType(ext) {
  const types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };
  return types[ext] || "application/octet-stream";
}
const redis = new import_redis.InMemoryRedisServer();
async function connectRedis() {
  if (import_config.SKIP_REDIS) {
    console.log("\u26A0\uFE0F  Redis: Skipped (--skip-redis flag)");
    return false;
  }
  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong === "PONG") {
      console.log("\u2705 Redis: Embedded server ready");
      return true;
    }
    return false;
  } catch (err) {
    console.error("\u274C Redis: Connection failed:", err.message);
    return false;
  }
}
async function ensureRedisConnection() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}
const CHAIN_ID = "eden-core";
const ROOT_CA_FEE = 0.02;
const INDEXER_FEE = 5e-3;
const LLM_BASE_COST = 1e-3;
const ROUTING_COST_PER_PROVIDER = 1e-4;
const REASONING_COST_MULTIPLIER = 1.5;
const PRICE_IMPACT_PER_TRADE = 1e-5;
const ITAX_RATE = 5e-6;
const ROOT_CA_LIQUIDITY_POOL = 1e3;
const ITAX_DISTRIBUTION = {
  rootCA: 0.4,
  // 40% to ROOT CA
  indexer: 0.3,
  // 30% to indexer (token provider)
  trader: 0.3
  // 30% back to trader as rebate
};
const DEX_POOLS = /* @__PURE__ */ new Map();
let rootCALiquidity = ROOT_CA_LIQUIDITY_POOL;
const ROOT_BALANCES = {
  rootCA: 0,
  indexers: /* @__PURE__ */ new Map(),
  providers: /* @__PURE__ */ new Map()
};
const LEDGER_SETTLEMENT_STREAM = "eden:ledger:pending";
const USERS = [
  { id: "u1", email: "bill.draper.auto@gmail.com", balance: 0 },
  { id: "u2", email: "bob@gmail.com", balance: 0 }
];
const PROVIDER_WEBHOOKS = /* @__PURE__ */ new Map();
const ROOT_CA_SERVICE_REGISTRY = [
  // Holy Ghost Infrastructure Services (ROOT CA's indexer)
  {
    id: "stripe-payment-rail-001",
    uuid: "550e8400-e29b-41d4-a716-446655440100",
    name: "Stripe Payment Rail",
    serviceType: "payment-rail",
    location: "Global",
    bond: 5e4,
    // High bond for payment infrastructure
    reputation: 5,
    gardenId: "HG",
    // Holy Ghost garden
    apiEndpoint: "https://api.stripe.com/v1",
    status: "active"
  },
  {
    id: "settlement-service-001",
    uuid: "550e8400-e29b-41d4-a716-446655440101",
    name: "Settlement Service",
    serviceType: "settlement",
    location: "ROOT CA",
    bond: 1e5,
    // Very high bond for settlement authority
    reputation: 5,
    gardenId: "HG",
    // Holy Ghost garden
    apiEndpoint: "internal://settlement",
    status: "active"
  },
  {
    id: "service-registry-001",
    uuid: "550e8400-e29b-41d4-a716-446655440102",
    name: "Service Registry",
    serviceType: "registry",
    location: "ROOT CA",
    bond: 5e4,
    // High bond for registry authority
    reputation: 5,
    gardenId: "HG",
    // Holy Ghost garden
    apiEndpoint: "internal://service-registry",
    status: "active"
  },
  {
    id: "webserver-service-001",
    uuid: "550e8400-e29b-41d4-a716-446655440103",
    name: "Web Server",
    serviceType: "webserver",
    location: "ROOT CA",
    bond: 1e4,
    reputation: 5,
    gardenId: "HG",
    // Holy Ghost garden
    apiEndpoint: `http://localhost:${import_config.HTTP_PORT}`,
    status: "active"
  },
  {
    id: "websocket-service-001",
    uuid: "550e8400-e29b-41d4-a716-446655440104",
    name: "WebSocket Service",
    serviceType: "websocket",
    location: "ROOT CA",
    bond: 1e4,
    reputation: 5,
    gardenId: "HG",
    // Holy Ghost garden
    apiEndpoint: `ws://localhost:${import_config.HTTP_PORT}`,
    status: "active"
  },
  {
    id: "wallet-service-001",
    uuid: "550e8400-e29b-41d4-a716-446655440105",
    name: "JesusCoin Wallet Service",
    serviceType: "wallet",
    location: "ROOT CA",
    bond: 2e5,
    // Very high bond for wallet authority (single source of truth)
    reputation: 5,
    gardenId: "HG",
    // Holy Ghost garden
    apiEndpoint: "internal://wallet",
    status: "active"
  },
  {
    id: "accountant-service-001",
    uuid: "550e8400-e29b-41d4-a716-446655440106",
    name: "Accountant Service",
    serviceType: "accountant",
    location: "ROOT CA",
    bond: 75e3,
    // High bond for financial reporting integrity
    reputation: 5,
    gardenId: "HG",
    // Holy Ghost garden
    apiEndpoint: "internal://accountant",
    status: "active"
  },
  {
    id: "token-liquidity-accountant-001",
    uuid: "550e8400-e29b-41d4-a716-446655440108",
    name: "Token Liquidity Accountant Service",
    serviceType: "liquidity-accountant",
    location: "ROOT CA",
    bond: 75e3,
    // High bond for liquidity tracking authority
    reputation: 5,
    gardenId: "HG",
    // Holy Ghost garden
    apiEndpoint: "internal://liquidity-accountant",
    status: "active",
    description: "Tracks initial and runtime liquidity for all DEX token pools (tokenA, tokenB, etc.) via Stripe Payment Rail"
  },
  {
    id: "price-order-service-001",
    uuid: "550e8400-e29b-41d4-a716-446655440107",
    name: "Price Order Service",
    serviceType: "price-order",
    location: "ROOT CA",
    bond: 1e5,
    // Very high bond for order matching and settlement authority
    reputation: 5,
    gardenId: "HG",
    // Holy Ghost garden
    apiEndpoint: "internal://price-order",
    status: "active",
    description: "Real-time DEX order matching, two-phase settlement, and price broadcasting service"
  },
  // Regular Service Providers
  // In ROOT mode: All service providers (including amc-001) are created dynamically via the wizard
  // They should NOT exist in hardcoded defaults
  ...import_config.DEPLOYED_AS_ROOT ? [] : [
    {
      id: "amc-001",
      uuid: "550e8400-e29b-41d4-a716-446655440001",
      // UUID for certificate issuance
      name: "AMC Theatres",
      serviceType: "movie",
      location: "Baltimore, Maryland",
      bond: 1e3,
      reputation: 4.8,
      gardenId: "garden-1",
      // Default to garden-1 (will be overridden by persistence file if different)
      apiEndpoint: "https://api.amctheatres.com/v1/listings"
    },
    {
      id: "moviecom-001",
      uuid: "550e8400-e29b-41d4-a716-446655440002",
      // UUID for certificate issuance
      name: "MovieCom",
      serviceType: "movie",
      location: "Baltimore, Maryland",
      bond: 800,
      reputation: 4.5,
      gardenId: "garden-2",
      apiEndpoint: "https://api.moviecom.com/showtimes"
    },
    {
      id: "cinemark-001",
      uuid: "550e8400-e29b-41d4-a716-446655440003",
      // UUID for certificate issuance
      name: "Cinemark",
      serviceType: "movie",
      location: "Baltimore, Maryland",
      bond: 1200,
      reputation: 4.7,
      gardenId: "garden-1",
      apiEndpoint: "https://api.cinemark.com/movies"
    },
    // Snake Service Providers (serviceType: "snake", belongs to indexers)
    {
      id: "snake-premium-cinema-001",
      uuid: "550e8400-e29b-41d4-a716-446655440010",
      name: "Premium Cinema Ads",
      serviceType: "snake",
      // Snake is a service type, not a provider type
      location: "Global",
      bond: 1e4,
      insuranceFee: 1e4,
      // Higher insurance fee for Snake
      reputation: 4.5,
      gardenId: "garden-1",
      apiEndpoint: "https://ads.premiumcinema.com/api",
      iGasMultiplier: 2,
      // Double iGas
      iTaxMultiplier: 2,
      // Double iTax
      maxInfluence: 0.15,
      // 15% max influence
      contextsAllowed: ["movies", "entertainment", "shopping"],
      contextsForbidden: ["health", "legal", "finance", "education"],
      adCapabilities: ["product_promotion", "service_highlighting"],
      status: "active"
    },
    {
      id: "snake-shopping-deals-001",
      uuid: "550e8400-e29b-41d4-a716-446655440011",
      name: "Shopping Deals Ads",
      serviceType: "snake",
      // Snake is a service type, not a provider type
      location: "Global",
      bond: 1e4,
      insuranceFee: 1e4,
      reputation: 4.3,
      gardenId: "garden-2",
      apiEndpoint: "https://ads.shoppingdeals.com/api",
      iGasMultiplier: 2,
      iTaxMultiplier: 2,
      maxInfluence: 0.12,
      // 12% max influence
      contextsAllowed: ["shopping", "restaurants"],
      contextsForbidden: ["health", "legal", "finance", "education"],
      adCapabilities: ["product_promotion"],
      status: "active"
    }
  ]
  // DEX Pool Service Providers will be dynamically created from token indexers during initialization
];
function _initializeDEXPools_DEPRECATED() {
  for (let i = 0; i < import_state.TOKEN_GARDENS.length; i++) {
    const tokenGarden = import_state.TOKEN_GARDENS[i];
    if (!tokenGarden)
      continue;
    const tokenSymbol = `TOKEN${String.fromCharCode(65 + i)}`;
    const tokenName = `Token ${String.fromCharCode(65 + i)}`;
    const poolId = `pool-solana-${tokenSymbol.toLowerCase()}`;
    const pool = {
      poolId,
      tokenSymbol,
      tokenName,
      baseToken: "SOL",
      poolLiquidity: 100 - i * 10,
      // Decreasing liquidity for variety: 100, 90, 80...
      tokenReserve: 1e5 - i * 1e4,
      // 100k, 90k, 80k...
      baseReserve: 100 - i * 10,
      // 100, 90, 80...
      price: 1e-3,
      // 1 Token = 0.001 SOL
      bond: 5e3,
      gardenId: tokenGarden.id,
      // Assign to token garden
      createdAt: Date.now(),
      totalVolume: 0,
      totalTrades: 0
    };
    DEX_POOLS.set(poolId, pool);
  }
  console.log(`\u{1F30A} Initialized ${DEX_POOLS.size} DEX pools`);
  console.log(`\u{1F4B0} ROOT CA Liquidity Pool: ${rootCALiquidity} SOL`);
  console.log(`\u{1F537} Token Gardens: ${import_state.TOKEN_GARDENS.map((ti) => ti.name).join(", ")}`);
  for (const [poolId, pool] of DEX_POOLS.entries()) {
    console.log(`   ${pool.tokenSymbol} Pool \u2192 ${pool.gardenId} (${pool.poolLiquidity} SOL liquidity)`);
  }
}
async function generateWorkflowFromTemplate(template, serviceType) {
  const serviceTypeDescriptions = {
    movie: "Movie ticket booking service - Users can search for movies, select showtimes, and purchase tickets",
    dex: "Decentralized exchange token pools - Users can buy and sell tokens through DEX pools",
    airline: "Airline ticket booking service - Users can search for flights, select seats, and purchase tickets",
    autoparts: "Automotive parts marketplace - Users can search for auto parts, compare prices, and purchase parts",
    hotel: "Hotel reservation service - Users can search for hotels, view availability, and book rooms",
    restaurant: "Restaurant booking service - Users can search for restaurants, view menus, and make reservations",
    grocerystore: "Grocery store service - Users can search for grocery stores, browse products, and place orders",
    pharmacy: "Pharmacy service - Users can search for pharmacies, find medications, and manage prescriptions",
    dogpark: "Dog park service - Users can search for dog parks, view amenities, and check availability",
    gasstation: "Gas station service - Users can search for gas stations, compare prices, and find fuel types",
    party: "Party and event service - Users can search for parties and events, view details, and purchase tickets online",
    bank: "Banking service - Users can search for banks, view services, and access banking facilities",
    snake: "Snake (Advertiser) - Advertising service provider that displays ads to users"
  };
  const description = serviceTypeDescriptions[serviceType] || `Service type: ${serviceType}`;
  const prompt = `You are a workflow designer for the Eden ecosystem. Generate a FlowWise workflow JSON file based on the provided template.

SERVICE TYPE: ${serviceType}
DESCRIPTION: ${description}

TEMPLATE WORKFLOW:
${JSON.stringify(template, null, 2)}

INSTRUCTIONS:
1. Adapt the template workflow to the new service type (${serviceType})
2. Update all serviceType references from "movie" to "${serviceType}"
3. Update step names, descriptions, and actions to match the new service type
4. Keep the same workflow structure (steps, transitions, actions)
5. Update component names if needed (e.g., "movie_theater" \u2192 appropriate component for ${serviceType})
6. Update field names in actions (e.g., "movieTitle" \u2192 appropriate field for ${serviceType})
7. Ensure all transitions and step IDs are valid
8. Keep ROOT CA ledger and payment steps unchanged
9. IMPORTANT: Replace ALL instances of "JSC" or "JesusCoin" with "\u{1F34E} APPLES" in ALL user-facing messages, including:
   - Decision prompts (e.g., "Would you like to proceed with ... for {{price}} \u{1F34E} APPLES?")
   - Payment messages (e.g., "{{cashier.name}} processed payment: {{ledgerEntry.amount}} \u{1F34E} APPLES")
   - Purchase confirmations (e.g., "Purchased ... for {{price}} \u{1F34E} APPLES")
   - Review rebate messages (e.g., "Review rebate credited: {{rebate}} \u{1F34E} APPLES")
   - Any other user-visible text that mentions currency
10. Return ONLY the complete JSON object with the same structure as the template

CRITICAL: Return ONLY valid JSON. Do not include any markdown formatting, code blocks, or explanations. Just the JSON object.`;
  const ENABLE_OPENAI_FOR_WORKFLOW = import_config.ENABLE_OPENAI ?? true;
  try {
    const llmResponse = await (0, import_llm2.callLLM)(prompt, ENABLE_OPENAI_FOR_WORKFLOW);
    let generatedWorkflow;
    try {
      const cleanedResponse = llmResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      generatedWorkflow = JSON.parse(cleanedResponse);
    } catch (parseError) {
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        generatedWorkflow = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(`Failed to parse LLM response as JSON: ${parseError.message}`);
      }
    }
    if (!generatedWorkflow.flowwiseWorkflow) {
      throw new Error("Generated workflow missing 'flowwiseWorkflow' property");
    }
    return generatedWorkflow;
  } catch (error) {
    console.error(`\u274C [Workflow Generation] Error:`, error.message);
    throw error;
  }
}
const _LLM_QUERY_EXTRACTION_PROMPT_DEPRECATED = `
You are Eden Core AI query processor.
Extract service query from user input.
Return JSON only with: query (object with serviceType and filters), serviceType, confidence.

Service types: "movie" or "dex"

For movie queries:
Example: {"query": {"serviceType": "movie", "filters": {"location": "Baltimore", "maxPrice": 10}}, "serviceType": "movie", "confidence": 0.95}

For DEX token trading queries (BUY/SELL tokens):
- tokenSymbol: The token being bought/sold (e.g., "TOKENA", "TOKENB", "Token A")
  * If user says "BUY token A" or "token A", tokenSymbol = "TOKENA"
  * If user says "SOLANA token A", tokenSymbol = "TOKENA" (token A is what's being traded)
- baseToken: The currency used to buy/sell (e.g., "SOL", "USDC", "SOLANA")
  * If user says "BUY with SOL" or "SOLANA token A", baseToken = "SOL" (SOL is the payment currency)
- Extract action: "BUY" or "SELL"
- Extract tokenAmount if specified
- Extract maxPrice if specified (e.g., "1 Token/SOL" means price <= 1)

IMPORTANT: In phrases like "BUY 2 SOLANA token A":
- tokenSymbol = "TOKENA" (the token being bought)
- baseToken = "SOL" (SOLANA/SOL is the currency used to buy)

Example: {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKENA", "baseToken": "SOL", "action": "BUY", "tokenAmount": 2, "maxPrice": 1}}, "serviceType": "dex", "confidence": 0.95}
`;
const _LLM_RESPONSE_FORMATTING_PROMPT_DEPRECATED = `
You are Eden Core AI response formatter.
Format service provider listings into user-friendly chat response.

Your responsibilities depend on serviceType:

FOR MOVIE SERVICE:
1. Filter listings based on user query filters (e.g., maxPrice, genre, time, location)
2. If maxPrice is "best" or "lowest", select listings with the lowest price
3. If maxPrice is a number, only include listings with price <= maxPrice
4. Apply other filters (genre, time, location) as specified
5. Format the filtered results into a user-friendly message
6. Select the best option based on user criteria (best price, best rating, etc.)

IMPORTANT: When returning selectedListing, you MUST include ALL fields from the original listing, especially providerId (e.g., "amc-001", "moviecom-001", "cinemark-001").

FOR DEX TOKEN SERVICE:
1. Filter token pools based on tokenSymbol, baseToken, and action (BUY/SELL)
2. If maxPrice is specified (e.g., "1 Token/SOL"), only include pools with price <= maxPrice
3. If action is "BUY", find pools where user can buy tokens with baseToken
4. If action is "SELL", find pools where user can sell tokens for baseToken
5. Select the best pool based on price and liquidity
6. Format the results showing: token symbol, price, liquidity, pool provider

IMPORTANT: When returning selectedListing for DEX, you MUST include ALL fields: poolId, providerId, tokenSymbol, baseToken, price, liquidity, indexerId.

Return JSON with: message (string), listings (array of filtered listings), selectedListing (best option with ALL original fields including providerId/poolId, or null).
`;
function _executeDEXTrade_DEPRECATED(poolId, action, tokenAmount, userEmail) {
  const pool = DEX_POOLS.get(poolId);
  if (!pool) {
    throw new Error(`Pool ${poolId} not found`);
  }
  let baseAmount;
  let newPrice;
  if (action === "BUY") {
    baseAmount = pool.baseReserve * tokenAmount / (pool.tokenReserve - tokenAmount);
    const priceImpact = PRICE_IMPACT_PER_TRADE;
    baseAmount = baseAmount * (1 + priceImpact);
    pool.baseReserve += baseAmount;
    pool.tokenReserve -= tokenAmount;
    newPrice = pool.baseReserve / pool.tokenReserve;
    pool.price = newPrice;
    pool.poolLiquidity *= 1 + PRICE_IMPACT_PER_TRADE;
  } else {
    baseAmount = pool.baseReserve * tokenAmount / (pool.tokenReserve + tokenAmount);
    const priceImpact = PRICE_IMPACT_PER_TRADE;
    baseAmount = baseAmount * (1 - priceImpact);
    pool.baseReserve -= baseAmount;
    pool.tokenReserve += tokenAmount;
    newPrice = pool.baseReserve / pool.tokenReserve;
    pool.price = newPrice;
    pool.poolLiquidity *= 1 + PRICE_IMPACT_PER_TRADE;
  }
  const tradeValue = baseAmount;
  let iTax = tradeValue * ITAX_RATE;
  const poolProviderId = `dex-pool-${pool.tokenSymbol.toLowerCase()}`;
  const poolProvider = ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === poolProviderId);
  if (poolProvider?.providerType === "SNAKE") {
    const snakeITaxMultiplier = poolProvider.iTaxMultiplier || 2;
    iTax = iTax * snakeITaxMultiplier;
    console.log(`\u{1F40D} [Snake Provider] Applied iTax multiplier: ${snakeITaxMultiplier}x for pool ${poolId}`);
  }
  const iTaxRootCA = iTax * ITAX_DISTRIBUTION.rootCA;
  const iTaxIndexer = iTax * ITAX_DISTRIBUTION.indexer;
  const iTaxTrader = iTax * ITAX_DISTRIBUTION.trader;
  rootCALiquidity += iTaxRootCA;
  pool.totalVolume += tradeValue;
  pool.totalTrades += 1;
  const trade = {
    tradeId: crypto.randomUUID(),
    poolId: pool.poolId,
    tokenSymbol: pool.tokenSymbol,
    baseToken: pool.baseToken,
    action,
    tokenAmount,
    baseAmount,
    price: newPrice,
    priceImpact: PRICE_IMPACT_PER_TRADE,
    iTax,
    timestamp: Date.now(),
    trader: userEmail
  };
  console.log(`\u{1F4B0} [DEX] Trade executed: ${action} ${tokenAmount} ${pool.tokenSymbol} for ${baseAmount.toFixed(6)} ${pool.baseToken}`);
  console.log(`   Price: ${newPrice.toFixed(6)} ${pool.baseToken}/${pool.tokenSymbol}`);
  console.log(`   iTax: ${iTax.toFixed(6)} ${pool.baseToken}`);
  console.log(`   Distribution: ROOT CA ${iTaxRootCA.toFixed(6)}, Indexer ${iTaxIndexer.toFixed(6)}, Trader ${iTaxTrader.toFixed(6)}`);
  broadcastEvent({
    type: "dex_trade_executed",
    component: "dex",
    message: `DEX Trade: ${action} ${tokenAmount} ${pool.tokenSymbol}`,
    timestamp: Date.now(),
    data: {
      trade,
      iTaxDistribution: {
        rootCA: iTaxRootCA,
        indexer: iTaxIndexer,
        trader: iTaxTrader
      },
      poolState: {
        price: pool.price,
        liquidity: pool.poolLiquidity,
        totalVolume: pool.totalVolume,
        totalTrades: pool.totalTrades
      },
      rootCALiquidity
    }
  });
  return trade;
}
function _calculateIGas_DEPRECATED(llmCalls, providersQueried, complexity = 1) {
  const llmCost = LLM_BASE_COST * llmCalls * complexity;
  const routingCost = ROUTING_COST_PER_PROVIDER * providersQueried;
  const reasoningCost = llmCost * REASONING_COST_MULTIPLIER;
  return llmCost + routingCost + reasoningCost;
}
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "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";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
async function _extractQueryWithOpenAI_DEPRECATED(userInput) {
  const messages = [
    { role: "system", content: import_llm2.LLM_QUERY_EXTRACTION_PROMPT },
    { role: "user", content: userInput }
  ];
  const payload = JSON.stringify({
    model: "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.7
  });
  broadcastEvent({
    type: "llm_query_extraction_start",
    component: "llm",
    message: "Starting LLM query extraction...",
    timestamp: Date.now(),
    data: {
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: import_llm2.LLM_QUERY_EXTRACTION_PROMPT,
      userInput,
      messages
    }
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        port: 443,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Length": payload.length
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => data += c);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              broadcastEvent({
                type: "llm_error",
                component: "llm",
                message: "OpenAI API error",
                timestamp: Date.now(),
                data: {
                  provider: "openai",
                  error: parsed.error.message || JSON.stringify(parsed.error),
                  rawResponse: data
                }
              });
              reject(new Error(`OpenAI API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
              return;
            }
            if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
              const content = JSON.parse(parsed.choices[0].message.content);
              const result = {
                query: content.query || { serviceType: "movie", filters: {} },
                serviceType: content.serviceType || "movie",
                confidence: content.confidence || 0.9
              };
              broadcastEvent({
                type: "llm_query_extraction_response",
                component: "llm",
                message: "LLM query extraction completed",
                timestamp: Date.now(),
                data: {
                  provider: "openai",
                  model: "gpt-4o-mini",
                  response: parsed,
                  extractedQuery: result
                }
              });
              resolve(result);
            } else {
              broadcastEvent({
                type: "llm_error",
                component: "llm",
                message: "Invalid OpenAI response format",
                timestamp: Date.now(),
                data: {
                  provider: "openai",
                  error: "Invalid response format",
                  rawResponse: data
                }
              });
              reject(new Error("Invalid OpenAI response format"));
            }
          } catch (err) {
            broadcastEvent({
              type: "llm_error",
              component: "llm",
              message: "Failed to parse OpenAI response",
              timestamp: Date.now(),
              data: {
                provider: "openai",
                error: err.message,
                rawResponse: data
              }
            });
            reject(new Error(`Failed to parse OpenAI response: ${err.message}`));
          }
        });
      }
    );
    req.on("error", (err) => {
      reject(new Error(`OpenAI request failed: ${err.message}`));
    });
    req.write(payload);
    req.end();
  });
}
async function extractQueryWithDeepSeek(userInput) {
  const messages = [
    { role: "system", content: import_llm2.LLM_QUERY_EXTRACTION_PROMPT },
    { role: "user", content: userInput }
  ];
  const payload = JSON.stringify({
    model: "deepseek-r1",
    messages,
    stream: false
  });
  broadcastEvent({
    type: "llm_query_extraction_start",
    component: "llm",
    message: "Starting LLM query extraction...",
    timestamp: Date.now(),
    data: {
      provider: "deepseek",
      model: "deepseek-r1",
      systemPrompt: import_llm2.LLM_QUERY_EXTRACTION_PROMPT,
      userInput,
      messages
    }
  });
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port: 11434, path: "/api/chat", method: "POST" },
      (res) => {
        let data = "";
        res.on("data", (c) => data += c);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const result = {
              query: parsed.query || { serviceType: "movie", filters: {} },
              serviceType: parsed.serviceType || "movie",
              confidence: parsed.confidence || 0.9
            };
            broadcastEvent({
              type: "llm_query_extraction_response",
              component: "llm",
              message: "LLM query extraction completed",
              timestamp: Date.now(),
              data: {
                provider: "deepseek",
                model: "deepseek-r1",
                response: parsed,
                extractedQuery: result
              }
            });
            resolve(result);
          } catch (err) {
            broadcastEvent({
              type: "llm_error",
              component: "llm",
              message: "Failed to parse DeepSeek response",
              timestamp: Date.now(),
              data: {
                provider: "deepseek",
                error: err instanceof Error ? err.message : "Unknown error",
                rawResponse: data
              }
            });
            reject(new Error("Failed to parse DeepSeek response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}
async function mintJSC(email, amount, stripePaymentIntentId, stripeCustomerId, stripePaymentMethodId, stripeSessionId) {
  const stripeProvider = ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === "stripe-payment-rail-001");
  const providerUuid = stripeProvider?.uuid || import_constants.ROOT_CA_UUID;
  console.log(`\u{1F4B0} [Stripe Payment Rail] Minting ${amount} \u{1F34E} APPLES for ${email} (Stripe: ${stripePaymentIntentId})`);
  let user = USERS.find((u) => u.email === email);
  if (!user) {
    user = {
      id: `u${USERS.length + 1}`,
      email,
      balance: 0
    };
    USERS.push(user);
    console.log(`   \u2705 Created new user: ${email}`);
  }
  const walletResult = await (0, import_wallet.creditWallet)(
    email,
    amount,
    crypto.randomUUID(),
    `Stripe payment confirmed: ${stripePaymentIntentId}`,
    { stripePaymentIntentId, serviceProvider: "stripe-payment-rail-001" }
  );
  if (!walletResult.success) {
    throw new Error(`Failed to mint JSC: ${walletResult.error}`);
  }
  user.balance = walletResult.balance;
  console.log(`\u2705 [Stripe Payment Rail] Wallet updated successfully`);
  console.log(`   Email: ${email}`);
  console.log(`   Amount credited: ${amount} \u{1F34E} APPLES`);
  console.log(`   Final wallet balance: ${walletResult.balance} \u{1F34E} APPLES`);
  console.log(`   User.balance synced: ${user.balance} \u{1F34E} APPLES`);
  if (!import_config.SKIP_REDIS && redis.isOpen) {
    try {
      await ensureRedisConnection();
      const verifyBalance = await redis.get(`${import_constants.WALLET_BALANCE_PREFIX}${email}`);
      console.log(`   \u2705 Verification: Redis wallet balance = ${verifyBalance || "NOT FOUND"} JSC`);
      if (verifyBalance && parseFloat(verifyBalance) !== walletResult.balance) {
        console.error(`   \u274C MISMATCH: Redis balance (${verifyBalance}) != walletResult.balance (${walletResult.balance})`);
      }
    } catch (err) {
      console.warn(`   \u26A0\uFE0F  Could not verify Redis balance:`, err.message);
    }
  }
  const snapshot = {
    chainId: CHAIN_ID,
    txId: crypto.randomUUID(),
    slot: Date.now(),
    blockTime: Date.now(),
    payer: `stripe:${stripePaymentIntentId}`,
    merchant: email,
    amount,
    feeSplit: {}
  };
  const entry = {
    entryId: crypto.randomUUID(),
    txId: snapshot.txId,
    timestamp: snapshot.blockTime,
    payer: `stripe:${stripePaymentIntentId}`,
    payerId: stripePaymentIntentId,
    merchant: email,
    providerUuid,
    // Stripe Payment Rail Service Provider UUID
    serviceType: "mint",
    amount,
    iGasCost: 0,
    // No iGas for minting (it's a deposit)
    fees: {},
    status: "completed",
    // Mints are immediately completed
    cashierId: "stripe-payment-rail-001",
    // Stripe Payment Rail Service Provider
    bookingDetails: {
      asset: "JSC",
      stripePaymentIntentId,
      stripeCustomerId: stripeCustomerId || void 0,
      stripePaymentMethodId: stripePaymentMethodId || void 0,
      stripeSessionId: stripeSessionId || void 0
    }
  };
  import_state.LEDGER.push(entry);
  redis.saveLedgerEntries(import_state.LEDGER);
  console.log(`   \u2705 \u{1F34E} APPLES minted: ${amount} \u{1F34E} APPLES added to ${email} balance (new balance: ${walletResult.balance} \u{1F34E} APPLES)`);
  broadcastEvent({
    type: "jsc_minted",
    component: "stripe-payment-rail-001",
    message: `\u{1F34E} APPLES minted via Stripe Payment Rail: ${amount} \u{1F34E} APPLES for ${email}`,
    timestamp: Date.now(),
    data: {
      email,
      amount,
      balance: walletResult.balance,
      stripePaymentIntentId,
      stripeCustomerId: stripeCustomerId || null,
      stripePaymentMethodId: stripePaymentMethodId || null,
      stripeSessionId: stripeSessionId || null,
      entryId: entry.entryId,
      providerId: "stripe-payment-rail-001",
      indexerId: "HG"
      // Holy Ghost indexer
    }
  });
  broadcastEvent({
    type: "ledger_entry_added",
    component: "ledger",
    message: `MINT ledger entry created: ${entry.entryId}`,
    timestamp: Date.now(),
    data: { entry }
  });
}
function _addLedgerEntry_DEPRECATED(snapshot, serviceType, iGasCost, payerId, merchantName, providerUuid, bookingDetails) {
  if (!providerUuid) {
    console.error(`\u274C Provider UUID is missing for merchant: ${merchantName}`);
  }
  const entry = {
    entryId: crypto.randomUUID(),
    txId: snapshot.txId,
    timestamp: snapshot.blockTime,
    payer: snapshot.payer,
    // Email address
    payerId: snapshot.payer,
    // Email address (same as payer)
    merchant: merchantName,
    // Provider name (e.g., "AMC Theatres", "MovieCom", "Cinemark")
    providerUuid: providerUuid || "MISSING-UUID",
    // Service provider UUID for certificate issuance
    serviceType,
    amount: snapshot.amount,
    iGasCost,
    fees: snapshot.feeSplit,
    status: "pending",
    cashierId: (0, import_ledger.getCashierStatus)().id,
    bookingDetails
  };
  console.log(`\u{1F4DD} Ledger entry created with providerUuid: ${entry.providerUuid}`);
  import_state.LEDGER.push(entry);
  redis.saveLedgerEntries(import_state.LEDGER);
  pushLedgerEntryToSettlementStream(entry).catch((err) => {
    console.error(`\u26A0\uFE0F  Failed to push ledger entry to settlement stream:`, err.message);
  });
  broadcastEvent({
    type: "ledger_entry_added",
    component: "ledger",
    message: `Ledger entry created: ${entry.entryId}`,
    timestamp: Date.now(),
    data: { entry }
  });
  return entry;
}
async function pushLedgerEntryToSettlementStream(entry) {
  if (import_config.SKIP_REDIS || !redis.isOpen) {
    console.log(`\u{1F4E4} [Settlement] Ledger entry ${entry.entryId} queued (Redis disabled)`);
    return;
  }
  try {
    await ensureRedisConnection();
    const iGas = entry.iGasCost;
    const iTax = entry.bookingDetails?.iTax || 0;
    const rootCAFee = entry.fees?.rootCA || iGas * ROOT_CA_FEE;
    const indexerFee = entry.fees?.indexer || iGas * INDEXER_FEE;
    const provider = ROOT_CA_SERVICE_REGISTRY.find((p) => p.uuid === entry.providerUuid);
    const gardenId = provider?.gardenId || "unknown";
    const settlementPayload = {
      entryId: entry.entryId,
      txId: entry.txId,
      timestamp: entry.timestamp.toString(),
      payer: entry.payer,
      payerId: entry.payerId,
      merchant: entry.merchant,
      providerUuid: entry.providerUuid,
      indexerId: gardenId,
      // Legacy field (will be renamed to gardenId in future)
      serviceType: entry.serviceType,
      amount: entry.amount.toString(),
      iGas: iGas.toString(),
      iTax: iTax.toString(),
      fees: JSON.stringify({
        rootCA: rootCAFee,
        indexer: indexerFee,
        ...entry.fees
      }),
      status: entry.status,
      cashierId: entry.cashierId,
      bookingDetails: entry.bookingDetails ? JSON.stringify(entry.bookingDetails) : ""
    };
    await redis.xAdd(LEDGER_SETTLEMENT_STREAM, "*", settlementPayload);
    console.log(`\u{1F4E4} [Settlement] Pushed ledger entry ${entry.entryId} to ROOT CA settlement stream`);
    console.log(`   iGas: ${iGas}, iTax: ${iTax}, ROOT CA Fee: ${rootCAFee}, Indexer Fee: ${indexerFee}`);
    try {
      const { recordFeePayment } = await import("./src/accountant");
      recordFeePayment(
        entry.serviceType,
        iGas,
        iTax,
        rootCAFee,
        indexerFee,
        0
        // providerFee (can be added later if needed)
      );
    } catch (err) {
      console.warn(`\u26A0\uFE0F  [Settlement] Failed to record fee payment in Accountant: ${err.message}`);
    }
    broadcastEvent({
      type: "ledger_entry_pushed",
      component: "settlement",
      message: `Ledger entry pushed to settlement stream: ${entry.entryId}`,
      timestamp: Date.now(),
      data: {
        entryId: entry.entryId,
        iGas,
        iTax,
        fees: settlementPayload.fees,
        rootCAFee,
        indexerFee,
        indexerId: gardenId
        // Legacy field (will be renamed to gardenId in future)
      }
    });
  } catch (err) {
    console.error(`\u274C Failed to push ledger entry to settlement stream:`, err.message);
    throw err;
  }
}
async function processPayment(cashier, entry, user) {
  const walletResult = await (0, import_wallet.processWalletIntent)({
    intent: "DEBIT",
    email: user.email,
    amount: entry.amount,
    txId: entry.txId,
    entryId: entry.entryId,
    reason: `Payment to ${entry.merchant} (${entry.serviceType})`,
    metadata: {
      merchant: entry.merchant,
      serviceType: entry.serviceType,
      cashierId: cashier.id
    }
  });
  if (!walletResult.success) {
    entry.status = "failed";
    const walletBalance = await (0, import_wallet.getWalletBalance)(user.email);
    broadcastEvent({
      type: "cashier_payment_failed",
      component: "cashier",
      message: `Payment failed: ${walletResult.error}`,
      timestamp: Date.now(),
      data: {
        entry,
        cashier,
        error: walletResult.error,
        walletBalance,
        userBalance: user.balance,
        requiredAmount: entry.amount
      }
    });
    return false;
  }
  user.balance = walletResult.balance;
  cashier.processedCount++;
  cashier.totalProcessed += entry.amount;
  entry.status = "processed";
  broadcastEvent({
    type: "cashier_payment_processed",
    component: "cashier",
    message: `${cashier.name} processed payment: ${entry.amount} \u{1F34E} APPLES`,
    timestamp: Date.now(),
    data: { entry, cashier, userBalance: walletResult.balance, walletService: "wallet-service-001" }
  });
  return true;
}
function completeBooking(entry) {
  entry.status = "completed";
  broadcastEvent({
    type: "ledger_booking_completed",
    component: "ledger",
    message: `Booking completed: ${entry.entryId}`,
    timestamp: Date.now(),
    data: { entry }
  });
}
function getLedgerEntries(payerEmail) {
  if (payerEmail) {
    return import_state.LEDGER.filter((entry) => entry.payer === payerEmail);
  }
  return [...import_state.LEDGER];
}
function getTransactionByPayer(payerEmail) {
  return import_state.LEDGER.filter((entry) => entry.payer === payerEmail && entry.status === "completed");
}
function getTransactionBySnapshot(snapshotId) {
  return import_state.LEDGER.find((entry) => entry.txId === snapshotId) || null;
}
function getLatestSnapshot(providerId) {
  const providerEntries = import_state.LEDGER.filter(
    (entry) => entry.merchant === providerId || entry.providerUuid === providerId
  );
  if (providerEntries.length === 0)
    return null;
  return providerEntries.filter((entry) => entry.status === "completed").sort((a, b) => b.timestamp - a.timestamp)[0] || null;
}
async function deliverWebhook(providerId, snapshot, ledgerEntry) {
  const webhook = PROVIDER_WEBHOOKS.get(providerId);
  if (!webhook) {
    return;
  }
  console.log(`\u{1F4E4} [Service Provider] Webhook Delivery Attempt: ${providerId} \u2192 ${webhook.webhookUrl} (TX: ${snapshot.txId.substring(0, 8)}...)`);
  broadcastEvent({
    type: "provider_webhook_attempt",
    component: "service_provider",
    message: `Webhook Delivery Attempt: ${providerId}`,
    timestamp: Date.now(),
    data: {
      providerId,
      txId: snapshot.txId,
      webhookUrl: webhook.webhookUrl
    }
  });
  const payload = JSON.stringify({
    event: "tx-finalized",
    snapshot: {
      chainId: snapshot.chainId,
      txId: snapshot.txId,
      slot: snapshot.slot,
      blockTime: snapshot.blockTime,
      payer: snapshot.payer,
      merchant: snapshot.merchant,
      amount: snapshot.amount,
      feeSplit: snapshot.feeSplit
    },
    ledger: {
      entryId: ledgerEntry.entryId,
      status: ledgerEntry.status,
      serviceType: ledgerEntry.serviceType,
      bookingDetails: ledgerEntry.bookingDetails
    },
    timestamp: Date.now()
  });
  try {
    const parsedUrl = new URL(webhook.webhookUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": payload.length,
        "X-Eden-Event": "tx-finalized",
        "X-Eden-Provider": providerId
      },
      timeout: 5e3
      // 5 second timeout
    };
    const httpModule = parsedUrl.protocol === "https:" ? https : http;
    const req = httpModule.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          webhook.lastDelivery = Date.now();
          webhook.failureCount = 0;
          console.log(`\u2705 [Service Provider] Webhook Delivered: ${providerId} \u2192 HTTP ${res.statusCode} (TX: ${snapshot.txId.substring(0, 8)}...)`);
          broadcastEvent({
            type: "provider_webhook_delivered",
            component: "service_provider",
            message: `Webhook Delivered: ${providerId}`,
            timestamp: Date.now(),
            data: {
              providerId,
              txId: snapshot.txId,
              statusCode: res.statusCode,
              webhookUrl: webhook.webhookUrl
            }
          });
        } else {
          webhook.failureCount++;
          console.warn(`\u274C [Service Provider] Webhook Delivery Failed: ${providerId} \u2192 HTTP ${res.statusCode} (TX: ${snapshot.txId.substring(0, 8)}..., Failures: ${webhook.failureCount})`);
          broadcastEvent({
            type: "provider_webhook_failed",
            component: "service_provider",
            message: `Webhook Delivery Failed: ${providerId}`,
            timestamp: Date.now(),
            data: {
              providerId,
              txId: snapshot.txId,
              statusCode: res.statusCode,
              failureCount: webhook.failureCount,
              webhookUrl: webhook.webhookUrl
            }
          });
        }
      });
    });
    req.on("error", (err) => {
      webhook.failureCount++;
      console.warn(`\u274C [Service Provider] Webhook Delivery Error: ${providerId} \u2192 ${err.message} (TX: ${snapshot.txId.substring(0, 8)}..., Failures: ${webhook.failureCount})`);
      broadcastEvent({
        type: "provider_webhook_failed",
        component: "service_provider",
        message: `Webhook Delivery Error: ${providerId}`,
        timestamp: Date.now(),
        data: {
          providerId,
          txId: snapshot.txId,
          error: err.message,
          failureCount: webhook.failureCount,
          webhookUrl: webhook.webhookUrl
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      webhook.failureCount++;
      console.warn(`\u23F1\uFE0F  [Service Provider] Webhook Delivery Timeout: ${providerId} (TX: ${snapshot.txId.substring(0, 8)}..., Failures: ${webhook.failureCount})`);
      broadcastEvent({
        type: "provider_webhook_failed",
        component: "service_provider",
        message: `Webhook Delivery Timeout: ${providerId}`,
        timestamp: Date.now(),
        data: {
          providerId,
          txId: snapshot.txId,
          error: "timeout",
          failureCount: webhook.failureCount,
          webhookUrl: webhook.webhookUrl
        }
      });
    });
    req.write(payload);
    req.end();
  } catch (err) {
    webhook.failureCount++;
    console.error(`\u274C [Service Provider] Webhook Delivery Exception: ${providerId} \u2192 ${err.message} (TX: ${snapshot.txId.substring(0, 8)}..., Failures: ${webhook.failureCount})`);
    broadcastEvent({
      type: "provider_webhook_failed",
      component: "service_provider",
      message: `Webhook Delivery Exception: ${providerId}`,
      timestamp: Date.now(),
      data: {
        providerId,
        txId: snapshot.txId,
        error: err.message,
        failureCount: webhook.failureCount,
        webhookUrl: webhook.webhookUrl
      }
    });
  }
}
function initializeRootCA() {
  if (!import_state.ROOT_CA) {
    const rootCA = new import_EdenPKI.EdenPKI(import_constants.ROOT_CA_UUID);
    const rootCAIdentity = rootCA.identity;
    (0, import_state.setROOTCA)(rootCA, rootCAIdentity);
    console.log(`\u2696\uFE0F  ROOT CA initialized: ${import_constants.ROOT_CA_UUID}`);
    console.log(`   Public Key: ${rootCAIdentity.publicKey.substring(0, 50)}...`);
    broadcastEvent({
      type: "root_ca_initialized",
      component: "root-ca",
      message: "ROOT CA initialized and ready",
      timestamp: Date.now(),
      data: {
        uuid: import_constants.ROOT_CA_UUID,
        publicKey: import_state.ROOT_CA_IDENTITY.publicKey
      }
    });
  }
}
function revokeCertificate(uuid, reason, revokedType = "provider", severity = "hard", metadata) {
  if (!import_state.ROOT_CA) {
    throw new Error("ROOT CA not initialized");
  }
  const cert = import_state.CERTIFICATE_REGISTRY.get(uuid);
  const certHash = cert ? `sha256:${crypto.createHash("sha256").update(JSON.stringify(cert)).digest("hex")}` : void 0;
  const revocation = import_state.ROOT_CA.revokeIdentity(
    uuid,
    revokedType,
    reason,
    Date.now(),
    // effective_at (immediate)
    certHash,
    severity,
    metadata
  );
  import_state.REVOCATION_REGISTRY.set(uuid, revocation);
  publishRevocationToStream(revocation).catch((err) => {
    console.error(`\u274C Failed to publish revocation to stream:`, err);
  });
  import_state.CERTIFICATE_REGISTRY.delete(uuid);
  const indexer = import_state.GARDENS.find((i) => i.uuid === uuid);
  if (indexer) {
    if (severity === "hard" && revokedType === "indexer") {
      const index = import_state.GARDENS.findIndex((i) => i.uuid === uuid);
      if (index !== -1) {
        import_state.GARDENS.splice(index, 1);
        console.log(`   \u{1F5D1}\uFE0F  Removed garden ${indexer.id} (${indexer.name}) from GARDENS array`);
      }
    } else {
      indexer.active = false;
      indexer.certificate = void 0;
      console.log(`   Indexer ${indexer.name} marked as inactive`);
    }
  }
  const tokenIndexer = import_state.TOKEN_GARDENS.find((i) => i.uuid === uuid);
  if (tokenIndexer) {
    if (severity === "hard" && revokedType === "indexer") {
      const index = import_state.TOKEN_GARDENS.findIndex((i) => i.uuid === uuid);
      if (index !== -1) {
        import_state.TOKEN_GARDENS.splice(index, 1);
        console.log(`   \u{1F5D1}\uFE0F  Removed garden ${tokenIndexer.id} (${tokenIndexer.name}) from TOKEN_GARDENS array`);
      }
    } else {
      tokenIndexer.active = false;
      tokenIndexer.certificate = void 0;
      console.log(`   Token indexer ${tokenIndexer.name} marked as inactive`);
    }
  }
  const provider = ROOT_CA_SERVICE_REGISTRY.find((p) => p.uuid === uuid);
  if (provider) {
    if (severity === "hard" && revokedType === "provider") {
      const index = ROOT_CA_SERVICE_REGISTRY.findIndex((p) => p.uuid === uuid);
      if (index !== -1) {
        ROOT_CA_SERVICE_REGISTRY.splice(index, 1);
        console.log(`   \u{1F5D1}\uFE0F  Removed provider ${provider.id} (${provider.name}) from ROOT_CA_SERVICE_REGISTRY`);
      }
    } else {
      provider.certificate = void 0;
      provider.status = "revoked";
      console.log(`   Service provider ${provider.name} (${provider.id}) marked as revoked`);
      console.log(`   Provider will be filtered out from service queries`);
    }
  }
  console.log(`\u{1F6AB} Certificate revoked: ${uuid}`);
  console.log(`   Type: ${revokedType}`);
  console.log(`   Reason: ${reason}`);
  console.log(`   Severity: ${severity}`);
  broadcastEvent({
    type: "certificate_revoked",
    component: "root-ca",
    message: `Certificate revoked: ${uuid}`,
    timestamp: Date.now(),
    data: {
      revoked_uuid: uuid,
      revoked_type: revokedType,
      reason,
      issuer_uuid: import_constants.ROOT_CA_UUID,
      severity
    }
  });
  return revocation;
}
function revokeCertificateByIndexer(indexerId, revokedUuid, reason, revokedType = "service", severity = "hard", metadata) {
  const indexer = import_state.GARDENS.find((i) => i.id === indexerId || i.uuid === indexerId);
  if (!indexer || !indexer.pki) {
    throw new Error(`Indexer not found or PKI not initialized: ${indexerId}`);
  }
  const indexerCert = import_state.CERTIFICATE_REGISTRY.get(indexer.uuid);
  if (!indexerCert || !indexerCert.capabilities.includes("INDEXER")) {
    throw new Error(`Indexer ${indexerId} does not have INDEXER capability`);
  }
  const testRevocation = {
    revoked_uuid: revokedUuid,
    revoked_type: revokedType,
    issuer_uuid: indexer.uuid,
    reason,
    issued_at: Date.now(),
    effective_at: Date.now(),
    signature: ""
    // Will be set below
  };
  if (!verifyRevocationAuthority(testRevocation)) {
    throw new Error(`Indexer ${indexerId} lacks authority to revoke ${revokedUuid}`);
  }
  const cert = import_state.CERTIFICATE_REGISTRY.get(revokedUuid);
  const certHash = cert ? `sha256:${crypto.createHash("sha256").update(JSON.stringify(cert)).digest("hex")}` : void 0;
  const revocation = indexer.pki.revokeIdentity(
    revokedUuid,
    revokedType,
    reason,
    Date.now(),
    // effective_at (immediate)
    certHash,
    severity,
    metadata
  );
  import_state.REVOCATION_REGISTRY.set(revokedUuid, revocation);
  publishRevocationToStream(revocation).catch((err) => {
    console.error(`\u274C Failed to publish revocation to stream:`, err);
  });
  import_state.CERTIFICATE_REGISTRY.delete(revokedUuid);
  const provider = ROOT_CA_SERVICE_REGISTRY.find((p) => p.uuid === revokedUuid);
  if (provider) {
    provider.certificate = void 0;
    provider.status = "revoked";
    console.log(`   Service provider ${provider.name} (${provider.id}) marked as revoked in ROOT_CA_SERVICE_REGISTRY`);
  }
  console.log(`\u{1F6AB} [${indexer.name}] Certificate revoked: ${revokedUuid}`);
  console.log(`   Type: ${revokedType}`);
  console.log(`   Reason: ${reason}`);
  console.log(`   Severity: ${severity}`);
  broadcastEvent({
    type: "certificate_revoked",
    component: indexer.name.toLowerCase().replace(/\s+/g, "-"),
    message: `Certificate revoked by ${indexer.name}: ${revokedUuid}`,
    timestamp: Date.now(),
    data: {
      revoked_uuid: revokedUuid,
      revoked_type: revokedType,
      reason,
      issuer_uuid: indexer.uuid,
      severity
    }
  });
  return revocation;
}
async function publishRevocationToStream(revocation) {
  try {
    const streamFields = {
      revoked_uuid: revocation.revoked_uuid,
      revoked_type: revocation.revoked_type,
      issuer_uuid: revocation.issuer_uuid,
      reason: revocation.reason,
      issued_at: revocation.issued_at.toString(),
      effective_at: revocation.effective_at.toString(),
      signature: revocation.signature
    };
    if (revocation.cert_hash) {
      streamFields.cert_hash = revocation.cert_hash;
    }
    if (revocation.severity) {
      streamFields.severity = revocation.severity;
    }
    if (revocation.metadata) {
      streamFields.metadata = JSON.stringify(revocation.metadata);
    }
    const streamId = await redis.xAdd(import_constants.REVOCATION_STREAM, "*", streamFields);
    console.log(`\u{1F4E4} Published revocation to stream: ${streamId}`);
    broadcastEvent({
      type: "revocation_published",
      component: "root-ca",
      message: `Revocation published to stream`,
      timestamp: Date.now(),
      data: { streamId, revocation }
    });
  } catch (err) {
    console.error(`\u274C Failed to publish revocation to Redis stream:`, err);
    throw err;
  }
}
function validateCertificate(uuid) {
  const cert = import_state.CERTIFICATE_REGISTRY.get(uuid);
  if (!cert) {
    return false;
  }
  if (import_state.REVOCATION_REGISTRY.has(uuid)) {
    return false;
  }
  if (!import_state.ROOT_CA_IDENTITY) {
    return false;
  }
  return import_EdenPKI.EdenPKI.validateCertificate(cert, import_state.ROOT_CA_IDENTITY.publicKey);
}
function getCertificate(uuid) {
  return import_state.CERTIFICATE_REGISTRY.get(uuid);
}
function getAllCertificates() {
  return Array.from(import_state.CERTIFICATE_REGISTRY.values());
}
function getRevokedCertificates() {
  return Array.from(import_state.REVOCATION_REGISTRY.values());
}
async function initializeRevocationConsumers() {
  try {
    for (const indexer of import_state.GARDENS) {
      if (indexer.active) {
        const consumerGroup = `indexer-${indexer.id}`;
        try {
          await redis.xGroupCreate(import_constants.REVOCATION_STREAM, consumerGroup, "0", { MKSTREAM: true });
          console.log(`\u2705 Created revocation consumer group: ${consumerGroup}`);
        } catch (err) {
          if (!err.message?.includes("BUSYGROUP")) {
            console.warn(`\u26A0\uFE0F  Failed to create consumer group ${consumerGroup}:`, err.message);
          }
        }
      }
    }
  } catch (err) {
    console.error(`\u274C Failed to initialize revocation consumers:`, err);
  }
}
async function processRevocationStream(indexerName, indexerId) {
  const consumerGroup = `indexer-${indexerId}`;
  const consumerName = `${indexerName}-consumer`;
  try {
    while (true) {
      try {
        const messages = await redis.xReadGroup(
          consumerGroup,
          consumerName,
          [
            {
              key: import_constants.REVOCATION_STREAM,
              id: ">"
              // Read new messages
            }
          ],
          {
            COUNT: 10,
            BLOCK: 1e3
            // Block for 1 second
          }
        );
        if (messages && messages.length > 0) {
          for (const stream of messages) {
            for (const message of stream.messages) {
              await processRevocationMessage(message, indexerName);
              await redis.xAck(import_constants.REVOCATION_STREAM, consumerGroup, message.id);
            }
          }
        }
      } catch (err) {
        if (err.message?.includes("NOGROUP")) {
          try {
            await redis.xGroupCreate(import_constants.REVOCATION_STREAM, consumerGroup, "0", { MKSTREAM: true });
            console.log(`\u2705 Created consumer group ${consumerGroup} for ${indexerName}`);
          } catch (createErr) {
            console.error(`\u274C Failed to create consumer group:`, createErr);
          }
        } else {
          console.error(`\u274C Error reading revocation stream:`, err);
        }
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  } catch (err) {
    console.error(`\u274C Revocation stream processor error for ${indexerName}:`, err);
  }
}
async function processRevocationMessage(message, indexerName) {
  try {
    const fields = message.message;
    const revocation = {
      revoked_uuid: fields.revoked_uuid,
      revoked_type: fields.revoked_type,
      issuer_uuid: fields.issuer_uuid,
      reason: fields.reason,
      issued_at: parseInt(fields.issued_at),
      effective_at: parseInt(fields.effective_at),
      signature: fields.signature,
      cert_hash: fields.cert_hash,
      severity: fields.severity,
      metadata: fields.metadata ? JSON.parse(fields.metadata) : void 0
    };
    const issuerCert = import_state.CERTIFICATE_REGISTRY.get(revocation.issuer_uuid);
    if (!issuerCert) {
      console.warn(`\u26A0\uFE0F  Cannot verify revocation: issuer certificate not found for ${revocation.issuer_uuid}`);
      return;
    }
    const hasAuthority = verifyRevocationAuthority(revocation);
    if (!hasAuthority) {
      console.warn(`\u26A0\uFE0F  Revocation rejected: issuer ${revocation.issuer_uuid} lacks authority to revoke ${revocation.revoked_uuid}`);
      return;
    }
    let issuerPublicKey;
    if (revocation.issuer_uuid === import_constants.ROOT_CA_UUID) {
      if (!import_state.ROOT_CA_IDENTITY) {
        console.warn(`\u26A0\uFE0F  ROOT CA identity not initialized`);
        return;
      }
      issuerPublicKey = import_state.ROOT_CA_IDENTITY.publicKey;
    } else {
      const issuerIndexer = import_state.GARDENS.find((i) => i.uuid === revocation.issuer_uuid);
      if (issuerIndexer && issuerIndexer.pki) {
        issuerPublicKey = issuerIndexer.pki.identity.publicKey;
      } else {
        console.warn(`\u26A0\uFE0F  Cannot verify indexer revocation: indexer PKI not found for ${revocation.issuer_uuid}`);
        return;
      }
    }
    const isValid = import_EdenPKI.EdenPKI.validateRevocation(revocation, issuerPublicKey);
    if (!isValid) {
      console.warn(`\u26A0\uFE0F  Revocation signature invalid for ${revocation.revoked_uuid}`);
      return;
    }
    const now = Date.now();
    if (now >= revocation.effective_at) {
      import_state.REVOCATION_REGISTRY.set(revocation.revoked_uuid, revocation);
      const indexer = import_state.GARDENS.find((i) => i.uuid === revocation.revoked_uuid);
      if (indexer) {
        indexer.active = false;
        indexer.certificate = void 0;
        if (revocation.severity === "hard" && revocation.revoked_type === "indexer") {
          const index = import_state.GARDENS.findIndex((i) => i.uuid === revocation.revoked_uuid);
          if (index !== -1) {
            import_state.GARDENS.splice(index, 1);
            console.log(`   \u{1F5D1}\uFE0F  Removed garden ${indexer.id} (${indexer.name}) from GARDENS array`);
          }
        }
      }
      const tokenIndexer = import_state.TOKEN_GARDENS.find((i) => i.uuid === revocation.revoked_uuid);
      if (tokenIndexer) {
        tokenIndexer.active = false;
        tokenIndexer.certificate = void 0;
        if (revocation.severity === "hard" && revocation.revoked_type === "indexer") {
          const index = import_state.TOKEN_GARDENS.findIndex((i) => i.uuid === revocation.revoked_uuid);
          if (index !== -1) {
            import_state.TOKEN_GARDENS.splice(index, 1);
            console.log(`   \u{1F5D1}\uFE0F  Removed garden ${tokenIndexer.id} (${tokenIndexer.name}) from TOKEN_GARDENS array`);
          }
        }
      }
      const provider = ROOT_CA_SERVICE_REGISTRY.find((p) => p.uuid === revocation.revoked_uuid);
      if (provider) {
        provider.certificate = void 0;
        provider.status = "revoked";
        console.log(`   Service provider ${provider.name} (${provider.id}) marked as revoked in ROOT_CA_SERVICE_REGISTRY`);
        if (revocation.severity === "hard" && revocation.revoked_type === "provider") {
          const index = ROOT_CA_SERVICE_REGISTRY.findIndex((p) => p.uuid === revocation.revoked_uuid);
          if (index !== -1) {
            ROOT_CA_SERVICE_REGISTRY.splice(index, 1);
            console.log(`   \u{1F5D1}\uFE0F  Removed provider ${provider.id} (${provider.name}) from ROOT_CA_SERVICE_REGISTRY`);
          }
        }
      }
      console.log(`\u{1F6AB} [${indexerName}] Applied revocation: ${revocation.revoked_uuid}`);
      console.log(`   Reason: ${revocation.reason}`);
      broadcastEvent({
        type: "revocation_applied",
        component: indexerName,
        message: `Revocation applied: ${revocation.revoked_uuid}`,
        timestamp: Date.now(),
        data: { revocation }
      });
    } else {
      console.log(`\u23F3 [${indexerName}] Revocation scheduled for future: ${revocation.revoked_uuid}`);
    }
  } catch (err) {
    console.error(`\u274C Failed to process revocation message:`, err);
  }
}
function verifyRevocationAuthority(revocation) {
  if (revocation.issuer_uuid === import_constants.ROOT_CA_UUID) {
    return true;
  }
  const issuerIndexer = import_state.GARDENS.find((i) => i.uuid === revocation.issuer_uuid);
  if (issuerIndexer && revocation.revoked_type === "service") {
    const issuerCert = import_state.CERTIFICATE_REGISTRY.get(revocation.issuer_uuid);
    if (!issuerCert || !issuerCert.capabilities.includes("INDEXER")) {
      return false;
    }
    const revokedProvider = ROOT_CA_SERVICE_REGISTRY.find((p) => p.uuid === revocation.revoked_uuid);
    if (revokedProvider) {
      if (revokedProvider.gardenId === `garden-${issuerIndexer.id.toLowerCase()}` || revokedProvider.gardenId === issuerIndexer.id) {
        return true;
      }
      const providerCert = import_state.CERTIFICATE_REGISTRY.get(revocation.revoked_uuid);
      if (providerCert && providerCert.issuer === revocation.issuer_uuid) {
        return true;
      }
    }
  }
  return false;
}
function createSnapshot(userEmail, amount, providerId) {
  const txId = crypto.randomUUID();
  const rootFee = amount * ROOT_CA_FEE;
  const indexerFee = amount * INDEXER_FEE;
  return {
    chainId: CHAIN_ID,
    txId,
    slot: Math.floor(Math.random() * 1e6),
    blockTime: Date.now(),
    payer: userEmail,
    // Use email address directly as payer
    merchant: providerId,
    amount,
    feeSplit: {
      rootCA: rootFee,
      indexerA: indexerFee,
      indexerB: indexerFee
    }
  };
}
async function persistSnapshot(snapshot) {
  if (import_config.SKIP_REDIS || !redis.isOpen) {
    console.log(`\u{1F4BE} Snapshot (mock): ${snapshot.txId}`);
    return;
  }
  try {
    await ensureRedisConnection();
    await redis.hSet(`tx:${snapshot.txId}`, snapshot);
    console.log(`\u{1F4BE} Snapshot persisted: ${snapshot.txId}`);
  } catch (err) {
    console.error(`\u26A0\uFE0F  Failed to persist snapshot ${snapshot.txId}:`, err.message);
  }
}
async function streamToIndexers(snapshot) {
  if (import_config.SKIP_REDIS || !redis.isOpen) {
    const indexerNames = import_state.GARDENS.filter((i) => i.active).map((i) => i.name).join(", ");
    const tokenIndexerNames = import_state.TOKEN_GARDENS.filter((i) => i.active).map((i) => i.name).join(", ");
    const allNames = [indexerNames, tokenIndexerNames].filter((n) => n).join(", ");
    console.log(`\u{1F4E1} Stream (mock): ${snapshot.txId} \u2192 ${allNames}`);
    return;
  }
  try {
    await ensureRedisConnection();
    const payload = {
      txId: snapshot.txId,
      slot: snapshot.slot.toString(),
      blockTime: snapshot.blockTime.toString(),
      payer: snapshot.payer,
      amount: snapshot.amount.toString()
    };
    const activeIndexers = import_state.GARDENS.filter((i) => i.active);
    for (const indexer of activeIndexers) {
      await redis.xAdd(indexer.stream, "*", payload);
    }
    const activeTokenIndexers = import_state.TOKEN_GARDENS.filter((i) => i.active);
    for (const tokenIndexer of activeTokenIndexers) {
      await redis.xAdd(tokenIndexer.stream, "*", payload);
    }
    const indexerNames = activeIndexers.map((i) => i.name).join(", ");
    const tokenIndexerNames = activeTokenIndexers.map((i) => i.name).join(", ");
    const allNames = [indexerNames, tokenIndexerNames].filter((n) => n).join(", ");
    console.log(`\u{1F4E1} Streamed to indexers: ${snapshot.txId} \u2192 ${allNames}`);
    if (activeIndexers.length > 0) {
      console.log(`   \u{1F4E1} Regular indexers: ${indexerNames}`);
    }
    if (activeTokenIndexers.length > 0) {
      console.log(`   \u{1F537} Token indexers: ${tokenIndexerNames}`);
    }
    if (activeIndexers.length > 0) {
      broadcastEvent({
        type: "indexer_stream",
        component: "indexer",
        message: `Streamed transaction to ${activeIndexers.length} regular indexer(s)`,
        timestamp: Date.now(),
        data: { txId: snapshot.txId, indexers: activeIndexers.map((i) => i.name), count: activeIndexers.length }
      });
    }
    if (activeTokenIndexers.length > 0) {
      console.log(`\u{1F537} [Token Indexer] Streamed transaction ${snapshot.txId} to ${activeTokenIndexers.length} token indexer(s): ${tokenIndexerNames}`);
      broadcastEvent({
        type: "token_indexer_stream",
        component: "token_indexer",
        message: `Streamed transaction to ${activeTokenIndexers.length} token indexer(s)`,
        timestamp: Date.now(),
        data: { txId: snapshot.txId, indexers: activeTokenIndexers.map((i) => i.name), count: activeTokenIndexers.length }
      });
    }
  } catch (err) {
    console.error(`\u26A0\uFE0F  Failed to stream to indexers:`, err.message);
  }
}
const consumerPositions = /* @__PURE__ */ new Map();
async function gardenConsumer(name, stream) {
  if (import_config.SKIP_REDIS) {
    console.log(`\u26A0\uFE0F  ${name}: Skipped (Redis disabled)`);
    return;
  }
  try {
    await ensureRedisConnection();
  } catch (err) {
    console.error(`\u274C ${name}: Cannot start - Redis unavailable`);
    return;
  }
  const consumerKey = `${name}:${stream}`;
  let lastReadId = consumerPositions.get(consumerKey) || "$";
  while (true) {
    try {
      if (!redis.isOpen) {
        await ensureRedisConnection();
      }
      const res = await redis.xRead(
        [{ key: stream, id: lastReadId }],
        { BLOCK: 5e3, COUNT: 1 }
      );
      if (!res) {
        await new Promise((resolve) => setImmediate(resolve));
        continue;
      }
      const streamResults = res;
      if (Array.isArray(streamResults) && streamResults.length > 0) {
        const streamResult = streamResults[0];
        if (streamResult?.messages && streamResult.messages.length > 0) {
          for (const msg of streamResult.messages) {
            const txId = msg.message?.txId;
            if (txId) {
              const isTokenIndexer = name.toLowerCase().includes("tokenindexer") || name.toLowerCase().startsWith("token");
              const eventType = isTokenIndexer ? "token_indexer_indexed" : "indexer_indexed";
              const icon = isTokenIndexer ? "\u{1F537}" : "\u{1F4E1}";
              if (isTokenIndexer) {
                console.log(`\u{1F537} [Token Indexer] ${name} indexed transaction ${txId}`);
              } else {
                console.log(`\u{1F4E1} [Indexer] ${name} indexed transaction ${txId}`);
              }
              broadcastEvent({
                type: eventType,
                component: name.toLowerCase().replace(/\s+/g, "-"),
                message: `${name} indexed transaction ${txId}`,
                timestamp: Date.now(),
                data: { txId, indexer: name, isTokenIndexer }
              });
            }
            lastReadId = msg.id;
          }
          consumerPositions.set(consumerKey, lastReadId);
        }
      }
    } catch (err) {
      if (err.message.includes("Connection")) {
        console.error(`\u274C ${name}: Connection lost, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 2e3));
      } else {
        console.error(`\u26A0\uFE0F  ${name}: Error reading stream:`, err.message);
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}
async function rootCASettlementConsumer() {
  if (import_config.SKIP_REDIS) {
    console.log(`\u26A0\uFE0F  ROOT CA Settlement Consumer: Skipped (Redis disabled)`);
    return;
  }
  try {
    await ensureRedisConnection();
  } catch (err) {
    console.error(`\u274C ROOT CA Settlement Consumer: Cannot start - Redis unavailable`);
    return;
  }
  const consumerGroup = "root-ca-settlement";
  const consumerName = "root-ca-settlement-worker";
  try {
    await redis.xGroupCreate(LEDGER_SETTLEMENT_STREAM, consumerGroup, "$", { MKSTREAM: true });
    console.log(`\u2705 Created ROOT CA settlement consumer group: ${consumerGroup}`);
  } catch (err) {
    if (!err.message.includes("BUSYGROUP")) {
      console.error(`\u26A0\uFE0F  Failed to create consumer group:`, err.message);
    }
  }
  console.log(`\u2696\uFE0F  [ROOT CA Settlement] Starting settlement consumer...`);
  broadcastEvent({
    type: "settlement_consumer_started",
    component: "root-ca",
    message: "ROOT CA Settlement Consumer started",
    timestamp: Date.now(),
    data: {
      consumerGroup,
      consumerName,
      stream: LEDGER_SETTLEMENT_STREAM
    }
  });
  while (true) {
    try {
      if (!redis.isOpen) {
        await ensureRedisConnection();
      }
      const res = await redis.xReadGroup(
        consumerGroup,
        consumerName,
        [{ key: LEDGER_SETTLEMENT_STREAM, id: ">" }],
        { BLOCK: 5e3, COUNT: 10 }
      );
      if (!res) {
        await new Promise((resolve) => setImmediate(resolve));
        continue;
      }
      const streamResults = res;
      if (Array.isArray(streamResults) && streamResults.length > 0) {
        const streamResult = streamResults[0];
        if (streamResult?.messages && streamResult.messages.length > 0) {
          const messageCount = streamResults[0].messages.length;
          console.log(`\u2696\uFE0F  [ROOT CA Settlement] Processing ${messageCount} settlement entry/entries`);
          broadcastEvent({
            type: "settlement_batch_processing",
            component: "root-ca",
            message: `Processing ${messageCount} settlement entry/entries`,
            timestamp: Date.now(),
            data: { count: messageCount }
          });
          for (const msg of streamResults[0].messages) {
            try {
              await processSettlementEntry(msg.message);
              await redis.xAck(LEDGER_SETTLEMENT_STREAM, consumerGroup, msg.id);
            } catch (err) {
              console.error(`\u274C Failed to process settlement entry ${msg.id}:`, err.message);
              broadcastEvent({
                type: "settlement_processing_error",
                component: "root-ca",
                message: `Failed to process settlement entry: ${msg.id}`,
                timestamp: Date.now(),
                data: {
                  entryId: msg.message.entryId || msg.id,
                  error: err.message
                }
              });
            }
          }
        }
      }
    } catch (err) {
      if (err.message.includes("Connection")) {
        console.error(`\u274C ROOT CA Settlement: Connection lost, retrying...`);
        broadcastEvent({
          type: "settlement_connection_error",
          component: "root-ca",
          message: "ROOT CA Settlement: Connection lost, retrying...",
          timestamp: Date.now(),
          data: { error: err.message }
        });
        await new Promise((resolve) => setTimeout(resolve, 2e3));
      } else {
        console.error(`\u26A0\uFE0F  ROOT CA Settlement: Error reading stream:`, err.message);
        broadcastEvent({
          type: "settlement_stream_error",
          component: "root-ca",
          message: `ROOT CA Settlement: Error reading stream`,
          timestamp: Date.now(),
          data: { error: err.message }
        });
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}
async function processSettlementEntry(msg) {
  const entryId = msg.entryId;
  const iGas = parseFloat(msg.iGas || "0");
  const iTax = parseFloat(msg.iTax || "0");
  const fees = JSON.parse(msg.fees || "{}");
  const indexerId = msg.indexerId || "unknown";
  const providerUuid = msg.providerUuid || "";
  console.log(`\u2696\uFE0F  [ROOT CA Settlement] Processing entry ${entryId}`);
  console.log(`   iGas: ${iGas}, iTax: ${iTax}, Indexer: ${indexerId}`);
  broadcastEvent({
    type: "settlement_processing_start",
    component: "root-ca",
    message: `Processing settlement entry: ${entryId}`,
    timestamp: Date.now(),
    data: {
      entryId,
      iGas,
      iTax,
      indexerId
    }
  });
  const ledgerEntry = import_state.LEDGER.find((e) => e.entryId === entryId);
  if (!ledgerEntry) {
    console.warn(`\u26A0\uFE0F  Settlement entry ${entryId} not found in local ledger`);
    broadcastEvent({
      type: "settlement_entry_not_found",
      component: "root-ca",
      message: `Settlement entry not found in local ledger: ${entryId}`,
      timestamp: Date.now(),
      data: { entryId }
    });
    return;
  }
  if (providerUuid && providerUuid !== "MISSING-UUID") {
    const cert = getCertificate(providerUuid);
    if (!cert || !validateCertificate(providerUuid)) {
      console.error(`\u274C Settlement entry ${entryId}: Invalid certificate for provider ${providerUuid}`);
      ledgerEntry.status = "failed";
      broadcastEvent({
        type: "settlement_certificate_invalid",
        component: "root-ca",
        message: `Invalid certificate for provider: ${providerUuid}`,
        timestamp: Date.now(),
        data: {
          entryId,
          providerUuid
        }
      });
      return;
    }
  }
  const expectedRootCAFee = fees.rootCA || iGas * ROOT_CA_FEE;
  const expectedIndexerFee = fees.indexer || iGas * INDEXER_FEE;
  ROOT_BALANCES.rootCA += expectedRootCAFee;
  if (iTax > 0) {
    const iTaxRootCA = iTax * ITAX_DISTRIBUTION.rootCA;
    ROOT_BALANCES.rootCA += iTaxRootCA;
    const currentIndexerBalance = ROOT_BALANCES.indexers.get(indexerId) || 0;
    const iTaxIndexer = iTax * ITAX_DISTRIBUTION.indexer;
    ROOT_BALANCES.indexers.set(indexerId, currentIndexerBalance + expectedIndexerFee + iTaxIndexer);
  } else {
    const currentIndexerBalance = ROOT_BALANCES.indexers.get(indexerId) || 0;
    ROOT_BALANCES.indexers.set(indexerId, currentIndexerBalance + expectedIndexerFee);
  }
  if (providerUuid && providerUuid !== "MISSING-UUID") {
    const currentProviderBalance = ROOT_BALANCES.providers.get(providerUuid) || 0;
    const providerFee = fees.provider || 0;
    ROOT_BALANCES.providers.set(providerUuid, currentProviderBalance + providerFee);
  }
  ledgerEntry.status = "completed";
  if (redis) {
    console.log(`\u{1F4BE} [ROOT CA Settlement] Persisting ledger entry with completed status: ${entryId}`);
    redis.saveLedgerEntries(import_state.LEDGER);
  } else {
    console.warn(`\u26A0\uFE0F  [ROOT CA Settlement] Redis not available, cannot persist completed status for entry: ${entryId}`);
  }
  console.log(`\u2705 [ROOT CA Settlement] Entry ${entryId} settled and persisted`);
  console.log(`   ROOT CA Balance: ${ROOT_BALANCES.rootCA.toFixed(6)}`);
  console.log(`   Indexer ${indexerId} Balance: ${ROOT_BALANCES.indexers.get(indexerId)?.toFixed(6) || "0"}`);
  broadcastEvent({
    type: "ledger_entry_settled",
    component: "root-ca",
    message: `Ledger entry settled: ${entryId}`,
    timestamp: Date.now(),
    data: {
      entryId,
      iGas,
      iTax,
      rootCABalance: ROOT_BALANCES.rootCA,
      indexerBalance: ROOT_BALANCES.indexers.get(indexerId) || 0,
      fees,
      status: "completed"
    }
  });
}
async function applyReview(user, review, moviePrice) {
  if (review.rating >= 4) {
    const rebate = moviePrice * 0.1;
    const rebateResult = await (0, import_wallet.creditWallet)(
      user.email,
      rebate,
      crypto.randomUUID(),
      `Review rebate: ${review.rating}/5 rating`,
      {
        reviewRating: review.rating,
        moviePrice,
        rebateType: "review"
      }
    );
    if (rebateResult.success) {
      user.balance = rebateResult.balance;
    }
    return rebate;
  }
  return 0;
}
async function processMovieWatchingAction(processedAction, updatedContext2, broadcastEvent2) {
  console.log(`\u{1F3AC} [Movie Theater] Starting movie watching simulation`);
  const movieTitle = processedAction.movieTitle || updatedContext2.selectedListing?.movieTitle || "Unknown Movie";
  const duration = processedAction.duration || 10;
  broadcastEvent2({
    type: "movie_started",
    component: "movie_theater",
    message: `Now playing: ${movieTitle}`,
    timestamp: Date.now(),
    data: {
      movieTitle,
      duration,
      currentScene: "garden"
    }
  });
  updatedContext2.movieStarted = true;
  updatedContext2.movieTitle = movieTitle;
  updatedContext2.movieProgress = 0;
  updatedContext2.currentScene = "garden";
  await new Promise((resolve) => {
    setTimeout(() => {
      setTimeout(() => {
        updatedContext2.movieProgress = 30;
        updatedContext2.currentScene = "cross";
        broadcastEvent2({
          type: "scene_transition",
          component: "movie_theater",
          message: "Transitioning to the Cross scene",
          timestamp: Date.now(),
          data: { scene: "cross", progress: 30 }
        });
      }, duration * 1e3 * 0.3);
      setTimeout(() => {
        updatedContext2.movieProgress = 60;
        updatedContext2.currentScene = "utah_action";
        broadcastEvent2({
          type: "scene_transition",
          component: "movie_theater",
          message: "Initiating Utah Action Consensus",
          timestamp: Date.now(),
          data: { scene: "utah_action", progress: 60 }
        });
      }, duration * 1e3 * 0.6);
      setTimeout(() => {
        updatedContext2.movieProgress = 90;
        updatedContext2.currentScene = "garden_return";
        broadcastEvent2({
          type: "scene_transition",
          component: "movie_theater",
          message: "Fading to white for the Garden return",
          timestamp: Date.now(),
          data: { scene: "garden_return", progress: 90 }
        });
      }, duration * 1e3 * 0.9);
      setTimeout(() => {
        updatedContext2.movieWatched = true;
        updatedContext2.movieProgress = 100;
        updatedContext2.finalScene = "genesis_garden";
        broadcastEvent2({
          type: "movie_finished",
          component: "movie_theater",
          message: "Movie finished. Returning to Garden Genesis state.",
          timestamp: Date.now(),
          data: { completed: true, finalScene: "genesis_garden" }
        });
        console.log(`\u{1F3AC} [Movie Theater] Movie finished, context updated with movieWatched: true`);
        console.log(`\u{1F3AC} [Movie Theater] Context keys:`, Object.keys(updatedContext2));
        resolve();
      }, duration * 1e3);
    }, 100);
  });
}
async function processChatInput(input, email) {
  const startTime = Date.now();
  console.log(`\u{1F680} Starting processChatInput for ${email}: "${input.substring(0, 50)}${input.length > 50 ? "..." : ""}"`);
  try {
    let user = USERS.find((u) => u.email === email);
    if (!user) {
      const nextId = `u${USERS.length + 1}`;
      user = {
        id: nextId,
        // Sequential ID matching existing format (u1, u2, u3...)
        email,
        balance: 0
        // NO PRE-LOAD - Wallet is source of truth, starts at 0
      };
      USERS.push(user);
      console.log(`\u{1F464} Created new user: ${email} with ID: ${nextId}`);
    }
    const currentWalletBalance = await (0, import_wallet.getWalletBalance)(email);
    user.balance = currentWalletBalance;
    if (email === "bill.draper.auto@gmail.com" && !import_config.SKIP_REDIS && redis.isOpen) {
      try {
        await ensureRedisConnection();
        const walletKey = `${import_constants.WALLET_BALANCE_PREFIX}${email}`;
        const existingBalance = await redis.get(walletKey);
        const hasStripeMint = import_state.LEDGER.some(
          (entry) => entry.serviceType === "mint" && entry.merchant === email && entry.bookingDetails?.stripePaymentIntentId
        );
        if (existingBalance && parseFloat(existingBalance) > 0 && !hasStripeMint) {
          console.log(`\u{1F504} Clearing pre-loaded balance for ${email}: ${existingBalance} JSC \u2192 0 JSC`);
          await redis.set(walletKey, "0");
          user.balance = 0;
        }
      } catch (err) {
        console.warn(`\u26A0\uFE0F  Could not clear pre-loaded balance:`, err.message);
      }
    }
    console.log("1\uFE0F\u20E3 User Input");
    broadcastEvent({
      type: "user_input",
      component: "user",
      message: `User query: "${input}"`,
      timestamp: Date.now(),
      data: { input, email: user.email }
    });
    console.log("2\uFE0F\u20E3 LLM Resolution (Query \u2192 ServiceRegistry \u2192 Providers \u2192 Format)");
    broadcastEvent({
      type: "llm_start",
      component: "llm",
      message: "Starting LLM query extraction...",
      timestamp: Date.now()
    });
    throw new Error("resolveLLM is disabled - use formatResponseWithOpenAI/formatResponseWithDeepSeek directly via workflow actions");
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`\u274C processChatInput failed after ${duration}ms for ${email}:`, error);
    throw error;
  }
}
async function generateSystemPrompts(description, serviceType) {
  const prompt = `Generate system prompts for an Eden service provider.

Service Type: ${serviceType}
Description: ${description}

Generate two prompts:
1. Query Extraction Prompt: Instructions for extracting user intent from natural language queries
2. Response Formatting Prompt: Instructions for formatting provider responses

IMPORTANT: In all generated prompts and responses, use "\u{1F34E} APPLES" as the currency name instead of "JSC" or "JesusCoin". All user-facing messages about prices, payments, and transactions should display "\u{1F34E} APPLES".

Return JSON with:
{
  "queryExtractionPrompt": "...",
  "responseFormattingPrompt": "...",
  "metadata": {
    "description": "${description}",
    "serviceType": "${serviceType}",
    "requiredFields": [...],
    "ledgerFields": [...]
  }
}`;
  if (import_config.MOCKED_LLM) {
    return {
      queryExtractionPrompt: `You are Eden Core AI query processor for ${serviceType} services.
Extract service query from user input.
Return JSON only with: query (object with serviceType and filters), serviceType, confidence.`,
      responseFormattingPrompt: `You are Eden Core AI response formatter for ${serviceType} services.
Format service provider listings into user-friendly chat response.`,
      metadata: {
        description,
        serviceType,
        requiredFields: [],
        ledgerFields: []
      },
      generatedAt: Date.now(),
      generatedBy: import_constants.ROOT_CA_UUID,
      iGasCost: 25e-4,
      version: 1
    };
  }
  try {
    const hasOpenAIKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== "";
    const hasDeepSeekKey = process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim() !== "";
    if (!hasOpenAIKey && !hasDeepSeekKey) {
      console.warn(`\u26A0\uFE0F  No LLM API keys found, using mocked response`);
      return {
        queryExtractionPrompt: `You are Eden Core AI query processor for ${serviceType} services.
Extract service query from user input.
Return JSON only with: query (object with serviceType and filters), serviceType, confidence.`,
        responseFormattingPrompt: `You are Eden Core AI response formatter for ${serviceType} services.
Format service provider listings into user-friendly chat response.`,
        metadata: {
          description,
          serviceType,
          requiredFields: [],
          ledgerFields: []
        },
        generatedAt: Date.now(),
        generatedBy: import_constants.ROOT_CA_UUID,
        iGasCost: 25e-4,
        version: 1
      };
    }
    const response = await (0, import_llm2.callLLM)(prompt, import_config.ENABLE_OPENAI && hasOpenAIKey);
    const parsed = JSON.parse(response);
    return {
      ...parsed,
      generatedAt: Date.now(),
      generatedBy: import_constants.ROOT_CA_UUID,
      iGasCost: 25e-4,
      version: 1
    };
  } catch (err) {
    console.error(`\u274C Failed to generate system prompts:`, err.message);
    console.warn(`\u26A0\uFE0F  Falling back to mocked response due to error`);
    return {
      queryExtractionPrompt: `You are Eden Core AI query processor for ${serviceType} services.
Extract service query from user input.
Return JSON only with: query (object with serviceType and filters), serviceType, confidence.`,
      responseFormattingPrompt: `You are Eden Core AI response formatter for ${serviceType} services.
Format service provider listings into user-friendly chat response.`,
      metadata: {
        description,
        serviceType,
        requiredFields: [],
        ledgerFields: []
      },
      generatedAt: Date.now(),
      generatedBy: import_constants.ROOT_CA_UUID,
      iGasCost: 25e-4,
      version: 1
    };
  }
}
async function generateNotificationCode(config) {
  const prompt = `Generate notification code for an Eden service provider integration.

Provider ID: ${config.providerId}
Provider Name: ${config.providerName}
Language: ${config.language}
Framework: ${config.framework}
Indexer Endpoint: ${config.indexerEndpoint}
Webhook URL: ${config.webhookUrl}
Service Type: ${config.serviceType}
Notification Methods: ${config.notificationMethods.join(", ")}

Generate code that implements:
1. Webhook receiver (if webhook in methods)
2. Pull/poll client (if pull in methods)
3. RPC client (if rpc in methods)

Return JSON with:
{
  "webhookCode": "...",
  "pullCode": "...",
  "rpcCode": "...",
  "readme": "..."
}`;
  if (import_config.MOCKED_LLM) {
    return {
      webhookCode: `// Webhook receiver for ${config.providerId}
// POST ${config.webhookUrl}`,
      pullCode: `// Pull/poll client for ${config.providerId}
// Poll ${config.indexerEndpoint}/rpc/tx/status`,
      rpcCode: `// RPC client for ${config.providerId}
// GET ${config.indexerEndpoint}/rpc/getTransactionByPayer`,
      readme: `# ${config.providerName} Integration

This code implements ${config.notificationMethods.join(", ")} notification methods.`,
      generatedAt: Date.now(),
      generatedBy: import_constants.ROOT_CA_UUID,
      iGasCost: 4e-3,
      version: 1
    };
  }
  try {
    const hasOpenAIKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== "";
    const hasDeepSeekKey = process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim() !== "";
    if (!hasOpenAIKey && !hasDeepSeekKey) {
      console.warn(`\u26A0\uFE0F  No LLM API keys found, using mocked response`);
      return {
        webhookCode: `// Webhook receiver for ${config.providerId}
// POST ${config.webhookUrl}`,
        pullCode: `// Pull/poll client for ${config.providerId}
// Poll ${config.indexerEndpoint}/rpc/tx/status`,
        rpcCode: `// RPC client for ${config.providerId}
// GET ${config.indexerEndpoint}/rpc/getTransactionByPayer`,
        readme: `# ${config.providerName} Integration

This code implements ${config.notificationMethods.join(", ")} notification methods.`,
        generatedAt: Date.now(),
        generatedBy: import_constants.ROOT_CA_UUID,
        iGasCost: 4e-3,
        version: 1
      };
    }
    const response = await (0, import_llm2.callLLM)(prompt, import_config.ENABLE_OPENAI && hasOpenAIKey);
    const parsed = JSON.parse(response);
    return {
      ...parsed,
      generatedAt: Date.now(),
      generatedBy: import_constants.ROOT_CA_UUID,
      iGasCost: 4e-3,
      version: 1
    };
  } catch (err) {
    console.error(`\u274C Failed to generate notification code:`, err.message);
    console.warn(`\u26A0\uFE0F  Falling back to mocked response due to error`);
    return {
      webhookCode: `// Webhook receiver for ${config.providerId}
// POST ${config.webhookUrl}`,
      pullCode: `// Pull/poll client for ${config.providerId}
// Poll ${config.indexerEndpoint}/rpc/tx/status`,
      rpcCode: `// RPC client for ${config.providerId}
// GET ${config.indexerEndpoint}/rpc/getTransactionByPayer`,
      readme: `# ${config.providerName} Integration

This code implements ${config.notificationMethods.join(", ")} notification methods.`,
      generatedAt: Date.now(),
      generatedBy: import_constants.ROOT_CA_UUID,
      iGasCost: 4e-3,
      version: 1
    };
  }
}
async function main() {
  console.log("\u{1F331} Eden Core Starting...\n");
  console.log("\u{1F4CB} CLI Flags:", {
    mockedLLM: import_config.MOCKED_LLM,
    skipRedis: import_config.SKIP_REDIS,
    enableOpenAI: import_config.ENABLE_OPENAI,
    deployedAsRoot: import_config.DEPLOYED_AS_ROOT,
    numIndexers: import_config.NUM_GARDENS,
    numTokenIndexers: import_config.NUM_TOKEN_GARDENS
  }, "\n");
  if (import_config.DEPLOYED_AS_ROOT) {
    console.log("\u{1F537} DEPLOYED AS ROOT MODE: Only ROOT CA and Holy Ghost will be initialized");
    console.log("   All additional indexers will be created via Angular UI wizard\n");
  }
  console.log(`\u2728 Holy Ghost (ROOT CA Indexer) configured: ${import_state.HOLY_GHOST_GARDEN.name}`);
  if (!import_config.DEPLOYED_AS_ROOT) {
    console.log(`\u{1F333} Regular Indexers configured: ${import_state.GARDENS.map((i) => i.name).join(", ")}`);
    console.log(`\u{1F537} Token Indexers configured: ${import_state.TOKEN_GARDENS.map((i) => i.name).join(", ")}
`);
  } else {
    console.log(`\u{1F333} Regular Indexers: 0 (will be created via UI)`);
    console.log(`\u{1F537} Token Indexers: 0 (will be created via UI)
`);
  }
  initializeRootCA();
  (0, import_identity.initializeIdentity)();
  (0, import_conversationService.initializeMessaging)();
  console.log("\u2705 [Messaging] Universal Messaging System initialized");
  const { initializeGovernance } = require("./src/governance/governanceService");
  const dataPath = path.join(__dirname, "data");
  initializeGovernance(dataPath);
  console.log("\u2705 [Governance] Rule-Based Governance System (v1.24) initialized");
  (0, import_logger.initializeLogger)();
  console.log("\n\u{1F527} Initializing modules...");
  (0, import_flowwise.initializeFlowWise)(broadcastEvent, path.join(__dirname, "data"));
  console.log("\u2705 [FlowWise] Workflow engine initialized");
  (0, import_flowwiseService.initializeFlowWiseService)(broadcastEvent, path.join(__dirname, "data"), import_state.ROOT_CA, import_state.ROOT_CA_IDENTITY, redis);
  console.log("\u2705 [FlowWiseService] ROOT CA workflow service initialized and certified with Redis instance");
  (0, import_garden.initializeGarden)(broadcastEvent, redis);
  (0, import_providerPluginRegistry.loadProviderPluginPersistence)();
  console.log("\n\u2728 Issuing certificate to Holy Ghost (ROOT CA Indexer)...");
  try {
    (0, import_garden.issueGardenCertificate)(import_state.HOLY_GHOST_GARDEN);
    console.log(`   \u2705 Certificate issued to ${import_state.HOLY_GHOST_GARDEN.name}`);
  } catch (err) {
    console.error(`   \u274C Failed to issue certificate to ${import_state.HOLY_GHOST_GARDEN.name}:`, err.message);
  }
  if (!import_config.DEPLOYED_AS_ROOT) {
    console.log("\n\u{1F333} Issuing certificates to Regular Indexers...");
    for (const indexer of import_state.GARDENS) {
      if (indexer.active) {
        const existingCert = import_state.CERTIFICATE_REGISTRY.get(indexer.uuid);
        if (!existingCert) {
          try {
            (0, import_garden.issueGardenCertificate)(indexer);
            console.log(`   \u2705 Certificate issued to ${indexer.name} (${indexer.id})`);
          } catch (err) {
            console.error(`   \u274C Failed to issue certificate to ${indexer.name}:`, err.message);
          }
        } else {
          indexer.certificate = existingCert;
          console.log(`   \u2705 Certificate already exists for ${indexer.name} (${indexer.id})`);
        }
      }
    }
    console.log("\n\u{1F537} Issuing certificates to Token Indexers...");
    for (const tokenIndexer of import_state.TOKEN_GARDENS) {
      if (tokenIndexer.active) {
        const existingCert = import_state.CERTIFICATE_REGISTRY.get(tokenIndexer.uuid);
        if (!existingCert) {
          try {
            (0, import_garden.issueGardenCertificate)(tokenIndexer);
            console.log(`   \u2705 Certificate issued to ${tokenIndexer.name} (${tokenIndexer.id})`);
          } catch (err) {
            console.error(`   \u274C Failed to issue certificate to ${tokenIndexer.name}:`, err.message);
          }
        } else {
          tokenIndexer.certificate = existingCert;
          console.log(`   \u2705 Certificate already exists for ${tokenIndexer.name} (${tokenIndexer.id})`);
        }
      }
    }
  }
  console.log("\n\u{1F527} Initializing remaining modules...");
  (0, import_wallet.initializeWallet)(redis, import_config.SKIP_REDIS, ensureRedisConnection, broadcastEvent);
  (0, import_serviceProvider.initializeServiceProvider)(broadcastEvent);
  (0, import_dex.initializeDEX)(broadcastEvent);
  const CASHIER = {
    id: "cashier-eden-001",
    name: "Eden Cashier",
    processedCount: 0,
    totalProcessed: 0,
    status: "active"
  };
  (0, import_ledger.initializeLedger)(broadcastEvent, redis, ensureRedisConnection, import_config.SKIP_REDIS, CASHIER);
  (0, import_llm2.initializeLLM)(broadcastEvent);
  (0, import_priceBroadcaster.initializePriceBroadcaster)(broadcastEvent);
  console.log("\u2705 [DEX Price Broadcaster] Real-time price update service initialized");
  (0, import_priesthoodCertification.initializePriesthoodCertification)();
  const { initializeAccountant } = await import("./src/accountant");
  initializeAccountant();
  const { initializeLiquidityAccountant } = await import("./src/liquidityAccountant");
  initializeLiquidityAccountant();
  console.log("\u2705 [PriestHood Certification] Service initialized");
  const infrastructureProviders = [
    {
      id: "stripe-payment-rail-001",
      uuid: "550e8400-e29b-41d4-a716-446655440100",
      name: "Stripe Payment Rail",
      serviceType: "payment-rail",
      location: "Global",
      bond: 5e4,
      reputation: 5,
      gardenId: "HG",
      apiEndpoint: "https://api.stripe.com/v1",
      status: "active"
    },
    {
      id: "settlement-service-001",
      uuid: "550e8400-e29b-41d4-a716-446655440101",
      name: "Settlement Service",
      serviceType: "settlement",
      location: "ROOT CA",
      bond: 1e5,
      reputation: 5,
      gardenId: "HG",
      apiEndpoint: "internal://settlement",
      status: "active"
    },
    {
      id: "service-registry-001",
      uuid: "550e8400-e29b-41d4-a716-446655440102",
      name: "Service Registry",
      serviceType: "registry",
      location: "ROOT CA",
      bond: 5e4,
      reputation: 5,
      gardenId: "HG",
      apiEndpoint: "internal://service-registry",
      status: "active"
    },
    {
      id: "webserver-service-001",
      uuid: "550e8400-e29b-41d4-a716-446655440103",
      name: "Web Server",
      serviceType: "webserver",
      location: "ROOT CA",
      bond: 1e4,
      reputation: 5,
      gardenId: "HG",
      apiEndpoint: `http://localhost:${import_config.HTTP_PORT}`,
      status: "active"
    },
    {
      id: "websocket-service-001",
      uuid: "550e8400-e29b-41d4-a716-446655440104",
      name: "WebSocket Service",
      serviceType: "websocket",
      location: "ROOT CA",
      bond: 1e4,
      reputation: 5,
      gardenId: "HG",
      apiEndpoint: `ws://localhost:${import_config.HTTP_PORT}`,
      status: "active"
    },
    {
      id: "wallet-service-001",
      uuid: "550e8400-e29b-41d4-a716-446655440105",
      name: "JesusCoin Wallet Service",
      serviceType: "wallet",
      location: "ROOT CA",
      bond: 2e5,
      reputation: 5,
      gardenId: "HG",
      apiEndpoint: "internal://wallet",
      status: "active"
    },
    {
      id: "accountant-service-001",
      uuid: "550e8400-e29b-41d4-a716-446655440106",
      name: "Accountant Service",
      serviceType: "accountant",
      location: "ROOT CA",
      bond: 75e3,
      reputation: 5,
      gardenId: "HG",
      apiEndpoint: "internal://accountant",
      status: "active"
    }
  ];
  console.log("   \u2705 All modules initialized");
  const EDEN_DEBUG_SERVICE_REGISTRY_DUMP = String(process.env.EDEN_DEBUG_SERVICE_REGISTRY_DUMP || "").toLowerCase() === "true";
  const EDEN_DEBUG_SERVICE_REGISTRY_DUMP_INTERVAL_MS = Math.max(
    5e3,
    parseInt(String(process.env.EDEN_DEBUG_SERVICE_REGISTRY_DUMP_INTERVAL_MS || "15000"), 10) || 15e3
  );
  if (EDEN_DEBUG_SERVICE_REGISTRY_DUMP) {
    let dumpInFlight = false;
    setInterval(async () => {
      if (dumpInFlight)
        return;
      dumpInFlight = true;
      try {
        const memoryFile = path.join(__dirname, "eden-serviceRegistry-memory.json");
        const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
        const allProvidersFromServiceRegistry2 = serviceRegistry2.getAllProviders();
        const providerMap = /* @__PURE__ */ new Map();
        for (const provider of allProvidersFromServiceRegistry2) {
          providerMap.set(provider.id, {
            id: provider.id,
            name: provider.name,
            serviceType: provider.serviceType,
            location: provider.location,
            bond: provider.bond,
            reputation: provider.reputation,
            status: provider.status,
            uuid: provider.uuid,
            apiEndpoint: provider.apiEndpoint,
            gardenId: provider.gardenId
          });
        }
        for (const provider of ROOT_CA_SERVICE_REGISTRY) {
          if (!providerMap.has(provider.id)) {
            providerMap.set(provider.id, {
              id: provider.id,
              name: provider.name,
              serviceType: provider.serviceType,
              location: provider.location,
              bond: provider.bond,
              reputation: provider.reputation,
              status: provider.status,
              uuid: provider.uuid,
              apiEndpoint: provider.apiEndpoint,
              gardenId: provider.gardenId
            });
          }
        }
        const all = Array.from(providerMap.values());
        const memoryData = {
          serviceRegistry: all,
          totalProviders: providerMap.size,
          movieProviders: all.filter((p) => p.serviceType === "movie").length,
          dexProviders: all.filter((p) => p.serviceType === "dex").length,
          airlineProviders: all.filter((p) => p.serviceType === "airline").length,
          lastSaved: (/* @__PURE__ */ new Date()).toISOString()
        };
        await fs.promises.writeFile(memoryFile, JSON.stringify(memoryData, null, 2), "utf-8");
      } catch {
      } finally {
        dumpInFlight = false;
      }
    }, EDEN_DEBUG_SERVICE_REGISTRY_DUMP_INTERVAL_MS);
    console.log(
      `   \u{1F50D} [DEBUG] Service registry memory dump ENABLED: eden-serviceRegistry-memory.json every ${EDEN_DEBUG_SERVICE_REGISTRY_DUMP_INTERVAL_MS}ms`
    );
  } else {
    console.log("   \u{1F50D} [DEBUG] Service registry memory dump DISABLED (set EDEN_DEBUG_SERVICE_REGISTRY_DUMP=true to enable)");
  }
  console.log(`
\u{1F30A} Checking DEX Pool initialization...`);
  console.log(`   TOKEN_GARDENS.length: ${import_state.TOKEN_GARDENS.length}`);
  console.log(`   TOKEN_GARDENS:`, import_state.TOKEN_GARDENS.map((tg) => ({ id: tg.id, name: tg.name })));
  console.log(`   DEX_POOLS.size before init: ${DEX_POOLS.size}`);
  if (import_state.TOKEN_GARDENS.length > 0) {
    console.log("\n\u{1F30A} Initializing DEX Pools...");
    (0, import_dex.initializeDEXPools)();
    console.log(`   DEX_POOLS.size after init: ${DEX_POOLS.size}`);
    console.log(`   DEX_POOLS entries:`, Array.from(DEX_POOLS.entries()).map(([id, pool]) => ({
      poolId: id,
      tokenSymbol: pool.tokenSymbol,
      gardenId: pool.gardenId
    })));
    console.log("\n\u{1F4CB} Registering DEX Pool Service Providers...");
    for (const [poolId, pool] of DEX_POOLS.entries()) {
      const tokenGarden = import_state.TOKEN_GARDENS.find((ti) => ti.id === pool.gardenId);
      if (tokenGarden) {
        const providerId = `dex-pool-${pool.tokenSymbol.toLowerCase()}`;
        const existingProvider = ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === providerId && p.gardenId === pool.gardenId);
        if (!existingProvider) {
          const provider = {
            id: providerId,
            uuid: crypto.randomUUID(),
            name: `${pool.tokenSymbol} Pool (${tokenGarden.name})`,
            serviceType: "dex",
            location: "Eden DEX",
            bond: pool.bond,
            reputation: 5,
            gardenId: pool.gardenId,
            // Assign to this garden
            apiEndpoint: `https://dex.eden.com/pools/${poolId}`,
            status: "active"
          };
          (0, import_serviceProvider.registerServiceProviderWithROOTCA)(provider);
          console.log(`   \u2705 Registered DEX pool provider: ${provider.name} (${provider.id}) \u2192 ${tokenGarden.name}`);
        } else {
          console.log(`   \u2713 DEX pool provider ${providerId} already exists for garden ${pool.gardenId}`);
        }
      }
    }
    console.log("\n\u{1F4DC} Issuing certificates to Regular Indexers...");
    for (const indexer of import_state.GARDENS) {
      if (indexer.active) {
        try {
          (0, import_garden.issueGardenCertificate)(indexer);
        } catch (err) {
          console.error(`\u274C Failed to issue certificate to ${indexer.name}:`, err.message);
        }
      }
    }
  }
  console.log("\n\u{1F4DC} Issuing certificates to Service Providers...");
  for (const provider of ROOT_CA_SERVICE_REGISTRY) {
    try {
      (0, import_serviceProvider.issueServiceProviderCertificate)(provider);
    } catch (err) {
      console.error(`\u274C Failed to issue certificate to ${provider.name}:`, err.message);
    }
  }
  console.log(`
\u2705 Certificate issuance complete. Total certificates: ${import_state.CERTIFICATE_REGISTRY.size}`);
  console.log(`   - Regular Indexers: ${import_state.GARDENS.length}`);
  console.log(`   - Token Indexers: ${import_state.TOKEN_GARDENS.length}`);
  console.log(`   - Service Providers: ${ROOT_CA_SERVICE_REGISTRY.length}
`);
  if (import_config.EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS) {
    console.log("\n\u{1F4E1} Registering Service Provider Webhooks (MOCK, Optional Push)... (EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS=true)");
    for (const provider of ROOT_CA_SERVICE_REGISTRY) {
      const mockWebhookUrl = `http://localhost:${import_config.HTTP_PORT}/mock/webhook/${provider.id}`;
      PROVIDER_WEBHOOKS.set(provider.id, {
        providerId: provider.id,
        webhookUrl: mockWebhookUrl,
        registeredAt: Date.now(),
        failureCount: 0
      });
      console.log(`   \u2705 Registered webhook for ${provider.name} (${provider.id}): ${mockWebhookUrl}`);
      broadcastEvent({
        type: "provider_webhook_registered",
        component: "service_provider",
        message: `Webhook Registered: ${provider.name} (${provider.id})`,
        timestamp: Date.now(),
        data: {
          providerId: provider.id,
          providerName: provider.name,
          webhookUrl: mockWebhookUrl,
          startup: true
        }
      });
    }
    console.log(`
\u2705 Webhook registration complete. ${PROVIDER_WEBHOOKS.size} webhook(s) registered
`);
  } else {
    console.log("\n\u{1F4E1} Provider Webhooks: NOT auto-registered (deployable provider plugins should register explicitly).");
    console.log("   Set EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS=true to enable demo auto-registration to /mock/webhook/*\n");
  }
  console.log("=".repeat(70));
  console.log("\u{1F4CB} SERVICE PROVIDER NOTIFICATION ARCHITECTURE");
  console.log("=".repeat(70));
  console.log("\nEden provides THREE notification mechanisms for service providers:\n");
  console.log("1\uFE0F\u20E3  INDEXER RPC (Canonical Source of Truth)");
  console.log("    - GET /rpc/getTransactionByPayer?payer=<google_email>");
  console.log("    - GET /rpc/getTransactionBySnapshot?snapshot_id=<tx_id>");
  console.log("    - GET /rpc/getLatestSnapshot?provider_id=<provider_id>");
  console.log("    - GET /rpc/tx/status?payer=<email> OR ?snapshot_id=<tx_id>");
  console.log("    \u2192 Providers query indexer RPC for transaction status");
  console.log("    \u2192 Bot-friendly, cacheable, stateless");
  console.log("    \u2192 Same model as Ethereum/Solana RPC\n");
  console.log("2\uFE0F\u20E3  OPTIONAL PUSH (Webhook - Best Effort)");
  console.log("    - POST /rpc/webhook/register");
  console.log("    - POST /rpc/webhook/unregister");
  console.log("    - GET /rpc/webhook/list");
  console.log("    \u2192 Providers register webhook URLs");
  console.log("    \u2192 Indexer pushes snapshot on transaction finalization");
  console.log("    \u2192 Best effort delivery, no guarantees");
  console.log("    \u2192 Retry logic handled by indexer\n");
  console.log("3\uFE0F\u20E3  PULL/POLL (Safety Net)");
  console.log("    - GET /rpc/tx/status?payer=<email>");
  console.log("    - Providers poll until timeout");
  console.log("    \u2192 Fallback if webhook fails");
  console.log("    \u2192 Provider controls reliability");
  console.log("    \u2192 No inbound firewall rules required\n");
  console.log("=".repeat(70));
  console.log(`\u{1F4A1} Example: Query transactions for bill.draper.auto@gmail.com`);
  console.log(`   curl "http://localhost:${import_config.HTTP_PORT}/rpc/getTransactionByPayer?payer=bill.draper.auto@gmail.com"`);
  console.log(`
\u{1F4A1} Example: Register webhook for AMC`);
  console.log(`   curl -X POST http://localhost:${import_config.HTTP_PORT}/rpc/webhook/register \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"providerId":"amc-001","webhookUrl":"http://localhost:${import_config.HTTP_PORT}/mock/webhook/amc-001"}'`);
  console.log(`
\u{1F4A1} Example: Poll transaction status`);
  console.log(`   curl "http://localhost:${import_config.HTTP_PORT}/rpc/tx/status?payer=bill.draper.auto@gmail.com"`);
  console.log("=".repeat(70) + "\n");
  const redisConnected = await connectRedis();
  if (!redisConnected && !import_config.SKIP_REDIS) {
    console.error("\u274C Unexpected Redis connection failure\n");
    process.exit(1);
  }
  if (import_config.DEPLOYED_AS_ROOT && redisConnected && !import_config.SKIP_REDIS) {
    const serviceRegistryFile = path.join(__dirname, "eden-serviceRegistry-persistence.json");
    const shouldSave = !fs.existsSync(serviceRegistryFile) || fs.existsSync(serviceRegistryFile) && fs.statSync(serviceRegistryFile).size < 100;
    if (shouldSave) {
      console.log(`\u{1F4BE} [ROOT Mode] Service registry file is empty or missing, saving initial state...`);
      try {
        redis.saveServiceRegistry();
        console.log(`   \u2705 Service registry saved to persistence file`);
      } catch (err) {
        console.warn(`   \u26A0\uFE0F  Failed to save service registry: ${err.message}`);
      }
    } else {
      console.log(`\u{1F4BE} [ROOT Mode] Service registry file exists, skipping save (preserving existing provider assignments)`);
    }
  }
  if (redisConnected && !import_config.SKIP_REDIS) {
    const ledgerEntriesFile = path.join(__dirname, "eden-ledgerEntries-persistence.json");
    if (fs.existsSync(ledgerEntriesFile)) {
      try {
        const fileContent = fs.readFileSync(ledgerEntriesFile, "utf-8");
        const persisted = JSON.parse(fileContent);
        if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries)) {
          import_state.LEDGER.push(...persisted.ledgerEntries);
          console.log(`\u{1F4C2} [Ledger Persistence] Loaded ${persisted.ledgerEntries.length} ledger entries from ${ledgerEntriesFile}`);
        }
      } catch (err) {
        console.error(`\u274C [Ledger Persistence] Failed to load ledger entries: ${err.message}`);
      }
    } else {
      const persistenceFile = path.join(__dirname, "eden-wallet-persistence.json");
      if (fs.existsSync(persistenceFile)) {
        try {
          const fileContent = fs.readFileSync(persistenceFile, "utf-8");
          const persisted = JSON.parse(fileContent);
          if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries)) {
            import_state.LEDGER.push(...persisted.ledgerEntries);
            console.log(`\u{1F4C2} [Ledger Persistence] Loaded ${persisted.ledgerEntries.length} ledger entries from old combined file ${persistenceFile}`);
          }
        } catch (err) {
          console.error(`\u274C [Ledger Persistence] Failed to load ledger entries from old file: ${err.message}`);
        }
      }
    }
  }
  if (redisConnected && !import_config.SKIP_REDIS) {
    try {
      const igasPersistenceFile = path.join(__dirname, "eden-igas-persistence.json");
      if (fs.existsSync(igasPersistenceFile)) {
        const fileContent = fs.readFileSync(igasPersistenceFile, "utf-8");
        const persisted = JSON.parse(fileContent);
        if (persisted.totalIGas !== void 0 && typeof persisted.totalIGas === "number") {
          (0, import_state.setTOTAL_IGAS)(persisted.totalIGas);
          console.log(`\u26FD [iGas Persistence] Loaded total iGas: ${(0, import_state.getTOTAL_IGAS)().toFixed(6)}`);
        }
      }
    } catch (err) {
      console.warn(`\u26A0\uFE0F  [iGas Persistence] Failed to load total iGas: ${err.message}`);
    }
  }
  if (redisConnected && !import_config.SKIP_REDIS) {
    try {
      const persistenceFile = path.join(__dirname, "eden-wallet-persistence.json");
      if (fs.existsSync(persistenceFile)) {
        const fileContent = fs.readFileSync(persistenceFile, "utf-8");
        const persisted = JSON.parse(fileContent);
        const indexersToRestore = [];
        const tokenIndexersToRestore = [];
        const gardensFromFile = persisted.gardens || persisted.indexers;
        if (gardensFromFile && Array.isArray(gardensFromFile)) {
          let restoredCount = 0;
          let skippedCount = 0;
          for (const persistedIndexer of gardensFromFile) {
            if (persistedIndexer.tokenServiceType === "dex" || persistedIndexer.serviceType === "dex" && persistedIndexer.id && persistedIndexer.id.startsWith("T")) {
              skippedCount++;
              console.log(`\u{1F4C2} [Indexer Persistence] Skipping token indexer ${persistedIndexer.id} (will be restored as token indexer)`);
              continue;
            }
            if (import_config.DEPLOYED_AS_ROOT) {
              const isRegularIndexer = persistedIndexer.id && (persistedIndexer.id.startsWith("garden-") || persistedIndexer.id.startsWith("indexer-"));
              if (isRegularIndexer) {
                indexersToRestore.push(persistedIndexer);
                restoredCount++;
                console.log(`\u{1F4C2} [Indexer Persistence] Will restore regular indexer: ${persistedIndexer.name} (${persistedIndexer.id})`);
              }
            } else {
              const defaultIds = Array.from({ length: import_config.NUM_GARDENS }, (_, i) => String.fromCharCode(65 + i));
              if (persistedIndexer.id && !defaultIds.includes(persistedIndexer.id)) {
                indexersToRestore.push(persistedIndexer);
                restoredCount++;
                console.log(`\u{1F4C2} [Indexer Persistence] Will restore regular indexer: ${persistedIndexer.name} (${persistedIndexer.id})`);
              }
            }
          }
          for (const persistedIndexer of gardensFromFile) {
            const isTokenIndexer = persistedIndexer.tokenServiceType === "dex" || persistedIndexer.serviceType === "dex" && persistedIndexer.id && persistedIndexer.id.startsWith("T");
            if (isTokenIndexer) {
              if (import_config.DEPLOYED_AS_ROOT) {
                tokenIndexersToRestore.push(persistedIndexer);
                restoredCount++;
                console.log(`\u{1F4C2} [Indexer Persistence] Will restore token indexer: ${persistedIndexer.name} (${persistedIndexer.id})`);
              } else {
                const defaultTokenIds = Array.from({ length: import_config.NUM_TOKEN_GARDENS }, (_, i) => `T${i + 1}`);
                if (persistedIndexer.id && !defaultTokenIds.includes(persistedIndexer.id)) {
                  tokenIndexersToRestore.push(persistedIndexer);
                  restoredCount++;
                  console.log(`\u{1F4C2} [Indexer Persistence] Will restore token indexer: ${persistedIndexer.name} (${persistedIndexer.id})`);
                }
              }
            }
          }
          console.log(`\u{1F4C2} [Indexer Persistence] Collected ${indexersToRestore.length} regular indexer(s) and ${tokenIndexersToRestore.length} token indexer(s) to restore`);
          if (import_config.DEPLOYED_AS_ROOT) {
            import_state.GARDENS.length = 0;
            import_state.TOKEN_GARDENS.length = 0;
          } else {
            const defaultIds = Array.from({ length: import_config.NUM_GARDENS }, (_, i) => String.fromCharCode(65 + i));
            const defaultTokenIds = Array.from({ length: import_config.NUM_TOKEN_GARDENS }, (_, i) => `T${i + 1}`);
            const filteredGardens = import_state.GARDENS.filter((idx) => defaultIds.includes(idx.id));
            const filteredTokenGardens = import_state.TOKEN_GARDENS.filter((idx) => defaultTokenIds.includes(idx.id));
            import_state.GARDENS.length = 0;
            import_state.TOKEN_GARDENS.length = 0;
            import_state.GARDENS.push(...filteredGardens);
            import_state.TOKEN_GARDENS.push(...filteredTokenGardens);
          }
          const deduplicatedRegular = /* @__PURE__ */ new Map();
          for (const idx of indexersToRestore) {
            if (!deduplicatedRegular.has(idx.id)) {
              deduplicatedRegular.set(idx.id, idx);
            } else {
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Skipping duplicate regular indexer ${idx.id} when restoring from file`);
            }
          }
          const deduplicatedToken = /* @__PURE__ */ new Map();
          for (const idx of tokenIndexersToRestore) {
            if (!deduplicatedToken.has(idx.id)) {
              deduplicatedToken.set(idx.id, idx);
            } else {
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Skipping duplicate token indexer ${idx.id} when restoring from file`);
            }
          }
          const cleanRegularIndexers = Array.from(deduplicatedRegular.values());
          const cleanTokenIndexers = Array.from(deduplicatedToken.values());
          import_state.GARDENS.push(...cleanRegularIndexers);
          import_state.TOKEN_GARDENS.push(...cleanTokenIndexers);
          const regularDupsRemoved = indexersToRestore.length - cleanRegularIndexers.length;
          const tokenDupsRemoved = tokenIndexersToRestore.length - cleanTokenIndexers.length;
          if (regularDupsRemoved > 0 || tokenDupsRemoved > 0) {
            console.warn(`\u26A0\uFE0F  [Indexer Persistence] Removed ${regularDupsRemoved} duplicate regular indexer(s) and ${tokenDupsRemoved} duplicate token indexer(s) when loading from file`);
          }
          console.log(`\u2705 [Indexer Persistence] Restored ${cleanRegularIndexers.length} regular indexer(s) and ${cleanTokenIndexers.length} token indexer(s) from persistence file`);
        }
      }
    } catch (err) {
      console.error(`\u274C [Indexer Persistence] Failed to restore indexers: ${err.message}`);
    }
    console.log("\n\u{1F4CB} Initializing ServiceRegistry2 (AFTER gardens loaded)...");
    (0, import_serviceRegistry2.initializeServiceRegistry2)();
    const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
    console.log(`   \u2705 ServiceRegistry2 initialized with ${serviceRegistry2.getCount()} provider(s) from persistence`);
    const infrastructureProviders2 = [
      {
        id: "stripe-payment-rail-001",
        uuid: "550e8400-e29b-41d4-a716-446655440100",
        name: "Stripe Payment Rail",
        serviceType: "payment-rail",
        location: "Global",
        bond: 5e4,
        reputation: 5,
        gardenId: "HG",
        apiEndpoint: "https://api.stripe.com/v1",
        status: "active"
      },
      {
        id: "settlement-service-001",
        uuid: "550e8400-e29b-41d4-a716-446655440101",
        name: "Settlement Service",
        serviceType: "settlement",
        location: "ROOT CA",
        bond: 1e5,
        reputation: 5,
        gardenId: "HG",
        apiEndpoint: "internal://settlement",
        status: "active"
      },
      {
        id: "service-registry-001",
        uuid: "550e8400-e29b-41d4-a716-446655440102",
        name: "Service Registry",
        serviceType: "registry",
        location: "ROOT CA",
        bond: 5e4,
        reputation: 5,
        gardenId: "HG",
        apiEndpoint: "internal://service-registry",
        status: "active"
      },
      {
        id: "webserver-service-001",
        uuid: "550e8400-e29b-41d4-a716-446655440103",
        name: "Web Server",
        serviceType: "webserver",
        location: "ROOT CA",
        bond: 1e4,
        reputation: 5,
        gardenId: "HG",
        apiEndpoint: `http://localhost:${import_config.HTTP_PORT}`,
        status: "active"
      },
      {
        id: "websocket-service-001",
        uuid: "550e8400-e29b-41d4-a716-446655440104",
        name: "WebSocket Service",
        serviceType: "websocket",
        location: "ROOT CA",
        bond: 1e4,
        reputation: 5,
        gardenId: "HG",
        apiEndpoint: `ws://localhost:${import_config.HTTP_PORT}`,
        status: "active"
      },
      {
        id: "wallet-service-001",
        uuid: "550e8400-e29b-41d4-a716-446655440105",
        name: "JesusCoin Wallet Service",
        serviceType: "wallet",
        location: "ROOT CA",
        bond: 2e5,
        reputation: 5,
        gardenId: "HG",
        apiEndpoint: "internal://wallet",
        status: "active"
      },
      {
        id: "accountant-service-001",
        uuid: "550e8400-e29b-41d4-a716-446655440106",
        name: "Accountant Service",
        serviceType: "accountant",
        location: "ROOT CA",
        bond: 75e3,
        reputation: 5,
        gardenId: "HG",
        apiEndpoint: "internal://accountant",
        status: "active"
      }
    ];
    let infrastructureAdded = 0;
    for (const provider of infrastructureProviders2) {
      if (!serviceRegistry2.hasProvider(provider.id)) {
        try {
          serviceRegistry2.addProvider(provider);
          infrastructureAdded++;
          console.log(`   \u2705 Added infrastructure provider: ${provider.name} (${provider.id})`);
        } catch (err) {
          console.warn(`   \u26A0\uFE0F  Failed to add infrastructure provider ${provider.id}: ${err.message}`);
        }
      }
    }
    if (infrastructureAdded > 0) {
      console.log(`   \u2705 Added ${infrastructureAdded} infrastructure provider(s) to ServiceRegistry2`);
      serviceRegistry2.savePersistence();
    }
    console.log(`   \u2705 ServiceRegistry2 ready with ${serviceRegistry2.getCount()} total provider(s)`);
    console.log(`
   \u{1F50D} [Startup] Checking for gardens without providers...`);
    let allGardens = [...import_state.GARDENS, ...import_state.TOKEN_GARDENS];
    console.log(`   \u{1F50D} [Startup] Checking ${allGardens.length} garden(s) from memory: ${allGardens.map((g) => `${g.id}(${g.serviceType || "no-type"})`).join(", ")}`);
    const gardensPersistenceFile = path.join(__dirname, "eden-gardens-persistence.json");
    let gardensFromSeparateFile = [];
    if (fs.existsSync(gardensPersistenceFile)) {
      try {
        const fileContent = fs.readFileSync(gardensPersistenceFile, "utf-8");
        const persisted = JSON.parse(fileContent);
        gardensFromSeparateFile = persisted.gardens || [];
        console.log(`   \u{1F50D} [Startup] Found ${gardensFromSeparateFile.length} garden(s) in eden-gardens-persistence.json: ${gardensFromSeparateFile.map((g) => `${g.id}(${g.serviceType || "no-type"})`).join(", ")}`);
        for (const gardenFromFile of gardensFromSeparateFile) {
          const existsInMemory = import_state.GARDENS.some((g) => g.id === gardenFromFile.id) || import_state.TOKEN_GARDENS.some((tg) => tg.id === gardenFromFile.id);
          if (!existsInMemory) {
            const isTokenGarden = gardenFromFile.tokenServiceType === "dex" || gardenFromFile.serviceType === "dex" && gardenFromFile.id && gardenFromFile.id.startsWith("T");
            if (isTokenGarden) {
              import_state.TOKEN_GARDENS.push(gardenFromFile);
              console.log(`   \u{1F50D} [Startup] Added token garden ${gardenFromFile.id} from eden-gardens-persistence.json to TOKEN_GARDENS`);
            } else {
              import_state.GARDENS.push(gardenFromFile);
              console.log(`   \u{1F50D} [Startup] Added garden ${gardenFromFile.id} from eden-gardens-persistence.json to GARDENS`);
            }
          }
        }
        allGardens = [...import_state.GARDENS, ...import_state.TOKEN_GARDENS];
      } catch (err) {
        console.warn(`   \u26A0\uFE0F  [Startup] Failed to read eden-gardens-persistence.json:`, err.message);
      }
    }
    console.log(`   \u{1F50D} [Startup] Total gardens to check: ${allGardens.length}`);
    for (const garden of allGardens) {
      const gardenServiceType = garden.serviceType;
      console.log(`   \u{1F50D} [Startup] Checking garden ${garden.id}: serviceType="${gardenServiceType}"`);
      if (gardenServiceType && gardenServiceType !== "movie" && gardenServiceType !== "dex" && gardenServiceType !== "snake") {
        const allProviders = serviceRegistry2.getAllProviders();
        const providersForThisGarden = allProviders.filter((p) => p.gardenId === garden.id && p.serviceType === gardenServiceType);
        const hasProviderForThisGarden = providersForThisGarden.length > 0;
        console.log(`   \u{1F50D} [Startup] Garden ${garden.id} (${gardenServiceType}): ${providersForThisGarden.length} provider(s) found for this garden, hasProviderForThisGarden=${hasProviderForThisGarden}`);
        if (!hasProviderForThisGarden) {
          console.log(`   \u{1F527} [Startup] Garden ${garden.id} (${gardenServiceType}) has no providers, creating default provider...`);
          try {
            const defaultProviderConfig = {
              name: `${garden.name} Provider`,
              location: "Unknown",
              bond: 1e3,
              reputation: 5,
              apiEndpoint: `https://api.${gardenServiceType}.com/v1`
            };
            const startupProviderResults = (0, import_serviceProvider.createServiceProvidersForGarden)(
              gardenServiceType,
              garden.id,
              [defaultProviderConfig],
              void 0
            );
            const startupProvidersCreated = startupProviderResults.filter((r) => r.created || r.assigned).length;
            console.log(`   \u2705 [Startup] Created default provider for ${gardenServiceType} garden ${garden.id}: ${startupProviderResults.map((r) => r.providerName).join(", ")}`);
            serviceRegistry2.savePersistence();
            console.log(`   \u{1F4BE} [Startup] Service registry saved to persistence`);
          } catch (startupErr) {
            console.warn(`   \u26A0\uFE0F  [Startup] Failed to create default provider for ${garden.id}:`, startupErr.message);
            console.error(`   \u274C [Startup] Error details:`, startupErr);
          }
        } else {
          console.log(`   \u2713 [Startup] Garden ${garden.id} already has provider(s)`);
        }
      } else {
        console.log(`   \u23ED\uFE0F  [Startup] Skipping garden ${garden.id}: serviceType="${gardenServiceType}" (movie/dex/snake or missing)`);
      }
    }
    if (redisConnected && !import_config.SKIP_REDIS) {
      try {
        let reloadedCount = 0;
        const serviceRegistryFile = path.join(__dirname, "eden-serviceRegistry-persistence.json");
        if (fs.existsSync(serviceRegistryFile)) {
          const fileContent = fs.readFileSync(serviceRegistryFile, "utf-8");
          const persisted = JSON.parse(fileContent);
          if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry) && persisted.serviceRegistry.length > 0) {
            console.log(`\u{1F50D} [Service Registry Reload] Checking ${persisted.serviceRegistry.length} providers from persistence file`);
            console.log(`\u{1F50D} [Service Registry Reload] Current GARDENS: ${import_state.GARDENS.map((g) => g.id).join(", ")}`);
            console.log(`\u{1F50D} [Service Registry Reload] Current TOKEN_GARDENS: ${import_state.TOKEN_GARDENS.map((tg) => tg.id).join(", ")}`);
            console.log(`\u{1F50D} [Service Registry Reload] Current ROOT_CA_SERVICE_REGISTRY: ${ROOT_CA_SERVICE_REGISTRY.map((p) => `${p.id}(${p.serviceType})`).join(", ")}`);
            for (const persistedProvider of persisted.serviceRegistry) {
              const persistedGardenId = persistedProvider.gardenId || persistedProvider.indexerId;
              console.log(`\u{1F50D} [Service Registry Reload] Processing provider: ${persistedProvider.id} (${persistedProvider.name}), serviceType: ${persistedProvider.serviceType}, gardenId: ${persistedGardenId}`);
              let gardenExists = persistedGardenId === "HG" || import_state.GARDENS.some((g) => g.id === persistedGardenId) || import_state.TOKEN_GARDENS.some((tg) => tg.id === persistedGardenId);
              console.log(`\u{1F50D} [Service Registry Reload] Garden ${persistedGardenId} exists: ${gardenExists}`);
              if (!gardenExists && persistedGardenId) {
                if (import_config.DEPLOYED_AS_ROOT && persistedProvider.serviceType === "movie" && persistedGardenId !== "HG") {
                  console.log(`\u{1F3D7}\uFE0F  [Service Registry Reload] Creating default garden "${persistedGardenId}" for movie provider ${persistedProvider.id}`);
                  const defaultGarden = {
                    id: persistedGardenId,
                    uuid: crypto.randomUUID(),
                    name: `Movie Garden (${persistedGardenId})`,
                    serviceType: "movie",
                    active: true,
                    location: persistedProvider.location || "Default Location",
                    bond: 1e3,
                    reputation: 100,
                    certificate: null,
                    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
                    lastActive: (/* @__PURE__ */ new Date()).toISOString()
                  };
                  import_state.GARDENS.push(defaultGarden);
                  try {
                    (0, import_garden.issueGardenCertificate)(defaultGarden);
                    console.log(`   \u2705 Certificate issued to new garden: ${defaultGarden.name}`);
                  } catch (certError) {
                    console.warn(`   \u26A0\uFE0F  Failed to issue certificate to new garden: ${certError.message}`);
                  }
                  console.log(`   \u2705 Created and registered garden: ${defaultGarden.name} (${defaultGarden.id})`);
                  gardenExists = true;
                } else {
                  console.log(`\u26A0\uFE0F  [Service Registry Reload] Skipping provider ${persistedProvider.id}: gardenId "${persistedGardenId}" does not exist`);
                  console.log(`   Available gardens: ${import_state.GARDENS.map((g) => g.id).join(", ") || "none"}`);
                  console.log(`   Available token gardens: ${import_state.TOKEN_GARDENS.map((tg) => tg.id).join(", ") || "none"}`);
                  continue;
                }
              }
              const existingProvider = ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === persistedProvider.id);
              if (!existingProvider) {
                const providerToAdd = {
                  id: persistedProvider.id,
                  uuid: persistedProvider.uuid || crypto.randomUUID(),
                  name: persistedProvider.name,
                  serviceType: persistedProvider.serviceType,
                  location: persistedProvider.location || "Unknown",
                  bond: persistedProvider.bond || 0,
                  reputation: persistedProvider.reputation || 0,
                  gardenId: persistedGardenId || "HG",
                  apiEndpoint: persistedProvider.apiEndpoint,
                  status: persistedProvider.status || "active"
                };
                ROOT_CA_SERVICE_REGISTRY.push(providerToAdd);
                reloadedCount++;
                console.log(`   \u2705 Reloaded provider: ${providerToAdd.name} (${providerToAdd.id}) with gardenId: ${providerToAdd.gardenId}, serviceType: ${providerToAdd.serviceType}`);
              } else {
                if (existingProvider.gardenId !== persistedGardenId && persistedGardenId) {
                  existingProvider.gardenId = persistedGardenId;
                  console.log(`   \u{1F504} Updated provider ${existingProvider.name}: gardenId to "${persistedGardenId}"`);
                } else {
                  console.log(`   \u2713 Provider ${existingProvider.name} already exists with correct gardenId: ${existingProvider.gardenId}`);
                }
              }
            }
            console.log(`\u2705 [Service Registry] Reloaded ${reloadedCount} provider(s) from persistence file`);
          }
        } else {
          console.log(`\u2705 [Service Registry] No persistence file to reload (providers will be created via wizard)`);
        }
        if (reloadedCount > 0) {
          console.log(`\u{1F4BE} [Service Registry] Saving updated service registry to persistence file...`);
          redis.saveServiceRegistry();
        }
      } catch (err) {
        console.warn(`\u26A0\uFE0F  [Service Registry] Failed to reload service registry: ${err.message}`);
      }
    }
  }
  if (!fs.existsSync(import_config.FRONTEND_PATH)) {
    console.warn(`
\u26A0\uFE0F  WARNING: Frontend directory not found: ${import_config.FRONTEND_PATH}`);
    console.warn(`   The Angular frontend has not been built yet.`);
    console.warn(`   To build it, run: cd frontend && ng build`);
    console.warn(`   Or use the Angular dev server: cd frontend && ng serve`);
    console.warn(`   The server will still start, but frontend routes will return 404.
`);
  } else if (!fs.existsSync(path.join(import_config.FRONTEND_PATH, "index.html"))) {
    console.warn(`
\u26A0\uFE0F  WARNING: index.html not found in: ${import_config.FRONTEND_PATH}`);
    console.warn(`   The Angular build may be incomplete.`);
    console.warn(`   Try rebuilding: cd frontend && ng build
`);
  } else {
    console.log(`
\u2705 Frontend found at: ${import_config.FRONTEND_PATH}`);
  }
  const PORT = process.env.PORT || 3e3;
  const protocol = import_config.ENABLE_HTTPS ? "https" : "http";
  const wsProtocol = import_config.ENABLE_HTTPS ? "wss" : "ws";
  httpServer.listen(PORT, () => {
    console.log(`
\u{1F680} Eden Ecosystem Server running on ${protocol}://localhost:${PORT}`);
    console.log(`\u{1F4E1} WebSocket server ready for connections (${wsProtocol}://localhost:${PORT}/ws)`);
    if (import_config.DEPLOYED_AS_ROOT) {
      console.log(`\u{1F333} ROOT mode: ${import_state.GARDENS.length} garden(s), ${import_state.TOKEN_GARDENS.length} token garden(s)`);
    } else {
      console.log(`\u{1F333} Non-ROOT mode: ${import_state.GARDENS.length} garden(s), ${import_state.TOKEN_GARDENS.length} token garden(s)`);
    }
    setInterval(() => {
      try {
        if (redis && ROOT_CA_SERVICE_REGISTRY.length > 0) {
          console.log(`\u23F0 [Periodic Save] Auto-saving service registry (${ROOT_CA_SERVICE_REGISTRY.length} providers)...`);
          redis.saveServiceRegistry();
        }
      } catch (error) {
        console.error("\u274C [Periodic Save] Failed to save service registry:", error);
      }
    }, 5 * 60 * 1e3);
    setInterval(() => {
      try {
        let totalIGasToSave = (0, import_state.getTOTAL_IGAS)() || 0;
        try {
          const { getAccountantState } = require("./src/accountant");
          totalIGasToSave = (getAccountantState()?.totalIGas ?? totalIGasToSave) || 0;
        } catch (err) {
        }
        const igasPersistenceFile = path.join(__dirname, "eden-igas-persistence.json");
        const igasData = {
          totalIGas: totalIGasToSave,
          lastSaved: (/* @__PURE__ */ new Date()).toISOString()
        };
        fs.writeFileSync(igasPersistenceFile, JSON.stringify(igasData, null, 2), "utf-8");
        console.log(`\u23F0 [Periodic Save] Auto-saving total iGas: ${totalIGasToSave.toFixed(6)}`);
      } catch (error) {
        console.error("\u274C [Periodic Save] Failed to save total iGas:", error);
      }
    }, 5 * 60 * 1e3);
    setInterval(() => {
      try {
        const { saveAccountantState } = require("./src/accountant");
        saveAccountantState();
        console.log(`\u23F0 [Periodic Save] Auto-saving Accountant Service state`);
      } catch (error) {
        console.error("\u274C [Periodic Save] Failed to save Accountant Service state:", error);
      }
    }, 5 * 60 * 1e3);
  });
}
const saveServiceRegistryOnShutdown = () => {
  try {
    console.log("\u{1F4BE} [Shutdown] Saving service registry to persistence file...");
    if (redis) {
      redis.saveServiceRegistry();
      console.log("\u2705 [Shutdown] Service registry saved successfully");
    } else {
      console.warn("\u26A0\uFE0F  [Shutdown] Redis not available, skipping service registry save");
    }
  } catch (error) {
    console.error("\u274C [Shutdown] Failed to save service registry:", error);
  }
};
const saveAccountantOnShutdown = () => {
  try {
    console.log("\u{1F4BE} [Shutdown] Saving Accountant Service state...");
    const { saveAccountantState } = require("./src/accountant");
    saveAccountantState();
    console.log("\u2705 [Shutdown] Accountant Service state saved successfully");
  } catch (error) {
    console.error("\u274C [Shutdown] Failed to save Accountant Service state:", error);
  }
};
process.on("SIGTERM", () => {
  console.log("\u{1F6D1} [Shutdown] Received SIGTERM, saving state...");
  saveServiceRegistryOnShutdown();
  saveAccountantOnShutdown();
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("\u{1F6D1} [Shutdown] Received SIGINT (Ctrl+C), saving state...");
  saveServiceRegistryOnShutdown();
  saveAccountantOnShutdown();
  process.exit(0);
});
main().catch((err) => {
  console.error("\u274C Fatal error starting server:", err);
  process.exit(1);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  broadcastEvent
});
//# sourceMappingURL=eden-sim-redis.js.map
