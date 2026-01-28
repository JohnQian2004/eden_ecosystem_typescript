/**
 * DEX Module
 * Handles DEX pool initialization and trading
 */
import type { DEXTrade } from "./types";
/**
 * Initialize DEX module with dependencies
 */
export declare function initializeDEX(broadcastFn: (event: any) => void): void;
/**
 * Initialize DEX pools, assigning them to token gardens
 */
export declare function initializeDEXPools(): void;
/**
 * Execute a DEX trade
 */
export declare function executeDEXTrade(poolId: string, action: 'BUY' | 'SELL', tokenAmount: number, userEmail: string): DEXTrade;
/**
 * Calculate iGas cost for LLM operations
 */
export declare function calculateIGas(llmCalls: number, providersQueried: number, complexity?: number): number;
//# sourceMappingURL=dex.d.ts.map