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

## Unresolved browser evidence, 22 September

Two pieces of browser evidence are **open and undecided**. They are recorded here rather than
closed, and they are deliberately NOT treated as blockers for the whole system: each names a
bounded surface, and nothing about them licenses a claim over capabilities they never touched.

### The TIER-2 in-memory browser run

A full local run of the in-memory browser suite reached test 199 of 231 with **151 passed and
these eight failed**, at which point the run was stopped by hand. Everything the log shows after
that point is an artefact of stopping it — the API and web servers were killed mid-run, so the
tail failed for want of a server and is not a measurement of anything.

| Spec | What it drives |
| --- | --- |
| `document-workflow.spec.ts:10` | document register → 360 → reject → new revision → approve → issue |
| `fx-governed-booking.spec.ts:89` | an invoice in a currency with no governed rate |
| `journey-signal-to-close.spec.ts:60` | the pre-award spine: radar signal → qualified opportunity → contract |
| `journey-signal-to-close.spec.ts:108` | the direct-sale middle: a quotation clearing SoD |
| `journey-tc-handover-closure.spec.ts:37` | the whole chain, engineering through acceptance |
| `permit-workflow.spec.ts:20` | permit register → 360 → approve → close |
| `permit-workflow.spec.ts:153` | a permit cannot be approved by the person who requested it |
| `project-authoring-parity.spec.ts:5` | Project 360 exposes governed WBS/CBS and Delay/EOT authoring |

**What is NOT claimed.** These eight are not diagnosed. Each may be a product defect, a stale
spec expectation, or a tier mismatch of the kind already found elsewhere in this run — a spec
asking the in-memory tier for a guarantee only PostgreSQL provides. Until each is read
individually, none of the three may be assumed, and no capability leaf is promoted or demoted
because of them.

**Why they are not system-wide blockers.** A browser failure bounds the surface it drives and
nothing else. Treating eight unread failures as a gate over 180 capability leaves would state
something the evidence does not support, in the same way that calling them harmless would. They
stay visible and unresolved, and they gate their own capabilities when a capability is proposed
for promotion — not the programme.

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
