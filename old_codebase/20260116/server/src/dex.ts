/**
 * DEX Module
 * Handles DEX pool initialization and trading
 */

import * as crypto from "crypto";
import type { TokenPool, DEXTrade } from "./types";
import { TOKEN_GARDENS, DEX_POOLS, ROOT_CA_SERVICE_REGISTRY, rootCALiquidity, addRootCALiquidity } from "./state";
import { PRICE_IMPACT_PER_TRADE, ITAX_RATE, ITAX_DISTRIBUTION, LLM_BASE_COST, ROUTING_COST_PER_PROVIDER, REASONING_COST_MULTIPLIER } from "./constants";

// Dependencies that need to be injected
let broadcastEvent: (event: any) => void;

/**
 * Initialize DEX module with dependencies
 */
export function initializeDEX(broadcastFn: (event: any) => void): void {
  broadcastEvent = broadcastFn;
}

/**
 * Initialize DEX pools, assigning them to token gardens
 */
export function initializeDEXPools(): void {
  // Initialize DEX pools, assigning them to token gardens
  // Each token garden can provide multiple pools
  for (let i = 0; i < TOKEN_GARDENS.length; i++) {
    const tokenGarden = TOKEN_GARDENS[i];
    if (!tokenGarden) continue;
    
    // Create pools for this token garden
    // Token Garden T1 gets TOKENA, T2 gets TOKENB, etc.
    const tokenSymbol = `TOKEN${String.fromCharCode(65 + i)}`; // TOKENA, TOKENB, TOKENC...
    const tokenName = `Token ${String.fromCharCode(65 + i)}`;
    const poolId = `pool-solana-${tokenSymbol.toLowerCase()}`;
    
    const pool: TokenPool = {
      poolId: poolId,
      tokenSymbol: tokenSymbol,
      tokenName: tokenName,
      baseToken: "SOL",
      poolLiquidity: 100 - (i * 10), // Decreasing liquidity for variety: 100, 90, 80...
      tokenReserve: 100000 - (i * 10000), // 100k, 90k, 80k...
      baseReserve: 100 - (i * 10), // 100, 90, 80...
      price: 0.001, // 1 Token = 0.001 SOL
      bond: 5000,
      gardenId: tokenGarden.id, // Assign to token garden
      createdAt: Date.now(),
      totalVolume: 0,
      totalTrades: 0,
    };
    DEX_POOLS.set(poolId, pool);
  }

  console.log(`🌊 Initialized ${DEX_POOLS.size} DEX pools`);
  console.log(`💰 ROOT CA Liquidity Pool: ${rootCALiquidity} SOL`);
  console.log(`🔷 Token Gardens: ${TOKEN_GARDENS.map(ti => ti.name).join(", ")}`);
  
  // Display pool assignments
  for (const [poolId, pool] of DEX_POOLS.entries()) {
    console.log(`   ${pool.tokenSymbol} Pool → ${pool.gardenId} (${pool.poolLiquidity} SOL liquidity)`);
  }
}

/**
 * Execute a DEX trade
 */
