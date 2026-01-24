/**
 * Governance Service (v1.24)
 * 
 * Main service that orchestrates rule evaluation, RAG retrieval, and time-decay
 */

import { getRuleIndex } from './ruleIndex';
import { evaluateRules, filterRulesByScope } from './ruleEngine';
import { getTrustManager, getPermissionManager } from './timeDecay';
import type {
  RuleEvaluationContext,
  RuleEvaluationResult,
  GovernanceRule,
  ActorRole
} from './types';

export class GovernanceService {
  /**
   * Evaluate action against governance rules
   * This is the main entry point for rule evaluation
   */
  evaluateAction(context: RuleEvaluationContext): RuleEvaluationResult {
    console.log(`🔍 [Governance] Evaluating action: ${context.action} by ${context.actorRole}`);
    
    // Step 1: RAG retrieval - get relevant rules
    const ruleIndex = getRuleIndex();
    const relevantRules = ruleIndex.retrieveRules(context);
    
    // Step 2: Filter by scope
    const scopedRules = filterRulesByScope(relevantRules, context);
    
    // Step 3: Get current trust score if needed
    if (context.userId && !context.trustScore) {
      const trustManager = getTrustManager();
      context.trustScore = trustManager.getCurrentTrustScore(
        context.userId,
        'USER',
        'TRANSACTION'
      );
    }
    
    // Step 4: Evaluate rules deterministically
    const result = evaluateRules(scopedRules, context);
    
    // Step 5: Log evaluation
    console.log(`✅ [Governance] Decision: ${result.decision} for action: ${context.action}`);
    if (result.deniedRules && result.deniedRules.length > 0) {
      console.log(`⚠️ [Governance] Denied by rules: ${result.deniedRules.join(', ')}`);
    }
    
    return result;
  }
  
  /**
   * Check if action is allowed
   */
  isActionAllowed(context: RuleEvaluationContext): boolean {
    const result = this.evaluateAction(context);
    return result.decision === 'ALLOW';
  }
  
  /**
   * Get all governance rules
   */
  getAllRules(): GovernanceRule[] {
    const ruleIndex = getRuleIndex();
    return ruleIndex.getAllRules();
  }
  
  /**
   * Get rule by ID
   */
  getRule(ruleId: string): GovernanceRule | undefined {
    const ruleIndex = getRuleIndex();
    return ruleIndex.getRule(ruleId);
  }
  
  /**
   * Create or update a rule
   */
  upsertRule(rule: GovernanceRule, actorRole: ActorRole): void {
    // Only ROOT_CA can create/update rules
    if (actorRole !== 'ROOT_CA') {
      throw new Error('Only ROOT_CA can create or update governance rules');
    }
    
    const ruleIndex = getRuleIndex();
    ruleIndex.upsertRule(rule);
  }
  
  /**
   * Delete a rule
   */
  deleteRule(ruleId: string, actorRole: ActorRole): boolean {
    // Only ROOT_CA can delete rules
    if (actorRole !== 'ROOT_CA') {
      throw new Error('Only ROOT_CA can delete governance rules');
    }
    
    const ruleIndex = getRuleIndex();
    return ruleIndex.deleteRule(ruleId);
  }
}

// Singleton instance
let governanceServiceInstance: GovernanceService | null = null;

export function initializeGovernance(dataPath?: string): GovernanceService {
  if (!governanceServiceInstance) {
    // Initialize dependencies
    const ruleIndex = require('./ruleIndex');
    ruleIndex.initializeRuleIndex(dataPath);
    
    const timeDecay = require('./timeDecay');
    timeDecay.initializeTimeDecay(dataPath);
    
    const deviceBinding = require('./deviceBinding');
    deviceBinding.initializeDeviceBinding(dataPath);
    
    governanceServiceInstance = new GovernanceService();
  }
  return governanceServiceInstance;
}

export function getGovernanceService(): GovernanceService {
  if (!governanceServiceInstance) {
    throw new Error('GovernanceService not initialized. Call initializeGovernance() first.');
  }
  return governanceServiceInstance;
}

