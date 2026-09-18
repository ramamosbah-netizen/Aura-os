import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { classifyDomainMessage } from '../common/all-exceptions.filter';
import { closePeriod, reopenPeriod, reopenSeparation, type PeriodClose } from '@aura/finance';
import { PeriodCloseController } from './period-close.controller';

/**
 * FINANCE PERIOD CLOSE — the second SEC-01 stage-3 fix, on the same pattern as J1-07.
 *
 * Measured against the running API before this change:
 *   - neither route declared a permission, so the guard derived `finance.period.close` and
 *     `.reopen` and NO ROLE NAMED EITHER;
 *   - `r-finance` reached both through `finance.*`, the wildcard it carried alongside invoices,
 *     receipts, payments and cash — running the department and closing the books were one permission;
 *   - reopening required no reason at all, while closing could carry an optional note;
 *   - and reopening DELETED the row, so close → reopen → close left one row reading "closed once".
 *
 * DECLARING THE TWO PERMISSIONS WOULD HAVE CHANGED NOTHING ON ITS OWN. A wildcard matches every name
 * in its module, so the authority fix is inseparable from removing `finance.*` — which is why this
 * file asserts the vocabulary, not just the decorators.
 */

const declared = (handler: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, handler as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, permission: string) =>
  role(roleId).permissions.some((p) => permissionMatches(p, permission));
const names = (roleId: string, permission: string) => role(roleId).permissions.includes(permission);

describe('finance period close — authority', () => {
  it('declares a permission on every route, and closing is not reopening', () => {
    const p = PeriodCloseController.prototype;
    expect(declared(p.list)).toEqual(['finance.period.read']);
    expect(declared(p.history)).toEqual(['finance.period.read']);
    expect(declared(p.close)).toEqual(['finance.period.close']);
    // Two names, not one. Reopening the books is the higher-consequence half and used to need no
    // more authority than closing them.
    expect(declared(p.reopen)).toEqual(['finance.period.reopen']);
  });

  it('takes the two acts away from the operational finance role', () => {
    // THE WILDCARD IS GONE. This is the assertion that makes the decorators above mean anything.
    expect(role('r-finance').permissions).not.toContain('finance.*');
    expect(holds('r-finance', 'finance.period.close')).toBe(false);
    expect(holds('r-finance', 'finance.period.reopen')).toBe(false);

    // …and Finance keeps everything else it had, including seeing which periods are closed, because
    // it has to work inside them.
    expect(holds('r-finance', 'finance.period.read')).toBe(true);
    for (const permission of [
      'finance.invoice.approve', 'finance.journal.post', 'finance.payment.create',
      'finance.account.create', 'finance.fx.read', 'finance.customer-invoice.issue',
      'finance.budget.update', 'finance.vat-return.submit', 'finance.petty-cash.create',
    ]) {
      expect(holds('r-finance', permission), `${permission} must still be held by r-finance`).toBe(true);
    }
  });

  it('gives the two acts to a controller who does not post into the periods it closes', () => {
    expect(names('r-finance-controller', 'finance.period.close')).toBe(true);
    expect(names('r-finance-controller', 'finance.period.reopen')).toBe(true);

    // A controller who could also post the journals would be signing off their own work.
    for (const permission of ['finance.journal.post', 'finance.invoice.approve', 'finance.payment.create']) {
      expect(holds('r-finance-controller', permission), `${permission} must NOT be held by the controller`).toBe(false);
    }
    // It can read finance, because deciding whether a period is ready to close requires looking.
    expect(holds('r-finance-controller', 'finance.journal.read')).toBe(true);
  });
});

