/**
 * Ledger Module
 * Handles ledger entry management, payment processing, and settlement
 */

import * as crypto from "crypto";
import * as https from "https";
import * as http from "http";
import type { TransactionSnapshot, LedgerEntry, Cashier, User } from "./types";
import { LEDGER, ROOT_CA_SERVICE_REGISTRY, PROVIDER_WEBHOOKS } from "./state";
import { LEDGER_SETTLEMENT_STREAM, ROOT_CA_FEE, INDEXER_FEE } from "./constants";
import { processWalletIntent, getWalletBalance } from "./wallet";

// Dependencies that need to be injected
let broadcastEvent: (event: any) => void;
let redis: any; // InMemoryRedisServer instance
let ensureRedisConnection: () => Promise<void>;
let SKIP_REDIS: boolean;

// Cashier instance
let CASHIER: Cashier;

/**
 * Initialize ledger module with dependencies
 */
export function initializeLedger(
  broadcastFn: (event: any) => void,
  redisInstance: any,
  ensureRedisFn: () => Promise<void>,
  skipRedis: boolean,
  cashier: Cashier
): void {
  broadcastEvent = broadcastFn;
  redis = redisInstance;
  ensureRedisConnection = ensureRedisFn;
  SKIP_REDIS = skipRedis;
  CASHIER = cashier;
  console.log(`✅ [Ledger] Initialized with broadcastEvent: ${typeof broadcastEvent === 'function' ? 'OK' : 'MISSING'}`);
}

/**
 * Get cashier status (for API endpoints)
 */
export function getCashierStatus(): Cashier {
  if (!CASHIER) {
    throw new Error("Ledger module not initialized. Call initializeLedger() first.");
  }
  return { ...CASHIER };
}

/**
 * Add a ledger entry
 */
