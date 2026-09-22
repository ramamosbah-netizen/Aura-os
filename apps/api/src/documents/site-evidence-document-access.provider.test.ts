import { describe, expect, it, vi } from 'vitest';
import { makeDocument } from '@aura/shared';
import type { AccessService, DocumentAccessResolver } from '@aura/core';
import type { SiteService } from '@aura/site';
import { SiteEvidenceDocumentAccessProvider } from './site-evidence-document-access.provider';

/**
 * A day's evidence belongs to the report, not to whoever held the camera.
 *
 * Measured against the running API before this provider existed, with the site engineer as the
 * author of the photograph: the author got 200 and the PM WHO REVIEWS AND APPROVES THAT REPORT
 * got 403, as did QA/QC and the administrator. All of them could already see the evidence row —
 * description, category, location — and none could open the file it named.
 *
 * The rule is inheritance from the record, so these tests are about the record and the
 * permission, never about who uploaded it.
 */

const actor = (userId: string, tenantId = 'tenant-1') => ({ userId, tenantId, companyId: 'company-1' });

function harness(opts: { allowed?: boolean; report?: unknown } = {}) {
  const report = 'report' in opts ? opts.report : { id: 'report-1', tenantId: 'tenant-1' };
  const resolver = { registerContextProvider: vi.fn() } as unknown as DocumentAccessResolver;
  const site = { getDailyReport: vi.fn().mockResolvedValue(report) } as unknown as SiteService;
  const can = vi.fn().mockReturnValue({ allowed: opts.allowed ?? true, reason: '' });
  const access = { can } as unknown as AccessService;
  const provider = new SiteEvidenceDocumentAccessProvider(resolver, site, access);
  const document = makeDocument({
    tenantId: 'tenant-1', companyId: 'company-1', kind: 'evidence', title: 'L3 riser',
    aggregateType: 'site.daily-report', aggregateId: 'report-1', createdBy: 'u-e2e-site',
  });
  return { provider, resolver, site, access, can, document };
}

describe('SiteEvidenceDocumentAccessProvider', () => {
  it('registers itself as a DMS context provider', () => {
    const { provider, resolver } = harness();
    provider.onModuleInit();
    expect(resolver.registerContextProvider).toHaveBeenCalledWith(provider);
  });

  it('lets the reviewer open what the site engineer attached', async () => {
    // The actor is NOT the author. That is the entire point: this is the case that was 403.
    const { provider, document } = harness({ allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-pm'))).resolves.toEqual(['VIEW', 'DOWNLOAD']);
  });

  it('refuses whoever may not read the day', async () => {
    const { provider, document } = harness({ allowed: false });
    await expect(provider.grantsFor(document, actor('u-e2e-finance'))).resolves.toEqual([]);
  });

  it('asks for the SAME permission the report route is governed by', async () => {
    // Hard-coding a different name here would grant access on a permission nothing else uses,
    // and the two would drift apart silently.
    const { provider, document, can } = harness();
    await provider.grantsFor(document, actor('u-e2e-pm'));
    expect(can).toHaveBeenCalledWith('u-e2e-pm', expect.objectContaining({ permission: 'site.daily-report.read' }));
  });

  it('grants VIEW and DOWNLOAD, never EDIT', async () => {
    // Replacing the photograph on somebody else's signed day is not a review action. The author
    // keeps that through ownership; inheritance must not hand it to every reader.
    const { provider, document } = harness();
    const levels = await provider.grantsFor(document, actor('u-e2e-pm'));
    expect(levels).not.toContain('EDIT');
  });

  it('says nothing about documents that are not site evidence', async () => {
    const { provider } = harness();
    const other = makeDocument({
      tenantId: 'tenant-1', companyId: 'company-1', kind: 'drawing', title: 'Tender drawing',
      aggregateType: 'tendering.tender', aggregateId: 'tender-1', createdBy: 'u-admin',
    });
    await expect(provider.grantsFor(other, actor('u-e2e-pm'))).resolves.toEqual([]);
  });

  it('refuses when the report does not resolve, rather than falling through to the permission', async () => {
    // Belt-and-braces over RLS, as the sibling providers do: a cross-tenant or deleted id must
    // never reach the permission check and answer "allowed".
    const { provider, document, can } = harness({ report: null, allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-pm'))).resolves.toEqual([]);
    expect(can).not.toHaveBeenCalled();
  });

  it('refuses a report belonging to another tenant', async () => {
    const { provider, document } = harness({ report: { id: 'report-1', tenantId: 'tenant-2' }, allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-pm'))).resolves.toEqual([]);
  });
});
