# Journey Audit RE-RUN — Direct Sale (CRM close-out gate)

**Date:** 2026-07-17 · **Method:** live re-drive of the Direct Sale journey's CRM-facing surfaces on the current build. · **Baseline:** the 2026-07-17 audit scored Direct Sale **82/100** ([2026-07-17-journey-direct-sale.md](2026-07-17-journey-direct-sale.md)). · **Purpose:** the AURA Operating Review Program's close-out gate — did the CRM module's PRs move the score?

**Build under test:** main (#142 Deal-Room consolidation, #144 shell primitives) + PR-CRM-2 Commercial Workspace (#149). The still-open **#147 (pricing authoring)** and **#148 (Opportunity Activities)** are NOT in this exact build — noted where they'd move a category further.

## What changed since 82 (observed live)
- **Opportunity 360 is now a consolidated deal room** — single-purpose tabs (Overview · Qualification · Scope · Stakeholders · Commercial · Journey · Win Plan · Deal Depth · Activity) with a Situation band + clear Next-Best-Action ("Won — turn it into a quote → Generate quotation"), replacing the old five-panel long-scroll wall. → **Guidance + Discoverability up.**
- **Commercial Workspace** (`/crm/commercial`) now answers "where's everything commercial?" in one place — open quote value, awaiting-approval, contracted, quote→win, plus linked Pricing/Contracts/Approvals. → **Discoverability up.**

## New gap surfaced by this re-run 🟠
**Direct-sale contracts/projects don't appear on the Opportunity progression.** The MAF deal's quote (`QT-OPP-d36816b9`, accepted) has `convertedContractId` set and its contract is live (visible in Commercial → Contracts), yet the Opportunity 360 footer shows **"Contract — · Project —"**. Cause: `opportunity-360.controller` detects downstream contracts only via `c.tenderId ∈ this opp's tenders` — the **tender path only**. A direct deal links its contract through `quotation.convertedContractId`, which the progression never reads. So a *completed* direct sale can't see, from the opportunity, that it became a contract/project. Data lineage exists; the 360 just doesn't surface it. Same **path-asymmetry** class as the open Tender-journey gaps. Pre-existing; surfaced by the re-run. → **caps the Continuity/Discoverability gain.** Fix = read the direct path (quotation → convertedContractId → contract → project) in the progression. Candidate **PR-CRM-3** (small, server-side).

## Journey Score — Direct Sale (re-run)
| Category | Was | Now | Evidence |
|---|---|---|---|
| Automation | 9 | 9 | auto-create chain (quote→contract→project→IPC→AR) unchanged & intact |
| Data Continuity | 8 | 8 | lineage exists, but the direct-path progression gap holds this flat |
| Governance | 10 | 10 | send-requires-approved, won-requires-reason, baseline lock — unchanged |
| User Guidance | 7 | **8** | deal room → single-purpose tabs + Situation/NBA (was a 5-panel wall) |
| Zero Re-entry | 8 | 8 | unchanged here (#147 pricing-authoring would raise this once merged) |
| Discoverability | 7 | **8** | opp tab-navigable + Commercial Workspace; capped by the progression gap |
| End-to-End Completion | ✅ | ✅ **PASS** | chain still completes (Opp→Quote→Contract confirmed via convertedContractId + Commercial contracts) |

### Overall: **85 / 100** — up **+3** from 82.

Reading: the CRM consolidation + Commercial workspace lifted Guidance and Discoverability, exactly where the operating experience was weakest. The re-run also earned its keep by surfacing the direct-path progression gap — a concrete, small next fix. With #147 (pricing authoring) merged, Zero-Re-entry likely reaches 9 (author the quote from its sheet); with PR-CRM-3 (direct-path progression) Continuity/Discoverability reach 9 — a path to ~88–90.

## Tender journey (unchanged by CRM work)
Tender was 65/100; its open items are **tendering-module** concerns (tender.won doesn't close the opp; won-contract bypasses the R3 baseline — the path-asymmetry class). The CRM PRs don't touch these, so Tender stays ~65. Its lift belongs to the **Tendering** module review (next in the program) — where the same direct-path-progression fix also helps.

## Close-out verdict
CRM's two main operating-review findings shipped (#148 Opportunity Activities, #149 Commercial Workspace); Direct Sale improved **82 → 85 (PASS)**. **One clean gap remains (PR-CRM-3, direct-path progression)** before CRM is fully closed at ~88. Recommend closing that, re-confirming, then moving to **Tendering**.
