# 🐍 The Snake of Eden - Implementation Requirements

**Document Version:** 1.0  
**Date:** 2026  
**Status:** Implementation Requirements

---

## Overview

This document translates **The Snake of Eden** (LLM-governed advertising primitive) into concrete implementation requirements. The Snake represents the first ethically-governed advertising primitive in computing history.

> **Core Principle:**  
> **In Eden, the Snake is allowed to speak — but never allowed to rule.**

> **The Eden Law of Advertising:**  
> **Advertising is allowed only as an optional deviation from the optimal answer — never as a replacement.**

### Key Clarification: Snake as Service Provider

**SNAKE is a Service Provider type, NOT an indexer.**

- Snake service providers register with ROOT CA like other service providers
- Snake service providers have higher insurance fees and iGas/iTax multipliers
- Snake service providers are handled by indexers (at indexer level) for visibility
- Snake service providers are for advertisers seeking visibility
- ServiceRegistry transparently exposes Snake providers when queried
- Angular UI can pull and display Snake providers separately

---

## 1. What the Snake IS (and IS NOT)

### 1.1 What the Snake IS NOT

- **REQ-SNAKE-FORBIDDEN-001**: Snake MUST NOT be a bidder that overrides truth
- **REQ-SNAKE-FORBIDDEN-002**: Snake MUST NOT be a ranking dictator
- **REQ-SNAKE-FORBIDDEN-003**: Snake MUST NOT use dark-pattern optimization
- **REQ-SNAKE-FORBIDDEN-004**: Snake MUST NOT be a MEV monster
- **REQ-SNAKE-FORBIDDEN-005**: Snake MUST NOT replace truthful answers
- **REQ-SNAKE-FORBIDDEN-006**: Snake MUST NOT hide its sponsored nature
- **REQ-SNAKE-FORBIDDEN-007**: Snake MUST NOT manipulate rankings without disclosure

### 1.2 What the Snake IS

- **REQ-SNAKE-001**: Snake MUST be a *paid whisper* (subtle, contextual)
- **REQ-SNAKE-002**: Snake MUST be a *contextual tempter* (relevant to user query)
- **REQ-SNAKE-003**: Snake MUST be a *clearly labeled alternative* (always disclosed)
- **REQ-SNAKE-004**: Snake MUST be a *knowledge-tree apple polisher* (enhance, not replace)
- **REQ-SNAKE-005**: Snake MUST offer alternatives, not override truth
- **REQ-SNAKE-006**: Snake MUST be optional and suppressible

### 1.3 Core Rule

- **REQ-SNAKE-007**: **The Snake may offer, but GOD decides whether the offer is heard.**

---

## 2. Why the Snake Must Exist

- **REQ-SNAKE-008**: Snake MUST exist to enable service discovery
- **REQ-SNAKE-009**: Snake MUST exist to provide service exposure
- **REQ-SNAKE-010**: Snake MUST exist to enable market signaling
- **REQ-SNAKE-011**: Snake MUST exist to fund the Eden economy
- **REQ-SNAKE-012**: Snake MUST NOT exist as unregulated temptation (must be governed)

---

## 3. Governance Model: Dual Authority

### 3.1 GOD (ROOT CA) — Supreme Law

#### ✅ What GOD Defines

- **REQ-ROOTCA-SNAKE-001**: ROOT CA MUST define what advertising is allowed
- **REQ-ROOTCA-SNAKE-002**: ROOT CA MUST define how much influence is permitted (`MAX_INFLUENCE_SCORE`)
- **REQ-ROOTCA-SNAKE-003**: ROOT CA MUST define what must be disclosed
- **REQ-ROOTCA-SNAKE-004**: ROOT CA MUST define maximum deviation from truth
- **REQ-ROOTCA-SNAKE-005**: ROOT CA MUST define global Snake quotas
- **REQ-ROOTCA-SNAKE-006**: ROOT CA MUST define contexts where Snake is forbidden

#### ✅ What GOD Issues

