import type { Id, Commitment, DealRegisterItem, OpportunityDealMember, OpportunityStakeholder, OpportunityRisk } from '@aura/shared';
import type {
  CommitmentFilter, DealTeamFilter, OpportunityDepthStore, RegisterFilter, RiskFilter, StakeholderFilter,
} from './opportunity-depth-store';

/** Phase-0 opportunity-depth store — in-memory (no-DB boots). */
export class InMemoryOpportunityDepthStore implements OpportunityDepthStore {
  private readonly stakeholders = new Map<string, OpportunityStakeholder>();
  private readonly dealTeam = new Map<string, OpportunityDealMember>();
  private readonly commitments = new Map<string, Commitment>();
  private readonly register = new Map<string, DealRegisterItem>();
  private readonly risks = new Map<string, OpportunityRisk>();

  async saveStakeholder(s: OpportunityStakeholder): Promise<void> { this.stakeholders.set(s.id, { ...s }); }
  async getStakeholder(id: Id): Promise<OpportunityStakeholder | null> {
    const s = this.stakeholders.get(id); return s ? { ...s } : null;
  }
  async listStakeholders(f: StakeholderFilter): Promise<OpportunityStakeholder[]> {
    return [...this.stakeholders.values()]
      .filter((s) => s.tenantId === f.tenantId && (!f.opportunityId || s.opportunityId === f.opportunityId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
  async deleteStakeholder(id: Id): Promise<void> { this.stakeholders.delete(id); }

  async saveDealMember(m: OpportunityDealMember): Promise<void> { this.dealTeam.set(m.id, { ...m }); }
  async getDealMember(id: Id): Promise<OpportunityDealMember | null> {
    const m = this.dealTeam.get(id); return m ? { ...m } : null;
  }
  async listDealTeam(f: DealTeamFilter): Promise<OpportunityDealMember[]> {
    return [...this.dealTeam.values()]
      .filter((m) => m.tenantId === f.tenantId && (!f.opportunityId || m.opportunityId === f.opportunityId))
      .sort((a, b) => (a.joinedAt < b.joinedAt ? -1 : 1));
  }
  async deleteDealMember(id: Id): Promise<void> { this.dealTeam.delete(id); }

  async saveCommitment(c: Commitment): Promise<void> { this.commitments.set(c.id, { ...c }); }
  async getCommitment(id: Id): Promise<Commitment | null> {
    const c = this.commitments.get(id); return c ? { ...c } : null;
  }
  async listCommitments(f: CommitmentFilter): Promise<Commitment[]> {
    return [...this.commitments.values()]
      .filter((c) => c.tenantId === f.tenantId
        && (!f.relatedType || c.relatedType === f.relatedType)
        && (!f.relatedId || c.relatedId === f.relatedId)
        && (!f.status || c.status === f.status))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async saveRegisterItem(i: DealRegisterItem): Promise<void> { this.register.set(i.id, { ...i }); }
  async getRegisterItem(id: Id): Promise<DealRegisterItem | null> {
    const i = this.register.get(id); return i ? { ...i } : null;
  }
  async listRegisterItems(f: RegisterFilter): Promise<DealRegisterItem[]> {
    return [...this.register.values()]
      .filter((i) => i.tenantId === f.tenantId
        && (!f.relatedType || i.relatedType === f.relatedType)
        && (!f.relatedId || i.relatedId === f.relatedId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async saveRisk(r: OpportunityRisk): Promise<void> { this.risks.set(r.id, { ...r }); }
  async getRisk(id: Id): Promise<OpportunityRisk | null> {
    const r = this.risks.get(id); return r ? { ...r } : null;
  }
  async listRisks(f: RiskFilter): Promise<OpportunityRisk[]> {
    return [...this.risks.values()]
      .filter((r) => r.tenantId === f.tenantId && (!f.opportunityId || r.opportunityId === f.opportunityId))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
}
