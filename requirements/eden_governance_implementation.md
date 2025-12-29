# 🜂 Eden Governance Model - Implementation Requirements

**Document Version:** 1.0  
**Date:** 2026  
**Status:** Implementation Requirements

---

## Overview

This document translates the **Eden Governance Model** ("Indexers act. ROOT CA judges. GOD settles.") into concrete implementation requirements for the Eden ecosystem.

> **Core Principle:**  
> **Priests perform the rituals, but Judgment Day belongs to GOD.**

---

## 1. Indexer Implementation Requirements (Priest = Indexer)

### 1.1 What Indexers MUST Do

#### ✅ Execute Services
- **REQ-INDEXER-001**: Indexers MUST execute service requests within their granted capabilities
- **REQ-INDEXER-002**: Indexers MUST query ROOT CA ServiceRegistry for service discovery (post-LLM)
- **REQ-INDEXER-003**: Indexers MUST route requests to appropriate service providers
- **REQ-INDEXER-004**: Indexers MUST handle service provider API calls and responses

#### ✅ Serve Users
- **REQ-INDEXER-005**: Indexers MUST process user queries via LLM extraction
- **REQ-INDEXER-006**: Indexers MUST format responses using LLM for user presentation
- **REQ-INDEXER-007**: Indexers MUST maintain user session state (if applicable)

#### ✅ Calculate iGas / iTax
- **REQ-INDEXER-008**: Indexers MUST calculate iGas fees for each transaction
- **REQ-INDEXER-009**: Indexers MUST calculate iTax for DEX transactions (0.0005% commission)
- **REQ-INDEXER-010**: Indexers MUST break down fees: `rootCAFee`, `indexerFee`, `providerFee`
- **REQ-INDEXER-011**: Indexers MUST include fee breakdown in ledger entries

#### ✅ Emit Ledger Entries
- **REQ-INDEXER-012**: Indexers MUST create ledger entries for all executed transactions
- **REQ-INDEXER-013**: Indexers MUST push ledger entries to `LEDGER_SETTLEMENT_STREAM` (Redis stream)
- **REQ-INDEXER-014**: Ledger entries MUST include:
  - `entryId` (unique identifier)
  - `txId` (transaction ID)
  - `payer` (user email)
  - `indexerId` (indexer identifier)
  - `iGas` (calculated intelligence gas)
  - `iTax` (if applicable, for DEX transactions)
  - `fees` (breakdown: rootCA, indexer, provider)
  - `status: "pending"` (initial status)
  - `bookingDetails` (service-specific details)
  - `timestamp`
- **REQ-INDEXER-015**: Indexers MUST sign ledger entries with their certificate (ENCERT)

#### ✅ Operate Freely Within Capabilities
- **REQ-INDEXER-016**: Indexers MUST operate autonomously within granted capabilities
- **REQ-INDEXER-017**: Indexers MUST verify their own capabilities before executing services
- **REQ-INDEXER-018**: Indexers MUST handle errors gracefully and report failures

### 1.2 What Indexers MUST NOT Do

#### ❌ Cannot Mint Authority
- **REQ-INDEXER-FORBIDDEN-001**: Indexers MUST NOT issue certificates
- **REQ-INDEXER-FORBIDDEN-002**: Indexers MUST NOT grant capabilities to other entities
- **REQ-INDEXER-FORBIDDEN-003**: Indexers MUST NOT modify their own capabilities
- **REQ-INDEXER-FORBIDDEN-004**: Indexers MUST NOT create new service provider registrations (only ROOT CA can)

#### ❌ Cannot Finalize Money
- **REQ-INDEXER-FORBIDDEN-005**: Indexers MUST NOT update balances
- **REQ-INDEXER-FORBIDDEN-006**: Indexers MUST NOT settle transactions
- **REQ-INDEXER-FORBIDDEN-007**: Indexers MUST NOT mark ledger entries as `settled`
- **REQ-INDEXER-FORBIDDEN-008**: Indexers MUST NOT distribute fees (iGas/iTax)
- **REQ-INDEXER-FORBIDDEN-009**: Indexers MUST NOT access ROOT CA balance tables directly

