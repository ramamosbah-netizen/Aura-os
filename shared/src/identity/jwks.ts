import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

// Verify a JWT against a JWKS (a hosted IdP's published public keys) using only
// node:crypto — no dependency. This is the verifier a real IdP (Supabase, Auth0, …)
// needs: the IdP signs with a private key and publishes the public half at a JWKS URL.
// Nothing here is provider-specific; the same shape handles any RS/ES/EdDSA issuer.

export interface Jwk {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  [k: string]: unknown;
}

export interface Jwks {
  keys: Jwk[];
}

/** Verified token claims (whatever the issuer put in the payload). */
export type JwtClaims = Record<string, unknown> & {
  sub?: string;
  exp?: number;
  iat?: number;
};

const HASH: Record<string, string> = {
  RS256: 'sha256',
  RS384: 'sha384',
  RS512: 'sha512',
  ES256: 'sha256',
  ES384: 'sha384',
  ES512: 'sha512',
};

const dec = (seg: string): Buffer => Buffer.from(seg, 'base64url');

/**
 * Verify `token` against `jwks`. Returns the decoded claims, or null if the structure,
 * signature, algorithm, or expiry is invalid. Selects the key by `kid` (or the sole key).
 */
export function verifyJwtWithJwks(token: string, jwks: Jwks): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;

  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(dec(h).toString('utf8')) as { alg?: string; kid?: string };
  } catch {
    return null;
  }
  const alg = header.alg;
  if (!alg || alg === 'none') return null;

  const jwk =
    (header.kid ? jwks.keys.find((k) => k.kid === header.kid) : undefined) ??
    (jwks.keys.length === 1 ? jwks.keys[0] : undefined);
  if (!jwk) return null;
  // Defense-in-depth: if the key declares an alg, it must match the header's.
  if (jwk.alg && jwk.alg !== alg) return null;

  let key;
  try {
    // The JWK is untyped external data; bypass the structural check on the key field.
    key = createPublicKey({ key: jwk, format: 'jwk' } as any);
  } catch {
    return null;
  }

  const data = Buffer.from(`${h}.${p}`);
  const sig = dec(s);
  let ok = false;
  try {
    if (alg === 'EdDSA') {
      ok = cryptoVerify(null, data, key, sig);
    } else if (alg.startsWith('ES')) {
      const ha = HASH[alg];
      if (!ha) return null;
      // JWT ECDSA signatures are raw R||S (IEEE P1363), not DER.
      ok = cryptoVerify(ha, data, { key, dsaEncoding: 'ieee-p1363' }, sig);
    } else if (alg.startsWith('RS')) {
      const ha = HASH[alg];
      if (!ha) return null;
      ok = cryptoVerify(ha, data, key, sig);
    } else {
      return null; // unsupported alg (PS*, etc.)
    }
  } catch {
    return null;
  }
  if (!ok) return null;

  let claims: JwtClaims;
  try {
    claims = JSON.parse(dec(p).toString('utf8')) as JwtClaims;
  } catch {
    return null;
  }
  if (typeof claims.exp === 'number' && claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}
