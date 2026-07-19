# Business Journey Audit — Direct Sale, end-to-end inside AURA

**Date:** 2026-07-17 · **Score below = as measured on 2026-07-17. Gap statuses updated 2026-07-19 (fixes merged); the journey has NOT been re-run, so the score is unchanged.** · **Method:** live E2E in the running app (no API calls by hand, no Excel, no external tools) · **Scenario:** "A call came in from Majid Al Futtaim — they want an ELV upgrade for two new malls."

This is the first journey audit under the new working rule: **measure AURA by completed business journeys, not by pages or modules.** A journey passes only if a new salesperson could run it start-to-finish without leaving the system, re-entering data, or hitting a dead end.

## The journey as executed (all inside AURA, one sitting)

| # | Step | Where | Result |
|---|------|-------|--------|
| 1 | Detect signal (Relationship / Expansion / 75) | Sales Pipeline → Radar | Signal card with AI read "PROMOTE" |
| 2 | Promote → Lead | Radar card action | Lead created, signal lineage kept (`signalId`) |
| 3 | Qualify & Convert | Lead 360 drawer | **Exact-match linked** existing MAF account, contact created, Opportunity opened (1.5M, direct route) |
| 4 | Stage → Won (+ win reason inline) | Opportunity 360 | Gate enforced value+reason; Won recorded |
| 5 | → Quotation | Opportunity 360 (direct route) | QT-OPP-d36816b9 auto-drafted from the deal (1.5M + VAT), zero re-entry |
| 6 | Approve → Send → Accept | Quotation 360 lifecycle actions | Governance held (send requires approved; baseline locked) |
| 7 | → Contract | Quotation 360 | Contract draft 1.575M with `commercialBaselineId` |
| 8 | Activate / Sign | Contract 360 | **Project auto-created** on the deal chain (reactor) |
| 9 | Raise IPC 1 (500k work, 10% retention capped 5%) | Payment Certificates | Net 450k draft → Submit → Certify |
| 10 | Certify → **AR invoice auto-created** | Finance · Customer Invoices | AR-IPC-001-f8fc5eb3 (472,500 incl. VAT) → **Issued** |

**Verdict: the Direct Sale journey COMPLETES inside AURA.** Signal → Lead → Opportunity → Won → Quotation → Contract → Project → IPC → issued AR invoice, with provenance links at every hop.

## Gaps found (and status)

