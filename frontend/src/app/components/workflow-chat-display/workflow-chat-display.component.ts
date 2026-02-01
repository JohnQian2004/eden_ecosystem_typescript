import { Component, OnInit, OnDestroy, ChangeDetectorRef, SecurityContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FlowWiseService, WorkflowExecution } from '../../services/flowwise.service';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';
import { getApiBaseUrl } from '../../services/api-base';
import { MessagingService, Conversation, Message } from '../../services/messaging.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

interface Video {
  id: string;
  filename: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'ledger';
  content: string;
  timestamp: number;
  data?: any; // For structured data like listings or ledger entry
  showOptions?: boolean;
  options?: Array<{ value: string; label: string; data: any }>;
  videoUrl?: string; // For movie video playback
  movieTitle?: string; // For movie title display
  videos?: Video[]; // For video listing (thumbnail players)
}

interface ChatThread {
  id: string;
  title: string;
  startedAt: number;
  executionId?: string | null;
  messages: ChatMessage[];
}

@Component({
  selector: 'app-workflow-chat-display',
  templateUrl: './workflow-chat-display.component.html',
  styleUrls: ['./workflow-chat-display.component.scss']
})
export class WorkflowChatDisplayComponent implements OnInit, OnDestroy {
  chatMessages: ChatMessage[] = [];
  // Keep prior chats instead of clearing (ChatGPT-style stack)
  archivedThreads: ChatThread[] = [];
  private currentThreadStartedAt: number = Date.now();
  private currentThreadExecutionId: string | null = null;
  private readonly MAX_THREADS = 10; // current + last 9 archived
  private readonly MAX_MESSAGES_PER_THREAD = 200;
  expandedArchivedThreadIds: Set<string> = new Set();

  activeExecution: WorkflowExecution | null = null;
  private activeExecutionId: string | null = null;
  isLoading: boolean = false;
  apiUrl: string = '';
  
  // Ledger data
  ledgerEntries: any[] = [];
  displayedLedgerEntryIds: Set<string> = new Set(); // Track which ledger entries we've already shown
  
  // Wallet balance
  walletBalance: number | undefined = undefined; // undefined = loading, number = loaded
  userEmail: string = '';
  isLoadingWallet: boolean = false;
  
  private wsSubscription: any;
  private decisionSubscription: any;
  private selectionSubscription: any;
  private executionCheckInterval: any;
  private emailCheckInterval: any;
  private onWorkflowStartedEvt: any;
  private onChatResetEvt: any;
  private isTabVisible: boolean = true;
  private visibilityChangeHandler: (() => void) | null = null;

  // Messaging system
  activeConversations: Map<string, Conversation> = new Map();
  conversationMessages: Map<string, Message[]> = new Map();
  
  // Chat input for regular messages
  chatInput: string = '';
  isSendingChat: boolean = false;

  constructor(
    private http: HttpClient,
    private flowWiseService: FlowWiseService,
    private webSocketService: WebSocketService,
    private messagingService: MessagingService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {
    this.apiUrl = getApiBaseUrl();
  }
  
  // Convert markdown to HTML
  renderMarkdown(text: string): SafeHtml {
    if (!text) return '';
    
    let html = text;
    
    // Code blocks first (before other processing)
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Process lists (bullet and numbered)
    const lines = html.split('\n');
    let inList = false;
    let listType = '';
    let processedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const bulletMatch = line.match(/^[\-\*] (.*)$/);
      const numberedMatch = line.match(/^(\d+)\. (.*)$/);
      
      if (bulletMatch || numberedMatch) {
        const itemText = bulletMatch ? bulletMatch[1] : numberedMatch![2];
        const currentListType = bulletMatch ? 'ul' : 'ol';
        
        if (!inList || listType !== currentListType) {
          if (inList) {
            processedLines.push(`</${listType}>`);
          }
          processedLines.push(`<${currentListType}>`);
          inList = true;
          listType = currentListType;
        }
        processedLines.push(`<li>${itemText}</li>`);
      } else {
        if (inList) {
          processedLines.push(`</${listType}>`);
          inList = false;
        }
        processedLines.push(line);
      }
    }
    if (inList) {
      processedLines.push(`</${listType}>`);
    }
    html = processedLines.join('\n');
    
    // Bold and italic (after lists to avoid conflicts)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    // Line breaks - convert double newlines to paragraph breaks
    html = html.split('\n\n').map(para => {
      para = para.trim();
      if (!para) return '';
      if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<ol') || para.startsWith('<pre')) {
        return para;
      }
      return `<p>${para}</p>`;
    }).join('\n');
    
    // Single newlines to br (but not inside pre/code)
    html = html.replace(/\n/g, '<br>');
    
