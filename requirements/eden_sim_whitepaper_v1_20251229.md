# 🌳 The Garden of Eden (Eden)

**Whitepaper v1.0 – Indexer‑First, Intelligence‑Native Marketplace**

Author: Bill Draper (CTO)  
Date: 2026

Eden separates trust, execution, and intelligence into independent planes governed by ROOT CA, enabling a fair, monetized, and web3-free intelligence marketplace

---

## Abstract

Eden is an **indexer‑first economic and intelligence system** where the traditional blockchain is no longer the parent, but the *child* of the indexer. Eden replaces gas fees, smart‑contract rigidity, and token‑centric governance with **LLM‑governed intelligence fees**, **federated indexers**, and a **ROOT Certificate Authority (ROOT CA)** that certifies trust, services, and replication. Eden introduces a **"Garden of Eden Main Street"** UI that eliminates LLM service type resolution through visual service type selection.

Eden is designed to be:
- Gas‑free
- Indexer‑driven
- LLM‑native
- Service‑oriented
- Self‑policing, self‑governing, and self‑replicating
- **UI‑first service discovery** (Garden of Eden Main Street eliminates LLM type resolution)

---

## 1. Core Philosophy

> *Blockchain records history. Eden understands it.*

Eden assumes:
- History is immutable
- Meaning is contextual
- Trust is certified, not mined
- Intelligence is the new gas

Indexers are **priests**, not miners. ROOT CA is **law**, not power. Users are **free actors**, not wallet addresses.

---

## 2. System Actors

### 2.1 ROOT CA (Law / Moses)
- Global certification authority
- Certifies indexers and services
- **Manages centralized ServiceRegistry** (single source of truth for all services)
- Provides quick post-LLM in-memory service lookup for indexers
- Collects minimal intelligence fee (≈0.001%)
- Guarantees fallback, insurance, and dispute resolution
- **Settlement authority** (only ROOT CA can settle transactions and update balances)

