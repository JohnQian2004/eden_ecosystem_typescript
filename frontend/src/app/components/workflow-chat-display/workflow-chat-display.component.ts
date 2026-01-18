import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FlowWiseService, WorkflowExecution } from '../../services/flowwise.service';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'ledger';
  content: string;
  timestamp: number;
  data?: any; // For structured data like listings or ledger entry
  showOptions?: boolean;
  options?: Array<{ value: string; label: string; data: any }>;
}

@Component({
  selector: 'app-workflow-chat-display',
  templateUrl: './workflow-chat-display.component.html',
  styleUrls: ['./workflow-chat-display.component.scss']
})
export class WorkflowChatDisplayComponent implements OnInit, OnDestroy {
  chatMessages: ChatMessage[] = [];
  activeExecution: WorkflowExecution | null = null;
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

  constructor(
    private http: HttpClient,
    private flowWiseService: FlowWiseService,
    private webSocketService: WebSocketService,
    private cdr: ChangeDetectorRef
  ) {
    this.apiUrl = window.location.port === '4200' 
      ? 'http://localhost:3000' 
      : '';
  }

  ngOnInit() {
    console.log('💬 [WorkflowChat] Initializing chat display...');
    
    // Get user email from localStorage
    this.userEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
    
    // Check for active executions periodically
    this.executionCheckInterval = setInterval(() => {
      const latestExecution = this.flowWiseService.getLatestActiveExecution();
      if (latestExecution && latestExecution.executionId !== this.activeExecution?.executionId) {
        console.log('💬 [WorkflowChat] New active execution detected:', latestExecution.executionId);
        this.activeExecution = latestExecution;
        this.processExecutionMessages(latestExecution);
      } else if (!latestExecution && this.activeExecution) {
        // Workflow completed - no more active execution
        console.log('💬 [WorkflowChat] Workflow completed (no active execution)');
        this.activeExecution = null;
        // Show wallet balance after workflow completion
        setTimeout(() => {
          this.loadWalletBalance(true);
        }, 1000);
      }
    }, 1000);

    // Listen for WebSocket events
    this.wsSubscription = this.webSocketService.events$.subscribe((event: SimulatorEvent) => {
      this.handleWebSocketEvent(event);
    });

    // Listen for decision requests from FlowWiseService
    this.decisionSubscription = this.flowWiseService.getDecisionRequests().subscribe((decisionRequest: any) => {
      console.log('💬 [WorkflowChat] Decision required:', decisionRequest);
      this.addDecisionMessage(decisionRequest);
    });

    // Listen for selection requests from FlowWiseService
    this.selectionSubscription = this.flowWiseService.getSelectionRequests().subscribe((selectionRequest: any) => {
      console.log('💬 [WorkflowChat] Selection required:', selectionRequest);
      if (selectionRequest.options && selectionRequest.options.length > 0) {
        this.addSelectionMessage(selectionRequest.options, selectionRequest.serviceType || 'service');
      }
    });

    // Load ledger entries
    this.loadLedgerEntries();
    
    // Load initial wallet balance (show in header, not chat)
    // Balance will be updated via WebSocket events (ledger_entry_added, cashier_payment_processed, etc.)
    this.loadWalletBalance(false);
  }

