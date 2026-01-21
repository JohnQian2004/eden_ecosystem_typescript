/**
 * FlowWise Workflow Engine Service (Angular)
 * Controls workflow execution and user decision-making on the client side
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { WebSocketService } from './websocket.service';
import { getApiBaseUrl } from './api-base';

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
  serviceType: string;
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
  videoUrl?: string;
  movieTitle?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FlowWiseService {
  private apiBaseUrl = getApiBaseUrl();
  private workflows: Map<string, FlowWiseWorkflow> = new Map();
  private activeExecutions: Map<string, WorkflowExecution> = new Map();
  private decisionRequest$ = new Subject<UserDecisionRequest>();
  private selectionRequest$ = new Subject<any>(); // For user_selection_required events
  
  constructor(private http: HttpClient, private wsService: WebSocketService) {
    // DO NOT auto-load workflows on startup
    // Workflows will be loaded on-demand when a service type is selected on Main Street
    // this.loadWorkflows(); // REMOVED: Only load workflows when service type is clicked

    // Listen for WebSocket events to handle server-side workflow decisions
    this.wsService.events$.subscribe((event: any) => {
      // Log all events for debugging (especially user_decision_required)
      if (event.type === 'user_decision_required') {
        console.log(`🎯 [FlowWise] ========================================`);
        console.log(`🎯 [FlowWise] USER_DECISION_REQUIRED EVENT RECEIVED!`);
        console.log(`🎯 [FlowWise] Full event:`, JSON.stringify(event, null, 2));
        console.log(`🎯 [FlowWise] Event type:`, event.type);
        console.log(`🎯 [FlowWise] Event data:`, event.data);
        console.log(`🎯 [FlowWise] Event data.videoUrl:`, event.data?.videoUrl);
        console.log(`🎯 [FlowWise] Event data.movieTitle:`, event.data?.movieTitle);
        console.log(`🎯 [FlowWise] Event data.options:`, event.data?.options);
        console.log(`🎯 [FlowWise] ========================================`);
      }
      
      if (event.type === 'user_decision_required') {
        console.log(`🤔 [FlowWise] Server-side decision required:`, event);

        // Convert WebSocket event to decision request format
        // CRITICAL: Use workflowId (executionId) from event.data, not decisionId
        // decisionId is just an identifier for the decision type, not the workflow execution ID
        const executionId = event.data.workflowId || event.data.executionId || event.data.decisionId || 'server_decision';
        console.log(`🔍 [FlowWise] Decision event - workflowId: ${event.data.workflowId}, executionId: ${event.data.executionId}, decisionId: ${event.data.decisionId}, using: ${executionId}`);
        
        // For decision events, use the options from event.data.options or default YES/NO
        let options = event.data.options;
        
        // If options is not an array or is empty, use default decision options
        if (!options || !Array.isArray(options) || options.length === 0) {
          // Default decision options
          options = [
            { value: 'YES', label: 'Yes' },
            { value: 'NO', label: 'No' }
          ];
        }
        
        console.log(`📋 [FlowWise] Processing decision event with ${options.length} options`);
        console.log(`📋 [FlowWise] Options data:`, options);
        
        // Extract videoUrl and movieTitle from event data (for movie viewing decisions)
        // Check multiple possible locations for videoUrl and movieTitle
        // CRITICAL: Also check if videoUrl/movieTitle are template strings that weren't replaced
        let videoUrl = event.data?.videoUrl || 
                        event.data?.response?.videoUrl || 
                        (event.data?.data && event.data.data.videoUrl) ||
                        event.data?.selectedListing?.videoUrl ||
                        '';
        let movieTitle = event.data?.movieTitle || 
                          event.data?.response?.movieTitle || 
                          (event.data?.data && event.data.data.movieTitle) ||
                          event.data?.selectedListing?.movieTitle ||
                          '';
        
        // If videoUrl or movieTitle are template strings (not replaced), try to get from active execution context
        if (!videoUrl || videoUrl.includes('{{') || videoUrl.includes('selectedListing')) {
          console.log(`🎬 [FlowWise] videoUrl appears to be a template string or empty, checking active execution context`);
          const execution = this.activeExecutions.get(executionId);
          if (execution?.context) {
            videoUrl = execution.context['selectedListing']?.['videoUrl'] || 
                      execution.context['videoUrl'] || 
                      videoUrl;
            console.log(`🎬 [FlowWise] Retrieved videoUrl from execution context: ${videoUrl}`);
          }
        }
        if (!movieTitle || movieTitle.includes('{{') || movieTitle.includes('selectedListing')) {
          console.log(`🎬 [FlowWise] movieTitle appears to be a template string or empty, checking active execution context`);
          const execution = this.activeExecutions.get(executionId);
          if (execution?.context) {
            movieTitle = execution.context['selectedListing']?.['movieTitle'] || 
                        execution.context['movieTitle'] || 
                        movieTitle;
            console.log(`🎬 [FlowWise] Retrieved movieTitle from execution context: ${movieTitle}`);
          }
        }
        
        console.log(`🎬 [FlowWise] Extracting videoUrl and movieTitle:`);
        console.log(`🎬 [FlowWise] event.data:`, event.data);
        console.log(`🎬 [FlowWise] event.data.videoUrl:`, event.data?.videoUrl);
        console.log(`🎬 [FlowWise] event.data.movieTitle:`, event.data?.movieTitle);
        console.log(`🎬 [FlowWise] Final extracted videoUrl:`, videoUrl);
        console.log(`🎬 [FlowWise] Final extracted movieTitle:`, movieTitle);
        
        const decisionRequest: UserDecisionRequest = {
          executionId: executionId,
          stepId: event.data?.stepId || event.data?.decisionId || 'unknown',
          prompt: event.data?.prompt || event.message || 'Please make a decision',
          options: options,
          timeout: event.data?.timeout || 60000,
          videoUrl: videoUrl || undefined, // Use undefined instead of empty string
          movieTitle: movieTitle || undefined // Use undefined instead of empty string
        };

        console.log(`📋 [FlowWise] ========================================`);
        console.log(`📋 [FlowWise] EMITTING DECISION REQUEST`);
        console.log(`📋 [FlowWise] Decision request:`, JSON.stringify(decisionRequest, null, 2));
        console.log(`📋 [FlowWise] Decision request options count: ${decisionRequest.options.length}`);
        console.log(`🎬 [FlowWise] Decision request videoUrl: ${videoUrl || 'none'}`);
        console.log(`🎬 [FlowWise] Decision request movieTitle: ${movieTitle || 'none'}`);
        console.log(`📋 [FlowWise] Calling decisionRequest$.next()...`);
        this.decisionRequest$.next(decisionRequest);
        console.log(`📋 [FlowWise] ✅ Decision request emitted successfully`);
        console.log(`📋 [FlowWise] ========================================`);
      } else if (event.type === 'user_selection_required') {
        // Also handle selection events from WebSocket and emit through Subject
        console.log(`🎬 [FlowWise] ========================================`);
        console.log(`🎬 [FlowWise] SELECTION EVENT FROM WEBSOCKET`);
        console.log(`🎬 [FlowWise] Full event:`, JSON.stringify(event, null, 2));
        console.log(`🎬 [FlowWise] Event data:`, event.data);
        console.log(`🎬 [FlowWise] Event data.options:`, event.data?.options);
        console.log(`🎬 [FlowWise] Event data.options type:`, typeof event.data?.options);
        console.log(`🎬 [FlowWise] Event data.options is array:`, Array.isArray(event.data?.options));
        console.log(`🎬 [FlowWise] Event data.options length:`, event.data?.options?.length || 0);
        
        // Emit selection event through Subject so workflow display component can receive it
        console.log(`🎬 [FlowWise] Emitting selection event through Subject`);
        this.selectionRequest$.next(event);
        console.log(`🎬 [FlowWise] ========================================`);
      } else if (event.type === 'llm_response') {
        // CRITICAL FALLBACK: Create decision request from llm_response if it has videoUrl and stepId is view_movie
        // This ensures the video player appears even if user_decision_required event wasn't received
        const stepId = event.data?.stepId;
        const evExecId = event.data?.executionId || event.data?.workflowId;
        const videoUrl = event.data?.response?.videoUrl || event.data?.videoUrl;
        const movieTitle = event.data?.response?.movieTitle || event.data?.movieTitle;
        
        if (stepId === 'view_movie' && videoUrl && evExecId) {
          console.log(`🎬 [FlowWise] ========================================`);
          console.log(`🎬 [FlowWise] FALLBACK: Creating decision request from llm_response event`);
          console.log(`🎬 [FlowWise] stepId:`, stepId);
          console.log(`🎬 [FlowWise] videoUrl:`, videoUrl);
          console.log(`🎬 [FlowWise] movieTitle:`, movieTitle);
          console.log(`🎬 [FlowWise] executionId:`, evExecId);
          
          const decisionRequest: UserDecisionRequest = {
            executionId: String(evExecId),
            stepId: 'view_movie',
            prompt: movieTitle 
              ? `🎬 Movie "${movieTitle}" is ready to watch! The video will play in the chat console. Click 'Done Watching' when you're finished.`
              : '🎬 Movie is ready to watch! The video will play in the chat console. Click \'Done Watching\' when you\'re finished.',
            options: [
              { value: 'DONE_WATCHING', label: 'Done Watching' }
            ],
            timeout: 300000,
            videoUrl: videoUrl,
            movieTitle: movieTitle
          };
          
          console.log(`📋 [FlowWise] Created decision request from llm_response:`, JSON.stringify(decisionRequest, null, 2));
          console.log(`📋 [FlowWise] Calling decisionRequest$.next()...`);
          this.decisionRequest$.next(decisionRequest);
          console.log(`📋 [FlowWise] ✅ Decision request emitted successfully from llm_response`);
          console.log(`🎬 [FlowWise] ========================================`);
        }
      }
    });
  }

  /**
   * Load workflow definitions from backend API
   * Dynamically loads workflows for all available service types
   */
  private loadWorkflows(): void {
    const baseUrl = this.apiBaseUrl;
    
    // Get list of available workflows from backend
    this.http.get<{ success: boolean; workflows: Array<{serviceType: string, filename: string, exists: boolean}> }>(`${baseUrl}/api/workflow/list`)
      .subscribe({
        next: (response) => {
          if (response.success && response.workflows) {
            // Load each workflow that exists
            response.workflows.forEach(workflowInfo => {
              if (workflowInfo.exists) {
                this.http.get<{ success: boolean; flowwiseWorkflow: FlowWiseWorkflow }>(`${baseUrl}/api/workflow/${workflowInfo.serviceType}`)
                  .subscribe({
                    next: (data) => {
                      if (data.success && data.flowwiseWorkflow) {
                        this.workflows.set(workflowInfo.serviceType, data.flowwiseWorkflow);
                        console.log(`✅ [FlowWise] Loaded ${workflowInfo.serviceType} workflow from backend:`, data.flowwiseWorkflow.name);
                      }
                    },
                    error: (err) => {
                      console.error(`❌ [FlowWise] Could not load ${workflowInfo.serviceType} workflow from backend:`, err);
                    }
                  });
              }
            });
          }
        },
        error: (err) => {
          console.error('❌ [FlowWise] Could not load workflow list from backend:', err);
          // Fallback: Load movie and dex workflows directly
          this.loadWorkflowFallback(baseUrl);
        }
      });
  }

  /**
   * Fallback: Load movie and dex workflows directly (for backward compatibility)
   */
  private loadWorkflowFallback(baseUrl: string): void {
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
  getWorkflow(serviceType: string): FlowWiseWorkflow | null {
    return this.workflows.get(serviceType) || null;
  }

  /**
   * Load workflow on demand if not already loaded (synchronous check, async load)
   * Public method so it can be called to pre-load workflows
   */
  loadWorkflowIfNeeded(serviceType: string): void {
    if (this.workflows.has(serviceType)) {
      console.log(`✅ [FlowWise] Workflow ${serviceType} already loaded`);
      return;
    }
    
    const baseUrl = this.apiBaseUrl;
    
    console.log(`🔄 [FlowWise] Loading ${serviceType} workflow on demand from ${baseUrl}/api/workflow/${serviceType}`);
    this.http.get<{ success: boolean; flowwiseWorkflow: FlowWiseWorkflow }>(`${baseUrl}/api/workflow/${serviceType}`)
      .subscribe({
        next: (data) => {
          if (data.success && data.flowwiseWorkflow) {
            this.workflows.set(serviceType, data.flowwiseWorkflow);
            console.log(`✅ [FlowWise] Loaded ${serviceType} workflow on demand:`, data.flowwiseWorkflow.name);
            console.log(`✅ [FlowWise] Workflow has ${data.flowwiseWorkflow.steps?.length || 0} steps`);
          } else {
            console.error(`❌ [FlowWise] Failed to load ${serviceType} workflow: success=false`);
          }
        },
        error: (err) => {
          console.error(`❌ [FlowWise] Could not load ${serviceType} workflow from backend:`, err);
          console.error(`❌ [FlowWise] Error details:`, err.message, err.status, err.url);
        }
      });
  }

  /**
   * Load workflow synchronously (returns Observable)
   */
  private loadWorkflow(serviceType: string): Observable<FlowWiseWorkflow | null> {
    const baseUrl = this.apiBaseUrl;
    
    console.log(`🔄 [FlowWise] Loading ${serviceType} workflow from ${baseUrl}/api/workflow/${serviceType}`);
    return this.http.get<{ success: boolean; flowwiseWorkflow: FlowWiseWorkflow }>(`${baseUrl}/api/workflow/${serviceType}`)
      .pipe(
        map((data) => {
          if (data.success && data.flowwiseWorkflow) {
            this.workflows.set(serviceType, data.flowwiseWorkflow);
            console.log(`✅ [FlowWise] Loaded ${serviceType} workflow:`, data.flowwiseWorkflow.name);
            return data.flowwiseWorkflow;
          } else {
            console.error(`❌ [FlowWise] Failed to load ${serviceType} workflow: success=false`);
            return null;
          }
        }),
        catchError((err) => {
          console.error(`❌ [FlowWise] Could not load ${serviceType} workflow from backend:`, err);
          return of(null);
        })
      );
  }

  /**
   * Start workflow execution
   * Returns null if workflow is not loaded and cannot be loaded
   */
  startWorkflow(
    serviceType: string,
    initialContext: WorkflowContext
  ): WorkflowExecution | null {
    console.log(`🚀 [FlowWise] Starting workflow for service type: ${serviceType}`);
    console.log(`🔍 [FlowWise] Currently loaded workflows: ${Array.from(this.workflows.keys()).join(', ')}`);
    
    // Check if workflow is already loaded
    let workflow = this.getWorkflow(serviceType);
    
    if (!workflow) {
      console.warn(`⚠️ [FlowWise] Workflow ${serviceType} not in cache, attempting to load...`);
      // Try to load it (async)
      this.loadWorkflowIfNeeded(serviceType);
      
      // Return null - workflow needs to be loaded first
      // The workflow will be loaded asynchronously, but we can't wait for it here
      // The caller should ensure the workflow is pre-loaded (e.g., when service type is selected)
      console.error(`❌ [FlowWise] Workflow not found for service type: ${serviceType}`);
      console.error(`❌ [FlowWise] Available workflows: ${Array.from(this.workflows.keys()).join(', ')}`);
      console.error(`❌ [FlowWise] Please wait a moment for the workflow to load, or ensure it's pre-loaded when selecting the service type.`);
      return null;
    }
    
    console.log(`✅ [FlowWise] Found workflow for ${serviceType}: ${workflow.name}`);

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
    console.log(`🔍 [FlowWise] Execution serviceType: ${execution.serviceType}`);
    console.log(`🔍 [FlowWise] Workflow initial step: ${workflow.initialStep}`);
    console.log(`🔍 [FlowWise] Workflow has ${workflow.steps.length} steps`);
    console.log(`🔍 [FlowWise] First step ID: ${workflow.steps[0]?.id}, name: ${workflow.steps[0]?.name}`);
    
    // Start executing the workflow (async, but don't await - let it run in background)
    // Add error handling to catch any issues
    this.executeWorkflow(execution, workflow).catch((error) => {
      console.error(`❌ [FlowWise] Error executing workflow ${execution.executionId}:`, error);
      console.error(`❌ [FlowWise] Error details:`, error.stack || error.message);
    });
    
    return execution;
  }

  /**
   * Execute workflow steps
   */
  private async executeWorkflow(
    execution: WorkflowExecution,
    workflow: FlowWiseWorkflow
  ): Promise<void> {
    console.log(`🚀 [FlowWise] executeWorkflow called for execution: ${execution.executionId}, serviceType: ${execution.serviceType}`);
    console.log(`🚀 [FlowWise] Starting from step: ${execution.currentStep}`);
    console.log(`🚀 [FlowWise] Workflow has ${workflow.steps.length} steps`);
    
    const stepMap = new Map<string, WorkflowStep>();
    workflow.steps.forEach(step => stepMap.set(step.id, step));

    let currentStepId = execution.currentStep;

    while (currentStepId) {
      const step = stepMap.get(currentStepId);
      if (!step) {
        console.error(`❌ [FlowWise] Step not found: ${currentStepId}`);
        console.error(`❌ [FlowWise] Available steps: ${Array.from(stepMap.keys()).join(', ')}`);
        break;
      }

      // Record step start
      execution.history.push({
        step: currentStepId,
        timestamp: Date.now()
      });

      console.log(`🔄 [FlowWise] Executing step: ${step.name} (${step.id})`);
      console.log(`🔄 [FlowWise] Step type: ${step.type}, requiresUserDecision: ${step.requiresUserDecision}`);

      // For input steps, if we already have the input in context, we can skip to executing actions
      // Otherwise, input steps should execute normally (they validate and process the input)
      if (step.type === 'input' && execution.context['input'] && execution.context['email']) {
        console.log(`✅ [FlowWise] Input step ${step.id} - input already provided, executing actions`);
        // Continue to execute the step normally - it will validate and process the input
      }

      // For decision steps, we need to execute the step first to get to the decision point
      if (step.type === 'decision' && step.requiresUserDecision) {
        // Execute the step atomically on server first (handles any pre-decision actions)
        await this.executeStepOnServer(step, execution);

        console.log(`🤔 [FlowWise] Waiting for user decision: ${step.decisionPrompt}`);

        // Request user decision
        // Extract videoUrl and movieTitle from context (for movie viewing decisions)
        const videoUrl = execution.context?.['selectedListing']?.['videoUrl'] || execution.context?.['videoUrl'];
        const movieTitle = execution.context?.['selectedListing']?.['movieTitle'] || execution.context?.['movieTitle'];
        
        const decisionRequest: UserDecisionRequest = {
          executionId: execution.executionId,
          stepId: step.id,
          prompt: this.replaceTemplateVariables(step.decisionPrompt || '', execution.context),
          options: (step.decisionOptions || []).map(opt => ({
            value: opt.value,
            label: this.replaceTemplateVariables(opt.label, execution.context)
          })),
          timeout: step.timeout || 30000,
          videoUrl: videoUrl,
          movieTitle: movieTitle
        };
        
        if (videoUrl) {
          console.log(`🎬 [FlowWise] Decision request includes videoUrl: ${videoUrl}`);
        }

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
      
      // Update execution history to mark previous step as completed
      if (execution.history.length > 0) {
        const lastHistoryEntry = execution.history[execution.history.length - 1];
        if (lastHistoryEntry.step !== currentStepId) {
          // Previous step is now completed
          console.log(`✅ [FlowWise] Step ${lastHistoryEntry.step} completed, moving to ${currentStepId}`);
        }
      }
    }
  }

  /**
   * Submit user decision and continue workflow
   */
  submitDecision(executionId: string, decision: string, stepId?: string): Promise<boolean> {
    console.log(`✅ [FlowWise] ========================================`);
    console.log(`✅ [FlowWise] SUBMITTING DECISION`);
    console.log(`✅ [FlowWise] Execution ID: ${executionId}`);
    console.log(`✅ [FlowWise] Step ID: ${stepId || 'unknown'}`);
    console.log(`✅ [FlowWise] Decision value: ${decision}`);
    
    // Get execution context for validation and selection data
    const execution = this.activeExecutions.get(executionId);
    
    // CRITICAL: Validate decision for view_movie step
    // Check both stepId parameter and execution.currentStep
    const currentStep = stepId || execution?.currentStep;
    if (currentStep === 'view_movie') {
      const normalizedDecision = (decision || '').toUpperCase().trim();
      if (normalizedDecision !== 'DONE_WATCHING') {
        console.error(`❌ [FlowWise] ========================================`);
        console.error(`❌ [FlowWise] ERROR: view_movie step received "${decision}" instead of "DONE_WATCHING"!`);
        console.error(`❌ [FlowWise] This is likely a stale selection from a previous step`);
        console.error(`❌ [FlowWise] Rejecting this submission to prevent workflow error`);
        console.error(`❌ [FlowWise] ========================================`);
        return Promise.resolve(false);
      }
    }

    // Send decision to server for processing
    const baseUrl = this.apiBaseUrl;
    const payload: any = {
      workflowId: executionId,
      decision: decision,
      selectionData: null // Will be set if this is a selection
    };

    // Include stepId if provided
    if (stepId) {
      payload.stepId = stepId;
    }
    
    console.log(`✅ [FlowWise] Payload:`, payload);
    console.log(`✅ [FlowWise] ========================================`);

    // Check if this is a selection (has userSelection in context)
    if (execution && execution.context['userSelection']) {
      payload.selectionData = execution.context['userSelection'];
      const serviceType = execution.serviceType || 'service';
      console.log(`🎬 [FlowWise] Submitting ${serviceType} selection:`, payload.selectionData);
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
   * Get selection requests (for user_selection_required events)
   */
  getSelectionRequests(): Observable<any> {
    return this.selectionRequest$.asObservable();
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
    const workflow = this.workflows.get(execution.serviceType);
    if (!workflow) {
      console.error(`❌ [FlowWise] Workflow not found for service type: ${execution.serviceType}`);
      console.error(`❌ [FlowWise] Available workflows: ${Array.from(this.workflows.keys()).join(', ')}`);
      // Try to load workflow on demand
      this.loadWorkflowIfNeeded(execution.serviceType);
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

    const baseUrl = this.apiBaseUrl;

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
          console.log(`📡 [FlowWise] Events:`, JSON.stringify(response.result.events, null, 2));
          
          // Check if any of the events are decision/selection requests
          for (const event of response.result.events) {
            console.log(`📡 [FlowWise] Checking event:`, event.type, event);
            
            if (event.type === 'user_decision_required') {
              console.log(`🤔 [FlowWise] Decision event in response:`, event);
              // Extract videoUrl and movieTitle from event data
              const videoUrl = event.data?.videoUrl || event.data?.response?.videoUrl;
              const movieTitle = event.data?.movieTitle || event.data?.response?.movieTitle;
              
              const decisionRequest: UserDecisionRequest = {
                executionId: execution.executionId,
                stepId: event.data?.stepId || step.id,
                prompt: event.data?.prompt || event.message || 'Please make a decision',
                options: event.data?.options || [],
                timeout: event.data?.timeout || 60000,
                videoUrl: videoUrl,
                movieTitle: movieTitle
              };
              console.log(`📋 [FlowWise] Emitting decision request from response:`, decisionRequest);
              console.log(`🎬 [FlowWise] Decision request videoUrl: ${videoUrl || 'none'}`);
              this.decisionRequest$.next(decisionRequest);
            } else if (event.type === 'user_selection_required') {
              console.log(`🎬 [FlowWise] ========================================`);
              console.log(`🎬 [FlowWise] SELECTION EVENT IN HTTP RESPONSE`);
              console.log(`🎬 [FlowWise] Full event:`, JSON.stringify(event, null, 2));
              console.log(`🎬 [FlowWise] Event data:`, event.data);
              console.log(`🎬 [FlowWise] Event data.options:`, event.data?.options);
              console.log(`🎬 [FlowWise] Event data.options type:`, typeof event.data?.options);
              console.log(`🎬 [FlowWise] Event data.options is array:`, Array.isArray(event.data?.options));
              console.log(`🎬 [FlowWise] Event data.options length:`, event.data?.options?.length || 0);
              
              // Emit selection event through Subject so workflow display component can receive it
              console.log(`🎬 [FlowWise] Emitting selection event through Subject`);
              this.selectionRequest$.next(event);
              console.log(`🎬 [FlowWise] ========================================`);
            }
          }
        }

        // Check if the step is paused for decision
        if (response.result.pausedForDecision) {
          console.log(`⏸️ [FlowWise] Step paused for ${response.result.decisionType || 'decision'}`);
          // The decision event should have been broadcast via WebSocket,
          // but if it wasn't, we need to create one from the response
          if (response.result.events && response.result.events.length > 0) {
            const decisionEvent = response.result.events.find((e: any) => 
              e.type === 'user_decision_required' || e.type === 'user_selection_required'
            );
            if (decisionEvent) {
              if (decisionEvent.type === 'user_selection_required') {
                // For selection events, emit through selectionRequest$ Subject
                console.log(`🎬 [FlowWise] ========================================`);
                console.log(`🎬 [FlowWise] SELECTION EVENT FROM PAUSED STEP`);
                console.log(`🎬 [FlowWise] Full event:`, JSON.stringify(decisionEvent, null, 2));
                console.log(`🎬 [FlowWise] Emitting selection event through Subject`);
                this.selectionRequest$.next(decisionEvent);
                console.log(`🎬 [FlowWise] ========================================`);
              } else {
                // For decision events, emit through decisionRequest$ Subject
                // Extract videoUrl and movieTitle from event data
                const videoUrl = decisionEvent.data?.videoUrl || decisionEvent.data?.response?.videoUrl;
                const movieTitle = decisionEvent.data?.movieTitle || decisionEvent.data?.response?.movieTitle;
                
                const decisionRequest: UserDecisionRequest = {
                  executionId: execution.executionId,
                  stepId: decisionEvent.data?.stepId || step.id,
                  prompt: decisionEvent.data?.prompt || decisionEvent.message || 'Please make a decision',
                  options: decisionEvent.data?.options || [],
                  timeout: decisionEvent.data?.timeout || 60000,
                  videoUrl: videoUrl,
                  movieTitle: movieTitle
                };
                console.log(`📋 [FlowWise] Emitting decision request from paused step:`, decisionRequest);
                console.log(`🎬 [FlowWise] Decision request videoUrl: ${videoUrl || 'none'}`);
                this.decisionRequest$.next(decisionRequest);
              }
            }
          }
          // Return null to pause execution
          return null;
        }

        const nextStepId = response.result.nextStepId;
        const shouldAutoContinue = response.result.shouldAutoContinue;

        // CRITICAL: Auto-continue workflow for steps with "always" transitions
        // This ensures the workflow automatically progresses from ledger_create_entry to cashier_process_payment
        if (shouldAutoContinue && nextStepId) {
          console.log(`🔄 [FlowWise] Auto-continuing workflow: ${step.id} -> ${nextStepId}`);
          
          // Find the workflow and next step
          const workflow = this.workflows.get(execution.serviceType);
          if (workflow) {
            const nextStep = workflow.steps.find(s => s.id === nextStepId);
            if (nextStep) {
              // Update execution current step
              execution.currentStep = nextStepId;
              
              // Recursively execute the next step (but limit recursion depth to prevent infinite loops)
              const maxRecursionDepth = 10;
              const currentDepth = (execution.context['_autoContinueDepth'] || 0) as number;
              if (currentDepth < maxRecursionDepth) {
                execution.context['_autoContinueDepth'] = currentDepth + 1;
                try {
                  const nextNextStepId = await this.executeStepOnServer(nextStep, execution);
                  // Reset depth counter
                  delete execution.context['_autoContinueDepth'];
                  return nextNextStepId;
                } catch (error) {
                  // Reset depth counter on error
                  delete execution.context['_autoContinueDepth'];
                  throw error;
                }
              } else {
                console.warn(`⚠️ [FlowWise] Max auto-continuation depth reached, returning nextStepId`);
                delete execution.context['_autoContinueDepth'];
              }
            }
          }
        }

        // Return the next step ID determined by the server
        return nextStepId;
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
   * Generate service-type-specific mock listing data
   */
  private generateMockListing(serviceType: string, index: number = 0): any {
    const baseListing: any = {
      id: `${serviceType}-${1000 + index}`,
      name: `${serviceType.charAt(0).toUpperCase() + serviceType.slice(1)} Provider`,
      serviceType: serviceType,
      location: 'Demo Location',
      providerId: `${serviceType}-001`,
      providerName: `${serviceType.charAt(0).toUpperCase() + serviceType.slice(1)} Provider`,
      price: 15.99 + (index * 2.5),
      rating: 4.5 + (Math.random() * 0.5)
    };

    // Add service-type-specific fields
    switch (serviceType) {
      case 'movie':
        baseListing.movieTitle = ['The Dark Knight', 'Inception', 'Avatar'][index % 3];
        baseListing.showtime = ['7:00 PM', '8:30 PM', '6:15 PM'][index % 3];
        baseListing.genre = 'Action';
        break;
      case 'airline':
        baseListing.flightNumber = ['AA123', 'UA456', 'DL789'][index % 3];
        baseListing.destination = ['Los Angeles', 'New York', 'Chicago'][index % 3];
        baseListing.date = '2026-01-20';
        baseListing.departure = '8:00 AM';
        baseListing.arrival = '11:00 AM';
        baseListing.price = 299.99;
        break;
      case 'autoparts':
        baseListing.partName = ['Brake Pads', 'Oil Filter', 'Air Filter'][index % 3];
        baseListing.partNumber = `BP-${1000 + index}`;
        baseListing.category = 'Brakes';
        baseListing.warehouse = 'Warehouse A';
        baseListing.availability = 'In Stock';
        break;
      case 'hotel':
        baseListing.hotelName = ['Grand Plaza Hotel', 'Oceanview Resort', 'City Center Inn'][index % 3];
        baseListing.checkIn = '2026-01-20';
        baseListing.checkOut = '2026-01-22';
        baseListing.roomType = 'Standard';
        baseListing.price = 99.99;
        break;
      case 'restaurant':
        baseListing.restaurantName = ['The Gourmet Bistro', 'Seaside Grill', 'Mountain View Restaurant'][index % 3];
        baseListing.reservationTime = '7:00 PM';
        baseListing.cuisine = 'Italian';
        baseListing.partySize = 2;
        baseListing.price = 45.99;
        break;
      case 'dex':
        baseListing.tokenSymbol = 'SOL';
        baseListing.baseToken = 'USDC';
        baseListing.action = 'BUY';
        baseListing.tokenAmount = 1;
        baseListing.baseAmount = 100;
        baseListing.price = 100;
        break;
      default:
        // Generic fallback
        baseListing.name = `${serviceType} Service`;
    }

    return baseListing;
  }

  /**
   * Get service-type-specific price field name
   */
  private getServiceTypePriceField(serviceType: string): string {
    const priceFields: Record<string, string> = {
      movie: 'moviePrice',
      airline: 'airlinePrice',
      hotel: 'hotelPrice',
      restaurant: 'restaurantPrice',
      autoparts: 'autopartsPrice'
    };
    return priceFields[serviceType] || 'totalCost';
  }

  /**
   * Get service-type-specific provider name
   */
  private getServiceTypeProviderName(serviceType: string): string {
    const providerNames: Record<string, string> = {
      // Use catalog adText where available, fallback to generated name
      movie: 'AMC Theatres',
      airline: 'Airline Provider',
      hotel: 'Hotel Provider',
      restaurant: 'Restaurant Provider',
      autoparts: 'Auto Parts Provider',
      dex: 'DEX Pool Provider'
      // Note: Consider importing getCatalogEntry from service-type-catalog.service.ts for consistency
    };
    return providerNames[serviceType] || `${serviceType.charAt(0).toUpperCase() + serviceType.slice(1)} Provider`;
  }

  /**
   * Get mock LLM results for self-play (now service-type aware)
   */
  private getMockLLMResults(actionType: string, context: any): any {
    const serviceType = context.serviceType || 'movie';
    console.log(`🎭 [FlowWise] Generating self-play LLM results for: ${actionType}, serviceType: ${serviceType}`);

    switch (actionType) {
      case 'llm_extract_query':
        return {
          queryResult: {
            serviceType: serviceType,
            query: {
              filters: serviceType === 'movie' ? {
                genre: 'sci-fi',
                time: 'evening'
              } : serviceType === 'airline' ? {
                destination: 'any',
                date: 'any'
              } : {}
            }
          }
        };

      case 'query_service_registry': {
        const mockListing = this.generateMockListing(serviceType, 0);
        return {
          listings: [mockListing],
          providers: [{
            id: mockListing.providerId,
            name: mockListing.providerName,
            serviceType: serviceType,
            location: mockListing.location
          }]
        };
      }

      case 'llm_format_response': {
        const mockListing = this.generateMockListing(serviceType, 0);
        const messages: Record<string, string> = {
          movie: 'Found great movie options! Here are the best matches for your request.',
          airline: 'Found great flight options! Here are the best matches for your request.',
          hotel: 'Found great hotel options! Here are the best matches for your request.',
          restaurant: 'Found great restaurant options! Here are the best matches for your request.',
          autoparts: 'Found great auto parts! Here are the best matches for your request.',
          dex: 'Found great token pools! Here are the best matches for your request.'
        };
        return {
          llmResponse: {
            message: messages[serviceType] || `Found great ${serviceType} options! Here are the best matches for your request.`,
            selectedListing: mockListing,
            iGasCost: 0.004450
          },
          selectedListing: mockListing
        };
      }

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
   * Get mock results for demo actions (now service-type aware)
   */
  private getMockActionResults(actionType: string, context: any): any {
    const serviceType = context.serviceType || 'movie';
    const mockListing = context.selectedListing || this.generateMockListing(serviceType, 0);
    const messages: Record<string, string> = {
      movie: 'Movie ticket selected successfully',
      airline: 'Flight ticket selected successfully',
      hotel: 'Hotel booking selected successfully',
      restaurant: 'Restaurant reservation selected successfully',
      autoparts: 'Auto part selected successfully',
      dex: 'Token trade selected successfully'
    };

    switch (actionType) {
      case 'llm_extract_query':
        return {
          llmResponse: {
            selectedListing: mockListing,
            iGasCost: 0.004450
          },
          selectedListing: mockListing
        };
      case 'query_service_registry':
        return {
          listings: [mockListing]
        };
      case 'llm_format_response':
        return {
          llmResponse: context.llmResponse || {
            message: messages[serviceType] || `${serviceType} selected successfully`,
            selectedListing: mockListing
          }
        };
      default:
        return {};
    }
  }

  /**
   * Get fallback results when actions fail (now service-type aware)
   */
  private getFallbackActionResults(actionType: string, serviceType: string = 'movie'): any {
    console.log(`🔄 [FlowWise] Providing fallback data for: ${actionType}, serviceType: ${serviceType}`);

    const mockListing = this.generateMockListing(serviceType, 0);
    const priceField = this.getServiceTypePriceField(serviceType);
    const providerName = this.getServiceTypeProviderName(serviceType);
    const messages: Record<string, string> = {
      movie: 'Movie selected successfully',
      airline: 'Flight selected successfully',
      hotel: 'Hotel selected successfully',
      restaurant: 'Restaurant selected successfully',
      autoparts: 'Auto part selected successfully',
      dex: 'Token trade selected successfully'
    };

    // Build dynamic fallback with service-type-specific fields
    const baseFallback: any = {
      paymentSuccess: true,
      userDecision: 'YES',
      totalCost: mockListing.price + 0.004450,
      iGasCost: 0.004450,
      updatedBalance: 9999.99,
      llmResponse: {
        selectedListing: mockListing,
        iGasCost: 0.004450,
        message: messages[serviceType] || `${serviceType} selected successfully`
      },
      selectedListing: mockListing,
      ledgerEntry: {
        entryId: `entry_${Date.now()}`,
        amount: mockListing.price,
        merchant: providerName,
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
      error: null,
      validationPassed: true,
      certificateValidated: true
    };

    // Add service-type-specific price field
    baseFallback[priceField] = mockListing.price;

    // Add DEX-specific trade data if needed
    if (serviceType === 'dex') {
      baseFallback.trade = {
        action: 'BUY',
        tokenAmount: 1,
        baseAmount: 100,
        price: 100,
        iTax: 0.5
      };
    }

    return baseFallback;
  }

  /**
   * Execute a specific workflow step manually
   */
  async executeStepManually(executionId: string, stepId: string, context?: any): Promise<boolean> {
    console.log(`▶️ [FlowWise] Manually executing step: ${stepId} in execution: ${executionId}`);

    const baseUrl = this.apiBaseUrl;

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

  /**
   * Get all active executions
   */
  getAllActiveExecutions(): WorkflowExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get the most recent active execution
   */
  getLatestActiveExecution(): WorkflowExecution | null {
    const executions = this.getAllActiveExecutions();
    if (executions.length === 0) {
      return null;
    }
    // Return the most recent execution (by executionId timestamp)
    return executions.sort((a, b) => {
      const aTime = parseInt(a.executionId.split('-')[1] || '0');
      const bTime = parseInt(b.executionId.split('-')[1] || '0');
      return bTime - aTime;
    })[0];
  }
}

