# AURA OS — Consolidated Gap Register — **BASELINE v1 (FROZEN)**

> ## ❄️ Frozen 2026-08-10 — historical baseline, not current status
>
> This document is **Baseline v1, as at 2026-08-05**. It is preserved exactly as it stood
> and is **no longer maintained**. Do not read any row here as the state of the platform
> today, and do not quote its counts.
>
> **Current status lives in
> [Consolidated Gap Register v2 — Current Tree Verification](2026-08-10-consolidated-gap-register-v2.md)**,
> which re-tests all 50 IDs against the tree and adds the gaps that emerged from the Admin,
> Offline and Idempotency work.
>
> v1 keeps its value as the provenance record: it is where each ID was defined, and where
> the 2026-08-05 fix wave and the two retractions are documented. v2 cites it rather than
> repeating it.

**Date:** 2026-08-05 · **Scope:** every open gap in the platform, in one place.
**Assembled from:** the whole documentation estate (182 files) plus live verification against the running app on 2026-08-05.

This is the **umbrella register** — one list, stable IDs, honest provenance. It does not replace the source documents; each row cites the one that owns it, and those remain the authority on their own detail. Where a row was re-tested against the running app on 2026-08-05, it says so.

## Where this stands

**50 rows, of which 38 remain open.** Ten were closed and one part-closed on 2026-08-05 (change log at the end); G-49 and G-02 are retracted, G-13 a deliberate architectural decision with a working mitigation, and G-38 a *retired claim* recorded so nobody re-adopts it.

**One P0: G-03.** Row-level security is complete in code, gated at boot and CI-proven — but the running deployment connects as the database owner, so every policy is bypassed. It is a configuration change, not construction: point `DATABASE_URL` at the least-privilege `aura_app` role.

The rest cluster in four places:

1. **Security hardening at the HTTP edge** — no Helmet, no CSP, no rate limiting, no SCIM (G-07, verified absent rather than the "partial" that was carried).
2. **The delivery-to-service spine (stages 10–14)** — where an ELV contractor actually makes and protects margin.
3. **The ELV vertical itself** — SIRA/DCD compliance, device schedules, cable schedules are absent, and those are what make this an *ELV* ERP rather than a good generic one.
4. **The field** — no offline, no mobile, minimal capture.

---

## How to read this

| Mark | Means |
|:--:|---|
| ✅ | **Verified live by me on 2026-08-05** against the running app (HTTP probe, boot log, DB query, or grep over the working tree) |
| 📄 | **Carried from a dated report** on its author's authority — not re-tested in this pass. The date is given. |
| 🆕 | First recorded on 2026-08-05 — not present in any earlier document |

**Severity:** **P0** ship-blocking · **P1** required for a complete lifecycle · **P2** production hardening · **P3** strategic.

