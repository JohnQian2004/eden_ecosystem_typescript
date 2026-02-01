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

Service types: "movie", "dex", "autoparts", "pharmacy", "airline", "hotel", "restaurant", "grocerystore", "gasstation", "dogpark", "party", "bank", or other service types

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

For autoparts queries:
Example: {"query": {"serviceType": "autoparts", "filters": {}}, "serviceType": "autoparts", "confidence": 0.95}
Example for "create a auto shop simulator": {"query": {"serviceType": "autoparts", "filters": {}}, "serviceType": "autoparts", "confidence": 0.9}
Example for "create a auto body shop simulator": {"query": {"serviceType": "autoparts", "filters": {}}, "serviceType": "autoparts", "confidence": 0.9}
Example for "find autoparts": {"query": {"serviceType": "autoparts", "filters": {}}, "serviceType": "autoparts", "confidence": 0.95}

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

AUTOPARTS SERVICE (serviceType: "autoparts"):
- Keywords: "autopart", "autoparts", "auto part", "auto parts", "car part", "car parts", "auto shop", "auto body shop", "auto repair", "bumper", "brake", "tire", "wheel", "engine", "transmission", "simulator" (when combined with auto/autoparts)
- Examples: "create a auto shop simulator", "create a auto body shop simulator", "find autoparts", "buy car parts", "auto repair shop", "auto body shop"
- If user says "create a [auto/autoparts] simulator" or "create [auto/autoparts] shop simulator" → AUTOPARTS
- Extract filters: location, maxPrice, partName, vehicleMake, vehicleModel, year

PHARMACY SERVICE (serviceType: "pharmacy"):
- Keywords: "pharmacy", "prescription", "medication", "drug", "pharmaceutical"
- Examples: "find a pharmacy", "prescription drugs", "pharmacy near me"

AIRLINE SERVICE (serviceType: "airline"):
- Keywords: "flight", "airline", "airport", "fly", "ticket" (when combined with flight/airline)
- Examples: "book a flight", "find flights", "airline tickets"

HOTEL SERVICE (serviceType: "hotel"):
- Keywords: "hotel", "lodging", "accommodation", "room", "reservation" (when hotel-related)
- Examples: "book a hotel", "find hotels", "hotel room"

RESTAURANT SERVICE (serviceType: "restaurant"):
- Keywords: "restaurant", "dining", "food", "meal", "eat", "dinner", "lunch"
- Examples: "find a restaurant", "book a table", "restaurant reservation"

