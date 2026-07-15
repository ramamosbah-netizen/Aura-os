# AURA OS — Final Gap Register

**Date:** 2026-07-14 · Verified against live tree (`main` @ `6e099e1`).

**Priority:** P0 correctness/security/tenancy/financial/data-integrity blocker · P1 required to complete a real
end-to-end lifecycle · P2 production hardening · P3 strategic enhancement · P4 future/optional.
Size: **S** (≤1 slice), **M** (2–3), **L** (multi-slice). Priorities reflect *business/correctness impact*, not novelty.

---

## P0 — Blockers

### G-P0-1 · Row-Level Security not enforced end-to-end
- **Capability:** DB-enforced tenant isolation on all business tables.
- **Evidence:** 87/162 migrations declare policies + `0049_dynamic_hierarchical_rls.sql`, but many `CREATE TABLE`
  migrations ship no inline per-table policy (`0044_crm_leads_opportunities`, `0062_procurement_suppliers`,
  `0060_finance_customer_invoices`, …); app relies on `TenantContext` scoping (`apps/api/src/main.ts`, default `dev-tenant`).
- **Impact:** cross-tenant read/write risk if any query bypasses app scoping; the single correctness/security blocker.
- **Modules:** all. **Deps:** none (foundation). **Size:** L.
- **Solution:** finish the 0049 dynamic-RLS pattern; add missing per-table policies keyed on `current_tenant_id()`;
  add a **CI fitness test** asserting every tenant-scoped table has a policy; verify `SET app.tenant_id` on each request.
- **Acceptance:** fitness test green; a cross-tenant query returns 0 rows in an integration test; no table-without-policy.

### G-P0-2 · Migration-drift breaks the running app silently
- **Capability:** environment schema guaranteed in sync with merged code.
- **Evidence:** live incident this session — `column "assigned_to" does not exist` (0156) → every new CRM endpoint 500’d
  until `db:migrate` was run; the API boots fine and only fails at query time.
- **Impact:** data endpoints 500 after any deploy that adds a migration; silent until used.
- **Modules:** api/core. **Deps:** none. **Size:** S.
- **Solution:** a **startup migration-check** that logs/refuses-to-serve business routes when `aura_migrations` is behind
  the migration folder (or a CI/CD deploy-gate that runs migrations before switching traffic — partly exists per repo memory).
- **Acceptance:** app fails fast / warns loudly on pending migrations; deploy runbook enforces migrate-before-serve.

---

## P1 — Required for a true end-to-end lifecycle

### G-P1-1 · No locked, immutable Commercial Baseline carried into Contract
- **Evidence:** contract value set on the contract, not derived from an approved quotation; `quotation.ts` approval is
  bypassable; no baseline object.
- **Impact:** commercial truth can drift between approved price and contract; no audit of "what we agreed to deliver at
  what price/margin". **Modules:** crm, tendering, contracts. **Deps:** G-P1-2. **Size:** M.
- **Solution:** a `CommercialBaseline` snapshot (BOQ lines + cost + margin + total) **locked on quotation approval**,
  referenced (REF) by Contract; contract value defaults from it.
- **Acceptance:** approving a quotation writes an immutable baseline; contract shows baseline linkage; variance report exists.

### G-P1-2 · Commercial pricing governance is bypassable
- **Evidence:** `modules/crm/src/domain/quotation.ts:176` `send` allowed from `draft`; no margin/discount threshold;
  build-up replaced not versioned (`estimate.service.ts:47`).
- **Impact:** quotations leave the building without review; margins uncontrolled. **Modules:** crm, tendering, core/workflow.
- **Deps:** none. **Size:** M.
- **Solution:** require `approved` before `send` (override = authorized + audited); margin/discount threshold → workflow
  approval (reuse `core/src/workflow`); version cost build-ups (append-only or snapshot-on-approve).
- **Acceptance:** cannot send an unapproved quotation without an audited override; over-threshold margin routes to approval;
  build-up history retained.

### G-P1-3 · Pre-award discovery not modelled (Requirements / Site Survey / Solution)
- **Evidence:** no entities (`grep requirement|site.survey|solution.design` → none).
- **Impact:** ELV/integration bids start from tribal knowledge + spreadsheets; scope→BOQ is a manual leap.
- **Modules:** crm/engineering (new lightweight domain). **Deps:** none. **Size:** M.
- **Solution:** lightweight `Requirement`, `SiteSurvey`, `SolutionScope` entities on the Opportunity, whose approved scope
  seeds a BOQ (`scope → BOQ` derivation), including a **direct-sale** path that still produces a BOQ+build-up.
- **Acceptance:** an opportunity can capture requirements→survey→solution→scope; "generate BOQ from scope" produces a
  priceable BOQ for both tender and direct-sale.

