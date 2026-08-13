import { describe, it, expect, afterEach } from 'vitest';
import { AccessService } from './access.service';

// AUTH_SEED_DEV_ADMIN hands a user the `*` role. That is a security-adjacent default, so the
// conditions that keep it out of production are worth testing more carefully than the feature
// itself: each of the three guards is asserted independently, so removing any one fails here.

const ENV_KEYS = ['AUTH_SEED_DEV_ADMIN', 'AUTH_DEV_ADMIN_USER', 'AUTH_DEV_ADMIN_TENANT', 'NODE_ENV'] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Does this actor hold the wildcard admin role at tenant scope? */
function isAdmin(svc: AccessService, userId = 'u-admin', tenantId = 'dev-tenant'): boolean {
  try {
    svc.assert(userId, { permission: 'finance.invoice.approve', orgPath: [{ level: 'tenant', id: tenantId }] });
    return true;
  } catch {
    return false;
  }
}

function build(): AccessService {
  const svc = new AccessService();
  svc.seedStandardRoles();
  svc.seedDevAdminGrant();
  return svc;
}

describe('dev admin grant seeding', () => {
  it('grants nothing by default — the flag is opt-in', () => {
    delete process.env.AUTH_SEED_DEV_ADMIN;
    expect(isAdmin(build())).toBe(false);
  });

  it('grants nothing when the flag is anything other than the literal "true"', () => {
    for (const value of ['1', 'yes', 'TRUE', '']) {
      process.env.AUTH_SEED_DEV_ADMIN = value;
      expect(isAdmin(build()), `flag=${JSON.stringify(value)} must not seed`).toBe(false);
    }
  });

  it('grants the wildcard admin role when explicitly enabled outside production', () => {
    process.env.AUTH_SEED_DEV_ADMIN = 'true';
    process.env.NODE_ENV = 'test';
    const svc = build();
    expect(isAdmin(svc)).toBe(true);
    // …and only to the configured tenant.
    expect(isAdmin(svc, 'u-admin', 'other-tenant')).toBe(false);
    // …and only to the configured user.
    expect(isAdmin(svc, 'someone-else')).toBe(false);
  });

  it('REFUSES in production even when explicitly enabled', () => {
    process.env.AUTH_SEED_DEV_ADMIN = 'true';
    process.env.NODE_ENV = 'production';
    expect(isAdmin(build())).toBe(false);
  });

  it('grants a comma-separated list, so segregation of duties is exercisable', () => {
    process.env.AUTH_SEED_DEV_ADMIN = 'true';
    process.env.NODE_ENV = 'test';
    process.env.AUTH_DEV_ADMIN_USER = 'u-admin, u-approver';
    const svc = build();
    expect(isAdmin(svc, 'u-admin')).toBe(true);
    expect(isAdmin(svc, 'u-approver')).toBe(true);
    expect(isAdmin(svc, 'u-nobody')).toBe(false);
  });

  it('honours the configured user and tenant', () => {
    process.env.AUTH_SEED_DEV_ADMIN = 'true';
    process.env.NODE_ENV = 'test';
    process.env.AUTH_DEV_ADMIN_USER = 'e2e-runner';
    process.env.AUTH_DEV_ADMIN_TENANT = 'e2e-tenant';
    const svc = build();
    expect(isAdmin(svc, 'e2e-runner', 'e2e-tenant')).toBe(true);
    expect(isAdmin(svc, 'u-admin', 'dev-tenant')).toBe(false);
  });

  it('leaves a real database alone — grants there come from aura_access_grants', () => {
    process.env.AUTH_SEED_DEV_ADMIN = 'true';
    process.env.NODE_ENV = 'test';
    // A pool present means a deployed-shaped install; the seed must not fabricate a superuser.
    const withPool = new AccessService({ query: async () => ({ rows: [] }) } as never);
    withPool.seedStandardRoles();
    withPool.seedDevAdminGrant();
    expect(isAdmin(withPool)).toBe(false);
  });
});
