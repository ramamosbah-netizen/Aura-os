# Wave rationale and open proof

The master register is now the frozen discovery baseline. The executable programme, gates and capability allocation are in [remediation-roadmap.md](remediation-roadmap.md). Unknown capability cells are explicit verification work, not an instruction to build replacements.

| Wave | Scope / exit evidence | Dependency |
| --- | --- | --- |
| 0 — Safety and proof harness | Contain known authorization/data-integrity defects and create repeatable role/output acceptance fixtures. | Required before affected workflows can be accepted |
| 1 — Sales to approved offer | Correct Sales authorization, complete intake/study assignment and technical basis, preserve approved quantities through estimate/pricing/offer/revision. Include internal costing and customer-facing documents. | J1 authority and canonical study basis; do not start with procurement merely because a defect is critical |
| 2 — Mobilisation, engineering, planning | Frozen scope mapping, team/package ownership, controlled engineering release, real planner allocation/availability/conflict/look-ahead/recovery workflow. | Approved contract/project scope and correct context |
| 3 — Sourcing and material delivery | Full comparison basis, quote-to-PO item/term lineage, authorization, partial receipt and movement correctness. | Engineering material need, planned dates and approved budget |
| 4 — Site, quality, progress and commercial | Save actual evidence, review site reports, inspect/permit in context, measured IPC lines and invoice lineage; prove actual/billed/paid separately. | Canonical work packages/materials and role approvals |
| 5 — System T&C, handover and service | Approved per-system test content, measurements/witness/evidence, immutable retests, controlled certificates, exact dossier, correct client/project/asset/service linkage and closeout state. | Existing canonical readiness preserved; required evidence actually available |
| 6 — Management acceptance | Department-specific decisions plus CEO portfolio reconciliation, freshness, full population, drilldown and actionable escalation. | Underlying operational facts from waves 1–5; dashboard assembly may proceed alongside them but cannot invent missing facts |

Cross-cutting outputs, communication, assignments and UI are acceptance criteria inside each wave, not deferred to a cosmetic final phase. Critical authorization/data-integrity defects remain visible and must gate any affected use even while remediation is ordered by the employee journey.

## Answers supported by the frozen discovery baseline

1. **What AURA can do today:** Bounded reused scenarios demonstrate lead/opportunity lineage, generic assigned tasks, commercial conversion, contract/project creation, drawing review, installed/certified quantities, local invoice/receipt state, generic fail/retest/commissioning and canonical handover gates. Fresh proof adds cost arithmetic, a usable internal mail loop, governed document revision/issue, dated planning with persisted proposal acceptance, project/operations authorization, a native CRM workbook and aggregate RFQ comparison. These are not all-role end-to-end acceptance.
2. **What exists but is incomplete/disconnected:** Structured study handoff, approved scope-to-estimate quantities, customer offer output, delivery mapping/Sold, evidence saves, IPC-to-AR lineage and AMC linkage have explicit prior findings. Source inspection adds document branding/template/output qualification, shallow aggregate supplier comparison and internal-versus-external mail transport distinctions.
3. **Important employee work still missing or unproven:** Full normalized supplier comparison; WBS-linked task authoring, dependencies, resource requirements/allocations, planned quantities/productivity and look-ahead; system-specific approved commissioning content; live role assignment/review handoffs; engineering calculations and usable operational outputs. Do not label all of these ABSENT; their precise classifications are in the master register.
4. **Management capabilities missing or unproven:** Role-specific technical/procurement/commercial decision queues, complete CEO backlog/utilization/exposure/financial forecasts, freshness metadata and reconciled KPI drilldowns. The live CEO view currently has three cards and a financial project table with plain-text project rows. Some project/CRM dashboards already have source-backed projections; full portfolio coverage is not proven.
5. **Outputs/integrations missing or unverified:** Generated transaction PDFs, operational workbook formatting/typing/full-population behavior, correct company identity, external mail round trip, governed attachments and business-record linking, provider delivery/receipt, bank reconciliation, and system-specific test certificates. Browser print, one simple XLSX and internal mail tests cannot close these.
6. **Before functional completeness:** Resolve confirmed gaps and required verification cells, prove representative authorized roles and negative permission cases, inspect saved/reloaded/exported outputs, and trace the same approved scope to delivery, billing and handover/service. Complete dataset and source lineage must hold through reports and management views.
7. **Potential backlog after required acceptance:** Cosmetic themes, optional advanced AI, additional automation beyond an effective manual governed workflow, advanced scenario optimization and non-required integrations. These are provisional: AI is not a prerequisite if a usable manual workflow exists; external client/supplier communication and required contractual/regulatory documents cannot be dismissed as optional backlog. Mobile/accessibility support needs an explicit workforce requirement decision, not automatic deferral.

