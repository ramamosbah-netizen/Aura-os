import type { Pool } from 'pg';
import type { Id, NegotiationEntry, NegotiationEntryType, NegotiationParty } from '@aura/shared';
import type { NegotiationFilter, NegotiationStore } from './negotiation-store';

interface Row {
  id: string;
  tenant_id: string;
  quotation_id: string;
  type: string;
  party: string;
  amount: string | number | null;
  percent: string | number | null;
  note: string;
  recorded_by: string | null;
  occurred_at: Date | string;
  created_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());
// numeric comes back as a string from pg; a silent NaN here would read as "no discount asked".
const num = (v: string | number | null): number | null => (v === null ? null : Number(v));

function rowTo(r: Row): NegotiationEntry {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    quotationId: r.quotation_id,
    type: r.type as NegotiationEntryType,
    party: r.party as NegotiationParty,
    amount: num(r.amount),
    percent: num(r.percent),
    note: r.note,
    recordedBy: r.recorded_by,
    occurredAt: iso(r.occurred_at),
    createdAt: iso(r.created_at),
  };
}

const COLS =
  'id, tenant_id, quotation_id, type, party, amount, percent, note, recorded_by, occurred_at, created_at';

export class PostgresNegotiationStore implements NegotiationStore {
  constructor(private readonly pool: Pool) {}

  async append(e: NegotiationEntry): Promise<void> {
    // Plain insert, no ON CONFLICT: a log entry is never re-written, so a duplicate id is a bug
    // that should surface rather than silently overwrite what was said earlier.
    await this.pool.query(
      `insert into public.aura_crm_negotiation_entries (${COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [e.id, e.tenantId, e.quotationId, e.type, e.party, e.amount, e.percent,
       e.note, e.recordedBy, e.occurredAt, e.createdAt],
    );
  }

  async list(filter: NegotiationFilter): Promise<NegotiationEntry[]> {
    const params: unknown[] = [filter.tenantId];
    let sql = `select ${COLS} from public.aura_crm_negotiation_entries where tenant_id = $1`;
    if (filter.quotationId) {
      params.push(filter.quotationId);
      sql += ` and quotation_id = $${params.length}`;
    }
    // Oldest first — the log reads as a conversation. created_at breaks ties so back-dated
    // entries sharing a timestamp keep the order they were written in.
    sql += ' order by occurred_at asc, created_at asc';
    const res = await this.pool.query<Row>(sql, params);
    return res.rows.map(rowTo);
  }

  async remove(id: Id): Promise<boolean> {
    const res = await this.pool.query('delete from public.aura_crm_negotiation_entries where id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
