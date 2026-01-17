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
}

