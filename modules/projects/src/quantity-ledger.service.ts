import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { QUANTITY_LEDGER_STORE, type QuantityLedgerFilter, type QuantityLedgerStore } from './quantity-ledger-store';
import {
  type QuantityTransaction,
  type NewQuantityTransaction,
  type QuantityPosition,
  makeQuantityTransaction,
  quantityPosition,
} from './domain/quantity-transaction';
import type { DeliveryItemMap } from './domain/delivery-item-map';
import { DeliveryItemMapService } from './delivery-item-map.service';

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

  constructor(
    @Inject(QUANTITY_LEDGER_STORE) private readonly store: QuantityLedgerStore,
    @Optional() @Inject(DeliveryItemMapService) private readonly deliveryItemMaps?: DeliveryItemMapService,
  ) {}

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

  /**
   * Post the immutable contractual SOLD fact from a validated B2 handover mapping.
   * The existing `boq` bucket is retained for compatibility; `semantic=sold` in dimensions is
   * what separates this fact from legacy/manual BOQ transactions without a second ledger.
   */
  async postSold(input: {
    mapping: DeliveryItemMap;
    soldQuantity: number | null;
    unit?: string | null;
    companyId?: string | null;
    createdBy?: string | null;
    occurredAt?: string;
  }): Promise<QuantityTransaction | null> {
    if (!this.deliveryItemMaps) throw new Error('DeliveryItemMapService is required for SOLD posting');
    const frozen = await this.deliveryItemMaps.validate(input.mapping);
    if (input.soldQuantity === null || input.soldQuantity === undefined || !Number.isFinite(input.soldQuantity)) {
      return null; // UNKNOWN is represented by no transaction, never by a fabricated zero.
    }
    const itemKey = input.mapping.sourceItemId ?? input.mapping.frozenItemKey;
    const sourceRef = `handover:${input.mapping.handoverId}:item:${input.mapping.frozenItemKey}`;
    const dimensions: Record<string, string> = {
      semantic: 'sold',
      frozenItemKey: input.mapping.frozenItemKey,
      handoverId: input.mapping.handoverId,
      sourceKind: input.mapping.sourceKind,
    };
    if (input.mapping.sourceRevisionRef) dimensions.sourceRevisionRef = input.mapping.sourceRevisionRef;
    if (input.mapping.sourceItemId) dimensions.sourceItemId = input.mapping.sourceItemId;
    // The item is re-read from the immutable snapshot after validation. Caller-supplied quantity
    // and unit must agree with the frozen evidence; no mutable BOQ/quotation lookup is performed.
    if (frozen.soldQuantity !== input.soldQuantity) throw new Error('SOLD quantity does not match frozen item evidence');
    if ((frozen.unit ?? null) !== (input.unit ?? null)) throw new Error('SOLD unit does not match frozen item evidence');
    return this.post({
      tenantId: input.mapping.tenantId,
      companyId: input.companyId ?? null,
      projectId: input.mapping.projectId,
      boqItemId: itemKey,
      cbsNodeId: input.mapping.cbsNodeId,
      type: 'boq',
      quantity: input.soldQuantity,
      unit: input.unit ?? null,
      source: 'boq_baseline',
      sourceRef,
      dimensions,
      semantic: 'sold',
      dedupeKey: `sold:${input.mapping.projectId}:${input.mapping.handoverId}:${input.mapping.frozenItemKey}`,
      occurredAt: input.occurredAt,
      createdBy: input.createdBy ?? null,
    });
  }

  /**
   * Post the physical execution fact produced by a governed site installation.
   *
   * Unlike the low-level `post()` compatibility escape hatch, this boundary requires the
   * installation item to resolve to exactly one immutable DeliveryItemMap.  The map is validated
   * against the B1 handover snapshot before the ledger key is chosen, so a later Tender/BOQ edit
   * cannot change which frozen item receives the installed quantity.
   */
  async postInstalled(input: {
    tenantId: string;
    projectId: string;
    installationId: string;
    /** Event compatibility field. For Direct this is the synthetic frozen item key. */
    boqItemId?: string | null;
    frozenItemKey?: string | null;
    cbsNodeId?: string | null;
    quantity: number | null;
    unit?: string | null;
    occurredAt?: string;
    companyId?: string | null;
    createdBy?: string | null;
  }): Promise<QuantityTransaction | null> {
    if (!this.deliveryItemMaps) throw new Error('DeliveryItemMapService is required for installed posting');
    if (!input.installationId?.trim() || !input.projectId?.trim()) {
      throw new Error('installed quantity requires installation and project identity');
    }
    if (input.quantity === null || input.quantity === undefined || !Number.isFinite(input.quantity) || input.quantity <= 0) {
      return null; // unavailable/invalid execution evidence remains UNKNOWN; never fabricate zero.
    }

    const requestedItem = input.frozenItemKey?.trim() || input.boqItemId?.trim() || null;
    if (!requestedItem) throw new Error('installed quantity requires frozen item identity');

    // Resolve membership from immutable maps only. The source item may be a real Tender BOQ id or
    // the synthetic Direct frozenItemKey; neither case requires consulting mutable Sales state.
    const candidates = (await this.deliveryItemMaps.list({ tenantId: input.tenantId, projectId: input.projectId }))
      .filter((mapping) => mapping.frozenItemKey === requestedItem || mapping.sourceItemId === requestedItem);
    if (candidates.length !== 1) {
      throw new Error(`installed quantity ${input.installationId} does not resolve to exactly one frozen delivery mapping`);
    }
    const mapping = candidates[0];
    const frozen = await this.deliveryItemMaps.validate(mapping);
    const frozenItemId = mapping.sourceItemId ?? mapping.frozenItemKey;
    if (input.boqItemId && input.boqItemId !== frozenItemId && input.boqItemId !== mapping.frozenItemKey) {
      throw new Error(`installed quantity ${input.installationId} source item does not match frozen mapping`);
    }
    if (input.frozenItemKey && input.frozenItemKey !== mapping.frozenItemKey) {
      throw new Error(`installed quantity ${input.installationId} frozen item does not match mapping`);
    }
    if (input.cbsNodeId !== undefined && (input.cbsNodeId ?? null) !== mapping.cbsNodeId) {
      throw new Error(`installed quantity ${input.installationId} CBS node does not match frozen mapping`);
    }
    if (!frozen.unit || !input.unit) {
      throw new Error(`installed quantity ${input.installationId} unit evidence is unavailable`);
    }
    if (frozen.unit !== input.unit) {
      throw new Error(`installed quantity ${input.installationId} unit does not match frozen item evidence`);
    }

    const dedupeKey = `installed:${input.installationId}`;
    const sourceRef = `installation:${input.installationId}`;
    const dimensions: Record<string, string> = {
      installationId: input.installationId,
      frozenItemKey: mapping.frozenItemKey,
      handoverId: mapping.handoverId,
      sourceKind: mapping.sourceKind,
      executionSemantic: 'executed',
    };
    if (mapping.sourceRevisionRef) dimensions.sourceRevisionRef = mapping.sourceRevisionRef;
    if (mapping.sourceId) dimensions.sourceId = mapping.sourceId;
    if (mapping.sourceItemId) dimensions.sourceItemId = mapping.sourceItemId;

    const existing = (await this.store.list({ tenantId: input.tenantId, projectId: input.projectId }))
      .find((row) => row.dedupeKey === dedupeKey);
    if (existing) {
      if (existing.quantity !== input.quantity || existing.unit !== (input.unit ?? frozen.unit ?? null)
        || existing.sourceRef !== sourceRef || existing.boqItemId !== frozenItemId || existing.cbsNodeId !== mapping.cbsNodeId) {
        throw new Error(`conflicting installed replay for ${dedupeKey}`);
      }
      return existing;
    }

    const stored = await this.post({
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      projectId: input.projectId,
      boqItemId: frozenItemId,
      cbsNodeId: mapping.cbsNodeId,
      type: 'installed',
      quantity: input.quantity,
      unit: input.unit ?? frozen.unit ?? null,
      source: 'installation',
      sourceRef,
      dimensions,
      dedupeKey,
      occurredAt: input.occurredAt,
      createdBy: input.createdBy ?? null,
    });
    if (stored.quantity !== input.quantity || stored.sourceRef !== sourceRef
      || stored.boqItemId !== frozenItemId || stored.cbsNodeId !== mapping.cbsNodeId) {
      throw new Error(`conflicting installed replay for ${dedupeKey}`);
    }
    return stored;
  }

  /**
   * Post an authoritative client-certified quantity from one governed IPC line.
   * The existing `invoiced` bucket is retained for compatibility; semantic=certified in the
   * dimensions JSON distinguishes this fact from legacy/manual invoiced rows and future billing.
   */
  async postCertified(input: {
    tenantId: string;
    contractId: string;
    certificateId: string;
    ipcLineId: string;
    projectId: string;
    boqItemId: string;
    quantity: number | null;
    unit?: string | null;
    certifiedAt?: string;
    companyId?: string | null;
    createdBy?: string | null;
  }): Promise<QuantityTransaction | null> {
    if (!this.deliveryItemMaps) throw new Error('DeliveryItemMapService is required for Certified posting');
    if (input.quantity === null || input.quantity === undefined || !Number.isFinite(input.quantity) || input.quantity <= 0) {
      return null; // unavailable/invalid line evidence remains UNKNOWN; never fabricate zero.
    }
    if (!input.ipcLineId || !input.certificateId || !input.contractId || !input.projectId || !input.boqItemId) {
      throw new Error('certified line identity is incomplete');
    }

    // The IPC event carries the durable line id and its source item key. Resolve membership only
    // from the immutable B2 maps; never consult a mutable Tender/CRM aggregate or latest BOQ.
    const candidates = (await this.deliveryItemMaps.list({ tenantId: input.tenantId, projectId: input.projectId }))
      .filter((m) => m.frozenItemKey === input.boqItemId || m.sourceItemId === input.boqItemId);
    if (candidates.length !== 1) {
      throw new Error(`certified line ${input.ipcLineId} does not resolve to exactly one frozen delivery mapping`);
    }
    const mapping = candidates[0];
    const frozen = await this.deliveryItemMaps.validate(mapping, input.contractId);
    const frozenItemId = mapping.sourceItemId ?? mapping.frozenItemKey;
    if (frozenItemId !== input.boqItemId) {
      throw new Error(`certified line ${input.ipcLineId} source item does not match frozen mapping`);
    }
    if (frozen.unit === null || frozen.unit === undefined || !input.unit || frozen.unit !== input.unit) {
      throw new Error(`certified line ${input.ipcLineId} unit evidence is unavailable or does not match the frozen item`);
    }

    const dedupeKey = `certified:${input.certificateId}:${input.ipcLineId}`;
    const sourceRef = `ipc:${input.certificateId}:line:${input.ipcLineId}`;
    const dimensions: Record<string, string> = {
      semantic: 'certified',
      certificateId: input.certificateId,
      ipcLineId: input.ipcLineId,
      frozenItemKey: mapping.frozenItemKey,
      handoverId: mapping.handoverId,
      sourceKind: mapping.sourceKind,
    };
    if (mapping.sourceRevisionRef) dimensions.sourceRevisionRef = mapping.sourceRevisionRef;
    if (mapping.sourceId) dimensions.sourceId = mapping.sourceId;
    if (mapping.sourceItemId) dimensions.sourceItemId = mapping.sourceItemId;

    // Check a keyed replay before append so a malformed/conflicting redelivery cannot be treated
    // as a silent no-op. The post-append check closes the small race with a concurrent writer.
    const existing = (await this.store.list({ tenantId: input.tenantId, projectId: input.projectId }))
      .find((row) => row.dedupeKey === dedupeKey);
    if (existing) {
      if (existing.quantity !== input.quantity || existing.unit !== input.unit || existing.sourceRef !== sourceRef || existing.boqItemId !== frozenItemId) {
        throw new Error(`conflicting Certified replay for ${dedupeKey}`);
      }
      return existing;
    }

    const stored = await this.post({
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      projectId: input.projectId,
      boqItemId: frozenItemId,
      cbsNodeId: mapping.cbsNodeId,
      type: 'invoiced',
      quantity: input.quantity,
      unit: input.unit,
      source: 'ipc',
      sourceRef,
      dimensions,
      semantic: 'certified',
      dedupeKey,
      occurredAt: input.certifiedAt,
      createdBy: input.createdBy ?? null,
    });
    if (stored.quantity !== input.quantity || stored.unit !== input.unit || stored.sourceRef !== sourceRef || stored.boqItemId !== frozenItemId) {
      throw new Error(`conflicting Certified replay for ${dedupeKey}`);
    }
    return stored;
  }

  /**
   * Post an authoritative Billed quantity from an ISSUED customer AR invoice line.
   * Draft invoices and receipts never call this path. Item-level lineage is mandatory; a line
   * without a frozen item identity remains UNKNOWN and is deliberately not projected.
   */
  async postBilled(input: {
    tenantId: string;
    invoiceId: string;
    invoiceLineId: string;
    projectId: string;
    contractId?: string | null;
    frozenItemKey: string;
    boqItemId?: string | null;
    sourceIpcId?: string | null;
    sourceIpcLineId?: string | null;
    quantity: number | null;
    unit?: string | null;
    billedNet?: number | null;
    issuedAt?: string;
    companyId?: string | null;
    createdBy?: string | null;
  }): Promise<QuantityTransaction | null> {
    if (!this.deliveryItemMaps) throw new Error('DeliveryItemMapService is required for Billed posting');
    if (input.quantity === null || input.quantity === undefined || !Number.isFinite(input.quantity) || input.quantity <= 0) {
      return null; // UNKNOWN is not fabricated as zero.
    }
    if (!input.invoiceId || !input.invoiceLineId || !input.projectId || !input.frozenItemKey || !input.unit) {
      throw new Error('billed line identity is incomplete');
    }

    const candidates = (await this.deliveryItemMaps.list({ tenantId: input.tenantId, projectId: input.projectId }))
      .filter((m) => m.frozenItemKey === input.frozenItemKey);
    if (candidates.length !== 1) {
      throw new Error(`billed line ${input.invoiceLineId} does not resolve to exactly one frozen delivery mapping`);
    }
    const mapping = candidates[0];
    const frozen = await this.deliveryItemMaps.validate(mapping, input.contractId ?? undefined);
    const frozenItemId = mapping.sourceItemId ?? mapping.frozenItemKey;
    if (input.boqItemId !== undefined && input.boqItemId !== null && input.boqItemId !== frozenItemId) {
      throw new Error(`billed line ${input.invoiceLineId} source item does not match frozen mapping`);
    }
    if (frozen.unit === null || frozen.unit === undefined || frozen.unit !== input.unit) {
      throw new Error(`billed line ${input.invoiceLineId} unit evidence is unavailable or does not match the frozen item`);
    }

    const dedupeKey = `billed:${input.invoiceId}:${input.invoiceLineId}`;
    const sourceRef = `customer-invoice:${input.invoiceId}:line:${input.invoiceLineId}`;
    const dimensions: Record<string, string> = {
      semantic: 'billed',
      invoiceId: input.invoiceId,
      invoiceLineId: input.invoiceLineId,
      frozenItemKey: mapping.frozenItemKey,
      handoverId: mapping.handoverId,
      sourceKind: mapping.sourceKind,
    };
    if (input.contractId) dimensions.contractId = input.contractId;
    if (input.sourceIpcId) dimensions.sourceIpcId = input.sourceIpcId;
    if (input.sourceIpcLineId) dimensions.sourceIpcLineId = input.sourceIpcLineId;
    if (input.billedNet !== null && input.billedNet !== undefined && Number.isFinite(input.billedNet)) {
      dimensions.billedNet = String(input.billedNet);
    }
    if (mapping.sourceRevisionRef) dimensions.sourceRevisionRef = mapping.sourceRevisionRef;
    if (mapping.sourceId) dimensions.sourceId = mapping.sourceId;
    if (mapping.sourceItemId) dimensions.sourceItemId = mapping.sourceItemId;

    const existing = (await this.store.list({ tenantId: input.tenantId, projectId: input.projectId }))
      .find((row) => row.dedupeKey === dedupeKey);
    if (existing) {
      if (existing.quantity !== input.quantity || existing.unit !== input.unit || existing.sourceRef !== sourceRef || existing.boqItemId !== frozenItemId) {
        throw new Error(`conflicting Billed replay for ${dedupeKey}`);
      }
      return existing;
    }

    const stored = await this.post({
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      projectId: input.projectId,
      boqItemId: frozenItemId,
      cbsNodeId: mapping.cbsNodeId,
      type: 'invoiced',
      quantity: input.quantity,
      unit: input.unit,
      source: 'customer_invoice',
      sourceRef,
      dimensions,
      semantic: 'billed',
      dedupeKey,
      occurredAt: input.issuedAt,
      createdBy: input.createdBy ?? null,
    });
    if (stored.quantity !== input.quantity || stored.unit !== input.unit || stored.sourceRef !== sourceRef || stored.boqItemId !== frozenItemId) {
      throw new Error(`conflicting Billed replay for ${dedupeKey}`);
    }
    return stored;
  }

  /** Append an auditable negative Billed fact when an issued invoice is governedly cancelled. */
  async reverseBilled(input: {
    tenantId: string;
    invoiceId: string;
    invoiceLineId: string;
    projectId: string;
    contractId?: string | null;
    frozenItemKey: string;
    boqItemId?: string | null;
    sourceIpcId?: string | null;
    sourceIpcLineId?: string | null;
    quantity: number | null;
    unit?: string | null;
    billedNet?: number | null;
    cancelledAt?: string;
    companyId?: string | null;
    createdBy?: string | null;
  }): Promise<QuantityTransaction | null> {
    const reversalKey = `billed-cancellation:${input.invoiceId}:${input.invoiceLineId}`;
    const rows = await this.store.list({ tenantId: input.tenantId, projectId: input.projectId });
    const original = rows.find((row) => row.dedupeKey === `billed:${input.invoiceId}:${input.invoiceLineId}`);
    if (!original) return null; // no item-level Billed fact exists (UNKNOWN), so cancellation adds nothing.
    if (original.semantic !== 'billed') throw new Error(`invoice line ${input.invoiceLineId} is not a Billed fact`);
    if (input.quantity !== null && input.quantity !== undefined && input.quantity !== original.quantity) {
      throw new Error(`conflicting Billed cancellation for ${input.invoiceId}:${input.invoiceLineId}`);
    }
    if (input.unit !== undefined && input.unit !== null && input.unit !== original.unit) {
      throw new Error(`conflicting Billed cancellation for ${input.invoiceId}:${input.invoiceLineId}`);
    }
    // Re-run the immutable mapping validation without inserting a second positive fact.
    await this.postBilled({ ...input, quantity: original.quantity, unit: original.unit });
    const existing = rows
      .find((row) => row.dedupeKey === reversalKey);
    if (existing) {
      if (existing.quantity !== -original.quantity || existing.boqItemId !== original.boqItemId) {
        throw new Error(`conflicting Billed cancellation replay for ${reversalKey}`);
      }
      return existing;
    }
    return this.post({
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      projectId: input.projectId,
      boqItemId: original.boqItemId,
      cbsNodeId: original.cbsNodeId,
      type: 'invoiced',
      quantity: -original.quantity,
      unit: original.unit,
      source: 'adjustment',
      sourceRef: `customer-invoice-cancellation:${input.invoiceId}:line:${input.invoiceLineId}`,
      dimensions: {
        semantic: 'billed',
        invoiceId: input.invoiceId,
        invoiceLineId: input.invoiceLineId,
        originalBilledDedupeKey: original.dedupeKey ?? '',
        frozenItemKey: input.frozenItemKey,
        ...(input.contractId ? { contractId: input.contractId } : {}),
      },
      semantic: 'billed',
      dedupeKey: reversalKey,
      occurredAt: input.cancelledAt,
      createdBy: input.createdBy ?? null,
    });
  }

  /**
   * Append a governed correction to one immutable Certified fact. The original IPC transaction is
   * never edited or deleted; a signed delta (negative for a reversal) is appended to the same
   * certified position and carries the original line identity for audit/rebuild.
   */
  async correctCertified(input: {
    tenantId: string;
    projectId: string;
    contractId: string;
    certificateId: string;
    ipcLineId: string;
    correctionId: string;
    signedQuantityDelta: number;
    reason: string;
    actorId: string;
    unit?: string | null;
    occurredAt?: string;
    companyId?: string | null;
    createdBy?: string | null;
  }): Promise<QuantityTransaction> {
    if (!this.deliveryItemMaps) throw new Error('DeliveryItemMapService is required for Certified corrections');
    if (!input.correctionId?.trim() || !input.reason?.trim() || !input.actorId?.trim()) {
      throw new Error('Certified correction requires correctionId, reason and actor');
    }
    if (!Number.isFinite(input.signedQuantityDelta) || input.signedQuantityDelta === 0) {
      throw new Error('Certified correction delta must be a non-zero finite quantity');
    }

    const rows = await this.store.list({ tenantId: input.tenantId, projectId: input.projectId });
    const original = rows.find((row) => row.type === 'invoiced'
      && row.semantic === 'certified'
      && row.dimensions?.certificateId === input.certificateId
      && row.dimensions?.ipcLineId === input.ipcLineId
      && row.quantity > 0);
    if (!original) throw new Error(`Certified source ${input.certificateId}/${input.ipcLineId} is unavailable`);

    const frozenItemKey = original.dimensions?.frozenItemKey;
    if (!frozenItemKey) throw new Error('Certified source is missing frozen item identity');
    const mappings = (await this.deliveryItemMaps.list({ tenantId: input.tenantId, projectId: input.projectId }))
      .filter((mapping) => mapping.frozenItemKey === frozenItemKey);
    if (mappings.length !== 1) throw new Error(`Certified correction ${input.correctionId} does not resolve to exactly one frozen delivery mapping`);
    const mapping = mappings[0];
    const frozen = await this.deliveryItemMaps.validate(mapping, input.contractId);
    if ((frozen.unit ?? null) !== (input.unit ?? original.unit ?? null)) {
      throw new Error('Certified correction unit does not match frozen item evidence');
    }

    const dedupeKey = `certified-correction:${input.ipcLineId}:${input.correctionId}`;
    const sourceRef = `ipc-correction:${input.certificateId}:line:${input.ipcLineId}:correction:${input.correctionId}`;
    const dimensions: Record<string, string> = {
      semantic: 'certified',
      correctionId: input.correctionId,
      originalCertificateId: input.certificateId,
      originalIpcLineId: input.ipcLineId,
      signedQuantityDelta: String(input.signedQuantityDelta),
      reason: input.reason.trim(),
      actorId: input.actorId.trim(),
      frozenItemKey,
      handoverId: mapping.handoverId,
      sourceKind: mapping.sourceKind,
    };
    if (mapping.sourceRevisionRef) dimensions.sourceRevisionRef = mapping.sourceRevisionRef;
    if (mapping.sourceItemId) dimensions.sourceItemId = mapping.sourceItemId;

    const existing = rows.find((row) => row.dedupeKey === dedupeKey);
    if (existing) {
      const same = existing.quantity === input.signedQuantityDelta
        && existing.sourceRef === sourceRef
        && existing.dimensions?.reason === dimensions.reason
        && existing.dimensions?.actorId === dimensions.actorId;
      if (!same) throw new Error(`conflicting Certified correction replay for ${dedupeKey}`);
      return existing;
    }

    const effective = rows
      .filter((row) => row.type === 'invoiced' && row.semantic === 'certified' && row.boqItemId === original.boqItemId)
      .reduce((sum, row) => sum + row.quantity, 0) + input.signedQuantityDelta;
    if (effective < 0) throw new Error('Certified correction would produce a negative effective quantity');

    const stored = await this.post({
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      projectId: input.projectId,
      boqItemId: original.boqItemId,
      cbsNodeId: mapping.cbsNodeId,
      type: 'invoiced',
      quantity: input.signedQuantityDelta,
      unit: input.unit ?? original.unit,
      source: 'adjustment',
      sourceRef,
      dimensions,
      semantic: 'certified',
      dedupeKey,
      occurredAt: input.occurredAt,
      createdBy: input.createdBy ?? input.actorId,
    });
    if (stored.quantity !== input.signedQuantityDelta || stored.sourceRef !== sourceRef
      || stored.dimensions?.reason !== dimensions.reason || stored.dimensions?.actorId !== dimensions.actorId) {
      throw new Error(`conflicting Certified correction replay for ${dedupeKey}`);
    }
    return stored;
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