### G-P1-4 · Bid-time supplier sourcing does not feed the estimate
- **Evidence:** RFQ/quotes are post-award (`procurement/rfq.service.ts`); build-up rates hand-keyed.
- **Impact:** estimates aren’t grounded in real supplier prices; margin risk. **Modules:** procurement, tendering.
- **Deps:** G-P1-1/2. **Size:** M.
- **Solution:** allow a pre-award RFQ tied to a BOQ item/build-up; awarded/lowest quote can populate the
  material/subcontract component of the rate build-up.
- **Acceptance:** a build-up component can be sourced from a supplier quote; changing the quote updates the estimate.

### G-P1-5 · Progress measurement → IPC not formalised
- **Evidence:** WBS spend rollup (invoice.paid→WBS) but no %-complete/measured-quantity object; IPC certification is manual.
- **Impact:** billing not driven by measured progress; revenue timing manual. **Modules:** projects, contracts.
- **Deps:** none. **Size:** M.
- **Solution:** a `ProgressMeasurement` (per WBS/BOQ line, period) that drives IPC drafting.
- **Acceptance:** measured progress drafts an IPC; IPC→AR reactor unchanged; EVM figures derive from measurement.

### G-P1-6 · Inventory issue → Installed Asset / Warranty not wired
- **Evidence:** assets created manually (`assets` module); no `stock issue`/`handover`→asset reactor.
- **Impact:** no real installed base → warranty/AMC/renewal weaker. **Modules:** inventory, assets, amc. **Deps:** none. **Size:** M.
- **Solution:** on issue-to-site/handover, create/annotate an installed Asset with warranty; feed AMC + S9 renewal.
- **Acceptance:** issuing/handing over installable stock creates an asset with warranty; AMC can attach.

### G-P1-7 · Collection / dunning workflow missing
- **Evidence:** receivables + overdue-AR advisor alert only; no dunning states/reminders.
- **Impact:** cash collection is ad-hoc. **Modules:** finance, crm. **Deps:** none. **Size:** S–M.
- **Solution:** dunning stages + reminder activities + cash-visibility rollup.
- **Acceptance:** overdue invoices progress through dunning; reminders logged as activities; DSO visible.

---

## P2 — Production hardening

- **G-P2-1 · Authorization coverage uneven** — each module asserts at its primary mutation but not every sub-service
  mutation (`grep` ~1 `access.assert`/module). Audit every state-changing method for an assert. **Size M.**
- **G-P2-2 · po-match runtime coupling** — Finance reads Procurement/Inventory synchronously (`po-match.port.ts`);
  replace with event-fed projection for resilience. **Size M.**
- **G-P2-3 · Reporting/analytics thin** — only 2 SQL views (`0113`); build a reporting/projection layer for exec
  dashboards. **Size L.**
- **G-P2-4 · Variation client-submission workflow** — capture client-side change origination, submission, negotiation,
  approval as a governed flow. **Size M.**
- **G-P2-5 · Approved-for-construction gate** — enforce that site execution consumes approved engineering revisions. **Size M.**
- **G-P2-6 · Payroll → GL posting** — verify/complete HR payroll → journal. **Size M.**

## P3 — Strategic

- **G-P3-1 · Pricing scenarios / what-if** on the build-up (compare margin strategies). **Size M.**
- **G-P3-2 · Clarification & Q&A log** on tenders/quotations. **Size S.**
- **G-P3-3 · Contingency & risk register** as first-class cost factors. **Size S.**
- **G-P3-4 · Bid/No-bid governance** made enforceable (not just an event). **Size S.**

## P4 — Future / optional

- **G-P4-1 · Comms integrations** (email/WhatsApp/calls → unified timeline). External-integration heavy. **Size L.**
- **G-P4-2 · Autonomous AI actions** beyond advisory (guardrails already exist). **Size L.**
- **G-P4-3 · Strategy/planning module.** **Size L.**

---

## Top-10 verified gaps preventing "true completion" (ranked)

1. **G-P0-1** RLS tenant isolation (security/correctness).
2. **G-P0-2** Migration-drift deploy-gate (operational correctness).
3. **G-P1-1** Locked Commercial Baseline into Contract.
4. **G-P1-2** Enforce pricing governance (approval/margin/versioning).
5. **G-P1-3** Requirements/Survey/Solution → scope → BOQ.
6. **G-P1-4** Bid-time supplier sourcing → estimate.
7. **G-P1-5** Progress measurement → IPC.
8. **G-P1-6** Inventory issue → Installed Asset/Warranty.
9. **G-P1-7** Collection/dunning + cash visibility.
10. **G-P2-3** Reporting/analytics layer for executives.