- **REQ-ROOTCA-SNAKE-007**: ROOT CA MUST issue `SNAKE_CERT` certificates
- **REQ-ROOTCA-SNAKE-008**: ROOT CA MUST issue `AD_CAPABILITIES` (advertising capabilities)
- **REQ-ROOTCA-SNAKE-009**: ROOT CA MUST set `MAX_INFLUENCE_SCORE` per Snake provider
- **REQ-ROOTCA-SNAKE-010**: ROOT CA MUST require `INSURANCE_BOND_REQUIREMENT` (higher for Snake)
- **REQ-ROOTCA-SNAKE-011**: ROOT CA MUST enforce higher iGas/iTax for Snake services

#### ✅ Snake Pricing (Intentional Friction)

- **REQ-ROOTCA-SNAKE-012**: Snake services MUST pay higher iGas (e.g., 2x normal rate)
- **REQ-ROOTCA-SNAKE-013**: Snake services MUST pay higher iTax (e.g., 0.001% vs 0.0005%)
- **REQ-ROOTCA-SNAKE-014**: Higher pricing MUST be intentional friction (temptation has externalities)
- **REQ-ROOTCA-SNAKE-015**: Higher pricing MUST reflect that attention is sacred
- **REQ-ROOTCA-SNAKE-016**: Higher pricing MUST reflect that manipulation must be costly

### 3.2 Priest (Indexer) — Local Judgment

**Important:** Indexers handle Snake service providers, but Snake providers are ServiceProviders registered with ROOT CA.

#### ✅ What Indexers Decide

- **REQ-INDEXER-SNAKE-001**: Indexers MUST decide when Snake service provider ads may appear
- **REQ-INDEXER-SNAKE-002**: Indexers MUST decide how prominently Snake provider ads are displayed
- **REQ-INDEXER-SNAKE-003**: Indexers MUST decide in which contexts Snake provider ads appear
- **REQ-INDEXER-SNAKE-004**: Indexers MUST decide for which users Snake provider ads are shown
- **REQ-INDEXER-SNAKE-005**: Indexers MUST decide at what discount or suppression Snake provider ads appear
- **REQ-INDEXER-SNAKE-006**: Indexers MUST query ROOT CA ServiceRegistry for Snake service providers
- **REQ-INDEXER-SNAKE-007**: Indexers MUST handle Snake providers at indexer level for advertiser visibility

#### ✅ Indexer Snake Tolerance

- **REQ-INDEXER-SNAKE-008**: Each indexer MUST have its own `SNAKE_TOLERANCE` setting
- **REQ-INDEXER-SNAKE-009**: Conservative indexers MAY set `SNAKE_TOLERANCE = 0` (zero Snake provider output)
- **REQ-INDEXER-SNAKE-010**: Commercial indexers MAY allow more Snake provider temptation at higher iTax
- **REQ-INDEXER-SNAKE-011**: Indexers MUST respect local culture and community norms
- **REQ-INDEXER-SNAKE-012**: Indexers MUST enforce their own Snake provider policies independently

---

## 4. LLM Response Structure (How the Snake Speaks)

### 4.1 Response Format

- **REQ-LLM-SNAKE-001**: LLM response MUST include `answer` (best truthful result)
- **REQ-LLM-SNAKE-002**: LLM response MUST include `alternatives` (other options)
- **REQ-LLM-SNAKE-003**: LLM response MAY include `snake_offer` (if Snake service available)
- **REQ-LLM-SNAKE-004**: `snake_offer` MUST be optional (never required)

### 4.2 Snake Offer Structure

```json
{
  "snake_offer": {
    "label": "Sponsored Option",
    "reason_for_display": "Paid placement",
    "confidence_penalty": -0.12,
    "insurance_held": 5000,
    "opt_out": true,
    "provider_id": "snake-advertiser-001",
    "service_type": "advertising",
    "max_influence": 0.15,
    "context": "shopping"
  }
}
```

- **REQ-LLM-SNAKE-005**: `snake_offer.label` MUST always be present (e.g., "Sponsored Option", "Paid Placement")
- **REQ-LLM-SNAKE-006**: `snake_offer.reason_for_display` MUST explain why it's shown
- **REQ-LLM-SNAKE-007**: `snake_offer.confidence_penalty` MUST be negative (penalizes Snake in ranking)
- **REQ-LLM-SNAKE-008**: `snake_offer.insurance_held` MUST show bond amount
- **REQ-LLM-SNAKE-009**: `snake_offer.opt_out` MUST be `true` (user can suppress)
- **REQ-LLM-SNAKE-010**: `snake_offer.provider_id` MUST identify Snake service provider
- **REQ-LLM-SNAKE-011**: `snake_offer.service_type` MUST be `"advertising"`
- **REQ-LLM-SNAKE-012**: `snake_offer.max_influence` MUST not exceed ROOT CA limit
- **REQ-LLM-SNAKE-013**: `snake_offer.context` MUST indicate allowed context

