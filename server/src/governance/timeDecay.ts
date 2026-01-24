/**
 * Time-Decay Trust & Permissions System (v1.24)
 * 
 * Implements time-based decay for trust scores and permissions
 */

import type { TrustScore, Permission, TimeDecayConfig } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Calculate current trust score with time decay
 */
export function calculateDecayedTrust(trust: TrustScore, currentTime: number = Date.now()): number {
  if (!trust.decayRate || trust.decayRate === 0) {
    return trust.score; // No decay
  }
  
  const timeElapsed = (currentTime - trust.lastUpdated) / 1000; // Convert to seconds
  const decayedScore = trust.initialScore * Math.exp(-trust.decayRate * timeElapsed);
  
  return Math.max(0, decayedScore); // Trust cannot go below 0
}

/**
 * Calculate current permission value with time decay
 */
export function calculateDecayedPermission(
  permission: Permission,
  currentTime: number = Date.now()
): number {
  if (!permission.decayRate || permission.decayRate === 0) {
    return permission.currentValue; // No decay
  }
  
  const timeElapsed = (currentTime - (permission.grantedAt)) / 1000; // Convert to seconds
  const decayedValue = permission.initialValue * Math.exp(-permission.decayRate * timeElapsed);
  
  return Math.max(0, decayedValue); // Permission cannot go below 0
}

/**
 * Check if trust requires renewal
 */
export function checkTrustRenewal(trust: TrustScore, currentTime: number = Date.now()): boolean {
  if (!trust.renewalDeadline) {
    return false;
  }
  
  return currentTime >= trust.renewalDeadline;
}

/**
 * Check if permission requires renewal
 */
export function checkPermissionRenewal(permission: Permission, currentTime: number = Date.now()): boolean {
  if (!permission.renewalDeadline) {
    return false;
  }
  
  return currentTime >= permission.renewalDeadline;
}

/**
 * Calculate renewal deadline based on decay rate
 */
export function calculateRenewalDeadline(
  decayRate: number,
  renewalPeriod: number,
  startTime: number = Date.now()
): number {
  return startTime + (renewalPeriod * 1000); // Convert seconds to milliseconds
}

/**
 * Trust Score Manager
 */
class TrustScoreManager {
  private trustScores: Map<string, TrustScore> = new Map();
  private trustIndexPath: string;
  
  constructor(dataPath: string = './data') {
    this.trustIndexPath = path.join(dataPath, 'trust-scores.json');
    this.loadTrustScores();
  }
  
  private loadTrustScores(): void {
    try {
      if (fs.existsSync(this.trustIndexPath)) {
        const data = fs.readFileSync(this.trustIndexPath, 'utf-8');
        const scores: TrustScore[] = JSON.parse(data);
        scores.forEach(score => {
          const key = this.getKey(score.entityId, score.entityType, score.trustType);
          this.trustScores.set(key, score);
        });
        console.log(`✅ [TrustManager] Loaded ${scores.length} trust scores`);
      }
    } catch (error: any) {
      console.error(`❌ [TrustManager] Failed to load trust scores:`, error.message);
    }
  }
  
  private saveTrustScores(): void {
    try {
      const scores = Array.from(this.trustScores.values());
      fs.writeFileSync(this.trustIndexPath, JSON.stringify(scores, null, 2), 'utf-8');
    } catch (error: any) {
      console.error(`❌ [TrustManager] Failed to save trust scores:`, error.message);
    }
  }
  
  private getKey(entityId: string, entityType: string, trustType: string): string {
    return `${entityId}:${entityType}:${trustType}`;
  }
  
  getTrustScore(entityId: string, entityType: string, trustType: string): TrustScore | undefined {
    const key = this.getKey(entityId, entityType, trustType);
    return this.trustScores.get(key);
  }
  
  getCurrentTrustScore(entityId: string, entityType: string, trustType: string): number {
    const trust = this.getTrustScore(entityId, entityType, trustType);
    if (!trust) {
      return 0; // Default trust score
    }
    
    return calculateDecayedTrust(trust);
  }
  
