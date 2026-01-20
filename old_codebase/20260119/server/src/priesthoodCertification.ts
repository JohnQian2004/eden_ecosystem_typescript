/**
 * PriestHood Certification Service
 * Manages the lifecycle of PRIEST user certifications
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ROOT_CA } from './state';
import { CERTIFICATE_REGISTRY, REVOCATION_REGISTRY } from './state';
import type { EdenCertificate } from './types';

export type PriesthoodStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'suspended';

// Fee constants - Low entry fee model
export const APPLICATION_FEE = 1; // JSC - one-time, non-refundable (Covenant Token / Witness Apple)
export const MEMBERSHIP_FEE = 0; // JSC - FREE (membership is free, authority is trust-based and rate-limited)
export const MEMBERSHIP_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds (for tracking, but no payment required)

// Rate limiting constants (non-monetary friction)
export const PRIEST_RATE_LIMITS = {
  maxActionsPerDay: 20,
  maxBlessingsPerHour: 3,
  maxDisputesHandled: 5,
  maxGardensCreated: 10 // Per month
};

// Trust/Reputation system (for future scaling of authority)
export interface PriestTrustScore {
  email: string;
  score: number; // 0-100
  timeServed: number; // Days since certification
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
  approvedBy?: string; // GOD user email
  rejectedAt?: number;
  rejectedBy?: string;
  revokedAt?: number;
  revokedBy?: string;
  reason?: string;
  certificate?: EdenCertificate;
  metadata?: Record<string, any>;
  // Billing fields (low entry fee model)
  applicationFeePaid?: boolean;
  applicationFeeTxId?: string;
  // Membership is now FREE - these fields track activity/trust instead
  membershipActiveUntil?: number; // Timestamp when membership period ends (for tracking, not payment)
  lastActivityDate?: number; // Last date of priest activity
  activityCount?: number; // Actions performed in current period
  trustScore?: number; // 0-100, based on time served, outcomes, audits
  // Rate limiting tracking
  dailyActionCount?: number; // Actions today
  lastActionReset?: number; // Timestamp when daily count was reset
  suspendedForNonPayment?: boolean; // Legacy field (now used for inactivity/abuse)
}

const CERTIFICATIONS_FILE = path.join(__dirname, '..', 'eden-priest-certifications.json');
const CERTIFICATIONS: Map<string, PriesthoodCertification> = new Map();

/**
 * Initialize the PriestHood Certification Service
 */
export function initializePriesthoodCertification(): void {
  console.log('📜 [PriestHood Certification] Initializing service...');
  
  // Load existing certifications from persistence
  if (fs.existsSync(CERTIFICATIONS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CERTIFICATIONS_FILE, 'utf-8'));
      if (data.certifications && Array.isArray(data.certifications)) {
        for (const cert of data.certifications) {
          CERTIFICATIONS.set(cert.email.toLowerCase(), cert);
        }
        console.log(`   ✅ Loaded ${CERTIFICATIONS.size} priesthood certification(s) from persistence`);
      }
    } catch (err: any) {
      console.error(`   ❌ Failed to load certifications: ${err.message}`);
    }
  } else {
    console.log(`   ℹ️  No existing certifications file found, starting fresh`);
  }
}

/**
 * Save certifications to persistence file
 */
function saveCertifications(): void {
  try {
    const certifications = Array.from(CERTIFICATIONS.values());
    const data = {
      certifications,
      lastSaved: new Date().toISOString()
    };
    fs.writeFileSync(CERTIFICATIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`💾 [PriestHood Certification] Saved ${certifications.length} certification(s) to persistence`);
  } catch (err: any) {
    console.error(`❌ [PriestHood Certification] Failed to save certifications: ${err.message}`);
  }
}

/**
 * Apply for priesthood certification
 */
