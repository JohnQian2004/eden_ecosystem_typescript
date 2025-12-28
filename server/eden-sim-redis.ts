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
import * as crypto from "crypto";
import * as process from "process";
import { EventEmitter } from "events";

// CLI Flags
const MOCKED_LLM = process.argv.includes("--mocked-llm=true");
const SKIP_REDIS = process.argv.includes("--skip-redis=true");

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

type LLMIntent = {
  intent: string;
  movieId: string;
  confidence: number;
};

// Constants

const CHAIN_ID = "eden-core";
const MOVIE_PRICE = 10;

const ROOT_CA_FEE = 0.02;
const INDEXER_FEE = 0.005;

const STREAM_INDEXER_A = "eden:indexer:A";
const STREAM_INDEXER_B = "eden:indexer:B";

// Users

const USERS: User[] = [
  { id: "u1", email: "alice@gmail.com", balance: 50 },
  { id: "u2", email: "bob@gmail.com", balance: 50 },
];

// LLM System Prompt

const SYSTEM_PROMPT = `
You are Eden Core AI.
Return JSON only.
Fields: intent, movieId, confidence.
`;

// LLM Resolution

async function resolveLLM(input: string): Promise<LLMIntent> {
  if (MOCKED_LLM) {
    return { intent: "purchase_movie", movieId: "eden-matrix-001", confidence: 0.99 };
  }

  const payload = JSON.stringify({
    model: "deepseek-r1",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: input },
    ],
    stream: false,
  });

  return new Promise<LLMIntent>((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port: 11434, path: "/api/chat", method: "POST" },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed as LLMIntent);
          } catch (err) {
            reject(new Error("Failed to parse LLM response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// Snapshot Engine

function createSnapshot(user: User): TransactionSnapshot {
  const txId = crypto.randomUUID();
  const rootFee = MOVIE_PRICE * ROOT_CA_FEE;
  const indexerFee = MOVIE_PRICE * INDEXER_FEE;

  return {
    chainId: CHAIN_ID,
    txId,
    slot: Math.floor(Math.random() * 1_000_000),
    blockTime: Date.now(),
    payer: user.id,
    merchant: "eden-movie-store",
    amount: MOVIE_PRICE,
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

function applyReview(user: User, review: Review) {
  if (review.rating >= 4) {
    const rebate = MOVIE_PRICE * 0.1;
    user.balance += rebate;
    return rebate;
  }
  return 0;
}

// Main Flow

async function main() {
  console.log("🌱 Eden Core Starting...\n");

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
  const input = "I want a sci-fi movie";

  console.log("2️⃣ LLM Resolution");
  const intent: LLMIntent = await resolveLLM(input);
  console.log(intent);

  console.log("3️⃣ Purchase");
  user.balance -= MOVIE_PRICE;

  console.log("4️⃣ Snapshot + Persist");
  const snapshot = createSnapshot(user);
  await persistSnapshot(snapshot);

  console.log("5️⃣ Stream to Indexers");
  await streamToIndexers(snapshot);

  console.log("6️⃣ Watch Movie 🎬");

  console.log("7️⃣ Review");
  const rebate = applyReview(user, {
    userId: user.id,
    movieId: intent.movieId,
    rating: 5,
  });

  console.log("8️⃣ Summary");
  console.log({
    balance: user.balance,
    rebate,
    fees: snapshot.feeSplit,
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
