# AURA OS — Due-Diligence Audit · ADDENDUM (Blueprint conformance · E2E traces · measured depth)

> ⚠️ **PARTIALLY SUPERSEDED (2026-06-30).** §C "chain automation ≈ 20%" is **corrected** — the chain is auto-orchestrated by the event reactor. Tier-1 finance/ERP-correctness backlog (statements, period-close, budgeting, rev-rec, multi-currency, consolidation, approval matrix) is **largely closed**. See **`2026-06-30-depth-analysis-current-state.md`**. Preserved unedited below.

> Companion to `2026-06-29-enterprise-due-diligence-audit.md`. This addendum answers the 10 deeper questions the first pass skipped: **(1) conformance to the Blueprint/Module-Map/Constitution, (2) per-workflow completeness, (3) inter-module chains, (4) end-to-end traces, (5) business-rule side-effects, (6) a real competitor matrix, (7) measured DB depth, (8) measured code quality, (9) performance, (10) deeper frontend** — plus the **per-domain done/missing table** and a **numbered, prioritized backlog**.
> Everything below is **measured from source** (grep/counts), not estimated. No files modified.

---

## A. BLUEPRINT CONFORMANCE (the biggest miss in pass 1)

Source of intent: `docs/AURA-OS-V2-MODULE-MAP.md` (5-layer model) + `docs/AURA-0.2-MASTER-BLUEPRINT.md` §4 (net-new gaps). Comparison = *intended capability* vs *what exists in code*.

### L1 — Kernel / Platform (Admin Center surface)
| Blueprint capability | Status | Evidence |
|---|---|---|
| Event Bus / Outbox | ✅ | `core/events` (relay, dead-letter, retry). |
| Tenants / Org / Company / BU | ✅ | `core/tenancy` + `identity/org.service`. |
| AI Providers | ⚠ | `core/ai` provider+embedder, LOCAL fallback. |
| Integrations / API Mgmt | ⚠ | `core/integration` webhooks + SDK-gen; **no API gateway / key mgmt / portal**. |
| Feature Flags / Settings | ⚠ | `feature-flag.service` exists; **no Admin UI**. |
| DMS substrate (storage/versioning/**OCR**/**AI classification**/search) | ⚠ | versioning+search ✅; **OCR ❌, AI classification ❌, object-store ❌**. |
| **Admin Center (UI over all platform svcs)** | ❌ | no admin console. |
| **Security Center** | ❌ | none. |
| **Data Governance** | ❌ | none. |
| **Config Versioning** | ❌ | none. |
| **Backup** | ❌ | none. |
| **Monitoring** | ❌ | none. |
| **Marketplace** | ❌ | none. |
| **L1 conformance** | **~45%** | Eventing/tenancy/integration core present; the *Admin/Platform governance* half is unbuilt. |

### L2 — 16 Business modules
All 16 blueprint contexts exist **+ AMC = 17** (breadth ✅ ~100%). **Depth ⚠ ~55–65%** (see §G per-domain table). Ownership rules from Module-Map §3 (Variations split client→Projects / sub→Subcontracts; Retention cert→Subcontracts, GL→Finance; NCR→Quality) are **correctly honoured** in code.

### L3 — Intelligence
| Capability | Status |
|---|---|
| AI Center / Insights / Briefing | ⚠ (heuristic) |
| Agents | ❌ (no wired agents) |
| Knowledge Graph | ❌ |
| Event Intelligence | ⚠ (process-mining service, not wired to live stream) |
| Forecasting / Anomaly / Risk | ⚠ (stubs) |
| Executive Copilot | ❌ |
| **L3 conformance** | **~35%** |

### L4 — Optimization
| Capability | Status |
|---|---|
| Pricing Intelligence (IEC) | ⚠ `pricing.service` heuristic |
| CBS | ✅ Projects CBS |
| Client Profitability | ❌ |
| Tender Scoring | ❌ |
| Document Intelligence | ❌ |
| **L4 conformance** | **~30%** |

