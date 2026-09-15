import { describe, it, expect } from 'vitest';
import { linkEmployeeAccount, unlinkEmployeeAccount, employeeHoldsAccount } from './employee-account-link';
import { makeEmployee } from './employee';
import type { Employee } from './employee';

const employee = (over: Partial<Employee> = {}): Employee => ({
  ...makeEmployee({
    tenantId: 't1', firstName: 'Maya', lastName: 'Haddad', role: 'Site Engineer',
    department: 'Projects', joinedDate: '2026-01-01',
  }),
  ...over,
});

describe('linkEmployeeAccount', () => {
  it('records the account with who declared it and when', () => {
    const linked = linkEmployeeAccount(employee(), { userId: ' u-maya ', actorId: 'u-admin' });
    expect(linked.userId).toBe('u-maya');
    expect(linked.userLinkedBy).toBe('u-admin');
    expect(Date.parse(linked.userLinkedAt!)).not.toBeNaN();
  });

  it('refuses an empty account id rather than storing a link that matches nothing', () => {
    expect(() => linkEmployeeAccount(employee(), { userId: '   ', actorId: 'u-admin' })).toThrow(/user account id/);
  });

  it('refuses to re-point an existing link, so attribution cannot move silently', () => {
    const linked = linkEmployeeAccount(employee(), { userId: 'u-maya', actorId: 'u-admin' });
    expect(() => linkEmployeeAccount(linked, { userId: 'u-other', actorId: 'u-admin' })).toThrow(/unlink/);
  });

  it('is idempotent for the same account and keeps the original provenance', () => {
    const first = linkEmployeeAccount(employee(), { userId: 'u-maya', actorId: 'u-admin' });
    const again = linkEmployeeAccount(first, { userId: 'u-maya', actorId: 'u-someone-else' });
    expect(again).toBe(first);
    expect(again.userLinkedBy).toBe('u-admin');
  });

  it('refuses a terminated or deleted employment record', () => {
    expect(() => linkEmployeeAccount(employee({ status: 'terminated' }), { userId: 'u-maya', actorId: null }))
      .toThrow(/terminated/);
    expect(() => linkEmployeeAccount(employee({ deletedAt: '2026-02-01T00:00:00.000Z' }), { userId: 'u-maya', actorId: null }))
      .toThrow(/deleted/);
  });

  it('never links at creation — the link is a separate administrative act', () => {
    expect(employee().userId).toBeNull();
  });
});

describe('unlinkEmployeeAccount', () => {
  it('clears the link and its provenance together', () => {
    const linked = linkEmployeeAccount(employee(), { userId: 'u-maya', actorId: 'u-admin' });
    const cleared = unlinkEmployeeAccount(linked);
    expect(cleared.userId).toBeNull();
    expect(cleared.userLinkedAt).toBeNull();
    expect(cleared.userLinkedBy).toBeNull();
  });

  it('refuses when there is nothing to unlink', () => {
    expect(() => unlinkEmployeeAccount(employee())).toThrow(/not linked to an account/);
  });
});

describe('employeeHoldsAccount', () => {
  it('is false for an unlinked employee even when the account id is empty', () => {
    expect(employeeHoldsAccount({ userId: null }, '')).toBe(false);
    expect(employeeHoldsAccount({ userId: 'u-maya' }, 'u-maya')).toBe(true);
    expect(employeeHoldsAccount({ userId: 'u-maya' }, 'u-other')).toBe(false);
  });
});
