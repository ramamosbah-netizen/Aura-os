import { Inject, Injectable, Logger } from '@nestjs/common';
import { QUANTITY_LEDGER_STORE, type QuantityLedgerFilter, type QuantityLedgerStore } from './quantity-ledger-store';
import {
  type QuantityTransaction,
  type NewQuantityTransaction,
  type QuantityPosition,
  makeQuantityTransaction,
  quantityPosition,
} from './domain/quantity-transaction';

/**
 * The Project Quantity Ledger (the physical twin of the Cost Ledger). Modules post a
 * QuantityTransaction here instead of mutating a BOQ item's live quantities: the entry is appended
 * to the append-only ledger (the source of truth + the "show transactions" drill-down), and a BOQ
 * item's position (ordered/received/issued/installed/approved/invoiced vs the BOQ target) is
 * SUM(this). A return-to-store, a rejected delivery or a reversal is simply a negative post.
 */
@Injectable()
export class QuantityLedgerService {
  private readonly logger = new Logger('QuantityLedger');

  constructor(@Inject(QUANTITY_LEDGER_STORE) private readonly store: QuantityLedgerStore) {}

  /** Post a quantity transaction to a BOQ item's ledger. Idempotent when `input.dedupeKey` is set —
   * a replayed post returns the first transaction and writes nothing, so an event the outbox
   * re-delivers cannot double-count the position. */
  async post(input: NewQuantityTransaction): Promise<QuantityTransaction> {
    const txn = makeQuantityTransaction(input);
    const { txn: stored, inserted } = await this.store.append(txn);
    if (!inserted) {
      this.logger.log(`↩ qty txn dedupe [${stored.dedupeKey}] — already posted (${stored.id}), position unchanged`);
      return stored;
    }
    this.logger.log(`📏 ${stored.type} ${stored.quantity}${stored.unit ? ' ' + stored.unit : ''} → BOQ ${stored.boqItemId} [${stored.source} ${stored.sourceRef ?? ''}]`);
    return stored;
  }

  /** Set/adjust a BOQ item's target quantity — the baseline the position is measured against. */
  async setBaseline(input: { tenantId: string; companyId?: string | null; projectId: string; boqItemId: string; quantity: number; unit?: string | null; cbsNodeId?: string | null; sourceRef?: string | null; createdBy?: string | null }): Promise<QuantityTransaction> {
    return this.post({
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      projectId: input.projectId,
      boqItemId: input.boqItemId,
      cbsNodeId: input.cbsNodeId ?? null,
      type: 'boq',
      quantity: input.quantity,
      unit: input.unit ?? null,
      source: 'boq_baseline',
      sourceRef: input.sourceRef ?? null,
      createdBy: input.createdBy ?? null,
    });
  }

  /** The ledger for a project or a single BOQ item — the audit trail behind every quantity. */
  list(filter: QuantityLedgerFilter): Promise<QuantityTransaction[]> {
    return this.store.list(filter);
  }

  /** The live position of one BOQ item (the seven positions + derived gaps), from its ledger. */
  async position(tenantId: string, boqItemId: string): Promise<QuantityPosition> {
    const txns = await this.store.list({ tenantId, boqItemId });
    return quantityPosition(boqItemId, txns);
  }
}
