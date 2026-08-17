import type { TenantContext } from '@aura/core';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryMailStore } from './in-memory-mail-store';
import { MailDispatchWorker, MAX_ATTEMPTS, retryDelayMs } from './mail-dispatch.worker';
import { MailService, type MailCaller } from './mail.service';
import { PermanentDeliveryError, type MailCapability, type MailProviderAdapter } from './mail-delivery';

/**
 * Outbound dispatch (C3.3).
 *
 * The worker is the only thing allowed to say a message was sent, so these tests are mostly about
 * what it must NOT do: send a message that is not due, send one the user cancelled, send one
 * twice, or give up on the first hiccup.
 */

const ALICE: MailCaller = { tenantId: 'tenant-a', companyId: null, userId: 'u-alice', address: 'alice@aura.example' };
const FUTURE = { localDateTime: '2030-01-01T08:00', timezone: 'Asia/Dubai' };
const PAST = { localDateTime: '2020-01-01T08:00', timezone: 'Asia/Dubai' };

/** TenantContext stand-in: the worker binds a tenant, the callback just runs. */
const tenantContext = { run: (_info: unknown, fn: () => unknown) => fn() } as unknown as TenantContext;

class RecordingAdapter implements MailProviderAdapter {
  readonly provider = 'aura-internal';
  readonly capabilities: MailCapability[] = ['send', 'reply', 'reply_all', 'forward', 'attachments', 'read_state', 'scheduled_send'];
  sends = 0;
  constructor(private readonly behaviour: 'ok' | 'transient' | 'permanent' = 'ok') {}
  async health() { return { status: 'connected' as const, detail: null, checkedAt: new Date().toISOString() }; }
  async send() {
    this.sends += 1;
    if (this.behaviour === 'transient') throw new Error('provider timed out');
    if (this.behaviour === 'permanent') throw new PermanentDeliveryError('recipient address rejected');
    return {
      providerMessageId: `p-${this.sends}`, providerThreadId: 't-1',
      internetMessageId: '<x@aura.internal>', sentAt: new Date().toISOString(),
    };
  }
}

function harness(behaviour: 'ok' | 'transient' | 'permanent' = 'ok') {
  const store = new InMemoryMailStore();
  const svc = new MailService(store);
  const worker = new MailDispatchWorker(store, tenantContext);
  const adapter = new RecordingAdapter(behaviour);
  worker.registerAdapterForTesting(adapter);
  return { store, svc, worker, adapter };
}

async function scheduled(svc: MailService, when = PAST) {
  const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], subject: 'Go', body: 'body' });
  await svc.schedule(ALICE, draft.id, when);
  return draft.id;
}

describe('sending due work', () => {
  it('moves a due scheduled message to sent and records the provider identifiers', async () => {
    const { svc, worker, store, adapter } = harness();
    const id = await scheduled(svc);

    const result = await worker.drain();

    expect(result).toEqual({ sent: 1, failed: 0 });
    const mail = await store.get('tenant-a', id);
    expect(mail!.state).toBe('sent');
    expect(mail!.sentAt).toBeTruthy();
    expect(mail!.providerMessageId).toBe('p-1');
    expect(mail!.internetMessageId).toBe('<x@aura.internal>');
    expect((await store.getDispatch('tenant-a', id))!.state).toBe('done');
    expect(adapter.sends).toBe(1);
  });

  it('leaves a message scheduled for the future alone', async () => {
    const { svc, worker, store, adapter } = harness();
    const id = await scheduled(svc, FUTURE);

    expect(await worker.drain()).toEqual({ sent: 0, failed: 0 });
    expect((await store.get('tenant-a', id))!.state).toBe('scheduled');
    expect((await store.get('tenant-a', id))!.sentAt).toBeNull();
    expect(adapter.sends).toBe(0);
  });

  it('never sends a message the user cancelled', async () => {
    const { svc, worker, store, adapter } = harness();
    const id = await scheduled(svc);
    await svc.cancel(ALICE, id);

    await worker.drain();

    expect(adapter.sends).toBe(0);
    expect((await store.get('tenant-a', id))!.state).toBe('cancelled');
    expect((await store.get('tenant-a', id))!.sentAt).toBeNull();
  });
});

