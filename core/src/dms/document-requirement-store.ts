import type { DocumentRequirement, Id } from '@aura/shared';

/** DI token for the evidence-requirement store. */
export const DOCUMENT_REQUIREMENT_STORE = Symbol('DOCUMENT_REQUIREMENT_STORE');

export interface RequirementFilter {
  tenantId: Id;
  entityType?: string;
  entityId?: Id;
}

/**
 * Persistence for what a decision requires.
 *
 * `upsert` rather than `create`: requirements are seeded from a template and then edited in
 * place (evidence added, waived, marked not-applicable). A second seed of the same record must
 * converge on the same set, not duplicate it — the unique index in 0184 enforces that, and this
 * contract keeps callers from having to know whether a row already exists.
 */
export interface DocumentRequirementStore {
  upsert(requirement: DocumentRequirement): Promise<void>;
  list(filter: RequirementFilter): Promise<DocumentRequirement[]>;
  get(id: Id): Promise<DocumentRequirement | null>;
  remove(id: Id): Promise<boolean>;
}