**A note on the estimates.** Module-completeness percentages and star ratings quoted below were labelled by their authors as informed estimates, not measured functional audits. They are reproduced with that label intact. The only measured figures on this platform are in [the reports index](README.md#numbers-you-may-quote).


---

## 1 · Security & access control

| ID | Gap | Sev | Evidence | Source |
|---|---|:--:|---|---|
| **G-01** | **The dev/default configuration runs with auth off**, and unauthenticated reads return live data: `GET /api/v1/crm/opportunities` no token → **200, 34 records**; `/auth/status` → `{"enabled":false}`. This is the documented staged pass-through for development — **not** a production hole (see G-02). It is still worth closing, because "the demo instance answers strangers" is a real exposure the moment that instance is reachable, and because dev-off/prod-on means the permission taxonomy is never exercised in day-to-day use | **P2** *(was P0 — see G-02)* | ✅ | [readiness P0-1](2026-08-03-enterprise-readiness-audit.md) |
| ~~**G-02**~~ | ❌ **RETRACTED 2026-08-05 — the finding was wrong.** I claimed a production deploy without a verifier runs open and silently. **It refuses to boot.** `apps/api/src/main.ts:52-63` — `if (isProd && !auth.enabled && !allowInsecure) { FATAL; process.exit(1) }`. **Measured:** `NODE_ENV=production`, no `AUTH_JWKS_URL`/`AUTH_JWT_SECRET` → FATAL log, **exit code 1**, never listens. The error came from reading `main.ts:101` in isolation and never reading the gate 40 lines above it; `:101` governs anonymous-request rejection *once running*, and is unreachable in the case I described. The claim also propagated into the master report, where it downgraded a correct ✅ — now restored. | — | ✅ | 🆕 *retraction* |
| **G-03** | **RLS is inert at runtime.** Mechanism is complete — least-privilege `aura_app` role, tenant GUC binding, `FORCE RLS` on 182/182 tables, CI fitness gate, isolation test, and a boot gate that refuses production under a `BYPASSRLS` role. The running instance still connects as `postgres` owner: `⚠️ … RLS policies are INERT` | **P0** | ✅ | [readiness P0-2](2026-08-03-enterprise-readiness-audit.md) · [runbook](../runbooks/rls-tenant-isolation.md) |
| ~~**G-04**~~ | ✅ **CLOSED 2026-08-05.** 11 standard ELV roles seeded at boot (`apps/api/src/auth/elv-roles.ts`), registered not granted — assigning people stays an admin action | — | ✅ | 11 SoD tests |
| ~~**G-05**~~ | ✅ **CLOSED 2026-08-05.** A `client` role, strictly read-only (a test asserts every one of its permissions ends in `.read`). Grant it scoped to the account, never at tenant level | — | ✅ | elv-roles.test.ts |
| ~~**G-06**~~ | ✅ **CLOSED 2026-08-05.** Removed; 9 guard tests green | — | ✅ | — |
| **G-07** | **⚠️ WORSE than reported (verified 2026-08-05).** The carried row said Helmet/CSP and rate limits were "partial". They are **absent** — no `helmet`, no `Content-Security-Policy`, no `Throttler`/rate-limit anywhere in `main.ts` or the API's dependencies. **SCIM is likewise absent** (0 files); SSO exists only as JWKS acceptance + Entra group→role mapping. An internet-facing deploy has no header hardening and no brute-force protection at the HTTP edge (the login throttle is application-level) | **P1** *(was P2)* | ✅ | 🆕 severity corrected |

> **Closed and verified:** maker-checker SoD + value-threshold approval matrix on all four money-cycle transitions · secrets vault seam (`_FILE`) + staged PII rotation + gitleaks · MFA (TOTP) · field-level PII encryption · route-derived permission taxonomy over ~600 handlers.

## 2 · Data integrity & audit

| ID | Gap | Sev | Evidence | Source |
|---|---|:--:|---|---|
| ~~**G-08**~~ | ✅ **CLOSED 2026-08-05 — AR billing cap.** Cumulative billing against a contract may exceed neither the approved contract value nor the net certified to date. `CONTRACT_CAP_PORT` + pure rule (`modules/finance/src/domain/contract-cap.ts`), adapter bound at the app layer per ADR-0004 — the receivable mirror of the AP 3-way match. Every figure is **VAT-exclusive**; comparing gross would have refused the IPC auto-invoice by exactly the tax (caught before merge, regression test added) | — | ✅ | 10 domain + 5 HTTP e2e |
| ~~**G-09**~~ | ✅ **CLOSED 2026-08-05.** The gate now also reports **applied-but-absent** migrations and warns loudly at boot — reported, never degrading (the schema is ahead of the code, not behind, and refusing traffic would be wrong). Live boot against the drifted dev DB names exactly the 5 files. *The drift itself is a data-hygiene item for whoever owns that database.* | P3 | ✅ | 11 gate tests + live boot |
| **G-10** | **7 dangling references** in the long-lived dev DB — tenders/opportunities/contracts/IPC → missing `account_id`, plus one tender→opportunity. Dev artifacts, absent from a clean seed | P2 | 📄 08-04 | readiness P1-1 |
| ◑ **G-11** | **Seeder made idempotent 2026-08-05** — accounts are now get-or-create by name, so the seed converges from any state instead of multiplying; the ELV catalogue seeds outside the once-only guard, by item code. ⚠️ **The existing duplicates are NOT cleaned up** — measured live: **5 accounts triplicated** (Emaar Properties · Majid Al Futtaim · DP World · Aldar Properties · Dubai Municipality) + 2 doubled. That is a destructive data merge on a live database and needs an explicit decision, not a seeder change. **CRM close-out sign-off stays blocked until it happens.** | **P1** | ✅ measured | close-out gap A |
| ~~**G-12**~~ | ✅ **CLOSED 2026-08-05.** *Scope correction: the PO has no line items* — it is a header whose `value` is deliberately immutable (committed cost was posted as a delta at creation, so re-pricing in place would desync the cost ledger). The auditable surface is the supplier snapshot and descriptive fields, a **supplier swap** being the one with real commercial consequence. `update()` now emits the field-level diff **and stamps the real actor** from the request context — it previously recorded `actorId: null`, so the log couldn't name who made the change | — | ✅ | 5 unit tests |
| **G-13** | **Cross-module orphans are possible by design** (ADR-0001 snapshot-by-reference — *not* a defect). Mitigation is the catalogued orphan scan, now **19 references**, CI-enforced. Optional intra-module FKs are blocked on reconciling `uuid` vs `text` id typing | P3 | ✅ (19 confirmed) | [ADR-0001](../adr/0001-fk-policy.md) |

## 3 · The delivery-to-service spine — stages 10–14

The commercial-to-cash spine (Lead → … → Payment) is connected and event-driven. **The delivery half breaks down exactly where an ELV contractor makes and protects margin.**

| ID | Gap | Sev | Evidence | Source |
|---|---|:--:|---|---|
| **G-14** | **Field-service loop has no field end.** Dispatch board exists (`/amc/dispatch`); **technician mobile, on-site checklist, photo capture and customer e-signature do not** | **P1** | 📄 08-01 | [analysis 13](../../analysis/13-WORKFLOW-ANALYSIS.md) |
| **G-15** | **AMC field execution loop missing** — PPM schedules and work-order costing exist; the execution loop that consumes them does not | **P1** | 📄 08-01 | analysis 13 |
| **G-16** | **Handover O&M / as-built bundle isn't generated** from the DMS — the package exists, its contents are assembled by hand | P2 | 📄 08-01 | analysis 13 |
| **G-17** | **Survey → Opportunity intake missing.** No pre-sales site survey anywhere; the site module is execution diaries only. The ELV deal starts with a survey | **P1** | 📄 08-03 | readiness §7 |
| **G-18** | **No progress-tracking UI** for execution (stage 10) | P2 | 📄 08-01 | analysis 13 |
| ◑ **G-19** | **⚠️ OVERSTATED — partly retracted (verified 2026-08-05).** The carried row said the EVM/controls cockpit "isn't built". **EVM is surfaced**: a BFF route (`app/api/projects/projects/[id]/evm`) plus earned-value on both `projects/dashboard` and the projects list, across 5 project pages. What is genuinely thin is depth, not existence — no dedicated per-project controls cockpit pulling WBS/CBS/schedule/cashflow/EVM into one view. Re-scoped from "missing" to "shallow" | P2 *(was P1)* | ✅ | 🆕 partly retracted |

> **Closed 2026-08-01 — two of the three named dead-ends:** a commissioning module (test-point pass rates, witnessed sign-off, guarded state machine) and structured handover packages (close-out checklist, client acceptance, warranty clock). And the chain between them is automated: last system commissioned → draft handover auto-opens → client acceptance auto-creates the AMC contract. All three links verified E2E through the event spine.

## 4 · ELV vertical fit — what makes this an *ELV* ERP

| ID | Gap | Sev | Evidence | Source |
|---|---|:--:|---|---|
| **G-20** | **No SIRA / DCD compliance layer (Dubai)** — no approval workflow, guard licensing, or compliance register. **Essential for UAE ELV security systems**; its absence is a market-entry blocker, not a nice-to-have | **P1** | 📄 08-01 🔴 | [analysis 14](../../analysis/14-ENTERPRISE-GAP-ANALYSIS.md) |
| **G-21** | **No system-type templates, device schedules, or as-built device registers** — CCTV/ACS/fire/AV are carried as generic BOQ line items | **P1** | 📄 08-01 🟡 | analysis 14 |
| **G-22** | **KNX / BMS** — no integration points, no commissioning data capture. *Verified 2026-08-05: "BMS" exists in the tree only as a **discipline label** in `solution-scope.ts` (an ELV/MEP enum value alongside CCTV and Fire Alarm). KNX appears nowhere. So the domain knows BMS is a thing to sell; nothing knows how to commission one.* | P2 | ✅ | analysis 14 |
| **G-23** | **Structured cabling** — no cable schedule, no port mapping | P2 | 📄 08-01 🟡 | analysis 14 |
| ~~**G-24**~~ | ✅ **CLOSED 2026-08-05.** A 10-SKU ELV catalogue with real part numbers across CCTV · access control · fire · networking (Hikvision · Dahua · HID · ZKTeco · Bosch · Commscope · Cisco). Seeded **outside** the once-only guard — reference data must top up an existing database, and the all-or-nothing guard was exactly why this kept being skipped. **Live-verified:** `?q=Hikvision` → 3 SKUs, `?q=DS-2CD2143G2-I` → the exact model, `?q=Bosch` → 2, `?q=Cat-6A` → the cable | — | ✅ | live search |

## 5 · Field & mobile

| ID | Gap | Sev | Evidence | Source |
|---|---|:--:|---|---|
| **G-25** | **No PWA, no service worker, no offline.** `apps/web/public/` is empty. Site/QA/HSE engineers — the heaviest field users — cannot work disconnected. **The largest wholly-untouched item in the register** | **P1** | ✅ | readiness P1-4 |
| **G-26** | **⚠️ WORSE than reported (verified 2026-08-05).** The carried row said "~3 with upload, ~2 with signature". Upload is right — **3** `type="file"` inputs. Signature is **0**: no signature pad, no canvas capture, no `toDataURL`. Camera capture is also **0** — not one `capture=` attribute in the app. So a client cannot sign anything and an engineer cannot photograph anything, on any device | **P1** | ✅ | 🆕 severity corrected |
| **G-27** | **No technician/site mobile surface** for the field flows that now have desktop UIs | **P1** | 📄 08-02 | [module depth](2026-08-02-module-depth-gap-audit.md) |

> **Closed and verified:** all 14 forms that demanded a hand-typed project UUID now use `ProjectPicker`/`EmployeePicker`/`AssetPicker` — **zero raw UUID inputs remain app-wide** (✅ re-confirmed 2026-08-05).

## 6 · UI / UX

| ID | Gap | Sev | Evidence | Source |
|---|---|:--:|---|---|
| ~~**G-28**~~ | ✅ **CLOSED 2026-08-05.** `var(--fg)` → `var(--text)` in all three rules; the form engine's active tab has its colour back. Verified in the CSS **the dev server actually serves**, not just the source | — | ✅ | served-CSS check |
| ~~**G-29**~~ | ✅ **CLOSED 2026-08-05.** All four mapped to `var(--warn)`; dead fallbacks dropped. **All four token classes now genuinely 0** (`--fg`, `--surface`, `#2563eb`, `#d97706`) | — | ✅ | grep over `apps/web` |
| **G-30** | **Inline buttons and tables not migrated** to the shared kit's `<Button>`/`<Table>` | P2 | 📄 08-04 | readiness P2-3 |
| **G-31** | **Guidance stops at the contract.** Next-best-action exists on 4 CRM 360s only; Contract → IPC → Invoice and every operational form have no on-screen "what to do next" | P2 | 📄 08-03 | readiness §9 |
| **G-32** | **Record actions stay silent while in flight** — ~4.4s with no pending state. Cost the Direct Sale journey 3 points | P2 | 📄 07-20 | close-out gap D |
| **G-33** | **Full-page refresh on every mutation** — multi-step operational work (site, field) will feel slow | P2 | 📄 08-01 | analysis 13 |
| **G-34** | **No unified "my approvals" inbox** across modules — approvals exist, the action queue doesn't | P2 | 📄 08-01 | analysis 13 |
| **G-35** | **`/tendering/pricing` still orphaned** — the Commercial workspace orphan was linked, this one wasn't | P3 | 📄 08-05 | readiness P2-5 |

## 7 · Performance & scale

| ID | Gap | Sev | Evidence | Source |
|---|---|:--:|---|---|
| **G-36** | **Global search is an in-memory O(n) fan-out**, capped at 50/module — needs a denormalised search projection | P2 | 📄 08-04 | readiness P1-3/P2-7 |
| **G-37** | **No latency validation at 1k–10k rows** — dashboards, lists and reports unmeasured at scale | P2 | 📄 08-03 | readiness P2-7 |
| **G-38** | **⚠️ The "~5–7s first paint" claim is unproven and should not be quoted.** It reproduces at **6.0s** — but on the *dev server*, where on-demand compilation dominates. The API behind that page answers in **0.54s**, and warm pages run 1.0–1.6s. **No production build has ever been measured** | — | ✅ | 🆕 — *claim retired 2026-08-05* |
| **G-39** | **No caching, no APM, no load test**; single pg pool, no read replica or queue | P2 | 📄 07-01 | due diligence |

> **Closed:** migration `0219` added a composite `(tenant_id, hot_col)` index to 23 tenant-scoped tables that previously had none — every list on them was a sequential scan.

## 8 · Commercial & platform modules

| ID | Gap | Sev | Evidence | Source |
|---|---|:--:|---|---|
| **G-40** | **No contract authoring/templating**, and variation approval doesn't auto-adjust contract value. Needs backend work, not a UI slice | **P1** | 📄 08-02 | module depth #9 |
| **G-41** | **No Analytics OS / report builder** — per-module dashboards exist; the unified analytics workspace is planned | P2 | 📄 08-02 | module depth #10 |
| **G-42** | **No governed master-data management** — items/materials catalog and cost/rate libraries are implied but not surfaced | P2 | 📄 08-02 | module depth #12 |
| **G-43** | **No subcontractor portal** — external self-service for claims/variations; needs a new auth surface | P3 | 📄 08-02 | module depth #13 |
| **G-44** | **No customer/vendor portals** — standard in NetSuite/SAP | P3 | 📄 08-01 | analysis 14 |
| **G-45** | **Two pricing engines still not unified** — tender estimate and quotation sheet. Authoring was consolidated; the engines weren't | P2 | 📄 | memory: two-pricing-sheets |
| **G-46** | **No unified document layer** — revisions exist on drawings, but no version-history / approval-workflow / expiry-tracking across submittals, method statements, certificates, warranties | P2 | 📄 08-03 | readiness P2-6 |
| **G-47** | **Warehouse depth missing** in inventory; **estimator UI thin** (4 tender pages) | P2 | 📄 08-01 | analysis 11 |
| **G-48** | **AI platform runs in LOCAL fallback** — no `ANTHROPIC_API_KEY`, zero model calls. 9 agents and their tools register at boot and do nothing | P2 | ✅ | 🆕 confirmation |

## 9 · Journey gaps — the measured points lost

These are not opinions; they were lost in a live run.

**Direct Sale — 87/100** (measured 2026-07-20 on `f829007`, E2E gate PASS). The missing 13:
- Duplicated MAF accounts make "which customer" unanswerable (−3 across two categories) → **G-11**
- Actions silent while in flight (−3) → **G-32**
- "Send to customer" sends nothing
- Generated quotation carries neither validity nor cost — both filled in later
- Certify → AR link lands on a list, not the invoice

**Tender — 65/100** (measured 2026-07-17). The two worst, both the same class:

| ID | Gap | Sev |
|---|---|:--:|
| ~~**G-49**~~ | ❌ **RETRACTED 2026-08-05 — already fixed and never re-verified.** `tender.awarded → closeSourceOpportunity('won')` and `tender.lost → 'lost'` are both wired (`cross-module-subscriber.ts:235`), the close supplies the win reason and value the CRM stage gate requires, and it no-ops on redelivery. Carried unchecked from the 2026-07-17 audit | — |
| ~~**G-50**~~ | ✅ **CLOSED 2026-08-05.** The award reactor now resolves the tender's priced quotation (preferring accepted, then approved, then sent), inherits its **locked baseline and accepted bid value**, and back-links the quotation to the contract — the direct path's governance, on the tender path. Falls back to the tender value when a bid was never priced through a quotation, and the lookup is whole-body guarded so an enrichment failure can never stop the contract being created | — |

> **These two are one finding: path asymmetry.** Governance built on the direct-sale path is silently absent on the tender path. Same business intent, two enforcement levels — a correctness gap, not a missing feature. It is the highest-value fix in this section because it is small and it protects money.

## 10 · Competitive position

Where AURA trails the incumbents — strategic, not defects:

| Area | Gap |
|---|---|
| Field service & mobile | ServiceNow/Procore/D365-FS ship full dispatch + mobile; AURA has none → **G-14, G-25–27** |
| Construction project-controls UX | Procore/ACC own RFI/submittal/daily-log/drawings UX; **AURA has the data, not the screens** |
| BI / analytics | Every incumbent embeds BI; AURA's dashboards are fragmented → **G-41** |
| Ecosystem | SDK exists, no live marketplace or connectors |
| Portals | Standard in NetSuite/SAP → **G-43, G-44** |
| Enterprise identity | SSO/SCIM present but not operationalized → **G-07** |

**Against that — the advantages worth protecting:** purpose-built for ELV/MEP/FM (BOQ, tender, ITP, WPS, Salik, retention, back-charges, AMC), UAE/GCC localization baked in, no per-seat licence, an event-sourced architecture more adaptable than legacy incumbents, and a commercial-to-cash cockpit already better than Odoo/NetSuite.


## The order I would work it

1. **G-01 / G-02 — fail-closed auth in production.** The last P0 and the only thing between this and a hosted deployment. The pattern already exists in the same file: `evaluateRlsPosture` refuses to boot in production under an RLS-bypassing role. **Production + no verifier should refuse to boot, not run open.** Three documents describe this hole and one of them called it done — that gap between the record and the tree is the argument for shipping the gate rather than documenting it again.
2. **G-49 / G-50 — the tender-path baseline asymmetry.** Small, and it protects money.
3. **G-28 — the three `var(--fg)` lines.** Two minutes; restores the form engine's active tab.
4. **G-11 / G-24 — a clean, ELV-branded demo seed.** Now blocking two other things: the flagship search demo has nothing branded to find, and CRM close-out is holding on the duplicate accounts.
5. **G-08 — the invoice cap check.** The clearest open money-cycle control.
6. **G-09 — warn on applied-but-absent migrations.** Small change; closes a drift class that has already cost one production-coverage bug.
7. **Then the two big programs:** the field/mobile surface (G-14, G-25–27) and the ELV vertical layer (G-20–23). Neither is a weekend; both are what make this an ELV contractor's operating system rather than a very good generic one.


## Provenance

**Verified live on 2026-08-05** (✅): G-01, G-02, G-03, G-06, G-09, G-13 (count), G-24, G-25, G-28, G-29, G-38, G-48. Method: API rebuilt from source and booted against the live Supabase DB; `curl` probes against `/health`, `/auth/status`, `/crm/opportunities`, `/crm/accounts`, `/search`, `/admin/companies` and four web routes; `select filename from public.aura_migrations` compared against `ls infrastructure/migrations`; `grep -rl` over `apps/web` for four token/colour patterns; boot-log inspection.

**Carried on their authors' authority** (📄): everything else, dated inline. The ELV-vertical rows (G-20–23), module-depth rows and competitive section were **not** re-tested in this pass.

**Not measured, and therefore not claimed anywhere here:** any readiness or journey score beyond the ones already measured and cited, production-build performance, test-suite results, and functional-completeness percentages.

**Full method and the documentation-accuracy findings:** [2026-08-05-platform-state-verification.md](2026-08-05-platform-state-verification.md).


---

## Change log — 2026-08-05

This register was assembled, corrected and partly worked through in a single day. The process is recorded here rather than at the top, because a reader wants the gaps first.

> ## ✅ Fix wave — 2026-08-05 (same day)
>
> **Ten rows closed, one part-closed, two retracted — one of them mine.** All verified by test and, where observable, against the running app.
>
> | Row | What shipped | Proof |
> |---|---|---|
> | **G-04 / G-05** | Standard ELV role matrix seeded — 11 roles (Sales · Sales Manager · PM · Site Engineer · QA/QC · HSE · Procurement · Store · Finance · Admin) plus a read-only external **Client**. `apps/api/src/auth/elv-roles.ts`, registered idempotently at boot | 11 unit tests asserting segregation of duties against **real controller routes**; live boot log confirms all 11 seeded |
> | **G-06** | Dead duplicate guard branch removed (`permissions.guard.ts:125`) | 9 guard tests green |
> | **G-08** | **AR billing cap** — the receivable mirror of the AP 3-way match. Billed may exceed neither the contract value nor the net certified to date, cumulatively. New `CONTRACT_CAP_PORT` + pure rule in `domain/contract-cap.ts`, adapter at the app layer (ADR-0004) | 10 domain tests + **5 HTTP e2e**; deal-chain e2e still green |
> | **G-09** | Migration gate now reports **applied-but-absent** migrations | 11 gate tests; **live boot names exactly the 5 drifted files** |
> | **G-28 / G-29** | The 3 undefined `var(--fg)` and 4 `#d97706` residuals fixed. All four token classes now genuinely **0** | Verified in the **CSS the dev server actually serves** |
> | **G-50** | **Tender-path baseline inheritance.** A tender-won contract now inherits the approved commercial baseline and the accepted bid value, and back-links the quotation — exactly as the direct path does | 2 new reactor tests (inherits · falls back when unpriced); 15 reactor tests green |
> | **G-12** | PO update now emits a field-level before→after diff **and stamps the real actor** (it recorded `actorId: null`). *Scope corrected: the PO has no line items.* With contract + invoice arriving from `main` (#198), **P1-2 is now closed across the whole money cycle**. | 5 unit tests |
> | **G-24** | A 10-SKU ELV catalogue (Hikvision · Dahua · HID · ZKTeco · Bosch · Commscope · Cisco), seeded outside the once-only guard so it tops up an existing DB | **Live:** `?q=Hikvision` → 3 SKUs · `?q=DS-2CD2143G2-I` → the exact model |
> | ◑ **G-11** | Seeder accounts are now get-or-create by name — converges instead of multiplying | 5 triplicated accounts measured live; **cleanup still owed** |
> | ~~**G-02**~~ | ❌ **RETRACTED — my own finding was wrong.** Production already refuses to boot without an auth verifier; I reported a hole that does not exist and downgraded a correct ✅ in the master report on the strength of it | Measured: `NODE_ENV=production` → FATAL, **exit 1** |
> | **P0-1 hardening** | The gate was a untested inline `if` in a 300-line bootstrap — which is *why* it was missable. Extracted to a pure, exported, tested `evaluateAuthPosture()`, symmetric with `evaluateRlsPosture` | 5 tests; prod boot still exits 1 |
> | ◑ **G-11 (cont.)** | `scripts/merge-duplicate-accounts.mjs` — dry-run by default, deterministic survivor, discovers referencing tables, single transaction, undo file, renames rather than deletes | Dry run: **47 rows, 12 accounts**, not applied |
> | ~~**G-49**~~ | **RETRACTED — was already fixed.** `tender.awarded → closeSourceOpportunity('won')` and `tender.lost → 'lost'` are both wired in the reactor. The row was carried from the 2026-07-17 tender audit and never re-verified | Read at `cross-module-subscriber.ts:235` |
>
> **G-49 is the more instructive one.** It sat in a register for three weeks describing a hole that had already been closed. A stale *open* row costs less than a stale *closed* one, but it is the same failure: **a register is only as good as its last verification**, which is why every row above carries a provenance mark.
>
> API 65/65 · procurement 33/33 · finance 119/119 · e2e (chains · SoD · AR cap · cost ledger) 21/21.
>
> **One thing this wave did NOT do:** merge the 5 triplicated accounts. That is a destructive change to a live database — it needs a decision about which record survives and what re-points at it, not a code change made in passing. G-11 stays part-open and CRM close-out stays blocked on it.

## Verification pass — 2026-08-05

Every row below was driven against the tree or the running app, not carried. **Four of the twenty-five carried rows were wrong**, and not in a comforting direction — three understated the gap:

| Row | Carried claim | Verified |
|---|---|---|
| **G-07** | Helmet/CSP + rate limits "partial", SSO/SCIM "not operationalized" | **Absent.** No helmet, no CSP, no rate limiter, no SCIM. Raised P2 → **P1** |
| **G-26** | "~2 components with signature" | **Zero** signature capture. Zero camera capture. Upload (3) was right |
| **G-22** | KNX/BMS "no integration points" | True, and sharper: BMS exists only as a *label* in a discipline enum |
| **G-19** | PM/EVM cockpit "isn't built" | **Overstated.** EVM is surfaced on 2 pages + a BFF route. Re-scoped to "shallow", P1 → **P2** |

Confirmed exactly as written: G-17 (no site survey), G-20 (no SIRA/DCD), G-23 (no cable schedule), G-34 (no approvals inbox), G-36 (no full-text projection — still in-memory), G-39 (no cache/APM), G-40 (no contract templating), G-41 (no `/analytics` route), G-42 (no MDM screen), G-43/G-44 (no `/portal` route), G-46 (no version-history layer).

**Why this pass happened:** the register shipped with roughly half its rows carried on an older report's authority. Two of those turned out to be fiction — G-49 described a hole that had already been closed, and G-02 was mine, describing one that never existed. A register nobody re-drives is a rumour with a table around it.


### Retractions

**Correction, 2026-08-05.** An earlier revision of this document opened by calling authentication the last P0 and "the only thing between this platform and a hosted deployment." **That was wrong** — the production gate exists and refuses to boot without a verifier (G-02, retracted, with the measurement). What survives is smaller and honest: the *dev* default runs open, and the RLS bundle is complete in code but **inert in the running deployment** because it connects as the DB owner. **G-03 is now the only true P0, and it is a configuration change, not construction** — flip `DATABASE_URL` to the least-privilege `aura_app` role per the runbook.