export function applyForPriesthood(email: string, reason?: string): PriesthoodCertification {
  const emailLower = email.toLowerCase();
  
  // Check if user already has a certification
  const existing = CERTIFICATIONS.get(emailLower);
  if (existing && (existing.status === 'approved' || existing.status === 'pending')) {
    throw new Error(`User ${email} already has a ${existing.status} priesthood certification`);
  }
  
  // Create new application
  const certification: PriesthoodCertification = {
    email: emailLower,
    status: 'pending',
    appliedAt: Date.now(),
    reason: reason || 'User application for priesthood certification',
    metadata: {},
    applicationFeePaid: false,
    activityCount: 0,
    trustScore: 0,
    dailyActionCount: 0
  };
  
  CERTIFICATIONS.set(emailLower, certification);
  saveCertifications();
  
  console.log(`📜 [PriestHood Certification] New application from ${email}`);
  
  return certification;
}

/**
 * Update certification billing information
 */
export function updateCertificationBilling(
  email: string, 
  updates: Partial<Pick<PriesthoodCertification, 'applicationFeePaid' | 'applicationFeeTxId' | 'membershipActiveUntil' | 'lastActivityDate' | 'activityCount' | 'trustScore' | 'dailyActionCount' | 'lastActionReset' | 'suspendedForNonPayment'>>
): PriesthoodCertification {
  const emailLower = email.toLowerCase();
  const certification = CERTIFICATIONS.get(emailLower);
  
  if (!certification) {
    throw new Error(`No priesthood certification found for ${email}`);
  }
  
  // Update billing fields
  if (updates.applicationFeePaid !== undefined) {
    certification.applicationFeePaid = updates.applicationFeePaid;
  }
  if (updates.applicationFeeTxId !== undefined) {
    certification.applicationFeeTxId = updates.applicationFeeTxId;
  }
  if (updates.membershipActiveUntil !== undefined) {
    certification.membershipActiveUntil = updates.membershipActiveUntil;
  }
  if (updates.lastActivityDate !== undefined) {
    certification.lastActivityDate = updates.lastActivityDate;
  }
  if (updates.activityCount !== undefined) {
    certification.activityCount = updates.activityCount;
  }
  if (updates.trustScore !== undefined) {
    certification.trustScore = updates.trustScore;
  }
  if (updates.dailyActionCount !== undefined) {
    certification.dailyActionCount = updates.dailyActionCount;
  }
  if (updates.lastActionReset !== undefined) {
    certification.lastActionReset = updates.lastActionReset;
  }
  if (updates.suspendedForNonPayment !== undefined) {
    certification.suspendedForNonPayment = updates.suspendedForNonPayment;
    // Auto-suspend if non-payment
    if (updates.suspendedForNonPayment && certification.status === 'approved') {
      certification.status = 'suspended';
      console.log(`📜 [PriestHood Certification] Auto-suspended ${email} for non-payment`);
    }
  }
  
  CERTIFICATIONS.set(emailLower, certification);
  saveCertifications();
  
  return certification;
}

/**
 * Approve a priesthood application
 */
export function approvePriesthood(email: string, approvedBy: string, reason?: string): PriesthoodCertification {
  const emailLower = email.toLowerCase();
  const certification = CERTIFICATIONS.get(emailLower);
  
  if (!certification) {
    throw new Error(`No priesthood application found for ${email}`);
  }
  
  if (certification.status !== 'pending') {
    throw new Error(`Cannot approve certification with status: ${certification.status}`);
  }
  
  // Issue certificate using ROOT_CA
  const priestUuid = `priest:${emailLower}:${Date.now()}`;
  const certificate = ROOT_CA.issueCertificate({
    subject: priestUuid,
    capabilities: ['PRIEST_MODE', 'CREATE_GARDEN', 'MANAGE_GARDENS'],
    constraints: {
      email: emailLower,
      grantedBy: approvedBy,
      grantedAt: Date.now(),
      priesthoodLevel: 'certified'
    },
    ttlSeconds: 365 * 24 * 60 * 60 // 1 year
  });
  
  // Store certificate in registry
  CERTIFICATE_REGISTRY.set(priestUuid, certificate);
  
  // Update certification
  certification.status = 'approved';
  certification.approvedAt = Date.now();
  certification.approvedBy = approvedBy;
  certification.certificate = certificate;
  if (reason) {
    certification.reason = reason;
  }
  
  CERTIFICATIONS.set(emailLower, certification);
  saveCertifications();
  
  console.log(`📜 [PriestHood Certification] Approved priesthood for ${email} by ${approvedBy}`);
  
  return certification;
}

