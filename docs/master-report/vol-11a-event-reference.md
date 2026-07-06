# Volume 11A — Event Flow Reference

[← Volume 11](vol-11-workflow-catalog.md) · [← Master index](README.md)

Generated on 2026-07-05 from `shared/src/events/catalog.ts`
(catalog), `modules/*` + `apps/api/src` (emit sites), and `apps/api/src/events`
(subscribers). Regenerate: `node docs/master-report/tools/gen-events.mjs <repo-root>`.

**72 catalogued events** across 17 contexts. "Emitters" are files
that reference the event literal at a write site; "Consumers" are reactor/subscriber files that
react to it. An event with no consumer is a **projection/webhook-only** signal (available to external subscribers, not yet driving an internal reactor) — these are candidates for future automation, flagged ⦿. **6 of 72** events currently drive an internal reactor.


## assets (3)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `assets.inspection.recorded` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `assets.maintenance.completed` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `assets.maintenance.scheduled` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## contracts (4)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `contracts.contract.completed` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `contracts.contract.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `contracts.contract.signed` | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | `cross-module-subscriberts` |
| `contracts.contract.updated` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## crm (8)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `crm.account.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `crm.account.status_changed` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `crm.account.updated` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `crm.lead.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `crm.lead.updated` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `crm.opportunity.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `crm.opportunity.stage_changed` | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | `cross-module-subscriberts` |
| `crm.opportunity.updated` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## doccontrol (2)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `doccontrol.correspondence.logged` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `doccontrol.transmittal.sent` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## engineering (6)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `engineering.drawing.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `engineering.drawing.revised` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `engineering.rfi.answered` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `engineering.rfi.raised` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `engineering.submittal.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `engineering.submittal.status_changed` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## estimating (6)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `estimating.bid.decided` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `estimating.tender.awarded` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `estimating.tender.lost` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `estimating.tender.registered` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `estimating.tender.submitted` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `estimating.tender.updated` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## finance (6)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `finance.invoice.approved` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `finance.invoice.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `finance.invoice.paid` | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | `cross-module-subscriberts` |
| `finance.invoice.updated` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `finance.journal.posted` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `finance.payment.recorded` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## fleet (4)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `fleet.fuel.logged` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `fleet.maintenance.completed` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `fleet.maintenance.scheduled` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `fleet.vehicle.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## hr (4)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `hr.employee.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `hr.leave.approved` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `hr.leave.requested` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `hr.payroll.run` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## hse (3)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `hse.capa.raised` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `hse.incident.reported` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `hse.ptw.issued` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## intelligence (1)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `intelligence.insight.generated` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## inventory (5)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `inventory.grn.accepted` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `inventory.grn.created` | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | `cross-module-subscriberts` |
| `inventory.grn.inspected` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `inventory.grn.updated` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `inventory.stock.low` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## kernel (1)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `kernel.tenant.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## procurement (6)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `procurement.grn.received` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `procurement.po.approved` | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | `notifications-subscriberts` |
| `procurement.po.closed` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `procurement.po.created` | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | `cross-module-subscriberts` |
| `procurement.po.issued` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `procurement.po.updated` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## projects (7)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `projects.budget.overrun` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `projects.cost.actual` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `projects.cost.committed` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `projects.project.completed` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `projects.project.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `projects.project.started` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `projects.project.updated` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## quality (3)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `quality.ir.approved` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `quality.ncr.raised` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `quality.snag.closed` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |

## subcontracts (3)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `subcontracts.ipc.certified` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `subcontracts.retention.released` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
| `subcontracts.subcontract.created` ⦿ | `modules/amc`, `modules/assets`, `modules/contracts`, `modules/crm`, `modules/doccontrol`, `modules/engineering`, `modules/finance`, `modules/fleet`, `modules/hr`, `modules/hse`, `modules/inventory`, `modules/procurement`, `modules/projects`, `modules/quality`, `modules/site`, `modules/subcontracts`, `modules/tendering` | — |
