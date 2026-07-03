# Volume 9 — API Documentation

[← Master index](README.md)

**Verified surface (2026-07-03):** 551 REST handlers · 32 controller areas · all under
`/api/v1` · UUID route guards · idempotency keys on spine creates · 204 web BFF pass-through
routes.

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
| Errors | 400 with `{error|message}`; 404 on missing; per-endpoint try/catch (global exception filter [Gap]) |
| Filtering | query params on lists (`status`, `projectId`, date ranges) |
| Pagination | `PageParams`/`listPaged` contract exists; adopted on ~9 heavy lists — universal adoption [P1] |

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

## 5. SDK

`core/src/integration/sdk-generator.service.ts` — generates typed TS clients from route
metadata. Published SDK package + docs site [Planned]. **OpenAPI spec is the prerequisite gap**
(P2): adding `@nestjs/swagger` annotations unlocks generated docs, contract tests, and
third-party codegen simultaneously.

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
| OpenAPI/Swagger spec | P2 (unlocks SDK/docs/contract tests) |
| Global exception filter + error taxonomy | P1 |
| Universal pagination adoption | P1 |
| Full CRUD on some masters (cost/profit centres update/delete) | P2 |
| API versioning policy beyond `/v1` prefix | P3 |

---

*Next: [Volume 10 — UI / UX System](vol-10-ui-ux.md)*
