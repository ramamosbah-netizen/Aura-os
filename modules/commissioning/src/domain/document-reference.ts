/**
 * Resolving a document reference against Document Control's register (TC-GATE-6).
 *
 * TC-GATE-5 gave the O&M pack a `documentId` and called it "a reference into DocControl". It was
 * nothing of the kind: it was free text nobody checked, so a typo recorded a reference to a document
 * that does not exist, and the pack still read "accepted". This module is what makes the word
 * REFERENCE true — the register is asked whether the thing being pointed at is really there.
 *
 * WHAT THIS DOES NOT DO: copy anything. A resolved reference is DocControl's row, read at the moment
 * it is needed and thrown away. Nothing here is stored, so nothing here can drift out of step with
 * the register — which is the entire reason Handover holds the pack and DocControl holds the
 * documents.
 *
 * MATCHING BY NUMBER AS WELL AS ID is deliberate. The control that captures this asks a person for a
 * reference, and a person types the document NUMBER they can see on the drawing — `ELV-OM-014` —
 * never a UUID. Accepting only the id would be a rule the interface itself makes impossible to obey.
 */

/**
 * A controlled document, as the register describes it. Structurally identical to what DocControl
 * returns; declared HERE because the consumer owns the shape of what it asks for (ADR-0004).
 */
export interface ControlledDocumentFact {
  id: string;
  documentNumber: string;
  title: string;
  revision: string;
  /** `RegisterStatus`: draft | for_review | for_construction | superseded | as_built */
  status: string;
  /** `RegisterDiscipline`: architectural | structural | mep | elv | civil | other */
  discipline: string;
  /** `RegisterDocType`: drawing | specification | document | bod | calculation */
  docType: string;
}

/**
 * The register's one status that makes handing a document over actively wrong.
 *
 * The others are NOT tested, and that is a limit rather than an oversight: `RegisterStatus` is
 * drawing-shaped (`for_construction`), and an O&M manual has no honest state in it. Demanding one
 * would push people to label manuals "for construction" — a lie the check itself caused. So the
 * question asked is the one the vocabulary can actually answer: does it exist, and has it been
 * replaced?
 */
export const SUPERSEDED_STATUS = 'superseded';

/** The register status that marks a drawing as the as-built record. Engineering has no equivalent. */
export const AS_BUILT_STATUS = 'as_built';

export interface ResolvedDocument {
  /** What was typed, kept verbatim so a reader can see the reference that failed. */
  reference: string;
  /** The register row, or null when nothing matched. */
  document: ControlledDocumentFact | null;
  /** Matched nothing in the project register — the typo case. */
  missing: boolean;
  /** Matched, but the register has since moved on. Handing this over gives the client stale paper. */
  superseded: boolean;
}

/**
 * Resolve one reference.
 *
 * Returns NULL when there is nothing to say — no reference was given, or the register could not be
 * read at all. A null is not a pass and not a failure: callers must treat it as UNKNOWN, the same
 * rule every other cross-domain reading in this module follows.
 */
export function resolveDocumentReference(
  reference: string | null | undefined,
  documents: ControlledDocumentFact[] | null,
): ResolvedDocument | null {
  const needle = reference?.trim();
  if (!needle || documents === null) return null;
  const lowered = needle.toLowerCase();
  // Id first: it is exact. A document NUMBER is what a person types, and two registers can hold the
  // same number on different projects — but `documents` is already one project's register, so within
  // it the number is the identifier a human means.
  const document =
    documents.find((d) => d.id.toLowerCase() === lowered) ??
    documents.find((d) => d.documentNumber.trim().toLowerCase() === lowered) ??
    null;
  return {
    reference: needle,
    document,
    missing: document === null,
    superseded: document !== null && document.status === SUPERSEDED_STATUS,
  };
}

/** Is this reference good enough to hand to a client? Null (unreadable/absent) is never "yes". */
export function referenceIsSound(resolved: ResolvedDocument | null): boolean {
  return resolved !== null && !resolved.missing && !resolved.superseded;
}
