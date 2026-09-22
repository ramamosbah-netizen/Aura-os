import type { Document } from '@aura/shared';

/**
 * COMMITTED EVIDENCE — A DOCUMENT A GOVERNING ACT HAS ALREADY RELIED ON.
 *
 * DMS is deliberately generic: a document has an owner, and `DEFAULT_OWNER_POLICY` gives that
 * owner EDIT, which is right for almost everything in the system. A specification, a drawing, a
 * quotation — their author revises them, and a new version is the normal way that happens.
 *
 * It is wrong for one class of document. When a witness signs a commissioning sign-off, a client
 * signs a handover acceptance, a consultant signs an inspection or a supervisor signs a day's
 * work, the ACT that relied on those bytes is finished and recorded against them. The person who
 * recorded the act is `createdBy` on the document, so the generic owner policy handed the recorder
 * EDIT on the very signature that constrains them — and `POST /documents/:id/versions` would
 * replace the image the witness gave, leaving the record pointing at bytes nobody signed.
 *
 * ## Why a port rather than a rule in here
 *
 * Only the owning module knows whether a document has been relied upon: the commissioning module
 * knows its sign-off rows, quality knows its inspection evidence, site knows its daily report.
 * Core cannot import them, and hard-coding a list of aggregate types here would rot the first time
 * one was added. So modules answer for themselves through a provider, exactly as they already do
 * for entity-inherited access.
 *
 * ## What sealing does and does not do
 *
 * It removes the WRITE levels — and only those — from the authorization decision, whatever their
 * source: owner, direct share, team, role, company or context. Reading is untouched: the whole
 * point of this evidence is that the people entitled to it can open it.
 *
 * It does NOT delete anything and it is not a lock somebody holds. A correction is still possible
 * and is supposed to be: it happens through the owning module's own governed act, which attaches a
 * NEW document and keeps the old one, so the record shows that it was signed, and then signed
 * again. What cannot happen is the bytes changing underneath a signature that is already cited.
 */
export interface CommittedEvidenceVerdict {
  committed: boolean;
  /**
   * Why, in the words a refusal can print. Names the act that relied on the document and the way
   * a correction is actually made — a refusal that only says "denied" sends somebody looking for
   * a permission to grant themselves.
   */
  reason?: string;
}

export const NOT_COMMITTED: CommittedEvidenceVerdict = { committed: false };

export interface CommittedEvidenceProvider {
  /** The `aggregateType` this provider speaks for. Recorded on the refusal so it can be traced. */
  readonly entity: string;
  /**
   * Has a completed act relied on these bytes?
   *
   * Must not throw: a provider that cannot answer leaves the document unsealed rather than
   * failing every write in the system. The write path is still gated by the ordinary permission
   * check, so an unavailable provider degrades to the behaviour that existed before it.
   */
  isCommitted(document: Document): Promise<CommittedEvidenceVerdict>;
}

/**
 * The levels withheld from a committed document.
 *
 * EDIT is the one that matters — it is what `addVersion` asserts. SHARE goes with it because a
 * SHARE holder can grant EDIT to somebody else, and a seal that can be delegated around is not a
 * seal. VIEW, DOWNLOAD and COMMENT are deliberately untouched.
 */
export const SEALED_LEVELS = ['EDIT', 'SHARE'] as const;
