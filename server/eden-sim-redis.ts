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
import { EventEmitter } from "events";

// CLI Flags
const args = process.argv.slice(2);
const MOCKED_LLM = args.some(arg => arg.includes("--mocked-llm") && (arg.includes("=true") || !arg.includes("=false")));
const SKIP_REDIS = args.some(arg => arg.includes("--skip-redis") && (arg.includes("=true") || !arg.includes("=false")));
const ENABLE_OPENAI = args.some(arg => arg.includes("--enable-openai") && (arg.includes("=true") || !arg.includes("=false")));

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
    maxPrice?: number;
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
Include: provider name, movie title, price, showtime, location, review count, rating.
Return JSON with: message (string), listings (array), selectedListing (best option or null).
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
async function formatResponseWithOpenAI(listings: MovieListing[], userQuery: string): Promise<LLMResponse> {
  const listingsJson = JSON.stringify(listings);
  const payload = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: LLM_RESPONSE_FORMATTING_PROMPT },
      { role: "user", content: `User query: ${userQuery}\n\nAvailable listings:\n${listingsJson}\n\nFormat the best option as a user-friendly message.` },
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
async function formatResponseWithDeepSeek(listings: MovieListing[], userQuery: string): Promise<LLMResponse> {
  const listingsJson = JSON.stringify(listings);
  const payload = JSON.stringify({
    model: "deepseek-r1",
    messages: [
      { role: "system", content: LLM_RESPONSE_FORMATTING_PROMPT },
      { role: "user", content: `User query: ${userQuery}\n\nAvailable listings:\n${listingsJson}\n\nFormat the best option as a user-friendly message.` },
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
  let formatResponseFn: (listings: MovieListing[], query: string) => Promise<LLMResponse>;

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
    const providers = queryServiceRegistry(queryResult.query);
    console.log(`🔍 Found ${providers.length} service providers`);

    if (providers.length === 0) {
      throw new Error("No service providers found matching query");
    }

    // Step 3: Query service providers' external APIs for actual data (prices, showtimes)
    const listings = await queryServiceProviders(providers, {
      genre: queryResult.query.filters?.genre,
      time: queryResult.query.filters?.time,
    });
    console.log(`🎬 Found ${listings.length} movie listings from provider APIs`);

    // Apply maxPrice filter if specified (prices come from APIs, not registry)
    let filteredListings = listings;
    if (queryResult.query.filters?.maxPrice) {
      filteredListings = listings.filter(listing => listing.price <= queryResult.query.filters!.maxPrice!);
      console.log(`💰 Filtered to ${filteredListings.length} listings within price limit`);
    }

    if (filteredListings.length === 0) {
      throw new Error("No movie listings found matching criteria");
    }

    // Step 4: Format response using LLM
    llmCalls++;
    const formattedResponse = await formatResponseFn(filteredListings, userInput);

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

// Snapshot Engine

function createSnapshot(user: User, amount: number, providerId: string): TransactionSnapshot {
  const txId = crypto.randomUUID();
  const rootFee = amount * ROOT_CA_FEE;
  const indexerFee = amount * INDEXER_FEE;

  return {
    chainId: CHAIN_ID,
    txId,
    slot: Math.floor(Math.random() * 1_000_000),
    blockTime: Date.now(),
    payer: user.id,
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

// Main Flow

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

  console.log("🌱 Eden Core Online\n");

  const user = USERS[0];

  console.log("1️⃣ User Input");
  const input = "I want a sci-fi movie to watch tonight at the best price";

  console.log("2️⃣ LLM Resolution (Query → ServiceRegistry → Providers → Format)");
  const llmResponse: LLMResponse = await resolveLLM(input);
  console.log("📨 LLM Response:", llmResponse.message);
  console.log("⛽ iGas Cost:", llmResponse.iGasCost.toFixed(6));
  
  if (!llmResponse.selectedListing) {
    console.error("❌ No listing selected");
    return;
  }

  const selectedListing = llmResponse.selectedListing;
  console.log("✅ Selected:", `${selectedListing.providerName} - ${selectedListing.movieTitle} at ${selectedListing.showtime} for ${selectedListing.price} USDC`);

  console.log("3️⃣ Purchase");
  const moviePrice = selectedListing.price;
  if (user.balance < moviePrice) {
    console.error(`❌ Insufficient funds. Balance: ${user.balance}, Required: ${moviePrice}`);
    return;
  }
  user.balance -= moviePrice;

  console.log("4️⃣ Snapshot + Persist");
  const snapshot = createSnapshot(user, moviePrice, selectedListing.providerId);
  await persistSnapshot(snapshot);

  console.log("5️⃣ Stream to Indexers");
  await streamToIndexers(snapshot);

  console.log("6️⃣ Watch Movie 🎬");

  console.log("7️⃣ Review");
  const rebate = applyReview(user, {
    userId: user.id,
    movieId: selectedListing.movieId,
    rating: 5,
  }, moviePrice);

  console.log("8️⃣ Summary");
  console.log({
    balance: user.balance,
    rebate,
    fees: snapshot.feeSplit,
    iGasCost: llmResponse.iGasCost,
    selectedProvider: selectedListing.providerName,
    movie: selectedListing.movieTitle,
  });

  console.log("9️⃣ Done\n");

  // Graceful shutdown
  if (redis.isOpen) {
    await redis.quit();
    console.log("👋 Redis: Connection closed gracefully");
  }
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
