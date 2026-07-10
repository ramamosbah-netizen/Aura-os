import { describe, it, expect, vi } from 'vitest';
import { AuraApiError, AuraHttp } from './client';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('@aura/sdk client core (gap #21)', () => {
  it('sends bearer token, idempotency key, and the /api/v1 prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'a1' }));
    const http = new AuraHttp({ baseUrl: 'https://aura.example.com/', token: 't0k', fetch: fetchMock });

    const out = await http.request('POST', '/crm/accounts', { name: 'Emaar' }, undefined, {
      idempotencyKey: 'idem-1',
    });

    expect(out).toEqual({ id: 'a1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://aura.example.com/api/v1/crm/accounts');
    expect(init.headers.authorization).toBe('Bearer t0k');
    expect(init.headers['idempotency-key']).toBe('idem-1');
    expect(init.body).toBe(JSON.stringify({ name: 'Emaar' }));
  });

  it('serializes query params and skips undefined ones', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [], total: 0, offset: 0, limit: 50 }));
    const http = new AuraHttp({ baseUrl: 'http://x', fetch: fetchMock });

    await http.request('GET', '/crm/accounts/paged', undefined, { offset: 0, limit: 50, q: undefined });

    expect(fetchMock.mock.calls[0][0]).toBe('http://x/api/v1/crm/accounts/paged?offset=0&limit=50');
  });

  it('maps the error taxonomy: 409 state guard → CONFLICT with server message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(409, { message: 'insufficient stock' }));
    const http = new AuraHttp({ baseUrl: 'http://x', fetch: fetchMock });

    const err = await http.request('POST', '/inventory/issues', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuraApiError);
    expect((err as AuraApiError).code).toBe('CONFLICT');
    expect((err as AuraApiError).status).toBe(409);
    expect((err as AuraApiError).message).toBe('insufficient stock');
  });

  it('maps 400→VALIDATION, 403→FORBIDDEN, 5xx→SERVER', async () => {
    const http = (status: number) =>
      new AuraHttp({ baseUrl: 'http://x', fetch: vi.fn().mockResolvedValue(jsonResponse(status, {})) });
    await expect(http(400).request('GET', '/a')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(http(403).request('GET', '/a')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(http(502).request('GET', '/a')).rejects.toMatchObject({ code: 'SERVER' });
  });

  it('setToken rotates the credential for subsequent calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const http = new AuraHttp({ baseUrl: 'http://x', token: 'old', fetch: fetchMock });
    http.setToken('new');
    await http.request('GET', '/health');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer new');
  });
});
