/**
 * Token Liquidity Accountant Service
 * Tracks liquidity for each DEX token pool (tokenA, tokenB, etc.)
 * Part of Holy Ghost infrastructure - tracks baseToken liquidity for each token
 */

import * as fs from "fs";
import * as path from "path";
import type { TokenPool } from "./types";

// Liquidity tracking interface
export interface TokenLiquidityRecord {
  tokenSymbol: string;
  baseToken: string;
  poolId: string;
  gardenId: string;
  initialLiquidity: number; // Initial liquidity loaded via Stripe Payment Rail
  currentLiquidity: number; // Current liquidity (updated as trades happen)
  baseReserve: number; // Current base token reserve
  tokenReserve: number; // Current token reserve
  totalVolume: number; // Total trading volume
  totalTrades: number; // Total number of trades
  stripePaymentIntentId?: string; // Stripe payment intent for initial liquidity
  liquidityLoadedAt?: number; // Timestamp when liquidity was loaded
  lastUpdated: number;
  createdAt: number;
}

// Global liquidity state
interface LiquidityAccountantState {
  tokens: Map<string, TokenLiquidityRecord>; // Key: poolId
  lastUpdated: number;
  createdAt: number;
}

let LIQUIDITY_STATE: LiquidityAccountantState = {
  tokens: new Map(),
  lastUpdated: Date.now(),
  createdAt: Date.now()
};

// Persistence file path
const LIQUIDITY_PERSISTENCE_FILE = path.join(__dirname, '..', 'eden-liquidity-persistence.json');

/**
 * Initialize Liquidity Accountant Service
 */
export function initializeLiquidityAccountant(): void {
  loadLiquidityState();
  console.log(`💧 [LiquidityAccountant] Initialized. Tracking ${LIQUIDITY_STATE.tokens.size} token pool(s)`);
}

/**
 * Load liquidity state from persistence file
 */
function loadLiquidityState(): void {
  try {
    if (fs.existsSync(LIQUIDITY_PERSISTENCE_FILE)) {
      const fileContent = fs.readFileSync(LIQUIDITY_PERSISTENCE_FILE, 'utf-8');
      const persisted = JSON.parse(fileContent);
      
      // Restore tokens map
      LIQUIDITY_STATE.tokens = new Map();
      if (persisted.tokens && Array.isArray(persisted.tokens)) {
        for (const token of persisted.tokens) {
          LIQUIDITY_STATE.tokens.set(token.poolId, token);
        }
      }
      
      LIQUIDITY_STATE.lastUpdated = persisted.lastUpdated || Date.now();
      LIQUIDITY_STATE.createdAt = persisted.createdAt || Date.now();
      
      console.log(`💧 [LiquidityAccountant] Loaded ${LIQUIDITY_STATE.tokens.size} token liquidity record(s) from persistence`);
    }
  } catch (err: any) {
    console.warn(`⚠️  [LiquidityAccountant] Failed to load state: ${err.message}`);
  }
}

/**
 * Save liquidity state to persistence file
 */
export function saveLiquidityState(): void {
  try {
    LIQUIDITY_STATE.lastUpdated = Date.now();
    
    const data = {
      tokens: Array.from(LIQUIDITY_STATE.tokens.values()),
      lastUpdated: LIQUIDITY_STATE.lastUpdated,
      createdAt: LIQUIDITY_STATE.createdAt,
      lastSaved: new Date().toISOString()
    };
    
    fs.writeFileSync(LIQUIDITY_PERSISTENCE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`💾 [LiquidityAccountant] State saved to persistence`);
  } catch (err: any) {
    console.error(`❌ [LiquidityAccountant] Failed to save state: ${err.message}`);
  }
}

/**
 * Register initial liquidity for a token pool
 * Called when a DEX garden is created with Stripe Payment Rail liquidity
 */
export function registerInitialLiquidity(
  poolId: string,
  tokenSymbol: string,
  baseToken: string,
  gardenId: string,
  initialLiquidity: number,
  baseReserve: number,
  tokenReserve: number,
  stripePaymentIntentId?: string
): void {
  const existing = LIQUIDITY_STATE.tokens.get(poolId);
  
  if (existing) {
    // Update existing record
    existing.currentLiquidity = initialLiquidity;
    existing.baseReserve = baseReserve;
    existing.tokenReserve = tokenReserve;
    existing.lastUpdated = Date.now();
    if (stripePaymentIntentId) {
      existing.stripePaymentIntentId = stripePaymentIntentId;
    }
    console.log(`💧 [LiquidityAccountant] Updated liquidity for ${tokenSymbol}/${baseToken} (${poolId}): ${initialLiquidity} ${baseToken}`);
  } else {
    // Create new record
    const record: TokenLiquidityRecord = {
      tokenSymbol,
      baseToken,
      poolId,
      gardenId,
      initialLiquidity,
      currentLiquidity: initialLiquidity,
      baseReserve,
      tokenReserve,
      totalVolume: 0,
      totalTrades: 0,
      stripePaymentIntentId,
      liquidityLoadedAt: Date.now(),
      lastUpdated: Date.now(),
      createdAt: Date.now()
    };
    
    LIQUIDITY_STATE.tokens.set(poolId, record);
    console.log(`💧 [LiquidityAccountant] Registered initial liquidity for ${tokenSymbol}/${baseToken} (${poolId}): ${initialLiquidity} ${baseToken}`);
  }
  
  saveLiquidityState();
}

