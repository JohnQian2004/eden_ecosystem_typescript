/**
 * Service Registry 2.0
 * New implementation to replace ROOT_CA_SERVICE_REGISTRY
 * Handles service provider management with proper persistence and thread safety
 */
import type { ServiceProviderWithCert } from './types';
export declare class ServiceRegistry2 {
    private providers;
    private persistenceFile;
    private isLoaded;
    constructor(persistenceFile?: string);
    /**
     * Load service registry from persistence file
     * CRITICAL: This should ONLY be called during server startup (constructor)
     */
    private loadPersistence;
    /**
     * Save service registry to persistence file
     * CRITICAL: This saves the current in-memory state - no filtering, no reloading
     */
    savePersistence(): void;
    /**
     * Add a provider to the registry
     */
    addProvider(provider: ServiceProviderWithCert): void;
    /**
     * Update an existing provider
     */
    updateProvider(provider: ServiceProviderWithCert): void;
    /**
     * Remove a provider from the registry
     */
    removeProvider(providerId: string): void;
    /**
     * Get a provider by ID
     */
    getProvider(providerId: string): ServiceProviderWithCert | undefined;
    /**
     * Get all providers
     */
    getAllProviders(): ServiceProviderWithCert[];
    /**
     * Query providers by service type and filters
     */
    queryProviders(serviceType?: string, filters?: Record<string, any>): ServiceProviderWithCert[];
    /**
     * Get provider count
     */
    getCount(): number;
    /**
     * Check if provider exists
     */
    hasProvider(providerId: string): boolean;
}
/**
 * Initialize ServiceRegistry2
 */
export declare function initializeServiceRegistry2(persistenceFile?: string): ServiceRegistry2;
/**
 * Get ServiceRegistry2 instance
 */
export declare function getServiceRegistry2(): ServiceRegistry2;
//# sourceMappingURL=serviceRegistry2.d.ts.map