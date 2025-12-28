import { Component, OnInit, OnDestroy } from '@angular/core';
import { WebSocketService } from '../../services/websocket.service';
import { SimulatorEvent } from '../../app.component';

interface ComponentStatus {
  name: string;
  status: 'idle' | 'active' | 'success' | 'error';
  lastUpdate: number;
  count: number;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit, OnDestroy {
  components: Map<string, ComponentStatus> = new Map();
  componentList: ComponentStatus[] = [];
  private subscription: any;

  constructor(private wsService: WebSocketService) {}

  ngOnInit() {
    // Initialize component list
    const initialComponents = [
      'websocket', 'llm', 'service-registry', 'amc-api', 'moviecom-api', 
      'cinemark-api', 'redis', 'indexer-a', 'indexer-b', 'snapshot', 
      'transaction', 'ledger', 'cashier'
    ];
    
    initialComponents.forEach(name => {
      this.components.set(name, {
        name: this.formatComponentName(name),
        status: 'idle',
        lastUpdate: Date.now(),
        count: 0
      });
    });
    
    this.updateComponentList();
    
    this.subscription = this.wsService.events$.subscribe((event: SimulatorEvent) => {
      this.updateComponentStatus(event);
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
    
    const component = this.components.get(componentName);
    if (component) {
      component.status = status;
      component.lastUpdate = event.timestamp;
      component.count++;
      
      // Reset to idle after 2 seconds if not error
      if (status !== 'error') {
        setTimeout(() => {
          const comp = this.components.get(componentName);
          if (comp && comp.status === status) {
            comp.status = 'idle';
            this.updateComponentList();
          }
        }, 2000);
      }
    } else {
      // Add new component dynamically
      this.components.set(componentName, {
        name: this.formatComponentName(componentName),
        status: status,
        lastUpdate: event.timestamp,
        count: 1
      });
    }
    
    this.updateComponentList();
  }

  updateComponentList() {
    this.componentList = Array.from(this.components.values())
      .sort((a, b) => b.lastUpdate - a.lastUpdate);
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
}

