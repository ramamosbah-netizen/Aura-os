/**
 * You cannot return more than you took.
 *
 * `BUY-06` is "stock issue and return", and the arithmetic behind it is a physical fact rather than
 * a policy: material issued to a project can come back, but only material that actually went. A
 * return larger than what is currently out there does not describe anything that happened.
 *
 * Left unguarded it does real damage, and the damage is silent — proven against the running system
 * before this was written. Issue 20 and return 50 and the BOQ item's position reads:
 *
 *   issued  −30   "we have sent minus thirty metres to site"
 *   onSite   30   the opposite sign, so a reader is told thirty metres ARE on site
 *   wastage −30   negative waste
 *
 * Nothing refused it, and every figure downstream — progress, wastage, remaining-to-order — reads
 * from that position. A quantity that cannot happen must not be recordable.
 */

export interface ReturnVerdict {
  allowed: boolean;
  reason?: string;
}

/**
 * May this quantity be returned from a project?
 *
 * `netIssued` is how much of this material is currently out on that BOQ item — issues minus returns
 * already recorded. NULL means the position could not be read, which is NOT a pass: a return whose
 * legitimacy nobody could check would record a movement against an unverified balance, and this is
 * the one direction where being wrong corrupts the position silently. Optional dependency, never
 * optional evidence.
 */
export function mayReturnFromProject(netIssued: number | null, quantity: number): ReturnVerdict {
  if (netIssued === null) {
    return {
      allowed: false,
      reason:
        'cannot verify how much of this material is currently issued to the project — the quantity ' +
        'position is unavailable, and a return cannot be recorded against a balance nobody could read',
    };
  }
  if (netIssued <= 0) {
    return {
      allowed: false,
      reason:
        // "insufficient" deliberately: this is a CONFLICT with the current issued balance, not a
        // malformed request, and the HTTP taxonomy classifies a refusal by its wording.
        'nothing of this material is currently issued to this project — insufficient issued quantity ' +
        'to return against, and a return larger than what went out describes nothing that happened',
    };
  }
  if (quantity > netIssued) {
    return {
      allowed: false,
      reason:
        `only ${netIssued} of this material is currently issued to this project, so returning ` +
        `${quantity} is an insufficient issued quantity — you cannot return more than you took`,
    };
  }
  return { allowed: true };
}
