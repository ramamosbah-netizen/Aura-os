import type { Id } from '@aura/shared';
import type { Subcontract, SubcontractStatus } from './domain/subcontract';
import type { Claim, ClaimStatus } from './domain/claim';
import type { BackCharge, BackChargeStatus } from './domain/back-charge';

export const SUBCONTRACT_STORE = Symbol('SUBCONTRACT_STORE');

export interface SubcontractFilter {
  tenantId?: string;
  projectId?: string;
  status?: SubcontractStatus;
}

export interface ClaimFilter {
  tenantId?: string;
  subcontractId?: string;
  status?: ClaimStatus;
}

export interface BackChargeFilter {
  tenantId?: string;
  subcontractId?: string;
  status?: BackChargeStatus;
}

export interface SubcontractStore {
  createSubcontract(s: Subcontract): Promise<void>;
  updateSubcontract(s: Subcontract): Promise<void>;
  getSubcontract(id: Id): Promise<Subcontract | null>;
  listSubcontracts(filter?: SubcontractFilter): Promise<Subcontract[]>;

  createClaim(c: Claim): Promise<void>;
  updateClaim(c: Claim): Promise<void>;
  getClaim(id: Id): Promise<Claim | null>;
  listClaims(filter?: ClaimFilter): Promise<Claim[]>;

  createBackCharge(b: BackCharge): Promise<void>;
  updateBackCharge(b: BackCharge): Promise<void>;
  getBackCharge(id: Id): Promise<BackCharge | null>;
  listBackCharges(filter?: BackChargeFilter): Promise<BackCharge[]>;
}
