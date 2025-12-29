/**
 * ============================================================
 * ENCERT v1 — Eden Native Certificate Specification
 * ============================================================
 *
 * Purpose:
 * ENCERT is a lightweight, Eden-native PKI providing identity,
 * authority, delegation, revocation, and auditability without
 * X.509, WebPKI, browsers, or blockchain dependency.
 *
 * Identity Model:
 *   Identity = UUID + Ed25519 Public Key
 *
 * Certificate Model:
 *   Signed capability document issued by ROOT CA or Indexer.
 *
 * Trust Chain:
 *   ROOT CA → Indexer → Service Provider
 *
 * Capabilities:
 *   Explicit permissions such as:
 *     - INDEXER
 *     - ISSUE_CERT
 *     - SERVICE_PROVIDER
 *     - PRICE_QUOTE
 *     - RECEIVE_PAYMENT
 *
 * Cryptography:
 *   Ed25519 signatures over canonical JSON payloads.
 *
 * Revocation:
 *   Event-based signed revocations distributed via Redis Streams.
 *
 * Design Principles:
 *   - Minimalism
 *   - Sovereignty
 *   - Human readability
 *   - Event-driven governance
 *   - Short-lived authority
 *
 * Scope:
 *   ENCERT governs authority inside Eden only.
 *
 * ============================================================
 */

import crypto from "crypto";

export type EdenUUID = string;
export type Timestamp = number;

export type Capability =
  | "INDEXER"
  | "ISSUE_CERT"
  | "SERVICE_PROVIDER"
  | "PRICE_QUOTE"
  | "RECEIVE_PAYMENT";

export interface EdenIdentity {
  uuid: EdenUUID;
  publicKey: string;
}

export interface EdenCertificate {
  subject: EdenUUID;
  issuer: EdenUUID;
  capabilities: Capability[];
  constraints?: Record<string, any>;
  issuedAt: Timestamp;
  expiresAt: Timestamp;
  signature: string;
}

export type RevokedType = "indexer" | "service" | "provider";

export interface RevocationEvent {
  revoked_uuid: EdenUUID;
  revoked_type: RevokedType;
  issuer_uuid: EdenUUID;
  reason: string;
  issued_at: Timestamp;
  effective_at: Timestamp;
  signature: string;
  cert_hash?: string;
  severity?: "soft" | "hard";
  metadata?: Record<string, any>;
}

// Legacy interface for backward compatibility (deprecated)
export interface LegacyRevocationEvent {
  revoked: EdenUUID;
  reason: string;
  by: EdenUUID;
  timestamp: Timestamp;
  signature: string;
}

export class EdenPKI {
  readonly identity: EdenIdentity;
  private readonly privateKey: crypto.KeyObject;

  constructor(uuid: EdenUUID) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    this.privateKey = privateKey;
    this.identity = {
      uuid,
      publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
  }

  private sign(data: any): string {
    const payload = Buffer.from(JSON.stringify(data));
    return crypto.sign(null, payload, this.privateKey).toString("base64");
  }

  static verify(
    data: any,
    signature: string,
    publicKeyPem: string
  ): boolean {
    const payload = Buffer.from(JSON.stringify(data));
    const publicKey = crypto.createPublicKey(publicKeyPem);
    return crypto.verify(null, payload, publicKey, Buffer.from(signature, "base64"));
  }

  issueCertificate(params: {
    subject: EdenUUID;
    capabilities: Capability[];
    constraints?: Record<string, any>;
    ttlSeconds?: number;
  }): EdenCertificate {
    const now = Date.now();
    const cert: Omit<EdenCertificate, "signature"> = {
      subject: params.subject,
      issuer: this.identity.uuid,
      capabilities: params.capabilities,
      constraints: params.constraints,
      issuedAt: now,
      expiresAt: now + (params.ttlSeconds ?? 86400) * 1000,
    };

    return { ...cert, signature: this.sign(cert) };
  }

  static validateCertificate(
    cert: EdenCertificate,
    issuerPublicKey: string,
    now: number = Date.now()
  ): boolean {
    if (now > cert.expiresAt) return false;
    const { signature, ...unsigned } = cert;
    return EdenPKI.verify(unsigned, signature, issuerPublicKey);
  }

  revokeIdentity(
    revoked: EdenUUID,
    revokedType: RevokedType,
    reason: string,
    effectiveAt?: Timestamp,
    certHash?: string,
    severity?: "soft" | "hard",
    metadata?: Record<string, any>
  ): RevocationEvent {
    const now = Date.now();
    const event: Omit<RevocationEvent, "signature"> = {
      revoked_uuid: revoked,
      revoked_type: revokedType,
      issuer_uuid: this.identity.uuid,
      reason,
      issued_at: now,
      effective_at: effectiveAt || now,
      cert_hash: certHash,
      severity: severity || "hard",
      metadata,
    };
    return { ...event, signature: this.sign(event) };
  }

  static validateRevocation(
    event: RevocationEvent,
    issuerPublicKey: string
  ): boolean {
    const { signature, ...unsigned } = event;
    return EdenPKI.verify(unsigned, signature, issuerPublicKey);
  }

  static validateRevocationLegacy(
    event: LegacyRevocationEvent,
    issuerPublicKey: string
  ): boolean {
    const { signature, ...unsigned } = event;
    return EdenPKI.verify(unsigned, signature, issuerPublicKey);
  }
}
