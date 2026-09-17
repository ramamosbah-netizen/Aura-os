/**
 * The next-role receipt: Site accepts material delivered to a work package (`BUY-07`).
 *
 * WHAT AN ACKNOWLEDGEMENT IS, AND WHAT IT MUST NEVER BECOME.
 *
 * The material has already moved. A Storekeeper issued it, the movement is persisted, and the
 * quantity delivered to a work package is derived from those movements and from nothing else. An
 * acknowledgement records ONE new fact — a named human accepted receipt of THAT movement — and it
 * carries no quantity of its own. Giving it one would make it a second writer of a fact that already
 * has an authority, and two writers of one number is the competing-truth defect this wave exists to
 * remove.
 *
 * So every rule below is about WHETHER a receipt may be recorded, never about how much was received.
 */

export type AckRefusal =
  | 'not_a_work_package_delivery'
  | 'no_recipient_authority'
  | 'not_the_recipient'
  | 'issuer_unknown'
  | 'issuer_cannot_acknowledge'
  | 'already_acknowledged';

export type AckVerdict = { allowed: true } | { allowed: false; reason: AckRefusal; message: string };

export interface AckRequest {
  /** The movement's declared destination. NULL means it never claimed one. */
  wbsNodeId: string | null;
  direction: 'in' | 'out';
  /** Who recorded the movement. NULL = the issuer was never recorded (historic rows). */
  issuedBy: string | null;
  /** Who is acknowledging now. */
  actorId: string;
  /**
   * Who holds site-execution responsibility FOR THIS WORK PACKAGE.
   * NULL means no recipient authority is defined — not "anyone may", and not the project assignee.
   */
  recipientId: string | null;
  alreadyAcknowledged: boolean;
}

export function mayAcknowledgeDelivery(r: AckRequest): AckVerdict {
  /**
   * Only a declared work-package delivery can be received by a work package. An issue that named no
   * destination is a valid movement (`BUY-06`) but nobody can acknowledge it ON BEHALF of a package,
   * because nobody said which package it went to — and inferring one is the failure Slice 1 exists
   * to prevent.
   */
  if (!r.wbsNodeId || r.direction !== 'out') {
    return {
      allowed: false,
      reason: 'not_a_work_package_delivery',
      message: 'this movement was not issued to a work package, so there is nothing to acknowledge',
    };
  }

  /**
   * NO RECIPIENT AUTHORITY IS AN UNKNOWN, NOT AN OPEN DOOR.
   *
   * If nothing says who owns site execution for this package, the correct answer is that the handoff
   * cannot complete — not that any site engineer will do, and not that the project-wide assignee
   * inherits it. Falling back would manufacture accountability exactly as resolving a destination
   * from a BOQ item manufactures provenance.
   */
  if (!r.recipientId) {
    return {
      allowed: false,
      reason: 'no_recipient_authority',
      message:
        'only somebody who holds site-execution responsibility for this work package can accept ' +
        'delivery against it, and nobody holds it — assign the responsibility before material is receipted',
    };
  }

  if (r.actorId !== r.recipientId) {
    return {
      allowed: false,
      reason: 'not_the_recipient',
      message: 'only the person responsible for this work package can accept delivery against it',
    };
  }

  /**
   * MAKER AND CHECKER. A receipt the issuer signs records somebody agreeing with themselves.
   *
   * And an issuer nobody recorded cannot be checked against, so it REFUSES rather than passing: the
   * rule is unevaluable, which is not the same as satisfied. Historic movements predate the
   * `issued_by` column and legitimately land here.
   */
  if (!r.issuedBy) {
    return {
      allowed: false,
      reason: 'issuer_unknown',
      message:
        'cannot verify who issued this material, so it cannot be confirmed that the person ' +
        'accepting it is not the person who sent it',
    };
  }
  if (r.issuedBy === r.actorId) {
    return {
      allowed: false,
      reason: 'issuer_cannot_acknowledge',
      message: 'the person who issued this material cannot also acknowledge receiving it',
    };
  }

  /** One receipt per movement. A replayed request records the same receipt, never a second one. */
  if (r.alreadyAcknowledged) {
    return {
      allowed: false,
      reason: 'already_acknowledged',
      message: 'this delivery has already been acknowledged',
    };
  }

  return { allowed: true };
}

/**
 * How much of what reached a work package has been receipted — counted in MOVEMENTS, never quantity.
 *
 * Deliberately not a quantity figure. "18 of 20 movements acknowledged" is a statement about
 * receipts; "18 m of 20 m acknowledged" would be a second quantity beside the one the movements
 * already establish, and the two could drift apart.
 */
export interface AcknowledgementCoverage {
  deliveries: number;
  acknowledged: number;
  outstanding: number;
}

export function acknowledgementCoverage(deliveryMovementIds: string[], acknowledgedIds: Set<string>): AcknowledgementCoverage {
  const acknowledged = deliveryMovementIds.filter((id) => acknowledgedIds.has(id)).length;
  return {
    deliveries: deliveryMovementIds.length,
    acknowledged,
    outstanding: deliveryMovementIds.length - acknowledged,
  };
}
