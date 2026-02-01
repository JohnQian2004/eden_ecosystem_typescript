#!/usr/bin/env node

/**
 * PKI Certificate Generation Script (Using selfsigned package)
 * Generates CA, server, and client certificates for HTTPS/WSS
 * Works on all platforms including Windows without OpenSSL
 */

const selfsigned = require("selfsigned");
const fs = require("fs");
const path = require("path");

const CERT_DIR = path.join(__dirname, "..", "certs");

// Ensure certs directory exists
if (!fs.existsSync(CERT_DIR)) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  console.log(`✅ Created certs directory: ${CERT_DIR}`);
}

const CA_KEY_PATH = path.join(CERT_DIR, "ca-key.pem");
const CA_CERT_PATH = path.join(CERT_DIR, "ca-cert.pem");
const SERVER_KEY_PATH = path.join(CERT_DIR, "server-key.pem");
const SERVER_CERT_PATH = path.join(CERT_DIR, "server-cert.pem");
const CLIENT_KEY_PATH = path.join(CERT_DIR, "client-key.pem");
const CLIENT_CERT_PATH = path.join(CERT_DIR, "client-cert.pem");

/**
 * Generate CA certificate
 */
function generateCA() {
  console.log("🔐 Generating CA certificate...");
  
  const attrs = [
    { name: "commonName", value: "Eden Root CA" },
    { name: "organizationName", value: "Eden Ecosystem" },
    { name: "organizationalUnitName", value: "PKI" },
    { name: "countryName", value: "US" },
  ];

  const pems = selfsigned.generate(attrs, {
    keySize: 2048,
    days: 3650, // 10 years for CA
    algorithm: "sha256",
  });

  // Save CA key and cert
  fs.writeFileSync(CA_KEY_PATH, pems.private);
  fs.writeFileSync(CA_CERT_PATH, pems.cert);

  console.log(`✅ CA certificate generated:`);
  console.log(`   Key: ${CA_KEY_PATH}`);
  console.log(`   Cert: ${CA_CERT_PATH}`);

  return { private: pems.private, cert: pems.cert };
}

/**
 * Generate server certificate
 */
function generateServerCert() {
  console.log("🔐 Generating server certificate...");

  // Get server IP from environment or use default
  const serverIP = process.env.SERVER_IP || "50.76.0.85";
  console.log(`   Including server IP in certificate: ${serverIP}`);

  const attrs = [
    { name: "commonName", value: serverIP }, // Use IP as CN
    { name: "organizationName", value: "Eden Ecosystem" },
    { name: "organizationalUnitName", value: "PKI" },
    { name: "countryName", value: "US" },
  ];
  
  const pems = selfsigned.generate(attrs, {
    keySize: 2048,
    days: 365,
    algorithm: "sha256",
    extensions: [
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" }, // DNS
          { type: 2, value: serverIP }, // DNS (IP as hostname)
          { type: 7, ip: "127.0.0.1" }, // IP
          { type: 7, ip: "::1" }, // IPv6
          { type: 7, ip: serverIP }, // Server IP
        ],
      },
    ],
  });

  // Save server key and cert
  fs.writeFileSync(SERVER_KEY_PATH, pems.private);
  fs.writeFileSync(SERVER_CERT_PATH, pems.cert);

  console.log(`✅ Server certificate generated:`);
  console.log(`   Key: ${SERVER_KEY_PATH}`);
  console.log(`   Cert: ${SERVER_CERT_PATH}`);

  return { private: pems.private, cert: pems.cert };
}

/**
 * Generate client certificate
 */
function generateClientCert() {
  console.log("🔐 Generating client certificate...");

  const attrs = [
    { name: "commonName", value: "Eden Client" },
    { name: "organizationName", value: "Eden Ecosystem" },
    { name: "organizationalUnitName", value: "PKI" },
    { name: "countryName", value: "US" },
  ];

  const pems = selfsigned.generate(attrs, {
    keySize: 2048,
    days: 365,
    algorithm: "sha256",
  });

  // Save client key and cert
  fs.writeFileSync(CLIENT_KEY_PATH, pems.private);
  fs.writeFileSync(CLIENT_CERT_PATH, pems.cert);

  console.log(`✅ Client certificate generated:`);
  console.log(`   Key: ${CLIENT_KEY_PATH}`);
  console.log(`   Cert: ${CLIENT_CERT_PATH}`);

  return { private: pems.private, cert: pems.cert };
}

// Main execution
console.log("🔐 ========================================");
console.log("🔐 Eden PKI Certificate Generation");
console.log("🔐 Using selfsigned package (no OpenSSL required)");
console.log("🔐 ========================================\n");

try {
  // Generate CA
  generateCA();

  // Generate server cert
  generateServerCert();

  // Generate client cert
  generateClientCert();

  console.log("\n✅ ========================================");
  console.log("✅ All certificates generated successfully!");
  console.log("✅ ========================================");
  console.log("\n📝 Certificate locations:");
  console.log(`   CA Cert: ${CA_CERT_PATH}`);
  console.log(`   Server Key: ${SERVER_KEY_PATH}`);
  console.log(`   Server Cert: ${SERVER_CERT_PATH}`);
  console.log(`   Client Key: ${CLIENT_KEY_PATH}`);
  console.log(`   Client Cert: ${CLIENT_CERT_PATH}`);
  console.log("\n📝 Next steps:");
  console.log("   1. Import ca-cert.pem into your browser/OS trust store");
  console.log("   2. Start server with --enable-https true");
  console.log("   3. Access Angular via https://localhost:3000");
  console.log("   4. For mobile app, ensure API uses https://50.76.0.85:3000");
  console.log("\n📖 See server/HTTPS_SETUP.md for detailed instructions");
} catch (error) {
  console.error("❌ Error generating certificates:", error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  console.error("\n💡 Make sure 'selfsigned' package is installed:");
  console.error("   npm install selfsigned");
  process.exit(1);
}
