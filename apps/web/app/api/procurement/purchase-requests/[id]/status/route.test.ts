import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  apiFetch: apiFetchMock,
  apiBase: () => 'http://api.test',
  authHeader: async () => ({ authorization: 'Bearer session-token' }),
}));

import { PATCH } from './route';

const call = (status: string) => PATCH(
  new Request('http://localhost/api/procurement/purchase-requests/pr-1/status', {
    method: 'PATCH', body: JSON.stringify({ status }),
  }),
  { params: Promise.resolve({ id: 'pr-1' }) },
);

describe('requisition status BFF — the screens keep one path, the decision goes to its own door', () => {
  afterEach(() => apiFetchMock.mockReset());

  it.each(['approved', 'rejected'])('sends "%s" to the decision route, which the Procurement Manager can reach', async (status) => {
    apiFetchMock.mockResolvedValueOnce(Response.json({ id: 'pr-1', status }));
    const response = await call(status);
    expect(response.status).toBe(200);
    expect(apiFetchMock).toHaveBeenCalledWith('http://api.test/api/v1/procurement/purchase-requests/pr-1/decision', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ status }),
      headers: expect.objectContaining({ authorization: 'Bearer session-token' }),
    }));
  });

  it('sends a submission to the authoring route', async () => {
    apiFetchMock.mockResolvedValueOnce(Response.json({ id: 'pr-1', status: 'submitted' }));
    await call('submitted');
    expect(apiFetchMock).toHaveBeenCalledWith('http://api.test/api/v1/procurement/purchase-requests/pr-1/status', expect.objectContaining({ method: 'PATCH' }));
  });

  it('passes an upstream refusal through unchanged', async () => {
    apiFetchMock.mockResolvedValueOnce(Response.json({ message: 'Access denied: no grant satisfies "procurement.pr.approve"' }, { status: 403 }));
    const response = await call('approved');
    expect(response.status).toBe(403);
    expect((await response.json()).message).toMatch(/procurement\.pr\.approve/);
  });
});
