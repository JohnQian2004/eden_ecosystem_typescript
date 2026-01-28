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
var priesthoodCertification_exports = {};
__export(priesthoodCertification_exports, {
  APPLICATION_FEE: () => APPLICATION_FEE,
  MEMBERSHIP_FEE: () => MEMBERSHIP_FEE,
  MEMBERSHIP_PERIOD_MS: () => MEMBERSHIP_PERIOD_MS,
  PRIEST_RATE_LIMITS: () => PRIEST_RATE_LIMITS,
  applyForPriesthood: () => applyForPriesthood,
  approvePriesthood: () => approvePriesthood,
  checkAndSuspendInactivePriests: () => checkAndSuspendInactivePriests,
  checkPriestRateLimit: () => checkPriestRateLimit,
  getAllCertifications: () => getAllCertifications,
  getCertificationStats: () => getCertificationStats,
  getCertificationStatus: () => getCertificationStatus,
  getCertificationsByStatus: () => getCertificationsByStatus,
  hasPriesthoodCertification: () => hasPriesthoodCertification,
  initializePriesthoodCertification: () => initializePriesthoodCertification,
  rejectPriesthood: () => rejectPriesthood,
  revokePriesthood: () => revokePriesthood,
  updateCertificationBilling: () => updateCertificationBilling
});
module.exports = __toCommonJS(priesthoodCertification_exports);
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var crypto = __toESM(require("crypto"));
var import_state = require("./state");
var import_state2 = require("./state");
const APPLICATION_FEE = 1;
const MEMBERSHIP_FEE = 0;
const MEMBERSHIP_PERIOD_MS = 30 * 24 * 60 * 60 * 1e3;
const PRIEST_RATE_LIMITS = {
  maxActionsPerDay: 20,
  maxBlessingsPerHour: 3,
  maxDisputesHandled: 5,
  maxGardensCreated: 10
  // Per month
};
const CERTIFICATIONS_FILE = path.join(__dirname, "..", "eden-priest-certifications.json");
const CERTIFICATIONS = /* @__PURE__ */ new Map();
function initializePriesthoodCertification() {
  console.log("\u{1F4DC} [PriestHood Certification] Initializing service...");
  if (fs.existsSync(CERTIFICATIONS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CERTIFICATIONS_FILE, "utf-8"));
      if (data.certifications && Array.isArray(data.certifications)) {
        for (const cert of data.certifications) {
          CERTIFICATIONS.set(cert.email.toLowerCase(), cert);
        }
        console.log(`   \u2705 Loaded ${CERTIFICATIONS.size} priesthood certification(s) from persistence`);
      }
    } catch (err) {
      console.error(`   \u274C Failed to load certifications: ${err.message}`);
    }
  } else {
    console.log(`   \u2139\uFE0F  No existing certifications file found, starting fresh`);
  }
}
function saveCertifications() {
  try {
    const certifications = Array.from(CERTIFICATIONS.values());
    const data = {
      certifications,
      lastSaved: (/* @__PURE__ */ new Date()).toISOString()
    };
    fs.writeFileSync(CERTIFICATIONS_FILE, JSON.stringify(data, null, 2), "utf-8");
    console.log(`\u{1F4BE} [PriestHood Certification] Saved ${certifications.length} certification(s) to persistence`);
  } catch (err) {
    console.error(`\u274C [PriestHood Certification] Failed to save certifications: ${err.message}`);
  }
}
function applyForPriesthood(email, reason) {
  const emailLower = email.toLowerCase();
  const existing = CERTIFICATIONS.get(emailLower);
  if (existing && (existing.status === "approved" || existing.status === "pending")) {
    throw new Error(`User ${email} already has a ${existing.status} priesthood certification`);
  }
  const certification = {
    email: emailLower,
    status: "pending",
    appliedAt: Date.now(),
    reason: reason || "User application for priesthood certification",
    metadata: {},
    applicationFeePaid: false,
    activityCount: 0,
    trustScore: 0,
    dailyActionCount: 0
  };
  CERTIFICATIONS.set(emailLower, certification);
  saveCertifications();
  console.log(`\u{1F4DC} [PriestHood Certification] New application from ${email}`);
  return certification;
}
function updateCertificationBilling(email, updates) {
  const emailLower = email.toLowerCase();
  const certification = CERTIFICATIONS.get(emailLower);
  if (!certification) {
    throw new Error(`No priesthood certification found for ${email}`);
  }
  if (updates.applicationFeePaid !== void 0) {
    certification.applicationFeePaid = updates.applicationFeePaid;
  }
  if (updates.applicationFeeTxId !== void 0) {
    certification.applicationFeeTxId = updates.applicationFeeTxId;
  }
  if (updates.membershipActiveUntil !== void 0) {
    certification.membershipActiveUntil = updates.membershipActiveUntil;
  }
  if (updates.lastActivityDate !== void 0) {
    certification.lastActivityDate = updates.lastActivityDate;
  }
  if (updates.activityCount !== void 0) {
    certification.activityCount = updates.activityCount;
  }
  if (updates.trustScore !== void 0) {
    certification.trustScore = updates.trustScore;
  }
  if (updates.dailyActionCount !== void 0) {
    certification.dailyActionCount = updates.dailyActionCount;
  }
  if (updates.lastActionReset !== void 0) {
    certification.lastActionReset = updates.lastActionReset;
  }
  if (updates.suspendedForNonPayment !== void 0) {
    certification.suspendedForNonPayment = updates.suspendedForNonPayment;
    if (updates.suspendedForNonPayment && certification.status === "approved") {
      certification.status = "suspended";
      console.log(`\u{1F4DC} [PriestHood Certification] Auto-suspended ${email} for non-payment`);
    }
  }
  CERTIFICATIONS.set(emailLower, certification);
  saveCertifications();
  return certification;
}
function approvePriesthood(email, approvedBy, reason) {
  const emailLower = email.toLowerCase();
  const certification = CERTIFICATIONS.get(emailLower);
  if (!certification) {
    throw new Error(`No priesthood application found for ${email}`);
  }
  if (certification.status !== "pending") {
    throw new Error(`Cannot approve certification with status: ${certification.status}`);
  }
  const priestUuid = `priest:${emailLower}:${Date.now()}`;
  const certificate = import_state.ROOT_CA.issueCertificate({
    subject: priestUuid,
    capabilities: ["PRIEST_MODE", "CREATE_GARDEN", "MANAGE_GARDENS"],
    constraints: {
      email: emailLower,
      grantedBy: approvedBy,
      grantedAt: Date.now(),
      priesthoodLevel: "certified"
    },
    ttlSeconds: 365 * 24 * 60 * 60
    // 1 year
  });
  import_state2.CERTIFICATE_REGISTRY.set(priestUuid, certificate);
  certification.status = "approved";
  certification.approvedAt = Date.now();
  certification.approvedBy = approvedBy;
  certification.certificate = certificate;
  if (reason) {
    certification.reason = reason;
  }
  CERTIFICATIONS.set(emailLower, certification);
  saveCertifications();
  console.log(`\u{1F4DC} [PriestHood Certification] Approved priesthood for ${email} by ${approvedBy}`);
  return certification;
}
function rejectPriesthood(email, rejectedBy, reason) {
  const emailLower = email.toLowerCase();
  const certification = CERTIFICATIONS.get(emailLower);
  if (!certification) {
    throw new Error(`No priesthood application found for ${email}`);
  }
  if (certification.status !== "pending") {
    throw new Error(`Cannot reject certification with status: ${certification.status}`);
  }
  certification.status = "rejected";
  certification.rejectedAt = Date.now();
  certification.rejectedBy = rejectedBy;
  if (reason) {
    certification.reason = reason;
  }
  CERTIFICATIONS.set(emailLower, certification);
  saveCertifications();
  console.log(`\u{1F4DC} [PriestHood Certification] Rejected priesthood application for ${email} by ${rejectedBy}`);
  return certification;
}
function revokePriesthood(email, revokedBy, reason) {
  const emailLower = email.toLowerCase();
  const certification = CERTIFICATIONS.get(emailLower);
  if (!certification) {
    throw new Error(`No priesthood certification found for ${email}`);
  }
  if (certification.status !== "approved") {
    throw new Error(`Cannot revoke certification with status: ${certification.status}`);
  }
  if (certification.certificate) {
    import_state2.CERTIFICATE_REGISTRY.delete(certification.certificate.subject);
    const certHash = `sha256:${crypto.createHash("sha256").update(JSON.stringify(certification.certificate)).digest("hex")}`;
    const revocation = {
      revoked_uuid: certification.certificate.subject,
      revoked_type: "priest",
      reason: reason || "Priesthood certification revoked",
      effective_at: Date.now(),
      cert_hash: certHash,
      severity: "hard",
      metadata: { revokedBy, email: emailLower }
    };
    import_state2.REVOCATION_REGISTRY.set(certification.certificate.subject, revocation);
    console.log(`\u{1F4DC} [PriestHood Certification] Revoked certificate for ${emailLower}`);
  }
  certification.status = "revoked";
  certification.revokedAt = Date.now();
  certification.revokedBy = revokedBy;
  if (reason) {
    certification.reason = reason;
  }
  certification.certificate = void 0;
  CERTIFICATIONS.set(emailLower, certification);
  saveCertifications();
  console.log(`\u{1F4DC} [PriestHood Certification] Revoked priesthood for ${email} by ${revokedBy}`);
  return certification;
}
function getCertificationStatus(email) {
  const emailLower = email.toLowerCase();
  return CERTIFICATIONS.get(emailLower) || null;
}
function hasPriesthoodCertification(email) {
  const certification = getCertificationStatus(email);
  return certification?.status === "approved" && !!certification.certificate;
}
function getAllCertifications() {
  return Array.from(CERTIFICATIONS.values());
}
function getCertificationsByStatus(status) {
  return Array.from(CERTIFICATIONS.values()).filter((cert) => cert.status === status);
}
function checkAndSuspendInactivePriests() {
  const now = Date.now();
  const INACTIVITY_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1e3;
  const all = getAllCertifications();
  let suspendedCount = 0;
  for (const cert of all) {
    if (cert.status === "approved") {
      const lastActivity = cert.lastActivityDate || cert.approvedAt || 0;
      const daysSinceActivity = (now - lastActivity) / (24 * 60 * 60 * 1e3);
      if (daysSinceActivity > 90) {
        updateCertificationBilling(cert.email, {
          suspendedForNonPayment: true
          // Reusing field for inactivity
        });
        suspendedCount++;
        console.log(`\u{1F4DC} [PriestHood Certification] Auto-suspended ${cert.email} - inactive for ${Math.floor(daysSinceActivity)} days`);
      }
    }
  }
  if (suspendedCount > 0) {
    console.log(`\u{1F4DC} [PriestHood Certification] Auto-suspended ${suspendedCount} priest(s) for inactivity`);
  }
}
function checkPriestRateLimit(email, actionType) {
  const certification = getCertificationStatus(email);
  if (!certification || certification.status !== "approved") {
    return false;
  }
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1e3;
  if (!certification.lastActionReset || certification.lastActionReset < oneDayAgo) {
    certification.dailyActionCount = 0;
    certification.lastActionReset = now;
  }
  switch (actionType) {
    case "action":
      if ((certification.dailyActionCount || 0) >= PRIEST_RATE_LIMITS.maxActionsPerDay) {
        console.log(`\u26A0\uFE0F  [PriestHood] Rate limit: ${email} exceeded daily action limit (${PRIEST_RATE_LIMITS.maxActionsPerDay})`);
        return false;
      }
      certification.dailyActionCount = (certification.dailyActionCount || 0) + 1;
      break;
    case "garden":
      const monthlyGardenCount = certification.activityCount || 0;
      if (monthlyGardenCount >= PRIEST_RATE_LIMITS.maxGardensCreated) {
        console.log(`\u26A0\uFE0F  [PriestHood] Rate limit: ${email} exceeded monthly garden creation limit (${PRIEST_RATE_LIMITS.maxGardensCreated})`);
        return false;
      }
      break;
  }
  certification.lastActivityDate = now;
  saveCertifications();
  return true;
}
function getCertificationStats() {
  const all = getAllCertifications();
  const stats = {
    total: all.length,
    pending: all.filter((c) => c.status === "pending").length,
    // "Certified Priests" must come from PriestHoodService truth:
    // approved + certificate present (legacy rows may be "approved" but missing cert)
    approved: all.filter((c) => c.status === "approved" && !!c.certificate).length,
    rejected: all.filter((c) => c.status === "rejected").length,
    revoked: all.filter((c) => c.status === "revoked").length,
    suspended: all.filter((c) => c.status === "suspended").length,
    revenue: {
      applicationFees: all.filter((c) => c.applicationFeePaid).length * APPLICATION_FEE,
      membershipFees: 0,
      // Membership is now FREE
      total: 0
    }
  };
  stats.revenue.total = stats.revenue.applicationFees + stats.revenue.membershipFees;
  return stats;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  APPLICATION_FEE,
  MEMBERSHIP_FEE,
  MEMBERSHIP_PERIOD_MS,
  PRIEST_RATE_LIMITS,
  applyForPriesthood,
  approvePriesthood,
  checkAndSuspendInactivePriests,
  checkPriestRateLimit,
  getAllCertifications,
  getCertificationStats,
  getCertificationStatus,
  getCertificationsByStatus,
  hasPriesthoodCertification,
  initializePriesthoodCertification,
  rejectPriesthood,
  revokePriesthood,
  updateCertificationBilling
});
//# sourceMappingURL=priesthoodCertification.js.map
