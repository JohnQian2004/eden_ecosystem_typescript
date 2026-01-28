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
var serviceRegistry2_exports = {};
__export(serviceRegistry2_exports, {
  ServiceRegistry2: () => ServiceRegistry2,
  getServiceRegistry2: () => getServiceRegistry2,
  initializeServiceRegistry2: () => initializeServiceRegistry2
});
module.exports = __toCommonJS(serviceRegistry2_exports);
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_state = require("./state");
class ServiceRegistry2 {
  // CRITICAL: Only load once during server startup
  constructor(persistenceFile) {
    this.providers = /* @__PURE__ */ new Map();
    this.isLoaded = false;
    this.persistenceFile = persistenceFile || path.join(__dirname, "..", "eden-serviceRegistry-persistence.json");
    this.loadPersistence();
    this.isLoaded = true;
  }
  /**
   * Load service registry from persistence file
   * CRITICAL: This should ONLY be called during server startup (constructor)
   */
  loadPersistence() {
    if (this.isLoaded) {
      console.error(`\u274C [ServiceRegistry2] CRITICAL ERROR: loadPersistence() called AFTER server startup! This should NEVER happen!`);
      throw new Error("loadPersistence() can only be called during server startup (constructor), not during runtime!");
    }
    if (!fs.existsSync(this.persistenceFile)) {
      console.log(`\u{1F4C2} [ServiceRegistry2] No persistence file found, starting with empty registry`);
      return;
    }
    try {
      const fileContent = fs.readFileSync(this.persistenceFile, "utf-8");
      const persisted = JSON.parse(fileContent);
      if (persisted.serviceRegistry && Array.isArray(persisted.serviceRegistry)) {
        console.log(`\u{1F4C2} [ServiceRegistry2] Loading ${persisted.serviceRegistry.length} service providers from ${this.persistenceFile}`);
        let loadedCount = 0;
        let skippedCount = 0;
        for (const providerData of persisted.serviceRegistry) {
          const gardenId = providerData.gardenId || providerData.indexerId;
          const gardenExists = gardenId === "HG" || import_state.GARDENS.some((g) => g.id === gardenId) || import_state.TOKEN_GARDENS.some((tg) => tg.id === gardenId);
          if (!gardenExists && gardenId) {
            console.log(`\u26A0\uFE0F  [ServiceRegistry2] Loading provider ${providerData.id} (${providerData.name}) with gardenId "${gardenId}" even though garden doesn't exist yet (may be loaded later)`);
          }
          const provider = {
            id: providerData.id,
            uuid: providerData.uuid,
            name: providerData.name,
            serviceType: providerData.serviceType,
            location: providerData.location || "Unknown",
            bond: providerData.bond || 0,
            reputation: providerData.reputation || 0,
            gardenId: gardenId || "HG",
            apiEndpoint: providerData.apiEndpoint,
            status: providerData.status || "active",
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
        console.log(`\u2705 [ServiceRegistry2] Loaded ${loadedCount} provider(s), skipped ${skippedCount} provider(s)`);
      }
    } catch (err) {
      console.error(`\u274C [ServiceRegistry2] Failed to load persistence: ${err.message}`);
    }
  }
  /**
   * Save service registry to persistence file
   * CRITICAL: This saves the current in-memory state - no filtering, no reloading
   */
  savePersistence() {
    try {
      const providersArray = Array.from(this.providers.values());
      console.log(`\u{1F4BE} [ServiceRegistry2] Saving ${providersArray.length} provider(s) to ${this.persistenceFile}`);
      console.log(`\u{1F4BE} [ServiceRegistry2] Providers:`, providersArray.map((p) => `${p.id}(${p.serviceType},${p.gardenId})`).join(", "));
      const data = {
        serviceRegistry: providersArray.map((p) => {
          const provider = {
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
          if (p.certificate)
            provider.certificate = p.certificate;
          return provider;
        }),
        lastSaved: (/* @__PURE__ */ new Date()).toISOString()
      };
      fs.writeFileSync(this.persistenceFile, JSON.stringify(data, null, 2), "utf-8");
      console.log(`\u2705 [ServiceRegistry2] Saved ${providersArray.length} provider(s) to ${this.persistenceFile}`);
    } catch (err) {
      console.error(`\u274C [ServiceRegistry2] Failed to save persistence: ${err.message}`);
    }
  }
  /**
   * Add a provider to the registry
   */
  addProvider(provider) {
    if (provider.gardenId && provider.gardenId !== "HG") {
      const gardenExists = import_state.GARDENS.some((g) => g.id === provider.gardenId) || import_state.TOKEN_GARDENS.some((tg) => tg.id === provider.gardenId);
      if (!gardenExists) {
        throw new Error(`Cannot add provider ${provider.id}: gardenId "${provider.gardenId}" does not exist`);
      }
    }
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} already exists in registry`);
    }
    this.providers.set(provider.id, provider);
    console.log(`\u2705 [ServiceRegistry2] Added provider: ${provider.name} (${provider.id}) with gardenId: ${provider.gardenId || "HG"}`);
  }
  /**
   * Update an existing provider
   */
  updateProvider(provider) {
    if (!this.providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} does not exist in registry`);
    }
    if (provider.gardenId && provider.gardenId !== "HG") {
      const gardenExists = import_state.GARDENS.some((g) => g.id === provider.gardenId) || import_state.TOKEN_GARDENS.some((tg) => tg.id === provider.gardenId);
      if (!gardenExists) {
        throw new Error(`Cannot update provider ${provider.id}: gardenId "${provider.gardenId}" does not exist`);
      }
    }
    this.providers.set(provider.id, provider);
    console.log(`\u2705 [ServiceRegistry2] Updated provider: ${provider.name} (${provider.id})`);
  }
  /**
   * Remove a provider from the registry
   */
  removeProvider(providerId) {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider ${providerId} does not exist in registry`);
    }
    this.providers.delete(providerId);
    console.log(`\u2705 [ServiceRegistry2] Removed provider: ${providerId}`);
  }
  /**
   * Get a provider by ID
   */
  getProvider(providerId) {
    return this.providers.get(providerId);
  }
  /**
   * Get all providers
   */
  getAllProviders() {
    return Array.from(this.providers.values());
  }
  /**
   * Query providers by service type and filters
   */
  queryProviders(serviceType, filters) {
    let results = Array.from(this.providers.values());
    if (serviceType) {
      results = results.filter((p) => p.serviceType === serviceType);
    }
    results = results.filter((p) => p.status === "active");
    if (filters) {
    }
    return results;
  }
  /**
   * Get provider count
   */
  getCount() {
    return this.providers.size;
  }
  /**
   * Check if provider exists
   */
  hasProvider(providerId) {
    return this.providers.has(providerId);
  }
}
let serviceRegistry2Instance = null;
function initializeServiceRegistry2(persistenceFile) {
  if (serviceRegistry2Instance) {
    console.warn(`\u26A0\uFE0F  [ServiceRegistry2] Already initialized, returning existing instance`);
    return serviceRegistry2Instance;
  }
  serviceRegistry2Instance = new ServiceRegistry2(persistenceFile);
  return serviceRegistry2Instance;
}
function getServiceRegistry2() {
  if (!serviceRegistry2Instance) {
    throw new Error("ServiceRegistry2 not initialized. Call initializeServiceRegistry2() first.");
  }
  return serviceRegistry2Instance;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ServiceRegistry2,
  getServiceRegistry2,
  initializeServiceRegistry2
});
//# sourceMappingURL=serviceRegistry2.js.map
