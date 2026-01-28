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
var llmServiceMapper_exports = {};
__export(llmServiceMapper_exports, {
  LLM_SERVICE_SELECTION_PROMPT: () => LLM_SERVICE_SELECTION_PROMPT,
  getServiceRegistrySummary: () => getServiceRegistrySummary,
  mapUserInputToServices: () => mapUserInputToServices
});
module.exports = __toCommonJS(llmServiceMapper_exports);
var import_llm = require("./llm");
var import_state = require("./state");
var import_config = require("./config");
const LLM_SERVICE_SELECTION_PROMPT = `
You are Eden ROOT CA AI - GOD's service selection controller.
Your role is to analyze user natural language input and select the best matching services
from the Eden service registry.

CRITICAL RULES:
1. You have access to the FULL service registry (excluding ROOT CA core services)
2. You must select services that best match the user's intent
3. You can select multiple services if the user wants multiple options
4. You must provide confidence scores and reasoning for each selection
5. You must extract filters (location, price, time, genre, quantity, etc.) from user input

SERVICE REGISTRY STRUCTURE:
Each service provider has:
- id: Provider identifier (e.g., "amc-001", "cinemark-001")
- name: Provider name (e.g., "AMC Theatres", "Cinemark")
- serviceType: Type of service (e.g., "movie", "restaurant", "hotel", "airline", "dex")
- gardenId: The garden/indexer this service belongs to
- location: Service location (e.g., "Baltimore, Maryland", "White Marsh, Maryland")
- apiEndpoint: API endpoint for querying this service

EXCLUSIONS:
- DO NOT select ROOT CA core services (these are system services, not user-facing)
- DO NOT select services with status "revoked" or "suspended"
- Only select "active" services

SELECTION CRITERIA:
1. Match serviceType to user intent (movie, restaurant, hotel, airline, etc.)
2. Match location if specified (e.g., "white marsh" \u2192 services in White Marsh, Maryland)
3. Match price preferences (e.g., "best price" \u2192 select services with competitive pricing)
4. Match time preferences (e.g., "tonight" \u2192 select services available tonight)
5. Match genre/category if specified (e.g., "sci-fi" \u2192 filter movie listings by genre)
6. Match quantity if specified (e.g., "two movies" \u2192 ensure service can provide 2 tickets)

OUTPUT FORMAT:
Return JSON only with this structure:
{
  "serviceType": "movie" | "restaurant" | "hotel" | "airline" | "dex" | etc.,
  "selectedProviders": [
    {
      "providerId": "amc-001",
      "providerName": "AMC Theatres",
      "gardenId": "HG",
      "confidence": 0.95,
      "reason": "Matches location (White Marsh), service type (movie), and has competitive pricing"
    }
  ],
  "selectedGardenId": "HG" | null, // Optional: if user explicitly wants a specific garden
  "filters": {
    "location": "White Marsh, Maryland",
    "maxPrice": "best",
    "genre": "sci-fi",
    "time": "tonight",
    "quantity": 2
  },
  "confidence": 0.92
}

EXAMPLES:

Input: "I want two sci-fi movies tonight at best price in white marsh"
Service Registry: [
  { id: "amc-001", name: "AMC Theatres", serviceType: "movie", gardenId: "HG", location: "White Marsh, Maryland" },
  { id: "cinemark-001", name: "Cinemark", serviceType: "movie", gardenId: "HG", location: "Baltimore, Maryland" }
]
Output: {
  "serviceType": "movie",
  "selectedProviders": [
    {
      "providerId": "amc-001",
      "providerName": "AMC Theatres",
      "gardenId": "HG",
      "confidence": 0.98,
      "reason": "Perfect match: location (White Marsh), service type (movie), supports multiple tickets"
    }
  ],
  "filters": {
    "location": "White Marsh, Maryland",
    "maxPrice": "best",
    "genre": "sci-fi",
    "time": "tonight",
    "quantity": 2
  },
  "confidence": 0.98
}

Input: "Find me a hotel in Paris for next week"
Service Registry: [
  { id: "hotel-001", name: "Paris Grand Hotel", serviceType: "hotel", gardenId: "HG", location: "Paris, France" }
]
Output: {
  "serviceType": "hotel",
  "selectedProviders": [
    {
      "providerId": "hotel-001",
      "providerName": "Paris Grand Hotel",
      "gardenId": "HG",
      "confidence": 0.95,
      "reason": "Matches location (Paris) and service type (hotel)"
    }
  ],
  "filters": {
    "location": "Paris, France",
    "time": "next week"
  },
  "confidence": 0.95
}

CRITICAL: Return ONLY valid JSON. No explanations, no markdown, just the JSON object.
`;
function filterCoreServices(providers) {
  const coreServiceTypes = ["root-ca", "system", "infrastructure"];
  const coreServiceIds = ["root-ca-service", "system-service"];
  return providers.filter((provider) => {
    if (provider.status === "revoked" || provider.status === "suspended") {
      return false;
    }
    if (coreServiceTypes.includes(provider.serviceType?.toLowerCase() || "")) {
      return false;
    }
    if (coreServiceIds.includes(provider.id?.toLowerCase() || "")) {
      return false;
    }
    return true;
  });
}
async function mapUserInputToServices(userInput, availableProviders) {
  if (import_config.MOCKED_LLM) {
    return {
      serviceType: "movie",
      selectedProviders: [
        {
          providerId: "amc-001",
          providerName: "AMC Theatres",
          gardenId: "HG",
          confidence: 0.95,
          reason: "Mock selection for testing"
        }
      ],
      filters: {
        location: "White Marsh, Maryland",
        maxPrice: "best",
        genre: "sci-fi",
        time: "tonight",
        quantity: 2
      },
      confidence: 0.95
    };
  }
  let providers = availableProviders || Array.from(import_state.ROOT_CA_SERVICE_REGISTRY);
  providers = filterCoreServices(providers);
  const dexKeywords = ["buy", "sell", "trade", "token", "dex", "sol", "solana", "swap", "exchange", "pool", "liquidity"];
  const userInputLower = userInput.toLowerCase();
  const isDexQuery = dexKeywords.some((keyword) => userInputLower.includes(keyword));
  if (isDexQuery) {
    providers = providers.filter((p) => p.serviceType === "dex");
    console.log(`\u{1F916} [LLM Service Mapper] DEX query detected - filtering to ${providers.length} DEX service(s) only`);
  }
  if (providers.length === 0) {
    throw new Error("No services available in registry (all filtered as core services or no DEX services found)");
  }
  const registrySummary = providers.map((p) => ({
    id: p.id,
    name: p.name,
    serviceType: p.serviceType,
    gardenId: p.gardenId || "HG",
    location: p.location || "Unknown"
  }));
  const dexContextNote = isDexQuery ? "\n\nNOTE: This is a DEX (token trading) query. Only DEX services are available in the registry above. Select DEX pool providers that match the user's trading intent (BUY/SELL, token pair, amount, etc.)." : "";
  const fullPrompt = `${LLM_SERVICE_SELECTION_PROMPT}

USER INPUT: "${userInput}"

AVAILABLE SERVICE REGISTRY:
${JSON.stringify(registrySummary, null, 2)}${dexContextNote}

Analyze the user input and select the best matching services from the registry above.
Return ONLY the JSON object as specified in the format above.`;
  try {
    const extractFn = import_config.ENABLE_OPENAI ? import_llm.extractQueryWithOpenAI : import_llm.extractQueryWithDeepSeek;
    const { callLLM } = await import("./llm");
    console.log(`\u{1F916} [LLM Service Mapper] Analyzing user input: "${userInput.substring(0, 100)}${userInput.length > 100 ? "..." : ""}"`);
    console.log(`\u{1F916} [LLM Service Mapper] Available services: ${providers.length} (after filtering core services)`);
    const response = await callLLM(fullPrompt, import_config.ENABLE_OPENAI);
    let selection;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        selection = JSON.parse(jsonMatch[0]);
      } else {
        selection = JSON.parse(response);
      }
    } catch (parseError) {
      console.error(`\u274C [LLM Service Mapper] Failed to parse LLM response:`, response);
      throw new Error(`LLM returned invalid JSON: ${parseError.message}`);
    }
    if (!selection.serviceType || !selection.selectedProviders || selection.selectedProviders.length === 0) {
      throw new Error("LLM selection missing required fields (serviceType or selectedProviders)");
    }
    const validProviders = selection.selectedProviders.filter((sp) => {
      const exists = providers.some((p) => p.id === sp.providerId);
      if (!exists) {
        console.warn(`\u26A0\uFE0F  [LLM Service Mapper] LLM selected non-existent provider: ${sp.providerId}`);
      }
      return exists;
    });
    if (validProviders.length === 0) {
      throw new Error("LLM selected providers that don't exist in registry");
    }
    selection.selectedProviders = validProviders;
    console.log(`\u2705 [LLM Service Mapper] Selected ${selection.selectedProviders.length} provider(s) for serviceType: ${selection.serviceType}`);
    console.log(`   Providers: ${selection.selectedProviders.map((p) => `${p.providerName} (${p.providerId})`).join(", ")}`);
    console.log(`   Confidence: ${selection.confidence}`);
    return selection;
  } catch (error) {
    console.error(`\u274C [LLM Service Mapper] Error mapping user input to services:`, error.message);
    throw error;
  }
}
function getServiceRegistrySummary() {
  const providers = filterCoreServices(Array.from(import_state.ROOT_CA_SERVICE_REGISTRY));
  return providers.map((p) => ({
    id: p.id,
    name: p.name,
    serviceType: p.serviceType,
    gardenId: p.gardenId || "HG",
    location: p.location || "Unknown"
  }));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LLM_SERVICE_SELECTION_PROMPT,
  getServiceRegistrySummary,
  mapUserInputToServices
});
//# sourceMappingURL=llmServiceMapper.js.map
