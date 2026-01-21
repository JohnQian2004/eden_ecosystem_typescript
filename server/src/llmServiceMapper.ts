/**
 * LLM Service Registry Mapper
 * 
 * ROOT CA LLM Service that maps user natural language input to services/gardens
 * from the service registry, eliminating the need for pre-canned prompts.
 * 
 * Architecture:
 * - User provides natural language input (e.g., "I want two sci-fi movies tonight at best price in white marsh")
 * - LLM analyzes the input and the service registry
 * - LLM selects the best matching service(s) and garden(s)
 * - Returns structured selection that can be used to start workflows
 */

import { extractQueryWithOpenAI, extractQueryWithDeepSeek } from "./llm";
import { queryROOTCAServiceRegistry, type ServiceProvider } from "./serviceProvider";
import { ROOT_CA_SERVICE_REGISTRY } from "./state";
import { ENABLE_OPENAI, MOCKED_LLM } from "./config";
import type { LLMQueryResult } from "./types";

export interface ServiceSelection {
  serviceType: string;
  selectedProviders: Array<{
    providerId: string;
    providerName: string;
    gardenId: string;
    confidence: number;
    reason: string;
  }>;
  selectedGardenId?: string; // If user wants a specific garden
  filters: {
    location?: string;
    maxPrice?: number | string;
    genre?: string;
    time?: string;
    quantity?: number;
    [key: string]: any;
  };
  confidence: number;
}

/**
 * LLM Prompt for Service/Garden Selection
 */
export const LLM_SERVICE_SELECTION_PROMPT = `
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
2. Match location if specified (e.g., "white marsh" → services in White Marsh, Maryland)
3. Match price preferences (e.g., "best price" → select services with competitive pricing)
4. Match time preferences (e.g., "tonight" → select services available tonight)
5. Match genre/category if specified (e.g., "sci-fi" → filter movie listings by genre)
6. Match quantity if specified (e.g., "two movies" → ensure service can provide 2 tickets)

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

/**
 * Filter out ROOT CA core services from the registry
 * Core services are system services that should not be user-selectable
 */
function filterCoreServices(providers: ServiceProvider[]): ServiceProvider[] {
  // ROOT CA core services are typically infrastructure services
  // These might have specific IDs or serviceTypes that indicate they're core services
  const coreServiceTypes = ['root-ca', 'system', 'infrastructure'];
  const coreServiceIds = ['root-ca-service', 'system-service'];
  
  return providers.filter(provider => {
    // Exclude revoked/suspended services
    if (provider.status === 'revoked' || provider.status === 'suspended') {
      return false;
    }
    
    // Exclude core service types
    if (coreServiceTypes.includes(provider.serviceType?.toLowerCase() || '')) {
      return false;
    }
    
    // Exclude core service IDs
    if (coreServiceIds.includes(provider.id?.toLowerCase() || '')) {
      return false;
    }
    
    return true;
  });
}

/**
 * Map user input to services/gardens using LLM
 * This is the main entry point for the LLM service mapper
 */
export async function mapUserInputToServices(
  userInput: string,
  availableProviders?: ServiceProvider[]
): Promise<ServiceSelection> {
  if (MOCKED_LLM) {
    // Mock response for testing
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

  // Get available providers (filter out core services)
  let providers: ServiceProvider[] = availableProviders || Array.from(ROOT_CA_SERVICE_REGISTRY);
  providers = filterCoreServices(providers);

  if (providers.length === 0) {
    throw new Error("No services available in registry (all filtered as core services)");
  }

  // Prepare service registry summary for LLM
  const registrySummary = providers.map(p => ({
    id: p.id,
    name: p.name,
    serviceType: p.serviceType,
    gardenId: p.gardenId || 'HG',
    location: p.location || 'Unknown'
  }));

  // Build the LLM prompt with user input and service registry
  const fullPrompt = `${LLM_SERVICE_SELECTION_PROMPT}

USER INPUT: "${userInput}"

AVAILABLE SERVICE REGISTRY:
${JSON.stringify(registrySummary, null, 2)}

Analyze the user input and select the best matching services from the registry above.
Return ONLY the JSON object as specified in the format above.`;

  try {
    // Use OpenAI or DeepSeek to analyze and select
    const extractFn = ENABLE_OPENAI ? extractQueryWithOpenAI : extractQueryWithDeepSeek;
    
    // Call LLM directly with the service selection prompt
    const { callLLM } = await import("./llm");
    
    console.log(`🤖 [LLM Service Mapper] Analyzing user input: "${userInput.substring(0, 100)}${userInput.length > 100 ? '...' : ''}"`);
    console.log(`🤖 [LLM Service Mapper] Available services: ${providers.length} (after filtering core services)`);
    
    // Use OpenAI by default (ENABLE_OPENAI is true by default)
    const response = await callLLM(fullPrompt, ENABLE_OPENAI);

    // Parse LLM response
    let selection: ServiceSelection;
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        selection = JSON.parse(jsonMatch[0]);
      } else {
        selection = JSON.parse(response);
      }
    } catch (parseError: any) {
      console.error(`❌ [LLM Service Mapper] Failed to parse LLM response:`, response);
      throw new Error(`LLM returned invalid JSON: ${parseError.message}`);
    }

    // Validate selection
    if (!selection.serviceType || !selection.selectedProviders || selection.selectedProviders.length === 0) {
      throw new Error("LLM selection missing required fields (serviceType or selectedProviders)");
    }

    // Validate that selected providers actually exist in registry
    const validProviders = selection.selectedProviders.filter(sp => {
      const exists = providers.some(p => p.id === sp.providerId);
      if (!exists) {
        console.warn(`⚠️  [LLM Service Mapper] LLM selected non-existent provider: ${sp.providerId}`);
      }
      return exists;
    });

    if (validProviders.length === 0) {
      throw new Error("LLM selected providers that don't exist in registry");
    }

    selection.selectedProviders = validProviders;

    console.log(`✅ [LLM Service Mapper] Selected ${selection.selectedProviders.length} provider(s) for serviceType: ${selection.serviceType}`);
    console.log(`   Providers: ${selection.selectedProviders.map(p => `${p.providerName} (${p.providerId})`).join(', ')}`);
    console.log(`   Confidence: ${selection.confidence}`);

    return selection;
  } catch (error: any) {
    console.error(`❌ [LLM Service Mapper] Error mapping user input to services:`, error.message);
    throw error;
  }
}

/**
 * Get service registry summary for LLM (excluding core services)
 */
export function getServiceRegistrySummary(): Array<{
  id: string;
  name: string;
  serviceType: string;
  gardenId: string;
  location: string;
}> {
  const providers = filterCoreServices(Array.from(ROOT_CA_SERVICE_REGISTRY));
  return providers.map(p => ({
    id: p.id,
    name: p.name,
    serviceType: p.serviceType,
    gardenId: p.gardenId || 'HG',
    location: p.location || 'Unknown'
  }));
}

