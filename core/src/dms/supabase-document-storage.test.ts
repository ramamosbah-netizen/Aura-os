import { describe, it, expect, afterEach, vi } from 'vitest';
import { SupabaseDocumentStorage, documentStorageFromEnv } from './supabase-document-storage';
import { LocalDocumentStorage } from './local-document-storage';

afterEach(() => {
  delete process.env.DMS_STORAGE_PROVIDER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.DMS_STORAGE_BUCKET;
  vi.restoreAllMocks();
});

describe('documentStorageFromEnv', () => {
  it('defaults to the local adapter', () => {
    expect(documentStorageFromEnv(() => new LocalDocumentStorage()).name).toBe('local');
  });

  it('selects supabase only when fully configured', () => {
    process.env.DMS_STORAGE_PROVIDER = 'supabase';
    expect(documentStorageFromEnv(() => new LocalDocumentStorage()).name).toBe('local'); // no URL/key yet

    process.env.SUPABASE_URL = 'https://proj.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    expect(documentStorageFromEnv(() => new LocalDocumentStorage()).name).toBe('supabase');
  });
});

describe('SupabaseDocumentStorage', () => {
  const storage = new SupabaseDocumentStorage('https://proj.supabase.co/', 'sk', 'aura-dms');

  it('puts bytes with upsert + auth and returns the stored descriptor', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);
    const stored = await storage.put('tenant/doc/v1/file.pdf', Buffer.from('hello'), 'application/pdf');

    expect(stored).toMatchObject({ storageKey: 'tenant/doc/v1/file.pdf', sizeBytes: 5 });
    expect(stored.checksum).toHaveLength(64);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/storage/v1/object/aura-dms/tenant/doc/v1/file.pdf');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk');
    expect((init.headers as Record<string, string>)['x-upsert']).toBe('true');
  });

  it('reads bytes back and surfaces HTTP failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('content').buffer,
    } as unknown as Response);
    expect((await storage.read('k')).toString()).toBe('content');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(storage.read('missing')).rejects.toThrow(/HTTP 404/);
  });
});
