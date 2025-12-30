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

- Docker‑only
- Low hardware requirements
- Horizontal scaling
- Stateless indexers

Each indexer = 1 Knowledge Tree

---

## 13. Eden‑Sim (Reference Implementation)

- TypeScript
- <1500 LOC
- No Web3 dependencies
- Mock LLM
- Redis‑style replication

Purpose: economic + architectural validation

---

## 14. Why Eden Wins

| Problem | Eden Solution |
|------|-------------|
| Gas fees | Intelligence fees |
| Smart contracts | Dynamic reasoning |
| Rug pulls | Bonded services |
| MEV | Certified transparency |
| Fragmentation | Federated indexers |

---

## 15. Genesis Statement

> *Eden is not a protocol.*  
> *It is a living system.*

ROOT CA gives law.  
Indexers give wisdom.  
Humans give meaning.

**The Garden grows.**

---

## 16. ENCERT v1

### Redis Stream Schema — Revocation Events

**Status:** Draft v1  
**Applies to:** ROOT CA, Indexers, Service Providers  
**Transport:** Redis Streams  
**Philosophy:** Event-driven trust, append-only authority

---

### 16.1 Purpose

This document defines the **Redis Streams schema** used by ENCERT v1 to propagate **revocation events** across the Eden ecosystem.

Revocation is:

* **Event-based**
* **Append-only**
* **Cryptographically signed**
* **Replayable and auditable**

No CRLs, OCSP, or polling mechanisms are used.

---

### 16.2 Stream Naming

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

### 16.3 Certificate Schema

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

### 16.4 Revocation Event Schema

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

### 16.5 Canonical Redis Entry Example

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

### 16.6 Signature Rules

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

### 16.7 Authority Rules

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

### 16.8 Consumption Model

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

### 16.9 Replay & Audit

* Redis Streams are append-only
* Indexers can rebuild trust state from genesis
* Auditors can inspect revocation lineage
* Network binding history preserved in certificate constraints

This enables **inescapable historical truth**.

---

### 16.10 Retention Policy

* Revocation events **SHOULD NOT be deleted**
* Certificates may expire
* Revocations do not expire
* Network binding constraints preserved for audit trail

Optional: archive to cold storage after N days.

---

### 16.11 Failure Semantics

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

### 16.12 Design Rationale

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

### 16.13 Summary

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

## 17. JesusCoin (JSC) — A Pure Non-Web3 Economy

> **"Render unto Caesar what is Caesar's."**  
> Eden renders to Stripe. GOD governs value.

> **📋 Implementation Requirements**: See `eden_jesuscoin_implementation.md` for detailed technical specifications, API endpoints, and implementation checklist.

---

### 17.1 Why Removing Web3 Is the Correct Move

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

### 17.2 JesusCoin (JSC) — Definition

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

### 17.3 How Users Buy JesusCoin

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

### 17.4 Spending JesusCoin Inside Eden

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

### 17.5 iGas & iTax in a Fiat-Backed World

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

### 17.6 Indexers in a Non-Web3 Eden

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

### 17.7 ServiceRegistry Gets Even Faster

Since there is no chain:

* ServiceRegistry lives entirely in memory
* ROOT CA owns global registry
* Indexers register capabilities via certs
* Routing is instant

This aligns with Eden's centralized ServiceRegistry architecture.

---

### 17.8 Theological Consistency

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

### 17.9 Legal & Product Advantage

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

### 17.10 Holy Ghost: JesusCoin Wallet Service (Redis-backed)

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

### 17.11 EdenCore's Proper Role

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

### 17.12 Ledger = Proof, Not Control

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

### 17.13 Wallet Architecture Rationale

#### External Wallet Provider Risks:

* Race conditions
* Split-brain truth
* Regulatory ambiguity
* Hard reconciliation
* No single judge

Once money truth leaves God, God is no longer God.

---

### 17.14 Snake Governance Still Works Perfectly

Because:

* Snake pays higher iGas
* Wallet enforces insurance holds
* Holy Ghost can throttle
* ROOT CA can revoke certs
* Ledger proves abuse

Snake can tempt.  
Snake cannot steal.

---

### 17.15 User Experience Enhancements (v1.1)

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

### 17.16 Angular UI Facelift (v1.2)

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

### 17.17 Implementation Status

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
