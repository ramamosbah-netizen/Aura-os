# SEC-01 stage 4 — authority draft (for the owner)

**Status: DRAFT, 2026-09-28. Nothing in this document is applied.** It answers one question for each of the 151 routes still on `route-permission-allowlist.json`: who can perform it TODAY, and through which grant. Every one of them is reachable only through a wildcard, so the role list does not say who holds the authority — this document does.

It proposes nothing that changes who may act, except where it asks. Each route is in one of five groups:

- **Name on current holders (75)** — a business role already reaches it, through an entity or module wildcard. Stage 4 writes the permission down by name on the same roles. No change in who may act, so no owner decision is needed; whether a further role should ALSO hold one of these (e.g. the Sales role for account maintenance the Sales Manager alone reaches today) is not decided here.
- **Staff personal (10)** — a user's own work items, notifications and saved views. Named in the staff base every role carries. Saved views and favourites are today reachable by the System Administrator ONLY, so nobody else can save a view or favourite a page — a defect, fixed by naming them.
- **Stays administration (12)** — form/approval builder, templates, workspace configuration, integration webhooks, event emission. Named on the System Administrator: this IS system administration, and it is not business authority.
- **Machine inbound (2)** — inbound webhooks (fleet telemetry, WhatsApp). Not a role question: they must authenticate by signature. Listed as a separate security item.
- **Owner decision (52)** — the acts below. The draft's default is to keep today's holders, by name; where today's holder is only the System Administrator, there is no default and a role must be chosen.

Owner principles this draft follows (2026-09-28): company configuration ≠ platform security; system administration ≠ business authority (today the System Administrator holds `*`, so it can do every act below — removing that is a separate, deliberate migration, see configuration candidate CC-07); configuration changes ≠ historical changes.

## Decisions for the owner

### D-01 — Finance authority acts — payments, journals, bank reconciliation

Today the Finance role alone records a payment, posts a manual journal and reconciles or un-reconciles a bank line, each through an entity wildcard, with no second person. Keep that (the Finance role, by name), or require a checker (e.g. the Finance Controller) for some of them — and if so, above what amount?

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `POST finance/bank-transactions/:id/reconcile` | reconcileManually | `finance.bank-transaction.reconcile` | r-finance (finance.bank-transaction.*) |
| `POST finance/bank-transactions/:id/unreconcile` | unreconcileBankTransaction | `finance.bank-transaction.unreconcile` | r-finance (finance.bank-transaction.*) |
| `POST finance/journals` | postJournal | `finance.journal.create` | r-finance (finance.journal.*) |
| `POST finance/payments` | recordPayment | `finance.payment.create` | r-finance (finance.payment.*) |

### D-02 — VAT return — generate and change status (filing)

Today the Finance role generates a VAT return and moves it to filed and to paid. Keep that, or reserve filing for the Finance Controller?

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `PATCH finance/vat-returns/:id/status` | setVatReturnStatus | `finance.vat-return.status` | r-finance (finance.vat-return.*) |
| `POST finance/vat-returns` | generateVatReturn | `finance.vat-return.create` | r-finance (finance.vat-return.*) |

### D-03 — Bank guarantees and post-dated cheques — status changes

Today the Finance role changes a bank guarantee's or post-dated cheque's status (a guarantee released or claimed; a cheque deposited, cleared, bounced or cancelled). Keep that, or require the Finance Controller?

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `PATCH finance/bank-guarantees/:id/status` | changeBankGuaranteeStatus | `finance.bank-guarantee.status` | r-finance (finance.bank-guarantee.*) |
| `PATCH finance/post-dated-cheques/:id/status` | changeChequeStatus | `finance.post-dated-cheque.status` | r-finance (finance.post-dated-cheque.*) |

### D-04 — Engineering review authority — drawings, submittals, design changes, documents, BIM versions

Today only the Technical Manager (through engineering.*) reviews drawings, sets submittal status, decides design changes and moves engineering documents. Keep the Technical Manager alone, or add another reviewer (e.g. a Design Manager) — and must the reviewer differ from the author?

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `POST engineering/drawings/:id/review` | reviewDrawing | `engineering.drawing.review` | r-technical-manager (engineering.*) |
| `POST engineering/drawings/:id/start-review` | startReviewDrawing | `engineering.drawing.start-review` | r-technical-manager (engineering.*) |
| `PUT engineering/bim-models/:id/version` | newBimModelVersion | `engineering.bim-model.version` | r-technical-manager (engineering.*) |
| `PUT engineering/design-changes/:id/decision` | decideDesignChange | `engineering.design-change.decision` | r-technical-manager (engineering.*) |
| `PUT engineering/documents/:id/transition` | transitionDocument | `engineering.document.transition` | r-technical-manager (engineering.*) |
| `PUT engineering/submittals/:id/status` | updateSubmittalStatus | `engineering.submittal.status` | r-technical-manager (engineering.*) |

### D-05 — RFI answers

Today the Project Engineer and the Technical Manager may both answer an RFI. Keep both?

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `PUT engineering/rfis/:id/answer` | answerRfi | `engineering.rfi.answer` | r-project-engineer (engineering.rfi.*), r-technical-manager (engineering.*) |

### D-06 — Project variation status

Today the Project Manager and the Commercial Manager may BOTH move a project variation's status, including approving it — one person could raise and approve. Keep, or split (PM raises/submits, Commercial Manager approves)?

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `PATCH projects/variations/:id/status` | changeVariationStatus | `projects.variation.status` | r-pm (projects.variation.*), r-commercial-manager (projects.variation.*) |

### D-07 — Project closeout finalisation and delay status

Today the PM alone finalises a closeout, and the Planning Engineer and PM set a delay's status. Keep?

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `PATCH projects/delays/:id/status` | updateDelayStatus | `projects.delay.status` | r-planning-engineer (projects.delay.*), r-pm (projects.delay.*) |
| `POST projects/closeouts/:id/finalize` | finalizeCloseout | `projects.closeout.finalize` | r-pm (projects.closeout.*) |

