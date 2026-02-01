/**
 * Service Provider Module
 * Handles service provider registration, querying, and certificate issuance
 */

import * as crypto from "crypto";
import type { ServiceProvider, ServiceProviderWithCert, ServiceRegistryQuery, MovieListing, TokenListing, GenericServiceListing } from "./types";
import { GARDENS, TOKEN_GARDENS, ROOT_CA_SERVICE_REGISTRY, CERTIFICATE_REGISTRY, REVOCATION_REGISTRY, DEX_POOLS, ROOT_CA } from "./state";
import type { EdenCertificate } from "../EdenPKI";
import { getServiceRegistry2 } from "./serviceRegistry2";
import { getMySQLProviderPluginConfig } from "./plugins/providerPluginRegistry";
import { testMySQLQuery } from "./plugins/mysql";
import { extractGetDataParamsWithOpenAI, type GetDataParamsResult } from "./llm";
import { getAllMoviesAsListings } from "./videoService";

// Dependencies that need to be injected
let broadcastEvent: (event: any) => void;

/**
 * Initialize service provider module with dependencies
 */
export function initializeServiceProvider(broadcastFn: (event: any) => void): void {
  broadcastEvent = broadcastFn;
}

// Helper function to validate that a gardenId exists
export function validateGardenId(gardenId: string | undefined | null): boolean {
  if (!gardenId) {
    return false; // "HG" is allowed for infrastructure services, but undefined/null is not
  }
  
  // "HG" is always valid (infrastructure services)
  if (gardenId === "HG") {
    return true;
  }
  
  // Check if garden exists in GARDENS or TOKEN_GARDENS
  const existsInRegular = GARDENS.some(g => g.id === gardenId);
  const existsInToken = TOKEN_GARDENS.some(tg => tg.id === gardenId);
  
  return existsInRegular || existsInToken;
}

// Register a service provider with ROOT CA
// CRITICAL: This function now uses ServiceRegistry2 (new implementation) as the primary storage
// ROOT_CA_SERVICE_REGISTRY is kept for backward compatibility only
export function registerServiceProviderWithROOTCA(provider: ServiceProviderWithCert): void {
  // CRITICAL: Validate that the gardenId exists before registering
  if (provider.gardenId && !validateGardenId(provider.gardenId)) {
    throw new Error(`Cannot register service provider ${provider.id}: gardenId "${provider.gardenId}" does not exist. Valid gardens: ${[...GARDENS.map(g => g.id), ...TOKEN_GARDENS.map(tg => tg.id), "HG"].join(", ")}`);
  }
  
  // Use ServiceRegistry2 (new implementation) as primary storage
  try {
    const serviceRegistry2 = getServiceRegistry2();
    
    // Check if provider already exists in ServiceRegistry2
    if (serviceRegistry2.hasProvider(provider.id)) {
      throw new Error(`Service provider ${provider.id} already registered in ServiceRegistry2`);
    }
    
    // Add to ServiceRegistry2
    serviceRegistry2.addProvider(provider);
    console.log(`✅ [ServiceRegistry2] Registered service provider: ${provider.name} (${provider.id}) with gardenId: ${provider.gardenId || "HG"}`);
  } catch (err: any) {
    // If ServiceRegistry2 is not available, fall back to old system
    if (err.message.includes('not initialized')) {
      console.warn(`⚠️  [ServiceRegistry2] Not initialized, falling back to ROOT_CA_SERVICE_REGISTRY`);
    } else {
      throw err; // Re-throw if it's a different error
    }
  }

  // Also add to old ROOT_CA_SERVICE_REGISTRY for backward compatibility (will be removed later)
  const existing = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === provider.id || p.uuid === provider.uuid);
  if (!existing) {
    ROOT_CA_SERVICE_REGISTRY.push(provider);
    console.log(`✅ [ROOT CA] Registered service provider (legacy): ${provider.name} (${provider.id}) with gardenId: ${provider.gardenId || "HG"}`);
  }
  
  broadcastEvent({
    type: "service_provider_registered",
    component: "root-ca",
    message: `Service provider registered: ${provider.name}`,
    timestamp: Date.now(),
    data: {
      providerId: provider.id,
      providerName: provider.name,
      serviceType: provider.serviceType,
      gardenId: provider.gardenId
    }
  });
}

/**
 * Generic service provider creation function
 * Creates or reassigns service providers for a garden
 * Supports both predefined provider IDs and custom provider configurations
 */
