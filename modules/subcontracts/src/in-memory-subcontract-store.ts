import type { Id } from '@aura/shared';
import type { Subcontract } from './domain/subcontract';
import type { Claim } from './domain/claim';
import type { SubcontractVariation } from './domain/variation';
import type { SubcontractFilter, ClaimFilter, VariationFilter, SubcontractStore } from './subcontract-store';

export class InMemorySubcontractStore implements SubcontractStore {
  private readonly subcontracts = new Map<string, Subcontract>();
  private readonly claims = new Map<string, Claim>();
  private readonly variations = new Map<string, SubcontractVariation>();

  async createSubcontract(s: Subcontract): Promise<void> {
    this.subcontracts.set(s.id, { ...s });
  }

  async updateSubcontract(s: Subcontract): Promise<void> {
    this.subcontracts.set(s.id, { ...s });
  }

  async getSubcontract(id: Id): Promise<Subcontract | null> {
    const s = this.subcontracts.get(id);
    return s ? { ...s } : null;
  }

  async listSubcontracts(filter: SubcontractFilter = {}): Promise<Subcontract[]> {
    let out = [...this.subcontracts.values()];
    if (filter.tenantId) out = out.filter((s) => s.tenantId === filter.tenantId);
    if (filter.projectId) out = out.filter((s) => s.projectId === filter.projectId);
    if (filter.status) out = out.filter((s) => s.status === filter.status);
    return out;
  }

  async createClaim(c: Claim): Promise<void> {
    this.claims.set(c.id, { ...c });
  }

  async updateClaim(c: Claim): Promise<void> {
    this.claims.set(c.id, { ...c });
  }

  async getClaim(id: Id): Promise<Claim | null> {
    const c = this.claims.get(id);
    return c ? { ...c } : null;
  }

  async listClaims(filter: ClaimFilter = {}): Promise<Claim[]> {
    let out = [...this.claims.values()];
    if (filter.tenantId) out = out.filter((c) => c.tenantId === filter.tenantId);
    if (filter.subcontractId) out = out.filter((c) => c.subcontractId === filter.subcontractId);
    if (filter.status) out = out.filter((c) => c.status === filter.status);
    return out;
  }

  async createVariation(v: SubcontractVariation): Promise<void> {
    this.variations.set(v.id, { ...v });
  }

  async updateVariation(v: SubcontractVariation): Promise<void> {
    this.variations.set(v.id, { ...v });
  }

  async getVariation(id: Id): Promise<SubcontractVariation | null> {
    const v = this.variations.get(id);
    return v ? { ...v } : null;
  }

  async listVariations(filter: VariationFilter = {}): Promise<SubcontractVariation[]> {
    let out = [...this.variations.values()];
    if (filter.tenantId) out = out.filter((v) => v.tenantId === filter.tenantId);
    if (filter.subcontractId) out = out.filter((v) => v.subcontractId === filter.subcontractId);
    if (filter.status) out = out.filter((v) => v.status === filter.status);
    return out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  }
}
