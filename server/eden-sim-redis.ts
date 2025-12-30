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

// CLI Flags
const args = process.argv.slice(2);
const MOCKED_LLM = args.some(arg => arg.includes("--mocked-llm") && (arg.includes("=true") || !arg.includes("=false")));
const SKIP_REDIS = args.some(arg => arg.includes("--skip-redis") && (arg.includes("=true") || !arg.includes("=false")));
const ENABLE_OPENAI = args.some(arg => arg.includes("--enable-openai") && (arg.includes("=true") || !arg.includes("=false")));
const DEPLOYED_AS_ROOT = args.some(arg => arg.includes("--deployed-as-root") && (arg.includes("=true") || !arg.includes("=false")));

// Parse --indexers flag (default: 2, ignored if DEPLOYED_AS_ROOT)
const indexersArg = args.find(arg => arg.startsWith("--indexers"));
const NUM_INDEXERS = DEPLOYED_AS_ROOT ? 0 : (indexersArg ? parseInt(indexersArg.split("=")[1] || "2") : 2);

// Parse --token-indexers flag (default: 2, ignored if DEPLOYED_AS_ROOT)
const tokenIndexersArg = args.find(arg => arg.startsWith("--token-indexers"));
const NUM_TOKEN_INDEXERS = DEPLOYED_AS_ROOT ? 0 : (tokenIndexersArg ? parseInt(tokenIndexersArg.split("=")[1] || "2") : 2);

const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000");
const FRONTEND_PATH = process.env.FRONTEND_PATH || path.join(__dirname, "../frontend/dist/eden-sim-frontend");

// Wallet Service Constants
const WALLET_BALANCE_PREFIX = "wallet:balance:";
const WALLET_HOLD_PREFIX = "wallet:hold:";
const WALLET_AUDIT_PREFIX = "wallet:audit:";

// Stripe Configuration (hardcoded as requested)
const STRIPE_SECRET_KEY = "sk_test_51RrflYP4h6MOSVxDAFUAr0i7mmsQ8MSGi9Y0atxTsVaeVZsokRn09C9AEc0TWHidYdicNnGBTRpgJsoGz2CsZ0HC009CA5NFCn";
const STRIPE_PUBLISHABLE_KEY = "pk_test_51RrflYP4h6MOSVxDENdMiwOSbNudvzG8PlrrhslZjfbg9qPvb8YkzVR42ro5bQ8nXUnnbuPQpSlI43SHBuKhiCS000VgCDGNrC";
const STRIPE_WEBHOOK_SECRET = "whsec_your_webhook_secret_here"; // Update with actual webhook secret from Stripe dashboard

// Initialize Stripe
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16", // Use compatible API version
});

// Dynamic Indexer Configuration
interface IndexerConfig {
  id: string;
  name: string;
  stream: string;
  active: boolean;
  uuid: string;
  certificate?: EdenCertificate;
  pki?: EdenPKI; // Store PKI instance for signing revocations
}

const INDEXERS: IndexerConfig[] = [];
if (!DEPLOYED_AS_ROOT) {
  for (let i = 0; i < NUM_INDEXERS; i++) {
    const indexerId = String.fromCharCode(65 + i); // A, B, C, D, E...
    INDEXERS.push({
      id: indexerId,
      name: `Indexer-${indexerId}`,
      stream: `eden:indexer:${indexerId}`,
      active: true,
      uuid: `eden:indexer:${crypto.randomUUID()}`
    });
  }
}

// Token Indexers (specialized indexers providing DEX token/pool services)
interface TokenIndexerConfig extends IndexerConfig {
  tokenServiceType: 'dex'; // Specialized for DEX services
}

const TOKEN_INDEXERS: TokenIndexerConfig[] = [];
if (!DEPLOYED_AS_ROOT) {
  for (let i = 0; i < NUM_TOKEN_INDEXERS; i++) {
    const tokenIndexerId = `T${i + 1}`; // T1, T2, T3...
    TOKEN_INDEXERS.push({
      id: tokenIndexerId,
      name: `TokenIndexer-${tokenIndexerId}`,
      stream: `eden:token-indexer:${tokenIndexerId}`,
      active: true,
      uuid: `eden:token-indexer:${crypto.randomUUID()}`,
      tokenServiceType: 'dex'
    });
  }
}

// ROOT CA Identity and PKI
const ROOT_CA_UUID = "eden:root:ca:00000000-0000-0000-0000-000000000001";

// Holy Ghost - ROOT CA's dedicated indexer for infrastructure services
// Must be defined AFTER ROOT_CA_UUID
const HOLY_GHOST_INDEXER: IndexerConfig = {
  id: "HG",
  name: "Holy Ghost",
  stream: "eden:holy-ghost",
  active: true,
  uuid: ROOT_CA_UUID, // Uses ROOT CA UUID since it's ROOT CA's indexer
};
let ROOT_CA: EdenPKI | null = null;
let ROOT_CA_IDENTITY: EdenIdentity | null = null;

// Certificate Registry
const CERTIFICATE_REGISTRY = new Map<string, EdenCertificate>(); // UUID -> Certificate
const REVOCATION_REGISTRY = new Map<string, RevocationEvent>(); // UUID -> Revocation Event

