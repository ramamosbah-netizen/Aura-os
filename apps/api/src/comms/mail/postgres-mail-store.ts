import type { Pool } from 'pg';
import { newId } from '@aura/shared';
import type { MailDirection, MailParticipant, MailRecord, MailState, RecipientRole } from './mail-domain';
import type { DispatchRecord, MailFilter, MailStore } from './mail-store';

interface MailRow {
  id: string; tenant_id: string; company_id: string | null; account_id: string | null;
  direction: string; state: string; from_user: string | null; subject: string; body: string;
  body_html: string | null; snippet: string | null; thread_id: string;
  parent_mail_id: string | null; forwarded_from_mail_id: string | null;
  provider_message_id: string | null; provider_thread_id: string | null;
  internet_message_id: string | null; in_reply_to: string | null; references_header: string | null;
  sent_at: Date | string | null; failed_reason: string | null;
  created_at: Date | string; updated_at: Date | string;
}

interface ParticipantRow {
  id: string; subject_id: string; role: string; address: string | null;
  display_name: string | null; user_id: string | null; contact_id: string | null; read_at: Date | string | null;
}

const iso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const isoOrNull = (value: Date | string | null): string | null => (value === null ? null : iso(value));

/**
 * Postgres mail persistence (migrations 0234–0236).
 *
 * Writes the SHARED Communication tables — participants, mail reads, dispatch — rather than
 * mail-private copies of them, because mail is a facet of the Communication context and not a
 * context of its own.
 *
 * Every statement filters on tenant_id even though the tables are FORCE-RLS: the policy is the
 * backstop, and an explicit predicate makes a scoping mistake visible in review.
 */
export class PostgresMailStore implements MailStore {
  constructor(private readonly pool: Pool) {}

  /**
   * Canonical write — mail row, participants, and the derived legacy projection — in ONE transaction.
   *
   * THE single mail write path. CommsService.sendMail delegates here too, so there is one writer
   * per operation rather than merely one per table: canonical rows and the legacy projection are
   * written together, and cannot describe different envelopes.
   */
  async save(tenantId: string, mail: MailRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `insert into public.aura_comms_mail
           (id, tenant_id, company_id, account_id, direction, state, from_user, subject, body,
            body_html, snippet, thread_id, parent_mail_id, forwarded_from_mail_id,
            provider_message_id, provider_thread_id, internet_message_id, in_reply_to,
            references_header, sent_at, failed_reason, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         on conflict (id) do update set
           account_id = excluded.account_id, direction = excluded.direction, state = excluded.state,
           subject = excluded.subject, body = excluded.body, body_html = excluded.body_html,
           snippet = excluded.snippet, parent_mail_id = excluded.parent_mail_id,
           forwarded_from_mail_id = excluded.forwarded_from_mail_id,
           provider_message_id = excluded.provider_message_id,
           provider_thread_id = excluded.provider_thread_id,
           internet_message_id = excluded.internet_message_id, in_reply_to = excluded.in_reply_to,
           references_header = excluded.references_header, sent_at = excluded.sent_at,
           failed_reason = excluded.failed_reason, updated_at = excluded.updated_at`,
        [mail.id, tenantId, mail.companyId, mail.accountId, mail.direction, mail.state, mail.fromUser,
          mail.subject, mail.body, mail.bodyHtml, mail.snippet, mail.threadId, mail.parentMailId,
          mail.forwardedFromMailId, mail.providerMessageId, mail.providerThreadId, mail.internetMessageId,
          mail.inReplyTo, mail.referencesHeader, mail.sentAt, mail.failedReason, mail.createdAt, mail.updatedAt],
      );

      // Participants are replaced wholesale: an edited draft may have lost a recipient, and
      // merging would silently keep someone on an envelope the user removed them from.
      //
      // But mail_reads references participant ids, so a naive delete-and-reinsert would orphan
      // every read receipt and silently mark read mail unread again. The read state is therefore
      // captured by PERSON first and re-attached to the new rows afterwards.
      const { rows: previousReads } = await client.query<{ key: string; read_at: Date | string }>(
        `select coalesce('user:' || p.user_id, lower(p.address)) as key, r.read_at
           from public.aura_comms_participants p
           join public.aura_comms_mail_reads r on r.tenant_id = p.tenant_id and r.participant_id = p.id
          where p.tenant_id = $1 and p.subject_type = 'mail' and p.subject_id = $2`,
        [tenantId, mail.id],
      );
      const readBefore = new Map(previousReads.map((row) => [row.key, iso(row.read_at)]));

