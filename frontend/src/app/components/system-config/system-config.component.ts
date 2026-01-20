import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { getApiBaseUrl } from '../../services/api-base';
import { getCatalogEntry, SERVICE_TYPE_CATALOG } from '../../services/service-type-catalog.service';

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

  // Data provider selection (LLM vs getData/MySQL)
  dataProviderType: 'llm' | 'getdata' = 'llm'; // Default to LLM for all gardens except autoparts
  
  // Provider plugin (MySQL/MariaDB) + webhook testing (garden wizard)
  enableMySqlPlugin: boolean = false; // Only enabled when dataProviderType === 'getdata'
  mySqlHost: string = '127.0.0.1';
  mySqlPort: number = 3306;
  mySqlUser: string = 'root';
  mySqlPassword: string = 'test'; // Hardcoded for testing
  mySqlDatabase: string = 'testdbjwt'; // Hardcoded database name for testing
  mySqlSql: string = `SELECT DISTINCT a.id, 
  i.id AS image_id,
  i.autopart_id,
  a.year,
  a.make,
  a.model,
  a.title,
  a.sale_price,
  u.id AS user_id,
  u.email AS user_email,
  u.first_name AS user_first_name,
  u.last_name AS user_last_name,
  u.phone AS user_phone
FROM autoparts a 
LEFT JOIN images i ON a.id = i.autopart_id 
LEFT JOIN users u ON a.user_id = u.id 
WHERE a.year = 2006 
  AND a.make = 'honda' 
  AND a.model = 'civic' 
  AND a.title LIKE CONCAT('%', 'bumper', '%') 
  AND a.status = 2
  AND a.archived = false 
  AND a.published = true 
ORDER BY a.id DESC
LIMIT 30 OFFSET 0`;
  mySqlParamOrder: string = ''; // comma-separated filter keys (e.g. "destination,date")
  mySqlFieldMapJson: string = ''; // JSON object mapping canonical fields -> column names
  mySqlReturnFields: string = 'year, make, model, title, sale_price, user_first_name, user_last_name, user_email, user_phone'; // comma-separated fields to include in final return
  isTestingMySql: boolean = false;
  mySqlTestResult: any = null;
  mySqlTestError: string | null = null;

  enableProviderWebhook: boolean = true;
  isTestingProviderWebhook: boolean = false;
  providerWebhookTestResult: any = null;
  providerWebhookTestError: string | null = null;

  // getData wrapper testing (pre-flight validation)
  getDataTestQuery: string = 'I need a front bumper for 2020 Honda Civic at best price';
  isTestingGetData: boolean = false;
  getDataTestResult: any = null;
  getDataTestError: string | null = null;
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

  private apiUrl = getApiBaseUrl();

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
    
    // Load wallet balance and workflows first (workflows will populate service types)
    this.loadWalletBalance();
    this.loadAvailableWorkflows();
    // Service types will be populated from existing workflows after they load
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

    // DEX Gardens live in the DEX ecosystem (no 🍎 APPLES deployment economics)
    if (this.selectedServiceType?.type === 'dex') {
      return 0;
    }
    
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
    // Service types are now derived from existing workflows instead of hardcoded API
    // This removes hardcoded dependencies and uses only workflows that actually exist
    this.isLoadingServiceTypes = true;
    
    // Convert existing workflows to service types
    const existingWorkflows = this.getExistingWorkflows();
    this.serviceTypes = existingWorkflows.map(workflow => {
      // Map workflow service type to ServiceType format
      const serviceTypeName = workflow.serviceType.charAt(0).toUpperCase() + workflow.serviceType.slice(1).replace(/([A-Z])/g, ' $1');
      
      // Get icon from shared catalog, fallback to hardcoded map for service types not in catalog
      const catalogEntry = getCatalogEntry(workflow.serviceType);
      let icon = catalogEntry?.icon;
      
      if (!icon) {
        // Fallback icon map for service types not in the main catalog
        const fallbackIconMap: Record<string, string> = {
          'amc': '🎬',
          'autobodyshop': '🔧',
          'autorepairshop': '🔧',
          'church': '⛪',
          'court': '⚖️',
          'gym': '🏢',
          'hospital': '🏢',
          'jail': '🔒',
          'laborcamp': '🏢',
          'library': '📚',
          'policestation': '🚔',
          'postoffice': '📮',
          'priest': '⛪',
          'school': '🏢',
          'university': '🏢',
          'snake': '🐍'
        };
        icon = fallbackIconMap[workflow.serviceType] || '🏢';
      }
      
      return {
        type: workflow.serviceType,
        icon: icon,
        name: serviceTypeName,
        description: `${serviceTypeName} service with workflow available`
      };
    });
    
    this.isLoadingServiceTypes = false;
    console.log(`✅ Loaded ${this.serviceTypes.length} service types from existing workflows (removed hardcoded dependencies)`);
  }

  // Get service type options for dropdown (from catalog + fallback types)
  getServiceTypeOptions(): Array<{value: string, label: string}> {
    const options: Array<{value: string, label: string}> = [];
    
    // Add catalog entries
    for (const entry of SERVICE_TYPE_CATALOG) {
      options.push({
        value: entry.type,
        label: `${entry.icon} ${entry.adText} - ${entry.adText.toLowerCase()} service`
      });
    }
    
    // Add fallback service types not in catalog
    const fallbackTypes: Record<string, {icon: string, description: string}> = {
      'amc': { icon: '🎬', description: 'AMC movie theater service' },
      'autobodyshop': { icon: '🔧', description: 'Auto body repair service' },
      'autorepairshop': { icon: '🔧', description: 'Auto repair service' },
      'church': { icon: '⛪', description: 'Church services' },
      'court': { icon: '⚖️', description: 'Court services' },
      'gym': { icon: '🏢', description: 'Gym and fitness services' },
      'hospital': { icon: '🏢', description: 'Hospital services' },
      'jail': { icon: '🔒', description: 'Jail services' },
      'laborcamp': { icon: '🏢', description: 'Labor camp services' },
      'library': { icon: '📚', description: 'Library services' },
      'policestation': { icon: '🚔', description: 'Police station services' },
      'postoffice': { icon: '📮', description: 'Post office services' },
      'priest': { icon: '⛪', description: 'Priest services' },
      'school': { icon: '🏢', description: 'School services' },
      'university': { icon: '🏢', description: 'University services' },
      'snake': { icon: '🐍', description: 'Advertising service provider' }
    };
    
    for (const [type, info] of Object.entries(fallbackTypes)) {
      // Only add if not already in catalog
      if (!SERVICE_TYPE_CATALOG.find(e => e.type === type)) {
        const name = type.charAt(0).toUpperCase() + type.slice(1).replace(/([A-Z])/g, ' $1');
        options.push({
          value: type,
          label: `${info.icon} ${name} - ${info.description}`
        });
      }
    }
    
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }

  selectServiceType(serviceType: ServiceType) {
    this.selectedServiceType = serviceType;
    this.gardenConfig.serviceType = serviceType.type;
    this.gardenConfig.isSnake = serviceType.type === 'snake';
    
    // Set default data provider: getData for autoparts, LLM for everything else
    if (serviceType.type === 'autoparts') {
      this.dataProviderType = 'getdata';
      this.enableMySqlPlugin = true;
    } else {
      this.dataProviderType = 'llm';
      this.enableMySqlPlugin = false;
    }
    
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

  onDataProviderTypeChange() {
    // When user changes data provider type, update enableMySqlPlugin accordingly
    this.enableMySqlPlugin = this.dataProviderType === 'getdata';
  }

  selectWorkflowAsServiceType(workflow: {serviceType: string, filename: string, exists: boolean, stepCount?: number}) {
    // Convert workflow to ServiceType format and select it
    const serviceTypeName = workflow.serviceType.charAt(0).toUpperCase() + workflow.serviceType.slice(1).replace(/([A-Z])/g, ' $1');
    
    // Get icon from shared catalog, fallback to hardcoded map for service types not in catalog
    const catalogEntry = getCatalogEntry(workflow.serviceType);
    let icon = catalogEntry?.icon;
    
    if (!icon) {
      // Fallback icon map for service types not in the main catalog
      const fallbackIconMap: Record<string, string> = {
        'amc': '🎬',
        'autobodyshop': '🔧',
        'autorepairshop': '🔧',
        'church': '⛪',
        'court': '⚖️',
        'gym': '🏢',
        'hospital': '🏢',
        'jail': '🔒',
        'laborcamp': '🏢',
        'library': '📚',
        'policestation': '🚔',
        'postoffice': '📮',
        'priest': '⛪',
        'school': '🏢',
        'university': '🏢',
        'snake': '🐍'
      };
      icon = fallbackIconMap[workflow.serviceType] || '🏢';
    }
    
    const serviceType: ServiceType = {
      type: workflow.serviceType,
      icon: icon,
      name: serviceTypeName,
      description: `${serviceTypeName} service with workflow available`
    };
    
    // Use the same selection logic as regular service types
    this.selectServiceType(serviceType);
    console.log(`✅ Selected workflow ${workflow.serviceType} as service type`);
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
    const isDexGarden = this.gardenConfig.serviceType === 'dex';
    
    // SaaS gardens use 🍎 APPLES deployment economics; DEX gardens do not.
    if (!isDexGarden) {
      // Check wallet balance first
      if (this.walletBalance < requiredFee) {
        this.creationError = `Insufficient balance. Required: ${requiredFee} 🍎 APPLES, Available: ${this.walletBalance} 🍎 APPLES. Please purchase more 🍎 APPLES first.`;
        return;
      }
    }

    this.isCreating = true;
    this.creationError = null;
    this.creationSuccess = false;

    // Include email and amount in the request (amount omitted for DEX gardens)
    const requestBody: any = {
      serviceType: this.gardenConfig.serviceType,
      gardenName: this.gardenConfig.gardenName, // Use gardenName (backend accepts both for compatibility)
      serverIp: this.gardenConfig.serverIp,
      serverDomain: this.gardenConfig.serverDomain,
      serverPort: this.gardenConfig.serverPort,
      networkType: this.gardenConfig.networkType,
      isSnake: this.gardenConfig.isSnake,
      email: this.userEmail
    };

    if (!isDexGarden) {
      requestBody.amount = requiredFee;
    }
    
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

    // Provider Plugin: MySQL/MariaDB (attach config to a deterministic providerId)
    if (this.dataProviderType === 'getdata' && !isDexGarden) {
      const providerId = this.getWizardProviderId();

      // Ensure a deterministic provider exists for plugin mode
      if (!requestBody.providers) requestBody.providers = [];
      const already = (requestBody.providers as any[]).some(p => p?.id === providerId);
      if (!already) {
        (requestBody.providers as any[]).push({
          id: providerId,
          name: `${this.gardenConfig.gardenName} Provider`,
          location: 'Unknown',
          bond: 1000,
          reputation: 5.0,
          apiEndpoint: 'eden:plugin:mysql'
        });
      }

      let fieldMap: any = undefined;
      if (this.mySqlFieldMapJson.trim()) {
        try { fieldMap = JSON.parse(this.mySqlFieldMapJson); } catch {}
      }
      const paramOrder = this.mySqlParamOrder
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      // Validate MySQL plugin fields before including in request
      if (!this.mySqlHost || !this.mySqlHost.trim()) {
        this.creationError = 'MySQL Host is required when plugin is enabled';
        this.isCreating = false;
        return;
      }
      if (!this.mySqlUser || !this.mySqlUser.trim()) {
        this.creationError = 'MySQL User is required when plugin is enabled';
        this.isCreating = false;
        return;
      }
      if (!this.mySqlPassword || !this.mySqlPassword.trim()) {
        this.creationError = 'MySQL Password is required when plugin is enabled';
        this.isCreating = false;
        return;
      }
      if (!this.mySqlDatabase || !this.mySqlDatabase.trim()) {
        this.creationError = 'MySQL Database is required when plugin is enabled';
        this.isCreating = false;
        return;
      }
      if (!this.mySqlSql || !this.mySqlSql.trim()) {
        this.creationError = 'MySQL SQL query is required when plugin is enabled';
        this.isCreating = false;
        return;
      }

      requestBody.providerPlugins = {
        mysql: [{
          providerId,
          serviceType: this.gardenConfig.serviceType,
          connection: {
            host: this.mySqlHost.trim(),
            port: this.mySqlPort || 3306,
            user: this.mySqlUser.trim(),
            password: this.mySqlPassword.trim(),
            database: this.mySqlDatabase.trim()
          },
          sql: this.mySqlSql.trim(),
          paramOrder,
          fieldMap,
          maxRows: 50
        }]
      };
    }

    // Provider webhook registration (optional)
    if (this.enableProviderWebhook) {
      const providerId = this.getWizardProviderId();
      requestBody.providerWebhooks = {
        [providerId]: this.getWizardProviderWebhookUrl()
      };
    }
    
    // Backward compatibility: Also include selectedProviders for movie (if no custom providers)
    if (this.gardenConfig.serviceType === 'movie' && providers.length === 0) {
      requestBody.selectedProviders = Array.isArray(this.gardenConfig.selectedProviders) 
        ? this.gardenConfig.selectedProviders 
        : [];
    }
    
    console.log('📤 Creating garden with providers:', providers);
    console.log('📤 Request body:', { ...requestBody, providers: providers.length });
    
    const createUrl = isDexGarden
      ? `${this.apiUrl}/api/dex-gardens/create`
      : `${this.apiUrl}/api/wizard/create-garden`;

    this.http.post<{success: boolean, garden?: any, balance?: number, error?: string}>(
      createUrl,
      requestBody
    ).subscribe({
      next: (response) => {
        if (response.success) {
          // Update wallet balance (SaaS only; DEX may not return balance)
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

    // Use timestamp-based unique ID instead of hardcoded -001
    const timestamp = Date.now();
    const providerId = `${this.newServiceTypeName}-${timestamp}`;
    const providerName = this.newServiceTypeName.charAt(0).toUpperCase() + this.newServiceTypeName.slice(1);

    this.http.post<{success: boolean, code?: any, redisKey?: string, error?: string}>(
      `${this.apiUrl}/api/notification-code/generate`,
      {
        providerId: providerId,
        providerName: providerName,
        language: 'typescript',
        framework: 'express',
        indexerEndpoint: `${this.apiUrl}`,
        webhookUrl: `${this.apiUrl}/api/provider-plugin/webhook/${providerId}`,
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

  getWizardProviderId(): string {
    const st = String(this.gardenConfig?.serviceType || '').trim();
    // Use timestamp-based unique ID instead of hardcoded -001
    const timestamp = Date.now();
    return st ? `${st}-${timestamp}` : `provider-${timestamp}`;
  }

  getWizardProviderWebhookUrl(): string {
    return `${this.apiUrl}/api/provider-plugin/webhook/${this.getWizardProviderId()}`;
  }

  testMySqlQuery(): void {
    // Validate required fields before sending
    if (!this.mySqlHost || !this.mySqlHost.trim()) {
      this.mySqlTestError = 'Host is required';
      return;
    }
    if (!this.mySqlUser || !this.mySqlUser.trim()) {
      this.mySqlTestError = 'User is required';
      return;
    }
    if (!this.mySqlPassword || !this.mySqlPassword.trim()) {
      this.mySqlTestError = 'Password is required';
      return;
    }
    if (!this.mySqlDatabase || !this.mySqlDatabase.trim()) {
      this.mySqlTestError = 'Database is required';
      return;
    }
    if (!this.mySqlSql || !this.mySqlSql.trim()) {
      this.mySqlTestError = 'SQL query is required';
      return;
    }

    this.isTestingMySql = true;
    this.mySqlTestError = null;
    this.mySqlTestResult = null;

    // Auto-detect LIMIT ? and OFFSET ? placeholders and provide default values
    const sql = this.mySqlSql.trim();
    const params: any[] = [];
    
    // Count all ? placeholders in the SQL
    const allPlaceholders = sql.match(/\?/g) || [];
    const placeholderCount = allPlaceholders.length;
    
    // Check for LIMIT ? and OFFSET ? patterns (case-insensitive)
    const sqlUpper = sql.toUpperCase();
    const hasLimitPlaceholder = /LIMIT\s+\?/i.test(sql);
    const hasOffsetPlaceholder = /OFFSET\s+\?/i.test(sql);
    
    // Find positions of LIMIT ? and OFFSET ?
    let limitIndex = -1;
    let offsetIndex = -1;
    if (hasLimitPlaceholder) {
      const limitMatch = sqlUpper.match(/LIMIT\s+\?/);
      if (limitMatch && limitMatch.index !== undefined) {
        // Count ? before LIMIT
        const beforeLimit = sql.substring(0, limitMatch.index);
        limitIndex = (beforeLimit.match(/\?/g) || []).length;
      }
    }
    if (hasOffsetPlaceholder) {
      const offsetMatch = sqlUpper.match(/OFFSET\s+\?/);
      if (offsetMatch && offsetMatch.index !== undefined) {
        // Count ? before OFFSET
        const beforeOffset = sql.substring(0, offsetMatch.index);
        offsetIndex = (beforeOffset.match(/\?/g) || []).length;
      }
    }
    
    // Fill params array: null for non-LIMIT/OFFSET placeholders, values for LIMIT/OFFSET
    for (let i = 0; i < placeholderCount; i++) {
      if (i === limitIndex) {
        params.push(30); // LIMIT value
      } else if (i === offsetIndex) {
        params.push(0);  // OFFSET value
      } else {
        params.push(null); // Other placeholders (will be filled by parameterization or ignored)
      }
    }

    const requestBody = {
      connection: {
        host: this.mySqlHost.trim(),
        port: this.mySqlPort || 3306,
        user: this.mySqlUser.trim(),
        password: this.mySqlPassword.trim(),
        database: this.mySqlDatabase.trim()
      },
      sql: sql,
      params: params,
      maxRows: 20
    };

    // Debug: log the request body to verify database is included
    console.log('🔍 [MySQL Test] Sending request:', { ...requestBody, connection: { ...requestBody.connection, password: '***' } });

    this.http.post<any>(`${this.apiUrl}/api/provider-plugin/mysql/test-query`, requestBody).subscribe({
      next: (res) => {
        this.mySqlTestResult = res;
        this.isTestingMySql = false;
      },
      error: (err) => {
        this.mySqlTestError = err?.error?.error || err?.message || 'MySQL test failed';
        this.isTestingMySql = false;
      }
    });
  }

  testGetDataWrapper(): void {
    // Validate required fields before sending
    if (!this.mySqlHost || !this.mySqlHost.trim()) {
      this.getDataTestError = 'Host is required';
      return;
    }
    if (!this.mySqlUser || !this.mySqlUser.trim()) {
      this.getDataTestError = 'User is required';
      return;
    }
    if (!this.mySqlPassword || !this.mySqlPassword.trim()) {
      this.getDataTestError = 'Password is required';
      return;
    }
    if (!this.mySqlDatabase || !this.mySqlDatabase.trim()) {
      this.getDataTestError = 'Database is required';
      return;
    }
    if (!this.mySqlSql || !this.mySqlSql.trim()) {
      this.getDataTestError = 'SQL query is required';
      return;
    }
    if (!this.getDataTestQuery || !this.getDataTestQuery.trim()) {
      this.getDataTestError = 'Test query is required';
      return;
    }

    this.isTestingGetData = true;
    this.getDataTestError = null;
    this.getDataTestResult = null;

    const requestBody = {
      connection: {
        host: this.mySqlHost.trim(),
        port: this.mySqlPort || 3306,
        user: this.mySqlUser.trim(),
        password: this.mySqlPassword.trim(),
        database: this.mySqlDatabase.trim()
      },
      sql: this.mySqlSql.trim(),
      userQuery: this.getDataTestQuery.trim(),
      serviceType: this.selectedServiceType?.type || 'autoparts',
      returnFields: this.mySqlReturnFields.trim() // comma-separated list of fields to include in final return
    };

    console.log('🔍 [getData Wrapper Test] Sending request:', { ...requestBody, connection: { ...requestBody.connection, password: '***' } });

    this.http.post<any>(`${this.apiUrl}/api/provider-plugin/mysql/test-getdata`, requestBody).subscribe({
      next: (res) => {
        this.getDataTestResult = res;
        this.isTestingGetData = false;
        console.log('✅ [getData Wrapper Test] Success:', res);
      },
      error: (err) => {
        this.getDataTestError = err.error?.error || err.message || 'Failed to test getData wrapper';
        this.isTestingGetData = false;
        console.error('❌ [getData Wrapper Test] Error:', err);
      }
    });
  }

  testProviderWebhook(): void {
    this.isTestingProviderWebhook = true;
    this.providerWebhookTestError = null;
    this.providerWebhookTestResult = null;

    const providerId = this.getWizardProviderId();
    const url = this.getWizardProviderWebhookUrl();
    this.http.post<any>(url, {
      event: 'wizard-test',
      providerId,
      timestamp: Date.now(),
      message: 'Hello from Garden Wizard'
    }).subscribe({
      next: (res) => {
        this.providerWebhookTestResult = res;
        this.isTestingProviderWebhook = false;
      },
      error: (err) => {
        this.providerWebhookTestError = err?.error?.error || err?.message || 'Webhook test failed';
        this.isTestingProviderWebhook = false;
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
    
    // Initialize with complete list of all available service types
    // This ensures all service types appear in the table even if server doesn't return them
    const allServiceTypes: Array<{serviceType: string, filename: string, exists: boolean, stepCount?: number}> = [
      { serviceType: 'movie', filename: 'movie.json', exists: false },
      { serviceType: 'amc', filename: 'amc.json', exists: false },
      { serviceType: 'autobodyshop', filename: 'autobodyshop.json', exists: false },
      { serviceType: 'autorepairshop', filename: 'autorepairshop.json', exists: false },
      { serviceType: 'bank', filename: 'bank.json', exists: false },
      { serviceType: 'church', filename: 'church.json', exists: false },
      { serviceType: 'court', filename: 'court.json', exists: false },
      { serviceType: 'dex', filename: 'dex.json', exists: false },
      { serviceType: 'dogpark', filename: 'dogpark.json', exists: false },
      { serviceType: 'gasstation', filename: 'gasstation.json', exists: false },
      { serviceType: 'grocerystore', filename: 'grocerystore.json', exists: false },
      { serviceType: 'gym', filename: 'gym.json', exists: false },
      { serviceType: 'hospital', filename: 'hospital.json', exists: false },
      { serviceType: 'hotel', filename: 'hotel.json', exists: false },
      { serviceType: 'jail', filename: 'jail.json', exists: false },
      { serviceType: 'laborcamp', filename: 'laborcamp.json', exists: false },
      { serviceType: 'library', filename: 'library.json', exists: false },
      { serviceType: 'pharmacy', filename: 'pharmacy.json', exists: false },
      { serviceType: 'policestation', filename: 'policestation.json', exists: false },
      { serviceType: 'postoffice', filename: 'postoffice.json', exists: false },
      { serviceType: 'priest', filename: 'priest.json', exists: false },
      { serviceType: 'restaurant', filename: 'restaurant.json', exists: false },
      { serviceType: 'school', filename: 'school.json', exists: false },
      { serviceType: 'university', filename: 'university.json', exists: false },
      { serviceType: 'airline', filename: 'airline.json', exists: false },
      { serviceType: 'autoparts', filename: 'autoparts.json', exists: false },
      { serviceType: 'party', filename: 'party.json', exists: false },
      { serviceType: 'snake', filename: 'snake.json', exists: false }
    ];
    
    // Set initial list (all marked as not existing)
    this.availableWorkflows = allServiceTypes;
    
    // Load existing workflows from server to update status
    this.http.get<{success: boolean, workflows: Array<{serviceType: string, filename: string, exists: boolean, stepCount?: number}>}>(`${this.apiUrl}/api/workflow/list`)
      .subscribe({
        next: (response) => {
          console.log('🔧 [Workflow Designer] Workflow list response:', response);
          if (response.success && response.workflows) {
            // Create a map of server workflows by serviceType
            const serverWorkflowsMap = new Map<string, {serviceType: string, filename: string, exists: boolean, stepCount?: number}>();
            response.workflows.forEach(w => {
              serverWorkflowsMap.set(w.serviceType, w);
            });
            
            // Update our complete list with server data (merge server status into our complete list)
            this.availableWorkflows = allServiceTypes.map(workflow => {
              const serverWorkflow = serverWorkflowsMap.get(workflow.serviceType);
              if (serverWorkflow) {
                // Use server data if available
                return {
                  ...workflow,
                  exists: serverWorkflow.exists,
                  stepCount: serverWorkflow.stepCount
                };
              }
              // Keep our default if not in server response
              return workflow;
            });
            
            console.log(`🔧 [Workflow Designer] Loaded ${this.availableWorkflows.length} workflows (merged with server data):`, this.availableWorkflows);
          } else {
            console.warn('🔧 [Workflow Designer] Server response not successful, using complete default list');
            // Keep the complete list we already set
          }
          
          // After workflows are loaded, populate service types from existing workflows
          this.loadServiceTypes();
        },
        error: (err) => {
          console.error('🔧 [Workflow Designer] Failed to load available workflows:', err);
          // Keep the complete list we already set
          // Still populate service types from what we have
          this.loadServiceTypes();
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

  getExistingWorkflows(): Array<{serviceType: string, filename: string, exists: boolean, stepCount?: number}> {
    return this.availableWorkflows.filter(w => w.exists === true);
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
