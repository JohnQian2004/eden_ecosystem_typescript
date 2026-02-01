/**
 * LLM Module
 * Handles LLM query extraction and response formatting
 */

import * as https from "https";
import * as http from "http";
import { URL } from "url";
import type { MovieListing, TokenListing, LLMQueryResult, LLMResponse, ServiceRegistryQuery } from "./types";
import { MOCKED_LLM, ENABLE_OPENAI } from "./config";

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

Service types: "movie" or "dex"

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
  // Using Cohere AI (hardcoded API key) - no mock fallbacks
  if (!COHERE_API_KEY && !MOCKED_LLM) {
    throw new Error("Cohere API key is required for extractGetDataParamsWithOpenAI.");
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

  try {
    const content = await callCohereAPI(messages, {
      model: "command-r7b-12-2024",
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });
    
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
    return result;
  } catch (err: any) {
    throw new Error(`Failed to parse Cohere response: ${err.message}`);
  }
}

// Cohere AI API Configuration (hardcoded as requested)
const COHERE_API_KEY = "tHJAN4gUTZ4GM1IJ25FQFbKydqBp6LCVbsAxXggB";
const COHERE_API_HOST = "api.cohere.ai";
const COHERE_CHAT_ENDPOINT = "/v1/chat";

/**
 * Helper function to call Cohere AI API
 */
async function callCohereAPI(
  messages: Array<{ role: string; content: string }>,
  options: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: string };
  } = {}
): Promise<string> {
  // Convert OpenAI messages format to Cohere format
  // Cohere uses chat_history, message, and preamble format
  const chatHistory: Array<{ role: string; message: string }> = [];
  let currentMessage = "";
  let preamble = "";
  
  // Process messages - Cohere expects:
  // - preamble: system messages
  // - chat_history: previous user/assistant messages
  // - message: current user message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "system") {
      // System messages go into preamble
      preamble += (preamble ? "\n\n" : "") + msg.content;
    } else if (i === messages.length - 1 && msg.role === "user") {
      // Last user message is the current message
      currentMessage = msg.content;
    } else {
      // Previous messages go into chat_history
      const role = msg.role === "assistant" ? "CHATBOT" : "USER";
      chatHistory.push({
        role: role,
        message: msg.content
      });
    }
  }
  
  const requestBody: any = {
    message: currentMessage,
    model: options.model || "command-r7b-12-2024",
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 1000
  };
  
  // Add chat_history if we have any
  if (chatHistory.length > 0) {
    requestBody.chat_history = chatHistory;
  }
  
  // Add preamble (system instructions + JSON mode if needed)
  if (options.response_format?.type === "json_object") {
    requestBody.preamble = (preamble ? preamble + "\n\n" : "") + "You must respond with valid JSON only. No explanations, no markdown, just the JSON object.";
  } else if (preamble) {
    requestBody.preamble = preamble;
  }

  const requestBodyJson = JSON.stringify(requestBody);
  const requestBodyBuffer = Buffer.from(requestBodyJson, 'utf-8');

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: COHERE_API_HOST,
        port: 443,
        path: COHERE_CHAT_ENDPOINT,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${COHERE_API_KEY}`,
          "Content-Length": requestBodyBuffer.length.toString()
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.message || parsed.error) {
              reject(new Error(parsed.message || parsed.error?.message || "Cohere API error"));
              return;
            }
            const content = parsed.text || parsed.message;
            if (!content) {
              reject(new Error("No content in Cohere response"));
              return;
            }
            resolve(content);
          } catch (err: any) {
            reject(new Error(`Failed to parse Cohere response: ${err.message}`));
          }
        });
      }
    );

    req.on("error", (err) => {
      reject(new Error(`Cohere API request failed: ${err.message}`));
    });

    req.write(requestBodyBuffer);
    req.end();
  });
}

// Simple LLM call function (used by other modules)
export async function callLLM(prompt: string, useOpenAI: boolean = true): Promise<string> {
  if (MOCKED_LLM) {
    return "Mock LLM response";
  }

  if (!COHERE_API_KEY) {
    throw new Error("Cohere API key not configured");
  }

  const messages = [
    { role: "user", content: prompt }
  ];

  return callCohereAPI(messages, {
    model: "command-r7b-12-2024",
    temperature: 0.7,
    max_tokens: 1000
  });
}

// LLM Response Formatting Prompt
export const LLM_RESPONSE_FORMATTING_PROMPT = `
You are Eden Core AI response formatter.
Format service listings into a user-friendly message.
Return JSON only with: message (string), selectedListing (object), selectedListing2 (object), listings (array).

CRITICAL REQUIREMENTS:
1. selectedListing is REQUIRED and MUST NOT be null or undefined
2. selectedListing2 is REQUIRED and MUST NOT be null or undefined - it MUST be the same as selectedListing
3. selectedListing MUST be one of the listings from the provided listings array (use the original object, do not invent)
4. selectedListing2 MUST be the same object as selectedListing (copy the exact same object)
5. If you cannot find a better match, pick the FIRST listing from the provided listings array

