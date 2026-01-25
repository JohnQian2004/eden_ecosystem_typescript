/**
 * DEX Order Processor
 * Orchestrates order creation, matching, settlement, and event broadcasting
 */

import * as crypto from "crypto";
import type { DEXOrder, DEXOrderIntent, MatchResult, ProvisionalSettlement } from "./types";
import type { DEXTrade, TokenPool } from "../types";
import { createMatchingEngine, type MatchingEngine } from "./matchingEngine";
import { createProvisionalSettlement, finalizeSettlement } from "./settlement";
import { 
  broadcastOrderCreated, 
  broadcastTradeExecuted, 
  broadcastSettlementPending,
  broadcastSettlementFinal,
  broadcastPriceUpdate
} from "./priceBroadcaster";
import { DEX_POOLS } from "../state";

// In-memory order storage (should be Redis in production)
const orders: Map<string, DEXOrder> = new Map();

/**
 * Create DEX order from order intent
 */
export function createDEXOrder(
  intent: DEXOrderIntent,
  userId: string,
  userEmail: string,
  gardenId: string = "Garden-DEX-T1",
  metadata?: Record<string, any>
): DEXOrder {
  const order: DEXOrder = {
    orderId: `ord_${crypto.randomUUID()}`,
    userId,
    userEmail,
    pair: intent.pair,
    side: intent.side,
    type: intent.type,
    price: intent.price,
    amount: intent.amount,
    filledAmount: 0,
    status: 'PENDING',
    expiresAt: intent.type === 'LIMIT' ? Date.now() + (24 * 60 * 60 * 1000) : undefined, // 24h for limit orders
    createdAt: Date.now(),
    gardenId,
    matchingModel: intent.matchingModel || 'AMM',
    metadata: {
      originalIntent: intent.originalInput,
      ...metadata
    }
  };
  
  orders.set(order.orderId, order);
  broadcastOrderCreated(order);
  
  return order;
}

/**
 * Process order: match, settle, and broadcast
 */