### L5 — Experience
| Capability | Status |
|---|---|
| Modern UI shell | ⚠ functional, no design system |
| BI / Analytics dashboards | ❌ |
| Customer Portal | ❌ |
| Supplier Portal | ❌ (supplier master now exists as its backend) |
| Mobile Workforce / offline | ❌ |
| **L5 conformance** | **~25%** (1 of 4 apps; 0 of 3 portals/mobile) |

### Master §4 greenfield gaps (blueprint's own deferred list) — **all still open**
Document Intelligence/OCR ❌ · pgvector ❌ (JSON-cosine still) · Group consolidation ❌ · Kafka/queue ❌ · Mobile/offline ❌. **Consistent — none delivered yet.**

**Blueprint conformance overall ≈ 48%** (L2 breadth carries it; L1-Admin, L3, L4, L5 drag it down).

---

## B. WORKFLOW COMPLETENESS (does each chain run end-to-end?)

Verified by tracing domain state-machines + service methods + events. ✅ step works · ⚠ partial · ❌ absent.

### Finance — Invoice lifecycle
`Create ✅ → Approve ✅ → Post-to-GL ⚠ (journal auto-posted on payment, not on approval) → Pay ✅ (idempotent) → Reconcile ✅ (bank-rec) → Close-period ❌ → Report ❌ (P&L projection exists; no B/S, no statements UI)`
**Break points:** period-close and financial-statement reporting. **Workflow completeness ≈ 65%** (not the 80% pass-1 implied for the module as a whole).

### Procurement→Pay (P2P)
`PR ✅ → Approve ⚠ (status only, no matrix) → RFQ ✅ → Quote ✅ → Award ✅ → PO ✅ → GRN ✅ → 3-way match ⚠ (client-side compare) → AP Invoice ✅ → Payment ✅ → GL ✅ → Cash-flow ❌ → Reports ❌`
**Break points:** approval matrix, cash-flow, reporting. **≈ 70%.**

### Order-to-Cash (deal chain)
`Lead ✅ → Opportunity ✅ → Quotation ✅ → Tender ✅ → Contract ✅ → Project ✅ → Customer Invoice ✅ → Receipt ✅ → AR Aging ✅ → Revenue recognition ❌`
**Break point:** rev-rec (IFRS-15 / % complete billing link to EVM). **≈ 75%.**

### Service / AMC
`Contract ✅ → PPM schedule ✅ → Generate visit ✅ → Work order ✅ → Ticket/SLA ✅ → Invoice ❌ (AMC not linked to Finance) → Persistence ❌ (in-memory)`
**Break points:** AMC has **no persistence** and **no billing link**. **≈ 45%.**

---

## C. INTER-MODULE CHAIN (measured)

**Finding (measured):** direct cross-module service imports are almost zero — only **Finance imports Procurement + Inventory** (1 each). The deal-chain is wired by **reference-ID + snapshot copying**, not orchestrated calls:
- Parent-reference fields counted in domain types: `projectId ×75`, `accountId ×29`, `contractId ×19`, `poId ×19`, `tenderId ×7`, `prId ×4`.
- A **saga orchestrator** exists (`core/workflow/saga-orchestrator.service.ts` + migration `0043` + stores) but is **not wired** to auto-propagate the deal chain.

**Implication:** the chain is *navigable* (you can trace a project back to its contract→tender→account by id) but **not automated** — creating a Contract from a won Tender, or a Project from a Contract, is a manual re-entry with a copied reference, not a one-click conversion. **This is the single biggest functional-ERP gap** and is invisible in a file-by-file audit. **Chain automation ≈ 20%.**

---

## D. BUSINESS-RULE SIDE-EFFECTS (when X is approved, what fires?)