#### ❌ Cannot Rewrite History
- **REQ-INDEXER-FORBIDDEN-010**: Indexers MUST NOT modify ledger entries after creation
- **REQ-INDEXER-FORBIDDEN-011**: Indexers MUST NOT delete ledger entries
- **REQ-INDEXER-FORBIDDEN-012**: Indexers MUST NOT alter transaction history
- **REQ-INDEXER-FORBIDDEN-013**: Indexers MUST NOT create conflicting ledger entries

---

## 2. ROOT CA Implementation Requirements (GOD = ROOT CA)

### 2.1 ROOT CA Exclusive Authorities

#### ✅ Validate Identity (ENCERT)
- **REQ-ROOTCA-001**: ROOT CA MUST validate all certificates (ENCERT) before processing
- **REQ-ROOTCA-002**: ROOT CA MUST verify certificate signatures
- **REQ-ROOTCA-003**: ROOT CA MUST check certificate expiration
- **REQ-ROOTCA-004**: ROOT CA MUST verify certificate revocation status
- **REQ-ROOTCA-005**: ROOT CA MUST reject transactions with invalid certificates

#### ✅ Verify Capability Boundaries
- **REQ-ROOTCA-006**: ROOT CA MUST verify indexer capabilities match requested service
- **REQ-ROOTCA-007**: ROOT CA MUST check service provider capabilities
- **REQ-ROOTCA-008**: ROOT CA MUST enforce capability restrictions
- **REQ-ROOTCA-009**: ROOT CA MUST reject transactions exceeding granted capabilities

#### ✅ Accept or Reject Ledger Entries
- **REQ-ROOTCA-010**: ROOT CA MUST consume ledger entries from `LEDGER_SETTLEMENT_STREAM`
- **REQ-ROOTCA-011**: ROOT CA MUST validate ledger entry structure
- **REQ-ROOTCA-012**: ROOT CA MUST verify ledger entry signatures
- **REQ-ROOTCA-013**: ROOT CA MUST check for duplicate `entryId` values
- **REQ-ROOTCA-014**: ROOT CA MUST accept valid entries → mark as `settled`
- **REQ-ROOTCA-015**: ROOT CA MUST reject invalid entries → mark as `rejected`
- **REQ-ROOTCA-016**: ROOT CA MUST log all acceptance/rejection decisions

#### ✅ Settle Balances
- **REQ-ROOTCA-017**: ROOT CA MUST maintain authoritative balance tables (`ROOT_BALANCES`)
- **REQ-ROOTCA-018**: ROOT CA MUST update balances ONLY after ledger entry validation
- **REQ-ROOTCA-019**: ROOT CA MUST update balances atomically (no partial updates)
- **REQ-ROOTCA-020**: ROOT CA MUST distribute fees according to fee breakdown:
  - `rootCABalance += fees.rootCA`
  - `indexerBalance[indexerId] += fees.indexer`
  - `providerBalance[providerId] += fees.provider` (if applicable)
- **REQ-ROOTCA-021**: ROOT CA MUST distribute iTax (WIN-WIN-WIN model):
  - ROOT CA: 40%
  - Indexer: 30%
  - Trader: 30%
- **REQ-ROOTCA-022**: ROOT CA MUST prevent double-spending (check entryId uniqueness)

#### ✅ Finalize Fees
- **REQ-ROOTCA-023**: ROOT CA MUST finalize all fee distributions
- **REQ-ROOTCA-024**: ROOT CA MUST ensure fees are correctly calculated
- **REQ-ROOTCA-025**: ROOT CA MUST record fee finalization in ledger

