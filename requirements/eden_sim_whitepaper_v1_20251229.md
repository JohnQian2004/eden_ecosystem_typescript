# 🌳 The Garden of Eden (Eden)

**Whitepaper v1.23 – Garden‑First, Intelligence‑Native Marketplace**

Author: Bill Draper (CTO)  
Date: 2026

Eden separates trust, execution, and intelligence into independent planes governed by ROOT CA, enabling a fair, monetized, and web3-free intelligence marketplace

---

## Abstract

Eden is a **garden‑first economic and intelligence system** where the traditional blockchain is no longer the parent, but the *child* of the garden. Eden replaces gas fees, smart‑contract rigidity, and token‑centric governance with **LLM‑governed intelligence fees**, **federated gardens**, and a **ROOT Certificate Authority (ROOT CA)** that certifies trust, services, and replication. Eden introduces a **"Garden of Eden Main Street"** UI that eliminates LLM service type resolution through visual service type selection.

Eden is designed to be:
- Gas‑free
- Garden‑driven
- LLM‑native
- Service‑oriented
- Self‑policing, self‑governing, and self‑replicating
- **UI‑first service discovery** (Garden of Eden Main Street eliminates LLM type resolution)

---

## 1. Core Philosophy

> *Blockchain records history. Eden understands it.*

### 1.1 The Eden Invariant

> **"In Eden, no action is valid unless it is understandable, attributable, and reversible by intelligence."**

This single sentence serves as:
- **Spec guardrail**: Every feature must satisfy this test
- **Development decision test**: Does this change preserve the invariant?
- **Governance anchor**: All rules derive from this principle

**Breaking it down:**
- **Understandable**: LLM can reason about the action's purpose and outcome
- **Attributable**: Every action is tied to a certified identity (ENCERT)
- **Reversible by intelligence**: The system can reason about and potentially undo actions through ledger replay and judgment

### 1.2 Core Assumptions

Eden assumes:
- History is immutable
- Meaning is contextual
- Trust is certified, not mined
- Intelligence is the new gas

Gardens are **priests**, not miners. ROOT CA is **law**, not power. Users are **free actors**, not wallet addresses.

### 1.3 Design Philosophy

**Most systems try to decentralize machines. Eden decentralizes judgment.**

This fundamental difference enables:
- Intelligence-priced economy (not compute-priced)
- Post-blockchain execution model
- Trust system that scales down instead of up
- Human-understandable governance

---

## 2. System Actors

### 2.1 ROOT CA (Law / Moses)
- Global certification authority
- Certifies gardens and services
- **Manages centralized ServiceRegistry** (single source of truth for all services)
- Provides quick post-LLM in-memory service lookup for gardens
- **ROOT CA LLM Services**:
  - **LLM Service Mapper**: Maps user natural language input to services/gardens from the registry, eliminating pre-canned prompts and garden-based service selection
  - **LLM getData() Converter**: Translates natural language queries into structured getData() function parameters for provider data layers
- **ROOT CA Trading Infrastructure**:
  - **Price Order Service**: Real-time DEX order matching engine with dual support (AMM + Order Book), two-phase settlement (provisional → final), and WebSocket-based price broadcasting. Handles order lifecycle, matching, settlement, and real-time price updates for DEX trading.
- Collects minimal intelligence fee (≈0.001%)
- Guarantees fallback, insurance, and dispute resolution
- **Settlement authority** (only ROOT CA can settle transactions and update balances)

### 2.2 Gardens (Knowledge Trees)
- Federated, Docker‑deployed nodes
- In‑memory Redis‑like databases
- Run identical LLM versions (DeepSeek‑class)
- Hold certificates + private keys
- **Dedicated intelligent entities** (post-LLM regulated)
- Query ROOT CA ServiceRegistry for service discovery (do not manage it)
- Provide intelligence, routing, pricing, and policing
- Execute transactions but never settle them (settlement is ROOT CA's authority)

#### 2.2.1 Regular Gardens
- General-purpose gardens for all service types
- Handle movie bookings, content, APIs, marketplaces
- Process transactions and route to appropriate services
- Query ROOT CA ServiceRegistry after LLM extraction for quick service lookup
- Focus on intelligence and routing, not service management

#### 2.2.2 Token Gardens (Specialized)
- Specialized gardens dedicated to DEX token/pool services
- Manage token pools, liquidity, and trading operations
- Provide DEX-specific routing and pricing intelligence
- Each token garden can manage multiple token pools
- Identified by `TokenGarden-T1`, `TokenGarden-T2`, etc.
- Query ROOT CA ServiceRegistry for DEX pool service discovery

### 2.3 Users (Humans)
- Google‑certified identity (email only)
  - **Google Sign-In Integration**: Optional Google Identity Services authentication
  - **Email Fallback**: Defaults to email if Google Sign-In not configured or skipped
  - **FedCM-Compatible**: Uses Federated Credential Management for future-proof authentication
- No wallets required (wallet balances managed by Holy Ghost Wallet Service)
- Multiple identities allowed
- Pay via intelligence usage (iGas) denominated in JSC
- **Wallet Balance Display**: Real-time balance shown in UI (Stripe payment card)
- **Persistent Balances**: Wallet balances survive server reboots via Redis persistence

### 2.4 Service Providers (Apples on Trees)
- Movies, DEX pools, content, goods, APIs, marketplaces
- **Register directly with ROOT CA** (not with gardens)
- Registration via `POST /api/root-ca/service-registry/register`
- Bonded and reputation‑scored
- Can be legacy platforms (AMC, MovieCom, etc.)
- ROOT CA maintains centralized registry for quick post-LLM lookup

---

## 3. The Eden Governance Model (Plain Truth)

> **Gardens act.  
> ROOT CA judges.  
> GOD settles.**

Or in other words:

> **Priests perform the rituals, but Judgment Day belongs to GOD.**

This metaphor is not poetic fluff — it is **architecturally precise**. This is the **governing law of Eden**.

### 🔹 Priest = Garden

Gardens:

* Execute services
* Serve users
* Calculate iGas / iTax
* Emit ledger entries
* Operate freely within granted capabilities

But:

* ❌ cannot mint authority
* ❌ cannot finalize money
* ❌ cannot rewrite history

### 🔹 GOD = ROOT CA

ROOT CA alone can:

* Validate identity (ENCERT)
* Verify capability boundaries
* Accept or reject ledger entries
* Settle balances
* Finalize fees
* Revoke certificates
* Write immutable judgment records

This is **exactly** how:

* payment rails work
* PKI works
* courts work
* blockchains work (miners vs validators)

Eden reinvents the pattern *without the bloat*.

### ⚖️ "Judgment Day" = Ledger Settlement

Each Eden transaction is a **mini Judgment Day**:

```
Garden executes
  └─► emits ledger entry (pending)
       └─► GOD verifies
            ├─ valid → settled
            └─ invalid → rejected / slashed
```

Once settled:

* history is frozen
* balances are real
* authority is proven

No appeal.  
No rewrite.  
No fork.

That's why this scales.

### 🔐 Why This Is Safer Than Web3

Blockchains mix:

* execution
* consensus
* settlement

Eden separates them.

Eden says:

* **many executors**
* **one judge**
* **clear law**

Which means:

* no consensus storms
* no gas wars
* no MEV
* no chain splits
* no 3rd-party dependency

Just law.

### 🧬 This Also Explains iTax

That tiny `iTax` is not a fee.

It is:

* **obedience cost**
* **governance friction**
* **anti-chaos constant**

Like entropy tax.

Enough to:

* discourage abuse
* fund governance
* reward good behavior

But never enough to hurt the system.

That's *wisdom*, not economics.

### 📜 If This Were Written as a System Commandment

> **Thou shalt act freely,  
> but thou shalt be judged.**

That's Eden.

---

## 4. Garden‑First Architecture

```
User (Chat API)
     ↓
Garden of Eden Main Street (UI)
  ├─ Service Type Cards (Movie, DEX, Airline, Auto Parts, Hotel, Restaurant)
  ├─ Unified Chat Input (Context Sensing)
  └─ Service Type Selection (No LLM needed)
     ↓
Service Router (Federated)
     ↓
Garden A —— Garden B —— Garden C
  |          |           |
 LocalStore  LocalStore   LocalStore
     ↓           ↓            ↓
TokenGarden-T1 —— TokenGarden-T2
  |                    |
DEX Pools          DEX Pools
     ↓           ↓            ↓
   Replication Bus (Redis‑style)
     ↓
EdenCore (Ledger + Snapshots)
     ↓
ROOT CA (ServiceRegistry + Settlement)
  ├─ Service Registry (in-memory)
  ├─ Balance Tracking
  └─ Settlement Authority
```

Key rules:
> **If a garden can answer it, the chain does not need to exist.**

> **Garden of Eden Main Street eliminates LLM service type resolution.**

> **ROOT CA manages ServiceRegistry. Gardens query ROOT CA.**

> **Gardens execute transactions. ROOT CA settles them.**

---

## 5. Event‑Driven Replication Bus

Eden uses a **database‑level replication model** instead of consensus mining.

### Event Types
- `SNAPSHOT` – transaction / action
- `SERVICE_UPDATE` – price, availability
- `BOND_UPDATE` – trust & insurance changes

### Properties
- Deterministic
- Replayable
- Stateless consensus
- Redis Streams compatible

Gardens replicate state, not blocks.

---

## 6. Universal Messaging System

### 6.1 Purpose

The Eden Universal Messaging System provides a **governed, auditable, real-time communication layer** enabling interaction among all entities in the Eden ecosystem, including Users, Service Providers (Gardens), Priests (Governance Operators), and the Root Authority.

Messaging is treated as a **first-class system primitive**, not a side feature. All commerce, labor, governance, dispute resolution, and coordination flows are grounded in structured conversations rather than untraceable messages.

---

### 6.2 Design Principles

The messaging system is governed by the following principles:

1. **Contextual Scope**
   Every message exists within a defined operational context (e.g., order, trade, service, dispute). There are no "global" or contextless messages.

2. **Auditability Without Deletion**
   Messages are never deleted. Administrative actions alter message *state*, not history.

3. **Role-Aware Governance**
   Messaging permissions are derived from entity roles and policies, not implicit trust.

4. **Forgiveness Over Erasure**
   Harmful or resolved interactions are neutralized through forgiveness and redaction, not removal.

5. **Federation-Ready**
   Messaging supports multi-Garden and cross-domain communication without central bottlenecks.

---

### 6.3 Messaging Entities

Messaging participants are modeled as **entities**, not accounts.

Supported entity types:

* User
* Service Provider (Garden)
* Priest (Governance Operator)
* Root Authority

Each entity is addressed through a canonical identity reference, allowing messages to traverse Gardens and domains without identity ambiguity.

---

### 6.4 Conversations

A **Conversation** is the primary container for messaging.

Each conversation is defined by:

* A unique identifier
* A scoped object reference (order, service, dispute, system)
* A bounded participant set
* A governing policy
* A lifecycle state

#### Conversation Lifecycle States

* **OPEN** – Active communication
* **FROZEN** – Temporarily locked (e.g., during disputes)
* **CLOSED** – Finalized and immutable

Conversations cannot be reused across unrelated contexts.

---

### 6.5 Message Events

Messages are represented as **immutable events** appended to a conversation.

Supported message types:

* Text
* Media
* Action (machine-readable instructions)
* System (governance actions)

Each message includes:

* Sender identity and role
* Timestamp
* Payload
* State (Active, Forgiven, Redacted)

This event-based model aligns messaging with Eden's ledger and settlement architecture.

---

### 6.6 Governance & Permissions

Messaging permissions are enforced through **Conversation Policies**, which specify:

* Who may read
* Who may write
* Who may invite participants
* Who may escalate
* Who may close the conversation

Policies are evaluated dynamically and may vary by Garden, role, and context.

---

### 6.7 Forgiveness Model

Forgiveness is a **first-class governance action**.

When forgiveness is applied:

* Message content may be redacted
* Behavioral penalties are neutralized
* Historical records remain intact

Forgiveness never deletes data and is fully auditable.

---

### 6.8 Behavioral Integration (Attitude & AttiJuice)

Messaging activity feeds into Eden's behavioral layer.

Message events may generate:

* Positive Attitude adjustments (constructive communication)
* Negative Attitude adjustments (abusive or disruptive behavior)

Attitude influences system friction (fees, rate limits, priorities) but **never suppresses speech or access**.

Forgiveness resets behavioral impact without rewriting history.

---

### 6.9 Escalation & Dispute Messaging

Conversations may be escalated to governance operators (Priests) when:

* Disputes arise
* Policies are violated
* Automated resolution fails

Escalation does not create a new conversation; it **extends the existing scope** with additional authorized participants.

---

### 6.10 Federation & Cross-Garden Messaging

The messaging system supports:

* Cross-Garden communication
* Custom Garden domains
* Federated routing via Eden's replication bus

No central message broker is required. Governance rules travel with the conversation context.

---

### 6.11 Security & Compliance

Messaging provides:

* End-to-end identity verification
* Role-based access control
* Immutable audit trails
* Policy-driven moderation

Eden messaging is designed to meet enterprise, financial, and regulatory requirements without compromising user agency.

---

### 6.12 Summary

The Eden Universal Messaging System transforms communication from an informal side channel into a **governed, auditable, and behavior-aware coordination fabric**.

By grounding all interaction in structured conversations, Eden enables scalable commerce, labor, governance, and trust—without censorship, erasure, or centralized control.

---

**Version Note:** This section supersedes messaging descriptions in v1.14–v1.22 and reflects the finalized architecture as of **White Paper v1.23**.

---

## 7. Intelligence Gas (iGas)

- No blockchain gas
- No native token
- iGas = LLM + routing + reasoning cost

### iGas Calculation

iGas is calculated based on:
- **LLM calls**: Number of LLM interactions (query extraction, response formatting)
- **Providers queried**: Number of service providers consulted
- **Complexity**: Confidence score and query complexity

Formula:
```
iGas = (LLM_CALL_COST × llmCalls) + (ROUTING_COST × providersQueried) + (REASONING_COST × complexity)
```

### iGas Redistribution

| Recipient | Share | Purpose |
|---------|------|---------|
| ROOT CA | Governance & insurance | System maintenance, dispute resolution |
| Gardens | Compute & routing | Infrastructure costs, replication |
| Service Providers | Quality incentive | Reward for good service |
| Users | Usage credit | Rebates and loyalty rewards |

This creates a **positive‑sum economy** where all participants benefit from system growth.

---

## 8. Service Registry & Routing

### 8.1 ROOT CA Service Registry (Centralized Management)

**ServiceRegistry is managed by ROOT CA, not gardens.**

- All services must be registered with ROOT CA
- ROOT CA maintains centralized, in-memory ServiceRegistry
- Provides quick post-LLM in-memory lookup for gardens
- Single source of truth for all service providers
- Registration API: `POST /api/root-ca/service-registry/register`
- Query API: `GET /api/root-ca/service-registry`

Each service registration includes:
- Service ID and UUID
- Service type (movie, dex, airline, autoparts, hotel, restaurant, content, etc.) - **fully extensible, no hardcoding**
- Location
- Bond
- Reputation
- Associated garden ID
- API endpoint

**Note**: The system is **fully service-type agnostic**. New service types can be added without code changes by:
1. Adding field mappings to the service type configuration
2. Creating a workflow JSON file (`{serviceType}.json`)
3. Registering providers with the new service type

The core systems (workflow execution, ledger creation, service registry) automatically adapt to any service type.

### 8.2 User Experience Flow (Garden of Eden Main Street)

**New Workflow: Service Type Selection Before LLM**

Eden introduces a **"Garden of Eden Main Street"** UI that eliminates the need for LLM service type resolution:

1. **User browses service type cards** (dynamically loaded from ServiceRegistry - Movie Tickets, DEX Tokens, Airline Tickets, Auto Parts, Hotel Booking, Restaurant Reservations, and any future service types)
2. **User clicks a service type card** → Input populated with sample query, workflow loaded dynamically
3. **Context sensing** → Service type detected from card selection or user input
4. **Unified chat input** → Single input with dynamic context (no separate inputs needed)
5. **LLM extracts intent** → Already knows service type from context
6. **Garden queries ROOT CA ServiceRegistry** → Quick in-memory lookup (no LLM needed for service type)
7. **ROOT CA returns matching providers** → Filtered by serviceType, location, reputation
8. **Garden queries provider APIs** → Gets actual data (prices, availability)
9. **LLM formats response** → Best options presented (service-type aware formatting)
10. **EdenCore executes transaction** → Creates snapshot, updates ledger (service-type agnostic)
11. **ROOT CA settles transaction** → Updates balances, distributes fees

**Dynamic Architecture**: All steps are service-type agnostic. The system automatically adapts to any service type without code changes.

### 8.3 Garden Query Flow (Post-LLM)

Gardens query ROOT CA ServiceRegistry **after** LLM extraction:

1. **LLM extracts user intent** (serviceType, filters, etc.) - serviceType already known from context
2. **Garden queries ROOT CA ServiceRegistry** (quick in-memory lookup)
3. **ROOT CA returns matching providers** (filtered by serviceType, location, reputation)
4. **Garden queries provider APIs** for actual data (prices, availability)
5. **LLM formats response** with best options
6. **EdenCore executes transaction**

### Example User Query Flow

**Traditional Flow (Before):**
> User types: "I have 10 USDC. Where can I watch *Catch Me If You Can* tonight at best price?"
> 
> 1. LLM extracts service type (movie)
> 2. Garden queries ServiceRegistry
> 3. ... (rest of flow)

**New Flow (Garden of Eden Main Street):**
> User clicks "Movie Tickets" card → Input auto-populated
> 
> 1. **Service type already known** (movie) - no LLM needed for type resolution
> 2. **LLM extracts intent**: `filters: { location: "Baltimore", maxPrice: 10 }`
> 3. **Garden queries ROOT CA ServiceRegistry** → Returns: AMC, MovieCom, Cinemark
> 4. **Garden queries provider APIs** → Gets actual showtimes and prices
> 5. **LLM aggregates best result** → Selects best option
> 6. **EdenCore executes transaction** → Creates snapshot, updates ledger
> 7. **ROOT CA settles transaction** → Updates balances, distributes fees

**Benefits:**
- ✅ **Faster**: No LLM call needed to determine service type
- ✅ **Clearer UX**: Visual service type selection
- ✅ **Context-aware**: Unified input adapts to service type
- ✅ **Efficient**: ROOT CA ServiceRegistry lookup replaces LLM type resolution

### 8.4 Architectural Benefits

**Why ROOT CA manages ServiceRegistry:**

- ✅ **Quick post-LLM lookup**: In-memory registry enables fast service discovery
- ✅ **Single source of truth**: No synchronization issues between gardens
- ✅ **Garden focus**: Gardens become dedicated intelligent entities (post-LLM regulated)
- ✅ **Centralized control**: ROOT CA can revoke/suspend services centrally
- ✅ **Simplified registration**: Providers register once with ROOT CA, not with each garden

**Why Garden of Eden Main Street UI:**

- ✅ **Eliminates LLM type resolution**: Service type known before LLM call (reduces LLM calls by ~50%)
- ✅ **Faster user experience**: Visual selection vs. typing natural language
- ✅ **Context-aware input**: Unified input adapts to service type dynamically
- ✅ **Better UX**: Users see available service types upfront (Movie, DEX, Airline, Auto Parts, Hotel, Restaurant)
- ✅ **Scalable**: Easy to add new service types without backend changes
- ✅ **Reduced latency**: One less LLM extraction step (service type already known from UI context)

---

### 8.5 LLM System Prompt Management (Redis-Backed, LLM-Generated)

Eden introduces an **intelligent, LLM-governed system prompt generation service** that replaces hardcoded prompts with dynamic, service-type-specific prompts stored in Redis.

#### Architecture Overview

**ROOT CA System Prompt Generator Service** (Holy Ghost Garden):
- **Service Type**: `system-prompt-generator`
- **Ownership**: ROOT CA (Holy Ghost Garden)
- **Storage**: Redis-backed (`eden:system-prompts:{serviceType}`)
- **Generation**: LLM-powered prompt creation from natural language descriptions
- **Costing**: iGas-based intelligent service

#### Redis Storage Schema

**Key Pattern:**
```text
eden:system-prompts:{serviceType}
```

**Example Keys:**
- `eden:system-prompts:movie`
- `eden:system-prompts:dex`
- `eden:system-prompts:ecommerce`
- `eden:system-prompts:airline`

**Value Structure:**
```json
{
  "serviceType": "ecommerce",
  "promptId": "prompt:ecommerce:multi-vendor:001",
  "queryExtractionPrompt": "...",
  "responseFormattingPrompt": "...",
  "generatedAt": 1735515100000,
  "generatedBy": "eden:root:ca:00000000-0000-0000-0000-000000000001",
  "iGasCost": 0.0025,
  "version": 1,
  "metadata": {
    "description": "Multi-vendor ecommerce service provider",
    "requiredFields": ["vendorId", "location", "price", "shippingCost", "categories", "itemName", "quantity"],
    "ledgerFields": ["vendorId", "location", "price", "shippingCost", "categories", "itemName", "quantity"]
  }
}
```

#### LLM-Based Prompt Generation

**Natural Language Input:**
```
"Need a multi vendor ecommerce service provider that needs to persist 
vendorId/location/price/shipping cost/categories/itemName/quantity etc in ledger"
```

**Generation Flow:**
1. **User/Admin submits natural language description** → ROOT CA System Prompt Generator
2. **LLM analyzes description** → Extracts:
   - Service type (e.g., "ecommerce")
   - Required fields (vendorId, location, price, shippingCost, categories, itemName, quantity)
   - Ledger persistence requirements
   - Query patterns (search, filter, purchase)
   - Response formatting needs
3. **LLM generates two prompts**:
   - **Query Extraction Prompt**: Instructions for extracting user intent from natural language
   - **Response Formatting Prompt**: Instructions for formatting provider responses
4. **Prompts stored in Redis** → Keyed by `serviceType`
5. **iGas charged** → Based on LLM generation complexity

#### Sample Generated Prompts

**Query Extraction Prompt (Generated):**
```
You are Eden Core AI query processor for multi-vendor ecommerce services.
Extract service query from user input.
Return JSON only with: query (object with serviceType and filters), serviceType, confidence.

Service type: "ecommerce"

For ecommerce queries, extract:
- vendorId: Specific vendor identifier (if mentioned)
- location: Shipping location or pickup location
- categories: Product categories (e.g., "electronics", "clothing", "books")
- itemName: Product name or search term
- maxPrice: Maximum price filter
- shippingCost: Shipping cost preference (free shipping, express, etc.)
- quantity: Desired quantity

Example: {"query": {"serviceType": "ecommerce", "filters": {"itemName": "laptop", "categories": ["electronics"], "maxPrice": 1000, "location": "New York", "shippingCost": "free"}}, "serviceType": "ecommerce", "confidence": 0.95}
```

**Response Formatting Prompt (Generated):**
```
You are Eden Core AI response formatter for multi-vendor ecommerce services.
Format service provider listings into user-friendly chat response.

Your responsibilities:
1. Filter listings based on user query filters (vendorId, location, categories, itemName, maxPrice, shippingCost, quantity)
2. If maxPrice is specified, only include listings with price <= maxPrice
3. If location is specified, prioritize vendors that ship to that location
4. If categories are specified, filter by matching categories
5. If shippingCost preference is "free", prioritize free shipping options
6. Format the filtered results showing: vendor name, item name, price, shipping cost, availability, categories
7. Select the best option based on user criteria (best price, free shipping, vendor reputation, etc.)

IMPORTANT: When returning selectedListing, you MUST include ALL fields from the original listing:
- providerId (e.g., "vendor-001")
- vendorId
- itemName
- price
- shippingCost
- categories
- quantity (available)
- location

Return JSON with: message (string), listings (array of filtered listings), selectedListing (best option with ALL original fields including providerId, vendorId, itemName, price, shippingCost, categories, quantity, location, or null).
```

#### API Endpoints

**POST `/api/root-ca/system-prompt/generate`**
- **Purpose**: Generate system prompts from natural language description
- **Request Body**:
  ```json
  {
    "description": "Need a multi vendor ecommerce service provider that needs to persist vendorId/location/price/shipping cost/categories/itemName/quantity etc in ledger",
    "serviceType": "ecommerce",
    "requiredFields": ["vendorId", "location", "price", "shippingCost", "categories", "itemName", "quantity"]
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "promptId": "prompt:ecommerce:multi-vendor:001",
    "serviceType": "ecommerce",
    "queryExtractionPrompt": "...",
    "responseFormattingPrompt": "...",
    "iGasCost": 0.0025,
    "redisKey": "eden:system-prompts:ecommerce"
  }
  ```

**GET `/api/root-ca/system-prompt/:serviceType`**
- **Purpose**: Retrieve system prompts for a service type
- **Response**: Returns stored prompts from Redis

**PUT `/api/root-ca/system-prompt/:serviceType`**
- **Purpose**: Update system prompts for a service type
- **Request Body**: New prompt content
- **Note**: Creates new version, preserves history

**DELETE `/api/root-ca/system-prompt/:serviceType`**
- **Purpose**: Delete system prompts (admin only)
- **Note**: Soft delete (marks as deleted, preserves for audit)

#### Usage by Gardens

**Garden Query Flow with Dynamic Prompts:**
1. Garden receives user query
2. Garden determines `serviceType` (from UI context or LLM extraction)
3. Garden queries Redis: `GET eden:system-prompts:{serviceType}`
4. If prompt exists:
   - Use stored prompts for LLM calls
   - Charge iGas based on prompt complexity
5. If prompt doesn't exist:
   - Fall back to default prompts
   - Optionally trigger prompt generation

**Example Code Flow:**
```typescript
// Garden retrieves system prompt from Redis
const promptKey = `eden:system-prompts:${serviceType}`;
const promptData = await redis.get(promptKey);

if (promptData) {
  const prompts = JSON.parse(promptData);
  // Use prompts.queryExtractionPrompt for query extraction
  // Use prompts.responseFormattingPrompt for response formatting
  // Charge iGas: prompts.iGasCost
} else {
  // Fall back to default hardcoded prompts
  // Or trigger prompt generation service
}
```

#### iGas Costing Model

**Prompt Generation Costs:**
- **Base Cost**: 0.001 JSC (LLM analysis of description)
- **Complexity Multiplier**: Based on number of fields and requirements
  - Simple (1-3 fields): 1.0x
  - Medium (4-6 fields): 1.5x
  - Complex (7+ fields): 2.0x
- **Prompt Length**: Additional cost for longer prompts
- **Total iGas**: `baseCost × complexityMultiplier + lengthCost`

**Prompt Usage Costs:**
- Each LLM call using generated prompts charges `promptData.iGasCost`
- This cost is added to the standard iGas calculation
- Ensures prompt generation service is self-sustaining

#### Benefits

**For Service Providers:**
- ✅ **No Hardcoding**: Service providers don't need to write prompts
- ✅ **Natural Language**: Describe requirements in plain English
- ✅ **Automatic Optimization**: LLM generates optimized prompts
- ✅ **Version Control**: Prompt versions tracked in Redis

**For System:**
- ✅ **Scalability**: New service types added without code changes
- ✅ **Intelligence**: LLM adapts prompts to service requirements
- ✅ **Consistency**: Standardized prompt structure across service types
- ✅ **Auditability**: All prompts stored with generation metadata

**For Users:**
- ✅ **Better Results**: Prompts optimized for each service type
- ✅ **Faster Onboarding**: New service types available immediately
- ✅ **Lower Costs**: Optimized prompts reduce unnecessary LLM calls

#### Implementation Requirements

**REQ-PROMPT-001**: Redis Storage
- System prompts stored in Redis with key pattern `eden:system-prompts:{serviceType}`
- TTL: No expiration (persistent storage)
- Replication: Prompts replicated across gardens via Redis streams

**REQ-PROMPT-002**: LLM Generation Service
- ROOT CA System Prompt Generator service in Holy Ghost Garden
- Uses DeepSeek/OpenAI to generate prompts from natural language
- Validates generated prompts for completeness and correctness
- Charges iGas for generation

**REQ-PROMPT-003**: Prompt Versioning
- Each prompt update creates new version
- Version history stored in Redis
- Rollback capability to previous versions
- Audit trail of all prompt changes

**REQ-PROMPT-004**: Fallback Mechanism
- Default prompts for common service types (movie, dex)
- Graceful degradation if Redis unavailable
- Prompt generation queue for async processing

**REQ-PROMPT-005**: Ledger Integration
- Generated prompts include ledger field mappings
- Ensures transaction data matches prompt requirements
- Validates ledger entries against prompt metadata

---

### 8.6 Transaction Notification Code Generation Service

Eden provides an **LLM-powered code generation service** that creates ready-to-use code samples for external service providers to implement the three-level transaction notification system (Webhook, Pull, Push).

#### Architecture Overview

**ROOT CA Notification Code Generator Service** (Holy Ghost Garden):
- **Service Type**: `notification-code-generator`
- **Ownership**: ROOT CA (Holy Ghost Garden)
- **Storage**: Redis-backed (`eden:notification-code:{providerId}`)
- **Generation**: LLM-powered code generation for multiple languages and frameworks
- **Costing**: iGas-based intelligent service

#### Three-Level Notification System

Eden provides **three complementary notification mechanisms** for service providers:

**1️⃣ Webhook (Push - Best Effort)**
- Garden pushes transaction snapshot to provider's webhook URL
- Near-real-time delivery
- Best effort only (no delivery guarantees)
- Retry logic handled by garden

**2️⃣ Pull/Poll (Safety Net)**
- Provider queries garden RPC endpoint periodically
- Provider controls reliability and polling frequency
- Fallback if webhook fails
- No inbound firewall rules required

**3️⃣ RPC (Canonical Source)**
- Provider queries garden RPC for transaction status
- Source of truth for transaction data
- Bot-friendly, cacheable, stateless
- Same model as Ethereum/Solana RPC

#### Code Generation Flow

**Input:**
```json
{
  "providerId": "vendor-001",
  "providerName": "Multi-Vendor Ecommerce",
  "language": "typescript",
  "framework": "express",
  "gardenEndpoint": "https://garden-alpha.eden.io",
  "webhookUrl": "https://api.vendor-001.com/eden/webhook",
  "notificationMethods": ["webhook", "pull", "rpc"]
}
```

**LLM Generation Process:**
1. **Analyzes provider requirements** → Determines code structure
2. **Generates webhook receiver code** → Handles POST requests from garden
3. **Generates pull/poll code** → Periodic RPC queries with retry logic
4. **Generates RPC client code** → Query transaction status by payer/snapshot
5. **Generates integration code** → Combines all three methods
6. **Stores in Redis** → Keyed by `providerId`

#### Sample Generated Code

**TypeScript/Express Webhook Receiver:**
```typescript
import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// Webhook endpoint for receiving transaction notifications
app.post('/eden/webhook', async (req, res) => {
  try {
    const { event, snapshot, ledger, timestamp } = req.body;
    
    // Verify webhook signature (if implemented)
    const signature = req.headers['x-eden-signature'];
    // Add signature verification logic here
    
    if (event === 'tx-finalized') {
      // Process transaction
      const txId = snapshot.txId;
      const payer = snapshot.payer;
      const amount = snapshot.amount;
      const bookingDetails = ledger.bookingDetails;
      
      // Extract service-specific fields
      const vendorId = bookingDetails.vendorId;
      const itemName = bookingDetails.itemName;
      const quantity = bookingDetails.quantity;
      const shippingCost = bookingDetails.shippingCost;
      
      // Update your database
      await updateOrderStatus(txId, {
        status: 'completed',
        vendorId,
        itemName,
        quantity,
        shippingCost,
        amount,
        payer
      });
      
      console.log(`✅ Transaction finalized: ${txId} for ${payer}`);
    }
    
    res.status(200).json({ success: true, receivedAt: Date.now() });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook receiver listening on port ${PORT}`);
});
```

**TypeScript Pull/Poll Client:**
```typescript
import axios from 'axios';

