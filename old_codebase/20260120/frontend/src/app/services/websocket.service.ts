import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { SimulatorEvent } from '../app.component';
import { getWsBaseUrl } from './api-base';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private ws: WebSocket | null = null;
  private eventSubject = new Subject<SimulatorEvent>();
  public events$: Observable<SimulatorEvent> = this.eventSubject.asObservable();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private isTabVisible: boolean = true;
  private visibilityChangeHandler: (() => void) | null = null;
  private wasConnectedBeforeHidden: boolean = false;

  connect() {
    // Don't connect if tab is not visible (fixes multiple tab WebSocket conflicts)
    if (!this.isTabVisible) {
      console.log('🔌 [WebSocket] Tab is not visible, skipping connection. Will connect when tab becomes visible.');
      this.wasConnectedBeforeHidden = true;
      return;
    }

    const wsUrl = `${getWsBaseUrl()}/ws`;
    
    console.log(`🔌 Attempting WebSocket connection to: ${wsUrl}`);
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;
        this.eventSubject.next({
          type: 'connection',
          component: 'websocket',
          message: 'Connected to Eden Simulator',
          timestamp: Date.now()
        });
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data: SimulatorEvent = JSON.parse(event.data);
          // Log all ledger/cashier events and LLM events for debugging
          if (data.type === 'ledger_entry_added' ||
              data.type === 'ledger_entry_created' ||
              data.type === 'cashier_payment_processed' ||
              data.type === 'ledger_booking_completed' ||
              data.type === 'llm_start' ||
              data.type === 'llm_response' ||
              data.type === 'igas') {
            console.log(`📡 [WebSocket] ⭐ Received ${data.type} event:`, data);
          }
          this.eventSubject.next(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.eventSubject.next({
          type: 'error',
          component: 'websocket',
          message: 'WebSocket connection error',
          timestamp: Date.now()
        });
      };
      
      this.ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        this.eventSubject.next({
          type: 'disconnection',
          component: 'websocket',
          message: 'Disconnected from Eden Simulator',
          timestamp: Date.now()
        });
        
        // Only attempt to reconnect if tab is visible (prevents reconnecting in hidden tabs)
        if (this.isTabVisible && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`🔌 [WebSocket] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
          setTimeout(() => this.connect(), this.reconnectDelay);
        } else if (!this.isTabVisible) {
          console.log('🔌 [WebSocket] Tab is hidden, skipping reconnect. Will reconnect when tab becomes visible.');
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // Remove visibility change listener
    if (this.visibilityChangeHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
  }

  /**
   * Initialize tab visibility detection
   * Disconnects WebSocket when tab becomes inactive, reconnects when active
   * This prevents multiple tabs from having conflicting WebSocket connections
   */
  initializeTabVisibilityHandling() {
    if (typeof document === 'undefined') return;

    // Check initial visibility state
    this.isTabVisible = !document.hidden;

    // Set up visibility change handler
    this.visibilityChangeHandler = () => {
      const wasVisible = this.isTabVisible;
      this.isTabVisible = !document.hidden;

      console.log(`👁️ [WebSocket] Tab visibility changed: ${wasVisible ? 'visible' : 'hidden'} → ${this.isTabVisible ? 'visible' : 'hidden'}`);

      if (!this.isTabVisible && wasVisible) {
        // Tab became hidden - disconnect WebSocket
        console.log('🔌 [WebSocket] Tab hidden - disconnecting WebSocket to prevent conflicts with other tabs');
        this.wasConnectedBeforeHidden = this.isConnected();
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
      } else if (this.isTabVisible && !wasVisible) {
        // Tab became visible - reconnect WebSocket if it was connected before
        console.log('🔌 [WebSocket] Tab visible - reconnecting WebSocket');
        if (this.wasConnectedBeforeHidden) {
          this.reconnectAttempts = 0; // Reset reconnect attempts
          setTimeout(() => this.connect(), 500); // Small delay to ensure tab is fully active
        }
      }
    };

    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    console.log('👁️ [WebSocket] Tab visibility handling initialized');
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

