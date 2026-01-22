# Real-Time DEX Trading System Architecture

## CTO-to-CTO Implementation Plan

**Status**: Ready for implementation  
**Priority**: High  
**Complexity**: Medium  
**Dependencies**: Existing Eden infrastructure (Ledger, WebSocket, Wallet, Workflow)

---

## Executive Summary

Eden already has **80% of DEX infrastructure**:
- ✅ AMM pools with constant product formula
- ✅ Wallet integration
- ✅ Ledger settlement
- ✅ Workflow orchestration
- ✅ WebSocket infrastructure

**What's missing** (the critical 20%):
1. **Order Model** (events, not database rows)
2. **Order Book Matching Engine** (optional, alongside AMM)
3. **Two-Phase Settlement** (provisional → final)
4. **Real-Time Price Events** (WebSocket broadcasts)
5. **Formal DEX Event Spec** (type-safe event system)

---

## 1. Order Model (Canonical)

### Order Object

```typescript
// server/src/types.ts
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
  createdAt: number;           // Unix timestamp
  gardenId: string;            // "Garden-DEX-T1"
  matchingModel: 'AMM' | 'ORDER_BOOK'; // Which matching engine to use
  metadata?: {
    originalIntent?: string;    // Original chat input
    workflowExecutionId?: string;
    [key: string]: any;
  };
}
```

### Order Event (WebSocket)

```typescript
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
```

---

## 2. Matching Engine Architecture

### Dual Engine Support

Eden supports **both** AMM and Order Book:

```typescript
// server/src/dex/matchingEngine.ts
export interface MatchingEngine {
  name: 'AMM' | 'ORDER_BOOK';
  matchOrder(order: DEXOrder, pool?: TokenPool): Promise<MatchResult>;
  getPrice(pair: string): Promise<number>;
  canHandle(order: DEXOrder): boolean;
}

export interface MatchResult {
  matched: boolean;
  filledAmount: number;
  executionPrice: number;
  tradeId: string;
  settlementData: SettlementData;
}
```

### AMM Engine (Existing - Enhanced)

```typescript
// Current: server/src/dex.ts
// Enhancement: Wrap in MatchingEngine interface
export class AMMEngine implements MatchingEngine {
  name = 'AMM' as const;
  
  async matchOrder(order: DEXOrder, pool: TokenPool): Promise<MatchResult> {
    // Use existing executeDEXTrade logic
    // Return structured MatchResult
  }
  
  canHandle(order: DEXOrder): boolean {
    return order.matchingModel === 'AMM' || !order.matchingModel;
  }
}
```

### Order Book Engine (New)

```typescript
// server/src/dex/orderBook.ts
export class OrderBookEngine implements MatchingEngine {
  name = 'ORDER_BOOK' as const;
  private orderBooks: Map<string, OrderBook> = new Map();
  
  async matchOrder(order: DEXOrder): Promise<MatchResult> {
    const book = this.getOrCreateOrderBook(order.pair);
    
    if (order.type === 'MARKET') {
      return this.matchMarketOrder(order, book);
    } else if (order.type === 'LIMIT') {
      return this.matchLimitOrder(order, book);
    }
    
    throw new Error(`Unsupported order type: ${order.type}`);
  }
  
  private matchLimitOrder(order: DEXOrder, book: OrderBook): MatchResult {
    // Price-time priority matching
    // Max price heap for BUY, min price heap for SELL
    // Partial fills supported
  }
}

interface OrderBook {
  pair: string;
  buyOrders: PriorityQueue<DEXOrder>;  // Max heap by price, then time
  sellOrders: PriorityQueue<DEXOrder>; // Min heap by price, then time
  lastPrice: number;
}
```

---

## 3. Two-Phase Settlement

### Phase 1: Provisional Settlement

```typescript
// server/src/dex/settlement.ts
export interface ProvisionalSettlement {
  settlementId: string;
  orderId: string;
  tradeId: string;
  userId: string;
  pair: string;
  amount: number;
  price: number;
  lockedBalances: {
    assetIn: { symbol: string; amount: number };
    assetOut: { symbol: string; amount: number };
  };
  status: 'PROVISIONAL';
  createdAt: number;
  expiresAt: number; // Auto-expire after 30 seconds if not finalized
}

export async function createProvisionalSettlement(
  matchResult: MatchResult,
  order: DEXOrder
): Promise<ProvisionalSettlement> {
  // 1. Lock balances (don't debit yet)
  // 2. Create provisional settlement record
  // 3. Emit DEX_SETTLEMENT_PENDING event
  // 4. Return settlement ID
}
```

### Phase 2: Final Settlement

```typescript
export async function finalizeSettlement(
  settlementId: string
): Promise<LedgerEntry> {
  // 1. Verify provisional settlement exists and not expired
  // 2. Debit/credit actual balances
  // 3. Create ledger entry
  // 4. Update pool reserves (if AMM)
  // 5. Emit DEX_SETTLEMENT_FINAL event
  // 6. Clean up provisional settlement
}
```

