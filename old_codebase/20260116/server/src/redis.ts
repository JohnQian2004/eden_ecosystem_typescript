/**
 * In-Memory Redis Server Module
 * Provides an in-memory Redis-compatible server with persistence
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { EventEmitter } from "events";
import { DEPLOYED_AS_ROOT } from "./config";
import { GARDENS, TOKEN_GARDENS, ROOT_CA_SERVICE_REGISTRY } from "./state";
import type { ServiceProviderWithCert } from "./types";

/**
 * In-memory Redis server implementation with persistence
 * Supports key-value operations, streams, and consumer groups
 */
export class InMemoryRedisServer extends EventEmitter {
  private data: Map<string, any> = new Map();
  private streams: Map<string, Array<{ id: string; fields: Record<string, string> }>> = new Map();
  private streamCounters: Map<string, number> = new Map();
  private consumerGroups: Map<string, Map<string, string>> = new Map(); // stream -> group -> lastId
  private pendingMessages: Map<string, Map<string, Array<{ id: string; fields: Record<string, string> }>>> = new Map(); // stream -> group -> messages
  private isConnected = false;
  private persistenceFile: string; // Main wallet persistence file (backward compatibility)
  private ledgerEntriesFile: string; // Separate file for ledger entries
  private gardensFile: string; // Separate file for gardens
  private serviceRegistryFile: string; // Separate file for service registry
  private saveTimeout: NodeJS.Timeout | null = null;
  private readonly SAVE_DELAY_MS = 1000; // Debounce saves by 1 second

  constructor() {
    super();
    // Persistence files in the same directory as the script
    this.persistenceFile = path.join(__dirname, '..', 'eden-wallet-persistence.json');
    this.ledgerEntriesFile = path.join(__dirname, '..', 'eden-ledgerEntries-persistence.json');
    this.gardensFile = path.join(__dirname, '..', 'eden-gardens-persistence.json');
    this.serviceRegistryFile = path.join(__dirname, '..', 'eden-serviceRegistry-persistence.json');
    this.loadPersistence();
  }

