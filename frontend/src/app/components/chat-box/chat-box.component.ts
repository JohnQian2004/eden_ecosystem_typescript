import { Component, OnInit, OnDestroy } from '@angular/core';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';

@Component({
  selector: 'app-chat-box',
  templateUrl: './chat-box.component.html',
  styleUrls: ['./chat-box.component.scss']
})
export class ChatBoxComponent implements OnInit, OnDestroy {
  messages: SimulatorEvent[] = [];
  private subscription: any;

  constructor(private wsService: WebSocketService) {}

  ngOnInit() {
    this.subscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      this.messages.push(event);
      // Auto-scroll to bottom
      setTimeout(() => {
        const chatBox = document.querySelector('.chat-box');
        if (chatBox) {
          chatBox.scrollTop = chatBox.scrollHeight;
        }
      }, 100);
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  getMessageClass(event: SimulatorEvent): string {
    switch (event.type) {
      case 'llm_response':
        return 'text-primary';
      case 'igas':
        return 'text-success fw-bold';
      case 'error':
        return 'text-danger';
      case 'connection':
        return 'text-info';
      case 'provider_webhook_registered':
        return 'text-success';
      case 'provider_webhook_unregistered':
        return 'text-warning';
      case 'provider_webhook_attempt':
        return 'text-info';
      case 'provider_webhook_delivered':
        return 'text-success fw-bold';
      case 'provider_webhook_failed':
        return 'text-danger';
      case 'provider_webhook_received':
        return 'text-success';
      case 'provider_rpc_query':
        return 'text-primary';
      case 'provider_rpc_poll':
        return 'text-info';
      case 'llm_query_extraction_start':
      case 'llm_response_formatting_start':
        return 'text-info';
      case 'llm_query_extraction_response':
      case 'llm_response_formatting_response':
        return 'text-success';
      case 'llm_error':
        return 'text-danger';
      default:
        return 'text-dark';
    }
  }

  getEventIcon(event: SimulatorEvent): string {
    switch (event.type) {
      case 'provider_webhook_registered':
        return '📡';
      case 'provider_webhook_unregistered':
        return '🔌';
      case 'provider_webhook_attempt':
        return '📤';
      case 'provider_webhook_delivered':
        return '✅';
      case 'provider_webhook_received':
        return '📥';
      case 'provider_webhook_failed':
        return '❌';
      case 'provider_rpc_query':
        return '🔍';
      case 'provider_rpc_poll':
        return '🔄';
      case 'llm_query_extraction_start':
        return '🤖';
      case 'llm_query_extraction_response':
        return '✅';
      case 'llm_response_formatting_start':
        return '📝';
      case 'llm_response_formatting_response':
        return '✅';
      case 'llm_error':
        return '❌';
      default:
        return '';
    }
  }

  formatProviderEvent(event: SimulatorEvent): string {
    if (event.type.startsWith('provider_')) {
      const data = event.data || {};
      let details = '';
      
      if (event.type === 'provider_rpc_query') {
        details = `Method: ${data.method || 'unknown'}`;
        if (data.payer) details += ` | Payer: ${data.payer}`;
        if (data.snapshotId) details += ` | Snapshot: ${data.snapshotId.substring(0, 8)}...`;
        if (data.providerId) details += ` | Provider: ${data.providerId}`;
        if (data.transactionCount !== undefined) details += ` | Found: ${data.transactionCount} transaction(s)`;
      } else if (event.type === 'provider_rpc_poll') {
        details = `Status: ${data.status || 'unknown'}`;
        if (data.txId) details += ` | TX: ${data.txId.substring(0, 8)}...`;
      } else if (event.type === 'provider_webhook_registered') {
        details = `Provider: ${data.providerName || data.providerId || 'unknown'}`;
        if (data.webhookUrl) details += ` | URL: ${data.webhookUrl}`;
      } else if (event.type === 'provider_webhook_attempt' || event.type === 'provider_webhook_delivered' || event.type === 'provider_webhook_failed') {
        details = `Provider: ${data.providerId || 'unknown'}`;
        if (data.txId) details += ` | TX: ${data.txId.substring(0, 8)}...`;
        if (data.statusCode) details += ` | Status: ${data.statusCode}`;
        if (data.error) details += ` | Error: ${data.error}`;
      }
      
      return details ? `${event.message} (${details})` : event.message;
    }
    
    if (event.type.startsWith('llm_')) {
      const data = event.data || {};
      let details = '';
      
      if (event.type === 'llm_query_extraction_start' || event.type === 'llm_response_formatting_start') {
        details = `Provider: ${data.provider || 'unknown'} | Model: ${data.model || 'unknown'}`;
        if (data.userInput) details += ` | Input: ${data.userInput.substring(0, 50)}...`;
        if (data.listingsCount !== undefined) details += ` | Listings: ${data.listingsCount}`;
      } else if (event.type === 'llm_query_extraction_response') {
        details = `Provider: ${data.provider || 'unknown'}`;
        if (data.extractedQuery) {
          details += ` | ServiceType: ${data.extractedQuery.serviceType || 'unknown'}`;
          details += ` | Confidence: ${(data.extractedQuery.confidence || 0).toFixed(2)}`;
        }
      } else if (event.type === 'llm_response_formatting_response') {
        details = `Provider: ${data.provider || 'unknown'}`;
        if (data.listingsCount !== undefined) details += ` | Listings: ${data.listingsCount}`;
        if (data.selectedListing) details += ` | Selected: ${data.selectedListing.movieTitle || data.selectedListing.providerName || 'N/A'}`;
      } else if (event.type === 'llm_error') {
        details = `Provider: ${data.provider || 'unknown'}`;
        if (data.error) details += ` | Error: ${data.error}`;
      }
      
      return details ? `${event.message} (${details})` : event.message;
    }
    
    return event.message;
  }

  formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }
}