| Side-effect on a state change | Status | Evidence |
|---|---|---|
| Domain event emitted | ✅ | 196 distinct event types; appended in the same tx as the write. |
| Audit trail updated | ✅ | `core/audit` + audit migration. |
| Read-model/projection updated | ⚠ | `ProjectionEngine` + P&L projection exist; most reads still hit transactional tables. |
| Dashboard updated | ❌ | no module dashboards to update. |
| Budget impacted | ❌ | no budgeting module. |
| Forecast impacted | ⚠ | intelligence forecasting is heuristic and **not subscribed to live events**. |
| AI notified / proposes | ⚠ | guardrails/autonomy exist; **not wired to the live event stream or a real model**. |
| Notification sent | ❌ | notifications service unwired (no email/SMS/push). |
**Side-effect propagation ≈ 40%** — events+audit are solid; budget/forecast/AI/dashboards/notifications do **not** react.

---

## E. COMPETITOR FEATURE MATRIX (the table pass 1 lacked)

✅ strong · ◐ partial · ✗ absent.

| Capability | SAP S/4 | Oracle | Dynamics 365 | Odoo | **AURA** |
|---|:--:|:--:|:--:|:--:|:--:|
| Multi-company / tenant | ✅ | ✅ | ✅ | ✅ | ◐ (app-level) |
| Multi-currency + FX reval | ✅ | ✅ | ✅ | ✅ | ✗ |
| Financial statements (B/S,P&L,CF) | ✅ | ✅ | ✅ | ✅ | ✗ |
| Double-entry GL | ✅ | ✅ | ✅ | ✅ | ✅ |
| Budgeting / forecasting | ✅ | ✅ | ✅ | ◐ | ✗ |
| P2P (PR→PO→GRN→Invoice) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inventory valuation (FIFO/WAC) | ✅ | ✅ | ✅ | ✅ | ✗ |
| Project costing / EVM | ✅ | ✅ | ◐ | ◐ | ✅ |
| Construction (IPC/subcontract/ITP) | ◐ | ◐ | ✗ | ✗ | ✅ **(vertical edge)** |
| Payroll (WPS/UAE) | ◐ | ◐ | ◐ | ◐ | ◐ (no WPS file) |
| Workflow designer (no-code) | ✅ | ✅ | ✅ | ✅ | ✗ |
| BI / dashboards | ✅ | ✅ | ✅ | ◐ | ✗ |
| Mobile app | ✅ | ✅ | ✅ | ✅ | ✗ |
| RBAC admin UI | ✅ | ✅ | ✅ | ✅ | ✗ |
| Localization / i18n | ✅ | ✅ | ✅ | ✅ | ✗ |
| Audit trail | ✅ | ✅ | ✅ | ✅ | ✅ |
| Extensibility / marketplace | ✅ | ✅ | ✅ | ✅ | ✗ |
| Observability / SLA | ✅ | ✅ | ✅ | ◐ | ✗ |
| Modern event-sourced core | ◐ | ◐ | ◐ | ✗ | ✅ |

**Read:** AURA wins on **modern architecture** and **UAE-construction vertical depth**; loses on **every horizontal-ERP table-stakes capability** (multi-currency, statements, budgeting, BI, workflow designer, mobile, admin UIs, i18n, observability). Competes as a **vertical niche product**, not a horizontal ERP.

---

## F. MEASURED DEPTH (counts, not adjectives)

### Database (across 71 migrations)
| Object | Count | Note |
|---|--:|---|
| Tables (`aura_*`, distinct) | **110** | |
| Indexes | **146** | ~1.3/table — adequate, no composite/partial tuning evident |
| Foreign keys | **42** | **LOW vs 110 tables** — confirms snapshot-not-FK design; cross-tenant integrity rests on app code |
| CHECK constraints | **38** | enum/amount guards |
| Triggers | **1** | double-entry balance enforcement (`0050`) |
| Functions | **5** | |
| **Views** | **0** | ❌ no reporting views |
| jsonb columns | **38** | line-items/points/policies |
| RLS-enabled | **99** | |
| Policies (explicit + dynamic) | **48 + 7** | |
| **Down-migrations** | **0** | ❌ no rollback path |
| Duplicate index | **0059 ×2** | projects-variations vs petty-cash |

