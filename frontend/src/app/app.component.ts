import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from './services/websocket.service';
import { ChatService } from './services/chat.service';

export interface ServiceProvider {
  id: string;
  name: string;
  serviceType: string;
  location: string;
  bond: number;
  reputation: number;
  indexerId: string;
  status: string;
  // Snake Service Fields
  // Note: Snake is a SERVICE TYPE (serviceType: "snake"), not a provider type
  // Each Snake service belongs to an indexer (indexerId)
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
      sampleQuery: 'I need brake pads for a 2020 Toyota Camry at the best price'
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
  
  // Snake (Advertising) Service Providers
  snakeProviders: ServiceProvider[] = [];
  isLoadingSnakeProviders: boolean = false;
  
  // Stripe payment processing
  isProcessingStripe: boolean = false;
  isProcessingIndexer: boolean = false;
  
  // Wallet balance
  walletBalance: number = 0;
  isLoadingBalance: boolean = false;
  isGoogleSignedIn: boolean = false;
  
  private apiUrl = window.location.port === '4200' 
    ? 'http://localhost:3000' 
    : '';
  
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
    
    const indexerSuccess = urlParams.get('indexer_success');
    const indexerCanceled = urlParams.get('indexer_canceled');
    
    if ((jscSuccess === 'true' || indexerSuccess === 'true') && sessionId) {
      console.log(`✅ Stripe payment successful! Session ID: ${sessionId}`);
      // Clear URL parameters to prevent re-triggering
      window.history.replaceState({}, document.title, window.location.pathname);
      // Clear any input that might trigger auto-submit
      this.userInput = '';
      this.selectedServiceType = null;
      this.inputPlaceholder = 'Select a service type above or type your query...';
      
      // Check session status and process payment/indexer registration (fallback for local dev)
      this.checkStripeSession(sessionId, indexerSuccess === 'true');
    } else if (jscCanceled === 'true' || indexerCanceled === 'true') {
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
    
    // Load services from ROOT CA ServiceRegistry (Garden of Eden Main Street)
    this.loadServices();
    // Load Snake providers separately
    this.loadSnakeProviders();
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
    // Note: Mocked service types (airline, autoparts, hotel, restaurant) are always shown
    this.isLoadingServices = true;
    this.http.get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry`)
      .subscribe({
        next: (response) => {
          if (response.success && response.providers) {
            const availableTypes = new Set(response.providers.filter(p => p.status === 'active').map(p => p.serviceType));
            // Mocked service types that should always be shown
            const mockedTypes = new Set(['airline', 'autoparts', 'hotel', 'restaurant']);
            
            // Filter service types: show mocked ones always, or real ones if available in registry
            this.serviceTypes = this.serviceTypes.filter(st => 
              mockedTypes.has(st.type) || availableTypes.has(st.type)
            );
            console.log(`✅ Loaded service types: ${this.serviceTypes.map(st => st.type).join(', ')}`);
            console.log(`   Real providers: ${Array.from(availableTypes).join(', ')}`);
            console.log(`   Mocked types: ${Array.from(mockedTypes).join(', ')}`);
          }
          this.isLoadingServices = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Failed to load services:', err);
          // Keep all service types (including mocked ones) even if API fails
          console.log(`✅ Using all service types (including mocked): ${this.serviceTypes.map(st => st.type).join(', ')}`);
          this.isLoadingServices = false;
          this.cdr.detectChanges();
        }
      });
  }
  
  loadSnakeProviders() {
    // Query ROOT CA ServiceRegistry for Snake services
    // Snake is a service type (serviceType: "snake"), each belongs to an indexer
    this.isLoadingSnakeProviders = true;
    this.http.get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry?serviceType=snake`)
      .subscribe({
        next: (response) => {
          if (response.success && response.providers) {
            this.snakeProviders = response.providers.filter(p => p.status === 'active');
            console.log(`🐍 Loaded ${this.snakeProviders.length} Snake services:`, this.snakeProviders.map(p => `${p.name} (indexer: ${p.indexerId})`).join(', '));
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
  
  checkStripeSession(sessionId: string, isIndexerPurchase: boolean = false) {
    console.log(`🔍 Checking Stripe session status: ${sessionId} (indexer purchase: ${isIndexerPurchase})`);
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
            console.log(`✅ Indexer registered: ${response.indexerId || response.indexerName}`);
            this.walletBalance = response.balance || 0;
            this.isProcessingIndexer = false;
            alert(`✅ Movie indexer installed successfully!\nIndexer: ${response.indexerId || response.indexerName}\nBalance: ${response.balance} JSC`);
            // Refresh indexer list (sidebar will auto-update via WebSocket)
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
    
    this.isProcessingIndexer = true;
    
    // First check wallet balance
    if (this.walletBalance >= amount) {
      // User has enough balance - purchase directly from wallet
      console.log(`💰 Purchasing indexer from wallet balance: ${this.walletBalance} JSC`);
      this.http.post<{success: boolean, indexerId?: string, indexerName?: string, balance?: number, error?: string}>(
        `${this.apiUrl}/api/indexer/purchase`,
        { email: this.userEmail, amount: amount, indexerType: 'movie' }
      ).subscribe({
        next: (response) => {
          if (response.success) {
            console.log(`✅ Indexer purchased from wallet: ${response.indexerId || response.indexerName}`);
            this.walletBalance = response.balance || this.walletBalance - amount;
            this.isProcessingIndexer = false;
            alert(`✅ Movie indexer installed successfully!\nIndexer: ${response.indexerId || response.indexerName}\nRemaining balance: ${response.balance} JSC`);
            this.cdr.detectChanges();
          } else {
            alert(`Failed to purchase indexer: ${response.error || 'Unknown error'}`);
            this.isProcessingIndexer = false;
          }
        },
        error: (err) => {
          console.error('Error purchasing indexer from wallet:', err);
          alert(`Error: ${err.error?.error || err.message || 'Failed to purchase indexer'}`);
          this.isProcessingIndexer = false;
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
            this.isProcessingIndexer = false;
          }
        },
        error: (err) => {
          console.error('Error creating Stripe checkout for indexer:', err);
          alert(`Error: ${err.error?.error || err.message || 'Failed to create Stripe checkout'}`);
          this.isProcessingIndexer = false;
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

