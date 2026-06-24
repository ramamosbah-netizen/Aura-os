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
  { type: 'kernel.tenant.created', module: 'kernel', description: 'A tenant was provisioned', severity: 'INFO' },
  { type: 'estimating.tender.registered', module: 'estimating', description: 'Tender registered', severity: 'INFO' },
  { type: 'estimating.bid.decided', module: 'estimating', description: 'Bid / no-bid decided', severity: 'ACTION_REQUIRED' },
  { type: 'procurement.po.approved', module: 'procurement', description: 'Purchase order approved', severity: 'INFO' },
  { type: 'procurement.grn.received', module: 'procurement', description: 'Goods received against a PO', severity: 'INFO' },
  { type: 'subcontracts.ipc.certified', module: 'subcontracts', description: 'Interim payment certificate certified', severity: 'INFO' },
  { type: 'inventory.stock.low', module: 'inventory', description: 'Stock below reorder level', severity: 'ACTION_REQUIRED' },
  { type: 'finance.invoice.created', module: 'finance', description: 'AP/AR invoice created', severity: 'INFO' },
  { type: 'projects.budget.overrun', module: 'projects', description: 'Project cost over budget', severity: 'CRITICAL' },
  { type: 'hse.incident.reported', module: 'hse', description: 'HSE incident reported', severity: 'CRITICAL' },
  { type: 'quality.ncr.raised', module: 'quality', description: 'Non-conformance raised', severity: 'ACTION_REQUIRED' },
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
