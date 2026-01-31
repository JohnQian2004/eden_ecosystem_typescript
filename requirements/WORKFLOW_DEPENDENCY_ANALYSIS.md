# Workflow Dependency Analysis

## Overview
This document analyzes all dependencies between Angular frontend and server for workflow execution, to enable systematic isolation and achieve **ZERO CODE CHANGES** when adding new Gardens (e.g., auto parts).

---

## Goal: Zero Code Changes for New Gardens

**Question**: If I start another Garden selling auto parts, how much code changes needed?

**Answer**: **ZERO** - Only need to add `auto_parts.json` workflow file.

**Principle**: The system must be **completely data-driven**. Angular should have NO knowledge of specific service types.

---

## 1. Current Hardcoded Dependencies (BLOCKERS)

### 1.1 Type Definitions (CRITICAL BLOCKER)

**Location**: `frontend/src/app/services/flowwise.service.ts`

```typescript
// ❌ HARDCODED - Blocks new service types
serviceType: 'movie' | 'dex';

// ✅ SHOULD BE
serviceType: string; // Any service type from server
```

**Impact**: Adding `'autoparts'` requires TypeScript type changes.

---

### 1.2 Component Properties (CRITICAL BLOCKER)

**Location**: `frontend/src/app/components/workflow-display/workflow-display.component.ts`

```typescript
// ❌ HARDCODED - Only supports movie and dex
movieWorkflow: FlowWiseWorkflow | null = null;
dexWorkflow: FlowWiseWorkflow | null = null;
selectedWorkflow: 'movie' | 'dex' | null = null;

// ✅ SHOULD BE
workflows: Map<string, FlowWiseWorkflow> = new Map();
activeWorkflowType: string | null = null;
```

**Impact**: Adding auto parts requires adding `autopartsWorkflow` property.

---

### 1.3 API Endpoints (CRITICAL BLOCKER)

**Location**: Multiple files

```typescript
// ❌ HARDCODED - Only movie and dex endpoints
this.http.get(`${baseUrl}/api/workflow/movie`)
this.http.get(`${baseUrl}/api/workflow/dex`)

// ✅ SHOULD BE - Dynamic based on serviceType from server
// Server broadcasts all workflows, no API calls needed
```

**Impact**: Adding auto parts requires adding `/api/workflow/autoparts` endpoint and API call.

---

### 1.4 Conditional Logic (CRITICAL BLOCKER)

**Location**: Multiple files

```typescript
// ❌ HARDCODED - Service type checks
if (serviceType === 'movie') { ... }
if (serviceType === 'dex') { ... }
const workflow = serviceType === 'movie' ? this.movieWorkflow : this.dexWorkflow;

// ✅ SHOULD BE - Generic lookup
const workflow = this.workflows.get(serviceType);
```

**Impact**: Adding auto parts requires adding new `if` branches.

---

### 1.5 Service Type Detection (CRITICAL BLOCKER)

**Location**: `frontend/src/app/app.component.ts`

```typescript
// ❌ HARDCODED - Keyword detection in Angular
detectServiceType(input: string): string | null {
  if (lowerInput.includes('movie') || ...) return 'movie';
  if (lowerInput.includes('token') || ...) return 'dex';
  if (lowerInput.includes('auto') || ...) return 'autoparts';
  // ... more hardcoded checks
}

// ✅ SHOULD BE - Server-side LLM determines service type
// Angular just sends input to /api/chat, server responds with serviceType
```

**Impact**: Adding auto parts requires adding keyword detection logic.

---

### 1.6 UI Labels (MEDIUM BLOCKER)

**Location**: `frontend/src/app/app.component.html`, `workflow-display.component.html`

```html
<!-- ❌ HARDCODED - Service-specific labels -->
<span *ngIf="selectedServiceType === 'movie'">🎬 Movie Query</span>
<span *ngIf="selectedServiceType === 'dex'">💰 DEX Query</span>
<h5>🎬 AMC Cinema Workflow Control</h5>

<!-- ✅ SHOULD BE - Dynamic from workflow definition -->
<span>{{ activeWorkflow?.name || 'Workflow' }}</span>
<h5>{{ activeWorkflow?.name || 'Workflow Control' }}</h5>
```

**Impact**: Adding auto parts requires adding new UI labels.

---

### 1.7 Service Type Array (MEDIUM BLOCKER)

**Location**: `frontend/src/app/app.component.ts`

