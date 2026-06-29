import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { Supplier } from './domain/supplier';
import type { SupplierFilter, SupplierStore } from './supplier-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  code: string;
  name: string;
  category: string;
  trade_license: string | null;
  trn: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, code, name, category, trade_license, trn, contact_name, email, phone, status, created_by, created_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowTo(r: Row): Supplier {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    name: r.name,
    category: r.category as Supplier['category'],
    tradeLicense: r.trade_license,
    trn: r.trn,
    contactName: r.contact_name,
    email: r.email,
    phone: r.phone,
    status: r.status as Supplier['status'],
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

export class PostgresSupplierStore implements SupplierStore {
  constructor(private readonly pool: Pool) {}

  async create(s: Supplier): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_suppliers (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [s.id, s.tenantId, s.companyId, s.code, s.name, s.category, s.tradeLicense, s.trn, s.contactName, s.email, s.phone, s.status, s.createdBy, s.createdAt],
    );
  }

  async update(s: Supplier): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_procurement_suppliers SET name=$2, category=$3, trade_license=$4, trn=$5, contact_name=$6, email=$7, phone=$8, status=$9 WHERE id=$1`,
      [s.id, s.name, s.category, s.tradeLicense, s.trn, s.contactName, s.email, s.phone, s.status],
    );
  }

  async get(id: Id): Promise<Supplier | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_procurement_suppliers WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async getByCode(tenantId: Id, code: string): Promise<Supplier | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_procurement_suppliers WHERE tenant_id = $1 AND code = $2`, [tenantId, code]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(filter: SupplierFilter = {}): Promise<Supplier[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('category', filter.category);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_suppliers ${whereSql} ORDER BY name ASC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowTo);
  }
}
