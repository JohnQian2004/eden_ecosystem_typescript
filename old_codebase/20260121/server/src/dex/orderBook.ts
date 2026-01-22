/**
 * Order Book Implementation
 * Price-time priority matching for ORDER_BOOK model
 */

import type { DEXOrder, MatchResult, OrderBook, OrderBookEntry } from "./types";
import * as crypto from "crypto";

/**
 * Create a new order book for a trading pair
 */
export function createOrderBook(pair: string): OrderBook {
  return {
    pair,
    buyOrders: [],
    sellOrders: [],
    lastPrice: 0,
    lastUpdate: Date.now()
  };
}

/**
 * Calculate priority score for price-time priority
 * Higher score = higher priority
 * For BUY: higher price wins, then earlier time
 * For SELL: lower price wins, then earlier time
 */
function calculatePriority(order: DEXOrder, isBuy: boolean): number {
  const price = order.price || 0;
  const timeScore = 1 / (order.createdAt || Date.now()); // Earlier = higher score
  
  if (isBuy) {
    // BUY: Higher price wins, then earlier time
    return price * 1000000 + timeScore;
  } else {
    // SELL: Lower price wins, then earlier time
    return (1 / (price || 0.0001)) * 1000000 + timeScore;
  }
}

/**
 * Add order to order book
 */
export function addOrderToBook(order: DEXOrder, book: OrderBook): void {
  const entry: OrderBookEntry = {
    order,
    priority: calculatePriority(order, order.side === 'BUY')
  };
  
  if (order.side === 'BUY') {
    book.buyOrders.push(entry);
    book.buyOrders.sort((a, b) => b.priority - a.priority); // Descending (max heap)
  } else {
    book.sellOrders.push(entry);
    book.sellOrders.sort((a, b) => a.priority - b.priority); // Ascending (min heap)
  }
  
  book.lastUpdate = Date.now();
}

/**
 * Match market order (immediate execution at best price)
 */
export async function matchMarketOrder(
  order: DEXOrder,
  book: OrderBook
): Promise<MatchResult> {
  const oppositeSide = order.side === 'BUY' ? book.sellOrders : book.buyOrders;
  
  if (oppositeSide.length === 0) {
    // No matching orders - add to book as limit order
    addOrderToBook(order, book);
    return {
      matched: false,
      filledAmount: 0,
      executionPrice: 0,
      tradeId: '',
      settlementData: {
        assetIn: { symbol: '', amount: 0 },
        assetOut: { symbol: '', amount: 0 },
        fees: { tradeFee: 0, iGas: 0, iTax: 0 }
      }
    };
  }
  
  // Match against best available price
  let remainingAmount = order.amount;
  let totalFilled = 0;
  let totalCost = 0;
  const trades: string[] = [];
  
  while (remainingAmount > 0 && oppositeSide.length > 0) {
    const bestMatch = oppositeSide[0];
    const matchAmount = Math.min(remainingAmount, bestMatch.order.amount - bestMatch.order.filledAmount);
    const executionPrice = bestMatch.order.price || 0;
    
    totalFilled += matchAmount;
    totalCost += matchAmount * executionPrice;
    remainingAmount -= matchAmount;
    
    // Update matched order
    bestMatch.order.filledAmount += matchAmount;
    if (bestMatch.order.filledAmount >= bestMatch.order.amount) {
      bestMatch.order.status = 'FILLED';
      oppositeSide.shift(); // Remove filled order
    } else {
      bestMatch.order.status = 'PARTIAL';
    }
    
    trades.push(crypto.randomUUID());
  }
  
  const executionPrice = totalFilled > 0 ? totalCost / totalFilled : 0;
  book.lastPrice = executionPrice;
  
  return {
    matched: totalFilled > 0,
    filledAmount: totalFilled,
    executionPrice,
    tradeId: trades[0] || crypto.randomUUID(),
    remainingAmount,
    settlementData: {
      assetIn: order.side === 'BUY'
        ? { symbol: order.pair.split('/')[1], amount: totalCost }
        : { symbol: order.pair.split('/')[0], amount: totalFilled },
      assetOut: order.side === 'BUY'
        ? { symbol: order.pair.split('/')[0], amount: totalFilled }
        : { symbol: order.pair.split('/')[1], amount: totalCost },
      fees: {
        tradeFee: totalCost * 0.003, // 0.3% trade fee
        iGas: 0, // Calculated separately
        iTax: 0  // Calculated separately
      }
    }
  };
}

/**
 * Match limit order (only if price is acceptable)
 */
export async function matchLimitOrder(
  order: DEXOrder,
  book: OrderBook
): Promise<MatchResult> {
  if (!order.price) {
    throw new Error("Limit order requires price");
  }
  
  const oppositeSide = order.side === 'BUY' ? book.sellOrders : book.buyOrders;
  
  // Check if we can match
  if (oppositeSide.length === 0) {
    // No matching orders - add to book
    addOrderToBook(order, book);
    return {
      matched: false,
      filledAmount: 0,
      executionPrice: 0,
      tradeId: '',
      settlementData: {
        assetIn: { symbol: '', amount: 0 },
        assetOut: { symbol: '', amount: 0 },
        fees: { tradeFee: 0, iGas: 0, iTax: 0 }
      }
    };
  }
  
  const bestOpposite = oppositeSide[0];
  const bestPrice = bestOpposite.order.price || 0;
  
  // Check price compatibility
  const canMatch = order.side === 'BUY'
    ? order.price >= bestPrice  // BUY: willing to pay at least best sell price
    : order.price <= bestPrice; // SELL: willing to accept at most best buy price
  
  if (!canMatch) {
    // Price not acceptable - add to book
    addOrderToBook(order, book);
    return {
      matched: false,
      filledAmount: 0,
      executionPrice: 0,
      tradeId: '',
      settlementData: {
        assetIn: { symbol: '', amount: 0 },
        assetOut: { symbol: '', amount: 0 },
        fees: { tradeFee: 0, iGas: 0, iTax: 0 }
      }
    };
  }
  
  // Can match - use market order logic
  return matchMarketOrder(order, book);
}

