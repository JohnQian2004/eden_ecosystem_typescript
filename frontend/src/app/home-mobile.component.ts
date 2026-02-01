import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { WebSocketService } from './services/websocket.service';
import { ChatService } from './services/chat.service';

interface ChatMessage {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  timestamp: number;
  conversationId?: string;
}

type HomeTab = 'chat' | 'features';

@Component({
  selector: 'app-home-mobile',
  templateUrl: './home-mobile.component.html',
  styleUrls: ['./home-mobile.component.scss']
})
export class HomeMobileComponent implements OnInit, OnDestroy {
  activeTab: HomeTab = 'chat';
  userEmail: string = '';
  userName: string = 'Adam'; // TODO: Get from user profile
  messages: ChatMessage[] = [];
  userInput: string = '';
  isProcessing: boolean = false;
  conversationId: string | null = null;
  
  // Greeting based on time
  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning';
    if (hour < 18) return 'Afternoon';
    return 'Evening';
  }

  constructor(
    private websocketService: WebSocketService,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Get user email from localStorage
    const savedEmail = localStorage.getItem('userEmail');
    if (savedEmail) {
      this.userEmail = savedEmail;
    } else {
      // Default email for testing
      this.userEmail = 'adam@eden.com';
    }

    // Initialize WebSocket connection
    this.websocketService.connect();
    this.websocketService.events$.subscribe((event: any) => {
      this.handleWebSocketMessage(event);
    });

    // Load chat history if needed
    this.loadChatHistory();
  }

  ngOnDestroy(): void {
    this.websocketService.disconnect();
  }

  setActiveTab(tab: HomeTab): void {
    this.activeTab = tab;
  }

  async sendMessage(): Promise<void> {
    if (!this.userInput.trim() || this.isProcessing) return;

    const userMessage: ChatMessage = {
      role: 'USER',
      content: this.userInput,
      timestamp: Date.now(),
      conversationId: this.conversationId || undefined
    };

    this.messages.push(userMessage);
    const input = this.userInput;
    this.userInput = '';
    this.isProcessing = true;
    this.cdr.detectChanges();

    try {
      // Send via HTTP using async method
      const response = await this.chatService.sendMessageAsync(
        input,
        this.userEmail,
        this.conversationId || undefined,
        'workflow'
      );

      if (response && response.conversationId) {
        this.conversationId = response.conversationId;
      }

      // Add assistant response
      if (response && (response.message || response.response)) {
        const assistantMessage: ChatMessage = {
          role: 'ASSISTANT',
          content: typeof response.message === 'string' ? response.message : JSON.stringify(response.message || response.response),
          timestamp: Date.now(),
          conversationId: this.conversationId || undefined
        };
        this.messages.push(assistantMessage);
      }
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        role: 'SYSTEM',
        content: `Error: ${error.message || 'Failed to send message. Please try again.'}`,
        timestamp: Date.now()
      };
      this.messages.push(errorMessage);
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  private handleWebSocketMessage(message: any): void {
    // Handle WebSocket messages
    if (message.type === 'chat_response') {
      const assistantMessage: ChatMessage = {
        role: 'ASSISTANT',
        content: message.content || JSON.stringify(message),
        timestamp: Date.now(),
        conversationId: message.conversationId || this.conversationId || undefined
      };
      this.messages.push(assistantMessage);
      this.cdr.detectChanges();
    }
  }

  private loadChatHistory(): void {}
}

