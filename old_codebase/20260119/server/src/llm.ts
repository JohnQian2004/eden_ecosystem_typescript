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

ABSOLUTELY FORBIDDEN - NEVER DO THIS:
- NEVER return a generic "Demo Service" response
- NEVER use "name": "Demo Service" in selectedListing
- NEVER use "providerId": "provider-001" unless it's actually in the listings array
- NEVER create fictional or placeholder listings
- NEVER return listings that are not in the provided listings array
- If you cannot find a match, you MUST use the first listing from the provided listings array, NOT create a new one

Return JSON with: 
- message (string): User-friendly message describing the selected option
- listings (array): All filtered listings that match the query
- selectedListing (object): The BEST option from the listings array with ALL original fields. NEVER null or undefined. If no good option exists, pick the first listing from the provided listings array.

Example format:
{
  "message": "Found 3 options. Best option: [description]",
  "listings": [...],
  "selectedListing": { /* complete listing object with ALL fields from the listings array */ }
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
    model: "gpt-4o",
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
      model: "gpt-4o",
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
  console.log(`🔍 [LLM] ========================================`);
  console.log(`🔍 [LLM] formatResponseWithOpenAI FUNCTION ENTRY - UPDATED VERSION WITH HARDCODED DEX MOCK`);
  console.log(`🔍 [LLM] This is the CORRECT function from server/src/llm.ts`);
  console.log(`🔍 [LLM] listings count: ${listings.length}`);
  console.log(`🔍 [LLM] userQuery: ${userQuery.substring(0, 100)}`);
  console.log(`🔍 [LLM] queryFilters:`, JSON.stringify(queryFilters));
  console.log(`🔍 [LLM] ========================================`);
  
  const listingsJson = JSON.stringify(listings);
  const filtersJson = queryFilters ? JSON.stringify(queryFilters) : "{}";
  const userMessage = `User query: ${userQuery}\n\nQuery filters: ${filtersJson}\n\nAvailable listings:\n${listingsJson}\n\nFilter listings based on the query filters and format the best option as a user-friendly message.`;
  
  const messages = [
    { role: "system", content: LLM_RESPONSE_FORMATTING_PROMPT },
    { role: "user", content: userMessage },
  ];
  
  const payload = JSON.stringify({
    model: "gpt-4o",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  console.log(`🔍 [LLM] ========================================`);
  console.log(`🔍 [LLM] formatResponseWithOpenAI CALLED`);
  console.log(`🔍 [LLM] listings count: ${listings.length}`);
  console.log(`🔍 [LLM] userQuery: ${userQuery.substring(0, 100)}`);
  console.log(`🔍 [LLM] ========================================`);
  
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
          console.log(`🔍 [LLM] OpenAI response received, data length: ${data.length}`);
          try {
            const parsed = JSON.parse(data);
            console.log(`🔍 [LLM] OpenAI response parsed successfully`);
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
                
                // CRITICAL: Block "Demo Service" fallback - force use of actual listings
                // Check if LLM returned a generic "Demo Service" response BEFORE processing
                if (content.selectedListing) {
                  const isGenericDemo = (content.selectedListing as any)?.name === "Demo Service" || 
                                       ((content.selectedListing as any)?.providerId === "provider-001" && 
                                        !(content.selectedListing as any)?.poolId && 
                                        !(content.selectedListing as any)?.movieTitle);
                  
                  if (isGenericDemo) {
                    console.warn(`⚠️ [LLM] ========================================`);
                    console.warn(`⚠️ [LLM] BLOCKED generic "Demo Service" response from LLM`);
                    console.warn(`⚠️ [LLM] LLM returned:`, JSON.stringify(content.selectedListing, null, 2));
                    console.warn(`⚠️ [LLM] Forcing use of actual listing from listings array`);
                    console.warn(`⚠️ [LLM] Available listings count: ${listings.length}`);
                    // Force use of first actual listing - IGNORE LLM's "Demo Service" response
                    if (listings.length > 0) {
                      content.selectedListing = listings[0]; // Replace with actual listing
                      console.log(`✅ [LLM] Replaced LLM's "Demo Service" with first actual listing:`, JSON.stringify(listings[0], null, 2));
                    } else {
                      console.error(`❌ [LLM] No listings available to replace "Demo Service" response`);
                      content.selectedListing = null;
                    }
                    console.warn(`⚠️ [LLM] ========================================`);
                  }
                }
              } catch (parseError: any) {
                console.error(`❌ [LLM] Failed to parse OpenAI content as JSON: ${parseError.message}`);
                console.error(`❌ [LLM] Content string: ${parsed.choices[0].message.content?.substring(0, 500)}`);
                // If parsing fails, create a minimal content object
                content = { message: parsed.choices[0].message.content || "Service found", selectedListing: null };
              }
              
              // Now process the content (which may have been modified to block "Demo Service")
              {
                // OLD CODEBASE PATTERN EXACTLY: Ensure selectedListing has providerId/poolId by matching it back to original listings
                selectedListing = content.selectedListing || (listings.length > 0 ? listings[0] : null);
                if (selectedListing) {
                  // Check if it's a TokenListing (has poolId) or MovieListing (has movieTitle)
                  const isTokenListing = 'poolId' in selectedListing || 'tokenSymbol' in selectedListing;
                  
                  if (isTokenListing) {
                    // TokenListing: match by poolId or tokenSymbol
                    const tokenListing = selectedListing as any;
                    if (!tokenListing.poolId || !tokenListing.providerId) {
                      const matchedListing = listings.find((l: any) => 
                        ('poolId' in l && l.poolId === tokenListing.poolId) ||
                        ('tokenSymbol' in l && l.tokenSymbol === tokenListing.tokenSymbol && l.baseToken === tokenListing.baseToken)
                      ) as TokenListing | undefined;
                      if (matchedListing) {
                        // Merge LLM response with original listing to ensure all fields are present
                        selectedListing = {
                          ...matchedListing,
                          ...tokenListing, // Preserve any additional fields from LLM
                          poolId: matchedListing.poolId,
                          providerId: matchedListing.providerId,
                          tokenSymbol: matchedListing.tokenSymbol,
                          baseToken: matchedListing.baseToken
                        };
                        console.log(`✅ [LLM] Matched DEX pool listing by poolId/tokenSymbol: ${matchedListing.poolId}`);
                      } else if (listings.length > 0) {
                        // Fallback to first listing if no match found
                        const firstListing = listings[0] as TokenListing;
                        selectedListing = {
                          ...firstListing,
                          ...tokenListing, // Preserve LLM fields
                          poolId: firstListing.poolId,
                          providerId: firstListing.providerId
                        };
                        console.warn(`⚠️ [LLM] No DEX pool match found, using first listing: ${firstListing.poolId}`);
                      }
                    } else {
                      // Already has poolId and providerId, but ensure all fields from original listing are present
                      const matchedListing = listings.find((l: any) => 
                        'poolId' in l && l.poolId === tokenListing.poolId
                      ) as TokenListing | undefined;
                      if (matchedListing) {
                        selectedListing = {
                          ...matchedListing,
                          ...tokenListing // Preserve LLM fields but ensure original fields are present
                        };
                      }
                    }
                  } else {
                    // MovieListing: match by movieTitle and providerName
                    if (!selectedListing.providerId) {
                      const matchedListing = listings.find((l: any) => 
                        l.movieTitle === selectedListing.movieTitle && 
                        l.providerName === selectedListing.providerName
                      );
                      if (matchedListing) {
                        selectedListing = { ...selectedListing, providerId: matchedListing.providerId };
                      } else if (listings.length > 0) {
                        // Fallback to first listing
                        selectedListing = { ...selectedListing, providerId: listings[0].providerId };
                      }
                    }
                  }
                }
              }
              
              // OLD CODEBASE PATTERN: For DEX queries, ALWAYS use first listing (simpler approach)
              // Check if this is a DEX query by looking at listings or query filters
              const isDEXQuery = listings.length > 0 && ('poolId' in listings[0] || 'tokenSymbol' in listings[0]);
              const filters = queryFilters || {};
              const isDEXFromFilters = filters?.tokenSymbol || filters?.baseToken;
              
              let selectedListing2: TokenListing | MovieListing | null = null;
              
              // FORCE use first actual listing for DEX queries (OLD CODEBASE PATTERN: simple fallback)
              if (isDEXQuery || isDEXFromFilters) {
                console.log(`🔧 [LLM] ========================================`);
                console.log(`🔧 [LLM] DEX QUERY DETECTED - USING FIRST LISTING (OLD CODEBASE PATTERN)`);
                console.log(`🔧 [LLM] isDEXQuery: ${isDEXQuery}, isDEXFromFilters: ${isDEXFromFilters}`);
                console.log(`🔧 [LLM] LLM returned selectedListing:`, content.selectedListing ? JSON.stringify(content.selectedListing).substring(0, 200) : 'null');
                
                // OLD CODEBASE PATTERN: Just use first listing if available, otherwise use hardcoded mock
                if (listings.length > 0 && 'poolId' in listings[0]) {
                  // Use first actual listing (simplest approach - matches old codebase)
                  selectedListing = listings[0] as TokenListing;
                  selectedListing2 = listings[0] as TokenListing;
                  console.log(`🔧 [LLM] Using first actual DEX pool listing:`, JSON.stringify(selectedListing, null, 2));
                } else {
                  // Fallback to hardcoded mock if no listings available
                  const mockDEXPool: TokenListing = {
                    poolId: 'pool-solana-tokena',
                    providerId: 'dex-pool-tokena',
                    providerName: 'DEX Pool Provider',
                    tokenSymbol: filters?.tokenSymbol || 'TOKENA',
                    tokenName: 'Token A',
                    baseToken: filters?.baseToken || 'SOL',
                    price: 1.5,
                    liquidity: 10000,
                    volume24h: 5000,
                    indexerId: 'T1'
                  };
                  selectedListing = mockDEXPool;
                  selectedListing2 = mockDEXPool;
                  console.log(`🔧 [LLM] No listings available, using hardcoded mock DEX pool:`, JSON.stringify(mockDEXPool, null, 2));
                }
                console.log(`🔧 [LLM] ========================================`);
              } else {
                // For non-DEX queries, use the selectedListing as-is (OLD CODEBASE PATTERN)
                selectedListing2 = selectedListing;
              }
              
              const result = {
                message: content.message || "Service found",
                listings: content.listings || listings,
                selectedListing: selectedListing, // ALWAYS set (from LLM or fallback)
                selectedListing2: selectedListing2, // DEBUG: Track lifecycle separately
                iGasCost: 0, // Will be calculated separately
              };
              
              // Final validation - log what we're returning
              console.log(`✅ [LLM] Returning result with selectedListing: ${result.selectedListing ? 'SET' : 'NOT SET'}, type: ${typeof result.selectedListing}, hasPoolId: ${!!(result.selectedListing as any)?.poolId}, hasTokenSymbol: ${!!(result.selectedListing as any)?.tokenSymbol}`);
              console.log(`✅ [LLM] Returning result with selectedListing2: ${result.selectedListing2 ? 'SET' : 'NOT SET'}, type: ${typeof result.selectedListing2}`);
              console.log(`✅ [LLM] Result object keys: ${Object.keys(result).join(', ')}, selectedListing in result: ${'selectedListing' in result}, selectedListing2 in result: ${'selectedListing2' in result}`);
              
              // CRITICAL: Ensure selectedListing is NEVER null - use first listing as final fallback
              // Also check if selectedListing is a generic "Demo Service" response that doesn't match any listing
              if (!result.selectedListing && listings.length > 0) {
                result.selectedListing = listings[0];
                result.selectedListing2 = listings[0]; // Also set selectedListing2
                console.warn(`⚠️ [LLM] FINAL SAFETY: Setting selectedListing and selectedListing2 to first listing in result object`);
              } else if (result.selectedListing) {
                // Check if selectedListing is a generic response that doesn't match any listing
                const hasPoolId = !!(result.selectedListing as any)?.poolId;
                const hasTokenSymbol = !!(result.selectedListing as any)?.tokenSymbol;
                const hasMovieTitle = !!(result.selectedListing as any)?.movieTitle;
                const isGenericDemo = (result.selectedListing as any)?.name === "Demo Service" || 
                                     ((result.selectedListing as any)?.providerId === "provider-001" && !hasPoolId && !hasMovieTitle);
                
                if (isGenericDemo && listings.length > 0) {
                  console.warn(`⚠️ [LLM] Detected generic "Demo Service" response, replacing with first actual listing`);
                  result.selectedListing = listings[0];
                  result.selectedListing2 = listings[0];
                } else if (!hasPoolId && !hasMovieTitle && listings.length > 0) {
                  // If selectedListing doesn't have expected fields for either DEX or Movie, use first listing
                  const firstListing = listings[0] as any;
                  const firstIsDEX = !!(firstListing?.poolId || firstListing?.tokenSymbol);
                  const firstIsMovie = !!firstListing?.movieTitle;
                  
                  if (firstIsDEX || firstIsMovie) {
                    console.warn(`⚠️ [LLM] selectedListing missing required fields (poolId/movieTitle), replacing with first listing`);
                    result.selectedListing = listings[0];
                    result.selectedListing2 = listings[0];
                  }
                }
              }
              
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
  console.log(`🔍 [LLM] ========================================`);
  console.log(`🔍 [LLM] formatResponseWithDeepSeek FUNCTION ENTRY - UPDATED VERSION WITH HARDCODED DEX MOCK`);
  console.log(`🔍 [LLM] This is the CORRECT function from server/src/llm.ts`);
  console.log(`🔍 [LLM] listings count: ${listings.length}`);
  console.log(`🔍 [LLM] userQuery: ${userQuery.substring(0, 100)}`);
  console.log(`🔍 [LLM] queryFilters:`, JSON.stringify(queryFilters));
  console.log(`🔍 [LLM] ========================================`);
  
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
            console.log(`🔧 [LLM] DeepSeek parsed response keys: ${Object.keys(parsed || {}).join(', ')}`);
            console.log(`🔧 [LLM] DeepSeek parsed.selectedListing exists: ${!!parsed.selectedListing}, type: ${typeof parsed.selectedListing}`);
            
            // OLD CODEBASE PATTERN EXACTLY: Ensure selectedListing has providerId/poolId by matching it back to original listings
            let selectedListing = parsed.selectedListing || (listings.length > 0 ? listings[0] : null);
            if (selectedListing) {
              // Check if it's a TokenListing (has poolId) or MovieListing (has movieTitle)
              const isTokenListing = 'poolId' in selectedListing || 'tokenSymbol' in selectedListing;
              
              if (isTokenListing) {
                // TokenListing: match by poolId or tokenSymbol
                const tokenListing = selectedListing as any;
                if (!tokenListing.poolId) {
                  const matchedListing = listings.find((l: any) => 
                    ('poolId' in l && l.poolId === tokenListing.poolId) ||
                    ('tokenSymbol' in l && l.tokenSymbol === tokenListing.tokenSymbol)
                  ) as TokenListing | undefined;
                  if (matchedListing) {
                    selectedListing = { ...selectedListing, ...matchedListing };
                  } else if (listings.length > 0) {
                    selectedListing = { ...selectedListing, ...(listings[0] as TokenListing) };
                  }
                }
              } else {
                // MovieListing: match by movie title and provider name
                const movieListing = selectedListing as any;
                if (!movieListing.providerId) {
                  const matchedListing = listings.find((l: any) => 
                    'movieTitle' in l &&
                    l.movieTitle === movieListing.movieTitle && 
                    l.providerName === movieListing.providerName
                  ) as MovieListing | undefined;
                  if (matchedListing) {
                    selectedListing = { ...selectedListing, providerId: matchedListing.providerId };
                  } else if (listings.length > 0) {
                    selectedListing = { ...selectedListing, providerId: (listings[0] as MovieListing).providerId };
                  }
                }
              }
            }
            
            // FINAL SAFETY: Ensure selectedListing is NEVER null before creating result
            if (!selectedListing && listings.length > 0) {
              selectedListing = listings[0];
              console.warn(`⚠️ [LLM] DeepSeek FINAL SAFETY: Setting selectedListing to first listing before creating result`);
            }
            
            // HARDCODED: ALWAYS use mock DEX pool data for DEX queries - bypass LLM completely
            // Check if this is a DEX query by looking at listings or query filters
            const isDEXQuery = listings.length > 0 && ('poolId' in listings[0] || 'tokenSymbol' in listings[0]);
            const filters = queryFilters || {};
            const isDEXFromFilters = filters?.tokenSymbol || filters?.baseToken;
            
            let selectedListing2: TokenListing | MovieListing | null = null;
            
            // FORCE hardcoded mock data for DEX queries - completely bypass LLM response
            if (isDEXQuery || isDEXFromFilters) {
              console.log(`🔧 [LLM] DeepSeek ========================================`);
              console.log(`🔧 [LLM] DeepSeek FORCING HARDCODED DEX POOL DATA - BYPASSING LLM RESPONSE`);
              console.log(`🔧 [LLM] DeepSeek isDEXQuery: ${isDEXQuery}, isDEXFromFilters: ${isDEXFromFilters}`);
              console.log(`🔧 [LLM] DeepSeek LLM returned selectedListing:`, selectedListing ? JSON.stringify(selectedListing).substring(0, 200) : 'null');
              
              // HARDCODED DEX pool mock data - ALWAYS use this for DEX queries
              const mockDEXPool: TokenListing = {
                poolId: listings.length > 0 && 'poolId' in listings[0] ? (listings[0] as TokenListing).poolId : 'pool-solana-tokena',
                providerId: listings.length > 0 && 'providerId' in listings[0] ? listings[0].providerId : 'dex-pool-tokena',
                providerName: listings.length > 0 && 'providerName' in listings[0] ? listings[0].providerName : 'DEX Pool Provider',
                tokenSymbol: filters?.tokenSymbol || (listings.length > 0 && 'tokenSymbol' in listings[0] ? (listings[0] as TokenListing).tokenSymbol : 'TOKENA'),
                tokenName: listings.length > 0 && 'tokenName' in listings[0] ? (listings[0] as TokenListing).tokenName : 'Token A',
                baseToken: filters?.baseToken || (listings.length > 0 && 'baseToken' in listings[0] ? (listings[0] as TokenListing).baseToken : 'SOL'),
                price: listings.length > 0 && 'price' in listings[0] ? listings[0].price : 1.5,
                liquidity: listings.length > 0 && 'liquidity' in listings[0] ? (listings[0] as TokenListing).liquidity : 10000,
                volume24h: listings.length > 0 && 'volume24h' in listings[0] ? (listings[0] as TokenListing).volume24h : 5000,
                indexerId: listings.length > 0 && 'indexerId' in listings[0] ? (listings[0] as TokenListing).indexerId : 'T1'
              };
              
              // FORCE override - ignore LLM's selectedListing completely for DEX queries
              selectedListing = mockDEXPool;
              selectedListing2 = mockDEXPool;
              
              console.log(`🔧 [LLM] DeepSeek HARDCODED mock DEX pool (OVERRIDING LLM):`, JSON.stringify(mockDEXPool, null, 2));
              console.log(`🔧 [LLM] DeepSeek ========================================`);
            } else {
              // For non-DEX queries, use the selectedListing as-is
              selectedListing2 = selectedListing;
            }
            
            const result = {
              message: parsed.message || "Service found",
              listings: parsed.listings || listings,
              selectedListing: selectedListing, // ALWAYS set (from LLM or fallback)
              selectedListing2: selectedListing2, // DEBUG: Track lifecycle separately
              iGasCost: 0,
            };
            
            // Final validation - log what we're returning
            console.log(`✅ [LLM] DeepSeek returning result with selectedListing: ${result.selectedListing ? 'SET' : 'NOT SET'}, type: ${typeof result.selectedListing}, hasPoolId: ${!!(result.selectedListing as any)?.poolId}, hasTokenSymbol: ${!!(result.selectedListing as any)?.tokenSymbol}`);
            console.log(`✅ [LLM] DeepSeek returning result with selectedListing2: ${result.selectedListing2 ? 'SET' : 'NOT SET'}, type: ${typeof result.selectedListing2}`);
            console.log(`✅ [LLM] DeepSeek result object keys: ${Object.keys(result).join(', ')}, selectedListing in result: ${'selectedListing' in result}, selectedListing2 in result: ${'selectedListing2' in result}`);
            
            // CRITICAL: Ensure selectedListing is NEVER null in result - use first listing as final fallback
            if (!result.selectedListing && listings.length > 0) {
              result.selectedListing = listings[0];
              result.selectedListing2 = listings[0]; // Also set selectedListing2
              console.warn(`⚠️ [LLM] DeepSeek FINAL SAFETY: Setting selectedListing and selectedListing2 to first listing in result object`);
            }
            
            // DEBUG: Console out FULL LLM response
            console.log(`🔍 [LLM] ========================================`);
            console.log(`🔍 [LLM] FULL LLM RESPONSE (DeepSeek):`);
            console.log(JSON.stringify(result, null, 2));
            console.log(`🔍 [LLM] ========================================`);
            
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
 * COMMENTED OUT: This function is a duplicate and bypasses the updated formatResponseWithOpenAI
 * that has hardcoded DEX mock data. Use formatResponseWithOpenAI/formatResponseWithDeepSeek directly instead.
 */
/*
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
*/

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
        model: "gpt-4o",
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

