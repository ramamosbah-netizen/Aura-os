import { newId } from '@aura/shared';

/**
 * The AURA mail domain — provider-neutral by construction.
 *
 * Nothing here knows what Gmail or Microsoft Graph are. A message has an account, an envelope of
 * addresses, a lifecycle, a direction and a place in a thread; how it physically travels is the
 * delivery layer's problem (mail-delivery.ts) and whose API is used is the adapter's.
 *
 * Kept in apps/api rather than @aura/shared on purpose: the shared MailMessage is consumed by the
 * web hub and /workspace, and widening it would force a UI change in the same breath as a domain
 * change. C3.5 moves the UI onto this model deliberately, not as a side effect.
 */

/** How long a message may sit in `sending` before it is treated as a crashed attempt. */
export const SENDING_STALE_MS = 5 * 60_000;

export type MailState =
  | 'draft'      // composed, never queued — editable and deletable
  | 'scheduled'  // a dispatch row exists and has not fired
  | 'queued'     // handed to delivery
  | 'sending'    // an attempt is in flight
  | 'sent'       // the provider accepted it
  | 'failed'     // delivery gave up; failedReason says why
  | 'cancelled'  // withdrawn before it left
  | 'received'      // inbound, synced from a provider
  | 'needs_review'; // ambiguous after a crash and not resolvable automatically

export type MailDirection = 'inbound' | 'outbound';
export type RecipientRole = 'from' | 'to' | 'cc' | 'bcc';

/**
 * One address on the envelope. `address` is the only required part: an external sender has no
 * AURA user and may have no CRM contact, and refusing to store them would make the whole model
 * useless the moment a real mailbox is connected.
 */
export interface MailParticipant {
  role: RecipientRole;
  /**
   * The external address, when there is one. NULL for an internal participant identified only by
   * `userId`: an AURA username is not an email address, and writing "u-admin" here would put a
   * string that can never receive mail into the envelope.
   */
  address: string | null;
  displayName?: string | null;
  userId?: string | null;
  contactId?: string | null;
  /**
   * When this recipient opened it — a READ PROJECTION, hydrated from aura_comms_mail_reads.
   *
   * It is never persisted onto aura_comms_participants: that table describes who was on a
   * communication, and "has this person read it" is a mail concept a meeting attendee has no use
   * for. The convenience of reading it here must not turn into storing it there.
   */
  readAt?: string | null;
}

/** How a participant is identified for comparison — address if external, user otherwise. */
export function participantKey(participant: MailParticipant): string {
  return participant.address ? normaliseAddress(participant.address) : `user:${participant.userId ?? ''}`;
}

