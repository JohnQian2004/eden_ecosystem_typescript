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
    
    // Handle case when there are no listings - return a helpful "no results" message
    if (!context.listings || context.listings.length === 0) {
      console.log(`⚠️ [flowwiseHandlers] No listings found - creating "no results" response`);
      const userInput = context.input || context.userInput || "your request";
      const serviceType = context.serviceType || context.queryResult?.query?.serviceType || "service";
      
      // Create a helpful "no results" response
      const noResultsResponse = {
        message: `I couldn't find any ${serviceType} options matching "${userInput}". Please try a different search term or check back later.`,
        listings: [],
        selectedListing: null,
        selectedListing2: null,
        iGasCost: 0 // No LLM cost for no-results response
      };
      
      return { 
        llmResponse: noResultsResponse, 
        selectedListing: null, 
        selectedListing2: null, 
        iGasCost: 0 
      };
    }
    
    const { formatResponseWithOpenAI } = await import("./llm");
    const llmResponse = await formatResponseWithOpenAI(
      context.listings,
      context.input || context.userInput || "",
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
    // NEW: Use Order Processor for real-time DEX trading
    const { createDEXOrder, processOrder, createOrderIntentFromQuery } = await import("./dex/orderProcessor");
    
    const ctxAny: any = context as any;
    const ctxSelected = ctxAny.selectedListing || ctxAny.llmResponse?.selectedListing || ctxAny.selectedListing2 || ctxAny.llmResponse?.selectedListing2;
    
    // Create order intent from context
    const orderIntent = createOrderIntentFromQuery(
      context.queryResult,
      ctxSelected,
      context.userInput || ''
    );
    
    // Override with action parameters if provided
    if (action.action) orderIntent.side = action.action;
    if (action.tokenAmount) orderIntent.amount = action.tokenAmount;
    if (action.price) orderIntent.price = action.price;
    if (action.matchingModel) orderIntent.matchingModel = action.matchingModel;
    
    // CRITICAL: If baseAmount is specified but tokenAmount is not, convert baseAmount to tokenAmount
    // This handles cases like "Trade 2 SOL with TOKEN" where user specifies baseAmount
    const baseAmount = context.baseAmount || context.queryResult?.query?.filters?.baseAmount;
    if (baseAmount && baseAmount > 0 && (!orderIntent.amount || orderIntent.amount === 1)) {
      // Calculate tokenAmount from baseAmount using pool price
      const poolPrice = ctxSelected?.price || 0.001; // Default price if missing
      orderIntent.amount = baseAmount / poolPrice;
      console.log(`💰 [DEX Handler] Converting baseAmount to tokenAmount: ${baseAmount} ${ctxSelected?.baseToken || 'SOL'} / ${poolPrice} = ${orderIntent.amount} ${ctxSelected?.tokenSymbol || 'TOKEN'}`);
    }
    
    // Determine pair from selected listing or context
    if (ctxSelected?.tokenSymbol && ctxSelected?.baseToken) {
      orderIntent.pair = `${ctxSelected.tokenSymbol}/${ctxSelected.baseToken}`;
    }
    
    const userEmail = action.userEmail || context.user?.email;
    if (!userEmail) {
      throw new Error("User email required for DEX trade");
    }
    
    const userId = context.user?.id || `u_${userEmail.replace('@', '_').replace('.', '_')}`;
    const gardenId = ctxSelected?.gardenId || ctxSelected?.providerId || "Garden-DEX-T1";
    
    // Create order
    console.log(`📝 [DEX] Creating order from intent:`, orderIntent);
    const order = createDEXOrder(
      orderIntent,
      userId,
      userEmail,
      gardenId,
      {
        workflowExecutionId: context.workflowExecutionId,
        selectedListing: ctxSelected
      }
    );
    
    // Process order (match, settle, broadcast)
    console.log(`🔄 [DEX] Processing order: ${order.orderId}`);
    const result = await processOrder(order);
    
    // Update context with order and trade
    context.dexOrder = order;
    if (result.trade) {
      context.trade = result.trade;
      context.totalCost = result.trade.baseAmount + (context.iGasCost || 0);
    }
    
    // Update wallet balance (settlement handles actual debit/credit, but we update context for immediate feedback)
    const { getWalletBalance } = await import("./wallet");
    const currentBalance = await getWalletBalance(userEmail);
    if (context.user) {
      context.user.balance = currentBalance;
    }
    
    return {
      order,
      trade: result.trade,
      updatedBalance: currentBalance,
      settlement: result.settlement,
      matchResult: result.matchResult,
      ledgerEntry: result.ledgerEntry // Ledger entry created by settlement
    };
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