### Settlement Flow

```
Order Matched
    ↓
Provisional Settlement (lock balances)
    ↓
[30 second window]
    ↓
Final Settlement (debit/credit, ledger entry)
    ↓
WebSocket Broadcast (DEX_TRADE_EXECUTED)
```

---

## 4. Real-Time Price Updates

### WebSocket Event Broadcasting

```typescript
// server/src/dex/priceBroadcaster.ts
export class PriceBroadcaster {
  private broadcastEvent: (event: any) => void;
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  
  constructor(broadcastFn: (event: any) => void) {
    this.broadcastEvent = broadcastFn;
  }
  
  broadcastPriceUpdate(pair: string, price: number): void {
    const cached = this.priceCache.get(pair);
    // Only broadcast if price changed by > 0.01% (reduce noise)
    if (!cached || Math.abs(price - cached.price) / cached.price > 0.0001) {
      this.broadcastEvent({
        type: 'DEX_PRICE_UPDATE',
        timestamp: Date.now(),
        pair,
        price,
        data: { pair, price }
      });
      this.priceCache.set(pair, { price, timestamp: Date.now() });
    }
  }
  
  broadcastTradeExecuted(trade: DEXTrade, order: DEXOrder): void {
    this.broadcastEvent({
      type: 'DEX_TRADE_EXECUTED',
      timestamp: Date.now(),
      tradeId: trade.tradeId,
      orderId: order.orderId,
      pair: order.pair,
      price: trade.price,
      amount: trade.tokenAmount,
      data: {
        trade,
        order: {
          orderId: order.orderId,
          side: order.side,
          type: order.type
        }
      }
    });
    
    // Also broadcast price update
    this.broadcastPriceUpdate(order.pair, trade.price);
  }
}
```

---

## 5. DEX Event Spec v1

### Event Types

```typescript
// server/src/dex/events.ts
export const DEX_EVENT_TYPES = {
  // Order Lifecycle
  ORDER_CREATED: 'DEX_ORDER_CREATED',
  ORDER_FILLED: 'DEX_ORDER_FILLED',
  ORDER_PARTIAL: 'DEX_ORDER_PARTIAL',
  ORDER_CANCELLED: 'DEX_ORDER_CANCELLED',
  ORDER_EXPIRED: 'DEX_ORDER_EXPIRED',
  
  // Trade Execution
  TRADE_EXECUTED: 'DEX_TRADE_EXECUTED',
  
  // Price Updates
  PRICE_UPDATE: 'DEX_PRICE_UPDATE',
  
  // Settlement
  SETTLEMENT_PENDING: 'DEX_SETTLEMENT_PENDING',
  SETTLEMENT_FINAL: 'DEX_SETTLEMENT_FINAL',
  
  // Pool Updates
  POOL_LIQUIDITY_ADDED: 'DEX_POOL_LIQUIDITY_ADDED',
  POOL_LIQUIDITY_REMOVED: 'DEX_POOL_LIQUIDITY_REMOVED',
} as const;
```

### Event Payloads

```typescript
export interface DEXOrderCreatedEvent {
  type: 'DEX_ORDER_CREATED';
  timestamp: number;
  orderId: string;
  pair: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  amount: number;
  price?: number;
  data: { order: DEXOrder };
}

export interface DEXTradeExecutedEvent {
  type: 'DEX_TRADE_EXECUTED';
  timestamp: number;
  tradeId: string;
  orderId: string;
  pair: string;
  price: number;
  amount: number;
  side: 'BUY' | 'SELL';
  data: {
    trade: DEXTrade;
    order: Partial<DEXOrder>;
  };
}
```

---

## 6. Integration Points

### Chat → Order Intent

```typescript
// server/src/components/flowwiseService.ts (enhancement)
case "llm_extract_query":
  // ... existing code ...
  
  // NEW: If serviceType is "dex", create DEX order intent
  if (context.serviceType === 'dex' && context.queryResult) {
    const orderIntent = createDEXOrderIntent(
      context.userInput,
      context.queryResult,
      context.user
    );
    context.dexOrderIntent = orderIntent;
  }
```

### Workflow → Order Creation

```typescript
// server/data/dex.json (workflow enhancement)
{
  "stepId": "create_dex_order",
  "component": "dex-garden",
  "actions": [
    {
      "type": "create_dex_order",
      "orderIntent": "{{dexOrderIntent}}",
      "matchingModel": "AMM" // or "ORDER_BOOK"
    }
  ]
}
```

### Order → Matching → Settlement

```typescript
// server/src/dex/orderProcessor.ts
export class OrderProcessor {
  async processOrder(order: DEXOrder): Promise<void> {
    // 1. Validate order
    // 2. Select matching engine
    // 3. Match order
    // 4. Create provisional settlement
    // 5. Finalize settlement (after delay)
    // 6. Broadcast events
  }
}
```

---

## 7. Implementation Checklist

