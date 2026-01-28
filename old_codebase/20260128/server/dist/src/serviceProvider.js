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
var serviceProvider_exports = {};
__export(serviceProvider_exports, {
  createServiceProvidersForGarden: () => createServiceProvidersForGarden,
  initializeServiceProvider: () => initializeServiceProvider,
  issueServiceProviderCertificate: () => issueServiceProviderCertificate,
  queryAMCAPI: () => queryAMCAPI,
  queryCinemarkAPI: () => queryCinemarkAPI,
  queryDEXPoolAPI: () => queryDEXPoolAPI,
  queryMovieComAPI: () => queryMovieComAPI,
  queryProviderAPI: () => queryProviderAPI,
  queryROOTCAServiceRegistry: () => queryROOTCAServiceRegistry,
  queryServiceProviders: () => queryServiceProviders,
  querySnakeAPI: () => querySnakeAPI,
  registerServiceProviderWithROOTCA: () => registerServiceProviderWithROOTCA,
  validateGardenId: () => validateGardenId
});
module.exports = __toCommonJS(serviceProvider_exports);
var crypto = __toESM(require("crypto"));
var import_state = require("./state");
var import_serviceRegistry2 = require("./serviceRegistry2");
var import_providerPluginRegistry = require("./plugins/providerPluginRegistry");
var import_mysql = require("./plugins/mysql");
var import_llm = require("./llm");
let broadcastEvent;
function initializeServiceProvider(broadcastFn) {
  broadcastEvent = broadcastFn;
}
function validateGardenId(gardenId) {
  if (!gardenId) {
    return false;
  }
  if (gardenId === "HG") {
    return true;
  }
  const existsInRegular = import_state.GARDENS.some((g) => g.id === gardenId);
  const existsInToken = import_state.TOKEN_GARDENS.some((tg) => tg.id === gardenId);
  return existsInRegular || existsInToken;
}
function registerServiceProviderWithROOTCA(provider) {
  if (provider.gardenId && !validateGardenId(provider.gardenId)) {
    throw new Error(`Cannot register service provider ${provider.id}: gardenId "${provider.gardenId}" does not exist. Valid gardens: ${[...import_state.GARDENS.map((g) => g.id), ...import_state.TOKEN_GARDENS.map((tg) => tg.id), "HG"].join(", ")}`);
  }
  try {
    const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
    if (serviceRegistry2.hasProvider(provider.id)) {
      throw new Error(`Service provider ${provider.id} already registered in ServiceRegistry2`);
    }
    serviceRegistry2.addProvider(provider);
    console.log(`\u2705 [ServiceRegistry2] Registered service provider: ${provider.name} (${provider.id}) with gardenId: ${provider.gardenId || "HG"}`);
  } catch (err) {
    if (err.message.includes("not initialized")) {
      console.warn(`\u26A0\uFE0F  [ServiceRegistry2] Not initialized, falling back to ROOT_CA_SERVICE_REGISTRY`);
    } else {
      throw err;
    }
  }
  const existing = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === provider.id || p.uuid === provider.uuid);
  if (!existing) {
    import_state.ROOT_CA_SERVICE_REGISTRY.push(provider);
    console.log(`\u2705 [ROOT CA] Registered service provider (legacy): ${provider.name} (${provider.id}) with gardenId: ${provider.gardenId || "HG"}`);
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
function createServiceProvidersForGarden(serviceType, gardenId, providers, predefinedProviderMap) {
  const results = [];
  const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
  if (!validateGardenId(gardenId)) {
    throw new Error(`Cannot create providers: gardenId "${gardenId}" does not exist. Valid gardens: ${[...import_state.GARDENS.map((g) => g.id), ...import_state.TOKEN_GARDENS.map((tg) => tg.id), "HG"].join(", ")}`);
  }
  for (const providerConfig of providers) {
    let providerId;
    let providerData;
    if (providerConfig.id) {
      providerId = providerConfig.id;
      if (predefinedProviderMap && predefinedProviderMap[providerId]) {
        const predefined = predefinedProviderMap[providerId];
        providerData = {
          id: providerId,
          uuid: predefined.uuid,
          name: predefined.name,
          serviceType,
          location: predefined.location,
          bond: predefined.bond,
          reputation: predefined.reputation,
          gardenId,
          apiEndpoint: predefined.apiEndpoint,
          status: "active"
        };
      } else {
        providerData = {
          id: providerId,
          uuid: providerConfig.uuid || crypto.randomUUID(),
          name: providerConfig.name,
          serviceType,
          location: providerConfig.location || "Unknown",
          bond: providerConfig.bond || 1e3,
          reputation: providerConfig.reputation || 5,
          gardenId,
          apiEndpoint: providerConfig.apiEndpoint || "",
          status: "active",
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
      const existingProviderWithSameName = serviceRegistry2.getAllProviders().find(
        (p) => p.name === providerConfig.name && p.gardenId === gardenId && p.serviceType === serviceType
      );
      if (existingProviderWithSameName) {
        console.log(`   \u26A0\uFE0F  Provider with name "${providerConfig.name}" already exists for garden ${gardenId}, skipping duplicate creation`);
        results.push({
          providerId: existingProviderWithSameName.id,
          providerName: existingProviderWithSameName.name,
          created: false,
          assigned: false
        });
        continue;
      }
      providerId = `${serviceType}-${crypto.randomUUID().substring(0, 8)}`;
      providerData = {
        id: providerId,
        uuid: providerConfig.uuid || crypto.randomUUID(),
        name: providerConfig.name,
        serviceType,
        location: providerConfig.location || "Unknown",
        bond: providerConfig.bond || 1e3,
        reputation: providerConfig.reputation || 5,
        gardenId,
        apiEndpoint: providerConfig.apiEndpoint || "",
        status: "active",
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
    const existingProvider = serviceRegistry2.getProvider(providerId);
    if (existingProvider) {
      if (existingProvider.gardenId !== gardenId) {
        console.log(`   \u{1F504} Reassigning provider: ${existingProvider.name} (${existingProvider.id}) from garden ${existingProvider.gardenId} to ${gardenId}`);
        existingProvider.gardenId = gardenId;
        try {
          serviceRegistry2.savePersistence();
          console.log(`   \u{1F4BE} Service registry saved to persistence (reassigned provider: ${existingProvider.name})`);
        } catch (saveErr) {
          console.error(`   \u274C Failed to save service registry:`, saveErr.message);
        }
        results.push({
          providerId,
          providerName: existingProvider.name,
          created: false,
          assigned: true
        });
      } else {
        console.log(`   \u2713 Provider ${existingProvider.name} (${existingProvider.id}) already assigned to garden ${gardenId}`);
        results.push({
          providerId,
          providerName: existingProvider.name,
          created: false,
          assigned: false
        });
      }
    } else {
      try {
        serviceRegistry2.addProvider(providerData);
        const existingInOldRegistry = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === providerData.id || p.uuid === providerData.uuid);
        if (!existingInOldRegistry) {
          import_state.ROOT_CA_SERVICE_REGISTRY.push(providerData);
        } else {
          Object.assign(existingInOldRegistry, providerData);
        }
        try {
          issueServiceProviderCertificate(providerData);
          console.log(`   \u{1F4DC} Certificate issued to ${providerData.name}`);
        } catch (certErr) {
          console.warn(`   \u26A0\uFE0F  Failed to issue certificate to ${providerData.name}:`, certErr.message);
        }
        console.log(`   \u2705 Created service provider: ${providerData.name} (${providerData.id}) for garden ${gardenId}`);
        try {
          serviceRegistry2.savePersistence();
          console.log(`   \u{1F4BE} Service registry saved to persistence (provider: ${providerData.name})`);
        } catch (saveErr) {
          console.error(`   \u274C Failed to save service registry:`, saveErr.message);
        }
        broadcastEvent({
          type: "service_provider_created",
          component: "root-ca",
          message: `Service provider ${providerData.name} created and assigned to garden ${gardenId}`,
          timestamp: Date.now(),
          data: {
            providerId: providerData.id,
            providerName: providerData.name,
            serviceType,
            gardenId
          }
        });
        results.push({
          providerId,
          providerName: providerData.name,
          created: true,
          assigned: true
        });
      } catch (err) {
        console.error(`   \u274C Failed to create provider ${providerData.name}:`, err.message);
        throw err;
      }
    }
  }
  return results;
}
function queryROOTCAServiceRegistry(query) {
  let providers = [];
  try {
    const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
    providers = serviceRegistry2.queryProviders(query.serviceType, query.filters);
    console.log(`\u{1F50D} [queryROOTCAServiceRegistry] ServiceRegistry2 has ${serviceRegistry2.getCount()} providers, query returned ${providers.length}`);
  } catch (err) {
    if (err.message.includes("not initialized")) {
      console.warn(`\u26A0\uFE0F  [ServiceRegistry2] Not initialized, falling back to ROOT_CA_SERVICE_REGISTRY`);
      providers = Array.from(import_state.ROOT_CA_SERVICE_REGISTRY);
    } else {
      throw err;
    }
  }
  console.log(`\u{1F50D} [queryROOTCAServiceRegistry] Query:`, JSON.stringify(query, null, 2));
  console.log(`\u{1F50D} [queryROOTCAServiceRegistry] Providers in registry: ${providers.length}`);
  console.log(`\u{1F50D} [queryROOTCAServiceRegistry] Providers:`, providers.map((p) => ({
    id: p.id,
    name: p.name,
    serviceType: p.serviceType,
    status: p.status,
    gardenId: p.gardenId
  })));
  const filtered = providers.filter((provider) => {
    if (import_state.REVOCATION_REGISTRY.has(provider.uuid)) {
      console.log(`   \u274C Provider ${provider.id} filtered out: revoked in REVOCATION_REGISTRY`);
      return false;
    }
    if (provider.status === "revoked" || provider.status === "suspended") {
      console.log(`   \u274C Provider ${provider.id} filtered out: status is ${provider.status}`);
      return false;
    }
    if (query.serviceType && provider.serviceType !== query.serviceType) {
      console.log(`   \u274C Provider ${provider.id} filtered out: serviceType mismatch (query: ${query.serviceType}, provider: ${provider.serviceType})`);
      return false;
    }
    if (query.filters?.location && !provider.location.toLowerCase().includes(query.filters.location.toLowerCase())) {
      console.log(`   \u274C Provider ${provider.id} filtered out: location mismatch (query: ${query.filters.location}, provider: ${provider.location})`);
      return false;
    }
    if (query.filters?.minReputation && provider.reputation < query.filters.minReputation) {
      console.log(`   \u274C Provider ${provider.id} filtered out: reputation too low (query: ${query.filters.minReputation}, provider: ${provider.reputation})`);
      return false;
    }
    console.log(`   \u2705 Provider ${provider.id} matched!`);
    return true;
  });
  console.log(`\u{1F50D} [queryROOTCAServiceRegistry] Filtered result: ${filtered.length} providers`);
  return filtered;
}
async function queryAMCAPI(location, filters) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const amcProvider = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === "amc-001");
  const gardenId = amcProvider?.gardenId || "unknown";
  if (!amcProvider) {
    console.warn(`\u26A0\uFE0F  [queryAMCAPI] Provider amc-001 not found in ROOT_CA_SERVICE_REGISTRY. Using fallback gardenId: ${gardenId}`);
    return [
      {
        providerId: "amc-001",
        providerName: "AMC Theatres",
        movieTitle: "Back to the Future",
        movieId: "back-to-future-1",
        price: 2,
        showtime: "10:30 PM",
        location: location || "Baltimore, Maryland",
        reviewCount: 100,
        rating: 5,
        gardenId
      }
    ];
  } else if (!amcProvider.gardenId) {
    console.warn(`\u26A0\uFE0F  [queryAMCAPI] Provider amc-001 found but has no gardenId. Using fallback: ${gardenId}`);
    return [
      {
        providerId: "amc-001",
        providerName: "AMC Theatres",
        movieTitle: "Back to the Future",
        movieId: "back-to-future-1",
        price: 2,
        showtime: "10:30 PM",
        location: location || "Baltimore, Maryland",
        reviewCount: 100,
        rating: 5,
        gardenId
      }
    ];
  }
  console.log(`\u2705 [queryAMCAPI] Found amc-001 with gardenId: ${gardenId}`);
  return [
    {
      providerId: "amc-001",
      providerName: "AMC Theatres",
      movieTitle: "Back to the Future",
      movieId: "back-to-future-1",
      price: 2,
      // Real-time price from AMC API
      showtime: "10:30 PM",
      location,
      reviewCount: 100,
      rating: 5,
      gardenId
    },
    {
      providerId: "amc-001",
      providerName: "AMC Theatres",
      movieTitle: "The Matrix",
      movieId: "matrix-001",
      price: 2,
      // Real-time price from AMC API
      showtime: "8:00 PM",
      location,
      reviewCount: 150,
      rating: 4.9,
      gardenId
    }
  ];
}
async function queryMovieComAPI(location, filters) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const moviecomProvider = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === "moviecom-001");
  const gardenId = moviecomProvider?.gardenId || "unknown";
  if (!moviecomProvider) {
    console.warn(`\u26A0\uFE0F  [queryMovieComAPI] Provider moviecom-001 not found in ROOT_CA_SERVICE_REGISTRY. Using fallback gardenId: ${gardenId}`);
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
        gardenId
      }
    ];
  } else if (!moviecomProvider.gardenId) {
    console.warn(`\u26A0\uFE0F  [queryMovieComAPI] Provider moviecom-001 found but has no gardenId. Using fallback: ${gardenId}`);
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
        gardenId
      }
    ];
  }
  console.log(`\u2705 [queryMovieComAPI] Found moviecom-001 with gardenId: ${gardenId}`);
  return [
    {
      providerId: "moviecom-001",
      providerName: "MovieCom",
      movieTitle: "Back to the Future",
      movieId: "back-to-future-1",
      price: 1.5,
      // Real-time price from MovieCom API
      showtime: "9:45 PM",
      location,
      reviewCount: 85,
      rating: 4.7,
      gardenId
    }
  ];
}
async function queryCinemarkAPI(location, filters) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const cinemarkProvider = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === "cinemark-001");
  const gardenId = cinemarkProvider?.gardenId || "unknown";
  if (!cinemarkProvider) {
    console.warn(`\u26A0\uFE0F  [queryCinemarkAPI] Provider cinemark-001 not found in ROOT_CA_SERVICE_REGISTRY. Using fallback gardenId: ${gardenId}`);
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
        gardenId
      }
    ];
  } else if (!cinemarkProvider.gardenId) {
    console.warn(`\u26A0\uFE0F  [queryCinemarkAPI] Provider cinemark-001 found but has no gardenId. Using fallback: ${gardenId}`);
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
        gardenId
      }
    ];
  }
  console.log(`\u2705 [queryCinemarkAPI] Found cinemark-001 with gardenId: ${gardenId}`);
  return [
    {
      providerId: "cinemark-001",
      providerName: "Cinemark",
      movieTitle: "The Matrix",
      movieId: "matrix-001",
      price: 2.5,
      // Real-time price from Cinemark API
      showtime: "11:00 PM",
      location,
      reviewCount: 120,
      rating: 4.8,
      gardenId
    }
  ];
}
async function queryDEXPoolAPI(provider, filters) {
  await new Promise((resolve) => setTimeout(resolve, 30));
  const providerInRegistry = import_state.ROOT_CA_SERVICE_REGISTRY.find((p) => p.id === provider.id);
  if (!providerInRegistry) {
    console.warn(`\u26A0\uFE0F  [queryDEXPoolAPI] Provider ${provider.id} not found in ROOT_CA_SERVICE_REGISTRY. Total providers: ${import_state.ROOT_CA_SERVICE_REGISTRY.length}`);
    console.warn(`\u26A0\uFE0F  [queryDEXPoolAPI] Available providers: ${import_state.ROOT_CA_SERVICE_REGISTRY.map((p) => p.id).join(", ")}`);
    return [];
  }
  if (!provider.gardenId) {
    console.warn(`\u26A0\uFE0F  [queryDEXPoolAPI] Provider ${provider.id} found but has no gardenId`);
    return [];
  }
  console.log(`\u2705 [queryDEXPoolAPI] Found provider ${provider.id} with gardenId: ${provider.gardenId}`);
  if (import_state.DEX_POOLS.size === 0) {
    console.warn(`\u26A0\uFE0F  [queryDEXPoolAPI] DEX_POOLS is empty! No pools available.`);
    console.warn(`\u26A0\uFE0F  [queryDEXPoolAPI] TOKEN_GARDENS.length: ${import_state.TOKEN_GARDENS.length}`);
    console.warn(`\u26A0\uFE0F  [queryDEXPoolAPI] TOKEN_GARDENS:`, import_state.TOKEN_GARDENS.map((tg) => ({ id: tg.id, name: tg.name })));
    console.warn(`\u26A0\uFE0F  [queryDEXPoolAPI] DEX_POOLS reference:`, import_state.DEX_POOLS);
    console.warn(`\u26A0\uFE0F  [queryDEXPoolAPI] DEX_POOLS entries:`, Array.from(import_state.DEX_POOLS.entries()));
    return [];
  }
  console.log(`\u2705 [queryDEXPoolAPI] DEX_POOLS has ${import_state.DEX_POOLS.size} pool(s)`);
  console.log(`\u2705 [queryDEXPoolAPI] DEX_POOLS entries:`, Array.from(import_state.DEX_POOLS.entries()).map(([id, pool]) => ({
    poolId: id,
    tokenSymbol: pool.tokenSymbol,
    gardenId: pool.gardenId
  })));
  const listings = [];
  console.log(`\u{1F50D} [DEX] Querying pools for provider: ${provider.id} (gardenId: ${provider.gardenId})`);
  console.log(`   Filters: ${JSON.stringify(filters)}`);
  let hasMatch = false;
  for (const [poolId, pool] of import_state.DEX_POOLS.entries()) {
    const tokenSymbolLower = pool.tokenSymbol.toLowerCase();
    const providerIdLower = provider.id.toLowerCase();
    const matchesByGarden = pool.gardenId === provider.gardenId;
    const matchesBySymbol = providerIdLower.includes(tokenSymbolLower);
    const expectedProviderId = `dex-pool-${tokenSymbolLower}`;
    const matchesByPattern = providerIdLower === expectedProviderId;
    const matchesProvider = matchesByGarden || matchesBySymbol || matchesByPattern;
    if (matchesProvider)
      hasMatch = true;
    console.log(`   Pool ${pool.tokenSymbol} (${pool.gardenId}): matchesByGarden=${matchesByGarden}, matchesBySymbol=${matchesBySymbol}, matchesByPattern=${matchesByPattern} (provider.id="${provider.id}", expected="${expectedProviderId}")`);
    if (!matchesProvider)
      continue;
    if (filters?.tokenSymbol && pool.tokenSymbol.toUpperCase() !== filters.tokenSymbol.toUpperCase()) {
      console.log(`   Pool ${pool.tokenSymbol} filtered out by tokenSymbol filter: ${pool.tokenSymbol.toUpperCase()} !== ${filters.tokenSymbol.toUpperCase()}`);
      continue;
    }
    if (filters?.baseToken && pool.baseToken.toUpperCase() !== filters.baseToken.toUpperCase()) {
      console.log(`   Pool ${pool.tokenSymbol} filtered out by baseToken filter: ${pool.baseToken.toUpperCase()} !== ${filters.baseToken.toUpperCase()}`);
      continue;
    }
    console.log(`   \u2705 Pool ${pool.tokenSymbol} matched!`);
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
      gardenId: pool.gardenId
    });
  }
  if (listings.length === 0) {
    console.log(`\u26A0\uFE0F  [DEX] No pools matched for provider ${provider.id} (gardenId: ${provider.gardenId})`);
    console.log(`   Available pools: ${Array.from(import_state.DEX_POOLS.values()).map((p) => `${p.tokenSymbol} (${p.gardenId})`).join(", ")}`);
    if (!hasMatch && provider.serviceType === "dex") {
      console.log(`   \u{1F504} Fallback: Returning all pools for garden ${provider.gardenId}`);
      for (const [poolId, pool] of import_state.DEX_POOLS.entries()) {
        if (pool.gardenId === provider.gardenId) {
          if (filters?.tokenSymbol && pool.tokenSymbol.toUpperCase() !== filters.tokenSymbol.toUpperCase())
            continue;
          if (filters?.baseToken && pool.baseToken.toUpperCase() !== filters.baseToken.toUpperCase())
            continue;
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
            gardenId: pool.gardenId
          });
        }
      }
      if (listings.length > 0) {
        console.log(`   \u2705 Fallback found ${listings.length} pool(s)`);
      }
    }
  } else {
    console.log(`\u2705 [DEX] Found ${listings.length} pool(s) for provider ${provider.id}`);
  }
  return listings;
}
async function querySnakeAPI(provider, filters) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const baseListings = [
    {
      providerId: provider.id,
      providerName: provider.name,
      movieTitle: "Premium Cinema Experience",
      movieId: "premium-cinema-001",
      price: 18.99,
      // Slightly higher price (premium)
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
      price: 22.5,
      // Premium pricing
      showtime: filters?.time || "9:30 PM",
      location: "Luxury Cinema Complex",
      reviewCount: 890,
      rating: 4.8,
      gardenId: provider.gardenId
    }
  ];
  console.log(`\u{1F40D} [Snake Provider] ${provider.name} returned ${baseListings.length} advertised listings`);
  return baseListings;
}
async function queryProviderAPI(provider, filters) {
  if (provider.serviceType === "snake") {
    return await querySnakeAPI(provider, filters);
  }
  if (provider.serviceType === "dex") {
    return await queryDEXPoolAPI(provider, filters);
  }
  switch (provider.id) {
    case "amc-001":
      return await queryAMCAPI(provider.location, filters);
    case "moviecom-001":
      return await queryMovieComAPI(provider.location, filters);
    case "cinemark-001":
      return await queryCinemarkAPI(provider.location, filters);
    default:
      if (String(provider.apiEndpoint || "").toLowerCase().startsWith("eden:plugin:mysql")) {
        const cfg = (0, import_providerPluginRegistry.getMySQLProviderPluginConfig)(provider.id);
        if (!cfg) {
          throw new Error(`MySQL plugin config not found for provider: ${provider.id}`);
        }
        let params = [];
        const paramOrder = Array.isArray(cfg.paramOrder) ? cfg.paramOrder : [];
        if (filters && typeof filters.rawQuery === "string" && filters.rawQuery.trim()) {
          console.log(`   \u{1F451} [Provider Plugin] ROOT CA LLM: Extracting getData() params from raw query`);
          try {
            const getDataParams = await (0, import_llm.extractGetDataParamsWithOpenAI)(filters.rawQuery);
            params = paramOrder.map((k) => {
              const matchedParam = getDataParams.params.find(
                (p) => p.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(p.toLowerCase())
              );
              return matchedParam || filters?.[k];
            });
            console.log(`   \u{1F451} [Provider Plugin] ROOT CA LLM extracted params:`, getDataParams.params);
            console.log(`   \u{1F451} [Provider Plugin] Mapped to SQL params:`, params);
          } catch (llmErr) {
            console.warn(`   \u26A0\uFE0F  [Provider Plugin] ROOT CA LLM extraction failed, falling back to direct filters:`, llmErr.message);
            params = paramOrder.map((k) => filters?.[k]);
          }
        } else {
          params = paramOrder.map((k) => filters?.[k]);
        }
        const result = await (0, import_mysql.testMySQLQuery)({
          connection: cfg.connection,
          sql: cfg.sql,
          params,
          maxRows: cfg.maxRows || 50
        });
        const fieldMap = cfg.fieldMap || {};
        const rows = result.rows || [];
        const normalizeBigInt = (value) => {
          if (typeof value === "bigint") {
            if (value <= Number.MAX_SAFE_INTEGER && value >= Number.MIN_SAFE_INTEGER) {
              return Number(value);
            } else {
              return value.toString();
            }
          }
          if (Array.isArray(value)) {
            return value.map(normalizeBigInt);
          }
          if (value !== null && typeof value === "object") {
            const normalized = {};
            for (const [k, v] of Object.entries(value)) {
              normalized[k] = normalizeBigInt(v);
            }
            return normalized;
          }
          return value;
        };
        const hasImageColumns = rows.length > 0 && ("autopart_id" in rows[0] || "image_id" in rows[0] || "image_url" in rows[0] || "i.id" in rows[0] || Object.keys(rows[0]).some((k) => k.startsWith("image_") || k.startsWith("i.") || k.toLowerCase().includes("image")));
        const hasAutopartId = rows.length > 0 && ("id" in rows[0] || "a.id" in rows[0] || "autopart_id" in rows[0]);
        if (cfg.serviceType === "autoparts" && hasImageColumns && hasAutopartId) {
          console.log(`   \u{1F504} [Provider Plugin] Grouping autoparts with images (${rows.length} rows)`);
          const autopartsMap = /* @__PURE__ */ new Map();
          for (const row of rows) {
            const autopartId = row.id || row["a.id"] || row.autopart_id || row["a.id"];
            if (!autopartId)
              continue;
            if (!autopartsMap.has(autopartId)) {
              const autopart2 = {
                providerId: provider.id,
                providerName: provider.name,
                gardenId: provider.gardenId,
                location: provider.location,
                imageModals: []
              };
              for (const [k, v] of Object.entries(row || {})) {
                if (k.startsWith("image_") || k.startsWith("i.") || k.toLowerCase().includes("image") && k !== "imageModals" || k === "autopart_id") {
                  continue;
                }
                if (k.startsWith("a.")) {
                  const cleanKey = k.substring(2);
                  autopart2[cleanKey] = normalizeBigInt(v);
                } else {
                  autopart2[k] = normalizeBigInt(v);
                }
              }
              for (const [canonical, col] of Object.entries(fieldMap)) {
                if (row[col] !== void 0) {
                  autopart2[canonical] = normalizeBigInt(row[col]);
                }
              }
              if (autopart2.price === void 0 || autopart2.price === null) {
                const maybePrice = autopart2.Price ?? autopart2.price_usd ?? autopart2.amount ?? autopart2.cost ?? autopart2.sale_price;
                autopart2.price = typeof maybePrice === "string" ? parseFloat(maybePrice) : typeof maybePrice === "number" ? maybePrice : 0;
              }
              if (!autopart2.partName && autopart2.part_name)
                autopart2.partName = autopart2.part_name;
              if (!autopart2.partName && autopart2.title)
                autopart2.partName = autopart2.title;
              autopartsMap.set(autopartId, autopart2);
            }
            const autopart = autopartsMap.get(autopartId);
            const imageData = {};
            let hasImageData = false;
            for (const [k, v] of Object.entries(row || {})) {
              if (k.startsWith("image_")) {
                const cleanKey = k.substring(6);
                if (v !== null && v !== void 0) {
                  imageData[cleanKey] = normalizeBigInt(v);
                  hasImageData = true;
                }
              } else if (k === "autopart_id" && v !== null && v !== void 0) {
                imageData[k] = normalizeBigInt(v);
              } else if (k.startsWith("i.")) {
                const cleanKey = k.substring(2);
                if (v !== null && v !== void 0) {
                  imageData[cleanKey] = normalizeBigInt(v);
                  hasImageData = true;
                }
              }
            }
            if (hasImageData && Object.keys(imageData).length > 0) {
              const imageId = imageData.id || imageData.image_id;
              if (imageId && !autopart.imageModals.find((img) => (img.id || img.image_id) === imageId)) {
                autopart.imageModals.push(imageData);
              } else if (!imageId) {
                const imageUrl = imageData.url || imageData.image_url;
                if (imageUrl && !autopart.imageModals.find((img) => (img.url || img.image_url) === imageUrl)) {
                  autopart.imageModals.push(imageData);
                } else if (!imageUrl) {
                  autopart.imageModals.push(imageData);
                }
              }
            }
          }
          const listings2 = Array.from(autopartsMap.values());
          console.log(`   \u2705 [Provider Plugin] Grouped into ${listings2.length} autoparts with images`);
          console.log(`   \u{1F4CB} [Provider Plugin] Returning all fields (no hardcoded filtering)`);
          return listings2;
        }
        const listings = rows.map((row, idx) => {
          const out = {
            providerId: provider.id,
            providerName: provider.name,
            gardenId: provider.gardenId,
            location: provider.location
          };
          for (const [k, v] of Object.entries(row || {}))
            out[k] = normalizeBigInt(v);
          for (const [canonical, col] of Object.entries(fieldMap)) {
            out[canonical] = normalizeBigInt(row?.[col]);
          }
          if (out.price === void 0 || out.price === null) {
            const maybePrice = out.Price ?? out.price_usd ?? out.amount ?? out.cost ?? out.sale_price;
            out.price = typeof maybePrice === "string" ? parseFloat(maybePrice) : typeof maybePrice === "number" ? maybePrice : 0;
          }
          if (cfg.serviceType === "airline") {
            if (!out.flightNumber && out.flight_no)
              out.flightNumber = out.flight_no;
            if (!out.flightId)
              out.flightId = `flight-${out.flightNumber || idx}`;
          }
          if (cfg.serviceType === "autoparts") {
            if (!out.partName && out.part_name)
              out.partName = out.part_name;
            if (!out.partName && out.title)
              out.partName = out.title;
          }
          return out;
        });
        return listings;
      }
      throw new Error(`Unknown provider: ${provider.id}`);
  }
}
async function queryServiceProviders(providers, filters) {
  const allListings = [];
  const providerPromises = providers.map(
    (provider) => queryProviderAPI(provider, filters).catch((err) => {
      console.warn(`\u26A0\uFE0F  Failed to query ${provider.name} API:`, err.message);
      return [];
    })
  );
  const results = await Promise.all(providerPromises);
  for (const listings of results) {
    allListings.push(...listings);
  }
  return allListings;
}
function issueServiceProviderCertificate(provider) {
  if (!import_state.ROOT_CA) {
    throw new Error("ROOT CA not initialized");
  }
  const cert = import_state.ROOT_CA.issueCertificate({
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
    ttlSeconds: 90 * 24 * 60 * 60
    // 90 days
  });
  import_state.CERTIFICATE_REGISTRY.set(provider.uuid, cert);
  provider.certificate = cert;
  try {
    const serviceRegistry2 = (0, import_serviceRegistry2.getServiceRegistry2)();
    if (serviceRegistry2.hasProvider(provider.id)) {
      serviceRegistry2.updateProvider(provider);
      console.log(`\u{1F4DC} [ServiceRegistry2] Updated provider ${provider.name} with certificate`);
    }
  } catch (err) {
    if (!err.message.includes("not initialized")) {
      console.warn(`\u26A0\uFE0F  [ServiceRegistry2] Failed to update provider with certificate: ${err.message}`);
    }
  }
  console.log(`\u{1F4DC} Certificate issued to ${provider.name}: ${provider.uuid}`);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createServiceProvidersForGarden,
  initializeServiceProvider,
  issueServiceProviderCertificate,
  queryAMCAPI,
  queryCinemarkAPI,
  queryDEXPoolAPI,
  queryMovieComAPI,
  queryProviderAPI,
  queryROOTCAServiceRegistry,
  queryServiceProviders,
  querySnakeAPI,
  registerServiceProviderWithROOTCA,
  validateGardenId
});
//# sourceMappingURL=serviceProvider.js.map
