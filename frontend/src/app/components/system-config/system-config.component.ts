import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface ServiceType {
  type: string;
  icon: string;
  name: string;
  description: string;
}

interface IndexerConfig {
  serviceType: string;
  indexerName: string;
  serverIp: string;
  serverDomain: string;
  serverPort: number;
  networkType: 'http' | 'https';
  isSnake: boolean;
  selectedProviders?: string[]; // Selected movie theater providers
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
  indexerConfig: IndexerConfig = {
    serviceType: '',
    indexerName: '',
    serverIp: 'localhost',
    serverDomain: '',
    serverPort: 3001,
    networkType: 'http',
    isSnake: false,
    selectedProviders: []
  };
  
  // Available movie theater providers
  movieProviders = [
    { id: 'amc-001', name: 'AMC Theatres' },
    { id: 'cinemark-001', name: 'Cinemark' },
    { id: 'moviecom-001', name: 'MovieCom' }
  ];
  
  // Deployment cost
  deploymentFee: number = 110; // Base deployment fee in JSC
  
  isCreating: boolean = false;
  creationError: string | null = null;
  creationSuccess: boolean = false;
  
  isResetting: boolean = false;
  resetError: string | null = null;
  resetSuccess: boolean = false;

  @Output() indexersRefreshed = new EventEmitter<void>();

