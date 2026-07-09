// RFC 6238 TOTP (time-based one-time passwords) — the MFA primitive for local accounts
// (gap register Vol 23 #13). Hosted-IdP sign-in (Entra) carries its own MFA; this covers
// accounts that authenticate against the platform directly. Dependency-free: node crypto
// HMAC-SHA1 + a small base32 codec, so it runs headless in shared (server + tests).

import { createHmac, randomBytes } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function encodeBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function decodeBase32(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export interface TotpOptions {
  /** time step in seconds (default 30) */
  step?: number;
  /** epoch offset in seconds (default 0) */
  t0?: number;
  /** code length (default 6) */
  digits?: number;
}

/** HOTP (RFC 4226): HMAC-SHA1 dynamic truncation to `digits`. */
function hotp(secret: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** digits).toString().padStart(digits, '0');
}

/** The TOTP code for a base32 secret at a given time (defaults to now). */
export function totpCodeAt(secretBase32: string, atMs: number = Date.now(), opts: TotpOptions = {}): string {
  const { step = 30, t0 = 0, digits = 6 } = opts;
  const counter = Math.floor((Math.floor(atMs / 1000) - t0) / step);
  return hotp(decodeBase32(secretBase32), counter, digits);
}

export interface VerifyTotpOptions extends TotpOptions {
  /** how many steps of clock-skew to accept either side (default 1 → ±30s) */
  window?: number;
  atMs?: number;
}

/** Constant-effort verify across a ± `window` of steps to tolerate clock skew. */
export function verifyTotp(secretBase32: string, code: string, opts: VerifyTotpOptions = {}): boolean {
  const { step = 30, t0 = 0, digits = 6, window = 1, atMs = Date.now() } = opts;
  const secret = decodeBase32(secretBase32);
  const clean = code.replace(/\s/g, '');
  if (clean.length !== digits) return false;
  const counter = Math.floor((Math.floor(atMs / 1000) - t0) / step);
  for (let e = -window; e <= window; e++) {
    if (hotp(secret, counter + e, digits) === clean) return true;
  }
  return false;
}

/** A fresh random base32 secret (default 20 bytes = 160 bits, the RFC-recommended size). */
export function generateTotpSecret(bytes = 20): string {
  return encodeBase32(randomBytes(bytes));
}

/** The `otpauth://` provisioning URI an authenticator app scans as a QR code. */
export function totpAuthUri(
  secretBase32: string,
  params: { label: string; issuer?: string; digits?: number; period?: number },
): string {
  const { label, issuer, digits = 6, period = 30 } = params;
  // otpauth label is `Issuer:account` with a LITERAL colon; each part is encoded separately.
  const account = issuer ? `${encodeURIComponent(issuer)}:${encodeURIComponent(label)}` : encodeURIComponent(label);
  const q = new URLSearchParams({ secret: secretBase32, algorithm: 'SHA1', digits: String(digits), period: String(period) });
  if (issuer) q.set('issuer', issuer);
  return `otpauth://totp/${account}?${q.toString()}`;
}