/**
 * Reject a priesthood application
 */
export function rejectPriesthood(email: string, rejectedBy: string, reason?: string): PriesthoodCertification {
  const emailLower = email.toLowerCase();
  const certification = CERTIFICATIONS.get(emailLower);
  
  if (!certification) {
    throw new Error(`No priesthood application found for ${email}`);
  }
  
  if (certification.status !== 'pending') {
    throw new Error(`Cannot reject certification with status: ${certification.status}`);
  }
  
  // Update certification
  certification.status = 'rejected';
  certification.rejectedAt = Date.now();
  certification.rejectedBy = rejectedBy;
  if (reason) {
    certification.reason = reason;
  }
  
  CERTIFICATIONS.set(emailLower, certification);
  saveCertifications();
  
  console.log(`📜 [PriestHood Certification] Rejected priesthood application for ${email} by ${rejectedBy}`);
  
  return certification;
}

/**
 * Revoke an existing priesthood certification
 */
export function revokePriesthood(email: string, revokedBy: string, reason?: string): PriesthoodCertification {
  const emailLower = email.toLowerCase();
  const certification = CERTIFICATIONS.get(emailLower);
  
  if (!certification) {
    throw new Error(`No priesthood certification found for ${email}`);
  }
  
  if (certification.status !== 'approved') {
    throw new Error(`Cannot revoke certification with status: ${certification.status}`);
  }
  
  // Revoke certificate if it exists
  if (certification.certificate) {
    // Remove from certificate registry
    CERTIFICATE_REGISTRY.delete(certification.certificate.subject);
    
    // Store certificate hash for revocation record
    const certHash = `sha256:${crypto.createHash('sha256').update(JSON.stringify(certification.certificate)).digest('hex')}`;
    
    // Create revocation record
    const revocation = {
      revoked_uuid: certification.certificate.subject,
      revoked_type: 'priest',
      reason: reason || 'Priesthood certification revoked',
      effective_at: Date.now(),
      cert_hash: certHash,
      severity: 'hard',
      metadata: { revokedBy, email: emailLower }
    };
    
    REVOCATION_REGISTRY.set(certification.certificate.subject, revocation);
    console.log(`📜 [PriestHood Certification] Revoked certificate for ${emailLower}`);
  }
  
  // Update certification
  certification.status = 'revoked';
  certification.revokedAt = Date.now();
  certification.revokedBy = revokedBy;
  if (reason) {
    certification.reason = reason;
  }
  certification.certificate = undefined;
  
  CERTIFICATIONS.set(emailLower, certification);
  saveCertifications();
  
  console.log(`📜 [PriestHood Certification] Revoked priesthood for ${email} by ${revokedBy}`);
  
  return certification;
}

/**
 * Get certification status for a user
 */
export function getCertificationStatus(email: string): PriesthoodCertification | null {
  const emailLower = email.toLowerCase();
  return CERTIFICATIONS.get(emailLower) || null;
}

/**
 * Check if user has approved priesthood certification
 */
export function hasPriesthoodCertification(email: string): boolean {
  const certification = getCertificationStatus(email);
  return certification?.status === 'approved' && !!certification.certificate;
}

/**
 * Get all certifications (for GOD mode management)
 */
export function getAllCertifications(): PriesthoodCertification[] {
  return Array.from(CERTIFICATIONS.values());
}

/**
 * Get certifications by status
 */
