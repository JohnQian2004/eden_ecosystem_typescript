#!/usr/bin/env ts-node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var crypto = __toESM(require("crypto"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
const CERT_DIR = path.join(__dirname, "..", "certs");
const CA_KEY_PATH = path.join(CERT_DIR, "ca-key.pem");
const CA_CERT_PATH = path.join(CERT_DIR, "ca-cert.pem");
const SERVER_KEY_PATH = path.join(CERT_DIR, "server-key.pem");
const SERVER_CERT_PATH = path.join(CERT_DIR, "server-cert.pem");
const CLIENT_KEY_PATH = path.join(CERT_DIR, "client-key.pem");
const CLIENT_CERT_PATH = path.join(CERT_DIR, "client-cert.pem");
if (!fs.existsSync(CERT_DIR)) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  console.log(`\u2705 Created certs directory: ${CERT_DIR}`);
}
function generateCertificate(commonName, subjectAltNames = [], issuerKey, issuerCert, isCA = false) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem"
    }
  });
  const keyObject = crypto.createPrivateKey(privateKey);
  const certOptions = {
    subject: {
      CN: commonName,
      O: "Eden Ecosystem",
      OU: "PKI",
      C: "US"
    },
    issuer: issuerCert ? issuerCert.subject : {
      CN: commonName,
      O: "Eden Ecosystem",
      OU: "PKI",
      C: "US"
    },
    notBefore: /* @__PURE__ */ new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3),
    // 1 year
    serialNumber: crypto.randomBytes(8).toString("hex"),
    keyUsage: isCA ? ["keyCertSign", "cRLSign"] : ["digitalSignature", "keyEncipherment"],
    extKeyUsage: isCA ? [] : ["serverAuth", "clientAuth"]
  };
  if (subjectAltNames.length > 0) {
    certOptions.subjectAltName = subjectAltNames.map((name) => {
      if (name.startsWith("IP:")) {
        return `IP:${name.substring(3)}`;
      } else if (name.includes(":")) {
        return `IP:${name}`;
      } else {
        return `DNS:${name}`;
      }
    });
  }
  const cert = new crypto.X509Certificate(
    crypto.x509Certificate({
      ...certOptions,
      publicKey,
      signingKey: issuerKey || keyObject
    })
  );
  return {
    key: keyObject,
    cert: Buffer.from(cert.toString("pem"))
  };
}
function generateCA() {
  console.log("\u{1F510} Generating CA certificate...");
  const { key, cert } = generateCertificate("Eden Root CA", [], void 0, void 0, true);
  fs.writeFileSync(CA_KEY_PATH, crypto.createPrivateKey(key.export({ format: "pem", type: "pkcs8" })).export({ format: "pem", type: "pkcs8" }));
  fs.writeFileSync(CA_CERT_PATH, cert);
  console.log(`\u2705 CA certificate generated:`);
  console.log(`   Key: ${CA_KEY_PATH}`);
  console.log(`   Cert: ${CA_CERT_PATH}`);
  return { key, cert };
}
function generateServerCert(caKey, caCert) {
  console.log("\u{1F510} Generating server certificate...");
  const caCertObj = new crypto.X509Certificate(caCert);
  const subjectAltNames = [
    "localhost",
    "127.0.0.1",
    "::1",
    "IP:127.0.0.1",
    "IP:::1"
  ];
  const { key, cert } = generateCertificate(
    "Eden Server",
    subjectAltNames,
    caKey,
    caCertObj,
    false
  );
  fs.writeFileSync(SERVER_KEY_PATH, crypto.createPrivateKey(key.export({ format: "pem", type: "pkcs8" })).export({ format: "pem", type: "pkcs8" }));
  fs.writeFileSync(SERVER_CERT_PATH, cert);
  console.log(`\u2705 Server certificate generated:`);
  console.log(`   Key: ${SERVER_KEY_PATH}`);
  console.log(`   Cert: ${SERVER_CERT_PATH}`);
  return { key, cert };
}
function generateClientCert(caKey, caCert) {
  console.log("\u{1F510} Generating client certificate...");
  const caCertObj = new crypto.X509Certificate(caCert);
  const { key, cert } = generateCertificate(
    "Eden Client",
    [],
    caKey,
    caCertObj,
    false
  );
  fs.writeFileSync(CLIENT_KEY_PATH, crypto.createPrivateKey(key.export({ format: "pem", type: "pkcs8" })).export({ format: "pem", type: "pkcs8" }));
  fs.writeFileSync(CLIENT_CERT_PATH, cert);
  console.log(`\u2705 Client certificate generated:`);
  console.log(`   Key: ${CLIENT_KEY_PATH}`);
  console.log(`   Cert: ${CLIENT_CERT_PATH}`);
  return { key, cert };
}
console.log("\u{1F510} ========================================");
console.log("\u{1F510} Eden PKI Certificate Generation");
console.log("\u{1F510} ========================================\n");
try {
  const { key: caKey, cert: caCert } = generateCA();
  generateServerCert(caKey, caCert);
  generateClientCert(caKey, caCert);
  console.log("\n\u2705 ========================================");
  console.log("\u2705 All certificates generated successfully!");
  console.log("\u2705 ========================================");
  console.log("\n\u{1F4DD} Next steps:");
  console.log("   1. Import ca-cert.pem into your browser/OS trust store");
  console.log("   2. Start server with --enable-https true");
  console.log("   3. Access Angular via https://localhost:3000");
} catch (error) {
  console.error("\u274C Error generating certificates:", error.message);
  console.error(error.stack);
  process.exit(1);
}
//# sourceMappingURL=generate-pki-certs.js.map
