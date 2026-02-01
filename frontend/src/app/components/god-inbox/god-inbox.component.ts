import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MessagingService, Conversation, Message } from '../../services/messaging.service';
import { IdentityService } from '../../services/identity.service';
import { WebSocketService } from '../../services/websocket.service';
import { getApiBaseUrl } from '../../services/api-base';
import { SimulatorEvent } from '../../app.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-god-inbox',
  templateUrl: './god-inbox.component.html',
  styleUrls: ['./god-inbox.component.scss']
})
export class GodInboxComponent implements OnInit, OnDestroy {
  conversations: Conversation[] = [];
  selectedConversation: Conversation | null = null;
  messages: Message[] = [];
  isLoadingConversations: boolean = false;
  isLoadingMessages: boolean = false;
  userEmail: string = '';
  userType: 'USER' | 'GARDEN' | 'PRIEST' | 'ROOT_AUTHORITY' = 'USER';
  isGod: boolean = false; // Whether current user is GOD (ROOT_AUTHORITY)
  replyMessage: string = ''; // Message input for GOD to respond
  isSendingMessage: boolean = false;
  showModal: boolean = false; // Control modal visibility

  private apiUrl = getApiBaseUrl();
  private lastLoadTime: number = 0;
  private readonly LOAD_COOLDOWN = 2000; // 2 seconds cooldown between loads
  private loadTimeout: any = null;
  private wsSubscription: Subscription | null = null;

  constructor(
    private http: HttpClient,
    private messagingService: MessagingService,
    private identityService: IdentityService,
    private webSocketService: WebSocketService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Get current user
    const currentUser = this.identityService.getCurrentUser();
    if (currentUser) {
      this.userEmail = currentUser.primaryEmail;
      
      // Check if user is GOD (ROOT_AUTHORITY)
      // GOD is the admin email in GOD mode
      const adminEmail = 'bill.draper.auto@gmail.com'; // TODO: Get from config or service
      this.isGod = this.userEmail === adminEmail;
      
      if (this.isGod) {
        this.userType = 'ROOT_AUTHORITY';
      } else {
        this.userType = 'USER';
      }
    }
    
    this.loadConversations();
    
    // Subscribe to WebSocket events to refresh inbox when new GOD messages arrive
    this.wsSubscription = this.webSocketService.events$.subscribe((event: SimulatorEvent) => {
      if (event.type === 'god_message_received') {
        console.log('📨 [GOD Inbox] Received god_message_received event, refreshing inbox...');
        const eventData = event.data as any;
        
        // Add a small delay to ensure backend has processed the message/conversation
        setTimeout(() => {
          // Refresh conversations to show the new message (force refresh)
          this.loadConversations(true);
          
          // If a conversation is currently selected and the new message is for that conversation,
          // also refresh the messages
          if (this.selectedConversation && 
              eventData?.conversationId === this.selectedConversation.conversationId) {
            console.log('📨 [GOD Inbox] New message for selected conversation, refreshing messages...');
            this.loadMessages(this.selectedConversation.conversationId);
          }
        }, 300);
      }
    });
  }
  
  // Helper methods for template
  isNotRootAuthority(participant: string): boolean {
    return participant !== 'ROOT_AUTHORITY';
  }
  
  isNotUserEmail(participant: string): boolean {
    return participant !== this.userEmail;
  }
  
  getOtherParticipants(participants: string[]): string {
    return participants.filter(p => p !== 'ROOT_AUTHORITY' && p !== this.userEmail).join(', ');
  }
  
  getFirstNonRootParticipant(participants: string[]): string | undefined {
    return participants.find(p => p !== 'ROOT_AUTHORITY');
  }

  ngOnDestroy(): void {
    if (this.loadTimeout) {
      clearTimeout(this.loadTimeout);
    }
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
  }

  loadConversations(force: boolean = false): void {
    if (!this.userEmail) {
      console.warn('No user email available');
      this.isLoadingConversations = false;
      return;
    }
    
    // Throttle: prevent rapid successive calls
    const now = Date.now();
    if (!force && now - this.lastLoadTime < this.LOAD_COOLDOWN) {
      // Clear existing timeout and set a new one
      if (this.loadTimeout) {
        clearTimeout(this.loadTimeout);
      }
      this.loadTimeout = setTimeout(() => this.loadConversations(true), this.LOAD_COOLDOWN - (now - this.lastLoadTime));
      return;
    }
    
    this.lastLoadTime = now;
    if (this.loadTimeout) {
      clearTimeout(this.loadTimeout);
      this.loadTimeout = null;
    }
    
    this.isLoadingConversations = true;
    
    // Optimize: Use backend filters more effectively
    // If user is GOD, load all GOVERNANCE conversations
    // Otherwise, filter by participantId on backend to reduce data transfer
    const filters: any = {
      scopeType: 'GOVERNANCE',
      state: 'OPEN'
    };
    
    // For non-GOD users, filter by participant on backend to reduce data transfer
    if (!this.isGod) {
      filters.participantId = this.userEmail;
    }
    
    this.messagingService.getConversations(filters).subscribe({
      next: (response) => {
        if (response.success) {
          // Filter to only conversations with ROOT_AUTHORITY
          // Backend filtering already handled participant filtering for non-GOD users
          this.conversations = response.conversations.filter(conv => 
            conv.participants.includes('ROOT_AUTHORITY')
          );
          // Sort by updatedAt (newest first)
          this.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
        }
        this.isLoadingConversations = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error loading conversations:', error);
        this.isLoadingConversations = false;
        this.cdr.detectChanges();
      }
    });
  }

