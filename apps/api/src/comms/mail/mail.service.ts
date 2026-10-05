import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { newId, type DocumentActor, type DocumentVersion } from '@aura/shared';
import { AccessService, DmsService, UsersService } from '@aura/core';
import {
  INTERNAL_ACCOUNT_ID,
  isAccountIdShape,
  assertSendable,
  buildEnvelope,
  forwardSubject,
  makeDraft,
  replyRecipients,
  replySubject,
  snippetOf,
  threadLinkageForReply,
  type ComposeInput,
  type MailAttachment,
  type MailParticipant,
  type MailRecord,
} from './mail-domain';
import { MAIL_STORE, type DispatchRecord, type MailFilter, type MailStore } from './mail-store';
import { MAIL_RECORD_DIRECTORY, RECORD_READ_PERMISSION, type MailRecordDirectory } from './mail-record-directory';
import { isMailRecordType, type MailRecordRef } from './mail-domain';

/** Who is asking, resolved from the authenticated request — never from a DTO. */
export interface MailCaller {
  tenantId: string;
  companyId: string | null;
  userId: string;
  address: string | null;
}

/** Who on a message's envelope could not open one attachment, and why (F-09). */
export interface AttachmentAccess {
  attachmentId: string;
  documentId: string;
  name: string;
  version: number;
  cannotOpen: Array<{ userId: string | null; address: string | null; why: 'no-access' | 'outside-aura' }>;
  /** Whether the DMS lets the sender give access themselves (SHARE and DOWNLOAD both held). */
  senderMayShare: boolean;
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

  constructor(
    @Inject(MAIL_STORE) private readonly store: MailStore,
    // The document store and the user directory are what a governed attachment needs (F-09).
    // Optional so the mail engine still composes without them; attaching then says so plainly.
    // Explicit @Inject on each: an @Optional() parameter typed as a union is silently null.
    @Optional() @Inject(DmsService) private readonly dms: DmsService | null = null,
    @Optional() @Inject(UsersService) private readonly users: UsersService | null = null,
    /**
     * Which business records exist and what they are called (MAIL-03…07), and who may read them.
     * Optional so the mail engine composes without them; linking then refuses rather than linking a
     * record nobody checked. Explicit @Inject: an @Optional() union-typed parameter is silently null.
     */
    @Optional() @Inject(MAIL_RECORD_DIRECTORY) private readonly directory: MailRecordDirectory | null = null,
    @Optional() @Inject(AccessService) private readonly access: AccessService | null = null,
  ) {}

  // ── What a message is about (MAIL-03…MAIL-07) ─────────────────────────────────────────────

  /**
   * A record this caller may name: a known kind, existing in this tenant, and readable by them. A
   * record they may not read is refused as not found — linking must not be a way to learn it exists.
   */
  private async checkRecord(caller: MailCaller, ref: Partial<MailRecordRef>): Promise<{ ref: MailRecordRef; label: string }> {
    if (!isMailRecordType(ref.recordType)) throw new BadRequestException(`a message cannot be linked to a "${String(ref.recordType)}"`);
    const recordId = String(ref.recordId ?? '').trim();
    if (!recordId) throw new BadRequestException('a link requires the record it points to');
    if (!this.directory || !this.access) throw new ConflictException('linking messages to records is unavailable in this composition');
    const permission = RECORD_READ_PERMISSION[ref.recordType];
    const decision = this.access.can(caller.userId, {
      permission,
      orgPath: [{ level: 'tenant', id: caller.tenantId }],
      ...(ref.recordType === 'projects.project' ? { resource: { type: 'project', id: recordId } } : {}),
    });
    const label = decision.allowed ? await this.directory.labelOf(caller.tenantId, ref.recordType, recordId) : null;
    if (label === null) throw new NotFoundException(`${ref.recordType} ${recordId} not found`);
    return { ref: { recordType: ref.recordType, recordId }, label };
  }