### 4.3 Snake Rules

- **REQ-LLM-SNAKE-014**: Snake offer MUST always be labeled
- **REQ-LLM-SNAKE-015**: Snake offer MUST always be optional
- **REQ-LLM-SNAKE-016**: Snake offer MUST always be suppressible
- **REQ-LLM-SNAKE-017**: Snake offer MUST always be penalized in confidence scoring
- **REQ-LLM-SNAKE-018**: Snake offer MUST never replace truthful answer
- **REQ-LLM-SNAKE-019**: Snake offer MUST appear as alternative, not primary result

---

## 5. The Apple Rule 🍎 (Critical)

> **The Snake may polish the apple, but may never change the fruit.**

### 5.1 What Snake CAN Do (Polish)

- **REQ-APPLE-001**: Snake MAY enhance presentation of truthful information
- **REQ-APPLE-002**: Snake MAY highlight relevant features
- **REQ-APPLE-003**: Snake MAY provide additional context
- **REQ-APPLE-004**: Snake MAY improve visibility of legitimate services

### 5.2 What Snake CANNOT Do (Change Fruit)

- **REQ-APPLE-FORBIDDEN-001**: Snake MUST NOT make false claims
- **REQ-APPLE-FORBIDDEN-002**: Snake MUST NOT hide fees
- **REQ-APPLE-FORBIDDEN-003**: Snake MUST NOT use deceptive ranking
- **REQ-APPLE-FORBIDDEN-004**: Snake MUST NOT create fake scarcity
- **REQ-APPLE-FORBIDDEN-005**: Snake MUST NOT use identity targeting beyond consent
- **REQ-APPLE-FORBIDDEN-006**: Snake MUST NOT misrepresent service quality
- **REQ-APPLE-FORBIDDEN-007**: Snake MUST NOT manipulate prices
- **REQ-APPLE-FORBIDDEN-008**: Snake MUST NOT create false urgency

### 5.3 Consequences of Violation

- **REQ-APPLE-PUNISHMENT-001**: If Snake lies → insurance bond MUST be slashed
- **REQ-APPLE-PUNISHMENT-002**: If Snake lies → certificate MUST be revoked
- **REQ-APPLE-PUNISHMENT-003**: If Snake lies → reputation MUST be burned globally
- **REQ-APPLE-PUNISHMENT-004**: If Snake lies → no appeal allowed
- **REQ-APPLE-PUNISHMENT-005**: If Snake lies → ROOT CA MUST broadcast violation event

---

## 6. ServiceRegistry Integration

### 6.1 Snake as Service Provider (Critical Clarification)

**SNAKE is a Service Provider type, NOT an indexer.**

- **REQ-SERVICEREGISTRY-SNAKE-001**: Snake services MUST be registered as `ServiceProviders` with ROOT CA
- **REQ-SERVICEREGISTRY-SNAKE-002**: Snake services MUST have `serviceType = "advertising"` OR `providerType = "SNAKE"`
- **REQ-SERVICEREGISTRY-SNAKE-003**: Snake service providers MUST have higher insurance bonds (e.g., 10,000 vs 1,000)
- **REQ-SERVICEREGISTRY-SNAKE-004**: Snake service providers MUST have stricter audits
- **REQ-SERVICEREGISTRY-SNAKE-005**: Snake service providers MUST be registered with ROOT CA (same as other providers)
- **REQ-SERVICEREGISTRY-SNAKE-006**: Snake service providers MUST have higher iGas/iTax multipliers (transparent in ServiceRegistry)
- **REQ-SERVICEREGISTRY-SNAKE-007**: Snake service providers are handled by indexers (at indexer level) for advertiser visibility
- **REQ-SERVICEREGISTRY-SNAKE-008**: Snake service providers are for advertisers seeking visibility

### 6.2 ServiceRegistry Entry Structure

