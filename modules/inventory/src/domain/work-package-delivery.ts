/**
 * What counts as material DELIVERED TO A WORK PACKAGE (`BUY-07`).
 *
 * THE FROZEN INVARIANT, in the words it was decided in:
 *
 *   A project issue does not inherently mean delivery to a work package. Any issue REPRESENTED,
 *   PROJECTED, ACKNOWLEDGED or COUNTED as delivered to a work package MUST carry an explicit
 *   validated `wbsNodeId`. Absence of `wbsNodeId` means the work-package destination is
 *   UNKNOWN/UNSPECIFIED — never zero, and NEVER INFERRED FROM `boqItemId`.
 *
 * Why the last clause is the one with teeth. The tempting resolver is "find the work packages whose
 * `boqItemId` matches this movement's and call that the destination". It would make the numbers look
 * complete, and it would be manufacturing provenance out of its absence — wrong in principle, and
 * wrong arithmetically the moment two packages measure against the same BOQ item, because the same
 * material would be reported as delivered to both. `BUY-06` established a legitimate authority for
 * issuing against a project and a BOQ item WITHOUT naming a package; this extends that authority
 * rather than redefining it, so those movements stay valid and stay unattributed.
 *
 * And absence is reported where it belongs. A movement with no destination is NOT shown on every
 * work package as UNKNOWN — that would falsely associate it with all of them. It is surfaced once,
 * at project level, as "issued to project — work package not specified".
 */

import { moneyNumber } from '@aura/shared';

/** The delivery-relevant facts of one movement. Whatever else a movement carries is not read here. */
export interface MovementFacts {
  direction: 'in' | 'out';
  quantity: number;
  unitCost: number;
  projectId: string | null;
  boqItemId: string | null;
  /** NULL means no destination was declared. It does not mean "none" and it is not a lookup key. */
  wbsNodeId: string | null;
}

export type DeliveryEligibility =
  | { eligible: true }
  | { eligible: false; reason: 'not_project_coded' | 'no_work_package_declared' };

/**
 * May this movement be counted as a delivery to a work package?
 *
 * This is the single gate every projection, acknowledgement and next-role receipt must pass through,
 * so that "counted as delivered" cannot be decided differently in two places.
 */
export function mayCountAsWorkPackageDelivery(m: MovementFacts): DeliveryEligibility {
  if (!m.projectId) return { eligible: false, reason: 'not_project_coded' };
  // The whole rule, in one line: declared or it did not happen. No fallback to boqItemId.
  if (!m.wbsNodeId) return { eligible: false, reason: 'no_work_package_declared' };
  return { eligible: true };
}

export interface WorkPackageDelivery {
  wbsNodeId: string;
  /** Net of returns: issued out minus anything brought back against the SAME work package. */
  quantity: number;
  value: number;
  movements: number;
}

/**
 * What has been delivered to one work package.
 *
 * Only movements that named THIS package are read. A return coded to the same package reduces it,
 * for the same reason a return reduces the issued position in `BUY-06`: what came back was not
 * delivered. A return carrying no package cannot reduce any package's delivery, because nobody said
 * which one it came from — guessing would let an unattributed return erase a recorded delivery.
 */
export function deliveredToWorkPackage(wbsNodeId: string, movements: MovementFacts[]): WorkPackageDelivery {
  let quantity = 0;
  let value = 0;
  let counted = 0;
  for (const m of movements) {
    if (!mayCountAsWorkPackageDelivery(m).eligible) continue;
    if (m.wbsNodeId !== wbsNodeId) continue;
    const sign = m.direction === 'out' ? 1 : -1;
    quantity += sign * m.quantity;
    value += sign * moneyNumber(m.quantity * m.unitCost);
    counted += 1;
  }
  return { wbsNodeId, quantity, value: moneyNumber(value), movements: counted };
}

export interface UnspecifiedDestination {
  quantity: number;
  value: number;
  movements: number;
}

/**
 * Material issued to a project that named NO work package.
 *
 * Reported once, at project level, and never attached to an individual package. This is the honest
 * home for the absence: it says the material left the store for this project and nobody recorded
 * where it went, which is a real and actionable gap — as opposed to silently reading zero, or
 * spraying the same movement across every package as UNKNOWN.
 */
export function issuedWithoutWorkPackage(projectId: string, movements: MovementFacts[]): UnspecifiedDestination {
  let quantity = 0;
  let value = 0;
  let counted = 0;
  for (const m of movements) {
    if (m.projectId !== projectId) continue;
    if (m.wbsNodeId) continue;
    const sign = m.direction === 'out' ? 1 : -1;
    quantity += sign * m.quantity;
    value += sign * moneyNumber(m.quantity * m.unitCost);
    counted += 1;
  }
  return { quantity, value: moneyNumber(value), movements: counted };
}

/**
 * A work package's BOQ measurement linkage is a SEPARATE relationship from its delivery destination.
 *
 * A package with no BOQ item can still be a perfectly valid destination: the material went there and
 * was recorded going there. What is absent is the measurement linkage, not the delivery. Keeping the
 * two apart stops a missing BOQ mapping from being manufactured to make a screen look complete.
 */
export interface WorkPackageDestinationState {
  destination: 'known';
  boqMeasurementLinkage: 'linked' | 'absent';
}

export function destinationState(boqItemId: string | null): WorkPackageDestinationState {
  return { destination: 'known', boqMeasurementLinkage: boqItemId ? 'linked' : 'absent' };
}