CRITICAL: Never output "service type not supported" or similar errors.
Always format the response for ANY service type provided.

For MOVIE service type:
- ALWAYS include ALL key information: movie title, showtime, price, location, rating, review count
- The message MUST include the showtime (e.g., "10:30 PM", "8:00 PM")
- Format as: "[Movie Title] is available at [showtime] for $[price] at [location/theater name]"
- Example: "Back to the Future is available at 10:30 PM for $2 at AMC Theatres in Baltimore, Maryland"
- Include rating and review information if available
- Select the best option based on user query (best price, preferred time, etc.)

For DEX service type:
- Include token symbols, prices, pool information, and action (BUY/SELL)
- Format trading information clearly

For ANY OTHER SERVICE TYPE:
- Extract key information from listings (name, price, location, rating, etc.)
- Format as a natural language message
- Select the best option based on user query
- Return the selected listing and all listings
- selectedListing2 MUST be set to the same value as selectedListing

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
  // Using Cohere AI (hardcoded API key) - no mock fallbacks
  if (!COHERE_API_KEY && !MOCKED_LLM) {
    throw new Error("Cohere API key is required for extractQueryWithOpenAI.");
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

  try {
    const content = await callCohereAPI(messages, {
      model: "command-r7b-12-2024",
      response_format: { type: "json_object" },
      temperature: 0.7
    });
    
    const parsed = JSON.parse(content);
    return {
      query: parsed.query || { serviceType: "movie", filters: {} },
      serviceType: parsed.serviceType || "movie",
      confidence: parsed.confidence || 0.9
    };
  } catch (err: any) {
    throw new Error(`Failed to parse Cohere response: ${err.message}`);
  }
}

/**
 * Format response using OpenAI
 */
export async function formatResponseWithOpenAI(
  listings: MovieListing[] | TokenListing[],
  userQuery: string,
  queryFilters?: { serviceType?: string; maxPrice?: number | string; genre?: string; time?: string; location?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL'; [key: string]: any }
): Promise<LLMResponse> {
  if (MOCKED_LLM) {
    return {
      message: "Mock LLM response",
      listings: listings.slice(0, 1),
      selectedListing: listings[0] || null,
      iGasCost: 0.001
    };
  }

  const serviceType = queryFilters?.serviceType || "movie";
  const listingsJson = JSON.stringify(listings);
  const filtersJson = queryFilters ? JSON.stringify(queryFilters) : "{}";
  const userMessage = `Service type: ${serviceType}\n\nUser query: ${userQuery}\n\nQuery filters: ${filtersJson}\n\nAvailable listings:\n${listingsJson}\n\nFilter listings based on the query filters and format the best option as a user-friendly message.`;

  const messages = [
    { role: "system", content: LLM_RESPONSE_FORMATTING_PROMPT.replace("{serviceType}", serviceType) },
    { role: "user", content: userMessage }
  ];

  try {
    const contentStr = await callCohereAPI(messages, {
      model: "command-r7b-12-2024",
      response_format: { type: "json_object" },
      temperature: 0.7
    });
    
    const content = JSON.parse(contentStr);
    
    return {
      message: content.message || "No response",
      listings: content.listings || listings,
      selectedListing: content.selectedListing || listings[0] || null,
      selectedListing2: content.selectedListing2 || content.selectedListing || listings[0] || null,
      iGasCost: content.iGasCost || 0.001
    };
  } catch (err: any) {
    throw new Error(`Failed to format response with Cohere: ${err.message}`);
  }
}

/**
 * Format response using DeepSeek (stub - full implementation can be added later)
 */
export async function formatResponseWithDeepSeek(
  listings: MovieListing[] | TokenListing[],
  userQuery: string,
  queryFilters?: { serviceType?: string; maxPrice?: number | string; genre?: string; time?: string; location?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL'; [key: string]: any }
): Promise<LLMResponse> {
  // Stub implementation - can be filled in later
  const selectedListing = listings[0] || null;
  return {
    message: "DeepSeek response (stub)",
    listings: listings.slice(0, 5),
    selectedListing: selectedListing,
    selectedListing2: selectedListing, // CRITICAL: Must return selectedListing2
    iGasCost: 0.001
  };
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
  // Use mock if MOCKED_LLM is enabled OR if OpenAI API key is not available
  if (MOCKED_LLM || !process.env.OPENAI_API_KEY) {
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

  try {
    const content = await callCohereAPI(messages, {
      model: "command-r7b-12-2024",
      temperature: 0.1, // Low temperature for deterministic SQL conversion
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });
    
    const parsed = JSON.parse(content);
    // Validate and normalize response
    const result: SQLParameterizationResult = {
      parameterizedSql: String(parsed.parameterizedSql || sql),
      params: Array.isArray(parsed.params) ? parsed.params : [],
      paramOrder: Array.isArray(parsed.paramOrder) ? parsed.paramOrder.map((p: any) => String(p)) : [],
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0.9)))
    };
    return result;
  } catch (err: any) {
    throw new Error(`Failed to parse Cohere response: ${err.message}`);
  }
}