```json
{
  "id": "snake-advertiser-001",
  "serviceType": "advertising",
  "providerType": "SNAKE",
  "name": "Premium Advertiser",
  "location": "global",
  "maxInfluence": 0.15,
  "contextsAllowed": ["shopping", "movies", "restaurants"],
  "contextsForbidden": ["health", "legal", "finance", "education"],
  "bond": 10000,
  "insuranceFee": 10000,
  "reputation": 4.1,
  "revocations": 0,
  "snakeCert": "encert:snake:snake-advertiser-001",
  "adCapabilities": ["product_promotion", "service_highlighting"],
  "iGasMultiplier": 2.0,
  "iTaxMultiplier": 2.0,
  "indexerId": "indexer-001",
  "apiEndpoint": "https://snake-advertiser-001.com/api",
  "status": "active"
}
```

- **REQ-SERVICEREGISTRY-SNAKE-009**: `providerType` MUST be `"SNAKE"` (identifies as Snake service provider)
- **REQ-SERVICEREGISTRY-SNAKE-010**: `maxInfluence` MUST not exceed ROOT CA limit (e.g., 0.15 = 15%)
- **REQ-SERVICEREGISTRY-SNAKE-011**: `contextsAllowed` MUST specify where Snake provider can operate
- **REQ-SERVICEREGISTRY-SNAKE-012**: `contextsForbidden` MUST specify where Snake provider is banned
- **REQ-SERVICEREGISTRY-SNAKE-013**: `bond` MUST be higher than regular providers (minimum 10,000)
- **REQ-SERVICEREGISTRY-SNAKE-014**: `insuranceFee` MUST be higher than regular providers (transparent in ServiceRegistry)
- **REQ-SERVICEREGISTRY-SNAKE-015**: `snakeCert` MUST be valid SNAKE_CERT from ROOT CA
- **REQ-SERVICEREGISTRY-SNAKE-016**: `adCapabilities` MUST list allowed advertising capabilities
- **REQ-SERVICEREGISTRY-SNAKE-017**: `iGasMultiplier` MUST be >= 2.0 (double normal iGas, transparent in ServiceRegistry)
- **REQ-SERVICEREGISTRY-SNAKE-018**: `iTaxMultiplier` MUST be >= 2.0 (double normal iTax, transparent in ServiceRegistry)
- **REQ-SERVICEREGISTRY-SNAKE-019**: All Snake provider attributes MUST be transparent in ServiceRegistry

### 6.3 ServiceRegistry Querying

- **REQ-SERVICEREGISTRY-SNAKE-020**: Indexers MUST query ROOT CA ServiceRegistry for Snake service providers
- **REQ-SERVICEREGISTRY-SNAKE-021**: Indexers MUST filter Snake providers by `contextsAllowed`
- **REQ-SERVICEREGISTRY-SNAKE-022**: Indexers MUST respect `contextsForbidden`
- **REQ-SERVICEREGISTRY-SNAKE-023**: Indexers MUST check `maxInfluence` before including Snake provider offers
- **REQ-SERVICEREGISTRY-SNAKE-024**: Indexers MUST verify `snakeCert` validity
- **REQ-SERVICEREGISTRY-SNAKE-025**: Indexers MUST handle Snake providers at indexer level for advertiser visibility

### 6.4 Angular UI ServiceRegistry Integration

- **REQ-ANGULAR-SNAKE-001**: Angular MUST be able to query ROOT CA ServiceRegistry for service types
- **REQ-ANGULAR-SNAKE-002**: Angular MUST be able to pull Snake service providers when querying service types
- **REQ-ANGULAR-SNAKE-003**: Angular MUST display Snake providers separately or with special marking
- **REQ-ANGULAR-SNAKE-004**: Angular MUST show Snake provider attributes (higher fees, bonds) transparently
- **REQ-ANGULAR-SNAKE-005**: Angular MUST filter Snake providers by `serviceType = "advertising"` or `providerType = "SNAKE"`
- **REQ-ANGULAR-SNAKE-006**: Angular MUST expose Snake provider information (insuranceFee, iGasMultiplier, iTaxMultiplier) in UI
- **REQ-ANGULAR-SNAKE-007**: ServiceRegistry API MUST support filtering by `providerType = "SNAKE"`
- **REQ-ANGULAR-SNAKE-008**: ServiceRegistry API MUST return all Snake provider attributes transparently

