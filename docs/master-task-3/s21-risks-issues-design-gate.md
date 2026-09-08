# §21 Risks & Issues — Design Gate

**Revision 2** · **Status:** `AWAITING APPROVAL — four decisions open (DG-21.1 … DG-21.4)`
**Date:** 2026-09-08 · **Origin:** Master Task 3 / Project 360 conformance §21 (recorded ABSENT)

Revision 1 fixed five decisions and left four questions open. Implementation began on the domain
layer and was **stopped at the API boundary** by review. This revision folds the review's
corrections in, narrows what "shared" means, and replaces the old open-questions list with four
decisions that must be approved before any further code.

**Nothing below is built beyond the domain, the stores and one service.** No API, no BFF, no UI, and
no §24 health integration. §21 is not closed.

---

## What the review changed, and why it was right

| Correction | Where it bites |
|---|---|
| **Split the service.** One `RiskIssueService` owning both registers drifts into a unified register with two tables behind it, whatever the schema says. | DG-21.4 |
| **One canonical provenance fact,** not a bidirectional pair that can disagree. | DG-21.3 |
| **`materialised` is not `resolved`** — so does Project Risk still get to borrow CRM's lifecycle at all? | DG-21.1 |
| **Do not call a reference "referential integrity."** `module + recordType + recordId` with no verifiable FK is an external domain reference, and nothing more. | Accepted below |
| **`FORCE ROW LEVEL SECURITY` was missing** from the draft migration. `ENABLE` alone leaves the table owner exempt. | Accepted below |
| **The DB layer is not proven by reading SQL.** | Proof plan below |

### Corrections accepted without needing a decision

**1 · `ProjectIssueLink` → `ProjectIssueReference`.** The table becomes
`aura_projects_issue_references`. It carries `module`, `record_type`, `record_id`, `label` and
deliberately has **no foreign key** — the target lives in another module's table and a
database-level reference across that boundary would couple two modules' migrations. That is a
design choice, and its cost is that a pointer here can dangle. **This is not referential
integrity and must never be described as such.** Verifying that these references resolve is
**Lineage Referential Integrity**'s job, in the Master Gap register, not §21's.

**2 · `FORCE ROW LEVEL SECURITY` on all three tables.** `ENABLE` is not enough: RLS does not apply
to a table's owner unless forced. Migration 0281, the most recent table-creating migration, does
`ENABLE` + `FORCE` per table, so this is the current house standard and the draft simply missed it.

**3 · Table naming.** The review wrote `aura_project_risks`; the established convention in this
schema is `aura_projects_*` (`aura_projects_delay_events`, `aura_projects_cbs_nodes`,
`aura_projects_eot_claims`). The migration keeps the convention — flagged here rather than changed
silently, in case the intent was to change it.

**4 · Migration number.** `0283` is correct: `0282_quality_ncr_system.sql` is the current head, and
the policy gate confirms the chain is sequential with `@DOWN` present from 0137 on.

---

## 1. Shared semantics — narrower than Revision 1 claimed

Revision 1 said Projects reuses CRM's risk *language*. On inspection, only half of that language is
genuinely shared.

```
SHARED (shared/src/domain/risk.ts)
  RiskLikelihood · RiskImpact · RiskSeverity · riskSeverity(likelihood, impact)
  the 3×3 matrix, and nothing else

NOT SHARED — CRM's own (shared/src/domain/opportunity-risk.ts)
  RiskType          RELATIONSHIP, COMPETITIVE, CUSTOMER — threats to a SALE
  RiskStatus        the opportunity lifecycle, and its rollups

NOT SHARED — Projects' own (modules/projects)
  ProjectDeliveryArea    DESIGN, PROCUREMENT, AUTHORITY, INTERFACE … threats to DELIVERY
  ProjectRiskStatus      see DG-21.1
```

A likelihood × impact matrix is arithmetic and means the same thing everywhere. A *lifecycle* is a
business process, and there was never an argument that a deal risk and a delivery risk should share
one — Revision 1 inherited it by convenience. DG-21.1 settles whether that stands.

**Storage stays separate regardless.** Widening `aura_crm_opportunity_risks.opportunity_id` into
`subject_type + subject_id` would put Projects' data inside a CRM-owned table and make one module's
migration another module's outage.

**Naming debt: settled by extraction, not rename.** `shared/src/domain/risk.ts` now holds the
matrix; `opportunity-risk.ts` re-exports every name it moved, so no import in the workspace changed.
Verified: only three files reference that path, all inside `shared`.

---

