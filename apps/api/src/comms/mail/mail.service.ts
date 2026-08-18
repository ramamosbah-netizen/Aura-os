import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { newId } from '@aura/shared';
import {
  assertSendable,
  buildEnvelope,
  forwardSubject,
  makeDraft,
  replyRecipients,
  replySubject,
  snippetOf,
  threadLinkageForReply,
  type ComposeInput,
  type MailParticipant,
  type MailRecord,
} from './mail-domain';
import { MAIL_STORE, type DispatchRecord, type MailFilter, type MailStore } from './mail-store';

/** Who is asking, resolved from the authenticated request — never from a DTO. */
export interface MailCaller {
  tenantId: string;
  companyId: string | null;
  userId: string;
  address: string | null;
}

export interface ScheduleInput {
  /** Local wall-clock the user picked, e.g. "2026-08-20T08:00". */
  localDateTime: string;
  /** IANA zone the user picked it in, e.g. "Asia/Dubai". */
  timezone: string;
}

/**
 * Convert a wall-clock + IANA zone to a UTC instant.
 *
 * Done by asking Intl what that zone's offset is at that moment rather than by adding a fixed
 * number of hours: a fixed offset is wrong twice a year in any zone with daylight saving, and
 * "send at 08:00" arriving at 07:00 or 09:00 is exactly the failure the user asked us to avoid.
 */
export function toUtcInstant(localDateTime: string, timezone: string): string {
  const naive = new Date(`${localDateTime.replace(' ', 'T')}Z`);
  if (Number.isNaN(naive.getTime())) throw new BadRequestException(`Invalid date/time: ${localDateTime}`);
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    throw new BadRequestException(`Unknown timezone: ${timezone}`);
  }
  // What that UTC instant reads as in the target zone; the difference is the offset to remove.
  const parts = Object.fromEntries(formatter.formatToParts(naive).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const asZoned = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return new Date(naive.getTime() - (asZoned - naive.getTime())).toISOString();
}

