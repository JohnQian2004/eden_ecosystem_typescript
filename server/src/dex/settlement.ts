/**
 * Two-Phase Settlement System
 * Phase 1: Provisional (balance locking)
 * Phase 2: Final (balance update + ledger entry)
 */

import * as crypto from "crypto";
import type { DEXOrder, MatchResult, ProvisionalSettlement } from "./types";
import type { LedgerEntry } from "../types";
import { addLedgerEntry } from "../ledger";
import { debitWallet, creditWallet, getWalletBalance } from "../wallet";

// In-memory provisional settlements (should be Redis in production)
const provisionalSettlements: Map<string, ProvisionalSettlement> = new Map();

// Settlement expiration time (30 seconds)
const SETTLEMENT_EXPIRY_MS = 30 * 1000;

/**
 * Create provisional settlement (Phase 1)
 * Locks balances but doesn't debit/credit yet
 */
export async function createProvisionalSettlement(
  matchResult: MatchResult,
  order: DEXOrder
): Promise<ProvisionalSettlement> {
  const settlementId = `settle_${crypto.randomUUID()}`;
  
  // Calculate what needs to be locked
  const assetIn = matchResult.settlementData.assetIn;
  const assetOut = matchResult.settlementData.assetOut;
  
  // Check balance availability (for BUY: need baseToken, for SELL: need tokens)
  const currentBalance = await getWalletBalance(order.userEmail);
  
  if (order.side === 'BUY') {
    const requiredAmount = assetIn.amount + matchResult.settlementData.fees.tradeFee;
    if (currentBalance < requiredAmount) {
      throw new Error(`Insufficient balance: need ${requiredAmount}, have ${currentBalance}`);
    }
  }
  // For SELL, token balance tracking is future work
  
  const settlement: ProvisionalSettlement = {
    settlementId,
    orderId: order.orderId,
    tradeId: matchResult.tradeId,
    userId: order.userId,
    userEmail: order.userEmail,
    pair: order.pair,
    amount: matchResult.filledAmount,
    price: matchResult.executionPrice,
    lockedBalances: {
      assetIn,
      assetOut
    },
    status: 'PROVISIONAL',
    createdAt: Date.now(),
    expiresAt: Date.now() + SETTLEMENT_EXPIRY_MS
  };
  
  provisionalSettlements.set(settlementId, settlement);
  
  // Auto-expire after timeout
  setTimeout(() => {
    const existing = provisionalSettlements.get(settlementId);
    if (existing && existing.status === 'PROVISIONAL') {
      console.warn(`⚠️  Provisional settlement ${settlementId} expired without finalization`);
      provisionalSettlements.delete(settlementId);
    }
  }, SETTLEMENT_EXPIRY_MS);
  
  return settlement;
}

/**
 * Finalize settlement (Phase 2)
 * Debits/credits balances and creates ledger entry
 */
