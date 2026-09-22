import { describe, expect, it, vi } from 'vitest';
import { makeDocument } from '@aura/shared';
import type { AccessService, DocumentAccessResolver } from '@aura/core';
import type { QualityService } from '@aura/quality';
import { InspectionEvidenceDocumentAccessProvider } from './inspection-evidence-document-access.provider';

/**
 * An inspection's evidence belongs to the inspection, not to whoever held the camera.
 *
 * `DmsService` creates the document with no shares, so the QA engineer who uploaded it would be
 * its only reader — while an approved inspection accrues a measured quantity on the Quantity
 * Ledger, and the QS valuing it, the PM answering for it and the consultant's counterpart all read
 * this record and none of them could open what the approval rests on.
 */

const actor = (userId: string, tenantId = 'tenant-1') => ({ userId, tenantId, companyId: 'company-1' });

function harness(opts: { allowed?: boolean; inspection?: unknown } = {}) {
  const inspection = 'inspection' in opts ? opts.inspection : { id: 'ir-1', tenantId: 'tenant-1', irNumber: 'IR-001' };
  const resolver = { registerContextProvider: vi.fn() } as unknown as DocumentAccessResolver;
  const quality = {
    readInspection: vi.fn().mockResolvedValue(inspection ? { inspection, evidence: [], signature: null } : null),
  } as unknown as QualityService;
  const can = vi.fn().mockReturnValue({ allowed: opts.allowed ?? true, reason: '' });
  const access = { can } as unknown as AccessService;
  const provider = new InspectionEvidenceDocumentAccessProvider(resolver, quality, access);
  const document = makeDocument({
    tenantId: 'tenant-1', companyId: 'company-1', kind: 'signature', title: 'IR-001 — signed',
    aggregateType: 'quality.inspection-request', aggregateId: 'ir-1', createdBy: 'u-e2e-qaqc',
  });
  return { provider, resolver, quality, access, can, document };
}

describe('InspectionEvidenceDocumentAccessProvider', () => {
  it('registers itself as a DMS context provider', () => {
    const { provider, resolver } = harness();
    provider.onModuleInit();
    expect(resolver.registerContextProvider).toHaveBeenCalledWith(provider);
  });

  it('lets somebody other than the uploader open the evidence', async () => {
    // NOT the QA engineer who uploaded it. That is the case DMS refuses without this provider,
    // and it is the one with money attached: the approved quantity is valued off this record.
    const { provider, document } = harness({ allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-qs'))).resolves.toEqual(['VIEW', 'DOWNLOAD']);
  });

  it('refuses whoever may not read the inspection', async () => {
    const { provider, document } = harness({ allowed: false });
    await expect(provider.grantsFor(document, actor('u-e2e-store'))).resolves.toEqual([]);
  });

  it('asks for the SAME permission the inspection route is governed by', async () => {
    const { provider, document, can } = harness();
    await provider.grantsFor(document, actor('u-e2e-qs'));
    expect(can).toHaveBeenCalledWith('u-e2e-qs', expect.objectContaining({ permission: 'quality.ir.read' }));
  });

  it('grants VIEW and DOWNLOAD, never EDIT', async () => {
    // Replacing the photograph an inspection was approved on is not a reading action.
    const { provider, document } = harness();
    expect(await provider.grantsFor(document, actor('u-e2e-qs'))).not.toContain('EDIT');
  });

  it('says nothing about documents that are not inspection evidence', async () => {
    const { provider } = harness();
    const other = makeDocument({
      tenantId: 'tenant-1', companyId: 'company-1', kind: 'signature', title: 'Supervisor sign-off',
      aggregateType: 'site.daily-report', aggregateId: 'report-1', createdBy: 'u-e2e-site',
    });
    await expect(provider.grantsFor(other, actor('u-e2e-qs'))).resolves.toEqual([]);
  });

  it('refuses when the inspection does not resolve, rather than falling through to the permission', async () => {
    const { provider, document, can } = harness({ inspection: null, allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-qs'))).resolves.toEqual([]);
    expect(can).not.toHaveBeenCalled();
  });

  it('refuses an inspection belonging to another tenant', async () => {
    const { provider, document } = harness({ inspection: { id: 'ir-1', tenantId: 'tenant-2' }, allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-qs'))).resolves.toEqual([]);
  });
});
