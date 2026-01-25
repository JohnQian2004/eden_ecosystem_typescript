import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { MessagingService, Conversation, Message } from '../../services/messaging.service';
import { IdentityService } from '../../services/identity.service';

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

  constructor(
    private messagingService: MessagingService,
    private identityService: IdentityService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Get current user
    const currentUser = this.identityService.getCurrentUser();
    if (currentUser) {
      this.userEmail = currentUser.primaryEmail;
      // Determine user type based on current user
      // For now, assume USER - this could be enhanced based on actual user roles
      this.userType = 'USER';
    }
    
    this.loadConversations();
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
    // Cleanup if needed
  }

  loadConversations(): void {
    if (!this.userEmail) {
      console.warn('No user email available');
      this.isLoadingConversations = false;
      return;
    }
    
    this.isLoadingConversations = true;
    
    // Load GOVERNANCE conversations
    // If user is GOD (ROOT_AUTHORITY), load all GOVERNANCE conversations
    // Otherwise, load only conversations where user is a participant
    const filters: any = {
      scopeType: 'GOVERNANCE',
      state: 'OPEN'
    };
    
    // Only filter by participant if not GOD
    // For now, we'll load all GOVERNANCE conversations and filter client-side
    // This allows users to see their own conversations with GOD
    this.messagingService.getConversations(filters).subscribe({
      next: (response) => {
        if (response.success) {
          // Filter to only conversations with ROOT_AUTHORITY
          // and where user is a participant (or show all if user is GOD)
          this.conversations = response.conversations.filter(conv => {
            const hasRootAuthority = conv.participants.includes('ROOT_AUTHORITY');
            const isParticipant = conv.participants.includes(this.userEmail);
            // Show if it has ROOT_AUTHORITY and user is participant, or if user is GOD
            return hasRootAuthority && (isParticipant || this.userType === 'ROOT_AUTHORITY');
          });
          // Sort by updatedAt (newest first)
          this.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
          
          // Auto-select first conversation if available
          if (this.conversations.length > 0 && !this.selectedConversation) {
            this.selectConversation(this.conversations[0]);
          }
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

  loadMessages(conversationId: string): void {
    if (!this.userEmail) {
      console.warn('Cannot load messages: no user email');
      this.isLoadingMessages = false;
      return;
    }
    
    this.isLoadingMessages = true;
    this.messages = [];
    
    console.log(`[GOD Inbox] Loading messages for conversation: ${conversationId}, user: ${this.userEmail}, type: ${this.userType}`);
    
    this.messagingService.getConversationMessages(
      conversationId,
      this.userEmail,
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
    this.loadConversations();
    if (this.selectedConversation) {
      this.loadMessages(this.selectedConversation.conversationId);
    }
  }
}