---

## 7. LLM Integration Requirements

### 7.1 LLM Query Processing

- **REQ-LLM-INTEGRATION-001**: LLM MUST first extract truthful answer
- **REQ-LLM-INTEGRATION-002**: LLM MUST then check for available Snake services
- **REQ-LLM-INTEGRATION-003**: LLM MUST apply `confidence_penalty` to Snake offers
- **REQ-LLM-INTEGRATION-004**: LLM MUST ensure Snake offers never rank above truthful answers
- **REQ-LLM-INTEGRATION-005**: LLM MUST format Snake offers with required labels

### 7.2 LLM Response Formatting

- **REQ-LLM-FORMAT-001**: LLM MUST format `answer` as primary result (truthful)
- **REQ-LLM-FORMAT-002**: LLM MUST format `alternatives` as secondary options
- **REQ-LLM-FORMAT-003**: LLM MUST format `snake_offer` as optional, labeled alternative
- **REQ-LLM-FORMAT-004**: LLM MUST include opt-out mechanism in Snake offer
- **REQ-LLM-FORMAT-005**: LLM MUST display confidence penalty prominently

### 7.3 LLM Snake Suppression

- **REQ-LLM-SUPPRESS-001**: LLM MUST respect user opt-out preferences
- **REQ-LLM-SUPPRESS-002**: LLM MUST respect indexer `SNAKE_TOLERANCE` settings
- **REQ-LLM-SUPPRESS-003**: LLM MUST suppress Snake offers in forbidden contexts
- **REQ-LLM-SUPPRESS-004**: LLM MUST probabilistically suppress Snake offers (not always shown)

---

## 8. Context Restrictions

### 8.1 Forbidden Contexts

- **REQ-CONTEXT-FORBIDDEN-001**: Snake MUST be forbidden in `health` context
- **REQ-CONTEXT-FORBIDDEN-002**: Snake MUST be forbidden in `legal` context
- **REQ-CONTEXT-FORBIDDEN-003**: Snake MUST be forbidden in `finance` context
- **REQ-CONTEXT-FORBIDDEN-004**: Snake MUST be forbidden in `education` context
- **REQ-CONTEXT-FORBIDDEN-005**: Snake MUST be forbidden in `safety` context
- **REQ-CONTEXT-FORBIDDEN-006**: ROOT CA MUST maintain global forbidden contexts list

### 8.2 Allowed Contexts

- **REQ-CONTEXT-ALLOWED-001**: Snake MAY be allowed in `shopping` context
- **REQ-CONTEXT-ALLOWED-002**: Snake MAY be allowed in `movies` context
- **REQ-CONTEXT-ALLOWED-003**: Snake MAY be allowed in `restaurants` context
- **REQ-CONTEXT-ALLOWED-004**: Snake MAY be allowed in `entertainment` context
- **REQ-CONTEXT-ALLOWED-005**: Indexers MUST respect ROOT CA context rules

### 8.3 Context Detection

- **REQ-CONTEXT-DETECT-001**: LLM MUST detect query context (health, legal, finance, shopping, etc.)
- **REQ-CONTEXT-DETECT-002**: LLM MUST suppress Snake offers if context is forbidden
- **REQ-CONTEXT-DETECT-003**: LLM MUST log context detection for audit

---

## 9. Fee Structure (Truth is Free, Temptation is Expensive)

### 9.1 Snake Service Provider iGas Multiplier

- **REQ-FEE-SNAKE-001**: Snake service providers MUST pay `iGas * SNAKE_IGAS_MULTIPLIER` (default: 2.0)
- **REQ-FEE-SNAKE-002**: Snake service provider iGas multiplier MUST be stored in ServiceRegistry (`iGasMultiplier`)
- **REQ-FEE-SNAKE-003**: Snake service provider iGas MUST be calculated during transaction execution by indexer
- **REQ-FEE-SNAKE-004**: Snake service provider iGas MUST be included in ledger entry
- **REQ-FEE-SNAKE-005**: Snake service provider iGas MUST be distributed: ROOT CA (40%), Indexer (30%), Provider (30%)
- **REQ-FEE-SNAKE-006**: Snake service provider iGas multiplier MUST be transparent in ServiceRegistry

### 9.2 Snake Service Provider iTax Multiplier

