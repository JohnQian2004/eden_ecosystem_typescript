#!/usr/bin/env ts-node

/**
 * PKI Certificate Generation Script
 * Generates CA, server, and client certificates for HTTPS/WSS
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const CERT_DIR = path.join(__dirname, "..", "certs");
const CA_KEY_PATH = path.join(CERT_DIR, "ca-key.pem");
const CA_CERT_PATH = path.join(CERT_DIR, "ca-cert.pem");
const SERVER_KEY_PATH = path.join(CERT_DIR, "server-key.pem");
const SERVER_CERT_PATH = path.join(CERT_DIR, "server-cert.pem");
const CLIENT_KEY_PATH = path.join(CERT_DIR, "client-key.pem");
const CLIENT_CERT_PATH = path.join(CERT_DIR, "client-cert.pem");

// Ensure certs directory exists
if (!fs.existsSync(CERT_DIR)) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  console.log(`✅ Created certs directory: ${CERT_DIR}`);
}

/**
 * Generate a self-signed certificate
 */
function generateCertificate(
  commonName: string,
  subjectAltNames: string[] = [],
  issuerKey?: crypto.KeyObject,
  issuerCert?: crypto.X509Certificate,
  isCA: boolean = false
): { key: crypto.KeyObject; cert: Buffer } {
  // Generate key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  const keyObject = crypto.createPrivateKey(privateKey);

  // Certificate options
  const certOptions: any = {
    subject: {
      CN: commonName,
      O: "Eden Ecosystem",
      OU: "PKI",
      C: "US",
    },
    issuer: issuerCert
      ? issuerCert.subject
      : {
          CN: commonName,
          O: "Eden Ecosystem",
          OU: "PKI",
          C: "US",
        },
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    serialNumber: crypto.randomBytes(8).toString("hex"),
    keyUsage: isCA
      ? ["keyCertSign", "cRLSign"]
      : ["digitalSignature", "keyEncipherment"],
    extKeyUsage: isCA ? [] : ["serverAuth", "clientAuth"],
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

  // Create certificate
  const cert = new crypto.X509Certificate(
    crypto.x509Certificate({
      ...certOptions,
      publicKey: publicKey,
      signingKey: issuerKey || keyObject,
    })
  );

  return {
    key: keyObject,
    cert: Buffer.from(cert.toString("pem")),
  };
}

/**
 * Generate CA certificate
 */
function generateCA(): { key: crypto.KeyObject; cert: Buffer } {
  console.log("🔐 Generating CA certificate...");
  const { key, cert } = generateCertificate("Eden Root CA", [], undefined, undefined, true);

  // Save CA key and cert
  fs.writeFileSync(CA_KEY_PATH, crypto.createPrivateKey(key.export({ format: "pem", type: "pkcs8" })).export({ format: "pem", type: "pkcs8" }));
  fs.writeFileSync(CA_CERT_PATH, cert);

  console.log(`✅ CA certificate generated:`);
  console.log(`   Key: ${CA_KEY_PATH}`);
  console.log(`   Cert: ${CA_CERT_PATH}`);

  return { key, cert };
}

/**
 * Generate server certificate
 */
function generateServerCert(caKey: crypto.KeyObject, caCert: Buffer): { key: crypto.KeyObject; cert: Buffer } {
  console.log("🔐 Generating server certificate...");
  
  const caCertObj = new crypto.X509Certificate(caCert);
  const subjectAltNames = [
    "localhost",
    "127.0.0.1",
    "::1",
    "IP:127.0.0.1",
    "IP:::1",
  ];

  const { key, cert } = generateCertificate(
    "Eden Server",
    subjectAltNames,
    caKey,
    caCertObj,
    false
  );

  // Save server key and cert
  fs.writeFileSync(SERVER_KEY_PATH, crypto.createPrivateKey(key.export({ format: "pem", type: "pkcs8" })).export({ format: "pem", type: "pkcs8" }));
  fs.writeFileSync(SERVER_CERT_PATH, cert);

  console.log(`✅ Server certificate generated:`);
  console.log(`   Key: ${SERVER_KEY_PATH}`);
  console.log(`   Cert: ${SERVER_CERT_PATH}`);

  return { key, cert };
}

/**
 * Generate client certificate
 */
function generateClientCert(caKey: crypto.KeyObject, caCert: Buffer): { key: crypto.KeyObject; cert: Buffer } {
  console.log("🔐 Generating client certificate...");
  
  const caCertObj = new crypto.X509Certificate(caCert);

  const { key, cert } = generateCertificate(
    "Eden Client",
    [],
    caKey,
    caCertObj,
    false
  );

  // Save client key and cert
  fs.writeFileSync(CLIENT_KEY_PATH, crypto.createPrivateKey(key.export({ format: "pem", type: "pkcs8" })).export({ format: "pem", type: "pkcs8" }));
  fs.writeFileSync(CLIENT_CERT_PATH, cert);

  console.log(`✅ Client certificate generated:`);
  console.log(`   Key: ${CLIENT_KEY_PATH}`);
  console.log(`   Cert: ${CLIENT_CERT_PATH}`);

  return { key, cert };
}

// Main execution
console.log("🔐 ========================================");
console.log("🔐 Eden PKI Certificate Generation");
console.log("🔐 ========================================\n");

try {
  // Generate CA
  const { key: caKey, cert: caCert } = generateCA();

  // Generate server cert signed by CA
  generateServerCert(caKey, caCert);

  // Generate client cert signed by CA
  generateClientCert(caKey, caCert);

  console.log("\n✅ ========================================");
  console.log("✅ All certificates generated successfully!");
  console.log("✅ ========================================");
  console.log("\n📝 Next steps:");
  console.log("   1. Import ca-cert.pem into your browser/OS trust store");
  console.log("   2. Start server with --enable-https true");
  console.log("   3. Access Angular via https://localhost:3000");
} catch (error: any) {
  console.error("❌ Error generating certificates:", error.message);
  console.error(error.stack);
  process.exit(1);
}

