// Constants for Eden Core Simulator

export const CHAIN_ID = "eden-core";

export const ROOT_CA_FEE = 0.02;
export const INDEXER_FEE = 0.005;

// iGas Calculation Constants
export const LLM_BASE_COST = 0.001; // Base cost per LLM call
export const ROUTING_COST_PER_PROVIDER = 0.0001; // Cost per service provider queried
export const REASONING_COST_MULTIPLIER = 1.5; // Multiplier for complex reasoning

// DEX Trading Constants
export const PRICE_IMPACT_PER_TRADE = 0.00001; // 0.001% = 0.00001
export const ITAX_RATE = 0.000005; // 0.0005% = 0.000005
export const ROOT_CA_LIQUIDITY_POOL = 1000; // Initial ROOT CA liquidity in SOL
export const ITAX_DISTRIBUTION = {
  rootCA: 0.4, // 40% to ROOT CA
  indexer: 0.3, // 30% to indexer (token provider)
  trader: 0.3, // 30% back to trader as rebate
};

// Ledger Settlement Stream Name
export const LEDGER_SETTLEMENT_STREAM = "eden:ledger:pending";

// ENCERT v1 Redis Revocation Stream
export const REVOCATION_STREAM = "eden:encert:revocations";

// Wallet Service Constants
export const WALLET_BALANCE_PREFIX = "wallet:balance:";
export const WALLET_HOLD_PREFIX = "wallet:hold:";
export const WALLET_AUDIT_PREFIX = "wallet:audit:";

// ROOT CA UUID
export const ROOT_CA_UUID = "eden:root:ca:00000000-0000-0000-0000-000000000001";

