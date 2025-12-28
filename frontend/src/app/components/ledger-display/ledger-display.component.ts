import { Component, OnInit, OnDestroy } from '@angular/core';
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
    private wsService: WebSocketService
  ) {}

  ngOnInit() {
    this.loadLedger();
    this.loadCashierStatus();
    
    // Subscribe to WebSocket events for real-time updates
    this.wsSubscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      if (event.type === 'ledger_entry_added' || 
          event.type === 'ledger_entry_created' ||
          event.type === 'ledger_booking_completed' ||
          event.type === 'cashier_payment_processed') {
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
    
    this.http.get<any>(apiUrl).subscribe({
      next: (response) => {
        if (response.success) {
          this.ledgerEntries = response.entries || [];
        }
      },
      error: (error) => {
        console.error('Error loading ledger:', error);
      }
    });
  }

  loadCashierStatus() {
    const apiUrl = window.location.port === '4200' 
      ? 'http://localhost:3000/api/cashier' 
      : '/api/cashier';
    
    this.http.get<any>(apiUrl).subscribe({
      next: (response) => {
        if (response.success) {
          this.cashier = response.cashier;
        }
      },
      error: (error) => {
        console.error('Error loading cashier status:', error);
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

  formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }
}

