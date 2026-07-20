# Business Journey Audit — Direct Sale, close-out re-run on merged `main`

**Date:** 2026-07-20 · **Method:** live E2E in the running app — every step driven through the UI, no hand-written API calls for any journey action · **Commit:** `f829007` (merged `main`, PRs #155–#164) · **Scenario:** *"A call came in from Majid Al Futtaim — they want an ELV upgrade for two new malls."* (same scenario as the 2026-07-17 run, for comparability)

This is the close-out re-audit that `2026-07-17-journey-direct-sale.md` records as outstanding — the gate for declaring CRM closed. The rubric is unchanged: 6 categories × 10, sum ÷ 60 × 100, with end-to-end completion as a pass/fail gate.

**Verification note:** the API was treated as the source of truth throughout. Browser DOM reads were used to drive the UI, not to establish outcomes — four times during this run a DOM or query-level check reported a wrong result that the API contradicted (see §4).

---

## 1. The journey as executed

| # | Step | Where | Result |
|---|------|-------|--------|
| 1 | Detect signal (Relationship / Expansion / 75) | Sales Pipeline → Radar → **+ Detect signal** | Signal captured with evidence; card showed AI read **"PROMOTE — Strong 75% confidence"** |
| 2 | Promote → Lead | Radar card action | Lead created, `signalId` kept, **evidence carried into `requirement`**, source mapped `RELATIONSHIP` → `referral` |
| 3 | Qualify & Convert | Lead 360 drawer | Account linked, contact proposed, Opportunity opened — 1.5M, direct route, close 2026-09-30 |
| 4 | Stage → Won (+ win reason inline) | Opportunity 360 | Gate opened an inline **"Why did we win?"** field; reason persisted; KPI renders **100%** |
| 5 | → Quotation | Opportunity 360 | `QT-OPP-947e5807` auto-drafted — 1,500,000 + 5% VAT = **1,575,000**, zero re-entry |
| 6 | Approve → Send → Accept | Quotation 360 | **Send appeared only after approval**; Commercial Baseline `4375c017` locked on approve |
| 7 | → Contract | Quotation 360 | `Contract from QT-OPP-947e5807` — value **1,575,000**, `commercialBaselineId = 4375c017` |
| 8 | Activate / Sign | Contract 360 | Contract `active`; **Project `06b9b414` auto-created** with `contractId` and inherited value |
| 9 | Raise IPC 1 (500k work, 10% retention, 5% cap) | Payment Certificates | `IPC-001` — gross 500,000, retention −50,000, **net 450,000** |
| 10 | Submit → Certify | Payment Certificates | **AR invoice `AR-IPC-001-94e8b89f` auto-created** — 472,500 (450,000 + 5% VAT); the certificate row renders `🧾 AR-IPC-001-94e8b89f →` |

**End-to-end: Signal → issued AR invoice, one sitting, entirely inside AURA.**

---

## 2. What this run proves

- **The commercial baseline is real, not nominal.** The contract's `commercialBaselineId` is byte-identical to the baseline locked at approval, and its value is inherited from it rather than re-entered. R3's central promise verified end-to-end for the first time in a journey run.
- **Three reactors fired unattended**: quotation → (approve) baseline, contract → project, certify → AR invoice.
- **Three gaps from the 2026-07-17 audit are genuinely closed** — verified by driving them, not by reading the commit: #2 (evidence + source carried on promote), #3 (win-gate no longer swallowed), #4 (won KPIs read 100%), #6 (certify→AR link renders).

---

## 3. Gaps found this run

| # | Gap | Severity | Evidence |
|---|-----|----------|----------|
| A | **The account register holds duplicates** — 6 names duplicated, 5 of them **three times** (`Majid Al Futtaim` ×3, `DP World` ×3, `Emaar Properties` ×3, …). 17 of 30 rows represent 6 real companies. Cause: `seed-demo.mjs` creates accounts with a blind `POST`, no existence check — and `POST /admin/platform/seed-demo` is exposed in the Admin Center, so two clicks duplicate the master. | 🔴 blocker (data) | Measured across `/crm/accounts`; identical `createdAt`, owner and status |
| B | **`lead.accountId` is never linked** — promote correctly refuses to guess among three identical accounts, but convert links the *opportunity* to an account and never repairs the lead. The lead stays account-less permanently. | 🟠 friction | `lead.accountId = null` before and after conversion; `opportunity.accountId = 8ef627ff` |
| C | **"EXACT MATCH — name exact" is claimed against three identical accounts.** The convert drawer offers a single confident link and does not disclose that two other identical accounts exist, or which one it picked. | 🟠 friction | Convert drawer text vs three exact rows |
| D | **A record action gives no feedback for ~4.4 seconds.** Originally written as "the UI does not refresh after its own action" — **that was wrong and is corrected here**. All three screens *do* re-fetch (`load()` / `refresh()`); measured on `Mark paid`, the row updated at **4373 ms**. The defect is the silence: during that window there are **zero disabled buttons, zero busy indicators and zero pending labels**, so the action button stays live and clickable. On financial actions (`Certify`, `Mark paid`) a second click is the natural response. My five "stale UI" observations during the run were reads taken inside that window. | 🟠 friction | Polled at 300 ms intervals after a real click; button/aria-busy state inspected mid-flight |
| E | **"Send to customer" sends nothing to the customer.** It transitions status and appends an event; there is no outbound mail path wired to it. | 🟡 polish | `quotation.service.ts` — status + event only |
| F | **Auto-drafted quotation has no `validUntil`.** My Day's expiry insights ("lapsed validity", "expires ≤7d") therefore can never fire for a generated quote. | 🟡 polish | `validUntil = None` on `QT-OPP-947e5807` |
| G | **Auto-drafted quotation has no `unitCost`** — margin unknown until someone opens the pricing sheet. Unchanged from 2026-07-17 (#5, "by design, watch"). | 🟡 by design | `unitCost = None` |
| H | **Form fields carry placeholders but no `aria-label`** — the win-reason, competitors and all five IPC inputs. Placeholder-only labelling disappears on input. | 🟡 polish | DOM inspection; contrast with the WCAG work in #155 |
| I | The certify→AR link lands on the invoice **list**, not the invoice. | 🟡 polish | `href="/finance/customer-invoices"` |

---

## 4. Measurement honesty

Four times during this run an intermediate check reported a result the API contradicted. Each is recorded because the audit's value depends on the reader trusting the numbers:

1. **Step 2** — a lead lookup fell back to "most recently created" when its name match failed, and returned an unrelated record (`name: "test"`). Reported as the step's outcome before being caught. Fixed by keying strictly on `signalId` with no fallback.
2. **Step 4** — a post-click verification read a `502` response and reported `stage: qualification`. The API showed `won` with the reason persisted.
3. **Step 7** — the contract was reported missing because the search filtered on a title substring that did not match. The `POST` had returned `201`.
4. **Step 10** — the certify→AR link was reported absent. It was a race with the 1-second outbox relay; the invoice was created 3 seconds after certify and the link renders correctly once it exists.

None of these were product defects. All four were faults in how the run was measured.

**Environment note:** both dev servers crashed mid-run (API twice, web once) and were restarted; a background task was editing `modules/crm` concurrently. Timings were not measured in this run and none are reported.

---

## 5. Journey Score

| Category | Score | Evidence from this run |
|---|---|---|
| Automation | **10/10** | Baseline locked on approve, project auto-created on activate, AR invoice auto-created on certify, quotation auto-drafted from the deal. No blocker in any automated hop — the signal-store 500 that cost a point on 2026-07-17 is gone. |
| Data Continuity | **8/10** | Lineage unbroken at every hop (`signalId`, `sourceOpportunityId`, `commercialBaselineId`, `contractId`, `AR-IPC-*`), and the baseline→contract tie proven. −2: the account register is triplicated (gap A) and `lead.accountId` never links (gap B). |
| Governance | **10/10** | Send only became available after approval; won required a reason; retention capped correctly; the approved baseline is immutable and inherited by the contract rather than re-entered. |
| User Guidance | **7/10** | AI read on the signal, inline win-reason, 100% on a won deal, and a button that names its own effect (*"Activate / Sign → creates Project"*). −3: a record action is silent for ~4.4s with no pending state (gap D), "Send to customer" sends nothing (gap E), and "EXACT MATCH" is asserted against three identical accounts (gap C). |
| Zero Re-entry | **9/10** | Signal evidence lands in the lead; opportunity → quotation → contract → project → IPC → invoice retypes nothing. −1: the generated quotation carries neither validity nor cost, so both must be filled in later (gaps F, G). |
| Discoverability | **8/10** | The record tab strip works across the chain (including Quotation, fixed in #156), and the certify→AR handoff is now visible. −2: that link lands on a list rather than the invoice (gap I), and three identical accounts make "which MAF" unanswerable (gap A). |
| **End-to-End Completion** | ✅ **PASS** | Signal → issued AR invoice, one sitting, no external tools. |

### Overall Journey: **87 / 100** *(measured 2026-07-20 on `f829007`)*

52 / 60 → 86.7, reported as 87.

**Trend:** 82 (2026-07-17) → 85 (re-run, same day) → **87** (this close-out).

**Reading.** Governance and automation are now both perfect and were exercised hard. Every remaining point is lost to one of two things: **duplicated account data** (gaps A–C, −3 across two categories) and **actions that stay silent while they are in flight** (gap D). Neither is a rule failure and neither needs a new feature. Fixing the seeder and adding pending feedback to record actions would put this journey at ~94 without touching the domain.

**On declaring CRM closed:** the E2E gate passes and this is the outstanding close-out run. Gap A is a 🔴 on data integrity that reaches the product through an Admin Center button, so closure should be called only once the seeder is idempotent and the existing duplicates are merged.
