import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assertSameTenant, type Id } from '@aura/shared';
import { TenantContext } from '@aura/core';
import { PO_LINE_STORE, type PurchaseOrderLineStore } from './purchase-order-line-store';
import { PURCHASE_ORDER_STORE, type PurchaseOrderStore } from './purchase-order-store';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';
import {
  orderGoverningValue,
  makePurchaseOrderLine,
  mayEditOrderLines,
  nextOrderLineNo,
  type OrderProvenance,
  type OrderTotal,
  orderTotal,
  provenanceOf,
  type PurchaseOrderLine,
  type PurchaseOrderLineSource,
  renumberOrderLines,
} from './domain/purchase-order-line';
import {
  MATERIAL_CATALOGUE, type MaterialCatalogue,
  PROJECT_CODING, type ProjectCoding,
} from './purchase-request-line.service';

export interface NewOrderLineInput {
  poId: Id;
  /** An id or a code — whichever the picker or the caller had. */
  material: string;
  quantity: number;
  unitPrice: number;
  sourceType?: PurchaseOrderLineSource;
  sourcePrLineId?: Id | null;
  sourceQuoteLineId?: Id | null;
  wbsNodeId?: Id | null;
  cbsNodeId?: Id | null;
  notes?: string | null;
}

export interface OrderLineEdit {
  quantity?: number;
  unitPrice?: number;
  wbsNodeId?: Id | null;
  cbsNodeId?: Id | null;
  notes?: string | null;
}

/**
 * Purchase order lines — what is actually being bought, and how it came to be bought.
 *
 * Shares the material catalogue and project-coding ports with requisition lines, because the two
 * questions are the same: does this name a real material, and does this coding belong to the
 * project the document is for.
 */
@Injectable()
export class PurchaseOrderLineService {
  private readonly logger = new Logger('Procurement');