### Phase 1: Core Infrastructure (Week 1)
- [ ] Define `DEXOrder` type in `server/src/types.ts`
- [ ] Create `DEXOrderEvent` types
- [ ] Implement `MatchingEngine` interface
- [ ] Enhance existing AMM engine to implement interface
- [ ] Create `PriceBroadcaster` class
- [ ] Add WebSocket event broadcasting hooks

### Phase 2: Order Book (Week 2)
- [ ] Implement `OrderBookEngine` class
- [ ] Create priority queue for buy/sell orders
- [ ] Implement price-time priority matching
- [ ] Add partial fill support
- [ ] Add order expiration handling

### Phase 3: Two-Phase Settlement (Week 2-3)
- [ ] Create `ProvisionalSettlement` type
- [ ] Implement balance locking mechanism
- [ ] Create `finalizeSettlement()` function
- [ ] Add settlement expiration (30s timeout)
- [ ] Integrate with existing ledger system

### Phase 4: Real-Time Events (Week 3)
- [ ] Integrate `PriceBroadcaster` with WebSocket service
- [ ] Add price update throttling (0.01% threshold)
- [ ] Broadcast trade execution events
- [ ] Broadcast order lifecycle events
- [ ] Update frontend to consume events

### Phase 5: Chat Integration (Week 3-4)
- [ ] Enhance LLM extraction for order intents
- [ ] Create `createDEXOrderIntent()` function
- [ ] Update workflow to handle order creation
- [ ] Add order confirmation in chat
- [ ] Add order status updates in chat

---

## 8. Security & Governance

### ROOT CA Controls

```typescript
// server/src/dex/governance.ts
export interface DEXGovernance {
  enabledPairs: string[];           // ["APPLE/SOL", "TOKENA/SOL"]
  disabledPairs: string[];          // Emergency pause
  maxOrderSize: Record<string, number>; // Per-pair limits
  minOrderSize: Record<string, number>;
  allowedMatchingModels: ('AMM' | 'ORDER_BOOK')[];
  leverageEnabled: boolean;         // Future: margin trading
  frontRunningProtection: boolean;  // MEV protection
}

export function canCreateOrder(
  order: DEXOrder,
  governance: DEXGovernance
): { allowed: boolean; reason?: string } {
  // Check pair enabled
  // Check order size limits
  // Check matching model allowed
  // Check user permissions
}
```

### Priest Oversight

```typescript
// Priests can:
// - Approve new liquidity pools
// - Monitor abnormal trades (volume spikes, price manipulation)
// - Freeze suspicious wallets
// - Certify DEX Gardens
// - Review settlement disputes
```

---

## 9. Frontend Integration

### Real-Time Price Display

```typescript
// frontend/src/app/services/websocket.service.ts
onDEXPriceUpdate(event: DEXPriceUpdateEvent): void {
  // Update price in UI
  // Update order book display (if ORDER_BOOK mode)
  // Update chart data
}

onDEXTradeExecuted(event: DEXTradeExecutedEvent): void {
  // Show trade confirmation
  // Update user balance
  // Update order status
  // Add to trade history
}
```

### Order Management UI

```typescript
// frontend/src/app/components/dex-order-panel.component.ts
interface OrderDisplay {
  orderId: string;
  pair: string;
  side: 'BUY' | 'SELL';
  amount: number;
  filledAmount: number;
  price?: number;
  status: string;
  createdAt: Date;
}
```

---

## 10. Testing Strategy

### Unit Tests
- Matching engine logic (AMM and Order Book)
- Price calculation accuracy
- Settlement two-phase correctness
- Order expiration handling

### Integration Tests
- Chat → Order → Match → Settle flow
- WebSocket event broadcasting
- Balance locking/unlocking
- Ledger entry creation

### Load Tests
- Order book performance (1000+ orders)
- Price update frequency (throttling)
- Settlement throughput

---

## 11. Migration Path

### Backward Compatibility

Existing AMM trades continue to work:
- Old `executeDEXTrade()` → Wrapped in `AMMEngine`
- Old workflow → Enhanced with order events
- Old ledger entries → Compatible with new settlement

### Gradual Rollout

1. **Week 1**: Deploy order model + events (no breaking changes)
2. **Week 2**: Enable Order Book for test pairs
3. **Week 3**: Enable two-phase settlement
4. **Week 4**: Full rollout + frontend updates

---

## 12. CTO Verdict

**You are 80% there. The remaining 20% is:**

1. ✅ **Order Model** (2 days) - Type definitions + validation
2. ✅ **Order Book Engine** (3 days) - Priority queue + matching logic
3. ✅ **Two-Phase Settlement** (2 days) - Balance locking + finalization
4. ✅ **Real-Time Events** (1 day) - WebSocket integration
5. ✅ **Event Spec** (1 day) - Type-safe event system

**Total: ~2 weeks of focused development**

**Next Steps:**
1. Review this architecture
2. Approve implementation plan
3. Start with Phase 1 (Core Infrastructure)
4. Iterate based on feedback

**Ready to proceed?** 🚀

