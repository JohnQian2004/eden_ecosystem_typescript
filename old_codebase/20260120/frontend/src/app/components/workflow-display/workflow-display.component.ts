import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FlowWiseService, FlowWiseWorkflow, WorkflowStep, WorkflowExecution, UserDecisionRequest } from '../../services/flowwise.service';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';
import { MovieTheaterComponent } from '../../movie-theater/movie-theater.component';

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

  // Cache for step statuses to avoid repeated calculations
  private stepStatusCache: Map<string, string> = new Map();

  // Scope UI to the most recent execution so "new chat" always clears the console output
  private activeExecutionId: string | null = null;
  private onWorkflowStartedEvt: any;
  private onChatResetEvt: any;

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

  public apiUrl = window.location.port === '4200'
    ? 'http://localhost:3000'
    : '';

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
    this.flowWiseService.getDecisionRequests().subscribe((decisionRequest: UserDecisionRequest) => {
      console.log('🤔 [WorkflowDisplay] Decision required:', decisionRequest);
      console.log('🤔 [WorkflowDisplay] Decision request options:', decisionRequest.options);
      console.log('🤔 [WorkflowDisplay] Options count:', decisionRequest.options?.length || 0);
      
      this.pendingDecision = decisionRequest;
      this.showDecisionPrompt = true;
      
      console.log('🤔 [WorkflowDisplay] Set pendingDecision and showDecisionPrompt=true');
      console.log('🤔 [WorkflowDisplay] pendingDecision:', this.pendingDecision);
      console.log('🤔 [WorkflowDisplay] showDecisionPrompt:', this.showDecisionPrompt);
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

    // Listen for active workflow executions and update display
    // Check for active executions periodically (only when needed)
    let lastExecutionId: string | null = null;
    const executionCheckInterval = setInterval(() => {
      const latestExecution = this.flowWiseService.getLatestActiveExecution();
      
      // Only update if execution actually changed
      if (latestExecution && latestExecution.executionId !== lastExecutionId) {
        lastExecutionId = latestExecution.executionId;
        console.log(`🔄 [WorkflowDisplay] Active execution detected: ${latestExecution.serviceType} (${latestExecution.executionId})`);
        this.resetForNewExecution(String(latestExecution.executionId));
        this.activeExecution = latestExecution;
        this.selectedWorkflow = latestExecution.serviceType;
        
        // Get the workflow for this execution
        const workflow = this.flowWiseService.getWorkflow(latestExecution.serviceType);
        if (workflow) {
          console.log(`✅ [WorkflowDisplay] Found workflow for ${latestExecution.serviceType}: ${workflow.name}`);
          // Store in legacy properties for backward compatibility
          if (latestExecution.serviceType === 'movie') {
            this.movieWorkflow = workflow;
          } else if (latestExecution.serviceType === 'dex') {
            this.dexWorkflow = workflow;
          }
          // Update current workflow property (no getter, just set it)
          this.currentWorkflow = workflow;
          this.updateDebugWorkflowSteps();
          this.initializeWorkflowDisplay(latestExecution.serviceType);
        } else {
          console.warn(`⚠️ [WorkflowDisplay] Workflow not found for ${latestExecution.serviceType}, attempting to load...`);
          // Try to load the workflow if it's not in cache
          this.flowWiseService.loadWorkflowIfNeeded(latestExecution.serviceType);
        }
      } else if (!latestExecution && this.activeExecution) {
        // Execution was cleared
        console.log(`🔄 [WorkflowDisplay] Active execution cleared`);
        lastExecutionId = null;
        this.activeExecution = null;
        this.activeExecutionId = null;
        this.updateCurrentWorkflow();
        this.updateDebugWorkflowSteps();
      }
    }, 1000); // Check every 1 second (less frequent)
    
    // Store interval ID for cleanup
    (this as any)._executionCheckInterval = executionCheckInterval;

    // Listen for WebSocket events (LLM responses, etc.)
    console.log('📡 [WorkflowDisplay] Subscribing to WebSocket events...');
    this.webSocketService.events$.subscribe((event: SimulatorEvent) => {
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
    if ((this as any)._executionCheckInterval) {
      clearInterval((this as any)._executionCheckInterval);
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

  private updateCurrentStep() {
    console.log('🔄 [WorkflowDisplay] updateCurrentStep called - activeExecution:', !!this.activeExecution, 'selectedWorkflow:', this.selectedWorkflow);
    console.log('🔄 [WorkflowDisplay] movieWorkflow exists:', !!this.movieWorkflow, 'dexWorkflow exists:', !!this.dexWorkflow);

    if (!this.selectedWorkflow) {
      console.log('🔄 [WorkflowDisplay] No selectedWorkflow, cannot update current step');
      return;
    }

    const workflow = this.selectedWorkflow === 'movie' ? this.movieWorkflow : this.dexWorkflow;
    if (!workflow) {
      console.log('🔄 [WorkflowDisplay] No workflow found for selectedWorkflow:', this.selectedWorkflow);
      return;
    }

    console.log('🔄 [WorkflowDisplay] Using workflow:', workflow.name, 'with initialStep:', workflow.initialStep);

    let newCurrentStep: WorkflowStep | null = null;

    if (this.activeExecution) {
      // If there's an active execution, use its current step
      newCurrentStep = workflow.steps.find(step => step.id === this.activeExecution?.currentStep) || null;
      console.log('🔄 [WorkflowDisplay] Active execution found, setting currentStep to:', newCurrentStep?.name || 'null');
    } else {
      // If no active execution, show the initial step as current
      newCurrentStep = workflow.steps.find(step => step.id === workflow.initialStep) || null;
      console.log('🔄 [WorkflowDisplay] No active execution, setting currentStep to initial step:', newCurrentStep?.name || 'null');
    }

    this.currentStep = newCurrentStep;
    console.log('🔄 [WorkflowDisplay] FINAL currentStep set to:', this.currentStep?.name || 'null');

    // Update completed steps from execution history
    if (this.activeExecution) {
      this.completedSteps = this.activeExecution.history.map(h => h.step);
      // Also mark any step before current step as completed
      const currentStepIndex = workflow.steps.findIndex(step => step.id === this.activeExecution?.currentStep);
      if (currentStepIndex > 0) {
        for (let i = 0; i < currentStepIndex; i++) {
          const stepId = workflow.steps[i].id;
          if (!this.completedSteps.includes(stepId)) {
            this.completedSteps.push(stepId);
          }
        }
      }
    }

    // Find current step index - use activeExecution.currentStep if available, otherwise use currentStep
    if (this.activeExecution && this.activeExecution.currentStep) {
      this.currentStepIndex = workflow.steps.findIndex(step => step.id === this.activeExecution?.currentStep);
      // If not found, fall back to currentStep
      if (this.currentStepIndex === -1) {
        this.currentStepIndex = workflow.steps.findIndex(step => step.id === this.currentStep?.id);
      }
    } else {
      this.currentStepIndex = workflow.steps.findIndex(step => step.id === this.currentStep?.id);
    }
    
    // Ensure index is at least 0
    if (this.currentStepIndex < 0) {
      this.currentStepIndex = 0;
    }
    
    console.log('🔄 [WorkflowDisplay] Step index updated:', this.currentStepIndex + 1, 'of', workflow.steps.length, 'currentStep:', this.currentStep?.name, 'activeExecution.currentStep:', this.activeExecution?.currentStep);
    
    // Clear status cache when step changes
    this.clearStatusCache();

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

    console.log(`✅ [WorkflowDisplay] Submitting decision: ${decision}`);

    try {
      const submitted = await this.flowWiseService.submitDecision(this.pendingDecision.executionId, decision, this.pendingDecision.stepId);

      if (submitted) {
        this.showDecisionPrompt = false;
        this.pendingDecision = null;
        this.updateCurrentStep();
      } else {
        console.error('❌ [WorkflowDisplay] Failed to submit decision');
        alert('Failed to submit decision. Please try again.');
      }
    } catch (error) {
      console.error('❌ [WorkflowDisplay] Error submitting decision:', error);
      alert('Failed to submit decision. Please try again.');
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

    console.log(`✅ [WorkflowDisplay] Submitting movie selection:`, selectedOption);

    // Send the selection to the server
    const baseUrl = window.location.port === '4200'
      ? 'http://localhost:3000'
      : '';

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
      }
    });
  }

  private handleWebSocketEvent(event: SimulatorEvent): void {
    console.log('📡 [WorkflowDisplay] ========================================');
    console.log('📡 [WorkflowDisplay] Received WebSocket event:', event.type);
    console.log('📡 [WorkflowDisplay] Full event:', JSON.stringify(event, null, 2));
    console.log('📡 [WorkflowDisplay] Event data:', JSON.stringify(event.data, null, 2));
    console.log('📡 [WorkflowDisplay] ========================================');

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
      if (this.activeExecutionId === '__pending__') return;
      // If event doesn't carry an execution id, ignore (prevents old noise from re-populating after reset)
      if (!evExecId) return;
      if (String(evExecId) !== this.activeExecutionId) return;
    }

    switch (event.type) {
      case 'llm_start':
        console.log('🤖 [WorkflowDisplay] LLM processing started');
        this.addLlmResponse({
          type: 'start',
          message: event.message,
          timestamp: event.timestamp,
          originalEvent: event // Preserve original event data
        });
        break;

      case 'llm_response':
        console.log('🤖 [WorkflowDisplay] LLM response received:', event.data);
        const llmResponse = {
          type: 'response',
          message: event.message,
          data: event.data?.response,
          timestamp: event.timestamp,
          originalEvent: event, // Preserve complete original event
          // Extract key LLM data for easy access
          llmData: {
            response: event.data?.response,
            iGasCost: event.data?.igas,
            serviceType: event.data?.serviceType,
            rawData: event.data
          }
        };
        this.addLlmResponse(llmResponse);
        break;

      case 'igas':
        console.log('⛽ [WorkflowDisplay] iGas cost:', event.data?.igas);
        this.iGasCost = event.data?.igas || null;
        break;

      case 'user_decision_required':
        // This is handled by the FlowWise service subscription above
        break;

      case 'user_selection_required':
        console.log('🎬 [WorkflowDisplay] ========================================');
        console.log('🎬 [WorkflowDisplay] SELECTION REQUIRED EVENT RECEIVED');
        console.log('🎬 [WorkflowDisplay] Full event:', JSON.stringify(event, null, 2));
        console.log('🎬 [WorkflowDisplay] Event data:', event.data);
        console.log('🎬 [WorkflowDisplay] Event data.options:', event.data?.options);
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
        // Only update if workflow is loaded
        if (this.selectedWorkflow && ((this.selectedWorkflow === 'movie' && this.movieWorkflow) || (this.selectedWorkflow === 'dex' && this.dexWorkflow))) {
          // Update active execution current step if available
          if (this.activeExecution && event.data?.stepId) {
            const previousStep = this.activeExecution.currentStep;
            this.activeExecution.currentStep = event.data.stepId;
            
            // Mark previous step as completed
            if (previousStep && previousStep !== event.data.stepId) {
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
        // Other events (ledger, payment, etc.) can be handled here if needed
        break;
    }
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
}

