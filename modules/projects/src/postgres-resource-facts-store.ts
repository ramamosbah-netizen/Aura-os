import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ResourceRef, ResourceType, ResourceUnit } from './domain/resource-ref';
import type { ResourceCapacity } from './domain/resource-pool';
import type { ResourceBooking, BookingStatus } from './domain/resource-booking';
import type { ResourceFactsStore, ResourceInterval } from './resource-facts-store';

/**
 * §22 Step 7 (part 2) — the Postgres {@link ResourceFactsStore}.
 *
 * The impure half of the cross-project capacity engine, against real PostgreSQL. Two tenant-scoped
 * reads, no writes, no verdict — the arithmetic stays in `domain/resource-facts.ts`. This is the one
 * place in §22 that reads ACROSS projects: it passes NO project filter, so a booking another project
 * holds on the same crane is returned and the conflict becomes visible. Tenant isolation is absolute
 * regardless — RLS below this store scopes every read to `current_tenant_id()`, and the bookings
 * policy admits every project in the tenant only because no `app.current_project_id` is bound.
 *
 * Typed identity (DG-22.2): resources are matched on `(resource_type, canonical_resource_id)` as a
 * PAIR, never a bare id, so a vehicle and an asset sharing a uuid never resolve to one another.
 */

interface BookingRow {
  id: string; tenant_id: string; project_id: string;
  resource_type: string; canonical_resource_id: string; unit: string; quantity: string | number;
  valid_from: Date | string; valid_to: Date | string; status: string;
  capacity_at_commitment: string | number | null; demand_at_commitment: string | number;
  over_capacity_reason: string | null; committed_at: Date | string; committed_by: string | null;
  released_reason: string | null; released_at: Date | string | null; released_by: string | null;
}

interface CapacityRow {
  id: string; tenant_id: string; resource_type: string; canonical_resource_id: string;
  unit: string; quantity: string | number | null; valid_from: Date | string; valid_to: Date | string;
  calendar_id: string | null; org_node_id: string | null; note: string | null;
  created_at: Date | string; created_by: string | null;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));
const day = (v: Date | string | null): string =>
  v === null ? '' : typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
const num = (v: string | number | null): number | null => (v === null ? null : Number(v));
const ref = (resource_type: string, canonical_resource_id: string): ResourceRef =>
  ({ resourceType: resource_type as ResourceType, canonicalResourceId: canonical_resource_id });

const rowToBooking = (r: BookingRow): ResourceBooking => ({
  id: r.id,
  tenantId: r.tenant_id,
  projectId: r.project_id,
  // No requirement_id column in migration 0288; the resolver does not read it. Kept honest as null.
  requirementId: null,
  resource: ref(r.resource_type, r.canonical_resource_id),
  unit: r.unit as ResourceUnit,
  quantity: Number(r.quantity),
  from: day(r.valid_from),
  to: day(r.valid_to),
  status: r.status as BookingStatus,
  capacityAtCommitment: num(r.capacity_at_commitment),
  demandAtCommitment: Number(r.demand_at_commitment),
  overCapacityReason: r.over_capacity_reason,
  committedAt: iso(r.committed_at),
  committedBy: r.committed_by,
  releasedReason: r.released_reason,
  releasedAt: r.released_at ? iso(r.released_at) : null,
  releasedBy: r.released_by,
});

const rowToCapacity = (r: CapacityRow): ResourceCapacity => ({
  id: r.id,
  tenantId: r.tenant_id,
  resource: ref(r.resource_type, r.canonical_resource_id),
  unit: r.unit as ResourceUnit,
  quantity: num(r.quantity),
  from: day(r.valid_from),
  to: day(r.valid_to),
  calendarId: r.calendar_id,
  orgNodeId: r.org_node_id,
  note: r.note,
  createdAt: iso(r.created_at),
  createdBy: r.created_by,
});

/** The typed reference pairs, split into parallel arrays for a paired `unnest` match. */
const refArrays = (refs: readonly ResourceRef[]): { types: string[]; ids: string[] } => ({
  types: refs.map((r) => r.resourceType),
  ids: refs.map((r) => r.canonicalResourceId),
});

export class PostgresResourceFactsStore implements ResourceFactsStore {
  constructor(private readonly pool: Pool) {}

  async heldBookingsFor(
    _tenantId: Id,
    refs: readonly ResourceRef[],
    interval: ResourceInterval,
  ): Promise<ResourceBooking[]> {
    if (refs.length === 0) return [];
    // tenant_id is enforced by RLS (current_tenant_id()); it is not a query predicate here, so a
    // caller cannot read another tenant's rows by passing a different id.
    const { types, ids } = refArrays(refs);
    const res = await this.pool.query<BookingRow>(
      `SELECT id, tenant_id, project_id, resource_type, canonical_resource_id, unit, quantity,
              valid_from, valid_to, status, capacity_at_commitment, demand_at_commitment,
              over_capacity_reason, committed_at, committed_by, released_reason, released_at, released_by
         FROM public.aura_projects_resource_bookings
        WHERE status = 'held'
          AND (resource_type, canonical_resource_id) IN (SELECT t, i FROM unnest($1::text[], $2::text[]) AS u(t, i))
          AND valid_from <= $3 AND valid_to >= $4
        ORDER BY resource_type, canonical_resource_id, project_id, valid_from`,
      [types, ids, interval.to, interval.from],
    );
    return res.rows.map(rowToBooking);
  }

  async capacityWindowsFor(
    _tenantId: Id,
    refs: readonly ResourceRef[],
    interval: ResourceInterval,
  ): Promise<ResourceCapacity[]> {
    if (refs.length === 0) return [];
    const { types, ids } = refArrays(refs);
    const res = await this.pool.query<CapacityRow>(
      `SELECT id, tenant_id, resource_type, canonical_resource_id, unit, quantity, valid_from, valid_to,
              calendar_id, org_node_id, note, created_at, created_by
         FROM public.aura_projects_resource_capacity
        WHERE (resource_type, canonical_resource_id) IN (SELECT t, i FROM unnest($1::text[], $2::text[]) AS u(t, i))
          AND valid_from <= $3 AND valid_to >= $4
        ORDER BY resource_type, canonical_resource_id, valid_from`,
      [types, ids, interval.to, interval.from],
    );
    return res.rows.map(rowToCapacity);
  }
}
