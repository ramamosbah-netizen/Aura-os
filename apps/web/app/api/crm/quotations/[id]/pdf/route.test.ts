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
    // EST-18: the customer-facing basis (study scope, lineage) is read under the same session.
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, 'http://api.test/api/v1/crm/quotations/q-1/proposal-basis', {
      headers: { authorization: 'Bearer session-token' }, cache: 'no-store',
    });
  });

  it('marks a revision that is not approved for issue on its face', async () => {
    apiFetchMock
      .mockResolvedValueOnce(Response.json({
        quoteNumber: 'QT-2', revision: 1, customerName: 'Customer', issueDate: '2026-09-27', validUntil: null, status: 'draft',
        subtotal: 100, vatTotal: 5, total: 105, lines: [{ description: 'Camera', quantity: 1, unit: 'no', unitPrice: 100, vatRate: 5, lineNet: 100 }],
      }))
      .mockResolvedValueOnce(Response.json({
        configured: true, name: 'Company', legalName: 'Company LLC', trn: '', address: '', phone: '', email: '', website: '', currency: 'AED',
      }))
      .mockResolvedValueOnce(Response.json({ status: 'draft', supersedes: { quoteNumber: 'QT-2', revision: 0, reason: 'Validity' }, supersededBy: null, technicalBasis: null, issues: [] }));

    const response = await call();
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
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
