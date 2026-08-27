import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api';

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds an abort deadline to every upstream request', async () => {
    const upstream = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', upstream);

    await apiFetch('http://api.test/health', { cache: 'no-store' }, 1_000);

    expect(upstream).toHaveBeenCalledOnce();
    const init = upstream.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    if (!init) throw new Error('fetch init was not captured');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it('aborts a stalled upstream request at the deadline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        }),
      ),
    );

    await expect(apiFetch('http://api.test/stalled', {}, 5)).rejects.toBeDefined();
  });
});
