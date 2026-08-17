import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  apiBase: () => 'http://api.test',
  authHeader: async () => ({ authorization: 'Bearer session-token' }),
}));

import { GET } from './route';

describe('document metadata BFF', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not expose internal storage keys to the browser', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      document: { id: 'doc-1', currentVersion: 1 },
      versions: [{ version: 1, fileName: 'drawing.pdf', contentType: 'application/pdf', storageKey: 'tenant/private/key', checksum: 'abc' }],
    })));
    const response = await GET(new Request('http://localhost:3000/api/documents/doc-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    });
    const body = await response.json() as { versions: Array<Record<string, unknown>> };
    expect(body.versions[0]).not.toHaveProperty('storageKey');
    expect(body.versions[0]).toMatchObject({ fileName: 'drawing.pdf', checksum: 'abc' });
  });
});
