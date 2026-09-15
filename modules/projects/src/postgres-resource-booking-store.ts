import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ResourceType, ResourceUnit } from './domain/resource-ref';
import type { BookingStatus, ResourceBooking } from './domain/resource-booking';
import type { ResourceBookingStore } from './resource-booking-store';

interface Row {
  id: string; tenant_id: string; project_id: string; schedule_id: string | null; task_id: string | null;
  requirement_id: string | null; resource_type: string; canonical_resource_id: string; unit: string;
  quantity: string | number; valid_from: Date | string; valid_to: Date | string; status: string;
  capacity_at_commitment: string | number | null; demand_at_commitment: string | number;
  over_capacity_reason: string | null; committed_at: Date | string; committed_by: string | null;
  released_reason: string | null; released_at: Date | string | null; released_by: string | null;
}

const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : String(value);
const day = (value: Date | string): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const fromRow = (row: Row): ResourceBooking => ({
  id: row.id, tenantId: row.tenant_id, projectId: row.project_id, scheduleId: row.schedule_id,
  taskId: row.task_id, requirementId: row.requirement_id,
  resource: { resourceType: row.resource_type as ResourceType, canonicalResourceId: row.canonical_resource_id },
  unit: row.unit as ResourceUnit, quantity: Number(row.quantity), from: day(row.valid_from), to: day(row.valid_to),
  status: row.status as BookingStatus,
  capacityAtCommitment: row.capacity_at_commitment === null ? null : Number(row.capacity_at_commitment),
  demandAtCommitment: Number(row.demand_at_commitment), overCapacityReason: row.over_capacity_reason,
  committedAt: iso(row.committed_at), committedBy: row.committed_by, releasedReason: row.released_reason,
  releasedAt: row.released_at ? iso(row.released_at) : null, releasedBy: row.released_by,
});

const columns = `id, tenant_id, project_id, schedule_id, task_id, requirement_id, resource_type,
  canonical_resource_id, unit, quantity, valid_from, valid_to, status, capacity_at_commitment,
  demand_at_commitment, over_capacity_reason, committed_at, committed_by, released_reason, released_at, released_by`;

export class PostgresResourceBookingStore implements ResourceBookingStore {
  constructor(private readonly pool: Pool) {}

  async create(booking: ResourceBooking): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_resource_bookings (${columns})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [booking.id, booking.tenantId, booking.projectId, booking.scheduleId, booking.taskId, booking.requirementId,
        booking.resource.resourceType, booking.resource.canonicalResourceId, booking.unit, booking.quantity,
        booking.from, booking.to, booking.status, booking.capacityAtCommitment, booking.demandAtCommitment,
        booking.overCapacityReason, booking.committedAt, booking.committedBy, booking.releasedReason,
        booking.releasedAt, booking.releasedBy],
    );
  }

  async update(booking: ResourceBooking): Promise<void> {
    const result = await this.pool.query(
      `UPDATE public.aura_projects_resource_bookings
          SET status=$3, released_reason=$4, released_at=$5, released_by=$6
        WHERE tenant_id=$1 AND id=$2`,
      [booking.tenantId, booking.id, booking.status, booking.releasedReason, booking.releasedAt, booking.releasedBy],
    );
    if (result.rowCount !== 1) throw new Error(`resource booking ${booking.id} not found`);
  }

  async get(tenantId: Id, id: Id): Promise<ResourceBooking | null> {
    const result = await this.pool.query<Row>(`SELECT ${columns} FROM public.aura_projects_resource_bookings WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async listForProject(tenantId: Id, projectId: Id): Promise<ResourceBooking[]> {
    const result = await this.pool.query<Row>(`SELECT ${columns} FROM public.aura_projects_resource_bookings WHERE tenant_id=$1 AND project_id=$2 ORDER BY committed_at DESC`, [tenantId, projectId]);
    return result.rows.map(fromRow);
  }

  async heldForRequirement(tenantId: Id, projectId: Id, requirementId: Id): Promise<ResourceBooking | null> {
    const result = await this.pool.query<Row>(
      `SELECT ${columns} FROM public.aura_projects_resource_bookings
        WHERE tenant_id=$1 AND project_id=$2 AND requirement_id=$3 AND status='held' LIMIT 1`,
      [tenantId, projectId, requirementId],
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }
}
