# AURA OS — Capability Audit, Phase 2 (Browser UX): Engineering

**Mode:** live browser walkthrough, **findings frozen — NO remediation** (per instruction, remediation
waits until this register is reviewed).
**Auth:** ON (real session). Driven as actor **`u-admin`**, tenant *AURA Group HQ* (`dev-tenant`).
**Date:** 2026-09-11. **Stack:** local, API bound to the **`e2e-disposable`** DB, migrations 295/295.

Each capability was driven the way a user works it — **create → find/reopen → update → lifecycle
transition → downstream consequence → verify persisted** — with UX evidence recorded separately.
A prerequisite active project ("Phase2 Audit Project") was seeded through the authenticated session
(the audited capabilities are Engineering's, not project creation).

**Scope honesty:** `u-admin` holds broad permissions, so **role-specific visibility, forbidden
states, and second-actor SoD were NOT exercised** — a non-admin pass is still owed (F-ENG-13).

---

## Per-capability result (Phase-2 verified)

| # | Capability | Create | View/Find | Lifecycle (UI) | Downstream | Persisted | Class (Phase 2) |
|---|---|---|---|---|---|---|---|
| 1 | Overview | n/a | ✓ | n/a | n/a | n/a | COMPLETE |
| 2 | Shop Drawings | ✓ | ✓ | ✓ **full 6-state** | auto-transmittal | ✓ | **COMPLETE** |
| 3 | RFIs | ✓ | ✓ | ✓ answer | — | ✓ | COMPLETE · list-stale |
| 4 | Technical Submittals | ✓ | ✓ | ✓ *thin* approve/reject | — | ✓ | **PARTIAL (authority/F2)** |
| 5 | Technical Queries | ✓ | ✓ | ✓ respond | cost/time flags | ✓ | COMPLETE |
| 6 | Design Changes | ✓ | ✓ | ✓ decision | ✓ **auto-variation** | ✓ | **COMPLETE + handoff** |
| 7 | Documents | ✓ | ✓ | ✗ **transition UI-missing** | — | ✓ | **PARTIAL (backend-only lifecycle)** |
| 8 | BIM Models | ✓ | ✓ | ✓ version | — | ✓ | COMPLETE · list-stale |

**Headline:** 7 of 8 work end-to-end in the UI; the **Shop Drawings** workflow is genuinely
excellent. **Documents is PARTIAL** (a page hiding a missing lifecycle). Data persistence and
permissions held throughout; the main systemic weakness is **post-mutation refresh + feedback**, not
correctness.

---

## What worked well (evidence, not flattery)

- **Shop Drawings — a model workflow.** A dedicated `/engineering/drawings/[id]` page with a visual
  **stepper** (Draft → Submitted → Under Review → Approved → Transmitted → Closed), per-state action
  bars, SUBMISSIONS/REVIEWS/TRANSMITTALS/ACTIVITY sections, a closed-state **immutability notice**
  ("🔒 raise a new revision to make changes"), and a full **actor-stamped audit trail**
  (*Submitted/Review started/Decided/Transmitted/Closed by u-admin*). Transmit **auto-creates a
  transmittal** (`TR-…`).
- **Design Changes → commercial variation (cross-module handoff, provenance CONFIRMED).** Approving
  a cost-impact DC auto-raised project variation **`VO-DC-a682c73c`** — title *"Variation from design
  change DC-101…"*, description *"Auto-drafted from approved engineering design change DC-101,"*
  addition £12,000, draft. Provenance is explicit and strong.
- **Domain fidelity.** ELV-aware discipline lists (cctv, access control, bms, fire alarm, ict…),
  BIM formats (IFC/RVT/NWD/NWC/DWG/GLB) and **ISO-19650 CDE states** (WIP/SHARED/PUBLISHED/ARCHIVED),
  a **schema-driven** document form (fields change per document type), clear RFI-vs-TQ helper text,
  and an explicit **authority banner** (pre-award engineering owned by *Tender 360*; "no duplicate
  writer").
- **Empty states** are labelled and tell the user the next action.

---

## Findings register (FROZEN — no remediation)

### A. Capability completeness
- **F-ENG-01 · Documents lifecycle is UI-missing (PARTIAL, backend-only).** The Documents tab is
  **create + view only**. A created document sits at **Draft** with **no UI control to issue, approve
  or transition it** anywhere in the surface, though the lifecycle exists in the API/BFF
  (`PUT /engineering/documents/:id/transition`). This is the sharpest "a page hides a missing
  lifecycle" case. *Severity: high — controlled documents cannot be advanced by a user.*
- **F-ENG-02 · Technical Submittal is a thin, unlinked parallel (F2 — confirmed live).** The
  Engineering submittal goes **Draft → Approve/Reject directly** — no submit-to-consultant step, no
  A/B/C/D review code, no revision, no revise-and-resubmit, no SoD, and **nothing links it to the
  Doc-Control submittal register** (which owns the real consultant-review lifecycle). Confirms the
  Phase-1 F2 determination in the running UI. *Severity: medium — two disconnected submittal
  registers, the Engineering one materially weaker; authority decision still pending.*

### B. UX problems (dimensions 11 & 14)
- **F-ENG-03 · Inconsistent post-mutation refresh (systemic).** Some lists/sections refetch after a
  mutation, others go **stale until a manual reload**: RFI list did **not** refresh after *create* or
  *answer*; BIM list did **not** refresh after *version*; the drawing detail's **TRANSMITTALS**
  section did **not** refresh after *transmit*. (Submittals, TQ, Design Changes lists and the rest of
  the drawing detail *did* refresh.) A user reasonably concludes the action failed and may repeat it.
  *Severity: high (perceived reliability); data always persisted correctly.*
- **F-ENG-04 · No pending/loading state on actions.** Buttons don't disable or spin during the async
  refetch window, so the UI briefly shows the pre-action state with no "saving…" feedback —
  double-submit / double-click risk. Pairs with F-ENG-03.
- **F-ENG-05 · Hydration immediate-click drop (F6 — CONFIRMED live).** A tab click issued right after
  a fresh page load was **silently dropped**; the identical click worked once the page settled. The
  interaction-readiness race affects **real users**, not only tests. *Severity: medium.*
- **F-ENG-06 · Audit-trail label bug.** On the drawing ACTIVITY feed, the "Decided … → X" line renders
  the **current status** rather than the **decision outcome**: it read "→ Approved", then "→
  Transmitted", then "→ Closed" at the *same* 9:37:14 timestamp, while the REVIEWS table correctly kept
  "Approved". A stored/derived audit line that changes with later status is misleading. *Severity:
  medium (audit integrity).*
- **F-ENG-07 · Checkbox labels not programmatically associated (a11y).** The TQ "Potential cost/time
  impact" (and the Design-Change cost-impact) checkboxes render a visible label but expose only "on"
  to the accessibility tree (no name). Screen-reader users get an unnamed checkbox. *A broader a11y
  pass is deferred; this is the one caught in passing.*
- **F-ENG-08 · Terminology drift.** Tab "**Shop Drawings**" vs breadcrumb "**Drawing Register**" for
  the same thing. Minor, but it's the sort of inconsistency that erodes trust.

### C. Authority / cross-module (the F2 theme, widened)
- **F-ENG-09 · Engineering mints its own transmittals.** Drawing *transmit* creates an
  Engineering-side transmittal (`TR-…`), separate from the **Doc-Control transmittal** register. A
  document controller would not see it. Same family as F2 (submittals) — Engineering and Doc Control
  each keep parallel registers.
- **F-ENG-10 · Cross-authority document creation.** The Engineering Documents form can create a
  **Risk Assessment (hse)** — a document its own helper says "is owned by HSE." Ownership is displayed
  (OWNER column: ENGINEERING/HSE), but a create-from-Engineering of an HSE-owned artefact is an
  authority seam worth confirming (does it surface correctly on the HSE side?). *Not tested on the HSE
  surface — flagged.*
- **F-ENG-11 · Cross-module UI continuity is data-only.** The DC→variation handoff carries strong
  provenance, but the Engineering DC row exposes **no clickable link** to the variation it raised (you
  must navigate to Projects→Variations). Provenance ✓, click-through continuity ✗.
- **F-ENG-12 · Auto-raised variation loses the originating actor.** `VO-DC-…` was created with
  `createdBy: null` even though `u-admin` approved the design change. Minor audit gap on the derived
  record.

### D. Scope / environment
- **F-ENG-13 · Permission-visibility NOT exercised.** Audited as `u-admin` (broad perms), so
  role-specific visibility, forbidden/403 states, and second-actor SoD were not observed. A non-admin
  actor pass is owed before Engineering's permission dimensions can be called verified.
- **F-ENG-14 · Create hard-gated on a project; fresh tenant has none.** Every create needs a selected
  project; a new tenant has zero, and the banner ("Select a project…") doesn't point to *create one*.
  Correct that engineering belongs to a project; guidance could be stronger. (Cross-workspace
  continuity otherwise works — a project made elsewhere appears here **after a reload**; the selector
  doesn't live-refresh.)
- **F-ENG-15 · Possible Overview metric inaccuracy (low confidence).** The Overview showed "Drawings
  awaiting approval: 1" while the only drawing was **Closed**. Could be a definition difference; flag
  to confirm the metric's query.

---

## Engineering verdict (Phase 2)

**Strong, and better than the route tree suggested.** The workspace is a real, capable engineering
surface: one capability is a model workflow (drawings), six work end-to-end, and a genuine
cross-module handoff (DC→variation) fires with provenance. The gaps are specific and mostly about
**finish, not foundations**:

- one **PARTIAL** capability that needs a UI lifecycle (Documents, F-ENG-01),
- a **systemic reliability-feel** issue — inconsistent refetch + no pending state (F-ENG-03/04), the
  single most worth-fixing UX theme,
- the **authority overlaps** (submittal/transmittal/risk-assessment) that the F2 decision should
  resolve as one policy (F-ENG-02/09/10),
- and confirmation that the **hydration immediate-click** race is real for users (F-ENG-05).

No data loss, no broken persistence, no broken handoff. **Remediation deliberately not started** —
this register is for review and prioritisation first.

**Next in the plan:** Sales → Pre-Sales/Tendering → Project Management → the cross-domain
Signal→Close UX journey (provenance + UI continuity), then the remaining global surfaces.
