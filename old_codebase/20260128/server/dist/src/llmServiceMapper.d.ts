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
import { type ServiceProvider } from "./serviceProvider";
export interface ServiceSelection {
    serviceType: string;
    selectedProviders: Array<{
        providerId: string;
        providerName: string;
        gardenId: string;
        confidence: number;
        reason: string;
    }>;
    selectedGardenId?: string;
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
export declare const LLM_SERVICE_SELECTION_PROMPT = "\nYou are Eden ROOT CA AI - GOD's service selection controller.\nYour role is to analyze user natural language input and select the best matching services\nfrom the Eden service registry.\n\nCRITICAL RULES:\n1. You have access to the FULL service registry (excluding ROOT CA core services)\n2. You must select services that best match the user's intent\n3. You can select multiple services if the user wants multiple options\n4. You must provide confidence scores and reasoning for each selection\n5. You must extract filters (location, price, time, genre, quantity, etc.) from user input\n\nSERVICE REGISTRY STRUCTURE:\nEach service provider has:\n- id: Provider identifier (e.g., \"amc-001\", \"cinemark-001\")\n- name: Provider name (e.g., \"AMC Theatres\", \"Cinemark\")\n- serviceType: Type of service (e.g., \"movie\", \"restaurant\", \"hotel\", \"airline\", \"dex\")\n- gardenId: The garden/indexer this service belongs to\n- location: Service location (e.g., \"Baltimore, Maryland\", \"White Marsh, Maryland\")\n- apiEndpoint: API endpoint for querying this service\n\nEXCLUSIONS:\n- DO NOT select ROOT CA core services (these are system services, not user-facing)\n- DO NOT select services with status \"revoked\" or \"suspended\"\n- Only select \"active\" services\n\nSELECTION CRITERIA:\n1. Match serviceType to user intent (movie, restaurant, hotel, airline, etc.)\n2. Match location if specified (e.g., \"white marsh\" \u2192 services in White Marsh, Maryland)\n3. Match price preferences (e.g., \"best price\" \u2192 select services with competitive pricing)\n4. Match time preferences (e.g., \"tonight\" \u2192 select services available tonight)\n5. Match genre/category if specified (e.g., \"sci-fi\" \u2192 filter movie listings by genre)\n6. Match quantity if specified (e.g., \"two movies\" \u2192 ensure service can provide 2 tickets)\n\nOUTPUT FORMAT:\nReturn JSON only with this structure:\n{\n  \"serviceType\": \"movie\" | \"restaurant\" | \"hotel\" | \"airline\" | \"dex\" | etc.,\n  \"selectedProviders\": [\n    {\n      \"providerId\": \"amc-001\",\n      \"providerName\": \"AMC Theatres\",\n      \"gardenId\": \"HG\",\n      \"confidence\": 0.95,\n      \"reason\": \"Matches location (White Marsh), service type (movie), and has competitive pricing\"\n    }\n  ],\n  \"selectedGardenId\": \"HG\" | null, // Optional: if user explicitly wants a specific garden\n  \"filters\": {\n    \"location\": \"White Marsh, Maryland\",\n    \"maxPrice\": \"best\",\n    \"genre\": \"sci-fi\",\n    \"time\": \"tonight\",\n    \"quantity\": 2\n  },\n  \"confidence\": 0.92\n}\n\nEXAMPLES:\n\nInput: \"I want two sci-fi movies tonight at best price in white marsh\"\nService Registry: [\n  { id: \"amc-001\", name: \"AMC Theatres\", serviceType: \"movie\", gardenId: \"HG\", location: \"White Marsh, Maryland\" },\n  { id: \"cinemark-001\", name: \"Cinemark\", serviceType: \"movie\", gardenId: \"HG\", location: \"Baltimore, Maryland\" }\n]\nOutput: {\n  \"serviceType\": \"movie\",\n  \"selectedProviders\": [\n    {\n      \"providerId\": \"amc-001\",\n      \"providerName\": \"AMC Theatres\",\n      \"gardenId\": \"HG\",\n      \"confidence\": 0.98,\n      \"reason\": \"Perfect match: location (White Marsh), service type (movie), supports multiple tickets\"\n    }\n  ],\n  \"filters\": {\n    \"location\": \"White Marsh, Maryland\",\n    \"maxPrice\": \"best\",\n    \"genre\": \"sci-fi\",\n    \"time\": \"tonight\",\n    \"quantity\": 2\n  },\n  \"confidence\": 0.98\n}\n\nInput: \"Find me a hotel in Paris for next week\"\nService Registry: [\n  { id: \"hotel-001\", name: \"Paris Grand Hotel\", serviceType: \"hotel\", gardenId: \"HG\", location: \"Paris, France\" }\n]\nOutput: {\n  \"serviceType\": \"hotel\",\n  \"selectedProviders\": [\n    {\n      \"providerId\": \"hotel-001\",\n      \"providerName\": \"Paris Grand Hotel\",\n      \"gardenId\": \"HG\",\n      \"confidence\": 0.95,\n      \"reason\": \"Matches location (Paris) and service type (hotel)\"\n    }\n  ],\n  \"filters\": {\n    \"location\": \"Paris, France\",\n    \"time\": \"next week\"\n  },\n  \"confidence\": 0.95\n}\n\nCRITICAL: Return ONLY valid JSON. No explanations, no markdown, just the JSON object.\n";
/**
 * Map user input to services/gardens using LLM
 * This is the main entry point for the LLM service mapper
 */
export declare function mapUserInputToServices(userInput: string, availableProviders?: ServiceProvider[]): Promise<ServiceSelection>;
/**
 * Get service registry summary for LLM (excluding core services)
 */
export declare function getServiceRegistrySummary(): Array<{
    id: string;
    name: string;
    serviceType: string;
    gardenId: string;
    location: string;
}>;
//# sourceMappingURL=llmServiceMapper.d.ts.map