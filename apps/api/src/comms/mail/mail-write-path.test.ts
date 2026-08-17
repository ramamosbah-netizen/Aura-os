import { describe, expect, it, vi } from 'vitest';
import type { NotificationService } from '@aura/core';
import { CommsService } from '../comms.service';
import { InMemoryCommsStore } from '../in-memory-comms-store';
import type { WorkspaceConfigService } from '../../workspace/workspace-config.service';
import { InMemoryMailStore } from './in-memory-mail-store';
import { MailService } from './mail.service';

/**
 * One write path for mail (C3.1 cutover).
 *
 * Before this, the legacy /comms/mail endpoint created mail with its own SQL while MailService
 * created it another way. Two writers of one concept is how the old and new models drift apart
 * while every individual test still passes — so this asserts the property directly: whichever door
 * a message comes through, it lands as the same canonical shape.
 */
function harness() {
  const commsStore = new InMemoryCommsStore();
  const mailStore = new InMemoryMailStore();
  const workspace = { get: vi.fn().mockResolvedValue({ assignments: { 'u-alice': 'finance', 'u-bob': 'finance' } }) } as unknown as WorkspaceConfigService;
  const notifications = { record: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationService;
  return {
    legacy: new CommsService(workspace, notifications, commsStore, mailStore),
    modern: new MailService(mailStore),
    mailStore,
  };
}

describe('mail has exactly one write path', () => {
  it('the legacy endpoint produces canonical participants, not just a legacy row', async () => {
    const { legacy, mailStore } = harness();
    const sent = await legacy.sendMail('tenant-a', { from: 'u-alice', to: ['u-bob'], subject: 'Legacy', body: 'via the old door' });
    expect('error' in sent).toBe(false);

    const stored = await mailStore.get('tenant-a', (sent as { id: string }).id);
    expect(stored, 'legacy mail must exist in the canonical store').not.toBeNull();
    expect(stored!.participants.map((p) => p.role).sort()).toEqual(['from', 'to']);
    // An AURA username is never written as an address.
    expect(stored!.participants.every((p) => p.address === null)).toBe(true);
    expect(stored!.participants.find((p) => p.role === 'to')?.userId).toBe('u-bob');
    expect(stored!.state).toBe('sent');
  });

  it('both doors produce the same canonical shape', async () => {
    const { legacy, modern, mailStore } = harness();
    const viaLegacy = await legacy.sendMail('tenant-a', { from: 'u-alice', to: ['u-bob'], subject: 'A', body: 'x' });
    const viaModern = await modern.createDraft(
      { tenantId: 'tenant-a', companyId: null, userId: 'u-alice', address: 'alice@aura.example' },
      { to: [{ role: 'to', address: null, userId: 'u-bob' }], subject: 'B', body: 'y' },
    );

    const a = await mailStore.get('tenant-a', (viaLegacy as { id: string }).id);
    const b = await mailStore.get('tenant-a', viaModern.id);
    expect(Object.keys(a!).sort()).toEqual(Object.keys(b!).sort());
    expect(a!.participants.map((p) => p.role).sort()).toEqual(b!.participants.map((p) => p.role).sort());
  });

  it('the comms store can no longer create mail on its own', () => {
    const store = new InMemoryCommsStore() as unknown as Record<string, unknown>;
    // The independent writer is gone from the type AND the implementation.
    expect(store.addMail).toBeUndefined();
  });
});

describe('mail state after the cutover', () => {
  it('mark read writes read state and the legacy readBy is rebuilt from it', async () => {
    const { legacy, mailStore } = harness();
    const sent = await legacy.sendMail('tenant-a', { from: 'u-alice', to: ['u-bob'], subject: 'Read me', body: 'x' });
    const id = (sent as { id: string }).id;

    // Before reading: only the sender counts as having read it.
    let box = await legacy.mailbox('tenant-a', 'u-bob');
    expect(box.inbox).toHaveLength(1);
    expect(box.unread).toBe(1);

    await legacy.markMailRead('tenant-a', 'u-bob', id);

    // The receipt is read state, not a field that was saved onto the participant.
    const stored = await mailStore.get('tenant-a', id);
    expect(stored!.participants.find((p) => p.userId === 'u-bob')?.readAt).toBeTruthy();
    expect(stored!.participants.find((p) => p.role === 'from')?.readAt ?? null).toBeNull();

    box = await legacy.mailbox('tenant-a', 'u-bob');
    expect(box.unread).toBe(0);
    expect(box.inbox[0]?.readBy).toContain('u-bob');
  });

  it('a saved record cannot smuggle read state back onto the participants', async () => {
    const { mailStore } = harness();
    const caller = { tenantId: 'tenant-a', companyId: null, userId: 'u-alice', address: 'alice@aura.example' };
    const svc = new MailService(mailStore);
    const draft = await svc.createDraft(caller, { to: [{ role: 'to', address: null, userId: 'u-bob' }], body: 'x' });

    await mailStore.save('tenant-a', {
      ...draft,
      participants: draft.participants.map((p) => ({ ...p, readAt: '2020-01-01T00:00:00.000Z' })),
    });

    const reloaded = await mailStore.get('tenant-a', draft.id);
    // readAt is a projection of the reads relation; nobody has read it, so it stays null.
    expect(reloaded!.participants.every((p) => (p.readAt ?? null) === null)).toBe(true);
  });

  it('the legacy projection never exposes a BCC recipient', async () => {
    const { mailStore, legacy } = harness();
    const caller = { tenantId: 'tenant-a', companyId: null, userId: 'u-alice', address: 'alice@aura.example' };
    const svc = new MailService(mailStore);
    const draft = await svc.createDraft(caller, {
      to: [{ role: 'to', address: null, userId: 'u-bob' }],
      bcc: [{ role: 'bcc', address: null, userId: 'u-auditor' }],
      subject: 'Blind', body: 'x',
    });
    await mailStore.save('tenant-a', { ...draft, state: 'sent', sentAt: new Date().toISOString() });

    const box = await legacy.mailbox('tenant-a', 'u-bob');
    const projected = box.inbox.find((m) => m.id === draft.id);
    expect(projected).toBeTruthy();
    // The old shape has one flat to[] with no way to mark a recipient blind, so it carries none.
    expect(projected!.to).not.toContain('u-auditor');
  });
});
