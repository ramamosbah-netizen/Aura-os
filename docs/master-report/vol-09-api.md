# Volume 9 — API Documentation

[← Master index](README.md)

**Verified surface (2026-07-03):** 551 REST handlers · 32 controller areas · all under
`/api/v1` · UUID route guards · idempotency keys on spine creates · 204 web BFF pass-through
routes.

> **Full endpoint reference (every method/path/handler): [Volume 9A](vol-09a-endpoint-reference.md)** —
> generated from controller sources.

---

## 1. REST

### 1.1 Conventions (uniform across the surface)

| Convention | Rule |
|---|---|
| Base path | `/api/v1/<module>/<resource>` |
| Identity | `Authorization: Bearer <JWT>` (enforcement env-gated — Volume 7); tenant derived from token/context headers |
| IDs | UUID path params validated by kernel `uuid.pipe` |
| Route ordering | literal routes before `:id` (prevents shadowing) |
| Creates | `POST /<resource>` with `Idempotency-Key` honored on spine modules (interceptor + store) |
| Updates | `PATCH /<resource>/:id` partial update (undefined-stripping server-side) on the six spine entities + others; lifecycle verbs as explicit sub-routes |
| Lifecycle verbs | `PUT /<resource>/:id/<verb>` — e.g. `/approve`, `/submit`, `/certify`, `/close`, `/resolve` |
| Errors | global exception filter + enforced taxonomy (`classifyDomainMessage` → 400/403/404/409; CI fitness test blocks 500-escapes) — ✅ done 2026-07-06/07 |
| Filtering | query params on lists (`status`, `projectId`, date ranges) |
| Pagination | additive `GET .../paged` `Page<T>` routes across all modules (73 routes incl. site tails); frontend opt-in live on `/crm/accounts` — ✅ done 2026-07-08 |

### 1.2 Endpoint map (handlers per area, verified)

finance 93 · projects 41 · hr 41 · quality 33 · procurement 33 · crm 32 · engineering 26 ·
tendering 25 · contracts 23 · fleet 22 · amc 22 · subcontracts 20 · inventory 19 · hse 19 ·
doccontrol 16 · site 15 · assets 15 · intelligence 11 · builder 9 · templates 5 · documents 5 ·
workflow 4 · auth 3 · events 3 · integration 3 · notifications 3 · views 3 · ai 2 · audit 2 ·
health 1 · inbox 1 · search 1.

### 1.3 Worked example — Tender lifecycle

```
POST   /api/v1/tendering/tenders                     create (Idempotency-Key)
GET    /api/v1/tendering/tenders?status=submitted    list + filter
GET    /api/v1/tendering/tenders/:id                 read
PATCH  /api/v1/tendering/tenders/:id                 partial update
PATCH  /api/v1/tendering/tenders/:id/status          lifecycle transition
POST   /api/v1/tendering/tenders/:id/documents       upload (multipart)
POST   /api/v1/tendering/boq | estimates | bid-scores | win-loss
```

### 1.4 BFF layer

`apps/web/app/api/**` (204 routes) — the web app never calls `/api/v1` directly from the
browser; BFF routes proxy with session/header handling and occasionally reshape. Rule enforced
by review: BFF must forward every field the API accepts (historic field-stripping bugs fixed
2026-07-03).

## 2. GraphQL

**[Gap — deliberate].** Decision recorded here: REST-first because the BFF pattern already
solves client-shaping, and the metadata platform (entity registry) will eventually generate
whatever query surface is needed. Revisit when external integrators demand it (Volume 20 V3).

## 3. Events (async API)

The event catalog (71 types, `shared/src/events/catalog.ts`) is a public contract: names are
versioned by convention (`<context>.<entity>.<verb>`), payloads typed. Consumers: in-process
subscribers today; external consumers via webhooks (§4). Event stream inspection:
`GET /api/v1/events` + `/events` page; dead-letter with replay.

## 4. Webhooks

`POST /api/v1/integration/webhooks` — subscribe a URL to event types. Deliveries are **signed**
(HMAC), retried with backoff by a worker (migration 0012), dead-lettered on exhaustion.
Management UI [Planned — admin center].

## 5. SDK — ✅ DONE 2026-07-09 (gap #21 closed)

**`@aura/sdk`** (`packages/sdk`): a typed TS client **generated from the live OpenAPI
document** (`scripts/generate-sdk.mjs` boots the built API in-memory or takes `SPEC_URL`),
646 operations, method names from operation ids (`crmAccountsCreate`, `financeInvoicesList`…).
The hand-written core carries the platform contracts: `AuraApiError` mapping the **enforced
error taxonomy** (VALIDATION/AUTH/FORBIDDEN/NOT_FOUND/CONFLICT/RATE_LIMITED/SERVER),
`Idempotency-Key` support, `Page<T>`, token rotation. **CI regenerates against the built API
and fails on drift**, so the SDK can never fall behind the routes. Verified live end-to-end
(login → create → paged list → 404→NOT_FOUND). Payload types are `unknown` today and tighten
as DTOs gain swagger schemas. API docs remain served at `/api/docs` (Swagger UI).
The older `core/src/integration/sdk-generator.service.ts` (command-style stub emitter) is
superseded by this package.

## 6. Examples

```bash
# Create a supplier invoice matched to a PO
curl -X POST $HOST/api/v1/finance/invoices \
  -H "Authorization: Bearer $JWT" -H "content-type: application/json" \
  -H "Idempotency-Key: 7f3e…" \
  -d '{"reference":"INV-2026-0042","supplierId":"…","poId":"…","lines":[…]}'

# Approve it (3-way match runs server-side)
curl -X PUT $HOST/api/v1/finance/invoices/$ID/approve -H "Authorization: Bearer $JWT"

# Subscribe an external system to GL postings
curl -X POST $HOST/api/v1/integration/webhooks \
  -d '{"url":"https://erp-bridge.example/hook","events":["finance.journal.posted"],"secret":"…"}'

# Ask the platform AI (provider-agnostic seam)
curl -X POST $HOST/api/v1/ai/complete -d '{"messages":[{"role":"user","content":"…"}]}'
```

## 7. API gaps (consolidated)

| Gap | Sev |
|---|---|
| OpenAPI/Swagger spec | ✅ done (spec at `/api/docs-json`, UI at `/api/docs`) |
| Global exception filter + error taxonomy | ✅ done 2026-07-06/07 (`classifyDomainMessage` + CI fitness test; wrappers retired) |
| Global validation layer (form half) | ✅ done 2026-07-08 (`assertFormValid` on every metadata-form endpoint: employee, quotation, subcontract) |
| Universal pagination adoption | ✅ done 2026-07-08 (73 `/paged` `Page<T>` routes incl. site tails; frontend opt-in live on `/crm/accounts`) |
| Full CRUD on some masters (cost/profit centres update/delete) | P2 |
| API versioning policy beyond `/v1` prefix | P3 |

---

*Next: [Volume 10 — UI / UX System](vol-10-ui-ux.md)*
