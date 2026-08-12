import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { DailyReport } from './domain/daily-report';
import type { DelayLog } from './domain/delay-log';
import type { MaterialConsumption } from './domain/material-consumption';
import type { SiteInstruction } from './domain/site-instruction';
import type { LabourAllocation } from './domain/labour-allocation';
import type { PlantUsage } from './domain/plant-usage';
import type { InstallationRecord } from './domain/installation';
import { type Page, PageParams, makePage } from '@aura/shared';
import type { DailyReportStore, DelayLogStore, MaterialConsumptionStore, SiteInstructionStore, LabourAllocationStore, PlantUsageStore, InstallationStore, DailyReportFilter } from './store.interface';

export class PostgresLabourAllocationStore implements LabourAllocationStore {
  constructor(private readonly pool: Pool) {}

  async save(a: LabourAllocation, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_site_labour_allocations (
        id, tenant_id, company_id, project_id, project_name, date, trade, headcount, hours, man_hours, subcontractor_name, notes, created_by, created_at, updated_at, cost_rate, labour_cost, cbs_node_id
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      on conflict (id) do update set
        headcount = excluded.headcount, hours = excluded.hours, man_hours = excluded.man_hours,
        notes = excluded.notes, updated_at = excluded.updated_at,
        cost_rate = excluded.cost_rate, labour_cost = excluded.labour_cost, cbs_node_id = excluded.cbs_node_id`,
      [a.id, a.tenantId, a.companyId, a.projectId, a.projectName, a.date, a.trade, a.headcount, a.hours, a.manHours, a.subcontractorName, a.notes, a.createdBy, a.createdAt, a.updatedAt, a.costRate, a.labourCost, a.cbsNodeId],
    );
  }

  async findById(id: string, tenantId: string): Promise<LabourAllocation | null> {
    const res = await this.pool.query(
      `select * from public.aura_site_labour_allocations where id = $1 and tenant_id = $2`, [id, tenantId]);
    if (res.rowCount === 0) return null;
    return this.mapAllocation(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<LabourAllocation[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_labour_allocations where project_id = $1 and tenant_id = $2 order by date desc`, [projectId, tenantId]);
    return res.rows.map(this.mapAllocation);
  }

