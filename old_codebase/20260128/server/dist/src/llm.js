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
var llm_exports = {};
__export(llm_exports, {
  LLM_GET_DATA_PARAMS_PROMPT: () => LLM_GET_DATA_PARAMS_PROMPT,
  LLM_QUERY_EXTRACTION_PROMPT: () => LLM_QUERY_EXTRACTION_PROMPT,
  LLM_RESPONSE_FORMATTING_PROMPT: () => LLM_RESPONSE_FORMATTING_PROMPT,
  LLM_SQL_PARAMETERIZATION_PROMPT: () => LLM_SQL_PARAMETERIZATION_PROMPT,
  callLLM: () => callLLM,
  determineDecisionResponse: () => determineDecisionResponse,
  extractGetDataParamsWithOpenAI: () => extractGetDataParamsWithOpenAI,
  extractQueryWithOpenAI: () => extractQueryWithOpenAI,
  formatResponseWithDeepSeek: () => formatResponseWithDeepSeek,
  formatResponseWithOpenAI: () => formatResponseWithOpenAI,
  initializeLLM: () => initializeLLM,
  parameterizeSQLWithOpenAI: () => parameterizeSQLWithOpenAI
});
module.exports = __toCommonJS(llm_exports);
var https = __toESM(require("https"));
var import_config = require("./config");
var import_llmMessagingPrompt = require("./messaging/llmMessagingPrompt");
var import_edenKnowledgeBase = require("./rag/edenKnowledgeBase");
let broadcastEvent;
function initializeLLM(broadcastFn) {
  broadcastEvent = broadcastFn;
}
const LLM_QUERY_EXTRACTION_PROMPT = `
You are Eden Core AI query processor.
Extract service query from user input.
Return JSON only with: query (object with serviceType and filters), serviceType, confidence.

\u{1F6A8} CRITICAL: Distinguish between EDEN CHAT (workflow queries) and REGULAR TEXT CHAT (informational queries):

- **EDEN CHAT (Workflow/Service Queries)**: These should trigger workflows
  - Examples: "book a movie", "buy movie tickets", "trade 2 SOL with TOKEN", "find a pharmacy", "buy TOKENA"
  - These are ACTION queries that request services
  - Extract serviceType and filters for these queries

- **REGULAR TEXT CHAT (Informational Queries)**: These should NOT trigger workflows
  - Examples: "how to messaging", "how eden works", "what is the garden of eden", "who eden works", "how do I use this"
  - These are INFORMATION queries that should be answered directly
  - For these queries, return serviceType: "informational" and empty filters

Service types: "movie", "dex", or "informational" (for regular text chat)

CRITICAL: Classify queries based on these rules:

MOVIE SERVICE (serviceType: "movie"):
- Keywords: "movie", "ticket", "tickets", "cinema", "theater", "theatre", "film", "watch", "showtime", "show", "AMC", "Cinemark", "MovieCom", "cinema", "theater"
- Examples: "buy movie tickets", "I want to watch a movie", "find movies", "movie tickets", "cinema tickets", "2 tickets", "buy 2 tickets"
- If user mentions "ticket" or "tickets" WITHOUT mentioning "token", "TOKENA", "TOKENB", "DEX", "pool", "trade", it's ALWAYS a movie query
- If user says "buy 2 tickets" or "I want 2 tickets", it means 2 MOVIE TICKETS, not tokens
- Extract filters: location, maxPrice, genre, time, showtime

DEX TOKEN SERVICE (serviceType: "dex"):
- Keywords: "token", "TOKEN", "TOKENA", "TOKENB", "TOKENC", "DEX", "pool", "trade", "swap", "exchange", "buy token", "sell token", "token A", "token B", "SOL", "SOLANA"
- Examples: "buy TOKEN", "buy TOKENA", "buy 2 TOKENA", "sell token A", "buy token with SOL", "DEX trade", "Trade 2 SOL with TOKEN", "swap SOL for TOKEN"
- CRITICAL CLASSIFICATION RULES (in priority order):
  1. If user mentions "TOKEN" (with or without a letter) AND mentions "SOL" or "SOLANA" \u2192 ALWAYS DEX
  2. If user mentions "trade" AND mentions "TOKEN" or "SOL" \u2192 ALWAYS DEX
  3. If user mentions "DEX" or "pool" \u2192 ALWAYS DEX
  4. If user mentions "token" (lowercase) AND a token symbol (TOKEN, TOKENA, TOKENB, etc.) \u2192 ALWAYS DEX
  5. If user mentions "swap" or "exchange" with "TOKEN" or "SOL" \u2192 ALWAYS DEX
- Extract: tokenSymbol, baseToken, action (BUY/SELL), tokenAmount, baseAmount, maxPrice

For movie queries:
Example: {"query": {"serviceType": "movie", "filters": {"location": "Baltimore", "maxPrice": 10}}, "serviceType": "movie", "confidence": 0.95}
Example: {"query": {"serviceType": "movie", "filters": {"maxPrice": "best"}}, "serviceType": "movie", "confidence": 0.95}
Example: {"query": {"serviceType": "movie", "filters": {}}, "serviceType": "movie", "confidence": 0.95}

For DEX token trading queries (BUY/SELL tokens):
- tokenSymbol: The token being bought/sold (e.g., "TOKENA", "TOKENB", "TOKENC", "Token A", "TOKEN")
  * If user says "BUY token A" or "token A" or "TOKENA", tokenSymbol = "TOKENA"
  * If user says "BUY token B" or "token B" or "TOKENB", tokenSymbol = "TOKENB"
  * If user says "SOLANA token A" or "Trade X SOL with TOKENA", tokenSymbol = "TOKENA" (token A is what's being traded)
  * If user says "Trade X SOL with TOKENB", tokenSymbol = "TOKENB"
  * If user says "TOKEN" without a letter (A, B, C, etc.), tokenSymbol = "TOKEN"
  * CRITICAL: "TOKENA", "TOKENB", "TOKENC" are valid token symbols - extract them exactly as written
- baseToken: The currency used to buy/sell (e.g., "SOL", "USDC", "SOLANA")
  * If user says "BUY with SOL" or "SOLANA token A", baseToken = "SOL" (SOL is the payment currency)
- Extract action: "BUY" or "SELL"
- Extract tokenAmount if user specifies token quantity (e.g., "buy 2 TOKEN" means tokenAmount = 2)
- Extract baseAmount if user specifies base token quantity (e.g., "Trade 2 SOL with TOKEN" means baseAmount = 2, "Trade 2 SOL with TOKENA" means baseAmount = 2 and tokenSymbol = "TOKENA")
- CRITICAL: When user says "Trade X SOL with TOKENA" or "Trade X SOL with TOKENB", the number X is ALWAYS the baseAmount (amount of SOL to spend), NOT the tokenAmount
- Extract maxPrice if specified (e.g., "1 Token/SOL" means price <= 1)

\u{1F6A8} CRITICAL QUANTITY EXTRACTION RULES (MUST FOLLOW):
- Pattern: "Trade [NUMBER] SOL with TOKEN" \u2192 baseAmount = [NUMBER], tokenSymbol = "TOKEN", baseToken = "SOL", action = "BUY"
  * Example: "Trade 2 SOL with TOKEN" \u2192 baseAmount = 2 (NOT tokenAmount = 2!)
  * Example: "Trade 5 SOL with TOKEN" \u2192 baseAmount = 5
  * Example: "Trade 10 SOL with TOKEN" \u2192 baseAmount = 10
  * THE NUMBER BEFORE "SOL" IS ALWAYS THE baseAmount (quantity of SOL to spend)
- Pattern: "Trade [NUMBER] SOL with TOKENA" \u2192 baseAmount = [NUMBER], tokenSymbol = "TOKENA", baseToken = "SOL", action = "BUY"
  * Example: "Trade 2 SOL with TOKENA" \u2192 baseAmount = 2, tokenSymbol = "TOKENA"
  * Example: "Trade 3 SOL with TOKENA" \u2192 baseAmount = 3, tokenSymbol = "TOKENA"
- Pattern: "Trade [NUMBER] SOL with TOKENB" \u2192 baseAmount = [NUMBER], tokenSymbol = "TOKENB", baseToken = "SOL", action = "BUY"
- Pattern: "Buy TOKEN with [NUMBER] SOL" \u2192 baseAmount = [NUMBER], tokenSymbol = "TOKEN", baseToken = "SOL", action = "BUY"
- Pattern: "Swap [NUMBER] SOL for TOKEN" \u2192 baseAmount = [NUMBER], tokenSymbol = "TOKEN", baseToken = "SOL", action = "BUY"
- Pattern: "Buy [NUMBER] TOKEN" \u2192 tokenAmount = [NUMBER], tokenSymbol = "TOKEN", action = "BUY" (number refers to tokens, not SOL)
- Pattern: "Buy [NUMBER] TOKENA" \u2192 tokenAmount = [NUMBER], tokenSymbol = "TOKENA", action = "BUY" (number refers to tokens, not SOL)

CRITICAL: Understanding quantity specifications:
- "Trade 2 SOL with TOKEN" or "Trade 2 SOL with TOKENA" \u2192 baseAmount = 2, tokenSymbol = "TOKEN" or "TOKENA", action = "BUY" (user wants to spend 2 SOL to buy tokens)
- "Buy TOKEN with 2 SOL" or "Buy TOKENA with 2 SOL" \u2192 baseAmount = 2, tokenSymbol = "TOKEN" or "TOKENA", action = "BUY"
- "Swap 2 SOL for TOKEN" or "Swap 2 SOL for TOKENA" \u2192 baseAmount = 2, tokenSymbol = "TOKEN" or "TOKENA", action = "BUY"
- "Buy 2 TOKEN" or "Buy 2 TOKENA" \u2192 tokenAmount = 2, tokenSymbol = "TOKEN" or "TOKENA", action = "BUY" (user wants 2 tokens)
- When baseAmount is specified, the system will calculate tokenAmount from the pool price
- When tokenAmount is specified, the system will calculate baseAmount from the pool price

PATTERN RECOGNITION (EXTRACT THE NUMBER!):
- "Trade X SOL with TOKEN" \u2192 baseAmount = X (extract X as a number!), tokenSymbol = "TOKEN", baseToken = "SOL", action = "BUY"
- "Trade X SOL with TOKENA" \u2192 baseAmount = X (extract X as a number!), tokenSymbol = "TOKENA", baseToken = "SOL", action = "BUY"
- "Trade X SOL with TOKENB" \u2192 baseAmount = X (extract X as a number!), tokenSymbol = "TOKENB", baseToken = "SOL", action = "BUY"
- If user says "Trade 2 SOL with TOKEN", you MUST extract baseAmount = 2 (the number 2 is the quantity of SOL)

IMPORTANT: In phrases like "BUY 2 SOLANA token A":
- tokenSymbol = "TOKENA" (the token being bought)
- baseToken = "SOL" (SOLANA/SOL is the currency used to buy)
- tokenAmount = 2 (if "2" refers to tokens) OR baseAmount = 2 (if "2" refers to SOL - need context)

Example: {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKENA", "baseToken": "SOL", "action": "BUY", "tokenAmount": 2, "maxPrice": 1}}, "serviceType": "dex", "confidence": 0.95}
Example: {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKEN", "baseToken": "SOL", "action": "BUY", "baseAmount": 2}}, "serviceType": "dex", "confidence": 0.95}

\u{1F6A8} MANDATORY EXAMPLES - EXTRACT THE NUMBER CORRECTLY:
Example for "Trade 2 SOL with TOKEN": {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKEN", "baseToken": "SOL", "action": "BUY", "baseAmount": 2}}, "serviceType": "dex", "confidence": 0.95}
  * CRITICAL: The number "2" in "Trade 2 SOL" means baseAmount = 2 (user wants to spend 2 SOL)
  * DO NOT set tokenAmount = 2, set baseAmount = 2!
Example for "Trade 2 SOL with TOKENA": {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKENA", "baseToken": "SOL", "action": "BUY", "baseAmount": 2}}, "serviceType": "dex", "confidence": 0.95}
  * CRITICAL: baseAmount = 2 (the number before "SOL" is always baseAmount)
Example for "Trade 2 SOL with TOKENB": {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKENB", "baseToken": "SOL", "action": "BUY", "baseAmount": 2}}, "serviceType": "dex", "confidence": 0.95}
  * CRITICAL: baseAmount = 2 (extract the number 2 as baseAmount)
Example for "Trade 5 SOL with TOKEN": {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKEN", "baseToken": "SOL", "action": "BUY", "baseAmount": 5}}, "serviceType": "dex", "confidence": 0.95}
  * CRITICAL: baseAmount = 5 (extract the number 5 as baseAmount)
Example for "buy TOKEN": {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKEN", "baseToken": "SOL", "action": "BUY", "tokenAmount": 1}}, "serviceType": "dex", "confidence": 0.95}
Example for "buy 2 TOKENA": {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKENA", "baseToken": "SOL", "action": "BUY", "tokenAmount": 2}}, "serviceType": "dex", "confidence": 0.95}
  * NOTE: In "buy 2 TOKENA", the number 2 refers to tokens (tokenAmount), not SOL (baseAmount)

CRITICAL DISAMBIGUATION RULES:
- "buy tickets" or "buy 2 tickets" = MOVIE (only if NO mention of "TOKEN", "SOL", "DEX", "pool", "trade", "swap")
- "Trade 2 SOL with TOKEN" = DEX (has "trade", "SOL", and "TOKEN")
- "buy TOKEN" = DEX (has "TOKEN")
- "buy token with SOL" = DEX (has "token" and "SOL")
- If user mentions BOTH movie keywords AND DEX keywords (TOKEN, SOL, DEX, pool, trade), prioritize DEX classification
- When in doubt between movie and DEX, check: Does the query mention "TOKEN", "SOL", "DEX", "pool", or "trade"? If YES \u2192 DEX. If NO \u2192 Movie.
`;
const LLM_GET_DATA_PARAMS_PROMPT = `
You are Eden ROOT CA AI - GOD's data access controller.
Your role is to translate natural language queries into structured getData() function parameters.

CRITICAL: You are the ONLY authority that can translate user intent into data access patterns.
All service providers must use your translation to access their data layers.

Return JSON only with:
- serviceType: The service type (e.g., "autoparts", "airline", "pharmacy", "hotel", "restaurant")
- params: Array of extracted parameters in order (e.g., ["2020 Nissan Altima", "front bumper"])
- maxCount: Maximum number of results (default: 30, extract from query if specified)
- sortBy: Field to sort by (e.g., "price", "rating", "date", "name") - extract from query hints like "best price", "highest rating"
- order: "asc" or "desc" (default: "asc" for price/date, "desc" for rating)

EXTRACTION RULES:

1. SERVICE TYPE DETECTION:
   - "autoparts", "auto parts", "car parts", "bumper", "brake", "tire" \u2192 serviceType: "autoparts"
   - "flight", "airline", "fly", "ticket" (with destination) \u2192 serviceType: "airline"
   - "pharmacy", "prescription", "medication", "drug" \u2192 serviceType: "pharmacy"
   - "hotel", "room", "stay", "booking" (accommodation) \u2192 serviceType: "hotel"
   - "restaurant", "reservation", "dinner", "lunch" \u2192 serviceType: "restaurant"
   - "movie", "cinema", "theater" \u2192 serviceType: "movie"
   - "token", "DEX", "TOKENA", "TOKENB" \u2192 serviceType: "dex"

2. PARAMETER EXTRACTION:
   - Extract key search terms (make/model, destination, medication name, etc.)
   - Extract filters (year, location, date, etc.)
   - Order params by importance (most specific first)
   - Example: "2020 Nissan Altima front bumper" \u2192 params: ["2020 Nissan Altima", "front bumper"]
   - Example: "flight from New York to Los Angeles" \u2192 params: ["New York", "Los Angeles"]

3. SORTING HINTS:
   - "best price", "cheapest", "lowest price" \u2192 sortBy: "price", order: "asc"
   - "highest rating", "best rated" \u2192 sortBy: "rating", order: "desc"
   - "newest", "latest" \u2192 sortBy: "date", order: "desc"
   - "best", "top" (without qualifier) \u2192 sortBy: "rating", order: "desc"

4. MAX COUNT:
   - Extract if specified: "top 10", "first 5", "show 20"
   - Default: 30

EXAMPLES:

Input: "I need a front bumper for 2020 Nissan Altima at best price"
Output: {
  "serviceType": "autoparts",
  "params": ["2020 Nissan Altima", "front bumper"],
  "maxCount": 30,
  "sortBy": "price",
  "order": "asc"
}

Input: "Find flights from New York to Los Angeles next week"
Output: {
  "serviceType": "airline",
  "params": ["New York", "Los Angeles", "next week"],
  "maxCount": 30,
  "sortBy": "price",
  "order": "asc"
}

Input: "I need my prescription medication available"
Output: {
  "serviceType": "pharmacy",
  "params": ["prescription medication"],
  "maxCount": 30,
  "sortBy": "name",
  "order": "asc"
}

Input: "Show me top 10 hotels in Paris with highest rating"
Output: {
  "serviceType": "hotel",
  "params": ["Paris"],
  "maxCount": 10,
  "sortBy": "rating",
  "order": "desc"
}

CRITICAL: Return ONLY valid JSON. No explanations, no markdown, just the JSON object.
`;
async function extractGetDataParamsWithOpenAI(userInput) {
  if (!process.env.OPENAI_API_KEY && !import_config.MOCKED_LLM) {
    throw new Error("OpenAI API key is required for extractGetDataParamsWithOpenAI. Please set OPENAI_API_KEY environment variable.");
  }
  if (import_config.MOCKED_LLM) {
    const queryLower = userInput.toLowerCase();
    let serviceType = "autoparts";
    let params = [];
    if (queryLower.includes("flight") || queryLower.includes("airline") || queryLower.includes("fly")) {
      serviceType = "airline";
    } else if (queryLower.includes("pharmacy") || queryLower.includes("prescription") || queryLower.includes("medication")) {
      serviceType = "pharmacy";
    } else if (queryLower.includes("hotel") || queryLower.includes("room")) {
      serviceType = "hotel";
    } else if (queryLower.includes("restaurant") || queryLower.includes("reservation") || queryLower.includes("dinner")) {
      serviceType = "restaurant";
    }
    const words = userInput.split(/\s+/).filter((w) => w.length > 3 && !["need", "want", "find", "show", "get", "best", "price"].includes(w.toLowerCase()));
    params = words.slice(0, 5);
    return {
      serviceType,
      params: params.length > 0 ? params : ["query"],
      maxCount: 30,
      sortBy: queryLower.includes("best price") || queryLower.includes("cheapest") ? "price" : void 0,
      order: queryLower.includes("best price") || queryLower.includes("cheapest") ? "asc" : "desc",
      confidence: 0.95
    };
  }
  const messages = [
    { role: "system", content: LLM_GET_DATA_PARAMS_PROMPT },
    { role: "user", content: userInput }
  ];
  const requestBody = {
    model: "gpt-4o",
    messages,
    temperature: 0.3,
    max_tokens: 500,
    response_format: { type: "json_object" }
  };
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || "OpenAI API error"));
            return;
          }
          const content = response.choices[0]?.message?.content;
          if (!content) {
            reject(new Error("No content in OpenAI response"));
            return;
          }
          const parsed = JSON.parse(content);
          const result = {
            serviceType: String(parsed.serviceType || "autoparts"),
            params: Array.isArray(parsed.params) ? parsed.params.map((p) => String(p)) : [],
            maxCount: Math.max(1, Math.min(Number(parsed.maxCount || 30), 100)),
            sortBy: parsed.sortBy ? String(parsed.sortBy) : void 0,
            order: parsed.order === "desc" ? "desc" : "asc",
            confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0.9)))
          };
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse OpenAI response: ${err.message}`));
        }
      });
    });
    req.on("error", (err) => {
      reject(new Error(`OpenAI API request failed: ${err.message}`));
    });
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
async function callLLM(prompt, useOpenAI = true) {
  if (import_config.MOCKED_LLM) {
    return "Mock LLM response";
  }
  if (!useOpenAI || !OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }
  const messages = [
    { role: "user", content: prompt }
  ];
  const requestBody = {
    model: "gpt-4o",
    messages,
    temperature: 0.7,
    max_tokens: 1e3
  };
  const requestBodyJson = JSON.stringify(requestBody);
  const requestBodyBuffer = Buffer.from(requestBodyJson, "utf-8");
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
          "Content-Length": requestBodyBuffer.length.toString()
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => data += c);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || "OpenAI API error"));
              return;
            }
            const content = parsed.choices[0]?.message?.content;
            if (!content) {
              reject(new Error("No content in LLM response"));
              return;
            }
            resolve(content);
          } catch (err) {
            reject(new Error(`Failed to parse LLM response: ${err.message}`));
          }
        });
      }
    );
    req.on("error", (err) => {
      reject(new Error(`LLM API request failed: ${err.message}`));
    });
    req.write(requestBodyBuffer);
    req.end();
  });
}
const LLM_RESPONSE_FORMATTING_PROMPT = `
You are Eden Core AI response formatter.
Format service listings into a user-friendly message, OR answer informational questions about Eden.

