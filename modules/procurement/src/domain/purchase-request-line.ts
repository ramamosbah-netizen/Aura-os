import { moneyNumber, newId, type Id } from '@aura/shared';

/**
 * A line on a material requisition — where demand starts.
 *
 * `BUY-01` is called "Material requisition lines" and there were none: a requisition was a title, a
 * number and a project. Gap record `J3-05` lists what that leaves out — material, quantity, unit,
 * specification, need-by date and cost code — and a requisition missing all six is a note asking
 * somebody to remember a conversation.
 *
 * A line authored here is the origin of the whole chain:
 *
 *   PR line → RFQ → supplier quote line → selection → PO line → GRN line → stock → site issue
 *
 * Every later stage ANSWERS this line instead of re-typing it. That is what makes an item-level
 * supplier comparison possible at all: two vendors are comparable because they quoted the same
 * line, not because a buyer matched two descriptions by eye.
 *
 * IDENTITY BY REFERENCE, DESCRIPTION BY VALUE. `materialId` points at the master forever; the code,
 * name, specification, make, model and unit are COPIED when the line is authored. The reference
 * answers "is the thing installed the thing that was approved and bought". The copy answers "what
 * did we think we were ordering, when we ordered it". A reference alone would let a catalogue edit
 * rewrite history; a copy alone is the free text this wave exists to remove.
 */
export interface PurchaseRequestLine {
  id: Id;
  tenantId: string;
  companyId: string | null;
  prId: Id;
  lineNo: number;

  /** The canonical material. Never a description — that is what the snapshot is for. */
  materialId: Id;

  /** What that material WAS when this line was authored. Taken whole, never field by field. */
  materialCode: string;
  materialName: string;
  specification: string | null;
  manufacturer: string | null;
  model: string | null;
  /** Copied from the master. A requisition cannot invent a unit the material is not counted in. */
  uom: string;

  quantity: number;
  needByDate: string | null;
  /** Internal budget estimate in the company's base currency. No supplier price, no FX — yet. */
  estimatedUnitCost: number | null;

  wbsNodeId: Id | null;
  cbsNodeId: Id | null;
  notes: string | null;

  /**
   * On a TENDER-PRICING requisition only: the BOQ item this supply line prices, and who confirmed
   * that the BOQ item IS this material. The mapping is a person's judgement, never a text match —
   * "IP camera, 4MP dome" in a BOQ and a material record are the same thing only because somebody
   * said so, and the record keeps who. Null on an operational requisition.
   */
  sourceBoqItemId: Id | null;
  materialMappedBy: Id | null;
  materialMappedAt: string | null;

  createdBy: Id | null;
  createdAt: string;
}

/** The whole description, taken from the material master — never assembled by a caller. */
export interface MaterialLineSnapshot {
  materialCode: string;
  materialName: string;
  specification: string | null;
  manufacturer: string | null;
  model: string | null;
  uom: string;
}

export interface NewPurchaseRequestLine {
  tenantId: string;
  companyId?: string | null;
  prId: Id;
  lineNo: number;
  materialId: Id;
  snapshot: MaterialLineSnapshot;
  quantity: number;
  needByDate?: string | null;
  estimatedUnitCost?: number | null;
  wbsNodeId?: Id | null;
  cbsNodeId?: Id | null;
  notes?: string | null;
  createdBy?: Id | null;
  sourceBoqItemId?: Id | null;
  materialMappedBy?: Id | null;
  materialMappedAt?: string | null;
}

const trimOrNull = (v: string | null | undefined): string | null => v?.trim() || null;

