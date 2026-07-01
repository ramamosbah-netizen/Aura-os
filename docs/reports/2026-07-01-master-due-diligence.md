# AURA OS — Master Due-Diligence Report

**Date:** 2026-07-01 · **Source of truth:** current codebase (verified by source inspection + green build/test) · **No code modified.**

**Verified counts:** 18 business modules · 40 API controllers · 384 route handlers · 91 migrations (0 duplicate numbers) · 83 `aura_*` tables · 68 web pages · 183 web BFF routes · 212 `*.test.ts` files · `pnpm typecheck` 42/42 · `pnpm test` 41/41.

---

## 1. Architecture

| Aspect | Finding | Verdict |
|---|---|---|
| Style | 5-layer monorepo: `shared → core → modules/* → intelligence → apps/*`; Clean/Hexagonal + DDD bounded contexts | ✅ Strong |
| Module boundaries | One module = one context; every store = port + in-memory + Postgres adapter, DI-swapped on `PG_POOL` | ✅ |
| Dependency direction | Inward (modules → core → shared); no module↔module imports; cross-module work via app-layer reactor | ✅ |
| Event architecture | Outbox in same tx as writes; relay (`SKIP LOCKED`) → in-process `EventBus`; works in both in-mem + Postgres runtimes | ✅ |
| Cross-module comms | `apps/api/src/events/cross-module-subscriber.ts` — **12 reactions** (deal chain + IPC→AR, backcharge→AP, low-stock→PR, COGS→GL, AMC→AR) | ✅ |
| CQRS | `CommandBus` on the spine modules only; ~half use equivalent inline `access + TX_RUNNER` | ◐ not uniform |
| Domain model | Pure factories/validators; calc logic (double-entry, WAC, EVM, EOSB, IFRS-15) lives in domain | ✅ |
| Scalability (design) | Stateless API + outbox scalable; single pg pool, no cache/queue/read-replica | ◐ design-ok, untuned |
| Maintainability | Uniform template; clean code; debt = `372` `any`/`as any`/`@ts-ignore` mostly in pg-row mappers | ◐ |

---

## 2. Backend

| Aspect | Finding | Verdict |
|---|---|---|
| API surface | 384 handlers across 40 controllers, all under `/api/v1`, literal-before-`:id`, UUID guard | ✅ |
| Services | Thin controllers → services → stores; atomic `TX_RUNNER` writes | ✅ |
| Validation | **No global `ValidationPipe` / `class-validator`** — hand-rolled `if` guards + `BadRequestException` | ❌ P1 |
| Error handling | Per-endpoint try/catch → 400; **no global exception filter / error taxonomy**; some inconsistency | ◐ |
| AuthN | JWT verify exists; **off by default** (`AUTH_REQUIRED` gate) — dev runs open | ❌ P0 |
| AuthZ | RBAC/ABAC engine + guard; conditional on a real actor → unenforced in keyless path | ◐ |
| Events / jobs | Outbox + audit solid; background jobs in-proc; **no durable queue/scheduler** | ◐ |
| Pagination | Contract exists (`PageParams`/`listPaged`) but applied in **only ~9 files** — not universal | ◐ P1 |
| Performance | In-app aggregation (aging/EVM/statements); no caching; no APM/load test | ◐ |
| OpenAPI | **None** (no `@nestjs/swagger`) | ❌ P2 |

---

## 3. Database

| Aspect | Finding | Verdict |
|---|---|---|
| Schema | 83 `aura_*` tables; consistent naming; `tenant_id` on every business table; JSONB for line-items | ✅ |
| Migrations | 91 sequential, **0 duplicate numbers** (collisions resolved); runner now has a **fail-fast dup guard** | ✅ |
| Down-migrations | **0** — no rollback path | ❌ P2 |
| Relationships | **18 FK references across 83 tables** — deliberate snapshot-not-join design; integrity rests on app code | ◐ |
| Constraints | CHECK on enums/amounts; double-entry enforced by DB trigger | ✅ |
| Transactions | Row + outbox event committed atomically | ✅ |
| Multi-tenancy | 87 tables RLS-enabled; policies via dynamic `0032` | ◐ (see Security) |
| Data integrity | Date-drift handled (`::text` / local-parts); idempotent writes on spine | ✅ |

