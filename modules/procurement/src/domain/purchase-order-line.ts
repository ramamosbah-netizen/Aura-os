import { moneyNumber, newId, type Id } from '@aura/shared';

/**
 * A line on a purchase order — what is actually being bought, and how it came to be bought.
 *
 * The order had a header, a scalar value and nothing else, so "what did we order" was unanswerable
 * and everything downstream of it — receiving part of a delivery, issuing some of it to site,
 * proving the material installed is the one approved — had no subject to attach to.
 *
 * The same two halves a requisition line carries, for the same reasons: `materialId` is the
 * canonical identity, and the description is COPIED at authoring time so an order read later shows
 * what was bought as it was described then.
 */
export interface PurchaseOrderLine {
  id: Id;
  tenantId: string;
  companyId: string | null;
  poId: Id;
  lineNo: number;

  materialId: Id;
  materialCode: string;
  materialName: string;
  specification: string | null;
  manufacturer: string | null;
  model: string | null;
  /** Copied from the master. An order cannot invent a unit the material is not counted in. */
  uom: string;

  quantity: number;
  /** In the ORDER's currency, which lives on the header: one order, one supplier, one currency. */
  unitPrice: number;
  /**
   * WHICH KIND of figure `unitPrice` is. An estimate and an agreed price are not the same number:
   * one is what the requisitioner thought it would cost, binding on nobody; the other is what the
   * supplier will be paid. Null on a line written before the distinction existed — unknown, and
   * never to be read as agreed.
   */
  unitPriceBasis: UnitPriceBasis | null;

  /** How this line came to be bought. See `LINE_SOURCES`. */
  sourceType: PurchaseOrderLineSource;
  /** The demand this line answers. Optional on a direct line, REQUIRED on a sourced one. */
  sourcePrLineId: Id | null;
  /** Reserved: the exact supplier quote line a selection chose. */
  sourceQuoteLineId: Id | null;

  wbsNodeId: Id | null;
  cbsNodeId: Id | null;
  notes: string | null;

  createdBy: Id | null;
  createdAt: string;
}

/**
 * Two lawful routes to a purchase order line, and the direct one is not a loophole.
 *
 * The third state the programme recognises — legacy/unknown — is NOT here, because it is carried by
 * an order having no lines at all. An order raised before lines existed keeps its header value and
 * is never read as evidence that it was sourced or that it was direct: it predates the authority
 * that could have said either. It is not selectable, because it is not a choice anybody makes.
 */
export const LINE_SOURCES = ['direct', 'sourced'] as const;
export type PurchaseOrderLineSource = (typeof LINE_SOURCES)[number];

/**
 * Where this line's unit price came from.
 *
 * `estimate` — carried from a requisition. A provisional commercial snapshot: the requisitioner's
 * own budget figure, stated before any supplier was asked, and binding on nobody.
 *
 * `agreed` — what the supplier will actually be paid. A buyer typing a price onto an order is
 * agreeing it; on the SOURCED route it must instead come from the selected quotation's own lineage,
 * because a competitively sourced price is a fact the selection establishes, not one a buyer
 * retypes over an estimate.
 *
 * They are never blended. A carried estimate stays an estimate until something with the authority
 * to set a price replaces it.
 */
export const UNIT_PRICE_BASES = ['estimate', 'agreed'] as const;
export type UnitPriceBasis = (typeof UNIT_PRICE_BASES)[number];

/**
 * A line's LINEAGE is fixed when it is created, and there is deliberately no way to change it.
 *
 * Carrying a requisition line onto an order makes a DIRECT line, and it must never later become
 * `sourced` because a requisition exists — a requisition is demand, not sourcing. `sourced` becomes
 * true only where a governed quotation selection made it true, and that selection creates the line
 * rather than relabelling one. There is no mutator here on purpose: the absence is the rule.
 */
export const LINEAGE_IS_FIXED =
  'a purchase order line’s lineage is fixed when the line is created: a direct line does not become ' +
  'sourced because a requisition exists, only because a governed quotation selection made it so';

