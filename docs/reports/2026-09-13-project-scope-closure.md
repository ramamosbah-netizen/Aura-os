# Project-Scoped Operations — final bounded authorization pass

Status: **AURA Project-Scoped Operations + Project-Centric UX — CLOSED / VERIFIED**.

Baseline: `7bc1ecfb` (includes Phase 3 `5be6f22c`). The source, not the handoff arithmetic,
contains **59 service-file AccessService.assert call sites: 39 already scoped and 20 unscoped**.
The claimed 26/33 split is not reproducible from that merged tree. All 59 were reviewed anyway.
One additional assertion in `projects/project-write-guard.ts` is shared by Risk, Issue and
Risk Materialisation; it is corrected and tested separately, never hidden in the 59 denominator.
Commissioning has **zero** direct service assertions in this inventory. Its boundary is the
authenticated API guard and the module-owned canonical resolvers; see the supplemental closure below.

## Reconciliation

| Module | Service assertions | Scoped at baseline | Unscoped at baseline | Missing scope corrected |
| --- | ---: | ---: | ---: | ---: |
| doccontrol | 8 | 4 | 4 | 4 |
| engineering | 13 | 11 | 2 | 2 |
| hse | 10 | 8 | 2 | 1 |
| projects | 9 | 0 | 9 | 9 |
| quality | 11 | 11 | 0 | 0 |
| site | 8 | 5 | 3 | 3 |
| commissioning | 0 | 0 | 0 | 0 |
| **Total** | **59** | **39** | **20** | **19** |

Final primary classification of the 59 call sites:

- **PROJECT_SCOPE_REQUIRED: 58** (includes two optional-project call sites).
- **DERIVED_SCOPE_REQUIRED: 0** within the 59: the service-owned entity/revision has a canonical project field.
- **ORG_SCOPE_INTENTIONAL: 0 exclusively organization-scoped call sites**. There are **two intentional
  organization branches**, inside calibration recording and audit scheduling when no project is selected.
  These are counted once each under PROJECT_SCOPE_REQUIRED, not double-counted to inflate the total.
- **NOT_PROJECT_OWNED: 1** — HSE worker safety competence; no project is part of that record's ownership.
- **DEAD / UNREACHABLE / OBSOLETE: 0**.
- **Corrected missing-scope assertions: 19/59**, plus **1 supplemental shared helper**.
- **Unchanged intentional assertions: 1/59**, plus the two retained organization branches.
- **Already-scoped assertions reviewed: 39/59**; creation validation strengthened where necessary;
  Site report and Quality NCR helper project arguments are now required.
- **Remaining unresolved service assertions: 0/59**.

The five primary categories reconcile to **58 + 0 + 0 + 1 + 0 = 59/59**.

## What changed

Existing operations authorize against the tenant-scoped stored drawing, document revision, transmittal,
incident, variation, WBS node, or project. The project is a required helper argument where helpers are
shared. Creates validate a real project in the tenant through the Projects-owned lookup or existing
Projects stores; another module never joins Projects tables. WBS parents must belong to the selected
project. The frozen delivery mapping still validates all original handover/node lineage before writing.
Repeated WBS baseline approval now checks permission before its idempotent return.

The API guard no longer replaces a failed/null entity lookup with the caller's query/body project.
Projectless records and lookup failures retain governed organization access, without admitting a project
member whose URL manufactures ownership. Authentication and functional permission remain independent
requirements; none of these changes grants function merely from membership.

No quantity, progress, certification or controlled-document authority changed. No T&C sign-off,
Handover acceptance, immutable dossier, receipt, or readiness rule was relaxed.

## Auditable 59/59 matrix

Each proof key is the named case in [service-scope-closure.e2e-spec.ts](../../apps/api/test/service-scope-closure.e2e-spec.ts).
Every project case verifies a real JWT, enters its verified tenant/actor context, invokes real application
services/stores, proves wrong project and wrong function are denied, then executes successful member and
governed organization actions on valid independent fixtures. The evaluator is observed, never replaced
with an allow-all stub. Creation cases also reject missing/foreign-tenant projects.

