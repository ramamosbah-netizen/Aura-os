# Volume 11A — Event Flow Reference

[← Volume 11](vol-11-workflow-catalog.md) · [← Master index](README.md)

Generated on 2026-07-06 from `shared/src/events/catalog.ts`
(catalog), `modules/*` + `apps/api/src` (emit sites), and `apps/api/src/events`
(subscribers). Regenerate: `node docs/master-report/tools/gen-events.mjs <repo-root>`.

**72 catalogued events** across 17 contexts. "Emitters" are files
that reference the event literal at a write site; "Consumers" are reactor/subscriber files that
react to it. An event with no consumer is a **projection/webhook-only** signal (available to external subscribers, not yet driving an internal reactor) — these are candidates for future automation, flagged ⦿. **6 of 72** events currently drive an internal reactor.


## assets (3)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `assets.inspection.recorded` ⦿ | `modules/assets` | — |
| `assets.maintenance.completed` ⦿ | `modules/assets` | — |
| `assets.maintenance.scheduled` ⦿ | `modules/assets` | — |

## contracts (4)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `contracts.contract.completed` ⦿ | `modules/contracts` | — |
| `contracts.contract.created` ⦿ | `modules/contracts` | — |
| `contracts.contract.signed` | `modules/contracts` | `cross-module-subscriber.ts` |
| `contracts.contract.updated` ⦿ | `modules/contracts` | — |

## crm (8)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `crm.account.created` ⦿ | `modules/crm` | — |
| `crm.account.status_changed` ⦿ | `modules/crm` | — |
| `crm.account.updated` ⦿ | `modules/crm` | — |
| `crm.lead.created` ⦿ | — | — |
| `crm.lead.updated` ⦿ | — | — |
| `crm.opportunity.created` ⦿ | — | — |
| `crm.opportunity.stage_changed` | — | `cross-module-subscriber.ts` |
| `crm.opportunity.updated` ⦿ | — | — |

## doccontrol (2)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `doccontrol.correspondence.logged` ⦿ | `modules/doccontrol` | — |
| `doccontrol.transmittal.sent` ⦿ | `modules/doccontrol` | — |

## engineering (6)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `engineering.drawing.created` ⦿ | `modules/engineering` | — |
| `engineering.drawing.revised` ⦿ | `modules/engineering` | — |
| `engineering.rfi.answered` ⦿ | `modules/engineering` | — |
| `engineering.rfi.raised` ⦿ | `modules/engineering` | — |
| `engineering.submittal.created` ⦿ | `modules/engineering` | — |
| `engineering.submittal.status_changed` ⦿ | `modules/engineering` | — |

## estimating (6)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `estimating.bid.decided` ⦿ | — | — |
| `estimating.tender.awarded` ⦿ | — | — |
| `estimating.tender.lost` ⦿ | — | — |
| `estimating.tender.registered` ⦿ | — | — |
| `estimating.tender.submitted` ⦿ | — | — |
| `estimating.tender.updated` ⦿ | — | — |

## finance (6)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `finance.invoice.approved` ⦿ | `modules/finance` | — |
| `finance.invoice.created` ⦿ | `modules/finance` | — |
| `finance.invoice.paid` | `modules/finance` | `cross-module-subscriber.ts` |
| `finance.invoice.updated` ⦿ | `modules/finance` | — |
| `finance.journal.posted` ⦿ | `modules/finance` | — |
| `finance.payment.recorded` ⦿ | `modules/finance` | — |

## fleet (4)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `fleet.fuel.logged` ⦿ | `modules/fleet` | — |
| `fleet.maintenance.completed` ⦿ | `modules/fleet` | — |
| `fleet.maintenance.scheduled` ⦿ | `modules/fleet` | — |
| `fleet.vehicle.created` ⦿ | `modules/fleet` | — |

## hr (4)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `hr.employee.created` ⦿ | `modules/hr` | — |
| `hr.leave.approved` ⦿ | `modules/hr` | — |
| `hr.leave.requested` ⦿ | `modules/hr` | — |
| `hr.payroll.run` ⦿ | `modules/hr` | — |

## hse (3)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `hse.capa.raised` ⦿ | `modules/hse` | — |
| `hse.incident.reported` ⦿ | `modules/hse` | — |
| `hse.ptw.issued` ⦿ | `modules/hse` | — |

## intelligence (1)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `intelligence.insight.generated` ⦿ | — | — |

## inventory (5)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `inventory.grn.accepted` ⦿ | `modules/inventory` | — |
| `inventory.grn.created` | `modules/inventory` | `cross-module-subscriber.ts` |
| `inventory.grn.inspected` ⦿ | `modules/inventory` | — |
| `inventory.grn.updated` ⦿ | `modules/inventory` | — |
| `inventory.stock.low` ⦿ | `modules/inventory` | — |

## kernel (1)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `kernel.tenant.created` ⦿ | — | — |

## procurement (6)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `procurement.grn.received` ⦿ | — | — |
| `procurement.po.approved` | `modules/procurement` | `notifications-subscriber.ts` |
| `procurement.po.closed` ⦿ | `modules/procurement` | — |
| `procurement.po.created` | `modules/procurement` | `cross-module-subscriber.ts` |
| `procurement.po.issued` ⦿ | `modules/procurement` | — |
| `procurement.po.updated` ⦿ | `modules/procurement` | — |

## projects (7)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `projects.budget.overrun` ⦿ | `modules/projects` | — |
| `projects.cost.actual` ⦿ | `modules/projects` | — |
| `projects.cost.committed` ⦿ | `modules/projects` | — |
| `projects.project.completed` ⦿ | `modules/projects` | — |
| `projects.project.created` ⦿ | `modules/projects` | — |
| `projects.project.started` ⦿ | `modules/projects` | — |
| `projects.project.updated` ⦿ | `modules/projects` | — |

## quality (3)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `quality.ir.approved` ⦿ | `modules/quality` | — |
| `quality.ncr.raised` ⦿ | `modules/quality` | — |
| `quality.snag.closed` ⦿ | `modules/quality` | — |

## subcontracts (3)

| Event | Emitter(s) | Consumer reactor(s) |
|---|---|---|
| `subcontracts.ipc.certified` ⦿ | — | — |
| `subcontracts.retention.released` ⦿ | — | — |
| `subcontracts.subcontract.created` ⦿ | `modules/subcontracts` | — |