  private async writeLink(caller: MailCaller, mailId: string, checked: { ref: MailRecordRef; label: string }): Promise<void> {
    await this.store.addLink(caller.tenantId, mailId, {
      id: newId(), ...checked.ref, recordLabel: checked.label, linkedBy: caller.userId, linkedAt: new Date().toISOString(),
    });
  }

  /** Link a message the caller can see to a record they can read. Linking twice is a no-op. */
  async linkRecord(caller: MailCaller, mailId: string, ref: Partial<MailRecordRef>): Promise<MailRecord> {
    const mail = await this.owned(caller, mailId);
    await this.writeLink(caller, mail.id, await this.checkRecord(caller, ref));
    return (await this.store.get(caller.tenantId, mail.id)) ?? mail;
  }

  /**
   * A record's correspondence: the linked messages THIS caller could already read — their own drafts,
   * and sent or received messages they are on — newest first. Linking widens nothing.
   */
  async related(caller: MailCaller, ref: Partial<MailRecordRef>): Promise<MailRecord[]> {
    const { ref: checked } = await this.checkRecord(caller, ref);
    const linked = await this.store.listByRecord(caller.tenantId, checked.recordType, checked.recordId);
    return linked.filter((mail) => this.visible(caller, mail));
  }

  /**
   * May this caller see this message at all?
   *
   * The envelope decides once a message has LEFT. Until then — a draft, a scheduled message, one
   * cancelled before it went — it is its author's alone: a recipient named on a half-written draft
   * has not been sent anything, and must not be able to read, edit, send or delete it.
   */
  private visible(caller: MailCaller, mail: MailRecord): boolean {
    if (mail.fromUser === caller.userId) return true;
    if (mail.state === 'draft' || mail.state === 'scheduled' || mail.state === 'cancelled') return false;
    return mail.participants.some((p) =>
      (p.userId && p.userId === caller.userId)
      || (caller.address && p.address && p.address.toLowerCase() === caller.address.toLowerCase()));
  }

  private async owned(caller: MailCaller, mailId: string): Promise<MailRecord> {
    const mail = await this.store.get(caller.tenantId, mailId);
    // 404 rather than 403, like every other Communication read: distinguishing them would confirm
    // that a message exists between two people the caller is not part of.
    if (!mail || !this.visible(caller, mail)) throw new NotFoundException(`mail ${mailId} not found`);
    return mail;
  }

  /** The caller's own message — the only kind anyone may edit, send, schedule or cancel. */
  private async authored(caller: MailCaller, mailId: string): Promise<MailRecord> {
    const mail = await this.owned(caller, mailId);
    if (mail.fromUser !== caller.userId) throw new NotFoundException(`mail ${mailId} not found`);
    return mail;
  }

  // ── Governed attachments (F-09) ────────────────────────────────────────────────────────────

  private requireDms(): DmsService {
    if (!this.dms) throw new BadRequestException('Document attachments require the document store, which is not configured');
    return this.dms;
  }

  /**
   * An AURA user as the DMS sees them when THEY ask — the same shape DocumentsController builds from
   * a session: their id, tenant and company. Sessions carry no teams or roles, so neither is invented
   * here; a share to a team or role is honoured nowhere yet, and this must not be the first place.
   */
  private documentActor(caller: MailCaller, userId: string): DocumentActor {
    const registered = this.users?.get(caller.tenantId, userId) ?? null;
    return {
      userId,
      tenantId: caller.tenantId,
      companyId: userId === caller.userId ? caller.companyId : (registered?.companyId ?? caller.companyId),
      teamIds: [],
      roleIds: [],
    };
  }