## Runtime status, 14 September

The initial `aura_app` password mismatch was resolved by provisioning the existing local PostgreSQL container as the repository's marked **e2e-disposable** environment. All 307 migrations applied, RLS verification passed and the test identities were seeded. The API now answers health on localhost:4000 and the web application runs on localhost:3000. No production/shared environment was used.

This removed the environment blocker and enabled the live evidence recorded above. The frozen register has 55 UNVERIFIED and zero NOT_AUDITED capability leaves. Those 55 are pinned acceptance tasks, and the 181 page templates without fresh browser execution stay visible in the page matrix. No AURA functional-completeness, Business Journeys CLOSED/VERIFIED or Production Ready claim is made.

## The one clause holding HO-01, HO-02 and HO-07, 22 September

All three share an acceptance: *"Representative Handover/DocControl roles issue and deliver the
complete real project dossier with downloadable artifacts and recipient acknowledgement."*

Proved in one run by `journey-tc-handover-closure.spec.ts`, against the migrated database with
auth ON: representative roles with each separation asserted by its own refusal (author ≠
approver ≠ issuer, submitter ≠ accepter); the pack issued and the transmittal sent to a named
recipient; **downloadable artifacts** — every included dossier line's artifact opens 200 with a
non-empty body, and it is the ISSUED controlled document rather than a copy.

**What is not proved: recipient acknowledgement, by the recipient.** Two rules meet and leave
nothing between them:

| | |
| --- | --- |
| the domain | only a NAMED RECIPIENT may acknowledge — "this transmittal was not sent to `<x>`; only a named recipient can acknowledge it" |
| the route | `doccontrol.transmittal.acknowledge` is held by **r-document-controller alone** — a tenant role, which project membership cannot grant, and correctly so: releasing documents outside the company is not a project-team act |

So the only identity that can acknowledge is a Document Controller who is also on the
distribution. **An external client cannot acknowledge at all**, and a handover dossier goes to a
client. The spec proves an INTERNAL acknowledgement and says so in place.

