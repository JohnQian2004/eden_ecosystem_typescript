/**
 * Infrastructure Services Component
 * Manages infrastructure services (Wallet, Settlement, Payment Rail, Web Server, WebSocket)
 */

import type { ServiceProvider } from "../types";

export interface InfrastructureService {
  id: string;
  name: string;
  serviceType: 'wallet' | 'settlement' | 'payment-rail' | 'webserver' | 'websocket' | 'registry';
  status: 'active' | 'inactive';
  endpoint?: string;
}

export class InfrastructureComponent {
  private services: Map<string, InfrastructureService> = new Map();

  constructor() {
    this.initializeDefaultServices();
  }

  private initializeDefaultServices(): void {
    const defaultServices: InfrastructureService[] = [
      {
        id: 'wallet-service-001',
        name: 'JesusCoin Wallet Service',
        serviceType: 'wallet',
        status: 'active',
        endpoint: 'internal://wallet'
      },
      {
        id: 'settlement-service-001',
        name: 'Settlement Service',
        serviceType: 'settlement',
        status: 'active',
        endpoint: 'internal://settlement'
      },
      {
        id: 'stripe-payment-rail-001',
        name: 'Stripe Payment Rail',
        serviceType: 'payment-rail',
        status: 'active',
        endpoint: 'https://api.stripe.com/v1'
      },
      {
        id: 'webserver-service-001',
        name: 'Web Server',
        serviceType: 'webserver',
        status: 'active'
      },
      {
        id: 'websocket-service-001',
        name: 'WebSocket Service',
        serviceType: 'websocket',
        status: 'active'
      },
      {
        id: 'service-registry-001',
        name: 'Service Registry',
        serviceType: 'registry',
        status: 'active',
        endpoint: 'internal://service-registry'
      }
    ];

    defaultServices.forEach(service => {
      this.services.set(service.id, service);
    });
  }

  getService(id: string): InfrastructureService | undefined {
    return this.services.get(id);
  }

  getAllServices(): InfrastructureService[] {
    return Array.from(this.services.values());
  }

  getServicesByType(serviceType: InfrastructureService['serviceType']): InfrastructureService[] {
    return Array.from(this.services.values()).filter(s => s.serviceType === serviceType);
  }

  updateServiceStatus(id: string, status: 'active' | 'inactive'): boolean {
    const service = this.services.get(id);
    if (service) {
      service.status = status;
      return true;
    }
    return false;
  }
}