  /**
   * Attach a DMS document to the caller's own draft, at its CURRENT revision.
   *
   * The sender must be able to DOWNLOAD it: attaching hands the bytes on, and seeing a title is not
   * holding the file. A document the sender cannot see at all answers 404, like every other DMS
   * read, so attaching cannot be used to probe for documents.
   */
  async attachDocument(caller: MailCaller, mailId: string, documentId: string): Promise<MailRecord> {
    const mail = await this.authored(caller, mailId);
    if (mail.state !== 'draft') throw new BadRequestException(`A ${mail.state} message cannot take attachments`);
    const dms = this.requireDms();
    const actor = this.documentActor(caller, caller.userId);
    const decision = await dms.access(documentId, actor);
    if (!decision.permissions.includes('VIEW')) throw new NotFoundException(`document ${documentId} not found`);
    const found = await dms.getFor(documentId, actor);
    if (!decision.permissions.includes('DOWNLOAD')) {
      throw new ForbiddenException(`You may view "${found.document.title}" but not download it, so you cannot send it`);
    }
    const current: DocumentVersion | undefined = found.versions.find((v) => v.version === found.document.currentVersion);
    if (!current) throw new BadRequestException(`"${found.document.title}" has no current revision to attach`);
    const attachment: MailAttachment = {
      id: newId(),
      documentId,
      version: current.version,
      name: current.fileName,
      mime: current.contentType,
      sizeBytes: current.sizeBytes,
      createdAt: new Date().toISOString(),
    };
    const added = await this.store.addAttachment(caller.tenantId, mailId, attachment);
    if (!added) throw new ConflictException(`"${current.fileName}" is already attached to this message`);
    return (await this.store.get(caller.tenantId, mailId))!;
  }

  async detachDocument(caller: MailCaller, mailId: string, attachmentId: string): Promise<MailRecord> {
    const mail = await this.authored(caller, mailId);
    if (mail.state !== 'draft') throw new BadRequestException(`A ${mail.state} message's attachments cannot be changed`);
    const removed = await this.store.removeAttachment(caller.tenantId, mailId, attachmentId);
    if (!removed) throw new NotFoundException(`attachment ${attachmentId} not found`);
    return (await this.store.get(caller.tenantId, mailId))!;
  }

  /**
   * Who on the envelope could NOT open each attachment, and whether the sender may change that.
   *
   * Mail never grants access. A recipient opens an attachment with their OWN document access, so a
   * message whose recipient could not open what it carries is a message that does not work — the
   * sender is told who, and, when the DMS lets them share the document, can give that person
   * access as an explicit act of their own before sending.
   */
  async attachmentAccess(caller: MailCaller, mailId: string): Promise<AttachmentAccess[]> {
    const mail = await this.authored(caller, mailId);
    return this.accessFor(caller, mail);
  }

  private async accessFor(caller: MailCaller, mail: MailRecord): Promise<AttachmentAccess[]> {
    const attachments = mail.attachments ?? [];
    if (attachments.length === 0) return [];
    const dms = this.requireDms();
    const recipients = mail.participants.filter((p) => p.role !== 'from');
    const sender = this.documentActor(caller, caller.userId);
    const out: AttachmentAccess[] = [];
    for (const attachment of attachments) {
      const own = await dms.access(attachment.documentId, sender);
      const cannotOpen: AttachmentAccess['cannotOpen'] = [];
      for (const recipient of recipients) {
        if (!recipient.userId) {
          cannotOpen.push({ userId: null, address: recipient.address, why: 'outside-aura' });
          continue;
        }
        if (recipient.userId === caller.userId) continue;
        const theirs = await dms.access(attachment.documentId, this.documentActor(caller, recipient.userId));
        if (!theirs.permissions.includes('DOWNLOAD')) {
          cannotOpen.push({ userId: recipient.userId, address: recipient.address, why: 'no-access' });
        }
      }
      out.push({
        attachmentId: attachment.id,
        documentId: attachment.documentId,
        name: attachment.name,
        version: attachment.version,
        cannotOpen,
        // Passing DOWNLOAD on needs SHARE and DOWNLOAD both (the DMS's own delegation rule).
        senderMayShare: own.permissions.includes('SHARE') && own.permissions.includes('DOWNLOAD'),
      });
    }
    return out;
  }

