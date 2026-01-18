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
    metadata: {}
  };
  
  CERTIFICATIONS.set(emailLower, certification);
  saveCertifications();
  
  console.log(`📜 [PriestHood Certification] New application from ${email}`);
  
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
 * Get statistics for dashboard
 */
export function getCertificationStats(): {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  revoked: number;
  suspended: number;
} {
  const all = getAllCertifications();
  return {
    total: all.length,
    pending: all.filter(c => c.status === 'pending').length,
    approved: all.filter(c => c.status === 'approved').length,
    rejected: all.filter(c => c.status === 'rejected').length,
    revoked: all.filter(c => c.status === 'revoked').length,
    suspended: all.filter(c => c.status === 'suspended').length
  };
}