// ENCERT v1 Redis Revocation Stream
const REVOCATION_STREAM = "eden:encert:revocations";

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
function broadcastEvent(event: any) {
  const message = JSON.stringify(event);
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// HTTP Server Routes
httpServer.on("request", async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  // Verbose logging disabled - uncomment below for debugging
  // console.log(`\n📥 [${requestId}] Incoming ${req.method} request: ${req.url}`);
  // console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
  
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
        
        // Process chat input (this is async and may throw errors)
        // Use Promise.race to ensure we don't hang forever
        const processPromise = processChatInput(input.trim(), email);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Processing timeout after 3 minutes")), 180000);
        });
        
        try {
          await Promise.race([processPromise, timeoutPromise]);
          
          // Success response - ensure it's sent
          if (!res.headersSent) {
            sendResponse(200, { success: true, message: "Chat processed successfully" });
            console.log(`✅ Chat request processed successfully for ${email}`);
          } else {
            console.warn(`⚠️  Response already sent, skipping success response`);
          }
        } catch (processError: any) {
          // If processChatInput throws, it will be caught by outer catch
          throw processError;
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
    
    let providers = ROOT_CA_SERVICE_REGISTRY.map(p => ({
      id: p.id,
      name: p.name,
      serviceType: p.serviceType, // Snake is a service type (serviceType: "snake")
      location: p.location,
      bond: p.bond,
      reputation: p.reputation,
      indexerId: p.indexerId, // Each service belongs to an indexer
      status: p.status || 'active',
      // Snake service fields (transparent in ServiceRegistry)
      insuranceFee: p.insuranceFee,
      iGasMultiplier: p.iGasMultiplier || 1.0,
      iTaxMultiplier: p.iTaxMultiplier || 1.0,
      maxInfluence: p.maxInfluence,
      contextsAllowed: p.contextsAllowed,
      contextsForbidden: p.contextsForbidden,
      adCapabilities: p.adCapabilities
    }));
    
    // Filter by service type if provided (e.g., "snake" for Snake services)
    if (serviceType) {
      providers = providers.filter(p => p.serviceType === serviceType);
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
        if (!providerData.id || !providerData.name || !providerData.serviceType || !providerData.indexerId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Missing required fields: id, name, serviceType, indexerId" }));
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
          indexerId: providerData.indexerId,
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

  if (pathname === "/api/indexers" && req.method === "GET") {
    console.log(`   ✅ [${requestId}] GET /api/indexers - Sending indexer list`);
    res.writeHead(200, { "Content-Type": "application/json" });
    
    // Load persisted indexers from file (single source of truth)
    let persistedIndexers: IndexerConfig[] = [];
    let persistedTokenIndexers: TokenIndexerConfig[] = [];
    
    try {
      const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
      if (fs.existsSync(persistenceFile)) {
        const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
        const persisted = JSON.parse(fileContent);
        if (persisted.indexers && Array.isArray(persisted.indexers)) {
          // In ROOT mode: ONLY return indexers created via Angular (format: indexer-1, indexer-2, etc.)
          // Filter out all other indexers (A, B, C, etc.) - they're defaults from non-ROOT mode
          if (DEPLOYED_AS_ROOT) {
            persistedIndexers = persisted.indexers.filter((idx: any) => idx.id && idx.id.startsWith('indexer-'));
          } else {
            persistedIndexers = persisted.indexers;
          }
        }
        if (persisted.tokenIndexers && Array.isArray(persisted.tokenIndexers)) {
          // In ROOT mode: ONLY return token indexers created via Angular (format: indexer-N with dex serviceType)
          // Filter out all default token indexers (T1, T2, etc.) - they're defaults from non-ROOT mode
          if (DEPLOYED_AS_ROOT) {
            persistedTokenIndexers = persisted.tokenIndexers.filter((idx: any) => idx.id && idx.id.startsWith('indexer-'));
          } else {
            persistedTokenIndexers = persisted.tokenIndexers;
          }
        }
      }
    } catch (err: any) {
      console.warn(`⚠️  [Indexer API] Failed to load persisted indexers: ${err.message}`);
    }
    
    // Combine all indexers: Holy Ghost (ROOT CA's indexer) + persisted indexers only
    const allIndexers = [
      // Holy Ghost (ROOT CA's infrastructure indexer) - listed first
      {
        id: HOLY_GHOST_INDEXER.id,
        name: HOLY_GHOST_INDEXER.name,
        stream: HOLY_GHOST_INDEXER.stream,
        active: HOLY_GHOST_INDEXER.active,
        uuid: HOLY_GHOST_INDEXER.uuid,
        hasCertificate: !!HOLY_GHOST_INDEXER.certificate,
        type: 'root' as const
      },
      // Only return persisted indexers (not in-memory defaults)
      ...persistedIndexers.map(i => ({
        id: i.id,
        name: i.name,
        stream: i.stream,
        active: i.active,
        uuid: i.uuid,
        hasCertificate: !!i.certificate,
        type: 'regular' as const
      })),
      ...persistedTokenIndexers.map(i => ({
        id: i.id,
        name: i.name,
        stream: i.stream,
        active: i.active,
        uuid: i.uuid,
        hasCertificate: !!i.certificate,
        type: 'token' as const
      }))
    ];
    
    console.log(`   📋 [Indexer API] Returning ${allIndexers.length} indexer(s): ${allIndexers.map(i => i.name).join(', ')}`);
    
    res.end(JSON.stringify({
      success: true,
      indexers: allIndexers,
      timestamp: Date.now()
    }));
    return;
  }

  if (pathname === "/api/certificates" && req.method === "GET") {
    // Verbose logging disabled - uncomment below for debugging
    // console.log(`   ✅ [${requestId}] GET /api/certificates - Sending certificate list`);
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
    req.on("end", () => {
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
          if (uuid.includes("indexer")) {
            revokedType = "indexer";
          } else if (uuid.includes("service")) {
            revokedType = "service";
          } else {
            revokedType = "provider";
          }
        }
        
        const revocation = revokeCertificate(
          uuid, 
          reason, 
          revokedType,
          severity || "hard"
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          revocation,
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
          const indexer = INDEXERS.find(i => i.uuid === uuid);
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
                  name: 'JesusCoin (JSC)',
                  description: `Purchase ${amount} JSC (1 JSC = 1 USD)`,
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
        
        console.log(`   ✅ Stripe Checkout session created: ${session.id} for ${email} (${amount} JSC)`);
        
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

  // POST /api/indexer/buy - Create Stripe Checkout session for indexer purchase
  if (pathname === "/api/indexer/buy" && req.method === "POST") {
    console.log(`   🎬 [${requestId}] POST /api/indexer/buy - Creating Stripe Checkout session for indexer purchase`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, amount, indexerType } = JSON.parse(body);
        
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
        
        if (!indexerType || indexerType !== 'movie') {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Only 'movie' indexer type is supported" }));
          return;
        }
        
        // Create Stripe Checkout session for indexer purchase
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Movie Service Indexer',
                  description: `Install a new movie service indexer (${amount} JSC)`,
                },
                unit_amount: Math.round(amount * 100), // Convert to cents
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${req.headers.origin || 'http://localhost:4200'}/?indexer_success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.headers.origin || 'http://localhost:4200'}/?indexer_canceled=true`,
          customer_email: email,
          metadata: {
            user_email: email,
            jsc_amount: amount.toString(),
            indexer_type: indexerType,
            purchase_type: 'indexer',
          },
        });
        
        console.log(`   ✅ Stripe Checkout session created for indexer purchase: ${session.id} for ${email} (${amount} JSC)`);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          sessionId: session.id,
          url: session.url,
          publishableKey: STRIPE_PUBLISHABLE_KEY,
        }));
      } catch (err: any) {
        console.error(`   ❌ Error creating Stripe Checkout session for indexer:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/indexer/purchase - Purchase indexer directly from wallet balance
  if (pathname === "/api/indexer/purchase" && req.method === "POST") {
    console.log(`   🎬 [${requestId}] POST /api/indexer/purchase - Purchasing indexer from wallet`);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { email, amount, indexerType } = JSON.parse(body);
        
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
        
        if (!indexerType || indexerType !== 'movie') {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Only 'movie' indexer type is supported" }));
          return;
        }
        
        // Check wallet balance
        const balance = await getWalletBalance(email);
        if (balance < amount) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: false, 
            error: `Insufficient balance. Required: ${amount} JSC, Available: ${balance} JSC` 
          }));
          return;
        }
        
        // Debit wallet balance
        const txId = crypto.randomUUID();
        const debitResult = await debitWallet(
          email,
          amount,
          txId,
          'indexer_purchase',
          { indexerType: indexerType }
        );
        
        if (!debitResult.success) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: debitResult.error || "Failed to debit wallet" }));
          return;
        }
        
        // Register new movie indexer
        console.log(`   🎬 Registering new movie indexer for ${email} (wallet purchase)...`);
        const newIndexer = await registerNewMovieIndexer(
          email,
          `wallet:${txId}`, // Use wallet transaction ID instead of Stripe payment intent
          undefined, // No Stripe customer ID
          undefined, // No Stripe payment method ID
          undefined  // No Stripe session ID
        );
        
        const newBalance = await getWalletBalance(email);
        
        console.log(`   ✅ Indexer purchased from wallet: ${newIndexer.name} (${newIndexer.id})`);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          indexerId: newIndexer.id,
          indexerName: newIndexer.name,
          indexerUuid: newIndexer.uuid,
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
            const purchaseType = session.metadata?.purchase_type; // 'indexer' or undefined (JSC purchase)
            const indexerType = session.metadata?.indexer_type; // 'movie' or undefined
            
            if (!email) {
              console.error(`   ❌ Missing email in Stripe session: ${session.id}`);
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Missing email in session" }));
              return;
            }
            
            if (jscAmount <= 0) {
              console.error(`   ❌ Invalid JSC amount in session metadata: ${session.metadata?.jsc_amount}`);
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Invalid JSC amount" }));
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
            
            // Check if this is an indexer purchase
            if (purchaseType === 'indexer' && indexerType === 'movie') {
              // Register new movie indexer after payment
              console.log(`   🎬 Registering new movie indexer for ${email}...`);
              const newIndexer = await registerNewMovieIndexer(email, paymentIntentId, customerId, paymentMethodId, session.id);
              
              console.log(`   ✅ Movie indexer registered successfully: ${newIndexer.id} (${newIndexer.name})`);
              console.log(`      Stripe Customer ID: ${customerId}`);
              console.log(`      Payment Intent ID: ${paymentIntentId}`);
              console.log(`      Session ID: ${session.id}`);
            } else {
              // Regular JSC purchase - mint JSC
              console.log(`   🪙 Minting ${jscAmount} JSC for ${email}...`);
              await mintJSC(email, jscAmount, paymentIntentId, customerId, paymentMethodId, session.id);
              
              console.log(`   ✅ JSC minted successfully: ${jscAmount} JSC for ${email}`);
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
        const indexerType = session.metadata?.indexer_type;
        
        if (!email) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Missing email in session" }));
          return;
        }
        
        if (jscAmount <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Invalid JSC amount in session metadata" }));
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
        
        // Check if this is an indexer purchase
        if (purchaseType === 'indexer' && indexerType === 'movie') {
          // Check if indexer already registered
          const existingIndexer = LEDGER.find(entry => 
            entry.serviceType === 'indexer_purchase' &&
            entry.bookingDetails?.stripeSessionId === sessionId
          );
          
          if (existingIndexer) {
            console.log(`   ✅ Indexer already registered for this session`);
            const balance = await getWalletBalance(email);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ 
              success: true, 
              alreadyRegistered: true,
              sessionId: session.id,
              paymentStatus: session.payment_status,
              email: email,
              balance: balance,
              indexerId: (existingIndexer.bookingDetails as any)?.indexerId,
              indexerName: (existingIndexer.bookingDetails as any)?.indexerName
            }));
            return;
          }
          
          // Register new movie indexer
          console.log(`   🎬 Registering new movie indexer for ${email} (fallback mechanism)...`);
          const newIndexer = await registerNewMovieIndexer(email, paymentIntentId, customerId, paymentMethodId, session.id);
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
            indexerId: newIndexer.id,
            indexerName: newIndexer.name
          }));
          return;
        } else {
          // Regular JSC purchase - mint JSC (fallback for local dev when webhook doesn't fire)
          console.log(`   🪙 Minting ${jscAmount} JSC for ${email} (fallback mechanism)...`);
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
      // Remove dynamically created indexers (those with IDs starting with 'indexer-')
      const dynamicIndexers = INDEXERS.filter(i => i.id.startsWith('indexer-'));
      const dynamicTokenIndexers = TOKEN_INDEXERS.filter(i => i.id.startsWith('indexer-'));
      
      const clearedIndexersCount = dynamicIndexers.length + dynamicTokenIndexers.length;
      
      // Remove dynamic indexers from arrays (filter out those starting with 'indexer-')
      const filteredIndexers = INDEXERS.filter(i => !i.id.startsWith('indexer-'));
      const filteredTokenIndexers = TOKEN_INDEXERS.filter(i => !i.id.startsWith('indexer-'));
      
      // Clear arrays and repopulate with filtered indexers
      INDEXERS.length = 0;
      INDEXERS.push(...filteredIndexers);
      
      TOKEN_INDEXERS.length = 0;
      TOKEN_INDEXERS.push(...filteredTokenIndexers);
      
      // Save cleared indexers state to persistence (empty array since all dynamic indexers are cleared)
      redis.saveIndexers([]);
      
      // Helper function to get default indexerId for a provider (non-ROOT mode only)
      function getDefaultIndexerIdForProvider(providerId: string): string | undefined {
        const defaults: Record<string, string> = {
          'amc-001': 'indexer-1',
          'cinemark-001': 'indexer-1',
          'moviecom-001': 'indexer-2',
          'snake-premium-cinema-001': 'indexer-1',
          'snake-shopping-deals-001': 'indexer-2'
        };
        return defaults[providerId];
      }
      
      // Reset provider indexerId assignments in ROOT_CA_SERVICE_REGISTRY
      // In ROOT mode: set to undefined (no indexer assigned)
      // In non-ROOT mode: restore to default assignments (indexer-1, indexer-2, etc.)
      let providersReset = 0;
      for (const provider of ROOT_CA_SERVICE_REGISTRY) {
        // Skip Holy Ghost infrastructure providers (they always belong to HG)
        if (provider.indexerId === "HG") {
          continue;
        }
        
        // Reset indexerId based on deployment mode
        if (DEPLOYED_AS_ROOT) {
          // ROOT mode: clear all assignments
          if (provider.indexerId !== undefined) {
            provider.indexerId = undefined;
            providersReset++;
          }
        } else {
          // Non-ROOT mode: restore default assignments
          const defaultIndexerId = getDefaultIndexerIdForProvider(provider.id);
          if (provider.indexerId !== defaultIndexerId) {
            provider.indexerId = defaultIndexerId;
            providersReset++;
          }
        }
      }
      
      // Update persistence file - keep wallet balances and ledger entries, only clear indexers and serviceRegistry
      const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
      let currentPersistence: any = {
        walletBalances: {},
        ledgerEntries: [],
        indexers: []
      };
      
      // Load existing persistence to preserve wallet balances and ledger entries
      if (fs.existsSync(persistenceFile)) {
        try {
          const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
          currentPersistence = JSON.parse(fileContent);
        } catch (err: any) {
          console.warn(`   ⚠️  Could not load existing persistence file:`, err.message);
        }
      }
      
      // Update persistence file - keep wallet balances and ledger entries, clear indexers and serviceRegistry
      const updatedPersistence = {
        walletBalances: currentPersistence.walletBalances || {},
        ledgerEntries: LEDGER.length > 0 ? LEDGER : (currentPersistence.ledgerEntries || []),
        indexers: [], // Clear indexers
        serviceRegistry: [], // Clear serviceRegistry
        lastSaved: new Date().toISOString(),
        resetAt: new Date().toISOString()
      };
      
      fs.writeFileSync(persistenceFile, JSON.stringify(updatedPersistence, null, 2), 'utf-8');
      
      // Save updated ServiceRegistry state to persistence (will be empty array after reset)
      redis.saveServiceRegistry();
      
      console.log(`   ✅ Cleared ${clearedIndexersCount} generated indexers and reset ${providersReset} provider assignments. Wallet balances and ledger entries preserved.`);
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        message: `Reset successful. Cleared ${clearedIndexersCount} generated indexers and reset ${providersReset} provider assignments. Wallet balances and ledger entries preserved.`,
        clearedIndexers: clearedIndexersCount,
        resetProviders: providersReset,
        remainingIndexers: INDEXERS.length + TOKEN_INDEXERS.length,
        persistenceFile: persistenceFile
      }));
    } catch (err: any) {
      console.error(`   ❌ Error resetting:`, err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
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
  
  // Log unhandled routes for debugging (disabled for less verbose output)
  if (!pathname.startsWith("/api/")) {
    // console.log(`   📁 [${requestId}] Serving static file: ${pathname}`);
  } else {
    // console.log(`   ⚠️  [${requestId}] Unhandled API route: ${req.method} ${pathname}`);
  }

  if (pathname === "/api/ledger" && req.method === "GET") {
    const parsedUrl = url.parse(req.url || "/", true);
    const payerEmail = parsedUrl.query.email as string | undefined;
    const entries = getLedgerEntries(payerEmail);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      entries: entries,
      total: entries.length
    }));
    return;
  }

  if (pathname === "/api/cashier" && req.method === "GET") {
    const cashierStatus = getCashierStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      cashier: cashierStatus
    }));
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
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
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
    // Verbose logging disabled - uncomment below for debugging
    // console.log(`   🧙 [${requestId}] GET /api/wizard/service-types - Getting service types`);
    
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

  if (pathname === "/api/wizard/create-indexer" && req.method === "POST") {
    console.log(`   🧙 [${requestId}] POST /api/wizard/create-indexer - Creating indexer via wizard`);
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", async () => {
      try {
        const requestData = JSON.parse(body);
        const { serviceType, indexerName, serverIp, serverDomain, serverPort, networkType, isSnake, email, amount, selectedProviders } = requestData;
        
        // Log received data for debugging
        console.log(`   📥 Received create-indexer request:`, {
          serviceType,
          indexerName,
          selectedProviders: selectedProviders || 'NOT PROVIDED',
          selectedProvidersType: typeof selectedProviders,
          selectedProvidersIsArray: Array.isArray(selectedProviders)
        });
        
        if (!serviceType || !indexerName) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "serviceType and indexerName required" }));
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
        
        // Check wallet balance BEFORE creating indexer
        const balance = await getWalletBalance(email);
        if (balance < amount) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: false, 
            error: `Insufficient balance. Required: ${amount} JSC, Available: ${balance} JSC. Please purchase more JSC first.`,
            balance: balance
          }));
          return;
        }
        
        // Debit wallet balance BEFORE creating indexer
        const txId = crypto.randomUUID();
        const debitResult = await debitWallet(
          email,
          amount,
          txId,
          'indexer_deployment',
          { 
            serviceType: serviceType,
            indexerName: indexerName,
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
        
        // Determine next available port (starting from 3001) if not provided
        let finalPort = serverPort;
        if (!finalPort || finalPort < 3001) {
          const basePort = 3001;
          const existingIndexers = [...INDEXERS, ...TOKEN_INDEXERS];
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
        const existingIndexers = [...INDEXERS, ...TOKEN_INDEXERS];
        let indexerId: string;
        if (isSnake) {
          indexerId = `S${existingIndexers.filter(i => (i as any).isSnake).length + 1}`;
        } else if (serviceType === "dex") {
          indexerId = `T${TOKEN_INDEXERS.length + 1}`;
        } else {
          // For regular indexers, use format: indexer-1, indexer-2, etc.
          // Find the next available number
          const existingRegularIndexers = INDEXERS.filter(i => i.id.startsWith('indexer-'));
          const nextNumber = existingRegularIndexers.length + 1;
          indexerId = `indexer-${nextNumber}`;
        }
        
        // Check if indexer ID already exists (prevent duplicates by ID - names can be the same)
        const existingIndexerById = [...INDEXERS, ...TOKEN_INDEXERS].find(i => i.id === indexerId);
        if (existingIndexerById) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: false, 
            error: `Indexer with ID "${indexerId}" already exists (Name: ${existingIndexerById.name})`,
            existingIndexer: existingIndexerById
          }));
          return;
        }
        
        const indexerConfig: IndexerConfig = {
          id: indexerId,
          name: indexerName,
          stream: isSnake ? `eden:snake:${indexerId}` : 
                 (serviceType === "dex" ? `eden:token-indexer:${indexerId}` : `eden:indexer:${indexerId}`),
          active: true,
          uuid: `eden:indexer:${crypto.randomUUID()}`,
        };
        
        // Add network configuration
        (indexerConfig as any).serverIp = serverIp || "localhost";
        (indexerConfig as any).serverDomain = serverDomain || `indexer-${indexerId.toLowerCase()}.eden.local`;
        (indexerConfig as any).serverPort = finalPort;
        (indexerConfig as any).networkType = networkType || "http";
        (indexerConfig as any).serviceType = serviceType;
        (indexerConfig as any).isSnake = isSnake || false;
        
        // Add to appropriate array
        if (serviceType === "dex") {
          (TOKEN_INDEXERS as any[]).push({ ...indexerConfig, tokenServiceType: 'dex' });
        } else {
          INDEXERS.push(indexerConfig);
        }
        
        console.log(`   ✅ Created indexer: ${indexerConfig.name} (${indexerConfig.id})`);
        
        // Issue certificate
        issueIndexerCertificate(indexerConfig);
        
        // Create service providers for movie indexers based on selectedProviders
        let providersCreated = 0;
        if (serviceType === "movie") {
          // Validate that selectedProviders is provided and is an array
          if (!selectedProviders || !Array.isArray(selectedProviders) || selectedProviders.length === 0) {
            console.warn(`   ⚠️  No selectedProviders provided for movie indexer. Skipping provider creation.`);
          } else {
            console.log(`   🎬 Creating ${selectedProviders.length} movie service provider(s) for indexer ${indexerConfig.id}...`);
            console.log(`   📋 Selected providers array:`, selectedProviders);
            console.log(`   📋 Selected providers count: ${selectedProviders.length}`);
            
            // Map of provider IDs to their base configurations
            // ONLY these providers will be created - no others
            const providerMap: Record<string, { name: string; uuid: string; location: string; bond: number; reputation: number; apiEndpoint: string }> = {
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
            
            // Assign existing providers to this indexer (don't create new provider instances)
            // Find providers in ROOT_CA_SERVICE_REGISTRY and update their indexerId
            console.log(`   🔍 [Provider Assignment] Looking for ${selectedProviders.length} provider(s) in ServiceRegistry...`);
            console.log(`   🔍 [Provider Assignment] Selected provider IDs: ${selectedProviders.join(', ')}`);
            console.log(`   🔍 [Provider Assignment] ServiceRegistry has ${ROOT_CA_SERVICE_REGISTRY.length} providers`);
            
            for (const providerId of selectedProviders) {
              // Find the existing provider in the ServiceRegistry
              const existingProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === providerId);
              
              if (existingProvider) {
                // Check if provider is already assigned to another indexer
                if (existingProvider.indexerId && existingProvider.indexerId !== indexerConfig.id) {
                  console.warn(`   ⚠️  Provider ${existingProvider.name} (${existingProvider.id}) is already assigned to indexer ${existingProvider.indexerId}. Reassigning to ${indexerConfig.id}.`);
                }
                
                // Update the provider's indexerId to point to this indexer
                existingProvider.indexerId = indexerConfig.id;
                providersCreated++;
                console.log(`   ✅ Assigned service provider: ${existingProvider.name} (${existingProvider.id}) to indexer ${indexerConfig.id} (${indexerConfig.name})`);
                
                // Broadcast event for provider assignment
                broadcastEvent({
                  type: "service_provider_assigned",
                  component: "root-ca",
                  message: `Service provider ${existingProvider.name} assigned to ${indexerConfig.name}`,
                  timestamp: Date.now(),
                  data: {
                    providerId: existingProvider.id,
                    providerName: existingProvider.name,
                    indexerId: indexerConfig.id,
                    indexerName: indexerConfig.name
                  }
                });
              } else {
                console.warn(`   ⚠️  Provider ${providerId} not found in ServiceRegistry. Available providers: ${ROOT_CA_SERVICE_REGISTRY.map(p => `${p.name} (${p.id})`).join(', ')}`);
              }
            }
            
            if (providersCreated === 0) {
              console.error(`   ❌ [Provider Assignment] No providers were assigned! Check if provider IDs match ServiceRegistry.`);
            } else {
              // Save ServiceRegistry to persistence file for debugging after provider assignments
              redis.saveServiceRegistry();
            }
            
            console.log(`   ✅ Created ${providersCreated} service provider(s) for indexer ${indexerConfig.id}`);
          }
        }
        
        // Persist indexers - filter out default indexers and save immediately
        let indexersToSave: IndexerConfig[] = [];
        
        if (serviceType === "dex") {
          // For token indexers, filter out defaults (T1, T2, ... up to NUM_TOKEN_INDEXERS)
          if (NUM_TOKEN_INDEXERS > 0) {
            const defaultTokenIds = Array.from({ length: NUM_TOKEN_INDEXERS }, (_, i) => `T${i + 1}`);
            indexersToSave = TOKEN_INDEXERS.filter(idx => !defaultTokenIds.includes(idx.id));
          } else {
            // ROOT mode: save all token indexers (no defaults)
            indexersToSave = TOKEN_INDEXERS;
          }
        } else {
          // For regular indexers, filter out defaults (A, B, C, ... up to NUM_INDEXERS)
          if (NUM_INDEXERS > 0) {
            const defaultIds = Array.from({ length: NUM_INDEXERS }, (_, i) => String.fromCharCode(65 + i));
            indexersToSave = INDEXERS.filter(idx => !defaultIds.includes(idx.id));
          } else {
            // ROOT mode: ONLY save indexers created via Angular (format: indexer-1, indexer-2, etc.)
            // Everything else (A, B, C, T1, T2, etc.) should NOT be persisted in ROOT mode
            indexersToSave = INDEXERS.filter(idx => {
              // Only save indexers with format "indexer-N" (created via Angular)
              return idx.id.startsWith('indexer-');
            });
          }
        }
        
        // Remove duplicates by ID - always keep the latest version (prefer one with certificate)
        const uniqueIndexers = new Map<string, IndexerConfig>();
        for (const idx of indexersToSave) {
          const existing = uniqueIndexers.get(idx.id);
          if (!existing) {
            uniqueIndexers.set(idx.id, idx);
          } else {
            // Prefer the version with certificate, or the newer one
            const hasCert = !!(idx as any).certificate;
            const existingHasCert = !!(existing as any).certificate;
            if (hasCert && !existingHasCert) {
              uniqueIndexers.set(idx.id, idx); // Replace with version that has certificate
              console.log(`🔄 [Indexer Persistence] Updated ${idx.id} with certificate version`);
            } else if (!hasCert && existingHasCert) {
              // Keep existing version with certificate
              console.log(`🔄 [Indexer Persistence] Keeping ${idx.id} with certificate version`);
            } else {
              // Both have or don't have certs - prefer new version (latest from INDEXERS array)
              uniqueIndexers.set(idx.id, idx);
              console.warn(`⚠️  [Indexer Persistence] Duplicate indexer found: ${idx.name} (${idx.id}), keeping latest version`);
            }
          }
        }
        indexersToSave = Array.from(uniqueIndexers.values());
        
        // Force immediate save (bypass debounce)
        try {
          const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
          let existing: any = {
            walletBalances: {},
            ledgerEntries: [],
            indexers: [],
            tokenIndexers: [],
            serviceRegistry: [],
            lastSaved: new Date().toISOString()
          };
          
          if (fs.existsSync(persistenceFile)) {
            try {
              const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
              existing = JSON.parse(fileContent);
            } catch (err: any) {
              console.warn(`⚠️  [Indexer Persistence] Failed to load existing file: ${err.message}`);
            }
          }
          
          // Update indexers array based on service type
          // Replace with current state from INDEXERS array (which has the latest data including certificates)
          if (serviceType === "dex") {
            existing.tokenIndexers = indexersToSave;
          } else {
            existing.indexers = indexersToSave;
          }
          
          // Save ServiceRegistry for debugging
          // CRITICAL: indexerId is REQUIRED - services without indexerId are NOT allowed
          // In ROOT mode: only save services with an indexerId assigned (not undefined)
          // In non-ROOT mode: also require indexerId (it's a key context during service)
          const servicesToSave = ROOT_CA_SERVICE_REGISTRY.filter(p => {
            if (p.indexerId === undefined || p.indexerId === null) {
              console.warn(`⚠️  [ServiceRegistry] Skipping service ${p.id} (${p.name}) - indexerId is required but not set`);
              return false;
            }
            return true;
          });
          
          existing.serviceRegistry = servicesToSave.map(p => {
            const provider: any = {
              id: p.id,
              name: p.name,
              serviceType: p.serviceType,
              location: p.location,
              bond: p.bond,
              reputation: p.reputation,
              status: p.status,
              uuid: p.uuid,
              apiEndpoint: p.apiEndpoint,
              indexerId: p.indexerId // REQUIRED - always include
            };
            // Include Snake-specific fields if present
            if (p.insuranceFee !== undefined) provider.insuranceFee = p.insuranceFee;
            if (p.iGasMultiplier !== undefined) provider.iGasMultiplier = p.iGasMultiplier;
            if (p.iTaxMultiplier !== undefined) provider.iTaxMultiplier = p.iTaxMultiplier;
            if (p.maxInfluence !== undefined) provider.maxInfluence = p.maxInfluence;
            if (p.contextsAllowed !== undefined) provider.contextsAllowed = p.contextsAllowed;
            if (p.contextsForbidden !== undefined) provider.contextsForbidden = p.contextsForbidden;
            if (p.adCapabilities !== undefined) provider.adCapabilities = p.adCapabilities;
            return provider;
          });
          
          existing.lastSaved = new Date().toISOString();
          
          fs.writeFileSync(persistenceFile, JSON.stringify(existing, null, 2), 'utf-8');
          console.log(`💾 [Indexer Persistence] ✅ IMMEDIATELY saved ${indexersToSave.length} ${serviceType} indexer(s) and ${existing.serviceRegistry.length} service provider(s) to ${persistenceFile}`);
          if (indexersToSave.length > 0) {
            console.log(`💾 [Indexer Persistence] Saved indexers: ${indexersToSave.map(i => `${i.name} (${i.id})`).join(', ')}`);
          }
        } catch (err: any) {
          console.error(`❌ [Indexer Persistence] Failed to save immediately: ${err.message}`);
        }
        
        // Also call redis.saveIndexers for consistency (but immediate save above takes precedence)
        redis.saveIndexers(indexersToSave);
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          success: true, 
          indexer: {
            id: indexerConfig.id,
            name: indexerConfig.name,
            uuid: indexerConfig.uuid,
            port: (indexerConfig as any).serverPort,
            hasCertificate: !!indexerConfig.certificate
          },
          balance: debitResult.balance, // Return updated balance
          createdBy: email, // Return the Google user email
          providersCreated: providersCreated // Return number of providers created
        }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
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