  /** Refuse to send while anyone on the envelope could not open what the message carries. */
  private async assertAttachmentsOpenable(caller: MailCaller, mail: MailRecord): Promise<void> {
    const blocked = (await this.accessFor(caller, mail)).filter((a) => a.cannotOpen.length > 0);
    if (blocked.length === 0) return;
    const reasons = blocked.flatMap((a) => a.cannotOpen.map((who) => who.why === 'outside-aura'
      ? `${who.address} is outside AURA and cannot receive "${a.name}"`
      : `${who.userId} cannot open "${a.name}"`));
    throw new ConflictException(`This message can only be sent when every recipient can open its attachments — ${reasons.join('; ')}`);
  }

  /**
   * The bytes of one attachment, for someone the message reached.
   *
   * Two gates, both required: the reader must be on the envelope (anyone else gets the same 404 as
   * for the message), and the DMS must let THEM download the document now. A share revoked after
   * the message was sent closes the attachment too — being sent a document is not owning it.
   */
  async downloadAttachment(caller: MailCaller, mailId: string, attachmentId: string): Promise<{ bytes: Buffer; version: DocumentVersion }> {
    const mail = await this.owned(caller, mailId);
    const attachment = (mail.attachments ?? []).find((a) => a.id === attachmentId);
    if (!attachment) throw new NotFoundException(`attachment ${attachmentId} not found`);
    return this.requireDms().downloadVersion(attachment.documentId, attachment.version, this.documentActor(caller, caller.userId));
  }

/**
   * Turn what the CLIENT sent into what the domain stores — at the shared boundary, so both
   * backends behave identically and the in-memory store stops hiding type errors.
   *
   *   'aura-internal'      → null   (the logical key for the built-in path; there is no such row)
   *   a uuid we know       → itself (a real connected account, looked up IN THIS TENANT)
   *   a uuid we don't know → 400    (including another tenant's account — the lookup is scoped,
   *                                  so a cross-tenant id is simply not found)
   *   anything else        → 400    ("garbage" must be a domain refusal, not a Postgres error
   *                                  surfacing as `invalid input syntax for type uuid`)
   */
  private async resolveAccountId(tenantId: string, accountId: string | null | undefined): Promise<string | null> {
    if (accountId === undefined || accountId === null) return null;
    const value = String(accountId).trim();
    if (value === '' || value === INTERNAL_ACCOUNT_ID) return null;
    if (!isAccountIdShape(value)) {
      throw new BadRequestException(`Unknown sending account "${value}"`);
    }
    const accounts = await this.store.listAccounts(tenantId, 'email');
    if (!accounts.some((account) => account.id === value)) {
      throw new BadRequestException('Unknown sending account');
    }
    return value;
  }

  async createDraft(
    caller: MailCaller,
    input: Omit<ComposeInput, 'tenantId' | 'fromUser'>,
    /** The records this message is composed FROM (MAIL-03…07). Every one is checked before anything is written. */
    relatedTo: Array<Partial<MailRecordRef>> = [],
  ): Promise<MailRecord> {
    const checkedLinks = [];
    for (const ref of relatedTo) checkedLinks.push(await this.checkRecord(caller, ref));
    const accountId = await this.resolveAccountId(caller.tenantId, input.accountId);
    const draft = makeDraft({
      ...input,
      accountId,
      tenantId: caller.tenantId,
      companyId: caller.companyId,
      fromUser: caller.userId,
      fromAddress: input.fromAddress ?? caller.address,
    });
    await this.store.save(caller.tenantId, draft);
    if (checkedLinks.length === 0) return draft;
    for (const checked of checkedLinks) await this.writeLink(caller, draft.id, checked);
    return (await this.store.get(caller.tenantId, draft.id)) ?? draft;
  }

