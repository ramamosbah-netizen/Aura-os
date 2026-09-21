import { describe, expect, it } from 'vitest';
import { permissionMatches } from '@aura/shared';
import { STANDARD_ELV_ROLES } from '@aura/core';
import { scanRoutes } from '../scripts/route-permission-audit.mjs';

/**
 * A ROLE THAT MAY WRITE A RECORD MUST BE ABLE TO READ THE REGISTER IT WRITES INTO.
 *
 * This guard exists because the SEC-01 waves created the failure twice and nothing noticed either
 * time. Replacing a module wildcard with enumerated acts is the whole point of the programme — but
 * `hse.*` and `contracts.*` granted READS as well as writes, and both times only the writes were
 * written back out:
 *
 *   wave A   r-commercial-manager   could create, amend, sign, dispatch, complete and CANCEL a
 *                                   contract, and could not open the contract register, the clause
 *                                   library, the obligations, the certificates or the bonds.
 *   wave B   r-hse                  could raise an incident, request a permit, APPROVE it, expire
 *                                   it and close it, and could not list a single one of them.
 *
 * r-hse stood that way for five further waves. It read site, projects, engineering, hr and
 * documents without trouble — every module's register except its own — and no test asked. It
 * surfaced only because a CI step that asserts the actor CAN reach its own domain was failing, and
 * the first explanation (a grant naming a role id that does not exist) turned out to be a second,
 * separate bug sitting on top of this one.
 *
 * WHY IT IS PHRASED AGAINST ROUTES. "Every write needs a read" stated over permissions alone is
 * false: `hse.toolbox.record`, `hse.risk_assessment.create` and `contracts.ipc.create` are
 * service-side spellings of entities already covered, `crm.internal-pricing.access` is a gate and
 * not a register, and `intelligence.chat.create` has nothing to list. None of them publishes a
 * collection GET. So the question asked here is the one that can actually strand a user:
 *
 *   the role writes entity `m.e`, and the API PUBLISHES a collection read of `m.e`
 *   — does the role name that read?
 *
 * The route table is the same source the guard derives from at runtime, so this cannot drift from
 * what the product actually demands.
 */

type Row = { method: string; route: string; derived: string | null };

/** Collection reads only: `:id` routes need a row to exist, a register is what a person opens. */
const collectionReads = (): Set<string> => {
  const reads = new Set<string>();
  for (const r of scanRoutes() as Row[]) {
    if (r.method !== 'GET' || !r.derived) continue;
    if (r.route.includes(':')) continue;
    reads.add(r.derived);
  }
  return reads;
};

const WRITE_ACTIONS_EXCLUDED = new Set(['read']);

describe('every register a role writes into is one it can read', () => {
  const published = collectionReads();

  it('publishes collection reads at all — otherwise this whole file passes vacuously', () => {
    // Without this, a change that broke scanRoutes would turn the assertion below into "no rows,
    // no failures" and the guard would report green while checking nothing.
    expect(published.size).toBeGreaterThan(100);
    for (const canary of ['hse.ptw.read', 'contracts.contract.read', 'crm.account.read']) {
      expect(published, `${canary} must be in the published route surface`).toContain(canary);
    }
  });

  for (const role of STANDARD_ELV_ROLES) {
    // The administrator is a wildcard by design; asking this of it proves nothing either way.
    if (role.id === 'r-admin') continue;

    it(`${role.id} can read back everything it may write`, () => {
      const stranded: string[] = [];
      for (const p of role.permissions) {
        const parts = p.split('.');
        if (parts.length !== 3) continue;
        const [mod, entity, action] = parts;
        if (WRITE_ACTIONS_EXCLUDED.has(action) || entity === '*' || mod === '*') continue;

        const read = `${mod}.${entity}.read`;
        // Only entities the API actually publishes a register for.
        if (!published.has(read)) continue;
        if (!role.permissions.some((held) => permissionMatches(held, read))) {
          stranded.push(`${p} → cannot ${read}`);
        }
      }
      expect(stranded, `${role.name} writes records it is then refused:\n  ${stranded.join('\n  ')}`).toEqual([]);
    });
  }
});
