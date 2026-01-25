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

// Evaluation history storage (in-memory, for monitoring dashboard)
interface EvaluationHistoryEntry {
  timestamp: number;
  context: RuleEvaluationContext;
  result: RuleEvaluationResult;
}

export class GovernanceService {
  private evaluationHistory: EvaluationHistoryEntry[] = [];
  private readonly MAX_HISTORY = 1000; // Keep last 1000 evaluations

  /**
   * Evaluate action against governance rules
   * This is the main entry point for rule evaluation
   * AUTOMATED - No human intervention required
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
    
    // Step 6: Store in history for monitoring dashboard
    this.evaluationHistory.push({
      timestamp: Date.now(),
      context: { ...context },
      result: { ...result }
    });
    
    // Keep only last MAX_HISTORY entries
    if (this.evaluationHistory.length > this.MAX_HISTORY) {
      this.evaluationHistory.shift();
    }
    
    return result;
  }
  
  /**
   * Get evaluation history (for monitoring dashboard)
   */
  getEvaluationHistory(limit: number = 100): EvaluationHistoryEntry[] {
    return this.evaluationHistory.slice(-limit).reverse(); // Most recent first
  }
  
  /**
   * Get evaluation statistics (self-scoring metrics)
   */
  getEvaluationStats(): {
    totalEvaluations: number;
    allowedCount: number;
    deniedCount: number;
    escalatedCount: number;
    complianceRate: number;
    averageTrustScore: number;
    recentEvaluations: number;
  } {
    const recent = this.evaluationHistory.slice(-100); // Last 100 evaluations
    const allowed = recent.filter(e => e.result.decision === 'ALLOW').length;
    const denied = recent.filter(e => e.result.decision === 'DENY').length;
    const escalated = recent.filter(e => e.result.decision === 'ESCALATE').length;
    const total = recent.length;
    
    const trustScores = recent
      .map(e => e.context.trustScore)
      .filter((score): score is number => score !== undefined && score !== null);
    const avgTrustScore = trustScores.length > 0
      ? trustScores.reduce((sum, score) => sum + score, 0) / trustScores.length
      : 0;
    
    return {
      totalEvaluations: this.evaluationHistory.length,
      allowedCount: allowed,
      deniedCount: denied,
      escalatedCount: escalated,
      complianceRate: total > 0 ? (allowed / total) * 100 : 0,
      averageTrustScore: avgTrustScore,
      recentEvaluations: recent.length
    };
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

