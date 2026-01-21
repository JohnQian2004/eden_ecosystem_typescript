/**
 * Configuration Module
 * Manages CLI flags, environment variables, and runtime configuration
 */

import * as process from "process";
import * as path from "path";

// CLI Flags
const args = process.argv.slice(2);

export const MOCKED_LLM = args.some(arg => arg.includes("--mocked-llm") && (arg.includes("=true") || !arg.includes("=false")));
export const SKIP_REDIS = args.some(arg => arg.includes("--skip-redis") && (arg.includes("=true") || !arg.includes("=false")));
// DISABLED DeepSeek - Always use OpenAI (ChatGPT 4o) as default
export const ENABLE_OPENAI = true; // Force OpenAI, ignore --enable-openai flag
export const DEPLOYED_AS_ROOT = args.some(arg => arg.includes("--deployed-as-root") && (arg.includes("=true") || !arg.includes("=false")));

// Parse --indexers flag (default: 2, ignored if DEPLOYED_AS_ROOT)
const indexersArg = args.find(arg => arg.startsWith("--indexers"));
export const NUM_GARDENS = DEPLOYED_AS_ROOT ? 0 : (indexersArg ? parseInt(indexersArg.split("=")[1] || "2") : 2);

// Parse --token-indexers flag (default: 2, ignored if DEPLOYED_AS_ROOT)
const tokenIndexersArg = args.find(arg => arg.startsWith("--token-indexers"));
export const NUM_TOKEN_GARDENS = DEPLOYED_AS_ROOT ? 0 : (tokenIndexersArg ? parseInt(tokenIndexersArg.split("=")[1] || "2") : 2);

// Server Configuration
export const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000");
export const FRONTEND_PATH = process.env.FRONTEND_PATH || path.join(__dirname, "../frontend/dist/eden-sim-frontend");

// Stripe Configuration (hardcoded as requested)
export const STRIPE_SECRET_KEY = "sk_test_51RrflYP4h6MOSVxDAFUAr0i7mmsQ8MSGi9Y0atxTsVaeVZsokRn09C9AEc0TWHidYdicNnGBTRpgJsoGz2CsZ0HC009CA5NFCn";
export const STRIPE_PUBLISHABLE_KEY = "pk_test_51RrflYP4h6MOSVxDENdMiwOSbNudvzG8PlrrhslZjfbg9qPvb8YkzVR42ro5bQ8nXUnnbuPQpSlI43SHBuKhiCS000VgCDGNrC";
export const STRIPE_WEBHOOK_SECRET = "whsec_your_webhook_secret_here"; // Update with actual webhook secret from Stripe dashboard

