/**
 * Garden Module
 * Handles garden certificate issuance and registration
 */

import * as crypto from "crypto";
import type { GardenConfig, ServiceProviderWithCert, TransactionSnapshot, LedgerEntry } from "./types";
import type { EdenCertificate } from "../EdenPKI";
import { GARDENS, ROOT_CA, CERTIFICATE_REGISTRY, LEDGER } from "./state";
import { ROOT_CA_UUID, CHAIN_ID } from "./constants";
import { DEPLOYED_AS_ROOT } from "./config";
import { registerServiceProviderWithROOTCA, issueServiceProviderCertificate } from "./serviceProvider";

// Dependencies that need to be injected
let broadcastEvent: (event: any) => void;
let redis: any; // InMemoryRedisServer instance

/**
 * Initialize garden module with dependencies
 */
export function initializeGarden(broadcastFn: (event: any) => void, redisInstance: any): void {
  broadcastEvent = broadcastFn;
  redis = redisInstance;
}

/**
 * Issue a certificate to a garden
 */
export function issueGardenCertificate(garden: GardenConfig): EdenCertificate {
  if (!ROOT_CA) {
    throw new Error("ROOT CA not initialized");
  }
  
  const cert = ROOT_CA.issueCertificate({
    subject: garden.uuid,
    capabilities: ["INDEXER", "ISSUE_CERT"],
    constraints: {
      gardenId: garden.id, // Updated from indexerId
      gardenName: garden.name, // Updated from indexerName
      stream: garden.stream
    },
    ttlSeconds: 365 * 24 * 60 * 60 // 1 year
  });
  
  CERTIFICATE_REGISTRY.set(garden.uuid, cert);
  garden.certificate = cert;
  
  console.log(`📜 Certificate issued to ${garden.name}: ${garden.uuid}`);
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

/**
 * Register a new movie garden
 * Note: In ROOT mode, this should NOT be called directly - gardens should be created via Angular wizard
 */
export async function registerNewMovieGarden(
  email: string,
  stripePaymentIntentId: string,
  stripeCustomerId?: string | null,
  stripePaymentMethodId?: string | null,
  stripeSessionId?: string
): Promise<GardenConfig> {
  // CRITICAL: In ROOT mode, DO NOT create indexers via this function
  // All indexers must be created via Angular wizard (/api/wizard/create-indexer)
  // Persistence file is the single source of truth
  if (DEPLOYED_AS_ROOT) {
    throw new Error(`Cannot create indexer via registerNewMovieGarden in ROOT mode. All indexers must be created via Angular wizard (/api/wizard/create-indexer). Persistence file is the single source of truth.`);
  }
  
  console.log(`🎬 [Indexer Registration] Starting registration for ${email}...`);
  
  // Generate unique indexer ID (next available letter after existing indexers)
  const existingIds = GARDENS.map(i => i.id).sort();
  let nextId = 'A';
  if (existingIds.length > 0) {
    const lastId = existingIds[existingIds.length - 1];
    const lastCharCode = lastId.charCodeAt(0);
    if (lastCharCode < 90) { // Z is 90
      nextId = String.fromCharCode(lastCharCode + 1);
    } else {
      // If we've exceeded Z, use numbers
      nextId = `INDEXER-${GARDENS.length + 1}`;
    }
  }
  
  const gardenId = `garden-${nextId.toLowerCase()}`;
  const gardenName = `Garden-${nextId}`;
  const streamName = `eden:garden:${nextId}`;
  const gardenUuid = `eden:garden:${crypto.randomUUID()}`;
  
  // Create new garden config
  const newGarden: GardenConfig = {
    id: gardenId,
    name: gardenName,
    stream: streamName,
    active: true,
    uuid: gardenUuid
  };
  
  // Add to GARDENS array
  GARDENS.push(newGarden);
  console.log(`✅ [Garden Registration] Created garden: ${newGarden.name} (${newGarden.id})`);
  console.warn(`⚠️  [Garden Registration] WARNING: Movie garden created via registerNewMovieGarden - this should NOT happen in ROOT mode!`);
  
  // Issue certificate to the new garden
  // Note: Persistence is handled by the HTTP handler after certificate issuance
  try {
    issueGardenCertificate(newGarden);
  } catch (err: any) {
    console.error(`❌ [Garden Registration] Failed to issue certificate:`, err.message);
    throw err;
  }
  
  // Create default movie service providers for this garden
  const providerNames = ['Regal Cinemas', 'Cineplex', 'MovieMax'];
  const providerIds = ['regal-001', 'cineplex-001', 'moviemax-001'];
  const locations = ['Baltimore, Maryland', 'New York, New York', 'Los Angeles, California'];
  const reputations = [4.6, 4.4, 4.5];
  const bonds = [1100, 900, 1000];
  
  for (let i = 0; i < providerNames.length; i++) {
    const providerId = `${providerIds[i]}-${nextId.toLowerCase()}`;
    const providerUuid = `550e8400-e29b-41d4-a716-${crypto.randomUUID().substring(0, 12)}`;
    
    const provider: ServiceProviderWithCert = {
      id: providerId,
      uuid: providerUuid,
      name: providerNames[i],
      serviceType: 'movie',
      location: locations[i],
      bond: bonds[i],
      reputation: reputations[i],
      gardenId: gardenId, // Assign to this garden
      apiEndpoint: `https://api.${providerIds[i]}.com/v1/listings`,
      status: 'active'
    };
    
    // Register provider with ROOT CA
    registerServiceProviderWithROOTCA(provider);
    
    // Issue certificate to provider
    try {
      issueServiceProviderCertificate(provider);
    } catch (err: any) {
      console.warn(`⚠️  [Garden Registration] Failed to issue certificate to ${provider.name}:`, err.message);
    }
    
    console.log(`✅ [Garden Registration] Registered provider: ${provider.name} (${provider.id})`);
  }
  
  // Create ledger entry for indexer purchase
  const snapshot: TransactionSnapshot = {
    chainId: CHAIN_ID,
    txId: crypto.randomUUID(),
    slot: Date.now(),
    blockTime: Date.now(),
    payer: email,
    merchant: 'ROOT CA',
    amount: 110, // 110 JSC for indexer purchase
    feeSplit: {},
  };
  
  const entry: LedgerEntry = {
    entryId: crypto.randomUUID(),
    txId: snapshot.txId,
    timestamp: snapshot.blockTime,
    payer: email,
    payerId: email,
    merchant: 'ROOT CA',
    providerUuid: ROOT_CA_UUID,
    serviceType: 'garden_purchase',
    amount: 110,
    iGasCost: 0, // No iGas for indexer purchase
    fees: {},
    status: 'completed',
    cashierId: 'stripe-payment-rail-001',
    bookingDetails: {
      indexerId: gardenId, // Legacy field (will be renamed to gardenId in future)
      indexerName: gardenName,
      stripePaymentIntentId: stripePaymentIntentId,
      stripeCustomerId: stripeCustomerId || undefined,
      stripePaymentMethodId: stripePaymentMethodId || undefined,
      stripeSessionId: stripeSessionId || undefined,
      asset: 'JSC'
    } as any, // Type assertion for indexer-specific fields
  };
  
  LEDGER.push(entry);
  if (redis) {
    redis.saveLedgerEntries(LEDGER);
  }
  
  // Broadcast events
  broadcastEvent({
    type: "garden_registered",
    component: "root-ca",
    message: `New movie garden registered: ${gardenName}`,
    timestamp: Date.now(),
    data: {
      indexerId: gardenId, // Legacy field (will be renamed to gardenId in future)
      indexerName: gardenName,
      indexerUuid: gardenUuid,
      email: email,
      providersRegistered: providerNames.length
    }
  });
  
  console.log(`✅ [Garden Registration] Registration complete: ${gardenName} with ${providerNames.length} providers`);
  
  return newGarden;
}