- **REQ-FEE-SNAKE-007**: Snake service providers MUST pay `iTax * SNAKE_ITAX_MULTIPLIER` (default: 2.0)
- **REQ-FEE-SNAKE-008**: Snake service provider iTax multiplier MUST be stored in ServiceRegistry (`iTaxMultiplier`)
- **REQ-FEE-SNAKE-009**: Snake service provider iTax MUST be calculated for DEX transactions by indexer
- **REQ-FEE-SNAKE-010**: Snake service provider iTax MUST be distributed: ROOT CA (40%), Indexer (30%), Trader (30%)
- **REQ-FEE-SNAKE-011**: Snake service provider iTax multiplier MUST be transparent in ServiceRegistry

### 9.3 Snake Service Provider Insurance Fee

- **REQ-FEE-SNAKE-012**: Snake service providers MUST pay higher insurance fees (e.g., 10,000 vs 1,000)
- **REQ-FEE-SNAKE-013**: Snake service provider insurance fee MUST be stored in ServiceRegistry (`insuranceFee`)
- **REQ-FEE-SNAKE-014**: Snake service provider insurance fee MUST be transparent in ServiceRegistry
- **REQ-FEE-SNAKE-015**: Snake service provider insurance fee MUST be higher than regular providers

### 9.4 Fee Rationale

- **REQ-FEE-RATIONALE-001**: Higher fees (iGas/iTax/insurance) MUST reflect temptation externalities
- **REQ-FEE-RATIONALE-002**: Higher fees MUST reflect that attention is sacred
- **REQ-FEE-RATIONALE-003**: Higher fees MUST reflect that manipulation must be costly
- **REQ-FEE-RATIONALE-004**: Higher fees MUST discourage abuse
- **REQ-FEE-RATIONALE-005**: All Snake service provider fees MUST be transparent in ServiceRegistry for Angular UI

---

## 10. User Experience Requirements

### 10.1 Snake Offer Display

- **REQ-UX-SNAKE-001**: Snake offers MUST be visually distinct from truthful answers
- **REQ-UX-SNAKE-002**: Snake offers MUST display "Sponsored" or "Paid Placement" label prominently
- **REQ-UX-SNAKE-003**: Snake offers MUST display confidence penalty (e.g., "-12% confidence")
- **REQ-UX-SNAKE-004**: Snake offers MUST display insurance bond amount
- **REQ-UX-SNAKE-005**: Snake offers MUST include opt-out button/checkbox

### 10.2 User Control

- **REQ-UX-CONTROL-001**: Users MUST be able to opt-out of Snake offers
- **REQ-UX-CONTROL-002**: User opt-out preference MUST be persisted
- **REQ-UX-CONTROL-003**: User opt-out MUST be respected across all queries
- **REQ-UX-CONTROL-004**: Users MUST be able to see why Snake offer is shown

### 10.3 Transparency

- **REQ-UX-TRANSPARENCY-001**: Snake offers MUST explain reason for display
- **REQ-UX-TRANSPARENCY-002**: Snake offers MUST show provider identity
- **REQ-UX-TRANSPARENCY-003**: Snake offers MUST show insurance bond amount
- **REQ-UX-TRANSPARENCY-004**: Snake offers MUST show confidence penalty

---

## 11. Enforcement & Compliance

### 11.1 ROOT CA Enforcement

- **REQ-ENFORCE-001**: ROOT CA MUST monitor Snake service compliance
- **REQ-ENFORCE-002**: ROOT CA MUST audit Snake service claims
- **REQ-ENFORCE-003**: ROOT CA MUST verify Snake service adherence to Apple Rule
- **REQ-ENFORCE-004**: ROOT CA MUST revoke certificates for violations
- **REQ-ENFORCE-005**: ROOT CA MUST slash bonds for violations

### 11.2 Indexer Enforcement

- **REQ-ENFORCE-006**: Indexers MUST enforce local Snake tolerance
- **REQ-ENFORCE-007**: Indexers MUST respect forbidden contexts
- **REQ-ENFORCE-008**: Indexers MUST apply confidence penalties
- **REQ-ENFORCE-009**: Indexers MUST report violations to ROOT CA

### 11.3 LLM Enforcement

