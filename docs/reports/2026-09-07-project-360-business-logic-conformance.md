# Project 360 — conformance against the Business Logic Authority

**Date:** 2026-09-07 · **Method:** capability-by-capability against the domain, the BFF, the live
database schema and the UI — not against how the screen looks.

**Revision 2 (same day):** §27 moved 🟡 → ✅ after the vertical slice landed — rules, ports, service,
endpoint, UI, enforcement inside finalization, and audit evidence. Nothing else was re-measured.

**Revision 3 (same day):** §2 moved ❌ → ✅. Rules, cumulative gates, governed cancellation, port
wiring, `transitionsFor`, UI, write-boundary proofs at the HTTP edge and a browser spec. The audit
it required — every writer of `projects.status` — found and closed two authority bypasses, and is
recorded separately in `2026-09-07-project-status-writer-inventory.md`. Nothing else was re-measured.

> The authority is the 29-section Project 360 business model supplied in review. This document does
> not restate it; it records, for each claim it makes, **what exists**, **where it lives**, and
> **what is missing** — with the evidence that established it.
>
> Written after a UI rebuild that was judged by its appearance and turned out to contradict a
> governed domain rule (§11). That is the reason for the method.

**Legend** — ✅ implemented and governed · 🟡 partial, or present without the governance the model
requires · ❌ absent.

---

## Summary

| | Sections |
|---|---|
| ✅ | **§2 lifecycle states** · §3 handover provenance · §4 DeliveryItemMap · §5 WBS/CBS separation · §10 execution truth · §11 progress governance · §17 certified ≠ installed · §18 cost authority + FX provenance · §19 variation lifecycle · §20 delay/EOT records · **§27 closeout readiness** |
| 🟡 | §6 baseline · §7 system lens · §9 engineering · §12 NCR · §14 T&C · §15 punch · §16 documents · §23 overview · §24 health · §25 permissions · §26 audit |
| ❌ | §21 risks & issues · §22 resource allocation |

The spine the model calls load-bearing — commercial truth in, quantity and cost semantics, change
control — is **implemented and governed**. What is thin is the **governance around the edges**:
lifecycle, closeout gating, health explanation, and the two capabilities that do not exist at all.

---

## ❌ Absent

### §2 — Project lifecycle ✅ *(was ❌)*

```
planned → planning → active → testing → handover → closeout → completed
                        ↖───────────────┘   (a failed acceptance returns to delivery)
```

Eight states, from one list (`PROJECT_STATES` in `project.ts`) that both `ProjectStatus` and the
machine derive from, so the type and the transitions cannot disagree. The four original names keep
their meanings, so no data migration and no stranded rows.

**Mobilization is deliberately NOT a state.** It appears in this system twice — a preliminaries cost
line and a schedule activity — and nowhere as a fact. A state whose gate can read nothing either
always passes (teaching people the gate is theatre) or always blocks (teaching them to route around
it). Recorded as an architectural decision, with what would have to exist to revisit it:

> Mobilization is not a Project lifecycle state in the current authority model. It is represented as
> planned/executed work within Planning. It may be promoted to a governed lifecycle state only when
> distinct queryable entry/exit facts and business gates exist.

**Conditions attach to the state being entered, never to an edge.** That is what makes the legacy
`planned → active` safe to keep: it and `planning → active` call the same gate because there is only
one, so they cannot drift. Edges that skip states declare what they skip and accumulate those
states' conditions. Asserted as an invariant over all 216 fact combinations, plus a general one that
holds for edges nobody has added yet — *skip representation, never governance.*

**Cancellation is a command, not a field change.** `cancel({ projectId, actorId, reason })` requires
both, refuses a blank reason, and emits `projects.project.cancelled` carrying `fromStatus`, reason,
actor and time. `changeStatus` refuses `'cancelled'` outright, so the ungoverned road is absent
rather than merely discouraged.

Evidence: 181 unit tests in `@aura/projects`; 13 write-boundary proofs at the HTTP edge; 5 browser
tests including a mouse-only journey from an unplanned project to one in execution.

### §21 — Risks and Issues do not exist for projects

```sql
tables like '%risk%'   → aura_crm_opportunity_risks, aura_hse_risk_assessments
tables like '%issue%'  → none
```

Opportunity risk is a CRM pursuit concept, and HSE risk assessment is a safety document. Neither is
the project risk register the model describes (probability × impact → score → response → owner →
residual), and there is no issue log at all.

### §22 — Resource allocation does not exist

```sql
tables like '%resource%'    → none
tables like '%allocation%'  → aura_site_labour_allocations
```

`aura_site_labour_allocations` is site labour posting, not capacity planning. There is no
person/crew capacity, no planned hours, no allocation %, and therefore no over-allocation detection.

