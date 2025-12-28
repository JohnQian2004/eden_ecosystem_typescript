import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
    private chatService: ChatService,
    private cdr: ChangeDetectorRef
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
      console.log('⚠️ Submit blocked:', { 
        hasInput: !!this.userInput.trim(), 
        isProcessing: this.isProcessing 
      });
      return;
    }

    console.log('📤 Submitting chat message:', this.userInput);
    this.isProcessing = true;
    const input = this.userInput.trim();
    this.userInput = ''; // Clear input immediately to allow next input
    
    // Force change detection to update UI
    this.cdr.detectChanges();

    // Set a safety timeout to ensure isProcessing is always reset
    const safetyTimeout = setTimeout(() => {
      if (this.isProcessing) {
        console.warn('⚠️ Safety timeout: Resetting isProcessing flag');
        this.isProcessing = false;
        this.cdr.detectChanges();
      }
    }, 180000); // 3 minutes safety timeout

    try {
      const response = await this.chatService.sendMessageAsync(input, this.userEmail);
      console.log('✅ Chat message sent successfully:', response);
    } catch (error: any) {
      console.error('❌ Error caught in onSubmit:', error);
      // Ignore Solana extension errors
      if (error && !error.message?.includes('solana') && !error.message?.includes('Solana')) {
        const errorMsg = error.error?.error || error.message || 'Failed to send message. Please try again.';
        console.error('Error details:', { 
          error, 
          errorType: error?.constructor?.name,
          errorMessage: error?.message,
          errorStatus: error?.status
        });
        alert(`Error: ${errorMsg}`);
        // Restore input so user can retry
        this.userInput = input;
      } else {
        // Even for Solana errors, log and continue
        console.log('⚠️ Solana extension error ignored');
      }
    } finally {
      // Clear safety timeout
      clearTimeout(safetyTimeout);
      
      // Always reset processing state to allow next request
      console.log('🔄 Entering finally block, resetting isProcessing...');
      this.isProcessing = false;
      console.log('✅ Reset isProcessing flag, ready for next request');
      
      // Force change detection to update UI immediately
      this.cdr.detectChanges();
      
      // Double-check that isProcessing is false after a brief delay
      setTimeout(() => {
        if (this.isProcessing) {
          console.error('❌ CRITICAL: isProcessing still true after reset! Forcing reset...');
          this.isProcessing = false;
          this.cdr.detectChanges();
        } else {
          console.log('✅ Verified: isProcessing is false');
        }
      }, 100);
    }
  }
}