This is an AUTHORITY question, not a defect to be patched: either a transmittal recipient
acknowledges in their own right (which needs a permission a recipient can hold), or the Document
Controller RECORDS a receipt that arrived by other means (which is the `ENG-04` shape — "decision
recorded by" — and would make the domain's "only a named recipient" message wrong). It is not
mine to choose, so HO-01, HO-02 and HO-07 stay PARTIAL and 25/180 stands.

## Diagnosed unresolved test debt, 22 September

These are **diagnosed and still failing** — test debt with a known cause, not evidence awaiting diagnosis, and NOT passing. Each carries a verdict below; none is repaired. They are recorded here rather than
closed, and they are deliberately NOT treated as blockers for the whole system: each names a
bounded surface, and nothing about them licenses a claim over capabilities they never touched.

### The TIER-2 in-memory browser run

A full local run of the in-memory browser suite reached test 199 of 231 with **151 passed and
these eight failed**, at which point the run was stopped by hand. Everything the log shows after
that point is an artefact of stopping it — the API and web servers were killed mid-run, so the
tail failed for want of a server and is not a measurement of anything.

| Spec | Verdict | What decided it |
| --- | --- | --- |
| `document-workflow.spec.ts:10` | **stale spec** | `rejectDocument` refuses the submitter — "the person who submitted this revision may not reject their own — withdrawing it is a revision, not a decision". The 360 showed "Under Review" because the reject was refused. |
| `fx-governed-booking.spec.ts:89` | **tier mismatch** | PASSES against PostgreSQL. It failed only on the in-memory tier. The mechanism was not isolated — what is measured is that the backend decides it. |
| `journey-signal-to-close.spec.ts:60` | **stale spec** | `convert-to-quotation` answers 400: "only a deal that meets the quotation gate can be quoted — approve the scope revision before quoting; complete and approve the estimate revision before quoting; freeze the pricing revision before quoting". The spec quotes straight from a qualified opportunity. |
| `journey-signal-to-close.spec.ts:108` | **stale spec** | The same gate, on the same call. |
| `journey-tc-handover-closure.spec.ts:37` | **stale spec** | 403 — "the person who submitted this handover may not accept it — acceptance is the client's". |
| `permit-workflow.spec.ts:20` | **stale spec** | Both permit tests die on the same setup line, `PUT /hse/risk-assessments/:id/approve`: "the person who wrote this risk assessment may not approve their own — it is what authorises a permit to work". |
| `permit-workflow.spec.ts:153` | **stale spec** | The same line, in the test whose NAME is "a permit cannot be approved by the person who requested it" — it was refused by exactly the rule it exists to check, one step earlier than it expected. |
| `project-authoring-parity.spec.ts:5` | **stale spec** | The EOT table reads "submitted" with Approve/Reject still offered: "the person who submitted this EOT claim may not determine it — a claim out and a determination back are two sides of one exchange". |

**Seven stale specs, one tier mismatch, ZERO product defects.**

And they are one finding, not eight. SEC-01 put maker/checker across the system — a document revision, a risk assessment, a handover acceptance, an EOT determination, a daily report — and the browser suite was written before those rules existed, driving each journey as a single identity. Every one of these failures is the product refusing something it is right to refuse. The eighth, the quotation gate, is the same shape: a deliberate readiness rule the spec predates.

Diagnosed against the migrated PostgreSQL database with auth ON. Each verdict comes from
reproducing the call and reading the refusal, not from inspecting the spec and inferring.

**NONE OF THEM IS FIXED.** Repairing a stale spec means driving it as the two people the rule is
about, as `site-execution.spec.ts` now does — that is real work per spec and it is not done here.
Until it is, these eight stay red, and they gate their own capabilities at promotion time.

**Why they are not system-wide blockers.** A browser failure bounds the surface it drives and
nothing else. Treating eight unread failures as a gate over 180 capability leaves would state
something the evidence does not support, in the same way that calling them harmless would. They
stay visible and unresolved, and they gate their own capabilities when a capability is proposed
for promotion — not the programme.

### A separate failure, diagnosed and closed: `site-execution.spec.ts`

**Not one of the eight above.** It failed in the earlier complete TIER-2 run and again when the
site cluster was re-run; it is recorded here because it was read to the end, and because an
earlier note in this session wrongly described it as one of the eight. The eight are untouched.

**Stale spec, correct product.** The spec prepared, submitted, reviewed, rejected and approved a
daily report as ONE identity and expected "Draft" after the rejection. It got "Under Review", and
the cause was not the UI: the reject answered 403.

> the person who prepared or submitted this daily report may not reject their own — withdrawing
> it is a resubmission, not a review

`approveReport` carries the same rule, and `site-report-actions` refreshes the 360 only on
success, so the page correctly kept showing the status the report still had. The shipped role
catalogue already separates the halves — `site.daily-report.create`/`.submit` on r-site-engineer,
`.review`/`.approve` on r-project-engineer and r-pm — so the product was right and the spec was
written before the rule.

Repaired by driving it as the two people the rule is about rather than by weakening the rule. It
now proves the segregation in a browser: the author submits, is REFUSED their own rejection (403,
asserted), and a reviewer signed in as themselves rejects and later approves.

What this shows about the eight: nothing. It shows that at least one pre-existing browser failure
in this area was a stale expectation. Each of the eight still has to be read on its own.

### The CRM Radar release-proof job

Its browser step fell back to an actor the job never provisions, so the sign-in never completed
and the test died on its own timeout looking like a broken page. The job now names the denied
actor it actually has (`u-viewer`, which that boot gives a password and no grant). That change is
**reasoned from the job's own configuration and proved locally against an equivalent boot, but it
has not been observed passing in CI**. It is a corrected configuration awaiting confirmation, not
a closed finding.

### What this section does not do

It does not change any capability classification, does not close any gap record, and does not
assert that the surfaces above work. The register's evidence matrix stays a truthful description
of what has actually been proved.
