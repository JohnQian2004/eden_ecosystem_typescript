import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from './services/websocket.service';
import { ChatService } from './services/chat.service';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { CertificateDisplayComponent } from './components/certificate-display/certificate-display.component';
import { SystemConfigComponent } from './components/system-config/system-config.component';

export interface ServiceProvider {
  id: string;
  name: string;
  serviceType: string;
  location: string;
  bond: number;
  reputation: number;
  gardenId: string; // Use gardenId (preferred), indexerId kept for backward compatibility
  indexerId?: string; // Backward compatibility - prefer gardenId
  status: string;
  // Snake Service Fields
  // Note: Snake is a SERVICE TYPE (serviceType: "snake"), not a provider type
  // Each Snake service belongs to a garden (gardenId)
  insuranceFee?: number;
  iGasMultiplier?: number;
  iTaxMultiplier?: number;
  maxInfluence?: number;
  contextsAllowed?: string[];
  contextsForbidden?: string[];
  adCapabilities?: string[];
}

export interface SimulatorEvent {
  type: string;
  component: string;
  message: string;
  timestamp: number;
  data?: any;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Eden Simulator Dashboard';
  userInput: string = '';
  isProcessing: boolean = false;
  userEmail: string = ''; // Will be set from localStorage or default
  
  // Context sensing - tracks which service type is selected
  selectedServiceType: string | null = null;
  inputPlaceholder: string = 'Select a service type above or type your query...';
  
  // Service Types (Garden of Eden Main Street)
  serviceTypes: Array<{type: string, icon: string, adText: string, sampleQuery: string}> = [
    {
      type: 'movie',
      icon: '🎬',
      adText: 'Movie Tickets',
      sampleQuery: 'I want a sci-fi movie to watch tonight at the best price'
    },
    {
      type: 'dex',
      icon: '💰',
      adText: 'DEX Tokens',
      sampleQuery: 'I want to BUY 2 SOLANA token A at 1 Token/SOL or with best price'
    },
    {
      type: 'airline',
      icon: '✈️',
      adText: 'Airline Tickets',
      sampleQuery: 'I want to book a flight from New York to Los Angeles next week at the best price'
    },
    {
      type: 'autoparts',
      icon: '🔧',
      adText: 'Auto Parts',
      sampleQuery: 'I need brake pads for a 2006 Nissan Altima front bumper at the best price'
    },
    {
      type: 'hotel',
      icon: '🏨',
      adText: 'Hotel Booking',
      sampleQuery: 'I want to book a hotel in San Francisco for 3 nights at the best price'
    },
    {
      type: 'restaurant',
      icon: '🍽️',
      adText: 'Restaurant Reservations',
      sampleQuery: 'I want to make a dinner reservation for 2 people tonight at the best restaurant'
    }
  ];
  
  isLoadingServices: boolean = false;
  hasServiceIndexers: boolean = false; // Track if there are any service gardens (non-root)
  
  // Snake (Advertising) Service Providers
  snakeProviders: ServiceProvider[] = [];
  isLoadingSnakeProviders: boolean = false;
  
  // Stripe payment processing
  isProcessingStripe: boolean = false;
  isProcessingGarden: boolean = false;
  
  // Wallet balance
  walletBalance: number = 0;
  
  // Active tab for main content area
  activeTab: 'ledger' | 'certificates' | 'chat' | 'config' = 'chat';
  isLoadingBalance: boolean = false;
  isGoogleSignedIn: boolean = false;
  
  private apiUrl = window.location.port === '4200' 
    ? 'http://localhost:3000' 
    : '';

  @ViewChild(SidebarComponent) sidebarComponent!: SidebarComponent;
  @ViewChild(CertificateDisplayComponent) certificateComponent!: CertificateDisplayComponent;