### D-08 — Acts NO business role can perform today — project status, WBS baseline, cash-flow forecast, delivery item maps

Only the System Administrator can change a project's status, approve its WBS baseline, save a cash-flow forecast or create the delivery-item maps certified billing needs. Who should: the PM, the Planning Engineer, the Commercial Manager?

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `PATCH projects/projects/:id/status` | changeProjectStatus | `projects.project.status` | r-admin only (*) |
| `POST projects/cashflow-forecasts` | saveCashflow | `projects.cashflow-forecast.create` | r-admin only (*) |
| `POST projects/delivery-item-maps` | createDeliveryItemMap | `projects.delivery-item-map.create` | r-admin only (*) |
| `POST projects/projects/:id/wbs-baseline` | approveWbsBaseline | `projects.project.wbs-baseline` | r-admin only (*) |

### D-09 — Authority approvals (Civil Defence, SIRA, utilities) — the compliance module

Only the System Administrator can register an authority, open a compliance case, submit to it, schedule an inspection, record a decision or issue a certificate — the /compliance screen exists, but every act on it is refused for everyone else. Who owns authority approvals: the Document Controller, a Project Engineer, a dedicated Authority Approvals role?

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `POST compliance/authorities` | registerAuthority | `compliance.authority.create` | r-admin only (*) |
| `POST compliance/cases` | openCase | `compliance.case.create` | r-admin only (*) |
| `POST compliance/cases/:id/certificates` | issueCertificate | `compliance.case.certificates` | r-admin only (*) |
| `POST compliance/cases/:id/decisions` | decide | `compliance.case.decisions` | r-admin only (*) |
| `POST compliance/cases/:id/inspections` | scheduleInspection | `compliance.case.inspections` | r-admin only (*) |
| `POST compliance/cases/:id/submissions` | submit | `compliance.case.submissions` | r-admin only (*) |
| `PUT compliance/cases/:id/status` | changeStatus | `compliance.case.status` | r-admin only (*) |
| `PUT compliance/inspections/:inspectionId/outcome` | recordInspection | `compliance.inspection.outcome` | r-admin only (*) |

### D-10 — ELV device register

Only the System Administrator can register an ELV device, change its status or link it to commissioning. Who should: the T&C Engineer, the Technical Engineer, the Store (on receipt)?

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `PATCH elv/devices/:id` | patch | `elv.device.update` | r-admin only (*) |
| `POST elv/devices` | register | `elv.device.create` | r-admin only (*) |
| `PUT elv/devices/:id/commissioning` | link | `elv.device.commissioning` | r-admin only (*) |
| `PUT elv/devices/:id/status` | changeStatus | `elv.device.status` | r-admin only (*) |

### D-11 — Generic documents — upload, new version, share, revoke a share

