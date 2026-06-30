import type { Pool, PoolClient } from 'pg';
import type { TxHandle } from '@aura/core';
import type { DailyReport } from './domain/daily-report';
import type { DelayLog } from './domain/delay-log';
import type { MaterialConsumption } from './domain/material-consumption';
import type { SiteInstruction } from './domain/site-instruction';
import type { DailyReportStore, DelayLogStore, MaterialConsumptionStore, SiteInstructionStore } from './store.interface';

export class PostgresDailyReportStore implements DailyReportStore {
  constructor(private readonly pool: Pool) {}

  async save(report: DailyReport, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_site_daily_reports (
        id, tenant_id, company_id, project_id, project_name, date, work_description, manpower_count, equipment_count, status, created_by, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      on conflict (tenant_id, project_id, date) do update set
        work_description = excluded.work_description,
        manpower_count = excluded.manpower_count,
        equipment_count = excluded.equipment_count,
        status = excluded.status,
        updated_at = excluded.updated_at`,
      [
        report.id,
        report.tenantId,
        report.companyId,
        report.projectId,
        report.projectName,
        report.date,
        report.workDescription,
        report.manpowerCount,
        report.equipmentCount,
        report.status,
        report.createdBy,
        report.createdAt,
        report.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<DailyReport | null> {
    const res = await this.pool.query(
      `select * from public.aura_site_daily_reports where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapDailyReport(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<DailyReport[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_daily_reports where project_id = $1 and tenant_id = $2 order by date desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapDailyReport);
  }

  async findAll(tenantId: string): Promise<DailyReport[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_daily_reports where tenant_id = $1 order by date desc`,
      [tenantId],
    );
    return res.rows.map(this.mapDailyReport);
  }

  private mapDailyReport(row: any): DailyReport {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      workDescription: row.work_description,
      manpowerCount: Number(row.manpower_count),
      equipmentCount: Number(row.equipment_count),
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresDelayLogStore implements DelayLogStore {
  constructor(private readonly pool: Pool) {}

  async save(log: DelayLog, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_site_delay_logs (
        id, tenant_id, company_id, project_id, project_name, date, delay_type, description, impact_hours, status, resolved_at, created_by, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      on conflict (id) do update set
        status = excluded.status,
        resolved_at = excluded.resolved_at,
        updated_at = excluded.updated_at`,
      [
        log.id,
        log.tenantId,
        log.companyId,
        log.projectId,
        log.projectName,
        log.date,
        log.delayType,
        log.description,
        log.impactHours,
        log.status,
        log.resolvedAt,
        log.createdBy,
        log.createdAt,
        log.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<DelayLog | null> {
    const res = await this.pool.query(
      `select * from public.aura_site_delay_logs where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapDelayLog(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<DelayLog[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_delay_logs where project_id = $1 and tenant_id = $2 order by date desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapDelayLog);
  }

  async findAll(tenantId: string): Promise<DelayLog[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_delay_logs where tenant_id = $1 order by date desc`,
      [tenantId],
    );
    return res.rows.map(this.mapDelayLog);
  }

  private mapDelayLog(row: any): DelayLog {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      delayType: row.delay_type,
      description: row.description,
      impactHours: Number(row.impact_hours),
      status: row.status,
      resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresMaterialConsumptionStore implements MaterialConsumptionStore {
  constructor(private readonly pool: Pool) {}

  async save(consumption: MaterialConsumption, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_site_material_consumption (
        id, tenant_id, company_id, project_id, project_name, date, item_id, item_name, quantity_consumed, unit, created_by, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      on conflict (id) do update set
        quantity_consumed = excluded.quantity_consumed,
        updated_at = excluded.updated_at`,
      [
        consumption.id,
        consumption.tenantId,
        consumption.companyId,
        consumption.projectId,
        consumption.projectName,
        consumption.date,
        consumption.itemId,
        consumption.itemName,
        consumption.quantityConsumed,
        consumption.unit,
        consumption.createdBy,
        consumption.createdAt,
        consumption.updatedAt,
      ],
    );
  }

  async findById(id: string, tenantId: string): Promise<MaterialConsumption | null> {
    const res = await this.pool.query(
      `select * from public.aura_site_material_consumption where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) return null;
    return this.mapMaterialConsumption(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<MaterialConsumption[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_material_consumption where project_id = $1 and tenant_id = $2 order by date desc`,
      [projectId, tenantId],
    );
    return res.rows.map(this.mapMaterialConsumption);
  }

  async findAll(tenantId: string): Promise<MaterialConsumption[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_material_consumption where tenant_id = $1 order by date desc`,
      [tenantId],
    );
    return res.rows.map(this.mapMaterialConsumption);
  }

  private mapMaterialConsumption(row: any): MaterialConsumption {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      itemId: row.item_id,
      itemName: row.item_name,
      quantityConsumed: Number(row.quantity_consumed),
      unit: row.unit,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

const SI_COLS =
  'id, tenant_id, company_id, project_id, project_name, reference, issued_by, date::text AS date, instruction, cost_implication, time_implication, status, acknowledged_at, closed_at, created_by, created_at, updated_at';

export class PostgresSiteInstructionStore implements SiteInstructionStore {
  constructor(private readonly pool: Pool) {}

  async save(si: SiteInstruction, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_site_instructions (
        id, tenant_id, company_id, project_id, project_name, reference, issued_by, date, instruction, cost_implication, time_implication, status, acknowledged_at, closed_at, created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      on conflict (id) do update set
        status = excluded.status, acknowledged_at = excluded.acknowledged_at, closed_at = excluded.closed_at, updated_at = excluded.updated_at`,
      [si.id, si.tenantId, si.companyId, si.projectId, si.projectName, si.reference, si.issuedBy, si.date, si.instruction, si.costImplication, si.timeImplication, si.status, si.acknowledgedAt, si.closedAt, si.createdBy, si.createdAt, si.updatedAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<SiteInstruction | null> {
    const res = await this.pool.query(`select ${SI_COLS} from public.aura_site_instructions where id = $1 and tenant_id = $2`, [id, tenantId]);
    return res.rowCount === 0 ? null : this.mapSi(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<SiteInstruction[]> {
    const res = await this.pool.query(`select ${SI_COLS} from public.aura_site_instructions where project_id = $1 and tenant_id = $2 order by date desc, created_at desc`, [projectId, tenantId]);
    return res.rows.map(this.mapSi);
  }

  async findAll(tenantId: string): Promise<SiteInstruction[]> {
    const res = await this.pool.query(`select ${SI_COLS} from public.aura_site_instructions where tenant_id = $1 order by date desc, created_at desc`, [tenantId]);
    return res.rows.map(this.mapSi);
  }

  private mapSi(row: any): SiteInstruction {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      reference: row.reference,
      issuedBy: row.issued_by,
      date: String(row.date),
      instruction: row.instruction,
      costImplication: row.cost_implication,
      timeImplication: row.time_implication,
      status: row.status,
      acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : null,
      closedAt: row.closed_at ? row.closed_at.toISOString() : null,
      createdBy: row.created_by,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}