---

## 4. Business Modules

Test counts are module-local `*.test.ts` files.

| Module | Depth | Persistence | Tests | Top remaining gap |
|---|---|---|--:|---|
| Finance | 🟢 very deep (GL, AP/AR, statements, period-close, budgets, rev-rec, cost/profit centres, multi-currency AR, PDC, BG, VAT) | ✅ | 18 | Intercompany elimination; multi-currency on AP/GL |
| Projects | 🟢 deep (WBS, CBS, EVM, delay/EOT, variations, closeout, cash-flow forecast) | ✅ | 9 | Gantt/baseline schedule |
| Procurement | 🟢 deep (PR/RFQ/PO, supplier master + FK, approval matrix, 3-way match) | ✅ | 4 | Framework/blanket POs |
| Inventory | 🟢 deep (GRN, stock, transfers, WAC valuation, reorder→auto-PR, COGS→GL) | ✅ | 3 | Batch/serial, bin locations |
| HR | 🟢 deep (employees, leave, payroll, EOSB, timesheets, attendance, WPS, claims, advances, doc-expiry) | ✅ | 8 | Appraisal, org chart |
| AMC | 🟢 (contracts, tickets, WO, PPM, **persisted**, →AR billing) | ✅ | 3 | SLA timers depth |
| Contracts | 🟢 (contracts, IPC certificates) | ✅ | 3 | Clause library, obligations |
| Subcontracts | 🟢 (subcontracts, claims, variations, back-charges→AP) | ✅ | 3 | Retention-release UI |
| CRM | 🟡 (accounts, leads, opps + account link, quotations) | ✅ | 3 | Contacts, activities, email |
| Quality | 🟡 (NCR, IR, snags, ITP, MAR) | ✅ | 3 | Calibration, audits |
| Fleet | 🟡 (vehicles, fuel, maint, fines, Salik) | ✅ | 3 | Mulkiya/licence expiry, telematics |
| Tendering | 🟡 (tenders, BOQ) | ✅ | 2 | Bid scoring, estimate build-up |
| Assets | 🟡 (register, depreciation, inspections) | ✅ | 2 | Disposal/GL, QR |
| HSE | 🟡 (incidents, PTW, CAPA, toolbox) | ✅ | 2 | Risk assessment, training matrix |
| Site | 🟡 (diaries, delays, materials, SI) | ✅ | 2 | Labour-by-trade, progress % |
| Doc-Control | 🟡 (transmittals, correspondence, submittals) | ✅ | 2 | Drawing register |
| Engineering | 🔴 thin (drawings, RFIs, submittals) | ✅ | 1 | TQ/MAR, weakest tests |

---

## 5. Business Logic (verified correct in domain)

| Area | Verified |
|---|---|
| Finance | Double-entry balance (DB trigger); GL-derived P&L/BS/CF + trial balance; period-close blocks posting; budget-vs-actual folds GL; IFRS-15 cost-to-cost rev-rec; cost-centre net + profit-centre contribution; multi-currency base conversion |
| Inventory | Moving WAC re-average on receipt; COGS at WAC on issue; perpetual GL (Dr Inv/Cr GRNI, Dr COGS/Cr Inv); reorder threshold-crossing → one PR |
| Procurement | Approved-vendor enforced on PO; threshold approval matrix; server-side 3-way match (PO/GRN/invoice) |
| Projects | EVM (CPI/SPI); closeout DLP date; cash-flow cumulative S-curve + peak funding |
| HR | EOSB UAE bands; WPS SIF (SCR/EDR); attendance worked-hours |
| AMC | PPM next-due advance; WO completion → AR invoice |

---

## 6. End-to-End Workflow (Lead → Warranty)

