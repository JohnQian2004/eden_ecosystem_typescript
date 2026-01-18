import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface ServiceType {
  type: string;
  icon: string;
  name: string;
  description: string;
}

interface GardenConfig {
  serviceType: string;
  gardenName: string;
  serverIp: string;
  serverDomain: string;
  serverPort: number;
  networkType: 'http' | 'https';
  isSnake: boolean;
  selectedProviders?: string[]; // Selected movie theater providers
}

interface CustomProvider {
  id?: string;
  name: string;
  location: string;
  bond: number;
  reputation: number;
  apiEndpoint: string;
}

@Component({
  selector: 'app-system-config',
  templateUrl: './system-config.component.html',
  styleUrls: ['./system-config.component.scss']
})
export class SystemConfigComponent implements OnInit {
  serviceTypes: ServiceType[] = [];
  isLoadingServiceTypes: boolean = false;
  
  // User and wallet
  userEmail: string = '';
  walletBalance: number = 0;
  isLoadingBalance: boolean = false;
  
  // Wizard state
  wizardStep: number = 1; // 0: New Service Type Creation, 1: Service Type Selection, 2: Configuration, 3: Review
  selectedServiceType: ServiceType | null = null;
  
  // New Service Type Creation state
  isCreatingNewServiceType: boolean = false;
  newServiceTypeDescription: string = 'I need a multi-vendor ecommerce service provider that needs to persist vendorId/location/price/shipping cost/categories/itemName/quantity etc in ledger';
  newServiceTypeName: string = '';
  newServiceTypeIcon: string = '🆕';
  systemPromptResult: any = null;
  notificationCodeResult: any = null;
  isGeneratingSystemPrompt: boolean = false;
  isGeneratingNotificationCode: boolean = false;
  generationError: string | null = null;
  chatHistory: Array<{role: 'user' | 'assistant', content: string, timestamp: number}> = [];
  gardenConfig: GardenConfig = {
    serviceType: '',
    gardenName: '',
    serverIp: 'localhost',
    serverDomain: '',
    serverPort: 3001,
    networkType: 'http',
    isSnake: false,
    selectedProviders: []
  };
  
  // Available movie theater providers (predefined)
  movieProviders = [
    { id: 'amc-001', name: 'AMC Theatres' },
    { id: 'cinemark-001', name: 'Cinemark' },
    { id: 'moviecom-001', name: 'MovieCom' }
  ];
  
  // Custom providers (for any service type)
  customProviders: CustomProvider[] = [];
  
  // Deployment cost
  deploymentFee: number = 110; // Base deployment fee in 🍎 APPLES
  
  isCreating: boolean = false;
  creationError: string | null = null;
  creationSuccess: boolean = false;
  
  isResetting: boolean = false;
  resetError: string | null = null;
  resetSuccess: boolean = false;

  // Workflow Designer state
  availableWorkflows: Array<{serviceType: string, filename: string, exists: boolean, stepCount?: number}> = [];
  selectedWorkflowServiceType: string = '';
  isGeneratingWorkflow: boolean = false;
  workflowGenerationError: string | null = null;
  workflowGenerationSuccess: boolean = false;
  generatedWorkflow: any = null;

  @Output() gardensRefreshed = new EventEmitter<void>();

  private apiUrl = window.location.port === '4200' 
    ? 'http://localhost:3000' 
    : '';

  // Check if current user is in GOD mode
  get isGodMode(): boolean {
    const viewMode = localStorage.getItem('edenViewMode');
    const userEmail = localStorage.getItem('userEmail') || '';
    const adminEmail = 'bill.draper.auto@gmail.com';
    return viewMode === 'god' && userEmail === adminEmail;
  }

