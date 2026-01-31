# Workflow Architecture Proposal: Dynamic JSON Mapping

## Question
**Option 1**: ROOT CA pre-generates and certifies workflows, then Garden wizard assigns them based on service types (movie, dex, autoparts, etc.) to tie them to service providers.

**Option 2**: Server/data JSON files marry service types (e.g., `movie` → `movie.json`) dynamically after a carefully designed Garden wizard step (to be implemented later).

## Recommendation: **Option 2 (Dynamic JSON Mapping)**

---

## Why Option 2 is Better

### 1. **Zero Code Changes Principle**
- Adding `autoparts.json` requires **zero code changes**
- Just follow naming convention: `${serviceType}.json`
- No wizard changes needed
- No certification registry to manage

### 2. **Simplicity**
- **Current**: Hardcoded mapping `serviceType === "movie" ? "amc_cinema.json" : "dex.json"`
- **Target**: Dynamic mapping `${serviceType}.json`
- No complex certification workflow
- No wizard integration required

### 3. **Flexibility**
- Can have multiple workflows per service type later:
  - `movie.json` (default)
  - `movie_premium.json` (premium tier)
  - `movie_basic.json` (basic tier)
- Easy to A/B test different workflows
- Easy to version workflows (`movie_v2.json`)

### 4. **ROOT CA Validation Still Happens**
- ROOT CA validates workflow structure **at runtime** (already implemented)
- `validateFlowWiseServiceCertificate()` ensures only certified FlowWiseService executes
- Workflow actions are validated when executed
- No need for pre-certification - runtime validation is sufficient

### 5. **Garden Wizard Integration (Future)**
- Wizard can still assign workflows to service providers
- But it's **optional metadata**, not required
- Wizard can store: `{ providerId: "amc-001", workflowFile: "movie.json" }`
- If not specified, defaults to `${serviceType}.json`

---

## Current Implementation (Hardcoded)

```typescript
// server/src/components/flowwiseService.ts
export function loadWorkflowDefinition(serviceType: "movie" | "dex"): FlowWiseWorkflow | null {
  const filename = serviceType === "movie" ? "amc_cinema.json" : "dex.json";
  const filePath = path.join(workflowDataPath, filename);
  // ...
}
```

**Problems**:
- ❌ Hardcoded union type `"movie" | "dex"` - can't add new types
- ❌ Hardcoded filename mapping - `movie` → `amc_cinema.json` (inconsistent)
- ❌ Requires code change for each new service type

---

## Proposed Implementation (Dynamic)

### Phase 1: Dynamic File Mapping

```typescript
// server/src/components/flowwiseService.ts
export function loadWorkflowDefinition(serviceType: string): FlowWiseWorkflow | null {
  try {
    // Dynamic mapping: serviceType → ${serviceType}.json
    const filename = `${serviceType}.json`;
    const filePath = path.join(workflowDataPath, filename);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ [FlowWiseService] Workflow file not found: ${filePath}`);
      return null;
    }
    
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(fileContent);
    
    if (!data.flowwiseWorkflow) {
      console.error(`❌ [FlowWiseService] No flowwiseWorkflow found in ${filename}`);
      return null;
    }
    
    // ROOT CA Runtime Validation
    const validationResult = validateWorkflowStructure(data.flowwiseWorkflow);
    if (!validationResult.valid) {
      console.error(`❌ [FlowWiseService] Workflow validation failed:`, validationResult.errors);
      return null;
    }
    
    console.log(`✅ [FlowWiseService] Loaded workflow: ${data.flowwiseWorkflow.name} (${data.flowwiseWorkflow.version})`);
    return data.flowwiseWorkflow;
  } catch (error: any) {
    console.error(`❌ [FlowWiseService] Error loading workflow:`, error.message);
    return null;
  }
}

/**
 * ROOT CA Runtime Validation
 * Validates workflow structure before execution
 */
