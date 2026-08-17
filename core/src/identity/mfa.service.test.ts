import { describe, it, expect } from 'vitest';
import { MfaService } from './mfa.service';
import { mapGroupsToRoles } from './auth.service';
import { generateTotpSecret, totpCodeAt } from '@aura/shared';

describe('MfaService (gap #13 — persisted enrolment + login gate)', () => {
  const T = 'acme';
  it('enroll parks an inactive secret — login is not yet gated', async () => {
    const svc = new MfaService();
    await svc.enroll(T, 'u1', generateTotpSecret());
    expect(await svc.activeSecret(T, 'u1')).toBeNull();
  });

  it('the first valid code activates MFA; wrong codes do not', async () => {
    const svc = new MfaService();
    const secret = generateTotpSecret();
    await svc.enroll(T, 'u1', secret);

    expect(await svc.activate(T, 'u1', '000000')).toBe(false);
    expect(await svc.activeSecret(T, 'u1')).toBeNull();

    expect(await svc.activate(T, 'u1', totpCodeAt(secret))).toBe(true);
    expect(await svc.activeSecret(T, 'u1')).toBe(secret);
  });

  it('disable removes the enrolment (device loss / admin reset)', async () => {
    const svc = new MfaService();
    const secret = generateTotpSecret();
    await svc.enroll(T, 'u1', secret);
    await svc.activate(T, 'u1', totpCodeAt(secret));

    expect(await svc.disable(T, 'u1')).toBe(true);
    expect(await svc.activeSecret(T, 'u1')).toBeNull();
    expect(await svc.disable(T, 'u1')).toBe(false);
  });

  // Migration 0234 re-keyed the table to (tenant_id, user_id): the same user id in two
  // tenants is two different people, exactly as aura_users' composite key already says.
  // Before that, one enrolment was shared across every tenant.
  it('scopes enrolments per tenant — the same user id in another tenant is untouched', async () => {
    const svc = new MfaService();
    const secret = generateTotpSecret();
    await svc.enroll('acme', 'u1', secret);
    await svc.activate('acme', 'u1', totpCodeAt(secret));

    expect(await svc.activeSecret('acme', 'u1')).toBe(secret);
    expect(await svc.activeSecret('globex', 'u1')).toBeNull();

    // And a reset in one tenant must not disable the other tenant's enrolment.
    const other = generateTotpSecret();
    await svc.enroll('globex', 'u1', other);
    await svc.activate('globex', 'u1', totpCodeAt(other));
    expect(await svc.disable('globex', 'u1')).toBe(true);
    expect(await svc.activeSecret('acme', 'u1')).toBe(secret);
  });

  it('listEnrolments only reports the requested tenant', async () => {
    const svc = new MfaService();
    await svc.enroll('acme', 'u1', generateTotpSecret());
    await svc.enroll('globex', 'u2', generateTotpSecret());
    expect((await svc.listEnrolments('acme')).map((e) => e.userId)).toEqual(['u1']);
    expect((await svc.listEnrolments('globex')).map((e) => e.userId)).toEqual(['u2']);
  });

  it('re-enrolling resets to inactive (new device must confirm)', async () => {
    const svc = new MfaService();
    const first = generateTotpSecret();
    await svc.enroll(T, 'u1', first);
    await svc.activate(T, 'u1', totpCodeAt(first));

    await svc.enroll(T, 'u1', generateTotpSecret());
    expect(await svc.activeSecret(T, 'u1')).toBeNull();
  });
});

describe('mapGroupsToRoles (gap #13 — Entra groups → AURA roles)', () => {
  it('maps matching group ids through the csv and de-dupes', () => {
    const csv = 'grp-finance=financeMgr, grp-admins=dealChainAdmin';
    expect(mapGroupsToRoles(['grp-finance', 'grp-admins', 'grp-unknown'], csv)).toEqual([
      'financeMgr',
      'dealChainAdmin',
    ]);
    expect(mapGroupsToRoles(['grp-finance', 'grp-finance'], csv)).toEqual(['financeMgr']);
  });

  it('returns empty for missing groups claim or unset map', () => {
    expect(mapGroupsToRoles(undefined, 'a=b')).toEqual([]);
    expect(mapGroupsToRoles(['g'], undefined)).toEqual([]);
    expect(mapGroupsToRoles('not-an-array', 'a=b')).toEqual([]);
  });
});