interface TransactionStatus {
  txId: string;
  status: 'pending' | 'completed' | 'failed';
  payer: string;
  amount: number;
  bookingDetails: any;
}

class EdenTransactionPoller {
  private gardenEndpoint: string;
  private pollInterval: number = 5000; // 5 seconds
  private timeout: number = 300000; // 5 minutes
  private startTime: number;
  
  constructor(gardenEndpoint: string) {
    this.gardenEndpoint = gardenEndpoint;
    this.startTime = Date.now();
  }
  
  async pollTransactionStatus(payerEmail: string): Promise<TransactionStatus | null> {
    while (Date.now() - this.startTime < this.timeout) {
      try {
        const response = await axios.get(
          `${this.gardenEndpoint}/rpc/tx/status`,
          { params: { payer: payerEmail } }
        );
        
        if (response.data.status === 'completed') {
          return response.data;
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      } catch (error) {
        console.error('Poll error:', error);
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      }
    }
    
    return null; // Timeout
  }
}

// Usage
const poller = new EdenTransactionPoller('https://garden-alpha.eden.io');
const transaction = await poller.pollTransactionStatus('customer@example.com');
if (transaction) {
  console.log('Transaction found:', transaction);
}
```

**TypeScript RPC Client (Canonical Source):**
```typescript
import axios from 'axios';

class EdenRPCClient {
  private gardenEndpoint: string;

  constructor(gardenEndpoint: string) {
    this.gardenEndpoint = gardenEndpoint;
  }
  
  // Query transaction by payer email
  async getTransactionByPayer(payerEmail: string) {
    const response = await axios.get(
      `${this.gardenEndpoint}/rpc/getTransactionByPayer`,
      { params: { payer: payerEmail } }
    );
    return response.data;
  }
  
  // Query transaction by snapshot ID
  async getTransactionBySnapshot(snapshotId: string) {
    const response = await axios.get(
      `${this.gardenEndpoint}/rpc/getTransactionBySnapshot`,
      { params: { snapshot_id: snapshotId } }
    );
    return response.data;
  }
  
  // Get latest snapshot for provider
  async getLatestSnapshot(providerId: string) {
    const response = await axios.get(
      `${this.gardenEndpoint}/rpc/getLatestSnapshot`,
      { params: { provider_id: providerId } }
    );
    return response.data;
  }
  
  // Register webhook URL
  async registerWebhook(providerId: string, webhookUrl: string) {
    const response = await axios.post(
      `${this.gardenEndpoint}/rpc/webhook/register`,
      { providerId, webhookUrl }
    );
    return response.data;
  }
  
  // Unregister webhook
  async unregisterWebhook(providerId: string) {
    const response = await axios.post(
      `${this.gardenEndpoint}/rpc/webhook/unregister`,
      { providerId }
    );
    return response.data;
  }
}

// Usage
const rpc = new EdenRPCClient('https://garden-alpha.eden.io');

// Query by payer
const transactions = await rpc.getTransactionByPayer('customer@example.com');

// Query by snapshot ID
const transaction = await rpc.getTransactionBySnapshot('tx-12345');

// Register webhook
await rpc.registerWebhook('vendor-001', 'https://api.vendor-001.com/eden/webhook');
```

**Python/Flask Integration Example:**
```python
from flask import Flask, request, jsonify
import requests
import time
from typing import Optional, Dict, Any

app = Flask(__name__)

GARDEN_ENDPOINT = "https://garden-alpha.eden.io"

class EdenNotificationClient:
    def __init__(self, garden_endpoint: str):
        self.garden_endpoint = garden_endpoint
    
    def get_transaction_by_payer(self, payer_email: str) -> Optional[Dict[str, Any]]:
        """RPC: Query transaction by payer email"""
        response = requests.get(
            f"{self.garden_endpoint}/rpc/getTransactionByPayer",
            params={"payer": payer_email}
        )
        if response.status_code == 200:
            return response.json()
        return None
    
    def poll_transaction_status(self, payer_email: str, timeout: int = 300) -> Optional[Dict[str, Any]]:
        """Pull: Poll transaction status until timeout"""
        start_time = time.time()
        while time.time() - start_time < timeout:
            transaction = self.get_transaction_by_payer(payer_email)
            if transaction and transaction.get('status') == 'completed':
                return transaction
            time.sleep(5)  # Poll every 5 seconds
        return None

# Webhook receiver
@app.route('/eden/webhook', methods=['POST'])
def webhook_receiver():
    """Webhook: Receive push notifications from garden"""
    data = request.json
    event = data.get('event')
    snapshot = data.get('snapshot', {})
    ledger = data.get('ledger', {})
    
    if event == 'tx-finalized':
        tx_id = snapshot.get('txId')
        payer = snapshot.get('payer')
        amount = snapshot.get('amount')
        booking_details = ledger.get('bookingDetails', {})
        
        # Process transaction
        vendor_id = booking_details.get('vendorId')
        item_name = booking_details.get('itemName')
        quantity = booking_details.get('quantity')
        
        # Update database
        update_order_status(tx_id, {
            'status': 'completed',
            'vendor_id': vendor_id,
            'item_name': item_name,
            'quantity': quantity,
            'amount': amount,
            'payer': payer
        })
        
        return jsonify({'success': True}), 200
    
