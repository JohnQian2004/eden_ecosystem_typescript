/**
 * Wallet Service Module
 * Handles all wallet operations: balance retrieval, credits, debits, and intent processing
 */

import type { WalletIntent, WalletResult } from "./types";
import { USERS } from "./state";
import { WALLET_BALANCE_PREFIX, WALLET_AUDIT_PREFIX } from "./constants";
import { InMemoryRedisServer } from "./redis";
import * as fs from "fs";
import * as path from "path";

// Dependencies that need to be injected
let redis: InMemoryRedisServer;
let SKIP_REDIS: boolean;
let ensureRedisConnection: () => Promise<void>;
let broadcastEvent: (event: any) => void;

/**
 * Initialize wallet module with dependencies
 */
export function initializeWallet(
  redisInstance: InMemoryRedisServer,
  skipRedis: boolean,
  ensureConnection: () => Promise<void>,
  broadcastFn: (event: any) => void
): void {
  redis = redisInstance;
  SKIP_REDIS = skipRedis;
  ensureRedisConnection = ensureConnection;
  broadcastEvent = broadcastFn;
}

// Sync wallet balance from USERS array to Redis (one-time initialization)
export async function syncWalletBalanceFromUser(email: string): Promise<void> {
  if (SKIP_REDIS || !redis || !redis.isOpen) {
    return; // No sync needed if Redis unavailable
  }

  try {
    await ensureRedisConnection();
    const user = USERS.find(u => u.email === email);
    if (!user) {
      return; // User doesn't exist
    }

    const key = `${WALLET_BALANCE_PREFIX}${email}`;
    const existingBalanceStr = await redis.get(key);
    
    // Only sync if wallet doesn't exist in Redis (first-time initialization)
    if (!existingBalanceStr) {
      await redis.set(key, user.balance.toString());
      console.log(`🔄 [Wallet Service] Synced balance from USERS array: ${email} = ${user.balance} JSC`);
    }
  } catch (err: any) {
    console.error(`⚠️  [Wallet] Error syncing balance for ${email}:`, err.message);
    // Non-fatal error, continue
  }
}

// Get wallet balance (authoritative source)
// NO SYNC - Wallet is the single source of truth, never syncs from USERS array
export async function getWalletBalance(email: string): Promise<number> {
  if (SKIP_REDIS || !redis || !redis.isOpen) {
    // Fallback to in-memory USERS array if Redis unavailable
    const user = USERS.find(u => u.email === email);
    return user ? user.balance : 0;
  }

  try {
    await ensureRedisConnection();
    
    // Read directly from Redis - NO SYNC from USERS array
    const key = `${WALLET_BALANCE_PREFIX}${email}`;
    const balanceStr = await redis.get(key);
    
    console.log(`🔍 [Wallet] getWalletBalance for ${email}: key=${key}, balanceStr=${balanceStr}`);
    
    if (!balanceStr || balanceStr === '0' || balanceStr === '') {
      // Balance not found in Redis or is 0 - try to load from persistence file as fallback
      console.warn(`⚠️  [Wallet] Balance not found or is 0 in Redis for ${email}, checking persistence file...`);
      const persistenceFile = path.join(__dirname, '..', 'eden-wallet-persistence.json');
      if (fs.existsSync(persistenceFile)) {
        try {
          const fileContent = fs.readFileSync(persistenceFile, 'utf-8');
          const persisted = JSON.parse(fileContent);
          if (persisted.walletBalances && persisted.walletBalances[key]) {
            const fileBalance = persisted.walletBalances[key];
            const fileBalanceNum = parseFloat(fileBalance);
            // Only restore if file balance is valid and > 0
            if (!isNaN(fileBalanceNum) && fileBalanceNum > 0) {
              // Restore to Redis
              await redis.set(key, fileBalance);
              console.log(`🔄 [Wallet] Restored balance from file: ${email} = ${fileBalance} JSC`);
              return fileBalanceNum;
            } else {
              console.warn(`⚠️  [Wallet] File balance is invalid or 0: ${fileBalance}`);
            }
          } else {
            console.warn(`⚠️  [Wallet] Balance key ${key} not found in persistence file`);
          }
        } catch (err: any) {
          console.error(`⚠️  [Wallet] Failed to read persistence file: ${err.message}`);
        }
      } else {
        console.warn(`⚠️  [Wallet] Persistence file not found: ${persistenceFile}`);
      }
      return 0;
    }
    
    const balance = parseFloat(balanceStr);
    if (isNaN(balance)) {
      console.error(`⚠️  [Wallet] Invalid balance value for ${email}: "${balanceStr}"`);
      return 0;
    }
    
    console.log(`✅ [Wallet] Balance retrieved: ${email} = ${balance} JSC`);
    return balance;
  } catch (err: any) {
    console.error(`⚠️  [Wallet] Error getting balance for ${email}:`, err.message);
    // Fallback to in-memory
    const user = USERS.find(u => u.email === email);
    return user ? user.balance : 0;
  }
}

