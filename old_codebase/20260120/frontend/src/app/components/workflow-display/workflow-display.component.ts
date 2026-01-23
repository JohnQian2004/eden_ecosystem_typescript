import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FlowWiseService, FlowWiseWorkflow, WorkflowStep, WorkflowExecution, UserDecisionRequest } from '../../services/flowwise.service';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';
import { MovieTheaterComponent } from '../../movie-theater/movie-theater.component';
import { getApiBaseUrl } from '../../services/api-base';

@Component({
  selector: 'app-workflow-display',
  templateUrl: './workflow-display.component.html',
  styleUrls: ['./workflow-display.component.scss']
})
export class WorkflowDisplayComponent implements OnInit, OnDestroy {
  // Support any workflow type dynamically
  workflows: Map<string, FlowWiseWorkflow> = new Map();
  movieWorkflow: FlowWiseWorkflow | null = null; // Keep for backward compatibility
  dexWorkflow: FlowWiseWorkflow | null = null; // Keep for backward compatibility
  isLoading: boolean = false;
  selectedWorkflow: string | null = null; // Changed from 'movie' | 'dex' to string

  // Active workflow execution
  activeExecution: WorkflowExecution | null = null;
  currentStep: WorkflowStep | null = null;
  pendingDecision: UserDecisionRequest | null = null;
  showDecisionPrompt: boolean = false;

  // Selection support
  pendingSelection: any = null;
  showSelectionPrompt: boolean = false;

  // Current workflow (property instead of getter to avoid infinite loops)
  currentWorkflow: FlowWiseWorkflow | null = null;

  // UI State
  workflowSteps: WorkflowStep[] = [];
  debugWorkflowSteps: WorkflowStep[] = []; // Property instead of getter
  completedSteps: string[] = [];
  currentStepIndex: number = 0;

  // LLM Response State
  llmResponses: any[] = [];
  latestLlmResponse: any = null;
  iGasCost: number | null = null;

  // Movie theater state
  selectedListing: any = null;
  
  // Video player modal state
  showVideoModal: boolean = false;
  modalVideoUrl: string | null = null;
  modalMovieTitle: string | null = null;

  // Cache for step statuses to avoid repeated calculations
  private stepStatusCache: Map<string, string> = new Map();

  // Scope UI to the most recent execution so "new chat" always clears the console output
  private activeExecutionId: string | null = null;
  private onWorkflowStartedEvt: any;
  private onChatResetEvt: any;
  private executionCheckInterval: any;

  // Computed properties for template bindings (avoiding filter() in templates)
  get processingCount(): number {
    return this.llmResponses.filter(r => r.type === 'start').length;
  }

  get responseCount(): number {
    return this.llmResponses.filter(r => r.type === 'response').length;
  }

  // Update debug workflow steps when current workflow changes
  private updateDebugWorkflowSteps(): void {
    this.debugWorkflowSteps = this.currentWorkflow?.steps || [];
  }
  
  // Update current workflow based on active execution or selected workflow
  private updateCurrentWorkflow(): void {
    // Priority 1: Get workflow from active execution
    if (this.activeExecution) {
      const workflow = this.flowWiseService.getWorkflow(this.activeExecution.serviceType);
      if (workflow) {
        this.currentWorkflow = workflow;
        this.updateDebugWorkflowSteps();
        return;
      }
    }
    
    // Priority 2: Get workflow from selected workflow
    if (this.selectedWorkflow) {
      const workflow = this.flowWiseService.getWorkflow(this.selectedWorkflow);
      if (workflow) {
        this.currentWorkflow = workflow;
        this.updateDebugWorkflowSteps();
        return;
      }
    }
    
    // Priority 3: Fallback to legacy properties
    const legacyWorkflow = this.movieWorkflow || this.dexWorkflow;
    if (legacyWorkflow) {
      this.currentWorkflow = legacyWorkflow;
      this.updateDebugWorkflowSteps();
      return;
    }
    
    this.currentWorkflow = null;
    this.updateDebugWorkflowSteps();
  }

  // TrackBy function for ngFor
  trackByStepId(index: number, step: any): string {
    return step.id;
  }

  private readonly LLM_HISTORY_KEY = 'eden_llm_history';
  private readonly MAX_HISTORY_ITEMS = 50; // Keep last 50 responses

  public apiUrl = getApiBaseUrl();

  constructor(
    private http: HttpClient,
    private flowWiseService: FlowWiseService,
    private webSocketService: WebSocketService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    console.log('🎬 [WorkflowDisplay] Component initialized');
    console.log('🔗 [WorkflowDisplay] API URL:', this.apiUrl);

    // DO NOT auto-load workflows on component init
    // Workflows should only be loaded when a service type is selected on Main Street
    // this.loadWorkflows(); // REMOVED: Only load workflows when service type is clicked
    
    this.loadLlmHistory();
    
    // CRITICAL: Check for active execution immediately on init (not just in interval)
    // This ensures the component shows data if an execution is already running
    const initialExecution = this.flowWiseService.getLatestActiveExecution();
    if (initialExecution) {
      console.log('🔄 [WorkflowDisplay] Found active execution on init:', initialExecution.executionId);
      this.activeExecutionId = String(initialExecution.executionId);
      this.activeExecution = initialExecution;
      this.selectedWorkflow = initialExecution.serviceType;
      
      // Get the workflow for this execution
      const workflow = this.flowWiseService.getWorkflow(initialExecution.serviceType);
      if (workflow) {
        console.log(`✅ [WorkflowDisplay] Found workflow for ${initialExecution.serviceType}: ${workflow.name}`);
        if (initialExecution.serviceType === 'movie') {
          this.movieWorkflow = workflow;
        } else if (initialExecution.serviceType === 'dex') {
          this.dexWorkflow = workflow;
        }
        this.currentWorkflow = workflow;
        this.updateDebugWorkflowSteps();
        this.initializeWorkflowDisplay(initialExecution.serviceType);
        this.processExecutionMessages(initialExecution);
        this.cdr.detectChanges();
      } else {
        console.warn(`⚠️ [WorkflowDisplay] Workflow not found for ${initialExecution.serviceType}, attempting to load...`);
        this.flowWiseService.loadWorkflowIfNeeded(initialExecution.serviceType);
      }
    } else {
      console.log('🔄 [WorkflowDisplay] No active execution found on init');
    }

    // Instant reset when AppComponent starts a new workflow (new chat)
    this.onWorkflowStartedEvt = (e: any) => {
      const id = e?.detail?.executionId ? String(e.detail.executionId) : '';
      if (!id) return;
      if (id !== this.activeExecutionId) {
        this.resetForNewExecution(id);
      }
    };
    window.addEventListener('eden_workflow_started', this.onWorkflowStartedEvt as any);

    // Clear immediately on "new chat" (before executionId exists)
    this.onChatResetEvt = () => {
      this.resetForNewExecution('__pending__');
    };
    window.addEventListener('eden_chat_reset', this.onChatResetEvt as any);

    // Listen for workflow decision requests
    // CRITICAL: Only handle decisions if this component is in the active tab
    // This prevents conflicts when both workflow-display and workflow-chat-display are active
    this.flowWiseService.getDecisionRequests().subscribe((decisionRequest: UserDecisionRequest) => {
      // Check if this component is visible (in active tab)
      // workflow-display is only visible when activeTab === 'workflow' and not in user mode
      const isComponentVisible = this.isComponentInActiveTab();
      
      if (!isComponentVisible) {
        console.log('🤔 [WorkflowDisplay] Decision request received but component is not in active tab - ignoring');
        console.log('🤔 [WorkflowDisplay] This decision will be handled by workflow-chat-display instead');
        return; // Don't handle decision if component is not visible
      }
      
      console.log('🤔 [WorkflowDisplay] Decision required:', decisionRequest);
      console.log('🤔 [WorkflowDisplay] Decision request options:', decisionRequest.options);
      console.log('🤔 [WorkflowDisplay] Options count:', decisionRequest.options?.length || 0);
      
      // CRITICAL: If videoUrl is missing but stepId is view_movie, try to get it from active execution
      if (decisionRequest.stepId === 'view_movie' && !decisionRequest.videoUrl && this.activeExecution) {
        const context = this.activeExecution.context || {};
        const videoUrl = context['selectedListing']?.['videoUrl'] || 
                        context['selectedListing2']?.['videoUrl'] ||
                        context['videoUrl'] || '';
        const movieTitle = context['selectedListing']?.['movieTitle'] || 
                          context['selectedListing2']?.['movieTitle'] ||
                          context['movieTitle'] || '';
        
        console.log('🎬 [WorkflowDisplay] Extracting videoUrl from decisionRequest for view_movie:', { videoUrl, movieTitle });
        
        if (videoUrl) {
          decisionRequest.videoUrl = videoUrl;
          decisionRequest.movieTitle = movieTitle || decisionRequest.movieTitle;
          console.log('🎬 [WorkflowDisplay] Set videoUrl in decisionRequest, opening modal...');
          // Open video modal immediately when decisionRequest has videoUrl
          this.openVideoModal(videoUrl, movieTitle);
        } else {
          console.warn('🎬 [WorkflowDisplay] No videoUrl found in execution context for view_movie step');
        }
      } else if (decisionRequest.stepId === 'view_movie' && decisionRequest.videoUrl) {
        // If videoUrl is already in decisionRequest, open modal
        console.log('🎬 [WorkflowDisplay] decisionRequest already has videoUrl, opening modal...');
        this.openVideoModal(decisionRequest.videoUrl, decisionRequest.movieTitle);
      }
      
      // CRITICAL: Clear any pending selection when a decision is required
      if (this.showSelectionPrompt || this.pendingSelection) {
        this.showSelectionPrompt = false;
        this.pendingSelection = null;
      }
      
      this.pendingDecision = decisionRequest;
      this.showDecisionPrompt = true;
      
      console.log('🤔 [WorkflowDisplay] Set pendingDecision and showDecisionPrompt=true');
      console.log('🤔 [WorkflowDisplay] pendingDecision:', this.pendingDecision);
      console.log('🤔 [WorkflowDisplay] showDecisionPrompt:', this.showDecisionPrompt);
      
      // Force change detection to update UI immediately
      this.cdr.detectChanges();
    });

    // Listen for selection requests (from HTTP responses AND WebSocket)
    console.log('🎬 [WorkflowDisplay] Subscribing to selection requests...');
    this.flowWiseService.getSelectionRequests().subscribe({
      next: (selectionEvent: any) => {
        console.log('🎬 [WorkflowDisplay] ========================================');
        console.log('🎬 [WorkflowDisplay] ✅ Selection request received from FlowWiseService Subject');
        console.log('🎬 [WorkflowDisplay] Event type:', selectionEvent?.type);
        console.log('🎬 [WorkflowDisplay] Full event:', JSON.stringify(selectionEvent, null, 2));
        console.log('🎬 [WorkflowDisplay] Event data:', selectionEvent?.data);
        console.log('🎬 [WorkflowDisplay] Event data.options:', selectionEvent?.data?.options);
        console.log('🎬 [WorkflowDisplay] Event data.options length:', selectionEvent?.data?.options?.length || 0);
        // Handle it the same way as WebSocket events
        if (selectionEvent) {
          this.handleWebSocketEvent(selectionEvent as SimulatorEvent);
        } else {
          console.warn('⚠️ [WorkflowDisplay] Received null/undefined selection event');
        }
        console.log('🎬 [WorkflowDisplay] ========================================');
      },
      error: (error) => {
        console.error('❌ [WorkflowDisplay] Error in selection request subscription:', error);
      },
      complete: () => {
        console.warn('⚠️ [WorkflowDisplay] Selection request subscription completed (unexpected)');
      }
    });
    console.log('🎬 [WorkflowDisplay] ✅ Subscribed to selection requests');

    // SIMPLIFIED APPROACH: Check for active executions periodically (like workflow-chat-display)
    // This is simpler and more reliable than complex state management
    this.executionCheckInterval = setInterval(() => {
      const latestExecution = this.flowWiseService.getLatestActiveExecution();
      
      // Only update if execution actually changed
      if (latestExecution && latestExecution.executionId !== this.activeExecution?.executionId) {
        console.log(`🔄 [WorkflowDisplay] NEW Active execution detected: ${latestExecution.serviceType} (${latestExecution.executionId})`);
        
        // Set active execution
        this.activeExecutionId = String(latestExecution.executionId);
        this.activeExecution = latestExecution;
        this.selectedWorkflow = latestExecution.serviceType;
        
        // Reset UI for new execution
        this.resetForNewExecution(String(latestExecution.executionId));
        
        // Load and set workflow
        const workflow = this.flowWiseService.getWorkflow(latestExecution.serviceType);
        if (workflow) {
          this.currentWorkflow = workflow;
          this.updateDebugWorkflowSteps();
          this.initializeWorkflowDisplay(latestExecution.serviceType);
          
          // Process execution messages to populate UI
          this.processExecutionMessages(latestExecution);
          this.updateCurrentStep();
          this.cdr.detectChanges();
        } else {
          // Try to load workflow if not in cache
          this.flowWiseService.loadWorkflowIfNeeded(latestExecution.serviceType);
          // Workflow will be loaded asynchronously, check again after a delay
          setTimeout(() => {
            const w = this.flowWiseService.getWorkflow(latestExecution.serviceType);
            if (w) {
              this.currentWorkflow = w;
              this.updateDebugWorkflowSteps();
              this.initializeWorkflowDisplay(latestExecution.serviceType);
              this.processExecutionMessages(latestExecution);
              this.updateCurrentStep();
              this.cdr.detectChanges();
            }
          });
        }
      } else if (!latestExecution && this.activeExecution) {
        // Execution completed
        console.log(`🔄 [WorkflowDisplay] Active execution completed`);
        this.activeExecution = null;
        this.activeExecutionId = null;
        this.updateCurrentWorkflow();
        this.updateDebugWorkflowSteps();
        this.cdr.detectChanges();
      }
    }, 1000);

    // Listen for WebSocket events (LLM responses, etc.)
    console.log('📡 [WorkflowDisplay] Subscribing to WebSocket events...');
    this.webSocketService.events$.subscribe((event: SimulatorEvent) => {
      // CRITICAL: Filter out ledger/settlement events BEFORE any processing or logging
      // This prevents them from interfering with video player display
      // NOTE: cashier_payment_processed is NOT filtered here - we need it to open video modal
      const ledgerEventTypes = [
        'root_ca_settlement_start',
        'root_ca_entry_validated',
        'ledger_entry_settled',
        'root_ca_ledger_settlement_complete',
        'ledger_entry_created',
        'ledger_entry_updated',
        'payment_processed',
        'wallet_updated',
        'error' // System errors are handled elsewhere
      ];
      
      // Silently ignore ledger events - they're handled by ledger-display component
      if (ledgerEventTypes.includes(event.type)) {
        return; // Don't process or log ledger events
      }
      
      console.log('📡 [WorkflowDisplay] WebSocket event received:', event.type);
      if (event.type === 'user_selection_required') {
        console.log('🎬 [WorkflowDisplay] ⚡ DIRECT WEBSOCKET SELECTION EVENT');
        console.log('🎬 [WorkflowDisplay] Event:', JSON.stringify(event, null, 2));
      }
      this.handleWebSocketEvent(event);
    });
    console.log('📡 [WorkflowDisplay] ✅ Subscribed to WebSocket events');
  }