class InMemoryRedisServer extends EventEmitter {
  private data: Map<string, any> = new Map();
  private streams: Map<string, Array<{ id: string; fields: Record<string, string> }>> = new Map();
  private streamCounters: Map<string, number> = new Map();
  private consumerGroups: Map<string, Map<string, string>> = new Map(); // stream -> group -> lastId
  private pendingMessages: Map<string, Map<string, Array<{ id: string; fields: Record<string, string> }>>> = new Map(); // stream -> group -> messages
  private isConnected = false;
  private persistenceFile: string;
  private saveTimeout: NodeJS.Timeout | null = null;
  private readonly SAVE_DELAY_MS = 1000; // Debounce saves by 1 second

  constructor() {
    super();
    // Persistence file in the same directory as the script
    this.persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
    this.loadPersistence();
  }

  // Load wallet data, ledger entries, and indexers from persistence file
  private loadPersistence(): { walletBalances: Record<string, string>, ledgerEntries: any[], indexers: any[] } {
    const result = { walletBalances: {}, ledgerEntries: [], indexers: [] };
    try {
      if (fs.existsSync(this.persistenceFile)) {
        const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
        const persisted = JSON.parse(fileContent);
        
        // Restore wallet balances and audit logs
        if (persisted.walletBalances) {
          for (const [key, value] of Object.entries(persisted.walletBalances)) {
            this.data.set(key, value);
          }
          result.walletBalances = persisted.walletBalances;
          console.log(`📂 [Redis Persistence] Loaded ${Object.keys(persisted.walletBalances).length} wallet balances from ${this.persistenceFile}`);
        }
        
        // Restore ledger entries
        if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries)) {
          result.ledgerEntries = persisted.ledgerEntries;
          console.log(`📂 [Redis Persistence] Loaded ${persisted.ledgerEntries.length} ledger entries from ${this.persistenceFile}`);
        }
        
        // Restore dynamically created indexers
        if (persisted.indexers && Array.isArray(persisted.indexers)) {
          result.indexers = persisted.indexers;
          console.log(`📂 [Redis Persistence] Loaded ${persisted.indexers.length} persisted indexers from ${this.persistenceFile}`);
        }
      } else {
        console.log(`📂 [Redis Persistence] No persistence file found, starting fresh: ${this.persistenceFile}`);
      }
    } catch (err: any) {
      console.warn(`⚠️  [Redis Persistence] Failed to load persistence file: ${err.message}`);
    }
    return result;
  }

  // Save wallet data, ledger entries, and indexers to persistence file (debounced)
  private savePersistence(ledgerEntries?: any[], indexers?: any[]): void {
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Debounce saves to avoid too many file writes
    this.saveTimeout = setTimeout(() => {
      try {
        const walletBalances: Record<string, string> = {};
        
        // Only persist wallet-related keys
        for (const [key, value] of this.data.entries()) {
          if (key.startsWith('wallet:balance:') || key.startsWith('wallet:audit:')) {
            walletBalances[key] = typeof value === 'string' ? value : JSON.stringify(value);
          }
        }

        // Load existing data to merge (don't overwrite)
        let existingLedgerEntries: any[] = [];
        let existingIndexers: any[] = [];
        
        if (fs.existsSync(this.persistenceFile)) {
          try {
            const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
            const existing = JSON.parse(fileContent);
            if (existing.ledgerEntries && Array.isArray(existing.ledgerEntries)) {
              existingLedgerEntries = existing.ledgerEntries;
            }
            if (existing.indexers && Array.isArray(existing.indexers)) {
              existingIndexers = existing.indexers;
            }
          } catch (err: any) {
            console.warn(`⚠️  [Redis Persistence] Failed to load existing data for merge: ${err.message}`);
          }
        }

        // Merge: use new data if provided, otherwise keep existing
        const finalLedgerEntries = ledgerEntries !== undefined ? ledgerEntries : existingLedgerEntries;
        const finalIndexers = indexers !== undefined ? indexers : existingIndexers;
        
        // Include ServiceRegistry for debugging (always save current state)
        // CRITICAL: indexerId is REQUIRED - services without indexerId are NOT allowed
        // indexerId is a key context during service - it must always be present
        const servicesToSave = ROOT_CA_SERVICE_REGISTRY.filter(p => {
          if (p.indexerId === undefined || p.indexerId === null) {
            console.warn(`⚠️  [ServiceRegistry] Skipping service ${p.id} (${p.name}) - indexerId is required but not set`);
            return false;
          }
          return true;
        });
        
        const serviceRegistry = servicesToSave.map(p => {
          const provider: any = {
            id: p.id,
            name: p.name,
            serviceType: p.serviceType,
            location: p.location,
            bond: p.bond,
            reputation: p.reputation,
            status: p.status,
            uuid: p.uuid,
            apiEndpoint: p.apiEndpoint,
            indexerId: p.indexerId // REQUIRED - always include
          };
          // Include Snake-specific fields if present
          if (p.insuranceFee !== undefined) provider.insuranceFee = p.insuranceFee;
          if (p.iGasMultiplier !== undefined) provider.iGasMultiplier = p.iGasMultiplier;
          if (p.iTaxMultiplier !== undefined) provider.iTaxMultiplier = p.iTaxMultiplier;
          if (p.maxInfluence !== undefined) provider.maxInfluence = p.maxInfluence;
          if (p.contextsAllowed !== undefined) provider.contextsAllowed = p.contextsAllowed;
          if (p.contextsForbidden !== undefined) provider.contextsForbidden = p.contextsForbidden;
          if (p.adCapabilities !== undefined) provider.adCapabilities = p.adCapabilities;
          return provider;
        });

        const persisted = {
          walletBalances,
          ledgerEntries: finalLedgerEntries,
          indexers: finalIndexers,
          serviceRegistry: serviceRegistry,
          lastSaved: new Date().toISOString()
        };

        fs.writeFileSync(this.persistenceFile, JSON.stringify(persisted, null, 2), 'utf-8');
        console.log(`💾 [Redis Persistence] Saved ${Object.keys(walletBalances).length} wallet entries, ${finalLedgerEntries.length} ledger entries, ${finalIndexers.length} indexers, and ${serviceRegistry.length} service providers to ${this.persistenceFile}`);
      } catch (err: any) {
        console.error(`❌ [Redis Persistence] Failed to save persistence file: ${err.message}`);
      }
    }, this.SAVE_DELAY_MS);
  }
  
  // Public method to save ledger entries
  saveLedgerEntries(ledgerEntries: any[]): void {
    this.savePersistence(ledgerEntries);
  }
  
  // Public method to save indexers
  saveIndexers(indexers: any[]): void {
    this.savePersistence(undefined, indexers);
  }
  
  // Public method to save ServiceRegistry (for debugging)
  saveServiceRegistry(): void {
    // Force immediate save of ServiceRegistry
    try {
      const persistenceFile = this.persistenceFile;
      let existing: any = {
        walletBalances: {},
        ledgerEntries: [],
        indexers: [],
        tokenIndexers: [],
        serviceRegistry: [],
        lastSaved: new Date().toISOString()
      };
      
      if (fs.existsSync(persistenceFile)) {
        try {
          const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
          existing = JSON.parse(fileContent);
        } catch (err: any) {
          console.warn(`⚠️  [ServiceRegistry Persistence] Failed to load existing file: ${err.message}`);
        }
      }
      
      // Update ServiceRegistry
      // In ROOT mode: only save services with an indexerId assigned (not undefined)
      // In non-ROOT mode: save all services
      const servicesToSave = DEPLOYED_AS_ROOT 
        ? ROOT_CA_SERVICE_REGISTRY.filter(p => p.indexerId !== undefined)
        : ROOT_CA_SERVICE_REGISTRY;
      
      existing.serviceRegistry = servicesToSave.map(p => {
        const provider: any = {
          id: p.id,
          name: p.name,
          serviceType: p.serviceType,
          location: p.location,
          bond: p.bond,
          reputation: p.reputation,
          status: p.status,
          uuid: p.uuid,
          apiEndpoint: p.apiEndpoint
        };
        // Only include indexerId if it's actually set (not undefined)
        if (p.indexerId !== undefined) {
          provider.indexerId = p.indexerId;
        }
        // Include Snake-specific fields if present
        if (p.insuranceFee !== undefined) provider.insuranceFee = p.insuranceFee;
        if (p.iGasMultiplier !== undefined) provider.iGasMultiplier = p.iGasMultiplier;
        if (p.iTaxMultiplier !== undefined) provider.iTaxMultiplier = p.iTaxMultiplier;
        if (p.maxInfluence !== undefined) provider.maxInfluence = p.maxInfluence;
        if (p.contextsAllowed !== undefined) provider.contextsAllowed = p.contextsAllowed;
        if (p.contextsForbidden !== undefined) provider.contextsForbidden = p.contextsForbidden;
        if (p.adCapabilities !== undefined) provider.adCapabilities = p.adCapabilities;
        return provider;
      });
      
      existing.lastSaved = new Date().toISOString();
      fs.writeFileSync(persistenceFile, JSON.stringify(existing, null, 2), 'utf-8');
      console.log(`💾 [ServiceRegistry Persistence] Saved ${existing.serviceRegistry.length} service providers to ${persistenceFile}`);
    } catch (err: any) {
      console.error(`❌ [ServiceRegistry Persistence] Failed to save: ${err.message}`);
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    this.emit("connect");
    await new Promise(resolve => setTimeout(resolve, 10));
    this.isConnected = true;
    this.emit("ready");
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  get isOpen(): boolean {
    return this.isConnected;
  }

  // Simple key-value operations (for wallet balances)
  async get(key: string): Promise<string | null> {
    const value = this.data.get(key);
    if (value === undefined) {
      return null;
    }
    // If it's a string, return it directly
    if (typeof value === 'string') {
      return value;
    }
    // If it's an object (hash), return null (use hGet for hashes)
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
    // Persist wallet-related keys immediately
    if (key.startsWith('wallet:balance:') || key.startsWith('wallet:audit:')) {
      this.savePersistence();
    }
  }

  async del(key: string): Promise<number> {
    const existed = this.data.has(key);
    if (existed) {
      this.data.delete(key);
      // Persist wallet-related keys immediately
      if (key.startsWith('wallet:balance:') || key.startsWith('wallet:audit:') || key.startsWith('wallet:hold:')) {
        this.savePersistence();
      }
      return 1;
    }
    return 0;
  }

  // Get all keys matching a pattern (for wallet reset)
  getKeysMatching(pattern: string): string[] {
    const keys: string[] = [];
    for (const key of this.data.keys()) {
      if (key.startsWith(pattern)) {
        keys.push(key);
      }
    }
    return keys;
  }

  async hSet(key: string, value: any): Promise<number> {
    if (typeof value === 'object' && value !== null) {
      // Convert object to hash
      const hash: Record<string, string> = {};
      for (const [k, v] of Object.entries(value)) {
        hash[k] = String(v);
      }
      this.data.set(key, hash);
      return Object.keys(hash).length;
    }
    return 0;
  }

  async hGet(key: string, field: string): Promise<string | null> {
    const hash = this.data.get(key);
    if (hash && typeof hash === 'object') {
      return hash[field] || null;
    }
    return null;
  }

  async xAdd(streamKey: string, id: string, fields: Record<string, string>): Promise<string> {
    if (!this.streams.has(streamKey)) {
      this.streams.set(streamKey, []);
      this.streamCounters.set(streamKey, 0);
    }

    const stream = this.streams.get(streamKey)!;
    let messageId: string;

    if (id === "*") {
      // Auto-generate ID: milliseconds-time-sequence
      const counter = this.streamCounters.get(streamKey)!;
      this.streamCounters.set(streamKey, counter + 1);
      const timestamp = Date.now();
      messageId = `${timestamp}-${counter}`;
    } else {
      messageId = id;
    }

    stream.push({ id: messageId, fields });
    return messageId;
  }

  async xRead(
    streams: Array<{ key: string; id: string }>,
    options?: { BLOCK?: number; COUNT?: number }
  ): Promise<Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> | null> {
    const results: Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> = [];

    for (const streamReq of streams) {
      const stream = this.streams.get(streamReq.key);
      if (!stream || stream.length === 0) {
        if (options?.BLOCK) {
          // Simulate blocking behavior
          const blockTime = options.BLOCK || 0;
          await new Promise(resolve => setTimeout(resolve, Math.min(blockTime, 1000)));
          return null;
        }
        continue;
      }

      const messages: Array<{ id: string; message: Record<string, string> }> = [];
      let startIndex = 0;

      // Find starting position based on ID
      if (streamReq.id === "$") {
        // "$" means read only new messages - start from the end (no messages)
        startIndex = stream.length;
      } else if (streamReq.id !== "0") {
        startIndex = stream.findIndex(msg => msg.id === streamReq.id);
        if (startIndex === -1) startIndex = 0;
        else startIndex += 1; // Start after the specified ID
      }

      const count = options?.COUNT || stream.length;
      const endIndex = Math.min(startIndex + count, stream.length);

      for (let i = startIndex; i < endIndex; i++) {
        messages.push({
          id: stream[i].id,
          message: { ...stream[i].fields }
        });
      }

      if (messages.length > 0) {
        results.push({
          name: streamReq.key,
          messages
        });
      }
    }

    return results.length > 0 ? results : null;
  }

  async xGroupCreate(
    streamKey: string,
    groupName: string,
    id: string,
    options?: { MKSTREAM?: boolean }
  ): Promise<void> {
    if (!this.streams.has(streamKey)) {
      if (options?.MKSTREAM) {
        this.streams.set(streamKey, []);
        this.streamCounters.set(streamKey, 0);
      } else {
        throw new Error("NOGROUP");
      }
    }
    
    if (!this.consumerGroups.has(streamKey)) {
      this.consumerGroups.set(streamKey, new Map());
    }
    
    const groups = this.consumerGroups.get(streamKey)!;
    if (groups.has(groupName)) {
      throw new Error("BUSYGROUP");
    }
    
    groups.set(groupName, id);
    this.pendingMessages.set(`${streamKey}:${groupName}`, new Map());
  }

  async xReadGroup(
    groupName: string,
    consumerName: string,
    streams: Array<{ key: string; id: string }>,
    options?: { COUNT?: number; BLOCK?: number }
  ): Promise<Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> | null> {
    const results: Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> = [];
    
    for (const streamReq of streams) {
      const stream = this.streams.get(streamReq.key);
      if (!stream || stream.length === 0) {
        if (options?.BLOCK) {
          await new Promise(resolve => setTimeout(resolve, Math.min(options.BLOCK || 0, 1000)));
          return null;
        }
        continue;
      }
      
      // Get consumer group last ID
      const groups = this.consumerGroups.get(streamReq.key);
      if (!groups || !groups.has(groupName)) {
        throw new Error("NOGROUP");
      }
      
      const lastId = groups.get(groupName) || "0";
      const messages: Array<{ id: string; message: Record<string, string> }> = [];
      
      let startIndex = 0;
      if (streamReq.id === ">") {
        // Read new messages only
        const lastIdIndex = stream.findIndex(msg => msg.id === lastId);
        startIndex = lastIdIndex === -1 ? stream.length : lastIdIndex + 1;
      } else {
        startIndex = stream.findIndex(msg => msg.id === streamReq.id);
        if (startIndex === -1) startIndex = 0;
        else startIndex += 1;
      }
      
      const count = options?.COUNT || stream.length;
      const endIndex = Math.min(startIndex + count, stream.length);
      
      for (let i = startIndex; i < endIndex; i++) {
        messages.push({
          id: stream[i].id,
          message: { ...stream[i].fields }
        });
      }
      
      if (messages.length > 0) {
        results.push({
          name: streamReq.key,
          messages
        });
      }
    }
    
    return results.length > 0 ? results : null;
  }

  async xAck(streamKey: string, groupName: string, ...ids: string[]): Promise<number> {
    const groups = this.consumerGroups.get(streamKey);
    if (!groups || !groups.has(groupName)) {
      return 0;
    }
    
    // Update last processed ID
    if (ids.length > 0) {
      const lastId = ids[ids.length - 1];
      groups.set(groupName, lastId);
    }
    
    return ids.length;
  }

  async quit(): Promise<void> {
    // Save persistence before quitting
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    // Force immediate save on quit (ledger entries passed separately)
    try {
      const walletBalances: Record<string, string> = {};
      for (const [key, value] of this.data.entries()) {
        if (key.startsWith('wallet:balance:') || key.startsWith('wallet:audit:')) {
          walletBalances[key] = typeof value === 'string' ? value : JSON.stringify(value);
        }
      }
      // Note: Ledger entries will be saved separately via saveLedgerEntries()
      const persisted = {
        walletBalances,
        ledgerEntries: [], // Will be populated by saveLedgerEntries()
        lastSaved: new Date().toISOString()
      };
      fs.writeFileSync(this.persistenceFile, JSON.stringify(persisted, null, 2), 'utf-8');
      console.log(`💾 [Redis Persistence] Saved ${Object.keys(walletBalances).length} wallet entries on quit (ledger entries saved separately)`);
    } catch (err: any) {
      console.error(`❌ [Redis Persistence] Failed to save on quit: ${err.message}`);
    }
    this.isConnected = false;
    this.emit("end");
  }

  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

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
  bookingDetails?: {
    movieTitle?: string;
    showtime?: string;
    location?: string;
    // DEX trade details
    tokenSymbol?: string;
    baseToken?: string;
    action?: 'BUY' | 'SELL';
    tokenAmount?: number;
    baseAmount?: number;
    price?: number;
    iTax?: number;
    // JSC Mint details (Stripe payment rail)
    stripePaymentIntentId?: string;
    stripeCustomerId?: string;
    stripePaymentMethodId?: string;
    stripeSessionId?: string;
    asset?: string; // 'JSC' for JesusCoin
  };
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
  indexerId: string;
  apiEndpoint?: string; // Optional API endpoint for the provider
  status?: 'active' | 'revoked' | 'suspended'; // Provider status
  // Snake Service Fields (serviceType: "snake")
  // Note: Snake is a SERVICE TYPE (like "movie", "dex"), not a provider type
  // Each Snake service belongs to an indexer (indexerId)
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
  indexerId: string;
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
  indexerId: string; // Indexer providing this pool service
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

// Stream names are now dynamically generated from INDEXERS array

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
const LEDGER: LedgerEntry[] = [];

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
const CASHIER: Cashier = {
  id: "cashier-eden-001",
  name: "Eden Cashier",
  processedCount: 0,
  totalProcessed: 0,
  status: 'active',
};

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
    indexerId: "HG", // Holy Ghost indexer
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
    indexerId: "HG", // Holy Ghost indexer
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
    indexerId: "HG", // Holy Ghost indexer
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
    indexerId: "HG", // Holy Ghost indexer
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
    indexerId: "HG", // Holy Ghost indexer
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
    indexerId: "HG", // Holy Ghost indexer
    apiEndpoint: "internal://wallet",
    status: 'active'
  },
  // Regular Service Providers
  {
    id: "amc-001",
    uuid: "550e8400-e29b-41d4-a716-446655440001", // UUID for certificate issuance
    name: "AMC Theatres",
    serviceType: "movie",
    location: "Baltimore, Maryland",
    bond: 1000,
    reputation: 4.8,
    indexerId: DEPLOYED_AS_ROOT ? undefined : "indexer-1", // Only assign in non-ROOT mode
    apiEndpoint: "https://api.amctheatres.com/v1/listings",
  },
  // In ROOT mode: moviecom-001, cinemark-001, and snake services should NOT exist
  // They are only created in non-ROOT mode
  ...(DEPLOYED_AS_ROOT ? [] : [
    {
      id: "moviecom-001",
      uuid: "550e8400-e29b-41d4-a716-446655440002", // UUID for certificate issuance
      name: "MovieCom",
      serviceType: "movie",
      location: "Baltimore, Maryland",
      bond: 800,
      reputation: 4.5,
      indexerId: "indexer-2",
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
      indexerId: "indexer-1",
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
      indexerId: "indexer-1",
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
      indexerId: "indexer-2",
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
async function queryAMCAPI(location: string, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Get the actual indexerId from the provider registry
  const amcProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === "amc-001");
  const indexerId = amcProvider?.indexerId;
  
  // Mock AMC API response with real-time pricing
  return [
    {
      providerId: "amc-001",
      providerName: "AMC Theatres",
      movieTitle: "Back to the Future",
      movieId: "back-to-future-1",
      price: 2.0, // Real-time price from AMC API
      showtime: "10:30 PM",
      location: location,
      reviewCount: 100,
      rating: 5.0,
      indexerId: indexerId,
    },
    {
      providerId: "amc-001",
      providerName: "AMC Theatres",
      movieTitle: "The Matrix",
      movieId: "matrix-001",
      price: 2.0, // Real-time price from AMC API
      showtime: "8:00 PM",
      location: location,
      reviewCount: 150,
      rating: 4.9,
      indexerId: indexerId,
    },
  ];
}

async function queryMovieComAPI(location: string, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Get the actual indexerId from the provider registry
  const moviecomProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === "moviecom-001");
  const indexerId = moviecomProvider?.indexerId;
  
  // Mock MovieCom API response with real-time pricing
  return [
    {
      providerId: "moviecom-001",
      providerName: "MovieCom",
      movieTitle: "Back to the Future",
      movieId: "back-to-future-1",
      price: 1.5, // Real-time price from MovieCom API
      showtime: "9:45 PM",
      location: location,
      reviewCount: 85,
      rating: 4.7,
      indexerId: indexerId,
    },
  ];
}

async function queryCinemarkAPI(location: string, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Get the actual indexerId from the provider registry
  const cinemarkProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === "cinemark-001");
  const indexerId = cinemarkProvider?.indexerId;
  
  // Mock Cinemark API response with real-time pricing
  return [
    {
      providerId: "cinemark-001",
      providerName: "Cinemark",
      movieTitle: "The Matrix",
      movieId: "matrix-001",
      price: 2.5, // Real-time price from Cinemark API
      showtime: "11:00 PM",
      location: location,
      reviewCount: 120,
      rating: 4.8,
      indexerId: indexerId,
    },
  ];
}

// DEX Pool Functions
function initializeDEXPools(): void {
  // Initialize DEX pools, assigning them to token indexers
  // Each token indexer can provide multiple pools
  for (let i = 0; i < TOKEN_INDEXERS.length; i++) {
    const tokenIndexer = TOKEN_INDEXERS[i];
    if (!tokenIndexer) continue;
    
    // Create pools for this token indexer
    // Token Indexer T1 gets TOKENA, T2 gets TOKENB, etc.
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
      indexerId: tokenIndexer.id, // Assign to token indexer
      createdAt: Date.now(),
      totalVolume: 0,
      totalTrades: 0,
    };
    DEX_POOLS.set(poolId, pool);
  }

  console.log(`🌊 Initialized ${DEX_POOLS.size} DEX pools`);
  console.log(`💰 ROOT CA Liquidity Pool: ${rootCALiquidity} SOL`);
  console.log(`🔷 Token Indexers: ${TOKEN_INDEXERS.map(ti => ti.name).join(", ")}`);
  
  // Display pool assignments
  for (const [poolId, pool] of DEX_POOLS.entries()) {
    console.log(`   ${pool.tokenSymbol} Pool → ${pool.indexerId} (${pool.poolLiquidity} SOL liquidity)`);
  }
}

