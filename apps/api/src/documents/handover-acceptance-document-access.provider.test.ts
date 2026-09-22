import { describe, expect, it, vi } from 'vitest';
import { makeDocument } from '@aura/shared';
import type { AccessService, DocumentAccessResolver } from '@aura/core';
import type { HandoverService } from '@aura/commissioning';
import { HandoverAcceptanceDocumentAccessProvider } from './handover-acceptance-document-access.provider';

/**
 * The client's signature belongs to the acceptance, not to whoever held the tablet.
 *
 * A document created by `DmsService` carries no shares, so the Handover/FM user who recorded the
 * acceptance would be its only reader — while the Project Manager, the T&C engineer and the
 * commercial team can all see THAT the package was accepted and could not open what was signed.
 * A warranty claim, a defects-liability dispute and a final payment application all turn on this
 * document.
 *
 * The rule is inheritance from the record, so these tests are about the package and the
 * permission, never about who uploaded the image.
 */

const actor = (userId: string, tenantId = 'tenant-1') => ({ userId, tenantId, companyId: 'company-1' });

function harness(opts: { allowed?: boolean; pkg?: unknown } = {}) {
  const pkg = 'pkg' in opts ? opts.pkg : { id: 'ho-1', tenantId: 'tenant-1', code: 'HO-001' };
  const resolver = { registerContextProvider: vi.fn() } as unknown as DocumentAccessResolver;
  const handover = { get: vi.fn().mockResolvedValue(pkg) } as unknown as HandoverService;
  const can = vi.fn().mockReturnValue({ allowed: opts.allowed ?? true, reason: '' });
  const access = { can } as unknown as AccessService;
  const provider = new HandoverAcceptanceDocumentAccessProvider(resolver, handover, access);
  const document = makeDocument({
    tenantId: 'tenant-1', companyId: 'company-1', kind: 'signature', title: 'Client acceptance signature — HO-001',
    aggregateType: 'commissioning.handover', aggregateId: 'ho-1', createdBy: 'u-e2e-fm',
  });
  return { provider, resolver, handover, access, can, document };
}

describe('HandoverAcceptanceDocumentAccessProvider', () => {
  it('registers itself as a DMS context provider', () => {
    const { provider, resolver } = harness();
    provider.onModuleInit();
    expect(resolver.registerContextProvider).toHaveBeenCalledWith(provider);
  });

  it('lets somebody other than the recorder open the signature', async () => {
    // The actor is NOT the Handover/FM user who recorded the acceptance. Without this provider
    // that is the case DMS refuses, and it is the case that matters: the people who need the
    // signed acceptance are the ones settling the warranty and the final account.
    const { provider, document } = harness({ allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-pm'))).resolves.toEqual(['VIEW', 'DOWNLOAD']);
  });

  it('refuses whoever may not read the handover package', async () => {
    const { provider, document } = harness({ allowed: false });
    await expect(provider.grantsFor(document, actor('u-e2e-store'))).resolves.toEqual([]);
  });

  it('asks for the SAME permission the package route is governed by', async () => {
    // The read route carries no `@Permissions`, so the guard derives `commissioning.handover.read`
    // from the path. Naming anything else here would grant the file on a permission that opens
    // nothing else, and the two would drift apart in silence.
    const { provider, document, can } = harness();
    await provider.grantsFor(document, actor('u-e2e-pm'));
    expect(can).toHaveBeenCalledWith('u-e2e-pm', expect.objectContaining({ permission: 'commissioning.handover.read' }));
  });

  it('grants VIEW and DOWNLOAD, never EDIT', async () => {
    // Replacing the image a client signed is not a reading action, and no role should acquire it
    // by being able to read the package.
    const { provider, document } = harness();
    expect(await provider.grantsFor(document, actor('u-e2e-pm'))).not.toContain('EDIT');
  });

  it('says nothing about documents that are not handover acceptances', async () => {
    const { provider } = harness();
    const other = makeDocument({
      tenantId: 'tenant-1', companyId: 'company-1', kind: 'signature', title: 'Supervisor sign-off',
      aggregateType: 'site.daily-report', aggregateId: 'report-1', createdBy: 'u-e2e-site',
    });
    await expect(provider.grantsFor(other, actor('u-e2e-pm'))).resolves.toEqual([]);
  });

  it('refuses when the package does not resolve, rather than falling through to the permission', async () => {
    const { provider, document, can } = harness({ pkg: null, allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-pm'))).resolves.toEqual([]);
    expect(can).not.toHaveBeenCalled();
  });

  it('refuses a package belonging to another tenant', async () => {
    const { provider, document } = harness({ pkg: { id: 'ho-1', tenantId: 'tenant-2' }, allowed: true });
    await expect(provider.grantsFor(document, actor('u-e2e-pm'))).resolves.toEqual([]);
  });
});