### 2.2 Indexers (Knowledge Trees)
- Federated, Docker‑deployed nodes
- In‑memory Redis‑like databases
- Run identical LLM versions (DeepSeek‑class)
- Hold certificates + private keys
- **Dedicated intelligent entities** (post-LLM regulated)
- Query ROOT CA ServiceRegistry for service discovery (do not manage it)
- Provide intelligence, routing, pricing, and policing
- Execute transactions but never settle them (settlement is ROOT CA's authority)

#### 2.2.1 Regular Indexers
- General-purpose indexers for all service types
- Handle movie bookings, content, APIs, marketplaces
- Process transactions and route to appropriate services
- Query ROOT CA ServiceRegistry after LLM extraction for quick service lookup
- Focus on intelligence and routing, not service management

#### 2.2.2 Token Indexers (Specialized)
- Specialized indexers dedicated to DEX token/pool services
- Manage token pools, liquidity, and trading operations
- Provide DEX-specific routing and pricing intelligence
- Each token indexer can manage multiple token pools
- Identified by `TokenIndexer-T1`, `TokenIndexer-T2`, etc.
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
- **Register directly with ROOT CA** (not with indexers)
- Registration via `POST /api/root-ca/service-registry/register`
- Bonded and reputation‑scored
- Can be legacy platforms (AMC, MovieCom, etc.)
- ROOT CA maintains centralized registry for quick post-LLM lookup

---

## 3. The Eden Governance Model (Plain Truth)

> **Indexers act.  
> ROOT CA judges.  
> GOD settles.**

Or in other words:

> **Priests perform the rituals, but Judgment Day belongs to GOD.**

This metaphor is not poetic fluff — it is **architecturally precise**. This is the **governing law of Eden**.

### 🔹 Priest = Indexer

Indexers:

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
Indexer executes
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

## 4. Indexer‑First Architecture

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
Indexer A —— Indexer B —— Indexer C
  |          |           |
 LocalStore  LocalStore   LocalStore
     ↓           ↓            ↓
TokenIndexer-T1 —— TokenIndexer-T2
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
> **If an indexer can answer it, the chain does not need to exist.**

> **Garden of Eden Main Street eliminates LLM service type resolution.**

> **ROOT CA manages ServiceRegistry. Indexers query ROOT CA.**

> **Indexers execute transactions. ROOT CA settles them.**

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

Indexers replicate state, not blocks.

---

## 6. Intelligence Gas (iGas)

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
| Indexers | Compute & routing | Infrastructure costs, replication |
| Service Providers | Quality incentive | Reward for good service |
| Users | Usage credit | Rebates and loyalty rewards |

This creates a **positive‑sum economy** where all participants benefit from system growth.

---

## 7. Service Registry & Routing

### 7.1 ROOT CA Service Registry (Centralized Management)

**ServiceRegistry is managed by ROOT CA, not indexers.**

- All services must be registered with ROOT CA
- ROOT CA maintains centralized, in-memory ServiceRegistry
- Provides quick post-LLM in-memory lookup for indexers
- Single source of truth for all service providers
- Registration API: `POST /api/root-ca/service-registry/register`
- Query API: `GET /api/root-ca/service-registry`

Each service registration includes:
- Service ID and UUID
- Service type (movie, dex, content, etc.)
- Location
- Bond
- Reputation
- Associated indexer ID
- API endpoint

### 7.2 User Experience Flow (Garden of Eden Main Street)

**New Workflow: Service Type Selection Before LLM**

Eden introduces a **"Garden of Eden Main Street"** UI that eliminates the need for LLM service type resolution:

1. **User browses service type cards** (Movie Tickets, DEX Tokens, Airline Tickets, Auto Parts, Hotel Booking, Restaurant Reservations)
2. **User clicks a service type card** → Input populated with sample query
3. **Context sensing** → Service type detected from card selection or user input
4. **Unified chat input** → Single input with dynamic context (no separate inputs needed)
5. **LLM extracts intent** → Already knows service type from context
6. **Indexer queries ROOT CA ServiceRegistry** → Quick in-memory lookup (no LLM needed for service type)
7. **ROOT CA returns matching providers** → Filtered by serviceType, location, reputation
8. **Indexer queries provider APIs** → Gets actual data (prices, availability)
9. **LLM formats response** → Best options presented
10. **EdenCore executes transaction** → Creates snapshot, updates ledger
11. **ROOT CA settles transaction** → Updates balances, distributes fees

### 7.3 Indexer Query Flow (Post-LLM)

Indexers query ROOT CA ServiceRegistry **after** LLM extraction:

1. **LLM extracts user intent** (serviceType, filters, etc.) - serviceType already known from context
2. **Indexer queries ROOT CA ServiceRegistry** (quick in-memory lookup)
3. **ROOT CA returns matching providers** (filtered by serviceType, location, reputation)
4. **Indexer queries provider APIs** for actual data (prices, availability)
5. **LLM formats response** with best options
6. **EdenCore executes transaction**

### Example User Query Flow

**Traditional Flow (Before):**
> User types: "I have 10 USDC. Where can I watch *Catch Me If You Can* tonight at best price?"
> 
> 1. LLM extracts service type (movie)
> 2. Indexer queries ServiceRegistry
> 3. ... (rest of flow)

**New Flow (Garden of Eden Main Street):**
> User clicks "Movie Tickets" card → Input auto-populated
> 
> 1. **Service type already known** (movie) - no LLM needed for type resolution
> 2. **LLM extracts intent**: `filters: { location: "Baltimore", maxPrice: 10 }`
> 3. **Indexer queries ROOT CA ServiceRegistry** → Returns: AMC, MovieCom, Cinemark
> 4. **Indexer queries provider APIs** → Gets actual showtimes and prices
> 5. **LLM aggregates best result** → Selects best option
> 6. **EdenCore executes transaction** → Creates snapshot, updates ledger
> 7. **ROOT CA settles transaction** → Updates balances, distributes fees

**Benefits:**
- ✅ **Faster**: No LLM call needed to determine service type
- ✅ **Clearer UX**: Visual service type selection
- ✅ **Context-aware**: Unified input adapts to service type
- ✅ **Efficient**: ROOT CA ServiceRegistry lookup replaces LLM type resolution

### 7.4 Architectural Benefits

**Why ROOT CA manages ServiceRegistry:**

- ✅ **Quick post-LLM lookup**: In-memory registry enables fast service discovery
- ✅ **Single source of truth**: No synchronization issues between indexers
- ✅ **Indexer focus**: Indexers become dedicated intelligent entities (post-LLM regulated)
- ✅ **Centralized control**: ROOT CA can revoke/suspend services centrally
- ✅ **Simplified registration**: Providers register once with ROOT CA, not with each indexer

**Why Garden of Eden Main Street UI:**

- ✅ **Eliminates LLM type resolution**: Service type known before LLM call (reduces LLM calls by ~50%)
- ✅ **Faster user experience**: Visual selection vs. typing natural language
- ✅ **Context-aware input**: Unified input adapts to service type dynamically
- ✅ **Better UX**: Users see available service types upfront (Movie, DEX, Airline, Auto Parts, Hotel, Restaurant)
- ✅ **Scalable**: Easy to add new service types without backend changes
- ✅ **Reduced latency**: One less LLM extraction step (service type already known from UI context)

---

### 7.5 LLM System Prompt Management (Redis-Backed, LLM-Generated)

Eden introduces an **intelligent, LLM-governed system prompt generation service** that replaces hardcoded prompts with dynamic, service-type-specific prompts stored in Redis.

#### Architecture Overview

**ROOT CA System Prompt Generator Service** (Holy Ghost Indexer):
- **Service Type**: `system-prompt-generator`
- **Ownership**: ROOT CA (Holy Ghost Indexer)
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

#### Usage by Indexers

**Indexer Query Flow with Dynamic Prompts:**
1. Indexer receives user query
2. Indexer determines `serviceType` (from UI context or LLM extraction)
3. Indexer queries Redis: `GET eden:system-prompts:{serviceType}`
4. If prompt exists:
   - Use stored prompts for LLM calls
   - Charge iGas based on prompt complexity
5. If prompt doesn't exist:
   - Fall back to default prompts
   - Optionally trigger prompt generation

**Example Code Flow:**
```typescript
// Indexer retrieves system prompt from Redis
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
- Replication: Prompts replicated across indexers via Redis streams

**REQ-PROMPT-002**: LLM Generation Service
- ROOT CA System Prompt Generator service in Holy Ghost Indexer
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

### 7.6 Transaction Notification Code Generation Service

Eden provides an **LLM-powered code generation service** that creates ready-to-use code samples for external service providers to implement the three-level transaction notification system (Webhook, Pull, Push).

#### Architecture Overview

**ROOT CA Notification Code Generator Service** (Holy Ghost Indexer):
- **Service Type**: `notification-code-generator`
- **Ownership**: ROOT CA (Holy Ghost Indexer)
- **Storage**: Redis-backed (`eden:notification-code:{providerId}`)
- **Generation**: LLM-powered code generation for multiple languages and frameworks
- **Costing**: iGas-based intelligent service

#### Three-Level Notification System

Eden provides **three complementary notification mechanisms** for service providers:

**1️⃣ Webhook (Push - Best Effort)**
- Indexer pushes transaction snapshot to provider's webhook URL
- Near-real-time delivery
- Best effort only (no delivery guarantees)
- Retry logic handled by indexer

**2️⃣ Pull/Poll (Safety Net)**
- Provider queries indexer RPC endpoint periodically
- Provider controls reliability and polling frequency
- Fallback if webhook fails
- No inbound firewall rules required

**3️⃣ RPC (Canonical Source)**
- Provider queries indexer RPC for transaction status
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
  "indexerEndpoint": "https://indexer-alpha.eden.io",
  "webhookUrl": "https://api.vendor-001.com/eden/webhook",
  "notificationMethods": ["webhook", "pull", "rpc"]
}
```

**LLM Generation Process:**
1. **Analyzes provider requirements** → Determines code structure
2. **Generates webhook receiver code** → Handles POST requests from indexer
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
  private indexerEndpoint: string;
  private pollInterval: number = 5000; // 5 seconds
  private timeout: number = 300000; // 5 minutes
  private startTime: number;
  
  constructor(indexerEndpoint: string) {
    this.indexerEndpoint = indexerEndpoint;
    this.startTime = Date.now();
  }
  
  async pollTransactionStatus(payerEmail: string): Promise<TransactionStatus | null> {
    while (Date.now() - this.startTime < this.timeout) {
      try {
        const response = await axios.get(
          `${this.indexerEndpoint}/rpc/tx/status`,
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
const poller = new EdenTransactionPoller('https://indexer-alpha.eden.io');
const transaction = await poller.pollTransactionStatus('customer@example.com');
if (transaction) {
  console.log('Transaction found:', transaction);
}
```

**TypeScript RPC Client (Canonical Source):**
```typescript
import axios from 'axios';

class EdenRPCClient {
  private indexerEndpoint: string;
  
  constructor(indexerEndpoint: string) {
    this.indexerEndpoint = indexerEndpoint;
  }
  
  // Query transaction by payer email
  async getTransactionByPayer(payerEmail: string) {
    const response = await axios.get(
      `${this.indexerEndpoint}/rpc/getTransactionByPayer`,
      { params: { payer: payerEmail } }
    );
    return response.data;
  }
  
  // Query transaction by snapshot ID
  async getTransactionBySnapshot(snapshotId: string) {
    const response = await axios.get(
      `${this.indexerEndpoint}/rpc/getTransactionBySnapshot`,
      { params: { snapshot_id: snapshotId } }
    );
    return response.data;
  }
  
  // Get latest snapshot for provider
  async getLatestSnapshot(providerId: string) {
    const response = await axios.get(
      `${this.indexerEndpoint}/rpc/getLatestSnapshot`,
      { params: { provider_id: providerId } }
    );
    return response.data;
  }
  
  // Register webhook URL
  async registerWebhook(providerId: string, webhookUrl: string) {
    const response = await axios.post(
      `${this.indexerEndpoint}/rpc/webhook/register`,
      { providerId, webhookUrl }
    );
    return response.data;
  }
  
  // Unregister webhook
  async unregisterWebhook(providerId: string) {
    const response = await axios.post(
      `${this.indexerEndpoint}/rpc/webhook/unregister`,
      { providerId }
    );
    return response.data;
  }
}

// Usage
const rpc = new EdenRPCClient('https://indexer-alpha.eden.io');

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

INDEXER_ENDPOINT = "https://indexer-alpha.eden.io"

class EdenNotificationClient:
    def __init__(self, indexer_endpoint: str):
        self.indexer_endpoint = indexer_endpoint
    
    def get_transaction_by_payer(self, payer_email: str) -> Optional[Dict[str, Any]]:
        """RPC: Query transaction by payer email"""
        response = requests.get(
            f"{self.indexer_endpoint}/rpc/getTransactionByPayer",
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
    """Webhook: Receive push notifications from indexer"""
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
    "indexerEndpoint": "https://indexer-alpha.eden.io",
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
- ROOT CA Notification Code Generator service in Holy Ghost Indexer
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

## 8. Dynamic Bonds & Pricing

- Every successful transaction:
  - Increases service bond
  - Improves reputation
  - Can lower fees

- Poor service:
  - Bond reduced
  - Routing deprioritized

This replaces ratings with **economic truth**.

---

## 9. No‑Rug DEX Model (Optional Layer)

- Pools must be ROOT‑certified
- Creator cannot rug without losing bond
- Trades increase pool value slightly
- High‑frequency traders rewarded, not penalized

Eden supports DEX/CEX without native tokens.

### 9.1 Token Indexers & DEX Pools

DEX token/pool services are provided by **specialized token indexers**:

- Each token indexer manages one or more token pools
- Pools are assigned to token indexers at initialization
- Token indexers provide DEX-specific routing and intelligence
- LLM routes DEX queries to appropriate token indexers
- Example: "I want to BUY 2 SOLANA token A" → routed to TokenIndexer-T1 managing TOKENA pool

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
| Token Indexer | 30% | Reward for providing token pool services |
| Trader | 30% | Rebate back to buyer/seller |

This creates a **WIN-WIN-WIN** economy where:
- ROOT CA liquidity pool grows over time
- Token indexers are rewarded for service provision
- Traders receive rebates, incentivizing participation

#### iTax Flow Example

```
Trade Value: 1.0 SOL
iTax (0.0005%): 0.000005 SOL

Distribution:
├─ ROOT CA: 0.000002 SOL (40%) → Added to ROOT CA liquidity pool
├─ Indexer: 0.0000015 SOL (30%) → Reward to token indexer
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
5. **Indexer queries ROOT CA ServiceRegistry** → Returns DEX pool service providers
6. Token indexer provides pool listings with real-time prices
7. LLM selects best pool based on price and liquidity
8. Trade executes with price impact and iTax calculation
9. **ROOT CA settles transaction** → Updates balances, distributes iTax: ROOT CA (40%), Indexer (30%), Trader (30%)
10. Pool state updated, snapshot created, streamed to indexers

**Key Improvement:** Service type resolution moved from LLM to UI selection, reducing LLM calls and improving latency.

---

## 10. SaaS & Legacy Integration

Eden integrates via **API plugins**:
- AMC
- MovieCom
- Banks
- Wallets
- Payment processors

Legacy systems keep control; Eden handles intelligence, trust, and settlement.

---

## 11. Security & Identity

- Google identity only
- Email‑based trust
- Abuse detection via LLM policing
- No private key management for users

---

## 12. Deployment Model

### 12.1 Initial Bootstrap

**Eden Startup Sequence:**

1. **ROOT CA Initialization**
   - ROOT CA identity created
   - Root certificate generated (`eden-root-ca.pem`, `eden-root-ca.key`)
   - Certificate registry initialized
   - Revocation stream created (`eden:encert:revocations`)

2. **Holy Ghost Indexer Activation**
   - Holy Ghost indexer loaded (ROOT CA's dedicated infrastructure indexer)
   - Infrastructure services registered:
     - Stripe Payment Rail Service (`stripe-payment-rail-001`)
     - Settlement Service (`settlement-service-001`)
     - Service Registry (`service-registry-001`)
     - Web Server Service (`webserver-service-001`)
     - WebSocket Service (`websocket-service-001`)
     - Wallet Service (`wallet-service-001`)
     - System Prompt Generator Service (`system-prompt-generator-001`)
     - Notification Code Generator Service (`notification-code-generator-001`)
   - Holy Ghost certificate issued

3. **Replication Bus Initialization**
   - Redis connection established
   - Replication streams created
   - Persistence file loaded (`eden-wallet-persistence.json`)
   - Wallet balances restored
   - Ledger entries restored
   - Dynamic indexers restored (if any)

4. **No Additional Indexers at Startup**
   - Only ROOT CA and Holy Ghost are active
   - All other indexers (movie, token) are created dynamically via UI
   - System starts minimal and grows organically

**Bootstrap Architecture:**
```
[ ROOT CA ]
     |
     v
[ Holy Ghost Indexer ]
     |
     ├─── Stripe Payment Rail
     ├─── Settlement Service
     ├─── Service Registry
     ├─── Wallet Service
     ├─── System Prompt Generator
     ├─── Notification Code Generator
     └─── Replication Bus (Redis)
```

---

### 12.2 Dynamic Indexer Creation Workflow

All additional indexers (movie, token, etc.) are created **dynamically** via the Angular UI in a wizard-style interface. Indexers are **not** pre-configured at startup.

#### Creation Modes

**GOD Mode:**
- Full visibility into system architecture
- Can create any indexer type
- Full access to infrastructure services
- Complete system transparency

**Priest Mode:**
- Service-focused view
- Can create service provider indexers
- Limited visibility into infrastructure
- Focused on operational needs

#### Wizard-Style Creation Interface

The Angular UI provides a **multi-step wizard** for indexer creation:

**Step 1: Indexer Type Selection**
- Select indexer type: Movie Indexer, Token Indexer, or Custom
- View requirements and costs for each type
- Preview capabilities and service types

**Step 2: Configuration**
- **Indexer Name**: Human-readable name
- **Network Binding**:
  - Server IP address
  - Server domain (optional)
  - Server port
  - Network type (http/https)
- **Capabilities**: Selected based on indexer type
- **Service Types**: Services this indexer will provide

**Step 3: Funding & Economics**
- **Deployment Fee**: One-time cost to create indexer (e.g., 110 JSC for movie indexer)
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

**Step 7: Indexer Activation**
- **Certificate Issuance**: ENCERT certificate issued by ROOT CA
- **Service Provider Registration**: Default providers created (for movie indexers)
- **Persistence**: Indexer saved to Redis persistence file
- **Activation**: Indexer becomes active and available

---

### 12.3 Movie Indexer Creation Workflow

**Example: Creating a Movie Service Indexer**

#### Step 1: Type Selection
```
User selects: "Movie Service Indexer"
Cost: 110 JSC
Capabilities: INDEXER, ISSUE_CERT
Service Types: movie, snake (advertising)
```

#### Step 2: Configuration
```json
{
  "indexerName": "Indexer-D",
  "serverIp": "192.168.1.200",
  "serverDomain": "indexer-delta.eden.io",
  "serverPort": 8080,
  "networkType": "https",
  "indexerId": "indexer-d"
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
- **Deployment Fee (110 JSC)**: One-time cost to create indexer infrastructure
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
  "indexerEndpoint": "https://indexer-delta.eden.io"
}
```

**Generated Code:**
- Webhook receiver (Express endpoint)
- Pull/poll client (with retry logic)
- RPC client (canonical source queries)
- Integration example (combining all methods)

**Code Stored:**
- Redis key: `eden:notification-code:indexer-d`
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

#### Step 7: Indexer Activation

**Certificate Issuance:**
```json
{
  "subject": "eden:indexer:abc123...",
  "issuer": "eden:root:ca:00000000-0000-0000-0000-000000000001",
  "capabilities": ["INDEXER", "ISSUE_CERT"],
  "constraints": {
    "indexerId": "indexer-d",
    "indexerName": "Indexer-D",
    "serverIp": "192.168.1.200",
    "serverDomain": "indexer-delta.eden.io",
    "serverPort": 8080,
    "networkType": "https"
  }
}
```

**Default Service Providers Created:**
- Regal Cinemas (`regal-001-indexer-d`)
- Cineplex (`cineplex-001-indexer-d`)
- MovieMax (`moviemax-001-indexer-d`)

**Persistence:**
- Indexer saved to `eden-wallet-persistence.json`
- Survives server reboot
- Certificate stored in certificate registry

**Activation:**
- Indexer added to `INDEXERS` array
- Stream created: `eden:indexer:D`
- Indexer becomes active and available for routing

---

### 12.4 Token Indexer Creation Workflow

**Example: Creating a Token Service Indexer**

#### Step 1: Type Selection
```
User selects: "Token Service Indexer"
Cost: 150 JSC
Capabilities: INDEXER, ISSUE_CERT
Service Types: dex (token pools)
```

#### Step 2: Configuration
```json
{
  "indexerName": "TokenIndexer-T3",
  "serverIp": "192.168.1.300",
  "serverDomain": "token-indexer-t3.eden.io",
  "serverPort": 8080,
  "networkType": "https",
  "indexerId": "T3",
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
tokenSymbol/baseToken/price/liquidity/poolId/indexerId in ledger"
```

**LLM Generates:**
- Query extraction prompt (for DEX trading queries)
- Response formatting prompt (for token pool listings)
- Ledger field mappings (tokenSymbol, baseToken, price, liquidity, poolId, indexerId)
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
  "indexerEndpoint": "https://token-indexer-t3.eden.io",
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

#### Step 7: Token Indexer Activation

**Certificate Issuance:**
```json
{
  "subject": "eden:token-indexer:def456...",
  "issuer": "eden:root:ca:00000000-0000-0000-0000-000000000001",
  "capabilities": ["INDEXER", "ISSUE_CERT"],
  "constraints": {
    "indexerId": "T3",
    "indexerName": "TokenIndexer-T3",
    "tokenServiceType": "dex",
    "serverIp": "192.168.1.300",
    "serverDomain": "token-indexer-t3.eden.io",
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
- Token indexer saved to `eden-wallet-persistence.json`
- Survives server reboot
- Certificate stored in certificate registry

**Activation:**
- Token indexer added to `TOKEN_INDEXERS` array
- Stream created: `eden:token-indexer:T3`
- Token indexer becomes active for DEX routing

---

### 12.5 Persistence & Recovery

**Persistence Mechanism:**
- All dynamically created indexers stored in `eden-wallet-persistence.json`
- File structure:
  ```json
  {
    "indexers": [
      {
        "id": "indexer-d",
        "name": "Indexer-D",
        "stream": "eden:indexer:D",
        "active": true,
        "uuid": "eden:indexer:abc123...",
        "createdAt": 1735515100000,
        "createdBy": "bill.draper.auto@gmail.com"
      }
    ],
    "tokenIndexers": [
      {
        "id": "T3",
        "name": "TokenIndexer-T3",
        "stream": "eden:token-indexer:T3",
        "active": true,
        "uuid": "eden:token-indexer:def456...",
        "tokenServiceType": "dex",
        "createdAt": 1735515200000,
        "createdBy": "bill.draper.auto@gmail.com"
      }
    ]
  }
  ```

**Recovery on Startup:**
1. Load persistence file
2. Restore indexers to `INDEXERS` array
3. Restore token indexers to `TOKEN_INDEXERS` array
4. Issue certificates to restored indexers (if not already issued)
5. Restore service providers for each indexer
6. Activate all restored indexers

**Persistence Triggers:**
- **Immediate Save**: On indexer creation (bypass debounce)
- **Debounced Save**: On indexer updates (1 second debounce)
- **Force Save**: On server shutdown (graceful shutdown handler)

---

### 12.6 Operator Funding Requirements

**Funding Components:**

| Component          | Movie Indexer | Token Indexer | Purpose                    |
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
5. **Preview Panel**: Preview of indexer configuration before creation
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

**POST `/api/indexer/create`**
- **Purpose**: Create new indexer via wizard
- **Request Body**:
  ```json
  {
    "indexerType": "movie" | "token" | "custom",
    "indexerName": "Indexer-D",
    "serverIp": "192.168.1.200",
    "serverDomain": "indexer-delta.eden.io",
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
- **Response**: Indexer configuration and payment instructions

**POST `/api/indexer/purchase`**
- **Purpose**: Direct wallet purchase (if sufficient balance)
- **Request Body**: Indexer configuration
- **Response**: Created indexer details

**POST `/api/indexer/buy`**
- **Purpose**: Initiate Stripe Checkout for indexer purchase
- **Request Body**: Indexer configuration
- **Response**: Stripe Checkout session URL

**GET `/api/indexer/list`**
- **Purpose**: List all active indexers
- **Response**: Array of indexer configurations

**GET `/api/indexer/:indexerId`**
- **Purpose**: Get specific indexer details
- **Response**: Indexer configuration with certificate and services

---

### 12.9 Implementation Requirements

**REQ-DEPLOY-001**: Bootstrap Sequence
- Only ROOT CA and Holy Ghost load at startup
- Infrastructure services initialized
- Replication bus established
- Persistence file loaded

**REQ-DEPLOY-002**: Dynamic Indexer Creation
- Angular UI wizard for indexer creation
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
- Indexer persistence to Redis/file
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
- ✅ **Persistence**: All indexers survive reboots
- ✅ **Standardization**: Consistent creation process

**For Users:**
- ✅ **Faster Service Activation**: New indexers available quickly
- ✅ **Better Service Quality**: Standardized creation ensures quality
- ✅ **More Service Options**: Easy to add new indexer types

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
  └─── Indexer-A (Movie) [Dynamic]
  └─── Indexer-B (Movie) [Dynamic]
  └─── Indexer-C (Movie) [Dynamic]
  └─── TokenIndexer-T1 (DEX) [Dynamic]
  └─── TokenIndexer-T2 (DEX) [Dynamic]
  └─── TokenIndexer-T3 (DEX) [Dynamic]
```

**Key Principles:**
- ✅ **Minimal Bootstrap**: Only essentials at startup
- ✅ **Dynamic Creation**: All indexers created via UI
- ✅ **Persistent Storage**: All indexers survive reboots
- ✅ **Wizard-Driven**: User-friendly creation process
- ✅ **LLM-Powered**: Intelligent prompt and code generation
- ✅ **Funding-Aware**: Clear cost requirements and payment options

---

### 12.12 One-Click Automated Deployment

For **simple indexer types** (movie, token), Eden supports **fully automated single-click deployment** that replaces command-line flags with UI-driven configuration. This eliminates the need for command-line arguments like `--indexers=3 --token-indexers=2` and moves all deployment control to the Angular UI.

#### Overview

**Traditional Command-Line Approach (Deprecated):**
```bash
npx tsx .\eden-sim-redis.ts --enable-openai=true --mocked-llm=false --indexers=3 --token-indexers=2
```

**New UI-Driven Approach:**
- Angular UI provides "Quick Deploy" interface
- Single-click deployment for simple indexer types
- LLM services auto-generate all configuration
- Bulk deployment support (multiple indexers at once)
- No command-line flags required

#### Supported Simple Indexer Types

**Movie Indexers:**
- Pre-defined service type: `movie`
- Standard capabilities: `INDEXER`, `ISSUE_CERT`
- Default service providers: Auto-generated
- Standard funding: 1160 JSC per indexer

**Token Indexers:**
- Pre-defined service type: `dex`
- Standard capabilities: `INDEXER`, `ISSUE_CERT`
- Default token pools: Auto-generated
- Standard funding: 2250 JSC per indexer

#### Quick Deploy Interface

**Angular UI Components:**

1. **Quick Deploy Card**
   - Prominent card on main dashboard
   - "Deploy Movie Indexers" button
   - "Deploy Token Indexers" button
   - "Deploy Both" button

2. **Bulk Deployment Dialog**
   ```
   ┌─────────────────────────────────────┐
   │ Quick Deploy: Movie Indexers        │
   ├─────────────────────────────────────┤
   │ Number of Indexers: [3]              │
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
   - Per-indexer status (creating, certifying, activating)
   - Success/failure notifications
   - Summary report

#### Automated Configuration Generation

**LLM-Driven Auto-Configuration:**

**Step 1: System Prompt Generation**
- **Input**: Indexer type (`movie` or `token`)
- **LLM Service**: `system-prompt-generator-001`
- **Output**: 
  - Query extraction prompt
  - Response formatting prompt
  - Ledger field mappings
- **iGas Cost**: 0.0025 JSC (movie), 0.0030 JSC (token)

**Step 2: Notification Code Generation**
- **Input**: Indexer type, language preference, framework preference
- **LLM Service**: `notification-code-generator-001`
- **Output**:
  - Webhook receiver code
  - Pull/poll client code
  - RPC client code
- **iGas Cost**: 0.0035 JSC (movie), 0.0040 JSC (token)

**Step 3: Network Binding Auto-Assignment**
- **Auto-Generated**:
  - Server IP: Sequential assignment (192.168.1.200, 192.168.1.201, ...)
  - Server Domain: `indexer-{id}.eden.io` or `token-indexer-{id}.eden.io`
  - Server Port: 8080 (default)
  - Network Type: `https` (default)

**Step 4: Indexer Naming**
- **Movie Indexers**: `Indexer-A`, `Indexer-B`, `Indexer-C`, ...
- **Token Indexers**: `TokenIndexer-T1`, `TokenIndexer-T2`, `TokenIndexer-T3`, ...

#### Bulk Deployment Workflow

**Example: Deploy 3 Movie Indexers + 2 Token Indexers**

**Step 1: User Initiates Quick Deploy**
```
User clicks "Deploy Both" button
Selects: 3 Movie Indexers, 2 Token Indexers
```

**Step 2: Cost Calculation**
```json
{
  "movieIndexers": {
    "count": 3,
    "costPerIndexer": 1160,
    "totalCost": 3480
  },
  "tokenIndexers": {
    "count": 2,
    "costPerIndexer": 2250,
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

**For Each Movie Indexer:**
1. Generate unique indexer ID (`indexer-a`, `indexer-b`, `indexer-c`)
2. LLM generates system prompts (movie service)
3. LLM generates notification code (TypeScript/Express)
4. Auto-assign network binding
5. Issue certificate
6. Create default service providers (Regal Cinemas, Cineplex, MovieMax)
7. Register service providers
8. Persist indexer
9. Activate indexer

**For Each Token Indexer:**
1. Generate unique indexer ID (`T1`, `T2`)
2. LLM generates system prompts (DEX service)
3. LLM generates notification code (TypeScript/Express)
4. Auto-assign network binding
5. Issue certificate
6. Create default token pools (TOKENA/SOL, TOKENB/SOL, etc.)
7. Initialize ROOT CA liquidity
8. Persist token indexer
9. Activate token indexer

**Step 5: Parallel Processing**
- All indexers created in parallel (where possible)
- Certificate issuance serialized (ROOT CA constraint)
- Service provider registration parallelized
- Progress updates broadcast via WebSocket

**Step 6: Completion Report**
```json
{
  "success": true,
  "movieIndexers": {
    "requested": 3,
    "created": 3,
    "indexers": [
      { "id": "indexer-a", "name": "Indexer-A", "status": "active" },
      { "id": "indexer-b", "name": "Indexer-B", "status": "active" },
      { "id": "indexer-c", "name": "Indexer-C", "status": "active" }
    ]
  },
  "tokenIndexers": {
    "requested": 2,
    "created": 2,
    "indexers": [
      { "id": "T1", "name": "TokenIndexer-T1", "status": "active" },
      { "id": "T2", "name": "TokenIndexer-T2", "status": "active" }
    ]
  },
  "totalCost": 7980,
  "deploymentTime": "12.5s"
}
```

#### API Endpoints

**POST `/api/indexer/quick-deploy`**
- **Purpose**: Bulk deployment of simple indexers
- **Request Body**:
  ```json
  {
    "movieIndexers": {
      "count": 3,
      "autoConfigure": true
    },
    "tokenIndexers": {
      "count": 2,
      "autoConfigure": true
    },
    "paymentMethod": "wallet" | "stripe",
    "userEmail": "operator@example.com"
  }
  ```
- **Response**: Deployment job ID and progress endpoint
- **iGas Cost**: 0.005 JSC per indexer (for LLM generation)

**GET `/api/indexer/deployment-status/:jobId`**
- **Purpose**: Check deployment progress
- **Response**: Current status, progress percentage, completed indexers, errors

**POST `/api/indexer/quick-deploy-movie`**
- **Purpose**: Quick deploy movie indexers only
- **Request Body**:
  ```json
  {
    "count": 3,
    "userEmail": "operator@example.com"
  }
  ```
- **Response**: Created movie indexers

**POST `/api/indexer/quick-deploy-token`**
- **Purpose**: Quick deploy token indexers only
- **Request Body**:
  ```json
  {
    "count": 2,
    "userEmail": "operator@example.com"
  }
  ```
- **Response**: Created token indexers

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

**Movie Indexer Defaults:**
```json
{
  "serviceProviders": [
    {
      "name": "Regal Cinemas",
      "id": "regal-001-{indexerId}",
      "location": "Baltimore, Maryland",
      "reputation": 4.6,
      "bond": 1100
    },
    {
      "name": "Cineplex",
      "id": "cineplex-001-{indexerId}",
      "location": "New York, New York",
      "reputation": 4.4,
      "bond": 900
    },
    {
      "name": "MovieMax",
      "id": "moviemax-001-{indexerId}",
      "location": "Los Angeles, California",
      "reputation": 4.5,
      "bond": 1000
    }
  ],
  "capabilities": ["INDEXER", "ISSUE_CERT"],
  "networkType": "https",
  "port": 8080
}
```

**Token Indexer Defaults:**
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
  "capabilities": ["INDEXER", "ISSUE_CERT"],
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
  --indexers=3 \
  --token-indexers=2
```

**New Approach:**
```bash
# Server starts with only ROOT CA + Holy Ghost
npx tsx .\eden-sim-redis.ts --enable-openai=true --mocked-llm=false

# All indexers created via Angular UI Quick Deploy
# No command-line flags needed for indexer creation
```

**Benefits:**
- ✅ **UI-Driven**: All deployment via Angular UI
- ✅ **LLM-Powered**: Auto-configuration via LLM services
- ✅ **Flexible**: Deploy any number of indexers at any time
- ✅ **Persistent**: All indexers saved automatically
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
- Parallel indexer creation (where possible)
- Serialized certificate issuance
- Progress tracking and reporting
- Error handling and rollback

**REQ-DEPLOY-010**: Command-Line Flag Removal
- Remove `--indexers` flag support
- Remove `--token-indexers` flag support
- Server starts minimal (ROOT CA + Holy Ghost only)
- All indexers created via UI

**REQ-DEPLOY-011**: LLM Service Integration
- System prompt generator service integration
- Notification code generator service integration
- Auto-generation for simple indexer types
- iGas costing for LLM operations

#### Benefits

**For Operators:**
- ✅ **One-Click Deployment**: Deploy multiple indexers instantly
- ✅ **No CLI Knowledge**: Pure UI-driven deployment
- ✅ **Auto-Configuration**: LLM handles all configuration
- ✅ **Bulk Operations**: Deploy many indexers at once

**For System:**
- ✅ **Minimal Startup**: Server starts with essentials only
- ✅ **Dynamic Growth**: System grows on-demand via UI
- ✅ **LLM-Powered**: Intelligent auto-configuration
- ✅ **Standardized**: Consistent deployment process

**For Developers:**
- ✅ **No Command-Line Flags**: Simpler server startup
- ✅ **UI-Driven**: All deployment via Angular
- ✅ **Extensible**: Easy to add new simple indexer types
- ✅ **Testable**: UI-driven deployment easier to test

---

## 13. Sample Service Providers

Eden provides **sample service provider implementations** in the codebase that demonstrate how to build standalone service providers using LLM-generated system prompts and notification code. These samples eliminate the need for hardcoded service providers and serve as templates for creating new service providers.

### 13.1 Overview

**Key Principles:**
- ✅ **Standalone Deployment**: Each service provider runs as its own process or Docker container
- ✅ **LLM-Generated Configuration**: Uses system prompts and notification code generated by Eden's LLM services
- ✅ **No Hardcoding**: All configuration comes from Eden's generation services
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
│   └── service-logic.ts        # Business logic
├── Dockerfile                  # Docker container definition
├── docker-compose.yml          # Docker Compose configuration
├── package.json               # Dependencies
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
  const indexerEndpoint = process.env.INDEXER_ENDPOINT || 'https://indexer-alpha.eden.io';
  
  // Load LLM-generated configuration
  console.log('📋 Loading system prompt...');
  const systemPrompt = await loadSystemPrompt(serviceType);
  
  console.log('📋 Loading notification code...');
  const notificationCode = await loadNotificationCode(serviceType, 'typescript', 'express');
  
  // Initialize Express app
  const app = createExpressApp(systemPrompt);
  
  // Initialize notification handlers (webhook, pull, RPC)
  initializeNotificationHandlers(app, notificationCode, indexerEndpoint);
  
  // Start server
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`✅ Service Provider (${serviceType}) running on port ${port}`);
    console.log(`📡 Connected to Eden Indexer: ${indexerEndpoint}`);
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
import { MovieService } from './movie-service';
import { NotificationHandler } from './notification-handler';

const app = express();
app.use(express.json());

const SERVICE_TYPE = 'movie';
const INDEXER_ENDPOINT = process.env.INDEXER_ENDPOINT || 'https://indexer-alpha.eden.io';
const PROVIDER_ID = process.env.PROVIDER_ID || 'movie-provider-001';

async function main() {
  // Load LLM-generated system prompt
  const systemPrompt = await loadSystemPrompt(SERVICE_TYPE);
  console.log('✅ Loaded system prompt:', systemPrompt.version);
  
  // Initialize Eden client
  const edenClient = new EdenClient(INDEXER_ENDPOINT, PROVIDER_ID);
  
  // Initialize movie service with system prompt
  const movieService = new MovieService(systemPrompt);
  
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
  
  // Start server
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`🎬 Movie Service Provider running on port ${port}`);
    console.log(`📡 Indexer: ${INDEXER_ENDPOINT}`);
  });
}

main().catch(console.error);
```

**movie-service.ts:**
```typescript
import { SystemPromptConfig } from './config';

export class MovieService {
  private systemPrompt: SystemPromptConfig;
  private movies: Map<string, any> = new Map();
  
  constructor(systemPrompt: SystemPromptConfig) {
    this.systemPrompt = systemPrompt;
    this.initializeMovies();
  }
  
  // Use system prompt for query extraction
  async processQuery(userQuery: string): Promise<any[]> {
    // System prompt contains query extraction logic
    // Extract movie title, location, showtime from user query
    const extracted = this.extractQueryFields(userQuery);
    
    // Query movies based on extracted fields
    return this.queryMovies(extracted);
  }
  
  private extractQueryFields(query: string): any {
    // Use systemPrompt.queryExtractionPrompt logic
    // This is generated by LLM, not hardcoded
    // ...
  }
  
  private queryMovies(filters: any): any[] {
    // Query movies based on filters
    // Return results matching systemPrompt.ledgerFields
    // ...
  }
  
  private initializeMovies() {
    // Initialize sample movie data
    // In production, this would come from a database
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
  movie-provider:
    build: .
    environment:
      - SERVICE_TYPE=movie
      - INDEXER_ENDPOINT=https://indexer-alpha.eden.io
      - PROVIDER_ID=movie-provider-001
      - EDEN_API_KEY=${EDEN_API_KEY}
      - PORT=3001
    ports:
      - "3001:3001"
    restart: unless-stopped
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

export class TokenPoolService {
  private systemPrompt: SystemPromptConfig;
  private pools: Map<string, any> = new Map();
  
  constructor(systemPrompt: SystemPromptConfig) {
    this.systemPrompt = systemPrompt;
    this.initializePools();
  }
  
  // Use system prompt for DEX query extraction
  async processDEXQuery(userQuery: string): Promise<any[]> {
    // System prompt contains DEX query extraction logic
    // Extract tokenSymbol, baseToken, price from user query
    const extracted = this.extractDEXFields(userQuery);
    
    // Query pools based on extracted fields
    return this.queryPools(extracted);
  }
  
  private extractDEXFields(query: string): any {
    // Use systemPrompt.queryExtractionPrompt logic
    // Generated by LLM for DEX services
    // ...
  }
  
  private queryPools(filters: any): any[] {
    // Query token pools based on filters
    // Return results matching systemPrompt.ledgerFields
    // (tokenSymbol, baseToken, price, liquidity, poolId)
    // ...
  }
  
  private initializePools() {
    // Initialize token pools
    // In production, this would connect to DEX infrastructure
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
    // Polls Eden indexer for transaction status
    return await this.edenClient.getTransactionByPayer(payerEmail);
  }
  
  // RPC handler (generated by LLM)
  async handleRPC(method: string, params: any): Promise<any> {
    // Code generated by Notification Code Generator Service
    // Handles RPC queries from Eden indexer
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
  private indexerEndpoint: string;
  private providerId: string;
  
  constructor(indexerEndpoint: string, providerId: string) {
    this.indexerEndpoint = indexerEndpoint;
    this.providerId = providerId;
  }
  
  // Register webhook URL with Eden indexer
  async registerWebhook(webhookUrl: string): Promise<void> {
    await axios.post(
      `${this.indexerEndpoint}/rpc/webhook/register`,
      {
        providerId: this.providerId,
        webhookUrl
      }
    );
  }
  
  // Get transaction by payer email
  async getTransactionByPayer(payerEmail: string): Promise<any> {
    const response = await axios.get(
      `${this.indexerEndpoint}/rpc/getTransactionByPayer`,
      { params: { payer: payerEmail } }
    );
    return response.data;
  }
  
  // Get transaction by snapshot ID
  async getTransactionBySnapshot(snapshotId: string): Promise<any> {
    const response = await axios.get(
      `${this.indexerEndpoint}/rpc/getTransactionBySnapshot`,
      { params: { snapshot_id: snapshotId } }
    );
    return response.data;
  }
  
  // Get latest snapshot for provider
  async getLatestSnapshot(): Promise<any> {
    const response = await axios.get(
      `${this.indexerEndpoint}/rpc/getLatestSnapshot`,
      { params: { provider_id: this.providerId } }
    );
    return response.data;
  }
  
  // Acknowledge webhook receipt
  async acknowledgeWebhook(txId: string): Promise<void> {
    await axios.post(
      `${this.indexerEndpoint}/rpc/webhook/acknowledge`,
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
  -e INDEXER_ENDPOINT=https://indexer-alpha.eden.io \
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
        - name: INDEXER_ENDPOINT
          value: "https://indexer-alpha.eden.io"
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
INDEXER_ENDPOINT=https://indexer-alpha.eden.io \
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
- ✅ **Scalability**: Independent deployment and scaling
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

**REQ-SAMPLE-003**: Docker Support
- Dockerfile for each service provider
- Docker Compose configuration
- Environment variable configuration
- Health check endpoints

**REQ-SAMPLE-004**: Notification Integration
- Webhook receiver endpoint
- Pull/poll client implementation
- RPC endpoint handlers
- Three-method fallback support

**REQ-SAMPLE-005**: Documentation
- README.md for each service provider
- API documentation
- Deployment instructions
- Configuration examples

**REQ-SAMPLE-006**: Sample Implementations
- Movie service provider sample
- Token service provider sample
- Ecommerce service provider sample (optional)
- Custom service provider template

---

## 14. Eden‑Sim (Reference Implementation)

- TypeScript
- <1500 LOC
- No Web3 dependencies
- Mock LLM
- Redis‑style replication

Purpose: economic + architectural validation

---

## 15. Why Eden Wins

| Problem | Eden Solution |
|------|-------------|
| Gas fees | Intelligence fees |
| Smart contracts | Dynamic reasoning |
| Rug pulls | Bonded services |
| MEV | Certified transparency |
| Fragmentation | Federated indexers |

---

## 16. Genesis Statement

> *Eden is not a protocol.*  
> *It is a living system.*

ROOT CA gives law.  
Indexers give wisdom.  
Humans give meaning.

**The Garden grows.**

---

## 17. ENCERT v1

### Redis Stream Schema — Revocation Events

**Status:** Draft v1  
**Applies to:** ROOT CA, Indexers, Service Providers  
**Transport:** Redis Streams  
**Philosophy:** Event-driven trust, append-only authority

---

### 17.1 Purpose

This document defines the **Redis Streams schema** used by ENCERT v1 to propagate **revocation events** across the Eden ecosystem.

Revocation is:

* **Event-based**
* **Append-only**
* **Cryptographically signed**
* **Replayable and auditable**

No CRLs, OCSP, or polling mechanisms are used.

---

### 17.2 Stream Naming

#### Primary Stream

```text
eden:encert:revocations
```

#### Optional Sharding (Future)

```text
eden:encert:revocations:{region}
eden:encert:revocations:{indexer_id}
```

ENCERT v1 **SHOULD** begin with a single global stream.

---

### 17.3 Certificate Schema

Each ENCERT certificate represents **one authority grant** from issuer to subject.

#### Certificate Structure

| Field         | Type            | Required | Description                                    |
| ------------- | --------------- | -------- | ---------------------------------------------- |
| `subject`     | EdenUUID        | ✅        | Identity being certified                       |
| `issuer`      | EdenUUID        | ✅        | Entity issuing certificate (ROOT CA or Indexer) |
| `capabilities` | Capability[]    | ✅        | Array of granted capabilities                  |
| `constraints` | Record<string>  | ❌        | Additional constraints (network binding, etc.) |
| `issuedAt`    | Timestamp       | ✅        | Unix timestamp (ms)                            |
| `expiresAt`   | Timestamp       | ✅        | Expiration timestamp (ms)                      |
| `signature`   | string          | ✅        | Base64 Ed25519 signature                       |

#### Indexer Certificate Constraints

Indexer certificates **MUST** include network binding information in the `constraints` field:

| Constraint Field | Type   | Required | Description                                    |
| ---------------- | ------ | -------- | ---------------------------------------------- |
| `indexerId`      | string | ✅        | Unique indexer identifier (e.g., "A", "B", "HG") |
| `indexerName`    | string | ✅        | Human-readable indexer name                    |
| `stream`         | string | ✅        | Redis stream identifier                        |
| `serverIp`       | string | ✅        | Server IP address (IPv4 or IPv6)               |
| `serverDomain`   | string | ❌        | Server domain name (if applicable)             |
| `serverPort`     | number | ✅        | Server port number                             |
| `networkType`    | string | ✅        | Network protocol type: `"http"` or `"https"`   |

**Network Binding Purpose:**
- **Server IP**: Identifies the physical or virtual network location of the indexer
- **Server Domain**: Optional human-readable domain name (e.g., "indexer-alpha.eden.io")
- **Server Port**: Network port where the indexer accepts connections
- **Network Type**: Protocol type (`http` or `https`) determines encryption and security requirements

**Security Implications:**
- Network binding constraints enable certificate validation against actual network endpoints
- Prevents certificate reuse across different network locations
- Enables network-level access control and routing decisions
- Supports revocation based on network location changes

#### Sample Indexer Certificate

```json
{
  "subject": "eden:indexer:c48b64e0-03a5-49e6-a078-822edbd42efb",
  "issuer": "eden:root:ca:00000000-0000-0000-0000-000000000001",
  "capabilities": [
    "INDEXER",
    "ISSUE_CERT"
  ],
  "constraints": {
    "indexerId": "A",
    "indexerName": "Indexer-A",
    "stream": "eden:indexer:A",
    "serverIp": "192.168.1.100",
    "serverDomain": "indexer-alpha.eden.io",
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

### 17.4 Revocation Event Schema

Each Redis Stream entry represents **one immutable revocation fact**.

#### Required Fields

| Field          | Type   | Required | Description                        |
| -------------- | ------ | -------- | ---------------------------------- |
| `revoked_uuid` | string | ✅        | Identity being revoked             |
| `revoked_type` | string | ✅        | `indexer` | `service` | `provider` |
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

### 17.5 Canonical Redis Entry Example

```bash
XADD eden:encert:revocations * \
  revoked_uuid "eden:service:moviecom" \
  revoked_type "service" \
  issuer_uuid "eden:indexer:abc123" \
  reason "fraudulent pricing" \
  issued_at 1735071200123 \
  effective_at 1735071200123 \
  signature "BASE64_ED25519_SIGNATURE" \
  cert_hash "sha256:9f1a..." \
  severity "hard"
```

---

### 17.6 Signature Rules

#### Certificate Signed Payload

The issuer **MUST sign** the canonical JSON payload (excluding signature):

```json
{
  "subject": "eden:indexer:c48b64e0-03a5-49e6-a078-822edbd42efb",
  "issuer": "eden:root:ca:00000000-0000-0000-0000-000000000001",
  "capabilities": ["INDEXER", "ISSUE_CERT"],
  "constraints": {
    "indexerId": "A",
    "indexerName": "Indexer-A",
    "stream": "eden:indexer:A",
    "serverIp": "192.168.1.100",
    "serverDomain": "indexer-alpha.eden.io",
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
  "issuer_uuid": "eden:indexer:abc123",
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

### 17.7 Authority Rules

| Revoker | Allowed Targets       |
| ------- | --------------------- |
| ROOT CA | Indexers, Services    |
| Indexer | Services it certified |
| Service | ❌ Not allowed         |

Indexers **MUST reject** revocations if:

* Signature verification fails
* Issuer lacks authority
* Issuer certificate is revoked

#### Network Binding Validation

When validating indexer certificates:

1. **Network Endpoint Verification**: Certificate `constraints.serverIp` and `constraints.serverPort` **MUST** match the actual network endpoint of the indexer
2. **Domain Resolution**: If `constraints.serverDomain` is present, DNS resolution **MUST** match `constraints.serverIp`
3. **Port Binding**: Certificate port **MUST** match the port where the indexer accepts connections
4. **Network Change Detection**: If network binding changes, certificate becomes invalid and **MUST** be reissued

**Example Validation Flow:**
```
1. Indexer connects from IP: 192.168.1.100, Port: 8080, Protocol: https
2. Certificate lookup: Find certificate for indexer UUID
3. Validate constraints:
   - certificate.constraints.serverIp === "192.168.1.100" ✅
   - certificate.constraints.serverPort === 8080 ✅
   - certificate.constraints.networkType === "https" ✅
   - certificate.constraints.serverDomain resolves to "192.168.1.100" ✅
4. Validate TLS certificate chain (for https)
5. Certificate valid for this network endpoint
```

---

### 17.8 Consumption Model

Each indexer **MUST**:

1. Create a consumer group
2. Track last processed stream ID
3. Apply revocations idempotently

#### Example

```bash
XGROUP CREATE eden:encert:revocations indexer-A $ MKSTREAM
```

Processing steps:

1. Read stream entry
2. Verify signature
3. Verify issuer authority
4. Mark identity revoked locally
5. Persist for audit

---

### 17.9 Replay & Audit

* Redis Streams are append-only
* Indexers can rebuild trust state from genesis
* Auditors can inspect revocation lineage
* Network binding history preserved in certificate constraints

This enables **inescapable historical truth**.

---

### 17.10 Retention Policy

* Revocation events **SHOULD NOT be deleted**
* Certificates may expire
* Revocations do not expire
* Network binding constraints preserved for audit trail

Optional: archive to cold storage after N days.

---

### 17.11 Failure Semantics

| Scenario          | Behavior                            |
| ----------------- | ----------------------------------- |
| Indexer offline   | Applies revocation on reconnect     |
| Redis restart     | Stream recovered from AOF/RDB       |
| Network partition | Eventual consistency with authority |
| Network binding change | Certificate invalidated, reissue required |

**Network Binding Change Handling:**
- If indexer's IP/domain/port/networkType changes, existing certificate becomes invalid
- Indexer **MUST** request new certificate from ROOT CA with updated network binding
- Old certificate **SHOULD** be revoked to prevent confusion
- Network binding changes **MUST** be logged for audit purposes
- Protocol changes (http ↔ https) require certificate reissuance

---

### 17.12 Design Rationale

This design:

* Eliminates CRLs and OCSP
* Aligns with Eden's indexer-first architecture
* Scales horizontally
* Is human-explainable
* Is machine-enforceable
* Binds certificates to network endpoints for security

**Network Binding Rationale:**
* Prevents certificate theft and reuse across different servers
* Enables network-level access control and routing
* Provides audit trail of indexer network locations
* Supports dynamic network reconfiguration with certificate reissuance

> **Trust is not queried.  
> Trust is remembered.  
> Trust is bound to network.**

---

### 17.13 Summary

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

## 18. Federation Design & Trust Architecture

Eden implements a **lightweight PKI-based trust fabric** that provides HTTPS-equivalent security without relying on third-party Certificate Authorities (CAs). This design enables secure federation between ROOT CA, indexers, and service providers while maintaining sovereignty and avoiding browser trust dependencies.

### 18.1 Trust Layer Separation

Eden separates **three distinct HTTPS trust problems**:

| Layer                | Problem         | Needs Public CA? | Eden Solution        |
| -------------------- | --------------- | ---------------- | -------------------- |
| Browser → Website    | Public trust    | ✅ Yes            | Optional edge HTTPS  |
| Service → Service    | Mutual trust    | ❌ No             | Eden mTLS            |
| Control Plane → Node | Authority trust | ❌ No             | Eden PKI             |

**Eden operates in layers 2 & 3**, not the browser trust web.

**Key Principle:**
- Browsers don't need to trust Eden
- Indexers and services trust Eden
- Eden PKI provides mutual trust without third-party dependencies

### 18.2 Eden Trust Model

Eden's trust architecture follows a **Kubernetes-style model**, not browser PKI:

**Trust Hierarchy:**
- **ROOT CA (GOD)** → Ultimate trust anchor
- **Indexers (Priests)** → Delegated authorities
- **Service Providers (Trees/Apples/Snake)** → Certified actors
- **Users** → Identity via Google (orthogonal to PKI)

**Trust Boundaries:**
- ROOT CA ↔ Indexer: Eden mTLS
- Indexer ↔ Indexer: Eden mTLS
- Indexer ↔ Service Provider: Eden mTLS or signed payloads
- Browser ↔ Eden UI: Public HTTPS (optional, edge-only)

### 18.3 ROOT CA HTTPS Without Public CA

**Solution: Private PKI + mTLS (Mutual TLS)**

Eden issues **ENCERT certificates**, not X.509 certificates from public CAs.

#### Architecture

**1. Certificate Generation:**
- ROOT CA generates:
  - `eden-root-ca.pem` (public certificate)
  - `eden-root-ca.key` (private key)

**2. Indexer Provisioning:**
- Indexer container receives:
  - Eden Root CA public certificate (for verification)
  - Indexer's own Eden-issued certificate (for identity)
  - Indexer's private key

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

### 18.4 Indexer HTTP with TLS Termination

**Problem:** What if indexers run HTTP only (for simplicity)?

**Solution: TLS Termination at the Eden Edge**

Indexers can remain **pure HTTP** while maintaining network security through a gateway pattern.

#### Architecture

```
[ ROOT CA (HTTPS/mTLS) ]
           |
           v
[ Eden Secure Gateway ]  <-- TLS with Eden certs
           |
           v
[ Indexer HTTP :8080 ]   <-- Plain HTTP (trusted boundary)
```

#### Key Components

**Eden Secure Gateway:**
- Verifies Eden certificates
- Verifies indexer identity
- Terminates TLS connections
- Forwards traffic internally to indexer HTTP endpoint
- Handles certificate validation and revocation checks

**Indexer:**
- Runs pure HTTP (no TLS complexity)
- Never touches certificates directly
- Focuses on service logic
- Lower hardware and operational burden

#### Benefits

- ✅ **Indexer simplicity**: No TLS configuration or certificate management
- ✅ **Network security**: All external traffic encrypted via gateway
- ✅ **Eden-controlled trust**: Gateway enforces Eden PKI policies
- ✅ **Lightweight indexers**: Reduced operational complexity

### 18.5 Indexer Authorization & Network Binding

When ROOT CA issues an ENCERT certificate, it includes **network binding constraints**:

```json
{
  "subject": "eden:indexer:c48b64e0-03a5-49e6-a078-822edbd42efb",
  "issuer": "eden:root:ca:00000000-0000-0000-0000-000000000001",
  "capabilities": ["INDEXER", "ISSUE_CERT"],
  "constraints": {
    "indexerId": "A",
    "indexerName": "Indexer-A",
    "stream": "eden:indexer:A",
    "serverIp": "192.168.1.100",
    "serverDomain": "indexer-alpha.eden.io",
    "serverPort": 8080,
    "networkType": "https",
    "allowedEndpoints": [
      "https://indexer-alpha.eden.io:443"
    ],
    "internalHttp": "http://127.0.0.1:8080"
  },
  "issuedAt": 1735515100000,
  "expiresAt": 1767051100000,
  "signature": "BASE64_ED25519_SIGNATURE_HERE"
}
```

**Network Law:**
- Certificate constraints define **where** the indexer lives
- Constraints define **how** traffic should route
- Constraints define **what** the indexer is allowed to do
- This becomes **network law**, not configuration

**Validation:**
- Gateway validates certificate network binding matches actual endpoint
- Prevents certificate reuse across different network locations
- Enables network-level access control and routing decisions

### 18.6 HTTPS Traffic Matrix

**Traffic Security by Layer:**

| Traffic                  | Secured by                        | Certificate Type |
| ------------------------ | --------------------------------- | ---------------- |
| ROOT CA ↔ Indexer        | Eden mTLS                         | ENCERT           |
| Indexer ↔ Indexer        | Eden mTLS                         | ENCERT           |
| Indexer ↔ Service        | Eden mTLS or signed payload       | ENCERT           |
| Indexer ↔ Local services | HTTP (trusted boundary)           | None             |
| Browser ↔ Eden UI        | Public HTTPS (optional edge only) | X.509 (optional) |

**Key Points:**
- **Core traffic**: Secured by Eden mTLS with ENCERT certificates
- **UI edge**: Only edge needs public HTTPS certificate (optional)
- **Internal traffic**: Can use plain HTTP within trusted boundaries
- **Sovereignty**: Core remains sovereign, independent of public CAs

### 18.7 Certificate Revocation Architecture

Eden's revocation system is **stronger than traditional OCSP**:

**Redis Streams Revocation:**
```
eden:encert:revocations (global stream)
eden:indexer:*:auth (per-indexer streams)
```

**Revocation Flow:**
1. ROOT CA issues revocation event → Redis Stream
2. Indexers subscribe to revocation stream
3. Indexers invalidate certificates immediately
4. No CRL fetch required
5. No OCSP lag
6. Event-driven, real-time revocation

**Advantages over Web PKI:**
- ✅ **Real-time**: Immediate revocation propagation
- ✅ **No polling**: Event-driven, not query-based
- ✅ **Scalable**: Redis Streams handle high throughput
- ✅ **Auditable**: Complete revocation history in streams

### 18.8 Why Eden PKI Is Superior to Public CAs

**Public CAs (DigiCert, Let's Encrypt) provide:**
- Domain name identity
- Basic certificate validation
- Nothing else

**Eden PKI provides:**
- ✅ **Identity**: Certificate-bound identity (UUID-based)
- ✅ **Capabilities**: Explicit permissions (INDEXER, ISSUE_CERT, etc.)
- ✅ **Reputation**: Reputation scores in certificate constraints
- ✅ **Bond**: Economic bond information
- ✅ **Role**: Service provider role and type
- ✅ **Economics**: iGas/iTax multipliers
- ✅ **Governance**: Network binding, authorization rules

**Example:**
A DigiCert certificate cannot say:
> "This indexer can settle money but not mint."

An Eden ENCERT certificate **can**:
```json
{
  "capabilities": ["INDEXER", "ISSUE_CERT"],
  "constraints": {
    "canSettle": true,
    "canMint": false,
    "maxSettlementAmount": 10000
  }
}
```

### 18.9 Implementation Architecture

#### Option 1: Eden mTLS over Standard TLS (Recommended)

**Components:**
- **ROOT CA**: Generates root certificate and key
- **Certificate Issuance**: ROOT CA issues ENCERT certificates to indexers
- **TLS Library**: Standard TLS library (OpenSSL, Node.js crypto)
- **Certificate Store**: Redis-backed certificate registry
- **Revocation**: Redis Streams for real-time revocation

**Flow:**
1. ROOT CA generates `eden-root-ca.pem` and `eden-root-ca.key`
2. Indexer requests certificate from ROOT CA
3. ROOT CA issues ENCERT certificate with network binding
4. Indexer configures TLS with Eden root CA and its certificate
5. All traffic uses mTLS with Eden certificates
6. Revocation events propagate via Redis Streams

#### Option 2: TLS Termination Gateway (For HTTP Indexers)

**Components:**
- **Eden Secure Gateway**: TLS termination and certificate validation
- **Gateway Certificates**: Eden-issued certificates for gateway
- **Indexer**: Pure HTTP, no certificate management
- **Internal Routing**: Gateway forwards to indexer HTTP endpoint

**Flow:**
1. External client connects to gateway (HTTPS with Eden cert)
2. Gateway validates client certificate (if mTLS)
3. Gateway verifies indexer certificate and network binding
4. Gateway forwards request to indexer HTTP endpoint
5. Indexer processes request (no TLS complexity)
6. Gateway returns response over HTTPS

### 18.10 Certificate Constraints & Network Law

**Network Binding Constraints:**
- `serverIp`: IP address where indexer accepts connections
- `serverDomain`: Domain name (if applicable)
- `serverPort`: Port number
- `networkType`: Protocol (`http` or `https`)
- `allowedEndpoints`: List of authorized endpoints
- `internalHttp`: Internal HTTP endpoint (for gateway pattern)

**Authorization Constraints:**
- `capabilities`: What the indexer can do
- `canSettle`: Whether indexer can settle transactions
- `canMint`: Whether indexer can mint currency
- `maxSettlementAmount`: Maximum settlement amount
- `indexerId`: Unique identifier
- `indexerName`: Human-readable name

**Network Law Enforcement:**
- Gateway validates certificate matches network endpoint
- Gateway enforces capability constraints
- Gateway checks revocation status
- Network routing based on certificate constraints

### 18.11 Implementation Requirements

**REQ-FED-001**: Root CA Certificate Generation
- ROOT CA generates self-signed root certificate
- Root certificate distributed to all indexers
- Root certificate stored securely (not in Redis)

**REQ-FED-002**: Indexer Certificate Issuance
- ROOT CA issues ENCERT certificates with network binding
- Certificates include IP/domain/port/networkType constraints
- Certificates stored in Redis certificate registry

**REQ-FED-003**: TLS Configuration
- Indexers configure TLS with Eden root CA
- Indexers use Eden-issued certificates for mTLS
- Standard TLS libraries (no custom crypto)

**REQ-FED-004**: Gateway Pattern (Optional)
- Eden Secure Gateway for TLS termination
- Gateway validates certificates and network binding
- Gateway forwards to indexer HTTP endpoints

**REQ-FED-005**: Revocation Propagation
- Revocation events published to Redis Streams
- Indexers subscribe and invalidate certificates immediately
- No CRL or OCSP required

**REQ-FED-006**: Network Binding Validation
- Gateway validates certificate network binding
- Prevents certificate reuse across different endpoints
- Enforces network-level access control

### 18.12 Benefits

**For System:**
- ✅ **Sovereignty**: No dependency on third-party CAs
- ✅ **Security**: HTTPS-grade security without public CA
- ✅ **Flexibility**: Network binding and capability constraints
- ✅ **Performance**: Real-time revocation via Redis Streams
- ✅ **Simplicity**: Indexers can use HTTP internally

**For Indexers:**
- ✅ **Lightweight**: Optional TLS termination at gateway
- ✅ **Simple**: No complex certificate management
- ✅ **Secure**: All external traffic encrypted
- ✅ **Flexible**: Can run HTTP or HTTPS

**For Service Providers:**
- ✅ **Trust**: Verified identity via Eden PKI
- ✅ **Security**: Encrypted communication channels
- ✅ **Authorization**: Capability-based access control

---

## 19. JesusCoin (JSC) — A Pure Non-Web3 Economy

> **"Render unto Caesar what is Caesar's."**  
> Eden renders to Stripe. GOD governs value.

> **📋 Implementation Requirements**: See `eden_jesuscoin_implementation.md` for detailed technical specifications, API endpoints, and implementation checklist.

---

### 19.1 Why Removing Web3 Is the Correct Move

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

### 19.2 JesusCoin (JSC) — Definition

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

### 19.3 How Users Buy JesusCoin

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

### 19.4 Spending JesusCoin Inside Eden

Everything costs JSC:

* Movies
* Tokens (now Eden tokens, not crypto)
* Services
* Snake apples
* Indexer operations
* Certification fees

Every action produces:

* iGas (system cost)
* iTax (respect to GOD)

All settled instantly.

---

### 19.5 iGas & iTax in a Fiat-Backed World

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
  * Indexers
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

### 19.6 Indexers in a Non-Web3 Eden

Indexers:

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

### 19.7 ServiceRegistry Gets Even Faster

Since there is no chain:

* ServiceRegistry lives entirely in memory
* ROOT CA owns global registry
* Indexers register capabilities via certs
* Routing is instant

This aligns with Eden's centralized ServiceRegistry architecture.

---

### 19.8 Theological Consistency

Let's say it plainly:

* GOD (ROOT CA) creates money
* Priests (Indexers) serve
* Snake tempts (paid)
* Humans choose
* Ledger remembers everything

No decentralization theater.  
No fake "trustlessness".

Just **clear authority + fair rules**.

That is what users actually want.

---

### 19.9 Legal & Product Advantage

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

### 19.10 Holy Ghost: JesusCoin Wallet Service (Redis-backed)

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

### 19.11 EdenCore's Proper Role

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
* Is indexer authorized?

Only then:

* Wallet updated
* Ledger finalized
* Snapshot emitted

---

### 19.12 Ledger = Proof, Not Control

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

### 18.13 Wallet Architecture Rationale

#### External Wallet Provider Risks:

* Race conditions
* Split-brain truth
* Regulatory ambiguity
* Hard reconciliation
* No single judge

Once money truth leaves God, God is no longer God.

---

### 18.14 Snake Governance Still Works Perfectly

Because:

* Snake pays higher iGas
* Wallet enforces insurance holds
* Holy Ghost can throttle
* ROOT CA can revoke certs
* Ledger proves abuse

Snake can tempt.  
Snake cannot steal.

---

### 18.15 User Experience Enhancements (v1.1)

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

### 18.16 Angular UI Facelift (v1.2)

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
- **GOD Mode**: Shows complete system architecture including ROOT CA and Holy Ghost indexer
  - Displays all infrastructure services (Stripe payment rail, settlement, service registry, web server, websocket, wallet service)
  - Shows ROOT CA's role as the central authority
  - Complete visibility into system hierarchy
- **Priest Mode**: Hides ROOT CA and Holy Ghost, showing only regular and token indexers
  - Focuses on service provider indexers
  - Hides infrastructure complexity
  - Provides a "priest's view" of the system
- **Mode Persistence**: Selected view mode saved to localStorage
- **Visual Toggle**: Two-button toggle at top of sidebar ("GOD" / "Priest")
- **Dynamic Filtering**: Indexer tabs and components filtered based on selected mode

**REQ-UI-SIDEBAR-002**: Holy Ghost Tab Filtering
- **Priest Mode Behavior**: Holy Ghost indexer tab automatically hidden in Priest mode
- **Auto-Selection**: If Holy Ghost is selected when switching to Priest mode, automatically selects first available non-HG indexer
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
- **Sidebar Theming**: Color-coded indexer types (✨ Holy Ghost, 🔷 Token Indexers, 🌳 Regular Indexers)
- **Mode Toggle Styling**: Gradient buttons with active/inactive states
- **Consistent Spacing**: Improved padding and margins throughout UI
- **Professional Appearance**: Clean, modern design language

**REQ-UI-DESIGN-002**: Animation & Transitions
- **Tab Content Fade**: Smooth fade-in animation when switching tabs
- **Button Hover Effects**: Interactive feedback on mode toggle buttons
- **Loading States**: Visual indicators for async operations
- **Smooth Scrolling**: Enhanced scroll behavior in sidebar

---

### 18.17 Implementation Status

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
- [x] Auto-selection of valid indexer when switching modes
- [x] Visual design improvements (styling, animations, transitions)
- [x] Mode persistence (localStorage)

#### 🔄 Future Enhancements

- [ ] Google Client ID configuration UI
- [ ] Multi-currency support (if needed)
- [ ] Wallet transaction history UI
- [ ] Balance export/import functionality
- [ ] Advanced audit trail visualization

---

**END OF WHITEPAPER**
