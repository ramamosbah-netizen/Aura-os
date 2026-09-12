# T&C and Handover — proposed architecture vs. what exists

**Status:** discovery only. No remediation. Frozen against `main` at `08fd19e4`.
**Method:** the Capability Audit vocabulary already in use — COMPLETE / PARTIAL / BACKEND_ONLY /
UI_ONLY / ABSENT / DUPLICATE_RISK — read from domain modules, API controllers and reachable UI, not
from intent.

The directive proposes Testing & Commissioning and Handover as independent workspaces of 8 sections
each, with strict authority boundaries. This records what is actually in the repository today
against those 16 sections, so the build is sized from evidence rather than from the page titles.

**Headline:** this is a build, not a re-arrangement. Each workspace is currently ONE register. The
8-section shape is largely absent — but three of the sixteen sections already have an owner
elsewhere, and building them here would repeat the F2 duplicate-authority mistake by hand.

---

## 1. What exists today

### Testing & commissioning

| Layer | Today |
| --- | --- |
| Domain | `CommissioningRecord` (`pending → in_progress → tested → commissioned`, plus `failed`), `CommissioningTestItem` (point no, description, **expected**, **actual**, pass/fail, testedBy/At), `PunchItem` (minor/major/critical, open/closed, resolution) |
| API | `commissioning/records` CRUD + `paged` + `:id/detail`, `:id/test-items` GET/POST, `:id/punch` GET/POST, `:id/test`, `:id/commission`, `:id/fail`, punch close |
| UI — workspace | `/commissioning`: a "register a system" form + one Commissioning Register. No sections. |
| UI — record | `/commissioning/[id]`: Commissioning 360 — test points, punch list, sign-off (`commissionedBy` + `witnessedBy`), "this unlocks project handover" |
| Guard | `commission()` refuses unless every test point passed, and requires both a signer and a witness |

`recordResult` on a test point **derives** the record's tally through `syncTally` (total = items,
passed = items passing, any fail ⇒ `failed`). Measured values are already supported: each point
carries `expected` and `actual`, so the cable-test example in the directive is representable.

### Handover

| Layer | Today |
| --- | --- |
| Domain | `HandoverPackage` (`draft → submitted → accepted` / `rejected`), `HandoverChecklist` = **six booleans** (omManuals, asBuilts, testCertificates, warrantyDocs, training, spares), clientRepresentative, warrantyStartDate, warrantyMonths |
| API | `commissioning/handovers` create/list/get + submit/accept/reject |
| UI | `/handover`: a "start a package" form, one Handover Packages register, and an "Evidence gates for acceptance" panel projected from the same checklist |
| Guard | `isReadyToSubmit()` requires all six booleans before submit |
| Downstream | `handover.accepted` → `HandoverAmcSubscriber` opens an AMC/service contract, warranty running from `warrantyStartDate` (idempotent on `AMC-<handoverId>`) |

**This already satisfies one of the directive's key points.** Warranty does not start from the
installation date: it starts from the handover package's own `warrantyStartDate`, and the
deliver → maintain handoff (`handover.accepted` → AMC contract) exists and is idempotent.

---

## 2. The sixteen proposed sections, classified

### Testing & commissioning

| # | Proposed section | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Overview (T&C command center) | PARTIAL | `DeliveryWorkspaceSummary` above the register carries metrics + an exception lane, but it is not a section, is not filterable by Project → System → Area, and does not answer "what is preventing commissioning?" |
| 2 | Systems & Equipment | PARTIAL | `CommissioningRecord` **is** the commissioning scope register (ELV system type, location, point total). What is absent is the equipment tree beneath it (NVR-01 → CAM-001…064) and any link to the Assets authority |
| 3 | Inspection & Test Plans (ITP) | **DUPLICATE_RISK** | An ITP authority **already exists in Quality**: `modules/quality/src/domain/itp.ts` with hold / witness / review / surveillance points and acceptance criteria, `/api/quality/itps`, and a `/quality/itps` page. Building an ITP writer in T&C would create a second ITP authority — the F2 mistake, repeated deliberately |
| 4 | Pre-Commissioning | ABSENT | No prerequisite gates, no governed override, and no read of Site installation evidence. Nothing today stops a system being tested before it is installed |
| 5 | Testing & Commissioning | PARTIAL | Execution and measured values exist. The lifecycle does not: there is no Planned → Ready → In Progress → Witnessed → Accepted. `witnessedBy` is a free-text name captured at sign-off, not a witness state a consultant moves through |
| 6 | Defects & Retests | **PARTIAL + DEFECT** | Punch items exist. **Retest lineage does not** — see §3 |
| 7 | Certificates & Records | ABSENT | No evidence/attachment on a test run, no certificate record. DocControl correctly owns formal issue; what is missing is the technical evidence T&C is supposed to generate and hand over |
| 8 | Readiness & Handover | PARTIAL | The handover checklist is the readiness model today, and it is six hand-ticked booleans rather than a projection — see §4 |

### Handover