| Stage | State |
|---|---|
| Lead → Opportunity → Quotation | ✅ |
| Opportunity won → Tender | ✅ auto (reactor, idempotent) |
| Tender awarded → Contract | ✅ auto |
| Contract signed → Project (+WBS/CBS seed) | ✅ auto |
| Project → Procurement (PR→RFQ→PO→GRN) | ✅ |
| Procurement → Inventory (stock, WAC, COGS→GL) | ✅ auto |
| Inventory/AMC/IPC/backcharge → Finance (AR/AP/GL) | ✅ auto (reactors) |
| Progress billing → IPC → AR | ✅ |
| Closeout (handover + DLP) | ✅ (new) |
| Warranty / DLP tracking post-closeout | ◐ DLP end-date computed; no warranty-claim workflow |
| **Manual/broken steps** | Quotation→Tender is not auto; warranty-claim handling absent |

---

## 7. UI / UX

| Aspect | Finding |
|---|---|
| Page coverage | 68 pages + 183 BFF routes; single `nav.ts` source (sidebar + ⌘K) | 
| Forms/tables | Consistent inline forms + tables across modules | 
| Validation UX | ❌ server-side only; no inline/field-level |
| Dashboards / charts | ❌ none (tables only; no KPI tiles, no charts for EVM/aging/cashflow) |
| Design system | ❌ inline-style objects; no Tailwind/shadcn/MUI |
| a11y / responsive / mobile | ❌ unaudited; no mobile/PWA |
| Dark mode / search | ✅ |
| Edge apps | ❌ 0 of: customer portal, supplier portal, mobile workforce, BI |

---

## 8. API Coverage

