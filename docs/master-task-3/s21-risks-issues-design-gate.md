# §21 Risks & Issues — Design Gate

**Status:** `AWAITING APPROVAL — NO SCHEMA, NO API, NO UI YET`
**Date:** 2026-09-08 · **Origin:** Master Task 3 / Project 360 conformance §21 (recorded ABSENT)

This gate fixes the decisions that must be explicit before anything is built. It deliberately adds no
migration, no endpoint and no component. Everything below is grounded in what the repository already
contains; where a claim rests on evidence, the evidence is named.

---

## 1. Shared semantics, separate persistence

`shared/src/domain/opportunity-risk.ts` already holds a complete, framework-free risk language:

```
RiskLikelihood   low | medium | high
RiskImpact       low | medium | high
RiskSeverity     LOW | MEDIUM | HIGH | CRITICAL     riskSeverity(likelihood, impact)
RiskStatus       OPEN | MITIGATING | RESOLVED | ACCEPTED
RISK_OPEN_STATUSES · worstOpenSeverity()
```

**Decision: reuse the language, do not share the table.**

```
                    shared — risk semantics
                    likelihood · impact · severity matrix · status · rollups
                              │
              ┌───────────────┴───────────────┐
              ↓                               ↓
      CRM: OpportunityRisk            Projects: ProjectRisk
        opportunityId                       projectId
```

One severity matrix, two registers. The alternative — widening
`aura_crm_opportunity_risks.opportunity_id` into `subject_type + subject_id` — would put Projects' data
inside a CRM-owned table and make one module's migration a second module's outage. Shared *rules* are a
strength; shared *storage* is a coupling.

**Naming debt to settle as part of this work.** If these semantics are formally shared, the filename
`opportunity-risk.ts` misleads every future reader into thinking risk is a CRM concept. The generic
vocabulary should separate from the CRM-specific model — but by re-export rather than a rename that
breaks imports across the workspace. Exact mechanics to be settled at implementation; the requirement
is that no consumer breaks and no reader is misled.

---

## 2. Risk and Issue are two authorities, not one table with a `kind`

**Decision: `ProjectRisk` and `ProjectIssue` are separate.**

The distinction is a business invariant, not a label:

```
RISK    an uncertain FUTURE event or condition
ISSUE   a condition that EXISTS NOW and requires resolution
```

A single table with `kind = risk | issue` would immediately acquire `likelihood?`, `mitigation?`,
`occurredAt?`, `rootCause?`, `resolution?` — half the columns nullable depending on the row's kind, and
the lifecycle semantics of both destroyed. This codebase has the counter-example already: `Drawing` keeps
one status machine per revision row precisely so the aggregate means one thing.

### Lifecycles must not be copied from one another

`RiskStatus` already exists and applies unchanged to `ProjectRisk`:

```
OPEN → MITIGATING → RESOLVED
OPEN → ACCEPTED                    (a deliberate decision to carry the exposure)
```

`ProjectIssue` needs its own, and it must come from how this system already models a problem that has
happened and must be worked. The existing evidence:

| Record | Lifecycle |
|---|---|
| Quality NCR | `raised → action_planned → corrected → closed` |
| HSE Incident | `reported → investigating → closed` (reopenable on new evidence) |
| HSE CAPA | `pending → in_progress → completed` |
| Commissioning punch | `open → closed` |
| Compliance case | `draft → submitted → under_review → inspection → approved/certified/rejected/…` |

The shape this system consistently uses is **raised → being worked → resolved**, with the richer registers
adding an explicit "someone has committed to an action" step between. An issue lifecycle should follow
that idiom rather than mirror `RiskStatus`, and — like the HSE incident — should be reopenable, because a
coordination problem declared solved and recurring is normal.

*Exact states are proposed at implementation from this evidence, not fixed here, because the field list
and the lifecycle have to be decided together.*

---

## 3. Where Project Issue stops — the duplicate-authority exclusions

**A Project Issue is never a second copy of a problem another register already owns.**

| Problem | Canonical owner | Must NOT become a Project Issue |
|---|---|---|
| Non-conformance | Quality — `Ncr` | ✗ |
| Snag | Quality — `Snag` | ✗ |
| Failed commissioning test / punch item | Commissioning | ✗ |
| Safety incident, corrective action | HSE — `HseIncident`, `CapaAction` | ✗ |
| Delay event, extension claim | Projects — `DelayEvent`, `EotClaim` | ✗ |
| Design change | Engineering — `DesignChange` | ✗ |
| RFI, technical query, submittal | Engineering | ✗ |
| Variation | Projects — `Variation` | ✗ |

**What Project Issue does own:** cross-domain or management problems with no better canonical register.
Concretely, the shapes that have nowhere to live today:

- the client has not released the workfront
- an access restriction is blocking several disciplines at once
- a utility authority approval is holding multiple packages
- a main-contractor coordination problem spanning Engineering and Site
- a decision required across Procurement, Engineering and Commercial

None of these is an NCR, an RFI or a delay event, and none has a home in the product today.

### REFERENCE ≠ OWNERSHIP

An issue may **reference** domain records; it never absorbs them.

```
ProjectIssue I-009  "Authority approval is overdue, three packages held"
   ├── references  NCR-17
   ├── references  RFI-32
   └── references  PO-105
```

The invariant, stated once and to be enforced by test:

```
closing ProjectIssue   ≠   closing the NCR
                       ≠   answering the RFI
                       ≠   receiving the PO
```

and the converse. No cascade in either direction without an explicit, separately-evidenced automation.
This is what keeps §28 Single Source of Truth intact while still letting a project manager see the whole
picture in one place.

---

## 4. Risk → Issue materialisation

A risk that occurs does not become an issue by changing its own status.

**Rejected:** `risk.status = 'ISSUE'`. That destroys the risk's own history — the register would no longer
record that this exposure was identified, owned and mitigated before it landed.

**Decision:** materialisation creates a second record, with provenance in both directions.

```
Risk R-014  "The authority approval may be delayed"
   likelihood high · impact high · severity CRITICAL · status MITIGATING
        │
        │  the event occurs
        ↓
Issue I-009  "Authority approval is overdue"          originRiskId = R-014
Risk R-014                                            linkedIssueId = I-009
                                                      status → no longer carried as uncertainty
```

The risk register keeps the forecast and its accuracy; the issue register carries the live problem. Both
remain readable afterwards, which is the whole point of keeping a risk register at all — a risk that
silently mutated into an issue teaches nobody anything about whether the risk process worked.

The exact terminal status for a materialised risk is an implementation decision from the existing
`RiskStatus` set; it must not require a new status value invented for this transition.

---

## 5. Integration contract

### My Work — a fourteenth source, not a task engine

`WorkItem` already carries `source · sourceId · module · kind · href · projectId · dueAt · priority` and
aggregates thirteen sources across Engineering, Quality, HSE, Procurement and Activities, with personal
tasks distinguished by `origin`.

**Decision:** risks and issues surface as work items through that existing machinery.

```
Risk mitigation due · Issue action or decision due
        ↓
WorkItem { source: 'project-risk' | 'project-issue', module: 'Projects', href, projectId, dueAt }
```

No new task table, and risk/issue ownership must not become a parallel personal-task system. My Work
stays an aggregator.

### Project Health — an explanation, never a gate

§24 is an explanatory authority; §21 must not turn it into a gate. A risk register does not decide
anything about lifecycle or closeout.

Whether risks and issues become a health signal is **deliberately left open** for the implementation
discovery, and it should be answered the way every other §24 signal was: only if Projects can point at a
fact that proves a state threatens delivery. An open CRITICAL risk with a passed target date is a
plausible candidate; "there are risks" is not. If the evidence is thin, the honest answer is no signal,
not a weak one.

### Project 360 — the dead link is a defect, and this is its fix

Plan & Control lists **"Risks & issues"** → `/controls?tab=risks`. `CONTROL_TABS` contains no `risks`
tab, and `validInitialTab` falls back to `'overview'`. The user lands on the Overview with no error.

**Classification: broken navigation / deceptive fallback.** Worse than a 404 — a 404 tells the truth.

**Decision: do not patch it with an empty tab.** It gets wired to the real Risk & Issue workspace as part
of §21, and not before. A placeholder tab would convert a visible defect into an invisible one.

---

## What "done" means for §21

Passing `@aura/projects` tests is not closure. §21 is VERIFIED only when every layer holds:

```
Domain semantics  →  DB + migration + RLS  →  API  →  BFF  →  Project 360 UI
      →  Permissions  →  Audit / events  →  My Work aggregation
      →  Health integration decision  →  Browser E2E
```

The UI is in scope from the start, not appended: both registers, create / edit / mitigate / accept /
resolve, ownership, states, and the empty, loading, error and forbidden cases — plus a browser proof that
walks them.

---

## Open questions this gate does not close

1. **Issue lifecycle states** — proposed at implementation from the evidence in §2 above, together with
   the field list, because neither can be settled without the other.
2. **Whether risks/issues become a §24 signal** — answered by evidence, per §5. No is an acceptable answer.
3. **`opportunity-risk.ts` naming mechanics** — the requirement is settled (no misleading name, no broken
   imports); the method is not.
4. **Issue severity vocabulary** — whether an issue reuses `RiskSeverity`, or needs its own priority
   scale, is genuinely undecided. An issue has no likelihood, so `riskSeverity(likelihood, impact)` cannot
   produce it, and borrowing the enum without the matrix may mislead more than it helps.
