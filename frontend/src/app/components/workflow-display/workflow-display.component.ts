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
  movieWorkflow: FlowWiseWorkflow | null = null;
  dexWorkflow: FlowWiseWorkflow | null = null;
  isLoading: boolean = false;
  selectedWorkflow: 'movie' | 'dex' | null = null;

  // Active workflow execution
  activeExecution: WorkflowExecution | null = null;
  currentStep: WorkflowStep | null = null;
  pendingDecision: UserDecisionRequest | null = null;
  showDecisionPrompt: boolean = false;

  // Selection support
  pendingSelection: any = null;
  showSelectionPrompt: boolean = false;

  // UI State
  workflowSteps: WorkflowStep[] = [];
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

  // Computed properties for template bindings (avoiding filter() in templates)
  get processingCount(): number {
    return this.llmResponses.filter(r => r.type === 'start').length;
  }

  get responseCount(): number {
    return this.llmResponses.filter(r => r.type === 'response').length;
  }

  // Debug getter for template
  get debugWorkflowSteps(): any[] {
    if (this.movieWorkflow && this.movieWorkflow.steps) {
      return this.movieWorkflow.steps;
    }
    return [];
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

    this.loadWorkflows();
    this.loadLlmHistory();

    // Listen for workflow decision requests
    this.flowWiseService.getDecisionRequests().subscribe((decisionRequest: UserDecisionRequest) => {
      console.log('🤔 [WorkflowDisplay] Decision required:', decisionRequest);
      this.pendingDecision = decisionRequest;
      this.showDecisionPrompt = true;
      this.cdr.detectChanges();
    });

    // Listen for WebSocket events (LLM responses, etc.)
    this.webSocketService.events$.subscribe((event: SimulatorEvent) => {
      this.handleWebSocketEvent(event);
    });
  }

  ngOnDestroy() {
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
            this.cdr.detectChanges(); // Ensure UI updates

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
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('❌ [WorkflowDisplay] Failed to load movie workflow:', err);
          console.error('❌ [WorkflowDisplay] Error details:', err.status, err.statusText, err.url);
          this.isLoading = false;
          this.cdr.detectChanges();
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

  selectWorkflow(workflowType: 'movie' | 'dex') {
    this.selectedWorkflow = workflowType;
    this.initializeWorkflowDisplay(workflowType);
  }

  private initializeWorkflowDisplay(workflowType: 'movie' | 'dex') {
    const workflow = workflowType === 'movie' ? this.movieWorkflow : this.dexWorkflow;
    if (!workflow) {
      console.log('🔄 [WorkflowDisplay] initializeWorkflowDisplay: No workflow found for type:', workflowType);
      return;
    }

    console.log('🔄 [WorkflowDisplay] initializeWorkflowDisplay:', workflowType, 'initialStep:', workflow.initialStep);
    console.log('🔄 [WorkflowDisplay] Workflow steps count:', workflow.steps.length);
    console.log('🔄 [WorkflowDisplay] First step ID:', workflow.steps[0]?.id);

    this.workflowSteps = workflow.steps;
    this.completedSteps = [];
    this.currentStepIndex = 0;
    this.currentStep = workflow.steps.find(step => step.id === workflow.initialStep) || null;

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

    // Update completed steps
    if (this.activeExecution) {
      this.completedSteps = this.activeExecution.history.map(h => h.step);
    }

    // Find current step index
    this.currentStepIndex = workflow.steps.findIndex(step => step.id === this.currentStep?.id);
    
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
    // Check cache first to avoid repeated calculations
    if (this.stepStatusCache.has(stepId)) {
      return this.stepStatusCache.get(stepId)!;
    }

    // Calculate status
    let status: string;
    
    // For now, hardcode the Eden Chat Input step as current
    if (stepId === 'eden_chat_input') {
      status = 'current';
    } else if (this.completedSteps.includes(stepId)) {
      status = 'completed';
    } else if (this.activeExecution && this.activeExecution.currentStep === stepId) {
      status = 'current';
    } else {
      status = 'pending';
    }

    // Cache the result
    this.stepStatusCache.set(stepId, status);
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
    // Try common title fields
    return option.data?.movieTitle ||
           option.data?.name ||
           option.data?.title ||
           option.label ||
           'Option';
  }

  getDisplayFields(option: any): any[] {
    if (!option.data) return [];

    const fields = [];
    const excludeFields = ['id', 'movieTitle', 'name', 'title']; // Fields already used in title

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
    // Human-readable labels for common fields
    const labels: { [key: string]: string } = {
      'showtime': 'Showtime',
      'price': 'Price',
      'providerName': 'Theater',
      'providerId': 'Provider ID',
      'movieId': 'Movie ID',
      'rating': 'Rating',
      'genre': 'Genre',
      'duration': 'Duration',
      'location': 'Location',
      'serviceType': 'Type'
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
    console.log('📡 [WorkflowDisplay] Received event:', event.type, event);

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
        console.log('🎬 [WorkflowDisplay] Movie selection required:', event.data);
        this.pendingSelection = {
          executionId: event.data.workflowId,
          stepId: event.data.stepId,
          prompt: event.data.prompt,
          options: event.data.options || [],
          timeout: event.data.timeout || 60000
        };
        this.showSelectionPrompt = true;
        this.cdr.detectChanges();
        break;

      case 'workflow_step_changed':
        console.log('🔄 [WorkflowDisplay] Workflow step changed:', event.data);
        // Update the current step display when workflow progresses
        // Only update if workflow is loaded
        if (this.selectedWorkflow && ((this.selectedWorkflow === 'movie' && this.movieWorkflow) || (this.selectedWorkflow === 'dex' && this.dexWorkflow))) {
          this.updateCurrentStep();
          
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

      default:
        // Other events (ledger, payment, etc.) can be handled here if needed
        break;
    }

    this.cdr.detectChanges();
  }
}

