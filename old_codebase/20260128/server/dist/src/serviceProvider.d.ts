/**
 * Service Provider Module
 * Handles service provider registration, querying, and certificate issuance
 */
import type { ServiceProvider, ServiceProviderWithCert, ServiceRegistryQuery, MovieListing, TokenListing, GenericServiceListing } from "./types";
import type { EdenCertificate } from "../EdenPKI";
/**
 * Initialize service provider module with dependencies
 */
export declare function initializeServiceProvider(broadcastFn: (event: any) => void): void;
export declare function validateGardenId(gardenId: string | undefined | null): boolean;
export declare function registerServiceProviderWithROOTCA(provider: ServiceProviderWithCert): void;
/**
 * Generic service provider creation function
 * Creates or reassigns service providers for a garden
 * Supports both predefined provider IDs and custom provider configurations
 */
export declare function createServiceProvidersForGarden(serviceType: string, gardenId: string, providers: Array<{
    id?: string;
    name: string;
    location?: string;
    bond?: number;
    reputation?: number;
    apiEndpoint?: string;
    uuid?: string;
    insuranceFee?: number;
    iGasMultiplier?: number;
    iTaxMultiplier?: number;
    maxInfluence?: number;
    contextsAllowed?: string[];
    contextsForbidden?: string[];
    adCapabilities?: string[];
}>, predefinedProviderMap?: Record<string, {
    name: string;
    uuid: string;
    location: string;
    bond: number;
    reputation: number;
    apiEndpoint: string;
}>): Array<{
    providerId: string;
    providerName: string;
    created: boolean;
    assigned: boolean;
}>;
export declare function queryROOTCAServiceRegistry(query: ServiceRegistryQuery): ServiceProvider[];
export declare function queryAMCAPI(location: string, filters?: {
    genre?: string;
    time?: string;
}): Promise<MovieListing[]>;
export declare function queryMovieComAPI(location: string, filters?: {
    genre?: string;
    time?: string;
}): Promise<MovieListing[]>;
export declare function queryCinemarkAPI(location: string, filters?: {
    genre?: string;
    time?: string;
}): Promise<MovieListing[]>;
export declare function queryDEXPoolAPI(provider: ServiceProvider, filters?: {
    tokenSymbol?: string;
    baseToken?: string;
    action?: 'BUY' | 'SELL';
}): Promise<TokenListing[]>;
export declare function querySnakeAPI(provider: ServiceProvider, filters?: {
    genre?: string;
    time?: string;
}): Promise<MovieListing[]>;
export declare function queryProviderAPI(provider: ServiceProvider, filters?: {
    genre?: string;
    time?: string;
    tokenSymbol?: string;
    baseToken?: string;
    action?: 'BUY' | 'SELL';
    [key: string]: any;
}): Promise<MovieListing[] | TokenListing[] | GenericServiceListing[]>;
export declare function queryServiceProviders(providers: ServiceProvider[], filters?: {
    genre?: string;
    time?: string;
    tokenSymbol?: string;
    baseToken?: string;
    action?: 'BUY' | 'SELL';
    [key: string]: any;
}): Promise<MovieListing[] | TokenListing[] | GenericServiceListing[]>;
export declare function issueServiceProviderCertificate(provider: ServiceProviderWithCert): EdenCertificate;
//# sourceMappingURL=serviceProvider.d.ts.map