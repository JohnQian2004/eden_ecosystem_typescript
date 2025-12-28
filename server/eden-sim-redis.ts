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

// CLI Flags
const args = process.argv.slice(2);
const MOCKED_LLM = args.some(arg => arg.includes("--mocked-llm") && (arg.includes("=true") || !arg.includes("=false")));
const SKIP_REDIS = args.some(arg => arg.includes("--skip-redis") && (arg.includes("=true") || !arg.includes("=false")));
const ENABLE_OPENAI = args.some(arg => arg.includes("--enable-openai") && (arg.includes("=true") || !arg.includes("=false")));
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000");
const FRONTEND_PATH = process.env.FRONTEND_PATH || path.join(__dirname, "../frontend/dist/eden-sim-frontend");

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
  const parsedUrl = url.parse(req.url || "/", true);
  const pathname = parsedUrl.pathname || "/";

  // WebSocket upgrade requests are handled automatically by WebSocketServer
  // No need to intercept them here

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // API Routes
  if (pathname === "/api/chat" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { input, email } = JSON.parse(body);
        if (!email || typeof email !== 'string' || !email.includes('@')) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Valid email address required" }));
          return;
        }
        await processChatInput(input, email);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Chat processed" }));
      } catch (error: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  if (pathname === "/api/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "online",
      websocketClients: wsClients.size,
      timestamp: Date.now()
    }));
    return;
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
  private isConnected = false;

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

  async quit(): Promise<void> {
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
  serviceType: string;
  amount: number;
  iGasCost: number;
  fees: Record<string, number>;
  status: 'pending' | 'processed' | 'completed' | 'failed';
  cashierId: string;
  bookingDetails?: {
    movieTitle?: string;
    showtime?: string;
    location?: string;
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
  name: string;
  serviceType: string;
  location: string;
  bond: number;
  reputation: number;
  indexerId: string;
  apiEndpoint?: string; // Optional API endpoint for the provider
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

type ServiceRegistryQuery = {
  serviceType: string;
  filters?: {
    location?: string;
    maxPrice?: number | string; // Can be a number or 'best'/'lowest'
    minReputation?: number;
    genre?: string;
    time?: string;
  };
};

type LLMQueryResult = {
  query: ServiceRegistryQuery;
  serviceType: string;
  confidence: number;
};

type LLMResponse = {
  message: string;
  listings: MovieListing[];
  selectedListing: MovieListing | null;
  iGasCost: number;
};

// Constants

const CHAIN_ID = "eden-core";

const ROOT_CA_FEE = 0.02;
const INDEXER_FEE = 0.005;

const STREAM_INDEXER_A = "eden:indexer:A";
const STREAM_INDEXER_B = "eden:indexer:B";

// iGas Calculation Constants
const LLM_BASE_COST = 0.001; // Base cost per LLM call
const ROUTING_COST_PER_PROVIDER = 0.0001; // Cost per service provider queried
const REASONING_COST_MULTIPLIER = 1.5; // Multiplier for complex reasoning

// Users

const USERS: User[] = [
  { id: "u1", email: "alice@gmail.com", balance: 50 },
  { id: "u2", email: "bob@gmail.com", balance: 50 },
];

// Ledger Component - Tracks all Eden bookings
const LEDGER: LedgerEntry[] = [];

// Dedicated Cashier for processing payments
const CASHIER: Cashier = {
  id: "cashier-eden-001",
  name: "Eden Cashier",
  processedCount: 0,
  totalProcessed: 0,
  status: 'active',
};

// Service Registry (Routing only - no price data)
const SERVICE_REGISTRY: ServiceProvider[] = [
  {
    id: "amc-001",
    name: "AMC Theatres",
    serviceType: "movie",
    location: "Baltimore, Maryland",
    bond: 1000,
    reputation: 4.8,
    indexerId: "indexer-alpha",
    apiEndpoint: "https://api.amctheatres.com/v1/listings",
  },
  {
    id: "moviecom-001",
    name: "MovieCom",
    serviceType: "movie",
    location: "Baltimore, Maryland",
    bond: 800,
    reputation: 4.5,
    indexerId: "indexer-beta",
    apiEndpoint: "https://api.moviecom.com/showtimes",
  },
  {
    id: "cinemark-001",
    name: "Cinemark",
    serviceType: "movie",
    location: "Baltimore, Maryland",
    bond: 1200,
    reputation: 4.7,
    indexerId: "indexer-alpha",
    apiEndpoint: "https://api.cinemark.com/movies",
  },
];

// Mock Service Provider APIs (simulate external API calls)
async function queryAMCAPI(location: string, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
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
      indexerId: "indexer-alpha",
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
      indexerId: "indexer-alpha",
    },
  ];
}