export function addLedgerEntry(
  snapshot: TransactionSnapshot,
  serviceType: string,
  iGasCost: number,
  payerId: string,
  merchantName: string, // Provider name (e.g., "AMC Theatres")
  providerUuid: string, // Service provider UUID for certificate issuance
  bookingDetails?: { 
    movieTitle?: string; 
    showtime?: string; 
    location?: string;
    // DEX trade details
    tokenSymbol?: string;
    baseToken?: string;
    action?: 'BUY' | 'SELL';
    tokenAmount?: number;
    baseAmount?: number;
    price?: number;
    iTax?: number;
  }
): LedgerEntry {
  // payerId should be the email address (same as payer)
  if (!providerUuid) {
    console.error(`❌ Provider UUID is missing for merchant: ${merchantName}`);
  }
  
  if (!CASHIER) {
    throw new Error("Ledger module not initialized. Call initializeLedger() first.");
  }
  
  // CRITICAL: Ensure amount is set (use bookingDetails.price if snapshot.amount is missing/zero)
  // Priority: snapshot.amount > bookingDetails.price > 0 (but 0 is invalid)
  let entryAmount = snapshot.amount && snapshot.amount > 0 
    ? snapshot.amount 
    : (bookingDetails?.price && bookingDetails.price > 0 ? bookingDetails.price : 0);
  
  if (!entryAmount || entryAmount === 0) {
    console.error(`❌ [Ledger] CRITICAL ERROR: Ledger entry amount is ${entryAmount}!`);
    console.error(`❌ [Ledger] snapshot.amount: ${snapshot.amount}`);
    console.error(`❌ [Ledger] bookingDetails?.price: ${bookingDetails?.price}`);
    console.error(`❌ [Ledger] This will cause payment to fail!`);
    // Don't create entry with invalid amount - throw error instead
    throw new Error(`Cannot create ledger entry: amount is ${entryAmount}. Snapshot amount: ${snapshot.amount}, bookingDetails price: ${bookingDetails?.price}`);
  }
  
  console.log(`💰 [Ledger] Using amount: ${entryAmount} (from snapshot: ${snapshot.amount}, bookingDetails: ${bookingDetails?.price})`);

  // CRITICAL: Ensure all required fields are present
  if (!snapshot.txId) {
    console.warn(`⚠️ [Ledger] Warning: snapshot.txId is missing, generating one`);
  }
  if (!snapshot.payer) {
    console.warn(`⚠️ [Ledger] Warning: snapshot.payer is missing`);
  }

  const entry: LedgerEntry = {
    entryId: crypto.randomUUID(),
    txId: snapshot.txId || `tx_${Date.now()}`,
    timestamp: snapshot.blockTime || Date.now(),
    payer: snapshot.payer || payerId, // Email address
    payerId: snapshot.payer || payerId, // Email address (same as payer)
    merchant: merchantName, // Provider name (e.g., "AMC Theatres", "MovieCom", "Cinemark")
    providerUuid: providerUuid || 'MISSING-UUID', // Service provider UUID for certificate issuance
    serviceType: serviceType,
    amount: entryAmount,
    iGasCost: iGasCost,
    fees: snapshot.feeSplit || {},
    status: 'pending',
    cashierId: CASHIER.id,
    bookingDetails: bookingDetails,
  };
  
  console.log(`📝 [Ledger] ✅ Ledger entry created successfully:`);
  console.log(`📝 [Ledger]   entryId: ${entry.entryId}`);
  console.log(`📝 [Ledger]   providerUuid: ${entry.providerUuid}`);
  console.log(`📝 [Ledger]   amount: ${entry.amount}`);
  console.log(`📝 [Ledger]   txId: ${entry.txId}`);
  console.log(`📝 [Ledger]   payer: ${entry.payer}`);
  console.log(`📝 [Ledger]   status: ${entry.status}`);

  // Push ledger entry to local ledger (for immediate access)
  LEDGER.push(entry);
  
  // Persist ledger entry
  if (redis) {
    console.log(`💾 [Ledger] Saving ${LEDGER.length} ledger entries (including new ${entry.serviceType} entry: ${entry.entryId})`);
    redis.saveLedgerEntries(LEDGER);
  } else {
    console.error(`❌ [Ledger] Redis instance not available! Cannot persist ledger entry: ${entry.entryId}`);
  }
  
  // ARCHITECTURAL PATTERN: Ledger Push + Settlement Pull
  // Indexers EXECUTE transactions but never SETTLE them
  // Push ledger entry to ROOT CA Redis Stream for settlement
  pushLedgerEntryToSettlementStream(entry).catch(err => {
    console.error(`⚠️  Failed to push ledger entry to settlement stream:`, err.message);
    // Continue execution - settlement will retry
  });
  
  // CRITICAL: Broadcast ledger entry added event to Angular
  if (!broadcastEvent) {
    console.error(`❌ [Ledger] broadcastEvent not initialized! Cannot send ledger_entry_added event`);
  } else {
    const ledgerEvent = {
      type: "ledger_entry_added",
      component: "ledger",
      message: `Ledger entry created: ${entry.entryId}`,
      timestamp: Date.now(),
      data: { entry }
    };
    console.log(`📡 [Broadcast] Sending ledger_entry_added event: ${entry.entryId} for ${entry.merchant}`);
    broadcastEvent(ledgerEvent);
  }

  return entry;
}

/**
 * Push ledger entry to ROOT CA settlement stream
 */
