import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';
import { getApiBaseUrl } from '../../services/api-base';
import { MessagingService, Conversation, Message } from '../../services/messaging.service';
import { IdentityService } from '../../services/identity.service';
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
  showInboxModal: boolean = false; // Control modal visibility
  isGod: boolean = false; // Whether current user is GOD
  replyMessage: string = ''; // Message input for GOD to respond
  isSendingMessage: boolean = false;
  private lastInboxLoadTime: number = 0;
  private readonly INBOX_LOAD_COOLDOWN = 2000; // 2 seconds cooldown
  private inboxLoadTimeout: any = null;

  constructor(
    private http: HttpClient,
    private wsService: WebSocketService,
    private messagingService: MessagingService,
    private identityService: IdentityService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Initialize conversation ID for "GOD inbox with Mercy"
    this.activeConversationId = this.buildConversationId('service', 'god');
    
    // Get user email from input or identity service
    if (!this.userEmail) {
      const currentUser = this.identityService.getCurrentUser();
      if (currentUser) {
        this.userEmail = currentUser.primaryEmail;
      }
    }
    
    // Check if user is GOD (ROOT_AUTHORITY)
    // GOD is the admin email
    const adminEmail = 'bill.draper.auto@gmail.com'; // TODO: Get from config or service
    this.isGod = this.userEmail === adminEmail;
    
    console.log('[Popup Chat] User email:', this.userEmail, 'Is GOD:', this.isGod);
    
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
    if (this.inboxLoadTimeout) {
      clearTimeout(this.inboxLoadTimeout);
    }
  }

  buildConversationId(type: string, id: string): string {
    // Use the correct format that matches backend: conv:scope:id:mode
    return `conv:${type}:${id}:user`;
  }

  loadChatHistory(limit: number = 50) {
    if (!this.activeConversationId) return;
    
    const cid = this.activeConversationId;
    const seq = ++this.chatHistoryLoadSeq;
    
    // Use a smaller limit for faster loading - only load recent messages
    const optimizedLimit = Math.min(limit, 30);
    const url = `${this.apiUrl}/api/chat-history/history?conversationId=${encodeURIComponent(cid)}&limit=${encodeURIComponent(String(optimizedLimit))}`;
    
    console.log('[Popup Chat] Loading chat history:', cid, 'limit:', optimizedLimit);
    const startTime = Date.now();
    
    this.http.get<{ success: boolean; messages?: any[] }>(url)
      .pipe(
        timeout(5000) // Reduced timeout for faster failure detection
      )
      .subscribe({
        next: (resp) => {
          const loadTime = Date.now() - startTime;
          console.log(`[Popup Chat] Chat history loaded in ${loadTime}ms, messages: ${(resp.messages || []).length}`);
          
          if (seq !== this.chatHistoryLoadSeq || this.activeConversationId !== cid) {
            console.log('[Popup Chat] Ignoring stale chat history response');
            return;
          }
          
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
          const loadTime = Date.now() - startTime;
          console.error(`[Popup Chat] Failed to load chat history after ${loadTime}ms:`, err);
          // Don't show error to user - just log it
        }
      });
  }

  handleWebSocketEvent(event: SimulatorEvent) {
    // Handle llm_response events - only for GOD chat conversation
    if (event.type === 'llm_response') {
      // Check if this event is for our conversation (GOD chat)
      const eventConversationId = (event as any).data?.conversationId;
      const isForThisConversation = !eventConversationId || eventConversationId === this.activeConversationId;
      
      if (isForThisConversation) {
        const llmMsg =
          (event as any).message ||
          (event as any).data?.response?.message ||
          (event as any).data?.message ||
          '';
        
        if (llmMsg && typeof llmMsg === 'string' && llmMsg.trim()) {
          console.log('[Popup Chat] Received WebSocket llm_response:', llmMsg.substring(0, 100));
          // Check if message already exists to avoid duplicates
          const exists = this.chatMessages.some(m => 
            m.role === 'ASSISTANT' && m.content === llmMsg.trim()
          );
          if (!exists) {
            this.appendChatHistory('ASSISTANT', llmMsg);
          }
        }
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
    if (!this.activeConversationId) {
      console.warn('[Popup Chat] Cannot append message: no active conversation');
      return;
    }
    
    const trimmed = String(content || '').trim();
    if (!trimmed) {
      console.warn('[Popup Chat] Cannot append message: empty content');
      return;
    }

    console.log(`[Popup Chat] Appending ${role} message:`, trimmed.substring(0, 50) + '...');

    // Dedupe only for non-USER messages
    const sig = `${role}|${this.activeConversationId}|${trimmed}`;
    if (role !== 'USER') {
      const lastAt = this.lastAppendBySig.get(sig);
      if (lastAt && Date.now() - lastAt < 2000) {
        console.log('[Popup Chat] Skipping duplicate message (within 2s cooldown)');
        return;
      }
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
    
    console.log(`[Popup Chat] Message added. Total messages: ${this.chatMessages.length}`);
    this.cdr.markForCheck();
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

    console.log('[Popup Chat] Sending message:', input);

    // Call chat API with GOD chat flag
    this.http.post<any>(`${this.apiUrl}/api/chat`, {
      input: input,
      email: this.userEmail || 'guest@example.com',
      isGodChat: true // Special flag for GOD chat messages
    }).subscribe({
      next: (response) => {
        console.log('[Popup Chat] Received response:', response);
        if (response && response.message) {
          console.log('[Popup Chat] Adding assistant message:', response.message);
          this.appendChatHistory('ASSISTANT', response.message);
        } else if (response && response.success === false) {
          console.error('[Popup Chat] API returned error:', response.error);
          this.appendChatHistory('ASSISTANT', `Error: ${response.error || 'Unknown error'}. Please try again.`);
        } else {
          console.warn('[Popup Chat] Unexpected response format:', response);
          this.appendChatHistory('ASSISTANT', 'I received your message but got an unexpected response format.');
        }
        this.isProcessing = false;
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        console.error('❌ [Popup Chat] Error calling /api/chat:', error);
        console.error('❌ [Popup Chat] Error details:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          error: error.error
        });
        const errorMessage = error.error?.error || error.message || 'Unknown error';
        this.appendChatHistory('ASSISTANT', `Sorry, I encountered an error: ${errorMessage}. Please try again.`);
        this.isProcessing = false;
        this.cdr.detectChanges();
      }
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
  loadInboxConversations(force: boolean = false): void {
    if (!this.userEmail) {
      return;
    }
    
    // Throttle: prevent rapid successive calls
    const now = Date.now();
    if (!force && now - this.lastInboxLoadTime < this.INBOX_LOAD_COOLDOWN) {
      // Clear existing timeout and set a new one
      if (this.inboxLoadTimeout) {
        clearTimeout(this.inboxLoadTimeout);
      }
      this.inboxLoadTimeout = setTimeout(() => this.loadInboxConversations(true), this.INBOX_LOAD_COOLDOWN - (now - this.lastInboxLoadTime));
      return;
    }
    
    this.lastInboxLoadTime = now;
    if (this.inboxLoadTimeout) {
      clearTimeout(this.inboxLoadTimeout);
      this.inboxLoadTimeout = null;
    }
    
    this.isLoadingInboxConversations = true;
    
    // Load GOVERNANCE conversations where user is a participant
    // Use backend filtering to reduce data transfer
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
  
  openInboxModal(conversation: Conversation): void {
    this.selectedInboxConversation = conversation;
    this.showInboxModal = true;
    this.loadInboxMessages(conversation.conversationId);
  }
  
  closeInboxModal(): void {
    this.showInboxModal = false;
  }
  
  closeInboxModalOnBackdrop(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains('modal') || target.classList.contains('modal-backdrop')) {
      this.closeInboxModal();
    }
  }
  
  sendInboxMessage(): void {
    if (!this.selectedInboxConversation || !this.replyMessage.trim() || this.isSendingMessage || !this.isGod) {
      return;
    }
    
    this.isSendingMessage = true;
    const messageText = this.replyMessage.trim();
    
    // Get the user's email from conversation participants (the one that's not ROOT_AUTHORITY)
    const userEmail = this.selectedInboxConversation.participants.find(p => p !== 'ROOT_AUTHORITY') || this.userEmail || '';
    
    this.messagingService.sendMessage({
      conversationId: this.selectedInboxConversation.conversationId,
      messageType: 'TEXT',
      payload: { text: messageText },
      senderId: 'ROOT_AUTHORITY',
      senderType: 'ROOT_AUTHORITY'
    }).subscribe({
      next: (response) => {
        if (response.success) {
          console.log('[Popup Chat Inbox] Message sent successfully:', response.message);
          
          // Also append to user's chat history so it appears in the chat tab
          if (userEmail && this.activeConversationId) {
            const chatHistoryConversationId = this.buildConversationId('service', 'god');
            const clientId = `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
            const clientTs = Date.now();
            
            this.http.post<{ success: boolean; message?: any }>(`${this.apiUrl}/api/chat-history/append`, {
              conversationId: chatHistoryConversationId,
              id: clientId,
              role: 'ASSISTANT',
              content: messageText,
              timestamp: clientTs,
              userEmail: userEmail
            }).subscribe({
              next: () => {
                console.log('[Popup Chat Inbox] Message also appended to chat history');
                // Add to local chat messages immediately
                this.appendChatHistory('ASSISTANT', messageText);
              },
              error: (err) => {
                console.error('[Popup Chat Inbox] Failed to append to chat history:', err);
                // Still add to local chat messages even if server append fails
                this.appendChatHistory('ASSISTANT', messageText);
              }
            });
          }
          
          this.replyMessage = '';
          // Add the new message to the messages array immediately (optimistic update)
          if (response.message) {
            this.inboxMessages.push(response.message);
            this.inboxMessages.sort((a, b) => a.timestamp - b.timestamp);
          }
          // Reload messages to ensure we have the latest (but don't reload conversations immediately)
          if (this.selectedInboxConversation) {
            this.loadInboxMessages(this.selectedInboxConversation.conversationId);
          }
          // Reload conversations after a delay to update the updatedAt timestamp (throttled)
          setTimeout(() => this.loadInboxConversations(), 1000);
        }
        this.isSendingMessage = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('[Popup Chat Inbox] Error sending message:', error);
        this.isSendingMessage = false;
        this.cdr.detectChanges();
      }
    });
  }
  
  loadInboxMessages(conversationId: string): void {
    this.isLoadingInboxMessages = true;
    this.inboxMessages = [];
    
    console.log('[Popup Chat Inbox] Loading messages for conversation:', conversationId);
    console.log('[Popup Chat Inbox] User email:', this.userEmail);
    console.log('[Popup Chat Inbox] Is GOD:', this.isGod);
    
    // For GOD, use 'ROOT_AUTHORITY' as entityId, otherwise use user email
    const entityId = this.isGod ? 'ROOT_AUTHORITY' : (this.userEmail || '');
    const entityType = this.isGod ? 'ROOT_AUTHORITY' : 'USER';
    
    console.log('[Popup Chat Inbox] Using entityId:', entityId, 'entityType:', entityType);
    
    this.messagingService.getConversationMessages(
      conversationId,
      entityId,
      entityType
    ).subscribe({
      next: (response) => {
        console.log('[Popup Chat Inbox] Received response:', response);
        if (response.success) {
          this.inboxMessages = response.messages || [];
          console.log('[Popup Chat Inbox] Loaded', this.inboxMessages.length, 'messages');
          // Sort by timestamp (oldest first)
          this.inboxMessages.sort((a, b) => a.timestamp - b.timestamp);
        } else {
          console.warn('[Popup Chat Inbox] Response was not successful:', response);
        }
        this.isLoadingInboxMessages = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('[Popup Chat Inbox] Error loading inbox messages:', error);
        console.error('[Popup Chat Inbox] Error details:', {
          conversationId,
          entityId,
          entityType,
          userEmail: this.userEmail,
          errorMessage: error?.message,
          errorStatus: error?.status,
          errorBody: error?.error
        });
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

