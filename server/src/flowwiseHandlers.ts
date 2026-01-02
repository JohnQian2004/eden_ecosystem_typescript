/**
 * FlowWise Action Handlers
 * Maps workflow actions to actual function calls
 */

import type { WorkflowContext } from "./flowwise";
import { resolveLLM, extractQueryWithOpenAI, formatResponseWithOpenAI } from "./llm";
import { addLedgerEntry, processPayment, completeBooking, getCashierStatus } from "./ledger";
import { getWalletBalance, creditWallet, debitWallet } from "./wallet";
import { executeDEXTrade } from "./dex";
import { queryROOTCAServiceRegistry, queryServiceProviders, queryDEXPoolAPI } from "./serviceProvider";
import { validateCertificate, getCertificate } from "./garden";
import { ROOT_CA_SERVICE_REGISTRY, USERS, LEDGER } from "./state";
import { createSnapshot, persistSnapshot, streamToIndexers } from "./redis";
import type { User, TransactionSnapshot, LedgerEntry, LLMResponse, MovieListing, TokenListing } from "./types";

/**
 * Create action handlers map for FlowWise workflows
 */
export function createActionHandlers(): Map<string, (action: any, context: WorkflowContext) => Promise<any>> {
  const handlers = new Map<string, (action: any, context: WorkflowContext) => Promise<any>>();
  
  // LLM Actions
  handlers.set("llm_extract_query", async (action, context) => {
    const result = await extractQueryWithOpenAI(context.input);
    return { queryResult: result };
  });
  
  handlers.set("llm_format_response", async (action, context) => {
    const llmResponse = await resolveLLM(context.input);
    return { llmResponse, selectedListing: llmResponse.selectedListing, iGasCost: llmResponse.iGasCost };
  });
  
  // Service Registry Actions
  handlers.set("query_service_registry", async (action, context) => {
    const providers = await queryROOTCAServiceRegistry(action.serviceType, action.filters);
    return { providers };
  });
  
  handlers.set("query_dex_pools", async (action, context) => {
    const pools = await queryDEXPoolAPI(action.tokenSymbol, action.baseToken, action.action);
    return { listings: pools };
  });
  
  // Wallet Actions
  handlers.set("check_balance", async (action, context) => {
    const balance = await getWalletBalance(action.email);
    const required = action.required || 0;
    if (balance < required) {
      throw new Error(`Insufficient balance. Required: ${required}, Available: ${balance}`);
    }
    return { balance, hasSufficientBalance: true };
  });
  
  // Snapshot Actions
  handlers.set("create_snapshot", async (action, context) => {
    const snapshot = createSnapshot(action.payer, action.amount, action.providerId);
    return { snapshot };
  });
  
  handlers.set("persist_snapshot", async (action, context) => {
    await persistSnapshot(action.snapshot);
    return { snapshotPersisted: true };
  });
  
  handlers.set("stream_to_indexers", async (action, context) => {
    await streamToIndexers(action.snapshot);
    return { streamed: true };
  });
  
  // Certificate Actions
  handlers.set("validate_certificate", async (action, context) => {
    const isValid = validateCertificate(action.providerUuid);
    if (!isValid) {
      throw new Error(`Certificate invalid or revoked: ${action.providerUuid}`);
    }
    const cert = getCertificate(action.providerUuid);
    return { certificate: cert, isValid: true };
  });
  
  // Ledger Actions
  handlers.set("add_ledger_entry", async (action, context) => {
    const entry = addLedgerEntry(
      action.snapshot,
      action.serviceType,
      action.iGasCost,
      action.payerId,
      action.merchantName,
      action.providerUuid,
      action.bookingDetails
    );
    return { ledgerEntry: entry };
  });
  
  handlers.set("complete_booking", async (action, context) => {
    completeBooking(action.ledgerEntry);
    return { completed: true };
  });
  
  // Cashier Actions
  handlers.set("process_payment", async (action, context) => {
    const cashier = getCashierStatus();
    const user = context.user;
    const success = await processPayment(cashier, action.ledgerEntry, user);
    if (!success) {
      throw new Error(`Payment failed. Balance: ${user.balance}, Required: ${action.ledgerEntry.amount}`);
    }
    return { paymentSuccess: true, updatedBalance: user.balance, updatedCashier: cashier };
  });
  
  // DEX Actions
  handlers.set("execute_dex_trade", async (action, context) => {
    const trade = executeDEXTrade(action.poolId, action.action, action.tokenAmount, action.userEmail);
    return { trade };
  });
  
  // Review Actions
  handlers.set("apply_review", async (action, context) => {
    const user = action.user;
    const moviePrice = action.moviePrice;
    const rebate = moviePrice * 0.1; // 10% rebate
    
    const rebateResult = await creditWallet(
      user.email,
      rebate,
      crypto.randomUUID(),
      `Review rebate: ${action.review.rating}/5 rating`,
      {
        reviewRating: action.review.rating,
        moviePrice,
        rebateType: "review",
      }
    );
    
    if (rebateResult.success) {
      user.balance = rebateResult.balance;
    }
    
    return { rebate, updatedBalance: user.balance };
  });
  
  // Webhook Actions
  handlers.set("deliver_webhook", async (action, context) => {
    // Webhook delivery is async and best-effort
    const { deliverWebhook } = await import("./ledger");
    deliverWebhook(action.providerId, action.snapshot, action.ledgerEntry).catch(err => {
      console.warn(`⚠️  Webhook delivery failed:`, err);
    });
    return { webhookDelivered: true };
  });
  
  // Summary Actions
  handlers.set("generate_summary", async (action, context) => {
    return {
      summary: {
        balance: action.balance,
        rebate: action.rebate,
        fees: action.fees,
        iGasCost: action.iGasCost,
        selectedProvider: action.selectedProvider,
        movie: action.movie
      }
    };
  });
  
  // Validation Actions
  handlers.set("validate", async (action, context) => {
    const value = context[action.field];
    if (action.required && !value) {
      throw new Error(`Required field missing: ${action.field}`);
    }
    if (action.format === "email" && value && !value.includes("@")) {
      throw new Error(`Invalid email format: ${value}`);
    }
    return { [`${action.field}Valid`]: true };
  });
  
  return handlers;
}

