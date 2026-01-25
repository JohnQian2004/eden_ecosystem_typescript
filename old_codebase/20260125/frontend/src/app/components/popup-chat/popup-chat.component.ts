import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';
import { getApiBaseUrl } from '../../services/api-base';
import { MessagingService, Conversation, Message } from '../../services/messaging.service';
import { timeout } from 'rxjs/operators';

@Component({
  selector: 'app-popup-chat',
  templateUrl: './popup-chat.component.html',
  styleUrls: ['./popup-chat.component.scss']
})
export class PopupChatComponent implements OnInit, OnDestroy {
  @Input() userEmail: string | null = null;
  @Output() close = new EventEmitter<void>();
  
  chatMessages: Array<{ 
    id?: string; 
    role: 'USER' | 'ASSISTANT' | 'SYSTEM'; 
    content: string; 
    timestamp: number; 
  }> = [];
  
  chatInput: string = '';
  isProcessing: boolean = false;
  activeConversationId: string | null = null;
  private subscription: any;
  private apiUrl = getApiBaseUrl();
  private chatHistoryLoadSeq: number = 0;
  private lastAppendBySig: Map<string, number> = new Map();
  private readonly MAX_CHAT_HISTORY_MESSAGES = 200;
  
  // Tab management
  activeTab: 'chat' | 'inbox' = 'chat';
  
  // Inbox data
  inboxConversations: Conversation[] = [];
  selectedInboxConversation: Conversation | null = null;
  inboxMessages: Message[] = [];
  isLoadingInboxConversations: boolean = false;
  isLoadingInboxMessages: boolean = false;

