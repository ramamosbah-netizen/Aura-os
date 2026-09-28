import { describe, expect, it } from 'vitest';
import { STANDARD_ELV_ROLES } from '@aura/core';
import { permissionMatches } from '@aura/shared';
// @ts-expect-error — a plain .mjs script with no type declarations, imported deliberately.
import { routeKey, ungovernedMutations } from '../scripts/route-permission-audit.mjs';
import baseline from './sec01-stage4-baseline.json';

/**
 * SEC-01 STAGE 4, WAVE G — NAMED WITHOUT CHANGING WHO MAY ACT, AND NOTHING DECIDED FOR THE OWNER.
 *
 * Wave G wrote down, by name, 97 permissions that shipped roles already reached through wildcards.
 * Two things could go wrong in doing that, and both would be invisible in a role file diff:
 *
 *   1. A name lands on a role that did NOT reach it before — a grant disguised as a rename.
 *   2. A name the owner has not decided yet (D-01…D-13: payments, VAT filing, engineering review,
 *      variation status, compliance…) lands on anybody at all — an authority decision taken by
 *      whoever edited the file.
 *
 * `sec01-stage4-baseline.json` is the record taken BEFORE the wave: each route, its derived name,
 * and the non-admin roles that reached it then. This holds the catalogue to it. The one deliberate
 * change — saved views and favourites, which only the administrator could reach — is asserted as a
 * change, not hidden in the comparison.
 */
type Entry = { route: string; derived: string; group: string; decision: string | null; holdersBefore: string[] };
const routes = (baseline as { routes: Entry[] }).routes;
const nonAdmin = STANDARD_ELV_ROLES.filter((r) => r.id !== 'r-admin');
const reachers = (name: string) => nonAdmin.filter((r) => r.permissions.some((p) => permissionMatches(p, name))).map((r) => r.id).sort();
const namers = (name: string) => STANDARD_ELV_ROLES.filter((r) => (r.permissions as readonly string[]).includes(name)).map((r) => r.id).sort();
const ADMIN = STANDARD_ELV_ROLES.find((r) => r.id === 'r-admin')!;
/** Saved views and favourites: personal, and the one intended widening of this wave. */
const INTENDED_WIDENING = new Set(['views.view.create', 'views.view.delete', 'views.favorite.create']);

describe('SEC-01 stage 4 — wave G named what roles already reached, and decided nothing', () => {
  it('the baseline is the whole stage-4 list: 97 to name, 52 for the owner, 2 webhooks', () => {
    const count = (g: string) => routes.filter((r) => r.group === g).length;
    expect(routes).toHaveLength(151);
    expect(count('name-on-current-holders') + count('staff-personal') + count('stays-administration')).toBe(97);
    expect(count('owner-decision')).toBe(52);
    expect(count('machine-inbound')).toBe(2);
  });

  it('a named route is reached by EXACTLY the roles that reached it before, and each of them names it', () => {
    for (const r of routes.filter((x) => x.group === 'name-on-current-holders')) {
      expect(reachers(r.derived), `${r.route} (${r.derived}): who may act changed`).toEqual(r.holdersBefore);
      for (const role of r.holdersBefore) {
        expect(namers(r.derived), `${r.route}: ${role} reaches ${r.derived} but does not NAME it`).toContain(role);
      }
    }
  });

  it('the staff base names the user’s own work; saved views and favourites are the one widening', () => {
    for (const r of routes.filter((x) => x.group === 'staff-personal')) {
      const staff = nonAdmin.filter((role) => (role.permissions as readonly string[]).includes('work-items.*'));
      expect(staff.length, 'every staff role carries the staff base').toBeGreaterThan(20);
      for (const role of staff) {
        expect(role.permissions as readonly string[], `${role.id} must name ${r.derived}`).toContain(r.derived);
      }
      if (INTENDED_WIDENING.has(r.derived)) {
        expect(r.holdersBefore, `${r.derived} was the administrator's alone before — the defect this fixes`).toEqual([]);
      } else {
        expect(reachers(r.derived), `${r.route}: who may act changed`).toEqual(r.holdersBefore);
      }
    }
  });

  it('system administration is named on the administrator, and on nobody else', () => {
    for (const r of routes.filter((x) => x.group === 'stays-administration')) {
      expect(ADMIN.permissions as readonly string[], `r-admin must name ${r.derived}`).toContain(r.derived);
      expect(reachers(r.derived), `${r.derived} is administration, not a business role's`).toEqual([]);
    }
  });

  it('NO ROLE names a permission the owner has not decided (D-01…D-13), and nobody new reaches one', () => {
    for (const r of routes.filter((x) => x.group === 'owner-decision')) {
      expect(namers(r.derived), `${r.derived} is under owner decision ${r.decision} — naming it decides it`).toEqual([]);
      expect(reachers(r.derived), `${r.route}: the holders of an undecided act changed`).toEqual(r.holdersBefore);
    }
  });

  it('the allowlist now holds exactly the owner decisions — the webhooks are signed, not granted', () => {
    const still = new Set(ungovernedMutations().map(routeKey) as string[]);
    // The two inbound webhooks left it as authentication work (@SignedInbound, pinned by
    // signed-inbound.fitness.test.ts) — and no role gained them: that is asserted by the checks above
    // only for the groups they cover, so it is asserted for the webhooks here.
    for (const r of routes.filter((x) => x.group === 'machine-inbound')) {
      expect(reachers(r.derived), `${r.route} is a machine's, not a role's`).toEqual([]);
      expect(namers(r.derived), `${r.route} must not be solved by naming a role`).toEqual([]);
    }
    const expected = routes.filter((r) => r.group === 'owner-decision').map((r) => r.route);
    for (const route of expected) expect(still, `${route} should still be awaiting its decision`).toContain(route);
    for (const r of routes.filter((x) => !expected.includes(x.route))) {
      expect(still, `${r.route} was named in wave G and must be governed`).not.toContain(r.route);
    }
  });
});
