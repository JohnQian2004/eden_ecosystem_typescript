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
var ledger_exports = {};
__export(ledger_exports, {
  addLedgerEntry: () => addLedgerEntry,
  completeBooking: () => completeBooking,
  deliverWebhook: () => deliverWebhook,
  getCashierStatus: () => getCashierStatus,
  getLatestSnapshot: () => getLatestSnapshot,
  getLedgerEntries: () => getLedgerEntries,
  getTransactionByPayer: () => getTransactionByPayer,
  getTransactionBySnapshot: () => getTransactionBySnapshot,
  initializeLedger: () => initializeLedger,
  processPayment: () => processPayment,
  pushLedgerEntryToSettlementStream: () => pushLedgerEntryToSettlementStream
});
module.exports = __toCommonJS(ledger_exports);
var crypto = __toESM(require("crypto"));
var https = __toESM(require("https"));
var http = __toESM(require("http"));
var import_state = require("./state");
var import_constants = require("./constants");
var import_wallet = require("./wallet");
let broadcastEvent;
let redis;
let ensureRedisConnection;
let SKIP_REDIS;
let CASHIER;
function initializeLedger(broadcastFn, redisInstance, ensureRedisFn, skipRedis, cashier) {
  broadcastEvent = broadcastFn;
  redis = redisInstance;
  ensureRedisConnection = ensureRedisFn;
  SKIP_REDIS = skipRedis;
  CASHIER = cashier;
  console.log(`\u2705 [Ledger] Initialized with broadcastEvent: ${typeof broadcastEvent === "function" ? "OK" : "MISSING"}`);
}
function getCashierStatus() {
  if (!CASHIER) {
    throw new Error("Ledger module not initialized. Call initializeLedger() first.");
  }
  return CASHIER;
}
function addLedgerEntry(snapshot, serviceType, iGasCost, payerId, merchantName, providerUuid, bookingDetails) {
  if (!providerUuid) {
    console.error(`\u274C Provider UUID is missing for merchant: ${merchantName}`);
  }
  if (!CASHIER) {
    throw new Error("Ledger module not initialized. Call initializeLedger() first.");
  }
  let entryAmount = snapshot.amount && snapshot.amount > 0 ? snapshot.amount : bookingDetails?.totalAmount && bookingDetails.totalAmount > 0 ? bookingDetails.totalAmount : bookingDetails?.price && bookingDetails.price > 0 ? bookingDetails.price : bookingDetails?.baseAmount && bookingDetails.baseAmount > 0 ? bookingDetails.baseAmount : 0;
  if (!entryAmount || entryAmount === 0) {
    console.error(`\u274C [Ledger] CRITICAL ERROR: Ledger entry amount is ${entryAmount}!`);
    console.error(`\u274C [Ledger] snapshot.amount: ${snapshot.amount}`);
    console.error(`\u274C [Ledger] bookingDetails?.price: ${bookingDetails?.price}`);
    console.error(`\u274C [Ledger] bookingDetails?.baseAmount: ${bookingDetails?.baseAmount}`);
    console.error(`\u274C [Ledger] bookingDetails?.totalAmount: ${bookingDetails?.totalAmount}`);
    console.error(`\u274C [Ledger] serviceType: ${serviceType}`);
    console.error(`\u274C [Ledger] Full bookingDetails:`, JSON.stringify(bookingDetails, null, 2));
    console.error(`\u274C [Ledger] Full snapshot:`, JSON.stringify(snapshot, null, 2));
    console.error(`\u274C [Ledger] This will cause payment to fail!`);
    throw new Error(`Cannot create ledger entry: amount is ${entryAmount}. Snapshot amount: ${snapshot.amount}, bookingDetails: ${JSON.stringify(bookingDetails)}`);
  }
  console.log(`\u{1F4B0} [Ledger] Using amount: ${entryAmount} (from snapshot: ${snapshot.amount}, bookingDetails totalAmount: ${bookingDetails?.totalAmount}, baseAmount: ${bookingDetails?.baseAmount}, price: ${bookingDetails?.price})`);
  console.log(`\u{1F4B0} [Ledger] For DEX trades: entry.amount=${entryAmount} (totalAmount with fees), bookingDetails.baseAmount=${bookingDetails?.baseAmount} (for display)`);
  if (!snapshot.txId) {
    console.warn(`\u26A0\uFE0F [Ledger] Warning: snapshot.txId is missing, generating one`);
  }
  const payerEmail = payerId || snapshot.payer || "unknown@example.com";
  if (!snapshot.payer && !payerId) {
    console.warn(`\u26A0\uFE0F [Ledger] Warning: Both snapshot.payer and payerId are missing, using fallback: ${payerEmail}`);
  } else if (snapshot.payer !== payerEmail) {
    console.log(`\u{1F4E7} [Ledger] Using payerId (${payerEmail}) instead of snapshot.payer (${snapshot.payer})`);
  }
  const entry = {
    entryId: crypto.randomUUID(),
    txId: snapshot.txId || `tx_${Date.now()}`,
    timestamp: snapshot.blockTime || Date.now(),
    payer: payerEmail,
    // Email address - always use payerId (user email from server)
    payerId: payerEmail,
    // Email address (same as payer)
    merchant: merchantName,
    // Provider name (e.g., "AMC Theatres", "MovieCom", "Cinemark")
    providerUuid: providerUuid || "MISSING-UUID",
    // Service provider UUID for certificate issuance
    serviceType,
    amount: entryAmount,
    iGasCost,
    fees: snapshot.feeSplit || {},
    status: "pending",
    cashierId: CASHIER.id,
    bookingDetails
  };
  console.log(`\u{1F4DD} [Ledger] \u2705 Ledger entry created successfully:`);
  console.log(`\u{1F4DD} [Ledger]   entryId: ${entry.entryId}`);
  console.log(`\u{1F4DD} [Ledger]   providerUuid: ${entry.providerUuid}`);
  console.log(`\u{1F4DD} [Ledger]   amount: ${entry.amount}`);
  console.log(`\u{1F4DD} [Ledger]   txId: ${entry.txId}`);
  console.log(`\u{1F4DD} [Ledger]   payer: ${entry.payer}`);
  console.log(`\u{1F4DD} [Ledger]   status: ${entry.status}`);
  import_state.LEDGER.push(entry);
  if (redis) {
    console.log(`\u{1F4BE} [Ledger] \u{1F510} ROOT CA: Saving ${import_state.LEDGER.length} ledger entries IMMEDIATELY (including new ${entry.serviceType} entry: ${entry.entryId})`);
    try {
      redis.saveLedgerEntries(import_state.LEDGER);
      console.log(`\u{1F4BE} [Ledger] \u2705 ROOT CA: Ledger entry ${entry.entryId} persisted IMMEDIATELY to disk`);
    } catch (err) {
      console.error(`\u274C [Ledger] CRITICAL: Failed to save ledger entry IMMEDIATELY: ${err.message}`);
      console.error(`\u274C [Ledger] Stack:`, err.stack);
    }
  } else {
    console.error(`\u274C [Ledger] CRITICAL: Redis instance not available! Cannot persist ledger entry: ${entry.entryId}`);
  }
  pushLedgerEntryToSettlementStream(entry).catch((err) => {
    console.error(`\u26A0\uFE0F  Failed to push ledger entry to settlement stream:`, err.message);
  });
  if (!broadcastEvent) {
    console.error(`\u274C [Ledger] broadcastEvent not initialized! Cannot send ledger_entry_added event`);
  } else {
    const ledgerEvent = {
      type: "ledger_entry_added",
      component: "ledger",
      message: `Ledger entry created: ${entry.entryId}`,
      timestamp: Date.now(),
      data: { entry }
    };
    console.log(`\u{1F4E1} [Broadcast] Sending ledger_entry_added event: ${entry.entryId} for ${entry.merchant}`);
    broadcastEvent(ledgerEvent);
  }
  return entry;
}
async function pushLedgerEntryToSettlementStream(entry) {
  const iGas = entry.iGasCost;
  const iTax = entry.bookingDetails?.iTax || 0;
  const rootCAFee = entry.fees?.eden ?? entry.fees?.rootCA ?? iGas * import_constants.ROOT_CA_FEE;
  const indexerFee = entry.fees?.indexer ?? iGas * import_constants.INDEXER_FEE;
  const providerFee = entry.fees?.provider ?? 0;
  const cashierFee = entry.fees?.cashier ?? 0;
  try {
    const { recordFeePayment } = await import("./accountant");
    recordFeePayment(
      entry.serviceType,
      iGas,
      iTax,
      rootCAFee,
      indexerFee,
      providerFee,
      cashierFee
    );
    console.log(`\u{1F4CA} [Accountant] \u2705 Recorded fees for ${entry.serviceType}: iGas=${iGas.toFixed(6)}, iTax=${iTax.toFixed(6)}, ROOT CA=${rootCAFee.toFixed(6)}, Indexer=${indexerFee.toFixed(6)}`);
    console.log(`\u{1F4CA} [Accountant] Entry ID: ${entry.entryId}, Amount: ${entry.amount}, Status: ${entry.status}`);
  } catch (err) {
    console.error(`\u274C [Settlement] Failed to record fee payment in Accountant: ${err.message}`);
    console.error(`\u274C [Settlement] Error stack:`, err.stack);
  }
  if (SKIP_REDIS || !redis.isOpen) {
    console.log(`\u{1F4E4} [Settlement] Ledger entry ${entry.entryId} queued (Redis disabled)`);
    return;
  }
  try {
    await ensureRedisConnection();
    const provider = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.uuid === entry.providerUuid);
    const gardenId = provider?.gardenId || "unknown";
    const settlementPayload = {
      entryId: entry.entryId,
      txId: entry.txId,
      timestamp: entry.timestamp.toString(),
      payer: entry.payer,
      payerId: entry.payerId,
      merchant: entry.merchant,
      providerUuid: entry.providerUuid,
      gardenId,
      serviceType: entry.serviceType,
      amount: entry.amount.toString(),
      iGas: iGas.toString(),
      iTax: iTax.toString(),
      fees: JSON.stringify({
        rootCA: rootCAFee,
        indexer: indexerFee,
        ...entry.fees
      }),
      status: entry.status,
      cashierId: entry.cashierId,
      bookingDetails: entry.bookingDetails ? JSON.stringify(entry.bookingDetails) : ""
    };
    await redis.xAdd(import_constants.LEDGER_SETTLEMENT_STREAM, "*", settlementPayload);
    console.log(`\u{1F4E4} [Settlement] Pushed ledger entry ${entry.entryId} to ROOT CA settlement stream`);
    console.log(`   iGas: ${iGas}, iTax: ${iTax}, ROOT CA Fee: ${rootCAFee}, Indexer Fee: ${indexerFee}`);
    broadcastEvent({
      type: "ledger_entry_pushed",
      component: "settlement",
      message: `Ledger entry pushed to settlement stream: ${entry.entryId}`,
      timestamp: Date.now(),
      data: {
        entryId: entry.entryId,
        iGas,
        iTax,
        fees: settlementPayload.fees,
        rootCAFee,
        indexerFee,
        indexerId: gardenId
        // Legacy field (will be renamed to gardenId in future)
      }
    });
  } catch (err) {
    console.error(`\u274C Failed to push ledger entry to settlement stream:`, err.message);
    throw err;
  }
}
async function processPayment(cashier, entry, user) {
  console.log(`   \u{1F4B0} [Ledger] ========================================`);
  console.log(`   \u{1F4B0} [Ledger] \u{1F4B3} processPayment FUNCTION CALLED`);
  console.log(`   \u{1F4B0} [Ledger] Entry ID: ${entry.entryId}`);
  console.log(`   \u{1F4B0} [Ledger] Entry Amount: ${entry.amount}`);
  console.log(`   \u{1F4B0} [Ledger] Entry Status (before): ${entry.status}`);
  console.log(`   \u{1F4B0} [Ledger] User Email: ${user.email}`);
  console.log(`   \u{1F4B0} [Ledger] Cashier ID: ${cashier.id}`);
  console.log(`   \u{1F4B0} [Ledger] Cashier processedCount (before): ${cashier.processedCount}`);
  console.log(`   \u{1F4B0} [Ledger] Cashier totalProcessed (before): ${cashier.totalProcessed}`);
  console.log(`   \u{1F4B0} [Ledger] ========================================`);
  if (!entry.amount || entry.amount <= 0) {
    console.error(`   \u274C [Ledger] Cannot process payment: entry ${entry.entryId} has invalid amount: ${entry.amount}`);
    entry.status = "failed";
    broadcastEvent({
      type: "cashier_payment_failed",
      component: "cashier",
      message: `Payment failed: Invalid amount (${entry.amount})`,
      timestamp: Date.now(),
      data: {
        entry,
        cashier,
        error: `Invalid amount: ${entry.amount}`,
        requiredAmount: entry.amount
      }
    });
    return false;
  }
  console.log(`   \u{1F4B0} [Ledger] Step 1: Amount validation passed`);
  console.log(`   \u{1F4B0} [Ledger] Validated amount: ${entry.amount} \u{1F34E} APPLES`);
  const { getWalletBalance: getWalletBalance2 } = await import("./wallet");
  const balanceBeforeIntent = await getWalletBalance2(user.email);
  console.log(`   \u{1F4B0} [Ledger] Step 1.5: Current wallet balance: ${balanceBeforeIntent} \u{1F34E} APPLES`);
  console.log(`   \u{1F4B0} [Ledger] Step 2: Calling processWalletIntent`);
  console.log(`   \u{1F4B0} [Ledger] Intent details:`, {
    intent: "DEBIT",
    email: user.email,
    amount: entry.amount,
    txId: entry.txId,
    entryId: entry.entryId,
    reason: `Payment to ${entry.merchant} (${entry.serviceType})`
  });
  const walletResult = await (0, import_wallet.processWalletIntent)({
    intent: "DEBIT",
    email: user.email,
    amount: entry.amount,
    txId: entry.txId,
    entryId: entry.entryId,
    reason: `Payment to ${entry.merchant} (${entry.serviceType})`,
    metadata: {
      merchant: entry.merchant,
      serviceType: entry.serviceType,
      cashierId: cashier.id
    }
  });
  console.log(`   \u{1F4B0} [Ledger] Step 2.5: Wallet intent completed`);
  console.log(`   \u{1F4B0} [Ledger] Wallet result:`, {
    success: walletResult.success,
    balance: walletResult.balance,
    previousBalance: walletResult.previousBalance,
    error: walletResult.error
  });
  const balanceAfterIntent = await getWalletBalance2(user.email);
  console.log(`   \u{1F4B0} [Ledger] Balance verification:`, {
    before: balanceBeforeIntent,
    after: balanceAfterIntent,
    expectedChange: entry.amount,
    actualChange: balanceBeforeIntent - balanceAfterIntent,
    matches: balanceBeforeIntent - balanceAfterIntent === entry.amount
  });
  if (!walletResult.success) {
    console.error(`   \u274C [Ledger] Wallet intent failed: ${walletResult.error}`);
    entry.status = "failed";
    const walletBalance = await getWalletBalance2(user.email);
    broadcastEvent({
      type: "cashier_payment_failed",
      component: "cashier",
      message: `Payment failed: ${walletResult.error}`,
      timestamp: Date.now(),
      data: {
        entry,
        cashier,
        error: walletResult.error,
        walletBalance,
        userBalance: user.balance,
        requiredAmount: entry.amount
      }
    });
    return false;
  }
  console.log(`   \u{1F4B0} [Ledger] Step 3: Wallet intent succeeded`);
  user.balance = walletResult.balance;
  console.log(`   \u{1F4B0} [Ledger] Updated user balance: ${user.balance}`);
  if (!CASHIER) {
    throw new Error("CASHIER not initialized");
  }
  console.log(`   \u{1F4B0} [Ledger] Step 4: Updating CASHIER object`);
  console.log(`   \u{1F4B0} [Ledger] CASHIER processedCount (before): ${CASHIER.processedCount}`);
  console.log(`   \u{1F4B0} [Ledger] CASHIER totalProcessed (before): ${CASHIER.totalProcessed}`);
  CASHIER.processedCount++;
  CASHIER.totalProcessed += entry.amount;
  console.log(`   \u{1F4B0} [Ledger] CASHIER processedCount (after): ${CASHIER.processedCount}`);
  console.log(`   \u{1F4B0} [Ledger] CASHIER totalProcessed (after): ${CASHIER.totalProcessed}`);
  cashier.processedCount = CASHIER.processedCount;
  cashier.totalProcessed = CASHIER.totalProcessed;
  console.log(`   \u{1F4B0} [Ledger] Step 5: Updating entry status to 'processed'`);
  console.log(`   \u{1F4B0} [Ledger] Entry status (before update): ${entry.status}`);
  entry.status = "processed";
  console.log(`   \u{1F4B0} [Ledger] Entry status (after update): ${entry.status}`);
  console.log(`   \u{1F4B0} [Ledger] Step 6: Persisting ledger entry IMMEDIATELY (ROOT CA)`);
  console.log(`   \u{1F4B0} [Ledger] Redis available: ${!!redis}`);
  if (redis) {
    redis.saveLedgerEntries(import_state.LEDGER);
    console.log(`   \u{1F4BE} [Ledger] \u2705 ROOT CA: Persisted ledger entry ${entry.entryId} IMMEDIATELY after payment processing`);
    const persistedEntry = import_state.LEDGER.find((e) => e.entryId === entry.entryId);
    console.log(`   \u{1F4B0} [Ledger] Verification - Entry in LEDGER array:`, persistedEntry ? {
      entryId: persistedEntry.entryId,
      status: persistedEntry.status,
      amount: persistedEntry.amount
    } : "NOT FOUND");
  } else {
    console.error(`   \u274C [Ledger] CRITICAL: Redis not available! Cannot persist ledger entry!`);
  }
  console.log(`   \u{1F4B0} [Ledger] Step 7: Broadcasting payment processed event`);
  if (!broadcastEvent) {
    console.error(`   \u274C [Ledger] broadcastEvent not initialized! Cannot send cashier_payment_processed event`);
  } else {
    const paymentEvent = {
      type: "cashier_payment_processed",
      component: "cashier",
      message: `${cashier.name} processed payment: ${entry.amount} \u{1F34E} APPLES`,
      timestamp: Date.now(),
      data: { entry, cashier, userBalance: walletResult.balance, walletService: "wallet-service-001" }
    };
    console.log(`   \u{1F4E1} [Broadcast] Sending cashier_payment_processed event: ${cashier.name} processed ${entry.amount} \u{1F34E} APPLES`);
    broadcastEvent(paymentEvent);
  }
  console.log(`   \u{1F4B0} [Ledger] ========================================`);
  console.log(`   \u{1F4B0} [Ledger] \u2705 processPayment COMPLETED SUCCESSFULLY`);
  console.log(`   \u{1F4B0} [Ledger] Entry Status: ${entry.status}`);
  console.log(`   \u{1F4B0} [Ledger] CASHIER processedCount: ${CASHIER.processedCount}`);
  console.log(`   \u{1F4B0} [Ledger] CASHIER totalProcessed: ${CASHIER.totalProcessed}`);
  console.log(`   \u{1F4B0} [Ledger] ========================================`);
  return true;
}
function completeBooking(entry) {
  entry.status = "completed";
  broadcastEvent({
    type: "ledger_booking_completed",
    component: "ledger",
    message: `Booking completed: ${entry.entryId}`,
    timestamp: Date.now(),
    data: { entry }
  });
}
function getLedgerEntries(payerEmail) {
  let entries;
  if (payerEmail) {
    entries = import_state.LEDGER.filter((entry) => entry.payer === payerEmail);
  } else {
    entries = [...import_state.LEDGER];
  }
  return entries.map((entry) => ({
    ...entry,
    iGasCost: typeof entry.iGasCost === "string" ? parseFloat(entry.iGasCost) : entry.iGasCost || 0,
    amount: typeof entry.amount === "string" ? parseFloat(entry.amount) : entry.amount || 0,
    timestamp: typeof entry.timestamp === "string" ? parseInt(entry.timestamp) : entry.timestamp || Date.now(),
    // Normalize fees object if it exists
    fees: entry.fees ? Object.fromEntries(
      Object.entries(entry.fees).map(([key, value]) => [
        key,
        typeof value === "string" ? parseFloat(value) : value || 0
      ])
    ) : {}
  }));
}
function getTransactionByPayer(payerEmail) {
  return import_state.LEDGER.filter((entry) => entry.payer === payerEmail && entry.status === "completed");
}
function getTransactionBySnapshot(snapshotId) {
  return import_state.LEDGER.find((entry) => entry.txId === snapshotId) || null;
}
function getLatestSnapshot(providerId) {
  const providerEntries = import_state.LEDGER.filter(
    (entry) => entry.merchant === providerId || entry.providerUuid === providerId
  );
  if (providerEntries.length === 0)
    return null;
  return providerEntries.filter((entry) => entry.status === "completed").sort((a, b) => b.timestamp - a.timestamp)[0] || null;
}
async function deliverWebhook(providerId, snapshot, ledgerEntry) {
  const webhook = import_state.PROVIDER_WEBHOOKS.get(providerId);
  if (!webhook) {
    return;
  }
  console.log(`\u{1F4E4} [Service Provider] Webhook Delivery Attempt: ${providerId} \u2192 ${webhook.webhookUrl} (TX: ${snapshot.txId.substring(0, 8)}...)`);
  broadcastEvent({
    type: "provider_webhook_attempt",
    component: "service_provider",
    message: `Webhook Delivery Attempt: ${providerId}`,
    timestamp: Date.now(),
    data: {
      providerId,
      txId: snapshot.txId,
      webhookUrl: webhook.webhookUrl
    }
  });
  const payload = JSON.stringify({
    event: "tx-finalized",
    snapshot: {
      chainId: snapshot.chainId,
      txId: snapshot.txId,
      slot: snapshot.slot,
      blockTime: snapshot.blockTime,
      payer: snapshot.payer,
      merchant: snapshot.merchant,
      amount: snapshot.amount,
      feeSplit: snapshot.feeSplit
    },
    ledger: {
      entryId: ledgerEntry.entryId,
      status: ledgerEntry.status,
      serviceType: ledgerEntry.serviceType,
      bookingDetails: ledgerEntry.bookingDetails
    },
    timestamp: Date.now()
  });
  try {
    const parsedUrl = new URL(webhook.webhookUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": payload.length
      }
    };
    const client = parsedUrl.protocol === "https:" ? https : http;
    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let responseData = "";
        res.on("data", (chunk) => {
          responseData += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            webhook.failureCount = 0;
            console.log(`\u2705 [Service Provider] Webhook delivered: ${providerId} (${res.statusCode})`);
            broadcastEvent({
              type: "provider_webhook_delivered",
              component: "service_provider",
              message: `Webhook delivered: ${providerId}`,
              timestamp: Date.now(),
              data: { providerId, statusCode: res.statusCode }
            });
            resolve();
          } else {
            webhook.failureCount++;
            console.warn(`\u26A0\uFE0F  [Service Provider] Webhook failed: ${providerId} (${res.statusCode})`);
            reject(new Error(`Webhook delivery failed: ${res.statusCode}`));
          }
        });
      });
      req.on("error", (err) => {
        webhook.failureCount++;
        console.error(`\u274C [Service Provider] Webhook error: ${providerId}`, err.message);
        reject(err);
      });
      req.write(payload);
      req.end();
    });
  } catch (err) {
    webhook.failureCount++;
    console.error(`\u274C [Service Provider] Webhook delivery failed: ${providerId}`, err.message);
    throw err;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addLedgerEntry,
  completeBooking,
  deliverWebhook,
  getCashierStatus,
  getLatestSnapshot,
  getLedgerEntries,
  getTransactionByPayer,
  getTransactionBySnapshot,
  initializeLedger,
  processPayment,
  pushLedgerEntryToSettlementStream
});
//# sourceMappingURL=ledger.js.map