  ngOnDestroy() {
    if (this.executionCheckInterval) {
      clearInterval(this.executionCheckInterval);
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
        
        const llmMessage: ChatMessage = {
          id: `llm-${Date.now()}`,
          type: 'assistant',
          content: llmResponse.message,
          timestamp: llmTimestamp,
          data: llmResponse.listings ? { listings: llmResponse.listings } : undefined
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
    // Filter events to only show user-facing ones (hide technical details)
    switch (event.type) {
      case 'llm_response':
        // Add LLM response as assistant message (filtered to show only user-facing content)
        // BUT ensure it comes AFTER user input
        if (event.data?.response?.message || event.data?.message) {
          const llmMessage = event.data?.response?.message || event.data?.message;
          // Only add if not already present
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
              data: (event.data?.response?.listings || event.data?.listings) ? { listings: event.data?.response?.listings || event.data?.listings } : undefined
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
            this.cdr.detectChanges();
          }
        }
        break;

      case 'user_selection_required':
        if (event.data?.options && event.data.options.length > 0) {
          this.addSelectionMessage(event.data.options, event.data.serviceType || 'service');
        }
        break;

      case 'user_decision_required':
        // Handle decision requests from WebSocket
        if (event.data) {
          console.log('💬 [WorkflowChat] Received user_decision_required event:', event.data);
          this.addDecisionMessage({
            prompt: event.data.prompt || 'Please make a decision:',
            options: event.data.options || [],
            executionId: event.data.executionId || event.data.workflowId,
            stepId: event.data.stepId,
            timeout: event.data.timeout || 30000,
            data: event.data,
            iGasCost: event.data.iGasCost || event.data.igas
          });
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
            // HARDCODED: Always show restaurant entries as completed
            const displayStatus = completedEntry.serviceType === 'restaurant' ? 'completed' : completedEntry.status;
            const statusEmoji = '✅'; // completed status
            const iGasCost = completedEntry.iGasCost !== undefined && completedEntry.iGasCost !== null 
              ? completedEntry.iGasCost 
              : (this.chatMessages[ledgerMessageIndex].data?.iGasCost || 0);
            
            this.chatMessages[ledgerMessageIndex] = {
              ...this.chatMessages[ledgerMessageIndex],
              content: `${statusEmoji} **Transaction ${displayStatus}**`,
              data: {
                ...this.chatMessages[ledgerMessageIndex].data,
                entry: { ...completedEntry, status: displayStatus },
                details: details,
                amount: completedEntry.amount,
                merchant: completedEntry.merchant,
                serviceType: completedEntry.serviceType,
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
      options: message.options
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
    // Find if there's already a decision message
    const existingDecision = this.chatMessages.find(m => m.showOptions && m.type === 'assistant');
    if (existingDecision && decisionRequest.options) {
      existingDecision.options = decisionRequest.options.map((opt: any) => ({
        value: opt.value,
        label: opt.label,
        data: opt
      }));
      existingDecision.content = decisionRequest.prompt || existingDecision.content;
      existingDecision.showOptions = true;
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
    this.addChatMessage({
      type: 'assistant',
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
      }
    });
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
    // Determine if this is a decision or selection
    const isDecision = message?.data?.isDecision || false;
    const executionId = message?.data?.executionId || this.activeExecution?.executionId;
    const stepId = message?.data?.stepId || this.activeExecution?.currentStep;

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
      // Use submitDecision for both decisions and selections
      this.flowWiseService.submitDecision(
        executionId, 
        option.value || option.label || 'selected',
        stepId
      ).then(() => {
        console.log('💬 [WorkflowChat] Decision/selection submitted successfully');
        // NOTE: Do NOT add confirmation message here - wait for workflow_completed or ledger_booking_completed event
        // The confirmation will be added when the workflow actually completes payment processing
      }).catch((error) => {
        console.error('💬 [WorkflowChat] Failed to submit decision/selection:', error);
        // Show error message
        this.addChatMessage({
          type: 'system',
          content: '❌ Failed to process your choice. Please try again.',
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
    if (confirm('Are you sure you want to clear the chat? This will remove all messages but keep workflow executions running.')) {
      this.resetChat();
    }
  }

  // Public method to reset chat (called from app component on send)
  public resetChat() {
    // Only clear chat messages - DO NOT reset active execution or ledger tracking
    // This allows workflows to continue running in the background
    this.chatMessages = [];
    
    // Keep displayedLedgerEntryIds to prevent duplicate ledger entries from reappearing
    // Keep activeExecution to allow workflows to continue
    
    this.cdr.detectChanges();
    
    // Don't add any system message - let workflow messages appear naturally from WebSocket events
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

    // Create a formatted ledger message
    const details = this.formatBookingDetails(entry);
    // HARDCODED: Always show restaurant entries as completed
    const displayStatus = entry.serviceType === 'restaurant' ? 'completed' : entry.status;
    const statusEmoji = displayStatus === 'completed' ? '✅' : 
                        displayStatus === 'processed' ? '⏳' : 
                        displayStatus === 'pending' ? '⏱️' : '❌';

    // Extract iGasCost - check multiple possible locations
    const iGasCost = entry.iGasCost !== undefined && entry.iGasCost !== null 
      ? entry.iGasCost 
      : (entry.entry?.iGasCost !== undefined && entry.entry?.iGasCost !== null 
          ? entry.entry.iGasCost 
          : 0);

    console.log('💬 [WorkflowChat] Creating ledger message with iGasCost:', {
      entryId: entry.entryId,
      iGasCost: iGasCost,
      entryIGasCost: entry.iGasCost,
      entryEntryIGasCost: entry.entry?.iGasCost
    });

    // Log the full entry to debug
    console.log('💬 [WorkflowChat] Full ledger entry:', JSON.stringify(entry, null, 2));

    this.addChatMessage({
      type: 'ledger',
      content: `${statusEmoji} **Transaction ${displayStatus}**`,
      timestamp: entry.timestamp || Date.now(),
      data: {
        entry: { ...entry, status: displayStatus }, // Use displayStatus for UI
        details: details,
        amount: entry.amount,
        merchant: entry.merchant,
        serviceType: entry.serviceType,
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

