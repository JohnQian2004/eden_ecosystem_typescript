import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { timeout, finalize } from 'rxjs/operators';
import { filter } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { WebSocketService } from './services/websocket.service';
import { ChatService } from './services/chat.service';
import { FlowWiseService, UserDecisionRequest } from './services/flowwise.service';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { CertificateDisplayComponent } from './components/certificate-display/certificate-display.component';
import { SystemConfigComponent } from './components/system-config/system-config.component';
import { getApiBaseUrl } from './services/api-base';
import { IdentityService } from './services/identity.service';
import { EdenUser } from './models/identity.models';
import { SERVICE_TYPE_CATALOG, getCatalogEntry as getCatalogEntryFromService, getServiceTypeIcon as getServiceTypeIconFromService } from './services/service-type-catalog.service';
import { CacheInterceptor } from './services/cache.interceptor';

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
  ownerEmail?: string; // Some providers include ownerEmail (esp. garden-generated providers)
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
  theme: 'dark' | 'light' = 'dark';
  userInput: string = '';
  isProcessing: boolean = false;
  userEmail: string = ''; // Will be set from localStorage or default
  showSignInModal: boolean = false; // Control modal visibility
  showStripePaymentModal: boolean = false; // Control Stripe Payment Rail modal visibility
  showPopupChat: boolean = false; // Control popup chat visibility
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
  // Populated dynamically from SERVICE_TYPE_CATALOG based on available providers
  serviceTypes: Array<{type: string, icon: string, adText: string, sampleQuery: string, providerCount?: number, ownerEmails?: string[]}> = [];
  
  // NEW: Configurable sample input (can be set via environment or config)
  // This replaces pre-canned prompts - users can type naturally or use this as a starting point
  configurableSampleInput: string = "I want two sci-fi movies tonight at best price in white marsh";

  // Full catalog (NOT filtered by live ServiceRegistry). Used for icons/prompts even if a garden has 0 providers.
  // Now imported from shared service-type-catalog.service.ts
  private readonly SERVICE_TYPE_CATALOG_REF = SERVICE_TYPE_CATALOG;

  private getCatalogEntry(serviceType?: string): {type: string, icon: string, adText: string, sampleQuery: string} | undefined {
    return getCatalogEntryFromService(serviceType);
  }

  getGardenCardStyle(serviceType?: string): { [k: string]: string } {
    const st = String(serviceType || '').toLowerCase().trim();
    // Dark-theme friendly tints; keep subtle to preserve readability.
    const palette: Record<string, { bg: string; border: string }> = {
      movie: { bg: 'rgba(56, 139, 253, 0.16)', border: 'rgba(56, 139, 253, 0.35)' }, // blue
      dex: { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.35)' }, // green
      airline: { bg: 'rgba(14, 165, 233, 0.12)', border: 'rgba(14, 165, 233, 0.35)' }, // sky
      autoparts: { bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.35)' }, // orange
      hotel: { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.35)' }, // purple
      restaurant: { bg: 'rgba(34, 197, 94, 0.10)', border: 'rgba(34, 197, 94, 0.30)' }, // green-lite
      grocerystore: { bg: 'rgba(132, 204, 22, 0.10)', border: 'rgba(132, 204, 22, 0.30)' }, // lime
      pharmacy: { bg: 'rgba(244, 63, 94, 0.10)', border: 'rgba(244, 63, 94, 0.30)' }, // rose
      dogpark: { bg: 'rgba(234, 179, 8, 0.10)', border: 'rgba(234, 179, 8, 0.30)' }, // amber
      gasstation: { bg: 'rgba(239, 68, 68, 0.10)', border: 'rgba(239, 68, 68, 0.30)' }, // red
      party: { bg: 'rgba(236, 72, 153, 0.10)', border: 'rgba(236, 72, 153, 0.30)' }, // pink
      bank: { bg: 'rgba(148, 163, 184, 0.10)', border: 'rgba(148, 163, 184, 0.30)' } // slate
    };

    const p = palette[st] || { bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.20)' };
    return {
      backgroundColor: p.bg,
      border: `1px solid ${p.border}`
    };
  }

  // Main Street grouping (matches architecture split: 🍎 Apple SaaS vs 💰 DEX)
  // Apple main street is garden-driven (like DEX): each garden is its own card.
  appleGardens: Array<{id: string, name: string, active: boolean, uuid?: string, ownerEmail?: string, serviceType?: string, isSnake?: boolean}> = [];
  selectedAppleGarden: {id: string, name: string} | null = null;
  isLoadingAppleGardens: boolean = false;
  // DEX main street is garden-driven (not service-type driven)
  dexGardens: Array<{
    id: string;
    name: string;
    active: boolean;
    uuid?: string;
    ownerEmail?: string;
    type?: string;
    initialLiquidity?: number;
    currentLiquidity?: number;
    liquidityCertified?: boolean;
    stripePaymentRailBound?: boolean;
    baseToken?: string;
    tokenSymbol?: string;
    totalTrades?: number;
    totalVolume?: number;
  }> = [];
  selectedDexGarden: {id: string, name: string} | null = null;

  // Data-driven counts from ServiceRegistry (group-by filter)
  // - serviceType -> provider count
  providerCountsByServiceType: Record<string, number> = {};
  // - gardenId -> provider count
  providerCountsByGardenId: Record<string, number> = {};
  // - serviceType -> unique owner emails
  providerOwnersByServiceType: Record<string, string[]> = {};
  // - gardenId -> unique owner emails
  providerOwnersByGardenId: Record<string, string[]> = {};

  getServiceTypeIcon(serviceType?: string): string {
    return getServiceTypeIconFromService(serviceType);
  }

  formatOwnerEmails(emails: string[] | undefined): string {
    const list = (emails || []).filter(Boolean);
    if (list.length === 0) return 'N/A';
    if (list.length === 1) return list[0];
    return `${list[0]} (+${list.length - 1})`;
  }

  formatOwnerEmailsAll(emails: string[] | undefined): string {
    const list = (emails || []).filter(Boolean);
    if (list.length === 0) return 'N/A';
    return list.join(', ');
  }

  getOwnersForServiceType(serviceType: string): string[] {
    // IMPORTANT: return a stable array reference (no .slice()) so Angular doesn't thrash DOM on every change-detection.
    const key = String(serviceType || '').toLowerCase();
    return this.providerOwnersByServiceType[key] || [];
  }

  getOwnersForDexGarden(gardenId: string, fallbackOwnerEmail?: string): string[] {
    // IMPORTANT: return a stable array reference when possible to keep UI responsive.
    const gid = String(gardenId || '');
    const owners = this.providerOwnersByGardenId[gid] || [];
    const fb = String(fallbackOwnerEmail || '').trim().toLowerCase();
    if (owners.length === 0 && fb) return [fb];
    return owners;
  }

  trackByServiceType(index: number, st: { type: string }): string {
    return st?.type || String(index);
  }

  trackByGardenId(index: number, g: { id: string }): string {
    return g?.id || String(index);
  }

  trackByEmail(index: number, email: string): string {
    return email || String(index);
  }
  
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
  activeTab: 'workflow' | 'workflow2' | 'workflow-chat' | 'ledger' | 'ledger-cards' | 'certificates' | 'chat' | 'config' | 'governance' | 'god-inbox' = 'workflow';
  isLoadingBalance: boolean = false;
  isGoogleSignedIn: boolean = false;
  private walletBalanceRefreshTimer: any = null;
  private servicesRefreshTimer: any = null;
  private gardensRefreshTimer: any = null;
  private dexGardensRefreshTimer: any = null;
  
  // Cached sign-in state to prevent duplicate renders
  // Initialize from localStorage immediately to avoid template rendering issues
  private _isUserSignedIn: boolean = (() => {
    const savedEmail = typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null;
    return !!(savedEmail && savedEmail.trim() !== '');
  })();
  
  // Render key to force component recreation and prevent duplication
  renderKey: string = `render-${Date.now()}`;
  
  // Flag to prevent duplicate renders during sign out
  private isSigningOut: boolean = false;
  
  // Helper getter to check if user is actually signed in (has saved email in localStorage)
  get isUserSignedIn(): boolean {
    return this._isUserSignedIn;
  }
  
  // Update sign-in state (call this when localStorage changes)
  private updateSignInState(): void {
    const savedEmail = localStorage.getItem('userEmail');
    this._isUserSignedIn = !!savedEmail && savedEmail.trim() !== '';
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

  // Username Registration
  showUsernameRegistration: boolean = false;
  currentEdenUser: EdenUser | null = null;
  googleUserIdForRegistration: string = '';
  emailForRegistration: string = '';
  isCheckingUsername: boolean = false;

  // Username cache for garden owners (email -> username)
  ownerUsernameCache: Map<string, string> = new Map();
  private pendingUsernameResolutions = new Map<string, Promise<string | null>>();

  // Global UX: full-screen loading overlay (especially useful in GOD mode boot)
  private viewTransitionUntilMs: number = 0;

  get isGlobalLoading(): boolean {
    // Signed-out users should never be blocked by the full-screen loading overlay.
    // They should still see Main Street + Sign In prompt instantly.
    if (!this.isUserSignedIn) return false;

    const now = Date.now();
    const inViewTransition = now < this.viewTransitionUntilMs;
    return (
      inViewTransition ||
      this.isProcessingGarden ||
      this.isProcessingStripe ||
      this.isLoadingBalance ||
      this.isLoadingServices ||
      this.isLoadingGardens ||
      this.isLoadingApplications ||
      this.isLoadingSnakeProviders
    );
  }

  get globalLoadingMessage(): string {
    if (this.isProcessingStripe) return 'Processing payment rail...';
    if (this.isProcessingGarden) return 'Processing garden request...';
    if (this.isLoadingServices) return 'Loading Service Registry...';
    if (this.isLoadingGardens) return 'Loading Gardens...';
    if (this.isLoadingApplications) return 'Loading Priesthood...';
    if (this.isLoadingBalance) return 'Loading wallet balance...';
    return 'Loading...';
  }
  
  private apiUrl = getApiBaseUrl();

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
    // Reduced transition time to prevent blocking
    this.viewTransitionUntilMs = Date.now() + 300; // Reduced from 800ms to 300ms
    // CRITICAL: Trigger change detection so shouldShowAppComponent getter is re-evaluated
    this.cdr.markForCheck();
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

  // Check if app.component content should be shown (GOD/priest mode and signed in)
  get shouldShowAppComponent(): boolean {
    // Read directly from localStorage to ensure we get the latest value
    // Use a try-catch to handle cases where localStorage might not be available
    let mode: 'god' | 'priest' | 'user' = 'user';
    try {
      mode = (localStorage.getItem('edenViewMode') as 'god' | 'priest' | 'user') || 'user';
    } catch (e) {
      mode = 'user';
    }
    const signedIn = this.isUserSignedIn;
    const shouldShow = (mode === 'god' || mode === 'priest') && signedIn;
    // Update internal state to keep it in sync
    if (this._currentViewMode !== mode) {
      this._currentViewMode = mode;
    }
    return shouldShow;
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
      // CRITICAL: Use setViewMode to ensure _currentViewMode is updated
      this.setViewMode(this.selectedAdminMode);
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
    // Sidebar is shown for all signed-in users (USER, PRIEST, and GOD modes)
    // Chat history is always visible, System Architecture only for admins
    const viewMode = this.currentViewMode;
    this.showSidebar = this.isUserSignedIn; // Show sidebar for all signed-in users
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

  isDexWizardRoute: boolean = false;

  constructor(
    public wsService: WebSocketService,
    private chatService: ChatService,
    private flowWiseService: FlowWiseService,
    private cdr: ChangeDetectorRef,
    private http: HttpClient,
    private router: Router,
    private identityService: IdentityService
  ) {
    // Track route changes to hide main content when on DEX wizard
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const url = event.urlAfterRedirects || event.url;
      this.isDexWizardRoute = url === '/dex-garden-wizard' || url.startsWith('/dex-garden-wizard');
      console.log('[AppComponent] Route changed:', url, 'isDexWizardRoute:', this.isDexWizardRoute);
      this.cdr.detectChanges();
    });
    
    // Check initial route
    const currentUrl = this.router.url;
    this.isDexWizardRoute = currentUrl === '/dex-garden-wizard' || currentUrl.startsWith('/dex-garden-wizard');
    console.log('[AppComponent] Initial route:', currentUrl, 'isDexWizardRoute:', this.isDexWizardRoute);}

  // AMC Workflow Integration
  amcWorkflowActive: boolean = false;
  workflowMessages: any[] = [];
  private activeWorkflowExecutionId: string | null = null;
  private workflowMessagesRaf: number | null = null;
  debugWebsocketEvents: boolean = false;
  private onEdenSendEvt: any = null;

  // -----------------------------
  // Garden/Service Chat History
  // -----------------------------
  activeConversationId: string | null = null;
  chatHistoryMessages: Array<{ id?: string; role: 'USER' | 'ASSISTANT' | 'SYSTEM'; content: string; timestamp: number; userEmail?: string; videoUrl?: string; movieTitle?: string }> = [];
  isLoadingChatHistory: boolean = false;
  private chatHistoryLoadSeq: number = 0;
  private lastAppendBySig: Map<string, number> = new Map();
  private conversationIdByExecutionId = new Map<string, string>();
  private chatHistoryClearedAt: number = 0; // Timestamp when chat history was last cleared
  private readonly MAX_CHAT_HISTORY_MESSAGES = 200; // UI render cap (history is still persisted on server)
  private readonly CHAT_HISTORY_CLEAR_COOLDOWN = 1000; // Ignore messages for 1 second after clearing

  private buildConversationId(scope: 'garden' | 'service', id: string): string {
    const mode = (this.currentViewMode || 'user').toLowerCase();
    const safeId = String(id || '').trim().replace(/\s+/g, '-');
    return `conv:${scope}:${safeId}:${mode}`;
  }

  private setActiveConversation(conversationId: string) {
    if (!conversationId) return;
    if (this.activeConversationId === conversationId) return;
    // Cancel any in-flight history load so the spinner can't get stuck during rapid switching.
    this.stopChatHistoryLoading();

    this.activeConversationId = conversationId;
    // Make UI feel instant: clear immediately, then async load.
    this.chatHistoryMessages = [];
    this.isLoadingChatHistory = true;
    this.lastAppendBySig.clear();
    this.chatHistoryClearedAt = 0; // Reset cleared timestamp when switching conversations
    this.cdr.detectChanges();
    // Load chat history asynchronously - don't block UI
    setTimeout(() => this.loadChatHistory(), 0);
  }

  loadChatHistory(limit: number = 50) {
    if (!this.activeConversationId) {
      this.isLoadingChatHistory = false;
      this.cdr.detectChanges();
      return;
    }
    
    // Don't reload if we just cleared (within cooldown period)
    const timeSinceClear = Date.now() - this.chatHistoryClearedAt;
    if (timeSinceClear < this.CHAT_HISTORY_CLEAR_COOLDOWN) {
      console.log(`🚫 [App] Preventing loadChatHistory - chat history was just cleared ${timeSinceClear}ms ago`);
      this.isLoadingChatHistory = false;
      this.cdr.detectChanges();
      return;
    }
    
    const cid = this.activeConversationId;
    const seq = ++this.chatHistoryLoadSeq;
    this.isLoadingChatHistory = true;
    
    // Use a smaller limit for faster loading - only load recent messages
    const optimizedLimit = Math.min(limit, 30);
    const url = `${this.apiUrl}/api/chat-history/history?conversationId=${encodeURIComponent(cid)}&limit=${encodeURIComponent(String(optimizedLimit))}`;
    
    console.log(`[App] Loading chat history: ${cid}, limit: ${optimizedLimit}`);
    const startTime = Date.now();
    
    this.http.get<{ success: boolean; messages?: any[] }>(url)
      .pipe(
        // Reduced timeout for faster failure detection
        timeout(5000),
        finalize(() => {
          const loadTime = Date.now() - startTime;
          if (loadTime > 100) {
            console.log(`[App] Chat history load took ${loadTime}ms`);
          }
          // Only clear loading for the latest active request
          if (seq !== this.chatHistoryLoadSeq || this.activeConversationId !== cid) return;
          this.isLoadingChatHistory = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (resp) => {
          const loadTime = Date.now() - startTime;
          console.log(`[App] Chat history loaded in ${loadTime}ms, messages: ${(resp.messages || []).length}`);
          
          // Ignore stale responses (switching conversations quickly)
          if (seq !== this.chatHistoryLoadSeq || this.activeConversationId !== cid) return;
          
          // Don't reload if we just cleared (within cooldown period)
          const timeSinceClear = Date.now() - this.chatHistoryClearedAt;
          if (timeSinceClear < this.CHAT_HISTORY_CLEAR_COOLDOWN) {
            console.log(`🚫 [App] Ignoring loadChatHistory response - chat history was just cleared ${timeSinceClear}ms ago`);
            return;
          }
          
          const serverMessages = (resp.messages || []).map((m: any) => ({
          id: m.id,
          role: (m.role || 'SYSTEM') as 'USER' | 'ASSISTANT' | 'SYSTEM',
          content: m.content,
          timestamp: m.timestamp || Date.now(),
          userEmail: m.userEmail
        }));

        // Merge: don't clobber optimistic UI appends that may have happened while this request was in-flight.
        const optimistic = (this.chatHistoryMessages || []).filter(m => !(m as any).id);
        const merged = [...serverMessages, ...optimistic];
        const seen = new Set<string>();
        const deduped = merged.filter((m) => {
          const key = (m as any).id
            ? `id:${(m as any).id}`
            : `k:${m.role}|${m.userEmail || ''}|${m.content}|${Math.floor((m.timestamp || 0) / 1000)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Keep UI responsive: only render the last N messages.
        this.chatHistoryMessages =
          deduped.length > this.MAX_CHAT_HISTORY_MESSAGES
            ? deduped.slice(-this.MAX_CHAT_HISTORY_MESSAGES)
            : deduped;

        this.cdr.detectChanges();
        },
        error: (err) => {
          if (seq !== this.chatHistoryLoadSeq || this.activeConversationId !== cid) return;
          console.error('Failed to load chat history:', err);
          // finalize() will clear isLoadingChatHistory
        }
      });
  }

  stopChatHistoryLoading() {
    // Cancels the current request *logically* (ignores response) and clears the spinner.
    this.chatHistoryLoadSeq++;
    this.isLoadingChatHistory = false;
    this.cdr.detectChanges();
  }

  async clearChatHistoryPanel() {
    console.log(`🗑️ [App] clearChatHistoryPanel called, activeConversationId: ${this.activeConversationId}`);
    
    // Set flag to prevent messages from being re-added immediately after clearing
    this.chatHistoryClearedAt = Date.now();
    
    // Cancel any in-flight load FIRST to prevent reloading
    this.chatHistoryLoadSeq++; // cancel any in-flight load
    
    // Clear both UI cache and persisted history
    if (!this.activeConversationId) {
      // No active conversation, just clear UI
      console.log(`🗑️ [App] No active conversation, clearing UI only`);
      // Use splice to ensure Angular detects the change
      this.chatHistoryMessages.splice(0, this.chatHistoryMessages.length);
      this.isLoadingChatHistory = false;
      this.lastAppendBySig.clear();
      this.cdr.markForCheck();
      this.cdr.detectChanges();
      console.log(`✅ [App] UI cache cleared (no conversation), messages count: ${this.chatHistoryMessages.length}`);
      return;
    }

    // Clear UI cache IMMEDIATELY (before server delete) so user sees instant feedback
    console.log(`🗑️ [App] Clearing UI cache immediately, current messages count: ${this.chatHistoryMessages.length}`);
    // Use splice to ensure Angular detects the change
    this.chatHistoryMessages.splice(0, this.chatHistoryMessages.length);
    this.isLoadingChatHistory = false;
    this.lastAppendBySig.clear();
    this.cdr.markForCheck();
    this.cdr.detectChanges();
    console.log(`✅ [App] UI cache cleared, messages count: ${this.chatHistoryMessages.length}`);

    // Delete persisted history from server (async, but UI is already cleared)
    try {
      console.log(`🗑️ [App] Deleting persisted history for conversation: ${this.activeConversationId}`);
      const response = await this.http.request<any>('DELETE', `${this.apiUrl}/api/chat-history/delete`, {
        body: JSON.stringify({ conversationId: this.activeConversationId }),
        headers: { 'Content-Type': 'application/json' }
      }).toPromise();
      
      console.log(`🗑️ [App] Delete response:`, response);
      
      if (response && response.success) {
        console.log(`✅ [App] Chat history deleted for conversation: ${this.activeConversationId}`);
      } else {
        console.warn(`⚠️ [App] Failed to delete persisted history:`, response?.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error(`❌ [App] Error deleting persisted chat history:`, error);
      // Continue - UI is already cleared
    }
  }

  private appendChatHistory(role: 'USER' | 'ASSISTANT' | 'SYSTEM', content: string, extra?: any, conversationIdOverride?: string) {
    const targetConversationId = conversationIdOverride || this.activeConversationId;
    if (!targetConversationId) return;
    const trimmed = String(content || '').trim();
    if (!trimmed) return;

    // Ignore messages added shortly after clearing (prevent re-adding from delayed WebSocket events)
    const timeSinceClear = Date.now() - this.chatHistoryClearedAt;
    if (timeSinceClear < this.CHAT_HISTORY_CLEAR_COOLDOWN && targetConversationId === this.activeConversationId) {
      console.log(`🚫 [App] Ignoring message append - chat history was just cleared ${timeSinceClear}ms ago`);
      return;
    }

    // Dedupe only for non-USER messages (USER should always append, even if repeated)
    const sig = `${role}|${targetConversationId}|${trimmed}`;
    if (role !== 'USER') {
      const lastAt = this.lastAppendBySig.get(sig);
      if (lastAt && Date.now() - lastAt < 2000) return;
      this.lastAppendBySig.set(sig, Date.now());
    }

    // optimistic UI
    // IMPORTANT: generate a client id and send it to the server so the WebSocket echo can be deduped.
    const clientId = `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const clientTs = Date.now();
    const local = { 
      id: clientId, 
      role, 
      content: trimmed, 
      timestamp: clientTs, 
      userEmail: this.userEmail,
      videoUrl: extra?.videoUrl,
      movieTitle: extra?.movieTitle
    };
    
    if (extra?.videoUrl) {
      console.log('🎬 [App] appendChatHistory - Adding message with videoUrl:', {
        videoUrl: extra.videoUrl,
        movieTitle: extra.movieTitle,
        content: trimmed.substring(0, 100),
        role: role
      });
    }
    
    if (this.activeConversationId === targetConversationId) {
      const next = [...this.chatHistoryMessages, local];
      this.chatHistoryMessages =
        next.length > this.MAX_CHAT_HISTORY_MESSAGES ? next.slice(-this.MAX_CHAT_HISTORY_MESSAGES) : next;
    }
    this.cdr.detectChanges();

    this.http.post<{ success: boolean; message?: any }>(`${this.apiUrl}/api/chat-history/append`, {
      conversationId: targetConversationId,
      id: clientId,
      role,
      content: trimmed,
      timestamp: clientTs,
      userEmail: this.userEmail,
      mode: this.currentViewMode,
      ...extra
    }).subscribe({
      next: () => {},
      error: (err) => console.error('Failed to append chat history:', err)
    });
  }

  ngOnInit() {
    // Initialize sign-in state from localStorage
    this.updateSignInState();
    
    // SAFEGUARD: Reset any stuck loading flags after 5 seconds to prevent infinite loading
    setTimeout(() => {
      if (this.isLoadingServices) {
        console.warn('⚠️ [AppComponent] isLoadingServices stuck, resetting...');
        this.isLoadingServices = false;
      }
      if (this.isLoadingGardens) {
        console.warn('⚠️ [AppComponent] isLoadingGardens stuck, resetting...');
        this.isLoadingGardens = false;
      }
      if (this.isLoadingBalance) {
        console.warn('⚠️ [AppComponent] isLoadingBalance stuck, resetting...');
        this.isLoadingBalance = false;
      }
      if (this.isLoadingApplications) {
        console.warn('⚠️ [AppComponent] isLoadingApplications stuck, resetting...');
        this.isLoadingApplications = false;
      }
      if (this.isLoadingSnakeProviders) {
        console.warn('⚠️ [AppComponent] isLoadingSnakeProviders stuck, resetting...');
        this.isLoadingSnakeProviders = false;
      }
      // Reset view transition if it's been too long
      if (this.viewTransitionUntilMs > 0 && Date.now() > this.viewTransitionUntilMs + 2000) {
        console.warn('⚠️ [AppComponent] viewTransition stuck, resetting...');
        this.viewTransitionUntilMs = 0;
      }
      this.cdr.markForCheck();
    }, 5000); // 5 seconds - reduced from 10
    // Check initial route for DEX wizard - check multiple times to catch route initialization
    const checkRoute = () => {
      const routerUrl = this.router.url || '';
      const locationUrl = typeof window !== 'undefined' ? window.location.pathname : '';
      const currentUrl = routerUrl || locationUrl;
      this.isDexWizardRoute = currentUrl === '/dex-garden-wizard' || currentUrl.startsWith('/dex-garden-wizard');
      console.log('[AppComponent] ngOnInit - Route check:', { routerUrl, locationUrl, currentUrl, isDexWizardRoute: this.isDexWizardRoute });
      // Use markForCheck instead of detectChanges to prevent duplicate renders
      this.cdr.markForCheck();
    };
    
    // Check immediately
    checkRoute();
    // Check after router initializes (Angular router might not be ready immediately)
    setTimeout(checkRoute, 0);
    setTimeout(checkRoute, 100);
    setTimeout(checkRoute, 500);
    
    this.initTheme();
    // Debug toggle (keeps UI responsive by default)
    this.debugWebsocketEvents = String(localStorage.getItem('edenDebugWsEvents') || '').toLowerCase() === 'true';

    // Subscribe to FlowWise decision requests
    console.log('🔌 [App] ========================================');
    console.log('🔌 [App] Subscribing to FlowWise decision requests');
    console.log('🔌 [App] flowWiseService:', this.flowWiseService);
    console.log('🔌 [App] getDecisionRequests():', this.flowWiseService.getDecisionRequests());
    const subscription = this.flowWiseService.getDecisionRequests().subscribe((decisionRequest: UserDecisionRequest) => {
      console.log('🔌 [App] Subscription callback triggered!');
      console.log('🤔 [App] ========================================');
      console.log('🤔 [App] ⚠️⚠️⚠️ DECISION REQUEST RECEIVED ⚠️⚠️⚠️');
      console.log('🤔 [App] Decision required:', JSON.stringify(decisionRequest, null, 2));
      console.log('🤔 [App] Decision request videoUrl:', decisionRequest.videoUrl || 'none');
      console.log('🤔 [App] Decision request movieTitle:', decisionRequest.movieTitle || 'none');
      console.log('🤔 [App] Decision request options count:', decisionRequest.options?.length || 0);
      console.log('🤔 [App] Decision request stepId:', decisionRequest.stepId);
      console.log('🤔 [App] Decision request executionId:', decisionRequest.executionId);
      
      this.pendingDecision = decisionRequest;
      this.showDecisionPrompt = true;
      
      console.log('🤔 [App] Set pendingDecision and showDecisionPrompt = true');
      console.log('🤔 [App] pendingDecision after assignment:', this.pendingDecision ? {
        executionId: this.pendingDecision.executionId,
        stepId: this.pendingDecision.stepId,
        hasVideoUrl: !!this.pendingDecision.videoUrl,
        videoUrl: this.pendingDecision.videoUrl,
        hasMovieTitle: !!this.pendingDecision.movieTitle,
        movieTitle: this.pendingDecision.movieTitle,
        optionsCount: this.pendingDecision.options?.length || 0
      } : 'null');
      console.log('🤔 [App] showDecisionPrompt:', this.showDecisionPrompt);
      
      this.cdr.detectChanges();
      console.log('🤔 [App] ✅ Change detection triggered');
      console.log('🤔 [App] ========================================');
    });
    console.log('🔌 [App] Subscription created successfully');
    console.log('🔌 [App] ========================================');

    // Subscribe to WebSocket events for workflow updates
    console.log('🔌 [App] Setting up WebSocket subscription in app.component.ts');
    this.wsService.events$.subscribe((event: SimulatorEvent) => {
      // CRITICAL DEBUG: Log ALL llm_response events immediately when received
      if (event.type === 'llm_response') {
        console.log('🎬 [App] ========================================');
        console.log('🎬 [App] ⚠️⚠️⚠️ llm_response event received in app.component.ts WebSocket subscription ⚠️⚠️⚠️');
        console.log('🎬 [App] Event type:', event.type);
        console.log('🎬 [App] Event data:', (event as any).data);
        console.log('🎬 [App] Event data.stepId:', (event as any).data?.stepId);
        console.log('🎬 [App] Event data.response.videoUrl:', (event as any).data?.response?.videoUrl);
        console.log('🎬 [App] Event data.response.movieTitle:', (event as any).data?.response?.movieTitle);
        console.log('🎬 [App] ========================================');
      }
      
      // Always log user_decision_required events for debugging
      if (event.type === 'user_decision_required') {
        console.log(`📨 [App] ========================================`);
        console.log(`📨 [App] USER_DECISION_REQUIRED EVENT RECEIVED IN APP.COMPONENT!`);
        console.log(`📨 [App] Event type:`, event.type);
        console.log(`📨 [App] Event data:`, event.data);
        console.log(`📨 [App] Event data.videoUrl:`, (event as any).data?.videoUrl);
        console.log(`📨 [App] Event data.movieTitle:`, (event as any).data?.movieTitle);
        console.log(`📨 [App] ========================================`);
      }
      
      // Logging every event (with full payload) can freeze the UI when events are frequent.
      if (this.debugWebsocketEvents) {
        console.log(`📨 [App] Received event: ${event.type}`, event);
      }

      if (this.amcWorkflowActive) {
        // Only show events for the current workflow execution (prevents old executions from re-populating after a new chat).
        const evExecId = (event as any).data?.executionId;
        if (!this.activeWorkflowExecutionId || (evExecId && String(evExecId) === this.activeWorkflowExecutionId)) {
          this.workflowMessages.push(event);
          // Keep bounded to avoid DOM slowdown after long sessions
          if (this.workflowMessages.length > 300) {
            this.workflowMessages = this.workflowMessages.slice(-300);
          }
          // Batch change detection to one paint frame (prevents click starvation)
          if (this.workflowMessagesRaf == null) {
            this.workflowMessagesRaf = requestAnimationFrame(() => {
              this.workflowMessagesRaf = null;
              this.cdr.detectChanges();
            });
          }
        }
      }

      // When a workflow completes, stop streaming events into the UI console.
      if ((event as any).type === 'workflow_completed') {
        this.amcWorkflowActive = false;
        this.activeWorkflowExecutionId = null;
      }

      // Garden-level chat history: append assistant messages from LLM responses
      if (event.type === 'llm_response') {
        // Extract message from multiple possible locations (backend may send it differently)
        const llmMsg =
          (event as any).message ||  // Top-level message (from broadcast)
          (event as any).data?.response?.message ||
          (event as any).data?.message ||
          '';
        const evExecId = (event as any).data?.executionId || (event as any).data?.workflowId;
        const stepId = (event as any).data?.stepId;
        const conv = evExecId ? this.conversationIdByExecutionId.get(String(evExecId)) : null;
        // Extract videoUrl from response data
        const videoUrl = (event as any).data?.response?.videoUrl || 
                        (event as any).data?.response?.selectedListing?.videoUrl ||
                        (event as any).data?.videoUrl;
        const movieTitle = (event as any).data?.response?.movieTitle ||
                          (event as any).data?.response?.selectedListing?.movieTitle ||
                          (event as any).data?.movieTitle;
        
        console.log('🎬 [App] ========================================');
        console.log('🎬 [App] llm_response event received');
        console.log('🎬 [App] event.message:', (event as any).message);
        console.log('🎬 [App] event.data?.message:', (event as any).data?.message);
        console.log('🎬 [App] event.data?.response?.message:', (event as any).data?.response?.message);
        console.log('🎬 [App] hasMessage:', !!llmMsg);
        console.log('🎬 [App] message:', llmMsg?.substring(0, 100));
        console.log('🎬 [App] hasVideoUrl:', !!videoUrl);
        console.log('🎬 [App] videoUrl:', videoUrl);
        console.log('🎬 [App] hasMovieTitle:', !!movieTitle);
        console.log('🎬 [App] movieTitle:', movieTitle);
        console.log('🎬 [App] stepId:', stepId);
        console.log('🎬 [App] executionId:', evExecId);
        console.log('🎬 [App] conversationId from map:', conv);
        console.log('🎬 [App] activeConversationId:', this.activeConversationId);
        console.log('🎬 [App] Full event:', JSON.stringify(event, null, 2));
        console.log('🎬 [App] ========================================');
        
        // CRITICAL: If we have videoUrl and movieTitle, create/update a decision request
        // This ensures the video player appears even if user_decision_required event wasn't received
        // Check for view_movie step OR if videoUrl is present (which indicates movie viewing)
        const isViewMovieStep = stepId === 'view_movie' || (videoUrl && movieTitle);
        if (isViewMovieStep && videoUrl && evExecId) {
          console.log('🎬 [App] ========================================');
          console.log('🎬 [App] view_movie step detected with videoUrl - creating decision request');
          console.log('🎬 [App] stepId:', stepId);
          console.log('🎬 [App] videoUrl:', videoUrl);
          console.log('🎬 [App] movieTitle:', movieTitle);
          console.log('🎬 [App] evExecId:', evExecId);
          console.log('🎬 [App] Current pendingDecision:', this.pendingDecision ? {
            executionId: this.pendingDecision.executionId,
            stepId: this.pendingDecision.stepId,
            hasVideoUrl: !!this.pendingDecision.videoUrl,
            videoUrl: this.pendingDecision.videoUrl
          } : 'null');
          
          // Check if we already have a pending decision for this execution
          if (!this.pendingDecision || this.pendingDecision.executionId !== evExecId) {
            // Create a decision request from the llm_response event
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
            
            console.log('🎬 [App] Created decision request from llm_response:', JSON.stringify(decisionRequest, null, 2));
            console.log('🎬 [App] Decision request videoUrl:', decisionRequest.videoUrl);
            console.log('🎬 [App] Decision request movieTitle:', decisionRequest.movieTitle);
            this.pendingDecision = decisionRequest;
            this.showDecisionPrompt = true;
            console.log('🎬 [App] Set showDecisionPrompt = true');
            console.log('🎬 [App] pendingDecision after assignment:', this.pendingDecision ? {
              executionId: this.pendingDecision.executionId,
              stepId: this.pendingDecision.stepId,
              hasVideoUrl: !!this.pendingDecision.videoUrl,
              videoUrl: this.pendingDecision.videoUrl,
              videoUrlLength: this.pendingDecision.videoUrl?.length || 0
            } : 'null');
            this.cdr.detectChanges();
            console.log('🎬 [App] ✅ Decision prompt shown with video player');
            console.log('🎬 [App] showDecisionPrompt:', this.showDecisionPrompt);
            console.log('🎬 [App] pendingDecision?.videoUrl:', this.pendingDecision?.videoUrl);
            console.log('🎬 [App] ========================================');
          } else {
            // Update existing decision request with videoUrl and movieTitle if missing
            if (!this.pendingDecision.videoUrl && videoUrl) {
              console.log('🎬 [App] Updating existing decision request with videoUrl:', videoUrl);
              this.pendingDecision.videoUrl = videoUrl;
              this.pendingDecision.movieTitle = movieTitle || this.pendingDecision.movieTitle;
              console.log('🎬 [App] Updated pendingDecision.videoUrl:', this.pendingDecision.videoUrl);
              this.cdr.detectChanges();
            }
          }
        } else {
          // Log why decision request wasn't created
          console.log('🎬 [App] ========================================');
          console.log('🎬 [App] Decision request NOT created - checking conditions:');
          console.log('🎬 [App] isViewMovieStep:', isViewMovieStep);
          console.log('🎬 [App] stepId:', stepId);
          console.log('🎬 [App] videoUrl:', videoUrl);
          console.log('🎬 [App] movieTitle:', movieTitle);
          console.log('🎬 [App] evExecId:', evExecId);
          if (stepId !== 'view_movie' && !(videoUrl && movieTitle)) {
            console.log('🎬 [App] Condition failed: stepId is not view_movie AND (videoUrl && movieTitle) is false');
          }
          if (!videoUrl) {
            console.log('🎬 [App] Condition failed: videoUrl is missing');
          }
          if (!evExecId) {
            console.log('🎬 [App] Condition failed: evExecId is missing');
          }
          console.log('🎬 [App] ========================================');
        }
        
        if (llmMsg && typeof llmMsg === 'string' && llmMsg.trim()) {
          // Determine conversationId: use mapped one if available, otherwise use activeConversationId
          // For regular chat (no executionId), use activeConversationId
          const targetConversationId = conv || this.activeConversationId;
          
          console.log('🎬 [App] Calling appendChatHistory with:');
          console.log('🎬 [App]   - message length:', llmMsg.length);
          console.log('🎬 [App]   - targetConversationId:', targetConversationId);
          console.log('🎬 [App]   - activeConversationId:', this.activeConversationId);
          
          if (!targetConversationId) {
            console.warn('⚠️ [App] No targetConversationId available, cannot append message to chat history');
          } else {
            this.appendChatHistory('ASSISTANT', llmMsg, { 
              executionId: evExecId,
              videoUrl: videoUrl,
              movieTitle: movieTitle
            }, targetConversationId);
            
            console.log('🎬 [App] ✅ Called appendChatHistory for llm_response');
            if (videoUrl) {
              console.log('🎬 [App] ✅ Added message with videoUrl to chat history:', videoUrl);
            }
          }
        } else {
          console.warn('⚠️ [App] llm_response event has no valid message:', {
            hasMessage: !!llmMsg,
            messageType: typeof llmMsg,
            messageValue: llmMsg
          });
        }
      }

      // Handle chat history deletion event
      if (event.type === 'chat_history_deleted' && (event as any).data?.conversationId) {
        const deletedConvId = (event as any).data.conversationId;
        if (deletedConvId === this.activeConversationId) {
          console.log(`🗑️ [App] Received deletion event for active conversation, clearing UI`);
          this.chatHistoryClearedAt = Date.now(); // Set flag to prevent re-adding messages
          this.chatHistoryMessages = [];
          this.lastAppendBySig.clear();
          this.cdr.detectChanges();
        }
      }

      // Live sync from backend append (multi-client)
      if (event.type === 'chat_history_message' && (event as any).data?.message) {
        const m = (event as any).data.message;
        if (m?.conversationId && m.conversationId === this.activeConversationId) {
          // Ignore messages added shortly after clearing (prevent re-adding from delayed WebSocket events)
          const timeSinceClear = Date.now() - this.chatHistoryClearedAt;
          if (timeSinceClear < this.CHAT_HISTORY_CLEAR_COOLDOWN) {
            console.log(`🚫 [App] Ignoring chat_history_message event - chat history was just cleared ${timeSinceClear}ms ago`);
            return;
          }
          
          const exists = this.chatHistoryMessages.some(x => (x as any).id && (x as any).id === m.id);
          if (!exists) {
            const next = [...this.chatHistoryMessages, {
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp || Date.now(),
              userEmail: m.userEmail,
              videoUrl: m.videoUrl,
              movieTitle: m.movieTitle
            }];
            this.chatHistoryMessages =
              next.length > this.MAX_CHAT_HISTORY_MESSAGES ? next.slice(-this.MAX_CHAT_HISTORY_MESSAGES) : next;
            this.cdr.detectChanges();
          }
        }
      }
    });

    // Allow other UI components (e.g., FlowWise Chat tab) to trigger a "Send" using the main unified input.
    // This keeps all send/reset/workflow-start logic centralized in `onSubmit()`.
    this.onEdenSendEvt = () => {
      // Don't bypass existing guards (empty input, processing, balance checks).
      void this.onSubmit();
    };
    window.addEventListener('eden_send', this.onEdenSendEvt as any);
    
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
    
    const dexLiquiditySuccess = urlParams.get('dex_liquidity_success');
    const dexLiquidityCanceled = urlParams.get('dex_liquidity_canceled');
    
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
    } else if (dexLiquiditySuccess === 'true' && sessionId) {
      console.log(`✅ DEX liquidity payment successful! Session ID: ${sessionId}`);
      // Clear URL parameters to prevent re-triggering
      window.history.replaceState({}, document.title, window.location.pathname);
      // Check session and extract payment intent ID for DEX garden creation
      this.checkDexLiquiditySession(sessionId);
    } else if (jscCanceled === 'true' || gardenCanceled === 'true' || dexLiquidityCanceled === 'true') {
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
    
    // Do NOT auto-open sign-in UI. We run in guest mode by default.
    // Sign-in is only shown when the user explicitly clicks the header button
    // or a gated action requests it.
    if (isSignedIn) {
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
        this.setViewMode(savedMode); // CRITICAL: Apply the mode to update _currentViewMode
        console.log(`⛪ [App] Admin user mode restored: ${savedMode}`);
      } else if (savedMode === 'user') {
        // Admin should never be in USER mode - reset to GOD
        console.log(`⛪ [App] Admin user was in USER mode, resetting to GOD mode`);
        this.selectedAdminMode = 'god';
        this.setViewMode('god'); // CRITICAL: Apply the mode
      } else {
        // No saved mode - will prompt admin to choose
        console.log(`⛪ [App] Admin user - no saved mode, will prompt for selection`);
        this.selectedAdminMode = 'god'; // Default to GOD
        this.setViewMode('god'); // CRITICAL: Apply the default mode
      }
      // Update sidebar visibility after mode is set
      this.updateSidebarVisibility();
    }
    
    // Only load wallet balance when user is actually signed in (localStorage userEmail exists).
    // When signed out, keep the UI responsive and show Main Street + Sign In prompt without blocking on balance.
    if (this.isUserSignedIn) {
      this.loadWalletBalance();
    } else {
      this.walletBalance = 0;
      this.isLoadingBalance = false;
    }
    
    // Initialize Google Sign-In and get user email (may update email if Google Sign-In succeeds)
    // This is async and won't block balance loading
    this.initializeGoogleSignIn();
    
    // Initialize tab visibility handling before connecting
    // This ensures WebSocket is only active in the visible tab
    this.wsService.initializeTabVisibilityHandling();
    this.wsService.connect();
    
    // Listen for service provider creation events to refresh service types
    this.wsService.events$.subscribe((event: SimulatorEvent) => {
      if (event.type === 'service_provider_created' || event.type === 'service_provider_registered') {
        // Throttle refresh: these events can be noisy during boot / after chats.
        this.requestServicesRefresh();
      }
      
      // Listen for garden creation events to refresh gardens list
      if (event.type === 'garden_created') {
        // Throttle refresh: garden creation can fan out into many provider events.
        this.requestGardensRefresh();
        this.requestServicesRefresh();
      }

      // Listen for DEX garden creation events to refresh DEX gardens list
      if (event.type === 'dex_garden_created') {
        this.requestDexGardensRefresh();
      }
      
      // Listen for ledger events to update wallet balance (event-driven, no polling)
      if (event.type === 'ledger_entry_added' || 
          event.type === 'ledger_entry_created' || 
          event.type === 'ledger_booking_completed' ||
          event.type === 'cashier_payment_processed' ||
          event.type === 'wallet_balance_updated') {
        // Ledger events can be frequent; debounce wallet refresh to avoid flooding backend/UI.
        this.requestWalletBalanceRefresh();
      }
    });
    
    // Initialize Main Street groups from hardcoded list (will be refined by registry)
    this.recomputeMainStreetGroups();

    // Load services from ROOT CA ServiceRegistry (Garden of Eden Main Street)
    this.loadServices();
    // Load Apple gardens (Apple main street is garden-driven)
    this.loadAppleGardens();
    // Load DEX gardens (DEX main street is garden-driven)
    this.loadDexGardens();
    // Load Snake providers separately
    this.loadSnakeProviders();
    
    // Load priesthood stats (for certified priest count display)
    this.loadPriesthoodStats();
    
    // Check for service gardens (non-root) - Main Street only shows if there are service gardens
    // Call after a short delay to ensure persistence is loaded on server
    setTimeout(() => {
      this.checkServiceGardens();
    }, 500);
    
    // Check priesthood status only if user is signed in
    if (this.isUserSignedIn && this.userEmail) {
      setTimeout(() => {
        this.checkPriesthoodStatus();
      }, 1000);
    }
  }

  private applyTheme(theme: 'dark' | 'light') {
    this.theme = theme;
    try {
      localStorage.setItem('edenTheme', theme);
    } catch {}
    // Bootstrap 5.3 theme switch
    document.documentElement.setAttribute('data-bs-theme', theme);
  }

  private initTheme() {
    const saved = (localStorage.getItem('edenTheme') || '').toLowerCase();
    if (saved === 'light' || saved === 'dark') {
      this.applyTheme(saved as any);
      return;
    }
    // Default to dark (matches current app styling)
    this.applyTheme('dark');
  }

  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
    this.cdr.detectChanges();
  }

  private requestWalletBalanceRefresh(delayMs: number = 750) {
    if (this.walletBalanceRefreshTimer) clearTimeout(this.walletBalanceRefreshTimer);
    this.walletBalanceRefreshTimer = setTimeout(() => {
      this.walletBalanceRefreshTimer = null;
      // Avoid parallel requests; loadWalletBalance has its own guards too.
      if (!this.isLoadingBalance) {
        this.loadWalletBalance();
      }
    }, delayMs);
  }

  private requestServicesRefresh(delayMs: number = 1200) {
    if (this.servicesRefreshTimer) clearTimeout(this.servicesRefreshTimer);
    this.servicesRefreshTimer = setTimeout(() => {
      this.servicesRefreshTimer = null;
      this.loadServices();
    }, delayMs);
  }

  private requestGardensRefresh(delayMs: number = 1200) {
    if (this.gardensRefreshTimer) clearTimeout(this.gardensRefreshTimer);
    this.gardensRefreshTimer = setTimeout(() => {
      this.gardensRefreshTimer = null;
      this.checkServiceGardens();
      this.loadAppleGardens();
    }, delayMs);
  }

  private requestDexGardensRefresh(delayMs: number = 1200) {
    if (this.dexGardensRefreshTimer) clearTimeout(this.dexGardensRefreshTimer);
    this.dexGardensRefreshTimer = setTimeout(() => {
      this.dexGardensRefreshTimer = null;
      this.loadDexGardens();
    }, delayMs);
  }

  private recomputeMainStreetGroups() {
    // Legacy: was service-type grouping for Apple. We keep serviceTypes updated for prompts/workflow preload,
    // but the UI now renders Apple as gardens (see loadAppleGardens()).
    this.serviceTypes = this.serviceTypes.sort((a, b) => (a.adText || a.type).localeCompare((b.adText || b.type), undefined, { sensitivity: 'base' }));
  }

  private getDexServiceType(): {type: string, icon: string, adText: string, sampleQuery: string} {
    // First try to find in loaded serviceTypes (has provider counts)
    const fromServiceTypes = this.serviceTypes.find(st => st.type === 'dex');
    if (fromServiceTypes) return fromServiceTypes;
    
    // Fallback to catalog entry (always available since 'dex' is in catalog)
    const dexEntry = getCatalogEntryFromService('dex');
    if (dexEntry) return dexEntry;
    
    // Last resort: get from catalog directly (should never be needed, but safety fallback)
    const catalogEntry = SERVICE_TYPE_CATALOG.find(e => e.type === 'dex');
    if (catalogEntry) return catalogEntry;
    
    // Absolute last resort (should never execute - 'dex' is guaranteed in catalog)
    console.error('⚠️ [getDexServiceType] DEX not found in catalog - this should never happen!');
    return {
      type: 'dex',
      icon: '💰',
      adText: 'DEX Tokens',
      sampleQuery: 'I want to BUY 2 SOLANA token A at 1 Token/SOL or with best price'
    };
  }

  loadDexGardens() {
    const isPriestMode = this.isUserSignedIn && this.currentViewMode === 'priest' && !!this.userEmail;
    const url = isPriestMode && this.userEmail
      ? `${this.apiUrl}/api/dex-gardens/by-owner?email=${encodeURIComponent(this.userEmail)}`
      : `${this.apiUrl}/api/dex-gardens`;

    this.http.get<{success: boolean, gardens?: any[]}>(url).subscribe({
      next: (response) => {
        if (response.success) {
          const gardens = (response.gardens || []).filter((g: any) => g && g.active !== false);
          this.dexGardens = gardens.map((g: any) => ({
            id: g.id,
            name: g.name || g.id,
            active: g.active !== false,
            uuid: g.uuid,
            ownerEmail: g.ownerEmail,
            ownerUsername: null as string | null, // Will be resolved
            type: g.type || 'token',
            initialLiquidity: g.initialLiquidity || 0,
            liquidityCertified: g.liquidityCertified || false,
            stripePaymentRailBound: g.stripePaymentRailBound || false,
            totalTrades: g.totalTrades || 0,
            totalVolume: g.totalVolume || 0
          }));
          
          // Resolve usernames for garden owners
          this.resolveGardenOwnerUsernames(this.dexGardens);
          console.log(`💰 [DEX Main Street] Loaded ${this.dexGardens.length} DEX garden(s): ${this.dexGardens.map(g => g.id).join(', ')}`);
          
          // Load liquidity data for each garden
          this.loadDexGardenLiquidity();
        } else {
          this.dexGardens = [];
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load DEX gardens:', err);
        this.dexGardens = [];
        this.cdr.detectChanges();
      }
    });
  }
  
  loadDexGardenLiquidity() {
    // Load liquidity records for all DEX gardens
    for (const garden of this.dexGardens) {
      this.http.get<{success: boolean, records?: any[]}>(`${this.apiUrl}/api/liquidity-accountant/garden/${garden.id}`)
        .subscribe({
          next: (response) => {
            if (response.success && response.records && response.records.length > 0) {
              // Find the record with the highest initial liquidity (primary pool)
              const primaryRecord = response.records.reduce((prev, curr) => 
                (curr.initialLiquidity || 0) > (prev.initialLiquidity || 0) ? curr : prev
              );
              garden.currentLiquidity = primaryRecord.currentLiquidity || primaryRecord.initialLiquidity || 0;
              garden.initialLiquidity = primaryRecord.initialLiquidity || garden.initialLiquidity || 0;
              garden.baseToken = primaryRecord.baseToken || 'SOL';
              garden.tokenSymbol = primaryRecord.tokenSymbol || 'TOKEN';
              this.cdr.detectChanges();
            }
          },
          error: (err) => {
            console.warn(`Failed to load liquidity for garden ${garden.id}:`, err);
          }
        });
    }
  }

  loadAppleGardens() {
    this.isLoadingAppleGardens = true;
    const isPriestMode = this.isUserSignedIn && this.currentViewMode === 'priest' && !!this.userEmail;
    const url = isPriestMode && this.userEmail
      ? `${this.apiUrl}/api/gardens/by-owner?email=${encodeURIComponent(this.userEmail)}`
      : `${this.apiUrl}/api/gardens?ecosystem=all`;

    this.http
      .get<{success: boolean, gardens?: any[], indexers?: any[]}>(url)
      .pipe(
        timeout(8000),
        finalize(() => {
          // Prevent "Loading Apple gardens..." from hanging forever if backend stalls.
          this.isLoadingAppleGardens = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
      next: (response) => {
        const gardens = (response.gardens || response.indexers || []).filter((g: any) => g && g.active !== false);
        // Apple gardens = non-DEX, non-token, non-HG
        const apple = gardens.filter((g: any) => {
          const id = String(g.id || '');
          const serviceType = String(g.serviceType || g.type || '').toLowerCase();
          if (!id || id === 'HG') return false;
          if (id.startsWith('T')) return false; // token garden convention
          if (serviceType === 'dex' || serviceType === 'token') return false;
          return true;
        });
        apple.sort((a: any, b: any) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { sensitivity: 'base' }));
        this.appleGardens = apple.map((g: any) => {
          const effectiveServiceType = this.inferServiceTypeFromGarden(g);
          return {
          id: g.id,
          name: g.name || g.id,
          active: g.active !== false,
          uuid: g.uuid,
          ownerEmail: g.ownerEmail,
          ownerUsername: null as string | null, // Will be resolved
          // IMPORTANT: do NOT let "type: regular" leak into UI/workflow selection.
          // Always compute a workflow-capable serviceType for Apple gardens.
          serviceType: effectiveServiceType,
          isSnake: !!g.isSnake
          };
        });
        
        // Resolve usernames for garden owners
        this.resolveGardenOwnerUsernames(this.appleGardens);
      },
      error: (err) => {
        console.error('Failed to load Apple gardens:', err);
        this.appleGardens = [];
      }
    });
  }

  private inferServiceTypeFromGarden(garden: { name?: string; serviceType?: string; type?: string } | null | undefined): string {
    const raw = String((garden as any)?.serviceType || (garden as any)?.type || '').toLowerCase().trim();
    // 'regular' is the garden kind, not a workflow serviceType.
    if (raw && raw !== 'regular' && raw !== 'root' && raw !== 'token') return raw;

    const name = String((garden as any)?.name || '');
    const m = name.match(/garden[-_\s]+([a-z0-9]+)/i);
    const fromName = String(m?.[1] || '').toLowerCase().trim();
    if (fromName) return fromName;

    return 'movie';
  }

  private getServiceTypePrompt(serviceType: string | undefined): { type: string; sampleQuery: string } {
    const st = String(serviceType || '').toLowerCase().trim();
    const normalized = (!st || st === 'regular' || st === 'root' || st === 'token') ? 'movie' : st;
    const match = this.getCatalogEntry(normalized);
    return {
      type: normalized,
      sampleQuery: match?.sampleQuery || `Show me ${normalized} options`
    };
  }

  // Debug helper for template
  debugLog(message: string, data?: any): void {
    console.log(message, data);
  }

  selectAppleGarden(garden: {id: string, name: string, serviceType?: string, ownerEmail?: string}) {
    // Disable processing and loading flags to ensure input is enabled
    this.isProcessing = false;
    this.isLoadingChatHistory = false;
    
    // NEW ARCHITECTURE: Instead of setting pre-canned prompts, just set the configurable sample input
    // The LLM service mapper will determine the actual service/garden from user input
    this.selectedAppleGarden = { id: garden.id, name: garden.name };
    this.selectedDexGarden = null;

    // Keep serviceType for context, but LLM will determine actual selection from user input
    const inferred = this.inferServiceTypeFromGarden(garden as any);
    this.selectedServiceType = inferred;
    
    // Use service-specific sample query from catalog instead of hardcoded movie query
    const servicePrompt = this.getServiceTypePrompt(inferred);
    this.userInput = servicePrompt.sampleQuery;
    this.inputPlaceholder = servicePrompt.sampleQuery || "Type your request here...";
    
    // Note: No need to pre-load workflow - LLM will determine serviceType from user input
    console.log(`🔄 [App] Garden clicked: ${garden.name} (${inferred}) - Using sample query: ${servicePrompt.sampleQuery}`);

    // Garden-scoped chat history for Apple gardens (no grouping by serviceType)
    this.setActiveConversation(this.buildConversationId('garden', garden.id));

    // Switch to workflow-chat tab
    this.activeTab = 'workflow-chat';
    
    // Set sidebar input (if sidebar exists) - do this AFTER tab switch
    if (this.sidebarComponent) {
      this.sidebarComponent.edenChatInput = servicePrompt.sampleQuery;
    }
    
    // Focus input after view updates (exactly like home component - simple and fast)
    setTimeout(() => {
      const input = document.querySelector('input[name="edenChatInputDocked"], input[name="edenChatInputFloating"]') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);

    this.cdr.detectChanges();
  }

  selectDexGarden(garden: {id: string, name: string}) {
    // Disable processing and loading flags to ensure input is enabled
    this.isProcessing = false;
    this.isLoadingChatHistory = false;
    
    // NEW ARCHITECTURE: Instead of setting pre-canned prompts, just set the configurable sample input
    // The LLM service mapper will determine the actual service/garden from user input
    this.selectedDexGarden = garden;

    // Keep serviceType for context, but LLM will determine actual selection from user input
    const dexServiceType = this.getDexServiceType();
    this.selectedServiceType = dexServiceType.type;
    
    // Use DEX-specific sample query from catalog instead of hardcoded movie query
    const servicePrompt = this.getServiceTypePrompt('dex');
    this.userInput = servicePrompt.sampleQuery;
    this.inputPlaceholder = servicePrompt.sampleQuery || "Type your request here (e.g., Trade 2 SOL with TOKEN)";
    
    // Note: No need to pre-load workflow - LLM will determine serviceType from user input
    console.log(`🔄 [App] DEX garden clicked: ${garden.name} - Using DEX sample query: ${servicePrompt.sampleQuery}`);

    // Garden-scoped chat history for DEX gardens (single switch)
    this.setActiveConversation(this.buildConversationId('garden', garden.id));

    // Switch to workflow-chat tab (like home component does)
    this.activeTab = 'workflow-chat';
    
    // Set the sidebar input field directly
    if (this.sidebarComponent) {
      this.sidebarComponent.edenChatInput = servicePrompt.sampleQuery;
      setTimeout(() => {
        const input = document.querySelector('input[name="edenChatInputDocked"], input[name="edenChatInputFloating"]') as HTMLInputElement;
        if (input) {
          input.focus();
          input.select();
        }
      }, 100);
    }

    this.cdr.detectChanges();
  }
  
  checkServiceGardens() {
    // Check if there are any service gardens (non-root gardens)
    // In PRIEST mode, only check gardens owned by the current user
    const isPriestMode = this.isUserSignedIn && this.currentViewMode === 'priest' && !!this.userEmail;
    // IMPORTANT: We validate service gardens against BOTH ecosystems.
    // The server defaults /api/gardens to ecosystem=saas (no token gardens),
    // but Main Street needs token garden IDs too so DEX providers (gardenId=T#) are not filtered out.
    const gardensUrl = isPriestMode && this.userEmail 
      ? `${this.apiUrl}/api/gardens/by-owner?email=${encodeURIComponent(this.userEmail)}`
      : `${this.apiUrl}/api/gardens?ecosystem=all`;
    
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
      const clientId = '689088871482-bbafu71u7vuhpjn94socpkq5hn7fs0rc.apps.googleusercontent.com';
      if (!clientId || clientId.length < 10) {
        console.log('⚠️ Google Client ID not configured, skipping Google Sign-In initialization');
        console.log('   To enable Google Sign-In, configure the Client ID in app.component.ts');
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
        this.updateSignInState(); // Update cached state
        console.log(`✅ Google Sign-In successful: ${email}`);
        
        // Extract Google user ID from credential (decode JWT)
        let googleUserId = '';
        try {
          const payload = JSON.parse(atob(response.credential.split('.')[1]));
          googleUserId = payload.sub || '';
          console.log(`🎭 [Identity] Extracted Google user ID: ${googleUserId}`);
        } catch (e) {
          console.error('❌ [Identity] Failed to extract Google user ID from credential:', e);
        }
        
        // If no Google user ID, use email as fallback identifier
        if (!googleUserId) {
          googleUserId = `email_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
          console.log(`🎭 [Identity] Using email-based Google user ID: ${googleUserId}`);
        }
        
        // Check if user has registered username
        this.checkAndPromptUsernameRegistration(email, googleUserId);
        
        // Update title to show user email
        this.updateTitle();
        
        // Set flag to check balance after sign-in
        this.checkBalanceAfterSignIn = true;
        
        // Load wallet balance for the new user
        this.loadWalletBalance();
        
        // Close modal after successful sign-in (unless username registration is needed)
        if (!this.showUsernameRegistration) {
          this.closeSignInModal();
        }
        
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

  openPopupChat() {
    this.showPopupChat = true;
    this.cdr.detectChanges();
  }

  closePopupChat() {
    this.showPopupChat = false;
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
    
    // Clear Google Sign-In data FIRST to prevent any race conditions
    localStorage.removeItem('userEmail');
    localStorage.removeItem('googleCredential');
    
    // Update cached sign-in state FIRST to prevent getter from returning different values
    this._isUserSignedIn = false;
    
    // Generate new render key to force clean render and prevent duplication
    this.renderKey = `render-${Date.now()}`;
    
    // Clear userEmail to put dashboard in non-user binding state
    // IMPORTANT: Set these synchronously to prevent intermediate renders
    this.userEmail = '';
    this.isGoogleSignedIn = false;
    this.walletBalance = 0;
    this.isLoadingBalance = true; // Set to loading state to show spinner
    
    // Set view mode to USER when signing out
    console.log(`🔄 [App] Setting view mode to USER after sign out`);
    this.setViewMode('user');
    
    // Update sidebar visibility based on view mode (should be hidden in USER mode)
    this.updateSidebarVisibility();
    
    // Ensure active tab is visible in user mode
    this.ensureValidTab();
    
    this.updateTitle();
    
    // Use a single change detection after all state is updated
    // Batch all changes in a single render cycle to prevent duplication
    setTimeout(() => {
      this.cdr.detectChanges();
      
      // Load wallet balance and re-initialize Google Sign-In after UI has updated
      setTimeout(() => {
        this.loadWalletBalance();
        this.initializeGoogleSignIn();
      }, 50);
    }, 0);
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
      this.updateSignInState(); // Update cached state
      
      // For email/password sign-in, use email as Google user ID (fallback)
      // In production, you'd have a proper user ID system
      const googleUserId = `email_${this.signInEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      // Check if user has registered username
      this.checkAndPromptUsernameRegistration(this.signInEmail, googleUserId);
      
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
    // Only load balance when signed in. When signed out, avoid "silent binding" to admin/default email.
    const savedEmail = localStorage.getItem('userEmail');
    if (!savedEmail || savedEmail.trim() === '') {
      this.walletBalance = 0;
      this.isLoadingBalance = false;
      return;
    }

    const emailToUse = savedEmail.trim();

    // Update userEmail if it's different (user signed in with different account)
    if (this.userEmail !== emailToUse) {
      console.log(`📧 Email changed from ${this.userEmail} to ${emailToUse}, clearing and reloading wallet balance`);
      this.walletBalance = 0;
      this.userEmail = emailToUse;
    }
    
    if (!this.userEmail || !this.userEmail.includes('@')) {
      console.warn('No valid email, skipping balance load. Current email:', this.userEmail);
      return;
    }
    
    this.isLoadingBalance = true;
    console.log(`💰 Loading wallet balance for: ${this.userEmail}`);

    const url = `${this.apiUrl}/api/jsc/balance/${encodeURIComponent(this.userEmail)}`;
    this.http
      .get<{ success: boolean; balance: number; error?: string }>(url)
      .pipe(
        // Prevent UI from feeling "frozen" if the backend stalls (this flag is used by the global overlay).
        timeout(8000),
        finalize(() => {
          this.isLoadingBalance = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
      next: (response) => {
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
        console.error('   URL:', url);
        this.walletBalance = 0;
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
    const isPriestMode = this.isUserSignedIn && this.currentViewMode === 'priest' && !!this.userEmail;
    
    // First, load gardens to validate gardenId
    // In PRIEST mode, filter gardens by ownerEmail to show only priest-owned gardens
    // IMPORTANT: We validate providers against BOTH ecosystems (regular + token gardens).
    // Otherwise DEX providers (gardenId=T#) get filtered out and DEX won't appear on Main Street.
    const gardensUrl = isPriestMode && this.userEmail 
      ? `${this.apiUrl}/api/gardens/by-owner?email=${encodeURIComponent(this.userEmail)}`
      : `${this.apiUrl}/api/gardens?ecosystem=all`;
    
    this.http
      .get<{success: boolean, gardens?: Array<{id: string, name?: string, type?: string, active: boolean, ownerEmail?: string}>, indexers?: Array<{id: string, name?: string, type?: string, active: boolean}>}>(gardensUrl)
      .pipe(
        timeout(8000),
        finalize(() => {
          // Ensure we never get stuck on "Loading Service Registry..." if backend is down/stalled.
          if (this.isLoadingServices) {
            this.isLoadingServices = false;
            this.cdr.detectChanges();
          }
        })
      )
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
          // Cache is handled automatically by CacheInterceptor
          const ownerEmailParam = isPriestMode && this.userEmail ? `?ownerEmail=${encodeURIComponent(this.userEmail)}` : '';
          this.http.get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry${ownerEmailParam}`)
            .pipe(timeout(8000))
            .subscribe({
              next: (response) => {
                if (response.success && response.providers) {
                  // CRITICAL: Filter out infrastructure services (payment-rail, settlement, registry, webserver, websocket, wallet)
                  // These belong to Holy Ghost (HG) and should NOT appear in Main Street
                  // Main Street should only show service types that have providers belonging to NON-ROOT gardens
                  const infrastructureServiceTypes = new Set(['payment-rail', 'settlement', 'registry', 'webserver', 'websocket', 'wallet', 'accountant', 'root-ca-llm']);
                  
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

                  // Group-by counts (data-driven Main Street)
                  const countsByServiceType: Record<string, number> = {};
                  const countsByGardenId: Record<string, number> = {};
                  const ownersByServiceTypeSets: Record<string, Set<string>> = {};
                  const ownersByGardenIdSets: Record<string, Set<string>> = {};
                  for (const p of nonInfrastructureProviders) {
                    const st = String(p.serviceType || '').toLowerCase();
                    if (st) countsByServiceType[st] = (countsByServiceType[st] || 0) + 1;
                    const gid = String((p.gardenId || p.indexerId) || '');
                    if (gid) countsByGardenId[gid] = (countsByGardenId[gid] || 0) + 1;

                    const owner = String((p as any).ownerEmail || '').trim().toLowerCase();
                    if (owner) {
                      if (st) {
                        if (!ownersByServiceTypeSets[st]) ownersByServiceTypeSets[st] = new Set<string>();
                        ownersByServiceTypeSets[st].add(owner);
                      }
                      if (gid) {
                        if (!ownersByGardenIdSets[gid]) ownersByGardenIdSets[gid] = new Set<string>();
                        ownersByGardenIdSets[gid].add(owner);
                      }
                    }
                  }
                  this.providerCountsByServiceType = countsByServiceType;
                  this.providerCountsByGardenId = countsByGardenId;
                  this.providerOwnersByServiceType = Object.fromEntries(
                    Object.entries(ownersByServiceTypeSets).map(([k, set]) => [k, Array.from(set).sort()])
                  );
                  this.providerOwnersByGardenId = Object.fromEntries(
                    Object.entries(ownersByGardenIdSets).map(([k, set]) => [k, Array.from(set).sort()])
                  );
            
                  // CRITICAL: Reset serviceTypes to the full catalog before filtering
                  // This ensures we don't lose service types that were filtered out previously
                  // Use shared catalog from service-type-catalog.service.ts
                  const allServiceTypes = SERVICE_TYPE_CATALOG;
                  
                  // Only show service types that are actually available in the ServiceRegistry
                  const filteredServiceTypes = allServiceTypes.filter(st => 
                    availableTypes.has(st.type)
                  );
                  
                  // CRITICAL: Deduplicate by service type to prevent duplicates
                  // This prevents duplicates from race conditions or multiple rapid calls
                  const serviceTypeMap = new Map<string, {type: string, icon: string, adText: string, sampleQuery: string, providerCount?: number, ownerEmails?: string[]}>();
                  for (const st of filteredServiceTypes) {
                    if (!serviceTypeMap.has(st.type)) {
                      const key = String(st.type || '').toLowerCase();
                      serviceTypeMap.set(st.type, {
                        ...st,
                        providerCount: this.providerCountsByServiceType[key] || 0,
                        ownerEmails: this.providerOwnersByServiceType[key] || []
                      });
                    }
                  }
                  this.serviceTypes = Array.from(serviceTypeMap.values());
                  this.recomputeMainStreetGroups();
                  
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
                  this.recomputeMainStreetGroups();
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
                this.recomputeMainStreetGroups();
                this.isLoadingServices = false;
                this.cdr.detectChanges();
              }
            });
        },
        error: (err) => {
          console.error('Failed to load gardens for validation:', err);
          // If gardens API fails, still try to load services but without validation
          this.http.get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry`)
            .pipe(timeout(8000))
            .subscribe({
              next: (response) => {
                // Fallback: use original logic without gardenId validation
                if (response.success && response.providers) {
                  const infrastructureServiceTypes = new Set(['payment-rail', 'settlement', 'registry', 'webserver', 'websocket', 'wallet', 'accountant', 'root-ca-llm']);
                  const nonInfrastructureProviders = response.providers.filter(p => 
                    p.status === 'active' && 
                    !infrastructureServiceTypes.has(p.serviceType) &&
                    (p.gardenId || p.indexerId) !== 'HG'
                  );
                  const availableTypes = new Set(nonInfrastructureProviders.map(p => p.serviceType));
                  // Use existing service types logic
                  this.serviceTypes = this.serviceTypes.filter(st => availableTypes.has(st.type));
                  this.recomputeMainStreetGroups();
                } else {
                  this.serviceTypes = [];
                  this.recomputeMainStreetGroups();
                }
                this.isLoadingServices = false;
                this.cdr.detectChanges();
              },
              error: (err2) => {
                console.error('Failed to load services:', err2);
                this.serviceTypes = [];
                this.recomputeMainStreetGroups();
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
    this.http
      .get<{success: boolean, providers: ServiceProvider[], count: number}>(`${this.apiUrl}/api/root-ca/service-registry?serviceType=snake${ownerEmailParam}`)
      .pipe(
        timeout(8000),
        finalize(() => {
          this.isLoadingSnakeProviders = false;
          this.cdr.detectChanges();
        })
      )
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
        },
        error: (err) => {
          console.error('Failed to load Snake services:', err);
          this.snakeProviders = [];
        }
      });
  }
  
  checkDexLiquiditySession(sessionId: string) {
    console.log(`🔍 Checking DEX liquidity Stripe session: ${sessionId}`);
    this.http.get<{success: boolean, session?: any, paymentIntentId?: string, error?: string}>(`${this.apiUrl}/api/jsc/check-session/${sessionId}`)
      .subscribe({
        next: (response) => {
          if (response.success && response.session) {
            const session = response.session;
            const paymentIntentId = response.paymentIntentId || session.payment_intent;
            const liquidityAmount = parseFloat(session.metadata?.liquidity_amount || '0');
            
            console.log(`✅ DEX liquidity payment confirmed: ${liquidityAmount} 🍎 APPLES`);
            console.log(`   Payment Intent ID: ${paymentIntentId}`);
            
            // Store payment intent ID in localStorage for system config component to use
            if (paymentIntentId) {
              localStorage.setItem('dexLiquidityPaymentIntentId', paymentIntentId);
              localStorage.setItem('dexLiquidityAmount', liquidityAmount.toString());
              console.log(`💾 Stored DEX liquidity payment intent ID: ${paymentIntentId}`);
              
              // Show success message
              alert(`✅ DEX liquidity payment confirmed!\n\nAmount: ${liquidityAmount.toLocaleString()} 🍎 APPLES\nPayment Intent ID: ${paymentIntentId}\n\nYou can now create your DEX garden.`);
            }
          } else {
            console.error(`❌ Failed to verify DEX liquidity session:`, response.error);
            alert(`❌ Failed to verify DEX liquidity payment: ${response.error || 'Unknown error'}`);
          }
        },
        error: (err) => {
          console.error(`❌ Error checking DEX liquidity session:`, err);
          alert(`❌ Error verifying DEX liquidity payment: ${err.error?.error || err.message}`);
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

    // Service-scoped chat history for Apple ecosystem service tiles
    this.setActiveConversation(this.buildConversationId('service', serviceType.type));
    
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
  /**
   * Check if a query is an Eden workflow query (action-oriented) vs regular informational query
   * Eden workflow queries trigger workflows, while informational queries are answered directly
   */
  isEdenWorkflowQuery(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    
    // Action verbs that indicate workflow queries
    const actionVerbs = ['buy', 'sell', 'book', 'find', 'order', 'trade', 'swap', 'watch', 'get', 'purchase', 'reserve'];
    const hasActionVerb = actionVerbs.some(verb => {
      // Check if verb appears as a word (not part of another word)
      const regex = new RegExp(`\\b${verb}\\b`, 'i');
      return regex.test(lowerInput);
    });
    
    // Service-related keywords that indicate workflow queries
    const serviceKeywords = ['movie', 'ticket', 'token', 'movie', 'pharmacy', 'flight', 'hotel', 'restaurant', 'autopart', 'dex', 'pool'];
    const hasServiceKeyword = serviceKeywords.some(keyword => lowerInput.includes(keyword));
    
    // Question patterns that indicate informational queries (NOT workflow)
    const questionPattern = /^(how|what|who|why|when|where|explain|tell me about|help|guide)/i;
    const isQuestion = questionPattern.test(lowerInput);
    
    // If it's a question, it's NOT a workflow query (it's informational)
    if (isQuestion) {
      return false;
    }
    
    // If it has action verbs AND service keywords, it's likely a workflow query
    if (hasActionVerb && hasServiceKeyword) {
      return true;
    }
    
    // If it has action verbs with service context, it's likely a workflow query
    if (hasActionVerb && (lowerInput.includes('movie') || lowerInput.includes('ticket') || lowerInput.includes('token') || 
        lowerInput.includes('pharmacy') || lowerInput.includes('flight') || lowerInput.includes('hotel') ||
        lowerInput.includes('restaurant') || lowerInput.includes('autopart'))) {
      return true;
    }
    
    // Otherwise, it's likely an informational query
    return false;
  }

  detectServiceType(input: string): string | null {
    const lowerInput = input.toLowerCase();
    
    // CRITICAL: Check DEX indicators FIRST with higher priority
    // DEX keywords (must check these before generic "buy"/"sell")
    const dexKeywords = ['token', 'dex', 'solana', 'sol', 'pool', 'trade', 'swap', 'exchange'];
    const hasDexKeyword = dexKeywords.some(keyword => lowerInput.includes(keyword));
    
    // If DEX keywords are present, it's DEX (even if "buy"/"sell" could match movies)
    if (hasDexKeyword) {
      return 'dex';
    }
    
    // Check for "buy"/"sell" with token context (more specific DEX patterns)
    if ((lowerInput.includes('buy') || lowerInput.includes('sell')) && 
        (lowerInput.includes('token') || lowerInput.includes('sol') || lowerInput.includes('solana'))) {
      return 'dex';
    }
    
    // Movie indicators (only if NO DEX keywords)
    if (!hasDexKeyword && 
        (lowerInput.includes('movie') || lowerInput.includes('film') ||
         lowerInput.includes('watch') || lowerInput.includes('cinema') ||
         lowerInput.includes('theatre') || lowerInput.includes('ticket'))) {
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
    if (this.workflowMessagesRaf != null) {
      cancelAnimationFrame(this.workflowMessagesRaf);
      this.workflowMessagesRaf = null;
    }
    if (this.onEdenSendEvt) {
      window.removeEventListener('eden_send', this.onEdenSendEvt as any);
      this.onEdenSendEvt = null;
    }
    if (this.walletBalanceRefreshTimer) clearTimeout(this.walletBalanceRefreshTimer);
    if (this.servicesRefreshTimer) clearTimeout(this.servicesRefreshTimer);
    if (this.gardensRefreshTimer) clearTimeout(this.gardensRefreshTimer);
    if (this.dexGardensRefreshTimer) clearTimeout(this.dexGardensRefreshTimer);
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

  // Handle Eden chat submission from sidebar
  onEdenChatFromSidebar(message: string): void {
    // Set the user input and trigger the same onSubmit logic
    this.userInput = message;
    this.onSubmit();
  }

  async onSubmit() {
    if (!this.userInput.trim() || this.isProcessing) {
      console.log('⚠️ Submit blocked:', { 
        hasInput: !!this.userInput.trim(), 
        isProcessing: this.isProcessing 
      });
      return;
    }

    // If not signed in, route to Sign In flow (keeps UX consistent even when send is triggered via custom events).
    if (!this.isUserSignedIn) {
      this.openSignInModal();
      return;
    }

    // CRITICAL: Check if user is responding to a pending decision
    // If there's a pending decision and the input looks like a confirmation, submit it as a decision
    if (this.pendingDecision) {
      const input = this.userInput.trim().toLowerCase();
      const normalizedInput = input.replace(/[.,!?]/g, '').trim();
      
      // Check if input matches common confirmation words
      const confirmationWords = ['yes', 'y', 'confirmed', 'confirm', 'ok', 'okay', 'sure', 'proceed', 'continue', 'accept', 'agree'];
      const isConfirmation = confirmationWords.includes(normalizedInput);
      
      // Check if input matches any of the decision option values or labels
      let matchedOption: any = null;
      if (this.pendingDecision.options && Array.isArray(this.pendingDecision.options)) {
        matchedOption = this.pendingDecision.options.find((opt: any) => {
          const optValue = String(opt.value || '').toLowerCase();
          const optLabel = String(opt.label || '').toLowerCase();
          return optValue === normalizedInput || 
                 optLabel === normalizedInput ||
                 optLabel.includes(normalizedInput) ||
                 normalizedInput.includes(optValue) ||
                 normalizedInput.includes(optLabel);
        });
      }
      
      if (isConfirmation || matchedOption) {
        console.log(`🤔 [App] Detected decision response: "${this.userInput.trim()}"`);
        console.log(`🤔 [App] Is confirmation word: ${isConfirmation}, Matched option: ${matchedOption ? matchedOption.value : 'none'}`);
        
        // Determine the decision value
        let decisionValue: string;
        if (matchedOption) {
          decisionValue = matchedOption.value;
        } else if (isConfirmation) {
          // For confirmation words, default to "YES" if options include it, otherwise use first option
          const yesOption = this.pendingDecision.options?.find((opt: any) => 
            String(opt.value || '').toUpperCase() === 'YES'
          );
          decisionValue = yesOption ? yesOption.value : (this.pendingDecision.options?.[0]?.value || 'YES');
        } else {
          decisionValue = this.userInput.trim();
        }
        
        // Add user message to chat history
        const serviceType = this.selectedServiceType || 'unknown';
        const desiredConversationId =
          serviceType === 'dex' && this.selectedDexGarden?.id
            ? this.buildConversationId('garden', this.selectedDexGarden.id)
            : (this.selectedAppleGarden?.id
                ? this.buildConversationId('garden', this.selectedAppleGarden.id)
                : this.buildConversationId('service', serviceType));
        this.appendChatHistory('USER', this.userInput.trim(), { serviceType }, desiredConversationId);
        
        // Clear input and submit decision
        const inputToSubmit = this.userInput.trim();
        this.userInput = '';
        await this.submitDecision(decisionValue);
        return;
      }
    }

    // Context sensing - detect service type if not already set
    if (!this.selectedServiceType) {
      this.selectedServiceType = this.detectServiceType(this.userInput);
      console.log(`🔍 Detected service type from input: ${this.selectedServiceType || 'unknown'}`);
    }

    // Check if this is an Eden workflow query (action-oriented) vs regular informational query
    const input = this.userInput.trim();
    const isEdenWorkflowQuery = this.isEdenWorkflowQuery(input);
    
    // If service type is detected OR it's an Eden workflow query, route to /api/eden-chat
    if (this.selectedServiceType || isEdenWorkflowQuery) {
      // This is an Eden workflow query - route to /api/eden-chat
      console.log(`🔄 Routing to /api/eden-chat (Eden workflow query)`);
      
      // Check balance before submitting workflow
      if (!this.hasSufficientBalance()) {
        console.log('⚠️ Submit blocked: Insufficient balance', { 
          balance: this.walletBalance,
          required: 0.01
        });
        alert(`Insufficient wallet balance. Your balance is ${this.walletBalance.toFixed(2)} 🍎 APPLES. You need at least 0.01 🍎 APPLES (for iGas) to send messages. Please purchase 🍎 APPLES first.`);
        return;
      }

      const serviceType = this.selectedServiceType || 'unknown';
      const desiredConversationId =
        serviceType === 'dex' && this.selectedDexGarden?.id
          ? this.buildConversationId('garden', this.selectedDexGarden.id)
          : (this.selectedAppleGarden?.id
              ? this.buildConversationId('garden', this.selectedAppleGarden.id)
              : this.buildConversationId('service', serviceType));
      if (this.activeConversationId !== desiredConversationId) {
        this.setActiveConversation(desiredConversationId);
      }
      this.appendChatHistory('USER', input, { serviceType });

      this.isProcessing = true;
      const inputToSend = input;
      this.userInput = ''; // Clear input immediately
      
      try {
        const response = await this.http.post<any>(`${this.apiUrl}/api/eden-chat`, {
          input: inputToSend,
          email: this.userEmail || 'guest@example.com'
        }).toPromise();
        
        if (response && response.success) {
          console.log(`✅ Eden workflow chat processed: ${response.executionId || 'N/A'}`);
          // Workflow events will come through WebSocket
        } else {
          this.appendChatHistory('ASSISTANT', 'I received your message but got an unexpected response format.', { serviceType }, desiredConversationId);
        }
      } catch (error: any) {
        console.error('❌ Error calling /api/eden-chat:', error);
        this.appendChatHistory('ASSISTANT', `Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`, { serviceType }, desiredConversationId);
      } finally {
        this.isProcessing = false;
        // DON'T clear selectedServiceType, selectedDexGarden, selectedAppleGarden here
        // They should persist so user can continue chatting with the same garden/service
        // Only clear input placeholder if no service/garden is selected
        if (!this.selectedServiceType && !this.selectedDexGarden && !this.selectedAppleGarden) {
          this.inputPlaceholder = 'Select a service type above or type your query...';
        }
        this.cdr.detectChanges();
      }
      return;
    }

    // If no service type detected and not an Eden workflow query, treat this as a regular chat message (informational query).
    // Call the /api/chat endpoint which handles informational queries with LLM + RAG
    console.log(`💬 Routing to /api/chat (regular informational query)`);
    const regularConversationId = this.buildConversationId('service', 'chat');
    if (this.activeConversationId !== regularConversationId) {
      this.setActiveConversation(regularConversationId);
    }

    this.appendChatHistory('USER', input, { serviceType: 'chat' }, regularConversationId);
    
    // Call server API for informational queries (LLM will handle Eden vs general knowledge)
    this.isProcessing = true;
    const inputToSend = input;
    this.userInput = ''; // Clear input immediately
    
    try {
      const response = await this.http.post<any>(`${this.apiUrl}/api/chat`, {
        input: inputToSend,
        email: this.userEmail || 'guest@example.com'
      }).toPromise();
      
      if (response && response.message) {
        this.appendChatHistory('ASSISTANT', response.message, { serviceType: 'chat' }, regularConversationId);
      } else {
        this.appendChatHistory('ASSISTANT', 'I received your message but got an unexpected response format.', { serviceType: 'chat' }, regularConversationId);
      }
    } catch (error: any) {
      console.error('❌ Error calling /api/chat:', error);
      this.appendChatHistory('ASSISTANT', `Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`, { serviceType: 'chat' }, regularConversationId);
    } finally {
      this.isProcessing = false;
      // DON'T clear selectedServiceType, selectedDexGarden, selectedAppleGarden here
      // They should persist so user can continue chatting with the same garden/service
      // Only clear input placeholder if no service/garden is selected
      if (!this.selectedServiceType && !this.selectedDexGarden && !this.selectedAppleGarden) {
        this.inputPlaceholder = 'Select a service type above or type your query...';
      }
      this.amcWorkflowActive = false;
      this.activeWorkflowExecutionId = null;
      this.cdr.detectChanges();
    }
    return;

    // From here: workflow path (requires iGas)
    const serviceType = this.selectedServiceType || 'unknown';

    // Check balance before submitting workflow
    if (!this.hasSufficientBalance()) {
      console.log('⚠️ Submit blocked: Insufficient balance', { 
        balance: this.walletBalance,
        required: 0.01
      });
      alert(`Insufficient wallet balance. Your balance is ${this.walletBalance.toFixed(2)} 🍎 APPLES. You need at least 0.01 🍎 APPLES (for iGas) to send messages. Please purchase 🍎 APPLES first.`);
      return;
    }

    // Ensure chat history conversation is aligned to the service we're about to run.
    // NOTE: activeConversationId can be left over from a previous tile; don't rely on "null" checks.
    let desiredConversationId: string;
    if (serviceType === 'dex') {
      const dexGarden = this.selectedDexGarden;
      if (dexGarden !== null && dexGarden !== undefined) {
        const gardenId = (dexGarden as NonNullable<typeof dexGarden>).id;
        if (gardenId) {
          desiredConversationId = this.buildConversationId('garden', gardenId);
        } else {
          desiredConversationId = this.buildConversationId('service', serviceType);
        }
      } else {
        desiredConversationId = this.buildConversationId('service', serviceType);
      }
    } else {
      const appleGarden = this.selectedAppleGarden;
      if (appleGarden !== null && appleGarden !== undefined) {
        const gardenId = (appleGarden as NonNullable<typeof appleGarden>).id;
        if (gardenId) {
          desiredConversationId = this.buildConversationId('garden', gardenId);
        } else {
          desiredConversationId = this.buildConversationId('service', serviceType);
        }
      } else {
        desiredConversationId = this.buildConversationId('service', serviceType);
      }
    }
    if (this.activeConversationId !== desiredConversationId) {
      this.setActiveConversation(desiredConversationId);
    }
    this.appendChatHistory('USER', this.userInput, { serviceType });

    console.log('📤 Submitting chat message:', this.userInput);
    console.log(`📋 Context: Service Type = ${serviceType}`);
    
    this.isProcessing = true;
    const chatInput = this.userInput.trim();

    // New chat started: tell all panels to clear immediately (before workflow/execution id exists).
    try {
      window.dispatchEvent(new CustomEvent('eden_chat_reset', { detail: { reason: 'new_chat' } }));
    } catch {}
    this.userInput = ''; // Clear input after submission
    // Save serviceType before resetting (needed for finally block)
    const workflowServiceType = serviceType;
    this.selectedServiceType = null; // Reset context
    this.inputPlaceholder = 'Select a service type above or type your query...';
    
    // Force change detection to update UI
    this.cdr.detectChanges();

    // Set a safety timeout to ensure isProcessing is always reset (reduced to 30 seconds)
    const safetyTimeout = setTimeout(() => {
      if (this.isProcessing) {
        console.warn('⚠️ Safety timeout: Resetting isProcessing flag after 30 seconds');
        this.isProcessing = false;
        this.cdr.detectChanges();
      }
    }, 30000); // 30 seconds safety timeout

    try {
      // Automatically start workflow for the selected service type
      console.log(`🎬 [Workflow] Automatically starting ${workflowServiceType} workflow for chat input:`, chatInput);
      // New chat = new execution. Clear the chat console immediately and ignore any late events from the prior run.
      this.activeWorkflowExecutionId = null;
      this.amcWorkflowActive = true;
      this.workflowMessages = [];

      // Ensure workflow is loaded before starting
      console.log(`🔄 [Workflow] Ensuring ${workflowServiceType} workflow is loaded...`);
      this.flowWiseService.loadWorkflowIfNeeded(workflowServiceType);
      
      // Wait a bit for workflow to load if it was just requested
      // Check if workflow is loaded, if not wait and retry
      let workflowLoaded = false;
      let retries = 0;
      const maxRetries = 10; // Wait up to 5 seconds (10 * 500ms)
      
      let loadedWorkflow: any = null;
      while (!workflowLoaded && retries < maxRetries) {
        const workflow = this.flowWiseService.getWorkflow(workflowServiceType);
        if (workflow) {
          loadedWorkflow = workflow;
          console.log(`✅ [Workflow] ${workflowServiceType} workflow is loaded: ${loadedWorkflow.name}`);
          workflowLoaded = true;
          break; // Exit loop once workflow is loaded
        } else {
          console.log(`⏳ [Workflow] Waiting for ${workflowServiceType} workflow to load... (attempt ${retries + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        }
      }
      
      if (!workflowLoaded) {
        console.error(`❌ [Workflow] Failed to load ${workflowServiceType} workflow after ${maxRetries} attempts`);
        alert(`Failed to load ${workflowServiceType} workflow. Please try again.`);
        this.amcWorkflowActive = false;
        this.isProcessing = false;
        this.cdr.detectChanges();
        return;
      }

      // Create service-type-agnostic mock data based on serviceType
      const mockData = this.createMockDataForServiceType(workflowServiceType);
      
      console.log(`🚀 [Workflow] Starting ${workflowServiceType} workflow execution...`);
      let execution = this.flowWiseService.startWorkflow(workflowServiceType, {
        input: chatInput,
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
        console.error(`❌ [Workflow] Failed to start ${workflowServiceType} workflow even though it's loaded`);
        alert(`Failed to start ${workflowServiceType} workflow. Please try again.`);
        this.amcWorkflowActive = false;
        this.isProcessing = false;
        this.cdr.detectChanges();
        return;
      }

      // At this point, execution is guaranteed to be non-null (we checked above)
      // TypeScript needs explicit type assertion since control flow analysis doesn't work here
      const workflowExecution = execution as NonNullable<typeof execution>;
      console.log(`🚀 [Workflow] ${workflowServiceType} workflow started successfully:`, workflowExecution.executionId);
      console.log(`🚀 [Workflow] Execution details:`, {
        executionId: workflowExecution.executionId,
        serviceType: workflowExecution.serviceType,
        currentStep: workflowExecution.currentStep,
        workflowId: workflowExecution.workflowId
      });

      // Scope the "chat console output" to this execution so starting a new chat always clears it.
      this.activeWorkflowExecutionId = String(workflowExecution.executionId);
      // Notify WorkflowChatDisplay tab (separate component) to clear immediately.
      try {
        window.dispatchEvent(new CustomEvent('eden_workflow_started', { detail: { executionId: this.activeWorkflowExecutionId } }));
      } catch {}

      // Bind this execution to the current chat history conversation so assistant replies cannot leak across tiles.
      const conversationId = this.activeConversationId;
      if (conversationId !== null && conversationId !== undefined) {
        const validConversationId = conversationId as string;
        this.conversationIdByExecutionId.set(String(workflowExecution.executionId), validConversationId);
      }
      
      // Add user message to workflow chat
      this.workflowMessages.push({
        type: 'user_message',
        message: chatInput,
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
      
      // Reset processing state on error
      this.isProcessing = false;
      this.cdr.detectChanges();
    } finally {
      // Clear safety timeout
      clearTimeout(safetyTimeout);
      
      // Always reset processing state for workflow path (workflows run asynchronously)
      // Note: For chat path, isProcessing is reset in its own finally block at line 3247
      // For workflow path, reset immediately after workflow starts
      console.log('🔄 [Workflow] Resetting isProcessing after workflow start');
      this.isProcessing = false;
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
      
      // Additional safety check after 1 second
      setTimeout(() => {
        if (this.isProcessing) {
          console.error('❌ CRITICAL: isProcessing still true after 1 second! Force resetting...');
          this.isProcessing = false;
          this.cdr.detectChanges();
        }
      }, 1000);
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

    console.log(`✅ [AMC Workflow] ========================================`);
    console.log(`✅ [AMC Workflow] SUBMITTING DECISION`);
    console.log(`✅ [AMC Workflow] Decision value: ${decision}`);
    console.log(`✅ [AMC Workflow] Execution ID: ${this.pendingDecision.executionId}`);
    console.log(`✅ [AMC Workflow] Step ID: ${this.pendingDecision.stepId}`);
    console.log(`✅ [AMC Workflow] Prompt: ${this.pendingDecision.prompt}`);
    console.log(`✅ [AMC Workflow] Available options:`, this.pendingDecision.options);
    console.log(`✅ [AMC Workflow] Expected decision for view_movie: DONE_WATCHING`);
    if (this.pendingDecision.stepId === 'view_movie' && decision !== 'DONE_WATCHING') {
      console.error(`❌ [AMC Workflow] ERROR: view_movie step received "${decision}" instead of "DONE_WATCHING"!`);
      console.error(`❌ [AMC Workflow] This might be a selection from a previous step`);
    }
    console.log(`✅ [AMC Workflow] ========================================`);

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
    this.activeWorkflowExecutionId = null;
    this.workflowMessages = [];
    this.showDecisionPrompt = false;
    this.pendingDecision = null;
    this.cdr.detectChanges();
  }

  getVideoUrl(videoUrl: string | undefined): string {
    if (!videoUrl) return '';
    // Ensure the video URL is absolute
    if (videoUrl.startsWith('/')) {
      return `${getApiBaseUrl()}${videoUrl}`;
    }
    return videoUrl;
  }

  /**
   * Check if user has registered username and prompt if needed
   */
  checkAndPromptUsernameRegistration(email: string, googleUserId: string): void {
    console.log(`🎭 [Identity] checkAndPromptUsernameRegistration called - email: ${email}, googleUserId: ${googleUserId}`);
    
    // If no Google user ID provided, show registration immediately
    if (!googleUserId || googleUserId.trim() === '') {
      console.log(`🎭 [Identity] No Google user ID provided, showing registration immediately`);
      this.googleUserIdForRegistration = `email_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
      this.emailForRegistration = email;
      this.showUsernameRegistration = true;
      this.cdr.detectChanges();
      setTimeout(() => {
        this.cdr.detectChanges();
      }, 100);
      return;
    }
    
    this.isCheckingUsername = true;
    
    // Check if user already exists by Google ID
    this.identityService.getUserByGoogleId(googleUserId).subscribe({
      next: (user) => {
        this.isCheckingUsername = false;
        if (user) {
          // User already has username
          this.currentEdenUser = user;
          this.identityService.setCurrentUser(user);
          console.log(`✅ [Identity] User already registered: ${user.globalUsername}`);
        } else {
          // User needs to register username
          console.log(`🎭 [Identity] User needs to register username - email: ${email}, googleUserId: ${googleUserId}`);
          this.googleUserIdForRegistration = googleUserId;
          this.emailForRegistration = email;
          this.showUsernameRegistration = true;
          console.log(`🎭 [Identity] showUsernameRegistration set to: ${this.showUsernameRegistration}`);
          this.cdr.detectChanges();
          // Force another change detection after a brief delay to ensure modal renders
          setTimeout(() => {
            console.log(`🎭 [Identity] After timeout - showUsernameRegistration: ${this.showUsernameRegistration}`);
            this.cdr.detectChanges();
          }, 100);
        }
      },
      error: (error) => {
        console.error('❌ [Identity] Failed to check user:', error);
        this.isCheckingUsername = false;
        // On error, assume user needs registration
        console.log(`🎭 [Identity] Error checking user - assuming registration needed - email: ${email}, googleUserId: ${googleUserId}`);
        this.googleUserIdForRegistration = googleUserId;
        this.emailForRegistration = email;
        this.showUsernameRegistration = true;
        console.log(`🎭 [Identity] showUsernameRegistration set to: ${this.showUsernameRegistration}`);
        this.cdr.detectChanges();
        // Force another change detection after a brief delay to ensure modal renders
        setTimeout(() => {
          console.log(`🎭 [Identity] After timeout (error case) - showUsernameRegistration: ${this.showUsernameRegistration}`);
          this.cdr.detectChanges();
        }, 100);
      }
    });
  }

  /**
   * Handle username registration completion
   */
  onUsernameRegistrationComplete(user: EdenUser): void {
    console.log(`✅ [Identity] Username registration completed: ${user.globalUsername}`);
    this.currentEdenUser = user;
    this.showUsernameRegistration = false;
    this.identityService.setCurrentUser(user);
    this.closeSignInModal();
    this.cdr.detectChanges();
  }

  /**
   * Handle username registration cancellation
   */
  onUsernameRegistrationCancel(): void {
    console.log(`❌ [Identity] Username registration cancelled`);
    this.showUsernameRegistration = false;
    // Don't close sign-in modal, let user try again
    this.cdr.detectChanges();
  }

  /**
   * Resolve usernames for garden owners
   */
  resolveGardenOwnerUsernames(gardens: Array<{ownerEmail?: string, ownerUsername?: string | null}>): void {
    const emailsToResolve = new Set<string>();
    
    // First, update gardens with cached usernames
    gardens.forEach(garden => {
      if (garden.ownerEmail && this.ownerUsernameCache.has(garden.ownerEmail)) {
        const cachedUsername = this.ownerUsernameCache.get(garden.ownerEmail);
        if (cachedUsername && !garden.ownerUsername) {
          (garden as any).ownerUsername = cachedUsername;
        }
      }
    });
    
    // Collect unique owner emails that need resolution
    gardens.forEach(garden => {
      if (garden.ownerEmail && !this.ownerUsernameCache.has(garden.ownerEmail)) {
        emailsToResolve.add(garden.ownerEmail);
      }
    });
    
    // Resolve each email to username
    emailsToResolve.forEach(email => {
      // Try to get user by email (we'll need to add this endpoint or use a workaround)
      // For now, we'll use a simple approach: check if we can get user info
      // In a real implementation, you'd have an endpoint to get user by email
      // For now, we'll use the identity service to try to resolve
      this.resolveUsernameForEmail(email).then(username => {
        if (username) {
          this.ownerUsernameCache.set(email, username);
          // Update all gardens with this owner email
          gardens.forEach(garden => {
            if (garden.ownerEmail === email) {
              (garden as any).ownerUsername = username;
            }
          });
          this.cdr.detectChanges();
        }
      });
    });
    
    // Trigger change detection after initial cache updates
    if (emailsToResolve.size === 0) {
      // All usernames were in cache, update UI immediately
      this.cdr.detectChanges();
    }
  }
  
  /**
   * Resolve username for an email address (with request deduplication)
   */
  async resolveUsernameForEmail(email: string): Promise<string | null> {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check cache first
    if (this.ownerUsernameCache.has(normalizedEmail)) {
      return this.ownerUsernameCache.get(normalizedEmail) || null;
    }
    
    // Check if there's already a pending resolution for this email
    if (this.pendingUsernameResolutions.has(normalizedEmail)) {
      return this.pendingUsernameResolutions.get(normalizedEmail)!;
    }
    
    // Create new resolution promise
    const resolutionPromise = (async () => {
      try {
        // Check if it's the current user first (fast path)
        if (this.currentEdenUser && this.currentEdenUser.primaryEmail?.toLowerCase() === normalizedEmail) {
          const resolved = this.identityService.resolveDisplayName(undefined, this.currentEdenUser);
          this.ownerUsernameCache.set(normalizedEmail, resolved.displayName);
          this.pendingUsernameResolutions.delete(normalizedEmail);
          return resolved.displayName;
        }
        
        // Query server for user by email (now with caching in identity service)
        const user = await firstValueFrom(this.identityService.getUserByEmail(normalizedEmail));
        if (user) {
          const resolved = this.identityService.resolveDisplayName(undefined, user);
          this.ownerUsernameCache.set(normalizedEmail, resolved.displayName);
          this.pendingUsernameResolutions.delete(normalizedEmail);
          return resolved.displayName;
        }
      } catch (error) {
        console.error(`❌ [Identity] Failed to resolve username for email ${normalizedEmail}:`, error);
        this.pendingUsernameResolutions.delete(normalizedEmail);
      }
      
      return null;
    })();
    
    // Store pending resolution
    this.pendingUsernameResolutions.set(normalizedEmail, resolutionPromise);
    
    return resolutionPromise;
  }

  /**
   * Get display name for garden owner (username or email fallback)
   */
  getGardenOwnerDisplayName(garden: {ownerEmail?: string, ownerUsername?: string | null}): string {
    // If garden already has username, use it
    if (garden.ownerUsername) {
      return `@${garden.ownerUsername}`;
    }
    
    // If we have the email, check cache first
    if (garden.ownerEmail) {
      // Check if cache has username for this email
      if (this.ownerUsernameCache.has(garden.ownerEmail)) {
        const cachedUsername = this.ownerUsernameCache.get(garden.ownerEmail);
        if (cachedUsername) {
          // Update garden object with cached username
          (garden as any).ownerUsername = cachedUsername;
          return `@${cachedUsername}`;
        }
      }
      
      // Cache doesn't have it, try to resolve (async, will update later)
      // Only trigger resolution if not already pending
      if (!this.ownerUsernameCache.has(garden.ownerEmail) && !this.pendingUsernameResolutions.has(garden.ownerEmail.toLowerCase().trim())) {
        this.resolveUsernameForEmail(garden.ownerEmail).then(username => {
          if (username) {
            (garden as any).ownerUsername = username;
            this.cdr.detectChanges();
          }
        });
      }
      
      // Show email as fallback while resolving
      return garden.ownerEmail;
    }
    
    return 'N/A';
  }

}