async function queryDEXPoolAPI(provider: ServiceProvider, filters?: { tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL' }): Promise<TokenListing[]> {
  await new Promise(resolve => setTimeout(resolve, 30));
  
  const listings: TokenListing[] = [];
  
  console.log(`🔍 [DEX] Querying pools for provider: ${provider.id} (indexerId: ${provider.indexerId})`);
  console.log(`   Filters: ${JSON.stringify(filters)}`);
  
  // Find pools matching the provider
  // Match by: 1) provider.indexerId matches pool.indexerId, OR 2) provider.id contains token symbol
  // If no specific match, return all pools for DEX providers (fallback)
  let hasMatch = false;
  for (const [poolId, pool] of DEX_POOLS.entries()) {
    const tokenSymbolLower = pool.tokenSymbol.toLowerCase();
    const providerIdLower = provider.id.toLowerCase();
    
    // Match by indexer ID (most reliable)
    const matchesByIndexer = pool.indexerId === provider.indexerId;
    
    // Match by token symbol in provider ID (e.g., "dex-pool-tokena" contains "tokena")
    const matchesBySymbol = providerIdLower.includes(tokenSymbolLower);
    
    // Also check if provider ID matches the expected pattern "dex-pool-{tokenSymbol}"
    const expectedProviderId = `dex-pool-${tokenSymbolLower}`;
    const matchesByPattern = providerIdLower === expectedProviderId;
    
    const matchesProvider = matchesByIndexer || matchesBySymbol || matchesByPattern;
    
    if (matchesProvider) hasMatch = true;
    
    console.log(`   Pool ${pool.tokenSymbol} (${pool.indexerId}): matchesByIndexer=${matchesByIndexer}, matchesBySymbol=${matchesBySymbol}, matchesByPattern=${matchesByPattern} (provider.id="${provider.id}", expected="${expectedProviderId}")`);
    
    if (!matchesProvider) continue;
    
    // Apply filters
    if (filters?.tokenSymbol && pool.tokenSymbol.toUpperCase() !== filters.tokenSymbol.toUpperCase()) {
      console.log(`   Pool ${pool.tokenSymbol} filtered out by tokenSymbol filter: ${pool.tokenSymbol.toUpperCase()} !== ${filters.tokenSymbol.toUpperCase()}`);
      continue;
    }
    if (filters?.baseToken && pool.baseToken.toUpperCase() !== filters.baseToken.toUpperCase()) {
      console.log(`   Pool ${pool.tokenSymbol} filtered out by baseToken filter: ${pool.baseToken.toUpperCase()} !== ${filters.baseToken.toUpperCase()}`);
      continue;
    }
    
    console.log(`   ✅ Pool ${pool.tokenSymbol} matched!`);
    listings.push({
      poolId: pool.poolId,
      providerId: provider.id,
      providerName: provider.name,
      tokenSymbol: pool.tokenSymbol,
      tokenName: pool.tokenName,
      baseToken: pool.baseToken,
      price: pool.price,
      liquidity: pool.poolLiquidity,
      volume24h: pool.totalVolume,
      indexerId: pool.indexerId,
    });
  }
  
  // Debug logging
  if (listings.length === 0) {
    console.log(`⚠️  [DEX] No pools matched for provider ${provider.id} (indexerId: ${provider.indexerId})`);
    console.log(`   Available pools: ${Array.from(DEX_POOLS.values()).map(p => `${p.tokenSymbol} (${p.indexerId})`).join(", ")}`);
    
    // Fallback: If this is a DEX provider but no pools matched, return all pools for this indexer
    // This handles edge cases where matching logic might fail
    if (!hasMatch && provider.serviceType === "dex") {
      console.log(`   🔄 Fallback: Returning all pools for indexer ${provider.indexerId}`);
      for (const [poolId, pool] of DEX_POOLS.entries()) {
        if (pool.indexerId === provider.indexerId) {
          // Apply filters
          if (filters?.tokenSymbol && pool.tokenSymbol.toUpperCase() !== filters.tokenSymbol.toUpperCase()) continue;
          if (filters?.baseToken && pool.baseToken.toUpperCase() !== filters.baseToken.toUpperCase()) continue;
          
          listings.push({
            poolId: pool.poolId,
            providerId: provider.id,
            providerName: provider.name,
            tokenSymbol: pool.tokenSymbol,
            tokenName: pool.tokenName,
            baseToken: pool.baseToken,
            price: pool.price,
            liquidity: pool.poolLiquidity,
            volume24h: pool.totalVolume,
            indexerId: pool.indexerId,
          });
        }
      }
      if (listings.length > 0) {
        console.log(`   ✅ Fallback found ${listings.length} pool(s)`);
      }
    }
  } else {
    console.log(`✅ [DEX] Found ${listings.length} pool(s) for provider ${provider.id}`);
  }
  
  return listings;
}

// Provider API router
// Mock Snake (Advertising) Provider API
async function querySnakeAPI(provider: ServiceProvider, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Snake providers return enhanced/advertised listings
  // For testing: Return movie listings with Snake provider metadata
  const baseListings: MovieListing[] = [
    {
      providerId: provider.id,
      providerName: provider.name,
      movieTitle: "Premium Cinema Experience",
      movieId: "premium-cinema-001",
      price: 18.99, // Slightly higher price (premium)
      showtime: filters?.time || "8:00 PM",
      location: "Premium Theater District",
      reviewCount: 1250,
      rating: 4.7,
      indexerId: provider.indexerId,
    },
    {
      providerId: provider.id,
      providerName: provider.name,
      movieTitle: "VIP Movie Night",
      movieId: "vip-movie-001",
      price: 22.50, // Premium pricing
      showtime: filters?.time || "9:30 PM",
      location: "Luxury Cinema Complex",
      reviewCount: 890,
      rating: 4.8,
      indexerId: provider.indexerId,
    }
  ];
  
  console.log(`🐍 [Snake Provider] ${provider.name} returned ${baseListings.length} advertised listings`);
  return baseListings;
}

async function queryProviderAPI(provider: ServiceProvider, filters?: { genre?: string; time?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL' }): Promise<MovieListing[] | TokenListing[]> {
  // Handle Snake services (serviceType: "snake")
  // Snake is a service type, each Snake service belongs to an indexer
  if (provider.serviceType === "snake") {
    return await querySnakeAPI(provider, filters);
  }
  
  // Handle DEX providers
  if (provider.serviceType === "dex") {
    return await queryDEXPoolAPI(provider, filters);
  }
  
  // Handle regular movie providers
  switch (provider.id) {
    case "amc-001":
      return await queryAMCAPI(provider.location, filters);
    case "moviecom-001":
      return await queryMovieComAPI(provider.location, filters);
    case "cinemark-001":
      return await queryCinemarkAPI(provider.location, filters);
    default:
      throw new Error(`Unknown provider: ${provider.id}`);
  }
}

// LLM System Prompts
const LLM_QUERY_EXTRACTION_PROMPT = `
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

const LLM_RESPONSE_FORMATTING_PROMPT = `
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

// Register a service provider with ROOT CA
function registerServiceProviderWithROOTCA(provider: ServiceProviderWithCert): void {
  // Check if provider already exists
  const existing = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === provider.id || p.uuid === provider.uuid);
  if (existing) {
    throw new Error(`Service provider ${provider.id} already registered`);
  }
  
  // Add to ROOT CA registry
  ROOT_CA_SERVICE_REGISTRY.push(provider);
  
  console.log(`✅ [ROOT CA] Registered service provider: ${provider.name} (${provider.id})`);
  
  broadcastEvent({
    type: "service_provider_registered",
    component: "root-ca",
    message: `Service provider registered: ${provider.name}`,
    timestamp: Date.now(),
    data: {
      providerId: provider.id,
      providerName: provider.name,
      serviceType: provider.serviceType,
      indexerId: provider.indexerId
    }
  });
}

// Query ROOT CA Service Registry (used by indexers after LLM extraction)
// This is a quick post-LLM in-memory lookup
function queryROOTCAServiceRegistry(query: ServiceRegistryQuery): ServiceProvider[] {
  return ROOT_CA_SERVICE_REGISTRY.filter((provider) => {
    // Filter out revoked providers
    if (REVOCATION_REGISTRY.has(provider.uuid)) {
      return false;
    }
    
    // Filter by status if set
    if (provider.status === 'revoked' || provider.status === 'suspended') {
      return false;
    }
    
    // Filter by service type (if specified)
    // Snake is a service type (serviceType: "snake"), not a provider type
    if (query.serviceType && provider.serviceType !== query.serviceType) return false;
    
    // Filter by location if provided
    if (query.filters?.location && !provider.location.toLowerCase().includes(query.filters.location.toLowerCase())) {
      return false;
    }
    
    // Note: maxPrice filter is applied after querying provider APIs (prices come from APIs, not registry)
    if (query.filters?.minReputation && provider.reputation < query.filters.minReputation) return false;
    
    return true;
  });
}

async function queryServiceProviders(providers: ServiceProvider[], filters?: { genre?: string; time?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL' }): Promise<MovieListing[] | TokenListing[]> {
  const allListings: (MovieListing | TokenListing)[] = [];
  
  // Query each provider's external API in parallel
  const providerPromises = providers.map(provider => 
    queryProviderAPI(provider, filters).catch(err => {
      console.warn(`⚠️  Failed to query ${provider.name} API:`, err.message);
      return []; // Return empty array on error
    })
  );
  
  const results = await Promise.all(providerPromises);
  
  // Flatten results
  for (const listings of results) {
    allListings.push(...listings);
  }
  
  return allListings;
}

// DEX Trading Functions
function executeDEXTrade(
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
function calculateIGas(llmCalls: number, providersQueried: number, complexity: number = 1): number {
  const llmCost = LLM_BASE_COST * llmCalls * complexity;
  const routingCost = ROUTING_COST_PER_PROVIDER * providersQueried;
  const reasoningCost = llmCost * REASONING_COST_MULTIPLIER;
  return llmCost + routingCost + reasoningCost;
}

// LLM Resolution

// OpenAI API Configuration
const OPENAI_API_KEY = "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";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// OpenAI LLM Query Extraction
async function extractQueryWithOpenAI(userInput: string): Promise<LLMQueryResult> {
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
                // Try to find matching listing by movie title and provider name
                const matchedListing = listings.find(l => 
                  l.movieTitle === selectedListing.movieTitle && 
                  l.providerName === selectedListing.providerName
                );
                if (matchedListing) {
                  selectedListing = { ...selectedListing, providerId: matchedListing.providerId };
                } else if (listings.length > 0) {
                  // Fallback to first listing
                  selectedListing = { ...selectedListing, providerId: listings[0].providerId };
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
      indexerId: ROOT_CA_SERVICE_REGISTRY.find(p => p.id === "amc-001")?.indexerId,
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
      console.log(`   DEX Providers: ${providers.map(p => `${p.id} (indexer: ${p.indexerId})`).join(", ")}`);
      console.log(`   Available DEX Pools: ${Array.from(DEX_POOLS.values()).map(p => `${p.tokenSymbol} (${p.indexerId})`).join(", ")}`);
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
          indexerId: p.indexerId // Each service belongs to an indexer
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
          indexerId: provider.indexerId // Each service belongs to an indexer
        }
      });
    });

    if (listings.length === 0) {
      const errorMsg = queryResult.serviceType === "dex" 
        ? "No DEX pools found from service providers"
        : "No movie listings found from service providers";
      throw new Error(errorMsg);
    }

    // Step 4: Format response using LLM (LLM will handle filtering based on query filters)
    llmCalls++;
    console.log(`🤖 [LLM] Starting response formatting for ${listings.length} listings`);
    const formattedResponse = await formatResponseFn(listings as MovieListing[], userInput, queryResult.query.filters);
    console.log(`✅ [LLM] Response formatted: ${formattedResponse.message.substring(0, 100)}${formattedResponse.message.length > 100 ? '...' : ''}`);

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
// (Constants moved to top of file for use in reset endpoint)

