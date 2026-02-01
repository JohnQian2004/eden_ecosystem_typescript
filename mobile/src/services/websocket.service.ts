/**
 * WebSocket Service for React Native
 * Handles WebSocket connections and events
 */

import { getWsBaseUrl } from './api-base';

export interface SimulatorEvent {
  type: string;
  component: string;
  message: string;
  timestamp: number;
  data?: any;
}

type EventCallback = (event: SimulatorEvent) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private eventCallbacks: EventCallback[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      console.log('🔌 [WebSocket] Already connected or connecting');
      return;
    }

    this.isConnecting = true;
    const wsUrl = `${getWsBaseUrl()}/ws`;

    console.log(`🔌 Attempting WebSocket connection to: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.emitEvent({
          type: 'connection',
          component: 'websocket',
          message: 'Connected to Eden Simulator',
          timestamp: Date.now(),
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data: SimulatorEvent = JSON.parse(event.data);
          // Log important events
          if (
            data.type === 'ledger_entry_added' ||
            data.type === 'ledger_entry_created' ||
            data.type === 'cashier_payment_processed' ||
            data.type === 'llm_start' ||
            data.type === 'llm_response' ||
            data.type === 'igas'
          ) {
            console.log(`📡 [WebSocket] ⭐ Received ${data.type} event:`, data);
          }
          this.emitEvent(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.isConnecting = false;
        this.emitEvent({
          type: 'error',
          component: 'websocket',
          message: 'WebSocket connection error',
          timestamp: Date.now(),
        });
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        this.isConnecting = false;
        this.emitEvent({
          type: 'disconnection',
          component: 'websocket',
          message: 'Disconnected from Eden Simulator',
          timestamp: Date.now(),
        });

        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(
            `🔄 [WebSocket] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`
          );
          this.reconnectTimer = setTimeout(() => {
            this.connect();
          }, this.reconnectDelay);
        } else {
          console.error('❌ [WebSocket] Max reconnect attempts reached');
        }
      };
    } catch (error) {
      console.error('❌ [WebSocket] Connection error:', error);
      this.isConnecting = false;
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnecting = false;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  subscribe(callback: EventCallback): () => void {
    this.eventCallbacks.push(callback);
    // Return unsubscribe function
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter((cb) => cb !== callback);
    };
  }

  private emitEvent(event: SimulatorEvent) {
    this.eventCallbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in WebSocket event callback:', error);
      }
    });
  }
}

export default new WebSocketService();