```typescript
// ❌ HARDCODED - Service types array
serviceTypes: Array<{type: string, icon: string, adText: string, sampleQuery: string}> = [
  { type: 'movie', icon: '🎬', adText: 'Movie Tickets', ... },
  { type: 'dex', icon: '💰', adText: 'DEX Tokens', ... },
  { type: 'autoparts', icon: '🔧', adText: 'Auto Parts', ... },
  // ... more hardcoded entries
];

// ✅ SHOULD BE - Loaded from server ServiceRegistry
// Server broadcasts available service types from ServiceRegistry
```

**Impact**: Adding auto parts requires adding entry to array.

---

## 2. Required Changes for Zero-Code Architecture

### 2.1 Remove Hardcoded Service Types

**Files to Change**:
- `frontend/src/app/services/flowwise.service.ts`
- `frontend/src/app/components/workflow-display/workflow-display.component.ts`
- `frontend/src/app/app.component.ts`

**Changes**:
1. Replace `serviceType: 'movie' | 'dex'` with `serviceType: string`
2. Replace `movieWorkflow` and `dexWorkflow` with `workflows: Map<string, FlowWiseWorkflow>`
3. Replace all `if (serviceType === 'movie')` with `workflows.get(serviceType)`

---

### 2.2 Remove Hardcoded API Endpoints

**Files to Change**:
- `frontend/src/app/services/flowwise.service.ts`
- `frontend/src/app/components/workflow-display/workflow-display.component.ts`

**Changes**:
1. Remove `loadWorkflows()` API calls
2. Receive workflows via WebSocket `workflow_definition_loaded` events
3. Store in `Map<string, FlowWiseWorkflow>` dynamically

---

### 2.3 Remove Service Type Detection

**Files to Change**:
- `frontend/src/app/app.component.ts`

**Changes**:
1. Remove `detectServiceType()` method
2. Server LLM determines service type from user input
3. Server broadcasts `serviceType` in `workflow_started` event

---

### 2.4 Remove Hardcoded UI Labels

**Files to Change**:
- `frontend/src/app/app.component.html`
- `frontend/src/app/components/workflow-display/workflow-display.component.html`

**Changes**:
1. Use `{{ activeWorkflow?.name }}` instead of hardcoded "AMC Cinema"
2. Use `{{ activeWorkflow?.description }}` for descriptions
3. Use workflow metadata for icons, colors, etc.

---

### 2.5 Dynamic Service Type Loading

**Files to Change**:
- `frontend/src/app/app.component.ts`

**Changes**:
1. Remove hardcoded `serviceTypes` array
2. Receive service types from server via WebSocket
3. Server broadcasts available service types from ServiceRegistry

---

## 3. Target Architecture (Zero Code Changes)

### 3.1 Workflow Loading Flow

```
Current (Hardcoded):
  Angular → GET /api/workflow/movie → Store in movieWorkflow
  Angular → GET /api/workflow/dex → Store in dexWorkflow
  Angular → Hardcoded checks: if (serviceType === 'movie') ...

Target (Data-Driven):
  Server → Loads all workflow JSON files (movie.json, dex.json, autoparts.json, ...)
  Server → Broadcasts workflow_definition_loaded events for each
  Angular → Receives and stores in Map<string, FlowWiseWorkflow>
  Angular → Uses workflows.get(serviceType) dynamically
```

---

### 3.2 Service Type Detection Flow

```
Current (Hardcoded):
  Angular → detectServiceType(input) → Checks keywords → Returns 'movie'|'dex'|'autoparts'
  Angular → Starts workflow with detected type

Target (Server-Driven):
  Angular → POST /api/chat { input: "I need brake pads" }
  Server → LLM determines serviceType: "autoparts"
  Server → Loads autoparts.json workflow
  Server → Broadcasts workflow_started { serviceType: "autoparts", workflow: {...} }
  Angular → Receives and displays (no knowledge of service types)
```

---

### 3.3 Workflow Execution Flow

```
Current (Mixed):
  Angular knows about 'movie' and 'dex' workflows
  Angular has hardcoded logic for each service type
  Angular calls specific endpoints for each type

Target (Generic):
  Angular receives workflow_started event with serviceType
  Angular looks up workflow: workflows.get(serviceType)
  Angular displays workflow generically (no service-specific logic)
  Server executes all steps automatically
  Angular only sends user decisions
```

---

## 4. Implementation Plan

### Phase 1: Remove Hardcoded Types (CRITICAL)

**Goal**: Make service types dynamic strings, not union types

**Steps**:
1. Change `serviceType: 'movie' | 'dex'` → `serviceType: string`
2. Change `selectedWorkflow: 'movie' | 'dex'` → `selectedWorkflow: string | null`
3. Update all type definitions to use `string` instead of union types

**Files**:
- `frontend/src/app/services/flowwise.service.ts`
- `frontend/src/app/components/workflow-display/workflow-display.component.ts`

---