## 2. Risk and Issue are two authorities, not one table with a `kind`

Unchanged from Revision 1, and now enforced at three levels rather than one:

```
RISK    an uncertain FUTURE event or condition
ISSUE   a condition that EXISTS NOW and requires resolution
```

- **Separate tables** — one table with `kind` would carry `likelihood?`, `mitigation?`,
  `resolution?`, `resolved_at?` half-nullable per row and destroy both lifecycles.
- **Separate domain rules** — `project-risk.ts`, `project-issue.ts`.
- **Separate services** — DG-21.4.

---

## 3. Where Project Issue stops — the duplicate-authority exclusions

**A Project Issue is never a second copy of a problem another register already owns.**

| Problem | Canonical owner |
|---|---|
| Non-conformance | Quality — `Ncr` |
| Snag | Quality — `Snag` |
| Failed commissioning test / punch item | Commissioning |
| Safety incident, corrective action | HSE — `HseIncident`, `CapaAction` |
| Delay event, extension claim | Projects — `DelayEvent`, `EotClaim` |
| Design change | Engineering — `DesignChange` |
| RFI, technical query, submittal | Engineering |
| Variation | Projects — `Variation` |

**What Project Issue owns:** the cross-domain or management problem with no better home — the
workfront the client has not released, the access restriction blocking several disciplines, the
authority approval holding multiple packages, the decision needed across three departments.

### REFERENCE ≠ OWNERSHIP

An issue may **reference** domain records; it never absorbs them.

```
closing ProjectIssue   ≠   closing the NCR
                       ≠   answering the RFI
                       ≠   receiving the PO
```

Enforced structurally rather than by a runtime check: **the issue service holds no dependency
capable of writing another domain's record.** A test pins the constructor's imports so a future
domain-service import cannot silently create that path.

And, restated because it was the review's point: these references have **no FK and no integrity
guarantee**. They are addresses. Whether they still resolve is Lineage Referential Integrity's
question.

---

## 4. Risk → Issue materialisation

A risk that occurs does not become an issue by changing into one.

**Rejected:** `risk.status = 'ISSUE'` on the same row. It would erase that the exposure was
identified, owned and mitigated before it landed — and the register could then no longer answer
whether the risk process worked at all.

**Decided:** materialisation creates a second record. *How the link is stored, and what happens to
the risk's own status,* are DG-21.3 and DG-21.1.

---

## 5. Integration contract

### My Work — a fourteenth source, not a task engine

`WorkItem` already carries `source · sourceId · module · kind · href · projectId · dueAt · priority`
across thirteen sources. Risk mitigations and issue actions surface through that existing machinery.
No new task table; risk/issue ownership must not become a parallel personal-task system.

### Project Health — deliberately undecided, and NOT decided by default

§24 is explanatory, never a gate. Beyond that, **no position is taken here**, and in particular
neither of these is assumed:

- that every risk feeds health, nor
- that risks are excluded from health because they are forecasts rather than facts.

A CRITICAL open delivery risk may legitimately belong on an *explanatory* surface as a
forward-looking concern, precisely because §24 explains rather than adjudicates. An issue is a
current condition and reads differently. These are two different semantics and each needs its own
argument, made **after** the §21 domain is fixed — not while a service is being written.

### Project 360 — the dead link

Plan & Control lists **"Risks & issues"** → `/controls?tab=risks`. `CONTROL_TABS` has no `risks`
tab, and `validInitialTab` silently falls back to `'overview'`.

**Classification: broken navigation / deceptive fallback** — worse than a 404, which at least tells
the truth. **Not to be patched with an empty tab**, which would convert a visible defect into an
invisible one. It gets wired to the real workspace, or it stays visibly broken.

---

# The four decisions

## DG-21.1 — Does Project Risk keep CRM's `RiskStatus`, or get its own lifecycle?

The question exists because **`materialised` is not `resolved`**, and CRM's vocabulary has no word
for it.

```
CRM RiskStatus     OPEN → MITIGATING → RESOLVED
                   OPEN → ACCEPTED
```

A delivery risk has a fourth ending CRM's does not: it **happened**. Revision 1 handled that by
leaving the status `RESOLVED` and adding a `linked_issue_id` column to tell the two apart — which
DG-21.3 removes, and which was always a status that reads as good news for an event that is not.

**Proposed: Project Risk owns its lifecycle.**

