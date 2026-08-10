# G-20 — Authority Compliance (SIRA / DCD): Discovery

**Date:** 2026-08-10 · **Status:** Discovery only — no code, no migration, no ADR yet
**Gate:** [Consolidated Gap Register v2](2026-08-10-consolidated-gap-register-v2.md) · G-20, the last open P1 gate
**Rule this follows:** Discovery → ADR → Domain tests → Migration → Service → API → E2E → UI. Not UI → Database.

Everything below was **measured against the tree**, not assumed. Where I did not verify something, it says so.

---

## 1 · What do we have now?

Every existing concept that touches compliance, approval, authority, evidence, inspection or expiry:

| Concept | Where | What it is |
|---|---|---|
| **`DocumentRequirement`** | `shared/src/domain/document-requirement.ts` · table `aura_document_requirements` (0184) · `core/src/dms/document-requirement-store.ts` | **Requirement + evidence + status**, generic over any aggregate (`entity_type` + `entity_id`). Statuses `REQUIRED / PROVIDED / WAIVED / NOT_APPLICABLE`; evidence anchored by `DOCUMENT_ID`, `EXTERNAL_REFERENCE`, `TRANSMITTAL` or `MANUAL_CONFIRMATION`. **Already has `COMPLIANCE_CERTIFICATE` as a requirement type.** |
| **`Document` / `DocumentVersion`** | `shared/src/dms/document.ts` | Kernel DMS substrate — attaches to any aggregate, immutable version history, `storageKey` + checksum. Declared; **storage backend not chosen**, so no bytes yet. |
| **`WorkflowService`** | `core/src/workflow/workflow.service.ts` | Generic state machine. Any module registers a `WorkflowDefinition`; transitions are **RBAC/ABAC-enforced** via `AccessService` and every change emits `workflow.*` on the event spine. |
| **`Submittal`** (doccontrol) | `modules/doccontrol/src/domain/submittal.ts` | Controlled document → consultant → review code A/B/C/D. `draft → submitted → returned`. |
| **`Submittal`** (engineering) | `modules/engineering/src/domain/submittal.ts` | `material \| technical \| sample \| drawing`, `draft → submitted → approved/rejected`. |
| **`MaterialApproval`** | `modules/quality/src/domain/material-approval.ts` | `draft → submitted → approved / approved_as_noted / rejected`. |
| **`InspectionRequest`** | `modules/quality/src/domain/inspection-request.ts` | Request an inspection, record its result. |
| **`ITP`** | `modules/quality/src/domain/itp.ts` | Inspection & Test Plan — `hold / witness / review / surveillance` points, `pending / passed / failed`. |
| **`PermitToWork`** | `modules/hse/src/domain/permit-to-work.ts` | `validFrom` / `validTo`, `draft → requested → approved → expired → closed`. |
| **Expiry watch-list** ×2 | `modules/hr/src/domain/document-expiry.ts` · `modules/finance/src/domain/bank-guarantee.ts` | Pure, stateless "expired / expiring / valid" projections with `daysUntil` / `daysToExpiry`. HR's own comment says it "mirrors the bank-guarantee expiry watch-list". |
| **`CommissioningRecord`** / **`HandoverPackage`** | `modules/commissioning/src/domain/` | Test-point tally, **witnessed** sign-off, client acceptance. |
| **`ElvDevice`** | `modules/elv/src/domain/device.ts` (new today) | Project → system → device, with location, drawing ref, serial, and seams to commissioning / asset. |
| **`AuditService`** | `core/src` → `aura_audit_log` | Actor/action/target/before/after trail. |

**Measured absent:** `SIRA`, `DCD`, "civil defence" — **0 files** across `modules`, `apps`, `shared`, `core`. No authority, regulator or external-body concept of any kind.

---

## 2 · Who owns each concept?

| Layer | Owner today | Correct owner for compliance |
|---|---|---|
| Requirement + evidence | **kernel** (`shared` + `core/src/dms`) | unchanged — it is already generic |
| Document bytes | **kernel** (`shared/src/dms`) | unchanged |
| State machine + permissioned transitions | **kernel** (`core/src/workflow`) | unchanged |
| Consultant submittal | doccontrol **and** engineering (two copies) | neither — an authority submission is not a consultant submittal (§3) |
| Material approval | quality | unchanged |
| Inspection | quality (IR + ITP) | quality for **workmanship**; authority inspections are a different actor (§4) |
| Permit validity | hse | unchanged — a permit-to-work is site safety, not statutory system approval |
| Expiry projection | hr **and** finance (two copies) | should be kernel — see §3 |
| Witnessed acceptance | commissioning | unchanged; it is a **precondition** of authority sign-off, not the same thing |
| Device identity | elv | unchanged — the thing being certified |

---

## 3 · Where is the duplication?

Four cases, all pre-existing. None caused by this work, all relevant to what G-20 must not add to.