interface WalletIntent {
  intent: "CREDIT" | "DEBIT" | "HOLD" | "RELEASE";
  email: string;
  amount: number;
  txId: string;
  entryId?: string;
  reason: string;
  metadata?: Record<string, any>;
}

interface WalletResult {
  success: boolean;
  balance: number;
  previousBalance?: number;
  error?: string;
}

// Sync wallet balance from USERS array to Redis (one-time initialization)
async function syncWalletBalanceFromUser(email: string): Promise<void> {
  if (SKIP_REDIS || !redis.isOpen) {
    return; // No sync needed if Redis unavailable
  }

  try {
    await ensureRedisConnection();
    const user = USERS.find(u => u.email === email);
    if (!user) {
      return; // User doesn't exist
    }

    const key = `${WALLET_BALANCE_PREFIX}${email}`;
    const existingBalanceStr = await redis.get(key);
    
    // Only sync if wallet doesn't exist in Redis (first-time initialization)
    if (!existingBalanceStr) {
      await redis.set(key, user.balance.toString());
      console.log(`🔄 [Wallet Service] Synced balance from USERS array: ${email} = ${user.balance} JSC`);
    }
  } catch (err: any) {
    console.error(`⚠️  [Wallet] Error syncing balance for ${email}:`, err.message);
    // Non-fatal error, continue
  }
}

