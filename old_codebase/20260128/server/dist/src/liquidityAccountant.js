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
var liquidityAccountant_exports = {};
__export(liquidityAccountant_exports, {
  getAllLiquidityRecords: () => getAllLiquidityRecords,
  getLiquidityRecord: () => getLiquidityRecord,
  getLiquidityRecordsByGarden: () => getLiquidityRecordsByGarden,
  getLiquidityRecordsByToken: () => getLiquidityRecordsByToken,
  getLiquiditySummary: () => getLiquiditySummary,
  initializeLiquidityAccountant: () => initializeLiquidityAccountant,
  registerInitialLiquidity: () => registerInitialLiquidity,
  saveLiquidityState: () => saveLiquidityState,
  updateLiquidityAfterTrade: () => updateLiquidityAfterTrade
});
module.exports = __toCommonJS(liquidityAccountant_exports);
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
let LIQUIDITY_STATE = {
  tokens: /* @__PURE__ */ new Map(),
  lastUpdated: Date.now(),
  createdAt: Date.now()
};
const LIQUIDITY_PERSISTENCE_FILE = path.join(__dirname, "..", "eden-liquidity-persistence.json");
function initializeLiquidityAccountant() {
  loadLiquidityState();
  console.log(`\u{1F4A7} [LiquidityAccountant] Initialized. Tracking ${LIQUIDITY_STATE.tokens.size} token pool(s)`);
}
function loadLiquidityState() {
  try {
    if (fs.existsSync(LIQUIDITY_PERSISTENCE_FILE)) {
      const fileContent = fs.readFileSync(LIQUIDITY_PERSISTENCE_FILE, "utf-8");
      const persisted = JSON.parse(fileContent);
      LIQUIDITY_STATE.tokens = /* @__PURE__ */ new Map();
      if (persisted.tokens && Array.isArray(persisted.tokens)) {
        for (const token of persisted.tokens) {
          LIQUIDITY_STATE.tokens.set(token.poolId, token);
        }
      }
      LIQUIDITY_STATE.lastUpdated = persisted.lastUpdated || Date.now();
      LIQUIDITY_STATE.createdAt = persisted.createdAt || Date.now();
      console.log(`\u{1F4A7} [LiquidityAccountant] Loaded ${LIQUIDITY_STATE.tokens.size} token liquidity record(s) from persistence`);
    }
  } catch (err) {
    console.warn(`\u26A0\uFE0F  [LiquidityAccountant] Failed to load state: ${err.message}`);
  }
}
function saveLiquidityState() {
  try {
    LIQUIDITY_STATE.lastUpdated = Date.now();
    const data = {
      tokens: Array.from(LIQUIDITY_STATE.tokens.values()),
      lastUpdated: LIQUIDITY_STATE.lastUpdated,
      createdAt: LIQUIDITY_STATE.createdAt,
      lastSaved: (/* @__PURE__ */ new Date()).toISOString()
    };
    fs.writeFileSync(LIQUIDITY_PERSISTENCE_FILE, JSON.stringify(data, null, 2), "utf-8");
    console.log(`\u{1F4BE} [LiquidityAccountant] State saved to persistence`);
  } catch (err) {
    console.error(`\u274C [LiquidityAccountant] Failed to save state: ${err.message}`);
  }
}
function registerInitialLiquidity(poolId, tokenSymbol, baseToken, gardenId, initialLiquidity, baseReserve, tokenReserve, stripePaymentIntentId) {
  const existing = LIQUIDITY_STATE.tokens.get(poolId);
  if (existing) {
    existing.currentLiquidity = initialLiquidity;
    existing.baseReserve = baseReserve;
    existing.tokenReserve = tokenReserve;
    existing.lastUpdated = Date.now();
    if (stripePaymentIntentId) {
      existing.stripePaymentIntentId = stripePaymentIntentId;
    }
    console.log(`\u{1F4A7} [LiquidityAccountant] Updated liquidity for ${tokenSymbol}/${baseToken} (${poolId}): ${initialLiquidity} ${baseToken}`);
  } else {
    const record = {
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
    console.log(`\u{1F4A7} [LiquidityAccountant] Registered initial liquidity for ${tokenSymbol}/${baseToken} (${poolId}): ${initialLiquidity} ${baseToken}`);
  }
  saveLiquidityState();
}
function updateLiquidityAfterTrade(poolId, baseReserve, tokenReserve, tradeVolume) {
  const record = LIQUIDITY_STATE.tokens.get(poolId);
  if (!record) {
    console.warn(`\u26A0\uFE0F  [LiquidityAccountant] No liquidity record found for pool ${poolId}, cannot update`);
    return;
  }
  record.baseReserve = baseReserve;
  record.tokenReserve = tokenReserve;
  record.currentLiquidity = baseReserve;
  record.totalVolume += tradeVolume;
  record.totalTrades += 1;
  record.lastUpdated = Date.now();
  console.log(`\u{1F4A7} [LiquidityAccountant] Updated liquidity for ${record.tokenSymbol}/${record.baseToken} (${poolId}): ${baseReserve} ${record.baseToken} (${record.totalTrades} trades, ${record.totalVolume.toFixed(2)} volume)`);
  saveLiquidityState();
}
function getLiquidityRecord(poolId) {
  return LIQUIDITY_STATE.tokens.get(poolId);
}
function getAllLiquidityRecords() {
  return Array.from(LIQUIDITY_STATE.tokens.values());
}
function getLiquidityRecordsByGarden(gardenId) {
  return Array.from(LIQUIDITY_STATE.tokens.values()).filter((r) => r.gardenId === gardenId);
}
function getLiquidityRecordsByToken(tokenSymbol) {
  return Array.from(LIQUIDITY_STATE.tokens.values()).filter((r) => r.tokenSymbol === tokenSymbol);
}
function getLiquiditySummary() {
  const records = Array.from(LIQUIDITY_STATE.tokens.values());
  let totalInitialLiquidity = 0;
  let totalCurrentLiquidity = 0;
  let totalVolume = 0;
  let totalTrades = 0;
  const byGarden = {};
  const byToken = {};
  for (const record of records) {
    totalInitialLiquidity += record.initialLiquidity;
    totalCurrentLiquidity += record.currentLiquidity;
    totalVolume += record.totalVolume;
    totalTrades += record.totalTrades;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getAllLiquidityRecords,
  getLiquidityRecord,
  getLiquidityRecordsByGarden,
  getLiquidityRecordsByToken,
  getLiquiditySummary,
  initializeLiquidityAccountant,
  registerInitialLiquidity,
  saveLiquidityState,
  updateLiquidityAfterTrade
});
//# sourceMappingURL=liquidityAccountant.js.map
