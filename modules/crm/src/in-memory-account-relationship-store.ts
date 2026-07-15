import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { AccountRelationship } from './domain/account-relationship';
import type { AccountRelationshipStore } from './account-relationship-store';

/** Phase-0 relationship store — keeps the graph in memory (no-DB boots). */
export class InMemoryAccountRelationshipStore implements AccountRelationshipStore {
  private readonly rels = new Map<string, AccountRelationship>();

  async create(rel: AccountRelationship): Promise<void> {
    this.rels.set(rel.id, { ...rel });
  }

  async createWithClient(_tx: TxHandle | null, rel: AccountRelationship): Promise<void> {
    return this.create(rel);
  }

  async get(id: Id): Promise<AccountRelationship | null> {
    const r = this.rels.get(id);
    return r ? { ...r } : null;
  }

  async delete(id: Id): Promise<void> {
    this.rels.delete(id);
  }

  async deleteWithClient(_tx: TxHandle | null, id: Id): Promise<void> {
    return this.delete(id);
  }

  async listFor(tenantId: Id, accountId: Id): Promise<AccountRelationship[]> {
    return [...this.rels.values()]
      .filter((r) => r.tenantId === tenantId && (r.fromAccountId === accountId || r.toAccountId === accountId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async find(tenantId: Id, fromAccountId: Id, toAccountId: Id, type: string): Promise<AccountRelationship | null> {
    const hit = [...this.rels.values()].find(
      (r) => r.tenantId === tenantId && r.fromAccountId === fromAccountId && r.toAccountId === toAccountId && r.type === type,
    );
    return hit ? { ...hit } : null;
  }
}
