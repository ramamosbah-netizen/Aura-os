import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { Rfq, RfqQuote } from './domain/rfq';
import type { RfqFilter, RfqStore } from './rfq-store';

interface RfqRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  reference: string | null;
  title: string;
  pr_id: string | null;
  pr_title: string | null;
  status: string;
  due_date: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

interface QuoteRow {
  id: string;
  rfq_id: string;
  tenant_id: string;
  supplier_name: string;
  amount: string | number;
  lead_time_days: number | null;
  notes: string | null;
  status: string;
  created_at: Date | string;
}

const RFQ_COLS =
  'id, tenant_id, company_id, reference, title, pr_id, pr_title, status, due_date, owner_id, created_by, created_at';
const QUOTE_COLS = 'id, rfq_id, tenant_id, supplier_name, amount, lead_time_days, notes, status, created_at';

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowToRfq(r: RfqRow): Rfq {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    reference: r.reference,
    title: r.title,
    prId: r.pr_id,
    prTitle: r.pr_title,
    status: r.status as Rfq['status'],
    dueDate: r.due_date,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

function rowToQuote(r: QuoteRow): RfqQuote {
  return {
    id: r.id,
    rfqId: r.rfq_id,
    tenantId: r.tenant_id,
    supplierName: r.supplier_name,
    amount: Number(r.amount),
    leadTimeDays: r.lead_time_days,
    notes: r.notes,
    status: r.status as RfqQuote['status'],
    createdAt: iso(r.created_at),
  };
}

/** Durable RFQs + quotes on Postgres (`aura_procurement_rfqs`, `aura_procurement_rfq_quotes`). */
export class PostgresRfqStore implements RfqStore {
  constructor(private readonly pool: Pool) {}

  async create(r: Rfq): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_rfqs (${RFQ_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [r.id, r.tenantId, r.companyId, r.reference, r.title, r.prId, r.prTitle, r.status, r.dueDate, r.ownerId, r.createdBy, r.createdAt],
    );
  }

  async update(r: Rfq): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_procurement_rfqs SET reference=$2, title=$3, pr_id=$4, pr_title=$5, status=$6, due_date=$7, owner_id=$8 WHERE id=$1`,
      [r.id, r.reference, r.title, r.prId, r.prTitle, r.status, r.dueDate, r.ownerId],
    );
  }

  async get(id: Id): Promise<Rfq | null> {
    const res = await this.pool.query<RfqRow>(`SELECT ${RFQ_COLS} FROM public.aura_procurement_rfqs WHERE id = $1`, [id]);
    return res.rows.length ? rowToRfq(res.rows[0]) : null;
  }

  async list(filter: RfqFilter = {}): Promise<Rfq[]> {
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
    add('pr_id', filter.prId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<RfqRow>(
      `SELECT ${RFQ_COLS} FROM public.aura_procurement_rfqs ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToRfq);
  }

  async addQuote(q: RfqQuote): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_rfq_quotes (${QUOTE_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [q.id, q.rfqId, q.tenantId, q.supplierName, q.amount, q.leadTimeDays, q.notes, q.status, q.createdAt],
    );
  }

  async updateQuote(q: RfqQuote): Promise<void> {
    await this.pool.query(`UPDATE public.aura_procurement_rfq_quotes SET status=$2 WHERE id=$1`, [q.id, q.status]);
  }

  async getQuote(id: Id): Promise<RfqQuote | null> {
    const res = await this.pool.query<QuoteRow>(`SELECT ${QUOTE_COLS} FROM public.aura_procurement_rfq_quotes WHERE id = $1`, [id]);
    return res.rows.length ? rowToQuote(res.rows[0]) : null;
  }

  async listQuotes(rfqId: Id): Promise<RfqQuote[]> {
    const res = await this.pool.query<QuoteRow>(
      `SELECT ${QUOTE_COLS} FROM public.aura_procurement_rfq_quotes WHERE rfq_id = $1 ORDER BY amount ASC`,
      [rfqId],
    );
    return res.rows.map(rowToQuote);
  }
}