  private apiUrl = window.location.port === '4200' 
    ? 'http://localhost:3000' 
    : '';

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
  }

  loadWalletBalance() {
    if (!this.userEmail || !this.userEmail.includes('@')) {
      console.warn('No valid email, skipping balance load');
      return;
    }
    
    this.isLoadingBalance = true;
    this.http.get<{success: boolean, balance?: number, error?: string}>(
      `${this.apiUrl}/api/jsc/balance/${encodeURIComponent(this.userEmail)}`
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.walletBalance = response.balance || 0;
          console.log(`✅ Wallet balance loaded: ${this.walletBalance} JSC`);
        } else {
          console.error('Failed to load balance:', response.error);
          this.walletBalance = 0;
        }
        this.isLoadingBalance = false;
      },
      error: (err) => {
        console.error('Error loading wallet balance:', err);
        this.walletBalance = 0;
        this.isLoadingBalance = false;
      }
    });
  }

  calculateDeploymentFee(): number {
    // Base indexer fee: 100 JSC
    const baseIndexerFee = 100;
    
    // Snake services: 2x multiplier (220 JSC)
    if (this.selectedServiceType?.type === 'snake') {
      return this.deploymentFee * 2;
    }
    
    // For movie service type: base indexer fee (100 JSC) + 10 JSC per selected provider
    if (this.selectedServiceType?.type === 'movie') {
      const providerCount = this.indexerConfig.selectedProviders?.length || 0;
      return baseIndexerFee + (providerCount * 10);
    }
    
    return this.deploymentFee;
  }

  hasSufficientBalance(): boolean {
    return this.walletBalance >= this.calculateDeploymentFee();
  }

  hasSelectedProviders(): boolean {
    // For movie service type, require at least one provider to be selected
    if (this.selectedServiceType?.type === 'movie') {
      const selectedProviders = this.indexerConfig.selectedProviders || [];
      return Array.isArray(selectedProviders) && selectedProviders.length > 0;
    }
    // For other service types (snake, dex), providers are not required
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
    this.indexerConfig.serviceType = serviceType.type;
    this.indexerConfig.isSnake = serviceType.type === 'snake';
    
    // Auto-generate indexer name
    const baseName = serviceType.type === 'snake' ? 'Snake' : 
                    serviceType.type === 'dex' ? 'Garden' : 
                    'Garden';
    this.indexerConfig.indexerName = `${baseName}-${serviceType.type.toUpperCase()}`;
    
    // Auto-generate domain
    this.indexerConfig.serverDomain = `indexer-${serviceType.type.toLowerCase()}.eden.local`;
    
    // Initialize selected providers for movie service type
    if (serviceType.type === 'movie') {
      // Start with empty selection - user must manually select providers
      this.indexerConfig.selectedProviders = [];
      console.log('🎬 Initialized selectedProviders for movie: empty (user must select)');
    } else {
      this.indexerConfig.selectedProviders = [];
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
    // In a real implementation, this would query existing indexers
    // For now, we'll use a simple increment starting from 3001
    return this.indexerConfig.serverPort || 3001;
  }

  createIndexer() {
    if (!this.indexerConfig.serviceType || !this.indexerConfig.indexerName) {
      this.creationError = 'Service type and indexer name are required';
      return;
    }

    if (!this.userEmail || !this.userEmail.includes('@')) {
      this.creationError = 'Valid email address required. Please sign in first.';
      return;
    }

    // For movie service type, validate that at least one provider is selected
    if (this.indexerConfig.serviceType === 'movie') {
      const selectedProviders = this.indexerConfig.selectedProviders || [];
      if (!Array.isArray(selectedProviders) || selectedProviders.length === 0) {
        this.creationError = 'Please select at least one movie theater provider';
        return;
      }
    }

    const requiredFee = this.calculateDeploymentFee();
    
    // Check wallet balance first
    if (this.walletBalance < requiredFee) {
      this.creationError = `Insufficient balance. Required: ${requiredFee} JSC, Available: ${this.walletBalance} JSC. Please purchase more JSC first.`;
      return;
    }

    this.isCreating = true;
    this.creationError = null;
    this.creationSuccess = false;

    // Include email and amount in the request
    // Ensure selectedProviders is included and is an array (only for movie service type)
    const requestBody: any = {
      ...this.indexerConfig,
      email: this.userEmail,
      amount: requiredFee
    };
    
    // Only include selectedProviders for movie service type
    if (this.indexerConfig.serviceType === 'movie') {
      requestBody.selectedProviders = Array.isArray(this.indexerConfig.selectedProviders) 
        ? this.indexerConfig.selectedProviders 
        : [];
    }
    
    console.log('📤 Creating indexer with selectedProviders:', requestBody.selectedProviders);

    this.http.post<{success: boolean, indexer?: any, balance?: number, error?: string}>(
      `${this.apiUrl}/api/wizard/create-indexer`,
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
          // Reset after 3 seconds
          setTimeout(() => {
            this.resetWizard();
          }, 3000);
        } else {
          this.creationError = response.error || 'Failed to create indexer';
        }
        this.isCreating = false;
      },
      error: (err) => {
        this.creationError = err.error?.error || 'Failed to create indexer';
        this.isCreating = false;
      }
    });
  }

  resetWizard() {
    this.wizardStep = 1;
    this.selectedServiceType = null;
    this.indexerConfig = {
      serviceType: '',
      indexerName: '',
      serverIp: 'localhost',
      serverDomain: '',
      serverPort: 3001,
      networkType: 'http',
      isSnake: false,
      selectedProviders: []
    };
    this.creationError = null;
    this.creationSuccess = false;
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

  saveAndCreateIndexer() {
    if (!this.systemPromptResult || !this.notificationCodeResult) {
      this.generationError = 'Please generate both system prompt and notification code first';
      return;
    }

    // Save system prompt to persistence file
    this.saveSystemPromptToPersistence().then(() => {
      // Create the indexer using the standard flow
      this.selectedServiceType = {
        type: this.newServiceTypeName.trim(),
        name: this.newServiceTypeName.charAt(0).toUpperCase() + this.newServiceTypeName.slice(1),
        icon: this.newServiceTypeIcon || '🆕',
        description: this.newServiceTypeDescription
      };
      
      this.indexerConfig.serviceType = this.newServiceTypeName.trim();
      this.indexerConfig.indexerName = `Indexer-${this.newServiceTypeName.toUpperCase()}`;
      this.indexerConfig.serverDomain = `indexer-${this.newServiceTypeName.toLowerCase()}.eden.local`;
      this.indexerConfig.isSnake = false;
      this.indexerConfig.selectedProviders = [];
      
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
          
          // Emit event to trigger indexer refresh in parent component
          this.indexersRefreshed.emit();
          
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
