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
- Keywords: "token", "TOKENA", "TOKENB", "TOKENC", "DEX", "pool", "trade", "buy token", "sell token", "token A", "token B"
- Examples: "buy TOKENA", "buy 2 TOKENA", "sell token A", "buy token with SOL", "DEX trade"
- If user explicitly mentions "token" AND a token symbol (TOKENA, TOKENB, etc.) OR mentions "DEX" or "pool", it's a DEX query
- Extract: tokenSymbol, baseToken, action (BUY/SELL), tokenAmount, maxPrice

For movie queries:
Example: {"query": {"serviceType": "movie", "filters": {"location": "Baltimore", "maxPrice": 10}}, "serviceType": "movie", "confidence": 0.95}
Example: {"query": {"serviceType": "movie", "filters": {"maxPrice": "best"}}, "serviceType": "movie", "confidence": 0.95}
Example: {"query": {"serviceType": "movie", "filters": {}}, "serviceType": "movie", "confidence": 0.95}

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

REMEMBER: "buy tickets" or "buy 2 tickets" = MOVIE, not DEX. Only classify as DEX if user explicitly mentions "token" with a token symbol.
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
  // Use mock if MOCKED_LLM is enabled OR if OpenAI API key is not available
  if (MOCKED_LLM || !process.env.OPENAI_API_KEY) {
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
          "Content-Length": JSON.stringify(requestBody).length
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

    req.write(JSON.stringify(requestBody));
    req.end();
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

For ANY OTHER SERVICE TYPE (not movie or dex):
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
  // Use mock if MOCKED_LLM is enabled OR if OpenAI API key is not available
  if (MOCKED_LLM || !process.env.OPENAI_API_KEY) {
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
          "Content-Length": JSON.stringify(requestBody).length.toString()
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

    req.write(JSON.stringify(requestBody));
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

  const requestBody = {
    model: "gpt-4o",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.7
  };

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
          "Content-Length": JSON.stringify(requestBody).length.toString()
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
                message: content.message || "No response",
                listings: content.listings || listings,
                selectedListing: content.selectedListing || listings[0] || null,
                iGasCost: content.iGasCost || 0.001
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

    req.write(JSON.stringify(requestBody));
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
