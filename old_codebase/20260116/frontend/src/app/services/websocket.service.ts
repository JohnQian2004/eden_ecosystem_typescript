import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { SimulatorEvent } from '../app.component';

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

  connect() {
    // Use port 3000 when running in dev mode (ng serve), otherwise use current host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.port === '4200' 
      ? 'localhost:3000' 
      : window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;
    
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
        
        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect(), this.reconnectDelay);
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