/**
 * The mail engine.
 *
 * Lifecycle authority is split on purpose:
 *   a USER may move a message to draft, scheduled, queued or cancelled;
 *   the DISPATCH WORKER moves queued → sending → sent | failed;
 *   IMPORT is the only thing that produces received.
 *
 * Nothing here talks to a provider. Delivery goes through the adapter contract, which is why
 * adding Gmail later touches no file in this directory.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  constructor(@Inject(MAIL_STORE) private readonly store: MailStore) {}

  private async owned(caller: MailCaller, mailId: string): Promise<MailRecord> {
    const mail = await this.store.get(caller.tenantId, mailId);
    // 404 rather than 403, like every other Communication read: distinguishing them would confirm
    // that a message exists between two people the caller is not part of.
    if (!mail) throw new NotFoundException(`mail ${mailId} not found`);
    const onEnvelope = mail.participants.some((p) =>
      (p.userId && p.userId === caller.userId)
      || (caller.address && p.address && p.address.toLowerCase() === caller.address.toLowerCase()));
    if (!onEnvelope && mail.fromUser !== caller.userId) throw new NotFoundException(`mail ${mailId} not found`);
    return mail;
  }

  async createDraft(caller: MailCaller, input: Omit<ComposeInput, 'tenantId' | 'fromUser'>): Promise<MailRecord> {
    const draft = makeDraft({
      ...input,
      tenantId: caller.tenantId,
      companyId: caller.companyId,
      fromUser: caller.userId,
      fromAddress: input.fromAddress ?? caller.address,
    });
    await this.store.save(caller.tenantId, draft);
    return draft;
  }

  async updateDraft(caller: MailCaller, mailId: string, patch: Partial<ComposeInput>): Promise<MailRecord> {
    const mail = await this.owned(caller, mailId);
    if (mail.state !== 'draft') throw new BadRequestException(`A ${mail.state} message cannot be edited`);
    const next: MailRecord = {
      ...mail,
      subject: patch.subject !== undefined ? patch.subject.trim() : mail.subject,
      body: patch.body !== undefined ? patch.body.trim() : mail.body,
      bodyHtml: patch.bodyHtml !== undefined ? patch.bodyHtml : mail.bodyHtml,
      participants: patch.to !== undefined || patch.cc !== undefined || patch.bcc !== undefined
        ? buildEnvelope({
          tenantId: caller.tenantId,
          fromUser: mail.fromUser,
          fromAddress: mail.participants.find((p) => p.role === 'from')?.address ?? caller.address,
          to: patch.to ?? mail.participants.filter((p) => p.role === 'to'),
          cc: patch.cc ?? mail.participants.filter((p) => p.role === 'cc'),
          bcc: patch.bcc ?? mail.participants.filter((p) => p.role === 'bcc'),
        })
        : mail.participants,
      updatedAt: new Date().toISOString(),
    };
    next.snippet = snippetOf(next.body);
    await this.store.save(caller.tenantId, next);
    return next;
  }

  async deleteDraft(caller: MailCaller, mailId: string): Promise<void> {
    const mail = await this.owned(caller, mailId);
    // Only something that never left may be deleted. A sent message is a record of what happened.
    if (mail.state !== 'draft' && mail.state !== 'cancelled') {
      throw new BadRequestException(`A ${mail.state} message cannot be deleted`);
    }
    await this.store.remove(caller.tenantId, mailId);
  }

  /** Hand a message to delivery. The user asks for `queued`; the worker owns everything after. */
  async queueForSend(caller: MailCaller, mailId: string): Promise<MailRecord> {
    const mail = await this.owned(caller, mailId);
    const sendable = assertSendable(mail);
    if (!sendable.ok) throw new BadRequestException(sendable.error);
    const next: MailRecord = { ...mail, state: 'queued', updatedAt: new Date().toISOString() };
    await this.store.save(caller.tenantId, next);
    await this.store.upsertDispatch(caller.tenantId, {
      id: newId(), subjectType: 'mail', subjectId: mail.id, accountId: mail.accountId,
      scheduledAt: new Date().toISOString(), scheduledTimezone: 'UTC', state: 'pending', attempts: 0,
    });
    return next;
  }

  async schedule(caller: MailCaller, mailId: string, when: ScheduleInput): Promise<MailRecord> {
    const mail = await this.owned(caller, mailId);
    const sendable = assertSendable(mail);
    if (!sendable.ok) throw new BadRequestException(sendable.error);
    const scheduledAt = toUtcInstant(when.localDateTime, when.timezone);

    const next: MailRecord = { ...mail, state: 'scheduled', updatedAt: new Date().toISOString() };
    await this.store.save(caller.tenantId, next);
    const existing = await this.store.getDispatch(caller.tenantId, mail.id);
    await this.store.upsertDispatch(caller.tenantId, {
      id: existing?.id ?? newId(),
      subjectType: 'mail',
      subjectId: mail.id,
      accountId: mail.accountId,
      scheduledAt,
      // The user's chosen zone is kept beside the instant: "08:00 Asia/Dubai" is the intent, and a
      // UTC stamp alone cannot be shown back to them or audited as what they asked for.
      scheduledTimezone: when.timezone,
      state: 'pending',
      attempts: 0,
    });
    return next;
  }

  /** Rescheduling is scheduling again — same guard, same row, new instant. */
  async reschedule(caller: MailCaller, mailId: string, when: ScheduleInput): Promise<MailRecord> {
    const mail = await this.owned(caller, mailId);
    if (mail.state !== 'scheduled') throw new BadRequestException(`A ${mail.state} message is not scheduled`);
    return this.schedule(caller, mailId, when);
  }

  async cancel(caller: MailCaller, mailId: string): Promise<MailRecord> {
    const mail = await this.owned(caller, mailId);
    if (mail.state !== 'scheduled' && mail.state !== 'queued') {
      throw new BadRequestException(`A ${mail.state} message cannot be cancelled`);
    }
    const at = new Date().toISOString();
    await this.store.cancelDispatch(caller.tenantId, mailId, at);
    const next: MailRecord = { ...mail, state: 'cancelled', updatedAt: at };
    await this.store.save(caller.tenantId, next);
    return next;
  }

  private async composeFrom(
    caller: MailCaller,
    source: MailRecord,
    recipients: { to: MailParticipant[]; cc: MailParticipant[] },
    subject: string,
    body: string,
  ): Promise<MailRecord> {
    const draft = makeDraft({
      tenantId: caller.tenantId,
      companyId: caller.companyId,
      accountId: source.accountId,
      fromUser: caller.userId,
      fromAddress: caller.address,
      to: recipients.to,
      cc: recipients.cc,
      subject,
      body,
    });
    await this.store.save(caller.tenantId, draft);
    return draft;
  }

  async reply(caller: MailCaller, mailId: string, body = '', all = false): Promise<MailRecord> {
    const source = await this.owned(caller, mailId);
    const recipients = replyRecipients(source, { address: caller.address, userId: caller.userId }, all);
    if (recipients.to.length === 0 && recipients.cc.length === 0) {
      throw new BadRequestException('There is nobody to reply to on this message');
    }
    const draft = await this.composeFrom(caller, source, recipients, replySubject(source.subject), body);
    const linkage = threadLinkageForReply(source);
    const threaded: MailRecord = { ...draft, ...linkage };
    await this.store.save(caller.tenantId, threaded);
    return threaded;
  }

  async replyAll(caller: MailCaller, mailId: string, body = ''): Promise<MailRecord> {
    return this.reply(caller, mailId, body, true);
  }

  /**
   * Forward keeps provenance: the copy records which message it came from, so "where did this
   * come from" is answerable later without parsing a quoted body.
   */
  async forward(caller: MailCaller, mailId: string, to: MailParticipant[] | string[], body = ''): Promise<MailRecord> {
    const source = await this.owned(caller, mailId);
    const draft = await this.composeFrom(caller, source, { to: [], cc: [] }, forwardSubject(source.subject), body || source.body);
    const forwarded: MailRecord = {
      ...draft,
      participants: buildEnvelope({
        tenantId: caller.tenantId, fromUser: caller.userId, fromAddress: caller.address, to,
      }),
      forwardedFromMailId: source.id,
      // A forward starts its own conversation; it is not a reply in the original thread.
      threadId: draft.id,
      parentMailId: null,
    };
    await this.store.save(caller.tenantId, forwarded);
    return forwarded;
  }

  /**
   * Import a message a provider gave us.
   *
   * Idempotent by provider identity: a sync that replays — which is normal, not exceptional —
   * must find the message AURA already holds rather than creating a second copy. Without this,
   * every future Gmail or Microsoft 365 poll would multiply the inbox.
   */
  async importInbound(tenantId: string, incoming: Omit<MailRecord, 'state' | 'direction'> & { state?: never }): Promise<{ mail: MailRecord; imported: boolean }> {
    if (!incoming.providerMessageId) {
      throw new BadRequestException('An imported message must carry a provider message id');
    }
    const existing = await this.store.findByProviderMessage(tenantId, incoming.accountId, incoming.providerMessageId);
    if (existing) return { mail: existing, imported: false };

    const mail: MailRecord = {
      ...incoming,
      direction: 'inbound',
      // `received` is reachable only from here — never from a user request.
      state: 'received',
      sentAt: incoming.sentAt ?? new Date().toISOString(),
    };
    await this.store.save(tenantId, mail);
    return { mail, imported: true };
  }

  /**
   * One folder of the mailbox, with an optional text search.
   *
   * `needs-review` is a first-class folder rather than a filter on failures: a message whose
   * delivery outcome is UNKNOWN must not be listed among the ones that definitely failed, or the
   * user is told something the system does not know.
   */
  async folder(
    caller: MailCaller,
    folder: 'inbox' | 'sent' | 'drafts' | 'scheduled' | 'needs-review',
    query: string | null = null,
  ): Promise<MailRecord[]> {
    // needs-review and sent both read the caller's outgoing mail; they differ only in which
    // states they keep, so the store sees one folder and the filter does the rest.
    const storeFolder = folder === 'needs-review' ? 'sent' : folder;
    const base = await this.store.list(caller.tenantId, {
      userId: caller.userId, address: caller.address, folder: storeFolder, limit: 200,
    });

    const scoped = folder === 'needs-review'
      ? base.filter((mail) => mail.state === 'needs_review' || mail.state === 'failed')
      : folder === 'sent'
        // Sent holds everything that has LEFT the composer, including mail still queued or in
        // flight. Restricting it to `sent` made a message disappear between the user pressing send
        // and the dispatch worker running — the one moment they most need to see it. Each row
        // carries its own state, so "Queued to send" is shown as exactly that, never as Sent.
        ? base.filter((mail) => ['sent', 'queued', 'sending'].includes(mail.state))
        : base;

    const needle = (query ?? '').trim().toLowerCase();
    if (!needle) return scoped;
    return scoped.filter((mail) =>
      mail.subject.toLowerCase().includes(needle)
      || mail.body.toLowerCase().includes(needle)
      || mail.participants.some((p) => (p.address ?? p.userId ?? '').toLowerCase().includes(needle)));
  }

  async list(caller: MailCaller, filter: Omit<MailFilter, 'address' | 'userId'>): Promise<MailRecord[]> {
    return this.store.list(caller.tenantId, { ...filter, address: caller.address, userId: caller.userId });
  }

  async thread(caller: MailCaller, mailId: string): Promise<MailRecord[]> {
    const mail = await this.owned(caller, mailId);
    return this.store.thread(caller.tenantId, mail.threadId);
  }

  async markRead(caller: MailCaller, mailId: string): Promise<void> {
    await this.owned(caller, mailId);
    await this.store.markRead(caller.tenantId, mailId, { address: caller.address, userId: caller.userId }, new Date().toISOString());
  }
}
