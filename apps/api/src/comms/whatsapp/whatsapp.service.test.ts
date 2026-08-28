import { describe, expect, it, vi } from 'vitest';
import { InMemoryWhatsAppStore } from './in-memory-whatsapp-store';
import { WhatsAppService } from './whatsapp.service';

function makeService(store = new InMemoryWhatsAppStore()) {
  const provider = {
    isConfigured: () => true,
    verifySignature: () => true,
    verifyChallenge: () => null,
    sendText: vi.fn().mockResolvedValue({ externalMessageId: 'wamid-out', status: 'sent' }),
    markRead: vi.fn().mockResolvedValue(undefined),
  };
  const service = new WhatsAppService(
    store,
    { publishTimeline: vi.fn().mockResolvedValue(undefined) } as never,
    provider as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    { publish: vi.fn().mockResolvedValue(undefined) } as never,
    { get: vi.fn().mockReturnValue({ tenantId: 't1' }) } as never,
  );
  return { service, store, provider };
}

async function thread(store: InMemoryWhatsAppStore, ownerId: string | null = 'u-owner') {
  const phone = ownerId === null ? '+971500000002' : '+971500000001';
  return store.ensureThread({
    id: `thread-${ownerId ?? 'unassigned'}`,
    tenantId: 't1', companyId: 'company-1', providerAccountId: 'account-1', channel: 'whatsapp',
    displayName: 'Customer', phone, externalConversationId: phone.slice(1),
    contactId: null, accountId: null, ownerId,
  });
}

describe('WhatsAppService resource authorization', () => {
  it('denies direct access to another owner even when the thread id is known', async () => {
    const { service, store } = makeService(); const row = await thread(store, 'u-owner');
    await expect(service.messages('t1', 'company-1', 'u-other', false, row.id)).rejects.toThrow('conversation not found');
    await expect(service.markRead('t1', 'company-1', 'u-other', false, row.id)).rejects.toThrow('conversation not found');
    await expect(service.reply('t1', 'company-1', 'u-other', false, row.id, 'hello')).rejects.toThrow('conversation not found');
  });

  it('allows the assignee and administrators, while keeping unassigned threads claimable', async () => {
    const { service, store } = makeService(); const assigned = await thread(store, 'u-owner'); const open = await thread(store, null);
    await expect(service.messages('t1', 'company-1', 'u-owner', false, assigned.id)).resolves.toEqual([]);
    await expect(service.messages('t1', 'company-1', 'u-admin', true, assigned.id)).resolves.toEqual([]);
    await expect(service.messages('t1', 'company-1', 'u-other', false, open.id)).resolves.toEqual([]);
  });

  it('sends provider read receipts before clearing the local unread state', async () => {
    const { service, store, provider } = makeService(); const row = await thread(store, 'u-owner');
    await store.insertMessage({ tenantId: 't1', companyId: 'company-1', providerAccountId: 'account-1', threadId: row.id, externalMessageId: 'wamid-in', direction: 'inbound', status: 'received', type: 'text', body: 'hello', sender: '+971500000001', occurredAt: new Date().toISOString() });
    await service.markRead('t1', 'company-1', 'u-owner', false, row.id);
    expect(provider.markRead).toHaveBeenCalledWith('wamid-in');
    expect((await store.findThread('t1', row.id))?.unread).toBe(0);
  });
});
