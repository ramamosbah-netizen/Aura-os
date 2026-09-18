import { describe, expect, it } from 'vitest';
import { FINANCE_OPERATION_ENTITIES, STANDARD_ELV_ROLES } from '@aura/core';
import { permissionMatches } from '@aura/shared';
// @ts-expect-error — a plain .mjs script with no type declarations, imported deliberately.
import { scanRoutes } from '../scripts/route-permission-audit.mjs';

/**
 * THE WILDCARD MUST NOT COME BACK, and the list that replaced it must not go stale.
 *
 * `r-finance` carried `finance.*`. That single pattern granted closing and reopening the fiscal
 * period alongside invoices, receipts, payments and cash, so declaring `finance.period.close` and
 * `.reopen` on the routes would have changed nothing at all. Removing it is the other half of that
 * fix — and it creates a new failure mode: an enumerated list that nobody updates.
 *
 * A stale list locks the Finance role out of a feature it should have. The obvious remedy at that
 * point is to put `finance.*` back, which silently re-grants the two acts this work took away. So the
 * list is checked against the routes the API actually serves, and a new finance entity fails HERE,
 * with the choice named: add it to the operations list, or decide it is an authority act and leave it
 * out on purpose.
 */

const financeRole = STANDARD_ELV_ROLES.find((r) => r.id === 'r-finance')!;
const controller = STANDARD_ELV_ROLES.find((r) => r.id === 'r-finance-controller')!;
const holds = (role: typeof financeRole, permission: string) =>
  role.permissions.some((p) => permissionMatches(p, permission));

/** Entities deliberately NOT in the operations list, with the reason they are authority acts. */
const AUTHORITY_ENTITIES: Record<string, string> = {
  period: 'closing and reopening the books — r-finance-controller holds these; r-finance reads them',
};

describe('finance authority — the operational role does not close its own books', () => {
  it('never carries a module-wide finance wildcard again', () => {
    expect(
      financeRole.permissions.filter((p) => /^finance\.\*/.test(p)),
      'A `finance.*` on r-finance re-grants finance.period.close and .reopen no matter what the ' +
      'routes declare. If Finance is missing something, add the entity to FINANCE_ENTITIES in ' +
      'standard-elv-roles.ts — the wildcard is not the way back.',
    ).toEqual([]);
    expect(holds(financeRole, 'finance.period.close')).toBe(false);
    expect(holds(financeRole, 'finance.period.reopen')).toBe(false);
  });

  it('covers every finance entity the API routes, except the ones held back on purpose', () => {
    const routed = new Set(
      (scanRoutes() as Array<{ derived: string }>)
        .map((r) => r.derived)
        .filter((d) => d.startsWith('finance.'))
        .map((d) => d.split('.')[1]),
    );
    const listed = new Set(FINANCE_OPERATION_ENTITIES);
    const missing = [...routed].filter((e) => !listed.has(e) && !(e in AUTHORITY_ENTITIES)).sort();

    expect(
      missing,
      'These finance entities are served by the API and are in neither list. Either they are ' +
      'ordinary finance operations — add them to FINANCE_ENTITIES so r-finance can reach them — or ' +
      'they are authority acts like period close, in which case add them to AUTHORITY_ENTITIES here ' +
      'with the role that holds them. Leaving them unlisted quietly locks Finance out.',
    ).toEqual([]);
  });

  it('keeps the operations list honest in the other direction too', () => {
    // An entity listed here that the API does not serve is not harmful, but it is a claim about the
    // system that stopped being true, and this list is read as the definition of "finance operations".
    const routed = new Set(
      (scanRoutes() as Array<{ derived: string }>)
        .map((r) => r.derived).filter((d) => d.startsWith('finance.')).map((d) => d.split('.')[1]),
    );
    // Entities reachable only through declared @Permissions (not derived) are legitimately absent
    // from the scan, so this asserts the overlap is substantial rather than demanding an exact match.
    const stillRouted = FINANCE_OPERATION_ENTITIES.filter((e) => routed.has(e));
    expect(stillRouted.length).toBeGreaterThanOrEqual(FINANCE_OPERATION_ENTITIES.length - 2);
  });

  it('keeps the controller out of the work it signs off', () => {
    // The point of moving the two acts is separation. A controller that could also post journals or
    // approve invoices would be closing a period over its own entries.
    for (const permission of ['finance.journal.post', 'finance.invoice.approve', 'finance.payment.create']) {
      expect(holds(controller, permission), `r-finance-controller must not hold ${permission}`).toBe(false);
    }
    expect(controller.permissions).toContain('finance.period.close');
    expect(controller.permissions).toContain('finance.period.reopen');
  });
});