export interface MailRecord {
  id: string;
  tenantId: string;
  companyId: string | null;
  accountId: string | null;
  direction: MailDirection;
  state: MailState;
  fromUser: string | null;
  subject: string;
  body: string;
  bodyHtml: string | null;
  snippet: string | null;
  participants: MailParticipant[];
  /** AURA's own conversation identity. */
  threadId: string;
  parentMailId: string | null;
  forwardedFromMailId: string | null;
  /** Provider identity — what makes a re-sync recognise a message it already holds. */
  providerMessageId: string | null;
  providerThreadId: string | null;
  /** Internet headers: what actually stitches an AURA thread to the provider's. */
  internetMessageId: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  sentAt: string | null;
  failedReason: string | null;
  /**
   * Stable idempotency key, minted once when the message is first queued and never regenerated —
   * regenerating per attempt would defeat the entire mechanism.
   */
  deliveryKey: string | null;
  /** When the CURRENT attempt began; a stale value is the crash signature. */
  deliveryStartedAt: string | null;
  deliveryAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface ComposeInput {
  tenantId: string;
  companyId?: string | null;
  accountId?: string | null;
  /** Legacy/optional: which AURA actor composed it. Inbound external mail has no such actor. */
  fromUser?: string | null;
  /** Canonical sender identity is the 'from' participant; either an address or an AURA user. */
  fromAddress?: string | null;
  to?: MailParticipant[] | string[];
  cc?: MailParticipant[] | string[];
  bcc?: MailParticipant[] | string[];
  subject?: string;
  body?: string;
  bodyHtml?: string | null;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Addresses are normalised once, here, so "A@X.com" and "a@x.com" are the same recipient. */
export function normaliseAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function isEmailAddress(address: string): boolean {
  return EMAIL_SHAPE.test(normaliseAddress(address));
}

function toParticipants(role: RecipientRole, input: MailParticipant[] | string[] | undefined): MailParticipant[] {
  return (input ?? []).map((entry) =>
    typeof entry === 'string'
      ? { role, address: normaliseAddress(entry) }
      : { ...entry, role, address: entry.address ? normaliseAddress(entry.address) : null });
}

/** A short, plain-text preview for lists and the timeline. Never a substitute for the body. */
export function snippetOf(body: string, limit = 140): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

export function buildEnvelope(input: ComposeInput): MailParticipant[] {
  return [
    { role: 'from', address: input.fromAddress ? normaliseAddress(input.fromAddress) : null, userId: input.fromUser ?? null },
    ...toParticipants('to', input.to),
    ...toParticipants('cc', input.cc),
    ...toParticipants('bcc', input.bcc),
  ];
}

/**
 * Compose a draft. A draft is deliberately permissive — you may save one with no recipients and
 * no subject, because that is what a half-written message is. The checks that matter run at
 * SEND time, in `assertSendable`, where an empty envelope is a real error.
 */
export function makeDraft(input: ComposeInput): MailRecord {
  const now = new Date().toISOString();
  const id = newId();
  const body = (input.body ?? '').trim();
  return {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    accountId: input.accountId ?? null,
    direction: 'outbound',
    state: 'draft',
    fromUser: input.fromUser ?? null,
    subject: (input.subject ?? '').trim(),
    body,
    bodyHtml: input.bodyHtml ?? null,
    snippet: snippetOf(body),
    participants: buildEnvelope(input),
    threadId: id,
    parentMailId: null,
    forwardedFromMailId: null,
    providerMessageId: null,
    providerThreadId: null,
    internetMessageId: null,
    inReplyTo: null,
    referencesHeader: null,
    sentAt: null,
    failedReason: null,
    deliveryKey: null,
    deliveryStartedAt: null,
    deliveryAttempts: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** States from which a message may still be edited or withdrawn. */
export const EDITABLE_STATES: MailState[] = ['draft', 'scheduled'];

export function assertSendable(mail: MailRecord): { ok: true } | { ok: false; error: string } {
  const recipients = mail.participants.filter((p) => p.role !== 'from');
  if (recipients.length === 0) return { ok: false, error: 'At least one recipient is required' };
  // An internal recipient is addressed by user; an external one must be a real address. A
  // participant with neither could never be delivered to.
  const unaddressable = recipients.find((p) => !p.address && !p.userId);
  if (unaddressable) return { ok: false, error: 'A recipient must have an address or an AURA user' };
  const invalid = recipients.find((p) => p.address && !isEmailAddress(p.address));
  if (invalid) return { ok: false, error: `Not a valid email address: ${invalid.address}` };
  if (!mail.subject && !mail.body) return { ok: false, error: 'Subject or body is required' };
  if (!EDITABLE_STATES.includes(mail.state) && mail.state !== 'queued') {
    return { ok: false, error: `A ${mail.state} message cannot be sent again` };
  }
  return { ok: true };
}

const RE_PREFIX = /^re:\s*/i;
const FWD_PREFIX = /^fwd:\s*/i;

/** "Re:" is added once, however many times a thread goes back and forth. */
export function replySubject(subject: string): string {
  return RE_PREFIX.test(subject) ? subject : `Re: ${subject}`.trim();
}

export function forwardSubject(subject: string): string {
  return FWD_PREFIX.test(subject) ? subject : `Fwd: ${subject}`.trim();
}

/**
 * Who a reply goes to.
 *
 * `reply` answers the sender alone. `replyAll` answers the sender plus everyone who was visibly
 * on the message — visibly being the point: BCC recipients are NOT carried forward, because the
 * whole meaning of a blind copy is that the other recipients never learn of them. Reply-all
 * leaking a BCC is a privacy incident, not a formatting bug.
 *
 * The replying user is dropped from their own reply.
 */
export function replyRecipients(
  source: MailRecord,
  replier: { address?: string | null; userId?: string | null },
  all: boolean,
): { to: MailParticipant[]; cc: MailParticipant[] } {
  const me = participantKey({ role: 'from', address: replier.address ?? null, userId: replier.userId ?? null });
  const sender = source.participants.find((p) => p.role === 'from');
  const keep = (p: MailParticipant): boolean => participantKey(p) !== me;

  // Replying to a message you sent yourself — following up from the Sent folder — is an ordinary
  // act, and the audience is the people it was addressed to, not yourself. Deriving the audience
  // from `from` alone left nobody to reply to and the reply was refused outright.
  const outgoing = sender !== undefined && !keep(sender);
  const to = outgoing
    ? source.participants.filter((p) => p.role === 'to').filter(keep).map((p) => ({ ...p, role: 'to' as const }))
    : sender && keep(sender)
      ? [{ ...sender, role: 'to' as const }]
      : [];
  if (!all) return { to, cc: [] };

  const seen = new Set([me, ...to.map(participantKey)]);
  const others = source.participants
    .filter((p) => p.role === 'to' || p.role === 'cc')   // never 'bcc'
    .filter(keep)
    .filter((p) => {
      const key = participantKey(p);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    to: [...to, ...others.filter((p) => p.role === 'to').map((p) => ({ ...p, role: 'to' as const }))],
    cc: others.filter((p) => p.role === 'cc').map((p) => ({ ...p, role: 'cc' as const })),
  };
}

/**
 * Thread linkage for a reply. The AURA thread is inherited so the conversation walks as edges,
 * and the Internet headers are chained so a provider stitches it to the same thread on their side.
 */
export function threadLinkageForReply(source: MailRecord): {
  threadId: string;
  parentMailId: string;
  inReplyTo: string | null;
  referencesHeader: string | null;
} {
  const references = [source.referencesHeader, source.internetMessageId].filter(Boolean).join(' ').trim();
  return {
    threadId: source.threadId,
    parentMailId: source.id,
    inReplyTo: source.internetMessageId,
    referencesHeader: references || null,
  };
}