export function createServiceProvidersForGarden(
  serviceType: string,
  gardenId: string,
  providers: Array<{
    id?: string;
    name: string;
    location?: string;
    bond?: number;
    reputation?: number;
    apiEndpoint?: string;
    uuid?: string;
    // Optional fields for Snake service type
    insuranceFee?: number;
    iGasMultiplier?: number;
    iTaxMultiplier?: number;
    maxInfluence?: number;
    contextsAllowed?: string[];
    contextsForbidden?: string[];
    adCapabilities?: string[];
  }>,
  predefinedProviderMap?: Record<string, { name: string; uuid: string; location: string; bond: number; reputation: number; apiEndpoint: string }>
): Array<{ providerId: string; providerName: string; created: boolean; assigned: boolean }> {
  const results: Array<{ providerId: string; providerName: string; created: boolean; assigned: boolean }> = [];
  const serviceRegistry2 = getServiceRegistry2();
  
  // Validate garden exists
  if (!validateGardenId(gardenId)) {
    throw new Error(`Cannot create providers: gardenId "${gardenId}" does not exist. Valid gardens: ${[...GARDENS.map(g => g.id), ...TOKEN_GARDENS.map(tg => tg.id), "HG"].join(", ")}`);
  }
  
  for (const providerConfig of providers) {
    let providerId: string;
    let providerData: ServiceProviderWithCert;
    
    // Determine provider ID
    if (providerConfig.id) {
      // Use provided ID
      providerId = providerConfig.id;
      
      // Check if it's a predefined provider
      if (predefinedProviderMap && predefinedProviderMap[providerId]) {
        const predefined = predefinedProviderMap[providerId];
        providerData = {
          id: providerId,
          uuid: predefined.uuid,
          name: predefined.name,
          serviceType: serviceType,
          location: predefined.location,
          bond: predefined.bond,
          reputation: predefined.reputation,
          gardenId: gardenId,
          apiEndpoint: predefined.apiEndpoint,
          status: 'active'
        };
      } else {
        // Custom provider with ID
        providerData = {
          id: providerId,
          uuid: providerConfig.uuid || crypto.randomUUID(),
          name: providerConfig.name,
          serviceType: serviceType,
          location: providerConfig.location || 'Unknown',
          bond: providerConfig.bond || 1000,
          reputation: providerConfig.reputation || 5.0,
          gardenId: gardenId,
          apiEndpoint: providerConfig.apiEndpoint || '',
          status: 'active',
          // Optional Snake fields
          insuranceFee: providerConfig.insuranceFee,
          iGasMultiplier: providerConfig.iGasMultiplier,
          iTaxMultiplier: providerConfig.iTaxMultiplier,
          maxInfluence: providerConfig.maxInfluence,
          contextsAllowed: providerConfig.contextsAllowed,
          contextsForbidden: providerConfig.contextsForbidden,
          adCapabilities: providerConfig.adCapabilities
        };
      }
    } else {
      // Generate ID if not provided
      // CRITICAL: Check if a provider with this name already exists for this garden to prevent duplicates
      const existingProviderWithSameName = serviceRegistry2.getAllProviders().find(
        p => p.name === providerConfig.name && p.gardenId === gardenId && p.serviceType === serviceType
      );
      if (existingProviderWithSameName) {
        console.log(`   ⚠️  Provider with name "${providerConfig.name}" already exists for garden ${gardenId}, skipping duplicate creation`);
        results.push({
          providerId: existingProviderWithSameName.id,
          providerName: existingProviderWithSameName.name,
          created: false,
          assigned: false
        });
        continue; // Skip creating duplicate
      }
      
      providerId = `${serviceType}-${crypto.randomUUID().substring(0, 8)}`;
      providerData = {
        id: providerId,
        uuid: providerConfig.uuid || crypto.randomUUID(),
        name: providerConfig.name,
        serviceType: serviceType,
        location: providerConfig.location || 'Unknown',
        bond: providerConfig.bond || 1000,
        reputation: providerConfig.reputation || 5.0,
        gardenId: gardenId,
        apiEndpoint: providerConfig.apiEndpoint || '',
        status: 'active',
        // Optional Snake fields
        insuranceFee: providerConfig.insuranceFee,
        iGasMultiplier: providerConfig.iGasMultiplier,
        iTaxMultiplier: providerConfig.iTaxMultiplier,
        maxInfluence: providerConfig.maxInfluence,
        contextsAllowed: providerConfig.contextsAllowed,
        contextsForbidden: providerConfig.contextsForbidden,
        adCapabilities: providerConfig.adCapabilities
      };
    }
    
    // Check if provider already exists
    const existingProvider = serviceRegistry2.getProvider(providerId);
    
    if (existingProvider) {
      // Provider exists - reassign to new garden
      if (existingProvider.gardenId !== gardenId) {
        console.log(`   🔄 Reassigning provider: ${existingProvider.name} (${existingProvider.id}) from garden ${existingProvider.gardenId} to ${gardenId}`);
        existingProvider.gardenId = gardenId;
        
        // CRITICAL: Save service registry to persistence FIRST, before broadcasting
        try {
          serviceRegistry2.savePersistence();
          console.log(`   💾 Service registry saved to persistence (reassigned provider: ${existingProvider.name})`);
        } catch (saveErr: any) {
          console.error(`   ❌ Failed to save service registry:`, saveErr.message);
        }
        
        results.push({
          providerId: providerId,
          providerName: existingProvider.name,
          created: false,
          assigned: true
        });
      } else {
        console.log(`   ✓ Provider ${existingProvider.name} (${existingProvider.id}) already assigned to garden ${gardenId}`);
        results.push({
          providerId: providerId,
          providerName: existingProvider.name,
          created: false,
          assigned: false
        });
      }
    } else {
      // Provider doesn't exist - create it
      try {
        serviceRegistry2.addProvider(providerData);
        
        // Also add to old ROOT_CA_SERVICE_REGISTRY for backward compatibility
        // CRITICAL: Check if provider already exists in ROOT_CA_SERVICE_REGISTRY to avoid duplicates
        const existingInOldRegistry = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === providerData.id || p.uuid === providerData.uuid);
        if (!existingInOldRegistry) {
          ROOT_CA_SERVICE_REGISTRY.push(providerData);
        } else {
          // Update existing provider in old registry
          Object.assign(existingInOldRegistry, providerData);
        }
        
        // Issue certificate
        try {
          issueServiceProviderCertificate(providerData);
          console.log(`   📜 Certificate issued to ${providerData.name}`);
        } catch (certErr: any) {
          console.warn(`   ⚠️  Failed to issue certificate to ${providerData.name}:`, certErr.message);
        }
        
        console.log(`   ✅ Created service provider: ${providerData.name} (${providerData.id}) for garden ${gardenId}`);
        
        // CRITICAL: Save service registry to persistence FIRST, before broadcasting to Angular
        try {
          serviceRegistry2.savePersistence();
          console.log(`   💾 Service registry saved to persistence (provider: ${providerData.name})`);
        } catch (saveErr: any) {
          console.error(`   ❌ Failed to save service registry:`, saveErr.message);
          // Don't throw - continue with broadcast even if save fails
        }
        
        // Broadcast event AFTER persistence
        broadcastEvent({
          type: "service_provider_created",
          component: "root-ca",
          message: `Service provider ${providerData.name} created and assigned to garden ${gardenId}`,
          timestamp: Date.now(),
          data: {
            providerId: providerData.id,
            providerName: providerData.name,
            serviceType: serviceType,
            gardenId: gardenId
          }
        });
        
        results.push({
          providerId: providerId,
          providerName: providerData.name,
          created: true,
          assigned: true
        });
      } catch (err: any) {
        console.error(`   ❌ Failed to create provider ${providerData.name}:`, err.message);
        throw err;
      }
    }
  }
  
  return results;
}

