import { describe, expect, it, vi } from 'vitest';
import { InMemoryMailStore } from '../mail/in-memory-mail-store';
import { InMemoryWhatsAppStore } from './in-memory-whatsapp-store';
import { WhatsAppDispatchWorker } from './whatsapp-dispatch.worker';

function setup(sendText = vi.fn().mockResolvedValue({ externalMessageId: 'wamid-recovered', status: 'sent' as const })) {
  const dispatch = new InMemoryMailStore();
  const store = new InMemoryWhatsAppStore();
  const provider = { isConfigured: () => true, sendText };
  const tenant = { run: (_ctx: unknown, work: () => Promise<unknown>) => work() };
  const worker = new WhatsAppDispatchWorker(dispatch, store, provider as never, tenant as never);
  return { dispatch, store, provider, worker };
}

async function queued(store: InMemoryWhatsAppStore, dispatch: InMemoryMailStore) {
  const thread = await store.ensureThread({ id: 'thread-1', tenantId: 'tenant-a', companyId: null, providerAccountId: 'account-1', channel: 'whatsapp', displayName: 'Customer', phone: '+971500000001', externalConversationId: '971500000001', contactId: null, accountId: null, ownerId: 'u-1' });
  const inserted = await store.insertMessage({ tenantId: 'tenant-a', companyId: null, providerAccountId: thread.providerAccountId, threadId: thread.id, externalMessageId: null, direction: 'outbound', status: 'queued', type: 'text', body: 'after restart', sender: 'u-1', occurredAt: '2026-08-28T10:00:00.000Z' });
  await dispatch.upsertDispatch('tenant-a', { id: 'dispatch-1', subjectType: 'whatsapp', subjectId: inserted.message.id, accountId: thread.providerAccountId, scheduledAt: '2026-08-28T09:59:00.000Z', scheduledTimezone: 'UTC', state: 'pending', attempts: 0 });
  return inserted.message.id;
}

describe('WhatsAppDispatchWorker', () => {
  it('replays a queued message after a process restart', async () => {
    const { dispatch, store, provider, worker } = setup();
    const id = await queued(store, dispatch);
    await expect(worker.drain('2026-08-28T10:00:00.000Z')).resolves.toEqual({ sent: 1, failed: 0 });
    expect(provider.sendText).toHaveBeenCalledWith('+971500000001', 'after restart');
    expect((await store.getMessage('tenant-a', id))?.status).toBe('sent');
    expect((await dispatch.getDispatch('tenant-a', id))?.state).toBe('done');
  });

  it('keeps transient failures queued for the next scheduled attempt', async () => {
    const sendText = vi.fn().mockRejectedValue(new Error('Meta timeout'));
    const { dispatch, store, worker } = setup(sendText);
    const id = await queued(store, dispatch);
    await expect(worker.drain('2026-08-28T10:00:00.000Z')).resolves.toEqual({ sent: 0, failed: 1 });
    expect((await store.getMessage('tenant-a', id))?.status).toBe('queued');
    expect((await dispatch.getDispatch('tenant-a', id))?.state).toBe('pending');
    expect((await dispatch.getDispatch('tenant-a', id))?.lastError).toContain('Meta timeout');
  });
});
