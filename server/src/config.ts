/**
 * Configuration Module
 * Manages CLI flags, environment variables, and runtime configuration
 */

import * as process from "process";
import * as path from "path";
import * as fs from "fs";

// CLI Flags
const args = process.argv.slice(2);

export const MOCKED_LLM = args.some(arg => arg.includes("--mocked-llm") && (arg.includes("=true") || !arg.includes("=false")));
export const SKIP_REDIS = args.some(arg => arg.includes("--skip-redis") && (arg.includes("=true") || !arg.includes("=false")));
// DISABLED DeepSeek - Always use OpenAI (ChatGPT 4o) as default
export const ENABLE_OPENAI = true; // Force OpenAI, ignore --enable-openai flag
export const DEPLOYED_AS_ROOT = args.some(arg => arg.includes("--deployed-as-root") && (arg.includes("=true") || !arg.includes("=false")));
export const ENABLE_HTTPS = args.some(arg => arg.includes("--enable-https") && (arg.includes("=true") || !arg.includes("=false")));

// Parse --indexers flag (default: 2, ignored if DEPLOYED_AS_ROOT)
const indexersArg = args.find(arg => arg.startsWith("--indexers"));
export const NUM_GARDENS = DEPLOYED_AS_ROOT ? 0 : (indexersArg ? parseInt(indexersArg.split("=")[1] || "2") : 2);

// Parse --token-indexers flag (default: 2, ignored if DEPLOYED_AS_ROOT)
const tokenIndexersArg = args.find(arg => arg.startsWith("--token-indexers"));
export const NUM_TOKEN_GARDENS = DEPLOYED_AS_ROOT ? 0 : (tokenIndexersArg ? parseInt(tokenIndexersArg.split("=")[1] || "2") : 2);

// Server Configuration
export const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000");
// FRONTEND_PATH: Resolve relative to project root (not server directory)
// When running with ts-node: __dirname = server/src, so ../.. = project root
// When running compiled: __dirname = server/dist/src, so ../../.. = project root
// Use a more robust approach: go up until we find the frontend directory
let projectRoot = __dirname;
let foundFrontend = false;
// Go up at most 5 levels to find project root
for (let i = 0; i < 5; i++) {
  const frontendPath = path.join(projectRoot, "frontend");
  if (fs.existsSync(frontendPath)) {
    foundFrontend = true;
    break;
  }
  const parent = path.dirname(projectRoot);
  if (parent === projectRoot) {
    // Reached filesystem root
    break;
  }
  projectRoot = parent;
}

if (!foundFrontend) {
  // Fallback: assume project root is 2 levels up from server/src
  projectRoot = path.resolve(__dirname, "../..");
  console.warn(`⚠️  Could not find frontend directory by traversing up from ${__dirname}`);
  console.warn(`   Using fallback project root: ${projectRoot}`);
}

export const FRONTEND_PATH = process.env.FRONTEND_PATH || path.join(projectRoot, "frontend/dist/eden-sim-frontend");
console.log(`📁 [Config] __dirname: ${__dirname}`);
console.log(`📁 [Config] Resolved project root: ${projectRoot}`);
console.log(`📁 [Config] Resolved FRONTEND_PATH: ${FRONTEND_PATH}`);
console.log(`📁 [Config] Frontend directory exists: ${fs.existsSync(FRONTEND_PATH)}`);
if (fs.existsSync(FRONTEND_PATH)) {
  try {
    const files = fs.readdirSync(FRONTEND_PATH);
    console.log(`📁 [Config] Files in frontend directory: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
  } catch (e) {
    console.log(`📁 [Config] Could not read frontend directory: ${e}`);
  }
} else {
  // Check if parent directories exist
  const frontendDistPath = path.join(projectRoot, "frontend/dist");
  const frontendPath = path.join(projectRoot, "frontend");
  console.log(`📁 [Config] frontend/dist exists: ${fs.existsSync(frontendDistPath)}`);
  console.log(`📁 [Config] frontend exists: ${fs.existsSync(frontendPath)}`);
}

// HTTPS Configuration
export const CERT_DIR = path.join(__dirname, "..", "certs");
export const SERVER_KEY_PATH = path.join(CERT_DIR, "server-key.pem");
export const SERVER_CERT_PATH = path.join(CERT_DIR, "server-cert.pem");
export const CA_CERT_PATH = path.join(CERT_DIR, "ca-cert.pem");

// Stripe Configuration (hardcoded as requested)
export const STRIPE_SECRET_KEY = "sk_test_51RrflYP4h6MOSVxDAFUAr0i7mmsQ8MSGi9Y0atxTsVaeVZsokRn09C9AEc0TWHidYdicNnGBTRpgJsoGz2CsZ0HC009CA5NFCn";
export const STRIPE_PUBLISHABLE_KEY = "pk_test_51RrflYP4h6MOSVxDENdMiwOSbNudvzG8PlrrhslZjfbg9qPvb8YkzVR42ro5bQ8nXUnnbuPQpSlI43SHBuKhiCS000VgCDGNrC";
export const STRIPE_WEBHOOK_SECRET = "whsec_your_webhook_secret_here"; // Update with actual webhook secret from Stripe dashboard

// Provider webhook demo behavior (default off for real deployments)
export const EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS = String(process.env.EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS || "").toLowerCase() === "true";

// OpenAI API Key (hardcoded)
// Parse --openai-api-key flag and set it in process.env if provided, otherwise use hardcoded value
const openaiApiKeyArg = args.find(arg => arg.startsWith("--openai-api-key"));
if (openaiApiKeyArg) {
  const apiKey = openaiApiKeyArg.split("=")[1];
  if (apiKey) {
    process.env.OPENAI_API_KEY = apiKey;
    console.log(`✅ [Config] OpenAI API key set from command line argument`);
  } else {
    console.warn(`⚠️ [Config] --openai-api-key flag provided but no value specified`);
  }
} else if (!process.env.OPENAI_API_KEY) {
  // Hardcoded API key
  process.env.OPENAI_API_KEY = "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";
  console.log(`✅ [Config] Using hardcoded OpenAI API key`);
}