#### ✅ Revoke Certificates
- **REQ-ROOTCA-026**: ROOT CA MUST maintain certificate revocation list
- **REQ-ROOTCA-027**: ROOT CA MUST broadcast revocation events
- **REQ-ROOTCA-028**: ROOT CA MUST reject transactions from revoked certificates
- **REQ-ROOTCA-029**: ROOT CA MUST provide revocation API endpoint

#### ✅ Write Immutable Judgment Records
- **REQ-ROOTCA-030**: ROOT CA MUST write all settlement decisions to immutable ledger
- **REQ-ROOTCA-031**: ROOT CA MUST mark settled entries as `status: "completed"`
- **REQ-ROOTCA-032**: ROOT CA MUST include settlement timestamp
- **REQ-ROOTCA-033**: ROOT CA MUST broadcast `ledger_entry_settled` events
- **REQ-ROOTCA-034**: ROOT CA MUST never modify settled entries

---

## 3. Ledger Settlement Implementation Requirements ("Judgment Day")

### 3.1 Settlement Flow

#### Step 1: Indexer Executes
- **REQ-SETTLEMENT-001**: Indexer executes transaction and creates ledger entry
- **REQ-SETTLEMENT-002**: Indexer pushes entry to `LEDGER_SETTLEMENT_STREAM` with `status: "pending"`

#### Step 2: ROOT CA Consumes
- **REQ-SETTLEMENT-003**: ROOT CA MUST run settlement consumer (`rootCASettlementConsumer()`)
- **REQ-SETTLEMENT-004**: ROOT CA MUST read entries from `LEDGER_SETTLEMENT_STREAM` in batches
- **REQ-SETTLEMENT-005**: ROOT CA MUST process entries sequentially (maintain order)

#### Step 3: ROOT CA Verifies
- **REQ-SETTLEMENT-006**: ROOT CA MUST verify certificate validity
- **REQ-SETTLEMENT-007**: ROOT CA MUST verify capability boundaries
- **REQ-SETTLEMENT-008**: ROOT CA MUST verify fee calculations (iGas, iTax)
- **REQ-SETTLEMENT-009**: ROOT CA MUST check for duplicate entryId
- **REQ-SETTLEMENT-010**: ROOT CA MUST validate ledger entry structure

#### Step 4: ROOT CA Judges
- **REQ-SETTLEMENT-011**: If valid → ROOT CA MUST:
  - Update balances
  - Distribute fees
  - Mark entry as `status: "completed"`
  - Broadcast `ledger_entry_settled` event
- **REQ-SETTLEMENT-012**: If invalid → ROOT CA MUST:
  - Mark entry as `status: "rejected"`
  - Log rejection reason
  - Broadcast `ledger_entry_rejected` event
  - Optionally slash indexer (if malicious)

#### Step 5: History Frozen
- **REQ-SETTLEMENT-013**: Once settled, entry MUST be immutable
- **REQ-SETTLEMENT-014**: No appeal, rewrite, or fork allowed
- **REQ-SETTLEMENT-015**: Balances are final and authoritative

### 3.2 Settlement Consumer Implementation

- **REQ-SETTLEMENT-016**: Settlement consumer MUST run continuously (never stop)
- **REQ-SETTLEMENT-017**: Settlement consumer MUST handle Redis connection errors gracefully
- **REQ-SETTLEMENT-018**: Settlement consumer MUST retry on transient failures
- **REQ-SETTLEMENT-019**: Settlement consumer MUST broadcast events for monitoring:
  - `settlement_consumer_started`
  - `settlement_batch_processing`
  - `settlement_processing_start`
  - `settlement_entry_not_found`
  - `settlement_certificate_invalid`
  - `settlement_processing_error`
  - `settlement_connection_error`
  - `settlement_stream_error`

---

## 4. Separation of Concerns Implementation Requirements

### 4.1 Execution Layer (Indexers)