  constructor(private http: HttpClient) {
    // Listen for Google Sign-In changes
    window.addEventListener('storage', (e) => {
      if (e.key === 'userEmail' || e.key === 'googleCredential') {
        // Reload user email and balance when Google Sign-In changes
        const googleCredential = localStorage.getItem('googleCredential');
        if (googleCredential) {
          try {
            const payload = JSON.parse(atob(googleCredential.split('.')[1]));
            if (payload.email) {
              this.userEmail = payload.email;
              this.loadWalletBalance();
            }
          } catch (err) {
            console.warn('Failed to decode Google credential on storage change');
          }
        } else if (e.key === 'userEmail' && e.newValue) {
          this.userEmail = e.newValue;
          this.loadWalletBalance();
        }
      }
    });
  }

  ngOnInit() {
    // Get user email - check Google Sign-In first, then localStorage fallback
    const googleCredential = localStorage.getItem('googleCredential');
    if (googleCredential) {
      try {
        // Decode Google credential JWT to get email
        const payload = JSON.parse(atob(googleCredential.split('.')[1]));
        if (payload.email) {
          this.userEmail = payload.email;
          console.log(`✅ Wizard: Using Google Sign-In email: ${this.userEmail}`);
        } else {
          // Fallback to localStorage email
          this.userEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
        }
      } catch (err) {
        console.warn('Failed to decode Google credential, using localStorage email');
        this.userEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
      }
    } else {
      // No Google credential, use localStorage email
      this.userEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
    }
    
    // Load wallet balance and service types
    this.loadWalletBalance();
    this.loadServiceTypes();
    this.loadAvailableWorkflows();
  }

  loadWalletBalance() {
    // Always get the latest email from localStorage to ensure we're using the current signed-in user
    const savedEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
    
    // Update userEmail if it's different (user signed in with different account)
    if (this.userEmail !== savedEmail) {
      console.log(`📧 [SystemConfig] Email changed from ${this.userEmail} to ${savedEmail}, clearing wallet balance`);
      this.walletBalance = 0;
      this.isLoadingBalance = true;
      this.userEmail = savedEmail;
    }
    
    if (!this.userEmail || !this.userEmail.includes('@')) {
      console.warn('No valid email, skipping balance load');
      return;
    }
    
    this.isLoadingBalance = true;
    this.http.get<{success: boolean, balance?: number, error?: string}>(
      `${this.apiUrl}/api/jsc/balance/${encodeURIComponent(this.userEmail)}`
    ).subscribe({
      next: (response) => {
        this.isLoadingBalance = false;
        if (response.success) {
          this.walletBalance = response.balance || 0;
          console.log(`✅ Wallet balance loaded: ${this.walletBalance} 🍎 APPLES`);
        } else {
          console.error('Failed to load balance:', response.error);
          this.walletBalance = 0;
        }
      },
      error: (err) => {
        console.error('Error loading wallet balance:', err);
        this.walletBalance = 0;
        this.isLoadingBalance = false;
      }
    });
  }

  calculateDeploymentFee(): number {
    // Base garden fee: 100 🍎 APPLES
    const baseGardenFee = 100;
    
    // Snake services: 2x multiplier (220 🍎 APPLES)
    if (this.selectedServiceType?.type === 'snake') {
      return this.deploymentFee * 2;
    }
    
    // For movie service type: base garden fee (100 🍎 APPLES)
    if (this.selectedServiceType?.type === 'movie') {
      // Add 10 🍎 APPLES per provider (for all service types)
      const providerCount = this.getProviderCount();
      return baseGardenFee + (providerCount * 10);
    }
    
    // For other service types: base fee + 10 🍎 APPLES per custom provider
    const providerCount = this.getProviderCount();
    return baseGardenFee + (providerCount * 10);
  }

  hasSufficientBalance(): boolean {
    return this.walletBalance >= this.calculateDeploymentFee();
  }

  hasSelectedProviders(): boolean {
    // For movie service type, check if providers are selected (predefined or custom)
    if (this.gardenConfig.serviceType === 'movie') {
      return this.hasProviders();
    }
    // For other service types, providers are optional (but can be added via custom providers)
    return true;
  }