  updateTrustScore(trust: TrustScore): void {
    const key = this.getKey(trust.entityId, trust.entityType, trust.trustType);
    trust.lastUpdated = Date.now();
    this.trustScores.set(key, trust);
    this.saveTrustScores();
  }
  
  createTrustScore(
    entityId: string,
    entityType: 'USER' | 'GARDEN' | 'SERVICE_PROVIDER',
    trustType: 'TRANSACTION' | 'IDENTITY' | 'SERVICE',
    initialScore: number,
    decayRate: number,
    renewalPeriod?: number
  ): TrustScore {
    const trust: TrustScore = {
      entityId,
      entityType,
      trustType,
      score: initialScore,
      initialScore,
      lastUpdated: Date.now(),
      decayRate,
      renewalRequired: false,
      renewalDeadline: renewalPeriod ? calculateRenewalDeadline(decayRate, renewalPeriod) : undefined
    };
    
    this.updateTrustScore(trust);
    return trust;
  }
}

/**
 * Permission Manager
 */
class PermissionManager {
  private permissions: Map<string, Permission> = new Map();
  private permissionIndexPath: string;
  
  constructor(dataPath: string = './data') {
    this.permissionIndexPath = path.join(dataPath, 'permissions.json');
    this.loadPermissions();
  }
  
  private loadPermissions(): void {
    try {
      if (fs.existsSync(this.permissionIndexPath)) {
        const data = fs.readFileSync(this.permissionIndexPath, 'utf-8');
        const permissions: Permission[] = JSON.parse(data);
        permissions.forEach(perm => {
          this.permissions.set(perm.permissionId, perm);
        });
        console.log(`✅ [PermissionManager] Loaded ${permissions.length} permissions`);
      }
    } catch (error: any) {
      console.error(`❌ [PermissionManager] Failed to load permissions:`, error.message);
    }
  }
  
  private savePermissions(): void {
    try {
      const permissions = Array.from(this.permissions.values());
      fs.writeFileSync(this.permissionIndexPath, JSON.stringify(permissions, null, 2), 'utf-8');
    } catch (error: any) {
      console.error(`❌ [PermissionManager] Failed to save permissions:`, error.message);
    }
  }
  
  getPermission(permissionId: string): Permission | undefined {
    return this.permissions.get(permissionId);
  }
  
  getCurrentPermissionValue(permissionId: string): number {
    const permission = this.getPermission(permissionId);
    if (!permission) {
      return 0;
    }
    
    return calculateDecayedPermission(permission);
  }
  
  grantPermission(permission: Permission): void {
    this.permissions.set(permission.permissionId, permission);
    this.savePermissions();
  }
  
  revokePermission(permissionId: string): boolean {
    const deleted = this.permissions.delete(permissionId);
    if (deleted) {
      this.savePermissions();
    }
    return deleted;
  }
  
  getPermissionsByEntity(entityId: string, entityType: string): Permission[] {
    return Array.from(this.permissions.values()).filter(
      p => p.entityId === entityId && p.entityType === entityType
    );
  }
}

// Singleton instances
let trustManagerInstance: TrustScoreManager | null = null;
let permissionManagerInstance: PermissionManager | null = null;

export function initializeTimeDecay(dataPath?: string): void {
  if (!trustManagerInstance) {
    trustManagerInstance = new TrustScoreManager(dataPath);
  }
  if (!permissionManagerInstance) {
    permissionManagerInstance = new PermissionManager(dataPath);
  }
}

export function getTrustManager(): TrustScoreManager {
  if (!trustManagerInstance) {
    throw new Error('TrustScoreManager not initialized. Call initializeTimeDecay() first.');
  }
  return trustManagerInstance;
}

export function getPermissionManager(): PermissionManager {
  if (!permissionManagerInstance) {
    throw new Error('PermissionManager not initialized. Call initializeTimeDecay() first.');
  }
  return permissionManagerInstance;
}

