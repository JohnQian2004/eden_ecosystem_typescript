/**
 * LLM Module
 * Handles LLM query extraction and response formatting
 */

import * as https from "https";
import * as http from "http";
import { URL } from "url";
import type { MovieListing, TokenListing, LLMQueryResult, LLMResponse, ServiceRegistryQuery } from "./types";
import { MOCKED_LLM, ENABLE_OPENAI } from "./config";
import { getMessagingSystemPrompt } from "./messaging/llmMessagingPrompt";
import { getKnowledgeContext } from "./rag/edenKnowledgeBase";

// Dependencies that need to be injected
let broadcastEvent: (event: any) => void;

/**
 * Initialize LLM module with dependencies
 */
export function initializeLLM(broadcastFn: (event: any) => void): void {
  broadcastEvent = broadcastFn;
}

// LLM System Prompts
export const LLM_QUERY_EXTRACTION_PROMPT = `
You are Eden Core AI query processor.
Extract service query from user input.
Return JSON only with: query (object with serviceType and filters), serviceType, confidence.

🚨 CRITICAL: Distinguish between EDEN CHAT (workflow queries) and REGULAR TEXT CHAT (informational queries):

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
  1. If user mentions "TOKEN" (with or without a letter) AND mentions "SOL" or "SOLANA" → ALWAYS DEX
  2. If user mentions "trade" AND mentions "TOKEN" or "SOL" → ALWAYS DEX
  3. If user mentions "DEX" or "pool" → ALWAYS DEX
  4. If user mentions "token" (lowercase) AND a token symbol (TOKEN, TOKENA, TOKENB, etc.) → ALWAYS DEX
  5. If user mentions "swap" or "exchange" with "TOKEN" or "SOL" → ALWAYS DEX
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

🚨 CRITICAL QUANTITY EXTRACTION RULES (MUST FOLLOW):
- Pattern: "Trade [NUMBER] SOL with TOKEN" → baseAmount = [NUMBER], tokenSymbol = "TOKEN", baseToken = "SOL", action = "BUY"
  * Example: "Trade 2 SOL with TOKEN" → baseAmount = 2 (NOT tokenAmount = 2!)
  * Example: "Trade 5 SOL with TOKEN" → baseAmount = 5
  * Example: "Trade 10 SOL with TOKEN" → baseAmount = 10
  * THE NUMBER BEFORE "SOL" IS ALWAYS THE baseAmount (quantity of SOL to spend)
- Pattern: "Trade [NUMBER] SOL with TOKENA" → baseAmount = [NUMBER], tokenSymbol = "TOKENA", baseToken = "SOL", action = "BUY"
  * Example: "Trade 2 SOL with TOKENA" → baseAmount = 2, tokenSymbol = "TOKENA"
  * Example: "Trade 3 SOL with TOKENA" → baseAmount = 3, tokenSymbol = "TOKENA"
- Pattern: "Trade [NUMBER] SOL with TOKENB" → baseAmount = [NUMBER], tokenSymbol = "TOKENB", baseToken = "SOL", action = "BUY"
- Pattern: "Buy TOKEN with [NUMBER] SOL" → baseAmount = [NUMBER], tokenSymbol = "TOKEN", baseToken = "SOL", action = "BUY"
- Pattern: "Swap [NUMBER] SOL for TOKEN" → baseAmount = [NUMBER], tokenSymbol = "TOKEN", baseToken = "SOL", action = "BUY"
- Pattern: "Buy [NUMBER] TOKEN" → tokenAmount = [NUMBER], tokenSymbol = "TOKEN", action = "BUY" (number refers to tokens, not SOL)
- Pattern: "Buy [NUMBER] TOKENA" → tokenAmount = [NUMBER], tokenSymbol = "TOKENA", action = "BUY" (number refers to tokens, not SOL)

CRITICAL: Understanding quantity specifications:
- "Trade 2 SOL with TOKEN" or "Trade 2 SOL with TOKENA" → baseAmount = 2, tokenSymbol = "TOKEN" or "TOKENA", action = "BUY" (user wants to spend 2 SOL to buy tokens)
- "Buy TOKEN with 2 SOL" or "Buy TOKENA with 2 SOL" → baseAmount = 2, tokenSymbol = "TOKEN" or "TOKENA", action = "BUY"
- "Swap 2 SOL for TOKEN" or "Swap 2 SOL for TOKENA" → baseAmount = 2, tokenSymbol = "TOKEN" or "TOKENA", action = "BUY"
- "Buy 2 TOKEN" or "Buy 2 TOKENA" → tokenAmount = 2, tokenSymbol = "TOKEN" or "TOKENA", action = "BUY" (user wants 2 tokens)
- When baseAmount is specified, the system will calculate tokenAmount from the pool price
- When tokenAmount is specified, the system will calculate baseAmount from the pool price

PATTERN RECOGNITION (EXTRACT THE NUMBER!):
- "Trade X SOL with TOKEN" → baseAmount = X (extract X as a number!), tokenSymbol = "TOKEN", baseToken = "SOL", action = "BUY"
- "Trade X SOL with TOKENA" → baseAmount = X (extract X as a number!), tokenSymbol = "TOKENA", baseToken = "SOL", action = "BUY"
- "Trade X SOL with TOKENB" → baseAmount = X (extract X as a number!), tokenSymbol = "TOKENB", baseToken = "SOL", action = "BUY"
- If user says "Trade 2 SOL with TOKEN", you MUST extract baseAmount = 2 (the number 2 is the quantity of SOL)

IMPORTANT: In phrases like "BUY 2 SOLANA token A":
- tokenSymbol = "TOKENA" (the token being bought)
- baseToken = "SOL" (SOLANA/SOL is the currency used to buy)
- tokenAmount = 2 (if "2" refers to tokens) OR baseAmount = 2 (if "2" refers to SOL - need context)

Example: {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKENA", "baseToken": "SOL", "action": "BUY", "tokenAmount": 2, "maxPrice": 1}}, "serviceType": "dex", "confidence": 0.95}
Example: {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKEN", "baseToken": "SOL", "action": "BUY", "baseAmount": 2}}, "serviceType": "dex", "confidence": 0.95}

🚨 MANDATORY EXAMPLES - EXTRACT THE NUMBER CORRECTLY:
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
- When in doubt between movie and DEX, check: Does the query mention "TOKEN", "SOL", "DEX", "pool", or "trade"? If YES → DEX. If NO → Movie.
`;

