---
id: adr_6f8a8f8e
number: 0020
title: Qualification is an evidence-bearing record; qualification-at-award is an immutable snapshot
status: Accepted
category: 
owner: Architecture
date: 2026-08-26
supersedes: []
related: []
---

# ADR-0020 — Qualification is an evidence-bearing record; qualification-at-award is an immutable snapshot

Status: Accepted · 2026-08-26

## The observed defect

On 2026-08-26, opportunity `41aee1b0` was awarded at 17:07 (`crm.opportunity.stage_changed`, award
source `quotation_accepted`). At 18:39 — after the award — `needConfirmed` was set to `false` by
`u-admin` through the Opportunity 360 checkbox. The closed deal's qualification changed from 1/4 to
0/4.

Nothing was corrupted; the model simply has no notion of "what was true at award". The four BANT
columns on `aura_crm_opportunities` are plain mutable booleans, so **every** qualification figure
AURA can show for a closed deal is the CURRENT one. That is why `qualification-badge.ts` says
"Qualification record · N/4 confirmed" and why its guard test forbids the words "at award", "at
close", "when won" and "snapshot" in terminal presentation.

## Decision

Land the Phase 2 qualification model and the award snapshot **as one slice**. Snapshotting four
booleans now and redesigning the snapshot in Phase 2 would produce a historical record in a shape we
had already decided was wrong — and a snapshot, unlike a mutable table, cannot be migrated to a
richer truth later, because the richer truth was never captured.

### Frozen contracts

These are the invariants the implementation is built to. They are frozen because the snapshot is a
historical artefact: once written it is evidence, and evidence whose shape keeps changing is not
evidence.

1. **`QualificationRecord` is canonical.** Per dimension (`budget` · `authority` · `need` ·
   `timeline`): `status` (`UNKNOWN | CONFIRMED | CONCERN | BLOCKER`), `evidence`, `source`,
   `confirmedBy`, `confirmedAt`.

2. **The four booleans are a compatibility shadow, not a second source of truth.** They are derived
   from the record (`CONFIRMED` ⇒ `true`; `CONCERN`/`BLOCKER`/`UNKNOWN` ⇒ `false`) exactly as
   `requiresTender` is derived from `executionType`. One writer, one resolver. They are marked
   deprecated and are expected to be removed once no reader depends on them.

3. **Absence is never fabricated.** A deal with `qualification = null` predates Phase 2 and is read
   through the boolean adapter: status only, `source: null`, `confirmedAt: null`. Backfilling those
   as `source: 'checkbox', confirmedAt: createdAt` would invent the exact provenance this model
   exists to make honest.

4. **The snapshot is a complete immutable copy, never a reference.** `qualification_at_award` is
   versioned JSONB: `{ version, capturedAt, awardSource, awardedQuotationId, dimensions }`. It holds
   the full per-dimension record so a later read never has to consult — or trust — the mutable one.

5. **JSONB, not columns.** The qualification structure is expected to keep evolving; a versioned
   JSONB document can hold a v1 record faithfully forever while v2 is written alongside it. Twenty
   dedicated columns could not, and each future dimension would be another migration against a table
   that must never rewrite history.

6. **Capture is gated on real award provenance, never on `stage = 'won'`.** The legacy
   `PATCH stage=won` path produces `awardSource = null`; it must produce no snapshot. Governed Won
   and Legacy Won stay distinguishable (`resolveDealOutcome`), and the snapshot is a property of the
   former only.

7. **Write-once, enforced in the database.** The application writes through a dedicated store method
   guarded by `WHERE qualification_at_award IS NULL`; the database refuses any statement that would
   change a non-null `qualification_at_award`. Service discipline alone would not stop direct SQL or
   future code from overwriting history.

8. **Capture is atomic with the award.** The snapshot is written inside the same transaction that
   stamps `awardSource` / `awardedAt`. A rolled-back award leaves no snapshot; a committed award
   leaves exactly one.

9. **No backfill.** A Won deal with no snapshot reads **"Qualification at award · Not captured"**.
   Deriving one from current data would be a historical lie — for `41aee1b0` we know the data
   changed after the award and we do not have the 17:07 value.

10. **Current and at-award stay separately readable.** They are different facts and neither may
    stand in for the other. The badge may only say "at award" when a snapshot exists, and may only
    report that snapshot's own numbers.

### Deliberately NOT in this slice — and what happened to it

`applyTenderOutcome()` closed a deal Won while stamping **no** `awardSource`, so every tender-route
win was `LEGACY_WON` and captured no snapshot. That was a real provenance gap, and it was kept OUT of
this slice rather than folded in silently: setting `awardSource` alone would make `awardDocumented`
true with a null `contractedValue`, which `resolveDealOutcome` treats as an inconsistency that must
stay visible, so provenance and its number had to be designed together.

It was then closed as its own change, in parallel: `applyTenderOutcome` takes award provenance as an
explicit argument (`TenderAwardProvenance` — contracted value from the approved Commercial Baseline,
plus the decision timestamp), and because capture here is keyed on PROVENANCE rather than on a code
path, the tender route began capturing snapshots by construction, through the same helper and the
same transaction. Invariant 6 is what made the two changes compose instead of collide.

The negative control survives both: a tender close with no provenance supplied — the legacy path —
still captures nothing, and a test pins that.

## Authorization

Writing qualification is **`crm.opportunity.update`**, asserted in `OpportunityService.updateQualification`
— in the service, not only the controller, so a reactor or any other internal caller is bound by the
same rule.

This was a gap on first implementation: the writer was authenticated but not authorized, so any
CRM user in the tenant could set a `BLOCKER` or attach evidence. That is not a note-taking field —
what it holds is what an award freezes permanently — so "logged in" was never a sufficient answer.

Who holds it: **Sales** and **Sales Manager** (via `crm.*.update`), and Admin. Delivery roles
(Project Manager, Site Engineer, …) hold only `crm.*.read` and are refused.

It is deliberately the ORDINARY update permission rather than a new escalated one: recording what we
learned about a deal is core sales work, and gating it higher would push the edit somewhere
unaudited. The escalated actions stay separate — closing a deal out-of-band remains
`crm.opportunity.override`. A trusted internal caller passing no actor is still allowed, matching
`update()`; that is a decision on the record, not an accident of the `if (actorId)` idiom.

Two refusal cases are asserted (ungranted actor; delivery role), plus a 403 over real HTTP, and the
guard was negative-controlled by removing the assert and watching the e2e go back to 200.

## Write-boundary validation

The route's nested dimension DTO needs `@ValidateNested()` + `@Type()`. With `@IsObject()` alone,
class-validator treats each dimension as opaque and the `@IsIn` status/source checks never run — an
e2e caught `status: 'PROBABLY'` being accepted and merged into the canonical record.

That is worse than a sloppy 200: an unknown status would be frozen into the award snapshot, and
`readQualificationAtAward` refuses what it cannot parse, so that deal's history would read
"Not captured" **forever**. The write boundary is the last place it can be stopped, because the
snapshot is immutable by design.

## Consequence for the badge guard

`apps/web/lib/qualification-badge.test.ts` forbids temporal wording in terminal presentation. That
guard is **narrowed, not deleted**: without a snapshot the prohibition stands exactly as written; the
"at award" wording becomes reachable only when a snapshot is supplied, and only over the snapshot's
own counts.