\u{1F6A8} CRITICAL DISTINCTION: There are TWO types of user queries in Eden:

1. **EDEN CHAT (Workflow/Service Queries)** - These trigger workflows:
   - Examples: "book a movie", "buy movie tickets", "trade 2 SOL with TOKEN", "find a pharmacy", "buy TOKENA"
   - These are ACTION queries that should trigger Eden workflows
   - When listings are provided, these are SERVICE QUERIES
   - Format service listings into a user-friendly message
   - Return JSON with: message (string), selectedListing (object), selectedListing2 (object), listings (array)
   - CRITICAL REQUIREMENTS:
     * selectedListing is REQUIRED and MUST NOT be null or undefined
     * selectedListing2 is REQUIRED and MUST NOT be null or undefined - it MUST be the same as selectedListing
     * selectedListing MUST be one of the listings from the provided listings array (use the original object, do not invent)
     * selectedListing2 MUST be the same object as selectedListing (copy the exact same object)
     * If you cannot find a better match, pick the FIRST listing from the provided listings array

2. **REGULAR TEXT CHAT (Informational Queries)** - These are answered directly:
   
   A. **EDEN-RELATED INFORMATIONAL QUERIES** (about Eden itself):
   - Examples: "how to messaging", "how eden works", "what is the garden of eden", "how do I use this", "who eden works"
   - These are INFORMATION queries about Eden that should be answered directly WITHOUT triggering workflows
   - Answer using your knowledge of Eden's architecture and messaging system
   - Return JSON with: message (string), selectedListing (null), selectedListing2 (null), listings (empty array)
   - The message should be helpful and explain Eden's features, philosophy, or how to use the interface
   - Reference the Universal Messaging System when relevant
   - Guide users on how to use the UI interface (Workflow Display Component)
   - DO NOT suggest triggering workflows for informational queries
   
   B. **GENERAL KNOWLEDGE QUERIES** (NOT about Eden):
   - Examples: "what is GOD in Bible", "what is today", "what is the weather", "who is the president", "explain quantum physics"
   - These are general knowledge questions that are NOT related to Eden services or workflows
   - Answer these questions naturally and helpfully
   - Return JSON with: message (string with the answer), selectedListing (null), selectedListing2 (null), listings (empty array)
   - Provide clear, accurate answers to general knowledge questions
   
   C. **MESSAGES TO GOD** (Personal/Spiritual messages to GOD):
   - Examples: "message to GOD: can you bless me", "send to GOD: I need help", "tell GOD: thank you", "GOD please help", "bless me GOD"
   - These are personal messages directly addressed to GOD that should be routed to GOD's inbox
   - Return JSON with: message (string indicating message was sent to GOD's inbox), selectedListing (null), selectedListing2 (null), listings (empty array), shouldRouteToGodInbox: true
   - The message should confirm that the user's message has been sent to GOD's inbox
   - Format: "\u2705 Your message has been sent to GOD's inbox. GOD will review it and respond when appropriate."

CRITICAL CLASSIFICATION RULES:
- If user asks "how to messaging", "how eden works", "what is eden", "who eden works" \u2192 EDEN-RELATED INFORMATIONAL QUERY
- If user asks "what is GOD in Bible", "what is the weather", "who is the president" (NOT about Eden) \u2192 GENERAL KNOWLEDGE QUERY
- If user asks "book a movie", "trade tokens", "buy TOKEN" \u2192 EDEN CHAT (workflow/service query)
- If listings are provided \u2192 EDEN CHAT (service query)
- If NO listings AND user asks question about Eden \u2192 EDEN-RELATED INFORMATIONAL QUERY
- If NO listings AND user asks general knowledge question (NOT about Eden) \u2192 GENERAL KNOWLEDGE QUERY

CRITICAL: Never output "service type not supported" or similar errors.
Always format the response for ANY service type provided, OR provide helpful informational answers.

For ANY OTHER SERVICE TYPE (not movie or dex):
- Extract key information from listings (name, price, location, rating, etc.)
- Format as a natural language message
- Select the best option based on user query
- Return the selected listing and all listings
- selectedListing2 MUST be set to the same value as selectedListing

## About Eden and Messaging System

When users ask questions about Eden, the messaging system, or how to use the interface, you should:

1. **Explain Eden**: Describe Eden as a garden-first economic and intelligence system that replaces blockchain with LLM-governed intelligence fees, federated gardens, and ROOT CA governance.

2. **Explain Messaging**: Mention that Eden has a Universal Messaging System for governed, auditable communication. Conversations are scoped to contexts (ORDER, TRADE, SERVICE, DISPUTE, SYSTEM) and messages are never deleted (only state changes).

3. **Guide UI Usage**: Explain that users can:
   - Type natural language requests in the chat input (EDEN CHAT for workflows, REGULAR TEXT CHAT for questions)
   - Follow workflow prompts and make decisions
   - View transactions in the ledger display
   - Watch videos (for movie services) in the video player modal

4. **Distinguish Chat Types**: 
   - EDEN CHAT: Use the input box to request services (movies, tokens, etc.) - these trigger workflows
   - REGULAR TEXT CHAT: Use the input box to ask questions about Eden - these get direct answers

5. **Suggest Conversations**: If users need ongoing help, suggest creating a conversation via the messaging system.

## Response Formatting Requirements

**CRITICAL**: Always format responses in a structured, readable way using:
- **Clear sections with headers** (use ## or ### for markdown)
- **Bullet points** for lists (use - or *)
- **Numbered lists** for step-by-step instructions
- **Bold text** for important terms or concepts
- **Line breaks** between sections for readability
- **Short paragraphs** (2-3 sentences max per paragraph)
- **Avoid long walls of text** - break information into digestible chunks

Example of good formatting:
\`\`\`
## Eden Overview

Eden is a garden-first economic and intelligence system that:
- Uses LLM-governed intelligence fees
- Operates through federated gardens
- Maintains governance through ROOT CA

## Universal Messaging System

Eden includes a messaging system that:
- Organizes conversations into contexts (ORDER, TRADE, SERVICE, DISPUTE, SYSTEM)
- Never deletes messages (only state changes)
- Ensures transparent communication history

## How to Use Eden

1. **EDEN CHAT**: Request services (movies, tokens, etc.) - triggers workflows
2. **REGULAR TEXT CHAT**: Ask questions - receives direct answers
\`\`\`

**NEVER** return long paragraphs without structure. Always use markdown formatting to make responses readable.

Service type: {serviceType}

Return JSON format:
{
  "message": "...",
  "listings": [...],
  "selectedListing": { /* complete listing object with ALL fields */ },
  "selectedListing2": { /* MUST be the same as selectedListing */ },
  "shouldRouteToGodInbox": false /* Set to true if this is a message to GOD that should be routed to inbox */
}
`;
async function extractQueryWithOpenAI(userInput) {
  if (!process.env.OPENAI_API_KEY && !import_config.MOCKED_LLM) {
    throw new Error("OpenAI API key is required for extractQueryWithOpenAI. Please set OPENAI_API_KEY environment variable.");
  }
  if (import_config.MOCKED_LLM) {
    const inputLower = userInput.toLowerCase();
    let mockServiceType = "movie";
    let mockFilters = {};
    if (inputLower.includes("token") || inputLower.includes("dex") || inputLower.includes("pool")) {
      mockServiceType = "dex";
      mockFilters = {
        tokenSymbol: inputLower.includes("tokenb") || inputLower.includes("token b") ? "TOKENB" : "TOKENA",
        baseToken: "SOL",
        action: inputLower.includes("sell") ? "SELL" : "BUY",
        tokenAmount: 1
      };
    } else if (inputLower.includes("flight") || inputLower.includes("airline") || inputLower.includes("airport")) {
      mockServiceType = "airline";
      mockFilters = {
        destination: "any",
        date: "any"
      };
    } else if (inputLower.includes("autopart") || inputLower.includes("car") || inputLower.includes("brake") || inputLower.includes("bumper")) {
      mockServiceType = "autoparts";
      mockFilters = {};
    } else {
      mockServiceType = "movie";
      mockFilters = {
        genre: "sci-fi",
        time: "evening"
      };
    }
    return {
      query: { serviceType: mockServiceType, filters: mockFilters },
      serviceType: mockServiceType,
      confidence: 0.9
    };
  }
  const messages = [
    { role: "system", content: LLM_QUERY_EXTRACTION_PROMPT },
    { role: "user", content: userInput }
  ];
  const requestBody = {
    model: "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.7
  };
  const requestBodyJson = JSON.stringify(requestBody);
  const requestBodyBuffer = Buffer.from(requestBodyJson, "utf-8");
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        port: 443,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Length": requestBodyBuffer.length.toString()
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => data += c);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(`OpenAI API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
              return;
            }
            if (parsed.choices?.[0]?.message?.content) {
              const content = JSON.parse(parsed.choices[0].message.content);
              resolve({
                query: content.query || { serviceType: "movie", filters: {} },
                serviceType: content.serviceType || "movie",
                confidence: content.confidence || 0.9
              });
            } else {
              reject(new Error("Invalid OpenAI response format"));
            }
          } catch (err) {
            reject(new Error(`Failed to parse OpenAI response: ${err.message}`));
          }
        });
      }
    );
    req.on("error", (err) => {
      reject(new Error(`OpenAI request failed: ${err.message}`));
    });
    req.write(requestBodyBuffer);
    req.end();
  });
}
async function formatResponseWithOpenAI(listings, userQuery, queryFilters) {
  console.log(`\u{1F916} [LLM] ========================================`);
  console.log(`\u{1F916} [LLM] formatResponseWithOpenAI called`);
  console.log(`\u{1F916} [LLM] User Query: "${userQuery}"`);
  console.log(`\u{1F916} [LLM] Service Type: ${queryFilters?.serviceType || "unknown"}`);
  console.log(`\u{1F916} [LLM] Listings Count: ${listings.length}`);
  console.log(`\u{1F916} [LLM] ========================================`);
  if (!process.env.OPENAI_API_KEY && !import_config.MOCKED_LLM) {
    const errorResponse = {
      message: "I apologize, but I'm unable to process your query right now. The OpenAI API key is not configured. Please set the OPENAI_API_KEY environment variable to enable LLM responses. Once configured, I'll be able to answer your questions using AI.",
      listings: [],
      selectedListing: null,
      selectedListing2: null,
      iGasCost: 0
    };
    console.log(`\u26A0\uFE0F [LLM] OpenAI API key not configured - returning error message`);
    return errorResponse;
  }
  if (import_config.MOCKED_LLM) {
    const mockResponse = {
      message: "Mock LLM response (MOCKED_LLM enabled for testing)",
      listings: listings.slice(0, 1),
      selectedListing: listings[0] || null,
      selectedListing2: listings[0] || null,
      iGasCost: 1e-3
    };
    console.log(`\u{1F916} [LLM] Mock LLM Response (MOCKED_LLM): "${mockResponse.message}"`);
    return mockResponse;
  }
  const serviceType = queryFilters?.serviceType || "movie";
  const listingsJson = JSON.stringify(listings);
  const filtersJson = queryFilters ? JSON.stringify(queryFilters) : "{}";
  const hasQuestionPattern = /how (to|does|do|can|will|works?)|what (is|are|does|do|can|will)|who (is|are|does|do|can|will)|explain|tell me about|help|guide/i.test(userQuery);
  const queryLower = userQuery.toLowerCase();
  const isEdenRelated = /\b(eden|garden|workflow|service|messaging|token|movie|ticket|pharmacy|flight|hotel|restaurant|autopart|dex|pool|trade|swap|buy|sell|book|find|order|god|root\s*ca|roca|judgment|settlement)\b/i.test(queryLower) || /\b(book|buy|sell|find|order|trade|swap)\s+(a|an|the|some|my|your)?\s*(movie|ticket|token|pharmacy|flight|hotel|restaurant|autopart)\b/i.test(queryLower);
  const isInformationalQuery = listings.length === 0 && hasQuestionPattern;
  const isEdenInfoQuery = isInformationalQuery && isEdenRelated;
  const isGeneralKnowledgeQuery = isInformationalQuery && !isEdenRelated;
  let systemPrompt = LLM_RESPONSE_FORMATTING_PROMPT.replace("{serviceType}", serviceType);
  if (isInformationalQuery) {
    console.log(`\u{1F4DA} [LLM] Informational query detected - adding messaging system prompt`);
    systemPrompt += `

${(0, import_llmMessagingPrompt.getMessagingSystemPrompt)()}`;
    if (isEdenInfoQuery) {
      console.log(`\u{1F4DA} [LLM] Eden-related informational query - retrieving RAG knowledge context`);
      const knowledgeContext = (0, import_edenKnowledgeBase.getKnowledgeContext)(userQuery);
      if (knowledgeContext) {
        console.log(`\u{1F4DA} [LLM] RAG knowledge context retrieved (${knowledgeContext.length} characters)`);
        systemPrompt += knowledgeContext;
        systemPrompt += `

**IMPORTANT**: Use the relevant Eden knowledge above to provide accurate, detailed answers. Reference specific concepts, architecture, and features when answering the user's question.`;
      } else {
        console.log(`\u26A0\uFE0F [LLM] No RAG knowledge context found for query: "${userQuery}"`);
      }
    } else {
      console.log(`\u{1F4DA} [LLM] General knowledge query (not Eden-related) - no RAG context needed`);
    }
  }
  const userMessage = isInformationalQuery ? isEdenInfoQuery ? `User query: ${userQuery}

This is an Eden-related informational query. Please answer the user's question about Eden, the messaging system, or how to use the interface. Provide a helpful, clear explanation about Eden using the knowledge provided above.

**CRITICAL FORMATTING REQUIREMENTS**:
- Use structured markdown formatting with clear sections (## headers)
- Use bullet points (- or *) for lists
- Use numbered lists for step-by-step instructions
- Use bold text (**text**) for important terms
- Add line breaks between sections
- Keep paragraphs short (2-3 sentences max)
- NEVER write long walls of text - break information into digestible chunks
- Make the response readable and scannable` : `User query: ${userQuery}

This is a GENERAL KNOWLEDGE question (NOT about Eden). Please answer the user's question naturally and helpfully.

**CRITICAL FORMATTING REQUIREMENTS**:
- Use structured markdown formatting with clear sections (## headers)
- Use bullet points (- or *) for lists
- Use numbered lists for step-by-step instructions
- Use bold text (**text**) for important terms
- Add line breaks between sections
- Keep paragraphs short (2-3 sentences max)
- NEVER write long walls of text - break information into digestible chunks
- Make the response readable and scannable` : `Service type: ${serviceType}

User query: ${userQuery}

Query filters: ${filtersJson}

Available listings:
${listingsJson}

Filter listings based on the query filters and format the best option as a user-friendly message.`;
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage }
  ];
  const requestBody = {
    model: "gpt-4o",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.7
  };
  const requestBodyJson = JSON.stringify(requestBody);
  const requestBodyBuffer = Buffer.from(requestBodyJson, "utf-8");
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        port: 443,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Length": requestBodyBuffer.length.toString()
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => data += c);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(`OpenAI API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
              return;
            }
            if (parsed.choices?.[0]?.message?.content) {
              const content = JSON.parse(parsed.choices[0].message.content);
              const hasQuestionPattern2 = /how (to|does|do|can|will|works?)|what (is|are|does|do|can|will)|who (is|are|does|do|can|will)|explain|tell me about|help|guide/i.test(userQuery);
              const queryLower2 = userQuery.toLowerCase();
              const isEdenRelated2 = /\b(eden|garden|workflow|service|messaging|token|movie|ticket|pharmacy|flight|hotel|restaurant|autopart|dex|pool|trade|swap|buy|sell|book|find|order|god|root\s*ca|roca|judgment|settlement)\b/i.test(queryLower2) || /\b(book|buy|sell|find|order|trade|swap)\s+(a|an|the|some|my|your)?\s*(movie|ticket|token|pharmacy|flight|hotel|restaurant|autopart)\b/i.test(queryLower2);
              const isInformational = listings.length === 0 && hasQuestionPattern2 && !isEdenRelated2;
              const isEdenInfo = listings.length === 0 && hasQuestionPattern2 && isEdenRelated2;
              const response = {
                message: content.message || "No response",
                listings: content.listings || (isInformational || isEdenInfo ? [] : listings),
                selectedListing: isInformational || isEdenInfo ? null : content.selectedListing || listings[0] || null,
                selectedListing2: isInformational || isEdenInfo ? null : content.selectedListing2 || content.selectedListing || listings[0] || null,
                iGasCost: content.iGasCost || 1e-3
              };
              console.log(`\u{1F916} [LLM] ========================================`);
              console.log(`\u{1F916} [LLM] OpenAI Response received`);
              console.log(`\u{1F916} [LLM] Is General Knowledge Query: ${isInformational}`);
              console.log(`\u{1F916} [LLM] Is Eden Info Query: ${isEdenInfo}`);
              console.log(`\u{1F916} [LLM] Response Message: "${response.message.substring(0, 200)}${response.message.length > 200 ? "..." : ""}"`);
              console.log(`\u{1F916} [LLM] iGas Cost: ${response.iGasCost}`);
              console.log(`\u{1F916} [LLM] Has Selected Listing: ${!!response.selectedListing}`);
              console.log(`\u{1F916} [LLM] ========================================`);
              resolve(response);
            } else {
              reject(new Error("Invalid OpenAI response format"));
            }
          } catch (err) {
            reject(new Error(`Failed to parse OpenAI response: ${err.message}`));
          }
        });
      }
    );
    req.on("error", (err) => {
      reject(new Error(`OpenAI request failed: ${err.message}`));
    });
    req.write(requestBodyBuffer);
    req.end();
  });
}
async function formatResponseWithDeepSeek(listings, userQuery, queryFilters) {
  console.log(`\u{1F916} [LLM] ========================================`);
  console.log(`\u{1F916} [LLM] formatResponseWithDeepSeek called`);
  console.log(`\u{1F916} [LLM] User Query: "${userQuery}"`);
  console.log(`\u{1F916} [LLM] Service Type: ${queryFilters?.serviceType || "unknown"}`);
  console.log(`\u{1F916} [LLM] Listings Count: ${listings.length}`);
  console.log(`\u{1F916} [LLM] ========================================`);
  const isInformationalQuery = listings.length === 0 || /how (to|does|do|can|will)|what (is|are|does|do|can|will)|who (is|are|does|do|can|will)|explain|tell me about|help|guide/i.test(userQuery);
  let message = "DeepSeek response (stub)";
  if (isInformationalQuery) {
    if (/messaging/i.test(userQuery)) {
      message = "The Universal Messaging System in Eden provides governed, auditable, real-time communication for all Eden entities. You can create conversations for orders, trades, services, disputes, or system questions. Would you like me to explain more about how to use messaging in Eden?";
    } else if (/eden|garden/i.test(userQuery)) {
      message = "The Garden of Eden (Eden) is a garden-first economic and intelligence system that replaces traditional blockchain with LLM-governed intelligence fees. Eden features gas-free transactions, garden-driven architecture, and self-governing federated gardens. Would you like me to explain more about Eden's architecture?";
    } else {
      message = "I can help you with Eden! Eden is a garden-first economic system where intelligence is the new gas (iGas). You can use the chat interface to request services, trade tokens, or ask questions. How can I help you today?";
    }
  }
  const selectedListing = isInformationalQuery ? null : listings[0] || null;
  const response = {
    message,
    listings: isInformationalQuery ? [] : listings.slice(0, 5),
    selectedListing,
    selectedListing2: selectedListing,
    // CRITICAL: Must return selectedListing2
    iGasCost: 1e-3
  };
  console.log(`\u{1F916} [LLM] ========================================`);
  console.log(`\u{1F916} [LLM] DeepSeek Response (stub) generated`);
  console.log(`\u{1F916} [LLM] Is Informational Query: ${isInformationalQuery}`);
  console.log(`\u{1F916} [LLM] Response Message: "${response.message}"`);
  console.log(`\u{1F916} [LLM] iGas Cost: ${response.iGasCost}`);
  console.log(`\u{1F916} [LLM] Has Selected Listing: ${!!response.selectedListing}`);
  console.log(`\u{1F916} [LLM] ========================================`);
  return response;
}
const LLM_SQL_PARAMETERIZATION_PROMPT = `
You are Eden ROOT CA AI - GOD's SQL security controller.
Your role is to convert SQL queries with hardcoded values into parameterized queries (using ? placeholders) to prevent SQL injection.

CRITICAL RULES:
1. Replace ALL hardcoded values in WHERE clauses with ? placeholders
2. Extract the parameter values in the EXACT order they appear in the query
3. Keep static values (like status = 1, archived = 0, published = 1) as-is if they are constants
4. For LIKE clauses with CONCAT, replace the search term with ? but keep the CONCAT structure
5. Preserve the original SQL structure, formatting, and comments
6. Return the parameterized SQL and the parameter array in order

EXAMPLES:

Input SQL:
SELECT * FROM autoparts 
WHERE year = 2020
  AND make = 'honda' 
  AND model = 'civic'
  AND title LIKE CONCAT('%', 'bumper', '%') 
  AND status = 1
  AND archived = 0 
  AND published = 1
ORDER BY id DESC
LIMIT 30 OFFSET 0

Output:
{
  "parameterizedSql": "SELECT * FROM autoparts WHERE year = ? AND make = ? AND model = ? AND title LIKE CONCAT('%', ?, '%') AND status = 1 AND archived = 0 AND published = 1 ORDER BY id DESC LIMIT 30 OFFSET 0",
  "params": [2020, "honda", "civic", "bumper"],
  "paramOrder": ["year", "make", "model", "title"],
  "confidence": 1.0
}

Input SQL:
SELECT * FROM products WHERE category = 'electronics' AND price > 100 AND name LIKE '%phone%'

Output:
{
  "parameterizedSql": "SELECT * FROM products WHERE category = ? AND price > ? AND name LIKE ?",
  "params": ["electronics", 100, "%phone%"],
  "paramOrder": ["category", "price", "name"],
  "confidence": 1.0
}

CRITICAL: Return ONLY valid JSON. No explanations, no markdown, just the JSON object.
`;
async function parameterizeSQLWithOpenAI(sql) {
  if (!process.env.OPENAI_API_KEY && !import_config.MOCKED_LLM) {
    throw new Error("OpenAI API key is required for parameterizeSQLWithOpenAI. Please set OPENAI_API_KEY environment variable.");
  }
  if (import_config.MOCKED_LLM) {
    const params = [];
    const paramOrder = [];
    let parameterizedSql = sql;
    const yearMatch = sql.match(/year\s*=\s*(\d+)/i);
    if (yearMatch) {
      params.push(Number(yearMatch[1]));
      paramOrder.push("year");
      parameterizedSql = parameterizedSql.replace(yearMatch[0], `year = ?`);
    }
    const makeMatch = sql.match(/make\s*=\s*'([^']+)'/i);
    if (makeMatch) {
      params.push(makeMatch[1]);
      paramOrder.push("make");
      parameterizedSql = parameterizedSql.replace(makeMatch[0], `make = ?`);
    }
    const modelMatch = sql.match(/model\s*=\s*'([^']+)'/i);
    if (modelMatch) {
      params.push(modelMatch[1]);
      paramOrder.push("model");
      parameterizedSql = parameterizedSql.replace(modelMatch[0], `model = ?`);
    }
    const titleMatch1 = sql.match(/title\s+LIKE\s+CONCAT\s*\(\s*'%'\s*,\s*'([^']+)'\s*,\s*'%'\s*\)/i);
    const titleMatch2 = sql.match(/title\s+LIKE\s+'([^']+)'/i);
    if (titleMatch1) {
      const searchTerm = titleMatch1[1];
      params.push(searchTerm);
      paramOrder.push("title");
      parameterizedSql = parameterizedSql.replace(titleMatch1[0], `title LIKE CONCAT('%', ?, '%')`);
    } else if (titleMatch2) {
      const searchTerm = titleMatch2[1].replace(/%/g, "");
      params.push(searchTerm);
      paramOrder.push("title");
      parameterizedSql = parameterizedSql.replace(titleMatch2[0], `title LIKE CONCAT('%', ?, '%')`);
    }
    const statusMatch = sql.match(/status\s*=\s*(\d+)/i);
    if (statusMatch) {
      params.push(Number(statusMatch[1]));
      paramOrder.push("status");
      parameterizedSql = parameterizedSql.replace(statusMatch[0], `status = ?`);
    }
    if (/LIMIT\s+\d+/i.test(parameterizedSql)) {
      const limitMatch = parameterizedSql.match(/LIMIT\s+(\d+)/i);
      if (limitMatch && !parameterizedSql.includes("LIMIT ?")) {
        parameterizedSql = parameterizedSql.replace(/LIMIT\s+\d+/i, "LIMIT ?");
        params.push(Number(limitMatch[1]));
        paramOrder.push("limit");
      }
    }
    if (/OFFSET\s+\d+/i.test(parameterizedSql)) {
      const offsetMatch = parameterizedSql.match(/OFFSET\s+(\d+)/i);
      if (offsetMatch && !parameterizedSql.includes("OFFSET ?")) {
        parameterizedSql = parameterizedSql.replace(/OFFSET\s+\d+/i, "OFFSET ?");
        params.push(Number(offsetMatch[1]));
        paramOrder.push("offset");
      }
    }
    return {
      parameterizedSql,
      params,
      paramOrder,
      confidence: 0.95
    };
  }
  const messages = [
    { role: "system", content: LLM_SQL_PARAMETERIZATION_PROMPT },
    { role: "user", content: sql }
  ];
  const requestBody = {
    model: "gpt-4o",
    messages,
    temperature: 0.1,
    // Low temperature for deterministic SQL conversion
    max_tokens: 1e3,
    response_format: { type: "json_object" }
  };
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || "OpenAI API error"));
            return;
          }
          const content = response.choices[0]?.message?.content;
          if (!content) {
            reject(new Error("No content in OpenAI response"));
            return;
          }
          const parsed = JSON.parse(content);
          const result = {
            parameterizedSql: String(parsed.parameterizedSql || sql),
            params: Array.isArray(parsed.params) ? parsed.params : [],
            paramOrder: Array.isArray(parsed.paramOrder) ? parsed.paramOrder.map((p) => String(p)) : [],
            confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0.9)))
          };
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse OpenAI response: ${err.message}`));
        }
      });
    });
    req.on("error", (err) => {
      reject(new Error(`OpenAI API request failed: ${err.message}`));
    });
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}
async function determineDecisionResponse(userInput, decisionPrompt, decisionOptions) {
  const ENABLE_OPENAI2 = process.env.ENABLE_OPENAI !== "false";
  const MOCKED_LLM2 = process.env.MOCKED_LLM === "true";
  if (MOCKED_LLM2) {
    const inputLower = userInput.toLowerCase().trim();
    const positiveKeywords = ["yes", "y", "ok", "okay", "sure", "confirm", "proceed", "preceed", "go", "continue", "accept"];
    const negativeKeywords = ["no", "n", "cancel", "stop", "abort", "reject", "decline"];
    if (positiveKeywords.some((kw) => inputLower.includes(kw))) {
      return { isDecisionResponse: true, decisionValue: "YES", confidence: 0.9 };
    }
    if (negativeKeywords.some((kw) => inputLower.includes(kw))) {
      return { isDecisionResponse: true, decisionValue: "NO", confidence: 0.9 };
    }
    return { isDecisionResponse: false, decisionValue: null, confidence: 0.1 };
  }
  const prompt = `You are analyzing user input to determine if it's a decision response for a workflow.

The workflow is asking the user: "${decisionPrompt}"

Available decision options:
${decisionOptions.map((opt, i) => `${i + 1}. ${opt.label} (value: ${opt.value})`).join("\n")}

User input: "${userInput}"

Determine if the user input is a decision response (yes/no/confirm/cancel/etc.) for the above prompt.

Return JSON only with:
- isDecisionResponse: boolean (true if input is a decision response, false if it's a new query/request)
- decisionValue: string | null (the decision value if isDecisionResponse is true, matching one of the option values or "YES"/"NO" for simple confirmations, null if not a decision)
- confidence: number (0.0 to 1.0)

Examples:
- Input: "yes" \u2192 {"isDecisionResponse": true, "decisionValue": "YES", "confidence": 0.95}
- Input: "yes, proceed" \u2192 {"isDecisionResponse": true, "decisionValue": "YES", "confidence": 0.95}
- Input: "no" \u2192 {"isDecisionResponse": true, "decisionValue": "NO", "confidence": 0.95}
- Input: "I want a movie" \u2192 {"isDecisionResponse": false, "decisionValue": null, "confidence": 0.9}
- Input: "cancel" \u2192 {"isDecisionResponse": true, "decisionValue": "NO", "confidence": 0.9}

CRITICAL: If the input is clearly a new service request (like "I want a movie", "book tickets", etc.), return isDecisionResponse: false.
Only return isDecisionResponse: true if the input is clearly responding to the decision prompt.`;
  if (ENABLE_OPENAI2) {
    return determineDecisionResponseWithOpenAI(userInput, prompt);
  } else {
    return determineDecisionResponseWithDeepSeek(userInput, prompt);
  }
}
async function determineDecisionResponseWithOpenAI(userInput, prompt) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is required");
  }
  const messages = [
    { role: "system", content: prompt },
    { role: "user", content: userInput }
  ];
  const requestBody = {
    model: "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.3
  };
  const requestBodyJson = JSON.stringify(requestBody);
  const requestBodyBuffer = Buffer.from(requestBodyJson, "utf-8");
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        port: 443,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Length": requestBodyBuffer.length.toString()
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => data += c);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(`OpenAI API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
              return;
            }
            if (parsed.choices?.[0]?.message?.content) {
              const content = JSON.parse(parsed.choices[0].message.content);
              resolve({
                isDecisionResponse: content.isDecisionResponse === true,
                decisionValue: content.decisionValue || null,
                confidence: content.confidence || 0.5
              });
            } else {
              reject(new Error("Invalid OpenAI response format"));
            }
          } catch (err) {
            reject(new Error(`Failed to parse OpenAI response: ${err.message}`));
          }
        });
      }
    );
    req.on("error", (err) => {
      reject(new Error(`OpenAI request failed: ${err.message}`));
    });
    req.write(requestBodyBuffer);
    req.end();
  });
}
async function determineDecisionResponseWithDeepSeek(userInput, prompt) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DeepSeek API key is required");
  }
  const messages = [
    { role: "system", content: prompt },
    { role: "user", content: userInput }
  ];
  const requestBody = {
    model: "deepseek-chat",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.3
  };
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.deepseek.com",
        port: 443,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => data += c);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(`DeepSeek API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
              return;
            }
            if (parsed.choices?.[0]?.message?.content) {
              const content = JSON.parse(parsed.choices[0].message.content);
              resolve({
                isDecisionResponse: content.isDecisionResponse === true,
                decisionValue: content.decisionValue || null,
                confidence: content.confidence || 0.5
              });
            } else {
              reject(new Error("Invalid DeepSeek response format"));
            }
          } catch (err) {
            reject(new Error(`Failed to parse DeepSeek response: ${err.message}`));
          }
        });
      }
    );
    req.on("error", (err) => {
      reject(new Error(`DeepSeek request failed: ${err.message}`));
    });
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LLM_GET_DATA_PARAMS_PROMPT,
  LLM_QUERY_EXTRACTION_PROMPT,
  LLM_RESPONSE_FORMATTING_PROMPT,
  LLM_SQL_PARAMETERIZATION_PROMPT,
  callLLM,
  determineDecisionResponse,
  extractGetDataParamsWithOpenAI,
  extractQueryWithOpenAI,
  formatResponseWithDeepSeek,
  formatResponseWithOpenAI,
  initializeLLM,
  parameterizeSQLWithOpenAI
});
//# sourceMappingURL=llm.js.map
