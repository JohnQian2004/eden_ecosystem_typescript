/**
 * Rule-Based Governance System Types (v1.24)
 * 
 * Defines types for deterministic rule-based governance system
 */

export enum RuleType {
  PERMISSION = 'PERMISSION',
  CONSTRAINT = 'CONSTRAINT',
  ESCALATION = 'ESCALATION',
  SETTLEMENT = 'SETTLEMENT'
}

export enum RuleScope {
  GLOBAL = 'GLOBAL',
  GARDEN = 'GARDEN',
  SERVICE = 'SERVICE',
  USER = 'USER'
}

export enum ActorRole {
  ROOT_CA = 'ROOT_CA',
  GARDEN = 'GARDEN',
  PRIEST = 'PRIEST',
  GARDEN_OWNER = 'GARDEN_OWNER',
  USER = 'USER',
  SERVICE_PROVIDER = 'SERVICE_PROVIDER'
}

export enum DecisionResult {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  ESCALATE = 'ESCALATE'
}

export interface RuleCondition {
  action?: string;
  actorRole?: ActorRole;
  hasValidCertificate?: boolean;
  serviceType?: string;
  gardenId?: string;
  userId?: string;
  trustScore?: {
    min?: number;
    max?: number;
  };
  [key: string]: any; // Allow additional condition fields
}

export interface RuleAction {
  allow: boolean;
  requireAudit?: boolean;
  requireLedgerEntry?: boolean;
  prohibitSettlement?: boolean;
  escalationTarget?: ActorRole;
  [key: string]: any; // Allow additional action fields
}

export interface TimeDecayConfig {
  enabled: boolean;
  decayRate?: number; // Decay rate per second
  renewalPeriod?: number; // Seconds until renewal required
  initialValue?: number; // Initial trust/permission value
}

export interface GovernanceRule {
  ruleId: string;
  ruleType: RuleType;
  scope: RuleScope;
  conditions: RuleCondition;
  actions: RuleAction;
  timeDecay?: TimeDecayConfig;
  priority: number; // Higher priority = evaluated first
  version: number;
  createdAt: string;
  createdBy: ActorRole;
  updatedAt?: string;
  updatedBy?: ActorRole;
  description?: string;
}

export interface RuleEvaluationContext {
  action: string;
  actorId: string;
  actorRole: ActorRole;
  serviceType?: string;
  gardenId?: string;
  userId?: string;
  trustScore?: number;
  hasValidCertificate?: boolean;
  timestamp: number;
  [key: string]: any; // Allow additional context fields
}

export interface RuleEvaluationResult {
  decision: DecisionResult;
  appliedRules: string[]; // Rule IDs that were applied
  deniedRules?: string[]; // Rule IDs that denied the action
  escalatedTo?: ActorRole;
  auditRequired: boolean;
  ledgerEntryRequired: boolean;
  settlementProhibited: boolean;
  evaluationTimestamp: number;
  evaluationContext: RuleEvaluationContext;
}

export interface DeviceBinding {
  deviceId: string;
  userId: string;
  publicKey: string;
  boundAt: number;
  lastUsedAt: number;
  revoked: boolean;
  revokedAt?: number;
  metadata?: {
    deviceName?: string;
    deviceType?: string;
    userAgent?: string;
  };
}

export interface QRCodeBindingData {
  challenge: string;
  timestamp: string;
  identityHint: string;
  bindingUrl: string;
  expiresAt: number;
}

export interface TrustScore {
  entityId: string;
  entityType: 'USER' | 'GARDEN' | 'SERVICE_PROVIDER';
  trustType: 'TRANSACTION' | 'IDENTITY' | 'SERVICE';
  score: number;
  initialScore: number;
  lastUpdated: number;
  decayRate: number;
  renewalRequired: boolean;
  renewalDeadline?: number;
}

export interface Permission {
  permissionId: string;
  entityId: string;
  entityType: 'USER' | 'GARDEN' | 'SERVICE_PROVIDER';
  permissionType: string;
  grantedAt: number;
  expiresAt?: number;
  initialValue: number;
  currentValue: number;
  decayRate: number;
  renewalRequired: boolean;
  renewalDeadline?: number;
  metadata?: {
    grantedBy?: string;
    reason?: string;
    [key: string]: any;
  };
}