| Aspect | Finding |
|---|---|
| Consistency | ✅ uniform `/api/v1/<module>/<resource>`, idempotency-key on spine creates |
| Missing CRUD | Several masters list/create only (no update/delete on cost/profit centres, suppliers patch-only) |
| Filtering | Present on list endpoints (status/project/etc.) |
| Pagination | ◐ contract exists, applied to ~9 files only |
| Duplicates | Two multi-currency approaches now on main (PR #13 FX registry vs invoice-level fields) — redundant, non-colliding |
| OpenAPI | ❌ none |

---

## 9. Security

| Control | Finding | Sev |
|---|---|---|
| Tenant isolation | App-level only; app connects via **service role that bypasses RLS**; **no `FORCE ROW LEVEL SECURITY`**, no least-priv role | P0 |
| AuthN | Off by default; no session/refresh/SSO/MFA | P0 |
| Secrets | Plaintext `.env.local` (live Supabase service key + DB password); no vault/rotation; no field encryption for PII | P0 |
| Input validation | Parameterized SQL (no SQLi) ✅; but no schema validation / output-encoding audit | P1 |
| Audit logs | Immutable audit trail present | ✅ |

---

## 10. Testing

| Layer | Finding | Sev |
|---|---|---|
| Unit | 212 test files; strong domain/calc coverage (Finance 18) | ✅ |
| Integration | **1** live-Postgres test (journal trigger); thin | P1 |
| E2E (HTTP/browser) | **None** (no supertest/Playwright) | P1 |
| Coverage gate | None measured/enforced | P2 |
| Weakest modules | Engineering (1), HSE/Site/Assets/DocControl (2) | — |

---

## 11. Production Readiness

| Aspect | State | Sev |
|---|---|---|
| CI/CD | ❌ no `.github/workflows` | P0 |
| Docker / IaC / deploy | ❌ none | P0 |
| Observability (OTel/Prometheus) | ❌ none | P1 |
| Structured logging | ◐ Nest Logger text; correlation-id only | P2 |
| Backups / DR | ❌ undocumented (Supabase defaults) | P0 |
| Notifications delivery | ❌ no email/SMS provider wired | P2 |

---

## 12. Customer Perspective

| Role | Can do daily work? | Blocker |
|---|---|---|
| CEO | ◐ | No BI/exec dashboard; data exists, no visualization |
| Project Manager | ✅ mostly | No Gantt/baseline; cash-flow is data-entry not auto-derived |
| Accountant | ✅ | Statements/period-close/budgets/rev-rec/multi-currency all present; no statements-by-currency consolidation |
| Procurement Officer | ✅ | PR→PO→GRN, approval matrix, 3-way match, approved vendors all work |
| Site Engineer | ◐ | Diaries/SI/quality work; no mobile, no progress-%/labour-by-trade |
| HR Officer | ✅ | Payroll, WPS, attendance, EOSB, doc-expiry all work |
| Maintenance Manager | ✅ | AMC persisted, PPM, WO→AR billing work |

---

## 13. Gap Analysis (current, de-duplicated)

| # | Gap | Priority |
|---|---|--:|
| 1 | DB-enforced tenancy (FORCE RLS + least-priv app role + per-request tenant GUC) | P0 |
| 2 | Auth on by default + session/refresh; secrets to vault + rotate; PII encryption | P0 |
| 3 | CI/CD pipeline (lint+typecheck+test+build+migration gate) | P0 |
| 4 | Containerization + deploy config | P0 |
| 5 | Backups + restore drill + documented RTO/RPO | P0 |
| 6 | Global `ValidationPipe` + DTO schemas | P1 |
| 7 | Universal pagination contract across all list endpoints | P1 |
| 8 | Observability (OTel traces, metrics, structured logs, health/alerts) | P1 |
| 9 | E2E (supertest spine flows) + Playwright smoke + coverage gate | P1 |
| 10 | Consolidate duplicate valuation + multi-currency implementations (PR #13 vs #14) | P1 |
| 11 | BI / module dashboards / charts (EVM, aging, cash-flow S-curve) | P1 |
| 12 | Notifications delivery (email/SMS) wired to events | P2 |
| 13 | OpenAPI spec + global exception filter | P2 |
| 14 | Down-migrations / rollback policy | P2 |
| 15 | Projects Gantt/baseline; Finance intercompany; multi-currency on AP/GL | P2 |
| 16 | Warranty/DLP claim workflow; Quotation→Tender automation | P2 |
| 17 | Design system + a11y + responsive/mobile | P2 |
| 18 | Edge apps (customer/supplier portals, mobile, BI) | P3 |
| 19 | `.gitattributes` (`* text=auto eol=lf`) to end CRLF churn | P3 |
| 20 | Type the ~372 `any` pg-row mappers; roll CommandBus to non-spine modules | P3 |

No previously-reported items remain that are now done: AMC persistence, deal-chain automation, IPC/AR, inventory valuation, migration collisions, supplier FK, approval matrix, 3-way match, period-close, statements, budgets, rev-rec, WPS, attendance, closeout — **all closed**.

---

## 14. Overall Assessment

| Dimension | Score /100 |
|---|--:|
| Architecture | 85 |
| Backend | 70 |
| Database | 74 |
| Business Logic | 80 |
| UI/UX | 52 |
| API | 68 |
| Workflows | 75 |
| Security | 38 |
| Testing | 48 |
| Production Readiness | 20 |
| Commercial Readiness | 45 |
| **Engineering completion (weighted)** | **~68%** |

---

## 15. Final Recommendations (all remaining work, by tier)

**P0 — production blockers (must precede customer data)**
- DB-enforced multi-tenancy (FORCE RLS + least-priv role + tenant GUC + live two-tenant denial test).
- Auth on by default + session/refresh; move secrets to a vault, rotate keys, encrypt PII.
- CI/CD pipeline with migration-check gate.
- Containerize + deploy config (staging/prod).
- Automated backups + restore drill + RTO/RPO.

**P1 — correctness, assurance, scale**
- Global `ValidationPipe` + DTOs; global exception filter.
- Universal pagination contract across all list endpoints.
- Observability: OTel traces, Prometheus metrics, structured JSON logs, health/readiness, alerts.
- E2E (supertest for the 4 spine chains) + Playwright smoke + coverage threshold in CI.
- Consolidate the duplicate valuation + multi-currency implementations into one.
- BI/dashboards + charts (EVM, AR/AP aging, cash-flow S-curve).

**P2 — depth, API, hygiene**
- Notifications delivery (email/SMS) on events.
- OpenAPI spec; down-migrations/rollback policy.
- Projects Gantt/baseline; Finance intercompany elimination; multi-currency on AP + GL.
- Warranty/DLP claim workflow; Quotation→Tender automation.
- Design system + a11y + responsive/mobile.

**P3 — breadth & cleanup**
- Edge apps (customer/supplier portals, mobile workforce, BI app).
- `.gitattributes` EOL fix; type the `any` mappers; CommandBus uniformity.

---

*Verified from source against the live tree; build/typecheck/test green at time of writing. No source modified — this report is the sole artifact.*
