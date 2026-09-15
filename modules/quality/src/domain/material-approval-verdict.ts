import type { MaterialApproval } from './material-approval';

/**
 * §22 — MAY THIS MATERIAL BE BOUGHT AND INSTALLED? (ENG-04)
 *
 * The Material Approval Request is the canonical record of an approved material submittal: the
 * contractor proposes a product — manufacturer, supplier, specification — and the consultant
 * approves, approves as noted, or rejects it before anything is procured or fixed to the building.
 *
 * The record was sound. What the word "approved" MEANT was not, and this is why:
 *
 *   The procurement gate asked "does this supplier have a REJECTED request on this project?" and
 *   passed whenever the answer was no. So a material nobody ever submitted, and a material still
 *   sitting with the consultant, issued a purchase order exactly like an approved one. Absence of a
 *   rejection was being read as approval — "we could not find a problem" rounded up to "no problem",
 *   which is the one inference this programme refuses everywhere else.
 *
 * So the question is asked the right way round. APPROVED is a thing somebody DID, and it is the only
 * state that reads as approved. UNKNOWN is its own answer and never a pass: a project with no
 * material approval on file has not approved the material, it has said nothing about it.
 *
 * PENDING is kept apart from UNKNOWN deliberately. "The consultant is holding it" and "nobody ever
 * asked" are different facts about a purchase order, and telling a buyer which one they are looking
 * at is the difference between waiting and submitting.
 */

export type MaterialApprovalVerdict =
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

export interface MaterialApprovalAnswer {
  verdict: MaterialApprovalVerdict;
  /** In words, for the person who has to act on it. */
  reason: string;
  /** The requests this verdict was read from, so the answer can be drilled into. */
  references: string[];
  /**
   * May procurement and installation proceed on this material?
   *
   * TRUE only for a decision somebody made in its favour. Never true for UNKNOWN, and never true
   * merely because nothing was found.
   */
  mayProceed: boolean;
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
export function materialApprovalVerdict(
  mars: readonly MaterialApproval[],
  supplier: { id?: string | null; name?: string | null },
): MaterialApprovalAnswer {
  const relevant = about(mars, supplier);
  const named = supplier.name?.trim() || supplier.id?.trim() || 'this supplier';
  const refs = (list: MaterialApproval[]): string[] => list.map((mar) => mar.reference);

  if (relevant.length === 0) {
    return {
      verdict: 'UNKNOWN',
      // Said as an absence, not as a permission. A buyer reading this knows what to do next.
      reason: `no material approval request exists for ${named} on this project, so nothing has been approved — raise one before ordering`,
      references: [],
      mayProceed: false,
    };
  }

  const rejected = relevant.filter((mar) => mar.status === 'rejected');
  if (rejected.length > 0) {
    return {
      verdict: 'REJECTED',
      reason: `${named} has ${rejected.length} rejected material approval request(s) on this project: ${refs(rejected).join(', ')}`,
      references: refs(rejected),
      mayProceed: false,
    };
  }

  const pending = relevant.filter((mar) => mar.status === 'submitted' || mar.status === 'draft');
  if (pending.length > 0) {
    const submitted = pending.filter((mar) => mar.status === 'submitted');
    return {
      verdict: 'PENDING',
      reason: submitted.length > 0
        ? `${named} has ${submitted.length} material approval request(s) awaiting the consultant's decision: ${refs(submitted).join(', ')}`
        : `${named} has ${pending.length} material approval request(s) still in draft, never submitted: ${refs(pending).join(', ')}`,
      references: refs(pending),
      mayProceed: false,
    };
  }

  const asNoted = relevant.filter((mar) => mar.status === 'approved_as_noted');
  if (asNoted.length > 0) {
    return {
      verdict: 'APPROVED_AS_NOTED',
      // Permitted, and the comments travel with the permission: "approved as noted" is an approval
      // with conditions attached, and dropping the conditions would make it read as unconditional.
      reason: `approved as noted — the recorded comments are binding: ${refs(asNoted).join(', ')}`,
      references: refs(asNoted),
      mayProceed: true,
    };
  }

  const approved = relevant.filter((mar) => mar.status === 'approved');
  return {
    verdict: 'APPROVED',
    reason: `approved on ${refs(approved).join(', ')}`,
    references: refs(approved),
    mayProceed: true,
  };
}
