## z_data_webhook_llm_wizard_20260120_todo.md

Goal: **Replace “LLM-generated provider bond/data” with a deployable backend plugin provider** that supports:
1) **Data**: query a real provider database via **SQL** (read path)
2) **Webhook**: deploy/handle a provider webhook for **payment rails** (push path)
3) **Wizard UX**: make both **data + webhook testable** from the Garden generation wizard (Angular System Configurator)

This is a fast sprint plan. It is intentionally “file-level + endpoint-level” so we can execute quickly.

---

## 0) Current server architecture (facts we found)

### A) Where providers are created (gardens → providers)
- Garden wizard endpoint: `POST /api/wizard/create-garden` in `server/eden-sim-redis.ts`
  - Creates `GardenConfig` and then calls `createServiceProvidersForGarden(...)`.
  - For non-movie types, if no providers are specified, it creates a **default provider**:
    - `bond: 1000`, `reputation: 5.0`, `location: "Unknown"`, `apiEndpoint: https://api.<serviceType>.com/v1`
  - For movie, there is a predefined provider map (`amc-001`, `cinemark-001`, `moviecom-001`) with fixed bond/reputation/apiEndpoint.

### B) Where webhooks are “deployed” today
There are **three separate webhook concepts currently**:

1) **Stripe payment rail webhook receiver**
   - `POST /api/stripe/webhook` in `server/eden-sim-redis.ts`
   - This is *payment rail → Eden* (inbound to Eden).

2) **Provider webhook registration + mock receiver**
   - Registration endpoints in `server/eden-sim-redis.ts`:
     - `POST /rpc/webhook/register`
     - `POST /rpc/webhook/unregister`
     - `GET /rpc/webhook/list`
   - Mock provider receiver (simulated service provider webhook endpoint):
     - `POST /mock/webhook/:providerId`
   - Startup behavior (important):
     - In `main()` in `server/eden-sim-redis.ts`, Eden auto-registers **all providers** to:
       - `http://localhost:${HTTP_PORT}/mock/webhook/${provider.id}`
     - This is demo-only and must be replaced/disabled for “real deployable providers”.

3) **Workflow action: `deliver_webhook`**
   - Workflows include action `deliver_webhook` (many JSON workflows under `server/data/*.json`)
   - Server handler exists:
     - `server/src/flowwiseHandlers.ts` calls `deliverWebhook(...)`
   - Webhook delivery implementation:
     - `server/src/ledger.ts` `deliverWebhook(providerId, snapshot, ledgerEntry)` sends HTTP POST to the registered webhook URL.

### C) Where “LLM webhook code” is generated and shown to users
- Backend LLM code gen endpoint:
  - `POST /api/notification-code/generate` in `server/eden-sim-redis.ts`
  - Generates JSON containing `webhookCode`, `pullCode`, `rpcCode`.
- Frontend wizard uses it:
  - `frontend/src/app/components/system-config/system-config.component.ts`
  - It currently passes:
    - `indexerEndpoint: ${apiUrl}`
    - `webhookUrl: ${apiUrl}/mock/webhook/${providerId}`
  - This is “LLM-generated sample integration code”, not a real deployable provider.

---

## 1) Target architecture (what we are building)

### A) New concept: **Deployable Provider Plugin**
Instead of “LLM inventing bond/data/webhook”, we introduce **Provider Plugin** as a backend module that:
- Is a “real provider implementation” the backend can call.
- Provides two capabilities:
  1) **Data Query (SQL)**: return listings/results from a SQL database.
  2) **Webhook**: expose an inbound webhook endpoint and also (optionally) register its webhook URL into Eden for outbound notifications.

### B) Proposed plugin interface (server-side)
Define a canonical interface like:
- `queryListings(ctx): Promise<Listing[]>`
- `getWebhookInfo(ctx): { webhookUrl: string; supportsSignature: boolean; }`
- `handleWebhook(req): Promise<{ ok: boolean }>`
- `healthCheck(): Promise<Health>`

Plugin lifecycle:
- Installed/enabled per Garden (or per Provider).
- Registered in ServiceRegistry2 with:
  - `providerId`, `serviceType`, `gardenId`
  - `apiEndpoint` becomes “plugin endpoint” (internal or http)
  - `bond` becomes “deployment/credit policy” not LLM-generated.

### C) Separate responsibilities
- **LLM**: only does *query extraction* and *response formatting* (already exists).
- **Provider Plugin**: does *truthful data retrieval* + *webhook integration*.
- **Wizard**: configures and tests plugin connectivity and webhook correctness before “Create Garden”.

---

## 2) Workstream A — Backend: Provider Plugin framework

### A1) Create plugin registry + config model
- Add new module (suggested):
  - `server/src/plugins/`:
    - `types.ts` (Plugin interface + result shapes)
    - `registry.ts` (register/list/get plugins)
    - `sqlProviderPlugin.ts` (first real plugin: SQL)
    - `paymentRailWebhookPlugin.ts` (webhook handler + registration)
- Add persistence:
  - `server/eden-provider-plugins-persistence.json` (or fold into existing garden persistence under each garden).

Acceptance:
- Can load plugin configs at boot without blocking.
- Can list installed plugins via an API.

### A2) Replace “LLM bond” usage with deterministic policy
Today provider bonds are:
- fixed defaults (`bond: 1000`) or predefined maps (movie).