  // Load wallet data, ledger entries, and indexers from persistence files
  // REFACTOR: Now uses separate files for each data type, with backward compatibility
  // CRITICAL: This method should ONLY be called during server startup (constructor)
  // NEVER call this during runtime - it will overwrite in-memory state!
  private loadPersistence(): { walletBalances: Record<string, string>, ledgerEntries: any[], indexers: any[] } {
    // CRITICAL: Prevent reloading during runtime - only allow during server startup
    if (this.persistenceLoaded) {
      console.error(`❌ [Redis Persistence] CRITICAL ERROR: loadPersistence() called AFTER server startup! This should NEVER happen!`);
      console.error(`❌ [Redis Persistence] Stack trace:`, new Error().stack);
      throw new Error('loadPersistence() can only be called during server startup (constructor), not during runtime!');
    }
    const result: { walletBalances: Record<string, string>, ledgerEntries: any[], indexers: any[] } = { walletBalances: {}, ledgerEntries: [], indexers: [] };
    
    // Check if we should migrate from old combined file
    const hasOldFile = fs.existsSync(this.persistenceFile);
    const hasNewFiles = fs.existsSync(this.ledgerEntriesFile) || fs.existsSync(this.gardensFile) || fs.existsSync(this.serviceRegistryFile);
    
    // If old file exists but new files don't, migrate
    if (hasOldFile && !hasNewFiles) {
      console.log(`🔄 [Persistence Migration] Detected old combined file, migrating to separate files...`);
      this.migrateToSeparateFiles();
    }
    
    try {
      // Load wallet balances (always from main file for now, for backward compatibility)
      if (fs.existsSync(this.persistenceFile)) {
        const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
        const persisted = JSON.parse(fileContent);
        
        // Restore wallet balances and audit logs
        if (persisted.walletBalances && Object.keys(persisted.walletBalances).length > 0) {
          for (const [key, value] of Object.entries(persisted.walletBalances)) {
            this.data.set(key, value);
            // Log balance keys for debugging
            if (key.startsWith('wallet:balance:')) {
              console.log(`📂 [Redis Persistence] Loaded wallet balance: ${key} = ${value}`);
            }
          }
          result.walletBalances = persisted.walletBalances;
          console.log(`📂 [Redis Persistence] Loaded ${Object.keys(persisted.walletBalances).length} wallet balances from ${this.persistenceFile}`);
        } else {
          console.log(`📂 [Redis Persistence] No wallet balances found in persistence file (starting with empty wallets)`);
        }
      }
      
      // Load ledger entries from separate file
      if (fs.existsSync(this.ledgerEntriesFile)) {
        try {
          const fileContent = fs.readFileSync(this.ledgerEntriesFile, 'utf-8');
          const persisted = JSON.parse(fileContent);
          if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries) && persisted.ledgerEntries.length > 0) {
            // CRITICAL: Normalize numeric fields when loading from persistence
            // JSON.parse may have stored numbers as strings, so we need to convert them back
            result.ledgerEntries = persisted.ledgerEntries.map((entry: any) => ({
              ...entry,
              iGasCost: typeof entry.iGasCost === 'string' ? parseFloat(entry.iGasCost) : (entry.iGasCost || 0),
              amount: typeof entry.amount === 'string' ? parseFloat(entry.amount) : (entry.amount || 0),
              timestamp: typeof entry.timestamp === 'string' ? parseInt(entry.timestamp) : (entry.timestamp || Date.now()),
              fees: entry.fees ? Object.fromEntries(
                Object.entries(entry.fees).map(([key, value]: [string, any]) => [
                  key,
                  typeof value === 'string' ? parseFloat(value) : (value || 0)
                ])
              ) : {}
            }));
            console.log(`📂 [Redis Persistence] Loaded ${persisted.ledgerEntries.length} ledger entries from ${this.ledgerEntriesFile} (normalized numeric fields)`);
          }
        } catch (err: any) {
          console.warn(`⚠️  [Redis Persistence] Failed to load ledger entries from separate file: ${err.message}`);
        }
      } else if (hasOldFile) {
        // Fallback to old file for backward compatibility
        const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
        const persisted = JSON.parse(fileContent);
        if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries) && persisted.ledgerEntries.length > 0) {
          // CRITICAL: Normalize numeric fields when loading from persistence
          result.ledgerEntries = persisted.ledgerEntries.map((entry: any) => ({
            ...entry,
            iGasCost: typeof entry.iGasCost === 'string' ? parseFloat(entry.iGasCost) : (entry.iGasCost || 0),
            amount: typeof entry.amount === 'string' ? parseFloat(entry.amount) : (entry.amount || 0),
            timestamp: typeof entry.timestamp === 'string' ? parseInt(entry.timestamp) : (entry.timestamp || Date.now()),
            fees: entry.fees ? Object.fromEntries(
              Object.entries(entry.fees).map(([key, value]: [string, any]) => [
                key,
                typeof value === 'string' ? parseFloat(value) : (value || 0)
              ])
            ) : {}
          }));
          console.log(`📂 [Redis Persistence] Loaded ${persisted.ledgerEntries.length} ledger entries from old combined file (will migrate on next save, normalized numeric fields)`);
        }
      }
      
      // Load gardens from separate file
      if (fs.existsSync(this.gardensFile)) {
        try {
          const fileContent = fs.readFileSync(this.gardensFile, 'utf-8');
          const persisted = JSON.parse(fileContent);
          const gardensToLoad = persisted.gardens || persisted.indexers || [];
          if (gardensToLoad && Array.isArray(gardensToLoad) && gardensToLoad.length > 0) {
            // CRITICAL: Deduplicate gardens when loading to prevent duplicates in memory
            const deduplicatedGardens = new Map<string, any>();
            for (const garden of gardensToLoad) {
              const existing = deduplicatedGardens.get(garden.id);
              if (!existing) {
                deduplicatedGardens.set(garden.id, garden);
              } else {
                // Prefer the one with certificate
                const hasCert = !!(garden as any).certificate;
                const existingHasCert = !!(existing as any).certificate;
                if (hasCert && !existingHasCert) {
                  deduplicatedGardens.set(garden.id, garden);
                  console.warn(`⚠️  [Indexer Persistence] Found duplicate garden ${garden.id} when loading - keeping version with certificate`);
                } else {
                  console.warn(`⚠️  [Indexer Persistence] Found duplicate garden ${garden.id} when loading - keeping existing version`);
                }
              }
            }
            const cleanGardens = Array.from(deduplicatedGardens.values());
            result.indexers = cleanGardens;
            if (gardensToLoad.length !== cleanGardens.length) {
              console.warn(`⚠️  [Indexer Persistence] Removed ${gardensToLoad.length - cleanGardens.length} duplicate(s) when loading gardens from persistence file`);
            }
            console.log(`📂 [Redis Persistence] Loaded ${cleanGardens.length} persisted gardens from ${this.gardensFile}`);
          }
        } catch (err: any) {
          console.warn(`⚠️  [Redis Persistence] Failed to load gardens from separate file: ${err.message}`);
        }
      } else if (hasOldFile) {
        // Fallback to old file for backward compatibility
        const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
        const persisted = JSON.parse(fileContent);
        const gardensToLoad = persisted.gardens || persisted.indexers;
        if (gardensToLoad && Array.isArray(gardensToLoad) && gardensToLoad.length > 0) {
          // CRITICAL: Deduplicate gardens when loading to prevent duplicates in memory
          const deduplicatedGardens = new Map<string, any>();
          for (const garden of gardensToLoad) {
            const existing = deduplicatedGardens.get(garden.id);
            if (!existing) {
              deduplicatedGardens.set(garden.id, garden);
      } else {
              // Prefer the one with certificate
              const hasCert = !!(garden as any).certificate;
              const existingHasCert = !!(existing as any).certificate;
              if (hasCert && !existingHasCert) {
                deduplicatedGardens.set(garden.id, garden);
                console.warn(`⚠️  [Indexer Persistence] Found duplicate garden ${garden.id} when loading - keeping version with certificate`);
              } else {
                console.warn(`⚠️  [Indexer Persistence] Found duplicate garden ${garden.id} when loading - keeping existing version`);
              }
            }
          }
          const cleanGardens = Array.from(deduplicatedGardens.values());
          result.indexers = cleanGardens;
          if (gardensToLoad.length !== cleanGardens.length) {
            console.warn(`⚠️  [Indexer Persistence] Removed ${gardensToLoad.length - cleanGardens.length} duplicate(s) when loading gardens from persistence file`);
          }
          console.log(`📂 [Redis Persistence] Loaded ${cleanGardens.length} persisted gardens from old combined file (will migrate on next save)`);
        }
      }
      
      // Load service registry from separate file and merge with ROOT_CA_SERVICE_REGISTRY
      if (fs.existsSync(this.serviceRegistryFile)) {
        try {
          const fileContent = fs.readFileSync(this.serviceRegistryFile, 'utf-8');
          const persisted = JSON.parse(fileContent);
          if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry) && persisted.serviceRegistry.length > 0) {
            console.log(`📂 [Redis Persistence] Loading ${persisted.serviceRegistry.length} service providers from ${this.serviceRegistryFile}`);
            
            // CRITICAL: Get loaded gardens from result.indexers (they haven't been added to GARDENS/TOKEN_GARDENS yet)
            // Separate regular and token gardens from the loaded data
            const loadedRegularGardens = result.indexers.filter((g: any) => 
              !(g.tokenServiceType === 'dex' || (g.serviceType === 'dex' && g.id && g.id.startsWith('T')))
            );
            const loadedTokenGardens = result.indexers.filter((g: any) => 
              g.tokenServiceType === 'dex' || (g.serviceType === 'dex' && g.id && g.id.startsWith('T'))
            );
            
            // Merge persisted service registry with in-memory ROOT_CA_SERVICE_REGISTRY
            // Update existing providers' indexerId if they exist in both
            let updatedCount = 0;
            for (const persistedProvider of persisted.serviceRegistry) {
              const persistedGardenId = persistedProvider.gardenId || persistedProvider.indexerId;
              
              // CRITICAL: Only load providers whose gardens actually exist (or are "HG" for infrastructure)
              // Check if the garden exists in loaded gardens (from persistence file) or in-memory arrays
              const gardenExists = persistedGardenId === 'HG' || 
                                  loadedRegularGardens.some((g: any) => g.id === persistedGardenId) ||
                                  loadedTokenGardens.some((g: any) => g.id === persistedGardenId) ||
                                  GARDENS.some(g => g.id === persistedGardenId) || 
                                  TOKEN_GARDENS.some(tg => tg.id === persistedGardenId);
              
              if (!gardenExists && persistedGardenId) {
                console.log(`⚠️  [Service Registry] Skipping provider ${persistedProvider.id} (${persistedProvider.name}): gardenId "${persistedGardenId}" does not exist in loaded gardens or GARDENS/TOKEN_GARDENS`);
                console.log(`   🔍 Available gardens: ${[...GARDENS.map(g => g.id), ...TOKEN_GARDENS.map(tg => tg.id), 'HG'].join(', ')}`);
                // CRITICAL: Only remove providers during INITIAL load, not if they're already in memory
                // If a provider is already in ROOT_CA_SERVICE_REGISTRY, it means it was added dynamically
                // and we should NOT remove it just because the garden check failed (timing issue)
                const existingProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === persistedProvider.id);
                if (existingProvider) {
                  // Provider already exists in memory - don't remove it, just skip loading from file
                  console.log(`   ⚠️  [Service Registry] Provider ${persistedProvider.id} already in memory, keeping it (garden may be loading)`);
                  continue; // Skip loading from file, but keep the in-memory version
                }
                // Only skip if provider doesn't exist in memory (initial load scenario)
                continue; // Skip this provider
              }
              
              const existingProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === persistedProvider.id);
              if (existingProvider) {
                // Update gardenId from persisted file (this is the source of truth for provider assignments)
                // Support both indexerId and gardenId for backward compatibility
                
                // CRITICAL FIX: Correct incorrect "HG" assignments for movie providers
                // Movie providers should never be assigned to "HG" - they belong to regular gardens
                // If file has "HG" but in-memory default is "garden-1", use the correct default instead
                let resolvedGardenId = persistedGardenId;
                if (resolvedGardenId === "HG" && existingProvider.serviceType === "movie") {
                  const correctGardenId = existingProvider.gardenId; // Use in-memory default (should be "garden-1")
                  if (correctGardenId && correctGardenId !== "HG") {
                    console.log(`🔧 [Service Registry] CORRECTING ${existingProvider.name} (${existingProvider.id}): file has incorrect gardenId="HG" for movie provider, using correct default="${correctGardenId}"`);
                    resolvedGardenId = correctGardenId;
                  }
                }
                
                console.log(`🔍 [Service Registry Load] Processing ${persistedProvider.id}: file has gardenId="${persistedProvider.gardenId}", resolved="${resolvedGardenId}", in-memory has gardenId="${existingProvider.gardenId}"`);
                if (resolvedGardenId) {
                  // ALWAYS update from file (file is source of truth), even if values appear the same
                  // This ensures provider assignments are preserved after server restart
                  // CRITICAL: The in-memory default might be "HG" but the file has "garden-1" - file wins!
                  const oldValue = existingProvider.gardenId;
                  existingProvider.gardenId = resolvedGardenId;
                  if (oldValue !== resolvedGardenId) {
                    console.log(`📂 [Service Registry] ✅ UPDATED ${existingProvider.name} (${existingProvider.id}): gardenId from "${oldValue}" to "${resolvedGardenId}" (from file)`);
                    updatedCount++;
                  } else {
                    console.log(`📂 [Service Registry] ✓ ${existingProvider.name} (${existingProvider.id}) already has correct gardenId: "${resolvedGardenId}"`);
                  }
                } else {
                  console.log(`⚠️  [Service Registry] ${persistedProvider.id} has no gardenId in file, skipping update`);
                }
              } else {
                // Provider doesn't exist in defaults, add it (for dynamically created providers)
                console.log(`📂 [Service Registry] Adding persisted provider: ${persistedProvider.name} (${persistedProvider.id}) with gardenId=${persistedGardenId}`);
                // Check if provider already exists (by ID or UUID) to avoid duplicates
                const existingById = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === persistedProvider.id);
                const existingByUuid = persistedProvider.uuid ? ROOT_CA_SERVICE_REGISTRY.find(p => p.uuid === persistedProvider.uuid) : null;
                
                if (existingById || existingByUuid) {
                  console.log(`⚠️  [Service Registry] Provider ${persistedProvider.id} already exists in ROOT_CA_SERVICE_REGISTRY, skipping duplicate`);
                } else {
                  // Ensure all required fields are present before adding
                  const providerToAdd: ServiceProviderWithCert = {
                    id: persistedProvider.id,
                    uuid: persistedProvider.uuid || crypto.randomUUID(),
                    name: persistedProvider.name,
                    serviceType: persistedProvider.serviceType,
                    location: persistedProvider.location || 'Unknown',
                    bond: persistedProvider.bond || 0,
                    reputation: persistedProvider.reputation || 0,
                    gardenId: persistedGardenId || 'HG',
                    apiEndpoint: persistedProvider.apiEndpoint,
                    status: (persistedProvider.status as 'active' | 'revoked' | 'suspended') || 'active',
                    // Optional fields
                    insuranceFee: persistedProvider.insuranceFee,
                    iGasMultiplier: persistedProvider.iGasMultiplier,
                    iTaxMultiplier: persistedProvider.iTaxMultiplier,
                    maxInfluence: persistedProvider.maxInfluence,
                    contextsAllowed: persistedProvider.contextsAllowed,
                    contextsForbidden: persistedProvider.contextsForbidden,
                    adCapabilities: persistedProvider.adCapabilities,
                    certificate: persistedProvider.certificate
                  };
                  ROOT_CA_SERVICE_REGISTRY.push(providerToAdd);
                  console.log(`✅ [Service Registry] Successfully added provider: ${providerToAdd.name} (${providerToAdd.id}) with serviceType=${providerToAdd.serviceType}, gardenId=${providerToAdd.gardenId}`);
                }
              }
            }
            if (updatedCount > 0) {
              console.log(`📂 [Service Registry] Updated ${updatedCount} provider gardenId assignment(s) from persistence file`);
              // If we corrected any "HG" assignments for movie providers, save the corrected values back to file
              const correctedCount = ROOT_CA_SERVICE_REGISTRY.filter(p => {
                const persistedProvider = persisted.serviceRegistry.find((pp: any) => pp.id === p.id);
                return persistedProvider && 
                       persistedProvider.gardenId === "HG" && 
                       p.serviceType === "movie" && 
                       p.gardenId !== "HG";
              }).length;
              if (correctedCount > 0) {
                console.log(`🔧 [Service Registry] Corrected ${correctedCount} movie provider(s) from "HG" to correct gardenId - saving corrected values to file`);
                // Save the corrected values immediately
                this.saveServiceRegistry();
              }
            }
            // Log final state of providers after loading
            const movieProvidersAfterLoad = ROOT_CA_SERVICE_REGISTRY.filter(p => p.serviceType === 'movie');
            if (movieProvidersAfterLoad.length > 0) {
              console.log(`📂 [Service Registry] After load - Movie providers: ${movieProvidersAfterLoad.map(p => `${p.name} (${p.id}) → gardenId: ${p.gardenId}`).join(', ')}`);
            }
            const dexProvidersAfterLoad = ROOT_CA_SERVICE_REGISTRY.filter(p => p.serviceType === 'dex');
            if (dexProvidersAfterLoad.length > 0) {
              console.log(`📂 [Service Registry] After load - DEX providers: ${dexProvidersAfterLoad.map(p => `${p.name} (${p.id}) → gardenId: ${p.gardenId}`).join(', ')}`);
            } else {
              console.log(`⚠️  [Service Registry] After load - No DEX providers found in ROOT_CA_SERVICE_REGISTRY (total providers: ${ROOT_CA_SERVICE_REGISTRY.length})`);
            }
            console.log(`✅ [Service Registry] Merged service registry: ${ROOT_CA_SERVICE_REGISTRY.length} total providers`);
          }
        } catch (err: any) {
          console.warn(`⚠️  [Redis Persistence] Failed to load service registry from separate file: ${err.message}`);
        }
      } else if (hasOldFile) {
        // Fallback to old file for backward compatibility
        try {
          const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
          const persisted = JSON.parse(fileContent);
          if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry) && persisted.serviceRegistry.length > 0) {
            console.log(`📂 [Redis Persistence] Loading ${persisted.serviceRegistry.length} service providers from old combined file (will migrate on next save)`);
            
            // Merge persisted service registry with in-memory ROOT_CA_SERVICE_REGISTRY
            for (const persistedProvider of persisted.serviceRegistry) {
              const persistedGardenId = persistedProvider.gardenId || persistedProvider.indexerId;
              
              // CRITICAL: Only load providers whose gardens actually exist (or are "HG" for infrastructure)
              // Check if the garden exists in loaded gardens or in-memory arrays
              const gardenExists = persistedGardenId === 'HG' || 
                                  GARDENS.some(g => g.id === persistedGardenId) || 
                                  TOKEN_GARDENS.some(tg => tg.id === persistedGardenId);
              
              if (!gardenExists && persistedGardenId) {
                console.log(`⚠️  [Service Registry] Skipping provider ${persistedProvider.id} (${persistedProvider.name}): gardenId "${persistedGardenId}" does not exist (from old file)`);
                continue; // Skip this provider
              }
              
              const existingProvider = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === persistedProvider.id);
              if (existingProvider) {
                // Update gardenId from persisted file
                if (persistedGardenId) {
                  // ALWAYS update from file (file is source of truth)
                  const oldValue = existingProvider.gardenId;
                  existingProvider.gardenId = persistedGardenId;
                  if (oldValue !== persistedGardenId) {
                    console.log(`📂 [Service Registry] Updating ${existingProvider.name} (${existingProvider.id}): gardenId from "${oldValue}" to "${persistedGardenId}" (from old file)`);
                  }
                }
              } else {
                // Provider doesn't exist in defaults, add it (but only if garden exists)
                console.log(`📂 [Service Registry] Adding persisted provider: ${persistedProvider.name} (${persistedProvider.id}) with gardenId=${persistedGardenId}`);
                ROOT_CA_SERVICE_REGISTRY.push(persistedProvider as ServiceProviderWithCert);
              }
            }
            console.log(`✅ [Service Registry] Merged service registry from old file: ${ROOT_CA_SERVICE_REGISTRY.length} total providers`);
          }
        } catch (err: any) {
          console.warn(`⚠️  [Redis Persistence] Failed to load service registry from old file: ${err.message}`);
        }
      }
      
      if (!hasOldFile && !hasNewFiles) {
        console.log(`📂 [Redis Persistence] No persistence files found, starting fresh`);
      }
    } catch (err: any) {
      console.warn(`⚠️  [Redis Persistence] Failed to load persistence file: ${err.message}`);
    }
    return result;
  }
  
  // Migrate from old combined file to separate files
  private migrateToSeparateFiles(): void {
    try {
      if (!fs.existsSync(this.persistenceFile)) {
        return; // Nothing to migrate
      }
      
      console.log(`🔄 [Persistence Migration] Reading old combined file: ${this.persistenceFile}`);
      const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
      const persisted = JSON.parse(fileContent);
      
      // Migrate ledger entries
      if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries) && persisted.ledgerEntries.length > 0) {
        const ledgerData = {
          ledgerEntries: persisted.ledgerEntries,
          lastSaved: persisted.lastSaved || new Date().toISOString()
        };
        fs.writeFileSync(this.ledgerEntriesFile, JSON.stringify(ledgerData, null, 2), 'utf-8');
        console.log(`✅ [Persistence Migration] Migrated ${persisted.ledgerEntries.length} ledger entries to ${this.ledgerEntriesFile}`);
      }
      
      // Migrate gardens
      const gardensToMigrate = persisted.gardens || persisted.indexers;
      if (gardensToMigrate && Array.isArray(gardensToMigrate) && gardensToMigrate.length > 0) {
        const gardensData = {
          gardens: gardensToMigrate,
          lastSaved: persisted.lastSaved || new Date().toISOString()
        };
        fs.writeFileSync(this.gardensFile, JSON.stringify(gardensData, null, 2), 'utf-8');
        console.log(`✅ [Persistence Migration] Migrated ${gardensToMigrate.length} gardens to ${this.gardensFile}`);
      }
      
      // Migrate service registry
      if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry) && persisted.serviceRegistry.length > 0) {
        const serviceRegistryData = {
          serviceRegistry: persisted.serviceRegistry,
          lastSaved: persisted.lastSaved || new Date().toISOString()
        };
        fs.writeFileSync(this.serviceRegistryFile, JSON.stringify(serviceRegistryData, null, 2), 'utf-8');
        console.log(`✅ [Persistence Migration] Migrated ${persisted.serviceRegistry.length} service providers to ${this.serviceRegistryFile}`);
      }
      
      // Keep wallet balances in the main file (for now, can be migrated later if needed)
      console.log(`✅ [Persistence Migration] Migration complete. Wallet balances remain in ${this.persistenceFile}`);
    } catch (err: any) {
      console.error(`❌ [Persistence Migration] Failed to migrate: ${err.message}`);
    }
  }

  // Save wallet data, ledger entries, and indexers to persistence file (debounced)
  // CRITICAL: In ROOT mode, indexers should NOT be saved here - they're saved via immediate save in /api/wizard/create-indexer
  private savePersistence(ledgerEntries?: any[], indexers?: any[]): void {
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Debounce saves to avoid too many file writes
    this.saveTimeout = setTimeout(() => {
      try {
        // CRITICAL: Load existing wallet balances FIRST to preserve them
        // We must merge wallet balances, not overwrite them
        let existingWalletBalances: Record<string, string> = {};
        
        if (fs.existsSync(this.persistenceFile)) {
          try {
            const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
            const existing = JSON.parse(fileContent);
            if (existing.walletBalances && typeof existing.walletBalances === 'object') {
              existingWalletBalances = existing.walletBalances;
            }
          } catch (err: any) {
            console.warn(`⚠️  [Redis Persistence] Failed to load existing wallet balances: ${err.message}`);
          }
        }
        
        // Start with existing wallet balances from file (preserve them)
        const walletBalances: Record<string, string> = { ...existingWalletBalances };
        
        // CRITICAL: Update wallet balances from in-memory (including 0 balances)
        // 0 is a valid balance state after debits, so we must save it
        for (const [key, value] of this.data.entries()) {
          if (key.startsWith('wallet:balance:')) {
            // Always update balance if it exists in memory (including 0)
            const balanceValue = typeof value === 'string' ? value : JSON.stringify(value);
            const balanceNum = parseFloat(balanceValue);
            // Update if balance exists in memory AND is a valid number (including 0)
            if (!isNaN(balanceNum) && balanceNum >= 0) {
              walletBalances[key] = balanceValue;
            }
            // If balance is invalid (NaN or negative), preserve existing from file
          } else if (key.startsWith('wallet:audit:')) {
            // Always update audit logs (they're append-only)
            walletBalances[key] = typeof value === 'string' ? value : JSON.stringify(value);
          }
        }

        // Load existing ledger entries from separate file (or old file for backward compatibility)
        let existingLedgerEntries: any[] = [];
        if (fs.existsSync(this.ledgerEntriesFile)) {
          try {
            const fileContent = fs.readFileSync(this.ledgerEntriesFile, 'utf-8');
            const existing = JSON.parse(fileContent);
            if (existing.ledgerEntries && Array.isArray(existing.ledgerEntries)) {
              existingLedgerEntries = existing.ledgerEntries;
            }
          } catch (err: any) {
            console.warn(`⚠️  [Redis Persistence] Failed to load ledger entries from separate file: ${err.message}`);
          }
        } else if (fs.existsSync(this.persistenceFile)) {
          // Fallback to old file for backward compatibility
          try {
            const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
            const existing = JSON.parse(fileContent);
            if (existing.ledgerEntries && Array.isArray(existing.ledgerEntries)) {
              existingLedgerEntries = existing.ledgerEntries;
            }
          } catch (err: any) {
            console.warn(`⚠️  [Redis Persistence] Failed to load ledger entries from old file: ${err.message}`);
          }
        }
        
        // Load existing gardens from separate file (or old file for backward compatibility)
        let existingIndexers: any[] = [];
        if (fs.existsSync(this.gardensFile)) {
          try {
            const fileContent = fs.readFileSync(this.gardensFile, 'utf-8');
            const existing = JSON.parse(fileContent);
            const gardensFromFile = existing.gardens || existing.indexers;
            if (gardensFromFile && Array.isArray(gardensFromFile)) {
              existingIndexers = gardensFromFile;
            }
          } catch (err: any) {
            console.warn(`⚠️  [Redis Persistence] Failed to load gardens from separate file: ${err.message}`);
          }
        } else if (fs.existsSync(this.persistenceFile)) {
          // Fallback to old file for backward compatibility
          try {
            const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
            const existing = JSON.parse(fileContent);
            const gardensFromFile = existing.gardens || existing.indexers;
            if (gardensFromFile && Array.isArray(gardensFromFile)) {
              existingIndexers = gardensFromFile;
            }
            // Backward compatibility: Migrate tokenIndexers to gardens array if it exists (non-ROOT only)
            if (!DEPLOYED_AS_ROOT && existing.tokenIndexers && Array.isArray(existing.tokenIndexers)) {
              console.log(`📋 [Redis Persistence] Found tokenIndexers field - migrating to gardens array`);
              const existingTokenIds = new Set(existingIndexers.map((idx: any) => idx.id));
              for (const tokenIdx of existing.tokenIndexers) {
                if (!existingTokenIds.has(tokenIdx.id)) {
                  existingIndexers.push(tokenIdx);
                }
              }
            }
          } catch (err: any) {
            console.warn(`⚠️  [Redis Persistence] Failed to load gardens from old file: ${err.message}`);
          }
        }

        // Merge: use new data if provided, otherwise keep existing
        const finalLedgerEntries = ledgerEntries !== undefined ? ledgerEntries : existingLedgerEntries;
        // CRITICAL: In ROOT mode, use in-memory arrays as source of truth, NOT the file
        // The file might have duplicates from previous bad saves - we must use current in-memory state
        let finalIndexers: any[];
        if (DEPLOYED_AS_ROOT) {
          // ROOT mode: Use in-memory arrays (GARDENS + TOKEN_GARDENS) as single source of truth
          // Do NOT read from file - that would reintroduce duplicates
          const allInMemoryIndexers = [...GARDENS, ...TOKEN_GARDENS];
          finalIndexers = allInMemoryIndexers;
        } else {
          // Non-ROOT mode: use provided or existing from file
          finalIndexers = indexers !== undefined ? indexers : existingIndexers;
        }
        
        // CRITICAL: Always deduplicate gardens before saving to prevent duplicates
        // This is essential because saveLedgerEntries() can trigger saves that reload duplicates from file
        const originalCount = finalIndexers.length;
        const deduplicatedGardens = new Map<string, any>();
        for (const garden of finalIndexers) {
          const existing = deduplicatedGardens.get(garden.id);
          if (!existing) {
            deduplicatedGardens.set(garden.id, garden);
          } else {
            // Prefer the one with certificate
            const hasCert = !!(garden as any).certificate;
            const existingHasCert = !!(existing as any).certificate;
            if (hasCert && !existingHasCert) {
              deduplicatedGardens.set(garden.id, garden);
              console.warn(`⚠️  [Indexer Persistence] Found duplicate garden ${garden.id} in savePersistence - keeping version with certificate`);
            } else {
              console.warn(`⚠️  [Indexer Persistence] Found duplicate garden ${garden.id} in savePersistence - keeping existing version`);
            }
          }
        }
        finalIndexers = Array.from(deduplicatedGardens.values());
        
        if (originalCount !== finalIndexers.length) {
          console.warn(`⚠️  [Indexer Persistence] Removed ${originalCount - finalIndexers.length} duplicate(s) from gardens array before saving`);
        }
        
        // CRITICAL: Use ServiceRegistry2 (new implementation) as the source of truth
        // ServiceRegistry2 is the primary storage, ROOT_CA_SERVICE_REGISTRY is kept for backward compatibility only
        let servicesToSave: ServiceProviderWithCert[] = [];
        try {
          const { getServiceRegistry2 } = require('./serviceRegistry2');
          const serviceRegistry2 = getServiceRegistry2();
          servicesToSave = serviceRegistry2.getAllProviders();
          console.log(`🔍 [savePersistence] ServiceRegistry2 has ${serviceRegistry2.getCount()} providers`);
          console.log(`🔍 [savePersistence] Providers:`, servicesToSave.map(p => `${p.id}(${p.serviceType},${p.gardenId})`).join(', '));
          console.log(`🔍 [savePersistence] Saving ${servicesToSave.length} providers from ServiceRegistry2 (NO FILTERING)`);
          
          // CRITICAL: Also sync to ROOT_CA_SERVICE_REGISTRY for backward compatibility
          // This ensures both systems stay in sync during transition
          for (const provider of servicesToSave) {
            const existing = ROOT_CA_SERVICE_REGISTRY.find(p => p.id === provider.id);
            if (!existing) {
              ROOT_CA_SERVICE_REGISTRY.push(provider);
              console.log(`🔍 [savePersistence] Synced provider ${provider.id} to ROOT_CA_SERVICE_REGISTRY`);
            }
          }
        } catch (err: any) {
          // Fallback to old ROOT_CA_SERVICE_REGISTRY if ServiceRegistry2 is not available
          if (err.message.includes('not initialized')) {
            console.warn(`⚠️  [savePersistence] ServiceRegistry2 not initialized, falling back to ROOT_CA_SERVICE_REGISTRY`);
            servicesToSave = Array.from(ROOT_CA_SERVICE_REGISTRY);
            console.log(`🔍 [savePersistence] ROOT_CA_SERVICE_REGISTRY has ${ROOT_CA_SERVICE_REGISTRY.length} providers`);
          } else {
            throw err;
          }
        }
        
        const serviceRegistry = servicesToSave.map(p => {
          const provider: any = {
            id: p.id,
            name: p.name,
            serviceType: p.serviceType,
            location: p.location,
            bond: p.bond,
            reputation: p.reputation,
            status: p.status,
            uuid: p.uuid,
            apiEndpoint: p.apiEndpoint,
              gardenId: p.gardenId // Use gardenId in persistence file
          };
          // Include Snake-specific fields if present
          if (p.insuranceFee !== undefined) provider.insuranceFee = p.insuranceFee;
          if (p.iGasMultiplier !== undefined) provider.iGasMultiplier = p.iGasMultiplier;
          if (p.iTaxMultiplier !== undefined) provider.iTaxMultiplier = p.iTaxMultiplier;
          if (p.maxInfluence !== undefined) provider.maxInfluence = p.maxInfluence;
          if (p.contextsAllowed !== undefined) provider.contextsAllowed = p.contextsAllowed;
          if (p.contextsForbidden !== undefined) provider.contextsForbidden = p.contextsForbidden;
          if (p.adCapabilities !== undefined) provider.adCapabilities = p.adCapabilities;
          return provider;
        });

        // REFACTOR: Save to separate files
        const timestamp = new Date().toISOString();
        
        // Save wallet balances to main file
        const walletData = {
          walletBalances,
          lastSaved: timestamp
        };
        fs.writeFileSync(this.persistenceFile, JSON.stringify(walletData, null, 2), 'utf-8');
        console.log(`💾 [Redis Persistence] Saved ${Object.keys(walletBalances).length} wallet entries to ${this.persistenceFile}`);
        
        // Save ledger entries to separate file
        // CRITICAL: Always save ledger entries, even if empty, to ensure file exists and is up-to-date
        // This ensures that when entries are added, they will be persisted correctly
        const ledgerData = {
          ledgerEntries: finalLedgerEntries,
          lastSaved: timestamp
        };
        fs.writeFileSync(this.ledgerEntriesFile, JSON.stringify(ledgerData, null, 2), 'utf-8');
        console.log(`💾 [Redis Persistence] Saved ${finalLedgerEntries.length} ledger entries to ${this.ledgerEntriesFile}`);
        if (finalLedgerEntries.length > 0) {
          console.log(`💾 [Redis Persistence] Entry types: ${finalLedgerEntries.map((e: any) => e.serviceType || 'unknown').join(', ')}`);
        }
        
        // Save gardens to separate file (only if we have gardens or the file exists)
        // CRITICAL: In ROOT mode, gardens are saved via immediate save, but we still save here for non-ROOT mode
        if (finalIndexers.length > 0 || fs.existsSync(this.gardensFile)) {
          const gardensData = {
            gardens: finalIndexers, // CRITICAL: All indexers (regular and token) are in 'gardens' array
            lastSaved: timestamp
          };
          fs.writeFileSync(this.gardensFile, JSON.stringify(gardensData, null, 2), 'utf-8');
        const tokenIndexerCount = finalIndexers.filter((idx: any) => 
          idx.tokenServiceType === 'dex' || (idx.serviceType === 'dex' && idx.id && idx.id.startsWith('T'))
        ).length;
        const regularIndexerCount = finalIndexers.length - tokenIndexerCount;
          console.log(`💾 [Redis Persistence] Saved ${finalIndexers.length} total gardens (${regularIndexerCount} regular + ${tokenIndexerCount} token) to ${this.gardensFile}`);
        }
        
        // Save service registry to separate file
        // CRITICAL: Always save service registry, even if empty, to ensure file exists
        // But log a warning if it's empty (shouldn't happen - infrastructure providers should always exist)
        if (serviceRegistry.length === 0) {
          console.warn(`⚠️  [ServiceRegistry Persistence] WARNING: Service registry is empty! ROOT_CA_SERVICE_REGISTRY has ${ROOT_CA_SERVICE_REGISTRY.length} providers, but none have valid gardenId.`);
          console.warn(`⚠️  [ServiceRegistry Persistence] Providers in ROOT_CA_SERVICE_REGISTRY: ${ROOT_CA_SERVICE_REGISTRY.map(p => `${p.id} (gardenId: ${p.gardenId || 'MISSING'})`).join(', ')}`);
        }
        const serviceRegistryData = {
          serviceRegistry: serviceRegistry,
          lastSaved: timestamp
        };
        fs.writeFileSync(this.serviceRegistryFile, JSON.stringify(serviceRegistryData, null, 2), 'utf-8');
        console.log(`💾 [Redis Persistence] Saved ${serviceRegistry.length} service providers to ${this.serviceRegistryFile}`);
      } catch (err: any) {
        console.error(`❌ [Redis Persistence] Failed to save persistence file: ${err.message}`);
      }
    }, this.SAVE_DELAY_MS);
  }
  
  // Public method to save ledger entries
  // CRITICAL: ROOT CA ledger entries must be persisted IMMEDIATELY (no debounce)
  // This is a ROOT CA operation - it must be saved synchronously to ensure data integrity
  saveLedgerEntries(ledgerEntries: any[]): void {
    if (!ledgerEntries || !Array.isArray(ledgerEntries)) {
      console.error(`❌ [Redis Persistence] Invalid ledgerEntries provided to saveLedgerEntries:`, typeof ledgerEntries);
      return;
    }
    console.log(`💾 [Redis Persistence] 🔐 ROOT CA: saveLedgerEntries called with ${ledgerEntries.length} entries (IMMEDIATE PERSISTENCE)`);
    if (ledgerEntries.length > 0) {
      const serviceTypes = ledgerEntries.map((e: any) => e.serviceType || 'unknown');
      const entryIds = ledgerEntries.map((e: any) => e.entryId || 'no-id').slice(0, 5);
      console.log(`💾 [Redis Persistence] Entry service types: ${serviceTypes.join(', ')}`);
      console.log(`💾 [Redis Persistence] Entry IDs (first 5): ${entryIds.join(', ')}`);
    } else {
      console.warn(`⚠️ [Redis Persistence] WARNING: saveLedgerEntries called with EMPTY array! This will overwrite existing entries!`);
    }
    
    // CRITICAL: For ROOT CA ledger entries, save IMMEDIATELY (no debounce)
    // Clear any pending debounced save for ledger entries
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    // Save immediately (synchronously) for ROOT CA ledger entries
    this.savePersistenceImmediate(ledgerEntries);
  }
  
  // Immediate persistence for ROOT CA ledger entries (no debounce)
  private savePersistenceImmediate(ledgerEntries?: any[]): void {
    try {
      // CRITICAL: Load existing wallet balances FIRST to preserve them
      let existingWalletBalances: Record<string, string> = {};
      
      if (fs.existsSync(this.persistenceFile)) {
        try {
          const fileContent = fs.readFileSync(this.persistenceFile, 'utf-8');
          const existing = JSON.parse(fileContent);
          if (existing.walletBalances && typeof existing.walletBalances === 'object') {
            existingWalletBalances = existing.walletBalances;
          }
        } catch (err: any) {
          console.warn(`⚠️  [Redis Persistence] Failed to load existing wallet balances: ${err.message}`);
        }
      }
      
      // Start with existing wallet balances from file (preserve them)
      const walletBalances: Record<string, string> = { ...existingWalletBalances };
      
      // Update wallet balances from in-memory
      for (const [key, value] of this.data.entries()) {
        if (key.startsWith('wallet:balance:')) {
          const balanceValue = typeof value === 'string' ? value : JSON.stringify(value);
          const balanceNum = parseFloat(balanceValue);
          if (!isNaN(balanceNum) && balanceNum > 0) {
            walletBalances[key] = balanceValue;
          }
        } else if (key.startsWith('wallet:audit:')) {
          walletBalances[key] = typeof value === 'string' ? value : JSON.stringify(value);
        }
      }

      // Load existing ledger entries from separate file
      let existingLedgerEntries: any[] = [];
      if (fs.existsSync(this.ledgerEntriesFile)) {
        try {
          const fileContent = fs.readFileSync(this.ledgerEntriesFile, 'utf-8');
          const existing = JSON.parse(fileContent);
          if (existing.ledgerEntries && Array.isArray(existing.ledgerEntries)) {
            existingLedgerEntries = existing.ledgerEntries;
          }
        } catch (err: any) {
          console.warn(`⚠️  [Redis Persistence] Failed to load ledger entries from separate file: ${err.message}`);
        }
      }
      
      // CRITICAL: Use provided ledger entries (ROOT CA is source of truth)
      // Merge with existing to avoid duplicates, but prefer new entries
      const finalLedgerEntries = ledgerEntries !== undefined ? ledgerEntries : existingLedgerEntries;
      
      // Deduplicate by entryId (prefer newer entries)
      const deduplicatedEntries = new Map<string, any>();
      for (const entry of finalLedgerEntries) {
        if (entry.entryId) {
          const existing = deduplicatedEntries.get(entry.entryId);
          if (!existing || (entry.timestamp && existing.timestamp && entry.timestamp > existing.timestamp)) {
            deduplicatedEntries.set(entry.entryId, entry);
          }
        }
      }
      const uniqueLedgerEntries = Array.from(deduplicatedEntries.values());
      
      // REFACTOR: Save to separate files
      const timestamp = new Date().toISOString();
      
      // Save wallet balances to main file
      const walletData = {
        walletBalances,
        lastSaved: timestamp
      };
      fs.writeFileSync(this.persistenceFile, JSON.stringify(walletData, null, 2), 'utf-8');
      console.log(`💾 [Redis Persistence] Saved ${Object.keys(walletBalances).length} wallet entries to ${this.persistenceFile}`);
      
      // CRITICAL: Save ledger entries IMMEDIATELY to separate file (ROOT CA operation)
      const ledgerData = {
        ledgerEntries: uniqueLedgerEntries,
        lastSaved: timestamp
      };
      fs.writeFileSync(this.ledgerEntriesFile, JSON.stringify(ledgerData, null, 2), 'utf-8');
      console.log(`💾 [Redis Persistence] 🔐 ROOT CA: IMMEDIATELY saved ${uniqueLedgerEntries.length} ledger entries to ${this.ledgerEntriesFile}`);
      if (uniqueLedgerEntries.length > 0) {
        console.log(`💾 [Redis Persistence] Entry types: ${uniqueLedgerEntries.map((e: any) => e.serviceType || 'unknown').join(', ')}`);
        console.log(`💾 [Redis Persistence] Entry statuses: ${uniqueLedgerEntries.map((e: any) => e.status || 'unknown').join(', ')}`);
      }
    } catch (err: any) {
      console.error(`❌ [Redis Persistence] CRITICAL: Failed to save ledger entries IMMEDIATELY: ${err.message}`);
      console.error(`❌ [Redis Persistence] Stack:`, err.stack);
    }
  }
  
  // Public method to save indexers
  // CRITICAL: In ROOT mode, indexers are saved via immediate save in /api/wizard/create-indexer
  // This method should NOT be used in ROOT mode - persistence file is the single source of truth
  saveIndexers(indexers: any[]): void {
    if (DEPLOYED_AS_ROOT) {
      console.log(`📋 [Indexer Persistence] ROOT mode: Skipping saveIndexers() - indexers are saved via immediate save in /api/wizard/create-indexer`);
      return;
    }
    this.savePersistence(undefined, indexers);
  }
  
  // Public method to save ServiceRegistry (for debugging)
  // CRITICAL: This should ONLY save ServiceRegistry, NOT indexers
  // Indexers are saved separately via the immediate save in /api/wizard/create-indexer
  // In ROOT mode, this can be called during initialization to populate the persistence file
  saveServiceRegistry(): void {
    // In ROOT mode, allow saving during initialization to populate empty persistence file
    // But skip if called during normal operation (indexers are saved separately)
    if (DEPLOYED_AS_ROOT) {
      // Allow saving during initialization - this helps populate empty persistence files
      // The check for whether to save is handled by the caller
    }
    
    // REFACTOR: Force immediate save of ServiceRegistry to separate file
    // CRITICAL: Preserve existing indexerId assignments from file - don't overwrite with hardcoded defaults
    try {
      // Load existing service registry from file to preserve indexerId assignments
      let existingProviders: Map<string, any> = new Map();
      if (fs.existsSync(this.serviceRegistryFile)) {
        try {
          const fileContent = fs.readFileSync(this.serviceRegistryFile, 'utf-8');
          const persisted = JSON.parse(fileContent);
          if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry)) {
            for (const provider of persisted.serviceRegistry) {
              // Use gardenId (standardized field name)
              const gardenId = provider.gardenId;
              if (gardenId) {
                // Store with gardenId
                existingProviders.set(provider.id, { ...provider, gardenId: gardenId });
              }
            }
            console.log(`📂 [ServiceRegistry Persistence] Loaded ${existingProviders.size} existing providers from file to preserve assignments`);
          }
        } catch (err: any) {
          console.warn(`⚠️  [ServiceRegistry Persistence] Failed to load existing file: ${err.message}`);
        }
      }
      
      // Console output: Show in-memory service registry
      console.log(`📋 [In-Memory Service Registry] BEFORE save - Total: ${ROOT_CA_SERVICE_REGISTRY.length}`);
      console.log(`📋 [In-Memory Service Registry] All providers:`, ROOT_CA_SERVICE_REGISTRY.map(p => ({
        id: p.id,
        name: p.name,
        serviceType: p.serviceType,
        gardenId: p.gardenId || 'MISSING'
      })));
      console.log(`📋 [In-Memory Service Registry] Movie providers:`, ROOT_CA_SERVICE_REGISTRY.filter(p => p.serviceType === 'movie').map(p => ({
        id: p.id,
        name: p.name,
        gardenId: p.gardenId || 'MISSING'
      })));
      
      // Update ServiceRegistry ONLY (do not touch gardens)
      // NO FILTERING - Save everything in memory as-is (in-memory is source of truth)
      const servicesToSave = ROOT_CA_SERVICE_REGISTRY; // Save ALL providers, no filtering
      
      // Console output: Show what's being saved
      console.log(`📋 [In-Memory Service Registry] Saving ALL ${servicesToSave.length} providers (NO FILTERING)`);
      console.log(`📋 [In-Memory Service Registry] Providers being saved:`, servicesToSave.map(p => ({
        id: p.id,
        name: p.name,
        serviceType: p.serviceType,
        gardenId: p.gardenId
      })));
      console.log(`📋 [In-Memory Service Registry] Movie providers being saved:`, servicesToSave.filter(p => p.serviceType === 'movie').map(p => ({
        id: p.id,
        name: p.name,
        gardenId: p.gardenId
      })));
      
      const serviceRegistry = servicesToSave.map(p => {
        // CRITICAL: For NEW providers (not in file), use in-memory value
        // For EXISTING providers (in file), preserve file value to maintain assignments
        const existingProvider = existingProviders.get(p.id);
        // If provider exists in file, preserve its gardenId (file is source of truth for existing assignments)
        // If provider is NEW (not in file), use in-memory value (this is how new providers get saved)
        const preservedGardenId = existingProvider ? (existingProvider.gardenId || p.gardenId) : p.gardenId;
        
        // Log if we're preserving a different value from file
        if (existingProvider && existingProvider.gardenId && existingProvider.gardenId !== p.gardenId) {
          console.log(`💾 [ServiceRegistry Persistence] Preserving ${p.name} (${p.id}) gardenId "${preservedGardenId}" from file (in-memory has "${p.gardenId}")`);
        } else if (!existingProvider) {
          console.log(`💾 [ServiceRegistry Persistence] Saving NEW provider ${p.name} (${p.id}) with gardenId "${preservedGardenId}"`);
        }
        
        const provider: any = {
          id: p.id,
          name: p.name,
          serviceType: p.serviceType,
          location: p.location,
          bond: p.bond,
          reputation: p.reputation,
          status: p.status,
          uuid: p.uuid,
          apiEndpoint: p.apiEndpoint,
          gardenId: preservedGardenId // Use gardenId in persistence file (indexerId is the in-memory field name)
        };
        
        // Preserve other fields from file if they exist
        if (existingProvider) {
          if (existingProvider.insuranceFee !== undefined) provider.insuranceFee = existingProvider.insuranceFee;
          if (existingProvider.iGasMultiplier !== undefined) provider.iGasMultiplier = existingProvider.iGasMultiplier;
          if (existingProvider.iTaxMultiplier !== undefined) provider.iTaxMultiplier = existingProvider.iTaxMultiplier;
          if (existingProvider.maxInfluence !== undefined) provider.maxInfluence = existingProvider.maxInfluence;
          if (existingProvider.contextsAllowed !== undefined) provider.contextsAllowed = existingProvider.contextsAllowed;
          if (existingProvider.contextsForbidden !== undefined) provider.contextsForbidden = existingProvider.contextsForbidden;
          if (existingProvider.adCapabilities !== undefined) provider.adCapabilities = existingProvider.adCapabilities;
        } else {
          // Only include these fields if provider is new (not in file)
        if (p.insuranceFee !== undefined) provider.insuranceFee = p.insuranceFee;
        if (p.iGasMultiplier !== undefined) provider.iGasMultiplier = p.iGasMultiplier;
        if (p.iTaxMultiplier !== undefined) provider.iTaxMultiplier = p.iTaxMultiplier;
        if (p.maxInfluence !== undefined) provider.maxInfluence = p.maxInfluence;
        if (p.contextsAllowed !== undefined) provider.contextsAllowed = p.contextsAllowed;
        if (p.contextsForbidden !== undefined) provider.contextsForbidden = p.contextsForbidden;
        if (p.adCapabilities !== undefined) provider.adCapabilities = p.adCapabilities;
        }
        
        return provider;
      });
      
      // REFACTOR: Save to separate file
      // CRITICAL: Always save service registry, even if empty, to ensure file exists
      // But log a warning if it's empty (shouldn't happen - infrastructure providers should always exist)
      if (serviceRegistry.length === 0) {
        console.warn(`⚠️  [ServiceRegistry Persistence] WARNING: Service registry is empty! ROOT_CA_SERVICE_REGISTRY has ${ROOT_CA_SERVICE_REGISTRY.length} providers.`);
        console.warn(`⚠️  [ServiceRegistry Persistence] Providers in ROOT_CA_SERVICE_REGISTRY: ${ROOT_CA_SERVICE_REGISTRY.map(p => `${p.id} (gardenId: ${p.gardenId || 'MISSING'})`).join(', ')}`);
        console.warn(`⚠️  [ServiceRegistry Persistence] Providers filtered out: ${ROOT_CA_SERVICE_REGISTRY.filter(p => !p.gardenId || p.gardenId === null || p.gardenId === undefined).map(p => `${p.id}`).join(', ')}`);
      }
      const serviceRegistryData = {
        serviceRegistry: serviceRegistry,
        lastSaved: new Date().toISOString()
      };
      
      fs.writeFileSync(this.serviceRegistryFile, JSON.stringify(serviceRegistryData, null, 2), 'utf-8');
      // Detailed console output
      const saveLogData = {
        totalInMemory: ROOT_CA_SERVICE_REGISTRY.length,
        totalSaved: serviceRegistry.length,
        movieProviders: servicesToSave.filter(p => p.serviceType === 'movie').length,
        dexProviders: servicesToSave.filter(p => p.serviceType === 'dex').length,
        movieProviderIds: servicesToSave.filter(p => p.serviceType === 'movie').map(p => `${p.id}(${p.gardenId})`),
        allProviderIds: servicesToSave.map(p => `${p.id}(${p.gardenId})`),
        preservedFromFile: existingProviders.size
      };
      console.log(`💾 [ServiceRegistry Persistence] Saved ${serviceRegistry.length} service providers to ${this.serviceRegistryFile} (preserved ${existingProviders.size} existing assignments)`);
      console.log(`📝 [Garden Lifecycle] 💾 Service registry save:`, JSON.stringify(saveLogData, null, 2));
    } catch (err: any) {
      console.error(`❌ [ServiceRegistry Persistence] Failed to save: ${err.message}`);
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    this.emit("connect");
    await new Promise(resolve => setTimeout(resolve, 10));
    this.isConnected = true;
    this.emit("ready");
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  get isOpen(): boolean {
    return this.isConnected;
  }

  // Simple key-value operations (for wallet balances)
  async get(key: string): Promise<string | null> {
    const value = this.data.get(key);
    if (value === undefined) {
      return null;
    }
    // If it's a string, return it directly
    if (typeof value === 'string') {
      return value;
    }
    // If it's an object (hash), return null (use hGet for hashes)
    return null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
    // Persist wallet-related keys immediately
    if (key.startsWith('wallet:balance:') || key.startsWith('wallet:audit:')) {
      this.savePersistence();
    }
  }

  async del(key: string): Promise<number> {
    const existed = this.data.has(key);
    if (existed) {
      this.data.delete(key);
      // Persist wallet-related keys immediately
      if (key.startsWith('wallet:balance:') || key.startsWith('wallet:audit:') || key.startsWith('wallet:hold:')) {
        this.savePersistence();
      }
      return 1;
    }
    return 0;
  }

  // Get all keys matching a pattern (for wallet reset)
  getKeysMatching(pattern: string): string[] {
    const keys: string[] = [];
    for (const key of this.data.keys()) {
      if (key.startsWith(pattern)) {
        keys.push(key);
      }
    }
    return keys;
  }

  async hSet(key: string, value: any): Promise<number> {
    if (typeof value === 'object' && value !== null) {
      // Convert object to hash
      const hash: Record<string, string> = {};
      for (const [k, v] of Object.entries(value)) {
        hash[k] = String(v);
      }
      this.data.set(key, hash);
      return Object.keys(hash).length;
    }
    return 0;
  }

  async hGet(key: string, field: string): Promise<string | null> {
    const hash = this.data.get(key);
    if (hash && typeof hash === 'object') {
      return hash[field] || null;
    }
    return null;
  }

  async xAdd(streamKey: string, id: string, fields: Record<string, string>): Promise<string> {
    if (!this.streams.has(streamKey)) {
      this.streams.set(streamKey, []);
      this.streamCounters.set(streamKey, 0);
    }

    const stream = this.streams.get(streamKey)!;
    let messageId: string;

    if (id === "*") {
      // Auto-generate ID: milliseconds-time-sequence
      const counter = this.streamCounters.get(streamKey)!;
      this.streamCounters.set(streamKey, counter + 1);
      const timestamp = Date.now();
      messageId = `${timestamp}-${counter}`;
    } else {
      messageId = id;
    }

    stream.push({ id: messageId, fields });
    return messageId;
  }

  async xRead(
    streams: Array<{ key: string; id: string }>,
    options?: { BLOCK?: number; COUNT?: number }
  ): Promise<Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> | null> {
    const results: Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> = [];

    for (const streamReq of streams) {
      const stream = this.streams.get(streamReq.key);
      if (!stream || stream.length === 0) {
        if (options?.BLOCK) {
          // Simulate blocking behavior
          const blockTime = options.BLOCK || 0;
          await new Promise(resolve => setTimeout(resolve, Math.min(blockTime, 1000)));
          return null;
        }
        continue;
      }

      const messages: Array<{ id: string; message: Record<string, string> }> = [];
      let startIndex = 0;

      // Find starting position based on ID
      if (streamReq.id === "$") {
        // "$" means read only new messages - start from the end (no messages)
        startIndex = stream.length;
      } else if (streamReq.id !== "0") {
        startIndex = stream.findIndex(msg => msg.id === streamReq.id);
        if (startIndex === -1) startIndex = 0;
        else startIndex += 1; // Start after the specified ID
      }

      const count = options?.COUNT || stream.length;
      const endIndex = Math.min(startIndex + count, stream.length);

      for (let i = startIndex; i < endIndex; i++) {
        messages.push({
          id: stream[i].id,
          message: { ...stream[i].fields }
        });
      }

      if (messages.length > 0) {
        results.push({
          name: streamReq.key,
          messages
        });
      }
    }

    return results.length > 0 ? results : null;
  }

  async xGroupCreate(
    streamKey: string,
    groupName: string,
    id: string,
    options?: { MKSTREAM?: boolean }
  ): Promise<void> {
    if (!this.streams.has(streamKey)) {
      if (options?.MKSTREAM) {
        this.streams.set(streamKey, []);
        this.streamCounters.set(streamKey, 0);
      } else {
        throw new Error("NOGROUP");
      }
    }
    
    if (!this.consumerGroups.has(streamKey)) {
      this.consumerGroups.set(streamKey, new Map());
    }
    
    const groups = this.consumerGroups.get(streamKey)!;
    if (groups.has(groupName)) {
      throw new Error("BUSYGROUP");
    }
    
    groups.set(groupName, id);
    this.pendingMessages.set(`${streamKey}:${groupName}`, new Map());
  }

  async xReadGroup(
    groupName: string,
    consumerName: string,
    streams: Array<{ key: string; id: string }>,
    options?: { COUNT?: number; BLOCK?: number }
  ): Promise<Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> | null> {
    const results: Array<{ name: string; messages: Array<{ id: string; message: Record<string, string> }> }> = [];
    
    for (const streamReq of streams) {
      const stream = this.streams.get(streamReq.key);
      if (!stream || stream.length === 0) {
        if (options?.BLOCK) {
          await new Promise(resolve => setTimeout(resolve, Math.min(options.BLOCK || 0, 1000)));
          return null;
        }
        continue;
      }
      
      // Get consumer group last ID
      const groups = this.consumerGroups.get(streamReq.key);
      if (!groups || !groups.has(groupName)) {
        throw new Error("NOGROUP");
      }
      
      const lastId = groups.get(groupName) || "0";
      const messages: Array<{ id: string; message: Record<string, string> }> = [];
      
      let startIndex = 0;
      if (streamReq.id === ">") {
        // Read new messages only
        const lastIdIndex = stream.findIndex(msg => msg.id === lastId);
        startIndex = lastIdIndex === -1 ? stream.length : lastIdIndex + 1;
      } else {
        startIndex = stream.findIndex(msg => msg.id === streamReq.id);
        if (startIndex === -1) startIndex = 0;
        else startIndex += 1;
      }
      
      const count = options?.COUNT || stream.length;
      const endIndex = Math.min(startIndex + count, stream.length);
      
      for (let i = startIndex; i < endIndex; i++) {
        messages.push({
          id: stream[i].id,
          message: { ...stream[i].fields }
        });
      }
      
      if (messages.length > 0) {
        results.push({
          name: streamReq.key,
          messages
        });
      }
    }
    
    return results.length > 0 ? results : null;
  }

  async xAck(streamKey: string, groupName: string, ...ids: string[]): Promise<number> {
    const groups = this.consumerGroups.get(streamKey);
    if (!groups || !groups.has(groupName)) {
      return 0;
    }
    
    // Update last processed ID
    if (ids.length > 0) {
      const lastId = ids[ids.length - 1];
      groups.set(groupName, lastId);
    }
    
    return ids.length;
  }

  async quit(): Promise<void> {
    // Save persistence before quitting
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    // Force immediate save on quit (ledger entries passed separately)
    try {
      const walletBalances: Record<string, string> = {};
      for (const [key, value] of this.data.entries()) {
        if (key.startsWith('wallet:balance:') || key.startsWith('wallet:audit:')) {
          walletBalances[key] = typeof value === 'string' ? value : JSON.stringify(value);
        }
      }
      // Note: Ledger entries will be saved separately via saveLedgerEntries()
      const persisted = {
        walletBalances,
        ledgerEntries: [], // Will be populated by saveLedgerEntries()
        lastSaved: new Date().toISOString()
      };
      fs.writeFileSync(this.persistenceFile, JSON.stringify(persisted, null, 2), 'utf-8');
      console.log(`💾 [Redis Persistence] Saved ${Object.keys(walletBalances).length} wallet entries on quit (ledger entries saved separately)`);
    } catch (err: any) {
      console.error(`❌ [Redis Persistence] Failed to save on quit: ${err.message}`);
    }
    this.isConnected = false;
    this.emit("end");
  }

  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

