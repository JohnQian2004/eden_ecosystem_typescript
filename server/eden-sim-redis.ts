#!/usr/bin/env ts-node

/**
 * Eden Core Simulator v1.3 (Unified)
 * ---------------------------------
 * Single-file reference implementation
 * CTO FINAL HANDOFF VERSION
 *
 * Features:
 * - User lifecycle (input → chat → purchase → snapshot → review → rebate)
 * - ROOT CA + dual indexer fee sharing
 * - Snapshot chaining w/ synthetic block + slot time
 * - LLM resolution via DeepSeek (localhost:11434)
 * - CLI flag to mock LLM to avoid bottlenecks
 */

import http from "http";
import crypto from "crypto";
import process from "process";

/* ---------------------------------- */
/* CLI FLAGS */
/* ---------------------------------- */

const args = process.argv.slice(2);
const MOCKED_LLM = args.includes("--mocked-llm=true");

/* ---------------------------------- */
/* TYPES */
/* ---------------------------------- */

type User = {
  id: string;
  provider: "google";
  email: string;
  balance: number;
};

type Indexer = {
  id: string;
  feeBps: number;
};

type TransactionSnapshot = {
  chainId: string;
  txId: string;
  slot: number;
  blockTime: number;
  payer: string;
  merchant: string;
  amount: number;
  feeSplit: {
    rootCA: number;
    indexerA: number;
    indexerB: number;
  };
};

type Review = {
  userId: string;
  movieId: string;
  rating: number;
  comment: string;
};

/* ---------------------------------- */
/* CONSTANTS */
/* ---------------------------------- */

const ROOT_CA_FEE_BPS = 200; // 2%
const MOVIE_PRICE = 10.0;

const INDEXER_A: Indexer = { id: "indexer-alpha", feeBps: 50 };
const INDEXER_B: Indexer = { id: "indexer-beta", feeBps: 50 };

const CHAIN_NAMESPACE = "eden-core";

/* ---------------------------------- */
/* USERS */
/* ---------------------------------- */

const USERS: User[] = [
  {
    id: "u1",
    provider: "google",
    email: "alice@gmail.com",
    balance: 50,
  },
  {
    id: "u2",
    provider: "google",
    email: "bob@gmail.com",
    balance: 50,
  },
];

/* ---------------------------------- */
/* LLM SYSTEM PROMPT */
/* ---------------------------------- */

const LLM_SYSTEM_PROMPT = `
You are Eden Core, a neutral transaction-resolving AI.
You MUST:
- Return structured JSON only
- Include movieId, intent, and confidence score
- Never hallucinate balances or prices
- Respect snapshot immutability
`;

/* ---------------------------------- */
/* LLM RESOLUTION */
/* ---------------------------------- */

async function resolveWithLLM(userInput: string): Promise<any> {
  if (MOCKED_LLM) {
    return {
      intent: "purchase_movie",
      movieId: "eden-matrix-001",
      confidence: 0.99,
    };
  }

  const payload = JSON.stringify({
    model: "deepseek-r1",
    messages: [
      { role: "system", content: LLM_SYSTEM_PROMPT },
      { role: "user", content: userInput },
    ],
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: 11434,
        path: "/api/chat",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": payload.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(JSON.parse(data)));
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/* ---------------------------------- */
/* TRANSACTION ENGINE */
/* ---------------------------------- */

function generateSnapshot(
  user: User,
  amount: number
): TransactionSnapshot {
  const rootFee = (amount * ROOT_CA_FEE_BPS) / 10000;
  const indexerAFee = (amount * INDEXER_A.feeBps) / 10000;
  const indexerBFee = (amount * INDEXER_B.feeBps) / 10000;

  return {
    chainId: CHAIN_NAMESPACE,
    txId: crypto.randomUUID(),
    slot: Math.floor(Math.random() * 1_000_000),
    blockTime: Date.now(),
    payer: user.id,
    merchant: "eden-movie-store",
    amount,
    feeSplit: {
      rootCA: rootFee,
      indexerA: indexerAFee,
      indexerB: indexerBFee,
    },
  };
}

/* ---------------------------------- */
/* REVIEW → DISCOUNT LOOP */
/* ---------------------------------- */

function applyReviewDiscount(
  snapshot: TransactionSnapshot,
  review: Review
): number {
  if (review.rating >= 4) {
    return snapshot.amount * 0.1; // 10% rebate
  }
  return 0;
}

/* ---------------------------------- */
/* AUTO TRAIL QUERY */
/* ---------------------------------- */

function queryIndexerTrail(chainId: string): any {
  return {
    chainId,
    results: [
      {
        txId: crypto.randomUUID(),
        slot: Math.floor(Math.random() * 1_000_000),
        blockTime: Date.now() - 5000,
        signature: crypto.randomBytes(32).toString("hex"),
      },
    ],
  };
}

/* ---------------------------------- */
/* MAIN SERVICE CYCLE */
/* ---------------------------------- */

async function main() {
  console.log("🌱 Eden Core Simulator Booting...\n");

  const user = USERS[0];
  console.log("1️⃣ User Input");
  const userInput = "I want to watch a sci-fi movie tonight";

  console.log("2️⃣ Chat API Resolution");
  const llmResult = await resolveWithLLM(userInput);
  console.log("Resolved:", llmResult);

  console.log("3️⃣ Purchase Movie");
  if (user.balance < MOVIE_PRICE) throw new Error("Insufficient funds");
  user.balance -= MOVIE_PRICE;

  console.log("4️⃣ Snapshot Transaction");
  const snapshot = generateSnapshot(user, MOVIE_PRICE);
  console.log(snapshot);

  console.log("5️⃣ Watch Movie 🎬 (simulated)");

  console.log("6️⃣ User Writes Review");
  const review: Review = {
    userId: user.id,
    movieId: llmResult.movieId,
    rating: 5,
    comment: "Mind-blowing.",
  };

  console.log("7️⃣ Review Received → Discount Applied");
  const rebate = applyReviewDiscount(snapshot, review);
  user.balance += rebate;

  console.log("8️⃣ WIN-WIN-WIN Summary");
  console.log({
    userBalance: user.balance,
    rootCA: snapshot.feeSplit.rootCA,
    indexerA: snapshot.feeSplit.indexerA,
    indexerB: snapshot.feeSplit.indexerB,
  });

  console.log("9️⃣ Auto Trail Query");
  const trail = queryIndexerTrail(snapshot.chainId);
  console.log(trail);

  console.log("\n✅ Eden Core Simulation Complete");
}

main().catch(console.error);