export async function pushLedgerEntryToSettlementStream(entry: LedgerEntry): Promise<void> {
  if (SKIP_REDIS || !redis.isOpen) {
    console.log(`📤 [Settlement] Ledger entry ${entry.entryId} queued (Redis disabled)`);
    return;
  }

  try {
    await ensureRedisConnection();
    
    // Calculate fees breakdown
    const iGas = entry.iGasCost;
    const iTax = entry.bookingDetails?.iTax || 0;
    
    // Calculate fee distribution (from snapshot.feeSplit or defaults)
    const rootCAFee = entry.fees?.rootCA || (iGas * ROOT_CA_FEE);
    const indexerFee = entry.fees?.indexer || (iGas * INDEXER_FEE);
    
    // Extract garden ID from provider (if available)
    const provider = ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === entry.providerUuid);
    const gardenId = provider?.gardenId || 'unknown';
    
    const settlementPayload = {
      entryId: entry.entryId,
      txId: entry.txId,
      timestamp: entry.timestamp.toString(),
      payer: entry.payer,
      payerId: entry.payerId,
      merchant: entry.merchant,
      providerUuid: entry.providerUuid,
      gardenId: gardenId,
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
      bookingDetails: entry.bookingDetails ? JSON.stringify(entry.bookingDetails) : '',
    };
    
    await redis.xAdd(LEDGER_SETTLEMENT_STREAM, "*", settlementPayload);
    
    console.log(`📤 [Settlement] Pushed ledger entry ${entry.entryId} to ROOT CA settlement stream`);
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
        indexerId: gardenId // Legacy field (will be renamed to gardenId in future)
      }
    });
  } catch (err: any) {
    console.error(`❌ Failed to push ledger entry to settlement stream:`, err.message);
    throw err;
  }
}

/**
 * Process payment through cashier
 */