```
ProjectRiskStatus   OPEN | MITIGATING | MATERIALISED | RESOLVED | ACCEPTED

  OPEN → MITIGATING | RESOLVED | ACCEPTED | MATERIALISED
  MITIGATING → RESOLVED | ACCEPTED | MATERIALISED
  ACCEPTED → MATERIALISED | OPEN            (an accepted exposure can still land)
  RESOLVED → (terminal)                     the exposure went away
  MATERIALISED → (terminal)                 the exposure landed; the live problem is the issue
```

- `RESOLVED` and `MATERIALISED` are both terminal and both off the live register, but they are
  **opposite outcomes**, and the register exists to tell them apart.
- `MATERIALISED` is terminal in the strong sense: a materialised risk can never return to the live
  register, or the same problem is counted twice — once as an exposure, once as an issue.
- `ACCEPTED` still demands a reason. An acceptance nobody had to justify is indistinguishable from
  an unattended risk and reads as governance while providing none.
- The **severity matrix stays shared**. Only the lifecycle becomes Projects'.

**Cost, stated plainly:** `RISK_OPEN_STATUSES`, `riskIsOpen`, `riskSummary` and `worstOpenSeverity`
move back to `opportunity-risk.ts`, because they are typed to CRM's lifecycle. `shared/domain/risk.ts`
shrinks to the matrix. Projects already has its own `summariseProjectRisks`.

**The alternative,** if you prefer maximum reuse: keep `RiskStatus`, and derive "materialised" by
querying for an issue whose `origin_risk_id` is this risk. Honest, but every risk read needs a join
to know whether it is live, and the database cannot then refuse to reopen a landed risk.

---

## DG-21.2 — Approve the exact ProjectIssue lifecycle

Grounded in how this system already models a problem that must be worked — NCR
`raised → action_planned → corrected → closed`, HSE incident `reported → investigating → closed`
and reopenable, CAPA `pending → in_progress → completed`.

**States**

```
open          raised; nobody has taken it on yet
in_progress   owned and being worked
resolved      TERMINAL — the condition no longer exists
withdrawn     TERMINAL — ended without being solved: duplicate, overtaken, or not real
```

**Transitions**

```
open        → in_progress | resolved | withdrawn
in_progress → resolved | withdrawn | open        (handed back)
resolved    → open                               (reopen only)
withdrawn   → open                               (reopen only)
```

**Terminal meanings, and why there are two.** Collapsing `withdrawn` into `resolved` would inflate
every "issues resolved" figure with problems that merely stopped being asked about. **Both endings
require a note** — a resolution nobody had to write is indistinguishable from an issue somebody
stopped looking at.

**Reopen semantics.** A terminal state's *only* exit is `open`; nothing goes straight back to
`in_progress`. Reopening **clears** `resolution`, `resolvedAt`, `resolvedBy` — a live issue still
displaying the text of a resolution that evidently did not hold is a screen contradicting itself.
Reopening is not counted on the row: `projects.issue.status_changed` already carries `fromStatus`,
so the event log answers "how often did this come back" without a denormalised counter.

**Deliberately absent:** an `action_planned` step. NCRs have one because a corrective action is a
formal artefact. For a coordination problem, "someone has committed" *is* ownership, which is
`in_progress`. Adding a fourth step would be process theatre.

---

## DG-21.3 — Canonical materialisation provenance

**Proposed:**

```
aura_projects_issues.origin_risk_id   uuid REFERENCES aura_projects_risks(id)
                                      UNIQUE  ← a risk materialises at most once, enforced by the DB

aura_projects_risks.linked_issue_id   DROPPED
aura_projects_risks.status            → MATERIALISED   (DG-21.1)
```

The **pointer exists once, in one direction**. Revision 1 stored it both ways, which is two rows
asserting one fact and two rows that can disagree.

`status = MATERIALISED` is not a second copy of the pointer: it says *what happened to this risk*,
where `origin_risk_id` says *where this issue came from*. Different facts, one address.

**Residual risk, stated rather than hidden:** the two are kept consistent by the transaction, not by
a constraint. Postgres cannot express "a risk is MATERIALISED if and only if some issue points at
it" without a trigger. The mitigations are that the orchestrator is the **only** writer of both, and
that `UNIQUE (origin_risk_id)` makes the duplicate case a database error rather than a race.

**Transactional command.** The kernel already has the facility — `TX_RUNNER` / `TxHandle`
(`core/src/events/tx.ts`), used by `PurchaseOrderService` for exactly this shape: `BEGIN` →
`createWithClient` → `appendWithClient` → `COMMIT`, with `ROLLBACK` on throw and the tenant GUC
bound transaction-locally so RLS applies inside it. This requires adding `createWithClient` /
`updateWithClient` to both stores, which Revision 1's stores do not have.

