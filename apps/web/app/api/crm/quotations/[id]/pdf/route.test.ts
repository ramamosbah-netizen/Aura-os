import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  apiFetch: apiFetchMock,
  apiBase: () => 'http://api.test',
  authHeader: async () => ({ authorization: 'Bearer session-token' }),
}));

import { GET } from './route';

const call = () => GET(new Request('http://localhost/api/crm/quotations/q-1/pdf'), {
  params: Promise.resolve({ id: 'q-1' }),
});

describe('customer quotation PDF BFF', () => {
  afterEach(() => apiFetchMock.mockReset());

  it('forwards the authenticated session to both canonical output sources', async () => {
    apiFetchMock
      .mockResolvedValueOnce(Response.json({
        quoteNumber: 'QT-1', revision: 0, customerName: 'Customer', subject: 'CCTV',
        issueDate: '2026-09-14', validUntil: null, status: 'approved', subtotal: 100,
        vatTotal: 5, total: 105, lines: [{ description: 'Camera', quantity: 1, unit: 'no', unitPrice: 100, vatRate: 5, lineNet: 100 }],
      }))
      .mockResolvedValueOnce(Response.json({
        configured: true, name: 'Company', legalName: 'Company LLC', trn: '', address: '',
        phone: '', email: '', website: '', currency: 'AED',
      }));

    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(apiFetchMock).toHaveBeenNthCalledWith(1, 'http://api.test/api/v1/crm/quotations/q-1', {
      headers: { authorization: 'Bearer session-token' }, cache: 'no-store',
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, 'http://api.test/api/v1/crm/quotations/q-1/document-identity', {
      headers: { authorization: 'Bearer session-token' }, cache: 'no-store',
    });
  });

  it.each([403, 404])('preserves an upstream %s refusal and emits no PDF', async (status) => {
    apiFetchMock
      .mockResolvedValueOnce(Response.json({ message: 'Quotation unavailable' }, { status }))
      .mockResolvedValueOnce(Response.json({ message: 'Company identity unavailable' }, { status }));

    const response = await call();
    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString('ascii')).not.toBe('%PDF-');
  });
});
