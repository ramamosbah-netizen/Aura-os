import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InMemoryMailStore } from './in-memory-mail-store';
import { MailSyncEngine } from './mail-sync.engine';
import { AuraInternalMailAdapter } from './aura-internal-adapter';
import type { MailAccountRef, MailCapability, MailProviderAdapter, SyncCursor, SyncPage } from './mail-delivery';
import type { MailRecord } from './mail-domain';

/**
 * Inbound sync (C3.4).
 *
 * A sync that replays is normal, not exceptional — a restart, a retry, a provider resending a
 * page. So most of these assert what must NOT happen when the same message arrives twice.
 */

const account = (over: Partial<MailAccountRef> = {}): MailAccountRef => ({
  id: 'acc-1',
  tenantId: 'tenant-a',
  companyId: null,
  provider: 'probe',
  externalAccountId: 'mailbox-1',
  address: 'alice@aura.example',
  capabilities: ['send', 'fetch_messages', 'fetch_threads', 'attachments'],
  status: 'connected',
  ...over,
});

function incoming(over: Partial<MailRecord> = {}): MailRecord {
  const id = randomUUID();
  const now = new Date().toISOString();
  return {
    id, tenantId: 'tenant-a', companyId: null, accountId: null,
    direction: 'inbound', state: 'received', fromUser: null,
    subject: 'External enquiry', body: 'Please quote.', bodyHtml: null, snippet: null,
    participants: [
      { role: 'from', address: 'Client@Example.com', displayName: 'Client' },
      { role: 'to', address: 'alice@aura.example' },
      { role: 'cc', address: 'colleague@aura.example' },
    ],
    threadId: id, parentMailId: null, forwardedFromMailId: null,
    providerMessageId: `p-${id}`, providerThreadId: 'ptr-1',
    internetMessageId: `<${id}@example.com>`, inReplyTo: null, referencesHeader: null,
    sentAt: now, failedReason: null, createdAt: now, updatedAt: now,
    ...over,
  };
}

/** A provider stand-in whose pages the test controls. */
class ScriptedAdapter implements MailProviderAdapter {
  readonly provider = 'probe';
  readonly capabilities: MailCapability[] = ['send', 'fetch_messages', 'fetch_threads', 'attachments'];
  calls: Array<string | null> = [];
  constructor(private readonly pages: SyncPage[]) {}
  async health() { return { status: 'connected' as const, detail: null, checkedAt: new Date().toISOString() }; }
  async send() { return { providerMessageId: 'x', providerThreadId: 'y', internetMessageId: null, sentAt: new Date().toISOString() }; }
  async fetchSince(_a: MailAccountRef, cursor: SyncCursor | null): Promise<SyncPage> {
    this.calls.push(cursor?.token ?? null);
    return this.pages.shift() ?? { messages: [], cursor: cursor ?? { token: null, fetchedAt: new Date().toISOString() }, hasMore: false };
  }
}

const page = (messages: MailRecord[], token: string, hasMore = false): SyncPage => ({
  messages, cursor: { token, fetchedAt: new Date().toISOString() }, hasMore,
});

function harness(pages: SyncPage[]) {
  const store = new InMemoryMailStore();
  return { store, engine: new MailSyncEngine(store), adapter: new ScriptedAdapter(pages) };
}

describe('importing', () => {
  it('imports a message as received and inbound, owned by the syncing account', async () => {
    const message = incoming();
    const { engine, adapter, store } = harness([page([message], 'c1')]);

    const outcome = await engine.syncAccount(account(), adapter, null);

    expect(outcome.imported).toBe(1);
    const stored = await store.findByProviderMessage('tenant-a', 'acc-1', message.providerMessageId!);
    expect(stored!.state).toBe('received');
    expect(stored!.direction).toBe('inbound');
    expect(stored!.accountId).toBe('acc-1');
    // Inbound mail has no AURA author.
    expect(stored!.fromUser).toBeNull();
  });

  it('imports From/To/CC as participants, normalising addresses', async () => {
    const { engine, adapter, store } = harness([page([incoming()], 'c1')]);
    await engine.syncAccount(account(), adapter, null);

    const [mail] = await store.list('tenant-a', { address: 'alice@aura.example', folder: 'inbox' });
    const roles = mail!.participants.map((p) => `${p.role}:${p.address}`).sort();
    expect(roles).toEqual(['cc:colleague@aura.example', 'from:client@example.com', 'to:alice@aura.example']);
  });

  it('refuses a message with no provider identity, which could never be deduplicated', async () => {
    const { engine } = harness([]);
    await expect(engine.importOne(account(), incoming({ providerMessageId: null })))
      .rejects.toThrow(/could never be deduplicated/);
  });
});

