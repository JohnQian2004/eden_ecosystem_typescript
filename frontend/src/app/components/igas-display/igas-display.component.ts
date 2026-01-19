import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';

@Component({
  selector: 'app-igas-display',
  templateUrl: './igas-display.component.html',
  styleUrls: ['./igas-display.component.scss']
})
export class IgasDisplayComponent implements OnInit, OnDestroy {
  currentIGas: number = 0.0;
  totalIGas: number = 0.0;
  totalFees: number = 0.0;
  @Input() priesthoodStats: any = null;
  @Input() walletBalance: number = 0.0;
  @Input() onOpenStripeModal: () => void = () => {};
  private subscription: any;

  constructor(private wsService: WebSocketService, private http: HttpClient) {}

  ngOnInit() {
    console.log('⛽ [iGasDisplay] Component initialized');
    
    // Fetch total iGas from server on initialization
    this.loadTotalIGas();
    
    // Fetch total fees from Accountant Service
    this.loadTotalFees();

    this.subscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      console.log(`⛽ [iGasDisplay] Received event: ${event.type}`, event);

      if (event.type === 'igas') {
        console.log(`⛽ [iGasDisplay] Processing iGas event:`, event.data);

        if (event.data?.igas !== undefined) {
          const rawValue = event.data.igas;
          console.log(`⛽ [iGasDisplay] Raw iGas value: ${rawValue} (type: ${typeof rawValue})`);

          const igasValue = typeof rawValue === 'string'
            ? parseFloat(rawValue)
            : Number(rawValue);

          if (!isNaN(igasValue)) {
            this.currentIGas = igasValue;
            // Use server's total iGas if provided, otherwise accumulate client-side
            if (event.data?.totalIGas !== undefined) {
              this.totalIGas = typeof event.data.totalIGas === 'string'
                ? parseFloat(event.data.totalIGas)
                : Number(event.data.totalIGas);
            } else {
              this.totalIGas += igasValue;
            }
            console.log(`⛽ [iGasDisplay] Updated iGas: current=${this.currentIGas}, total=${this.totalIGas}`);
          } else {
            console.error(`⛽ [iGasDisplay] Invalid iGas value: ${rawValue}`);
          }
        } else {
          console.warn(`⛽ [iGasDisplay] iGas event missing igas data:`, event.data);
        }
      }

      // Fallback: workflows may not emit 'igas' events in every path, but ledger events always carry iGasCost.
      // Keep "Current iGas" aligned with the last processed transaction's iGasCost.
      if (event.type === 'ledger_entry_added' ||
          event.type === 'ledger_entry_created' ||
          event.type === 'ledger_entry_pushed' ||
          event.type === 'cashier_payment_processed' ||
          event.type === 'ledger_booking_completed') {
        const entry = (event as any).data?.entry;
        const rawIGas = entry?.iGasCost ?? entry?.igas ?? (event as any).data?.iGasCost ?? (event as any).data?.igas;
        if (rawIGas !== undefined && rawIGas !== null) {
          const parsed = typeof rawIGas === 'string' ? parseFloat(rawIGas) : Number(rawIGas);
          if (!isNaN(parsed)) {
            this.currentIGas = parsed;
            console.log(`⛽ [iGasDisplay] Updated current iGas from ledger event (${event.type}): ${this.currentIGas}`);
          }
        }
        // Also refresh total iGas from server for consistency with AccountantService.
        this.loadTotalIGas();
      }
      
      // Refresh total fees when ledger entries are created or processed
      if (event.type === 'ledger_entry_added' || event.type === 'ledger_entry_created' || 
          event.type === 'ledger_entry_pushed' || event.type === 'cashier_payment_processed') {
        console.log(`💰 [iGasDisplay] Ledger event detected, refreshing total fees...`);
        this.loadTotalFees();
      }
    });
  }

  loadTotalIGas() {
    this.http.get<{success: boolean, totalIGas: number, timestamp: number}>('http://localhost:3000/api/igas/total')
      .subscribe({
        next: (response) => {
          if (response.success && response.totalIGas !== undefined) {
            this.totalIGas = response.totalIGas;
            console.log(`⛽ [iGasDisplay] Loaded total iGas from server: ${this.totalIGas.toFixed(6)}`);
          }
        },
        error: (error) => {
          console.warn(`⛽ [iGasDisplay] Failed to load total iGas from server:`, error);
        }
      });
  }

  loadTotalFees() {
    // Total Fees follows AccountantService's revenue summary (backward compatible)
    this.http.get<{success: boolean, totalRevenue: number, totalRootCAFees: number, totalIndexerFees: number, totalProviderFees: number, timestamp: number}>('http://localhost:3000/api/accountant/summary')
      .subscribe({
        next: (response) => {
          if (response.success && response.totalRevenue !== undefined) {
            this.totalFees = response.totalRevenue;
            console.log(`💰 [iGasDisplay] Loaded total fees from server: ${this.totalFees.toFixed(6)}`);
          }
        },
        error: (error) => {
          console.warn(`💰 [iGasDisplay] Failed to load total fees from server:`, error);
        }
      });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}

