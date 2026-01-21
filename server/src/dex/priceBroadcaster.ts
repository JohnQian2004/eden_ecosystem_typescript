/**
 * Real-Time Price Broadcaster
 * Broadcasts price updates and trade events via WebSocket
 */

import type { DEXOrderEvent, DEXTrade } from "./types";
import type { DEXTrade as LegacyDEXTrade } from "../types";

// Dependencies that need to be injected
let broadcastEvent: (event: any) => void = () => {};

/**
 * Initialize price broadcaster with broadcast function
 */
export function initializePriceBroadcaster(broadcastFn: (event: any) => void): void {
  broadcastEvent = broadcastFn;
}

/**
 * Price cache to reduce noise (only broadcast if price changed by > 0.01%)
 */
const priceCache: Map<string, { price: number; timestamp: number }> = new Map();
const PRICE_CHANGE_THRESHOLD = 0.0001; // 0.01%

/**
 * Broadcast price update (throttled)
 */
export function broadcastPriceUpdate(pair: string, price: number): void {
  const cached = priceCache.get(pair);
  
  // Only broadcast if price changed significantly
  if (!cached || Math.abs(price - cached.price) / cached.price > PRICE_CHANGE_THRESHOLD) {
    const event: DEXOrderEvent = {
      type: 'DEX_PRICE_UPDATE',
      timestamp: Date.now(),
      pair,
      price,
      data: { pair, price }
    };
    
    broadcastEvent(event);
    priceCache.set(pair, { price, timestamp: Date.now() });
  }
}

/**
 * Broadcast trade executed event
 */
export function broadcastTradeExecuted(
  trade: LegacyDEXTrade | DEXTrade,
  order: DEXOrder
): void {
  const event: DEXOrderEvent = {
    type: 'DEX_TRADE_EXECUTED',
    timestamp: Date.now(),
    tradeId: trade.tradeId || `trade_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    orderId: order.orderId,
    pair: order.pair,
    price: trade.price,
    amount: trade.tokenAmount || order.amount,
    data: {
      trade: {
        tradeId: trade.tradeId,
        poolId: (trade as any).poolId,
        tokenSymbol: trade.tokenSymbol,
        baseToken: trade.baseToken,
        action: trade.action,
        tokenAmount: trade.tokenAmount,
        baseAmount: trade.baseAmount,
        price: trade.price,
        iTax: (trade as any).iTax
      },
      order: {
        orderId: order.orderId,
        side: order.side,
        type: order.type
      }
    }
  };
  
  broadcastEvent(event);
  
  // Also broadcast price update
  broadcastPriceUpdate(order.pair, trade.price);
}

/**
 * Broadcast order lifecycle events
 */
export function broadcastOrderCreated(order: DEXOrder): void {
  const event: DEXOrderEvent = {
    type: 'DEX_ORDER_CREATED',
    timestamp: Date.now(),
    orderId: order.orderId,
    pair: order.pair,
    price: order.price,
    amount: order.amount,
    data: { order }
  };
  
  broadcastEvent(event);
}

export function broadcastOrderFilled(order: DEXOrder): void {
  const event: DEXOrderEvent = {
    type: 'DEX_ORDER_FILLED',
    timestamp: Date.now(),
    orderId: order.orderId,
    pair: order.pair,
    price: order.price,
    amount: order.amount,
    data: { order }
  };
  
  broadcastEvent(event);
}

export function broadcastOrderPartial(order: DEXOrder): void {
  const event: DEXOrderEvent = {
    type: 'DEX_ORDER_PARTIAL',
    timestamp: Date.now(),
    orderId: order.orderId,
    pair: order.pair,
    price: order.price,
    amount: order.filledAmount,
    data: { order }
  };
  
  broadcastEvent(event);
}

export function broadcastOrderCancelled(order: DEXOrder): void {
  const event: DEXOrderEvent = {
    type: 'DEX_ORDER_CANCELLED',
    timestamp: Date.now(),
    orderId: order.orderId,
    pair: order.pair,
    data: { order }
  };
  
  broadcastEvent(event);
}

/**
 * Broadcast settlement events
 */
export function broadcastSettlementPending(settlementId: string, orderId: string, pair: string): void {
  const event: DEXOrderEvent = {
    type: 'DEX_SETTLEMENT_PENDING',
    timestamp: Date.now(),
    orderId,
    pair,
    data: { settlementId, orderId, pair }
  };
  
  broadcastEvent(event);
}

export function broadcastSettlementFinal(settlementId: string, orderId: string, pair: string, ledgerEntryId: string): void {
  const event: DEXOrderEvent = {
    type: 'DEX_SETTLEMENT_FINAL',
    timestamp: Date.now(),
    orderId,
    pair,
    data: { settlementId, orderId, pair, ledgerEntryId }
  };
  
  broadcastEvent(event);
}


