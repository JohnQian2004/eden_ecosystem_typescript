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
var config_exports = {};
__export(config_exports, {
  CA_CERT_PATH: () => CA_CERT_PATH,
  CERT_DIR: () => CERT_DIR,
  DEPLOYED_AS_ROOT: () => DEPLOYED_AS_ROOT,
  EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS: () => EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS,
  ENABLE_HTTPS: () => ENABLE_HTTPS,
  ENABLE_OPENAI: () => ENABLE_OPENAI,
  FRONTEND_PATH: () => FRONTEND_PATH,
  HTTP_PORT: () => HTTP_PORT,
  MOCKED_LLM: () => MOCKED_LLM,
  NUM_GARDENS: () => NUM_GARDENS,
  NUM_TOKEN_GARDENS: () => NUM_TOKEN_GARDENS,
  SERVER_CERT_PATH: () => SERVER_CERT_PATH,
  SERVER_KEY_PATH: () => SERVER_KEY_PATH,
  SKIP_REDIS: () => SKIP_REDIS,
  STRIPE_PUBLISHABLE_KEY: () => STRIPE_PUBLISHABLE_KEY,
  STRIPE_SECRET_KEY: () => STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: () => STRIPE_WEBHOOK_SECRET
});
module.exports = __toCommonJS(config_exports);
var process = __toESM(require("process"));
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
const args = process.argv.slice(2);
const MOCKED_LLM = args.some((arg) => arg.includes("--mocked-llm") && (arg.includes("=true") || !arg.includes("=false")));
const SKIP_REDIS = args.some((arg) => arg.includes("--skip-redis") && (arg.includes("=true") || !arg.includes("=false")));
const ENABLE_OPENAI = true;
const DEPLOYED_AS_ROOT = args.some((arg) => arg.includes("--deployed-as-root") && (arg.includes("=true") || !arg.includes("=false")));
const ENABLE_HTTPS = args.some((arg) => arg.includes("--enable-https") && (arg.includes("=true") || !arg.includes("=false")));
const indexersArg = args.find((arg) => arg.startsWith("--indexers"));
const NUM_GARDENS = DEPLOYED_AS_ROOT ? 0 : indexersArg ? parseInt(indexersArg.split("=")[1] || "2") : 2;
const tokenIndexersArg = args.find((arg) => arg.startsWith("--token-indexers"));
const NUM_TOKEN_GARDENS = DEPLOYED_AS_ROOT ? 0 : tokenIndexersArg ? parseInt(tokenIndexersArg.split("=")[1] || "2") : 2;
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000");
let projectRoot = __dirname;
let foundFrontend = false;
for (let i = 0; i < 5; i++) {
  const frontendPath = path.join(projectRoot, "frontend");
  if (fs.existsSync(frontendPath)) {
    foundFrontend = true;
    break;
  }
  const parent = path.dirname(projectRoot);
  if (parent === projectRoot) {
    break;
  }
  projectRoot = parent;
}
if (!foundFrontend) {
  projectRoot = path.resolve(__dirname, "../..");
  console.warn(`\u26A0\uFE0F  Could not find frontend directory by traversing up from ${__dirname}`);
  console.warn(`   Using fallback project root: ${projectRoot}`);
}
const FRONTEND_PATH = process.env.FRONTEND_PATH || path.join(projectRoot, "frontend/dist/eden-sim-frontend");
console.log(`\u{1F4C1} [Config] __dirname: ${__dirname}`);
console.log(`\u{1F4C1} [Config] Resolved project root: ${projectRoot}`);
console.log(`\u{1F4C1} [Config] Resolved FRONTEND_PATH: ${FRONTEND_PATH}`);
console.log(`\u{1F4C1} [Config] Frontend directory exists: ${fs.existsSync(FRONTEND_PATH)}`);
if (fs.existsSync(FRONTEND_PATH)) {
  try {
    const files = fs.readdirSync(FRONTEND_PATH);
    console.log(`\u{1F4C1} [Config] Files in frontend directory: ${files.slice(0, 5).join(", ")}${files.length > 5 ? "..." : ""}`);
  } catch (e) {
    console.log(`\u{1F4C1} [Config] Could not read frontend directory: ${e}`);
  }
} else {
  const frontendDistPath = path.join(projectRoot, "frontend/dist");
  const frontendPath = path.join(projectRoot, "frontend");
  console.log(`\u{1F4C1} [Config] frontend/dist exists: ${fs.existsSync(frontendDistPath)}`);
  console.log(`\u{1F4C1} [Config] frontend exists: ${fs.existsSync(frontendPath)}`);
}
const CERT_DIR = path.join(__dirname, "..", "certs");
const SERVER_KEY_PATH = path.join(CERT_DIR, "server-key.pem");
const SERVER_CERT_PATH = path.join(CERT_DIR, "server-cert.pem");
const CA_CERT_PATH = path.join(CERT_DIR, "ca-cert.pem");
const STRIPE_SECRET_KEY = "sk_test_51RrflYP4h6MOSVxDAFUAr0i7mmsQ8MSGi9Y0atxTsVaeVZsokRn09C9AEc0TWHidYdicNnGBTRpgJsoGz2CsZ0HC009CA5NFCn";
const STRIPE_PUBLISHABLE_KEY = "pk_test_51RrflYP4h6MOSVxDENdMiwOSbNudvzG8PlrrhslZjfbg9qPvb8YkzVR42ro5bQ8nXUnnbuPQpSlI43SHBuKhiCS000VgCDGNrC";
const STRIPE_WEBHOOK_SECRET = "whsec_your_webhook_secret_here";
const EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS = String(process.env.EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS || "").toLowerCase() === "true";
const openaiApiKeyArg = args.find((arg) => arg.startsWith("--openai-api-key"));
if (openaiApiKeyArg) {
  const apiKey = openaiApiKeyArg.split("=")[1];
  if (apiKey) {
    process.env.OPENAI_API_KEY = apiKey;
    console.log(`\u2705 [Config] OpenAI API key set from command line argument`);
  } else {
    console.warn(`\u26A0\uFE0F [Config] --openai-api-key flag provided but no value specified`);
  }
} else if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = "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";
  console.log(`\u2705 [Config] Using hardcoded OpenAI API key`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CA_CERT_PATH,
  CERT_DIR,
  DEPLOYED_AS_ROOT,
  EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS,
  ENABLE_HTTPS,
  ENABLE_OPENAI,
  FRONTEND_PATH,
  HTTP_PORT,
  MOCKED_LLM,
  NUM_GARDENS,
  NUM_TOKEN_GARDENS,
  SERVER_CERT_PATH,
  SERVER_KEY_PATH,
  SKIP_REDIS,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET
});
//# sourceMappingURL=config.js.map