  async findAll(tenantId: string): Promise<LabourAllocation[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_labour_allocations where tenant_id = $1 order by date desc`, [tenantId]);
    return res.rows.map(this.mapAllocation);
  }

  private mapAllocation(row: any): LabourAllocation {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      trade: row.trade,
      headcount: Number(row.headcount),
      hours: Number(row.hours),
      manHours: Number(row.man_hours),
      costRate: Number(row.cost_rate ?? 0),
      labourCost: Number(row.labour_cost ?? 0),
      cbsNodeId: row.cbs_node_id ?? null,
      subcontractorName: row.subcontractor_name,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresPlantUsageStore implements PlantUsageStore {
  constructor(private readonly pool: Pool) {}

  async save(u: PlantUsage, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_site_plant_usage (
        id, tenant_id, company_id, project_id, project_name, cbs_node_id, date, equipment, hours, rate, cost, notes, created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      on conflict (id) do update set
        hours = excluded.hours, rate = excluded.rate, cost = excluded.cost,
        notes = excluded.notes, cbs_node_id = excluded.cbs_node_id, updated_at = excluded.updated_at`,
      [u.id, u.tenantId, u.companyId, u.projectId, u.projectName, u.cbsNodeId, u.date, u.equipment, u.hours, u.rate, u.cost, u.notes, u.createdBy, u.createdAt, u.updatedAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<PlantUsage | null> {
    const res = await this.pool.query(
      `select * from public.aura_site_plant_usage where id = $1 and tenant_id = $2`, [id, tenantId]);
    if (res.rowCount === 0) return null;
    return this.mapUsage(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<PlantUsage[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_plant_usage where project_id = $1 and tenant_id = $2 order by date desc`, [projectId, tenantId]);
    return res.rows.map(this.mapUsage);
  }

  async findAll(tenantId: string): Promise<PlantUsage[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_plant_usage where tenant_id = $1 order by date desc`, [tenantId]);
    return res.rows.map(this.mapUsage);
  }

  private mapUsage(row: any): PlantUsage {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      cbsNodeId: row.cbs_node_id ?? null,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      equipment: row.equipment,
      hours: Number(row.hours),
      rate: Number(row.rate ?? 0),
      cost: Number(row.cost ?? 0),
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresInstallationStore implements InstallationStore {
  constructor(private readonly pool: Pool) {}

  async save(r: InstallationRecord, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_site_installations (
        id, tenant_id, company_id, project_id, project_name, boq_item_id, cbs_node_id, date, description, quantity, unit, notes, created_by, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      on conflict (id) do update set
        quantity = excluded.quantity, description = excluded.description,
        notes = excluded.notes, updated_at = excluded.updated_at`,
      [r.id, r.tenantId, r.companyId, r.projectId, r.projectName, r.boqItemId, r.cbsNodeId, r.date, r.description, r.quantity, r.unit, r.notes, r.createdBy, r.createdAt, r.updatedAt],
    );
  }

  async findById(id: string, tenantId: string): Promise<InstallationRecord | null> {
    const res = await this.pool.query(
      `select * from public.aura_site_installations where id = $1 and tenant_id = $2`, [id, tenantId]);
    if (res.rowCount === 0) return null;
    return this.mapRecord(res.rows[0]);
  }

  async findByProject(projectId: string, tenantId: string): Promise<InstallationRecord[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_installations where project_id = $1 and tenant_id = $2 order by date desc`, [projectId, tenantId]);
    return res.rows.map(this.mapRecord);
  }

  async findAll(tenantId: string): Promise<InstallationRecord[]> {
    const res = await this.pool.query(
      `select * from public.aura_site_installations where tenant_id = $1 order by date desc`, [tenantId]);
    return res.rows.map(this.mapRecord);
  }

  private mapRecord(row: any): InstallationRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      boqItemId: row.boq_item_id,
      cbsNodeId: row.cbs_node_id ?? null,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      description: row.description,
      quantity: Number(row.quantity),
      unit: row.unit,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

export class PostgresDailyReportStore implements DailyReportStore {
  constructor(private readonly pool: Pool) {}

  async save(report: DailyReport, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_site_daily_reports (
        id, tenant_id, company_id, project_id, project_name, date, work_description, manpower_count, equipment_count, status, created_by, created_at, updated_at,
        report_number, site_conditions, safety_notes, prepared_by, submitted_by, submitted_at, reviewed_by, reviewed_at, approved_by, approved_at, rejection_reason
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      on conflict (tenant_id, project_id, date) do update set
        work_description = excluded.work_description,
        manpower_count = excluded.manpower_count,
        equipment_count = excluded.equipment_count,
        status = excluded.status,
        updated_at = excluded.updated_at,
        report_number = excluded.report_number,
        site_conditions = excluded.site_conditions,
        safety_notes = excluded.safety_notes,
        submitted_by = excluded.submitted_by, submitted_at = excluded.submitted_at,
        reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at,
        approved_by = excluded.approved_by, approved_at = excluded.approved_at,
        rejection_reason = excluded.rejection_reason`,
      [
        report.id, report.tenantId, report.companyId, report.projectId, report.projectName, report.date,
        report.workDescription, report.manpowerCount, report.equipmentCount, report.status, report.createdBy,
        report.createdAt, report.updatedAt,
        report.reportNumber, report.siteConditions, report.safetyNotes, report.preparedBy, report.submittedBy,
        report.submittedAt, report.reviewedBy, report.reviewedAt, report.approvedBy, report.approvedAt, report.rejectionReason,
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

  private mapDailyReport(row: QueryResultRow): DailyReport {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      projectId: row.project_id,
      projectName: row.project_name,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
      reportNumber: row.report_number ?? `DR-${row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date)}`,
      workDescription: row.work_description,
      siteConditions: row.site_conditions ?? null,
      safetyNotes: row.safety_notes ?? null,
      manpowerCount: Number(row.manpower_count),
      equipmentCount: Number(row.equipment_count),
      status: row.status,
      preparedBy: row.prepared_by ?? null,
      submittedBy: row.submitted_by ?? null,
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      reviewedBy: row.reviewed_by ?? null,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      approvedBy: row.approved_by ?? null,
      approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
      rejectionReason: row.rejection_reason ?? null,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private buildWhere(filter: DailyReportFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('status', filter.status);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async listPaged(filter: DailyReportFilter, page: PageParams): Promise<Page<DailyReport>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_site_daily_reports ${whereSql}`,
      params,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<any>(
      `SELECT * FROM public.aura_site_daily_reports ${whereSql} ORDER BY date DESC, created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map((row) => this.mapDailyReport(row)), total, page);
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

  private mapDelayLog(row: QueryResultRow): DelayLog {
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

  private mapMaterialConsumption(row: QueryResultRow): MaterialConsumption {
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

  private mapSi(row: QueryResultRow): SiteInstruction {
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
