/**
 * Ledger Module
 * Handles ledger entry management, payment processing, and settlement
 */
import type { TransactionSnapshot, LedgerEntry, Cashier, User } from "./types";
/**
 * Initialize ledger module with dependencies
 */
export declare function initializeLedger(broadcastFn: (event: any) => void, redisInstance: any, ensureRedisFn: () => Promise<void>, skipRedis: boolean, cashier: Cashier): void;
/**
 * Get cashier status (for API endpoints)
 */
export declare function getCashierStatus(): Cashier;
/**
 * Add a ledger entry
 */
export declare function addLedgerEntry(snapshot: TransactionSnapshot, serviceType: string, iGasCost: number, payerId: string, merchantName: string, // Provider name (e.g., "AMC Theatres", "Airline Provider", etc.)
providerUuid: string, // Service provider UUID for certificate issuance
bookingDetails?: Record<string, any>): LedgerEntry;
/**
 * Push ledger entry to ROOT CA settlement stream
 */
export declare function pushLedgerEntryToSettlementStream(entry: LedgerEntry): Promise<void>;
/**
 * Process payment through cashier
 */
export declare function processPayment(cashier: Cashier, entry: LedgerEntry, user: User): Promise<boolean>;
/**
 * Complete a booking
 */
export declare function completeBooking(entry: LedgerEntry): void;
/**
 * Get ledger entries
 */
export declare function getLedgerEntries(payerEmail?: string): LedgerEntry[];
/**
 * Get transactions by payer
 */
export declare function getTransactionByPayer(payerEmail: string): LedgerEntry[];
/**
 * Get transaction by snapshot ID
 */
export declare function getTransactionBySnapshot(snapshotId: string): LedgerEntry | null;
/**
 * Get latest snapshot for a provider
 */
export declare function getLatestSnapshot(providerId: string): LedgerEntry | null;
/**
 * Deliver webhook to service provider
 */
export declare function deliverWebhook(providerId: string, snapshot: TransactionSnapshot, ledgerEntry: LedgerEntry): Promise<void>;
//# sourceMappingURL=ledger.d.ts.map