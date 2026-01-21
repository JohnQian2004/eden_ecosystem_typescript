# Workflow Execution Diff: AMC vs Airline

## Summary
The backend has **extensive hardcoded movie-specific logic** that prevents airline (and other service types) from working correctly. The airline workflow uses different field names (`flightNumber`, `destination`, `date`) but the backend only handles movie fields (`movieTitle`, `showtime`, `location`).

---

## 1. Hardcoded Movie Logic in `server/eden-sim-redis.ts`

### A. `llm_extract_query` Action Handler (Line 797-809)
**Problem**: Always returns `serviceType: 'movie'` regardless of actual service type.

```typescript
case 'llm_extract_query':
  actionResult = {
    queryResult: {
      serviceType: 'movie',  // ❌ HARDCODED
      query: {
        filters: {
          genre: 'sci-fi',
          time: 'evening'
        }
      }
    }
  };
  break;
```

**Should be**: Extract serviceType from workflow context or action parameters.

---

### B. `query_service_registry` Action Handler (Line 811-871)
**Problem**: Returns hardcoded movie listings with `movieTitle`, `showtime`, etc.

```typescript
case 'query_service_registry':
  const mockListings = [{
    id: 'amc-001',
    name: 'AMC Theatres',
    serviceType: 'movie',  // ❌ HARDCODED
    providerId: 'amc-001',
    providerName: 'AMC Theatres',
    movieTitle: 'The Dark Knight',  // ❌ MOVIE-SPECIFIC
    showtime: '7:00 PM',  // ❌ MOVIE-SPECIFIC
    price: 15.99,
    // ... more movie fields
  }];
  actionResult = { listings: mockListings, providers: [...] };
  break;
```

**Should be**: 
- Query actual service registry based on `serviceType` from context
- Return listings with service-type-agnostic structure
- For airline: use `flightNumber`, `destination`, `date` instead of `movieTitle`, `showtime`

---

### C. `llm_format_response` Action Handler (Line 873-898)
**Problem**: Hardcoded movie-specific message and field mapping.

```typescript
case 'llm_format_response':
  const availableListings = updatedContext.listings || [];
  console.log(`   📋 [${requestId}] Prepared ${availableListings.length} movie options...`);  // ❌ "movie options"

  actionResult = {
    llmResponse: {
      message: 'Found great movie options! Here are the best matches...',  // ❌ HARDCODED
      serviceType: 'movie',  // ❌ HARDCODED
      recommendations: availableListings.map((listing: any) => ({
        movieTitle: listing.movieTitle,  // ❌ MOVIE-SPECIFIC
        showtime: listing.showtime,  // ❌ MOVIE-SPECIFIC
        price: listing.price,
        provider: listing.providerName,
        rating: listing.rating
      }))
    }
  };
  break;
```

**Should be**: 
- Use service-type-agnostic message
- Map fields dynamically based on service type
- For airline: map `flightNumber`, `destination`, `date`

---

### D. `add_ledger_entry` Action Handler (Line 923-935)
**Problem**: Hardcoded movie fields in booking details.

```typescript
const ledgerEntry = await addLedgerEntry(
  snapshot,
  processedAction.serviceType || 'movie',  // ❌ DEFAULT TO 'movie'
  processedAction.iGasCost || updatedContext.iGasCost || 0.00445,
  processedAction.payerId || updatedContext.user?.email || 'unknown@example.com',
  processedAction.merchantName || updatedContext.selectedListing?.providerName || 'AMC Theatres',  // ❌ HARDCODED
  processedAction.providerUuid || updatedContext.selectedListing?.providerId || 'amc-001',  // ❌ HARDCODED
  {
    movieTitle: updatedContext.selectedListing?.movieTitle,  // ❌ MOVIE-SPECIFIC
    showtime: updatedContext.selectedListing?.showtime,  // ❌ MOVIE-SPECIFIC
    location: updatedContext.selectedListing?.location
  }
);
```

**Should be**: 
- Use serviceType from context
- Build bookingDetails dynamically based on serviceType
- For airline: use `flightNumber`, `destination`, `date`

---

### E. `formatResponseWithOpenAI` Function (Line 6120-6134)
**Problem**: Hardcoded matching logic for movie fields.

```typescript
// Ensure selectedListing has providerId by matching it back to original listings
let selectedListing = content.selectedListing || (listings.length > 0 ? listings[0] : null);
if (selectedListing && !selectedListing.providerId) {
  // Try to find matching listing by movie title and provider name
  const matchedListing = listings.find(l => 
    l.movieTitle === selectedListing.movieTitle &&  // ❌ MOVIE-SPECIFIC
    l.providerName === selectedListing.providerName
  );
  // ...
}
```

**Should be**: Use service-type-agnostic matching (e.g., by `id` or `providerId` + unique identifier).

---

## 2. Hardcoded Movie Logic in `server/src/components/flowwiseService.ts`