describe('idempotency', () => {
  it('a replayed page imports nothing the second time', async () => {
    const message = incoming();
    const { engine, store } = harness([]);
    const adapter = new ScriptedAdapter([page([message], 'c1'), page([message], 'c1')]);

    const first = await engine.syncAccount(account(), adapter, null);
    const second = await engine.syncAccount(account(), adapter, first.cursor);

    expect(first.imported).toBe(1);
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(await store.list('tenant-a', { address: 'alice@aura.example', folder: 'inbox' })).toHaveLength(1);
  });

  it('treats the same provider message on a DIFFERENT account as a different message', async () => {
    // A shared mailbox and a personal one can both legitimately receive the same message, and
    // collapsing them would make one account's copy vanish.
    const message = incoming();
    const { engine, store } = harness([]);
    const a = new ScriptedAdapter([page([message], 'c1')]);
    const b = new ScriptedAdapter([page([message], 'c1')]);

    await engine.syncAccount(account({ id: 'acc-1' }), a, null);
    await engine.syncAccount(account({ id: 'acc-2' }), b, null);

    expect(await store.findByProviderMessage('tenant-a', 'acc-1', message.providerMessageId!)).not.toBeNull();
    expect(await store.findByProviderMessage('tenant-a', 'acc-2', message.providerMessageId!)).not.toBeNull();
  });

  it('does not leak an imported message into another tenant', async () => {
    const message = incoming();
    const { engine, store } = harness([page([message], 'c1')]);
    await engine.syncAccount(account(), new ScriptedAdapter([page([message], 'c1')]), null);

    expect(await store.findByProviderMessage('tenant-b', 'acc-1', message.providerMessageId!)).toBeNull();
    expect(await store.list('tenant-b', { address: 'alice@aura.example', folder: 'inbox' })).toHaveLength(0);
  });
});

describe('cursor and paging', () => {
  it('advances the cursor only after its page is imported, and resumes from it', async () => {
    const first = incoming();
    const second = incoming();
    const adapter = new ScriptedAdapter([page([first], 'c1', true), page([second], 'c2', false)]);
    const { engine, store } = harness([]);

    const outcome = await engine.syncAccount(account(), adapter, null);

    expect(outcome.pages).toBe(2);
    expect(outcome.imported).toBe(2);
    expect(outcome.cursor?.token).toBe('c2');
    // The second call resumed from the first page's cursor rather than starting over.
    expect(adapter.calls).toEqual([null, 'c1']);
    expect(await store.list('tenant-a', { address: 'alice@aura.example', folder: 'inbox' })).toHaveLength(2);
  });

  it('stops paging when the provider says there is no more', async () => {
    const adapter = new ScriptedAdapter([page([incoming()], 'c1', false)]);
    const { engine } = harness([]);
    const outcome = await engine.syncAccount(account(), adapter, null);
    expect(outcome.pages).toBe(1);
  });
});

