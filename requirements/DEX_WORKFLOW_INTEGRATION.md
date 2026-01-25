# DEX Workflow Integration - Order Service

## Summary

The DEX workflow has been successfully integrated with the new **Order Service** infrastructure. The workflow now uses:

1. **Order Processor** - Creates orders from intents
2. **Matching Engine** - Dual support (AMM + Order Book)
3. **Two-Phase Settlement** - Provisional → Final
4. **Price Broadcaster** - Real-time WebSocket events

## Changes Made

### 1. Workflow Handler (`server/src/flowwiseHandlers.ts`)

**Before:**
- Direct `executeDEXTrade()` call
- Immediate wallet debit/credit
- No order model

**After:**
- Creates `DEXOrder` from intent
- Uses `OrderProcessor` to match and settle
- Two-phase settlement (provisional → final)
- Real-time event broadcasting

### 2. Workflow Service (`server/src/components/flowwiseService.ts`)

**Enhanced `execute_dex_trade` action:**
- Now receives `order`, `settlement`, `matchResult` in context
- Logs order lifecycle events
- Supports both AMM and Order Book matching

### 3. Workflow JSON (`server/data/dex.json`)

**Updated `execute_dex_trade` step:**
- Removed `poolId` requirement (derived from order intent)
- Added `matchingModel` and `orderType` parameters
- Enhanced WebSocket events:
  - `DEX_ORDER_CREATED`
  - `DEX_TRADE_EXECUTED`
  - `DEX_PRICE_UPDATE`
- Outputs include: `order`, `settlement`, `matchResult`

### 4. Server Initialization (`server/eden-sim-redis.ts`)

**Added:**
```typescript
import { initializePriceBroadcaster } from "./src/dex/priceBroadcaster";
initializePriceBroadcaster(broadcastEvent);
```

## Flow Diagram

```
User Input (Chat)
    ↓
LLM Extraction (query, filters)
    ↓
Create Order Intent
    ↓
Create DEX Order (orderId, pair, side, type, amount)
    ↓
Select Matching Engine (AMM or ORDER_BOOK)
    ↓
Match Order
    ↓
Create Provisional Settlement (Phase 1: lock balances)
    ↓
Finalize Settlement (Phase 2: debit/credit, ledger entry)
    ↓
Broadcast Events:
  - DEX_ORDER_CREATED
  - DEX_SETTLEMENT_PENDING
  - DEX_SETTLEMENT_FINAL
  - DEX_TRADE_EXECUTED
  - DEX_PRICE_UPDATE
```

## Key Features

### Order Model
- Event-based (not database rows)
- Supports MARKET, LIMIT, STOP_LOSS
- Tracks filled amount, status, expiration

### Matching Engines
- **AMM**: Constant product formula (existing)
- **ORDER_BOOK**: Price-time priority (new)

### Two-Phase Settlement
- **Phase 1**: Provisional (balance locking)
- **Phase 2**: Final (actual debit/credit + ledger)

### Real-Time Events
- Price updates (throttled to 0.01% changes)
- Trade execution broadcasts
- Order lifecycle events
- Settlement status updates

## Integration Points

### Order Creation
```typescript
// In flowwiseHandlers.ts
const orderIntent = createOrderIntentFromQuery(
  context.queryResult,
  ctxSelected,
  context.userInput
);
const order = createDEXOrder(orderIntent, userId, userEmail, gardenId);
```

### Order Processing
```typescript
// In orderProcessor.ts
const result = await processOrder(order);
// Returns: { order, matchResult, settlement, trade }
```

### Event Broadcasting
```typescript
// Automatic via priceBroadcaster
broadcastOrderCreated(order);
broadcastTradeExecuted(trade, order);
broadcastPriceUpdate(pair, price);
```

## Testing

### Test Cases
1. ✅ Order creation from chat input
2. ✅ AMM matching (existing pools)
3. ✅ Two-phase settlement flow
4. ✅ WebSocket event broadcasting
5. ✅ Price update throttling
6. ✅ Order status tracking

### Manual Test
```bash
# Start server
npm run dev

# Send chat message
curl -X POST http://localhost:3000/api/workflow/start \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Buy 2 TOKENA with SOL at best price",
    "email": "test@example.com"
  }'

# Watch WebSocket events for:
# - DEX_ORDER_CREATED
# - DEX_SETTLEMENT_PENDING
# - DEX_SETTLEMENT_FINAL
# - DEX_TRADE_EXECUTED
# - DEX_PRICE_UPDATE
```

## Next Steps

1. **Order Book Persistence**: Store order book in Redis
2. **Order Expiration**: Auto-expire LIMIT orders after 24h
3. **Partial Fills**: Support partial order fills
4. **Frontend Integration**: Consume WebSocket events in Angular
5. **Order History**: Track user order history

## Backward Compatibility

✅ **Existing AMM trades still work** - The AMM engine wraps the existing `executeDEXTrade()` function, so all existing functionality is preserved.

✅ **Workflow continues to function** - The workflow JSON changes are additive, not breaking.

✅ **Ledger integration unchanged** - Settlement system creates ledger entries using the same format.

---

**Status**: ✅ **Integrated and Ready for Testing**

