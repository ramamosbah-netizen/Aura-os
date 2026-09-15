import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ResourceRef, ResourceType, ResourceUnit } from './domain/resource-ref';
import type { PoolSourceType, ResourceCapacity, ResourcePool, ResourcePoolMember } from './domain/resource-pool';
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

interface MemberRow {
  id: string; tenant_id: string; pool_id: string; employee_id: string;
  added_at: Date | string; added_by: string | null;
  removed_at: Date | string | null; removed_by: string | null;
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

const memberFrom = (row: MemberRow): ResourcePoolMember => ({
  id: row.id, tenantId: row.tenant_id, poolId: row.pool_id, employeeId: row.employee_id,
  addedAt: iso(row.added_at), addedBy: row.added_by,
  removedAt: row.removed_at ? iso(row.removed_at) : null, removedBy: row.removed_by,
});

const MEMBER_COLUMNS = 'id, tenant_id, pool_id, employee_id, added_at, added_by, removed_at, removed_by';

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

  async addPoolMember(member: ResourcePoolMember): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_resource_pool_members (${MEMBER_COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [member.id, member.tenantId, member.poolId, member.employeeId,
        member.addedAt, member.addedBy, member.removedAt, member.removedBy],
    );
  }

  async updatePoolMember(member: ResourcePoolMember): Promise<void> {
    // Only the removal half is writable. Which pool a membership belongs to, and whose it is, are
    // settled when it is created — re-pointing either would move one person's history onto another.
    const result = await this.pool.query(
      `UPDATE public.aura_projects_resource_pool_members
          SET removed_at = $3, removed_by = $4
        WHERE tenant_id = $1 AND id = $2`,
      [member.tenantId, member.id, member.removedAt, member.removedBy],
    );
    if (result.rowCount !== 1) throw new Error(`pool member ${member.id} not found`);
  }

  async getPoolMember(tenantId: Id, id: Id): Promise<ResourcePoolMember | null> {
    const result = await this.pool.query<MemberRow>(
      `SELECT ${MEMBER_COLUMNS} FROM public.aura_projects_resource_pool_members WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    return result.rows[0] ? memberFrom(result.rows[0]) : null;
  }

  async listPoolMembers(tenantId: Id, poolId: Id): Promise<ResourcePoolMember[]> {
    const result = await this.pool.query<MemberRow>(
      `SELECT ${MEMBER_COLUMNS} FROM public.aura_projects_resource_pool_members
        WHERE tenant_id = $1 AND pool_id = $2 AND removed_at IS NULL ORDER BY added_at`,
      [tenantId, poolId],
    );
    return result.rows.map(memberFrom);
  }

  async listPoolsForEmployee(tenantId: Id, employeeId: Id): Promise<ResourcePoolMember[]> {
    const result = await this.pool.query<MemberRow>(
      `SELECT ${MEMBER_COLUMNS} FROM public.aura_projects_resource_pool_members
        WHERE tenant_id = $1 AND employee_id = $2 AND removed_at IS NULL ORDER BY added_at`,
      [tenantId, employeeId],
    );
    return result.rows.map(memberFrom);
  }
}