  async updateDraft(caller: MailCaller, mailId: string, patch: Partial<ComposeInput>): Promise<MailRecord> {
    const mail = await this.authored(caller, mailId);
    if (mail.state !== 'draft') throw new BadRequestException(`A ${mail.state} message cannot be edited`);
    const accountId = patch.accountId !== undefined ? await this.resolveAccountId(caller.tenantId, patch.accountId) : mail.accountId;
    const next: MailRecord = {
      ...mail,
      accountId,
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
    const mail = await this.authored(caller, mailId);
    // Only something that never left may be deleted. A sent message is a record of what happened.
    if (mail.state !== 'draft' && mail.state !== 'cancelled') {
      throw new BadRequestException(`A ${mail.state} message cannot be deleted`);
    }
    await this.store.remove(caller.tenantId, mailId);
  }

  /** Hand a message to delivery. The user asks for `queued`; the worker owns everything after. */
  async queueForSend(caller: MailCaller, mailId: string): Promise<MailRecord> {
    const mail = await this.authored(caller, mailId);
    const sendable = assertSendable(mail);
    if (!sendable.ok) throw new BadRequestException(sendable.error);
    await this.assertAttachmentsOpenable(caller, mail);
    const next: MailRecord = { ...mail, state: 'queued', updatedAt: new Date().toISOString() };
    await this.store.save(caller.tenantId, next);
    await this.store.upsertDispatch(caller.tenantId, {
      id: newId(), subjectType: 'mail', subjectId: mail.id, accountId: mail.accountId,
      scheduledAt: new Date().toISOString(), scheduledTimezone: 'UTC', state: 'pending', attempts: 0,
    });
    return next;
  }

  async schedule(caller: MailCaller, mailId: string, when: ScheduleInput): Promise<MailRecord> {
    const mail = await this.authored(caller, mailId);
    const sendable = assertSendable(mail);
    if (!sendable.ok) throw new BadRequestException(sendable.error);
    await this.assertAttachmentsOpenable(caller, mail);
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
    const mail = await this.authored(caller, mailId);
    if (mail.state !== 'scheduled') throw new BadRequestException(`A ${mail.state} message is not scheduled`);
    return this.schedule(caller, mailId, when);
  }

  /**
   * TAKE A FAILED OR UNCERTAIN MESSAGE BACK (MAIL-10).
   *
   * A message the worker gave up on, or parked because it cannot say whether it went out, sat in
   * Needs review with nothing its sender could do: `failed` cannot be sent again and neither state
   * can be edited. Returning it to drafts is the author's own act — a user may move a message to
   * draft — so the recipient can be corrected and the message sent again as a deliberate choice.
   * For an uncertain one that choice may duplicate a message that did arrive; the screen says so.
   */
  async returnToDraft(caller: MailCaller, mailId: string): Promise<MailRecord> {
    const mail = await this.authored(caller, mailId);
    if (mail.state !== 'failed' && mail.state !== 'needs_review') {
      throw new BadRequestException(`A ${mail.state} message cannot be returned to drafts — only a failed or uncertain one`);
    }
    const next: MailRecord = { ...mail, state: 'draft', failedReason: null, deliveryStartedAt: null, updatedAt: new Date().toISOString() };
    await this.store.save(caller.tenantId, next);
    return next;
  }

  async cancel(caller: MailCaller, mailId: string): Promise<MailRecord> {
    const mail = await this.authored(caller, mailId);
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
    // A conversation also holds other people's unsent replies; each message is shown only to
    // whoever may see it on its own.
    return (await this.store.thread(caller.tenantId, mail.threadId)).filter((m) => this.visible(caller, m));
  }

  async markRead(caller: MailCaller, mailId: string): Promise<void> {
    await this.owned(caller, mailId);
    await this.store.markRead(caller.tenantId, mailId, { address: caller.address, userId: caller.userId }, new Date().toISOString());
  }
}
