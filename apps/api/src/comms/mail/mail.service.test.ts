import { BadRequestException, NotFoundException } from '@nestjs/common';
import { newId } from '@aura/shared';
import { describe, expect, it } from 'vitest';
import { InMemoryMailStore } from './in-memory-mail-store';
import { MailService, toUtcInstant, type MailCaller } from './mail.service';
import type { MailRecord } from './mail-domain';

/**
 * Mail lifecycle (C3.1 step 2).
 *
 * The invariants here are the ones that decide whether "scheduled send" is a real workflow or a
 * date field with a hopeful label.
 */

const ALICE: MailCaller = { tenantId: 'tenant-a', companyId: null, userId: 'u-alice', address: 'alice@aura.example' };
const BOB: MailCaller = { tenantId: 'tenant-a', companyId: null, userId: 'u-bob', address: 'bob@aura.example' };
const MALLORY: MailCaller = { tenantId: 'tenant-a', companyId: null, userId: 'u-mallory', address: 'mallory@aura.example' };

function service() {
  const store = new InMemoryMailStore();
  return { svc: new MailService(store), store };
}

describe('drafting', () => {
  it('creates a draft that has not been sent and is not in any folder that implies it was', async () => {
    const { svc } = service();
    const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], subject: 'Quote', body: 'Hi' });
    expect(draft.state).toBe('draft');
    expect(draft.sentAt).toBeNull();
    expect(await svc.list(ALICE, { folder: 'drafts' })).toHaveLength(1);
    expect(await svc.list(ALICE, { folder: 'sent' })).toHaveLength(0);
    expect(await svc.list(BOB, { folder: 'inbox' })).toHaveLength(0);
  });

  it('updates and deletes a draft, but refuses to delete something that left', async () => {
    const { svc, store } = service();
    const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], subject: 'One', body: 'x' });
    const updated = await svc.updateDraft(ALICE, draft.id, { subject: 'Two', to: ['other@example.com'] });
    expect(updated.subject).toBe('Two');
    expect(updated.participants.filter((p) => p.role === 'to').map((p) => p.address)).toEqual(['other@example.com']);

    await store.save(ALICE.tenantId, { ...updated, state: 'sent', sentAt: new Date().toISOString() });
    await expect(svc.deleteDraft(ALICE, draft.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses another user the draft entirely', async () => {
    const { svc } = service();
    const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], body: 'private' });
    await expect(svc.updateDraft(MALLORY, draft.id, { subject: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('scheduling', () => {
  it('converts a wall-clock and zone to the correct UTC instant', () => {
    // Asia/Dubai is UTC+4 year-round.
    expect(toUtcInstant('2026-08-20T08:00', 'Asia/Dubai')).toBe('2026-08-20T04:00:00.000Z');
    // A zone WITH daylight saving, on a summer date: London is UTC+1 in August, not UTC+0.
    expect(toUtcInstant('2026-08-20T08:00', 'Europe/London')).toBe('2026-08-20T07:00:00.000Z');
    // ...and UTC+0 in January. A fixed offset would have sent one of these an hour wrong.
    expect(toUtcInstant('2026-01-20T08:00', 'Europe/London')).toBe('2026-01-20T08:00:00.000Z');
  });

  it('rejects an unknown timezone rather than silently sending in UTC', () => {
    expect(() => toUtcInstant('2026-08-20T08:00', 'Mars/Olympus')).toThrow(BadRequestException);
  });

  it('schedules without sending, keeping the user’s chosen zone beside the instant', async () => {
    const { svc, store } = service();
    const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], subject: 'Later', body: 'x' });
    const scheduled = await svc.schedule(ALICE, draft.id, { localDateTime: '2026-08-20T08:00', timezone: 'Asia/Dubai' });

    expect(scheduled.state).toBe('scheduled');
    // The decisive property: scheduling is NOT sending.
    expect(scheduled.sentAt).toBeNull();

    const dispatch = await store.getDispatch(ALICE.tenantId, draft.id);
    expect(dispatch?.state).toBe('pending');
    expect(dispatch?.scheduledAt).toBe('2026-08-20T04:00:00.000Z');
    expect(dispatch?.scheduledTimezone).toBe('Asia/Dubai');
  });

  it('reschedules the same dispatch row rather than creating a second one', async () => {
    const { svc, store } = service();
    const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], body: 'x' });
    await svc.schedule(ALICE, draft.id, { localDateTime: '2026-08-20T08:00', timezone: 'Asia/Dubai' });
    const first = await store.getDispatch(ALICE.tenantId, draft.id);

    await svc.reschedule(ALICE, draft.id, { localDateTime: '2026-08-21T18:30', timezone: 'Asia/Dubai' });
    const second = await store.getDispatch(ALICE.tenantId, draft.id);

    expect(second?.id).toBe(first?.id);
    expect(second?.scheduledAt).toBe('2026-08-21T14:30:00.000Z');
  });

  it('cancels a scheduled message so nothing will send it', async () => {
    const { svc, store } = service();
    const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], body: 'x' });
    await svc.schedule(ALICE, draft.id, { localDateTime: '2026-08-20T08:00', timezone: 'Asia/Dubai' });

    const cancelled = await svc.cancel(ALICE, draft.id);
    expect(cancelled.state).toBe('cancelled');
    expect(cancelled.sentAt).toBeNull();
    expect((await store.getDispatch(ALICE.tenantId, draft.id))?.state).toBe('cancelled');
    // And it must not reappear anywhere that implies delivery.
    expect(await svc.list(ALICE, { folder: 'sent' })).toHaveLength(0);
  });

  it('refuses to cancel something already sent', async () => {
    const { svc, store } = service();
    const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], body: 'x' });
    await store.save(ALICE.tenantId, { ...draft, state: 'sent', sentAt: new Date().toISOString() });
    await expect(svc.cancel(ALICE, draft.id)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('lifecycle authority', () => {
  it('a user request can only reach queued — never sending or sent', async () => {
    const { svc } = service();
    const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], body: 'x' });
    const queued = await svc.queueForSend(ALICE, draft.id);
    // The worker owns queued → sending → sent/failed. Nothing a user does may claim delivery.
    expect(queued.state).toBe('queued');
    expect(queued.sentAt).toBeNull();
  });

  it('refuses to queue a message with no recipients', async () => {
    const { svc } = service();
    const draft = await svc.createDraft(ALICE, { subject: 'Empty' });
    await expect(svc.queueForSend(ALICE, draft.id)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('reply, reply-all and forward', () => {
  async function inbound(store: InMemoryMailStore): Promise<MailRecord> {
    const id = newId();
    const mail: MailRecord = {
      id, tenantId: ALICE.tenantId, companyId: null, accountId: null,
      direction: 'inbound', state: 'received', fromUser: null,
      subject: 'CCTV quotation', body: 'Please quote.', bodyHtml: null, snippet: 'Please quote.',
      participants: [
        { role: 'from', address: 'client@example.com' },
        { role: 'to', address: 'alice@aura.example', userId: 'u-alice' },
        { role: 'cc', address: 'bob@aura.example', userId: 'u-bob' },
        { role: 'bcc', address: 'auditor@aura.example' },
      ],
      threadId: id, parentMailId: null, forwardedFromMailId: null,
      providerMessageId: 'ext-1', providerThreadId: 'thr-1',
      internetMessageId: '<msg-1@example.com>', inReplyTo: null, referencesHeader: null,
      sentAt: new Date().toISOString(), failedReason: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await store.save(ALICE.tenantId, mail);
    return mail;
  }

  it('reply stays in the thread and answers the sender', async () => {
    const { svc, store } = service();
    const source = await inbound(store);
    const reply = await svc.reply(ALICE, source.id, 'On its way.');
    expect(reply.threadId).toBe(source.threadId);
    expect(reply.parentMailId).toBe(source.id);
    expect(reply.inReplyTo).toBe('<msg-1@example.com>');
    expect(reply.participants.filter((p) => p.role === 'to').map((p) => p.address)).toEqual(['client@example.com']);
  });

  it('reply-all keeps visible recipients and never leaks the BCC', async () => {
    const { svc, store } = service();
    const source = await inbound(store);
    const reply = await svc.replyAll(ALICE, source.id, 'All noted.');
    const addressed = reply.participants.filter((p) => p.role !== 'from').map((p) => p.address);
    expect(addressed).toContain('client@example.com');
    expect(addressed).toContain('bob@aura.example');
    expect(addressed).not.toContain('auditor@aura.example');
    expect(addressed).not.toContain('alice@aura.example');
  });

  it('forward records provenance and starts its own thread', async () => {
    const { svc, store } = service();
    const source = await inbound(store);
    const forwarded = await svc.forward(ALICE, source.id, ['colleague@aura.example']);
    expect(forwarded.forwardedFromMailId).toBe(source.id);
    expect(forwarded.threadId).toBe(forwarded.id);
    expect(forwarded.parentMailId).toBeNull();
    expect(forwarded.subject.startsWith('Fwd:')).toBe(true);
  });
});

describe('inbound import', () => {
  function incoming(providerMessageId: string, accountId: string | null = 'acc-1') {
    const id = newId();
    return {
      id, tenantId: ALICE.tenantId, companyId: null, accountId,
      fromUser: null, subject: 'External', body: 'Hello', bodyHtml: null, snippet: 'Hello',
      participants: [
        { role: 'from' as const, address: 'client@example.com' },
        { role: 'to' as const, address: 'alice@aura.example', userId: 'u-alice' },
      ],
      threadId: id, parentMailId: null, forwardedFromMailId: null,
      providerMessageId, providerThreadId: 'thr-9',
      internetMessageId: '<x@example.com>', inReplyTo: null, referencesHeader: null,
      sentAt: new Date().toISOString(), failedReason: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }

  it('imports once, and a replayed sync finds the same message instead of duplicating it', async () => {
    const { svc } = service();
    const first = await svc.importInbound(ALICE.tenantId, incoming('provider-abc'));
    const second = await svc.importInbound(ALICE.tenantId, incoming('provider-abc'));

    expect(first.imported).toBe(true);
    expect(second.imported).toBe(false);
    expect(second.mail.id).toBe(first.mail.id);
    expect(await svc.list(ALICE, { folder: 'inbox' })).toHaveLength(1);
  });

  it('marks imported mail received and inbound — a state no user request can set', async () => {
    const { svc } = service();
    const { mail } = await svc.importInbound(ALICE.tenantId, incoming('provider-xyz'));
    expect(mail.state).toBe('received');
    expect(mail.direction).toBe('inbound');
  });

  it('treats the same provider id on a different account as a different message', async () => {
    const { svc } = service();
    await svc.importInbound(ALICE.tenantId, incoming('same-id', 'acc-1'));
    const other = await svc.importInbound(ALICE.tenantId, incoming('same-id', 'acc-2'));
    expect(other.imported).toBe(true);
  });

  it('refuses an import with no provider identity, which could never be deduplicated', async () => {
    const { svc } = service();
    await expect(svc.importInbound(ALICE.tenantId, { ...incoming('x'), providerMessageId: null }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