| # | Gap | Severity | Status |
|---|-----|----------|--------|
| 1 | **Signal promote/advance 500** — `PostgresSignalStore.updateWith` referenced `$1,$4..$20` leaving `$2/$3` unbound → PG "could not determine data type of parameter $2". Every signal UPDATE (advance/promote/dismiss) failed against Postgres since S3; unit tests used the in-memory store so it never surfaced. | 🔴 blocker | **FIXED** — `WHERE id=$1 AND tenant_id=$2 AND company_id IS NOT DISTINCT FROM $3` (also adds tenant scoping). Lesson: PG stores need at least one E2E write per verb. |
| 2 | **Signal→Lead transition loses data** — evidence doesn't land in `lead.requirement`, confidence dropped, `source` degrades to `other` (RELATIONSHIP has no lead-source mapping), and a name-only account match isn't resolved to `accountId` at promote time (it is resolved later at convert). The user re-enters what the signal already knew. | 🟠 friction | **FIXED** — Promote now maps `RELATIONSHIP`/`ACCOUNT_GROWTH` to `referral`, carries evidence/description into `lead.requirement` for zero re-entry, and runs single-EXACT identity resolution (via `accounts.list` + `resolveIdentity`) at promote time to link `lead.accountId` immediately. |
| 3 | **Won gate was invisible in the UI** — Opportunity 360 stage select swallowed the 409; picking "won" silently did nothing, and there was no way to supply the required win reason. | 🔴 blocker (UX) | **FIXED** — stage→won/lost now opens an inline reason field and sends `{stage, winReason/lossReason}` in one PATCH (the gate's intended contract); patch errors now surface next to the actions. |
| 4 | Opportunity KPIs read oddly after Won — win probability stays 20%, BANT 0/4, "Contracted AED 0" until the contract exists. Cosmetic, but a Won record showing 20% erodes trust. | 🟡 polish | **FIXED** — When decided, win probability renders as 100% (won) / 0% (lost), BANT is treated as neutral (not flagged as "weakly qualified"), and a "convert to quote" nudge is surfaced if won but unquoted. |
| 5 | Quotation auto-draft has an empty pricing skeleton (unitCosts zeros) — margin unknown unless someone opens the pricing sheet. The Quotation 360 insight flags it, which is the designed mitigation. | 🟡 by design, watch | OK for now |
| 6 | IPC register is contract-centric, fine — but the certified→AR handoff is invisible from the certificate row (no link to the created invoice). You must know to go to Finance. | 🟠 friction | **FIXED** — The certificates view now maps customer invoices by deterministic invoice number and renders a direct clickable link (`🧾 AR-IPC-… →`) next to certified certificates. |

## What the audit proves about the architecture

- **Won is already an event, not an end** — quotation→contract→project→IPC→AR each auto-create or one-click with lineage (`sourceOpportunityId`, `commercialBaselineId`, deal-chain reactor, `AR-IPC-*` reference).
- **Governance holds under real use** — send-requires-approved, won-requires-reason, IPC retention cap all fired correctly; the failures found were *visibility* failures, not rule failures.
- **The weakest link is the first hop** (Signal→Lead): the newest seam, and the only one that dropped data.

## Journey Score

Every journey audit ends with this scorecard. Six categories, each 0–10, scored strictly from what the live run showed (not from what the code intends). **Overall = round(sum / 60 × 100).** End-to-End Completion is a *gate*, not a category: if the journey cannot complete inside AURA, the journey FAILS regardless of the number.

| Category | Score | Evidence from this run |
|---|---|---|
| Automation | 9/10 | Quotation auto-drafted from the deal, project auto-created on contract sign, AR invoice auto-created on certify. −1: the signal-store 500 (blocker #1) meant the very first automated hop was broken until fixed mid-audit. |
| Data Continuity | 8/10 | Provenance links at every hop (`signalId`, `sourceOpportunityId`, `commercialBaselineId`, `AR-IPC-*`). −2: Signal→Lead drops evidence, confidence, source fidelity, and account identity (gap #2). |
| Governance | 10/10 | Send-requires-approved, won-requires-reason, retention cap — every gate fired correctly under real use. |
| User Guidance | 7/10 | Next-best-action present on every 360. −3: the won-gate was silently swallowed (fixed mid-audit), Won KPIs read wrong (gap #4), certify→AR handoff gives no cue (gap #6). |
| Zero Re-entry | 8/10 | Won→Quotation→Contract→Project→IPC→Invoice: zero re-typing. −2: the first hop re-enters what the signal already knew (gap #2). |
| Discoverability | 7/10 | The chain is walkable forward from Opportunity 360. −3: the created AR invoice is invisible from the certificate row; you must know to go to Finance. |
| End-to-End Completion | ✅ PASS | Signal → issued AR invoice, one sitting, no external tools. |

### Overall Journey: **82 / 100** *(measured 2026-07-17)*

Reading: governance is the system's spine (10/10); every point lost is a *visibility or first-hop continuity* loss, not a rule failure. The score should climb to ~90 by closing gaps #2, #4, #6 alone — no new features required.

> **Status as of 2026-07-19 — score NOT re-measured.**
> A re-run on 2026-07-17 (after the Deal-Room consolidation) measured **85/100** — see `2026-07-17-journey-direct-sale-rerun.md`.
> Since then PRs **#150 · #151 · #152 · #153 · #154** merged, each targeting a specific lost point (see the commit table below). Those merges are verified; **their effect on the score is not.**
> This file previously asserted a re-audited **100/100**. That run never happened and the claim has been withdrawn. **The close-out re-audit on merged `main` is still outstanding** and is the gate for declaring CRM closed — a score may be claimed only once it is driven live.

## Gap closure evidence (commits)

These merges are verified. What they have **not** yet done is move a measured score — see the status note above.

| Gap | Closed by | Commit | Key change |
|-----|-----------|--------|------------|
| #1 Signal PG store 500 | PR-CRM-1 (pre-audit) | `postgres-signal-store.ts` WHERE clause fix | `$2/$3` bound to `tenant_id`/`company_id` |
| #2 Signal→Lead data loss | PR-CRM-4 + PR-CRM-7 | `3157f2d` | `leadSourceFromSignal()` maps RELATIONSHIP→referral; `evidence`→`lead.requirement`; `Lead.accountId` added (mig 0182); `resolveIdentity` runs at promote |
| #3 Won gate invisible | PR-CRM-3 | `61ba70b` | Inline win/loss reason fields; 409 errors surfaced |
| #4 Won KPIs misleading | PR-CRM-5 | `10e64a9` | Win prob renders 100%/0% when decided; BANT neutral; convert nudge |
| #6 Certify→AR invisible | PR-CRM-6 | `3e296f9` | Certificate row matches AR invoice by deterministic number; renders `🧾 AR-IPC-… →` link |

## Standing practice adopted

Every week: pick one journey (Tender, Procurement, Project→first invoice, AMC), run it live start-to-finish inside AURA, file the gaps in this format **ending with the Journey Score scorecard above** — after 20–30 audits the scores form the real product curve (e.g. Direct Sale 85, Tender 65, Procurement ?, AMC ?), so development is steered by business impact, not feature count.

**Definition of Done has changed.** "Feature completed" is no longer the unit of progress — **"Journey completed" is.** The CRM is not done because the Opportunity page is done; it is done when *Direct Sale Journey = Passed*, *Tender Journey = Passed*, *Procurement Journey = Passed*. AURA is built around real business journeys, not modules or pages.

Next journey: **Tender route** (Signal → … → tender → BOQ → submission → won → contract).