CRITICAL DISAMBIGUATION RULES:
- "buy tickets" or "buy 2 tickets" = MOVIE (only if NO mention of "TOKEN", "SOL", "DEX", "pool", "trade", "swap", "flight", "airline")
- "Trade 2 SOL with TOKEN" = DEX (has "trade", "SOL", and "TOKEN")
- "buy TOKEN" = DEX (has "TOKEN")
- "buy token with SOL" = DEX (has "token" and "SOL")
- "create a auto shop simulator" or "create a auto body shop simulator" = AUTOPARTS (has "auto" and "simulator" or "shop")
- "create a simulator" (without auto/autoparts context) = Check other keywords to determine service type
- "auto shop", "auto body shop", "auto repair", "autoparts", "car parts" = AUTOPARTS
- If user mentions BOTH movie keywords AND DEX keywords (TOKEN, SOL, DEX, pool, trade), prioritize DEX classification
- When in doubt between movie and DEX, check: Does the query mention "TOKEN", "SOL", "DEX", "pool", or "trade"? If YES → DEX. If NO → Check for other service types.
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
            // Try to parse as JSON first
            let parsed: any;
            try {
              parsed = JSON.parse(data);
            } catch (parseErr) {
              // If not JSON, check if it's a plain text error message
              if (data.trim().startsWith("I'm sorry") || data.trim().toLowerCase().includes("error")) {
                reject(new Error(`Cohere API returned error: ${data.substring(0, 200)}`));
                return;
              }
              // Try to extract text content from non-JSON response
              reject(new Error(`Cohere API returned invalid response (not JSON): ${data.substring(0, 200)}`));
              return;
            }
            
            // Check for API errors
            if (parsed.error || parsed.message) {
              const errorMsg = parsed.error?.message || parsed.message || parsed.error || "Cohere API error";
              reject(new Error(errorMsg));
              return;
            }
            
            // Extract content from response
            // Cohere response format: { text: "...", ... } or { message: "...", ... }
            const content = parsed.text || parsed.message || parsed.content;
            if (!content) {
              // If no content field, check if the entire response is a string
              if (typeof parsed === 'string') {
                resolve(parsed);
                return;
              }
              reject(new Error(`No content in Cohere response. Response structure: ${JSON.stringify(parsed).substring(0, 200)}`));
              return;
            }
            resolve(content);
          } catch (err: any) {
            reject(new Error(`Failed to parse Cohere response: ${err.message}. Raw response: ${data.substring(0, 200)}`));
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
Format service listings into a user-friendly message, OR answer informational questions about Eden or general knowledge.

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
   - Use the provided RAG context (Eden knowledge base) to answer accurately
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

Service type: {serviceType}

Return JSON format:
{
  "message": "...",
  "listings": [...],
  "selectedListing": { /* complete listing object with ALL fields, or null for informational queries */ },
  "selectedListing2": { /* MUST be the same as selectedListing, or null for informational queries */ }
}
`;

/**
 * Classify query type using LLM - determines if query is workflow/service request or informational
 */
export async function classifyQueryType(userInput: string): Promise<{ isWorkflowQuery: boolean; isInformationalQuery: boolean; confidence: number }> {
  // Handle MOCKED_LLM mode
  if (MOCKED_LLM) {
    const inputLower = userInput.toLowerCase();
    // Simple heuristic for mock mode
    const hasActionVerbs = /\b(book|buy|sell|find|order|trade|swap|purchase|get|watch|reserve|create|build|make|setup|set\s+up)\b/i.test(inputLower);
    const hasQuestionPattern = /how (to|does|do|can|will|works?)|what (is|are|does|do|can|will)|who (is|are|does|do|can|will)|explain|tell me about|help|guide/i.test(inputLower);
    const isWorkflow = hasActionVerbs && !hasQuestionPattern;
    return {
      isWorkflowQuery: isWorkflow,
      isInformationalQuery: !isWorkflow,
      confidence: 0.7
    };
  }

  const QUERY_CLASSIFICATION_PROMPT = `
You are Eden query classifier.
Determine if a user query is a WORKFLOW/SERVICE REQUEST (should trigger Eden workflows) or an INFORMATIONAL QUERY (should be answered directly).

WORKFLOW/SERVICE QUERIES are:
- Action requests that should trigger Eden workflows or services
- Examples: "book a movie", "buy movie tickets", "trade 2 SOL", "find a pharmacy", "create a service", "build a simulator", "order food", "get a hotel room"
- Requests to perform actions, transactions, or create/configure things in Eden
- Service requests that need workflow processing
- Even if phrased as questions, if they're requesting an action → WORKFLOW QUERY
- Examples of action questions: "can you book a movie?", "how do I buy tokens?", "where can I find a pharmacy?"

INFORMATIONAL QUERIES are:
- Questions asking for information, explanations, or guidance
- Examples: "how does Eden work?", "what is the garden of Eden?", "who is GOD?", "explain quantum physics", "what is today?"
- Questions about how to use Eden (not requesting an action, just asking for information)
- General knowledge questions unrelated to Eden services
- Questions that don't require workflow execution

CRITICAL DISTINCTION:
- "create a simulator" → WORKFLOW QUERY (requesting to create something)
- "how to create a simulator" → INFORMATIONAL QUERY (asking for instructions/information)
- "book a movie" → WORKFLOW QUERY (action request)
- "how do I book a movie?" → WORKFLOW QUERY (action request, even though it's a question)
- "what is a movie?" → INFORMATIONAL QUERY (information request)

Return JSON only with: isWorkflowQuery (boolean), isInformationalQuery (boolean), confidence (number 0-1)

Examples:
Input: "book a movie"
Output: {"isWorkflowQuery": true, "isInformationalQuery": false, "confidence": 0.95}

Input: "create a auto body shop simulator"
Output: {"isWorkflowQuery": true, "isInformationalQuery": false, "confidence": 0.9}

Input: "how to create a simulator"
Output: {"isWorkflowQuery": false, "isInformationalQuery": true, "confidence": 0.9}

Input: "what is Eden"
Output: {"isWorkflowQuery": false, "isInformationalQuery": true, "confidence": 0.95}

Input: "how does Eden work"
Output: {"isWorkflowQuery": false, "isInformationalQuery": true, "confidence": 0.95}

Input: "can you book a movie for me"
Output: {"isWorkflowQuery": true, "isInformationalQuery": false, "confidence": 0.95}
`;

  try {
    const messages = [
      { role: "system", content: QUERY_CLASSIFICATION_PROMPT },
      { role: "user", content: userInput }
    ];

    const content = await callCohereAPI(messages, {
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: "json_object" }
    });

    // Try to parse JSON response
    let parsed: any;
    try {
      let jsonStr = content.trim();
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      } else {
        const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }
      
      jsonStr = jsonStr.trim();
      parsed = JSON.parse(jsonStr);
      
      // Validate the parsed object
      if (typeof parsed.isWorkflowQuery !== 'boolean' || typeof parsed.isInformationalQuery !== 'boolean' || typeof parsed.confidence !== 'number') {
        throw new Error('Invalid JSON structure');
      }
    } catch (parseError: any) {
      const contentPreview = content.substring(0, 200);
      console.warn(`⚠️ [classifyQueryType] Failed to parse JSON response. Input: "${userInput.substring(0, 50)}...". Content preview: ${contentPreview}`);
      
      // Fallback: use simple heuristics
      const inputLower = userInput.toLowerCase();
      const hasActionVerbs = /\b(book|buy|sell|find|order|trade|swap|purchase|get|watch|reserve|create|build|make|setup|set\s+up)\b/i.test(inputLower);
      const hasQuestionPattern = /how (to|does|do|can|will|works?)|what (is|are|does|do|can|will)|who (is|are|does|do|can|will)|explain|tell me about|help|guide/i.test(inputLower);
      const isWorkflow = hasActionVerbs && !hasQuestionPattern;
      
      return {
        isWorkflowQuery: isWorkflow,
        isInformationalQuery: !isWorkflow,
        confidence: 0.6
      };
    }

    return {
      isWorkflowQuery: parsed.isWorkflowQuery === true,
      isInformationalQuery: parsed.isInformationalQuery === true,
      confidence: parsed.confidence || 0.5
    };
  } catch (error: any) {
    console.error(`❌ [classifyQueryType] Error:`, error);
    // Fallback: use simple heuristics
    const inputLower = userInput.toLowerCase();
    const hasActionVerbs = /\b(book|buy|sell|find|order|trade|swap|purchase|get|watch|reserve|create|build|make|setup|set\s+up)\b/i.test(inputLower);
    const hasQuestionPattern = /how (to|does|do|can|will|works?)|what (is|are|does|do|can|will)|who (is|are|does|do|can|will)|explain|tell me about|help|guide/i.test(inputLower);
    const isWorkflow = hasActionVerbs && !hasQuestionPattern;
    
    return {
      isWorkflowQuery: isWorkflow,
      isInformationalQuery: !isWorkflow,
      confidence: 0.5
    };
  }
}

/**
 * Detect if message should be routed to GOD's inbox using LLM
 */
export async function detectGodMessage(userInput: string): Promise<{ shouldRouteToGodInbox: boolean; confidence: number }> {
  // Handle MOCKED_LLM mode
  if (MOCKED_LLM) {
    const inputLower = userInput.toLowerCase();
    const hasGodDirect = /\b(god|root\s*ca|roca|root\s*authority)\b/i.test(inputLower) && 
      (/\b(can\s+you|will\s+you|please|help|bless|pray|forgive|mercy|judgment|appeal|petition)\b/i.test(inputLower) ||
       /\b(god|root\s*ca|roca)\s+(can|will|please|help|bless|pray|forgive|mercy|judgment|appeal|petition)/i.test(inputLower));
    
    return {
      shouldRouteToGodInbox: hasGodDirect,
      confidence: hasGodDirect ? 0.8 : 0.2
    };
  }

  const GOD_MESSAGE_DETECTION_PROMPT = `
You are Eden message classifier.
Determine if a user message is directed to GOD (ROOT_AUTHORITY) and should be routed to GOD's inbox.

GOD messages are:
- Direct requests to GOD (e.g., "GOD can you bless me", "GOD please help", "ROOT CA I need mercy")
- Appeals, petitions, or requests for judgment
- Requests for blessing, forgiveness, mercy, or divine intervention
- Questions or requests specifically addressed to GOD, ROOT CA, or ROOT_AUTHORITY
- Messages that ask GOD to do something or answer something

NOT GOD messages:
- General questions about GOD (e.g., "who is GOD", "what is GOD in Bible")
- Questions about Eden that mention GOD in context (e.g., "how does GOD work in Eden")
- Service requests that happen to mention GOD (e.g., "book a movie with GOD")
- General informational queries
- Requests to create or build something (e.g., "create a simulator")

CRITICAL: You MUST respond with ONLY valid JSON. No explanations, no markdown, no additional text. Just the JSON object.

Return JSON only with: shouldRouteToGodInbox (boolean), confidence (number 0-1)

Examples:
Input: "GOD can you bless me"
Output: {"shouldRouteToGodInbox": true, "confidence": 0.95}

Input: "GOD please help me"
Output: {"shouldRouteToGodInbox": true, "confidence": 0.95}

Input: "ROOT CA I need mercy"
Output: {"shouldRouteToGodInbox": true, "confidence": 0.95}

Input: "who is GOD"
Output: {"shouldRouteToGodInbox": false, "confidence": 0.9}

Input: "what is GOD in Bible"
Output: {"shouldRouteToGodInbox": false, "confidence": 0.9}

Input: "how does GOD work in Eden"
Output: {"shouldRouteToGodInbox": false, "confidence": 0.85}

Input: "book a movie"
Output: {"shouldRouteToGodInbox": false, "confidence": 0.95}

Input: "create a simulator"
Output: {"shouldRouteToGodInbox": false, "confidence": 0.95}
`;

  try {
    const messages = [
      { role: "system", content: GOD_MESSAGE_DETECTION_PROMPT },
      { role: "user", content: userInput }
    ];

    const content = await callCohereAPI(messages, {
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: "json_object" }
    });

    // Try to parse JSON response with improved extraction
    let parsed: any;
    try {
      // First, try to find JSON in markdown code blocks
      let jsonStr = content.trim();
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      } else {
        // Try to find JSON object in the content
        const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }
      
      // Clean up the JSON string - remove any leading/trailing whitespace or non-JSON text
      jsonStr = jsonStr.trim();
      
      // Try to parse
      parsed = JSON.parse(jsonStr);
      
      // Validate the parsed object has the required fields
      if (typeof parsed.shouldRouteToGodInbox !== 'boolean' || typeof parsed.confidence !== 'number') {
        throw new Error('Invalid JSON structure');
      }
    } catch (parseError: any) {
      // Log more detailed error information for debugging
      const contentPreview = content.substring(0, 200);
      console.warn(`⚠️ [detectGodMessage] Failed to parse JSON response. Input: "${userInput.substring(0, 50)}...". Content preview: ${contentPreview}`);
      
      // Fallback: use keyword-based detection
      const queryLower = userInput.toLowerCase();
      const hasGodDirect = /\b(god|root\s*ca|roca|root\s*authority)\b/i.test(queryLower) && 
        (/\b(can\s+you|will\s+you|please|help|bless|pray|forgive|mercy|judgment|appeal|petition)\b/i.test(queryLower) ||
         /\b(god|root\s*ca|roca)\s+(can|will|please|help|bless|pray|forgive|mercy|judgment|appeal|petition)/i.test(queryLower));
      
      return {
        shouldRouteToGodInbox: hasGodDirect,
        confidence: hasGodDirect ? 0.7 : 0.3
      };
    }

    return {
      shouldRouteToGodInbox: parsed.shouldRouteToGodInbox === true,
      confidence: parsed.confidence || 0.5
    };
  } catch (error: any) {
    console.error(`❌ [detectGodMessage] Error:`, error);
    // Fallback: use keyword-based detection
    const queryLower = userInput.toLowerCase();
    const hasGodDirect = /\b(god|root\s*ca|roca|root\s*authority)\b/i.test(queryLower) && 
      (/\b(can\s+you|will\s+you|please|help|bless|pray|forgive|mercy|judgment|appeal|petition)\b/i.test(queryLower) ||
       /\b(god|root\s*ca|roca)\s+(can|will|please|help|bless|pray|forgive|mercy|judgment|appeal|petition)/i.test(queryLower));
    
    return {
      shouldRouteToGodInbox: hasGodDirect,
      confidence: hasGodDirect ? 0.6 : 0.2
    };
  }
}

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
    
    // Check autoparts FIRST (before movie) to catch "auto shop simulator" queries
    if (inputLower.includes("autopart") || inputLower.includes("auto shop") || inputLower.includes("auto body shop") || 
        inputLower.includes("auto repair") || inputLower.includes("car part") || 
        (inputLower.includes("auto") && inputLower.includes("simulator"))) {
      mockServiceType = "autoparts";
      mockFilters = {};
    } else if (inputLower.includes("token") || inputLower.includes("dex") || inputLower.includes("pool")) {
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
    } else if (inputLower.includes("car") && !inputLower.includes("movie") && !inputLower.includes("ticket")) {
      // "car" without movie/ticket context might be autoparts
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
    
    // Try to parse as JSON
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr: any) {
      // If JSON parsing fails, check if it's an error message or non-JSON response
      console.error(`❌ [extractQueryWithOpenAI] Failed to parse JSON response. Content: ${content.substring(0, 200)}`);
      
      // Check if it looks like an error message
      if (content.toLowerCase().includes('error') || content.toLowerCase().includes('sorry') || content.toLowerCase().startsWith('i\'m sorry')) {
        throw new Error(`Cohere API returned an error message: ${content.substring(0, 200)}`);
      }
      
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch (e) {
          throw new Error(`Failed to parse JSON from markdown code block: ${parseErr.message}`);
        }
      } else {
        // If no JSON found, provide a fallback based on user input
        console.warn(`⚠️ [extractQueryWithOpenAI] Cohere returned non-JSON response, using fallback classification`);
        const inputLower = userInput.toLowerCase();
        let fallbackServiceType = "movie";
        let fallbackFilters: any = {};
        
        // Simple keyword-based fallback classification
        // Check autoparts FIRST (before movie) to catch "auto shop simulator" queries
        if (inputLower.includes("autopart") || inputLower.includes("auto shop") || inputLower.includes("auto body shop") || 
            inputLower.includes("auto repair") || inputLower.includes("car part") || 
            (inputLower.includes("auto") && inputLower.includes("simulator"))) {
          fallbackServiceType = "autoparts";
        } else if (inputLower.includes("token") || inputLower.includes("dex") || inputLower.includes("pool") || inputLower.includes("trade") || inputLower.includes("swap")) {
          fallbackServiceType = "dex";
          fallbackFilters = {
            tokenSymbol: inputLower.includes("tokenb") || inputLower.includes("token b") ? "TOKENB" : "TOKENA",
            baseToken: "SOL",
            action: inputLower.includes("sell") ? "SELL" : "BUY"
          };
        } else if (inputLower.includes("flight") || inputLower.includes("airline")) {
          fallbackServiceType = "airline";
        } else if (inputLower.includes("pharmacy") || inputLower.includes("prescription")) {
          fallbackServiceType = "pharmacy";
        } else if (inputLower.includes("hotel")) {
          fallbackServiceType = "hotel";
        } else if (inputLower.includes("restaurant")) {
          fallbackServiceType = "restaurant";
        } else if (inputLower.includes("car") && !inputLower.includes("movie") && !inputLower.includes("ticket")) {
          // "car" without movie/ticket context might be autoparts
          fallbackServiceType = "autoparts";
        }
        
        return {
          query: { serviceType: fallbackServiceType, filters: fallbackFilters },
          serviceType: fallbackServiceType,
          confidence: 0.7 // Lower confidence for fallback
        };
      }
    }
    
    // Validate parsed response structure
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Invalid response structure from Cohere: expected object, got ${typeof parsed}`);
    }
    
    return {
      query: parsed.query || { serviceType: parsed.serviceType || "movie", filters: parsed.filters || {} },
      serviceType: parsed.serviceType || "movie",
      confidence: parsed.confidence || 0.9
    };
  } catch (err: any) {
    // If it's already our formatted error, re-throw it
    if (err.message && err.message.includes('Cohere API')) {
      throw err;
    }
    throw new Error(`Failed to extract query from user input: ${err.message}`);
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
      selectedListing2: listings[0] || null,
      iGasCost: 0.001
    };
  }

  const serviceType = queryFilters?.serviceType || "movie";
  
  // Check if this is an informational query (no listings and serviceType is informational or god_chat)
  const isInformational = listings.length === 0 && (serviceType === "informational" || serviceType === "god_chat");
  
  // Check if this is Eden-related (use RAG) or general knowledge (no RAG)
  // Only use RAG if explicitly marked as Eden-related OR if query contains Eden context
  const useRAG = queryFilters?.useRAG === true || 
    (isInformational && /\b(eden|garden\s+of\s+eden|workflow|root\s*ca|roca)\b/i.test(userQuery));
  
  // For Eden-related informational queries, get RAG context
  let ragContext = "";
  if (isInformational && useRAG) {
    try {
      const { getKnowledgeContext } = await import("./rag/edenKnowledgeBase");
      ragContext = getKnowledgeContext(userQuery);
      console.log(`📚 [RAG] Retrieved ${ragContext ? 'RAG context' : 'no RAG context'} for query: "${userQuery}"`);
    } catch (error: any) {
      console.warn(`⚠️ [RAG] Failed to get knowledge context: ${error.message}`);
      ragContext = "";
    }
  } else if (isInformational && !useRAG) {
    console.log(`💬 [LLM] General knowledge query (no RAG): "${userQuery}"`);
  }
  
  // Build user message
  let userMessage = `Service type: ${serviceType}\n\nUser query: ${userQuery}\n\n`;
  
  if (isInformational) {
    // For informational queries, include RAG context if available
    if (ragContext) {
      userMessage += `${ragContext}\n\n`;
    }
    userMessage += `Answer the user's question directly. If this is about Eden, use the RAG context provided above. If this is general knowledge, answer using your knowledge.`;
  } else {
    // For service queries, include listings and filters
    const listingsJson = JSON.stringify(listings);
    const filtersJson = queryFilters ? JSON.stringify(queryFilters) : "{}";
    userMessage += `Query filters: ${filtersJson}\n\nAvailable listings:\n${listingsJson}\n\nFilter listings based on the query filters and format the best option as a user-friendly message.`;
  }

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
    
    let content: any;
    try {
      content = JSON.parse(contentStr);
    } catch (parseErr: any) {
      // If JSON parsing fails, try to extract message from response
      console.warn(`⚠️ [LLM] Failed to parse JSON response, attempting to extract message: ${contentStr.substring(0, 200)}`);
      // For informational queries, we can return the raw response as message
      if (isInformational) {
        return {
          message: contentStr || "I apologize, but I couldn't process your request properly. Please try again.",
          listings: [],
          selectedListing: null,
          selectedListing2: null,
          iGasCost: 0.001
        };
      }
      throw new Error(`Failed to parse LLM response as JSON: ${parseErr.message}`);
    }
    
    return {
      message: content.message || "No response",
      listings: content.listings || (isInformational ? [] : listings),
      selectedListing: content.selectedListing || (isInformational ? null : listings[0] || null),
      selectedListing2: content.selectedListing2 || content.selectedListing || (isInformational ? null : listings[0] || null),
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
