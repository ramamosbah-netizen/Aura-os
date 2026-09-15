import type { MaterialApproval } from './material-approval';

/**
 * §22 — WHAT MATERIAL-APPROVAL EVIDENCE STANDS FOR A SUPPLIER ON A PROJECT?
 *
 * Read the name carefully, because the name is the point. This answers a question about a SUPPLIER,
 * not about a material, and it is deliberately not called a material-approval verdict.
 *
 * A Material Approval Request approves a specified product. One supplier supplies dozens of them,
 * so "this supplier has an approved request on this project" says nothing whatever about whether
 * the containment, the detectors or the panels on a particular order are the approved ones. The
 * identity that would answer that — a canonical purchased material, carried from requisition line
 * through RFQ, purchase order, receipt and site issue — DOES NOT EXIST in this system yet, and the
 * frozen roadmap gives it to Wave 4 (`BUY-01 Material requisition lines`, and the make/model and
 * selected-line continuity named in that wave's scope).
 *
 * So this states supplier-level evidence honestly and claims nothing beyond it. It is a READ. It
 * does not decide whether a purchase order may issue: that rule belongs to Procurement, which owns
 * one — a supplier with a REJECTED request is refused — and owns no other.
 *
 * The states are kept apart because they are different facts about a supplier:
 *
 *   REJECTED   a consultant refused something this supplier proposed on this project.
 *   PENDING    something is submitted and undecided, or drafted and never sent.
 *   APPROVED / APPROVED_AS_NOTED   a decision exists in their favour — for SOME material.
 *   UNKNOWN    nothing on file at all. Never a pass, and never an approval: nobody has been asked.
 *
 * PENDING is kept apart from UNKNOWN deliberately. "The consultant is holding it" and "nobody ever
 * asked" are different facts, and they imply different actions.
 */
export type SupplierMaterialStanding =
  /** A consultant approved it outright. */
  | 'APPROVED'
  /** Approved subject to the recorded comments — permitted to proceed, and the comments are binding. */
  | 'APPROVED_AS_NOTED'
  /** Submitted and undecided. Not a refusal, and emphatically not an approval. */
  | 'PENDING'
  /** A consultant refused it. */
  | 'REJECTED'
  /** No request exists for this material at all. NOT a pass — nobody has been asked. */
  | 'UNKNOWN';

export interface SupplierMaterialStandingRead {
  standing: SupplierMaterialStanding;
  /** In words, for the person who has to act on it. */
  reason: string;
  /** The requests this verdict was read from, so the answer can be drilled into. */
  references: string[];
  /**
   * Is there a refusal standing against this supplier on this project?
   *
   * The ONLY question this read is entitled to answer for a governed decision, because it is the
   * only one that does not depend on knowing which material is being bought. Procurement's owned
   * rule consumes exactly this and nothing else.
   */
  hasStandingRefusal: boolean;
}

/** Which MARs are about this supplier — by canonical id where one is recorded, by name otherwise. */
function about(mars: readonly MaterialApproval[], supplier: { id?: string | null; name?: string | null }): MaterialApproval[] {
  const id = supplier.id?.trim();
  const name = supplier.name?.trim().toLowerCase();
  return mars.filter((mar) => {
    // A canonical id is the answer when the record carries one; the free-text name is a fallback for
    // requests raised before suppliers were linked, and is deliberately the WEAKER match rather than
    // the primary one — two suppliers can share a name, and one supplier can be typed three ways.
    if (id && mar.supplierId) return mar.supplierId === id;
    return !!name && mar.supplier.trim().toLowerCase() === name;
  });
}

/**
 * The verdict for one material on one project, read from every request about it.
 *
 * WORST-CASE WINS among decisions that exist. A supplier with one rejected request and one approved
 * request has something refused on this project, and reporting only the approval would hide the
 * refusal behind it. The order is REJECTED → PENDING → APPROVED_AS_NOTED → APPROVED, and it is not
 * a severity gradient for its own sake: each step is the answer a buyer most needs to see first.
 *
 * PURE, and takes the requests as data — the edges are the whole point: nothing on file, something
 * still under review, and a refusal sitting beside an approval.
 */
export function supplierMaterialStanding(
  mars: readonly MaterialApproval[],
  supplier: { id?: string | null; name?: string | null },
): SupplierMaterialStandingRead {
  const relevant = about(mars, supplier);
  const named = supplier.name?.trim() || supplier.id?.trim() || 'this supplier';
  const refs = (list: MaterialApproval[]): string[] => list.map((mar) => mar.reference);

  if (relevant.length === 0) {
    return {
      standing: 'UNKNOWN',
      // Said as an absence, not as a permission. A buyer reading this knows what to do next.
      reason: `no material approval request exists for ${named} on this project, so nothing has been approved — raise one before ordering`,
      references: [],
      hasStandingRefusal: false,
    };
  }

  const rejected = relevant.filter((mar) => mar.status === 'rejected');
  if (rejected.length > 0) {
    return {
      standing: 'REJECTED',
      reason: `${named} has ${rejected.length} rejected material approval request(s) on this project: ${refs(rejected).join(', ')}`,
      references: refs(rejected),
      hasStandingRefusal: true,
    };
  }

  const pending = relevant.filter((mar) => mar.status === 'submitted' || mar.status === 'draft');
  if (pending.length > 0) {
    const submitted = pending.filter((mar) => mar.status === 'submitted');
    return {
      standing: 'PENDING',
      reason: submitted.length > 0
        ? `${named} has ${submitted.length} material approval request(s) awaiting the consultant's decision: ${refs(submitted).join(', ')}`
        : `${named} has ${pending.length} material approval request(s) still in draft, never submitted: ${refs(pending).join(', ')}`,
      references: refs(pending),
      hasStandingRefusal: false,
    };
  }

  const asNoted = relevant.filter((mar) => mar.status === 'approved_as_noted');
  if (asNoted.length > 0) {
    return {
      standing: 'APPROVED_AS_NOTED',
      // Permitted, and the comments travel with the permission: "approved as noted" is an approval
      // with conditions attached, and dropping the conditions would make it read as unconditional.
      reason: `approved as noted — the recorded comments are binding: ${refs(asNoted).join(', ')}`,
      references: refs(asNoted),
      hasStandingRefusal: false,
    };
  }

  const approved = relevant.filter((mar) => mar.status === 'approved');
  return {
    standing: 'APPROVED',
    reason: `approved on ${refs(approved).join(', ')}`,
    references: refs(approved),
    hasStandingRefusal: false,
  };
}