### Phase 2: Replace Hardcoded Workflow Properties (CRITICAL)

**Goal**: Use Map instead of individual properties

**Steps**:
1. Replace `movieWorkflow` and `dexWorkflow` with `workflows: Map<string, FlowWiseWorkflow>`
2. Replace all `if (serviceType === 'movie')` with `workflows.get(serviceType)`
3. Update all workflow lookups to use Map

**Files**:
- `frontend/src/app/components/workflow-display/workflow-display.component.ts`
- `frontend/src/app/services/flowwise.service.ts`

---

### Phase 3: Remove API Endpoint Calls (CRITICAL)

**Goal**: Receive workflows via WebSocket only

**Steps**:
1. Remove `loadWorkflows()` method
2. Remove API calls to `/api/workflow/movie` and `/api/workflow/dex`
3. Handle `workflow_definition_loaded` WebSocket events
4. Store workflows in Map dynamically

**Files**:
- `frontend/src/app/services/flowwise.service.ts`
- `frontend/src/app/components/workflow-display/workflow-display.component.ts`

---

### Phase 4: Remove Service Type Detection (CRITICAL)

**Goal**: Server determines service type, not Angular

**Steps**:
1. Remove `detectServiceType()` method
2. Remove hardcoded keyword checks
3. Server LLM determines service type from user input
4. Angular receives `serviceType` from `workflow_started` event

**Files**:
- `frontend/src/app/app.component.ts`

---

### Phase 5: Dynamic UI Labels (MEDIUM)

**Goal**: All UI text comes from workflow definitions

**Steps**:
1. Replace hardcoded "AMC Cinema" with `{{ activeWorkflow?.name }}`
2. Replace hardcoded icons with workflow metadata
3. Use workflow `description` for help text

**Files**:
- `frontend/src/app/app.component.html`
- `frontend/src/app/components/workflow-display/workflow-display.component.html`

---

### Phase 6: Dynamic Service Types Array (MEDIUM)

**Goal**: Service types loaded from server ServiceRegistry

**Steps**:
1. Remove hardcoded `serviceTypes` array
2. Server broadcasts available service types from ServiceRegistry
3. Angular receives and displays dynamically

**Files**:
- `frontend/src/app/app.component.ts`
- `frontend/src/app/app.component.html`

---

## 5. Verification Checklist

After implementation, adding `auto_parts.json` should require:

- [ ] **Zero TypeScript type changes** - `serviceType: string` works for any type
- [ ] **Zero component property changes** - `workflows: Map` handles all types
- [ ] **Zero API endpoint changes** - Server broadcasts all workflows
- [ ] **Zero conditional logic changes** - `workflows.get(serviceType)` works generically
- [ ] **Zero service detection changes** - Server LLM determines type
- [ ] **Zero UI label changes** - All labels from workflow definition
- [ ] **Zero service type array changes** - Loaded from server

**Only Change Needed**: Add `server/data/auto_parts.json` workflow file

---

## 6. Key Principles

1. **Server is Single Source of Truth** - All workflow definitions, service types, and execution state live on server
2. **Angular is Generic Display Layer** - No knowledge of specific service types
3. **Data-Driven Everything** - Workflows, service types, UI labels all come from server
4. **WebSocket for All State** - No API calls for workflow definitions
5. **LLM Determines Service Type** - Server-side classification, not Angular keyword matching

---

## 7. Current Blocker Summary

| Blocker | Location | Impact | Priority |
|---------|----------|--------|----------|
| Hardcoded union types | `flowwise.service.ts` | TypeScript won't accept new types | **CRITICAL** |
| Hardcoded workflow properties | `workflow-display.component.ts` | Can't store new workflows | **CRITICAL** |
| Hardcoded API endpoints | Multiple files | Can't load new workflows | **CRITICAL** |
| Hardcoded conditional logic | Multiple files | Can't route to new workflows | **CRITICAL** |
| Hardcoded service detection | `app.component.ts` | Can't detect new service types | **CRITICAL** |
| Hardcoded UI labels | HTML templates | Wrong labels for new services | **MEDIUM** |
| Hardcoded service types array | `app.component.ts` | Can't display new service types | **MEDIUM** |

---

## 8. Answer to Your Question

**Q**: If I start another Garden selling auto parts, how much code changes needed?

**A**: **ZERO** - After implementing the above changes, you only need to:
1. Add `server/data/auto_parts.json` workflow file
2. Server automatically loads it on startup
3. Server broadcasts it via WebSocket
4. Angular receives and displays it generically
5. No code changes required!

**Current State**: Would require changes in 7+ files with hardcoded 'movie' and 'dex' references.

**Target State**: Zero code changes, only data file addition.
