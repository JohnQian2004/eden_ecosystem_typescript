import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';

interface LedgerEntry {
  entryId: string;
  txId: string;
  timestamp: number;
  payer: string;
  payerId: string;
  merchant: string;
  providerUuid: string;
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
    tokenSymbol?: string;
    baseToken?: string;
    action?: 'BUY' | 'SELL';
    tokenAmount?: number;
    baseAmount?: number;
    price?: number;
    flightNumber?: string;
    destination?: string;
    date?: string;
    partName?: string;
    partNumber?: string;
    hotelName?: string;
    checkIn?: string;
    checkOut?: string;
    restaurantName?: string;
    grocerystoreName?: string;
    storeType?: string;
    pharmacyName?: string;
    pharmacyType?: string;
    dogparkName?: string;
    parkType?: string;
    gasstationName?: string;
    stationType?: string;
    partyName?: string;
    partyType?: string;
    eventDate?: string;
    eventTime?: string;
    bankName?: string;
    bankType?: string;
    atmAvailable?: boolean;
    reservationTime?: string;
    // Stripe payment details
    asset?: string;
    stripePaymentIntentId?: string;
    stripePaymentMethodId?: string;
    stripeSessionId?: string;
    [key: string]: any;
  };
}

@Component({
  selector: 'app-ledger-card-deck',
  templateUrl: './ledger-card-deck.component.html',
  styleUrls: ['./ledger-card-deck.component.scss']
})
export class LedgerCardDeckComponent implements OnInit, OnDestroy {
  ledgerEntries: LedgerEntry[] = [];
  filteredLedgerEntries: LedgerEntry[] = [];
  userEmail: string = '';
  readonly adminEmail = 'bill.draper.auto@gmail.com';
  private wsSubscription: any;
  
  // Transaction snapshot modal
  showTransactionModal: boolean = false;
  transactionSnapshot: any = null;
  isLoadingTransaction: boolean = false;
  transactionError: string = '';