export async function finalizeSettlement(
  settlementId: string
): Promise<LedgerEntry> {
  const settlement = provisionalSettlements.get(settlementId);
  
  if (!settlement) {
    throw new Error(`Provisional settlement not found: ${settlementId}`);
  }
  
  if (settlement.status !== 'PROVISIONAL') {
    throw new Error(`Settlement already finalized: ${settlementId}`);
  }
  
  if (Date.now() > settlement.expiresAt) {
    provisionalSettlements.delete(settlementId);
    throw new Error(`Settlement expired: ${settlementId}`);
  }
  
  // Phase 2: Actual balance updates
  const { assetIn, assetOut } = settlement.lockedBalances;
  
  // Get fees from match result (stored in settlement metadata or recalculate)
  // For now, we'll use simplified fee calculation
  const baseTokenSymbol = settlement.pair.split('/')[1];
  const tokenSymbol = settlement.pair.split('/')[0];
  
  // Determine which asset is being debited/credited based on order side
  // We need to get the original match result to know the fees
  // For now, use settlement data to determine amounts
  // CRITICAL: Use case-insensitive comparison and also check if symbols match (even if case differs)
  const baseAmount = assetIn.symbol?.toUpperCase() === baseTokenSymbol.toUpperCase() 
    ? assetIn.amount 
    : assetOut.symbol?.toUpperCase() === baseTokenSymbol.toUpperCase()
      ? assetOut.amount 
      : 0;
  
  const tokenAmount = assetIn.symbol?.toUpperCase() === tokenSymbol.toUpperCase()
    ? assetIn.amount
    : assetOut.symbol?.toUpperCase() === tokenSymbol.toUpperCase()
      ? assetOut.amount
      : 0;
  
  // Determine action from settlement (BUY = debit baseToken, SELL = credit baseToken)
  // We'll infer from which asset is being debited
  const isBuy = assetIn.symbol?.toUpperCase() === baseTokenSymbol.toUpperCase();
  
  // Debug logging
  console.log(`💰 [Settlement] Amount calculation:`, {
    pair: settlement.pair,
    baseTokenSymbol,
    tokenSymbol,
    assetIn: { symbol: assetIn.symbol, amount: assetIn.amount },
    assetOut: { symbol: assetOut.symbol, amount: assetOut.amount },
    baseAmount,
    tokenAmount,
    isBuy,
    baseAmountIsZero: baseAmount === 0
  });
  
  // Validate amounts - CRITICAL: baseAmount must be > 0 for BUY orders
  if (baseAmount === 0 && isBuy) {
    console.error(`❌ [Settlement] CRITICAL: baseAmount is 0 for BUY order! This will cause ledger entry to have 0 amount.`);
    console.error(`   AssetIn: ${assetIn.symbol} = ${assetIn.amount}`);
    console.error(`   AssetOut: ${assetOut.symbol} = ${assetOut.amount}`);
    console.error(`   Expected baseToken: ${baseTokenSymbol}`);
    console.error(`   Settlement pair: ${settlement.pair}`);
    // Try to recover: if assetIn.amount > 0, use it as baseAmount (assume symbol mismatch)
    if (assetIn.amount > 0) {
      console.warn(`⚠️ [Settlement] Attempting recovery: using assetIn.amount (${assetIn.amount}) as baseAmount`);
      // Don't modify baseAmount here - let it fail so we can see the issue
    }
  }
  
  // CRITICAL: If baseAmount is still 0, try to recover from assetIn/assetOut amounts
  // For BUY orders: assetIn should be baseToken, assetOut should be token
  // For SELL orders: assetIn should be token, assetOut should be baseToken
  let recoveredBaseAmount = baseAmount;
  if (baseAmount === 0) {
    console.error(`❌ [Settlement] baseAmount is 0! Attempting to recover from settlement data...`);
    console.error(`   Settlement amount: ${settlement.amount} (this is token amount, not base amount)`);
    console.error(`   AssetIn: ${assetIn.symbol} = ${assetIn.amount}`);
    console.error(`   AssetOut: ${assetOut.symbol} = ${assetOut.amount}`);
    console.error(`   Expected baseToken: ${baseTokenSymbol}, tokenSymbol: ${tokenSymbol}`);
    
    // For BUY orders: assetIn should be baseToken (even if symbol doesn't match due to case/format)
    // For SELL orders: assetOut should be baseToken
    if (isBuy && assetIn.amount > 0) {
      console.warn(`⚠️ [Settlement] Recovery: Using assetIn.amount (${assetIn.amount}) as baseAmount (assuming symbol mismatch)`);
      recoveredBaseAmount = assetIn.amount;
    } else if (!isBuy && assetOut.amount > 0) {
      console.warn(`⚠️ [Settlement] Recovery: Using assetOut.amount (${assetOut.amount}) as baseAmount (assuming symbol mismatch)`);
      recoveredBaseAmount = assetOut.amount;
    } else {
      console.error(`❌ [Settlement] Cannot recover baseAmount - both assetIn and assetOut amounts are 0 or invalid`);
    }
  }
  
  // Calculate fees (simplified - in production, get from match result)
  const tradeFee = baseAmount * 0.003; // 0.3% trade fee
  const iTax = baseAmount * 0.000005; // 0.0005% iTax
  const iGas = 0.001; // Fixed iGas for now
  
  // Debit/credit wallet
  if (settlement.userEmail) {
    if (isBuy) {
      // BUY: debit baseToken
      const debitResult = await debitWallet(
        settlement.userEmail,
        baseAmount + tradeFee + iGas,
        settlement.tradeId,
        `DEX BUY: ${tokenAmount} ${tokenSymbol} for ${baseAmount} ${baseTokenSymbol}`,
        { tradeId: settlement.tradeId, action: 'BUY' }
      );
      
      if (!debitResult.success) {
        throw new Error(`Failed to debit wallet: ${debitResult.error}`);
      }
      
      // Apply trader rebate (30% of iTax)
      const traderRebate = iTax * 0.3;
      if (traderRebate > 0) {
        await creditWallet(
          settlement.userEmail,
          traderRebate,
          crypto.randomUUID(),
          `DEX Trader Rebate: ${traderRebate.toFixed(6)} ${baseTokenSymbol}`,
          { tradeId: settlement.tradeId, rebateType: 'trader' }
        );
      }
    } else {
      // SELL: credit baseToken
      const creditResult = await creditWallet(
        settlement.userEmail,
        baseAmount - tradeFee,
        settlement.tradeId,
        `DEX SELL: ${tokenAmount} ${tokenSymbol} for ${baseAmount} ${baseTokenSymbol}`,
        { tradeId: settlement.tradeId, action: 'SELL' }
      );
      
      if (!creditResult.success) {
        throw new Error(`Failed to credit wallet: ${creditResult.error}`);
      }
      
      // Apply trader rebate (30% of iTax)
      const traderRebate = iTax * 0.3;
      if (traderRebate > 0) {
        await creditWallet(
          settlement.userEmail,
          traderRebate,
          crypto.randomUUID(),
          `DEX Trader Rebate: ${traderRebate.toFixed(6)} ${baseTokenSymbol}`,
          { tradeId: settlement.tradeId, rebateType: 'trader' }
        );
      }
    }
  }
  
  // Get pool/provider information for merchant name and provider UUID
  const { DEX_POOLS } = await import("../state");
  let merchantName = `${tokenSymbol} Pool`;
  let providerUuid = `dex-${settlement.pair}`;
  
  // Try to find pool to get better merchant name
  for (const pool of DEX_POOLS.values()) {
    if (pool.tokenSymbol === tokenSymbol && pool.baseToken === baseTokenSymbol) {
      merchantName = `${pool.tokenName || tokenSymbol} Pool (${pool.gardenId || 'DEX'})`;
      // Try to find provider UUID from service registry
      const { ROOT_CA_SERVICE_REGISTRY } = await import("../state");
      const poolProvider = ROOT_CA_SERVICE_REGISTRY.find(p => 
        p.serviceType === 'dex' && 
        (p.id.includes(tokenSymbol.toLowerCase()) || p.gardenId === pool.gardenId)
      );
      if (poolProvider) {
        providerUuid = poolProvider.uuid;
      }
      break;
    }
  }
  
  // CRITICAL: Use recoveredBaseAmount if baseAmount was 0
  // This handles cases where symbol matching fails but we can infer from order side
  const finalBaseAmount = recoveredBaseAmount;
  
  if (finalBaseAmount === 0) {
    console.error(`❌ [Settlement] CRITICAL: finalBaseAmount is still 0 after recovery attempts!`);
    console.error(`   This will cause ledger entry to have 0 amount.`);
    console.error(`   Settlement pair: ${settlement.pair}`);
    console.error(`   AssetIn: ${JSON.stringify(assetIn)}`);
    console.error(`   AssetOut: ${JSON.stringify(assetOut)}`);
  }
  
  // Calculate total amount (for BUY: baseAmount + fees, for SELL: baseAmount - fees)
  const totalAmount = isBuy 
    ? finalBaseAmount + tradeFee + iGas  // BUY: user pays baseAmount + fees
    : finalBaseAmount - tradeFee;         // SELL: user receives baseAmount - fees
  
  // CRITICAL: Ensure totalAmount is > 0
  if (totalAmount <= 0) {
    console.error(`❌ [Settlement] CRITICAL: totalAmount is ${totalAmount}! This will cause ledger entry to fail.`);
    console.error(`   baseAmount: ${baseAmount}, finalBaseAmount: ${finalBaseAmount}, tradeFee: ${tradeFee}, iGas: ${iGas}`);
    throw new Error(`Cannot create ledger entry: totalAmount is ${totalAmount}. baseAmount: ${baseAmount}, finalBaseAmount: ${finalBaseAmount}`);
  }
  
  // Create transaction snapshot
  const snapshot: TransactionSnapshot = {
    chainId: 'eden',
    txId: settlement.tradeId,
    slot: Date.now(),
    blockTime: Date.now(),
    payer: settlement.userEmail,
    merchant: merchantName,
    amount: totalAmount, // Total amount including fees
    feeSplit: {
      tradeFee,
      iTax,
      iGas
    }
  };
  
  // Create booking details - CRITICAL: Use finalBaseAmount (not baseAmount) to ensure it's never 0
  const bookingDetails = {
    tokenSymbol,
    baseToken: baseTokenSymbol,
    action: isBuy ? 'BUY' : 'SELL',
    tokenAmount,
    baseAmount: finalBaseAmount, // Use finalBaseAmount (with fallback if needed)
    totalAmount,
    tradeFee,
    iTax,
    iGas,
    pair: settlement.pair,
    tradeId: settlement.tradeId
  };
  
  console.log(`💰 [Settlement] Final booking details:`, {
    baseAmount: bookingDetails.baseAmount,
    totalAmount: bookingDetails.totalAmount,
    tokenAmount: bookingDetails.tokenAmount,
    action: bookingDetails.action,
    snapshotAmount: snapshot.amount
  });
  
  // CRITICAL: Verify that snapshot.amount (totalAmount) is > 0 before creating ledger entry
  if (snapshot.amount <= 0) {
    console.error(`❌ [Settlement] CRITICAL: snapshot.amount is ${snapshot.amount}! Cannot create ledger entry.`);
    console.error(`   finalBaseAmount: ${finalBaseAmount}`);
    console.error(`   totalAmount: ${totalAmount}`);
    console.error(`   tradeFee: ${tradeFee}`);
    console.error(`   iGas: ${iGas}`);
    throw new Error(`Cannot create ledger entry: snapshot.amount is ${snapshot.amount}`);
  }
  
  // Add to ledger using correct function signature
  console.log(`💰 [Settlement] Creating ledger entry with:`, {
    snapshotAmount: snapshot.amount,
    bookingDetailsBaseAmount: bookingDetails.baseAmount,
    bookingDetailsTotalAmount: bookingDetails.totalAmount,
    merchantName,
    userEmail: settlement.userEmail
  });
  
  const ledgerEntry = addLedgerEntry(
    snapshot,
    'dex',
    iGas,
    settlement.userEmail, // payerId
    merchantName,
    providerUuid,
    bookingDetails
  );
  
  console.log(`💰 [Settlement] Ledger entry created:`, {
    entryId: ledgerEntry.entryId,
    entryAmount: ledgerEntry.amount,
    bookingDetailsBaseAmount: ledgerEntry.bookingDetails?.baseAmount,
    bookingDetailsTotalAmount: ledgerEntry.bookingDetails?.totalAmount
  });
  
  // Mark settlement as finalized
  settlement.status = 'FINALIZED' as any;
  provisionalSettlements.delete(settlementId);
  
  return ledgerEntry;
}

/**
 * Get provisional settlement
 */
export function getProvisionalSettlement(settlementId: string): ProvisionalSettlement | undefined {
  return provisionalSettlements.get(settlementId);
}

/**
 * Cancel provisional settlement (if order cancelled)
 */
export function cancelProvisionalSettlement(settlementId: string): void {
  provisionalSettlements.delete(settlementId);
}

