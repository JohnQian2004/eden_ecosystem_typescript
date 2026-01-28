/**
 * PriestHood Certification Service
 * Manages the lifecycle of PRIEST user certifications
 */
import type { EdenCertificate } from './types';
export type PriesthoodStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'suspended';
export declare const APPLICATION_FEE = 1;
export declare const MEMBERSHIP_FEE = 0;
export declare const MEMBERSHIP_PERIOD_MS: number;
export declare const PRIEST_RATE_LIMITS: {
    maxActionsPerDay: number;
    maxBlessingsPerHour: number;
    maxDisputesHandled: number;
    maxGardensCreated: number;
};
export interface PriestTrustScore {
    email: string;
    score: number;
    timeServed: number;
    positiveOutcomes: number;
    auditsPassed: number;
    complaints: number;
    reversals: number;
    lastUpdated: number;
}
export interface PriesthoodCertification {
    email: string;
    status: PriesthoodStatus;
    appliedAt: number;
    approvedAt?: number;
    approvedBy?: string;
    rejectedAt?: number;
    rejectedBy?: string;
    revokedAt?: number;
    revokedBy?: string;
    reason?: string;
    certificate?: EdenCertificate;
    metadata?: Record<string, any>;
    applicationFeePaid?: boolean;
    applicationFeeTxId?: string;
    membershipActiveUntil?: number;
    lastActivityDate?: number;
    activityCount?: number;
    trustScore?: number;
    dailyActionCount?: number;
    lastActionReset?: number;
    suspendedForNonPayment?: boolean;
}
/**
 * Initialize the PriestHood Certification Service
 */
export declare function initializePriesthoodCertification(): void;
/**
 * Apply for priesthood certification
 */
export declare function applyForPriesthood(email: string, reason?: string): PriesthoodCertification;
/**
 * Update certification billing information
 */
export declare function updateCertificationBilling(email: string, updates: Partial<Pick<PriesthoodCertification, 'applicationFeePaid' | 'applicationFeeTxId' | 'membershipActiveUntil' | 'lastActivityDate' | 'activityCount' | 'trustScore' | 'dailyActionCount' | 'lastActionReset' | 'suspendedForNonPayment'>>): PriesthoodCertification;
/**
 * Approve a priesthood application
 */
export declare function approvePriesthood(email: string, approvedBy: string, reason?: string): PriesthoodCertification;
/**
 * Reject a priesthood application
 */
export declare function rejectPriesthood(email: string, rejectedBy: string, reason?: string): PriesthoodCertification;
/**
 * Revoke an existing priesthood certification
 */
export declare function revokePriesthood(email: string, revokedBy: string, reason?: string): PriesthoodCertification;
/**
 * Get certification status for a user
 */
export declare function getCertificationStatus(email: string): PriesthoodCertification | null;
/**
 * Check if user has approved priesthood certification
 */
export declare function hasPriesthoodCertification(email: string): boolean;
/**
 * Get all certifications (for GOD mode management)
 */
export declare function getAllCertifications(): PriesthoodCertification[];
/**
 * Get certifications by status
 */
export declare function getCertificationsByStatus(status: PriesthoodStatus): PriesthoodCertification[];
/**
 * Check and auto-suspend priests for inactivity or abuse
 * Since membership is now FREE, we check for inactivity instead of payment
 * This should be called periodically (e.g., daily cron job)
 */
export declare function checkAndSuspendInactivePriests(): void;
/**
 * Check rate limits for a priest action
 * Returns true if action is allowed, false if rate limited
 */
export declare function checkPriestRateLimit(email: string, actionType: 'action' | 'blessing' | 'dispute' | 'garden'): boolean;
/**
 * Get statistics for dashboard
 */
export declare function getCertificationStats(): {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    revoked: number;
    suspended: number;
    revenue?: {
        applicationFees: number;
        membershipFees: number;
        total: number;
    };
};
//# sourceMappingURL=priesthoodCertification.d.ts.map