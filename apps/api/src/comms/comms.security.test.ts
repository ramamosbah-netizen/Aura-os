import { NotFoundException } from '@nestjs/common';
import { AccessService, PERMISSIONS_KEY, type NotificationService } from '@aura/core';
import { describe, expect, it, vi } from 'vitest';
import { CommsController } from './comms.controller';
import { CommsService, canAccessChannel } from './comms.service';
import { InMemoryCommsStore } from './in-memory-comms-store';
import { InMemoryMailStore } from './mail/in-memory-mail-store';
import type { WorkspaceConfigService } from '../workspace/workspace-config.service';

/**
 * Negative security tests for Communication (C1/3).
 *
 * These assert what a caller CANNOT reach. Every one of them passed vacuously before the
 * authorization pass existed — the service handed any authenticated caller any channel id — so
 * each is written to fail loudly if the check is ever removed.
 */

const ALICE = 'u-alice';
const BOB = 'u-bob';
const MALLORY = 'u-mallory';
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function makeService() {
  const store = new InMemoryCommsStore();
  const workspace = {
    // Two named staff plus an outsider, so a directory channel exists to be a member of.
    get: vi.fn().mockResolvedValue({ assignments: { [ALICE]: 'finance', [BOB]: 'finance', [MALLORY]: 'hr' } }),
  } as unknown as WorkspaceConfigService;
  const notifications = { record: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationService;
  const mail = new InMemoryMailStore();
  return { service: new CommsService(workspace, notifications, store, mail), store, mail };
}

/** Establish a DM between Alice and Bob carrying one message. */
async function seedDm(service: CommsService) {
  const dm = await service.openDm(TENANT_A, ALICE, BOB);
  const posted = await service.post(TENANT_A, { channelId: dm.id, sender: ALICE, kind: 'text', text: 'private matter' });
  expect('error' in posted).toBe(false);
  return dm;
}

describe('Communication authorization', () => {
  it('notifies the sender once when the DM recipient reads new messages', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const notifications = { record } as unknown as NotificationService;
    const workspace = {
      get: vi.fn().mockResolvedValue({ assignments: { [ALICE]: 'finance', [BOB]: 'finance' } }),
    } as unknown as WorkspaceConfigService;
    const isolated = new CommsService(workspace, notifications, new InMemoryCommsStore(), new InMemoryMailStore());
    const isolatedDm = await isolated.openDm(TENANT_A, ALICE, BOB);
    await isolated.post(TENANT_A, { channelId: isolatedDm.id, sender: ALICE, kind: 'text', text: 'read receipt' });

    await isolated.messages(TENANT_A, BOB, isolatedDm.id);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      userId: ALICE,
      title: expect.stringContaining('read your message'),
      refType: 'chat.read',
    }));
    const reads = record.mock.calls.filter(([input]) => input.refType === 'chat.read');
    await isolated.messages(TENANT_A, BOB, isolatedDm.id);
    const readsAfterPolling = record.mock.calls.filter(([input]) => input.refType === 'chat.read');
    expect(readsAfterPolling).toHaveLength(reads.length);
  });

  it('refuses a third party the DM between two other users', async () => {
    const { service } = makeService();
    const dm = await seedDm(service);

    await expect(service.messages(TENANT_A, MALLORY, dm.id)).rejects.toBeInstanceOf(NotFoundException);
    // And it is not merely hidden from the list — the id itself is unusable.
    await expect(service.post(TENANT_A, { channelId: dm.id, sender: MALLORY, kind: 'text', text: 'butting in' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses an ADMINISTRATOR someone else’s DM — running the platform is not reading it', async () => {
    const { service } = makeService();
    const dm = await seedDm(service);

    await expect(service.messages(TENANT_A, MALLORY, dm.id, true)).rejects.toBeInstanceOf(NotFoundException);
    const listed = await service.channels(TENANT_A, MALLORY, true);
    expect(listed.map((c) => c.id)).not.toContain(dm.id);
  });

  it('keeps a DM visible to both of its participants', async () => {
    const { service } = makeService();
    const dm = await seedDm(service);

    await expect(service.messages(TENANT_A, ALICE, dm.id)).resolves.toHaveLength(1);
    await expect(service.messages(TENANT_A, BOB, dm.id)).resolves.toHaveLength(1);
  });

  it('refuses a non-member a private department channel, and admits a member', async () => {
    const { service } = makeService();
    const forAlice = await service.channels(TENANT_A, ALICE, false);
    const dept = forAlice.find((c) => c.kind === 'department');
    expect(dept, 'the directory should seed a department channel').toBeTruthy();

    // Mallory is in a different department, so the channel is not hers to read.
    await expect(service.messages(TENANT_A, MALLORY, dept!.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.messages(TENANT_A, ALICE, dept!.id)).resolves.toEqual([]);
  });

  it('keeps the company channel open to everyone in the tenant (unchanged behaviour)', async () => {
    const { service } = makeService();
    const company = (await service.channels(TENANT_A, MALLORY, false)).find((c) => c.kind === 'company');
    expect(company).toBeTruthy();
    await expect(service.messages(TENANT_A, MALLORY, company!.id)).resolves.toEqual([]);
  });

  it('does not leak another tenant’s conversation through a known channel id', async () => {
    const { service } = makeService();
    const dm = await seedDm(service);

    // Same id, different tenant: the row is not there, and no error distinguishes it from absent.
    await expect(service.messages(TENANT_B, ALICE, dm.id)).rejects.toBeInstanceOf(NotFoundException);
    const otherTenant = await service.channels(TENANT_B, ALICE, true);
    expect(otherTenant.every((c) => c.kind !== 'dm')).toBe(true);
  });

  it('refuses a non-participant another user’s mail, and lets both parties read it', async () => {
    const { service } = makeService();
    const sent = await service.sendMail(TENANT_A, { from: ALICE, to: [BOB], subject: 'Salary review', body: 'confidential' });
    expect('error' in sent).toBe(false);
    const mailId = (sent as { id: string }).id;

    await expect(service.markMailRead(TENANT_A, MALLORY, mailId)).rejects.toBeInstanceOf(NotFoundException);
    const mallorysBox = await service.mailbox(TENANT_A, MALLORY);
    expect([...mallorysBox.inbox, ...mallorysBox.sent]).toHaveLength(0);

    await expect(service.markMailRead(TENANT_A, BOB, mailId)).resolves.toBeUndefined();
    expect((await service.mailbox(TENANT_A, BOB)).inbox).toHaveLength(1);
    expect((await service.mailbox(TENANT_A, ALICE)).sent).toHaveLength(1);
  });

  it('does not leak mail across tenants by id', async () => {
    const { service } = makeService();
    const sent = await service.sendMail(TENANT_A, { from: ALICE, to: [BOB], subject: 'A', body: 'b' });
    const mailId = (sent as { id: string }).id;

    await expect(service.markMailRead(TENANT_B, ALICE, mailId)).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.mailbox(TENANT_B, BOB)).inbox).toHaveLength(0);
  });

  it('marks the unread badge from the reader’s own position, not the tenant’s', async () => {
    const { service } = makeService();
    const dm = await seedDm(service);
    // Alice sent it, so it is read for her and unread for Bob.
    expect((await service.unread(TENANT_A, ALICE, false)).chat).toBe(0);
    expect((await service.unread(TENANT_A, BOB, false)).chat).toBe(1);
    await service.messages(TENANT_A, BOB, dm.id);
    expect((await service.unread(TENANT_A, BOB, false)).chat).toBe(0);
  });
});