  selectConversation(conversation: Conversation): void {
    this.selectedConversation = conversation;
    this.loadMessages(conversation.conversationId);
  }
  
  openConversationModal(conversation: Conversation): void {
    this.selectedConversation = conversation;
    this.showModal = true;
    this.loadMessages(conversation.conversationId);
  }
  
  closeModal(): void {
    this.showModal = false;
    // Optionally clear selected conversation when closing
    // this.selectedConversation = null;
  }
  
  closeModalOnBackdrop(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains('modal') || target.classList.contains('modal-backdrop')) {
      this.closeModal();
    }
  }

  loadMessages(conversationId: string): void {
    if (!this.userEmail && !this.isGod) {
      console.warn('Cannot load messages: no user email');
      this.isLoadingMessages = false;
      return;
    }
    
    this.isLoadingMessages = true;
    this.messages = [];
    
    // For GOD, use 'ROOT_AUTHORITY' as entityId, otherwise use user email
    const entityId = this.isGod ? 'ROOT_AUTHORITY' : this.userEmail;
    
    console.log(`[GOD Inbox] Loading messages for conversation: ${conversationId}, entity: ${entityId}, type: ${this.userType}`);
    
    this.messagingService.getConversationMessages(
      conversationId,
      entityId,
      this.userType
    ).subscribe({
      next: (response) => {
        console.log(`[GOD Inbox] Received response:`, response);
        if (response.success) {
          this.messages = response.messages || [];
          console.log(`[GOD Inbox] Loaded ${this.messages.length} messages`);
          // Sort by timestamp (oldest first)
          this.messages.sort((a, b) => a.timestamp - b.timestamp);
        } else {
          console.warn(`[GOD Inbox] Response was not successful:`, response);
        }
        this.isLoadingMessages = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('[GOD Inbox] Error loading messages:', error);
        console.error('[GOD Inbox] Error details:', {
          conversationId,
          userEmail: this.userEmail,
          userType: this.userType,
          errorMessage: error?.message,
          errorStatus: error?.status,
          errorBody: error?.error
        });
        this.isLoadingMessages = false;
        this.cdr.detectChanges();
      }
    });
  }

  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  getSenderLabel(message: Message): string {
    if (message.senderType === 'ROOT_AUTHORITY') {
      return '⚡ GOD';
    } else if (message.senderType === 'USER') {
      return `👤 ${message.senderId}`;
    } else {
      return `${message.senderType}: ${message.senderId}`;
    }
  }

  getMessageStateClass(message: Message): string {
    if (message.state === 'FORGIVEN') {
      return 'text-muted text-decoration-line-through';
    } else if (message.state === 'REDACTED') {
      return 'text-danger';
    }
    return '';
  }

  refresh(): void {
    this.loadConversations(true);
    if (this.selectedConversation) {
      this.loadMessages(this.selectedConversation.conversationId);
    }
  }
  
  // Public method to force refresh (can be called externally)
  public forceRefresh(): void {
    console.log('🔄 [GOD Inbox] Force refresh requested');
    this.loadConversations(true);
    if (this.selectedConversation) {
      this.loadMessages(this.selectedConversation.conversationId);
    }
  }
  
  // Send message as GOD (ROOT_AUTHORITY)
  sendGodMessage(): void {
    if (!this.selectedConversation || !this.replyMessage.trim() || this.isSendingMessage) {
      return;
    }
    
    this.isSendingMessage = true;
    const messageText = this.replyMessage.trim();
    
    // Get the user's email from conversation participants (the one that's not ROOT_AUTHORITY)
    const userEmail = this.selectedConversation.participants.find(p => p !== 'ROOT_AUTHORITY') || '';
    
    this.messagingService.sendMessage({
      conversationId: this.selectedConversation.conversationId,
      messageType: 'TEXT',
      payload: { text: messageText },
      senderId: 'ROOT_AUTHORITY',
      senderType: 'ROOT_AUTHORITY'
    }).subscribe({
      next: (response) => {
        if (response.success) {
          console.log('[GOD Inbox] Message sent successfully:', response.message);
          
          // Also append to user's chat history so it appears in their chat
          if (userEmail) {
            const chatHistoryConversationId = `conv:service:god:user`;
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
                console.log('[GOD Inbox] Message also appended to user chat history');
              },
              error: (err) => {
                console.error('[GOD Inbox] Failed to append to chat history:', err);
              }
            });
          }
          
          this.replyMessage = '';
          // Add the new message to the messages array immediately (optimistic update)
          if (response.message) {
            this.messages.push(response.message);
            this.messages.sort((a, b) => a.timestamp - b.timestamp);
          }
          // Reload messages immediately to ensure we have the latest
          if (this.selectedConversation) {
            this.loadMessages(this.selectedConversation.conversationId);
          }
          // Reload conversations after a delay to update the updatedAt timestamp (use force to bypass throttling)
          setTimeout(() => {
            this.loadConversations(true);
          }, 1000);
        }
        this.isSendingMessage = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('[GOD Inbox] Error sending message:', error);
        this.isSendingMessage = false;
        this.cdr.detectChanges();
      }
    });
  }
}

