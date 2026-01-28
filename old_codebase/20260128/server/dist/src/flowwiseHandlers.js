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
var flowwiseHandlers_exports = {};
__export(flowwiseHandlers_exports, {
  createActionHandlers: () => createActionHandlers
});
module.exports = __toCommonJS(flowwiseHandlers_exports);
var crypto = __toESM(require("crypto"));
var import_llm = require("./llm");
var import_ledger = require("./ledger");
var import_wallet = require("./wallet");
var import_serviceProvider = require("./serviceProvider");
var import_garden = require("./garden");
var import_redis = require("./redis");
function createActionHandlers() {
  const handlers = /* @__PURE__ */ new Map();
  handlers.set("llm_extract_query", async (action, context) => {
    const result = await (0, import_llm.extractQueryWithOpenAI)(context.input);
    return { queryResult: result };
  });
  handlers.set("llm_format_response", async (action, context) => {
    console.warn(`\u26A0\uFE0F [flowwiseHandlers] llm_format_response handler called - this should use formatResponseWithOpenAI instead of resolveLLM`);
    if (!context.listings || context.listings.length === 0) {
      console.log(`\u26A0\uFE0F [flowwiseHandlers] No listings found - creating "no results" response`);
      const userInput = context.input || context.userInput || "your request";
      const serviceType = context.serviceType || context.queryResult?.query?.serviceType || "service";
      const noResultsResponse = {
        message: `I couldn't find any ${serviceType} options matching "${userInput}". Please try a different search term or check back later.`,
        listings: [],
        selectedListing: null,
        selectedListing2: null,
        iGasCost: 0
        // No LLM cost for no-results response
      };
      return {
        llmResponse: noResultsResponse,
        selectedListing: null,
        selectedListing2: null,
        iGasCost: 0
      };
    }
    const { formatResponseWithOpenAI: formatResponseWithOpenAI2 } = await import("./llm");
    const llmResponse = await formatResponseWithOpenAI2(
      context.listings,
      context.input || context.userInput || "",
      context.queryResult?.query?.filters
    );
    return { llmResponse, selectedListing: llmResponse.selectedListing, selectedListing2: llmResponse.selectedListing2, iGasCost: llmResponse.iGasCost };
  });
  handlers.set("query_service_registry", async (action, context) => {
    const providers = await (0, import_serviceProvider.queryROOTCAServiceRegistry)(action.serviceType, action.filters);
    return { providers };
  });
  handlers.set("query_dex_pools", async (action, context) => {
    const pools = await (0, import_serviceProvider.queryDEXPoolAPI)(action.tokenSymbol, action.baseToken, action.action);
    return { listings: pools };
  });
  handlers.set("check_balance", async (action, context) => {
    const balance = await (0, import_wallet.getWalletBalance)(action.email);
    const required = action.required || 0;
    if (balance < required) {
      throw new Error(`Insufficient balance. Required: ${required}, Available: ${balance}`);
    }
    return { balance, hasSufficientBalance: true };
  });
  handlers.set("create_snapshot", async (action, context) => {
    const snapshot = (0, import_redis.createSnapshot)(action.payer, action.amount, action.providerId);
    return { snapshot };
  });
  handlers.set("persist_snapshot", async (action, context) => {
    await (0, import_redis.persistSnapshot)(action.snapshot);
    return { snapshotPersisted: true };
  });
  handlers.set("stream_to_indexers", async (action, context) => {
    await (0, import_redis.streamToIndexers)(action.snapshot);
    return { streamed: true };
  });
  handlers.set("validate_certificate", async (action, context) => {
    const isValid = (0, import_garden.validateCertificate)(action.providerUuid);
    if (!isValid) {
      throw new Error(`Certificate invalid or revoked: ${action.providerUuid}`);
    }
    const cert = (0, import_garden.getCertificate)(action.providerUuid);
    return { certificate: cert, isValid: true };
  });
  handlers.set("add_ledger_entry", async (action, context) => {
    const entry = (0, import_ledger.addLedgerEntry)(
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
    (0, import_ledger.completeBooking)(action.ledgerEntry);
    return { completed: true };
  });
  handlers.set("process_payment", async (action, context) => {
    const cashier = (0, import_ledger.getCashierStatus)();
    const user = context.user;
    const success = await (0, import_ledger.processPayment)(cashier, action.ledgerEntry, user);
    if (!success) {
      throw new Error(`Payment failed. Balance: ${user.balance}, Required: ${action.ledgerEntry.amount}`);
    }
    return { paymentSuccess: true, updatedBalance: user.balance, updatedCashier: cashier };
  });
  handlers.set("execute_dex_trade", async (action, context) => {
    const { createDEXOrder, processOrder, createOrderIntentFromQuery } = await import("./dex/orderProcessor");
    const ctxAny = context;
    const ctxSelected = ctxAny.selectedListing || ctxAny.llmResponse?.selectedListing || ctxAny.selectedListing2 || ctxAny.llmResponse?.selectedListing2;
    const orderIntent = createOrderIntentFromQuery(
      context.queryResult,
      ctxSelected,
      context.userInput || ""
    );
    if (action.action)
      orderIntent.side = action.action;
    if (action.tokenAmount)
      orderIntent.amount = action.tokenAmount;
    if (action.price)
      orderIntent.price = action.price;
    if (action.matchingModel)
      orderIntent.matchingModel = action.matchingModel;
    const baseAmount = context.baseAmount || context.queryResult?.query?.filters?.baseAmount;
    if (baseAmount && baseAmount > 0 && (!orderIntent.amount || orderIntent.amount === 1)) {
      const poolPrice = ctxSelected?.price || 1e-3;
      orderIntent.amount = baseAmount / poolPrice;
      console.log(`\u{1F4B0} [DEX Handler] Converting baseAmount to tokenAmount: ${baseAmount} ${ctxSelected?.baseToken || "SOL"} / ${poolPrice} = ${orderIntent.amount} ${ctxSelected?.tokenSymbol || "TOKEN"}`);
    }
    if (ctxSelected?.tokenSymbol && ctxSelected?.baseToken) {
      orderIntent.pair = `${ctxSelected.tokenSymbol}/${ctxSelected.baseToken}`;
    }
    const userEmail = action.userEmail || context.user?.email;
    if (!userEmail) {
      throw new Error("User email required for DEX trade");
    }
    const userId = context.user?.id || `u_${userEmail.replace("@", "_").replace(".", "_")}`;
    const gardenId = ctxSelected?.gardenId || ctxSelected?.providerId || "Garden-DEX-T1";
    console.log(`\u{1F4DD} [DEX] Creating order from intent:`, orderIntent);
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
    console.log(`\u{1F504} [DEX] Processing order: ${order.orderId}`);
    const result = await processOrder(order);
    context.dexOrder = order;
    if (result.trade) {
      context.trade = result.trade;
      context.totalCost = result.trade.baseAmount + (context.iGasCost || 0);
    }
    const { getWalletBalance: getWalletBalance2 } = await import("./wallet");
    const currentBalance = await getWalletBalance2(userEmail);
    if (context.user) {
      context.user.balance = currentBalance;
    }
    return {
      order,
      trade: result.trade,
      updatedBalance: currentBalance,
      settlement: result.settlement,
      matchResult: result.matchResult,
      ledgerEntry: result.ledgerEntry
      // Ledger entry created by settlement
    };
  });
  handlers.set("apply_review", async (action, context) => {
    const user = action.user;
    const moviePrice = action.moviePrice;
    const rebate = moviePrice * 0.1;
    const rebateResult = await (0, import_wallet.creditWallet)(
      user.email,
      rebate,
      crypto.randomUUID(),
      `Review rebate: ${action.review.rating}/5 rating`,
      {
        reviewRating: action.review.rating,
        moviePrice,
        rebateType: "review"
      }
    );
    if (rebateResult.success) {
      user.balance = rebateResult.balance;
    }
    return { rebate, updatedBalance: user.balance };
  });
  handlers.set("deliver_webhook", async (action, context) => {
    const { deliverWebhook } = await import("./ledger");
    deliverWebhook(action.providerId, action.snapshot, action.ledgerEntry).catch((err) => {
      console.warn(`\u26A0\uFE0F  Webhook delivery failed:`, err);
    });
    return { webhookDelivered: true };
  });
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createActionHandlers
});
//# sourceMappingURL=flowwiseHandlers.js.map
