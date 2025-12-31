/**
 * Service Registry 2.0
 * New implementation to replace ROOT_CA_SERVICE_REGISTRY
 * Handles service provider management with proper persistence and thread safety
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ServiceProviderWithCert } from './types';
import { GARDENS, TOKEN_GARDENS } from './state';
import { DEPLOYED_AS_ROOT } from './config';

export class ServiceRegistry2 {
  private providers: Map<string, ServiceProviderWithCert> = new Map();
  private persistenceFile: string;
  private isLoaded = false; // CRITICAL: Only load once during server startup

  constructor(persistenceFile?: string) {
    this.persistenceFile = persistenceFile || path.join(__dirname, '..', 'eden-serviceRegistry-persistence.json');
    // CRITICAL: Load persistence ONLY during construction (server startup)
    this.loadPersistence();
    this.isLoaded = true;
  }

  /**
   * Load service registry from persistence file
   * CRITICAL: This should ONLY be called during server startup (constructor)
   */
  private loadPersistence(): void {
    if (this.isLoaded) {
      console.error(`❌ [ServiceRegistry2] CRITICAL ERROR: loadPersistence() called AFTER server startup! This should NEVER happen!`);
      throw new Error('loadPersistence() can only be called during server startup (constructor), not during runtime!');
    }

    if (!fs.existsSync(this.persistenceFile)) {
      console.log(`📂 [ServiceRegistry2] No persistence file found, starting with empty registry`);
      return;
    }

    try {
      const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
      const persisted = JSON.parse(fileContent);
      
      if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry)) {
        console.log(`📂 [ServiceRegistry2] Loading ${persisted.serviceRegistry.length} service providers from ${this.persistenceFile}`);
        
        let loadedCount = 0;
        let skippedCount = 0;
        
        for (const providerData of persisted.serviceRegistry) {
          const gardenId = providerData.gardenId || providerData.indexerId; // Backward compatibility
          
          // CRITICAL: Only load providers whose gardens actually exist (or are "HG" for infrastructure)
          const gardenExists = gardenId === 'HG' || 
                              GARDENS.some(g => g.id === gardenId) || 
                              TOKEN_GARDENS.some(tg => tg.id === gardenId);
          
          if (!gardenExists && gardenId) {
            console.log(`⚠️  [ServiceRegistry2] Skipping provider ${providerData.id} (${providerData.name}): gardenId "${gardenId}" does not exist`);
            skippedCount++;
            continue;
          }
          
          // Create provider object
          const provider: ServiceProviderWithCert = {
            id: providerData.id,
            uuid: providerData.uuid,
            name: providerData.name,
            serviceType: providerData.serviceType,
            location: providerData.location || 'Unknown',
            bond: providerData.bond || 0,
            reputation: providerData.reputation || 0,
            gardenId: gardenId || 'HG',
            apiEndpoint: providerData.apiEndpoint,
            status: (providerData.status as 'active' | 'revoked' | 'suspended') || 'active',
            // Optional fields
            insuranceFee: providerData.insuranceFee,
            iGasMultiplier: providerData.iGasMultiplier,
            iTaxMultiplier: providerData.iTaxMultiplier,
            maxInfluence: providerData.maxInfluence,
            contextsAllowed: providerData.contextsAllowed,
            contextsForbidden: providerData.contextsForbidden,
            adCapabilities: providerData.adCapabilities,
            certificate: providerData.certificate
          };
          
          this.providers.set(provider.id, provider);
          loadedCount++;
        }
        
        console.log(`✅ [ServiceRegistry2] Loaded ${loadedCount} provider(s), skipped ${skippedCount} provider(s)`);
      }
    } catch (err: any) {
      console.error(`❌ [ServiceRegistry2] Failed to load persistence: ${err.message}`);
    }
  }

  /**
   * Save service registry to persistence file
   * CRITICAL: This saves the current in-memory state - no filtering, no reloading
   */
  public savePersistence(): void {
    try {
      const providersArray = Array.from(this.providers.values());
      
      console.log(`💾 [ServiceRegistry2] Saving ${providersArray.length} provider(s) to ${this.persistenceFile}`);
      console.log(`💾 [ServiceRegistry2] Providers:`, providersArray.map(p => `${p.id}(${p.serviceType},${p.gardenId})`).join(', '));
      
      const data = {
        serviceRegistry: providersArray.map(p => {
          const provider: any = {
            id: p.id,
            uuid: p.uuid,
            name: p.name,
            serviceType: p.serviceType,
            location: p.location,
            bond: p.bond,
            reputation: p.reputation,
            status: p.status,
            gardenId: p.gardenId,
            apiEndpoint: p.apiEndpoint
          };
          // Include optional fields
          if (p.insuranceFee !== undefined) provider.insuranceFee = p.insuranceFee;
          if (p.iGasMultiplier !== undefined) provider.iGasMultiplier = p.iGasMultiplier;
          if (p.iTaxMultiplier !== undefined) provider.iTaxMultiplier = p.iTaxMultiplier;
          if (p.maxInfluence !== undefined) provider.maxInfluence = p.maxInfluence;
          if (p.contextsAllowed !== undefined) provider.contextsAllowed = p.contextsAllowed;
          if (p.contextsForbidden !== undefined) provider.contextsForbidden = p.contextsForbidden;
          if (p.adCapabilities !== undefined) provider.adCapabilities = p.adCapabilities;
          if (p.certificate) provider.certificate = p.certificate;
          return provider;
        }),
        lastSaved: new Date().toISOString()
      };
      
      fs.writeFileSync(this.persistenceFile, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`✅ [ServiceRegistry2] Saved ${providersArray.length} provider(s) to ${this.persistenceFile}`);
    } catch (err: any) {
      console.error(`❌ [ServiceRegistry2] Failed to save persistence: ${err.message}`);
    }
  }

  /**
   * Add a provider to the registry
   */
  public addProvider(provider: ServiceProviderWithCert): void {
    // Validate gardenId exists
    if (provider.gardenId && provider.gardenId !== 'HG') {
      const gardenExists = GARDENS.some(g => g.id === provider.gardenId) || 
                          TOKEN_GARDENS.some(tg => tg.id === provider.gardenId);
      if (!gardenExists) {
        throw new Error(`Cannot add provider ${provider.id}: gardenId "${provider.gardenId}" does not exist`);
      }
    }
    
    // Check for duplicates
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} already exists in registry`);
    }
    
    this.providers.set(provider.id, provider);
    console.log(`✅ [ServiceRegistry2] Added provider: ${provider.name} (${provider.id}) with gardenId: ${provider.gardenId || 'HG'}`);
  }

  /**
   * Update an existing provider
   */
  public updateProvider(provider: ServiceProviderWithCert): void {
    if (!this.providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} does not exist in registry`);
    }
    
    // Validate gardenId exists
    if (provider.gardenId && provider.gardenId !== 'HG') {
      const gardenExists = GARDENS.some(g => g.id === provider.gardenId) || 
                          TOKEN_GARDENS.some(tg => tg.id === provider.gardenId);
      if (!gardenExists) {
        throw new Error(`Cannot update provider ${provider.id}: gardenId "${provider.gardenId}" does not exist`);
      }
    }
    
    this.providers.set(provider.id, provider);
    console.log(`✅ [ServiceRegistry2] Updated provider: ${provider.name} (${provider.id})`);
  }

  /**
   * Remove a provider from the registry
   */
  public removeProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider ${providerId} does not exist in registry`);
    }
    
    this.providers.delete(providerId);
    console.log(`✅ [ServiceRegistry2] Removed provider: ${providerId}`);
  }

  /**
   * Get a provider by ID
   */
  public getProvider(providerId: string): ServiceProviderWithCert | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all providers
   */
  public getAllProviders(): ServiceProviderWithCert[] {
    return Array.from(this.providers.values());
  }

  /**
   * Query providers by service type and filters
   */
  public queryProviders(serviceType?: string, filters?: Record<string, any>): ServiceProviderWithCert[] {
    let results = Array.from(this.providers.values());
    
    // Filter by service type
    if (serviceType) {
      results = results.filter(p => p.serviceType === serviceType);
    }
    
    // Filter by status (only active by default)
    results = results.filter(p => p.status === 'active');
    
    // Apply additional filters if provided
    if (filters) {
      // Add custom filter logic here if needed
    }
    
    return results;
  }

  /**
   * Get provider count
   */
  public getCount(): number {
    return this.providers.size;
  }

  /**
   * Check if provider exists
   */
  public hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }
}

// Global instance (will be initialized in main)
let serviceRegistry2Instance: ServiceRegistry2 | null = null;

/**
 * Initialize ServiceRegistry2
 */
export function initializeServiceRegistry2(persistenceFile?: string): ServiceRegistry2 {
  if (serviceRegistry2Instance) {
    console.warn(`⚠️  [ServiceRegistry2] Already initialized, returning existing instance`);
    return serviceRegistry2Instance;
  }
  
  serviceRegistry2Instance = new ServiceRegistry2(persistenceFile);
  return serviceRegistry2Instance;
}

/**
 * Get ServiceRegistry2 instance
 */
export function getServiceRegistry2(): ServiceRegistry2 {
  if (!serviceRegistry2Instance) {
    throw new Error('ServiceRegistry2 not initialized. Call initializeServiceRegistry2() first.');
  }
  return serviceRegistry2Instance;
}