The exact target, validation calls and ownership loads are pinned in
[service-scope-classification.json](../../apps/api/src/service-scope-classification.json);
helper consumers are pinned in [service-scope-helper-lineage.json](../../apps/api/src/service-scope-helper-lineage.json).

| Module | Operation/assertion | Classification | Project resolution source | Change required | Auth-ON proof | Status |
| --- | --- | --- | --- | --- | --- | --- |
| doccontrol | [acknowledgeTransmittal](../../modules/doccontrol/src/doccontrol.service.ts#L164) | PROJECT_SCOPE_REQUIRED | `transmittal.projectId` | Added canonical project scope | `doccontrol.acknowledgeTransmittal` | Verified |
| doccontrol | [assertDocPerm](../../modules/doccontrol/src/doccontrol.service.ts#L469) | PROJECT_SCOPE_REQUIRED | `projectId` | Added canonical project scope | `doccontrol.assertDocPerm` | Verified |
| doccontrol | [closeCorrespondence](../../modules/doccontrol/src/doccontrol.service.ts#L327) | PROJECT_SCOPE_REQUIRED | `correspondence.projectId` | Retained canonical project scope | `doccontrol.closeCorrespondence` | Verified |
| doccontrol | [createCorrespondence](../../modules/doccontrol/src/doccontrol.service.ts#L297) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `doccontrol.createCorrespondence` | Verified |
| doccontrol | [createRegisterEntry](../../modules/doccontrol/src/doccontrol.service.ts#L429) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `doccontrol.createRegisterEntry` | Verified |
| doccontrol | [createSubmittal](../../modules/doccontrol/src/doccontrol.service.ts#L366) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `doccontrol.createSubmittal` | Verified |
| doccontrol | [createTransmittal](../../modules/doccontrol/src/doccontrol.service.ts#L93) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Added canonical project scope | `doccontrol.createTransmittal` | Verified |
| doccontrol | [transitionTransmittal](../../modules/doccontrol/src/doccontrol.service.ts#L130) | PROJECT_SCOPE_REQUIRED | `transmittal.projectId` | Added canonical project scope | `doccontrol.transitionTransmittal` | Verified |
| engineering | [answerRfi](../../modules/engineering/src/engineering.service.ts#L454) | PROJECT_SCOPE_REQUIRED | `rfi.projectId` | Retained canonical project scope | `engineering.answerRfi` | Verified |
| engineering | [assertDrawingPerm](../../modules/engineering/src/engineering.service.ts#L102) | PROJECT_SCOPE_REQUIRED | `projectId` | Added canonical project scope | `engineering.assertDrawingPerm` | Verified |
| engineering | [createDesignChange](../../modules/engineering/src/engineering.service.ts#L774) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `engineering.createDesignChange` | Verified |
| engineering | [createDocument](../../modules/engineering/src/engineering.service.ts#L848) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `engineering.createDocument` | Verified |
| engineering | [createDrawing](../../modules/engineering/src/engineering.service.ts#L74) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Added canonical project scope | `engineering.createDrawing` | Verified |
| engineering | [createRfi](../../modules/engineering/src/engineering.service.ts#L425) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `engineering.createRfi` | Verified |
| engineering | [createSubmittal](../../modules/engineering/src/engineering.service.ts#L500) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `engineering.createSubmittal` | Verified |
| engineering | [createTechnicalQuery](../../modules/engineering/src/engineering.service.ts#L624) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `engineering.createTechnicalQuery` | Verified |
| engineering | [decideDesignChange](../../modules/engineering/src/engineering.service.ts#L801) | PROJECT_SCOPE_REQUIRED | `dc.projectId` | Retained canonical project scope | `engineering.decideDesignChange` | Verified |
| engineering | [registerBimModel](../../modules/engineering/src/engineering.service.ts#L919) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `engineering.registerBimModel` | Verified |
| engineering | [respondTechnicalQuery](../../modules/engineering/src/engineering.service.ts#L646) | PROJECT_SCOPE_REQUIRED | `tq.projectId` | Retained canonical project scope | `engineering.respondTechnicalQuery` | Verified |
| engineering | [transitionDocument](../../modules/engineering/src/engineering.service.ts#L875) | PROJECT_SCOPE_REQUIRED | `doc.projectId` | Retained canonical project scope | `engineering.transitionDocument` | Verified |
| engineering | [updateSubmittalStatus](../../modules/engineering/src/engineering.service.ts#L529) | PROJECT_SCOPE_REQUIRED | `submittal.projectId` | Retained canonical project scope | `engineering.updateSubmittalStatus` | Verified |
| hse | [approvePermit](../../modules/hse/src/hse.service.ts#L241) | PROJECT_SCOPE_REQUIRED | `found.projectId` | Retained canonical project scope | `hse.approvePermit` | Verified |
| hse | [assertIncidentPermission](../../modules/hse/src/hse.service.ts#L177) | PROJECT_SCOPE_REQUIRED | `incident.projectId` | Added canonical project scope | `hse.assertIncidentPermission` | Verified |
| hse | [assertPermitPermission](../../modules/hse/src/hse.service.ts#L391) | PROJECT_SCOPE_REQUIRED | `permit.projectId` | Retained canonical project scope | `hse.assertPermitPermission` | Verified |
| hse | [completeCapa](../../modules/hse/src/hse.service.ts#L497) | PROJECT_SCOPE_REQUIRED | `capa.projectId` | Retained canonical project scope | `hse.completeCapa` | Verified |
| hse | [createRiskAssessment](../../modules/hse/src/hse.service.ts#L596) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `hse.createRiskAssessment` | Verified |
| hse | [raiseCapa](../../modules/hse/src/hse.service.ts#L467) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `hse.raiseCapa` | Verified |
| hse | [recordSafetyTraining](../../modules/hse/src/hse.service.ts#L628) | NOT_PROJECT_OWNED | `workerId; tenant/company authority` | Unchanged intentional worker authority | `safety training is worker competence` | Verified |
| hse | [recordToolboxTalk](../../modules/hse/src/hse.service.ts#L422) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `hse.recordToolboxTalk` | Verified |
| hse | [reportIncident](../../modules/hse/src/hse.service.ts#L86) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `hse.reportIncident` | Verified |
| hse | [requestPermit](../../modules/hse/src/hse.service.ts#L209) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `hse.requestPermit` | Verified |
| projects | [create](../../modules/projects/src/cbs.service.ts#L25) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Added canonical project scope | `cbs.create` | Verified |
| projects | [start](../../modules/projects/src/closeout.service.ts#L51) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Added canonical project scope | `closeout.start` | Verified |
| projects | [assertProjectAccess](../../modules/projects/src/delay-eot.service.ts#L170) | PROJECT_SCOPE_REQUIRED | `projectId` | Added canonical project scope | `delay-eot.assertProjectAccess` | Verified |
| projects | [create](../../modules/projects/src/delivery-item-map.service.ts#L36) | PROJECT_SCOPE_REQUIRED | `candidate.projectId` | Added canonical project scope | `delivery-item-map.create` | Verified |
| projects | [changeStatus](../../modules/projects/src/variation.service.ts#L96) | PROJECT_SCOPE_REQUIRED | `existing.projectId` | Added canonical project scope | `variation.changeStatus` | Verified |
| projects | [create](../../modules/projects/src/variation.service.ts#L55) | PROJECT_SCOPE_REQUIRED | `project.id` | Added canonical project scope | `variation.create` | Verified |
| projects | [approveOpeningBaseline](../../modules/projects/src/wbs.service.ts#L199) | PROJECT_SCOPE_REQUIRED | `project.id` | Added canonical project scope | `wbs.approveOpeningBaseline` | Verified |
| projects | [create](../../modules/projects/src/wbs.service.ts#L52) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Added canonical project scope | `wbs.create` | Verified |
| projects | [updateProgress](../../modules/projects/src/wbs.service.ts#L115) | PROJECT_SCOPE_REQUIRED | `existing.projectId` | Added canonical project scope | `wbs.updateProgress` | Verified |
| quality | [assertNcrPerm](../../modules/quality/src/quality.service.ts#L148) | PROJECT_SCOPE_REQUIRED | `projectId` | Retained canonical project scope | `quality.assertNcrPerm` | Verified |
| quality | [createItp](../../modules/quality/src/quality.service.ts#L544) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `quality.createItp` | Verified |
| quality | [createMaterialApproval](../../modules/quality/src/quality.service.ts#L672) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `quality.createMaterialApproval` | Verified |
| quality | [logSnag](../../modules/quality/src/quality.service.ts#L390) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `quality.logSnag` | Verified |
| quality | [raiseNcr](../../modules/quality/src/quality.service.ts#L101) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `quality.raiseNcr` | Verified |
| quality | [recordCalibration](../../modules/quality/src/quality.service.ts#L796) | PROJECT_SCOPE_REQUIRED | `input.projectId` (organization grant when absent) | Validated creation/ownership; retained project scope | `quality.recordCalibration` | Verified |
| quality | [requestInspection](../../modules/quality/src/quality.service.ts#L293) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `quality.requestInspection` | Verified |
| quality | [resolveInspection](../../modules/quality/src/quality.service.ts#L333) | PROJECT_SCOPE_REQUIRED | `ir.projectId` | Retained canonical project scope | `quality.resolveInspection` | Verified |
| quality | [resolveSnag](../../modules/quality/src/quality.service.ts#L410) | PROJECT_SCOPE_REQUIRED | `snag.projectId` | Retained canonical project scope | `quality.resolveSnag` | Verified |
| quality | [scheduleAudit](../../modules/quality/src/quality.service.ts#L821) | PROJECT_SCOPE_REQUIRED | `input.projectId` (organization grant when absent) | Validated creation/ownership; retained project scope | `quality.scheduleAudit` | Verified |
| quality | [startInspection](../../modules/quality/src/quality.service.ts#L313) | PROJECT_SCOPE_REQUIRED | `ir.projectId` | Retained canonical project scope | `quality.startInspection` | Verified |
| site | [assertReportPerm](../../modules/site/src/site.service.ts#L211) | PROJECT_SCOPE_REQUIRED | `projectId` | Retained canonical project scope | `site.assertReportPerm` | Verified |
| site | [createDelayLog](../../modules/site/src/site.service.ts#L360) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `site.createDelayLog` | Verified |
| site | [createInstallation](../../modules/site/src/site.service.ts#L686) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Added canonical project scope | `site.createInstallation` | Verified |
| site | [createLabourAllocation](../../modules/site/src/site.service.ts#L570) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Added canonical project scope | `site.createLabourAllocation` | Verified |
| site | [createMaterialConsumption](../../modules/site/src/site.service.ts#L514) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `site.createMaterialConsumption` | Verified |
| site | [createPlantUsage](../../modules/site/src/site.service.ts#L634) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Added canonical project scope | `site.createPlantUsage` | Verified |
| site | [issueSiteInstruction](../../modules/site/src/site.service.ts#L435) | PROJECT_SCOPE_REQUIRED | `input.projectId` | Validated creation/ownership; retained project scope | `site.issueSiteInstruction` | Verified |
| site | [resolveDelayLog](../../modules/site/src/site.service.ts#L390) | PROJECT_SCOPE_REQUIRED | `log.projectId` | Retained canonical project scope | `site.resolveDelayLog` | Verified |

## Supplemental closure — outside the 59 service-file assertions

| Surface | Classification | Canonical source | Correction / evidence |
| --- | --- | --- | --- |
| Projects Risk / Issue / Materialisation shared helper | PROJECT_SCOPE_REQUIRED | Selected validated project for create; persisted risk/issue project for update and materialisation | Resource added to shared target; both risk-update and issue-create permissions preserved; helper consumers pinned |
| Commissioning record and handover package routes | PROJECT_SCOPE_REQUIRED | Stored system/package project | Existing entity resolvers retained; create-time project existence checked at API boundary; Phase 1–3 browser regression |
| Handover O&M child routes | DERIVED_SCOPE_REQUIRED | New item's commissioningId → stored system → project; existing child → commissioningId → stored system → project | Explicit route subject resolver; four-quadrant Auth-ON HTTP proof, spoofed query/body denied |
| Handover spare child routes | DERIVED_SCOPE_REQUIRED | New item's commissioningId → stored system → project; existing child → commissioningId → stored system → project | Explicit route subject resolver; four-quadrant Auth-ON HTTP proof, spoofed query/body denied |
| Client-training child routes | PROJECT_SCOPE_REQUIRED (optional system relation) | Persisted training session project; for create the selected project or canonical system | Dedicated subject resolver; project-only sessions remain supported; four-quadrant Auth-ON HTTP proof |

These route corrections change authorization only. O&M/spares remain system-owned; client training can
still cover the whole project. HSE worker safety training remains a separate authority. Collection GETs
continue using a requested project rather than being mistaken for child-record lookups.

## Fitness protection

[service-scope-classification.fitness.test.ts](../../apps/api/src/service-scope-classification.fitness.test.ts)
parses actual assertion calls, reconciles the set to the reviewed manifest, and checks each target and
ownership/validation source. It records intentional non-project/organization branches explicitly and
pins helper caller arguments. A new/missing assertion, lost resource, altered ownership lookup, or omitted
helper scope fails rather than silently reverting to organization-only access. This is not a rule that
every assertion must contain the text projectId. The authenticated integration suite independently checks
that each of the 59 classifications has a named behavioral proof and that all three special Commissioning
subject registrations exist.

## Verification results

- Auth-ON service/API closure: **69 passed** (58 scoped service cases + worker authority + additional boundary proofs, including risk materialisation and baseline replay).
- Architectural fitness: **12 passed** across classification, project resolver coverage and self-scoped route fencing.
- Core regression: **302 passed**, 10 PostgreSQL-only tests skipped in the in-memory run.
- Phase 1–3 browser regression and newly unblocked workflows: **25 passed** across 15 selected specs.
- Full workspace unit regression: **51/51 tasks passed** (50 successful tasks reused from cache; API reran with 455 passed and 4 PostgreSQL-only skips). The initial concurrent run hit a 5-second fitness timeout under build/browser load; the reduced-concurrency rerun passed without changing the test or timeout.
- Typecheck: **51/51 tasks passed**.
- Full workspace build: **27/27 tasks passed**, using isolated `.next-closure-build` output.

Browser proofs run on a separately started in-memory API at port 4150 with authentication enabled,
and a separate web server at 3150. The member fixture has zero organization grants. The positive
Engineering/DocControl browser fixture explicitly configures functional permissions on a delivery role,
grants it only on the test project, and restores the role afterward. No shared development database is
used. PostgreSQL-only integration proofs are not claimed by this pass.

Reproduction commands (from repository root, with the browser fixture configured as above):

```text
node scripts/service-auth-inventory.mjs
pnpm --filter @aura/api exec vitest run --config vitest.config.scope-closure.ts
pnpm exec turbo run test --concurrency=2
pnpm typecheck
NEXT_DIST_DIR=.next-closure-build pnpm build
pnpm --filter @aura/web e2e project-scoped-drawings project-scope-across-operations project-scope-collections-audit delivery-project-scope my-projects-discovery project-member-journey domain-site-project-context domain-quality-project-context domain-hse-project-context domain-tc-handover-project-context domain-reports-project-context service-scope-closure drawing-workflow document-workflow project-risks-issues
```

For PowerShell, set `$env:NEXT_DIST_DIR='.next-closure-build'` before `pnpm build`.
Execution logs are retained locally as `.aura-closure-proof-focused.log`,
`.aura-closure-browser-regression.log`, `.aura-closure-tests-final.log`,
`.aura-closure-typecheck-final.log`, and `.aura-closure-build.log` (ignored build/test artifacts).

This report is scoped to Project-Scoped Operations and Project-Centric UX. **It is not a Production Ready claim.**