New rule:
- bond should come from:
  - Wizard input (explicit) OR
  - plugin config default OR
  - policy table (server constant), **never from LLM**.

Acceptance:
- LLM is not a source of truth for bond/reputation/apiEndpoint.

### A3) Provider data query path (SQL)
Add server endpoint(s):
- `POST /api/provider-plugin/sql/test-query`
  - Inputs: connection string (or DSN key), query template, parameters
  - Output: sample rows + timing + errors
- `GET /api/provider-plugin/sql/schema` (optional)

Integrate into provider listing generation:
- Identify where listings are currently sourced for each serviceType in workflow execution:
  - likely via workflow actions like `query_*` / `select_listing` (in FlowWise handlers + service registry).
- Replace “mock listings” with:
  - `plugin.queryListings(serviceType, filters, gardenId, userContext)`

Acceptance:
- For at least 1 serviceType (pilot: `airline` or `autoparts`), results come from SQL.

---

## 3) Workstream B — Backend: Webhook isolation + replacement

### B1) Stop auto-registering mock webhooks for all providers at boot
Current behavior:
- `server/eden-sim-redis.ts` registers `http://localhost:${HTTP_PORT}/mock/webhook/${provider.id}` for every provider during startup.

Replace with:
- Only register webhooks for providers that explicitly declare a webhook URL (plugin config).
- In ROOT/demo mode keep mock optional via env flag:
  - `EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS=true`

Acceptance:
- In default mode, no provider webhooks are registered automatically.

### B2) “Webhook deployment” for payment rails
We need two directions:

1) Payment Rail → Eden (inbound)
   - Keep `/api/stripe/webhook` as the real payment rail webhook receiver.
   - Add routing layer so it can call provider plugins (if required by your economics).

2) Eden → Provider (outbound)
   - Keep the `deliver_webhook` workflow action but its target URL should be:
     - plugin-provided webhook URL (not `/mock/webhook/...`)
   - `deliverWebhook(...)` stays as the transport mechanism.

### B3) Replace “LLM-generated webhook” with “deployable webhook”
Current UX generates sample code via LLM (`/api/notification-code/generate`) and points to `/mock/webhook/...`.

New UX:
- Wizard should configure:
  - real webhook URL (plugin hosted) OR
  - “backend-hosted plugin webhook endpoint” such as:
    - `POST /api/provider-plugin/:providerId/webhook`
- The wizard should still optionally generate sample code, but it must point to the real webhook URL and be treated as *documentation*, not “deployment”.

Acceptance:
- Wizard shows the webhook URL that will be used in production.
- Clicking “Test Webhook” performs a real POST and verifies:
  - signature verification (if enabled)
  - payload shape compatibility with `deliverWebhook(...)` payload

---

## 4) Workstream C — Wizard: testable data + webhook (Garden generation wizard)

### C1) Add plugin selection + config inputs to wizard
Frontend:
- `frontend/src/app/components/system-config/system-config.component.ts/.html`

Add form sections:
- **Provider Data Plugin**
  - plugin type: `sql`
  - connection info (safe handling)
  - query template / table selection
  - “Test Query” button (calls backend test endpoint)
- **Webhook Plugin**
  - webhook mode: `backend-hosted` or `external`
  - webhook URL (computed) + signature secret (optional)
  - “Test Webhook” button

### C2) Wire wizard to persist plugin config during garden creation
Backend:
- `POST /api/wizard/create-garden` should accept plugin configs and store them under:
  - garden config OR provider config OR dedicated plugin persistence file

Acceptance:
- Creating a garden results in:
  - garden persisted
  - provider persisted
  - plugin config persisted

### C3) Make it observable (debuggable)
Emit WebSocket events for:
- `provider_plugin_test_query_ok|fail`
- `provider_plugin_webhook_test_ok|fail`
- `provider_plugin_installed`

---

## 5) Sprint execution order (fast path)

### Phase 0 (same day)
- Add plan + skeleton plugin registry + disable mock webhook auto-registration behind flag.

### Phase 1 (day 1)
- Implement SQL plugin test endpoint + wizard UI “Test Query”.

### Phase 2 (day 1–2)
- Implement backend-hosted webhook endpoint + wizard “Test Webhook”.

### Phase 3 (day 2)
- Integrate plugin query into at least one serviceType workflow listing path.

---

## 6) Acceptance criteria (definition of done)

- Guest/god/priest/user workflows still run.
- A “pilot garden” created via wizard:
  - has providers in `eden-serviceRegistry-persistence.json`
  - uses **SQL-backed** listing data for at least one serviceType
  - webhook URL is **not** `/mock/webhook/...` unless explicitly chosen
  - webhook test passes from wizard
- No startup auto-registration of mock provider webhooks unless `EDEN_ENABLE_MOCK_PROVIDER_WEBHOOKS=true`.

---

## 7) Open questions (need your answer before implementation)

1) Which SQL engine do you want first: **SQLite** (fast local), **Postgres**, or **MySQL**?
2) For webhook “deploy”: do you want the webhook receiver to be:
   - **inside Eden backend** (recommended for quick sprint), or
   - truly external per provider (Eden only registers URL)?
3) For “bond replacement”: should bond be a fixed policy by serviceType, or a wizard input with min/max?