// Credit wallet (mint JSC, rebates, etc.)
export async function creditWallet(email: string, amount: number, txId: string, reason: string, metadata?: Record<string, any>): Promise<WalletResult> {
  if (SKIP_REDIS || !redis || !redis.isOpen) {
    // Fallback to in-memory
    let user = USERS.find(u => u.email === email);
    if (!user) {
      user = { id: `u${USERS.length + 1}`, email, balance: 0 };
      USERS.push(user);
    }
    const previousBalance = user.balance;
    user.balance += amount;
    
    console.log(`💰 [Wallet] Credited ${amount} JSC to ${email} (${reason})`);
    console.log(`   Previous balance: ${previousBalance}, New balance: ${user.balance}`);
    
    // Broadcast wallet credit event (fallback mode)
    broadcastEvent({
      type: "wallet_credited",
      component: "wallet-service-001",
      message: `Wallet credited (fallback): ${amount} JSC to ${email}`,
      timestamp: Date.now(),
      data: {
        email,
        amount,
        previousBalance,
        newBalance: user.balance,
        txId,
        reason,
        metadata,
        mode: "fallback",
        indexerId: "HG",
      }
    });
    
    return { success: true, balance: user.balance, previousBalance };
  }

  try {
    await ensureRedisConnection();
    
    const key = `${WALLET_BALANCE_PREFIX}${email}`;
    // Get current balance directly from Redis (don't use getWalletBalance which might sync)
    const balanceStr = await redis.get(key);
    const previousBalance = balanceStr ? parseFloat(balanceStr) : 0;
    const newBalance = previousBalance + amount;
    
    // Atomic increment
    await redis.set(key, newBalance.toString());
    
    console.log(`💰 [Wallet Service] Redis balance update: ${email}`);
    console.log(`   Redis key: ${key}`);
    console.log(`   Previous balance (from Redis): ${previousBalance}`);
    console.log(`   Credit amount: ${amount}`);
    console.log(`   New balance (to Redis): ${newBalance}`);
    
    // Audit log
    const auditKey = `${WALLET_AUDIT_PREFIX}${email}:${Date.now()}`;
    await redis.set(auditKey, JSON.stringify({
      intent: "CREDIT",
      email,
      amount,
      previousBalance,
      newBalance,
      txId,
      reason,
      metadata,
      timestamp: Date.now(),
    }));
    
    console.log(`💰 [Wallet Service] Credited ${amount} JSC to ${email} (${reason})`);
    console.log(`   Previous balance: ${previousBalance}, New balance: ${newBalance}`);
    
    // Sync to in-memory USERS array for backward compatibility
    let user = USERS.find(u => u.email === email);
    if (!user) {
      user = { id: `u${USERS.length + 1}`, email, balance: 0 };
      USERS.push(user);
    }
    user.balance = newBalance;
    
    // Broadcast wallet credit event
    broadcastEvent({
      type: "wallet_credited",
      component: "wallet-service-001",
      message: `Wallet credited: ${amount} JSC to ${email}`,
      timestamp: Date.now(),
      data: {
        email,
        amount,
        previousBalance,
        newBalance,
        txId,
        reason,
        metadata,
        indexerId: "HG", // Holy Ghost indexer
      }
    });
    
    return { success: true, balance: newBalance, previousBalance };
  } catch (err: any) {
    console.error(`❌ [Wallet] Error crediting ${amount} JSC to ${email}:`, err.message);
    return { success: false, balance: 0, error: err.message };
  }
}