/**
 * ROOT CA LLM Service: getData() Parameter Extraction
 * 
 * This is a GOD-controlled service that translates natural language queries
 * into structured getData() function parameters for provider data layers.
 * 
 * Example:
 *   Input: "I need a front bumper for 2020 Nissan Altima at best price"
 *   Output: {
 *     serviceType: "autoparts",
 *     params: ["2020 Nissan Altima", "front bumper"],
 *     maxCount: 30,
 *     sortBy: "price",
 *     order: "asc"
 *   }
 */
export const LLM_GET_DATA_PARAMS_PROMPT = `
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
   - "autoparts", "auto parts", "car parts", "bumper", "brake", "tire" → serviceType: "autoparts"
   - "flight", "airline", "fly", "ticket" (with destination) → serviceType: "airline"
   - "pharmacy", "prescription", "medication", "drug" → serviceType: "pharmacy"
   - "hotel", "room", "stay", "booking" (accommodation) → serviceType: "hotel"
   - "restaurant", "reservation", "dinner", "lunch" → serviceType: "restaurant"
   - "movie", "cinema", "theater" → serviceType: "movie"
   - "token", "DEX", "TOKENA", "TOKENB" → serviceType: "dex"

2. PARAMETER EXTRACTION:
   - Extract key search terms (make/model, destination, medication name, etc.)
   - Extract filters (year, location, date, etc.)
   - Order params by importance (most specific first)
   - Example: "2020 Nissan Altima front bumper" → params: ["2020 Nissan Altima", "front bumper"]
   - Example: "flight from New York to Los Angeles" → params: ["New York", "Los Angeles"]

3. SORTING HINTS:
   - "best price", "cheapest", "lowest price" → sortBy: "price", order: "asc"
   - "highest rating", "best rated" → sortBy: "rating", order: "desc"
   - "newest", "latest" → sortBy: "date", order: "desc"
   - "best", "top" (without qualifier) → sortBy: "rating", order: "desc"

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

export type GetDataParamsResult = {
  serviceType: string;
  params: string[];
  maxCount: number;
  sortBy?: string;
  order?: "asc" | "desc";
  confidence: number;
};

export async function extractGetDataParamsWithOpenAI(userInput: string): Promise<GetDataParamsResult> {
  // Require OpenAI API key - no mock fallbacks
  if (!process.env.OPENAI_API_KEY && !MOCKED_LLM) {
    throw new Error("OpenAI API key is required for extractGetDataParamsWithOpenAI. Please set OPENAI_API_KEY environment variable.");
  }
  
  // Only use mock mode if explicitly enabled (for testing)
  if (MOCKED_LLM) {
    // Mock response for testing - extract basic info from user query
    const queryLower = userInput.toLowerCase();
    let serviceType = "autoparts";
    let params: string[] = [];
    
    // Try to extract service type from query
    if (queryLower.includes("flight") || queryLower.includes("airline") || queryLower.includes("fly")) {
      serviceType = "airline";
    } else if (queryLower.includes("pharmacy") || queryLower.includes("prescription") || queryLower.includes("medication")) {
      serviceType = "pharmacy";
    } else if (queryLower.includes("hotel") || queryLower.includes("room")) {
      serviceType = "hotel";
    } else if (queryLower.includes("restaurant") || queryLower.includes("reservation") || queryLower.includes("dinner")) {
      serviceType = "restaurant";
    }
    
    // Extract key terms as params (simple word extraction)
    const words = userInput.split(/\s+/).filter(w => w.length > 3 && !['need', 'want', 'find', 'show', 'get', 'best', 'price'].includes(w.toLowerCase()));
    params = words.slice(0, 5); // Take first 5 meaningful words
    
    return {
      serviceType,
      params: params.length > 0 ? params : ["query"],
      maxCount: 30,
      sortBy: queryLower.includes("best price") || queryLower.includes("cheapest") ? "price" : undefined,
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
      res.on("data", (chunk) => { data += chunk.toString(); });
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
          // Validate and normalize response
          const result: GetDataParamsResult = {
            serviceType: String(parsed.serviceType || "autoparts"),
            params: Array.isArray(parsed.params) ? parsed.params.map((p: any) => String(p)) : [],
            maxCount: Math.max(1, Math.min(Number(parsed.maxCount || 30), 100)),
            sortBy: parsed.sortBy ? String(parsed.sortBy) : undefined,
            order: parsed.order === "desc" ? "desc" : "asc",
            confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0.9)))
          };
          resolve(result);
        } catch (err: any) {
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

// OpenAI API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Simple LLM call function (used by other modules)
export async function callLLM(prompt: string, useOpenAI: boolean = true): Promise<string> {
  if (MOCKED_LLM) {
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
    max_tokens: 1000
  };

  const requestBodyJson = JSON.stringify(requestBody);
  const requestBodyBuffer = Buffer.from(requestBodyJson, 'utf-8');

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
        res.on("data", (c) => (data += c));
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
          } catch (err: any) {
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

// LLM Response Formatting Prompt
export const LLM_RESPONSE_FORMATTING_PROMPT = `
You are Eden Core AI response formatter.
Format service listings into a user-friendly message, OR answer informational questions about Eden.