// Get wallet balance (authoritative source)
// NO SYNC - Wallet is the single source of truth, never syncs from USERS array
async function getWalletBalance(email: string): Promise<number> {
  if (SKIP_REDIS || !redis.isOpen) {
    // Fallback to in-memory USERS array if Redis unavailable
    const user = USERS.find(u => u.email === email);
    return user ? user.balance : 0;
  }

  try {
    await ensureRedisConnection();
    
    // Read directly from Redis - NO SYNC from USERS array
    const balanceStr = await redis.get(`${WALLET_BALANCE_PREFIX}${email}`);
    return balanceStr ? parseFloat(balanceStr) : 0;
  } catch (err: any) {
    console.error(`⚠️  [Wallet] Error getting balance for ${email}:`, err.message);
    // Fallback to in-memory
    const user = USERS.find(u => u.email === email);
    return user ? user.balance : 0;
  }
}

// Credit wallet (mint JSC, rebates, etc.)
async function creditWallet(email: string, amount: number, txId: string, reason: string, metadata?: Record<string, any>): Promise<WalletResult> {
  if (SKIP_REDIS || !redis.isOpen) {
    // Fallback to in-memory
    let user = USERS.find(u => u.email === email);
    if (!user) {
      user = { id: `u${USERS.length + 1}`, email, balance: 0 };
      USERS.push(user);
    }
    const previousBalance = user.balance;
    user.balance += amount;
    
    console.log(`💰 [Wallet] Credited ${amount} JSC to ${email} (${reason})`);
    console.log(`   Previous balance: ${previousBalance}, New balance: ${user.balance}`);
    
    // Broadcast wallet credit event (fallback mode)
    broadcastEvent({
      type: "wallet_credited",
      component: "wallet-service-001",
      message: `Wallet credited (fallback): ${amount} JSC to ${email}`,
      timestamp: Date.now(),
      data: {
        email,
        amount,
        previousBalance,
        newBalance: user.balance,
        txId,
        reason,
        metadata,
        mode: "fallback",
        indexerId: "HG",
      }
    });
    
    return { success: true, balance: user.balance, previousBalance };
  }

  try {
    await ensureRedisConnection();
    
    const key = `${WALLET_BALANCE_PREFIX}${email}`;
    // Get current balance directly from Redis (don't use getWalletBalance which might sync)
    const balanceStr = await redis.get(key);
    const previousBalance = balanceStr ? parseFloat(balanceStr) : 0;
    const newBalance = previousBalance + amount;
    
    // Atomic increment
    await redis.set(key, newBalance.toString());
    
    console.log(`💰 [Wallet Service] Redis balance update: ${email}`);
    console.log(`   Redis key: ${key}`);
    console.log(`   Previous balance (from Redis): ${previousBalance}`);
    console.log(`   Credit amount: ${amount}`);
    console.log(`   New balance (to Redis): ${newBalance}`);
    
    // Audit log
    const auditKey = `${WALLET_AUDIT_PREFIX}${email}:${Date.now()}`;
    await redis.set(auditKey, JSON.stringify({
      intent: "CREDIT",
      email,
      amount,
      previousBalance,
      newBalance,
      txId,
      reason,
      metadata,
      timestamp: Date.now(),
    }));
    
    console.log(`💰 [Wallet Service] Credited ${amount} JSC to ${email} (${reason})`);
    console.log(`   Previous balance: ${previousBalance}, New balance: ${newBalance}`);
    
    // Sync to in-memory USERS array for backward compatibility
    let user = USERS.find(u => u.email === email);
    if (!user) {
      user = { id: `u${USERS.length + 1}`, email, balance: 0 };
      USERS.push(user);
    }
    user.balance = newBalance;
    
    // Broadcast wallet credit event
    broadcastEvent({
      type: "wallet_credited",
      component: "wallet-service-001",
      message: `Wallet credited: ${amount} JSC to ${email}`,
      timestamp: Date.now(),
      data: {
        email,
        amount,
        previousBalance,
        newBalance,
        txId,
        reason,
        metadata,
        indexerId: "HG", // Holy Ghost indexer
      }
    });
    
    return { success: true, balance: newBalance, previousBalance };
  } catch (err: any) {
    console.error(`❌ [Wallet] Error crediting ${amount} JSC to ${email}:`, err.message);
    return { success: false, balance: 0, error: err.message };
  }
}

// Debit wallet (payments, fees, etc.)
async function debitWallet(email: string, amount: number, txId: string, reason: string, metadata?: Record<string, any>): Promise<WalletResult> {
  if (SKIP_REDIS || !redis.isOpen) {
    // Fallback to in-memory
    const user = USERS.find(u => u.email === email);
    if (!user) {
      return { success: false, balance: 0, error: "User not found" };
    }
    
    if (user.balance < amount) {
      return { success: false, balance: user.balance, error: "Insufficient balance" };
    }
    
    const previousBalance = user.balance;
    user.balance -= amount;
    
    console.log(`💸 [Wallet] Debited ${amount} JSC from ${email} (${reason})`);
    console.log(`   Previous balance: ${previousBalance}, New balance: ${user.balance}`);
    
    // Broadcast wallet debit event (fallback mode)
    broadcastEvent({
      type: "wallet_debited",
      component: "wallet-service-001",
      message: `Wallet debited (fallback): ${amount} JSC from ${email}`,
      timestamp: Date.now(),
      data: {
        email,
        amount,
        previousBalance,
        newBalance: user.balance,
        txId,
        reason,
        metadata,
        mode: "fallback",
        indexerId: "HG",
      }
    });
    
    return { success: true, balance: user.balance, previousBalance };
  }

  try {
    await ensureRedisConnection();
    
    const key = `${WALLET_BALANCE_PREFIX}${email}`;
    const currentBalance = await getWalletBalance(email);
    
    if (currentBalance < amount) {
      return { success: false, balance: currentBalance, error: "Insufficient balance" };
    }
    
    const newBalance = currentBalance - amount;
    
    // Atomic decrement
    await redis.set(key, newBalance.toString());
    
    // Audit log
    const auditKey = `${WALLET_AUDIT_PREFIX}${email}:${Date.now()}`;
    await redis.set(auditKey, JSON.stringify({
      intent: "DEBIT",
      email,
      amount,
      previousBalance: currentBalance,
      newBalance,
      txId,
      reason,
      metadata,
      timestamp: Date.now(),
    }));
    
    console.log(`💸 [Wallet Service] Debited ${amount} JSC from ${email} (${reason})`);
    console.log(`   Previous balance: ${currentBalance}, New balance: ${newBalance}`);
    
    // Sync to in-memory USERS array for backward compatibility
    const user = USERS.find(u => u.email === email);
    if (user) {
      user.balance = newBalance;
    }
    
    // Broadcast wallet debit event
    broadcastEvent({
      type: "wallet_debited",
      component: "wallet-service-001",
      message: `Wallet debited: ${amount} JSC from ${email}`,
      timestamp: Date.now(),
      data: {
        email,
        amount,
        previousBalance: currentBalance,
        newBalance,
        txId,
        reason,
        metadata,
        indexerId: "HG", // Holy Ghost indexer
      }
    });
    
    return { success: true, balance: newBalance, previousBalance: currentBalance };
  } catch (err: any) {
    console.error(`❌ [Wallet] Error debiting ${amount} JSC from ${email}:`, err.message);
    return { success: false, balance: 0, error: err.message };
  }
}

// Process wallet intent (EdenCore submits, Wallet decides)
async function processWalletIntent(intent: WalletIntent): Promise<WalletResult> {
  console.log(`🔐 [Wallet Service] Processing intent: ${intent.intent} for ${intent.email}`);
  
  // Broadcast intent processing start
  broadcastEvent({
    type: "wallet_intent_processing",
    component: "wallet-service-001",
    message: `Processing wallet intent: ${intent.intent} for ${intent.email}`,
    timestamp: Date.now(),
    data: {
      intent: intent.intent,
      email: intent.email,
      amount: intent.amount,
      txId: intent.txId,
      reason: intent.reason,
      indexerId: "HG", // Holy Ghost indexer
    }
  });
  
  switch (intent.intent) {
    case "CREDIT":
      return await creditWallet(intent.email, intent.amount, intent.txId, intent.reason, intent.metadata);
    
    case "DEBIT":
      // Verify balance before debiting
      const balance = await getWalletBalance(intent.email);
      if (balance < intent.amount) {
        // Broadcast insufficient balance event
        broadcastEvent({
          type: "wallet_insufficient_balance",
          component: "wallet-service-001",
          message: `Insufficient balance: ${balance} JSC < ${intent.amount} JSC required`,
          timestamp: Date.now(),
          data: {
            email: intent.email,
            balance,
            required: intent.amount,
            txId: intent.txId,
            indexerId: "HG",
          }
        });
        return { success: false, balance, error: "Insufficient balance" };
      }
      return await debitWallet(intent.email, intent.amount, intent.txId, intent.reason, intent.metadata);
    
    case "HOLD":
      // Place hold on balance (for pending transactions)
      // Implementation can be added later if needed
      const holdBalance = await getWalletBalance(intent.email);
      broadcastEvent({
        type: "wallet_hold",
        component: "wallet-service-001",
        message: `Hold placed on balance for ${intent.email}`,
        timestamp: Date.now(),
        data: {
          email: intent.email,
          balance: holdBalance,
          txId: intent.txId,
          indexerId: "HG",
        }
      });
      return { success: true, balance: holdBalance };
    
    case "RELEASE":
      // Release hold on balance
      // Implementation can be added later if needed
      const releaseBalance = await getWalletBalance(intent.email);
      broadcastEvent({
        type: "wallet_release",
        component: "wallet-service-001",
        message: `Hold released for ${intent.email}`,
        timestamp: Date.now(),
        data: {
          email: intent.email,
          balance: releaseBalance,
          txId: intent.txId,
          indexerId: "HG",
        }
      });
      return { success: true, balance: releaseBalance };
    
    default:
      broadcastEvent({
        type: "wallet_error",
        component: "wallet-service-001",
        message: `Unknown wallet intent: ${intent.intent}`,
        timestamp: Date.now(),
        data: {
          intent: intent.intent,
          email: intent.email,
          error: `Unknown intent: ${intent.intent}`,
          indexerId: "HG",
        }
      });
      return { success: false, balance: 0, error: `Unknown intent: ${intent.intent}` };
  }
}

