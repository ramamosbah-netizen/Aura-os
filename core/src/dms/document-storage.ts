import { createHash } from 'node:crypto';

/** DI token for the document binary backend. */
export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

export interface StoredObject {
  storageKey: string;
  sizeBytes: number;
  checksum: string;
}

/**
 * Binary backend for document content. The kernel ships a local-filesystem adapter;
 * Supabase Storage / S3 plug in behind this same port with no service changes.
 */
export interface DocumentStorage {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<StoredObject>;
  read(key: string): Promise<Buffer>;
}

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