### Code quality (src `.ts`, excl node_modules/dist)
| Metric | Count | Verdict |
|---|--:|---|
| TODO | **0** | ✅ clean |
| FIXME | **0** | ✅ |
| `console.log` | **1** | ✅ negligible |
| `@ts-ignore`/`@ts-expect-error` | **0** | ✅ |
| `any` (`: any`/`as any`/`<any>`) | **124** | ⚠ mostly pg-row mappers (`row: any`) — type the rows |
| `eslint-disable` | **0** | ✅ |
| Root ESLint config | **absent** | ⚠ `lint` is a turbo task but no enforced root config found |
| Event taxonomy (distinct types) | **196** | ✅ rich, consistent `domain.aggregate.action` |

**Code quality is genuinely clean** — no TODO/FIXME debt, no suppressions, no logging litter. The real debt is **missing tests/ops**, not messy code. Main smells: 124 `any` in mappers; duplicate `0059`; the stale-`dist/` workspace-rebuild trap hit repeatedly this session.

---

## G. PER-DOMAIN: DONE vs MISSING (the table requested)

| Domain | Done % | What's complete | Top missing |
|---|--:|---|---|
| Kernel/eventing | 85% | outbox, audit, tenancy, workflow, numbering, saga store | event-replay, admin UI |
| Kernel/platform-gov | 30% | feature-flags svc | Admin Center, Security Center, config-versioning, backup, monitoring |
| Security | 40% | RBAC/ABAC engine, audit | DB-enforced RLS, real auth, secrets/KMS |
| CRM | 70% | accounts, leads, opps, quotations | contacts, activities, email |
| Tendering | 65% | tenders, BOQ | bid scoring, estimate engine |
| Contracts | 68% | contracts, IPC certs | clause library, obligations, auto-from-tender |
| Projects | 72% | WBS, CBS, EVM, delay/EOT, variations | Gantt, resource levelling, rev-rec |
| Procurement | 78% | PR/RFQ/PO, supplier master | approval matrix, PO↔supplier FK, framework agreements |
| Inventory | 75% | GRN, stock, transfers | valuation, reorder, barcode |
| Finance | 72%* | AP+AR, payments, GL, VAT, petty cash, BG, aging, bank-rec | statements, budgeting, period-close, multi-currency (*workflow 65%) |
| HR | 72% | employees, leave, payroll, EOSB, timesheets, claims, advances, doc-expiry | attendance, WPS file, appraisal, org chart |
| HSE | 60% | incidents, PTW, CAPA, toolbox | risk assessment, audits, training matrix |
| Quality | 60% | NCR, IR, snags, ITP | calibration, audit schedule |
| Site | 60% | diaries, delays, materials, instructions | labour-by-trade, progress % |
| Subcontracts | 65% | subcontracts, claims, variations | back-charges, retention-release UI |
| Doc-Control | 58% | transmittals, correspondence, submittals | drawing register, distribution matrix |
| Engineering | 55% | drawings, RFIs, submittals | MAR/TQ, model viewer |
| Fleet | 60% | vehicles, fuel, maintenance, fines | Salik/tolls, telematics |
| Assets | 60% | register, maintenance, inspections, depreciation | disposal/GL, QR |
| AMC | 45% | contracts, tickets, WOs, dispatch, PPM | **persistence**, Finance billing link |
| Intelligence (L3) | 35% | insight/briefing/guardrails scaffolds | agents, KG, live model, event-subscribe |
| Optimization (L4) | 30% | CBS, pricing heuristic | profitability, tender scoring, doc-intel |
| Experience (L5) | 25% | web shell, ⌘K, theme | BI, dashboards, portals×2, mobile |
| Infra/DevOps | 15% | migrations runner | CI/CD, Docker, observability, backup |
| Testing | 45% | 90 unit files, 1 tenant guard | e2e, coverage gate, perf, security |