// Query ROOT CA Service Registry (used by gardens after LLM extraction)
// This is a quick post-LLM in-memory lookup
// CRITICAL: This function now uses ServiceRegistry2 (new implementation) as the primary source
export function queryROOTCAServiceRegistry(query: ServiceRegistryQuery): ServiceProvider[] {
  // Use ServiceRegistry2 (new implementation) as primary source
  let providers: ServiceProviderWithCert[] = [];
  try {
    const serviceRegistry2 = getServiceRegistry2();
    providers = serviceRegistry2.queryProviders(query.serviceType, query.filters);
    console.log(`🔍 [queryROOTCAServiceRegistry] ServiceRegistry2 has ${serviceRegistry2.getCount()} providers, query returned ${providers.length}`);
  } catch (err: any) {
    // If ServiceRegistry2 is not available, fall back to old system
    if (err.message.includes('not initialized')) {
      console.warn(`⚠️  [ServiceRegistry2] Not initialized, falling back to ROOT_CA_SERVICE_REGISTRY`);
      providers = Array.from(ROOT_CA_SERVICE_REGISTRY);
    } else {
      throw err; // Re-throw if it's a different error
    }
  }
  
  // Debug logging
  console.log(`🔍 [queryROOTCAServiceRegistry] Query:`, JSON.stringify(query, null, 2));
  console.log(`🔍 [queryROOTCAServiceRegistry] Providers in registry: ${providers.length}`);
  console.log(`🔍 [queryROOTCAServiceRegistry] Providers:`, providers.map(p => ({
    id: p.id,
    name: p.name,
    serviceType: p.serviceType,
    status: p.status,
    gardenId: p.gardenId
  })));
  
  const filtered = providers.filter((provider) => {
    // Filter out revoked providers
    if (REVOCATION_REGISTRY.has(provider.uuid)) {
      console.log(`   ❌ Provider ${provider.id} filtered out: revoked in REVOCATION_REGISTRY`);
      return false;
    }
    
    // Filter by status if set
    if (provider.status === 'revoked' || provider.status === 'suspended') {
      console.log(`   ❌ Provider ${provider.id} filtered out: status is ${provider.status}`);
      return false;
    }
    
    // Filter by service type (if specified)
    // Snake is a service type (serviceType: "snake"), not a provider type
    if (query.serviceType && provider.serviceType !== query.serviceType) {
      console.log(`   ❌ Provider ${provider.id} filtered out: serviceType mismatch (query: ${query.serviceType}, provider: ${provider.serviceType})`);
      return false;
    }
    
    // Filter by location if provided
    if (query.filters?.location && !provider.location.toLowerCase().includes(query.filters.location.toLowerCase())) {
      console.log(`   ❌ Provider ${provider.id} filtered out: location mismatch (query: ${query.filters.location}, provider: ${provider.location})`);
      return false;
    }
    
    // Note: maxPrice filter is applied after querying provider APIs (prices come from APIs, not registry)
    if (query.filters?.minReputation && provider.reputation < query.filters.minReputation) {
      console.log(`   ❌ Provider ${provider.id} filtered out: reputation too low (query: ${query.filters.minReputation}, provider: ${provider.reputation})`);
      return false;
    }
    
    console.log(`   ✅ Provider ${provider.id} matched!`);
    return true;
  });
  
  console.log(`🔍 [queryROOTCAServiceRegistry] Filtered result: ${filtered.length} providers`);
  return filtered;
}

