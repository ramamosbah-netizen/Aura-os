import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  apiFetch: apiFetchMock,
  apiBase: () => 'http://api.test',
  authHeader: async () => ({ authorization: 'Bearer session-token' }),
}));

import { GET } from './route';

describe('document content BFF', () => {
  afterEach(() => apiFetchMock.mockReset());

  it('forwards the immutable version and explicit inline request without dropping identity', async () => {
    apiFetchMock.mockResolvedValue(new Response('pdf-bytes', {
      status: 200,
      headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="drawing.pdf"' },
    }));

    const response = await GET(
      new Request('http://localhost:3000/api/documents/doc-1/content?version=3&inline=true'),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );

    expect(apiFetchMock).toHaveBeenCalledWith('http://api.test/api/v1/documents/doc-1/content?version=3&inline=true', {
      headers: { authorization: 'Bearer session-token' },
      cache: 'no-store',
    });
    expect(response.headers.get('content-disposition')).toBe('inline; filename="drawing.pdf"');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('does not forward arbitrary inline values', async () => {
    apiFetchMock.mockResolvedValue(new Response('bytes', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment' },
    }));
    await GET(
      new Request('http://localhost:3000/api/documents/doc-1/content?inline=yes'),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );
    expect(apiFetchMock).toHaveBeenCalledWith('http://api.test/api/v1/documents/doc-1/content', expect.any(Object));
  });
});
