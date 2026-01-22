import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { getApiBaseUrl } from '../../services/api-base';

interface GardenConfig {
  serviceType: string;
  gardenName: string;
  serverIp: string;
  serverDomain: string;
  serverPort: number;
  networkType: 'http' | 'https';
  isSnake: boolean;
  tokenSymbol?: string;
  baseToken?: string;
  initialLiquidity?: number;
  stripePaymentIntentId?: string;
}

@Component({
  selector: 'app-dex-garden-wizard',
  templateUrl: './dex-garden-wizard.component.html',
  styleUrls: ['./dex-garden-wizard.component.scss']
})
export class DexGardenWizardComponent implements OnInit {
  // User and wallet
  userEmail: string = '';
  walletBalance: number = 0;
  isLoadingBalance: boolean = false; // Start as false - button enabled by default
  
  // Wizard state
  wizardStep: number = 2; // Step 2: Configuration
  selectedServiceType = {
    type: 'dex',
    icon: '💰',
    name: 'DEX',
    description: 'Decentralized Exchange Garden'
  };
  
  gardenConfig: GardenConfig = {
    serviceType: 'dex',
    gardenName: 'Garden-DEX',
    serverIp: 'localhost',
    serverDomain: 'garden-dex.eden.local',
    serverPort: 3001,
    networkType: 'http',
    isSnake: false,
    tokenSymbol: 'TOKEN',
    baseToken: 'SOL',
    initialLiquidity: 10000,
    stripePaymentIntentId: ''
  };
  
  // Stripe Payment Rail for DEX liquidity
  isProcessingStripePayment: boolean = false;
  stripePaymentError: string | null = null;
  
  isCreating: boolean = false;
  creationError: string | null = null;
  creationSuccess: boolean = false;
  
  private apiUrl = getApiBaseUrl();

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    console.log('[DEX Wizard] Component initialized');
    console.log('[DEX Wizard] Current route:', this.router.url);
    
    // Check for Stripe redirect parameters
    this.route.queryParams.subscribe(params => {
      if (params['dex_liquidity_success'] === 'true' && params['session_id']) {
        const sessionId = params['session_id'];
        console.log(`✅ DEX liquidity payment successful, session: ${sessionId}`);
        this.checkDexLiquiditySession(sessionId);
      }
    });
    
