# Backlog — Communication Center cleanups + Opportunity 360 program

**Date:** 2026-08-25 · **Branch:** main · **Status:** captured, NOT started (no app code changed)

Two SEPARATE programs. Do not interleave them.

---

## Program A — Communication Center / shell cleanups (12 items, user-selected in-browser)

Small, visible, low-risk. Ordered roughly by effort.

| # | Item | Scope | Size |
|---|------|-------|------|
| A1 | Remove the "My Work navigation" bar (Home · My Work · My Day · Command Center · Inbox · Search · AI Workspace · Notifications · Saved Views), rendered by `AppShell` | everywhere it appears, not just home | S |
| A2 | Bell must show ALL new notifications (today: plain emoji link to `/inbox`, `title="1 unread"`) | dropdown vs page — OPEN QUESTION | M |
| A3 | "Home" breadcrumb is a plain `span` → make it a link to `/` (`Breadcrumbs` in `AppShell`) | trivial | S |
| A4 | Email: (a) user-created folders to segregate mail, (b) delete mails, (c) cancelable compose | (c) UI only; (a)+(b) need data model + endpoints | L |
| A5 | Chat: keep ONLY "All company" (auto-group of everyone); drop preset dept channels (Finance/HR/Leadership/Operations/Procurement/Projects); users create their own groups with create/add/remove/delete/archive/leave; creator manages membership; remove the preset "Direct Messages" section — DM by searching a user; a new message must raise a notification AND show unread in the list (WhatsApp-style) | membership model + unread state + notification wiring | XL |
| A6 | Meetings (today "Not implemented"): show Scheduled / Ended / All as a record; a finished meeting gets minutes ("resume"); in-AURA meeting → AI records + summarises + briefs; external meeting → AI asks the user what happened; data feeds AI for tasks / decisions / decision-maker / agenda | whole module; live capture needs infra beyond the app | XL |
| A7 | Remove the standalone WhatsApp card → offer WhatsApp as an option inside Chat | UI easy; real delivery needs WhatsApp Business API | M |
| A8 | Rename "Internal Chat" → "Chat" (card label + module heading) | trivial | S |
| A9 | Shared Files: show all files shared BY / WITH / CC'ing the user; view inline (PDF, Excel…); sign or modify if owner; a share window with a note ("sign here", "please review", "review result…"); stored in Document Center (single owner, no second copy); AI reviews + compares + learns when metadata is complete, else extracts it and asks the user to confirm | viewer + e-sign + AI metadata | XL |
| A10 | Remove the "Contacts" card from Communication (it lives in Sales/CRM) | trivial | S |
| A11 | Retire the `/workspace` hub (`WorkspaceHubClient`, duplicate of `/my-work/communication`) → redirect + drop links | S |
| A12 | Remove the CRM Advisor side panel (`CrmAdvisor`, "Advisor") — redundant with the AURA brief | S — but see B/Phase 4: "one intelligence engine" |

**Quick batch (do first):** A1, A3, A8, A10, A11, A12 (+A4c).

---

## Program B — Opportunity 360 (Deal Operating System)

Driver: the `contractedValue` defect was NOT a one-off. The 360 composes several concepts, each defined independently per page, so they contradict each other. **These are semantic-consistency problems, not CSS.**

User-reported contradictions to verify in Phase 0:

- Deal Depth says "no deal value" while an Award value exists
- Journey can say Won while Buying Stage is unset
- Win Plan 0/10 yet "Everything is fine"
- Communication has no email/phone yet "Everything is fine"
- Documents can be Loading yet "Everything is fine"
- Qualification 1/4 with no escalation (Unknown silently treated as fine; `false` mislabelled "Unqualified")
- A health headline that disagrees with its own score

### Architecture (agreed)

```
Opportunity + Stakeholders + Requirements + Pricing + Quotations + Approvals + Documents
   -> DealFacts (aggregation layer, cross-domain I/O)
   -> Deterministic rules (pure, testable: Qualification / Readiness / Health / Attention / NextAction)
   -> Opportunity 360 view
```

Not a new pattern — the tree already does this in miniature (`resolveNextAction(opp, facts)`, `opportunityAttention(opp, facts)`, `checkStageTransition(opp, next, evidence)` fed by `stageEvidence()`). The facts are just thin and each page builds its own. Phase 0 makes it the ONLY path.

### Central invariant (5 states — never collapse to a boolean)

