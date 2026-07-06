import type { Id } from '@aura/shared';

/**
 * Port owned by Finance for the data its 3-way match needs from other bounded contexts (ADR-0004:
 * Finance depends on this interface it owns, not on @aura/procurement / @aura/inventory). The app
 * layer binds an adapter over Procurement + Inventory (see apps/api/src/wiring). The *business rule*
 * (invoice.value must not exceed PO value or received-GRN value) stays in Finance; only the data
 * fetch is delegated. This removes the compile/import coupling; it is still a synchronous read
 * (runtime coupling) — replacing that with an event-fed projection is a separate, deliberate
 * consistency tradeoff, not required to satisfy the module-boundary rule.
 */
export interface PoMatchSnapshot {
  poExists: boolean;
  /** ordered PO value (0 when the PO is absent). */
  poValue: number;
  /** sum of received GRN values against the PO (0 when none). */
  receivedValue: number;
}

export interface PoMatchPort {
  getSnapshot(tenantId: Id, poId: Id): Promise<PoMatchSnapshot>;
}

export const PO_MATCH_PORT = Symbol('PO_MATCH_PORT');