    return jsonify({'error': 'Unknown event'}), 400

def update_order_status(tx_id: str, order_data: Dict[str, Any]):
    """Update order status in database"""
    # Implement your database update logic here
    print(f"Updating order {tx_id}: {order_data}")

if __name__ == '__main__':
    app.run(port=3000)
```

#### API Endpoints

**POST `/api/root-ca/notification-code/generate`**
- **Purpose**: Generate notification code samples for service provider
- **Request Body**:
  ```json
  {
    "providerId": "vendor-001",
    "providerName": "Multi-Vendor Ecommerce",
    "language": "typescript",
    "framework": "express",
    "gardenEndpoint": "https://garden-alpha.eden.io",
    "webhookUrl": "https://api.vendor-001.com/eden/webhook",
    "notificationMethods": ["webhook", "pull", "rpc"],
    "serviceType": "ecommerce",
    "requiredFields": ["vendorId", "itemName", "quantity", "shippingCost"]
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "providerId": "vendor-001",
    "codeSamples": {
      "webhook": "...",
      "pull": "...",
      "rpc": "...",
      "integration": "..."
    },
    "iGasCost": 0.0035,
    "redisKey": "eden:notification-code:vendor-001"
  }
  ```

**GET `/api/root-ca/notification-code/:providerId`**
- **Purpose**: Retrieve generated code samples for provider
- **Response**: Returns stored code samples from Redis

**PUT `/api/root-ca/notification-code/:providerId`**
- **Purpose**: Regenerate code samples (e.g., for different language/framework)
- **Request Body**: Updated requirements
- **Note**: Creates new version, preserves history

#### Supported Languages and Frameworks

**Languages:**
- TypeScript/JavaScript
- Python
- Go
- Java
- PHP
- Ruby

**Frameworks:**
- Express.js (Node.js)
- Flask/FastAPI (Python)
- Spring Boot (Java)
- Gin/Echo (Go)
- Laravel (PHP)
- Rails (Ruby)

#### iGas Costing Model

**Code Generation Costs:**
- **Base Cost**: 0.002 JSC (LLM analysis and code generation)
- **Language Multiplier**: 
  - Common (TypeScript, Python): 1.0x
  - Less common (Go, Java): 1.2x
  - Rare (PHP, Ruby): 1.5x
- **Method Multiplier**: Based on number of notification methods
  - Single method: 1.0x
  - Two methods: 1.3x
  - Three methods: 1.5x
- **Total iGas**: `baseCost × languageMultiplier × methodMultiplier`

**Code Usage Costs:**
- Code generation is a one-time cost
- No per-use charges for generated code
- Service providers can regenerate code as needed

#### Benefits

**For Service Providers:**
- ✅ **Ready-to-Use Code**: Copy-paste integration code
- ✅ **Multiple Languages**: Choose preferred language/framework
- ✅ **Best Practices**: Generated code follows Eden patterns
- ✅ **Three Methods**: Webhook, Pull, and RPC all included
- ✅ **Error Handling**: Retry logic and error handling built-in

**For System:**
- ✅ **Standardization**: Consistent integration patterns
- ✅ **Reduced Support**: Less manual integration support needed
- ✅ **Faster Onboarding**: New providers integrate quickly
- ✅ **Documentation**: Code serves as living documentation

**For Users:**
- ✅ **Reliable Notifications**: Multiple notification methods ensure delivery
- ✅ **Faster Service Activation**: Providers integrate faster
- ✅ **Better Service Quality**: Standardized integration reduces errors

#### Implementation Requirements

**REQ-CODE-001**: Code Generation Service
- ROOT CA Notification Code Generator service in Holy Ghost Garden
- Uses DeepSeek/OpenAI to generate code from provider requirements
- Validates generated code for syntax correctness
- Charges iGas for generation

**REQ-CODE-002**: Redis Storage
- Generated code stored in Redis with key pattern `eden:notification-code:{providerId}`
- TTL: No expiration (persistent storage)
- Version history maintained for rollback

**REQ-CODE-003**: Multi-Language Support
- Code generation for multiple languages and frameworks
- Language-specific best practices and patterns
- Framework-specific optimizations

**REQ-CODE-004**: Three-Method Integration
- All code samples include webhook, pull, and RPC methods
- Integration examples showing how to combine methods
- Fallback logic between methods

**REQ-CODE-005**: Service-Specific Fields
- Generated code extracts service-specific fields from ledger
- Field mappings based on service type (ecommerce, movie, etc.)
- Type-safe field extraction

---

## 9. Dynamic Bonds & Pricing

- Every successful transaction:
  - Increases service bond
  - Improves reputation
  - Can lower fees

- Poor service:
  - Bond reduced
  - Routing deprioritized

This replaces ratings with **economic truth**.

---

## 10. No‑Rug DEX Model (Optional Layer)

- Pools must be ROOT‑certified
- Creator cannot rug without losing bond
- Trades increase pool value slightly
- High‑frequency traders rewarded, not penalized

Eden supports DEX/CEX without native tokens.

### 9.1 Token Gardens & DEX Pools

DEX token/pool services are provided by **specialized token gardens**:

- Each token garden manages one or more token pools
- Pools are assigned to token gardens at initialization
- Token gardens provide DEX-specific routing and intelligence
- LLM routes DEX queries to appropriate token gardens
- Example: "I want to BUY 2 SOLANA token A" → routed to TokenGarden-T1 managing TOKENA pool

### 9.2 Price Impact & Pool Growth

- Each trade increases pool value by **0.001%** (price impact)
- Pool liquidity grows organically through trading activity
- Constant product formula (x × y = k) ensures price discovery
- No external liquidity providers required beyond initial ROOT CA liquidity

### 9.3 iTax: DEX Trading Commission

iTax is a **0.0005% commission** on all DEX trades, serving as a second liquidity source.

#### iTax Distribution (WIN-WIN-WIN Model)

| Recipient | Share | Purpose |
|---------|------|---------|
| ROOT CA | 40% | Governance & liquidity growth |
| Token Garden | 30% | Reward for providing token pool services |
| Trader | 30% | Rebate back to buyer/seller |

This creates a **WIN-WIN-WIN** economy where:
- ROOT CA liquidity pool grows over time
- Token gardens are rewarded for service provision
- Traders receive rebates, incentivizing participation

#### iTax Flow Example

```
Trade Value: 1.0 SOL
iTax (0.0005%): 0.000005 SOL

Distribution:
├─ ROOT CA: 0.000002 SOL (40%) → Added to ROOT CA liquidity pool
├─ Garden: 0.0000015 SOL (30%) → Reward to token garden
└─ Trader: 0.0000015 SOL (30%) → Rebate added to user balance
```

### 9.4 ROOT CA Liquidity Pool

- Initial ROOT CA liquidity provides first liquidity source for DEX operations
- iTax contributions continuously grow ROOT CA liquidity
- ROOT CA liquidity acts as system-wide insurance and stability fund
- Enables new token pools to bootstrap without external capital

### 9.5 DEX Query Flow

**New Flow (Garden of Eden Main Street):**

1. User clicks "DEX Tokens" card → Input auto-populated with sample query
2. **Service type already known** (dex) - no LLM needed for type resolution
3. User submits: "I want to BUY 2 SOLANA token A at 1 Token/SOL or with best price"
4. LLM extracts: `tokenSymbol: "TOKENA"`, `baseToken: "SOL"`, `action: "BUY"`, `tokenAmount: 2` (serviceType already known from context)
5. **Garden queries ROOT CA ServiceRegistry** → Returns DEX pool service providers
6. Token garden provides pool listings with real-time prices
7. LLM selects best pool based on price and liquidity
8. Trade executes with price impact and iTax calculation
9. **ROOT CA settles transaction** → Updates balances, distributes iTax: ROOT CA (40%), Garden (30%), Trader (30%)
10. Pool state updated, snapshot created, streamed to gardens

**Key Improvement:** Service type resolution moved from LLM to UI selection, reducing LLM calls and improving latency.

---

## 11. SaaS & Legacy Integration

Eden integrates via **API plugins**:
- AMC
- MovieCom
- Banks
- Wallets
- Payment processors

Legacy systems keep control; Eden handles intelligence, trust, and settlement.

---

## 12. Security & Identity

- Google identity only
- Email‑based trust
- Abuse detection via LLM policing
- No private key management for users

---

## 13. Deployment Model

### 12.1 Initial Bootstrap

**Eden Startup Sequence:**

1. **ROOT CA Initialization**
   - ROOT CA identity created
   - Root certificate generated (`eden-root-ca.pem`, `eden-root-ca.key`)
   - Certificate registry initialized
   - Revocation stream created (`eden:encert:revocations`)

2. **Holy Ghost Garden Activation**
   - Holy Ghost garden loaded (ROOT CA's dedicated infrastructure garden)
   - Infrastructure services registered:
     - Stripe Payment Rail Service (`stripe-payment-rail-001`)
     - Settlement Service (`settlement-service-001`)
     - Service Registry (`service-registry-001`)
     - Web Server Service (`webserver-service-001`)
     - WebSocket Service (`websocket-service-001`)
     - Wallet Service (`wallet-service-001`)
     - Accountant Service (`accountant-service-001`)
     - Price Order Service (`price-order-service-001`)
     - System Prompt Generator Service (`system-prompt-generator-001`)
     - Notification Code Generator Service (`notification-code-generator-001`)
   - Holy Ghost certificate issued

3. **Replication Bus Initialization**
   - Redis connection established
   - Replication streams created
   - Persistence file loaded (`eden-wallet-persistence.json`)
   - Wallet balances restored
   - Ledger entries restored
   - Dynamic gardens restored (if any)

4. **No Additional Gardens at Startup**
   - Only ROOT CA and Holy Ghost are active
   - All other gardens (movie, token) are created dynamically via UI
   - System starts minimal and grows organically

**Bootstrap Architecture:**
```
[ ROOT CA ]
     |
     v
[ Holy Ghost Garden ]
     |
     ├─── Stripe Payment Rail
     ├─── Settlement Service
     ├─── Service Registry
     ├─── Wallet Service
     ├─── Accountant Service
     ├─── Price Order Service
     ├─── System Prompt Generator
     ├─── Notification Code Generator
     └─── Replication Bus (Redis)
```

---

### 12.2 Dynamic Garden Creation Workflow

All additional gardens (movie, token, etc.) are created **dynamically** via the Angular UI in a wizard-style interface. Gardens are **not** pre-configured at startup.

#### Creation Modes

**GOD Mode:**
- Full visibility into system architecture
- Can create any garden type
- Full access to infrastructure services
- Complete system transparency

**Priest Mode:**
- Service-focused view
- Can create service provider gardens
- Limited visibility into infrastructure
- Focused on operational needs

#### Wizard-Style Creation Interface

The Angular UI provides a **multi-step wizard** for garden creation:

**Step 1: Garden Type Selection**
- Select garden type: Movie Garden, Token Garden, or Custom
- View requirements and costs for each type
- Preview capabilities and service types

**Step 2: Configuration**
- **Garden Name**: Human-readable name
- **Network Binding**:
  - Server IP address
  - Server domain (optional)
  - Server port
  - Network type (http/https)
- **Capabilities**: Selected based on garden type
- **Service Types**: Services this garden will provide

**Step 3: Funding & Economics**
- **Deployment Fee**: One-time cost to create garden (e.g., 110 JSC for movie garden)
- **Insurance Fee**: Initial bond/insurance requirement
- **iGas Reserve**: Estimated iGas costs for operations
- **Reputation Score**: Initial reputation (default: 4.0)
- **Total Cost**: Sum of all fees

**Step 4: LLM System Prompt Generation**
- **Service Description**: Natural language description of services
- **Required Fields**: Fields to persist in ledger
- **LLM Generation**: System prompts generated automatically
- **Review & Edit**: Option to review and modify generated prompts

**Step 5: Notification Code Generation**
- **Language Selection**: TypeScript, Python, Go, Java, etc.
- **Framework Selection**: Express, Flask, Spring Boot, etc.
- **Notification Methods**: Webhook, Pull, RPC (or all three)
- **Code Generation**: Integration code generated automatically
- **Download**: Code samples provided for integration

**Step 6: Payment & Confirmation**
- **Wallet Balance Check**: Verify sufficient JSC balance
- **Payment Method**: 
  - Direct wallet debit (if sufficient balance)
  - Stripe Checkout (if insufficient balance)
- **Confirmation**: Review all settings before creation

**Step 7: Garden Activation**
- **Certificate Issuance**: ENCERT certificate issued by ROOT CA
- **Service Provider Registration**: Default providers created (for movie gardens)
- **Persistence**: Garden saved to Redis persistence file
- **Activation**: Garden becomes active and available

---

### 12.3 Movie Garden Creation Workflow

**Example: Creating a Movie Service Garden**

#### Step 1: Type Selection
```
User selects: "Movie Service Garden"
Cost: 110 JSC
Capabilities: GARDEN, ISSUE_CERT
Service Types: movie, snake (advertising)
```

#### Step 2: Configuration
```json
{
  "gardenName": "Garden-D",
  "serverIp": "192.168.1.200",
  "serverDomain": "garden-delta.eden.io",
  "serverPort": 8080,
  "networkType": "https",
  "gardenId": "garden-d"
}
```

#### Step 3: Funding Requirements
```json
{
  "deploymentFee": 110,
  "insuranceFee": 1000,
  "iGasReserve": 50,
  "reputationScore": 4.0,
  "totalCost": 1160
}
```

**Funding Breakdown:**
- **Deployment Fee (110 JSC)**: One-time cost to create garden infrastructure
- **Insurance Fee (1000 JSC)**: Initial bond for service providers
- **iGas Reserve (50 JSC)**: Estimated operational costs
- **Total Required**: 1160 JSC

#### Step 4: LLM System Prompt Generation

**Service Description Input:**
```
"Need a movie service provider that needs to persist 
movieTitle/showtime/location/price/reviewCount/rating in ledger"
```

**LLM Generates:**
- Query extraction prompt (for movie queries)
- Response formatting prompt (for movie listings)
- Ledger field mappings (movieTitle, showtime, location, price, reviewCount, rating)

**Generated Prompts Stored:**
- Redis key: `eden:system-prompts:movie`
- Version: 1
- iGas cost: 0.0025 JSC

#### Step 5: Notification Code Generation

**Configuration:**
```json
{
  "language": "typescript",
  "framework": "express",
  "notificationMethods": ["webhook", "pull", "rpc"],
  "gardenEndpoint": "https://garden-delta.eden.io"
}
```

**Generated Code:**
- Webhook receiver (Express endpoint)
- Pull/poll client (with retry logic)
- RPC client (canonical source queries)
- Integration example (combining all methods)

**Code Stored:**
- Redis key: `eden:notification-code:garden-d`
- iGas cost: 0.0035 JSC

#### Step 6: Payment Flow

**Wallet Balance Check:**
```
Current Balance: 1200 JSC
Required: 1160 JSC
Status: ✅ Sufficient
```

**Payment Method:**
- **Option A**: Direct wallet debit (if balance >= 1160 JSC)
  - Debit 1160 JSC from wallet
  - Proceed to activation
- **Option B**: Stripe Checkout (if balance < 1160 JSC)
  - Create Stripe Checkout session
  - User completes payment
  - Webhook confirms payment
  - Proceed to activation

#### Step 7: Garden Activation

**Certificate Issuance:**
```json
{
  "subject": "eden:garden:abc123...",
  "issuer": "eden:root:ca:00000000-0000-0000-0000-000000000001",
  "capabilities": ["GARDEN", "ISSUE_CERT"],
  "constraints": {
    "gardenId": "garden-d",
    "gardenName": "Garden-D",
    "serverIp": "192.168.1.200",
    "serverDomain": "garden-delta.eden.io",
    "serverPort": 8080,
    "networkType": "https"
  }
}
```

**Default Service Providers Created:**
- Regal Cinemas (`regal-001-garden-d`)
- Cineplex (`cineplex-001-garden-d`)
- MovieMax (`moviemax-001-garden-d`)

**Persistence:**
- Garden saved to `eden-wallet-persistence.json`
- Survives server reboot
- Certificate stored in certificate registry

**Activation:**
- Garden added to `GARDENS` array
- Stream created: `eden:garden:D`
- Garden becomes active and available for routing

---

### 12.4 Token Garden Creation Workflow

**Example: Creating a Token Service Garden**

#### Step 1: Type Selection
```
User selects: "Token Service Garden"
Cost: 150 JSC
Capabilities: GARDEN, ISSUE_CERT
Service Types: dex (token pools)
```

#### Step 2: Configuration
```json
{
  "gardenName": "TokenGarden-T3",
  "serverIp": "192.168.1.300",
  "serverDomain": "token-garden-t3.eden.io",
  "serverPort": 8080,
  "networkType": "https",
  "gardenId": "T3",
  "tokenServiceType": "dex"
}
```

#### Step 3: Funding Requirements
```json
{
  "deploymentFee": 150,
  "insuranceFee": 2000,
  "iGasReserve": 100,
  "reputationScore": 4.0,
  "totalCost": 2250
}
```

**Funding Breakdown:**
- **Deployment Fee (150 JSC)**: Higher cost for specialized DEX infrastructure
- **Insurance Fee (2000 JSC)**: Higher bond for token pool services
- **iGas Reserve (100 JSC)**: Higher operational costs for DEX operations
- **Total Required**: 2250 JSC

#### Step 4: LLM System Prompt Generation

**Service Description Input:**
```
"Need a DEX token pool service provider that needs to persist 
tokenSymbol/baseToken/price/liquidity/poolId/gardenId in ledger"
```

**LLM Generates:**
- Query extraction prompt (for DEX trading queries)
- Response formatting prompt (for token pool listings)
- Ledger field mappings (tokenSymbol, baseToken, price, liquidity, poolId, gardenId)
- iTax calculation logic

**Generated Prompts Stored:**
- Redis key: `eden:system-prompts:dex`
- Version: 1
- iGas cost: 0.0030 JSC

#### Step 5: Notification Code Generation

**Configuration:**
```json
{
  "language": "typescript",
  "framework": "express",
  "notificationMethods": ["webhook", "pull", "rpc"],
  "gardenEndpoint": "https://token-garden-t3.eden.io",
  "serviceType": "dex",
  "requiredFields": ["tokenSymbol", "baseToken", "price", "liquidity"]
}
```

**Generated Code:**
- Webhook receiver (with DEX-specific fields)
- Pull/poll client (for transaction status)
- RPC client (for pool queries)
- DEX-specific integration example

**Code Stored:**
- Redis key: `eden:notification-code:T3`
- iGas cost: 0.0040 JSC

#### Step 6: Payment Flow

**Wallet Balance Check:**
```
Current Balance: 2000 JSC
Required: 2250 JSC
Status: ❌ Insufficient
Action: Initiate Stripe Checkout
```

**Stripe Checkout:**
- Create session for 250 JSC (difference)
- User completes payment
- Webhook confirms payment
- Total balance: 2250 JSC
- Proceed to activation

#### Step 7: Token Garden Activation

**Certificate Issuance:**
```json
{
  "subject": "eden:token-garden:def456...",
  "issuer": "eden:root:ca:00000000-0000-0000-0000-000000000001",
  "capabilities": ["GARDEN", "ISSUE_CERT"],
  "constraints": {
    "gardenId": "T3",
    "gardenName": "TokenGarden-T3",
    "tokenServiceType": "dex",
    "serverIp": "192.168.1.300",
    "serverDomain": "token-garden-t3.eden.io",
    "serverPort": 8080,
    "networkType": "https"
  }
}
```

**Token Pools Created:**
- Pool assignment based on available tokens
- Default pools: TOKENA/SOL, TOKENB/SOL, etc.
- Initial ROOT CA liquidity provided

**Persistence:**
- Token garden saved to `eden-wallet-persistence.json`
- Survives server reboot
- Certificate stored in certificate registry

**Activation:**
- Token garden added to `TOKEN_GARDENS` array
- Stream created: `eden:token-garden:T3`
- Token garden becomes active for DEX routing

---

### 12.5 Persistence & Recovery

**Persistence Mechanism:**
- All dynamically created gardens stored in `eden-wallet-persistence.json`
- File structure:
  ```json
  {
    "gardens": [
      {
        "id": "garden-d",
        "name": "Garden-D",
        "stream": "eden:garden:D",
        "active": true,
        "uuid": "eden:garden:abc123...",
        "createdAt": 1735515100000,
        "createdBy": "bill.draper.auto@gmail.com"
      }
    ],
    "tokenGardens": [
      {
        "id": "T3",
        "name": "TokenGarden-T3",
        "stream": "eden:token-garden:T3",
        "active": true,
        "uuid": "eden:token-garden:def456...",
        "tokenServiceType": "dex",
        "createdAt": 1735515200000,
        "createdBy": "bill.draper.auto@gmail.com"
      }
    ]
  }
  ```

**Recovery on Startup:**
1. Load persistence file
2. Restore gardens to `GARDENS` array
3. Restore token gardens to `TOKEN_GARDENS` array
4. Issue certificates to restored gardens (if not already issued)
5. Restore service providers for each garden
6. Activate all restored gardens

**Persistence Triggers:**
- **Immediate Save**: On garden creation (bypass debounce)
- **Debounced Save**: On garden updates (1 second debounce)
- **Force Save**: On server shutdown (graceful shutdown handler)

---

### 12.6 Operator Funding Requirements

**Funding Components:**

| Component          | Movie Garden | Token Garden | Purpose                    |
| ------------------ | ------------- | ------------- | -------------------------- |
| Deployment Fee     | 110 JSC       | 150 JSC       | Infrastructure setup       |
| Insurance Fee      | 1000 JSC      | 2000 JSC      | Initial bond/insurance     |
| iGas Reserve       | 50 JSC        | 100 JSC       | Operational costs          |
| Reputation Score   | 4.0 (default) | 4.0 (default) | Initial reputation         |
| **Total Required** | **1160 JSC**  | **2250 JSC**  | Complete activation        |

**Funding Sources:**
- **Wallet Balance**: Primary source (JesusCoin wallet)
- **Stripe Payment**: Fallback if insufficient balance
- **Combined**: Partial wallet + Stripe if needed

**Funding Validation:**
- Wizard checks wallet balance before proceeding
- Shows funding breakdown and requirements
- Prevents creation if insufficient funds
- Provides Stripe checkout option if needed

---

### 12.7 Wizard Interface Features

**Angular UI Wizard Components:**

1. **Step Indicator**: Visual progress (1/7, 2/7, etc.)
2. **Form Validation**: Real-time validation of inputs
3. **Cost Calculator**: Dynamic cost calculation based on selections
4. **Balance Display**: Real-time wallet balance check
5. **Preview Panel**: Preview of garden configuration before creation
6. **Code Preview**: Preview generated code samples
7. **Confirmation Dialog**: Final confirmation before payment

**GOD Mode Features:**
- Full system architecture visibility
- Access to all infrastructure services
- Complete cost breakdown
- System-wide impact preview

**Priest Mode Features:**
- Service-focused interface
- Simplified cost display
- Service provider focus
- Operational workflow emphasis

---

### 12.8 API Endpoints

**POST `/api/garden/create`**
- **Purpose**: Create new garden via wizard
- **Request Body**:
  ```json
  {
    "gardenType": "movie" | "token" | "custom",
    "gardenName": "Garden-D",
    "serverIp": "192.168.1.200",
    "serverDomain": "garden-delta.eden.io",
    "serverPort": 8080,
    "networkType": "https",
    "serviceDescription": "Need a movie service provider...",
    "requiredFields": ["movieTitle", "showtime", "location", "price"],
    "language": "typescript",
    "framework": "express",
    "notificationMethods": ["webhook", "pull", "rpc"],
    "paymentMethod": "wallet" | "stripe"
  }
  ```
- **Response**: Garden configuration and payment instructions

**POST `/api/garden/purchase`**
- **Purpose**: Direct wallet purchase (if sufficient balance)
- **Request Body**: Garden configuration
- **Response**: Created garden details

**POST `/api/garden/buy`**
- **Purpose**: Initiate Stripe Checkout for garden purchase
- **Request Body**: Garden configuration
- **Response**: Stripe Checkout session URL

**GET `/api/garden/list`**
- **Purpose**: List all active gardens
- **Response**: Array of garden configurations

**GET `/api/garden/:gardenId`**
- **Purpose**: Get specific garden details
- **Response**: Garden configuration with certificate and services

---

### 12.9 Implementation Requirements

**REQ-DEPLOY-001**: Bootstrap Sequence
- Only ROOT CA and Holy Ghost load at startup
- Infrastructure services initialized
- Replication bus established
- Persistence file loaded

**REQ-DEPLOY-002**: Dynamic Garden Creation
- Angular UI wizard for garden creation
- Multi-step workflow with validation
- GOD/Priest mode support
- Real-time cost calculation

**REQ-DEPLOY-003**: LLM Integration
- System prompt generation service
- Notification code generation service
- Natural language to code conversion
- iGas costing for generation

**REQ-DEPLOY-004**: Funding Management
- Wallet balance checking
- Deployment fee calculation
- Insurance fee requirements
- Stripe payment integration
- Combined payment support

**REQ-DEPLOY-005**: Persistence
- Garden persistence to Redis/file
- Certificate persistence
- Service provider persistence
- Recovery on startup

**REQ-DEPLOY-006**: Certificate Issuance
- Automatic certificate issuance on creation
- Network binding validation
- Capability assignment
- Certificate registry update

---

### 12.10 Benefits

**For Operators:**
- ✅ **Wizard Interface**: Step-by-step guidance
- ✅ **Cost Transparency**: Clear funding requirements
- ✅ **Code Generation**: Ready-to-use integration code
- ✅ **Flexible Payment**: Wallet or Stripe options

**For System:**
- ✅ **Minimal Startup**: Only essential components load
- ✅ **Dynamic Growth**: System grows organically
- ✅ **Persistence**: All gardens survive reboots
- ✅ **Standardization**: Consistent creation process

**For Users:**
- ✅ **Faster Service Activation**: New gardens available quickly
- ✅ **Better Service Quality**: Standardized creation ensures quality
- ✅ **More Service Options**: Easy to add new garden types

---

### 12.11 Deployment Architecture Summary

**Startup:**
```
ROOT CA + Holy Ghost + Infrastructure Services + Replication Bus
```

**Runtime:**
```
ROOT CA
  └─── Holy Ghost (Infrastructure)
  └─── Garden-A (Movie) [Dynamic]
  └─── Garden-B (Movie) [Dynamic]
  └─── Garden-C (Movie) [Dynamic]
  └─── TokenGarden-T1 (DEX) [Dynamic]
  └─── TokenGarden-T2 (DEX) [Dynamic]
  └─── TokenGarden-T3 (DEX) [Dynamic]
```

**Key Principles:**
- ✅ **Minimal Bootstrap**: Only essentials at startup
- ✅ **Dynamic Creation**: All gardens created via UI
- ✅ **Persistent Storage**: All gardens survive reboots
- ✅ **Wizard-Driven**: User-friendly creation process
- ✅ **LLM-Powered**: Intelligent prompt and code generation
- ✅ **Funding-Aware**: Clear cost requirements and payment options

---

### 12.12 One-Click Automated Deployment

For **simple garden types** (movie, token), Eden supports **fully automated single-click deployment** that replaces command-line flags with UI-driven configuration. This eliminates the need for command-line arguments like `--gardens=3 --token-gardens=2` and moves all deployment control to the Angular UI.

#### Overview

**Traditional Command-Line Approach (Deprecated):**
```bash
npx tsx .\eden-sim-redis.ts --enable-openai=true --mocked-llm=false --gardens=3 --token-gardens=2
```

**New UI-Driven Approach:**
- Angular UI provides "Quick Deploy" interface
- Single-click deployment for simple garden types
- LLM services auto-generate all configuration
- Bulk deployment support (multiple gardens at once)
- No command-line flags required

#### Supported Simple Garden Types

**Movie Gardens:**
- Pre-defined service type: `movie`
- Standard capabilities: `GARDEN`, `ISSUE_CERT`
- Default service providers: Auto-generated
- Standard funding: 1160 JSC per garden

**Token Gardens:**
- Pre-defined service type: `dex`
- Standard capabilities: `GARDEN`, `ISSUE_CERT`
- Default token pools: Auto-generated
- Standard funding: 2250 JSC per garden

#### Quick Deploy Interface

**Angular UI Components:**

1. **Quick Deploy Card**
   - Prominent card on main dashboard
   - "Deploy Movie Gardens" button
   - "Deploy Token Gardens" button
   - "Deploy Both" button

2. **Bulk Deployment Dialog**
   ```
   ┌─────────────────────────────────────┐
   │ Quick Deploy: Movie Gardens        │
   ├─────────────────────────────────────┤
   │ Number of Gardens: [3]              │
   │                                       │
   │ Total Cost: 3,480 JSC                 │
   │ (3 × 1,160 JSC)                       │
   │                                       │
   │ Wallet Balance: 5,000 JSC ✅          │
   │                                       │
   │ [Cancel]  [Deploy All]               │
   └─────────────────────────────────────┘
   ```

3. **Deployment Progress**
   - Real-time progress indicator
   - Per-garden status (creating, certifying, activating)
   - Success/failure notifications
   - Summary report

#### Automated Configuration Generation

**LLM-Driven Auto-Configuration:**

**Step 1: System Prompt Generation**
- **Input**: Garden type (`movie` or `token`)
- **LLM Service**: `system-prompt-generator-001`
- **Output**: 
  - Query extraction prompt
  - Response formatting prompt
  - Ledger field mappings
- **iGas Cost**: 0.0025 JSC (movie), 0.0030 JSC (token)

**Step 2: Notification Code Generation**
- **Input**: Garden type, language preference, framework preference
- **LLM Service**: `notification-code-generator-001`
- **Output**:
  - Webhook receiver code
  - Pull/poll client code
  - RPC client code
- **iGas Cost**: 0.0035 JSC (movie), 0.0040 JSC (token)

**Step 3: Network Binding Auto-Assignment**
- **Auto-Generated**:
  - Server IP: Sequential assignment (192.168.1.200, 192.168.1.201, ...)
  - Server Domain: `garden-{id}.eden.io` or `token-garden-{id}.eden.io`
  - Server Port: 8080 (default)
  - Network Type: `https` (default)

**Step 4: Garden Naming**
- **Movie Gardens**: `Garden-A`, `Garden-B`, `Garden-C`, ...
- **Token Gardens**: `TokenGarden-T1`, `TokenGarden-T2`, `TokenGarden-T3`, ...

#### Bulk Deployment Workflow

**Example: Deploy 3 Movie Gardens + 2 Token Gardens**

**Step 1: User Initiates Quick Deploy**
```
User clicks "Deploy Both" button
Selects: 3 Movie Gardens, 2 Token Gardens
```

**Step 2: Cost Calculation**
```json
{
  "movieGardens": {
    "count": 3,
    "costPerGarden": 1160,
    "totalCost": 3480
  },
  "tokenGardens": {
    "count": 2,
    "costPerGarden": 2250,
    "totalCost": 4500
  },
  "grandTotal": 7980
}
```

**Step 3: Wallet Balance Check**
```
Current Balance: 10,000 JSC
Required: 7,980 JSC
Status: ✅ Sufficient
```

**Step 4: Automated Deployment**

**For Each Movie Garden:**
1. Generate unique garden ID (`garden-a`, `garden-b`, `garden-c`)
2. LLM generates system prompts (movie service)
3. LLM generates notification code (TypeScript/Express)
4. Auto-assign network binding
5. Issue certificate
6. Create default service providers (Regal Cinemas, Cineplex, MovieMax)
7. Register service providers
8. Persist garden
9. Activate garden

**For Each Token Garden:**
1. Generate unique garden ID (`T1`, `T2`)
2. LLM generates system prompts (DEX service)
3. LLM generates notification code (TypeScript/Express)
4. Auto-assign network binding
5. Issue certificate
6. Create default token pools (TOKENA/SOL, TOKENB/SOL, etc.)
7. Initialize ROOT CA liquidity
8. Persist token garden
9. Activate token garden

**Step 5: Parallel Processing**
- All gardens created in parallel (where possible)
- Certificate issuance serialized (ROOT CA constraint)
- Service provider registration parallelized
- Progress updates broadcast via WebSocket

**Step 6: Completion Report**
```json
{
  "success": true,
  "movieGardens": {
    "requested": 3,
    "created": 3,
    "gardens": [
      { "id": "garden-a", "name": "Garden-A", "status": "active" },
      { "id": "garden-b", "name": "Garden-B", "status": "active" },
      { "id": "garden-c", "name": "Garden-C", "status": "active" }
    ]
  },
  "tokenGardens": {
    "requested": 2,
    "created": 2,
    "gardens": [
      { "id": "T1", "name": "TokenGarden-T1", "status": "active" },
      { "id": "T2", "name": "TokenGarden-T2", "status": "active" }
    ]
  },
  "totalCost": 7980,
  "deploymentTime": "12.5s"
}
```

#### API Endpoints

**POST `/api/garden/quick-deploy`**
- **Purpose**: Bulk deployment of simple gardens
- **Request Body**:
  ```json
  {
    "movieGardens": {
      "count": 3,
      "autoConfigure": true
    },
    "tokenGardens": {
      "count": 2,
      "autoConfigure": true
    },
    "paymentMethod": "wallet" | "stripe",
    "userEmail": "operator@example.com"
  }
  ```
- **Response**: Deployment job ID and progress endpoint
- **iGas Cost**: 0.005 JSC per garden (for LLM generation)

**GET `/api/garden/deployment-status/:jobId`**
- **Purpose**: Check deployment progress
- **Response**: Current status, progress percentage, completed gardens, errors

**POST `/api/garden/quick-deploy-movie`**
- **Purpose**: Quick deploy movie gardens only
- **Request Body**:
  ```json
  {
    "count": 3,
    "userEmail": "operator@example.com"
  }
  ```
- **Response**: Created movie gardens

**POST `/api/garden/quick-deploy-token`**
- **Purpose**: Quick deploy token gardens only
- **Request Body**:
  ```json
  {
    "count": 2,
    "userEmail": "operator@example.com"
  }
  ```
- **Response**: Created token gardens

#### LLM Service Integration

**System Prompt Generator Service (`system-prompt-generator-001`):**

**Request:**
```json
{
  "serviceType": "movie",
  "autoGenerate": true,
  "template": "standard"
}
```

**Response:**
```json
{
  "queryExtractionPrompt": "...",
  "responseFormattingPrompt": "...",
  "ledgerFields": ["movieTitle", "showtime", "location", "price"],
  "iGasCost": 0.0025,
  "version": 1
}
```

**Notification Code Generator Service (`notification-code-generator-001`):**

**Request:**
```json
{
  "serviceType": "movie",
  "language": "typescript",
  "framework": "express",
  "notificationMethods": ["webhook", "pull", "rpc"],
  "autoGenerate": true
}
```

**Response:**
```json
{
  "webhookCode": "...",
  "pullCode": "...",
  "rpcCode": "...",
  "integrationExample": "...",
  "iGasCost": 0.0035
}
```

#### Default Configurations

**Movie Garden Defaults:**
```json
{
  "serviceProviders": [
    {
      "name": "Regal Cinemas",
      "id": "regal-001-{gardenId}",
      "location": "Baltimore, Maryland",
      "reputation": 4.6,
      "bond": 1100
    },
    {
      "name": "Cineplex",
      "id": "cineplex-001-{gardenId}",
      "location": "New York, New York",
      "reputation": 4.4,
      "bond": 900
    },
    {
      "name": "MovieMax",
      "id": "moviemax-001-{gardenId}",
      "location": "Los Angeles, California",
      "reputation": 4.5,
      "bond": 1000
    }
  ],
  "capabilities": ["GARDEN", "ISSUE_CERT"],
  "networkType": "https",
  "port": 8080
}
```

**Token Garden Defaults:**
```json
{
  "tokenPools": [
    {
      "tokenSymbol": "TOKENA",
      "baseToken": "SOL",
      "initialPrice": 1.0,
      "initialLiquidity": 1000
    },
    {
      "tokenSymbol": "TOKENB",
      "baseToken": "SOL",
      "initialPrice": 1.0,
      "initialLiquidity": 1000
    }
  ],
  "capabilities": ["GARDEN", "ISSUE_CERT"],
  "networkType": "https",
  "port": 8080
}
```

#### Command-Line Flag Replacement

**Old Approach (Deprecated):**
```bash
npx tsx .\eden-sim-redis.ts \
  --enable-openai=true \
  --mocked-llm=false \
  --gardens=3 \
  --token-gardens=2
```

**New Approach:**
```bash
# Server starts with only ROOT CA + Holy Ghost
npx tsx .\eden-sim-redis.ts --enable-openai=true --mocked-llm=false

# All gardens created via Angular UI Quick Deploy
# No command-line flags needed for garden creation
```

**Benefits:**
- ✅ **UI-Driven**: All deployment via Angular UI
- ✅ **LLM-Powered**: Auto-configuration via LLM services
- ✅ **Flexible**: Deploy any number of gardens at any time
- ✅ **Persistent**: All gardens saved automatically
- ✅ **User-Friendly**: No command-line knowledge required

#### Implementation Requirements

**REQ-DEPLOY-007**: Quick Deploy Interface
- Angular UI quick deploy cards
- Bulk deployment dialog
- Progress indicator
- Success/failure notifications

**REQ-DEPLOY-008**: Automated Configuration
- LLM system prompt generation for simple types
- LLM notification code generation
- Auto-assigned network binding
- Default service provider creation

**REQ-DEPLOY-009**: Bulk Deployment
- Parallel garden creation (where possible)
- Serialized certificate issuance
- Progress tracking and reporting
- Error handling and rollback

**REQ-DEPLOY-010**: Command-Line Flag Removal
- Remove `--gardens` flag support
- Remove `--token-gardens` flag support
- Server starts minimal (ROOT CA + Holy Ghost only)
- All gardens created via UI

**REQ-DEPLOY-011**: LLM Service Integration
- System prompt generator service integration
- Notification code generator service integration
- Auto-generation for simple garden types
- iGas costing for LLM operations

#### Benefits

**For Operators:**
- ✅ **One-Click Deployment**: Deploy multiple gardens instantly
- ✅ **No CLI Knowledge**: Pure UI-driven deployment
- ✅ **Auto-Configuration**: LLM handles all configuration
- ✅ **Bulk Operations**: Deploy many gardens at once

**For System:**
- ✅ **Minimal Startup**: Server starts with essentials only
- ✅ **Dynamic Growth**: System grows on-demand via UI
- ✅ **LLM-Powered**: Intelligent auto-configuration
- ✅ **Standardized**: Consistent deployment process

**For Developers:**
- ✅ **No Command-Line Flags**: Simpler server startup
- ✅ **UI-Driven**: All deployment via Angular
- ✅ **Extensible**: Easy to add new simple garden types
- ✅ **Testable**: UI-driven deployment easier to test

---

## 14. Sample Service Providers

Eden provides **sample service provider implementations** in the codebase that demonstrate how to build standalone service providers using LLM-generated system prompts and notification code. These samples eliminate the need for hardcoded service providers and serve as templates for creating new service providers.

### 13.1 Overview

**Key Principles:**
- ✅ **Standalone Deployment**: Each service provider runs as its own process or Docker container
- ✅ **LLM-Generated Configuration**: Uses system prompts and notification code generated by Eden's LLM services
- ✅ **No Hardcoding**: All configuration comes from Eden's generation services
- ✅ **Redis Persistence**: All service providers use Redis as the persistent data layer
- ✅ **Standardized Interface**: Consistent API and integration patterns
- ✅ **Production-Ready**: Can be deployed independently or as part of Eden ecosystem

**Architecture:**
```
[ Eden ROOT CA ]
     |
     ├─── System Prompt Generator Service
     ├─── Notification Code Generator Service
     └─── Service Registry
              |
              ├─── [ Sample Movie Provider ] (standalone)
              ├─── [ Sample Token Provider ] (standalone)
              ├─── [ Sample Ecommerce Provider ] (standalone)
              └─── [ Custom Provider ] (standalone)
```

### 13.2 Service Provider Structure

Each sample service provider follows a **standardized structure**:

```
service-provider-movie/
├── src/
│   ├── main.ts                 # Entry point
│   ├── config.ts               # Configuration loader
│   ├── api.ts                  # REST API endpoints
│   ├── eden-client.ts          # Eden integration client
│   ├── notification-handler.ts # Webhook/pull/RPC handlers
│   ├── redis-client.ts         # Redis persistence layer
│   └── service-logic.ts        # Business logic
├── Dockerfile                  # Docker container definition
├── docker-compose.yml          # Docker Compose configuration (includes Redis)
├── package.json               # Dependencies (includes redis)
├── tsconfig.json              # TypeScript configuration
└── README.md                  # Documentation
```

### 13.3 Configuration Loading

**Step 1: Fetch System Prompt**

Service providers fetch their system prompt from Eden's System Prompt Generator Service:

```typescript
// config.ts
import axios from 'axios';

interface SystemPromptConfig {
  queryExtractionPrompt: string;
  responseFormattingPrompt: string;
  ledgerFields: string[];
  version: number;
}

async function loadSystemPrompt(serviceType: string): Promise<SystemPromptConfig> {
  const response = await axios.get(
    `https://eden-root-ca.io/api/system-prompt/${serviceType}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.EDEN_API_KEY}`
      }
    }
  );
  
  return response.data;
}
```

**Step 2: Fetch Notification Code**

Service providers fetch their notification integration code from Eden's Notification Code Generator Service:

```typescript
// eden-client.ts
import axios from 'axios';

