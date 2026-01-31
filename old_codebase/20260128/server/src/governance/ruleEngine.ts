/**
 * Deterministic Rule Engine (v1.24)
 * 
 * Evaluates governance rules deterministically without LLM interpretation
 */

import type {
  GovernanceRule,
  RuleEvaluationContext,
  RuleEvaluationResult,
  DecisionResult,
  RuleCondition,
  RuleAction
} from './types';

/**
 * Evaluate a single rule against a context
 */
function evaluateRule(rule: GovernanceRule, context: RuleEvaluationContext): boolean {
  const conditions = rule.conditions;
  
  // Check action match
  if (conditions.action && conditions.action !== context.action) {
    return false;
  }
  
  // Check actor role match
  if (conditions.actorRole && conditions.actorRole !== context.actorRole) {
    return false;
  }
  
  // Check certificate requirement
  if (conditions.hasValidCertificate !== undefined) {
    if (conditions.hasValidCertificate !== context.hasValidCertificate) {
      return false;
    }
  }
  
  // Check service type match
  if (conditions.serviceType && context.serviceType) {
    if (conditions.serviceType !== context.serviceType) {
      return false;
    }
  }
  
  // Check garden ID match
  if (conditions.gardenId && context.gardenId) {
    if (conditions.gardenId !== context.gardenId) {
      return false;
    }
  }
  
  // Check user ID match
  if (conditions.userId && context.userId) {
    if (conditions.userId !== context.userId) {
      return false;
    }
  }
  
  // Check trust score range
  if (conditions.trustScore && context.trustScore !== undefined) {
    const { min, max } = conditions.trustScore;
    if (min !== undefined && context.trustScore < min) {
      return false;
    }
    if (max !== undefined && context.trustScore > max) {
      return false;
    }
  }
  
  // Check additional custom conditions
  for (const [key, value] of Object.entries(conditions)) {
    if (key === 'action' || key === 'actorRole' || key === 'hasValidCertificate' || 
        key === 'serviceType' || key === 'gardenId' || key === 'userId' || key === 'trustScore') {
      continue; // Already checked
    }
    
    if (context[key] !== value) {
      return false;
    }
  }
  
  return true; // All conditions matched
}

/**
 * Evaluate multiple rules and return decision
 */
export function evaluateRules(
  rules: GovernanceRule[],
  context: RuleEvaluationContext
): RuleEvaluationResult {
  // Sort rules by priority (higher priority first)
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);
  
  const appliedRules: string[] = [];
  const deniedRules: string[] = [];
  let decision: DecisionResult = DecisionResult.ALLOW;
  let escalatedTo: ActorRole | undefined;
  let auditRequired = false;
  let ledgerEntryRequired = false;
  let settlementProhibited = false;
  
  // Evaluate rules in priority order
  for (const rule of sortedRules) {
    if (evaluateRule(rule, context)) {
      appliedRules.push(rule.ruleId);
      
      const actions = rule.actions;
      
      // Check if rule denies the action
      if (!actions.allow) {
        deniedRules.push(rule.ruleId);
        decision = DecisionResult.DENY;
        break; // First denial wins
      }
      
      // Check for escalation
      if (actions.escalationTarget) {
        decision = DecisionResult.ESCALATE;
        escalatedTo = actions.escalationTarget;
      }
      
      // Accumulate requirements
      if (actions.requireAudit) {
        auditRequired = true;
      }
      if (actions.requireLedgerEntry) {
        ledgerEntryRequired = true;
      }
      if (actions.prohibitSettlement) {
        settlementProhibited = true;
      }
    }
  }
  
  // If any rule denied, decision is DENY
  if (deniedRules.length > 0) {
    decision = DecisionResult.DENY;
  }
  
  return {
    decision,
    appliedRules,
    deniedRules: deniedRules.length > 0 ? deniedRules : undefined,
    escalatedTo,
    auditRequired,
    ledgerEntryRequired,
    settlementProhibited,
    evaluationTimestamp: Date.now(),
    evaluationContext: context
  };
}

/**
 * Match rules by scope
 */
export function filterRulesByScope(
  rules: GovernanceRule[],
  context: RuleEvaluationContext
): GovernanceRule[] {
  return rules.filter(rule => {
    // GLOBAL rules always apply
    if (rule.scope === 'GLOBAL') {
      return true;
    }
    
    // GARDEN rules apply to specific garden
    if (rule.scope === 'GARDEN' && context.gardenId) {
      return rule.conditions.gardenId === context.gardenId || !rule.conditions.gardenId;
    }
    
    // SERVICE rules apply to specific service type
    if (rule.scope === 'SERVICE' && context.serviceType) {
      return rule.conditions.serviceType === context.serviceType || !rule.conditions.serviceType;
    }
    
    // USER rules apply to specific user
    if (rule.scope === 'USER' && context.userId) {
      return rule.conditions.userId === context.userId || !rule.conditions.userId;
    }
    
    return false;
  });
}