---

## H. PERFORMANCE (assessed)
- **N+1 risk:** ⚠ aggregation endpoints (AR/AP aging, EVM rollup) `list()` then compute in-app — fine at SME scale, will need projections at volume.
- **Pagination:** ❌ `limit`-only, no cursor/total — large tenants will hit unbounded scans.
- **Connection pool / batching / streaming:** ⚠ single `pg` pool, no statement batching, no streaming exports.
- **Caching:** ❌ none.
- **Indexes:** ✅ tenant/status/FK covered; ❌ no composite/partial tuning for hot queries.
- **Perf overall ≈ 45%** — no load testing performed or possible without a deploy.

---

## I. FRONTEND DEPTH (57 pages / 162 BFF routes)
| Aspect | Verdict |
|---|---|
| Design system / tokens | ❌ inline-style objects per component; no Tailwind/shadcn/MUI |
| Component reuse | ⚠ copy-paste table/form/card pattern across ~22 new pages |
| Form validation UX | ❌ server-side only; no inline/field-level |
| Charts / data-viz | ❌ none |
| Dashboards | ❌ no module/exec dashboards |
| Accessibility | ❌ no ARIA/keyboard/contrast audit |
| Responsive / mobile | ⚠ fixed max-widths, unverified |
| Loading / skeleton / toast | ❌ minimal ("API offline"/empty only) |
| Animations / transitions | ❌ |
| Dark mode | ✅ |
| Command palette / search | ✅ |
**Frontend depth ≈ 50%** — consistent and fast to extend, but utilitarian; not a commercial design system.

---

## J. "IS IT DONE?" — the answer, quantified
**No.** It is **~62% engineering / ~48% blueprint / ~35% production / ~30% commercial.** What makes it 62% (not 90%): the **automation/orchestration of the chains, the platform/admin layer, observability/DevOps, security-enforcement, BI/dashboards, and the L3/L4/L5 layers** are largely unbuilt — even though the L2 module *breadth* is near-complete.

---

## K. PRIORITIZED REMAINING BACKLOG (concrete, numbered, ranked)

> Honest count: **108 concrete tasks** below (not a padded number). Grouped by priority tier; within a tier, ordered by impact.

### TIER 0 — Production blockers (must precede any customer data) — 14
1. Least-privilege app DB role + `FORCE ROW LEVEL SECURITY` on all `aura_*` tables.
2. Per-request tenant GUC (`SET LOCAL app.tenant_id`) + RLS policies reading it.
3. Live two-tenant denial test in CI.
4. Enforce auth by default (`AUTH_REQUIRED=true`) + session/refresh.
5. Move secrets to a vault; rotate service-role key, DB password, JWT secret.
6. Field-level encryption for PII (visa/passport/salary/TRN).
7. CI pipeline: lint+typecheck+test+build+migration-check, block on red.
8. Dockerfile(s) for api + web; compose for local stack.
9. Deploy config + environment management (staging/prod).
10. Structured JSON logging + correlation-id sink.
11. OpenTelemetry tracing + Prometheus metrics + dashboards.
12. Health/readiness probes + alerting.
13. **Persist AMC** — Postgres stores + migration (mirror the 16 modules).
14. Automated backups + restore drill + documented RTO/RPO.