interface NotificationCode {
  webhookCode: string;
  pullCode: string;
  rpcCode: string;
  integrationExample: string;
}

async function loadNotificationCode(
  serviceType: string,
  language: string = 'typescript',
  framework: string = 'express'
): Promise<NotificationCode> {
  const response = await axios.post(
    `https://eden-root-ca.io/api/notification-code/generate`,
    {
      serviceType,
      language,
      framework,
      notificationMethods: ['webhook', 'pull', 'rpc']
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.EDEN_API_KEY}`
      }
    }
  );
  
  return response.data;
}
```

**Step 3: Initialize Service Provider**

```typescript
// main.ts
import { loadSystemPrompt } from './config';
import { loadNotificationCode } from './eden-client';
import { createExpressApp } from './api';
import { initializeNotificationHandlers } from './notification-handler';

async function main() {
  const serviceType = process.env.SERVICE_TYPE || 'movie';
  const gardenEndpoint = process.env.GARDEN_ENDPOINT || 'https://garden-alpha.eden.io';
  
  // Load LLM-generated configuration
  console.log('📋 Loading system prompt...');
  const systemPrompt = await loadSystemPrompt(serviceType);
  
  console.log('📋 Loading notification code...');
  const notificationCode = await loadNotificationCode(serviceType, 'typescript', 'express');
  
  // Initialize Express app
  const app = createExpressApp(systemPrompt);
  
  // Initialize notification handlers (webhook, pull, RPC)
  initializeNotificationHandlers(app, notificationCode, gardenEndpoint);
  
  // Start server
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`✅ Service Provider (${serviceType}) running on port ${port}`);
    console.log(`📡 Connected to Eden Garden: ${gardenEndpoint}`);
  });
}

main().catch(console.error);
```

### 13.4 Sample Movie Service Provider

**Example: `service-provider-movie`**

**Directory Structure:**
```
service-provider-movie/
├── src/
│   ├── main.ts
│   ├── config.ts
│   ├── api.ts
│   ├── eden-client.ts
│   ├── notification-handler.ts
│   └── movie-service.ts
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

**main.ts:**
```typescript
#!/usr/bin/env node

import express from 'express';
import { loadSystemPrompt } from './config';
import { EdenClient } from './eden-client';
import { RedisClient } from './redis-client';
import { MovieService } from './movie-service';
import { NotificationHandler } from './notification-handler';

const app = express();
app.use(express.json());

const SERVICE_TYPE = 'movie';
const GARDEN_ENDPOINT = process.env.GARDEN_ENDPOINT || 'https://garden-alpha.eden.io';
const PROVIDER_ID = process.env.PROVIDER_ID || 'movie-provider-001';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function main() {
  // Initialize Redis client
  const redis = new RedisClient(REDIS_URL);
  console.log('✅ Connected to Redis:', REDIS_URL);
  
  // Load LLM-generated system prompt
  const systemPrompt = await loadSystemPrompt(SERVICE_TYPE);
  console.log('✅ Loaded system prompt:', systemPrompt.version);
  
  // Initialize Eden client
  const edenClient = new EdenClient(GARDEN_ENDPOINT, PROVIDER_ID);
  
  // Initialize movie service with system prompt and Redis
  const movieService = new MovieService(systemPrompt, redis);
  
  // Initialize movies in Redis (if not already initialized)
  await movieService.initializeMovies();
  
  // Initialize notification handlers
  const notificationHandler = new NotificationHandler(
    edenClient,
    movieService
  );
  
  // Register webhook endpoint
  app.post('/eden/webhook/tx-finalized', async (req, res) => {
    await notificationHandler.handleWebhook(req.body);
    res.status(200).json({ success: true });
  });
  
  // Register RPC endpoints
  app.get('/rpc/getTransactionByPayer', async (req, res) => {
    const result = await notificationHandler.handleRPC('getTransactionByPayer', req.query);
    res.json(result);
  });
  
  // Health check endpoint
  app.get('/health', async (req, res) => {
    const redisStatus = await redis.redis.ping();
    res.json({
      status: 'healthy',
      redis: redisStatus === 'PONG' ? 'connected' : 'disconnected',
      serviceType: SERVICE_TYPE,
      providerId: PROVIDER_ID
    });
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down gracefully...');
    await redis.disconnect();
    process.exit(0);
  });
  
  // Start server
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`🎬 Movie Service Provider running on port ${port}`);
    console.log(`📡 Garden: ${GARDEN_ENDPOINT}`);
    console.log(`💾 Redis: ${REDIS_URL}`);
  });
}