  ngOnDestroy() {
    // Clean up interval
    if (this.executionCheckInterval) {
      clearInterval(this.executionCheckInterval);
    }
    if (this.onWorkflowStartedEvt) {
      window.removeEventListener('eden_workflow_started', this.onWorkflowStartedEvt as any);
    }
    if (this.onChatResetEvt) {
      window.removeEventListener('eden_chat_reset', this.onChatResetEvt as any);
    }
    
    // Clean up any active executions
    if (this.activeExecution) {
      console.log('🧹 [WorkflowDisplay] Cleaning up active execution');
    }
  }

  loadWorkflows() {
    console.log('📡 [WorkflowDisplay] Starting workflow loading...');
    this.isLoading = true;

    // Load movie workflow
    this.http.get<{ success: boolean; flowwiseWorkflow: FlowWiseWorkflow; error?: string }>(`${this.apiUrl}/api/workflow/movie`)
      .subscribe({
        next: (data) => {
          console.log('🔄 [WorkflowDisplay] Movie workflow response:', data);
          if (data.success && data.flowwiseWorkflow) {
            this.movieWorkflow = data.flowwiseWorkflow;
            console.log('✅ [WorkflowDisplay] Loaded movie workflow:', data.flowwiseWorkflow.name);
            console.log('✅ [WorkflowDisplay] Movie workflow has', data.flowwiseWorkflow.steps?.length || 0, 'steps');
            if (data.flowwiseWorkflow.steps) {
              const watchStep = data.flowwiseWorkflow.steps.find(s => s.id === 'watch_movie');
              console.log('✅ [WorkflowDisplay] Watch movie step found:', !!watchStep);
              if (watchStep) {
                console.log('✅ [WorkflowDisplay] Watch movie step:', watchStep.name);
              }
            }
            if (!this.selectedWorkflow) {
              this.selectedWorkflow = 'movie';
              this.initializeWorkflowDisplay('movie');
            }
            // Additional debugging for template rendering
            setTimeout(() => {
              console.log('🔍 [WorkflowDisplay] Template check - movieWorkflow exists:', !!this.movieWorkflow);
              if (this.movieWorkflow) {
                console.log('🔍 [WorkflowDisplay] Template check - steps count:', this.movieWorkflow.steps?.length || 0);
                const watchStep = this.movieWorkflow.steps?.find(s => s.id === 'watch_movie');
                console.log('🔍 [WorkflowDisplay] Template check - watch step found:', !!watchStep);
              }
            }, 100);
          } else {
            console.error('❌ [WorkflowDisplay] Movie workflow API returned success=false:', data.error);
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('❌ [WorkflowDisplay] Failed to load movie workflow:', err);
          console.error('❌ [WorkflowDisplay] Error details:', err.status, err.statusText, err.url);
          this.isLoading = false;
        }
      });

    // Load DEX workflow
    this.http.get<{ success: boolean; flowwiseWorkflow: FlowWiseWorkflow; error?: string }>(`${this.apiUrl}/api/workflow/dex`)
      .subscribe({
        next: (data) => {
          console.log('🔄 [WorkflowDisplay] DEX workflow response:', data);
          if (data.success && data.flowwiseWorkflow) {
            this.dexWorkflow = data.flowwiseWorkflow;
            console.log('✅ [WorkflowDisplay] Loaded DEX workflow:', data.flowwiseWorkflow.name);
          } else {
            console.error('❌ [WorkflowDisplay] DEX workflow API returned success=false:', data.error);
          }
        },
        error: (err) => {
          console.error('❌ [WorkflowDisplay] Failed to load DEX workflow:', err);
          console.error('❌ [WorkflowDisplay] DEX Error details:', err.status, err.statusText, err.url);
        }
      });
  }

  selectWorkflow(workflowType: string) {
    this.selectedWorkflow = workflowType;
    this.initializeWorkflowDisplay(workflowType);
  }

  private initializeWorkflowDisplay(workflowType: string) {
    // Get workflow dynamically from FlowWiseService
    let workflow = this.flowWiseService.getWorkflow(workflowType);
    
    // Fallback to legacy properties for backward compatibility
    if (!workflow) {
      if (workflowType === 'movie') {
        workflow = this.movieWorkflow;
      } else if (workflowType === 'dex') {
        workflow = this.dexWorkflow;
      }
    }
    
    if (!workflow) {
      console.log(`🔄 [WorkflowDisplay] initializeWorkflowDisplay: No workflow found for type: ${workflowType}`);
      console.log(`🔍 [WorkflowDisplay] Available workflows in service: ${Array.from(this.flowWiseService['workflows']?.keys() || []).join(', ')}`);
      return;
    }
    
    console.log(`✅ [WorkflowDisplay] Initializing workflow display for ${workflowType}: ${workflow.name}`);

    // TypeScript guard: ensure workflow is not null and has required properties
    if (!workflow || !workflow.steps || !workflow.initialStep) {
      console.error(`❌ [WorkflowDisplay] Workflow ${workflowType} is invalid or missing required properties`);
      return;
    }

    // At this point, TypeScript knows workflow is not null, but we'll use a local const for clarity
    const validWorkflow = workflow;
    const initialStepId = validWorkflow.initialStep;

    console.log('🔄 [WorkflowDisplay] initializeWorkflowDisplay:', workflowType, 'initialStep:', initialStepId);
    console.log('🔄 [WorkflowDisplay] Workflow steps count:', validWorkflow.steps.length);
    console.log('🔄 [WorkflowDisplay] First step ID:', validWorkflow.steps[0]?.id);

    this.workflowSteps = validWorkflow.steps;
    this.completedSteps = [];
    this.currentStepIndex = 0;
    this.currentStep = validWorkflow.steps.find(step => step.id === initialStepId) || null;

    console.log('🔄 [WorkflowDisplay] initializeWorkflowDisplay - step found:', !!this.currentStep);
    console.log('🔄 [WorkflowDisplay] initializeWorkflowDisplay set currentStep to:', this.currentStep?.name || 'null');
    this.activeExecution = null;
    this.pendingDecision = null;
    this.showDecisionPrompt = false;
    this.clearStatusCache(); // Clear cache when workflow is initialized
  }

  startWorkflow() {
    if (!this.selectedWorkflow) return;

    console.log(`🚀 [WorkflowDisplay] Starting ${this.selectedWorkflow} workflow`);

    // Start the workflow using FlowWise service with mock data to prevent errors
    this.activeExecution = this.flowWiseService.startWorkflow(
      this.selectedWorkflow,
      {
        input: 'Demo input from UI',
        email: 'demo@eden.com',
        user: { email: 'demo@eden.com', id: 'demo@eden.com' },
        llmResponse: {
          selectedListing: {
            movieTitle: 'Demo Movie',
            showtime: '7:00 PM',
            price: 15.99,
            providerId: 'amc-001',
            providerName: 'AMC Theatres',
            location: 'Demo Location'
          },
          iGasCost: 0.004450
        },
        selectedListing: {
          movieTitle: 'Demo Movie',
          showtime: '7:00 PM',
          price: 15.99,
          providerId: 'amc-001',
          providerName: 'AMC Theatres',
          location: 'Demo Location'
        },
        moviePrice: 15.99,
        totalCost: 16.004450,
        paymentSuccess: true,
        userDecision: 'YES'
      }
    );

    console.log('🔄 [WorkflowDisplay] Active execution:', this.activeExecution);

    if (this.activeExecution) {
      this.updateCurrentStep();
    } else {
      console.error('❌ [WorkflowDisplay] Failed to start workflow - no execution returned');
    }
  }

  async executeStepManually(step: WorkflowStep) {
    if (!this.activeExecution) {
      console.error('❌ [WorkflowDisplay] No active execution to execute step on');
      alert('Please start the workflow first before executing individual steps.');
      return;
    }

    console.log(`▶️ [WorkflowDisplay] Manually executing step: ${step.name} (${step.id})`);

    try {
      // Call the FlowWise service to execute the step manually
      const success = await this.flowWiseService.executeStepManually(
        this.activeExecution.executionId,
        step.id,
        this.activeExecution.context
      );

      if (success) {
        // Update the UI to show this step as current
        this.currentStep = step;
        this.currentStepIndex = this.workflowSteps.findIndex(s => s.id === step.id);

        // Add to workflow messages and history
        if (this.activeExecution) {
          this.activeExecution.history.push({
            step: step.id,
            timestamp: Date.now(),
            data: { manualExecution: true }
          });
        }

        this.updateCurrentStep();

        // Show success feedback
        console.log(`✅ [WorkflowDisplay] Step "${step.name}" executed successfully`);
      } else {
        alert(`Failed to execute step "${step.name}". Check console for details.`);
      }
    } catch (error) {
      console.error('❌ [WorkflowDisplay] Error executing step manually:', error);
      alert(`Error executing step "${step.name}": ${error}`);
    }
  }

  private updateCurrentStep(): void {
    console.log('🔄 [WorkflowDisplay] updateCurrentStep called - activeExecution:', !!this.activeExecution, 'selectedWorkflow:', this.selectedWorkflow);
    console.log('🔄 [WorkflowDisplay] currentWorkflow exists:', !!this.currentWorkflow);

    // CRITICAL: Use currentWorkflow instead of legacy properties
    const workflow = this.currentWorkflow;
    if (!workflow) {
      console.log('🔄 [WorkflowDisplay] No currentWorkflow, cannot update current step');
      // Fallback to legacy properties for backward compatibility
      if (this.selectedWorkflow === 'movie' && this.movieWorkflow) {
        this.currentWorkflow = this.movieWorkflow;
        return this.updateCurrentStep(); // Recursive call with workflow now set
      } else if (this.selectedWorkflow === 'dex' && this.dexWorkflow) {
        this.currentWorkflow = this.dexWorkflow;
        return this.updateCurrentStep(); // Recursive call with workflow now set
      }
      return;
    }

    console.log('🔄 [WorkflowDisplay] Using workflow:', workflow.name, 'with initialStep:', workflow.initialStep);

    let newCurrentStep: WorkflowStep | null = null;

    if (this.activeExecution) {
      // If there's an active execution, use its current step
      const executionStepId = this.activeExecution.currentStep;
      console.log('🔄 [WorkflowDisplay] Active execution currentStep:', executionStepId);
      newCurrentStep = workflow.steps.find(step => step.id === executionStepId) || null;
      console.log('🔄 [WorkflowDisplay] Active execution found, setting currentStep to:', newCurrentStep?.name || 'null', newCurrentStep?.id || 'null');
    } else {
      // If no active execution, show the initial step as current
      newCurrentStep = workflow.steps.find(step => step.id === workflow.initialStep) || null;
      console.log('🔄 [WorkflowDisplay] No active execution, setting currentStep to initial step:', newCurrentStep?.name || 'null');
    }

    this.currentStep = newCurrentStep;
    console.log('🔄 [WorkflowDisplay] FINAL currentStep set to:', this.currentStep?.name || 'null', this.currentStep?.id || 'null');

    // Update completed steps from execution history
    if (this.activeExecution) {
      this.completedSteps = this.activeExecution.history.map(h => h.step);
      // Also mark any step before current step as completed
      const executionCurrentStepId = this.activeExecution.currentStep;
      const currentStepIndex = workflow.steps.findIndex(step => step.id === executionCurrentStepId);
      if (currentStepIndex > 0) {
        for (let i = 0; i < currentStepIndex; i++) {
          const stepId = workflow.steps[i].id;
          if (!this.completedSteps.includes(stepId)) {
            this.completedSteps.push(stepId);
          }
        }
      }
      console.log('🔄 [WorkflowDisplay] Updated completed steps from execution:', this.completedSteps);
    }

    // Find current step index - use activeExecution.currentStep if available, otherwise use currentStep
    if (this.activeExecution && this.activeExecution.currentStep) {
      this.currentStepIndex = workflow.steps.findIndex(step => step.id === this.activeExecution?.currentStep);
      // If not found, fall back to currentStep
      if (this.currentStepIndex === -1 && this.currentStep) {
        this.currentStepIndex = workflow.steps.findIndex(step => step.id === this.currentStep?.id);
      }
    } else if (this.currentStep) {
      this.currentStepIndex = workflow.steps.findIndex(step => step.id === this.currentStep?.id);
    }
    
    // Ensure index is at least 0
    if (this.currentStepIndex < 0) {
      this.currentStepIndex = 0;
    }
    
    // CRITICAL: Check if this is the final step and add extensive debug logging
    const isFinalStep = this.currentStepIndex >= workflow.steps.length - 1;
    const totalSteps = workflow.steps.length;
    const lastStepId = workflow.steps[totalSteps - 1]?.id;
    const isLastStepById = this.currentStep?.id === lastStepId;
    
    console.log('🔄 [WorkflowDisplay] Step index updated:', this.currentStepIndex + 1, 'of', totalSteps, 'currentStep:', this.currentStep?.name, 'activeExecution.currentStep:', this.activeExecution?.currentStep);
    console.log('🏁 [WorkflowDisplay] ========================================');
    console.log('🏁 [WorkflowDisplay] FINAL STEP DEBUG ANALYSIS');
    console.log('🏁 [WorkflowDisplay] ========================================');
    console.log('🏁 [WorkflowDisplay] Is Final Step (by index):', isFinalStep);
    console.log('🏁 [WorkflowDisplay] Is Last Step (by ID):', isLastStepById);
    console.log('🏁 [WorkflowDisplay] Current Step Index:', this.currentStepIndex);
    console.log('🏁 [WorkflowDisplay] Total Steps:', totalSteps);
    console.log('🏁 [WorkflowDisplay] Last Step ID:', lastStepId);
    console.log('🏁 [WorkflowDisplay] Current Step ID:', this.currentStep?.id);
    console.log('🏁 [WorkflowDisplay] Current Step Name:', this.currentStep?.name);
    console.log('🏁 [WorkflowDisplay] Current Step Type:', this.currentStep?.type);
    console.log('🏁 [WorkflowDisplay] Current Step Component:', this.currentStep?.component);
    console.log('🏁 [WorkflowDisplay] Active Execution exists:', !!this.activeExecution);
    if (this.activeExecution) {
      console.log('🏁 [WorkflowDisplay] Active Execution ID:', this.activeExecution.executionId);
      console.log('🏁 [WorkflowDisplay] Active Execution currentStep:', this.activeExecution.currentStep);
      console.log('🏁 [WorkflowDisplay] Active Execution history length:', this.activeExecution.history?.length || 0);
      console.log('🏁 [WorkflowDisplay] Active Execution history steps:', this.activeExecution.history?.map(h => h.step) || []);
      console.log('🏁 [WorkflowDisplay] Active Execution context keys:', Object.keys(this.activeExecution.context || {}));
    }
    console.log('🏁 [WorkflowDisplay] Completed Steps:', this.completedSteps);
    console.log('🏁 [WorkflowDisplay] Completed Steps Count:', this.completedSteps.length);
    console.log('🏁 [WorkflowDisplay] All Workflow Step IDs:', workflow.steps.map(s => s.id));
    console.log('🏁 [WorkflowDisplay] All Workflow Step Names:', workflow.steps.map(s => s.name));
    console.log('🏁 [WorkflowDisplay] Pending Decision exists:', !!this.pendingDecision);
    console.log('🏁 [WorkflowDisplay] Show Decision Prompt:', this.showDecisionPrompt);
    console.log('🏁 [WorkflowDisplay] Pending Selection exists:', !!this.pendingSelection);
    console.log('🏁 [WorkflowDisplay] Show Selection Prompt:', this.showSelectionPrompt);
    console.log('🏁 [WorkflowDisplay] Selected Listing exists:', !!this.selectedListing);
    if (this.selectedListing) {
      console.log('🏁 [WorkflowDisplay] Selected Listing videoUrl:', this.selectedListing.videoUrl);
      console.log('🏁 [WorkflowDisplay] Selected Listing movieTitle:', this.selectedListing.movieTitle);
    }
    console.log('🏁 [WorkflowDisplay] LLM Responses Count:', this.llmResponses.length);
    console.log('🏁 [WorkflowDisplay] Current Workflow Name:', this.currentWorkflow?.name);
    console.log('🏁 [WorkflowDisplay] Debug Workflow Steps Count:', this.debugWorkflowSteps.length);
    console.log('🏁 [WorkflowDisplay] ========================================');
    
    // Clear status cache when step changes
    this.clearStatusCache();
    
    // Force change detection to update UI
    this.cdr.detectChanges();

    // Special handling for Eden Chat input step
    if (this.currentStep?.component === 'eden_chat' && this.currentStep?.type === 'input') {
      console.log('🎬 [WorkflowDisplay] Eden Chat input step active - user should use main chat interface');
      // This step is handled by the main chat interface, not this component
    }
  }

  async submitDecision(decision: string) {
    if (!this.pendingDecision) {
      console.error('❌ [WorkflowDisplay] No pending decision to submit');
      return;
    }

    console.log(`✅ [WorkflowDisplay] ========================================`);
    console.log(`✅ [WorkflowDisplay] SUBMITTING DECISION`);
    console.log(`✅ [WorkflowDisplay] Decision value: ${decision}`);
    console.log(`✅ [WorkflowDisplay] Execution ID: ${this.pendingDecision.executionId}`);
    console.log(`✅ [WorkflowDisplay] Step ID: ${this.pendingDecision.stepId}`);
    console.log(`✅ [WorkflowDisplay] Prompt: ${this.pendingDecision.prompt}`);
    console.log(`✅ [WorkflowDisplay] Available options:`, this.pendingDecision.options);
    console.log(`✅ [WorkflowDisplay] Current workflow step: ${this.activeExecution?.currentStep}`);
    console.log(`✅ [WorkflowDisplay] ========================================`);

    try {
      const submitted = await this.flowWiseService.submitDecision(this.pendingDecision.executionId, decision, this.pendingDecision.stepId);

      if (submitted) {
        console.log(`✅ [WorkflowDisplay] Decision submitted successfully, clearing prompt`);
        this.showDecisionPrompt = false;
        this.pendingDecision = null;
        // Wait a bit before updating step to allow backend to process
        setTimeout(() => {
          this.updateCurrentStep();
        }, 500);
      } else {
        console.error('❌ [WorkflowDisplay] Failed to submit decision - service returned false');
        alert('Failed to submit decision. Please try again.');
      }
    } catch (error: any) {
      console.error('❌ [WorkflowDisplay] Error submitting decision:', error);
      console.error('❌ [WorkflowDisplay] Error message:', error.message);
      console.error('❌ [WorkflowDisplay] Error stack:', error.stack);
      alert(`Failed to submit decision: ${error.message || 'Unknown error'}. Please try again.`);
    }
  }

  getVideoUrl(videoUrl: string | undefined): string {
    if (!videoUrl) return '';
    // Ensure the video URL is absolute
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

  // Video event handlers to help debug and fix Windows player issues
  onVideoLoadStart(event: Event, videoUrl?: string): void {
    const video = event.target as HTMLVideoElement;
    console.log('🎬 [WorkflowDisplay] Video load started:', {
      videoUrl: videoUrl,
      src: video.src,
      currentSrc: video.currentSrc,
      readyState: video.readyState
    });
    // Force reload if src doesn't match (Windows player fix)
    if (videoUrl) {
      const expectedSrc = this.getVideoUrl(videoUrl);
      if (video.src !== expectedSrc) {
        console.log('🎬 [WorkflowDisplay] Video src mismatch detected, forcing reload...', {
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
    console.log('🎬 [WorkflowDisplay] Video data loaded:', {
      videoUrl: videoUrl,
      src: video.src,
      currentSrc: video.currentSrc,
      readyState: video.readyState,
      duration: video.duration
    });
  }

  onVideoError(event: Event, videoUrl?: string): void {
    const video = event.target as HTMLVideoElement;
    console.error('🎬 [WorkflowDisplay] Video error:', {
      videoUrl: videoUrl,
      src: video.src,
      currentSrc: video.currentSrc,
      error: video.error,
      networkState: video.networkState,
      readyState: video.readyState
    });
    // Try to reload the video (Windows player fix)
    if (videoUrl) {
      console.log('🎬 [WorkflowDisplay] Attempting to reload video...');
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

  getCurrentWorkflow(): FlowWiseWorkflow | null {
    if (this.selectedWorkflow === 'movie') {
      return this.movieWorkflow;
    } else if (this.selectedWorkflow === 'dex') {
      return this.dexWorkflow;
    }
    return null;
  }

  getStepTypeClass(stepType: string): string {
    switch (stepType) {
      case 'input': return 'badge bg-primary';
      case 'process': return 'badge bg-info';
      case 'output': return 'badge bg-success';
      case 'decision': return 'badge bg-warning';
      case 'error': return 'badge bg-danger';
      default: return 'badge bg-secondary';
    }
  }

  getStepIcon(stepType: string): string {
    switch (stepType) {
      case 'input': return '📥';
      case 'process': return '⚙️';
      case 'output': return '📤';
      case 'decision': return '🤔';
      case 'error': return '❌';
      default: return '📋';
    }
  }

  getStepStatus(stepId: string): string {
    // Don't use cache if we have an active execution - always recalculate
    // This ensures status updates immediately when workflow progresses
    if (!this.activeExecution) {
      // Only use cache when there's no active execution
      if (this.stepStatusCache.has(stepId)) {
        return this.stepStatusCache.get(stepId)!;
      }
    }

    // Calculate status based on active execution state
    let status: string;
    
    // Check if step is in completed steps
    if (this.completedSteps.includes(stepId)) {
      status = 'completed';
    } 
    // Check if step is the current step
    else if (this.activeExecution && this.activeExecution.currentStep === stepId) {
      status = 'current';
    } 
    // Check if step is in execution history (completed but not in completedSteps array)
    else if (this.activeExecution && this.activeExecution.history.some(h => h.step === stepId)) {
      status = 'completed';
      // Add to completedSteps for future checks
      if (!this.completedSteps.includes(stepId)) {
        this.completedSteps.push(stepId);
      }
    }
    else {
      status = 'pending';
    }

    // Cache the result only if no active execution
    if (!this.activeExecution) {
      this.stepStatusCache.set(stepId, status);
    }
    return status;
  }

  // Clear status cache when workflow state changes
  private clearStatusCache(): void {
    this.stepStatusCache.clear();
  }

  getStepStatusClass(stepId: string): string {
    const status = this.getStepStatus(stepId);
    switch (status) {
      case 'completed': return 'list-group-item-success';
      case 'current': return 'list-group-item-primary';
      default: return '';
    }
  }

  isStepVisible(stepId: string): boolean {
    // Show all steps for now - could be enhanced to show only reachable steps
    return true;
  }

  isLLMAction(actionType: string): boolean {
    return actionType.includes('llm') ||
           actionType.includes('extract') ||
           actionType.includes('format') ||
           actionType.includes('query') ||
           actionType === 'validate';
  }

  isPaymentAction(actionType: string): boolean {
    return actionType.includes('payment') ||
           actionType.includes('cashier') ||
           actionType.includes('wallet') ||
           actionType.includes('ledger') ||
           actionType.includes('balance') ||
           actionType === 'check_balance' ||
           actionType === 'process_payment' ||
           actionType === 'complete_booking';
  }

  getActionBadgeClass(actionType: string): string {
    if (this.isLLMAction(actionType)) {
      return 'bg-success';
    } else if (this.isPaymentAction(actionType)) {
      return 'bg-primary';
    } else {
      return 'bg-secondary';
    }
  }

  getActionBadgeIcon(actionType: string): string {
    if (this.isLLMAction(actionType)) {
      return '🤖';
    } else if (this.isPaymentAction(actionType)) {
      return '💰';
    } else {
      return '⚙️';
    }
  }

  getActionStatusText(actionType: string): string {
    if (this.isLLMAction(actionType)) {
      return 'Self-Play Mocked';
    } else if (this.isPaymentAction(actionType)) {
      return 'Server Autopay';
    } else {
      return 'Processing';
    }
  }

  // Dynamic data structure handling methods
  getDisplayTitle(option: any): string {
    // Try common title fields - support both movie and airline
    if (option.data?.flightNumber) {
      // Airline option
      return `${option.data.flightNumber} to ${option.data.destination || 'Destination'}`;
    }
    return option.data?.movieTitle ||
           option.data?.name ||
           option.data?.title ||
           option.label ||
           'Option';
  }

  getDisplayFields(option: any): any[] {
    if (!option.data) return [];

    const fields = [];
    // Exclude fields already used in title - support both movie and airline
    const excludeFields = ['id', 'movieTitle', 'name', 'title', 'flightNumber', 'destination'];

    for (const [key, value] of Object.entries(option.data)) {
      if (!excludeFields.includes(key) && value !== null && value !== undefined && value !== '') {
        fields.push({ key, value, last: false });
      }
    }

    // Mark the last field
    if (fields.length > 0) {
      fields[fields.length - 1].last = true;
    }

    return fields;
  }

  getFieldLabel(key: string): string {
    // Human-readable labels for common fields - support both movie and airline
    const labels: { [key: string]: string } = {
      'showtime': 'Showtime',
      'date': 'Date',
      'price': 'Price',
      'providerName': 'Provider',
      'providerId': 'Provider ID',
      'movieId': 'Movie ID',
      'rating': 'Rating',
      'genre': 'Genre',
      'duration': 'Duration',
      'location': 'Location',
      'serviceType': 'Type',
      'flightNumber': 'Flight Number',
      'destination': 'Destination',
      'departure': 'Departure',
      'arrival': 'Arrival'
    };

    return labels[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
  }

  formatFieldValue(value: any): string {
    if (typeof value === 'number' && value.toString().includes('.')) {
      // Format prices
      if (value < 100) {
        return `$${value.toFixed(2)}`;
      }
      return value.toString();
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    return String(value);
  }

  getSelectButtonText(option: any): string {
    const title = this.getDisplayTitle(option);
    if (title.includes('Movie') || title.includes('movie')) {
      return 'Select This Movie';
    }
    if (option.data?.flightNumber) {
      return 'Select This Flight';
    }
    return 'Select This Option';
  }

  // LLM History Management
  private loadLlmHistory(): void {
    try {
      const savedHistory = localStorage.getItem(this.LLM_HISTORY_KEY);
      if (savedHistory) {
        const parsedHistory = JSON.parse(savedHistory);
        // Validate that it's an array and contains valid response objects
        if (Array.isArray(parsedHistory) && parsedHistory.every(item =>
          item && typeof item === 'object' && item.timestamp
        )) {
          this.llmResponses = parsedHistory;
          console.log(`📚 [WorkflowDisplay] Loaded ${this.llmResponses.length} LLM responses from history`);
        } else {
          console.warn('📚 [WorkflowDisplay] Invalid LLM history format, starting fresh');
          this.llmResponses = [];
        }
      }
    } catch (error) {
      console.error('📚 [WorkflowDisplay] Error loading LLM history:', error);
      this.llmResponses = [];
    }
  }

  private saveLlmHistory(): void {
    try {
      // Keep only the most recent responses
      const recentResponses = this.llmResponses.slice(-this.MAX_HISTORY_ITEMS);
      localStorage.setItem(this.LLM_HISTORY_KEY, JSON.stringify(recentResponses));
    } catch (error) {
      console.error('📚 [WorkflowDisplay] Error saving LLM history:', error);
    }
  }

  private addLlmResponse(response: any): void {
    // CRITICAL: Final safety net - filter out confirmation messages before adding to array
    // This ensures they never appear in the UI, regardless of where they come from
    const message = response.message || response.content || '';
    if (message.includes('Your choice has been confirmed') || 
        message.includes('choice has been confirmed') ||
        message.includes('processed that costs')) {
      console.log('🎬 [WorkflowDisplay] Final filter: Blocking confirmation message from being added to llmResponses');
      return; // Don't add this message to the array
    }
    
    this.llmResponses.push(response);
    this.latestLlmResponse = response;
    this.saveLlmHistory(); // Persist after each addition
  }

  // Toggle visibility of raw LLM data for a response
  toggleRawData(response: any): void {
    response.showRawData = !response.showRawData;
  }

  clearLlmHistory(): void {
    this.llmResponses = [];
    this.latestLlmResponse = null;
    localStorage.removeItem(this.LLM_HISTORY_KEY);
    console.log('🗑️ [WorkflowDisplay] LLM history cleared');
  }

  exportLlmHistory(): void {
    try {
      const exportData = {
        exportTimestamp: new Date().toISOString(),
        totalResponses: this.llmResponses.length,
        responses: this.llmResponses,
        summary: {
          startEvents: this.llmResponses.filter(r => r.type === 'start').length,
          responseEvents: this.llmResponses.filter(r => r.type === 'response').length,
          timeRange: this.llmResponses.length > 0 ? {
            first: new Date(this.llmResponses[0].timestamp).toISOString(),
            last: new Date(this.llmResponses[this.llmResponses.length - 1].timestamp).toISOString()
          } : null
        }
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `llm-history-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('📤 [WorkflowDisplay] LLM history exported');
    } catch (error) {
      console.error('❌ [WorkflowDisplay] Error exporting LLM history:', error);
    }
  }

  // Table display methods
  getDataFields(data: any): any[] {
    if (!data || typeof data !== 'object') return [];

    const fields = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push({ key, value });
    }
    return fields;
  }

  formatTableValue(value: any): string {
    if (value === null || value === undefined) {
      return '<em class="text-muted">null</em>';
    }

    if (typeof value === 'boolean') {
      return value ? '<span class="badge bg-success">true</span>' : '<span class="badge bg-secondary">false</span>';
    }

    if (typeof value === 'number') {
      if (value < 1 && value > 0) {
        return value.toFixed(6); // For iGas costs
      }
      if (value % 1 !== 0) {
        return value.toFixed(2); // For prices
      }
      return value.toString();
    }

    if (this.isArray(value)) {
      if (value.length === 0) {
        return '<em class="text-muted">Empty array</em>';
      }
      return `<span class="badge bg-info">${value.length} items</span>`;
    }

    if (this.isObject(value)) {
      return '<em class="text-primary">Object →</em>';
    }

    if (typeof value === 'string' && value.length > 50) {
      return value.substring(0, 50) + '...';
    }

    return String(value);
  }

  isObject(value: any): boolean {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  isArray(value: any): boolean {
    return Array.isArray(value);
  }

  // Movie theater event handlers
  onMovieProgress(event: { progress: number; scene: string; message?: string }): void {
    console.log('🎬 [WorkflowDisplay] Movie progress:', event);

    // Update workflow context with movie progress
    if (this.activeExecution) {
      this.activeExecution.context['movieProgress'] = event.progress;
      this.activeExecution.context['currentScene'] = event.scene;
    }

    // Trigger workflow continuation when movie reaches certain milestones
    if (event.progress >= 100) {
      // Movie finished - automatically continue to next step
      setTimeout(async () => {
        await this.continueWorkflowAfterMovie();
      }, 2000); // Wait 2 seconds after movie finishes
    }
  }

  onMovieFinished(event: { completed: boolean; finalScene: string }): void {
    console.log('🎬 [WorkflowDisplay] Movie finished:', event);

    if (this.activeExecution) {
      this.activeExecution.context['movieWatched'] = true;
      this.activeExecution.context['finalScene'] = event.finalScene;
      
      // Automatically continue workflow after movie finishes
      setTimeout(async () => {
        await this.continueWorkflowAfterMovie();
      }, 1000); // Wait 1 second after movie finishes
    }
  }

  private async continueWorkflowAfterMovie(): Promise<void> {
    // Automatically continue the workflow after movie watching completion
    if (!this.activeExecution) {
      console.error('❌ [WorkflowDisplay] No active execution to continue');
      return;
    }

    try {
      console.log('🎬 [WorkflowDisplay] Continuing workflow after movie completion');
      console.log('🎬 [WorkflowDisplay] Context movieWatched:', this.activeExecution.context['movieWatched']);

      // Trigger workflow continuation by executing the next step transition
      // The server will check the transition condition {{movieWatched}} and move to ledger_create_entry
      const nextStepId = await this.flowWiseService.executeWorkflowStep(
        this.activeExecution.executionId,
        'watch_movie', // Current step
        this.activeExecution.context // Pass updated context with movieWatched: true
      );

      if (nextStepId) {
        // Update to the next step
        this.updateCurrentStep();
        console.log('✅ [WorkflowDisplay] Workflow continued to next step:', nextStepId);
      } else {
        console.log('🏁 [WorkflowDisplay] Workflow completed or no next step found');
      }
    } catch (error: any) {
      console.error('❌ [WorkflowDisplay] Failed to continue workflow after movie:', error);
    }
  }

  submitMovieSelection(selectedOption: any) {
    if (!this.pendingSelection) {
      console.error('❌ [WorkflowDisplay] No pending selection to submit');
      return;
    }

    // CRITICAL: Check if the workflow is at view_movie step
    // If so, reject this selection - view_movie requires an explicit decision, not a selection
    const currentStep = this.activeExecution?.currentStep || this.currentStep?.id || this.pendingSelection?.stepId;
    console.log(`🔍 [WorkflowDisplay] submitMovieSelection - currentStep: ${currentStep}`);
    console.log(`🔍 [WorkflowDisplay] activeExecution.currentStep: ${this.activeExecution?.currentStep}`);
    console.log(`🔍 [WorkflowDisplay] this.currentStep.id: ${this.currentStep?.id}`);
    console.log(`🔍 [WorkflowDisplay] pendingSelection.stepId: ${this.pendingSelection?.stepId}`);
    
    if (currentStep === 'view_movie') {
      console.error(`❌ [WorkflowDisplay] ========================================`);
      console.error(`❌ [WorkflowDisplay] ERROR: Cannot submit movie selection when workflow is at view_movie step!`);
      console.error(`❌ [WorkflowDisplay] view_movie step requires an explicit decision: "DONE_WATCHING"`);
      console.error(`❌ [WorkflowDisplay] This selection will be ignored - please click "Done Watching" button instead`);
      console.error(`❌ [WorkflowDisplay] ========================================`);
      alert('Cannot submit movie selection at this step. The workflow is waiting for you to click "Done Watching".');
      // Hide the selection prompt since it shouldn't be shown at view_movie step
      this.showSelectionPrompt = false;
      this.pendingSelection = null;
      // Force change detection to update the UI
      this.cdr.detectChanges();
      return;
    }

    console.log(`✅ [WorkflowDisplay] Submitting movie selection:`, selectedOption);

    // Send the selection to the server
    const baseUrl = this.apiUrl;

    // Store the selection data for the FlowWise service
    if (this.activeExecution) {
      this.activeExecution.context['userSelection'] = selectedOption.data;
    }

    this.http.post(`${baseUrl}/api/workflow/decision`, {
      workflowId: this.pendingSelection.executionId,
      decision: selectedOption.value,
      selectionData: selectedOption.data
    }).subscribe({
      next: (response: any) => {
        console.log('✅ [WorkflowDisplay] Movie selection submitted successfully');

        // Clear the selection UI
        this.showSelectionPrompt = false;
        this.pendingSelection = null;

        // The server will automatically continue the workflow
        // No need to manually trigger the next step
      },
      error: (error) => {
        console.error('❌ [WorkflowDisplay] Failed to submit movie selection:', error);
        if (error.status === 400 && error.error?.code === 'INVALID_SELECTION_FOR_VIEW_MOVIE') {
          alert('Cannot submit movie selection at this step. The workflow is waiting for you to click "Done Watching".');
        }
      }
    });
  }

  private handleWebSocketEvent(event: SimulatorEvent): void {
    // Note: Ledger events are already filtered in the subscription callback above
    // This method only processes workflow-related events
    
    console.log('📡 [WorkflowDisplay] ========================================');
    console.log('📡 [WorkflowDisplay] Processing workflow event:', event.type);
    console.log('📡 [WorkflowDisplay] Full event:', JSON.stringify(event, null, 2));
    console.log('📡 [WorkflowDisplay] Event data:', JSON.stringify(event.data, null, 2));
    console.log('📡 [WorkflowDisplay] ========================================');

    // CRITICAL: Handle workflow_started event to set activeExecutionId early
    // This ensures we can scope subsequent events properly (same as workflow-chat-display)
    if (event.type === 'workflow_started' && (event as any).data?.executionId) {
      const newId = String((event as any).data.executionId);
      if (newId && newId !== this.activeExecutionId) {
        console.log('🔄 [WorkflowDisplay] New workflow started, executionId:', newId);
        this.activeExecutionId = newId;
        // Don't reset here - let the execution check interval handle it
      }
    }

    // If we're scoped to a specific execution, ignore late events from older executions.
    const evExecId = (event as any).data?.executionId || (event as any).data?.workflowId;
    const isExecutionScopedEvent =
      event.type === 'llm_start' ||
      event.type === 'llm_response' ||
      event.type === 'igas' ||
      event.type === 'user_selection_required' ||
      event.type === 'user_decision_required' ||
      event.type === 'workflow_step_changed';
    if (isExecutionScopedEvent && this.activeExecutionId) {
      // During pending reset, ignore everything until we know the new execution id.
      if (this.activeExecutionId === '__pending__') {
        console.log('📡 [WorkflowDisplay] Ignoring event during pending reset');
        return;
      }
      // CRITICAL: If event has executionId, it must match (same logic as workflow-chat-display)
      // But if event doesn't have executionId, still process it (might be for current execution)
      if (evExecId && String(evExecId) !== this.activeExecutionId) {
        console.log('📡 [WorkflowDisplay] Ignoring event from different execution:', evExecId, 'vs', this.activeExecutionId);
        return;
      }
    }

    switch (event.type) {
      case 'llm_start':
        console.log('🤖 [WorkflowDisplay] LLM processing started');
        this.addLlmResponse({
          type: 'start',
          message: event.message || 'LLM processing started...',
          timestamp: event.timestamp || Date.now(),
          originalEvent: event // Preserve original event data
        });
        this.cdr.detectChanges();
        break;

      case 'llm_response':
        console.log('🤖 [WorkflowDisplay] LLM response received:', event.data);
        const responseMessage = event.message || event.data?.response?.message || event.data?.message || 'LLM response received';
        
        // CRITICAL: Filter out confirmation messages that block the video player
        // These are system messages, not actual LLM responses
        if (responseMessage.includes('Your choice has been confirmed') || 
            responseMessage.includes('choice has been confirmed') ||
            responseMessage.includes('processed that costs')) {
          console.log('🎬 [WorkflowDisplay] Filtering out confirmation message - not adding to LLM responses');
          // Still update iGas cost if available
          if (event.data?.igas || event.data?.iGasCost) {
            this.iGasCost = event.data?.igas || event.data?.iGasCost;
          }
          // CRITICAL: After confirmation, try to open video modal
          // The confirmation happens after payment, and the workflow should transition to view_movie
          setTimeout(() => {
            // Check current step - might be view_movie or about to transition
            const currentStepId = this.activeExecution?.currentStep || this.currentStep?.id;
            console.log('🎬 [WorkflowDisplay] After confirmation, current step:', currentStepId);
            
            // Try to get videoUrl from multiple sources
            const videoUrl = this.pendingDecision?.videoUrl || 
                            this.selectedListing?.videoUrl ||
                            this.activeExecution?.context?.['selectedListing']?.['videoUrl'] ||
                            this.activeExecution?.context?.['selectedListing2']?.['videoUrl'] ||
                            this.activeExecution?.context?.['videoUrl'] || '';
            const movieTitle = this.pendingDecision?.movieTitle || 
                              this.selectedListing?.movieTitle ||
                              this.activeExecution?.context?.['selectedListing']?.['movieTitle'] ||
                              this.activeExecution?.context?.['selectedListing2']?.['movieTitle'] ||
                              this.activeExecution?.context?.['movieTitle'] || '';
            
            console.log('🎬 [WorkflowDisplay] After confirmation, videoUrl:', videoUrl ? 'YES' : 'NO', videoUrl);
            
            if (videoUrl && !this.showVideoModal) {
              console.log('🎬 [WorkflowDisplay] Opening video modal after confirmation message');
              this.openVideoModal(videoUrl, movieTitle);
            } else if (!videoUrl) {
              console.warn('🎬 [WorkflowDisplay] No videoUrl found after confirmation, will retry when step transitions');
            }
          }, 500); // Wait 500ms after confirmation to ensure workflow has transitioned
          break; // Don't add this as an LLM response
        }
        
        const llmResponse = {
          type: 'response',
          message: responseMessage,
          data: event.data?.response || event.data,
          timestamp: event.timestamp || Date.now(),
          originalEvent: event, // Preserve complete original event
          // Extract key LLM data for easy access
          llmData: {
            response: event.data?.response || event.data,
            iGasCost: event.data?.igas || event.data?.iGasCost,
            serviceType: event.data?.serviceType,
            rawData: event.data
          }
        };
        this.addLlmResponse(llmResponse);
        
        // Update iGas cost if available
        if (event.data?.igas || event.data?.iGasCost) {
          this.iGasCost = event.data?.igas || event.data?.iGasCost;
        }
        
        this.cdr.detectChanges();
        break;

      case 'igas':
        console.log('⛽ [WorkflowDisplay] iGas cost:', event.data?.igas);
        this.iGasCost = event.data?.igas || null;
        break;

      case 'user_decision_required':
        console.log('🤔 [WorkflowDisplay] ========================================');
        console.log('🤔 [WorkflowDisplay] user_decision_required EVENT RECEIVED');
        console.log('🤔 [WorkflowDisplay] Event data:', event.data);
        console.log('🤔 [WorkflowDisplay] stepId:', event.data?.stepId);
        console.log('🤔 [WorkflowDisplay] videoUrl (direct):', event.data?.videoUrl);
        console.log('🤔 [WorkflowDisplay] selectedListing?.videoUrl:', event.data?.selectedListing?.videoUrl);
        console.log('🤔 [WorkflowDisplay] ========================================');
        
        // CRITICAL: Extract videoUrl and movieTitle from WebSocket event (like workflow-chat-display does)
        // This is what makes the video player show up
        let videoUrl = event.data?.videoUrl;
        let movieTitle = event.data?.movieTitle;
        
        // If videoUrl is missing but stepId is view_movie, try to get from selectedListing or active execution
        if (!videoUrl && event.data?.stepId === 'view_movie') {
          videoUrl = event.data?.selectedListing?.videoUrl;
          movieTitle = event.data?.selectedListing?.movieTitle;
          
          // Also check active execution context
          if (!videoUrl && this.activeExecution) {
            const context = this.activeExecution.context || {};
            videoUrl = context['selectedListing']?.['videoUrl'] || 
                      context['selectedListing2']?.['videoUrl'] ||
                      context['videoUrl'] || '';
            movieTitle = context['selectedListing']?.['movieTitle'] || 
                        context['selectedListing2']?.['movieTitle'] ||
                        context['movieTitle'] || '';
          }
          
          console.log('🎬 [WorkflowDisplay] view_movie step - extracted videoUrl:', videoUrl);
          console.log('🎬 [WorkflowDisplay] view_movie step - extracted movieTitle:', movieTitle);
        }
        
        // Update pendingDecision with videoUrl if we have it
        if (videoUrl && this.pendingDecision) {
          this.pendingDecision.videoUrl = videoUrl;
          this.pendingDecision.movieTitle = movieTitle || this.pendingDecision.movieTitle;
          console.log('🎬 [WorkflowDisplay] Updated pendingDecision with videoUrl from WebSocket event');
          // Open video modal
          this.openVideoModal(videoUrl, movieTitle);
        } else if (videoUrl && !this.pendingDecision) {
          // Create pendingDecision if it doesn't exist yet (shouldn't happen, but just in case)
          this.pendingDecision = {
            executionId: event.data?.executionId || event.data?.workflowId || this.activeExecutionId || '',
            stepId: event.data?.stepId || 'view_movie',
            prompt: event.data?.prompt || 'Please watch the movie and click "Done Watching" when finished.',
            options: event.data?.options || [
              { value: 'DONE_WATCHING', label: 'Done Watching', action: 'Mark movie as watched' }
            ],
            timeout: event.data?.timeout || 300000,
            videoUrl: videoUrl,
            movieTitle: movieTitle
          };
          this.showDecisionPrompt = true;
          console.log('🎬 [WorkflowDisplay] Created pendingDecision from WebSocket event with videoUrl');
          // Open video modal
          this.openVideoModal(videoUrl, movieTitle);
        }
        
        // Also update selectedListing if we have videoUrl
        if (videoUrl && !this.selectedListing?.videoUrl) {
          if (!this.selectedListing) {
            this.selectedListing = {};
          }
          this.selectedListing.videoUrl = videoUrl;
          this.selectedListing.movieTitle = movieTitle || this.selectedListing.movieTitle;
          console.log('🎬 [WorkflowDisplay] Updated selectedListing with videoUrl from WebSocket event');
          // Open video modal if not already open
          if (!this.showVideoModal) {
            this.openVideoModal(videoUrl, movieTitle);
          }
        }
        
        // Note: The FlowWise service subscription will also handle this, but we extract videoUrl here
        // to ensure it's available immediately
        break;

      case 'cashier_payment_processed':
        // CRITICAL: Payment processed - filter out confirmation message and open video modal
        // NOTE: We handle this event here (not filtered) because we need it to open the video modal
        // But we ensure no confirmation messages are added to llmResponses
        console.log('💳 [WorkflowDisplay] Payment processed event received (ignoring confirmation message)');
        if (event.data?.entry) {
          const iGasCost = event.data.entry.iGasCost || event.data.iGasCost || 0.00445;
          // Update iGas cost
          this.iGasCost = typeof iGasCost === 'number' ? iGasCost : parseFloat(iGasCost || '0.00445');
          console.log('💳 [WorkflowDisplay] Updated iGas cost:', this.iGasCost);
        }
        
        // CRITICAL: Do NOT add any confirmation message to llmResponses
        // The confirmation message is filtered by addLlmResponse() method
        
        // CRITICAL: After payment is processed, check if we should open video modal
        // Payment happens before view_movie step, so we need to wait for step transition
        setTimeout(() => {
          console.log('🎬 [WorkflowDisplay] After payment processed, checking for video modal');
          const currentStepId = this.activeExecution?.currentStep || this.currentStep?.id;
          console.log('🎬 [WorkflowDisplay] Current step after payment:', currentStepId);
          
          // Try to get videoUrl from multiple sources
          const videoUrl = this.pendingDecision?.videoUrl || 
                          this.selectedListing?.videoUrl ||
                          this.activeExecution?.context?.['selectedListing']?.['videoUrl'] ||
                          this.activeExecution?.context?.['selectedListing2']?.['videoUrl'] ||
                          this.activeExecution?.context?.['videoUrl'] || '';
          const movieTitle = this.pendingDecision?.movieTitle || 
                            this.selectedListing?.movieTitle ||
                            this.activeExecution?.context?.['selectedListing']?.['movieTitle'] ||
                            this.activeExecution?.context?.['selectedListing2']?.['movieTitle'] ||
                            this.activeExecution?.context?.['movieTitle'] || '';
          
          console.log('🎬 [WorkflowDisplay] After payment, videoUrl:', videoUrl ? 'YES' : 'NO', videoUrl);
          console.log('🎬 [WorkflowDisplay] After payment, movieTitle:', movieTitle || 'N/A');
          
          // Open modal if we have videoUrl and we're at or about to be at view_movie step
          if (videoUrl && !this.showVideoModal) {
            if (currentStepId === 'view_movie' || currentStepId === 'watch_movie') {
              console.log('🎬 [WorkflowDisplay] Opening video modal after payment processed');
              this.openVideoModal(videoUrl, movieTitle);
            } else {
              // Step might not have transitioned yet, wait a bit more
              setTimeout(() => {
                const retryStepId = this.activeExecution?.currentStep || this.currentStep?.id;
                if (retryStepId === 'view_movie' || retryStepId === 'watch_movie') {
                  console.log('🎬 [WorkflowDisplay] Opening video modal after payment (retry)');
                  this.openVideoModal(videoUrl, movieTitle);
                } else {
                  console.warn('🎬 [WorkflowDisplay] Still not at view_movie step, current:', retryStepId);
                }
              }, 1000); // Wait another 1 second
            }
          } else if (!videoUrl) {
            console.warn('🎬 [WorkflowDisplay] No videoUrl found after payment');
          }
        }, 500); // Wait 500ms after payment to ensure workflow has transitioned
        // CRITICAL: Do NOT add confirmation message - it's filtered by addLlmResponse() method
        break;

      case 'user_selection_required':
        console.log('🎬 [WorkflowDisplay] ========================================');
        console.log('🎬 [WorkflowDisplay] SELECTION REQUIRED EVENT RECEIVED');
        console.log('🎬 [WorkflowDisplay] Full event:', JSON.stringify(event, null, 2));
        console.log('🎬 [WorkflowDisplay] Event data:', event.data);
        console.log('🎬 [WorkflowDisplay] Event data.options:', event.data?.options);
        
        // CRITICAL: If workflow is at view_movie step, ignore selection events
        // view_movie requires a decision, not a selection
        const currentStepForSelection = this.activeExecution?.currentStep || this.currentStep?.id || event.data?.stepId;
        if (currentStepForSelection === 'view_movie') {
          console.warn(`⚠️ [WorkflowDisplay] Ignoring user_selection_required event - workflow is at view_movie step`);
          console.warn(`⚠️ [WorkflowDisplay] view_movie requires a decision (DONE_WATCHING), not a selection`);
          // Don't show selection prompt for view_movie step
          break;
        }
        console.log('🎬 [WorkflowDisplay] Event data.options type:', typeof event.data?.options);
        console.log('🎬 [WorkflowDisplay] Event data.options is array:', Array.isArray(event.data?.options));
        console.log('🎬 [WorkflowDisplay] Event data.options length:', event.data?.options?.length || 0);
        
        // Ensure options is an array
        let selectionOptions = event.data?.options;
        if (!Array.isArray(selectionOptions)) {
          console.warn('⚠️ [WorkflowDisplay] Options is not an array!');
          console.warn('⚠️ [WorkflowDisplay] Options value:', selectionOptions);
          console.warn('⚠️ [WorkflowDisplay] Options type:', typeof selectionOptions);
          
          // Try to extract options from different possible locations
          if (event.data && typeof event.data === 'object') {
            // Check if options is nested somewhere
            selectionOptions = (event.data as any).options || [];
          } else {
            selectionOptions = [];
          }
          
          console.warn('⚠️ [WorkflowDisplay] After conversion, options:', selectionOptions);
        }
        
        console.log('🎬 [WorkflowDisplay] Final selectionOptions:', selectionOptions);
        console.log('🎬 [WorkflowDisplay] Final selectionOptions length:', selectionOptions.length);
        
        this.pendingSelection = {
          executionId: event.data?.workflowId || event.data?.executionId || 'unknown',
          stepId: event.data?.stepId || 'unknown',
          prompt: event.data?.prompt || event.message || 'Please select an option:',
          options: selectionOptions,
          timeout: event.data?.timeout || 60000
        };
        
        this.showSelectionPrompt = true;
        this.showDecisionPrompt = false; // Clear decision prompt if selection is shown
        
        console.log('🎬 [WorkflowDisplay] ========================================');
        console.log('🎬 [WorkflowDisplay] Set pendingSelection:', JSON.stringify(this.pendingSelection, null, 2));
        console.log('🎬 [WorkflowDisplay] showSelectionPrompt:', this.showSelectionPrompt);
        console.log('🎬 [WorkflowDisplay] pendingSelection.options count:', this.pendingSelection.options?.length || 0);
        console.log('🎬 [WorkflowDisplay] Template should show if:', {
          'showSelectionPrompt': this.showSelectionPrompt,
          'pendingSelection exists': !!this.pendingSelection,
          'options count': this.pendingSelection.options?.length || 0
        });
        console.log('🎬 [WorkflowDisplay] ========================================');
        
        // Angular's change detection will handle the update automatically
        break;

      case 'workflow_step_changed':
        console.log('🔄 [WorkflowDisplay] Workflow step changed:', event.data);
        // Update the current step display when workflow progresses
        // CRITICAL: Use currentWorkflow instead of checking selectedWorkflow and legacy properties
        if (this.currentWorkflow) {
          // Update active execution current step if available
          if (this.activeExecution && event.data?.stepId) {
            const previousStep = this.activeExecution.currentStep;
            const newStep = event.data.stepId;
            this.activeExecution.currentStep = newStep;
            
            // CRITICAL: If transitioning to view_movie, clear any pending selection prompts
            // view_movie requires a decision, not a selection
            if (newStep === 'view_movie') {
              console.log(`🎬 [WorkflowDisplay] Workflow transitioned to view_movie - clearing selection prompt`);
              this.showSelectionPrompt = false;
              this.pendingSelection = null;
              
              // Try to open video modal if we have videoUrl
              const videoUrl = this.pendingDecision?.videoUrl || 
                              this.selectedListing?.videoUrl ||
                              this.activeExecution?.context?.['selectedListing']?.['videoUrl'] ||
                              this.activeExecution?.context?.['selectedListing2']?.['videoUrl'] ||
                              this.activeExecution?.context?.['videoUrl'] || '';
              const movieTitle = this.pendingDecision?.movieTitle ||
                                this.selectedListing?.movieTitle ||
                                this.activeExecution?.context?.['selectedListing']?.['movieTitle'] ||
                                this.activeExecution?.context?.['selectedListing2']?.['movieTitle'] ||
                                this.activeExecution?.context?.['movieTitle'] || '';
              
              if (videoUrl && !this.showVideoModal) {
                console.log(`🎬 [WorkflowDisplay] Opening video modal on view_movie step transition:`, { videoUrl, movieTitle });
                this.openVideoModal(videoUrl, movieTitle);
              } else if (!videoUrl) {
                console.warn(`🎬 [WorkflowDisplay] view_movie step reached but no videoUrl found yet`);
              }
            }
            
            // Mark previous step as completed
            if (previousStep && previousStep !== newStep) {
              if (!this.completedSteps.includes(previousStep)) {
                this.completedSteps.push(previousStep);
                console.log(`✅ [WorkflowDisplay] Marked step ${previousStep} as completed`);
              }
              // Add to execution history if not already there
              if (!this.activeExecution.history.some(h => h.step === previousStep)) {
                this.activeExecution.history.push({
                  step: previousStep,
                  timestamp: Date.now(),
                  data: { completed: true }
                });
              }
            }
            
            // Update selectedListing from context if available
            if (event.data?.selectedListing || this.activeExecution.context['selectedListing']) {
              this.selectedListing = event.data?.selectedListing || this.activeExecution.context['selectedListing'];
              console.log('🎬 [WorkflowDisplay] Updated selectedListing:', this.selectedListing);
            }
          }
          
          this.updateCurrentStep();
          this.clearStatusCache(); // Clear cache to refresh step statuses
          
          // Auto-start movie when watch_movie step is reached
          if (event.data?.stepId === 'watch_movie' && event.data?.component === 'movie_theater') {
            console.log('🎬 [WorkflowDisplay] Watch movie step reached, will auto-start movie');
            setTimeout(() => {
              // Trigger movie start after a short delay to ensure component is rendered
              const movieTheaterComponent = document.querySelector('app-movie-theater');
              if (movieTheaterComponent) {
                // The movie theater component should auto-start via its ngOnInit or we can trigger it
                console.log('🎬 [WorkflowDisplay] Movie theater component found, movie should start');
              }
            }, 500);
          }
        } else {
          console.log('🔄 [WorkflowDisplay] Workflow not loaded yet, skipping step update');
        }
        break;
      
      case 'movie_started':
        // Update selectedListing when movie starts
        if (event.data?.movieTitle) {
          if (!this.selectedListing) {
            this.selectedListing = {};
          }
          this.selectedListing.movieTitle = event.data.movieTitle;
          this.selectedListing.duration = event.data.duration;
          console.log('🎬 [WorkflowDisplay] Movie started, updated selectedListing:', this.selectedListing);
        }
        break;

      default:
        // CRITICAL: Ignore ledger, payment, and settlement events
        // These are handled by their respective display components (ledger-display, etc.)
        // Processing them here can interfere with video player display
        const ignoredEventTypes = [
          'root_ca_settlement_start',
          'root_ca_entry_validated',
          'ledger_entry_settled',
          'root_ca_ledger_settlement_complete',
          'ledger_entry_created',
          'ledger_entry_updated',
          'payment_processed',
          'wallet_updated',
          'error' // System errors are handled elsewhere
        ];
        
        if (!ignoredEventTypes.includes(event.type)) {
          // Only log non-ignored events for debugging
          console.log('📡 [WorkflowDisplay] Unhandled event type (not workflow-related):', event.type);
        }
        break;
    }
  }

  /**
   * Check if this component is in the active tab
   * workflow-display is only visible when activeTab === 'workflow' and not in user mode
   */
  private isComponentInActiveTab(): boolean {
    // Check if the workflow tab pane is visible
    const workflowPane = document.getElementById('workflow-pane');
    if (!workflowPane) {
      return false; // Tab pane doesn't exist
    }
    
    // Check if the tab pane has 'show active' classes (Bootstrap tab active state)
    const hasActiveClass = workflowPane.classList.contains('show') && workflowPane.classList.contains('active');
    
    // Also check if component is actually visible in DOM
    const isVisible = workflowPane.offsetParent !== null;
    
    console.log('🔍 [WorkflowDisplay] Component visibility check:', {
      hasActiveClass,
      isVisible,
      offsetParent: workflowPane.offsetParent !== null
    });
    
    return hasActiveClass && isVisible;
  }

  private resetForNewExecution(executionId: string): void {
    this.activeExecutionId = executionId;

    // Clear "console output" (LLM history panel) + prompts + step state
    this.llmResponses = [];
    this.latestLlmResponse = null;
    this.iGasCost = null;
    this.selectedListing = null;
    this.completedSteps = [];
    this.currentStepIndex = 0;
    this.pendingDecision = null;
    this.showDecisionPrompt = false;
    this.pendingSelection = null;
    this.showSelectionPrompt = false;
    this.clearStatusCache();

    // Also clear persisted LLM history so it doesn't re-hydrate old output
    try {
      localStorage.removeItem(this.LLM_HISTORY_KEY);
    } catch {}

    this.cdr.detectChanges();
  }

  /**
   * Process execution messages to populate UI with existing data from execution context
   * This is similar to workflow-chat-display's processExecutionMessages method
   * CRITICAL: This is what makes the component work in pure chat environment
   */
  private processExecutionMessages(execution: WorkflowExecution): void {
    console.log('🔄 [WorkflowDisplay] ========================================');
    console.log('🔄 [WorkflowDisplay] Processing execution messages for:', execution.executionId);
    console.log('🔄 [WorkflowDisplay] Execution serviceType:', execution.serviceType);
    console.log('🔄 [WorkflowDisplay] Execution currentStep:', execution.currentStep);
    console.log('🔄 [WorkflowDisplay] Execution context keys:', Object.keys(execution.context || {}));
    console.log('🔄 [WorkflowDisplay] Execution history length:', execution.history?.length || 0);
    console.log('🔄 [WorkflowDisplay] currentWorkflow exists:', !!this.currentWorkflow);
    console.log('🔄 [WorkflowDisplay] currentWorkflow steps count:', this.currentWorkflow?.steps?.length || 0);
    
    // CRITICAL: Ensure workflow is loaded before processing
    if (!this.currentWorkflow) {
      console.warn('⚠️ [WorkflowDisplay] currentWorkflow is null, attempting to get it from FlowWiseService...');
      const workflow = this.flowWiseService.getWorkflow(execution.serviceType);
      if (workflow) {
        this.currentWorkflow = workflow;
        this.updateDebugWorkflowSteps();
        console.log('✅ [WorkflowDisplay] Loaded workflow from FlowWiseService:', workflow.name);
      } else {
        console.error('❌ [WorkflowDisplay] Cannot process messages - workflow not loaded for serviceType:', execution.serviceType);
        return;
      }
    }
    
    // Extract data from execution context
    const context = execution.context || {};
    
    // Add user input as LLM start event
    const userInput = context['input'] || context['userInput'] || context['queryResult']?.query;
    console.log('🔄 [WorkflowDisplay] User input found:', userInput ? 'YES' : 'NO', userInput);
    if (userInput) {
      const existingStartEvent = this.llmResponses.find(r => r.type === 'start' && r.message === userInput);
      if (!existingStartEvent) {
        const startTimestamp = execution.history && execution.history.length > 0 
          ? execution.history[0].timestamp 
          : Date.now() - 1000;
        
        console.log('🔄 [WorkflowDisplay] Adding user input as start event');
        this.addLlmResponse({
          type: 'start',
          message: userInput,
          timestamp: startTimestamp,
          originalEvent: { type: 'user_input', data: { input: userInput } }
        });
      }
    }
    
    // Add LLM response if available
    const llmResponse = context['llmResponse'];
    console.log('🔄 [WorkflowDisplay] LLM response found:', llmResponse ? 'YES' : 'NO');
    if (llmResponse) {
      const responseMessage = llmResponse.message || llmResponse.response?.message || llmResponse.response;
      console.log('🔄 [WorkflowDisplay] Response message:', responseMessage);
      if (responseMessage) {
        // CRITICAL: Filter out confirmation messages that block the video player
        if (responseMessage.includes('Your choice has been confirmed') || 
            responseMessage.includes('choice has been confirmed') ||
            responseMessage.includes('processed that costs')) {
          console.log('🎬 [WorkflowDisplay] Filtering out confirmation message from execution context');
          // Still update iGas cost if available
          if (llmResponse.iGasCost || llmResponse.igas) {
            this.iGasCost = llmResponse.iGasCost || llmResponse.igas;
          }
          // CRITICAL: After confirmation, check if we should open video modal
          setTimeout(() => {
            if (execution.currentStep === 'view_movie') {
              const videoUrl = selectedListing?.videoUrl || 
                              context['selectedListing']?.['videoUrl'] ||
                              context['selectedListing2']?.['videoUrl'] ||
                              context['videoUrl'] || '';
              if (videoUrl && !this.showVideoModal) {
                console.log('🎬 [WorkflowDisplay] Opening video modal after confirmation in processExecutionMessages');
                this.openVideoModal(videoUrl, selectedListing?.movieTitle || context['movieTitle']);
              }
            }
          }, 500); // Wait 500ms after confirmation to ensure workflow has transitioned
          // Don't add this as an LLM response - it's a system message
        } else {
          const existingResponseEvent = this.llmResponses.find(r => r.type === 'response' && r.message === responseMessage);
          if (!existingResponseEvent) {
            const responseTimestamp = userInput 
              ? (this.llmResponses.find(r => r.type === 'start')?.timestamp || Date.now()) + 100
              : Date.now();
            
            console.log('🔄 [WorkflowDisplay] Adding LLM response event');
            this.addLlmResponse({
              type: 'response',
              message: responseMessage,
              data: llmResponse.response || llmResponse,
              timestamp: responseTimestamp,
              originalEvent: { type: 'llm_response', data: { response: llmResponse } },
              llmData: {
                response: llmResponse.response || llmResponse,
                iGasCost: llmResponse.iGasCost || llmResponse.igas,
                serviceType: llmResponse.serviceType || execution.serviceType,
                rawData: llmResponse
              }
            });
            
            // Update iGas cost if available
            if (llmResponse.iGasCost || llmResponse.igas) {
              this.iGasCost = llmResponse.iGasCost || llmResponse.igas;
              console.log('🔄 [WorkflowDisplay] Updated iGas cost:', this.iGasCost);
            }
          }
        }
      }
    }
    
    // Update selected listing if available
    const selectedListing = context['selectedListing'] || context['selectedListing2'] || llmResponse?.selectedListing || llmResponse?.selectedListing2;
    if (selectedListing) {
      this.selectedListing = selectedListing;
      console.log('🔄 [WorkflowDisplay] Updated selected listing:', selectedListing.movieTitle || selectedListing.name);
      console.log('🔄 [WorkflowDisplay] Selected listing videoUrl:', selectedListing.videoUrl);
    }
    
    // CRITICAL: For view_movie step, ensure videoUrl is available in pendingDecision
    // This is what makes the video player show up
    if (execution.currentStep === 'view_movie' || execution.currentStep === 'watch_movie') {
      console.log('🎬 [WorkflowDisplay] Movie viewing step detected, checking for videoUrl...');
      const videoUrl = selectedListing?.videoUrl || 
                      context['videoUrl'] || 
                      llmResponse?.selectedListing?.videoUrl ||
                      llmResponse?.selectedListing2?.videoUrl ||
                      context['selectedListing']?.['videoUrl'] ||
                      context['selectedListing2']?.['videoUrl'] ||
                      '';
      const movieTitle = selectedListing?.movieTitle ||
                        context['movieTitle'] ||
                        llmResponse?.selectedListing?.movieTitle ||
                        llmResponse?.selectedListing2?.movieTitle ||
                        context['selectedListing']?.['movieTitle'] ||
                        context['selectedListing2']?.['movieTitle'] ||
                        '';
      
      console.log('🎬 [WorkflowDisplay] Extracted videoUrl:', videoUrl);
      console.log('🎬 [WorkflowDisplay] Extracted movieTitle:', movieTitle);
      
      // If we have videoUrl but no pendingDecision yet, create one or update existing
      if (videoUrl) {
        if (!this.pendingDecision) {
          // Create a pending decision for view_movie step
          this.pendingDecision = {
            executionId: execution.executionId,
            stepId: execution.currentStep,
            prompt: 'Please watch the movie and click "Done Watching" when finished.',
            options: [
              { value: 'DONE_WATCHING', label: 'Done Watching' }
            ],
            timeout: 300000, // 5 minutes
            videoUrl: videoUrl,
            movieTitle: movieTitle
          };
          this.showDecisionPrompt = true;
          console.log('🎬 [WorkflowDisplay] Created pendingDecision for view_movie step with videoUrl');
          // Open video modal
          this.openVideoModal(videoUrl, movieTitle);
        } else if (!this.pendingDecision.videoUrl) {
          // Update existing pendingDecision with videoUrl
          this.pendingDecision.videoUrl = videoUrl;
          this.pendingDecision.movieTitle = movieTitle || this.pendingDecision.movieTitle;
          console.log('🎬 [WorkflowDisplay] Updated pendingDecision with videoUrl');
          // Open video modal
          this.openVideoModal(videoUrl, movieTitle);
        }
      }
    }
    
    // Update current step based on execution's current step
    // CRITICAL: Only update if workflow is loaded
    if (execution.currentStep && this.currentWorkflow) {
      const step = this.currentWorkflow.steps.find(s => s.id === execution.currentStep);
      if (step) {
        this.currentStep = step;
        this.currentStepIndex = this.currentWorkflow.steps.findIndex(s => s.id === step.id);
        console.log(`🔄 [WorkflowDisplay] Updated current step to: ${step.name} (${step.id}), index: ${this.currentStepIndex}`);
      } else {
        console.warn(`⚠️ [WorkflowDisplay] Step ${execution.currentStep} not found in workflow steps`);
        console.warn(`⚠️ [WorkflowDisplay] Available step IDs:`, this.currentWorkflow.steps.map(s => s.id));
      }
    } else {
      if (!execution.currentStep) {
        console.warn(`⚠️ [WorkflowDisplay] Execution has no currentStep`);
      }
      if (!this.currentWorkflow) {
        console.warn(`⚠️ [WorkflowDisplay] currentWorkflow is null`);
      }
    }
    
    // Update completed steps from execution history
    if (execution.history && execution.history.length > 0) {
      this.completedSteps = execution.history.map(h => h.step).filter((step, index, self) => self.indexOf(step) === index);
      console.log(`🔄 [WorkflowDisplay] Updated completed steps (${this.completedSteps.length}):`, this.completedSteps);
    }
    
    // CRITICAL: Final step debug logging
    const totalSteps = this.currentWorkflow?.steps?.length || 0;
    const isFinalStep = this.currentStepIndex >= totalSteps - 1;
    const lastStepId = this.currentWorkflow?.steps?.[totalSteps - 1]?.id;
    const isLastStepById = execution.currentStep === lastStepId;
    
    console.log('🔄 [WorkflowDisplay] After processing:');
    console.log('🔄 [WorkflowDisplay]   llmResponses.length:', this.llmResponses.length);
    console.log('🔄 [WorkflowDisplay]   currentStep:', this.currentStep?.id, this.currentStep?.name);
    console.log('🔄 [WorkflowDisplay]   currentStepIndex:', this.currentStepIndex);
    console.log('🔄 [WorkflowDisplay]   completedSteps.length:', this.completedSteps.length);
    console.log('🔄 [WorkflowDisplay]   currentWorkflow:', this.currentWorkflow?.name);
    console.log('🔄 [WorkflowDisplay]   debugWorkflowSteps.length:', this.debugWorkflowSteps.length);
    console.log('🏁 [WorkflowDisplay] ========================================');
    console.log('🏁 [WorkflowDisplay] FINAL STEP CHECK IN processExecutionMessages');
    console.log('🏁 [WorkflowDisplay] ========================================');
    console.log('🏁 [WorkflowDisplay] Execution currentStep:', execution.currentStep);
    console.log('🏁 [WorkflowDisplay] Current Step Index:', this.currentStepIndex);
    console.log('🏁 [WorkflowDisplay] Total Steps:', totalSteps);
    console.log('🏁 [WorkflowDisplay] Is Final Step (by index):', isFinalStep);
    console.log('🏁 [WorkflowDisplay] Is Last Step (by ID):', isLastStepById);
    console.log('🏁 [WorkflowDisplay] Last Step ID:', lastStepId);
    console.log('🏁 [WorkflowDisplay] Current Step ID:', this.currentStep?.id);
    console.log('🏁 [WorkflowDisplay] Current Step Name:', this.currentStep?.name);
    console.log('🏁 [WorkflowDisplay] Current Step Type:', this.currentStep?.type);
    console.log('🏁 [WorkflowDisplay] Current Step Component:', this.currentStep?.component);
    console.log('🏁 [WorkflowDisplay] Execution History:', execution.history?.map(h => `${h.step}@${new Date(h.timestamp).toLocaleTimeString()}`) || []);
    console.log('🏁 [WorkflowDisplay] Completed Steps:', this.completedSteps);
    console.log('🏁 [WorkflowDisplay] All Step IDs:', this.currentWorkflow?.steps?.map(s => s.id) || []);
    console.log('🏁 [WorkflowDisplay] Selected Listing:', this.selectedListing ? {
      movieTitle: this.selectedListing.movieTitle,
      videoUrl: this.selectedListing.videoUrl,
      providerName: this.selectedListing.providerName
    } : 'N/A');
    console.log('🏁 [WorkflowDisplay] Pending Decision:', this.pendingDecision ? {
      stepId: this.pendingDecision.stepId,
      videoUrl: this.pendingDecision.videoUrl,
      optionsCount: this.pendingDecision.options?.length || 0
    } : 'N/A');
    console.log('🏁 [WorkflowDisplay] ========================================');
    
    // Force change detection to update UI
    this.cdr.detectChanges();
  }
  
  /**
   * Open video player modal popup
   */
  openVideoModal(videoUrl: string, movieTitle?: string): void {
    if (!videoUrl) {
      console.warn('🎬 [WorkflowDisplay] Cannot open video modal - no videoUrl provided');
      return;
    }
    
    console.log('🎬 [WorkflowDisplay] ========================================');
    console.log('🎬 [WorkflowDisplay] Opening video modal');
    console.log('🎬 [WorkflowDisplay] videoUrl:', videoUrl);
    console.log('🎬 [WorkflowDisplay] movieTitle:', movieTitle);
    console.log('🎬 [WorkflowDisplay] Current showVideoModal:', this.showVideoModal);
    console.log('🎬 [WorkflowDisplay] ========================================');
    
    this.modalVideoUrl = videoUrl;
    this.modalMovieTitle = movieTitle || null;
    this.showVideoModal = true;
    
    // Force change detection multiple times to ensure modal shows
    this.cdr.detectChanges();
    setTimeout(() => {
      this.cdr.detectChanges();
      console.log('🎬 [WorkflowDisplay] Modal state after timeout:', {
        showVideoModal: this.showVideoModal,
        modalVideoUrl: this.modalVideoUrl,
        modalMovieTitle: this.modalMovieTitle
      });
    }, 100);
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
  }
  
  /**
   * Close video player modal popup
   */
  closeVideoModal(): void {
    console.log('🎬 [WorkflowDisplay] Closing video modal');
    this.showVideoModal = false;
    this.modalVideoUrl = null;
    this.modalMovieTitle = null;
    this.cdr.detectChanges();
    
    // Restore body scroll
    document.body.style.overflow = '';
  }
}