describe('duplicate execution', () => {
  it('two drains of the same due message send it once', async () => {
    const { svc, worker, adapter } = harness();
    await scheduled(svc);

    await worker.drain();
    await worker.drain();

    // The claim moves the row out of `pending` in one statement, so the second pass finds nothing.
    expect(adapter.sends).toBe(1);
  });

  it('a message already marked sent is closed out without a second send', async () => {
    const { svc, worker, store, adapter } = harness();
    const id = await scheduled(svc);
    const mail = await store.get('tenant-a', id);
    // Simulates the nastiest case: the provider accepted it but the reply never reached us.
    await store.save('tenant-a', { ...mail!, state: 'sent', sentAt: new Date().toISOString() });
    await store.upsertDispatch('tenant-a', { ...(await store.getDispatch('tenant-a', id))!, state: 'pending' });

    await worker.drain();

    expect(adapter.sends).toBe(0);
    expect((await store.getDispatch('tenant-a', id))!.state).toBe('done');
  });

  it('a re-entrant drain does not double-process', async () => {
    const { svc, worker, adapter } = harness();
    await scheduled(svc);
    await Promise.all([worker.drain(), worker.drain()]);
    expect(adapter.sends).toBe(1);
  });
});

describe('failure and retry', () => {
  it('retries a transient failure instead of giving up, and keeps the message queued', async () => {
    const { svc, worker, store } = harness('transient');
    const id = await scheduled(svc);

    expect(await worker.drain()).toEqual({ sent: 0, failed: 1 });

    const dispatch = await store.getDispatch('tenant-a', id);
    expect(dispatch!.state).toBe('pending');
    expect(dispatch!.attempts).toBe(1);
    expect(dispatch!.lastError).toContain('provider timed out');
    // Telling the user it failed and then sending it anyway is worse than saying nothing yet.
    expect((await store.get('tenant-a', id))!.state).toBe('queued');
    expect((await store.get('tenant-a', id))!.failedReason).toBeNull();
  });

  it('backs off further with each attempt', () => {
    expect(retryDelayMs(1)).toBeLessThan(retryDelayMs(2));
    expect(retryDelayMs(2)).toBeLessThan(retryDelayMs(3));
    // ...and never grows without limit.
    expect(retryDelayMs(1000)).toBe(60 * 60_000);
  });

  it('dead-letters after the attempt limit, with the reason on the message', async () => {
    const { svc, worker, store } = harness('transient');
    const id = await scheduled(svc);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      // Make the retry due again so the next pass picks it up.
      const dispatch = await store.getDispatch('tenant-a', id);
      if (dispatch?.state === 'pending') {
        await store.upsertDispatch('tenant-a', { ...dispatch, scheduledAt: '2020-01-01T00:00:00.000Z' });
      }
      await worker.drain();
    }

    expect((await store.getDispatch('tenant-a', id))!.state).toBe('failed');
    const mail = await store.get('tenant-a', id);
    expect(mail!.state).toBe('failed');
    expect(mail!.failedReason).toContain('provider timed out');
    expect(mail!.sentAt).toBeNull();
  });

  it('does not retry a permanent refusal — a bad address stays bad', async () => {
    const { svc, worker, store, adapter } = harness('permanent');
    const id = await scheduled(svc);

    await worker.drain();

    expect(adapter.sends).toBe(1);
    expect((await store.getDispatch('tenant-a', id))!.state).toBe('failed');
    expect((await store.get('tenant-a', id))!.failedReason).toContain('recipient address rejected');
  });
});

describe('tenant isolation', () => {
  it('binds each tenant before claiming, so RLS applies on the worker’s behalf', async () => {
    const store = new InMemoryMailStore();
    const svc = new MailService(store);
    const run = vi.fn((_info: unknown, fn: () => unknown) => fn());
    const worker = new MailDispatchWorker(store, { run } as unknown as TenantContext);
    worker.registerAdapterForTesting(new RecordingAdapter());
    await scheduled(svc);

    await worker.drain();

    expect(run).toHaveBeenCalled();
    expect(run.mock.calls[0]![0]).toMatchObject({ tenantId: 'tenant-a', actorId: 'system' });
  });
});