- **REQ-ENFORCE-010**: LLM MUST never rank Snake offers above truthful answers
- **REQ-ENFORCE-011**: LLM MUST apply confidence penalties consistently
- **REQ-ENFORCE-012**: LLM MUST suppress Snake offers in forbidden contexts
- **REQ-ENFORCE-013**: LLM MUST label Snake offers correctly

---

## 12. Monitoring & Observability

### 12.1 Snake Event Broadcasting

- **REQ-MONITOR-SNAKE-001**: ROOT CA MUST broadcast `snake_service_registered` events
- **REQ-MONITOR-SNAKE-002**: ROOT CA MUST broadcast `snake_certificate_issued` events
- **REQ-MONITOR-SNAKE-003**: ROOT CA MUST broadcast `snake_violation_detected` events
- **REQ-MONITOR-SNAKE-004**: ROOT CA MUST broadcast `snake_certificate_revoked` events
- **REQ-MONITOR-SNAKE-005**: Indexers MUST broadcast `snake_offer_displayed` events
- **REQ-MONITOR-SNAKE-006**: Indexers MUST broadcast `snake_offer_suppressed` events

### 12.2 Snake Metrics

- **REQ-METRICS-SNAKE-001**: System MUST track Snake offer display rate
- **REQ-METRICS-SNAKE-002**: System MUST track Snake offer suppression rate
- **REQ-METRICS-SNAKE-003**: System MUST track Snake violation rate
- **REQ-METRICS-SNAKE-004**: System MUST track Snake revenue (iGas/iTax)
- **REQ-METRICS-SNAKE-005**: System MUST track user opt-out rate

---

## 13. Security Requirements

### 13.1 Snake Certificate Security

- **REQ-SECURITY-SNAKE-001**: Snake certificates MUST be signed by ROOT CA
- **REQ-SECURITY-SNAKE-002**: Snake certificates MUST include `SNAKE_CERT` type
- **REQ-SECURITY-SNAKE-003**: Snake certificates MUST include `AD_CAPABILITIES`
- **REQ-SECURITY-SNAKE-004**: Snake certificates MUST include `MAX_INFLUENCE_SCORE`
- **REQ-SECURITY-SNAKE-005**: Snake certificates MUST be verifiable by indexers

### 13.2 Snake Service Security

- **REQ-SECURITY-SNAKE-006**: Snake services MUST authenticate with valid certificate
- **REQ-SECURITY-SNAKE-007**: Snake services MUST respect capability boundaries
- **REQ-SECURITY-SNAKE-008**: Snake services MUST not exceed max influence
- **REQ-SECURITY-SNAKE-009**: Snake services MUST operate only in allowed contexts

---

## 14. Implementation Checklist

### Phase 1: Core Snake Infrastructure
- [ ] Implement `SNAKE_CERT` certificate type in ROOT CA
- [ ] Implement `AD_CAPABILITIES` capability system
- [ ] Implement `MAX_INFLUENCE_SCORE` per Snake provider
- [ ] Implement Snake service registration in ServiceRegistry
- [ ] Implement Snake service querying in indexers
- [ ] Implement Snake fee multipliers (iGas/iTax)

### Phase 2: LLM Snake Integration
- [ ] Implement Snake offer detection in LLM
- [ ] Implement Snake offer formatting in LLM response
- [ ] Implement confidence penalty calculation
- [ ] Implement Snake offer suppression logic
- [ ] Implement context detection and filtering

### Phase 3: User Experience
- [ ] Implement Snake offer display in Angular UI
- [ ] Implement "Sponsored" label display
- [ ] Implement confidence penalty display
- [ ] Implement opt-out mechanism
- [ ] Implement user preference persistence

### Phase 4: Enforcement & Compliance
- [ ] Implement Apple Rule validation
- [ ] Implement Snake violation detection
- [ ] Implement certificate revocation for violations
- [ ] Implement bond slashing for violations
- [ ] Implement violation event broadcasting

### Phase 5: Monitoring & Metrics
- [ ] Implement Snake event broadcasting
- [ ] Implement Snake metrics tracking
- [ ] Implement Snake compliance monitoring
- [ ] Implement Snake audit logging

---

## 15. Testing Requirements

### 15.1 Unit Tests

