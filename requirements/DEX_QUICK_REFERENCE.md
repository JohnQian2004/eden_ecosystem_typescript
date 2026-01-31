# DEX Trade Quick Reference

## Key Functions

### Initialize DEX
```typescript
import { initializeDEX, initializeDEXPools } from "./src/dex";

// Initialize module with broadcast function
initializeDEX(broadcastEvent);

// Initialize pools (assigns to token gardens)
initializeDEXPools();
```

### Execute Trade
```typescript
import { executeDEXTrade } from "./src/dex";

const trade = executeDEXTrade(
  poolId: string,           // e.g., "pool-solana-tokena"
  action: 'BUY' | 'SELL',   // Trade direction
  tokenAmount: number,      // Amount of tokens
  userEmail: string         // User identifier
);

// Returns DEXTrade object with:
// - tradeId, poolId, tokenSymbol, baseToken
// - action, tokenAmount, baseAmount
// - price, priceImpact, iTax
// - timestamp, trader
```

### Query Pools
```typescript
import { queryDEXPoolAPI } from "./src/serviceProvider";

const listings = await queryDEXPoolAPI(
  provider: ServiceProvider,
  filters?: {
    tokenSymbol?: string;   // e.g., "TOKENA"
    baseToken?: string;     // e.g., "SOL"
    action?: 'BUY' | 'SELL'
  }
);

// Returns TokenListing[] with available pools
```

## Formulas

### BUY Calculation
```
baseAmount = (baseReserve * tokenAmount) / (tokenReserve - tokenAmount)
baseAmount = baseAmount * (1 + 0.00001)  // Price impact
```

### SELL Calculation
```
baseAmount = (baseReserve * tokenAmount) / (tokenReserve + tokenAmount)
baseAmount = baseAmount * (1 - 0.00001)  // Price impact
```

### iTax Distribution
```
iTax = baseAmount * 0.000005  // 0.0005%
ROOT_CA:   iTax * 0.4  // 40%
Garden:    iTax * 0.3  // 30%
Trader:    iTax * 0.3  // 30% (rebate)
```

## Workflow Steps

### 1. LLM Resolution
```json
{
  "type": "llm_extract_query",
  "input": "{{input}}"
},
{
  "type": "query_dex_pools",
  "tokenSymbol": "{{queryResult.query.filters.tokenSymbol}}",
  "baseToken": "{{queryResult.query.filters.baseToken}}",
  "action": "{{queryResult.query.filters.action}}"
},
{
  "type": "llm_format_response",
  "listings": "{{listings}}",
  "userQuery": "{{input}}"
}
```

**Outputs**:
- `llmResponse.selectedListing` - Selected pool
- `action` - BUY or SELL
- `tokenAmount` - Amount to trade

### 2. Execute Trade
```json
{
  "type": "check_balance",
  "email": "{{user.email}}",
  "required": "{{totalCost}}",
  "action": "{{action}}"
},
{
  "type": "execute_dex_trade",
  "poolId": "{{selectedListing.poolId}}",
  "action": "{{action}}",
  "tokenAmount": "{{tokenAmount}}",
  "userEmail": "{{user.email}}"
}
```

**Outputs**:
- `trade` - DEXTrade object
- `updatedBalance` - User's new balance

### 3. Ledger Entry
```json
{
  "type": "create_snapshot",
  "payer": "{{user.email}}",
  "amount": "{{trade.baseAmount}}",
  "providerId": "{{selectedListing.providerId}}"
},
{
  "type": "add_ledger_entry",
  "snapshot": "{{snapshot}}",
  "serviceType": "dex",
  "iGasCost": "{{iGasCost}}",
  "payerId": "{{user.email}}",
  "merchantName": "{{selectedListing.providerName}}",
  "providerUuid": "{{providerUuid}}",
  "bookingDetails": {
    "tokenSymbol": "{{tokenSymbol}}",
    "baseToken": "{{baseToken}}",
    "action": "{{action}}",
    "tokenAmount": "{{tokenAmount}}",
    "baseAmount": "{{trade.baseAmount}}",
    "price": "{{trade.price}}",
    "iTax": "{{trade.iTax}}"
  }
}
```

## Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{action}}` | Trade direction | `"BUY"` or `"SELL"` |
| `{{tokenAmount}}` | Token quantity | `100` |
| `{{tokenSymbol}}` | Token symbol | `"TOKENA"` |
| `{{baseToken}}` | Base currency | `"SOL"` |
| `{{selectedListing.poolId}}` | Pool identifier | `"pool-solana-tokena"` |
| `{{trade.baseAmount}}` | Base token amount | `0.1` |
| `{{trade.price}}` | Execution price | `0.001` |
| `{{trade.iTax}}` | Transaction fee | `0.0000005` |
| `{{user.email}}` | User email | `"user@example.com"` |
| `{{user.balance}}` | User balance | `1.0` |

## Constants

```typescript
PRICE_IMPACT_PER_TRADE = 0.00001;  // 0.001%
ITAX_RATE = 0.000005;              // 0.0005%

ITAX_DISTRIBUTION = {
  rootCA: 0.4,    // 40% to ROOT CA
  indexer: 0.3,   // 30% to Garden
  trader: 0.3     // 30% to Trader (rebate)
};
```

## Common Patterns

### Check Balance Before Trade
```typescript
const totalCost = trade.baseAmount + llmResponse.iGasCost;
if (user.balance < totalCost) {
  throw new Error(`Insufficient balance. Required: ${totalCost}, Available: ${user.balance}`);
}
```

### Extract Action/TokenAmount in Handler
```typescript
case "llm_format_response":
  const llmResponse = await formatFn(...);
  context.llmResponse = llmResponse;
  
  // Extract to context for template variables
  const filters = context.queryResult?.query?.filters || {};
  context.action = filters.action || 'BUY';
  context.tokenAmount = filters.tokenAmount || 1;
  break;
```

### Update User Balance After Trade
```typescript
if (action === 'BUY') {
  user.balance -= trade.baseAmount;
} else {
  user.balance += trade.baseAmount;
}

// Apply trader rebate
const traderRebate = trade.iTax * ITAX_DISTRIBUTION.trader;
user.balance += traderRebate;
```

## Error Handling

### Pool Not Found
```typescript
const pool = DEX_POOLS.get(poolId);
if (!pool) {
  throw new Error(`Pool ${poolId} not found`);
}
```

### Insufficient Balance
```typescript
if (user.balance < totalCost) {
  broadcastEvent({
    type: "insufficient_balance",
    component: "wallet",
    message: `Insufficient balance. Required: ${totalCost}, Available: ${user.balance}`,
    data: { balance: user.balance, required: totalCost }
  });
  throw new Error("Insufficient balance");
}
```

## State Access

```typescript
import { DEX_POOLS, TOKEN_GARDENS, rootCALiquidity } from "./src/state";

// Get all pools
const pools = Array.from(DEX_POOLS.values());

// Get pool by ID
const pool = DEX_POOLS.get("pool-solana-tokena");

// Get token gardens
const gardens = TOKEN_GARDENS;

// Get ROOT CA liquidity
const liquidity = rootCALiquidity;
```

## Workflow Transitions

```json
{
  "from": "llm_resolution",
  "to": "execute_dex_trade",
  "condition": "{{llmResponse.selectedListing}}"
},
{
  "from": "execute_dex_trade",
  "to": "ledger_create_entry",
  "condition": "{{trade}}"
},
{
  "from": "execute_dex_trade",
  "to": "error_handler",
  "condition": "!{{trade}}"
}
```

## File Locations

- **DEX Module**: `server/src/dex.ts`
- **Service Provider**: `server/src/serviceProvider.ts`
- **Workflow Handlers**: `server/src/flowwiseHandlers.ts`
- **Workflow Definition**: `server/data/dex.json`
- **Types**: `server/src/types.ts`
- **State**: `server/src/state.ts`
- **Constants**: `server/src/constants.ts`

## Quick Checklist

- [ ] Initialize DEX pools on startup
- [ ] Extract `action` and `tokenAmount` in `llm_format_response`
- [ ] Check balance before executing trade
- [ ] Validate pool exists
- [ ] Calculate trade amounts correctly (BUY vs SELL)
- [ ] Apply price impact
- [ ] Distribute iTax (40/30/30)
- [ ] Update pool reserves
- [ ] Create ledger entry with all details
- [ ] Broadcast events for user feedback
- [ ] Handle errors with workflow transitions

