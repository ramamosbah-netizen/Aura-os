import { describe, expect, it } from 'vitest';
import { type KeyObject, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { type Jwks, verifyJwtWithJwks } from './jwks';

const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');

// Mint a token the way an IdP would — sign `header.payload` with the private key.
function mint(privateKey: KeyObject, alg: string, kid: string, claims: Record<string, unknown>): string {
  const header = b64({ alg, kid, typ: 'JWT' });
  const payload = b64(claims);
  const data = Buffer.from(`${header}.${payload}`);
  const sig = alg.startsWith('ES')
    ? cryptoSign('sha256', data, { key: privateKey, dsaEncoding: 'ieee-p1363' })
    : cryptoSign('sha256', data, privateKey);
  return `${header}.${payload}.${sig.toString('base64url')}`;
}

function rsa(kid = 'rsa-1'): { jwks: Jwks; priv: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  return { jwks: { keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' } as unknown as Jwks['keys'][number]] }, priv: privateKey };
}

function ec(kid = 'ec-1'): { jwks: Jwks; priv: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  return { jwks: { keys: [{ ...jwk, kid, alg: 'ES256', use: 'sig' } as unknown as Jwks['keys'][number]] }, priv: privateKey };
}

const future = Math.floor(Date.now() / 1000) + 3600;

describe('jwks verifier (hosted-IdP tokens)', () => {
  it('verifies a valid RS256 token', () => {
    const { jwks, priv } = rsa();
    const claims = verifyJwtWithJwks(mint(priv, 'RS256', 'rsa-1', { sub: 'u-1', exp: future }), jwks);
    expect(claims?.sub).toBe('u-1');
  });

  it('verifies a valid ES256 token', () => {
    const { jwks, priv } = ec();
    const claims = verifyJwtWithJwks(mint(priv, 'ES256', 'ec-1', { sub: 'u-2', exp: future }), jwks);
    expect(claims?.sub).toBe('u-2');
  });

  it('rejects a tampered payload', () => {
    const { jwks, priv } = rsa();
    const [h, , s] = mint(priv, 'RS256', 'rsa-1', { sub: 'u-1', exp: future }).split('.');
    const forged = `${h}.${b64({ sub: 'attacker', exp: future })}.${s}`;
    expect(verifyJwtWithJwks(forged, jwks)).toBeNull();
  });

  it('rejects a token signed by a different key (same kid)', () => {
    const a = rsa('rsa-1');
    const b = rsa('rsa-1'); // different keypair, same kid
    expect(verifyJwtWithJwks(mint(a.priv, 'RS256', 'rsa-1', { sub: 'u-1', exp: future }), b.jwks)).toBeNull();
  });

  it('rejects an expired token', () => {
    const { jwks, priv } = rsa();
    const past = Math.floor(Date.now() / 1000) - 10;
    expect(verifyJwtWithJwks(mint(priv, 'RS256', 'rsa-1', { sub: 'u-1', exp: past }), jwks)).toBeNull();
  });

  it('rejects alg=none and malformed tokens', () => {
    const { jwks } = rsa();
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'x', exp: future })}.`;
    expect(verifyJwtWithJwks(none, jwks)).toBeNull();
    expect(verifyJwtWithJwks('not-a-jwt', jwks)).toBeNull();
  });
});
