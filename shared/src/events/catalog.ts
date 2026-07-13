import type { EventSeverity } from './event';

/** One segment per bounded context — the first segment of every `module.aggregate.verb`. */
export type EventModule =
  | 'crm' | 'estimating' | 'engineering' | 'projects' | 'site'
  | 'procurement' | 'subcontracts' | 'inventory' | 'finance' | 'hr'
  | 'fleet' | 'assets' | 'service' | 'hse' | 'quality' | 'doccontrol'
  | 'intelligence' | 'kernel';

export interface EventTypeDef {
  type: string;
  module: EventModule;
  description: string;
  severity: EventSeverity;
}

/**
 * Compile-time catalog (grows as modules land). The runtime registry self-heals:
 * a new `module.aggregate.verb` is auto-registered on first emit, so an unlisted
 * type never breaks a business operation.
 */
export const EVENT_CATALOG: EventTypeDef[] = [
  // ── Kernel ──────────────────────────────────────────────────────────────
  { type: 'kernel.tenant.created', module: 'kernel', description: 'A tenant was provisioned', severity: 'INFO' },

  // ── CRM ─────────────────────────────────────────────────────────────────
  { type: 'crm.account.created', module: 'crm', description: 'CRM account created', severity: 'INFO' },
  { type: 'crm.account.updated', module: 'crm', description: 'CRM account updated', severity: 'INFO' },
  { type: 'crm.account.status_changed', module: 'crm', description: 'CRM account status changed', severity: 'INFO' },
  { type: 'crm.signal.detected', module: 'crm', description: 'CRM signal detected — a pre-lead commercial possibility on the Opportunity Radar', severity: 'INFO' },
  { type: 'crm.signal.promoted', module: 'crm', description: 'CRM signal promoted to a lead (preserves source attribution)', severity: 'INFO' },
  { type: 'crm.signal.dismissed', module: 'crm', description: 'CRM signal dismissed off the radar', severity: 'INFO' },
  { type: 'crm.lead.created', module: 'crm', description: 'CRM lead captured', severity: 'INFO' },
  { type: 'crm.lead.updated', module: 'crm', description: 'CRM lead updated', severity: 'INFO' },
  { type: 'crm.lead.assigned', module: 'crm', description: 'CRM lead assigned to an owner (starts the first-response SLA)', severity: 'INFO' },
  { type: 'crm.lead.converted', module: 'crm', description: 'CRM lead converted to an opportunity (preserves lineage)', severity: 'INFO' },
  { type: 'crm.opportunity.created', module: 'crm', description: 'CRM opportunity created', severity: 'INFO' },
  { type: 'crm.opportunity.updated', module: 'crm', description: 'CRM opportunity updated', severity: 'INFO' },
  { type: 'crm.opportunity.stage_changed', module: 'crm', description: 'CRM opportunity moved to new stage — triggers deal chain', severity: 'ACTION_REQUIRED' },
  { type: 'crm.opportunity.buying_stage_changed', module: 'crm', description: 'Customer buying stage updated on a CRM opportunity', severity: 'INFO' },
  { type: 'crm.opportunity.pursuit_decided', module: 'crm', description: 'Pursue / No-Pursue decision recorded on a CRM opportunity', severity: 'INFO' },
  { type: 'crm.forecast.snapshot_captured', module: 'crm', description: 'Weighted pipeline forecast captured as an immutable snapshot', severity: 'INFO' },

  // ── Estimating / Tendering ──────────────────────────────────────────────
  { type: 'estimating.tender.registered', module: 'estimating', description: 'Tender registered', severity: 'INFO' },
  { type: 'estimating.tender.updated', module: 'estimating', description: 'Tender details updated', severity: 'INFO' },
  { type: 'estimating.tender.submitted', module: 'estimating', description: 'Tender submitted to client', severity: 'INFO' },
  { type: 'estimating.tender.awarded', module: 'estimating', description: 'Tender awarded — triggers contract creation', severity: 'ACTION_REQUIRED' },
  { type: 'estimating.tender.lost', module: 'estimating', description: 'Tender lost', severity: 'INFO' },
  { type: 'estimating.bid.decided', module: 'estimating', description: 'Bid / no-bid decided', severity: 'ACTION_REQUIRED' },

  // ── Contracts ───────────────────────────────────────────────────────────
  { type: 'contracts.contract.created', module: 'estimating', description: 'Contract created', severity: 'INFO' },
  { type: 'contracts.contract.updated', module: 'estimating', description: 'Contract updated', severity: 'INFO' },
  { type: 'contracts.contract.signed', module: 'estimating', description: 'Contract signed — triggers project creation', severity: 'ACTION_REQUIRED' },
  { type: 'contracts.contract.completed', module: 'estimating', description: 'Contract completed', severity: 'INFO' },

  // ── Projects ────────────────────────────────────────────────────────────
  { type: 'projects.project.created', module: 'projects', description: 'Project created', severity: 'INFO' },
  { type: 'projects.project.updated', module: 'projects', description: 'Project updated', severity: 'INFO' },
  { type: 'projects.project.started', module: 'projects', description: 'Project kicked off', severity: 'INFO' },
  { type: 'projects.project.completed', module: 'projects', description: 'Project completed', severity: 'INFO' },
  { type: 'projects.budget.overrun', module: 'projects', description: 'Project cost over budget', severity: 'CRITICAL' },
  { type: 'projects.cost.committed', module: 'projects', description: 'Committed cost tracked against project', severity: 'INFO' },
  { type: 'projects.cost.actual', module: 'projects', description: 'Actual cost tracked against project', severity: 'INFO' },

  // ── Procurement ─────────────────────────────────────────────────────────
  { type: 'procurement.po.created', module: 'procurement', description: 'Purchase order created', severity: 'INFO' },
  { type: 'procurement.po.updated', module: 'procurement', description: 'Purchase order updated', severity: 'INFO' },
  { type: 'procurement.po.approved', module: 'procurement', description: 'Purchase order approved — tracks committed cost', severity: 'INFO' },
  { type: 'procurement.po.issued', module: 'procurement', description: 'PO issued to supplier', severity: 'INFO' },
  { type: 'procurement.po.closed', module: 'procurement', description: 'Purchase order closed', severity: 'INFO' },
  { type: 'procurement.grn.received', module: 'procurement', description: 'Goods received against a PO', severity: 'INFO' },

  // ── Inventory ───────────────────────────────────────────────────────────
  { type: 'inventory.grn.created', module: 'inventory', description: 'Goods Received Note created', severity: 'INFO' },
  { type: 'inventory.grn.updated', module: 'inventory', description: 'GRN updated', severity: 'INFO' },
  { type: 'inventory.grn.inspected', module: 'inventory', description: 'GRN inspection completed', severity: 'INFO' },
  { type: 'inventory.grn.accepted', module: 'inventory', description: 'GRN accepted into stock — suggests AP invoice', severity: 'ACTION_REQUIRED' },
  { type: 'inventory.stock.low', module: 'inventory', description: 'Stock below reorder level', severity: 'ACTION_REQUIRED' },

  // ── Finance ─────────────────────────────────────────────────────────────
  { type: 'finance.invoice.created', module: 'finance', description: 'AP/AR invoice created', severity: 'INFO' },
  { type: 'finance.invoice.updated', module: 'finance', description: 'Invoice updated', severity: 'INFO' },
  { type: 'finance.invoice.approved', module: 'finance', description: 'Invoice approved for payment', severity: 'INFO' },
  { type: 'finance.invoice.paid', module: 'finance', description: 'Invoice paid — tracks actual cost', severity: 'INFO' },
  { type: 'finance.payment.recorded', module: 'finance', description: 'Payment recorded against an invoice', severity: 'INFO' },
  { type: 'finance.journal.posted', module: 'finance', description: 'Journal entry posted to the ledger', severity: 'INFO' },

  // ── Subcontracts ────────────────────────────────────────────────────────
  { type: 'subcontracts.subcontract.created', module: 'subcontracts', description: 'Subcontract created', severity: 'INFO' },
  { type: 'subcontracts.ipc.certified', module: 'subcontracts', description: 'Interim payment certificate certified', severity: 'INFO' },
  { type: 'subcontracts.retention.released', module: 'subcontracts', description: 'Retention released', severity: 'INFO' },

  // ── Engineering ─────────────────────────────────────────────────────────
  { type: 'engineering.drawing.created', module: 'engineering', description: 'Engineering drawing created', severity: 'INFO' },
  { type: 'engineering.drawing.revised', module: 'engineering', description: 'Engineering drawing revised', severity: 'INFO' },
  { type: 'engineering.rfi.raised', module: 'engineering', description: 'Engineering request for information (RFI) raised', severity: 'INFO' },
  { type: 'engineering.rfi.answered', module: 'engineering', description: 'Engineering RFI answered', severity: 'INFO' },
  { type: 'engineering.submittal.created', module: 'engineering', description: 'Engineering technical submittal created', severity: 'INFO' },
  { type: 'engineering.submittal.status_changed', module: 'engineering', description: 'Engineering submittal status changed', severity: 'INFO' },

  // ── Document Control ───────────────────────────────────────────────────
  { type: 'doccontrol.transmittal.sent', module: 'doccontrol', description: 'Document transmittal sent', severity: 'INFO' },
  { type: 'doccontrol.correspondence.logged', module: 'doccontrol', description: 'Correspondence logged', severity: 'INFO' },

  // ── Future modules (placeholders) ───────────────────────────────────────
  { type: 'hse.incident.reported', module: 'hse', description: 'HSE incident reported', severity: 'CRITICAL' },
  { type: 'hse.ptw.issued', module: 'hse', description: 'HSE Permit to Work issued', severity: 'INFO' },
  { type: 'hse.capa.raised', module: 'hse', description: 'HSE Corrective Action raised', severity: 'ACTION_REQUIRED' },
  { type: 'quality.ncr.raised', module: 'quality', description: 'Non-conformance raised', severity: 'ACTION_REQUIRED' },
  { type: 'quality.ir.approved', module: 'quality', description: 'Inspection Request approved', severity: 'INFO' },
  { type: 'quality.snag.closed', module: 'quality', description: 'Punch list snag closed', severity: 'INFO' },
  { type: 'hr.employee.created', module: 'hr', description: 'Employee profile created', severity: 'INFO' },
  { type: 'hr.leave.requested', module: 'hr', description: 'Leave requested by employee', severity: 'INFO' },
  { type: 'hr.leave.approved', module: 'hr', description: 'Leave request approved', severity: 'INFO' },
  { type: 'hr.payroll.run', module: 'hr', description: 'Payroll processed for period', severity: 'INFO' },
  { type: 'fleet.vehicle.created', module: 'fleet', description: 'Vehicle fleet profile registered', severity: 'INFO' },
  { type: 'fleet.fuel.logged', module: 'fleet', description: 'Vehicle fuel consumption entry logged', severity: 'INFO' },
  { type: 'fleet.maintenance.scheduled', module: 'fleet', description: 'Vehicle maintenance scheduled', severity: 'INFO' },
  { type: 'fleet.maintenance.completed', module: 'fleet', description: 'Vehicle maintenance completed', severity: 'INFO' },
  { type: 'assets.created', module: 'assets', description: 'Corporate asset profile registered', severity: 'INFO' },
  { type: 'assets.maintenance.scheduled', module: 'assets', description: 'Asset preventative maintenance scheduled', severity: 'INFO' },
  { type: 'assets.maintenance.completed', module: 'assets', description: 'Asset preventative maintenance completed', severity: 'INFO' },
  { type: 'assets.inspection.recorded', module: 'assets', description: 'Asset calibration safety inspection recorded', severity: 'INFO' },
  { type: 'intelligence.insight.generated', module: 'intelligence', description: 'AI insight produced', severity: 'INFO' },
];

const byType = new Map<string, EventTypeDef>(EVENT_CATALOG.map((e) => [e.type, e]));

export const EVENT_TYPE_NAMES: string[] = EVENT_CATALOG.map((e) => e.type);

export function eventDef(type: string): EventTypeDef | undefined {
  return byType.get(type);
}

/** Module = the segment before the first dot (used by the self-healing registry). */
export function moduleOf(type: string): string {
  return type.split('.')[0] ?? '';
}
