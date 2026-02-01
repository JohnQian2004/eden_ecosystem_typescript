/**
 * Service Registry Component
 * Manages service provider registration and discovery
 */

import type { ServiceProvider } from "../types";
import * as state from "../state";

export class ServiceRegistryComponent {
  private providers: (ServiceProvider & { certificate?: any })[] = [];

  constructor(initialProviders: (ServiceProvider & { certificate?: any })[] = []) {
    this.providers = initialProviders;
  }

  /**
   * Register a service provider with ROOT CA
   */
  registerProvider(provider: ServiceProvider & { certificate?: any }): void {
    // Validate gardenId exists
    if (!this.validateGardenId(provider.gardenId)) {
      throw new Error(`Cannot register provider ${provider.id}: gardenId "${provider.gardenId}" does not exist`);
    }

    // Check for duplicates
    const existing = this.providers.find(p => p.id === provider.id || p.uuid === provider.uuid);
    if (existing) {
      console.warn(`⚠️  Provider ${provider.id} already exists, skipping duplicate registration`);
      return;
    }

    this.providers.push(provider);
    console.log(`✅ Registered service provider: ${provider.name} (${provider.id}) → ${provider.gardenId}`);
  }

  /**
   * Query service providers by criteria
   */
  queryProviders(query: {
    serviceType?: string;
    gardenId?: string;
    location?: string;
    minReputation?: number;
  }): (ServiceProvider & { certificate?: any })[] {
    return this.providers.filter(p => {
      if (query.serviceType && p.serviceType !== query.serviceType) return false;
      if (query.gardenId && p.gardenId !== query.gardenId) return false;
      if (query.location && p.location !== query.location) return false;
      if (query.minReputation && p.reputation < query.minReputation) return false;
      return p.status === 'active';
    });
  }

  /**
   * Get provider by ID
   */
  getProvider(id: string): (ServiceProvider & { certificate?: any }) | undefined {
    return this.providers.find(p => p.id === id);
  }

  /**
   * Get all providers
   */
  getAllProviders(): (ServiceProvider & { certificate?: any })[] {
    return [...this.providers];
  }

  /**
   * Remove provider
   */
  removeProvider(id: string): boolean {
    const index = this.providers.findIndex(p => p.id === id);
    if (index > -1) {
      this.providers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Validate that a gardenId exists
   */
  private validateGardenId(gardenId: string | undefined | null): boolean {
    if (!gardenId) return false;
    if (gardenId === 'HG') return true; // Holy Ghost is always valid
    return state.GARDENS.some(g => g.id === gardenId) || 
           state.TOKEN_GARDENS.some(tg => tg.id === gardenId);
  }

  /**
   * Get providers by garden
   */
  getProvidersByGarden(gardenId: string): (ServiceProvider & { certificate?: any })[] {
    return this.providers.filter(p => p.gardenId === gardenId);
  }

  /**
   * Get providers by service type
   */
  getProvidersByServiceType(serviceType: string): (ServiceProvider & { certificate?: any })[] {
    return this.providers.filter(p => p.serviceType === serviceType && p.status === 'active');
  }
}

