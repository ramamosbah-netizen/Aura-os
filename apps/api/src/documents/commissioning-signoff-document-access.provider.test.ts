import { describe, expect, it, vi } from 'vitest';
import { makeDocument } from '@aura/shared';
import type { AccessService, DocumentAccessResolver } from '@aura/core';
import type { CommissioningService } from '@aura/commissioning';
import { CommissioningSignoffDocumentAccessProvider } from './commissioning-signoff-document-access.provider';

/**
 * A witness's signature belongs to the system it signed off, not to whoever held the tablet.
 *
 * `DmsService` creates the document with no shares, so the T&C engineer who recorded the sign-off
 * would be its only reader — while the QA/QC manager checking the pack, the Handover/FM user
 * assembling the dossier and the PM answering a defects claim can all see THAT a system was
 * witnessed and none of them could open what the witness signed.
 */

const actor = (userId: string, tenantId = 'tenant-1') => ({ userId, tenantId, companyId: 'company-1' });

function harness(opts: { allowed?: boolean; record?: unknown } = {}) {
  const record = 'record' in opts ? opts.record : { id: 'rec-1', tenantId: 'tenant-1', code: 'TC-CCTV-01' };
  const resolver = { registerContextProvider: vi.fn() } as unknown as DocumentAccessResolver;
  const commissioning = { get: vi.fn().mockResolvedValue(record) } as unknown as CommissioningService;
  const can = vi.fn().mockReturnValue({ allowed: opts.allowed ?? true, reason: '' });
  const access = { can } as unknown as AccessService;
  const provider = new CommissioningSignoffDocumentAccessProvider(resolver, commissioning, access);
  const document = makeDocument({
    tenantId: 'tenant-1', companyId: 'company-1', kind: 'signature', title: 'TC-CCTV-01 sign-off — witness',
    aggregateType: 'commissioning.record', aggregateId: 'rec-1', createdBy: 'u-e2e-tc',
  });
  return { provider, resolver, commissioning, access, can, document };
}

describe('CommissioningSignoffDocumentAccessProvider', () => {
  it('registers itself as a DMS context provider', () => {
    const { provider, resolver } = harness();
    provider.onModuleInit();
    expect(resolver.registerContextProvider).toHaveBeenCalledWith(provider);
  });

  it('lets somebody other than the recorder open the witness signature', async () => {
    // NOT the T&C engineer who recorded it. That is the case DMS refuses without this provider,
    // and it is the one that matters: the handover dossier rests on this signature.
    const { provider, document } = harness({ allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-qaqc'))).resolves.toEqual(['VIEW', 'DOWNLOAD']);
  });

  it('refuses whoever may not read the commissioning record', async () => {
    const { provider, document } = harness({ allowed: false });
    await expect(provider.grantsFor(document, actor('u-e2e-store'))).resolves.toEqual([]);
  });

  it('asks for the SAME permission the record route is governed by', async () => {
    // Naming anything else here would grant the file on a permission that opens nothing else, and
    // the two would drift apart in silence.
    const { provider, document, can } = harness();
    await provider.grantsFor(document, actor('u-e2e-qaqc'));
    expect(can).toHaveBeenCalledWith('u-e2e-qaqc', expect.objectContaining({ permission: 'commissioning.record.read' }));
  });

  it('grants VIEW and DOWNLOAD, never EDIT', async () => {
    // Replacing the image a consultant signed is not a reading action.
    const { provider, document } = harness();
    expect(await provider.grantsFor(document, actor('u-e2e-qaqc'))).not.toContain('EDIT');
  });

  it('says nothing about documents that are not commissioning evidence', async () => {
    const { provider } = harness();
    const other = makeDocument({
      tenantId: 'tenant-1', companyId: 'company-1', kind: 'signature', title: 'Supervisor sign-off',
      aggregateType: 'site.daily-report', aggregateId: 'report-1', createdBy: 'u-e2e-site',
    });
    await expect(provider.grantsFor(other, actor('u-e2e-qaqc'))).resolves.toEqual([]);
  });

  it('refuses when the record does not resolve, rather than falling through to the permission', async () => {
    const { provider, document, can } = harness({ record: null, allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-qaqc'))).resolves.toEqual([]);
    expect(can).not.toHaveBeenCalled();
  });

  it('refuses a record belonging to another tenant', async () => {
    const { provider, document } = harness({ record: { id: 'rec-1', tenantId: 'tenant-2' }, allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-qaqc'))).resolves.toEqual([]);
  });
});
