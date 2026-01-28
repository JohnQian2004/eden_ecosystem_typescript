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
var garden_exports = {};
__export(garden_exports, {
  initializeGarden: () => initializeGarden,
  issueGardenCertificate: () => issueGardenCertificate,
  registerNewMovieGarden: () => registerNewMovieGarden
});
module.exports = __toCommonJS(garden_exports);
var crypto = __toESM(require("crypto"));
var import_state = require("./state");
var import_constants = require("./constants");
var import_config = require("./config");
var import_serviceProvider = require("./serviceProvider");
let broadcastEvent;
let redis;
function initializeGarden(broadcastFn, redisInstance) {
  broadcastEvent = broadcastFn;
  redis = redisInstance;
}
function issueGardenCertificate(garden) {
  if (!import_state.ROOT_CA) {
    throw new Error("ROOT CA not initialized");
  }
  const cert = import_state.ROOT_CA.issueCertificate({
    subject: garden.uuid,
    capabilities: ["INDEXER", "ISSUE_CERT"],
    constraints: {
      gardenId: garden.id,
      // Updated from indexerId
      gardenName: garden.name,
      // Updated from indexerName
      stream: garden.stream
    },
    ttlSeconds: 365 * 24 * 60 * 60
    // 1 year
  });
  import_state.CERTIFICATE_REGISTRY.set(garden.uuid, cert);
  garden.certificate = cert;
  console.log(`\u{1F4DC} Certificate issued to ${garden.name}: ${garden.uuid}`);
  console.log(`   Capabilities: ${cert.capabilities.join(", ")}`);
  console.log(`   Expires: ${new Date(cert.expiresAt).toISOString()}`);
  broadcastEvent({
    type: "certificate_issued",
    component: "root-ca",
    message: `Certificate issued to ${garden.name}`,
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
async function registerNewMovieGarden(email, stripePaymentIntentId, stripeCustomerId, stripePaymentMethodId, stripeSessionId) {
  if (import_config.DEPLOYED_AS_ROOT) {
    throw new Error(`Cannot create indexer via registerNewMovieGarden in ROOT mode. All indexers must be created via Angular wizard (/api/wizard/create-indexer). Persistence file is the single source of truth.`);
  }
  console.log(`\u{1F3AC} [Indexer Registration] Starting registration for ${email}...`);
  const existingIds = import_state.GARDENS.map((i) => i.id).sort();
  let nextId = "A";
  if (existingIds.length > 0) {
    const lastId = existingIds[existingIds.length - 1];
    const lastCharCode = lastId.charCodeAt(0);
    if (lastCharCode < 90) {
      nextId = String.fromCharCode(lastCharCode + 1);
    } else {
      nextId = `INDEXER-${import_state.GARDENS.length + 1}`;
    }
  }
  const gardenId = `garden-${nextId.toLowerCase()}`;
  const gardenName = `Garden-${nextId}`;
  const streamName = `eden:garden:${nextId}`;
  const gardenUuid = `eden:garden:${crypto.randomUUID()}`;
  const newGarden = {
    id: gardenId,
    name: gardenName,
    stream: streamName,
    active: true,
    uuid: gardenUuid,
    ownerEmail: email,
    // CRITICAL: Store Priest user email for garden ownership and lifecycle management
    priestEmail: email
    // Alias for backward compatibility
  };
  console.log(`\u{1F464} [Garden Registration] Garden ownership assigned to Priest user: ${email}`);
  import_state.GARDENS.push(newGarden);
  console.log(`\u2705 [Garden Registration] Created garden: ${newGarden.name} (${newGarden.id})`);
  console.warn(`\u26A0\uFE0F  [Garden Registration] WARNING: Movie garden created via registerNewMovieGarden - this should NOT happen in ROOT mode!`);
  try {
    issueGardenCertificate(newGarden);
  } catch (err) {
    console.error(`\u274C [Garden Registration] Failed to issue certificate:`, err.message);
    throw err;
  }
  const providerNames = ["Regal Cinemas", "Cineplex", "MovieMax"];
  const providerIds = ["regal-001", "cineplex-001", "moviemax-001"];
  const locations = ["Baltimore, Maryland", "New York, New York", "Los Angeles, California"];
  const reputations = [4.6, 4.4, 4.5];
  const bonds = [1100, 900, 1e3];
  for (let i = 0; i < providerNames.length; i++) {
    const providerId = `${providerIds[i]}-${nextId.toLowerCase()}`;
    const providerUuid = `550e8400-e29b-41d4-a716-${crypto.randomUUID().substring(0, 12)}`;
    const provider = {
      id: providerId,
      uuid: providerUuid,
      name: providerNames[i],
      serviceType: "movie",
      location: locations[i],
      bond: bonds[i],
      reputation: reputations[i],
      gardenId,
      // Assign to this garden
      apiEndpoint: `https://api.${providerIds[i]}.com/v1/listings`,
      status: "active"
    };
    (0, import_serviceProvider.registerServiceProviderWithROOTCA)(provider);
    try {
      (0, import_serviceProvider.issueServiceProviderCertificate)(provider);
    } catch (err) {
      console.warn(`\u26A0\uFE0F  [Garden Registration] Failed to issue certificate to ${provider.name}:`, err.message);
    }
    console.log(`\u2705 [Garden Registration] Registered provider: ${provider.name} (${provider.id})`);
  }
  const snapshot = {
    chainId: import_constants.CHAIN_ID,
    txId: crypto.randomUUID(),
    slot: Date.now(),
    blockTime: Date.now(),
    payer: email,
    merchant: "ROOT CA",
    amount: 110,
    // 110 JSC for indexer purchase
    feeSplit: {}
  };
  const entry = {
    entryId: crypto.randomUUID(),
    txId: snapshot.txId,
    timestamp: snapshot.blockTime,
    payer: email,
    payerId: email,
    merchant: "ROOT CA",
    providerUuid: import_constants.ROOT_CA_UUID,
    serviceType: "garden_purchase",
    amount: 110,
    iGasCost: 0,
    // No iGas for indexer purchase
    fees: {},
    status: "completed",
    cashierId: "stripe-payment-rail-001",
    bookingDetails: {
      indexerId: gardenId,
      // Legacy field (will be renamed to gardenId in future)
      indexerName: gardenName,
      stripePaymentIntentId,
      stripeCustomerId: stripeCustomerId || void 0,
      stripePaymentMethodId: stripePaymentMethodId || void 0,
      stripeSessionId: stripeSessionId || void 0,
      asset: "JSC"
    }
    // Type assertion for indexer-specific fields
  };
  import_state.LEDGER.push(entry);
  if (redis) {
    redis.saveLedgerEntries(import_state.LEDGER);
  }
  broadcastEvent({
    type: "garden_registered",
    component: "root-ca",
    message: `New movie garden registered: ${gardenName}`,
    timestamp: Date.now(),
    data: {
      indexerId: gardenId,
      // Legacy field (will be renamed to gardenId in future)
      indexerName: gardenName,
      indexerUuid: gardenUuid,
      email,
      providersRegistered: providerNames.length
    }
  });
  console.log(`\u2705 [Garden Registration] Registration complete: ${gardenName} with ${providerNames.length} providers`);
  return newGarden;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  initializeGarden,
  issueGardenCertificate,
  registerNewMovieGarden
});
//# sourceMappingURL=garden.js.map
