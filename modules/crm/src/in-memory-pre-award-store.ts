import type { Id } from '@aura/shared';
import type { Requirement, SolutionScope } from './domain/solution-scope';
import type { PreAwardStore } from './pre-award-store';

/** Phase-0 pre-award store — requirements + scopes in memory (no-DB boots). */
export class InMemoryPreAwardStore implements PreAwardStore {
  private readonly requirements = new Map<string, Requirement>();
  private readonly scopes = new Map<string, SolutionScope>();

  async saveRequirement(r: Requirement): Promise<void> {
    this.requirements.set(r.id, { ...r });
  }
  async listRequirements(tenantId: Id, opportunityId: Id): Promise<Requirement[]> {
    return [...this.requirements.values()]
      .filter((r) => r.tenantId === tenantId && r.opportunityId === opportunityId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async saveScope(s: SolutionScope): Promise<void> {
    this.scopes.set(s.id, { ...s, lines: s.lines.map((l) => ({ ...l })) });
  }
  async getScope(id: Id): Promise<SolutionScope | null> {
    const s = this.scopes.get(id);
    return s ? { ...s, lines: s.lines.map((l) => ({ ...l })) } : null;
  }
  async listScopes(tenantId: Id, opportunityId: Id): Promise<SolutionScope[]> {
    return [...this.scopes.values()]
      .filter((s) => s.tenantId === tenantId && s.opportunityId === opportunityId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l })) }));
  }
}
