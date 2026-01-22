import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FlowWiseService, FlowWiseWorkflow, WorkflowStep, WorkflowExecution, UserDecisionRequest } from '../../services/flowwise.service';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';
import { MovieTheaterComponent } from '../../movie-theater/movie-theater.component';
import { getApiBaseUrl } from '../../services/api-base';

@Component({
  selector: 'app-workflow-display2',
  templateUrl: './workflow-display2.component.html',
  styleUrls: ['./workflow-display2.component.scss']
})
export class WorkflowDisplay2Component implements OnInit, OnDestroy {
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

  // LLM Response State
  llmResponses: any[] = [];
  latestLlmResponse: any = null;
  iGasCost: number | null = null;

  // Movie theater state
  selectedListing: any = null;

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
  
  // Update current workflow based on active execution or selected workflow
  private updateCurrentWorkflow(): void {
    // Priority 1: Get workflow from active execution
    if (this.activeExecution) {
      const workflow = this.flowWiseService.getWorkflow(this.activeExecution.serviceType);
      if (workflow) {
        this.currentWorkflow = workflow;
        return;
      }
    }
    
    // Priority 2: Get workflow from selected workflow
    if (this.selectedWorkflow) {
      const workflow = this.flowWiseService.getWorkflow(this.selectedWorkflow);
      if (workflow) {
        this.currentWorkflow = workflow;
        return;
      }
    }
    
    // Priority 3: Fallback to legacy properties
    const legacyWorkflow = this.movieWorkflow || this.dexWorkflow;
    if (legacyWorkflow) {
      this.currentWorkflow = legacyWorkflow;
      return;
    }
    
    this.currentWorkflow = null;
  }

  private readonly LLM_HISTORY_KEY = 'eden_llm_history_workflow2';
  private readonly MAX_HISTORY_ITEMS = 50; // Keep last 50 responses

  public apiUrl = getApiBaseUrl();

  constructor(
    private http: HttpClient,
    private flowWiseService: FlowWiseService,
    private webSocketService: WebSocketService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
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
    // CRITICAL: Only handle decisions if this component is in the active tab
    // This prevents conflicts when both workflow-display and workflow-chat-display are active
    this.flowWiseService.getDecisionRequests().subscribe((decisionRequest: UserDecisionRequest) => {
      // CRITICAL: Check visibility FIRST before doing anything
      // workflow-display2 is only visible when activeTab === 'workflow2'
      if (!this.isComponentInActiveTab()) {
        return; // Don't handle decision if component is not visible - let workflow-chat-display handle it
      }
      
      // CRITICAL: If videoUrl is missing but stepId is view_movie, try to get it from active execution
      if (decisionRequest.stepId === 'view_movie' && !decisionRequest.videoUrl && this.activeExecution) {
        const context = this.activeExecution.context || {};
        const videoUrl = context['selectedListing']?.['videoUrl'] || 
                        context['selectedListing2']?.['videoUrl'] ||
                        context['videoUrl'] || '';
        const movieTitle = context['selectedListing']?.['movieTitle'] || 
                          context['selectedListing2']?.['movieTitle'] ||
                          context['movieTitle'] || '';
        
        if (videoUrl) {
          decisionRequest.videoUrl = videoUrl;
          decisionRequest.movieTitle = movieTitle || decisionRequest.movieTitle;
        }
      }
      
      // CRITICAL: Clear any pending selection when a decision is required
      if (this.showSelectionPrompt || this.pendingSelection) {
        this.showSelectionPrompt = false;
        this.pendingSelection = null;
      }
      
      this.pendingDecision = decisionRequest;
      this.showDecisionPrompt = true;
      
      // Force change detection to update UI immediately
      this.cdr.detectChanges();
    });

    // Listen for selection requests (from HTTP responses AND WebSocket)
    this.flowWiseService.getSelectionRequests().subscribe({
      next: (selectionEvent: any) => {
        // Only handle if this component is in the active tab
        const isComponentVisible = this.isComponentInActiveTab();
        if (!isComponentVisible) {
          return; // Don't handle selection if component is not visible
        }
        // Handle it the same way as WebSocket events
        if (selectionEvent) {
          this.handleWebSocketEvent(selectionEvent as SimulatorEvent);
        }
      },
      error: (error) => {
        console.error('❌ [WorkflowDisplay2] Error in selection request subscription:', error);
      },
      complete: () => {
        console.warn('⚠️ [WorkflowDisplay2] Selection request subscription completed (unexpected)');
      }
    });

    // Listen for active workflow executions and update display
    // Check for active executions periodically (only when needed)
    let lastExecutionId: string | null = null;
    const executionCheckInterval = setInterval(() => {
      // Only check if this component is in the active tab
      const isComponentVisible = this.isComponentInActiveTab();
      if (!isComponentVisible) {
        return; // Don't process if component is not visible
      }
      
      const latestExecution = this.flowWiseService.getLatestActiveExecution();
      
      // Only update if execution actually changed
      if (latestExecution && latestExecution.executionId !== lastExecutionId) {
        lastExecutionId = latestExecution.executionId;
        this.resetForNewExecution(String(latestExecution.executionId));
        this.activeExecution = latestExecution;
        this.selectedWorkflow = latestExecution.serviceType;
        
        // Get the workflow for this execution
        const workflow = this.flowWiseService.getWorkflow(latestExecution.serviceType);
        if (workflow) {
          // Store in legacy properties for backward compatibility
          if (latestExecution.serviceType === 'movie') {
            this.movieWorkflow = workflow;
          } else if (latestExecution.serviceType === 'dex') {
            this.dexWorkflow = workflow;
          }
          // Update current workflow property (no getter, just set it)
          this.currentWorkflow = workflow;
          this.initializeWorkflowDisplay(latestExecution.serviceType);
        } else {
          // Try to load the workflow if it's not in cache
          this.flowWiseService.loadWorkflowIfNeeded(latestExecution.serviceType);
        }
      } else if (!latestExecution && this.activeExecution) {
        // Execution was cleared
        lastExecutionId = null;
        this.activeExecution = null;
        this.activeExecutionId = null;
        this.updateCurrentWorkflow();
      }
    }, 1000); // Check every 1 second (less frequent)
    
    // Store interval ID for cleanup
    (this as any)._executionCheckInterval = executionCheckInterval;

    // Listen for WebSocket events (LLM responses, etc.)
    this.webSocketService.events$.subscribe((event: SimulatorEvent) => {
      // Only handle if this component is in the active tab
      const isComponentVisible = this.isComponentInActiveTab();
      if (!isComponentVisible) {
        return; // Don't handle WebSocket events if component is not visible
      }
      this.handleWebSocketEvent(event);
    });
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
  }

