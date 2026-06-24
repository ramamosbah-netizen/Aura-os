import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { type DocumentStorage, type StoredObject, sha256 } from './document-storage';

/**
 * Filesystem-backed document storage — the boot-safe default (no cloud needed).
 * Content lands under DMS_STORAGE_DIR (default `<cwd>/.aura-storage`). The cloud
 * adapter (Supabase Storage / S3) implements the same DocumentStorage port later.
 */
export class LocalDocumentStorage implements DocumentStorage {
  readonly name = 'local';
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = resolve(
      baseDir ?? process.env.DMS_STORAGE_DIR ?? join(process.cwd(), '.aura-storage'),
    );
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<StoredObject> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return { storageKey: key, sizeBytes: data.byteLength, checksum: sha256(data) };
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  /** Keys come pre-sanitized from storageKeyFor; defend against traversal anyway. */
  private pathFor(key: string): string {
    const safe = key.replace(/\\/g, '/').replace(/\.\.+/g, '_');
    return join(this.baseDir, safe);
  }
}
