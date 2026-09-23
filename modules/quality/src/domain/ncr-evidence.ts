import { randomUUID } from 'node:crypto';

/**
 * WHAT AN NCR IS EVIDENCED BY, ON BOTH SIDES OF IT.
 *
 * QHS-03 asks that "QA/QC raises an EVIDENCED NCR". The record could carry nothing: the screen has
 * shown a "QA / Inspector Sign-off" pad since it existed, bound to React state the submit payload
 * never read, and there was no attachment route for a photograph of the thing that was wrong.
 *
 * THE STAGE IS WHAT MAKES ONE TABLE RIGHT HERE, where the inspection request needed only a flat
 * list. A photograph of the defect and a photograph of the repair are both evidence of the same
 * NCR and they are not interchangeable — closing an NCR on a picture of the original fault is
 * exactly the confusion this column prevents, and a reader who cannot tell them apart has no
 * evidence at all.
 */

export type NcrEvidenceStage = 'raised' | 'corrected';
export type NcrEvidenceCategory = 'photo' | 'signature' | 'other';

export const NCR_EVIDENCE_STAGES: readonly NcrEvidenceStage[] = ['raised', 'corrected'];
export const NCR_EVIDENCE_CATEGORIES: readonly NcrEvidenceCategory[] = ['photo', 'signature', 'other'];

export interface NcrEvidence {
  id: string;
  tenantId: string;
  companyId: string | null;
  ncrId: string;
  projectId: string;
  fileId: string;
  /** Which side of the NCR this evidences: the non-conformance, or the correction. */
  stage: NcrEvidenceStage;
  category: NcrEvidenceCategory;
  description: string | null;
  /** WHO UPLOADED IT. Never presented as the signatory. */
  capturedBy: string | null;
  hash: string | null;
  /**
   * WHO SIGNED — a label, because a subcontractor's foreman signing off a repair holds no AURA
   * account. Never derived from `capturedBy`, and null on anything that is not a signature.
   */
  signedBy: string | null;
  createdAt: string;
}

export interface NewNcrEvidence {
  tenantId: string;
  companyId?: string | null;
  ncrId: string;
  projectId: string;
  fileId: string;
  stage?: NcrEvidenceStage;
  category?: NcrEvidenceCategory;
  description?: string | null;
  capturedBy?: string | null;
  hash?: string | null;
  signedBy?: string | null;
}

export function makeNcrEvidence(input: NewNcrEvidence): NcrEvidence {
  if (!input.fileId?.trim()) throw new Error('validation: fileId is required');
  const stage = input.stage ?? 'raised';
  if (!NCR_EVIDENCE_STAGES.includes(stage)) {
    throw new Error(`validation: an NCR evidence stage must be one of ${NCR_EVIDENCE_STAGES.join(', ')}`);
  }
  const category = input.category ?? 'photo';
  if (!NCR_EVIDENCE_CATEGORIES.includes(category)) {
    throw new Error(`validation: category must be one of ${NCR_EVIDENCE_CATEGORIES.join(', ')}`);
  }
  const signedBy = input.signedBy?.trim() || null;
  // A SIGNATURE MUST NAME ITS SIGNATORY. No fallback to whoever uploaded it: the fallback is the
  // defect, and the record would resume reading "signed by <the account that pressed upload>".
  if (category === 'signature' && !signedBy) {
    throw new Error('validation: a signature requires the name of the person who signed it — whoever uploaded it is not therefore its signatory');
  }
  if (category !== 'signature' && signedBy) {
    throw new Error(`validation: only a signature may name a signatory; this evidence is filed as ${category}`);
  }
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    ncrId: input.ncrId,
    projectId: input.projectId,
    fileId: input.fileId.trim(),
    stage,
    category,
    description: input.description?.trim() || null,
    capturedBy: input.capturedBy?.trim() || null,
    hash: input.hash?.trim() || null,
    signedBy,
    createdAt: new Date().toISOString(),
  };
}

/**
 * IS THIS NCR EVIDENCED, and on which side?
 *
 * Reported as two independent facts rather than one boolean. An NCR with a photograph of the
 * defect and nothing of the repair is in a different state from one with neither, and a surface
 * that collapses them cannot tell a reader which half is missing.
 */
export function ncrEvidenceCoverage(evidence: readonly NcrEvidence[]): { raised: boolean; corrected: boolean } {
  return {
    raised: evidence.some((e) => e.stage === 'raised'),
    corrected: evidence.some((e) => e.stage === 'corrected'),
  };
}
