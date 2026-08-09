import { describe, it, expect } from 'vitest';
import { evaluateAuthPosture } from './auth-posture';

describe('evaluateAuthPosture (P0-1)', () => {
  it('is ok whenever a verifier is configured', () => {
    for (const isProduction of [true, false]) {
      const d = evaluateAuthPosture({ verifierConfigured: true, isProduction, allowInsecure: false });
      expect(d.level).toBe('ok');
    }
  });

  it('REFUSES to boot in production with no verifier', () => {
    const d = evaluateAuthPosture({ verifierConfigured: false, isProduction: true, allowInsecure: false });
    expect(d.level).toBe('fatal');
    expect(d.message).toMatch(/Refusing to boot open/);
    expect(d.message).toMatch(/ALLOW_INSECURE_NO_AUTH/);
  });

  it('allows the explicit override, loudly', () => {
    const d = evaluateAuthPosture({ verifierConfigured: false, isProduction: true, allowInsecure: true });
    expect(d.level).toBe('warn');
  });

  it('warns but serves in development — the staged pass-through', () => {
    const d = evaluateAuthPosture({ verifierConfigured: false, isProduction: false, allowInsecure: false });
    expect(d.level).toBe('warn');
    expect(d.message).toMatch(/never expose this instance/);
  });

  // The override is production-only in effect: development already warns, so setting it there must
  // not upgrade the posture to "ok" and hide the fact that the instance is open.
  it('never reports ok without a verifier, whatever the flags', () => {
    for (const isProduction of [true, false]) {
      for (const allowInsecure of [true, false]) {
        const d = evaluateAuthPosture({ verifierConfigured: false, isProduction, allowInsecure });
        expect(d.level, `prod=${isProduction} override=${allowInsecure}`).not.toBe('ok');
      }
    }
  });
});
