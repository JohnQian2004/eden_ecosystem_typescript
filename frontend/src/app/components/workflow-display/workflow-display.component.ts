import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FlowWiseService, FlowWiseWorkflow, WorkflowStep, WorkflowExecution, UserDecisionRequest } from '../../services/flowwise.service';

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

  // UI State
  workflowSteps: WorkflowStep[] = [];
  completedSteps: string[] = [];
  currentStepIndex: number = 0;

  public apiUrl = window.location.port === '4200'
    ? 'http://localhost:3000'
    : '';

  constructor(
    private http: HttpClient,
    private flowWiseService: FlowWiseService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    console.log('🎬 [WorkflowDisplay] Component initialized');
    console.log('🔗 [WorkflowDisplay] API URL:', this.apiUrl);

    this.loadWorkflows();

    // Listen for workflow decision requests
    this.flowWiseService.getDecisionRequests().subscribe((decisionRequest: UserDecisionRequest) => {
      console.log('🤔 [WorkflowDisplay] Decision required:', decisionRequest);
      this.pendingDecision = decisionRequest;
      this.showDecisionPrompt = true;
      this.cdr.detectChanges();
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
            if (!this.selectedWorkflow) {
              this.selectedWorkflow = 'movie';
              this.initializeWorkflowDisplay('movie');
            }
          } else {
            console.error('❌ [WorkflowDisplay] Movie workflow API returned success=false:', data.error);
          }
          this.isLoading = false;
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
    if (!workflow) return;

    this.workflowSteps = workflow.steps;
    this.completedSteps = [];
    this.currentStepIndex = 0;
    this.currentStep = workflow.steps.find(step => step.id === workflow.initialStep) || null;
    this.activeExecution = null;
    this.pendingDecision = null;
    this.showDecisionPrompt = false;
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
    if (!this.activeExecution || !this.selectedWorkflow) return;

    const workflow = this.selectedWorkflow === 'movie' ? this.movieWorkflow : this.dexWorkflow;
    if (!workflow) return;

    this.currentStep = workflow.steps.find(step => step.id === this.activeExecution?.currentStep) || null;

    // Update completed steps
    this.completedSteps = this.activeExecution.history.map(h => h.step);

    // Find current step index
    this.currentStepIndex = workflow.steps.findIndex(step => step.id === this.currentStep?.id);

    // Special handling for Eden Chat input step
    if (this.currentStep?.component === 'eden_chat' && this.currentStep?.type === 'input') {
      console.log('🎬 [WorkflowDisplay] Eden Chat input step active - user should use main chat interface');
      // This step is handled by the main chat interface, not this component
    }
  }

  submitDecision(decision: string) {
    if (!this.pendingDecision) {
      console.error('❌ [WorkflowDisplay] No pending decision to submit');
      return;
    }

    console.log(`✅ [WorkflowDisplay] Submitting decision: ${decision}`);
    const submitted = this.flowWiseService.submitDecision(this.pendingDecision.executionId, decision);

    if (submitted) {
      this.showDecisionPrompt = false;
      this.pendingDecision = null;
      this.updateCurrentStep();
    } else {
      console.error('❌ [WorkflowDisplay] Failed to submit decision');
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
    if (this.completedSteps.includes(stepId)) {
      return 'completed';
    } else if (this.currentStep?.id === stepId) {
      return 'current';
    } else {
      return 'pending';
    }
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
}

