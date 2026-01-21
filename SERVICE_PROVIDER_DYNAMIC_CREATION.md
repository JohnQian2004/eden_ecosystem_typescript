# Service Provider Dynamic Creation Analysis

## Current State

### 1. **Hardcoded Movie Providers** (`server/eden-sim-redis.ts` lines 4253-4278)

Movie service providers are hardcoded in a `providerMap` object:

```typescript
const providerMap: Record<string, { name: string; uuid: string; location: string; bond: number; reputation: number; apiEndpoint: string }> = {
  'amc-001': {
    name: 'AMC Theatres',
    uuid: '550e8400-e29b-41d4-a716-446655440001',
    location: 'Baltimore, Maryland',
    bond: 1000,
    reputation: 4.8,
    apiEndpoint: 'https://api.amctheatres.com/v1/listings'
  },
  'cinemark-001': { ... },
  'moviecom-001': { ... }
};
```

**Location**: `server/eden-sim-redis.ts` in `/api/wizard/create-garden` endpoint (around line 4253)

**How it works**:
- When creating a movie garden, the wizard sends `selectedProviders: ['amc-001', 'cinemark-001']`
- Backend looks up each provider ID in `providerMap`
- If found, creates the provider and assigns it to the new garden
- If provider already exists in ServiceRegistry2, just reassigns it to the new garden

### 2. **Hardcoded DEX Pools** (`server/src/dex.ts` lines 24-63)

DEX pools are created via `initializeDEXPools()`:

```typescript
export function initializeDEXPools(): void {
  for (let i = 0; i < TOKEN_GARDENS.length; i++) {
    const tokenGarden = TOKEN_GARDENS[i];
    const tokenSymbol = `TOKEN${String.fromCharCode(65 + i)}`; // TOKENA, TOKENB, TOKENC...
    const poolId = `pool-solana-${tokenSymbol.toLowerCase()}`;
    // ... creates pool and assigns to token garden
  }
}
```

**How it works**:
- When a token garden is created, `initializeDEXPools()` is called
- Creates pools automatically: T1 → TOKENA, T2 → TOKENB, etc.
- Also creates a DEX service provider for each pool (lines 4458-4500 in `eden-sim-redis.ts`)

### 3. **Frontend: Step 2 Configuration** (`frontend/src/app/components/system-config/system-config.component.html` lines 244-269)

**Current UI**:
- Only shows provider selection for `serviceType === 'movie'`
- Hardcoded list: `movieProviders = ['amc-001', 'cinemark-001', 'moviecom-001']`
- Multi-select dropdown for movie providers only

**Missing**:
- No provider configuration UI for other service types (airline, autoparts, hotel, restaurant)
- No way to specify custom provider details (name, API endpoint, bond, etc.)

## Problem Statement

1. **Movie providers are hardcoded**: Can't add new movie providers without code changes
2. **DEX pools are auto-generated**: No control over pool creation
3. **Other service types have no provider creation mechanism**: Airline, autoparts, hotel, restaurant gardens can't have providers
4. **No generic provider creation UI**: Step 2 only handles movie providers

## Solution: Dynamic Service Provider Creation

### Architecture Proposal

#### 1. **Backend: Generic Provider Creation**

Replace hardcoded `providerMap` with a dynamic provider creation system:

**New Approach**:
- Accept provider configuration from frontend in `create-garden` request
- Support two modes:
  - **Mode 1: Predefined Providers** (like movie) - Frontend sends provider IDs, backend creates them
  - **Mode 2: Custom Providers** (new service types) - Frontend sends full provider config, backend creates them

**API Request Structure**:
```typescript
{
  serviceType: "airline",
  gardenName: "Garden-AIRLINE",
  // ... other garden config ...
  providers: [
    // Option A: Predefined provider IDs (like movie)
    { id: "united-airlines-001", name: "United Airlines", ... },
    // Option B: Custom provider config
    {
      id: "custom-airline-001",
      name: "Custom Airline",
      location: "New York, NY",
      bond: 2000,
      reputation: 4.5,
      apiEndpoint: "https://api.customairline.com/v1"
    }
  ]
}
```

#### 2. **Frontend: Dynamic Provider Configuration UI**

**Step 2 Enhancement**:
- Show provider configuration section for ALL service types (not just movie)
- Two modes:
  - **Predefined Providers**: If service type has predefined providers, show multi-select
  - **Custom Providers**: Allow user to add custom providers with form fields

**UI Structure**:
```html
<!-- Provider Configuration Section (for all service types) -->
<div class="row mb-3">
  <div class="col-12">
    <label class="form-label">Service Providers</label>
    
    <!-- Predefined Providers (if available) -->
    <div *ngIf="hasPredefinedProviders(selectedServiceType?.type)">
      <select class="form-select" multiple>
        <option *ngFor="let provider of getPredefinedProviders(selectedServiceType?.type)">
          {{ provider.name }}
        </option>
      </select>
    </div>
    
    <!-- Custom Provider Form -->
    <div class="mt-3">
      <button class="btn btn-sm btn-outline-primary" (click)="addCustomProvider()">
        + Add Custom Provider
      </button>
      
      <div *ngFor="let provider of customProviders; let i = index" class="card mt-2">
        <div class="card-body">
          <input [(ngModel)]="provider.name" placeholder="Provider Name" />
          <input [(ngModel)]="provider.apiEndpoint" placeholder="API Endpoint" />
          <input [(ngModel)]="provider.location" placeholder="Location" />
          <input [(ngModel)]="provider.bond" type="number" placeholder="Bond" />
          <button (click)="removeCustomProvider(i)">Remove</button>
        </div>
      </div>
    </div>
  </div>
</div>
```

