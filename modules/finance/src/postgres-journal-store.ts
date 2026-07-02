import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { Journal, JournalLine } from './domain/journal';
import type { JournalFilter, JournalStore } from './journal-store';

interface JournalRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  reference: string | null;
  description: string;
  created_by: string | null;
  posted_at: Date | string;
  counterparty_company_id: string | null;
}

interface LineRow {
  id: string;
  journal_id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  debit: string | number;
  credit: string | number;
  cost_center_id: string | null;
  profit_center_id: string | null;
}

const JOURNAL_COLS = 'id, tenant_id, company_id, reference, description, created_by, posted_at, counterparty_company_id';
const LINE_COLS = 'id, journal_id, account_id, account_code, account_name, debit, credit, cost_center_id, profit_center_id';

export class PostgresJournalStore implements JournalStore {
  constructor(private readonly pool: Pool) {}

  async create(j: Journal): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO public.aura_finance_journals (${JOURNAL_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [j.id, j.tenantId, j.companyId, j.reference, j.description, j.createdBy, j.postedAt, j.counterpartyCompanyId],
      );
      for (const l of j.lines) {
        await client.query(
          `INSERT INTO public.aura_finance_journal_lines (${LINE_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [l.id, j.id, l.accountId, l.accountCode, l.accountName, l.debit, l.credit, l.costCenterId, l.profitCenterId],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async get(id: Id): Promise<Journal | null> {
    const jRes = await this.pool.query<JournalRow>(
      `SELECT ${JOURNAL_COLS} FROM public.aura_finance_journals WHERE id = $1`,
      [id],
    );
    if (!jRes.rows.length) return null;
    const jr = jRes.rows[0];

    const lRes = await this.pool.query<LineRow>(
      `SELECT ${LINE_COLS} FROM public.aura_finance_journal_lines WHERE journal_id = $1`,
      [id],
    );

    const lines: JournalLine[] = lRes.rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      accountCode: r.account_code,
      accountName: r.account_name,
      debit: Number(r.debit),
      credit: Number(r.credit),
      costCenterId: r.cost_center_id ?? null,
        profitCenterId: r.profit_center_id ?? null,
    }));

    return {
      id: jr.id,
      tenantId: jr.tenant_id,
      companyId: jr.company_id,
      reference: jr.reference,
      description: jr.description,
      createdBy: jr.created_by,
      postedAt: jr.posted_at instanceof Date ? jr.posted_at.toISOString() : String(jr.posted_at),
      counterpartyCompanyId: jr.counterparty_company_id,
      lines,
    };
  }

  async list(filter: JournalFilter = {}): Promise<Journal[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('reference', filter.reference);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const jRes = await this.pool.query<JournalRow>(
      `SELECT ${JOURNAL_COLS} FROM public.aura_finance_journals ${whereSql} ORDER BY posted_at DESC LIMIT $${params.length}`,
      params,
    );

    if (jRes.rows.length === 0) return [];

    // Batched line fetch (was N+1: one lines-query per journal).
    const ids = jRes.rows.map((r) => r.id);
    const lRes = await this.pool.query<LineRow>(
      `SELECT ${LINE_COLS} FROM public.aura_finance_journal_lines WHERE journal_id = ANY($1)`,
      [ids],
    );
    const linesByJournal = new Map<string, JournalLine[]>();
    for (const r of lRes.rows) {
      const list = linesByJournal.get(r.journal_id) ?? [];
      list.push({
        id: r.id,
        accountId: r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        debit: Number(r.debit),
        credit: Number(r.credit),
        costCenterId: r.cost_center_id ?? null,
        profitCenterId: r.profit_center_id ?? null,
      });
      linesByJournal.set(r.journal_id, list);
    }

    return jRes.rows.map((jr) => ({
      id: jr.id,
      tenantId: jr.tenant_id,
      companyId: jr.company_id,
      reference: jr.reference,
      description: jr.description,
      createdBy: jr.created_by,
      postedAt: jr.posted_at instanceof Date ? jr.posted_at.toISOString() : String(jr.posted_at),
      counterpartyCompanyId: jr.counterparty_company_id,
      lines: linesByJournal.get(jr.id) ?? [],
    }));
  }

  async listPaged(filter: JournalFilter, page: PageParams): Promise<Page<Journal>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('reference', filter.reference);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_finance_journals ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const jRes = await this.pool.query<JournalRow>(
      `SELECT ${JOURNAL_COLS} FROM public.aura_finance_journals ${whereSql} ORDER BY posted_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    if (jRes.rows.length === 0) return makePage([], total, page);

    const ids = jRes.rows.map((r) => r.id);
    const lRes = await this.pool.query<LineRow>(
      `SELECT ${LINE_COLS} FROM public.aura_finance_journal_lines WHERE journal_id = ANY($1)`, [ids]);
    const linesByJournal = new Map<string, JournalLine[]>();
    for (const r of lRes.rows) {
      const list = linesByJournal.get(r.journal_id) ?? [];
      list.push({ id: r.id, accountId: r.account_id, accountCode: r.account_code, accountName: r.account_name, debit: Number(r.debit), credit: Number(r.credit), costCenterId: r.cost_center_id ?? null, profitCenterId: r.profit_center_id ?? null });
      linesByJournal.set(r.journal_id, list);
    }
    const items = jRes.rows.map((jr) => ({
      id: jr.id, tenantId: jr.tenant_id, companyId: jr.company_id, reference: jr.reference,
      description: jr.description, createdBy: jr.created_by,
      postedAt: jr.posted_at instanceof Date ? jr.posted_at.toISOString() : String(jr.posted_at),
      counterpartyCompanyId: jr.counterparty_company_id,
      lines: linesByJournal.get(jr.id) ?? [],
    }));
    return makePage(items, total, page);
  }
}