The generic document routes (outside each module's own upload screens) are System-Administrator-only. Should the Document Controller hold them — and may any staff member share a document they can already read?

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `DELETE documents/:id/permissions/:permissionId` | revokeShare | `documents.permission.delete` | r-admin only (*) |
| `POST documents` | create | `documents.document.create` | r-admin only (*) |
| `POST documents/:id/share` | share | `documents.share.create` | r-admin only (*) |
| `POST documents/:id/versions` | addVersion | `documents.version.create` | r-admin only (*) |

### D-12 — Estimation, pricing intelligence and AI completion

Only the System Administrator can run a line estimate, record a pricing source, trigger calibration or call AI completion. Who should: the Estimator, Pre-Sales, the Executive? (AI access will later be an AI Center setting; this is the default until then.)

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `POST ai/complete` | complete | `ai.complete.create` | r-admin only (*) |
| `POST estimation/line` | estimate | `estimation.line.create` | r-admin only (*) |
| `POST intelligence/calibrations/trigger` | triggerCalibration | `intelligence.calibration.trigger` | r-admin only (*) |
| `POST intelligence/pricing-sources` | recordSource | `intelligence.pricing-source.create` | r-admin only (*) |

### D-13 — Sales Manager–only CRM acts — outcome override, pricing policy, the pre-award package

Only the Sales Manager (through crm.*) can override an opportunity outcome, set a pricing policy, or add an estimate / open pricing / add scope on the pre-award package. These routes are live: the commercial panel, the estimation workspace (build-ups) and package pricing (pricing policy) call them, so by the role catalogue an Estimator or Pre-Sales engineer working there is refused unless they also hold Sales Manager. Is that intended, or should the Estimator and Pre-Sales hold the estimate, build-up and scope acts? (Not yet reproduced in the browser — read from the catalogue.)

| Route | Handler | Permission | Who can today |
| --- | --- | --- | --- |
| `PATCH crm/opportunities/:id/pre-award-package/estimate/:estimateId/build-ups` | updateEstimateBuildUps | `crm.opportunity.build-ups` | r-sales-manager (crm.*) |
| `PATCH crm/opportunities/:id/pre-award-package/pricing/:sheetId/policy` | setPricingPolicy | `crm.opportunity.policy` | r-sales-manager (crm.*) |
| `PATCH crm/opportunities/:id/pre-award-package/scope/:basisId/lines` | editScopeLines | `crm.opportunity.lines` | r-sales-manager (crm.*) |
| `POST crm/opportunities/:id/outcome/override` | overrideOutcome | `crm.opportunity.override` | r-sales-manager (crm.*) |
| `POST crm/opportunities/:id/pre-award-package/estimate` | addEstimate | `crm.opportunity.estimate` | r-sales-manager (crm.*) |
| `POST crm/opportunities/:id/pre-award-package/open` | open | `crm.opportunity.open` | r-sales-manager (crm.*) |
| `POST crm/opportunities/:id/pre-award-package/pricing/open` | openPricing | `crm.opportunity.open` | r-sales-manager (crm.*) |
| `POST crm/opportunities/:id/pre-award-package/pricing/preview` | previewPricing | `crm.opportunity.preview` | r-sales-manager (crm.*) |
| `POST crm/opportunities/:id/pre-award-package/pricing/revision` | openPricingRevision | `crm.opportunity.revision` | r-sales-manager (crm.*) |
| `POST crm/opportunities/:id/pre-award-package/scope` | addScope | `crm.opportunity.scope` | r-sales-manager (crm.*) |

## Every route

| Route | Permission | Group | Who can today | Proposal |
| --- | --- | --- | --- | --- |
| `DELETE crm/accounts/:id/installed-base/:itemId` | `crm.account.delete` | name-on-current-holders | r-sales-manager (crm.*) | name crm.account.delete on r-sales-manager — no change in who may act |
| `DELETE crm/accounts/:id/relationships/:relId` | `crm.account.delete` | name-on-current-holders | r-sales-manager (crm.*) | name crm.account.delete on r-sales-manager — no change in who may act |
| `DELETE crm/market-items/:id` | `crm.market-item.delete` | name-on-current-holders | r-sales-manager (crm.*) | name crm.market-item.delete on r-sales-manager — no change in who may act |
| `DELETE crm/opportunities/:id/deal-team/:mid` | `crm.opportunity.delete` | name-on-current-holders | r-sales-manager (crm.*) | name crm.opportunity.delete on r-sales-manager — no change in who may act |
| `DELETE crm/opportunities/:id/stakeholders/:sid` | `crm.opportunity.delete` | name-on-current-holders | r-sales-manager (crm.*) | name crm.opportunity.delete on r-sales-manager — no change in who may act |
| `DELETE documents/:id/permissions/:permissionId` | `documents.permission.delete` | owner-decision D-11 | r-admin only (*) | no default — D-11 must name a role |
| `DELETE finance/budgets/:id` | `finance.budget.delete` | name-on-current-holders | r-finance (finance.budget.*) | name finance.budget.delete on r-finance — no change in who may act |
| `DELETE projects/cbs/:id` | `projects.cb.delete` | name-on-current-holders | r-pm (projects.cb.*), r-commercial-manager (projects.cb.*) | name projects.cb.delete on r-pm, r-commercial-manager — no change in who may act |
| `DELETE templates/:id` | `templates.template.delete` | stays-administration | r-admin only (*) | name templates.template.delete on r-admin — system administration, not business authority |
| `DELETE views/:id` | `views.view.delete` | staff-personal | r-admin only (*) | name views.view.delete in STAFF_BASE — the user's own tasks, notifications and saved views (today NOBODY but the admin can save a view or favourite a page) |
| `DELETE work-items/:source/:id` | `work-items.work-item.delete` | staff-personal | r-sales (work-items.*), r-sales-manager (work-items.*), r-pre-sales (work-items.*), r-estimator (work-items.*), r-technical-engineer (work-items.*), r-site-engineer (work-items.*), r-planning-engineer (work-items.*), r-project-engineer (work-items.*), r-pm (work-items.*), r-technical-manager (work-items.*), r-commercial-manager (work-items.*), r-procurement (work-items.*), r-procurement-manager (work-items.*), r-store (work-items.*), r-qa-qc (work-items.*), r-hse (work-items.*), r-finance (work-items.*), r-finance-controller (work-items.*), r-commissioning-engineer (work-items.*), r-service-manager (work-items.*), r-handover-fm (work-items.*), r-hr (work-items.*), r-hr-manager (work-items.*), r-document-controller (work-items.*), r-executive (work-items.*) | name work-items.work-item.delete in STAFF_BASE — the user's own tasks, notifications and saved views |
| `PATCH crm/accounts/:id/installed-base/:itemId` | `crm.account.installed-base` | name-on-current-holders | r-sales-manager (crm.*) | name crm.account.installed-base on r-sales-manager — no change in who may act |
| `PATCH crm/campaigns/:id/results` | `crm.campaign.results` | name-on-current-holders | r-sales-manager (crm.*) | name crm.campaign.results on r-sales-manager — no change in who may act |
| `PATCH crm/campaigns/:id/status` | `crm.campaign.status` | name-on-current-holders | r-sales-manager (crm.*) | name crm.campaign.status on r-sales-manager — no change in who may act |
| `PATCH crm/leads/:id` | `crm.lead.update` | name-on-current-holders | r-sales (crm.lead.*), r-sales-manager (crm.*) | name crm.lead.update on r-sales, r-sales-manager — no change in who may act |
| `PATCH crm/leads/:id/assign` | `crm.lead.assign` | name-on-current-holders | r-sales (crm.lead.*), r-sales-manager (crm.*) | name crm.lead.assign on r-sales, r-sales-manager — no change in who may act |
| `PATCH crm/leads/:id/qualification` | `crm.lead.qualification` | name-on-current-holders | r-sales (crm.lead.*), r-sales-manager (crm.*) | name crm.lead.qualification on r-sales, r-sales-manager — no change in who may act |
| `PATCH crm/opportunities/:id/pre-award-package/estimate/:estimateId/build-ups` | `crm.opportunity.build-ups` | owner-decision D-13 | r-sales-manager (crm.*) | name crm.opportunity.build-ups on r-sales-manager (unchanged holders) — pending D-13 |
| `PATCH crm/opportunities/:id/pre-award-package/pricing/:sheetId/policy` | `crm.opportunity.policy` | owner-decision D-13 | r-sales-manager (crm.*) | name crm.opportunity.policy on r-sales-manager (unchanged holders) — pending D-13 |
| `PATCH crm/opportunities/:id/pre-award-package/scope/:basisId/lines` | `crm.opportunity.lines` | owner-decision D-13 | r-sales-manager (crm.*) | name crm.opportunity.lines on r-sales-manager (unchanged holders) — pending D-13 |
| `PATCH elv/devices/:id` | `elv.device.update` | owner-decision D-10 | r-admin only (*) | no default — D-10 must name a role |
| `PATCH finance/bank-guarantees/:id/status` | `finance.bank-guarantee.status` | owner-decision D-03 | r-finance (finance.bank-guarantee.*) | name finance.bank-guarantee.status on r-finance (unchanged holders) — pending D-03 |
| `PATCH finance/post-dated-cheques/:id/status` | `finance.post-dated-cheque.status` | owner-decision D-03 | r-finance (finance.post-dated-cheque.*) | name finance.post-dated-cheque.status on r-finance (unchanged holders) — pending D-03 |
| `PATCH finance/vat-returns/:id/status` | `finance.vat-return.status` | owner-decision D-02 | r-finance (finance.vat-return.*) | name finance.vat-return.status on r-finance (unchanged holders) — pending D-02 |
| `PATCH integration/webhooks/:id` | `integration.webhook.update` | stays-administration | r-admin only (*) | name integration.webhook.update on r-admin — system administration, not business authority |
| `PATCH inventory/materials/:id` | `inventory.material.update` | name-on-current-holders | r-store (inventory.*) | name inventory.material.update on r-store — no change in who may act |
| `PATCH inventory/stock/:id/reorder` | `inventory.stock.reorder` | name-on-current-holders | r-store (inventory.*) | name inventory.stock.reorder on r-store — no change in who may act |
| `PATCH inventory/stock/:id/uom` | `inventory.stock.uom` | name-on-current-holders | r-store (inventory.*) | name inventory.stock.uom on r-store — no change in who may act |
| `PATCH notifications/:id/read` | `notifications.read.update` | staff-personal | r-sales (notifications.*), r-sales-manager (notifications.*), r-pre-sales (notifications.*), r-estimator (notifications.*), r-technical-engineer (notifications.*), r-site-engineer (notifications.*), r-planning-engineer (notifications.*), r-project-engineer (notifications.*), r-pm (notifications.*), r-technical-manager (notifications.*), r-commercial-manager (notifications.*), r-procurement (notifications.*), r-procurement-manager (notifications.*), r-store (notifications.*), r-qa-qc (notifications.*), r-hse (notifications.*), r-finance (notifications.*), r-finance-controller (notifications.*), r-commissioning-engineer (notifications.*), r-service-manager (notifications.*), r-handover-fm (notifications.*), r-hr (notifications.*), r-hr-manager (notifications.*), r-document-controller (notifications.*), r-executive (notifications.*) | name notifications.read.update in STAFF_BASE — the user's own tasks, notifications and saved views |
| `PATCH projects/cbs/:id` | `projects.cb.update` | name-on-current-holders | r-pm (projects.cb.*), r-commercial-manager (projects.cb.*) | name projects.cb.update on r-pm, r-commercial-manager — no change in who may act |
| `PATCH projects/closeouts/:id/items/:index` | `projects.closeout.items` | name-on-current-holders | r-pm (projects.closeout.*) | name projects.closeout.items on r-pm — no change in who may act |
| `PATCH projects/delays/:id/status` | `projects.delay.status` | owner-decision D-07 | r-planning-engineer (projects.delay.*), r-pm (projects.delay.*) | name projects.delay.status on r-planning-engineer, r-pm (unchanged holders) — pending D-07 |
| `PATCH projects/issues/:id` | `projects.issue.update` | name-on-current-holders | r-project-engineer (projects.issue.*), r-pm (projects.issue.*) | name projects.issue.update on r-project-engineer, r-pm — no change in who may act |
| `PATCH projects/projects/:id/status` | `projects.project.status` | owner-decision D-08 | r-admin only (*) | no default — D-08 must name a role |
| `PATCH projects/risks/:id` | `projects.risk.update` | name-on-current-holders | r-project-engineer (projects.risk.*), r-pm (projects.risk.*) | name projects.risk.update on r-project-engineer, r-pm — no change in who may act |
| `PATCH projects/variations/:id/status` | `projects.variation.status` | owner-decision D-06 | r-pm (projects.variation.*), r-commercial-manager (projects.variation.*) | name projects.variation.status on r-pm, r-commercial-manager (unchanged holders) — pending D-06 |
| `PATCH projects/wbs/:id/progress` | `projects.wb.progress` | name-on-current-holders | r-planning-engineer (projects.wb.*), r-pm (projects.wb.*) | name projects.wb.progress on r-planning-engineer, r-pm — no change in who may act |
| `PATCH work-items/:source/:id` | `work-items.work-item.update` | staff-personal | r-sales (work-items.*), r-sales-manager (work-items.*), r-pre-sales (work-items.*), r-estimator (work-items.*), r-technical-engineer (work-items.*), r-site-engineer (work-items.*), r-planning-engineer (work-items.*), r-project-engineer (work-items.*), r-pm (work-items.*), r-technical-manager (work-items.*), r-commercial-manager (work-items.*), r-procurement (work-items.*), r-procurement-manager (work-items.*), r-store (work-items.*), r-qa-qc (work-items.*), r-hse (work-items.*), r-finance (work-items.*), r-finance-controller (work-items.*), r-commissioning-engineer (work-items.*), r-service-manager (work-items.*), r-handover-fm (work-items.*), r-hr (work-items.*), r-hr-manager (work-items.*), r-document-controller (work-items.*), r-executive (work-items.*) | name work-items.work-item.update in STAFF_BASE — the user's own tasks, notifications and saved views |
| `POST ai/complete` | `ai.complete.create` | owner-decision D-12 | r-admin only (*) | no default — D-12 must name a role |
| `POST builder/approvals` | `builder.approval.create` | stays-administration | r-admin only (*) | name builder.approval.create on r-admin — system administration, not business authority |
| `POST builder/approvals/:entityType/evaluate` | `builder.approval.evaluate` | stays-administration | r-admin only (*) | name builder.approval.evaluate on r-admin — system administration, not business authority |
| `POST builder/entities` | `builder.entity.create` | stays-administration | r-admin only (*) | name builder.entity.create on r-admin — system administration, not business authority |
| `POST builder/forms` | `builder.form.create` | stays-administration | r-admin only (*) | name builder.form.create on r-admin — system administration, not business authority |
| `POST builder/forms/:formKey/validate` | `builder.form.validate` | stays-administration | r-admin only (*) | name builder.form.validate on r-admin — system administration, not business authority |
| `POST compliance/authorities` | `compliance.authority.create` | owner-decision D-09 | r-admin only (*) | no default — D-09 must name a role |
| `POST compliance/cases` | `compliance.case.create` | owner-decision D-09 | r-admin only (*) | no default — D-09 must name a role |
| `POST compliance/cases/:id/certificates` | `compliance.case.certificates` | owner-decision D-09 | r-admin only (*) | no default — D-09 must name a role |
| `POST compliance/cases/:id/decisions` | `compliance.case.decisions` | owner-decision D-09 | r-admin only (*) | no default — D-09 must name a role |
| `POST compliance/cases/:id/inspections` | `compliance.case.inspections` | owner-decision D-09 | r-admin only (*) | no default — D-09 must name a role |
| `POST compliance/cases/:id/submissions` | `compliance.case.submissions` | owner-decision D-09 | r-admin only (*) | no default — D-09 must name a role |
| `POST crm/accounts/:id/installed-base` | `crm.account.installed-base` | name-on-current-holders | r-sales-manager (crm.*) | name crm.account.installed-base on r-sales-manager — no change in who may act |
| `POST crm/accounts/:id/installed-base/scan` | `crm.account.scan` | name-on-current-holders | r-sales-manager (crm.*) | name crm.account.scan on r-sales-manager — no change in who may act |
| `POST crm/accounts/:id/relationships` | `crm.account.relationships` | name-on-current-holders | r-sales-manager (crm.*) | name crm.account.relationships on r-sales-manager — no change in who may act |
| `POST crm/automation/run` | `crm.automation.run` | name-on-current-holders | r-sales-manager (crm.*) | name crm.automation.run on r-sales-manager — no change in who may act |
| `POST crm/campaigns` | `crm.campaign.create` | name-on-current-holders | r-sales-manager (crm.*) | name crm.campaign.create on r-sales-manager — no change in who may act |
| `POST crm/leads` | `crm.lead.create` | name-on-current-holders | r-sales (crm.lead.*), r-sales-manager (crm.*) | name crm.lead.create on r-sales, r-sales-manager — no change in who may act |
| `POST crm/leads/:id/accept` | `crm.lead.accept` | name-on-current-holders | r-sales (crm.lead.*), r-sales-manager (crm.*) | name crm.lead.accept on r-sales, r-sales-manager — no change in who may act |
| `POST crm/leads/:id/convert` | `crm.lead.convert` | name-on-current-holders | r-sales (crm.lead.*), r-sales-manager (crm.*) | name crm.lead.convert on r-sales, r-sales-manager — no change in who may act |
| `POST crm/market-items` | `crm.market-item.create` | name-on-current-holders | r-sales-manager (crm.*) | name crm.market-item.create on r-sales-manager — no change in who may act |
| `POST crm/market-items/seed` | `crm.market-item.seed` | name-on-current-holders | r-sales-manager (crm.*) | name crm.market-item.seed on r-sales-manager — no change in who may act |
| `POST crm/meeting-summary` | `crm.meeting-summary.create` | name-on-current-holders | r-sales-manager (crm.*) | name crm.meeting-summary.create on r-sales-manager — no change in who may act |
| `POST crm/opportunities/:id/email-draft` | `crm.opportunity.email-draft` | name-on-current-holders | r-sales-manager (crm.*) | name crm.opportunity.email-draft on r-sales-manager — no change in who may act |
| `POST crm/opportunities/:id/outcome/override` | `crm.opportunity.override` | owner-decision D-13 | r-sales-manager (crm.*) | name crm.opportunity.override on r-sales-manager (unchanged holders) — pending D-13 |
| `POST crm/opportunities/:id/pre-award-package/estimate` | `crm.opportunity.estimate` | owner-decision D-13 | r-sales-manager (crm.*) | name crm.opportunity.estimate on r-sales-manager (unchanged holders) — pending D-13 |
| `POST crm/opportunities/:id/pre-award-package/open` | `crm.opportunity.open` | owner-decision D-13 | r-sales-manager (crm.*) | name crm.opportunity.open on r-sales-manager (unchanged holders) — pending D-13 |
| `POST crm/opportunities/:id/pre-award-package/pricing/open` | `crm.opportunity.open` | owner-decision D-13 | r-sales-manager (crm.*) | name crm.opportunity.open on r-sales-manager (unchanged holders) — pending D-13 |
| `POST crm/opportunities/:id/pre-award-package/pricing/preview` | `crm.opportunity.preview` | owner-decision D-13 | r-sales-manager (crm.*) | name crm.opportunity.preview on r-sales-manager (unchanged holders) — pending D-13 |
| `POST crm/opportunities/:id/pre-award-package/pricing/revision` | `crm.opportunity.revision` | owner-decision D-13 | r-sales-manager (crm.*) | name crm.opportunity.revision on r-sales-manager (unchanged holders) — pending D-13 |
| `POST crm/opportunities/:id/pre-award-package/scope` | `crm.opportunity.scope` | owner-decision D-13 | r-sales-manager (crm.*) | name crm.opportunity.scope on r-sales-manager (unchanged holders) — pending D-13 |
| `POST crm/opportunities/:id/scope-assist/:proposalId/accept` | `crm.opportunity.accept` | name-on-current-holders | r-sales-manager (crm.*) | name crm.opportunity.accept on r-sales-manager — no change in who may act |
| `POST crm/opportunities/:id/scope-assist/generate` | `crm.opportunity.generate` | name-on-current-holders | r-sales-manager (crm.*) | name crm.opportunity.generate on r-sales-manager — no change in who may act |
| `POST crm/opportunities/forecast/snapshot` | `crm.opportunity.snapshot` | name-on-current-holders | r-sales-manager (crm.*) | name crm.opportunity.snapshot on r-sales-manager — no change in who may act |
| `POST documents` | `documents.document.create` | owner-decision D-11 | r-admin only (*) | no default — D-11 must name a role |
| `POST documents/:id/share` | `documents.share.create` | owner-decision D-11 | r-admin only (*) | no default — D-11 must name a role |
| `POST documents/:id/versions` | `documents.version.create` | owner-decision D-11 | r-admin only (*) | no default — D-11 must name a role |
| `POST elv/devices` | `elv.device.create` | owner-decision D-10 | r-admin only (*) | no default — D-10 must name a role |
| `POST engineering/bim-models` | `engineering.bim-model.create` | name-on-current-holders | r-technical-engineer (engineering.*.create), r-technical-manager (engineering.*) | name engineering.bim-model.create on r-technical-engineer, r-technical-manager — no change in who may act |
| `POST engineering/design-changes` | `engineering.design-change.create` | name-on-current-holders | r-technical-engineer (engineering.*.create), r-technical-manager (engineering.*) | name engineering.design-change.create on r-technical-engineer, r-technical-manager — no change in who may act |
| `POST engineering/documents` | `engineering.document.create` | name-on-current-holders | r-technical-engineer (engineering.*.create), r-technical-manager (engineering.*) | name engineering.document.create on r-technical-engineer, r-technical-manager — no change in who may act |
| `POST engineering/drawings` | `engineering.drawing.create` | name-on-current-holders | r-technical-engineer (engineering.*.create), r-technical-manager (engineering.*) | name engineering.drawing.create on r-technical-engineer, r-technical-manager — no change in who may act |
| `POST engineering/drawings/:id/review` | `engineering.drawing.review` | owner-decision D-04 | r-technical-manager (engineering.*) | name engineering.drawing.review on r-technical-manager (unchanged holders) — pending D-04 |
| `POST engineering/drawings/:id/start-review` | `engineering.drawing.start-review` | owner-decision D-04 | r-technical-manager (engineering.*) | name engineering.drawing.start-review on r-technical-manager (unchanged holders) — pending D-04 |
| `POST engineering/rfis` | `engineering.rfi.create` | name-on-current-holders | r-technical-engineer (engineering.*.create), r-project-engineer (engineering.rfi.*), r-technical-manager (engineering.*) | name engineering.rfi.create on r-technical-engineer, r-project-engineer, r-technical-manager — no change in who may act |
| `POST engineering/submittals` | `engineering.submittal.create` | name-on-current-holders | r-technical-engineer (engineering.*.create), r-technical-manager (engineering.*) | name engineering.submittal.create on r-technical-engineer, r-technical-manager — no change in who may act |
| `POST estimation/line` | `estimation.line.create` | owner-decision D-12 | r-admin only (*) | no default — D-12 must name a role |
| `POST events` | `events.event.create` | stays-administration | r-admin only (*) | name events.event.create on r-admin — system administration, not business authority |
| `POST finance/accounts` | `finance.account.create` | name-on-current-holders | r-finance (finance.account.*) | name finance.account.create on r-finance — no change in who may act |
| `POST finance/accounts/import` | `finance.account.import` | name-on-current-holders | r-finance (finance.account.*) | name finance.account.import on r-finance — no change in who may act |
| `POST finance/bank-guarantees` | `finance.bank-guarantee.create` | name-on-current-holders | r-finance (finance.bank-guarantee.*) | name finance.bank-guarantee.create on r-finance — no change in who may act |
| `POST finance/bank-transactions/:id/reconcile` | `finance.bank-transaction.reconcile` | owner-decision D-01 | r-finance (finance.bank-transaction.*) | name finance.bank-transaction.reconcile on r-finance (unchanged holders) — pending D-01 |
| `POST finance/bank-transactions/:id/unreconcile` | `finance.bank-transaction.unreconcile` | owner-decision D-01 | r-finance (finance.bank-transaction.*) | name finance.bank-transaction.unreconcile on r-finance (unchanged holders) — pending D-01 |
| `POST finance/bank-transactions/auto-match` | `finance.bank-transaction.auto-match` | name-on-current-holders | r-finance (finance.bank-transaction.*) | name finance.bank-transaction.auto-match on r-finance — no change in who may act |
| `POST finance/bank-transactions/import` | `finance.bank-transaction.import` | name-on-current-holders | r-finance (finance.bank-transaction.*) | name finance.bank-transaction.import on r-finance — no change in who may act |
| `POST finance/budgets` | `finance.budget.create` | name-on-current-holders | r-finance (finance.budget.*) | name finance.budget.create on r-finance — no change in who may act |
| `POST finance/budgets/:id/restore` | `finance.budget.restore` | name-on-current-holders | r-finance (finance.budget.*) | name finance.budget.restore on r-finance — no change in who may act |
| `POST finance/cost-centers` | `finance.cost-center.create` | name-on-current-holders | r-finance (finance.cost-center.*) | name finance.cost-center.create on r-finance — no change in who may act |
| `POST finance/fx/rates` | `finance.fx.rates` | name-on-current-holders | r-finance (finance.fx.*) | name finance.fx.rates on r-finance — no change in who may act |
| `POST finance/journals` | `finance.journal.create` | owner-decision D-01 | r-finance (finance.journal.*) | name finance.journal.create on r-finance (unchanged holders) — pending D-01 |
| `POST finance/payments` | `finance.payment.create` | owner-decision D-01 | r-finance (finance.payment.*) | name finance.payment.create on r-finance (unchanged holders) — pending D-01 |
| `POST finance/petty-cash` | `finance.petty-cash.create` | name-on-current-holders | r-finance (finance.petty-cash.*) | name finance.petty-cash.create on r-finance — no change in who may act |
| `POST finance/petty-cash/:id/transactions` | `finance.petty-cash.transactions` | name-on-current-holders | r-finance (finance.petty-cash.*) | name finance.petty-cash.transactions on r-finance — no change in who may act |
| `POST finance/post-dated-cheques` | `finance.post-dated-cheque.create` | name-on-current-holders | r-finance (finance.post-dated-cheque.*) | name finance.post-dated-cheque.create on r-finance — no change in who may act |
| `POST finance/profit-centers` | `finance.profit-center.create` | name-on-current-holders | r-finance (finance.profit-center.*) | name finance.profit-center.create on r-finance — no change in who may act |
| `POST finance/tax-codes` | `finance.tax-code.create` | name-on-current-holders | r-finance (finance.tax-code.*) | name finance.tax-code.create on r-finance — no change in who may act |
| `POST finance/vat-returns` | `finance.vat-return.create` | owner-decision D-02 | r-finance (finance.vat-return.*) | name finance.vat-return.create on r-finance (unchanged holders) — pending D-02 |
| `POST fleet/telemetry/webhook` | `fleet.telemetry.webhook` | machine-inbound | r-admin only (*) | not a role question: an inbound webhook must authenticate by signature, not by a user permission — separate security item |
| `POST integration/webhooks` | `integration.webhook.create` | stays-administration | r-admin only (*) | name integration.webhook.create on r-admin — system administration, not business authority |
| `POST intelligence/calibrations/trigger` | `intelligence.calibration.trigger` | owner-decision D-12 | r-admin only (*) | no default — D-12 must name a role |
| `POST intelligence/pricing-sources` | `intelligence.pricing-source.create` | owner-decision D-12 | r-admin only (*) | no default — D-12 must name a role |
| `POST inventory/grns` | `inventory.grn.create` | name-on-current-holders | r-store (inventory.*) | name inventory.grn.create on r-store — no change in who may act |
| `POST inventory/locations` | `inventory.location.create` | name-on-current-holders | r-store (inventory.*) | name inventory.location.create on r-store — no change in who may act |
| `POST inventory/materials` | `inventory.material.create` | name-on-current-holders | r-store (inventory.*) | name inventory.material.create on r-store — no change in who may act |
| `POST inventory/serials` | `inventory.serial.create` | name-on-current-holders | r-store (inventory.*) | name inventory.serial.create on r-store — no change in who may act |
| `POST inventory/stock` | `inventory.stock.create` | name-on-current-holders | r-store (inventory.*) | name inventory.stock.create on r-store — no change in who may act |
| `POST inventory/stock/:id/movements` | `inventory.stock.movements` | name-on-current-holders | r-store (inventory.*) | name inventory.stock.movements on r-store — no change in who may act |
| `POST inventory/transfers` | `inventory.transfer.create` | name-on-current-holders | r-store (inventory.*) | name inventory.transfer.create on r-store — no change in who may act |
| `POST projects/cashflow-forecasts` | `projects.cashflow-forecast.create` | owner-decision D-08 | r-admin only (*) | no default — D-08 must name a role |
| `POST projects/cbs` | `projects.cb.create` | name-on-current-holders | r-pm (projects.cb.*), r-commercial-manager (projects.cb.*) | name projects.cb.create on r-pm, r-commercial-manager — no change in who may act |
| `POST projects/closeouts` | `projects.closeout.create` | name-on-current-holders | r-pm (projects.closeout.*) | name projects.closeout.create on r-pm — no change in who may act |
| `POST projects/closeouts/:id/finalize` | `projects.closeout.finalize` | owner-decision D-07 | r-pm (projects.closeout.*) | name projects.closeout.finalize on r-pm (unchanged holders) — pending D-07 |
| `POST projects/delays` | `projects.delay.create` | name-on-current-holders | r-planning-engineer (projects.delay.*), r-pm (projects.delay.*) | name projects.delay.create on r-planning-engineer, r-pm — no change in who may act |
| `POST projects/delivery-item-maps` | `projects.delivery-item-map.create` | owner-decision D-08 | r-admin only (*) | no default — D-08 must name a role |
| `POST projects/issues` | `projects.issue.create` | name-on-current-holders | r-project-engineer (projects.issue.*), r-pm (projects.issue.*) | name projects.issue.create on r-project-engineer, r-pm — no change in who may act |
| `POST projects/projects/:id/wbs-baseline` | `projects.project.wbs-baseline` | owner-decision D-08 | r-admin only (*) | no default — D-08 must name a role |
| `POST projects/risks` | `projects.risk.create` | name-on-current-holders | r-project-engineer (projects.risk.*), r-pm (projects.risk.*) | name projects.risk.create on r-project-engineer, r-pm — no change in who may act |
| `POST projects/schedules` | `projects.schedule.create` | name-on-current-holders | r-pm (projects.schedule.*) | name projects.schedule.create on r-pm — no change in who may act |
| `POST projects/variations` | `projects.variation.create` | name-on-current-holders | r-pm (projects.variation.*), r-commercial-manager (projects.variation.*) | name projects.variation.create on r-pm, r-commercial-manager — no change in who may act |
| `POST projects/wbs` | `projects.wb.create` | name-on-current-holders | r-planning-engineer (projects.wb.*), r-pm (projects.wb.*) | name projects.wb.create on r-planning-engineer, r-pm — no change in who may act |
| `POST templates` | `templates.template.create` | stays-administration | r-admin only (*) | name templates.template.create on r-admin — system administration, not business authority |
| `POST views` | `views.view.create` | staff-personal | r-admin only (*) | name views.view.create in STAFF_BASE — the user's own tasks, notifications and saved views (today NOBODY but the admin can save a view or favourite a page) |
| `POST views/favorite` | `views.favorite.create` | staff-personal | r-admin only (*) | name views.favorite.create in STAFF_BASE — the user's own tasks, notifications and saved views (today NOBODY but the admin can save a view or favourite a page) |
| `POST whatsapp/webhook` | `whatsapp.webhook.create` | machine-inbound | r-admin only (*) | not a role question: an inbound webhook must authenticate by signature, not by a user permission — separate security item |
| `POST work-items` | `work-items.work-item.create` | staff-personal | r-sales (work-items.*), r-sales-manager (work-items.*), r-pre-sales (work-items.*), r-estimator (work-items.*), r-technical-engineer (work-items.*), r-site-engineer (work-items.*), r-planning-engineer (work-items.*), r-project-engineer (work-items.*), r-pm (work-items.*), r-technical-manager (work-items.*), r-commercial-manager (work-items.*), r-procurement (work-items.*), r-procurement-manager (work-items.*), r-store (work-items.*), r-qa-qc (work-items.*), r-hse (work-items.*), r-finance (work-items.*), r-finance-controller (work-items.*), r-commissioning-engineer (work-items.*), r-service-manager (work-items.*), r-handover-fm (work-items.*), r-hr (work-items.*), r-hr-manager (work-items.*), r-document-controller (work-items.*), r-executive (work-items.*) | name work-items.work-item.create in STAFF_BASE — the user's own tasks, notifications and saved views |
| `POST work-items/:source/:id/:action` | `work-items.work-item.create` | staff-personal | r-sales (work-items.*), r-sales-manager (work-items.*), r-pre-sales (work-items.*), r-estimator (work-items.*), r-technical-engineer (work-items.*), r-site-engineer (work-items.*), r-planning-engineer (work-items.*), r-project-engineer (work-items.*), r-pm (work-items.*), r-technical-manager (work-items.*), r-commercial-manager (work-items.*), r-procurement (work-items.*), r-procurement-manager (work-items.*), r-store (work-items.*), r-qa-qc (work-items.*), r-hse (work-items.*), r-finance (work-items.*), r-finance-controller (work-items.*), r-commissioning-engineer (work-items.*), r-service-manager (work-items.*), r-handover-fm (work-items.*), r-hr (work-items.*), r-hr-manager (work-items.*), r-document-controller (work-items.*), r-executive (work-items.*) | name work-items.work-item.create in STAFF_BASE — the user's own tasks, notifications and saved views |
| `POST work-items/:source/:id/reschedule` | `work-items.reschedule.create` | staff-personal | r-sales (work-items.*), r-sales-manager (work-items.*), r-pre-sales (work-items.*), r-estimator (work-items.*), r-technical-engineer (work-items.*), r-site-engineer (work-items.*), r-planning-engineer (work-items.*), r-project-engineer (work-items.*), r-pm (work-items.*), r-technical-manager (work-items.*), r-commercial-manager (work-items.*), r-procurement (work-items.*), r-procurement-manager (work-items.*), r-store (work-items.*), r-qa-qc (work-items.*), r-hse (work-items.*), r-finance (work-items.*), r-finance-controller (work-items.*), r-commissioning-engineer (work-items.*), r-service-manager (work-items.*), r-handover-fm (work-items.*), r-hr (work-items.*), r-hr-manager (work-items.*), r-document-controller (work-items.*), r-executive (work-items.*) | name work-items.reschedule.create in STAFF_BASE — the user's own tasks, notifications and saved views |
| `POST work-items/reminders/sync` | `work-items.reminder.sync` | staff-personal | r-sales (work-items.*), r-sales-manager (work-items.*), r-pre-sales (work-items.*), r-estimator (work-items.*), r-technical-engineer (work-items.*), r-site-engineer (work-items.*), r-planning-engineer (work-items.*), r-project-engineer (work-items.*), r-pm (work-items.*), r-technical-manager (work-items.*), r-commercial-manager (work-items.*), r-procurement (work-items.*), r-procurement-manager (work-items.*), r-store (work-items.*), r-qa-qc (work-items.*), r-hse (work-items.*), r-finance (work-items.*), r-finance-controller (work-items.*), r-commissioning-engineer (work-items.*), r-service-manager (work-items.*), r-handover-fm (work-items.*), r-hr (work-items.*), r-hr-manager (work-items.*), r-document-controller (work-items.*), r-executive (work-items.*) | name work-items.reminder.sync in STAFF_BASE — the user's own tasks, notifications and saved views |
| `PUT compliance/cases/:id/status` | `compliance.case.status` | owner-decision D-09 | r-admin only (*) | no default — D-09 must name a role |
| `PUT compliance/inspections/:inspectionId/outcome` | `compliance.inspection.outcome` | owner-decision D-09 | r-admin only (*) | no default — D-09 must name a role |
| `PUT elv/devices/:id/commissioning` | `elv.device.commissioning` | owner-decision D-10 | r-admin only (*) | no default — D-10 must name a role |
| `PUT elv/devices/:id/status` | `elv.device.status` | owner-decision D-10 | r-admin only (*) | no default — D-10 must name a role |
| `PUT engineering/bim-models/:id/version` | `engineering.bim-model.version` | owner-decision D-04 | r-technical-manager (engineering.*) | name engineering.bim-model.version on r-technical-manager (unchanged holders) — pending D-04 |
| `PUT engineering/design-changes/:id/decision` | `engineering.design-change.decision` | owner-decision D-04 | r-technical-manager (engineering.*) | name engineering.design-change.decision on r-technical-manager (unchanged holders) — pending D-04 |
| `PUT engineering/documents/:id/transition` | `engineering.document.transition` | owner-decision D-04 | r-technical-manager (engineering.*) | name engineering.document.transition on r-technical-manager (unchanged holders) — pending D-04 |
| `PUT engineering/rfis/:id/answer` | `engineering.rfi.answer` | owner-decision D-05 | r-project-engineer (engineering.rfi.*), r-technical-manager (engineering.*) | name engineering.rfi.answer on r-project-engineer, r-technical-manager (unchanged holders) — pending D-05 |
| `PUT engineering/submittals/:id/status` | `engineering.submittal.status` | owner-decision D-04 | r-technical-manager (engineering.*) | name engineering.submittal.status on r-technical-manager (unchanged holders) — pending D-04 |
| `PUT inventory/locations/:id/active` | `inventory.location.active` | name-on-current-holders | r-store (inventory.*) | name inventory.location.active on r-store — no change in who may act |
| `PUT inventory/serials/:id/fault` | `inventory.serial.fault` | name-on-current-holders | r-store (inventory.*) | name inventory.serial.fault on r-store — no change in who may act |
| `PUT inventory/serials/:id/install` | `inventory.serial.install` | name-on-current-holders | r-store (inventory.*) | name inventory.serial.install on r-store — no change in who may act |
| `PUT inventory/serials/:id/return` | `inventory.serial.return` | name-on-current-holders | r-store (inventory.*) | name inventory.serial.return on r-store — no change in who may act |
| `PUT templates/:id` | `templates.template.update` | stays-administration | r-admin only (*) | name templates.template.update on r-admin — system administration, not business authority |
| `PUT workspace/config` | `workspace.config.update` | stays-administration | r-admin only (*) | name workspace.config.update on r-admin — system administration, not business authority |