describe('the crash window (C3.4b)', () => {
  /** A message the provider may or may not have taken: left in `sending` by a dead process. */
  async function stalled(store: InMemoryMailStore, svc: MailService) {
    const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], subject: 'Interrupted', body: 'x' });
    const mail = await store.get('tenant-a', draft.id);
    await store.save('tenant-a', {
      ...mail!,
      state: 'sending',
      deliveryKey: `aura-mail:${draft.id}`,
      internetMessageId: `<${draft.id}@aura.internal>`,
      // Older than the staleness threshold, which is what distinguishes a crash from an
      // attempt that is legitimately in flight right now.
      deliveryStartedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      deliveryAttempts: 1,
    });
    return draft.id;
  }

  class LookupAdapter extends RecordingAdapter {
    readonly capabilities: MailCapability[] = ['send', 'lookup_sent'];
    constructor(private readonly alreadySent: boolean) { super('ok'); }
    async findSent() {
      return this.alreadySent
        ? { providerMessageId: 'already-there', providerThreadId: 't', internetMessageId: '<m@x>', sentAt: '2026-08-18T10:00:00.000Z' }
        : null;
    }
  }

  it('does NOT resend when the provider confirms it already has the message', async () => {
    const store = new InMemoryMailStore();
    const svc = new MailService(store);
    const worker = new MailDispatchWorker(store, tenantContext);
    const adapter = new LookupAdapter(true);
    worker.registerAdapterForTesting(adapter);
    const id = await stalled(store, svc);

    const outcome = await worker.recoverStalled('tenant-a', new Date().toISOString());

    expect(outcome.resolved).toBe(1);
    expect(adapter.sends).toBe(0); // the recipient must not see a second copy
    const mail = await store.get('tenant-a', id);
    expect(mail!.state).toBe('sent');
    expect(mail!.sentAt).toBe('2026-08-18T10:00:00.000Z');
    expect(mail!.providerMessageId).toBe('already-there');
  });

  it('requeues when the provider confirms it never got it', async () => {
    const store = new InMemoryMailStore();
    const svc = new MailService(store);
    const worker = new MailDispatchWorker(store, tenantContext);
    worker.registerAdapterForTesting(new LookupAdapter(false));
    const id = await stalled(store, svc);

    const outcome = await worker.recoverStalled('tenant-a', new Date().toISOString());

    expect(outcome.requeued).toBe(1);
    expect((await store.get('tenant-a', id))!.state).toBe('queued');
    expect((await store.getDispatch('tenant-a', id))!.state).toBe('pending');
  });

  it('requeues with the SAME delivery key when the provider deduplicates retries', async () => {
    class IdempotentAdapter extends RecordingAdapter {
      readonly capabilities: MailCapability[] = ['send', 'idempotent_send'];
      keys: Array<string | undefined> = [];
      async send(_a: MailAccountRef, _m: MailRecord, key?: string) {
        this.keys.push(key);
        return super.send();
      }
    }
    const store = new InMemoryMailStore();
    const svc = new MailService(store);
    const worker = new MailDispatchWorker(store, tenantContext);
    const adapter = new IdempotentAdapter('ok');
    worker.registerAdapterForTesting(adapter);
    const id = await stalled(store, svc);
    const keyBefore = (await store.get('tenant-a', id))!.deliveryKey;

    await worker.recoverStalled('tenant-a', new Date().toISOString());
    await worker.drain();

    // Same key across the retry — regenerating it per attempt would defeat provider-side dedupe.
    expect(adapter.keys).toEqual([keyBefore]);
    expect((await store.get('tenant-a', id))!.deliveryKey).toBe(keyBefore);
  });

  it('parks for review when the provider can neither confirm nor deduplicate', async () => {
    const store = new InMemoryMailStore();
    const svc = new MailService(store);
    const worker = new MailDispatchWorker(store, tenantContext);
    // The reference adapter supports neither lookup_sent nor idempotent_send.
    worker.registerAdapterForTesting(new RecordingAdapter());
    const id = await stalled(store, svc);

    const outcome = await worker.recoverStalled('tenant-a', new Date().toISOString());

    expect(outcome.parked).toBe(1);
    const mail = await store.get('tenant-a', id);
    // Neither resent (possible duplicate) nor abandoned (possible lost mail) — surfaced.
    expect(mail!.state).toBe('needs_review');
    expect(mail!.sentAt).toBeNull();
    expect(mail!.failedReason).toMatch(/cannot confirm whether it was delivered/);
  });

  it('leaves an attempt that is legitimately in flight alone', async () => {
    const store = new InMemoryMailStore();
    const svc = new MailService(store);
    const worker = new MailDispatchWorker(store, tenantContext);
    worker.registerAdapterForTesting(new RecordingAdapter());
    const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], body: 'x' });
    const mail = await store.get('tenant-a', draft.id);
    await store.save('tenant-a', { ...mail!, state: 'sending', deliveryStartedAt: new Date().toISOString() });

    const outcome = await worker.recoverStalled('tenant-a', new Date().toISOString());

    expect(outcome).toEqual({ resolved: 0, requeued: 0, parked: 0 });
    expect((await store.get('tenant-a', draft.id))!.state).toBe('sending');
  });

  it('mints the delivery key BEFORE the provider is called, so it can be asked afterwards', async () => {
    const { svc, worker, store } = harness();
    const draft = await svc.createDraft(ALICE, { to: ['client@example.com'], body: 'x' });
    await svc.queueForSend(ALICE, draft.id);

    await worker.drain();

    const mail = await store.get('tenant-a', draft.id);
    expect(mail!.deliveryKey).toBe(`aura-mail:${draft.id}`);
    expect(mail!.internetMessageId).toBeTruthy();
    expect(mail!.deliveryAttempts).toBe(1);
  });
});