// Query AMC API
export async function queryAMCAPI(location: string, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Get the actual gardenId from the provider registry (match old codebase behavior)
  const amcProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === "amc-001");
  const gardenId = amcProvider?.gardenId || "unknown"; // Fallback to "unknown" if not found (old codebase behavior)
  
  if (!amcProvider) {
    console.warn(`⚠️  [queryAMCAPI] Provider amc-001 not found in ROOT_CA_SERVICE_REGISTRY. Using fallback gardenId: ${gardenId}`);
  } else if (!amcProvider.gardenId) {
    console.warn(`⚠️  [queryAMCAPI] Provider amc-001 found but has no gardenId. Using fallback: ${gardenId}`);
  } else {
    console.log(`✅ [queryAMCAPI] Found amc-001 with gardenId: ${gardenId}`);
  }
  
  // NEW: Return all videos from server/data/videos directory - ALL FREE
  // Filter by genre if specified (e.g., "sci-fi" -> matches content_tags like "fantasy", "cgi", "space", etc.)
  return getAllMoviesAsListings("amc-001", "AMC Theatres", gardenId, filters);
  
  // OLD CODE (commented out - replaced with free video listings):
  /* Mock AMC API response with real-time pricing
  return [
    {
      providerId: "amc-001",
      providerName: "AMC Theatres",
      movieTitle: "Back to the Future",
      movieId: "back-to-future-1",
      price: 2.0, // Real-time price from AMC API
      showtime: "10:30 PM",
      location: location,
      reviewCount: 100,
      rating: 5.0,
      gardenId: gardenId
    },
    {
      providerId: "amc-001",
      providerName: "AMC Theatres",
      movieTitle: "The Matrix",
      movieId: "matrix-001",
      price: 2.0, // Real-time price from AMC API
      showtime: "8:00 PM",
      location: location,
      reviewCount: 150,
      rating: 4.9,
      gardenId: gardenId
    },
  ];
  */
}

// Query Movie.com API
export async function queryMovieComAPI(location: string, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Get the actual gardenId from the provider registry (match old codebase behavior)
  const moviecomProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === "moviecom-001");
  const gardenId = moviecomProvider?.gardenId || "unknown"; // Fallback to "unknown" if not found (old codebase behavior)
  
  if (!moviecomProvider) {
    console.warn(`⚠️  [queryMovieComAPI] Provider moviecom-001 not found in ROOT_CA_SERVICE_REGISTRY. Using fallback gardenId: ${gardenId}`);
    // Return hardcoded "Back to the Future 1" if provider not found
    return [
      {
        providerId: "moviecom-001",
        providerName: "MovieCom",
        movieTitle: "Back to the Future",
        movieId: "back-to-future-1",
        price: 1.5,
        showtime: "9:45 PM",
        location: location || "Baltimore, Maryland",
        reviewCount: 85,
        rating: 4.7,
        gardenId: gardenId
      }
    ];
  } else if (!moviecomProvider.gardenId) {
    console.warn(`⚠️  [queryMovieComAPI] Provider moviecom-001 found but has no gardenId. Using fallback: ${gardenId}`);
    // Return hardcoded "Back to the Future 1" if no gardenId
    return [
      {
        providerId: "moviecom-001",
        providerName: "MovieCom",
        movieTitle: "Back to the Future",
        movieId: "back-to-future-1",
        price: 1.5,
        showtime: "9:45 PM",
        location: location || "Baltimore, Maryland",
        reviewCount: 85,
        rating: 4.7,
        gardenId: gardenId
      }
    ];
  }
  if (moviecomProvider) {
    console.log(`✅ [queryMovieComAPI] Found moviecom-001 with gardenId: ${gardenId}`);
  }
  
  // NEW: Return all videos from server/data/videos directory - ALL FREE
  // Filter by genre if specified
  return getAllMoviesAsListings("moviecom-001", "MovieCom", gardenId, filters);
}

// Query Cinemark API
export async function queryCinemarkAPI(location: string, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Get the actual gardenId from the provider registry (match old codebase behavior)
  const cinemarkProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === "cinemark-001");
  const gardenId = cinemarkProvider?.gardenId || "unknown"; // Fallback to "unknown" if not found (old codebase behavior)
  
  if (!cinemarkProvider) {
    console.warn(`⚠️  [queryCinemarkAPI] Provider cinemark-001 not found in ROOT_CA_SERVICE_REGISTRY. Using fallback gardenId: ${gardenId}`);
    // Return hardcoded "Back to the Future 1" if provider not found
    return [
      {
        providerId: "cinemark-001",
        providerName: "Cinemark",
        movieTitle: "Back to the Future",
        movieId: "back-to-future-1",
        price: 2.5,
        showtime: "11:00 PM",
        location: location || "Baltimore, Maryland",
        reviewCount: 120,
        rating: 4.8,
        gardenId: gardenId
      }
    ];
  } else if (!cinemarkProvider.gardenId) {
    console.warn(`⚠️  [queryCinemarkAPI] Provider cinemark-001 found but has no gardenId. Using fallback: ${gardenId}`);
  } else {
    console.log(`✅ [queryCinemarkAPI] Found cinemark-001 with gardenId: ${gardenId}`);
  }
  
  // NEW: Return all videos from server/data/videos directory - ALL FREE
  // Filter by genre if specified
  return getAllMoviesAsListings("cinemark-001", "Cinemark", gardenId, filters);
}

