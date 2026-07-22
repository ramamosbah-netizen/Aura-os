import type { Id, NegotiationEntry } from '@aura/shared';

/** DI token for the negotiation log. */
export const NEGOTIATION_STORE = Symbol('NEGOTIATION_STORE');

export interface NegotiationFilter {
  tenantId: Id;
  quotationId?: Id;
}

/**
 * Persistence for the negotiation log.
 *
 * `append`, not `upsert`: a negotiation is a sequence of positions taken at points in time, and
 * an entry that can be edited after the fact stops being evidence of what was said. Correcting
 * a mis-entry means removing it and recording the right one — visibly — rather than quietly
 * rewriting what the customer asked for.
 *
 * There is deliberately no update: the thing the log is FOR is the shape of the conversation
 * over time, and that survives only if each entry stays as it was written.
 */
export interface NegotiationStore {
  append(entry: NegotiationEntry): Promise<void>;
  list(filter: NegotiationFilter): Promise<NegotiationEntry[]>;
  /** Removes a mis-recorded entry. Deletion, never mutation — see above. */
  remove(id: Id): Promise<boolean>;
}