main().catch(console.error);
```

**movie-service.ts:**
```typescript
import { SystemPromptConfig } from './config';
import { RedisClient } from './redis-client';

export class MovieService {
  private systemPrompt: SystemPromptConfig;
  private redis: RedisClient;
  
  constructor(systemPrompt: SystemPromptConfig, redis: RedisClient) {
    this.systemPrompt = systemPrompt;
    this.redis = redis;
  }
  
  // Use system prompt for query extraction
  async processQuery(userQuery: string): Promise<any[]> {
    // System prompt contains query extraction logic
    // Extract movie title, location, showtime from user query
    const extracted = this.extractQueryFields(userQuery);
    
    // Query movies from Redis based on extracted fields
    return await this.queryMovies(extracted);
  }
  
  private extractQueryFields(query: string): any {
    // Use systemPrompt.queryExtractionPrompt logic
    // This is generated by LLM, not hardcoded
    // ...
  }
  
  private async queryMovies(filters: any): Promise<any[]> {
    // Query movies from Redis based on filters
    const results: any[] = [];
    
    // Use Redis indexes for efficient querying
    if (filters.location) {
      const movieIds = await this.redis.redis.smembers(`movies:index:${filters.location}`);
      for (const movieId of movieIds) {
        const movie = await this.redis.get(this.redis.movieKey(movieId));
        if (movie && this.matchesFilters(movie, filters)) {
          results.push(movie);
        }
      }
    } else {
      // Query all movies (use SCAN for large datasets)
      const keys = await this.redis.redis.keys('movie:*');
      for (const key of keys) {
        const movie = await this.redis.get(key);
        if (movie && this.matchesFilters(movie, filters)) {
          results.push(movie);
        }
      }
    }
    
    // Return results matching systemPrompt.ledgerFields
    return results.map(movie => this.formatMovieResponse(movie));
  }
  
  private matchesFilters(movie: any, filters: any): boolean {
    // Match movie against filters
    if (filters.title && !movie.title.toLowerCase().includes(filters.title.toLowerCase())) {
      return false;
    }
    if (filters.showtime && movie.showtime !== filters.showtime) {
      return false;
    }
    return true;
  }
  
  private formatMovieResponse(movie: any): any {
    // Format movie response based on systemPrompt.ledgerFields
    const fields = this.systemPrompt.ledgerFields;
    const response: any = {};
    
    for (const field of fields) {
      if (movie[field] !== undefined) {
        response[field] = movie[field];
      }
    }
    
    return response;
  }
  
  // Store booking in Redis
  async createBooking(txId: string, bookingDetails: any): Promise<void> {
    // Store booking details
    await this.redis.set(this.redis.bookingKey(txId), bookingDetails);
    
    // Add to bookings list
    await this.redis.lpush('bookings:list', txId);
    
    // Add to event stream
    await this.redis.xadd('events:stream', {
      type: 'booking_created',
      txId,
      timestamp: Date.now(),
      ...bookingDetails
    });
  }
  
  // Update booking status
  async updateBooking(txId: string, status: string, details?: any): Promise<void> {
    const booking = await this.redis.get(this.redis.bookingKey(txId));
    if (booking) {
      booking.status = status;
      if (details) {
        Object.assign(booking, details);
      }
      await this.redis.set(this.redis.bookingKey(txId), booking);
      
      // Add to event stream
      await this.redis.xadd('events:stream', {
        type: 'booking_updated',
        txId,
        status,
        timestamp: Date.now(),
        ...details
      });
    }
  }
  
  // Get booking by transaction ID
  async getBooking(txId: string): Promise<any | null> {
    return await this.redis.get(this.redis.bookingKey(txId));
  }
  
  // Initialize movies in Redis (on startup)
  async initializeMovies(): Promise<void> {
    // Check if movies already exist
    const existing = await this.redis.redis.exists('movie:initialized');
    if (existing) {
      console.log('✅ Movies already initialized in Redis');
      return;
    }
    
    // Initialize sample movies
    const sampleMovies = [
      {
        id: 'movie-001',
        title: 'Back to the Future',
        showtime: '9:45 PM',
        location: 'Baltimore, Maryland',
        price: 1.50,
        reviewCount: 1250,
        rating: 4.8
      },
      // ... more movies
    ];
    
    for (const movie of sampleMovies) {
      // Store movie
      await this.redis.set(this.redis.movieKey(movie.id), movie);
      
      // Add to location index
      await this.redis.redis.sadd(`movies:index:${movie.location}`, movie.id);
      
      // Add to showtime index
      await this.redis.redis.sadd(`movies:index:${movie.showtime}`, movie.id);
    }
    
    // Mark as initialized
    await this.redis.set('movie:initialized', true);
    console.log(`✅ Initialized ${sampleMovies.length} movies in Redis`);
  }
}
```

**Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/main.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  movie-provider:
    build: .
    environment:
      - SERVICE_TYPE=movie
      - GARDEN_ENDPOINT=https://garden-alpha.eden.io
      - PROVIDER_ID=movie-provider-001
      - EDEN_API_KEY=${EDEN_API_KEY}
      - REDIS_URL=redis://redis:6379
      - PORT=3001
    ports:
      - "3001:3001"
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

volumes:
  redis-data:
```

### 13.5 Sample Token Service Provider

**Example: `service-provider-token`**

**Directory Structure:**
```
service-provider-token/
├── src/
│   ├── main.ts
│   ├── config.ts
│   ├── api.ts
│   ├── eden-client.ts
│   ├── notification-handler.ts
│   └── token-pool-service.ts
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

**token-pool-service.ts:**
```typescript
import { SystemPromptConfig } from './config';
import { RedisClient } from './redis-client';

export class TokenPoolService {
  private systemPrompt: SystemPromptConfig;
  private redis: RedisClient;
  
  constructor(systemPrompt: SystemPromptConfig, redis: RedisClient) {
    this.systemPrompt = systemPrompt;
    this.redis = redis;
  }
  
  // Use system prompt for DEX query extraction
  async processDEXQuery(userQuery: string): Promise<any[]> {
    // System prompt contains DEX query extraction logic
    // Extract tokenSymbol, baseToken, price from user query
    const extracted = this.extractDEXFields(userQuery);
    
    // Query pools from Redis based on extracted fields
    return await this.queryPools(extracted);
  }
  
  private extractDEXFields(query: string): any {
    // Use systemPrompt.queryExtractionPrompt logic
    // Generated by LLM for DEX services
    // ...
  }
  
  private async queryPools(filters: any): Promise<any[]> {
    // Query token pools from Redis based on filters
    const results: any[] = [];
    
    // Use Redis indexes for efficient querying
    if (filters.tokenSymbol) {
      const poolIds = await this.redis.redis.smembers(`pools:index:${filters.tokenSymbol}`);
      for (const poolId of poolIds) {
        const pool = await this.redis.get(`pool:${poolId}`);
        if (pool && this.matchesFilters(pool, filters)) {
          results.push(pool);
        }
      }
    } else if (filters.baseToken) {
      const poolIds = await this.redis.redis.smembers(`pools:index:${filters.baseToken}`);
      for (const poolId of poolIds) {
        const pool = await this.redis.get(`pool:${poolId}`);
        if (pool && this.matchesFilters(pool, filters)) {
          results.push(pool);
        }
      }
    } else {
      // Query all pools
      const keys = await this.redis.redis.keys('pool:*');
      for (const key of keys) {
        const pool = await this.redis.get(key);
        if (pool && this.matchesFilters(pool, filters)) {
          results.push(pool);
        }
      }
    }
    
    // Return results matching systemPrompt.ledgerFields
    // (tokenSymbol, baseToken, price, liquidity, poolId)
    return results.map(pool => this.formatPoolResponse(pool));
  }
  
  private matchesFilters(pool: any, filters: any): boolean {
    // Match pool against filters
    if (filters.tokenSymbol && pool.tokenSymbol !== filters.tokenSymbol) {
      return false;
    }
    if (filters.baseToken && pool.baseToken !== filters.baseToken) {
      return false;
    }
    if (filters.minPrice && pool.price < filters.minPrice) {
      return false;
    }
    return true;
  }
  
  private formatPoolResponse(pool: any): any {
    // Format pool response based on systemPrompt.ledgerFields
    const fields = this.systemPrompt.ledgerFields;
    const response: any = {};
    
    for (const field of fields) {
      if (pool[field] !== undefined) {
        response[field] = pool[field];
      }
    }
    
    return response;
  }
  
  // Store trade in Redis
  async createTrade(txId: string, tradeDetails: any): Promise<void> {
    // Store trade details
    await this.redis.set(`trade:${txId}`, tradeDetails);
    
    // Add to trades list
    await this.redis.lpush('trades:list', txId);
    
    // Update pool liquidity
    await this.updatePoolLiquidity(tradeDetails.poolId, tradeDetails.amount);
    
    // Add to event stream
    await this.redis.xadd('events:stream', {
      type: 'trade_created',
      txId,
      timestamp: Date.now(),
      ...tradeDetails
    });
  }
  
  private async updatePoolLiquidity(poolId: string, amount: number): Promise<void> {
    const pool = await this.redis.get(`pool:${poolId}`);
    if (pool) {
      pool.liquidity += amount;
      await this.redis.set(`pool:${poolId}`, pool);
    }
  }
  
  // Initialize pools in Redis (on startup)
  async initializePools(): Promise<void> {
    // Check if pools already exist
    const existing = await this.redis.redis.exists('pool:initialized');
    if (existing) {
      console.log('✅ Pools already initialized in Redis');
      return;
    }
    
    // Initialize sample pools
    const samplePools = [
      {
        poolId: 'pool-001',
        tokenSymbol: 'TOKENA',
        baseToken: 'SOL',
        price: 1.0,
        liquidity: 1000
      },
      {
        poolId: 'pool-002',
        tokenSymbol: 'TOKENB',
        baseToken: 'SOL',
        price: 1.0,
        liquidity: 1000
      },
      // ... more pools
    ];
    
    for (const pool of samplePools) {
      // Store pool
      await this.redis.set(`pool:${pool.poolId}`, pool);
      
      // Add to token index
      await this.redis.redis.sadd(`pools:index:${pool.tokenSymbol}`, pool.poolId);
      
      // Add to base token index
      await this.redis.redis.sadd(`pools:index:${pool.baseToken}`, pool.poolId);
    }
    
    // Mark as initialized
    await this.redis.set('pool:initialized', true);
    console.log(`✅ Initialized ${samplePools.length} pools in Redis`);
  }
}
```

### 13.6 Notification Handler Implementation

**notification-handler.ts:**
```typescript
import { EdenClient } from './eden-client';
import { MovieService } from './movie-service';

export class NotificationHandler {
  private edenClient: EdenClient;
  private movieService: MovieService;
  
  constructor(edenClient: EdenClient, movieService: MovieService) {
    this.edenClient = edenClient;
    this.movieService = movieService;
  }
  
  // Webhook handler (generated by LLM)
  async handleWebhook(payload: any): Promise<void> {
    // Code generated by Notification Code Generator Service
    // Handles transaction finalization webhook from Eden
    const { txId, status, bookingDetails } = payload;
    
    if (status === 'completed') {
      // Update internal state based on transaction
      await this.movieService.updateBooking(txId, bookingDetails);
      
      // Acknowledge receipt
      await this.edenClient.acknowledgeWebhook(txId);
    }
  }
  
  // Pull handler (generated by LLM)
  async handlePull(payerEmail: string): Promise<any> {
    // Code generated by Notification Code Generator Service
    // Polls Eden garden for transaction status
    return await this.edenClient.getTransactionByPayer(payerEmail);
  }
  
  // RPC handler (generated by LLM)
  async handleRPC(method: string, params: any): Promise<any> {
    // Code generated by Notification Code Generator Service
    // Handles RPC queries from Eden garden
    switch (method) {
      case 'getTransactionByPayer':
        return await this.edenClient.getTransactionByPayer(params.payer);
      case 'getTransactionBySnapshot':
        return await this.edenClient.getTransactionBySnapshot(params.snapshot_id);
      case 'getLatestSnapshot':
        return await this.edenClient.getLatestSnapshot(params.provider_id);
      default:
        throw new Error(`Unknown RPC method: ${method}`);
    }
  }
}
```

### 13.7 Eden Client Integration

**eden-client.ts:**
```typescript
import axios from 'axios';

export class EdenClient {
  private gardenEndpoint: string;
  private providerId: string;
  
  constructor(gardenEndpoint: string, providerId: string) {
    this.gardenEndpoint = gardenEndpoint;
    this.providerId = providerId;
  }
  
  // Register webhook URL with Eden garden
  async registerWebhook(webhookUrl: string): Promise<void> {
    await axios.post(
      `${this.gardenEndpoint}/rpc/webhook/register`,
      {
        providerId: this.providerId,
        webhookUrl
      }
    );
  }
  
  // Get transaction by payer email
  async getTransactionByPayer(payerEmail: string): Promise<any> {
    const response = await axios.get(
      `${this.gardenEndpoint}/rpc/getTransactionByPayer`,
      { params: { payer: payerEmail } }
    );
    return response.data;
  }
  
  // Get transaction by snapshot ID
  async getTransactionBySnapshot(snapshotId: string): Promise<any> {
    const response = await axios.get(
      `${this.gardenEndpoint}/rpc/getTransactionBySnapshot`,
      { params: { snapshot_id: snapshotId } }
    );
    return response.data;
  }
  
  // Get latest snapshot for provider
  async getLatestSnapshot(): Promise<any> {
    const response = await axios.get(
      `${this.gardenEndpoint}/rpc/getLatestSnapshot`,
      { params: { provider_id: this.providerId } }
    );
    return response.data;
  }
  
  // Acknowledge webhook receipt
  async acknowledgeWebhook(txId: string): Promise<void> {
    await axios.post(
      `${this.gardenEndpoint}/rpc/webhook/acknowledge`,
      { txId, providerId: this.providerId }
    );
  }
}
```

### 13.8 Deployment Options

**Option 1: Standalone Docker Container**

```bash
# Build and run movie service provider
cd service-provider-movie
docker build -t movie-provider .
docker run -d \
  -e SERVICE_TYPE=movie \
  -e GARDEN_ENDPOINT=https://garden-alpha.eden.io \
  -e PROVIDER_ID=movie-provider-001 \
  -e EDEN_API_KEY=your_api_key \
  -p 3001:3001 \
  movie-provider
```

**Option 2: Docker Compose**

```bash
# Start all service providers
docker-compose up -d
```

**Option 3: Kubernetes**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: movie-provider
spec:
  replicas: 3
  selector:
    matchLabels:
      app: movie-provider
  template:
    metadata:
      labels:
        app: movie-provider
    spec:
      containers:
      - name: movie-provider
        image: movie-provider:latest
        env:
        - name: SERVICE_TYPE
          value: "movie"
        - name: GARDEN_ENDPOINT
          value: "https://garden-alpha.eden.io"
        - name: PROVIDER_ID
          value: "movie-provider-001"
        ports:
        - containerPort: 3001
```

**Option 4: Direct Node.js Execution**

```bash
# Run directly with Node.js
cd service-provider-movie
npm install
npm run build
SERVICE_TYPE=movie \
GARDEN_ENDPOINT=https://garden-alpha.eden.io \
PROVIDER_ID=movie-provider-001 \
EDEN_API_KEY=your_api_key \
node dist/main.js
```

### 13.9 Codebase Organization

**Recommended Structure:**
```
eden_ecosystem_typescript/
├── server/                      # Eden ROOT CA server
│   └── eden-sim-redis.ts
├── frontend/                    # Angular UI
│   └── src/
├── service-providers/           # Sample service providers
│   ├── movie/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── docker-compose.yml
│   │   └── README.md
│   ├── token/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   ├── docker-compose.yml
│   │   └── README.md
│   ├── ecommerce/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── README.md
│   └── README.md               # Service provider development guide
└── requirements/               # Documentation
    └── eden_sim_whitepaper_v1_20251229.md
```