describe('finance period close — the state machine', () => {
  const gen = (over: Partial<PeriodClose>): PeriodClose => ({
    id: `g-${over.generation ?? 1}`, tenantId: 't-1', period: '2026-08', generation: 1,
    closedAt: '2026-09-01T00:00:00.000Z', closedBy: 'u-controller-a', note: null,
    reopenedBy: null, reopenedAt: null, reopenReason: null, ...over,
  });
  const closed = [gen({})];
  const reopened = [gen({ reopenedBy: 'u-controller-b', reopenedAt: '2026-09-02T00:00:00.000Z', reopenReason: 'late invoice' })];

  it('numbers each close, and a re-close does not overwrite the one before it', () => {
    expect(closePeriod([], { tenantId: 't-1', period: '2026-08', closedBy: 'u-controller-a' }).generation).toBe(1);
    expect(closePeriod(reopened, { tenantId: 't-1', period: '2026-08', closedBy: 'u-controller-a' }).generation).toBe(2);
  });

  it('refuses a second close instead of handing back the first', () => {
    // The old behaviour returned the existing row with a 201 — a caller reading `closedBy` found
    // somebody else's name against their own success.
    expect(() => closePeriod(closed, { tenantId: 't-1', period: '2026-08', closedBy: 'u-controller-b' }))
      .toThrow(/already closed/);
    expect(classifyDomainMessage('Finance period 2026-08 is already closed — reopen it before closing it again'))
      .toEqual({ status: 409, code: 'CONFLICT' });
  });

  it('refuses a reopen of a period that is not closed — 409, because the state is what is wrong', () => {
    expect(() => reopenPeriod([], '2026-08', 'u-controller-b', 'why')).toThrow(/is not currently closed/);
    // And a SECOND reopen lands here too: there is no longer a close to undo.
    expect(() => reopenPeriod(reopened, '2026-08', 'u-controller-c', 'again')).toThrow(/is not currently closed/);
    expect(classifyDomainMessage('Finance period 2026-08 is not currently closed'))
      .toEqual({ status: 409, code: 'CONFLICT' });
  });

  it('refuses a silent reopen — closing may carry an optional note, reopening may not', () => {
    expect(() => reopenPeriod(closed, '2026-08', 'u-controller-b', '  ')).toThrow(/a reason is required/);
    expect(() => reopenPeriod(closed, '2026-08', 'u-controller-b', undefined)).toThrow(/a reason is required/);
    expect(classifyDomainMessage('a reason is required to reopen a closed finance period — reopening the books cannot be silent').status)
      .toBe(400);
  });

  it('refuses the person who closed it, whatever permission they hold — 403', () => {
    expect(() => reopenPeriod(closed, '2026-08', 'u-controller-a', 'changed my mind'))
      .toThrow(/may not reopen their own close/);
    // Same shape and same classification as J1-07's self-approval: the request is well formed and the
    // record is at the right step; only the actor is wrong, and a different person can act right now.
    expect(classifyDomainMessage('the person who closed this period may not reopen their own close — a second signature is what makes it a control'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('binds the wildcard holder too — an admin is a person, not an exemption', () => {
    // r-admin holds '*', so no permission check can refuse this. The domain reads the RECORD.
    const adminClosed = [gen({ closedBy: 'u-admin' })];
    expect(() => reopenPeriod(adminClosed, '2026-08', 'u-admin', 'because I can'))
      .toThrow(/may not reopen their own close/);
    expect(reopenPeriod(adminClosed, '2026-08', 'u-controller-b', 'a second signature').reopenedBy).toBe('u-controller-b');
  });

  it('writes the reopen ONTO the close it undoes, keeping who closed it and when', () => {
    const r = reopenPeriod(closed, '2026-08', 'u-controller-b', 'late supplier invoice');
    expect(r.generation).toBe(1);
    expect(r.closedBy).toBe('u-controller-a');      // untouched
    expect(r.closedAt).toBe('2026-09-01T00:00:00.000Z'); // untouched
    expect(r.reopenedBy).toBe('u-controller-b');
    expect(r.reopenReason).toBe('late supplier invoice');
    expect(reopenSeparation(r)).toBe('enforced');
  });

  it('says unverifiable only where the close genuinely has no closer', () => {
    const anonymous = [gen({ closedBy: null })];
    expect(reopenSeparation(reopenPeriod(anonymous, '2026-08', 'u-controller-b', 'correction'))).toBe('unverifiable');
    expect(reopenSeparation(gen({}))).toBeNull(); // never reopened — not a verdict at all
  });
});
