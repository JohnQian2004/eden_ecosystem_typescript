/**
 * FlowWise Workflow Engine Service (Angular)
 * Controls workflow execution and user decision-making on the client side
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { WebSocketService } from './websocket.service';

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'input' | 'process' | 'output' | 'error' | 'decision';
  component: string;
  description: string;
  requiresUserDecision?: boolean;
  decisionPrompt?: string;
  decisionOptions?: Array<{
    value: string;
    label: string;
    action: string;
  }>;
  timeout?: number;
  onTimeout?: string;
  actions?: Array<{
    type: string;
    [key: string]: any;
  }>;
  websocketEvents?: Array<{
    type: string;
    component: string;
    message: string;
    data?: any;
  }>;
  outputs?: Record<string, any>;
  conditions?: Array<{
    if: string;
    then: string;
  }>;
  errorHandling?: {
    onError: string;
    errorEvents?: Array<{
      type: string;
      component: string;
      message: string;
    }>;
  };
}

export interface WorkflowTransition {
  from: string;
  to: string;
  condition?: string;
}

export interface FlowWiseWorkflow {
  name: string;
  version: string;
  description: string;
  steps: WorkflowStep[];
  transitions: WorkflowTransition[];
  initialStep: string;
  finalSteps: string[];
}

export interface WorkflowContext {
  [key: string]: any;
}

export interface WorkflowExecution {
  workflowId: string;
  executionId: string;
  serviceType: 'movie' | 'dex';
  currentStep: string;
  context: WorkflowContext;
  history: Array<{
    step: string;
    timestamp: number;
    data?: any;
  }>;
}

export interface UserDecisionRequest {
  executionId: string;
  stepId: string;
  prompt: string;
  options: Array<{ value: string; label: string }>;
  timeout: number;
}

@Injectable({
  providedIn: 'root'
})
export class FlowWiseService {
  private workflows: Map<string, FlowWiseWorkflow> = new Map();
  private activeExecutions: Map<string, WorkflowExecution> = new Map();
  private decisionRequest$ = new Subject<UserDecisionRequest>();
  
  constructor(private http: HttpClient, private wsService: WebSocketService) {
    this.loadWorkflows();

    // Listen for WebSocket events to handle server-side workflow decisions
    this.wsService.events$.subscribe((event: any) => {
      if (event.type === 'user_decision_required') {
        console.log('🤔 [FlowWise] Server-side decision required:', event);

        // Convert WebSocket event to decision request format
        const decisionRequest: UserDecisionRequest = {
          executionId: event.data.workflowId || event.data.decisionId || 'server_decision',
          stepId: event.data.stepId || 'unknown',
          prompt: event.data.prompt || event.message || 'Please make a decision',
          options: event.data.options || [
            { value: 'YES', label: 'Yes' },
            { value: 'NO', label: 'No' }
          ],
          timeout: event.data.timeout || 60000
        };

        this.decisionRequest$.next(decisionRequest);
      }
    });
  }

  /**
   * Load workflow definitions from backend API
   */
  private loadWorkflows(): void {
    const baseUrl = window.location.port === '4200' 
      ? 'http://localhost:3000' 
      : '';
    
    // Load movie workflow from backend
    this.http.get<{ success: boolean; flowwiseWorkflow: FlowWiseWorkflow }>(`${baseUrl}/api/workflow/movie`)
      .subscribe({
        next: (data) => {
          if (data.success && data.flowwiseWorkflow) {
            this.workflows.set('movie', data.flowwiseWorkflow);
            console.log('✅ [FlowWise] Loaded movie workflow from backend:', data.flowwiseWorkflow.name);
          }
        },
        error: (err) => {
          console.error('❌ [FlowWise] Could not load movie workflow from backend:', err);
        }
      });

    // Load DEX workflow from backend
    this.http.get<{ success: boolean; flowwiseWorkflow: FlowWiseWorkflow }>(`${baseUrl}/api/workflow/dex`)
      .subscribe({
        next: (data) => {
          if (data.success && data.flowwiseWorkflow) {
            this.workflows.set('dex', data.flowwiseWorkflow);
            console.log('✅ [FlowWise] Loaded DEX workflow from backend:', data.flowwiseWorkflow.name);
          }
        },
        error: (err) => {
          console.error('❌ [FlowWise] Could not load DEX workflow from backend:', err);
        }
      });
  }

  /**
   * Get workflow by service type
   */
  getWorkflow(serviceType: 'movie' | 'dex'): FlowWiseWorkflow | null {
    return this.workflows.get(serviceType) || null;
  }

  /**
   * Start workflow execution
   */
  startWorkflow(
    serviceType: 'movie' | 'dex',
    initialContext: WorkflowContext
  ): WorkflowExecution | null {
    const workflow = this.getWorkflow(serviceType);
    if (!workflow) {
      console.error(`❌ [FlowWise] Workflow not found for service type: ${serviceType}`);
      return null;
    }

    const executionId = `workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const execution: WorkflowExecution = {
      workflowId: workflow.name,
      executionId: executionId,
      serviceType: serviceType,
      currentStep: workflow.initialStep,
      context: { ...initialContext },
      history: []
    };

    this.activeExecutions.set(executionId, execution);
    console.log(`🚀 [FlowWise] Started workflow: ${workflow.name} (${executionId})`);
    
    // Start executing the workflow
    this.executeWorkflow(execution, workflow);
    
    return execution;
  }

  /**
   * Execute workflow steps
   */
  private async executeWorkflow(
    execution: WorkflowExecution,
    workflow: FlowWiseWorkflow
  ): Promise<void> {
    const stepMap = new Map<string, WorkflowStep>();
    workflow.steps.forEach(step => stepMap.set(step.id, step));

    let currentStepId = execution.currentStep;

    while (currentStepId) {
      const step = stepMap.get(currentStepId);
      if (!step) {
        console.error(`❌ [FlowWise] Step not found: ${currentStepId}`);
        break;
      }

      // Record step start
      execution.history.push({
        step: currentStepId,
        timestamp: Date.now()
      });

      console.log(`🔄 [FlowWise] Executing step: ${step.name} (${step.id})`);

      // For decision steps, we need to execute the step first to get to the decision point
      if (step.type === 'decision' && step.requiresUserDecision) {
        // Execute the step atomically on server first (handles any pre-decision actions)
        await this.executeStepOnServer(step, execution);

        console.log(`🤔 [FlowWise] Waiting for user decision: ${step.decisionPrompt}`);

        // Request user decision
        const decisionRequest: UserDecisionRequest = {
          executionId: execution.executionId,
          stepId: step.id,
          prompt: this.replaceTemplateVariables(step.decisionPrompt || '', execution.context),
          options: (step.decisionOptions || []).map(opt => ({
            value: opt.value,
            label: this.replaceTemplateVariables(opt.label, execution.context)
          })),
          timeout: step.timeout || 30000
        };

        this.decisionRequest$.next(decisionRequest);
        
        // Wait for user decision (will be resolved by submitDecision)
        return; // Pause execution until decision is submitted
      }

      // Execute entire step atomically on server (handles all actions, events, outputs)
      // Server determines next step based on transition conditions and returns it
      const nextStepId = await this.executeStepOnServer(step, execution);

      // Check if we've reached a final step
      if (workflow.finalSteps.includes(currentStepId)) {
        console.log(`✅ [FlowWise] Workflow completed at final step: ${currentStepId}`);
        break;
      }

      if (!nextStepId) {
        console.warn(`⚠️ [FlowWise] No next step returned by server from step: ${currentStepId}`);
        break;
      }

      currentStepId = nextStepId;
      execution.currentStep = currentStepId;
    }
  }

  /**
   * Submit user decision and continue workflow
   */
  submitDecision(executionId: string, decision: string, stepId?: string): Promise<boolean> {
    console.log(`✅ [FlowWise] Submitting decision: ${decision} for execution: ${executionId}, step: ${stepId || 'unknown'}`);

    // Send decision to server for processing
    const baseUrl = window.location.port === '4200' ? 'http://localhost:3000' : '';
    const payload: any = {
      workflowId: executionId,
      decision: decision,
      selectionData: null // Will be set if this is a selection
    };

    // Include stepId if provided
    if (stepId) {
      payload.stepId = stepId;
    }

    // Check if this is a selection (has userSelection in context)
    const execution = this.activeExecutions.get(executionId);
    if (execution && execution.context['userSelection']) {
      payload.selectionData = execution.context['userSelection'];
      console.log(`🎬 [FlowWise] Submitting movie selection:`, payload.selectionData);
    }

    return this.http.post(`${baseUrl}/api/workflow/decision`, payload)
      .toPromise()
      .then((response: any) => {
        console.log(`✅ [FlowWise] Decision submitted successfully:`, response);
        return true;
      })
      .catch((error) => {
        console.error(`❌ [FlowWise] Failed to submit decision:`, error);
        return false;
      });
  }

  /**
   * Get decision request observable
   */
  getDecisionRequests(): Observable<UserDecisionRequest> {
    return this.decisionRequest$.asObservable();
  }

  /**
   * Execute a specific workflow step on the server by step ID
   */
  async executeWorkflowStep(executionId: string, stepId: string, context?: any): Promise<string | null> {
    console.log(`🔄 [FlowWise] Executing workflow step: ${stepId} for execution: ${executionId}`);

    // Find the active execution
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      console.error(`❌ [FlowWise] Execution not found: ${executionId}`);
      return null;
    }

    // Find the workflow and step
    const workflow = this.workflows.get(execution.serviceType === 'movie' ? 'movie' : 'dex');
    if (!workflow) {
      console.error(`❌ [FlowWise] Workflow not found for service type: ${execution.serviceType}`);
      return null;
    }

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      console.error(`❌ [FlowWise] Step not found: ${stepId}`);
      return null;
    }

    // Update context if provided
    if (context) {
      Object.assign(execution.context, context);
    }

    // Execute the step using the private method
    return this.executeStepOnServer(step, execution);
  }

  /**
   * Execute entire step atomically on server - prevents sync issues and enables proper autopay
   */
  private async executeStepOnServer(step: WorkflowStep, execution: WorkflowExecution): Promise<string | null> {
    console.log(`🔄 [FlowWise] Executing step atomically on server: ${step.name} (${step.id})`);

    const baseUrl = window.location.port === '4200'
      ? 'http://localhost:3000'
      : '';

    // Send entire step to server for atomic execution
    try {
      const response = await this.http.post<any>(`${baseUrl}/api/workflow/execute-step`, {
        executionId: execution.executionId,
        stepId: step.id,
        context: execution.context,
        serviceType: execution.serviceType
      }).toPromise();

      if (response.success && response.result) {
        // Server has executed all actions atomically and updated context
        Object.assign(execution.context, response.result.updatedContext);
        console.log(`✅ [FlowWise] Step executed atomically: ${step.id}`, response.result);

        // Handle WebSocket events that server should have broadcast
        if (response.result.events) {
          console.log(`📡 [FlowWise] Server broadcast ${response.result.events.length} events`);
        }

        // Return the next step ID determined by the server
        return response.result.nextStepId;
      } else {
        console.error(`❌ [FlowWise] Step execution failed: ${step.id}`, response.error);
        throw new Error(`Step execution failed: ${response.error}`);
      }
    } catch (error: any) {
      console.error(`❌ [FlowWise] Step execution error: ${step.id}`, error);
      throw error;
    }

    // Should not reach here, but TypeScript requires a return
    return null;
  }

  /**
   * Check if action is LLM-related for self-play mocking
   * Payment actions should go to server for autopay processing
   */
  private isLLMAction(actionType: string): boolean {
    return actionType.includes('llm') ||
           actionType.includes('extract') ||
           actionType.includes('format') ||
           actionType.includes('query') ||
           actionType === 'validate';
  }

  /**
   * Check if action is payment-related for server-side autopay
   */
  private isPaymentAction(actionType: string): boolean {
    return actionType.includes('payment') ||
           actionType.includes('cashier') ||
           actionType.includes('wallet') ||
           actionType.includes('ledger') ||
           actionType.includes('balance') ||
           actionType === 'check_balance' ||
           actionType === 'process_payment' ||
           actionType === 'complete_booking';
  }

  /**
   * Get mock LLM results for self-play
   */
  private getMockLLMResults(actionType: string, context: any): any {
    console.log(`🎭 [FlowWise] Generating self-play LLM results for: ${actionType}`);

    switch (actionType) {
      case 'llm_extract_query':
        return {
          queryResult: {
            serviceType: 'movie',
            query: {
              filters: {
                genre: 'sci-fi',
                time: 'evening'
              }
            }
          }
        };

      case 'query_service_registry':
        return {
          listings: [{
            id: 'amc-001',
            name: 'AMC Theatres',
            serviceType: 'movie',
            location: 'Demo Location',
            providerId: 'amc-001',
            providerName: 'AMC Theatres',
            movieTitle: 'Demo Movie',
            showtime: '7:00 PM',
            price: 15.99,
            rating: 4.5
          }],
          providers: [{
            id: 'amc-001',
            name: 'AMC Theatres',
            serviceType: 'movie',
            location: 'Demo Location'
          }]
        };

      case 'llm_format_response':
        return {
          llmResponse: {
            message: 'Found great movie options! Here are the best matches for your request.',
            selectedListing: {
              id: 'amc-001',
              name: 'AMC Theatres',
              serviceType: 'movie',
              location: 'Demo Location',
              providerId: 'amc-001',
              providerName: 'AMC Theatres',
              movieTitle: 'Demo Movie',
              showtime: '7:00 PM',
              price: 15.99,
              rating: 4.5
            },
            iGasCost: 0.004450
          },
          selectedListing: {
            id: 'amc-001',
            name: 'AMC Theatres',
            serviceType: 'movie',
            location: 'Demo Location',
            providerId: 'amc-001',
            providerName: 'AMC Theatres',
            movieTitle: 'Demo Movie',
            showtime: '7:00 PM',
            price: 15.99,
            rating: 4.5
          }
        };

      case 'validate':
        return {
          validationPassed: true,
          errors: [],
          input: context.input,
          email: context.email
        };

      default:
        return {
          success: true,
          message: `Mocked ${actionType} execution`,
          timestamp: Date.now()
        };
    }
  }

  /**
   * Get mock results for demo actions
   */
  private getMockActionResults(actionType: string, context: any): any {
    switch (actionType) {
      case 'llm_extract_query':
        return {
          llmResponse: {
            selectedListing: context.selectedListing || {
              movieTitle: 'Demo Movie',
              showtime: '7:00 PM',
              price: 15.99,
              providerId: 'amc-001',
              providerName: 'AMC Theatres',
              location: 'Demo Location'
            },
            iGasCost: 0.004450
          },
          selectedListing: context.selectedListing || {
            movieTitle: 'Demo Movie',
            showtime: '7:00 PM',
            price: 15.99,
            providerId: 'amc-001',
            providerName: 'AMC Theatres',
            location: 'Demo Location'
          }
        };
      case 'query_service_registry':
        return {
          listings: [context.selectedListing || {
            movieTitle: 'Demo Movie',
            showtime: '7:00 PM',
            price: 15.99,
            providerId: 'amc-001',
            providerName: 'AMC Theatres',
            location: 'Demo Location'
          }]
        };
      case 'llm_format_response':
        return {
          llmResponse: context.llmResponse || {
            message: 'Movie ticket selected successfully',
            selectedListing: context.selectedListing
          }
        };
      default:
        return {};
    }
  }

  /**
   * Get fallback results when actions fail
   */
  private getFallbackActionResults(actionType: string): any {
    console.log(`🔄 [FlowWise] Providing fallback data for: ${actionType}`);

    // Provide comprehensive fallback data to prevent workflow errors
    const baseFallback = {
      paymentSuccess: true,
      userDecision: 'YES',
      totalCost: 16.004450,
      moviePrice: 15.99,
      iGasCost: 0.004450,
      updatedBalance: 9999.99,
      // Ensure LLM response has selected listing
      llmResponse: {
        selectedListing: {
          movieTitle: 'Demo Movie',
          showtime: '7:00 PM',
          price: 15.99,
          providerId: 'amc-001',
          providerName: 'AMC Theatres',
          location: 'Demo Location'
        },
        iGasCost: 0.004450,
        message: 'Movie selected successfully'
      },
      selectedListing: {
        movieTitle: 'Demo Movie',
        showtime: '7:00 PM',
        price: 15.99,
        providerId: 'amc-001',
        providerName: 'AMC Theatres',
        location: 'Demo Location'
      },
      trade: {
        action: 'BUY',
        tokenAmount: 1,
        baseAmount: 100,
        price: 100,
        iTax: 0.5
      },
      ledgerEntry: {
        entryId: `entry_${Date.now()}`,
        amount: 15.99,
        merchant: 'AMC Theatres',
        status: 'completed',
        txId: `tx_${Date.now()}`
      },
      snapshot: {
        txId: `tx_${Date.now()}`,
        feeSplit: {
          garden: 0.5,
          rootCa: 0.3,
          indexer: 0.2
        }
      },
      providerUuid: 'provider-uuid-demo',
      // Ensure all workflow conditions pass
      error: null,
      validationPassed: true,
      certificateValidated: true
    };

    return baseFallback;
  }

  /**
   * Execute a specific workflow step manually
   */
  async executeStepManually(executionId: string, stepId: string, context?: any): Promise<boolean> {
    console.log(`▶️ [FlowWise] Manually executing step: ${stepId} in execution: ${executionId}`);

    const baseUrl = window.location.port === '4200'
      ? 'http://localhost:3000'
      : '';

    try {
      const response = await this.http.post<any>(`${baseUrl}/api/workflow/execute-step`, {
        executionId: executionId,
        stepId: stepId,
        context: context || {}
      }).toPromise();

      if (response.success) {
        console.log(`✅ [FlowWise] Step executed manually: ${stepId}`);
        return true;
      } else {
        console.error(`❌ [FlowWise] Manual step execution failed: ${stepId}`, response.error);
        return false;
      }
    } catch (error: any) {
      console.error(`❌ [FlowWise] Manual step execution error: ${stepId}`, error);
      return false;
    }
  }

  /**
   * Replace template variables
   */
  private replaceTemplateVariables(template: any, context: WorkflowContext): any {
    if (typeof template === 'string') {
      return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
        const value = this.getNestedValue(context, path);
        return value !== undefined ? String(value) : match;
      });
    } else if (Array.isArray(template)) {
      return template.map(item => this.replaceTemplateVariables(item, context));
    } else if (template && typeof template === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(template)) {
        result[key] = this.replaceTemplateVariables(value, context);
      }
      return result;
    }
    return template;
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * Transition evaluation is now handled server-side for atomic execution
   */

  /**
   * Get active execution
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.activeExecutions.get(executionId);
  }
}

