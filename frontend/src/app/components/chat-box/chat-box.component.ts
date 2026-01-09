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
      case 'dex_trade_executed':
      case 'dex_trade_complete':
        return 'text-success fw-bold';
      case 'ledger_entry_pushed':
        return 'text-primary';
      case 'ledger_entry_settled':
        return 'text-success fw-bold';
      case 'settlement_consumer_started':
        return 'text-success';
      case 'settlement_batch_processing':
        return 'text-info';
      case 'settlement_processing_start':
        return 'text-info';
      case 'settlement_processing_error':
      case 'settlement_entry_not_found':
      case 'settlement_certificate_invalid':
      case 'settlement_connection_error':
      case 'settlement_stream_error':
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
      case 'dex_trade_executed':
      case 'dex_trade_complete':
        return '💰';
      case 'indexer_indexed':
        return '📡';
      case 'token_indexer_indexed':
        return '🔷';
      case 'indexer_stream':
        return '📤';
      case 'token_indexer_stream':
        return '🔷';
      case 'ledger_entry_pushed':
        return '📤';
      case 'ledger_entry_settled':
        return '⚖️';
      case 'settlement_consumer_started':
        return '✅';
      case 'settlement_batch_processing':
        return '⚙️';
      case 'settlement_processing_start':
        return '🔄';
      case 'settlement_processing_error':
      case 'settlement_entry_not_found':
      case 'settlement_certificate_invalid':
      case 'settlement_connection_error':
      case 'settlement_stream_error':
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
        if (data.selectedListing) details += ` | Selected: ${data.selectedListing.movieTitle || data.selectedListing.providerName || data.selectedListing.tokenSymbol || 'N/A'}`;
      } else if (event.type === 'llm_error') {
        details = `Provider: ${data.provider || 'unknown'}`;
        if (data.error) details += ` | Error: ${data.error}`;
      }
      
      return details ? `${event.message} (${details})` : event.message;
    }
    
    if (event.type.startsWith('dex_')) {
      const data = event.data || {};
      let details = '';
      
      if (event.type === 'dex_trade_executed' || event.type === 'dex_trade_complete') {
        if (data.trade) {
          details = `${data.trade.action} ${data.trade.tokenAmount} ${data.trade.tokenSymbol}`;
          details += ` | Price: ${data.trade.price.toFixed(6)} ${data.trade.baseToken}/${data.trade.tokenSymbol}`;
          details += ` | iTax: ${data.trade.iTax.toFixed(6)} ${data.trade.baseToken}`;
        }
        if (data.traderRebate) details += ` | Rebate: ${data.traderRebate.toFixed(6)}`;
        if (data.rootCALiquidity) details += ` | ROOT CA Liquidity: ${data.rootCALiquidity.toFixed(2)} SOL`;
      }
      
      return details ? `${event.message} (${details})` : event.message;
    }
    
    // Token indexer events
    if (event.type === 'token_indexer_indexed' || event.type === 'token_indexer_stream') {
      const data = event.data || {};
      let details = '';
      
      if (data.indexer) details += `Indexer: ${data.indexer}`;
      if (data.txId) details += ` | TX: ${data.txId.substring(0, 8)}...`;
      if (data.indexers && Array.isArray(data.indexers)) {
        details += ` | Indexers: ${data.indexers.join(", ")}`;
      }
      if (data.count !== undefined) details += ` | Count: ${data.count}`;
      
      return details ? `${event.message} (${details})` : event.message;
    }
    
    // Regular indexer events
    if (event.type === 'indexer_indexed' || event.type === 'indexer_stream') {
      const data = event.data || {};
      let details = '';
      
      if (data.indexer) details += `Indexer: ${data.indexer}`;
      if (data.txId) details += ` | TX: ${data.txId.substring(0, 8)}...`;
      if (data.indexers && Array.isArray(data.indexers)) {
        details += ` | Indexers: ${data.indexers.join(", ")}`;
      }
      if (data.count !== undefined) details += ` | Count: ${data.count}`;
      
      return details ? `${event.message} (${details})` : event.message;
    }
    
    // Settlement events
    if (event.type.startsWith('settlement_') || event.type === 'ledger_entry_pushed' || event.type === 'ledger_entry_settled') {
      const data = event.data || {};
      let details = '';
      
      if (event.type === 'ledger_entry_pushed' || event.type === 'ledger_entry_settled') {
        if (data.entryId) details += `Entry: ${data.entryId.substring(0, 8)}...`;
        if (data.iGas !== undefined) details += ` | iGas: ${data.iGas.toFixed(6)}`;
        if (data.iTax !== undefined) details += ` | iTax: ${data.iTax.toFixed(6)}`;
        if (data.rootCABalance !== undefined) details += ` | ROOT CA Balance: ${data.rootCABalance.toFixed(6)}`;
        if (data.indexerBalance !== undefined) details += ` | Indexer Balance: ${data.indexerBalance.toFixed(6)}`;
      } else if (event.type === 'settlement_batch_processing') {
        if (data.count !== undefined) details += `Count: ${data.count}`;
      } else if (event.type === 'settlement_processing_start') {
        if (data.entryId) details += `Entry: ${data.entryId.substring(0, 8)}...`;
        if (data.iGas !== undefined) details += ` | iGas: ${data.iGas.toFixed(6)}`;
        if (data.iTax !== undefined) details += ` | iTax: ${data.iTax.toFixed(6)}`;
        if (data.indexerId) details += ` | Indexer: ${data.indexerId}`;
      } else if (event.type.includes('error') || event.type.includes('invalid') || event.type.includes('not_found')) {
        if (data.entryId) details += `Entry: ${data.entryId}`;
        if (data.providerUuid) details += ` | Provider: ${data.providerUuid}`;
        if (data.error) details += ` | Error: ${data.error}`;
      }
      
      return details ? `${event.message} (${details})` : event.message;
    }
    
    return event.message;
  }

  formatTimestamp(timestamp: number | undefined): string {
    if (!timestamp || isNaN(timestamp)) {
      return new Date().toLocaleTimeString(); // Fallback to current time if invalid
    }
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return new Date().toLocaleTimeString(); // Fallback if date is invalid
    }
    return date.toLocaleTimeString();
  }
}

