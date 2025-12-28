import { Component, OnInit, OnDestroy } from '@angular/core';
import { WebSocketService } from './services/websocket.service';
import { ChatService } from './services/chat.service';

export interface SimulatorEvent {
  type: string;
  component: string;
  message: string;
  timestamp: number;
  data?: any;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Eden Simulator Dashboard';
  userInput: string = 'I want a sci-fi movie to watch tonight at the best price';
  isProcessing: boolean = false;
  userEmail: string = ''; // Will be set from localStorage or default
  
  constructor(
    public wsService: WebSocketService,
    private chatService: ChatService
  ) {}

  ngOnInit() {
    // Suppress console errors from browser extensions
    const originalError = console.error;
    console.error = (...args: any[]) => {
      if (args[0] && typeof args[0] === 'string' && args[0].includes('solana')) {
        return; // Ignore Solana extension errors
      }
      originalError.apply(console, args);
    };

    // Get email from localStorage or use default (alice@gmail.com from USERS array)
    this.userEmail = localStorage.getItem('userEmail') || 'alice@gmail.com';
    this.wsService.connect();
  }

  ngOnDestroy() {
    this.wsService.disconnect();
  }

  async onSubmit() {
    if (!this.userInput.trim() || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const input = this.userInput.trim();
    this.userInput = ''; // Clear input

    try {
      await this.chatService.sendMessageAsync(input, this.userEmail);
    } catch (error: any) {
      // Ignore Solana extension errors
      if (error && !error.message?.includes('solana') && !error.message?.includes('Solana')) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

