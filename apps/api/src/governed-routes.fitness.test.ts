import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
 * and the four it missed are in the allowlist now, found by mutation-testing this very test. 303 are
 * in that state today. WAVES A AND B ARE COMPLETE: every governing verb in subcontracts, finance,
 * procurement, tendering, HR, contracts and hse is gone from this list, and 32 remain across the
 * modules the programme has not reached — doccontrol 7, commissioning 4, projects 4, site 4, crm 3,
 * quality 3, and one or two each in amc, assets, engineering, fleet, intelligence and inventory.
 * Each needs its own maker/checker question answered, which is not a rename. What
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

  it('the tombstones are still tombstones', () => {
    // Two routes are excluded from the scan because their handlers are declared `(): never` — they
    // manufacture no business fact and exist only to refuse and say where the act went. That
    // exclusion must not become a hiding place: turning either back into a working handler puts it
    // straight back into the count, and this asserts the shape the exclusion depends on.
    const controllers = readFileSync(
      resolve(__dirname, 'procurement/procurement.controller.ts'), 'utf8');
    expect(controllers).toMatch(/awardRfq\(\): never \{/);
    expect(controllers).toMatch(/changePoStatus\(\): never \{/);
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
    // not because the scan broke. `subcontracts.claim.certify` and then `procurement.rfq.quotes` were
    // each one of these until their wave landed, and have been replaced in turn. A canary is never
    // chosen from the next remediation, for the obvious reason that it is about to stop being true.
    // `hr.timesheet.approve` was one of these until wave A reached HR, and `hse.ptw.approve` until
    // wave B reached HSE. Both have been replaced in turn.
    const derived = new Set((scanRoutes() as Array<{ derived: string }>).map((r) => r.derived));
    for (const known of ['doccontrol.transmittal.send', 'site.daily-report.approve', 'quality.itp.close']) {
      expect(derived, `${known} must still be found — if it is not, this guard is blind`).toContain(known);
    }
  });
});