export async function processOrder(order: DEXOrder): Promise<{
  order: DEXOrder;
  matchResult: MatchResult;
  settlement: ProvisionalSettlement;
  trade?: DEXTrade;
  ledgerEntry?: any; // Ledger entry created by finalizeSettlement
}> {
  // Select matching engine
  const engine = createMatchingEngine(order.matchingModel, DEX_POOLS);
  
  if (!engine.canHandle(order)) {
    throw new Error(`Matching engine ${engine.name} cannot handle order with model ${order.matchingModel}`);
  }
  
  // Find pool for AMM (if needed)
  let pool: TokenPool | undefined;
  if (order.matchingModel === 'AMM') {
    const [tokenSymbol, baseToken] = order.pair.split('/');
    
    // Try to find pool by pair
    for (const p of DEX_POOLS.values()) {
      if (p.tokenSymbol === tokenSymbol && p.baseToken === baseToken) {
        pool = p;
        break;
      }
    }
    
    // If not found, try to use poolId from metadata (if available from selectedListing)
    if (!pool && order.metadata?.selectedListing?.poolId) {
      const poolId = order.metadata.selectedListing.poolId;
      pool = DEX_POOLS.get(poolId);
      if (pool) {
        console.log(`✅ [OrderProcessor] Found pool via metadata poolId: ${poolId}`);
      }
    }
    
    // If still not found and DEX_POOLS is empty, try to initialize pools first
    if (!pool && DEX_POOLS.size === 0) {
      console.warn(`⚠️ [OrderProcessor] DEX_POOLS is empty, attempting to initialize pools...`);
      try {
        const { initializeDEXPools } = await import("../dex");
        initializeDEXPools();
        console.log(`✅ [OrderProcessor] Initialized ${DEX_POOLS.size} pool(s) from TOKEN_GARDENS`);
        
        // Try to find pool again after initialization
        for (const p of DEX_POOLS.values()) {
          if (p.tokenSymbol === tokenSymbol && p.baseToken === baseToken) {
            pool = p;
            break;
          }
        }
      } catch (initErr: any) {
        console.warn(`⚠️ [OrderProcessor] Failed to initialize pools: ${initErr.message}`);
      }
    }
    
    // If still not found, create a pool on-demand
    if (!pool) {
      console.warn(`⚠️ [OrderProcessor] Pool not found, creating pool on-demand for ${order.pair}`);
      const { TOKEN_GARDENS } = await import("../state");
      
      // Find or use the first available token garden, or use the order's gardenId
      let targetGardenId = order.gardenId;
      if (!targetGardenId || !TOKEN_GARDENS.find(tg => tg.id === targetGardenId)) {
        targetGardenId = TOKEN_GARDENS.length > 0 ? TOKEN_GARDENS[0].id : "Garden-DEX-T1";
      }
      
      // Create a pool on-demand
      const poolId = `pool-${baseToken.toLowerCase()}-${tokenSymbol.toLowerCase()}-1`;
      const onDemandPool: TokenPool = {
        poolId: poolId,
        tokenSymbol: tokenSymbol,
        tokenName: `${tokenSymbol} Pool`,
        baseToken: baseToken,
        poolLiquidity: 100,
        tokenReserve: 100000,
        baseReserve: 100,
        price: 0.001,
        bond: 5000,
        gardenId: targetGardenId,
        createdAt: Date.now(),
        totalVolume: 0,
        totalTrades: 0,
      };
      
      DEX_POOLS.set(poolId, onDemandPool);
      pool = onDemandPool;
      console.log(`✅ [OrderProcessor] Created on-demand pool: ${poolId} for ${order.pair}`);
    }
    
    // If still not found, log available pools for debugging
    if (!pool) {
      const availablePools = Array.from(DEX_POOLS.entries()).map(([id, p]) => ({
        poolId: id,
        pair: `${p.tokenSymbol}/${p.baseToken}`
      }));
      console.error(`❌ [OrderProcessor] Pool not found for pair: ${order.pair}`);
      console.error(`   Available pools:`, availablePools);
      console.error(`   DEX_POOLS size: ${DEX_POOLS.size}`);
      throw new Error(`Pool not found for pair: ${order.pair}. Available pools: ${JSON.stringify(availablePools)}`);
    }
  }
  
  // Match order
  console.log(`🔄 [OrderProcessor] Matching order ${order.orderId} using ${engine.name} engine`);
  const matchResult = await engine.matchOrder(order, pool);
  
  if (!matchResult.matched) {
    // Order not matched - update status
    if (order.type === 'LIMIT') {
      order.status = 'PENDING'; // Keep in order book
    } else {
      order.status = 'CANCELLED'; // Market order with no match
    }
    orders.set(order.orderId, order);
    return { order, matchResult, settlement: null as any };
  }
  
  // Update order status
  if (matchResult.remainingAmount && matchResult.remainingAmount > 0) {
    order.status = 'PARTIAL';
    order.filledAmount = matchResult.filledAmount;
    broadcastOrderPartial(order);
  } else {
    order.status = 'FILLED';
    order.filledAmount = matchResult.filledAmount;
    broadcastOrderFilled(order);
  }
  orders.set(order.orderId, order);
  
  // Create provisional settlement (Phase 1)
  console.log(`🔒 [OrderProcessor] Creating provisional settlement for order ${order.orderId}`);
  const settlement = await createProvisionalSettlement(matchResult, order);
  broadcastSettlementPending(settlement.settlementId, order.orderId, order.pair);
  
  // Convert match result to trade format (for immediate use)
  // Calculate baseAmount correctly: for BUY, assetIn is baseToken; for SELL, assetOut is baseToken
  const baseTokenSymbol = order.pair.split('/')[1];
  const baseAmount = matchResult.settlementData.assetIn.symbol?.toUpperCase() === baseTokenSymbol.toUpperCase()
    ? matchResult.settlementData.assetIn.amount
    : matchResult.settlementData.assetOut.symbol?.toUpperCase() === baseTokenSymbol.toUpperCase()
      ? matchResult.settlementData.assetOut.amount
      : 0;
  
  const trade: DEXTrade = {
    tradeId: matchResult.tradeId,
    poolId: pool?.poolId || `pool-${order.pair.toLowerCase().replace('/', '-')}`,
    tokenSymbol: order.pair.split('/')[0],
    baseToken: baseTokenSymbol,
    action: order.side,
    tokenAmount: matchResult.filledAmount,
    baseAmount: baseAmount,
    price: matchResult.executionPrice,
    priceImpact: matchResult.settlementData.priceImpact || 0,
    iTax: matchResult.settlementData.fees.iTax,
    timestamp: Date.now(),
    trader: order.userEmail
  };
  
  // Finalize settlement immediately (Phase 2)
  // In production, this could be async/queued, but for now we do it synchronously
  let ledgerEntry;
  try {
    console.log(`✅ [OrderProcessor] Finalizing settlement ${settlement.settlementId}`);
    ledgerEntry = await finalizeSettlement(settlement.settlementId);
    broadcastSettlementFinal(settlement.settlementId, order.orderId, order.pair, ledgerEntry.entryId);
    
    // CRITICAL: Update pool statistics (totalTrades and totalVolume) after successful trade
    if (pool) {
      pool.totalTrades = (pool.totalTrades || 0) + 1;
      // Calculate trade volume in baseToken
      // For BUY: assetIn is baseToken, assetOut is token
      // For SELL: assetIn is token, assetOut is baseToken
      let tradeVolume = 0;
      if (matchResult.settlementData.assetIn.symbol?.toUpperCase() === pool.baseToken.toUpperCase()) {
        tradeVolume = matchResult.settlementData.assetIn.amount;
      } else if (matchResult.settlementData.assetOut.symbol?.toUpperCase() === pool.baseToken.toUpperCase()) {
        tradeVolume = matchResult.settlementData.assetOut.amount;
      } else if (trade.baseAmount && trade.baseAmount > 0) {
        // Fallback to trade.baseAmount if symbol matching fails
        tradeVolume = trade.baseAmount;
      } else {
        // Last resort: use execution price * filled amount
        tradeVolume = matchResult.executionPrice * matchResult.filledAmount;
      }
      pool.totalVolume = (pool.totalVolume || 0) + tradeVolume;
      console.log(`📊 [OrderProcessor] Updated pool statistics for ${pool.poolId}: totalTrades=${pool.totalTrades}, totalVolume=${pool.totalVolume.toFixed(2)} ${pool.baseToken}`);
    }
    
    // Broadcast trade executed and price update after successful settlement
    broadcastTradeExecuted(trade, order);
    broadcastPriceUpdate(order.pair, matchResult.executionPrice);
  } catch (error: any) {
    console.error(`❌ [OrderProcessor] Failed to finalize settlement: ${error.message}`);
    // Continue anyway - trade is matched, settlement will retry
    // Still broadcast trade event for user feedback
    broadcastTradeExecuted(trade, order);
    broadcastPriceUpdate(order.pair, matchResult.executionPrice);
  }
  
  return { order, matchResult, settlement, trade, ledgerEntry };
}