export function makePurchaseRequestLine(input: NewPurchaseRequestLine): PurchaseRequestLine {
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('a requisition line needs a quantity greater than zero — a demand for nothing is not a demand');
  }
  if (!input.materialId) {
    throw new Error('a requisition line must name a canonical material, not a description');
  }
  const { materialCode, materialName, uom } = input.snapshot;
  if (!materialCode?.trim() || !materialName?.trim() || !uom?.trim()) {
    throw new Error('a requisition line must carry the material code, name and unit it was authored against');
  }
  const cost = input.estimatedUnitCost;
  if (cost !== null && cost !== undefined) {
    const n = Number(cost);
    if (!Number.isFinite(n) || n < 0) throw new Error('an estimated unit cost cannot be negative');
  }
  if (!Number.isInteger(input.lineNo) || input.lineNo <= 0) {
    throw new Error('a requisition line needs a positive line number');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    prId: input.prId,
    lineNo: input.lineNo,
    materialId: input.materialId,
    materialCode: materialCode.trim(),
    materialName: materialName.trim(),
    specification: trimOrNull(input.snapshot.specification),
    manufacturer: trimOrNull(input.snapshot.manufacturer),
    model: trimOrNull(input.snapshot.model),
    uom: uom.trim(),
    quantity,
    needByDate: trimOrNull(input.needByDate),
    estimatedUnitCost: cost === null || cost === undefined ? null : moneyNumber(Number(cost)),
    wbsNodeId: input.wbsNodeId ?? null,
    cbsNodeId: input.cbsNodeId ?? null,
    notes: trimOrNull(input.notes),
    sourceBoqItemId: input.sourceBoqItemId ?? null,
    materialMappedBy: input.materialMappedBy ?? null,
    materialMappedAt: input.materialMappedAt ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Only a DRAFT requisition's lines may change.
 *
 * Once it has been submitted, the lines ARE what was submitted, and once approved they are what was
 * approved. Editing them afterwards would mean approving one thing and buying another — the same
 * rule that fixes a transmittal's distribution at the moment it is sent.
 */
export const PR_LINES_FROZEN = 'a requisition’s lines can only be changed while it is a draft';

export function mayEditLines(prStatus: string): { allowed: boolean; reason?: string } {
  if (prStatus === 'draft') return { allowed: true };
  return {
    allowed: false,
    reason: `${PR_LINES_FROZEN} — this one is ${prStatus}, and its lines are what was submitted for that decision`,
  };
}

/**
 * What a requisition's lines add up to — and, just as importantly, whether that sum is the whole
 * story.
 *
 * `value` is NULL while any line is unpriced. It is not zero and it is not the partial sum, because
 * a requisition's value decides WHO MAY APPROVE IT: a missing estimate makes the total smaller, and
 * a smaller total needs a less senior approver. Letting an absent number stand in for a real one
 * would quietly buy a weaker approval — the same defect shape as an absent quantity declaring an
 * order complete.
 *
 * `pricedSubtotal` is still reported, because a half-written draft legitimately wants to show what
 * it has so far. It is a progress figure, never the requisition's value.
 */
export interface RequisitionTotal {
  lineCount: number;
  pricedCount: number;
  unpricedCount: number;
  /** The sum over lines that DO carry an estimate. A progress figure on a draft. */
  pricedSubtotal: number;
  /** Every line carries an estimate. Only then does the subtotal speak for the requisition. */
  complete: boolean;
  /** The derived value, or null while anything is unpriced. */
  value: number | null;
}

export function requisitionTotal(lines: PurchaseRequestLine[]): RequisitionTotal {
  const priced = lines.filter((l) => l.estimatedUnitCost !== null);
  const pricedSubtotal = moneyNumber(
    priced.reduce((sum, l) => sum + moneyNumber(l.quantity * (l.estimatedUnitCost as number)), 0),
  );
  const complete = lines.length > 0 && priced.length === lines.length;
  return {
    lineCount: lines.length,
    pricedCount: priced.length,
    unpricedCount: lines.length - priced.length,
    pricedSubtotal,
    complete,
    value: complete ? pricedSubtotal : null,
  };
}

/**
 * The value that governs this requisition — derived where it has lines, authored where it does not.
 *
 * A requisition raised before lines existed carries a header figure and nothing else. That figure
 * stays its value: it is what somebody actually stated, and refusing to read it would invalidate
 * every historical record rather than improve any of them. A requisition WITH lines no longer has
 * an independent header value — there would be two totals that could disagree, and the lines are
 * the ones anybody can check.
 */
export function governingValue(
  authoredHeaderValue: number,
  lines: PurchaseRequestLine[],
): { value: number | null; derived: boolean } {
  if (lines.length === 0) return { value: moneyNumber(authoredHeaderValue), derived: false };
  return { value: requisitionTotal(lines).value, derived: true };
}

/**
 * May this requisition be sent for a decision?
 *
 * A draft may be as incomplete as its author likes. A requisition ASKING SOMEBODY TO APPROVE IT may
 * not: the approver is being asked to commit money, and the figure they are shown has to be the
 * whole figure.
 */
export function readyToSubmit(lines: PurchaseRequestLine[]): { ready: boolean; reason?: string } {
  if (lines.length === 0) {
    return { ready: false, reason: 'a requisition needs at least one material line before it can be submitted' };
  }
  const total = requisitionTotal(lines);
  if (!total.complete) {
    const unpriced = lines.filter((l) => l.estimatedUnitCost === null).map((l) => `${l.lineNo} (${l.materialCode})`);
    return {
      ready: false,
      // "requires" deliberately: this string is THROWN by the submit and approve paths, and the
      // HTTP taxonomy classifies a refusal by its wording. "needs an" matches nothing in it and
      // escaped as a 500. The error-taxonomy fitness gate did not catch it either, because the gate
      // reads throw-statement literals — and this reason is composed here and thrown somewhere else.
      reason:
        `every line requires an estimated cost before approval, because the requisition's value decides who may ` +
        `approve it — unpriced: line ${unpriced.join(', line ')}`,
    };
  }
  return { ready: true };
}

/** Renumber lines 1..n in their current order — used after a removal, so gaps never appear. */
export function renumber(lines: PurchaseRequestLine[]): PurchaseRequestLine[] {
  return [...lines]
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((line, i) => (line.lineNo === i + 1 ? line : { ...line, lineNo: i + 1 }));
}

/** The next free line number for a requisition. */
export function nextLineNo(lines: PurchaseRequestLine[]): number {
  return lines.reduce((max, l) => Math.max(max, l.lineNo), 0) + 1;
}
