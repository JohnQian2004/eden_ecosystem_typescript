/**
 * RAG-Based Rule Index (v1.24)
 * 
 * Manages rule storage and retrieval using RAG (Retrieval-Augmented Generation)
 * Rules are indexed for semantic search and retrieved before actions
 */

import type { GovernanceRule, RuleEvaluationContext } from './types';
import * as fs from 'fs';
import * as path from 'path';

// Simple in-memory rule store (can be replaced with vector database)
class RuleIndex {
  private rules: Map<string, GovernanceRule> = new Map();
  private ruleIndexPath: string;
  
  constructor(dataPath: string = './data') {
    this.ruleIndexPath = path.join(dataPath, 'governance-rules.json');
    this.loadRules();
  }
  
  /**
   * Load rules from persistent storage
   */
  private loadRules(): void {
    try {
      if (fs.existsSync(this.ruleIndexPath)) {
        const data = fs.readFileSync(this.ruleIndexPath, 'utf-8');
        const rulesArray: GovernanceRule[] = JSON.parse(data);
        rulesArray.forEach(rule => {
          this.rules.set(rule.ruleId, rule);
        });
        console.log(`✅ [RuleIndex] Loaded ${rulesArray.length} governance rules`);
      } else {
        // Initialize with default rules
        this.initializeDefaultRules();
        this.saveRules();
      }
    } catch (error: any) {
      console.error(`❌ [RuleIndex] Failed to load rules:`, error.message);
      this.initializeDefaultRules();
    }
  }
  
  /**
   * Save rules to persistent storage
   */
  private saveRules(): void {
    try {
      const rulesArray = Array.from(this.rules.values());
      fs.writeFileSync(this.ruleIndexPath, JSON.stringify(rulesArray, null, 2), 'utf-8');
      console.log(`✅ [RuleIndex] Saved ${rulesArray.length} governance rules`);
    } catch (error: any) {
      console.error(`❌ [RuleIndex] Failed to save rules:`, error.message);
    }
  }
  
  /**
   * Initialize default governance rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: GovernanceRule[] = [
      {
        ruleId: 'rule-settlement-authority-001',
        ruleType: 'PERMISSION',
        scope: 'GLOBAL',
        conditions: {
          action: 'SETTLE_TRANSACTION',
          actorRole: 'ROOT_CA'
        },
        actions: {
          allow: true,
          requireAudit: true,
          requireLedgerEntry: true
        },
        priority: 100,
        version: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'ROOT_CA',
        description: 'Only ROOT CA can settle transactions'
      },
      {
        ruleId: 'rule-garden-execution-001',
        ruleType: 'PERMISSION',
        scope: 'GARDEN',
        conditions: {
          action: 'EXECUTE_TRANSACTION',
          actorRole: 'GARDEN',
          hasValidCertificate: true
        },
        actions: {
          allow: true,
          requireAudit: true,
          prohibitSettlement: true
        },
        priority: 90,
        version: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'ROOT_CA',
        description: 'Gardens can execute transactions but not settle them'
      },
      {
        ruleId: 'rule-user-service-request-001',
        ruleType: 'PERMISSION',
        scope: 'USER',
        conditions: {
          action: 'REQUEST_SERVICE',
          actorRole: 'USER'
        },
        actions: {
          allow: true,
          requireAudit: false
        },
        priority: 80,
        version: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'ROOT_CA',
        description: 'Users can request services'
      }
    ];
    
    defaultRules.forEach(rule => {
      this.rules.set(rule.ruleId, rule);
    });
  }
  
  /**
   * Retrieve rules relevant to an action context (RAG retrieval)
   */
  retrieveRules(context: RuleEvaluationContext): GovernanceRule[] {
    const relevantRules: GovernanceRule[] = [];
    
    // Filter rules by scope and conditions
    for (const rule of this.rules.values()) {
      // GLOBAL rules always apply
      if (rule.scope === 'GLOBAL') {
        relevantRules.push(rule);
        continue;
      }
      
      // Check scope-specific matching
      if (rule.scope === 'GARDEN' && context.gardenId) {
        if (!rule.conditions.gardenId || rule.conditions.gardenId === context.gardenId) {
          relevantRules.push(rule);
        }
      } else if (rule.scope === 'SERVICE' && context.serviceType) {
        if (!rule.conditions.serviceType || rule.conditions.serviceType === context.serviceType) {
          relevantRules.push(rule);
        }
      } else if (rule.scope === 'USER' && context.userId) {
        if (!rule.conditions.userId || rule.conditions.userId === context.userId) {
          relevantRules.push(rule);
        }
      }
      
      // Check action match
      if (rule.conditions.action && rule.conditions.action === context.action) {
        if (!relevantRules.find(r => r.ruleId === rule.ruleId)) {
          relevantRules.push(rule);
        }
      }
    }
    
    console.log(`🔍 [RuleIndex] Retrieved ${relevantRules.length} rules for action: ${context.action}`);
    return relevantRules;
  }
  
  /**
   * Get rule by ID
   */
  getRule(ruleId: string): GovernanceRule | undefined {
    return this.rules.get(ruleId);
  }
  
  /**
   * Get all rules
   */
  getAllRules(): GovernanceRule[] {
    return Array.from(this.rules.values());
  }
  
  /**
   * Add or update a rule
   */
  upsertRule(rule: GovernanceRule): void {
    rule.updatedAt = new Date().toISOString();
    this.rules.set(rule.ruleId, rule);
    this.saveRules();
    console.log(`✅ [RuleIndex] Upserted rule: ${rule.ruleId}`);
  }
  
  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      this.saveRules();
      console.log(`✅ [RuleIndex] Deleted rule: ${ruleId}`);
    }
    return deleted;
  }
}

// Singleton instance
let ruleIndexInstance: RuleIndex | null = null;

export function initializeRuleIndex(dataPath?: string): RuleIndex {
  if (!ruleIndexInstance) {
    ruleIndexInstance = new RuleIndex(dataPath);
  }
  return ruleIndexInstance;
}

export function getRuleIndex(): RuleIndex {
  if (!ruleIndexInstance) {
    throw new Error('RuleIndex not initialized. Call initializeRuleIndex() first.');
  }
  return ruleIndexInstance;
}

