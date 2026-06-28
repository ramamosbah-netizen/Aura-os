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
    createdAt: new Date().toISOString(),
  };
}

export const CLAIM_EVENT = {
  created: 'subcontracts.claim.created',
  statusChanged: 'subcontracts.claim.statusChanged',
} as const;
