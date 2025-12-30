import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';

interface ComponentStatus {
  name: string;
  status: 'idle' | 'active' | 'success' | 'error';
  lastUpdate: number;
  count: number;
  category?: 'root' | 'indexer' | 'service-provider' | 'service-registry' | 'llm' | 'edencore' | 'user' | 'infrastructure';
}

interface ComponentGroup {
  name: string;
  icon: string;
  components: ComponentStatus[];
  expanded: boolean;
  category: ComponentStatus['category'] | 'root';
}

interface GardenInfo {
  id: string;
  name: string;
  stream: string;
  active: boolean;
  type?: 'root' | 'regular' | 'token'; // 'root' = Holy Ghost (ROOT CA's garden)
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit, OnDestroy {
  components: Map<string, ComponentStatus> = new Map();
  groups: ComponentGroup[] = [];
  gardens: GardenInfo[] = []; // Gardens (formerly called indexers)
  selectedGardenTab: string = '';
  selectedGardenComponents: ComponentStatus[] = [];
  serviceProviders: Map<string, {id: string, name: string, serviceType: string, gardenId: string}> = new Map(); // Store service providers from ServiceRegistry
  viewMode: 'god' | 'priest' = 'god'; // GOD mode shows ROOT CA, Priest mode hides it
  private subscription: any;
  private apiUrl = window.location.hostname === 'localhost' && window.location.port === '4200' 
    ? 'http://localhost:3000' 
    : `${window.location.protocol}//${window.location.host}`;

  constructor(
    private wsService: WebSocketService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    // Load view mode from localStorage (default: 'god')
    const savedMode = localStorage.getItem('edenViewMode');
    if (savedMode === 'god' || savedMode === 'priest') {
      this.viewMode = savedMode;
    }
    
    // Fetch gardens from server
    this.fetchGardens();
    
    // Fetch service providers from ServiceRegistry
    this.fetchServiceProviders();
    
    // Initialize hierarchical component structure based on whitepaper architecture
    this.initializeHierarchy();
    
    this.subscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      this.updateComponentStatus(event);
      this.updateSelectedGardenComponents();
    });
    
    // Listen for garden refresh events (triggered after wallet reset)
    window.addEventListener('storage', (e) => {
      if (e.key === 'edenRefreshGardens') {
        console.log('🔄 Refreshing gardens after wallet reset...');
        this.fetchGardens();
        this.fetchServiceProviders();
      }
    });
    