`Verified Healthy` · `Attention Required` · `Not Assessed` · `Not Applicable` · `Unable to Verify`

AURA must never say "Nothing needs attention" merely because an alert list is empty. Same defect class as G-05 error semantics (empty rendered identically to error) → **assert the WORDING** in tests, and **always run the negative control**.

### Phases

**Phase 0 — Semantic Foundation (read-only first, NO UI change).** Deliverables:

1. Concept matrix — every row backed by a real code path (`file:line`) + a reproducible probe. No "likely inconsistent" guesses; a gap claim is a measurement.
2. `DealFacts` shape + deterministic rule signatures over it.
3. The 5-state model + the exact wording per state.
4. `QualificationState` enum (`Unknown | Confirmed | Concern | Blocker`) + a lossy adapter over today's 4 booleans: `true -> Confirmed (evidence: null)`, `false -> Unknown` (NEVER "Failed"). Kills the "1/4 Unqualified" mislabel with zero migration and lets Phase 1 build the UI once.
5. Split findings into: fix now / needs migration / pure UI composition.

Concepts to freeze: Award Value · Quoted Value · Contract Value · Qualification State · Commercial Readiness · Deal Health · Attention · Customer Buying Stage · Next Best Action.

Deliberately NOT in Phase 0: the composite Deal Health *number* (an aggregate of aggregates — defining a score while its inputs still move just recreates "18/100 On Track" with better arithmetic). Define the factors; the score lands in Phase 4 with published weights, where any single critical gap overrides the average.

Also in scope: the WRITE side. A legacy `PATCH stage=won` legitimately yields `awardSource = null`; the read model must distinguish a **legacy win** from a **governed win** rather than render a false zero (exactly what `contractedValue` did).

Practical constraint: the DB currently holds **exactly one opportunity** (the governed Won E2E record). Great as a live probe, useless for finding contradictions (no legacy / lost / tender-route / multi-quote deals). So the audit is **code-path-driven**; extra cases come from unit fixtures or `BEGIN…ROLLBACK` — **never** by touching the E2E record.

**Phase 1 — Information Architecture.** 14 tabs → 6 areas, re-hosting existing capabilities (delete nothing):

```
Overview -> Strategy -> Commercial -> Engagement -> Governance -> History
```

- **Overview = Deal Cockpit:** Qualification summary + Key Stakeholders + Win Plan summary + Commercial summary + Deal Health + Next Best Action + AURA Intelligence. Drop the standalone Qualification tab (4 points don't earn a top-level tab); details in a drawer.
- **Strategy (before Commercial** — decision criteria / competitor / decision-maker must shape the offer, not follow it): Buying Journey · Pursue/No-Pursue · full Win Plan · Buying Committee.
- **Commercial:** Requirements → Scope → Estimate → Pricing → Quotation → Award.
- **Engagement:** Activities + Communication. **Governance:** Documents/Evidence + Approvals. **History:** the authoritative business/governance timeline (incl. governance exceptions, not buried in activity).
- Inside an opportunity call people **Stakeholders / Buying Committee**, not "Contacts".
- Risk: AURA's persistent tab system + `?tab=` / `?view=` deep links — preserve or redirect.

**Phase 2 — Evidence-Based Qualification.** Booleans → `{ status, evidence, source, confirmedBy, confirmedAt }`. "Confirmed without evidence ≠ Confirmed". Migration + backend + UI. Qualification assessment stays SEPARATE from the lifecycle decision (BANT 2/4 + Qualified is legal; 4/4 + Review is legal).

**Phase 3 — Adaptive Strategy.** Win Plan weight follows deal size/risk: `Light` / `Standard` / `Strategic`. Never demand 10 fields from an AED 20k deal.

**Phase 4 — Deal Intelligence.** ONE engine for the whole opportunity (this is where A12's "we already have the AURA brief" really lands). **Deterministic first, AI second** — same contract as the existing pricing advice: findings are computed and verifiable; the AI only narrates and returns null with no provider. **The AI never decides Qualified / Healthy / Won.**

### After Won

Qualification and Win Plan stop being "todo" and become historical evidence ("Qualification at award: 3/4 — authority never independently verified"). The page must become state-aware: post-Won it asks for Award evidence → PO/LOA → Contract → Handover, never "Generate quotation".

---

## Open questions

1. A2 — bell: a dropdown panel in place, or a full notifications page?
2. A5/A7 — is a real WhatsApp Business API integration in scope, or a UI option only for now?