### A. `add_ledger_entry` Handler (Line 698-709)
**Problem**: Hardcoded movie fields and defaults.

```typescript
const ledgerEntry = addLedgerEntry(
  context.snapshot,
  context.serviceType || "movie",  // ❌ DEFAULT TO "movie"
  context.iGasCost || 0.00445,
  context.user?.email || "unknown@example.com",
  context.selectedListing?.providerName || "AMC Theatres",  // ❌ HARDCODED
  context.providerUuid || context.selectedListing?.providerId || "amc-001",  // ❌ HARDCODED
  {
    movieTitle: context.selectedListing?.movieTitle,  // ❌ MOVIE-SPECIFIC
    showtime: context.selectedListing?.showtime,  // ❌ MOVIE-SPECIFIC
    location: context.selectedListing?.location,
    price: entryAmount
  }
);
```

**Should be**: Build bookingDetails dynamically based on `context.serviceType`.

---

## 3. Workflow Configuration (CORRECT)

Both workflows are correctly configured in their JSON files:

### AMC Workflow (`amc_cinema.json`):
```json
{
  "type": "query_service_registry",
  "serviceType": "movie"  // ✅ Correctly specified
}
```

### Airline Workflow (`airline.json`):
```json
{
  "type": "query_service_registry",
  "serviceType": "airline"  // ✅ Correctly specified
}
```

**The workflows are correct!** The problem is that the backend action handlers **ignore** the `serviceType` from the action and use hardcoded movie logic instead.

---

## 4. Field Name Differences: AMC vs Airline

### AMC Workflow Uses:
- `movieTitle` → Movie name
- `showtime` → Show time (e.g., "7:00 PM")
- `location` → Theater location
- `genre` → Movie genre
- `duration` → Movie duration
- `format` → Format (IMAX, 3D, etc.)

### Airline Workflow Uses:
- `flightNumber` → Flight identifier (e.g., "AA123")
- `destination` → Destination city
- `date` → Flight date
- `price` → Ticket price
- `providerName` → Airline name
- `location` → Departure location

**Problem**: Backend only handles AMC fields, so airline data is lost or incorrectly processed.

---

## 5. What Needs to Be Fixed

### Priority 1: Make Action Handlers Service-Type Agnostic

1. **`llm_extract_query`**: Extract `serviceType` from workflow context or action parameters
2. **`query_service_registry`**: 
   - Query actual service registry using `serviceType` from context
   - Return listings with service-type-agnostic structure
   - Map fields based on service type
3. **`llm_format_response`**: 
   - Use service-type-agnostic message
   - Map fields dynamically (movieTitle/showtime for movie, flightNumber/destination/date for airline)
4. **`add_ledger_entry`**: 
   - Build `bookingDetails` dynamically based on `serviceType`
   - Use service-type-agnostic defaults

### Priority 2: Fix Field Mapping

Create a service-type field mapping:
```typescript
const SERVICE_TYPE_FIELDS = {
  movie: {
    primary: 'movieTitle',
    time: 'showtime',
    location: 'location',
    // ...
  },
  airline: {
    primary: 'flightNumber',
    time: 'date',
    location: 'destination',
    // ...
  }
};
```

### Priority 3: Update LLM Prompts

The LLM prompts in `server/src/llm.ts` may also need to be service-type aware to format responses correctly for different service types.

---

## 6. Current Workflow Execution Flow

### AMC (Movie) Flow:
1. `llm_extract_query` → Returns `serviceType: 'movie'` ✅ (but hardcoded)
2. `query_service_registry` → Returns hardcoded movie listings ✅ (but hardcoded)
3. `llm_format_response` → Formats with `movieTitle`/`showtime` ✅ (but hardcoded)
4. User selects listing → `selectedListing` has `movieTitle`/`showtime` ✅
5. `add_ledger_entry` → Stores `movieTitle`/`showtime` in bookingDetails ✅

### Airline Flow:
1. `llm_extract_query` → Returns `serviceType: 'movie'` ❌ (should be 'airline')
2. `query_service_registry` → Returns hardcoded movie listings ❌ (should return airline listings)
3. `llm_format_response` → Formats with `movieTitle`/`showtime` ❌ (should use `flightNumber`/`destination`/`date`)
4. User selects listing → `selectedListing` has `movieTitle`/`showtime` ❌ (should have `flightNumber`/`destination`/`date`)
5. `add_ledger_entry` → Stores `movieTitle`/`showtime` ❌ (should store airline fields)

---

## 7. Recommended Solution

1. **Extract `serviceType` from workflow context** in all action handlers
2. **Query service registry dynamically** based on `serviceType`
3. **Use service-type field mapping** to handle different field names
4. **Build bookingDetails dynamically** based on `serviceType` and available fields
5. **Update LLM prompts** to be service-type aware (or use generic prompts)

This will make the workflow execution system truly service-type agnostic and allow any service type (movie, airline, autoparts, etc.) to work correctly.

