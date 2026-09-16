import { newId, type Id } from '@aura/shared';

/**
 * A line on a delivery note — which ordered material arrived, and how much of it was kept.
 *
 * A receipt line answers ONE ORDER LINE. `poLineId` is required rather than optional because a
 * receipt against nothing settles nothing, and settling a position one at a time is the entire
 * point: it is what makes "1 of 100 received, 99 outstanding" a fact the system holds.
 *
 * ACCEPTED AND REJECTED ARE DIFFERENT FACTS. A rejected quantity arrived, was inspected and was
 * sent back — real, worth recording against the supplier, and NOT progress against the order,
 * because the material is still owed. Only `quantityAccepted` reduces what is outstanding.
 */
export interface GoodsReceiptLine {
  id: Id;
  tenantId: string;
  companyId: string | null;
  grnId: Id;
  lineNo: number;
  /** The order line this receipt answers. */
  poLineId: Id;
  quantityAccepted: number;
  quantityRejected: number;
  rejectionReason: string | null;
  notes: string | null;
  createdBy: Id | null;
  createdAt: string;
}

export interface NewGoodsReceiptLine {
  tenantId: string;
  companyId?: string | null;
  grnId: Id;
  lineNo: number;
  poLineId: Id;
  quantityAccepted?: number;
  quantityRejected?: number;
  rejectionReason?: string | null;
  notes?: string | null;
  createdBy?: Id | null;
}

export function makeGoodsReceiptLine(input: NewGoodsReceiptLine): GoodsReceiptLine {
  if (!input.poLineId) {
    throw new Error('a receipt line must say which order line it answers — a receipt against nothing settles nothing');
  }
  const accepted = Number(input.quantityAccepted ?? 0);
  const rejected = Number(input.quantityRejected ?? 0);
  if (!Number.isFinite(accepted) || accepted < 0) throw new Error('an accepted quantity cannot be negative');
  if (!Number.isFinite(rejected) || rejected < 0) throw new Error('a rejected quantity cannot be negative');
  if (accepted + rejected <= 0) {
    throw new Error('a receipt line requires something to have arrived — an accepted or a rejected quantity');
  }
  const reason = input.rejectionReason?.trim() || null;
  // A rejection nobody explained cannot be acted on, by the supplier or by anybody chasing it.
  if (rejected > 0 && !reason) {
    throw new Error('a rejected quantity requires a reason — a rejection nobody explained cannot be acted on');
  }
  if (!Number.isInteger(input.lineNo) || input.lineNo <= 0) {
    throw new Error('a receipt line requires a positive line number');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    grnId: input.grnId,
    lineNo: input.lineNo,
    poLineId: input.poLineId,
    quantityAccepted: accepted,
    quantityRejected: rejected,
    rejectionReason: reason,
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

/** Accepted quantity per order line, summed across a set of receipt lines. */
export function acceptedByPoLine(lines: GoodsReceiptLine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) out[l.poLineId] = (out[l.poLineId] ?? 0) + l.quantityAccepted;
  return out;
}

/** Rejected quantity per order line — reported beside the accepted, never folded into it. */
export function rejectedByPoLine(lines: GoodsReceiptLine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) out[l.poLineId] = (out[l.poLineId] ?? 0) + l.quantityRejected;
  return out;
}

export function nextReceiptLineNo(lines: GoodsReceiptLine[]): number {
  return lines.reduce((max, l) => Math.max(max, l.lineNo), 0) + 1;
}
