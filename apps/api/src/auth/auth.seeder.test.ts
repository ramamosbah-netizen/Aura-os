import { afterEach, describe, expect, it } from 'vitest';
import { AccessService } from '@aura/core';
import { AuthSeeder } from './auth.seeder';

const ENV_KEYS = ['AUTH_MASTER_ADMIN_USER', 'AUTH_MASTER_ADMIN_TENANT'] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function seed(): AccessService {
  const access = new AccessService();
  new AuthSeeder(access).onModuleInit();
  return access;
}

describe('AuthSeeder — master administrator bootstrap', () => {
  it('does not grant a wildcard role without an explicit master-admin identity', () => {
    delete process.env.AUTH_MASTER_ADMIN_USER;
    const access = seed();
    expect(access.can('u-admin', {
      permission: 'admin.security.manage',
      orgPath: [{ level: 'tenant', id: 'dev-tenant' }],
    }).allowed).toBe(false);
  });

  it('grants only the configured identity and tenant', () => {
    process.env.AUTH_MASTER_ADMIN_USER = 'u-admin';
    process.env.AUTH_MASTER_ADMIN_TENANT = 'dev-tenant';
    const access = seed();
    expect(access.can('u-admin', {
      permission: 'admin.security.manage',
      orgPath: [{ level: 'tenant', id: 'dev-tenant' }],
    }).allowed).toBe(true);
    expect(access.can('another-user', {
      permission: 'admin.security.manage',
      orgPath: [{ level: 'tenant', id: 'dev-tenant' }],
    }).allowed).toBe(false);
    expect(access.can('u-admin', {
      permission: 'admin.security.manage',
      orgPath: [{ level: 'tenant', id: 'another-tenant' }],
    }).allowed).toBe(false);
  });
});
