import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { QualificationDecision } from './domain/qualification-decision';
import type { QualificationDecisionStore } from './qualification-decision-store';

/**
 * Phase-0 decision store — immutable append-only snapshots in memory (no-DB boots).
 * NOTE: in-memory has no real transaction and no row locks; it is deterministic for unit tests but
 * is NOT a proof of production concurrency or rollback. Those invariants are properties of Postgres
 * (SELECT … FOR UPDATE + one BEGIN/COMMIT) and are exercised by the Postgres integration spec.
 */
export class InMemoryQualificationDecisionStore implements QualificationDecisionStore {
  private readonly rows = new Map<string, QualificationDecision>();

  // Deep clone on the way in AND out so nothing a caller holds can mutate the stored evidence.
  private freeze(d: QualificationDecision): QualificationDecision {
    return JSON.parse(JSON.stringify(d)) as QualificationDecision;
  }

  async append(d: QualificationDecision): Promise<void> {
    if (this.rows.has(d.id)) return; // append-only: never overwrite an existing id.
    this.rows.set(d.id, this.freeze(d));
  }

  async appendWithClient(_tx: TxHandle | null, d: QualificationDecision): Promise<void> {
    return this.append(d);
  }

  async get(id: Id): Promise<QualificationDecision | null> {
    const d = this.rows.get(id);
    return d ? this.freeze(d) : null;
  }

  async listForLead(tenantId: Id, leadId: Id): Promise<QualificationDecision[]> {
    return [...this.rows.values()]
      .filter((d) => d.tenantId === tenantId && d.leadId === leadId)
      .sort((a, b) => (a.qualifiedAt < b.qualifiedAt ? 1 : -1))
      .map((d) => this.freeze(d));
  }
}