/**
 * Update liquidity after a trade
 * Called when a DEX trade is executed
 */
export function updateLiquidityAfterTrade(
  poolId: string,
  baseReserve: number,
  tokenReserve: number,
  tradeVolume: number
): void {
  const record = LIQUIDITY_STATE.tokens.get(poolId);
  
  if (!record) {
    console.warn(`⚠️  [LiquidityAccountant] No liquidity record found for pool ${poolId}, cannot update`);
    return;
  }
  
  // Update reserves and liquidity
  record.baseReserve = baseReserve;
  record.tokenReserve = tokenReserve;
  record.currentLiquidity = baseReserve; // Current liquidity = base reserve
  record.totalVolume += tradeVolume;
  record.totalTrades += 1;
  record.lastUpdated = Date.now();
  
  console.log(`💧 [LiquidityAccountant] Updated liquidity for ${record.tokenSymbol}/${record.baseToken} (${poolId}): ${baseReserve} ${record.baseToken} (${record.totalTrades} trades, ${record.totalVolume.toFixed(2)} volume)`);
  
  saveLiquidityState();
}

/**
 * Get liquidity record for a pool
 */
export function getLiquidityRecord(poolId: string): TokenLiquidityRecord | undefined {
  return LIQUIDITY_STATE.tokens.get(poolId);
}

/**
 * Get all liquidity records
 */
export function getAllLiquidityRecords(): TokenLiquidityRecord[] {
  return Array.from(LIQUIDITY_STATE.tokens.values());
}

/**
 * Get liquidity records for a specific garden
 */
export function getLiquidityRecordsByGarden(gardenId: string): TokenLiquidityRecord[] {
  return Array.from(LIQUIDITY_STATE.tokens.values()).filter(r => r.gardenId === gardenId);
}

/**
 * Get liquidity records for a specific token symbol
 */
export function getLiquidityRecordsByToken(tokenSymbol: string): TokenLiquidityRecord[] {
  return Array.from(LIQUIDITY_STATE.tokens.values()).filter(r => r.tokenSymbol === tokenSymbol);
}

/**
 * Get liquidity summary
 */
export function getLiquiditySummary(): {
  totalPools: number;
  totalInitialLiquidity: number;
  totalCurrentLiquidity: number;
  totalVolume: number;
  totalTrades: number;
  byGarden: Record<string, {
    pools: number;
    initialLiquidity: number;
    currentLiquidity: number;
    volume: number;
    trades: number;
  }>;
  byToken: Record<string, {
    pools: number;
    initialLiquidity: number;
    currentLiquidity: number;
    volume: number;
    trades: number;
  }>;
} {
  const records = Array.from(LIQUIDITY_STATE.tokens.values());
  
  let totalInitialLiquidity = 0;
  let totalCurrentLiquidity = 0;
  let totalVolume = 0;
  let totalTrades = 0;
  
  const byGarden: Record<string, any> = {};
  const byToken: Record<string, any> = {};
  
  for (const record of records) {
    totalInitialLiquidity += record.initialLiquidity;
    totalCurrentLiquidity += record.currentLiquidity;
    totalVolume += record.totalVolume;
    totalTrades += record.totalTrades;
    
    // Group by garden
    if (!byGarden[record.gardenId]) {
      byGarden[record.gardenId] = {
        pools: 0,
        initialLiquidity: 0,
        currentLiquidity: 0,
        volume: 0,
        trades: 0
      };
    }
    byGarden[record.gardenId].pools++;
    byGarden[record.gardenId].initialLiquidity += record.initialLiquidity;
    byGarden[record.gardenId].currentLiquidity += record.currentLiquidity;
    byGarden[record.gardenId].volume += record.totalVolume;
    byGarden[record.gardenId].trades += record.totalTrades;
    
    // Group by token
    if (!byToken[record.tokenSymbol]) {
      byToken[record.tokenSymbol] = {
        pools: 0,
        initialLiquidity: 0,
        currentLiquidity: 0,
        volume: 0,
        trades: 0
      };
    }
    byToken[record.tokenSymbol].pools++;
    byToken[record.tokenSymbol].initialLiquidity += record.initialLiquidity;
    byToken[record.tokenSymbol].currentLiquidity += record.currentLiquidity;
    byToken[record.tokenSymbol].volume += record.totalVolume;
    byToken[record.tokenSymbol].trades += record.totalTrades;
  }
  
  return {
    totalPools: records.length,
    totalInitialLiquidity,
    totalCurrentLiquidity,
    totalVolume,
    totalTrades,
    byGarden,
    byToken
  };
}