    // Also listen for same-window events (since storage event only fires in other windows)
    const originalSetItem = localStorage.setItem;
    const self = this;
    localStorage.setItem = function(key: string, value: string) {
      originalSetItem.apply(this, arguments as any);
      if (key === 'edenRefreshGardens') {
        console.log('🔄 Refreshing gardens after wallet reset...');
        setTimeout(() => {
          self.fetchGardens();
          self.fetchServiceProviders();
        }, 100);
      }
    };
  }
  
  setViewMode(mode: 'god' | 'priest') {
    this.viewMode = mode;
    localStorage.setItem('edenViewMode', mode);
    
    // If switching to Priest mode and Holy Ghost is selected, switch to first non-HG garden
    if (mode === 'priest' && this.selectedGardenTab === 'HG') {
      const nonHGGardens = this.getFilteredGardens();
      if (nonHGGardens.length > 0) {
        this.selectedGardenTab = nonHGGardens[0].id;
        this.updateSelectedGardenComponents();
      } else {
        this.selectedGardenTab = '';
      }
    }
    
    // If switching to GOD mode and no tab is selected, select first garden
    if (mode === 'god' && !this.selectedGardenTab && this.gardens.length > 0) {
      this.selectedGardenTab = this.gardens[0].id;
      this.updateSelectedGardenComponents();
    }
  }
  
  // Get filtered gardens based on view mode
  getFilteredGardens(): GardenInfo[] {
    if (this.viewMode === 'priest') {
      // Priest mode: hide Holy Ghost (HG)
      return this.gardens.filter(i => i.id !== 'HG');
    }
    // GOD mode: show all gardens
    return this.gardens;
  }
  
  fetchServiceProviders() {
    // Query all service providers from ServiceRegistry
    this.http.get<{success: boolean, providers: Array<{id: string, name: string, serviceType: string, indexerId: string, status: string}>}>(`${this.apiUrl}/api/root-ca/service-registry`)
      .subscribe({
        next: (response) => {
          if (response.success && response.providers) {
            // Store all service providers (including Snake services)
            response.providers.forEach(provider => {
              if (provider.status === 'active') {
                this.serviceProviders.set(provider.id, {
                  id: provider.id,
                  name: provider.name,
                  serviceType: provider.serviceType,
                  gardenId: provider.indexerId // API still returns indexerId, map to gardenId
                });
                
                // Add component for this service provider if it doesn't exist
                const componentKey = this.mapProviderIdToComponentKey(provider.id);
                if (!this.components.has(componentKey)) {
                  this.addComponent(componentKey, provider.name, 'service-provider');
                }
              }
            });
            
            // Update groups to reflect new service providers
            this.updateGroups();
            this.updateSelectedGardenComponents();
          }
        },
        error: (err) => {
          console.error('Failed to fetch service providers:', err);
        }
      });
  }
  
  mapProviderIdToComponentKey(providerId: string): string {
    // Map provider IDs to component keys
    // e.g., "snake-premium-cinema-001" -> "snake-premium-cinema-api"
    // e.g., "amc-001" -> "amc-api"
    const normalized = providerId.toLowerCase();
    
    // Infrastructure services (Holy Ghost)
    if (normalized === 'stripe-payment-rail-001' || normalized.startsWith('stripe-payment-rail')) {
      return 'stripe-payment-rail';
    }
    if (normalized === 'settlement-service-001' || normalized.startsWith('settlement-service')) {
      return 'settlement-service';
    }
    if (normalized === 'service-registry-001' || normalized.startsWith('service-registry')) {
      return 'service-registry';
    }
    if (normalized === 'webserver-service-001' || normalized.startsWith('webserver-service')) {
      return 'webserver-service';
    }
    if (normalized === 'websocket-service-001' || normalized.startsWith('websocket-service')) {
      return 'websocket-service';
    }
    if (normalized === 'wallet-service-001' || normalized.startsWith('wallet-service')) {
      return 'wallet-service';
    }
    
    if (normalized.startsWith('snake-')) {
      // Snake services: "snake-premium-cinema-001" -> "snake-premium-cinema-api"
      return normalized.replace(/-\d+$/, '-api');
    }
    
    if (normalized.startsWith('amc-')) {
      return 'amc-api';
    }
    if (normalized.startsWith('moviecom-')) {
      return 'moviecom-api';
    }
    if (normalized.startsWith('cinemark-')) {
      return 'cinemark-api';
    }
    if (normalized.startsWith('dex-pool-')) {
      // DEX pools: "dex-pool-tokena" -> "dex-pool-tokena-api"
      return normalized + '-api';
    }
    
    // Default: convert provider ID to component key
    return normalized.replace(/-\d+$/, '-api');
  }
  
  fetchGardens() {
    // API still uses "indexers" endpoint and response field for backward compatibility
    this.http.get<{success: boolean, indexers: GardenInfo[]}>(`${this.apiUrl}/api/indexers`)
      .subscribe({
        next: (response) => {
          if (response.success && response.indexers) {
            this.gardens = response.indexers.filter(i => i.active);
            
            // Select first available garden based on view mode
            const filteredGardens = this.getFilteredGardens();
            if (filteredGardens.length > 0) {
              // If current selection is invalid for current mode, switch to first valid one
              if (!filteredGardens.find(i => i.id === this.selectedGardenTab)) {
                this.selectedGardenTab = filteredGardens[0].id;
              }
              this.updateSelectedGardenComponents();
            } else if (this.gardens.length > 0) {
              // Fallback: select first garden if filtered list is empty but we have gardens
              this.selectedGardenTab = this.gardens[0].id;
              this.updateSelectedGardenComponents();
            }
            this.updateGroups();
          }
        },
        error: (err) => {
          console.error('Failed to fetch gardens:', err);
          // Fallback to default gardens if API fails
          this.gardens = [
            { id: 'A', name: 'Garden-A', stream: 'eden:garden:A', active: true },
            { id: 'B', name: 'Garden-B', stream: 'eden:garden:B', active: true }
          ];
          this.selectedGardenTab = 'A';
          this.updateSelectedGardenComponents();
          this.updateGroups();
        }
      });
  }
  
  selectGardenTab(gardenId: string) {
    this.selectedGardenTab = gardenId;
    this.updateSelectedGardenComponents();
  }
  
  updateSelectedGardenComponents() {
    if (this.selectedGardenTab) {
      this.selectedGardenComponents = this.getComponentsForGarden(this.selectedGardenTab);
    } else {
      this.selectedGardenComponents = [];
    }
  }
  
  initializeHierarchy() {
    // 1. ROOT CA (Law / Moses) - Top level
    this.addComponent('root-ca', 'ROOT CA', 'root');
    
    // 2. Gardens (Knowledge Trees) - Federated nodes
    this.addComponent('garden-a', 'Garden A', 'indexer');
    this.addComponent('garden-b', 'Garden B', 'indexer');
    this.addComponent('redis', 'Replication Bus', 'indexer');
    
    // 3. Service Providers (Apples on Trees)
    this.addComponent('amc-api', 'AMC Theatres', 'service-provider');
    this.addComponent('moviecom-api', 'MovieCom', 'service-provider');
    this.addComponent('cinemark-api', 'Cinemark', 'service-provider');
    
    // 4. Service Registry & Routing
    this.addComponent('service-registry', 'Service Registry', 'service-registry');
    
    // 5. LLM (Intelligence Layer)
    this.addComponent('llm', 'LLM Intelligence', 'llm');
    
    // 6. EdenCore (Ledger + Snapshots)
    this.addComponent('ledger', 'Ledger', 'edencore');
    this.addComponent('cashier', 'Cashier', 'edencore');
    this.addComponent('snapshot', 'Snapshots', 'edencore');
    this.addComponent('transaction', 'Transactions', 'edencore');
    
    // 7. Users
    this.addComponent('user', 'Users', 'user');
    
    // 8. Infrastructure
    this.addComponent('websocket', 'WebSocket', 'infrastructure');
    
    this.updateGroups();
  }
  
  addComponent(key: string, displayName: string, category: ComponentStatus['category']) {
    this.components.set(key, {
      name: displayName,
      status: 'idle',
      lastUpdate: Date.now(),
      count: 0,
      category: category
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  updateComponentStatus(event: SimulatorEvent) {
    const componentName = event.component.toLowerCase();
    let status: ComponentStatus['status'] = 'active';
    
    if (event.type === 'error') {
      status = 'error';
    } else if (event.type.includes('success') || event.type.includes('complete')) {
      status = 'success';
    }
    
    // Map event component names to our component keys
    const componentKey = this.mapEventToComponentKey(componentName, event.type);
    
    const component = this.components.get(componentKey);
    if (component) {
      component.status = status;
      component.lastUpdate = event.timestamp;
      component.count++;
      
      // Reset to idle after 2 seconds if not error
      if (status !== 'error') {
        setTimeout(() => {
          const comp = this.components.get(componentKey);
          if (comp && comp.status === status) {
            comp.status = 'idle';
            this.updateGroups();
          }
        }, 2000);
      }
    } else {
      // Dynamically add new components (e.g., new indexers or service providers)
      const category = this.inferCategory(componentName, event.type);
      this.addComponent(componentKey, this.formatComponentName(componentName), category);
      const newComponent = this.components.get(componentKey);
      if (newComponent) {
        newComponent.status = status;
        newComponent.lastUpdate = event.timestamp;
        newComponent.count = 1;
      }
    }
    
    this.updateGroups();
  }
  
  mapEventToComponentKey(eventComponent: string, eventType: string): string {
    // Normalize component name
    const normalized = eventComponent.toLowerCase().trim();
    
    // Map various event component names to our standardized keys
    const mapping: { [key: string]: string } = {
      'indexer-a': 'indexer-a',
      'indexer-b': 'indexer-b',
      'indexer': 'indexer-a', // default to A if generic
      'holy-ghost': 'holy-ghost',
      'hg': 'holy-ghost',
      'redis': 'redis',
      'amc': 'amc-api',
      'amc-api': 'amc-api',
      'amc-001': 'amc-api', // Provider ID format
      'moviecom': 'moviecom-api',
      'moviecom-api': 'moviecom-api',
      'moviecom-002': 'moviecom-api', // Provider ID format
      'cinemark': 'cinemark-api',
      'cinemark-api': 'cinemark-api',
      'cinemark-003': 'cinemark-api', // Provider ID format
      'service-registry': 'service-registry',
      'service-registry-001': 'service-registry',
      'stripe-payment-rail-001': 'stripe-payment-rail',
      'stripe-payment-rail': 'stripe-payment-rail',
      'settlement-service-001': 'settlement-service',
      'settlement-service': 'settlement-service',
      'settlement': 'settlement-service',
      'webserver-service-001': 'webserver-service',
      'webserver-service': 'webserver-service',
      'webserver': 'webserver-service',
      'websocket-service-001': 'websocket-service',
      'websocket-service': 'websocket-service',
      'websocket': 'websocket-service',
      'wallet-service-001': 'wallet-service',
      'wallet-service': 'wallet-service',
      'wallet': 'wallet-service',
      'jsc': 'wallet-service',
      'jesuscoin': 'wallet-service',
      'llm': 'llm',
      'ledger': 'ledger',
      'cashier': 'cashier',
      'snapshot': 'snapshot',
      'transaction': 'transaction',
      'user': 'user',
      'igas': 'llm' // iGas is part of LLM
    };
    
    // Check exact match first
    if (mapping[normalized]) {
      return mapping[normalized];
    }
    
    // Check if it's a Snake service provider (format: snake-*)
    if (normalized.startsWith('snake-')) {
      // Check if we have this provider in ServiceRegistry
      for (const [providerId, provider] of this.serviceProviders.entries()) {
        if (providerId.toLowerCase() === normalized || 
            normalized.includes(providerId.toLowerCase().replace(/-\d+$/, ''))) {
          const componentKey = this.mapProviderIdToComponentKey(providerId);
          // Dynamically add Snake service provider component if it doesn't exist
          if (!this.components.has(componentKey)) {
            this.addComponent(componentKey, provider.name, 'service-provider');
            this.updateGroups(); // Update groups after adding new component
          }
          return componentKey;
        }
      }
      // Fallback: create component key from normalized name
      const componentKey = normalized.replace(/-\d+$/, '-api');
      if (!this.components.has(componentKey)) {
        const displayName = normalized.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        this.addComponent(componentKey, displayName, 'service-provider');
        this.updateGroups();
      }
      return componentKey;
    }
    
    // Check if it's a provider ID (format: providername-###)
    if (normalized.startsWith('amc-')) {
      return 'amc-api';
    }
    if (normalized.startsWith('moviecom-')) {
      return 'moviecom-api';
    }
    if (normalized.startsWith('cinemark-')) {
      return 'cinemark-api';
    }
    
    // Check if it's a new garden (format: indexer-*)
    if (normalized.startsWith('indexer-')) {
      // Dynamically add new gardens
      if (!this.components.has(normalized)) {
        const gardenName = normalized.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        this.addComponent(normalized, gardenName, 'indexer');
        this.updateGroups(); // Update groups after adding new component
      }
      return normalized;
    }
    
    // Check if it's a token garden (format: tokenindexer-* or token-indexer-*)
    if (normalized.startsWith('tokenindexer-') || normalized.startsWith('token-indexer-')) {
      // Dynamically add new token gardens
      if (!this.components.has(normalized)) {
        // Format: "tokenindexer-t1" -> "Garden T1"
        const parts = normalized.split('-');
        let gardenName = parts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        // Handle "tokenindexer" -> "Garden"
        gardenName = gardenName.replace(/Tokenindexer/g, 'Garden');
        this.addComponent(normalized, gardenName, 'indexer');
        this.updateGroups(); // Update groups after adding new component
      }
      return normalized;
    }
    
    // Check if it's a new service provider (format: providername-###)
    const providerMatch = normalized.match(/^([a-z]+)-\d+$/);
    if (providerMatch) {
      const providerName = providerMatch[1];
      const providerKey = `${providerName}-api`;
      // Dynamically add new service providers
      if (!this.components.has(providerKey)) {
        const displayName = providerName.charAt(0).toUpperCase() + providerName.slice(1);
        this.addComponent(providerKey, displayName, 'service-provider');
        this.updateGroups(); // Update groups after adding new component
      }
      return providerKey;
    }
    
    return normalized;
  }
  
  inferCategory(componentName: string, eventType: string): ComponentStatus['category'] {
    if (componentName.includes('indexer')) return 'indexer';
    if (componentName.includes('api') || componentName.includes('provider')) return 'service-provider';
    if (componentName.includes('registry')) return 'service-registry';
    if (componentName.includes('llm')) return 'llm';
    if (componentName.includes('ledger') || componentName.includes('cashier') || 
        componentName.includes('snapshot') || componentName.includes('transaction')) return 'edencore';
    if (componentName.includes('user')) return 'user';
    return 'infrastructure';
  }

  updateGroups() {
    // Group components by category in hierarchical order
    const groups: ComponentGroup[] = [];
    
    // 1. ROOT CA (Top level - Law/Moses)
    const rootComponents = Array.from(this.components.values())
      .filter(c => c.category === 'root');
    if (rootComponents.length > 0) {
      groups.push({
        name: 'ROOT CA',
        icon: '⚖️',
        components: rootComponents,
        expanded: true,
        category: 'root'
      });
    }
    
    // 2. Indexers (Main entity - Knowledge Trees)
    // Each Indexer (A, B, etc.) contains: Service Registry, Service Providers, LLM, EdenCore, Users
    const indexerNodes = Array.from(this.components.values())
      .filter(c => c.category === 'indexer' && !c.name.includes('Replication'))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    const replicationBus = Array.from(this.components.values())
      .filter(c => c.category === 'indexer' && c.name.includes('Replication'));
    
    // Get all shared components that belong to each Indexer
    const serviceRegistryComponents = Array.from(this.components.values())
      .filter(c => c.category === 'service-registry');
    
    const providerComponents = Array.from(this.components.values())
      .filter(c => c.category === 'service-provider')
      .sort((a, b) => a.name.localeCompare(b.name));
    
    const llmComponents = Array.from(this.components.values())
      .filter(c => c.category === 'llm');
    
    const edencoreComponents = Array.from(this.components.values())
      .filter(c => c.category === 'edencore')
      .sort((a, b) => {
        // Order: Ledger, Cashier, Snapshots, Transactions
        const order = ['Ledger', 'Cashier', 'Snapshots', 'Transactions'];
        return (order.indexOf(a.name) === -1 ? 999 : order.indexOf(a.name)) - 
               (order.indexOf(b.name) === -1 ? 999 : order.indexOf(b.name));
      });
    
    const userComponents = Array.from(this.components.values())
      .filter(c => c.category === 'user');
    
    // Create Indexers group with nested structure
    if (indexerNodes.length > 0 || replicationBus.length > 0) {
      // Combine all components that belong to Indexers
      // Structure: Each Indexer node + shared components (shown under each indexer)
      const allIndexerComponents = [
        ...indexerNodes,
        ...replicationBus,
        // Add shared components - they'll be shown under each indexer
        ...serviceRegistryComponents,
        ...providerComponents,
        ...llmComponents,
        ...edencoreComponents,
        ...userComponents
      ];
      
      groups.push({
        name: 'Indexers',
        icon: '🌳',
        components: allIndexerComponents,
        expanded: true,
        category: 'indexer'
      });
    }
    
    // 3. Infrastructure (separate from Indexers)
    const infraComponents = Array.from(this.components.values())
      .filter(c => c.category === 'infrastructure');
    if (infraComponents.length > 0) {
      groups.push({
        name: 'Infrastructure',
        icon: '🔧',
        components: infraComponents,
        expanded: false,
        category: 'infrastructure'
      });
    }
    
    this.groups = groups;
  }
  
  getGardenNodes(): ComponentStatus[] {
    // Return garden nodes that match the current tab or all if no tab selected
    const gardenNames = this.gardens.map(i => i.name);
    return Array.from(this.components.values())
      .filter(c => {
        if (c.category !== 'indexer' || c.name.includes('Replication')) return false;
        if (this.selectedGardenTab) {
          const selectedGarden = this.gardens.find(i => i.id === this.selectedGardenTab);
          return selectedGarden && c.name === selectedGarden.name;
        }
        return gardenNames.includes(c.name);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  
  getReplicationBus(): ComponentStatus[] {
    return Array.from(this.components.values())
      .filter(c => c.category === 'indexer' && c.name.includes('Replication'));
  }
  
  getComponentsForGarden(gardenId: string): ComponentStatus[] {
    // Check garden type
    // gardenId can be either the tab ID (e.g., "1", "A", "B") or the full garden ID (e.g., "indexer-1", "indexer-alpha")
    // Try to find the garden by matching both mapped ID and raw ID
    const garden = this.gardens.find(i => {
      // Check if it matches the raw garden ID
      if (i.id === gardenId) return true;
      // Map garden's full ID to tab ID and compare
      const mappedId = this.mapGardenIdToTabId(i.id);
      return mappedId === gardenId;
    });
    const isRootGarden = garden?.type === 'root'; // Holy Ghost
    const isTokenGarden = garden?.type === 'token';
    
    // Get the actual tab ID to use for matching providers
    // If gardenId is a raw ID like "indexer-1", map it to tab ID "1"
    // Otherwise use it as-is
    const tabId = garden ? this.mapGardenIdToTabId(garden.id) : gardenId;
    
    // Holy Ghost (ROOT CA's garden) shows infrastructure services
    if (isRootGarden) {
      // Filter service providers for infrastructure services (payment-rail, settlement, registry, webserver, websocket, wallet)
      const infrastructureServiceTypes = ['payment-rail', 'settlement', 'registry', 'webserver', 'websocket', 'wallet'];
      // Match components by their key (which is derived from provider ID)
      let providerComponents = Array.from(this.components.entries())
        .filter(([componentKey, c]) => {
          if (c.category !== 'service-provider') return false;
          
          // Find the service provider in our ServiceRegistry map by matching component key
          for (const [providerId, provider] of this.serviceProviders.entries()) {
            // Get the expected component key for this provider
            const expectedComponentKey = this.mapProviderIdToComponentKey(providerId);
            
            // Match if component key matches expected key
            if (componentKey === expectedComponentKey) {
              // Skip providers without gardenId
              if (!provider.gardenId) return false;
              // Check if this provider belongs to Holy Ghost (gardenId: "HG")
              const mappedGardenId = this.mapGardenIdToTabId(provider.gardenId);
              
              if (mappedGardenId === tabId && infrastructureServiceTypes.includes(provider.serviceType)) {
                return true;
              }
            }
          }
          return false;
        })
        .map(([_, c]) => c); // Extract component values
      
      // Sort infrastructure services
      providerComponents = providerComponents.sort((a, b) => a.name.localeCompare(b.name));
      
      const llmComponents = Array.from(this.components.values())
        .filter(c => c.category === 'llm');
      
      const edencoreComponents = Array.from(this.components.values())
        .filter(c => c.category === 'edencore')
        .sort((a, b) => {
          const order = ['Ledger', 'Cashier', 'Snapshots', 'Transactions'];
          return (order.indexOf(a.name) === -1 ? 999 : order.indexOf(a.name)) - 
                 (order.indexOf(b.name) === -1 ? 999 : order.indexOf(b.name));
        });
      
      const userComponents = Array.from(this.components.values())
        .filter(c => c.category === 'user');
      
      return [
        ...providerComponents,
        ...llmComponents,
        ...edencoreComponents,
        ...userComponents
      ];
    }
    
    // Regular and Token Gardens - filter service providers based on gardenId from ServiceRegistry
    // Show ALL providers that are registered with this garden in the backend ServiceRegistry
    // The backend determines which providers belong to which garden via the gardenId field
    let providerComponents = Array.from(this.components.entries())
      .filter(([componentKey, c]) => {
        if (c.category !== 'service-provider') return false;
        
        // Find the service provider in our ServiceRegistry map by matching component key to provider ID
        let belongsToGarden = false;
        
        // Match component key to provider ID using the reverse mapping
        for (const [providerId, provider] of this.serviceProviders.entries()) {
          // Get the expected component key for this provider
          const expectedComponentKey = this.mapProviderIdToComponentKey(providerId);
          
          // Match if component key matches expected key
          if (componentKey === expectedComponentKey) {
            // Skip providers without gardenId
            if (!provider.gardenId) {
              break;
            }
            // Map provider's gardenId to sidebar tab ID
            const mappedGardenId = this.mapGardenIdToTabId(provider.gardenId);
            
            if (mappedGardenId === tabId) {
              belongsToGarden = true;
              break;
            }
          }
        }
        
        // Show all providers that belong to this garden according to the backend ServiceRegistry
        return belongsToGarden;
      })
      .map(([_, c]) => c); // Extract component values
    
    // Sort providers
    providerComponents = providerComponents.sort((a, b) => a.name.localeCompare(b.name));
    
    const llmComponents = Array.from(this.components.values())
      .filter(c => c.category === 'llm');
    
    const edencoreComponents = Array.from(this.components.values())
      .filter(c => c.category === 'edencore')
      .sort((a, b) => {
        const order = ['Ledger', 'Cashier', 'Snapshots', 'Transactions'];
        return (order.indexOf(a.name) === -1 ? 999 : order.indexOf(a.name)) - 
               (order.indexOf(b.name) === -1 ? 999 : order.indexOf(b.name));
      });
    
    const userComponents = Array.from(this.components.values())
      .filter(c => c.category === 'user');
    
    // NOTE: ServiceRegistry is NOT included here - it's displayed under ROOT CA
    return [
      ...providerComponents,
      ...llmComponents,
      ...edencoreComponents,
      ...userComponents
    ];
  }
  
  toggleGroup(group: ComponentGroup) {
    group.expanded = !group.expanded;
  }

  formatComponentName(name: string): string {
    return name.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  getStatusClass(status: ComponentStatus['status']): string {
    return `component-indicator ${status}`;
  }

  getStatusIcon(status: ComponentStatus['status']): string {
    switch (status) {
      case 'active':
        return '🔄';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '⚪';
    }
  }
  
  getCategoryColor(category: ComponentStatus['category']): string {
    switch (category) {
      case 'root':
        return 'text-danger'; // Red for ROOT CA (Law)
      case 'indexer':
        return 'text-success'; // Green for Gardens (Knowledge Trees)
      case 'service-provider':
        return 'text-primary'; // Blue for Service Providers
      case 'service-registry':
        return 'text-info'; // Cyan for Service Registry
      case 'llm':
        return 'text-warning'; // Yellow for LLM (Intelligence)
      case 'edencore':
        return 'text-secondary'; // Gray for EdenCore
      case 'user':
        return 'text-dark'; // Dark for Users
      default:
        return 'text-muted';
    }
  }
  
  getSubComponents(components: ComponentStatus[], category: ComponentStatus['category']): ComponentStatus[] {
    return components.filter(c => c.category === category);
  }
  
  get selectedGardenName(): string {
    const garden = this.gardens.find(i => i.id === this.selectedGardenTab);
    return garden ? garden.name : 'Garden';
  }
  
  get selectedGardenServiceRegistry(): ComponentStatus[] {
    // ServiceRegistry belongs to ROOT CA, not gardens
    return [];
  }
  
  get rootCAServiceRegistry(): ComponentStatus[] {
    // ServiceRegistry belongs to ROOT CA
    return Array.from(this.components.values())
      .filter(c => c.category === 'service-registry');
  }
  
  get selectedGardenServiceProviders(): ComponentStatus[] {
    return this.selectedGardenComponents.filter(c => c.category === 'service-provider');
  }
  
  // Helper method to find provider for a component
  private findProviderForComponent(component: ComponentStatus): {id: string, name: string, serviceType: string, gardenId: string} | null {
    // Try to find component key by matching component object reference
    const componentEntry = Array.from(this.components.entries()).find(([_, comp]) => comp === component);
    if (!componentEntry) {
      // Fallback: try matching by name
      for (const [providerId, provider] of this.serviceProviders.entries()) {
        if (provider.name === component.name) {
          return provider;
        }
      }
      return null;
    }
    const [componentKey] = componentEntry;
    
    // Match component key to provider ID
    for (const [providerId, provider] of this.serviceProviders.entries()) {
      const expectedComponentKey = this.mapProviderIdToComponentKey(providerId);
      if (componentKey === expectedComponentKey) {
        return provider;
      }
    }
    return null;
  }
  
  get selectedGardenInfrastructureServices(): ComponentStatus[] {
    const infrastructureServiceTypes = ['payment-rail', 'settlement', 'registry', 'webserver', 'websocket', 'wallet'];
    return this.selectedGardenComponents.filter(c => {
      if (c.category !== 'service-provider') return false;
      const provider = this.findProviderForComponent(c);
      return provider !== null && infrastructureServiceTypes.includes(provider.serviceType);
    });
  }
  
  get selectedGardenRegularServiceProviders(): ComponentStatus[] {
    const infrastructureServiceTypes = ['payment-rail', 'settlement', 'registry', 'webserver', 'websocket', 'wallet'];
    // Return all service providers that are NOT infrastructure services
    // Since selectedGardenComponents already contains correctly filtered components for this garden,
    // we just need to filter out infrastructure services
    return this.selectedGardenComponents.filter(c => {
      if (c.category !== 'service-provider') return false;
      const provider = this.findProviderForComponent(c);
      if (provider === null) return false;
      return !infrastructureServiceTypes.includes(provider.serviceType);
    });
  }
  
  get selectedGardenLLM(): ComponentStatus[] {
    return this.selectedGardenComponents.filter(c => c.category === 'llm');
  }
  
  get selectedGardenEdenCore(): ComponentStatus[] {
    return this.selectedGardenComponents.filter(c => c.category === 'edencore');
  }
  
  get selectedGardenUsers(): ComponentStatus[] {
    return this.selectedGardenComponents.filter(c => c.category === 'user');
  }
  
  get selectedGardenNodeCount(): number {
    const nodes = this.getGardenNodes();
    return nodes.length > 0 ? nodes[0].count : 0;
  }
  
  mapGardenIdToTabId(gardenId: string | undefined): string {
    // Map ServiceRegistry gardenId to sidebar tab ID
    // "HG" -> "HG" (Holy Ghost)
    // "indexer-alpha" -> "A", "indexer-beta" -> "B", "Garden-T1" -> "Garden-T1", etc.
    if (!gardenId) {
      return ''; // Return empty string if gardenId is undefined/null
    }
    if (gardenId === 'HG') {
      return 'HG'; // Holy Ghost garden
    }
    if (gardenId.startsWith('indexer-')) {
      // Extract letter from "indexer-alpha" -> "A", "indexer-beta" -> "B"
      const parts = gardenId.split('-');
      if (parts.length >= 2) {
        const letter = parts[1].charAt(0).toUpperCase();
        return letter;
      }
    }
    // For token gardens, return as-is
    if (gardenId.startsWith('Garden-')) {
      return gardenId;
    }
    // Default: return first character uppercase
    return gardenId.charAt(0).toUpperCase();
  }
}

