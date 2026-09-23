import { randomUUID, createHash } from 'node:crypto';
import type { AcceptanceMethod } from './handover';

/**
 * EVIDENCE OF A WITNESSED SIGN-OFF.
 *
 * A commissioning record has carried `commissionedBy` and `witnessedBy` since it existed, and the
 * evidence pack printed two blank ruled lines beneath a note describing "the witnessed sign-off".
 * Both names are free text typed by whoever was at the keyboard, so the document asserted a
 * witnessed sign-off while holding nothing at all from the witness.
 *
 * What each party leaves behind depends on HOW it was signed — two strokes on a tablet, one
 * scanned test sheet carrying both signatures, or an emailed confirmation and no signature — so
 * this is a row per party rather than a fixed set of columns.
 */

/** The two sides of a commissioning sign-off. Text, so a second witness needs no migration. */
export type SignoffParty = 'commissioning_engineer' | 'witness';

export const SIGNOFF_PARTIES: readonly SignoffParty[] = ['commissioning_engineer', 'witness'];

export const SIGNOFF_PARTY_LABEL: Record<SignoffParty, string> = {
  commissioning_engineer: 'Commissioning Engineer',
  witness: 'Witness (Consultant / Client)',
};

/**
 * ON WHOSE BEHALF A PARTY SIGNED — which is not the same question as which side they are.
 *
 * `party` says which side of the sign-off signed. This says whose standing it was, and on a UAE
 * ELV project the difference is not decorative: a consultant's witness, the client's own
 * representative and an authority inspector (Civil Defence, SIRA) are three different things, and
 * a certificate recording “witnessed by R. Consultant” without saying which of them signed is a
 * certificate nobody can rely on a year later.
 */
export type SignatoryAuthority = 'contractor' | 'consultant' | 'client' | 'authority';

export const SIGNATORY_AUTHORITIES: readonly SignatoryAuthority[] = ['contractor', 'consultant', 'client', 'authority'];

export const SIGNATORY_AUTHORITY_LABEL: Record<SignatoryAuthority, string> = {
  contractor: 'for the contractor',
  consultant: 'for the consultant',
  client: 'for the client',
  authority: 'for the authority having jurisdiction',
};

/**
 * The same three methods the handover acceptance declares, and for the same reason: an emailed
 * confirmation proves the witness accepted and proves nothing about a signature, so a document
 * that cannot say which it holds will print the wrong one.
 */
export type SignoffMethod = AcceptanceMethod;

export interface SignoffEvidence {
  id: string;
  tenantId: string;
  companyId: string | null;
  commissioningId: string;
  projectId: string;
  party: SignoffParty;
  /** WHO SIGNED — a label, because a consultant's witness holds no AURA account. */
  signedBy: string;
  method: SignoffMethod;
  /**
   * WHOSE standing the signatory had. Required for a witness — “witnessed by” with no party
   * behind it is the gap TC-06 names — and `contractor` for the engineer, who signs for the
   * contractor by definition.
   */
  authority: SignatoryAuthority;
  /** The DMS document. Two parties may name the SAME one when a single sheet carries both. */
  documentId: string;
  documentHash: string;
  /** The commissioned result this signature was given for. */
  signedContentHash: string;
  /** WHO ENTERED IT in AURA, never the signatory. */
  recordedBy: string | null;
  createdAt: string;
}

export interface NewSignoffEvidence {
  tenantId: string;
  companyId?: string | null;
  commissioningId: string;
  projectId: string;
  party: SignoffParty;
  signedBy: string;
  method: SignoffMethod;
  authority?: SignatoryAuthority;
  documentId: string;
  documentHash: string;
  signedContentHash: string;
  recordedBy?: string | null;
}

