import type { Pool } from 'pg';
import type { Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { CommissioningStore } from './store.interface';
import type { CommissioningRecord, CommissioningStatus, ElvSystem } from './domain/commissioning-record';
import type { HandoverPackage, HandoverStatus, HandoverChecklist } from './domain/handover';

// Postgres adapter for Commissioning. The domain is a plain interface (no class rehydration),
// so mapping is a straight row → object. `date` columns are read via ::text to avoid the
// timezone-drift hazard; timestamptz columns are stored/read as ISO strings.

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  project_id: string;
  project_name: string | null;
  code: string;
  title: string;
  system: string;
  location: string | null;
  status: string;
  points_total: number;
  points_passed: number;
  test_date: string | null;
  remarks: string | null;
  commissioned_at: string | null;
  commissioned_by: string | null;
  witnessed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// SELECT list: date read via ::text to avoid timezone drift.
const COLS = `id, tenant_id, company_id, project_id, project_name, code, title, system, location,
  status, points_total, points_passed, test_date::text, remarks,
  commissioned_at, commissioned_by, witnessed_by, created_by, created_at, updated_at`;
// INSERT list: same columns, no casts (a cast is invalid in a column list).
const INSERT_COLS = `id, tenant_id, company_id, project_id, project_name, code, title, system, location,
  status, points_total, points_passed, test_date, remarks,
  commissioned_at, commissioned_by, witnessed_by, created_by, created_at, updated_at`;

function toRecord(r: Row): CommissioningRecord {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    projectId: r.project_id,
    projectName: r.project_name,
    code: r.code,
    title: r.title,
    system: r.system as ElvSystem,
    location: r.location,
    status: r.status as CommissioningStatus,
    pointsTotal: Number(r.points_total),
    pointsPassed: Number(r.points_passed),
    testDate: r.test_date,
    remarks: r.remarks,
    commissionedAt: r.commissioned_at,
    commissionedBy: r.commissioned_by,
    witnessedBy: r.witnessed_by,
    createdBy: r.created_by,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
  };
}

export class PostgresCommissioningStore implements CommissioningStore {
  constructor(private readonly pool: Pool) {}

  async save(rec: CommissioningRecord): Promise<void> {
    await this.pool.query(
      `insert into public.aura_commissioning_records (${INSERT_COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       on conflict (id) do update set
         project_name = excluded.project_name,
         title = excluded.title,
         system = excluded.system,
         location = excluded.location,
         status = excluded.status,
         points_total = excluded.points_total,
         points_passed = excluded.points_passed,
         test_date = excluded.test_date,
         remarks = excluded.remarks,
         commissioned_at = excluded.commissioned_at,
         commissioned_by = excluded.commissioned_by,
         witnessed_by = excluded.witnessed_by,
         updated_at = excluded.updated_at`,
      [
        rec.id, rec.tenantId, rec.companyId, rec.projectId, rec.projectName, rec.code, rec.title,
        rec.system, rec.location, rec.status, rec.pointsTotal, rec.pointsPassed, rec.testDate,
        rec.remarks, rec.commissionedAt, rec.commissionedBy, rec.witnessedBy, rec.createdBy,
        rec.createdAt, rec.updatedAt,
      ],
    );
  }

  async find(id: string, tenantId: string): Promise<CommissioningRecord | null> {
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_commissioning_records where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return res.rows[0] ? toRecord(res.rows[0]) : null;
  }

