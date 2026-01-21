/**
 * Accountant Service
 * Tracks fee payments, total iGas, and financial metrics for ROOT CA
 * Extends Cashier functionality to provide comprehensive financial tracking
 */

import * as fs from "fs";
import * as path from "path";

// Accountant state interface
export interface AccountantState {
  // Fee tracking
  totalIGas: number;
  totalITax: number;
  totalRootCAFees: number;
  totalIndexerFees: number;
  totalProviderFees: number;
  totalCashierFees: number;
  
  // Revenue breakdown by service type
  revenueByServiceType: Record<string, {
    count: number;
    totalAmount: number;
    totalIGas: number;
    totalITax: number;
    totalRootCAFees: number;
    totalIndexerFees: number;
    totalProviderFees: number;
    totalCashierFees: number;
  }>;
  
  // Timestamps
  lastUpdated: number;
  createdAt: number;
}

// Global accountant state
let ACCOUNTANT_STATE: AccountantState = {
  totalIGas: 0,
  totalITax: 0,
  totalRootCAFees: 0,
  totalIndexerFees: 0,
  totalProviderFees: 0,
  totalCashierFees: 0,
  revenueByServiceType: {},
  lastUpdated: Date.now(),
  createdAt: Date.now()
};

// Persistence file path
const ACCOUNTANT_PERSISTENCE_FILE = path.join(__dirname, '..', 'eden-accountant-persistence.json');

/**
 * Initialize Accountant Service
 */
export function initializeAccountant(): void {
  loadAccountantState();
  console.log(`📊 [Accountant] Initialized. Total iGas: ${ACCOUNTANT_STATE.totalIGas.toFixed(6)}`);
}

/**
 * Load accountant state from persistence file
 */
function loadAccountantState(): void {
  try {
    if (fs.existsSync(ACCOUNTANT_PERSISTENCE_FILE)) {
      const fileContent = fs.readFileSync(ACCOUNTANT_PERSISTENCE_FILE, 'utf-8');
      const persisted = JSON.parse(fileContent);
      
      // Restore state
      ACCOUNTANT_STATE = {
        totalIGas: persisted.totalIGas || 0,
        totalITax: persisted.totalITax || 0,
        totalRootCAFees: persisted.totalRootCAFees || 0,
        totalIndexerFees: persisted.totalIndexerFees || 0,
        totalProviderFees: persisted.totalProviderFees || 0,
        totalCashierFees: persisted.totalCashierFees || 0,
        revenueByServiceType: persisted.revenueByServiceType || {},
        lastUpdated: persisted.lastUpdated || Date.now(),
        createdAt: persisted.createdAt || Date.now()
      };
      
      console.log(`📊 [Accountant] Loaded state from persistence`);
      console.log(`   Total iGas: ${ACCOUNTANT_STATE.totalIGas.toFixed(6)}`);
      console.log(`   Total iTax: ${ACCOUNTANT_STATE.totalITax.toFixed(6)}`);
      console.log(`   Total ROOT CA Fees: ${ACCOUNTANT_STATE.totalRootCAFees.toFixed(6)}`);
      console.log(`   Total Indexer Fees: ${ACCOUNTANT_STATE.totalIndexerFees.toFixed(6)}`);
    }
  } catch (err: any) {
    console.warn(`⚠️  [Accountant] Failed to load state: ${err.message}`);
  }
}

/**
 * Save accountant state to persistence file
 */
export function saveAccountantState(): void {
  try {
    ACCOUNTANT_STATE.lastUpdated = Date.now();
    
    const data = {
      ...ACCOUNTANT_STATE,
      lastSaved: new Date().toISOString()
    };
    
    fs.writeFileSync(ACCOUNTANT_PERSISTENCE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`💾 [Accountant] State saved to persistence`);
  } catch (err: any) {
    console.error(`❌ [Accountant] Failed to save state: ${err.message}`);
  }
}

/**
 * Record fee payment from a ledger entry
 * Called when a ledger entry is processed and fees are calculated
 */
export function recordFeePayment(
  serviceType: string,
  iGas: number,
  iTax: number,
  rootCAFee: number,
  indexerFee: number,
  providerFee: number = 0,
  cashierFee: number = 0
): void {
  // Update totals
  ACCOUNTANT_STATE.totalIGas += iGas;
  ACCOUNTANT_STATE.totalITax += iTax;
  ACCOUNTANT_STATE.totalRootCAFees += rootCAFee;
  ACCOUNTANT_STATE.totalIndexerFees += indexerFee;
  ACCOUNTANT_STATE.totalProviderFees += providerFee;
  ACCOUNTANT_STATE.totalCashierFees += cashierFee;
  
  // Update service type breakdown
  if (!ACCOUNTANT_STATE.revenueByServiceType[serviceType]) {
    ACCOUNTANT_STATE.revenueByServiceType[serviceType] = {
      count: 0,
      totalAmount: 0,
      totalIGas: 0,
      totalITax: 0,
      totalRootCAFees: 0,
      totalIndexerFees: 0,
      totalProviderFees: 0,
      totalCashierFees: 0
    };
  }
  
  const serviceStats = ACCOUNTANT_STATE.revenueByServiceType[serviceType];
  serviceStats.count++;
  serviceStats.totalIGas += iGas;
  serviceStats.totalITax += iTax;
  serviceStats.totalRootCAFees += rootCAFee;
  serviceStats.totalIndexerFees += indexerFee;
  serviceStats.totalProviderFees += providerFee;
  serviceStats.totalCashierFees += cashierFee;
  
  ACCOUNTANT_STATE.lastUpdated = Date.now();
  
  console.log(`📊 [Accountant] Recorded fees for ${serviceType}: iGas=${iGas.toFixed(6)}, iTax=${iTax.toFixed(6)}, ROOT CA=${rootCAFee.toFixed(6)}, Indexer=${indexerFee.toFixed(6)}`);
}

/**
 * Get accountant state (for API endpoints)
 */
export function getAccountantState(): AccountantState {
  return { ...ACCOUNTANT_STATE };
}

/**
 * Get financial summary
 */
export function getFinancialSummary(): {
  totalIGas: number;
  totalITax: number;
  totalRootCAFees: number;
  totalIndexerFees: number;
  totalProviderFees: number;
  totalCashierFees: number;
  totalRevenue: number;
  revenueByServiceType: Record<string, any>;
} {
  // Total revenue is economic fees (cashier/provider/eden/indexer), not iGas itself.
  const totalRevenue = ACCOUNTANT_STATE.totalRootCAFees + 
                       ACCOUNTANT_STATE.totalIndexerFees + 
                       ACCOUNTANT_STATE.totalProviderFees +
                       ACCOUNTANT_STATE.totalCashierFees;
  
  return {
    totalIGas: ACCOUNTANT_STATE.totalIGas,
    totalITax: ACCOUNTANT_STATE.totalITax,
    totalRootCAFees: ACCOUNTANT_STATE.totalRootCAFees,
    totalIndexerFees: ACCOUNTANT_STATE.totalIndexerFees,
    totalProviderFees: ACCOUNTANT_STATE.totalProviderFees,
    totalCashierFees: ACCOUNTANT_STATE.totalCashierFees,
    totalRevenue,
    revenueByServiceType: ACCOUNTANT_STATE.revenueByServiceType
  };
}

