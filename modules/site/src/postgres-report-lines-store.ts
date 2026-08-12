import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { ReportLineStore } from './store.interface';
import type { SiteLabourEntry, SitePlantEntry, SiteProgressEntry, SiteDelayEntry, SiteEvidence } from './domain/daily-report-lines';

/**
 * Config-driven Postgres store for a daily-report line-item type. Each line table shares the base
 * columns (id, tenant_id, company_id, daily_report_id, project_id, created_by, created_at); the
 * `extra` config supplies the type-specific columns + how to read/write them.
 */
interface LineConfig<T> {
  table: string;
  extraCols: string[];
  toExtraParams: (line: T) => unknown[];
  fromRow: (row: QueryResultRow, base: BaseLine) => T;
}

interface BaseLine {
  id: string;
  tenantId: string;
  companyId: string | null;
  dailyReportId: string;
  projectId: string;
  createdBy: string | null;
  createdAt: string;
}

const BASE_COLS = ['id', 'tenant_id', 'company_id', 'daily_report_id', 'project_id', 'created_by', 'created_at'];
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

class PostgresReportLineStore<T extends BaseLine> implements ReportLineStore<T> {
  constructor(private readonly pool: Pool, private readonly cfg: LineConfig<T>) {}

  async save(line: T, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    const cols = [...BASE_COLS, ...this.cfg.extraCols];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
    const params = [line.id, line.tenantId, line.companyId, line.dailyReportId, line.projectId, line.createdBy, line.createdAt, ...this.cfg.toExtraParams(line)];
    await conn.query(`insert into public.${this.cfg.table} (${cols.join(', ')}) values (${placeholders})`, params);
  }

  async listByReport(dailyReportId: string, tenantId: string): Promise<T[]> {
    const res = await this.pool.query(
      `select * from public.${this.cfg.table} where daily_report_id = $1 and tenant_id = $2 order by created_at asc`,
      [dailyReportId, tenantId],
    );
    return res.rows.map((row: QueryResultRow) =>
      this.cfg.fromRow(row, {
        id: row.id, tenantId: row.tenant_id, companyId: row.company_id, dailyReportId: row.daily_report_id,
        projectId: row.project_id, createdBy: row.created_by, createdAt: iso(row.created_at),
      }),
    );
  }
}

export const makePostgresLabourStore = (pool: Pool): ReportLineStore<SiteLabourEntry> =>
  new PostgresReportLineStore<SiteLabourEntry>(pool, {
    table: 'aura_site_report_labour',
    extraCols: ['trade', 'contractor', 'headcount', 'hours', 'man_hours', 'notes'],
    toExtraParams: (l) => [l.trade, l.contractor, l.headcount, l.hours, l.manHours, l.notes],
    fromRow: (r, b) => ({ ...b, trade: r.trade, contractor: r.contractor, headcount: Number(r.headcount), hours: Number(r.hours), manHours: Number(r.man_hours), notes: r.notes }),
  });

export const makePostgresPlantStore = (pool: Pool): ReportLineStore<SitePlantEntry> =>
  new PostgresReportLineStore<SitePlantEntry>(pool, {
    table: 'aura_site_report_plant',
    extraCols: ['equipment_type', 'equipment_id', 'quantity', 'operating_hours', 'status', 'notes'],
    toExtraParams: (l) => [l.equipmentType, l.equipmentId, l.quantity, l.operatingHours, l.status, l.notes],
    fromRow: (r, b) => ({ ...b, equipmentType: r.equipment_type, equipmentId: r.equipment_id, quantity: Number(r.quantity), operatingHours: Number(r.operating_hours), status: r.status, notes: r.notes }),
  });

export const makePostgresProgressStore = (pool: Pool): ReportLineStore<SiteProgressEntry> =>
  new PostgresReportLineStore<SiteProgressEntry>(pool, {
    table: 'aura_site_report_progress',
    extraCols: ['activity_id', 'boq_item_id', 'description', 'planned_qty', 'installed_qty', 'unit', 'progress_pct', 'location', 'notes'],
    toExtraParams: (l) => [l.activityId, l.boqItemId, l.description, l.plannedQty, l.installedQty, l.unit, l.progressPct, l.location, l.notes],
    fromRow: (r, b) => ({ ...b, activityId: r.activity_id, boqItemId: r.boq_item_id, description: r.description, plannedQty: Number(r.planned_qty), installedQty: Number(r.installed_qty), unit: r.unit, progressPct: Number(r.progress_pct), location: r.location, notes: r.notes }),
  });

export const makePostgresDelayStore = (pool: Pool): ReportLineStore<SiteDelayEntry> =>
  new PostgresReportLineStore<SiteDelayEntry>(pool, {
    table: 'aura_site_report_delays',
    extraCols: ['category', 'description', 'duration_hours', 'responsible_party', 'impact', 'mitigation'],
    toExtraParams: (l) => [l.category, l.description, l.durationHours, l.responsibleParty, l.impact, l.mitigation],
    fromRow: (r, b) => ({ ...b, category: r.category, description: r.description, durationHours: Number(r.duration_hours), responsibleParty: r.responsible_party, impact: r.impact, mitigation: r.mitigation }),
  });

export const makePostgresEvidenceStore = (pool: Pool): ReportLineStore<SiteEvidence> =>
  new PostgresReportLineStore<SiteEvidence>(pool, {
    table: 'aura_site_report_evidence',
    extraCols: ['file_id', 'captured_at', 'captured_by', 'location', 'description', 'category', 'hash'],
    toExtraParams: (l) => [l.fileId, l.capturedAt, l.capturedBy, l.location, l.description, l.category, l.hash],
    fromRow: (r, b) => ({ ...b, fileId: r.file_id, capturedAt: r.captured_at ? iso(r.captured_at) : null, capturedBy: r.captured_by, location: r.location, description: r.description, category: r.category, hash: r.hash }),
  });