export interface OrderMaterialSnapshot {
  materialCode: string;
  materialName: string;
  specification: string | null;
  manufacturer: string | null;
  model: string | null;
  uom: string;
}

export interface NewPurchaseOrderLine {
  tenantId: string;
  companyId?: string | null;
  poId: Id;
  lineNo: number;
  materialId: Id;
  snapshot: OrderMaterialSnapshot;
  quantity: number;
  unitPrice: number;
  sourceType: PurchaseOrderLineSource;
  unitPriceBasis: UnitPriceBasis;
  sourcePrLineId?: Id | null;
  sourceQuoteLineId?: Id | null;
  wbsNodeId?: Id | null;
  cbsNodeId?: Id | null;
  notes?: string | null;
  createdBy?: Id | null;
}

const trimOrNull = (v: string | null | undefined): string | null => v?.trim() || null;

export const SOURCED_NEEDS_CHAIN =
  'a purchase order line cannot claim it was competitively sourced without the chain that sourced it: ' +
  'a sourced line must cite the requisition line it answers, and the supplier quote line a buyer selected';

export const LEGACY_NOT_SELECTABLE =
  'legacy is not a lineage anybody may choose: it is what an order raised before lines existed looks like, ' +
  'and a new line must say whether it was sourced or bought direct';

export function makePurchaseOrderLine(input: NewPurchaseOrderLine): PurchaseOrderLine {
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('a purchase order line requires a quantity greater than zero');
  }
  const unitPrice = Number(input.unitPrice);
  // Zero is a real commercial fact — a free issue, a warranty replacement. Negative is a credit,
  // which is not a purchase order line.
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('a purchase order line requires a unit price of zero or more');
  }
  if (!input.materialId) {
    throw new Error('a purchase order line must name a canonical material, not a description');
  }
  const { materialCode, materialName, uom } = input.snapshot;
  if (!materialCode?.trim() || !materialName?.trim() || !uom?.trim()) {
    throw new Error('a purchase order line must carry the material code, name and unit it was authored against');
  }
  if (!Number.isInteger(input.lineNo) || input.lineNo <= 0) {
    throw new Error('a purchase order line requires a positive line number');
  }
  if (!(LINE_SOURCES as readonly string[]).includes(input.sourceType)) {
    // Includes the legacy case, which callers must never be able to select.
    throw new Error(
      input.sourceType === ('legacy' as never) ? LEGACY_NOT_SELECTABLE
        : `a purchase order line must say how it was bought — ${LINE_SOURCES.join(' or ')}`,
    );
  }

  if (!(UNIT_PRICE_BASES as readonly string[]).includes(input.unitPriceBasis)) {
    throw new Error(
      `a purchase order line must say what kind of price it carries — ${UNIT_PRICE_BASES.join(' or ')}`,
    );
  }

  const sourcePrLineId = input.sourcePrLineId ?? null;
  const sourceQuoteLineId = input.sourceQuoteLineId ?? null;

  /**
   * The claim that needs evidence.
   *
   * A NULL `sourcePrLineId` on a DIRECT line is explicit lineage — somebody decided to buy this
   * without sourcing it, and the discriminator records that decision. The same NULL on a line
   * CLAIMING to have been sourced is an unfounded claim, and it is refused rather than accepted:
   * "competitively sourced" is exactly the assertion nobody should be able to make by leaving a
   * field empty.
   */
  if (input.sourceType === 'sourced' && (!sourcePrLineId || !sourceQuoteLineId)) {
    throw new Error(SOURCED_NEEDS_CHAIN);
  }

  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    poId: input.poId,
    lineNo: input.lineNo,
    materialId: input.materialId,
    materialCode: materialCode.trim(),
    materialName: materialName.trim(),
    specification: trimOrNull(input.snapshot.specification),
    manufacturer: trimOrNull(input.snapshot.manufacturer),
    model: trimOrNull(input.snapshot.model),
    uom: uom.trim(),
    quantity,
    unitPrice: moneyNumber(unitPrice),
    unitPriceBasis: input.unitPriceBasis,
    sourceType: input.sourceType,
    sourcePrLineId,
    sourceQuoteLineId,
    wbsNodeId: input.wbsNodeId ?? null,
    cbsNodeId: input.cbsNodeId ?? null,
    notes: trimOrNull(input.notes),
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * An order's lines may only change while it is a DRAFT.
 *
 * Once submitted the lines are what was submitted for approval; once issued they are what the
 * supplier was told to deliver. Editing them afterwards would mean approving one order and placing
 * another — and, after issue, receiving against a quantity nobody agreed to.
 */
