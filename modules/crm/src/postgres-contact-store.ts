import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { Contact } from './domain/contact';
import type { ContactFilter, ContactStore } from './contact-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  account_id: string | null;
  account_name: string | null;
  name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  status: string;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, account_id, account_name, name, job_title, email, phone, is_primary, status, owner_id, created_by, created_at';

function rowToContact(r: Row): Contact {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    accountId: r.account_id,
    accountName: r.account_name,
    name: r.name,
    jobTitle: r.job_title,
    email: r.email,
    phone: r.phone,
    isPrimary: r.is_primary,
    status: r.status as Contact['status'],
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable CRM contacts on Postgres (`aura_crm_contacts`). */
export class PostgresContactStore implements ContactStore {
  constructor(private readonly pool: Pool) {}

  async save(c: Contact): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_contacts (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         account_id = EXCLUDED.account_id, account_name = EXCLUDED.account_name, name = EXCLUDED.name,
         job_title = EXCLUDED.job_title, email = EXCLUDED.email, phone = EXCLUDED.phone,
         is_primary = EXCLUDED.is_primary, status = EXCLUDED.status, owner_id = EXCLUDED.owner_id`,
      [c.id, c.tenantId, c.companyId, c.accountId, c.accountName, c.name, c.jobTitle, c.email, c.phone, c.isPrimary, c.status, c.ownerId, c.createdBy, c.createdAt],
    );
  }

  async get(id: Id): Promise<Contact | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_contacts WHERE id = $1`, [id]);
    return res.rows.length ? rowToContact(res.rows[0]) : null;
  }

  private buildWhere(filter: ContactFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('account_id', filter.accountId);
    add('status', filter.status);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: ContactFilter = {}): Promise<Contact[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_contacts ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToContact);
  }

  async listPaged(filter: ContactFilter, page: PageParams): Promise<Page<Contact>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_crm_contacts ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_contacts ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToContact), total, page);
  }
}