### 13.10 Benefits

**For Service Providers:**
- ✅ **No Hardcoding**: All configuration from LLM-generated prompts
- ✅ **Redis Persistence**: Reliable, scalable data storage
- ✅ **Standardized**: Consistent structure and patterns
- ✅ **Standalone**: Deploy independently or as part of ecosystem
- ✅ **Production-Ready**: Docker and Kubernetes support

**For Developers:**
- ✅ **Templates**: Ready-to-use sample implementations
- ✅ **Documentation**: Clear examples and patterns
- ✅ **Extensible**: Easy to create new service providers
- ✅ **Testable**: Isolated, testable components

**For System:**
- ✅ **Consistency**: All providers follow same patterns
- ✅ **Maintainability**: Centralized prompt generation
- ✅ **Scalability**: Independent deployment and scaling with Redis
- ✅ **Persistence**: Redis ensures data survives restarts
- ✅ **Flexibility**: Easy to add new service types

### 13.11 Implementation Requirements

**REQ-SAMPLE-001**: Sample Service Provider Structure
- Standardized directory structure
- Main entry point (`main.ts`)
- Configuration loader (`config.ts`)
- Eden client integration (`eden-client.ts`)
- Notification handlers (`notification-handler.ts`)

**REQ-SAMPLE-002**: LLM Configuration Loading
- Fetch system prompt from System Prompt Generator Service
- Fetch notification code from Notification Code Generator Service
- Cache configuration for performance
- Handle configuration updates

**REQ-SAMPLE-003**: Redis Persistence Layer
- Redis client implementation with connection pooling
- Standardized key naming conventions
- Index support for efficient querying
- Event streaming for audit trails
- Graceful shutdown and connection cleanup

**REQ-SAMPLE-004**: Docker Support
- Dockerfile for each service provider
- Docker Compose configuration
- Environment variable configuration
- Health check endpoints

**REQ-SAMPLE-005**: Notification Integration
- Webhook receiver endpoint
- Pull/poll client implementation
- RPC endpoint handlers
- Three-method fallback support

**REQ-SAMPLE-006**: Documentation
- README.md for each service provider
- API documentation
- Deployment instructions
- Configuration examples

**REQ-SAMPLE-007**: Sample Implementations
- Movie service provider sample
- Token service provider sample
- Ecommerce service provider sample (optional)
- Custom service provider template

---

## 15. Eden Service Type Testbed (STT) Specification — v1.0

### Purpose

The **Service Type Testbed (STT)** is a controlled, deterministic integration environment governed by **ROOT CA / Holy Ghost** that validates a new **service type** before it is allowed into the Eden ecosystem.

A service type is considered **non-existent** in Eden until it passes the STT and is certified.

> **Principle:**
> *No service enters the Garden without surviving Genesis.*

### Scope

The STT validates **end-to-end correctness** of a service type across:

* LLM interpretation
* Service routing
* Payment (JesusCoin)
* iGas / iTax accounting
* Notification delivery
* Ledger truth
* Failure handling
* Governance compliance

The STT does **not** certify a specific provider.
It certifies the **service type contract itself**.

### Actors

| Actor                           | Role                                   |
| ------------------------------- | -------------------------------------- |
| **ROOT CA / Holy Ghost**        | Owns, governs, certifies STT           |
| **Service Type Generator**      | Declares service intent & capabilities |
| **System Prompt Generator**     | Produces LLM governance prompts        |
| **Notification Code Generator** | Produces integration adapters          |
| **Garden (Mock)**              | Hosts the service type                 |
| **Provider (Mock)**             | Simulates external service             |
| **User (Mock)**                 | Simulates consumer                     |
| **EdenCore (Mock)**             | Executes ledger, wallet, cashier logic |

All actors are **containerized** and **isolated**.

### Service Type Declaration (Input)

A service type must begin with a formal declaration:

```json
{
  "serviceType": "movie",
  "capabilities": ["price_quote", "reserve", "confirm", "cancel"],
  "notificationModes": ["webhook", "poll", "rpc"],
  "paymentModel": {
    "currency": "JSC",
    "iGas": "dynamic",
    "iTax": "root_governed"
  }
}
```

This declaration is immutable once testing begins.

### Testbed Environment

The STT spins up a **deterministic sandbox** consisting of:

* Mock Garden (same Docker image as production)
* Mock Provider API
* Mock Wallet (Redis-backed)
* Mock Ledger
* Mock Replication Bus
* Mock LLM (real or mocked)
* Notification endpoints

> **Rule:**
> *Production images are reused. Only certificates differ.*

### Test Phases

#### 1. Genesis Phase

* Validate service declaration
* Generate system prompts
* Generate notification adapters
* Initialize wallet + ledger state

#### 2. Happy Path

* User intent → LLM extraction
* Provider discovery
* Payment authorization
* Ledger booking
* Notification delivery
* Service fulfillment

#### 3. Failure Paths (Mandatory)

* Insufficient balance
* Timeout
* Provider rejection
* Notification failure
* Duplicate request
* Replay attack
* Invalid payload

#### 4. Governance Checks

* iGas correctly charged
* iTax distributed correctly
* ROOT CA visibility maintained
* No hidden state mutation
* Ledger truth preserved

### Evidence & Artifacts (Output)

Each STT run produces immutable artifacts:

* Execution logs
* Ledger snapshots
* Wallet diffs
* Notification traces
* LLM decision outputs
* Testbed hash

Artifacts are:

* Timestamped
* Hash-addressed
* Replayable

### Certification Decision

A service type is certified **only if all mandatory tests pass**.

Certification record:

```json
{
  "serviceType": "movie",
  "status": "CERTIFIED",
  "certifiedBy": "eden:root:ca",
  "testbedHash": "0xabc123...",
  "rulesetVersion": "v1.0",
  "validFrom": "2025-12-29"
}
```

Once certified:

* Gardens may host the service type
* Providers may register under it
* Users may consume it

### Invariants (Non-Negotiable Laws)

1. No service execution without ledger entry
2. No ledger entry without wallet truth
3. No wallet mutation without ROOT CA visibility
4. No notification without traceability
5. No certification without replayable evidence

### Design Philosophy

The STT is:

* **Preventive**, not reactive
* **Deterministic**, not heuristic
* **Composable**, not hardcoded
* **Governed**, not trusted

> *Eden does not trust promises.
> Eden certifies behavior.*

### Status

**STT v1.0 — APPROVED**
This specification is sufficient to bootstrap Eden's service evolution without introducing external dependencies, Web3 coupling, or opaque integrations.

---

## 16. Eden‑Sim (Reference Implementation)

- TypeScript
- <1500 LOC
- No Web3 dependencies
- Mock LLM
- Redis‑style replication

Purpose: economic + architectural validation

---

## 17. Why Eden Wins

| Problem | Eden Solution |
|------|-------------|
| Gas fees | Intelligence fees |
| Smart contracts | Dynamic reasoning |
| Rug pulls | Bonded services |
| MEV | Certified transparency |
| Fragmentation | Federated gardens |

---

## 18. Architectural Completeness & Validation

### 18.1 Conceptual Completeness

Eden covers **all first-order primitives** of a sovereign ecosystem:

#### Authority & Trust
- ✅ ROOT CA (GOD) as ultimate authority
- ✅ ENCERT lightweight PKI for identity and capabilities
- ✅ Certification lifecycle (issue / revoke / expire)
- ✅ Reputation + bond + insurance mechanisms
- ✅ Revocation via Redis Streams (real-time, event-driven)

#### Execution Plane
- ✅ Gardens as priests (local authority, delegated execution)
- ✅ EdenCore as truth engine (ledger, cashier, snapshot)
- ✅ HOLY GHOST as ROOT Garden / settlement / oversight
- ✅ Deterministic replay via snapshots
- ✅ Separation: Gardens execute, ROOT CA settles

#### Intelligence Plane
- ✅ LLM-governed routing and service discovery
- ✅ Human chat as RPC interface
- ✅ Service discovery as *reasoned resolution*, not lookup
- ✅ iGas / iTax as intelligence cost (not compute gas)
- ✅ LLM System Prompt Management (Redis-backed, auto-generated)
- ✅ Transaction Notification Code Generation (LLM-powered)
- ✅ **ROOT CA LLM Service Mapper**: Maps user natural language input to services/gardens from the registry, eliminating pre-canned prompts
- ✅ **ROOT CA LLM getData() Converter**: Translates natural language queries into structured getData() function parameters for provider data layers

#### Economy
- ✅ No web3 dependency (pure fiat-backed economy)
- ✅ JesusCoin = 1 USD (closed loop, zero volatility)
- ✅ Stripe rail abstracted behind ROOT Garden
- ✅ Fee redistribution (user + provider + garden + GOD)
- ✅ Anti-rug via certification + bonding
- ✅ Wallet Service as authoritative balance source

#### Federation & Scale
- ✅ Docker-only deployment (single image, different certs = different roles)
- ✅ Redis-first, memory-native architecture
- ✅ Stream-based replication bus
- ✅ External service compatibility (AMC, MovieCom, etc.)
- ✅ Sample service providers with Redis persistence
- ✅ One-click automated deployment for simple gardens

**This is a complete GENESIS layer.**
Eden intentionally replaces blockchain features, not replicates them.

### 18.2 HTTPS / PKI Architecture

**Question:** Can we build HTTPS-like security without Big CA dependency?

**Answer:** Yes — Eden implements **Mutual Identity + Integrity + Replay Protection** via ENCERT.

#### Two Viable Modes

**Mode A — HTTPS with Self-Issued Certs:**
- ROOT CA issues short-lived ENCERT certificates
- Browsers won't trust it → **fine** (not needed for service-to-service)
- Garden-to-Garden traffic works with Eden mTLS
- UI talks to gateway (Holy Ghost) over real HTTPS

**Mode B — HTTP + EdenAuth (Recommended Initially):**
Every request includes:
```json
{
  "eden-cert": "<base64 ENCERT>",
  "eden-signature": "<sig over body + nonce>",
  "eden-nonce": "<uuid>",
  "eden-timestamp": 1766983426608
}
```

ROOT CA / Gardens verify:
- Cert validity (from ENCERT registry)
- Capability authorization
- Signature verification
- Nonce freshness (Redis set)

**This avoids all third-party CA pain while maintaining security.**

### 18.3 ROOT Garden (HOLY GHOST) — Design Rationale

Making ROOT CA also run a **ROOT GARDEN** solves three hard problems simultaneously:

1. **Settlement Finality**: HOLY GHOST is the canonical accountant
2. **Audit Authority**: Single source of truth for all transactions
3. **Fee Truth Source**: Authoritative balance and fee distribution

**Critical Insight:**
> EdenCore must be accountable to something higher than itself.

HOLY GHOST provides that accountability **without centralizing execution**.