    const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
    return this.sanitizer.bypassSecurityTrustHtml(sanitized);
  }

  ngOnInit() {
    console.log('💬 [WorkflowChat] Initializing chat display...');
    
    // Get user email from localStorage
    this.userEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
    
    // Listen for user email changes (when user signs in/out or switches)
    window.addEventListener('storage', (e) => {
      if (e.key === 'userEmail') {
        const newEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
        if (this.userEmail !== newEmail) {
          console.log(`🔄 [WorkflowChat] User email changed from ${this.userEmail} to ${newEmail}, clearing wallet balance`);
          this.walletBalance = 0;
          this.isLoadingWallet = true;
          this.userEmail = newEmail;
          this.cdr.detectChanges();
          // Reload balance for new user
          this.loadWalletBalance(false);
        }
      }
    });
    
    // Also check periodically for email changes (for same-window updates)
    // IMPORTANT: store interval id so we can clear it (otherwise it keeps running forever and makes UI feel "stuck").
    this.emailCheckInterval = setInterval(() => {
      const currentEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
      if (this.userEmail !== currentEmail) {
        console.log(`🔄 [WorkflowChat] User email changed from ${this.userEmail} to ${currentEmail}, clearing wallet balance`);
        this.walletBalance = 0;
        this.isLoadingWallet = true;
        this.userEmail = currentEmail;
        this.cdr.detectChanges();
        // Reload balance for new user
        this.loadWalletBalance(false);
      }
    }, 1500);
    
    // Check for active executions periodically (only when tab is visible)
    // Reduced interval from 1000ms to 200ms for faster response
    this.executionCheckInterval = setInterval(() => {
      // Skip processing if tab is not visible
      if (!this.isTabVisible) {
        return;
      }
      
      const latestExecution = this.flowWiseService.getLatestActiveExecution();
      if (latestExecution && latestExecution.executionId !== this.activeExecution?.executionId) {
        console.log('💬 [WorkflowChat] New active execution detected:', latestExecution.executionId);
        // Bind current (latest) thread to this execution.
        // NOTE: New thread creation happens on eden_chat_reset (on send).
        this.activeExecutionId = String(latestExecution.executionId);
        this.currentThreadExecutionId = this.activeExecutionId;
        this.activeExecution = latestExecution;
        this.processExecutionMessages(latestExecution);
      } else if (!latestExecution && this.activeExecution) {
        // Workflow completed - no more active execution
        console.log('💬 [WorkflowChat] Workflow completed (no active execution)');
        this.activeExecution = null;
        this.activeExecutionId = null;
        this.currentThreadExecutionId = null;
        // Show wallet balance after workflow completion
        setTimeout(() => {
          this.loadWalletBalance(true);
        }, 500); // Reduced from 1000ms to 500ms
      }
    }, 200); // Reduced from 1000ms to 200ms for faster polling

    // Initialize tab visibility handling
    this.initializeTabVisibilityHandling();

    // Listen for WebSocket events
    this.wsSubscription = this.webSocketService.events$.subscribe((event: SimulatorEvent) => {
      this.handleWebSocketEvent(event);
    });

    // Instant clear when a new chat/workflow starts (emitted by AppComponent onSubmit)
    this.onWorkflowStartedEvt = (e: any) => {
      const id = e?.detail?.executionId ? String(e.detail.executionId) : '';
      if (!id) return;
      this.activeExecutionId = id;
      this.currentThreadExecutionId = id;
    };
    window.addEventListener('eden_workflow_started', this.onWorkflowStartedEvt as any);

    // Clear immediately on "new chat" (before executionId exists)
    this.onChatResetEvt = () => {
      this.activeExecutionId = '__pending__';
      this.startNewChatThread();
    };
    window.addEventListener('eden_chat_reset', this.onChatResetEvt as any);

    // Listen for decision requests from FlowWiseService
    // Only process decisions when tab is visible (prevents conflicts with other tabs)
    this.decisionSubscription = this.flowWiseService.getDecisionRequests().subscribe((decisionRequest: any) => {
      if (!this.isTabVisible) {
        console.log('💬 [WorkflowChat] Tab is hidden, skipping decision request');
        return;
      }
      console.log('💬 [WorkflowChat] Decision required:', decisionRequest);
      this.addDecisionMessage(decisionRequest);
      // Trigger immediate change detection for faster UI update
      this.cdr.detectChanges();
    });

    // Listen for selection requests from FlowWiseService
    // Only process selections when tab is visible
    this.selectionSubscription = this.flowWiseService.getSelectionRequests().subscribe((selectionRequest: any) => {
      if (!this.isTabVisible) {
        console.log('💬 [WorkflowChat] Tab is hidden, skipping selection request');
        return;
      }
      console.log('💬 [WorkflowChat] Selection required:', selectionRequest);
      if (selectionRequest.options && selectionRequest.options.length > 0) {
        this.addSelectionMessage(selectionRequest.options, selectionRequest.serviceType || 'service');
        // Trigger immediate change detection for faster UI update
        this.cdr.detectChanges();
      }
    });

    // Load ledger entries
    this.loadLedgerEntries();
    
    // Load initial wallet balance (show in header, not chat)
    // Balance will be updated via WebSocket events (ledger_entry_added, cashier_payment_processed, etc.)
    this.loadWalletBalance(false);
  }

  /**
   * Initialize tab visibility detection
   * Pauses workflow processing when tab is hidden
   */
  private initializeTabVisibilityHandling() {
    if (typeof document === 'undefined') return;

    // Check initial visibility state
    this.isTabVisible = !document.hidden;

    // Set up visibility change handler
    this.visibilityChangeHandler = () => {
      const wasVisible = this.isTabVisible;
      this.isTabVisible = !document.hidden;

      console.log(`👁️ [WorkflowChat] Tab visibility changed: ${wasVisible ? 'visible' : 'hidden'} → ${this.isTabVisible ? 'visible' : 'hidden'}`);

      if (!this.isTabVisible && wasVisible) {
        // Tab became hidden - pause workflow processing
        console.log('⏸️ [WorkflowChat] Tab hidden - pausing workflow processing');
      } else if (this.isTabVisible && !wasVisible) {
        // Tab became visible - resume workflow processing
        console.log('▶️ [WorkflowChat] Tab visible - resuming workflow processing');
        // Check for any missed executions
        const latestExecution = this.flowWiseService.getLatestActiveExecution();
        if (latestExecution) {
          this.activeExecutionId = String(latestExecution.executionId);
          this.currentThreadExecutionId = this.activeExecutionId;
          this.activeExecution = latestExecution;
          this.processExecutionMessages(latestExecution);
        }
      }
    };

    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    console.log('👁️ [WorkflowChat] Tab visibility handling initialized');
  }

  /**
   * Check if this component is in the active tab
   * workflow-chat-display is visible when activeTab === 'workflow-chat'
   */
  private isComponentInActiveTab(): boolean {
    // Check if the workflow-chat tab pane is visible
    const workflowChatPane = document.getElementById('workflow-chat-pane');
    if (!workflowChatPane) {
      return false; // Tab pane doesn't exist
    }
    
    // Check if the tab pane has 'show active' classes (Bootstrap tab active state)
    const hasActiveClass = workflowChatPane.classList.contains('show') && workflowChatPane.classList.contains('active');
    
    // Also check if component is actually visible in DOM
    const isVisible = workflowChatPane.offsetParent !== null;
    
    console.log('🔍 [WorkflowChat] Component visibility check:', {
      hasActiveClass,
      isVisible,
      offsetParent: workflowChatPane.offsetParent !== null
    });
    
    return hasActiveClass && isVisible;
  }

  ngOnDestroy() {
    if (this.executionCheckInterval) {
      clearInterval(this.executionCheckInterval);
    }
    if (this.emailCheckInterval) {
      clearInterval(this.emailCheckInterval);
    }
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
    if (this.decisionSubscription) {
      this.decisionSubscription.unsubscribe();
    }
    if (this.selectionSubscription) {
      this.selectionSubscription.unsubscribe();
    }
    if (this.onWorkflowStartedEvt) {
      window.removeEventListener('eden_workflow_started', this.onWorkflowStartedEvt as any);
    }
    if (this.onChatResetEvt) {
      window.removeEventListener('eden_chat_reset', this.onChatResetEvt as any);
    }
    // Remove visibility change listener
    if (this.visibilityChangeHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
    // Remove storage event listener
    window.removeEventListener('storage', () => {});
    console.log('💬 [WorkflowChat] Component destroyed');
  }

  private processExecutionMessages(execution: WorkflowExecution) {
    // Extract user-facing messages from execution context
    const context = execution.context || {};
    
    // CRITICAL: Add user query FIRST with earliest timestamp (before any LLM responses)
    const userInput = context['input'];
    if (userInput) {
      const existingUserMessage = this.chatMessages.find(m => m.type === 'user' && m.content === userInput);
      if (!existingUserMessage) {
        // Get timestamp from history if available, or use a timestamp before current time
        const startTimestamp = execution.history && execution.history.length > 0 
          ? execution.history[0].timestamp 
          : Date.now() - 1000; // Use 1 second ago to ensure it's before LLM response
        
        // Insert user message at the beginning or ensure it's before any assistant messages
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          type: 'user',
          content: userInput,
          timestamp: startTimestamp
        };
        
        // Find the first assistant message index, or add at the end if none
        const firstAssistantIndex = this.chatMessages.findIndex(m => m.type === 'assistant');
        if (firstAssistantIndex >= 0) {
          // Insert before first assistant message
          this.chatMessages.splice(firstAssistantIndex, 0, userMessage);
        } else {
          // No assistant messages yet, add at the beginning
          this.chatMessages.unshift(userMessage);
        }
        this.cdr.detectChanges();
      }
    }

    // Add LLM response AFTER user input (filtered to show only user-facing content)
    const llmResponse = context['llmResponse'];
    if (llmResponse && llmResponse.message) {
      const existingLLMMessage = this.chatMessages.find(m => m.type === 'assistant' && m.content === llmResponse.message);
      if (!existingLLMMessage) {
        // Ensure LLM response comes after user input
        const userMessageIndex = this.chatMessages.findIndex(m => m.type === 'user' && m.content === userInput);
        const llmTimestamp = userMessageIndex >= 0 
          ? this.chatMessages[userMessageIndex].timestamp + 100 // 100ms after user input
          : Date.now();
        
        // Extract videoUrl and movieTitle from llmResponse or context
        // Also check listings array for videoUrl
        const listings = llmResponse.listings || context['listings'] || [];
        const firstListing = Array.isArray(listings) && listings.length > 0 ? listings[0] : null;
        
        // Check if this is a "list all videos" request by checking the message content
        const isListAllRequest = /\b(list|show|display)\s+(all\s+)?(video|movie|videos|movies)\b/i.test(llmResponse.message || userInput || '');
        
        const videoUrl = llmResponse.selectedListing?.videoUrl || 
                        llmResponse.selectedListing2?.videoUrl ||
                        context['selectedListing']?.['videoUrl'] ||
                        context['selectedListing2']?.['videoUrl'] ||
                        context['videoUrl'] ||
                        firstListing?.videoUrl ||
                        undefined;
        const movieTitle = llmResponse.selectedListing?.movieTitle || 
                          llmResponse.selectedListing2?.movieTitle ||
                          context['selectedListing']?.['movieTitle'] ||
                          context['selectedListing2']?.['movieTitle'] ||
                          context['movieTitle'] ||
                          firstListing?.movieTitle ||
                          undefined;
        
        console.log('🎬 [WorkflowChat] Extracted video info from processExecutionMessages:', {
          videoUrl: videoUrl,
          movieTitle: movieTitle,
          hasListings: listings.length > 0,
          firstListingVideoUrl: firstListing?.videoUrl,
          selectedListingVideoUrl: llmResponse.selectedListing?.videoUrl,
          isListAllRequest: isListAllRequest
        });
        
        // For "list all videos" requests, convert listings to videos array for thumbnail display
        let videos: Video[] | undefined = undefined;
        if (listings.length > 0 && isListAllRequest) {
          videos = listings.map((listing: any) => ({
            id: listing.id || listing.movieId || `video-${Date.now()}-${Math.random()}`,
            title: listing.movieTitle || listing.title || 'Untitled Video',
            videoUrl: listing.videoUrl || listing.movieUrl || `/api/movie/video/${listing.filename || ''}`,
            thumbnailUrl: listing.thumbnailUrl || listing.videoUrl || listing.movieUrl || ''
          }));
          console.log(`📋 [WorkflowChat] Converted ${listings.length} listings to videos array for thumbnail display`);
        }
        
        const llmMessage: ChatMessage = {
          id: `llm-${Date.now()}`,
          type: 'assistant',
          content: llmResponse.message,
          timestamp: llmTimestamp,
          data: listings.length > 0 ? { listings: listings } : undefined,
          videoUrl: videoUrl,
          movieTitle: movieTitle,
          videos: videos // Add videos array for thumbnail display
        };
        
        // Insert after user message if it exists, otherwise add at end
        if (userMessageIndex >= 0) {
          this.chatMessages.splice(userMessageIndex + 1, 0, llmMessage);
        } else {
          this.chatMessages.push(llmMessage);
        }
        this.cdr.detectChanges();
      }
    }

    // Add selection prompt if available (only if we have listings and haven't shown them yet)
    const listings = context['listings'];
    if (listings && listings.length > 0) {
      const hasSelectionMessage = this.chatMessages.some(m => m.showOptions && m.options && m.options.length > 0);
      if (!hasSelectionMessage) {
        this.addSelectionMessage(listings, execution.serviceType);
      }
    }
  }

  private handleWebSocketEvent(event: SimulatorEvent) {
    // Skip processing WebSocket events if tab is not visible
    if (!this.isTabVisible) {
      return;
    }
    
    // If the backend provides executionId, scope "chat console" to the latest execution.
    // BUT: Don't reset chat for messaging-only conversations (no workflow execution)
    if (event.type === 'workflow_started' && (event as any).data?.executionId) {
      const newId = String((event as any).data.executionId);
      if (newId && newId !== this.activeExecutionId) {
        console.log('💬 [WorkflowChat] New workflow started, executionId:', newId);
        // Only reset if we have an existing execution (don't reset for first workflow)
        // OR if the current thread has workflow messages (not just messaging)
        const hasWorkflowMessages = this.chatMessages.some(m => 
          m.data?.executionId || m.data?.workflowId || m.type === 'ledger'
        );
        if (this.activeExecutionId && hasWorkflowMessages) {
          // Archive current workflow thread before starting new one
          this.activeExecutionId = newId;
          this.currentThreadExecutionId = newId;
          this.resetChat();
        } else {
          // First workflow or messaging-only thread - just update executionId without resetting
          this.activeExecutionId = newId;
          this.currentThreadExecutionId = newId;
        }
      }
      // Let the event fall through (we don't render workflow_started itself)
    }

    const evExecId = (event as any).data?.executionId || (event as any).data?.workflowId;
    const isChatScopedEvent =
      event.type === 'user_decision_required' ||
      event.type === 'user_selection_required' ||
      event.type === 'eden_chat_input' ||
      event.type === 'llm_query_extraction_start' ||
      event.type === 'llm_query_extraction_complete' ||
      event.type === 'igas' ||
      event.type === 'ledger_entry_added' ||
      event.type === 'ledger_booking_completed';
    
    // LLM responses should ALWAYS be shown (not filtered by executionId)
    // This includes regular chat responses and informational queries
    const isLLMResponseEvent = event.type === 'llm_response';
    
    // Messaging system events should ALWAYS be processed (not scoped to executionId)
    const isMessagingEvent =
      event.type === 'conversation_created' ||
      event.type === 'message_sent' ||
      event.type === 'message_forgiven' ||
      event.type === 'conversation_state_changed' ||
      event.type === 'conversation_escalated';

    // IMPORTANT: Always process workflow events - they run on backend regardless of tab visibility
    // Only filter by executionId to avoid mixing events from different workflows
    // BUT: LLM responses and messaging events are NOT scoped to executionId - they should always be shown
    if (isChatScopedEvent && this.activeExecutionId) {
      // During pending reset, ignore everything until we know the new execution id.
      if (this.activeExecutionId === '__pending__') {
        console.log('💬 [WorkflowChat] Ignoring event during pending reset');
        return;
      }
      // If we have an activeExecutionId, only process events for that execution
      // But if event has no executionId, still process it (might be for current execution)
      if (evExecId && String(evExecId) !== this.activeExecutionId) {
        console.log('💬 [WorkflowChat] Ignoring event from different execution:', evExecId, 'vs', this.activeExecutionId);
        return;
      }
    }
    
    // LLM responses and messaging events are always processed (not filtered by executionId)
    // They represent general conversations and informational queries, not just workflow-specific events

    // Filter events to only show user-facing ones (hide technical details)
    switch (event.type) {
      case 'llm_response':
        // Add LLM response as assistant message (filtered to show only user-facing content)
        // BUT ensure it comes AFTER user input
        // CRITICAL: LLM responses should ALWAYS be shown (not filtered by executionId)
        // This includes regular chat responses and informational queries
        console.log('💬 [WorkflowChat] ========================================');
        console.log('💬 [WorkflowChat] Received llm_response event');
        console.log('💬 [WorkflowChat] Event data:', event.data);
        console.log('💬 [WorkflowChat] Has message:', !!(event.data?.response?.message || event.data?.message));
        console.log('💬 [WorkflowChat] ========================================');
        
        // CRITICAL: For view_movie step, the workflow sends both llm_response and user_decision_required.
        // We should only show the user_decision_required (which includes the video player and decision prompt).
        // Skip llm_response if it's for view_movie step to avoid duplicates.
        if (event.data?.response?.message || event.data?.message) {
          const llmMessage = event.data?.response?.message || event.data?.message;
          
          console.log('💬 [WorkflowChat] Processing LLM response:', {
            message: llmMessage.substring(0, 100),
            hasExecutionId: !!evExecId,
            activeExecutionId: this.activeExecutionId,
            stepId: event.data?.stepId || event.data?.response?.stepId
          });
          
          // Check if this is for view_movie step - if so, skip it and let user_decision_required handle it
          const stepId = event.data?.stepId || event.data?.response?.stepId;
          if (stepId === 'view_movie') {
            console.log('🎬 [WorkflowChat] Skipping llm_response for view_movie step - workflow will send user_decision_required with video player');
            break; // Let the workflow drive it via user_decision_required event
          }
          
          // Extract videoUrl and movieTitle from event data
          // Check multiple sources: direct videoUrl, selectedListing, and listings array
          const listings = event.data?.response?.listings || event.data?.listings || [];
          const firstListing = Array.isArray(listings) && listings.length > 0 ? listings[0] : null;
          
          // Check if this is a "list all videos" request
          const messageContent = event.data?.response?.message || event.data?.message || '';
          const isListAllRequest = /\b(list|show|display)\s+(all\s+)?(video|movie|videos|movies)\b/i.test(messageContent);
          
          const videoUrl = event.data?.response?.videoUrl || 
                          event.data?.videoUrl || 
                          event.data?.response?.selectedListing?.videoUrl ||
                          event.data?.selectedListing?.videoUrl ||
                          firstListing?.videoUrl ||
                          undefined;
          const movieTitle = event.data?.response?.movieTitle || 
                            event.data?.movieTitle || 
                            event.data?.response?.selectedListing?.movieTitle ||
                            event.data?.selectedListing?.movieTitle ||
                            firstListing?.movieTitle ||
                            undefined;
          
          // For "list all videos" requests, convert listings to videos array for thumbnail display
          let videos: Video[] | undefined = undefined;
          if (listings.length > 0 && isListAllRequest) {
            videos = listings.map((listing: any) => ({
              id: listing.id || listing.movieId || `video-${Date.now()}-${Math.random()}`,
              title: listing.movieTitle || listing.title || 'Untitled Video',
              videoUrl: listing.videoUrl || listing.movieUrl || `/api/movie/video/${listing.filename || ''}`,
              thumbnailUrl: listing.thumbnailUrl || listing.videoUrl || listing.movieUrl || ''
            }));
            console.log(`📋 [WorkflowChat] Converted ${listings.length} listings to videos array for thumbnail display`);
          }
          
          console.log('🎬 [WorkflowChat] Extracted video info from llm_response:', {
            videoUrl: videoUrl,
            movieTitle: movieTitle,
            hasListings: listings.length > 0,
            firstListingVideoUrl: firstListing?.videoUrl,
            isListAllRequest: isListAllRequest,
            videosCount: videos?.length || 0
          });
          
          // CRITICAL: If videoUrl exists, check for duplicate video player
          // If a message with the same videoUrl already exists, update it instead of creating a duplicate
          if (videoUrl) {
            const existingVideoMessage = this.chatMessages.find(m => 
              m.videoUrl === videoUrl && m.type === 'assistant'
            );
            if (existingVideoMessage) {
              console.log('🎬 [WorkflowChat] Found existing message with same videoUrl, updating instead of creating duplicate');
              // Update existing message with new content and movieTitle if provided
              existingVideoMessage.content = llmMessage;
              if (movieTitle && !existingVideoMessage.movieTitle) {
                existingVideoMessage.movieTitle = movieTitle;
              }
              this.cdr.detectChanges();
              break; // Don't create a new message
            }
          }
          
          // Only add if not already present (by content)
          if (!this.chatMessages.find(m => m.type === 'assistant' && m.content === llmMessage)) {
            // Find the last user message to ensure LLM response comes after it
            const lastUserMessage = [...this.chatMessages].reverse().find(m => m.type === 'user');
            const llmTimestamp = lastUserMessage 
              ? lastUserMessage.timestamp + 100 // 100ms after last user message
              : event.timestamp;
            
            const llmChatMessage: ChatMessage = {
              id: `llm-${Date.now()}`,
              type: 'assistant',
              content: llmMessage,
              timestamp: llmTimestamp,
              data: listings.length > 0 ? { listings: listings } : undefined,
              videoUrl: videoUrl,
              movieTitle: movieTitle,
              videos: videos // Add videos array for thumbnail display when listing all videos
            };
            
            // Insert after last user message if it exists
            if (lastUserMessage) {
              const lastUserIndex = this.chatMessages.findIndex(m => m.id === lastUserMessage.id);
              if (lastUserIndex >= 0) {
                // Find the position after the last user message but before any other assistant messages
                let insertIndex = lastUserIndex + 1;
                while (insertIndex < this.chatMessages.length && 
                       this.chatMessages[insertIndex].type === 'assistant' &&
                       this.chatMessages[insertIndex].timestamp < llmTimestamp) {
                  insertIndex++;
                }
                this.chatMessages.splice(insertIndex, 0, llmChatMessage);
              } else {
                this.chatMessages.push(llmChatMessage);
              }
            } else {
              // No user message yet, add at end (will be reordered when user message arrives)
              this.chatMessages.push(llmChatMessage);
            }
            // Sort messages by timestamp to ensure correct order
            this.chatMessages.sort((a, b) => a.timestamp - b.timestamp);
            console.log('💬 [WorkflowChat] Added LLM response to chat messages. Total messages:', this.chatMessages.length);
            this.cdr.detectChanges();
          } else {
            console.log('💬 [WorkflowChat] LLM response already exists in chat messages, skipping duplicate');
          }
        } else {
          console.warn('💬 [WorkflowChat] llm_response event has no message content:', event.data);
        }
        break;

      case 'movie_started':
      case 'movie_finished':
        // Handle movie events - these contain videoUrl that should be displayed
        console.log('🎬 [WorkflowChat] ========================================');
        console.log('🎬 [WorkflowChat] Received movie event:', event.type);
        console.log('🎬 [WorkflowChat] Event data:', event.data);
        console.log('🎬 [WorkflowChat] videoUrl:', event.data?.videoUrl);
        console.log('🎬 [WorkflowChat] movieTitle:', event.data?.movieTitle);
        console.log('🎬 [WorkflowChat] ========================================');
        
        // Extract videoUrl and movieTitle from event data
        const movieVideoUrl = event.data?.videoUrl || 
                             event.data?.selectedListing?.videoUrl ||
                             undefined;
        const movieTitleFromEvent = event.data?.movieTitle || 
                                   event.data?.selectedListing?.movieTitle ||
                                   undefined;
        
        if (movieVideoUrl) {
          // Check if a message with this videoUrl already exists
          const existingVideoMessage = this.chatMessages.find(m => 
            m.videoUrl === movieVideoUrl && m.type === 'assistant'
          );
          
          if (existingVideoMessage) {
            // Update existing message with movie title if not set
            if (movieTitleFromEvent && !existingVideoMessage.movieTitle) {
              existingVideoMessage.movieTitle = movieTitleFromEvent;
            }
            // Update message content if it's a movie_finished event
            if (event.type === 'movie_finished' && event.data?.message) {
              existingVideoMessage.content = event.data.message;
            }
            console.log('🎬 [WorkflowChat] Updated existing video message');
            this.cdr.detectChanges();
          } else {
            // Create new message with video player
            const movieMessage: ChatMessage = {
              id: `movie-${Date.now()}`,
              type: 'assistant',
              content: event.data?.message || (event.type === 'movie_started' 
                ? `🎬 Now playing: ${movieTitleFromEvent || 'Movie'}` 
                : `✅ Movie completed: ${movieTitleFromEvent || 'Movie'}. Video is ready to play.`),
              timestamp: event.timestamp || Date.now(),
              videoUrl: movieVideoUrl,
              movieTitle: movieTitleFromEvent
            };
            
            // Insert after last user message if it exists
            const lastUserMessage = [...this.chatMessages].reverse().find(m => m.type === 'user');
            if (lastUserMessage) {
              const lastUserIndex = this.chatMessages.findIndex(m => m.id === lastUserMessage.id);
              if (lastUserIndex >= 0) {
                this.chatMessages.splice(lastUserIndex + 1, 0, movieMessage);
              } else {
                this.chatMessages.push(movieMessage);
              }
            } else {
              this.chatMessages.push(movieMessage);
            }
            
            // Sort messages by timestamp
            this.chatMessages.sort((a, b) => a.timestamp - b.timestamp);
            console.log('🎬 [WorkflowChat] Added movie message with video player');
            this.cdr.detectChanges();
          }
        } else {
          console.warn('🎬 [WorkflowChat] Movie event received but no videoUrl found');
        }
        break;

      case 'user_selection_required':
        if (event.data?.options && event.data.options.length > 0) {
          this.addSelectionMessage(event.data.options, event.data.serviceType || 'service');
        }
        break;

      case 'user_decision_required':
        // CRITICAL: Only handle decisions if this component is in the active tab
        // This prevents decisions from appearing in the wrong tab
        const isChatComponentVisible = this.isComponentInActiveTab();
        
        if (!isChatComponentVisible) {
          console.log('💬 [WorkflowChat] user_decision_required event received but component is not in active tab - ignoring');
          console.log('💬 [WorkflowChat] This decision will be handled by workflow-display instead');
          return; // Don't handle decision if component is not visible
        }
        
        // Handle decision requests from WebSocket
        if (event.data) {
          console.log('💬 [WorkflowChat] ========================================');
          console.log('💬 [WorkflowChat] Received user_decision_required event');
          console.log('💬 [WorkflowChat] Event data:', JSON.stringify(event.data, null, 2));
          console.log('💬 [WorkflowChat] stepId:', event.data.stepId);
          console.log('💬 [WorkflowChat] prompt:', event.data.prompt);
          console.log('💬 [WorkflowChat] options:', event.data.options);
          console.log('💬 [WorkflowChat] executionId:', event.data.executionId || event.data.workflowId);
          console.log('💬 [WorkflowChat] videoUrl (direct):', event.data?.videoUrl);
          console.log('💬 [WorkflowChat] movieTitle (direct):', event.data?.movieTitle);
          console.log('💬 [WorkflowChat] selectedListing?.videoUrl:', event.data?.selectedListing?.videoUrl);
          console.log('💬 [WorkflowChat] selectedListing?.movieTitle:', event.data?.selectedListing?.movieTitle);
          console.log('💬 [WorkflowChat] ========================================');
          
          // CRITICAL: Extract videoUrl and movieTitle from multiple sources
          // For view_movie step, videoUrl should be in event.data.videoUrl
          // But also check selectedListing and other sources as fallback
          let videoUrl = event.data?.videoUrl;
          let movieTitle = event.data?.movieTitle;
          
          // If videoUrl is missing but stepId is view_movie, try to get from selectedListing
          if (!videoUrl && event.data.stepId === 'view_movie') {
            videoUrl = event.data?.selectedListing?.videoUrl;
            movieTitle = event.data?.selectedListing?.movieTitle;
            console.log('🎬 [WorkflowChat] view_movie step - extracted from selectedListing:', { videoUrl, movieTitle });
          }
          
          const decisionRequest = {
            prompt: event.data.prompt || 'Please make a decision:',
            options: event.data.options || [],
            executionId: event.data.executionId || event.data.workflowId,
            stepId: event.data.stepId,
            timeout: event.data.timeout || 30000,
            data: event.data,
            iGasCost: event.data.iGasCost || event.data.igas,
            videoUrl: videoUrl,
            movieTitle: movieTitle
          };
          
          console.log('💬 [WorkflowChat] Final decisionRequest:', JSON.stringify(decisionRequest, null, 2));
          console.log('💬 [WorkflowChat] Calling addDecisionMessage with videoUrl:', decisionRequest.videoUrl);
          this.addDecisionMessage(decisionRequest);
        }
        break;

      case 'igas':
        // Handle iGas cost events - store for potential use in decision prompts
        if (event.data?.igas !== undefined) {
          console.log('💬 [WorkflowChat] Received iGas cost event:', event.data.igas);
          // Store iGas cost in component state for use in next decision
          (this as any).lastIGasCost = event.data.igas;
        }
        break;

      case 'ledger_entry_added':
        // Add ledger entry as a chat message
        if (event.data?.entry) {
          console.log('💬 [WorkflowChat] Received ledger_entry_added event:', {
            entryId: event.data.entry.entryId,
            iGasCost: event.data.entry.iGasCost,
            hasIGasCost: event.data.entry.iGasCost !== undefined
          });
          this.addLedgerEntryAsMessage(event.data.entry);
        } else {
          // Reload and show latest entry
          this.loadLedgerEntries();
        }
        // Reload wallet balance after ledger entry is added (update header)
        setTimeout(() => {
          this.loadWalletBalance(false);
        }, 500);
        break;

      case 'ledger_booking_completed':
        // Booking completed - update existing ledger entry message and wallet balance
        if (event.data?.entry) {
          const completedEntry = event.data.entry;
          // Find and update the existing ledger message in chat
          const ledgerMessageIndex = this.chatMessages.findIndex(
            msg => msg.type === 'ledger' && msg.data?.entry?.entryId === completedEntry.entryId
          );
          
          if (ledgerMessageIndex !== -1) {
            // Update the existing message
            const details = this.formatBookingDetails(completedEntry);
            
            // Extract fields from completed entry (handle nested structures)
            // For DEX trades, ALWAYS prioritize bookingDetails.baseAmount (the actual SOL amount traded)
            const isDexTradeCompleted = completedEntry.serviceType === 'dex' 
              || completedEntry.entry?.serviceType === 'dex' 
              || completedEntry.bookingDetails?.action
              || completedEntry.bookingDetails?.tokenSymbol
              || this.chatMessages[ledgerMessageIndex].data?.serviceType === 'dex';
            
            // Get bookingDetails from multiple possible locations
            const completedBookingDetails = completedEntry.bookingDetails 
              || completedEntry.entry?.bookingDetails 
              || completedEntry.data?.bookingDetails
              || this.chatMessages[ledgerMessageIndex].data?.entry?.bookingDetails;
            
            let amount = 0;
            if (isDexTradeCompleted && completedBookingDetails) {
              // For DEX: prioritize baseAmount from bookingDetails (this is the SOL amount)
              // Check if baseAmount exists and is a valid number (even if it's a small decimal)
              const baseAmount = completedBookingDetails.baseAmount;
              const totalAmount = completedBookingDetails.totalAmount;
              const bookingAmount = completedBookingDetails.amount;
              
              if (baseAmount !== undefined && baseAmount !== null && !isNaN(Number(baseAmount)) && Number(baseAmount) > 0) {
                amount = Number(baseAmount);
              } else if (totalAmount !== undefined && totalAmount !== null && !isNaN(Number(totalAmount)) && Number(totalAmount) > 0) {
                amount = Number(totalAmount);
              } else if (bookingAmount !== undefined && bookingAmount !== null && !isNaN(Number(bookingAmount)) && Number(bookingAmount) > 0) {
                amount = Number(bookingAmount);
              }
            }
            
            // If not DEX or bookingDetails didn't have amount, check standard fields
            if (amount === 0 || amount === null || amount === undefined) {
              amount = completedEntry.amount !== undefined && completedEntry.amount !== null && completedEntry.amount > 0
                ? completedEntry.amount
                : (completedEntry.entry?.amount !== undefined && completedEntry.entry?.amount !== null && completedEntry.entry.amount > 0
                    ? completedEntry.entry.amount
                    : (completedEntry.snapshot?.amount !== undefined && completedEntry.snapshot?.amount !== null && completedEntry.snapshot.amount > 0
                        ? completedEntry.snapshot.amount
                        : (this.chatMessages[ledgerMessageIndex].data?.amount || 0)));
            }
            
            // Final fallback: try bookingDetails for non-DEX or if still 0
            if ((amount === 0 || amount === null || amount === undefined) && completedEntry.bookingDetails) {
              amount = completedEntry.bookingDetails.totalAmount 
                || completedEntry.bookingDetails.baseAmount
                || completedEntry.bookingDetails.price
                || completedEntry.bookingDetails.amount
                || 0;
            }
            
            // Extract merchant - try multiple sources including bookingDetails
            // Preserve existing merchant if new one is generic
            const newMerchant = completedEntry.merchant 
              || completedEntry.entry?.merchant 
              || completedEntry.snapshot?.merchant 
              || completedEntry.bookingDetails?.merchantName
              || completedEntry.bookingDetails?.providerName;
            
            // If new merchant is generic like "Service Provider", keep the existing one
            const existingMerchant = this.chatMessages[ledgerMessageIndex].data?.merchant;
            const merchant = (newMerchant && newMerchant !== 'Service Provider' && newMerchant !== 'N/A')
              ? newMerchant
              : (existingMerchant && existingMerchant !== 'N/A' && existingMerchant !== 'Service Provider')
                  ? existingMerchant
                  : (newMerchant || existingMerchant || 'N/A');
            
            // Extract serviceType
            const serviceType = completedEntry.serviceType 
              || completedEntry.entry?.serviceType 
              || completedEntry.snapshot?.serviceType 
              || completedEntry.bookingDetails?.serviceType
              || this.chatMessages[ledgerMessageIndex].data?.serviceType 
              || 'N/A';
            const status = completedEntry.status || completedEntry.entry?.status || 'completed';
            
            // HARDCODED: Always show restaurant entries as completed
            const displayStatus = serviceType === 'restaurant' ? 'completed' : status;
            const statusEmoji = '✅'; // completed status
            const iGasCost = completedEntry.iGasCost !== undefined && completedEntry.iGasCost !== null 
              ? completedEntry.iGasCost 
              : (completedEntry.entry?.iGasCost !== undefined && completedEntry.entry?.iGasCost !== null
                  ? completedEntry.entry.iGasCost
                  : (this.chatMessages[ledgerMessageIndex].data?.iGasCost || 0));
            
            this.chatMessages[ledgerMessageIndex] = {
              ...this.chatMessages[ledgerMessageIndex],
              content: `${statusEmoji} **Transaction ${displayStatus}**`,
              data: {
                ...this.chatMessages[ledgerMessageIndex].data,
                entry: { ...completedEntry, status: displayStatus },
                details: details,
                amount: amount,
                merchant: merchant,
                serviceType: serviceType,
                iGasCost: iGasCost
              }
            };
            console.log('💬 [WorkflowChat] Updated ledger entry message to completed:', completedEntry.entryId);
            this.cdr.detectChanges();
          } else {
            // If message not found, add it as a new message
            console.log('💬 [WorkflowChat] Ledger entry message not found, adding as new message:', completedEntry.entryId);
            this.addLedgerEntryAsMessage(completedEntry);
          }
          
          // Update wallet balance in header
          setTimeout(() => {
            this.loadWalletBalance(false);
          }, 500);
        }
        break;

      case 'cashier_payment_processed':
        // Payment processed - show confirmation with iGas cost
        if (event.data?.entry) {
          const iGasCost = event.data.entry.iGasCost || event.data.iGasCost || 0.00445;
          const formattedIGasCost = typeof iGasCost === 'number' 
            ? iGasCost.toFixed(6) 
            : parseFloat(iGasCost || '0.00445').toFixed(6);
          
          this.addChatMessage({
            type: 'system',
            content: `✅ Your choice has been confirmed and processed that costs ${formattedIGasCost} iGas`,
            timestamp: event.timestamp || Date.now()
          });
        }
        // Reload wallet balance after payment is processed (update header)
        setTimeout(() => {
          this.loadWalletBalance(false);
        }, 500);
        break;

      case 'workflow_completed':
      case 'workflow_step_changed':
        // Only show completion if it's actually completed
        if (event.type === 'workflow_completed') {
          this.addChatMessage({
            type: 'system',
            content: '✅ Your request has been completed successfully!',
            timestamp: event.timestamp
          });
          // Load and display any pending ledger entries
          this.loadLedgerEntries();
          // Load and display wallet balance after completion (with delay to ensure ledger is processed)
          setTimeout(() => {
            this.loadWalletBalance(true); // Pass true to show in chat
          }, 1000);
        } else if (event.type === 'workflow_step_changed') {
          // CRITICAL: When workflow transitions to view_movie step, the workflow will send
          // user_decision_required event with videoUrl. We should wait for that event
          // rather than creating our own message here. This ensures the chat is driven by the workflow.
          const stepId = event.data?.stepId;
          if (stepId === 'view_movie') {
            console.log('🎬 [WorkflowChat] Workflow transitioned to view_movie step - waiting for user_decision_required event from workflow');
            // The workflow will send user_decision_required event with videoUrl, which will be handled below
            // We don't create a message here - let the workflow drive it
          }
        }
        break;

      // Messaging System Events
      case 'conversation_created':
        if (event.data?.conversation) {
          const conv: Conversation = event.data.conversation;
          this.activeConversations.set(conv.conversationId, conv);
          this.addChatMessage({
            type: 'system',
            content: `💬 Conversation created: ${conv.scope.type} - ${conv.scope.referenceId}`,
            timestamp: event.timestamp || Date.now(),
            data: { conversation: conv }
          });
        }
        break;

      case 'message_sent':
        if (event.data?.message) {
          const msg: Message = event.data.message;
          const conversationId = msg.conversationId;
          
          // Add message to conversation messages map
          if (!this.conversationMessages.has(conversationId)) {
            this.conversationMessages.set(conversationId, []);
          }
          this.conversationMessages.get(conversationId)!.push(msg);
          
          // Display message in chat
          const messageType = msg.senderType === 'USER' ? 'user' : 'assistant';
          const messageContent = msg.payload.text || 
                                (msg.payload.systemEvent ? `[System: ${msg.payload.systemEvent.eventType}]` : '[Message]');
          
          console.log('💬 [WorkflowChat] Adding messaging system message to chat:', {
            messageType,
            messageContent: messageContent.substring(0, 50),
            conversationId,
            chatMessagesLength: this.chatMessages.length,
            activeExecutionId: this.activeExecutionId
          });
          this.addChatMessage({
            type: messageType,
            content: messageContent,
            timestamp: msg.timestamp || event.timestamp || Date.now(),
            data: { message: msg, conversationId }
          });
          // Force change detection to ensure message appears in canvas
          console.log('💬 [WorkflowChat] After adding message, chatMessages.length:', this.chatMessages.length);
          this.cdr.detectChanges();
        }
        break;

      case 'message_forgiven':
        if (event.data?.message) {
          const msg: Message = event.data.message;
          this.addChatMessage({
            type: 'system',
            content: `🔓 Message forgiven: ${msg.messageId.substring(0, 8)}...`,
            timestamp: event.timestamp || Date.now(),
            data: { message: msg }
          });
          this.cdr.detectChanges();
        }
        break;

      case 'conversation_state_changed':
        if (event.data?.conversation) {
          const conv: Conversation = event.data.conversation;
          this.activeConversations.set(conv.conversationId, conv);
          const stateEmoji = conv.state === 'FROZEN' ? '❄️' : conv.state === 'CLOSED' ? '🔒' : '💬';
          this.addChatMessage({
            type: 'system',
            content: `${stateEmoji} Conversation ${conv.conversationId.substring(0, 8)}... state changed to ${conv.state}`,
            timestamp: event.timestamp || Date.now(),
            data: { conversation: conv }
          });
          this.cdr.detectChanges();
        }
        break;

      case 'conversation_escalated':
        if (event.data?.conversation) {
          const conv: Conversation = event.data.conversation;
          this.activeConversations.set(conv.conversationId, conv);
          this.addChatMessage({
            type: 'system',
            content: `📢 Conversation escalated: ${conv.conversationId.substring(0, 8)}...`,
            timestamp: event.timestamp || Date.now(),
            data: { conversation: conv }
          });
          this.cdr.detectChanges();
        }
        break;

      // Ignore technical events like:
      // - workflow_step_changed (too technical)
      // - llm_query (internal)
      // - service_provider_created (system event)
      // - certificate_validated (system event)
      default:
        // Silently ignore other events
        break;
    }
  }

  private isDuplicateMessage(content: string): boolean {
    // Only check for duplicates in assistant messages, never filter user messages
    return this.chatMessages.some(m => m.content === content && m.type === 'assistant');
  }

  private addChatMessage(message: Partial<ChatMessage>) {
    const chatMessage: ChatMessage = {
      id: message.id || `msg-${Date.now()}-${Math.random()}`,
      type: message.type || 'assistant',
      content: message.content || '',
      timestamp: message.timestamp || Date.now(),
      data: message.data,
      showOptions: message.showOptions || false,
      options: message.options,
      videoUrl: message.videoUrl,
      movieTitle: message.movieTitle
    };
    
    // Prevent duplicate user confirmations
    if (chatMessage.type === 'user') {
      const isDuplicate = this.chatMessages.some(m => 
        m.type === 'user' && 
        m.content === chatMessage.content &&
        Math.abs(m.timestamp - chatMessage.timestamp) < 1000 // Within 1 second
      );
      if (isDuplicate) {
        console.log('💬 [WorkflowChat] Skipping duplicate user confirmation:', chatMessage.content);
        return;
      }
    }
    
    // For user messages, ensure they come before assistant messages
    if (chatMessage.type === 'user') {
      // Find first assistant message and insert before it
      const firstAssistantIndex = this.chatMessages.findIndex(m => m.type === 'assistant');
      if (firstAssistantIndex >= 0) {
        this.chatMessages.splice(firstAssistantIndex, 0, chatMessage);
      } else {
        // No assistant messages, add at end
        this.chatMessages.push(chatMessage);
      }
    } else {
      // For non-user messages, add at end
      this.chatMessages.push(chatMessage);
    }
    
    // Keep current thread bounded (prevents UI slowdown over long sessions)
    if (this.chatMessages.length > this.MAX_MESSAGES_PER_THREAD) {
      this.chatMessages = this.chatMessages.slice(-this.MAX_MESSAGES_PER_THREAD);
    }

    // Sort messages by timestamp to ensure correct chronological order
    this.chatMessages.sort((a, b) => a.timestamp - b.timestamp);
    
    this.cdr.detectChanges();
    
    // Auto-scroll to bottom immediately
    setTimeout(() => {
      const chatContainer = document.querySelector('.chat-messages-container');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 50); // Reduced timeout for faster scroll
  }

  private addDecisionMessage(decisionRequest: any) {
    console.log('💬 [WorkflowChat] ========================================');
    console.log('💬 [WorkflowChat] addDecisionMessage called with:', {
      stepId: decisionRequest.stepId,
      prompt: decisionRequest.prompt,
      optionsCount: decisionRequest.options?.length || 0,
      executionId: decisionRequest.executionId,
      videoUrl: decisionRequest.videoUrl,
      movieTitle: decisionRequest.movieTitle
    });
    console.log('💬 [WorkflowChat] Full decisionRequest:', JSON.stringify(decisionRequest, null, 2));
    
    // CRITICAL: If videoUrl exists, check for duplicate video player first
    // If a message with the same videoUrl already exists, update it instead of creating a duplicate
    if (decisionRequest.videoUrl) {
      const existingVideoMessage = this.chatMessages.find(m => 
        m.videoUrl === decisionRequest.videoUrl && m.type === 'assistant'
      );
      if (existingVideoMessage) {
        console.log('🎬 [WorkflowChat] Found existing message with same videoUrl, updating instead of creating duplicate');
        // Update existing message with decision prompt and options
        existingVideoMessage.content = decisionRequest.prompt || existingVideoMessage.content;
        existingVideoMessage.showOptions = true;
        existingVideoMessage.options = (decisionRequest.options || []).map((opt: any) => ({
          value: opt.value,
          label: opt.label,
          data: opt
        }));
        if (decisionRequest.movieTitle && !existingVideoMessage.movieTitle) {
          existingVideoMessage.movieTitle = decisionRequest.movieTitle;
        }
        // Update data for decision
        existingVideoMessage.data = {
          ...existingVideoMessage.data,
          executionId: decisionRequest.executionId,
          stepId: decisionRequest.stepId,
          isDecision: true,
          iGasCost: decisionRequest.data?.iGasCost || decisionRequest.data?.igas || decisionRequest.iGasCost
        };
        this.cdr.detectChanges();
        return;
      }
    }
    
    // Find if there's already a decision message (by showOptions)
    const existingDecision = this.chatMessages.find(m => m.showOptions && m.type === 'assistant');
    if (existingDecision && decisionRequest.options) {
      existingDecision.options = decisionRequest.options.map((opt: any) => ({
        value: opt.value,
        label: opt.label,
        data: opt
      }));
      existingDecision.content = decisionRequest.prompt || existingDecision.content;
      existingDecision.showOptions = true;
      // Update video info if provided
      if (decisionRequest.videoUrl) {
        existingDecision.videoUrl = decisionRequest.videoUrl;
      }
      if (decisionRequest.movieTitle) {
        existingDecision.movieTitle = decisionRequest.movieTitle;
      }
      // CRITICAL: Update stepId and executionId in message data
      existingDecision.data = {
        ...existingDecision.data,
        executionId: decisionRequest.executionId || existingDecision.data?.executionId,
        stepId: decisionRequest.stepId || existingDecision.data?.stepId,
        isDecision: true,
        iGasCost: decisionRequest.data?.iGasCost || decisionRequest.data?.igas || decisionRequest.iGasCost || existingDecision.data?.iGasCost
      };
      this.cdr.detectChanges();
      return;
    }

    // Check if this is an iGas-related decision and enhance the prompt
    let prompt = decisionRequest.prompt || 'Please make a decision:';
    const isIGasDecision = prompt.toLowerCase().includes('igas') || 
                          prompt.toLowerCase().includes('cost') ||
                          decisionRequest.data?.iGasCost !== undefined ||
                          decisionRequest.data?.igas !== undefined;
    
    // If it's an iGas decision, ensure the cost is mentioned
    if (isIGasDecision) {
      const iGasCost = decisionRequest.data?.iGasCost || 
                       decisionRequest.data?.igas || 
                       decisionRequest.iGasCost ||
                       0.00445;
      if (!prompt.toLowerCase().includes('igas') && !prompt.toLowerCase().includes('cost')) {
        prompt = `It will cost ${iGasCost.toFixed(6)} iGas to continue. ${prompt}`;
      }
    }

    // Create new decision message
    const chatMessage: Partial<ChatMessage> = {
      type: 'assistant' as const,
      content: prompt,
      timestamp: Date.now(),
      showOptions: true,
      options: (decisionRequest.options || []).map((opt: any) => ({
        value: opt.value,
        label: opt.label,
        data: opt
      })),
      data: {
        executionId: decisionRequest.executionId,
        stepId: decisionRequest.stepId,
        isDecision: true,
        iGasCost: decisionRequest.data?.iGasCost || decisionRequest.data?.igas || decisionRequest.iGasCost
      },
      videoUrl: decisionRequest.videoUrl,
      movieTitle: decisionRequest.movieTitle
    };
    
    console.log('💬 [WorkflowChat] Creating new decision message:', {
      stepId: chatMessage.data?.stepId,
      hasVideoUrl: !!chatMessage.videoUrl,
      videoUrl: chatMessage.videoUrl,
      hasMovieTitle: !!chatMessage.movieTitle,
      movieTitle: chatMessage.movieTitle,
      optionsCount: chatMessage.options?.length || 0
    });
    
    this.addChatMessage(chatMessage);
    console.log('💬 [WorkflowChat] ========================================');
  }

  getVideoUrl(videoUrl?: string): string {
    if (!videoUrl) return '';
    // Ensure the video URL is absolute (match workflow-display implementation)
    if (videoUrl.startsWith('/')) {
      return `${this.apiUrl}${videoUrl}`;
    }
    // If already absolute URL, return as-is
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      return videoUrl;
    }
    // Convert relative URL to absolute URL
    const baseUrl = this.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    return `${baseUrl}/${videoUrl}`;
  }

  /**
   * Play video when thumbnail is clicked
   */
  playVideo(video: Video): void {
    console.log('🎬 [WorkflowChat] Playing video:', video);
    
    // Add a new assistant message with the video player
    this.addChatMessage({
      type: 'assistant',
      content: `Playing: ${video.title}`,
      timestamp: Date.now(),
      videoUrl: video.videoUrl,
      movieTitle: video.title
    });
    
    this.cdr.detectChanges();
  }

  // Video event handlers to help debug and fix Windows player issues
  onVideoLoadStart(event: Event, videoUrl?: string): void {
    const video = event.target as HTMLVideoElement;
    console.log('🎬 [WorkflowChat] Video load started:', {
      videoUrl: videoUrl,
      src: video.src,
      currentSrc: video.currentSrc,
      readyState: video.readyState
    });
    // Force reload if src doesn't match (Windows player fix)
    if (videoUrl) {
      const expectedSrc = this.getVideoUrl(videoUrl);
      if (video.src !== expectedSrc) {
        console.log('🎬 [WorkflowChat] Video src mismatch detected, forcing reload...', {
          expected: expectedSrc,
          actual: video.src
        });
        video.src = expectedSrc;
        video.load();
        this.cdr.detectChanges();
      }
    }
  }

  onVideoLoadedData(event: Event, videoUrl?: string): void {
    const video = event.target as HTMLVideoElement;
    console.log('🎬 [WorkflowChat] Video data loaded:', {
      videoUrl: videoUrl,
      src: video.src,
      currentSrc: video.currentSrc,
      readyState: video.readyState,
      duration: video.duration
    });
  }

  onVideoError(event: Event, videoUrl?: string): void {
    const video = event.target as HTMLVideoElement;
    console.error('🎬 [WorkflowChat] Video error:', {
      videoUrl: videoUrl,
      src: video.src,
      currentSrc: video.currentSrc,
      error: video.error,
      networkState: video.networkState,
      readyState: video.readyState
    });
    // Try to reload the video (Windows player fix)
    if (videoUrl) {
      console.log('🎬 [WorkflowChat] Attempting to reload video...');
      const expectedSrc = this.getVideoUrl(videoUrl);
      setTimeout(() => {
        // Clear src first, then set it again to force reload
        video.src = '';
        video.load();
        setTimeout(() => {
          video.src = expectedSrc;
          video.load();
          this.cdr.detectChanges();
        }, 50);
      }, 100);
    }
  }

  private addSelectionMessage(options: any[], serviceType: string) {
    // Find if there's already a selection message
    const existingSelection = this.chatMessages.find(m => m.showOptions);
    if (existingSelection) {
      existingSelection.options = options.map((opt, idx) => ({
        value: opt.value || `option-${idx}`,
        label: this.formatOptionLabel(opt, serviceType),
        data: opt
      }));
      existingSelection.showOptions = true;
      this.cdr.detectChanges();
      return;
    }

    // Create new selection message
    const prompt = this.getSelectionPrompt(serviceType);
    this.addChatMessage({
      type: 'assistant',
      content: prompt,
      timestamp: Date.now(),
      showOptions: true,
      options: options.map((opt, idx) => ({
        value: opt.value || `option-${idx}`,
        label: this.formatOptionLabel(opt, serviceType),
        data: opt
      }))
    });
  }

  private formatOptionLabel(option: any, serviceType: string): string {
    // Format option label based on service type
    if (serviceType === 'movie' && option.movieTitle) {
      return `${option.movieTitle} - ${option.showtime} ($${option.price})`;
    } else if (serviceType === 'airline' && option.flightNumber) {
      return `${option.flightNumber} to ${option.destination} - ${option.date} ($${option.price})`;
    } else if (serviceType === 'hotel' && option.hotelName) {
      return `${option.hotelName} - ${option.roomType} ($${option.price}/night)`;
    } else if (serviceType === 'restaurant' && option.restaurantName) {
      return `${option.restaurantName} - ${option.cuisine} ($${option.price})`;
    } else if (serviceType === 'autoparts' && option.partName) {
      return `${option.partName} - ${option.partNumber} ($${option.price})`;
    }
    return option.label || option.name || 'Option';
  }

  private getSelectionPrompt(serviceType: string): string {
    const prompts: Record<string, string> = {
      movie: 'Here are the available movies:',
      airline: 'Here are the available flights:',
      hotel: 'Here are the available hotels:',
      restaurant: 'Here are the available restaurants:',
      autoparts: 'Here are the available parts:',
      dex: 'Here are the available trading options:'
    };
    return prompts[serviceType] || 'Please select an option:';
  }

  onOptionSelected(option: any, message?: ChatMessage) {
    console.log(`💬 [WorkflowChat] ========================================`);
    console.log(`💬 [WorkflowChat] onOptionSelected called`);
    console.log(`💬 [WorkflowChat] option:`, option);
    console.log(`💬 [WorkflowChat] message:`, message);
    console.log(`💬 [WorkflowChat] message?.data:`, message?.data);
    
    // Determine if this is a decision or selection
    const isDecision = message?.data?.isDecision || false;
    const executionId = message?.data?.executionId || this.activeExecution?.executionId;
    const stepId = message?.data?.stepId || this.activeExecution?.currentStep;
    
    console.log(`💬 [WorkflowChat] isDecision: ${isDecision}, executionId: ${executionId}, stepId: ${stepId}`);
    console.log(`💬 [WorkflowChat] activeExecution?.currentStep: ${this.activeExecution?.currentStep}`);
    
    // CRITICAL: If we're at view_movie step, only accept "DONE_WATCHING" decisions
    // This prevents accidentally submitting a movie selection (like "AMC-001") when the workflow is waiting for "DONE_WATCHING"
    const decisionValue = (option.value || option.label || 'selected').toUpperCase().trim();
    console.log(`💬 [WorkflowChat] decisionValue: ${decisionValue}`);
    
    if (stepId === 'view_movie') {
      // Check if this is a valid "DONE_WATCHING" decision
      const isValidDoneWatching = decisionValue === 'DONE_WATCHING' || 
                                   decisionValue === 'DONE WATCHING' ||
                                   (option.label && option.label.toUpperCase().trim() === 'DONE WATCHING');
      if (!isValidDoneWatching) {
        console.warn(`⚠️ [WorkflowChat] ========================================`);
        console.warn(`⚠️ [WorkflowChat] view_movie step received "${decisionValue}" instead of "DONE_WATCHING"`);
        console.warn(`⚠️ [WorkflowChat] isDecision: ${isDecision}, stepId: ${stepId}`);
        console.warn(`⚠️ [WorkflowChat] option.value: ${option.value}, option.label: ${option.label}`);
        console.warn(`⚠️ [WorkflowChat] This might be a stale selection prompt from a previous step`);
        console.warn(`⚠️ [WorkflowChat] Ignoring this submission - waiting for "DONE_WATCHING" decision`);
        console.warn(`⚠️ [WorkflowChat] ========================================`);
        // Don't submit this - it's likely a stale selection prompt
        return;
      } else {
        console.log(`✅ [WorkflowChat] Valid DONE_WATCHING decision for view_movie step: ${decisionValue}`);
      }
    }

    // Format the confirmation message based on option type
    let choiceText: string;
    if (isDecision) {
      // For decisions, check if it's an iGas cost decision
      const prompt = message?.content || '';
      const isIGasDecision = prompt.toLowerCase().includes('igas') || prompt.toLowerCase().includes('cost');
      
      if (isIGasDecision) {
        // For iGas decisions, show a clear YES/NO response
        const choice = (option.label || option.value || '').toUpperCase();
        if (choice === 'YES' || choice === 'Y' || choice === 'TRUE' || choice === 'CONTINUE') {
          choiceText = 'Yes, I\'ll continue';
        } else if (choice === 'NO' || choice === 'N' || choice === 'FALSE' || choice === 'CANCEL') {
          choiceText = 'No, I\'ll cancel';
        } else {
          choiceText = `${option.label || option.value}`;
        }
      } else {
        // For other decisions, show the label or value
        choiceText = `${option.label || option.value}`;
      }
    } else {
      // For selections, show the formatted option
      const formattedLabel = this.formatOptionLabel(option, this.activeExecution?.serviceType || 'service');
      choiceText = `I'll choose: ${formattedLabel}`;
    }
    
    // Add user confirmation message IMMEDIATELY (before submission)
    this.addChatMessage({
      type: 'user',
      content: choiceText,
      timestamp: Date.now()
    });

    // Hide options for this specific message IMMEDIATELY
    if (message) {
      message.showOptions = false;
      this.cdr.detectChanges();
    } else {
      // Fallback: hide any message with options
      const selectionMessage = this.chatMessages.find(m => m.showOptions);
      if (selectionMessage) {
        selectionMessage.showOptions = false;
        this.cdr.detectChanges();
      }
    }

    // Submit decision/selection to workflow AFTER displaying confirmation
    if (executionId) {
      // CRITICAL: Ensure stepId is passed - use activeExecution.currentStep as fallback
      const finalStepId = stepId || this.activeExecution?.currentStep;
      const decisionValue = option.value || option.label || 'selected';
      
      console.log(`💬 [WorkflowChat] ========================================`);
      console.log(`💬 [WorkflowChat] SUBMITTING DECISION/SELECTION`);
      console.log(`💬 [WorkflowChat] Execution ID: ${executionId}`);
      console.log(`💬 [WorkflowChat] Step ID: ${finalStepId || 'unknown'}`);
      console.log(`💬 [WorkflowChat] Decision value: ${decisionValue}`);
      console.log(`💬 [WorkflowChat] isDecision: ${isDecision}`);
      console.log(`💬 [WorkflowChat] ========================================`);
      
      // Use submitDecision for both decisions and selections
      console.log('💬 [WorkflowChat] ========================================');
      console.log('💬 [WorkflowChat] About to call flowWiseService.submitDecision');
      console.log('💬 [WorkflowChat] executionId:', executionId);
      console.log('💬 [WorkflowChat] decisionValue:', decisionValue);
      console.log('💬 [WorkflowChat] finalStepId:', finalStepId);
      console.log('💬 [WorkflowChat] isDecision:', isDecision);
      console.log('💬 [WorkflowChat] ========================================');
      
      this.flowWiseService.submitDecision(
        executionId, 
        decisionValue,
        finalStepId
      ).then((result) => {
        console.log('💬 [WorkflowChat] ========================================');
        console.log('💬 [WorkflowChat] ✅ Decision/selection submitted successfully');
        console.log('💬 [WorkflowChat] Result:', result);
        console.log('💬 [WorkflowChat] ========================================');
        // NOTE: Do NOT add confirmation message here - wait for workflow_completed or ledger_booking_completed event
        // The confirmation will be added when the workflow actually completes payment processing
      }).catch((error) => {
        console.error('💬 [WorkflowChat] ========================================');
        console.error('💬 [WorkflowChat] ❌ Failed to submit decision/selection:', error);
        console.error('💬 [WorkflowChat] Error message:', error.message);
        console.error('💬 [WorkflowChat] Error stack:', error.stack);
        console.error('💬 [WorkflowChat] ========================================');
        // Show error message
        this.addChatMessage({
          type: 'system',
          content: `❌ Failed to process your choice: ${error.message || 'Unknown error'}. Please try again.`,
          timestamp: Date.now()
        });
      });
    }
  }

  onCancelOption(message?: ChatMessage) {
    // Hide the options
    if (message) {
      message.showOptions = false;
      this.cdr.detectChanges();
    } else {
      // Hide any message with options
      const selectionMessage = this.chatMessages.find(m => m.showOptions);
      if (selectionMessage) {
        selectionMessage.showOptions = false;
        this.cdr.detectChanges();
      }
    }

    // Add a user message indicating cancellation
    this.addChatMessage({
      type: 'user',
      content: 'I\'ll cancel this selection.',
      timestamp: Date.now()
    });

    // Add a system confirmation
    this.addChatMessage({
      type: 'system',
      content: 'Selection cancelled. You can start a new request.',
      timestamp: Date.now()
    });
  }

  clearChat() {
    // No destructive clear; just start a new chat thread (keeps last N threads)
    this.startNewChatThread();
  }

  requestSendFromMainInput() {
    // Tie "➕ New Chat" to the main unified input send path (AppComponent.onSubmit).
    // This lets the user one-click send the prefilled prompt/sample query.
    try {
      window.dispatchEvent(new CustomEvent('eden_send', { detail: { source: 'workflow_chat_new_chat' } }));
    } catch {}
  }

  newChatAndSend() {
    // Always do something visible: clear the current chat thread immediately,
    // reset other panels, then try to send whatever is currently in the unified input.
    this.startNewChatThread();
    try {
      window.dispatchEvent(new CustomEvent('eden_chat_reset', { detail: { reason: 'new_chat_button' } }));
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('eden_send', { detail: { source: 'workflow_chat_new_chat' } }));
    } catch {}
  }

  /**
   * Genre/category mapping for content_tags
   * Maps user-friendly genre names to actual content_tags found in library.json
   */
  private getGenreContentTags(genre: string): string[] {
    const genreMap: { [key: string]: string[] } = {
      'sci-fi': ['sci-fi', 'science fiction', 'futuristic', 'space', 'technology', 'cyberpunk'],
      'science fiction': ['sci-fi', 'science fiction', 'futuristic', 'space', 'technology'],
      'scifi': ['sci-fi', 'science fiction', 'futuristic', 'space', 'technology'],
      'action': ['action', 'fight', 'combat', 'battle', 'explosion', 'adventure', 'dramatic', 'intense'],
      'comedy': ['comedy', 'funny', 'humor', 'humorous', 'laugh'],
      'horror': ['horror', 'scary', 'frightening', 'dark', 'thriller'],
      'drama': ['drama', 'emotional', 'serious', 'intense', 'dramatic'],
      'romance': ['romance', 'romantic', 'love', 'relationship'],
      'thriller': ['thriller', 'suspense', 'tension', 'mystery'],
      'fantasy': ['fantasy', 'magical', 'mythical', 'medieval', 'magic', 'cgi', 'portrait', 'character'],
      'documentary': ['documentary', 'educational', 'informative', 'real'],
      'nature': ['nature', 'outdoor', 'wildlife', 'landscape', 'environment'],
      'architecture': ['architecture', 'building', 'structure', 'design', 'interior', 'grand', 'modern', 'luxury'],
      'indoor': ['indoor', 'interior', 'inside'],
      'outdoor': ['outdoor', 'exterior', 'outside', 'nature'],
      'portrait': ['portrait', 'close-up', 'character', 'cgi', 'dramatic'],
      'cgi': ['cgi', 'render', 'fantasy', 'portrait', 'character'],
      'character': ['character', 'portrait', 'cgi', 'fantasy', 'dramatic']
    };
    
    const lowerGenre = genre.toLowerCase().trim();
    return genreMap[lowerGenre] || [lowerGenre];
  }

  /**
   * Extract genre/category from user message
   */
  private extractGenreFromMessage(message: string): { genre?: string; isVideoRequest: boolean } {
    const lowerMessage = message.toLowerCase();
    
      // Patterns for video requests with genres
      const genrePatterns = [
        { pattern: /(?:watch|show|find|list|get|see|want).*?(?:sci-fi|science fiction|scifi)/i, genre: 'sci-fi' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?action/i, genre: 'action' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?comedy/i, genre: 'comedy' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?horror/i, genre: 'horror' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?drama/i, genre: 'drama' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?romance/i, genre: 'romance' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?thriller/i, genre: 'thriller' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?fantasy/i, genre: 'fantasy' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?documentary/i, genre: 'documentary' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?nature/i, genre: 'nature' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?architecture/i, genre: 'architecture' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?indoor/i, genre: 'indoor' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?outdoor/i, genre: 'outdoor' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?portrait/i, genre: 'portrait' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?cgi/i, genre: 'cgi' },
        { pattern: /(?:watch|show|find|list|get|see|want).*?character/i, genre: 'character' },
        // Generic movie/video requests
        { pattern: /(?:watch|show|find|list|get|see|want).*?(?:movie|video|film)/i, genre: undefined }
      ];
    
    // Check for genre-specific requests
    for (const { pattern, genre } of genrePatterns) {
      if (pattern.test(message)) {
        return { genre, isVideoRequest: true };
      }
    }
    
    // Check for general video listing requests
    const listingPatterns = [
      'list all available videos',
      'list all videos',
      'show all videos',
      'show available videos',
      'list videos',
      'all videos',
      'available videos'
    ];
    
    if (listingPatterns.some(pattern => lowerMessage.includes(pattern))) {
      return { isVideoRequest: true };
    }
    
    return { isVideoRequest: false };
  }

  /**
   * Check if message is requesting video listing
   */
  private isVideoListingRequest(message: string): boolean {
    return this.extractGenreFromMessage(message).isVideoRequest;
  }

  /**
   * Fetch videos from API with optional filters
   */
  private async fetchVideos(filters?: { search?: string; content_tags?: string[] }): Promise<Video[]> {
    try {
      let url = `${this.apiUrl}/api/videos`;
      const params: string[] = [];
      
      if (filters) {
        if (filters.search) {
          params.push(`search=${encodeURIComponent(filters.search)}`);
        }
        if (filters.content_tags && filters.content_tags.length > 0) {
          params.push(`content_tags=${filters.content_tags.map(t => encodeURIComponent(t)).join(',')}`);
        }
      }
      
      if (params.length > 0) {
        url += '?' + params.join('&');
      }
      
      const response = await this.http.get<any>(url).toPromise();
      if (response && response.success && response.data) {
        // Map API response to Video format
        return response.data.map((v: any) => ({
          id: v.id || v.filename,
          filename: v.filename || v.id || 'unknown.mp4',
          title: v.title || v.filename || 'Untitled Video',
          videoUrl: v.videoUrl || `/api/movie/video/${v.filename || ''}`,
          thumbnailUrl: v.thumbnailUrl || v.videoUrl || `/api/movie/video/${v.filename || ''}`
        }));
      }
      return [];
    } catch (error: any) {
      console.error('❌ [WorkflowChat] Failed to fetch videos:', error);
      return [];
    }
  }

  /**
   * Fetch all available videos from API (backward compatibility)
   */
  private async fetchAllVideos(): Promise<Video[]> {
    return this.fetchVideos();
  }

  /**
   * Send regular chat message from the input box above chat history
   * The LLM will determine if it's Eden-related and respond appropriately
   */
  async sendChatMessage(): Promise<void> {
    if (!this.chatInput.trim() || this.isSendingChat) {
      return;
    }

    const message = this.chatInput.trim();
    this.isSendingChat = true;

    try {
      console.log('💬 [WorkflowChat] Sending regular chat message:', message);
      
      // Add user message to chat immediately
      this.addChatMessage({
        type: 'user',
        content: message,
        timestamp: Date.now()
      });

      // Clear input
      const messageToSend = message;
      this.chatInput = '';

      // Check if this is a "list all videos" request - handle directly without WebSocket
      const isListAllVideos = /\b(list|show|display)\s+(all\s+)?(video|movie|videos|movies)\b/i.test(messageToSend);
      
      if (isListAllVideos) {
        console.log('📋 [WorkflowChat] Detected "list all videos" request - fetching directly from API');
        
        try {
          // Fetch all videos directly from API
          const videos = await this.fetchAllVideos();
          
          if (videos.length > 0) {
            // Convert API videos to Video format for display
            const displayVideos: Video[] = videos.map((v: any) => ({
              id: v.id || `video-${Date.now()}-${Math.random()}`,
              filename: v.filename || v.id || 'unknown.mp4',
              title: v.title || v.filename || 'Untitled Video',
              videoUrl: v.videoUrl || `/api/movie/video/${v.filename || ''}`,
              thumbnailUrl: v.thumbnailUrl || v.videoUrl || `/api/movie/video/${v.filename || ''}`
            }));
            
            // Add assistant message with video thumbnails
            this.addChatMessage({
              type: 'assistant',
              content: `Here are all ${videos.length} videos available in Eden's video library. All movies are completely FREE ($0.00) and you'll get 1 APPLE reward for watching each one.`,
              timestamp: Date.now(),
              videos: displayVideos
            });
          } else {
            // No videos found
            this.addChatMessage({
              type: 'assistant',
              content: 'No videos found in the library.',
              timestamp: Date.now()
            });
          }
        } catch (error: any) {
          console.error('❌ [WorkflowChat] Error fetching videos:', error);
          this.addChatMessage({
            type: 'assistant',
            content: `Error loading videos: ${error.message || 'Unknown error'}`,
            timestamp: Date.now()
          });
        }
        
        this.isSendingChat = false;
        this.cdr.detectChanges();
        return; // Don't send to WebSocket
      }

      // Check if this is a video listing request
      const videoRequest = this.extractGenreFromMessage(messageToSend);
      if (videoRequest.isVideoRequest) {
        console.log('🎬 [WorkflowChat] Detected video request:', videoRequest);
        
        // Build filters based on genre
        const filters: { search?: string; content_tags?: string[] } = {};
        
        if (videoRequest.genre) {
          // Get content tags for the genre
          const contentTags = this.getGenreContentTags(videoRequest.genre);
          filters.content_tags = contentTags;
          console.log('🎬 [WorkflowChat] Applying genre filter:', videoRequest.genre, '-> content_tags:', contentTags);
        } else {
          // For generic requests, use search to find relevant videos
          // Extract keywords from message
          const keywords = messageToSend
            .toLowerCase()
            .replace(/(?:watch|show|find|list|get|see|all|available|videos?|movies?|films?)/g, '')
            .trim()
            .split(/\s+/)
            .filter(w => w.length > 2);
          
          if (keywords.length > 0) {
            filters.search = keywords.join(' ');
            console.log('🎬 [WorkflowChat] Applying search filter:', filters.search);
          }
        }
        
        // Fetch videos with filters
        const videos = await this.fetchVideos(filters);
        
        if (videos.length > 0) {
          // Add assistant message with video thumbnails
          const genreText = videoRequest.genre ? ` ${videoRequest.genre}` : '';
          this.addChatMessage({
            type: 'assistant',
            content: `Found ${videos.length}${genreText} video${videos.length !== 1 ? 's' : ''}:`,
            timestamp: Date.now(),
            videos: videos
          });
        } else {
          // No videos found
          const genreText = videoRequest.genre ? ` ${videoRequest.genre}` : '';
          this.addChatMessage({
            type: 'assistant',
            content: `No${genreText} videos found in the library.`,
            timestamp: Date.now()
          });
        }
        
        this.isSendingChat = false;
        this.cdr.detectChanges();
        return;
      }

      // Send to backend for regular chat
      const response = await this.http.post<any>(`${this.apiUrl}/api/chat`, {
        input: messageToSend,
        email: this.userEmail || 'guest@example.com'
      }).toPromise();

      console.log('💬 [WorkflowChat] Chat message sent, response:', response);

      // The LLM response will come via WebSocket as llm_response event
      // No need to manually add it here - it will be handled by the WebSocket handler
    } catch (error: any) {
      console.error('❌ [WorkflowChat] Failed to send chat message:', error);
      this.addChatMessage({
        type: 'system',
        content: `❌ Failed to send message: ${error.message || 'Unknown error'}`,
        timestamp: Date.now()
      });
    } finally {
      this.isSendingChat = false;
      this.cdr.detectChanges();
    }
  }

  // Public method to reset chat (called from app component on send)
  public resetChat() {
    // Back-compat: treat reset as "new chat thread"
    this.startNewChatThread();
  }

  get renderedThreads(): ChatThread[] {
    const currentTitle = this.buildThreadTitle(this.chatMessages) || 'New chat';
    const currentThread = {
      id: 'current',
      title: currentTitle,
      startedAt: this.currentThreadStartedAt,
      executionId: this.currentThreadExecutionId,
      messages: this.chatMessages
    };
    
    // Debug logging to track message visibility
    if (this.chatMessages.length > 0) {
      console.log('💬 [WorkflowChat] renderedThreads - Current thread:', {
        id: currentThread.id,
        title: currentThread.title,
        messageCount: currentThread.messages.length,
        messageTypes: currentThread.messages.map(m => m.type),
        archivedThreadsCount: this.archivedThreads.length
      });
    }
    
    return [
      currentThread,
      ...this.archivedThreads
    ];
  }

  trackByThreadId(index: number, thread: ChatThread): string {
    return thread.id;
  }

  trackByMessageId(index: number, message: ChatMessage): string {
    return message.id;
  }

  isThreadExpanded(thread: ChatThread, idx: number): boolean {
    if (idx === 0) return true; // current always expanded
    return this.expandedArchivedThreadIds.has(thread.id);
  }

  toggleArchivedThread(thread: ChatThread) {
    if (thread.id === 'current') return;
    if (this.expandedArchivedThreadIds.has(thread.id)) {
      this.expandedArchivedThreadIds.delete(thread.id);
    } else {
      this.expandedArchivedThreadIds.add(thread.id);
    }
    this.cdr.detectChanges();
  }

  private startNewChatThread() {
    // Archive current thread if it has any messages
    // BUT: Don't archive if the thread only has messaging system messages (keep them visible)
    const hasWorkflowMessages = this.chatMessages.some(m => 
      m.data?.executionId || m.data?.workflowId || m.type === 'ledger' || 
      (m.data?.conversationId && !m.data?.message) // workflow-related, not pure messaging
    );
    
    if (this.chatMessages.length > 0 && hasWorkflowMessages) {
      const title = this.buildThreadTitle(this.chatMessages) || 'Chat';
      const bounded = this.chatMessages.length > this.MAX_MESSAGES_PER_THREAD
        ? this.chatMessages.slice(-this.MAX_MESSAGES_PER_THREAD)
        : this.chatMessages;
      this.archivedThreads.unshift({
        id: `t_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        title,
        startedAt: this.currentThreadStartedAt,
        executionId: this.currentThreadExecutionId,
        messages: bounded
      });
      // Keep only last N-1 archived (current thread is shown separately)
      if (this.archivedThreads.length > this.MAX_THREADS - 1) {
        this.archivedThreads = this.archivedThreads.slice(0, this.MAX_THREADS - 1);
      }
      
      // Start fresh current thread
      this.chatMessages = [];
      this.currentThreadStartedAt = Date.now();
      this.currentThreadExecutionId = null;
    } else if (this.chatMessages.length > 0 && !hasWorkflowMessages) {
      // Messaging-only thread - keep messages visible, just update executionId
      console.log('💬 [WorkflowChat] Keeping messaging-only messages in current thread');
      this.currentThreadExecutionId = null;
    } else {
      // Empty thread - just reset
      this.chatMessages = [];
      this.currentThreadStartedAt = Date.now();
      this.currentThreadExecutionId = null;
    }
    
    // Collapse all archived threads by default (keeps UI responsive)
    this.expandedArchivedThreadIds.clear();
    this.cdr.detectChanges();
  }

  private buildThreadTitle(messages: ChatMessage[]): string {
    const firstUser = messages.find(m => m.type === 'user' && !!m.content)?.content || '';
    const t = firstUser.trim();
    if (!t) return '';
    return t.length > 48 ? `${t.slice(0, 48)}…` : t;
  }

  private loadLedgerEntries() {
    this.http.get<any[]>(`${this.apiUrl}/api/ledger`)
      .subscribe({
        next: (entries) => {
          this.ledgerEntries = entries || [];
          // Add any new ledger entries as chat messages
          entries.forEach(entry => {
            if (!this.displayedLedgerEntryIds.has(entry.entryId)) {
              this.addLedgerEntryAsMessage(entry);
            }
          });
          console.log('💬 [WorkflowChat] Loaded ledger entries:', this.ledgerEntries.length);
        },
        error: (err) => {
          console.error('💬 [WorkflowChat] Failed to load ledger:', err);
        }
      });
  }

  private addLedgerEntryAsMessage(entry: any) {
    // Skip if we've already displayed this entry
    if (this.displayedLedgerEntryIds.has(entry.entryId)) {
      return;
    }

    // Mark as displayed
    this.displayedLedgerEntryIds.add(entry.entryId);

    // Extract fields from entry (handle nested structures)
    // For DEX trades, ALWAYS prioritize bookingDetails.baseAmount (the actual SOL amount traded)
    const isDexTrade = entry.serviceType === 'dex' 
      || entry.entry?.serviceType === 'dex' 
      || entry.bookingDetails?.action
      || entry.bookingDetails?.tokenSymbol;
    
    // Get bookingDetails from multiple possible locations
    const bookingDetails = entry.bookingDetails 
      || entry.entry?.bookingDetails 
      || entry.data?.bookingDetails;
    
    let amount = 0;
    
    // CRITICAL: For DEX trades, backend sets entry.amount correctly, so prioritize it
    // Use bookingDetails.baseAmount only if entry.amount is missing/0 (shouldn't happen, but safety)
    if (isDexTrade) {
      // First, try entry.amount (backend sets this correctly)
      if (entry.amount !== undefined && entry.amount !== null && entry.amount > 0) {
        amount = entry.amount;
        console.log('💬 [WorkflowChat] DEX trade: Using entry.amount from backend:', amount);
      } else if (entry.entry?.amount !== undefined && entry.entry?.amount !== null && entry.entry.amount > 0) {
        amount = entry.entry.amount;
        console.log('💬 [WorkflowChat] DEX trade: Using entry.entry.amount:', amount);
      } else if (bookingDetails) {
        // Fallback to bookingDetails only if entry.amount is missing
        const baseAmount = bookingDetails.baseAmount;
        const totalAmount = bookingDetails.totalAmount;
        const bookingAmount = bookingDetails.amount;
        
        console.log('💬 [WorkflowChat] DEX trade amount extraction (fallback):', {
          entryId: entry.entryId,
          entryAmount: entry.amount,
          baseAmount,
          totalAmount,
          bookingAmount,
          hasBookingDetails: !!bookingDetails
        });
        
        if (baseAmount !== undefined && baseAmount !== null && !isNaN(Number(baseAmount)) && Number(baseAmount) > 0) {
          amount = Number(baseAmount);
          console.log('💬 [WorkflowChat] Using baseAmount from bookingDetails (fallback):', amount);
        } else if (totalAmount !== undefined && totalAmount !== null && !isNaN(Number(totalAmount)) && Number(totalAmount) > 0) {
          amount = Number(totalAmount);
          console.log('💬 [WorkflowChat] Using totalAmount from bookingDetails (fallback):', amount);
        } else if (bookingAmount !== undefined && bookingAmount !== null && !isNaN(Number(bookingAmount)) && Number(bookingAmount) > 0) {
          amount = Number(bookingAmount);
          console.log('💬 [WorkflowChat] Using bookingAmount from bookingDetails (fallback):', amount);
        }
      }
      
      // Final safety check
      if ((amount === 0 || amount === null || amount === undefined)) {
        console.error('💬 [WorkflowChat] DEX trade: Could not extract amount!', {
          entryId: entry.entryId,
          entryAmount: entry.amount,
          entryEntryAmount: entry.entry?.amount,
          bookingDetails: bookingDetails ? JSON.stringify(bookingDetails) : 'missing'
        });
      }
    } else {
      // Non-DEX trades: check standard fields
      amount = entry.amount !== undefined && entry.amount !== null && entry.amount > 0
        ? entry.amount
        : (entry.entry?.amount !== undefined && entry.entry?.amount !== null && entry.entry.amount > 0
            ? entry.entry.amount
            : (entry.snapshot?.amount !== undefined && entry.snapshot?.amount !== null && entry.snapshot.amount > 0
                ? entry.snapshot.amount
                : 0));
    }
    
    // Final fallback: try bookingDetails for non-DEX or if still 0
    if ((amount === 0 || amount === null || amount === undefined) && bookingDetails && !isDexTrade) {
      const fallbackAmount = bookingDetails.totalAmount 
        || bookingDetails.baseAmount
        || bookingDetails.price
        || bookingDetails.amount;
      if (fallbackAmount !== undefined && fallbackAmount !== null && !isNaN(Number(fallbackAmount)) && Number(fallbackAmount) > 0) {
        amount = Number(fallbackAmount);
      }
    }
    
    // Extract merchant - try multiple sources including bookingDetails
    const merchant = entry.merchant 
      || entry.entry?.merchant 
      || entry.snapshot?.merchant 
      || entry.bookingDetails?.merchantName
      || entry.bookingDetails?.providerName
      || 'N/A';
    
    // Extract serviceType
    const serviceType = entry.serviceType 
      || entry.entry?.serviceType 
      || entry.snapshot?.serviceType 
      || entry.bookingDetails?.serviceType
      || 'N/A';
    
    const status = entry.status || entry.entry?.status || 'pending';
    
    // Create a formatted ledger message
    const details = this.formatBookingDetails(entry);
    // HARDCODED: Always show restaurant entries as completed
    const displayStatus = serviceType === 'restaurant' ? 'completed' : status;
    const statusEmoji = displayStatus === 'completed' ? '✅' : 
                        displayStatus === 'processed' ? '⏳' : 
                        displayStatus === 'pending' ? '⏱️' : '❌';

    // Extract iGasCost - check multiple possible locations
    const iGasCost = entry.iGasCost !== undefined && entry.iGasCost !== null 
      ? entry.iGasCost 
      : (entry.entry?.iGasCost !== undefined && entry.entry?.iGasCost !== null 
          ? entry.entry.iGasCost 
          : 0);

    console.log('💬 [WorkflowChat] Creating ledger message:', {
      entryId: entry.entryId,
      extractedAmount: amount,
      merchant: merchant,
      serviceType: serviceType,
      iGasCost: iGasCost,
      status: status,
      isDexTrade: isDexTrade,
      bookingDetails: bookingDetails ? {
        baseAmount: bookingDetails.baseAmount,
        totalAmount: bookingDetails.totalAmount,
        action: bookingDetails.action,
        tokenSymbol: bookingDetails.tokenSymbol,
        tokenAmount: bookingDetails.tokenAmount,
        fullBookingDetails: JSON.stringify(bookingDetails)
      } : null,
      entryAmount: entry.amount,
      entryEntryAmount: entry.entry?.amount,
      snapshotAmount: entry.snapshot?.amount,
      hasBookingDetails: !!bookingDetails,
      entryFull: JSON.stringify(entry, null, 2).substring(0, 500) // First 500 chars for debugging
    });

    // Log the full entry to debug
    console.log('💬 [WorkflowChat] Full ledger entry:', JSON.stringify(entry, null, 2));

    this.addChatMessage({
      type: 'ledger',
      content: `${statusEmoji} **Transaction ${displayStatus}**`,
      timestamp: entry.timestamp || entry.entry?.timestamp || Date.now(),
      data: {
        entry: { ...entry, status: displayStatus }, // Use displayStatus for UI
        details: details,
        amount: amount,
        merchant: merchant,
        serviceType: serviceType,
        iGasCost: iGasCost
      }
    });

    // If entry is completed, update wallet balance in header after a delay
    if (entry.status === 'completed') {
      setTimeout(() => {
        this.loadWalletBalance(false);
      }, 1000);
    }
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  formatIGasCost(iGasCost: number | string | undefined): string {
    if (iGasCost === undefined || iGasCost === null) return '0.000000';
    const num = typeof iGasCost === 'string' ? parseFloat(iGasCost) : iGasCost;
    if (isNaN(num)) return '0.000000';
    return num.toFixed(6);
  }

  formatAmount(amount: number | undefined | null): string {
    if (amount === undefined || amount === null || isNaN(amount)) return '0.00';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '0.00';
    
    // For very small amounts (< 0.01), show more decimal places
    if (Math.abs(num) < 0.01 && num !== 0) {
      return num.toFixed(6);
    }
    // For regular amounts, show 2 decimal places
    return num.toFixed(2);
  }

  formatBookingDetails(entry: any): string {
    if (!entry.bookingDetails) return '';
    
    const details = entry.bookingDetails;
    const parts: string[] = [];
    
    // Movie
    if (details.movieTitle) {
      parts.push(`Movie: ${details.movieTitle}`);
      if (details.showtime) parts.push(`Showtime: ${details.showtime}`);
    }
    
    // Airline
    if (details.flightNumber) {
      parts.push(`Flight: ${details.flightNumber}`);
      if (details.destination) parts.push(`To: ${details.destination}`);
      if (details.date) parts.push(`Date: ${details.date}`);
    }
    
    // Hotel
    if (details.hotelName) {
      parts.push(`Hotel: ${details.hotelName}`);
      if (details.roomType) parts.push(`Room: ${details.roomType}`);
      if (details.checkIn) parts.push(`Check-in: ${details.checkIn}`);
    }
    
    // Restaurant
    if (details.restaurantName) {
      parts.push(`Restaurant: ${details.restaurantName}`);
      if (details.reservationTime) parts.push(`Time: ${details.reservationTime}`);
    }
    
    // Autoparts
    if (details.partName) {
      parts.push(`Part: ${details.partName}`);
      if (details.partNumber) parts.push(`Part #: ${details.partNumber}`);
    }
    
    return parts.join(' | ');
  }

  private loadWalletBalance(showInChat: boolean = false) {
    if (!this.userEmail || !this.userEmail.includes('@')) {
      console.warn('💬 [WorkflowChat] No valid email, skipping balance load');
      return;
    }

    // Prevent multiple simultaneous requests
    if (this.isLoadingWallet) {
      return;
    }

    this.isLoadingWallet = true;
    console.log(`💰 [WorkflowChat] Loading wallet balance for: ${this.userEmail}`);
    
    this.http.get<{success: boolean, balance: number, error?: string}>(
      `${this.apiUrl}/api/jsc/balance/${encodeURIComponent(this.userEmail)}`
    ).subscribe({
      next: (response) => {
        this.isLoadingWallet = false;
        if (response.success) {
          const previousBalance = this.walletBalance;
          this.walletBalance = response.balance || 0;
          console.log(`✅ [WorkflowChat] Wallet balance loaded: ${this.walletBalance} 🍎 APPLES`);
          
          // Trigger change detection to update header
          this.cdr.detectChanges();
          
          // Only show balance message in chat if explicitly requested (after workflow completion)
          if (showInChat) {
            // Check if balance message already exists (within last 5 seconds to avoid duplicates)
            const recentBalanceMessage = this.chatMessages.find(m => 
              m.type === 'system' && 
              m.content.includes('Wallet Balance') &&
              (Date.now() - m.timestamp) < 5000
            );
            
            if (!recentBalanceMessage) {
              console.log('💬 [WorkflowChat] Adding wallet balance message to chat');
              this.addChatMessage({
                type: 'system',
                content: `💰 **Wallet Balance:** ${this.walletBalance.toFixed(2)} 🍎 APPLES`,
                timestamp: Date.now(),
                data: { balance: this.walletBalance, previousBalance: previousBalance }
              });
            } else {
              console.log('💬 [WorkflowChat] Wallet balance message already exists, skipping');
            }
          }
        } else {
          console.error('❌ [WorkflowChat] Failed to load balance:', response.error);
          this.walletBalance = 0; // Set to 0 on error so it still displays
        }
      },
      error: (err) => {
        this.isLoadingWallet = false;
        console.error('❌ [WorkflowChat] Error loading wallet balance:', err);
        this.walletBalance = 0; // Set to 0 on error so it still displays
      }
    });
  }
}

