import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { FrameworkAgreement, FrameworkRateItem } from './domain/framework-agreement';
import type { FrameworkAgreementFilter, FrameworkAgreementStore } from './framework-agreement-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  reference: string | null;
  title: string;
  supplier_id: string;
  supplier_name: string | null;
  status: string;
  valid_from: string;
  valid_to: string;
  ceiling_value: string | number;
  called_off_value: string | number;
  items: unknown;
  notes: string | null;
  created_by: string | null;
  created_at: Date | string;
}

// `date` columns read via ::text to avoid the timezone-drift hazard that bit other stores.
const COLS =
  'id, tenant_id, company_id, reference, title, supplier_id, supplier_name, status, valid_from::text AS valid_from, valid_to::text AS valid_to, ceiling_value, called_off_value, items, notes, created_by, created_at';

function rowToAgreement(r: Row): FrameworkAgreement {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    reference: r.reference,
    title: r.title,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    status: r.status as FrameworkAgreement['status'],
    validFrom: r.valid_from,
    validTo: r.valid_to,
    ceilingValue: Number(r.ceiling_value),
    calledOffValue: Number(r.called_off_value),
    items: (typeof r.items === 'string' ? JSON.parse(r.items) : r.items) as FrameworkRateItem[],
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable framework agreements on Postgres (`aura_procurement_framework_agreements`). */
export class PostgresFrameworkAgreementStore implements FrameworkAgreementStore {
  constructor(private readonly pool: Pool) {}

  async save(fa: FrameworkAgreement): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_framework_agreements
         (id, tenant_id, company_id, reference, title, supplier_id, supplier_name, status,
          valid_from, valid_to, ceiling_value, called_off_value, items, notes, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO UPDATE SET
         reference = EXCLUDED.reference, title = EXCLUDED.title, status = EXCLUDED.status,
         valid_from = EXCLUDED.valid_from, valid_to = EXCLUDED.valid_to,
         ceiling_value = EXCLUDED.ceiling_value, called_off_value = EXCLUDED.called_off_value,
         items = EXCLUDED.items, notes = EXCLUDED.notes`,
      [fa.id, fa.tenantId, fa.companyId, fa.reference, fa.title, fa.supplierId, fa.supplierName, fa.status,
       fa.validFrom, fa.validTo, fa.ceilingValue, fa.calledOffValue, JSON.stringify(fa.items), fa.notes, fa.createdBy, fa.createdAt],
    );
  }

  async get(id: Id): Promise<FrameworkAgreement | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_framework_agreements WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToAgreement(res.rows[0]) : null;
  }

  private buildWhere(filter: FrameworkAgreementFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('supplier_id', filter.supplierId);
    add('status', filter.status);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: FrameworkAgreementFilter = {}): Promise<FrameworkAgreement[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_framework_agreements ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToAgreement);
  }

  async listPaged(filter: FrameworkAgreementFilter, page: PageParams): Promise<Page<FrameworkAgreement>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_procurement_framework_agreements ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_framework_agreements ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToAgreement), total, page);
  }
}
