/**
 * EdenCore Component
 * Manages core Eden ecosystem components: Ledger, Cashier, Snapshots, Transactions
 */

import type { LedgerEntry, Cashier } from "../types";

export class EdenCoreComponent {
  private ledger: LedgerEntry[] = [];
  private cashiers: Cashier[] = [];
  private snapshots: Map<string, any> = new Map();
  private transactions: Map<string, any> = new Map();

  constructor() {
    this.initializeCashiers();
  }

  private initializeCashiers(): void {
    // Initialize default cashiers
    this.cashiers = [
      {
        id: 'cashier-1',
        name: 'Cashier 1',
        processedCount: 0,
        totalProcessed: 0,
        status: 'idle'
      },
      {
        id: 'cashier-2',
        name: 'Cashier 2',
        processedCount: 0,
        totalProcessed: 0,
        status: 'idle'
      }
    ];
  }

  // Ledger Operations
  addLedgerEntry(entry: LedgerEntry): void {
    this.ledger.push(entry);
  }

  getLedgerEntries(): LedgerEntry[] {
    return [...this.ledger];
  }

  getLedgerEntryById(entryId: string): LedgerEntry | undefined {
    return this.ledger.find(e => e.entryId === entryId);
  }

  getLedgerEntriesByPayer(payer: string): LedgerEntry[] {
    return this.ledger.filter(e => e.payer === payer);
  }

  // Cashier Operations
  getCashiers(): Cashier[] {
    return [...this.cashiers];
  }

  getCashier(id: string): Cashier | undefined {
    return this.cashiers.find(c => c.id === id);
  }

  updateCashierStatus(id: string, status: 'active' | 'idle'): boolean {
    const cashier = this.cashiers.find(c => c.id === id);
    if (cashier) {
      cashier.status = status;
      return true;
    }
    return false;
  }

  // Snapshot Operations
  addSnapshot(snapshotId: string, snapshot: any): void {
    this.snapshots.set(snapshotId, snapshot);
  }

  getSnapshot(snapshotId: string): any | undefined {
    return this.snapshots.get(snapshotId);
  }

  getAllSnapshots(): Map<string, any> {
    return new Map(this.snapshots);
  }

  // Transaction Operations
  addTransaction(txId: string, transaction: any): void {
    this.transactions.set(txId, transaction);
  }

  getTransaction(txId: string): any | undefined {
    return this.transactions.get(txId);
  }

  getAllTransactions(): Map<string, any> {
    return new Map(this.transactions);
  }

  getTransactionsByPayer(payer: string): any[] {
    return Array.from(this.transactions.values()).filter((tx: any) => tx.payer === payer);
  }
}