// Query DEX Pool API
export async function queryDEXPoolAPI(provider: ServiceProvider, filters?: { tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL' }): Promise<TokenListing[]> {
  await new Promise(resolve => setTimeout(resolve, 30));
  
  // Check if provider exists in registry and has gardenId
  const providerInRegistry = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === provider.id);
  if (!providerInRegistry) {
    console.warn(`⚠️  [queryDEXPoolAPI] Provider ${provider.id} not found in ROOT_CA_SERVICE_REGISTRY. Total providers: ${ROOT_CA_SERVICE_REGISTRY.length}`);
    console.warn(`⚠️  [queryDEXPoolAPI] Available providers: ${ROOT_CA_SERVICE_REGISTRY.map(p => p.id).join(', ')}`);
    return [];
  }
  if (!provider.gardenId) {
    console.warn(`⚠️  [queryDEXPoolAPI] Provider ${provider.id} found but has no gardenId`);
    return [];
  }
  console.log(`✅ [queryDEXPoolAPI] Found provider ${provider.id} with gardenId: ${provider.gardenId}`);
  
  // Check if DEX_POOLS has any pools
  if (DEX_POOLS.size === 0) {
    console.warn(`⚠️  [queryDEXPoolAPI] DEX_POOLS is empty! No pools available.`);
    console.warn(`⚠️  [queryDEXPoolAPI] TOKEN_GARDENS.length: ${TOKEN_GARDENS.length}`);
    console.warn(`⚠️  [queryDEXPoolAPI] TOKEN_GARDENS:`, TOKEN_GARDENS.map(tg => ({ id: tg.id, name: tg.name })));
    console.warn(`⚠️  [queryDEXPoolAPI] DEX_POOLS reference:`, DEX_POOLS);
    console.warn(`⚠️  [queryDEXPoolAPI] DEX_POOLS entries:`, Array.from(DEX_POOLS.entries()));
    return [];
  }
  console.log(`✅ [queryDEXPoolAPI] DEX_POOLS has ${DEX_POOLS.size} pool(s)`);
  console.log(`✅ [queryDEXPoolAPI] DEX_POOLS entries:`, Array.from(DEX_POOLS.entries()).map(([id, pool]) => ({
    poolId: id,
    tokenSymbol: pool.tokenSymbol,
    gardenId: pool.gardenId
  })));
  
  const listings: TokenListing[] = [];
  
  console.log(`🔍 [DEX] Querying pools for provider: ${provider.id} (gardenId: ${provider.gardenId})`);
  console.log(`   Filters: ${JSON.stringify(filters)}`);
  
  // Find pools matching the provider
  // Match by: 1) provider.gardenId matches pool.gardenId, OR 2) provider.id contains token symbol
  // If no specific match, return all pools for DEX providers (fallback)
  let hasMatch = false;
  for (const [poolId, pool] of DEX_POOLS.entries()) {
    const tokenSymbolLower = pool.tokenSymbol.toLowerCase();
    const providerIdLower = provider.id.toLowerCase();
    
    // Match by garden ID (most reliable)
    const matchesByGarden = pool.gardenId === provider.gardenId;
    
    // Match by token symbol in provider ID (e.g., "dex-pool-tokena" contains "tokena")
    const matchesBySymbol = providerIdLower.includes(tokenSymbolLower);
    
    // Also check if provider ID matches the expected pattern "dex-pool-{tokenSymbol}"
    const expectedProviderId = `dex-pool-${tokenSymbolLower}`;
    const matchesByPattern = providerIdLower === expectedProviderId;
    
    const matchesProvider = matchesByGarden || matchesBySymbol || matchesByPattern;
    
    if (matchesProvider) hasMatch = true;
    
    console.log(`   Pool ${pool.tokenSymbol} (${pool.gardenId}): matchesByGarden=${matchesByGarden}, matchesBySymbol=${matchesBySymbol}, matchesByPattern=${matchesByPattern} (provider.id="${provider.id}", expected="${expectedProviderId}")`);
    
    if (!matchesProvider) continue;
    
    // Apply filters
    if (filters?.tokenSymbol && pool.tokenSymbol.toUpperCase() !== filters.tokenSymbol.toUpperCase()) {
      console.log(`   Pool ${pool.tokenSymbol} filtered out by tokenSymbol filter: ${pool.tokenSymbol.toUpperCase()} !== ${filters.tokenSymbol.toUpperCase()}`);
      continue;
    }
    if (filters?.baseToken && pool.baseToken.toUpperCase() !== filters.baseToken.toUpperCase()) {
      console.log(`   Pool ${pool.tokenSymbol} filtered out by baseToken filter: ${pool.baseToken.toUpperCase()} !== ${filters.baseToken.toUpperCase()}`);
      continue;
    }
    
    console.log(`   ✅ Pool ${pool.tokenSymbol} matched!`);
    listings.push({
      poolId: pool.poolId,
      providerId: provider.id,
      providerName: provider.name,
      tokenSymbol: pool.tokenSymbol,
      tokenName: pool.tokenName,
      baseToken: pool.baseToken,
      price: pool.price,
      liquidity: pool.poolLiquidity,
      volume24h: pool.totalVolume,
      gardenId: pool.gardenId,
    });
  }
  
  // Debug logging
  if (listings.length === 0) {
    console.log(`⚠️  [DEX] No pools matched for provider ${provider.id} (gardenId: ${provider.gardenId})`);
    console.log(`   Available pools: ${Array.from(DEX_POOLS.values()).map(p => `${p.tokenSymbol} (${p.gardenId})`).join(", ")}`);
    
    // Fallback: If this is a DEX provider but no pools matched, return all pools for this garden
    // This handles edge cases where matching logic might fail
    if (!hasMatch && provider.serviceType === "dex") {
      console.log(`   🔄 Fallback: Returning all pools for garden ${provider.gardenId}`);
      for (const [poolId, pool] of DEX_POOLS.entries()) {
        if (pool.gardenId === provider.gardenId) {
          // Apply filters
          if (filters?.tokenSymbol && pool.tokenSymbol.toUpperCase() !== filters.tokenSymbol.toUpperCase()) continue;
          if (filters?.baseToken && pool.baseToken.toUpperCase() !== filters.baseToken.toUpperCase()) continue;
          
          listings.push({
            poolId: pool.poolId,
            providerId: provider.id,
            providerName: provider.name,
            tokenSymbol: pool.tokenSymbol,
            tokenName: pool.tokenName,
            baseToken: pool.baseToken,
            price: pool.price,
            liquidity: pool.poolLiquidity,
            volume24h: pool.totalVolume,
            gardenId: pool.gardenId,
          });
        }
      }
      if (listings.length > 0) {
        console.log(`   ✅ Fallback found ${listings.length} pool(s)`);
      }
    }
  } else {
    console.log(`✅ [DEX] Found ${listings.length} pool(s) for provider ${provider.id}`);
  }
  
  return listings;
}