  loadServiceTypes() {
    this.isLoadingServiceTypes = true;
    this.http.get<{success: boolean, serviceTypes: ServiceType[]}>(`${this.apiUrl}/api/wizard/service-types`)
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.serviceTypes = response.serviceTypes;
          }
          this.isLoadingServiceTypes = false;
        },
        error: (err) => {
          console.error('Failed to load service types:', err);
          this.isLoadingServiceTypes = false;
        }
      });
  }

  selectServiceType(serviceType: ServiceType) {
    this.selectedServiceType = serviceType;
    this.gardenConfig.serviceType = serviceType.type;
    this.gardenConfig.isSnake = serviceType.type === 'snake';
    
    // Auto-generate garden name
    const baseName = serviceType.type === 'snake' ? 'Snake' : 
                    serviceType.type === 'dex' ? 'Garden' : 
                    'Garden';
    this.gardenConfig.gardenName = `${baseName}-${serviceType.type.toUpperCase()}`;
    
    // Auto-generate domain
    this.gardenConfig.serverDomain = `garden-${serviceType.type.toLowerCase()}.eden.local`;
    
    // Initialize selected providers for movie service type
    if (serviceType.type === 'movie') {
      // Start with empty selection - user must manually select providers
      this.gardenConfig.selectedProviders = [];
      console.log('🎬 Initialized selectedProviders for movie: empty (user must select)');
    } else {
      this.gardenConfig.selectedProviders = [];
    }
    
    // Refresh wallet balance when entering configuration step
    this.loadWalletBalance();
    
    // Move to next step
    this.wizardStep = 2;
  }

  goBack() {
    if (this.wizardStep > 1) {
      this.wizardStep--;
      if (this.wizardStep === 1) {
        this.selectedServiceType = null;
      }
    }
  }

  calculateNextPort(): number {
    // In a real implementation, this would query existing gardens
    // For now, we'll use a simple increment starting from 3001
    return this.gardenConfig.serverPort || 3001;
  }
  
  createGarden() {
    if (!this.gardenConfig.serviceType || !this.gardenConfig.gardenName) {
      this.creationError = 'Service type and garden name are required';
      return;
    }

    if (!this.userEmail || !this.userEmail.includes('@')) {
      this.creationError = 'Valid email address required. Please sign in first.';
      return;
    }

    // For movie service type, validate that at least one provider is selected
    if (this.gardenConfig.serviceType === 'movie') {
      const selectedProviders = this.gardenConfig.selectedProviders || [];
      if (!Array.isArray(selectedProviders) || selectedProviders.length === 0) {
        this.creationError = 'Please select at least one movie theater provider';
        return;
      }
    }

    const requiredFee = this.calculateDeploymentFee();
    
    // Check wallet balance first
    if (this.walletBalance < requiredFee) {
      this.creationError = `Insufficient balance. Required: ${requiredFee} 🍎 APPLES, Available: ${this.walletBalance} 🍎 APPLES. Please purchase more 🍎 APPLES first.`;
      return;
    }

    this.isCreating = true;
    this.creationError = null;
    this.creationSuccess = false;

    // Include email and amount in the request
    const requestBody: any = {
      serviceType: this.gardenConfig.serviceType,
      gardenName: this.gardenConfig.gardenName, // Use gardenName (backend accepts both for compatibility)
      serverIp: this.gardenConfig.serverIp,
      serverDomain: this.gardenConfig.serverDomain,
      serverPort: this.gardenConfig.serverPort,
      networkType: this.gardenConfig.networkType,
      isSnake: this.gardenConfig.isSnake,
      email: this.userEmail,
      amount: requiredFee
    };
    
    // Build providers array from both predefined (selectedProviders) and custom providers
    const providers: Array<{
      id?: string;
      name: string;
      location: string;
      bond: number;
      reputation: number;
      apiEndpoint: string;
    }> = [];
    
    // Add predefined providers (for movie service type, backward compatibility)
    if (this.gardenConfig.serviceType === 'movie' && this.gardenConfig.selectedProviders && Array.isArray(this.gardenConfig.selectedProviders)) {
      // Convert selected provider IDs to provider configs
      for (const providerId of this.gardenConfig.selectedProviders) {
        const predefinedProvider = this.movieProviders.find(p => p.id === providerId);
        if (predefinedProvider) {
          providers.push({
            id: providerId,
            name: predefinedProvider.name,
            location: 'Baltimore, Maryland', // Default location
            bond: 1000, // Default bond
            reputation: 4.5, // Default reputation
            apiEndpoint: `https://api.${providerId.replace('-001', '').toLowerCase()}.com/v1`
          });
        }
      }
    }
    
    // Add custom providers
    if (this.customProviders && this.customProviders.length > 0) {
      providers.push(...this.customProviders);
    }
    
    // Include providers array if any providers are specified
    if (providers.length > 0) {
      requestBody.providers = providers;
    }
    
    // Backward compatibility: Also include selectedProviders for movie (if no custom providers)
    if (this.gardenConfig.serviceType === 'movie' && providers.length === 0) {
      requestBody.selectedProviders = Array.isArray(this.gardenConfig.selectedProviders) 
        ? this.gardenConfig.selectedProviders 
        : [];
    }
    
    console.log('📤 Creating garden with providers:', providers);
    console.log('📤 Request body:', { ...requestBody, providers: providers.length });
    
    this.http.post<{success: boolean, garden?: any, balance?: number, error?: string}>(
      `${this.apiUrl}/api/wizard/create-garden`,
      requestBody
    ).subscribe({
      next: (response) => {
        if (response.success) {
          // Update wallet balance
          if (response.balance !== undefined) {
            this.walletBalance = response.balance;
          }
          this.creationSuccess = true;
          this.wizardStep = 3;
          
          // Emit gardens refreshed event to notify parent component
          console.log('✅ Garden created successfully, emitting gardensRefreshed event');
          this.gardensRefreshed.emit();
          
          // Reset after 3 seconds
          setTimeout(() => {
            this.resetWizard();
          }, 3000);
        } else {
          this.creationError = response.error || 'Failed to create garden';
        }
        this.isCreating = false;
      },
      error: (err) => {
        this.creationError = err.error?.error || 'Failed to create garden';
        this.isCreating = false;
      }
    });
  }

  resetWizard() {
    this.wizardStep = 1;
    this.selectedServiceType = null;
    this.gardenConfig = {
      serviceType: '',
      gardenName: '',
      serverIp: 'localhost',
      serverDomain: '',
      serverPort: 3001,
      networkType: 'http',
      isSnake: false,
      selectedProviders: []
    };
    this.customProviders = [];
    this.creationError = null;
    this.creationSuccess = false;
  }
  
  addCustomProvider() {
    this.customProviders.push({
      name: '',
      location: '',
      bond: 1000,
      reputation: 5.0,
      apiEndpoint: ''
    });
  }
  
  removeCustomProvider(index: number) {
    this.customProviders.splice(index, 1);
  }
  
  hasProviders(): boolean {
    // Check if there are any providers (predefined or custom)
    const hasPredefined = this.gardenConfig.serviceType === 'movie' && 
                         this.gardenConfig.selectedProviders && 
                         Array.isArray(this.gardenConfig.selectedProviders) && 
                         this.gardenConfig.selectedProviders.length > 0;
    const hasCustom = this.customProviders && this.customProviders.length > 0;
    return hasPredefined || hasCustom;
  }
  
  getProviderCount(): number {
    const predefinedCount = (this.gardenConfig.serviceType === 'movie' && 
                            this.gardenConfig.selectedProviders && 
                            Array.isArray(this.gardenConfig.selectedProviders)) 
                            ? this.gardenConfig.selectedProviders.length 
                            : 0;
    const customCount = this.customProviders ? this.customProviders.length : 0;
    return predefinedCount + customCount;
  }

  startNewServiceTypeCreation() {
    this.wizardStep = 0;
    // Keep the hardcoded description, don't clear it
    // this.newServiceTypeDescription = '';
    this.newServiceTypeName = '';
    this.newServiceTypeIcon = '🆕';
    this.systemPromptResult = null;
    this.notificationCodeResult = null;
    this.generationError = null;
    this.chatHistory = [];
  }

  goBackToServiceSelection() {
    this.wizardStep = 1;
    this.systemPromptResult = null;
    this.notificationCodeResult = null;
    this.generationError = null;
  }

  generateSystemPrompt() {
    if (!this.newServiceTypeDescription.trim()) {
      this.generationError = 'Please provide a description of your service type';
      return;
    }

    // Auto-generate service type name from description if not provided
    if (!this.newServiceTypeName.trim()) {
      // Extract a simple name from description (first few words, lowercase, no special chars)
      const words = this.newServiceTypeDescription.toLowerCase().split(/\s+/).slice(0, 3);
      this.newServiceTypeName = words.join('-').replace(/[^a-z0-9-]/g, '');
    }

    this.isGeneratingSystemPrompt = true;
    this.generationError = null;
    this.chatHistory.push({
      role: 'user',
      content: this.newServiceTypeDescription,
      timestamp: Date.now()
    });

    this.http.post<{success: boolean, prompts?: any, redisKey?: string, error?: string}>(
      `${this.apiUrl}/api/system-prompt/generate`,
      {
        description: this.newServiceTypeDescription,
        serviceType: this.newServiceTypeName.trim()
      }
    ).subscribe({
      next: (response) => {
        if (response.success && response.prompts) {
          this.systemPromptResult = response.prompts;
          this.chatHistory.push({
            role: 'assistant',
            content: 'System prompt generated successfully!',
            timestamp: Date.now()
          });
        } else {
          this.generationError = response.error || 'Failed to generate system prompt';
        }
        this.isGeneratingSystemPrompt = false;
      },
      error: (err) => {
        console.error('Failed to generate system prompt:', err);
        this.generationError = err.error?.error || err.message || 'Failed to generate system prompt';
        this.isGeneratingSystemPrompt = false;
      }
    });
  }

  regenerateSystemPrompt() {
    this.systemPromptResult = null;
    this.generateSystemPrompt();
  }

  generateNotificationCode() {
    if (!this.systemPromptResult) {
      this.generationError = 'Please generate system prompt first';
      return;
    }

    this.isGeneratingNotificationCode = true;
    this.generationError = null;

    const providerId = `${this.newServiceTypeName}-001`;
    const providerName = this.newServiceTypeName.charAt(0).toUpperCase() + this.newServiceTypeName.slice(1);

    this.http.post<{success: boolean, code?: any, redisKey?: string, error?: string}>(
      `${this.apiUrl}/api/notification-code/generate`,
      {
        providerId: providerId,
        providerName: providerName,
        language: 'typescript',
        framework: 'express',
        indexerEndpoint: `http://localhost:3000`,
        webhookUrl: `http://localhost:3000/mock/webhook/${providerId}`,
        serviceType: this.newServiceTypeName.trim(),
        notificationMethods: ['webhook', 'pull', 'rpc']
      }
    ).subscribe({
      next: (response) => {
        if (response.success && response.code) {
          this.notificationCodeResult = response.code;
          this.chatHistory.push({
            role: 'assistant',
            content: 'Notification code generated successfully!',
            timestamp: Date.now()
          });
        } else {
          this.generationError = response.error || 'Failed to generate notification code';
        }
        this.isGeneratingNotificationCode = false;
      },
      error: (err) => {
        console.error('Failed to generate notification code:', err);
        this.generationError = err.error?.error || err.message || 'Failed to generate notification code';
        this.isGeneratingNotificationCode = false;
      }
    });
  }

  regenerateNotificationCode() {
    this.notificationCodeResult = null;
    this.generateNotificationCode();
  }

  saveAndCreateGarden() {
    if (!this.systemPromptResult || !this.notificationCodeResult) {
      this.generationError = 'Please generate both system prompt and notification code first';
      return;
    }

    // Save system prompt to persistence file
    this.saveSystemPromptToPersistence().then(() => {
      // Create the garden using the standard flow
      this.selectedServiceType = {
        type: this.newServiceTypeName.trim(),
        name: this.newServiceTypeName.charAt(0).toUpperCase() + this.newServiceTypeName.slice(1),
        icon: this.newServiceTypeIcon || '🆕',
        description: this.newServiceTypeDescription
      };
      
      this.gardenConfig.serviceType = this.newServiceTypeName.trim();
      this.gardenConfig.gardenName = `Garden-${this.newServiceTypeName.toUpperCase()}`;
      this.gardenConfig.serverDomain = `garden-${this.newServiceTypeName.toLowerCase()}.eden.local`;
      this.gardenConfig.isSnake = false;
      this.gardenConfig.selectedProviders = [];
      
      // Move to configuration step
      this.wizardStep = 2;
    }).catch((err) => {
      this.generationError = `Failed to save system prompt: ${err.message}`;
    });
  }

  async saveSystemPromptToPersistence(): Promise<void> {
    return new Promise((resolve, reject) => {
      const systemPromptData = {
        serviceType: this.newServiceTypeName.trim(),
        description: this.newServiceTypeDescription,
        queryExtractionPrompt: this.systemPromptResult.queryExtractionPrompt || this.systemPromptResult.prompts?.queryExtractionPrompt,
        responseFormattingPrompt: this.systemPromptResult.responseFormattingPrompt || this.systemPromptResult.prompts?.responseFormattingPrompt,
        notificationCode: this.notificationCodeResult,
        createdAt: new Date().toISOString(),
        createdBy: this.userEmail
      };

      this.http.post<{success: boolean, error?: string}>(
        `${this.apiUrl}/api/wallet/persistence/system-prompt`,
        systemPromptData
      ).subscribe({
        next: (response) => {
          if (response.success) {
            console.log('✅ System prompt saved to persistence');
            resolve();
          } else {
            reject(new Error(response.error || 'Failed to save system prompt'));
          }
        },
        error: (err) => {
          console.error('Failed to save system prompt:', err);
          reject(err);
        }
      });
    });
  }

  loadAvailableWorkflows() {
    console.log('🔧 [Workflow Designer] Loading available workflows...');
    
    // Load existing workflows from server
    this.http.get<{success: boolean, workflows: Array<{serviceType: string, filename: string, exists: boolean, stepCount?: number}>}>(`${this.apiUrl}/api/workflow/list`)
      .subscribe({
        next: (response) => {
          console.log('🔧 [Workflow Designer] Workflow list response:', response);
          if (response.success && response.workflows) {
            // Use workflows directly from server response
            this.availableWorkflows = response.workflows;
            console.log(`🔧 [Workflow Designer] Loaded ${this.availableWorkflows.length} workflows:`, this.availableWorkflows);
          } else {
            console.error('🔧 [Workflow Designer] Failed to load workflows: response.success = false');
            // Fallback: Initialize with default list
            this.availableWorkflows = [
              { serviceType: 'movie', filename: 'movie.json', exists: false },
              { serviceType: 'dex', filename: 'dex.json', exists: false },
              { serviceType: 'airline', filename: 'airline.json', exists: false },
              { serviceType: 'autoparts', filename: 'autoparts.json', exists: false },
              { serviceType: 'hotel', filename: 'hotel.json', exists: false },
              { serviceType: 'restaurant', filename: 'restaurant.json', exists: false },
              { serviceType: 'snake', filename: 'snake.json', exists: false }
            ];
          }
        },
        error: (err) => {
          console.error('🔧 [Workflow Designer] Failed to load available workflows:', err);
          // Fallback: Initialize with default list
          this.availableWorkflows = [
            { serviceType: 'movie', filename: 'movie.json', exists: false },
            { serviceType: 'dex', filename: 'dex.json', exists: false },
            { serviceType: 'airline', filename: 'airline.json', exists: false },
            { serviceType: 'autoparts', filename: 'autoparts.json', exists: false },
            { serviceType: 'hotel', filename: 'hotel.json', exists: false },
            { serviceType: 'restaurant', filename: 'restaurant.json', exists: false },
            { serviceType: 'snake', filename: 'snake.json', exists: false }
          ];
        }
      });
  }

  generateWorkflow() {
    if (!this.selectedWorkflowServiceType) {
      this.workflowGenerationError = 'Please select a service type';
      return;
    }

    this.isGeneratingWorkflow = true;
    this.workflowGenerationError = null;
    this.workflowGenerationSuccess = false;
    this.generatedWorkflow = null;

    console.log(`🔧 [Workflow Designer] Generating workflow for service type: ${this.selectedWorkflowServiceType}`);

    this.http.post<{success: boolean, workflow?: any, filename?: string, error?: string}>(
      `${this.apiUrl}/api/workflow/generate`,
      {
        serviceType: this.selectedWorkflowServiceType
      }
    ).subscribe({
      next: (response) => {
        if (response.success && response.workflow) {
          this.generatedWorkflow = response.workflow;
          this.workflowGenerationSuccess = true;
          console.log(`✅ [Workflow Designer] Workflow generated successfully: ${response.filename}`);
          console.log(`📋 [Workflow Designer] Generated workflow:`, this.generatedWorkflow);
          
          // Update the workflow status in the table immediately
          const workflowIndex = this.availableWorkflows.findIndex(w => w.serviceType === this.selectedWorkflowServiceType);
          if (workflowIndex >= 0) {
            this.availableWorkflows[workflowIndex].exists = true;
            console.log(`✅ [Workflow Designer] Updated workflow status for ${this.selectedWorkflowServiceType}: exists = true`);
          }
          
          // Also reload from server to ensure consistency
          setTimeout(() => {
            this.loadAvailableWorkflows();
          }, 500);
          
          // Hide success message after 5 seconds
          setTimeout(() => {
            this.workflowGenerationSuccess = false;
          }, 5000);
        } else {
          this.workflowGenerationError = response.error || 'Failed to generate workflow';
        }
        this.isGeneratingWorkflow = false;
      },
      error: (err) => {
        console.error('Failed to generate workflow:', err);
        this.workflowGenerationError = err.error?.error || err.message || 'Failed to generate workflow';
        this.isGeneratingWorkflow = false;
      }
    });
  }

  resetWalletPersistence() {
    if (!confirm('⚠️ WARNING: This will clear ALL wallet balances and audit logs from the persistence file.\n\nThis action cannot be undone. Continue?')) {
      return;
    }

    this.isResetting = true;
    this.resetError = null;
    this.resetSuccess = false;

    this.http.post<{success: boolean, message?: string, clearedKeys?: number, error?: string}>(
      `${this.apiUrl}/api/wallet/reset`,
      {}
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.resetSuccess = true;
          this.walletBalance = 0; // Reset displayed balance
          console.log(`✅ Wallet persistence reset: ${response.message}`);
          
          // Emit event to trigger garden refresh in parent component
          this.gardensRefreshed.emit();
          
          // Hide success message after 3 seconds
          setTimeout(() => {
            this.resetSuccess = false;
          }, 3000);
        } else {
          this.resetError = response.error || 'Failed to reset wallet persistence';
        }
        this.isResetting = false;
      },
      error: (err) => {
        this.resetError = err.error?.error || err.message || 'Failed to reset wallet persistence';
        this.isResetting = false;
      }
    });
  }
}