export const PO_LINES_FROZEN = 'a purchase order’s lines can only be changed while it is a draft';

export function mayEditOrderLines(poStatus: string): { allowed: boolean; reason?: string } {
  if (poStatus === 'draft') return { allowed: true };
  return {
    allowed: false,
    reason: `${PO_LINES_FROZEN} — this one is ${poStatus}, and its lines are what the supplier was committed to`,
  };
}

/**
 * What the order comes to.
 *
 * Unlike a requisition there is no unpriced state to carry: a purchase order line without a price
 * is not a draft in progress, it is an order for an unknown amount, and the domain refuses to
 * create one at all. So an order with lines always has a complete total.
 */
export interface OrderTotal {
  lineCount: number;
  value: number;
}

export function orderTotal(lines: PurchaseOrderLine[]): OrderTotal {
  return {
    lineCount: lines.length,
    // Each line extension rounds before the sum, so the total is what the printed lines add up to.
    value: moneyNumber(lines.reduce((sum, l) => sum + moneyNumber(l.quantity * l.unitPrice), 0)),
  };
}

/**
 * The value that governs this order — derived where it has lines, authored where it does not.
 *
 * The lineless case is the legacy/unknown state: an order raised before lines existed keeps the
 * figure somebody stated, because refusing to read it would invalidate every historical record
 * rather than improve any of them.
 */
export function orderGoverningValue(
  authoredHeaderValue: number,
  lines: PurchaseOrderLine[],
): { value: number; derived: boolean } {
  if (lines.length === 0) return { value: moneyNumber(authoredHeaderValue), derived: false };
  return { value: orderTotal(lines).value, derived: true };
}

/**
 * How an order was arrived at, read from its lines rather than declared on the header.
 *
 * `legacy` is what no lines looks like. `mixed` is a real and legitimate answer — an order can
 * carry a sourced line and a direct one — and it is reported rather than collapsed into whichever
 * came first, because "some of this was competitively sourced" is a different fact from "all of it
 * was".
 */
export type OrderProvenance = 'legacy' | 'direct' | 'sourced' | 'mixed';

export function provenanceOf(lines: PurchaseOrderLine[]): OrderProvenance {
  if (lines.length === 0) return 'legacy';
  const kinds = new Set(lines.map((l) => l.sourceType));
  if (kinds.size > 1) return 'mixed';
  return [...kinds][0];
}

/** The total ordered quantity of one material on this order — what a receipt is measured against. */
export function orderedQuantityOf(lines: PurchaseOrderLine[], materialId: Id): number {
  return lines.filter((l) => l.materialId === materialId).reduce((sum, l) => sum + l.quantity, 0);
}

export function renumberOrderLines(lines: PurchaseOrderLine[]): PurchaseOrderLine[] {
  return [...lines]
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((line, i) => (line.lineNo === i + 1 ? line : { ...line, lineNo: i + 1 }));
}

export function nextOrderLineNo(lines: PurchaseOrderLine[]): number {
  return lines.reduce((max, l) => Math.max(max, l.lineNo), 0) + 1;
}

/**
 * Lines still carrying a provisional figure.
 *
 * The buyer's own question before issuing an order, and the one supplier selection will answer.
 * A line whose basis is UNKNOWN (written before the distinction existed) is not reported as an
 * estimate — unknown is not the same as provisional, and guessing would be the inference this
 * rule exists to prevent.
 */
export function linesCarryingAnEstimate(lines: PurchaseOrderLine[]): PurchaseOrderLine[] {
  return lines.filter((l) => l.unitPriceBasis === 'estimate');
}
