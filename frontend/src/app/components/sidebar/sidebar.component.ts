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

interface IndexerInfo {
  id: string;
  name: string;
  stream: string;
  active: boolean;
  type?: 'regular' | 'token';
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit, OnDestroy {
  components: Map<string, ComponentStatus> = new Map();
  groups: ComponentGroup[] = [];
  indexers: IndexerInfo[] = [];
  selectedIndexerTab: string = '';
  selectedIndexerComponents: ComponentStatus[] = [];
  serviceProviders: Map<string, {id: string, name: string, serviceType: string, indexerId: string}> = new Map(); // Store service providers from ServiceRegistry
  private subscription: any;
  private apiUrl = window.location.hostname === 'localhost' && window.location.port === '4200' 
    ? 'http://localhost:3000' 
    : `${window.location.protocol}//${window.location.host}`;

  constructor(
    private wsService: WebSocketService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    // Fetch indexers from server
    this.fetchIndexers();
    
    // Fetch service providers from ServiceRegistry
    this.fetchServiceProviders();
    
    // Initialize hierarchical component structure based on whitepaper architecture
    this.initializeHierarchy();
    
    this.subscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      this.updateComponentStatus(event);
      this.updateSelectedIndexerComponents();
    });
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
                  indexerId: provider.indexerId
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
            this.updateSelectedIndexerComponents();
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
  
  fetchIndexers() {
    this.http.get<{success: boolean, indexers: IndexerInfo[]}>(`${this.apiUrl}/api/indexers`)
      .subscribe({
        next: (response) => {
          if (response.success && response.indexers) {
            this.indexers = response.indexers.filter(i => i.active);
            if (this.indexers.length > 0) {
              this.selectedIndexerTab = this.indexers[0].id;
              this.updateSelectedIndexerComponents();
            }
            this.updateGroups();
          }
        },
        error: (err) => {
          console.error('Failed to fetch indexers:', err);
          // Fallback to default indexers if API fails
          this.indexers = [
            { id: 'A', name: 'Indexer-A', stream: 'eden:indexer:A', active: true },
            { id: 'B', name: 'Indexer-B', stream: 'eden:indexer:B', active: true }
          ];
          this.selectedIndexerTab = 'A';
          this.updateSelectedIndexerComponents();
          this.updateGroups();
        }
      });
  }
  
  selectIndexerTab(indexerId: string) {
    this.selectedIndexerTab = indexerId;
    this.updateSelectedIndexerComponents();
  }
  
  updateSelectedIndexerComponents() {
    if (this.selectedIndexerTab) {
      this.selectedIndexerComponents = this.getComponentsForIndexer(this.selectedIndexerTab);
    } else {
      this.selectedIndexerComponents = [];
    }
  }
  