🚨 CRITICAL DISTINCTION: There are TWO types of user queries in Eden:

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

CRITICAL CLASSIFICATION RULES:
- If user asks "how to messaging", "how eden works", "what is eden", "who eden works" → EDEN-RELATED INFORMATIONAL QUERY
- If user asks "what is GOD in Bible", "what is the weather", "who is the president" (NOT about Eden) → GENERAL KNOWLEDGE QUERY
- If user asks "book a movie", "trade tokens", "buy TOKEN" → EDEN CHAT (workflow/service query)
- If listings are provided → EDEN CHAT (service query)
- If NO listings AND user asks question about Eden → EDEN-RELATED INFORMATIONAL QUERY
- If NO listings AND user asks general knowledge question (NOT about Eden) → GENERAL KNOWLEDGE QUERY

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
  "selectedListing2": { /* MUST be the same as selectedListing */ }
}
`;

/**
 * Extract query from user input using OpenAI
 */
export async function extractQueryWithOpenAI(userInput: string): Promise<LLMQueryResult> {
  // Require OpenAI API key - no mock fallbacks
  if (!process.env.OPENAI_API_KEY && !MOCKED_LLM) {
    throw new Error("OpenAI API key is required for extractQueryWithOpenAI. Please set OPENAI_API_KEY environment variable.");
  }
  
  // Only use mock mode if explicitly enabled (for testing)
  if (MOCKED_LLM) {
    // Try to extract service type from input for better mock response
    const inputLower = userInput.toLowerCase();
    let mockServiceType = "movie";
    let mockFilters: any = {};
    
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
  const requestBodyBuffer = Buffer.from(requestBodyJson, 'utf-8');

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
        res.on("data", (c) => (data += c));
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
          } catch (err: any) {
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

/**
 * Format response using OpenAI
 */
export async function formatResponseWithOpenAI(
  listings: MovieListing[] | TokenListing[],
  userQuery: string,
  queryFilters?: { serviceType?: string; maxPrice?: number | string; genre?: string; time?: string; location?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL'; [key: string]: any }
): Promise<LLMResponse> {
  console.log(`🤖 [LLM] ========================================`);
  console.log(`🤖 [LLM] formatResponseWithOpenAI called`);
  console.log(`🤖 [LLM] User Query: "${userQuery}"`);
  console.log(`🤖 [LLM] Service Type: ${queryFilters?.serviceType || 'unknown'}`);
  console.log(`🤖 [LLM] Listings Count: ${listings.length}`);
  console.log(`🤖 [LLM] ========================================`);
  
  // If OpenAI API key is not available, return a helpful error message
  // The LLM should handle all logic, not regex parsing and hardcoded answers
  if (!process.env.OPENAI_API_KEY && !MOCKED_LLM) {
    const errorResponse: LLMResponse = {
      message: "I apologize, but I'm unable to process your query right now. The OpenAI API key is not configured. Please set the OPENAI_API_KEY environment variable to enable LLM responses. Once configured, I'll be able to answer your questions using AI.",
      listings: [],
      selectedListing: null,
      selectedListing2: null,
      iGasCost: 0
    };
    console.log(`⚠️ [LLM] OpenAI API key not configured - returning error message`);
    return errorResponse;
  }
  
  // Only use mock mode if explicitly enabled (for testing)
  if (MOCKED_LLM) {
    const mockResponse: LLMResponse = {
      message: "Mock LLM response (MOCKED_LLM enabled for testing)",
      listings: listings.slice(0, 1),
      selectedListing: listings[0] || null,
      selectedListing2: listings[0] || null,
      iGasCost: 0.001
    };
    console.log(`🤖 [LLM] Mock LLM Response (MOCKED_LLM): "${mockResponse.message}"`);
    return mockResponse;
  }

  const serviceType = queryFilters?.serviceType || "movie";
  const listingsJson = JSON.stringify(listings);
  const filtersJson = queryFilters ? JSON.stringify(queryFilters) : "{}";
  
  // Check if this is an informational query
  // Must be: (no listings) AND (question pattern) AND (NOT about Eden services/workflows)
  const hasQuestionPattern = /how (to|does|do|can|will|works?)|what (is|are|does|do|can|will)|who (is|are|does|do|can|will)|explain|tell me about|help|guide/i.test(userQuery);
  const queryLower = userQuery.toLowerCase();
  // More specific Eden-related keywords - must be clearly about Eden services/workflows
  // Use word boundaries to avoid false matches (e.g., "GOD" shouldn't match "workflow")
  const isEdenRelated = /\b(eden|garden|workflow|service|messaging|token|movie|ticket|pharmacy|flight|hotel|restaurant|autopart|dex|pool|trade|swap|buy|sell|book|find|order|god|root\s*ca|roca|judgment|settlement)\b/i.test(queryLower) ||
    /\b(book|buy|sell|find|order|trade|swap)\s+(a|an|the|some|my|your)?\s*(movie|ticket|token|pharmacy|flight|hotel|restaurant|autopart)\b/i.test(queryLower);
  const isInformationalQuery = listings.length === 0 && hasQuestionPattern;
  const isEdenInfoQuery = isInformationalQuery && isEdenRelated;
  const isGeneralKnowledgeQuery = isInformationalQuery && !isEdenRelated;
  
  let systemPrompt = LLM_RESPONSE_FORMATTING_PROMPT.replace("{serviceType}", serviceType);
  
  // For informational queries, include messaging system prompt and RAG context
  if (isInformationalQuery) {
    console.log(`📚 [LLM] Informational query detected - adding messaging system prompt`);
    systemPrompt += `\n\n${getMessagingSystemPrompt()}`;
    
    // Add RAG context for Eden-related queries
    if (isEdenInfoQuery) {
      console.log(`📚 [LLM] Eden-related informational query - retrieving RAG knowledge context`);
      const knowledgeContext = getKnowledgeContext(userQuery);
      if (knowledgeContext) {
        console.log(`📚 [LLM] RAG knowledge context retrieved (${knowledgeContext.length} characters)`);
        systemPrompt += knowledgeContext;
        systemPrompt += `\n\n**IMPORTANT**: Use the relevant Eden knowledge above to provide accurate, detailed answers. Reference specific concepts, architecture, and features when answering the user's question.`;
      } else {
        console.log(`⚠️ [LLM] No RAG knowledge context found for query: "${userQuery}"`);
      }
    } else {
      console.log(`📚 [LLM] General knowledge query (not Eden-related) - no RAG context needed`);
    }
  }
  
  const userMessage = isInformationalQuery
    ? isEdenInfoQuery
      ? `User query: ${userQuery}\n\nThis is an Eden-related informational query. Please answer the user's question about Eden, the messaging system, or how to use the interface. Provide a helpful, clear explanation about Eden using the knowledge provided above.\n\n**CRITICAL FORMATTING REQUIREMENTS**:\n- Use structured markdown formatting with clear sections (## headers)\n- Use bullet points (- or *) for lists\n- Use numbered lists for step-by-step instructions\n- Use bold text (**text**) for important terms\n- Add line breaks between sections\n- Keep paragraphs short (2-3 sentences max)\n- NEVER write long walls of text - break information into digestible chunks\n- Make the response readable and scannable`
      : `User query: ${userQuery}\n\nThis is a GENERAL KNOWLEDGE question (NOT about Eden). Please answer the user's question naturally and helpfully.\n\n**CRITICAL FORMATTING REQUIREMENTS**:\n- Use structured markdown formatting with clear sections (## headers)\n- Use bullet points (- or *) for lists\n- Use numbered lists for step-by-step instructions\n- Use bold text (**text**) for important terms\n- Add line breaks between sections\n- Keep paragraphs short (2-3 sentences max)\n- NEVER write long walls of text - break information into digestible chunks\n- Make the response readable and scannable`
    : `Service type: ${serviceType}\n\nUser query: ${userQuery}\n\nQuery filters: ${filtersJson}\n\nAvailable listings:\n${listingsJson}\n\nFilter listings based on the query filters and format the best option as a user-friendly message.`;

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
  const requestBodyBuffer = Buffer.from(requestBodyJson, 'utf-8');

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
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(`OpenAI API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
              return;
            }
            if (parsed.choices?.[0]?.message?.content) {
              const content = JSON.parse(parsed.choices[0].message.content);
              
              // For informational queries, selectedListing can be null
              const hasQuestionPattern = /how (to|does|do|can|will|works?)|what (is|are|does|do|can|will)|who (is|are|does|do|can|will)|explain|tell me about|help|guide/i.test(userQuery);
              const queryLower = userQuery.toLowerCase();
              // More specific Eden-related keywords - must be clearly about Eden services/workflows
              // Use word boundaries to avoid false matches (e.g., "GOD" shouldn't match "workflow")
              const isEdenRelated = /\b(eden|garden|workflow|service|messaging|token|movie|ticket|pharmacy|flight|hotel|restaurant|autopart|dex|pool|trade|swap|buy|sell|book|find|order|god|root\s*ca|roca|judgment|settlement)\b/i.test(queryLower) ||
                /\b(book|buy|sell|find|order|trade|swap)\s+(a|an|the|some|my|your)?\s*(movie|ticket|token|pharmacy|flight|hotel|restaurant|autopart)\b/i.test(queryLower);
              const isInformational = listings.length === 0 && hasQuestionPattern && !isEdenRelated;
              const isEdenInfo = listings.length === 0 && hasQuestionPattern && isEdenRelated;
              
              const response: LLMResponse = {
                message: content.message || "No response",
                listings: content.listings || ((isInformational || isEdenInfo) ? [] : listings),
                selectedListing: (isInformational || isEdenInfo) ? null : (content.selectedListing || listings[0] || null),
                selectedListing2: (isInformational || isEdenInfo) ? null : (content.selectedListing2 || content.selectedListing || listings[0] || null),
                iGasCost: content.iGasCost || 0.001
              };
              console.log(`🤖 [LLM] ========================================`);
              console.log(`🤖 [LLM] OpenAI Response received`);
              console.log(`🤖 [LLM] Is General Knowledge Query: ${isInformational}`);
              console.log(`🤖 [LLM] Is Eden Info Query: ${isEdenInfo}`);
              console.log(`🤖 [LLM] Response Message: "${response.message.substring(0, 200)}${response.message.length > 200 ? '...' : ''}"`);
              console.log(`🤖 [LLM] iGas Cost: ${response.iGasCost}`);
              console.log(`🤖 [LLM] Has Selected Listing: ${!!response.selectedListing}`);
              console.log(`🤖 [LLM] ========================================`);
              resolve(response);
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

    req.write(requestBodyBuffer);
    req.end();
  });
}

/**
 * Format response using DeepSeek (stub - full implementation can be added later)
 */
export async function formatResponseWithDeepSeek(
  listings: MovieListing[] | TokenListing[],
  userQuery: string,
  queryFilters?: { serviceType?: string; maxPrice?: number | string; genre?: string; time?: string; location?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL'; [key: string]: any }
): Promise<LLMResponse> {
  console.log(`🤖 [LLM] ========================================`);
  console.log(`🤖 [LLM] formatResponseWithDeepSeek called`);
  console.log(`🤖 [LLM] User Query: "${userQuery}"`);
  console.log(`🤖 [LLM] Service Type: ${queryFilters?.serviceType || 'unknown'}`);
  console.log(`🤖 [LLM] Listings Count: ${listings.length}`);
  console.log(`🤖 [LLM] ========================================`);
  
  // Check if this is an informational query
  const isInformationalQuery = listings.length === 0 || 
    /how (to|does|do|can|will)|what (is|are|does|do|can|will)|who (is|are|does|do|can|will)|explain|tell me about|help|guide/i.test(userQuery);
  
  // Stub implementation - can be filled in later
  // For informational queries, provide a helpful response
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
  
  const selectedListing = isInformationalQuery ? null : (listings[0] || null);
  const response: LLMResponse = {
    message: message,
    listings: isInformationalQuery ? [] : listings.slice(0, 5),
    selectedListing: selectedListing,
    selectedListing2: selectedListing, // CRITICAL: Must return selectedListing2
    iGasCost: 0.001
  };
  
  console.log(`🤖 [LLM] ========================================`);
  console.log(`🤖 [LLM] DeepSeek Response (stub) generated`);
  console.log(`🤖 [LLM] Is Informational Query: ${isInformationalQuery}`);
  console.log(`🤖 [LLM] Response Message: "${response.message}"`);
  console.log(`🤖 [LLM] iGas Cost: ${response.iGasCost}`);
  console.log(`🤖 [LLM] Has Selected Listing: ${!!response.selectedListing}`);
  console.log(`🤖 [LLM] ========================================`);
  
  return response;
}

// SQL Parameterization Prompt
export const LLM_SQL_PARAMETERIZATION_PROMPT = `
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

export type SQLParameterizationResult = {
  parameterizedSql: string;
  params: any[];
  paramOrder: string[];
  confidence: number;
};

/**
 * Convert SQL query with hardcoded values to parameterized query using LLM
 */
export async function parameterizeSQLWithOpenAI(sql: string): Promise<SQLParameterizationResult> {
  // Require OpenAI API key - no mock fallbacks
  if (!process.env.OPENAI_API_KEY && !MOCKED_LLM) {
    throw new Error("OpenAI API key is required for parameterizeSQLWithOpenAI. Please set OPENAI_API_KEY environment variable.");
  }
  
  // Only use mock mode if explicitly enabled (for testing)
  if (MOCKED_LLM) {
    // Mock response: Extract values from SQL and create parameterized version
    const params: any[] = [];
    const paramOrder: string[] = [];
    let parameterizedSql = sql;
    
    // Extract year = 2006 -> year = ?
    const yearMatch = sql.match(/year\s*=\s*(\d+)/i);
    if (yearMatch) {
      params.push(Number(yearMatch[1]));
      paramOrder.push("year");
      parameterizedSql = parameterizedSql.replace(yearMatch[0], `year = ?`);
    }
    
    // Extract make = 'honda' -> make = ?
    const makeMatch = sql.match(/make\s*=\s*'([^']+)'/i);
    if (makeMatch) {
      params.push(makeMatch[1]);
      paramOrder.push("make");
      parameterizedSql = parameterizedSql.replace(makeMatch[0], `make = ?`);
    }
    
    // Extract model = 'civic' -> model = ?
    const modelMatch = sql.match(/model\s*=\s*'([^']+)'/i);
    if (modelMatch) {
      params.push(modelMatch[1]);
      paramOrder.push("model");
      parameterizedSql = parameterizedSql.replace(modelMatch[0], `model = ?`);
    }
    
    // Extract title LIKE '%bumper%' or title LIKE CONCAT('%', 'bumper', '%') -> title LIKE CONCAT('%', ?, '%')
    const titleMatch1 = sql.match(/title\s+LIKE\s+CONCAT\s*\(\s*'%'\s*,\s*'([^']+)'\s*,\s*'%'\s*\)/i);
    const titleMatch2 = sql.match(/title\s+LIKE\s+'([^']+)'/i);
    if (titleMatch1) {
      // Already using CONCAT format
      const searchTerm = titleMatch1[1];
      params.push(searchTerm);
      paramOrder.push("title");
      parameterizedSql = parameterizedSql.replace(titleMatch1[0], `title LIKE CONCAT('%', ?, '%')`);
    } else if (titleMatch2) {
      // Extract the search term (remove % signs)
      const searchTerm = titleMatch2[1].replace(/%/g, '');
      params.push(searchTerm);
      paramOrder.push("title");
      parameterizedSql = parameterizedSql.replace(titleMatch2[0], `title LIKE CONCAT('%', ?, '%')`);
    }
    
    // Extract status = 2 -> status = ?
    const statusMatch = sql.match(/status\s*=\s*(\d+)/i);
    if (statusMatch) {
      params.push(Number(statusMatch[1]));
      paramOrder.push("status");
      parameterizedSql = parameterizedSql.replace(statusMatch[0], `status = ?`);
    }
    
    // Handle LIMIT and OFFSET - keep them as placeholders if they exist
    if (/LIMIT\s+\d+/i.test(parameterizedSql)) {
      const limitMatch = parameterizedSql.match(/LIMIT\s+(\d+)/i);
      if (limitMatch && !parameterizedSql.includes('LIMIT ?')) {
        parameterizedSql = parameterizedSql.replace(/LIMIT\s+\d+/i, 'LIMIT ?');
        params.push(Number(limitMatch[1]));
        paramOrder.push("limit");
      }
    }
    
    if (/OFFSET\s+\d+/i.test(parameterizedSql)) {
      const offsetMatch = parameterizedSql.match(/OFFSET\s+(\d+)/i);
      if (offsetMatch && !parameterizedSql.includes('OFFSET ?')) {
        parameterizedSql = parameterizedSql.replace(/OFFSET\s+\d+/i, 'OFFSET ?');
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
    temperature: 0.1, // Low temperature for deterministic SQL conversion
    max_tokens: 1000,
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
      res.on("data", (chunk) => { data += chunk.toString(); });
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
          // Validate and normalize response
          const result: SQLParameterizationResult = {
            parameterizedSql: String(parsed.parameterizedSql || sql),
            params: Array.isArray(parsed.params) ? parsed.params : [],
            paramOrder: Array.isArray(parsed.paramOrder) ? parsed.paramOrder.map((p: any) => String(p)) : [],
            confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0.9)))
          };
          resolve(result);
        } catch (err: any) {
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