describe('thread mapping', () => {
  it('joins a message to an existing conversation by provider thread id', async () => {
    const first = incoming({ providerThreadId: 'ptr-9' });
    const reply = incoming({ providerThreadId: 'ptr-9' });
    const { engine, store } = harness([]);

    await engine.syncAccount(account(), new ScriptedAdapter([page([first], 'c1')]), null);
    await engine.syncAccount(account(), new ScriptedAdapter([page([reply], 'c2')]), null);

    const stored = await store.findByProviderMessage('tenant-a', 'acc-1', reply.providerMessageId!);
    const original = await store.findByProviderMessage('tenant-a', 'acc-1', first.providerMessageId!);
    expect(stored!.threadId).toBe(original!.threadId);
  });

  it('falls back to In-Reply-To when the provider gives no thread id', async () => {
    const first = incoming({ providerThreadId: null, internetMessageId: '<root@example.com>' });
    const reply = incoming({ providerThreadId: null, inReplyTo: '<root@example.com>' });
    const { engine, store } = harness([]);

    await engine.syncAccount(account(), new ScriptedAdapter([page([first], 'c1')]), null);
    await engine.syncAccount(account(), new ScriptedAdapter([page([reply], 'c2')]), null);

    const original = await store.findByProviderMessage('tenant-a', 'acc-1', first.providerMessageId!);
    const stored = await store.findByProviderMessage('tenant-a', 'acc-1', reply.providerMessageId!);
    expect(stored!.threadId).toBe(original!.threadId);
  });

  it('uses References when In-Reply-To is absent', async () => {
    const root = incoming({ providerThreadId: null, internetMessageId: '<r1@example.com>' });
    const later = incoming({ providerThreadId: null, referencesHeader: '<r0@example.com> <r1@example.com>' });
    const { engine, store } = harness([]);

    await engine.syncAccount(account(), new ScriptedAdapter([page([root], 'c1')]), null);
    await engine.syncAccount(account(), new ScriptedAdapter([page([later], 'c2')]), null);

    const original = await store.findByProviderMessage('tenant-a', 'acc-1', root.providerMessageId!);
    const stored = await store.findByProviderMessage('tenant-a', 'acc-1', later.providerMessageId!);
    expect(stored!.threadId).toBe(original!.threadId);
  });

  it('starts a new thread rather than guessing by subject', async () => {
    const first = incoming({ providerThreadId: null, subject: 'Quotation' });
    // Same subject, unrelated conversation, nothing linking them.
    const unrelated = incoming({ providerThreadId: null, subject: 'Quotation' });
    const { engine, store } = harness([]);

    await engine.syncAccount(account(), new ScriptedAdapter([page([first], 'c1')]), null);
    await engine.syncAccount(account(), new ScriptedAdapter([page([unrelated], 'c2')]), null);

    const a = await store.findByProviderMessage('tenant-a', 'acc-1', first.providerMessageId!);
    const b = await store.findByProviderMessage('tenant-a', 'acc-1', unrelated.providerMessageId!);
    // Merging on subject would silently join unrelated conversations — worse than a thread too many.
    expect(b!.threadId).not.toBe(a!.threadId);
  });
});

describe('refusals', () => {
  it('will not sync an account whose provider cannot fetch', async () => {
    const { engine } = harness([]);
    const outcome = await engine.syncAccount(
      account({ provider: 'aura-internal', capabilities: ['send'] }),
      new AuraInternalMailAdapter(),
      null,
    );
    expect(outcome.imported).toBe(0);
    expect(outcome.error).toMatch(/does not support fetch_messages/);
  });

  it('will not sync a disconnected account', async () => {
    const { engine, adapter } = harness([page([incoming()], 'c1')]);
    const outcome = await engine.syncAccount(account({ status: 'error' }), adapter, null);
    expect(outcome.imported).toBe(0);
    expect(outcome.error).toBe('account is error');
  });

  it('refuses inbound attachments carrying inline bytes instead of a document reference', async () => {
    const { engine } = harness([]);
    const withBytes = {
      ...incoming(),
      attachments: [{ name: 'quote.pdf', dataUrl: 'data:application/pdf;base64,AAA', documentId: null }],
    } as unknown as MailRecord;
    // Communication is not a file store; the document module owns bytes, versions and permissions.
    await expect(engine.importOne(account(), withBytes)).rejects.toThrow(/must reference a document/);
  });
});

describe('a failure mid-page never advances the checkpoint', () => {
  it('keeps the last completed page’s cursor so the broken page is read again', async () => {
    const good = incoming();
    // Second page contains a message with no provider identity — importOne refuses it, which
    // stands in for any mid-page failure.
    const broken = incoming({ providerMessageId: null });
    const adapter = new ScriptedAdapter([page([good], 'c1', true), page([broken], 'c2', true)]);
    const { engine, store } = harness([]);

    const outcome = await engine.syncAccount(account(), adapter, null);

    expect(outcome.imported).toBe(1);
    expect(outcome.error).toMatch(/could never be deduplicated/);
    // c1 completed; c2 did not. Resuming from c1 re-reads the broken page — safe, because a
    // re-read deduplicates. Resuming from c2 would have skipped it forever.
    expect(outcome.cursor?.token).toBe('c1');
    expect(await store.list('tenant-a', { address: 'alice@aura.example', folder: 'inbox' })).toHaveLength(1);
  });

  it('reports the error without treating it as the checkpoint', async () => {
    const adapter = new ScriptedAdapter([page([incoming({ providerMessageId: null })], 'c1')]);
    const { engine } = harness([]);
    const outcome = await engine.syncAccount(account(), adapter, null);
    // Nothing completed, so the cursor is exactly what we started with.
    expect(outcome.cursor).toBeNull();
    expect(outcome.error).toBeTruthy();
  });
});