  constructor(
    public wsService: WebSocketService,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {}

  ngOnInit() {
    // Suppress console errors from browser extensions
    const originalError = console.error;
    console.error = (...args: any[]) => {
      if (args[0] && typeof args[0] === 'string' && args[0].includes('solana')) {
        return; // Ignore Solana extension errors
      }
      originalError.apply(console, args);
    };

    // Check for Stripe success redirect
    const urlParams = new URLSearchParams(window.location.search);
    const jscSuccess = urlParams.get('jsc_success');
    const sessionId = urlParams.get('session_id');
    const jscCanceled = urlParams.get('jsc_canceled');
    
    const gardenSuccess = urlParams.get('indexer_success'); // Keep API param name for backward compatibility
    const gardenCanceled = urlParams.get('indexer_canceled'); // Keep API param name for backward compatibility
    
    if ((jscSuccess === 'true' || gardenSuccess === 'true') && sessionId) {
      console.log(`✅ Stripe payment successful! Session ID: ${sessionId}`);
      // Clear URL parameters to prevent re-triggering
      window.history.replaceState({}, document.title, window.location.pathname);
      // Clear any input that might trigger auto-submit
      this.userInput = '';
      this.selectedServiceType = null;
      this.inputPlaceholder = 'Select a service type above or type your query...';
      
      // Check session status and process payment/garden registration (fallback for local dev)
      this.checkStripeSession(sessionId, gardenSuccess === 'true');
    } else if (jscCanceled === 'true' || gardenCanceled === 'true') {
      console.log(`❌ Stripe payment canceled`);
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      // Clear any input
      this.userInput = '';
      this.selectedServiceType = null;
    }

    // Set default email first (before any async operations)
    this.userEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
    console.log(`📧 Initial email set: ${this.userEmail}`);
    
    // Load wallet balance immediately with default email
    // It will be refreshed if Google Sign-In updates the email
    this.loadWalletBalance();
    
    // Initialize Google Sign-In and get user email (may update email if Google Sign-In succeeds)
    // This is async and won't block balance loading
    this.initializeGoogleSignIn();
    
    this.wsService.connect();
    
    // Listen for service provider creation events to refresh service types
    this.wsService.events$.subscribe((event: SimulatorEvent) => {
      if (event.type === 'service_provider_created' || event.type === 'service_provider_registered') {
        console.log(`🔄 Service provider created/registered, refreshing service types...`);
        // Refresh services after a short delay to ensure backend has updated
        setTimeout(() => {
          this.loadServices();
        }, 500);
      }
    });
    
    // Load services from ROOT CA ServiceRegistry (Garden of Eden Main Street)
    this.loadServices();
    // Load Snake providers separately
    this.loadSnakeProviders();
    
    // Check for service gardens (non-root) - Main Street only shows if there are service gardens
    // Call after a short delay to ensure persistence is loaded on server
    setTimeout(() => {
      this.checkServiceGardens();
    }, 500);
  }
  
  checkServiceGardens() {
    // Check if there are any service gardens (non-root gardens)
    // Use /api/gardens endpoint (with fallback to /api/indexers for backward compatibility)
    this.http.get<{success: boolean, gardens?: Array<{id: string, name?: string, type?: string, active: boolean}>, indexers?: Array<{id: string, name?: string, type?: string, active: boolean}>}>(`${this.apiUrl}/api/gardens`)
      .subscribe({
        next: (response) => {
          // Support both 'gardens' and 'indexers' response fields for backward compatibility
          const gardens = response.gardens || response.indexers || [];
          if (response.success && gardens.length > 0) {
            // Check if there are any active non-root gardens (regular or token gardens)
            // A garden is a service garden if it's active and not a root garden
            const hasServices = gardens.some(i => 
              i.active && i.type !== 'root'
            );
            console.log(`🔍 [Main Street] Service gardens check: ${hasServices} (found ${gardens.length} total gardens: ${gardens.map(i => `${i.name || i.id}(${i.type || 'no-type'})`).join(', ')})`);
            this.hasServiceIndexers = hasServices;
            this.cdr.detectChanges();
          } else {
            console.log(`🔍 [Main Street] Service gardens check: false (no gardens in response)`);
            this.hasServiceIndexers = false;
            this.cdr.detectChanges();
          }
        },
        error: (err) => {
          console.error('Failed to check service gardens:', err);
          this.hasServiceIndexers = false;
          this.cdr.detectChanges();
        }
      });
  }
  
  initializeGoogleSignIn() {
    // Wait for Google Identity Services to load
    const checkGoogleAPI = () => {
      if (typeof (window as any).google !== 'undefined' && (window as any).google.accounts) {
        this.setupGoogleSignIn();
      } else {
        setTimeout(checkGoogleAPI, 100);
      }
    };
    
    // Check if already signed in from localStorage
    const savedEmail = localStorage.getItem('userEmail');
    const savedCredential = localStorage.getItem('googleCredential');
    
    if (savedEmail && savedCredential) {
      // Update email if different from default (set in ngOnInit)
      if (this.userEmail !== savedEmail) {
        this.userEmail = savedEmail;
        this.loadWalletBalance(); // Reload balance with Google email
      }
      this.isGoogleSignedIn = true;
    } else {
      // Email already set in ngOnInit, balance already loaded
      // Just wait for Google API to load for future sign-in
      checkGoogleAPI();
    }
  }
  
  setupGoogleSignIn() {
    try {
      // Only initialize if we have a valid client ID (not placeholder)
      const clientId = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
      if (clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
        console.log('⚠️ Google Client ID not configured, skipping Google Sign-In initialization');
        console.log('   To enable Google Sign-In, replace YOUR_GOOGLE_CLIENT_ID in app.component.ts with your actual Client ID');
        return;
      }
      
      (window as any).google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => {
          this.handleGoogleSignIn(response);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        // Opt-in to FedCM to avoid deprecation warnings
        use_fedcm_for_prompt: true
      });
      
      // Try to prompt sign-in automatically (FedCM-compatible)
      (window as any).google.accounts.id.prompt((notification: any) => {
        // FedCM-compatible: Check for new status types
        if (notification.isNotDisplayed()) {
          console.log('Google Sign-In prompt not displayed');
        } else if (notification.isSkippedMoment()) {
          console.log('Google Sign-In prompt skipped');
        } else if (notification.isDismissedMoment()) {
          console.log('Google Sign-In prompt dismissed');
        }
        // If prompt was shown but user didn't sign in, continue with default email
      });
    } catch (err) {
      console.warn('Google Sign-In not available, using default email:', err);
    }
  }
  