  constructor(
    private http: HttpClient,
    private wsService: WebSocketService,
    private messagingService: MessagingService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Initialize conversation ID for "GOD inbox with Mercy"
    this.activeConversationId = this.buildConversationId('service', 'god');
    
    // Load chat history
    this.loadChatHistory();
    
    // Load inbox conversations
    this.loadInboxConversations();
    
    // Subscribe to WebSocket events
    this.subscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      this.handleWebSocketEvent(event);
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  buildConversationId(type: string, id: string): string {
    return `conv_${type}_${id}`;
  }

  loadChatHistory(limit: number = 50) {
    if (!this.activeConversationId) return;
    
    const cid = this.activeConversationId;
    const seq = ++this.chatHistoryLoadSeq;
    const url = `${this.apiUrl}/api/chat-history/history?conversationId=${encodeURIComponent(cid)}&limit=${encodeURIComponent(String(limit))}`;
    
    this.http.get<{ success: boolean; messages?: any[] }>(url)
      .pipe(
        timeout(8000)
      )
      .subscribe({
        next: (resp) => {
          if (seq !== this.chatHistoryLoadSeq || this.activeConversationId !== cid) return;
          
          const serverMessages = (resp.messages || []).map((m: any) => ({
            id: m.id,
            role: (m.role || 'SYSTEM') as 'USER' | 'ASSISTANT' | 'SYSTEM',
            content: m.content,
            timestamp: m.timestamp || Date.now()
          }));

          this.chatMessages = serverMessages.length > this.MAX_CHAT_HISTORY_MESSAGES
            ? serverMessages.slice(-this.MAX_CHAT_HISTORY_MESSAGES)
            : serverMessages;

          this.cdr.detectChanges();
          this.scrollToBottom();
        },
        error: (err) => {
          console.error('Failed to load chat history:', err);
        }
      });
  }

  handleWebSocketEvent(event: SimulatorEvent) {
    // Handle llm_response events
    if (event.type === 'llm_response') {
      const llmMsg =
        (event as any).message ||
        (event as any).data?.response?.message ||
        (event as any).data?.message ||
        '';
      
      if (llmMsg && typeof llmMsg === 'string' && llmMsg.trim()) {
        this.appendChatHistory('ASSISTANT', llmMsg);
      }
    }
    
    // Handle chat_history_message events (live sync)
    if (event.type === 'chat_history_message' && (event as any).data?.message) {
      const m = (event as any).data.message;
      if (m?.conversationId && m.conversationId === this.activeConversationId) {
        const exists = this.chatMessages.some(x => (x as any).id && (x as any).id === m.id);
        if (!exists) {
          const next = [...this.chatMessages, {
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp || Date.now()
          }];
          this.chatMessages = next.length > this.MAX_CHAT_HISTORY_MESSAGES
            ? next.slice(-this.MAX_CHAT_HISTORY_MESSAGES)
            : next;
          this.cdr.detectChanges();
          this.scrollToBottom();
        }
      }
    }
  }

  appendChatHistory(role: 'USER' | 'ASSISTANT' | 'SYSTEM', content: string) {
    if (!this.activeConversationId) return;
    
    const trimmed = String(content || '').trim();
    if (!trimmed) return;

    // Dedupe only for non-USER messages
    const sig = `${role}|${this.activeConversationId}|${trimmed}`;
    if (role !== 'USER') {
      const lastAt = this.lastAppendBySig.get(sig);
      if (lastAt && Date.now() - lastAt < 2000) return;
      this.lastAppendBySig.set(sig, Date.now());
    }

    const clientId = `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const clientTs = Date.now();
    const local = { 
      id: clientId, 
      role, 
      content: trimmed, 
      timestamp: clientTs
    };

    const next = [...this.chatMessages, local];
    this.chatMessages = next.length > this.MAX_CHAT_HISTORY_MESSAGES
      ? next.slice(-this.MAX_CHAT_HISTORY_MESSAGES)
      : next;
    
    this.cdr.detectChanges();
    this.scrollToBottom();

    // Persist to server
    this.http.post<{ success: boolean; message?: any }>(`${this.apiUrl}/api/chat-history/append`, {
      conversationId: this.activeConversationId,
      id: clientId,
      role,
      content: trimmed,
      timestamp: clientTs,
      userEmail: this.userEmail
    }).subscribe({
      next: () => {},
      error: (err) => console.error('Failed to persist chat message:', err)
    });
  }

  onSubmit() {
    const input = this.chatInput.trim();
    if (!input || this.isProcessing) return;

    // Add user message immediately
    this.appendChatHistory('USER', input);
    this.chatInput = '';
    this.isProcessing = true;

    // Call chat API with GOD chat flag
    this.http.post<any>(`${this.apiUrl}/api/chat`, {
      input: input,
      email: this.userEmail || 'guest@example.com',
      isGodChat: true // Special flag for GOD chat messages
    }).toPromise()
      .then((response) => {
        if (response && response.message) {
          this.appendChatHistory('ASSISTANT', response.message);
        } else {
          this.appendChatHistory('ASSISTANT', 'I received your message but got an unexpected response format.');
        }
      })
      .catch((error: any) => {
        console.error('❌ Error calling /api/chat:', error);
        this.appendChatHistory('ASSISTANT', `Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`);
      })
      .finally(() => {
        this.isProcessing = false;
        this.cdr.detectChanges();
      });
  }

  scrollToBottom() {
    setTimeout(() => {
      const container = document.querySelector('.popup-chat-messages');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 50);
  }

  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  getRoleLabel(role: string): string {
    switch(role) {
      case 'USER': return 'You';
      case 'ASSISTANT': return 'GOD';
      case 'SYSTEM': return 'System';
      default: return role;
    }
  }

  closePopup() {
    this.close.emit();
  }

  clearChat() {
    if (!this.activeConversationId) return;
    
    this.chatHistoryLoadSeq++;
    this.chatMessages = [];
    this.lastAppendBySig.clear();
    
    // Delete from server
    this.http.request<any>('DELETE', `${this.apiUrl}/api/chat-history/delete`, {
      body: JSON.stringify({ conversationId: this.activeConversationId }),
      headers: { 'Content-Type': 'application/json' }
    }).toPromise()
      .catch(err => console.error('Failed to delete chat history:', err));
    
    this.cdr.detectChanges();
  }
  
  // Inbox methods
  loadInboxConversations(): void {
    if (!this.userEmail) {
      return;
    }
    
    this.isLoadingInboxConversations = true;
    
    // Load GOVERNANCE conversations where user is a participant
    this.messagingService.getConversations({
      scopeType: 'GOVERNANCE',
      participantId: this.userEmail,
      state: 'OPEN'
    }).subscribe({
      next: (response) => {
        if (response.success) {
          // Filter to only conversations with ROOT_AUTHORITY
          this.inboxConversations = response.conversations.filter(conv => 
            conv.participants.includes('ROOT_AUTHORITY')
          );
          // Sort by updatedAt (newest first)
          this.inboxConversations.sort((a, b) => b.updatedAt - a.updatedAt);
          
          // Auto-select first conversation if available
          if (this.inboxConversations.length > 0 && !this.selectedInboxConversation) {
            this.selectInboxConversation(this.inboxConversations[0]);
          }
        }
        this.isLoadingInboxConversations = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading inbox conversations:', error);
        this.isLoadingInboxConversations = false;
        this.cdr.detectChanges();
      }
    });
  }
  
  selectInboxConversation(conversation: Conversation): void {
    this.selectedInboxConversation = conversation;
    this.loadInboxMessages(conversation.conversationId);
  }
  
  loadInboxMessages(conversationId: string): void {
    this.isLoadingInboxMessages = true;
    this.inboxMessages = [];
    
    this.messagingService.getConversationMessages(
      conversationId,
      this.userEmail || '',
      'USER'
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.inboxMessages = response.messages;
          // Sort by timestamp (oldest first)
          this.inboxMessages.sort((a, b) => a.timestamp - b.timestamp);
        }
        this.isLoadingInboxMessages = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading inbox messages:', error);
        this.isLoadingInboxMessages = false;
        this.cdr.detectChanges();
      }
    });
  }
  
  formatInboxTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }
  
  getInboxSenderLabel(message: Message): string {
    if (message.senderType === 'ROOT_AUTHORITY') {
      return '⚡ GOD';
    } else if (message.senderType === 'USER') {
      return `👤 ${message.senderId}`;
    } else {
      return `${message.senderType}: ${message.senderId}`;
    }
  }
  
  refreshInbox(): void {
    this.loadInboxConversations();
    if (this.selectedInboxConversation) {
      this.loadInboxMessages(this.selectedInboxConversation.conversationId);
    }
  }
  
  // Helper methods for template
  getOtherParticipants(participants: string[]): string {
    return participants.filter(p => p !== 'ROOT_AUTHORITY' && p !== (this.userEmail || '')).join(', ');
  }
  
  getFirstNonRootParticipant(participants: string[]): string | undefined {
    return participants.find(p => p !== 'ROOT_AUTHORITY');
  }
}

