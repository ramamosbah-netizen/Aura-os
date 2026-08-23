import type { Id } from '@aura/shared';
import type { ScopeAssistProposal } from './domain/scope-assist';

export const CRM_SCOPE_ASSIST_STORE = Symbol('CRM_SCOPE_ASSIST_STORE');

/**
 * Store for Scope Assist proposals — one immutable generated artifact per generation. `save` upserts by
 * id (create, and the single suggested→accepted / →superseded status stamp); proposals are never edited
 * in content. Reads are always tenant + opportunity scoped.
 */
export interface ScopeAssistStore {
  save(p: ScopeAssistProposal): Promise<void>;
  get(tenantId: Id, id: Id): Promise<ScopeAssistProposal | null>;
  /** Newest version first. */
  listForOpportunity(tenantId: Id, opportunityId: Id): Promise<ScopeAssistProposal[]>;
}
