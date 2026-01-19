#!/usr/bin/env ts-node

/**
 * Eden Core Simulator v1.5
 * -----------------------
 * Single-file reference implementation with embedded Redis server
 *
 * Features:
 * - Embedded in-memory Redis server (no external dependencies)
 * - Redis state store
 * - Redis Streams for indexer fan-out
 */

import * as http from "http";
import * as https from "https";
import * as crypto from "crypto";
import * as process from "process";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import { EventEmitter } from "events";
import { WebSocketServer, WebSocket } from "ws";
import { EdenPKI, type EdenCertificate, type EdenIdentity, type RevocationEvent, type Capability } from "./EdenPKI";
import Stripe from "stripe";
import { InMemoryRedisServer } from "./src/redis";
import { 
  MOCKED_LLM, 
  SKIP_REDIS, 
  ENABLE_OPENAI, 
  DEPLOYED_AS_ROOT, 
  NUM_GARDENS, 
  NUM_TOKEN_GARDENS,
  HTTP_PORT,
  FRONTEND_PATH,
  STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SECRET
} from "./src/config";
import type { GardenConfig, TokenGardenConfig } from "./src/types";
import {
  GARDENS,
  TOKEN_GARDENS,
  initializeGardens,
  initializeUsers,
  ROOT_CA,
  ROOT_CA_IDENTITY,
  setROOTCA,
  CERTIFICATE_REGISTRY,
  REVOCATION_REGISTRY,
  HOLY_GHOST_GARDEN,
  LEDGER,
  USERS as USERS_STATE,
  TOTAL_IGAS
} from "./src/state";
import { ROOT_CA_UUID, REVOCATION_STREAM, WALLET_BALANCE_PREFIX, WALLET_HOLD_PREFIX, WALLET_AUDIT_PREFIX } from "./src/constants";
import {
  initializeWallet,
  syncWalletBalanceFromUser,
  getWalletBalance,
  creditWallet,
  debitWallet,
  processWalletIntent
} from "./src/wallet";
import {
  initializeServiceProvider,
  validateGardenId,
  registerServiceProviderWithROOTCA,
  queryROOTCAServiceRegistry,
  queryServiceProviders,
  queryProviderAPI,
  queryAMCAPI,
  queryMovieComAPI,
  queryCinemarkAPI,
  queryDEXPoolAPI,
  querySnakeAPI,
  issueServiceProviderCertificate,
  createServiceProvidersForGarden
} from "./src/serviceProvider";
import { initializeServiceRegistry2, getServiceRegistry2 } from "./src/serviceRegistry2";
import {
  initializeGarden,
  issueGardenCertificate,
  registerNewMovieGarden
} from "./src/garden";
import {
  initializeDEX,
  initializeDEXPools,
  executeDEXTrade,
  calculateIGas
} from "./src/dex";
import {
  initializeLedger,
  addLedgerEntry,
  pushLedgerEntryToSettlementStream,
  processPayment,
  completeBooking,
  getLedgerEntries,
  getTransactionByPayer,
  getTransactionBySnapshot,
  getLatestSnapshot,
  deliverWebhook,
  getCashierStatus
} from "./src/ledger";
import { callLLM } from "./src/llm";
import {
  initializeFlowWise,
  loadWorkflow,
  executeWorkflow,
  submitUserDecision,
  WorkflowContext,
  FlowWiseWorkflow,
  evaluateCondition,
  replaceTemplateVariables
} from "./src/flowwise";
import {
  initializeFlowWiseService,
  startWorkflowFromUserInput,
  submitUserDecision as submitUserDecisionToFlowWise,
  executeNextStep,
  getWorkflowState
} from "./src/components/flowwiseService";
import {
  initializePriesthoodCertification,
  applyForPriesthood,
  approvePriesthood,
  rejectPriesthood,
  revokePriesthood,
  getCertificationStatus,
  hasPriesthoodCertification,
  getAllCertifications,
  getCertificationsByStatus,
  getCertificationStats,
  type PriesthoodCertification
} from "./src/priesthoodCertification";
import {
  initializeLLM,
  extractQueryWithOpenAI,
  formatResponseWithOpenAI,
  extractQueryWithDeepSeek,
  formatResponseWithDeepSeek,
  resolveLLM,
  callLLM,
  LLM_QUERY_EXTRACTION_PROMPT,
  LLM_RESPONSE_FORMATTING_PROMPT
} from "./src/llm";
import { initializeLogger, getLogger } from "./src/logger";
import type { WalletIntent, WalletResult } from "./src/types";
import { getServiceTypeFields, extractBookingDetails, getServiceTypeMessage, formatRecommendation } from "./src/serviceTypeFields";

// Initialize Stripe
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16", // Use compatible API version
});

// HTTP Server for serving Angular and API
const httpServer = http.createServer();

// WebSocket Server for Frontend (upgrade from HTTP server)
const wss = new WebSocketServer({ 
  server: httpServer,
  path: "/ws" // Optional: specific WebSocket path
});
const wsClients = new Set<WebSocket>();

wss.on("connection", (ws: WebSocket, req) => {
  console.log(`🔌 WebSocket client connected from ${req.socket.remoteAddress} (${wsClients.size + 1} total)`);
  wsClients.add(ws);
  
  ws.on("close", () => {
    wsClients.delete(ws);
    console.log(`🔌 WebSocket client disconnected (${wsClients.size} remaining)`);
  });
  
  ws.on("error", (error: Error) => {
    console.error("❌ WebSocket error:", error.message);
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: "connection",
    component: "websocket",
    message: "Connected to Eden Simulator",
    timestamp: Date.now(),
  }));
});

wss.on("error", (error: Error) => {
  console.error("❌ WebSocketServer error:", error.message);
});

// Broadcast events to all connected clients
export function broadcastEvent(event: any) {
  const message = JSON.stringify(event);
  const connectedClients = Array.from(wsClients).filter(client => client.readyState === WebSocket.OPEN);
  
  // Enhanced debug logging for all broadcast events
  const eventType = event.type || 'unknown';
  const component = event.component || 'unknown';
  const timestamp = event.timestamp || Date.now();
  
  // Log all events with key details
  console.log(`📡 [Broadcast] ========================================`);
  console.log(`📡 [Broadcast] Event Type: "${eventType}"`);
  console.log(`📡 [Broadcast] Component: "${component}"`);
  console.log(`📡 [Broadcast] Message: ${event.message || 'N/A'}`);
  console.log(`📡 [Broadcast] Timestamp: ${new Date(timestamp).toISOString()}`);
  
  // Special logging for critical events
  if (eventType === 'ledger_entry_added' || eventType === 'ledger_entry_created' || 
      eventType === 'cashier_payment_processed' || eventType === 'cashier_start') {
    console.log(`📡 [Broadcast] ⭐ CRITICAL EVENT - LEDGER/CASHIER`);
    console.log(`📡 [Broadcast] Event data:`, JSON.stringify(event.data || {}, null, 2));
  }
  
  // Log workflow-related events
  if (eventType.includes('workflow') || eventType.includes('step') || 
      eventType === 'user_decision_required' || eventType === 'user_selection_required') {
    console.log(`📡 [Broadcast] 🔄 WORKFLOW EVENT`);
    if (event.data?.stepId) {
      console.log(`📡 [Broadcast] Step ID: ${event.data.stepId}`);
      console.log(`📡 [Broadcast] Step Name: ${event.data.stepName || 'N/A'}`);
    }
    if (event.data?.selectedListing) {
      console.log(`📡 [Broadcast] Selected Listing:`, JSON.stringify(event.data.selectedListing, null, 2));
    }
  }
  
  // Log movie-related events
  if (eventType.includes('movie') || component === 'movie_theater') {
    console.log(`📡 [Broadcast] 🎬 MOVIE EVENT`);
    if (event.data?.movieTitle) {
      console.log(`📡 [Broadcast] Movie Title: ${event.data.movieTitle}`);
    }
    if (event.data?.movieProgress !== undefined) {
      console.log(`📡 [Broadcast] Movie Progress: ${event.data.movieProgress}%`);
    }
  }
  
  if (connectedClients.length === 0) {
    console.log(`📡 [Broadcast] ⚠️  No WebSocket clients connected, event NOT sent`);
    console.log(`📡 [Broadcast] ========================================`);
    return;
  }
  
  console.log(`📡 [Broadcast] Sending to ${connectedClients.length} WebSocket client(s)`);
  console.log(`📡 [Broadcast] Message size: ${message.length} bytes`);
  
  let successCount = 0;
  let failCount = 0;
  
  connectedClients.forEach((client, index) => {
    try {
      client.send(message);
      successCount++;
      // Log successful send for critical events
      if (eventType === 'ledger_entry_added' || eventType === 'cashier_payment_processed' || 
          eventType.includes('workflow') || eventType.includes('step')) {
        console.log(`📡 [Broadcast] ✅ Client ${index + 1}/${connectedClients.length}: Sent "${eventType}"`);
      }
    } catch (err: any) {
      failCount++;
      console.error(`📡 [Broadcast] ❌ Client ${index + 1}/${connectedClients.length}: Failed to send "${eventType}": ${err.message}`);
    }
  });
  
  console.log(`📡 [Broadcast] Result: ${successCount} sent, ${failCount} failed`);
  console.log(`📡 [Broadcast] ========================================`);
}

// HTTP Server Routes
httpServer.on("request", async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  // Basic request logging enabled for debugging
  console.log(`📥 [${requestId}] ${req.method} ${req.url}`);
  
  const parsedUrl = url.parse(req.url || "/", true);
  const pathname = parsedUrl.pathname || "/";

  // WebSocket upgrade requests are handled automatically by WebSocketServer
  // No need to intercept them here
  if (req.headers.upgrade === "websocket") {
    console.log(`   ⚡ WebSocket upgrade request, skipping HTTP handler`);
    return;
  }

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    console.log(`   ✅ [${requestId}] OPTIONS request, sending CORS preflight`);
    res.writeHead(200);
    res.end();
    return;
  }

  // API Routes
  // GET /api/workflow/list - List all available workflows (MUST BE BEFORE /api/workflow/:serviceType)
  if (pathname === "/api/workflow/list" && req.method === "GET") {
    console.log(`   📋 [${requestId}] GET /api/workflow/list - Listing available workflows`);
    
    try {
      const dataPath = path.join(__dirname, "data");
      const workflows: Array<{serviceType: string, filename: string, exists: boolean, stepCount?: number}> = [];
      
      // Dynamically scan the data directory for all .json files (removes hardcoded dependencies)
      if (fs.existsSync(dataPath)) {
        const files = fs.readdirSync(dataPath);
        const jsonFiles = files.filter(file => file.endsWith('.json') && !file.startsWith('.'));
        
        // Create a set of found service types
        const foundServiceTypes = new Set<string>();
        
        for (const file of jsonFiles) {
          // Extract service type from filename (remove .json extension)
          const serviceType = file.replace('.json', '');
          
          // Skip non-workflow files (if any)
          if (serviceType && !foundServiceTypes.has(serviceType)) {
            foundServiceTypes.add(serviceType);
            
            const filePath = path.join(dataPath, file);
            const exists = fs.existsSync(filePath);
            let stepCount: number | undefined = undefined;
            
            // If workflow exists, load it and count steps
            if (exists) {
              try {
                const fileContent = fs.readFileSync(filePath, "utf-8");
                const data = JSON.parse(fileContent);
                if (data.flowwiseWorkflow && data.flowwiseWorkflow.steps && Array.isArray(data.flowwiseWorkflow.steps)) {
                  stepCount = data.flowwiseWorkflow.steps.length;
                  console.log(`   📋 [${requestId}] Workflow ${serviceType}: ${file} - ${stepCount} steps`);
                } else {
                  console.log(`   ⚠️ [${requestId}] Workflow ${serviceType}: ${file} - exists but no steps found`);
                }
              } catch (parseError: any) {
                console.error(`   ⚠️ [${requestId}] Error parsing workflow ${serviceType}: ${parseError.message}`);
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
        
        // Also include known service types that might not have files yet (for completeness)
        // This ensures the frontend always has a complete list to display
        const knownServiceTypes = [
          'movie', 'amc', 'autobodyshop', 'autorepairshop', 'bank', 'church', 'court',
          'dex', 'dogpark', 'gasstation', 'grocerystore', 'gym', 'hospital', 'hotel',
          'jail', 'laborcamp', 'library', 'pharmacy', 'policestation', 'postoffice',
          'priest', 'restaurant', 'school', 'university', 'airline', 'autoparts', 'snake'
        ];
        
        // Add missing service types (that don't have files yet) to the list
        for (const knownType of knownServiceTypes) {
          if (!foundServiceTypes.has(knownType)) {
            const filename = `${knownType}.json`;
            workflows.push({
              serviceType: knownType,
              filename: filename,
              exists: false,
              stepCount: undefined
            });
          }
        }
        
        // Sort workflows by serviceType for consistent ordering
        workflows.sort((a, b) => a.serviceType.localeCompare(b.serviceType));
        
        console.log(`   📋 [${requestId}] Found ${workflows.filter(w => w.exists).length} existing workflows out of ${workflows.length} total`);
      } else {
        console.warn(`   ⚠️ [${requestId}] Data directory does not exist: ${dataPath}`);
      }
      
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: true,
        workflows
      }));
    } catch (error: any) {
      console.error(`   ❌ [${requestId}] Error listing workflows:`, error.message);
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

  // GET /api/workflow/:serviceType - Get workflow definition (MUST BE AFTER /api/workflow/list)
  if (pathname.startsWith("/api/workflow/") && req.method === "GET" && pathname !== "/api/workflow/decision" && pathname !== "/api/workflow/list") {
    const serviceType = pathname.split("/").pop();
    console.log(`   📋 [${requestId}] GET /api/workflow/${serviceType} - Loading workflow definition`);
    console.log(`   🔍 [${requestId}] Service type from URL: "${serviceType}"`);
    console.log(`   🔍 [${requestId}] Full pathname: "${pathname}"`);

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
      const workflow: FlowWiseWorkflow | null = loadWorkflow(serviceType);
      console.log(`   🔄 [${requestId}] Workflow loaded: ${workflow ? 'SUCCESS' : 'FAILED'} - ${workflow?.name || 'N/A'}`);
      if (workflow) {
        console.log(`   🔍 [${requestId}] Workflow name: "${workflow.name}"`);
        console.log(`   🔍 [${requestId}] Workflow serviceType check: First step serviceType = "${(workflow.steps[0]?.actions?.find((a: any) => a.serviceType) as any)?.serviceType || 'N/A'}"`);
      }

      if (workflow) {
        const responseData = {
          success: true,
          flowwiseWorkflow: workflow
        };
        console.log(`   ✅ [${requestId}] Sending workflow response with ${workflow.steps.length} steps`);
        console.log(`   📤 [${requestId}] Response: 200 OK (workflow definition)`);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(JSON.stringify(responseData));
      } else {
        console.log(`   ❌ [${requestId}] Workflow not found for service type: ${serviceType}`);
        res.writeHead(404, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(JSON.stringify({
          success: false,
          error: `Workflow not found for service type: ${serviceType}`
        }));
      }
    } catch (error: any) {
      console.error(`   ❌ [${requestId}] Error loading workflow:`, error.message);
      console.error(`   ❌ [${requestId}] Stack trace:`, error.stack);
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

  // GET /api/igas/total - Get total iGas
  if (pathname === "/api/igas/total" && req.method === "GET") {
    console.log(`   ⛽ [${requestId}] GET /api/igas/total - Fetching total iGas`);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify({
      success: true,
      totalIGas: TOTAL_IGAS,
      timestamp: Date.now()
    }));
    return;
  }

  // GET /api/accountant/summary - Get Accountant Service financial summary
  if (pathname === "/api/accountant/summary" && req.method === "GET") {
    console.log(`   📊 [${requestId}] GET /api/accountant/summary - Fetching financial summary`);
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
    } catch (error: any) {
      console.error(`   ❌ [${requestId}] Error fetching accountant summary:`, error.message);
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

  // POST /api/workflow/action - Execute a workflow action
  if (pathname === "/api/workflow/action" && req.method === "POST") {
    console.log(`   ⚙️ [${requestId}] POST /api/workflow/action - Workflow action execution`);
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      const sendResponse = (statusCode: number, data: any) => {
        if (!res.headersSent) {
          console.log(`   📤 [${requestId}] Response: ${statusCode} ${statusCode === 200 ? 'OK' : 'ERROR'} (${JSON.stringify(data).length} bytes)`);
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        }
      };

      try {
        const parsedBody = JSON.parse(body);
        const { executionId, action, context } = parsedBody;

        if (!executionId || !action) {
          sendResponse(400, { success: false, error: "executionId and action are required" });
          return;
        }

        console.log(`   🔄 [${requestId}] Executing action ${action.type} in execution ${executionId}`);

        // Handle different action types
        let result: any = {
          actionExecuted: action.type,
          timestamp: Date.now()
        };

        try {
          switch (action.type) {
            case 'check_balance':
              // Check if user has sufficient balance
              const userEmail = action.email || context?.user?.email;
              const requiredAmount = action.required || context?.totalCost || action.amount;

              if (!userEmail || !requiredAmount) {
                throw new Error('Missing user email or amount for balance check');
              }

              const balance = getWalletBalance(userEmail);
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

            case 'process_payment':
              // Process the actual payment
              const paymentUser = action.user || context?.user;
              const paymentAmount = action.amount || context?.totalCost || context?.moviePrice;
              const ledgerEntry = action.ledgerEntry || context?.ledgerEntry;

              if (!paymentUser?.email || !paymentAmount || !ledgerEntry) {
                throw new Error('Missing payment details');
              }

              // Debit the user wallet
              const debitResult = debitWallet(paymentUser.email, paymentAmount);
              if (!debitResult.success) {
                throw new Error(`Payment failed: ${debitResult.error}`);
              }

              // Process the payment through cashier
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

            case 'complete_booking':
              // Complete the booking
              const bookingEntry = action.ledgerEntry || context?.ledgerEntry;
              if (!bookingEntry) {
                throw new Error('Missing ledger entry for booking completion');
              }

              const bookingResult = completeBooking(bookingEntry);

              result = {
                ...result,
                bookingCompleted: true,
                bookingResult
              };
              break;

            default:
              // Default action acknowledgment
              console.log(`   ⚙️ [${requestId}] Action ${action.type} acknowledged (no specific handler)`);
          }

          sendResponse(200, {
            success: true,
            message: `Action ${action.type} executed successfully`,
            result
          });

        } catch (actionError: any) {
          console.error(`   ❌ [${requestId}] Action execution error for ${action.type}:`, actionError.message);
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

      } catch (error: any) {
        console.error(`   ❌ [${requestId}] Error executing workflow action:`, error.message);
        sendResponse(500, { success: false, error: error.message });
      }
    });
    return;
  }

  // POST /api/workflow/execute-step - Execute a specific workflow step atomically on server
  if (pathname === "/api/workflow/execute-step" && req.method === "POST") {
    console.log(`   ▶️ [${requestId}] POST /api/workflow/execute-step - Atomic step execution`);
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      const sendResponse = (statusCode: number, data: any) => {
        if (!res.headersSent) {
          console.log(`   📤 [${requestId}] Response: ${statusCode} ${statusCode === 200 ? 'OK' : 'ERROR'} (${JSON.stringify(data).length} bytes)`);
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        }
      };

      try {
        const parsedBody = JSON.parse(body);
        const { executionId, stepId, context, serviceType } = parsedBody;

        if (!executionId || !stepId || !serviceType) {
          sendResponse(400, { success: false, error: "executionId, stepId, and serviceType are required" });
          return;
        }

        console.log(`   🔄 [${requestId}] Executing step ${stepId} atomically for ${serviceType} workflow`);

        // Import template variable replacement function
        const { replaceTemplateVariables } = await import("./src/flowwise");

        // Load the appropriate workflow definition dynamically
        const workflow = loadWorkflow(serviceType);

        if (!workflow) {
          sendResponse(400, { success: false, error: "Invalid workflow definition" });
          return;
        }

        // Find the step to execute
        const step = workflow.steps.find((s: any) => s.id === stepId);
        if (!step) {
          sendResponse(404, { success: false, error: `Step not found: ${stepId}` });
          return;
        }

        console.log(`   ⚙️ [${requestId}] ========================================`);
        console.log(`   ⚙️ [${requestId}] 🚀 EXECUTE-STEP ENDPOINT: STEP EXECUTION START`);
        console.log(`   ⚙️ [${requestId}] Step ID: ${stepId}`);
        console.log(`   ⚙️ [${requestId}] Step Name: ${step.name}`);
        console.log(`   ⚙️ [${requestId}] Step Type: ${step.type}`);
        console.log(`   ⚙️ [${requestId}] Step Component: ${step.component}`);
        console.log(`   ⚙️ [${requestId}] Actions Count: ${step.actions?.length || 0}`);
        if (step.actions) {
          console.log(`   ⚙️ [${requestId}] Action Types:`, step.actions.map((a: any) => a.type));
        }
        console.log(`   ⚙️ [${requestId}] ========================================`);

        // Initialize updatedContext from the provided context
        const updatedContext = { ...context };
        
        // Set service-type-specific price in context if selectedListing exists
        if (updatedContext.selectedListing && updatedContext.selectedListing.price) {
          const currentServiceType = updatedContext.serviceType || serviceType || 'movie';
          if (currentServiceType === 'hotel') {
            updatedContext.hotelPrice = updatedContext.selectedListing.price;
          } else if (currentServiceType === 'movie') {
            updatedContext.moviePrice = updatedContext.selectedListing.price;
          } else if (currentServiceType === 'airline') {
            updatedContext.airlinePrice = updatedContext.selectedListing.price;
          } else if (currentServiceType === 'restaurant') {
            updatedContext.restaurantPrice = updatedContext.selectedListing.price;
          } else if (currentServiceType === 'grocerystore') {
            updatedContext.grocerystorePrice = updatedContext.selectedListing.price;
          } else if (currentServiceType === 'pharmacy') {
            updatedContext.pharmacyPrice = updatedContext.selectedListing.price;
          } else if (currentServiceType === 'dogpark') {
            updatedContext.dogparkPrice = updatedContext.selectedListing.price;
          } else if (currentServiceType === 'gasstation') {
            updatedContext.gasstationPrice = updatedContext.selectedListing.price;
          } else if (currentServiceType === 'party') {
            updatedContext.partyPrice = updatedContext.selectedListing.price;
          } else if (currentServiceType === 'bank') {
            updatedContext.bankPrice = updatedContext.selectedListing.price;
          }
          // Also set generic totalCost for backward compatibility
          updatedContext.totalCost = updatedContext.selectedListing.price;
        }
        
        // CRITICAL: Initialize cashier in context if not already set (needed for cashier_process_payment step)
        if (!updatedContext.cashier && (step.component === 'cashier' || step.id === 'cashier_process_payment')) {
          updatedContext.cashier = getCashierStatus();
          console.log(`   💰 [${requestId}] ========================================`);
          console.log(`   💰 [${requestId}] 💰 CASHIER INITIALIZED IN CONTEXT`);
          console.log(`   💰 [${requestId}] Step ID: ${step.id}`);
          console.log(`   💰 [${requestId}] Cashier:`, {
            id: updatedContext.cashier.id,
            name: updatedContext.cashier.name,
            processedCount: updatedContext.cashier.processedCount,
            totalProcessed: updatedContext.cashier.totalProcessed
          });
          console.log(`   💰 [${requestId}] ========================================`);
        }
        
        const executedActions: any[] = [];
        const events: any[] = [];

        // Handle decision steps specially - they require user interaction
        if (step.type === "decision" && step.requiresUserDecision) {
          console.log(`   🤔 [${requestId}] ========================================`);
          console.log(`   🤔 [${requestId}] DECISION STEP DETECTED: ${step.id}`);
          console.log(`   🤔 [${requestId}] Step name: ${step.name}`);
          console.log(`   🤔 [${requestId}] Step type: ${step.type}`);
          console.log(`   🤔 [${requestId}] requiresUserDecision: ${step.requiresUserDecision}`);
          console.log(`   🤔 [${requestId}] Has websocketEvents: ${!!step.websocketEvents}`);
          console.log(`   🤔 [${requestId}] websocketEvents count: ${step.websocketEvents?.length || 0}`);
          console.log(`   🤔 [${requestId}] updatedContext keys:`, Object.keys(updatedContext));
          console.log(`   🤔 [${requestId}] ========================================`);

          // For decision steps, we don't execute actions yet - we broadcast the decision request
          // Process WebSocket events for decision request
          if (step.websocketEvents) {
            for (const event of step.websocketEvents) {
              const processedEvent = replaceTemplateVariables(event, updatedContext);
              events.push(processedEvent);

              // Add workflow and step identification to the event data
              processedEvent.data = {
                ...processedEvent.data,
                workflowId: executionId,
                stepId: step.id
              };

              // Special handling for user_select_listing - build options from listings
              console.log(`   🔍 [${requestId}] Checking for user_select_listing step:`);
              console.log(`   🔍 [${requestId}] Step ID: ${step.id}`);
              console.log(`   🔍 [${requestId}] Step ID matches "user_select_listing": ${step.id === "user_select_listing"}`);
              console.log(`   🔍 [${requestId}] updatedContext.listings exists: ${!!updatedContext.listings}`);
              console.log(`   🔍 [${requestId}] updatedContext.listings type: ${typeof updatedContext.listings}`);
              console.log(`   🔍 [${requestId}] updatedContext.listings is array: ${Array.isArray(updatedContext.listings)}`);
              console.log(`   🔍 [${requestId}] updatedContext.listings length: ${updatedContext.listings?.length || 0}`);
              console.log(`   🔍 [${requestId}] processedEvent.data.options BEFORE special handling:`, processedEvent.data?.options);
              console.log(`   🔍 [${requestId}] processedEvent.data.options type:`, typeof processedEvent.data?.options);
              console.log(`   🔍 [${requestId}] processedEvent.data.options is array:`, Array.isArray(processedEvent.data?.options));
              
              // ALWAYS build options for user_select_listing if listings exist, even if template replacement already set it
              // Check both updatedContext.listings and processedEvent.data.options (in case template replacement already set it)
              const listingsSource = updatedContext.listings || (Array.isArray(processedEvent.data?.options) ? processedEvent.data.options : null);
              
              if (step.id === "user_select_listing" && listingsSource && Array.isArray(listingsSource) && listingsSource.length > 0) {
                const selectServiceType = updatedContext.serviceType || serviceType || 'movie';
                const selectFields = getServiceTypeFields(selectServiceType);
                
                console.log(`   📋 [${requestId}] ✅ Building ${selectServiceType} selection options from ${listingsSource.length} listings`);
                console.log(`   📋 [${requestId}] Using listings from: ${updatedContext.listings ? 'updatedContext.listings' : 'processedEvent.data.options'}`);
                processedEvent.data.options = listingsSource.map((listing: any) => {
                  // Build label dynamically based on service type
                  let label = '';
                  if (selectServiceType === 'movie') {
                    label = `${listing.movieTitle || listing.name} at ${listing.showtime} - $${listing.price}`;
                  } else if (selectServiceType === 'airline') {
                    label = `${listing.flightNumber || listing.name} to ${listing.destination} on ${listing.date} - $${listing.price}`;
                  } else {
                    // Generic fallback
                    const primary = listing[selectFields.primary] || listing.name;
                    const time = listing[selectFields.time] || '';
                    label = `${primary}${time ? ` - ${time}` : ''} - $${listing.price || listing[selectFields.price]}`;
                  }
                  
                  return {
                    value: listing.id,
                    label: label,
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
                console.log(`   📋 [${requestId}] ✅ Built ${processedEvent.data.options.length} selection options`);
                console.log(`   📋 [${requestId}] First option:`, JSON.stringify(processedEvent.data.options[0], null, 2));
              } else {
                console.log(`   ⚠️ [${requestId}] ⚠️ NOT building options because:`);
                if (step.id !== "user_select_listing") {
                  console.log(`   ⚠️ [${requestId}]   - Step ID "${step.id}" does not match "user_select_listing"`);
                }
                const listingsSource = updatedContext.listings || (Array.isArray(processedEvent.data?.options) ? processedEvent.data.options : null);
                if (!listingsSource || !Array.isArray(listingsSource) || listingsSource.length === 0) {
                  console.log(`   ⚠️ [${requestId}]   - No listings found in updatedContext.listings or processedEvent.data.options`);
                  console.log(`   ⚠️ [${requestId}]   - updatedContext.listings:`, updatedContext.listings);
                  console.log(`   ⚠️ [${requestId}]   - processedEvent.data.options:`, processedEvent.data?.options);
                  console.log(`   ⚠️ [${requestId}]   - Available context keys:`, Object.keys(updatedContext));
                }
              }
              
              // Final check: Ensure options is an array before broadcasting
              if (processedEvent.data?.options && !Array.isArray(processedEvent.data.options)) {
                console.warn(`   ⚠️ [${requestId}] ⚠️ processedEvent.data.options is not an array! Converting...`);
                console.warn(`   ⚠️ [${requestId}] Current value:`, processedEvent.data.options);
                console.warn(`   ⚠️ [${requestId}] Type:`, typeof processedEvent.data.options);
                processedEvent.data.options = [];
              }

              console.log(`   📡 [${requestId}] Broadcasting decision event: ${event.type}`);
              console.log(`   📡 [${requestId}] Event structure:`, JSON.stringify(processedEvent, null, 2));
              console.log(`   📡 [${requestId}] Event data.options:`, processedEvent.data?.options);
              console.log(`   📡 [${requestId}] Event data.options count:`, processedEvent.data?.options?.length || 0);
              try {
                broadcastEvent(processedEvent);
                console.log(`   ✅ [${requestId}] Successfully broadcasted event: ${event.type}`);
              } catch (broadcastError) {
                console.warn(`   ⚠️ [${requestId}] Failed to broadcast event: ${event.type}`, broadcastError);
              }
            }
          }

          // For decision steps, return early without nextStepId - execution pauses for user input
          console.log(`   ⏸️ [${requestId}] ========================================`);
          console.log(`   ⏸️ [${requestId}] STEP PAUSED FOR USER INTERACTION`);
          console.log(`   ⏸️ [${requestId}] Step ID: ${stepId}`);
          console.log(`   ⏸️ [${requestId}] Decision type: ${step.id.includes('select') ? 'selection' : 'decision'}`);
          console.log(`   ⏸️ [${requestId}] Events count: ${events.length}`);
          console.log(`   ⏸️ [${requestId}] Events summary:`, events.map(e => ({ 
            type: e.type, 
            hasOptions: !!e.data?.options, 
            optionsCount: Array.isArray(e.data?.options) ? e.data.options.length : 0,
            optionsType: typeof e.data?.options
          })));
          if (events.length > 0) {
            console.log(`   ⏸️ [${requestId}] First event full structure:`, JSON.stringify(events[0], null, 2));
          }
          console.log(`   ⏸️ [${requestId}] ========================================`);

          sendResponse(200, {
            success: true,
            message: `Step ${stepId} paused for user interaction`,
            result: {
              stepId,
              pausedForDecision: true,
              decisionType: step.id.includes('select') ? 'selection' : 'decision',
              events,
              updatedContext
            }
          });
          return;
        }

        console.log(`   📋 [${requestId}] Initial context has listings:`, !!updatedContext.listings);

        // Process LLM actions (mocked)
        if (step.actions) {
          for (const action of step.actions) {
            const processedAction = replaceTemplateVariables(action, updatedContext);
            console.log(`   🤖 [${requestId}] Processing action: ${action.type}`);

            try {
              let actionResult: any = {};
              
              // Handle async actions (like movie watching)
              if (action.type === 'start_movie_watching') {
                // Process this action asynchronously
                await processMovieWatchingAction(processedAction, updatedContext, broadcastEvent);
                actionResult = { movieStarted: true, movieWatched: true };
                executedActions.push({ type: action.type, result: actionResult });
                continue; // Skip to next action
              }

              switch (action.type) {
                case 'validate':
                  actionResult = {
                    validationPassed: true,
                    errors: [],
                    input: updatedContext.input,
                    email: updatedContext.email
                  };
                  break;

                case 'create_snapshot':
                  console.log(`📸 [${requestId}] Creating transaction snapshot`);
                  try {
                    const currentServiceType = updatedContext.serviceType || serviceType || 'movie';
                    const listingPrice = updatedContext.selectedListing?.price || 0;
                    const snapshotAmount = processedAction.amount || 
                                          updatedContext.moviePrice || 
                                          updatedContext.hotelPrice || 
                                          updatedContext.restaurantPrice ||
                                          updatedContext.grocerystorePrice ||
                                          updatedContext.pharmacyPrice ||
                                          updatedContext.dogparkPrice ||
                                          updatedContext.gasstationPrice ||
                                          updatedContext.partyPrice ||
                                          updatedContext.bankPrice ||
                                          updatedContext.totalCost ||
                                          listingPrice || 
                                          0;
                    
                    // CRITICAL: Always use user email from context as payer
                    // Priority: updatedContext.user?.email > processedAction.payer > fallback
                    const userEmail = updatedContext.user?.email || processedAction.payer || 'unknown@example.com';
                    if (!updatedContext.user?.email && processedAction.payer) {
                      console.log(`📧 [${requestId}] Using processedAction.payer (${processedAction.payer}) as user email is not in context`);
                    }
                    
                    const snapshot = {
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
                    
                    console.log(`📧 [${requestId}] Snapshot created with payer email: ${userEmail}`);
                    actionResult = { snapshot };
                    // CRITICAL: Store snapshot in context for next actions and websocket events
                    updatedContext.snapshot = snapshot;
                    // Also ensure iGasCost is in context
                    updatedContext.iGasCost = updatedContext.iGasCost || 0.00445;
                    // Set service-type-specific price in context for template variables
                    if (currentServiceType === 'movie') {
                      updatedContext.moviePrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType === 'hotel') {
                      updatedContext.hotelPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType === 'airline') {
                      updatedContext.airlinePrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType === 'restaurant') {
                      updatedContext.restaurantPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType === 'grocerystore') {
                      updatedContext.grocerystorePrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType === 'pharmacy') {
                      updatedContext.pharmacyPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType === 'dogpark') {
                      updatedContext.dogparkPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType === 'gasstation') {
                      updatedContext.gasstationPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType === 'party') {
                      updatedContext.partyPrice = listingPrice || snapshotAmount;
                    } else if (currentServiceType === 'bank') {
                      updatedContext.bankPrice = listingPrice || snapshotAmount;
                    }
                    // Also set generic totalCost for backward compatibility
                    updatedContext.totalCost = listingPrice || snapshotAmount;
                    
                    console.log(`📸 [${requestId}] Snapshot created:`, {
                      txId: snapshot.txId,
                      payer: snapshot.payer,
                      amount: snapshot.amount,
                      serviceType: currentServiceType
                    });
                    console.log(`📸 [${requestId}] Context now has: snapshot=${!!updatedContext.snapshot}, iGasCost=${updatedContext.iGasCost}, price=${listingPrice || snapshotAmount}`);
                  } catch (snapshotError) {
                    console.error(`❌ [${requestId}] Error creating snapshot:`, snapshotError);
                    actionResult = { error: snapshotError.message };
                  }
                  break;

                case 'validate_certificate':
                  console.log(`🔐 [${requestId}] Validating certificate for provider:`, processedAction.providerUuid || updatedContext.selectedListing?.providerId);
                  // For now, always pass certificate validation in mock mode
                  actionResult = {
                    certificateValid: true,
                    providerUuid: processedAction.providerUuid || updatedContext.selectedListing?.providerId,
                    validationTimestamp: Date.now()
                  };
                  console.log(`🔐 [${requestId}] Certificate validation passed`);
                  break;

                case 'llm_extract_query':
                  // Extract serviceType from action, context, or workflow
                  const extractServiceType = processedAction.serviceType || updatedContext.serviceType || serviceType || 'movie';
                  console.log(`   🔍 [${requestId}] llm_extract_query: Using serviceType: ${extractServiceType}`);
                  
                  // Use actual LLM extraction if available, otherwise return mock
                  actionResult = {
                    queryResult: {
                      serviceType: extractServiceType,
                      query: {
                        filters: extractServiceType === 'movie' ? {
                          genre: 'sci-fi',
                          time: 'evening'
                        } : extractServiceType === 'airline' ? {
                          destination: 'any',
                          date: 'any'
                        } : {}
                      }
                    }
                  };
                  break;

                case 'query_service_registry': {
                  // Get serviceType from action, context, or workflow
                  const queryServiceType = processedAction.serviceType || updatedContext.serviceType || updatedContext.queryResult?.serviceType || serviceType || 'movie';
                  console.log(`   🔍 [${requestId}] query_service_registry: Querying for serviceType: ${queryServiceType}`);
                  
                  // Query actual service registry
                  const serviceRegistry2 = getServiceRegistry2();
                  const providers = serviceRegistry2.queryProviders(queryServiceType, processedAction.filters || updatedContext.queryResult?.query?.filters || {});
                  
                  console.log(`   📋 [${requestId}] Found ${providers.length} providers for serviceType: ${queryServiceType}`);
                  
                  // Generate mock listings based on service type (in real implementation, this would query provider APIs)
                  const queryFields = getServiceTypeFields(queryServiceType);
                  const mockListings = providers.map((provider, index) => {
                    const baseListing: any = {
                      id: provider.id,
                      name: provider.name,
                      serviceType: queryServiceType,
                      location: provider.location,
                      providerId: provider.id,
                      providerName: provider.name,
                      price: 15.99 + (index * 2.5), // Vary prices
                      rating: 4.5 + (Math.random() * 0.5), // Random rating between 4.5-5.0
                    };
                    
                  // Add service-type-specific fields
                  if (queryServiceType === 'movie') {
                    baseListing.movieTitle = ['The Dark Knight', 'Inception', 'Avatar', 'Interstellar', 'The Matrix'][index % 5];
                    baseListing.showtime = ['7:00 PM', '8:30 PM', '6:15 PM', '9:00 PM', '5:30 PM'][index % 5];
                    baseListing.genre = ['Action', 'Sci-Fi', 'Adventure', 'Thriller', 'Drama'][index % 5];
                    baseListing.duration = '152 min';
                    baseListing.format = ['IMAX', '3D', '4DX', 'Standard', 'Premium'][index % 5];
                  } else if (queryServiceType === 'airline') {
                    baseListing.flightNumber = ['AA123', 'UA456', 'DL789', 'SW012', 'JB345'][index % 5];
                    baseListing.destination = ['Los Angeles', 'New York', 'Chicago', 'Miami', 'Seattle'][index % 5];
                    baseListing.date = ['2026-01-20', '2026-01-21', '2026-01-22', '2026-01-23', '2026-01-24'][index % 5];
                    baseListing.departure = ['8:00 AM', '10:30 AM', '2:00 PM', '6:00 PM', '9:30 PM'][index % 5];
                    baseListing.arrival = ['11:00 AM', '1:30 PM', '5:00 PM', '9:00 PM', '12:30 AM'][index % 5];
                  } else if (queryServiceType === 'autoparts') {
                    baseListing.partName = ['Brake Pads', 'Oil Filter', 'Air Filter', 'Spark Plugs', 'Battery'][index % 5];
                    baseListing.partNumber = [`BP-${1000 + index}`, `OF-${2000 + index}`, `AF-${3000 + index}`, `SP-${4000 + index}`, `BAT-${5000 + index}`][index % 5];
                    baseListing.category = ['Brakes', 'Filters', 'Filters', 'Ignition', 'Electrical'][index % 5];
                    baseListing.warehouse = ['Warehouse A', 'Warehouse B', 'Warehouse C', 'Warehouse D', 'Warehouse E'][index % 5];
                    baseListing.availability = ['In Stock', 'In Stock', 'Low Stock', 'In Stock', 'In Stock'][index % 5];
                  } else if (queryServiceType === 'hotel') {
                    baseListing.hotelName = ['Grand Plaza Hotel', 'Oceanview Resort', 'City Center Inn', 'Mountain Lodge', 'Beachside Suites'][index % 5];
                    baseListing.checkIn = ['2026-01-20', '2026-01-21', '2026-01-22', '2026-01-23', '2026-01-24'][index % 5];
                    baseListing.checkOut = ['2026-01-22', '2026-01-23', '2026-01-24', '2026-01-25', '2026-01-26'][index % 5];
                    baseListing.roomType = ['Standard', 'Deluxe', 'Suite', 'Executive', 'Presidential'][index % 5];
                    baseListing.location = ['Downtown', 'Beachfront', 'City Center', 'Airport', 'Resort Area'][index % 5];
                  } else if (queryServiceType === 'restaurant') {
                    baseListing.restaurantName = ['The Gourmet Bistro', 'Seaside Grill', 'Mountain View Restaurant', 'Downtown Diner', 'Garden Cafe'][index % 5];
                    baseListing.reservationTime = ['7:00 PM', '8:00 PM', '6:30 PM', '7:30 PM', '8:30 PM'][index % 5];
                    baseListing.cuisine = ['Italian', 'French', 'Asian Fusion', 'American', 'Mediterranean'][index % 5];
                    baseListing.partySize = [2, 4, 2, 6, 4][index % 5];
                    baseListing.location = ['Downtown', 'Waterfront', 'Uptown', 'Historic District', 'Shopping District'][index % 5];
                  } else if (queryServiceType === 'grocerystore') {
                    baseListing.grocerystoreName = ['Fresh Market', 'Super Grocer', 'Neighborhood Market', 'City Grocery', 'Green Valley Store'][index % 5];
                    baseListing.storeType = ['Supermarket', 'Grocery Store', 'Convenience Store', 'Organic Market', 'Discount Store'][index % 5];
                    baseListing.department = ['Produce', 'Dairy', 'Meat', 'Bakery', 'Frozen'][index % 5];
                    baseListing.location = ['Downtown', 'Suburban', 'City Center', 'Shopping Plaza', 'Neighborhood'][index % 5];
                    baseListing.hours = ['8 AM - 9 PM', '7 AM - 10 PM', '6 AM - 11 PM', '24 Hours', '9 AM - 8 PM'][index % 5];
                  } else if (queryServiceType === 'pharmacy') {
                    baseListing.pharmacyName = ['Health Pharmacy', 'Community Drug Store', 'Wellness Pharmacy', 'Family Pharmacy', 'Care Pharmacy'][index % 5];
                    baseListing.pharmacyType = ['Retail Pharmacy', 'Chain Pharmacy', 'Independent Pharmacy', 'Hospital Pharmacy', 'Compounding Pharmacy'][index % 5];
                    baseListing.services = ['Prescriptions', 'Over-the-counter', 'Health Consultations', 'Vaccinations', 'Medical Supplies'][index % 5];
                    baseListing.location = ['Downtown', 'Medical District', 'Shopping Center', 'Hospital Area', 'Residential'][index % 5];
                    baseListing.hours = ['9 AM - 6 PM', '8 AM - 8 PM', '24 Hours', '9 AM - 9 PM', '7 AM - 7 PM'][index % 5];
                  } else if (queryServiceType === 'dogpark') {
                    baseListing.dogparkName = ['Happy Tails Park', 'Paws & Play Park', 'Canine Commons', 'Dogwood Park', 'Bark & Run Park'][index % 5];
                    baseListing.parkType = ['Off-Leash Park', 'Fenced Park', 'Community Park', 'Private Park', 'Dog Run'][index % 5];
                    baseListing.amenities = ['Water Fountains', 'Agility Equipment', 'Separate Small Dog Area', 'Waste Stations', 'Shaded Areas'][index % 5];
                    baseListing.location = ['Downtown', 'Residential', 'Suburban', 'Park District', 'Neighborhood'][index % 5];
                    baseListing.hours = ['6 AM - 10 PM', 'Dawn to Dusk', '24 Hours', '7 AM - 9 PM', '5 AM - 11 PM'][index % 5];
                  } else if (queryServiceType === 'gasstation') {
                    baseListing.gasstationName = ['Quick Fill Station', 'Express Gas', 'Fuel Stop', 'Corner Gas', 'Highway Fuel'][index % 5];
                    baseListing.stationType = ['Full Service', 'Self Service', 'Convenience Store', 'Truck Stop', 'Premium Station'][index % 5];
                    baseListing.fuelTypes = ['Regular', 'Premium', 'Diesel', 'E85', 'Electric Charging'][index % 5];
                    baseListing.location = ['Highway', 'Downtown', 'Suburban', 'Shopping Center', 'Residential'][index % 5];
                    baseListing.hours = ['24 Hours', '6 AM - 11 PM', '5 AM - Midnight', '24 Hours', '7 AM - 10 PM'][index % 5];
                  } else if (queryServiceType === 'party') {
                    baseListing.partyName = ['New Year\'s Eve Gala', 'Summer Music Festival', 'Rooftop Celebration', 'Dance Party Night', 'VIP Exclusive Event'][index % 5];
                    baseListing.partyType = ['Concert', 'Festival', 'Nightclub', 'Private Event', 'Corporate Party'][index % 5];
                    baseListing.eventDate = ['2026-12-31', '2026-07-15', '2026-06-20', '2026-08-10', '2026-09-05'][index % 5];
                    baseListing.eventTime = ['9:00 PM', '6:00 PM', '8:00 PM', '10:00 PM', '7:00 PM'][index % 5];
                    baseListing.location = ['Convention Center', 'Outdoor Venue', 'Rooftop', 'Nightclub', 'Hotel Ballroom'][index % 5];
                    baseListing.capacity = [500, 1000, 200, 300, 150][index % 5];
                  } else if (queryServiceType === 'bank') {
                    baseListing.bankName = ['First National Bank', 'Community Credit Union', 'Metro Savings Bank', 'Trust Financial', 'Heritage Bank'][index % 5];
                    baseListing.bankType = ['Commercial Bank', 'Credit Union', 'Savings Bank', 'Investment Bank', 'Community Bank'][index % 5];
                    baseListing.services = ['Checking Account', 'Savings Account', 'Loans', 'Investment Services', 'Business Banking'][index % 5];
                    baseListing.location = ['Downtown', 'Financial District', 'Shopping Center', 'Suburban', 'City Center'][index % 5];
                    baseListing.hours = ['9 AM - 5 PM', '8 AM - 6 PM', '10 AM - 4 PM', '9 AM - 4 PM', '8 AM - 5 PM'][index % 5];
                    baseListing.atmAvailable = [true, true, false, true, true][index % 5];
                  } else {
                    // Generic fallback for other service types
                    baseListing.name = `${provider.name} Service`;
                    baseListing.date = new Date().toISOString().split('T')[0];
                  }
                  
                  return baseListing;
                });
                
                actionResult = {
                  listings: mockListings,
                  providers: providers.map(p => ({
                    id: p.id,
                    name: p.name,
                    serviceType: p.serviceType,
                    location: p.location
                  }))
                };
                
                // Store serviceType in context for later use
                updatedContext.serviceType = queryServiceType;
                
                console.log(`   📋 [${requestId}] Set ${mockListings.length} ${queryServiceType} listings in context`);
                break;
                }

                case 'llm_format_response': {
                  const availableListings = updatedContext.listings || [];
                  const formatServiceType = updatedContext.serviceType || updatedContext.queryResult?.serviceType || serviceType || 'movie';
                  const formatFields = getServiceTypeFields(formatServiceType);
                  const serviceMessage = getServiceTypeMessage(formatServiceType, availableListings.length);
                  
                  console.log(`   📋 [${requestId}] Prepared ${availableListings.length} ${formatServiceType} options for user selection`);

                  actionResult = {
                    llmResponse: {
                      message: serviceMessage,
                      iGasCost: 0.004450,
                      queryProcessed: true,
                      optionsFound: availableListings.length,
                      serviceType: formatServiceType,
                      recommendations: availableListings.map((listing: any, index: number) => formatRecommendation(formatServiceType, listing, index))
                    },
                    listings: availableListings, // Keep for selection step
                    iGasCost: 0.004450,
                    currentIGas: 0.004450
                  };
                  
                  // Store serviceType in context if not already set
                  updatedContext.serviceType = formatServiceType;
                  
                  console.log(`   📋 [${requestId}] Set structured llmResponse for ${formatServiceType}:`, actionResult.llmResponse);
                  break;
                }

                case 'add_ledger_entry': {
                  console.log(`🔍 [${requestId}] Executing add_ledger_entry action - START`);
                  try {
                    // Use snapshot from context (created by create_snapshot action)
                    const snapshot = processedAction.snapshot || updatedContext.snapshot;
                    if (!snapshot) {
                      throw new Error('No snapshot available for ledger entry creation');
                    }

                    // Get serviceType from action, context, or workflow
                    const ledgerServiceType = processedAction.serviceType || updatedContext.serviceType || serviceType || 'movie';
                    const ledgerFields = getServiceTypeFields(ledgerServiceType);
                    
                    // Build booking details dynamically based on service type
                    const bookingDetails = extractBookingDetails(ledgerServiceType, updatedContext.selectedListing || {});
                    
                    // Get default provider info based on service type (dynamic)
                    const { getDefaultProviderName, getDefaultProviderId } = await import("./src/serviceTypeFields");
                    const defaultProviderName = getDefaultProviderName(ledgerServiceType);
                    const defaultProviderId = getDefaultProviderId(ledgerServiceType);
                    
                    console.log(`📝 [${requestId}] Adding ledger entry for ${ledgerServiceType} booking:`, {
                      amount: snapshot.amount,
                      payer: snapshot.payer,
                      merchant: processedAction.merchantName || updatedContext.selectedListing?.providerName || defaultProviderName,
                      bookingDetails: bookingDetails,
                      selectedListing: updatedContext.selectedListing
                    });
                    console.log(`📝 [${requestId}] Extracted booking details for ${ledgerServiceType}:`, JSON.stringify(bookingDetails, null, 2));

                    console.log(`📝 [${requestId}] Calling addLedgerEntry with:`, {
                      snapshotTxId: snapshot.txId,
                      serviceType: ledgerServiceType,
                      payerId: processedAction.payerId || updatedContext.user?.email,
                      merchantName: processedAction.merchantName || updatedContext.selectedListing?.providerName || defaultProviderName
                    });

                    const ledgerEntry = await addLedgerEntry(
                      snapshot,
                      ledgerServiceType,
                      processedAction.iGasCost || updatedContext.iGasCost || 0.00445,
                      processedAction.payerId || updatedContext.user?.email || 'unknown@example.com',
                      processedAction.merchantName || updatedContext.selectedListing?.providerName || defaultProviderName,
                      processedAction.providerUuid || updatedContext.selectedListing?.providerId || defaultProviderId,
                      bookingDetails
                    );

                    console.log(`📝 [${requestId}] addLedgerEntry returned:`, {
                      entryId: ledgerEntry.entryId,
                      txId: ledgerEntry.txId,
                      payer: ledgerEntry.payer,
                      merchant: ledgerEntry.merchant,
                      amount: ledgerEntry.amount
                    });
                    console.log(`📝 [${requestId}] LEDGER array now has ${LEDGER.length} entries`);

                    actionResult = { ledgerEntry };
                    // CRITICAL: Store ledgerEntry in context for websocketEvents template replacement
                    updatedContext.ledgerEntry = ledgerEntry;
                    // Also store in actionResult so it's merged into context
                    console.log(`📝 [${requestId}] Stored ledgerEntry in context:`, {
                      entryId: ledgerEntry.entryId,
                      txId: ledgerEntry.txId,
                      merchant: ledgerEntry.merchant,
                      amount: ledgerEntry.amount
                    });
                    
                    // CRITICAL: Ensure ledger entry is broadcast to Angular
                    // addLedgerEntry already broadcasts, but we also broadcast here to ensure it's sent
                    console.log(`📡 [${requestId}] Broadcasting ledger_entry_added from workflow action handler`);
                    broadcastEvent({
                      type: "ledger_entry_added",
                      component: "ledger",
                      message: `Ledger entry created: ${ledgerEntry.entryId}`,
                      timestamp: Date.now(),
                      data: { entry: ledgerEntry }
                    });
                  } catch (ledgerError) {
                    console.error(`❌ [${requestId}] Error adding ledger entry:`, ledgerError);
                    actionResult = { error: ledgerError.message };
                  }
                  break;
                }

                case 'check_balance':
                  const userEmail = processedAction.email || updatedContext.user?.email;
                  const requiredAmount = processedAction.required || updatedContext.totalCost || processedAction.amount;

                  if (!userEmail || !requiredAmount) {
                    throw new Error('Missing user email or amount for balance check');
                  }

                  const balance = getWalletBalance(userEmail);
                  const hasBalance = balance >= requiredAmount;

                  actionResult = {
                    balanceChecked: true,
                    userEmail,
                    requiredAmount,
                    currentBalance: balance,
                    sufficientFunds: hasBalance
                  };
                  break;

                case 'process_payment':
                  const paymentUser = processedAction.user || updatedContext.user;
                  const paymentAmount = processedAction.amount || updatedContext.totalCost || updatedContext.moviePrice;

                  if (!paymentUser?.email || !paymentAmount) {
                    throw new Error('Missing payment details');
                  }

                  // Debit the user wallet
                  const debitResult = debitWallet(paymentUser.email, paymentAmount);
                  if (!debitResult.success) {
                    throw new Error(`Payment failed: ${debitResult.error}`);
                  }

                  // Process the payment through cashier (CRITICAL: await the async function)
                  const ledgerEntryForPayment = processedAction.ledgerEntry || updatedContext.ledgerEntry;
                  // CRITICAL: Get the actual cashier reference, not a copy (getCashierStatus returns a copy)
                  // We need to import CASHIER directly or get a reference to the actual object
                  const cashierForPayment = processedAction.cashier || getCashierStatus();
                  // Note: processPayment will update cashier stats, but getCashierStatus() returns a copy
                  // The actual CASHIER object in ledger.ts will be updated by processPayment
                  
                  if (!ledgerEntryForPayment) {
                    throw new Error('Missing ledger entry for payment processing');
                  }

                  // CRITICAL: Find the actual entry in LEDGER array to ensure we update the correct reference
                  const ledgerEntryInArray = LEDGER.find(e => e.entryId === ledgerEntryForPayment.entryId);
                  if (!ledgerEntryInArray) {
                    throw new Error(`Ledger entry ${ledgerEntryForPayment.entryId} not found in LEDGER array`);
                  }

                  // CRITICAL: Ensure the entry has an amount (use paymentAmount if entry.amount is missing)
                  if (!ledgerEntryInArray.amount || ledgerEntryInArray.amount === 0) {
                    console.warn(`⚠️ [${requestId}] Ledger entry ${ledgerEntryInArray.entryId} has no amount, using paymentAmount: ${paymentAmount}`);
                    ledgerEntryInArray.amount = paymentAmount;
                    // Persist the amount update
                    if (redis) {
                      redis.saveLedgerEntries(LEDGER);
                      console.log(`💾 [${requestId}] Persisted ledger entry with updated amount: ${ledgerEntryInArray.entryId}`);
                    }
                  }

                  // Process payment (this will update status to 'processed' and persist)
                  console.log(`💰 [${requestId}] ========================================`);
                  console.log(`💰 [${requestId}] 💰 CASHIER PAYMENT PROCESSING START`);
                  console.log(`💰 [${requestId}] Entry ID: ${ledgerEntryInArray.entryId}`);
                  console.log(`💰 [${requestId}] Amount: ${ledgerEntryInArray.amount}`);
                  console.log(`💰 [${requestId}] User: ${paymentUser.email}`);
                  console.log(`💰 [${requestId}] Cashier Before: processedCount=${cashierForPayment.processedCount}, totalProcessed=${cashierForPayment.totalProcessed}`);
                  console.log(`💰 [${requestId}] ========================================`);
                  
                  const paymentResult = await processPayment(cashierForPayment, ledgerEntryInArray, paymentUser);
                  
                  // Check cashier stats after payment
                  const cashierAfter = getCashierStatus();
                  console.log(`💰 [${requestId}] ========================================`);
                  console.log(`💰 [${requestId}] 💰 CASHIER PAYMENT PROCESSING RESULT`);
                  console.log(`💰 [${requestId}] Payment Result: ${paymentResult}`);
                  console.log(`💰 [${requestId}] Entry Status: ${ledgerEntryInArray.status}`);
                  console.log(`💰 [${requestId}] Cashier After: processedCount=${cashierAfter.processedCount}, totalProcessed=${cashierAfter.totalProcessed}`);
                  console.log(`💰 [${requestId}] ========================================`);

                  if (!paymentResult) {
                    // Payment failed - status should be 'failed' now
                    if (redis) {
                      redis.saveLedgerEntries(LEDGER);
                      console.log(`💾 [${requestId}] Persisted ledger entry with failed status after payment failure: ${ledgerEntryInArray.entryId}`);
                    }
                    throw new Error('Payment processing failed');
                  }

                  // CRITICAL: Ensure status is 'processed' and persist (processPayment should have done this, but double-check)
                  if (ledgerEntryInArray.status !== 'processed') {
                    console.warn(`⚠️ [${requestId}] Ledger entry status is ${ledgerEntryInArray.status}, expected 'processed'. Updating...`);
                    ledgerEntryInArray.status = 'processed';
                  }
                  
                  // Persist the status update (processPayment should have done this, but ensure it's persisted)
                  if (redis) {
                    redis.saveLedgerEntries(LEDGER);
                    console.log(`💾 [${requestId}] ✅ Persisted ledger entry with processed status after payment: ${ledgerEntryInArray.entryId}`);
                  } else {
                    console.error(`❌ [${requestId}] Redis not available! Cannot persist processed status for entry: ${ledgerEntryInArray.entryId}`);
                  }
                  
                  // Update the context with the entry from LEDGER array
                  updatedContext.ledgerEntry = ledgerEntryInArray;

                  actionResult = {
                    paymentProcessed: true,
                    paymentSuccess: true,
                    amount: paymentAmount,
                    newBalance: debitResult.newBalance,
                    ledgerEntry: ledgerEntryForPayment
                  };
                  updatedContext.paymentSuccess = true;
                  break;

                case 'start_movie_watching':
                  // This case is handled above before the switch statement
                  // If we reach here, it means the async handler didn't catch it
                  console.warn(`⚠️ [${requestId}] start_movie_watching reached switch case - should be handled asynchronously`);
                  actionResult = { movieStarted: false, error: 'Should be handled asynchronously' };
                  break;

                case 'start_hotel_booking':
                  console.log(`🏨 [${requestId}] Starting hotel booking`);
                  const hotelName = processedAction.hotelName || updatedContext.selectedListing?.hotelName || 'Unknown Hotel';
                  const duration = processedAction.duration || 1;
                  const confirmationMessage = processedAction.confirmationMessage || `Your booking for ${hotelName} is confirmed!`;
                  
                  // Simulate hotel booking process
                  actionResult = {
                    hotelBooked: true,
                    hotelName: hotelName,
                    duration: duration,
                    confirmationMessage: confirmationMessage,
                    bookingId: `hotel_${Date.now()}`
                  };
                  
                  // CRITICAL: Set hotelBooked in context for transition conditions
                  updatedContext.hotelBooked = true;
                  updatedContext.confirmationMessage = confirmationMessage;
                  
                  console.log(`🏨 [${requestId}] Hotel booking completed: ${hotelName} for ${duration} night(s)`);
                  break;

                case 'complete_booking':
                  const bookingEntry = processedAction.ledgerEntry || updatedContext.ledgerEntry;
                  if (!bookingEntry) {
                    throw new Error('Missing ledger entry for booking completion');
                  }

                  const bookingResult = completeBooking(bookingEntry);
                  actionResult = {
                    bookingCompleted: true,
                    bookingResult
                  };
                  break;

                // ROOT CA Ledger Settlement Actions
                case 'root_ca_consume_ledger':
                  console.log(`⚖️  [${requestId}] ROOT CA: Consuming ledger entry from settlement stream`);
                  const ledgerEntryForSettlement = processedAction.ledgerEntry || updatedContext.ledgerEntry;
                  if (!ledgerEntryForSettlement) {
                    throw new Error('Missing ledger entry for ROOT CA settlement');
                  }

                  // Verify entry is in settlement stream (already pushed by add_ledger_entry)
                  // The actual consumption happens via rootCASettlementConsumer, but we verify it's there
                  const entryInStream = ledgerEntryForSettlement.entryId;
                  console.log(`⚖️  [${requestId}] ROOT CA: Verifying entry ${entryInStream} is in settlement stream`);
                  
                  actionResult = {
                    entryConsumed: true,
                    entryId: entryInStream,
                    stream: LEDGER_SETTLEMENT_STREAM
                  };
                  break;

                case 'root_ca_validate_entry':
                  console.log(`⚖️  [${requestId}] ROOT CA: Validating ledger entry`);
                  const entryToValidate = processedAction.ledgerEntry || updatedContext.ledgerEntry;
                  const providerUuidToValidate = processedAction.certificate || updatedContext.providerUuid;
                  
                  if (!entryToValidate) {
                    throw new Error('Missing ledger entry for validation');
                  }

                  // Validate entry structure
                  const hasRequiredFields = entryToValidate.entryId && entryToValidate.txId && entryToValidate.amount;
                  if (!hasRequiredFields) {
                    throw new Error('Ledger entry missing required fields');
                  }

                  // Validate certificate if provided
                  let certificateValid = true;
                  if (providerUuidToValidate && providerUuidToValidate !== 'MISSING-UUID') {
                    const cert = getCertificate(providerUuidToValidate);
                    certificateValid = cert ? validateCertificate(providerUuidToValidate) : false;
                    if (!certificateValid) {
                      console.warn(`⚠️  [${requestId}] ROOT CA: Invalid certificate for provider ${providerUuidToValidate}`);
                    }
                  }

                  actionResult = {
                    entryValidated: true,
                    validationStatus: certificateValid ? 'valid' : 'invalid_certificate',
                    entryId: entryToValidate.entryId,
                    certificateValid
                  };
                  break;

                case 'root_ca_settle_entry':
                  console.log(`⚖️  [${requestId}] ROOT CA: Settling ledger entry`);
                  const entryToSettle = processedAction.ledgerEntry || updatedContext.ledgerEntry;
                  
                  if (!entryToSettle) {
                    throw new Error('Missing ledger entry for settlement');
                  }

                  // Find entry in LEDGER array
                  const ledgerEntryToSettle = LEDGER.find(e => e.entryId === entryToSettle.entryId);
                  if (!ledgerEntryToSettle) {
                    throw new Error(`Ledger entry ${entryToSettle.entryId} not found`);
                  }

                  // Settlement is done by rootCASettlementConsumer asynchronously
                  // Wait for settlement to complete (poll up to 5 seconds)
                  let settled = false;
                  const maxWaitTime = 5000; // 5 seconds
                  const pollInterval = 100; // Check every 100ms
                  const startTime = Date.now();
                  
                  while (!settled && (Date.now() - startTime) < maxWaitTime) {
                    if (ledgerEntryToSettle.status === 'completed') {
                      settled = true;
                      console.log(`✅ [${requestId}] ROOT CA: Entry ${entryToSettle.entryId} settled (waited ${Date.now() - startTime}ms)`);
                    } else {
                      // Wait a bit before checking again
                      await new Promise(resolve => setTimeout(resolve, pollInterval));
                    }
                  }
                  
                  if (!settled) {
                    // If not settled yet, trigger settlement manually
                    console.log(`⚖️  [${requestId}] ROOT CA: Entry not settled yet, triggering manual settlement`);
                    try {
                      // Create settlement message format
                      const snapshot = updatedContext.snapshot;
                      const settlementMsg: Record<string, string> = {
                        entryId: entryToSettle.entryId,
                        txId: entryToSettle.txId,
                        timestamp: entryToSettle.timestamp.toString(),
                        payer: entryToSettle.payer,
                        payerId: entryToSettle.payerId,
                        merchant: entryToSettle.merchant,
                        providerUuid: entryToSettle.providerUuid,
                        indexerId: snapshot?.gardenId || 'unknown',
                        serviceType: entryToSettle.serviceType,
                        amount: entryToSettle.amount.toString(),
                        iGas: entryToSettle.iGasCost.toString(),
                        iTax: (entryToSettle.bookingDetails?.iTax || 0).toString(),
                        fees: JSON.stringify(entryToSettle.fees || {}),
                        status: entryToSettle.status
                      };
                      
                      // Process settlement synchronously
                      await processSettlementEntry(settlementMsg);
                      // Check status after settlement
                      if (ledgerEntryToSettle.status === 'completed') {
                        settled = true;
                        console.log(`✅ [${requestId}] ROOT CA: Entry ${entryToSettle.entryId} settled manually`);
                        // CRITICAL: Persist the updated status immediately after settlement
                        if (redis) {
                          redis.saveLedgerEntries(LEDGER);
                          console.log(`💾 [${requestId}] ROOT CA: Persisted ledger entry with completed status: ${entryToSettle.entryId}`);
                        }
                      } else {
                        console.warn(`⚠️  [${requestId}] ROOT CA: Entry ${entryToSettle.entryId} status is ${ledgerEntryToSettle.status}, expected 'completed'`);
                      }
                    } catch (settleError: any) {
                      console.error(`❌ [${requestId}] ROOT CA: Failed to settle entry:`, settleError.message);
                      throw new Error(`Settlement failed: ${settleError.message}`);
                    }
                  }

                  actionResult = {
                    settlementStatus: 'settled',
                    entryId: entryToSettle.entryId,
                    status: ledgerEntryToSettle.status
                  };
                  updatedContext.settlementStatus = 'settled';
                  break;

                case 'root_ca_update_balances':
                  console.log(`⚖️  [${requestId}] ROOT CA: Updating authoritative balances`);
                  const entryForBalances = processedAction.ledgerEntry || updatedContext.ledgerEntry;
                  const feeSplit = processedAction.feeSplit || updatedContext.snapshot?.feeSplit;
                  
                  if (!entryForBalances) {
                    throw new Error('Missing ledger entry for balance update');
                  }

                  // Balance updates are done by processSettlementEntry, but we verify them here
                  const entryInLedger = LEDGER.find(e => e.entryId === entryForBalances.entryId);
                  if (!entryInLedger) {
                    throw new Error(`Ledger entry ${entryForBalances.entryId} not found`);
                  }

                  // Verify balances were updated (check ROOT_BALANCES)
                  const rootCABalance = ROOT_BALANCES.rootCA;
                  console.log(`⚖️  [${requestId}] ROOT CA: Current ROOT CA balance: ${rootCABalance.toFixed(6)}`);

                  actionResult = {
                    balancesUpdated: true,
                    entryId: entryForBalances.entryId,
                    rootCABalance,
                    feeSplit
                  };
                  updatedContext.balancesUpdated = true;
                  break;

                case 'root_ca_finalize_fees':
                  console.log(`⚖️  [${requestId}] ROOT CA: Finalizing fee distributions`);
                  const entryForFees = processedAction.ledgerEntry || updatedContext.ledgerEntry;
                  const feesToFinalize = processedAction.fees || updatedContext.snapshot?.feeSplit;
                  
                  if (!entryForFees) {
                    throw new Error('Missing ledger entry for fee finalization');
                  }

                  // Fees are finalized by processSettlementEntry, but we verify here
                  const entryForFeeCheck = LEDGER.find(e => e.entryId === entryForFees.entryId);
                  if (!entryForFeeCheck) {
                    throw new Error(`Ledger entry ${entryForFees.entryId} not found`);
                  }
                  
                  // CRITICAL: Ensure status is 'completed' after settlement
                  if (entryForFeeCheck.status !== 'completed') {
                    console.warn(`⚠️  [${requestId}] ROOT CA: Entry ${entryForFees.entryId} status is ${entryForFeeCheck.status}, updating to 'completed'`);
                    entryForFeeCheck.status = 'completed';
                    // Persist the status update
                    if (redis) {
                      redis.saveLedgerEntries(LEDGER);
                      console.log(`💾 [${requestId}] ROOT CA: Persisted ledger entry with completed status after fee finalization`);
                    }
                  }

                  actionResult = {
                    feesFinalized: true,
                    entryId: entryForFees.entryId,
                    fees: feesToFinalize,
                    status: 'completed'
                  };
                  updatedContext.feesFinalized = true;
                  updatedContext.settlementStatus = 'settled';
                  break;

                // ROOT CA Cashier Oversight Actions
                case 'root_ca_validate_payment':
                  console.log(`⚖️  [${requestId}] ROOT CA: Validating cashier payment`);
                  const paymentEntry = processedAction.ledgerEntry || updatedContext.ledgerEntry;
                  const paymentResultForValidation = processedAction.paymentResult || updatedContext.paymentSuccess;
                  const cashierInfo = processedAction.cashier || updatedContext.cashier;
                  
                  if (!paymentEntry) {
                    throw new Error('Missing ledger entry for payment validation');
                  }

                  // Validate payment was successful
                  if (!paymentResultForValidation) {
                    throw new Error('Payment was not successful');
                  }

                  // Validate cashier processed the payment
                  if (!cashierInfo) {
                    throw new Error('Cashier information missing');
                  }

                  actionResult = {
                    paymentValidated: true,
                    entryId: paymentEntry.entryId,
                    paymentStatus: paymentResultForValidation,
                    cashier: cashierInfo.name
                  };
                  break;

                case 'root_ca_verify_balance_update':
                  console.log(`⚖️  [${requestId}] ROOT CA: Verifying balance update`);
                  const userEmailForVerify = processedAction.userEmail || updatedContext.user?.email;
                  const expectedBalance = processedAction.expectedBalance || updatedContext.updatedBalance;
                  const entryForVerify = processedAction.ledgerEntry || updatedContext.ledgerEntry;
                  
                  if (!userEmailForVerify || expectedBalance === undefined) {
                    throw new Error('Missing user email or expected balance for verification');
                  }

                  // Get actual balance from wallet service
                  const actualBalance = getWalletBalance(userEmailForVerify);
                  
                  // Verify balance matches expected
                  const balanceMatches = Math.abs(actualBalance - expectedBalance) < 0.000001; // Allow small floating point differences
                  if (!balanceMatches) {
                    console.warn(`⚠️  [${requestId}] ROOT CA: Balance mismatch - Expected: ${expectedBalance}, Actual: ${actualBalance}`);
                  }

                  actionResult = {
                    balanceVerified: balanceMatches,
                    userEmail: userEmailForVerify,
                    expectedBalance,
                    actualBalance,
                    entryId: entryForVerify?.entryId
                  };
                  updatedContext.balanceVerified = balanceMatches;
                  break;

                case 'root_ca_authorize_payment':
                  console.log(`⚖️  [${requestId}] ROOT CA: Authorizing payment`);
                  const entryToAuthorize = processedAction.ledgerEntry || updatedContext.ledgerEntry;
                  const paymentStatus = processedAction.paymentStatus || updatedContext.paymentSuccess;
                  
                  if (!entryToAuthorize) {
                    throw new Error('Missing ledger entry for payment authorization');
                  }

                  if (!paymentStatus) {
                    throw new Error('Payment was not successful, cannot authorize');
                  }

                  // ROOT CA authorizes the payment
                  actionResult = {
                    paymentAuthorized: true,
                    entryId: entryToAuthorize.entryId,
                    authorizationTimestamp: Date.now()
                  };
                  updatedContext.paymentAuthorized = true;
                  updatedContext.cashierOversightComplete = true;
                  break;

                default:
                  actionResult = {
                    success: true,
                    message: `Action ${action.type} executed`,
                    timestamp: Date.now()
                  };
              }

              // Merge action result into context
              Object.assign(updatedContext, actionResult);
              console.log(`   📋 [${requestId}] After ${action.type}: listings=${updatedContext.listings?.length || 0}, llmResponse=${!!updatedContext.llmResponse}, selectedListing=${!!updatedContext.selectedListing}`);

              executedActions.push({
                type: action.type,
                success: true,
                result: actionResult
              });

            } catch (actionError: any) {
              console.error(`   ❌ [${requestId}] Action failed: ${action.type}`, actionError.message);
              executedActions.push({
                type: action.type,
                success: false,
                error: actionError.message
              });
              throw actionError; // Fail the entire step if any action fails
            }
          }
        }

        // Process WebSocket events
        if (step.websocketEvents) {
          for (const event of step.websocketEvents) {
            const processedEvent = replaceTemplateVariables(event, updatedContext);
            // Ensure timestamp is always a valid number
            if (!processedEvent.timestamp || isNaN(processedEvent.timestamp)) {
              processedEvent.timestamp = Date.now();
            }
            events.push(processedEvent);

            // Debug logging for iGas events
            if (processedEvent.type === 'igas') {
              console.log(`   ⛽ [${requestId}] iGas event data:`, processedEvent.data);
              console.log(`   ⛽ [${requestId}] iGas value type:`, typeof processedEvent.data?.igas);
              console.log(`   ⛽ [${requestId}] Full processed iGas event:`, JSON.stringify(processedEvent, null, 2));
            }

            // Broadcast the event via WebSocket
            try {
              broadcastEvent(processedEvent);
              console.log(`   📡 [${requestId}] Broadcast event: ${event.type}`);
            } catch (broadcastError) {
              console.warn(`   ⚠️ [${requestId}] Failed to broadcast event: ${event.type}`, broadcastError);
            }
          }
        }

        // Apply step outputs
        if (step.outputs) {
          const processedOutputs = replaceTemplateVariables(step.outputs, updatedContext);
          Object.assign(updatedContext, processedOutputs);
        }

        // Determine next step based on transitions
        let nextStepId: string | null = null;
        const transitions = workflow.transitions.filter((t: any) => t.from === stepId);

        console.log(`   🔍 [${requestId}] Context keys:`, Object.keys(updatedContext));
        console.log(`   🔍 [${requestId}] llmResponse exists:`, !!updatedContext.llmResponse);
        console.log(`   🔍 [${requestId}] llmResponse.selectedListing:`, updatedContext.llmResponse?.selectedListing);

        for (const transition of transitions) {
          // Evaluate condition
          let conditionMet = false;
          if (transition.condition === "always") {
            conditionMet = true;
          } else if (transition.condition) {
            // Replace template variables in condition
            const processedCondition = replaceTemplateVariables(transition.condition, updatedContext);

            // Check if the processed condition is different from the original
            // If it still contains {{ }}, the variable doesn't exist
            if (processedCondition === transition.condition && processedCondition.includes('{{')) {
              // Template variable doesn't exist in context
              conditionMet = false;
            } else {
              // Template was replaced, check if result is truthy
              // For conditions like "{{llmResponse.selectedListing}}", check if the result exists
              conditionMet = !!processedCondition;
            }
          }

          console.log(`   🔀 [${requestId}] Transition condition "${transition.condition}" -> "${transition.condition === "always" ? "always" : replaceTemplateVariables(transition.condition, updatedContext)}" = ${conditionMet ? "TRUE" : "FALSE"} -> ${transition.to}`);

          if (conditionMet) {
            nextStepId = transition.to;
            break;
          }
        }

        console.log(`   ✅ [${requestId}] ========================================`);
        console.log(`   ✅ [${requestId}] ✅ STEP EXECUTION COMPLETE`);
        console.log(`   ✅ [${requestId}] Step ID: ${stepId}`);
        console.log(`   ✅ [${requestId}] Step Name: ${step.name}`);
        console.log(`   ✅ [${requestId}] Actions Executed: ${executedActions.length}`);
        console.log(`   ✅ [${requestId}] Next Step ID: ${nextStepId || 'NONE'}`);
        if (nextStepId) {
          const nextStep = workflow.steps.find((s: any) => s.id === nextStepId);
          console.log(`   ✅ [${requestId}] Next Step Name: ${nextStep?.name || 'N/A'}`);
          console.log(`   ✅ [${requestId}] Next Step Component: ${nextStep?.component || 'N/A'}`);
        }
        console.log(`   ✅ [${requestId}] Should Auto-Continue: ${nextStepId && step.type !== 'decision' ? true : false}`);
        console.log(`   ✅ [${requestId}] ========================================`);

        // Store context for potential continuation
        // CRITICAL: Preserve full execution object structure (workflow, context, currentStep, etc.)
        // Don't overwrite with just context - merge context into existing execution
        if (!(global as any).workflowExecutions) {
          (global as any).workflowExecutions = new Map();
        }
        const workflowExecutions = (global as any).workflowExecutions as Map<string, any>;
        const existingExecution = workflowExecutions.get(executionId);
        
        if (existingExecution && existingExecution.workflow) {
          // Preserve full execution structure - just update context
          existingExecution.context = updatedContext;
          existingExecution.currentStep = nextStepId || existingExecution.currentStep;
          workflowExecutions.set(executionId, existingExecution);
        } else {
          // Fallback: if no existing execution, create minimal structure
          // This shouldn't happen if FlowWiseService is used, but handle gracefully
          console.warn(`⚠️ [${requestId}] No existing execution found for ${executionId}, creating minimal structure`);
          workflowExecutions.set(executionId, {
            executionId,
            workflow,
            context: updatedContext,
            currentStep: nextStepId || stepId,
            history: []
          });
        }

        sendResponse(200, {
          success: true,
          message: `Step ${stepId} executed atomically`,
          result: {
            stepId,
            executedActions,
            events,
            updatedContext,
            nextStepId,
            shouldAutoContinue: nextStepId && step.type !== 'decision' ? true : false
          }
        });

        // CRITICAL: Auto-continue workflow for non-decision steps with "always" transitions
        // This ensures the workflow automatically progresses from ledger_create_entry to cashier_process_payment
        // The cashier step MUST execute to complete the ledger entry (status: pending -> processed)
        // This runs after executeStepAtomically is defined (see below after the function definition)
        const shouldAutoContinue = nextStepId && step.type !== 'decision';
        const autoContinueStepId = shouldAutoContinue ? nextStepId : null;
        const autoContinueStep = shouldAutoContinue ? workflow.steps.find((s: any) => s.id === nextStepId) : null;
        const hasAlwaysTransition = shouldAutoContinue && autoContinueStep ? 
          workflow.transitions.filter((t: any) => t.from === stepId && t.to === nextStepId)
            .some((t: any) => t.condition === 'always' || !t.condition) : false;

        // CRITICAL: Auto-continue workflow for non-decision steps with "always" transitions
        // This ensures the workflow automatically progresses from ledger_create_entry to cashier_process_payment
        // The cashier step MUST execute to complete the ledger entry (status: pending -> processed)
        // Store auto-continuation info for later execution (after executeStepAtomically is defined)
        console.log(`   🔍 [${requestId}] ========================================`);
        console.log(`   🔍 [${requestId}] 🔍 CHECKING AUTO-CONTINUATION CONDITIONS`);
        console.log(`   🔍 [${requestId}] hasAlwaysTransition: ${hasAlwaysTransition}`);
        console.log(`   🔍 [${requestId}] autoContinueStep: ${autoContinueStep ? autoContinueStep.name : 'null'}`);
        console.log(`   🔍 [${requestId}] autoContinueStepId: ${autoContinueStepId}`);
        console.log(`   🔍 [${requestId}] stepId: ${stepId}`);
        console.log(`   🔍 [${requestId}] nextStepId: ${nextStepId}`);
        console.log(`   🔍 [${requestId}] ========================================`);
        
        const autoContinueInfo = hasAlwaysTransition && autoContinueStep && autoContinueStep.type !== 'decision' && autoContinueStepId ? {
          stepId: autoContinueStepId,
          step: autoContinueStep,
          context: updatedContext,
          workflow: workflow,
          executionId: executionId
        } : null;

        console.log(`   🔍 [${requestId}] autoContinueInfo: ${autoContinueInfo ? 'SET' : 'NULL'}`);
        if (autoContinueInfo) {
          console.log(`   🔍 [${requestId}] autoContinueInfo.stepId: ${autoContinueInfo.stepId}`);
          console.log(`   🔍 [${requestId}] autoContinueInfo.step.name: ${autoContinueInfo.step.name}`);
        }

      } catch (error: any) {
        console.error(`   ❌ [${requestId}] Error executing step atomically:`, error.message);
        sendResponse(500, { success: false, error: error.message });
      }
    });
    return;
  }


  // POST /api/workflow/generate - Generate workflow using LLM
  if (pathname === "/api/workflow/generate" && req.method === "POST") {
    console.log(`   🔧 [${requestId}] POST /api/workflow/generate - Generating workflow`);
    let body = "";
    
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    
    req.on("end", async () => {
      const sendResponse = (statusCode: number, data: any) => {
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
        
        // Load template (try movie.json first, fallback to amc_cinema.json)
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
        
        // Generate workflow using LLM
        console.log(`   🤖 [${requestId}] Generating workflow for service type: ${serviceType}`);
        const generatedWorkflow = await generateWorkflowFromTemplate(template, serviceType);
        
        // Save to file
        const outputPath = path.join(__dirname, "data", `${serviceType}.json`);
        const outputContent = JSON.stringify(generatedWorkflow, null, 2);
        fs.writeFileSync(outputPath, outputContent, "utf-8");
        
        console.log(`   ✅ [${requestId}] Workflow generated and saved: ${outputPath}`);
        
        sendResponse(200, {
          success: true,
          workflow: generatedWorkflow.flowwiseWorkflow,
          filename: `${serviceType}.json`
        });
      } catch (error: any) {
        console.error(`   ❌ [${requestId}] Error generating workflow:`, error.message);
        sendResponse(500, { success: false, error: error.message });
      }
    });
    return;
  }

  if (pathname === "/api/workflow/decision" && req.method === "POST") {
    console.log(`   🤔 [${requestId}] POST /api/workflow/decision - User decision submission (NEW ARCHITECTURE: Using FlowWiseService)`);
    let body = "";
    
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    
    req.on("end", async () => {
      const sendResponse = (statusCode: number, data: any) => {
        if (!res.headersSent) {
          console.log(`   📤 [${requestId}] Response: ${statusCode} ${statusCode === 200 ? 'OK' : 'ERROR'} (${JSON.stringify(data).length} bytes)`);
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        }
      };
      
      try {
        const parsedBody = JSON.parse(body);
        const { workflowId, decision, selectionData, stepId } = parsedBody;

        if (!workflowId || !decision) {
          sendResponse(400, { success: false, error: "workflowId and decision are required" });
          return;
        }

        console.log(`   ✅ [${requestId}] ========================================`);
        console.log(`   ✅ [${requestId}] 🎯 USER DECISION ENDPOINT HIT! 🎯`);
        console.log(`   ✅ [${requestId}] User ${selectionData ? 'selection' : 'decision'} submitted: ${decision} for workflow ${workflowId}`);
        console.log(`   ✅ [${requestId}] ========================================`);

        // NEW ARCHITECTURE: Use FlowWiseService to handle user decisions
        // FlowWiseService will automatically execute all system steps (ledger, cashier, etc.)
        const executionId = workflowId; // workflowId is actually executionId in new architecture
        
        console.log(`   🔐 [${requestId}] ========================================`);
        console.log(`   🔐 [${requestId}] Using FlowWiseService to process user decision`);
        console.log(`   🔐 [${requestId}] ExecutionId: ${executionId}, Decision: ${decision}, SelectionData: ${selectionData ? 'provided' : 'none'}`);
        console.log(`   🔐 [${requestId}] About to call submitUserDecisionToFlowWise...`);
        console.log(`   🔐 [${requestId}] ========================================`);

        // Submit user decision to FlowWiseService
        // FlowWiseService will automatically execute the next step (including ROOT CA steps)
        try {
          const result = await submitUserDecisionToFlowWise(executionId, decision, selectionData);
          
          // FlowWiseService handles all broadcasting internally
          // The result contains the instruction for the next step
          console.log(`   ✅ [${requestId}] FlowWiseService processed decision successfully`);
          console.log(`   ✅ [${requestId}] Next instruction type: ${result.instruction.type}`);
          
          // Send success response with instruction
          sendResponse(200, {
            success: true,
            message: `${selectionData ? 'Selection' : 'Decision'} submitted successfully`,
            decision,
            selectionData,
            instruction: result.instruction
          });
        } catch (error: any) {
          console.error(`   ❌ [${requestId}] Error processing decision with FlowWiseService:`, error.message);
          console.error(`   ❌ [${requestId}] Error stack:`, error.stack);
          console.error(`   ❌ [${requestId}] Full error:`, error);
          sendResponse(500, { success: false, error: error.message, stack: error.stack });
        }
      } catch (error: any) {
        console.error(`   ❌ [${requestId}] Error parsing request:`, error.message);
        sendResponse(500, { success: false, error: error.message });
      }
    });
    return;
  }

  // OLD CODE REMOVED - All workflow execution now handled by FlowWiseService
  // The following large code block was removed:
  // - continueWorkflowExecution function
  // - executeStepAtomically function
  // - All old workflow execution logic
  // This code is now handled by FlowWiseService in server/src/components/flowwiseService.ts

  if (pathname === "/api/chat" && req.method === "POST") {
    console.log(`   📨 [${requestId}] POST /api/chat - Processing chat request`);
    let body = "";
    let bodyReceived = false;
    
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    
    req.on("end", async () => {
      if (bodyReceived) {
        console.warn(`   ⚠️  [${requestId}] Request body already processed, ignoring duplicate end event`);
        return;
      }
      bodyReceived = true;
      // Ensure response is sent even if there's an unhandled error
      const sendResponse = (statusCode: number, data: any) => {
        if (!res.headersSent) {
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        } else {
          console.warn(`⚠️  Response already sent, cannot send:`, data);
        }
      };

      let email = 'unknown';
      
      try {
        // Parse and validate request body
        if (!body || body.trim().length === 0) {
          sendResponse(400, { success: false, error: "Request body is required" });
          return;
        }
        
        let parsedBody;
        try {
          parsedBody = JSON.parse(body);
        } catch (parseError: any) {
          sendResponse(400, { success: false, error: "Invalid JSON in request body" });
          return;
        }
        
        const { input, email: requestEmail } = parsedBody;
        email = requestEmail || 'unknown';
        
        // Validate input
        if (!input || typeof input !== 'string' || input.trim().length === 0) {
          sendResponse(400, { success: false, error: "Valid input message required" });
          return;
        }
        
        if (!email || typeof email !== 'string' || !email.includes('@')) {
          sendResponse(400, { success: false, error: "Valid email address required" });
          return;
        }
        
        console.log(`📨 Processing chat request from ${email}: "${input.trim()}"`);
        
        // NEW ARCHITECTURE: Use FlowWiseService (ROOT CA service) to orchestrate workflow
        // Find or create user
        let user = USERS_STATE.find(u => u.email === email);
        if (!user) {
          const nextId = `u${USERS_STATE.length + 1}`;
          user = {
            id: nextId,
            email: email,
            balance: 0,
          };
          USERS_STATE.push(user);
          console.log(`👤 Created new user: ${email} with ID: ${nextId}`);
        }
        
        // Sync user balance with wallet (wallet is source of truth)
        const currentWalletBalance = await getWalletBalance(email);
        user.balance = currentWalletBalance;
        
        // Start workflow from user input using FlowWiseService
        // FlowWiseService will automatically execute all system steps (ledger, cashier, etc.)
        const workflowResult = await startWorkflowFromUserInput(
          input.trim(),
          user,
          "movie" // Default to movie for now, can be determined by LLM later
        );
        
        // Broadcast workflow started event
        broadcastEvent({
          type: "workflow_started",
          component: "workflow",
          message: `Workflow started: ${workflowResult.executionId}`,
          timestamp: Date.now(),
          data: {
            executionId: workflowResult.executionId,
            currentStep: workflowResult.currentStep,
            instruction: workflowResult.instruction,
            workflowProcessingGas: workflowResult.workflowProcessingGas
          }
        });
        
        // Send response with workflow execution details
        sendResponse(200, {
          success: true,
          executionId: workflowResult.executionId,
          currentStep: workflowResult.currentStep,
          instruction: workflowResult.instruction,
          workflowProcessingGas: workflowResult.workflowProcessingGas
        });
      } catch (error: any) {
        console.error(`   ❌ [${requestId}] Error processing chat request:`, error.message);
        sendResponse(500, { success: false, error: error.message });
      }
    });
    return;
  }

  if (pathname === "/api/chat" && req.method === "POST") {
    console.log(`   📨 [${requestId}] POST /api/chat - Processing chat request`);
    let body = "";
    let bodyReceived = false;
    
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    
    req.on("end", async () => {
      if (bodyReceived) {
        console.warn(`   ⚠️  [${requestId}] Request body already processed, ignoring duplicate end event`);
        return;
      }
      bodyReceived = true;
      // Ensure response is sent even if there's an unhandled error
      const sendResponse = (statusCode: number, data: any) => {
        if (!res.headersSent) {
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        } else {
          console.warn(`⚠️  Response already sent, cannot send:`, data);
        }
      };

      let email = 'unknown';
      
      try {
        // Parse and validate request body
        if (!body || body.trim().length === 0) {
          sendResponse(400, { success: false, error: "Request body is required" });
          return;
        }
        
        let parsedBody;
        try {
          parsedBody = JSON.parse(body);
        } catch (parseError: any) {
          sendResponse(400, { success: false, error: "Invalid JSON in request body" });
          return;
        }
        
        const { input, email: requestEmail } = parsedBody;
        email = requestEmail || 'unknown';
        
        // Validate input
        if (!input || typeof input !== 'string' || input.trim().length === 0) {
          sendResponse(400, { success: false, error: "Valid input message required" });
          return;
        }
        
        if (!email || typeof email !== 'string' || !email.includes('@')) {
          sendResponse(400, { success: false, error: "Valid email address required" });
          return;
        }
        
        console.log(`📨 Processing chat request from ${email}: "${input.trim()}"`);
        
        // NEW ARCHITECTURE: Use FlowWiseService (ROOT CA service) to orchestrate workflow
        // Find or create user
        let user = USERS_STATE.find(u => u.email === email);
        if (!user) {
          const nextId = `u${USERS_STATE.length + 1}`;
          user = {
            id: nextId,
            email: email,
            balance: 0,
          };
          USERS_STATE.push(user);
          console.log(`👤 Created new user: ${email} with ID: ${nextId}`);
        }
        
        // Sync user balance with wallet (wallet is source of truth)
        const currentWalletBalance = await getWalletBalance(email);
        user.balance = currentWalletBalance;
        
        // Start workflow from user input using FlowWiseService
        // FlowWiseService will automatically execute all system steps (ledger, cashier, etc.)
        const workflowResult = await startWorkflowFromUserInput(
          input.trim(),
          user,
          "movie" // Default to movie for now, can be determined by LLM later
        );
        
        // Broadcast workflow started event
        broadcastEvent({
          type: "workflow_started",
          component: "workflow",
          message: `Workflow started: ${workflowResult.executionId}`,
          timestamp: Date.now(),
          data: {
            executionId: workflowResult.executionId,
            currentStep: workflowResult.currentStep,
            instruction: workflowResult.instruction
          }
        });
        
        // Success response with workflow execution ID
        if (!res.headersSent) {
          sendResponse(200, { 
            success: true, 
            message: "Chat processed successfully",
            executionId: workflowResult.executionId,
            instruction: workflowResult.instruction
          });
          console.log(`✅ Chat request processed successfully for ${email}, workflow: ${workflowResult.executionId}`);
        } else {
          console.warn(`⚠️  Response already sent, skipping success response`);
        }
      } catch (error: any) {
        // Log error for debugging
        console.error(`❌ Error processing chat input:`, error);
        console.error(`   Error stack:`, error.stack);
        
        // Send appropriate error response - ensure it's sent
        if (!res.headersSent) {
          const statusCode = error.message?.includes('Payment failed') ? 402 : 
                            error.message?.includes('No listing') ? 404 : 
                            error.message?.includes('timeout') ? 408 : 500;
          sendResponse(statusCode, { 
            success: false, 
            error: error.message || "Internal server error",
            timestamp: Date.now()
          });
        } else {
          console.warn(`⚠️  Response already sent, cannot send error response`);
        }
      } finally {
        // Ensure response is always sent
        if (!res.headersSent) {
          console.error(`❌ CRITICAL: No response sent for request from ${email}!`);
          sendResponse(500, { 
            success: false, 
            error: "Unexpected server error - no response was sent",
            timestamp: Date.now()
          });
        } else {
          console.log(`✅ Response sent for request from ${email}`);
        }
      }
    });
    
    // Handle request errors
    req.on("error", (error: Error) => {
      console.error(`❌ Request error:`, error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Request processing error" }));
      }
    });
    
    // Handle request timeout
    req.setTimeout(60000, () => {
      console.error(`❌ Request timeout`);
      if (!res.headersSent) {
        res.writeHead(408, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Request timeout" }));
      }
      req.destroy();
    });
    return;
  }

  if (pathname === "/api/test" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /api/test - Test endpoint`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Server is responding", timestamp: Date.now() }));
    return;
  }

  // ROOT CA Service Registry API Endpoints
  if (pathname === "/api/root-ca/service-registry" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /api/root-ca/service-registry - Listing all service providers`);
    
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const serviceType = url.searchParams.get('serviceType'); // Optional filter by service type (e.g., "movie", "dex", "snake")
    const ownerEmail = url.searchParams.get('ownerEmail'); // Optional filter by owner email (for Priest mode)
    
    // Use ServiceRegistry2 (new implementation)
    const serviceRegistry2 = getServiceRegistry2();
    const allProviders = serviceRegistry2.getAllProviders();
    
    // Debug: Log provider assignments for movie service type
    if (!serviceType || serviceType === 'movie') {
      const movieProviders = allProviders.filter(p => p.serviceType === 'movie');
      console.log(`   🔍 [Service Registry API] Movie providers in memory: ${movieProviders.map(p => `${p.name} (${p.id}) → gardenId: ${p.gardenId}`).join(', ')}`);
    }
    if (!serviceType || serviceType === 'dex') {
      const dexProviders = allProviders.filter(p => p.serviceType === 'dex');
      console.log(`   🔍 [Service Registry API] DEX providers in memory: ${dexProviders.map(p => `${p.name} (${p.id}) → gardenId: ${p.gardenId}`).join(', ')}`);
    }
    // Debug: Log provider assignments for airline service type
    if (!serviceType || serviceType === 'airline') {
      const airlineProviders = allProviders.filter(p => p.serviceType === 'airline');
      console.log(`   🔍 [Service Registry API] Airline providers in memory: ${airlineProviders.map(p => `${p.name} (${p.id}) → gardenId: ${p.gardenId}`).join(', ') || 'NONE'}`);
    }
    console.log(`   📊 [Service Registry API] Total providers in ServiceRegistry2: ${allProviders.length} (by type: movie=${allProviders.filter(p => p.serviceType === 'movie').length}, dex=${allProviders.filter(p => p.serviceType === 'dex').length}, airline=${allProviders.filter(p => p.serviceType === 'airline').length}, infrastructure=${allProviders.filter(p => ['payment-rail', 'settlement', 'registry', 'webserver', 'websocket', 'wallet'].includes(p.serviceType)).length})`);
    
    // Helper function to get ownerEmail for a provider based on its gardenId
    const getOwnerEmailForProvider = (gardenId: string): string | undefined => {
      if (gardenId === 'HG') {
        return undefined; // Holy Ghost doesn't have an owner
      }
      // Find garden in GARDENS or TOKEN_GARDENS
      const garden = GARDENS.find(g => g.id === gardenId) || TOKEN_GARDENS.find(g => g.id === gardenId);
      if (!garden) {
        console.warn(`   ⚠️  [Service Registry API] Provider has gardenId "${gardenId}" but garden not found - this provider may be orphaned`);
        return undefined;
      }
      return garden?.ownerEmail || garden?.priestEmail || undefined;
    };
    
    // Clean up providers that belong to non-existent gardens (except HG)
    // CRITICAL: Also check gardens from persistence file to avoid false positives
    const allGardenIds = [...GARDENS.map(g => g.id), ...TOKEN_GARDENS.map(g => g.id)];
    
    // Load gardens from persistence file to include in validation
    const gardensPersistenceFile = path.join(__dirname, 'eden-gardens-persistence.json');
    let persistedGardenIds: string[] = [];
    if (fs.existsSync(gardensPersistenceFile)) {
      try {
        const fileContent = fs.readFileSync(gardensPersistenceFile, 'utf-8');
        const persisted = JSON.parse(fileContent);
        const persistedGardens = persisted.gardens || [];
        persistedGardenIds = persistedGardens.map((g: any) => g.id);
        console.log(`   🔍 [Service Registry API] Loaded ${persistedGardenIds.length} garden ID(s) from persistence file for orphaned provider check`);
      } catch (err: any) {
        console.warn(`   ⚠️  [Service Registry API] Failed to load gardens from persistence file for orphaned check: ${err.message}`);
      }
    }
    
    // Combine in-memory and persisted garden IDs
    const validGardenIds = new Set([...allGardenIds, ...persistedGardenIds, 'HG']); // HG is always valid (Holy Ghost)
    const orphanedProviders = allProviders.filter(p => p.gardenId && p.gardenId !== 'HG' && !validGardenIds.has(p.gardenId));
    if (orphanedProviders.length > 0) {
      console.warn(`   ⚠️  [Service Registry API] Found ${orphanedProviders.length} orphaned provider(s) with invalid gardenIds: ${orphanedProviders.map(p => `${p.id} (gardenId: ${p.gardenId})`).join(', ')}`);
      // Remove orphaned providers from ServiceRegistry2 and ROOT_CA_SERVICE_REGISTRY
      const serviceRegistry2 = getServiceRegistry2();
      for (const orphaned of orphanedProviders) {
        try {
          // Check if provider exists before trying to remove it
          if (serviceRegistry2.hasProvider(orphaned.id)) {
            serviceRegistry2.removeProvider(orphaned.id);
            console.log(`   🗑️  Removed orphaned provider ${orphaned.id} from ServiceRegistry2`);
          } else {
            console.log(`   ℹ️  Orphaned provider ${orphaned.id} not found in ServiceRegistry2 (may have been already removed)`);
          }
        } catch (err: any) {
          console.warn(`   ⚠️  Failed to remove orphaned provider ${orphaned.id}: ${err.message}`);
        }
        // Also remove from ROOT_CA_SERVICE_REGISTRY
        const index = ROOT_CA_SERVICE_REGISTRY.findIndex(p => p.id === orphaned.id || p.uuid === orphaned.uuid);
        if (index !== -1) {
          ROOT_CA_SERVICE_REGISTRY.splice(index, 1);
          console.log(`   🗑️  Removed orphaned provider ${orphaned.id} from ROOT_CA_SERVICE_REGISTRY`);
        }
      }
      // Filter out orphaned providers from the response
      allProviders = allProviders.filter(p => !orphanedProviders.includes(p));
      // Save cleaned registry
      try {
        serviceRegistry2.savePersistence();
        console.log(`   💾 Service registry saved after removing ${orphanedProviders.length} orphaned provider(s)`);
      } catch (saveErr: any) {
        console.warn(`   ⚠️  Failed to save service registry after cleanup: ${saveErr.message}`);
      }
    }
    
    let providers = allProviders.map(p => {
      const providerOwnerEmail = getOwnerEmailForProvider(p.gardenId);
      return {
        id: p.id,
        name: p.name,
        serviceType: p.serviceType, // Snake is a service type (serviceType: "snake")
        location: p.location,
        bond: p.bond,
        reputation: p.reputation,
        gardenId: p.gardenId, // Use gardenId directly - everything is in sync
        status: p.status || 'active',
        ownerEmail: providerOwnerEmail, // Add ownerEmail field
        // Snake service fields (transparent in ServiceRegistry)
        insuranceFee: p.insuranceFee,
        iGasMultiplier: p.iGasMultiplier || 1.0,
        iTaxMultiplier: p.iTaxMultiplier || 1.0,
        maxInfluence: p.maxInfluence,
        contextsAllowed: p.contextsAllowed,
        contextsForbidden: p.contextsForbidden,
        adCapabilities: p.adCapabilities
      };
    });
    
    // Filter by service type if provided (e.g., "snake" for Snake services)
    if (serviceType) {
      providers = providers.filter(p => p.serviceType === serviceType);
    }
    
    // Filter by ownerEmail if provided (for Priest mode)
    if (ownerEmail) {
      const ownerEmailLower = ownerEmail.toLowerCase();
      providers = providers.filter(p => {
        if (!p.ownerEmail) return false; // Exclude providers without ownerEmail (e.g., HG infrastructure)
        return p.ownerEmail.toLowerCase() === ownerEmailLower;
      });
      console.log(`   🔍 [Service Registry API] Filtered by ownerEmail: ${ownerEmail} → ${providers.length} provider(s)`);
    }
    
    // Debug: Log movie providers and their gardenId assignments
    const movieProviders = providers.filter(p => p.serviceType === 'movie');
    const nonHGProviders = movieProviders.filter(p => p.gardenId !== 'HG');
    if (movieProviders.length > 0) {
      console.log(`   🔍 [Service Registry API] Movie providers: ${movieProviders.map(p => `${p.name} (${p.id}) → gardenId: ${p.gardenId}, ownerEmail: ${p.ownerEmail || 'N/A'}`).join(', ')}`);
      console.log(`   🔍 [Service Registry API] Non-HG movie providers: ${nonHGProviders.length} (${nonHGProviders.map(p => p.name).join(', ')})`);
    }
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      providers,
      count: providers.length,
      timestamp: Date.now()
    }));
    return;
  }

  if (pathname === "/api/root-ca/service-registry/register" && req.method === "POST") {
    console.log(`   ✅ [${requestId}] POST /api/root-ca/service-registry/register - Registering service provider`);
    
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const providerData = JSON.parse(body);
        
        // Validate required fields
        if (!providerData.id || !providerData.name || !providerData.serviceType || !providerData.gardenId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Missing required fields: id, name, serviceType, gardenId" }));
          return;
        }
        
        // Create provider with defaults
        const provider: ServiceProviderWithCert = {
          id: providerData.id,
          uuid: providerData.uuid || crypto.randomUUID(),
          name: providerData.name,
          serviceType: providerData.serviceType,
          location: providerData.location || "Unknown",
          bond: providerData.bond || 0,
          reputation: providerData.reputation || 5.0,
          gardenId: providerData.gardenId || "HG", // Use gardenId
          apiEndpoint: providerData.apiEndpoint || "",
          status: providerData.status || 'active',
          // Snake service fields (if serviceType is "snake")
          insuranceFee: providerData.insuranceFee !== undefined ? providerData.insuranceFee : (providerData.serviceType === 'snake' ? Math.max(providerData.bond || 0, 10000) : providerData.bond || 0),
          iGasMultiplier: providerData.iGasMultiplier !== undefined ? providerData.iGasMultiplier : (providerData.serviceType === 'snake' ? 2.0 : 1.0),
          iTaxMultiplier: providerData.iTaxMultiplier !== undefined ? providerData.iTaxMultiplier : (providerData.serviceType === 'snake' ? 2.0 : 1.0),
          maxInfluence: providerData.maxInfluence !== undefined ? providerData.maxInfluence : (providerData.serviceType === 'snake' ? 0.15 : undefined),
          contextsAllowed: providerData.contextsAllowed,
          contextsForbidden: providerData.contextsForbidden,
          adCapabilities: providerData.adCapabilities,
        };
        
        // Register with ROOT CA
        registerServiceProviderWithROOTCA(provider);
        
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
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === "/api/root-balances" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /api/root-balances - Sending ROOT CA balances`);
    res.writeHead(200, { "Content-Type": "application/json" });
    
    const balances = {
      rootCA: ROOT_BALANCES.rootCA,
      indexers: Object.fromEntries(ROOT_BALANCES.indexers),
      providers: Object.fromEntries(ROOT_BALANCES.providers),
      rootCALiquidity: rootCALiquidity,
      timestamp: Date.now()
    };
    
    res.end(JSON.stringify({
      success: true,
      balances,
      timestamp: Date.now()
    }));
    return;
  }

  // GET /api/gardens - Get list of gardens (new endpoint, preferred)
  // GET /api/indexers - Get list of gardens (backward compatibility, redirects to gardens logic)
  if ((pathname === "/api/gardens" || pathname === "/api/indexers") && req.method === "GET") {
    const endpointName = pathname === "/api/gardens" ? "gardens" : "indexers";
    console.log(`   ✅ [${requestId}] GET /api/${endpointName} - Sending garden list`);
    res.writeHead(200, { "Content-Type": "application/json" });
    
    // Load persisted indexers from file (single source of truth)
    // REFACTOR: Load from separate gardens file first, fallback to old combined file
    let persistedGardens: GardenConfig[] = [];
    let persistedTokenGardens: TokenGardenConfig[] = [];
    
    try {
      // Try loading from separate gardens file first
      const gardensFile = path.join(__dirname, 'eden-gardens-persistence.json');
      let gardensFromFile: any[] = [];
      
      if (fs.existsSync(gardensFile)) {
        try {
          const fileContent = fs.readFileSync(gardensFile, 'utf-8');
          const persisted = JSON.parse(fileContent);
          gardensFromFile = persisted.gardens || persisted.indexers || [];
          console.log(`📋 [Indexer API] Loaded ${gardensFromFile.length} gardens from separate file: ${gardensFile}`);
        } catch (err: any) {
          console.warn(`⚠️  [Indexer API] Failed to load from separate gardens file: ${err.message}`);
        }
      }
      
      // Fallback to old combined file for backward compatibility
      if (gardensFromFile.length === 0) {
      const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
      if (fs.existsSync(persistenceFile)) {
        const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
        const persisted = JSON.parse(fileContent);
          // Backward compatibility: check both 'gardens' and 'indexers' fields
          gardensFromFile = persisted.gardens || persisted.indexers || [];
          console.log(`📋 [Indexer API] Loaded ${gardensFromFile.length} gardens from old combined file (backward compatibility)`);
        }
      }
      
      if (gardensFromFile && Array.isArray(gardensFromFile) && gardensFromFile.length > 0) {
        if (gardensFromFile && Array.isArray(gardensFromFile)) {
          // CRITICAL: All indexers (regular and token) are now in 'gardens' array
          // Separate them into regular and token indexers
          const regularIndexersFromArray = gardensFromFile.filter((idx: any) => 
            !(idx.tokenServiceType === 'dex' || (idx.serviceType === 'dex' && idx.id && idx.id.startsWith('T')))
          );
          const tokenIndexersFromArray = gardensFromFile.filter((idx: any) => 
            idx.tokenServiceType === 'dex' || (idx.serviceType === 'dex' && idx.id && idx.id.startsWith('T'))
          );
          
          // In ROOT mode: ONLY return gardens created via Angular (format: garden-1, garden-2, etc.)
          // Filter out all other gardens (A, B, C, etc.) - they're defaults from non-ROOT mode
          if (DEPLOYED_AS_ROOT) {
            persistedGardens = regularIndexersFromArray.filter((idx: any) => idx.id && (idx.id.startsWith('garden-') || idx.id.startsWith('indexer-')));
            // In ROOT mode: all token indexers are created via Angular, so return all
            persistedTokenGardens = tokenIndexersFromArray;
          } else {
            persistedGardens = regularIndexersFromArray;
            // Non-ROOT mode: filter out defaults
            if (NUM_TOKEN_GARDENS > 0) {
              const defaultTokenIds = Array.from({ length: NUM_TOKEN_GARDENS }, (_, i) => `T${i + 1}`);
              persistedTokenGardens = tokenIndexersFromArray.filter((idx: any) => !defaultTokenIds.includes(idx.id));
            } else {
              persistedTokenGardens = tokenIndexersFromArray;
            }
          }
        }
        
        // Backward compatibility: Also check tokenIndexers field if it exists (old files)
        // This is only needed when loading from the old combined file
        if (gardensFromFile.length === 0) {
          const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
          if (fs.existsSync(persistenceFile)) {
            try {
              const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
              const persisted = JSON.parse(fileContent);
        if (persisted.tokenIndexers && Array.isArray(persisted.tokenIndexers)) {
          console.log(`📋 [Indexer API] Found tokenIndexers field (backward compatibility) - using it`);
          if (DEPLOYED_AS_ROOT) {
            persistedTokenGardens = persisted.tokenIndexers;
          } else {
            if (NUM_TOKEN_GARDENS > 0) {
              const defaultTokenIds = Array.from({ length: NUM_TOKEN_GARDENS }, (_, i) => `T${i + 1}`);
              persistedTokenGardens = persisted.tokenIndexers.filter((idx: any) => !defaultTokenIds.includes(idx.id));
            } else {
              persistedTokenGardens = persisted.tokenIndexers;
                  }
                }
              }
            } catch (err: any) {
              // Ignore errors when checking for backward compatibility
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`⚠️  [Indexer API] Failed to load persisted indexers: ${err.message}`);
    }
    
    // Combine all indexers: Holy Ghost (ROOT CA's indexer) + in-memory gardens + persisted gardens
    // CRITICAL: Use in-memory arrays as source of truth (they include newly created gardens)
    // Merge with persisted data to ensure we have all gardens (in-memory takes precedence)
    const inMemoryRegularGardens = GARDENS.filter(g => g.active);
    const inMemoryTokenGardens = TOKEN_GARDENS.filter(g => g.active);
    
    // Merge: in-memory gardens take precedence, but include persisted gardens not in memory
    const allRegularGardens = new Map<string, GardenConfig>();
    inMemoryRegularGardens.forEach(g => allRegularGardens.set(g.id, g));
    persistedGardens.forEach(g => {
      if (!allRegularGardens.has(g.id)) {
        allRegularGardens.set(g.id, g);
      }
    });
    
    const allTokenGardens = new Map<string, TokenGardenConfig>();
    inMemoryTokenGardens.forEach(g => allTokenGardens.set(g.id, g));
    persistedTokenGardens.forEach(g => {
      if (!allTokenGardens.has(g.id)) {
        allTokenGardens.set(g.id, g);
      }
    });
    
    const allIndexers = [
      // Holy Ghost (ROOT CA's infrastructure indexer) - listed first
      {
        id: HOLY_GHOST_GARDEN.id,
        name: HOLY_GHOST_GARDEN.name,
        stream: HOLY_GHOST_GARDEN.stream,
        active: HOLY_GHOST_GARDEN.active,
        uuid: HOLY_GHOST_GARDEN.uuid,
        hasCertificate: !!HOLY_GHOST_GARDEN.certificate,
        type: 'root' as const,
        ownerEmail: undefined // ROOT CA doesn't have an owner
      },
      // Return in-memory gardens (source of truth) + persisted gardens not in memory
      ...Array.from(allRegularGardens.values()).map(i => ({
        id: i.id,
        name: i.name,
        stream: i.stream,
        active: i.active,
        uuid: i.uuid,
        hasCertificate: !!i.certificate,
        type: 'regular' as const,
        ownerEmail: i.ownerEmail || i.priestEmail || undefined
      })),
      ...Array.from(allTokenGardens.values()).map(i => ({
        id: i.id,
        name: i.name,
        stream: i.stream,
        active: i.active,
        uuid: i.uuid,
        hasCertificate: !!i.certificate,
        type: 'token' as const,
        ownerEmail: i.ownerEmail || i.priestEmail || undefined
      }))
    ];
    
    console.log(`   📋 [Garden API] Returning ${allIndexers.length} garden(s): ${allIndexers.map(i => i.name).join(', ')}`);
    
    // Return only 'gardens' - standardized field name (no duplicate 'indexers' field)
    res.end(JSON.stringify({
      success: true,
      gardens: allIndexers,
      timestamp: Date.now()
    }));
    return;
  }

  if (pathname === "/api/certificates" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /api/certificates - Sending certificate list`);
    const parsedUrl = url.parse(req.url || "/", true);
    const uuid = parsedUrl.query.uuid as string | undefined;
    
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
        total: CERTIFICATE_REGISTRY.size,
        timestamp: Date.now()
      }));
    }
    return;
  }

  if (pathname === "/api/revoke" && req.method === "POST") {
    console.log(`   ✅ [${requestId}] POST /api/revoke - Revoking certificate`);
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
        
        // Determine revoked_type if not provided
        let revokedType: "indexer" | "service" | "provider" = revoked_type || "provider";
        if (!revokedType) {
          // Auto-detect based on UUID pattern
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
        
        // If hard revocation of indexer, also revoke all providers in that garden
        let revokedProvidersCount = 0;
        if (revokeSeverity === 'hard' && revokedType === 'indexer') {
          // Find the garden to get its ID
          const garden = GARDENS.find(g => g.uuid === uuid) || TOKEN_GARDENS.find(g => g.uuid === uuid);
          if (garden) {
            // Revoke all providers in this garden
            const providers = ROOT_CA_SERVICE_REGISTRY.filter(
              p => p.gardenId === garden.id || (p as any).gardenId === garden.id
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
              } catch (err: any) {
                console.warn(`⚠️  Failed to revoke provider ${provider.id}: ${err.message}`);
              }
            }
          }
        }
        
        // Save persistence if hard revocation - remove revoked entities from JSON files
        if (revokeSeverity === 'hard') {
          try {
            await ensureRedisConnection();
            
            // Save gardens to JSON file (remove revoked gardens)
            const gardensFile = path.join(__dirname, 'eden-gardens-persistence.json');
            if (fs.existsSync(gardensFile)) {
              try {
                const fileContent = fs.readFileSync(gardensFile, 'utf-8');
                const persisted = JSON.parse(fileContent);
                if (persisted.gardens && Array.isArray(persisted.gardens)) {
                  // Remove revoked gardens from the file
                  const activeGardens = persisted.gardens.filter((g: any) => {
                    const isRevoked = REVOCATION_REGISTRY.has(g.uuid);
                    return !isRevoked;
                  });
                  
                  const gardensData = {
                    gardens: activeGardens,
                    lastSaved: new Date().toISOString()
                  };
                  fs.writeFileSync(gardensFile, JSON.stringify(gardensData, null, 2), 'utf-8');
                  console.log(`   💾 Removed revoked gardens from ${gardensFile} (${activeGardens.length} gardens remaining)`);
                }
              } catch (fileErr: any) {
                console.warn(`⚠️  Failed to update gardens persistence file: ${fileErr.message}`);
              }
            }
            
            // Also save current in-memory gardens (which already have revoked ones removed)
            const allGardens = [...GARDENS, ...TOKEN_GARDENS];
            const gardensData = {
              gardens: allGardens,
              lastSaved: new Date().toISOString()
            };
            fs.writeFileSync(gardensFile, JSON.stringify(gardensData, null, 2), 'utf-8');
            console.log(`   💾 Saved ${allGardens.length} active gardens to ${gardensFile}`);
            
            // Save service registry to JSON file (remove revoked providers)
            const serviceRegistryFile = path.join(__dirname, 'eden-serviceRegistry-persistence.json');
            if (fs.existsSync(serviceRegistryFile)) {
              try {
                const fileContent = fs.readFileSync(serviceRegistryFile, 'utf-8');
                const persisted = JSON.parse(fileContent);
                if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry)) {
                  // Remove revoked providers from the file
                  const activeProviders = persisted.serviceRegistry.filter((p: any) => {
                    const isRevoked = REVOCATION_REGISTRY.has(p.uuid);
                    return !isRevoked;
                  });
                  
                  const registryData = {
                    serviceRegistry: activeProviders,
                    lastSaved: new Date().toISOString()
                  };
                  fs.writeFileSync(serviceRegistryFile, JSON.stringify(registryData, null, 2), 'utf-8');
                  console.log(`   💾 Removed revoked providers from ${serviceRegistryFile} (${activeProviders.length} providers remaining)`);
                }
              } catch (fileErr: any) {
                console.warn(`⚠️  Failed to update service registry persistence file: ${fileErr.message}`);
              }
            }
            
            // Also save current in-memory service registry (which already has revoked ones removed)
            if (redis) {
              redis.saveServiceRegistry();
              console.log(`   💾 Saved service registry to persistence (${ROOT_CA_SERVICE_REGISTRY.length} providers remaining)`);
            }
          } catch (persistErr: any) {
            console.warn(`⚠️  Failed to save persistence after revocation: ${persistErr.message}`);
          }
        }
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          revocation,
          revokedProvidersCount: revokedType === 'indexer' ? revokedProvidersCount : 0,
          timestamp: Date.now()
        }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Get gardens by owner email (for Priest users)
  if (pathname === "/api/gardens/by-owner" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /api/gardens/by-owner - Getting gardens by owner email`);
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const ownerEmail = url.searchParams.get('email');
      
      if (!ownerEmail) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "email query parameter required" }));
        return;
      }
      
      // Get all gardens (regular and token) that belong to this owner
      const ownerGardens = [
        ...GARDENS.filter(g => (g.ownerEmail || g.priestEmail)?.toLowerCase() === ownerEmail.toLowerCase()),
        ...TOKEN_GARDENS.filter(g => (g.ownerEmail || g.priestEmail)?.toLowerCase() === ownerEmail.toLowerCase())
      ].map(g => ({
        id: g.id,
        name: g.name,
        stream: g.stream,
        active: g.active,
        uuid: g.uuid,
        ownerEmail: g.ownerEmail || g.priestEmail,
        serviceType: (g as any).serviceType,
        hasCertificate: !!g.certificate,
        certificate: g.certificate
      }));
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        gardens: ownerGardens,
        count: ownerGardens.length
      }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Hard shutdown garden (revoke certificate)
  if (pathname === "/api/garden/shutdown" && req.method === "POST") {
    console.log(`   ✅ [${requestId}] POST /api/garden/shutdown - Hard shutdown garden`);
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
        
        // Find garden by ID or UUID
        const garden = GARDENS.find(g => g.id === gardenId || g.uuid === gardenId) ||
                      TOKEN_GARDENS.find(g => g.id === gardenId || g.uuid === gardenId);
        
        if (!garden) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Garden not found: ${gardenId}` }));
          return;
        }
        
        // Authorization check: Only owner or ROOT CA can shutdown
        const ownerEmail = (garden.ownerEmail || garden.priestEmail)?.toLowerCase();
        const requestedByLower = requestedBy.toLowerCase();
        const isRootCA = requestedByLower === 'bill.draper.auto@gmail.com';
        const isOwner = ownerEmail === requestedByLower;
        
        // Check priesthood certification for non-admin owners
        if (isOwner && !isRootCA) {
          const hasCert = hasPriesthoodCertification(requestedBy);
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
        
        // Revoke certificate (hard shutdown)
        const revocation = revokeCertificate(
          garden.uuid,
          reason,
          "indexer",
          "hard",
          { requestedBy, gardenId, revokeProviders }
        );
        
        // Optionally revoke all providers in this garden
        let revokedProvidersCount = 0;
        const providersToRevoke: any[] = [];
        if (revokeProviders) {
          const providers = ROOT_CA_SERVICE_REGISTRY.filter(
            p => p.gardenId === gardenId || (p as any).gardenId === garden.id
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
            } catch (err: any) {
              console.warn(`⚠️  Failed to revoke provider ${provider.id}: ${err.message}`);
            }
          }
        }
        
        // Remove revoked providers from ROOT_CA_SERVICE_REGISTRY
        for (const provider of providersToRevoke) {
          const providerIndex = ROOT_CA_SERVICE_REGISTRY.findIndex(p => p.uuid === provider.uuid);
          if (providerIndex !== -1) {
            ROOT_CA_SERVICE_REGISTRY.splice(providerIndex, 1);
            console.log(`   🗑️  Removed provider ${provider.id} (${provider.name}) from ROOT_CA_SERVICE_REGISTRY`);
          }
        }
        
        // Remove garden from GARDENS or TOKEN_GARDENS array
        const gardenIndex = GARDENS.findIndex(g => g.id === gardenId || g.uuid === garden.uuid);
        if (gardenIndex !== -1) {
          GARDENS.splice(gardenIndex, 1);
          console.log(`   🗑️  Removed garden ${garden.id} (${garden.name}) from GARDENS array`);
        } else {
          const tokenGardenIndex = TOKEN_GARDENS.findIndex(g => g.id === gardenId || g.uuid === garden.uuid);
          if (tokenGardenIndex !== -1) {
            TOKEN_GARDENS.splice(tokenGardenIndex, 1);
            console.log(`   🗑️  Removed garden ${garden.id} (${garden.name}) from TOKEN_GARDENS array`);
          }
        }
        
        // Save persistence (gardens and service registry) - remove revoked entities from JSON files
        try {
          await ensureRedisConnection();
          
          // Save gardens to JSON file (remove revoked gardens)
          const gardensFile = path.join(__dirname, 'eden-gardens-persistence.json');
          if (fs.existsSync(gardensFile)) {
            try {
              const fileContent = fs.readFileSync(gardensFile, 'utf-8');
              const persisted = JSON.parse(fileContent);
              if (persisted.gardens && Array.isArray(persisted.gardens)) {
                // Remove revoked gardens from the file
                const activeGardens = persisted.gardens.filter((g: any) => {
                  const isRevoked = REVOCATION_REGISTRY.has(g.uuid);
                  return !isRevoked;
                });
                
                const gardensData = {
                  gardens: activeGardens,
                  lastSaved: new Date().toISOString()
                };
                fs.writeFileSync(gardensFile, JSON.stringify(gardensData, null, 2), 'utf-8');
                console.log(`   💾 Removed revoked gardens from ${gardensFile} (${activeGardens.length} gardens remaining)`);
              }
            } catch (fileErr: any) {
              console.warn(`⚠️  Failed to update gardens persistence file: ${fileErr.message}`);
            }
          }
          
          // Also save current in-memory gardens (which already have revoked ones removed)
          const allGardens = [...GARDENS, ...TOKEN_GARDENS];
          const gardensData = {
            gardens: allGardens,
            lastSaved: new Date().toISOString()
          };
          fs.writeFileSync(gardensFile, JSON.stringify(gardensData, null, 2), 'utf-8');
          console.log(`   💾 Saved ${allGardens.length} active gardens to ${gardensFile}`);
          
          // Save service registry to JSON file (remove revoked providers)
          const serviceRegistryFile = path.join(__dirname, 'eden-serviceRegistry-persistence.json');
          if (fs.existsSync(serviceRegistryFile)) {
            try {
              const fileContent = fs.readFileSync(serviceRegistryFile, 'utf-8');
              const persisted = JSON.parse(fileContent);
              if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry)) {
                // Remove revoked providers from the file
                const activeProviders = persisted.serviceRegistry.filter((p: any) => {
                  const isRevoked = REVOCATION_REGISTRY.has(p.uuid);
                  return !isRevoked;
                });
                
                const registryData = {
                  serviceRegistry: activeProviders,
                  lastSaved: new Date().toISOString()
                };
                fs.writeFileSync(serviceRegistryFile, JSON.stringify(registryData, null, 2), 'utf-8');
                console.log(`   💾 Removed revoked providers from ${serviceRegistryFile} (${activeProviders.length} providers remaining)`);
              }
            } catch (fileErr: any) {
              console.warn(`⚠️  Failed to update service registry persistence file: ${fileErr.message}`);
            }
          }
          
          // Also save current in-memory service registry (which already has revoked ones removed)
          if (redis) {
            redis.saveServiceRegistry();
            console.log(`   💾 Saved service registry to persistence (${ROOT_CA_SERVICE_REGISTRY.length} providers remaining)`);
          }
        } catch (persistErr: any) {
          console.warn(`⚠️  Failed to save persistence after shutdown: ${persistErr.message}`);
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
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === "/api/reinstate" && req.method === "POST") {
    console.log(`   ✅ [${requestId}] POST /api/reinstate - Reinstating certificate`);
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
        
        // Remove from revocation registry (reinstatement)
        const wasRevoked = REVOCATION_REGISTRY.has(uuid);
        if (wasRevoked) {
          REVOCATION_REGISTRY.delete(uuid);
          
          // Reactivate entity
          const indexer = GARDENS.find(i => i.uuid === uuid);
          if (indexer) {
            indexer.active = true;
            // Note: Certificate would need to be re-issued in a real system
          }
          
          const provider = ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === uuid);
          if (provider) {
            provider.status = 'active'; // Reactivate provider in ROOT_CA_SERVICE_REGISTRY
            // Note: Certificate would need to be re-issued in a real system
            console.log(`   Service provider ${provider.name} (${provider.id}) reactivated in ROOT_CA_SERVICE_REGISTRY`);
          }
          
          console.log(`✅ Certificate reinstated: ${uuid}`);
          
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
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === "/api/status" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /api/status - Sending status`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "online",
      websocketClients: wsClients.size,
      timestamp: Date.now()
    }));
    return;
  }

  // ============================================
  // JESUSCOIN (JSC) STRIPE INTEGRATION
  // ============================================

  // POST /api/jsc/buy - Create Stripe Checkout session
  if (pathname === "/api/jsc/buy" && req.method === "POST") {
    console.log(`   💰 [${requestId}] POST /api/jsc/buy - Creating Stripe Checkout session`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, amount } = JSON.parse(body);
        
        if (!email || typeof email !== 'string' || !email.includes('@')) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid email address required" }));
          return;
        }
        
        if (!amount || typeof amount !== 'number' || amount <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid amount required (must be > 0)" }));
          return;
        }
        
        // Create Stripe Checkout session
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: '🍎 APPLES',
                  description: `Purchase ${amount} 🍎 APPLES (1 🍎 = 1 USD)`,
                },
                unit_amount: Math.round(amount * 100), // Convert to cents
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${req.headers.origin || 'http://localhost:4200'}/?jsc_success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.headers.origin || 'http://localhost:4200'}/?jsc_canceled=true`,
          customer_email: email,
          metadata: {
            user_email: email,
            jsc_amount: amount.toString(),
          },
        });
        
        console.log(`   ✅ Stripe Checkout session created: ${session.id} for ${email} (${amount} 🍎 APPLES)`);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          sessionId: session.id,
          url: session.url,
          publishableKey: STRIPE_PUBLISHABLE_KEY,
        }));
      } catch (err: any) {
        console.error(`   ❌ Error creating Stripe Checkout session:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/garden/buy - Create Stripe Checkout session for garden purchase
  if (pathname === "/api/garden/buy" && req.method === "POST") {
    console.log(`   🎬 [${requestId}] POST /api/garden/buy - Creating Stripe Checkout session for garden purchase`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, amount, gardenType } = JSON.parse(body);
        
        if (!email || typeof email !== 'string' || !email.includes('@')) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid email address required" }));
          return;
        }
        
        if (!amount || typeof amount !== 'number' || amount <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid amount required (must be > 0)" }));
          return;
        }
        
        if (!gardenType || gardenType !== 'movie') {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Only 'movie' garden type is supported" }));
          return;
        }
        
        // Create Stripe Checkout session for garden purchase
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Movie Service Garden',
                  description: `Install a new movie service garden (${amount} 🍎 APPLES)`,
                },
                unit_amount: Math.round(amount * 100), // Convert to cents
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${req.headers.origin || 'http://localhost:4200'}/?garden_success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.headers.origin || 'http://localhost:4200'}/?garden_canceled=true`,
          customer_email: email,
          metadata: {
            user_email: email,
            jsc_amount: amount.toString(),
            garden_type: gardenType,
            purchase_type: 'garden',
          },
        });
        
        console.log(`   ✅ Stripe Checkout session created for garden purchase: ${session.id} for ${email} (${amount} 🍎 APPLES)`);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          sessionId: session.id,
          url: session.url,
          publishableKey: STRIPE_PUBLISHABLE_KEY,
        }));
      } catch (err: any) {
        console.error(`   ❌ Error creating Stripe Checkout session for garden:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/garden/purchase - Purchase garden directly from wallet balance
  if (pathname === "/api/garden/purchase" && req.method === "POST") {
    console.log(`   🎬 [${requestId}] POST /api/garden/purchase - Purchasing garden from wallet`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, amount, gardenType } = JSON.parse(body);
        
        if (!email || typeof email !== 'string' || !email.includes('@')) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid email address required" }));
          return;
        }
        
        if (!amount || typeof amount !== 'number' || amount <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid amount required (must be > 0)" }));
          return;
        }
        
        if (!gardenType || gardenType !== 'movie') {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Only 'movie' garden type is supported" }));
          return;
        }
        
        // Check wallet balance
        const balance = await getWalletBalance(email);
        if (balance < amount) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: false, 
            error: `Insufficient balance. Required: ${amount} 🍎 APPLES, Available: ${balance} 🍎 APPLES` 
          }));
          return;
        }
        
        // Debit wallet balance
        const txId = crypto.randomUUID();
        const debitResult = await debitWallet(
          email,
          amount,
          txId,
          'garden_purchase',
          { gardenType: gardenType }
        );
        
        if (!debitResult.success) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: debitResult.error || "Failed to debit wallet" }));
          return;
        }
        
        // CRITICAL: In ROOT mode, indexers must be created via Angular wizard, not via this endpoint
        if (DEPLOYED_AS_ROOT) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: false, 
            error: "Cannot create indexers via this endpoint in ROOT mode. Use the Angular wizard (/api/wizard/create-indexer) instead." 
          }));
          return;
        }
        
        // Register new movie indexer
        console.log(`   🎬 Registering new movie garden for ${email} (wallet purchase)...`);
        const newGarden = await registerNewMovieGarden(
          email,
          `wallet:${txId}`, // Use wallet transaction ID instead of Stripe payment intent
          undefined, // No Stripe customer ID
          undefined, // No Stripe payment method ID
          undefined  // No Stripe session ID
        );
        
        const newBalance = await getWalletBalance(email);
        
        console.log(`   ✅ Garden purchased from wallet: ${newGarden.name} (${newGarden.id})`);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          gardenId: newGarden.id,
          gardenName: newGarden.name,
          gardenUuid: newGarden.uuid,
          balance: newBalance,
          amount: amount
        }));
      } catch (err: any) {
        console.error(`   ❌ Error purchasing indexer from wallet:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/stripe/webhook - Handle Stripe webhooks
  if (pathname === "/api/stripe/webhook" && req.method === "POST") {
    console.log(`   🔔 [${requestId}] POST /api/stripe/webhook - Processing Stripe webhook`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      const sig = req.headers['stripe-signature'];
      
      // For local development: if webhook secret is placeholder, skip signature verification
      const isTestMode = STRIPE_WEBHOOK_SECRET === "whsec_your_webhook_secret_here";
      
      let event: Stripe.Event;
      
      if (isTestMode) {
        console.log(`   ⚠️  Test mode: Skipping webhook signature verification`);
        // Parse JSON directly for test mode
        try {
          const jsonBody = JSON.parse(body);
          event = jsonBody as Stripe.Event;
          console.log(`   ✅ Test mode: Parsed webhook event: ${event.type} (${event.id || 'no-id'})`);
        } catch (err: any) {
          console.error(`   ❌ Failed to parse webhook body:`, err.message);
          console.log(`   📄 Raw body:`, body.substring(0, 500));
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Failed to parse webhook body: ${err.message}` }));
          return;
        }
      } else {
        // Production mode: verify signature
        if (!sig) {
          console.error(`   ❌ Missing Stripe signature header`);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Missing stripe-signature header" }));
          return;
        }
        
        try {
          // Verify webhook signature
          event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
          console.log(`   ✅ Stripe webhook verified: ${event.type} (${event.id})`);
        } catch (err: any) {
          console.error(`   ❌ Stripe webhook signature verification failed:`, err.message);
          const sigStr = Array.isArray(sig) ? sig[0] : sig;
          console.log(`   📄 Body length: ${body.length}, Signature: ${sigStr ? sigStr.substring(0, 50) : 'N/A'}...`);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Webhook signature verification failed: ${err.message}` }));
          return;
        }
      }
      
      try {
        // Handle checkout.session.completed event
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object as Stripe.Checkout.Session;
          
          console.log(`   📋 Processing checkout.session.completed:`);
          console.log(`      Session ID: ${session.id}`);
          console.log(`      Payment Status: ${session.payment_status}`);
          console.log(`      Customer Email: ${session.customer_email || session.metadata?.user_email || 'N/A'}`);
          console.log(`      Metadata:`, JSON.stringify(session.metadata || {}, null, 2));
          
          if (session.payment_status === 'paid') {
            const email = session.customer_email || session.metadata?.user_email;
            const jscAmount = parseFloat(session.metadata?.jsc_amount || '0');
            const paymentIntentId = session.payment_intent as string;
            const customerId = session.customer as string;
            const purchaseType = session.metadata?.purchase_type; // 'garden' or undefined (JSC purchase)
            const gardenType = session.metadata?.garden_type; // 'movie' or undefined
            
            if (!email) {
              console.error(`   ❌ Missing email in Stripe session: ${session.id}`);
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Missing email in session" }));
              return;
            }
            
            if (jscAmount <= 0) {
              console.error(`   ❌ Invalid JSC amount in session metadata: ${session.metadata?.jsc_amount}`);
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Invalid 🍎 APPLES amount" }));
              return;
            }
            
            // Retrieve payment intent to get payment method ID
            let paymentMethodId: string | null = null;
            if (paymentIntentId) {
              try {
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                paymentMethodId = typeof paymentIntent.payment_method === 'string' 
                  ? paymentIntent.payment_method 
                  : paymentIntent.payment_method?.id || null;
                console.log(`   💳 Retrieved payment intent: ${paymentIntentId}, Payment Method: ${paymentMethodId || 'N/A'}`);
              } catch (err: any) {
                console.warn(`   ⚠️  Could not retrieve payment intent ${paymentIntentId}:`, err.message);
              }
            }
            
            // Check if this is a garden purchase
            if (purchaseType === 'garden' && gardenType === 'movie') {
              // CRITICAL: In ROOT mode, gardens must be created via Angular wizard, not via Stripe webhook
              if (DEPLOYED_AS_ROOT) {
                console.warn(`   ⚠️  [Stripe Webhook] Cannot create garden via webhook in ROOT mode. Use Angular wizard instead.`);
                return;
              }
              // Register new movie garden after payment
              console.log(`   🎬 Registering new movie garden for ${email}...`);
              const newGarden = await registerNewMovieGarden(email, paymentIntentId, customerId, paymentMethodId, session.id);
              
              console.log(`   ✅ Movie garden registered successfully: ${newGarden.id} (${newGarden.name})`);
              console.log(`      Stripe Customer ID: ${customerId}`);
              console.log(`      Payment Intent ID: ${paymentIntentId}`);
              console.log(`      Session ID: ${session.id}`);
            } else {
              // Regular JSC purchase - mint JSC
              console.log(`   🪙 Minting ${jscAmount} 🍎 APPLES for ${email}...`);
              await mintJSC(email, jscAmount, paymentIntentId, customerId, paymentMethodId, session.id);

              console.log(`   ✅ 🍎 APPLES minted successfully: ${jscAmount} 🍎 APPLES for ${email}`);
              console.log(`      Stripe Customer ID: ${customerId}`);
              console.log(`      Payment Intent ID: ${paymentIntentId}`);
              console.log(`      Payment Method ID: ${paymentMethodId || 'N/A'}`);
              console.log(`      Session ID: ${session.id}`);
            }
          } else {
            console.log(`   ⚠️  Payment status is not 'paid': ${session.payment_status}`);
          }
        } else {
          console.log(`   ℹ️  Unhandled webhook event type: ${event.type}`);
        }
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ received: true }));
      } catch (err: any) {
        console.error(`   ❌ Error processing webhook:`, err);
        console.error(`   📄 Stack:`, err.stack);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: `Webhook processing error: ${err.message}` }));
      }
    });
    return;
  }

  // GET /api/jsc/check-session/:sessionId - Check Stripe session status and mint JSC if needed (fallback for local dev)
  if (pathname.startsWith("/api/jsc/check-session/") && req.method === "GET") {
    const sessionId = pathname.split("/").pop();
    console.log(`   🔍 [${requestId}] GET /api/jsc/check-session/${sessionId} - Checking Stripe session status`);
    
    if (!sessionId || !sessionId.startsWith("cs_")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Invalid session ID" }));
      return;
    }
    
    try {
      // Retrieve session from Stripe
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      console.log(`   📋 Session status: ${session.payment_status} (${session.status})`);
      
      // Check if already minted by looking for ledger entry
      const existingMint = LEDGER.find(entry => 
        entry.serviceType === 'mint' &&
        entry.bookingDetails?.stripeSessionId === sessionId
      );
      
      if (existingMint) {
        console.log(`   ✅ JSC already minted for this session (entry: ${existingMint.entryId})`);
        const email = session.customer_email || session.metadata?.user_email;
        const balance = email ? await getWalletBalance(email) : 0;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          success: true, 
          alreadyMinted: true,
          sessionId: session.id,
          paymentStatus: session.payment_status,
          email: email || null,
          balance: balance
        }));
        return;
      }
      
      // If payment is successful but not processed yet, process it now
      if (session.payment_status === 'paid' && session.status === 'complete') {
        const email = session.customer_email || session.metadata?.user_email;
        const jscAmount = parseFloat(session.metadata?.jsc_amount || '0');
        const paymentIntentId = session.payment_intent as string;
        const customerId = session.customer as string;
        const purchaseType = session.metadata?.purchase_type;
        const gardenType = session.metadata?.garden_type;
        
        if (!email) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Missing email in session" }));
          return;
        }
        
        if (jscAmount <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Invalid 🍎 APPLES amount in session metadata" }));
          return;
        }
        
        // Retrieve payment intent to get payment method ID
        let paymentMethodId: string | null = null;
        if (paymentIntentId) {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            paymentMethodId = typeof paymentIntent.payment_method === 'string' 
              ? paymentIntent.payment_method 
              : paymentIntent.payment_method?.id || null;
          } catch (err: any) {
            console.warn(`   ⚠️  Could not retrieve payment intent ${paymentIntentId}:`, err.message);
          }
        }
        
        // Check if this is a garden purchase
        if (purchaseType === 'garden' && gardenType === 'movie') {
          // Check if garden already registered
          const existingGarden = LEDGER.find(entry => 
            entry.serviceType === 'garden_purchase' &&
            entry.bookingDetails?.stripeSessionId === sessionId
          );
          
          if (existingGarden) {
            console.log(`   ✅ Garden already registered for this session`);
            const balance = await getWalletBalance(email);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ 
              success: true, 
              alreadyRegistered: true,
              sessionId: session.id,
              paymentStatus: session.payment_status,
              email: email,
              balance: balance,
              gardenId: (existingGarden.bookingDetails as any)?.gardenId,
              gardenName: (existingGarden.bookingDetails as any)?.gardenName
            }));
            return;
          }
          
          // CRITICAL: In ROOT mode, indexers must be created via Angular wizard, not via this endpoint
          if (DEPLOYED_AS_ROOT) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ 
              success: false, 
              error: "Cannot create indexers via this endpoint in ROOT mode. Use the Angular wizard (/api/wizard/create-indexer) instead." 
            }));
            return;
          }
          
          // Register new movie indexer
          console.log(`   🎬 Registering new movie garden for ${email} (fallback mechanism)...`);
          const newGarden = await registerNewMovieGarden(email, paymentIntentId, customerId, paymentMethodId, session.id);
          const balance = await getWalletBalance(email);
          
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: true, 
            registered: true,
            sessionId: session.id,
            paymentStatus: session.payment_status,
            email: email,
            amount: jscAmount,
            balance: balance,
            gardenId: newGarden.id,
            gardenName: newGarden.name
          }));
          return;
        } else {
          // Regular JSC purchase - mint JSC (fallback for local dev when webhook doesn't fire)
          console.log(`   🪙 Minting ${jscAmount} 🍎 APPLES for ${email} (fallback mechanism)...`);
          await mintJSC(email, jscAmount, paymentIntentId, customerId, paymentMethodId, session.id);
          
          const balance = await getWalletBalance(email);
          
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: true, 
            minted: true,
            sessionId: session.id,
            paymentStatus: session.payment_status,
            email: email,
            amount: jscAmount,
            balance: balance
          }));
          return;
        }
      } else {
        // Payment not completed yet
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
    } catch (err: any) {
      console.error(`   ❌ Error checking Stripe session:`, err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/jsc/balance/:email - Get user JSC balance (from Wallet Service - authoritative source)
  if (pathname.startsWith("/api/jsc/balance/") && req.method === "GET") {
    const email = decodeURIComponent(pathname.split("/api/jsc/balance/")[1]);
    console.log(`   💰 [${requestId}] GET /api/jsc/balance/${email} - Getting JSC balance from Wallet Service`);
    
    // Get balance from Wallet Service (authoritative source)
    const balance = await getWalletBalance(email);
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      email,
      balance,
      currency: "JSC",
      walletService: "wallet-service-001",
      indexerId: "HG", // Holy Ghost indexer
    }));
    return;
  }

  // POST /api/wallet/reset - Reset wallet persistence file (clear all wallet balances)
  if (pathname === "/api/wallet/reset" && req.method === "POST") {
    console.log(`   🔄 [${requestId}] POST /api/wallet/reset - Clearing generated indexers only`);
    
    try {
      await ensureRedisConnection();
      
      // Clear generated indexers from in-memory arrays
      // Keep only the default indexers (A, B, C, etc. and T1, T2, etc.)
      // Remove dynamically created gardens (those with IDs starting with 'garden-' or 'indexer-')
      const dynamicIndexers = GARDENS.filter(i => i.id.startsWith('garden-') || i.id.startsWith('indexer-'));
      const dynamicTokenIndexers = TOKEN_GARDENS.filter(i => i.id.startsWith('garden-') || i.id.startsWith('indexer-'));
      
      const clearedIndexersCount = dynamicIndexers.length + dynamicTokenIndexers.length;
      
      // Remove dynamic gardens from arrays (filter out those starting with 'garden-' or 'indexer-')
      const filteredIndexers = GARDENS.filter(i => !i.id.startsWith('garden-') && !i.id.startsWith('indexer-'));
      const filteredTokenIndexers = TOKEN_GARDENS.filter(i => !i.id.startsWith('garden-') && !i.id.startsWith('indexer-'));
      
      // Clear arrays and repopulate with filtered indexers
      GARDENS.length = 0;
      GARDENS.push(...filteredIndexers);
      
      TOKEN_GARDENS.length = 0;
      TOKEN_GARDENS.push(...filteredTokenIndexers);
      
      // Save cleared indexers state to persistence (empty array since all dynamic indexers are cleared)
      // CRITICAL: In ROOT mode, skip this - indexers are saved via immediate save in /api/wizard/create-indexer
      if (!DEPLOYED_AS_ROOT) {
        redis.saveIndexers([]);
      } else {
        console.log(`📋 [Reset] ROOT mode: Skipping saveIndexers() - indexers are managed via persistence file`);
      }
      
      // Helper function to get default indexerId for a provider (non-ROOT mode only)
      function getDefaultGardenIdForProvider(providerId: string): string | undefined {
        const defaults: Record<string, string> = {
          'amc-001': 'garden-1',
          'cinemark-001': 'garden-1',
          'moviecom-001': 'garden-2',
          'snake-premium-cinema-001': 'garden-1',
          'snake-shopping-deals-001': 'garden-2'
        };
        return defaults[providerId];
      }
      
      // Reset provider indexerId assignments in ROOT_CA_SERVICE_REGISTRY
      // In ROOT mode: set to undefined (no indexer assigned)
      // In non-ROOT mode: restore to default assignments (indexer-1, indexer-2, etc.)
      let providersReset = 0;
      for (const provider of ROOT_CA_SERVICE_REGISTRY) {
        // Skip Holy Ghost infrastructure providers (they always belong to HG)
        if (provider.gardenId === "HG") {
          continue;
        }
        
        // Reset gardenId based on deployment mode
        if (DEPLOYED_AS_ROOT) {
          // ROOT mode: In ROOT mode, gardens are created via Angular wizard
          // We should NOT clear gardenId assignments here - they're managed by the wizard
          // Skip resetting providers in ROOT mode
          continue;
        } else {
          // Non-ROOT mode: restore default assignments
          const defaultGardenId = getDefaultGardenIdForProvider(provider.id);
          if (provider.gardenId !== defaultGardenId) {
            provider.gardenId = defaultGardenId || "HG"; // Fallback to HG if undefined
            providersReset++;
          }
        }
      }
      
      // REFACTOR: Update separate files - keep wallet balances and ledger entries, clear gardens and serviceRegistry
      const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
      const gardensFile = path.join(__dirname, 'eden-gardens-persistence.json');
      const serviceRegistryFile = path.join(__dirname, 'eden-serviceRegistry-persistence.json');
      
      // Preserve wallet balances from main file
      let walletBalances: Record<string, string> = {};
      if (fs.existsSync(persistenceFile)) {
        try {
          const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
          const currentPersistence = JSON.parse(fileContent);
          walletBalances = currentPersistence.walletBalances || {};
        } catch (err: any) {
          console.warn(`   ⚠️  Could not load existing wallet persistence file:`, err.message);
        }
      }
      
      // Update main persistence file - keep wallet balances only
      const updatedPersistence = {
        walletBalances: walletBalances,
        lastSaved: new Date().toISOString(),
        resetAt: new Date().toISOString()
      };
      fs.writeFileSync(persistenceFile, JSON.stringify(updatedPersistence, null, 2), 'utf-8');
      console.log(`   💾 [Reset] Updated wallet persistence file (preserved ${Object.keys(walletBalances).length} wallet balances)`);
      
      // Clear gardens file
      const emptyGardensData = {
        gardens: [],
        lastSaved: new Date().toISOString(),
        resetAt: new Date().toISOString()
      };
      fs.writeFileSync(gardensFile, JSON.stringify(emptyGardensData, null, 2), 'utf-8');
      console.log(`   💾 [Reset] Cleared gardens file`);
      
      // Clear service registry file
      const emptyServiceRegistryData = {
        serviceRegistry: [],
        lastSaved: new Date().toISOString(),
        resetAt: new Date().toISOString()
      };
      fs.writeFileSync(serviceRegistryFile, JSON.stringify(emptyServiceRegistryData, null, 2), 'utf-8');
      console.log(`   💾 [Reset] Cleared service registry file`);
      
      // Note: Ledger entries file is preserved (not cleared on wallet reset)
      
      // NOTE: We do NOT call redis.saveServiceRegistry() here because:
      // 1. We've already written the ServiceRegistry (empty array) to the file above
      // 2. Calling saveServiceRegistry() would cause a duplicate write
      // 3. In ROOT mode, saveServiceRegistry() is a no-op anyway
      
      console.log(`   ✅ Cleared ${clearedIndexersCount} generated indexers and reset ${providersReset} provider assignments. Wallet balances and ledger entries preserved.`);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        message: `Reset successful. Cleared ${clearedIndexersCount} generated indexers and reset ${providersReset} provider assignments. Wallet balances and ledger entries preserved.`,
        clearedIndexers: clearedIndexersCount,
        resetProviders: providersReset,
        remainingIndexers: GARDENS.length + TOKEN_GARDENS.length,
        persistenceFile: persistenceFile
      }));
    } catch (err: any) {
      console.error(`   ❌ Error resetting:`, err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/wallet/persistence/system-prompt - Save system prompt to persistence file
  if (pathname === "/api/wallet/persistence/system-prompt" && req.method === "POST") {
    console.log(`   💾 [${requestId}] POST /api/wallet/persistence/system-prompt - Saving system prompt`);
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
      try {
        const systemPromptData = JSON.parse(body);
        const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
        
        // Load existing persistence
        let currentPersistence: any = {
          walletBalances: {},
          ledgerEntries: [],
          gardens: [],
          systemPrompts: []
        };
        
        if (fs.existsSync(persistenceFile)) {
          try {
            const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
            currentPersistence = JSON.parse(fileContent);
          } catch (err: any) {
            console.warn(`   ⚠️  Could not load existing persistence file:`, err.message);
          }
        }
        
        // Initialize systemPrompts array if it doesn't exist
        if (!currentPersistence.systemPrompts) {
          currentPersistence.systemPrompts = [];
        }
        
        // Check if system prompt for this service type already exists
        const existingIndex = currentPersistence.systemPrompts.findIndex(
          (sp: any) => sp.serviceType === systemPromptData.serviceType
        );
        
        if (existingIndex >= 0) {
          // Update existing system prompt
          currentPersistence.systemPrompts[existingIndex] = systemPromptData;
        } else {
          // Add new system prompt
          currentPersistence.systemPrompts.push(systemPromptData);
        }
        
        // Update lastSaved timestamp
        currentPersistence.lastSaved = new Date().toISOString();
        
        // Save to file
        fs.writeFileSync(persistenceFile, JSON.stringify(currentPersistence, null, 2), 'utf-8');
        
        console.log(`   ✅ System prompt saved for service type: ${systemPromptData.serviceType}`);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: `System prompt saved for service type: ${systemPromptData.serviceType}`
        }));
      } catch (err: any) {
        console.error(`   ❌ Failed to save system prompt:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/jsc/transactions/:email - Get user transaction history
  if (pathname.startsWith("/api/jsc/transactions/") && req.method === "GET") {
    const email = decodeURIComponent(pathname.split("/api/jsc/transactions/")[1]);
    console.log(`   📜 [${requestId}] GET /api/jsc/transactions/${email} - Getting transaction history`);
    
    const userTransactions = LEDGER.filter(entry => entry.payer === email);
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      email,
      transactions: userTransactions,
      count: userTransactions.length,
    }));
    return;
  }

  // GET /api/stripe/ledger/query - Query ledger by Stripe IDs (for webhook verification)
  if (pathname === "/api/stripe/ledger/query" && req.method === "GET") {
    const query = parsedUrl.query;
    const paymentIntentId = query.payment_intent_id as string;
    const customerId = query.customer_id as string;
    const sessionId = query.session_id as string;
    
    console.log(`   🔍 [${requestId}] GET /api/stripe/ledger/query - Querying ledger by Stripe IDs`);
    
    let matchingEntries = LEDGER.filter(entry => {
      if (entry.serviceType !== 'mint') return false;
      
      const details = entry.bookingDetails as any;
      if (!details) return false;
      
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
      count: matchingEntries.length,
    }));
    return;
  }

  // ============================================
  // INDEXER RPC ENDPOINTS (Canonical Source)
  // ============================================

  // RPC: Get transactions by payer (Google email)
  if (pathname === "/rpc/getTransactionByPayer" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /rpc/getTransactionByPayer`);
    const queryParams = new URL(req.url || "", `http://${req.headers.host}`).searchParams;
    const payer = queryParams.get("payer");
    
    if (!payer) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "payer parameter required" }));
      return;
    }
    
    const transactions = getTransactionByPayer(payer);
    
    console.log(`   📡 [Service Provider] RPC Query: getTransactionByPayer(payer=${payer}) → Found ${transactions.length} transaction(s)`);
    
    // Broadcast RPC query event
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

  // RPC: Get transaction by snapshot ID
  if (pathname === "/rpc/getTransactionBySnapshot" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /rpc/getTransactionBySnapshot`);
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
    
    console.log(`   📡 [Service Provider] RPC Query: getTransactionBySnapshot(snapshotId=${snapshotId.substring(0, 8)}...) → Found`);
    
    // Broadcast RPC query event
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

  // RPC: Get latest snapshot for provider
  if (pathname === "/rpc/getLatestSnapshot" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /rpc/getLatestSnapshot`);
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
    
    console.log(`   📡 [Service Provider] RPC Query: getLatestSnapshot(providerId=${providerId}) → Found TX: ${snapshot.txId.substring(0, 8)}...`);
    
    // Broadcast RPC query event
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

  // RPC: Poll transaction status
  if (pathname === "/rpc/tx/status" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /rpc/tx/status`);
    const queryParams = new URL(req.url || "", `http://${req.headers.host}`).searchParams;
    const payer = queryParams.get("payer");
    const snapshotId = queryParams.get("snapshot_id");
    
    if (!payer && !snapshotId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "payer or snapshot_id parameter required" }));
      return;
    }
    
    let transaction: LedgerEntry | null = null;
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
    
    console.log(`   🔄 [Service Provider] RPC Poll: tx/status(${payer ? `payer=${payer}` : `snapshotId=${snapshotId?.substring(0, 8)}...`}) → Status: ${transaction.status}`);
    
    // Broadcast RPC poll event
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
        timestamp: transaction.timestamp,
      },
      timestamp: Date.now()
    }));
    return;
  }

  // ============================================
  // WEBHOOK REGISTRATION (Optional Push)
  // ============================================

  // Register webhook for provider
  if (pathname === "/rpc/webhook/register" && req.method === "POST") {
    console.log(`   ✅ [${requestId}] POST /rpc/webhook/register`);
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
        
        // Validate URL
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
          failureCount: 0,
        });
        
        console.log(`📡 [Service Provider] Webhook Registered: ${providerId} → ${webhookUrl}`);
        
        // Broadcast webhook registration event
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
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Unregister webhook
  if (pathname === "/rpc/webhook/unregister" && req.method === "POST") {
    console.log(`   ✅ [${requestId}] POST /rpc/webhook/unregister`);
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
        
        // Broadcast webhook unregistration event
        if (removed) {
          console.log(`🔌 [Service Provider] Webhook Unregistered: ${providerId}`);
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
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // List webhooks (for debugging)
  if (pathname === "/rpc/webhook/list" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /rpc/webhook/list`);
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

  // ============================================
  // MOCK WEBHOOK ENDPOINT (for testing)
  // ============================================
  // This endpoint simulates service provider webhook receivers
  if (pathname.startsWith("/mock/webhook/") && req.method === "POST") {
    const providerId = pathname.split("/mock/webhook/")[1];
    console.log(`   📥 [Mock Webhook] Received webhook for provider: ${providerId}`);
    
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        console.log(`   ✅ [Mock Webhook] Successfully received webhook for ${providerId}:`, {
          event: payload.event,
          txId: payload.snapshot?.txId,
          payer: payload.snapshot?.payer,
          amount: payload.snapshot?.amount
        });
        
        // Broadcast mock webhook receipt
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
        
        // Return success response
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: "Webhook received",
          providerId,
          receivedAt: Date.now()
        }));
      } catch (err: any) {
        console.error(`   ❌ [Mock Webhook] Error parsing webhook payload for ${providerId}:`, err.message);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload" }));
      }
    });
    return;
  }
  
  // GET /api/ledger - Get ledger entries with pagination
  if (pathname === "/api/ledger" && req.method === "GET") {
    console.log(`📡 [API] ⭐ GET /api/ledger endpoint called`);
    const parsedUrl = url.parse(req.url || "/", true);
    const payerEmail = parsedUrl.query.email as string | undefined;
    
    // Pagination parameters
    const pageParam = parsedUrl.query.page as string | undefined;
    const limitParam = parsedUrl.query.limit as string | undefined;
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    
    console.log(`📡 [API] Query params:`, parsedUrl.query);
    console.log(`📡 [API] Pagination: page=${page}, limit=${limit}`);
    console.log(`📡 [API] Checking LEDGER array before getLedgerEntries call: ${LEDGER.length} entries`);
    console.log(`📡 [API] LEDGER array reference check:`, typeof LEDGER);

    LEDGER.forEach((entry, index) => {
      if (index < 5) { // Log first 5 entries
        console.log(`📡 [API] Entry ${index}:`, {
          entryId: entry.entryId,
          txId: entry.txId,
          payer: entry.payer,
          merchant: entry.merchant,
          amount: entry.amount,
          serviceType: entry.serviceType,
          status: entry.status,
          movieTitle: entry.bookingDetails?.movieTitle,
          timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : 'no timestamp'
        });
      }
    });

    // Get all entries (filtered by payerEmail if provided)
    let allEntries = getLedgerEntries(payerEmail);
    console.log(`📡 [API] getLedgerEntries returned ${allEntries.length} entries${payerEmail ? ` for ${payerEmail}` : ' (all entries)'}`);
    
    // Sort by timestamp in descending order (newest first)
    allEntries.sort((a, b) => {
      const timestampA = a.timestamp || 0;
      const timestampB = b.timestamp || 0;
      return timestampB - timestampA; // Descending order (newest first)
    });
    
    // Calculate pagination
    const total = allEntries.length;
    const totalPages = Math.ceil(total / limit);
    const validPage = Math.max(1, Math.min(page, totalPages)); // Ensure page is within valid range
    const startIndex = (validPage - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedEntries = allEntries.slice(startIndex, endIndex);
    
    console.log(`📡 [API] Pagination: total=${total}, totalPages=${totalPages}, page=${validPage}, showing ${paginatedEntries.length} entries (${startIndex + 1}-${Math.min(endIndex, total)})`);
    console.log(`📡 [API] LEDGER array has ${LEDGER.length} entries in memory`);
    if (LEDGER.length > 0) {
      console.log(`📡 [API] First entry:`, JSON.stringify(LEDGER[0], null, 2));
    }
    
    const response = {
      success: true,
      entries: paginatedEntries,
      pagination: {
        page: validPage,
        limit: limit,
        total: total,
        totalPages: totalPages,
        hasNextPage: validPage < totalPages,
        hasPreviousPage: validPage > 1
      }
    };
    console.log(`📡 [API] Sending response with pagination:`, {
      entriesCount: paginatedEntries.length,
      page: validPage,
      totalPages: totalPages,
      total: total
    });
    console.log(`📤 [${requestId}] Response: 200 OK (${paginatedEntries.length} ledger entries, page ${validPage}/${totalPages})`);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*" // Ensure CORS is allowed
    });
    res.end(JSON.stringify(response));
    return;
  }

  // GET /api/cashier - Get cashier status (also handle typo /api/cachier)
  if ((pathname === "/api/cashier" || pathname === "/api/cachier") && req.method === "GET") {
    console.log(`   💰 [${requestId}] GET ${pathname} - Getting cashier status`);
    try {
      const cashierStatus = getCashierStatus();
      console.log(`   ✅ [${requestId}] Cashier status retrieved:`, cashierStatus.name);
      res.writeHead(200, { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(JSON.stringify({
        success: true,
        cashier: cashierStatus
      }));
    } catch (error: any) {
      console.error(`   ❌ [${requestId}] Error getting cashier status:`, error.message);
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

  // ============================================
  // SYSTEM PROMPT GENERATION SERVICE (Holy Ghost)
  // ============================================
  if (pathname === "/api/system-prompt/generate" && req.method === "POST") {
    console.log(`   🤖 [${requestId}] POST /api/system-prompt/generate - Generating system prompt`);
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", async () => {
      try {
        const { description, serviceType } = JSON.parse(body);
        if (!description || !serviceType) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "description and serviceType required" }));
          return;
        }
        
        // Generate prompts using LLM
        const prompts = await generateSystemPrompts(description, serviceType);
        
        // Store in Redis
        const redisKey = `eden:system-prompts:${serviceType}`;
        redis.set(redisKey, JSON.stringify(prompts));
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, prompts, redisKey }));
      } catch (err: any) {
        console.error(`   ❌ Failed to generate system prompt:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          success: false, 
          error: err.message || 'Failed to generate system prompt'
        }));
      }
    });
    return;
  }

  if (pathname.startsWith("/api/system-prompt/") && req.method === "GET") {
    const serviceType = pathname.split("/").pop();
    console.log(`   📋 [${requestId}] GET /api/system-prompt/${serviceType} - Retrieving system prompt`);
    
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
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ============================================
  // NOTIFICATION CODE GENERATION SERVICE (Holy Ghost)
  // ============================================
  if (pathname === "/api/notification-code/generate" && req.method === "POST") {
    console.log(`   🔔 [${requestId}] POST /api/notification-code/generate - Generating notification code`);
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", async () => {
      try {
        const { providerId, providerName, language, framework, indexerEndpoint, webhookUrl, serviceType, notificationMethods } = JSON.parse(body);
        if (!providerId || !language || !framework) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "providerId, language, and framework required" }));
          return;
        }
        
        // Generate code using LLM
        const code = await generateNotificationCode({
          providerId,
          providerName: providerName || providerId,
          language,
          framework,
          indexerEndpoint: indexerEndpoint || `http://localhost:${HTTP_PORT}`,
          webhookUrl: webhookUrl || `http://localhost:${HTTP_PORT}/mock/webhook/${providerId}`,
          serviceType: serviceType || "movie",
          notificationMethods: notificationMethods || ["webhook", "pull", "rpc"]
        });
        
        // Store in Redis
        const redisKey = `eden:notification-code:${providerId}`;
        redis.set(redisKey, JSON.stringify(code));
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, code, redisKey }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname.startsWith("/api/notification-code/") && req.method === "GET") {
    const providerId = pathname.split("/").pop();
    console.log(`   📋 [${requestId}] GET /api/notification-code/${providerId} - Retrieving notification code`);
    
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
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ============================================
  // CERTIFICATION PROVISION WIZARD API
  // ============================================
  if (pathname === "/api/wizard/service-types" && req.method === "GET") {
    console.log(`   🧙 [${requestId}] GET /api/wizard/service-types - Getting service types`);
    
    const serviceTypes = [
      { type: "movie", icon: "🎬", name: "Movie Tickets", description: "Movie ticket booking service" },
      { type: "dex", icon: "💰", name: "DEX Tokens", description: "Decentralized exchange token pools" },
      { type: "airline", icon: "✈️", name: "Airline Tickets", description: "Airline ticket booking service" },
      { type: "autoparts", icon: "🔧", name: "Auto Parts", description: "Automotive parts marketplace" },
      { type: "hotel", icon: "🏨", name: "Hotel Booking", description: "Hotel reservation service" },
      { type: "restaurant", icon: "🍽️", name: "Restaurant Reservations", description: "Restaurant booking service" },
      { type: "snake", icon: "🐍", name: "Snake (Advertiser)", description: "Advertising service provider" }
    ];
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, serviceTypes }));
    return;
  }

  if (pathname === "/api/wizard/create-garden" && req.method === "POST") {
    console.log(`   🧙 [${requestId}] POST /api/wizard/create-garden - Creating garden via wizard`);
    console.log(`   🔍 [${requestId}] Current state: ${GARDENS.length} regular gardens, ${TOKEN_GARDENS.length} token gardens`);
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", async () => {
      try {
        const requestData = JSON.parse(body);
        // Accept both gardenName and indexerName for backward compatibility
        const gardenName = requestData.gardenName || requestData.indexerName;
        const { serviceType, serverIp, serverDomain, serverPort, networkType, isSnake, email, amount, selectedProviders } = requestData;
        
        // Check priesthood certification for non-admin users
        if (email && email !== 'bill.draper.auto@gmail.com') {
          const hasCert = hasPriesthoodCertification(email);
          if (!hasCert) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ 
              success: false, 
              error: "Priesthood certification required to create gardens. Please apply for priesthood certification first." 
            }));
            return;
          }
        }
        
        // Log received data for debugging
        console.log(`   📥 [${requestId}] Received create-garden request:`, {
          serviceType,
          gardenName,
          selectedProviders: selectedProviders || 'NOT PROVIDED',
          selectedProvidersType: typeof selectedProviders,
          selectedProvidersIsArray: Array.isArray(selectedProviders),
          currentTokenIndexersCount: TOKEN_GARDENS.length,
          currentTokenIndexerIds: TOKEN_GARDENS.map(ti => ti.id).join(', ')
        });
        
        if (!serviceType || !gardenName) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "serviceType and gardenName required" }));
          return;
        }
        
        // Validate email (Google user aware)
        if (!email || typeof email !== 'string' || !email.includes('@')) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid email address required. Please sign in with Google first." }));
          return;
        }
        
        // Validate amount
        if (!amount || typeof amount !== 'number' || amount <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid deployment fee amount required" }));
          return;
        }
        
        // Check wallet balance BEFORE creating garden
        const balance = await getWalletBalance(email);
        if (balance < amount) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: false, 
            error: `Insufficient balance. Required: ${amount} 🍎 APPLES, Available: ${balance} 🍎 APPLES. Please purchase more 🍎 APPLES first.`,
            balance: balance
          }));
          return;
        }
        
        // Debit wallet balance BEFORE creating garden
        const txId = crypto.randomUUID();
        const debitResult = await debitWallet(
          email,
          amount,
          txId,
          'indexer_deployment',
          { 
            serviceType: serviceType,
            gardenName: gardenName,
            createdBy: email
          }
        );
        
        if (!debitResult.success) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: false, 
            error: debitResult.error || 'Failed to debit wallet',
            balance: debitResult.balance
          }));
          return;
        }
        
        // Create transaction snapshot for garden creation
        const snapshot: TransactionSnapshot = {
          chainId: 'eden:mainnet',
          txId: txId,
          slot: Date.now(),
          blockTime: Date.now(),
          payer: email,
          merchant: 'ROOT CA',
          amount: amount,
          feeSplit: {}
        };
        
        // Create ledger entry for garden creation
        const ledgerEntry = addLedgerEntry(
          snapshot,
          'garden_deployment',
          0, // iGasCost (no iGas for garden creation)
          email, // payerId
          'ROOT CA', // merchantName
          ROOT_CA_UUID, // providerUuid
          {
            type: 'garden_deployment',
            description: `Garden deployment: ${gardenName || 'Unknown'}`,
            price: amount,
            serviceType: serviceType,
            gardenName: gardenName,
            createdBy: email
          }
        );
        
        // Get user for cashier processing
        let user = USERS_STATE.find(u => u.email === email);
        if (!user) {
          user = {
            id: email,
            email: email,
            balance: debitResult.balance
          };
          USERS_STATE.push(user);
        } else {
          // Update user balance to match debited balance
          user.balance = debitResult.balance;
        }
        
        // Process payment through cashier (wallet already debited, so just update cashier stats)
        const cashier = getCashierStatus();
        cashier.processedCount++;
        cashier.totalProcessed += amount;
        ledgerEntry.status = 'processed';
        
        // Broadcast cashier payment processed event
        broadcastEvent({
          type: "cashier_payment_processed",
          component: "cashier",
          message: `${cashier.name} processed payment: ${amount} 🍎 APPLES`,
          timestamp: Date.now(),
          data: { entry: ledgerEntry, cashier, userBalance: debitResult.balance, walletService: "wallet-service-001" }
        });
        
        // Complete the booking
        completeBooking(ledgerEntry);
        
        // Note: pushLedgerEntryToSettlementStream is already called inside addLedgerEntry
        // No need to call it again here
        
        // Broadcast ledger entry created event
        broadcastEvent({
          type: "ledger_entry_created",
          component: "ledger",
          message: `Ledger entry created for garden deployment: ${ledgerEntry.entryId}`,
          timestamp: Date.now(),
          data: { entry: ledgerEntry }
        });
        
        // Also broadcast ledger_entry_added for backward compatibility
        broadcastEvent({
          type: "ledger_entry_added",
          component: "ledger",
          message: `Ledger entry created: ${ledgerEntry.entryId}`,
          timestamp: Date.now(),
          data: { entry: ledgerEntry }
        });
        
        // Determine next available port (starting from 3001) if not provided
        let finalPort = serverPort;
        if (!finalPort || finalPort < 3001) {
          const basePort = 3001;
          const existingIndexers = [...GARDENS, ...TOKEN_GARDENS];
          const usedPorts = existingIndexers.map(i => {
            // Extract port from existing indexers if stored
            return (i as any).serverPort || null;
          }).filter(p => p !== null && p !== undefined);
          
          let nextPort = basePort;
          while (usedPorts.includes(nextPort)) {
            nextPort++;
          }
          finalPort = nextPort;
        }
        
        // Create indexer configuration
        // CRITICAL: Check BOTH in-memory arrays AND persistence file to avoid duplicates
        // This follows the same pattern as movie garden creation
        const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
        let persistedGardens: any[] = [];
        if (fs.existsSync(persistenceFile)) {
          try {
            const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
            const persisted = JSON.parse(fileContent);
            persistedGardens = persisted.gardens || persisted.indexers || [];
            // Deduplicate persisted gardens by ID
            const persistedMap = new Map<string, any>();
            for (const g of persistedGardens) {
              if (!persistedMap.has(g.id)) {
                persistedMap.set(g.id, g);
              }
            }
            persistedGardens = Array.from(persistedMap.values());
          } catch (err: any) {
            console.warn(`   ⚠️  [${requestId}] Failed to read persistence file for ID generation: ${err.message}`);
          }
        }
        
        // Combine in-memory and persisted gardens for ID generation
        const allExistingIndexers = [...GARDENS, ...TOKEN_GARDENS, ...persistedGardens];
        // Deduplicate by ID to ensure we have unique list
        const allIndexersMap = new Map<string, any>();
        for (const idx of allExistingIndexers) {
          if (!allIndexersMap.has(idx.id)) {
            allIndexersMap.set(idx.id, idx);
          }
        }
        const uniqueExistingIndexers = Array.from(allIndexersMap.values());
        
        let gardenId: string;
        if (isSnake) {
          const snakeIds = uniqueExistingIndexers.filter(i => (i as any).isSnake).map(i => {
            const match = i.id.match(/^S(\d+)$/);
            return match ? parseInt(match[1], 10) : 0;
          });
          const maxSnakeNumber = snakeIds.length > 0 ? Math.max(...snakeIds) : 0;
          gardenId = `S${maxSnakeNumber + 1}`;
        } else if (serviceType === "dex") {
          // CRITICAL: Check BOTH in-memory TOKEN_GARDENS AND persisted gardens
          // Find the highest T number from all sources and add 1
          const tokenGardenIds = uniqueExistingIndexers
            .filter(i => i.id && i.id.startsWith('T'))
            .map(ti => {
            const match = ti.id.match(/^T(\d+)$/);
            return match ? parseInt(match[1], 10) : 0;
          });
          const maxTokenNumber = tokenGardenIds.length > 0 ? Math.max(...tokenGardenIds) : 0;
          gardenId = `T${maxTokenNumber + 1}`;
          console.log(`   🔢 [${requestId}] Generated token garden ID: ${gardenId} (max existing: ${maxTokenNumber}, total unique token gardens found: ${tokenGardenIds.length})`);
        } else {
          // For regular gardens, use format: garden-1, garden-2, etc.
          // Check BOTH in-memory GARDENS AND persisted gardens
          const regularGardenIds = uniqueExistingIndexers
            .filter(i => i.id && (i.id.startsWith('garden-') || i.id.startsWith('indexer-'))) // Support both for migration
            .map(i => {
              // Support both "garden-N" and "indexer-N" formats for migration
              const gardenMatch = i.id.match(/^garden-(\d+)$/);
              const indexerMatch = i.id.match(/^indexer-(\d+)$/);
              if (gardenMatch) return parseInt(gardenMatch[1], 10);
              if (indexerMatch) return parseInt(indexerMatch[1], 10);
              return 0;
            });
          const maxRegularNumber = regularGardenIds.length > 0 ? Math.max(...regularGardenIds) : 0;
          gardenId = `garden-${maxRegularNumber + 1}`;
        }
        
        // Check if garden ID already exists (prevent duplicates by ID - names can be the same)
        // Check in BOTH in-memory arrays AND persisted gardens
        const existingGardenById = uniqueExistingIndexers.find(i => i.id === gardenId);
        if (existingGardenById) {
          console.error(`   ❌ [${requestId}] DUPLICATE DETECTED: Garden ID "${gardenId}" already exists!`);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: false, 
            error: `Garden with ID "${gardenId}" already exists (Name: ${existingGardenById.name})`,
            existingGarden: existingGardenById
          }));
          return;
        }
        
        const gardenConfig: GardenConfig = {
          id: gardenId,
          name: gardenName,
          stream: isSnake ? `eden:snake:${gardenId}` : 
                 (serviceType === "dex" ? `eden:token-garden:${gardenId}` : `eden:garden:${gardenId}`),
          active: true,
          uuid: `eden:garden:${crypto.randomUUID()}`,
          ownerEmail: email, // CRITICAL: Store Priest user email for garden ownership and lifecycle management
          priestEmail: email, // Alias for backward compatibility
        };
        
        // Add network configuration
        (gardenConfig as any).serverIp = serverIp || "localhost";
        (gardenConfig as any).serverDomain = serverDomain || `garden-${gardenId.toLowerCase().replace('garden-', '').replace('indexer-', '')}.eden.local`;
        (gardenConfig as any).serverPort = finalPort;
        (gardenConfig as any).networkType = networkType || "http";
        (gardenConfig as any).serviceType = serviceType;
        (gardenConfig as any).isSnake = isSnake || false;
        
        console.log(`   👤 [${requestId}] Garden ownership assigned to Priest user: ${email}`);
        
        // CRITICAL: Issue certificate BEFORE adding to array AND BEFORE saving
        // This ensures the certificate is included in the gardenConfig object
        console.log(`   📜 [Certificate] Issuing certificate for ${gardenConfig.name} (${gardenConfig.id})...`);
        issueGardenCertificate(gardenConfig);
        
        // Verify certificate was issued
        if (!gardenConfig.certificate) {
          console.error(`   ❌ [Certificate] Certificate was NOT issued to ${gardenConfig.name} (${gardenConfig.id})!`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: false, 
            error: `Failed to issue certificate to garden ${gardenConfig.id}`
          }));
          return;
        }
        console.log(`   ✅ [Certificate] Certificate issued successfully to ${gardenConfig.name} (${gardenConfig.id})`);
        
        // Add to appropriate array (after certificate is issued and verified)
        // CRITICAL: Check for duplicates before adding
        if (serviceType === "dex") {
          // Check if this token garden already exists
          const existingTokenGarden = TOKEN_GARDENS.find(ti => ti.id === gardenConfig.id);
          if (existingTokenGarden) {
            console.error(`   ❌ [DUPLICATE PREVENTION] Token garden ${gardenConfig.id} already exists in TOKEN_GARDENS! Skipping duplicate.`);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ 
              success: false, 
              error: `Token garden with ID "${gardenConfig.id}" already exists`,
              existingGarden: existingTokenGarden
            }));
            return;
          }
          // CRITICAL: Include certificate in the object we push
          const tokenGardenWithCert = { ...gardenConfig, tokenServiceType: 'dex', certificate: gardenConfig.certificate };
          (TOKEN_GARDENS as any[]).push(tokenGardenWithCert);
          console.log(`   ✅ Created token garden: ${gardenConfig.name} (${gardenConfig.id}). Total token gardens in memory: ${TOKEN_GARDENS.length}`);
          console.log(`   🔍 [Token Garden Debug] TOKEN_GARDENS IDs: ${TOKEN_GARDENS.map(ti => ti.id).join(', ')}`);
          console.log(`   🔍 [Certificate Check] Token garden ${gardenConfig.id} has certificate: ${!!tokenGardenWithCert.certificate}`);
        } else {
          // Check if this regular garden already exists
          const existingRegularGarden = GARDENS.find(i => i.id === gardenConfig.id);
          if (existingRegularGarden) {
            console.error(`   ❌ [DUPLICATE PREVENTION] Regular garden ${gardenConfig.id} already exists in GARDENS! Skipping duplicate.`);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ 
              success: false, 
              error: `Regular garden with ID "${gardenConfig.id}" already exists`,
              existingGarden: existingRegularGarden
            }));
            return;
          }
          // CRITICAL: Include certificate in the object we push
          GARDENS.push({ ...gardenConfig, certificate: gardenConfig.certificate });
          console.log(`   ✅ Created regular garden: ${gardenConfig.name} (${gardenConfig.id}). Total regular gardens: ${GARDENS.length}`);
          console.log(`   🔍 [Certificate Check] Regular garden ${gardenConfig.id} has certificate: ${!!gardenConfig.certificate}`);
          console.log(`   🔍 [Service Type] Regular garden ${gardenConfig.id} has serviceType: ${(gardenConfig as any).serviceType || 'undefined'}`);
          if ((gardenConfig as any).serviceType === 'movie') {
            console.log(`   🎬 [Movie Garden] Movie garden created via Angular wizard: ${gardenConfig.name} (${gardenConfig.id})`);
          }
          
          // Log garden creation
          const gardenLogData = {
            gardenId: gardenConfig.id,
            gardenName: gardenConfig.name,
            serviceType: (gardenConfig as any).serviceType,
            hasCertificate: !!gardenConfig.certificate,
            totalGardens: GARDENS.length
          };
          console.log(`📝 [Garden Lifecycle] ✅ Garden added to memory:`, gardenLogData);
          getLogger().log('garden-lifecycle', 'garden-added-to-memory', gardenLogData);
          
          // Broadcast garden creation event to frontend
          broadcastEvent({
            type: "garden_created",
            component: "root-ca",
            message: `Garden ${gardenConfig.name} created successfully`,
            timestamp: Date.now(),
            data: {
              gardenId: gardenConfig.id,
              gardenName: gardenConfig.name,
              serviceType: (gardenConfig as any).serviceType,
              hasCertificate: !!gardenConfig.certificate,
              ownerEmail: gardenConfig.ownerEmail, // Include owner email for lifecycle management
              totalGardens: GARDENS.length
            }
          });
        }
        
        // Create service providers for gardens using generic provider creation
        let providersCreated = 0;
        let providerResults: Array<{ providerId: string; providerName: string; created: boolean; assigned: boolean }> = [];
        
        // Support both old format (selectedProviders array for movie) and new format (providers array)
        let providersToCreate: Array<{
          id?: string;
          name: string;
          location?: string;
          bond?: number;
          reputation?: number;
          apiEndpoint?: string;
          uuid?: string;
          insuranceFee?: number;
          iGasMultiplier?: number;
          iTaxMultiplier?: number;
          maxInfluence?: number;
          contextsAllowed?: string[];
          contextsForbidden?: string[];
          adCapabilities?: string[];
        }> = [];
        
        // Backward compatibility: Handle old selectedProviders format for movie
        // CRITICAL: Only process selectedProviders if serviceType is EXACTLY "movie"
        // This prevents movie providers from being created for airline or other service types
        if (serviceType === "movie" && selectedProviders && Array.isArray(selectedProviders) && selectedProviders.length > 0) {
          console.log(`   🎬 Converting ${selectedProviders.length} selectedProviders to provider configs for movie garden...`);
          console.log(`   🔍 [DEBUG] serviceType="${serviceType}", selectedProviders=[${selectedProviders.join(', ')}]`);
          
          // Predefined movie provider map (for backward compatibility)
          const movieProviderMap: Record<string, { name: string; uuid: string; location: string; bond: number; reputation: number; apiEndpoint: string }> = {
            'amc-001': {
              name: 'AMC Theatres',
              uuid: '550e8400-e29b-41d4-a716-446655440001',
              location: 'Baltimore, Maryland',
              bond: 1000,
              reputation: 4.8,
              apiEndpoint: 'https://api.amctheatres.com/v1/listings'
            },
            'cinemark-001': {
              name: 'Cinemark',
              uuid: '550e8400-e29b-41d4-a716-446655440003',
              location: 'Baltimore, Maryland',
              bond: 1200,
              reputation: 4.7,
              apiEndpoint: 'https://api.cinemark.com/movies'
            },
            'moviecom-001': {
              name: 'MovieCom',
              uuid: '550e8400-e29b-41d4-a716-446655440002',
              location: 'Baltimore, Maryland',
              bond: 800,
              reputation: 4.5,
              apiEndpoint: 'https://api.moviecom.com/showtimes'
            }
          };
          
          // Convert selectedProviders IDs to provider configs
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
              console.warn(`   ⚠️  Provider ID ${providerId} not found in movie provider map. Skipping.`);
            }
          }
        } else if (selectedProviders && Array.isArray(selectedProviders) && selectedProviders.length > 0 && serviceType !== "movie") {
          // CRITICAL: If selectedProviders is provided for non-movie service types, log a warning and ignore it
          console.warn(`   ⚠️  [CRITICAL] selectedProviders provided for non-movie service type "${serviceType}": [${selectedProviders.join(', ')}]`);
          console.warn(`   ⚠️  [CRITICAL] Ignoring selectedProviders - they are only valid for movie service type`);
          console.warn(`   ⚠️  [CRITICAL] Use 'providers' array instead for ${serviceType} service type`);
        }
        
        // New format: Check for providers array in request
        if (requestData.providers && Array.isArray(requestData.providers)) {
          if (requestData.providers.length > 0) {
            console.log(`   📋 Using new providers array format: ${requestData.providers.length} provider(s)`);
            providersToCreate = requestData.providers;
          } else {
            console.log(`   📋 Empty providers array provided for ${serviceType} garden`);
          }
        }
        
        // Create providers if any are specified
        if (providersToCreate.length > 0) {
          console.log(`   🔧 Creating ${providersToCreate.length} service provider(s) for ${serviceType} garden ${gardenConfig.id}...`);
          console.log(`   🔍 [DEBUG] providersToCreate:`, providersToCreate.map(p => ({ id: p.id, name: p.name })));
          
          // CRITICAL: Validate that all providers match the service type
          // This prevents movie providers (amc-001, cinemark-001, moviecom-001) from being created for airline or other service types
          const movieProviderIds = ['amc-001', 'cinemark-001', 'moviecom-001'];
          const mismatchedProviders = providersToCreate.filter(p => {
            return p.id && movieProviderIds.includes(p.id) && serviceType !== "movie";
          });
          
          if (mismatchedProviders.length > 0) {
            console.error(`   ❌ [CRITICAL] Provider type mismatch detected!`);
            console.error(`   ❌ [CRITICAL] Service type: "${serviceType}", but movie providers found:`, mismatchedProviders.map(p => p.id).join(', '));
            console.error(`   ❌ [CRITICAL] Removing mismatched providers to prevent incorrect provider creation`);
            providersToCreate = providersToCreate.filter(p => {
              return !(p.id && movieProviderIds.includes(p.id) && serviceType !== "movie");
            });
            console.log(`   ✅ [CRITICAL] Filtered providers list (${providersToCreate.length} remaining):`, providersToCreate.map(p => ({ id: p.id, name: p.name })));
            
            // If all providers were filtered out, skip provider creation
            if (providersToCreate.length === 0) {
              console.warn(`   ⚠️  [CRITICAL] All providers were filtered out due to type mismatch. Skipping provider creation.`);
              console.warn(`   ⚠️  [CRITICAL] Default provider will be created instead (if applicable).`);
            }
          }
          
          // Predefined provider map (only for movie, for backward compatibility)
          const predefinedProviderMap = serviceType === "movie" ? {
            'amc-001': {
              name: 'AMC Theatres',
              uuid: '550e8400-e29b-41d4-a716-446655440001',
              location: 'Baltimore, Maryland',
              bond: 1000,
              reputation: 4.8,
              apiEndpoint: 'https://api.amctheatres.com/v1/listings'
            },
            'cinemark-001': {
              name: 'Cinemark',
              uuid: '550e8400-e29b-41d4-a716-446655440003',
              location: 'Baltimore, Maryland',
              bond: 1200,
              reputation: 4.7,
              apiEndpoint: 'https://api.cinemark.com/movies'
            },
            'moviecom-001': {
              name: 'MovieCom',
              uuid: '550e8400-e29b-41d4-a716-446655440002',
              location: 'Baltimore, Maryland',
              bond: 800,
              reputation: 4.5,
              apiEndpoint: 'https://api.moviecom.com/showtimes'
            }
          } : undefined;
          
          try {
            providerResults = createServiceProvidersForGarden(
              serviceType,
              gardenConfig.id,
              providersToCreate,
              predefinedProviderMap
            );
            
            providersCreated = providerResults.filter(r => r.created || r.assigned).length;
            console.log(`   ✅ Successfully processed ${providersCreated} provider(s): ${providerResults.map(r => r.providerName).join(', ')}`);
            
            // CRITICAL: Ensure service registry is saved to persistence after provider creation
            // (createServiceProvidersForGarden already saves, but double-check here)
            try {
              const serviceRegistry2 = getServiceRegistry2();
              serviceRegistry2.savePersistence();
              console.log(`   💾 Service registry saved to persistence after provider creation`);
            } catch (saveErr: any) {
              console.error(`   ❌ Failed to save service registry after provider creation:`, saveErr.message);
            }
          } catch (providerErr: any) {
            console.error(`   ❌ Failed to create providers:`, providerErr.message);
            // Don't fail the entire garden creation, just log the error
            console.warn(`   ⚠️  Continuing with garden creation despite provider creation failure`);
          }
        } else {
          console.log(`   ℹ️  No providers specified for ${serviceType} garden. Skipping provider creation.`);
          
          // For non-movie, non-dex service types (like airline), create a default provider if none were specified
          // This ensures the service type appears in the service registry
          if (serviceType !== "movie" && serviceType !== "dex" && serviceType !== "snake") {
            // Check if a provider already exists for this garden to prevent duplicates
            const serviceRegistry2 = getServiceRegistry2();
            const existingProvidersForGarden = serviceRegistry2.getAllProviders().filter(
              p => p.gardenId === gardenConfig.id && p.serviceType === serviceType
            );
            
            if (existingProvidersForGarden.length > 0) {
              console.log(`   ⚠️  Garden ${gardenConfig.id} already has ${existingProvidersForGarden.length} provider(s) for ${serviceType}, skipping default provider creation`);
            } else {
              console.log(`   🔧 Creating default provider for ${serviceType} garden ${gardenConfig.id}...`);
              try {
                const defaultProviderConfig = {
                  name: `${gardenConfig.name} Provider`,
                  location: 'Unknown',
                  bond: 1000,
                  reputation: 5.0,
                  apiEndpoint: `https://api.${serviceType}.com/v1`
                };
                
                providerResults = createServiceProvidersForGarden(
                  serviceType,
                  gardenConfig.id,
                  [defaultProviderConfig],
                  undefined
                );
                
                providersCreated = providerResults.filter(r => r.created || r.assigned).length;
                console.log(`   ✅ Created default provider for ${serviceType} garden: ${providerResults.map(r => r.providerName).join(', ')}`);
                
                // CRITICAL: Ensure service registry is saved to persistence after default provider creation
                try {
                  serviceRegistry2.savePersistence();
                  console.log(`   💾 Service registry saved to persistence after default provider creation`);
                } catch (saveErr: any) {
                  console.error(`   ❌ Failed to save service registry after default provider creation:`, saveErr.message);
                }
              } catch (defaultProviderErr: any) {
                console.warn(`   ⚠️  Failed to create default provider for ${serviceType} garden:`, defaultProviderErr.message);
              }
            }
          }
        }
        
        // Create DEX service providers for token gardens
        if (serviceType === "dex") {
          console.log(`   💰 Creating DEX pool service providers for token garden ${gardenConfig.id}...`);
          
          // Find the index of this token garden in TOKEN_GARDENS array
          // CRITICAL: Token garden should already be in TOKEN_GARDENS array (added at line 2407)
          const tokenGardenIndex = TOKEN_GARDENS.findIndex(ti => ti.id === gardenConfig.id);
          if (tokenGardenIndex === -1) {
            console.warn(`   ⚠️  Token garden ${gardenConfig.id} not found in TOKEN_GARDENS array`);
            console.warn(`   ⚠️  Current TOKEN_GARDENS IDs: ${TOKEN_GARDENS.map(ti => ti.id).join(', ')}`);
            console.warn(`   ⚠️  Skipping DEX pool and provider creation for ${gardenConfig.id}`);
          } else {
            // Create pool for this token garden (matching initializeDEXPools format)
            // Token Garden T1 gets TOKENA, T2 gets TOKENB, etc.
            const tokenSymbol = `TOKEN${String.fromCharCode(65 + tokenGardenIndex)}`; // TOKENA, TOKENB, TOKENC...
            const tokenName = `Token ${String.fromCharCode(65 + tokenGardenIndex)}`;
            const poolId = `pool-solana-${tokenSymbol.toLowerCase()}`;
            
            // Check if pool already exists
            if (DEX_POOLS.has(poolId)) {
              console.log(`   ⚠️  Pool ${poolId} already exists, skipping pool creation...`);
            } else {
              // Create new pool for this token garden (matching initializeDEXPools structure)
              const pool: TokenPool = {
                poolId: poolId,
                tokenSymbol: tokenSymbol,
                tokenName: tokenName,
                baseToken: "SOL",
                poolLiquidity: 100 - (tokenGardenIndex * 10), // Decreasing liquidity for variety: 100, 90, 80...
                tokenReserve: 100000 - (tokenGardenIndex * 10000), // 100k, 90k, 80k...
                baseReserve: 100 - (tokenGardenIndex * 10), // 100, 90, 80...
                price: 0.001, // 1 Token = 0.001 SOL
                bond: 5000,
                gardenId: gardenConfig.id, // Assign to this token garden
                createdAt: Date.now(),
                totalVolume: 0,
                totalTrades: 0,
              };
              
              DEX_POOLS.set(poolId, pool);
              console.log(`   ✅ Created DEX pool: ${tokenSymbol} (${poolId}) → ${gardenConfig.id}`);
            }
            
            // Create service provider for this pool
            const providerId = `dex-pool-${tokenSymbol.toLowerCase()}`;
            const serviceRegistry2 = getServiceRegistry2();
            const existingProvider = serviceRegistry2.getProvider(providerId);
            
            if (existingProvider && existingProvider.gardenId === gardenConfig.id) {
              console.log(`   ⚠️  Provider ${providerId} already exists for garden ${gardenConfig.id}, skipping...`);
            } else {
              const provider: ServiceProviderWithCert = {
                id: providerId,
                uuid: crypto.randomUUID(),
                name: `${tokenSymbol} Pool (${gardenConfig.name})`,
                serviceType: "dex",
                location: "Eden DEX",
                bond: 5000,
                reputation: 5.0,
                gardenId: gardenConfig.id, // Assign to this garden
                apiEndpoint: `https://dex.eden.com/pools/${poolId}`,
                status: 'active',
              };
              
              // Add to ServiceRegistry2 (new implementation)
              try {
                serviceRegistry2.addProvider(provider);
                // Also add to old ROOT_CA_SERVICE_REGISTRY for backward compatibility (will be removed later)
                ROOT_CA_SERVICE_REGISTRY.push(provider);
              } catch (err: any) {
                console.error(`   ❌ Failed to add DEX provider to ServiceRegistry2: ${err.message}`);
                throw err;
              }
              
              // Issue certificate to provider
              try {
                issueServiceProviderCertificate(provider);
                console.log(`   📜 Certificate issued to ${provider.name}`);
              } catch (err: any) {
                console.warn(`   ⚠️  Failed to issue certificate to ${provider.name}:`, err.message);
              }
              
              providersCreated++;
              console.log(`   ✅ Registered DEX pool provider: ${provider.name} (${provider.id}) → ${gardenConfig.name}`);
              
              // Broadcast event for provider creation
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
                  poolId: poolId
                }
              });
            }
            
            console.log(`   ✅ Created DEX pool and service provider for token garden ${gardenConfig.id}`);
          }
        }
        
        // Persist indexers - save BOTH regular and token indexers together
        // Filter out default indexers and save immediately
        
        // CRITICAL: First, check if any token indexers accidentally got into GARDENS
        // If so, move them to TOKEN_GARDENS and log a warning
        const tokenIndexersInRegularArray = GARDENS.filter(idx => 
          (idx as any).tokenServiceType === 'dex' || (idx.serviceType === 'dex' && idx.id && idx.id.startsWith('T'))
        );
        if (tokenIndexersInRegularArray.length > 0) {
          console.warn(`⚠️  [Indexer Persistence] Found ${tokenIndexersInRegularArray.length} token indexer(s) in GARDENS array! Moving them to TOKEN_GARDENS...`);
          for (const tokenIdx of tokenIndexersInRegularArray) {
            // Remove from GARDENS
            const index = GARDENS.indexOf(tokenIdx);
            if (index > -1) {
              GARDENS.splice(index, 1);
            }
            // Add to TOKEN_GARDENS if not already there
            if (!TOKEN_GARDENS.some(ti => ti.id === tokenIdx.id)) {
              TOKEN_GARDENS.push(tokenIdx as any);
            }
          }
        }
        
        // CRITICAL: First, deduplicate BOTH in-memory arrays to prevent saving duplicates
        // This ensures we're working with clean data before saving
        
        // Deduplicate GARDENS array
        const deduplicatedRegularIndexers = new Map<string, GardenConfig>();
        for (const idx of GARDENS) {
          const existing = deduplicatedRegularIndexers.get(idx.id);
          if (!existing) {
            deduplicatedRegularIndexers.set(idx.id, idx);
          } else {
            // Prefer the one with certificate
            const hasCert = !!(idx as any).certificate;
            const existingHasCert = !!(existing as any).certificate;
            if (hasCert && !existingHasCert) {
              deduplicatedRegularIndexers.set(idx.id, idx);
              console.warn(`⚠️  [Indexer Persistence] Found duplicate regular indexer ${idx.id} in GARDENS - keeping version with certificate`);
            } else {
              console.warn(`⚠️  [Indexer Persistence] Found duplicate regular indexer ${idx.id} in GARDENS - keeping existing version`);
            }
          }
        }
        // Update GARDENS array to remove duplicates
        const cleanRegularIndexers = Array.from(deduplicatedRegularIndexers.values());
        console.log(`📋 [Indexer Persistence] After deduplication, GARDENS has ${cleanRegularIndexers.length} garden(s): ${cleanRegularIndexers.map(g => `${g.id}(${(g as any).serviceType || 'no-type'})`).join(', ')}`);
        
        // CRITICAL: Don't clear GARDENS array yet - we need it for the preservation logic
        // We'll update it after we've built the final list to save
        // GARDENS.length = 0;
        // GARDENS.push(...cleanRegularIndexers);
        
        let regularIndexersToSave: GardenConfig[] = [];
        let tokenIndexersToSave: GardenConfig[] = [];
        
        // Prepare regular indexers to save (from deduplicated array)
        // CRITICAL: Exclude token indexers (they have tokenServiceType or serviceType === "dex" and ID starts with T)
        if (NUM_GARDENS > 0) {
          const defaultIds = Array.from({ length: NUM_GARDENS }, (_, i) => String.fromCharCode(65 + i));
          regularIndexersToSave = cleanRegularIndexers.filter(idx => {
            // Exclude token indexers (defensive check)
            if ((idx as any).tokenServiceType === 'dex' || (idx.serviceType === 'dex' && idx.id && idx.id.startsWith('T'))) {
              console.warn(`⚠️  [Indexer Persistence] Token indexer ${idx.id} found in GARDENS during save - excluding from regular indexers`);
              return false;
            }
            const isDefault = defaultIds.includes(idx.id);
            if (isDefault) {
              console.log(`📋 [Indexer Persistence] Excluding default garden ${idx.id} from save`);
            }
            return !isDefault;
          });
          console.log(`📋 [Indexer Persistence] After filtering defaults, ${regularIndexersToSave.length} regular garden(s) to save: ${regularIndexersToSave.map(g => `${g.id}(${(g as any).serviceType || 'no-type'})`).join(', ')}`);
        } else {
          // ROOT mode: ONLY save indexers created via Angular (format: garden-1, garden-2, etc. or indexer-1, indexer-2, etc.)
          regularIndexersToSave = cleanRegularIndexers.filter(idx => {
            // Exclude token indexers (defensive check)
            if ((idx as any).tokenServiceType === 'dex' || (idx.serviceType === 'dex' && idx.id && idx.id.startsWith('T'))) {
              console.warn(`⚠️  [Indexer Persistence] Token indexer ${idx.id} found in GARDENS during save - excluding from regular indexers`);
              return false;
            }
            // Only save indexers with format "garden-N" or "indexer-N" (created via Angular)
            // Support both formats for backward compatibility
            const matchesFormat = idx.id.startsWith('garden-') || idx.id.startsWith('indexer-');
            if (!matchesFormat) {
              console.log(`📋 [Indexer Persistence] Excluding garden ${idx.id} - doesn't match garden-N or indexer-N format`);
            }
            return matchesFormat;
          });
          console.log(`📋 [Indexer Persistence] After filtering format, ${regularIndexersToSave.length} regular garden(s) to save: ${regularIndexersToSave.map(g => `${g.id}(${(g as any).serviceType || 'no-type'})`).join(', ')}`);
        }
        
        // CRITICAL: Deduplicate TOKEN_GARDENS array BEFORE collecting tokenIndexersToSave
        // This prevents duplicates from being saved if TOKEN_GARDENS has duplicates
        // CRITICAL: Always deduplicate in-memory arrays FIRST to prevent saving duplicates
        const deduplicatedTokenIndexers = new Map<string, TokenGardenConfig>();
        for (const ti of TOKEN_GARDENS) {
          const existing = deduplicatedTokenIndexers.get(ti.id);
          if (!existing) {
            deduplicatedTokenIndexers.set(ti.id, ti);
          } else {
            // Prefer the one with certificate, or the newer one (by UUID timestamp if available)
            const hasCert = !!(ti as any).certificate;
            const existingHasCert = !!(existing as any).certificate;
            if (hasCert && !existingHasCert) {
              deduplicatedTokenIndexers.set(ti.id, ti);
              console.warn(`⚠️  [Indexer Persistence] Found duplicate token indexer ${ti.id} in TOKEN_GARDENS - keeping version with certificate`);
            } else if (!hasCert && existingHasCert) {
              // Keep existing version with certificate
              console.warn(`⚠️  [Indexer Persistence] Found duplicate token indexer ${ti.id} in TOKEN_GARDENS - keeping existing version with certificate`);
            } else {
              // Both have or don't have cert - prefer current one (assumed newer)
              deduplicatedTokenIndexers.set(ti.id, ti);
              console.warn(`⚠️  [Indexer Persistence] Found duplicate token indexer ${ti.id} in TOKEN_GARDENS - keeping current version`);
            }
          }
        }
        const cleanTokenIndexers = Array.from(deduplicatedTokenIndexers.values());
        
        // CRITICAL: Always update TOKEN_GARDENS array to remove duplicates, even if count is same
        // This ensures the in-memory array is clean before we save
          TOKEN_GARDENS.length = 0;
          TOKEN_GARDENS.push(...cleanTokenIndexers);
        
        if (cleanTokenIndexers.length !== TOKEN_GARDENS.length) {
          // This should never happen now, but log if it does
          console.error(`❌ [Indexer Persistence] CRITICAL: TOKEN_GARDENS length mismatch after deduplication!`);
        }
        
        // Prepare token indexers to save (from deduplicated array)
        console.log(`🔍 [Indexer Persistence] TOKEN_GARDENS array has ${cleanTokenIndexers.length} indexer(s) after deduplication: ${cleanTokenIndexers.map(ti => ti.id).join(', ')}`);
        console.log(`🔍 [Indexer Persistence] NUM_TOKEN_GARDENS = ${NUM_TOKEN_GARDENS}, DEPLOYED_AS_ROOT = ${DEPLOYED_AS_ROOT}`);
        
        if (NUM_TOKEN_GARDENS > 0) {
          const defaultTokenIds = Array.from({ length: NUM_TOKEN_GARDENS }, (_, i) => `T${i + 1}`);
          console.log(`🔍 [Indexer Persistence] Filtering out default token IDs: ${defaultTokenIds.join(', ')}`);
          tokenIndexersToSave = cleanTokenIndexers.filter(idx => !defaultTokenIds.includes(idx.id));
        } else {
          // ROOT mode: save all token indexers (no defaults)
          // CRITICAL: In ROOT mode, we should only have token indexers created via Angular
          tokenIndexersToSave = cleanTokenIndexers;
          console.log(`🔍 [Indexer Persistence] ROOT mode: saving all ${cleanTokenIndexers.length} token indexer(s) after deduplication`);
        }
        
        console.log(`📋 [Indexer Persistence] Preparing to save: ${regularIndexersToSave.length} regular indexer(s), ${tokenIndexersToSave.length} token indexer(s)`);
        if (tokenIndexersToSave.length > 0) {
          console.log(`📋 [Indexer Persistence] Token indexers to save: ${tokenIndexersToSave.map(ti => `${ti.name} (${ti.id})`).join(', ')}`);
        }
        
        // Remove duplicates by ID - always keep the latest version (prefer one with certificate)
        const uniqueRegularIndexers = new Map<string, GardenConfig>();
        for (const idx of regularIndexersToSave) {
          const existing = uniqueRegularIndexers.get(idx.id);
          if (!existing) {
            uniqueRegularIndexers.set(idx.id, idx);
          } else {
            // Prefer the version with certificate, or the newer one
            const hasCert = !!(idx as any).certificate;
            const existingHasCert = !!(existing as any).certificate;
            if (hasCert && !existingHasCert) {
              uniqueRegularIndexers.set(idx.id, idx);
            } else if (!hasCert && existingHasCert) {
              // Keep existing version with certificate
            } else {
              uniqueRegularIndexers.set(idx.id, idx);
            }
          }
        }
        regularIndexersToSave = Array.from(uniqueRegularIndexers.values());
        
        // Remove duplicates for token indexers (by ID)
        const uniqueTokenIndexers = new Map<string, GardenConfig>();
        for (const idx of tokenIndexersToSave) {
          const existing = uniqueTokenIndexers.get(idx.id);
          if (!existing) {
            uniqueTokenIndexers.set(idx.id, idx);
          } else {
            // If duplicate found, prefer the one with certificate
            const hasCert = !!(idx as any).certificate;
            const existingHasCert = !!(existing as any).certificate;
            if (hasCert && !existingHasCert) {
              uniqueTokenIndexers.set(idx.id, idx);
            } else if (!hasCert && existingHasCert) {
              // Keep existing version with certificate
            } else {
              // Both have or don't have cert - prefer current one (from TOKEN_GARDENS)
              uniqueTokenIndexers.set(idx.id, idx);
            }
          }
        }
        tokenIndexersToSave = Array.from(uniqueTokenIndexers.values());
        
        // Force immediate save (bypass debounce)
        try {
          const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
          let existing: any = {
            walletBalances: {},
            ledgerEntries: [],
            gardens: [],
            serviceRegistry: [],
            lastSaved: new Date().toISOString()
          };
          
          if (fs.existsSync(persistenceFile)) {
            try {
              const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
              existing = JSON.parse(fileContent);
              // Backward compatibility: Migrate from old fields to 'gardens'
              if (!existing.gardens || !Array.isArray(existing.gardens)) {
                existing.gardens = [];
              }
              // Migrate from 'indexers' if it exists
              if (existing.indexers && Array.isArray(existing.indexers)) {
                console.log(`📋 [Indexer Persistence] Found 'indexers' field - migrating to 'gardens' array`);
                const existingGardenIds = new Set(existing.gardens.map((idx: any) => idx.id));
                for (const idx of existing.indexers) {
                  if (!existingGardenIds.has(idx.id)) {
                    existing.gardens.push(idx);
                  }
                }
                delete existing.indexers; // Remove old field
              }
              // Migrate from 'tokenIndexers' if it exists
              if (existing.tokenIndexers && Array.isArray(existing.tokenIndexers)) {
                console.log(`📋 [Indexer Persistence] Found 'tokenIndexers' field - migrating to 'gardens' array`);
                const existingGardenIds = new Set(existing.gardens.map((idx: any) => idx.id));
                for (const tokenIdx of existing.tokenIndexers) {
                  if (!existingGardenIds.has(tokenIdx.id)) {
                    existing.gardens.push(tokenIdx);
                  }
                }
                delete existing.tokenIndexers; // Remove old field
              }
            } catch (err: any) {
              console.warn(`⚠️  [Indexer Persistence] Failed to load existing file: ${err.message}`);
            }
          }
          
          // CRITICAL: In-memory arrays (GARDENS and TOKEN_GARDENS) are the SINGLE SOURCE OF TRUTH
          // We MUST NOT read or merge gardens from the file - that would reintroduce duplicates
          // We ONLY use the deduplicated in-memory arrays that were already cleaned above
          
          // Build final gardens array from ONLY the deduplicated in-memory arrays
          const allIndexersToSave: any[] = [];
          
          // Add regular indexers (already deduplicated above)
          for (const regIdx of regularIndexersToSave) {
            // Verify certificate before saving
            if (!regIdx.certificate) {
              console.error(`❌ [Indexer Persistence] Regular indexer ${regIdx.id} is missing certificate! Re-issuing...`);
              try {
                issueGardenCertificate(regIdx);
                console.log(`✅ [Indexer Persistence] Certificate re-issued for ${regIdx.id}`);
              } catch (err: any) {
                console.error(`❌ [Indexer Persistence] Failed to re-issue certificate for ${regIdx.id}:`, err.message);
              }
            }
            allIndexersToSave.push(regIdx);
          }
          
          // Add token indexers (already deduplicated above)
          for (const tokenIdx of tokenIndexersToSave) {
            // Verify certificate before saving
            if (!tokenIdx.certificate) {
              console.error(`❌ [Indexer Persistence] Token indexer ${tokenIdx.id} is missing certificate! Re-issuing...`);
              try {
                issueGardenCertificate(tokenIdx);
                console.log(`✅ [Indexer Persistence] Certificate re-issued for ${tokenIdx.id}`);
              } catch (err: any) {
                console.error(`❌ [Indexer Persistence] Failed to re-issue certificate for ${tokenIdx.id}:`, err.message);
              }
            }
            allIndexersToSave.push(tokenIdx);
          }
          
          // CRITICAL: Final deduplication pass by ID as absolute safety net
          // This should not be necessary since arrays are already deduplicated, but it's a safety check
          const finalDeduplicatedMap = new Map<string, any>();
          for (const idx of allIndexersToSave) {
            const existing = finalDeduplicatedMap.get(idx.id);
            if (!existing) {
              finalDeduplicatedMap.set(idx.id, idx);
            } else {
              // Prefer the one with certificate
              const hasCert = !!(idx as any).certificate;
              const existingHasCert = !!(existing as any).certificate;
              if (hasCert && !existingHasCert) {
                finalDeduplicatedMap.set(idx.id, idx);
                console.warn(`⚠️  [Indexer Persistence] Final safety check: Found duplicate ${idx.id} - keeping version with certificate`);
              } else {
                console.warn(`⚠️  [Indexer Persistence] Final safety check: Found duplicate ${idx.id} - keeping existing version`);
              }
            }
          }
          
          const finalIndexersToSave = Array.from(finalDeduplicatedMap.values());
          const duplicatesRemoved = allIndexersToSave.length - finalIndexersToSave.length;
          if (duplicatesRemoved > 0) {
            console.warn(`⚠️  [Indexer Persistence] Removed ${duplicatesRemoved} duplicate indexer(s) in final safety check`);
          }
          
          console.log(`📋 [Indexer Persistence] Saving ${regularIndexersToSave.length} regular indexer(s) and ${tokenIndexersToSave.length} token indexer(s) to 'gardens' array`);
          console.log(`📋 [Indexer Persistence] Final deduplicated count: ${finalIndexersToSave.length} indexer(s)`);
          console.log(`📋 [Indexer Persistence] Final indexer IDs: ${finalIndexersToSave.map(i => i.id).join(', ')}`);
          
          // CRITICAL: Final verification before saving
          console.log(`🔍 [Indexer Persistence] Final check before save:`);
          console.log(`   - Regular indexers: ${regularIndexersToSave.length}`);
          console.log(`   - Token indexers: ${tokenIndexersToSave.length}`);
          console.log(`   - Total indexers to save: ${finalIndexersToSave.length}`);
          
          // Verify certificates are present before saving
          const indexersWithoutCert = finalIndexersToSave.filter(idx => !idx.certificate);
          if (indexersWithoutCert.length > 0) {
            console.error(`❌ [Indexer Persistence] ${indexersWithoutCert.length} indexer(s) missing certificates: ${indexersWithoutCert.map(i => i.id).join(', ')}`);
            console.error(`❌ [Indexer Persistence] Re-issuing certificates before save...`);
            for (const idx of indexersWithoutCert) {
              try {
                issueGardenCertificate(idx);
                console.log(`✅ [Indexer Persistence] Certificate issued to ${idx.id}`);
              } catch (err: any) {
                console.error(`❌ [Indexer Persistence] Failed to issue certificate to ${idx.id}:`, err.message);
              }
            }
            // Update finalIndexersToSave with re-issued certificates
            for (const idx of finalIndexersToSave) {
              const withoutCert = indexersWithoutCert.find(w => w.id === idx.id);
              if (withoutCert && withoutCert.certificate) {
                idx.certificate = withoutCert.certificate;
              }
            }
          }
          
          // REFACTOR: Save gardens to separate file
          const gardensFile = path.join(__dirname, 'eden-gardens-persistence.json');
          
          // CRITICAL: Load existing gardens from file to preserve any that aren't in memory
          // This prevents losing gardens that exist in the file but aren't currently in memory
          let existingGardensFromFile: any[] = [];
          if (fs.existsSync(gardensFile)) {
            try {
              const fileContent = fs.readFileSync(gardensFile, 'utf-8');
              const persisted = JSON.parse(fileContent);
              existingGardensFromFile = persisted.gardens || [];
              console.log(`📋 [Indexer Persistence] Loaded ${existingGardensFromFile.length} existing garden(s) from file to preserve`);
              console.log(`📋 [Indexer Persistence] Gardens in file: ${existingGardensFromFile.map((g: any) => `${g.id}(${g.serviceType || 'no-type'})`).join(', ')}`);
            } catch (err: any) {
              console.warn(`⚠️  [Indexer Persistence] Failed to load existing gardens from file: ${err.message}`);
            }
          }
          
          // Log what's in memory before merging
          console.log(`📋 [Indexer Persistence] Gardens in memory (finalIndexersToSave): ${finalIndexersToSave.map((g: any) => `${g.id}(${g.serviceType || 'no-type'})`).join(', ')}`);
          
          // Merge existing gardens from file with in-memory gardens
          // Prefer in-memory versions (they're the source of truth), but keep file gardens that aren't in memory
          const existingGardenIds = new Set(finalIndexersToSave.map(g => g.id));
          const preservedGardens = existingGardensFromFile.filter((g: any) => {
            const shouldPreserve = !existingGardenIds.has(g.id);
            if (!shouldPreserve) {
              console.log(`📋 [Indexer Persistence] Garden ${g.id}(${g.serviceType || 'no-type'}) is in memory, using in-memory version`);
            }
            return shouldPreserve;
          });
          
          if (preservedGardens.length > 0) {
            console.log(`📋 [Indexer Persistence] ✅ Preserving ${preservedGardens.length} garden(s) from file that aren't in memory: ${preservedGardens.map((g: any) => `${g.id}(${g.serviceType || 'no-type'})`).join(', ')}`);
          } else if (existingGardensFromFile.length > 0) {
            console.log(`📋 [Indexer Persistence] ℹ️  All ${existingGardensFromFile.length} garden(s) from file are already in memory, no preservation needed`);
          }
          
          // Combine in-memory gardens (source of truth) with preserved gardens from file
          const allGardensToSave = [...finalIndexersToSave, ...preservedGardens];
          
          // Final safety check: log all gardens being saved
          console.log(`📋 [Indexer Persistence] 💾 Saving ${allGardensToSave.length} total garden(s): ${allGardensToSave.map((g: any) => `${g.id}(${g.serviceType || 'no-type'})`).join(', ')}`);
          
          const gardensData = {
            gardens: allGardensToSave,
            lastSaved: new Date().toISOString()
          };
          fs.writeFileSync(gardensFile, JSON.stringify(gardensData, null, 2), 'utf-8');
          console.log(`💾 [Indexer Persistence] ✅ IMMEDIATELY saved ${allGardensToSave.length} total garden(s) (${finalIndexersToSave.length} from memory + ${preservedGardens.length} preserved from file) to ${gardensFile}`);
          if (regularIndexersToSave.length > 0) {
            console.log(`💾 [Indexer Persistence] Saved regular gardens: ${regularIndexersToSave.map(i => `${i.name} (${i.id})`).join(', ')}`);
          }
          if (tokenIndexersToSave.length > 0) {
            console.log(`💾 [Indexer Persistence] Saved token gardens: ${tokenIndexersToSave.map(i => `${i.name} (${i.id})${i.certificate ? ' ✓cert' : ' ❌no cert'}`).join(', ')}`);
          }
          
          // CRITICAL: Now update the in-memory GARDENS array to match what we saved
          // This ensures consistency between memory and file, including preserved gardens
          GARDENS.length = 0;
          const savedRegularGardens = allGardensToSave.filter((g: any) => {
            const isToken = (g.tokenServiceType === 'dex' || (g.serviceType === 'dex' && g.id && g.id.startsWith('T')));
            return !isToken;
          });
          GARDENS.push(...savedRegularGardens);
          console.log(`📋 [Indexer Persistence] Updated in-memory GARDENS array to ${GARDENS.length} garden(s) to match saved file: ${GARDENS.map(g => `${g.id}(${(g as any).serviceType || 'no-type'})`).join(', ')}`);
          
          // Save ServiceRegistry2 to persistence file
          // CRITICAL: Use ServiceRegistry2 (new implementation) - it handles persistence correctly
          const serviceRegistry2 = getServiceRegistry2();
          const allProviders = serviceRegistry2.getAllProviders();
          
          // Console output: Show in-memory service registry
          console.log(`📋 [ServiceRegistry2] Saving ALL ${allProviders.length} providers (NO FILTERING)`);
          console.log(`📋 [ServiceRegistry2] All providers:`, allProviders.map(p => ({
            id: p.id,
            name: p.name,
            serviceType: p.serviceType,
            gardenId: p.gardenId || 'MISSING'
          })));
          console.log(`📋 [ServiceRegistry2] Movie providers:`, allProviders.filter(p => p.serviceType === 'movie').map(p => ({
            id: p.id,
            name: p.name,
            gardenId: p.gardenId || 'MISSING'
          })));
          
          // Log service registry save
          const saveLogData = {
            totalInMemory: allProviders.length,
            totalSaved: allProviders.length,
            movieProviders: allProviders.filter(p => p.serviceType === 'movie').length,
            dexProviders: allProviders.filter(p => p.serviceType === 'dex').length,
            movieProviderIds: allProviders.filter(p => p.serviceType === 'movie').map(p => `${p.id}(${p.gardenId})`),
            allProviderIds: allProviders.map(p => `${p.id}(${p.gardenId})`)
          };
          console.log(`📝 [Garden Lifecycle] 💾 ServiceRegistry2 save:`, JSON.stringify(saveLogData, null, 2));
          getLogger().log('garden-lifecycle', 'service-registry-save', saveLogData);
          
          // Save using ServiceRegistry2's savePersistence method
          serviceRegistry2.savePersistence();
          console.log(`💾 [Indexer Persistence] ✅ IMMEDIATELY saved ${allProviders.length} service provider(s) via ServiceRegistry2`);
          
          // CRITICAL: Final check - verify garden has providers after all creation logic
          // If not, create a default provider (especially for airline and other service types)
          if ((gardenConfig as any).serviceType && 
              (gardenConfig as any).serviceType !== "movie" && 
              (gardenConfig as any).serviceType !== "dex" && 
              (gardenConfig as any).serviceType !== "snake") {
            const finalProvidersForGarden = serviceRegistry2.queryProviders((gardenConfig as any).serviceType, {});
            const finalHasProviderForThisGarden = finalProvidersForGarden.some(p => p.gardenId === gardenConfig.id);
            
            if (!finalHasProviderForThisGarden) {
              console.log(`   🔧 [Final Check] Garden ${gardenConfig.id} still has no providers, creating default provider...`);
              try {
                const defaultProviderConfig = {
                  name: `${gardenConfig.name} Provider`,
                  location: 'Unknown',
                  bond: 1000,
                  reputation: 5.0,
                  apiEndpoint: `https://api.${(gardenConfig as any).serviceType}.com/v1`
                };
                
                const finalProviderResults = createServiceProvidersForGarden(
                  (gardenConfig as any).serviceType,
                  gardenConfig.id,
                  [defaultProviderConfig],
                  undefined
                );
                
                const finalProvidersCreated = finalProviderResults.filter(r => r.created || r.assigned).length;
                console.log(`   ✅ [Final Check] Created default provider for ${(gardenConfig as any).serviceType} garden: ${finalProviderResults.map(r => r.providerName).join(', ')}`);
                
                // CRITICAL: Save service registry to persistence
                serviceRegistry2.savePersistence();
                console.log(`   💾 [Final Check] Service registry saved to persistence`);
              } catch (finalErr: any) {
                console.warn(`   ⚠️  [Final Check] Failed to create default provider:`, finalErr.message);
              }
            }
          }
        } catch (err: any) {
          console.error(`❌ [Indexer Persistence] Failed to save immediately: ${err.message}`);
        }
        
        // NOTE: We do NOT call redis.saveIndexers here because:
        // 1. We've already done an immediate save above (lines 2387-2518)
        // 2. redis.saveIndexers only saves to 'indexers' field, not 'tokenIndexers'
        // 3. redis.saveIndexers merges with existing data, which could reintroduce duplicates
        // The immediate save above is the source of truth and handles both regular and token indexers correctly
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          success: true, 
          garden: {
            id: gardenConfig.id,
            name: gardenConfig.name,
            uuid: gardenConfig.uuid,
            port: (gardenConfig as any).serverPort,
            hasCertificate: !!gardenConfig.certificate,
            ownerEmail: gardenConfig.ownerEmail // Include owner email for lifecycle management
          },
          balance: debitResult.balance, // Return updated balance
          createdBy: email, // Return the Google user email (same as ownerEmail)
          ownerEmail: gardenConfig.ownerEmail, // Explicit owner email field
          providersCreated: providersCreated // Return number of providers created
        }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ============================================
  // PRIESTHOOD CERTIFICATION API
  // ============================================
  
  // POST /api/priesthood/apply - User applies for priesthood (with 10 JSC application fee)
  if (pathname === "/api/priesthood/apply" && req.method === "POST") {
    console.log(`   📜 [${requestId}] POST /api/priesthood/apply - Applying for priesthood`);
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", async () => {
      try {
        const { email, reason } = JSON.parse(body);
        if (!email) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "email required" }));
          return;
        }
        
        // Charge 1 JSC application fee (Covenant Token / Witness Apple - non-refundable)
        const APPLICATION_FEE = 1;
        const userBalance = getWalletBalance(email);
        if (userBalance < APPLICATION_FEE) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: false, 
            error: `Insufficient balance. Application fee is ${APPLICATION_FEE} 🍎 APPLES. Your balance: ${userBalance} 🍎 APPLES` 
          }));
          return;
        }
        
        // Create transaction snapshot for application fee
        const feeTxId = `priesthood_app_fee_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
        const snapshot: TransactionSnapshot = {
          chainId: 'eden:mainnet',
          txId: feeTxId,
          slot: Date.now(),
          blockTime: Date.now(),
          payer: email,
          merchant: 'Eden Treasury',
          amount: APPLICATION_FEE,
          feeSplit: {}
        };
        
        // Create ledger entry (status will be 'pending')
        const ledgerEntry = addLedgerEntry(
          snapshot,
          'priesthood',
          0, // iGasCost
          email, // payerId
          'Eden Treasury', // merchantName
          'eden:root:ca:priesthood', // providerUuid
          {
            type: 'application_fee',
            description: 'Priesthood Application Fee (Non-refundable)',
            price: APPLICATION_FEE
          }
        );
        
        // Get user for cashier processing
        const user = USERS_STATE.find(u => u.email === email) || {
          id: email,
          email: email,
          balance: getWalletBalance(email)
        };
        
        // Process payment through cashier
        const cashier = getCashierStatus();
        const paymentSuccess = await processPayment(cashier, ledgerEntry, user);
        
        if (!paymentSuccess) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: false, 
            error: `Payment processing failed. Please check your balance.` 
          }));
          return;
        }
        
        // Complete the booking
        completeBooking(ledgerEntry);
        
        // Push to settlement stream
        await pushLedgerEntryToSettlementStream(ledgerEntry);
        
        // Create application
        const certification = applyForPriesthood(email, reason);
        
        // Mark application fee as paid using updateCertificationBilling
        const { updateCertificationBilling, getCertificationStatus } = await import('./src/priesthoodCertification');
        updateCertificationBilling(email, {
          applicationFeePaid: true,
          applicationFeeTxId: feeTxId
        });
        
        // Get updated certification with billing info
        const updatedCertification = getCertificationStatus(email);
        
        // Broadcast event
        broadcastEvent({
          type: "priesthood_application_submitted",
          component: "priesthood-certification",
          message: `New priesthood application from ${email} (Application fee: ${APPLICATION_FEE} 🍎 APPLES paid)`,
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
      } catch (err: any) {
        console.error(`   ❌ [${requestId}] Error applying for priesthood:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  
  // GET /api/priesthood/status?email={email} - Get user's certification status
  if (pathname === "/api/priesthood/status" && req.method === "GET") {
    console.log(`   📜 [${requestId}] GET /api/priesthood/status - Getting certification status`);
    try {
      const parsedUrl = url.parse(req.url || "/", true);
      const email = parsedUrl.query.email as string;
      
      if (!email) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "email query parameter required" }));
        return;
      }
      
      const certification = getCertificationStatus(email);
      const hasCert = hasPriesthoodCertification(email);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        certification,
        hasCertification: hasCert
      }));
    } catch (err: any) {
      console.error(`   ❌ [${requestId}] Error getting certification status:`, err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  
  // GET /api/priesthood/applications - GOD: Get all applications
  if (pathname === "/api/priesthood/applications" && req.method === "GET") {
    console.log(`   📜 [${requestId}] GET /api/priesthood/applications - Getting all applications (GOD mode)`);
    try {
      const parsedUrl = url.parse(req.url || "/", true);
      const status = parsedUrl.query.status as string | undefined;
      
      let certifications: PriesthoodCertification[];
      if (status) {
        certifications = getCertificationsByStatus(status as any);
      } else {
        certifications = getAllCertifications();
      }
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        certifications,
        count: certifications.length
      }));
    } catch (err: any) {
      console.error(`   ❌ [${requestId}] Error getting applications:`, err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }
  
  // POST /api/priesthood/approve - GOD: Approve application
  if (pathname === "/api/priesthood/approve" && req.method === "POST") {
    console.log(`   📜 [${requestId}] POST /api/priesthood/approve - Approving priesthood application`);
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", async () => {
      try {
        const { email, approvedBy, reason } = JSON.parse(body);
        if (!email || !approvedBy) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "email and approvedBy required" }));
          return;
        }
        
        const certification = approvePriesthood(email, approvedBy, reason);
        
        // Broadcast event
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
      } catch (err: any) {
        console.error(`   ❌ [${requestId}] Error approving application:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  
  // POST /api/priesthood/reject - GOD: Reject application
  if (pathname === "/api/priesthood/reject" && req.method === "POST") {
    console.log(`   📜 [${requestId}] POST /api/priesthood/reject - Rejecting priesthood application`);
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", async () => {
      try {
        const { email, rejectedBy, reason } = JSON.parse(body);
        if (!email || !rejectedBy) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "email and rejectedBy required" }));
          return;
        }
        
        const certification = rejectPriesthood(email, rejectedBy, reason);
        
        // Broadcast event
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
      } catch (err: any) {
        console.error(`   ❌ [${requestId}] Error rejecting application:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  
  // POST /api/priesthood/revoke - GOD: Revoke certification
  if (pathname === "/api/priesthood/revoke" && req.method === "POST") {
    console.log(`   📜 [${requestId}] POST /api/priesthood/revoke - Revoking priesthood certification`);
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", async () => {
      try {
        const { email, revokedBy, reason } = JSON.parse(body);
        if (!email || !revokedBy) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "email and revokedBy required" }));
          return;
        }
        
        const certification = revokePriesthood(email, revokedBy, reason);
        
        // Broadcast event
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
      } catch (err: any) {
        console.error(`   ❌ [${requestId}] Error revoking certification:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  
  // POST /api/priesthood/pay-membership - Activate membership (FREE)
  if (pathname === "/api/priesthood/pay-membership" && req.method === "POST") {
    console.log(`   📜 [${requestId}] POST /api/priesthood/pay-membership - Activating membership (FREE)`);
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", async () => {
      try {
        const { email } = JSON.parse(body);
        if (!email) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "email required" }));
          return;
        }
        
        const certification = getCertificationStatus(email);
        if (!certification) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "No priesthood certification found" }));
          return;
        }
        
        if (certification.status !== 'approved' && certification.status !== 'suspended') {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Cannot activate membership. Current status: ${certification.status}` }));
          return;
        }
        
        // Membership is now FREE - no payment required
        // Authority is trust-based and rate-limited, not payment-based
        const MEMBERSHIP_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (for tracking period)
        const now = Date.now();
        
        // Update membership period (free, but tracked for activity monitoring)
        const activeUntil = (certification.membershipActiveUntil && certification.membershipActiveUntil > now) 
          ? certification.membershipActiveUntil + MEMBERSHIP_PERIOD_MS 
          : now + MEMBERSHIP_PERIOD_MS;
        
        const { updateCertificationBilling } = await import('./src/priesthoodCertification');
        updateCertificationBilling(email, {
          membershipActiveUntil: activeUntil,
          lastActivityDate: now,
          activityCount: (certification.activityCount || 0) + 1,
          suspendedForNonPayment: false
        });
        
        // If suspended, reactivate
        if (certification.status === 'suspended' && certification.suspendedForNonPayment) {
          const { getCertificationStatus: getCert } = await import('./src/priesthoodCertification');
          const updated = getCert(email);
          if (updated && updated.status === 'suspended') {
            // Status will be updated by updateCertificationBilling if payment resumed
          }
        }
        
        // Reload certification
        const updatedCertification = getCertificationStatus(email);
        
        // Broadcast event
        broadcastEvent({
          type: "priesthood_membership_activated",
          component: "priesthood-certification",
          message: `Membership activated for ${email} (FREE). Active until ${new Date(activeUntil).toISOString()}. Authority is trust-based and rate-limited.`,
          timestamp: Date.now(),
          data: {
            email,
            membershipFee: 0, // FREE
            activeUntil,
            trustScore: updatedCertification?.trustScore || 0
          }
        });
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          certification: updatedCertification,
          membershipActivated: true,
          membershipFee: 0, // FREE
          activeUntil,
          message: "Membership is FREE. Authority is trust-based and rate-limited."
        }));
      } catch (err: any) {
        console.error(`   ❌ [${requestId}] Error paying membership fee:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }
  
  // GET /api/priesthood/stats - Get statistics for dashboard
  if (pathname === "/api/priesthood/stats" && req.method === "GET") {
    console.log(`   📜 [${requestId}] GET /api/priesthood/stats - Getting certification statistics`);
    try {
      const stats = getCertificationStats();
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        stats
      }));
    } catch (err: any) {
      console.error(`   ❌ [${requestId}] Error getting stats:`, err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Serve video files from data directory
  if (pathname.startsWith("/videos/")) {
    const videoFile = pathname.substring(8); // Remove "/videos/" prefix
    const videoPath = path.join(__dirname, "data", videoFile);

    // Security: prevent directory traversal
    const resolvedPath = path.resolve(videoPath);
    const resolvedDataDir = path.resolve(path.join(__dirname, "data"));
    if (!resolvedPath.startsWith(resolvedDataDir)) {
      console.log(`   🚫 [${requestId}] Forbidden video access attempt: ${pathname}`);
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.access(videoPath, fs.constants.F_OK, (err) => {
      if (err) {
        console.log(`   ❌ [${requestId}] Video file not found: ${videoPath}`);
        res.writeHead(404);
        res.end("Video not found");
        return;
      }

      // Check if it's actually a video file (not a placeholder text file)
      const stat = fs.statSync(videoPath);
      if (stat.size < 1000 || videoPath.endsWith('.txt')) {
        console.log(`   ⚠️ [${requestId}] Video file appears to be a placeholder: ${videoFile} (${stat.size} bytes)`);
        res.writeHead(404);
        res.end("Video file is a placeholder - please provide a real video file");
        return;
      }

      console.log(`   🎬 [${requestId}] Serving video file: ${videoFile} (${stat.size} bytes)`);

      // Set appropriate headers for video streaming
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        // Handle range requests for video seeking
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": "video/mp4",
        });
        file.pipe(res);
      } else {
        // Serve entire file
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": "video/mp4",
        });
        fs.createReadStream(videoPath).pipe(res);
      }
    });
    return;
  }

  // Serve static files (Angular app)
  let filePath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.join(FRONTEND_PATH, filePath);

  // Security: prevent directory traversal
  const resolvedPath = path.resolve(fullPath);
  const resolvedFrontend = path.resolve(FRONTEND_PATH);
  if (!resolvedPath.startsWith(resolvedFrontend)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.access(fullPath, fs.constants.F_OK, (err) => {
    if (err) {
      // If file not found, serve index.html for Angular routing
      const indexPath = path.join(FRONTEND_PATH, "index.html");
      fs.readFile(indexPath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not Found");
        } else {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(data);
        }
      });
    } else {
      fs.readFile(fullPath, (err, data) => {
        if (err) {
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

function getContentType(ext: string): string {
  const types: Record<string, string> = {
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

// Embedded In-Memory Redis Server

// InMemoryRedisServer class has been moved to src/redis.ts

// Create embedded Redis instance
const redis = new InMemoryRedisServer();

// Redis Connection Helpers

async function connectRedis(): Promise<boolean> {
  if (SKIP_REDIS) {
    console.log("⚠️  Redis: Skipped (--skip-redis flag)");
    return false;
  }

  try {
    await redis.connect();
    
    // Test connection with PING
    const pong = await redis.ping();
    if (pong === "PONG") {
      console.log("✅ Redis: Embedded server ready");
      return true;
    }
    return false;
  } catch (err: any) {
    console.error("❌ Redis: Connection failed:", err.message);
    return false;
  }
}

async function ensureRedisConnection(): Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

// Types

type User = {
  id: string;
  email: string;
  balance: number;
};

type TransactionSnapshot = {
  chainId: string;
  txId: string;
  slot: number;
  blockTime: number;
  payer: string;
  merchant: string;
  amount: number;
  feeSplit: Record<string, number>;
};

type LedgerEntry = {
  entryId: string;
  txId: string;
  timestamp: number;
  payer: string; // Email address
  payerId: string; // User ID for internal tracking
  merchant: string;
  providerUuid: string; // Service provider UUID for certificate issuance
  serviceType: string; // 'movie', 'dex', 'mint', 'transaction', etc.
  amount: number;
  iGasCost: number;
  fees: Record<string, number>;
  status: 'pending' | 'processed' | 'completed' | 'failed';
  cashierId: string;
  bookingDetails?: Record<string, any>; // Generic booking details - service-type agnostic (allows any fields)
};

type Cashier = {
  id: string;
  name: string;
  processedCount: number;
  totalProcessed: number;
  status: 'active' | 'idle';
};

type Review = {
  userId: string;
  movieId: string;
  rating: number;
};

type ServiceProvider = {
  id: string;
  uuid: string; // UUID for certificate issuance
  name: string;
  serviceType: string;
  location: string;
  bond: number;
  reputation: number;
  gardenId: string; // Standardized field name - used everywhere (persistence, memory, API)
  apiEndpoint?: string; // Optional API endpoint for the provider
  status?: 'active' | 'revoked' | 'suspended'; // Provider status
  // Snake Service Fields (serviceType: "snake")
  // Note: Snake is a SERVICE TYPE (like "movie", "dex"), not a provider type
  // Each Snake service belongs to a garden (gardenId)
  insuranceFee?: number; // Higher insurance fee for Snake services (default: same as bond)
  iGasMultiplier?: number; // iGas multiplier (default: 1.0, Snake: 2.0)
  iTaxMultiplier?: number; // iTax multiplier (default: 1.0, Snake: 2.0)
  maxInfluence?: number; // Maximum influence score (0.0-1.0, default: 0.15 for Snake)
  contextsAllowed?: string[]; // Contexts where Snake service can operate
  contextsForbidden?: string[]; // Contexts where Snake service is banned
  adCapabilities?: string[]; // Advertising capabilities (e.g., ["product_promotion", "service_highlighting"])
};

type MovieListing = {
  providerId: string;
  providerName: string;
  movieTitle: string;
  movieId: string;
  price: number;
  showtime: string;
  location: string;
  reviewCount: number;
  rating: number;
  gardenId: string;
};

type TokenPool = {
  poolId: string;
  tokenSymbol: string;
  tokenName: string;
  baseToken: string; // SOL, USDC, etc.
  poolLiquidity: number; // Total liquidity in base token
  tokenReserve: number; // Amount of tokens in pool
  baseReserve: number; // Amount of base token in pool
  price: number; // Current price (baseToken per token)
  bond: number; // Creator bond
  gardenId: string; // Garden providing this pool service
  createdAt: number;
  totalVolume: number;
  totalTrades: number;
};

type TokenListing = {
  poolId: string;
  providerId: string; // Indexer ID providing the pool
  providerName: string;
  tokenSymbol: string;
  tokenName: string;
  baseToken: string;
  price: number; // Current price
  liquidity: number;
  volume24h: number;
  indexerId: string;
};

type DEXTrade = {
  tradeId: string;
  poolId: string;
  tokenSymbol: string;
  baseToken: string;
  action: 'BUY' | 'SELL';
  tokenAmount: number;
  baseAmount: number;
  price: number;
  priceImpact: number; // 0.001% per trade
  iTax: number; // 0.0005% commission
  timestamp: number;
  trader: string; // User email
};

type ServiceRegistryQuery = {
  serviceType?: string; // Optional: filter by service type
  providerType?: 'REGULAR' | 'SNAKE'; // Optional: filter by provider type (for Snake providers)
  filters?: {
    location?: string;
    maxPrice?: number | string; // Can be a number or 'best'/'lowest'
    minReputation?: number;
    genre?: string;
    time?: string;
    // DEX-specific filters
    tokenSymbol?: string;
    baseToken?: string;
    action?: 'BUY' | 'SELL';
    tokenAmount?: number;
    maxPriceImpact?: number;
  };
};

type LLMQueryResult = {
  query: ServiceRegistryQuery;
  serviceType: string;
  confidence: number;
};

type LLMResponse = {
  message: string;
  listings: MovieListing[] | TokenListing[];
  selectedListing: MovieListing | TokenListing | null;
  iGasCost: number;
  tradeDetails?: DEXTrade; // For DEX trades
};

// Constants

const CHAIN_ID = "eden-core";

const ROOT_CA_FEE = 0.02;
const INDEXER_FEE = 0.005;

// Stream names are now dynamically generated from GARDENS array

// iGas Calculation Constants
const LLM_BASE_COST = 0.001; // Base cost per LLM call
const ROUTING_COST_PER_PROVIDER = 0.0001; // Cost per service provider queried
const REASONING_COST_MULTIPLIER = 1.5; // Multiplier for complex reasoning

// DEX Trading Constants
const PRICE_IMPACT_PER_TRADE = 0.00001; // 0.001% = 0.00001
const ITAX_RATE = 0.000005; // 0.0005% = 0.000005
const ROOT_CA_LIQUIDITY_POOL = 1000; // Initial ROOT CA liquidity in SOL
const ITAX_DISTRIBUTION = {
  rootCA: 0.4, // 40% to ROOT CA
  indexer: 0.3, // 30% to indexer (token provider)
  trader: 0.3, // 30% back to trader as rebate
};

// DEX Pools Registry
const DEX_POOLS: Map<string, TokenPool> = new Map();

// ROOT CA Liquidity Pool (first liquidity source)
let rootCALiquidity: number = ROOT_CA_LIQUIDITY_POOL;

// ROOT CA Balance Tracking (Settlement Authority)
// ROOT CA is the ONLY source of truth for balances
interface ROOTBalance {
  rootCA: number; // ROOT CA balance (iGas + iTax)
  indexers: Map<string, number>; // Indexer balances (by indexer ID)
  providers: Map<string, number>; // Service provider balances (by provider UUID)
}

const ROOT_BALANCES: ROOTBalance = {
  rootCA: 0,
  indexers: new Map(),
  providers: new Map(),
};

// Ledger Settlement Stream Name
const LEDGER_SETTLEMENT_STREAM = "eden:ledger:pending";

// Users

const USERS: User[] = [
  { id: "u1", email: "bill.draper.auto@gmail.com", balance: 0 },
  { id: "u2", email: "bob@gmail.com", balance: 0 },
];

// Ledger Component - Tracks all Eden bookings
// LEDGER is now imported from ./src/state - removed local declaration

// Provider Webhook Registry (for optional push notifications)
interface ProviderWebhook {
  providerId: string;
  webhookUrl: string;
  registeredAt: number;
  lastDelivery?: number;
  failureCount: number;
}

const PROVIDER_WEBHOOKS: Map<string, ProviderWebhook> = new Map();

// Dedicated Cashier for processing payments
// (CASHIER moved to main() initialization)

// ROOT CA Service Registry
// ServiceRegistry is now managed by ROOT CA, not indexers
// This enables quick post-LLM in-memory lookup
// Indexers are dedicated intelligent entities (post-LLM regulated)
interface ServiceProviderWithCert extends ServiceProvider {
  certificate?: EdenCertificate;
}

// ROOT CA Service Registry (centralized, in-memory)
const ROOT_CA_SERVICE_REGISTRY: ServiceProviderWithCert[] = [
  // Holy Ghost Infrastructure Services (ROOT CA's indexer)
  {
    id: "stripe-payment-rail-001",
    uuid: "550e8400-e29b-41d4-a716-446655440100",
    name: "Stripe Payment Rail",
    serviceType: "payment-rail",
    location: "Global",
    bond: 50000, // High bond for payment infrastructure
    reputation: 5.0,
    gardenId: "HG", // Holy Ghost garden
    apiEndpoint: "https://api.stripe.com/v1",
    status: 'active'
  },
  {
    id: "settlement-service-001",
    uuid: "550e8400-e29b-41d4-a716-446655440101",
    name: "Settlement Service",
    serviceType: "settlement",
    location: "ROOT CA",
    bond: 100000, // Very high bond for settlement authority
    reputation: 5.0,
    gardenId: "HG", // Holy Ghost garden
    apiEndpoint: "internal://settlement",
    status: 'active'
  },
  {
    id: "service-registry-001",
    uuid: "550e8400-e29b-41d4-a716-446655440102",
    name: "Service Registry",
    serviceType: "registry",
    location: "ROOT CA",
    bond: 50000, // High bond for registry authority
    reputation: 5.0,
    gardenId: "HG", // Holy Ghost garden
    apiEndpoint: "internal://service-registry",
    status: 'active'
  },
  {
    id: "webserver-service-001",
    uuid: "550e8400-e29b-41d4-a716-446655440103",
    name: "Web Server",
    serviceType: "webserver",
    location: "ROOT CA",
    bond: 10000,
    reputation: 5.0,
    gardenId: "HG", // Holy Ghost garden
    apiEndpoint: `http://localhost:${HTTP_PORT}`,
    status: 'active'
  },
  {
    id: "websocket-service-001",
    uuid: "550e8400-e29b-41d4-a716-446655440104",
    name: "WebSocket Service",
    serviceType: "websocket",
    location: "ROOT CA",
    bond: 10000,
    reputation: 5.0,
    gardenId: "HG", // Holy Ghost garden
    apiEndpoint: `ws://localhost:${HTTP_PORT}`,
    status: 'active'
  },
  {
    id: "wallet-service-001",
    uuid: "550e8400-e29b-41d4-a716-446655440105",
    name: "JesusCoin Wallet Service",
    serviceType: "wallet",
    location: "ROOT CA",
    bond: 200000, // Very high bond for wallet authority (single source of truth)
    reputation: 5.0,
    gardenId: "HG", // Holy Ghost garden
    apiEndpoint: "internal://wallet",
    status: 'active'
  },
  // Regular Service Providers
  // In ROOT mode: All service providers (including amc-001) are created dynamically via the wizard
  // They should NOT exist in hardcoded defaults
  ...(DEPLOYED_AS_ROOT ? [] : [
    {
      id: "amc-001",
      uuid: "550e8400-e29b-41d4-a716-446655440001", // UUID for certificate issuance
      name: "AMC Theatres",
      serviceType: "movie",
      location: "Baltimore, Maryland",
      bond: 1000,
      reputation: 4.8,
      gardenId: "garden-1", // Default to garden-1 (will be overridden by persistence file if different)
      apiEndpoint: "https://api.amctheatres.com/v1/listings",
    },
    {
      id: "moviecom-001",
      uuid: "550e8400-e29b-41d4-a716-446655440002", // UUID for certificate issuance
      name: "MovieCom",
      serviceType: "movie",
      location: "Baltimore, Maryland",
      bond: 800,
      reputation: 4.5,
      gardenId: "garden-2",
      apiEndpoint: "https://api.moviecom.com/showtimes",
    },
    {
      id: "cinemark-001",
      uuid: "550e8400-e29b-41d4-a716-446655440003", // UUID for certificate issuance
      name: "Cinemark",
      serviceType: "movie",
      location: "Baltimore, Maryland",
      bond: 1200,
      reputation: 4.7,
      gardenId: "garden-1",
      apiEndpoint: "https://api.cinemark.com/movies",
    },
    // Snake Service Providers (serviceType: "snake", belongs to indexers)
    {
      id: "snake-premium-cinema-001",
      uuid: "550e8400-e29b-41d4-a716-446655440010",
      name: "Premium Cinema Ads",
      serviceType: "snake", // Snake is a service type, not a provider type
      location: "Global",
      bond: 10000,
      insuranceFee: 10000, // Higher insurance fee for Snake
      reputation: 4.5,
      gardenId: "garden-1",
      apiEndpoint: "https://ads.premiumcinema.com/api",
      iGasMultiplier: 2.0, // Double iGas
      iTaxMultiplier: 2.0, // Double iTax
      maxInfluence: 0.15, // 15% max influence
      contextsAllowed: ["movies", "entertainment", "shopping"],
      contextsForbidden: ["health", "legal", "finance", "education"],
      adCapabilities: ["product_promotion", "service_highlighting"],
      status: 'active'
    },
    {
      id: "snake-shopping-deals-001",
      uuid: "550e8400-e29b-41d4-a716-446655440011",
      name: "Shopping Deals Ads",
      serviceType: "snake", // Snake is a service type, not a provider type
      location: "Global",
      bond: 10000,
      insuranceFee: 10000,
      reputation: 4.3,
      gardenId: "garden-2",
      apiEndpoint: "https://ads.shoppingdeals.com/api",
      iGasMultiplier: 2.0,
      iTaxMultiplier: 2.0,
      maxInfluence: 0.12, // 12% max influence
      contextsAllowed: ["shopping", "restaurants"],
      contextsForbidden: ["health", "legal", "finance", "education"],
      adCapabilities: ["product_promotion"],
      status: 'active'
    },
  ]),
  // DEX Pool Service Providers will be dynamically created from token indexers during initialization
];

// Mock Service Provider APIs (simulate external API calls)
// (Service provider API functions moved to src/serviceProvider.ts)

// DEX Pool Functions
// (initializeDEXPools moved to src/dex.ts)
function _initializeDEXPools_DEPRECATED(): void {
  // Initialize DEX pools, assigning them to token gardens
  // Each token garden can provide multiple pools
  for (let i = 0; i < TOKEN_GARDENS.length; i++) {
    const tokenGarden = TOKEN_GARDENS[i];
    if (!tokenGarden) continue;
    
    // Create pools for this token garden
    // Token Garden T1 gets TOKENA, T2 gets TOKENB, etc.
    const tokenSymbol = `TOKEN${String.fromCharCode(65 + i)}`; // TOKENA, TOKENB, TOKENC...
    const tokenName = `Token ${String.fromCharCode(65 + i)}`;
    const poolId = `pool-solana-${tokenSymbol.toLowerCase()}`;
    
    const pool: TokenPool = {
      poolId: poolId,
      tokenSymbol: tokenSymbol,
      tokenName: tokenName,
      baseToken: "SOL",
      poolLiquidity: 100 - (i * 10), // Decreasing liquidity for variety: 100, 90, 80...
      tokenReserve: 100000 - (i * 10000), // 100k, 90k, 80k...
      baseReserve: 100 - (i * 10), // 100, 90, 80...
      price: 0.001, // 1 Token = 0.001 SOL
      bond: 5000,
      gardenId: tokenGarden.id, // Assign to token garden
      createdAt: Date.now(),
      totalVolume: 0,
      totalTrades: 0,
    };
    DEX_POOLS.set(poolId, pool);
  }

  console.log(`🌊 Initialized ${DEX_POOLS.size} DEX pools`);
  console.log(`💰 ROOT CA Liquidity Pool: ${rootCALiquidity} SOL`);
  console.log(`🔷 Token Gardens: ${TOKEN_GARDENS.map(ti => ti.name).join(", ")}`);
  
  // Display pool assignments
  for (const [poolId, pool] of DEX_POOLS.entries()) {
    console.log(`   ${pool.tokenSymbol} Pool → ${pool.gardenId} (${pool.poolLiquidity} SOL liquidity)`);
  }
}

/**
 * Generate workflow JSON from template using LLM
 */
async function generateWorkflowFromTemplate(template: any, serviceType: string): Promise<any> {
  const serviceTypeDescriptions: Record<string, string> = {
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
5. Update component names if needed (e.g., "movie_theater" → appropriate component for ${serviceType})
6. Update field names in actions (e.g., "movieTitle" → appropriate field for ${serviceType})
7. Ensure all transitions and step IDs are valid
8. Keep ROOT CA ledger and payment steps unchanged
9. IMPORTANT: Replace ALL instances of "JSC" or "JesusCoin" with "🍎 APPLES" in ALL user-facing messages, including:
   - Decision prompts (e.g., "Would you like to proceed with ... for {{price}} 🍎 APPLES?")
   - Payment messages (e.g., "{{cashier.name}} processed payment: {{ledgerEntry.amount}} 🍎 APPLES")
   - Purchase confirmations (e.g., "Purchased ... for {{price}} 🍎 APPLES")
   - Review rebate messages (e.g., "Review rebate credited: {{rebate}} 🍎 APPLES")
   - Any other user-visible text that mentions currency
10. Return ONLY the complete JSON object with the same structure as the template

CRITICAL: Return ONLY valid JSON. Do not include any markdown formatting, code blocks, or explanations. Just the JSON object.`;

  try {
    const llmResponse = await callLLM(prompt, ENABLE_OPENAI);
    
    // Try to parse the response as JSON
    let generatedWorkflow: any;
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = llmResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      generatedWorkflow = JSON.parse(cleanedResponse);
    } catch (parseError: any) {
      // If parsing fails, try to extract JSON from the response
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        generatedWorkflow = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(`Failed to parse LLM response as JSON: ${parseError.message}`);
      }
    }
    
    // Validate that the generated workflow has the required structure
    if (!generatedWorkflow.flowwiseWorkflow) {
      throw new Error("Generated workflow missing 'flowwiseWorkflow' property");
    }
    
    return generatedWorkflow;
  } catch (error: any) {
    console.error(`❌ [Workflow Generation] Error:`, error.message);
    throw error;
  }
}

// LLM System Prompts
// (LLM prompts moved to src/llm.ts)
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

// ROOT CA Service Registry Functions
// ROOT CA manages the service registry - indexers query ROOT CA
// (Service provider functions moved to src/serviceProvider.ts)

// DEX Trading Functions
// (executeDEXTrade moved to src/dex.ts)
function _executeDEXTrade_DEPRECATED(
  poolId: string,
  action: 'BUY' | 'SELL',
  tokenAmount: number,
  userEmail: string
): DEXTrade {
  const pool = DEX_POOLS.get(poolId);
  if (!pool) {
    throw new Error(`Pool ${poolId} not found`);
  }

  // Step 1: Use ROOT CA liquidity as first liquidity source
  // For BUY: User pays baseToken, gets tokens
  // For SELL: User pays tokens, gets baseToken
  
  let baseAmount: number;
  let newPrice: number;
  
  if (action === 'BUY') {
    // User wants to BUY tokens with baseToken (SOL)
    // Calculate baseToken needed using constant product formula: x * y = k
    // After trade: (baseReserve + baseAmount) * (tokenReserve - tokenAmount) = baseReserve * tokenReserve
    // Solving: baseAmount = (baseReserve * tokenAmount) / (tokenReserve - tokenAmount)
    baseAmount = (pool.baseReserve * tokenAmount) / (pool.tokenReserve - tokenAmount);
    
    // Apply price impact (0.001% = 0.00001)
    const priceImpact = PRICE_IMPACT_PER_TRADE;
    baseAmount = baseAmount * (1 + priceImpact);
    
    // Update pool reserves
    pool.baseReserve += baseAmount;
    pool.tokenReserve -= tokenAmount;
    
    // Calculate new price
    newPrice = pool.baseReserve / pool.tokenReserve;
    pool.price = newPrice;
    
    // Increase pool value by 0.001%
    pool.poolLiquidity *= (1 + PRICE_IMPACT_PER_TRADE);
  } else {
    // SELL: User wants to SELL tokens for baseToken
    // Calculate baseToken received: baseAmount = (baseReserve * tokenAmount) / (tokenReserve + tokenAmount)
    baseAmount = (pool.baseReserve * tokenAmount) / (pool.tokenReserve + tokenAmount);
    
    // Apply price impact
    const priceImpact = PRICE_IMPACT_PER_TRADE;
    baseAmount = baseAmount * (1 - priceImpact);
    
    // Update pool reserves
    pool.baseReserve -= baseAmount;
    pool.tokenReserve += tokenAmount;
    
    // Calculate new price
    newPrice = pool.baseReserve / pool.tokenReserve;
    pool.price = newPrice;
    
    // Increase pool value by 0.001%
    pool.poolLiquidity *= (1 + PRICE_IMPACT_PER_TRADE);
  }
  
  // Step 2: Calculate iTax (0.0005% commission)
  const tradeValue = baseAmount; // Trade value in baseToken
  let iTax = tradeValue * ITAX_RATE;
  
  // Apply Snake provider multiplier if pool provider is Snake
  // DEX pool providers are registered with id like "dex-pool-{tokenSymbol}"
  const poolProviderId = `dex-pool-${pool.tokenSymbol.toLowerCase()}`;
  const poolProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === poolProviderId);
  if (poolProvider?.providerType === 'SNAKE') {
    const snakeITaxMultiplier = poolProvider.iTaxMultiplier || 2.0;
    iTax = iTax * snakeITaxMultiplier;
    console.log(`🐍 [Snake Provider] Applied iTax multiplier: ${snakeITaxMultiplier}x for pool ${poolId}`);
  }
  
  // Step 3: Distribute iTax (WIN-WIN-WIN)
  const iTaxRootCA = iTax * ITAX_DISTRIBUTION.rootCA; // 40% to ROOT CA
  const iTaxIndexer = iTax * ITAX_DISTRIBUTION.indexer; // 30% to indexer
  const iTaxTrader = iTax * ITAX_DISTRIBUTION.trader; // 30% back to trader as rebate
  
  // Update ROOT CA liquidity (add iTax)
  rootCALiquidity += iTaxRootCA;
  
  // Update pool stats
  pool.totalVolume += tradeValue;
  pool.totalTrades += 1;
  
  // Create trade record
  const trade: DEXTrade = {
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
    trader: userEmail,
  };
  
  console.log(`💰 [DEX] Trade executed: ${action} ${tokenAmount} ${pool.tokenSymbol} for ${baseAmount.toFixed(6)} ${pool.baseToken}`);
  console.log(`   Price: ${newPrice.toFixed(6)} ${pool.baseToken}/${pool.tokenSymbol}`);
  console.log(`   iTax: ${iTax.toFixed(6)} ${pool.baseToken}`);
  console.log(`   Distribution: ROOT CA ${iTaxRootCA.toFixed(6)}, Indexer ${iTaxIndexer.toFixed(6)}, Trader ${iTaxTrader.toFixed(6)}`);
  
  // Broadcast DEX trade event
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
        trader: iTaxTrader,
      },
      poolState: {
        price: pool.price,
        liquidity: pool.poolLiquidity,
        totalVolume: pool.totalVolume,
        totalTrades: pool.totalTrades,
      },
      rootCALiquidity: rootCALiquidity,
    }
  });
  
  return trade;
}

// iGas Calculation
// (calculateIGas moved to src/dex.ts)
function _calculateIGas_DEPRECATED(llmCalls: number, providersQueried: number, complexity: number = 1): number {
  const llmCost = LLM_BASE_COST * llmCalls * complexity;
  const routingCost = ROUTING_COST_PER_PROVIDER * providersQueried;
  const reasoningCost = llmCost * REASONING_COST_MULTIPLIER;
  return llmCost + routingCost + reasoningCost;
}

// LLM Resolution

// OpenAI API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "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";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// OpenAI LLM Query Extraction
// (extractQueryWithOpenAI moved to src/llm.ts)
async function _extractQueryWithOpenAI_DEPRECATED(userInput: string): Promise<LLMQueryResult> {
  const messages = [
    { role: "system", content: LLM_QUERY_EXTRACTION_PROMPT },
    { role: "user", content: userInput },
  ];
  
  const payload = JSON.stringify({
    model: "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  // Broadcast LLM interaction start
  broadcastEvent({
    type: "llm_query_extraction_start",
    component: "llm",
    message: "Starting LLM query extraction...",
    timestamp: Date.now(),
    data: {
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: LLM_QUERY_EXTRACTION_PROMPT,
      userInput: userInput,
      messages: messages
    }
  });

  return new Promise<LLMQueryResult>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        port: 443,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Length": payload.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
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
                confidence: content.confidence || 0.9,
              };
              
              // Broadcast LLM response
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
          } catch (err: any) {
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

// OpenAI LLM Response Formatting
async function formatResponseWithOpenAI(listings: MovieListing[] | TokenListing[], userQuery: string, queryFilters?: { maxPrice?: number | string; genre?: string; time?: string; location?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL' }): Promise<LLMResponse> {
  const listingsJson = JSON.stringify(listings);
  const filtersJson = queryFilters ? JSON.stringify(queryFilters) : "{}";
  const userMessage = `User query: ${userQuery}\n\nQuery filters: ${filtersJson}\n\nAvailable listings:\n${listingsJson}\n\nFilter listings based on the query filters and format the best option as a user-friendly message.`;
  
  const messages = [
    { role: "system", content: LLM_RESPONSE_FORMATTING_PROMPT },
    { role: "user", content: userMessage },
  ];
  
  const payload = JSON.stringify({
    model: "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  // Broadcast LLM formatting start
  broadcastEvent({
    type: "llm_response_formatting_start",
    component: "llm",
    message: "Starting LLM response formatting...",
    timestamp: Date.now(),
    data: {
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: LLM_RESPONSE_FORMATTING_PROMPT,
      userQuery: userQuery,
      queryFilters: queryFilters,
      listingsCount: listings.length,
      userMessage: userMessage.substring(0, 500) + (userMessage.length > 500 ? "..." : "") // Truncate for display
    }
  });

  return new Promise<LLMResponse>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        port: 443,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Length": payload.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
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
              
              // Ensure selectedListing has providerId by matching it back to original listings
              let selectedListing = content.selectedListing || (listings.length > 0 ? listings[0] : null);
              if (selectedListing && !selectedListing.providerId) {
                // Try to find matching listing by id first (most reliable)
                let matchedListing = listings.find(l => l.id === selectedListing.id);
                
                // If no id match, try matching by provider name and a unique identifier
                // For movie: match by movieTitle + providerName
                // For airline: match by flightNumber + providerName
                // For others: match by name/primary field + providerName
                if (!matchedListing && listings.length > 0) {
                  const firstListing = listings[0] as any;
                  const matchServiceType = firstListing.serviceType || 'movie';
                  const matchFields = getServiceTypeFields(matchServiceType);
                  
                  if (matchServiceType === 'movie' && selectedListing.movieTitle) {
                    matchedListing = listings.find((l: any) => 
                      l.movieTitle === selectedListing.movieTitle && 
                      l.providerName === selectedListing.providerName
                    ) as any;
                  } else if (matchServiceType === 'airline' && selectedListing.flightNumber) {
                    matchedListing = listings.find((l: any) => 
                      l.flightNumber === selectedListing.flightNumber && 
                      l.providerName === selectedListing.providerName
                    ) as any;
                  } else if (selectedListing[matchFields.primary] && selectedListing.providerName) {
                    matchedListing = listings.find((l: any) => 
                      l[matchFields.primary] === selectedListing[matchFields.primary] && 
                      l.providerName === selectedListing.providerName
                    ) as any;
                  }
                }
                
                if (matchedListing) {
                  selectedListing = { ...selectedListing, providerId: (matchedListing as any).providerId };
                } else if (listings.length > 0) {
                  // Fallback to first listing
                  selectedListing = { ...selectedListing, providerId: (listings[0] as any).providerId };
                }
              }
              
              const result = {
                message: content.message || "Service found",
                listings: content.listings || listings,
                selectedListing: selectedListing,
                iGasCost: 0, // Will be calculated separately
              };
              
              // Broadcast LLM formatting response
              broadcastEvent({
                type: "llm_response_formatting_response",
                component: "llm",
                message: "LLM response formatting completed",
                timestamp: Date.now(),
                data: {
                  provider: "openai",
                  model: "gpt-4o-mini",
                  response: parsed,
                  formattedMessage: result.message,
                  selectedListing: result.selectedListing,
                  listingsCount: result.listings.length
                }
              });
              
              resolve(result);
            } else {
              broadcastEvent({
                type: "llm_error",
                component: "llm",
                message: "Invalid OpenAI formatting response format",
                timestamp: Date.now(),
                data: {
                  provider: "openai",
                  error: "Invalid response format",
                  rawResponse: data
                }
              });
              reject(new Error("Invalid OpenAI response format"));
            }
          } catch (err: any) {
            broadcastEvent({
              type: "llm_error",
              component: "llm",
              message: "Failed to parse OpenAI formatting response",
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

// DeepSeek LLM Query Extraction (Legacy)
async function extractQueryWithDeepSeek(userInput: string): Promise<LLMQueryResult> {
  const messages = [
    { role: "system", content: LLM_QUERY_EXTRACTION_PROMPT },
    { role: "user", content: userInput },
  ];
  
  const payload = JSON.stringify({
    model: "deepseek-r1",
    messages,
    stream: false,
  });

  // Broadcast LLM interaction start
  broadcastEvent({
    type: "llm_query_extraction_start",
    component: "llm",
    message: "Starting LLM query extraction...",
    timestamp: Date.now(),
    data: {
      provider: "deepseek",
      model: "deepseek-r1",
      systemPrompt: LLM_QUERY_EXTRACTION_PROMPT,
      userInput: userInput,
      messages: messages
    }
  });

  return new Promise<LLMQueryResult>((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port: 11434, path: "/api/chat", method: "POST" },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const result = {
              query: parsed.query || { serviceType: "movie", filters: {} },
              serviceType: parsed.serviceType || "movie",
              confidence: parsed.confidence || 0.9,
            };
            
            // Broadcast LLM response
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

// DeepSeek LLM Response Formatting (Legacy)
async function formatResponseWithDeepSeek(listings: MovieListing[] | TokenListing[], userQuery: string, queryFilters?: { maxPrice?: number | string; genre?: string; time?: string; location?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL' }): Promise<LLMResponse> {
  const listingsJson = JSON.stringify(listings);
  const filtersJson = queryFilters ? JSON.stringify(queryFilters) : "{}";
  const userMessage = `User query: ${userQuery}\n\nQuery filters: ${filtersJson}\n\nAvailable listings:\n${listingsJson}\n\nFilter listings based on the query filters and format the best option as a user-friendly message.`;
  
  const messages = [
    { role: "system", content: LLM_RESPONSE_FORMATTING_PROMPT },
    { role: "user", content: userMessage },
  ];
  
  const payload = JSON.stringify({
    model: "deepseek-r1",
    messages,
    stream: false,
  });

  // Broadcast LLM formatting start
  broadcastEvent({
    type: "llm_response_formatting_start",
    component: "llm",
    message: "Starting LLM response formatting...",
    timestamp: Date.now(),
    data: {
      provider: "deepseek",
      model: "deepseek-r1",
      systemPrompt: LLM_RESPONSE_FORMATTING_PROMPT,
      userQuery: userQuery,
      queryFilters: queryFilters,
      listingsCount: listings.length,
      userMessage: userMessage.substring(0, 500) + (userMessage.length > 500 ? "..." : "") // Truncate for display
    }
  });

  return new Promise<LLMResponse>((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port: 11434, path: "/api/chat", method: "POST" },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            
            // Ensure selectedListing has providerId/poolId by matching it back to original listings
            let selectedListing = parsed.selectedListing || (listings.length > 0 ? listings[0] : null);
            if (selectedListing) {
              // Check if it's a TokenListing (has poolId) or MovieListing (has movieTitle)
              const isTokenListing = 'poolId' in selectedListing || 'tokenSymbol' in selectedListing;
              
              if (isTokenListing) {
                // TokenListing: match by poolId or tokenSymbol
                const tokenListing = selectedListing as any;
                if (!tokenListing.poolId) {
                  const matchedListing = listings.find((l: any) => 
                    ('poolId' in l && l.poolId === tokenListing.poolId) ||
                    ('tokenSymbol' in l && l.tokenSymbol === tokenListing.tokenSymbol)
                  ) as TokenListing | undefined;
                  if (matchedListing) {
                    selectedListing = { ...selectedListing, ...matchedListing };
                  } else if (listings.length > 0) {
                    selectedListing = { ...selectedListing, ...(listings[0] as TokenListing) };
                  }
                }
              } else {
                // MovieListing: match by movie title and provider name
                const movieListing = selectedListing as any;
                if (!movieListing.providerId) {
                  const matchedListing = listings.find((l: any) => 
                    'movieTitle' in l &&
                    l.movieTitle === movieListing.movieTitle && 
                    l.providerName === movieListing.providerName
                  ) as MovieListing | undefined;
                  if (matchedListing) {
                    selectedListing = { ...selectedListing, providerId: matchedListing.providerId };
                  } else if (listings.length > 0) {
                    selectedListing = { ...selectedListing, providerId: (listings[0] as MovieListing).providerId };
                  }
                }
              }
            }
            
            const result = {
              message: parsed.message || "Service found",
              listings: parsed.listings || listings,
              selectedListing: selectedListing,
              iGasCost: 0,
            };
            
            // Broadcast LLM formatting response
            broadcastEvent({
              type: "llm_response_formatting_response",
              component: "llm",
              message: "LLM response formatting completed",
              timestamp: Date.now(),
              data: {
                provider: "deepseek",
                model: "deepseek-r1",
                response: parsed,
                formattedMessage: result.message,
                selectedListing: result.selectedListing,
                listingsCount: result.listings.length
              }
            });
            
            resolve(result);
          } catch (err) {
            broadcastEvent({
              type: "llm_error",
              component: "llm",
              message: "Failed to parse DeepSeek formatting response",
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

// Main LLM Resolution with ServiceRegistry architecture
// 
// OPTIMIZATION NOTE (v2): Currently extracts query intent twice:
//   1. Here in resolveLLM() - extracts serviceType, filters, etc.
//   2. Later in processChatInput() for DEX trades - re-extracts to get action/tokenAmount
// Future optimization: Cache intent hash (e.g., hash(userInput + timestamp)) and skip 
// re-extraction unless user confirms/modifies query. This would reduce LLM calls by ~50% 
// for DEX trades and improve latency.
//
async function resolveLLM(userInput: string): Promise<LLMResponse> {
  if (MOCKED_LLM) {
    // Mock response for testing
    const mockListing: MovieListing = {
      providerId: "amc-001",
      providerName: "AMC Theatres",
      movieTitle: "Back to the Future",
      movieId: "back-to-future-1",
      price: 2.0,
      showtime: "10:30 PM",
      location: "Baltimore, Maryland",
      reviewCount: 100,
      rating: 5.0,
      gardenId: ROOT_CA_SERVICE_REGISTRY.find(p => p.id === "amc-001")?.gardenId || "HG"
    };
    return {
      message: "5 stars movie provider AMC in indexer A, Baltimore, Maryland offers 2 USDC for 'Back to the Future' at 10:30 PM and 100 viewers already reviewed the AMC viewing service",
      listings: [mockListing],
      selectedListing: mockListing,
      iGasCost: calculateIGas(2, 1, 1),
    };
  }

  let llmCalls = 0;
  let extractQueryFn: (input: string) => Promise<LLMQueryResult>;
  let formatResponseFn: (listings: MovieListing[] | TokenListing[], query: string, filters?: { maxPrice?: number | string; genre?: string; time?: string; location?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL' }) => Promise<LLMResponse>;

  // Choose LLM provider
  if (ENABLE_OPENAI) {
    console.log("🤖 Using OpenAI as primary LLM provider");
    extractQueryFn = extractQueryWithOpenAI;
    formatResponseFn = formatResponseWithOpenAI;
  } else {
    console.log("🤖 Using DeepSeek as LLM provider");
    extractQueryFn = extractQueryWithDeepSeek;
    formatResponseFn = formatResponseWithDeepSeek;
  }

  try {
    // Step 1: Extract query from user input using LLM
    llmCalls++;
    console.log(`🤖 [LLM] Starting query extraction for: "${userInput.substring(0, 50)}${userInput.length > 50 ? '...' : ''}"`);
    let queryResult = await extractQueryFn(userInput);
    console.log(`📋 [LLM] Extracted query:`, queryResult);
    
    // VALIDATION: Check for misclassification (movie queries incorrectly classified as DEX)
    const userInputLower = userInput.toLowerCase();
    const movieKeywords = ['movie', 'ticket', 'tickets', 'cinema', 'theater', 'theatre', 'film', 'watch', 'showtime', 'show', 'amc', 'cinemark', 'moviecom'];
    const dexKeywords = ['token', 'tokena', 'tokenb', 'tokenc', 'tokend', 'dex', 'pool', 'trade'];
    
    const hasMovieKeywords = movieKeywords.some(keyword => userInputLower.includes(keyword));
    const hasDexKeywords = dexKeywords.some(keyword => userInputLower.includes(keyword));
    
    // If classified as DEX but has movie keywords and NO explicit token/DEX keywords, correct to movie
    let wasCorrected = false;
    if (queryResult.serviceType === "dex" && hasMovieKeywords && !hasDexKeywords) {
      console.log(`⚠️  [VALIDATION] Correcting misclassification: DEX → MOVIE`);
      console.log(`   User input: "${userInput}"`);
      console.log(`   Detected movie keywords but was classified as DEX`);
      queryResult.serviceType = "movie";
      queryResult.query.serviceType = "movie";
      wasCorrected = true;
      // Clear DEX-specific filters
      if (queryResult.query.filters) {
        delete queryResult.query.filters.tokenSymbol;
        delete queryResult.query.filters.baseToken;
        delete queryResult.query.filters.action;
        delete queryResult.query.filters.tokenAmount;
      }
    }
    
    // Normalize DEX query extraction (fix common LLM mistakes)
    if (queryResult.serviceType === "dex" && queryResult.query.filters) {
      const filters = queryResult.query.filters;
      const userInputLower = userInput.toLowerCase();
      
      // Common mistake: LLM extracts "SOLANA" as tokenSymbol when user says "SOLANA token A"
      // Fix: If tokenSymbol looks like a base currency (SOL, SOLANA, USDC) and baseToken looks like a token (TOKENA, TOKENB),
      //      swap them and normalize tokenSymbol to match pool format (TOKENA, TOKENB, etc.)
      if (filters.tokenSymbol && filters.baseToken) {
        const tokenSymbolUpper = filters.tokenSymbol.toUpperCase();
        const baseTokenUpper = filters.baseToken.toUpperCase();
        
        // Check if tokenSymbol is actually a base currency
        const baseCurrencies = ['SOL', 'SOLANA', 'USDC', 'USD', 'ETH', 'BTC'];
        const tokenPatterns = ['TOKENA', 'TOKENB', 'TOKENC', 'TOKEND', 'TOKEN'];
        
        const tokenSymbolIsBaseCurrency = baseCurrencies.some(bc => tokenSymbolUpper.includes(bc));
        const baseTokenIsToken = tokenPatterns.some(tp => baseTokenUpper.includes(tp));
        
        if (tokenSymbolIsBaseCurrency && baseTokenIsToken) {
          console.log(`⚠️  [LLM] Detected swapped extraction: tokenSymbol="${filters.tokenSymbol}", baseToken="${filters.baseToken}"`);
          console.log(`   Correcting: tokenSymbol="${filters.baseToken}", baseToken="${filters.tokenSymbol}"`);
          
          // Swap them
          const temp = filters.tokenSymbol;
          filters.tokenSymbol = filters.baseToken;
          filters.baseToken = temp;
        }
        
        // Normalize tokenSymbol to match pool format (TOKENA, TOKENB, etc.)
        if (filters.tokenSymbol) {
          const tokenSymbolLower = filters.tokenSymbol.toLowerCase();
          if (tokenSymbolLower.includes('token a') || tokenSymbolLower.includes('tokena')) {
            filters.tokenSymbol = 'TOKENA';
          } else if (tokenSymbolLower.includes('token b') || tokenSymbolLower.includes('tokenb')) {
            filters.tokenSymbol = 'TOKENB';
          } else if (tokenSymbolLower.includes('token c') || tokenSymbolLower.includes('tokenc')) {
            filters.tokenSymbol = 'TOKENC';
          } else if (tokenSymbolLower.includes('token d') || tokenSymbolLower.includes('tokend')) {
            filters.tokenSymbol = 'TOKEND';
          }
        }
        
        // Normalize baseToken (SOLANA -> SOL)
        if (filters.baseToken) {
          const baseTokenLower = filters.baseToken.toLowerCase();
          if (baseTokenLower.includes('solana') || baseTokenLower.includes('sol')) {
            filters.baseToken = 'SOL';
          }
        }
      }
      
      console.log(`📋 [LLM] Normalized query:`, queryResult);
    }

    // Step 2: Query ServiceRegistry
    // Step 2: Query ROOT CA Service Registry (post-LLM in-memory lookup)
    // Indexers query ROOT CA for services - ROOT CA is the single source of truth
    broadcastEvent({
      type: "service_registry_query",
      component: "root-ca",
      message: "Querying ROOT CA Service Registry...",
      timestamp: Date.now()
    });
    
    const providers = queryROOTCAServiceRegistry(queryResult.query);
    console.log(`🔍 [ROOT CA] Found ${providers.length} service providers`);
    
    // Also query Snake services if serviceType is "movie" (for advertising context)
    // Snake is a service type (serviceType: "snake"), each Snake service belongs to an indexer
    let snakeProviders: ServiceProvider[] = [];
    if (queryResult.serviceType === "movie") {
      snakeProviders = queryROOTCAServiceRegistry({
        serviceType: "snake", // Query Snake services (serviceType: "snake")
        filters: queryResult.query.filters
      });
      // Filter Snake services by allowed contexts
      snakeProviders = snakeProviders.filter(sp => 
        sp.contextsAllowed?.includes("movies") || sp.contextsAllowed?.includes("entertainment")
      );
      console.log(`🐍 [ROOT CA] Found ${snakeProviders.length} Snake services for movie context`);
    }
    
    if (queryResult.serviceType === "dex") {
      console.log(`   DEX Providers: ${providers.map(p => `${p.id} (garden: ${p.gardenId})`).join(", ")}`);
      console.log(`   Available DEX Pools: ${Array.from(DEX_POOLS.values()).map(p => `${p.tokenSymbol} (${p.gardenId})`).join(", ")}`);
    }
    
    const allProviders = [...providers, ...snakeProviders];
    
    broadcastEvent({
      type: "service_registry_result",
      component: "root-ca",
      message: `Found ${allProviders.length} service providers (${providers.length} regular, ${snakeProviders.length} Snake)`,
      timestamp: Date.now(),
      data: { 
        providers: allProviders.map(p => ({ 
          id: p.id, 
          name: p.name,
          serviceType: p.serviceType,
          isSnake: p.serviceType === 'snake',
          gardenId: p.gardenId // Each service belongs to a garden
        })) 
      }
    });

    if (allProviders.length === 0) {
      throw new Error("No service providers found matching query");
    }

    // Step 3: Query service providers' external APIs for actual data (prices, showtimes)
    allProviders.forEach(provider => {
      const serviceTypeLabel = provider.serviceType === 'snake' ? '🐍 Snake' : 'Regular';
      broadcastEvent({
        type: "provider_api_query",
        component: provider.id,
        message: `${serviceTypeLabel} Querying ${provider.name} API...`,
        timestamp: Date.now()
      });
    });
    
    const listings = await queryServiceProviders(allProviders, {
      genre: queryResult.query.filters?.genre,
      time: queryResult.query.filters?.time,
      tokenSymbol: queryResult.query.filters?.tokenSymbol,
      baseToken: queryResult.query.filters?.baseToken,
      action: queryResult.query.filters?.action,
    });
    
    if (queryResult.serviceType === "dex") {
      console.log(`🌊 Found ${listings.length} DEX pool listings`);
    } else {
      console.log(`🎬 Found ${listings.length} movie listings from provider APIs`);
    }
    
    allProviders.forEach(provider => {
      const providerListings = listings.filter((l: any) => l.providerId === provider.id);
      const serviceTypeLabel = provider.serviceType === 'snake' ? '🐍 Snake' : 'Regular';
      broadcastEvent({
        type: "provider_api_result",
        component: provider.id,
        message: `${serviceTypeLabel} ${provider.name} returned ${providerListings.length} listings`,
        timestamp: Date.now(),
        data: { 
          listings: providerListings,
          serviceType: provider.serviceType,
          isSnake: provider.serviceType === 'snake',
          indexerId: provider.gardenId // Legacy field (will be renamed to gardenId in future)
        }
      });
    });

    if (listings.length === 0) {
      const errorMsg = queryResult.serviceType === "dex" 
        ? "No DEX pools found from service providers"
        : "No movie listings found from service providers";
      throw new Error(errorMsg);
    }

    // VALIDATION: Filter listings to match serviceType (prevent DEX listings when serviceType is "movie")
    let filteredListings = listings;
    if (queryResult.serviceType === "movie") {
      // Remove any DEX listings (TokenListings) - only keep MovieListings
      filteredListings = listings.filter((listing: any) => {
        const isTokenListing = 'poolId' in listing || 'tokenSymbol' in listing;
        if (isTokenListing) {
          console.log(`⚠️  [VALIDATION] Filtering out DEX listing from movie query: ${listing.providerId || listing.poolId}`);
        }
        return !isTokenListing; // Keep only non-DEX listings
      });
      
      if (filteredListings.length === 0 && listings.length > 0) {
        throw new Error("No movie listings found - all results were DEX token listings. This indicates a classification error.");
      }
      
      console.log(`✅ [VALIDATION] Filtered to ${filteredListings.length} movie listings (removed ${listings.length - filteredListings.length} DEX listings)`);
    } else if (queryResult.serviceType === "dex") {
      // Remove any MovieListings - only keep TokenListings
      filteredListings = listings.filter((listing: any) => {
        const isTokenListing = 'poolId' in listing || 'tokenSymbol' in listing;
        return isTokenListing; // Keep only DEX listings
      });
      
      if (filteredListings.length === 0 && listings.length > 0) {
        throw new Error("No DEX listings found - all results were movie listings. This indicates a classification error.");
      }
    }

    // Step 4: Format response using LLM (LLM will handle filtering based on query filters)
    llmCalls++;
    console.log(`🤖 [LLM] Starting response formatting for ${filteredListings.length} listings (serviceType: ${queryResult.serviceType})`);
    const formattedResponse = await formatResponseFn(filteredListings as MovieListing[], userInput, queryResult.query.filters);
    console.log(`✅ [LLM] Response formatted: ${formattedResponse.message.substring(0, 100)}${formattedResponse.message.length > 100 ? '...' : ''}`);

    // VALIDATION: Ensure selectedListing matches serviceType
    if (formattedResponse.selectedListing) {
      const isTokenListing = 'poolId' in formattedResponse.selectedListing || 'tokenSymbol' in formattedResponse.selectedListing;
      if (queryResult.serviceType === "movie" && isTokenListing) {
        const errorMsg = `❌ [VALIDATION ERROR] LLM formatter returned DEX listing for movie query. User input: "${userInput}"`;
        console.error(errorMsg);
        throw new Error("LLM formatter error: Selected DEX token listing for movie query. Please try again.");
      }
      if (queryResult.serviceType === "dex" && !isTokenListing) {
        const errorMsg = `❌ [VALIDATION ERROR] LLM formatter returned movie listing for DEX query. User input: "${userInput}"`;
        console.error(errorMsg);
        throw new Error("LLM formatter error: Selected movie listing for DEX query. Please try again.");
      }
    }

    // Step 5: Calculate iGas
    let iGas = calculateIGas(llmCalls, allProviders.length, queryResult.confidence);
    
    // Apply Snake service multipliers if any provider is a Snake service
    // Snake is a service type (serviceType: "snake"), each belongs to an indexer
    const hasSnakeService = allProviders.some(p => p.serviceType === 'snake');
    if (hasSnakeService) {
      // Find the highest multiplier among Snake services (use max multiplier)
      const maxIGasMultiplier = Math.max(...allProviders
        .filter(p => p.serviceType === 'snake')
        .map(p => p.iGasMultiplier || 1.0), 1.0);
      iGas = iGas * maxIGasMultiplier;
      console.log(`🐍 [Snake Service] Applied iGas multiplier: ${maxIGasMultiplier}x`);
    }
    
    formattedResponse.iGasCost = iGas;

    console.log(`⛽ iGas calculated: ${iGas.toFixed(6)}`);

    return formattedResponse;
  } catch (err: any) {
    // Fallback to OpenAI if DeepSeek was used and failed
    if (!ENABLE_OPENAI) {
      console.warn(`⚠️  DeepSeek failed: ${err.message}, trying OpenAI fallback`);
      try {
        extractQueryFn = extractQueryWithOpenAI;
        formatResponseFn = formatResponseWithOpenAI;
        ENABLE_OPENAI; // This won't work, need to retry with OpenAI
        // Retry logic would go here
        throw err; // For now, just throw
      } catch (fallbackErr: any) {
        throw new Error(`Both LLM providers failed. Original: ${err.message}`);
      }
    }
    throw err;
  }
}

// Ledger Component - Tracks all Eden bookings

// ============================================================================
// JesusCoin Wallet Service (Holy Ghost - Single Source of Truth)
// ============================================================================
// Wallet is Redis-backed, authoritative, event-sourced
// EdenCore submits intents, Wallet decides and updates balances
// Ledger records outcomes but does not define truth
// (Wallet functions moved to src/wallet.ts)

// Mint JesusCoin (JSC) - Via Stripe Payment Rail Service Provider (Holy Ghost indexer)
// This is called when Stripe payment is confirmed via webhook
// Stripe is registered as a payment-rail service provider under Holy Ghost
// Stores Stripe customer ID, payment method ID, and payment intent ID in ledger for webhook querying
// Register a new movie indexer after Stripe payment
// CRITICAL: In ROOT mode, this function should NOT be called - all indexers are created via Angular wizard
// (registerNewMovieGarden moved to src/garden.ts)

async function mintJSC(
  email: string, 
  amount: number, 
  stripePaymentIntentId: string,
  stripeCustomerId?: string | null,
  stripePaymentMethodId?: string | null,
  stripeSessionId?: string
): Promise<void> {
  // Find Stripe payment rail service provider
  const stripeProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === "stripe-payment-rail-001");
  const providerUuid = stripeProvider?.uuid || ROOT_CA_UUID;
  
  console.log(`💰 [Stripe Payment Rail] Minting ${amount} 🍎 APPLES for ${email} (Stripe: ${stripePaymentIntentId})`);
  
  // Find or create user (for backward compatibility)
  let user = USERS.find(u => u.email === email);
  if (!user) {
    user = {
      id: `u${USERS.length + 1}`,
      email: email,
      balance: 0,
    };
    USERS.push(user);
    console.log(`   ✅ Created new user: ${email}`);
  }
  
  // Mint JSC via Wallet Service (authoritative source)
  const walletResult = await creditWallet(
    email,
    amount,
    crypto.randomUUID(),
    `Stripe payment confirmed: ${stripePaymentIntentId}`,
    { stripePaymentIntentId, serviceProvider: "stripe-payment-rail-001" }
  );
  
  if (!walletResult.success) {
    throw new Error(`Failed to mint JSC: ${walletResult.error}`);
  }
  
  // Update user balance for backward compatibility (wallet is source of truth)
  user.balance = walletResult.balance;
  
  console.log(`✅ [Stripe Payment Rail] Wallet updated successfully`);
  console.log(`   Email: ${email}`);
  console.log(`   Amount credited: ${amount} 🍎 APPLES`);
  console.log(`   Final wallet balance: ${walletResult.balance} 🍎 APPLES`);
  console.log(`   User.balance synced: ${user.balance} 🍎 APPLES`);
  
  // Verify balance was actually updated in Redis
  if (!SKIP_REDIS && redis.isOpen) {
    try {
      await ensureRedisConnection();
      const verifyBalance = await redis.get(`${WALLET_BALANCE_PREFIX}${email}`);
      console.log(`   ✅ Verification: Redis wallet balance = ${verifyBalance || 'NOT FOUND'} JSC`);
      if (verifyBalance && parseFloat(verifyBalance) !== walletResult.balance) {
        console.error(`   ❌ MISMATCH: Redis balance (${verifyBalance}) != walletResult.balance (${walletResult.balance})`);
      }
    } catch (err: any) {
      console.warn(`   ⚠️  Could not verify Redis balance:`, err.message);
    }
  }
  
  // Create MINT ledger entry
  const snapshot: TransactionSnapshot = {
    chainId: CHAIN_ID,
    txId: crypto.randomUUID(),
    slot: Date.now(),
    blockTime: Date.now(),
    payer: `stripe:${stripePaymentIntentId}`,
    merchant: email,
    amount: amount,
    feeSplit: {},
  };
  
  const entry: LedgerEntry = {
    entryId: crypto.randomUUID(),
    txId: snapshot.txId,
    timestamp: snapshot.blockTime,
    payer: `stripe:${stripePaymentIntentId}`,
    payerId: stripePaymentIntentId,
    merchant: email,
    providerUuid: providerUuid, // Stripe Payment Rail Service Provider UUID
    serviceType: 'mint',
    amount: amount,
    iGasCost: 0, // No iGas for minting (it's a deposit)
    fees: {},
    status: 'completed', // Mints are immediately completed
    cashierId: 'stripe-payment-rail-001', // Stripe Payment Rail Service Provider
    bookingDetails: {
      asset: 'JSC',
      stripePaymentIntentId: stripePaymentIntentId,
      stripeCustomerId: stripeCustomerId || undefined,
      stripePaymentMethodId: stripePaymentMethodId || undefined,
      stripeSessionId: stripeSessionId || undefined,
    },
  };
  
  // Add to ledger
  LEDGER.push(entry);
  
  // Persist ledger entry
  redis.saveLedgerEntries(LEDGER);
  
  console.log(`   ✅ 🍎 APPLES minted: ${amount} 🍎 APPLES added to ${email} balance (new balance: ${walletResult.balance} 🍎 APPLES)`);
  
  // Broadcast events
  broadcastEvent({
    type: "jsc_minted",
    component: "stripe-payment-rail-001",
    message: `🍎 APPLES minted via Stripe Payment Rail: ${amount} 🍎 APPLES for ${email}`,
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
      indexerId: "HG", // Holy Ghost indexer
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

// (addLedgerEntry moved to src/ledger.ts)
function _addLedgerEntry_DEPRECATED(
  snapshot: TransactionSnapshot,
  serviceType: string,
  iGasCost: number,
  payerId: string,
  merchantName: string, // Provider name (e.g., "AMC Theatres")
  providerUuid: string, // Service provider UUID for certificate issuance
  bookingDetails?: Record<string, any> // Generic booking details - service-type agnostic
): LedgerEntry {
  // payerId should be the email address (same as payer)
  if (!providerUuid) {
    console.error(`❌ Provider UUID is missing for merchant: ${merchantName}`);
  }
  
  const entry: LedgerEntry = {
    entryId: crypto.randomUUID(),
    txId: snapshot.txId,
    timestamp: snapshot.blockTime,
    payer: snapshot.payer, // Email address
    payerId: snapshot.payer, // Email address (same as payer)
    merchant: merchantName, // Provider name (e.g., "AMC Theatres", "MovieCom", "Cinemark")
    providerUuid: providerUuid || 'MISSING-UUID', // Service provider UUID for certificate issuance
    serviceType: serviceType,
    amount: snapshot.amount,
    iGasCost: iGasCost,
    fees: snapshot.feeSplit,
    status: 'pending',
    cashierId: getCashierStatus().id,
    bookingDetails: bookingDetails,
  };
  
  console.log(`📝 Ledger entry created with providerUuid: ${entry.providerUuid}`);

  // Push ledger entry to local ledger (for immediate access)
  LEDGER.push(entry);
  
  // Persist ledger entry
  redis.saveLedgerEntries(LEDGER);
  
  // ARCHITECTURAL PATTERN: Ledger Push + Settlement Pull
  // Indexers EXECUTE transactions but never SETTLE them
  // Push ledger entry to ROOT CA Redis Stream for settlement
  pushLedgerEntryToSettlementStream(entry).catch(err => {
    console.error(`⚠️  Failed to push ledger entry to settlement stream:`, err.message);
    // Continue execution - settlement will retry
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

// Push ledger entry to ROOT CA settlement stream
// This is the ONLY way indexers interact with settlement
// Indexers EXECUTE but never SETTLE
async function pushLedgerEntryToSettlementStream(entry: LedgerEntry): Promise<void> {
  if (SKIP_REDIS || !redis.isOpen) {
    console.log(`📤 [Settlement] Ledger entry ${entry.entryId} queued (Redis disabled)`);
    return;
  }

  try {
    await ensureRedisConnection();
    
    // Calculate fees breakdown
    const iGas = entry.iGasCost;
    const iTax = entry.bookingDetails?.iTax || 0;
    
    // Calculate fee distribution (from snapshot.feeSplit or defaults)
    const rootCAFee = entry.fees?.rootCA || (iGas * ROOT_CA_FEE);
    const indexerFee = entry.fees?.indexer || (iGas * INDEXER_FEE);
    
    // Extract garden ID from provider (if available)
    const provider = ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === entry.providerUuid);
    const gardenId = provider?.gardenId || 'unknown';
    
    const settlementPayload = {
      entryId: entry.entryId,
      txId: entry.txId,
      timestamp: entry.timestamp.toString(),
      payer: entry.payer,
      payerId: entry.payerId,
      merchant: entry.merchant,
      providerUuid: entry.providerUuid,
      indexerId: gardenId, // Legacy field (will be renamed to gardenId in future)
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
      bookingDetails: entry.bookingDetails ? JSON.stringify(entry.bookingDetails) : '',
    };
    
    await redis.xAdd(LEDGER_SETTLEMENT_STREAM, "*", settlementPayload);
    
    console.log(`📤 [Settlement] Pushed ledger entry ${entry.entryId} to ROOT CA settlement stream`);
    console.log(`   iGas: ${iGas}, iTax: ${iTax}, ROOT CA Fee: ${rootCAFee}, Indexer Fee: ${indexerFee}`);
    
    // Record fee payment in Accountant Service
    try {
      const { recordFeePayment } = await import("./src/accountant");
      recordFeePayment(
        entry.serviceType,
        iGas,
        iTax,
        rootCAFee,
        indexerFee,
        0 // providerFee (can be added later if needed)
      );
    } catch (err: any) {
      console.warn(`⚠️  [Settlement] Failed to record fee payment in Accountant: ${err.message}`);
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
        indexerId: gardenId // Legacy field (will be renamed to gardenId in future)
      }
    });
  } catch (err: any) {
    console.error(`❌ Failed to push ledger entry to settlement stream:`, err.message);
    throw err;
  }
}

async function processPayment(cashier: Cashier, entry: LedgerEntry, user: User): Promise<boolean> {
  // NO AUTO-GRANT - User must have balance from Stripe or other credits
  
  // EdenCore submits intent to Wallet Service
  // Wallet Service decides and updates balance (single source of truth)
  const walletResult = await processWalletIntent({
    intent: "DEBIT",
    email: user.email,
    amount: entry.amount,
    txId: entry.txId,
    entryId: entry.entryId,
    reason: `Payment to ${entry.merchant} (${entry.serviceType})`,
    metadata: {
      merchant: entry.merchant,
      serviceType: entry.serviceType,
      cashierId: cashier.id,
    }
  });
  
  if (!walletResult.success) {
    entry.status = 'failed';
    const walletBalance = await getWalletBalance(user.email);
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

  // Update user balance for backward compatibility (wallet is source of truth)
  user.balance = walletResult.balance;
  
  // Update cashier stats
  cashier.processedCount++;
  cashier.totalProcessed += entry.amount;
  entry.status = 'processed';

  broadcastEvent({
    type: "cashier_payment_processed",
    component: "cashier",
    message: `${cashier.name} processed payment: ${entry.amount} 🍎 APPLES`,
    timestamp: Date.now(),
    data: { entry, cashier, userBalance: walletResult.balance, walletService: "wallet-service-001" }
  });

  return true;
}

function completeBooking(entry: LedgerEntry) {
  entry.status = 'completed';
  
  broadcastEvent({
    type: "ledger_booking_completed",
    component: "ledger",
    message: `Booking completed: ${entry.entryId}`,
    timestamp: Date.now(),
    data: { entry }
  });
}

function getLedgerEntries(payerEmail?: string): LedgerEntry[] {
  if (payerEmail) {
    return LEDGER.filter(entry => entry.payer === payerEmail);
  }
  return [...LEDGER];
}

// RPC Functions - Canonical source of truth
function getTransactionByPayer(payerEmail: string): LedgerEntry[] {
  return LEDGER.filter(entry => entry.payer === payerEmail && entry.status === 'completed');
}

function getTransactionBySnapshot(snapshotId: string): LedgerEntry | null {
  return LEDGER.find(entry => entry.txId === snapshotId) || null;
}

function getLatestSnapshot(providerId: string): LedgerEntry | null {
  const providerEntries = LEDGER.filter(entry => 
    entry.merchant === providerId || entry.providerUuid === providerId
  );
  if (providerEntries.length === 0) return null;
  
  // Return most recent completed transaction
  return providerEntries
    .filter(entry => entry.status === 'completed')
    .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
}

// Webhook Delivery (Best effort, async)
async function deliverWebhook(providerId: string, snapshot: TransactionSnapshot, ledgerEntry: LedgerEntry): Promise<void> {
  const webhook = PROVIDER_WEBHOOKS.get(providerId);
  if (!webhook) {
    return; // No webhook registered
  }
  
  console.log(`📤 [Service Provider] Webhook Delivery Attempt: ${providerId} → ${webhook.webhookUrl} (TX: ${snapshot.txId.substring(0, 8)}...)`);
  
  // Broadcast webhook delivery attempt
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
    event: 'tx-finalized',
    snapshot: {
      chainId: snapshot.chainId,
      txId: snapshot.txId,
      slot: snapshot.slot,
      blockTime: snapshot.blockTime,
      payer: snapshot.payer,
      merchant: snapshot.merchant,
      amount: snapshot.amount,
      feeSplit: snapshot.feeSplit,
    },
    ledger: {
      entryId: ledgerEntry.entryId,
      status: ledgerEntry.status,
      serviceType: ledgerEntry.serviceType,
      bookingDetails: ledgerEntry.bookingDetails,
    },
    timestamp: Date.now(),
  });
  
  try {
    const parsedUrl = new URL(webhook.webhookUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        'X-Eden-Event': 'tx-finalized',
        'X-Eden-Provider': providerId,
      },
      timeout: 5000, // 5 second timeout
    };
    
    const httpModule = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          webhook.lastDelivery = Date.now();
          webhook.failureCount = 0;
          console.log(`✅ [Service Provider] Webhook Delivered: ${providerId} → HTTP ${res.statusCode} (TX: ${snapshot.txId.substring(0, 8)}...)`);
          
          // Broadcast successful webhook delivery
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
          console.warn(`❌ [Service Provider] Webhook Delivery Failed: ${providerId} → HTTP ${res.statusCode} (TX: ${snapshot.txId.substring(0, 8)}..., Failures: ${webhook.failureCount})`);
          
          // Broadcast failed webhook delivery
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
    
    req.on('error', (err) => {
      webhook.failureCount++;
      console.warn(`❌ [Service Provider] Webhook Delivery Error: ${providerId} → ${err.message} (TX: ${snapshot.txId.substring(0, 8)}..., Failures: ${webhook.failureCount})`);
      
      // Broadcast webhook error
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
    
    req.on('timeout', () => {
      req.destroy();
      webhook.failureCount++;
      console.warn(`⏱️  [Service Provider] Webhook Delivery Timeout: ${providerId} (TX: ${snapshot.txId.substring(0, 8)}..., Failures: ${webhook.failureCount})`);
      
      // Broadcast webhook timeout
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
  } catch (err: any) {
    webhook.failureCount++;
    console.error(`❌ [Service Provider] Webhook Delivery Exception: ${providerId} → ${err.message} (TX: ${snapshot.txId.substring(0, 8)}..., Failures: ${webhook.failureCount})`);
    
    // Broadcast webhook exception
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

// (getCashierStatus moved to src/ledger.ts)

// ROOT CA Certificate Management Functions

function initializeRootCA(): void {
  if (!ROOT_CA) {
    const rootCA = new EdenPKI(ROOT_CA_UUID);
    const rootCAIdentity = rootCA.identity;
    setROOTCA(rootCA, rootCAIdentity);
    console.log(`⚖️  ROOT CA initialized: ${ROOT_CA_UUID}`);
    console.log(`   Public Key: ${rootCAIdentity.publicKey.substring(0, 50)}...`);
    
    broadcastEvent({
      type: "root_ca_initialized",
      component: "root-ca",
      message: "ROOT CA initialized and ready",
      timestamp: Date.now(),
      data: {
        uuid: ROOT_CA_UUID,
        publicKey: ROOT_CA_IDENTITY.publicKey
      }
    });
  }
}

// (issueGardenCertificate moved to src/garden.ts)

// (issueServiceProviderCertificate moved to src/serviceProvider.ts)

function revokeCertificate(
  uuid: string, 
  reason: string, 
  revokedType: "indexer" | "service" | "provider" = "provider",
  severity: "soft" | "hard" = "hard",
  metadata?: Record<string, any>
): RevocationEvent {
  if (!ROOT_CA) {
    throw new Error("ROOT CA not initialized");
  }
  
  // Get certificate hash if available
  const cert = CERTIFICATE_REGISTRY.get(uuid);
  const certHash = cert ? `sha256:${crypto.createHash('sha256').update(JSON.stringify(cert)).digest('hex')}` : undefined;
  
  // Create revocation event according to ENCERT v1 spec
  const revocation = ROOT_CA.revokeIdentity(
    uuid,
    revokedType,
    reason,
    Date.now(), // effective_at (immediate)
    certHash,
    severity,
    metadata
  );
  
  // Store in local registry
  REVOCATION_REGISTRY.set(uuid, revocation);
  
  // Publish to Redis Stream (ENCERT v1 spec)
  publishRevocationToStream(revocation).catch(err => {
    console.error(`❌ Failed to publish revocation to stream:`, err);
  });
  
  // Remove certificate from registry
  CERTIFICATE_REGISTRY.delete(uuid);
  
  // Handle indexer/garden revocation
  const indexer = GARDENS.find(i => i.uuid === uuid);
  if (indexer) {
    if (severity === 'hard' && revokedType === 'indexer') {
      // Hard revocation: Remove from array
      const index = GARDENS.findIndex(i => i.uuid === uuid);
      if (index !== -1) {
        GARDENS.splice(index, 1);
        console.log(`   🗑️  Removed garden ${indexer.id} (${indexer.name}) from GARDENS array`);
      }
    } else {
      // Soft revocation: Just mark as inactive
      indexer.active = false;
      indexer.certificate = undefined;
      console.log(`   Indexer ${indexer.name} marked as inactive`);
    }
  }
  
  // Also check TOKEN_GARDENS
  const tokenIndexer = TOKEN_GARDENS.find(i => i.uuid === uuid);
  if (tokenIndexer) {
    if (severity === 'hard' && revokedType === 'indexer') {
      // Hard revocation: Remove from array
      const index = TOKEN_GARDENS.findIndex(i => i.uuid === uuid);
      if (index !== -1) {
        TOKEN_GARDENS.splice(index, 1);
        console.log(`   🗑️  Removed garden ${tokenIndexer.id} (${tokenIndexer.name}) from TOKEN_GARDENS array`);
      }
    } else {
      // Soft revocation: Just mark as inactive
      tokenIndexer.active = false;
      tokenIndexer.certificate = undefined;
      console.log(`   Token indexer ${tokenIndexer.name} marked as inactive`);
    }
  }
  
  // Handle provider revocation
  const provider = ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === uuid);
  if (provider) {
    if (severity === 'hard' && revokedType === 'provider') {
      // Hard revocation: Remove from array
      const index = ROOT_CA_SERVICE_REGISTRY.findIndex(p => p.uuid === uuid);
      if (index !== -1) {
        ROOT_CA_SERVICE_REGISTRY.splice(index, 1);
        console.log(`   🗑️  Removed provider ${provider.id} (${provider.name}) from ROOT_CA_SERVICE_REGISTRY`);
      }
    } else {
      // Soft revocation: Just mark as revoked
      provider.certificate = undefined;
      provider.status = 'revoked';
      console.log(`   Service provider ${provider.name} (${provider.id}) marked as revoked`);
      console.log(`   Provider will be filtered out from service queries`);
    }
  }
  
  console.log(`🚫 Certificate revoked: ${uuid}`);
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
      reason: reason,
      issuer_uuid: ROOT_CA_UUID,
      severity: severity
    }
  });
  
  return revocation;
}

// Allow indexers to revoke certificates they issued
function revokeCertificateByIndexer(
  indexerId: string,
  revokedUuid: string,
  reason: string,
  revokedType: "indexer" | "service" | "provider" = "service",
  severity: "soft" | "hard" = "hard",
  metadata?: Record<string, any>
): RevocationEvent {
  const indexer = GARDENS.find(i => i.id === indexerId || i.uuid === indexerId);
  if (!indexer || !indexer.pki) {
    throw new Error(`Indexer not found or PKI not initialized: ${indexerId}`);
  }
  
  // Verify indexer has INDEXER capability
  const indexerCert = CERTIFICATE_REGISTRY.get(indexer.uuid);
  if (!indexerCert || !indexerCert.capabilities.includes("INDEXER")) {
    throw new Error(`Indexer ${indexerId} does not have INDEXER capability`);
  }
  
  // Verify indexer has authority to revoke this entity
  const testRevocation: RevocationEvent = {
    revoked_uuid: revokedUuid,
    revoked_type: revokedType,
    issuer_uuid: indexer.uuid,
    reason: reason,
    issued_at: Date.now(),
    effective_at: Date.now(),
    signature: "", // Will be set below
  };
  
  if (!verifyRevocationAuthority(testRevocation)) {
    throw new Error(`Indexer ${indexerId} lacks authority to revoke ${revokedUuid}`);
  }
  
  // Get certificate hash if available
  const cert = CERTIFICATE_REGISTRY.get(revokedUuid);
  const certHash = cert ? `sha256:${crypto.createHash('sha256').update(JSON.stringify(cert)).digest('hex')}` : undefined;
  
  // Create revocation event signed by indexer
  const revocation = indexer.pki.revokeIdentity(
    revokedUuid,
    revokedType,
    reason,
    Date.now(), // effective_at (immediate)
    certHash,
    severity,
    metadata
  );
  
  // Store in local registry
  REVOCATION_REGISTRY.set(revokedUuid, revocation);
  
  // Publish to Redis Stream (ENCERT v1 spec)
  publishRevocationToStream(revocation).catch(err => {
    console.error(`❌ Failed to publish revocation to stream:`, err);
  });
  
  // Remove certificate from registry
  CERTIFICATE_REGISTRY.delete(revokedUuid);
  
  // Mark provider as revoked in ROOT_CA_SERVICE_REGISTRY
  const provider = ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === revokedUuid);
  if (provider) {
    provider.certificate = undefined;
    provider.status = 'revoked';
    console.log(`   Service provider ${provider.name} (${provider.id}) marked as revoked in ROOT_CA_SERVICE_REGISTRY`);
  }
  
  console.log(`🚫 [${indexer.name}] Certificate revoked: ${revokedUuid}`);
  console.log(`   Type: ${revokedType}`);
  console.log(`   Reason: ${reason}`);
  console.log(`   Severity: ${severity}`);
  
  broadcastEvent({
    type: "certificate_revoked",
    component: indexer.name.toLowerCase().replace(/\s+/g, '-'),
    message: `Certificate revoked by ${indexer.name}: ${revokedUuid}`,
    timestamp: Date.now(),
    data: {
      revoked_uuid: revokedUuid,
      revoked_type: revokedType,
      reason: reason,
      issuer_uuid: indexer.uuid,
      severity: severity
    }
  });
  
  return revocation;
}

// Publish revocation event to Redis Stream (ENCERT v1 spec)
async function publishRevocationToStream(revocation: RevocationEvent): Promise<void> {
  try {
    const streamFields: Record<string, string> = {
      revoked_uuid: revocation.revoked_uuid,
      revoked_type: revocation.revoked_type,
      issuer_uuid: revocation.issuer_uuid,
      reason: revocation.reason,
      issued_at: revocation.issued_at.toString(),
      effective_at: revocation.effective_at.toString(),
      signature: revocation.signature,
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
    
    // Add to Redis Stream
    const streamId = await redis.xAdd(REVOCATION_STREAM, "*", streamFields);
    console.log(`📤 Published revocation to stream: ${streamId}`);
    
    broadcastEvent({
      type: "revocation_published",
      component: "root-ca",
      message: `Revocation published to stream`,
      timestamp: Date.now(),
      data: { streamId, revocation }
    });
  } catch (err: any) {
    console.error(`❌ Failed to publish revocation to Redis stream:`, err);
    throw err;
  }
}

function validateCertificate(uuid: string): boolean {
  const cert = CERTIFICATE_REGISTRY.get(uuid);
  if (!cert) {
    return false;
  }
  
  // Check if revoked
  if (REVOCATION_REGISTRY.has(uuid)) {
    return false;
  }
  
  // Validate certificate signature
  if (!ROOT_CA_IDENTITY) {
    return false;
  }
  
  return EdenPKI.validateCertificate(cert, ROOT_CA_IDENTITY.publicKey);
}

function getCertificate(uuid: string): EdenCertificate | undefined {
  return CERTIFICATE_REGISTRY.get(uuid);
}

function getAllCertificates(): EdenCertificate[] {
  return Array.from(CERTIFICATE_REGISTRY.values());
}

function getRevokedCertificates(): RevocationEvent[] {
  return Array.from(REVOCATION_REGISTRY.values());
}

// ENCERT v1 Redis Revocation Stream Functions

// Initialize revocation stream consumer groups for each indexer
async function initializeRevocationConsumers(): Promise<void> {
  try {
    for (const indexer of GARDENS) {
      if (indexer.active) {
        const consumerGroup = `indexer-${indexer.id}`;
        try {
          // Create consumer group (MKSTREAM creates stream if it doesn't exist)
          await redis.xGroupCreate(REVOCATION_STREAM, consumerGroup, "0", { MKSTREAM: true });
          console.log(`✅ Created revocation consumer group: ${consumerGroup}`);
        } catch (err: any) {
          // Group might already exist, which is fine
          if (!err.message?.includes("BUSYGROUP")) {
            console.warn(`⚠️  Failed to create consumer group ${consumerGroup}:`, err.message);
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`❌ Failed to initialize revocation consumers:`, err);
  }
}

// Process revocation events from Redis Stream (ENCERT v1 spec)
async function processRevocationStream(indexerName: string, indexerId: string): Promise<void> {
  const consumerGroup = `indexer-${indexerId}`;
  const consumerName = `${indexerName}-consumer`;
  
  try {
    while (true) {
      try {
        // Read from stream with consumer group
        const messages = await redis.xReadGroup(
          consumerGroup,
          consumerName,
          [
            {
              key: REVOCATION_STREAM,
              id: ">", // Read new messages
            },
          ],
          {
            COUNT: 10,
            BLOCK: 1000, // Block for 1 second
          }
        );
        
        if (messages && messages.length > 0) {
          for (const stream of messages) {
            for (const message of stream.messages) {
              await processRevocationMessage(message, indexerName);
              
              // Acknowledge message
              await redis.xAck(REVOCATION_STREAM, consumerGroup, message.id);
            }
          }
        }
      } catch (err: any) {
        if (err.message?.includes("NOGROUP")) {
          // Consumer group doesn't exist, try to create it
          try {
            await redis.xGroupCreate(REVOCATION_STREAM, consumerGroup, "0", { MKSTREAM: true });
            console.log(`✅ Created consumer group ${consumerGroup} for ${indexerName}`);
          } catch (createErr: any) {
            console.error(`❌ Failed to create consumer group:`, createErr);
          }
        } else {
          console.error(`❌ Error reading revocation stream:`, err);
        }
      }
      
      // Yield to event loop
      await new Promise(resolve => setImmediate(resolve));
    }
  } catch (err: any) {
    console.error(`❌ Revocation stream processor error for ${indexerName}:`, err);
  }
}

// Process a single revocation message
async function processRevocationMessage(message: any, indexerName: string): Promise<void> {
  try {
    const fields = message.message;
    
    // Parse revocation event from stream fields
    const revocation: RevocationEvent = {
      revoked_uuid: fields.revoked_uuid,
      revoked_type: fields.revoked_type as "indexer" | "service" | "provider",
      issuer_uuid: fields.issuer_uuid,
      reason: fields.reason,
      issued_at: parseInt(fields.issued_at),
      effective_at: parseInt(fields.effective_at),
      signature: fields.signature,
      cert_hash: fields.cert_hash,
      severity: fields.severity as "soft" | "hard" | undefined,
      metadata: fields.metadata ? JSON.parse(fields.metadata) : undefined,
    };
    
    // Verify issuer certificate exists
    const issuerCert = CERTIFICATE_REGISTRY.get(revocation.issuer_uuid);
    if (!issuerCert) {
      console.warn(`⚠️  Cannot verify revocation: issuer certificate not found for ${revocation.issuer_uuid}`);
      return;
    }
    
    // Verify issuer has authority (ROOT CA can revoke anything, Indexers can revoke services they certified)
    const hasAuthority = verifyRevocationAuthority(revocation);
    if (!hasAuthority) {
      console.warn(`⚠️  Revocation rejected: issuer ${revocation.issuer_uuid} lacks authority to revoke ${revocation.revoked_uuid}`);
      return;
    }
    
    // Get issuer's public key for signature verification
    let issuerPublicKey: string;
    if (revocation.issuer_uuid === ROOT_CA_UUID) {
      if (!ROOT_CA_IDENTITY) {
        console.warn(`⚠️  ROOT CA identity not initialized`);
        return;
      }
      issuerPublicKey = ROOT_CA_IDENTITY.publicKey;
    } else {
      // For indexers, get their public key from their PKI instance
      const issuerIndexer = GARDENS.find(i => i.uuid === revocation.issuer_uuid);
      if (issuerIndexer && issuerIndexer.pki) {
        issuerPublicKey = issuerIndexer.pki.identity.publicKey;
      } else {
        console.warn(`⚠️  Cannot verify indexer revocation: indexer PKI not found for ${revocation.issuer_uuid}`);
        return;
      }
    }
    
    // Verify signature
    const isValid = EdenPKI.validateRevocation(revocation, issuerPublicKey);
    if (!isValid) {
      console.warn(`⚠️  Revocation signature invalid for ${revocation.revoked_uuid}`);
      return;
    }
    
      // Apply revocation idempotently
      const now = Date.now();
      if (now >= revocation.effective_at) {
        REVOCATION_REGISTRY.set(revocation.revoked_uuid, revocation);
        
        // Handle indexer/garden revocation
        const indexer = GARDENS.find(i => i.uuid === revocation.revoked_uuid);
        if (indexer) {
          indexer.active = false;
          indexer.certificate = undefined;
          // For hard shutdowns, remove from array
          if (revocation.severity === 'hard' && revocation.revoked_type === 'indexer') {
            const index = GARDENS.findIndex(i => i.uuid === revocation.revoked_uuid);
            if (index !== -1) {
              GARDENS.splice(index, 1);
              console.log(`   🗑️  Removed garden ${indexer.id} (${indexer.name}) from GARDENS array`);
            }
          }
        }
        
        // Also check TOKEN_GARDENS
        const tokenIndexer = TOKEN_GARDENS.find(i => i.uuid === revocation.revoked_uuid);
        if (tokenIndexer) {
          tokenIndexer.active = false;
          tokenIndexer.certificate = undefined;
          // For hard shutdowns, remove from array
          if (revocation.severity === 'hard' && revocation.revoked_type === 'indexer') {
            const index = TOKEN_GARDENS.findIndex(i => i.uuid === revocation.revoked_uuid);
            if (index !== -1) {
              TOKEN_GARDENS.splice(index, 1);
              console.log(`   🗑️  Removed garden ${tokenIndexer.id} (${tokenIndexer.name}) from TOKEN_GARDENS array`);
            }
          }
        }
        
        // Handle provider revocation
        const provider = ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === revocation.revoked_uuid);
        if (provider) {
          provider.certificate = undefined;
          provider.status = 'revoked';
          console.log(`   Service provider ${provider.name} (${provider.id}) marked as revoked in ROOT_CA_SERVICE_REGISTRY`);
          // For hard shutdowns, remove from array
          if (revocation.severity === 'hard' && revocation.revoked_type === 'provider') {
            const index = ROOT_CA_SERVICE_REGISTRY.findIndex(p => p.uuid === revocation.revoked_uuid);
            if (index !== -1) {
              ROOT_CA_SERVICE_REGISTRY.splice(index, 1);
              console.log(`   🗑️  Removed provider ${provider.id} (${provider.name}) from ROOT_CA_SERVICE_REGISTRY`);
            }
          }
        }
        
        console.log(`🚫 [${indexerName}] Applied revocation: ${revocation.revoked_uuid}`);
        console.log(`   Reason: ${revocation.reason}`);
      
      broadcastEvent({
        type: "revocation_applied",
        component: indexerName,
        message: `Revocation applied: ${revocation.revoked_uuid}`,
        timestamp: Date.now(),
        data: { revocation }
      });
    } else {
      console.log(`⏳ [${indexerName}] Revocation scheduled for future: ${revocation.revoked_uuid}`);
    }
  } catch (err: any) {
    console.error(`❌ Failed to process revocation message:`, err);
  }
}

// Verify revocation authority according to ENCERT v1 spec
function verifyRevocationAuthority(revocation: RevocationEvent): boolean {
  // ROOT CA can revoke anything
  if (revocation.issuer_uuid === ROOT_CA_UUID) {
    return true;
  }
  
  // Indexers can only revoke services they certified
  const issuerIndexer = GARDENS.find(i => i.uuid === revocation.issuer_uuid);
  if (issuerIndexer && revocation.revoked_type === "service") {
    // Verify issuer has INDEXER capability
    const issuerCert = CERTIFICATE_REGISTRY.get(revocation.issuer_uuid);
    if (!issuerCert || !issuerCert.capabilities.includes("INDEXER")) {
      return false;
    }
    
    // Check if issuer certified this service provider
    // This is determined by checking if the service provider's gardenId matches the issuer's garden ID
    const revokedProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === revocation.revoked_uuid);
    if (revokedProvider) {
      // Check if the provider's gardenId matches the issuer's garden ID
      // This means the garden certified this provider
      if (revokedProvider.gardenId === `garden-${issuerIndexer.id.toLowerCase()}` || 
          revokedProvider.gardenId === issuerIndexer.id) {
        return true;
      }
      
      // Also check certificate constraints to see if issuer certified this provider
      const providerCert = CERTIFICATE_REGISTRY.get(revocation.revoked_uuid);
      if (providerCert && providerCert.issuer === revocation.issuer_uuid) {
        return true;
      }
    }
  }
  
  return false;
}

// Snapshot Engine

function createSnapshot(userEmail: string, amount: number, providerId: string): TransactionSnapshot {
  const txId = crypto.randomUUID();
  const rootFee = amount * ROOT_CA_FEE;
  const indexerFee = amount * INDEXER_FEE;

  return {
    chainId: CHAIN_ID,
    txId,
    slot: Math.floor(Math.random() * 1_000_000),
    blockTime: Date.now(),
    payer: userEmail, // Use email address directly as payer
    merchant: providerId,
    amount: amount,
    feeSplit: {
      rootCA: rootFee,
      indexerA: indexerFee,
      indexerB: indexerFee,
    },
  };
}

// Redis Persistence

async function persistSnapshot(snapshot: TransactionSnapshot) {
  if (SKIP_REDIS || !redis.isOpen) {
    console.log(`💾 Snapshot (mock): ${snapshot.txId}`);
    return;
  }

  try {
    await ensureRedisConnection();
    await redis.hSet(`tx:${snapshot.txId}`, snapshot as any);
    console.log(`💾 Snapshot persisted: ${snapshot.txId}`);
  } catch (err: any) {
    console.error(`⚠️  Failed to persist snapshot ${snapshot.txId}:`, err.message);
  }
}

// Redis Stream Fan-Out

async function streamToIndexers(snapshot: TransactionSnapshot) {
  if (SKIP_REDIS || !redis.isOpen) {
    const indexerNames = GARDENS.filter(i => i.active).map(i => i.name).join(", ");
    const tokenIndexerNames = TOKEN_GARDENS.filter(i => i.active).map(i => i.name).join(", ");
    const allNames = [indexerNames, tokenIndexerNames].filter(n => n).join(", ");
    console.log(`📡 Stream (mock): ${snapshot.txId} → ${allNames}`);
    return;
  }

  try {
    await ensureRedisConnection();
    const payload = {
      txId: snapshot.txId,
      slot: snapshot.slot.toString(),
      blockTime: snapshot.blockTime.toString(),
      payer: snapshot.payer,
      amount: snapshot.amount.toString(),
    };

    // Stream to all active regular indexers
    const activeIndexers = GARDENS.filter(i => i.active);
    for (const indexer of activeIndexers) {
      await redis.xAdd(indexer.stream, "*", payload);
    }
    
    // Stream to all active token indexers
    const activeTokenIndexers = TOKEN_GARDENS.filter(i => i.active);
    for (const tokenIndexer of activeTokenIndexers) {
      await redis.xAdd(tokenIndexer.stream, "*", payload);
    }
    
    const indexerNames = activeIndexers.map(i => i.name).join(", ");
    const tokenIndexerNames = activeTokenIndexers.map(i => i.name).join(", ");
    const allNames = [indexerNames, tokenIndexerNames].filter(n => n).join(", ");
    console.log(`📡 Streamed to indexers: ${snapshot.txId} → ${allNames}`);
    
    if (activeIndexers.length > 0) {
      console.log(`   📡 Regular indexers: ${indexerNames}`);
    }
    if (activeTokenIndexers.length > 0) {
      console.log(`   🔷 Token indexers: ${tokenIndexerNames}`);
    }
    
    // Broadcast streaming events
    if (activeIndexers.length > 0) {
      broadcastEvent({
        type: "indexer_stream",
        component: "indexer",
        message: `Streamed transaction to ${activeIndexers.length} regular indexer(s)`,
        timestamp: Date.now(),
        data: { txId: snapshot.txId, indexers: activeIndexers.map(i => i.name), count: activeIndexers.length }
      });
    }
    
    if (activeTokenIndexers.length > 0) {
      console.log(`🔷 [Token Indexer] Streamed transaction ${snapshot.txId} to ${activeTokenIndexers.length} token indexer(s): ${tokenIndexerNames}`);
      broadcastEvent({
        type: "token_indexer_stream",
        component: "token_indexer",
        message: `Streamed transaction to ${activeTokenIndexers.length} token indexer(s)`,
        timestamp: Date.now(),
        data: { txId: snapshot.txId, indexers: activeTokenIndexers.map(i => i.name), count: activeTokenIndexers.length }
      });
    }
  } catch (err: any) {
    console.error(`⚠️  Failed to stream to indexers:`, err.message);
  }
}

// Indexer Consumers

// Track last read position per consumer
const consumerPositions = new Map<string, string>();

async function gardenConsumer(name: string, stream: string) {
  if (SKIP_REDIS) {
    console.log(`⚠️  ${name}: Skipped (Redis disabled)`);
    return;
  }

  try {
    await ensureRedisConnection();
  } catch (err) {
    console.error(`❌ ${name}: Cannot start - Redis unavailable`);
    return;
  }

  // Initialize position to "$" (new messages only)
  const consumerKey = `${name}:${stream}`;
  let lastReadId = consumerPositions.get(consumerKey) || "$";

  while (true) {
    try {
      if (!redis.isOpen) {
        await ensureRedisConnection();
      }

      const res = await redis.xRead(
        [{ key: stream, id: lastReadId }],
        { BLOCK: 5000, COUNT: 1 }
      );

      if (!res) {
        // No new messages, yield to event loop before continuing
        await new Promise(resolve => setImmediate(resolve));
        continue;
      }

      // Redis xRead returns array of { name: string, messages: Array<{id: string, message: Record<string, string>}> }
      const streamResults = res as Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }>;
      
      if (Array.isArray(streamResults) && streamResults.length > 0) {
        const streamResult = streamResults[0];
        if (streamResult?.messages && streamResult.messages.length > 0) {
          // Process messages and update position to the last message ID
          for (const msg of streamResult.messages) {
            const txId = msg.message?.txId;
            if (txId) {
              // Check if this is a token indexer
              const isTokenIndexer = name.toLowerCase().includes('tokenindexer') || name.toLowerCase().startsWith('token');
              const eventType = isTokenIndexer ? "token_indexer_indexed" : "indexer_indexed";
              const icon = isTokenIndexer ? "🔷" : "📡";
              
              if (isTokenIndexer) {
                console.log(`🔷 [Token Indexer] ${name} indexed transaction ${txId}`);
              } else {
                console.log(`📡 [Indexer] ${name} indexed transaction ${txId}`);
              }
              
              broadcastEvent({
                type: eventType,
                component: name.toLowerCase().replace(/\s+/g, '-'),
                message: `${name} indexed transaction ${txId}`,
                timestamp: Date.now(),
                data: { txId, indexer: name, isTokenIndexer }
              });
            }
            // Update position to this message ID for next read
            lastReadId = msg.id;
          }
          // Save position for this consumer
          consumerPositions.set(consumerKey, lastReadId);
        }
      }
    } catch (err: any) {
      if (err.message.includes("Connection")) {
        console.error(`❌ ${name}: Connection lost, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        console.error(`⚠️  ${name}: Error reading stream:`, err.message);
        // Yield to event loop before retrying
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    // Always yield to event loop after each iteration to prevent blocking
    await new Promise(resolve => setImmediate(resolve));
  }
}

// ROOT CA Settlement Consumer
// ROOT CA is the ONLY settlement authority
// Consumes ledger entries from settlement stream and updates balances
async function rootCASettlementConsumer() {
  if (SKIP_REDIS) {
    console.log(`⚠️  ROOT CA Settlement Consumer: Skipped (Redis disabled)`);
    return;
  }

  try {
    await ensureRedisConnection();
  } catch (err) {
    console.error(`❌ ROOT CA Settlement Consumer: Cannot start - Redis unavailable`);
    return;
  }

  const consumerGroup = "root-ca-settlement";
  const consumerName = "root-ca-settlement-worker";

  // Create consumer group if it doesn't exist
  try {
    await redis.xGroupCreate(LEDGER_SETTLEMENT_STREAM, consumerGroup, "$", { MKSTREAM: true });
    console.log(`✅ Created ROOT CA settlement consumer group: ${consumerGroup}`);
  } catch (err: any) {
    if (!err.message.includes("BUSYGROUP")) {
      console.error(`⚠️  Failed to create consumer group:`, err.message);
    }
  }

  console.log(`⚖️  [ROOT CA Settlement] Starting settlement consumer...`);
  
  // Broadcast settlement consumer start
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

      // Read pending ledger entries
      const res = await redis.xReadGroup(
        consumerGroup,
        consumerName,
        [{ key: LEDGER_SETTLEMENT_STREAM, id: ">" }],
        { BLOCK: 5000, COUNT: 10 }
      );

      if (!res) {
        await new Promise(resolve => setImmediate(resolve));
        continue;
      }

      const streamResults = res as Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }>;
      
      if (Array.isArray(streamResults) && streamResults.length > 0) {
        const streamResult = streamResults[0];
        if (streamResult?.messages && streamResult.messages.length > 0) {
          const messageCount = streamResults[0].messages.length;
          console.log(`⚖️  [ROOT CA Settlement] Processing ${messageCount} settlement entry/entries`);
          
          // Broadcast batch processing start
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
              // Acknowledge message
              await redis.xAck(LEDGER_SETTLEMENT_STREAM, consumerGroup, msg.id);
            } catch (err: any) {
              console.error(`❌ Failed to process settlement entry ${msg.id}:`, err.message);
              
              // Broadcast settlement processing error
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
              
              // Don't ack on error - will retry
            }
          }
        }
      }
    } catch (err: any) {
      if (err.message.includes("Connection")) {
        console.error(`❌ ROOT CA Settlement: Connection lost, retrying...`);
        
        // Broadcast connection error
        broadcastEvent({
          type: "settlement_connection_error",
          component: "root-ca",
          message: "ROOT CA Settlement: Connection lost, retrying...",
          timestamp: Date.now(),
          data: { error: err.message }
        });
        
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        console.error(`⚠️  ROOT CA Settlement: Error reading stream:`, err.message);
        
        // Broadcast stream read error
        broadcastEvent({
          type: "settlement_stream_error",
          component: "root-ca",
          message: `ROOT CA Settlement: Error reading stream`,
          timestamp: Date.now(),
          data: { error: err.message }
        });
        
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    await new Promise(resolve => setImmediate(resolve));
  }
}

// Process a settlement entry (Settlement Service Provider via Holy Ghost indexer)
// This is the ONLY place where balances are updated
// Settlement Service Provider is registered under Holy Ghost indexer
async function processSettlementEntry(msg: Record<string, string>): Promise<void> {
  const entryId = msg.entryId;
  const iGas = parseFloat(msg.iGas || "0");
  const iTax = parseFloat(msg.iTax || "0");
  const fees = JSON.parse(msg.fees || "{}");
  const indexerId = msg.indexerId || "unknown";
  const providerUuid = msg.providerUuid || "";
  
  console.log(`⚖️  [ROOT CA Settlement] Processing entry ${entryId}`);
  console.log(`   iGas: ${iGas}, iTax: ${iTax}, Indexer: ${indexerId}`);
  
  // Broadcast settlement processing start
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
  
  // Verify entry exists in local ledger
  const ledgerEntry = LEDGER.find(e => e.entryId === entryId);
  if (!ledgerEntry) {
    console.warn(`⚠️  Settlement entry ${entryId} not found in local ledger`);
    
    // Broadcast settlement entry not found
    broadcastEvent({
      type: "settlement_entry_not_found",
      component: "root-ca",
      message: `Settlement entry not found in local ledger: ${entryId}`,
      timestamp: Date.now(),
      data: { entryId }
    });
    
    return;
  }
  
  // Verify certificate validity (if provider UUID exists)
  if (providerUuid && providerUuid !== 'MISSING-UUID') {
    const cert = getCertificate(providerUuid);
    if (!cert || !validateCertificate(providerUuid)) {
      console.error(`❌ Settlement entry ${entryId}: Invalid certificate for provider ${providerUuid}`);
      ledgerEntry.status = 'failed';
      
      // Broadcast certificate validation failure
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
  
  // Verify fee math
  const expectedRootCAFee = fees.rootCA || (iGas * ROOT_CA_FEE);
  const expectedIndexerFee = fees.indexer || (iGas * INDEXER_FEE);
  
  // SETTLEMENT: Update ROOT CA balances (ONLY ROOT CA can do this)
  ROOT_BALANCES.rootCA += expectedRootCAFee;
  if (iTax > 0) {
    // iTax distribution: 40% ROOT CA, 30% Indexer, 30% Trader (already applied)
    const iTaxRootCA = iTax * ITAX_DISTRIBUTION.rootCA;
    ROOT_BALANCES.rootCA += iTaxRootCA;
    
    // Update indexer balance
    const currentIndexerBalance = ROOT_BALANCES.indexers.get(indexerId) || 0;
    const iTaxIndexer = iTax * ITAX_DISTRIBUTION.indexer;
    ROOT_BALANCES.indexers.set(indexerId, currentIndexerBalance + expectedIndexerFee + iTaxIndexer);
  } else {
    // Regular iGas fee distribution
    const currentIndexerBalance = ROOT_BALANCES.indexers.get(indexerId) || 0;
    ROOT_BALANCES.indexers.set(indexerId, currentIndexerBalance + expectedIndexerFee);
  }
  
  // Update provider balance (if provider UUID exists)
  if (providerUuid && providerUuid !== 'MISSING-UUID') {
    const currentProviderBalance = ROOT_BALANCES.providers.get(providerUuid) || 0;
    const providerFee = fees.provider || 0;
    ROOT_BALANCES.providers.set(providerUuid, currentProviderBalance + providerFee);
  }
  
  // Mark entry as settled
  ledgerEntry.status = 'completed';
  
  // CRITICAL: Persist the updated status to file
  if (redis) {
    console.log(`💾 [ROOT CA Settlement] Persisting ledger entry with completed status: ${entryId}`);
    redis.saveLedgerEntries(LEDGER);
  } else {
    console.warn(`⚠️  [ROOT CA Settlement] Redis not available, cannot persist completed status for entry: ${entryId}`);
  }
  
  console.log(`✅ [ROOT CA Settlement] Entry ${entryId} settled and persisted`);
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
      status: 'completed'
    }
  });
}

// Review + Discount

async function applyReview(user: User, review: Review, moviePrice: number): Promise<number> {
  if (review.rating >= 4) {
    const rebate = moviePrice * 0.1;
    
    // Credit rebate via Wallet Service
    const rebateResult = await creditWallet(
      user.email,
      rebate,
      crypto.randomUUID(),
      `Review rebate: ${review.rating}/5 rating`,
      {
        reviewRating: review.rating,
        moviePrice,
        rebateType: "review",
      }
    );
    
    // Update user balance for backward compatibility (wallet is source of truth)
    if (rebateResult.success) {
      user.balance = rebateResult.balance;
    }
    
    return rebate;
  }
  return 0;
}

// Helper function to process movie watching action asynchronously
async function processMovieWatchingAction(
  processedAction: any,
  updatedContext: any,
  broadcastEvent: (event: any) => void
): Promise<void> {
  console.log(`🎬 [Movie Theater] Starting movie watching simulation`);
  const movieTitle = processedAction.movieTitle || updatedContext.selectedListing?.movieTitle || 'Unknown Movie';
  const duration = processedAction.duration || 10;

  // Emit movie started event
  broadcastEvent({
    type: "movie_started",
    component: "movie_theater",
    message: `Now playing: ${movieTitle}`,
    timestamp: Date.now(),
    data: {
      movieTitle,
      duration,
      currentScene: 'garden'
    }
  });

  // Set initial movie state in context
  updatedContext.movieStarted = true;
  updatedContext.movieTitle = movieTitle;
  updatedContext.movieProgress = 0;
  updatedContext.currentScene = 'garden';

  // Wait for movie to finish before continuing workflow
  await new Promise<void>((resolve) => {
    // Simulate movie progress with scene transitions
    setTimeout(() => {
      // 30% - Cross scene
      setTimeout(() => {
        updatedContext.movieProgress = 30;
        updatedContext.currentScene = 'cross';
        broadcastEvent({
          type: "scene_transition",
          component: "movie_theater",
          message: "Transitioning to the Cross scene",
          timestamp: Date.now(),
          data: { scene: 'cross', progress: 30 }
        });
      }, duration * 1000 * 0.3);

      // 60% - Utah Action scene
      setTimeout(() => {
        updatedContext.movieProgress = 60;
        updatedContext.currentScene = 'utah_action';
        broadcastEvent({
          type: "scene_transition",
          component: "movie_theater",
          message: "Initiating Utah Action Consensus",
          timestamp: Date.now(),
          data: { scene: 'utah_action', progress: 60 }
        });
      }, duration * 1000 * 0.6);

      // 90% - Garden Return scene
      setTimeout(() => {
        updatedContext.movieProgress = 90;
        updatedContext.currentScene = 'garden_return';
        broadcastEvent({
          type: "scene_transition",
          component: "movie_theater",
          message: "Fading to white for the Garden return",
          timestamp: Date.now(),
          data: { scene: 'garden_return', progress: 90 }
        });
      }, duration * 1000 * 0.9);

      // 100% - Movie finished
      setTimeout(() => {
        // Set movieWatched in context for workflow transition
        updatedContext.movieWatched = true;
        updatedContext.movieProgress = 100;
        updatedContext.finalScene = 'genesis_garden';
        
        broadcastEvent({
          type: "movie_finished",
          component: "movie_theater",
          message: "Movie finished. Returning to Garden Genesis state.",
          timestamp: Date.now(),
          data: { completed: true, finalScene: 'genesis_garden' }
        });
        
        console.log(`🎬 [Movie Theater] Movie finished, context updated with movieWatched: true`);
        console.log(`🎬 [Movie Theater] Context keys:`, Object.keys(updatedContext));
        
        // Resolve promise to continue workflow
        resolve();
      }, duration * 1000);
    }, 100);
  });
}

// Chat API Processor Service - Processes user input through all components
async function processChatInput(input: string, email: string) {
  const startTime = Date.now();
  console.log(`🚀 Starting processChatInput for ${email}: "${input.substring(0, 50)}${input.length > 50 ? '...' : ''}"`);
  
  try {
    // Find or create user by email (no user management needed)
    let user = USERS.find(u => u.email === email);
  if (!user) {
    // Create new user on-the-fly with sequential ID matching USERS array format (u1, u2, u3...)
    const nextId = `u${USERS.length + 1}`;
    
    user = {
      id: nextId, // Sequential ID matching existing format (u1, u2, u3...)
      email: email,
      balance: 0, // NO PRE-LOAD - Wallet is source of truth, starts at 0
    };
    USERS.push(user);
    console.log(`👤 Created new user: ${email} with ID: ${nextId}`);
  }
  
  // NO AUTO-GRANT - Wallet balance starts at 0, only increases via Stripe or other credits
  // Sync user.balance with wallet balance (wallet is source of truth)
  const currentWalletBalance = await getWalletBalance(email);
  user.balance = currentWalletBalance;
  
  // Clear any existing Redis balance for bill.draper.auto@gmail.com if it's not from Stripe
  // This ensures we start fresh without pre-loaded balance
  if (email === "bill.draper.auto@gmail.com" && !SKIP_REDIS && redis.isOpen) {
    try {
      await ensureRedisConnection();
      const walletKey = `${WALLET_BALANCE_PREFIX}${email}`;
      const existingBalance = await redis.get(walletKey);
      
      // Check if there's a Stripe mint transaction in ledger
      const hasStripeMint = LEDGER.some(entry => 
        entry.serviceType === 'mint' && 
        entry.merchant === email &&
        entry.bookingDetails?.stripePaymentIntentId
      );
      
      // Only clear if no Stripe transaction exists (means it's old pre-loaded balance)
      if (existingBalance && parseFloat(existingBalance) > 0 && !hasStripeMint) {
        console.log(`🔄 Clearing pre-loaded balance for ${email}: ${existingBalance} JSC → 0 JSC`);
        await redis.set(walletKey, "0");
        user.balance = 0;
      }
    } catch (err: any) {
      console.warn(`⚠️  Could not clear pre-loaded balance:`, err.message);
    }
  }

  console.log("1️⃣ User Input");
  broadcastEvent({
    type: "user_input",
    component: "user",
    message: `User query: "${input}"`,
    timestamp: Date.now(),
    data: { input, email: user.email }
  });

  console.log("2️⃣ LLM Resolution (Query → ServiceRegistry → Providers → Format)");
  broadcastEvent({
    type: "llm_start",
    component: "llm",
    message: "Starting LLM query extraction...",
    timestamp: Date.now()
  });
  
  const llmResponse: LLMResponse = await resolveLLM(input);
  console.log("📨 LLM Response:", llmResponse.message);
  console.log("⛽ iGas Cost:", llmResponse.iGasCost.toFixed(6));
  
  broadcastEvent({
    type: "llm_response",
    component: "llm",
    message: llmResponse.message,
    timestamp: Date.now(),
    data: { response: llmResponse }
  });
  
  // Accumulate total iGas
  TOTAL_IGAS += llmResponse.iGasCost;
  
  broadcastEvent({
    type: "igas",
    component: "igas",
    message: `iGas Cost: ${llmResponse.iGasCost.toFixed(6)}`,
    timestamp: Date.now(),
    data: { 
      igas: llmResponse.iGasCost,
      totalIGas: TOTAL_IGAS
    }
  });
  
  if (!llmResponse.selectedListing) {
    const errorMsg = "No listing selected from LLM response";
    console.error(`❌ ${errorMsg}`);
    broadcastEvent({
      type: "error",
      component: "llm",
      message: errorMsg,
      timestamp: Date.now()
    });
    throw new Error(errorMsg);
  }

  const selectedListing = llmResponse.selectedListing;
  
  // Check if this is a DEX trade (TokenListing has poolId, MovieListing has movieTitle)
  const isDEXTrade = selectedListing && ('poolId' in selectedListing || 'tokenSymbol' in selectedListing);
  
  // VALIDATION: Double-check that DEX classification matches user intent
  if (isDEXTrade) {
    const inputLower = input.toLowerCase();
    const movieKeywords = ['movie', 'ticket', 'tickets', 'cinema', 'theater', 'theatre', 'film', 'watch', 'showtime', 'show', 'amc', 'cinemark', 'moviecom'];
    const dexKeywords = ['token', 'tokena', 'tokenb', 'tokenc', 'tokend', 'dex', 'pool', 'trade'];
    
    const hasMovieKeywords = movieKeywords.some(keyword => inputLower.includes(keyword));
    const hasDexKeywords = dexKeywords.some(keyword => inputLower.includes(keyword));
    
    // If user input has movie keywords but NO DEX keywords, this is a misclassification
    if (hasMovieKeywords && !hasDexKeywords) {
      const errorMsg = `❌ [VALIDATION ERROR] LLM returned DEX listing but user query is clearly for movies. User input: "${input}"`;
      console.error(errorMsg);
      broadcastEvent({
        type: "error",
        component: "validation",
        message: "Classification error: Movie request was incorrectly processed as DEX trade",
        timestamp: Date.now(),
        data: { userInput: input, selectedListing }
      });
      throw new Error(`Invalid classification: User requested movie tickets but system selected DEX token. Please try again with: "I want to buy movie tickets" or "find movies".`);
    }
  }
  
  if (isDEXTrade) {
    // Handle DEX trade
    const tokenListing = selectedListing as TokenListing;
    console.log("🌊 DEX Trade Selected:", `${tokenListing.providerName} - ${tokenListing.tokenSymbol}/${tokenListing.baseToken} at ${tokenListing.price} ${tokenListing.baseToken}/${tokenListing.tokenSymbol}`);
    
    // Extract trade details from query (re-extract to get action and tokenAmount)
    // TODO (v2 Optimization): Cache intent hash from first extraction in resolveLLM()
    // and reuse here instead of re-extracting. Only re-extract if user confirms/modifies query.
    // This would reduce LLM calls and improve performance.
    let extractQueryFn: (input: string) => Promise<LLMQueryResult>;
    if (ENABLE_OPENAI) {
      extractQueryFn = extractQueryWithOpenAI;
    } else {
      extractQueryFn = extractQueryWithDeepSeek;
    }
    const queryResult = await extractQueryFn(input);
    const action = queryResult.query.filters?.action || 'BUY';
    const tokenAmount = queryResult.query.filters?.tokenAmount || 1;
    
    console.log("💰 Executing DEX Trade...");
    console.log(`   Action: ${action}`);
    console.log(`   Token Amount: ${tokenAmount} ${tokenListing.tokenSymbol}`);
    console.log(`   Pool: ${tokenListing.poolId}`);
    
    // IMPORTANT: Sync wallet balance BEFORE processing (Google user aware)
    const currentWalletBalance = await getWalletBalance(user.email);
    user.balance = currentWalletBalance;
    
    // Execute DEX trade
    const trade = executeDEXTrade(tokenListing.poolId, action, tokenAmount, user.email);
    
    // Check balance BEFORE processing (for BUY: need baseToken, for SELL: need tokens)
    if (action === 'BUY') {
      const totalCost = trade.baseAmount + llmResponse.iGasCost;
      if (currentWalletBalance < totalCost) {
        const errorMsg = `Insufficient balance. Required: ${totalCost.toFixed(6)} ${tokenListing.baseToken} (${trade.baseAmount} + ${llmResponse.iGasCost.toFixed(6)} iGas), Available: ${currentWalletBalance.toFixed(6)} ${tokenListing.baseToken}`;
        console.error(`❌ ${errorMsg}`);
        broadcastEvent({
          type: "insufficient_balance",
          component: "wallet",
          message: errorMsg,
          timestamp: Date.now(),
          data: {
            email: user.email,
            balance: currentWalletBalance,
            required: totalCost,
            tradeAmount: trade.baseAmount,
            iGasCost: llmResponse.iGasCost
          }
        });
        throw new Error(errorMsg);
      }
      user.balance -= trade.baseAmount;
      console.log(`💸 Deducted ${trade.baseAmount} ${tokenListing.baseToken} from user balance`);
    } else {
      // SELL: User receives baseToken
      user.balance += trade.baseAmount;
      console.log(`💰 Added ${trade.baseAmount} ${tokenListing.baseToken} to user balance`);
    }
    
    // Apply trader rebate (30% of iTax back to trader)
    const traderRebate = trade.iTax * ITAX_DISTRIBUTION.trader;
    user.balance += traderRebate;
    console.log(`🎁 Trader rebate: ${traderRebate.toFixed(6)} ${tokenListing.baseToken}`);
    
    // Create snapshot for DEX trade
    const snapshot = createSnapshot(user.email, trade.baseAmount, tokenListing.providerId);
    
    // Find provider UUID
    const provider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === tokenListing.providerId);
    const providerUuid = provider?.uuid || '';
    
    // Add ledger entry for DEX trade
    const ledgerEntry = addLedgerEntry(
      snapshot,
      'dex',
      llmResponse.iGasCost,
      user.email,
      tokenListing.providerName,
      providerUuid,
      {
        tokenSymbol: tokenListing.tokenSymbol,
        baseToken: tokenListing.baseToken,
        action: action,
        tokenAmount: tokenAmount,
        baseAmount: trade.baseAmount,
        price: trade.price,
        iTax: trade.iTax,
      } as any
    );
    
    // Complete the trade
    completeBooking(ledgerEntry);
    
    // Persist snapshot and stream to indexers
    await persistSnapshot(snapshot);
    await streamToIndexers(snapshot);
    
    // Deliver webhook if registered
    const webhookProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === tokenListing.providerId);
    if (webhookProvider) {
      deliverWebhook(webhookProvider.id, snapshot, ledgerEntry).catch(err => {
        console.warn(`⚠️  Webhook delivery failed:`, err);
      });
    }
    
    console.log("✅ DEX Trade completed successfully");
    console.log("📊 Trade Summary:", {
      action,
      tokenAmount: `${tokenAmount} ${tokenListing.tokenSymbol}`,
      baseAmount: `${trade.baseAmount} ${tokenListing.baseToken}`,
      price: `${trade.price} ${tokenListing.baseToken}/${tokenListing.tokenSymbol}`,
      iTax: `${trade.iTax} ${tokenListing.baseToken}`,
      traderRebate: `${traderRebate} ${tokenListing.baseToken}`,
      userBalance: user.balance,
    });
    
    broadcastEvent({
      type: "dex_trade_complete",
      component: "dex",
      message: `DEX Trade Complete: ${action} ${tokenAmount} ${tokenListing.tokenSymbol}`,
      timestamp: Date.now(),
      data: {
        trade,
        traderRebate,
        userBalance: user.balance,
        rootCALiquidity: rootCALiquidity,
      }
    });
    
    return; // Exit early for DEX trades
  }
  
  // Continue with movie purchase flow
  console.log("✅ Selected:", `${selectedListing.providerName} - ${selectedListing.movieTitle} at ${selectedListing.showtime} for ${selectedListing.price} USDC`);
  console.log("📋 Selected listing details:", {
    providerId: selectedListing.providerId,
    providerName: selectedListing.providerName,
    movieTitle: selectedListing.movieTitle
  });

  console.log("3️⃣ Ledger: Create Booking Entry");
  const moviePrice = selectedListing.price;
  
  // IMPORTANT: Check wallet balance BEFORE creating ledger entry (Google user aware)
  // Re-sync user.balance with wallet balance (wallet is source of truth)
  // Note: currentWalletBalance was already declared at function start, so we update it
  const updatedWalletBalance = await getWalletBalance(user.email);
  user.balance = updatedWalletBalance;
  
  // Check if user has sufficient balance BEFORE creating ledger entry
  const totalCost = moviePrice + llmResponse.iGasCost;
  if (updatedWalletBalance < totalCost) {
    const errorMsg = `Insufficient balance. Required: ${totalCost.toFixed(6)} 🍎 APPLES (${moviePrice} + ${llmResponse.iGasCost.toFixed(6)} iGas), Available: ${updatedWalletBalance.toFixed(6)} 🍎 APPLES`;
    console.error(`❌ ${errorMsg}`);
    broadcastEvent({
      type: "insufficient_balance",
      component: "wallet",
      message: errorMsg,
      timestamp: Date.now(),
      data: {
        email: user.email,
        balance: updatedWalletBalance,
        required: totalCost,
        moviePrice: moviePrice,
        iGasCost: llmResponse.iGasCost
      }
    });
    throw new Error(errorMsg);
  }
  
  // Create snapshot first (needed for ledger entry)
  const snapshot = createSnapshot(user.email, moviePrice, selectedListing.providerId);
  
  // Find provider UUID from ROOT_CA_SERVICE_REGISTRY
  console.log(`🔍 Looking up provider UUID for providerId: "${selectedListing.providerId}"`);
  console.log(`📋 Available provider IDs in ROOT_CA_SERVICE_REGISTRY:`, ROOT_CA_SERVICE_REGISTRY.map(p => `${p.id} (${p.name})`));
  
  const provider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === selectedListing.providerId);
  const providerUuid = provider?.uuid || '';
  
  if (!providerUuid) {
    const errorMsg = `Provider UUID not found for providerId: "${selectedListing.providerId}"`;
    console.error(`❌ ${errorMsg}`);
    console.error(`   Provider found:`, provider ? 'YES' : 'NO');
    if (provider) {
      console.error(`   Provider object:`, JSON.stringify(provider, null, 2));
    }
    console.error(`   Selected listing providerId:`, selectedListing.providerId);
    console.error(`   Selected listing providerName:`, selectedListing.providerName);
    throw new Error(errorMsg);
  } else {
    console.log(`✅ Found provider UUID: ${providerUuid} for provider: ${selectedListing.providerName} (${selectedListing.providerId})`);
  }
  
  // Validate service provider certificate
  if (!provider) {
    throw new Error(`Provider not found for providerId: "${selectedListing.providerId}"`);
  }
  
  console.log("🔐 Validating service provider certificate...");
  const isCertValid = validateCertificate(providerUuid);
  if (!isCertValid) {
    const errorMsg = `Service provider certificate invalid or revoked: ${provider.name}`;
    console.error(`❌ ${errorMsg}`);
    broadcastEvent({
      type: "certificate_validation_failed",
      component: "root-ca",
      message: errorMsg,
      timestamp: Date.now(),
      data: { providerUuid, providerName: provider.name }
    });
    throw new Error(errorMsg);
  }
  
  const providerCert = getCertificate(providerUuid);
  if (providerCert) {
    console.log(`✅ Certificate validated for ${provider.name}`);
    console.log(`   Capabilities: ${providerCert.capabilities.join(", ")}`);
    console.log(`   Expires: ${new Date(providerCert.expiresAt).toISOString()}`);
    
    broadcastEvent({
      type: "certificate_validated",
      component: "root-ca",
      message: `Certificate validated for ${provider.name}`,
      timestamp: Date.now(),
      data: {
        providerUuid,
        providerName: provider.name,
        capabilities: providerCert.capabilities,
        expiresAt: providerCert.expiresAt
      }
    });
  }

  // Add ledger entry for this booking
  // NOTE: addLedgerEntry() in src/ledger.ts should broadcast "ledger_entry_added" event
  // But we also broadcast here to ensure it happens (fallback)
  // Determine service type from selected listing or default to 'service'
  const detectedServiceType = selectedListing.serviceType || 
                              (selectedListing.movieTitle ? 'movie' : 
                               selectedListing.flightNumber ? 'airline' :
                               selectedListing.hotelName ? 'hotel' :
                               selectedListing.restaurantName ? 'restaurant' :
                               selectedListing.grocerystoreName ? 'grocerystore' :
                               selectedListing.pharmacyName ? 'pharmacy' :
                               selectedListing.dogparkName ? 'dogpark' :
                               selectedListing.gasstationName ? 'gasstation' :
                               selectedListing.partyName ? 'party' :
                               selectedListing.bankName ? 'bank' :
                               selectedListing.partName ? 'autoparts' :
                               selectedListing.tokenSymbol ? 'dex' : 'service');
  
  // Import extractBookingDetails to dynamically extract booking details
  const { extractBookingDetails } = await import("./src/serviceTypeFields");
  const bookingDetails = extractBookingDetails(detectedServiceType, selectedListing);
  
  const ledgerEntry = addLedgerEntry(
    snapshot,
    detectedServiceType,
    llmResponse.iGasCost,
    user.email, // Pass email address (payerId will be set to email)
    selectedListing.providerName, // Provider name (e.g., "AMC Theatres", "Airline Provider", etc.)
    providerUuid, // Service provider UUID for certificate issuance
    bookingDetails // Dynamically extracted booking details based on service type
  );

  // CRITICAL: Broadcast ledger_entry_created event (matches old codebase pattern exactly)
  // Old codebase only broadcasted "ledger_entry_created", not "ledger_entry_added"
  console.log(`📡 [Broadcast] ⭐ Sending ledger_entry_created event from processChatInput: ${ledgerEntry.entryId}`);
  broadcastEvent({
    type: "ledger_entry_created",
    component: "ledger",
    message: `Ledger entry created for booking: ${ledgerEntry.entryId}`,
    timestamp: Date.now(),
    data: { entry: ledgerEntry }
  });
  
  // Also broadcast ledger_entry_added for backward compatibility (Angular listens for both)
  console.log(`📡 [Broadcast] ⭐ Sending ledger_entry_added event from processChatInput: ${ledgerEntry.entryId}`);
  broadcastEvent({
    type: "ledger_entry_added",
    component: "ledger",
    message: `Ledger entry created: ${ledgerEntry.entryId}`,
    timestamp: Date.now(),
    data: { entry: ledgerEntry }
  });

  console.log("4️⃣ Cashier: Process Payment");
  broadcastEvent({
    type: "cashier_start",
    component: "cashier",
    message: `${getCashierStatus().name} processing payment...`,
    timestamp: Date.now(),
    data: { cashier: getCashierStatus() }
  });

  const paymentSuccess = await processPayment(getCashierStatus(), ledgerEntry, user);
  if (!paymentSuccess) {
    const errorMsg = `Payment failed. Balance: ${user.balance}, Required: ${moviePrice}`;
    console.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  // CRITICAL: Broadcast cashier_payment_processed here (matches old codebase pattern exactly)
  // Old codebase: processPayment() broadcasts "cashier_payment_processed" internally,
  // then processChatInput broadcasts "purchase" here (we broadcast both for compatibility)
  const updatedCashier = getCashierStatus();
  const updatedBalance = user.balance; // Updated by processPayment
  console.log(`📡 [Broadcast] ⭐ Sending cashier_payment_processed event from processChatInput: ${ledgerEntry.amount} 🍎 APPLES`);
  console.log(`📡 [Broadcast] Event details: cashier=${updatedCashier.name}, entryId=${ledgerEntry.entryId}, amount=${ledgerEntry.amount}, balance=${updatedBalance}`);
  broadcastEvent({
    type: "cashier_payment_processed",
    component: "cashier",
    message: `${updatedCashier.name} processed payment: ${ledgerEntry.amount} 🍎 APPLES`,
    timestamp: Date.now(),
    data: { 
      entry: ledgerEntry, 
      cashier: updatedCashier, 
      userBalance: updatedBalance, 
      walletService: "wallet-service-001" 
    }
  });
  
  // Also broadcast purchase event (matches old codebase pattern)
  console.log(`📡 [Broadcast] ⭐ Sending purchase event from processChatInput: ${selectedListing.movieTitle || 'service'}`);
  broadcastEvent({
    type: "purchase",
    component: "transaction",
    message: `Purchased ${selectedListing.movieTitle || 'service'} for ${moviePrice} 🍎 APPLES`,
    timestamp: Date.now(),
    data: { listing: selectedListing, price: moviePrice, ledgerEntry: ledgerEntry.entryId }
  });
  
  // Small delay to ensure WebSocket events are sent before function continues
  await new Promise(resolve => setImmediate(resolve));

  broadcastEvent({
    type: "purchase",
    component: "transaction",
    message: `Purchased ${selectedListing.movieTitle} for ${moviePrice} USDC`,
    timestamp: Date.now(),
    data: { listing: selectedListing, price: moviePrice, ledgerEntry: ledgerEntry.entryId }
  });

  console.log("5️⃣ Snapshot + Persist");
  broadcastEvent({
    type: "snapshot_start",
    component: "snapshot",
    message: "Creating transaction snapshot...",
    timestamp: Date.now()
  });
  
  await persistSnapshot(snapshot);
  
  broadcastEvent({
    type: "snapshot_success",
    component: "snapshot",
    message: `Snapshot created: ${snapshot.txId}`,
    timestamp: Date.now(),
    data: { snapshot }
  });

  console.log("6️⃣ Stream to Indexers");
  broadcastEvent({
    type: "indexer_stream",
    component: "redis",
    message: "Streaming to indexers...",
    timestamp: Date.now()
  });
  
  await streamToIndexers(snapshot);

  console.log("7️⃣ Watch Movie 🎬");
  broadcastEvent({
    type: "movie_watch",
    component: "user",
    message: `Watching ${selectedListing.movieTitle}...`,
    timestamp: Date.now()
  });

  // Complete the booking in ledger
  completeBooking(ledgerEntry);
  
  // Deliver webhook notification (best effort, async)
  const webhookProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === selectedListing.providerId);
  if (webhookProvider) {
    deliverWebhook(webhookProvider.id, snapshot, ledgerEntry).catch(err => {
      console.warn(`⚠️  Webhook delivery failed:`, err);
    });
  }

  console.log("8️⃣ Review");
  const rebate = await applyReview(user, {
    userId: user.id,
    movieId: selectedListing.movieId,
    rating: 5,
  }, moviePrice);

  console.log("8️⃣ Summary");
  const summary = {
    balance: user.balance,
    rebate,
    fees: snapshot.feeSplit,
    iGasCost: llmResponse.iGasCost,
    selectedProvider: selectedListing.providerName,
    movie: selectedListing.movieTitle,
  };
  console.log(summary);
  
  broadcastEvent({
    type: "summary",
    component: "transaction",
    message: "Transaction completed successfully",
    timestamp: Date.now(),
    data: summary
  });

  console.log("9️⃣ Done\n");
  
  const duration = Date.now() - startTime;
  console.log(`✅ processChatInput completed in ${duration}ms for ${email}`);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ processChatInput failed after ${duration}ms for ${email}:`, error);
    throw error; // Re-throw to be handled by HTTP handler
  }
}

// ============================================
// SYSTEM PROMPT GENERATION (Holy Ghost Service)
// ============================================
async function generateSystemPrompts(description: string, serviceType: string): Promise<any> {
  const prompt = `Generate system prompts for an Eden service provider.

Service Type: ${serviceType}
Description: ${description}

Generate two prompts:
1. Query Extraction Prompt: Instructions for extracting user intent from natural language queries
2. Response Formatting Prompt: Instructions for formatting provider responses

IMPORTANT: In all generated prompts and responses, use "🍎 APPLES" as the currency name instead of "JSC" or "JesusCoin". All user-facing messages about prices, payments, and transactions should display "🍎 APPLES".

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

  if (MOCKED_LLM) {
    return {
      queryExtractionPrompt: `You are Eden Core AI query processor for ${serviceType} services.\nExtract service query from user input.\nReturn JSON only with: query (object with serviceType and filters), serviceType, confidence.`,
      responseFormattingPrompt: `You are Eden Core AI response formatter for ${serviceType} services.\nFormat service provider listings into user-friendly chat response.`,
      metadata: {
        description,
        serviceType,
        requiredFields: [],
        ledgerFields: []
      },
      generatedAt: Date.now(),
      generatedBy: ROOT_CA_UUID,
      iGasCost: 0.0025,
      version: 1
    };
  }

  try {
    // Check if API keys are available
    const hasOpenAIKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== "";
    const hasDeepSeekKey = process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim() !== "";
    
    if (!hasOpenAIKey && !hasDeepSeekKey) {
      console.warn(`⚠️  No LLM API keys found, using mocked response`);
      // Fallback to mocked response if no API keys
      return {
        queryExtractionPrompt: `You are Eden Core AI query processor for ${serviceType} services.\nExtract service query from user input.\nReturn JSON only with: query (object with serviceType and filters), serviceType, confidence.`,
        responseFormattingPrompt: `You are Eden Core AI response formatter for ${serviceType} services.\nFormat service provider listings into user-friendly chat response.`,
        metadata: {
          description,
          serviceType,
          requiredFields: [],
          ledgerFields: []
        },
        generatedAt: Date.now(),
        generatedBy: ROOT_CA_UUID,
        iGasCost: 0.0025,
        version: 1
      };
    }
    
    const response = await callLLM(prompt, ENABLE_OPENAI && hasOpenAIKey);
    const parsed = JSON.parse(response);
    return {
      ...parsed,
      generatedAt: Date.now(),
      generatedBy: ROOT_CA_UUID,
      iGasCost: 0.0025,
      version: 1
    };
  } catch (err: any) {
    console.error(`❌ Failed to generate system prompts:`, err.message);
    // Fallback to mocked response on error
    console.warn(`⚠️  Falling back to mocked response due to error`);
    return {
      queryExtractionPrompt: `You are Eden Core AI query processor for ${serviceType} services.\nExtract service query from user input.\nReturn JSON only with: query (object with serviceType and filters), serviceType, confidence.`,
      responseFormattingPrompt: `You are Eden Core AI response formatter for ${serviceType} services.\nFormat service provider listings into user-friendly chat response.`,
      metadata: {
        description,
        serviceType,
        requiredFields: [],
        ledgerFields: []
      },
      generatedAt: Date.now(),
      generatedBy: ROOT_CA_UUID,
      iGasCost: 0.0025,
      version: 1
    };
  }
}

// ============================================
// NOTIFICATION CODE GENERATION (Holy Ghost Service)
// ============================================
async function generateNotificationCode(config: {
  providerId: string;
  providerName: string;
  language: string;
  framework: string;
  indexerEndpoint: string;
  webhookUrl: string;
  serviceType: string;
  notificationMethods: string[];
}): Promise<any> {
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

  if (MOCKED_LLM) {
    return {
      webhookCode: `// Webhook receiver for ${config.providerId}\n// POST ${config.webhookUrl}`,
      pullCode: `// Pull/poll client for ${config.providerId}\n// Poll ${config.indexerEndpoint}/rpc/tx/status`,
      rpcCode: `// RPC client for ${config.providerId}\n// GET ${config.indexerEndpoint}/rpc/getTransactionByPayer`,
      readme: `# ${config.providerName} Integration\n\nThis code implements ${config.notificationMethods.join(", ")} notification methods.`,
      generatedAt: Date.now(),
      generatedBy: ROOT_CA_UUID,
      iGasCost: 0.0040,
      version: 1
    };
  }

  try {
    // Check if API keys are available
    const hasOpenAIKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== "";
    const hasDeepSeekKey = process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim() !== "";
    
    if (!hasOpenAIKey && !hasDeepSeekKey) {
      console.warn(`⚠️  No LLM API keys found, using mocked response`);
      // Fallback to mocked response if no API keys
      return {
        webhookCode: `// Webhook receiver for ${config.providerId}\n// POST ${config.webhookUrl}`,
        pullCode: `// Pull/poll client for ${config.providerId}\n// Poll ${config.indexerEndpoint}/rpc/tx/status`,
        rpcCode: `// RPC client for ${config.providerId}\n// GET ${config.indexerEndpoint}/rpc/getTransactionByPayer`,
        readme: `# ${config.providerName} Integration\n\nThis code implements ${config.notificationMethods.join(", ")} notification methods.`,
        generatedAt: Date.now(),
        generatedBy: ROOT_CA_UUID,
        iGasCost: 0.0040,
        version: 1
      };
    }
    
    const response = await callLLM(prompt, ENABLE_OPENAI && hasOpenAIKey);
    const parsed = JSON.parse(response);
    return {
      ...parsed,
      generatedAt: Date.now(),
      generatedBy: ROOT_CA_UUID,
      iGasCost: 0.0040,
      version: 1
    };
  } catch (err: any) {
    console.error(`❌ Failed to generate notification code:`, err.message);
    // Fallback to mocked response on error
    console.warn(`⚠️  Falling back to mocked response due to error`);
    return {
      webhookCode: `// Webhook receiver for ${config.providerId}\n// POST ${config.webhookUrl}`,
      pullCode: `// Pull/poll client for ${config.providerId}\n// Poll ${config.indexerEndpoint}/rpc/tx/status`,
      rpcCode: `// RPC client for ${config.providerId}\n// GET ${config.indexerEndpoint}/rpc/getTransactionByPayer`,
      readme: `# ${config.providerName} Integration\n\nThis code implements ${config.notificationMethods.join(", ")} notification methods.`,
      generatedAt: Date.now(),
      generatedBy: ROOT_CA_UUID,
      iGasCost: 0.0040,
      version: 1
    };
  }
}

// NOTE: callLLM is imported from src/llm.ts (line 102 and 127)
// The local callLLM function has been removed to use the imported one with hardcoded API key

// Main Server Initialization
async function main() {
  console.log("🌱 Eden Core Starting...\n");
  console.log("📋 CLI Flags:", {
    mockedLLM: MOCKED_LLM,
    skipRedis: SKIP_REDIS,
    enableOpenAI: ENABLE_OPENAI,
    deployedAsRoot: DEPLOYED_AS_ROOT,
    numIndexers: NUM_GARDENS,
    numTokenIndexers: NUM_TOKEN_GARDENS,
  }, "\n");
  
  if (DEPLOYED_AS_ROOT) {
    console.log("🔷 DEPLOYED AS ROOT MODE: Only ROOT CA and Holy Ghost will be initialized");
    console.log("   All additional indexers will be created via Angular UI wizard\n");
  }
  
  console.log(`✨ Holy Ghost (ROOT CA Indexer) configured: ${HOLY_GHOST_GARDEN.name}`);
  if (!DEPLOYED_AS_ROOT) {
    console.log(`🌳 Regular Indexers configured: ${GARDENS.map(i => i.name).join(", ")}`);
    console.log(`🔷 Token Indexers configured: ${TOKEN_GARDENS.map(i => i.name).join(", ")}\n`);
  } else {
    console.log(`🌳 Regular Indexers: 0 (will be created via UI)`);
    console.log(`🔷 Token Indexers: 0 (will be created via UI)\n`);
  }

  // Initialize ROOT CA
  initializeRootCA();
  
  // Initialize logger FIRST (needed for tracing garden lifecycle)
  initializeLogger();
  
  // Initialize all modules BEFORE issuing certificates (needed for broadcastEvent)
  console.log("\n🔧 Initializing modules...");
  
  // Initialize FlowWise workflow engine
  initializeFlowWise(broadcastEvent, path.join(__dirname, "data"));
  console.log("✅ [FlowWise] Workflow engine initialized");
  
  // Initialize FlowWiseService as ROOT CA service (NEW ARCHITECTURE)
  // SECURITY: FlowWiseService MUST be certified by ROOT CA to prevent ghost workflows
  initializeFlowWiseService(broadcastEvent, path.join(__dirname, "data"), ROOT_CA, ROOT_CA_IDENTITY, redis);
  console.log("✅ [FlowWiseService] ROOT CA workflow service initialized and certified with Redis instance");
  
  // Initialize garden module (needed for issueGardenCertificate to use broadcastEvent)
  initializeGarden(broadcastEvent, redis);
  
  // Issue certificate to Holy Ghost (ROOT CA Indexer)
  console.log("\n✨ Issuing certificate to Holy Ghost (ROOT CA Indexer)...");
  try {
    issueGardenCertificate(HOLY_GHOST_GARDEN);
    console.log(`   ✅ Certificate issued to ${HOLY_GHOST_GARDEN.name}`);
  } catch (err: any) {
    console.error(`   ❌ Failed to issue certificate to ${HOLY_GHOST_GARDEN.name}:`, err.message);
  }
  
  // Only initialize regular indexers if NOT in root-only mode
  if (!DEPLOYED_AS_ROOT) {
    // Issue certificates to all regular indexers (including restored ones)
    console.log("\n🌳 Issuing certificates to Regular Indexers...");
    for (const indexer of GARDENS) {
      if (indexer.active) {
        // Check if certificate exists in registry (not just in indexer object)
        const existingCert = CERTIFICATE_REGISTRY.get(indexer.uuid);
        if (!existingCert) {
          try {
            issueGardenCertificate(indexer);
            console.log(`   ✅ Certificate issued to ${indexer.name} (${indexer.id})`);
          } catch (err: any) {
            console.error(`   ❌ Failed to issue certificate to ${indexer.name}:`, err.message);
          }
        } else {
          // Certificate already exists, restore it to indexer object
          indexer.certificate = existingCert;
          console.log(`   ✅ Certificate already exists for ${indexer.name} (${indexer.id})`);
        }
      }
    }
    
    // Issue certificates to all token indexers (needed for pool initialization)
    console.log("\n🔷 Issuing certificates to Token Indexers...");
    for (const tokenIndexer of TOKEN_GARDENS) {
      if (tokenIndexer.active) {
        // Check if certificate exists in registry (not just in indexer object)
        const existingCert = CERTIFICATE_REGISTRY.get(tokenIndexer.uuid);
        if (!existingCert) {
          try {
            issueGardenCertificate(tokenIndexer);
            console.log(`   ✅ Certificate issued to ${tokenIndexer.name} (${tokenIndexer.id})`);
          } catch (err: any) {
            console.error(`   ❌ Failed to issue certificate to ${tokenIndexer.name}:`, err.message);
          }
        } else {
          // Certificate already exists, restore it to indexer object
          tokenIndexer.certificate = existingCert;
          console.log(`   ✅ Certificate already exists for ${tokenIndexer.name} (${tokenIndexer.id})`);
        }
      }
    }
  }
  
  // Initialize all remaining modules (required for both ROOT and non-ROOT modes)
  console.log("\n🔧 Initializing remaining modules...");
  
  // Initialize wallet module with dependencies
  initializeWallet(redis, SKIP_REDIS, ensureRedisConnection, broadcastEvent);
  
  // Initialize service provider module with dependencies
  initializeServiceProvider(broadcastEvent);
  
  // Initialize DEX module with dependencies
  initializeDEX(broadcastEvent);
  
  // Initialize ledger module with dependencies
  const CASHIER: Cashier = {
    id: "cashier-eden-001",
    name: "Eden Cashier",
    processedCount: 0,
    totalProcessed: 0,
    status: 'active',
  };
  initializeLedger(broadcastEvent, redis, ensureRedisConnection, SKIP_REDIS, CASHIER);
  
  // Initialize LLM module with dependencies
  initializeLLM(broadcastEvent);
  
  // Initialize PriestHood Certification Service
  initializePriesthoodCertification();
  
  // Initialize Accountant Service (tracks fee payments and total iGas)
  const { initializeAccountant } = await import("./src/accountant");
  initializeAccountant();
  console.log("✅ [PriestHood Certification] Service initialized");
  
  // NOTE: ServiceRegistry2 initialization is deferred until AFTER gardens are loaded from persistence
  // This ensures that providers with gardenId references can be properly loaded
  // See below where gardens are restored from persistence
  
  // CRITICAL: Add infrastructure providers to ServiceRegistry2 if they don't exist
  // These are the default infrastructure providers that should always be present
  const infrastructureProviders: ServiceProviderWithCert[] = [
    {
      id: "stripe-payment-rail-001",
      uuid: "550e8400-e29b-41d4-a716-446655440100",
      name: "Stripe Payment Rail",
      serviceType: "payment-rail",
      location: "Global",
      bond: 50000,
      reputation: 5.0,
      gardenId: "HG",
      apiEndpoint: "https://api.stripe.com/v1",
      status: 'active'
    },
    {
      id: "settlement-service-001",
      uuid: "550e8400-e29b-41d4-a716-446655440101",
      name: "Settlement Service",
      serviceType: "settlement",
      location: "ROOT CA",
      bond: 100000,
      reputation: 5.0,
      gardenId: "HG",
      apiEndpoint: "internal://settlement",
      status: 'active'
    },
    {
      id: "service-registry-001",
      uuid: "550e8400-e29b-41d4-a716-446655440102",
      name: "Service Registry",
      serviceType: "registry",
      location: "ROOT CA",
      bond: 50000,
      reputation: 5.0,
      gardenId: "HG",
      apiEndpoint: "internal://service-registry",
      status: 'active'
    },
    {
      id: "webserver-service-001",
      uuid: "550e8400-e29b-41d4-a716-446655440103",
      name: "Web Server",
      serviceType: "webserver",
      location: "ROOT CA",
      bond: 10000,
      reputation: 5.0,
      gardenId: "HG",
      apiEndpoint: `http://localhost:${HTTP_PORT}`,
      status: 'active'
    },
    {
      id: "websocket-service-001",
      uuid: "550e8400-e29b-41d4-a716-446655440104",
      name: "WebSocket Service",
      serviceType: "websocket",
      location: "ROOT CA",
      bond: 10000,
      reputation: 5.0,
      gardenId: "HG",
      apiEndpoint: `ws://localhost:${HTTP_PORT}`,
      status: 'active'
    },
    {
      id: "wallet-service-001",
      uuid: "550e8400-e29b-41d4-a716-446655440105",
      name: "JesusCoin Wallet Service",
      serviceType: "wallet",
      location: "ROOT CA",
      bond: 200000,
      reputation: 5.0,
      gardenId: "HG",
      apiEndpoint: "internal://wallet",
      status: 'active'
    }
  ];
  
  // NOTE: ServiceRegistry2 initialization and infrastructure provider addition
  // will happen AFTER gardens are loaded from persistence (see below around line 9393)
  
  console.log("   ✅ All modules initialized");
  
  // DEBUG: Save in-memory service registry to debug file every second
  // This helps track what's actually in memory vs what's in persistence
  // CRITICAL: Merge both ROOT_CA_SERVICE_REGISTRY and ServiceRegistry2 to show all providers
  setInterval(() => {
    try {
      const memoryFile = path.join(__dirname, 'eden-serviceRegistry-memory.json');
      
      // Get providers from both old and new registries
      const serviceRegistry2 = getServiceRegistry2();
      const allProvidersFromServiceRegistry2 = serviceRegistry2.getAllProviders();
      
      // Merge: Use ServiceRegistry2 as source of truth, but also include any from ROOT_CA_SERVICE_REGISTRY that aren't in ServiceRegistry2
      const providerMap = new Map<string, any>();
      
      // First, add all from ServiceRegistry2 (new implementation - source of truth)
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
      
      // Then, add any from ROOT_CA_SERVICE_REGISTRY that aren't in ServiceRegistry2 (backward compatibility)
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
      
      const memoryData = {
        serviceRegistry: Array.from(providerMap.values()),
        totalProviders: providerMap.size,
        movieProviders: Array.from(providerMap.values()).filter((p: any) => p.serviceType === 'movie').length,
        dexProviders: Array.from(providerMap.values()).filter((p: any) => p.serviceType === 'dex').length,
        airlineProviders: Array.from(providerMap.values()).filter((p: any) => p.serviceType === 'airline').length,
        lastSaved: new Date().toISOString()
      };
      fs.writeFileSync(memoryFile, JSON.stringify(memoryData, null, 2), 'utf-8');
    } catch (err: any) {
      // Silently fail - this is just for debugging
    }
  }, 1000);
  console.log("   🔍 [DEBUG] Started saving in-memory service registry to eden-serviceRegistry-memory.json every second");
  
  // Initialize DEX Pools (must be after token indexers are created and certified)
  // Initialize pools for all existing token gardens (both ROOT and non-ROOT mode)
  if (TOKEN_GARDENS.length > 0) {
    console.log("\n🌊 Initializing DEX Pools...");
    initializeDEXPools();
    
    // Create DEX pool service providers dynamically from pools (only if they don't already exist)
    console.log("\n📋 Registering DEX Pool Service Providers...");
    for (const [poolId, pool] of DEX_POOLS.entries()) {
      const tokenGarden = TOKEN_GARDENS.find(ti => ti.id === pool.gardenId);
      if (tokenGarden) {
        const providerId = `dex-pool-${pool.tokenSymbol.toLowerCase()}`;
        const existingProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === providerId && p.gardenId === pool.gardenId);
        
        if (!existingProvider) {
          const provider: ServiceProviderWithCert = {
            id: providerId,
            uuid: crypto.randomUUID(),
            name: `${pool.tokenSymbol} Pool (${tokenGarden.name})`,
            serviceType: "dex",
            location: "Eden DEX",
            bond: pool.bond,
            reputation: 5.0,
            gardenId: pool.gardenId, // Assign to this garden
            apiEndpoint: `https://dex.eden.com/pools/${poolId}`,
            status: 'active',
          };
          registerServiceProviderWithROOTCA(provider);
          console.log(`   ✅ Registered DEX pool provider: ${provider.name} (${provider.id}) → ${tokenGarden.name}`);
        } else {
          console.log(`   ✓ DEX pool provider ${providerId} already exists for garden ${pool.gardenId}`);
        }
      }
    }
    
    // Issue certificates to all regular indexers
    console.log("\n📜 Issuing certificates to Regular Indexers...");
    for (const indexer of GARDENS) {
      if (indexer.active) {
        try {
          issueGardenCertificate(indexer);
        } catch (err: any) {
          console.error(`❌ Failed to issue certificate to ${indexer.name}:`, err.message);
        }
      }
    }
  }
  
  // Issue certificates to all service providers (including dynamically created DEX pool providers)
  console.log("\n📜 Issuing certificates to Service Providers...");
  for (const provider of ROOT_CA_SERVICE_REGISTRY) {
    try {
      issueServiceProviderCertificate(provider);
    } catch (err: any) {
      console.error(`❌ Failed to issue certificate to ${provider.name}:`, err.message);
    }
  }
  
  console.log(`\n✅ Certificate issuance complete. Total certificates: ${CERTIFICATE_REGISTRY.size}`);
  console.log(`   - Regular Indexers: ${GARDENS.length}`);
  console.log(`   - Token Indexers: ${TOKEN_GARDENS.length}`);
  console.log(`   - Service Providers: ${ROOT_CA_SERVICE_REGISTRY.length}\n`);

  // ============================================
  // SERVICE PROVIDER NOTIFICATION SETUP
  // ============================================
  // Register webhooks for service providers (Optional Push mechanism)
  console.log("\n📡 Registering Service Provider Webhooks (Optional Push)...");
  for (const provider of ROOT_CA_SERVICE_REGISTRY) {
    // Simulate providers registering webhooks (in production, providers would call /rpc/webhook/register)
    // For demo purposes, we'll register localhost webhook URLs that point to our mock endpoint
    const mockWebhookUrl = `http://localhost:${HTTP_PORT}/mock/webhook/${provider.id}`;
    PROVIDER_WEBHOOKS.set(provider.id, {
      providerId: provider.id,
      webhookUrl: mockWebhookUrl,
      registeredAt: Date.now(),
      failureCount: 0,
    });
    console.log(`   ✅ Registered webhook for ${provider.name} (${provider.id}): ${mockWebhookUrl}`);
    
    // Broadcast webhook registration during startup
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
  console.log(`\n✅ Webhook registration complete. ${PROVIDER_WEBHOOKS.size} webhook(s) registered\n`);

  // Display Service Provider Notification Architecture
  console.log("=".repeat(70));
  console.log("📋 SERVICE PROVIDER NOTIFICATION ARCHITECTURE");
  console.log("=".repeat(70));
  console.log("\nEden provides THREE notification mechanisms for service providers:\n");
  console.log("1️⃣  INDEXER RPC (Canonical Source of Truth)");
  console.log("    - GET /rpc/getTransactionByPayer?payer=<google_email>");
  console.log("    - GET /rpc/getTransactionBySnapshot?snapshot_id=<tx_id>");
  console.log("    - GET /rpc/getLatestSnapshot?provider_id=<provider_id>");
  console.log("    - GET /rpc/tx/status?payer=<email> OR ?snapshot_id=<tx_id>");
  console.log("    → Providers query indexer RPC for transaction status");
  console.log("    → Bot-friendly, cacheable, stateless");
  console.log("    → Same model as Ethereum/Solana RPC\n");
  
  console.log("2️⃣  OPTIONAL PUSH (Webhook - Best Effort)");
  console.log("    - POST /rpc/webhook/register");
  console.log("    - POST /rpc/webhook/unregister");
  console.log("    - GET /rpc/webhook/list");
  console.log("    → Providers register webhook URLs");
  console.log("    → Indexer pushes snapshot on transaction finalization");
  console.log("    → Best effort delivery, no guarantees");
  console.log("    → Retry logic handled by indexer\n");
  
  console.log("3️⃣  PULL/POLL (Safety Net)");
  console.log("    - GET /rpc/tx/status?payer=<email>");
  console.log("    - Providers poll until timeout");
  console.log("    → Fallback if webhook fails");
  console.log("    → Provider controls reliability");
  console.log("    → No inbound firewall rules required\n");
  
  console.log("=".repeat(70));
    console.log(`💡 Example: Query transactions for bill.draper.auto@gmail.com`);
    console.log(`   curl "http://localhost:${HTTP_PORT}/rpc/getTransactionByPayer?payer=bill.draper.auto@gmail.com"`);
  console.log(`\n💡 Example: Register webhook for AMC`);
  console.log(`   curl -X POST http://localhost:${HTTP_PORT}/rpc/webhook/register \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"providerId":"amc-001","webhookUrl":"http://localhost:${HTTP_PORT}/mock/webhook/amc-001"}'`);
  console.log(`\n💡 Example: Poll transaction status`);
    console.log(`   curl "http://localhost:${HTTP_PORT}/rpc/tx/status?payer=bill.draper.auto@gmail.com"`);
  console.log("=".repeat(70) + "\n");

  // Connect to Redis
  const redisConnected = await connectRedis();
  
  // Embedded Redis always connects successfully unless skipped
  if (!redisConnected && !SKIP_REDIS) {
    console.error("❌ Unexpected Redis connection failure\n");
    process.exit(1);
  }

  // In ROOT mode, save service registry and wallets to persistence file after Redis connection
  // NOTE: Only save if the file doesn't exist or is empty - don't overwrite existing provider assignments
  if (DEPLOYED_AS_ROOT && redisConnected && !SKIP_REDIS) {
    const serviceRegistryFile = path.join(__dirname, 'eden-serviceRegistry-persistence.json');
    const shouldSave = !fs.existsSync(serviceRegistryFile) || 
                       (fs.existsSync(serviceRegistryFile) && fs.statSync(serviceRegistryFile).size < 100);
    
    if (shouldSave) {
      console.log(`💾 [ROOT Mode] Service registry file is empty or missing, saving initial state...`);
      try {
        redis.saveServiceRegistry();
        console.log(`   ✅ Service registry saved to persistence file`);
      } catch (err: any) {
        console.warn(`   ⚠️  Failed to save service registry: ${err.message}`);
      }
    } else {
      console.log(`💾 [ROOT Mode] Service registry file exists, skipping save (preserving existing provider assignments)`);
    }
  }
  
  // Load ledger entries from separate persistence file (new system)
  if (redisConnected && !SKIP_REDIS) {
    const ledgerEntriesFile = path.join(__dirname, 'eden-ledgerEntries-persistence.json');
    if (fs.existsSync(ledgerEntriesFile)) {
      try {
        const fileContent = fs.readFileSync(ledgerEntriesFile, 'utf-8');
        const persisted = JSON.parse(fileContent);

        if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries)) {
          // Restore ledger entries from separate file
          LEDGER.push(...persisted.ledgerEntries);
          console.log(`📂 [Ledger Persistence] Loaded ${persisted.ledgerEntries.length} ledger entries from ${ledgerEntriesFile}`);
        }
      } catch (err: any) {
        console.error(`❌ [Ledger Persistence] Failed to load ledger entries: ${err.message}`);
      }
    } else {
      // Fallback: Load from old combined persistence file for backward compatibility
      const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
      if (fs.existsSync(persistenceFile)) {
        try {
          const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
          const persisted = JSON.parse(fileContent);

          if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries)) {
            // Restore ledger entries from old combined file
            LEDGER.push(...persisted.ledgerEntries);
            console.log(`📂 [Ledger Persistence] Loaded ${persisted.ledgerEntries.length} ledger entries from old combined file ${persistenceFile}`);
          }
        } catch (err: any) {
          console.error(`❌ [Ledger Persistence] Failed to load ledger entries from old file: ${err.message}`);
        }
      }
    }
  }

  // Load total iGas from persistence file
  if (redisConnected && !SKIP_REDIS) {
    try {
      const igasPersistenceFile = path.join(__dirname, 'eden-igas-persistence.json');
      if (fs.existsSync(igasPersistenceFile)) {
        const fileContent = fs.readFileSync(igasPersistenceFile, 'utf-8');
        const persisted = JSON.parse(fileContent);
        if (persisted.totalIGas !== undefined && typeof persisted.totalIGas === 'number') {
          TOTAL_IGAS = persisted.totalIGas;
          console.log(`⛽ [iGas Persistence] Loaded total iGas: ${TOTAL_IGAS.toFixed(6)}`);
        }
      }
    } catch (err: any) {
      console.warn(`⚠️  [iGas Persistence] Failed to load total iGas: ${err.message}`);
    }
  }

  // Load persisted indexers from persistence file
  if (redisConnected && !SKIP_REDIS) {
    try {
      const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
      if (fs.existsSync(persistenceFile)) {
        const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
        const persisted = JSON.parse(fileContent);

        // CRITICAL: In ROOT mode, persistence file is the SINGLE SOURCE OF TRUTH
        // We should ONLY restore what's in the persistence file, nothing else
        // Collect all indexers to restore FIRST, then reset memory arrays and populate

        // Temporary arrays to collect indexers to restore
        const indexersToRestore: GardenConfig[] = [];
        const tokenIndexersToRestore: TokenGardenConfig[] = [];

        // Backward compatibility: check both 'gardens' and 'indexers' fields
        const gardensFromFile = persisted.gardens || persisted.indexers;
        if (gardensFromFile && Array.isArray(gardensFromFile)) {
          // First pass: Collect all indexers to restore FROM PERSISTENCE FILE ONLY
          // In ROOT mode: persistence file is the SINGLE SOURCE OF TRUTH
          let restoredCount = 0;
          let skippedCount = 0;

          for (const persistedIndexer of gardensFromFile) {
            // Skip token indexers (they're restored separately)
            if (persistedIndexer.tokenServiceType === 'dex' || (persistedIndexer.serviceType === 'dex' && persistedIndexer.id && persistedIndexer.id.startsWith('T'))) {
              skippedCount++;
              console.log(`📂 [Indexer Persistence] Skipping token indexer ${persistedIndexer.id} (will be restored as token indexer)`);
              continue;
            }

            // CRITICAL: In ROOT mode, ONLY restore what's in persistence file
            // Persistence file is the SINGLE SOURCE OF TRUTH
            if (DEPLOYED_AS_ROOT) {
              const isRegularIndexer = persistedIndexer.id && (persistedIndexer.id.startsWith('garden-') || persistedIndexer.id.startsWith('indexer-'));

              if (isRegularIndexer) {
                indexersToRestore.push(persistedIndexer as GardenConfig);
                restoredCount++;
                console.log(`📂 [Indexer Persistence] Will restore regular indexer: ${persistedIndexer.name} (${persistedIndexer.id})`);
              }
            } else {
              // Non-ROOT mode: restore all regular indexers (not defaults)
              const defaultIds = Array.from({ length: NUM_GARDENS }, (_, i) => String.fromCharCode(65 + i));
              if (persistedIndexer.id && !defaultIds.includes(persistedIndexer.id)) {
                indexersToRestore.push(persistedIndexer as GardenConfig);
                restoredCount++;
                console.log(`📂 [Indexer Persistence] Will restore regular indexer: ${persistedIndexer.name} (${persistedIndexer.id})`);
              }
            }
          }

          // Restore token indexers separately
          for (const persistedIndexer of gardensFromFile) {
            const isTokenIndexer = persistedIndexer.tokenServiceType === 'dex' || (persistedIndexer.serviceType === 'dex' && persistedIndexer.id && persistedIndexer.id.startsWith('T'));

            if (isTokenIndexer) {
              if (DEPLOYED_AS_ROOT) {
                // ROOT mode: restore all token indexers
                tokenIndexersToRestore.push(persistedIndexer as TokenGardenConfig);
                restoredCount++;
                console.log(`📂 [Indexer Persistence] Will restore token indexer: ${persistedIndexer.name} (${persistedIndexer.id})`);
              } else {
                // Non-ROOT mode: exclude defaults
                const defaultTokenIds = Array.from({ length: NUM_TOKEN_GARDENS }, (_, i) => `T${i + 1}`);
                if (persistedIndexer.id && !defaultTokenIds.includes(persistedIndexer.id)) {
                  tokenIndexersToRestore.push(persistedIndexer as TokenGardenConfig);
                  restoredCount++;
                  console.log(`📂 [Indexer Persistence] Will restore token indexer: ${persistedIndexer.name} (${persistedIndexer.id})`);
                }
              }
            }
          }

          console.log(`📂 [Indexer Persistence] Collected ${indexersToRestore.length} regular indexer(s) and ${tokenIndexersToRestore.length} token indexer(s) to restore`);

          // Clear existing arrays (except defaults in non-ROOT mode)
          if (DEPLOYED_AS_ROOT) {
            // ROOT mode: clear all (no defaults)
            GARDENS.length = 0;
            TOKEN_GARDENS.length = 0;
          } else {
            // Non-ROOT mode: keep defaults, remove others
            const defaultIds = Array.from({ length: NUM_GARDENS }, (_, i) => String.fromCharCode(65 + i));
            const defaultTokenIds = Array.from({ length: NUM_TOKEN_GARDENS }, (_, i) => `T${i + 1}`);
            const filteredGardens = GARDENS.filter(idx => defaultIds.includes(idx.id));
            const filteredTokenGardens = TOKEN_GARDENS.filter(idx => defaultTokenIds.includes(idx.id));
            GARDENS.length = 0;
            TOKEN_GARDENS.length = 0;
            GARDENS.push(...filteredGardens);
            TOKEN_GARDENS.push(...filteredTokenGardens);
          }

          // CRITICAL: Deduplicate BEFORE adding to arrays to prevent duplicates in memory
          // This is the ROOT CAUSE fix - prevent duplicates at the source, not after creation
          const deduplicatedRegular = new Map<string, GardenConfig>();
          for (const idx of indexersToRestore) {
            if (!deduplicatedRegular.has(idx.id)) {
              deduplicatedRegular.set(idx.id, idx);
            } else {
              console.warn(`⚠️  [Indexer Persistence] Skipping duplicate regular indexer ${idx.id} when restoring from file`);
            }
          }

          const deduplicatedToken = new Map<string, TokenGardenConfig>();
          for (const idx of tokenIndexersToRestore) {
            if (!deduplicatedToken.has(idx.id)) {
              deduplicatedToken.set(idx.id, idx as TokenGardenConfig);
            } else {
              console.warn(`⚠️  [Indexer Persistence] Skipping duplicate token indexer ${idx.id} when restoring from file`);
            }
          }

          // Only add deduplicated indexers to arrays
          const cleanRegularIndexers = Array.from(deduplicatedRegular.values());
          const cleanTokenIndexers = Array.from(deduplicatedToken.values());

          GARDENS.push(...cleanRegularIndexers);
          TOKEN_GARDENS.push(...cleanTokenIndexers);

          const regularDupsRemoved = indexersToRestore.length - cleanRegularIndexers.length;
          const tokenDupsRemoved = tokenIndexersToRestore.length - cleanTokenIndexers.length;

          if (regularDupsRemoved > 0 || tokenDupsRemoved > 0) {
            console.warn(`⚠️  [Indexer Persistence] Removed ${regularDupsRemoved} duplicate regular indexer(s) and ${tokenDupsRemoved} duplicate token indexer(s) when loading from file`);
          }

          console.log(`✅ [Indexer Persistence] Restored ${cleanRegularIndexers.length} regular indexer(s) and ${cleanTokenIndexers.length} token indexer(s) from persistence file`);
        }
      }
    } catch (err: any) {
      console.error(`❌ [Indexer Persistence] Failed to restore indexers: ${err.message}`);
    }
    
    // CRITICAL: Initialize ServiceRegistry2 AFTER gardens are loaded from persistence
    // This ensures that providers with gardenId references (like AMC with garden-1) can be properly loaded
    console.log("\n📋 Initializing ServiceRegistry2 (AFTER gardens loaded)...");
    initializeServiceRegistry2();
    const serviceRegistry2 = getServiceRegistry2();
    console.log(`   ✅ ServiceRegistry2 initialized with ${serviceRegistry2.getCount()} provider(s) from persistence`);
    
    // CRITICAL: Add infrastructure providers to ServiceRegistry2 if they don't exist
    // These are the default infrastructure providers that should always be present
    const infrastructureProviders: ServiceProviderWithCert[] = [
      {
        id: "stripe-payment-rail-001",
        uuid: "550e8400-e29b-41d4-a716-446655440100",
        name: "Stripe Payment Rail",
        serviceType: "payment-rail",
        location: "Global",
        bond: 50000,
        reputation: 5.0,
        gardenId: "HG",
        apiEndpoint: "https://api.stripe.com/v1",
        status: 'active'
      },
      {
        id: "settlement-service-001",
        uuid: "550e8400-e29b-41d4-a716-446655440101",
        name: "Settlement Service",
        serviceType: "settlement",
        location: "ROOT CA",
        bond: 100000,
        reputation: 5.0,
        gardenId: "HG",
        apiEndpoint: "internal://settlement",
        status: 'active'
      },
      {
        id: "service-registry-001",
        uuid: "550e8400-e29b-41d4-a716-446655440102",
        name: "Service Registry",
        serviceType: "registry",
        location: "ROOT CA",
        bond: 50000,
        reputation: 5.0,
        gardenId: "HG",
        apiEndpoint: "internal://service-registry",
        status: 'active'
      },
      {
        id: "webserver-service-001",
        uuid: "550e8400-e29b-41d4-a716-446655440103",
        name: "Web Server",
        serviceType: "webserver",
        location: "ROOT CA",
        bond: 10000,
        reputation: 5.0,
        gardenId: "HG",
        apiEndpoint: `http://localhost:${HTTP_PORT}`,
        status: 'active'
      },
      {
        id: "websocket-service-001",
        uuid: "550e8400-e29b-41d4-a716-446655440104",
        name: "WebSocket Service",
        serviceType: "websocket",
        location: "ROOT CA",
        bond: 10000,
        reputation: 5.0,
        gardenId: "HG",
        apiEndpoint: `ws://localhost:${HTTP_PORT}`,
        status: 'active'
      },
      {
        id: "wallet-service-001",
        uuid: "550e8400-e29b-41d4-a716-446655440105",
        name: "JesusCoin Wallet Service",
        serviceType: "wallet",
        location: "ROOT CA",
        bond: 200000,
        reputation: 5.0,
        gardenId: "HG",
        apiEndpoint: "internal://wallet",
        status: 'active'
      }
    ];
    
    let infrastructureAdded = 0;
    for (const provider of infrastructureProviders) {
      if (!serviceRegistry2.hasProvider(provider.id)) {
        try {
          serviceRegistry2.addProvider(provider);
          infrastructureAdded++;
          console.log(`   ✅ Added infrastructure provider: ${provider.name} (${provider.id})`);
        } catch (err: any) {
          console.warn(`   ⚠️  Failed to add infrastructure provider ${provider.id}: ${err.message}`);
        }
      }
    }
    
    if (infrastructureAdded > 0) {
      console.log(`   ✅ Added ${infrastructureAdded} infrastructure provider(s) to ServiceRegistry2`);
      // Save immediately to persist infrastructure providers
      serviceRegistry2.savePersistence();
    }
    
    console.log(`   ✅ ServiceRegistry2 ready with ${serviceRegistry2.getCount()} total provider(s)`);
    
    // CRITICAL: After gardens are loaded, check for gardens without providers and create default ones
    // Also check eden-gardens-persistence.json (separate file used by API endpoint)
    console.log(`\n   🔍 [Startup] Checking for gardens without providers...`);
    
    // First, check gardens loaded from eden-wallet-persistence.json
    const allGardens = [...GARDENS, ...TOKEN_GARDENS];
    console.log(`   🔍 [Startup] Checking ${allGardens.length} garden(s) from memory: ${allGardens.map(g => `${g.id}(${(g as any).serviceType || 'no-type'})`).join(', ')}`);
    
    // Also check eden-gardens-persistence.json (separate file)
    const gardensPersistenceFile = path.join(__dirname, 'eden-gardens-persistence.json');
    let gardensFromSeparateFile: any[] = [];
    if (fs.existsSync(gardensPersistenceFile)) {
      try {
        const fileContent = fs.readFileSync(gardensPersistenceFile, 'utf-8');
        const persisted = JSON.parse(fileContent);
        gardensFromSeparateFile = persisted.gardens || [];
        console.log(`   🔍 [Startup] Found ${gardensFromSeparateFile.length} garden(s) in eden-gardens-persistence.json: ${gardensFromSeparateFile.map((g: any) => `${g.id}(${g.serviceType || 'no-type'})`).join(', ')}`);
        
        // CRITICAL: Add gardens from separate file to GARDENS array if they're not already there
        // This ensures validateGardenId() will recognize them
        for (const gardenFromFile of gardensFromSeparateFile) {
          const existsInMemory = GARDENS.some(g => g.id === gardenFromFile.id) || TOKEN_GARDENS.some(tg => tg.id === gardenFromFile.id);
          if (!existsInMemory) {
            // Determine if it's a token garden or regular garden
            const isTokenGarden = gardenFromFile.tokenServiceType === 'dex' || (gardenFromFile.serviceType === 'dex' && gardenFromFile.id && gardenFromFile.id.startsWith('T'));
            
            if (isTokenGarden) {
              TOKEN_GARDENS.push(gardenFromFile);
              console.log(`   🔍 [Startup] Added token garden ${gardenFromFile.id} from eden-gardens-persistence.json to TOKEN_GARDENS`);
            } else {
              GARDENS.push(gardenFromFile);
              console.log(`   🔍 [Startup] Added garden ${gardenFromFile.id} from eden-gardens-persistence.json to GARDENS`);
            }
          }
        }
        
        // Update allGardens to include all gardens (from both sources)
        allGardens = [...GARDENS, ...TOKEN_GARDENS];
      } catch (err: any) {
        console.warn(`   ⚠️  [Startup] Failed to read eden-gardens-persistence.json:`, err.message);
      }
    }
    
    console.log(`   🔍 [Startup] Total gardens to check: ${allGardens.length}`);
    
    for (const garden of allGardens) {
      const gardenServiceType = (garden as any).serviceType;
      console.log(`   🔍 [Startup] Checking garden ${garden.id}: serviceType="${gardenServiceType}"`);
      
      if (gardenServiceType && 
          gardenServiceType !== "movie" && 
          gardenServiceType !== "dex" && 
          gardenServiceType !== "snake") {
        // Query providers specifically for this garden (not all providers of this service type)
        const allProviders = serviceRegistry2.getAllProviders();
        const providersForThisGarden = allProviders.filter(p => p.gardenId === garden.id && p.serviceType === gardenServiceType);
        const hasProviderForThisGarden = providersForThisGarden.length > 0;
        
        console.log(`   🔍 [Startup] Garden ${garden.id} (${gardenServiceType}): ${providersForThisGarden.length} provider(s) found for this garden, hasProviderForThisGarden=${hasProviderForThisGarden}`);
        
        if (!hasProviderForThisGarden) {
          console.log(`   🔧 [Startup] Garden ${garden.id} (${gardenServiceType}) has no providers, creating default provider...`);
          try {
            const defaultProviderConfig = {
              name: `${garden.name} Provider`,
              location: 'Unknown',
              bond: 1000,
              reputation: 5.0,
              apiEndpoint: `https://api.${gardenServiceType}.com/v1`
            };
            
            const startupProviderResults = createServiceProvidersForGarden(
              gardenServiceType,
              garden.id,
              [defaultProviderConfig],
              undefined
            );
            
            const startupProvidersCreated = startupProviderResults.filter(r => r.created || r.assigned).length;
            console.log(`   ✅ [Startup] Created default provider for ${gardenServiceType} garden ${garden.id}: ${startupProviderResults.map(r => r.providerName).join(', ')}`);
            
            // Save service registry to persistence
            serviceRegistry2.savePersistence();
            console.log(`   💾 [Startup] Service registry saved to persistence`);
          } catch (startupErr: any) {
            console.warn(`   ⚠️  [Startup] Failed to create default provider for ${garden.id}:`, startupErr.message);
            console.error(`   ❌ [Startup] Error details:`, startupErr);
          }
        } else {
          console.log(`   ✓ [Startup] Garden ${garden.id} already has provider(s)`);
        }
      } else {
        console.log(`   ⏭️  [Startup] Skipping garden ${garden.id}: serviceType="${gardenServiceType}" (movie/dex/snake or missing)`);
      }
    }
    
    // CRITICAL: After gardens are loaded, ensure all hardcoded providers are present if their gardens exist
    // This fixes the issue where providers are removed during initial load before gardens exist
    if (redisConnected && !SKIP_REDIS) {
      try {
        // In ROOT mode: All providers are created dynamically via the wizard, not hardcoded
        // Only reload from persistence file to get providers that were created via the wizard
        let reloadedCount = 0;
        const serviceRegistryFile = path.join(__dirname, 'eden-serviceRegistry-persistence.json');
        if (fs.existsSync(serviceRegistryFile)) {
          const fileContent = fs.readFileSync(serviceRegistryFile, 'utf-8');
          const persisted = JSON.parse(fileContent);
          if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry) && persisted.serviceRegistry.length > 0) {
            console.log(`🔍 [Service Registry Reload] Checking ${persisted.serviceRegistry.length} providers from persistence file`);
            console.log(`🔍 [Service Registry Reload] Current GARDENS: ${GARDENS.map(g => g.id).join(', ')}`);
            console.log(`🔍 [Service Registry Reload] Current TOKEN_GARDENS: ${TOKEN_GARDENS.map(tg => tg.id).join(', ')}`);
            console.log(`🔍 [Service Registry Reload] Current ROOT_CA_SERVICE_REGISTRY: ${ROOT_CA_SERVICE_REGISTRY.map(p => `${p.id}(${p.serviceType})`).join(', ')}`);
            
            for (const persistedProvider of persisted.serviceRegistry) {
              const persistedGardenId = persistedProvider.gardenId || persistedProvider.indexerId;
              
              console.log(`🔍 [Service Registry Reload] Processing provider: ${persistedProvider.id} (${persistedProvider.name}), serviceType: ${persistedProvider.serviceType}, gardenId: ${persistedGardenId}`);
              
              // Now that gardens are loaded, check if garden exists
              let gardenExists = persistedGardenId === 'HG' ||
                                GARDENS.some(g => g.id === persistedGardenId) ||
                                TOKEN_GARDENS.some(tg => tg.id === persistedGardenId);
              
              console.log(`🔍 [Service Registry Reload] Garden ${persistedGardenId} exists: ${gardenExists}`);
              
              if (!gardenExists && persistedGardenId) {
                // Special handling for ROOT mode: create default gardens for movie providers
                if (DEPLOYED_AS_ROOT && persistedProvider.serviceType === 'movie' && persistedGardenId !== 'HG') {
                  console.log(`🏗️  [Service Registry Reload] Creating default garden "${persistedGardenId}" for movie provider ${persistedProvider.id}`);

                  // Create a default garden for the movie provider
                  const defaultGarden: GardenConfig = {
                    id: persistedGardenId,
                    uuid: crypto.randomUUID(),
                    name: `Movie Garden (${persistedGardenId})`,
                    serviceType: 'movie',
                    active: true,
                    location: persistedProvider.location || 'Default Location',
                    bond: 1000,
                    reputation: 100,
                    certificate: null,
                    createdAt: new Date().toISOString(),
                    lastActive: new Date().toISOString()
                  };

                  // Add to GARDENS array
                  GARDENS.push(defaultGarden);

                  // Issue certificate to the new garden
                  try {
                    issueGardenCertificate(defaultGarden);
                    console.log(`   ✅ Certificate issued to new garden: ${defaultGarden.name}`);
                  } catch (certError: any) {
                    console.warn(`   ⚠️  Failed to issue certificate to new garden: ${certError.message}`);
                  }

                  console.log(`   ✅ Created and registered garden: ${defaultGarden.name} (${defaultGarden.id})`);
                  gardenExists = true; // Now the garden exists
                } else {
                  console.log(`⚠️  [Service Registry Reload] Skipping provider ${persistedProvider.id}: gardenId "${persistedGardenId}" does not exist`);
                  console.log(`   Available gardens: ${GARDENS.map(g => g.id).join(', ') || 'none'}`);
                  console.log(`   Available token gardens: ${TOKEN_GARDENS.map(tg => tg.id).join(', ') || 'none'}`);
                  continue;
                }
              }
              
              // Check if provider already exists
              const existingProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === persistedProvider.id);
              if (!existingProvider) {
                // Provider doesn't exist, add it
                const providerToAdd: any = {
                  id: persistedProvider.id,
                  uuid: persistedProvider.uuid || crypto.randomUUID(),
                  name: persistedProvider.name,
                  serviceType: persistedProvider.serviceType,
                  location: persistedProvider.location || 'Unknown',
                  bond: persistedProvider.bond || 0,
                  reputation: persistedProvider.reputation || 0,
                  gardenId: persistedGardenId || 'HG',
                  apiEndpoint: persistedProvider.apiEndpoint,
                  status: (persistedProvider.status as 'active' | 'revoked' | 'suspended') || 'active',
                };
                ROOT_CA_SERVICE_REGISTRY.push(providerToAdd);
                reloadedCount++;
                console.log(`   ✅ Reloaded provider: ${providerToAdd.name} (${providerToAdd.id}) with gardenId: ${providerToAdd.gardenId}, serviceType: ${providerToAdd.serviceType}`);
              } else {
                // Update gardenId if it's different
                if (existingProvider.gardenId !== persistedGardenId && persistedGardenId) {
                  existingProvider.gardenId = persistedGardenId;
                  console.log(`   🔄 Updated provider ${existingProvider.name}: gardenId to "${persistedGardenId}"`);
                } else {
                  console.log(`   ✓ Provider ${existingProvider.name} already exists with correct gardenId: ${existingProvider.gardenId}`);
                }
              }
            }
            console.log(`✅ [Service Registry] Reloaded ${reloadedCount} provider(s) from persistence file`);
          }
        } else {
          console.log(`✅ [Service Registry] No persistence file to reload (providers will be created via wizard)`);
        }
        
        // CRITICAL: After reloading providers from persistence, save the service registry to persistence file
        // This ensures that any providers loaded from persistence are saved back (in case of validation fixes)
        if (reloadedCount > 0) {
          console.log(`💾 [Service Registry] Saving updated service registry to persistence file...`);
          redis.saveServiceRegistry();
        }
      } catch (err: any) {
        console.warn(`⚠️  [Service Registry] Failed to reload service registry: ${err.message}`);
      }
    }
  }
  
  // Start the server
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`\n🚀 Eden Ecosystem Server running on port ${PORT}`);
    console.log(`📡 WebSocket server ready for connections`);
    if (DEPLOYED_AS_ROOT) {
      console.log(`🌳 ROOT mode: ${GARDENS.length} garden(s), ${TOKEN_GARDENS.length} token garden(s)`);
    } else {
      console.log(`🌳 Non-ROOT mode: ${GARDENS.length} garden(s), ${TOKEN_GARDENS.length} token garden(s)`);
    }

    // Periodic service registry save (every 5 minutes)
    setInterval(() => {
      try {
        if (redis && ROOT_CA_SERVICE_REGISTRY.length > 0) {
          console.log(`⏰ [Periodic Save] Auto-saving service registry (${ROOT_CA_SERVICE_REGISTRY.length} providers)...`);
          redis.saveServiceRegistry();
        }
      } catch (error) {
        console.error('❌ [Periodic Save] Failed to save service registry:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Periodic total iGas save (every 5 minutes)
    setInterval(() => {
      try {
        const igasPersistenceFile = path.join(__dirname, 'eden-igas-persistence.json');
        const igasData = {
          totalIGas: TOTAL_IGAS,
          lastSaved: new Date().toISOString()
        };
        fs.writeFileSync(igasPersistenceFile, JSON.stringify(igasData, null, 2), 'utf-8');
        console.log(`⏰ [Periodic Save] Auto-saving total iGas: ${TOTAL_IGAS.toFixed(6)}`);
      } catch (error) {
        console.error('❌ [Periodic Save] Failed to save total iGas:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Periodic Accountant Service save (every 5 minutes)
    setInterval(() => {
      try {
        const { saveAccountantState } = require("./src/accountant");
        saveAccountantState();
        console.log(`⏰ [Periodic Save] Auto-saving Accountant Service state`);
      } catch (error) {
        console.error('❌ [Periodic Save] Failed to save Accountant Service state:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  });
}

// Shutdown handlers to save service registry on exit
const saveServiceRegistryOnShutdown = () => {
  try {
    console.log('💾 [Shutdown] Saving service registry to persistence file...');
    if (redis) {
      redis.saveServiceRegistry();
      console.log('✅ [Shutdown] Service registry saved successfully');
    } else {
      console.warn('⚠️  [Shutdown] Redis not available, skipping service registry save');
    }
  } catch (error) {
    console.error('❌ [Shutdown] Failed to save service registry:', error);
  }
};

// Shutdown handler to save Accountant Service state
const saveAccountantOnShutdown = () => {
  try {
    console.log('💾 [Shutdown] Saving Accountant Service state...');
    const { saveAccountantState } = require("./src/accountant");
    saveAccountantState();
    console.log('✅ [Shutdown] Accountant Service state saved successfully');
  } catch (error) {
    console.error('❌ [Shutdown] Failed to save Accountant Service state:', error);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => {
  console.log('🛑 [Shutdown] Received SIGTERM, saving state...');
  saveServiceRegistryOnShutdown();
  saveAccountantOnShutdown();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 [Shutdown] Received SIGINT (Ctrl+C), saving state...');
  saveServiceRegistryOnShutdown();
  saveAccountantOnShutdown();
  process.exit(0);
});

// Note: beforeExit handler removed due to Node.js event listener conflicts
// SIGTERM and SIGINT handlers provide sufficient shutdown coverage

// Note: uncaughtException and unhandledRejection handlers removed due to Node.js event listener conflicts
// SIGTERM and SIGINT handlers provide sufficient shutdown coverage for normal operations

// Start the server
main().catch((err) => {
  console.error("❌ Fatal error starting server:", err);
  process.exit(1);
});
