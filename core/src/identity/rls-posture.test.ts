import { describe, it, expect } from 'vitest';
import { evaluateRlsPosture } from './rls-posture';

describe('evaluateRlsPosture (P0-2 — DB tenant-isolation net)', () => {
  it('a non-BYPASSRLS role (e.g. aura_app) is OK — RLS is enforced', () => {
    const d = evaluateRlsPosture({ role: 'aura_app', bypasses: false, isProduction: true, allowBypass: false });
    expect(d.level).toBe('ok');
    expect(d.message).toMatch(/non-BYPASSRLS/);
  });

  it('a bypassing role in production is FATAL (refuse to boot open)', () => {
    const d = evaluateRlsPosture({ role: 'postgres', bypasses: true, isProduction: true, allowBypass: false });
    expect(d.level).toBe('fatal');
    expect(d.message).toMatch(/Refusing to boot/);
    expect(d.message).toMatch(/aura_app/);
  });

  it('a bypassing role in dev is a WARN, not fatal (staged pass-through)', () => {
    const d = evaluateRlsPosture({ role: 'postgres', bypasses: true, isProduction: false, allowBypass: false });
    expect(d.level).toBe('warn');
    expect(d.message).toMatch(/INERT/);
  });

  it('the explicit ALLOW_RLS_BYPASS override downgrades production FATAL to a WARN', () => {
    const d = evaluateRlsPosture({ role: 'postgres', bypasses: true, isProduction: true, allowBypass: true });
    expect(d.level).toBe('warn');
  });
});
