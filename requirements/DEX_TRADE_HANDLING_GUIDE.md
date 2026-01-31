# DEX Trade Handling Guide

## Overview

This guide explains how Decentralized Exchange (DEX) trades are handled in the Eden ecosystem. DEX trades allow users to swap tokens (like TOKENA, TOKENB) for base tokens (like SOL) and vice versa.

## Table of Contents

1. [DEX Architecture](#dex-architecture)
2. [Complete Trade Flow](#complete-trade-flow)
3. [Core Components](#core-components)
4. [Workflow System](#workflow-system)
5. [Trade Execution Logic](#trade-execution-logic)
6. [Balance Management](#balance-management)
7. [Ledger Integration](#ledger-integration)
8. [Examples](#examples)

---

## DEX Architecture

### Key Concepts

1. **Token Pools**: Liquidity pools that hold reserves of tokens and base tokens
2. **Token Gardens**: Specialized indexers that provide DEX services
3. **Constant Product Formula**: `x * y = k` (used for price calculation)
4. **iTax**: Transaction fee (0.0005% = 0.000005) distributed to ROOT CA, Garden, and Trader
5. **Price Impact**: 0.001% per trade that affects the pool price

### Data Structures

```typescript
// Token Pool - Represents a liquidity pool
type TokenPool = {
  poolId: string;              // e.g., "pool-solana-tokena"
  tokenSymbol: string;         // e.g., "TOKENA"
  tokenName: string;          // e.g., "Token A"
  baseToken: string;          // e.g., "SOL"
  poolLiquidity: number;      // Total pool value in baseToken
  tokenReserve: number;       // Amount of tokens in pool
  baseReserve: number;        // Amount of baseToken in pool
  price: number;             // Current price (baseReserve / tokenReserve)
  bond: number;              // Provider bond amount
  gardenId: string;          // Which token garden owns this pool
  createdAt: number;        // Timestamp
  totalVolume: number;       // Total trading volume
  totalTrades: number;       // Total number of trades
};

// Token Listing - What users see when querying pools
type TokenListing = {
  id: string;
  providerId: string;        // e.g., "dex-pool-tokena"
  providerName: string;      // e.g., "DEX Pool TOKENA"
  poolId: string;            // References TokenPool
  tokenSymbol: string;
  baseToken: string;
  price: number;             // Current pool price
  liquidity: number;          // Pool liquidity
  gardenId: string;          // Token garden ID
};

// DEX Trade - Result of executing a trade
type DEXTrade = {
  tradeId: string;           // UUID
  poolId: string;
  tokenSymbol: string;
  baseToken: string;
  action: 'BUY' | 'SELL';
  tokenAmount: number;       // Amount of tokens traded
  baseAmount: number;        // Amount of baseToken traded
  price: number;             // Execution price
  priceImpact: number;       // Price impact (0.001%)
  iTax: number;             // Transaction fee
  timestamp: number;
  trader: string;            // User email
};
```

---

## Complete Trade Flow

### High-Level Flow

```
User Input → LLM Extraction → Query Pools → Format Response → 
Execute Trade → Create Ledger Entry → Complete Trade → Summary
```

### Detailed Steps

#### 1. **User Input** (`user_input` step)
- User sends message like: "I want to buy 100 TOKENA tokens"
- System validates input and email
- Broadcasts `user_input` event

#### 2. **LLM Resolution** (`llm_resolution` step)
- **Extract Query**: LLM extracts:
  - `serviceType: "dex"`
  - `filters.tokenSymbol: "TOKENA"`
  - `filters.baseToken: "SOL"`
  - `filters.action: "BUY"`
  - `filters.tokenAmount: 100`
  
- **Query DEX Pools**: 
  - Finds pools matching tokenSymbol/baseToken
  - Returns available pools as `TokenListing[]`
  
- **Format Response**: LLM formats response and selects best pool
  - Sets `llmResponse.selectedListing` to chosen pool
  - Calculates `iGasCost` for LLM operations
  - **IMPORTANT**: Extracts `action` and `tokenAmount` to context

#### 3. **Execute DEX Trade** (`execute_dex_trade` step)
- **Check Balance**: Validates user has sufficient funds
  - For BUY: Need `baseAmount + iGasCost` in baseToken
  - For SELL: Need `tokenAmount` in tokens
  
- **Execute Trade**: Calls `executeDEXTrade()`
  - Calculates trade amounts using constant product formula
  - Updates pool reserves
  - Calculates iTax and distributes it
  - Returns `DEXTrade` object

#### 4. **Ledger Entry** (`ledger_create_entry` step)
- **Create Snapshot**: Transaction snapshot for audit
- **Add Ledger Entry**: Records trade in ledger
  - Service type: `"dex"`
  - Includes trade details in `bookingDetails`

#### 5. **Complete Trade** (`complete_trade` step)
- **Complete Booking**: Marks ledger entry as completed
- **Persist Snapshot**: Saves snapshot to Redis
- **Stream to Indexers**: Broadcasts to all gardens
- **Deliver Webhook**: Notifies provider (if registered)

#### 6. **Summary** (`summary` step)
- Generates trade summary with all details
- Broadcasts final summary event

---

## Core Components

### 1. DEX Module (`server/src/dex.ts`)

#### `initializeDEXPools()`
Initializes pools and assigns them to token gardens:

```typescript
export function initializeDEXPools(): void {
  for (let i = 0; i < TOKEN_GARDENS.length; i++) {
    const tokenGarden = TOKEN_GARDENS[i];
    const tokenSymbol = `TOKEN${String.fromCharCode(65 + i)}`; // TOKENA, TOKENB...
    const poolId = `pool-solana-${tokenSymbol.toLowerCase()}`;
    
    const pool: TokenPool = {
      poolId,
      tokenSymbol,
      baseToken: "SOL",
      poolLiquidity: 100 - (i * 10),  // Decreasing: 100, 90, 80...
      tokenReserve: 100000 - (i * 10000),
      baseReserve: 100 - (i * 10),
      price: 0.001,
      gardenId: tokenGarden.id,
      // ... other fields
    };
    
    DEX_POOLS.set(poolId, pool);
  }
}
```

#### `executeDEXTrade()`
Core trade execution logic:

```typescript
export function executeDEXTrade(
  poolId: string,
  action: 'BUY' | 'SELL',
  tokenAmount: number,
  userEmail: string
): DEXTrade {
  const pool = DEX_POOLS.get(poolId);
  if (!pool) throw new Error(`Pool ${poolId} not found`);

  let baseAmount: number;
  let newPrice: number;
  
  if (action === 'BUY') {
    // User buys tokens with baseToken
    // Formula: baseAmount = (baseReserve * tokenAmount) / (tokenReserve - tokenAmount)
    baseAmount = (pool.baseReserve * tokenAmount) / (pool.tokenReserve - tokenAmount);
    
    // Apply price impact (0.001%)
    baseAmount = baseAmount * (1 + PRICE_IMPACT_PER_TRADE);
    
    // Update reserves
    pool.baseReserve += baseAmount;
    pool.tokenReserve -= tokenAmount;
    
    // Calculate new price
    newPrice = pool.baseReserve / pool.tokenReserve;
    pool.price = newPrice;
    
  } else {
    // SELL: User sells tokens for baseToken
    baseAmount = (pool.baseReserve * tokenAmount) / (pool.tokenReserve + tokenAmount);
    baseAmount = baseAmount * (1 - PRICE_IMPACT_PER_TRADE);
    
    pool.baseReserve -= baseAmount;
    pool.tokenReserve += tokenAmount;
    
    newPrice = pool.baseReserve / pool.tokenReserve;
    pool.price = newPrice;
  }
  
  // Calculate iTax (0.0005%)
  const iTax = baseAmount * ITAX_RATE;
  
  // Distribute iTax: 40% ROOT CA, 30% Garden, 30% Trader
  const iTaxRootCA = iTax * 0.4;
  const iTaxGarden = iTax * 0.3;
  const iTaxTrader = iTax * 0.3;
  
  // Update ROOT CA liquidity
  addRootCALiquidity(iTaxRootCA);
  
  // Create trade record
  const trade: DEXTrade = {
    tradeId: crypto.randomUUID(),
    poolId: pool.poolId,
    tokenSymbol: pool.tokenSymbol,
    baseToken: pool.baseToken,
    action,
    tokenAmount,
    baseAmount,
    price: newPrice,
    priceImpact: PRICE_IMPACT_PER_TRADE,
    iTax,
    timestamp: Date.now(),
    trader: userEmail,
  };
  
  return trade;
}
```

### 2. Service Provider Module (`server/src/serviceProvider.ts`)

#### `queryDEXPoolAPI()`
Queries available DEX pools:

```typescript
export async function queryDEXPoolAPI(
  provider: ServiceProvider,
  filters?: { 
    tokenSymbol?: string; 
    baseToken?: string; 
    action?: 'BUY' | 'SELL' 
  }
): Promise<TokenListing[]> {
  // Find pools matching the provider's gardenId
  const matchingPools = Array.from(DEX_POOLS.values())
    .filter(pool => pool.gardenId === provider.gardenId);
  
  // Filter by tokenSymbol/baseToken if provided
  let filteredPools = matchingPools;
  if (filters?.tokenSymbol) {
    filteredPools = filteredPools.filter(p => 
      p.tokenSymbol === filters.tokenSymbol
    );
  }
  if (filters?.baseToken) {
    filteredPools = filteredPools.filter(p => 
      p.baseToken === filters.baseToken
    );
  }
  
  // Convert to TokenListing format
  return filteredPools.map(pool => ({
    id: pool.poolId,
    providerId: `dex-pool-${pool.tokenSymbol.toLowerCase()}`,
    providerName: `DEX Pool ${pool.tokenSymbol}`,
    poolId: pool.poolId,
    tokenSymbol: pool.tokenSymbol,
    baseToken: pool.baseToken,
    price: pool.price,
    liquidity: pool.poolLiquidity,
    gardenId: pool.gardenId,
  }));
}
```

### 3. Workflow Handlers (`server/src/flowwiseHandlers.ts`)

#### `execute_dex_trade` Handler

```typescript
handlers.set("execute_dex_trade", async (action, context) => {
  const trade = executeDEXTrade(
    action.poolId,
    action.action,
    action.tokenAmount,
    action.userEmail
  );
  return { trade };
});
```

#### `query_dex_pools` Handler

```typescript
handlers.set("query_dex_pools", async (action, context) => {
  const pools = await queryDEXPoolAPI(
    action.tokenSymbol,
    action.baseToken,
    action.action
  );
  return { listings: pools };
});
```

---

## Workflow System

### Workflow Definition (`server/data/dex.json`)

The DEX workflow is defined declaratively in JSON:

```json
{
  "flowwiseWorkflow": {
    "steps": [
      {
        "id": "llm_resolution",
        "actions": [
          { "type": "llm_extract_query" },
          { "type": "query_dex_pools" },
          { "type": "llm_format_response" }
        ],
        "outputs": {
          "action": "{{action}}",
          "tokenAmount": "{{tokenAmount}}"
        }
      },
      {
        "id": "execute_dex_trade",
        "actions": [
          { "type": "check_balance" },
          { "type": "execute_dex_trade" }
        ]
      }
    ],
    "transitions": [
      {
        "from": "llm_resolution",
        "to": "execute_dex_trade",
        "condition": "{{llmResponse.selectedListing}}"
      }
    ]
  }
}
```

### Template Variables

The workflow uses template variables for dynamic values:

- `{{action}}` - BUY or SELL
- `{{tokenAmount}}` - Amount of tokens to trade
- `{{selectedListing.poolId}}` - Selected pool ID
- `{{trade.baseAmount}}` - Base token amount
- `{{user.email}}` - User email
- `{{llmResponse.selectedListing}}` - Selected pool listing

### Context Management

**IMPORTANT**: The `llm_format_response` handler extracts `action` and `tokenAmount`:

```typescript
// In flowwiseService.ts
case "llm_format_response":
  const llmResponse = await formatFn(...);
  context.llmResponse = llmResponse;
  
  // Extract action and tokenAmount from query filters
  const filters = context.queryResult?.query?.filters || {};
  context.action = filters.action || 'BUY';
  context.tokenAmount = filters.tokenAmount || 1;
  break;
```

---

## Trade Execution Logic

### Constant Product Formula

The DEX uses the constant product formula: `x * y = k`

- `x` = baseReserve (baseToken amount)
- `y` = tokenReserve (token amount)
- `k` = constant (product of reserves)

### BUY Calculation

When user wants to BUY `tokenAmount` tokens:

```
Before: (baseReserve, tokenReserve)
After:  (baseReserve + baseAmount, tokenReserve - tokenAmount)

Constant: baseReserve * tokenReserve = (baseReserve + baseAmount) * (tokenReserve - tokenAmount)

Solving for baseAmount:
baseAmount = (baseReserve * tokenAmount) / (tokenReserve - tokenAmount)
```

### SELL Calculation

When user wants to SELL `tokenAmount` tokens:

```
After:  (baseReserve - baseAmount, tokenReserve + tokenAmount)

baseAmount = (baseReserve * tokenAmount) / (tokenReserve + tokenAmount)
```

### Price Impact

Each trade applies a 0.001% price impact:

- **BUY**: `baseAmount = baseAmount * (1 + 0.00001)` (user pays more)
- **SELL**: `baseAmount = baseAmount * (1 - 0.00001)` (user receives less)

### iTax Distribution

Transaction fee (0.0005% = 0.000005) is distributed:

- **40% to ROOT CA**: Added to ROOT CA liquidity pool
- **30% to Garden**: Goes to the token garden that owns the pool
- **30% to Trader**: Rebate back to the user

```typescript
const iTax = baseAmount * ITAX_RATE; // 0.000005
const iTaxRootCA = iTax * 0.4;
const iTaxGarden = iTax * 0.3;
const iTaxTrader = iTax * 0.3; // User gets this as rebate
```

---

## Balance Management

### Balance Checking

Before executing a trade, the system checks:

```typescript
// For BUY trades
const totalCost = trade.baseAmount + llmResponse.iGasCost;
if (user.balance < totalCost) {
  throw new Error(`Insufficient balance. Required: ${totalCost}, Available: ${user.balance}`);
}

// For SELL trades
// Need to check if user has enough tokens (future implementation)
```

### Wallet Updates

After trade execution:

```typescript
if (action === 'BUY') {
  // User pays baseToken, receives tokens
  user.balance -= trade.baseAmount;
  // Note: Tokens are not stored in wallet (future implementation)
  
} else {
  // SELL: User pays tokens, receives baseToken
  user.balance += trade.baseAmount;
}

// Apply trader rebate (30% of iTax)
const traderRebate = trade.iTax * 0.3;
user.balance += traderRebate;
```

### Wallet Service Integration

The wallet service (Redis-backed) is the source of truth:

```typescript
// Sync balance before trade
const currentWalletBalance = await getWalletBalance(user.email);
user.balance = currentWalletBalance;

// After trade, wallet is updated via ledger entry processing
```

---

## Ledger Integration

### Ledger Entry Creation

DEX trades create ledger entries with:

```typescript
const ledgerEntry = addLedgerEntry(
  snapshot,                    // Transaction snapshot
  'dex',                       // Service type
  llmResponse.iGasCost,        // iGas cost
  user.email,                  // Payer ID
  tokenListing.providerName,   // Merchant name
  providerUuid,                // Provider UUID
  {
    // Booking details
    tokenSymbol: tokenListing.tokenSymbol,
    baseToken: tokenListing.baseToken,
    action: action,
    tokenAmount: tokenAmount,
    baseAmount: trade.baseAmount,
    price: trade.price,
    iTax: trade.iTax,
  }
);
```

### Snapshot Creation

```typescript
const snapshot = createSnapshot(
  user.email,              // Payer
  trade.baseAmount,        // Amount
  tokenListing.providerId  // Provider ID
);
```

### Completion Flow

1. **Complete Booking**: Marks ledger entry as completed
2. **Persist Snapshot**: Saves to Redis for audit trail
3. **Stream to Indexers**: Broadcasts to all gardens via Redis Streams
4. **Deliver Webhook**: Notifies provider (if webhook registered)

---

## Examples

### Example 1: Buy 100 TOKENA

**User Input**: "I want to buy 100 TOKENA tokens"

**Flow**:
1. LLM extracts: `{ action: 'BUY', tokenAmount: 100, tokenSymbol: 'TOKENA', baseToken: 'SOL' }`
2. System finds pool: `pool-solana-tokena`
3. Calculates: Need ~0.1 SOL (plus iGas) for 100 TOKENA
4. Checks balance: User has 1.0 SOL ✓
5. Executes trade:
   - User pays: 0.1 SOL + 0.0001 iGas = 0.1001 SOL
   - User receives: 100 TOKENA
   - Pool updates: baseReserve += 0.1, tokenReserve -= 100
6. iTax: 0.0000005 SOL distributed (40% ROOT CA, 30% Garden, 30% Trader rebate)
7. Creates ledger entry and completes trade

### Example 2: Sell 50 TOKENB

**User Input**: "Sell 50 TOKENB for SOL"

**Flow**:
1. LLM extracts: `{ action: 'SELL', tokenAmount: 50, tokenSymbol: 'TOKENB', baseToken: 'SOL' }`
2. System finds pool: `pool-solana-tokenb`
3. Calculates: Will receive ~0.05 SOL for 50 TOKENB
4. Checks balance: User has 50 TOKENB ✓
5. Executes trade:
   - User pays: 50 TOKENB
   - User receives: 0.05 SOL (minus price impact)
   - Pool updates: baseReserve -= 0.05, tokenReserve += 50
6. iTax: 0.00000025 SOL distributed
7. Creates ledger entry and completes trade

### Example 3: Workflow Execution

```typescript
// Workflow context after llm_resolution step
{
  input: "buy 100 TOKENA",
  email: "user@example.com",
  user: { email: "user@example.com", balance: 1.0 },
  queryResult: {
    serviceType: "dex",
    query: {
      filters: {
        action: "BUY",
        tokenAmount: 100,
        tokenSymbol: "TOKENA",
        baseToken: "SOL"
      }
    }
  },
  listings: [/* TokenListing[] */],
  llmResponse: {
    message: "Found TOKENA pool...",
    selectedListing: { poolId: "pool-solana-tokena", ... },
    iGasCost: 0.0001
  },
  action: "BUY",        // Extracted to context
  tokenAmount: 100      // Extracted to context
}

// execute_dex_trade step uses:
// - action: "BUY"
// - tokenAmount: 100
// - selectedListing.poolId: "pool-solana-tokena"
// - user.email: "user@example.com"
```

---

## Key Constants

```typescript
// From constants.ts
PRICE_IMPACT_PER_TRADE = 0.00001;  // 0.001%
ITAX_RATE = 0.000005;              // 0.0005%
ITAX_DISTRIBUTION = {
  rootCA: 0.4,    // 40%
  indexer: 0.3,   // 30% (garden)
  trader: 0.3     // 30% (rebate)
};
```

---

## Common Issues and Solutions

### Issue 1: Template Variables Not Found

**Problem**: `{{action}}` or `{{tokenAmount}}` not in context

**Solution**: Ensure `llm_format_response` handler extracts them:

```typescript
// In flowwiseService.ts
const filters = context.queryResult?.query?.filters || {};
context.action = filters.action || 'BUY';
context.tokenAmount = filters.tokenAmount || 1;
```

### Issue 2: Insufficient Balance

**Problem**: User doesn't have enough baseToken for BUY

**Solution**: Check balance before trade:

```typescript
const totalCost = trade.baseAmount + llmResponse.iGasCost;
if (user.balance < totalCost) {
  throw new Error(`Insufficient balance`);
}
```

### Issue 3: Pool Not Found

**Problem**: `executeDEXTrade()` throws "Pool not found"

**Solution**: Ensure pool is initialized:

```typescript
// In initialization
initializeDEXPools();
// Verify pool exists
const pool = DEX_POOLS.get(poolId);
```

---

## Best Practices

1. **Always sync wallet balance** before checking/updating
2. **Extract action/tokenAmount** in `llm_format_response` handler
3. **Validate pool exists** before executing trade
4. **Handle price impact** in calculations
5. **Distribute iTax correctly** (40/30/30 split)
6. **Create complete ledger entries** with all trade details
7. **Broadcast events** for user feedback
8. **Handle errors gracefully** with workflow transitions

---

## Future Enhancements

1. **Token Wallet**: Store tokens in user wallet (currently only baseToken tracked)
2. **Multi-hop Routing**: Route trades through multiple pools for better prices
3. **Limit Orders**: Support limit orders and stop-loss
4. **Slippage Protection**: Warn users if price impact exceeds threshold
5. **Pool Analytics**: Track pool performance and volume
6. **Liquidity Provider Rewards**: Reward users who provide liquidity

---

## Summary

DEX trades in Eden follow a clear workflow:

1. **User Input** → Extract intent via LLM
2. **Query Pools** → Find matching liquidity pools
3. **Select Pool** → LLM chooses best pool
4. **Check Balance** → Validate sufficient funds
5. **Execute Trade** → Use constant product formula
6. **Update Pool** → Adjust reserves and price
7. **Distribute iTax** → Split fee 40/30/30
8. **Create Ledger** → Record transaction
9. **Complete Trade** → Persist and broadcast
10. **Summary** → Provide trade details

The system uses a workflow engine for flexibility and maintainability, with clear separation between pool management, trade execution, and ledger integration.

