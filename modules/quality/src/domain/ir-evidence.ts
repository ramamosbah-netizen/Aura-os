import { createHash, randomUUID } from 'node:crypto';
import type { InspectionRequest } from './inspection-request';

/**
 * WHAT AN INSPECTION ACTUALLY PRODUCED.
 *
 * An inspection request says a thing was looked at and passed. Until now it could carry no
 * photograph of what was looked at and no signature from whoever looked, because quality has never
 * had an upload route — every multipart door in AURA was in CRM, Tendering, DocControl and Site.
 * The screen has shown an "Inspector / Witness Signature" pad the whole time, bound to state the
 * submit payload never read.
 *
 * Deliberately the same shape as the site daily report's evidence: an inspection produces the same
 * two artefacts a site diary does, and a second vocabulary for one idea would be a second place to
 * get the signer/recorder distinction wrong.
 */

export type IrEvidenceCategory = 'photo' | 'signature' | 'other';

export const IR_EVIDENCE_CATEGORIES: readonly IrEvidenceCategory[] = ['photo', 'signature', 'other'];

export interface IrEvidence {
  id: string;
  tenantId: string;
  companyId: string | null;
  inspectionId: string;
  projectId: string;
  fileId: string;
  /**
   * WHAT THE FILE IS, so no surface has to guess it from free text. The daily report's certificate
   * used to select its signature with a regex over the uploader's own description and printed a
   * progress photo described "sign-off" AS the signature on a controlled document.
   */
  category: IrEvidenceCategory;
  description: string | null;
  location: string | null;
  capturedAt: string | null;
  /** WHO UPLOADED IT. Never presented as the signatory. */
  capturedBy: string | null;
  hash: string | null;
  /**
   * WHO SIGNED — a label, because an inspection is witnessed by a consultant who holds no AURA
   * account. Never derived from `capturedBy`. Null on anything that is not a signature.
   */
  signedBy: string | null;
  /** The inspection result this signature was given for. Null on anything but a signature. */
  signedContentHash: string | null;
  createdAt: string;
}

export interface NewIrEvidence {
  tenantId: string;
  companyId?: string | null;
  inspectionId: string;
  projectId: string;
  fileId: string;
  category?: IrEvidenceCategory;
  description?: string | null;
  location?: string | null;
  capturedAt?: string | null;
  capturedBy?: string | null;
  hash?: string | null;
  signedBy?: string | null;
  signedContentHash?: string | null;
}

export function makeIrEvidence(input: NewIrEvidence): IrEvidence {
  if (!input.fileId?.trim()) throw new Error('validation: fileId is required');
  const category = input.category ?? 'photo';
  if (!IR_EVIDENCE_CATEGORIES.includes(category)) {
    throw new Error(`validation: category must be one of ${IR_EVIDENCE_CATEGORIES.join(', ')}`);
  }
  const signedBy = input.signedBy?.trim() || null;
  // A SIGNATURE MUST NAME ITS SIGNATORY. No fallback to whoever uploaded it: the fallback is the
  // defect, and a document would resume reading "Signed by <the account that pressed upload>".
  if (category === 'signature' && !signedBy) {
    throw new Error('validation: a signature requires the name of the person who signed it — whoever uploaded it is not therefore its signatory');
  }
  // …and only a signature may carry one, so a surface has exactly one place to look.
  if (category !== 'signature' && signedBy) {
    throw new Error(`validation: only a signature may name a signatory; this evidence is filed as ${category}`);
  }
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    inspectionId: input.inspectionId,
    projectId: input.projectId,
    fileId: input.fileId.trim(),
    category,
    description: input.description?.trim() || null,
    location: input.location?.trim() || null,
    capturedAt: input.capturedAt ?? null,
    capturedBy: input.capturedBy?.trim() || null,
    hash: input.hash?.trim() || null,
    signedBy,
    signedContentHash: input.signedContentHash?.trim() || null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * THE RESULT AN INSPECTION SIGNATURE COVERS.
 *
 * Not the IR's id, which never changes and so proves nothing. What a witness puts their name to is
 * the OUTCOME: this IR number, this trade, this location, inspected on this date, approved or
 * rejected, for this measured quantity. An IR that is re-commented or re-measured afterwards must
 * not keep printing the witness's signature beneath the new figures.
 *
 * SCOPE, stated rather than inferred: the identifying fields, the decision and the measured
 * quantity. `comments` are deliberately excluded — a QA engineer correcting a typo in their own
 * remark has not changed what the witness agreed to, and a check that fires on that would teach
 * people to ignore it.
 */
export interface SignedInspectionResult {
  irNumber: string;
  discipline: string;
  locationDetail: string;
  inspectionDate: string;
  status: string;
  approvedQuantity: number | null;
  unit: string | null;
}

export function inspectionResultHash(ir: SignedInspectionResult): string {
  const canonical = [
    `ir=${ir.irNumber}`,
    `discipline=${ir.discipline}`,
    `location=${ir.locationDetail}`,
    `date=${ir.inspectionDate}`,
    `status=${ir.status}`,
    `qty=${ir.approvedQuantity ?? ''}`,
    `unit=${ir.unit ?? ''}`,
  ].join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Whether a signature still covers what the inspection now says.
 *
 * Same three-answer contract as the site daily report and the commissioning sign-off:
 * `unverifiable` is for evidence written before the hash existed and must never be rendered as a
 * mismatch. One shape for one question, across every surface that asks it.
 */
export function signatureCoversInspection(
  signedContentHash: string | null | undefined,
  ir: SignedInspectionResult,
): 'current' | 'superseded' | 'unverifiable' {
  if (!signedContentHash?.trim()) return 'unverifiable';
  return signedContentHash === inspectionResultHash(ir) ? 'current' : 'superseded';
}

export interface ResolvedInspectionSignature {
  evidence: IrEvidence;
  coverage: 'current' | 'superseded' | 'unverifiable';
}

/**
 * THE SIGNATURE THIS INSPECTION CARRIES, resolved in one place.
 *
 * The printable IR lives in apps/web, which cannot import this module, so it must be TOLD which
 * row is the signature and whether it still covers the result — rather than re-deriving the
 * selection rule and the hash, which is two answers to one question drifting apart in silence.
 *
 * The last signature wins: an inspection re-signed after being re-measured is covered by the later
 * one, and the earlier row stays as the record that it was signed once and then changed.
 */
export function resolveInspectionSignature(
  evidence: readonly IrEvidence[],
  ir: SignedInspectionResult,
): ResolvedInspectionSignature | null {
  const signatures = evidence.filter((e) => e.category === 'signature');
  const latest = signatures.length ? signatures[signatures.length - 1] : null;
  if (!latest) return null;
  return { evidence: latest, coverage: signatureCoversInspection(latest.signedContentHash, ir) };
}

/** Narrowing helper so callers pass a whole IR without restating its fields. */
export function signedInspectionResult(ir: InspectionRequest): SignedInspectionResult {
  return {
    irNumber: ir.irNumber,
    discipline: ir.discipline,
    locationDetail: ir.locationDetail,
    inspectionDate: ir.inspectionDate,
    status: ir.status,
    approvedQuantity: ir.approvedQuantity,
    unit: ir.unit,
  };
}