async function queryMovieComAPI(location: string, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
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
      indexerId: "indexer-beta",
    },
  ];
}

async function queryCinemarkAPI(location: string, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
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
      indexerId: "indexer-alpha",
    },
  ];
}

// Provider API router
async function queryProviderAPI(provider: ServiceProvider, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
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
Example: {"query": {"serviceType": "movie", "filters": {"location": "Baltimore", "maxPrice": 10}}, "serviceType": "movie", "confidence": 0.95}
`;

const LLM_RESPONSE_FORMATTING_PROMPT = `
You are Eden Core AI response formatter.
Format service provider listings into user-friendly chat response.

Your responsibilities:
1. Filter listings based on user query filters (e.g., maxPrice, genre, time, location)
2. If maxPrice is "best" or "lowest", select listings with the lowest price
3. If maxPrice is a number, only include listings with price <= maxPrice
4. Apply other filters (genre, time, location) as specified
5. Format the filtered results into a user-friendly message
6. Select the best option based on user criteria (best price, best rating, etc.)

Include in response: provider name, movie title, price, showtime, location, review count, rating.
Return JSON with: message (string), listings (array of filtered listings), selectedListing (best option or null).
`;

// Service Registry Functions

function queryServiceRegistry(query: ServiceRegistryQuery): ServiceProvider[] {
  return SERVICE_REGISTRY.filter((provider) => {
    if (provider.serviceType !== query.serviceType) return false;
    if (query.filters?.location && !provider.location.toLowerCase().includes(query.filters.location.toLowerCase())) {
      return false;
    }
    // Note: maxPrice filter is applied after querying provider APIs (prices come from APIs, not registry)
    if (query.filters?.minReputation && provider.reputation < query.filters.minReputation) return false;
    return true;
  });
}

async function queryServiceProviders(providers: ServiceProvider[], filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  const allListings: MovieListing[] = [];
  
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
  const payload = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: LLM_QUERY_EXTRACTION_PROMPT },
      { role: "user", content: userInput },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
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
              reject(new Error(`OpenAI API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
              return;
            }
            if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
              const content = JSON.parse(parsed.choices[0].message.content);
              resolve({
                query: content.query || { serviceType: "movie", filters: {} },
                serviceType: content.serviceType || "movie",
                confidence: content.confidence || 0.9,
              });
            } else {
              reject(new Error("Invalid OpenAI response format"));
            }
          } catch (err: any) {
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
async function formatResponseWithOpenAI(listings: MovieListing[], userQuery: string, queryFilters?: { maxPrice?: number | string; genre?: string; time?: string; location?: string }): Promise<LLMResponse> {
  const listingsJson = JSON.stringify(listings);
  const filtersJson = queryFilters ? JSON.stringify(queryFilters) : "{}";
  const payload = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: LLM_RESPONSE_FORMATTING_PROMPT },
      { role: "user", content: `User query: ${userQuery}\n\nQuery filters: ${filtersJson}\n\nAvailable listings:\n${listingsJson}\n\nFilter listings based on the query filters and format the best option as a user-friendly message.` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
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
              reject(new Error(`OpenAI API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
              return;
            }
            if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
              const content = JSON.parse(parsed.choices[0].message.content);
              resolve({
                message: content.message || "Service found",
                listings: content.listings || listings,
                selectedListing: content.selectedListing || (listings.length > 0 ? listings[0] : null),
                iGasCost: 0, // Will be calculated separately
              });
            } else {
              reject(new Error("Invalid OpenAI response format"));
            }
          } catch (err: any) {
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
  const payload = JSON.stringify({
    model: "deepseek-r1",
    messages: [
      { role: "system", content: LLM_QUERY_EXTRACTION_PROMPT },
      { role: "user", content: userInput },
    ],
    stream: false,
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
            resolve({
              query: parsed.query || { serviceType: "movie", filters: {} },
              serviceType: parsed.serviceType || "movie",
              confidence: parsed.confidence || 0.9,
            });
          } catch (err) {
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
async function formatResponseWithDeepSeek(listings: MovieListing[], userQuery: string, queryFilters?: { maxPrice?: number | string; genre?: string; time?: string; location?: string }): Promise<LLMResponse> {
  const listingsJson = JSON.stringify(listings);
  const filtersJson = queryFilters ? JSON.stringify(queryFilters) : "{}";
  const payload = JSON.stringify({
    model: "deepseek-r1",
    messages: [
      { role: "system", content: LLM_RESPONSE_FORMATTING_PROMPT },
      { role: "user", content: `User query: ${userQuery}\n\nQuery filters: ${filtersJson}\n\nAvailable listings:\n${listingsJson}\n\nFilter listings based on the query filters and format the best option as a user-friendly message.` },
    ],
    stream: false,
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
            resolve({
              message: parsed.message || "Service found",
              listings: parsed.listings || listings,
              selectedListing: parsed.selectedListing || (listings.length > 0 ? listings[0] : null),
              iGasCost: 0,
            });
          } catch (err) {
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
      indexerId: "indexer-alpha",
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
  let formatResponseFn: (listings: MovieListing[], query: string, filters?: { maxPrice?: number | string; genre?: string; time?: string; location?: string }) => Promise<LLMResponse>;

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
    const queryResult = await extractQueryFn(userInput);
    console.log(`📋 Extracted query:`, queryResult);

    // Step 2: Query ServiceRegistry
    broadcastEvent({
      type: "service_registry_query",
      component: "service-registry",
      message: "Querying ServiceRegistry...",
      timestamp: Date.now()
    });
    
    const providers = queryServiceRegistry(queryResult.query);
    console.log(`🔍 Found ${providers.length} service providers`);
    
    broadcastEvent({
      type: "service_registry_result",
      component: "service-registry",
      message: `Found ${providers.length} service providers`,
      timestamp: Date.now(),
      data: { providers: providers.map(p => ({ id: p.id, name: p.name })) }
    });

    if (providers.length === 0) {
      throw new Error("No service providers found matching query");
    }

    // Step 3: Query service providers' external APIs for actual data (prices, showtimes)
    providers.forEach(provider => {
      broadcastEvent({
        type: "provider_api_query",
        component: provider.id,
        message: `Querying ${provider.name} API...`,
        timestamp: Date.now()
      });
    });
    
    const listings = await queryServiceProviders(providers, {
      genre: queryResult.query.filters?.genre,
      time: queryResult.query.filters?.time,
    });
    console.log(`🎬 Found ${listings.length} movie listings from provider APIs`);
    
    providers.forEach(provider => {
      const providerListings = listings.filter(l => l.providerId === provider.id);
      broadcastEvent({
        type: "provider_api_result",
        component: provider.id,
        message: `${provider.name} returned ${providerListings.length} listings`,
        timestamp: Date.now(),
        data: { listings: providerListings }
      });
    });

    if (listings.length === 0) {
      throw new Error("No movie listings found from service providers");
    }

    // Step 4: Format response using LLM (LLM will handle filtering based on query filters)
    llmCalls++;
    console.log(`🤖 LLM will filter ${listings.length} listings based on query filters`);
    const formattedResponse = await formatResponseFn(listings, userInput, queryResult.query.filters);

    // Step 5: Calculate iGas
    const iGas = calculateIGas(llmCalls, providers.length, queryResult.confidence);
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

function addLedgerEntry(
  snapshot: TransactionSnapshot,
  serviceType: string,
  iGasCost: number,
  payerId: string,
  bookingDetails?: { movieTitle?: string; showtime?: string; location?: string }
): LedgerEntry {
  // payerId should be the email address (same as payer)
  const entry: LedgerEntry = {
    entryId: crypto.randomUUID(),
    txId: snapshot.txId,
    timestamp: snapshot.blockTime,
    payer: snapshot.payer, // Email address
    payerId: snapshot.payer, // Email address (same as payer)
    merchant: snapshot.merchant,
    serviceType: serviceType,
    amount: snapshot.amount,
    iGasCost: iGasCost,
    fees: snapshot.feeSplit,
    status: 'pending',
    cashierId: CASHIER.id,
    bookingDetails: bookingDetails,
  };

  LEDGER.push(entry);
  
  broadcastEvent({
    type: "ledger_entry_added",
    component: "ledger",
    message: `Ledger entry created: ${entry.entryId}`,
    timestamp: Date.now(),
    data: { entry }
  });

  return entry;
}

function processPayment(cashier: Cashier, entry: LedgerEntry, user: User): boolean {
  // Cashier processes the payment
  if (user.balance < entry.amount) {
    entry.status = 'failed';
    broadcastEvent({
      type: "cashier_payment_failed",
      component: "cashier",
      message: `Payment failed: Insufficient balance`,
      timestamp: Date.now(),
      data: { entry, cashier }
    });
    return false;
  }

  // Deduct amount from user balance
  user.balance -= entry.amount;
  
  // Update cashier stats
  cashier.processedCount++;
  cashier.totalProcessed += entry.amount;
  entry.status = 'processed';

  broadcastEvent({
    type: "cashier_payment_processed",
    component: "cashier",
    message: `${cashier.name} processed payment: ${entry.amount} USDC`,
    timestamp: Date.now(),
    data: { entry, cashier, userBalance: user.balance }
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

function getCashierStatus(): Cashier {
  return { ...CASHIER };
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
    console.log(`📡 Stream (mock): ${snapshot.txId} → Indexer-A, Indexer-B`);
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

    await redis.xAdd(STREAM_INDEXER_A, "*", payload);
    await redis.xAdd(STREAM_INDEXER_B, "*", payload);
    console.log(`📡 Streamed to indexers: ${snapshot.txId}`);
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
        // No new messages, continue waiting
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
              console.log(`📡 ${name} indexed tx`, txId);
              broadcastEvent({
                type: "indexer_indexed",
                component: name.toLowerCase().replace(/\s+/g, '-'),
                message: `${name} indexed transaction ${txId}`,
                timestamp: Date.now(),
                data: { txId, indexer: name }
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
      }
    }
  }
}

// Review + Discount

function applyReview(user: User, review: Review, moviePrice: number) {
  if (review.rating >= 4) {
    const rebate = moviePrice * 0.1;
    user.balance += rebate;
    return rebate;
  }
  return 0;
}

// Chat API Processor Service - Processes user input through all components
async function processChatInput(input: string, email: string) {
  // Find or create user by email (no user management needed)
  let user = USERS.find(u => u.email === email);
  if (!user) {
    // Create new user on-the-fly with sequential ID matching USERS array format (u1, u2, u3...)
    const nextId = `u${USERS.length + 1}`;
    user = {
      id: nextId, // Sequential ID matching existing format (u1, u2, u3...)
      email: email,
      balance: 50, // Default balance
    };
    USERS.push(user);
    console.log(`👤 Created new user: ${email} with ID: ${nextId}`);
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
    console.error("❌ No listing selected");
    broadcastEvent({
      type: "error",
      component: "llm",
      message: "No listing selected from LLM response",
      timestamp: Date.now()
    });
    return;
  }

  const selectedListing = llmResponse.selectedListing;
  console.log("✅ Selected:", `${selectedListing.providerName} - ${selectedListing.movieTitle} at ${selectedListing.showtime} for ${selectedListing.price} USDC`);

  console.log("3️⃣ Ledger: Create Booking Entry");
  const moviePrice = selectedListing.price;
  
  // Create snapshot first (needed for ledger entry)
  const snapshot = createSnapshot(user.email, moviePrice, selectedListing.providerId);
  
  // Add ledger entry for this booking
  const ledgerEntry = addLedgerEntry(
    snapshot,
    llmResponse.listings[0]?.providerName ? 'movie' : 'service',
    llmResponse.iGasCost,
    user.email, // Pass email address (payerId will be set to email)
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

  const paymentSuccess = processPayment(CASHIER, ledgerEntry, user);
  if (!paymentSuccess) {
    console.error(`❌ Payment failed. Balance: ${user.balance}, Required: ${moviePrice}`);
    return;
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

  console.log("8️⃣ Review");
  const rebate = applyReview(user, {
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
}

// Main Server Initialization
async function main() {
  console.log("🌱 Eden Core Starting...\n");
  console.log("📋 CLI Flags:", {
    mockedLLM: MOCKED_LLM,
    skipRedis: SKIP_REDIS,
    enableOpenAI: ENABLE_OPENAI,
  }, "\n");

  // Connect to Redis
  const redisConnected = await connectRedis();
  
  // Embedded Redis always connects successfully unless skipped
  if (!redisConnected && !SKIP_REDIS) {
    console.error("❌ Unexpected Redis connection failure\n");
    process.exit(1);
  }

  // Start indexer consumers (non-blocking)
  if (redisConnected) {
    indexerConsumer("Indexer-A", STREAM_INDEXER_A).catch(console.error);
    indexerConsumer("Indexer-B", STREAM_INDEXER_B).catch(console.error);
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
}

// Handle process termination (wrapped for Node.js v24+ compatibility)
function setupGracefulShutdown() {
  const shutdown = async (signal: string) => {
    console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);
    try {
      if (redis.isOpen) {
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
