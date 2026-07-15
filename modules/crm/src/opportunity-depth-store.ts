import type {
  Id, Commitment, CommitmentStatus, DealRegisterItem, OpportunityDealMember, OpportunityStakeholder,
  OpportunityRisk,
} from '@aura/shared';

export const CRM_OPPORTUNITY_DEPTH_STORE = Symbol('CRM_OPPORTUNITY_DEPTH_STORE');

export interface StakeholderFilter { tenantId: string; opportunityId?: string }
export interface DealTeamFilter { tenantId: string; opportunityId?: string }
export interface CommitmentFilter { tenantId: string; relatedType?: string; relatedId?: string; status?: CommitmentStatus }
export interface RegisterFilter { tenantId: string; relatedType?: string; relatedId?: string }
export interface RiskFilter { tenantId: string; opportunityId?: string }

/** One store for the three opportunity-child collections (stakeholders, deal team, commitments).
 * Saves are upserts; writes are non-transactional (events emitted by the service, mirroring
 * the ActivityService pattern). */
export interface OpportunityDepthStore {
  saveStakeholder(s: OpportunityStakeholder): Promise<void>;
  getStakeholder(id: Id): Promise<OpportunityStakeholder | null>;
  listStakeholders(filter: StakeholderFilter): Promise<OpportunityStakeholder[]>;
  deleteStakeholder(id: Id): Promise<void>;

  saveDealMember(m: OpportunityDealMember): Promise<void>;
  getDealMember(id: Id): Promise<OpportunityDealMember | null>;
  listDealTeam(filter: DealTeamFilter): Promise<OpportunityDealMember[]>;
  deleteDealMember(id: Id): Promise<void>;

  saveCommitment(c: Commitment): Promise<void>;
  getCommitment(id: Id): Promise<Commitment | null>;
  listCommitments(filter: CommitmentFilter): Promise<Commitment[]>;

  saveRegisterItem(i: DealRegisterItem): Promise<void>;
  getRegisterItem(id: Id): Promise<DealRegisterItem | null>;
  listRegisterItems(filter: RegisterFilter): Promise<DealRegisterItem[]>;

  saveRisk(r: OpportunityRisk): Promise<void>;
  getRisk(id: Id): Promise<OpportunityRisk | null>;
  listRisks(filter: RiskFilter): Promise<OpportunityRisk[]>;
}
