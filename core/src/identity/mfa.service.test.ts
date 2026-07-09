import { describe, it, expect } from 'vitest';
import { MfaService } from './mfa.service';
import { mapGroupsToRoles } from './auth.service';
import { generateTotpSecret, totpCodeAt } from '@aura/shared';

describe('MfaService (gap #13 — persisted enrolment + login gate)', () => {
  it('enroll parks an inactive secret — login is not yet gated', async () => {
    const svc = new MfaService();
    await svc.enroll('u1', generateTotpSecret());
    expect(await svc.activeSecret('u1')).toBeNull();
  });

  it('the first valid code activates MFA; wrong codes do not', async () => {
    const svc = new MfaService();
    const secret = generateTotpSecret();
    await svc.enroll('u1', secret);

    expect(await svc.activate('u1', '000000')).toBe(false);
    expect(await svc.activeSecret('u1')).toBeNull();

    expect(await svc.activate('u1', totpCodeAt(secret))).toBe(true);
    expect(await svc.activeSecret('u1')).toBe(secret);
  });

  it('disable removes the enrolment (device loss / admin reset)', async () => {
    const svc = new MfaService();
    const secret = generateTotpSecret();
    await svc.enroll('u1', secret);
    await svc.activate('u1', totpCodeAt(secret));

    expect(await svc.disable('u1')).toBe(true);
    expect(await svc.activeSecret('u1')).toBeNull();
    expect(await svc.disable('u1')).toBe(false);
  });

  it('re-enrolling resets to inactive (new device must confirm)', async () => {
    const svc = new MfaService();
    const first = generateTotpSecret();
    await svc.enroll('u1', first);
    await svc.activate('u1', totpCodeAt(first));

    await svc.enroll('u1', generateTotpSecret());
    expect(await svc.activeSecret('u1')).toBeNull();
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
