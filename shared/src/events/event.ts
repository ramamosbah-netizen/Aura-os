import { type Id, newId } from '../domain/id';

export type EventSeverity = 'INFO' | 'ACTION_REQUIRED' | 'CRITICAL';

/**
 * The canonical append-only domain event. `type` follows `module.aggregate.verb`
 * (e.g. `procurement.po.approved`). This is the system's unit of truth — every
 * state change emits one, and the intelligence layer consumes the stream.
 */
export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: Id;
  type: string;
  tenantId: Id;
  companyId: Id | null;
  aggregateType: string;
  aggregateId: Id;
  actorId: Id | null;
  correlationId?: string | null;
  /** ISO-8601 UTC. */
  occurredAt: string;
  version: number;
  payload: TPayload;
}

/** What a producer supplies; the kernel stamps id + occurredAt. */
export interface NewDomainEvent<TPayload = Record<string, unknown>> {
  type: string;
  tenantId: Id;
  companyId?: Id | null;
  aggregateType: string;
  aggregateId: Id;
  actorId?: Id | null;
  correlationId?: string | null;
  version?: number;
  payload?: TPayload;
}

/** Build a complete DomainEvent from a partial spec. */
export function makeEvent<T = Record<string, unknown>>(e: NewDomainEvent<T>): DomainEvent<T> {
  return {
    id: newId(),
    type: e.type,
    tenantId: e.tenantId,
    companyId: e.companyId ?? null,
    aggregateType: e.aggregateType,
    aggregateId: e.aggregateId,
    actorId: e.actorId ?? null,
    correlationId: e.correlationId ?? null,
    occurredAt: new Date().toISOString(),
    version: e.version ?? 1,
    payload: (e.payload ?? {}) as T,
  };
}
