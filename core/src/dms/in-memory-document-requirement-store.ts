import type { DocumentRequirement, Id } from '@aura/shared';
import type { DocumentRequirementStore, RequirementFilter } from './document-requirement-store';

/** Phase-0 requirement store. Mirrors the Postgres semantics, including the natural-key upsert. */
export class InMemoryDocumentRequirementStore implements DocumentRequirementStore {
  private readonly rows = new Map<string, DocumentRequirement>();

  /** The natural key the unique index in 0184 enforces. */
  private static key(r: Pick<DocumentRequirement, 'tenantId' | 'entityType' | 'entityId' | 'type'>): string {
    return `${r.tenantId}|${r.entityType}|${r.entityId}|${r.type}`;
  }

  async upsert(requirement: DocumentRequirement): Promise<void> {
    // Match ON CONFLICT (tenant, entity, type) DO UPDATE: re-seeding a template converges on
    // the same set instead of duplicating it, and keeps the ORIGINAL row's id so anything
    // already pointing at it still resolves.
    const natural = InMemoryDocumentRequirementStore.key(requirement);
    const existing = [...this.rows.values()].find((r) => InMemoryDocumentRequirementStore.key(r) === natural);
    const id = existing?.id ?? requirement.id;
    if (existing && existing.id !== requirement.id) this.rows.delete(existing.id);
    this.rows.set(id, { ...requirement, id, createdAt: existing?.createdAt ?? requirement.createdAt });
  }

  async list(filter: RequirementFilter): Promise<DocumentRequirement[]> {
    return [...this.rows.values()]
      .filter((r) => r.tenantId === filter.tenantId)
      .filter((r) => !filter.entityType || r.entityType === filter.entityType)
      .filter((r) => !filter.entityId || r.entityId === filter.entityId)
      .map((r) => ({ ...r, evidence: [...r.evidence] }));
  }

  async get(id: Id): Promise<DocumentRequirement | null> {
    const r = this.rows.get(id);
    return r ? { ...r, evidence: [...r.evidence] } : null;
  }

  async remove(id: Id): Promise<boolean> {
    return this.rows.delete(id);
  }
}