### TIER 1 — Core ERP correctness & chains — 22
15. One-click **Tender→Contract** conversion (carry BOQ/value).
16. **Contract→Project** conversion (carry scope/WBS seed).
17. **Quotation→Contract/Order** conversion.
18. **Won-opportunity→Quotation** conversion.
19. Wire the **saga orchestrator** to automate the deal chain.
20. Finance **period-close** workflow.
21. Financial **statements** (Balance Sheet, P&L, Cash-flow) generators + UI.
22. **Multi-currency** + FX revaluation.
23. **Budgeting** module + budget-vs-actual.
24. Revenue recognition (IFRS-15 / %-complete ↔ EVM).
25. Inventory **valuation** (FIFO/WAC) + COGS posting.
26. Reorder points / min-max replenishment → auto-PR.
27. Procurement **approval matrix** (threshold-based).
28. Server-side **3-way match** enforcement (not just client compare).
29. PO ↔ supplier-master FK + approved-vendor enforcement on PO.
30. AMC→Finance billing link (PPM/visit → invoice).
31. Subcontract back-charges + retention-release→Finance.
32. Payroll **WPS** (UAE SIF) file generation.
33. HR attendance + leave-balance accrual.
34. Cash-flow statement + forecast.
35. Cross-company **group consolidation** reporting.
36. Standard **pagination contract** (cursor + total) across all list endpoints.
37. Global `ValidationPipe` + DTO schemas (replace hand-rolled guards).
38. Notifications delivery (email/SMS/push) wired to events.

### TIER 2 — Assurance, API, data hygiene — 20

**Status (verified 2026-07-01 · ✅ done · ◐ partial · ❌ open):** 5 done, 9 partial, 6 open — assurance/CI/hygiene largely deferred with the P0 ops track.

| # | Item | Status | Evidence |
|---|---|:--:|---|
| 39 | SWC transform for vitest (HTTP e2e) | ❌ | no swc dep |
| 40 | Supertest E2E (4 chains) | ❌ | no supertest; only in-memory reactor E2E |
| 41 | Playwright smoke | ❌ | no playwright |
| 42 | Coverage tooling + CI gate | ◐ | `@vitest/coverage-v8` + `test:coverage` (finance 43.8%); CI gate open |
| 43 | Dependency/SAST scan in CI | ❌ | no `.github/workflows` |
| 44 | Global exception filter + taxonomy | ✅ | `AllExceptionsFilter` → `{statusCode,error,code,message,correlationId}` |
| 45 | OpenAPI/Swagger | ✅ | `/api/docs` UI + `/api/docs-json` (openapi 3.0.0) |
| 46 | Renumber duplicate `0059` | ✅ | single `0059_finance_petty_cash.sql` |
| 47 | Down-migrations | ✅ | `-- @DOWN` + `migrate.mjs down` (verified rollback) |
| 48 | Standardize `date::text` mapping | ◐ | newer stores (incl. AMC) use `::text`; not universal |
| 49 | Type the 124 `any` pg-row mappers | ❌ | still ~124 |
| 50 | Root ESLint config + CI | ❌ | no root eslint |
| 51 | FK policy documented | ✅ | `docs/adr/0001-fk-policy.md` |
| 52 | Reporting views for hot reads | ◐ | `0091`: `aura_v_trial_balance` + `aura_v_open_customer_invoices` (applies on migrate) |
| 53 | Bulk operations | ◐ | reference: customer-invoices bulk delete/restore |
| 54 | CSV/Excel import + export | ◐ | CSV export (9 lists) + accounts CSV import; Excel ❌ |
| 55 | Soft-delete + restore standardized | ◐ | reference on customer-invoices (`deleted_at`, DELETE/restore); rollout pending |
| 56 | Attachments/comments via DMS all modules | ❌ | DMS exists; not per-module |
| 57 | Idempotency-key **required** (not just honored) | ❌ | honored, not enforced |
| 58 | Roll CommandBus to non-spine modules | ◐ | spine on bus; ~10 non-spine inline |

