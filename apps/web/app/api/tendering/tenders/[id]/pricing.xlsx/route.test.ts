import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  apiFetch: apiFetchMock,
  apiBase: () => 'http://api.test',
  authHeader: async () => ({ authorization: 'Bearer session-token' }),
}));

import { GET } from './route';

const call = () => GET(new Request('http://localhost/api/tendering/tenders/t-1/pricing.xlsx'), {
  params: Promise.resolve({ id: 't-1' }),
});

describe('Tender pricing XLSX BFF', () => {
  afterEach(() => apiFetchMock.mockReset());

  it('streams the authenticated native workbook and preserves safe headers', async () => {
    const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    apiFetchMock.mockResolvedValueOnce(new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="TDR-001-internal-pricing.xlsx"',
        'content-length': String(bytes.byteLength),
      },
    }));

    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('spreadsheetml.sheet');
    expect(response.headers.get('content-disposition')).toContain('TDR-001-internal-pricing.xlsx');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(apiFetchMock).toHaveBeenCalledWith('http://api.test/api/v1/tendering/tenders/t-1/pricing.xlsx', {
      headers: { authorization: 'Bearer session-token' }, cache: 'no-store',
    });
  });

  it.each([403, 404])('preserves an upstream %s refusal and emits no workbook', async (status) => {
    apiFetchMock.mockResolvedValueOnce(Response.json({ message: 'Pricing workbook unavailable' }, { status }));
    const response = await call();
    expect(response.status).toBe(status);
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4)).not.toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });
});
