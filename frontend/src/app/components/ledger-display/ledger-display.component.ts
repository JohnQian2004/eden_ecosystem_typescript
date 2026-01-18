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
    // Movie details
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
    // Airline details
    flightNumber?: string;
    destination?: string;
    date?: string;
    departure?: string;
    arrival?: string;
    // Autoparts details
    partName?: string;
    partNumber?: string;
    category?: string;
    availability?: string;
    warehouse?: string;
    // Hotel details
    hotelName?: string;
    checkIn?: string;
    checkOut?: string;
    roomType?: string;
    // Restaurant details
    restaurantName?: string;
    reservationTime?: string;
    cuisine?: string;
    partySize?: number;
    // Generic fields
    [key: string]: any;
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
  filteredLedgerEntries: LedgerEntry[] = []; // Filtered entries for display
  cashier: Cashier | null = null;
  private wsSubscription: any;
  userEmail: string = '';
  readonly adminEmail = 'bill.draper.auto@gmail.com';
  
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

  // Check if we're in user mode (non-admin) and have a Google user signed in
  get isUserMode(): boolean {
    // Only consider user mode if:
    // 1. Email is not admin email
    // 2. Email is not empty
    // 3. There's a Google credential (actual Google Sign-In, not just default)
    const hasGoogleCredential = !!localStorage.getItem('googleCredential');
    return this.userEmail !== this.adminEmail && 
           this.userEmail !== '' && 
           (hasGoogleCredential || this.userEmail !== 'bill.draper.auto@gmail.com');
  }

  // Get the title based on mode
  get ledgerTitle(): string {
    return this.isUserMode ? '📖 Ledger - All User Bookings' : '📖 Ledger - All Eden Bookings';
  }

  ngOnInit() {
    console.log(`📡 [LedgerDisplay] ⭐ Component initialized - ngOnInit() called`);
    console.log(`📡 [LedgerDisplay] Initial state - ledgerEntries.length: ${this.ledgerEntries.length}, cashier: ${this.cashier ? 'exists' : 'null'}`);
    
    // Get user email from localStorage (set by Google Sign-In)
    this.updateUserEmail();
    
    // Listen for email changes (when Google user signs in/out)
    window.addEventListener('storage', (e) => {
      if (e.key === 'userEmail' || e.key === 'googleCredential') {
        this.updateUserEmail();
        this.applyFilter();
        this.cdr.detectChanges();
      }
    });
    
    // Also check periodically for email changes (for same-window updates)
    setInterval(() => {
      const currentEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
      if (this.userEmail !== currentEmail) {
        this.updateUserEmail();
        this.applyFilter();
        this.cdr.detectChanges();
      }
    }, 1000);
    
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
        // Update user email in case it changed
        this.updateUserEmail();
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

  // Update user email from localStorage (from Google Sign-In)
  updateUserEmail(): void {
    const savedEmail = localStorage.getItem('userEmail');
    const hasGoogleCredential = !!localStorage.getItem('googleCredential');
    
    // Only use saved email if it's from Google Sign-In or if it's the admin email
    if (savedEmail) {
      this.userEmail = savedEmail;
      console.log(`📡 [LedgerDisplay] User email updated: ${this.userEmail} (Google signed in: ${hasGoogleCredential})`);
    } else {
      // Default to admin email if no email is set
      this.userEmail = 'bill.draper.auto@gmail.com';
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
          this.applyFilter(); // Apply filter after loading
          this.cdr.detectChanges(); // Force change detection
          console.log(`📡 [LedgerDisplay] After assignment, ledgerEntries.length = ${this.ledgerEntries.length}, filteredEntries.length = ${this.filteredLedgerEntries.length}`);
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

  // Apply filter based on user mode
  applyFilter(): void {
    if (this.isUserMode) {
      // Filter to show only entries specifically for the logged-in Google user
      // Match by payer email (case-insensitive), payerId, or merchant email
      // Note: Some transactions (like mint operations) may have user email in merchant field
      this.filteredLedgerEntries = this.ledgerEntries.filter(entry => {
        const payerMatch = entry.payer && 
                          entry.payer.toLowerCase() === this.userEmail.toLowerCase();
        const payerIdMatch = entry.payerId && 
                            entry.payerId.toLowerCase() === this.userEmail.toLowerCase();
        const merchantMatch = entry.merchant && 
                             entry.merchant.toLowerCase() === this.userEmail.toLowerCase();
        return payerMatch || payerIdMatch || merchantMatch;
      });
      console.log(`📡 [LedgerDisplay] Filtered to ${this.filteredLedgerEntries.length} entries for logged-in Google user: ${this.userEmail}`);
      console.log(`📡 [LedgerDisplay] Total entries: ${this.ledgerEntries.length}, User entries: ${this.filteredLedgerEntries.length}`);
    } else {
      // Show all entries for admin
      this.filteredLedgerEntries = this.ledgerEntries;
      console.log(`📡 [LedgerDisplay] Showing all ${this.filteredLedgerEntries.length} entries (admin mode)`);
    }
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

  formatIGasCost(iGasCost: number | string | undefined): string {
    if (iGasCost === undefined || iGasCost === null) return '0.000000';
    // Handle both string and number types
    const num = typeof iGasCost === 'string' ? parseFloat(iGasCost) : iGasCost;
    if (isNaN(num)) return '0.000000';
    return num.toFixed(6);
  }

  /**
   * Get service type field configuration for dynamic formatting
   */
  private getServiceTypeFields(serviceType: string): {
    primary: string;
    primaryLabel: string;
    fields: Array<{ key: string; label: string; format?: (value: any, details: any) => string }>;
  } {
    const fieldConfigs: Record<string, any> = {
      movie: {
        primary: 'movieTitle',
        primaryLabel: 'Movie',
        fields: [
          { key: 'movieTitle', label: 'Movie' },
          { key: 'showtime', label: 'Showtime' },
          { key: 'location', label: 'Location' },
          { key: 'genre', label: 'Genre' }
        ]
      },
      airline: {
        primary: 'flightNumber',
        primaryLabel: 'Flight',
        fields: [
          { key: 'flightNumber', label: 'Flight' },
          { key: 'destination', label: 'To', format: (val: any) => val },
          { key: 'date', label: 'Date' },
          { 
            key: 'departure', 
            label: 'Time', 
            format: (val: any, details: any) => 
              details.arrival ? `${val} - ${details.arrival}` : val 
          }
        ]
      },
      autoparts: {
        primary: 'partName',
        primaryLabel: 'Part',
        fields: [
          { key: 'partName', label: 'Part' },
          { key: 'partNumber', label: 'Part #' },
          { key: 'category', label: 'Category' },
          { key: 'warehouse', label: 'Warehouse' },
          { key: 'availability', label: 'Availability' }
        ]
      },
      hotel: {
        primary: 'hotelName',
        primaryLabel: 'Hotel',
        fields: [
          { key: 'hotelName', label: 'Hotel' },
          { key: 'roomType', label: 'Room' },
          { 
            key: 'checkIn', 
            label: 'Stay', 
            format: (val: any, details: any) => 
              details.checkOut ? `${val} - ${details.checkOut}` : `Check-in: ${val}` 
          },
          { key: 'location', label: 'Location' }
        ]
      },
      restaurant: {
        primary: 'restaurantName',
        primaryLabel: 'Restaurant',
        fields: [
          { key: 'restaurantName', label: 'Restaurant' },
          { key: 'cuisine', label: 'Cuisine' },
          { key: 'reservationTime', label: 'Time' },
          { key: 'partySize', label: 'Party Size' },
          { key: 'location', label: 'Location' }
        ]
      },
      dex: {
        primary: 'tokenSymbol',
        primaryLabel: 'DEX',
        fields: [
          { 
            key: 'tokenSymbol', 
            label: 'DEX', 
            format: (val: any, details: any) => {
              const action = details.action || 'TRADE';
              const amount = details.tokenAmount || 0;
              return `${action} ${amount} ${val}`;
            }
          }
        ]
      }
    };

    return fieldConfigs[serviceType] || {
      primary: 'name',
      primaryLabel: 'Service',
      fields: []
    };
  }

  formatBookingDetails(entry: LedgerEntry): string {
    if (!entry.bookingDetails) return '';
    
    const details = entry.bookingDetails;
    const serviceType = entry.serviceType || 'unknown';
    const fieldConfig = this.getServiceTypeFields(serviceType);
    const parts: string[] = [];
    
    // Format fields based on service type configuration
    for (const field of fieldConfig.fields) {
      const value = details[field.key];
      if (value !== undefined && value !== null && value !== '') {
        if (field.format) {
          // Use custom formatter if provided
          const formatted = field.format(value, details);
          if (formatted) {
            parts.push(`${field.label}: ${formatted}`);
          }
        } else {
          parts.push(`${field.label}: ${value}`);
        }
      }
    }
    
    // Generic fallback - show any other fields that weren't already displayed
    if (parts.length === 0) {
      const displayedKeys = new Set(fieldConfig.fields.map(f => f.key));
      Object.keys(details).forEach(key => {
        if (!displayedKeys.has(key) && 
            key !== 'price' && 
            key !== 'providerName' && 
            details[key] !== undefined && 
            details[key] !== null && 
            details[key] !== '') {
          const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
          parts.push(`${label}: ${details[key]}`);
        }
      });
    }
    
    return parts.join('<br>');
  }

  getTransactionSnapshot(entryId: string, txId: string): void {
    console.log(`🔍 [LedgerDisplay] Fetching transaction snapshot for entryId: ${entryId}, txId: ${txId}`);
    
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
        console.log(`✅ [LedgerDisplay] Transaction snapshot received:`, response);
        this.isLoadingTransaction = false;
        if (response.success && response.transaction) {
          this.transactionSnapshot = response.transaction;
        } else {
          this.transactionError = 'Transaction snapshot not found';
        }
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ [LedgerDisplay] Error fetching transaction snapshot:', error);
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

