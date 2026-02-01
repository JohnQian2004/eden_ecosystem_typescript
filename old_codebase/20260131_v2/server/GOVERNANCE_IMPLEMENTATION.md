# Rule-Based Governance System Implementation (v1.24)

## Overview

The Rule-Based Governance System (v1.24) has been implemented according to the whitepaper specifications. This system provides deterministic rule-based governance with RAG retrieval, time-decay trust, and QR-code device binding.

## Components Implemented

### 1. Core Types (`server/src/governance/types.ts`)
- `RuleType`: PERMISSION, CONSTRAINT, ESCALATION, SETTLEMENT
- `RuleScope`: GLOBAL, GARDEN, SERVICE, USER
- `ActorRole`: ROOT_CA, GARDEN, PRIEST, GARDEN_OWNER, USER, SERVICE_PROVIDER
- `DecisionResult`: ALLOW, DENY, ESCALATE
- `GovernanceRule`: Complete rule definition with conditions, actions, time-decay
- `RuleEvaluationContext`: Context for rule evaluation
- `RuleEvaluationResult`: Result of rule evaluation
- `DeviceBinding`: Device binding information
- `QRCodeBindingData`: QR code data structure
- `TrustScore`: Trust score with time-decay
- `Permission`: Permission with time-decay

### 2. Rule Engine (`server/src/governance/ruleEngine.ts`)
- **Deterministic evaluation**: No LLM interpretation, pure pattern matching
- **Priority-based evaluation**: Rules evaluated in priority order
- **Scope filtering**: Rules filtered by scope (GLOBAL, GARDEN, SERVICE, USER)
- **Condition matching**: Pattern matching for all condition types
- **Decision logic**: First denial wins, escalation support

### 3. Rule Index (`server/src/governance/ruleIndex.ts`)
- **RAG-based retrieval**: Rules retrieved based on action context
- **Persistent storage**: Rules stored in JSON file (`data/governance-rules.json`)
- **Default rules**: Initializes with default governance rules:
  - Settlement authority (ROOT_CA only)
  - Garden execution (Gardens can execute, not settle)
  - User service requests
- **Rule management**: Create, read, update, delete operations

### 4. Time-Decay System (`server/src/governance/timeDecay.ts`)
- **Trust score decay**: Exponential decay formula `current = initial × e^(-decay_rate × time)`
- **Permission decay**: Same formula for permissions
- **Renewal tracking**: Tracks when trust/permissions need renewal
- **Persistent storage**: Trust scores and permissions stored in JSON files
- **Managers**: `TrustScoreManager` and `PermissionManager` for CRUD operations

### 5. Device Binding (`server/src/governance/deviceBinding.ts`)
- **QR code generation**: Generates QR codes for device binding (placeholder implementation)
- **Device binding**: Binds devices to user identities
- **Signature verification**: Verifies device signatures using public keys
- **Device revocation**: Supports device revocation
- **Persistent storage**: Device bindings stored in JSON file

### 6. Governance Service (`server/src/governance/governanceService.ts`)
- **Main orchestration**: Coordinates rule evaluation, RAG retrieval, and time-decay
- **Action evaluation**: Main entry point for evaluating actions against rules
- **Rule management**: CRUD operations for rules (ROOT_CA only)
- **Trust integration**: Automatically retrieves trust scores for evaluation

## API Endpoints

### Rule Management
- `POST /api/governance/evaluate` - Evaluate action against governance rules
- `GET /api/governance/rules` - Get all governance rules
- `GET /api/governance/rules/:ruleId` - Get rule by ID
- `POST /api/governance/rules` - Create or update a rule (ROOT_CA only)
- `DELETE /api/governance/rules/:ruleId` - Delete a rule (ROOT_CA only)

### Device Binding
- `POST /api/governance/device-bind/qr` - Generate QR code for device binding
- `POST /api/governance/device-bind` - Complete device binding
- `POST /api/governance/device-verify` - Verify device authentication

### Trust & Permissions
- `GET /api/governance/trust/:entityId` - Get trust score for entity

## Initialization

The governance system is initialized in `server/eden-sim-redis.ts`:

```typescript
// Initialize Rule-Based Governance System (v1.24)
const { initializeGovernance } = require("./src/governance/governanceService");
const dataPath = path.join(__dirname, "data");
initializeGovernance(dataPath);
console.log("✅ [Governance] Rule-Based Governance System (v1.24) initialized");
```

## Default Rules

The system initializes with three default rules:

1. **Settlement Authority** (`rule-settlement-authority-001`)
   - Only ROOT_CA can settle transactions
   - Requires audit and ledger entry

2. **Garden Execution** (`rule-garden-execution-001`)
   - Gardens can execute transactions
   - Requires valid certificate
   - Prohibits settlement

3. **User Service Request** (`rule-user-service-request-001`)
   - Users can request services
   - No audit required

## Data Storage

All governance data is stored in JSON files in the `server/data/` directory:
- `governance-rules.json` - All governance rules
- `trust-scores.json` - Trust scores
- `permissions.json` - Permissions
- `device-bindings.json` - Device bindings

## Next Steps

1. **QR Code Package**: Install `qrcode` package for proper QR code generation:
   ```bash
   npm install qrcode @types/qrcode
   ```

2. **Workflow Integration**: Integrate rule evaluation into workflow execution:
   - Evaluate actions before execution
   - Check permissions before service requests
   - Enforce settlement authority rules

3. **Frontend Integration**: Create Angular components for:
   - Rule management UI (ROOT_CA only)
   - Device binding UI
   - Trust score display
   - Permission management

4. **Vector Database**: Replace simple rule index with vector database for better RAG retrieval:
   - Pinecone, Weaviate, or local vector store
   - Semantic search for rule retrieval

5. **Rule Versioning**: Implement rule versioning and migration system

## Testing

To test the governance system:

1. **Evaluate an action**:
   ```bash
   curl -X POST http://localhost:3000/api/governance/evaluate \
     -H "Content-Type: application/json" \
     -d '{
       "action": "SETTLE_TRANSACTION",
       "actorId": "root-ca-1",
       "actorRole": "ROOT_CA",
       "timestamp": 1234567890
     }'
   ```

2. **Get all rules**:
   ```bash
   curl http://localhost:3000/api/governance/rules
   ```

3. **Create a rule**:
   ```bash
   curl -X POST http://localhost:3000/api/governance/rules \
     -H "Content-Type: application/json" \
     -d '{
       "rule": {
         "ruleId": "rule-test-001",
         "ruleType": "PERMISSION",
         "scope": "GLOBAL",
         "conditions": { "action": "TEST_ACTION" },
         "actions": { "allow": true },
         "priority": 50,
         "version": 1,
         "createdAt": "2026-01-20T10:00:00Z",
         "createdBy": "ROOT_CA"
       },
       "actorRole": "ROOT_CA"
     }'
   ```

## Notes

- The QR code generation currently uses a placeholder implementation. Install the `qrcode` package for proper QR code generation.
- The rule index uses simple in-memory storage. For production, consider using a vector database for better RAG retrieval.
- All governance operations are logged to the console for debugging.

