import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AccessService } from '@aura/core';
import { InMemoryMailStore } from './in-memory-mail-store';
import { MailService, type MailCaller } from './mail.service';
import type { MailRecordDirectory } from './mail-record-directory';

/**
 * MAIL-03…MAIL-07 — a message knows the business records it is about, and a record lists the linked
 * messages its viewer could already read. Linking widens nothing.
 */

const ALICE: MailCaller = { tenantId: 'tenant-a', companyId: null, userId: 'u-alice', address: 'alice@aura.example' };
const BOB: MailCaller = { tenantId: 'tenant-a', companyId: null, userId: 'u-bob', address: 'bob@aura.example' };
const MALLORY: MailCaller = { tenantId: 'tenant-a', companyId: null, userId: 'u-mallory', address: 'mallory@aura.example' };

const TENDER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';

const directory: MailRecordDirectory = {
  async labelOf(tenantId, type, id) {
    if (tenantId !== 'tenant-a') return null;
    if (type === 'tendering.tender' && id === TENDER) return 'Marina Heights — ELV';
    if (type === 'projects.project' && id === PROJECT) return 'Marina Heights delivery';
    return null;
  },
};
/** Mallory may read nothing; everyone else may read everything. */
const access = {
  can: (userId: string) => ({ allowed: userId !== 'u-mallory' }),
} as unknown as AccessService;

function service(withDirectory = true) {
  const store = new InMemoryMailStore();
  return { svc: new MailService(store, null, null, withDirectory ? directory : null, withDirectory ? access : null), store };
}

describe('MAIL-03…07 — linking a message to the records it is about', () => {
  it('a draft composed from a record carries the link, with the record named', async () => {
    const { svc } = service();
    const draft = await svc.createDraft(ALICE, { to: ['bob@aura.example'], subject: 'Clarification' }, [{ recordType: 'tendering.tender', recordId: TENDER }]);
    expect(draft.links).toEqual([expect.objectContaining({ recordType: 'tendering.tender', recordId: TENDER, recordLabel: 'Marina Heights — ELV', linkedBy: 'u-alice' })]);
  });

  it('refuses an unknown kind, a missing record and a record the composer may not read — before writing anything', async () => {
    const { svc, store } = service();
    await expect(svc.createDraft(ALICE, { subject: 'x' }, [{ recordType: 'hr.payslip' as never, recordId: TENDER }])).rejects.toThrow('cannot be linked');
    await expect(svc.createDraft(ALICE, { subject: 'x' }, [{ recordType: 'tendering.tender', recordId: PROJECT }])).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.createDraft(MALLORY, { subject: 'x' }, [{ recordType: 'tendering.tender', recordId: TENDER }])).rejects.toBeInstanceOf(NotFoundException);
    expect(await store.list('tenant-a', { folder: 'drafts', userId: 'u-alice' })).toHaveLength(0);
    expect(await store.list('tenant-a', { folder: 'drafts', userId: 'u-mallory' })).toHaveLength(0);
  });

  it('refuses outright when no directory is composed, rather than linking a record nobody checked', async () => {
    const { svc } = service(false);
    await expect(svc.createDraft(ALICE, { subject: 'x' }, [{ recordType: 'tendering.tender', recordId: TENDER }])).rejects.toBeInstanceOf(ConflictException);
  });

  it('a record lists only what its viewer could already read: the author\'s draft is the author\'s alone', async () => {
    const { svc } = service();
    await svc.createDraft(ALICE, { to: ['bob@aura.example'], subject: 'Draft about the tender' }, [{ recordType: 'tendering.tender', recordId: TENDER }]);
    expect((await svc.related(ALICE, { recordType: 'tendering.tender', recordId: TENDER })).map((m) => m.subject)).toEqual(['Draft about the tender']);
    expect(await svc.related(BOB, { recordType: 'tendering.tender', recordId: TENDER }), 'a recipient on an unsent draft has been sent nothing').toEqual([]);
  });

  it('once sent, the recipient sees it on the record too — and a reader of the record who is not on it does not', async () => {
    const { svc, store } = service();
    const draft = await svc.createDraft(ALICE, { to: ['bob@aura.example'], subject: 'Sent about the project' }, [{ recordType: 'projects.project', recordId: PROJECT }]);
    await store.save(ALICE.tenantId, { ...draft, state: 'sent', sentAt: new Date().toISOString() });
    expect((await svc.related(BOB, { recordType: 'projects.project', recordId: PROJECT })).map((m) => m.subject)).toEqual(['Sent about the project']);
    const carol: MailCaller = { tenantId: 'tenant-a', companyId: null, userId: 'u-carol', address: 'carol@aura.example' };
    expect(await svc.related(carol, { recordType: 'projects.project', recordId: PROJECT }), 'linking widens nothing').toEqual([]);
    await expect(svc.related(MALLORY, { recordType: 'projects.project', recordId: PROJECT }), 'a record one may not read is not found').rejects.toBeInstanceOf(NotFoundException);
  });

  it('a message can be linked afterwards by someone who can see it; linking twice is one link', async () => {
    const { svc, store } = service();
    const draft = await svc.createDraft(ALICE, { to: ['bob@aura.example'], subject: 'Received later' });
    await store.save(ALICE.tenantId, { ...draft, state: 'sent', sentAt: new Date().toISOString() });
    await svc.linkRecord(BOB, draft.id, { recordType: 'tendering.tender', recordId: TENDER });
    const twice = await svc.linkRecord(BOB, draft.id, { recordType: 'tendering.tender', recordId: TENDER });
    expect(twice.links).toHaveLength(1);
    await expect(svc.linkRecord(MALLORY, draft.id, { recordType: 'tendering.tender', recordId: TENDER }), 'a message one cannot see cannot be linked').rejects.toBeInstanceOf(NotFoundException);
  });

  it('an edit never rewrites the links, and deleting the draft removes them', async () => {
    const { svc } = service();
    const draft = await svc.createDraft(ALICE, { subject: 'To be dropped' }, [{ recordType: 'tendering.tender', recordId: TENDER }]);
    const edited = await svc.updateDraft(ALICE, draft.id, { subject: 'Edited' });
    expect(edited.links).toHaveLength(1);
    await svc.deleteDraft(ALICE, draft.id);
    expect(await svc.related(ALICE, { recordType: 'tendering.tender', recordId: TENDER })).toEqual([]);
  });
});
