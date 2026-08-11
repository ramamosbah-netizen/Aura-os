import { randomUUID } from 'node:crypto';

/**
 * The immutable record of a QA close-out verification on a corrected NCR. `accepted` closes the NCR;
 * `rejected` sends it back for re-correction and MUST carry a note so the owner knows why. Mirrors
 * the drawing-review pattern: the aggregate holds the current status, this holds the transaction.
 */
export type NcrVerificationOutcome = 'accepted' | 'rejected';

export interface NcrVerification {
  id: string;
  tenantId: string;
  companyId: string | null;
  ncrId: string;
  ncrNumber: string;
  projectId: string;
  verifiedBy: string | null;
  verifiedAt: string;
  outcome: NcrVerificationOutcome;
  note: string | null;
}

export interface NewNcrVerification {
  tenantId: string;
  companyId?: string | null;
  ncrId: string;
  ncrNumber: string;
  projectId: string;
  verifiedBy?: string | null;
  outcome: NcrVerificationOutcome;
  note?: string | null;
}

export function makeNcrVerification(input: NewNcrVerification): NcrVerification {
  if (input.outcome !== 'accepted' && input.outcome !== 'rejected') {
    throw new Error(`unknown verification outcome: ${input.outcome}`);
  }
  if (input.outcome === 'rejected' && !input.note?.trim()) {
    throw new Error('a rejected verification requires a note explaining what is still non-conforming');
  }
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    ncrId: input.ncrId,
    ncrNumber: input.ncrNumber,
    projectId: input.projectId,
    verifiedBy: input.verifiedBy ?? null,
    verifiedAt: new Date().toISOString(),
    outcome: input.outcome,
    note: input.note?.trim() || null,
  };
}