export function makeSignoffEvidence(input: NewSignoffEvidence): SignoffEvidence {
  if (!SIGNOFF_PARTIES.includes(input.party)) {
    throw new Error(`validation: a sign-off party must be one of ${SIGNOFF_PARTIES.join(', ')}`);
  }
  // THE SIGNATORY IS NAMED OR THERE IS NO EVIDENCE. Falling back to the recording user is the
  // defect this whole row exists to remove, so it is refused rather than defaulted.
  if (!input.signedBy?.trim()) {
    throw new Error('validation: sign-off evidence requires the name of the person who signed it — whoever recorded it is not therefore its signatory');
  }
  if (!input.documentId?.trim() || !input.documentHash?.trim()) {
    throw new Error('validation: sign-off evidence requires both the stored document and its checksum — one without the other attests to nothing');
  }
  if (!input.signedContentHash?.trim()) {
    throw new Error('validation: sign-off evidence must record what was signed — a signature bound to a record rather than to its result cannot be checked against anything');
  }
  /**
   * A WITNESS MUST SAY WHOSE WITNESS THEY ARE.
   *
   * The engineer signs for the contractor by definition, so that one is defaulted rather than
   * asked. A witness is the whole point of the question: refusing here is what makes the
   * certificate able to say “for the consultant” instead of leaving a reader to assume it.
   */
  const authority = input.authority ?? (input.party === 'commissioning_engineer' ? 'contractor' : undefined);
  if (!authority) {
    throw new Error('validation: a witness signature must record whose witness it is — a consultant, the client and an authority inspector are three different standings on a certificate');
  }
  if (!SIGNATORY_AUTHORITIES.includes(authority)) {
    throw new Error(`validation: a signatory authority must be one of ${SIGNATORY_AUTHORITIES.join(', ')}`);
  }
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    commissioningId: input.commissioningId,
    projectId: input.projectId,
    party: input.party,
    signedBy: input.signedBy.trim(),
    method: input.method,
    authority,
    documentId: input.documentId.trim(),
    documentHash: input.documentHash.trim(),
    signedContentHash: input.signedContentHash.trim(),
    recordedBy: input.recordedBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * WHAT A SIGN-OFF SIGNATURE ACTUALLY COVERS.
 *
 * Not the record's id — that never changes and so proves nothing. What a witness puts their name
 * to is the RESULT: this system, tested on this date, with these points passed out of these
 * points, and every one of them passing. Binding to the id alone would let the test sheet be
 * reworked afterwards while the certificate went on printing the witness's signature beneath the
 * new figures.
 *
 * SCOPE, stated rather than left to be inferred: the code, the system type, the test date, and the
 * point tally. The individual point results are not hashed — a record cannot be commissioned while
 * any point stands failed or unexecuted, so the tally being complete IS the statement about them,
 * and hashing sixty rows would make the check fail on a cosmetic edit to a description.
 */
export interface SignedCommissioningResult {
  code: string;
  system: string;
  testDate: string | null;
  pointsPassed: number;
  pointsTotal: number;
}

export function commissioningResultHash(record: SignedCommissioningResult): string {
  const canonical = [
    `code=${record.code}`,
    `system=${record.system}`,
    `testDate=${record.testDate ?? ''}`,
    `passed=${Number(record.pointsPassed) || 0}`,
    `total=${Number(record.pointsTotal) || 0}`,
  ].join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Whether a signature still covers what the record now says.
 *
 * Same three-answer contract as the site daily report: `unverifiable` is reserved for evidence
 * written before the hash existed, and must never be rendered as a mismatch. This table starts
 * with the column, so `unverifiable` should not occur here — it is kept because a surface shared
 * with the site sheet must not have two different shapes for the same question.
 */
export function signoffCoversResult(
  signedContentHash: string | null | undefined,
  record: SignedCommissioningResult,
): 'current' | 'superseded' | 'unverifiable' {
  if (!signedContentHash?.trim()) return 'unverifiable';
  return signedContentHash === commissioningResultHash(record) ? 'current' : 'superseded';
}

/**
 * WHAT THE EVIDENCE PACK MAY SAY ABOUT EACH PARTY.
 *
 * `signed` only for `electronic` and `paper`. An emailed confirmation from a consultant is
 * evidence that they accepted the result and evidence that they did NOT sign, so placing it under
 * a signature block would manufacture a signature out of a message — the same rule the handover
 * certificate follows.
 */
export function signoffIsSigned(evidence: SignoffEvidence): boolean {
  return evidence.method === 'electronic' || evidence.method === 'paper';
}

/**
 * The row for one party, or null — so a surface reads one shape for "present" and "absent".
 *
 * THE LATEST WINS, and the earlier rows stay. A party signing again is a correction, and 0383
 * removed the unique index that used to make it an overwrite: that a sign-off was signed once and
 * then signed again is exactly what an auditor needs, and exactly what replacing the row erased.
 * The same rule the site daily report and the inspection request already follow.
 */
export function evidenceForParty(
  evidence: readonly SignoffEvidence[],
  party: SignoffParty,
): SignoffEvidence | null {
  const mine = evidence.filter((e) => e.party === party);
  return mine.length ? mine[mine.length - 1] : null;
}
