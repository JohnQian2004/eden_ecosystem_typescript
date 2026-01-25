# LLM Service Registry Mapper

## Overview

The LLM Service Registry Mapper is a ROOT CA LLM service that eliminates the need for pre-canned prompts and garden-based service selection. Instead, users interact with a simple chat input, and the LLM intelligently selects services/gardens from the registry based on natural language input.

## Architecture

### Before (Old System)
1. User clicks on a garden → Pre-canned prompt is set
2. User clicks on a service type → Pre-canned prompt is set
3. User submits → Workflow starts with pre-determined serviceType

### After (New System)
1. User types natural language input (e.g., "I want two sci-fi movies tonight at best price in white marsh")
2. LLM analyzes input + service registry → Selects best matching services/gardens
3. Workflow starts with LLM-selected serviceType and providers
4. No pre-canned prompts needed!

## Key Components

### 1. LLM Service Mapper (`server/src/llmServiceMapper.ts`)

**Main Function:**
```typescript
mapUserInputToServices(userInput: string, availableProviders?: ServiceProvider[]): Promise<ServiceSelection>
```

**What it does:**
- Takes user natural language input
- Analyzes the service registry (excluding ROOT CA core services)
- Selects best matching services based on:
  - Service type (movie, restaurant, hotel, etc.)
  - Location (if specified)
  - Price preferences
  - Time preferences
  - Genre/category
  - Quantity
- Returns structured selection with confidence scores

**Output:**
```typescript
{
  serviceType: "movie",
  selectedProviders: [
    {
      providerId: "amc-001",
      providerName: "AMC Theatres",
      gardenId: "HG",
      confidence: 0.98,
      reason: "Perfect match: location (White Marsh), service type (movie)"
    }
  ],
  filters: {
    location: "White Marsh, Maryland",
    maxPrice: "best",
    genre: "sci-fi",
    time: "tonight",
    quantity: 2
  },
  confidence: 0.98
}
```

### 2. Workflow Integration

**Modified Function:**
```typescript
startWorkflowFromUserInput(userInput: string, user: User, serviceType?: string)
```

**Changes:**
- `serviceType` is now optional
- If not provided, LLM service mapper determines it from user input
- LLM-selected services are stored in `context.serviceSelection`
- Workflow steps can use `context.serviceSelection` instead of querying registry again

### 3. Workflow Action Update

**Modified Action: `query_service_registry`**

**Before:**
- Always queried registry based on `context.queryResult.query`

**After:**
- First checks for `context.serviceSelection` (LLM-selected services)
- Uses LLM-selected providers directly if available
- Falls back to query-based lookup for backward compatibility

## Usage

### Backend (Automatic)

The LLM service mapper is automatically used when:
1. User submits chat input via `/api/workflow/start`
2. No `serviceType` is provided (or it's undefined)
3. LLM analyzes input and selects services
4. Workflow starts with LLM-selected serviceType

### Frontend (Simplified)

**Old way (deprecated):**
```typescript
// User clicks garden → pre-canned prompt set
selectAppleGarden(garden) {
  this.userInput = this.getServiceTypePrompt(garden.serviceType).sampleQuery;
  // ...
}
```

**New way (recommended):**
```typescript
// User just types in chat input
// LLM handles everything automatically
onSubmit() {
  // Send user input directly - no pre-canned prompts needed
  this.flowWiseService.startWorkflow(this.userInput, this.userEmail);
}
```

## Configuration

### Sample Input (Configurable)

You can configure a default sample input in the frontend:

```typescript
// In app.component.ts
defaultSampleInput: string = "I want two sci-fi movies tonight at best price in white marsh";
```

This can be:
- Hardcoded in component
- Loaded from environment variable
- Loaded from config file
- Generated dynamically based on available services

### Excluding ROOT CA Core Services

The mapper automatically filters out:
- Services with `status: 'revoked'` or `'suspended'`
- Services with `serviceType: 'root-ca'`, `'system'`, or `'infrastructure'`
- Services with IDs like `'root-ca-service'`, `'system-service'`

## Benefits

1. **No Pre-canned Prompts**: Users can express their needs naturally
2. **Intelligent Selection**: LLM selects best matching services from registry
3. **Location-aware**: Automatically matches location preferences
4. **Price-aware**: Understands "best price" and price preferences
5. **Time-aware**: Understands "tonight", "next week", etc.
6. **Genre-aware**: Understands "sci-fi", "action", etc.
7. **Quantity-aware**: Understands "two movies", "3 tickets", etc.
8. **Clickable Actions**: Selected services can still be clicked/selected for quick actions

## Example Flows

### Example 1: Movie Selection
**User Input:** "I want two sci-fi movies tonight at best price in white marsh"

**LLM Analysis:**
- Service type: `movie`
- Location: `White Marsh, Maryland`
- Genre: `sci-fi`
- Time: `tonight`
- Quantity: `2`
- Price: `best`

**LLM Selection:**
- Provider: `amc-001` (AMC Theatres in White Marsh)
- Garden: `HG`
- Confidence: `0.98`

**Workflow:**
- Starts `movie` workflow
- Uses AMC provider
- Filters listings by location, genre, time, price

### Example 2: Hotel Booking
**User Input:** "Find me a hotel in Paris for next week"

**LLM Analysis:**
- Service type: `hotel`
- Location: `Paris, France`
- Time: `next week`

**LLM Selection:**
- Provider: `hotel-001` (Paris Grand Hotel)
- Garden: `HG`
- Confidence: `0.95`

**Workflow:**
- Starts `hotel` workflow
- Uses selected hotel provider
- Filters by location and time

## Migration Path

### Phase 1: Backend (✅ Complete)
- [x] Create LLM service mapper
- [x] Integrate into workflow service
- [x] Update workflow actions to use LLM selection

### Phase 2: Frontend (In Progress)
- [ ] Remove garden selection that sets pre-canned prompts
- [ ] Remove service type selection that sets pre-canned prompts
- [ ] Keep chat input as primary interface
- [ ] Add configurable sample input
- [ ] Make sample input optional (can be empty)

### Phase 3: Deprecation
- [ ] Mark `selectAppleGarden()`, `selectDexGarden()`, `selectServiceType()` as deprecated
- [ ] Keep them for backward compatibility but log warnings
- [ ] Eventually remove them in future version

## Testing

### Test Cases

1. **Natural Language Input**
   - Input: "I want two sci-fi movies tonight at best price in white marsh"
   - Expected: LLM selects AMC in White Marsh, starts movie workflow

2. **Location Matching**
   - Input: "Find movies in Baltimore"
   - Expected: LLM selects providers in Baltimore area

3. **Price Preferences**
   - Input: "Show me cheapest flights to LA"
   - Expected: LLM selects airline providers, filters by price

4. **Multiple Services**
   - Input: "I want a hotel and restaurant in New York"
   - Expected: LLM selects both hotel and restaurant providers

5. **Fallback**
   - Input: "Show me options"
   - Expected: LLM selects default services or asks for clarification

## Future Enhancements

1. **Multi-service Selection**: Support selecting multiple service types in one query
2. **Clarification Questions**: If input is ambiguous, ask user for clarification
3. **Learning**: Remember user preferences and improve selections over time
4. **Context Awareness**: Use chat history to understand context better
5. **Click Actions**: Allow clicking on LLM-selected services for quick actions

