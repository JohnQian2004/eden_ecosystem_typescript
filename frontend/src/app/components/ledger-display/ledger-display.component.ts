import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';

interface LedgerEntry {
  entryId: string;
  txId: string;
  timestamp: number;
  payer: string; // Email address
  payerId: string; // User ID for internal tracking
  merchant: string;
  providerUuid: string; // Service provider UUID for certificate issuance
  serviceType: string;
  amount: number;
  iGasCost: number;
  fees: Record<string, number>;
  status: 'pending' | 'processed' | 'completed' | 'failed';
  cashierId: string;
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
  };
}

interface Cashier {
  id: string;
  name: string;
  processedCount: number;
  totalProcessed: number;
  status: 'active' | 'idle';
}

@Component({
  selector: 'app-ledger-display',
  templateUrl: './ledger-display.component.html',
  styleUrls: ['./ledger-display.component.scss']
})
export class LedgerDisplayComponent implements OnInit, OnDestroy {
  ledgerEntries: LedgerEntry[] = [];
  cashier: Cashier | null = null;
  private wsSubscription: any;

  constructor(
    private http: HttpClient,
    private wsService: WebSocketService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    console.log(`📡 [LedgerDisplay] ⭐ Component initialized - ngOnInit() called`);
    console.log(`📡 [LedgerDisplay] Initial state - ledgerEntries.length: ${this.ledgerEntries.length}, cashier: ${this.cashier ? 'exists' : 'null'}`);
    this.loadLedger();
    this.loadCashierStatus();
    
    // Subscribe to WebSocket events for real-time updates
    this.wsSubscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      console.log(`📡 [LedgerDisplay] Received WebSocket event: ${event.type}`, event);
      if (event.type === 'ledger_entry_added' || 
          event.type === 'ledger_entry_created' ||
          event.type === 'ledger_booking_completed' ||
          event.type === 'cashier_payment_processed') {
        console.log(`📡 [LedgerDisplay] ⭐ Processing ${event.type} event - reloading ledger and cashier`);
        this.loadLedger();
        this.loadCashierStatus();
      }
    });
  }

  ngOnDestroy() {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
  }

  loadLedger() {
    const apiUrl = window.location.port === '4200' 
      ? 'http://localhost:3000/api/ledger' 
      : '/api/ledger';
    
    console.log(`📡 [LedgerDisplay] ⭐ Loading ledger from: ${apiUrl}`);
    console.log(`📡 [LedgerDisplay] Making HTTP GET request...`);
    this.http.get<any>(apiUrl).subscribe({
      next: (response) => {
        console.log(`📡 [LedgerDisplay] ✅ HTTP response received:`, response);
        if (response.success) {
          const entries = response.entries || [];
          console.log(`📡 [LedgerDisplay] ✅ Loaded ${entries.length} ledger entries`);
          console.log(`📡 [LedgerDisplay] Entry data:`, entries);
          this.ledgerEntries = entries;
          this.cdr.detectChanges(); // Force change detection
          console.log(`📡 [LedgerDisplay] After assignment, ledgerEntries.length = ${this.ledgerEntries.length}`);
        } else {
          console.warn(`📡 [LedgerDisplay] ⚠️ Ledger API returned success=false:`, response);
        }
      },
      error: (error) => {
        console.error('📡 [LedgerDisplay] ❌ Error loading ledger:', error);
        console.error('📡 [LedgerDisplay] Error details:', error.message, error.status, error.url);
      }
    });
  }

  loadCashierStatus() {
    const apiUrl = window.location.port === '4200' 
      ? 'http://localhost:3000/api/cashier' 
      : '/api/cashier';
    
    console.log(`📡 [LedgerDisplay] Loading cashier status from: ${apiUrl}`);
    this.http.get<any>(apiUrl).subscribe({
      next: (response) => {
        if (response.success) {
          console.log(`📡 [LedgerDisplay] ✅ Loaded cashier status:`, response.cashier);
          this.cashier = response.cashier;
        } else {
          console.warn(`📡 [LedgerDisplay] ⚠️ Cashier API returned success=false:`, response);
        }
      },
      error: (error) => {
        console.error('📡 [LedgerDisplay] ❌ Error loading cashier status:', error);
      }
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'completed': return 'badge bg-success';
      case 'processed': return 'badge bg-primary';
      case 'pending': return 'badge bg-warning';
      case 'failed': return 'badge bg-danger';
      default: return 'badge bg-secondary';
    }
  }

  formatDate(timestamp: number | undefined): string {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  }
}

