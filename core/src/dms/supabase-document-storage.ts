import { type DocumentStorage, type StoredObject, sha256 } from './document-storage';

/**
 * Supabase Storage adapter for the DMS binary port — the cloud backend behind
 * DOCUMENT_STORAGE (same seam as LocalDocumentStorage; no service changes).
 * Selected when DMS_STORAGE_PROVIDER=supabase with SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY set; bucket from DMS_STORAGE_BUCKET (default aura-dms).
 * Any S3-compatible store fronted by the same REST shape plugs in identically.
 */
export class SupabaseDocumentStorage implements DocumentStorage {
  readonly name = 'supabase';

  constructor(
    private readonly baseUrl: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}

  private urlFor(key: string): string {
    const safe = key
      .replace(/\\/g, '/')
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    return `${this.baseUrl.replace(/\/$/, '')}/storage/v1/object/${this.bucket}/${safe}`;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    const res = await fetch(this.urlFor(key), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.serviceKey}`,
        'content-type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`supabase storage put failed for ${key}: HTTP ${res.status}`);
    return { storageKey: key, sizeBytes: data.byteLength, checksum: sha256(data) };
  }

  async read(key: string): Promise<Buffer> {
    const res = await fetch(this.urlFor(key), {
      headers: { authorization: `Bearer ${this.serviceKey}` },
    });
    if (!res.ok) throw new Error(`supabase storage read failed for ${key}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Resolve the configured DMS binary backend (env-gated; local disk is the boot-safe default). */
export function documentStorageFromEnv(
  localFactory: () => DocumentStorage,
): DocumentStorage {
  const provider = (process.env.DMS_STORAGE_PROVIDER ?? '').toLowerCase();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (provider === 'supabase' && url && key) {
    return new SupabaseDocumentStorage(url, key, process.env.DMS_STORAGE_BUCKET ?? 'aura-dms');
  }
  return localFactory();
}