- **REQ-SEPARATION-001**: Execution MUST be federated (multiple indexers)
- **REQ-SEPARATION-002**: Indexers MUST operate independently
- **REQ-SEPARATION-003**: Indexers MUST NOT coordinate with each other for settlement
- **REQ-SEPARATION-004**: Indexers MUST only push to settlement stream (no pull)

### 4.2 Settlement Layer (ROOT CA)

- **REQ-SEPARATION-005**: Settlement MUST be centralized (only ROOT CA)
- **REQ-SEPARATION-006**: ROOT CA MUST be the single source of truth for balances
- **REQ-SEPARATION-007**: ROOT CA MUST consume settlement stream exclusively
- **REQ-SEPARATION-008**: ROOT CA MUST NOT delegate settlement to indexers

### 4.3 Authority Layer (ROOT CA)

- **REQ-SEPARATION-009**: Authority MUST be singular (only ROOT CA)
- **REQ-SEPARATION-010**: ROOT CA MUST enforce clear law (no ambiguity)
- **REQ-SEPARATION-011**: ROOT CA MUST provide consistent judgment (deterministic)

---

## 5. iTax Implementation Requirements (Obedience Cost)

### 5.1 iTax Calculation

- **REQ-ITAX-001**: iTax MUST be calculated as 0.0005% of trade value (DEX transactions)
- **REQ-ITAX-002**: iTax MUST be calculated by indexer during trade execution
- **REQ-ITAX-003**: iTax MUST be included in ledger entry `bookingDetails.iTax`
- **REQ-ITAX-004**: iTax MUST be distributed by ROOT CA during settlement

### 5.2 iTax Distribution (WIN-WIN-WIN Model)

- **REQ-ITAX-005**: ROOT CA MUST distribute iTax as follows:
  - ROOT CA: 40% (governance & liquidity growth)
  - Token Indexer: 30% (service provider reward)
  - Trader: 30% (rebate to buyer/seller)
- **REQ-ITAX-006**: iTax distribution MUST be atomic (all or nothing)
- **REQ-ITAX-007**: iTax MUST be recorded in settlement logs

### 5.3 iTax Purpose

- **REQ-ITAX-008**: iTax MUST serve as "obedience cost" (governance friction)
- **REQ-ITAX-009**: iTax MUST discourage abuse (anti-chaos constant)
- **REQ-ITAX-010**: iTax MUST fund governance (ROOT CA share)
- **REQ-ITAX-011**: iTax MUST reward good behavior (trader rebate)
- **REQ-ITAX-012**: iTax MUST never be high enough to hurt the system

---

## 6. ServiceRegistry Implementation Requirements

### 6.1 Centralized Management

- **REQ-SERVICEREGISTRY-001**: ServiceRegistry MUST be managed by ROOT CA only
- **REQ-SERVICEREGISTRY-002**: ServiceRegistry MUST be in-memory (fast lookup)
- **REQ-SERVICEREGISTRY-003**: ServiceRegistry MUST be single source of truth
- **REQ-SERVICEREGISTRY-004**: ServiceRegistry MUST provide quick post-LLM lookup

### 6.2 Registration

- **REQ-SERVICEREGISTRY-005**: Service providers MUST register with ROOT CA via `POST /api/root-ca/service-registry/register`
- **REQ-SERVICEREGISTRY-006**: ROOT CA MUST validate registration requests
- **REQ-SERVICEREGISTRY-007**: ROOT CA MUST broadcast `service_provider_registered` events
- **REQ-SERVICEREGISTRY-008**: Indexers MUST NOT register services (only ROOT CA can)

### 6.3 Querying

- **REQ-SERVICEREGISTRY-009**: Indexers MUST query ROOT CA ServiceRegistry via `GET /api/root-ca/service-registry`
- **REQ-SERVICEREGISTRY-010**: ROOT CA MUST support filtering by `serviceType`
- **REQ-SERVICEREGISTRY-011**: ROOT CA MUST return only active providers (`status: "active"`)
- **REQ-SERVICEREGISTRY-012**: Query MUST be fast (in-memory lookup, no LLM needed)

