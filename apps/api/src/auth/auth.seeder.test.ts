import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TenantContext } from '@aura/core';
import type { AccessService, CredentialsService, UsersService } from '@aura/core';
import { AuthSeeder } from './auth.seeder';

/**
 * The dev bootstrap password is a SECRET, so it must come through the same seam as every other
 * secret: `AUTH_DEV_PASSWORD` or `AUTH_DEV_PASSWORD_FILE`. Reading `process.env` directly (as
 * this seeder did) made the `_FILE` form silently inert — and `_FILE` is exactly what
 * `scripts/configure-local-auth.mjs` writes, so a fully-configured local setup booted with no
 * credential and refused every sign-in with no failure anywhere to explain why.
 */
describe('AuthSeeder — dev credential bootstrap', () => {
  let dir: string;
  const saved = { pw: process.env.AUTH_DEV_PASSWORD, file: process.env.AUTH_DEV_PASSWORD_FILE, user: process.env.AUTH_DEV_ADMIN_USER };

  const build = () => {
    const setPassword = vi.fn(async () => undefined);
    const save = vi.fn();
    const seeder = new AuthSeeder(
      { registerRole: vi.fn(), grant: vi.fn() } as unknown as AccessService,
      { save } as unknown as UsersService,
      { has: vi.fn(async () => false), setPassword } as unknown as CredentialsService,
      new TenantContext(),
    );
    return { seeder, setPassword, save };
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'seed-'));
    delete process.env.AUTH_DEV_PASSWORD;
    delete process.env.AUTH_DEV_PASSWORD_FILE;
    delete process.env.AUTH_DEV_ADMIN_USER;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const [k, v] of [['AUTH_DEV_PASSWORD', saved.pw], ['AUTH_DEV_PASSWORD_FILE', saved.file], ['AUTH_DEV_ADMIN_USER', saved.user]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('takes the password from AUTH_DEV_PASSWORD_FILE — the form the setup script writes', async () => {
    const file = join(dir, 'master-admin-password');
    writeFileSync(file, 'from-the-secret-file\n'); // trailing newline: files end with one
    process.env.AUTH_DEV_PASSWORD_FILE = file;

    const { seeder, setPassword, save } = build();
    await seeder.onModuleInit();

    expect(setPassword).toHaveBeenCalledWith('dev-tenant', 'u-admin', 'from-the-secret-file', { mustChange: false });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-admin', active: true }));
  });

  it('still takes the plain AUTH_DEV_PASSWORD variable', async () => {
    process.env.AUTH_DEV_PASSWORD = 'plain-variable';
    const { seeder, setPassword } = build();
    await seeder.onModuleInit();
    expect(setPassword).toHaveBeenCalledWith('dev-tenant', 'u-admin', 'plain-variable', { mustChange: false });
  });

  it('sets no credential at all when neither form is configured', async () => {
    const { seeder, setPassword } = build();
    await seeder.onModuleInit();
    expect(setPassword).not.toHaveBeenCalled();
  });
});
