import { describe, expect, it } from 'vitest';
// The audit itself, not a second copy of it: a guard that re-implements the scan is a guard that can
// disagree with the report, and the disagreement surfaces as a build failing for a reason the report
// denies. One implementation, two consumers.
// @ts-expect-error — a plain .mjs script with no type declarations, imported deliberately.
import { GOVERNING_VERB, routeKey, scanRoutes, ungovernedMutations } from '../scripts/route-permission-audit.mjs';
import allowlist from './route-permission-allowlist.json';

/**
 * SEC-01 STAGE 2 — the count may only go down.
 *
 * A route with no explicit `@Permissions` is not ungoverned: `PermissionsGuard` derives a name from
 * its path. The failure mode nothing checked is that the derived name can belong to no vocabulary
 * any role speaks — so the route is reachable ONLY by a wildcard holder and refused for the role
 * whose job it is. Four findings came from that, every one tripped over while doing something else:
 *
 *   procurement.rfq.quotes                 no role could record a supplier quotation (QC-01)
 *   procurement.purchase-request.status    submission required approval authority (BUY-01)
 *   the purchase-order lifecycle           one permission owned issue, cancel and close (J3-01)
 *   crm.opportunity.scopes / .approve      the author cannot author, the approver cannot approve (J1-07)
 *
 * 423 mutating routes were in that state when this guard was written — 419 was the number it recorded,
 * and the four it missed are in the allowlist now, found by mutation-testing this very test. 417 are
 * in that state today, the six that left being J1-07. Fixing them is staged work — 65 of them end in a
 * GOVERNING VERB and each needs its own maker/checker question answered, which is not a rename. What
 * this test does is stop the number growing while that happens, and make every fix visible: the
 * allowlist is the debt, written down, and it may only shrink.
 *
 * WHY AN ALLOWLIST AND NOT A THRESHOLD. A count ("no more than 419") lets one route be fixed and
 * another appear with nothing to show for it. Naming them means a new one fails by name, and a fixed
 * one must be deleted from the list by hand — which is the moment somebody confirms it really is
 * fixed rather than merely moved.
 */

const allowed = new Set<string>(allowlist.routes);

describe('SEC-01 — no NEW route manufactures a business fact under an unnamed permission', () => {
  it('every mutating ungoverned route is one already recorded as debt', () => {
    const current = ungovernedMutations().map(routeKey) as string[];
    const additions = current.filter((k) => !allowed.has(k)).sort();

    expect(
      additions,
      'These routes MUTATE and derive a permission no shipped role names, so only a wildcard holder ' +
      'can reach them and the role whose job it is cannot. Either declare the permission the route ' +
      'needs — in the vocabulary the roles already speak — or, if this is genuinely new debt you are ' +
      'accepting on purpose, add it to route-permission-allowlist.json and say why in the commit.',
    ).toEqual([]);
  });

  it('every recorded route is STILL ungoverned — a fixed one must leave the list', () => {
    const current = new Set(ungovernedMutations().map(routeKey) as string[]);
    const stale = [...allowed].filter((k) => !current.has(k)).sort();

    // Without this the list would never shrink: a route could be fixed and its entry linger, and the
    // number would stop meaning anything long before it reached zero.
    //
    // It also guards the SCAN, which is how the list earns its keep twice. Four of these entries are
    // routes the scanner used to miss (it read a neighbour's `@Permissions` as this route's own); if
    // that window ever regresses they vanish from the scan and show up here as stale, naming the
    // defect instead of quietly shrinking the total.
    expect(
      stale,
      'These are governed now — delete them from route-permission-allowlist.json. The list is the ' +
      'outstanding debt, and an entry that is no longer true makes the total a fiction.',
    ).toEqual([]);
  });

  it('the governing verbs are counted, because those are the ones that decide things', () => {
    const governing = (ungovernedMutations() as Array<{ derived: string }>)
      .filter((r) => GOVERNING_VERB.test(r.derived));

    // approve, award, certify, issue, close, reject, submit, freeze, post… Each manufactures an
    // authority fact, an external release or an irreversible state change. This asserts the number
    // never rises; stage 3 brings it down.
    expect(governing.length).toBeLessThanOrEqual(allowlist.governingVerbs);
  });

  it('the scan still finds the findings it was written after', () => {
    // A scan that quietly stops matching routes would report an empty list and pass every assertion
    // above. These are known to be in this state, so their absence means the scan is broken rather
    // than the codebase fixed.
    //
    // `crm.opportunity.scopes` and `crm.opportunity.approve` USED TO BE two of these three, and were
    // removed when J1-07 gave those routes declared permissions — the canary going quiet was the
    // evidence the fix reached the routing layer. Replacing a fixed canary by hand is deliberate: it
    // is the moment somebody confirms the name left the derived set because the route is governed,
    // not because the scan broke. `finance.period.close` is NOT used here on purpose — it is the next
    // remediation, and a canary that is about to be fixed teaches nothing.
    const derived = new Set((scanRoutes() as Array<{ derived: string }>).map((r) => r.derived));
    for (const known of ['procurement.rfq.quotes', 'subcontracts.claim.certify', 'hse.ptw.approve']) {
      expect(derived, `${known} must still be found — if it is not, this guard is blind`).toContain(known);
    }
  });
});
