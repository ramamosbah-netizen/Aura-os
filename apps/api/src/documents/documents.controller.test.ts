import type { DmsService, TenantContext } from '@aura/core';
import type { DocumentVersion } from '@aura/shared';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsController } from './documents.controller';

const version = (contentType: string, fileName = 'review.pdf'): DocumentVersion => ({
  id: 'version-1',
  documentId: 'document-1',
  version: 1,
  fileName,
  contentType,
  sizeBytes: 4,
  storageKey: 'private/storage/key',
  checksum: null,
  note: null,
  uploadedAt: '2026-08-17T08:00:00.000Z',
  uploadedBy: 'actor-a',
});

function setup(contentType = 'application/pdf', fileName?: string) {
  const dms = {
    downloadVersion: vi.fn().mockResolvedValue({ bytes: Buffer.from('test'), version: version(contentType, fileName) }),
  } as unknown as DmsService;
  const tenant = {
    get: () => ({ tenantId: 'tenant-a', companyId: 'company-a', actorId: 'actor-a', teamIds: [], roleIds: [] }),
  } as unknown as TenantContext;
  return { controller: new DocumentsController(dms, tenant), dms };
}

describe('DocumentsController PDF delivery', () => {
  it('allows an authorised PDF response to render inline', async () => {
    const { controller, dms } = setup('application/pdf; charset=binary');
    const file = await controller.download('document-1', '1', 'true');
    expect(file.getHeaders()).toMatchObject({
      type: 'application/pdf; charset=binary',
      disposition: 'inline; filename="review.pdf"',
    });
    expect(dms.downloadVersion).toHaveBeenCalledWith('document-1', 1, expect.objectContaining({
      userId: 'actor-a', tenantId: 'tenant-a', companyId: 'company-a',
    }));
  });

  it.each(['text/html', 'image/svg+xml'])('never renders active %s content inline', async (contentType) => {
    const { controller } = setup(contentType);
    const file = await controller.download('document-1', undefined, 'true');
    expect(file.getHeaders().disposition).toBe('attachment; filename="review.pdf"');
  });

  it('keeps PDF downloads as attachments unless inline was explicitly requested', async () => {
    const { controller } = setup();
    const file = await controller.download('document-1');
    expect(file.getHeaders().disposition).toBe('attachment; filename="review.pdf"');
  });

  it('removes header-breaking characters from the download filename', async () => {
    const { controller } = setup('application/pdf', 'review"\r\nX-Injected: yes.pdf');
    const file = await controller.download('document-1', undefined, 'true');
    expect(file.getHeaders().disposition).toBe('inline; filename="reviewX-Injected: yes.pdf"');
  });

  it('does not conceal an access denial as missing storage', async () => {
    const { controller, dms } = setup();
    const denial = Object.assign(new Error('download refused'), { name: 'DocumentAccessDeniedError' });
    vi.mocked(dms.downloadVersion).mockRejectedValue(denial);
    await expect(controller.download('document-1', undefined, 'true')).rejects.toBe(denial);
  });
});
