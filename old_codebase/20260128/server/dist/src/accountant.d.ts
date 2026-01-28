/**
 * Accountant Service
 * Tracks fee payments, total iGas, and financial metrics for ROOT CA
 * Extends Cashier functionality to provide comprehensive financial tracking
 */
export interface AccountantState {
    totalIGas: number;
    totalITax: number;
    totalRootCAFees: number;
    totalIndexerFees: number;
    totalProviderFees: number;
    totalCashierFees: number;
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
    lastUpdated: number;
    createdAt: number;
}
/**
 * Initialize Accountant Service
 */
export declare function initializeAccountant(): void;
/**
 * Save accountant state to persistence file
 */
export declare function saveAccountantState(): void;
/**
 * Record fee payment from a ledger entry
 * Called when a ledger entry is processed and fees are calculated
 */
export declare function recordFeePayment(serviceType: string, iGas: number, iTax: number, rootCAFee: number, indexerFee: number, providerFee?: number, cashierFee?: number): void;
/**
 * Get accountant state (for API endpoints)
 */
export declare function getAccountantState(): AccountantState;
/**
 * Get financial summary
 */
export declare function getFinancialSummary(): {
    totalIGas: number;
    totalITax: number;
    totalRootCAFees: number;
    totalIndexerFees: number;
    totalProviderFees: number;
    totalCashierFees: number;
    totalRevenue: number;
    revenueByServiceType: Record<string, any>;
};
//# sourceMappingURL=accountant.d.ts.map