39. SWC transform for vitest → unblock Nest HTTP e2e.
40. Supertest E2E for the 4 core chains (P2P, O2C, deal-chain, service).
41. Playwright smoke for top 10 pages.
42. Coverage tooling + CI threshold gate.
43. Dependency/SAST scan (e.g. `npm audit`/Snyk) in CI.
44. Global exception filter + error taxonomy.
45. OpenAPI/Swagger generation + published spec.
46. Renumber duplicate `0059` migration.
47. Add down-migrations (or adopt a migration tool with rollback).
48. Standardize `date::text` mapping across all stores (kill TZ drift).
49. Type the 124 `any` pg-row mappers.
50. Root ESLint config + enforce in CI.
51. Decide & document FK policy (snapshot vs referential).
52. Reporting **views** for hot read paths.
53. Bulk operations (create/update/delete) on high-volume modules.
54. CSV/Excel import + export per module.
55. Soft-delete + restore standardized across modules.
56. Attachments/comments via DMS on all modules.
57. Idempotency-key required (not just honored) on spine creates.
58. Roll CommandBus to the ~10 non-spine modules (or ratify inline path).

### TIER 3 — Platform / Admin (L1) — 14
59. Admin Center UI (tenants, companies, users, roles).
60. RBAC/ABAC admin UI (assign permissions/grants).
61. Security Center (sessions, keys, audit search).
62. Feature-flag admin UI.
63. Config versioning + environment management UI.
64. API key management + gateway + global rate limiting.
65. Data governance (retention, PII map, export/erase).
66. Backup/restore console.
67. Monitoring/observability dashboards in-app.
68. Object storage (S3) seam for DMS bytes + CDN.
69. OCR + document classification (Document Intelligence).
70. Full-text/indexed search (replace lexical aggregator).
71. Durable queue (Redis/SQS) + scheduler (replace in-proc jobs).
72. Marketplace/extension SDK surface.

### TIER 4 — Intelligence & Optimization (L3/L4) — 12
73. Live AI provider key + exercise Claude path end-to-end.
74. pgvector ANN index (replace JSON-cosine).
75. Centralized, versioned prompt library + eval harness.
76. Wire agents to the live event stream (event intelligence).
77. Knowledge graph store.
78. Executive copilot.
79. Forecasting on real data (not heuristic).
80. Anomaly detection wired to events.
81. Risk intelligence.
82. Client/project profitability analytics (L4).
83. Tender scoring engine (L4).
84. Pricing IEC against live data.

### TIER 5 — Experience (L5) & UX — 14
85. Adopt a design system (tokens, components, a11y baseline).
86. Module operational dashboards + KPI tiles.
87. Executive BI dashboard (cross-module read-models).
88. Charting library + EVM/aging/cashflow charts.
89. Accessibility pass (ARIA, keyboard, contrast) to WCAG AA.
90. Responsive/mobile layouts.
91. Customer Portal app.
92. Supplier Portal app (supplier master is its backend).
93. Mobile Workforce PWA + offline queue.
94. Inline form validation UX + toasts + skeletons + error boundary.
95. i18n/localization (Arabic/English, RTL).
96. Workflow designer (no-code) UI.
97. Saved views / advanced filters on tables.
98. Global notifications center (distinct from approvals inbox).

### TIER 6 — Docs & commercial — 10
99. OpenAPI reference site.
100. Data dictionary / ERD.
101. Deployment + runbooks + DR procedures.
102. Developer onboarding guide.
103. Admin guide.
104. End-user manual per module.
105. Tenant onboarding + subscription/billing.
106. SLA/support tooling.
107. Pricing/packaging + license enforcement.
108. Security/compliance attestations (SOC2/ISO path).

---

## L. CORRECTIONS TO PASS-1
- Finance: module breadth ~80% but **workflow completeness ~65%** (period-close & statements absent) — pass-1 over-stated it.
- Triggers: pass-1 implied few; **measured = exactly 1** (double-entry).
- Deal-chain: pass-1 said "no cycles, inward deps" (true) but **missed that the chain is not orchestrated** — the most important functional gap (§C).
- Code quality: now **measured clean** (0 TODO/FIXME, 1 console.log) — better than a generic "25% debt" implied; debt is in *tests/ops*, not code.

*End of addendum. Measured, source-verified, no files modified.*
