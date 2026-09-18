import { type Id, newId } from '@aura/shared';

export type ClaimStatus = 'draft' | 'certified' | 'paid';

export interface Claim {
  id: Id;
  tenantId: Id;
  subcontractId: Id;
  claimNumber: number;
  status: ClaimStatus;
  workCompletedValue: number; // Cumulative gross work completed value
  previouslyCertifiedValue: number; // Cumulative gross value certified in prior periods
  thisPeriodGrossValue: number; // Gross value claimed this period: workCompletedValue - previouslyCertifiedValue
  retentionWithheld: number; // Retention withheld this period (calculated on period gross value)
  netCertifiedValue: number; // Net period payable
  isRetentionRelease: boolean;
  retentionReleased: number;
  certifiedAt: string | null;
  certifiedBy: Id | null;
  /**
   * WHO RAISED IT. `certifiedBy` existed and this did not, which is why the maker/checker rule could
   * not be written against this record: a claim that cannot say who raised it cannot refuse that
   * person's certification. NULL on rows written before authorship was recorded.
   */
  createdBy: Id | null;
  /**
   * WHO RELEASED THE MONEY, and when. It was recorded only on the event spine before — which no rule
   * and no screen reads at decision time, so "who paid this subcontractor" was not a fact the record
   * held.
   */
  paidBy: Id | null;
  paidAt: string | null;
  createdAt: string;
}

export interface NewClaim {
  tenantId: Id;
  subcontractId: Id;
  claimNumber: number;
  workCompletedValue: number;
  previouslyCertifiedValue: number;
  isRetentionRelease?: boolean;
  retentionReleased?: number;
  /** Who is raising it. Recorded so the certification can be refused to them later. */
  createdBy?: Id | null;
}

export function makeClaim(input: NewClaim, retentionPercentage: number): Claim {
  const isRelease = !!input.isRetentionRelease;
  const released = isRelease ? (Number(input.retentionReleased) || 0) : 0;

  const grossCompleted = isRelease ? input.previouslyCertifiedValue : (Number.isFinite(input.workCompletedValue) ? Number(input.workCompletedValue) : 0);
  const previousCertified = Number.isFinite(input.previouslyCertifiedValue) ? Number(input.previouslyCertifiedValue) : 0;
  
  const thisPeriodGross = isRelease ? 0 : Math.max(0, grossCompleted - previousCertified);
  const retention = isRelease ? 0 : Number((thisPeriodGross * (retentionPercentage / 100)).toFixed(2));
  const netCertified = isRelease ? released : Number((thisPeriodGross - retention).toFixed(2));

  return {
    id: newId(),
    tenantId: input.tenantId,
    subcontractId: input.subcontractId,
    claimNumber: input.claimNumber,
    status: 'draft',
    workCompletedValue: grossCompleted,
    previouslyCertifiedValue: previousCertified,
    thisPeriodGrossValue: thisPeriodGross,
    retentionWithheld: retention,
    netCertifiedValue: netCertified,
    isRetentionRelease: isRelease,
    retentionReleased: released,
    certifiedAt: null,
    certifiedBy: null,
    createdBy: input.createdBy ?? null,
    paidBy: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * CERTIFY the claim — the act that turns a subcontractor's application into a sum this business owes.
 *
 * THREE REFUSALS, each one a thing the running API allowed.
 *
 * 1. ALREADY CERTIFIED. Certifying twice used to return 200 and silently re-stamp `certifiedAt` and
 *    `certifiedBy`; the first certification simply vanished. No generations here, unlike a finance
 *    period: the claim model is already CUMULATIVE (`workCompletedValue` less
 *    `previouslyCertifiedValue`), so a correction is the NEXT claim. Two mechanisms for one fact is
 *    the shape this programme keeps removing.
 * 2. THE PERSON WHO RAISED IT. A certificate is one party accepting another party's account of the
 *    work. Where the raiser is unknown — a claim written before authorship was recorded — it proceeds
 *    and the caller is told the check could not run, rather than a control being implied that did not.
 * 3. OVER-CERTIFICATION. `adjustedContractValue` is the subcontract's OWN value, which approving a
 *    variation already adds its signed amount to. This invents no valuation: it refuses to certify
 *    past a figure the system has always maintained. Measured before this existed: a claim of 250,000
 *    against a 100,000 subcontract certified for 225,000 net.
 */
export function certifyClaim(
  claim: Claim,
  certifiedBy: Id | null,
  adjustedContractValue: number,
): Claim {
  if (claim.status === 'certified' || claim.status === 'paid') {
    throw new Error(
      `claim #${claim.claimNumber} is already certified — correct it with the next claim, which carries the cumulative position`,
    );
  }
  if (certifiedBy && claim.createdBy && certifiedBy === claim.createdBy) {
    throw new Error(
      'the person who raised this claim may not certify their own application — a certificate is somebody else accepting the account of the work',
    );
  }
  // The cumulative gross this claim would take the subcontract to. A retention release moves no work
  // value, so it is measured against what was already certified rather than against new work.
  const cumulativeGross = claim.isRetentionRelease
    ? claim.previouslyCertifiedValue
    : claim.workCompletedValue;
  if (cumulativeGross > adjustedContractValue) {
    throw new Error(
      // Phrased to the shared CEILING shape ("would take … past …"), which classifies 409: the request
      // is well formed and the caller entitled to make it — the subcontract is simply not worth this
      // much yet. Telling them to fix their request would be advice they cannot follow; instructing a
      // variation is the act that raises the figure.
      `certifying ${cumulativeGross} would take this subcontract past its authorised value of ${adjustedContractValue} — instruct a variation, which is what raises it`,
    );
  }
  return {
    ...claim,
    status: 'certified',
    certifiedAt: new Date().toISOString(),
    certifiedBy,
  };
}

/** Whether the raiser/certifier separation could actually be CHECKED, derived from the record. */
export function certificationSeparation(c: Claim): 'enforced' | 'unverifiable' | null {
  if (c.certifiedAt === null) return null;
  return c.createdBy ? 'enforced' : 'unverifiable';
}

/**
 * PAY the certified claim — the money actually leaving.
 *
 * The status guard already existed. What did not: the row recorded nobody, and the certifier could
 * release the payment against their own certificate. Certifying says the work is worth this; paying
 * says the money goes now. One signature for both is not a control.
 */
export function payClaim(claim: Claim, paidBy: Id | null): Claim {
  if (claim.status !== 'certified') {
    throw new Error(`Only certified claims can be marked as paid (current status: ${claim.status})`);
  }
  if (paidBy && claim.certifiedBy && paidBy === claim.certifiedBy) {
    throw new Error(
      'the person who certified this claim may not release their own certificate for payment — certifying and paying are two signatures',
    );
  }
  return { ...claim, status: 'paid', paidBy, paidAt: new Date().toISOString() };
}

export const CLAIM_EVENT = {
  created: 'subcontracts.claim.created',
  statusChanged: 'subcontracts.claim.statusChanged',
} as const;