  async list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]> {
    const res = projectId
      ? await this.pool.query<Row>(
          `select ${COLS} from public.aura_commissioning_records
           where tenant_id = $1 and project_id = $2 order by created_at desc limit 500`,
          [tenantId, projectId],
        )
      : await this.pool.query<Row>(
          `select ${COLS} from public.aura_commissioning_records
           where tenant_id = $1 order by created_at desc limit 500`,
          [tenantId],
        );
    return res.rows.map(toRecord);
  }

  async listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>> {
    const where = projectId ? 'where tenant_id = $1 and project_id = $2' : 'where tenant_id = $1';
    const params = projectId ? [tenantId, projectId] : [tenantId];
    const countRes = await this.pool.query<{ count: string }>(
      `select count(*)::text as count from public.aura_commissioning_records ${where}`,
      params,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);
    const res = await this.pool.query<Row>(
      `select ${COLS} from public.aura_commissioning_records ${where}
       order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, page.limit, page.offset],
    );
    return makePage(res.rows.map(toRecord), total, page);
  }

  // ── Handover packages ──────────────────────────────────────────────────────

  async saveHandover(p: HandoverPackage): Promise<void> {
    await this.pool.query(
      `insert into public.aura_handover_packages
         (id, tenant_id, company_id, project_id, project_name, code, title, status, checklist,
          submitted_at, accepted_at, client_representative, warranty_start_date, warranty_months,
          remarks, created_by, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       on conflict (id) do update set
         project_name = excluded.project_name,
         title = excluded.title,
         status = excluded.status,
         checklist = excluded.checklist,
         submitted_at = excluded.submitted_at,
         accepted_at = excluded.accepted_at,
         client_representative = excluded.client_representative,
         warranty_start_date = excluded.warranty_start_date,
         warranty_months = excluded.warranty_months,
         remarks = excluded.remarks,
         updated_at = excluded.updated_at`,
      [
        p.id, p.tenantId, p.companyId, p.projectId, p.projectName, p.code, p.title, p.status,
        JSON.stringify(p.checklist), p.submittedAt, p.acceptedAt, p.clientRepresentative,
        p.warrantyStartDate, p.warrantyMonths, p.remarks, p.createdBy, p.createdAt, p.updatedAt,
      ],
    );
  }

  async findHandover(id: string, tenantId: string): Promise<HandoverPackage | null> {
    const res = await this.pool.query<HandoverRow>(
      `select ${HANDOVER_COLS} from public.aura_handover_packages where id = $1 and tenant_id = $2`,
      [id, tenantId],
    );
    return res.rows[0] ? toHandover(res.rows[0]) : null;
  }

  async listHandovers(tenantId: string, projectId?: string): Promise<HandoverPackage[]> {
    const res = projectId
      ? await this.pool.query<HandoverRow>(
          `select ${HANDOVER_COLS} from public.aura_handover_packages
           where tenant_id = $1 and project_id = $2 order by created_at desc limit 500`,
          [tenantId, projectId],
        )
      : await this.pool.query<HandoverRow>(
          `select ${HANDOVER_COLS} from public.aura_handover_packages
           where tenant_id = $1 order by created_at desc limit 500`,
          [tenantId],
        );
    return res.rows.map(toHandover);
  }
}

interface HandoverRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  project_id: string;
  project_name: string | null;
  code: string;
  title: string;
  status: string;
  checklist: HandoverChecklist | string;
  submitted_at: string | null;
  accepted_at: string | null;
  client_representative: string | null;
  warranty_start_date: string | null;
  warranty_months: number | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const HANDOVER_COLS = `id, tenant_id, company_id, project_id, project_name, code, title, status,
  checklist, submitted_at, accepted_at, client_representative, warranty_start_date::text,
  warranty_months, remarks, created_by, created_at, updated_at`;

function toHandover(r: HandoverRow): HandoverPackage {
  const checklist = (typeof r.checklist === 'string' ? JSON.parse(r.checklist) : r.checklist) as HandoverChecklist;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    projectId: r.project_id,
    projectName: r.project_name,
    code: r.code,
    title: r.title,
    status: r.status as HandoverStatus,
    checklist: {
      omManuals: !!checklist?.omManuals,
      asBuilts: !!checklist?.asBuilts,
      testCertificates: !!checklist?.testCertificates,
      warrantyDocs: !!checklist?.warrantyDocs,
      training: !!checklist?.training,
      spares: !!checklist?.spares,
    },
    submittedAt: r.submitted_at,
    acceptedAt: r.accepted_at,
    clientRepresentative: r.client_representative,
    warrantyStartDate: r.warranty_start_date,
    warrantyMonths: r.warranty_months == null ? null : Number(r.warranty_months),
    remarks: r.remarks,
    createdBy: r.created_by,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
  };
}
