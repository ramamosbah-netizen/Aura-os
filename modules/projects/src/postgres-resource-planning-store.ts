import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ResourceRef, ResourceType, ResourceUnit } from './domain/resource-ref';
import type { PoolSourceType, ResourceCapacity, ResourcePool } from './domain/resource-pool';
import type { ResourcePlanningStore } from './resource-planning-store';

interface PoolRow {
  id: string; tenant_id: string; name: string; unit: string; source_type: string;
  source_id: string | null; org_node_id: string | null; created_at: Date | string;
  created_by: string | null; updated_at: Date | string;
}

interface CapacityRow {
  id: string; tenant_id: string; resource_type: string; canonical_resource_id: string;
  unit: string; quantity: string | number | null; valid_from: Date | string; valid_to: Date | string;
  calendar_id: string | null; org_node_id: string | null; note: string | null;
  created_at: Date | string; created_by: string | null;
}

const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : String(value);
const day = (value: Date | string): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const poolFrom = (row: PoolRow): ResourcePool => ({
  id: row.id, tenantId: row.tenant_id, name: row.name, unit: row.unit as ResourceUnit,
  sourceType: row.source_type as PoolSourceType, sourceId: row.source_id, orgNodeId: row.org_node_id,
  createdAt: iso(row.created_at), createdBy: row.created_by, updatedAt: iso(row.updated_at),
});
const capacityFrom = (row: CapacityRow): ResourceCapacity => ({
  id: row.id, tenantId: row.tenant_id,
  resource: { resourceType: row.resource_type as ResourceType, canonicalResourceId: row.canonical_resource_id },
  unit: row.unit as ResourceUnit, quantity: row.quantity === null ? null : Number(row.quantity),
  from: day(row.valid_from), to: day(row.valid_to), calendarId: row.calendar_id,
  orgNodeId: row.org_node_id, note: row.note, createdAt: iso(row.created_at), createdBy: row.created_by,
});

export class PostgresResourcePlanningStore implements ResourcePlanningStore {
  constructor(private readonly pool: Pool) {}

  async createPool(resourcePool: ResourcePool): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_resource_pools
        (id, tenant_id, name, unit, source_type, source_id, org_node_id, created_at, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [resourcePool.id, resourcePool.tenantId, resourcePool.name, resourcePool.unit, resourcePool.sourceType,
        resourcePool.sourceId, resourcePool.orgNodeId, resourcePool.createdAt, resourcePool.createdBy, resourcePool.updatedAt],
    );
  }

  async getPool(tenantId: Id, id: Id): Promise<ResourcePool | null> {
    const result = await this.pool.query<PoolRow>(
      `SELECT id, tenant_id, name, unit, source_type, source_id, org_node_id, created_at, created_by, updated_at
         FROM public.aura_projects_resource_pools WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id],
    );
    return result.rows[0] ? poolFrom(result.rows[0]) : null;
  }

  async listPools(tenantId: Id): Promise<ResourcePool[]> {
    const result = await this.pool.query<PoolRow>(
      `SELECT id, tenant_id, name, unit, source_type, source_id, org_node_id, created_at, created_by, updated_at
         FROM public.aura_projects_resource_pools WHERE tenant_id=$1 ORDER BY name`,
      [tenantId],
    );
    return result.rows.map(poolFrom);
  }

  async createCapacity(capacity: ResourceCapacity): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_resource_capacity
        (id, tenant_id, resource_type, canonical_resource_id, unit, quantity, valid_from, valid_to,
         calendar_id, org_node_id, note, created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [capacity.id, capacity.tenantId, capacity.resource.resourceType, capacity.resource.canonicalResourceId,
        capacity.unit, capacity.quantity, capacity.from, capacity.to, capacity.calendarId,
        capacity.orgNodeId, capacity.note, capacity.createdAt, capacity.createdBy],
    );
  }

  async listCapacity(tenantId: Id, resource?: ResourceRef): Promise<ResourceCapacity[]> {
    const params: unknown[] = [tenantId];
    let filter = '';
    if (resource) {
      params.push(resource.resourceType, resource.canonicalResourceId);
      filter = ' AND resource_type=$2 AND canonical_resource_id=$3';
    }
    const result = await this.pool.query<CapacityRow>(
      `SELECT id, tenant_id, resource_type, canonical_resource_id, unit, quantity, valid_from, valid_to,
              calendar_id, org_node_id, note, created_at, created_by
         FROM public.aura_projects_resource_capacity WHERE tenant_id=$1${filter}
        ORDER BY valid_from, resource_type, canonical_resource_id`,
      params,
    );
    return result.rows.map(capacityFrom);
  }
}