  loadWorkflows() {
    this.isLoading = true;

    // Load movie workflow
    this.http.get<{ success: boolean; flowwiseWorkflow: FlowWiseWorkflow; error?: string }>(`${this.apiUrl}/api/workflow/movie`)
      .subscribe({
        next: (data) => {
          if (data.success && data.flowwiseWorkflow) {
            this.movieWorkflow = data.flowwiseWorkflow;
            if (!this.selectedWorkflow) {
              this.selectedWorkflow = 'movie';
              this.initializeWorkflowDisplay('movie');
            }
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('❌ [WorkflowDisplay2] Failed to load movie workflow:', err);
          this.isLoading = false;
        }
      });

    // Load DEX workflow
    this.http.get<{ success: boolean; flowwiseWorkflow: FlowWiseWorkflow; error?: string }>(`${this.apiUrl}/api/workflow/dex`)
      .subscribe({
        next: (data) => {
          if (data.success && data.flowwiseWorkflow) {
            this.dexWorkflow = data.flowwiseWorkflow;
          }
        },
        error: (err) => {
          console.error('❌ [WorkflowDisplay2] Failed to load DEX workflow:', err);
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
      return;
    }

    // TypeScript guard: ensure workflow is not null and has required properties
    if (!workflow || !workflow.steps || !workflow.initialStep) {
      console.error(`❌ [WorkflowDisplay2] Workflow ${workflowType} is invalid or missing required properties`);
      return;
    }

    // At this point, TypeScript knows workflow is not null, but we'll use a local const for clarity
    const validWorkflow = workflow;
    const initialStepId = validWorkflow.initialStep;

    this.currentStep = validWorkflow.steps.find(step => step.id === initialStepId) || null;

    this.activeExecution = null;
    this.pendingDecision = null;
    this.showDecisionPrompt = false;
  }

  startWorkflow() {
    if (!this.selectedWorkflow) return;

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

    if (this.activeExecution) {
      this.updateCurrentStep();
    } else {
      console.error('❌ [WorkflowDisplay2] Failed to start workflow - no execution returned');
    }
  }

  async executeStepManually(step: WorkflowStep) {
    if (!this.activeExecution) {
      alert('Please start the workflow first before executing individual steps.');
      return;
    }

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

        // Add to workflow messages and history
        if (this.activeExecution) {
          this.activeExecution.history.push({
            step: step.id,
            timestamp: Date.now(),
            data: { manualExecution: true }
          });
        }

        this.updateCurrentStep();
      } else {
        alert(`Failed to execute step "${step.name}". Check console for details.`);
      }
    } catch (error) {
      console.error('❌ [WorkflowDisplay2] Error executing step manually:', error);
      alert(`Error executing step "${step.name}": ${error}`);
    }
  }

  private updateCurrentStep() {
    if (!this.selectedWorkflow) {
      return;
    }

    const workflow = this.selectedWorkflow === 'movie' ? this.movieWorkflow : this.dexWorkflow;
    if (!workflow) {
      return;
    }

    let newCurrentStep: WorkflowStep | null = null;

    if (this.activeExecution) {
      // If there's an active execution, use its current step
      newCurrentStep = workflow.steps.find(step => step.id === this.activeExecution?.currentStep) || null;
    } else {
      // If no active execution, show the initial step as current
      newCurrentStep = workflow.steps.find(step => step.id === workflow.initialStep) || null;
    }

    this.currentStep = newCurrentStep;
  }

  async submitDecision(decision: string) {
    if (!this.pendingDecision) {
      return;
    }

    try {
      const submitted = await this.flowWiseService.submitDecision(this.pendingDecision.executionId, decision, this.pendingDecision.stepId);

      if (submitted) {
        this.showDecisionPrompt = false;
        this.pendingDecision = null;
        // Wait a bit before updating step to allow backend to process
        setTimeout(() => {
          this.updateCurrentStep();
        }, 500);
      } else {
        console.error('❌ [WorkflowDisplay2] Failed to submit decision - service returned false');
        alert('Failed to submit decision. Please try again.');
      }
    } catch (error: any) {
      console.error('❌ [WorkflowDisplay2] Error submitting decision:', error);
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

  // Video event handlers to help fix Windows player issues
  onVideoLoadStart(event: Event, videoUrl?: string): void {
    const video = event.target as HTMLVideoElement;
    // Force reload if src doesn't match (Windows player fix)
    if (videoUrl) {
      const expectedSrc = this.getVideoUrl(videoUrl);
      if (video.src !== expectedSrc) {
        video.src = expectedSrc;
        video.load();
        this.cdr.detectChanges();
      }
    }
  }

  onVideoLoadedData(event: Event, videoUrl?: string): void {
    // Video data loaded successfully
  }

  onVideoError(event: Event, videoUrl?: string): void {
    const video = event.target as HTMLVideoElement;
    // Try to reload the video (Windows player fix)
    if (videoUrl) {
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
        } else {
          this.llmResponses = [];
        }
      }
    } catch (error) {
      this.llmResponses = [];
    }
  }

  private saveLlmHistory(): void {
    try {
      // Keep only the most recent responses
      const recentResponses = this.llmResponses.slice(-this.MAX_HISTORY_ITEMS);
      localStorage.setItem(this.LLM_HISTORY_KEY, JSON.stringify(recentResponses));
    } catch (error) {
      // Silently fail
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
      link.download = `llm-history-workflow2-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      // Silently fail
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
      return;
    }

    try {
      // Trigger workflow continuation by executing the next step transition
      const nextStepId = await this.flowWiseService.executeWorkflowStep(
        this.activeExecution.executionId,
        'watch_movie', // Current step
        this.activeExecution.context // Pass updated context with movieWatched: true
      );

      if (nextStepId) {
        // Update to the next step
        this.updateCurrentStep();
      }
    } catch (error: any) {
      console.error('❌ [WorkflowDisplay2] Failed to continue workflow after movie:', error);
    }
  }

  submitMovieSelection(selectedOption: any) {
    if (!this.pendingSelection) {
      return;
    }

    // CRITICAL: Check if the workflow is at view_movie step
    const currentStep = this.activeExecution?.currentStep || this.currentStep?.id || this.pendingSelection?.stepId;
    
    if (currentStep === 'view_movie') {
      alert('Cannot submit movie selection at this step. The workflow is waiting for you to click "Done Watching".');
      this.showSelectionPrompt = false;
      this.pendingSelection = null;
      this.cdr.detectChanges();
      return;
    }

    // Store the selection data for the FlowWise service
    if (this.activeExecution) {
      this.activeExecution.context['userSelection'] = selectedOption.data;
    }

    this.http.post(`${this.apiUrl}/api/workflow/decision`, {
      workflowId: this.pendingSelection.executionId,
      decision: selectedOption.value,
      selectionData: selectedOption.data
    }).subscribe({
      next: (response: any) => {
        this.showSelectionPrompt = false;
        this.pendingSelection = null;
      },
      error: (error) => {
        console.error('❌ [WorkflowDisplay2] Failed to submit movie selection:', error);
        if (error.status === 400 && error.error?.code === 'INVALID_SELECTION_FOR_VIEW_MOVIE') {
          alert('Cannot submit movie selection at this step. The workflow is waiting for you to click "Done Watching".');
        }
      }
    });
  }

  private handleWebSocketEvent(event: SimulatorEvent): void {
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
        this.addLlmResponse({
          type: 'start',
          message: event.message,
          timestamp: event.timestamp,
          originalEvent: event
        });
        break;

      case 'llm_response':
        const llmResponse = {
          type: 'response',
          message: event.message,
          data: event.data?.response,
          timestamp: event.timestamp,
          originalEvent: event,
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
        this.iGasCost = event.data?.igas || null;
        break;

      case 'user_decision_required':
        // This is handled by the FlowWise service subscription above
        break;

      case 'user_selection_required':
        // CRITICAL: If workflow is at view_movie step, ignore selection events
        const currentStepForSelection = this.activeExecution?.currentStep || this.currentStep?.id || event.data?.stepId;
        if (currentStepForSelection === 'view_movie') {
          break;
        }
        
        // Ensure options is an array
        let selectionOptions = event.data?.options;
        if (!Array.isArray(selectionOptions)) {
          selectionOptions = (event.data as any).options || [];
        }
        
        this.pendingSelection = {
          executionId: event.data?.workflowId || event.data?.executionId || 'unknown',
          stepId: event.data?.stepId || 'unknown',
          prompt: event.data?.prompt || event.message || 'Please select an option:',
          options: selectionOptions,
          timeout: event.data?.timeout || 60000
        };
        
        this.showSelectionPrompt = true;
        this.showDecisionPrompt = false; // Clear decision prompt if selection is shown
        break;

      case 'workflow_step_changed':
        // Update the current step display when workflow progresses
        if (this.selectedWorkflow && ((this.selectedWorkflow === 'movie' && this.movieWorkflow) || (this.selectedWorkflow === 'dex' && this.dexWorkflow))) {
          // Update active execution current step if available
          if (this.activeExecution && event.data?.stepId) {
            const previousStep = this.activeExecution.currentStep;
            const newStep = event.data.stepId;
            this.activeExecution.currentStep = newStep;
            
            // CRITICAL: If transitioning to view_movie, clear any pending selection prompts
            if (newStep === 'view_movie') {
              this.showSelectionPrompt = false;
              this.pendingSelection = null;
            }
            
            // Add to execution history if not already there
            if (previousStep && previousStep !== newStep) {
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
            }
          }
          
          this.updateCurrentStep();
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
        }
        break;

      default:
        // Other events (ledger, payment, etc.) can be handled here if needed
        break;
    }
  }

  /**
   * Check if this component is in the active tab
   * workflow-display2 is only visible when activeTab === 'workflow2'
   */
  private isComponentInActiveTab(): boolean {
    // Check if the workflow2 tab pane is visible
    const workflowPane = document.getElementById('workflow2-pane');
    if (!workflowPane) {
      return false; // Tab pane doesn't exist
    }
    
    // Check if the tab pane has 'show active' classes (Bootstrap tab active state)
    const hasActiveClass = workflowPane.classList.contains('show') && workflowPane.classList.contains('active');
    
    // Also check if component is actually visible in DOM
    const isVisible = workflowPane.offsetParent !== null;
    
    // Also check the tab button to ensure it's active
    const tabButton = document.getElementById('workflow2-tab');
    const isTabButtonActive = tabButton?.classList.contains('active') || false;
    
    return hasActiveClass && isVisible && isTabButtonActive;
  }

  private resetForNewExecution(executionId: string): void {
    this.activeExecutionId = executionId;

    // Clear "console output" (LLM history panel) + prompts + step state
    this.llmResponses = [];
    this.latestLlmResponse = null;
    this.iGasCost = null;
    this.selectedListing = null;
    this.pendingDecision = null;
    this.showDecisionPrompt = false;
    this.pendingSelection = null;
    this.showSelectionPrompt = false;

    // Also clear persisted LLM history so it doesn't re-hydrate old output
    try {
      localStorage.removeItem(this.LLM_HISTORY_KEY);
    } catch {}

    this.cdr.detectChanges();
  }
}