  constructor(
    private http: HttpClient,
    private wsService: WebSocketService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    console.log(`📋 [LedgerCardDeck] Component initialized`);
    
    // Get user email from localStorage
    this.updateUserEmail();
    
    // Listen for email changes
    window.addEventListener('storage', (e) => {
      if (e.key === 'userEmail' || e.key === 'googleCredential') {
        this.updateUserEmail();
        this.applyFilter();
        this.cdr.detectChanges();
      }
    });
    
    // Check periodically for email changes
    setInterval(() => {
      const currentEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
      if (this.userEmail !== currentEmail) {
        this.updateUserEmail();
        this.applyFilter();
        this.cdr.detectChanges();
      }
    }, 1000);
    
    this.loadLedger();
    
    // Subscribe to WebSocket events for real-time updates
    this.wsSubscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      if (event.type === 'ledger_entry_added' || 
          event.type === 'ledger_entry_created' ||
          event.type === 'ledger_booking_completed' ||
          event.type === 'cashier_payment_processed') {
        this.updateUserEmail();
        this.loadLedger();
      }
    });
  }

  ngOnDestroy() {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
  }

  updateUserEmail(): void {
    const savedEmail = localStorage.getItem('userEmail');
    if (savedEmail) {
      this.userEmail = savedEmail;
    } else {
      this.userEmail = 'bill.draper.auto@gmail.com';
    }
  }

  loadLedger() {
    const apiUrl = window.location.port === '4200' 
      ? 'http://localhost:3000/api/ledger' 
      : '/api/ledger';
    
    this.http.get<any>(apiUrl).subscribe({
      next: (response) => {
        if (response.success) {
          const entries = response.entries || [];
          this.ledgerEntries = entries;
          this.applyFilter();
          this.cdr.detectChanges();
        }
      },
      error: (error) => {
        console.error('❌ [LedgerCardDeck] Error loading ledger:', error);
      }
    });
  }

  applyFilter(): void {
    // Filter to show only entries for the logged-in user
    // Match by payer email, payerId, or merchant email
    this.filteredLedgerEntries = this.ledgerEntries.filter(entry => {
      const userEmailLower = this.userEmail.toLowerCase();
      const payerMatch = entry.payer && 
                        entry.payer.toLowerCase() === userEmailLower;
      const payerIdMatch = entry.payerId && 
                          entry.payerId.toLowerCase() === userEmailLower;
      const merchantMatch = entry.merchant && 
                           entry.merchant.toLowerCase() === userEmailLower;
      return payerMatch || payerIdMatch || merchantMatch;
    });
    
    // Sort by reversed timestamp (newest first)
    this.filteredLedgerEntries.sort((a, b) => {
      const timestampA = a.timestamp || 0;
      const timestampB = b.timestamp || 0;
      return timestampB - timestampA; // Reverse order (newest first)
    });
    
    console.log(`📋 [LedgerCardDeck] Filtered and sorted ${this.filteredLedgerEntries.length} entries for user: ${this.userEmail}`);
  }

  formatDate(timestamp: number | undefined): string {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  }

  formatIGasCost(iGasCost: number | undefined): string {
    if (!iGasCost || iGasCost === 0) return '0.000000';
    return iGasCost.toFixed(6);
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

  formatBookingDetails(entry: LedgerEntry): string {
    if (!entry.bookingDetails) return '';
    
    const details = entry.bookingDetails;
    const parts: string[] = [];
    
    // Movie details
    if (details.movieTitle) {
      parts.push(`Movie: ${details.movieTitle}`);
      if (details.showtime) parts.push(`Showtime: ${details.showtime}`);
      if (details.location) parts.push(`Location: ${details.location}`);
    }
    
    // DEX details
    if (details.tokenSymbol) {
      parts.push(`${details.action || 'TRADE'}: ${details.tokenAmount || 0} ${details.tokenSymbol}`);
      if (details.price) parts.push(`Price: ${details.price}`);
    }
    
    // Airline details
    if (details.flightNumber) {
      parts.push(`Flight: ${details.flightNumber}`);
      if (details.destination) parts.push(`To: ${details.destination}`);
      if (details.date) parts.push(`Date: ${details.date}`);
    }
    
    // Autoparts details
    if (details.partName) {
      parts.push(`Part: ${details.partName}`);
      if (details.partNumber) parts.push(`Part #: ${details.partNumber}`);
    }
    
    // Hotel details
    if (details.hotelName) {
      parts.push(`Hotel: ${details.hotelName}`);
      if (details.checkIn) parts.push(`Check-in: ${details.checkIn}`);
    }
    
    // Restaurant details
    if (details.restaurantName) {
      parts.push(`Restaurant: ${details.restaurantName}`);
      if (details.reservationTime) parts.push(`Time: ${details.reservationTime}`);
    }
    // Grocery store details
    if (details.grocerystoreName) {
      parts.push(`Store: ${details.grocerystoreName}`);
      if (details.storeType) parts.push(`Type: ${details.storeType}`);
    }
    // Pharmacy details
    if (details.pharmacyName) {
      parts.push(`Pharmacy: ${details.pharmacyName}`);
      if (details.pharmacyType) parts.push(`Type: ${details.pharmacyType}`);
    }
    // Gas station details
    if (details.gasstationName) {
      parts.push(`Station: ${details.gasstationName}`);
      if (details.stationType) parts.push(`Type: ${details.stationType}`);
    }
    // Party/Event details
    if (details.partyName) {
      parts.push(`Event: ${details.partyName}`);
      if (details.partyType) parts.push(`Type: ${details.partyType}`);
      if (details.eventDate) {
        const dateTime = details.eventTime ? `${details.eventDate} at ${details.eventTime}` : details.eventDate;
        parts.push(`When: ${dateTime}`);
      }
    }
    // Bank details
    if (details.bankName) {
      parts.push(`Bank: ${details.bankName}`);
      if (details.bankType) parts.push(`Type: ${details.bankType}`);
      if (details.atmAvailable !== undefined) parts.push(`ATM: ${details.atmAvailable ? 'Yes' : 'No'}`);
    }
    
    return parts.join(' | ');
  }

  getServiceIcon(serviceType: string): string {
    const icons: Record<string, string> = {
      'movie': '🎬',
      'dex': '💰',
      'airline': '✈️',
      'autoparts': '🔧',
      'hotel': '🏨',
      'restaurant': '🍽️',
      'grocerystore': '🏢',
      'pharmacy': '🏢',
      'dogpark': '🐕',
      'gasstation': '⛽',
      'party': '🎉',
      'bank': '🏦',
      'priesthood': '📜'
    };
    return icons[serviceType] || '📋';
  }

  getTransactionSnapshot(entryId: string, txId: string): void {
    console.log(`🔍 [LedgerCardDeck] Fetching transaction snapshot for entryId: ${entryId}, txId: ${txId}`);
    
    this.isLoadingTransaction = true;
    this.transactionError = '';
    this.showTransactionModal = true;
    this.transactionSnapshot = null;
    this.cdr.detectChanges();

    // Use txId as snapshot_id for the RPC call
    const apiUrl = window.location.port === '4200' 
      ? `http://localhost:3000/rpc/getTransactionBySnapshot?snapshot_id=${encodeURIComponent(txId)}`
      : `/rpc/getTransactionBySnapshot?snapshot_id=${encodeURIComponent(txId)}`;

    this.http.get<any>(apiUrl).subscribe({
      next: (response) => {
        console.log(`✅ [LedgerCardDeck] Transaction snapshot received:`, response);
        this.isLoadingTransaction = false;
        if (response.success && response.transaction) {
          this.transactionSnapshot = response.transaction;
        } else {
          this.transactionError = 'Transaction snapshot not found';
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ [LedgerCardDeck] Error fetching transaction snapshot:', error);
        this.isLoadingTransaction = false;
        this.transactionError = error.error?.error || 'Failed to fetch transaction snapshot';
        this.cdr.detectChanges();
      }
    });
  }

  closeTransactionModal(): void {
    this.showTransactionModal = false;
    this.transactionSnapshot = null;
    this.transactionError = '';
    this.cdr.detectChanges();
  }

  formatJson(obj: any): string {
    return JSON.stringify(obj, null, 2);
  }
}
