"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var constants_exports = {};
__export(constants_exports, {
  CHAIN_ID: () => CHAIN_ID,
  INDEXER_FEE: () => INDEXER_FEE,
  ITAX_DISTRIBUTION: () => ITAX_DISTRIBUTION,
  ITAX_RATE: () => ITAX_RATE,
  LEDGER_SETTLEMENT_STREAM: () => LEDGER_SETTLEMENT_STREAM,
  LLM_BASE_COST: () => LLM_BASE_COST,
  PRICE_IMPACT_PER_TRADE: () => PRICE_IMPACT_PER_TRADE,
  REASONING_COST_MULTIPLIER: () => REASONING_COST_MULTIPLIER,
  REVOCATION_STREAM: () => REVOCATION_STREAM,
  ROOT_CA_FEE: () => ROOT_CA_FEE,
  ROOT_CA_LIQUIDITY_POOL: () => ROOT_CA_LIQUIDITY_POOL,
  ROOT_CA_UUID: () => ROOT_CA_UUID,
  ROUTING_COST_PER_PROVIDER: () => ROUTING_COST_PER_PROVIDER,
  WALLET_AUDIT_PREFIX: () => WALLET_AUDIT_PREFIX,
  WALLET_BALANCE_PREFIX: () => WALLET_BALANCE_PREFIX,
  WALLET_HOLD_PREFIX: () => WALLET_HOLD_PREFIX,
  WORKFLOW_ACTION_COST: () => WORKFLOW_ACTION_COST,
  WORKFLOW_BASE_COST: () => WORKFLOW_BASE_COST,
  WORKFLOW_COMPLEXITY_MULTIPLIER: () => WORKFLOW_COMPLEXITY_MULTIPLIER,
  WORKFLOW_STEP_COST: () => WORKFLOW_STEP_COST
});
module.exports = __toCommonJS(constants_exports);
const CHAIN_ID = "eden-core";
const ROOT_CA_FEE = 0.02;
const INDEXER_FEE = 5e-3;
const LLM_BASE_COST = 1e-3;
const ROUTING_COST_PER_PROVIDER = 1e-4;
const REASONING_COST_MULTIPLIER = 1.5;
const WORKFLOW_BASE_COST = 1e-3;
const WORKFLOW_STEP_COST = 1e-4;
const WORKFLOW_ACTION_COST = 5e-5;
const WORKFLOW_COMPLEXITY_MULTIPLIER = 1;
const PRICE_IMPACT_PER_TRADE = 1e-5;
const ITAX_RATE = 5e-6;
const ROOT_CA_LIQUIDITY_POOL = 1e3;
const ITAX_DISTRIBUTION = {
  rootCA: 0.4,
  // 40% to ROOT CA
  indexer: 0.3,
  // 30% to indexer (token provider)
  trader: 0.3
  // 30% back to trader as rebate
};
const LEDGER_SETTLEMENT_STREAM = "eden:ledger:pending";
const REVOCATION_STREAM = "eden:encert:revocations";
const WALLET_BALANCE_PREFIX = "wallet:balance:";
const WALLET_HOLD_PREFIX = "wallet:hold:";
const WALLET_AUDIT_PREFIX = "wallet:audit:";
const ROOT_CA_UUID = "eden:root:ca:00000000-0000-0000-0000-000000000001";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CHAIN_ID,
  INDEXER_FEE,
  ITAX_DISTRIBUTION,
  ITAX_RATE,
  LEDGER_SETTLEMENT_STREAM,
  LLM_BASE_COST,
  PRICE_IMPACT_PER_TRADE,
  REASONING_COST_MULTIPLIER,
  REVOCATION_STREAM,
  ROOT_CA_FEE,
  ROOT_CA_LIQUIDITY_POOL,
  ROOT_CA_UUID,
  ROUTING_COST_PER_PROVIDER,
  WALLET_AUDIT_PREFIX,
  WALLET_BALANCE_PREFIX,
  WALLET_HOLD_PREFIX,
  WORKFLOW_ACTION_COST,
  WORKFLOW_BASE_COST,
  WORKFLOW_COMPLEXITY_MULTIPLIER,
  WORKFLOW_STEP_COST
});
//# sourceMappingURL=constants.js.map