describe('Company isolation', () => {
  const COMPANY_A = 'company-a';
  const COMPANY_B = 'company-b';

  /**
   * Driven with explicit company values rather than through a session, deliberately.
   * `auth.controller` mints `companyId: null` and `verify()` falls back to null when the IdP
   * sends no company claim, so every session today carries null. A test that went through login
   * would compare null to null, pass, and prove nothing.
   */
  it('refuses a company-A caller a channel stamped for company B', async () => {
    const { service, store } = makeService();
    await store.ensureChannels(TENANT_A, [{ id: 'ch-b-only', kind: 'department', name: 'B Only', members: [ALICE] }], BOB, COMPANY_B);

    // Alice is a MEMBER, and it still refuses her — company is checked before membership.
    await expect(service.messages(TENANT_A, ALICE, 'ch-b-only', false, COMPANY_A)).rejects.toBeInstanceOf(NotFoundException);
    // Even as an administrator of company A.
    await expect(service.messages(TENANT_A, ALICE, 'ch-b-only', true, COMPANY_A)).rejects.toBeInstanceOf(NotFoundException);
    const listed = await service.channels(TENANT_A, ALICE, true, COMPANY_A);
    expect(listed.map((c) => c.id)).not.toContain('ch-b-only');
  });

  it('admits the caller from the owning company', async () => {
    const { service, store } = makeService();
    await store.ensureChannels(TENANT_A, [{ id: 'ch-b-only', kind: 'department', name: 'B Only', members: [ALICE] }], BOB, COMPANY_B);
    await expect(service.messages(TENANT_A, ALICE, 'ch-b-only', false, COMPANY_B)).resolves.toEqual([]);
  });

  it('keeps tenant-global channels readable regardless of the caller company', async () => {
    const { service } = makeService();
    // The seeded directory channels carry no company, so a company scope must not hide them.
    const forA = await service.channels(TENANT_A, ALICE, false, COMPANY_A);
    expect(forA.some((c) => c.kind === 'company')).toBe(true);
  });

  it('refuses a company-B caller a DM created inside company A', async () => {
    const { service, store } = makeService();
    const dm = { id: 'dm:u-alice|u-bob', kind: 'dm' as const, name: 'Bob', members: [ALICE, BOB] };
    await store.ensureChannels(TENANT_A, [dm], ALICE, COMPANY_A);
    await expect(service.messages(TENANT_A, ALICE, dm.id, false, COMPANY_B)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.messages(TENANT_A, ALICE, dm.id, false, COMPANY_A)).resolves.toEqual([]);
  });

  it('only offers active people in the caller company for new private chats', async () => {
    const store = new InMemoryCommsStore();
    const workspace = {
      users: vi.fn().mockResolvedValue([
        { username: ALICE, roleLabel: 'Finance' },
        { username: BOB, roleLabel: 'Finance' },
        { username: MALLORY, roleLabel: 'HR' },
      ]),
      get: vi.fn().mockResolvedValue({ assignments: { [ALICE]: 'finance', [BOB]: 'finance', [MALLORY]: 'hr' } }),
    } as unknown as WorkspaceConfigService;
    const registry = {
      ensureTenant: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockReturnValue([
        { userId: ALICE, companyId: COMPANY_A, active: true },
        { userId: BOB, companyId: COMPANY_A, active: true },
        { userId: MALLORY, companyId: COMPANY_B, active: true },
      ]),
      get: vi.fn((tenant: string, user: string) => ({ tenantId: tenant, userId: user, companyId: user === MALLORY ? COMPANY_B : COMPANY_A, active: true })),
    };
    const service = new CommsService(workspace, { record: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationService, store, new InMemoryMailStore(), registry as never);

    expect(await service.people(TENANT_A, ALICE, COMPANY_A)).toEqual([
      { username: BOB, roleLabel: 'Finance', companyId: COMPANY_A },
    ]);
    await expect(service.openDm(TENANT_A, ALICE, MALLORY, COMPANY_A)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Attachments inherit their parent authorization', () => {
  it('does not hand a file message to a non-participant, and does hand it to a participant', async () => {
    const { service } = makeService();
    const dm = await service.openDm(TENANT_A, ALICE, BOB);
    const posted = await service.post(TENANT_A, {
      channelId: dm.id,
      sender: ALICE,
      kind: 'file',
      attachment: { name: 'payslip.pdf', mime: 'application/pdf', size: 1024, dataUrl: 'data:application/pdf;base64,AAAA' },
    });
    expect('error' in posted).toBe(false);

    // The attachment travels inside the message, so refusing the message refuses the bytes —
    // there is no second door to the file.
    await expect(service.messages(TENANT_A, MALLORY, dm.id)).rejects.toBeInstanceOf(NotFoundException);

    const forBob = await service.messages(TENANT_A, BOB, dm.id);
    expect(forBob[0]?.attachment?.name).toBe('payslip.pdf');
  });

  it('aggregates only attachments from conversations visible to the caller', async () => {
    const { service } = makeService();
    const privateDm = await service.openDm(TENANT_A, ALICE, BOB);
    const company = (await service.channels(TENANT_A, ALICE, false)).find((c) => c.kind === 'company');
    expect(company).toBeTruthy();

    await service.post(TENANT_A, {
      channelId: privateDm.id,
      sender: ALICE,
      kind: 'file',
      attachment: { name: 'private.pdf', mime: 'application/pdf', size: 12, dataUrl: 'data:application/pdf;base64,PRIVATE' },
    });
    await service.post(TENANT_A, {
      channelId: company!.id,
      sender: ALICE,
      kind: 'file',
      attachment: { name: 'shared.pdf', mime: 'application/pdf', size: 12, dataUrl: 'data:application/pdf;base64,SHARED' },
    });

    expect((await service.files(TENANT_A, BOB, false)).map((file) => file.name)).toEqual(expect.arrayContaining(['shared.pdf', 'private.pdf']));
    expect((await service.files(TENANT_A, BOB, false)).map((file) => file.name)).toHaveLength(2);
    expect((await service.files(TENANT_A, MALLORY, false)).map((file) => file.name)).toEqual(['shared.pdf']);
  });
});

describe('Ordinary non-admin roles keep working (positive regression)', () => {
  it('lets a plain member send and read in their own department channel and DMs', async () => {
    const { service } = makeService();
    const dept = (await service.channels(TENANT_A, ALICE, false)).find((c) => c.kind === 'department');

    const sent = await service.post(TENANT_A, { channelId: dept!.id, sender: ALICE, kind: 'text', text: 'standup at 9' });
    expect('error' in sent).toBe(false);
    await expect(service.messages(TENANT_A, BOB, dept!.id)).resolves.toHaveLength(1);

    const dm = await service.openDm(TENANT_A, ALICE, BOB);
    const dmMsg = await service.post(TENANT_A, { channelId: dm.id, sender: BOB, kind: 'text', text: 'ack' });
    expect('error' in dmMsg).toBe(false);

    const mail = await service.sendMail(TENANT_A, { from: ALICE, to: [BOB], subject: 'Notes', body: 'attached' });
    expect('error' in mail).toBe(false);
    expect((await service.mailbox(TENANT_A, BOB)).inbox).toHaveLength(1);
    // No admin flag anywhere above: none of this needs one.
  });
});

describe('Route permissions', () => {
  /**
   * The guard DERIVES a permission from the route when none is declared, and the derived names
   * (`comms.channel.read`, `comms.channel.messages`, …) were held by no standard role — so with
   * auth on, chat and mail were already refused to everyone but a wildcard admin. Declaring them
   * explicitly makes the required capability reviewable instead of an artefact of the URL shape.
   */
  it.each([
    ['channels', 'comms.channel.read'],
    ['people', 'comms.channel.read'],
    ['files', 'comms.channel.read'],
    ['openDm', 'comms.dm.create'],
    ['messages', 'comms.channel.read'],
    ['post', 'comms.channel.send'],
    ['mailbox', 'comms.mail.read'],
    ['sendMail', 'comms.mail.send'],
    ['markRead', 'comms.mail.read'],
    ['unread', 'comms.channel.read'],
  ])('%s requires %s', (handler, permission) => {
    const fn = (CommsController.prototype as unknown as Record<string, () => unknown>)[handler];
    expect(Reflect.getMetadata(PERMISSIONS_KEY, fn), `${handler} must declare a permission`).toEqual([permission]);
  });

  it('grants the baseline capability to every standard role, so ordinary staff can communicate', () => {
    const access = new AccessService();
    access.seedStandardRoles();
    const roles = ['r-sales', 'r-sales-manager', 'r-pm', 'r-site-engineer', 'r-qa-qc', 'r-hse', 'r-procurement', 'r-store', 'r-finance'];
    for (const roleId of roles) {
      access.grant({ userId: `u-${roleId}`, roleId, scope: { kind: 'org', level: 'tenant', id: TENANT_A } });
      const decision = access.can(`u-${roleId}`, {
        permission: 'comms.channel.read',
        orgPath: [{ level: 'tenant', id: TENANT_A }],
      });
      expect(decision.allowed, `${roleId} must be able to use Communication`).toBe(true);
    }
  });

  it('still refuses a role that holds no comms capability at all', () => {
    const access = new AccessService();
    access.registerRole({ id: 'r-kiosk', name: 'Kiosk', permissions: ['site.read'] });
    access.grant({ userId: 'u-kiosk', roleId: 'r-kiosk', scope: { kind: 'org', level: 'tenant', id: TENANT_A } });
    expect(access.can('u-kiosk', {
      permission: 'comms.channel.read',
      orgPath: [{ level: 'tenant', id: TENANT_A }],
    }).allowed).toBe(false);
  });
});

describe('canAccessChannel', () => {
  const dm = { id: 'dm:u-alice|u-bob', kind: 'dm' as const, name: 'Bob', members: [ALICE, BOB], companyId: null };
  const team = { id: 'ch-dept-finance', kind: 'department' as const, name: 'Finance', members: [ALICE], companyId: null };
  const all = { id: 'ch-company', kind: 'company' as const, name: 'All company', members: [], companyId: null };

  it.each([
    ['participant on a dm', dm, ALICE, false, true],
    ['stranger on a dm', dm, MALLORY, false, false],
    ['admin on someone else’s dm', dm, MALLORY, true, false],
    ['member on a department channel', team, ALICE, false, true],
    ['non-member on a department channel', team, MALLORY, false, false],
    ['admin on a department channel', team, MALLORY, true, true],
    ['anyone on the company channel', all, MALLORY, false, true],
  ])('%s', (_label, channel, user, isAdmin, expected) => {
    expect(canAccessChannel(channel, user, isAdmin)).toBe(expected);
  });
});
