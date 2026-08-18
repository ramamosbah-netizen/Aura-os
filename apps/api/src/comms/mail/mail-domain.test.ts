import { describe, expect, it } from 'vitest';
import {
  assertSendable,
  buildEnvelope,
  forwardSubject,
  makeDraft,
  normaliseAddress,
  participantKey,
  replyRecipients,
  replySubject,
  threadLinkageForReply,
  type MailRecord,
} from './mail-domain';

/**
 * Mail domain (C3.1) — the rules that must hold before any provider is connected.
 *
 * These are the checks that stop the model being "Gmail-shaped guesswork": a draft that has not
 * been sent, an envelope that survives a reply without leaking, and a thread that can be stitched
 * to an external provider later.
 */

const BASE = {
  tenantId: 'tenant-a',
  fromUser: 'u-alice',
  fromAddress: 'alice@aura.example',
};

function sent(over: Partial<MailRecord> = {}): MailRecord {
  const draft = makeDraft({ ...BASE, to: ['client@example.com'], subject: 'Quotation', body: 'Attached.' });
  return { ...draft, state: 'sent', sentAt: new Date().toISOString(), ...over };
}

describe('composing', () => {
  it('creates a draft that has NOT been sent', () => {
    const draft = makeDraft({ ...BASE, to: ['client@example.com'], subject: 'Hello' });
    expect(draft.state).toBe('draft');
    // The single most important property of a draft: no send time, so nothing downstream can
    // mistake it for something that left the building.
    expect(draft.sentAt).toBeNull();
    expect(draft.direction).toBe('outbound');
    expect(draft.threadId).toBe(draft.id);
  });

  it('keeps a half-written draft saveable but refuses to SEND it', () => {
    const empty = makeDraft({ ...BASE });
    expect(empty.state).toBe('draft');
    expect(assertSendable(empty)).toEqual({ ok: false, error: 'At least one recipient is required' });
  });

  it('records To, CC and BCC distinctly', () => {
    const envelope = buildEnvelope({
      ...BASE,
      to: ['a@example.com'],
      cc: ['b@example.com'],
      bcc: ['secret@example.com'],
    });
    expect(envelope.filter((p) => p.role === 'to').map((p) => p.address)).toEqual(['a@example.com']);
    expect(envelope.filter((p) => p.role === 'cc').map((p) => p.address)).toEqual(['b@example.com']);
    expect(envelope.filter((p) => p.role === 'bcc').map((p) => p.address)).toEqual(['secret@example.com']);
  });

  it('accepts an external address with no CRM contact and no AURA user', () => {
    const draft = makeDraft({ ...BASE, to: ['stranger@external.example'], subject: 'Hi' });
    const recipient = draft.participants.find((p) => p.role === 'to')!;
    expect(recipient.address).toBe('stranger@external.example');
    expect(recipient.contactId ?? null).toBeNull();
    expect(recipient.userId ?? null).toBeNull();
    expect(assertSendable(draft)).toEqual({ ok: true });
  });

  it('addresses an internal participant by user, never by username-as-address', () => {
    const draft = makeDraft({ ...BASE, to: [{ role: 'to', address: null, userId: 'u-bob' }], body: 'internal' });
    const recipient = draft.participants.find((p) => p.role === 'to')!;
    expect(recipient.address).toBeNull();
    expect(recipient.userId).toBe('u-bob');
    expect(assertSendable(draft)).toEqual({ ok: true });
    expect(participantKey(recipient)).toBe('user:u-bob');
  });

  it('refuses a recipient that could never be delivered to', () => {
    const draft = makeDraft({ ...BASE, body: 'x' });
    draft.participants.push({ role: 'to', address: null, userId: null });
    expect(assertSendable(draft)).toEqual({ ok: false, error: 'A recipient must have an address or an AURA user' });
  });

  it('rejects a malformed external address', () => {
    const draft = makeDraft({ ...BASE, to: ['not-an-address'], body: 'x' });
    expect(assertSendable(draft)).toEqual({ ok: false, error: 'Not a valid email address: not-an-address' });
  });

  it('normalises addresses so casing does not create a second recipient', () => {
    expect(normaliseAddress('  Client@Example.COM ')).toBe('client@example.com');
  });

  it('refuses to send a message that has already been sent', () => {
    expect(assertSendable(sent())).toEqual({ ok: false, error: 'A sent message cannot be sent again' });
  });
});

