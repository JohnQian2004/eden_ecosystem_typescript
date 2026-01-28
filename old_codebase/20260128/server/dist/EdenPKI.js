"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var EdenPKI_exports = {};
__export(EdenPKI_exports, {
  EdenPKI: () => EdenPKI
});
module.exports = __toCommonJS(EdenPKI_exports);
var import_crypto = __toESM(require("crypto"));
class EdenPKI {
  constructor(uuid) {
    const { publicKey, privateKey } = import_crypto.default.generateKeyPairSync("ed25519");
    this.privateKey = privateKey;
    this.identity = {
      uuid,
      publicKey: publicKey.export({ type: "spki", format: "pem" }).toString()
    };
  }
  sign(data) {
    const payload = Buffer.from(JSON.stringify(data));
    return import_crypto.default.sign(null, payload, this.privateKey).toString("base64");
  }
  static verify(data, signature, publicKeyPem) {
    const payload = Buffer.from(JSON.stringify(data));
    const publicKey = import_crypto.default.createPublicKey(publicKeyPem);
    return import_crypto.default.verify(null, payload, publicKey, Buffer.from(signature, "base64"));
  }
  issueCertificate(params) {
    const now = Date.now();
    const cert = {
      subject: params.subject,
      issuer: this.identity.uuid,
      capabilities: params.capabilities,
      constraints: params.constraints,
      issuedAt: now,
      expiresAt: now + (params.ttlSeconds ?? 86400) * 1e3
    };
    return { ...cert, signature: this.sign(cert) };
  }
  static validateCertificate(cert, issuerPublicKey, now = Date.now()) {
    if (now > cert.expiresAt)
      return false;
    const { signature, ...unsigned } = cert;
    return EdenPKI.verify(unsigned, signature, issuerPublicKey);
  }
  revokeIdentity(revoked, revokedType, reason, effectiveAt, certHash, severity, metadata) {
    const now = Date.now();
    const event = {
      revoked_uuid: revoked,
      revoked_type: revokedType,
      issuer_uuid: this.identity.uuid,
      reason,
      issued_at: now,
      effective_at: effectiveAt || now,
      cert_hash: certHash,
      severity: severity || "hard",
      metadata
    };
    return { ...event, signature: this.sign(event) };
  }
  static validateRevocation(event, issuerPublicKey) {
    const { signature, ...unsigned } = event;
    return EdenPKI.verify(unsigned, signature, issuerPublicKey);
  }
  static validateRevocationLegacy(event, issuerPublicKey) {
    const { signature, ...unsigned } = event;
    return EdenPKI.verify(unsigned, signature, issuerPublicKey);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EdenPKI
});
//# sourceMappingURL=EdenPKI.js.map
