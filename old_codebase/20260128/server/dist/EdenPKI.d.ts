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
export type EdenUUID = string;
export type Timestamp = number;
export type Capability = "INDEXER" | "ISSUE_CERT" | "SERVICE_PROVIDER" | "PRICE_QUOTE" | "RECEIVE_PAYMENT";
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
export interface LegacyRevocationEvent {
    revoked: EdenUUID;
    reason: string;
    by: EdenUUID;
    timestamp: Timestamp;
    signature: string;
}
export declare class EdenPKI {
    readonly identity: EdenIdentity;
    private readonly privateKey;
    constructor(uuid: EdenUUID);
    private sign;
    static verify(data: any, signature: string, publicKeyPem: string): boolean;
    issueCertificate(params: {
        subject: EdenUUID;
        capabilities: Capability[];
        constraints?: Record<string, any>;
        ttlSeconds?: number;
    }): EdenCertificate;
    static validateCertificate(cert: EdenCertificate, issuerPublicKey: string, now?: number): boolean;
    revokeIdentity(revoked: EdenUUID, revokedType: RevokedType, reason: string, effectiveAt?: Timestamp, certHash?: string, severity?: "soft" | "hard", metadata?: Record<string, any>): RevocationEvent;
    static validateRevocation(event: RevocationEvent, issuerPublicKey: string): boolean;
    static validateRevocationLegacy(event: LegacyRevocationEvent, issuerPublicKey: string): boolean;
}
//# sourceMappingURL=EdenPKI.d.ts.map