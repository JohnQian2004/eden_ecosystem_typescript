/**
 * LLM Module
 * Handles LLM query extraction and response formatting
 */

import * as https from "https";
import * as http from "http";
import { URL } from "url";
import type { MovieListing, TokenListing, LLMQueryResult, LLMResponse, ServiceRegistryQuery } from "./types";
import { MOCKED_LLM, ENABLE_OPENAI } from "./config";

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

export const LLM_RESPONSE_FORMATTING_PROMPT = `
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

IMPORTANT: When returning selectedListing for DEX, you MUST include ALL fields: poolId, providerId, tokenSymbol, baseToken, price, liquidity, gardenId.

CRITICAL REQUIREMENTS:
1. selectedListing is REQUIRED and MUST NOT be null or undefined
2. If listings array is empty, return an error message instead
3. selectedListing MUST be one of the listings from the provided listings array
4. selectedListing MUST include ALL original fields from the listing (providerId, poolId, price, etc.)
5. For DEX: selectedListing MUST include poolId, providerId, tokenSymbol, baseToken, price, liquidity, gardenId
6. For MOVIE: selectedListing MUST include providerId, movieTitle, price, showtime, location

Return JSON with: 
- message (string): User-friendly message describing the selected option
- listings (array): All filtered listings that match the query
- selectedListing (object): The BEST option from the listings array with ALL original fields. NEVER null or undefined. If no good option exists, pick the first listing.

Example format:
{
  "message": "Found 3 options. Best option: [description]",
  "listings": [...],
  "selectedListing": { /* complete listing object with ALL fields */ }
}
`;

// OpenAI API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "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";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Dependencies that need to be injected
let broadcastEvent: (event: any) => void;

/**
 * Initialize LLM module with dependencies
 */
export function initializeLLM(broadcastFn: (event: any) => void): void {
  broadcastEvent = broadcastFn;
}

/**
 * Extract query using OpenAI
 */
export async function extractQueryWithOpenAI(userInput: string): Promise<LLMQueryResult> {
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
                message: `LLM error: ${parsed.error.message}`,
                timestamp: Date.now(),
                data: { error: parsed.error, provider: "openai" }
              });
              reject(new Error(parsed.error.message));
              return;
            }
            
            const content = parsed.choices[0]?.message?.content;
            if (!content) {
              reject(new Error("No content in LLM response"));
              return;
            }
            
            const result: LLMQueryResult = JSON.parse(content);
            
            broadcastEvent({
              type: "llm_query_extraction_complete",
              component: "llm",
              message: "LLM query extraction complete",
              timestamp: Date.now(),
              data: { result, provider: "openai" }
            });
            
            resolve(result);
          } catch (err: any) {
            broadcastEvent({
              type: "llm_error",
              component: "llm",
              message: `LLM parsing error: ${err.message}`,
              timestamp: Date.now(),
              data: { error: err.message, provider: "openai" }
            });
            reject(err);
          }
        });
      }
    );
    
    req.on("error", (err) => {
      broadcastEvent({
        type: "llm_error",
        component: "llm",
        message: `LLM request error: ${err.message}`,
        timestamp: Date.now(),
        data: { error: err.message, provider: "openai" }
      });
      reject(err);
    });
    
    req.write(payload);
    req.end();
  });
}

/**
 * Format response using OpenAI
 * CLONED FROM 20251230 codebase - exact implementation
 */