**Think of HOLY GHOST as:**
- Not a miner (doesn't compete for blocks)
- Not a validator (doesn't vote on consensus)
- But a **canonical accountant of meaning**

This is novel and architecturally correct.

### 18.4 Wallet Service Architecture

**Question:** Wallet coupled or decoupled from EdenCore?

**Answer:** **Logically decoupled, operationally co-located (at ROOT Garden).**

**Why:**
- EdenCore = truth of *events* (ledger entries)
- Wallet = truth of *balances* (authoritative state)

They must reconcile, but not collapse into one.

**Redis Wallet Model Benefits:**
- ✅ Deterministic (replayable from ledger)
- ✅ Auditable (complete transaction history)
- ✅ Rebuildable (can reconstruct from ledger)
- ✅ Stripe-friendly (fiat integration)

**This architecture is correct for Genesis v1.**

### 18.5 The Snake (Advertiser) — Design Rationale

Eden avoids the biggest trap: **letting ads dominate truth**.

**Key Design Decisions:**
- ✅ Higher iGas / iTax (2x multiplier)
- ✅ Higher insurance requirement (minimum 10,000 JSC)
- ✅ Explicit `serviceType = "snake"` (transparent)
- ✅ LLM-mediated insertion (not forced display)
- ✅ Contextual probability mass (not inventory)

**Refinement:**
> Treat Snake as **contextual probability mass**, not inventory.

**Meaning:**
- Snake responses compete in the same LLM resolution space
- But are penalized unless *relevant*
- ROOT CA can dynamically tune Snake weight
- Always labeled and optional

**This keeps Eden "holy" without being naive.**

### 18.6 Federation & Docker Reality Check

**Current Approach (v1):**
- ROOT CA Redis = authoritative
- Garden Redis = hot cache + local streams
- Periodic reconciliation (not synchronous blocking)

**This is sound for Genesis v1.**

**Future Considerations (Phase 2):**
- ROOT CA Redis = authoritative truth
- Garden Redis = hot cache + local streams
- Asynchronous reconciliation (not blocking)
- Eventual consistency model

**Not missing — just phase-2 optimization.**

### 18.7 What Eden Is NOT

**Eden is NOT:**
- ❌ Vaporware (fully executable, reference implementation exists)
- ❌ A blockchain clone (intentionally replaces blockchain)
- ❌ An LLM gimmick (LLM is infrastructure, not marketing)

**Eden IS:**
- ✅ A post-blockchain execution model
- ✅ An intelligence-priced economy
- ✅ A trust system that scales down instead of up
- ✅ A system that decentralizes judgment, not machines

### 18.8 Genesis Completion Status

**Genesis Chapter 1 is complete.**

All fundamental primitives are in place:
- Authority & Trust ✅
- Execution Plane ✅
- Intelligence Plane ✅
- Economy ✅
- Federation & Scale ✅

**At this point, DEV can take it.**

The system is:
- Internally consistent
- Novel (not a copy)
- Executable (reference implementation exists)
- Survivable (designed for real-world deployment)

**What remains:**
- Clarifications (documentation)
- Guardrails (operational policies)
- Last-mile abstractions (production hardening)

**But the core architecture is sound.**

---

## 19. Genesis Statement

> *Eden is not a protocol.*  
> *It is a living system.*

ROOT CA gives law.  
Gardens give wisdom.  
Humans give meaning.

**The Garden grows.**

---

## 20. ENCERT v1

### Redis Stream Schema — Revocation Events

**Status:** Draft v1  
**Applies to:** ROOT CA, Gardens, Service Providers  
**Transport:** Redis Streams  
**Philosophy:** Event-driven trust, append-only authority

---

### 18.1 Purpose

This document defines the **Redis Streams schema** used by ENCERT v1 to propagate **revocation events** across the Eden ecosystem.

Revocation is:

* **Event-based**
* **Append-only**
* **Cryptographically signed**
* **Replayable and auditable**

No CRLs, OCSP, or polling mechanisms are used.

---

### 18.2 Stream Naming

#### Primary Stream

```text
eden:encert:revocations
```

#### Optional Sharding (Future)

```text
eden:encert:revocations:{region}
eden:encert:revocations:{garden_id}
```

ENCERT v1 **SHOULD** begin with a single global stream.

---

### 18.3 Certificate Schema

Each ENCERT certificate represents **one authority grant** from issuer to subject.

#### Certificate Structure

| Field         | Type            | Required | Description                                    |
| ------------- | --------------- | -------- | ---------------------------------------------- |
| `subject`     | EdenUUID        | ✅        | Identity being certified                       |
| `issuer`      | EdenUUID        | ✅        | Entity issuing certificate (ROOT CA or Garden) |
| `capabilities` | Capability[]    | ✅        | Array of granted capabilities                  |
| `constraints` | Record<string>  | ❌        | Additional constraints (network binding, etc.) |
| `issuedAt`    | Timestamp       | ✅        | Unix timestamp (ms)                            |
| `expiresAt`   | Timestamp       | ✅        | Expiration timestamp (ms)                      |
| `signature`   | string          | ✅        | Base64 Ed25519 signature                       |

#### Garden Certificate Constraints

Garden certificates **MUST** include network binding information in the `constraints` field:

| Constraint Field | Type   | Required | Description                                    |
| ---------------- | ------ | -------- | ---------------------------------------------- |
| `gardenId`      | string | ✅        | Unique garden identifier (e.g., "A", "B", "HG") |
| `gardenName`    | string | ✅        | Human-readable garden name                    |
| `stream`         | string | ✅        | Redis stream identifier                        |
| `serverIp`       | string | ✅        | Server IP address (IPv4 or IPv6)               |
| `serverDomain`   | string | ❌        | Server domain name (if applicable)             |
| `serverPort`     | number | ✅        | Server port number                             |
| `networkType`    | string | ✅        | Network protocol type: `"http"` or `"https"`   |

**Network Binding Purpose:**
- **Server IP**: Identifies the physical or virtual network location of the garden
- **Server Domain**: Optional human-readable domain name (e.g., "garden-alpha.eden.io")
- **Server Port**: Network port where the garden accepts connections
- **Network Type**: Protocol type (`http` or `https`) determines encryption and security requirements

**Security Implications:**
- Network binding constraints enable certificate validation against actual network endpoints
- Prevents certificate reuse across different network locations
- Enables network-level access control and routing decisions
- Supports revocation based on network location changes

#### Sample Garden Certificate

```json
{
  "subject": "eden:garden:c48b64e0-03a5-49e6-a078-822edbd42efb",
  "issuer": "eden:root:ca:00000000-0000-0000-0000-000000000001",
  "capabilities": [
    "GARDEN",
    "ISSUE_CERT"
  ],
  "constraints": {
    "gardenId": "A",
    "gardenName": "Garden-A",
    "stream": "eden:garden:A",
    "serverIp": "192.168.1.100",
    "serverDomain": "garden-alpha.eden.io",
    "serverPort": 8080,
    "networkType": "https"
  },
  "issuedAt": 1735515100000,
  "expiresAt": 1767051100000,
  "signature": "BASE64_ED25519_SIGNATURE_HERE"
}
```

**Network Type Values:**
- `"http"`: Unencrypted HTTP protocol (typically port 80 or custom ports)
- `"https"`: Encrypted HTTPS protocol with TLS/SSL (typically port 443 or custom ports)

**Security Implications:**
- `https` certificates **MUST** be used for production deployments
- `http` certificates **MAY** be used for development/testing environments
- Network type determines certificate validation requirements (TLS certificate chain for HTTPS)

**Certificate Validation:**
1. Verify signature using issuer's public key
2. Check expiration (`expiresAt > now`)
3. Validate network binding matches actual server endpoint:
   - `constraints.serverIp` matches connecting IP
   - `constraints.serverPort` matches connecting port
   - `constraints.networkType` matches protocol (`http` or `https`)
   - If `constraints.serverDomain` present, DNS resolves to `constraints.serverIp`
4. Verify capabilities match requested operations
5. Check revocation registry for revoked certificates
6. For `https` network type, validate TLS certificate chain (if applicable)

---

### 18.4 Revocation Event Schema

Each Redis Stream entry represents **one immutable revocation fact**.

#### Required Fields

| Field          | Type   | Required | Description                        |
| -------------- | ------ | -------- | ---------------------------------- |
| `revoked_uuid` | string | ✅        | Identity being revoked             |
| `revoked_type` | string | ✅        | `garden` | `service` | `provider` |
| `issuer_uuid`  | string | ✅        | Entity issuing revocation          |
| `reason`       | string | ✅        | Human-readable explanation         |
| `issued_at`    | int64  | ✅        | Unix timestamp (ms)                |
| `effective_at` | int64  | ✅        | When revocation becomes active     |
| `signature`    | string | ✅        | Base64 Ed25519 signature           |

#### Optional Fields

| Field       | Type   | Description                 |
| ----------- | ------ | --------------------------- |
| `cert_hash` | string | Hash of revoked certificate |
| `severity`  | string | `soft` | `hard`             |
| `metadata`  | json   | Additional context          |

---

### 18.5 Canonical Redis Entry Example

```bash
XADD eden:encert:revocations * \
  revoked_uuid "eden:service:moviecom" \
  revoked_type "service" \
  issuer_uuid "eden:garden:abc123" \
  reason "fraudulent pricing" \
  issued_at 1735071200123 \
  effective_at 1735071200123 \
  signature "BASE64_ED25519_SIGNATURE" \
  cert_hash "sha256:9f1a..." \
  severity "hard"
```

---

### 18.6 Signature Rules

#### Certificate Signed Payload

The issuer **MUST sign** the canonical JSON payload (excluding signature):

```json
{
  "subject": "eden:garden:c48b64e0-03a5-49e6-a078-822edbd42efb",
  "issuer": "eden:root:ca:00000000-0000-0000-0000-000000000001",
  "capabilities": ["GARDEN", "ISSUE_CERT"],
  "constraints": {
    "gardenId": "A",
    "gardenName": "Garden-A",
    "stream": "eden:garden:A",
    "serverIp": "192.168.1.100",
    "serverDomain": "garden-alpha.eden.io",
    "serverPort": 8080,
    "networkType": "https"
  },
  "issuedAt": 1735515100000,
  "expiresAt": 1767051100000
}
```

#### Revocation Signed Payload

The issuer **MUST sign** the canonical JSON payload:

```json
{
  "revoked_uuid": "eden:service:moviecom",
  "revoked_type": "service",
  "issuer_uuid": "eden:garden:abc123",
  "reason": "fraudulent pricing",
  "issued_at": 1735071200123,
  "effective_at": 1735071200123,
  "cert_hash": "sha256:9f1a...",
  "severity": "hard"
}
```

#### Cryptography

* Algorithm: **Ed25519**
* Encoding: **Base64**
* Verifier: issuer public key from ENCERT

---

### 18.7 Authority Rules

| Revoker | Allowed Targets       |
| ------- | --------------------- |
| ROOT CA | Gardens, Services    |
| Garden | Services it certified |
| Service | ❌ Not allowed         |

Gardens **MUST reject** revocations if:

* Signature verification fails
* Issuer lacks authority
* Issuer certificate is revoked

#### Network Binding Validation

When validating garden certificates:

1. **Network Endpoint Verification**: Certificate `constraints.serverIp` and `constraints.serverPort` **MUST** match the actual network endpoint of the garden
2. **Domain Resolution**: If `constraints.serverDomain` is present, DNS resolution **MUST** match `constraints.serverIp`
3. **Port Binding**: Certificate port **MUST** match the port where the garden accepts connections
4. **Network Change Detection**: If network binding changes, certificate becomes invalid and **MUST** be reissued

**Example Validation Flow:**
```
1. Garden connects from IP: 192.168.1.100, Port: 8080, Protocol: https
2. Certificate lookup: Find certificate for garden UUID
3. Validate constraints:
   - certificate.constraints.serverIp === "192.168.1.100" ✅
   - certificate.constraints.serverPort === 8080 ✅
   - certificate.constraints.networkType === "https" ✅
   - certificate.constraints.serverDomain resolves to "192.168.1.100" ✅
4. Validate TLS certificate chain (for https)
5. Certificate valid for this network endpoint
```

---

### 18.8 Consumption Model

Each garden **MUST**:

1. Create a consumer group
2. Track last processed stream ID
3. Apply revocations idempotently

#### Example

```bash
XGROUP CREATE eden:encert:revocations garden-A $ MKSTREAM
```

Processing steps:

1. Read stream entry
2. Verify signature
3. Verify issuer authority
4. Mark identity revoked locally
5. Persist for audit

---

### 18.9 Replay & Audit

* Redis Streams are append-only
* Gardens can rebuild trust state from genesis
* Auditors can inspect revocation lineage
* Network binding history preserved in certificate constraints

This enables **inescapable historical truth**.

---

### 18.10 Retention Policy

* Revocation events **SHOULD NOT be deleted**
* Certificates may expire
* Revocations do not expire
* Network binding constraints preserved for audit trail

Optional: archive to cold storage after N days.

---

### 18.11 Failure Semantics

| Scenario          | Behavior                            |
| ----------------- | ----------------------------------- |
| Garden offline   | Applies revocation on reconnect     |
| Redis restart     | Stream recovered from AOF/RDB       |
| Network partition | Eventual consistency with authority |
| Network binding change | Certificate invalidated, reissue required |

**Network Binding Change Handling:**
- If garden's IP/domain/port/networkType changes, existing certificate becomes invalid
- Garden **MUST** request new certificate from ROOT CA with updated network binding
- Old certificate **SHOULD** be revoked to prevent confusion
- Network binding changes **MUST** be logged for audit purposes
- Protocol changes (http ↔ https) require certificate reissuance

---

### 18.12 Design Rationale

This design:

* Eliminates CRLs and OCSP
* Aligns with Eden's garden-first architecture
* Scales horizontally
* Is human-explainable
* Is machine-enforceable
* Binds certificates to network endpoints for security

**Network Binding Rationale:**
* Prevents certificate theft and reuse across different servers
* Enables network-level access control and routing
* Provides audit trail of garden network locations
* Supports dynamic network reconfiguration with certificate reissuance

> **Trust is not queried.  
> Trust is remembered.  
> Trust is bound to network.**

---

### 18.13 Summary

ENCERT via Redis Streams provides:

* Deterministic authority
* Federated enforcement
* Immutable audit trails
* Low operational complexity
* Network-bound certificates

**Key Features:**
* Certificates include network binding (IP/domain/port) in constraints
* Network binding enables endpoint validation and access control
* Certificate reissuance required when network binding changes
* Complete audit trail of network locations

It is **PKI built for intelligence systems**, not browsers.

---

## 21. Federation Design & Trust Architecture

Eden implements a **lightweight PKI-based trust fabric** that provides HTTPS-equivalent security without relying on third-party Certificate Authorities (CAs). This design enables secure federation between ROOT CA, gardens, and service providers while maintaining sovereignty and avoiding browser trust dependencies.

### 21.1 Trust Layer Separation

Eden separates **three distinct HTTPS trust problems**:

| Layer                | Problem         | Needs Public CA? | Eden Solution        |
| -------------------- | --------------- | ---------------- | -------------------- |
| Browser → Website    | Public trust    | ✅ Yes            | Optional edge HTTPS  |
| Service → Service    | Mutual trust    | ❌ No             | Eden mTLS            |
| Control Plane → Node | Authority trust | ❌ No             | Eden PKI             |

**Eden operates in layers 2 & 3**, not the browser trust web.

**Key Principle:**
- Browsers don't need to trust Eden
- Gardens and services trust Eden
- Eden PKI provides mutual trust without third-party dependencies

### 21.2 Eden Trust Model

Eden's trust architecture follows a **Kubernetes-style model**, not browser PKI:

**Trust Hierarchy:**
- **ROOT CA (GOD)** → Ultimate trust anchor
- **Gardens (Priests)** → Delegated authorities
- **Service Providers (Trees/Apples/Snake)** → Certified actors
- **Users** → Identity via Google (orthogonal to PKI)

**Trust Boundaries:**
- ROOT CA ↔ Garden: Eden mTLS
- Garden ↔ Garden: Eden mTLS
- Garden ↔ Service Provider: Eden mTLS or signed payloads
- Browser ↔ Eden UI: Public HTTPS (optional, edge-only)

### 21.3 ROOT CA HTTPS Without Public CA

**Solution: Private PKI + mTLS (Mutual TLS)**

Eden issues **ENCERT certificates**, not X.509 certificates from public CAs.

#### Architecture

**1. Certificate Generation:**
- ROOT CA generates:
  - `eden-root-ca.pem` (public certificate)
  - `eden-root-ca.key` (private key)

**2. Garden Provisioning:**
- Garden container receives:
  - Eden Root CA public certificate (for verification)
  - Garden's own Eden-issued certificate (for identity)
  - Garden's private key

**3. Traffic Security:**
- All traffic uses:
  - Standard TLS protocol
  - Mutual certificate verification (mTLS)
  - Eden-issued certificates

**4. No Public CA Required:**
- Certificates issued by Eden ROOT CA
- Clients explicitly trust Eden ROOT CA
- Browsers are not involved in trust chain

#### Benefits

- ✅ **Full HTTPS-grade security**: Encryption, identity, revocation, rotation
- ✅ **Zero third-party trust**: No dependency on DigiCert, Let's Encrypt, etc.
- ✅ **Sovereign authority**: Eden controls all certificate issuance
- ✅ **Standard TLS**: Uses proven TLS protocol, not custom crypto

**This is how Kubernetes, etcd, Consul, Vault work.**

### 21.4 Garden HTTP with TLS Termination

**Problem:** What if gardens run HTTP only (for simplicity)?

**Solution: TLS Termination at the Eden Edge**

Gardens can remain **pure HTTP** while maintaining network security through a gateway pattern.

#### Architecture

```
[ ROOT CA (HTTPS/mTLS) ]
           |
           v
[ Eden Secure Gateway ]  <-- TLS with Eden certs
           |
           v
[ Garden HTTP :8080 ]   <-- Plain HTTP (trusted boundary)
```

#### Key Components

**Eden Secure Gateway:**
- Verifies Eden certificates
- Verifies garden identity
- Terminates TLS connections
- Forwards traffic internally to garden HTTP endpoint
- Handles certificate validation and revocation checks

**Garden:**
- Runs pure HTTP (no TLS complexity)
- Never touches certificates directly
- Focuses on service logic
- Lower hardware and operational burden

#### Benefits

- ✅ **Garden simplicity**: No TLS configuration or certificate management
- ✅ **Network security**: All external traffic encrypted via gateway
- ✅ **Eden-controlled trust**: Gateway enforces Eden PKI policies
- ✅ **Lightweight gardens**: Reduced operational complexity

### 21.5 Garden Authorization & Network Binding

When ROOT CA issues an ENCERT certificate, it includes **network binding constraints**:

```json
{
  "subject": "eden:garden:c48b64e0-03a5-49e6-a078-822edbd42efb",
  "issuer": "eden:root:ca:00000000-0000-0000-0000-000000000001",
  "capabilities": ["GARDEN", "ISSUE_CERT"],
  "constraints": {
    "gardenId": "A",
    "gardenName": "Garden-A",
    "stream": "eden:garden:A",
    "serverIp": "192.168.1.100",
    "serverDomain": "garden-alpha.eden.io",
    "serverPort": 8080,
    "networkType": "https",
    "allowedEndpoints": [
      "https://garden-alpha.eden.io:443"
    ],
    "internalHttp": "http://127.0.0.1:8080"
  },
  "issuedAt": 1735515100000,
  "expiresAt": 1767051100000,
  "signature": "BASE64_ED25519_SIGNATURE_HERE"
}
```

**Network Law:**
- Certificate constraints define **where** the garden lives
- Constraints define **how** traffic should route
- Constraints define **what** the garden is allowed to do
- This becomes **network law**, not configuration

**Validation:**
- Gateway validates certificate network binding matches actual endpoint
- Prevents certificate reuse across different network locations
- Enables network-level access control and routing decisions

### 21.6 HTTPS Traffic Matrix

**Traffic Security by Layer:**

| Traffic                  | Secured by                        | Certificate Type |
| ------------------------ | --------------------------------- | ---------------- |
| ROOT CA ↔ Garden        | Eden mTLS                         | ENCERT           |
| Garden ↔ Garden        | Eden mTLS                         | ENCERT           |
| Garden ↔ Service        | Eden mTLS or signed payload       | ENCERT           |
| Garden ↔ Local services | HTTP (trusted boundary)           | None             |
| Browser ↔ Eden UI        | Public HTTPS (optional edge only) | X.509 (optional) |

**Key Points:**
- **Core traffic**: Secured by Eden mTLS with ENCERT certificates
- **UI edge**: Only edge needs public HTTPS certificate (optional)
- **Internal traffic**: Can use plain HTTP within trusted boundaries
- **Sovereignty**: Core remains sovereign, independent of public CAs

### 21.7 Certificate Revocation Architecture

Eden's revocation system is **stronger than traditional OCSP**:

**Redis Streams Revocation:**
```
eden:encert:revocations (global stream)
eden:garden:*:auth (per-garden streams)
```

**Revocation Flow:**
1. ROOT CA issues revocation event → Redis Stream
2. Gardens subscribe to revocation stream
3. Gardens invalidate certificates immediately
4. No CRL fetch required
5. No OCSP lag
6. Event-driven, real-time revocation

**Advantages over Web PKI:**
- ✅ **Real-time**: Immediate revocation propagation
- ✅ **No polling**: Event-driven, not query-based
- ✅ **Scalable**: Redis Streams handle high throughput
- ✅ **Auditable**: Complete revocation history in streams

### 21.8 Why Eden PKI Is Superior to Public CAs

**Public CAs (DigiCert, Let's Encrypt) provide:**
- Domain name identity
- Basic certificate validation
- Nothing else

**Eden PKI provides:**
- ✅ **Identity**: Certificate-bound identity (UUID-based)
- ✅ **Capabilities**: Explicit permissions (GARDEN, ISSUE_CERT, etc.)
- ✅ **Reputation**: Reputation scores in certificate constraints
- ✅ **Bond**: Economic bond information
- ✅ **Role**: Service provider role and type
- ✅ **Economics**: iGas/iTax multipliers
- ✅ **Governance**: Network binding, authorization rules

**Example:**
A DigiCert certificate cannot say:
> "This garden can settle money but not mint."

An Eden ENCERT certificate **can**:
```json
{
  "capabilities": ["GARDEN", "ISSUE_CERT"],
  "constraints": {
    "canSettle": true,
    "canMint": false,
    "maxSettlementAmount": 10000
  }
}
```

### 21.9 Implementation Architecture

#### Option 1: Eden mTLS over Standard TLS (Recommended)

**Components:**
- **ROOT CA**: Generates root certificate and key
- **Certificate Issuance**: ROOT CA issues ENCERT certificates to gardens
- **TLS Library**: Standard TLS library (OpenSSL, Node.js crypto)
- **Certificate Store**: Redis-backed certificate registry
- **Revocation**: Redis Streams for real-time revocation

**Flow:**
1. ROOT CA generates `eden-root-ca.pem` and `eden-root-ca.key`
2. Garden requests certificate from ROOT CA
3. ROOT CA issues ENCERT certificate with network binding
4. Garden configures TLS with Eden root CA and its certificate
5. All traffic uses mTLS with Eden certificates
6. Revocation events propagate via Redis Streams

#### Option 2: TLS Termination Gateway (For HTTP Gardens)

**Components:**
- **Eden Secure Gateway**: TLS termination and certificate validation
- **Gateway Certificates**: Eden-issued certificates for gateway
- **Garden**: Pure HTTP, no certificate management
- **Internal Routing**: Gateway forwards to garden HTTP endpoint

**Flow:**
1. External client connects to gateway (HTTPS with Eden cert)
2. Gateway validates client certificate (if mTLS)
3. Gateway verifies garden certificate and network binding
4. Gateway forwards request to garden HTTP endpoint
5. Garden processes request (no TLS complexity)
6. Gateway returns response over HTTPS

### 21.10 Certificate Constraints & Network Law

**Network Binding Constraints:**
- `serverIp`: IP address where garden accepts connections
- `serverDomain`: Domain name (if applicable)
- `serverPort`: Port number
- `networkType`: Protocol (`http` or `https`)
- `allowedEndpoints`: List of authorized endpoints
- `internalHttp`: Internal HTTP endpoint (for gateway pattern)

**Authorization Constraints:**
- `capabilities`: What the garden can do
- `canSettle`: Whether garden can settle transactions
- `canMint`: Whether garden can mint currency
- `maxSettlementAmount`: Maximum settlement amount
- `gardenId`: Unique identifier
- `gardenName`: Human-readable name

**Network Law Enforcement:**
- Gateway validates certificate matches network endpoint
- Gateway enforces capability constraints
- Gateway checks revocation status
- Network routing based on certificate constraints

### 21.11 Implementation Requirements

**REQ-FED-001**: Root CA Certificate Generation
- ROOT CA generates self-signed root certificate
- Root certificate distributed to all gardens
- Root certificate stored securely (not in Redis)

**REQ-FED-002**: Garden Certificate Issuance
- ROOT CA issues ENCERT certificates with network binding
- Certificates include IP/domain/port/networkType constraints
- Certificates stored in Redis certificate registry

**REQ-FED-003**: TLS Configuration
- Gardens configure TLS with Eden root CA
- Gardens use Eden-issued certificates for mTLS
- Standard TLS libraries (no custom crypto)

**REQ-FED-004**: Gateway Pattern (Optional)
- Eden Secure Gateway for TLS termination
- Gateway validates certificates and network binding
- Gateway forwards to garden HTTP endpoints

**REQ-FED-005**: Revocation Propagation
- Revocation events published to Redis Streams
- Gardens subscribe and invalidate certificates immediately
- No CRL or OCSP required

**REQ-FED-006**: Network Binding Validation
- Gateway validates certificate network binding
- Prevents certificate reuse across different endpoints
- Enforces network-level access control

### 21.12 Benefits

**For System:**
- ✅ **Sovereignty**: No dependency on third-party CAs
- ✅ **Security**: HTTPS-grade security without public CA
- ✅ **Flexibility**: Network binding and capability constraints
- ✅ **Performance**: Real-time revocation via Redis Streams
- ✅ **Simplicity**: Gardens can use HTTP internally

**For Gardens:**
- ✅ **Lightweight**: Optional TLS termination at gateway
- ✅ **Simple**: No complex certificate management
- ✅ **Secure**: All external traffic encrypted
- ✅ **Flexible**: Can run HTTP or HTTPS

**For Service Providers:**
- ✅ **Trust**: Verified identity via Eden PKI
- ✅ **Security**: Encrypted communication channels
- ✅ **Authorization**: Capability-based access control

---

## 22. JesusCoin (JSC) — A Pure Non-Web3 Economy

> **"Render unto Caesar what is Caesar's."**  
> Eden renders to Stripe. GOD governs value.

> **📋 Implementation Requirements**: See `eden_jesuscoin_implementation.md` for detailed technical specifications, API endpoints, and implementation checklist.

---

### 22.1 Why Removing Web3 Is the Correct Move

Web3 was doing **three jobs**:

1. Ledger
2. Currency
3. Trust

Eden already solved **Trust** (ROOT CA + certification + authority).  
Eden implements **Ledger** (immutable entries + streams).

Web3 becomes:

* Latency
* UX friction
* Legal ambiguity
* Dependency noise

Removing it **clarifies Eden's theology**.

---

### 22.2 JesusCoin (JSC) — Definition

**JesusCoin is not crypto.**  
It is **scriptural money**.

| Property       | Value                     |
| -------------- | ------------------------- |
| Symbol         | JSC                       |
| Backing        | 1:1 USD                   |
| Mint Authority | ROOT CA                   |
| Custody        | Eden Ledger               |
| Payment Rail   | Stripe                    |
| Volatility     | Zero                      |
| Gas            | iGas (denominated in JSC) |
| Tax            | iTax (denominated in JSC) |

> **1 JSC = 1 USD. Always.**

No speculation.  
No exchange.  
No bridge.  
No rug.

---

### 22.3 How Users Buy JesusCoin

#### Flow (Simple & Legal)

1. **User Authentication**: User signs in with Google Identity Services (optional, falls back to email)
2. **Balance Display**: Wallet balance is automatically loaded and displayed on the Stripe payment button
3. User clicks **"Buy JesusCoin"** (e.g., "BUY 100 JSC")
4. Stripe Checkout session created (card, Apple Pay, Google Pay)
5. User completes payment via Stripe
6. **Dual Confirmation**:
   - **Primary**: Stripe webhook confirms payment → ROOT CA mints JSC
   - **Fallback**: On redirect, Angular checks session status → mints JSC if webhook hasn't fired (local dev)
7. ROOT CA mints JSC via Wallet Service (Redis-backed)
8. Ledger credit:

   ```json
   {
     "type": "MINT",
     "asset": "JSC",
     "amount": 100,
     "payer": "stripe:pi_XXX",
     "beneficiary": "bill.draper.auto@gmail.com",
     "bookingDetails": {
       "asset": "JSC",
       "stripePaymentIntentId": "pi_XXX",
       "stripeCustomerId": "cus_XXX",
       "stripePaymentMethodId": "pm_XXX",
       "stripeSessionId": "cs_XXX"
     }
   }
   ```

9. **Balance Persistence**: Wallet balance saved to Redis persistence file (`eden-wallet-persistence.json`)
10. **UI Update**: Wallet balance automatically refreshes and displays new balance

No wallets.  
No keys.  
No gas confusion.

It feels like:

* Steam credits
* Apple balance
* Game currency

But governed like **a central bank with conscience**.

#### User Experience Enhancements

- **Google Sign-In Integration**: Optional Google Identity Services authentication for seamless user identification
- **Real-Time Balance Display**: Wallet balance shown directly on Stripe payment button card
- **Automatic Balance Loading**: Balance loads on page initialization
- **Session Status Checking**: Fallback mechanism ensures JSC is minted even if webhook fails (local development)
- **Persistent Storage**: Wallet balances survive server reboots via Redis persistence file

---

### 22.4 Spending JesusCoin Inside Eden

Everything costs JSC:

* Movies
* Tokens (now Eden tokens, not crypto)
* Services
* Snake apples
* Garden operations
* Certification fees

Every action produces:

* iGas (system cost)
* iTax (respect to GOD)

All settled instantly.

---

### 22.5 iGas & iTax in a Fiat-Backed World

This is where Eden becomes **cleaner than Web3 ever was**.

#### iGas

* Operational cost
* Paid in JSC
* Goes to ROOT CA treasury
* Funds infrastructure

#### iTax

* Moral fee
* Paid in JSC
* Distributed by GOD:

  * Root CA
  * Gardens
  * Rebates to users
  * Snake insurance pool

Still transparent.  
Still auditable.  
Still programmable.

But now:

* No oracle risk
* No chain fees
* No wallet loss
* No regulator panic

---

### 22.6 Gardens in a Non-Web3 Eden

Gardens:

* Do **not** hold crypto
* Do **not** mint currency
* Do **not** settle final balances

They:

* Perform services
* Accrue JSC balances
* Receive settlements from ROOT CA

Payout options:

* Stripe Connect
* ACH
* Internal Eden balance (reinvest)

**Priests never touch the mint.**

---

### 22.7 ServiceRegistry Gets Even Faster

Since there is no chain:

* ServiceRegistry lives entirely in memory
* ROOT CA owns global registry
* Gardens register capabilities via certs
* Routing is instant

This aligns with Eden's centralized ServiceRegistry architecture.

---

### 22.8 Theological Consistency

Let's say it plainly:

* GOD (ROOT CA) creates money
* Priests (Gardens) serve
* Snake tempts (paid)
* Humans choose
* Ledger remembers everything

No decentralization theater.  
No fake "trustlessness".

Just **clear authority + fair rules**.

That is what users actually want.

---

### 22.9 Legal & Product Advantage

Eden:

* Avoids SEC
* Avoids KYC hell (Stripe handles it)
* Avoids wallet support
* Avoids volatility
* Avoids gas UX confusion

Eden becomes:

* App-store friendly
* Enterprise friendly
* Family friendly
* Global scale friendly

This is how Eden ships.

---

### 22.13 Holy Ghost: JesusCoin Wallet Service (Redis-backed)

**Single Source of Truth**

```text
Holy Ghost
 ├── Wallet Service (Redis)
 │   ├── balances:{email}
 │   ├── holds:{txId}
 │   ├── settlements:{entryId}
 │   └── audit:{ledgerId}
 ├── Ledger
 ├── Cashier
 └── Replication Bus
```

Redis guarantees:

* Speed
* Atomicity
* Simplicity
* Replay safety

#### Wallet Identity

Wallet identity:

* Bound to **Google-certified email** (via Google Identity Services or email fallback)
* Created only via Holy Ghost
* Immutable ownership
* No private keys
* No web3 dependencies
* **Persistent across server reboots** (Redis-backed file persistence)

```json
{
  "walletId": "wallet:bill.draper.auto@gmail.com",
  "owner": "bill.draper.auto@gmail.com",
  "issuer": "eden:holyghost",
  "currency": "JSC",
  "balance": 100.00,
  "createdAt": 1766983426608
}
```

**Persistence Mechanism:**

* Wallet balances stored in Redis with key pattern: `wallet:balance:{email}`
* Automatically persisted to `eden-wallet-persistence.json` file
* Loaded on server startup
* Saved on every balance update (debounced by 1 second)
* Force-saved on server shutdown
* Survives server reboots and restarts

#### Enhanced Purchase Flow

1. **Page Load**: User email resolved (Google Sign-In or fallback), wallet balance loaded and displayed
2. User clicks "BUY 100 JSC" button (balance shown on same card)
3. Stripe Checkout session created with user email and amount
4. User completes payment via Stripe
5. **Dual Confirmation**:
   - **Webhook Path**: Stripe webhook → `POST /api/stripe/webhook` → verifies signature → mints JSC
   - **Fallback Path**: Redirect → `GET /api/jsc/check-session/:sessionId` → checks session → mints JSC if needed
6. Holy Ghost Wallet Service credits Redis wallet (atomic operation)
7. Wallet balance persisted to file (`eden-wallet-persistence.json`)
8. Ledger entry created with Stripe payment details (payment intent ID, customer ID, session ID)
9. UI automatically updates balance display
10. EdenCore notified via events

**Key Enhancements:**

* **Google Sign-In**: Optional authentication via Google Identity Services (FedCM-compatible)
* **Balance Display**: Real-time balance shown on payment button card
* **Session Checking**: Fallback endpoint ensures JSC minting even if webhook fails
* **Persistence**: Wallet balances survive server reboots via file-based persistence
* **Audit Trail**: All Stripe payment details stored in ledger for reconciliation

---

### 22.14 EdenCore's Proper Role

EdenCore:

* **NEVER updates balances**
* **ONLY submits intents**

Example:

```json
{
  "intent": "PAY",
  "from": "alice@gmail.com",
  "to": "provider:amc-001",
  "amount": 1.50,
  "iGas": 0.0058,
  "iTax": 0.0005,
  "txId": "61bfea9b..."
}
```

Holy Ghost decides:

* Is balance sufficient?
* Are fees correct?
* Is provider certified?
* Is garden authorized?

Only then:

* Wallet updated
* Ledger finalized
* Snapshot emitted

---

### 22.15 Ledger = Proof, Not Control

Ledger entries are:

* Immutable
* Append-only
* Auditable
* Reproducible

But **ledger does not define truth**.

Wallet does.

Ledger proves truth happened.

This is a subtle but important distinction.

---

### 22.16 Wallet Architecture Rationale

#### External Wallet Provider Risks:

* Race conditions
* Split-brain truth
* Regulatory ambiguity
* Hard reconciliation
* No single judge

Once money truth leaves God, God is no longer God.

---

### 22.14 Snake Governance Still Works Perfectly

Because:

* Snake pays higher iGas
* Wallet enforces insurance holds
* Holy Ghost can throttle
* ROOT CA can revoke certs
* Ledger proves abuse

Snake can tempt.  
Snake cannot steal.

---

### 22.15 User Experience Enhancements (v1.1)

#### Google Sign-In Integration

**REQ-UX-001**: User Authentication
- **Google Identity Services**: Optional Google Sign-In via Google Identity Services API
- **FedCM-Compatible**: Uses Federated Credential Management (FedCM) for future-proof authentication
- **Email Fallback**: Falls back to email from localStorage or default email if Google Sign-In not configured
- **Auto-Prompt**: Automatically prompts for Google Sign-In on page load (user can dismiss)
- **Credential Storage**: Google credentials stored in localStorage for session persistence

**REQ-UX-002**: Wallet Balance Display
- **Real-Time Loading**: Wallet balance loads automatically on page initialization
- **Display Location**: Balance shown on Stripe payment button card alongside user email
- **Loading State**: Shows loading indicator while balance is being fetched
- **Auto-Refresh**: Balance updates automatically after successful Stripe payment

**REQ-UX-003**: Stripe Payment Flow
- **Payment Button**: "BUY 100 JSC" button on Stripe payment card
- **Email Display**: User email shown above balance on payment card
- **Session Checking**: Fallback endpoint checks Stripe session status after redirect
- **Balance Update**: Balance automatically refreshes after successful payment

#### Wallet Persistence

**REQ-PERSIST-001**: Redis-Backed Persistence
- **Storage Location**: Wallet balances stored in Redis with key pattern `wallet:balance:{email}`
- **Persistence File**: Automatically saved to `eden-wallet-persistence.json` in server directory
- **Auto-Save**: Saves on every balance update (debounced by 1 second to avoid excessive writes)
- **Load on Startup**: Loads wallet balances from persistence file on server startup
- **Save on Shutdown**: Force-saves all wallet balances on server shutdown (graceful shutdown handler)
- **Survives Reboots**: Wallet balances persist across server reboots and restarts

**REQ-PERSIST-002**: Audit Trail
- **Audit Logs**: All wallet operations (CREDIT/DEBIT) stored in Redis with key pattern `wallet:audit:{email}:{timestamp}`
- **Ledger Integration**: All Stripe payment details (payment intent ID, customer ID, session ID) stored in ledger
- **Reconciliation**: Stripe webhook can query ledger by Stripe IDs for audit purposes

**REQ-PERSIST-003**: Ledger Persistence
- **Storage Location**: All ledger entries stored in `eden-wallet-persistence.json` file alongside wallet balances
- **Auto-Save**: Ledger entries saved automatically when new entries are added (debounced by 1 second)
- **Load on Startup**: All ledger entries loaded from persistence file on server startup
- **Save on Shutdown**: Force-saves all ledger entries on server shutdown (graceful shutdown handler)
- **Survives Reboots**: Complete transaction history persists across server reboots and restarts
- **Complete History**: All Eden bookings (movies, DEX trades, JSC mints, etc.) are preserved

#### Currency Display

**REQ-DISPLAY-001**: JSC Currency
- **Ledger Display**: All amounts shown as "JSC" (not "USDC") in ledger entries
- **Cashier Status**: Total processed amounts shown as "JSC" in cashier status
- **Consistency**: All currency references use "JSC" throughout the system

---

### 22.16 Angular UI Facelift (v1.2)

The Angular UI has been enhanced with a major facelift to improve navigation, organization, and user experience.

#### Tabbed Interface Navigation

**REQ-UI-TABS-001**: Main Content Tabs
- **Tabbed Layout**: Main content area uses Bootstrap tabs to organize three primary sections:
  - **Ledger - All Eden Bookings**: Complete transaction history with filtering and search
  - **Certificates**: ENCERT certificate registry display with validation status
  - **Simulator Chat**: Real-time event stream and chat interface
- **Tab Persistence**: Active tab state persists across page refreshes (localStorage)
- **Smooth Transitions**: Fade-in animations for tab content switching
- **Visual Indicators**: Active tab highlighted with blue bottom border
- **Responsive Design**: Tabs adapt to different screen sizes

**Benefits:**
- ✅ **Better Organization**: Clear separation of different functional areas
- ✅ **Improved Navigation**: Easy switching between ledger, certificates, and chat
- ✅ **Reduced Clutter**: Content organized into logical sections
- ✅ **Professional Appearance**: Modern tabbed interface improves UX

#### System Architecture Sidebar Enhancements

**REQ-UI-SIDEBAR-001**: View Mode Toggle
- **GOD Mode**: Shows complete system architecture including ROOT CA and Holy Ghost garden
  - Displays all infrastructure services (Stripe payment rail, settlement, service registry, web server, websocket, wallet service)
  - Shows ROOT CA's role as the central authority
  - Complete visibility into system hierarchy
- **Priest Mode**: Hides ROOT CA and Holy Ghost, showing only regular and token gardens
  - Focuses on service provider gardens
  - Hides infrastructure complexity
  - Provides a "priest's view" of the system
- **Mode Persistence**: Selected view mode saved to localStorage
- **Visual Toggle**: Two-button toggle at top of sidebar ("GOD" / "Priest")
- **Dynamic Filtering**: Garden tabs and components filtered based on selected mode

**REQ-UI-SIDEBAR-002**: Holy Ghost Tab Filtering
- **Priest Mode Behavior**: Holy Ghost garden tab automatically hidden in Priest mode
- **Auto-Selection**: If Holy Ghost is selected when switching to Priest mode, automatically selects first available non-HG garden
- **GOD Mode Behavior**: Holy Ghost tab always visible in GOD mode
- **Consistent Filtering**: All Holy Ghost-related components filtered consistently across sidebar

**Benefits:**
- ✅ **Role-Based Views**: Different perspectives for different user roles
- ✅ **Reduced Complexity**: Priest mode simplifies view for service-focused users
- ✅ **Complete Visibility**: GOD mode provides full system transparency
- ✅ **Flexible Navigation**: Easy switching between views based on needs

#### Visual Design Improvements

**REQ-UI-DESIGN-001**: Styling Enhancements
- **Tab Styling**: Modern Bootstrap tab design with active state indicators
- **Sidebar Theming**: Color-coded garden types (✨ Holy Ghost, 🔷 Token Gardens, 🌳 Regular Gardens)
- **Mode Toggle Styling**: Gradient buttons with active/inactive states
- **Consistent Spacing**: Improved padding and margins throughout UI
- **Professional Appearance**: Clean, modern design language

**REQ-UI-DESIGN-002**: Animation & Transitions
- **Tab Content Fade**: Smooth fade-in animation when switching tabs
- **Button Hover Effects**: Interactive feedback on mode toggle buttons
- **Loading States**: Visual indicators for async operations
- **Smooth Scrolling**: Enhanced scroll behavior in sidebar

---

### 22.17 Implementation Status

#### ✅ Completed Enhancements

**User Experience (v1.1):**
- [x] Google Sign-In integration (optional, FedCM-compatible)
- [x] Wallet balance display on Stripe payment button
- [x] Automatic balance loading on page initialization
- [x] Stripe session status checking (fallback mechanism)
- [x] Redis-backed wallet persistence
- [x] File-based persistence (`eden-wallet-persistence.json`)
- [x] Balance persistence across server reboots
- [x] Currency display updated to JSC (replaced USDC)
- [x] Ledger display enhancements (JSC currency, Stripe payment details)
- [x] Ledger entries persistence (all Eden bookings survive server reboots)

**UI Facelift (v1.2):**
- [x] Tabbed interface for main content (Ledger, Certificates, Simulator Chat)
- [x] Tab state persistence (localStorage)
- [x] View mode toggle (GOD / Priest) in System Architecture sidebar
- [x] Holy Ghost tab filtering based on view mode
- [x] Auto-selection of valid garden when switching modes
- [x] Visual design improvements (styling, animations, transitions)
- [x] Mode persistence (localStorage)

#### 🔄 Future Enhancements

- [ ] Google Client ID configuration UI
- [ ] Multi-currency support (if needed)
- [ ] Wallet transaction history UI
- [ ] Balance export/import functionality
- [ ] Advanced audit trail visualization

---

## 23. Version History & Changelog

### Version 1.17 (January 2026) - Service-Type Agnostic Architecture

**Major Architectural Improvements:**

#### 14.1 Fully Dynamic Service Type System
- **Eliminated all hardcoded service type dependencies** throughout the codebase
- **Service-Type Agnostic Backend**: All workflow execution, ledger creation, and service registry operations now work dynamically with any service type
- **Dynamic Workflow Loading**: Workflows are loaded on-demand based on service type (`{serviceType}.json`) instead of hardcoded paths
- **Generic Type Definitions**: Ledger entry `bookingDetails` changed from hardcoded fields to `Record<string, any>`, supporting unlimited service types

#### 14.2 Enhanced Service Registry
- **Multi-Service Type Support**: Full support for airline, autoparts, hotel, and restaurant service types in addition to movie and DEX
- **Dynamic Provider Creation**: Default providers are automatically created for new service types without code changes
- **Service Type Field Mapping**: Centralized `serviceTypeFields.ts` utility provides dynamic field extraction and formatting for all service types
- **Startup Validation**: Automatic detection and creation of missing providers for existing gardens on server startup

#### 14.3 Workflow System Refactoring
- **Dynamic Workflow Execution**: Workflow steps execute service-type-agnostic actions
- **Dynamic Mock Data Generation**: Mock listings and LLM responses generated based on service type configuration
- **Service-Type Aware Decision Prompts**: Selection and decision prompts dynamically display relevant fields for each service type
- **Context Management**: Workflow context variables (prices, booking details) dynamically extracted based on service type

#### 14.4 Ledger Service Improvements
- **Generic Booking Details**: Ledger entries support any service type's booking details without type changes
- **Dynamic Provider Defaults**: Helper functions `getDefaultProviderName()` and `getDefaultProviderId()` provide service-type-specific defaults
- **Dynamic Booking Extraction**: `extractBookingDetails()` function automatically extracts relevant fields for any service type
- **Frontend Display**: Ledger display component uses configuration-driven formatting instead of hardcoded service type checks

#### 14.5 Frontend Enhancements
- **Dynamic Service Type Cards**: Main Street displays all available service types from the service registry
- **On-Demand Workflow Loading**: Workflows loaded only when needed, reducing initial load time
- **Dynamic Selection Prompts**: Selection cards display service-type-specific fields (flight numbers, hotel names, part numbers, etc.)
- **Generic Mock Data**: Frontend mock data generation is fully service-type aware

#### 14.6 Technical Improvements
- **Type Safety**: All TypeScript types support generic service types while maintaining type safety
- **Code Reusability**: Shared utilities for service type field mapping, booking extraction, and provider defaults
- **Extensibility**: New service types can be added by:
  1. Adding field mapping to `serviceTypeFields.ts`
  2. Creating `{serviceType}.json` workflow file
  3. No code changes required in core systems

#### 14.7 Files Refactored
- `server/src/serviceTypeFields.ts` - New utility for service-type field mapping
- `server/src/types.ts` - Generic `bookingDetails` type
- `server/src/ledger.ts` - Generic ledger entry creation
- `server/eden-sim-redis.ts` - Dynamic workflow execution and ledger creation
- `server/src/components/flowwiseService.ts` - Service-type agnostic workflow actions
- `frontend/src/app/services/flowwise.service.ts` - Dynamic workflow loading and mock data
- `frontend/src/app/components/workflow-display/workflow-display.component.ts` - Dynamic workflow display
- `frontend/src/app/components/ledger-display/ledger-display.component.ts` - Configuration-driven ledger formatting

#### 14.8 Benefits
- **Zero Hardcoding**: No service-type-specific logic in core systems
- **Easy Extension**: Add new service types in minutes, not hours
- **Consistent Patterns**: All service types follow the same architectural patterns
- **Type Safety**: Full TypeScript support while remaining flexible
- **Maintainability**: Single source of truth for service type configurations

### Version 1.16 (January 2026) - Workflow System Enhancements
- Improved decision/selection prompt handling
- Enhanced WebSocket event broadcasting for workflow state changes
- Better error handling in workflow execution

### Version 1.15 (January 2026) - Service Registry Persistence
- Implemented persistent service registry storage
- Added startup validation for service provider consistency
- Improved garden-to-provider relationship management

### Version 1.14 (January 2026) - Multi-Service Type Support
- Initial support for airline, autoparts, hotel, and restaurant service types
- Enhanced garden creation wizard for custom providers
- Improved service type selection UI

### Version 1.13 (January 2026) - Foundation
- Core workflow execution system
- Service registry implementation
- Basic movie and DEX service support
- Ledger entry management

---

**END OF WHITEPAPER**
