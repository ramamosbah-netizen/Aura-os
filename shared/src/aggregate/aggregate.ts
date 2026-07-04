import type { Id } from '../domain/id';

// AURA Aggregate Contract — see ADR-0011 (Aggregate Contract & Platform Composition).
//
// A Business Aggregate owns its own business invariants, lifecycle and consistency boundaries.
// This contract only *identifies* an aggregate so platform capabilities (DMS, Events, Workflow,
// Notifications, …) can attach to it by address — (aggregateType, aggregateId) — without ever
// knowing the concrete type. Aggregates *satisfy* this interface (composition); they never
// *extend* a base class (which would couple the framework-free domain to the platform).
//
// Capabilities bind to `BusinessAggregate`, never to `Drawing`/`Invoice`/`Employee`. They may
// persist technical metadata but never mutate business state — only the owning module does that.

export interface AggregateAddress {
  /** Stable discriminator for the aggregate's type, e.g. 'engineering.drawing'. */
  aggregateType: string;
  /** The aggregate instance id. */
  aggregateId: Id;
}

export interface BusinessAggregate extends AggregateAddress {
  tenantId: Id;
  companyId: Id | null;
  // Shared dimensions (ADR-0012) — optional per aggregate; each owned by exactly one module.
  projectId?: Id;
  discipline?: string;
  costCenter?: string;
}

/** Format an aggregate address as a single addressable key: `type:id`. */
export function aggregateKey(a: AggregateAddress): string {
  return `${a.aggregateType}:${a.aggregateId}`;
}