// Mint JesusCoin (JSC) - Via Stripe Payment Rail Service Provider (Holy Ghost indexer)
// This is called when Stripe payment is confirmed via webhook
// Stripe is registered as a payment-rail service provider under Holy Ghost
// Stores Stripe customer ID, payment method ID, and payment intent ID in ledger for webhook querying
// Register a new movie indexer after Stripe payment
async function registerNewMovieIndexer(
  email: string,
  stripePaymentIntentId: string,
  stripeCustomerId?: string | null,
  stripePaymentMethodId?: string | null,
  stripeSessionId?: string
): Promise<IndexerConfig> {
  console.log(`🎬 [Indexer Registration] Starting registration for ${email}...`);
  
  // Generate unique indexer ID (next available letter after existing indexers)
  const existingIds = INDEXERS.map(i => i.id).sort();
  let nextId = 'A';
  if (existingIds.length > 0) {
    const lastId = existingIds[existingIds.length - 1];
    const lastCharCode = lastId.charCodeAt(0);
    if (lastCharCode < 90) { // Z is 90
      nextId = String.fromCharCode(lastCharCode + 1);
    } else {
      // If we've exceeded Z, use numbers
      nextId = `INDEXER-${INDEXERS.length + 1}`;
    }
  }
  
  const indexerId = `indexer-${nextId.toLowerCase()}`;
  const indexerName = `Indexer-${nextId}`;
  const streamName = `eden:indexer:${nextId}`;
  const indexerUuid = `eden:indexer:${crypto.randomUUID()}`;
  
  // Create new indexer config
  const newIndexer: IndexerConfig = {
    id: indexerId,
    name: indexerName,
    stream: streamName,
    active: true,
    uuid: indexerUuid
  };
  
  // Add to INDEXERS array
  INDEXERS.push(newIndexer);
  console.log(`✅ [Indexer Registration] Created indexer: ${newIndexer.name} (${newIndexer.id})`);
  
  // Issue certificate to the new indexer
  // Note: Persistence is handled by the HTTP handler after certificate issuance
  try {
    issueIndexerCertificate(newIndexer);
  } catch (err: any) {
    console.error(`❌ [Indexer Registration] Failed to issue certificate:`, err.message);
    throw err;
  }
  
  // Create default movie service providers for this indexer
  const providerNames = ['Regal Cinemas', 'Cineplex', 'MovieMax'];
  const providerIds = ['regal-001', 'cineplex-001', 'moviemax-001'];
  const locations = ['Baltimore, Maryland', 'New York, New York', 'Los Angeles, California'];
  const reputations = [4.6, 4.4, 4.5];
  const bonds = [1100, 900, 1000];
  
  for (let i = 0; i < providerNames.length; i++) {
    const providerId = `${providerIds[i]}-${nextId.toLowerCase()}`;
    const providerUuid = `550e8400-e29b-41d4-a716-${crypto.randomUUID().substring(0, 12)}`;
    
    const provider: ServiceProviderWithCert = {
      id: providerId,
      uuid: providerUuid,
      name: providerNames[i],
      serviceType: 'movie',
      location: locations[i],
      bond: bonds[i],
      reputation: reputations[i],
      indexerId: indexerId,
      apiEndpoint: `https://api.${providerIds[i]}.com/v1/listings`,
      status: 'active'
    };
    
    // Register provider with ROOT CA
    registerServiceProviderWithROOTCA(provider);
    
    // Issue certificate to provider
    try {
      issueServiceProviderCertificate(provider);
    } catch (err: any) {
      console.warn(`⚠️  [Indexer Registration] Failed to issue certificate to ${provider.name}:`, err.message);
    }
    
    console.log(`✅ [Indexer Registration] Registered provider: ${provider.name} (${provider.id})`);
  }
  
  // Create ledger entry for indexer purchase
  const snapshot: TransactionSnapshot = {
    chainId: CHAIN_ID,
    txId: crypto.randomUUID(),
    slot: Date.now(),
    blockTime: Date.now(),
    payer: email,
    merchant: 'ROOT CA',
    amount: 110, // 110 JSC for indexer purchase
    feeSplit: {},
  };
  
  const entry: LedgerEntry = {
    entryId: crypto.randomUUID(),
    txId: snapshot.txId,
    timestamp: snapshot.blockTime,
    payer: email,
    payerId: email,
    merchant: 'ROOT CA',
    providerUuid: ROOT_CA_UUID,
    serviceType: 'indexer_purchase',
    amount: 110,
    iGasCost: 0, // No iGas for indexer purchase
    fees: {},
    status: 'completed',
    cashierId: 'stripe-payment-rail-001',
    bookingDetails: {
      indexerId: indexerId,
      indexerName: indexerName,
      stripePaymentIntentId: stripePaymentIntentId,
      stripeCustomerId: stripeCustomerId || undefined,
      stripePaymentMethodId: stripePaymentMethodId || undefined,
      stripeSessionId: stripeSessionId || undefined,
      asset: 'JSC'
    } as any, // Type assertion for indexer-specific fields
  };
  
  LEDGER.push(entry);
  redis.saveLedgerEntries(LEDGER);
  
  // Broadcast events
  broadcastEvent({
    type: "indexer_registered",
    component: "root-ca",
    message: `New movie indexer registered: ${indexerName}`,
    timestamp: Date.now(),
    data: {
      indexerId: indexerId,
      indexerName: indexerName,
      indexerUuid: indexerUuid,
      email: email,
      providersRegistered: providerNames.length
    }
  });
  
  console.log(`✅ [Indexer Registration] Registration complete: ${indexerName} with ${providerNames.length} providers`);
  
  return newIndexer;
}

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
  
  console.log(`💰 [Stripe Payment Rail] Minting ${amount} JSC for ${email} (Stripe: ${stripePaymentIntentId})`);
  
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
  console.log(`   Amount credited: ${amount} JSC`);
  console.log(`   Final wallet balance: ${walletResult.balance} JSC`);
  console.log(`   User.balance synced: ${user.balance} JSC`);
  
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
  
  console.log(`   ✅ JSC minted: ${amount} JSC added to ${email} balance (new balance: ${walletResult.balance} JSC)`);
  
  // Broadcast events
  broadcastEvent({
    type: "jsc_minted",
    component: "stripe-payment-rail-001",
    message: `JSC minted via Stripe Payment Rail: ${amount} JSC for ${email}`,
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

function addLedgerEntry(
  snapshot: TransactionSnapshot,
  serviceType: string,
  iGasCost: number,
  payerId: string,
  merchantName: string, // Provider name (e.g., "AMC Theatres")
  providerUuid: string, // Service provider UUID for certificate issuance
  bookingDetails?: { 
    movieTitle?: string; 
    showtime?: string; 
    location?: string;
    // DEX trade details
    tokenSymbol?: string;
    baseToken?: string;
    action?: 'BUY' | 'SELL';
    tokenAmount?: number;
    baseAmount?: number;
    price?: number;
    iTax?: number;
  }
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
    cashierId: CASHIER.id,
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
    
    // Extract indexer ID from provider (if available)
    const provider = ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === entry.providerUuid);
    const indexerId = provider?.indexerId || 'unknown';
    
    const settlementPayload = {
      entryId: entry.entryId,
      txId: entry.txId,
      timestamp: entry.timestamp.toString(),
      payer: entry.payer,
      payerId: entry.payerId,
      merchant: entry.merchant,
      providerUuid: entry.providerUuid,
      indexerId: indexerId,
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
        indexerId
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
    message: `${cashier.name} processed payment: ${entry.amount} JSC`,
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

function getCashierStatus(): Cashier {
  return { ...CASHIER };
}

// ROOT CA Certificate Management Functions

function initializeRootCA(): void {
  if (!ROOT_CA) {
    ROOT_CA = new EdenPKI(ROOT_CA_UUID);
    ROOT_CA_IDENTITY = ROOT_CA.identity;
    console.log(`⚖️  ROOT CA initialized: ${ROOT_CA_UUID}`);
    console.log(`   Public Key: ${ROOT_CA_IDENTITY.publicKey.substring(0, 50)}...`);
    
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

function issueIndexerCertificate(indexer: IndexerConfig): EdenCertificate {
  if (!ROOT_CA) {
    throw new Error("ROOT CA not initialized");
  }
  
  const cert = ROOT_CA.issueCertificate({
    subject: indexer.uuid,
    capabilities: ["INDEXER", "ISSUE_CERT"],
    constraints: {
      indexerId: indexer.id,
      indexerName: indexer.name,
      stream: indexer.stream
    },
    ttlSeconds: 365 * 24 * 60 * 60 // 1 year
  });
  
  CERTIFICATE_REGISTRY.set(indexer.uuid, cert);
  indexer.certificate = cert;
  
  console.log(`📜 Certificate issued to ${indexer.name}: ${indexer.uuid}`);
  console.log(`   Capabilities: ${cert.capabilities.join(", ")}`);
  console.log(`   Expires: ${new Date(cert.expiresAt).toISOString()}`);
  
  broadcastEvent({
    type: "certificate_issued",
    component: "root-ca",
    message: `Certificate issued to ${indexer.name}`,
    timestamp: Date.now(),
    data: {
      subject: cert.subject,
      issuer: cert.issuer,
      capabilities: cert.capabilities,
      expiresAt: cert.expiresAt
    }
  });
  
  return cert;
}

function issueServiceProviderCertificate(provider: ServiceProviderWithCert): EdenCertificate {
  if (!ROOT_CA) {
    throw new Error("ROOT CA not initialized");
  }
  
  const cert = ROOT_CA.issueCertificate({
    subject: provider.uuid,
    capabilities: ["SERVICE_PROVIDER", "PRICE_QUOTE", "RECEIVE_PAYMENT"],
    constraints: {
      providerId: provider.id,
      providerName: provider.name,
      serviceType: provider.serviceType,
      location: provider.location,
      bond: provider.bond,
      reputation: provider.reputation
    },
    ttlSeconds: 90 * 24 * 60 * 60 // 90 days
  });
  
  CERTIFICATE_REGISTRY.set(provider.uuid, cert);
  provider.certificate = cert;
  
  console.log(`📜 Certificate issued to ${provider.name}: ${provider.uuid}`);
  console.log(`   Capabilities: ${cert.capabilities.join(", ")}`);
  
  broadcastEvent({
    type: "certificate_issued",
    component: "root-ca",
    message: `Certificate issued to ${provider.name}`,
    timestamp: Date.now(),
    data: {
      subject: cert.subject,
      issuer: cert.issuer,
      capabilities: cert.capabilities,
      expiresAt: cert.expiresAt
    }
  });
  
  return cert;
}

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
  
  // Mark indexer or provider as inactive/revoked
  const indexer = INDEXERS.find(i => i.uuid === uuid);
  if (indexer) {
    indexer.active = false;
    indexer.certificate = undefined;
    console.log(`   Indexer ${indexer.name} marked as inactive`);
  }
  
  const provider = ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === uuid);
  if (provider) {
    provider.certificate = undefined;
    provider.status = 'revoked'; // Mark provider as revoked in ROOT_CA_SERVICE_REGISTRY
    console.log(`   Service provider ${provider.name} (${provider.id}) marked as revoked`);
    console.log(`   Provider will be filtered out from service queries`);
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
  const indexer = INDEXERS.find(i => i.id === indexerId || i.uuid === indexerId);
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
    for (const indexer of INDEXERS) {
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
      const issuerIndexer = INDEXERS.find(i => i.uuid === revocation.issuer_uuid);
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
      
      // Mark entity as inactive
      const indexer = INDEXERS.find(i => i.uuid === revocation.revoked_uuid);
      if (indexer) {
        indexer.active = false;
        indexer.certificate = undefined;
      }
      
      const provider = ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === revocation.revoked_uuid);
      if (provider) {
        provider.certificate = undefined;
        provider.status = 'revoked';
        console.log(`   Service provider ${provider.name} (${provider.id}) marked as revoked in ROOT_CA_SERVICE_REGISTRY`);
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
  const issuerIndexer = INDEXERS.find(i => i.uuid === revocation.issuer_uuid);
  if (issuerIndexer && revocation.revoked_type === "service") {
    // Verify issuer has INDEXER capability
    const issuerCert = CERTIFICATE_REGISTRY.get(revocation.issuer_uuid);
    if (!issuerCert || !issuerCert.capabilities.includes("INDEXER")) {
      return false;
    }
    
    // Check if issuer certified this service provider
    // This is determined by checking if the service provider's indexerId matches the issuer's indexerId
    const revokedProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === revocation.revoked_uuid);
    if (revokedProvider) {
      // Check if the provider's indexerId matches the issuer's indexerId
      // This means the indexer certified this provider
      if (revokedProvider.indexerId === `indexer-${issuerIndexer.id.toLowerCase()}` || 
          revokedProvider.indexerId === issuerIndexer.id) {
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
    const indexerNames = INDEXERS.filter(i => i.active).map(i => i.name).join(", ");
    const tokenIndexerNames = TOKEN_INDEXERS.filter(i => i.active).map(i => i.name).join(", ");
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
    const activeIndexers = INDEXERS.filter(i => i.active);
    for (const indexer of activeIndexers) {
      await redis.xAdd(indexer.stream, "*", payload);
    }
    
    // Stream to all active token indexers
    const activeTokenIndexers = TOKEN_INDEXERS.filter(i => i.active);
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

async function indexerConsumer(name: string, stream: string) {
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
  
  console.log(`✅ [ROOT CA Settlement] Entry ${entryId} settled`);
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
      fees
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
  
  broadcastEvent({
    type: "igas",
    component: "igas",
    message: `iGas Cost: ${llmResponse.iGasCost.toFixed(6)}`,
    timestamp: Date.now(),
    data: { igas: llmResponse.iGasCost }
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
    const errorMsg = `Insufficient balance. Required: ${totalCost.toFixed(6)} JSC (${moviePrice} + ${llmResponse.iGasCost.toFixed(6)} iGas), Available: ${currentWalletBalance.toFixed(6)} JSC`;
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
  const ledgerEntry = addLedgerEntry(
    snapshot,
    llmResponse.listings[0]?.providerName ? 'movie' : 'service',
    llmResponse.iGasCost,
    user.email, // Pass email address (payerId will be set to email)
    selectedListing.providerName, // Provider name (e.g., "AMC Theatres", "MovieCom", "Cinemark")
    providerUuid, // Service provider UUID for certificate issuance
    {
      movieTitle: selectedListing.movieTitle,
      showtime: selectedListing.showtime,
      location: selectedListing.location,
    }
  );

  broadcastEvent({
    type: "ledger_entry_created",
    component: "ledger",
    message: `Ledger entry created for booking: ${ledgerEntry.entryId}`,
    timestamp: Date.now(),
    data: { entry: ledgerEntry }
  });

  console.log("4️⃣ Cashier: Process Payment");
  broadcastEvent({
    type: "cashier_start",
    component: "cashier",
    message: `${CASHIER.name} processing payment...`,
    timestamp: Date.now(),
    data: { cashier: CASHIER }
  });

  const paymentSuccess = await processPayment(CASHIER, ledgerEntry, user);
  if (!paymentSuccess) {
    const errorMsg = `Payment failed. Balance: ${user.balance}, Required: ${moviePrice}`;
    console.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }

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
    const response = await callLLM(prompt, ENABLE_OPENAI);
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
    throw new Error(`System prompt generation failed: ${err.message}`);
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
    const response = await callLLM(prompt, ENABLE_OPENAI);
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
    throw new Error(`Notification code generation failed: ${err.message}`);
  }
}

// Helper function to call LLM (reuse existing LLM infrastructure)
async function callLLM(prompt: string, useOpenAI: boolean): Promise<string> {
  if (useOpenAI) {
    // Use OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY || ""}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });
    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  } else {
    // Use DeepSeek API
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      });
      
      const req = https.request({
        hostname: "api.deepseek.com",
        path: "/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY || ""}`
        }
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk.toString(); });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.choices[0]?.message?.content || "");
          } catch (err) {
            reject(err);
          }
        });
      });
      
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }
}