  constructor(
    @Inject(PO_LINE_STORE) private readonly lines: PurchaseOrderLineStore,
    @Inject(PURCHASE_ORDER_STORE) private readonly orders: PurchaseOrderStore,
    @Inject(MATERIAL_CATALOGUE) private readonly catalogue: MaterialCatalogue,
    @Optional() @Inject(PR_LINE_STORE) private readonly requestLines: PurchaseRequestLineStore | null = null,
    @Optional() @Inject(PROJECT_CODING) private readonly coding: ProjectCoding | null = null,
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  private tenantId(): string | undefined {
    return this.tenant?.boundTenantId() ?? undefined;
  }

  private async order(poId: Id) {
    return assertSameTenant(await this.orders.get(poId), this.tenantId(), 'purchase order', poId);
  }

  private assertDraft(status: string): void {
    const verdict = mayEditOrderLines(status);
    if (!verdict.allowed) throw new Error(verdict.reason);
  }

  /** Canonical coding belongs to the ORDER's own project. An absent authority refuses. */
  private async assertCoding(
    projectId: string | null, nodeId: Id | null | undefined, kind: 'wbs' | 'cbs',
  ): Promise<void> {
    if (!nodeId) return;
    const label = kind === 'wbs' ? 'WBS' : 'cost';
    if (!projectId) throw new Error(`a ${label} node requires the order to belong to a project first`);
    if (!this.coding) {
      throw new Error(`cannot verify the ${label} node belongs to this project — the project coding authority is unavailable`);
    }
    const ok = await this.coding.nodeBelongsToProject(this.tenantId() ?? '', projectId, nodeId, kind);
    if (!ok) throw new Error(`${label} node ${nodeId} does not belong to this order's project`);
  }

  /**
   * A cited requisition line must exist, and must belong to this tenant.
   *
   * Checked rather than trusted for the same reason the material is: a lineage nobody resolves is
   * not a lineage, it is a note that looks like one.
   */
  private async assertRequestLine(prLineId: Id): Promise<void> {
    if (!this.requestLines) {
      throw new Error('cannot verify the requisition line this order answers — the requisition line store is unavailable');
    }
    const line = await this.requestLines.find(prLineId, this.tenantId() ?? '');
    if (!line) throw new Error(`requisition line ${prLineId} not found`);
  }

  /**
   * Keep the persisted header value in step with the lines.
   *
   * Once an order has lines the header is no longer an independent figure: there must not be two
   * totals that can disagree, and the lines are the ones anybody can check. Unlike a requisition
   * there is no incomplete state to represent — a line without a price cannot exist — so the
   * derived value is always a whole figure.
   */
  private async syncHeader(poId: Id): Promise<void> {
    const po = await this.order(poId);
    const lines = await this.lines.listForOrder(po.id, po.tenantId);
    if (lines.length === 0) return;
    const { value } = orderGoverningValue(po.value, lines);
    if (po.value === value) return;
    await this.orders.update({ ...po, value });
  }

  async addLine(input: NewOrderLineInput): Promise<PurchaseOrderLine> {
    const po = await this.order(input.poId);
    this.assertDraft(po.status);

    const cited = await this.catalogue.citeMaterial(input.material, po.tenantId);
    await this.assertCoding(po.projectId, input.wbsNodeId, 'wbs');
    await this.assertCoding(po.projectId, input.cbsNodeId, 'cbs');
    if (input.sourcePrLineId) await this.assertRequestLine(input.sourcePrLineId);

    const existing = await this.lines.listForOrder(po.id, po.tenantId);
    const line = makePurchaseOrderLine({
      tenantId: po.tenantId,
      companyId: po.companyId,
      poId: po.id,
      lineNo: nextOrderLineNo(existing),
      materialId: cited.materialId,
      snapshot: {
        materialCode: cited.materialCode,
        materialName: cited.materialName,
        specification: cited.specification,
        manufacturer: cited.manufacturer,
        model: cited.model,
        uom: cited.uom,
      },
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      // Direct is the DEFAULT because it is the honest one: a line nobody has sourced has not been
      // sourced. `sourced` is never inferred — it has to be claimed, and claiming it costs a chain.
      sourceType: input.sourceType ?? 'direct',
      sourcePrLineId: input.sourcePrLineId,
      sourceQuoteLineId: input.sourceQuoteLineId,
      wbsNodeId: input.wbsNodeId,
      cbsNodeId: input.cbsNodeId,
      notes: input.notes,
      createdBy: this.tenant?.get().actorId ?? null,
    });
    await this.lines.save(line);
    await this.syncHeader(po.id);
    this.logger.log(`PO ${po.id} line ${line.lineNo}: ${line.quantity} ${line.uom} of ${line.materialCode} (${line.sourceType})`);
    return line;
  }

  /** Change the commercial terms of a line. Material, snapshot and lineage are not editable here. */
  async editLine(id: Id, edit: OrderLineEdit): Promise<PurchaseOrderLine> {
    const line = assertSameTenant(await this.lines.find(id, this.tenantId() ?? ''), this.tenantId(), 'order line', id);
    const po = await this.order(line.poId);
    this.assertDraft(po.status);
    await this.assertCoding(po.projectId, edit.wbsNodeId, 'wbs');
    await this.assertCoding(po.projectId, edit.cbsNodeId, 'cbs');

    const next = makePurchaseOrderLine({
      tenantId: line.tenantId,
      companyId: line.companyId,
      poId: line.poId,
      lineNo: line.lineNo,
      materialId: line.materialId,
      snapshot: {
        materialCode: line.materialCode, materialName: line.materialName,
        specification: line.specification, manufacturer: line.manufacturer,
        model: line.model, uom: line.uom,
      },
      quantity: edit.quantity ?? line.quantity,
      unitPrice: edit.unitPrice ?? line.unitPrice,
      sourceType: line.sourceType,
      sourcePrLineId: line.sourcePrLineId,
      sourceQuoteLineId: line.sourceQuoteLineId,
      wbsNodeId: edit.wbsNodeId === undefined ? line.wbsNodeId : edit.wbsNodeId,
      cbsNodeId: edit.cbsNodeId === undefined ? line.cbsNodeId : edit.cbsNodeId,
      notes: edit.notes === undefined ? line.notes : edit.notes,
      createdBy: line.createdBy,
    });
    const saved: PurchaseOrderLine = { ...next, id: line.id, createdAt: line.createdAt };
    await this.lines.save(saved);
    await this.syncHeader(po.id);
    return saved;
  }

  async removeLine(id: Id): Promise<void> {
    const line = assertSameTenant(await this.lines.find(id, this.tenantId() ?? ''), this.tenantId(), 'order line', id);
    const po = await this.order(line.poId);
    this.assertDraft(po.status);
    await this.lines.remove(id, line.tenantId);
    const remaining = await this.lines.listForOrder(po.id, po.tenantId);
    for (const renumbered of renumberOrderLines(remaining)) {
      if (remaining.find((r) => r.id === renumbered.id)?.lineNo !== renumbered.lineNo) {
        await this.lines.save(renumbered);
      }
    }
    await this.syncHeader(po.id);
  }

  listLines(poId: Id): Promise<PurchaseOrderLine[]> {
    return this.lines.listForOrder(poId, this.tenantId() ?? '');
  }

  /** What the order comes to, and how it was arrived at. */
  async summary(poId: Id): Promise<{ total: OrderTotal; provenance: OrderProvenance; derived: boolean }> {
    const po = await this.order(poId);
    const lines = await this.lines.listForOrder(po.id, po.tenantId);
    const { derived } = orderGoverningValue(po.value, lines);
    return { total: orderTotal(lines), provenance: provenanceOf(lines), derived };
  }

  /**
   * Carry an approved requisition's lines onto the order it drafts — WITHOUT RETYPING.
   *
   * This is the first real handoff in the chain, and it is what makes the requisition's work mean
   * something: the material identity, its description as the requisitioner saw it, the quantity and
   * the coding all travel, and each order line records the requisition line it answers.
   *
   * The lineage is DIRECT: this order was raised straight from a requisition with no RFQ and no
   * competitive selection, and saying so plainly is the point. Calling it sourced because a
   * requisition exists would be the exact false claim the domain refuses — a requisition is demand,
   * not sourcing.
   *
   * The requisition's estimated unit cost becomes the order's unit price, because that is the only
   * figure anybody has stated yet. A buyer edits it to the agreed price while the order is a draft;
   * a requisition line with no estimate cannot reach here at all, since an incomplete requisition
   * cannot be approved.
   *
   * Idempotent on replay: a requisition line already carried onto this order is skipped rather than
   * duplicated, so a redelivered event does not order the same material twice.
   */
  async carryRequisitionLines(poId: Id, prId: Id): Promise<PurchaseOrderLine[]> {
    if (!this.requestLines) return [];
    const po = await this.order(poId);
    const demand = await this.requestLines.listForRequest(prId, po.tenantId);
    if (demand.length === 0) return [];

    const already = await this.lines.listForOrder(po.id, po.tenantId);
    const carried = new Set(already.map((l) => l.sourcePrLineId).filter(Boolean));
    const created: PurchaseOrderLine[] = [];
    let lineNo = nextOrderLineNo(already);

    for (const d of demand) {
      if (carried.has(d.id)) continue;
      const line = makePurchaseOrderLine({
        tenantId: po.tenantId,
        companyId: po.companyId,
        poId: po.id,
        lineNo: lineNo++,
        materialId: d.materialId,
        // The requisition's OWN snapshot travels, not a fresh read of the catalogue: the order
        // should say what was asked for, as it was asked for.
        snapshot: {
          materialCode: d.materialCode, materialName: d.materialName,
          specification: d.specification, manufacturer: d.manufacturer,
          model: d.model, uom: d.uom,
        },
        quantity: d.quantity,
        unitPrice: d.estimatedUnitCost ?? 0,
        sourceType: 'direct',
        sourcePrLineId: d.id,
        wbsNodeId: d.wbsNodeId,
        cbsNodeId: d.cbsNodeId,
        notes: d.notes,
        createdBy: d.createdBy,
      });
      await this.lines.save(line);
      created.push(line);
    }
    if (created.length > 0) {
      await this.syncHeader(po.id);
      this.logger.log(`PO ${po.id} carried ${created.length} line(s) from requisition ${prId}`);
    }
    return created;
  }
}
