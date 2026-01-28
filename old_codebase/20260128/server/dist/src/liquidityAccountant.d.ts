/**
 * Token Liquidity Accountant Service
 * Tracks liquidity for each DEX token pool (tokenA, tokenB, etc.)
 * Part of Holy Ghost infrastructure - tracks baseToken liquidity for each token
 */
export interface TokenLiquidityRecord {
    tokenSymbol: string;
    baseToken: string;
    poolId: string;
    gardenId: string;
    initialLiquidity: number;
    currentLiquidity: number;
    baseReserve: number;
    tokenReserve: number;
    totalVolume: number;
    totalTrades: number;
    stripePaymentIntentId?: string;
    liquidityLoadedAt?: number;
    lastUpdated: number;
    createdAt: number;
}
/**
 * Initialize Liquidity Accountant Service
 */
export declare function initializeLiquidityAccountant(): void;
/**
 * Save liquidity state to persistence file
 */
export declare function saveLiquidityState(): void;
/**
 * Register initial liquidity for a token pool
 * Called when a DEX garden is created with Stripe Payment Rail liquidity
 */
export declare function registerInitialLiquidity(poolId: string, tokenSymbol: string, baseToken: string, gardenId: string, initialLiquidity: number, baseReserve: number, tokenReserve: number, stripePaymentIntentId?: string): void;
/**
 * Update liquidity after a trade
 * Called when a DEX trade is executed
 */
export declare function updateLiquidityAfterTrade(poolId: string, baseReserve: number, tokenReserve: number, tradeVolume: number): void;
/**
 * Get liquidity record for a pool
 */
export declare function getLiquidityRecord(poolId: string): TokenLiquidityRecord | undefined;
/**
 * Get all liquidity records
 */
export declare function getAllLiquidityRecords(): TokenLiquidityRecord[];
/**
 * Get liquidity records for a specific garden
 */
export declare function getLiquidityRecordsByGarden(gardenId: string): TokenLiquidityRecord[];
/**
 * Get liquidity records for a specific token symbol
 */
export declare function getLiquidityRecordsByToken(tokenSymbol: string): TokenLiquidityRecord[];
/**
 * Get liquidity summary
 */
export declare function getLiquiditySummary(): {
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
};
//# sourceMappingURL=liquidityAccountant.d.ts.map