  initializeHierarchy() {
    // 1. ROOT CA (Law / Moses) - Top level
    this.addComponent('root-ca', 'ROOT CA', 'root');
    
    // 2. Indexers (Knowledge Trees) - Federated nodes
    this.addComponent('indexer-a', 'Indexer A', 'indexer');
    this.addComponent('indexer-b', 'Indexer B', 'indexer');
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
      'llm': 'llm',
      'ledger': 'ledger',
      'cashier': 'cashier',
      'snapshot': 'snapshot',
      'transaction': 'transaction',
      'user': 'user',
      'websocket': 'websocket',
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
    
    // Check if it's a new indexer (format: indexer-*)
    if (normalized.startsWith('indexer-')) {
      // Dynamically add new indexers
      if (!this.components.has(normalized)) {
        const indexerName = normalized.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        this.addComponent(normalized, indexerName, 'indexer');
        this.updateGroups(); // Update groups after adding new component
      }
      return normalized;
    }
    
    // Check if it's a token indexer (format: tokenindexer-* or token-indexer-*)
    if (normalized.startsWith('tokenindexer-') || normalized.startsWith('token-indexer-')) {
      // Dynamically add new token indexers
      if (!this.components.has(normalized)) {
        // Format: "tokenindexer-t1" -> "TokenIndexer T1"
        const parts = normalized.split('-');
        let indexerName = parts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        // Handle "tokenindexer" -> "TokenIndexer"
        indexerName = indexerName.replace(/Tokenindexer/g, 'TokenIndexer');
        this.addComponent(normalized, indexerName, 'indexer');
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
  
  getIndexerNodes(): ComponentStatus[] {
    // Return indexer nodes that match the current tab or all if no tab selected
    const indexerNames = this.indexers.map(i => i.name);
    return Array.from(this.components.values())
      .filter(c => {
        if (c.category !== 'indexer' || c.name.includes('Replication')) return false;
        if (this.selectedIndexerTab) {
          const selectedIndexer = this.indexers.find(i => i.id === this.selectedIndexerTab);
          return selectedIndexer && c.name === selectedIndexer.name;
        }
        return indexerNames.includes(c.name);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  
  getReplicationBus(): ComponentStatus[] {
    return Array.from(this.components.values())
      .filter(c => c.category === 'indexer' && c.name.includes('Replication'));
  }
  
  getComponentsForIndexer(indexerId: string): ComponentStatus[] {
    // Check if this is a token indexer
    const indexer = this.indexers.find(i => i.id === indexerId);
    const isTokenIndexer = indexer?.type === 'token';
    
    // NOTE: ServiceRegistry is NOT shown under indexers - it belongs to ROOT CA
    // Service providers are still shown under each indexer (they belong to indexers)
    
    // Filter service providers based on indexerId from ServiceRegistry
    // Only show services that belong to this indexer
    let providerComponents = Array.from(this.components.values())
      .filter(c => {
        if (c.category !== 'service-provider') return false;
        
        // Find the service provider in our ServiceRegistry map by matching component name
        let belongsToIndexer = false;
        let serviceType = '';
        
        for (const [providerId, provider] of this.serviceProviders.entries()) {
          // Try to match component name with provider name or ID
          const componentNameLower = c.name.toLowerCase();
          const providerNameLower = provider.name.toLowerCase();
          const providerIdLower = providerId.toLowerCase();
          
          // Match if component name contains provider name or ID
          if (componentNameLower.includes(providerNameLower) || 
              componentNameLower.includes(providerIdLower.replace(/-\d+$/, '')) ||
              providerNameLower.includes(componentNameLower.replace(/\s+/g, '-'))) {
            // Map provider's indexerId to sidebar tab ID
            const mappedIndexerId = this.mapIndexerIdToTabId(provider.indexerId);
            
            if (mappedIndexerId === indexerId) {
              belongsToIndexer = true;
              serviceType = provider.serviceType;
              break;
            }
          }
        }
        
        if (!belongsToIndexer) {
          // Fallback: if not found in ServiceRegistry, use old logic
          // For regular indexers: exclude DEX/token services
          // For token indexers: filter out movie providers
          if (isTokenIndexer) {
            const movieProviderNames = ['AMC Theatres', 'Cinemark', 'MovieCom', 'AMC', 'Moviecom'];
            const isMovieProvider = movieProviderNames.some(movie => 
              c.name.toLowerCase().includes(movie.toLowerCase())
            );
            if (isMovieProvider) return false;
            // Only include DEX-related providers
            return c.name.toLowerCase().includes('pool') || 
                   c.name.toLowerCase().includes('dex') ||
                   c.name.toLowerCase().includes('token');
          } else {
            // Regular indexer: exclude DEX/token services
            const isDEXProvider = c.name.toLowerCase().includes('pool') || 
                                  c.name.toLowerCase().includes('dex') ||
                                  (c.name.toLowerCase().includes('token') && !c.name.toLowerCase().includes('snake'));
            if (isDEXProvider) return false;
            // Show movie providers and Snake services
            return true;
          }
        }
        
        // Additional filtering by service type
        if (isTokenIndexer) {
          // Token indexers: only show DEX services (serviceType: "dex")
          return serviceType === 'dex';
        } else {
          // Regular indexers: show movie services and Snake services, but NOT DEX/token services
          // Explicitly exclude DEX services from regular indexers
          if (serviceType === 'dex') {
            return false;
          }
          return serviceType === 'movie' || serviceType === 'snake';
        }
      });
    
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
        return 'text-success'; // Green for Indexers (Knowledge Trees)
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
  
  get selectedIndexerName(): string {
    const indexer = this.indexers.find(i => i.id === this.selectedIndexerTab);
    return indexer ? indexer.name : 'Indexer';
  }
  
  get selectedIndexerServiceRegistry(): ComponentStatus[] {
    // ServiceRegistry belongs to ROOT CA, not indexers
    return [];
  }
  
  get rootCAServiceRegistry(): ComponentStatus[] {
    // ServiceRegistry belongs to ROOT CA
    return Array.from(this.components.values())
      .filter(c => c.category === 'service-registry');
  }
  
  get selectedIndexerServiceProviders(): ComponentStatus[] {
    return this.selectedIndexerComponents.filter(c => c.category === 'service-provider');
  }
  
  get selectedIndexerLLM(): ComponentStatus[] {
    return this.selectedIndexerComponents.filter(c => c.category === 'llm');
  }
  
  get selectedIndexerEdenCore(): ComponentStatus[] {
    return this.selectedIndexerComponents.filter(c => c.category === 'edencore');
  }
  
  get selectedIndexerUsers(): ComponentStatus[] {
    return this.selectedIndexerComponents.filter(c => c.category === 'user');
  }
  
  get selectedIndexerNodeCount(): number {
    const nodes = this.getIndexerNodes();
    return nodes.length > 0 ? nodes[0].count : 0;
  }
  
  mapIndexerIdToTabId(indexerId: string): string {
    // Map ServiceRegistry indexerId to sidebar tab ID
    // "indexer-alpha" -> "A", "indexer-beta" -> "B", "TokenIndexer-T1" -> "TokenIndexer-T1", etc.
    if (indexerId.startsWith('indexer-')) {
      // Extract letter from "indexer-alpha" -> "A", "indexer-beta" -> "B"
      const parts = indexerId.split('-');
      if (parts.length >= 2) {
        const letter = parts[1].charAt(0).toUpperCase();
        return letter;
      }
    }
    // For token indexers, return as-is
    if (indexerId.startsWith('TokenIndexer-')) {
      return indexerId;
    }
    // Default: return first character uppercase
    return indexerId.charAt(0).toUpperCase();
  }
}

