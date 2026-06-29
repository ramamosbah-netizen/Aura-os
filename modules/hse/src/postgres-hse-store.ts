import type { Pool, PoolClient } from 'pg';
import type { TxHandle } from '@aura/core';
import type { HseIncident } from './domain/hse-incident';
import type { PermitToWork } from './domain/permit-to-work';
import type { CapaAction } from './domain/capa-action';
import type { HseIncidentStore, PermitToWorkStore, CapaActionStore } from './store.interface';

export class PostgresHseIncidentStore implements HseIncidentStore {
  constructor(private readonly pool: Pool) {}

  async save(incident: HseIncident, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hse_incidents (
        id, tenant_id, company_id, project_id, project_name, date, severity, description, location_detail, status, created_by, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      on conflict (id) do update set
        status = excluded.status,
        updated_at = excluded.updated_at`,
      [
        incident.id,
        incident.tenantId,
        incident.companyId,
        incident.projectId,
        incident.projectName,
        incident.date,
        incident.severity,
        incident.description,
        incident.locationDetail,
        incident.status,
        incident.createdBy,
        incident.createdAt,
        incident.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<HseIncident | null> {
    const res = await this.pool.query(
      `select * from public.aura_hse_incidents where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapHseIncident(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<HseIncident[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_incidents where project_id = $1 and tenant_id = $2 order by date desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapHseIncident);
  }

  async findAll(tenantId: string): Promise<HseIncident[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_incidents where tenant_id = $1 order by date desc`,
      [tenantId],
    );
    return res.rows.map(this.mapHseIncident);
  }

  private mapHseIncident(row: any): HseIncident {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      severity: row.severity,
      description: row.description,
      locationDetail: row.location_detail,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresPermitToWorkStore implements PermitToWorkStore {
  constructor(private readonly pool: Pool) {}

  async save(permit: PermitToWork, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hse_ptws (
        id, tenant_id, company_id, project_id, project_name, permit_type, valid_from, valid_to, description, status, approved_by, approved_at, created_by, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      on conflict (id) do update set
        status = excluded.status,
        approved_by = excluded.approved_by,
        approved_at = excluded.approved_at,
        updated_at = excluded.updated_at`,
      [
        permit.id,
        permit.tenantId,
        permit.companyId,
        permit.projectId,
        permit.projectName,
        permit.permitType,
        permit.validFrom,
        permit.validTo,
        permit.description,
        permit.status,
        permit.approvedBy,
        permit.approvedAt,
        permit.createdBy,
        permit.createdAt,
        permit.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<PermitToWork | null> {
    const res = await this.pool.query(
      `select * from public.aura_hse_ptws where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapPermit(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<PermitToWork[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_ptws where project_id = $1 and tenant_id = $2 order by created_at desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapPermit);
  }

  async findAll(tenantId: string): Promise<PermitToWork[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_ptws where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return res.rows.map(this.mapPermit);
  }

  private mapPermit(row: any): PermitToWork {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      permitType: row.permit_type,
      validFrom: row.valid_from.toISOString(),
      validTo: row.valid_to.toISOString(),
      description: row.description,
      status: row.status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresCapaActionStore implements CapaActionStore {
  constructor(private readonly pool: Pool) {}

  async save(action: CapaAction, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_hse_capas (
        id, tenant_id, company_id, project_id, project_name, source_type, source_id, action_required, assigned_to, due_date, status, completed_at, created_by, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      on conflict (id) do update set
        status = excluded.status,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at`,
      [
        action.id,
        action.tenantId,
        action.companyId,
        action.projectId,
        action.projectName,
        action.sourceType,
        action.sourceId,
        action.actionRequired,
        action.assignedTo,
        action.dueDate,
        action.status,
        action.completedAt,
        action.createdBy,
        action.createdAt,
        action.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<CapaAction | null> {
    const res = await this.pool.query(
      `select * from public.aura_hse_capas where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapCapa(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<CapaAction[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_capas where project_id = $1 and tenant_id = $2 order by due_date asc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapCapa);
  }

  async findAll(tenantId: string): Promise<CapaAction[]> {
    const res = await this.pool.query(
      `select * from public.aura_hse_capas where tenant_id = $1 order by due_date asc`,
      [tenantId],
    );
    return res.rows.map(this.mapCapa);
  }

  private mapCapa(row: any): CapaAction {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      sourceType: row.source_type,
      sourceId: row.source_id,
      actionRequired: row.action_required,
      assignedTo: row.assigned_to,
      dueDate: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date),
      status: row.status,
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
