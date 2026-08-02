# AURA Revenue Lifecycle — Sales Pipeline & Tender Management Blueprint

**Date:** 2026-07-23 · **Status:** Approved architecture direction, measured against the live tree
**Principle:** *Opportunity is the shared heart. Discovery (Sales) is separated from execution (Tendering / Direct Sale). One source of truth, two execution paths.*

```
Market → Signal → Lead → Opportunity
                             ├── Direct Sale → Quotation → Negotiation ─┐
                             └── Tender → Tender Management → Award ────┤
                                                                        ▼
                                              Contract → Project → Execution → Invoice → Revenue → AMC
```

---

## 0 · The honest measurement (what the tree already holds)

This blueprint was written AFTER measuring the codebase. AURA is much closer to this
vision than a blank page — the real work is the JUNCTION, not the modules.

| Directive element | Current state | Evidence |
|---|---|---|
| Signal → Lead → Opportunity | ✅ built | S1 Lead OS, S2 Qualify&Convert (`lead-conversion.service.ts`), S3 Signal/Radar |
| Opportunity depth | ✅ built | 360 with 9 tabs (Overview · Qualification · Scope · Stakeholders · Commercial · Journey · Win Plan · Deal Depth · Activity), BANT, buying journey, health, forecast |
| Execution-type fork | ⚠️ **proto only** | `requiresTender: boolean` on Opportunity — a two-way switch where the directive needs an enum |
| Tender aggregate | ✅ built | lifecycle `draft→qualifying→estimating→priced→submitted→won/lost/declined`, sources `invitation/public/private/opportunity`, **`sourceOpportunityId` link exists** |
| Tender depth | ✅ built (T1–T5) | register + 360 + pricing pages, submission (0178), risk layer (0179), register depth (0180), BOQ Excel import |
| Estimation / pricing | ✅ built (this month) | PricingSheet aggregate + freeze/version/compare, Estimation Engine, Market Intelligence, 3-level Copilot, Intelligence Center |
| **The junction** | ❌ **wrong shape** | Reactor fires tender-create on `opportunity.won` — but bidding happens BEFORE winning. The fork must move to the execution decision ("Start Tender"), and Award must close the loop back |
| Reverse link (tender-first → auto-Opportunity) | ❌ missing | A tender registered directly never appears in the sales forecast |
| Award → close opportunity | ❌ known gap | (journey-audit memory: "tender.won doesn't close the opp") |

---

## Module 1 — Sales Pipeline (Discovery)

**Purpose:** every DIRECT opportunity — inbound call, referral, expansion, AMC, site
visit, direct sale — from first signal to the execution decision. It does **not** run
tenders; it decides that a tender should exist.

### Pages

**1 · Radar (Inbox)** — *exists (S3), extend sources*
- Signal fields today: title, source, account, impact, status; reactors already feed it (project.completed → EXPANSION, contract.completed → RENEWAL_DUE).
- Directive sources to add over time: email/WhatsApp/web-form intake (needs comms connectors — Procurement-grade honesty: build when a real inbox is wired), AI detection.
- Actions: Convert to Lead ✅ · Create Opportunity ✅ · Assign/Ignore ✅ · Merge/Watch — add.

**2 · Leads** — *exists (S1/S2)*
- Qualification score ✅ (G3), conversion with identity resolution ✅. Merge — add.

**3 · Opportunities** — *exists; views to widen*
- Views: Table ✅, Board ✅ (pipeline page), Command ✅. Calendar/Timeline/Map — later, demand-driven.
- Stages today map cleanly onto the directive's `New→Qualified→Discovery→Solution Design→Proposal→Negotiation→Won/Lost`.

**4 · Opportunity Workspace** — *exists (the 360)*
- The directive's tab list vs today: Overview ✅ Customer/Contacts (via account+stakeholders) ✅ Requirements (Scope tab) ✅ Meetings/Activities ✅ Quotations (Commercial tab) ✅ Documents — wire the DMS access layer here (same pattern as Commercial's Documents tab) · Emails/WhatsApp — with comms connectors · Tasks ✅ (activities) · History ✅ (timeline) · AI ✅ (deal brief + health).
- **NEW: the Execution panel** (the fork — see §3).

**5 · Dashboard** — *exists* (Pipeline Command Center: value, weighted forecast, win rate, aging, stalled, at-risk).

---

## Module 2 — Tender Management (Execution path)

**Purpose:** the bidding machine. Not CRM — a workspace per tender from invitation to award.