export function executeDEXTrade(
  poolId: string,
  action: 'BUY' | 'SELL',
  tokenAmount: number,
  userEmail: string
): DEXTrade {
  const pool = DEX_POOLS.get(poolId);
  if (!pool) {
    throw new Error(`Pool ${poolId} not found`);
  }

  // Step 1: Use ROOT CA liquidity as first liquidity source
  // For BUY: User pays baseToken, gets tokens
  // For SELL: User pays tokens, gets baseToken
  
  let baseAmount: number;
  let newPrice: number;
  
  if (action === 'BUY') {
    // User wants to BUY tokens with baseToken (SOL)
    // Calculate baseToken needed using constant product formula: x * y = k
    // After trade: (baseReserve + baseAmount) * (tokenReserve - tokenAmount) = baseReserve * tokenReserve
    // Solving: baseAmount = (baseReserve * tokenAmount) / (tokenReserve - tokenAmount)
    baseAmount = (pool.baseReserve * tokenAmount) / (pool.tokenReserve - tokenAmount);
    
    // Apply price impact (0.001% = 0.00001)
    const priceImpact = PRICE_IMPACT_PER_TRADE;
    baseAmount = baseAmount * (1 + priceImpact);
    
    // Update pool reserves
    pool.baseReserve += baseAmount;
    pool.tokenReserve -= tokenAmount;
    
    // Calculate new price
    newPrice = pool.baseReserve / pool.tokenReserve;
    pool.price = newPrice;
    
    // Increase pool value by 0.001%
    pool.poolLiquidity *= (1 + PRICE_IMPACT_PER_TRADE);
  } else {
    // SELL: User wants to SELL tokens for baseToken
    // Calculate baseToken received: baseAmount = (baseReserve * tokenAmount) / (tokenReserve + tokenAmount)
    baseAmount = (pool.baseReserve * tokenAmount) / (pool.tokenReserve + tokenAmount);
    
    // Apply price impact
    const priceImpact = PRICE_IMPACT_PER_TRADE;
    baseAmount = baseAmount * (1 - priceImpact);
    
    // Update pool reserves
    pool.baseReserve -= baseAmount;
    pool.tokenReserve += tokenAmount;
    
    // Calculate new price
    newPrice = pool.baseReserve / pool.tokenReserve;
    pool.price = newPrice;
    
    // Increase pool value by 0.001%
    pool.poolLiquidity *= (1 + PRICE_IMPACT_PER_TRADE);
  }
  
  // Step 2: Calculate iTax (0.0005% commission)
  const tradeValue = baseAmount; // Trade value in baseToken
  let iTax = tradeValue * ITAX_RATE;
  
  // Apply Snake provider multiplier if pool provider is Snake
  // DEX pool providers are registered with id like "dex-pool-{tokenSymbol}"
  const poolProviderId = `dex-pool-${pool.tokenSymbol.toLowerCase()}`;
  const poolProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === poolProviderId);
  if ((poolProvider as any)?.providerType === 'SNAKE') {
    const snakeITaxMultiplier = (poolProvider as any).iTaxMultiplier || 2.0;
    iTax = iTax * snakeITaxMultiplier;
    console.log(`🐍 [Snake Provider] Applied iTax multiplier: ${snakeITaxMultiplier}x for pool ${poolId}`);
  }
  
  // Step 3: Distribute iTax (WIN-WIN-WIN)
  const iTaxRootCA = iTax * ITAX_DISTRIBUTION.rootCA; // 40% to ROOT CA
  const iTaxGarden = iTax * ITAX_DISTRIBUTION.indexer; // 30% to garden (legacy constant name)
  const iTaxTrader = iTax * ITAX_DISTRIBUTION.trader; // 30% back to trader as rebate
  
  // Update ROOT CA liquidity (add iTax)
  addRootCALiquidity(iTaxRootCA);
  
  // Update pool stats
  pool.totalVolume += tradeValue;
  pool.totalTrades += 1;
  
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
  
  console.log(`💰 [DEX] Trade executed: ${action} ${tokenAmount} ${pool.tokenSymbol} for ${baseAmount.toFixed(6)} ${pool.baseToken}`);
  console.log(`   Price: ${newPrice.toFixed(6)} ${pool.baseToken}/${pool.tokenSymbol}`);
  console.log(`   iTax: ${iTax.toFixed(6)} ${pool.baseToken}`);
  console.log(`   Distribution: ROOT CA ${iTaxRootCA.toFixed(6)}, Garden ${iTaxGarden.toFixed(6)}, Trader ${iTaxTrader.toFixed(6)}`);
  
  // Broadcast DEX trade event
  broadcastEvent({
    type: "dex_trade_executed",
    component: "dex",
    message: `DEX Trade: ${action} ${tokenAmount} ${pool.tokenSymbol}`,
    timestamp: Date.now(),
    data: {
      trade,
      iTaxDistribution: {
        rootCA: iTaxRootCA,
        garden: iTaxGarden,
        trader: iTaxTrader,
      },
      poolState: {
        price: pool.price,
        liquidity: pool.poolLiquidity,
        totalVolume: pool.totalVolume,
        totalTrades: pool.totalTrades,
      },
      rootCALiquidity: rootCALiquidity,
    }
  });
  
  return trade;
}

/**
 * Calculate iGas cost for LLM operations
 */
export function calculateIGas(llmCalls: number, providersQueried: number, complexity: number = 1): number {
  const llmCost = LLM_BASE_COST * llmCalls * complexity;
  const routingCost = ROUTING_COST_PER_PROVIDER * providersQueried;
  const reasoningCost = llmCost * REASONING_COST_MULTIPLIER;
  return llmCost + routingCost + reasoningCost;
}

