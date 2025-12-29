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
    
    // Initialize hierarchical component structure based on whitepaper architecture
    this.initializeHierarchy();
    
    this.subscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      this.updateComponentStatus(event);
      this.updateSelectedIndexerComponents();
    });
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
    
    // Get all components that belong to a specific indexer
    const serviceRegistryComponents = Array.from(this.components.values())
      .filter(c => c.category === 'service-registry');
    
    // Filter service providers based on indexer type
    let providerComponents = Array.from(this.components.values())
      .filter(c => c.category === 'service-provider');
    
    if (isTokenIndexer) {
      // Token indexers should only show DEX-related service providers
      // Filter out movie service providers (AMC, Cinemark, MovieCom)
      const movieProviderNames = ['AMC Theatres', 'Cinemark', 'MovieCom', 'AMC', 'Moviecom'];
      
      providerComponents = providerComponents.filter(p => {
        // Filter out movie providers by name
        const isMovieProvider = movieProviderNames.some(movie => 
          p.name.toLowerCase().includes(movie.toLowerCase())
        );
        
        if (isMovieProvider) return false;
        
        // Only include DEX pool providers (those with "Pool", "DEX", or "Token" in name)
        // DEX pool providers are named like "TOKENA Pool (TokenIndexer-T1)" or "dex-pool-tokena"
        return p.name.toLowerCase().includes('pool') || 
               p.name.toLowerCase().includes('dex') ||
               p.name.toLowerCase().includes('token');
      });
      
      // Sort DEX providers
      providerComponents = providerComponents.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Regular indexers show all service providers (including movies)
      providerComponents = providerComponents.sort((a, b) => a.name.localeCompare(b.name));
    }
    
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
      ...serviceRegistryComponents,
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
    return this.selectedIndexerComponents.filter(c => c.category === 'service-registry');
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
}

