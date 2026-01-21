# Refactoring Plan - Phase 2

## Goal
Move all inner classes and related code into `src/` directory to keep `main()` small.

## Structure
```
server/
  src/
    types.ts          ✅ (DONE)
    constants.ts      ✅ (DONE)
    state.ts          ✅ (DONE - Global state management)
    config.ts         ✅ (DONE - Configuration and CLI flags)
    redis.ts          ✅ (DONE - InMemoryRedisServer class)
    wallet.ts         ✅ (DONE - Wallet functions)
    serviceProvider.ts ✅ (DONE - Service provider functions)
    garden.ts         ✅ (DONE - Garden-related functions)
    ledger.ts         ✅ (DONE - Ledger-related functions)
    serviceRegistry.ts (TODO: Service registry functions - may merge with serviceProvider)
    dex.ts            ✅ (DONE - DEX pool functions)
    llm.ts            ✅ (DONE - LLM functions)
    routes.ts         (TODO: HTTP routes - largest remaining task)
  eden-sim-redis.ts  (Main file - should only have main() and minimal setup)
```

## Components to Extract

### 1. ✅ InMemoryRedisServer (redis.ts) - DONE
- Class definition (extracted from lines 3154-4237)
- All persistence logic
- Redis operations (get, set, del, hSet, hGet, xAdd, xRead, etc.)

### 2. ✅ State Management (state.ts) - DONE
- Global arrays: GARDENS, TOKEN_GARDENS, ROOT_CA_SERVICE_REGISTRY, DEX_POOLS, LEDGER, etc.
- Global maps: CERTIFICATE_REGISTRY, REVOCATION_REGISTRY, etc.
- Initialization functions: initializeGardens(), initializeUsers(), setROOTCA()

### 3. ✅ Configuration (config.ts) - DONE
- CLI flag parsing (MOCKED_LLM, SKIP_REDIS, ENABLE_OPENAI, DEPLOYED_AS_ROOT, etc.)
- Server configuration (HTTP_PORT, FRONTEND_PATH)
- Stripe configuration

### 4. ✅ Wallet Functions (wallet.ts) - DONE
- `getWalletBalance()`
- `creditWallet()`
- `debitWallet()`
- `processWalletIntent()`
- `syncWalletBalanceFromUser()`
- `initializeWallet()`

### 5. ✅ Service Provider Functions (serviceProvider.ts) - DONE
- `validateGardenId()`
- `registerServiceProviderWithROOTCA()`
- `queryROOTCAServiceRegistry()`
- `queryServiceProviders()`
- `queryProviderAPI()`, `queryAMCAPI()`, `queryMovieComAPI()`, `queryCinemarkAPI()`
- `queryDEXPoolAPI()`, `querySnakeAPI()`
- `issueServiceProviderCertificate()`
- `initializeServiceProvider()`

### 6. ✅ Garden Functions (garden.ts) - DONE
- `issueGardenCertificate()`
- `registerNewMovieGarden()`
- Garden initialization logic

### 7. Service Registry (serviceRegistry.ts) - TODO
- May merge with serviceProvider.ts or keep separate for registry-specific operations
- Service registry persistence and management

### 8. ✅ DEX Functions (dex.ts) - DONE
- `initializeDEXPools()`
- `executeDEXTrade()`
- `calculateIGas()`
- DEX pool management

### 9. ✅ Ledger Functions (ledger.ts) - DONE
- `addLedgerEntry()`
- `pushLedgerEntryToSettlementStream()`
- `processPayment()`
- `completeBooking()`
- `getLedgerEntries()`, `getTransactionByPayer()`, `getTransactionBySnapshot()`, `getLatestSnapshot()`
- `deliverWebhook()`
- Ledger entry management, transaction processing, settlement logic

### 10. ✅ LLM Functions (llm.ts) - DONE
- `extractQueryWithOpenAI()`
- `extractQueryWithDeepSeek()`
- `formatResponseWithOpenAI()`
- `formatResponseWithDeepSeek()`
- `resolveLLM()`
- `callLLM()`
- LLM system prompts

### 11. HTTP Routes (routes.ts) - TODO
- All route handlers (lines 173-3119)
- Route setup logic

## Dependencies
- `types.ts` ✅ - Used by all modules
- `constants.ts` ✅ - Used by all modules
- `state.ts` ✅ - Used by all modules for global state
- `config.ts` ✅ - Used by main() for configuration
- `redis.ts` ✅ - Used by wallet, ledger, routes
- `wallet.ts` ✅ - Used by routes
- `serviceProvider.ts` ✅ - Used by routes, dex
- `garden.ts` ✅ - Used by routes, serviceRegistry
- `serviceRegistry.ts` - Used by routes, dex (may merge with serviceProvider)
- `dex.ts` ✅ - Used by routes
- `ledger.ts` ✅ - Used by routes, wallet
- `llm.ts` ✅ - Used by routes
- `routes.ts` - Main routing logic (largest remaining task)

## Progress Summary

### Completed ✅
1. **types.ts** - All TypeScript interfaces and types
2. **constants.ts** - All constant values
3. **state.ts** - Global state management (GARDENS, TOKEN_GARDENS, ROOT_CA_SERVICE_REGISTRY, etc.)
4. **config.ts** - CLI flags, environment variables, server configuration
5. **redis.ts** - InMemoryRedisServer class with persistence logic
6. **wallet.ts** - All wallet-related functions
7. **serviceProvider.ts** - All service provider functions (registration, querying, certificates, APIs)
8. **garden.ts** - Garden certificate issuance and registration
9. **dex.ts** - DEX pool initialization and trading
10. **ledger.ts** - Ledger entry management and transactions
11. **llm.ts** - LLM query extraction and response formatting

### In Progress / TODO
- **serviceRegistry.ts** - Service registry persistence (may merge with serviceProvider)
- **routes.ts** - HTTP route handlers (largest remaining task - ~3000 lines of route handlers)

## Main File Should Only Contain
- Imports from src/ modules
- `main()` function
- Server startup logic
- Minimal initialization (calling module initialization functions)