      await client.query(
        `delete from public.aura_comms_mail_reads where tenant_id = $1 and participant_id in (
           select id from public.aura_comms_participants
            where tenant_id = $1 and subject_type = 'mail' and subject_id = $2)`,
        [tenantId, mail.id],
      );
      await client.query(
        `delete from public.aura_comms_participants where tenant_id = $1 and subject_type = 'mail' and subject_id = $2`,
        [tenantId, mail.id],
      );

      for (const participant of mail.participants) {
        const participantId = newId();
        await client.query(
          `insert into public.aura_comms_participants
             (id, tenant_id, subject_type, subject_id, role, address, display_name, user_id, contact_id)
           values ($1, $2, 'mail', $3, $4, $5, $6, $7, $8)`,
          [participantId, tenantId, mail.id, participant.role, participant.address,
            participant.displayName ?? null, participant.userId ?? null, participant.contactId ?? null],
        );
        // readAt on the record is a projection and is deliberately NOT written from here; only a
        // receipt that already existed is carried across.
        const key = participant.userId ? `user:${participant.userId}` : (participant.address ?? '').toLowerCase();
        const previous = readBefore.get(key);
        if (previous && participant.role !== 'from') {
          await client.query(
            `insert into public.aura_comms_mail_reads (tenant_id, mail_id, participant_id, read_at)
             values ($1, $2, $3, $4) on conflict (tenant_id, participant_id) do nothing`,
            [tenantId, mail.id, participantId, previous],
          );
        }
      }