  handleGoogleSignIn(response: any) {
    try {
      // Decode the credential (JWT)
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      const email = payload.email;
      
      if (email) {
        this.userEmail = email;
        this.isGoogleSignedIn = true;
        localStorage.setItem('userEmail', email);
        localStorage.setItem('googleCredential', response.credential);
        console.log(`✅ Google Sign-In successful: ${email}`);
        this.loadWalletBalance();
      }
    } catch (err) {
      console.error('Error processing Google Sign-In:', err);
    }
  }
  
  refreshGardens() {
    // Refresh gardens in sidebar and certificate components
    // Use setTimeout to ensure ViewChild is initialized
    setTimeout(() => {
      if (this.sidebarComponent) {
        this.sidebarComponent.fetchGardens();
        this.sidebarComponent.fetchServiceProviders();
      }
      if (this.certificateComponent) {
        this.certificateComponent.fetchGardens();
      }
      // Also refresh service gardens check for Main Street
      this.checkServiceGardens();
      console.log('🔄 Gardens refreshed after wallet reset');
    }, 100);
    
    // Also trigger via localStorage as fallback
    localStorage.setItem('edenRefreshGardens', Date.now().toString());
    setTimeout(() => localStorage.removeItem('edenRefreshGardens'), 100);
  }

  loadWalletBalance() {
    // Ensure email is set before loading balance
    if (!this.userEmail) {
      this.userEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
      console.log(`📧 Email was empty, set to: ${this.userEmail}`);
    }
    
    if (!this.userEmail || !this.userEmail.includes('@')) {
      console.warn('No valid email, skipping balance load. Current email:', this.userEmail);
      return;
    }
    
    this.isLoadingBalance = true;
    console.log(`💰 Loading wallet balance for: ${this.userEmail}`);
    
    this.http.get<{success: boolean, balance: number, error?: string}>(
      `${this.apiUrl}/api/jsc/balance/${encodeURIComponent(this.userEmail)}`
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.walletBalance = response.balance || 0;
          console.log(`✅ Wallet balance loaded: ${this.walletBalance} JSC for ${this.userEmail}`);
        } else {
          console.error('❌ Failed to load balance:', response.error);
          this.walletBalance = 0;
        }
        this.isLoadingBalance = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('❌ Error loading wallet balance:', err);
        console.error('   URL:', `${this.apiUrl}/api/jsc/balance/${encodeURIComponent(this.userEmail)}`);
        this.walletBalance = 0;
        this.isLoadingBalance = false;
        this.cdr.detectChanges();
      }
    });
  }
  
  loadServices() {
    // Query ROOT CA ServiceRegistry to verify service types are available
    // This is a quick in-memory lookup - no LLM needed
    // Only show service types that are actually registered in the ServiceRegistry
    this.isLoadingServices = true;
    
    // First, load gardens to validate gardenId
    this.http.get<{success: boolean, gardens?: Array<{id: string, name?: string, type?: string, active: boolean}>, indexers?: Array<{id: string, name?: string, type?: string, active: boolean}>}>(`${this.apiUrl}/api/gardens`)
      .subscribe({
        next: (gardensResponse) => {
          // Support both 'gardens' and 'indexers' response fields for backward compatibility
          const gardens = gardensResponse.gardens || gardensResponse.indexers || [];
          const validGardenIds = new Set<string>(['HG']); // HG is always valid (infrastructure)
          gardens.forEach(g => {
            if (g.active && g.id) {
              validGardenIds.add(g.id);
            }
          });
          
          console.log(`🔍 [Main Street] Valid garden IDs: ${Array.from(validGardenIds).join(', ')}`);
          
          // Now load service registry
          this.http.get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry`)
            .subscribe({
              next: (response) => {
                if (response.success && response.providers) {
                  // CRITICAL: Filter out infrastructure services (payment-rail, settlement, registry, webserver, websocket, wallet)
                  // These belong to Holy Ghost (HG) and should NOT appear in Main Street
                  // Main Street should only show service types that have providers belonging to NON-ROOT gardens
                  const infrastructureServiceTypes = new Set(['payment-rail', 'settlement', 'registry', 'webserver', 'websocket', 'wallet']);
                  
                  // CRITICAL: Only include providers whose gardenId exists in the loaded gardens
                  // This ensures we don't show providers assigned to non-existent gardens
                  const nonInfrastructureProviders = response.providers.filter(p => {
                    // Check if provider has a valid gardenId
                    const providerGardenId = p.gardenId || p.indexerId; // Support both for backward compatibility
                    const hasValidGardenId = providerGardenId && validGardenIds.has(providerGardenId);
                    if (!hasValidGardenId && providerGardenId) {
                      console.warn(`⚠️  [Main Street] Filtering out provider ${p.name} (${p.id}): gardenId "${providerGardenId}" does not exist in loaded gardens`);
                    }
                    return p.status === 'active' && 
                           !infrastructureServiceTypes.has(p.serviceType) &&
                           providerGardenId !== 'HG' && // Exclude Holy Ghost providers
                           hasValidGardenId; // CRITICAL: Only include if gardenId is valid
                  });
                  
                  // Create Set of unique service types from non-infrastructure providers
                  const availableTypes = new Set(nonInfrastructureProviders.map(p => p.serviceType));
            
                  // CRITICAL: Reset serviceTypes to the full hardcoded list before filtering
                  // This ensures we don't lose service types that were filtered out previously
                  const allServiceTypes: Array<{type: string, icon: string, adText: string, sampleQuery: string}> = [
              {
                type: 'movie',
                icon: '🎬',
                adText: 'Movie Tickets',
                sampleQuery: 'I want a sci-fi movie to watch tonight at the best price'
              },
              {
                type: 'dex',
                icon: '💰',
                adText: 'DEX Tokens',
                sampleQuery: 'I want to BUY 2 SOLANA token A at 1 Token/SOL or with best price'
              },
              {
                type: 'airline',
                icon: '✈️',
                adText: 'Airline Tickets',
                sampleQuery: 'I want to book a flight from New York to Los Angeles next week at the best price'
              },
              {
                type: 'autoparts',
                icon: '🔧',
                adText: 'Auto Parts',
                sampleQuery: 'I need brake pads for a 2006 Nissan Altima front bumper at the best price'
              },
              {
                type: 'hotel',
                icon: '🏨',
                adText: 'Hotel Booking',
                sampleQuery: 'I want to book a hotel in San Francisco for 3 nights at the best price'
              },
              {
                type: 'restaurant',
                icon: '🍽️',
                adText: 'Restaurant Reservations',
                sampleQuery: 'I want to make a dinner reservation for 2 people tonight at the best restaurant'
              }
                  ];
                  
                  // Only show service types that are actually available in the ServiceRegistry
                  const filteredServiceTypes = allServiceTypes.filter(st => 
                    availableTypes.has(st.type)
                  );
                  
                  // CRITICAL: Deduplicate by service type to prevent duplicates
                  // This prevents duplicates from race conditions or multiple rapid calls
                  const serviceTypeMap = new Map<string, {type: string, icon: string, adText: string, sampleQuery: string}>();
                  for (const st of filteredServiceTypes) {
                    if (!serviceTypeMap.has(st.type)) {
                      serviceTypeMap.set(st.type, st);
                    }
                  }
                  this.serviceTypes = Array.from(serviceTypeMap.values());
                  
                  // Log if duplicates were found
                  if (filteredServiceTypes.length !== this.serviceTypes.length) {
                    console.warn(`⚠️  [Main Street] Removed ${filteredServiceTypes.length - this.serviceTypes.length} duplicate service type(s)`);
                  }
                  
                  console.log(`✅ Loaded service types: ${this.serviceTypes.map(st => `${st.type} (${st.adText})`).join(', ')}`);
                  console.log(`   Available types in registry (non-infrastructure, non-HG, valid gardenId): ${Array.from(availableTypes).join(', ')}`);
                  console.log(`   Providers by type:`, Array.from(availableTypes).map(type => {
                    const providers = nonInfrastructureProviders.filter(p => p.serviceType === type);
                    return `${type}: ${providers.length} provider(s) [${providers.map(p => `${p.name} (${p.gardenId || p.indexerId})`).join(', ')}]`;
                  }).join(', '));
                } else {
                  // If no providers, clear service types
                  this.serviceTypes = [];
                }
                this.isLoadingServices = false;
                // Refresh service gardens check in case gardens were created
                this.checkServiceGardens();
                this.cdr.detectChanges();
              },
              error: (err) => {
                console.error('Failed to load services:', err);
                // If API fails, don't show any service types
                this.serviceTypes = [];
                this.isLoadingServices = false;
                this.cdr.detectChanges();
              }
            });
        },
        error: (err) => {
          console.error('Failed to load gardens for validation:', err);
          // If gardens API fails, still try to load services but without validation
          this.http.get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry`)
            .subscribe({
              next: (response) => {
                // Fallback: use original logic without gardenId validation
                if (response.success && response.providers) {
                  const infrastructureServiceTypes = new Set(['payment-rail', 'settlement', 'registry', 'webserver', 'websocket', 'wallet']);
                  const nonInfrastructureProviders = response.providers.filter(p => 
                    p.status === 'active' && 
                    !infrastructureServiceTypes.has(p.serviceType) &&
                    (p.gardenId || p.indexerId) !== 'HG'
                  );
                  const availableTypes = new Set(nonInfrastructureProviders.map(p => p.serviceType));
                  // Use existing service types logic
                  this.serviceTypes = this.serviceTypes.filter(st => availableTypes.has(st.type));
                } else {
                  this.serviceTypes = [];
                }
                this.isLoadingServices = false;
                this.cdr.detectChanges();
              },
              error: (err2) => {
                console.error('Failed to load services:', err2);
                this.serviceTypes = [];
                this.isLoadingServices = false;
                this.cdr.detectChanges();
              }
            });
        }
      });
  }
  
  loadSnakeProviders() {
    // Query ROOT CA ServiceRegistry for Snake services
    // Snake is a service type (serviceType: "snake"), each belongs to a garden
    this.isLoadingSnakeProviders = true;
    this.http.get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry?serviceType=snake`)
      .subscribe({
        next: (response) => {
          if (response.success && response.providers) {
            this.snakeProviders = response.providers.filter(p => p.status === 'active');
            console.log(`🐍 Loaded ${this.snakeProviders.length} Snake services:`, this.snakeProviders.map(p => `${p.name} (garden: ${p.gardenId || p.indexerId})`).join(', '));
          }
          this.isLoadingSnakeProviders = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to load Snake services:', err);
          this.snakeProviders = [];
          this.isLoadingSnakeProviders = false;
          this.cdr.detectChanges();
        }
      });
  }
  
  checkStripeSession(sessionId: string, isGardenPurchase: boolean = false) {
    console.log(`🔍 Checking Stripe session status: ${sessionId} (garden purchase: ${isGardenPurchase})`);
    this.http.get<{success: boolean, minted?: boolean, alreadyMinted?: boolean, registered?: boolean, alreadyRegistered?: boolean, amount?: number, balance?: number, paymentStatus?: string, indexerId?: string, indexerName?: string, error?: string}>(
      `${this.apiUrl}/api/jsc/check-session/${sessionId}`
    ).subscribe({
      next: (response) => {
        if (response.success) {
          if (response.alreadyMinted) {
            console.log(`✅ JSC already minted for this session. Balance: ${response.balance} JSC`);
            this.walletBalance = response.balance || 0;
            alert(`✅ Payment confirmed! Your balance: ${response.balance} JSC`);
          } else if (response.minted) {
            console.log(`✅ JSC minted successfully! Amount: ${response.amount} JSC, Balance: ${response.balance} JSC`);
            this.walletBalance = response.balance || 0;
            alert(`✅ ${response.amount} JSC deposited successfully! Your balance: ${response.balance} JSC`);
          } else if (response.registered || response.alreadyRegistered) {
            console.log(`✅ Garden registered: ${response.indexerId || response.indexerName}`);
            this.walletBalance = response.balance || 0;
            this.isProcessingGarden = false;
            alert(`✅ Movie garden installed successfully!\nGarden: ${response.indexerId || response.indexerName}\nBalance: ${response.balance} JSC`);
            // Refresh garden list (sidebar will auto-update via WebSocket)
          } else {
            console.log(`⏳ Payment not completed yet. Status: ${response.paymentStatus}`);
            alert(`⏳ Payment processing... Please wait a moment and refresh.`);
          }
          this.isProcessingStripe = false;
          this.cdr.detectChanges();
        } else {
          console.error(`❌ Failed to check session:`, response.error);
          alert(`⚠️ Could not verify payment status: ${response.error || 'Unknown error'}`);
        }
      },
      error: (err) => {
        console.error('❌ Error checking Stripe session:', err);
        alert(`⚠️ Error checking payment status: ${err.error?.error || err.message || 'Unknown error'}`);
      }
    });
  }
  
  buyJesusCoin(amount: number) {
    if (!this.userEmail || !this.userEmail.includes('@')) {
      alert('Please set a valid email address first');
      return;
    }
    
    this.isProcessingStripe = true;
    
    // Create Stripe Checkout session
    this.http.post<{success: boolean, sessionId?: string, url?: string, error?: string}>(
      `${this.apiUrl}/api/jsc/buy`,
      { email: this.userEmail, amount: amount }
    ).subscribe({
      next: (response) => {
        if (response.success && response.url) {
          // Redirect to Stripe Checkout
          window.location.href = response.url;
        } else {
          alert(`Failed to create Stripe checkout: ${response.error || 'Unknown error'}`);
          this.isProcessingStripe = false;
        }
      },
      error: (err) => {
        console.error('Error creating Stripe checkout:', err);
        alert(`Error: ${err.error?.error || err.message || 'Failed to create Stripe checkout'}`);
        this.isProcessingStripe = false;
      }
    });
  }
  
  buyMovieIndexer(amount: number) {
    if (!this.userEmail || !this.userEmail.includes('@')) {
      alert('Please set a valid email address first');
      return;
    }
    
    this.isProcessingGarden = true;
    
    // First check wallet balance
    if (this.walletBalance >= amount) {
      // User has enough balance - purchase directly from wallet
      console.log(`💰 Purchasing garden from wallet balance: ${this.walletBalance} JSC`);
      this.http.post<{success: boolean, indexerId?: string, indexerName?: string, balance?: number, error?: string}>(
        `${this.apiUrl}/api/indexer/purchase`,
        { email: this.userEmail, amount: amount, indexerType: 'movie' }
      ).subscribe({
        next: (response) => {
          if (response.success) {
            console.log(`✅ Garden purchased from wallet: ${response.indexerId || response.indexerName}`);
            this.walletBalance = response.balance || this.walletBalance - amount;
            this.isProcessingGarden = false;
            alert(`✅ Movie garden installed successfully!\nGarden: ${response.indexerId || response.indexerName}\nRemaining balance: ${response.balance} JSC`);
            this.cdr.detectChanges();
          } else {
            alert(`Failed to purchase garden: ${response.error || 'Unknown error'}`);
            this.isProcessingGarden = false;
          }
        },
        error: (err) => {
          console.error('Error purchasing garden from wallet:', err);
          alert(`Error: ${err.error?.error || err.message || 'Failed to purchase garden'}`);
          this.isProcessingGarden = false;
        }
      });
    } else {
      // Insufficient balance - redirect to Stripe Checkout
      console.log(`💳 Insufficient balance (${this.walletBalance} JSC). Redirecting to Stripe...`);
      this.http.post<{success: boolean, sessionId?: string, url?: string, error?: string}>(
        `${this.apiUrl}/api/indexer/buy`,
        { email: this.userEmail, amount: amount, indexerType: 'movie' }
      ).subscribe({
        next: (response) => {
          if (response.success && response.url) {
            // Redirect to Stripe Checkout
            window.location.href = response.url;
          } else {
            alert(`Failed to create Stripe checkout: ${response.error || 'Unknown error'}`);
            this.isProcessingGarden = false;
          }
        },
        error: (err) => {
          console.error('Error creating Stripe checkout for garden:', err);
          alert(`Error: ${err.error?.error || err.message || 'Failed to create Stripe checkout'}`);
          this.isProcessingGarden = false;
        }
      });
    }
  }
  
  selectServiceType(serviceType: {type: string, icon: string, adText: string, sampleQuery: string}) {
    // Set context and populate input with sample query
    this.selectedServiceType = serviceType.type;
    this.userInput = serviceType.sampleQuery;
    
    // Update placeholder based on service type
    this.inputPlaceholder = serviceType.sampleQuery;
    
    // Focus on the unified input
    setTimeout(() => {
      const input = document.querySelector('input[name="userInput"]') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  }
  
  // Context sensing - detect service type from user input
  detectServiceType(input: string): string | null {
    const lowerInput = input.toLowerCase();
    
    // DEX indicators
    if (lowerInput.includes('buy') || lowerInput.includes('sell') || 
        lowerInput.includes('token') || lowerInput.includes('dex') ||
        lowerInput.includes('solana') || lowerInput.includes('sol') ||
        lowerInput.includes('pool') || lowerInput.includes('trade')) {
      return 'dex';
    }
    
    // Movie indicators
    if (lowerInput.includes('movie') || lowerInput.includes('film') ||
        lowerInput.includes('watch') || lowerInput.includes('cinema') ||
        lowerInput.includes('theatre') || lowerInput.includes('ticket')) {
      return 'movie';
    }
    
    // Airline indicators
    if (lowerInput.includes('flight') || lowerInput.includes('airline') ||
        lowerInput.includes('airport') || lowerInput.includes('fly')) {
      return 'airline';
    }
    
    // Auto parts indicators
    if (lowerInput.includes('auto') || lowerInput.includes('car') ||
        lowerInput.includes('brake') || lowerInput.includes('parts') ||
        lowerInput.includes('tire') || lowerInput.includes('engine')) {
      return 'autoparts';
    }
    
    // Hotel indicators
    if (lowerInput.includes('hotel') || lowerInput.includes('lodging') ||
        lowerInput.includes('accommodation') || lowerInput.includes('stay')) {
      return 'hotel';
    }
    
    // Restaurant indicators
    if (lowerInput.includes('restaurant') || lowerInput.includes('dining') ||
        lowerInput.includes('dinner') || lowerInput.includes('lunch') ||
        lowerInput.includes('reservation') || lowerInput.includes('food')) {
      return 'restaurant';
    }
    
    return null;
  }

  ngOnDestroy() {
    this.wsService.disconnect();
  }

  async onSubmit() {
    if (!this.userInput.trim() || this.isProcessing) {
      console.log('⚠️ Submit blocked:', { 
        hasInput: !!this.userInput.trim(), 
        isProcessing: this.isProcessing 
      });
      return;
    }

    // Context sensing - detect service type if not already set
    if (!this.selectedServiceType) {
      this.selectedServiceType = this.detectServiceType(this.userInput);
      console.log(`🔍 Detected service type from input: ${this.selectedServiceType || 'unknown'}`);
    }

    console.log('📤 Submitting chat message:', this.userInput);
    console.log(`📋 Context: Service Type = ${this.selectedServiceType || 'auto-detected'}`);
    
    this.isProcessing = true;
    const input = this.userInput.trim();
    this.userInput = ''; // Clear input after submission
    this.selectedServiceType = null; // Reset context
    this.inputPlaceholder = 'Select a service type above or type your query...';
    
    // Force change detection to update UI
    this.cdr.detectChanges();

    // Set a safety timeout to ensure isProcessing is always reset
    const safetyTimeout = setTimeout(() => {
      if (this.isProcessing) {
        console.warn('⚠️ Safety timeout: Resetting isProcessing flag');
        this.isProcessing = false;
        this.cdr.detectChanges();
      }
    }, 180000); // 3 minutes safety timeout

    try {
      const response = await this.chatService.sendMessageAsync(input, this.userEmail);
      console.log('✅ Chat message sent successfully:', response);
    } catch (error: any) {
      console.error('❌ Error caught in onSubmit:', error);
      // Ignore Solana extension errors
      if (error && !error.message?.includes('solana') && !error.message?.includes('Solana')) {
        const errorMsg = error.error?.error || error.message || 'Failed to send message. Please try again.';
        console.error('Error details:', { 
          error, 
          errorType: error?.constructor?.name,
          errorMessage: error?.message,
          errorStatus: error?.status
        });
        alert(`Error: ${errorMsg}`);
        // Restore input so user can retry
        this.userInput = input;
      } else {
        // Even for Solana errors, log and continue
        console.log('⚠️ Solana extension error ignored');
      }
    } finally {
      // Clear safety timeout
      clearTimeout(safetyTimeout);
      
      // Always reset processing state to allow next request
      console.log('🔄 Entering finally block, resetting isProcessing...');
      this.isProcessing = false;
      console.log('✅ Reset isProcessing flag, ready for next request');
      
      // Force change detection to update UI immediately
      this.cdr.detectChanges();
      
      // Double-check that isProcessing is false after a brief delay
      setTimeout(() => {
        if (this.isProcessing) {
          console.error('❌ CRITICAL: isProcessing still true after reset! Forcing reset...');
          this.isProcessing = false;
          this.cdr.detectChanges();
        } else {
          console.log('✅ Verified: isProcessing is false');
        }
      }, 100);
    }
  }

}

