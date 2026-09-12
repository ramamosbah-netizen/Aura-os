import { type Id, newId } from '@aura/shared';

/**
 * The spares a client is handed at handover (TC-GATE-16) — the last of the six readiness items to
 * get an authority.
 *
 * WHY THIS IS NEW RATHER THAN BORROWED. Inventory holds stock, serial units and their issue to a
 * project; none of that records a part being handed TO THE CLIENT. Issuing a camera to a project is
 * how it gets installed. Handing two spare cameras to the building owner is a different event with a
 * different counterparty. And the O&M pack's recommended-spares LIST is a document — a list is not a
 * delivery, and reading it as one would quietly redefine this item from "handed over" to "written
 * down".
 *
 * THE CLIENT'S WORD IS WHAT COUNTS. `handedOverAt` is ours; `acknowledgedBy` is theirs, and only the
 * second satisfies readiness — the same rule client training follows. Our record of handing
 * something over is not evidence that anybody received it.
 *
 * NOT A LEDGER. Quantities are two integers on one row. Nothing here decrements stock, values
 * anything, or pretends to be Inventory; `stockItemId` is a reference for whoever wants the part's
 * real record.
 */
export interface SpareItem {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  /** The system these spares belong to — a commissioning record. */
  commissioningId: Id;
  description: string;
  /** Reference to the part in Inventory, when it has one. A reference, never a copy. */
  stockItemId: string | null;
  unit: string | null;
  quantityRequired: number;
  quantityHandedOver: number;
  /** A spare that does not apply to this system is marked, never silently skipped. */
  required: boolean;
  handedOverAt: string | null;
  handedOverBy: Id | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  notes: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewSpareItem {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  commissioningId: Id;
  description: string;
  stockItemId?: string | null;
  unit?: string | null;
  quantityRequired?: number;
  required?: boolean;
  notes?: string | null;
  createdBy?: Id | null;
}

export function makeSpareItem(input: NewSpareItem): SpareItem {
  const description = input.description?.trim();
  if (!description) throw new Error('validation: a spare needs a description of the part');
  const quantityRequired = input.quantityRequired ?? 1;
  if (!Number.isInteger(quantityRequired) || quantityRequired < 0) {
    throw new Error('validation: the required quantity must be a whole number of zero or more');
  }
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    commissioningId: input.commissioningId,
    description,
    stockItemId: input.stockItemId?.trim() || null,
    unit: input.unit?.trim() || null,
    quantityRequired,
    quantityHandedOver: 0,
    required: input.required ?? true,
    handedOverAt: null,
    handedOverBy: null,
    acknowledgedBy: null,
    acknowledgedAt: null,
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Record that spares were handed over.
 *
 * A QUANTITY IS REQUIRED, and it may be less than what was asked for — a part-delivery is a real
 * thing and pretending otherwise would push people to record a full one. What it may not be is
 * MORE: handing over eight of five required is either a typo or a change nobody recorded, and both
 * are worth refusing at the point they happen.
 */
export function handOverSpare(
  item: SpareItem,
  input: { quantity: number; handedOverBy?: Id | null; notes?: string | null },
): SpareItem {
  if (!item.required) throw new Error('conflict: this spare is marked not required for the system');
  if (item.acknowledgedBy) throw new Error('conflict: the client has already acknowledged this spare');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error('validation: the handed-over quantity must be a whole number greater than zero');
  }
  if (input.quantity > item.quantityRequired) {
    throw new Error(
      `validation: the handed-over quantity must not exceed the ${item.quantityRequired} required`,
    );
  }
  const now = new Date().toISOString();
  return {
    ...item,
    quantityHandedOver: input.quantity,
    handedOverAt: now,
    handedOverBy: input.handedOverBy ?? null,
    notes: input.notes?.trim() || item.notes,
    updatedAt: now,
  };
}

/**
 * The client confirms receipt.
 *
 * A NAMED PERSON IS REQUIRED, as with training: "acknowledged" with nobody attached is our word
 * again, and the whole point of this field is that it is not ours. It cannot be given before the
 * spares were handed over — an acknowledgement of nothing is not evidence.
 */
export function acknowledgeSpare(item: SpareItem, input: { acknowledgedBy: string }): SpareItem {
  if (!item.handedOverAt) throw new Error('only a spare that has been handed over can be acknowledged');
  const acknowledgedBy = input.acknowledgedBy?.trim();
  if (!acknowledgedBy) throw new Error('validation: a named client representative is required to acknowledge spares');
  const now = new Date().toISOString();
  return { ...item, acknowledgedBy, acknowledgedAt: now, updatedAt: now };
}

/** Mark a spare as not applying to this system — recorded, never silently skipped. */
export function setSpareRequired(item: SpareItem, required: boolean, notes?: string | null): SpareItem {
  if (item.handedOverAt && !required) {
    throw new Error('conflict: a spare that has already been handed over cannot be marked not required');
  }
  return { ...item, required, notes: notes?.trim() || item.notes, updatedAt: new Date().toISOString() };
}