**The rebuilt Project 360 has a "Team" tab, and it is membership — who can reach the project.** The
model says plainly this must not be claimed as resource allocation. It is not claimed here.

---

## 🟡 Partial

### §6 — Baseline exists, but as one snapshot rather than versions

`WbsOpeningBaseline { baselineId, approvedAt, approvedBy, allocations, originalBac }` carries the
approver and the approval time, which is more than most of this codebase's snapshots. What it does
not carry is **version, scope, change reason, or history**: there is no baseline table, only a
snapshot column on the project (`0275_pd5b_opening_wbs_bac_baseline`). So "Baseline v1 vs Current
Plan vs Variance" cannot be shown — there is only *the* baseline.

The schedule has its own separate `baselineSetAt` with no approver at all.

### §7 / §29 — The lens reaches 19 tables and is blind on eight delivery surfaces

```
carry system/discipline (19): commissioning_records · compliance_cases · crm_installed_base ·
  doccontrol_drawing_register · doccontrol_submittals · elv_devices · engineering_bim_models ·
  engineering_design_changes · engineering_documents · engineering_drawings · engineering_rfis ·
  engineering_submittals · engineering_technical_queries · procurement_purchase_orders ·
  procurement_purchase_requests · quality_irs · quality_itps · quality_material_approvals ·
  quality_ncrs

blind: quality_snags · hse_incidents · site_daily_reports · site_instructions ·
  commissioning_punch_items · documents · amc_work_orders · projects_wbs_nodes
```

Wider than expected — the lineage is largely there. But `projects_wbs_nodes` is on the blind list,
and that is the structure the lens is supposed to organise. A CCTV lens cannot narrow the WBS
itself, only the records that reference a system directly.

### §9 — Engineering has lifecycles, but not the model's

`DrawingStatus`, `DocumentStatus 'draft|submitted|approved|rejected'`, `DesignChangeStatus`. Missing
the model's `Approved with Comments` and `Revise & Resubmit`, which are the two states that make an
engineering review loop legible. Without them a resubmission is indistinguishable from a first
submission.

### §12 — NCR is a governed loop, one state short

`'raised' | 'action_planned' | 'corrected' | 'closed'` with a verification record
(`aura_quality_ncr_verifications`, migration 0225) and closure through it — so
`Raised → Closed` is genuinely impossible. Missing `Assigned` and `Ready for Inspection`, so
responsibility and readiness are not states anyone can filter on.

### §14 / §15 — T&C and punch are thinner than the flow they gate

`HandoverStatus 'draft|submitted|accepted|rejected'`, `PunchStatus 'open'|'closed'`. The model's
`Failed → Punch → Rectification → Retest` loop and the punch's `Assigned → Rectified → Verified`
have no states. A punch item is open or closed, so "rectified but not verified" cannot be recorded —
which is exactly the state a closeout gate would need to read.

### §16 — Revision control exists on drawings, not on documents

`aura_doccontrol_drawing_register` carries `current_revision` and `status`.
`aura_documents` carries `status` only — no revision, no supersession. So the model's
*"Project 360 must show the current controlled revision, not the last file uploaded"* holds for
drawings and not for documents.

### §23 / §24 — Health is a rule set, but not the model's rule set

The rebuild replaced an average with declared rules (`shared/src/domain/project-assessment.ts`) and
declared coverage, so "not assessed" can never read as "healthy". That is the model's core demand
and it is met.

What is not met: the rules read **five** signals (baseline, CPI, SPI, change, closeout). The model
asks for schedule variance, critical delays, cost exposure, open critical NCRs, HSE incidents,
engineering blockers, procurement blockers, commissioning blockers and commercial exposure — a
cross-domain read. Project 360 currently computes health from project-module facts only, so a
project with three critical NCRs and two HSE incidents can still read "On plan".

The four-level scale (`Healthy | Attention | At Risk | Critical`) is a two-level one.

### §25 — Permissions are enforced, granularity unverified

`this.access.assert(actorId, { permission: 'projects.project.update', orgPath })` on the progress
writer, and the RLS fitness check passes 15 assertions per provision. The model's per-capability
matrix (Site Engineer may record installation, may not approve IPC or close the project) was **not**
verified action-by-action, and should not be assumed from one example.

### §26 — Events exist on project writers; completeness unverified

```
projects.project.create · projects.project.update · projects.cbs.created ·
projects.closeout.create · projects.delay.created · projects.delivery_item_map.created ·
projects.eot.created · projects.eot.decided · projects.variation.create · projects.variation.approve
```

Real and lineage-carrying. Not verified: whether every critical writer emits one, and whether each
carries previous/new state as the model requires. `project.baseline.approved` and
`site.installation.recorded` were not found under the projects module.