**Not proposed:** a `materialised_at` column on the risk. `projects.risk.materialised` in the event
log carries the time and the actor.

---

## DG-21.4 — Authority split

**Proposed:**

```
ProjectRiskService              holds PROJECT_RISK_STORE only
  raise · update · setStatus · list · get
  permissions: projects.risk.create | projects.risk.update

ProjectIssueService             holds PROJECT_ISSUE_STORE only
  raise · update · setStatus · list · get
  permissions: projects.issue.create | projects.issue.update

RiskMaterialisationService      the orchestrator — both stores + TX_RUNNER + EVENT_STORE
  materialise(riskId, …) → { risk, issue }   in ONE transaction
  permissions: BOTH projects.risk.update AND projects.issue.create
```

Neither register service holds the other's store, so neither can drift into writing both. The one
operation that must span them is a **named command with its own authority**, and the double
permission is not ceremony: materialisation retires a risk *and* creates a live problem, and someone
who may only do one of those should not be able to do both through a side door.

**Where the combined read goes.** The Project 360 screen needs both registers and one `today`, so
"overdue" cannot mean two dates on one screen. Proposed: the **controller** composes it from the two
services, rather than a fourth service existing only to concatenate. Flagged because it is a
judgement call, not an obvious one.

**Permissions note.** `projects.risk.*` and `projects.issue.*` are new strings. `AccessService`
matches by pattern, so the `projectManager` role's `projects.*` and admin's `*` already cover them,
and `readOnly('projects')` roles — Site Engineer, QA/QC, HSE, Procurement, Finance — get read
access without write. That is the intended default and is called out here rather than discovered
later.

---

# What is written today, and what each decision changes

| Written | DG-21.1 | DG-21.2 | DG-21.3 | DG-21.4 |
|---|---|---|---|---|
| `shared/src/domain/risk.ts` (matrix extracted, re-exported) | shrinks to matrix only | — | — | — |
| `domain/project-risk.ts` | new `ProjectRiskStatus` + transition table | — | drop `linkedIssueId` | — |
| `domain/project-issue.ts` | — | confirm as written | `originRiskId` sole pointer | — |
| `domain/project-risk-issue.test.ts` (27 tests) | rewrite risk lifecycle tests | — | rewrite provenance tests | split by service |
| `risk-issue-store.ts` + in-memory + postgres | — | — | add `*WithClient` | split ports |
| `risk-issue.service.ts` + test (11 tests) | — | — | — | **split into three** |
| `0283_project_risks_issues.sql` | status CHECK values | — | drop column, add UNIQUE | — |
| — | | | | **+ `FORCE ROW LEVEL SECURITY` on all three tables** |

Every one of these is a change to code that exists and passes 38 tests today. None of it is wasted:
the vocabulary extraction, the delivery taxonomy, `raisedAt` vs `createdAt`, the reference model, the
CHECK constraints, the indexes and the RLS policies all stand.

---

# The PostgreSQL proof — before the DB layer is called PASS

Reading the SQL proves nothing. Against a **fresh disposable database**, migrated `283/283`:

```
STRUCTURE
  aura_projects_risks · aura_projects_issues · aura_projects_issue_references exist
  pg_class.relrowsecurity  = true    (ENABLE)
  pg_class.relforcerowsecurity = true (FORCE)   ← not inferred from the migration text
  the connecting role is NOBYPASSRLS and NOT the table owner

ISOLATION
  tenant A cannot SELECT tenant B's risk or issue
  tenant A cannot UPDATE or DELETE tenant B's row
  tenant A cannot INSERT a row carrying tenant B's tenant_id
  an issue reference cannot be read across the tenant boundary

INTEGRITY
  status outside the lifecycle is rejected by CHECK, on both tables
  severity outside its scale is rejected by CHECK, on both tables
  a second issue with the same origin_risk_id is rejected by UNIQUE   (DG-21.3)
  an issue cannot reference a project the risk does not belong to
```

The last one needs a decision of its own if the answer is "the schema does not prevent it": it may
be an application invariant rather than a database one, and if so it must be said, not assumed.

**Then, and only then:** shared tests → projects targeted → projects full → workspace
build/typecheck → the DB proof → and after that API → BFF → Project 360 UI → My Work → Health
semantics → browser.

---

## Awaiting

Approval or amendment of **DG-21.1**, **DG-21.2**, **DG-21.3**, **DG-21.4**.

No further code until then. §21 is not closed and no closure will be claimed on the strength of
`@aura/projects` tests passing.