| # | Proposed section | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Overview (handover command center) | PARTIAL | Same as above: a summary panel, not a section, and its counters do not lead to the blocking records |
| 2 | Handover Scope | ABSENT | A package has a code and a title. There is no system / building / area / package tree, and no per-package readiness state beyond the four-state package status |
| 3 | Snag & Punch List | **DUPLICATE_RISK** | Two punch registers already exist — `modules/quality/src/domain/snag.ts` (`/quality/snags`, reachable from the Quality workspace) and `modules/commissioning/src/domain/punch-item.ts` (reachable from Commissioning 360). A third in Handover would be the F2 mistake twice over. Handover should read both |
| 4 | As-Built Records | UI_ONLY (a boolean) | `checklist.asBuilts` is a tick. Engineering owns drawings and BIM models; nothing links the tick to them |
| 5 | O&M Manuals | UI_ONLY (a boolean) | `checklist.omManuals` is a tick. No manual, datasheet, warranty, spare-parts or licence records |
| 6 | Training & Demonstration | UI_ONLY (a boolean) + naming collision | `checklist.training` is a tick. `/api/hse/training` exists but is **worker safety training**, a different authority from client handover training — they must not be conflated |
| 7 | Handover Dossier | ABSENT | Nothing assembles evidence from the upstream authorities; the concept does not exist |
| 8 | Acceptance & Closeout | PARTIAL | `accept` / `reject` exist with client representative and date. Absent: conditional acceptance, outstanding-obligations register, and the internal-review → client-submission steps |

---

## 3. Defect found during this pass — retest lineage

The directive is explicit: a failed test must not be erased by its retest. Today it is.

`recordResult` (`modules/commissioning/src/domain/commissioning-test-item.ts`) mutates the test
point **in place**: a point that failed and is then retested becomes `result: 'pass'` on the same
row, with `testedAt` overwritten. There is no Run #1 → Defect → Corrective action → Run #2 chain.
A failure is only visible until it is fixed — which is precisely backwards for an audit trail
whose purpose is to prove what happened.

Related, and worth deciding together: `POST /records/:id/test` accepts a **typed** `pointsPassed`,
and that manual tally overwrites the derived one. Where a record has itemized test points, a typed
tally can therefore report a system as fully passed while its points say otherwise — and
`commission()` guards on the tally, so the itemized truth can be bypassed. The workspace register's
"Record test" control is the manual path.

Neither is fixed here. Both are recorded so the fix is a decision rather than a discovery.

---

## 4. The principle that decides most of this

The directive states it exactly: **Handover should aggregate evidence, not duplicate it.**

Today's six checklist booleans are the opposite of that — each is a person asserting that evidence
exists somewhere else, with nothing checking:

| Checklist tick | Who actually owns the evidence |
| --- | --- |
| `asBuilts` | Engineering (drawings, BIM models) |
| `testCertificates` | T&C (test runs, certificates) |
| `omManuals` | DocControl / supplier documents |
| `warrantyDocs` | Contract / Procurement |
| `training` | a client-training record that does not exist yet |
| `spares` | Inventory / Procurement |

Replacing those booleans with projections from their owning authorities is the single change that
makes Handover match the stated architecture, and it is a prerequisite for both the Dossier and a
meaningful Readiness gate. It is also the change with the largest blast radius, because it makes
Handover a *reader* of six modules.

---

## 5. Suggested sequence

Ordered so each step is provable before the next depends on it, and so nothing creates a second
authority.

1. **Retest lineage** (§3) — a test RUN aggregate, so runs accumulate instead of overwrite; fix the
   tally bypass at the same time. Smallest change, highest integrity value, unblocks Defects & Retests.
2. **T&C sections that already have backing** — Overview, Systems, Testing, Defects & Retests as real
   sections over existing data, using the `?section=` pattern now established across the other four
   workspaces. Mostly UI + queries.
3. **Reference, don't rebuild** — T&C reads Quality's ITP; Handover reads Quality snags and
   commissioning punch. No new writers. (Note: `/quality/itps` is not reachable from the Quality
   workspace's own strip today — a reachability gap worth closing while here.)
4. **Pre-commissioning gates** — prerequisites read from Site installation evidence, with a governed
   override. Needs a decision on what counts as installation evidence.
5. **Handover readiness as projection** (§4) — replace the booleans authority by authority.
6. **New authorities** — O&M package, client training & demonstration record, certificates/evidence,
   handover scope tree, dossier assembly. These are new domain aggregates: migrations, RLS, API,
   events, UI.
7. **Asset handoff** — project asset → operational asset on acceptance. The AMC contract handoff
   already exists; the per-asset transfer does not.

Steps 1–3 are days. Steps 4–7 are the substantial build, and step 6 is most of it.

---

## 6. Open decision

The directive describes the destination clearly. What it does not fix is how much of it to build in
one pass, and that changes the work materially:

- **(a) Structure first** — steps 1–3: real sections over the data that exists, plus the lineage
  fix. Nothing invented, everything provable now.
- **(b) Structure + readiness** — 1–5: Handover stops asserting and starts projecting.
- **(c) The full sixteen** — 1–7: six new domain authorities, and the largest change to the delivery
  chain so far.

Recorded, not chosen.