export async function formatResponseWithOpenAI(
  listings: MovieListing[] | TokenListing[],
  userQuery: string,
  queryFilters?: { maxPrice?: number | string; genre?: string; time?: string; location?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL' }
): Promise<LLMResponse> {
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
              let content: any;
              try {
                const contentStr = parsed.choices[0].message.content;
                console.log(`🔧 [LLM] Raw content from OpenAI: ${contentStr?.substring(0, 200)}...`);
                content = JSON.parse(contentStr);
                console.log(`🔧 [LLM] Parsed content keys: ${Object.keys(content || {}).join(', ')}`);
                console.log(`🔧 [LLM] content.selectedListing exists: ${!!content.selectedListing}, type: ${typeof content.selectedListing}`);
              } catch (parseError: any) {
                console.error(`❌ [LLM] Failed to parse OpenAI content as JSON: ${parseError.message}`);
                console.error(`❌ [LLM] Content string: ${parsed.choices[0].message.content?.substring(0, 500)}`);
                // If parsing fails, create a minimal content object
                content = { message: parsed.choices[0].message.content || "Service found", selectedListing: null };
              }
              
              // CRITICAL: Use old codebase pattern - fallback to first listing if LLM doesn't return selectedListing
              // This ensures selectedListing is ALWAYS set, especially for DEX trades
              // Check if content.selectedListing is null, undefined, or empty object
              const hasValidSelectedListing = content.selectedListing && 
                                              typeof content.selectedListing === 'object' && 
                                              Object.keys(content.selectedListing).length > 0;
              
              let selectedListing = hasValidSelectedListing ? content.selectedListing : (listings.length > 0 ? listings[0] : null);
              
              console.log(`🔧 [LLM] Initial selectedListing: ${selectedListing ? 'SET' : 'NULL'}, from LLM: ${hasValidSelectedListing}, from fallback: ${!hasValidSelectedListing && listings.length > 0}`);
              
              // If selectedListing exists but might be missing fields, try to match it back to original listings
              if (selectedListing && listings.length > 0) {
                // For DEX trades, match by poolId or tokenSymbol
                const isDEXTrade = 'poolId' in selectedListing || 'tokenSymbol' in selectedListing;
                if (isDEXTrade) {
                  const matchedListing = listings.find((l: any) => 
                    ('poolId' in l && l.poolId === selectedListing.poolId) ||
                    ('tokenSymbol' in l && l.tokenSymbol === selectedListing.tokenSymbol && 
                     (!selectedListing.baseToken || l.baseToken === selectedListing.baseToken))
                  );
                  if (matchedListing) {
                    selectedListing = matchedListing;
                    console.log(`✅ [LLM] Matched DEX selectedListing to original listing by poolId/tokenSymbol`);
                  }
                } else if (selectedListing.providerId) {
                  // For other service types, match by providerId
                  const matchedListing = listings.find((l: any) => 
                    l.providerId === selectedListing.providerId ||
                    (l.movieTitle === selectedListing.movieTitle && l.providerName === selectedListing.providerName) ||
                    (l.restaurantName === selectedListing.restaurantName && l.providerName === selectedListing.providerName) ||
                    (l.flightNumber === selectedListing.flightNumber && l.providerName === selectedListing.providerName) ||
                    (l.hotelName === selectedListing.hotelName && l.providerName === selectedListing.providerName)
                  );
                  if (matchedListing) {
                    selectedListing = matchedListing;
                    console.log(`✅ [LLM] Matched selectedListing to original listing by providerId/name`);
                  }
                }
                
                // Ensure selectedListing has providerId (or poolId for DEX)
                if (!selectedListing.providerId && !selectedListing.poolId && listings.length > 0) {
                  if ('poolId' in listings[0]) {
                    selectedListing = { ...selectedListing, poolId: (listings[0] as any).poolId };
                  } else {
                    selectedListing = { ...selectedListing, providerId: listings[0].providerId || listings[0].id };
                  }
                  console.log(`🔧 [LLM] Added missing providerId/poolId to selectedListing`);
                }
              }
              
              // FINAL FALLBACK: If still no selectedListing, use first listing
              if (!selectedListing && listings.length > 0) {
                selectedListing = listings[0];
                console.warn(`⚠️ [LLM] FINAL FALLBACK: Using first listing as selectedListing`);
              }
              
              const result = {
                message: content.message || "Service found",
                listings: content.listings || listings,
                selectedListing: selectedListing, // ALWAYS set (from LLM or fallback)
                iGasCost: 0, // Will be calculated separately
              };
              
              // Final validation - log what we're returning
              console.log(`✅ [LLM] Returning result with selectedListing: ${result.selectedListing ? 'SET' : 'NOT SET'}, type: ${typeof result.selectedListing}, hasPoolId: ${!!(result.selectedListing as any)?.poolId}, hasTokenSymbol: ${!!(result.selectedListing as any)?.tokenSymbol}`);
              
              resolve(result);
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

/**
 * Extract query using DeepSeek
 */
export async function extractQueryWithDeepSeek(userInput: string): Promise<LLMQueryResult> {
  // Similar implementation to OpenAI but using DeepSeek API
  // For brevity, using a simplified version
  const messages = [
    { role: "system", content: LLM_QUERY_EXTRACTION_PROMPT },
    { role: "user", content: userInput },
  ];
  
  const payload = JSON.stringify({
    model: "deepseek-chat",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  return new Promise<LLMQueryResult>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.deepseek.com",
        port: 443,
        path: "/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY || ""}`,
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
              reject(new Error(parsed.error.message));
              return;
            }
            
            const content = parsed.choices[0]?.message?.content;
            if (!content) {
              reject(new Error("No content in LLM response"));
              return;
            }
            
            const result: LLMQueryResult = JSON.parse(content);
            resolve(result);
          } catch (err: any) {
            reject(err);
          }
        });
      }
    );
    
    req.on("error", (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

/**
 * Format response using DeepSeek
 */
/**
 * Format response using DeepSeek
 * CLONED FROM 20251230 codebase - exact implementation
 */
export async function formatResponseWithDeepSeek(
  listings: MovieListing[] | TokenListing[],
  userQuery: string,
  queryFilters?: { maxPrice?: number | string; genre?: string; time?: string; location?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL' }
): Promise<LLMResponse> {
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

  return new Promise<LLMResponse>((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port: 11434, path: "/api/chat", method: "POST" },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            
            // CRITICAL: Use old codebase pattern - fallback to first listing if LLM doesn't return selectedListing
            let selectedListing = parsed.selectedListing || (listings.length > 0 ? listings[0] : null);
            
            console.log(`🔧 [LLM] DeepSeek initial selectedListing: ${selectedListing ? 'SET' : 'NULL'}, from LLM: ${!!parsed.selectedListing}, from fallback: ${!parsed.selectedListing && listings.length > 0}`);
            
            // If selectedListing exists but might be missing fields, try to match it back to original listings
            if (selectedListing && listings.length > 0) {
              const isTokenListing = 'poolId' in selectedListing || 'tokenSymbol' in selectedListing;
              
              if (isTokenListing) {
                const tokenListing = selectedListing as any;
                const matchedListing = listings.find((l: any) => 
                  ('poolId' in l && l.poolId === tokenListing.poolId) ||
                  ('tokenSymbol' in l && l.tokenSymbol === tokenListing.tokenSymbol && 
                   (!tokenListing.baseToken || l.baseToken === tokenListing.baseToken))
                ) as TokenListing | undefined;
                if (matchedListing) {
                  selectedListing = matchedListing;
                  console.log(`✅ [LLM] DeepSeek matched DEX selectedListing to original listing`);
                }
              } else {
                // For non-DEX listings, match by providerId or name
                const matchedListing = listings.find((l: any) => 
                  l.providerId === selectedListing.providerId ||
                  (l.movieTitle === selectedListing.movieTitle && l.providerName === selectedListing.providerName) ||
                  (l.restaurantName === selectedListing.restaurantName && l.providerName === selectedListing.providerName) ||
                  (l.flightNumber === selectedListing.flightNumber && l.providerName === selectedListing.providerName) ||
                  (l.hotelName === selectedListing.hotelName && l.providerName === selectedListing.providerName)
                );
                if (matchedListing) {
                  selectedListing = matchedListing;
                  console.log(`✅ [LLM] DeepSeek matched selectedListing to original listing`);
                }
              }
              
              // Ensure selectedListing has providerId (or poolId for DEX)
              if (!selectedListing.providerId && !selectedListing.poolId && listings.length > 0) {
                if ('poolId' in listings[0]) {
                  selectedListing = { ...selectedListing, poolId: (listings[0] as any).poolId };
                } else {
                  selectedListing = { ...selectedListing, providerId: listings[0].providerId || listings[0].id };
                }
                console.log(`🔧 [LLM] DeepSeek added missing providerId/poolId to selectedListing`);
              }
            }
            
            // FINAL FALLBACK: If still no selectedListing, use first listing
            if (!selectedListing && listings.length > 0) {
              selectedListing = listings[0];
              console.warn(`⚠️ [LLM] DeepSeek FINAL FALLBACK: Using first listing as selectedListing`);
            }
            
            const result = {
              message: parsed.message || "Service found",
              listings: parsed.listings || listings,
              selectedListing: selectedListing, // ALWAYS set (from LLM or fallback)
              iGasCost: 0,
            };
            
            // Final validation - log what we're returning
            console.log(`✅ [LLM] DeepSeek returning result with selectedListing: ${result.selectedListing ? 'SET' : 'NOT SET'}, type: ${typeof result.selectedListing}, hasPoolId: ${!!(result.selectedListing as any)?.poolId}, hasTokenSymbol: ${!!(result.selectedListing as any)?.tokenSymbol}`);
            
            resolve(result);
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

/**
 * Resolve LLM (choose between OpenAI and DeepSeek)
 */
export async function resolveLLM(userInput: string): Promise<LLMResponse> {
  if (MOCKED_LLM) {
    // Return mock response
    return {
      message: "Mock LLM response",
      listings: [],
      selectedListing: null,
      iGasCost: 0,
    };
  }
  
  try {
    let queryResult: LLMQueryResult;
    
    if (ENABLE_OPENAI) {
      queryResult = await extractQueryWithOpenAI(userInput);
    } else {
      queryResult = await extractQueryWithDeepSeek(userInput);
    }
    
    // This is a simplified version - the full implementation would query providers
    // and format the response. For now, return a basic response.
    return {
      message: "LLM query processed",
      listings: [],
      selectedListing: null,
      iGasCost: 0.001,
    };
  } catch (err: any) {
    console.error(`❌ LLM resolution failed:`, err.message);
    throw err;
  }
}

/**
 * Call LLM with a prompt
 */
export async function callLLM(prompt: string, useOpenAI: boolean): Promise<string> {
  if (useOpenAI) {
    // Use OpenAI API - Hardcoded API key
    const HARDCODED_API_KEY = "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";
    
    console.log(`   🔑 [callLLM] Using hardcoded API key (length: ${HARDCODED_API_KEY.length}, starts with: ${HARDCODED_API_KEY.substring(0, 7)}...)`);
    
    // Use https.request instead of fetch for Node.js compatibility
    return new Promise<string>((resolve, reject) => {
      const payload = JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        response_format: { type: "json_object" }
      });
      
      const url = new URL(OPENAI_API_URL);
      const authHeader = `Bearer ${HARDCODED_API_KEY}`;
      console.log(`   🔑 [callLLM] Authorization header: ${authHeader.substring(0, 20)}...`);
      
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
          "Content-Length": Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              const errorData = JSON.parse(data);
              reject(new Error(`OpenAI API error: ${res.statusCode} ${res.statusMessage} - ${JSON.stringify(errorData)}`));
              return;
            }
            
            const parsed = JSON.parse(data);
            if (!parsed || !parsed.choices || !Array.isArray(parsed.choices) || parsed.choices.length === 0) {
              reject(new Error(`Invalid OpenAI API response: ${JSON.stringify(parsed)}`));
              return;
            }
            
            resolve(parsed.choices[0]?.message?.content || "");
          } catch (err: any) {
            reject(new Error(`Failed to parse OpenAI API response: ${err.message}. Response: ${data.substring(0, 200)}`));
          }
        });
      });
      
      req.on("error", (err) => {
        reject(new Error(`OpenAI API request failed: ${err.message}`));
      });
      
      req.write(payload);
      req.end();
    });
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
            if (parsed.error) {
              reject(new Error(parsed.error.message));
              return;
            }
            resolve(parsed.choices[0]?.message?.content || "");
          } catch (err: any) {
            reject(err);
          }
        });
      });
      
      req.on("error", (err) => reject(err));
      req.write(payload);
      req.end();
    });
  }
}

