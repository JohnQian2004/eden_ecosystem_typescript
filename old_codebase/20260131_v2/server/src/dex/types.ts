/**
 * DEX Order and Event Types
 * Real-time DEX trading system type definitions
 */

import type { DEXTrade, TokenPool } from "../types";

/**
 * DEX Order - Canonical order object
 * Orders are events, not database rows
 */
export interface DEXOrder {
  orderId: string;              // "ord_" + crypto.randomUUID()
  userId: string;               // User ID (e.g., "u_456")
  userEmail: string;            // User email
  pair: string;                 // "APPLE/SOL", "TOKENA/SOL"
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS';
  price?: number;               // Required for LIMIT orders
  amount: number;               // Token amount
  filledAmount: number;         // Amount filled so far (0 initially)
  status: 'PENDING' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
  expiresAt?: number;           // Unix timestamp (optional)
  createdAt: number;            // Unix timestamp
  gardenId: string;             // "Garden-DEX-T1"
  matchingModel: 'AMM' | 'ORDER_BOOK'; // Which matching engine to use
  metadata?: {
    originalIntent?: string;    // Original chat input
    workflowExecutionId?: string;
    [key: string]: any;
  };
}

/**
 * DEX Order Event - WebSocket broadcast events
 */
export interface DEXOrderEvent {
  type: 'DEX_ORDER_CREATED' | 'DEX_ORDER_FILLED' | 'DEX_ORDER_PARTIAL' | 
        'DEX_ORDER_CANCELLED' | 'DEX_ORDER_EXPIRED' | 'DEX_TRADE_EXECUTED' |
        'DEX_PRICE_UPDATE' | 'DEX_SETTLEMENT_PENDING' | 'DEX_SETTLEMENT_FINAL';
  timestamp: number;
  orderId?: string;
  tradeId?: string;
  pair: string;
  price?: number;
  amount?: number;
  data: any;                    // Event-specific data
}

/**
 * Order Intent - Created from chat/UI before order creation
 */
export interface DEXOrderIntent {
  pair: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  amount: number;
  price?: number;
  matchingModel?: 'AMM' | 'ORDER_BOOK';
  originalInput: string;       // Original user input
}

/**
 * Match Result - Result of matching engine execution
 */
export interface MatchResult {
  matched: boolean;
  filledAmount: number;
  executionPrice: number;
  tradeId: string;
  settlementData: SettlementData;
  remainingAmount?: number;     // For partial fills
}

/**
 * Settlement Data - Data needed for settlement
 */
export interface SettlementData {
  assetIn: { symbol: string; amount: number };
  assetOut: { symbol: string; amount: number };
  fees: {
    tradeFee: number;
    iGas: number;
    iTax: number;
  };
  priceImpact?: number;
}

/**
 * Provisional Settlement - Phase 1 (balance locking)
 */
export interface ProvisionalSettlement {
  settlementId: string;
  orderId: string;
  tradeId: string;
  userId: string;
  userEmail: string;
  pair: string;
  amount: number;
  price: number;
  lockedBalances: {
    assetIn: { symbol: string; amount: number };
    assetOut: { symbol: string; amount: number };
  };
  status: 'PROVISIONAL';
  createdAt: number;
  expiresAt: number;            // Auto-expire after 30 seconds if not finalized
}

/**
 * DEX Governance - ROOT CA controls
 */
export interface DEXGovernance {
  enabledPairs: string[];           // ["APPLE/SOL", "TOKENA/SOL"]
  disabledPairs: string[];           // Emergency pause
  maxOrderSize: Record<string, number>; // Per-pair limits
  minOrderSize: Record<string, number>;
  allowedMatchingModels: ('AMM' | 'ORDER_BOOK')[];
  leverageEnabled: boolean;         // Future: margin trading
  frontRunningProtection: boolean;  // MEV protection
}

/**
 * Order Book Entry - For ORDER_BOOK matching
 */
export interface OrderBookEntry {
  order: DEXOrder;
  priority: number;              // Price-time priority score
}

/**
 * Order Book - In-memory order book for a trading pair
 */
export interface OrderBook {
  pair: string;
  buyOrders: OrderBookEntry[];   // Max heap by price, then time
  sellOrders: OrderBookEntry[];  // Min heap by price, then time
  lastPrice: number;
  lastUpdate: number;
}