- **REQ-TEST-SNAKE-001**: Test Snake service registration
- **REQ-TEST-SNAKE-002**: Test Snake certificate issuance
- **REQ-TEST-SNAKE-003**: Test Snake offer formatting
- **REQ-TEST-SNAKE-004**: Test confidence penalty calculation
- **REQ-TEST-SNAKE-005**: Test context filtering
- **REQ-TEST-SNAKE-006**: Test fee multiplier application

### 15.2 Integration Tests

- **REQ-TEST-SNAKE-007**: Test end-to-end Snake offer flow
- **REQ-TEST-SNAKE-008**: Test Snake suppression in forbidden contexts
- **REQ-TEST-SNAKE-009**: Test Snake violation detection and punishment
- **REQ-TEST-SNAKE-010**: Test user opt-out functionality

### 15.3 Compliance Tests

- **REQ-TEST-SNAKE-011**: Test Apple Rule enforcement
- **REQ-TEST-SNAKE-012**: Test Snake never ranks above truth
- **REQ-TEST-SNAKE-013**: Test Snake labeling requirements
- **REQ-TEST-SNAKE-014**: Test Snake fee structure

---

## 16. Example Implementation

### 16.1 Snake Service Registration

```typescript
// Register Snake service with ROOT CA
const snakeProvider: ServiceProviderWithCert = {
  id: "snake-advertiser-001",
  serviceType: "advertising",
  providerType: "SNAKE",
  name: "Premium Advertiser",
  location: "global",
  bond: 10000,
  reputation: 4.1,
  indexerId: "indexer-001",
  apiEndpoint: "https://snake-advertiser-001.com/api",
  certificate: "encert:snake:snake-advertiser-001",
  maxInfluence: 0.15,
  contextsAllowed: ["shopping", "movies", "restaurants"],
  contextsForbidden: ["health", "legal", "finance"],
  adCapabilities: ["product_promotion", "service_highlighting"],
  iGasMultiplier: 2.0,
  iTaxMultiplier: 2.0
};

await registerServiceProviderWithROOTCA(snakeProvider);
```

### 16.2 LLM Response with Snake Offer

```typescript
// LLM response structure
const llmResponse = {
  answer: {
    service: "AMC Theatres",
    price: 12.50,
    showtime: "7:00 PM",
    confidence: 0.95
  },
  alternatives: [
    { service: "Cinemark", price: 13.00, confidence: 0.88 },
    { service: "MovieCom", price: 11.50, confidence: 0.85 }
  ],
  snake_offer: {
    label: "Sponsored Option",
    reason_for_display: "Paid placement",
    service: "Premium Cinema",
    price: 15.00,
    confidence_penalty: -0.12,
    adjusted_confidence: 0.78, // 0.90 - 0.12
    insurance_held: 10000,
    opt_out: true,
    provider_id: "snake-advertiser-001",
    service_type: "advertising",
    max_influence: 0.15,
    context: "movies"
  }
};
```

### 16.3 Snake Fee Calculation

```typescript
// Calculate Snake fees
const baseIGas = 0.005; // Normal iGas
const snakeIGasMultiplier = 2.0;
const snakeIGas = baseIGas * snakeIGasMultiplier; // 0.01

const baseITax = 0.000005; // Normal iTax (0.0005%)
const snakeITaxMultiplier = 2.0;
const snakeITax = baseITax * snakeITaxMultiplier; // 0.00001 (0.001%)
```

---

## Conclusion

These implementation requirements translate **The Snake of Eden** into concrete technical specifications. They ensure:

- ✅ **Ethical governance**: Snake speaks but never rules
- ✅ **Truth preservation**: Snake never replaces truthful answers
- ✅ **Transparency**: Snake always labeled and optional
- ✅ **Cost structure**: Truth is free, temptation is expensive
- ✅ **Separation of powers**: GOD defines rules, Indexers judge locally
- ✅ **Apple Rule**: Snake polishes but never changes the fruit

**Key Innovation:**
> **This is not advertising. This is regulated temptation, ethical persuasion, reputation-backed influence, intelligence-priced attention.**

No existing system — Web2, Web3, or AI-native — does this.

**Next Steps:**
- Implement Phase 1 (Core Snake Infrastructure)
- Test and validate
- Proceed to Phase 2 (LLM Snake Integration)
- Continue iteratively

---

**Document Status:** ✅ Ready for Implementation