// Provider API router
// Mock Snake (Advertising) Provider API
export async function querySnakeAPI(provider: ServiceProvider, filters?: { genre?: string; time?: string }): Promise<MovieListing[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Snake providers return enhanced/advertised listings
  // For testing: Return movie listings with Snake provider metadata
  const baseListings: MovieListing[] = [
    {
      providerId: provider.id,
      providerName: provider.name,
      movieTitle: "Premium Cinema Experience",
      movieId: "premium-cinema-001",
      price: 18.99, // Slightly higher price (premium)
      showtime: filters?.time || "8:00 PM",
      location: "Premium Theater District",
      reviewCount: 1250,
      rating: 4.7,
      gardenId: provider.gardenId
    },
    {
      providerId: provider.id,
      providerName: provider.name,
      movieTitle: "VIP Movie Night",
      movieId: "vip-movie-001",
      price: 22.50, // Premium pricing
      showtime: filters?.time || "9:30 PM",
      location: "Luxury Cinema Complex",
      reviewCount: 890,
      rating: 4.8,
      gardenId: provider.gardenId
    }
  ];
  
  console.log(`🐍 [Snake Provider] ${provider.name} returned ${baseListings.length} advertised listings`);
  return baseListings;
}

export async function queryProviderAPI(
  provider: ServiceProvider,
  filters?: { genre?: string; time?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL'; [key: string]: any }
): Promise<MovieListing[] | TokenListing[] | GenericServiceListing[]> {
  // Handle Snake services (serviceType: "snake")
  // Snake is a service type, each Snake service belongs to a garden
  if (provider.serviceType === "snake") {
    return await querySnakeAPI(provider, filters);
  }
  
  // Handle DEX providers
  if (provider.serviceType === "dex") {
    return await queryDEXPoolAPI(provider, filters);
  }
  
  // Handle regular movie providers
  switch (provider.id) {
    case "amc-001":
      return await queryAMCAPI(provider.location, filters);
    case "moviecom-001":
      return await queryMovieComAPI(provider.location, filters);
    case "cinemark-001":
      return await queryCinemarkAPI(provider.location, filters);
    default:
      // Provider plugin fallback (SQL-backed providers)
      if (String(provider.apiEndpoint || "").toLowerCase().startsWith("eden:plugin:mysql")) {
        const cfg = getMySQLProviderPluginConfig(provider.id);
        if (!cfg) {
          throw new Error(`MySQL plugin config not found for provider: ${provider.id}`);
        }

        // ROOT CA LLM Integration: Use GOD-controlled getData() parameter extraction
        // If filters contain a raw user query, use ROOT CA LLM to extract structured params
        let params: any[] = [];
        const paramOrder = Array.isArray(cfg.paramOrder) ? cfg.paramOrder : [];
        
        // Check if filters contain a raw query (from ROOT CA LLM extraction)
        if (filters && typeof (filters as any).rawQuery === "string" && (filters as any).rawQuery.trim()) {
          console.log(`   👑 [Provider Plugin] ROOT CA LLM: Extracting getData() params from raw query`);
          try {
            const getDataParams = await extractGetDataParamsWithOpenAI((filters as any).rawQuery);
            // Map getData() params to SQL params based on paramOrder
            params = paramOrder.map(k => {
              // Try to match getData() params to paramOrder keys
              const matchedParam = getDataParams.params.find((p: string) => 
                p.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(p.toLowerCase())
              );
              return matchedParam || (filters as any)?.[k];
            });
            console.log(`   👑 [Provider Plugin] ROOT CA LLM extracted params:`, getDataParams.params);
            console.log(`   👑 [Provider Plugin] Mapped to SQL params:`, params);
          } catch (llmErr: any) {
            console.warn(`   ⚠️  [Provider Plugin] ROOT CA LLM extraction failed, falling back to direct filters:`, llmErr.message);
            params = paramOrder.map(k => (filters as any)?.[k]);
          }
        } else {
          // Standard parameter mapping (backward compatibility)
          params = paramOrder.map(k => (filters as any)?.[k]);
        }

        const result = await testMySQLQuery({
          connection: cfg.connection,
          sql: cfg.sql,
          params,
          maxRows: cfg.maxRows || 50,
        });

        const fieldMap = cfg.fieldMap || {};
        const rows = result.rows || [];

        // Helper function to normalize BigInt values for JSON serialization
        const normalizeBigInt = (value: any): any => {
          if (typeof value === 'bigint') {
            // Convert BigInt to Number if within safe integer range, otherwise to String
            if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
              return Number(value);
            } else {
              return value.toString();
            }
          }
          if (Array.isArray(value)) {
            return value.map(normalizeBigInt);
          }
          if (value !== null && typeof value === 'object') {
            const normalized: any = {};
            for (const [k, v] of Object.entries(value)) {
              normalized[k] = normalizeBigInt(v);
            }
            return normalized;
          }
          return value;
        };

        // Check if this is an autoparts query with images (has both autopart and image columns)
        const hasImageColumns = rows.length > 0 && (
          'autopart_id' in rows[0] || 
          'image_id' in rows[0] || 
          'image_url' in rows[0] ||
          'i.id' in rows[0] ||
          Object.keys(rows[0]).some(k => k.startsWith('image_') || k.startsWith('i.') || k.toLowerCase().includes('image'))
        );
        const hasAutopartId = rows.length > 0 && (
          'id' in rows[0] || 
          'a.id' in rows[0] ||
          'autopart_id' in rows[0]
        );

        // If this is autoparts with images, group by autopart ID
        if (cfg.serviceType === "autoparts" && hasImageColumns && hasAutopartId) {
          console.log(`   🔄 [Provider Plugin] Grouping autoparts with images (${rows.length} rows)`);
          
          // Group rows by autopart ID
          const autopartsMap = new Map<number | string, any>();
          
          for (const row of rows) {
            // Determine autopart ID (could be 'id', 'a.id', or 'autopart_id')
            const autopartId = row.id || row['a.id'] || row.autopart_id || row['a.id'];
            if (!autopartId) continue;

            // Get or create autopart entry
            if (!autopartsMap.has(autopartId)) {
              const autopart: any = {
                providerId: provider.id,
                providerName: provider.name,
                gardenId: provider.gardenId,
                location: provider.location,
                imageModals: [] as any[]
              };

              // Copy autopart columns (columns starting with 'a.' or direct columns that aren't image-related)
              for (const [k, v] of Object.entries(row || {})) {
                // Skip image columns (they'll be in imageModals)
                // Skip columns that start with 'image_' prefix or are image-related
                if (k.startsWith('image_') || k.startsWith('i.') || (k.toLowerCase().includes('image') && k !== 'imageModals') || k === 'autopart_id') {
                  continue;
                }
                // Copy autopart columns and normalize BigInt values
                if (k.startsWith('a.')) {
                  const cleanKey = k.substring(2); // Remove 'a.' prefix
                  autopart[cleanKey] = normalizeBigInt(v);
                } else {
                  autopart[k] = normalizeBigInt(v);
                }
              }

              // Canonical field mapping for autopart
              for (const [canonical, col] of Object.entries(fieldMap)) {
                if (row[col] !== undefined) {
                  autopart[canonical] = normalizeBigInt(row[col]);
                }
              }

              // Ensure price exists
              if (autopart.price === undefined || autopart.price === null) {
                const maybePrice = autopart.Price ?? autopart.price_usd ?? autopart.amount ?? autopart.cost ?? autopart.sale_price;
                autopart.price = typeof maybePrice === "string" ? parseFloat(maybePrice) : (typeof maybePrice === "number" ? maybePrice : 0);
              }

              // Autoparts workflow expects partName/partNumber/category/etc
              if (!autopart.partName && autopart.part_name) autopart.partName = autopart.part_name;
              if (!autopart.partName && autopart.title) autopart.partName = autopart.title;

              autopartsMap.set(autopartId, autopart);
            }

            // Add image to imageModals if image data exists
            const autopart = autopartsMap.get(autopartId)!;
            const imageData: any = {};
            let hasImageData = false;

            // Extract image columns (columns prefixed with 'image_' or specific image fields)
            for (const [k, v] of Object.entries(row || {})) {
              // Handle aliased image columns (image_id, image_url, image_alt, etc.)
              if (k.startsWith('image_')) {
                const cleanKey = k.substring(6); // Remove 'image_' prefix
                if (v !== null && v !== undefined) {
                  imageData[cleanKey] = normalizeBigInt(v);
                  hasImageData = true;
                }
              } else if (k === 'autopart_id' && v !== null && v !== undefined) {
                // Keep autopart_id for reference
                imageData[k] = normalizeBigInt(v);
              } else if (k.startsWith('i.')) {
                // Handle 'i.' prefixed columns (fallback)
                const cleanKey = k.substring(2);
                if (v !== null && v !== undefined) {
                  imageData[cleanKey] = normalizeBigInt(v);
                  hasImageData = true;
                }
              }
            }

            // Only add image if it has data (not null/undefined)
            if (hasImageData && Object.keys(imageData).length > 0) {
              // Avoid duplicates (check if image with same ID already exists)
              const imageId = imageData.id || imageData.image_id;
              if (imageId && !autopart.imageModals.find((img: any) => (img.id || img.image_id) === imageId)) {
                autopart.imageModals.push(imageData);
              } else if (!imageId) {
                // If no ID, check by URL or other unique field to avoid duplicates
                const imageUrl = imageData.url || imageData.image_url;
                if (imageUrl && !autopart.imageModals.find((img: any) => (img.url || img.image_url) === imageUrl)) {
                  autopart.imageModals.push(imageData);
                } else if (!imageUrl) {
                  // If no unique identifier, just add it (might be a duplicate, but better than losing data)
                  autopart.imageModals.push(imageData);
                }
              }
            }
          }

          // No hardcoded filtering - return all fields from grouped autoparts
          // Field filtering is controlled by returnFields parameter in test-getdata endpoint
          const listings = Array.from(autopartsMap.values());
          console.log(`   ✅ [Provider Plugin] Grouped into ${listings.length} autoparts with images`);
          console.log(`   📋 [Provider Plugin] Returning all fields (no hardcoded filtering)`);
          return listings as GenericServiceListing[];
        }

        // Standard mapping for non-grouped results
        // Map raw DB rows into a canonical listing object used by FlowWise workflows.
        const listings: GenericServiceListing[] = rows.map((row: any, idx: number) => {
          const out: any = {
            providerId: provider.id,
            providerName: provider.name,
            gardenId: provider.gardenId,
            location: provider.location,
          };

          // Generic copy of row values with BigInt normalization
          for (const [k, v] of Object.entries(row || {})) out[k] = normalizeBigInt(v);

          // Canonical field mapping
          for (const [canonical, col] of Object.entries(fieldMap)) {
            out[canonical] = normalizeBigInt((row as any)?.[col]);
          }

          // Ensure price exists (many workflows expect `price`)
          if (out.price === undefined || out.price === null) {
            const maybePrice = out.Price ?? out.price_usd ?? out.amount ?? out.cost ?? out.sale_price;
            out.price = typeof maybePrice === "string" ? parseFloat(maybePrice) : (typeof maybePrice === "number" ? maybePrice : 0);
          }

          // Airline workflow expects flightId/flightNumber/destination/date for label templates
          if (cfg.serviceType === "airline") {
            if (!out.flightNumber && out.flight_no) out.flightNumber = out.flight_no;
            if (!out.flightId) out.flightId = `flight-${out.flightNumber || idx}`;
          }

          // Autoparts workflow expects partName/partNumber/category/etc (best-effort)
          if (cfg.serviceType === "autoparts") {
            if (!out.partName && out.part_name) out.partName = out.part_name;
            if (!out.partName && out.title) out.partName = out.title;
          }

          return out as GenericServiceListing;
        });

        return listings;
      }

      throw new Error(`Unknown provider: ${provider.id}`);
  }
}

