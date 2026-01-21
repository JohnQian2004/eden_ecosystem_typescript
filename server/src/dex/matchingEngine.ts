/**
 * Matching Engine Interface
 * Supports both AMM and Order Book matching models
 */

import type { DEXOrder, MatchResult, TokenPool } from "./types";

/**
 * Matching Engine Interface
 * All matching engines must implement this
 */
export interface MatchingEngine {
  name: 'AMM' | 'ORDER_BOOK';
  matchOrder(order: DEXOrder, pool?: TokenPool): Promise<MatchResult>;
  getPrice(pair: string): Promise<number>;
  canHandle(order: DEXOrder): boolean;
}

/**
 * AMM Matching Engine
 * Uses constant product formula (x * y = k)
 */
export class AMMEngine implements MatchingEngine {
  name = 'AMM' as const;
  private pools: Map<string, TokenPool>;
  
  constructor(pools: Map<string, TokenPool>) {
    this.pools = pools;
  }
  
  canHandle(order: DEXOrder): boolean {
    return order.matchingModel === 'AMM' || !order.matchingModel;
  }
  
  async getPrice(pair: string): Promise<number> {
    const pool = this.findPoolForPair(pair);
    if (!pool) throw new Error(`Pool not found for pair: ${pair}`);
    return pool.price;
  }
  
  async matchOrder(order: DEXOrder, pool?: TokenPool): Promise<MatchResult> {
    const targetPool = pool || this.findPoolForPair(order.pair);
    if (!targetPool) {
      throw new Error(`Pool not found for pair: ${order.pair}`);
    }
    
    // Use existing executeDEXTrade logic
    const { executeDEXTrade } = await import("../dex");
    const trade = executeDEXTrade(
      targetPool.poolId,
      order.side,
      order.amount,
      order.userEmail
    );
    
    return {
      matched: true,
      filledAmount: order.amount,
      executionPrice: trade.price,
      tradeId: trade.tradeId,
      settlementData: {
        assetIn: order.side === 'BUY' 
          ? { symbol: targetPool.baseToken, amount: trade.baseAmount }
          : { symbol: targetPool.tokenSymbol, amount: order.amount },
        assetOut: order.side === 'BUY'
          ? { symbol: targetPool.tokenSymbol, amount: order.amount }
          : { symbol: targetPool.baseToken, amount: trade.baseAmount },
        fees: {
          tradeFee: 0, // AMM doesn't have separate trade fee
          iGas: 0,     // Calculated separately
          iTax: trade.iTax || 0
        },
        priceImpact: trade.priceImpact
      }
    };
  }
  
  private findPoolForPair(pair: string): TokenPool | undefined {
    const [tokenSymbol, baseToken] = pair.split('/');
    for (const pool of this.pools.values()) {
      if (pool.tokenSymbol === tokenSymbol && pool.baseToken === baseToken) {
        return pool;
      }
    }
    return undefined;
  }
}

/**
 * Order Book Matching Engine
 * Price-time priority matching
 */
export class OrderBookEngine implements MatchingEngine {
  name = 'ORDER_BOOK' as const;
  private orderBooks: Map<string, import("./orderBook").OrderBook> = new Map();
  
  canHandle(order: DEXOrder): boolean {
    return order.matchingModel === 'ORDER_BOOK';
  }
  
  async getPrice(pair: string): Promise<number> {
    const book = this.orderBooks.get(pair);
    if (!book || book.lastPrice === 0) {
      throw new Error(`No price available for pair: ${pair}`);
    }
    return book.lastPrice;
  }
  
  async matchOrder(order: DEXOrder): Promise<MatchResult> {
    const book = await this.getOrCreateOrderBook(order.pair);
    
    if (order.type === 'MARKET') {
      return this.matchMarketOrder(order, book);
    } else if (order.type === 'LIMIT') {
      return this.matchLimitOrder(order, book);
    }
    
    throw new Error(`Unsupported order type: ${order.type}`);
  }
  
  private async getOrCreateOrderBook(pair: string): Promise<import("./orderBook").OrderBook> {
    if (!this.orderBooks.has(pair)) {
      const { createOrderBook } = await import("./orderBook");
      this.orderBooks.set(pair, createOrderBook(pair));
    }
    return this.orderBooks.get(pair)!;
  }
  
  private matchMarketOrder(
    order: DEXOrder,
    book: import("./orderBook").OrderBook
  ): Promise<MatchResult> {
    // Market orders match immediately at best available price
    // Implementation in orderBook.ts
    const { matchMarketOrder } = require("./orderBook");
    return matchMarketOrder(order, book);
  }
  
  private matchLimitOrder(
    order: DEXOrder,
    book: import("./orderBook").OrderBook
  ): Promise<MatchResult> {
    // Limit orders match if price is acceptable
    // Implementation in orderBook.ts
    const { matchLimitOrder } = require("./orderBook");
    return matchLimitOrder(order, book);
  }
}

/**
 * Matching Engine Factory
 */
export function createMatchingEngine(
  type: 'AMM' | 'ORDER_BOOK',
  pools?: Map<string, TokenPool>
): MatchingEngine {
  if (type === 'AMM') {
    if (!pools) {
      const { DEX_POOLS } = require("../state");
      pools = DEX_POOLS;
    }
    return new AMMEngine(pools);
  } else {
    return new OrderBookEngine();
  }
}

