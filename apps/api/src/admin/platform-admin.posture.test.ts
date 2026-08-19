import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authPosture } from './platform-admin.controller';

/**
 * The security screen has to be right about the environment it describes. `devPasswordSet` read
 * `process.env` directly, so the `_FILE` form — what the local setup script writes, and what a
 * secret mount provides — reported "no dev password" on a deployment where dev sign-in worked.
 */
describe('authPosture', () => {
  const saved = { ...process.env };

  afterEach(() => {
    for (const k of ['AUTH_DEV_PASSWORD', 'AUTH_DEV_PASSWORD_FILE', 'AUTH_JWT_SECRET', 'AUTH_JWT_SECRET_FILE', 'AUTH_JWKS_URL', 'AUTH_REQUIRED']) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('sees a dev password supplied as a plain variable', () => {
    delete process.env.AUTH_DEV_PASSWORD_FILE;
    process.env.AUTH_DEV_PASSWORD = 'a-dev-password';
    expect(authPosture().devPasswordSet).toBe(true);
  });

  it('sees a dev password supplied through the _FILE seam', () => {
    const dir = mkdtempSync(join(tmpdir(), 'posture-'));
    const file = join(dir, 'dev-password');
    writeFileSync(file, 'a-dev-password\n');
    delete process.env.AUTH_DEV_PASSWORD;
    process.env.AUTH_DEV_PASSWORD_FILE = file;
    try {
      expect(authPosture().devPasswordSet).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports no dev password when neither form is configured', () => {
    delete process.env.AUTH_DEV_PASSWORD;
    delete process.env.AUTH_DEV_PASSWORD_FILE;
    expect(authPosture().devPasswordSet).toBe(false);
  });

  it('still reports the verifier and the lockout policy', () => {
    delete process.env.AUTH_JWKS_URL;
    delete process.env.AUTH_JWT_SECRET_FILE;
    process.env.AUTH_JWT_SECRET = 'hs256-secret';
    process.env.AUTH_REQUIRED = 'true';
    const posture = authPosture();
    expect(posture.verifier).toBe('hs256');
    expect(posture.required).toBe(true);
    expect(posture.lockout.maxAttempts).toBeGreaterThan(0);
  });
});