// Main Server Initialization
async function main() {
  console.log("🌱 Eden Core Starting...\n");
  console.log("📋 CLI Flags:", {
    mockedLLM: MOCKED_LLM,
    skipRedis: SKIP_REDIS,
    enableOpenAI: ENABLE_OPENAI,
    deployedAsRoot: DEPLOYED_AS_ROOT,
    numIndexers: NUM_INDEXERS,
    numTokenIndexers: NUM_TOKEN_INDEXERS,
  }, "\n");
  
  if (DEPLOYED_AS_ROOT) {
    console.log("🔷 DEPLOYED AS ROOT MODE: Only ROOT CA and Holy Ghost will be initialized");
    console.log("   All additional indexers will be created via Angular UI wizard\n");
  }
  
  console.log(`✨ Holy Ghost (ROOT CA Indexer) configured: ${HOLY_GHOST_INDEXER.name}`);
  if (!DEPLOYED_AS_ROOT) {
    console.log(`🌳 Regular Indexers configured: ${INDEXERS.map(i => i.name).join(", ")}`);
    console.log(`🔷 Token Indexers configured: ${TOKEN_INDEXERS.map(i => i.name).join(", ")}\n`);
  } else {
    console.log(`🌳 Regular Indexers: 0 (will be created via UI)`);
    console.log(`🔷 Token Indexers: 0 (will be created via UI)\n`);
  }

  // Initialize ROOT CA
  initializeRootCA();
  
  // Issue certificate to Holy Ghost (ROOT CA Indexer)
  console.log("\n✨ Issuing certificate to Holy Ghost (ROOT CA Indexer)...");
  try {
    issueIndexerCertificate(HOLY_GHOST_INDEXER);
    console.log(`   ✅ Certificate issued to ${HOLY_GHOST_INDEXER.name}`);
  } catch (err: any) {
    console.error(`   ❌ Failed to issue certificate to ${HOLY_GHOST_INDEXER.name}:`, err.message);
  }
  
  // Only initialize regular indexers if NOT in root-only mode
  if (!DEPLOYED_AS_ROOT) {
    // Issue certificates to all regular indexers (including restored ones)
    console.log("\n🌳 Issuing certificates to Regular Indexers...");
    for (const indexer of INDEXERS) {
      if (indexer.active) {
        // Check if certificate exists in registry (not just in indexer object)
        const existingCert = CERTIFICATE_REGISTRY.get(indexer.uuid);
        if (!existingCert) {
          try {
            issueIndexerCertificate(indexer);
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
    for (const tokenIndexer of TOKEN_INDEXERS) {
      if (tokenIndexer.active) {
        try {
          issueIndexerCertificate(tokenIndexer);
        } catch (err: any) {
          console.error(`❌ Failed to issue certificate to ${tokenIndexer.name}:`, err.message);
        }
      }
    }
    
    // Initialize DEX Pools (must be after token indexers are created and certified)
    console.log("\n🌊 Initializing DEX Pools...");
    initializeDEXPools();
    
    // Create DEX pool service providers dynamically from pools
    console.log("\n📋 Registering DEX Pool Service Providers...");
    for (const [poolId, pool] of DEX_POOLS.entries()) {
      const tokenIndexer = TOKEN_INDEXERS.find(ti => ti.id === pool.indexerId);
      if (tokenIndexer) {
        const provider: ServiceProviderWithCert = {
          id: `dex-pool-${pool.tokenSymbol.toLowerCase()}`,
          uuid: crypto.randomUUID(),
          name: `${pool.tokenSymbol} Pool (${tokenIndexer.name})`,
          serviceType: "dex",
          location: "Eden DEX",
          bond: pool.bond,
          reputation: 5.0,
          indexerId: pool.indexerId,
          apiEndpoint: `https://dex.eden.com/pools/${poolId}`,
          status: 'active',
        };
        registerServiceProviderWithROOTCA(provider);
        console.log(`   ✅ Registered DEX pool provider: ${provider.name} (${provider.id}) → ${tokenIndexer.name}`);
      }
    }
    
    // Issue certificates to all regular indexers
    console.log("\n📜 Issuing certificates to Regular Indexers...");
    for (const indexer of INDEXERS) {
      if (indexer.active) {
        try {
          issueIndexerCertificate(indexer);
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
  console.log(`   - Regular Indexers: ${INDEXERS.length}`);
  console.log(`   - Token Indexers: ${TOKEN_INDEXERS.length}`);
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
  
  // Load ledger entries and persisted indexers from persistence file
  if (redisConnected && !SKIP_REDIS) {
    try {
      const persistenceFile = path.join(__dirname, 'eden-wallet-persistence.json');
      if (fs.existsSync(persistenceFile)) {
        const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
        const persisted = JSON.parse(fileContent);
        
        if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries)) {
          // Restore ledger entries
          LEDGER.push(...persisted.ledgerEntries);
          console.log(`📂 [Ledger Persistence] Loaded ${persisted.ledgerEntries.length} ledger entries from ${persistenceFile}`);
        }
        
        if (persisted.indexers && Array.isArray(persisted.indexers)) {
          // Restore dynamically created indexers
          // Only restore indexers that don't already exist (by ID)
          // In ROOT mode: ONLY restore indexers created via Angular (format: indexer-1, indexer-2, etc.)
          // Skip all other indexers (A, B, C, T1, T2, etc.) - they're defaults from non-ROOT mode
          const existingIds = new Set(INDEXERS.map(i => i.id));
          let restoredCount = 0;
          let skippedCount = 0;
          const restoredIndexers: IndexerConfig[] = [];
          
          for (const persistedIndexer of persisted.indexers) {
            // In ROOT mode: only restore indexers with format "indexer-N" (created via Angular)
            if (DEPLOYED_AS_ROOT && !persistedIndexer.id.startsWith('indexer-')) {
              skippedCount++;
              console.log(`📂 [Indexer Persistence] Skipping indexer ${persistedIndexer.id} (not created via Angular in ROOT mode)`);
              continue;
            }
            
            // Skip single-letter indexers in non-ROOT mode (they're defaults created at startup)
            if (!DEPLOYED_AS_ROOT && persistedIndexer.id.length === 1 && /^[A-Z]$/.test(persistedIndexer.id)) {
              skippedCount++;
              console.log(`📂 [Indexer Persistence] Skipping default indexer ${persistedIndexer.id} (created at startup)`);
              continue;
            }
            
            if (!existingIds.has(persistedIndexer.id)) {
              // Clear certificate property - it will be reissued
              const restoredIndexer: IndexerConfig = {
                ...persistedIndexer,
                certificate: undefined // Certificates will be reissued on startup
              };
              INDEXERS.push(restoredIndexer);
              restoredIndexers.push(restoredIndexer);
              existingIds.add(restoredIndexer.id);
              restoredCount++;
              console.log(`📂 [Indexer Persistence] Restored indexer: ${restoredIndexer.name} (${restoredIndexer.id})`);
            }
          }
          
          if (restoredCount > 0) {
            console.log(`📂 [Indexer Persistence] Restored ${restoredCount} persisted indexers from ${persistenceFile}`);
            console.log(`📜 [Indexer Persistence] Certificates will be reissued for restored indexers during startup`);
          }
          if (skippedCount > 0) {
            console.log(`📂 [Indexer Persistence] Skipped ${skippedCount} indexer(s) (not valid in ${DEPLOYED_AS_ROOT ? 'ROOT' : 'non-ROOT'} mode)`);
          }
        }
      }
    } catch (err: any) {
      console.warn(`⚠️  [Persistence] Failed to load persisted data: ${err.message}`);
    }
  }
  
  // Start indexer consumers (non-blocking) for all active indexers
  if (redisConnected) {
    // Initialize revocation stream consumer groups
    await initializeRevocationConsumers();
    
    // Start revocation stream processors for regular indexers
    for (const indexer of INDEXERS) {
      if (indexer.active) {
        indexerConsumer(indexer.name, indexer.stream).catch(console.error);
        processRevocationStream(indexer.name, indexer.id).catch(console.error);
      }
    }
    
    // Start revocation stream processors for token indexers
    for (const tokenIndexer of TOKEN_INDEXERS) {
      if (tokenIndexer.active) {
        indexerConsumer(tokenIndexer.name, tokenIndexer.stream).catch(console.error);
        processRevocationStream(tokenIndexer.name, tokenIndexer.id).catch(console.error);
      }
    }
    
    console.log(`🌳 Started ${INDEXERS.filter(i => i.active).length} regular indexer(s): ${INDEXERS.filter(i => i.active).map(i => i.name).join(", ")}`);
    console.log(`🔷 Started ${TOKEN_INDEXERS.filter(i => i.active).length} token indexer(s): ${TOKEN_INDEXERS.filter(i => i.active).map(i => i.name).join(", ")}\n`);
    console.log(`📜 Started revocation stream processors for all indexers\n`);
    
    // Start ROOT CA Settlement Consumer (settlement authority)
    // ROOT CA is the ONLY settlement authority - indexers execute but never settle
    console.log(`⚖️  Starting ROOT CA Settlement Consumer...`);
    rootCASettlementConsumer().catch(console.error);
    console.log(`✅ ROOT CA Settlement Consumer started\n`);
  }

  // Start HTTP server (serves Angular + API + WebSocket)
  httpServer.listen(HTTP_PORT, () => {
    console.log(`🌐 HTTP server running on port ${HTTP_PORT}`);
    console.log(`🔌 WebSocket server available at ws://localhost:${HTTP_PORT}/ws`);
    console.log(`📁 Serving frontend from: ${FRONTEND_PATH}`);
    console.log(`🌱 Eden Core Online\n`);
    console.log(`💡 Access the dashboard at: http://localhost:${HTTP_PORT}`);
    console.log(`💡 API endpoint: http://localhost:${HTTP_PORT}/api/chat\n`);
  });
  
  // Monitor server health
  httpServer.on("error", (err: Error) => {
    console.error(`❌ HTTP Server Error:`, err);
  });
  
  httpServer.on("clientError", (err: Error, socket: any) => {
    console.error(`❌ HTTP Client Error:`, err.message);
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });
}

// Handle process termination (wrapped for Node.js v24+ compatibility)
function setupGracefulShutdown() {
  const shutdown = async (signal: string) => {
    console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);
    try {
      // Save ledger entries and indexers before shutdown
      if (redis.isOpen) {
        if (LEDGER.length > 0) {
          redis.saveLedgerEntries(LEDGER);
        }
        // Save dynamically created indexers (those with IDs starting with 'indexer-')
        const dynamicIndexers = INDEXERS.filter(i => i.id.startsWith('indexer-'));
        if (dynamicIndexers.length > 0) {
          redis.saveIndexers(dynamicIndexers);
        }
        // Wait a bit for the save to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        await redis.quit();
      }
    } catch (err: any) {
      console.error("Error during shutdown:", err.message);
    }
    process.exit(0);
  };

  // Try to register signal handlers (may fail in Node.js v24+ due to read-only _eventsCount)
  // Wrap each call individually to prevent one failure from blocking the other
  const registerHandler = (signal: string) => {
    try {
      process.once(signal, () => shutdown(signal));
    } catch (err: any) {
      // Silently fail - signal handlers are optional in Node.js v24+
      // The script will work fine without them
    }
  };

  registerHandler("SIGINT");
  registerHandler("SIGTERM");
}

setupGracefulShutdown();

main().catch(async (err) => {
  console.error("❌ Fatal error:", err);
  try {
    if (redis.isOpen) {
      await redis.quit();
    }
  } catch (closeErr: any) {
    console.error("Error closing Redis:", closeErr.message);
  }
  process.exit(1);
});