export async function queryServiceProviders(
  providers: ServiceProvider[],
  filters?: { genre?: string; time?: string; tokenSymbol?: string; baseToken?: string; action?: 'BUY' | 'SELL'; [key: string]: any }
): Promise<MovieListing[] | TokenListing[] | GenericServiceListing[]> {
  const allListings: any[] = [];
  
  // Query each provider's external API in parallel
  const providerPromises = providers.map(provider => 
    queryProviderAPI(provider, filters).catch(err => {
      console.warn(`⚠️  Failed to query ${provider.name} API:`, err.message);
      return []; // Return empty array on error
    })
  );
  
  const results = await Promise.all(providerPromises);
  
  // Flatten results
  for (const listings of results) {
    allListings.push(...(listings as any[]));
  }
  
  return allListings;
}

// Issue certificate to a service provider
export function issueServiceProviderCertificate(provider: ServiceProviderWithCert): EdenCertificate {
  if (!ROOT_CA) {
    throw new Error("ROOT CA not initialized");
  }
  
  const cert = ROOT_CA.issueCertificate({
    subject: provider.uuid,
    capabilities: ["SERVICE_PROVIDER", "PRICE_QUOTE", "RECEIVE_PAYMENT"],
    constraints: {
      providerId: provider.id,
      providerName: provider.name,
      serviceType: provider.serviceType,
      location: provider.location,
      bond: provider.bond,
      reputation: provider.reputation
    },
    ttlSeconds: 90 * 24 * 60 * 60 // 90 days
  });
  
  CERTIFICATE_REGISTRY.set(provider.uuid, cert);
  provider.certificate = cert;
  
  // CRITICAL: Update provider in ServiceRegistry2 if it exists there
  try {
    const serviceRegistry2 = getServiceRegistry2();
    if (serviceRegistry2.hasProvider(provider.id)) {
      // Update the provider with the new certificate
      serviceRegistry2.updateProvider(provider);
      console.log(`📜 [ServiceRegistry2] Updated provider ${provider.name} with certificate`);
    }
  } catch (err: any) {
    // ServiceRegistry2 not initialized, that's okay - we'll continue with old system
    if (!err.message.includes('not initialized')) {
      console.warn(`⚠️  [ServiceRegistry2] Failed to update provider with certificate: ${err.message}`);
    }
  }
  
  console.log(`📜 Certificate issued to ${provider.name}: ${provider.uuid}`);
  console.log(`   Capabilities: ${cert.capabilities.join(", ")}`);
  
  broadcastEvent({
    type: "certificate_issued",
    component: "root-ca",
    message: `Certificate issued to ${provider.name}`,
    timestamp: Date.now(),
    data: {
      subject: cert.subject,
      issuer: cert.issuer,
      capabilities: cert.capabilities,
      expiresAt: cert.expiresAt
    }
  });
  
  return cert;
}