---

## ✅ Implemented and governed

**§27 Closeout readiness** — **CLOSED, and the widest gap in the first pass of this audit.**

The finding then: `finalizeCloseout` refused only when a box was unticked, every box was manual, and
a blocked closeout could not explain itself because nothing had asked the domains that know.

Now assembled from five domains through ports each owning domain implements, with three states
rather than two:

```
manual checklist + quality + commissioning + documents + commercial
                          ↓
              PASS / BLOCKED / UNKNOWN
                          ↓
                     finalize()
```

**UNKNOWN is not a pass**, which is the decision the rest rests on. An unreadable domain, a project
with zero commissioning records, a register that tracks no as-built — each refuses the close rather
than being waved through. Optional dependency, never optional evidence.

**Enforcement is in the write.** `CloseoutService.finalize` consults the same assessment the page
renders and throws on BLOCKED or UNKNOWN; the API answers 409, because a governed refusal is a
conflict with project state and not a server fault. The permitting verdict is stamped into the
completion event, so "why was this allowed to close?" has an answer months later.

Evidence: 148 domain tests, and 4 API/browser proofs — a blocker refuses and names itself with a
link to the domain that owns the fix, an unproven domain refuses distinctly as *unverified*, the
panel shows a state and a reason per domain with Finalize disabled on the server's own verdict, and
a clean project actually closes.

Two things this did NOT do, so the entry is not read as wider than it is: §12/§14/§15 still lack the
intermediate states (`Assigned`, `Ready for Inspection`, `Rectified`, `Verified`), so the gate reads
what those domains can currently answer rather than everything the model asks for; and the manual
checklist is still manual — it is now one voice among five instead of the whole rule.

**§3 Commercial handover provenance** — `handoverSnapshotHash`, `handoverLockedAt`,
`handoverSnapshot.schemaVersion`, with a validity check that rejects a foreign schema version
(`handover.ts:59`). Project delivery does not rewrite commercial history.

**§4 DeliveryItemMap** — its own table, its own governed create event
(`projects.delivery_item_map.created`), and it is what makes a WBS node quantity-controlled. Not
auto-created.

**§5 WBS / CBS** are separate tables with separate services. Not conflated.

**§10 / §17 Execution and certification truth** — `postInstalled` and `postCertified` are distinct
governed writers, and the quantity ledger carries `source`, `source_ref` and `dedupe_key`. The
`sold / certified / billed` semantics exist, so **installed is not treated as financially due**.

**§11 Progress governance** — `WbsService.updateProgress` refuses a manual write to a
quantity-controlled node or a derived parent. **Verified live**, not read:

```
PATCH progress on a derived parent → 409
PATCH progress on a plain node     → 200
```

The rebuilt UI initially offered an input on every node and now mirrors both conditions, showing the
reason rather than silently disabling.

**§18 Cost authority** — the cost ledger carries `source_amount`, `source_currency`,
`exchange_rate`, `rate_date`, `rate_source`, `base_amount`, `base_currency`. WBS `recordActualSpend`
states in its own comment that WBS actual cost is *"a rebuildable projection of Cost Ledger history,
never an independently authored financial fact"*.

**§19 / §20 Change control** — variations carry their own lifecycle and an approve event; delays are
records with cause, days and status; EOT claims have submit and decide events. The revised value is
computed from approved variations rather than by editing the original.

---

## What this changes about the rebuild

The rebuild put Project 360 on the shared record system, gave it declared assessment coverage, and
surfaced two capabilities that existed in the API and on no screen (schedule/baseline, work-package
progress). Measured against this authority it is a **presentation and assessment** improvement on a
spine that was already sound — not the business-logic completion it might look like.

Three of its own defects were found by looking at the rendered page rather than by any check that
passed, and a fourth — the §11 contradiction — was found in review. That is the argument for the
method this document uses.

## Recommended order for Master Task 3

1. ~~**§27 closeout readiness**~~ — **done**. It did what was predicted: reaching for each domain's
   state showed exactly where those domains cannot yet answer, which is now recorded under §12,
   §14 and §15 rather than guessed at.
2. **§2 lifecycle + gates** — everything else hangs off states that do not exist. Next.
3. **§24 cross-domain health** — needs 2 to have anything to read. The closeout ports are the
   pattern it should follow: each domain answers about itself, health aggregates.
4. **§12 / §14 / §15 intermediate states** — surfaced by §27 as the reason its checks are coarser
   than the model wants. Smaller than they look, and they make both §24 and closeout sharper.
5. **§21 risks & issues** and **§22 resource allocation** — genuinely absent capabilities, sized as
   new work rather than as gaps.
6. **§7 lens on `wbs_nodes`** — small, and it makes the lens mean what the model says it means.