describe('reply and reply-all', () => {
  const source = sent({
    participants: [
      { role: 'from', address: 'client@example.com' },
      { role: 'to', address: 'alice@aura.example', userId: 'u-alice' },
      { role: 'cc', address: 'colleague@aura.example' },
      { role: 'bcc', address: 'auditor@aura.example' },
    ],
    subject: 'CCTV quotation',
    internetMessageId: '<msg-1@example.com>',
  });

  it('reply answers the sender only', () => {
    const { to, cc } = replyRecipients(source, { address: 'alice@aura.example' }, false);
    expect(to.map((p) => p.address)).toEqual(['client@example.com']);
    expect(cc).toEqual([]);
  });

  it('reply-all keeps the visible recipients and drops the replier', () => {
    const { to, cc } = replyRecipients(source, { address: 'alice@aura.example' }, true);
    expect(to.map((p) => p.address)).toEqual(['client@example.com']);
    expect(cc.map((p) => p.address)).toEqual(['colleague@aura.example']);
    expect([...to, ...cc].map((p) => p.address)).not.toContain('alice@aura.example');
  });

  it('reply-all NEVER carries a BCC forward', () => {
    // The whole meaning of a blind copy is that the other recipients never learn of it. A
    // reply-all that leaks one is a privacy incident, not a formatting bug.
    const { to, cc } = replyRecipients(source, { address: 'alice@aura.example' }, true);
    expect([...to, ...cc].map((p) => p.address)).not.toContain('auditor@aura.example');
  });

  it('replying to mail you sent yourself answers the people you addressed', () => {
    // Following up from the Sent folder. Deriving the audience from `from` alone left nobody to
    // reply to, because the sender IS the replier, and the reply was refused outright.
    const mine = sent({
      participants: [
        { role: 'from', address: 'alice@aura.example' },
        { role: 'to', address: 'client@example.com' },
        { role: 'cc', address: 'colleague@aura.example' },
        { role: 'bcc', address: 'auditor@aura.example' },
      ],
    });

    const { to, cc } = replyRecipients(mine, { address: 'alice@aura.example' }, false);
    expect(to.map((p) => p.address)).toEqual(['client@example.com']);
    expect(cc).toEqual([]);

    const all = replyRecipients(mine, { address: 'alice@aura.example' }, true);
    expect(all.cc.map((p) => p.address)).toEqual(['colleague@aura.example']);
    // Still not to yourself, and still never the blind copy.
    expect([...all.to, ...all.cc].map((p) => p.address)).not.toContain('alice@aura.example');
    expect([...all.to, ...all.cc].map((p) => p.address)).not.toContain('auditor@aura.example');
  });

  it('does not duplicate an address that appears twice on the envelope', () => {
    const noisy = sent({
      participants: [
        { role: 'from', address: 'client@example.com' },
        { role: 'to', address: 'alice@aura.example' },
        { role: 'cc', address: 'CLIENT@example.com' },
      ],
    });
    const { to, cc } = replyRecipients(noisy, { address: 'alice@aura.example' }, true);
    expect([...to, ...cc].filter((p) => p.address === 'client@example.com')).toHaveLength(1);
  });

  it('prefixes Re: once, however long the thread runs', () => {
    expect(replySubject('CCTV quotation')).toBe('Re: CCTV quotation');
    expect(replySubject('Re: CCTV quotation')).toBe('Re: CCTV quotation');
    expect(forwardSubject('Fwd: Drawing')).toBe('Fwd: Drawing');
  });

  it('keeps the reply in the same thread and chains the internet headers', () => {
    const linkage = threadLinkageForReply(source);
    expect(linkage.threadId).toBe(source.threadId);
    expect(linkage.parentMailId).toBe(source.id);
    // thread_id is an AURA uuid and means nothing to a provider; In-Reply-To/References are what
    // make an external mail client put the reply in the same conversation.
    expect(linkage.inReplyTo).toBe('<msg-1@example.com>');
    expect(linkage.referencesHeader).toContain('<msg-1@example.com>');
  });

  it('accumulates References across a multi-hop thread', () => {
    const second = sent({
      threadId: source.threadId,
      internetMessageId: '<msg-2@example.com>',
      referencesHeader: '<msg-1@example.com>',
    });
    const linkage = threadLinkageForReply(second);
    expect(linkage.referencesHeader).toBe('<msg-1@example.com> <msg-2@example.com>');
  });
});