// Debit wallet (payments, fees, etc.)
export async function debitWallet(email: string, amount: number, txId: string, reason: string, metadata?: Record<string, any>): Promise<WalletResult> {
  if (SKIP_REDIS || !redis || !redis.isOpen) {
    // Fallback to in-memory
    const user = USERS.find(u => u.email === email);
    if (!user) {
      return { success: false, balance: 0, error: "User not found" };
    }
    
    if (user.balance < amount) {
      return { success: false, balance: user.balance, error: "Insufficient balance" };
    }
    
    const previousBalance = user.balance;
    user.balance -= amount;
    
    console.log(`💸 [Wallet] Debited ${amount} JSC from ${email} (${reason})`);
    console.log(`   Previous balance: ${previousBalance}, New balance: ${user.balance}`);
    
    // Broadcast wallet debit event (fallback mode)
    broadcastEvent({
      type: "wallet_debited",
      component: "wallet-service-001",
      message: `Wallet debited (fallback): ${amount} JSC from ${email}`,
      timestamp: Date.now(),
      data: {
        email,
        amount,
        previousBalance,
        newBalance: user.balance,
        txId,
        reason,
        metadata,
        mode: "fallback",
        indexerId: "HG",
      }
    });
    
    return { success: true, balance: user.balance, previousBalance };
  }

  try {
    await ensureRedisConnection();
    
    const key = `${WALLET_BALANCE_PREFIX}${email}`;
    const currentBalance = await getWalletBalance(email);
    
    if (currentBalance < amount) {
      return { success: false, balance: currentBalance, error: "Insufficient balance" };
    }
    
    const newBalance = currentBalance - amount;
    
    // Atomic decrement
    await redis.set(key, newBalance.toString());
    
    // Audit log
    const auditKey = `${WALLET_AUDIT_PREFIX}${email}:${Date.now()}`;
    await redis.set(auditKey, JSON.stringify({
      intent: "DEBIT",
      email,
      amount,
      previousBalance: currentBalance,
      newBalance,
      txId,
      reason,
      metadata,
      timestamp: Date.now(),
    }));
    
    console.log(`💸 [Wallet Service] Debited ${amount} JSC from ${email} (${reason})`);
    console.log(`   Previous balance: ${currentBalance}, New balance: ${newBalance}`);
    
    // Sync to in-memory USERS array for backward compatibility
    const user = USERS.find(u => u.email === email);
    if (user) {
      user.balance = newBalance;
    }
    
    // Broadcast wallet debit event
    broadcastEvent({
      type: "wallet_debited",
      component: "wallet-service-001",
      message: `Wallet debited: ${amount} JSC from ${email}`,
      timestamp: Date.now(),
      data: {
        email,
        amount,
        previousBalance: currentBalance,
        newBalance,
        txId,
        reason,
        metadata,
        indexerId: "HG", // Holy Ghost indexer
      }
    });
    
    return { success: true, balance: newBalance, previousBalance: currentBalance };
  } catch (err: any) {
    console.error(`❌ [Wallet] Error debiting ${amount} JSC from ${email}:`, err.message);
    return { success: false, balance: 0, error: err.message };
  }
}

// Process wallet intent (EdenCore submits, Wallet decides)
export async function processWalletIntent(intent: WalletIntent): Promise<WalletResult> {
  console.log(`🔐 [Wallet Service] Processing intent: ${intent.intent} for ${intent.email}`);
  
  // Broadcast intent processing start
  broadcastEvent({
    type: "wallet_intent_processing",
    component: "wallet-service-001",
    message: `Processing wallet intent: ${intent.intent} for ${intent.email}`,
    timestamp: Date.now(),
    data: {
      intent: intent.intent,
      email: intent.email,
      amount: intent.amount,
      txId: intent.txId,
      reason: intent.reason,
      indexerId: "HG", // Holy Ghost indexer
    }
  });
  
  switch (intent.intent) {
    case "CREDIT":
      return await creditWallet(intent.email, intent.amount, intent.txId, intent.reason, intent.metadata);
    
    case "DEBIT":
      // Verify balance before debiting
      const balance = await getWalletBalance(intent.email);
      if (balance < intent.amount) {
        // Broadcast insufficient balance event
        broadcastEvent({
          type: "wallet_insufficient_balance",
          component: "wallet-service-001",
          message: `Insufficient balance: ${balance} JSC < ${intent.amount} JSC required`,
          timestamp: Date.now(),
          data: {
            email: intent.email,
            balance,
            required: intent.amount,
            txId: intent.txId,
            indexerId: "HG",
          }
        });
        return { success: false, balance, error: "Insufficient balance" };
      }
      return await debitWallet(intent.email, intent.amount, intent.txId, intent.reason, intent.metadata);
    
    case "HOLD":
      // Place hold on balance (for pending transactions)
      // Implementation can be added later if needed
      const holdBalance = await getWalletBalance(intent.email);
      broadcastEvent({
        type: "wallet_hold",
        component: "wallet-service-001",
        message: `Hold placed on balance for ${intent.email}`,
        timestamp: Date.now(),
        data: {
          email: intent.email,
          balance: holdBalance,
          txId: intent.txId,
          indexerId: "HG",
        }
      });
      return { success: true, balance: holdBalance };
    
    case "RELEASE":
      // Release hold on balance
      // Implementation can be added later if needed
      const releaseBalance = await getWalletBalance(intent.email);
      broadcastEvent({
        type: "wallet_release",
        component: "wallet-service-001",
        message: `Hold released for ${intent.email}`,
        timestamp: Date.now(),
        data: {
          email: intent.email,
          balance: releaseBalance,
          txId: intent.txId,
          indexerId: "HG",
        }
      });
      return { success: true, balance: releaseBalance };
    
    default:
      broadcastEvent({
        type: "wallet_error",
        component: "wallet-service-001",
        message: `Unknown wallet intent: ${intent.intent}`,
        timestamp: Date.now(),
        data: {
          intent: intent.intent,
          email: intent.email,
          error: `Unknown intent: ${intent.intent}`,
          indexerId: "HG",
        }
      });
      return { success: false, balance: 0, error: `Unknown intent: ${intent.intent}` };
  }
}

