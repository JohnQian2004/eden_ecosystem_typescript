"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var redis_exports = {};
__export(redis_exports, {
  InMemoryRedisServer: () => InMemoryRedisServer
});
module.exports = __toCommonJS(redis_exports);
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var crypto = __toESM(require("crypto"));
var import_events = require("events");
var import_config = require("./config");
var import_state = require("./state");
class InMemoryRedisServer extends import_events.EventEmitter {
  constructor() {
    super();
    this.data = /* @__PURE__ */ new Map();
    this.streams = /* @__PURE__ */ new Map();
    this.streamCounters = /* @__PURE__ */ new Map();
    this.consumerGroups = /* @__PURE__ */ new Map();
    // stream -> group -> lastId
    this.pendingMessages = /* @__PURE__ */ new Map();
    // stream -> group -> messages
    this.isConnected = false;
    // Separate file for service registry
    this.saveTimeout = null;
    this.SAVE_DELAY_MS = 1e3;
    // Debounce saves by 1 second
    this.serviceRegistrySaveTimer = null;
    this.serviceRegistrySavePending = false;
    this.persistenceFile = path.join(__dirname, "..", "eden-wallet-persistence.json");
    this.ledgerEntriesFile = path.join(__dirname, "..", "eden-ledgerEntries-persistence.json");
    this.gardensFile = path.join(__dirname, "..", "eden-gardens-persistence.json");
    this.serviceRegistryFile = path.join(__dirname, "..", "eden-serviceRegistry-persistence.json");
    this.loadPersistence();
  }
  // Load wallet data, ledger entries, and indexers from persistence files
  // REFACTOR: Now uses separate files for each data type, with backward compatibility
  // CRITICAL: This method should ONLY be called during server startup (constructor)
  // NEVER call this during runtime - it will overwrite in-memory state!
  loadPersistence() {
    if (this.persistenceLoaded) {
      console.error(`\u274C [Redis Persistence] CRITICAL ERROR: loadPersistence() called AFTER server startup! This should NEVER happen!`);
      console.error(`\u274C [Redis Persistence] Stack trace:`, new Error().stack);
      throw new Error("loadPersistence() can only be called during server startup (constructor), not during runtime!");
    }
    const result = { walletBalances: {}, ledgerEntries: [], indexers: [] };
    const hasOldFile = fs.existsSync(this.persistenceFile);
    const hasNewFiles = fs.existsSync(this.ledgerEntriesFile) || fs.existsSync(this.gardensFile) || fs.existsSync(this.serviceRegistryFile);
    if (hasOldFile && !hasNewFiles) {
      console.log(`\u{1F504} [Persistence Migration] Detected old combined file, migrating to separate files...`);
      this.migrateToSeparateFiles();
    }
    try {
      if (fs.existsSync(this.persistenceFile)) {
        const fileContent = fs.readFileSync(this.persistenceFile, "utf-8");
        const persisted = JSON.parse(fileContent);
        if (persisted.walletBalances && Object.keys(persisted.walletBalances).length > 0) {
          for (const [key, value] of Object.entries(persisted.walletBalances)) {
            this.data.set(key, value);
            if (key.startsWith("wallet:balance:")) {
              console.log(`\u{1F4C2} [Redis Persistence] Loaded wallet balance: ${key} = ${value}`);
            }
          }
          result.walletBalances = persisted.walletBalances;
          console.log(`\u{1F4C2} [Redis Persistence] Loaded ${Object.keys(persisted.walletBalances).length} wallet balances from ${this.persistenceFile}`);
        } else {
          console.log(`\u{1F4C2} [Redis Persistence] No wallet balances found in persistence file (starting with empty wallets)`);
        }
      }
      if (fs.existsSync(this.ledgerEntriesFile)) {
        try {
          const fileContent = fs.readFileSync(this.ledgerEntriesFile, "utf-8");
          const persisted = JSON.parse(fileContent);
          if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries) && persisted.ledgerEntries.length > 0) {
            result.ledgerEntries = persisted.ledgerEntries.map((entry) => ({
              ...entry,
              iGasCost: typeof entry.iGasCost === "string" ? parseFloat(entry.iGasCost) : entry.iGasCost || 0,
              amount: typeof entry.amount === "string" ? parseFloat(entry.amount) : entry.amount || 0,
              timestamp: typeof entry.timestamp === "string" ? parseInt(entry.timestamp) : entry.timestamp || Date.now(),
              fees: entry.fees ? Object.fromEntries(
                Object.entries(entry.fees).map(([key, value]) => [
                  key,
                  typeof value === "string" ? parseFloat(value) : value || 0
                ])
              ) : {}
            }));
            console.log(`\u{1F4C2} [Redis Persistence] Loaded ${persisted.ledgerEntries.length} ledger entries from ${this.ledgerEntriesFile} (normalized numeric fields)`);
          }
        } catch (err) {
          console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load ledger entries from separate file: ${err.message}`);
        }
      } else if (hasOldFile) {
        const fileContent = fs.readFileSync(this.persistenceFile, "utf-8");
        const persisted = JSON.parse(fileContent);
        if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries) && persisted.ledgerEntries.length > 0) {
          result.ledgerEntries = persisted.ledgerEntries.map((entry) => ({
            ...entry,
            iGasCost: typeof entry.iGasCost === "string" ? parseFloat(entry.iGasCost) : entry.iGasCost || 0,
            amount: typeof entry.amount === "string" ? parseFloat(entry.amount) : entry.amount || 0,
            timestamp: typeof entry.timestamp === "string" ? parseInt(entry.timestamp) : entry.timestamp || Date.now(),
            fees: entry.fees ? Object.fromEntries(
              Object.entries(entry.fees).map(([key, value]) => [
                key,
                typeof value === "string" ? parseFloat(value) : value || 0
              ])
            ) : {}
          }));
          console.log(`\u{1F4C2} [Redis Persistence] Loaded ${persisted.ledgerEntries.length} ledger entries from old combined file (will migrate on next save, normalized numeric fields)`);
        }
      }
      if (fs.existsSync(this.gardensFile)) {
        try {
          const fileContent = fs.readFileSync(this.gardensFile, "utf-8");
          const persisted = JSON.parse(fileContent);
          const gardensToLoad = persisted.gardens || persisted.indexers || [];
          if (gardensToLoad && Array.isArray(gardensToLoad) && gardensToLoad.length > 0) {
            const deduplicatedGardens = /* @__PURE__ */ new Map();
            for (const garden of gardensToLoad) {
              const existing = deduplicatedGardens.get(garden.id);
              if (!existing) {
                deduplicatedGardens.set(garden.id, garden);
              } else {
                const hasCert = !!garden.certificate;
                const existingHasCert = !!existing.certificate;
                if (hasCert && !existingHasCert) {
                  deduplicatedGardens.set(garden.id, garden);
                  console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found duplicate garden ${garden.id} when loading - keeping version with certificate`);
                } else {
                  console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found duplicate garden ${garden.id} when loading - keeping existing version`);
                }
              }
            }
            const cleanGardens = Array.from(deduplicatedGardens.values());
            result.indexers = cleanGardens;
            if (gardensToLoad.length !== cleanGardens.length) {
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Removed ${gardensToLoad.length - cleanGardens.length} duplicate(s) when loading gardens from persistence file`);
            }
            console.log(`\u{1F4C2} [Redis Persistence] Loaded ${cleanGardens.length} persisted gardens from ${this.gardensFile}`);
          }
        } catch (err) {
          console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load gardens from separate file: ${err.message}`);
        }
      } else if (hasOldFile) {
        const fileContent = fs.readFileSync(this.persistenceFile, "utf-8");
        const persisted = JSON.parse(fileContent);
        const gardensToLoad = persisted.gardens || persisted.indexers;
        if (gardensToLoad && Array.isArray(gardensToLoad) && gardensToLoad.length > 0) {
          const deduplicatedGardens = /* @__PURE__ */ new Map();
          for (const garden of gardensToLoad) {
            const existing = deduplicatedGardens.get(garden.id);
            if (!existing) {
              deduplicatedGardens.set(garden.id, garden);
            } else {
              const hasCert = !!garden.certificate;
              const existingHasCert = !!existing.certificate;
              if (hasCert && !existingHasCert) {
                deduplicatedGardens.set(garden.id, garden);
                console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found duplicate garden ${garden.id} when loading - keeping version with certificate`);
              } else {
                console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found duplicate garden ${garden.id} when loading - keeping existing version`);
              }
            }
          }
          const cleanGardens = Array.from(deduplicatedGardens.values());
          result.indexers = cleanGardens;
          if (gardensToLoad.length !== cleanGardens.length) {
            console.warn(`\u26A0\uFE0F  [Indexer Persistence] Removed ${gardensToLoad.length - cleanGardens.length} duplicate(s) when loading gardens from persistence file`);
          }
          console.log(`\u{1F4C2} [Redis Persistence] Loaded ${cleanGardens.length} persisted gardens from old combined file (will migrate on next save)`);
        }
      }
      if (fs.existsSync(this.serviceRegistryFile)) {
        try {
          const fileContent = fs.readFileSync(this.serviceRegistryFile, "utf-8");
          const persisted = JSON.parse(fileContent);
          if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry) && persisted.serviceRegistry.length > 0) {
            console.log(`\u{1F4C2} [Redis Persistence] Loading ${persisted.serviceRegistry.length} service providers from ${this.serviceRegistryFile}`);
            const loadedRegularGardens = result.indexers.filter(
              (g) => !(g.tokenServiceType === "dex" || g.serviceType === "dex" && g.id && g.id.startsWith("T"))
            );
            const loadedTokenGardens = result.indexers.filter(
              (g) => g.tokenServiceType === "dex" || g.serviceType === "dex" && g.id && g.id.startsWith("T")
            );
            let updatedCount = 0;
            for (const persistedProvider of persisted.serviceRegistry) {
              const persistedGardenId = persistedProvider.gardenId || persistedProvider.indexerId;
              const gardenExists = persistedGardenId === "HG" || loadedRegularGardens.some((g) => g.id === persistedGardenId) || loadedTokenGardens.some((g) => g.id === persistedGardenId) || import_state.GARDENS.some((g) => g.id === persistedGardenId) || import_state.TOKEN_GARDENS.some((tg) => tg.id === persistedGardenId);
              if (!gardenExists && persistedGardenId) {
                console.log(`\u26A0\uFE0F  [Service Registry] Skipping provider ${persistedProvider.id} (${persistedProvider.name}): gardenId "${persistedGardenId}" does not exist in loaded gardens or GARDENS/TOKEN_GARDENS`);
                console.log(`   \u{1F50D} Available gardens: ${[...import_state.GARDENS.map((g) => g.id), ...import_state.TOKEN_GARDENS.map((tg) => tg.id), "HG"].join(", ")}`);
                const existingProvider2 = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === persistedProvider.id);
                if (existingProvider2) {
                  console.log(`   \u26A0\uFE0F  [Service Registry] Provider ${persistedProvider.id} already in memory, keeping it (garden may be loading)`);
                  continue;
                }
                continue;
              }
              const existingProvider = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === persistedProvider.id);
              if (existingProvider) {
                let resolvedGardenId = persistedGardenId;
                if (resolvedGardenId === "HG" && existingProvider.serviceType === "movie") {
                  const correctGardenId = existingProvider.gardenId;
                  if (correctGardenId && correctGardenId !== "HG") {
                    console.log(`\u{1F527} [Service Registry] CORRECTING ${existingProvider.name} (${existingProvider.id}): file has incorrect gardenId="HG" for movie provider, using correct default="${correctGardenId}"`);
                    resolvedGardenId = correctGardenId;
                  }
                }
                console.log(`\u{1F50D} [Service Registry Load] Processing ${persistedProvider.id}: file has gardenId="${persistedProvider.gardenId}", resolved="${resolvedGardenId}", in-memory has gardenId="${existingProvider.gardenId}"`);
                if (resolvedGardenId) {
                  const oldValue = existingProvider.gardenId;
                  existingProvider.gardenId = resolvedGardenId;
                  if (oldValue !== resolvedGardenId) {
                    console.log(`\u{1F4C2} [Service Registry] \u2705 UPDATED ${existingProvider.name} (${existingProvider.id}): gardenId from "${oldValue}" to "${resolvedGardenId}" (from file)`);
                    updatedCount++;
                  } else {
                    console.log(`\u{1F4C2} [Service Registry] \u2713 ${existingProvider.name} (${existingProvider.id}) already has correct gardenId: "${resolvedGardenId}"`);
                  }
                } else {
                  console.log(`\u26A0\uFE0F  [Service Registry] ${persistedProvider.id} has no gardenId in file, skipping update`);
                }
              } else {
                console.log(`\u{1F4C2} [Service Registry] Adding persisted provider: ${persistedProvider.name} (${persistedProvider.id}) with gardenId=${persistedGardenId}`);
                const existingById = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === persistedProvider.id);
                const existingByUuid = persistedProvider.uuid ? import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.uuid === persistedProvider.uuid) : null;
                if (existingById || existingByUuid) {
                  console.log(`\u26A0\uFE0F  [Service Registry] Provider ${persistedProvider.id} already exists in ROOT_CA_SERVICE_REGISTRY, skipping duplicate`);
                } else {
                  const providerToAdd = {
                    id: persistedProvider.id,
                    uuid: persistedProvider.uuid || crypto.randomUUID(),
                    name: persistedProvider.name,
                    serviceType: persistedProvider.serviceType,
                    location: persistedProvider.location || "Unknown",
                    bond: persistedProvider.bond || 0,
                    reputation: persistedProvider.reputation || 0,
                    gardenId: persistedGardenId || "HG",
                    apiEndpoint: persistedProvider.apiEndpoint,
                    status: persistedProvider.status || "active",
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
                  import_state.ROOT_CA_SERVICE_REGISTRY.push(providerToAdd);
                  console.log(`\u2705 [Service Registry] Successfully added provider: ${providerToAdd.name} (${providerToAdd.id}) with serviceType=${providerToAdd.serviceType}, gardenId=${providerToAdd.gardenId}`);
                }
              }
            }
            if (updatedCount > 0) {
              console.log(`\u{1F4C2} [Service Registry] Updated ${updatedCount} provider gardenId assignment(s) from persistence file`);
              const correctedCount = import_state.ROOT_CA_SERVICE_REGISTRY.filter((p) => {
                const persistedProvider = persisted.serviceRegistry.find((pp) => pp.id === p.id);
                return persistedProvider && persistedProvider.gardenId === "HG" && p.serviceType === "movie" && p.gardenId !== "HG";
              }).length;
              if (correctedCount > 0) {
                console.log(`\u{1F527} [Service Registry] Corrected ${correctedCount} movie provider(s) from "HG" to correct gardenId - saving corrected values to file`);
                this.saveServiceRegistry();
              }
            }
            const movieProvidersAfterLoad = import_state.ROOT_CA_SERVICE_REGISTRY.filter((p) => p.serviceType === "movie");
            if (movieProvidersAfterLoad.length > 0) {
              console.log(`\u{1F4C2} [Service Registry] After load - Movie providers: ${movieProvidersAfterLoad.map((p) => `${p.name} (${p.id}) \u2192 gardenId: ${p.gardenId}`).join(", ")}`);
            }
            const dexProvidersAfterLoad = import_state.ROOT_CA_SERVICE_REGISTRY.filter((p) => p.serviceType === "dex");
            if (dexProvidersAfterLoad.length > 0) {
              console.log(`\u{1F4C2} [Service Registry] After load - DEX providers: ${dexProvidersAfterLoad.map((p) => `${p.name} (${p.id}) \u2192 gardenId: ${p.gardenId}`).join(", ")}`);
            } else {
              console.log(`\u26A0\uFE0F  [Service Registry] After load - No DEX providers found in ROOT_CA_SERVICE_REGISTRY (total providers: ${import_state.ROOT_CA_SERVICE_REGISTRY.length})`);
            }
            console.log(`\u2705 [Service Registry] Merged service registry: ${import_state.ROOT_CA_SERVICE_REGISTRY.length} total providers`);
          }
        } catch (err) {
          console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load service registry from separate file: ${err.message}`);
        }
      } else if (hasOldFile) {
        try {
          const fileContent = fs.readFileSync(this.persistenceFile, "utf-8");
          const persisted = JSON.parse(fileContent);
          if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry) && persisted.serviceRegistry.length > 0) {
            console.log(`\u{1F4C2} [Redis Persistence] Loading ${persisted.serviceRegistry.length} service providers from old combined file (will migrate on next save)`);
            for (const persistedProvider of persisted.serviceRegistry) {
              const persistedGardenId = persistedProvider.gardenId || persistedProvider.indexerId;
              const gardenExists = persistedGardenId === "HG" || import_state.GARDENS.some((g) => g.id === persistedGardenId) || import_state.TOKEN_GARDENS.some((tg) => tg.id === persistedGardenId);
              if (!gardenExists && persistedGardenId) {
                console.log(`\u26A0\uFE0F  [Service Registry] Skipping provider ${persistedProvider.id} (${persistedProvider.name}): gardenId "${persistedGardenId}" does not exist (from old file)`);
                continue;
              }
              const existingProvider = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === persistedProvider.id);
              if (existingProvider) {
                if (persistedGardenId) {
                  const oldValue = existingProvider.gardenId;
                  existingProvider.gardenId = persistedGardenId;
                  if (oldValue !== persistedGardenId) {
                    console.log(`\u{1F4C2} [Service Registry] Updating ${existingProvider.name} (${existingProvider.id}): gardenId from "${oldValue}" to "${persistedGardenId}" (from old file)`);
                  }
                }
              } else {
                console.log(`\u{1F4C2} [Service Registry] Adding persisted provider: ${persistedProvider.name} (${persistedProvider.id}) with gardenId=${persistedGardenId}`);
                import_state.ROOT_CA_SERVICE_REGISTRY.push(persistedProvider);
              }
            }
            console.log(`\u2705 [Service Registry] Merged service registry from old file: ${import_state.ROOT_CA_SERVICE_REGISTRY.length} total providers`);
          }
        } catch (err) {
          console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load service registry from old file: ${err.message}`);
        }
      }
      if (!hasOldFile && !hasNewFiles) {
        console.log(`\u{1F4C2} [Redis Persistence] No persistence files found, starting fresh`);
      }
    } catch (err) {
      console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load persistence file: ${err.message}`);
    }
    return result;
  }
  // Migrate from old combined file to separate files
  migrateToSeparateFiles() {
    try {
      if (!fs.existsSync(this.persistenceFile)) {
        return;
      }
      console.log(`\u{1F504} [Persistence Migration] Reading old combined file: ${this.persistenceFile}`);
      const fileContent = fs.readFileSync(this.persistenceFile, "utf-8");
      const persisted = JSON.parse(fileContent);
      if (persisted.ledgerEntries && Array.isArray(persisted.ledgerEntries) && persisted.ledgerEntries.length > 0) {
        const ledgerData = {
          ledgerEntries: persisted.ledgerEntries,
          lastSaved: persisted.lastSaved || (/* @__PURE__ */ new Date()).toISOString()
        };
        fs.writeFileSync(this.ledgerEntriesFile, JSON.stringify(ledgerData, null, 2), "utf-8");
        console.log(`\u2705 [Persistence Migration] Migrated ${persisted.ledgerEntries.length} ledger entries to ${this.ledgerEntriesFile}`);
      }
      const gardensToMigrate = persisted.gardens || persisted.indexers;
      if (gardensToMigrate && Array.isArray(gardensToMigrate) && gardensToMigrate.length > 0) {
        const gardensData = {
          gardens: gardensToMigrate,
          lastSaved: persisted.lastSaved || (/* @__PURE__ */ new Date()).toISOString()
        };
        fs.writeFileSync(this.gardensFile, JSON.stringify(gardensData, null, 2), "utf-8");
        console.log(`\u2705 [Persistence Migration] Migrated ${gardensToMigrate.length} gardens to ${this.gardensFile}`);
      }
      if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry) && persisted.serviceRegistry.length > 0) {
        const serviceRegistryData = {
          serviceRegistry: persisted.serviceRegistry,
          lastSaved: persisted.lastSaved || (/* @__PURE__ */ new Date()).toISOString()
        };
        fs.writeFileSync(this.serviceRegistryFile, JSON.stringify(serviceRegistryData, null, 2), "utf-8");
        console.log(`\u2705 [Persistence Migration] Migrated ${persisted.serviceRegistry.length} service providers to ${this.serviceRegistryFile}`);
      }
      console.log(`\u2705 [Persistence Migration] Migration complete. Wallet balances remain in ${this.persistenceFile}`);
    } catch (err) {
      console.error(`\u274C [Persistence Migration] Failed to migrate: ${err.message}`);
    }
  }
  // Save wallet data, ledger entries, and indexers to persistence file (debounced)
  // CRITICAL: In ROOT mode, indexers should NOT be saved here - they're saved via immediate save in /api/wizard/create-indexer
  savePersistence(ledgerEntries, indexers) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      try {
        let existingWalletBalances = {};
        if (fs.existsSync(this.persistenceFile)) {
          try {
            const fileContent = fs.readFileSync(this.persistenceFile, "utf-8");
            const existing = JSON.parse(fileContent);
            if (existing.walletBalances && typeof existing.walletBalances === "object") {
              existingWalletBalances = existing.walletBalances;
            }
          } catch (err) {
            console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load existing wallet balances: ${err.message}`);
          }
        }
        const walletBalances = { ...existingWalletBalances };
        for (const [key, value] of this.data.entries()) {
          if (key.startsWith("wallet:balance:")) {
            const balanceValue = typeof value === "string" ? value : JSON.stringify(value);
            const balanceNum = parseFloat(balanceValue);
            if (!isNaN(balanceNum) && balanceNum >= 0) {
              walletBalances[key] = balanceValue;
            }
          } else if (key.startsWith("wallet:audit:")) {
            walletBalances[key] = typeof value === "string" ? value : JSON.stringify(value);
          }
        }
        let existingLedgerEntries = [];
        if (fs.existsSync(this.ledgerEntriesFile)) {
          try {
            const fileContent = fs.readFileSync(this.ledgerEntriesFile, "utf-8");
            const existing = JSON.parse(fileContent);
            if (existing.ledgerEntries && Array.isArray(existing.ledgerEntries)) {
              existingLedgerEntries = existing.ledgerEntries;
            }
          } catch (err) {
            console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load ledger entries from separate file: ${err.message}`);
          }
        } else if (fs.existsSync(this.persistenceFile)) {
          try {
            const fileContent = fs.readFileSync(this.persistenceFile, "utf-8");
            const existing = JSON.parse(fileContent);
            if (existing.ledgerEntries && Array.isArray(existing.ledgerEntries)) {
              existingLedgerEntries = existing.ledgerEntries;
            }
          } catch (err) {
            console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load ledger entries from old file: ${err.message}`);
          }
        }
        let existingIndexers = [];
        if (fs.existsSync(this.gardensFile)) {
          try {
            const fileContent = fs.readFileSync(this.gardensFile, "utf-8");
            const existing = JSON.parse(fileContent);
            const gardensFromFile = existing.gardens || existing.indexers;
            if (gardensFromFile && Array.isArray(gardensFromFile)) {
              existingIndexers = gardensFromFile;
            }
          } catch (err) {
            console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load gardens from separate file: ${err.message}`);
          }
        } else if (fs.existsSync(this.persistenceFile)) {
          try {
            const fileContent = fs.readFileSync(this.persistenceFile, "utf-8");
            const existing = JSON.parse(fileContent);
            const gardensFromFile = existing.gardens || existing.indexers;
            if (gardensFromFile && Array.isArray(gardensFromFile)) {
              existingIndexers = gardensFromFile;
            }
            if (!import_config.DEPLOYED_AS_ROOT && existing.tokenIndexers && Array.isArray(existing.tokenIndexers)) {
              console.log(`\u{1F4CB} [Redis Persistence] Found tokenIndexers field - migrating to gardens array`);
              const existingTokenIds = new Set(existingIndexers.map((idx) => idx.id));
              for (const tokenIdx of existing.tokenIndexers) {
                if (!existingTokenIds.has(tokenIdx.id)) {
                  existingIndexers.push(tokenIdx);
                }
              }
            }
          } catch (err) {
            console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load gardens from old file: ${err.message}`);
          }
        }
        const finalLedgerEntries = ledgerEntries !== void 0 ? ledgerEntries : existingLedgerEntries;
        let finalIndexers;
        if (import_config.DEPLOYED_AS_ROOT) {
          const allInMemoryIndexers = [...import_state.GARDENS, ...import_state.TOKEN_GARDENS];
          finalIndexers = allInMemoryIndexers;
        } else {
          finalIndexers = indexers !== void 0 ? indexers : existingIndexers;
        }
        const originalCount = finalIndexers.length;
        const deduplicatedGardens = /* @__PURE__ */ new Map();
        for (const garden of finalIndexers) {
          const existing = deduplicatedGardens.get(garden.id);
          if (!existing) {
            deduplicatedGardens.set(garden.id, garden);
          } else {
            const hasCert = !!garden.certificate;
            const existingHasCert = !!existing.certificate;
            if (hasCert && !existingHasCert) {
              deduplicatedGardens.set(garden.id, garden);
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found duplicate garden ${garden.id} in savePersistence - keeping version with certificate`);
            } else {
              console.warn(`\u26A0\uFE0F  [Indexer Persistence] Found duplicate garden ${garden.id} in savePersistence - keeping existing version`);
            }
          }
        }
        finalIndexers = Array.from(deduplicatedGardens.values());
        if (originalCount !== finalIndexers.length) {
          console.warn(`\u26A0\uFE0F  [Indexer Persistence] Removed ${originalCount - finalIndexers.length} duplicate(s) from gardens array before saving`);
        }
        let servicesToSave = [];
        try {
          const { getServiceRegistry2 } = require("./serviceRegistry2");
          const serviceRegistry2 = getServiceRegistry2();
          servicesToSave = serviceRegistry2.getAllProviders();
          console.log(`\u{1F50D} [savePersistence] ServiceRegistry2 has ${serviceRegistry2.getCount()} providers`);
          console.log(`\u{1F50D} [savePersistence] Providers:`, servicesToSave.map((p) => `${p.id}(${p.serviceType},${p.gardenId})`).join(", "));
          console.log(`\u{1F50D} [savePersistence] Saving ${servicesToSave.length} providers from ServiceRegistry2 (NO FILTERING)`);
          for (const provider of servicesToSave) {
            const existing = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === provider.id);
            if (!existing) {
              import_state.ROOT_CA_SERVICE_REGISTRY.push(provider);
              console.log(`\u{1F50D} [savePersistence] Synced provider ${provider.id} to ROOT_CA_SERVICE_REGISTRY`);
            }
          }
        } catch (err) {
          if (err.message.includes("not initialized")) {
            console.warn(`\u26A0\uFE0F  [savePersistence] ServiceRegistry2 not initialized, falling back to ROOT_CA_SERVICE_REGISTRY`);
            servicesToSave = Array.from(import_state.ROOT_CA_SERVICE_REGISTRY);
            console.log(`\u{1F50D} [savePersistence] ROOT_CA_SERVICE_REGISTRY has ${import_state.ROOT_CA_SERVICE_REGISTRY.length} providers`);
          } else {
            throw err;
          }
        }
        const serviceRegistry = servicesToSave.map((p) => {
          const provider = {
            id: p.id,
            name: p.name,
            serviceType: p.serviceType,
            location: p.location,
            bond: p.bond,
            reputation: p.reputation,
            status: p.status,
            uuid: p.uuid,
            apiEndpoint: p.apiEndpoint,
            gardenId: p.gardenId
            // Use gardenId in persistence file
          };
          if (p.insuranceFee !== void 0)
            provider.insuranceFee = p.insuranceFee;
          if (p.iGasMultiplier !== void 0)
            provider.iGasMultiplier = p.iGasMultiplier;
          if (p.iTaxMultiplier !== void 0)
            provider.iTaxMultiplier = p.iTaxMultiplier;
          if (p.maxInfluence !== void 0)
            provider.maxInfluence = p.maxInfluence;
          if (p.contextsAllowed !== void 0)
            provider.contextsAllowed = p.contextsAllowed;
          if (p.contextsForbidden !== void 0)
            provider.contextsForbidden = p.contextsForbidden;
          if (p.adCapabilities !== void 0)
            provider.adCapabilities = p.adCapabilities;
          return provider;
        });
        const timestamp = (/* @__PURE__ */ new Date()).toISOString();
        const walletData = {
          walletBalances,
          lastSaved: timestamp
        };
        fs.writeFileSync(this.persistenceFile, JSON.stringify(walletData, null, 2), "utf-8");
        console.log(`\u{1F4BE} [Redis Persistence] Saved ${Object.keys(walletBalances).length} wallet entries to ${this.persistenceFile}`);
        const ledgerData = {
          ledgerEntries: finalLedgerEntries,
          lastSaved: timestamp
        };
        fs.writeFileSync(this.ledgerEntriesFile, JSON.stringify(ledgerData, null, 2), "utf-8");
        console.log(`\u{1F4BE} [Redis Persistence] Saved ${finalLedgerEntries.length} ledger entries to ${this.ledgerEntriesFile}`);
        if (finalLedgerEntries.length > 0) {
          console.log(`\u{1F4BE} [Redis Persistence] Entry types: ${finalLedgerEntries.map((e) => e.serviceType || "unknown").join(", ")}`);
        }
        if (finalIndexers.length > 0 || fs.existsSync(this.gardensFile)) {
          const gardensData = {
            gardens: finalIndexers,
            // CRITICAL: All indexers (regular and token) are in 'gardens' array
            lastSaved: timestamp
          };
          fs.writeFileSync(this.gardensFile, JSON.stringify(gardensData, null, 2), "utf-8");
          const tokenIndexerCount = finalIndexers.filter(
            (idx) => idx.tokenServiceType === "dex" || idx.serviceType === "dex" && idx.id && idx.id.startsWith("T")
          ).length;
          const regularIndexerCount = finalIndexers.length - tokenIndexerCount;
          console.log(`\u{1F4BE} [Redis Persistence] Saved ${finalIndexers.length} total gardens (${regularIndexerCount} regular + ${tokenIndexerCount} token) to ${this.gardensFile}`);
        }
        if (serviceRegistry.length === 0) {
          console.warn(`\u26A0\uFE0F  [ServiceRegistry Persistence] WARNING: Service registry is empty! ROOT_CA_SERVICE_REGISTRY has ${import_state.ROOT_CA_SERVICE_REGISTRY.length} providers, but none have valid gardenId.`);
          console.warn(`\u26A0\uFE0F  [ServiceRegistry Persistence] Providers in ROOT_CA_SERVICE_REGISTRY: ${import_state.ROOT_CA_SERVICE_REGISTRY.map((p) => `${p.id} (gardenId: ${p.gardenId || "MISSING"})`).join(", ")}`);
        }
        const serviceRegistryData = {
          serviceRegistry,
          lastSaved: timestamp
        };
        fs.writeFileSync(this.serviceRegistryFile, JSON.stringify(serviceRegistryData, null, 2), "utf-8");
        console.log(`\u{1F4BE} [Redis Persistence] Saved ${serviceRegistry.length} service providers to ${this.serviceRegistryFile}`);
      } catch (err) {
        console.error(`\u274C [Redis Persistence] Failed to save persistence file: ${err.message}`);
      }
    }, this.SAVE_DELAY_MS);
  }
  // Public method to save ledger entries
  // CRITICAL: ROOT CA ledger entries must be persisted IMMEDIATELY (no debounce)
  // This is a ROOT CA operation - it must be saved synchronously to ensure data integrity
  saveLedgerEntries(ledgerEntries) {
    if (!ledgerEntries || !Array.isArray(ledgerEntries)) {
      console.error(`\u274C [Redis Persistence] Invalid ledgerEntries provided to saveLedgerEntries:`, typeof ledgerEntries);
      return;
    }
    console.log(`\u{1F4BE} [Redis Persistence] \u{1F510} ROOT CA: saveLedgerEntries called with ${ledgerEntries.length} entries (IMMEDIATE PERSISTENCE)`);
    if (ledgerEntries.length > 0) {
      const serviceTypes = ledgerEntries.map((e) => e.serviceType || "unknown");
      const entryIds = ledgerEntries.map((e) => e.entryId || "no-id").slice(0, 5);
      console.log(`\u{1F4BE} [Redis Persistence] Entry service types: ${serviceTypes.join(", ")}`);
      console.log(`\u{1F4BE} [Redis Persistence] Entry IDs (first 5): ${entryIds.join(", ")}`);
    } else {
      console.warn(`\u26A0\uFE0F [Redis Persistence] WARNING: saveLedgerEntries called with EMPTY array! This will overwrite existing entries!`);
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.savePersistenceImmediate(ledgerEntries);
  }
  // Immediate persistence for ROOT CA ledger entries (no debounce)
  savePersistenceImmediate(ledgerEntries) {
    try {
      let existingWalletBalances = {};
      if (fs.existsSync(this.persistenceFile)) {
        try {
          const fileContent = fs.readFileSync(this.persistenceFile, "utf-8");
          const existing = JSON.parse(fileContent);
          if (existing.walletBalances && typeof existing.walletBalances === "object") {
            existingWalletBalances = existing.walletBalances;
          }
        } catch (err) {
          console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load existing wallet balances: ${err.message}`);
        }
      }
      const walletBalances = { ...existingWalletBalances };
      for (const [key, value] of this.data.entries()) {
        if (key.startsWith("wallet:balance:")) {
          const balanceValue = typeof value === "string" ? value : JSON.stringify(value);
          const balanceNum = parseFloat(balanceValue);
          if (!isNaN(balanceNum) && balanceNum > 0) {
            walletBalances[key] = balanceValue;
          }
        } else if (key.startsWith("wallet:audit:")) {
          walletBalances[key] = typeof value === "string" ? value : JSON.stringify(value);
        }
      }
      let existingLedgerEntries = [];
      if (fs.existsSync(this.ledgerEntriesFile)) {
        try {
          const fileContent = fs.readFileSync(this.ledgerEntriesFile, "utf-8");
          const existing = JSON.parse(fileContent);
          if (existing.ledgerEntries && Array.isArray(existing.ledgerEntries)) {
            existingLedgerEntries = existing.ledgerEntries;
          }
        } catch (err) {
          console.warn(`\u26A0\uFE0F  [Redis Persistence] Failed to load ledger entries from separate file: ${err.message}`);
        }
      }
      const finalLedgerEntries = ledgerEntries !== void 0 ? ledgerEntries : existingLedgerEntries;
      const deduplicatedEntries = /* @__PURE__ */ new Map();
      for (const entry of finalLedgerEntries) {
        if (entry.entryId) {
          const existing = deduplicatedEntries.get(entry.entryId);
          if (!existing || entry.timestamp && existing.timestamp && entry.timestamp > existing.timestamp) {
            deduplicatedEntries.set(entry.entryId, entry);
          }
        }
      }
      const uniqueLedgerEntries = Array.from(deduplicatedEntries.values());
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const walletData = {
        walletBalances,
        lastSaved: timestamp
      };
      fs.writeFileSync(this.persistenceFile, JSON.stringify(walletData, null, 2), "utf-8");
      console.log(`\u{1F4BE} [Redis Persistence] Saved ${Object.keys(walletBalances).length} wallet entries to ${this.persistenceFile}`);
      const ledgerData = {
        ledgerEntries: uniqueLedgerEntries,
        lastSaved: timestamp
      };
      fs.writeFileSync(this.ledgerEntriesFile, JSON.stringify(ledgerData, null, 2), "utf-8");
      console.log(`\u{1F4BE} [Redis Persistence] \u{1F510} ROOT CA: IMMEDIATELY saved ${uniqueLedgerEntries.length} ledger entries to ${this.ledgerEntriesFile}`);
      if (uniqueLedgerEntries.length > 0) {
        console.log(`\u{1F4BE} [Redis Persistence] Entry types: ${uniqueLedgerEntries.map((e) => e.serviceType || "unknown").join(", ")}`);
        console.log(`\u{1F4BE} [Redis Persistence] Entry statuses: ${uniqueLedgerEntries.map((e) => e.status || "unknown").join(", ")}`);
      }
    } catch (err) {
      console.error(`\u274C [Redis Persistence] CRITICAL: Failed to save ledger entries IMMEDIATELY: ${err.message}`);
      console.error(`\u274C [Redis Persistence] Stack:`, err.stack);
    }
  }
  // Public method to save indexers
  // CRITICAL: In ROOT mode, indexers are saved via immediate save in /api/wizard/create-indexer
  // This method should NOT be used in ROOT mode - persistence file is the single source of truth
  saveIndexers(indexers) {
    if (import_config.DEPLOYED_AS_ROOT) {
      console.log(`\u{1F4CB} [Indexer Persistence] ROOT mode: Skipping saveIndexers() - indexers are saved via immediate save in /api/wizard/create-indexer`);
      return;
    }
    this.savePersistence(void 0, indexers);
  }
  // Public method to save ServiceRegistry (for debugging)
  // CRITICAL: This should ONLY save ServiceRegistry, NOT indexers
  // Indexers are saved separately via the immediate save in /api/wizard/create-indexer
  // In ROOT mode, this can be called during initialization to populate the persistence file
  saveServiceRegistry() {
    if (import_config.DEPLOYED_AS_ROOT) {
    }
    this.serviceRegistrySavePending = true;
    if (this.serviceRegistrySaveTimer)
      return;
    const verbose = String(process.env.EDEN_DEBUG_SERVICE_REGISTRY_PERSIST_VERBOSE || "").toLowerCase() === "true";
    this.serviceRegistrySaveTimer = setTimeout(() => {
      this.serviceRegistrySaveTimer = null;
      if (!this.serviceRegistrySavePending)
        return;
      this.serviceRegistrySavePending = false;
      void (async () => {
        try {
          let existingProviders = /* @__PURE__ */ new Map();
          if (fs.existsSync(this.serviceRegistryFile)) {
            try {
              const fileContent = await fs.promises.readFile(this.serviceRegistryFile, "utf-8");
              const persisted = JSON.parse(fileContent);
              if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry)) {
                for (const provider of persisted.serviceRegistry) {
                  const gardenId = provider.gardenId;
                  if (gardenId) {
                    existingProviders.set(provider.id, { ...provider, gardenId });
                  }
                }
                if (verbose) {
                  console.log(
                    `\u{1F4C2} [ServiceRegistry Persistence] Loaded ${existingProviders.size} existing providers from file to preserve assignments`
                  );
                }
              }
            } catch (err) {
              console.warn(`\u26A0\uFE0F  [ServiceRegistry Persistence] Failed to load existing file: ${err.message}`);
            }
          }
          if (verbose) {
            console.log(`\u{1F4CB} [In-Memory Service Registry] BEFORE save - Total: ${import_state.ROOT_CA_SERVICE_REGISTRY.length}`);
            console.log(`\u{1F4CB} [In-Memory Service Registry] All providers:`, import_state.ROOT_CA_SERVICE_REGISTRY.map((p) => ({
              id: p.id,
              name: p.name,
              serviceType: p.serviceType,
              gardenId: p.gardenId || "MISSING"
            })));
          }
          const servicesToSave = import_state.ROOT_CA_SERVICE_REGISTRY;
          if (verbose) {
            console.log(`\u{1F4CB} [In-Memory Service Registry] Saving ALL ${servicesToSave.length} providers (NO FILTERING)`);
          }
          const serviceRegistry = servicesToSave.map((p) => {
            const existingProvider = existingProviders.get(p.id);
            const preservedGardenId = existingProvider ? existingProvider.gardenId || p.gardenId : p.gardenId;
            if (verbose) {
              if (existingProvider && existingProvider.gardenId && existingProvider.gardenId !== p.gardenId) {
                console.log(`\u{1F4BE} [ServiceRegistry Persistence] Preserving ${p.name} (${p.id}) gardenId "${preservedGardenId}" from file (in-memory has "${p.gardenId}")`);
              } else if (!existingProvider) {
                console.log(`\u{1F4BE} [ServiceRegistry Persistence] Saving NEW provider ${p.name} (${p.id}) with gardenId "${preservedGardenId}"`);
              }
            }
            const provider = {
              id: p.id,
              name: p.name,
              serviceType: p.serviceType,
              location: p.location,
              bond: p.bond,
              reputation: p.reputation,
              status: p.status,
              uuid: p.uuid,
              apiEndpoint: p.apiEndpoint,
              gardenId: preservedGardenId
              // Use gardenId in persistence file (indexerId is the in-memory field name)
            };
            if (existingProvider) {
              if (existingProvider.insuranceFee !== void 0)
                provider.insuranceFee = existingProvider.insuranceFee;
              if (existingProvider.iGasMultiplier !== void 0)
                provider.iGasMultiplier = existingProvider.iGasMultiplier;
              if (existingProvider.iTaxMultiplier !== void 0)
                provider.iTaxMultiplier = existingProvider.iTaxMultiplier;
              if (existingProvider.maxInfluence !== void 0)
                provider.maxInfluence = existingProvider.maxInfluence;
              if (existingProvider.contextsAllowed !== void 0)
                provider.contextsAllowed = existingProvider.contextsAllowed;
              if (existingProvider.contextsForbidden !== void 0)
                provider.contextsForbidden = existingProvider.contextsForbidden;
              if (existingProvider.adCapabilities !== void 0)
                provider.adCapabilities = existingProvider.adCapabilities;
            } else {
              if (p.insuranceFee !== void 0)
                provider.insuranceFee = p.insuranceFee;
              if (p.iGasMultiplier !== void 0)
                provider.iGasMultiplier = p.iGasMultiplier;
              if (p.iTaxMultiplier !== void 0)
                provider.iTaxMultiplier = p.iTaxMultiplier;
              if (p.maxInfluence !== void 0)
                provider.maxInfluence = p.maxInfluence;
              if (p.contextsAllowed !== void 0)
                provider.contextsAllowed = p.contextsAllowed;
              if (p.contextsForbidden !== void 0)
                provider.contextsForbidden = p.contextsForbidden;
              if (p.adCapabilities !== void 0)
                provider.adCapabilities = p.adCapabilities;
            }
            return provider;
          });
          if (serviceRegistry.length === 0) {
            console.warn(`\u26A0\uFE0F  [ServiceRegistry Persistence] WARNING: Service registry is empty! ROOT_CA_SERVICE_REGISTRY has ${import_state.ROOT_CA_SERVICE_REGISTRY.length} providers.`);
            console.warn(`\u26A0\uFE0F  [ServiceRegistry Persistence] Providers in ROOT_CA_SERVICE_REGISTRY: ${import_state.ROOT_CA_SERVICE_REGISTRY.map((p) => `${p.id} (gardenId: ${p.gardenId || "MISSING"})`).join(", ")}`);
            console.warn(`\u26A0\uFE0F  [ServiceRegistry Persistence] Providers filtered out: ${import_state.ROOT_CA_SERVICE_REGISTRY.filter((p) => !p.gardenId || p.gardenId === null || p.gardenId === void 0).map((p) => `${p.id}`).join(", ")}`);
          }
          const serviceRegistryData = {
            serviceRegistry,
            lastSaved: (/* @__PURE__ */ new Date()).toISOString()
          };
          await fs.promises.writeFile(this.serviceRegistryFile, JSON.stringify(serviceRegistryData, null, 2), "utf-8");
          if (verbose) {
            console.log(
              `\u{1F4BE} [ServiceRegistry Persistence] Saved ${serviceRegistry.length} service providers to ${this.serviceRegistryFile} (preserved ${existingProviders.size} existing assignments)`
            );
          }
        } catch (err) {
          console.error(`\u274C [ServiceRegistry Persistence] Failed to save: ${err.message}`);
        }
      })();
    }, 500);
  }
  async connect() {
    if (this.isConnected)
      return;
    this.emit("connect");
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.isConnected = true;
    this.emit("ready");
  }
  async ping() {
    return "PONG";
  }
  get isOpen() {
    return this.isConnected;
  }
  // Simple key-value operations (for wallet balances)
  async get(key) {
    const value = this.data.get(key);
    if (value === void 0) {
      return null;
    }
    if (typeof value === "string") {
      return value;
    }
    return null;
  }
  async set(key, value) {
    this.data.set(key, value);
    if (key.startsWith("wallet:balance:") || key.startsWith("wallet:audit:")) {
      this.savePersistence();
    }
  }
  async del(key) {
    const existed = this.data.has(key);
    if (existed) {
      this.data.delete(key);
      if (key.startsWith("wallet:balance:") || key.startsWith("wallet:audit:") || key.startsWith("wallet:hold:")) {
        this.savePersistence();
      }
      return 1;
    }
    return 0;
  }
  // Get all keys matching a pattern (for wallet reset)
  getKeysMatching(pattern) {
    const keys = [];
    for (const key of this.data.keys()) {
      if (key.startsWith(pattern)) {
        keys.push(key);
      }
    }
    return keys;
  }
  async hSet(key, value) {
    if (typeof value === "object" && value !== null) {
      const hash = {};
      for (const [k, v] of Object.entries(value)) {
        hash[k] = String(v);
      }
      this.data.set(key, hash);
      return Object.keys(hash).length;
    }
    return 0;
  }
  async hGet(key, field) {
    const hash = this.data.get(key);
    if (hash && typeof hash === "object") {
      return hash[field] || null;
    }
    return null;
  }
  async xAdd(streamKey, id, fields) {
    if (!this.streams.has(streamKey)) {
      this.streams.set(streamKey, []);
      this.streamCounters.set(streamKey, 0);
    }
    const stream = this.streams.get(streamKey);
    let messageId;
    if (id === "*") {
      const counter = this.streamCounters.get(streamKey);
      this.streamCounters.set(streamKey, counter + 1);
      const timestamp = Date.now();
      messageId = `${timestamp}-${counter}`;
    } else {
      messageId = id;
    }
    stream.push({ id: messageId, fields });
    return messageId;
  }
  async xRead(streams, options) {
    const results = [];
    for (const streamReq of streams) {
      const stream = this.streams.get(streamReq.key);
      if (!stream || stream.length === 0) {
        if (options?.BLOCK) {
          const blockTime = options.BLOCK || 0;
          await new Promise((resolve) => setTimeout(resolve, Math.min(blockTime, 1e3)));
          return null;
        }
        continue;
      }
      const messages = [];
      let startIndex = 0;
      if (streamReq.id === "$") {
        startIndex = stream.length;
      } else if (streamReq.id !== "0") {
        startIndex = stream.findIndex((msg) => msg.id === streamReq.id);
        if (startIndex === -1)
          startIndex = 0;
        else
          startIndex += 1;
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
  async xGroupCreate(streamKey, groupName, id, options) {
    if (!this.streams.has(streamKey)) {
      if (options?.MKSTREAM) {
        this.streams.set(streamKey, []);
        this.streamCounters.set(streamKey, 0);
      } else {
        throw new Error("NOGROUP");
      }
    }
    if (!this.consumerGroups.has(streamKey)) {
      this.consumerGroups.set(streamKey, /* @__PURE__ */ new Map());
    }
    const groups = this.consumerGroups.get(streamKey);
    if (groups.has(groupName)) {
      throw new Error("BUSYGROUP");
    }
    groups.set(groupName, id);
    this.pendingMessages.set(`${streamKey}:${groupName}`, /* @__PURE__ */ new Map());
  }
  async xReadGroup(groupName, consumerName, streams, options) {
    const results = [];
    for (const streamReq of streams) {
      const stream = this.streams.get(streamReq.key);
      if (!stream || stream.length === 0) {
        if (options?.BLOCK) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(options.BLOCK || 0, 1e3)));
          return null;
        }
        continue;
      }
      const groups = this.consumerGroups.get(streamReq.key);
      if (!groups || !groups.has(groupName)) {
        throw new Error("NOGROUP");
      }
      const lastId = groups.get(groupName) || "0";
      const messages = [];
      let startIndex = 0;
      if (streamReq.id === ">") {
        const lastIdIndex = stream.findIndex((msg) => msg.id === lastId);
        startIndex = lastIdIndex === -1 ? stream.length : lastIdIndex + 1;
      } else {
        startIndex = stream.findIndex((msg) => msg.id === streamReq.id);
        if (startIndex === -1)
          startIndex = 0;
        else
          startIndex += 1;
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
  async xAck(streamKey, groupName, ...ids) {
    const groups = this.consumerGroups.get(streamKey);
    if (!groups || !groups.has(groupName)) {
      return 0;
    }
    if (ids.length > 0) {
      const lastId = ids[ids.length - 1];
      groups.set(groupName, lastId);
    }
    return ids.length;
  }
  async quit() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    try {
      const walletBalances = {};
      for (const [key, value] of this.data.entries()) {
        if (key.startsWith("wallet:balance:") || key.startsWith("wallet:audit:")) {
          walletBalances[key] = typeof value === "string" ? value : JSON.stringify(value);
        }
      }
      const persisted = {
        walletBalances,
        ledgerEntries: [],
        // Will be populated by saveLedgerEntries()
        lastSaved: (/* @__PURE__ */ new Date()).toISOString()
      };
      fs.writeFileSync(this.persistenceFile, JSON.stringify(persisted, null, 2), "utf-8");
      console.log(`\u{1F4BE} [Redis Persistence] Saved ${Object.keys(walletBalances).length} wallet entries on quit (ledger entries saved separately)`);
    } catch (err) {
      console.error(`\u274C [Redis Persistence] Failed to save on quit: ${err.message}`);
    }
    this.isConnected = false;
    this.emit("end");
  }
  on(event, listener) {
    return super.on(event, listener);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  InMemoryRedisServer
});
//# sourceMappingURL=redis.js.map