1. **Two `Submittal` models** — doccontrol (review codes A–D) and engineering (approved/rejected). Different vocabularies for the same act.
2. **Two expiry watch-lists** — HR staff documents and finance bank guarantees, with HR's comment openly acknowledging it mirrors the other. **A third is exactly what G-20 would add** if certificate expiry is written module-locally.
3. **Three approval-ish lifecycles** — doccontrol submittal, engineering submittal, quality material approval — none of which use the kernel `WorkflowService` that exists for this.
4. **`ElvSystem` was forked** (shared vs commissioning) and was merged today. It is listed because it is the same disease and it had been latent for months.

This is **N-03 at five instances**. G-20 is the largest new surface since that count started, so it is the one most likely to make it six.

---

## 4 · What is actually missing?

Stripping out everything above, the genuinely absent concepts are:

1. **The authority itself** — SIRA, DCD, Trakhees, ADCD as first-class parties with a reference number, a portal, a jurisdiction. Nothing models an external regulator.
2. **A compliance case** — the unit of "this project's CCTV needs SIRA approval", tracked from requirement to certificate. `DocumentRequirement` records *whether a document exists*; it does not model *a case being processed by a third party*.
3. **Authority inspection** — a visit by a regulator with a pass/fail/conditional outcome. Quality's IR/ITP models **our** inspection of **our** work.
4. **Certificate + expiry as a statutory object** — with a validity window, a renewal lead time, and consequences (operating without a valid DCD certificate is illegal, not merely untidy).
5. **Company / person-level prerequisites** — SIRA licenses the *contractor* and cards the *technicians*. This is not project-scoped at all, and nothing in the platform holds it.
6. **Jurisdictional applicability** — which authority applies is a function of emirate + system type. A Dubai CCTV job needs SIRA; a fire alarm needs DCD; an Abu Dhabi job needs neither.

Items 1–4 are project-scoped. **Item 5 is the one most likely to be missed** and is the one that stops work on site.

---

## 5 · The canonical model

Matching the shape you set, with the kernel pieces reused rather than re-cut:

```
ComplianceRequirement ── generated from ──► ApplicabilityRule (emirate × system → authority)
        │                                        e.g. Dubai + cctv → SIRA
        ▼                                             Dubai + fire_alarm → DCD
   ComplianceCase ───────► Authority (SIRA | DCD | TRAKHEES | ADCD | OTHER)
        │
        ├── Submission      (ref, date, fee, portal id)
        ├── Inspection      (scheduled, outcome: pass | conditional | fail)
        ├── Decision        (approved | rejected | approved-with-conditions)
        ├── Evidence   ─────► kernel DocumentRequirement + DMS Document   ← REUSE
        └── Certificate     (number, issued, expires) ──► expiry projection ← REUSE (once shared)
```

**One `Authority` enum, one case model.** No `SiraCase` / `DcdCase`. Discovery found no domain-critical difference in the *mechanics*: both are submit → review → inspect → decide → certificate → expiry. What differs is **data** (which documents, which fee, which inspection type, which validity period), and data belongs in an `ApplicabilityRule` + requirement set, not in a forked aggregate.

The one place a genuine difference exists is **scope**: SIRA licenses the company and cards technicians; DCD does not. That is handled by `ComplianceCase.scope = project | company | person` — a field, not a second model.

---

## 6 · How SIRA and DCD attach without forking

| Varies by authority | Modelled as |
|---|---|
| which documents are required | rows in the requirement set for that `ApplicabilityRule` |
| validity period of the certificate | `ApplicabilityRule.validityMonths` |
| inspection type / whether one is required | `ApplicabilityRule.requiresInspection` |
| reference-number format, portal | `Authority` reference data |
| who it binds (project / company / person) | `ComplianceCase.scope` |
| fees | `Submission.fee` |

Adding Trakhees later is then **reference data plus rules**, not a new aggregate and not a new table. That is the test of whether this design held.

---

## 7 · How compliance links to ELV devices

The link is deliberately **indirect**, through the case rather than per-device rows:

```
ComplianceCase ──► projectId + elvSystem   (the natural grain: "the CCTV system on Villa 1A")
       │
       └── optionally deviceIds[]          (only when the authority certifies specific units)
```

A SIRA approval covers *a system on a project*, not each camera. Putting a foreign key on every device would create thousands of rows saying the same thing, and would then disagree with itself the moment a device is added after approval. Where an authority genuinely certifies individual equipment, the case carries an explicit device list.

The device model already earns this: `ElvDevice.system` is canonical, so "which devices does this case cover" is a query, not a join table.

---

## 8 · Tenant isolation

Non-negotiable and already solved — G-20 must simply not opt out:

- Every table: `tenant_id`, RLS **enabled + FORCED + policied**, following `0163`/`0164`. Current fitness is **184/184**; G-20 must keep it at 100%.
- Every store read takes `tenantId` **explicitly** — no bare `get(id)`. This is the shape `ElvDeviceStore` uses and the reason `tenant-isolation.fitness.test.ts` sits at `RATCHET = 0`.
- ⚠️ **Blind spot found during this discovery:** that ratchet scans `modules/` only. `core/src/dms/document-requirement-store.ts` exposes `get(id: Id)` with **no tenant parameter** — the exact N-08 shape, in the kernel, unscanned. It is a pre-existing issue, not a G-20 one, but G-20 will lean on that store and should not lean on an unguarded one. **Recommend widening the ratchet to `core/` and fixing that read before building on it.**