#### 3. **Backend: Generic Provider Creation Logic**

**New Function**: `createServiceProvidersForGarden()`

```typescript
function createServiceProvidersForGarden(
  serviceType: string,
  gardenId: string,
  providers: Array<{
    id?: string;
    name: string;
    location?: string;
    bond?: number;
    reputation?: number;
    apiEndpoint?: string;
    uuid?: string;
  }>
): void {
  for (const providerConfig of providers) {
    // Generate ID if not provided
    const providerId = providerConfig.id || `${serviceType}-${crypto.randomUUID().substring(0, 8)}`;
    
    // Check if provider already exists
    const existingProvider = getServiceRegistry2().getProvider(providerId);
    
    if (existingProvider) {
      // Reassign to new garden
      existingProvider.gardenId = gardenId;
      console.log(`✅ Reassigned provider: ${existingProvider.name} to garden ${gardenId}`);
    } else {
      // Create new provider
      const newProvider: ServiceProviderWithCert = {
        id: providerId,
        uuid: providerConfig.uuid || crypto.randomUUID(),
        name: providerConfig.name,
        serviceType: serviceType,
        location: providerConfig.location || 'Unknown',
        bond: providerConfig.bond || 1000,
        reputation: providerConfig.reputation || 5.0,
        gardenId: gardenId,
        apiEndpoint: providerConfig.apiEndpoint || '',
        status: 'active'
      };
      
      // Register with ROOT CA
      registerServiceProviderWithROOTCA(newProvider);
      
      // Issue certificate
      issueServiceProviderCertificate(newProvider);
      
      console.log(`✅ Created provider: ${newProvider.name} (${newProvider.id}) for garden ${gardenId}`);
    }
  }
}
```

#### 4. **Provider Registry System**

**Predefined Providers Registry** (optional, for convenience):

```typescript
// server/src/providerRegistry.ts
export const PREDEFINED_PROVIDERS: Record<string, Array<{
  id: string;
  name: string;
  uuid: string;
  location: string;
  bond: number;
  reputation: number;
  apiEndpoint: string;
}>> = {
  movie: [
    { id: 'amc-001', name: 'AMC Theatres', ... },
    { id: 'cinemark-001', name: 'Cinemark', ... },
    { id: 'moviecom-001', name: 'MovieCom', ... }
  ],
  airline: [
    { id: 'united-001', name: 'United Airlines', ... },
    { id: 'delta-001', name: 'Delta Airlines', ... },
    { id: 'american-001', name: 'American Airlines', ... }
  ],
  // ... other service types
};
```

**API Endpoint**: `/api/wizard/predefined-providers/:serviceType`
- Returns list of predefined providers for a service type
- Frontend can use this to populate the multi-select

## Implementation Steps

### Phase 1: Backend Generic Provider Creation
1. ✅ Create `createServiceProvidersForGarden()` function
2. ✅ Update `/api/wizard/create-garden` to accept `providers` array
3. ✅ Remove hardcoded `providerMap` for movie
4. ✅ Support both predefined and custom providers

### Phase 2: Frontend Dynamic UI
1. ✅ Add provider configuration section to Step 2 (for all service types)
2. ✅ Create custom provider form (add/remove providers)
3. ✅ Add API call to fetch predefined providers
4. ✅ Update `createGarden()` to send provider config

### Phase 3: Predefined Providers Registry (Optional)
1. ✅ Create `providerRegistry.ts` with predefined providers
2. ✅ Add `/api/wizard/predefined-providers/:serviceType` endpoint
3. ✅ Frontend fetches and displays predefined providers

### Phase 4: DEX Pool Customization (Future)
1. Allow custom pool configuration in Step 2
2. Support custom token symbols, liquidity, etc.

## Benefits

1. **Zero Code Changes for New Service Types**: Just add workflow JSON, providers can be created via UI
2. **Flexibility**: Support both predefined and custom providers
3. **Scalability**: Easy to add new providers without code changes
4. **User Control**: Users can configure providers during garden creation
5. **Backward Compatible**: Movie providers still work, just moved to registry

## Migration Path

1. **Step 1**: Keep hardcoded movie providers, add new generic system alongside
2. **Step 2**: Move movie providers to predefined registry
3. **Step 3**: Remove hardcoded `providerMap`
4. **Step 4**: Add predefined providers for other service types

## Example: Creating an Airline Garden with Providers

**Frontend Request**:
```json
{
  "serviceType": "airline",
  "gardenName": "Garden-AIRLINE",
  "providers": [
    {
      "name": "United Airlines",
      "location": "Chicago, IL",
      "bond": 2000,
      "reputation": 4.7,
      "apiEndpoint": "https://api.united.com/v1/flights"
    },
    {
      "name": "Delta Airlines",
      "location": "Atlanta, GA",
      "bond": 2500,
      "reputation": 4.8,
      "apiEndpoint": "https://api.delta.com/v1/flights"
    }
  ]
}
```

**Backend Response**:
- Creates garden
- Creates 2 airline service providers
- Assigns providers to garden
- Issues certificates
- Persists to ServiceRegistry2

## Files to Modify

### Backend:
- `server/eden-sim-redis.ts` - Update `/api/wizard/create-garden` endpoint
- `server/src/serviceProvider.ts` - Add generic provider creation function
- `server/src/providerRegistry.ts` - NEW: Predefined providers registry

### Frontend:
- `frontend/src/app/components/system-config/system-config.component.ts` - Add provider management logic
- `frontend/src/app/components/system-config/system-config.component.html` - Add provider configuration UI

