import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  apiBase: () => 'http://api.test',
  authHeader: async () => ({ authorization: 'Bearer session-token' }),
}));

import { GET } from './route';

describe('document content BFF', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('forwards the immutable version and explicit inline request without dropping identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('pdf-bytes', {
      status: 200,
      headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="drawing.pdf"' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new Request('http://localhost:3000/api/documents/doc-1/content?version=3&inline=true'),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/v1/documents/doc-1/content?version=3&inline=true', {
      headers: { authorization: 'Bearer session-token' },
      cache: 'no-store',
    });
    expect(response.headers.get('content-disposition')).toBe('inline; filename="drawing.pdf"');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('does not forward arbitrary inline values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bytes', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await GET(
      new Request('http://localhost:3000/api/documents/doc-1/content?inline=yes'),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/v1/documents/doc-1/content', expect.any(Object));
  });
});