## 9 · Audit trail

Compliance is the one area where the audit trail is the product, not overhead — "when did we submit, who approved it, what did the inspector say" is the whole value.

- Every state change goes through kernel `WorkflowService`, which already emits `workflow.*` events and enforces the transition's permission.
- Every mutation writes to `aura_audit_log` via `AuditService`, with the field-level before/after `diffFields` shape that `purchase-order.service.ts` uses (G-12).
- Certificates are **append-only**: a renewal is a new certificate row, never an edit of the expiry date. The history of what was valid when is a legal question, and mutating it destroys the answer.

---

## 10 · Reusable infrastructure vs SIRA/DCD-specific

| Reusable (build once, everyone benefits) | Authority-specific (thin, data-driven) |
|---|---|
| `ComplianceCase` + submission/inspection/decision lifecycle | the `Authority` rows themselves |
| `ApplicabilityRule` — "context → what is required" | the SIRA and DCD rule sets |
| Certificate + expiry projection **promoted to kernel**, retiring the HR/finance duplication | validity periods per authority |
| Evidence via existing `DocumentRequirement` + DMS | which document types each authority demands |
| Kernel `WorkflowService` for the state machine | — |

**What this buys beyond G-20:** commissioning gets witnessed sign-off as evidence; handover gets a "are all certificates valid" gate; AMC gets a renewal trigger; HSE permits and HR staff documents can retire their private expiry code onto one projection. That is the difference between "we have a SIRA screen" and a **Compliance Core**.

---

## The pre-migration gate — every table, and why not an existing one

Per your rule: no implementation until each new entity justifies its own existence.

| # | Proposed table | Why not reuse/extend something existing |
|:--:|---|---|
| 1 | `aura_compliance_authorities` | No external-party/regulator concept exists anywhere (measured: 0 files). Not `crm_accounts` — an authority is not a customer or supplier: no commercial relationship, no pipeline, no owner. Small reference table, seeded. |
| 2 | `aura_compliance_cases` | The missing aggregate. **Not** `doccontrol.submittal` — that is a document to a *consultant*, has no expiry, no statutory force, no inspection, and its review codes (A–D) are a consultant convention. **Not** `quality.material_approval` — that approves a *product* for use, not a *system* for legal operation. **Not** `hse.permit_to_work` — site safety, not statutory system approval. |
| 3 | `aura_compliance_submissions` | A case can be submitted, rejected and resubmitted repeatedly; each attempt has its own reference, date and fee. Folding this into the case would lose the attempt history, which is exactly what a dispute turns on. Child of (2). |
| 4 | `aura_compliance_inspections` | **Not** `quality.inspection_request` / `itp` — those model *our* inspection of *our* workmanship, by our QA/QC. This is a **regulator visiting us**, with a different actor, a different outcome vocabulary (pass / conditional / fail with a re-inspection date) and legal consequence. Same word, different domain. |
| 5 | `aura_compliance_certificates` | **Not** `contracts.payment_certificate` (a money instrument, unrelated despite the name). **Not** a column on the case, because renewals are append-only history and a case can hold several certificates over its life. |
| 6 | *(none)* — applicability rules | **Deliberately not a table in slice 1.** Seed the Dubai SIRA/DCD rules as code-level reference data until a second jurisdiction proves the shape. Rule of Three (ADR-0012): a config table with one consumer is speculation. |
| 7 | *(none)* — evidence | **Reuse `aura_document_requirements`** as-is: it is already generic over `entity_type`/`entity_id` and already has a `COMPLIANCE_CERTIFICATE` type. A per-module evidence blob is precisely what its own header comment says it exists to prevent. |
| 8 | *(none)* — expiry | **Reuse — and consolidate.** Promote a single expiry projection to kernel and point HR, finance and compliance at it. Writing a third private copy is the failure this document exists to avoid. |

**Five new tables, three deliberate non-tables.**

---

## What I recommend next, in order

1. **ADR** fixing the canonical model, the `Authority` enum, and the no-fork rule — so the decision is citable rather than re-argued.
2. **Widen the N-08 ratchet to `core/`** and scope `DocumentRequirementStore.get`. Do this *before* building on that store, not after.
3. **Promote the expiry projection to kernel**, retiring the HR/finance duplication. Small, and it stops G-20 creating a third copy.
4. **Domain model + tests** for case / submission / inspection / decision / certificate.
5. Migration → service → API → E2E → UI, in that order.

**Not started, and not to be read as designed:** the SIRA and DCD rule content itself (which documents, which fees, which validity periods) is reference data I have **not** researched and must not invent. That needs a source — the authority's own published requirements, or someone who files these submissions. Inventing plausible-looking regulatory data would be the worst possible outcome of this work.
