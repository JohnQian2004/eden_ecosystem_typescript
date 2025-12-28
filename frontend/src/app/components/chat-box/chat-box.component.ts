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
      default:
        return 'text-dark';
    }
  }

  formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }
}

