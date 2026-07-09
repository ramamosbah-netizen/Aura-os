import crypto from 'node:crypto';
import { readSecret } from './secret-source';

// Field-level PII encryption (gap register Vol 23 #14). AES-256-GCM with a key derived
// from PII_ENCRYPTION_KEY — applied at the storage boundary (encrypt-on-write /
// decrypt-on-read) so domain logic and the UI keep working with plaintext while the
// database column holds ciphertext. Staged like every other seam: when the key env is
// unset the helpers pass values through untouched, so dev boots with zero setup.
//
// Wire format: enc:v1:<iv b64>:<auth-tag b64>:<ciphertext b64>
//  - versioned so the algorithm can rotate;
//  - GCM auth tag ⇒ tampered ciphertext fails closed (returns null, never garbage);
//  - legacy plaintext rows (pre-encryption) pass through decryptField unchanged.

const PREFIX = 'enc:v1:';

/** Derive the 32-byte AES key from a secret (any length) — sha256(secret). */
function deriveKey(raw: string | null): Buffer | null {
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest();
}

/** Current write key (PII_ENCRYPTION_KEY, `_FILE` convention honored). */
function keyFromEnv(): Buffer | null {
  return deriveKey(readSecret('PII_ENCRYPTION_KEY'));
}

/**
 * Keys accepted on decrypt, in order: the current key, then the previous one
 * (PII_ENCRYPTION_KEY_PREVIOUS) during a staged rotation — new writes use the new
 * key immediately while rows encrypted under the old key stay readable until
 * they're rewritten. See docs/runbooks/secrets-rotation.md.
 */
function decryptKeys(): Buffer[] {
  return [keyFromEnv(), deriveKey(readSecret('PII_ENCRYPTION_KEY_PREVIOUS'))].filter(
    (k): k is Buffer => k !== null,
  );
}

/** Is this stored value in the encrypted wire format? */
export function isEncryptedField(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encrypt a field for storage. Null/empty and already-encrypted values pass through;
 * without PII_ENCRYPTION_KEY this is the identity function (staged seam).
 */
export function encryptField(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return plain ?? null;
  if (isEncryptedField(plain)) return plain;
  const key = keyFromEnv();
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

/**
 * Decrypt a stored field. Legacy plaintext passes through; tampered or undecryptable
 * ciphertext returns null (fail closed — never surface garbage as someone's IBAN).
 */
export function decryptField(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === '') return stored ?? null;
  if (!isEncryptedField(stored)) return stored;
  const keys = decryptKeys();
  if (keys.length === 0) return null; // encrypted at rest but no key in this process — fail closed
  const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(':');
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      // wrong key (rotation) or tampered — try the next key, else fail closed below
    }
  }
  return null;
}