    // Restore state from localStorage
    const savedState = localStorage.getItem('dexGardenWizardState');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        this.gardenConfig = { ...this.gardenConfig, ...state.gardenConfig };
        this.wizardStep = state.wizardStep || 2;
        console.log('✅ Restored DEX garden wizard state from localStorage');
      } catch (err) {
        console.warn('Failed to restore wizard state:', err);
      }
    }
    
    // Get user email
    const googleCredential = localStorage.getItem('googleCredential');
    if (googleCredential) {
      try {
        const payload = JSON.parse(atob(googleCredential.split('.')[1]));
        if (payload.email) {
          this.userEmail = payload.email;
        }
      } catch (err) {
        console.warn('Failed to decode Google credential');
      }
    }
    
    if (!this.userEmail) {
      this.userEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
    }
    
    console.log('[DEX Wizard] User email:', this.userEmail);
    
    // Always load wallet balance (even if user isn't logged in, it will just show 0)
    this.loadWalletBalance();
  }

  loadWalletBalance() {
    // Always allow - use default email if not logged in
    if (!this.userEmail || !this.userEmail.includes('@')) {
      this.userEmail = 'bill.draper.auto@gmail.com';
      console.log('[DEX Wizard] No valid email, using default:', this.userEmail);
    }
    
    console.log('[DEX Wizard] Loading wallet balance for:', this.userEmail);
    this.isLoadingBalance = true;
    this.http.get<{success: boolean, balance?: number, error?: string}>(
      `${this.apiUrl}/api/jsc/balance/${encodeURIComponent(this.userEmail)}`
    ).subscribe({
      next: (response) => {
        this.isLoadingBalance = false;
        if (response.success) {
          this.walletBalance = response.balance || 0;
          console.log('[DEX Wizard] Wallet balance loaded:', this.walletBalance);
        } else {
          this.walletBalance = 0;
          console.warn('[DEX Wizard] Failed to load balance:', response.error);
        }
      },
      error: (err) => {
        this.walletBalance = 0;
        this.isLoadingBalance = false;
        console.error('[DEX Wizard] Error loading balance:', err);
      }
    });
  }

  checkDexLiquiditySession(sessionId: string) {
    if (!sessionId || !sessionId.startsWith('cs_')) {
      this.stripePaymentError = 'Invalid session ID';
      return;
    }
    
    this.http.get<{success: boolean, paymentIntentId?: string, liquidityAmount?: number, error?: string}>(
      `${this.apiUrl}/api/jsc/check-session/${sessionId}`
    ).subscribe({
      next: (response) => {
        if (response.success && response.paymentIntentId) {
          this.gardenConfig.stripePaymentIntentId = response.paymentIntentId;
          if (response.liquidityAmount) {
            this.gardenConfig.initialLiquidity = response.liquidityAmount;
          }
          this.saveState();
          console.log(`✅ DEX liquidity payment confirmed: ${response.paymentIntentId}`);
        } else {
          this.stripePaymentError = response.error || 'Payment verification failed';
        }
      },
      error: (err) => {
        this.stripePaymentError = err.error?.error || 'Failed to verify payment';
      }
    });
  }

  initiateStripeLiquidityPayment() {
    if (!this.gardenConfig.initialLiquidity || this.gardenConfig.initialLiquidity < 10000) {
      this.stripePaymentError = 'Initial liquidity must be at least 10,000 🍎 APPLES';
      return;
    }
    
    // Ensure we have a valid email (use default if not logged in)
    if (!this.userEmail || !this.userEmail.includes('@')) {
      this.userEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
      console.log('[DEX Wizard] Using default email for Stripe payment:', this.userEmail);
    }
    
    // Save state before redirecting
    this.saveState();
    
    this.isProcessingStripePayment = true;
    this.stripePaymentError = null;
    
    // Create Stripe Checkout session for DEX liquidity loading
    this.http.post<{success: boolean, sessionId?: string, url?: string, error?: string}>(
      `${this.apiUrl}/api/dex-liquidity/buy`,
      {
        email: this.userEmail,
        amount: this.gardenConfig.initialLiquidity,
        gardenName: this.gardenConfig.gardenName || 'DEX Garden',
        tokenSymbol: this.gardenConfig.tokenSymbol || 'TOKEN',
        baseToken: this.gardenConfig.baseToken || 'SOL'
      }
    ).subscribe({
      next: (response) => {
        this.isProcessingStripePayment = false;
        if (response.success && response.url) {
          if (response.sessionId) {
            // Store session ID temporarily
            localStorage.setItem('dexLiquiditySessionId', response.sessionId);
          }
          // Redirect to Stripe Checkout
          window.location.href = response.url;
        } else {
          this.stripePaymentError = response.error || 'Failed to create Stripe checkout session';
        }
      },
      error: (err) => {
        this.isProcessingStripePayment = false;
        this.stripePaymentError = err.error?.error || 'Failed to initiate Stripe payment';
      }
    });
  }

  saveState() {
    const state = {
      gardenConfig: this.gardenConfig,
      wizardStep: this.wizardStep
    };
    localStorage.setItem('dexGardenWizardState', JSON.stringify(state));
  }

  goBack() {
    // Navigate back to main app
    this.router.navigate(['/']);
  }

  hasSufficientBalance(): boolean {
    // No balance requirement - always return true
    return true;
  }

  hasSelectedProviders(): boolean {
    // DEX gardens don't require providers
    return true;
  }

  createGarden() {
    // Ensure we have a valid email (use default if not logged in)
    if (!this.userEmail || !this.userEmail.includes('@')) {
      this.userEmail = localStorage.getItem('userEmail') || 'bill.draper.auto@gmail.com';
      console.log('[DEX Wizard] Using default email for garden creation:', this.userEmail);
    }
    
    // Set default initial liquidity if not set
    if (!this.gardenConfig.initialLiquidity || this.gardenConfig.initialLiquidity < 10000) {
      this.gardenConfig.initialLiquidity = 10000;
      console.log('[DEX Wizard] Setting default initial liquidity to 10,000 🍎 APPLES');
    }
    
    // Create the garden - no Stripe payment requirement
    this.isCreating = true;
    this.creationError = null;
    
    console.log('[DEX Wizard] Creating garden with email:', this.userEmail);
    
    // Prepare request data - backend expects 'email' not 'ownerEmail'
    const requestData = {
      ...this.gardenConfig,
      email: this.userEmail  // Backend expects 'email' field
    };
    
    console.log('[DEX Wizard] Request data:', requestData);
    
    this.http.post<{success: boolean, garden?: any, balance?: number, error?: string}>(
      `${this.apiUrl}/api/dex-gardens/create`,
      requestData
    ).subscribe({
      next: (response) => {
        this.isCreating = false;
        if (response.success) {
          this.creationSuccess = true;
          this.walletBalance = response.balance || this.walletBalance;
          // Clear saved state
          localStorage.removeItem('dexGardenWizardState');
          // Redirect back to main app after 2 seconds
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 2000);
        } else {
          this.creationError = response.error || 'Failed to create DEX garden';
          console.error('[DEX Wizard] Creation failed:', response.error);
        }
      },
      error: (err) => {
        this.isCreating = false;
        console.error('[DEX Wizard] HTTP error:', err);
        // Try to extract error message from response
        let errorMessage = 'Failed to create DEX garden';
        if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.error) {
            errorMessage = err.error.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        this.creationError = errorMessage;
        console.error('[DEX Wizard] Error message:', errorMessage);
      }
    });
  }
}

