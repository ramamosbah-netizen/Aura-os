import type { Id } from '@aura/shared';
import type { ScopeAssistProposal } from './domain/scope-assist';
import type { ScopeAssistStore } from './scope-assist-store';

/** In-memory Scope Assist store (no-DB boots + unit tests). */
export class InMemoryScopeAssistStore implements ScopeAssistStore {
  private readonly rows = new Map<string, ScopeAssistProposal>();
  private clone(p: ScopeAssistProposal): ScopeAssistProposal { return JSON.parse(JSON.stringify(p)) as ScopeAssistProposal; }

  async save(p: ScopeAssistProposal): Promise<void> { this.rows.set(p.id, this.clone(p)); }

  async get(tenantId: Id, id: Id): Promise<ScopeAssistProposal | null> {
    const p = this.rows.get(id);
    return p && p.tenantId === tenantId ? this.clone(p) : null;
  }

  async listForOpportunity(tenantId: Id, opportunityId: Id): Promise<ScopeAssistProposal[]> {
    return [...this.rows.values()]
      .filter((p) => p.tenantId === tenantId && p.opportunityId === opportunityId)
      .sort((a, b) => b.version - a.version)
      .map((p) => this.clone(p));
  }
}
