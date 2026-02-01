/**
 * Global State Management
 * Contains all shared state that needs to be accessible across modules
 */

import type { GardenConfig, TokenGardenConfig, ServiceProvider, LedgerEntry, TokenPool, User } from "./types";
import { ROOT_CA_UUID } from "./constants";
import * as crypto from "crypto";

// Export global state arrays and maps
export let GARDENS: GardenConfig[] = [];
export let TOKEN_GARDENS: TokenGardenConfig[] = [];
export let ROOT_CA_SERVICE_REGISTRY: (ServiceProvider & { certificate?: any })[] = [];
export let LEDGER: LedgerEntry[] = [];
export let DEX_POOLS: Map<string, TokenPool> = new Map();
export let USERS: User[] = [];

// Export ROOT CA state
export let ROOT_CA: any = null;
export let ROOT_CA_IDENTITY: any = null;

// Certificate Registry
export const CERTIFICATE_REGISTRY = new Map<string, any>();
export const REVOCATION_REGISTRY = new Map<string, any>();

// ROOT CA Balance Tracking
export interface ROOTBalance {
  rootCA: number;
  indexers: Map<string, number>;
  providers: Map<string, number>;
}

export const ROOT_BALANCES: ROOTBalance = {
  rootCA: 0,
  indexers: new Map(),
  providers: new Map(),
};

// ROOT CA Liquidity Pool
export let rootCALiquidity: number = 1000; // Initial ROOT CA liquidity in SOL

// Total iGas Tracking (persisted across server restarts)
export let TOTAL_IGAS: number = 0.0;

// Provider Webhook Registry
export interface ProviderWebhook {
  providerId: string;
  webhookUrl: string;
  registeredAt: number;
  failureCount: number;
}

export const PROVIDER_WEBHOOKS = new Map<string, ProviderWebhook>();

// Holy Ghost Garden Config
export const HOLY_GHOST_GARDEN: GardenConfig = {
  id: "HG",
  name: "Holy Ghost",
  stream: "eden:holy-ghost",
  active: true,
  uuid: ROOT_CA_UUID,
};

// Initialization functions
export function initializeGardens(numGardens: number, numTokenGardens: number, deployedAsRoot: boolean): void {
  GARDENS = [];
  TOKEN_GARDENS = [];
  
  if (!deployedAsRoot) {
    for (let i = 0; i < numGardens; i++) {
      const gardenId = String.fromCharCode(65 + i); // A, B, C, D, E...
      GARDENS.push({
        id: gardenId,
        name: `Garden-${gardenId}`,
        stream: `eden:garden:${gardenId}`,
        active: true,
        uuid: `eden:garden:${crypto.randomUUID()}`
      });
    }
    
    for (let i = 0; i < numTokenGardens; i++) {
      const tokenIndexerId = `T${i + 1}`; // T1, T2, T3...
      TOKEN_GARDENS.push({
        id: tokenIndexerId,
        name: `Garden-${tokenIndexerId}`,
        stream: `eden:token-garden:${tokenIndexerId}`,
        active: true,
        uuid: `eden:garden:${crypto.randomUUID()}`,
        tokenServiceType: 'dex'
      });
    }
  }
}

export function initializeUsers(): void {
  USERS = [
    { id: "u1", email: "bill.draper.auto@gmail.com", balance: 0 },
    { id: "u2", email: "bob@gmail.com", balance: 0 },
  ];
}

export function setROOTCA(rootCA: any, identity: any): void {
  ROOT_CA = rootCA;
  ROOT_CA_IDENTITY = identity;
}

export function setRootCALiquidity(amount: number): void {
  rootCALiquidity = amount;
}

export function addRootCALiquidity(amount: number): void {
  rootCALiquidity += amount;
}

