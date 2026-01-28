"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var dex_exports = {};
__export(dex_exports, {
  calculateIGas: () => calculateIGas,
  executeDEXTrade: () => executeDEXTrade,
  initializeDEX: () => initializeDEX,
  initializeDEXPools: () => initializeDEXPools
});
module.exports = __toCommonJS(dex_exports);
var crypto = __toESM(require("crypto"));
var import_state = require("./state");
var import_constants = require("./constants");
let broadcastEvent = () => {
};
function normalizePoolId(poolId) {
  return (poolId || "").trim().toLowerCase();
}
function parseTokenSymbolFromPoolId(poolId) {
  const normalized = normalizePoolId(poolId);
  if (!normalized.startsWith("pool-solana-"))
    return null;
  const suffix = normalized.slice("pool-solana-".length);
  if (!suffix)
    return null;
  const cleaned = suffix.replace(/[^a-z0-9_-]/g, "").toLowerCase();
  if (!cleaned)
    return null;
  if (cleaned.startsWith("token")) {
    return "TOKEN";
  }
  return "TOKEN";
}
function createSyntheticPool(poolId) {
  const tokenSymbol = parseTokenSymbolFromPoolId(poolId);
  if (!tokenSymbol)
    return null;
  const gardenId = import_state.TOKEN_GARDENS[0]?.id || "T1";
  const tokenLetter = tokenSymbol.replace(/^TOKEN/, "") || "X";
  const tokenName = `Token ${tokenLetter}`;
  const pool = {
    poolId: normalizePoolId(poolId),
    tokenSymbol,
    tokenName,
    baseToken: "SOL",
    poolLiquidity: 100,
    tokenReserve: 1e5,
    baseReserve: 100,
    price: 1e-3,
    bond: 5e3,
    gardenId,
    createdAt: Date.now(),
    totalVolume: 0,
    totalTrades: 0
  };
  return pool;
}
function initializeDEX(broadcastFn) {
  broadcastEvent = broadcastFn;
}
function initializeDEXPools() {
  for (let i = 0; i < import_state.TOKEN_GARDENS.length; i++) {
    const tokenGarden = import_state.TOKEN_GARDENS[i];
    if (!tokenGarden)
      continue;
    const tokenSymbol = "TOKEN";
    const tokenName = `Token ${i + 1}`;
    const poolId = `pool-solana-token-${i + 1}`;
    const pool = {
      poolId,
      tokenSymbol,
      tokenName,
      baseToken: "SOL",
      poolLiquidity: 100 - i * 10,
      // Decreasing liquidity for variety: 100, 90, 80...
      tokenReserve: 1e5 - i * 1e4,
      // 100k, 90k, 80k...
      baseReserve: 100 - i * 10,
      // 100, 90, 80...
      price: 1e-3,
      // 1 Token = 0.001 SOL
      bond: 5e3,
      gardenId: tokenGarden.id,
      // Assign to token garden
      createdAt: Date.now(),
      totalVolume: 0,
      totalTrades: 0
    };
    import_state.DEX_POOLS.set(poolId, pool);
  }
  console.log(`\u{1F30A} Initialized ${import_state.DEX_POOLS.size} DEX pools`);
  console.log(`\u{1F4B0} ROOT CA Liquidity Pool: ${import_state.rootCALiquidity} SOL`);
  console.log(`\u{1F537} Token Gardens: ${import_state.TOKEN_GARDENS.map((ti) => ti.name).join(", ")}`);
  for (const [poolId, pool] of import_state.DEX_POOLS.entries()) {
    console.log(`   ${pool.tokenSymbol} Pool \u2192 ${pool.gardenId} (${pool.poolLiquidity} SOL liquidity)`);
    import("./liquidityAccountant").then(({ getLiquidityRecord, registerInitialLiquidity }) => {
      const existing = getLiquidityRecord(poolId);
      if (!existing) {
        registerInitialLiquidity(
          poolId,
          pool.tokenSymbol,
          pool.baseToken,
          pool.gardenId,
          pool.baseReserve || pool.poolLiquidity,
          pool.baseReserve || pool.poolLiquidity,
          pool.tokenReserve,
          pool.stripePaymentIntentId
        );
        console.log(`   \u{1F4A7} [LiquidityAccountant] Registered existing pool ${pool.tokenSymbol}/${pool.baseToken}`);
      }
    }).catch((err) => {
      console.warn(`   \u26A0\uFE0F  [DEX] Failed to register pool with liquidity accountant: ${err.message}`);
    });
  }
}
function executeDEXTrade(poolId, action, tokenAmount, userEmail) {
  const requestedPoolId = poolId;
  const normalizedPoolId = normalizePoolId(poolId);
  let pool = import_state.DEX_POOLS.get(requestedPoolId) || import_state.DEX_POOLS.get(normalizedPoolId);
  if (!pool) {
    if (import_state.DEX_POOLS.size === 0) {
      console.warn(`\u26A0\uFE0F  [DEX] DEX_POOLS is empty at trade time; attempting to initialize pools...`);
    } else {
      console.warn(`\u26A0\uFE0F  [DEX] Pool "${requestedPoolId}" not found; attempting to re-initialize pools and retry lookup...`);
    }
    try {
      initializeDEXPools();
    } catch (err) {
      console.warn(`\u26A0\uFE0F  [DEX] initializeDEXPools() failed during trade: ${err?.message || err}`);
    }
    pool = import_state.DEX_POOLS.get(requestedPoolId) || import_state.DEX_POOLS.get(normalizedPoolId);
  }
  if (!pool && import_state.DEX_POOLS.size > 0) {
    const match = Array.from(import_state.DEX_POOLS.values()).find((p) => normalizePoolId(p.poolId) === normalizedPoolId);
    if (match)
      pool = match;
  }
  if (!pool) {
    const synthetic = createSyntheticPool(requestedPoolId);
    if (synthetic) {
      import_state.DEX_POOLS.set(synthetic.poolId, synthetic);
      pool = synthetic;
      console.warn(
        `\u26A0\uFE0F  [DEX] Pool "${requestedPoolId}" was missing; created synthetic pool "${synthetic.poolId}" for token ${synthetic.tokenSymbol}.`
      );
    }
  }
  if (!pool) {
    const available = Array.from(import_state.DEX_POOLS.keys()).slice(0, 20).join(", ");
    throw new Error(
      `Pool ${requestedPoolId} not found (normalized: ${normalizedPoolId}). DEX_POOLS.size=${import_state.DEX_POOLS.size}. ` + (import_state.DEX_POOLS.size ? `Available poolIds (first 20): ${available}` : `No pools are initialized.`)
    );
  }
  let baseAmount;
  let newPrice;
  if (action === "BUY") {
    baseAmount = pool.baseReserve * tokenAmount / (pool.tokenReserve - tokenAmount);
    const priceImpact = import_constants.PRICE_IMPACT_PER_TRADE;
    baseAmount = baseAmount * (1 + priceImpact);
    pool.baseReserve += baseAmount;
    pool.tokenReserve -= tokenAmount;
    newPrice = pool.baseReserve / pool.tokenReserve;
    pool.price = newPrice;
    pool.poolLiquidity *= 1 + import_constants.PRICE_IMPACT_PER_TRADE;
  } else {
    baseAmount = pool.baseReserve * tokenAmount / (pool.tokenReserve + tokenAmount);
    const priceImpact = import_constants.PRICE_IMPACT_PER_TRADE;
    baseAmount = baseAmount * (1 - priceImpact);
    pool.baseReserve -= baseAmount;
    pool.tokenReserve += tokenAmount;
    newPrice = pool.baseReserve / pool.tokenReserve;
    pool.price = newPrice;
    pool.poolLiquidity *= 1 + import_constants.PRICE_IMPACT_PER_TRADE;
  }
  const tradeValue = baseAmount;
  let iTax = tradeValue * import_constants.ITAX_RATE;
  const poolProviderId = `dex-pool-${pool.tokenSymbol.toLowerCase()}`;
  const poolProvider = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === poolProviderId);
  if (poolProvider?.providerType === "SNAKE") {
    const snakeITaxMultiplier = poolProvider.iTaxMultiplier || 2;
    iTax = iTax * snakeITaxMultiplier;
    console.log(`\u{1F40D} [Snake Provider] Applied iTax multiplier: ${snakeITaxMultiplier}x for pool ${poolId}`);
  }
  const iTaxRootCA = iTax * import_constants.ITAX_DISTRIBUTION.rootCA;
  const iTaxGarden = iTax * import_constants.ITAX_DISTRIBUTION.indexer;
  const iTaxTrader = iTax * import_constants.ITAX_DISTRIBUTION.trader;
  (0, import_state.addRootCALiquidity)(iTaxRootCA);
  pool.totalVolume += tradeValue;
  pool.totalTrades += 1;
  import("./liquidityAccountant").then(({ updateLiquidityAfterTrade }) => {
    updateLiquidityAfterTrade(
      pool.poolId,
      pool.baseReserve,
      pool.tokenReserve,
      tradeValue
    );
  }).catch((err) => {
    console.warn(`\u26A0\uFE0F  [DEX] Failed to update liquidity accountant: ${err.message}`);
  });
  const trade = {
    tradeId: crypto.randomUUID(),
    poolId: pool.poolId,
    tokenSymbol: pool.tokenSymbol,
    baseToken: pool.baseToken,
    action,
    tokenAmount,
    baseAmount,
    price: newPrice,
    priceImpact: import_constants.PRICE_IMPACT_PER_TRADE,
    iTax,
    timestamp: Date.now(),
    trader: userEmail
  };
  console.log(`\u{1F4B0} [DEX] Trade executed: ${action} ${tokenAmount} ${pool.tokenSymbol} for ${baseAmount.toFixed(6)} ${pool.baseToken}`);
  console.log(`   Price: ${newPrice.toFixed(6)} ${pool.baseToken}/${pool.tokenSymbol}`);
  console.log(`   iTax: ${iTax.toFixed(6)} ${pool.baseToken}`);
  console.log(`   Distribution: ROOT CA ${iTaxRootCA.toFixed(6)}, Garden ${iTaxGarden.toFixed(6)}, Trader ${iTaxTrader.toFixed(6)}`);
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
        trader: iTaxTrader
      },
      poolState: {
        price: pool.price,
        liquidity: pool.poolLiquidity,
        totalVolume: pool.totalVolume,
        totalTrades: pool.totalTrades
      },
      rootCALiquidity: import_state.rootCALiquidity
    }
  });
  return trade;
}
function calculateIGas(llmCalls, providersQueried, complexity = 1) {
  const llmCost = import_constants.LLM_BASE_COST * llmCalls * complexity;
  const routingCost = import_constants.ROUTING_COST_PER_PROVIDER * providersQueried;
  const reasoningCost = llmCost * import_constants.REASONING_COST_MULTIPLIER;
  return llmCost + routingCost + reasoningCost;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  calculateIGas,
  executeDEXTrade,
  initializeDEX,
  initializeDEXPools
});
//# sourceMappingURL=dex.js.map