/**
 * Create order intent from LLM query result
 */
export function createOrderIntentFromQuery(
  queryResult: any,
  selectedListing: any,
  userInput: string
): DEXOrderIntent {
  // Normalize tokenSymbol to "TOKEN" for all token pools (changed from TOKENA, TOKENB, etc.)
  let tokenSymbol = selectedListing?.tokenSymbol || queryResult?.query?.filters?.tokenSymbol || 'TOKEN';
  // If tokenSymbol starts with "TOKEN" (case-insensitive), normalize to "TOKEN"
  if (tokenSymbol.toUpperCase().startsWith('TOKEN')) {
    tokenSymbol = 'TOKEN';
  }
  const baseToken = selectedListing?.baseToken || queryResult?.query?.filters?.baseToken || 'SOL';
  const pair = `${tokenSymbol}/${baseToken}`;
  
  const side = queryResult?.query?.filters?.action || 'BUY';
  const type = queryResult?.query?.filters?.orderType || 'MARKET'; // Default to MARKET for simplicity
  const amount = queryResult?.query?.filters?.tokenAmount || 1;
  const price = queryResult?.query?.filters?.price; // Optional for LIMIT orders
  const matchingModel = queryResult?.query?.filters?.matchingModel || 'AMM'; // Default to AMM
  
  return {
    pair,
    side,
    type,
    amount,
    price,
    matchingModel,
    originalInput: userInput
  };
}

/**
 * Get order by ID
 */
export function getOrder(orderId: string): DEXOrder | undefined {
  return orders.get(orderId);
}

/**
 * Cancel order
 */
export function cancelOrder(orderId: string): DEXOrder | null {
  const order = orders.get(orderId);
  if (!order) {
    return null;
  }
  
  if (order.status === 'FILLED' || order.status === 'CANCELLED') {
    return null; // Cannot cancel filled or already cancelled orders
  }
  
  order.status = 'CANCELLED';
  orders.set(orderId, order);
  
  const { broadcastOrderCancelled } = require("./priceBroadcaster");
  broadcastOrderCancelled(order);
  
  return order;
}

import { broadcastOrderPartial, broadcastOrderFilled } from "./priceBroadcaster";

