import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from './services/websocket.service';
import { ChatService } from './services/chat.service';
import { FlowWiseService, UserDecisionRequest } from './services/flowwise.service';
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
  showSignInModal: boolean = false; // Control modal visibility
  showStripePaymentModal: boolean = false; // Control Stripe Payment Rail modal visibility
  checkBalanceAfterSignIn: boolean = false; // Flag to check balance after sign-in
  signInEmail: string = ''; // Email for sign-in form
  signInPassword: string = 'Qweasdzxc1!'; // Password for sign-in form
  isSigningIn: boolean = false; // Loading state for email/password sign-in
  selectedAdminMode: 'god' | 'priest' = 'god'; // Admin mode selection (GOD or Priest) - selected BEFORE login
  selectedMode: 'god' | 'priest' | 'user' = 'user'; // Mode selection before login (can be GOD, Priest, or USER)
  showModeSelection: boolean = true; // Show mode selection before login
  showLoginForm: boolean = false; // Show login form after mode selection
  
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
  activeTab: 'workflow' | 'workflow-chat' | 'ledger' | 'ledger-cards' | 'certificates' | 'chat' | 'config' = 'workflow';
  isLoadingBalance: boolean = false;
  isGoogleSignedIn: boolean = false;
  
  // Helper getter to check if user is actually signed in (has saved email in localStorage)
  get isUserSignedIn(): boolean {
    const savedEmail = localStorage.getItem('userEmail');
    return !!savedEmail && savedEmail.trim() !== '';
  }
  
  // Admin email constant
  readonly adminEmail = 'bill.draper.auto@gmail.com';
  
  // FlowWise decision prompt
  pendingDecision: UserDecisionRequest | null = null;
  showDecisionPrompt: boolean = false;
  
  // Garden shutdown dialog
  showGardenShutdownDialog: boolean = false;
  priestGardens: Array<{
    id: string;
    name: string;
    active: boolean;
    uuid: string;
    serviceType?: string;
    hasCertificate: boolean;
  }> = [];
  isLoadingGardens: boolean = false;
  isShuttingDown: boolean = false;
  shutdownReason: string = '';
  selectedGardenForShutdown: string | null = null;
  
  // Priesthood Certification
  priesthoodStatus: 'pending' | 'approved' | 'rejected' | 'revoked' | 'suspended' | null = null;
  hasPriesthoodCert: boolean = false;
  showPriesthoodApplicationModal: boolean = false;
  priesthoodApplicationReason: string = '';
  isSubmittingApplication: boolean = false;
  priesthoodCertification: any = null; // Store full certification details including billing info
  
  // GOD Mode: Priesthood Management
  showPriesthoodManagementPanel: boolean = false;
  priesthoodApplications: any[] = [];
  isLoadingApplications: boolean = false;
  priesthoodStats: any = null;
  
  private apiUrl = window.location.port === '4200' 
    ? 'http://localhost:3000' 
    : '';

  @ViewChild(SidebarComponent) sidebarComponent!: SidebarComponent;
  @ViewChild(CertificateDisplayComponent) certificateComponent!: CertificateDisplayComponent;
  
  showSidebar: boolean = true; // Control sidebar visibility (hidden in USER and PRIEST modes)

  // Track current view mode (updated when mode changes)
  _currentViewMode: 'god' | 'priest' | 'user' = 'user';
  
  // Get current view mode from localStorage
  get currentViewMode(): 'god' | 'priest' | 'user' {
    const mode = (localStorage.getItem('edenViewMode') as 'god' | 'priest' | 'user') || 'user';
    // Update tracked value if it changed
    if (this._currentViewMode !== mode) {
      this._currentViewMode = mode;
    }
    return mode;
  }
  
  // Helper method to set view mode and trigger change detection
  setViewMode(mode: 'god' | 'priest' | 'user'): void {
    localStorage.setItem('edenViewMode', mode);
    this._currentViewMode = mode;
    this.cdr.detectChanges();
  }

  // Check if we're in user mode (non-admin)
  get isUserMode(): boolean {
    return this.userEmail !== this.adminEmail;
  }

  // Check if sidebar should be shown (only in GOD mode)
  get shouldShowSidebar(): boolean {
    // Sidebar is only shown in GOD mode
    // Hidden in both PRIEST and USER modes
    return this.currentViewMode === 'god' && this.userEmail === this.adminEmail;
  }

  // Ensure active tab is visible in current mode
  ensureValidTab(): void {
    if (this.isUserMode) {
      // In user mode, only 'workflow-chat', 'ledger', and 'ledger-cards' are visible
      const visibleTabs: Array<'workflow-chat' | 'ledger' | 'ledger-cards'> = ['workflow-chat', 'ledger', 'ledger-cards'];
      if (!visibleTabs.includes(this.activeTab as any)) {
        // Switch to first visible tab
        this.activeTab = 'workflow-chat';
        console.log(`🔄 [App] Switched to visible tab: ${this.activeTab} (user mode)`);
      }
    }
  }

  // Apply admin mode selection (GOD or Priest)
  applyAdminMode(): void {
    if (this.userEmail === this.adminEmail) {
      localStorage.setItem('edenViewMode', this.selectedAdminMode);
      console.log(`⛪ [App] Admin mode applied: ${this.selectedAdminMode}`);
      // Update sidebar visibility based on mode
      this.updateSidebarVisibility();
      if (this.sidebarComponent) {
        this.sidebarComponent.setViewMode(this.selectedAdminMode);
      }
    }
  }

  // Update sidebar visibility based on view mode
  updateSidebarVisibility(): void {
    // Sidebar is only shown in GOD mode
    // Hidden in both PRIEST and USER modes
    const viewMode = this.currentViewMode;
    this.showSidebar = viewMode === 'god' && this.userEmail === this.adminEmail;
    console.log(`📊 [App] Sidebar visibility updated: ${this.showSidebar} (mode: ${viewMode}, email: ${this.userEmail})`);
  }

  // Change admin mode (called from UI)
  changeAdminMode(mode: 'god' | 'priest'): void {
    if (this.userEmail === this.adminEmail) {
      this.selectedAdminMode = mode;
      this.applyAdminMode();
      this.cdr.detectChanges();
    }
  }

  // Proceed to login after mode selection
  proceedToLogin(): void {
    console.log(`🔐 [Login] Mode selected: ${this.selectedMode}, proceeding to login`);
    
    // For PRIEST mode, check if user has certification (will be validated after login)
    // Note: We can't check certification before login, so we'll validate after sign-in
    if (this.selectedMode === 'priest') {
      console.log(`🛐 [Login] PRIEST mode selected - certification will be validated after login`);
    }
    
    this.showModeSelection = false;
    this.showLoginForm = true;
    // Store selected mode temporarily (will be validated after login)
    localStorage.setItem('pendingViewMode', this.selectedMode);
    // If GOD or Priest selected, also update selectedAdminMode
    if (this.selectedMode === 'god' || this.selectedMode === 'priest') {
      this.selectedAdminMode = this.selectedMode;
    }
    this.cdr.detectChanges();
    // Render Google Sign-In button now that login form is shown (after change detection)
    setTimeout(() => {
      this.renderGoogleSignInButton();
    }, 200);
  }

  // Go back to mode selection
  goBackToModeSelection(): void {
    this.showModeSelection = true;
    this.showLoginForm = false;
    this.cdr.detectChanges();
  }

  // Reset login flow
  resetLoginFlow(): void {
    this.showModeSelection = true;
    this.showLoginForm = false;
    this.signInEmail = 'bill.draper.auto@gmail.com'; // Hardcoded email
    this.signInPassword = 'Qweasdzxc1!'; // Hardcoded password
    this.selectedMode = 'user'; // Reset to default
    localStorage.removeItem('pendingViewMode');
  }

  // Render Google Sign-In button when login form is shown
  renderGoogleSignInButton(): void {
    if (this.showLoginForm && !this.isGoogleSignedIn && typeof (window as any).google !== 'undefined' && (window as any).google.accounts) {
      const signInButtonElement = document.getElementById('google-signin-button-modal');
      if (signInButtonElement) {
        signInButtonElement.innerHTML = '';
        (window as any).google.accounts.id.renderButton(
          signInButtonElement,
          {
            type: 'standard',
            theme: 'filled_blue',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: 250
          }
        );
      }
    }
  }

  constructor(
    public wsService: WebSocketService,
    private chatService: ChatService,
    private flowWiseService: FlowWiseService,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {}

  // AMC Workflow Integration
  amcWorkflowActive: boolean = false;
  workflowMessages: any[] = [];

  ngOnInit() {
    // Subscribe to FlowWise decision requests
    this.flowWiseService.getDecisionRequests().subscribe((decisionRequest: UserDecisionRequest) => {
      console.log('🤔 [FlowWise] Decision required:', decisionRequest);
      this.pendingDecision = decisionRequest;
      this.showDecisionPrompt = true;
      this.cdr.detectChanges();
    });

    // Subscribe to WebSocket events for workflow updates
    this.wsService.events$.subscribe((event: SimulatorEvent) => {
      console.log(`📨 [App] Received event: ${event.type}`, event);

      if (this.amcWorkflowActive) {
        this.workflowMessages.push(event);
        this.cdr.detectChanges();
      }
    });
    
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
    const savedEmail = localStorage.getItem('userEmail');
    const savedCredential = localStorage.getItem('googleCredential');
    // Only set userEmail if there's a saved email (user is signed in)
    // If no saved email, leave it empty for non-user binding state
    this.userEmail = savedEmail || '';
    // User is signed in if they have a saved email (either Google or email/password)
    // isGoogleSignedIn specifically tracks Google sign-in, but we should check for any saved email
    this.isGoogleSignedIn = !!(savedEmail && savedCredential);
    const isSignedIn = !!savedEmail; // User is signed in if they have a saved email
    
    // Set sidebar visibility: only show in GOD mode (hide in PRIEST and USER modes)
    this.updateSidebarVisibility();
    console.log(`📧 Initial email set: ${this.userEmail}, isGoogleSignedIn: ${this.isGoogleSignedIn}, isSignedIn: ${isSignedIn}`);
    
    // Update title to include email
    this.updateTitle();
    
    // Open sign-in modal on page load ONLY if not signed in (no saved email)
    // Don't show modal if user has already signed in (has saved email)
    if (!isSignedIn) {
      setTimeout(() => {
        this.openSignInModal();
      }, 1000); // Delay to ensure page is fully loaded
    } else {
      console.log(`✅ [App] User already signed in (${savedEmail}), skipping sign-in modal`);
    }
    
    // Set sidebar visibility: only show in GOD mode (hide in PRIEST and USER modes)
    this.updateSidebarVisibility();
    
    // Set view mode based on email: 
    // - Non-admin users: Check priesthood certification first, then set mode
    // - Admin users: Use saved mode or prompt for selection
    if (this.userEmail !== this.adminEmail) {
      console.log(`👤 [App] Non-admin user detected (${this.userEmail})`);
      // Check for saved mode first (might be PRIEST if they have certification)
      const savedMode = localStorage.getItem('edenViewMode');
      
      // Check priesthood certification FIRST - this will automatically set PRIEST mode if certified
      this.checkPriesthoodStatus();
      
      // Wait for certification check to complete, then set mode appropriately
      setTimeout(() => {
        if (this.hasPriesthoodCert) {
          // User has certification - always use PRIEST mode
          console.log(`🛐 [App] Non-admin user has priesthood certification, setting PRIEST mode`);
          this.setViewMode('priest');
        } else if (savedMode === 'priest') {
          // User was in PRIEST mode but doesn't have certification - switch to USER
          console.log(`⚠️  [App] Non-admin user was in PRIEST mode but doesn't have certification, switching to USER mode`);
          this.setViewMode('user');
        } else {
          // No certification and not in PRIEST mode - use USER mode
          console.log(`👤 [App] Non-admin user doesn't have certification, using USER mode`);
          this.setViewMode('user');
        }
        // Ensure active tab is visible
        this.ensureValidTab();
        this.updateSidebarVisibility();
      }, 600);
    } else {
      // Admin: Check for saved mode, if none exists, will prompt for selection
      const savedMode = localStorage.getItem('edenViewMode');
      if (savedMode === 'god' || savedMode === 'priest') {
        this.selectedAdminMode = savedMode;
        console.log(`⛪ [App] Admin user mode restored: ${savedMode}`);
      } else if (savedMode === 'user') {
        // Admin should never be in USER mode - reset to GOD
        console.log(`⛪ [App] Admin user was in USER mode, resetting to GOD mode`);
        this.selectedAdminMode = 'god';
        localStorage.setItem('edenViewMode', 'god');
      } else {
        // No saved mode - will prompt admin to choose
        console.log(`⛪ [App] Admin user - no saved mode, will prompt for selection`);
        this.selectedAdminMode = 'god'; // Default to GOD
      }
      // Update sidebar visibility after mode is set
      this.updateSidebarVisibility();
    }
    
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
      
      // Listen for garden creation events to refresh gardens list
      if (event.type === 'garden_created') {
        console.log(`🔄 Garden created, refreshing gardens list and Main Street...`);
        // Refresh gardens check and services after a short delay to ensure backend has updated
        setTimeout(() => {
          this.checkServiceGardens();
          this.loadServices();
        }, 500);
      }
      
      // Listen for ledger events to update wallet balance (event-driven, no polling)
      if (event.type === 'ledger_entry_added' || 
          event.type === 'ledger_entry_created' || 
          event.type === 'ledger_booking_completed' ||
          event.type === 'cashier_payment_processed' ||
          event.type === 'wallet_balance_updated') {
        console.log(`💰 [App] Ledger event detected (${event.type}), updating wallet balance...`);
        // Update wallet balance when ledger events occur
        setTimeout(() => {
          this.loadWalletBalance();
        }, 500);
      }
    });
    
    // Load services from ROOT CA ServiceRegistry (Garden of Eden Main Street)
    this.loadServices();
    // Load Snake providers separately
    this.loadSnakeProviders();
    
    // Load priesthood stats (for certified priest count display)
    this.loadPriesthoodStats();
    
    // Check for service gardens (non-root) - Main Street only shows if there are service gardens
    // Call after a short delay to ensure persistence is loaded on server
    setTimeout(() => {
      this.checkServiceGardens();
    }, 500);
    
    // Check priesthood status if user is signed in
    if (this.userEmail) {
      setTimeout(() => {
        this.checkPriesthoodStatus();
      }, 1000);
    }
  }
  
  checkServiceGardens() {
    // Check if there are any service gardens (non-root gardens)
    // In PRIEST mode, only check gardens owned by the current user
    const isPriestMode = this.currentViewMode === 'priest' && this.userEmail && this.userEmail !== this.adminEmail;
    const gardensUrl = isPriestMode && this.userEmail 
      ? `${this.apiUrl}/api/gardens/by-owner?email=${encodeURIComponent(this.userEmail)}`
      : `${this.apiUrl}/api/gardens`;
    
    this.http.get<{success: boolean, gardens?: Array<{id: string, name?: string, type?: string, active: boolean, ownerEmail?: string}>, indexers?: Array<{id: string, name?: string, type?: string, active: boolean}>}>(gardensUrl)
      .subscribe({
        next: (response) => {
          // Support both 'gardens' and 'indexers' response fields for backward compatibility
          let gardens = response.gardens || response.indexers || [];
          
          // In PRIEST mode, filter gardens to only include those owned by the current user
          if (isPriestMode && this.userEmail) {
            gardens = gardens.filter(g => {
              const gardenOwnerEmail = (g as any).ownerEmail;
              return gardenOwnerEmail && gardenOwnerEmail.toLowerCase() === this.userEmail.toLowerCase();
            });
            console.log(`🛐 [PRIEST Mode] Filtered gardens for service check: ${gardens.length} gardens`);
          }
          
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
        // Clear wallet balance when email changes
        console.log(`🔄 [App] Email changed from ${this.userEmail} to ${savedEmail}, clearing wallet balance`);
        this.walletBalance = 0;
        this.isLoadingBalance = true;
        this.userEmail = savedEmail;
        // Set flag to check balance after sign-in (for existing saved credentials)
        this.checkBalanceAfterSignIn = true;
        this.loadWalletBalance(); // Reload balance with Google email
      } else {
        // Email is already set, but check balance anyway if it's below 100
        this.checkBalanceAfterSignIn = true;
        this.loadWalletBalance();
      }
      this.isGoogleSignedIn = true;
      this.updateTitle(); // Ensure title is updated
      this.cdr.detectChanges(); // Force change detection
    } else {
      // Email already set in ngOnInit, balance already loaded
      // Just wait for Google API to load for future sign-in
      this.isGoogleSignedIn = false;
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
      
      // Render the sign-in button in the modal (only if modal is open, login form is shown, and not already signed in)
      if (this.showSignInModal && this.showLoginForm && !this.isGoogleSignedIn) {
        const signInButtonElement = document.getElementById('google-signin-button-modal');
        if (signInButtonElement) {
          // Clear any existing content first
          signInButtonElement.innerHTML = '';
          (window as any).google.accounts.id.renderButton(
            signInButtonElement,
            {
              type: 'standard',
              theme: 'filled_blue',
              size: 'large',
              text: 'signin_with',
              shape: 'rectangular',
              logo_alignment: 'left',
              width: 250
            }
          );
        }
      }
      
      // Try to prompt sign-in automatically (FedCM-compatible) - but don't block if not shown
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
        // Clear wallet balance when switching users
        if (this.userEmail && this.userEmail !== email) {
          console.log(`🔄 [App] User switching from ${this.userEmail} to ${email}, clearing wallet balance`);
          this.walletBalance = 0;
          this.isLoadingBalance = true;
        }
        
        this.userEmail = email;
        this.isGoogleSignedIn = true;
        localStorage.setItem('userEmail', email);
        localStorage.setItem('googleCredential', response.credential);
        console.log(`✅ Google Sign-In successful: ${email}`);
        
        // Update title to show user email
        this.updateTitle();
        
        // Set flag to check balance after sign-in
        this.checkBalanceAfterSignIn = true;
        
        // Load wallet balance for the new user
        this.loadWalletBalance();
        
        // Close modal after successful sign-in
        this.closeSignInModal();
        
        // Set view mode based on email: if NOT bill.draper.auto@gmail.com, use USER mode (hide sidebar)
        this.showSidebar = email === this.adminEmail;
        
        // Check for pending mode selection (selected before login)
        const pendingMode = localStorage.getItem('pendingViewMode');
        localStorage.removeItem('pendingViewMode');
        
        if (email !== this.adminEmail) {
          console.log(`👤 [App] Non-admin user detected (${email})`);
          
          // Check priesthood certification status FIRST for non-admin users
          // If they selected PRIEST mode and have certification, allow PRIEST mode
          if (pendingMode === 'priest') {
            // Check certification asynchronously
            this.checkPriesthoodStatus();
            // Wait for certification check to complete, then set mode
            setTimeout(() => {
              if (this.hasPriesthoodCert) {
                console.log(`🛐 [App] Non-admin user has priesthood certification, allowing PRIEST mode`);
                this.setViewMode('priest');
                this.updateSidebarVisibility();
                this.ensureValidTab();
              } else {
                console.log(`👤 [App] Non-admin user doesn't have priesthood certification, forcing USER mode`);
                this.setViewMode('user');
                this.ensureValidTab();
                this.updateSidebarVisibility();
              }
              // Update sidebar - use setTimeout to ensure ViewChild is ready
              setTimeout(() => {
                if (this.sidebarComponent) {
                  this.sidebarComponent.updateModeFromEmail();
                }
              }, 100);
            }, 500);
          } else {
            // Not PRIEST mode selected, but check if user has certification anyway
            console.log(`👤 [App] Non-admin user selected ${pendingMode || 'user'} mode`);
            // Check certification first - if certified, allow PRIEST mode
            this.checkPriesthoodStatus();
            // Wait for certification check, then set mode
            setTimeout(() => {
              if (this.hasPriesthoodCert) {
                // User has certification - allow PRIEST mode even if they didn't select it
                console.log(`🛐 [App] Non-admin user has priesthood certification, setting PRIEST mode`);
                this.setViewMode('priest');
              } else {
                // No certification - use USER mode
                console.log(`👤 [App] Non-admin user doesn't have certification, using USER mode`);
                this.setViewMode('user');
              }
              // Ensure active tab is visible
              this.ensureValidTab();
              // Update sidebar visibility
              this.updateSidebarVisibility();
              // Update sidebar - use setTimeout to ensure ViewChild is ready
              setTimeout(() => {
                if (this.sidebarComponent) {
                  this.sidebarComponent.updateModeFromEmail();
                } else {
                  console.warn(`⚠️ [App] Sidebar component not ready yet, will update on next check`);
                  // Try again after a delay
                  setTimeout(() => {
                    if (this.sidebarComponent) {
                      this.sidebarComponent.updateModeFromEmail();
                    }
                  }, 500);
                }
              }, 100);
            }, 600);
          }
        } else {
          console.log(`⛪ [App] Admin user detected (${email})`);
          // Admin: Use pending mode (selected before login) or saved mode
          if (pendingMode === 'god' || pendingMode === 'priest') {
            this.selectedAdminMode = pendingMode;
            this.setViewMode(pendingMode);
            console.log(`⛪ [App] Admin mode set from pre-login selection: ${this.selectedAdminMode}`);
          } else {
            // Check for saved mode
            const savedMode = localStorage.getItem('edenViewMode');
            if (savedMode === 'god' || savedMode === 'priest') {
              this.selectedAdminMode = savedMode;
              this.setViewMode(savedMode);
              console.log(`⛪ [App] Admin mode restored from saved: ${this.selectedAdminMode}`);
            } else {
              // Default to GOD
              this.selectedAdminMode = 'god';
              this.setViewMode('god');
              console.log(`⛪ [App] Admin mode defaulted to: ${this.selectedAdminMode}`);
            }
          }
          // Apply the selected mode (this will update sidebar visibility)
          this.applyAdminMode();
          setTimeout(() => {
            if (this.sidebarComponent) {
              this.sidebarComponent.updateModeFromEmail();
            }
          }, 100);
        }
      }
    } catch (err) {
      console.error('Error processing Google Sign-In:', err);
    }
  }
  
  refreshGardens() {
    console.log('🔄 Refreshing gardens list and Main Street...');
    // Refresh gardens check and services for Main Street
    this.checkServiceGardens();
    this.loadServices();
    
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

  updateTitle() {
    // Only show email in title if user is actually signed in (not just default email)
    // Check if there's a saved email in localStorage (user is signed in)
    const savedEmail = localStorage.getItem('userEmail');
    const isActuallySignedIn = !!savedEmail && savedEmail !== 'bill.draper.auto@gmail.com';
    
    if (isActuallySignedIn && this.userEmail && this.userEmail !== 'bill.draper.auto@gmail.com') {
      this.title = `Eden Simulator Dashboard for ${this.userEmail}`;
    } else {
      // Non-user binding state - just show base title
      this.title = 'Eden Simulator Dashboard';
    }
    // Force change detection after title update
    this.cdr.detectChanges();
  }
  
  openSignInModal() {
    this.showSignInModal = true;
    // Reset to mode selection step
    this.resetLoginFlow();
    this.cdr.detectChanges();
    
    // Re-render Google Sign-In button in modal if needed (only when login form is shown)
    setTimeout(() => {
      if (this.showLoginForm && !this.isGoogleSignedIn && typeof (window as any).google !== 'undefined' && (window as any).google.accounts) {
        const signInButtonElement = document.getElementById('google-signin-button-modal');
        if (signInButtonElement) {
          signInButtonElement.innerHTML = '';
          (window as any).google.accounts.id.renderButton(
            signInButtonElement,
            {
              type: 'standard',
              theme: 'filled_blue',
              size: 'large',
              text: 'signin_with',
              shape: 'rectangular',
              logo_alignment: 'left',
              width: 250
            }
          );
        }
      }
    }, 100);
  }
  
  closeSignInModal() {
    this.showSignInModal = false;
    this.resetLoginFlow();
    this.cdr.detectChanges();
  }
  
  openStripePaymentModal() {
    this.showStripePaymentModal = true;
    this.cdr.detectChanges();
  }

  closeStripePaymentModal() {
    this.showStripePaymentModal = false;
    this.cdr.detectChanges();
  }

  // Garden shutdown dialog methods
  openGardenShutdownDialog(): void {
    if (!this.isUserSignedIn || !this.userEmail) {
      console.warn('⚠️  Cannot open shutdown dialog: user not signed in');
      return;
    }
    
    this.showGardenShutdownDialog = true;
    this.isLoadingGardens = true;
    this.priestGardens = [];
    this.shutdownReason = '';
    this.selectedGardenForShutdown = null;
    this.cdr.detectChanges();
    
    // Load gardens for this Priest user
    this.loadPriestGardens();
  }

  closeGardenShutdownDialog(): void {
    this.showGardenShutdownDialog = false;
    this.priestGardens = [];
    this.shutdownReason = '';
    this.selectedGardenForShutdown = null;
    this.cdr.detectChanges();
  }

  loadPriestGardens(): void {
    if (!this.userEmail) {
      console.warn('⚠️  Cannot load gardens: no user email');
      this.isLoadingGardens = false;
      return;
    }

    const apiUrl = `${this.apiUrl}/api/gardens/by-owner?email=${encodeURIComponent(this.userEmail)}`;
    this.http.get<{success: boolean, gardens: any[], count: number}>(apiUrl).subscribe({
      next: (response) => {
        if (response.success && response.gardens) {
          this.priestGardens = response.gardens.filter(g => g.active); // Only show active gardens
          console.log(`📋 [Shutdown] Loaded ${this.priestGardens.length} active gardens for ${this.userEmail}`);
        } else {
          this.priestGardens = [];
          console.log(`📋 [Shutdown] No gardens found for ${this.userEmail}`);
        }
        this.isLoadingGardens = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('❌ [Shutdown] Failed to load gardens:', err);
        this.priestGardens = [];
        this.isLoadingGardens = false;
        this.cdr.detectChanges();
      }
    });
  }

  confirmGardenShutdown(gardenId: string): void {
    if (!this.shutdownReason.trim()) {
      alert('Please provide a reason for shutting down this garden.');
      return;
    }

    const garden = this.priestGardens.find(g => g.id === gardenId);
    if (!confirm(`⚠️  WARNING: This will permanently revoke the certificate for ${garden?.name || gardenId}.\n\nThis action cannot be easily undone. Are you sure you want to proceed?`)) {
      return;
    }

    this.isShuttingDown = true;
    this.selectedGardenForShutdown = gardenId;
    this.cdr.detectChanges();

    const apiUrl = `${this.apiUrl}/api/garden/shutdown`;
    this.http.post<{success: boolean, revocation: any, garden: any, revokedProvidersCount: number}>(apiUrl, {
      gardenId: gardenId,
      reason: this.shutdownReason,
      requestedBy: this.userEmail,
      revokeProviders: true
    }).subscribe({
      next: (response) => {
        if (response.success) {
          console.log(`✅ [Shutdown] Garden ${gardenId} shut down successfully`);
          console.log(`   Revoked ${response.revokedProvidersCount} provider(s)`);
          
          // Remove from list
          this.priestGardens = this.priestGardens.filter(g => g.id !== gardenId);
          
          // Refresh gardens list
          this.refreshGardens();
          
          alert(`✅ Garden shut down successfully!\n\nRevoked ${response.revokedProvidersCount} provider(s).`);
          
          // Reset form
          this.shutdownReason = '';
          this.selectedGardenForShutdown = null;
        } else {
          alert(`❌ Failed to shutdown garden: ${(response as any).error || 'Unknown error'}`);
        }
        this.isShuttingDown = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('❌ [Shutdown] Failed to shutdown garden:', err);
        const errorMsg = err.error?.error || err.message || 'Unknown error';
        alert(`❌ Failed to shutdown garden: ${errorMsg}`);
        this.isShuttingDown = false;
        this.selectedGardenForShutdown = null;
        this.cdr.detectChanges();
      }
    });
  }
  
  signOut() {
    // Clear wallet balance IMMEDIATELY when signing out (before any other operations)
    console.log(`🔄 [App] User signing out, clearing wallet balance immediately`);
    this.walletBalance = 0;
    this.isLoadingBalance = true; // Set to loading state to show spinner
    
    // Force change detection immediately to update UI
    this.cdr.detectChanges();
    
    // Clear Google Sign-In data
    localStorage.removeItem('userEmail');
    localStorage.removeItem('googleCredential');
    
    // Clear userEmail to put dashboard in non-user binding state
    this.userEmail = '';
    this.isGoogleSignedIn = false;
    
    // Set view mode to USER when signing out
    console.log(`🔄 [App] Setting view mode to USER after sign out`);
    this.setViewMode('user');
    
    // Update sidebar visibility based on view mode (should be hidden in USER mode)
    this.updateSidebarVisibility();
    
    // Ensure active tab is visible in user mode
    this.ensureValidTab();
    
    this.updateTitle();
    
    // Load wallet balance for default user after a short delay to ensure UI has updated
    setTimeout(() => {
      this.loadWalletBalance();
    }, 100);
    
    // Force change detection again after all updates
    this.cdr.detectChanges();
    
    // Re-initialize Google Sign-In to show button again (with a small delay to ensure DOM is updated)
    setTimeout(() => {
      this.initializeGoogleSignIn();
    }, 100);
  }
  
  signOutAndClose() {
    this.signOut();
    this.closeSignInModal();
  }
  
  signInWithEmail() {
    if (!this.signInEmail || !this.signInPassword) {
      alert('Please enter both email and password');
      return;
    }
    
    this.isSigningIn = true;
    
    // For now, we'll use email/password to set the user email directly
    // In a real app, you'd validate credentials with a backend API
    // For this simulator, we'll just accept any email/password and use the email
    setTimeout(() => {
      // Clear wallet balance when switching users
      if (this.userEmail && this.userEmail !== this.signInEmail) {
        console.log(`🔄 [App] User switching from ${this.userEmail} to ${this.signInEmail}, clearing wallet balance`);
        this.walletBalance = 0;
        this.isLoadingBalance = true;
      }
      
      this.userEmail = this.signInEmail;
      this.isGoogleSignedIn = true; // Mark as signed in (even though it's email/password)
      localStorage.setItem('userEmail', this.signInEmail);
      
      // Check for pending mode selection (selected before login)
      const pendingMode = localStorage.getItem('pendingViewMode');
      localStorage.removeItem('pendingViewMode');
      
      // Set view mode
      if (this.userEmail !== this.adminEmail) {
        // Non-admin users: Check certification first, then set mode
        console.log(`👤 [App] Non-admin user detected (${this.userEmail})`);
        // Check priesthood certification - this will set PRIEST mode if certified
        this.checkPriesthoodStatus();
        // Wait for certification check, then set mode
        setTimeout(() => {
          if (this.hasPriesthoodCert) {
            // User has certification - set PRIEST mode
            console.log(`🛐 [App] Non-admin user has priesthood certification, setting PRIEST mode`);
            this.setViewMode('priest');
          } else {
            // No certification - use USER mode
            console.log(`👤 [App] Non-admin user doesn't have certification, using USER mode`);
            this.setViewMode('user');
          }
          // Ensure active tab is visible
          this.ensureValidTab();
          // Update sidebar visibility
          this.updateSidebarVisibility();
          setTimeout(() => {
            if (this.sidebarComponent) {
              this.sidebarComponent.updateModeFromEmail();
            }
          }, 100);
        }, 600);
      } else {
        // Admin: Use pending mode (selected before login) or default to GOD
        if (pendingMode === 'god' || pendingMode === 'priest') {
          this.selectedAdminMode = pendingMode;
          this.setViewMode(pendingMode);
          console.log(`⛪ [App] Admin mode set from pre-login selection: ${this.selectedAdminMode}`);
        } else {
          // Check for saved mode
          const savedMode = localStorage.getItem('edenViewMode');
          if (savedMode === 'god' || savedMode === 'priest') {
            this.selectedAdminMode = savedMode;
            this.setViewMode(savedMode);
          } else {
            // Default to GOD
            this.selectedAdminMode = 'god';
            this.setViewMode('god');
          }
        }
        // Apply selected mode (this will update sidebar visibility)
        this.applyAdminMode();
        setTimeout(() => {
          if (this.sidebarComponent) {
            this.sidebarComponent.updateModeFromEmail();
          }
        }, 100);
      }
      
      // Note: In production, you'd store a session token instead
      
      this.updateTitle();
      this.loadWalletBalance();
      this.closeSignInModal();
      this.cdr.detectChanges();
      
      // Clear form
      this.signInEmail = 'bill.draper.auto@gmail.com';
      this.signInPassword = 'Qweasdzxc1!';
      this.isSigningIn = false;
      
      console.log(`✅ Email/Password Sign-In successful: ${this.userEmail}`);
    }, 500); // Simulate API call delay
  }
  
  loadWalletBalance() {
    // Always get the latest email from localStorage to ensure we're using the current signed-in user
    const savedEmail = localStorage.getItem('userEmail');
    // If no saved email (user signed out), use default email for balance check
    // Otherwise use saved email or current userEmail
    const emailToUse = savedEmail || (this.userEmail || 'bill.draper.auto@gmail.com');
    
    // Update userEmail if it's different (user signed in with different account)
    if (this.userEmail !== emailToUse) {
      console.log(`📧 Email changed from ${this.userEmail} to ${emailToUse}, clearing and reloading wallet balance`);
      // Clear balance when email changes
      this.walletBalance = 0;
      this.userEmail = emailToUse;
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
        this.isLoadingBalance = false; // Clear loading state first
        if (response.success) {
          this.walletBalance = response.balance || 0;
          console.log(`✅ Wallet balance loaded: ${this.walletBalance} 🍎 APPLES for ${this.userEmail}`);
          console.log(`💳 [App] checkBalanceAfterSignIn flag: ${this.checkBalanceAfterSignIn}`);
          console.log(`💳 [App] Balance check: ${this.walletBalance} < 100 = ${this.walletBalance < 100}`);
          // Force change detection to update UI immediately
          this.cdr.detectChanges();
          
          // Check if we need to show Stripe Payment Rail modal after sign-in
          // Show modal if balance < 100 JSC and user is signed in (either via flag or already signed in)
          // Also check localStorage to see if user has signed in credentials
          const hasSignedInCredentials = !!(localStorage.getItem('userEmail') && localStorage.getItem('googleCredential'));
          const shouldCheckBalance = this.checkBalanceAfterSignIn || this.isGoogleSignedIn || hasSignedInCredentials;
          
          if (this.walletBalance < 100 && shouldCheckBalance && !this.showStripePaymentModal) {
            console.log(`💳 [App] ✅ Balance (${this.walletBalance.toFixed(2)} 🍎 APPLES) is below 100 🍎 APPLES, showing Stripe Payment Rail modal`);
            console.log(`💳 [App] checkBalanceAfterSignIn: ${this.checkBalanceAfterSignIn}, isGoogleSignedIn: ${this.isGoogleSignedIn}, hasSignedInCredentials: ${hasSignedInCredentials}`);
            setTimeout(() => {
              if (this.walletBalance < 100 && !this.showStripePaymentModal) {
                this.showStripePaymentModal = true;
                this.checkBalanceAfterSignIn = false; // Reset flag
                console.log(`💳 [App] ✅ Stripe Payment Rail modal should now be visible: ${this.showStripePaymentModal}`);
                this.cdr.detectChanges();
              }
            }, 500); // Small delay to ensure sign-in modal is closed
          } else if (this.checkBalanceAfterSignIn) {
            console.log(`💳 [App] Balance is sufficient (${this.walletBalance.toFixed(2)} 🍎 APPLES >= 100 🍎 APPLES), not showing modal`);
            this.checkBalanceAfterSignIn = false; // Reset flag even if balance is sufficient
          }
        } else {
          console.error('❌ Failed to load balance:', response.error);
          this.walletBalance = 0;
          // Force change detection to update UI immediately
          this.cdr.detectChanges();
          // Still check if we need to show modal even if balance load failed
          if (this.checkBalanceAfterSignIn) {
            console.log(`💳 [App] Balance load failed but checkBalanceAfterSignIn is true, showing modal`);
            setTimeout(() => {
              this.showStripePaymentModal = true;
              this.checkBalanceAfterSignIn = false;
              this.cdr.detectChanges();
            }, 500);
          }
        }
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
    
    // Check if we're in PRIEST mode (certified priest user)
    // When signed out (non-user binding state), isPriestMode should be false to show all public services
    const isPriestMode = this.isUserSignedIn && this.currentViewMode === 'priest' && this.userEmail && this.userEmail !== this.adminEmail;
    
    // First, load gardens to validate gardenId
    // In PRIEST mode, filter gardens by ownerEmail to show only priest-owned gardens
    const gardensUrl = isPriestMode && this.userEmail 
      ? `${this.apiUrl}/api/gardens/by-owner?email=${encodeURIComponent(this.userEmail)}`
      : `${this.apiUrl}/api/gardens`;
    
    this.http.get<{success: boolean, gardens?: Array<{id: string, name?: string, type?: string, active: boolean, ownerEmail?: string}>, indexers?: Array<{id: string, name?: string, type?: string, active: boolean}>}>(gardensUrl)
      .subscribe({
        next: (gardensResponse) => {
          // Support both 'gardens' and 'indexers' response fields for backward compatibility
          const gardens = gardensResponse.gardens || gardensResponse.indexers || [];
          
          // In PRIEST mode, filter gardens to only include those owned by the current user
          let filteredGardens = gardens;
          if (isPriestMode && this.userEmail) {
            filteredGardens = gardens.filter(g => {
              const gardenOwnerEmail = (g as any).ownerEmail;
              return gardenOwnerEmail && gardenOwnerEmail.toLowerCase() === this.userEmail.toLowerCase();
            });
            console.log(`🛐 [PRIEST Mode] Filtered gardens by ownerEmail (${this.userEmail}): ${filteredGardens.length} of ${gardens.length} gardens`);
          }
          
          const validGardenIds = new Set<string>(['HG']); // HG is always valid (infrastructure)
          filteredGardens.forEach(g => {
            if (g.active && g.id) {
              validGardenIds.add(g.id);
            }
          });
          
          console.log(`🔍 [Main Street] Valid garden IDs: ${Array.from(validGardenIds).join(', ')}`);
          
          // Now load service registry
          // In PRIEST mode, filter by ownerEmail to show only providers from priest-owned gardens
          const ownerEmailParam = isPriestMode && this.userEmail ? `?ownerEmail=${encodeURIComponent(this.userEmail)}` : '';
          this.http.get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry${ownerEmailParam}`)
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
              },
              {
                type: 'grocerystore',
                icon: '🏢',
                adText: 'Grocery Store',
                sampleQuery: 'I want to find a grocery store near me with fresh Orange produce at the best prices'
              },
              {
                type: 'pharmacy',
                icon: '🏢',
                adText: 'Pharmacy',
                sampleQuery: 'I need to find a pharmacy that has my prescription medication available'
              },
              {
                type: 'dogpark',
                icon: '🐕',
                adText: 'Dog Park',
                sampleQuery: 'I want to find a dog park near me with off-leash areas and water fountains'
              },
              {
                type: 'gasstation',
                icon: '⛽',
                adText: 'Gas Station',
                sampleQuery: 'I need to find a gas station with premium fuel at the best price'
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
    // In PRIEST mode, filter by ownerEmail to show only providers from priest-owned gardens
    // When signed out (non-user binding state), don't filter - show all public services
    this.isLoadingSnakeProviders = true;
    const isPriestMode = this.isUserSignedIn && this.currentViewMode === 'priest' && this.userEmail && this.userEmail !== this.adminEmail;
    const ownerEmailParam = (isPriestMode && this.userEmail && this.isUserSignedIn) ? `&ownerEmail=${encodeURIComponent(this.userEmail)}` : '';
    this.http.get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry?serviceType=snake${ownerEmailParam}`)
      .subscribe({
        next: (response) => {
          if (response.success && response.providers) {
            // Filter to only active providers
            let filteredProviders = response.providers.filter(p => p.status === 'active');
            
            // In PRIEST mode, additional filtering is already done by the API, but we can double-check
            if (isPriestMode && this.userEmail) {
              const beforeCount = filteredProviders.length;
              // Filter to only providers from gardens owned by the current user
              // Note: We need to check the garden's ownerEmail, but providers don't have ownerEmail directly
              // The API should have already filtered by ownerEmail, but we can validate here if needed
              console.log(`🛐 [PRIEST Mode] Loaded ${filteredProviders.length} Snake services for priest (${this.userEmail})`);
            }
            
            this.snakeProviders = filteredProviders;
            console.log(`🐍 Loaded ${this.snakeProviders.length} Snake services:`, this.snakeProviders.map(p => `${p.name} (garden: ${p.gardenId || p.indexerId})`).join(', '));
          } else {
            this.snakeProviders = [];
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
            console.log(`✅ 🍎 APPLES already minted for this session. Balance: ${response.balance} 🍎 APPLES`);
            this.walletBalance = response.balance || 0;
            alert(`✅ Payment confirmed! Your balance: ${response.balance} 🍎 APPLES`);
          } else if (response.minted) {
            console.log(`✅ 🍎 APPLES minted successfully! Amount: ${response.amount} 🍎 APPLES, Balance: ${response.balance} 🍎 APPLES`);
            this.walletBalance = response.balance || 0;
            alert(`✅ ${response.amount} 🍎 APPLES deposited successfully! Your balance: ${response.balance} 🍎 APPLES`);
          } else if (response.registered || response.alreadyRegistered) {
            console.log(`✅ Garden registered: ${response.indexerId || response.indexerName}`);
            this.walletBalance = response.balance || 0;
            this.isProcessingGarden = false;
            alert(`✅ Movie garden installed successfully!\nGarden: ${response.indexerId || response.indexerName}\nBalance: ${response.balance} 🍎 APPLES`);
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
    
    // Check wallet balance first (ensure it's loaded)
    if (this.isLoadingBalance) {
      alert('Please wait while wallet balance is loading...');
      return;
    }
    
    // Ensure balance is loaded before proceeding
    if (this.walletBalance === undefined || this.walletBalance === null) {
      console.log('💰 Wallet balance not loaded yet, loading now...');
      this.loadWalletBalance();
      // Wait a moment for balance to load, then check again
      setTimeout(() => {
        this.buyJesusCoin(amount);
      }, 500);
      return;
    }
    
    // Log current balance for debugging
    console.log(`💰 Current wallet balance: ${this.walletBalance.toFixed(2)} 🍎 APPLES`);
    console.log(`💰 Attempting to buy: ${amount} 🍎 APPLES`);
    
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
    
    // Check wallet balance first (ensure it's loaded)
    if (this.isLoadingBalance) {
      alert('Please wait while wallet balance is loading...');
      return;
    }
    
    // Ensure balance is loaded before proceeding
    if (this.walletBalance === undefined || this.walletBalance === null) {
      console.log('💰 Wallet balance not loaded yet, loading now...');
      this.loadWalletBalance();
      // Wait a moment for balance to load, then check again
      setTimeout(() => {
        this.buyMovieIndexer(amount);
      }, 500);
      return;
    }
    
    // Log current balance for debugging
    console.log(`💰 Current wallet balance: ${this.walletBalance.toFixed(2)} Apple`);
    console.log(`💰 Required amount: ${amount} Apple`);
    
    this.isProcessingGarden = true;
    
    // First check wallet balance
    if (this.walletBalance >= amount) {
      // User has enough balance - purchase directly from wallet
      console.log(`💰 Purchasing garden from wallet balance: ${this.walletBalance} 🍎 APPLES`);
      this.http.post<{success: boolean, indexerId?: string, indexerName?: string, balance?: number, error?: string}>(
        `${this.apiUrl}/api/indexer/purchase`,
        { email: this.userEmail, amount: amount, indexerType: 'movie' }
      ).subscribe({
        next: (response) => {
          if (response.success) {
            console.log(`✅ Garden purchased from wallet: ${response.indexerId || response.indexerName}`);
            this.walletBalance = response.balance || this.walletBalance - amount;
            this.isProcessingGarden = false;
            alert(`✅ Movie garden installed successfully!\nGarden: ${response.indexerId || response.indexerName}\nRemaining balance: ${response.balance} 🍎 APPLES`);
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
      console.log(`💳 Insufficient balance (${this.walletBalance} 🍎 APPLES). Redirecting to Stripe...`);
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
    
    // Pre-load the workflow for this service type so it's ready when user submits
    console.log(`🔄 [App] Pre-loading workflow for service type: ${serviceType.type}`);
    this.flowWiseService.loadWorkflowIfNeeded(serviceType.type);
    
    // Focus on the unified input
    setTimeout(() => {
      const input = document.querySelector('input[name="userInput"]') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  }
  
  /**
   * Create service-type-specific mock data for workflow initialization
   */
  createMockDataForServiceType(serviceType: string): any {
    if (serviceType === 'airline') {
      return {
        llmResponse: {
          selectedListing: {
            flightNumber: 'AA123',
            destination: 'Los Angeles',
            date: '2026-01-20',
            price: 299.99,
            providerId: 'airline-001',
            providerName: 'Airline Provider',
            location: 'New York'
          },
          iGasCost: 0.004450
        },
        selectedListing: {
          flightNumber: 'AA123',
          destination: 'Los Angeles',
          date: '2026-01-20',
          price: 299.99,
          providerId: 'airline-001',
          providerName: 'Airline Provider',
          location: 'New York'
        },
        flightPrice: 299.99,
        totalCost: 300.004450,
        paymentSuccess: true,
        userDecision: 'YES'
      };
    } else if (serviceType === 'movie') {
      return {
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
      };
    } else {
      // Generic fallback for other service types
      return {
        llmResponse: {
          selectedListing: {
            name: 'Demo Service',
            price: 50.00,
            providerId: 'provider-001',
            providerName: 'Service Provider',
            location: 'Demo Location'
          },
          iGasCost: 0.004450
        },
        selectedListing: {
          name: 'Demo Service',
          price: 50.00,
          providerId: 'provider-001',
          providerName: 'Service Provider',
          location: 'Demo Location'
        },
        totalCost: 50.004450,
        paymentSuccess: true,
        userDecision: 'YES'
      };
    }
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

  // ============================================
  // PRIESTHOOD CERTIFICATION METHODS
  // ============================================
  
  // Manually switch to PRIEST mode (for certified priests)
  switchToPriestMode(): void {
    if (this.userEmail !== this.adminEmail && this.hasPriesthoodCert) {
      console.log(`🛐 [App] Manually switching to PRIEST mode`);
      this.setViewMode('priest');
      this.updateSidebarVisibility();
      this.ensureValidTab();
      this.cdr.detectChanges();
    }
  }
  
  // Check priesthood certification status
  checkPriesthoodStatus(): void {
    if (!this.userEmail) {
      return;
    }
    
    this.http.get(`${this.apiUrl}/api/priesthood/status?email=${encodeURIComponent(this.userEmail)}`).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.priesthoodStatus = response.certification?.status || null;
          this.hasPriesthoodCert = response.hasCertification || false;
          
          // Store certification details for UI
          if (response.certification) {
            this.priesthoodCertification = response.certification;
          } else {
            this.priesthoodCertification = null;
          }
          
          console.log(`📜 [Priesthood] Status: ${this.priesthoodStatus}, Has Cert: ${this.hasPriesthoodCert}`);
          
          // For non-admin users: if they have certification, ALWAYS switch to PRIEST mode
          if (this.userEmail !== this.adminEmail) {
            const currentMode = localStorage.getItem('edenViewMode');
            if (this.hasPriesthoodCert) {
              // User has certification - ALWAYS switch to PRIEST mode if not already
              if (currentMode !== 'priest') {
                console.log(`🛐 [Priesthood] Certified priest detected, switching to PRIEST mode (was: ${currentMode})`);
                this.setViewMode('priest');
                this.updateSidebarVisibility();
                this.ensureValidTab();
                // Force change detection to update UI
                this.cdr.detectChanges();
              } else {
                console.log(`🛐 [Priesthood] Certified priest already in PRIEST mode`);
                // Still trigger change detection to ensure UI is updated
                this.cdr.detectChanges();
              }
            } else {
              // User doesn't have certification - if they're in PRIEST mode, force to USER
              if (this.selectedMode === 'priest' || currentMode === 'priest') {
                console.log(`⚠️  [Priesthood] User in PRIEST mode but doesn't have certification, forcing USER mode`);
                this.selectedMode = 'user';
                this.setViewMode('user');
                this.updateSidebarVisibility();
                this.ensureValidTab();
                this.cdr.detectChanges();
              }
            }
          }
        }
      },
      error: (err) => {
        console.error('❌ [Priesthood] Error checking status:', err);
      }
    });
  }
  
  // Apply for priesthood
  applyForPriesthood(): void {
    if (!this.userEmail) {
      alert('Please sign in first');
      return;
    }
    
    if (!this.priesthoodApplicationReason.trim()) {
      alert('Please provide a reason for your application');
      return;
    }
    
    // Confirm application fee payment (Covenant Token / Witness Apple)
    const APPLICATION_FEE = 1;
    const confirmMessage = `Covenant Token: ${APPLICATION_FEE} 🍎 APPLES (Non-refundable)\n\nThis symbolic offering demonstrates your commitment and prevents spam applications.\n\nMembership is FREE - authority is trust-based and rate-limited.\n\nDo you want to proceed?`;
    if (!confirm(confirmMessage)) {
      return;
    }
    
    this.isSubmittingApplication = true;
    this.http.post(`${this.apiUrl}/api/priesthood/apply`, {
      email: this.userEmail,
      reason: this.priesthoodApplicationReason
    }).subscribe({
      next: (response: any) => {
        if (response.success) {
          alert(`Application submitted successfully!\n\nCovenant Token: ${APPLICATION_FEE} 🍎 APPLES paid.\n\nMembership is FREE - authority is trust-based and rate-limited.\n\nYou will be notified when GOD reviews your application.`);
          this.showPriesthoodApplicationModal = false;
          this.priesthoodApplicationReason = '';
          this.checkPriesthoodStatus();
          this.loadWalletBalance(); // Refresh balance
        }
        this.isSubmittingApplication = false;
      },
      error: (err) => {
        console.error('❌ [Priesthood] Error applying:', err);
        alert(err.error?.error || 'Failed to submit application');
        this.isSubmittingApplication = false;
      }
    });
  }
  
  // Activate membership (FREE - no payment required)
  activateMembership(): void {
    if (!this.userEmail) {
      alert('Please sign in first');
      return;
    }
    
    const confirmMessage = `Activate Membership (FREE)\n\nMembership is FREE - authority is trust-based and rate-limited.\n\nYour authority scales with trust, not payment.\n\nDo you want to activate?`;
    if (!confirm(confirmMessage)) {
      return;
    }
    
    this.http.post(`${this.apiUrl}/api/priesthood/pay-membership`, {
      email: this.userEmail
    }).subscribe({
      next: (response: any) => {
        if (response.success) {
          const activeUntil = response.activeUntil ? new Date(response.activeUntil).toLocaleDateString() : 'N/A';
          alert(`Membership activated successfully!\n\nMembership active until: ${activeUntil}\n\nMembership is FREE - authority is trust-based and rate-limited.`);
          this.checkPriesthoodStatus();
        }
      },
      error: (err) => {
        console.error('❌ [Priesthood] Error activating membership:', err);
        alert(err.error?.error || 'Failed to activate membership');
      }
    });
  }
  
  // GOD Mode: Load all applications
  loadPriesthoodApplications(): void {
    if (this.userEmail !== this.adminEmail) {
      return;
    }
    
    this.isLoadingApplications = true;
    this.http.get(`${this.apiUrl}/api/priesthood/applications`).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.priesthoodApplications = response.certifications || [];
          console.log(`📜 [Priesthood] Loaded ${this.priesthoodApplications.length} applications`);
        }
        this.isLoadingApplications = false;
      },
      error: (err) => {
        console.error('❌ [Priesthood] Error loading applications:', err);
        this.isLoadingApplications = false;
      }
    });
  }
  
  // GOD Mode: Load statistics
  loadPriesthoodStats(): void {
    // Load stats for all users (not just admin) to display certified priest count
    this.http.get(`${this.apiUrl}/api/priesthood/stats`).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.priesthoodStats = response.stats;
          console.log(`📜 [Priesthood] Stats:`, this.priesthoodStats);
        }
      },
      error: (err) => {
        console.error('❌ [Priesthood] Error loading stats:', err);
      }
    });
  }
  
  // GOD Mode: Approve application
  approvePriesthoodApplication(email: string): void {
    if (this.userEmail !== this.adminEmail) {
      return;
    }
    
    const reason = prompt('Enter approval reason (optional):');
    this.http.post(`${this.apiUrl}/api/priesthood/approve`, {
      email,
      approvedBy: this.userEmail,
      reason: reason || undefined
    }).subscribe({
      next: (response: any) => {
        if (response.success) {
          alert(`Priesthood approved for ${email}`);
          this.loadPriesthoodApplications();
          this.loadPriesthoodStats();
        }
      },
      error: (err) => {
        console.error('❌ [Priesthood] Error approving:', err);
        alert(err.error?.error || 'Failed to approve application');
      }
    });
  }
  
  // GOD Mode: Reject application
  rejectPriesthoodApplication(email: string): void {
    if (this.userEmail !== this.adminEmail) {
      return;
    }
    
    const reason = prompt('Enter rejection reason (required):');
    if (!reason) {
      return;
    }
    
    this.http.post(`${this.apiUrl}/api/priesthood/reject`, {
      email,
      rejectedBy: this.userEmail,
      reason
    }).subscribe({
      next: (response: any) => {
        if (response.success) {
          alert(`Priesthood application rejected for ${email}`);
          this.loadPriesthoodApplications();
          this.loadPriesthoodStats();
        }
      },
      error: (err) => {
        console.error('❌ [Priesthood] Error rejecting:', err);
        alert(err.error?.error || 'Failed to reject application');
      }
    });
  }
  
  // GOD Mode: Revoke certification
  revokePriesthoodCertification(email: string): void {
    if (this.userEmail !== this.adminEmail) {
      return;
    }
    
    if (!confirm(`Are you sure you want to revoke priesthood certification for ${email}?`)) {
      return;
    }
    
    const reason = prompt('Enter revocation reason (required):');
    if (!reason) {
      return;
    }
    
    this.http.post(`${this.apiUrl}/api/priesthood/revoke`, {
      email,
      revokedBy: this.userEmail,
      reason
    }).subscribe({
      next: (response: any) => {
        if (response.success) {
          alert(`Priesthood certification revoked for ${email}`);
          this.loadPriesthoodApplications();
          this.loadPriesthoodStats();
        }
      },
      error: (err) => {
        console.error('❌ [Priesthood] Error revoking:', err);
        alert(err.error?.error || 'Failed to revoke certification');
      }
    });
  }

  ngOnDestroy() {
    this.wsService.disconnect();
  }

  hasSufficientBalance(): boolean {
    // Check if balance is sufficient (at least 0.01 🍎 APPLES for iGas)
    // If balance is still loading, allow submission (will be checked server-side)
    if (this.isLoadingBalance) {
      return true; // Allow while loading, server will check
    }
    // Minimum balance required: 0.01 🍎 APPLES (for iGas costs)
    const minimumBalance = 0.01;
    return this.walletBalance >= minimumBalance;
  }

  async onSubmit() {
    if (!this.userInput.trim() || this.isProcessing) {
      console.log('⚠️ Submit blocked:', { 
        hasInput: !!this.userInput.trim(), 
        isProcessing: this.isProcessing 
      });
      return;
    }
    
    // Check balance before submitting
    if (!this.hasSufficientBalance()) {
      console.log('⚠️ Submit blocked: Insufficient balance', { 
        balance: this.walletBalance,
        required: 0.01
      });
      alert(`Insufficient wallet balance. Your balance is ${this.walletBalance.toFixed(2)} 🍎 APPLES. You need at least 0.01 🍎 APPLES (for iGas) to send messages. Please purchase 🍎 APPLES first.`);
      return;
    }

    // Context sensing - detect service type if not already set
    if (!this.selectedServiceType) {
      this.selectedServiceType = this.detectServiceType(this.userInput);
      console.log(`🔍 Detected service type from input: ${this.selectedServiceType || 'unknown'}`);
    }

    // If no service type detected, default to 'movie' for backward compatibility
    const serviceType = this.selectedServiceType || 'movie';

    console.log('📤 Submitting chat message:', this.userInput);
    console.log(`📋 Context: Service Type = ${serviceType}`);
    
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
      // Automatically start workflow for the selected service type
      console.log(`🎬 [Workflow] Automatically starting ${serviceType} workflow for chat input:`, input);
      this.amcWorkflowActive = true;
      this.workflowMessages = [];

      // Ensure workflow is loaded before starting
      console.log(`🔄 [Workflow] Ensuring ${serviceType} workflow is loaded...`);
      this.flowWiseService.loadWorkflowIfNeeded(serviceType);
      
      // Wait a bit for workflow to load if it was just requested
      // Check if workflow is loaded, if not wait and retry
      let workflowLoaded = false;
      let retries = 0;
      const maxRetries = 10; // Wait up to 5 seconds (10 * 500ms)
      
      while (!workflowLoaded && retries < maxRetries) {
        const workflow = this.flowWiseService.getWorkflow(serviceType);
        if (workflow) {
          console.log(`✅ [Workflow] ${serviceType} workflow is loaded: ${workflow.name}`);
          workflowLoaded = true;
        } else {
          console.log(`⏳ [Workflow] Waiting for ${serviceType} workflow to load... (attempt ${retries + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        }
      }
      
      if (!workflowLoaded) {
        console.error(`❌ [Workflow] Failed to load ${serviceType} workflow after ${maxRetries} attempts`);
        alert(`Failed to load ${serviceType} workflow. Please try again.`);
        this.amcWorkflowActive = false;
        return;
      }

      // Create service-type-agnostic mock data based on serviceType
      const mockData = this.createMockDataForServiceType(serviceType);
      
      console.log(`🚀 [Workflow] Starting ${serviceType} workflow execution...`);
      let execution = this.flowWiseService.startWorkflow(serviceType, {
        input: input,
        email: this.userEmail,
        user: { email: this.userEmail, id: this.userEmail },
        edenChatSession: {
          sessionId: `session_${Date.now()}`,
          serviceType: serviceType,
          startTime: Date.now()
        },
        // Provide mock data to prevent workflow errors (service-type specific)
        ...mockData
      });

      // If workflow not started (shouldn't happen if loaded), log error
      if (!execution) {
        console.error(`❌ [Workflow] Failed to start ${serviceType} workflow even though it's loaded`);
        alert(`Failed to start ${serviceType} workflow. Please try again.`);
        this.amcWorkflowActive = false;
        return;
      }

      console.log(`🚀 [Workflow] ${serviceType} workflow started successfully:`, execution.executionId);
      console.log(`🚀 [Workflow] Execution details:`, {
        executionId: execution.executionId,
        serviceType: execution.serviceType,
        currentStep: execution.currentStep,
        workflowId: execution.workflowId
      });
      
      // Add user message to workflow chat
      this.workflowMessages.push({
        type: 'user_message',
        message: input,
        timestamp: Date.now(),
        data: { user: this.userEmail }
      });
    } catch (error: any) {
      console.error('❌ Error caught in onSubmit:', error);

      // Stop AMC workflow if there was an error
      if (this.amcWorkflowActive) {
        console.log('⚠️ [AMC Workflow] Error occurred, stopping workflow');
        this.stopAmcWorkflow();
      }

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

  /**
   * Submit user decision to FlowWise
   */
  async submitDecision(decision: string): Promise<void> {
    if (!this.pendingDecision) {
      console.error('❌ [FlowWise] No pending decision to submit');
      return;
    }

    console.log(`✅ [AMC Workflow] Submitting decision: ${decision} for execution ${this.pendingDecision.executionId}`);

    // Add decision to workflow messages
    if (this.amcWorkflowActive) {
      this.workflowMessages.push({
        type: 'user_decision',
        message: `User selected: ${decision}`,
        timestamp: Date.now(),
        data: { decision, executionId: this.pendingDecision.executionId }
      });
    }

    try {
      const submitted = await this.flowWiseService.submitDecision(this.pendingDecision.executionId, decision);

      if (submitted) {
        this.showDecisionPrompt = false;
        this.pendingDecision = null;
        this.cdr.detectChanges();
      } else {
        console.error('❌ [AMC Workflow] Failed to submit decision');
        alert('Failed to submit decision. Please try again.');
      }
    } catch (error) {
      console.error('❌ [AMC Workflow] Error submitting decision:', error);
      alert('Failed to submit decision. Please try again.');
    }
  }

  stopAmcWorkflow(): void {
    console.log('🛑 [AMC Workflow] Stopping AMC workflow');
    this.amcWorkflowActive = false;
    this.workflowMessages = [];
    this.showDecisionPrompt = false;
    this.pendingDecision = null;
    this.cdr.detectChanges();
  }

}