function validateWorkflowStructure(workflow: FlowWiseWorkflow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required fields
  if (!workflow.name) errors.push("Missing workflow.name");
  if (!workflow.initialStep) errors.push("Missing workflow.initialStep");
  if (!workflow.steps || !Array.isArray(workflow.steps)) {
    errors.push("Missing or invalid workflow.steps");
  }
  
  // Validate steps reference initialStep
  if (workflow.steps && workflow.initialStep) {
    const stepIds = workflow.steps.map(s => s.id);
    if (!stepIds.includes(workflow.initialStep)) {
      errors.push(`Initial step '${workflow.initialStep}' not found in steps`);
    }
  }
  
  // Validate transitions reference valid steps
  if (workflow.transitions && workflow.steps) {
    const stepIds = workflow.steps.map(s => s.id);
    for (const transition of workflow.transitions) {
      if (!stepIds.includes(transition.from)) {
        errors.push(`Transition from '${transition.from}' references non-existent step`);
      }
      if (!stepIds.includes(transition.to)) {
        errors.push(`Transition to '${transition.to}' references non-existent step`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

### Phase 2: Auto-Discover Workflows (Optional)

```typescript
/**
 * Auto-discover all workflow files in data directory
 * Returns map of serviceType → workflow metadata
 */
export function discoverWorkflows(): Map<string, { name: string; version: string; file: string }> {
  const workflows = new Map<string, { name: string; version: string; file: string }>();
  
  try {
    const files = fs.readdirSync(workflowDataPath);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(workflowDataPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        if (data.flowwiseWorkflow) {
          const serviceType = file.replace('.json', '');
          workflows.set(serviceType, {
            name: data.flowwiseWorkflow.name,
            version: data.flowwiseWorkflow.version || '1.0.0',
            file: file
          });
        }
      }
    }
  } catch (error: any) {
    console.error(`❌ [FlowWiseService] Error discovering workflows:`, error.message);
  }
  
  return workflows;
}
```

### Phase 3: Garden Wizard Integration (Future)

```typescript
/**
 * Load workflow for service provider
 * Supports:
 * 1. Provider-specific workflow (from wizard assignment)
 * 2. Service type default workflow (${serviceType}.json)
 */
export function loadWorkflowForProvider(
  providerId: string,
  serviceType: string
): FlowWiseWorkflow | null {
  // Check if provider has assigned workflow (from Garden wizard)
  const providerWorkflow = getProviderWorkflowAssignment(providerId);
  if (providerWorkflow) {
    console.log(`📋 [FlowWiseService] Using provider-assigned workflow: ${providerWorkflow}`);
    return loadWorkflowDefinition(providerWorkflow);
  }
  
  // Fallback to service type default
  console.log(`📋 [FlowWiseService] Using service type default workflow: ${serviceType}.json`);
  return loadWorkflowDefinition(serviceType);
}

/**
 * Get workflow assignment for provider (from Garden wizard metadata)
 * Returns workflow filename if assigned, null otherwise
 */
function getProviderWorkflowAssignment(providerId: string): string | null {
  // This would query ServiceRegistry or Garden metadata
  // For now, return null (use default)
  return null;
}
```

---

## File Naming Convention

### Standard Pattern
```
${serviceType}.json
```

### Examples
- `movie.json` → Movie ticket booking workflow
- `dex.json` → DEX token trading workflow
- `autoparts.json` → Auto parts ordering workflow
- `hotel.json` → Hotel booking workflow
- `restaurant.json` → Restaurant reservation workflow

### Future: Multiple Workflows per Service Type
- `movie.json` (default)
- `movie_premium.json` (premium tier)
- `movie_basic.json` (basic tier)

**Selection Logic**:
```typescript
// Check for tier-specific workflow first
const tierWorkflow = loadWorkflowDefinition(`${serviceType}_${tier}`);
if (tierWorkflow) return tierWorkflow;

// Fallback to default
return loadWorkflowDefinition(serviceType);
```

---

## Migration Plan

### Step 1: Rename Existing Files
- `amc_cinema.json` → `movie.json`
- `dex.json` → `dex.json` (already correct)

### Step 2: Update Code
- Change `loadWorkflowDefinition(serviceType: "movie" | "dex")` → `loadWorkflowDefinition(serviceType: string)`
- Remove hardcoded filename mapping
- Add runtime validation

### Step 3: Test
- Verify `movie.json` loads correctly
- Verify `dex.json` loads correctly
- Test with non-existent service type (should return null gracefully)

### Step 4: Add New Workflows
- Add `autoparts.json` (zero code changes!)
- Server automatically discovers it
- ROOT CA validates at runtime

---

## ROOT CA Security Model

### Current (Already Implemented)
- ✅ FlowWiseService is certified by ROOT CA
- ✅ `validateFlowWiseServiceCertificate()` checks before each workflow execution
- ✅ Prevents "ghost workflows" from unauthorized services

### Proposed Addition (Runtime Validation)
- ✅ Validate workflow structure before loading
- ✅ Ensure workflow follows required schema
- ✅ Validate step references and transitions
- ✅ Log validation failures for audit

### Not Needed (Pre-Certification)
- ❌ Pre-certifying individual workflow files
- ❌ Workflow certification registry
- ❌ Wizard workflow assignment requirement

**Reason**: Runtime validation is sufficient. ROOT CA already certifies FlowWiseService, which ensures only authorized services can execute workflows. Individual workflow files don't need separate certification - they're just data.

---

## Garden Wizard Integration (Future)

### Optional Metadata
```json
{
  "providerId": "amc-001",
  "name": "AMC Theatres",
  "serviceType": "movie",
  "workflowFile": "movie.json",  // Optional: defaults to ${serviceType}.json
  "workflowVersion": "1.0.0"     // Optional: for versioning
}
```

### Wizard Flow
1. User creates new Garden/service provider
2. Wizard asks: "Select workflow" (optional)
   - Default: `${serviceType}.json`
   - Custom: Select from discovered workflows
3. Wizard stores assignment in ServiceRegistry
4. FlowWiseService uses assignment if present, otherwise defaults

### Benefits
- **Flexible**: Can assign custom workflows to specific providers
- **Optional**: Defaults work without wizard changes
- **Future-proof**: Can add workflow selection UI later

---

## Summary

**Option 2 (Dynamic JSON Mapping)** is the right choice because:

1. ✅ **Zero code changes** for new service types
2. ✅ **Simple naming convention**: `${serviceType}.json`
3. ✅ **ROOT CA validation** happens at runtime (already implemented)
4. ✅ **Flexible** for future enhancements (multiple workflows, wizard integration)
5. ✅ **No complex certification workflow** needed
6. ✅ **Easy to test and iterate** (just add JSON file)

**Implementation**:
- Change `loadWorkflowDefinition(serviceType: string)` to accept any string
- Use `${serviceType}.json` naming convention
- Add runtime workflow structure validation
- Rename `amc_cinema.json` → `movie.json` for consistency

**Future Enhancement**:
- Garden wizard can optionally assign custom workflows to providers
- But it's **optional metadata**, not required
- Defaults to `${serviceType}.json` if not specified