      // Legacy projection, DERIVED from the canonical participants in the same transaction.
      //
      // One writer per OPERATION, not merely per table: every mail — whether composed through
      // MailService or sent through the old CommsService endpoint — lands here, so canonical rows
      // and the legacy projection can never describe different envelopes. Only participants that
      // map to an AURA user can be represented, because the old table keyed on username.
      await client.query(`delete from public.aura_comms_mail_recipients where tenant_id = $1 and mail_id = $2`, [tenantId, mail.id]);
      for (const participant of mail.participants) {
        if (participant.role === 'from' || !participant.userId) continue;
        await client.query(
          `insert into public.aura_comms_mail_recipients (tenant_id, mail_id, username, kind)
           values ($1, $2, $3, $4) on conflict do nothing`,
          [tenantId, mail.id, participant.userId, participant.role],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async hydrate(tenantId: string, rows: MailRow[]): Promise<MailRecord[]> {
    if (rows.length === 0) return [];
    const { rows: people } = await this.pool.query<ParticipantRow>(
      `select p.id, p.subject_id, p.role, p.address, p.display_name, p.user_id, p.contact_id, r.read_at
         from public.aura_comms_participants p
         left join public.aura_comms_mail_reads r on r.tenant_id = p.tenant_id and r.participant_id = p.id
        where p.tenant_id = $1 and p.subject_type = 'mail' and p.subject_id = any($2::uuid[])`,
      [tenantId, rows.map((r) => r.id)],
    );
    const byMail = new Map<string, MailParticipant[]>();
    for (const person of people) {
      const list = byMail.get(person.subject_id) ?? [];
      list.push({
        role: person.role as RecipientRole,
        address: person.address,
        displayName: person.display_name,
        userId: person.user_id,
        contactId: person.contact_id,
        readAt: isoOrNull(person.read_at),
      });
      byMail.set(person.subject_id, list);
    }
    return rows.map((row) => this.toRecord(row, byMail.get(row.id) ?? []));
  }

  private toRecord(row: MailRow, participants: MailParticipant[]): MailRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      companyId: row.company_id,
      accountId: row.account_id,
      direction: row.direction as MailDirection,
      state: row.state as MailState,
      fromUser: row.from_user,
      subject: row.subject,
      body: row.body,
      bodyHtml: row.body_html,
      snippet: row.snippet,
      participants,
      threadId: row.thread_id,
      parentMailId: row.parent_mail_id,
      forwardedFromMailId: row.forwarded_from_mail_id,
      providerMessageId: row.provider_message_id,
      providerThreadId: row.provider_thread_id,
      internetMessageId: row.internet_message_id,
      inReplyTo: row.in_reply_to,
      referencesHeader: row.references_header,
      sentAt: isoOrNull(row.sent_at),
      failedReason: row.failed_reason,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }

  async get(tenantId: string, mailId: string): Promise<MailRecord | null> {
    const { rows } = await this.pool.query<MailRow>(
      `select * from public.aura_comms_mail where tenant_id = $1 and id = $2`, [tenantId, mailId],
    );
    return (await this.hydrate(tenantId, rows))[0] ?? null;
  }

  async list(tenantId: string, filter: MailFilter): Promise<MailRecord[]> {
    const limit = Math.min(filter.limit ?? 100, 500);
    const address = filter.address ?? null;
    const userId = filter.userId ?? null;

    // Drafts and scheduled mail belong to their author; inbox and sent are decided by the envelope.
    if (filter.folder === 'drafts' || filter.folder === 'scheduled') {
      const state = filter.folder === 'drafts' ? 'draft' : 'scheduled';
      const { rows } = await this.pool.query<MailRow>(
        `select * from public.aura_comms_mail
          where tenant_id = $1 and state = $2 and from_user is not distinct from $3
          order by updated_at desc limit $4`,
        [tenantId, state, userId, limit],
      );
      return this.hydrate(tenantId, rows);
    }

    const role = filter.folder === 'sent' ? `p.role = 'from'` : `p.role in ('to','cc','bcc')`;
    const { rows } = await this.pool.query<MailRow>(
      `select m.* from public.aura_comms_mail m
        where m.tenant_id = $1
          and m.state in ('sent','received','queued','sending','failed')
          and exists (
            select 1 from public.aura_comms_participants p
             where p.tenant_id = m.tenant_id and p.subject_type = 'mail' and p.subject_id = m.id
               and ${role}
               and (($2::text is not null and lower(p.address) = lower($2)) or ($3::text is not null and p.user_id = $3))
          )
        order by coalesce(m.sent_at, m.created_at) desc limit $4`,
      [tenantId, address, userId, limit],
    );
    return this.hydrate(tenantId, rows);
  }

  async thread(tenantId: string, threadId: string): Promise<MailRecord[]> {
    const { rows } = await this.pool.query<MailRow>(
      `select * from public.aura_comms_mail where tenant_id = $1 and thread_id = $2
        order by coalesce(sent_at, created_at)`,
      [tenantId, threadId],
    );
    return this.hydrate(tenantId, rows);
  }

  async remove(tenantId: string, mailId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`delete from public.aura_comms_mail_recipients where tenant_id = $1 and mail_id = $2`, [tenantId, mailId]);
      await client.query(
        `delete from public.aura_comms_mail_reads where tenant_id = $1 and participant_id in (
           select id from public.aura_comms_participants
            where tenant_id = $1 and subject_type = 'mail' and subject_id = $2)`,
        [tenantId, mailId],
      );
      await client.query(`delete from public.aura_comms_participants where tenant_id = $1 and subject_type = 'mail' and subject_id = $2`, [tenantId, mailId]);
      await client.query(`delete from public.aura_comms_mail where tenant_id = $1 and id = $2`, [tenantId, mailId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markRead(tenantId: string, mailId: string, reader: { address?: string | null; userId?: string | null }, at: string): Promise<void> {
    await this.pool.query(
      `insert into public.aura_comms_mail_reads (tenant_id, mail_id, participant_id, read_at)
       select $1, $2, p.id, $5
         from public.aura_comms_participants p
        where p.tenant_id = $1 and p.subject_type = 'mail' and p.subject_id = $2
          and p.role in ('to','cc','bcc')
          and (($3::text is not null and lower(p.address) = lower($3)) or ($4::text is not null and p.user_id = $4))
       on conflict (tenant_id, participant_id) do nothing`,
      [tenantId, mailId, reader.address ?? null, reader.userId ?? null, at],
    );
  }

  async findByProviderMessage(tenantId: string, accountId: string | null, providerMessageId: string): Promise<MailRecord | null> {
    const { rows } = await this.pool.query<MailRow>(
      `select * from public.aura_comms_mail
        where tenant_id = $1 and provider_message_id = $2
          and coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = coalesce($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
      [tenantId, providerMessageId, accountId],
    );
    return (await this.hydrate(tenantId, rows))[0] ?? null;
  }

  async upsertDispatch(tenantId: string, dispatch: DispatchRecord): Promise<void> {
    await this.pool.query(
      `insert into public.aura_comms_dispatch
         (id, tenant_id, subject_type, subject_id, account_id, scheduled_at, scheduled_timezone, state, attempts)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do update set
         scheduled_at = excluded.scheduled_at,
         scheduled_timezone = excluded.scheduled_timezone,
         state = excluded.state,
         attempts = excluded.attempts`,
      [dispatch.id, tenantId, dispatch.subjectType, dispatch.subjectId, dispatch.accountId,
        dispatch.scheduledAt, dispatch.scheduledTimezone, dispatch.state, dispatch.attempts],
    );
  }

  async getDispatch(tenantId: string, subjectId: string): Promise<DispatchRecord | null> {
    const { rows } = await this.pool.query<{
      id: string; subject_type: string; subject_id: string; account_id: string | null;
      scheduled_at: Date | string; scheduled_timezone: string; state: string; attempts: number; last_error: string | null;
    }>(
      `select id, subject_type, subject_id, account_id, scheduled_at, scheduled_timezone, state, attempts, last_error
         from public.aura_comms_dispatch
        where tenant_id = $1 and subject_id = $2
        order by created_at desc limit 1`,
      [tenantId, subjectId],
    );
    const row = rows[0];
    return row ? {
      id: row.id,
      subjectType: row.subject_type as DispatchRecord['subjectType'],
      subjectId: row.subject_id,
      accountId: row.account_id,
      scheduledAt: iso(row.scheduled_at),
      scheduledTimezone: row.scheduled_timezone,
      state: row.state as DispatchRecord['state'],
      attempts: Number(row.attempts ?? 0),
      lastError: row.last_error ?? null,
    } : null;
  }

  async listTenantsWithMailbox(): Promise<string[]> {
    // aura_users sits outside tenant RLS (migration 0163) because authentication happens before a
    // tenant context exists. Reading it here is what lets the worker enumerate tenants WITHOUT the
    // dispatch table having to leave RLS — the worker then binds each tenant and claims inside it.
    const { rows } = await this.pool.query<{ tenant_id: string }>(
      `select distinct tenant_id from public.aura_users where active`,
    );
    return rows.map((row) => row.tenant_id);
  }

  async claimDueDispatch(tenantId: string, now: string, limit: number): Promise<DispatchRecord[]> {
    // One statement claims the work: the sub-select takes the rows with FOR UPDATE SKIP LOCKED, so
    // a second worker walks past them instead of blocking, and the UPDATE flips them out of
    // 'pending' before anyone else can read them. That atomic hand-off IS the duplicate-send guard.
    const { rows } = await this.pool.query<{
      id: string; subject_type: string; subject_id: string; account_id: string | null;
      scheduled_at: Date | string; scheduled_timezone: string; state: string; attempts: number; last_error: string | null;
    }>(
      `update public.aura_comms_dispatch d
          set state = 'processing', claimed_at = now()
        where d.id in (
          select id from public.aura_comms_dispatch
           where tenant_id = $1 and state = 'pending' and scheduled_at <= $2
           order by scheduled_at
           limit $3
           for update skip locked
        )
      returning d.id, d.subject_type, d.subject_id, d.account_id, d.scheduled_at,
                d.scheduled_timezone, d.state, d.attempts, d.last_error`,
      [tenantId, now, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      subjectType: row.subject_type as DispatchRecord['subjectType'],
      subjectId: row.subject_id,
      accountId: row.account_id,
      scheduledAt: iso(row.scheduled_at),
      scheduledTimezone: row.scheduled_timezone,
      state: row.state as DispatchRecord['state'],
      attempts: Number(row.attempts ?? 0),
      lastError: row.last_error,
    }));
  }

  async completeDispatch(tenantId: string, dispatchId: string, at: string): Promise<void> {
    await this.pool.query(
      `update public.aura_comms_dispatch set state = 'done', processed_at = $3
        where tenant_id = $1 and id = $2`,
      [tenantId, dispatchId, at],
    );
  }

  async failDispatch(tenantId: string, dispatchId: string, error: string, retryAt: string | null): Promise<void> {
    // Back to 'pending' with a later schedule when there is another attempt to make; dead-lettered
    // with the error when there is not. Same shape the outbox relay uses, so a stuck message is
    // diagnosed the same way everywhere.
    await this.pool.query(
      `update public.aura_comms_dispatch
          set attempts = attempts + 1,
              last_error = $3,
              state = case when $4::timestamptz is null then 'failed' else 'pending' end,
              scheduled_at = coalesce($4::timestamptz, scheduled_at),
              processed_at = case when $4::timestamptz is null then now() else null end
        where tenant_id = $1 and id = $2`,
      [tenantId, dispatchId, error, retryAt],
    );
  }

  async cancelDispatch(tenantId: string, subjectId: string, at: string): Promise<void> {
    // Only a dispatch that has not started may be withdrawn. One already processing is the
    // worker's, and cancelling it here would leave the message half-sent with no record of it.
    await this.pool.query(
      `update public.aura_comms_dispatch set state = 'cancelled', cancelled_at = $3
        where tenant_id = $1 and subject_id = $2 and state in ('pending','claimed')`,
      [tenantId, subjectId, at],
    );
  }
}
