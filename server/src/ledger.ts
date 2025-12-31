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
  
  const entry: LedgerEntry = {
    entryId: crypto.randomUUID(),
    txId: snapshot.txId,
    timestamp: snapshot.blockTime,
    payer: snapshot.payer, // Email address
    payerId: snapshot.payer, // Email address (same as payer)
    merchant: merchantName, // Provider name (e.g., "AMC Theatres", "MovieCom", "Cinemark")
    providerUuid: providerUuid || 'MISSING-UUID', // Service provider UUID for certificate issuance
    serviceType: serviceType,
    amount: snapshot.amount,
    iGasCost: iGasCost,
    fees: snapshot.feeSplit,
    status: 'pending',
    cashierId: CASHIER.id,
    bookingDetails: bookingDetails,
  };
  
  console.log(`📝 Ledger entry created with providerUuid: ${entry.providerUuid}`);

  // Push ledger entry to local ledger (for immediate access)
  LEDGER.push(entry);
  
  // Persist ledger entry
  if (redis) {
    redis.saveLedgerEntries(LEDGER);
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
  
  // EdenCore submits intent to Wallet Service
  // Wallet Service decides and updates balance (single source of truth)
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
  
  if (!walletResult.success) {
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

  // Update user balance for backward compatibility (wallet is source of truth)
  user.balance = walletResult.balance;
  
  // Update cashier stats
  cashier.processedCount++;
  cashier.totalProcessed += entry.amount;
  entry.status = 'processed';
  
  // CRITICAL: Persist ledger entry after payment processing
  if (redis) {
    redis.saveLedgerEntries(LEDGER);
    console.log(`💾 [Ledger] Persisted ledger entry ${entry.entryId} after payment processing`);
  }

  // CRITICAL: Broadcast payment processed event to Angular
  if (!broadcastEvent) {
    console.error(`❌ [Ledger] broadcastEvent not initialized! Cannot send cashier_payment_processed event`);
  } else {
    const paymentEvent = {
      type: "cashier_payment_processed",
      component: "cashier",
      message: `${cashier.name} processed payment: ${entry.amount} JSC`,
      timestamp: Date.now(),
      data: { entry, cashier, userBalance: walletResult.balance, walletService: "wallet-service-001" }
    };
    console.log(`📡 [Broadcast] Sending cashier_payment_processed event: ${cashier.name} processed ${entry.amount} JSC`);
    broadcastEvent(paymentEvent);
  }

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
  if (payerEmail) {
    return LEDGER.filter(entry => entry.payer === payerEmail);
  }
  return [...LEDGER];
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

