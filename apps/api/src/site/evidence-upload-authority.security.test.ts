import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { SiteController } from './site.controller';

/**
 * SIT-04 / J4-01 — the door site did not have.
 *
 * The finding was that a daily report "displays photos/signature without saving them with the
 * record". The cause was structural rather than a bug in a handler: EVERY multipart upload route
 * in AURA lived in CRM and Tendering, and the generic `/documents` route stores inline text by
 * its own description. `POST daily-reports/:id/evidence` took a `fileId`, and no site route could
 * produce one — so a site engineer could photograph a riser and had nowhere to put it.
 *
 * This pins the two properties of the new route that are easy to lose later.
 */

const perms = (method: string): string[] =>
  (Reflect.getMetadata('permissions', (SiteController.prototype as Record<string, unknown>)[method] as object) as string[]) ?? [];

const holders = (p: string) =>
  ELV_ROLE_MATRIX.filter((r) => r.id !== 'r-admin' && r.permissions.some((x) => permissionMatches(x, p))).map((r) => r.id);

describe('uploading a day\'s evidence', () => {
  it('DECLARES its permission rather than letting it be derived', () => {
    // PermissionsGuard derives `module.entity.action` from the path when nothing is declared.
    // For `POST site/daily-reports/:id/evidence/upload` that derivation is
    // `site.daily-report.upload` — a name no role in the catalogue holds. The route would exist,
    // look governed, and be reachable by nobody but a wildcard. This is exactly the failure the
    // route audit exists to find, and the reason the decorator is explicit here.
    expect(perms('uploadEvidence')).toEqual(['site.daily-report.evidence']);
  });

  it('takes the SAME authority as attaching evidence by id — no new permission is invented', () => {
    // Attaching a photograph is one act whichever door it arrives through. A second permission
    // would let the two doors drift apart, and SEC-01's authority is frozen.
    const declared = perms('uploadEvidence')[0];
    expect(holders(declared)).toEqual(['r-site-engineer']);
    // …and the sibling route it must not diverge from.
    expect(holders('site.daily-report.evidence')).toEqual(['r-site-engineer']);
  });

  it('is not reachable by roles that do not work the site', () => {
    for (const roleId of ['r-finance', 'r-sales', 'r-hr', 'r-procurement']) {
      const role = ELV_ROLE_MATRIX.find((r) => r.id === roleId);
      expect(role, roleId).toBeTruthy();
      expect(
        role!.permissions.some((x) => permissionMatches(x, 'site.daily-report.evidence')),
        `${roleId} must not be able to attach site evidence`,
      ).toBe(false);
    }
  });
});