---

## 7. Error Handling & Resilience

### 7.1 Indexer Errors

- **REQ-ERROR-001**: Indexers MUST handle service provider API failures gracefully
- **REQ-ERROR-002**: Indexers MUST retry transient failures
- **REQ-ERROR-003**: Indexers MUST log errors for debugging
- **REQ-ERROR-004**: Indexers MUST NOT push invalid ledger entries

### 7.2 ROOT CA Errors

- **REQ-ERROR-005**: ROOT CA MUST handle settlement stream errors gracefully
- **REQ-ERROR-006**: ROOT CA MUST retry on Redis connection failures
- **REQ-ERROR-007**: ROOT CA MUST log all settlement errors
- **REQ-ERROR-008**: ROOT CA MUST broadcast error events for monitoring

### 7.3 Certificate Validation Errors

- **REQ-ERROR-009**: ROOT CA MUST reject transactions with invalid certificates
- **REQ-ERROR-010**: ROOT CA MUST log certificate validation failures
- **REQ-ERROR-011**: ROOT CA MUST broadcast `settlement_certificate_invalid` events

---

## 8. Monitoring & Observability

### 8.1 Event Broadcasting

- **REQ-MONITORING-001**: ROOT CA MUST broadcast all settlement events
- **REQ-MONITORING-002**: Indexers MUST broadcast execution events
- **REQ-MONITORING-003**: Events MUST be consumable by Angular Console Chat
- **REQ-MONITORING-004**: Events MUST include relevant data (entryId, iGas, iTax, balances, errors)

### 8.2 Logging

- **REQ-MONITORING-005**: All settlement decisions MUST be logged
- **REQ-MONITORING-006**: All balance updates MUST be logged
- **REQ-MONITORING-007**: All certificate validations MUST be logged
- **REQ-MONITORING-008**: Logs MUST be structured and searchable

### 8.3 API Endpoints

- **REQ-MONITORING-009**: ROOT CA MUST expose `/api/root-balances` endpoint
- **REQ-MONITORING-010**: ROOT CA MUST expose `/api/root-ca/service-registry` endpoint
- **REQ-MONITORING-011**: Endpoints MUST return current state (balances, services)

---

## 9. Security Requirements

### 9.1 Certificate Security

- **REQ-SECURITY-001**: All certificates MUST be signed (ENCERT)
- **REQ-SECURITY-002**: ROOT CA MUST verify all certificate signatures
- **REQ-SECURITY-003**: ROOT CA MUST check certificate expiration
- **REQ-SECURITY-004**: ROOT CA MUST enforce certificate revocation

### 9.2 Ledger Security

- **REQ-SECURITY-005**: Ledger entries MUST be signed by indexer certificate
- **REQ-SECURITY-006**: ROOT CA MUST verify ledger entry signatures
- **REQ-SECURITY-007**: ROOT CA MUST prevent duplicate entryId (replay protection)
- **REQ-SECURITY-008**: Settled entries MUST be immutable

### 9.3 Balance Security

- **REQ-SECURITY-009**: Only ROOT CA MUST update balances
- **REQ-SECURITY-010**: Balance updates MUST be atomic
- **REQ-SECURITY-011**: Balance updates MUST be logged
- **REQ-SECURITY-012**: Balance queries MUST be read-only for indexers

---

## 10. Performance Requirements

### 10.1 Settlement Performance

- **REQ-PERF-001**: Settlement consumer MUST process entries within 1 second
- **REQ-PERF-002**: Balance updates MUST be atomic and fast
- **REQ-PERF-003**: ServiceRegistry queries MUST be < 10ms (in-memory)

### 10.2 Scalability