export function getCertificationsByStatus(status: PriesthoodStatus): PriesthoodCertification[] {
  return Array.from(CERTIFICATIONS.values()).filter(cert => cert.status === status);
}

/**
 * Check and auto-suspend priests for inactivity or abuse
 * Since membership is now FREE, we check for inactivity instead of payment
 * This should be called periodically (e.g., daily cron job)
 */
export function checkAndSuspendInactivePriests(): void {
  const now = Date.now();
  const INACTIVITY_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000; // 90 days of inactivity
  const all = getAllCertifications();
  let suspendedCount = 0;
  
  for (const cert of all) {
    if (cert.status === 'approved') {
      const lastActivity = cert.lastActivityDate || cert.approvedAt || 0;
      const daysSinceActivity = (now - lastActivity) / (24 * 60 * 60 * 1000);
      
      if (daysSinceActivity > 90) {
        // Inactive for 90+ days - suspend
        updateCertificationBilling(cert.email, {
          suspendedForNonPayment: true // Reusing field for inactivity
        });
        suspendedCount++;
        console.log(`📜 [PriestHood Certification] Auto-suspended ${cert.email} - inactive for ${Math.floor(daysSinceActivity)} days`);
      }
    }
  }
  
  if (suspendedCount > 0) {
    console.log(`📜 [PriestHood Certification] Auto-suspended ${suspendedCount} priest(s) for inactivity`);
  }
}

/**
 * Check rate limits for a priest action
 * Returns true if action is allowed, false if rate limited
 */
export function checkPriestRateLimit(email: string, actionType: 'action' | 'blessing' | 'dispute' | 'garden'): boolean {
  const certification = getCertificationStatus(email);
  if (!certification || certification.status !== 'approved') {
    return false;
  }
  
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  
  // Reset daily count if needed
  if (!certification.lastActionReset || certification.lastActionReset < oneDayAgo) {
    certification.dailyActionCount = 0;
    certification.lastActionReset = now;
  }
  
  // Check rate limits based on action type
  switch (actionType) {
    case 'action':
      if ((certification.dailyActionCount || 0) >= PRIEST_RATE_LIMITS.maxActionsPerDay) {
        console.log(`⚠️  [PriestHood] Rate limit: ${email} exceeded daily action limit (${PRIEST_RATE_LIMITS.maxActionsPerDay})`);
        return false;
      }
      certification.dailyActionCount = (certification.dailyActionCount || 0) + 1;
      break;
    case 'garden':
      // Check monthly garden creation limit
      const monthlyGardenCount = certification.activityCount || 0;
      if (monthlyGardenCount >= PRIEST_RATE_LIMITS.maxGardensCreated) {
        console.log(`⚠️  [PriestHood] Rate limit: ${email} exceeded monthly garden creation limit (${PRIEST_RATE_LIMITS.maxGardensCreated})`);
        return false;
      }
      break;
    // Add other action types as needed
  }
  
  // Update last activity
  certification.lastActivityDate = now;
  saveCertifications();
  
  return true;
}

/**
 * Get statistics for dashboard
 */
export function getCertificationStats(): {
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
} {
  const all = getAllCertifications();
  const stats = {
    total: all.length,
    pending: all.filter(c => c.status === 'pending').length,
    // "Certified Priests" must come from PriestHoodService truth:
    // approved + certificate present (legacy rows may be "approved" but missing cert)
    approved: all.filter(c => c.status === 'approved' && !!c.certificate).length,
    rejected: all.filter(c => c.status === 'rejected').length,
    revoked: all.filter(c => c.status === 'revoked').length,
    suspended: all.filter(c => c.status === 'suspended').length,
    revenue: {
      applicationFees: all.filter(c => c.applicationFeePaid).length * APPLICATION_FEE,
      membershipFees: 0, // Membership is now FREE
      total: 0
    }
  };
  stats.revenue.total = stats.revenue.applicationFees + stats.revenue.membershipFees;
  return stats;
}

