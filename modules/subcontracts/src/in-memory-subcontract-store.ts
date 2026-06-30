import type { Id } from '@aura/shared';
import type { Subcontract } from './domain/subcontract';
import type { Claim } from './domain/claim';
import type { BackCharge } from './domain/back-charge';
import type { SubcontractFilter, ClaimFilter, BackChargeFilter, SubcontractStore } from './subcontract-store';

export class InMemorySubcontractStore implements SubcontractStore {
  private readonly subcontracts = new Map<string, Subcontract>();
  private readonly claims = new Map<string, Claim>();
  private readonly backCharges = new Map<string, BackCharge>();

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

  async createBackCharge(b: BackCharge): Promise<void> {
    this.backCharges.set(b.id, { ...b });
  }

  async updateBackCharge(b: BackCharge): Promise<void> {
    this.backCharges.set(b.id, { ...b });
  }

  async getBackCharge(id: Id): Promise<BackCharge | null> {
    const b = this.backCharges.get(id);
    return b ? { ...b } : null;
  }

  async listBackCharges(filter: BackChargeFilter = {}): Promise<BackCharge[]> {
    let out = [...this.backCharges.values()];
    if (filter.tenantId) out = out.filter((b) => b.tenantId === filter.tenantId);
    if (filter.subcontractId) out = out.filter((b) => b.subcontractId === filter.subcontractId);
    if (filter.status) out = out.filter((b) => b.status === filter.status);
    return out;
  }
}
