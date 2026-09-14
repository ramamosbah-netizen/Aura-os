import { describe, expect, it, vi } from 'vitest';
import { makeDocument } from '@aura/shared';
import { makeTender, type TenderService } from '@aura/tendering';
import type { AccessService, DocumentAccessResolver } from '@aura/core';
import { TenderStudyDocumentAccessProvider } from './tender-study-document-access.provider';

const actor = (userId: string, tenantId = 'tenant-1') => ({ userId, tenantId, companyId: 'company-1' });

function harness(allowed = true) {
  const tender = makeTender({ tenantId: 'tenant-1', companyId: 'company-1', title: 'CCTV Tender' });
  const resolver = { registerContextProvider: vi.fn() } as unknown as DocumentAccessResolver;
  const tenders = { get: vi.fn().mockResolvedValue(tender) } as unknown as TenderService;
  const access = { can: vi.fn().mockReturnValue({ allowed }) } as unknown as AccessService;
  const provider = new TenderStudyDocumentAccessProvider(resolver, tenders, access);
  const document = makeDocument({
    tenantId: tender.tenantId, companyId: tender.companyId, kind: 'drawing', title: 'CCTV Layout',
    aggregateType: 'tendering.tender', aggregateId: tender.id, createdBy: 'presales-1',
  });
  return { provider, resolver, tenders, access, tender, document };
}

describe('TenderStudyDocumentAccessProvider', () => {
  it('registers the canonical Tender context provider', () => {
    const { provider, resolver } = harness();
    provider.onModuleInit();
    expect(resolver.registerContextProvider).toHaveBeenCalledWith(provider);
  });

  it('grants read/download from the functional tender study permission', async () => {
    const { provider, access, document, tender } = harness(true);
    await expect(provider.grantsFor(document, actor('reviewer-1'))).resolves.toEqual(['VIEW', 'DOWNLOAD']);
    expect(access.can).toHaveBeenCalledWith('reviewer-1', {
      permission: 'tendering.study.read',
      orgPath: [{ level: 'tenant', id: tender.tenantId }, { level: 'company', id: tender.companyId }],
    });
  });

  it('does not grant without functional permission or for another aggregate', async () => {
    const denied = harness(false);
    await expect(denied.provider.grantsFor(denied.document, actor('unrelated-1'))).resolves.toEqual([]);
    await expect(denied.provider.grantsFor({ ...denied.document, aggregateType: 'crm.opportunity' }, actor('reviewer-1'))).resolves.toEqual([]);
  });

  it('denies cross-tenant documents even when the permission service allows', async () => {
    const { provider, document } = harness(true);
    await expect(provider.grantsFor(document, actor('reviewer-1', 'tenant-2'))).resolves.toEqual([]);
  });
});