### Tender pipeline (stage mapping)

| Directive stage | AURA today | Action |
|---|---|---|
| Invitation | `draft` + source=invitation | rename-in-UI only |
| Qualification (Go/No-Go) | `qualifying` + risk layer (T3) | add the **Go/No-Go checklist** (Financial/Technical/Resources/Experience/Legal/Risk) + AI recommendation — T6 "bid review" was deferred; this is it |
| Site Visit | — | add as a checklist item + activity, not a lifecycle stage (not every tender has one) |
| BOQ | `estimating` + BOQ import (T5) | ✅ |
| Technical Proposal | document kinds exist (DMS) | surface as a tab: method statement, compliance matrix, deviations, datasheets |
| Commercial Proposal | `priced` — **now powered by the PricingSheet** | route the tender's pricing through the same PricingSheet aggregate (one engine everywhere) |
| Submission | `submitted` + submission record (T2/0178) | ✅ checklist/files/history |
| Clarifications | — | add: Q&A log per tender (same pattern as the Negotiation log — append-only, dated) |
| Evaluation | bid scores exist | surface technical/commercial score + ranking + competitors |
| Award | `won/lost` + win-loss analysis | **wire Award to close the Opportunity** (§3) |

### Tender Workspace tabs (target)
`Overview (number/client/deadline/bonds/EMD/consultant) · Qualification (Go/No-Go) · Documents (DMS) · BOQ · Technical · Commercial (PricingSheet) · Clarifications · Submission · Evaluation · Award`

AI inside the tender = the same grounded pattern as pricing: deterministic findings
(missing documents from the requirements layer, BOQ anomalies, pricing outliers vs
Market Intelligence, qualification score) that the AI narrates — never invented
probabilities.

---

## 3 · The Junction (the real work of this directive)

**A. `executionType` replaces `requiresTender`** on Opportunity:
`direct_sale | tender | framework_agreement | amc_renewal | variation_order`
(tender subtype gov/private lives on the Tender's existing `source`). Kept editable
until an execution artifact exists.

**B. "Start Tender"** — an action on the Opportunity (enabled when executionType=tender):
creates the Tender **now** (draft, `sourceOpportunityId` set — the link field already
exists), navigates into the Tender Workspace. The seller never "opens a tender"; they
record an opportunity and choose its path.

**C. Reverse creation** — registering a tender directly in Tendering auto-creates a
linked Opportunity (executionType=tender, value = tender value) so tender-first work
appears in the sales forecast. Idempotent; skipped when the tender already came from
an opportunity.

**D. Correct the reactor** — remove tender-creation from `opportunity.won` (bidding
precedes winning). Instead: **`tender.won` → close the linked Opportunity as Won**
(and `tender.lost` → Lost with reason) — which also fixes the long-known journey gap
"tender.won doesn't close the opp".

**E. Direct Sale path** stays exactly as built: Opportunity → (scope→) Quotation via
the PricingSheet workspace → Negotiation → Won → Contract.

**F. Quotation is shared output.** Both paths may end in a customer-facing quotation
priced by the ONE PricingSheet/Estimation engine (already unified this month).

---

## 4 · Sidebar (target IA)

```
Revenue
├── CRM            Accounts · Contacts · Sales Pipeline · Activities
├── Tendering      Dashboard · Tenders · Estimation · BOQ · Submissions · Awards
├── Quotations
├── Contracts
├── Projects
└── Revenue
```
(Respects the UX doctrine: grouping change only — no page splits.)

---

## 5 · Slice plan (each = one verified PR-able commit)

| # | Slice | Contents |
|---|---|---|
| **J1** | `executionType` on Opportunity | enum + migration (map `requiresTender`→`tender`/`direct_sale`), edit on the 360, forecast unchanged |
| **J2** | Start Tender + reverse link | the action + tender→auto-Opportunity + provenance chips both ways |
| **J3** | Reactor correction | remove won→tender; add tender.won→opp Won / tender.lost→opp Lost |
| **T-A** | Go/No-Go checklist | qualification checklist + recommendation on the tender 360 |
| **T-B** | Clarifications log | append-only Q&A per tender (Negotiation-log pattern) |
| **T-C** | Tender Commercial = PricingSheet | tenders price through the same aggregate |
| **IA** | Sidebar re-grouping under Revenue | nav only |

J1→J3 are the directive's heart and are small; T-A→T-C deepen Tendering to the spec;
IA is cosmetic and last.
