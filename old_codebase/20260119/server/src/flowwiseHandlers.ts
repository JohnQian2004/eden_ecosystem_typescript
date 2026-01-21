/**
 * FlowWise Action Handlers
 * Maps workflow actions to actual function calls
 */

import * as crypto from "crypto";
import type { WorkflowContext } from "./flowwise";
// COMMENTED OUT: resolveLLM is disabled - use formatResponseWithOpenAI directly instead
// import { resolveLLM, extractQueryWithOpenAI, formatResponseWithOpenAI } from "./llm";
import { extractQueryWithOpenAI, formatResponseWithOpenAI } from "./llm";
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
    // DISABLED: This handler uses resolveLLM which doesn't have hardcoded DEX mock data
    // Use formatResponseWithOpenAI/formatResponseWithDeepSeek directly instead
    // This handler is likely not being used, but updating it just in case
    console.warn(`⚠️ [flowwiseHandlers] llm_format_response handler called - this should use formatResponseWithOpenAI instead of resolveLLM`);
    const { formatResponseWithOpenAI } = await import("./llm");
    if (!context.listings || context.listings.length === 0) {
      throw new Error("Listings required for LLM formatting");
    }
    const llmResponse = await formatResponseWithOpenAI(
      context.listings,
      context.input || "",
      context.queryResult?.query?.filters
    );
    return { llmResponse, selectedListing: llmResponse.selectedListing, selectedListing2: llmResponse.selectedListing2, iGasCost: llmResponse.iGasCost };
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
    // Robust poolId resolution:
    // With decision steps, template replacement can yield null/undefined if selectedListing is missing fields.
    // Derive poolId from context/tokenSymbol/providerId when possible.
    let resolvedPoolId: string | undefined = action.poolId;
    const ctxAny: any = context as any;
    const ctxSelected = ctxAny.selectedListing || ctxAny.llmResponse?.selectedListing || ctxAny.selectedListing2 || ctxAny.llmResponse?.selectedListing2;
    if (!resolvedPoolId && ctxSelected?.poolId) {
      resolvedPoolId = ctxSelected.poolId;
    }
    if (!resolvedPoolId && (action.tokenSymbol || ctxAny.tokenSymbol || ctxAny.trade?.tokenSymbol || ctxSelected?.tokenSymbol)) {
      const sym = String(action.tokenSymbol || ctxAny.tokenSymbol || ctxAny.trade?.tokenSymbol || ctxSelected?.tokenSymbol).trim();
      if (sym) {
        resolvedPoolId = `pool-solana-${sym.toLowerCase()}`;
      }
    }
    if (!resolvedPoolId && (action.providerId || ctxSelected?.providerId)) {
      const pid = String(action.providerId || ctxSelected?.providerId);
      // dex-pool-tokena -> pool-solana-tokena
      if (pid.startsWith('dex-pool-')) {
        resolvedPoolId = `pool-solana-${pid.replace('dex-pool-', '')}`;
      }
    }
    if (!resolvedPoolId) {
      try {
        const { DEX_POOLS } = await import("./state");
        const first = Array.from(DEX_POOLS.keys())[0];
        if (first) {
          resolvedPoolId = first;
          console.warn(`⚠️ [flowwiseHandlers] execute_dex_trade: poolId missing; falling back to first available pool "${resolvedPoolId}"`);
        }
      } catch (e: any) {
        // ignore
      }
    }
    if (!resolvedPoolId) {
      throw new Error(`DEX trade missing poolId. selectedListing.poolId=${ctxSelected?.poolId ?? 'MISSING'}, tokenSymbol=${ctxSelected?.tokenSymbol ?? ctxAny.tokenSymbol ?? 'MISSING'}`);
    }

    const trade = executeDEXTrade(resolvedPoolId, action.action, action.tokenAmount, action.userEmail);
    
    // Update wallet balance based on trade action
    const { getWalletBalance, debitWallet, creditWallet } = await import("./wallet");
    const userEmail = action.userEmail || context.user?.email;
    
    if (!userEmail) {
      throw new Error("User email required for DEX trade");
    }
    
    // Get current balance
    const currentBalance = await getWalletBalance(userEmail);
    
    if (action.action === 'BUY') {
      // User pays baseToken, receives tokens
      // Debit baseAmount from wallet
      const debitResult = await debitWallet(
        userEmail,
        trade.baseAmount,
        trade.tradeId,
        `DEX BUY: ${trade.tokenAmount} ${trade.tokenSymbol} for ${trade.baseAmount} ${trade.baseToken}`,
        { tradeId: trade.tradeId, action: 'BUY' }
      );
      
      if (!debitResult.success) {
        throw new Error(`Failed to debit wallet for DEX trade: ${debitResult.error}`);
      }
      
      // Apply trader rebate (30% of iTax)
      const traderRebate = trade.iTax * 0.3;
      let rebateResult: any = null;
      if (traderRebate > 0) {
        rebateResult = await creditWallet(
          userEmail,
          traderRebate,
          crypto.randomUUID(),
          `DEX Trader Rebate: ${traderRebate.toFixed(6)} ${trade.baseToken}`,
          { tradeId: trade.tradeId, rebateType: 'trader' }
        );
        
        if (rebateResult.success) {
          console.log(`🎁 [DEX] Applied trader rebate: ${traderRebate.toFixed(6)} ${trade.baseToken}`);
        }
      }
      
      // Get final balance after rebate
      const finalBalance = rebateResult?.balance || debitResult.balance;
      
      // Update context with new balance
      if (context.user) {
        context.user.balance = finalBalance;
      }
      
      return { 
        trade, 
        updatedBalance: finalBalance,
        traderRebate 
      };
    } else {
      // SELL: User pays tokens, receives baseToken
      // Credit baseAmount to wallet
      // Note: Token balance tracking is future implementation
      const creditResult = await creditWallet(
        userEmail,
        trade.baseAmount,
        trade.tradeId,
        `DEX SELL: ${trade.tokenAmount} ${trade.tokenSymbol} for ${trade.baseAmount} ${trade.baseToken}`,
        { tradeId: trade.tradeId, action: 'SELL' }
      );
      
      if (!creditResult.success) {
        throw new Error(`Failed to credit wallet for DEX trade: ${creditResult.error}`);
      }
      
      // Apply trader rebate (30% of iTax)
      const traderRebate = trade.iTax * 0.3;
      let rebateResult: any = null;
      if (traderRebate > 0) {
        rebateResult = await creditWallet(
          userEmail,
          traderRebate,
          crypto.randomUUID(),
          `DEX Trader Rebate: ${traderRebate.toFixed(6)} ${trade.baseToken}`,
          { tradeId: trade.tradeId, rebateType: 'trader' }
        );
        
        if (rebateResult.success) {
          console.log(`🎁 [DEX] Applied trader rebate: ${traderRebate.toFixed(6)} ${trade.baseToken}`);
        }
      }
      
      // Get final balance after rebate
      const finalBalance = rebateResult?.balance || creditResult.balance;
      
      // Update context with new balance
      if (context.user) {
        context.user.balance = finalBalance;
      }
      
      return { 
        trade, 
        updatedBalance: finalBalance,
        traderRebate 
      };
    }
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

