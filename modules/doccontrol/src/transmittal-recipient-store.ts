import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TxHandle } from '@aura/core';
import type { TransmittalRecipient, TransmittalParty } from './domain/transmittal-recipient';

/**
 * Where a conveyance's named recipients live, each with their own receipt.
 *
 * Kept apart from `TransmittalAcknowledgementStore`, which records that an acknowledgement HAPPENED
 * and is append-only history. This answers a different question — WHO was addressed, and which of
 * them has answered — and its rows are updated when somebody acknowledges. Both are wanted: the
 * history says what occurred, this says where the distribution stands.
 */
export const TRANSMITTAL_RECIPIENT_STORE = Symbol('TRANSMITTAL_RECIPIENT_STORE');

export interface TransmittalRecipientStore {
  save(recipient: TransmittalRecipient, tx?: TxHandle): Promise<void>;
  listByTransmittal(transmittalId: string, tenantId: string): Promise<TransmittalRecipient[]>;
  /** What a given person has been sent and has not yet answered for. */
  listOutstandingForUser(userId: string, tenantId: string): Promise<TransmittalRecipient[]>;
}

const clone = (r: TransmittalRecipient): TransmittalRecipient => ({ ...r });

/** In-memory, for a composition with no database. Same contract, same ordering. */
export class InMemoryTransmittalRecipientStore implements TransmittalRecipientStore {
  private readonly rows = new Map<string, TransmittalRecipient>();

  async save(recipient: TransmittalRecipient, _tx?: TxHandle): Promise<void> {
    const clash = [...this.rows.values()].find((row) =>
      row.transmittalId === recipient.transmittalId && row.userId === recipient.userId && row.id !== recipient.id);
    // The database enforces this with a UNIQUE constraint; enforcing it here too means a
    // composition without Postgres does not quietly permit what the real one refuses.
    if (clash) throw new Error(`${recipient.userId} is already a recipient of this transmittal`);
    this.rows.set(recipient.id, clone(recipient));
  }

  async listByTransmittal(transmittalId: string, tenantId: string): Promise<TransmittalRecipient[]> {
    return [...this.rows.values()]
      .filter((row) => row.transmittalId === transmittalId && row.tenantId === tenantId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : (a.userId < b.userId ? -1 : 1)))
      .map(clone);
  }

  async listOutstandingForUser(userId: string, tenantId: string): Promise<TransmittalRecipient[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenantId === tenantId && row.userId === userId && row.acknowledgedAt === null)
      .map(clone);
  }
}

const toRecipient = (row: QueryResultRow): TransmittalRecipient => ({
  id: row.id,
  tenantId: row.tenant_id,
  companyId: row.company_id,
  projectId: row.project_id,
  transmittalId: row.transmittal_id,
  userId: row.user_id,
  party: row.party as TransmittalParty,
  acknowledgedAt: row.acknowledged_at instanceof Date ? row.acknowledged_at.toISOString()
    : (row.acknowledged_at ? String(row.acknowledged_at) : null),
  acknowledgedNote: row.acknowledged_note ?? null,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
});

const COLS = 'id, tenant_id, company_id, project_id, transmittal_id, user_id, party, acknowledged_at, acknowledged_note, created_at';

export class PostgresTransmittalRecipientStore implements TransmittalRecipientStore {
  constructor(private readonly pool: Pool) {}

  async save(recipient: TransmittalRecipient, tx?: TxHandle): Promise<void> {
    const conn = (tx as PoolClient) || this.pool;
    await conn.query(
      `insert into public.aura_doccontrol_transmittal_recipients (${COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (id) do update set
         acknowledged_at = excluded.acknowledged_at,
         acknowledged_note = excluded.acknowledged_note`,
      [recipient.id, recipient.tenantId, recipient.companyId, recipient.projectId, recipient.transmittalId,
       recipient.userId, recipient.party, recipient.acknowledgedAt, recipient.acknowledgedNote, recipient.createdAt],
    );
  }

  async listByTransmittal(transmittalId: string, tenantId: string): Promise<TransmittalRecipient[]> {
    const res = await this.pool.query(
      `select ${COLS} from public.aura_doccontrol_transmittal_recipients
        where transmittal_id = $1 and tenant_id = $2 order by created_at, user_id`,
      [transmittalId, tenantId],
    );
    return res.rows.map(toRecipient);
  }

  async listOutstandingForUser(userId: string, tenantId: string): Promise<TransmittalRecipient[]> {
    const res = await this.pool.query(
      `select ${COLS} from public.aura_doccontrol_transmittal_recipients
        where tenant_id = $1 and user_id = $2 and acknowledged_at is null order by created_at`,
      [tenantId, userId],
    );
    return res.rows.map(toRecipient);
  }
}