export async function processPayment(cashier: Cashier, entry: LedgerEntry, user: User): Promise<boolean> {
  // NO AUTO-GRANT - User must have balance from Stripe or other credits
  
  console.log(`   💰 [Ledger] ========================================`);
  console.log(`   💰 [Ledger] 💳 processPayment FUNCTION CALLED`);
  console.log(`   💰 [Ledger] Entry ID: ${entry.entryId}`);
  console.log(`   💰 [Ledger] Entry Amount: ${entry.amount}`);
  console.log(`   💰 [Ledger] Entry Status (before): ${entry.status}`);
  console.log(`   💰 [Ledger] User Email: ${user.email}`);
  console.log(`   💰 [Ledger] Cashier ID: ${cashier.id}`);
  console.log(`   💰 [Ledger] Cashier processedCount (before): ${cashier.processedCount}`);
  console.log(`   💰 [Ledger] Cashier totalProcessed (before): ${cashier.totalProcessed}`);
  console.log(`   💰 [Ledger] ========================================`);
  
  // CRITICAL: Validate entry has an amount
  if (!entry.amount || entry.amount <= 0) {
    console.error(`   ❌ [Ledger] Cannot process payment: entry ${entry.entryId} has invalid amount: ${entry.amount}`);
    entry.status = 'failed';
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
  
  console.log(`   💰 [Ledger] Step 1: Amount validation passed`);
  
  // EdenCore submits intent to Wallet Service
  // Wallet Service decides and updates balance (single source of truth)
  console.log(`   💰 [Ledger] Step 2: Calling processWalletIntent`);
  const walletResult = await processWalletIntent({
    intent: "DEBIT",
    email: user.email,
    amount: entry.amount,
    txId: entry.txId,
    entryId: entry.entryId,
    reason: `Payment to ${entry.merchant} (${entry.serviceType})`,
    metadata: {
      merchant: entry.merchant,
      serviceType: entry.serviceType,
      cashierId: cashier.id,
    }
  });
  
  console.log(`   💰 [Ledger] Wallet result:`, {
    success: walletResult.success,
    balance: walletResult.balance,
    error: walletResult.error
  });
  
  if (!walletResult.success) {
    console.error(`   ❌ [Ledger] Wallet intent failed: ${walletResult.error}`);
    entry.status = 'failed';
    const walletBalance = await getWalletBalance(user.email);
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

  console.log(`   💰 [Ledger] Step 3: Wallet intent succeeded`);
  
  // Update user balance for backward compatibility (wallet is source of truth)
  user.balance = walletResult.balance;
  console.log(`   💰 [Ledger] Updated user balance: ${user.balance}`);
  
  // CRITICAL: Update the actual CASHIER object (not just the parameter copy)
  // The cashier parameter might be a copy from getCashierStatus(), so we need to update CASHIER directly
  if (!CASHIER) {
    throw new Error("CASHIER not initialized");
  }
  
  console.log(`   💰 [Ledger] Step 4: Updating CASHIER object`);
  console.log(`   💰 [Ledger] CASHIER processedCount (before): ${CASHIER.processedCount}`);
  console.log(`   💰 [Ledger] CASHIER totalProcessed (before): ${CASHIER.totalProcessed}`);
  
  CASHIER.processedCount++;
  CASHIER.totalProcessed += entry.amount;
  
  console.log(`   💰 [Ledger] CASHIER processedCount (after): ${CASHIER.processedCount}`);
  console.log(`   💰 [Ledger] CASHIER totalProcessed (after): ${CASHIER.totalProcessed}`);
  
  // Also update the parameter for backward compatibility (in case it's used elsewhere)
  cashier.processedCount = CASHIER.processedCount;
  cashier.totalProcessed = CASHIER.totalProcessed;
  
  console.log(`   💰 [Ledger] Step 5: Updating entry status to 'processed'`);
  console.log(`   💰 [Ledger] Entry status (before update): ${entry.status}`);
  entry.status = 'processed';
  console.log(`   💰 [Ledger] Entry status (after update): ${entry.status}`);
  
  // CRITICAL: Persist ledger entry after payment processing
  console.log(`   💰 [Ledger] Step 6: Persisting ledger entry`);
  console.log(`   💰 [Ledger] Redis available: ${!!redis}`);
  if (redis) {
    redis.saveLedgerEntries(LEDGER);
    console.log(`   💾 [Ledger] ✅ Persisted ledger entry ${entry.entryId} after payment processing`);
    // Verify the entry in LEDGER array
    const persistedEntry = LEDGER.find(e => e.entryId === entry.entryId);
    console.log(`   💰 [Ledger] Verification - Entry in LEDGER array:`, persistedEntry ? {
      entryId: persistedEntry.entryId,
      status: persistedEntry.status,
      amount: persistedEntry.amount
    } : 'NOT FOUND');
  } else {
    console.error(`   ❌ [Ledger] Redis not available! Cannot persist ledger entry`);
  }

  // CRITICAL: Broadcast payment processed event to Angular
  console.log(`   💰 [Ledger] Step 7: Broadcasting payment processed event`);
  if (!broadcastEvent) {
    console.error(`   ❌ [Ledger] broadcastEvent not initialized! Cannot send cashier_payment_processed event`);
  } else {
    const paymentEvent = {
      type: "cashier_payment_processed",
      component: "cashier",
      message: `${cashier.name} processed payment: ${entry.amount} JSC`,
      timestamp: Date.now(),
      data: { entry, cashier, userBalance: walletResult.balance, walletService: "wallet-service-001" }
    };
    console.log(`   📡 [Broadcast] Sending cashier_payment_processed event: ${cashier.name} processed ${entry.amount} JSC`);
    broadcastEvent(paymentEvent);
  }

  console.log(`   💰 [Ledger] ========================================`);
  console.log(`   💰 [Ledger] ✅ processPayment COMPLETED SUCCESSFULLY`);
  console.log(`   💰 [Ledger] Entry Status: ${entry.status}`);
  console.log(`   💰 [Ledger] CASHIER processedCount: ${CASHIER.processedCount}`);
  console.log(`   💰 [Ledger] CASHIER totalProcessed: ${CASHIER.totalProcessed}`);
  console.log(`   💰 [Ledger] ========================================`);

  return true;
}

/**
 * Complete a booking
 */
export function completeBooking(entry: LedgerEntry) {
  entry.status = 'completed';
  
  broadcastEvent({
    type: "ledger_booking_completed",
    component: "ledger",
    message: `Booking completed: ${entry.entryId}`,
    timestamp: Date.now(),
    data: { entry }
  });
}

/**
 * Get ledger entries
 */
export function getLedgerEntries(payerEmail?: string): LedgerEntry[] {
  let entries: LedgerEntry[];
  if (payerEmail) {
    entries = LEDGER.filter(entry => entry.payer === payerEmail);
  } else {
    entries = [...LEDGER];
  }
  
  // CRITICAL: Normalize numeric fields (iGasCost, amount, timestamp) to ensure they're numbers, not strings
  // This fixes issues when data is loaded from persistence where JSON might have stored them as strings
  return entries.map(entry => ({
    ...entry,
    iGasCost: typeof entry.iGasCost === 'string' ? parseFloat(entry.iGasCost) : (entry.iGasCost || 0),
    amount: typeof entry.amount === 'string' ? parseFloat(entry.amount) : (entry.amount || 0),
    timestamp: typeof entry.timestamp === 'string' ? parseInt(entry.timestamp) : (entry.timestamp || Date.now()),
    // Normalize fees object if it exists
    fees: entry.fees ? Object.fromEntries(
      Object.entries(entry.fees).map(([key, value]) => [
        key,
        typeof value === 'string' ? parseFloat(value) : (value || 0)
      ])
    ) : {}
  }));
}

/**
 * Get transactions by payer
 */
export function getTransactionByPayer(payerEmail: string): LedgerEntry[] {
  return LEDGER.filter(entry => entry.payer === payerEmail && entry.status === 'completed');
}

/**
 * Get transaction by snapshot ID
 */
export function getTransactionBySnapshot(snapshotId: string): LedgerEntry | null {
  return LEDGER.find(entry => entry.txId === snapshotId) || null;
}

/**
 * Get latest snapshot for a provider
 */
export function getLatestSnapshot(providerId: string): LedgerEntry | null {
  const providerEntries = LEDGER.filter(entry => 
    entry.merchant === providerId || entry.providerUuid === providerId
  );
  if (providerEntries.length === 0) return null;
  
  // Return most recent completed transaction
  return providerEntries
    .filter(entry => entry.status === 'completed')
    .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
}

/**
 * Deliver webhook to service provider
 */
export async function deliverWebhook(providerId: string, snapshot: TransactionSnapshot, ledgerEntry: LedgerEntry): Promise<void> {
  const webhook = PROVIDER_WEBHOOKS.get(providerId);
  if (!webhook) {
    return; // No webhook registered
  }
  
  console.log(`📤 [Service Provider] Webhook Delivery Attempt: ${providerId} → ${webhook.webhookUrl} (TX: ${snapshot.txId.substring(0, 8)}...)`);
  
  // Broadcast webhook delivery attempt
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
    event: 'tx-finalized',
    snapshot: {
      chainId: snapshot.chainId,
      txId: snapshot.txId,
      slot: snapshot.slot,
      blockTime: snapshot.blockTime,
      payer: snapshot.payer,
      merchant: snapshot.merchant,
      amount: snapshot.amount,
      feeSplit: snapshot.feeSplit,
    },
    ledger: {
      entryId: ledgerEntry.entryId,
      status: ledgerEntry.status,
      serviceType: ledgerEntry.serviceType,
      bookingDetails: ledgerEntry.bookingDetails,
    },
    timestamp: Date.now(),
  });
  
  try {
    const parsedUrl = new URL(webhook.webhookUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      },
    };
    
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            webhook.failureCount = 0;
            console.log(`✅ [Service Provider] Webhook delivered: ${providerId} (${res.statusCode})`);
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
            console.warn(`⚠️  [Service Provider] Webhook failed: ${providerId} (${res.statusCode})`);
            reject(new Error(`Webhook delivery failed: ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', (err) => {
        webhook.failureCount++;
        console.error(`❌ [Service Provider] Webhook error: ${providerId}`, err.message);
        reject(err);
      });
      
      req.write(payload);
      req.end();
    });
  } catch (err: any) {
    webhook.failureCount++;
    console.error(`❌ [Service Provider] Webhook delivery failed: ${providerId}`, err.message);
    throw err;
  }
}

