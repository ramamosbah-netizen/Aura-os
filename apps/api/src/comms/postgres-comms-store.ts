import type { Pool } from 'pg';
import type { ChatAttachment, ChatChannel, ChatMessage, ChatMessageKind, MailMessage } from '@aura/shared';
import type { CommsStore, StoredChannel, TimelineEntry } from './comms-store';

interface ChannelRow { id: string; kind: string; name: string; company_id: string | null; members: string[] | null }
interface MessageRow {
  id: string; channel_id: string; sender: string; kind: string; body: string; sent_at: Date | string;
  att_name: string | null; att_mime: string | null; att_size: string | number | null; att_data_url: string | null;
}
interface MailRow {
  id: string; from_user: string; subject: string; body: string; sent_at: Date | string;
  recipients: string[] | null; read_by: string[] | null;
}

const iso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

/**
 * Postgres persistence for chat + internal mail (migration 0234).
 *
 * Every statement filters on tenant_id even though the tables are FORCE-RLS. The policy is the
 * backstop; an explicit predicate is what makes a scoping mistake a visible bug in review rather
 * than something that only fails when RLS happens to be engaged.
 */
export class PostgresCommsStore implements CommsStore {
  constructor(private readonly pool: Pool) {}

  async listChannels(tenantId: string): Promise<StoredChannel[]> {
    const { rows } = await this.pool.query<ChannelRow>(
      `select c.id, c.kind, c.name, c.company_id,
              coalesce(array_agg(m.username order by m.username) filter (where m.username is not null), '{}') as members
         from public.aura_comms_channels c
         left join public.aura_comms_channel_members m
           on m.channel_id = c.id and m.tenant_id = c.tenant_id
        where c.tenant_id = $1
        group by c.id, c.kind, c.name, c.company_id
        order by c.name`,
      [tenantId],
    );
    return rows.map((r) => ({ id: r.id, kind: r.kind as ChatChannel['kind'], name: r.name, companyId: r.company_id, members: r.members ?? [] }));
  }

  async ensureChannels(tenantId: string, channels: ChatChannel[], createdBy: string, companyId: string | null = null): Promise<void> {
    for (const channel of channels) {
      await this.pool.query(
        `insert into public.aura_comms_channels (id, tenant_id, company_id, kind, name, created_by)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do nothing`,
        [channel.id, tenantId, companyId, channel.kind, channel.name, createdBy],
      );
      for (const username of channel.members) {
        await this.pool.query(
          `insert into public.aura_comms_channel_members (tenant_id, channel_id, username)
           values ($1, $2, $3)
           on conflict (tenant_id, channel_id, username) do nothing`,
          [tenantId, channel.id, username],
        );
      }
    }
  }

  async getChannel(tenantId: string, channelId: string): Promise<StoredChannel | null> {
    const channels = await this.listChannels(tenantId);
    return channels.find((c) => c.id === channelId) ?? null;
  }

  async listMessages(tenantId: string, channelId: string): Promise<ChatMessage[]> {
    const { rows } = await this.pool.query<MessageRow>(
      `select m.id, m.channel_id, m.sender, m.kind, m.body, m.sent_at,
              a.name as att_name, a.mime as att_mime, a.size_bytes as att_size, a.data_url as att_data_url
         from public.aura_comms_messages m
         left join public.aura_comms_attachments a on a.message_id = m.id and a.tenant_id = m.tenant_id
        where m.tenant_id = $1 and m.channel_id = $2
        order by m.sent_at`,
      [tenantId, channelId],
    );
    return rows.map((r) => ({
      id: r.id,
      channelId: r.channel_id,
      sender: r.sender,
      kind: r.kind as ChatMessageKind,
      text: r.body,
      attachment: r.att_name
        ? ({ name: r.att_name, mime: r.att_mime ?? 'application/octet-stream', size: Number(r.att_size ?? 0), dataUrl: r.att_data_url ?? '' } satisfies ChatAttachment)
        : null,
      sentAt: iso(r.sent_at),
    }));
  }