- **REQ-PERF-004**: System MUST support multiple indexers (federated execution)
- **REQ-PERF-005**: System MUST support high-throughput settlement stream
- **REQ-PERF-006**: System MUST handle concurrent ledger entries

---

## 11. Compliance Requirements

### 11.1 System Commandment

> **Thou shalt act freely,  
> but thou shalt be judged.**

- **REQ-COMPLIANCE-001**: Indexers MUST act freely within capabilities
- **REQ-COMPLIANCE-002**: ROOT CA MUST judge all actions
- **REQ-COMPLIANCE-003**: No action MUST escape judgment
- **REQ-COMPLIANCE-004**: Judgment MUST be final (no appeal)

---

## 12. Implementation Checklist

### Phase 1: Core Settlement
- [ ] Implement `LEDGER_SETTLEMENT_STREAM` (Redis stream)
- [ ] Implement `pushLedgerEntryToSettlementStream()` in indexers
- [ ] Implement `rootCASettlementConsumer()` in ROOT CA
- [ ] Implement `processSettlementEntry()` validation logic
- [ ] Implement balance update logic (`ROOT_BALANCES`)
- [ ] Implement fee distribution logic
- [ ] Implement iTax distribution (WIN-WIN-WIN model)

### Phase 2: Certificate Validation
- [ ] Implement certificate validation in settlement consumer
- [ ] Implement capability boundary checking
- [ ] Implement certificate revocation checking
- [ ] Implement signature verification

### Phase 3: ServiceRegistry Centralization
- [ ] Move ServiceRegistry to ROOT CA
- [ ] Implement `registerServiceProviderWithROOTCA()`
- [ ] Implement `queryROOTCAServiceRegistry()`
- [ ] Update indexers to query ROOT CA (not local registry)
- [ ] Implement ServiceRegistry API endpoints

### Phase 4: Monitoring & Events
- [ ] Implement settlement event broadcasting
- [ ] Implement error event broadcasting
- [ ] Implement Angular Console Chat integration
- [ ] Implement logging and observability

### Phase 5: Security & Resilience
- [ ] Implement replay protection (entryId uniqueness)
- [ ] Implement error handling and retries
- [ ] Implement connection error handling
- [ ] Implement audit logging

---

## 13. Testing Requirements

### 13.1 Unit Tests

- **REQ-TEST-001**: Test indexer ledger entry creation
- **REQ-TEST-002**: Test ROOT CA settlement consumer
- **REQ-TEST-003**: Test certificate validation
- **REQ-TEST-004**: Test balance updates
- **REQ-TEST-005**: Test fee distribution
- **REQ-TEST-006**: Test iTax distribution

### 13.2 Integration Tests

- **REQ-TEST-007**: Test end-to-end settlement flow
- **REQ-TEST-008**: Test ServiceRegistry registration and querying
- **REQ-TEST-009**: Test error handling and recovery
- **REQ-TEST-010**: Test concurrent ledger entries

### 13.3 Security Tests

- **REQ-TEST-011**: Test certificate validation failures
- **REQ-TEST-012**: Test duplicate entryId rejection
- **REQ-TEST-013**: Test capability boundary enforcement
- **REQ-TEST-014**: Test balance update authorization

---

## Conclusion

These implementation requirements translate the **Eden Governance Model** ("Indexers act. ROOT CA judges. GOD settles.") into concrete technical specifications. They ensure:

- ✅ **Separation of concerns**: Execution (indexers) vs. Settlement (ROOT CA)
- ✅ **Clear authority**: Only ROOT CA can settle and update balances
- ✅ **Immutable judgment**: Once settled, history is frozen
- ✅ **Scalability**: Federated execution, centralized settlement
- ✅ **Security**: Certificate validation, replay protection, audit logging

**Next Steps:**
- Implement Phase 1 (Core Settlement)
- Test and validate
- Proceed to Phase 2 (Certificate Validation)
- Continue iteratively

---

**Document Status:** ✅ Ready for Implementation