  async addMessage(tenantId: string, companyId: string | null, message: ChatMessage): Promise<void> {
    await this.pool.query(
      `insert into public.aura_comms_messages (id, tenant_id, company_id, channel_id, sender, kind, body, sent_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [message.id, tenantId, companyId, message.channelId, message.sender, message.kind, message.text, message.sentAt],
    );
    if (message.attachment) {
      await this.pool.query(
        `insert into public.aura_comms_attachments (id, tenant_id, message_id, name, mime, size_bytes, data_url)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
        [tenantId, message.id, message.attachment.name, message.attachment.mime, message.attachment.size, message.attachment.dataUrl],
      );
    }
  }

  async getLastRead(tenantId: string, channelId: string, username: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ last_read_at: Date | string }>(
      `select last_read_at from public.aura_comms_message_reads
        where tenant_id = $1 and channel_id = $2 and username = $3`,
      [tenantId, channelId, username],
    );
    return rows[0] ? iso(rows[0].last_read_at) : null;
  }

  async setLastRead(tenantId: string, channelId: string, username: string, at: string): Promise<void> {
    await this.pool.query(
      `insert into public.aura_comms_message_reads (tenant_id, channel_id, username, last_read_at)
       values ($1, $2, $3, $4)
       on conflict (tenant_id, channel_id, username) do update set last_read_at = excluded.last_read_at`,
      [tenantId, channelId, username, at],
    );
  }

  /** Sender or recipient — the only two ways a mail is yours. */
  async listMailFor(tenantId: string, username: string): Promise<MailMessage[]> {
    const { rows } = await this.pool.query<MailRow>(
      `select m.id, m.from_user, m.subject, m.body, m.sent_at,
              coalesce(array_agg(r.username order by r.username) filter (where r.username is not null), '{}') as recipients,
              coalesce(array_agg(r.username order by r.username) filter (where r.read_at is not null), '{}') as read_by
         from public.aura_comms_mail m
         left join public.aura_comms_mail_recipients r on r.mail_id = m.id and r.tenant_id = m.tenant_id
        where m.tenant_id = $1
          and (m.from_user = $2 or exists (
                select 1 from public.aura_comms_mail_recipients x
                 where x.tenant_id = m.tenant_id and x.mail_id = m.id and x.username = $2))
        group by m.id, m.from_user, m.subject, m.body, m.sent_at
        order by m.sent_at desc`,
      [tenantId, username],
    );
    return rows.map(this.toMail);
  }

  async getMail(tenantId: string, mailId: string): Promise<MailMessage | null> {
    const { rows } = await this.pool.query<MailRow>(
      `select m.id, m.from_user, m.subject, m.body, m.sent_at,
              coalesce(array_agg(r.username order by r.username) filter (where r.username is not null), '{}') as recipients,
              coalesce(array_agg(r.username order by r.username) filter (where r.read_at is not null), '{}') as read_by
         from public.aura_comms_mail m
         left join public.aura_comms_mail_recipients r on r.mail_id = m.id and r.tenant_id = m.tenant_id
        where m.tenant_id = $1 and m.id = $2
        group by m.id, m.from_user, m.subject, m.body, m.sent_at`,
      [tenantId, mailId],
    );
    return rows[0] ? this.toMail(rows[0]) : null;
  }

  private toMail(r: MailRow): MailMessage {
    // The sender's own copy is read by construction, which is what the shared model's readBy means.
    const readBy = [r.from_user, ...(r.read_by ?? [])];
    return {
      id: r.id,
      from: r.from_user,
      to: r.recipients ?? [],
      subject: r.subject,
      body: r.body,
      sentAt: iso(r.sent_at),
      readBy: [...new Set(readBy)],
    };
  }

  async addMail(
    tenantId: string,
    companyId: string | null,
    mail: MailMessage,
    thread: { threadId: string; parentMailId: string | null; forwardedFromMailId: string | null },
  ): Promise<void> {
    await this.pool.query(
      `insert into public.aura_comms_mail
         (id, tenant_id, company_id, from_user, subject, body, sent_at, thread_id, parent_mail_id, forwarded_from_mail_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [mail.id, tenantId, companyId, mail.from, mail.subject, mail.body, mail.sentAt,
        thread.threadId, thread.parentMailId, thread.forwardedFromMailId],
    );
    for (const username of mail.to) {
      await this.pool.query(
        `insert into public.aura_comms_mail_recipients (tenant_id, mail_id, username, kind)
         values ($1, $2, $3, 'to')
         on conflict (tenant_id, mail_id, username) do nothing`,
        [tenantId, mail.id, username],
      );
    }
  }

  async publishTimeline(tenantId: string, entry: TimelineEntry): Promise<void> {
    // ON CONFLICT on (tenant, subject) — a replayed sync re-publishes the same activity, and the
    // timeline must show it once. The derived labels are refreshed so a corrected record is not
    // left with a stale preview.
    await this.pool.query(
      `insert into public.aura_comms_timeline
         (id, tenant_id, company_id, occurred_at, channel, direction, actor,
          subject_type, subject_id, title, preview, visibility, visibility_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (tenant_id, subject_type, subject_id) do update
         set occurred_at = excluded.occurred_at,
             title       = excluded.title,
             preview     = excluded.preview,
             visibility  = excluded.visibility,
             visibility_key = excluded.visibility_key`,
      [entry.id, tenantId, entry.companyId, entry.occurredAt, entry.channel, entry.direction, entry.actor,
        entry.subjectType, entry.subjectId, entry.title, entry.preview, entry.visibility, entry.visibilityKey],
    );
  }

  async markMailRead(tenantId: string, mailId: string, username: string, at: string): Promise<void> {
    // Scoped to the recipient row: a non-recipient marking someone else's mail read updates nothing.
    await this.pool.query(
      `update public.aura_comms_mail_recipients set read_at = $4
        where tenant_id = $1 and mail_id = $2 and username = $3 and read_at is null`,
      [tenantId, mailId, username, at],
    );
  }
}
