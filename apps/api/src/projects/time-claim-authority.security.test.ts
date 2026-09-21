import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { classifyDomainMessage } from '../common/all-exceptions.filter';
import { makeEotClaim, submitEotClaim, decideEotClaim, eotSeparation, type EotClaim } from '@aura/projects';
import { ProjectsController } from './projects.controller';

/**
 * SEC-01 stage 3, wave E — projects. ONE PERMISSION GOVERNED EVERY DELAY AND EOT ACT, AND IT WAS
 * THE WRONG ONE.
 *
 * `assertProjectAccess` asserted `projects.project.update` — "edit the project" — for creating a
 * delay event, assessing it, raising an EOT claim, submitting it and DETERMINING it. Measured
 * against the shipped catalogue:
 *
 *   r-commercial-manager  NAMES projects.eot-claim.*  holds projects.project.update? NO
 *   r-planning-engineer   NAMES projects.delay.*      holds projects.project.update? NO
 *   r-pm                  holds projects.*            so it did all of them
 *
 * The role whose job an EOT claim IS could not touch one — 403 against the running API, creating a
 * claim in its own module — the Planning Engineer could not assess the delay behind it, and the one
 * role that could do either submitted a claim and determined the same claim.
 *
 * The claim also recorded nobody who made it: the table had `submitted_at`, `decided_at` and
 * `decided_by`, and NO `created_by` and NO `submitted_by`. Where an actor was recorded, the
 * controller wrote `decidedBy: ctx.actorId ?? 'system'` — a principal in no roster.
 */

const declared = (h: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, h as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, p: string) => role(roleId).permissions.some((x) => permissionMatches(x, p));
const names = (roleId: string, p: string) => role(roleId).permissions.includes(p);

const QS = 'u-commercial-manager';
const PM = 'u-project-manager';

const claim = (): EotClaim =>
  makeEotClaim({ tenantId: 't1', projectId: 'p1', claimNumber: 1, title: 'Delayed access to level 3', submittedDays: 14, createdBy: QS });

describe('Wave E — a time claim and its determination are two hands', () => {
  it('declares a permission on each of the four governing acts', () => {
    const p = ProjectsController.prototype;
    expect(declared(p.cancelProject)).toEqual(['projects.project.cancel']);
    expect(declared(p.setQuantityBaseline)).toEqual(['projects.quantity-ledger.baseline']);
    expect(declared(p.createEotClaim)).toEqual(['projects.eot-claim.create']);
    expect(declared(p.submitEotClaim)).toEqual(['projects.eot-claim.submit']);
    expect(declared(p.decideEotClaim)).toEqual(['projects.eot-claim.decide']);
  });

  it('records the author and the submitter — the table had neither column', () => {
    const c = claim();
    expect(c.createdBy).toBe(QS);
    expect(c.submittedBy).toBeNull();
    const sent = submitEotClaim(c, QS);
    expect(sent.status).toBe('submitted');
    expect(sent.submittedBy).toBe(QS);
    expect(sent.submittedAt).not.toBeNull();
  });

  it('refuses the submitter their own determination — 403, the actor is wrong and nothing else', () => {
    const sent = submitEotClaim(claim(), QS);
    expect(() => decideEotClaim(sent, { status: 'approved', approvedDays: 10 }, QS))
      .toThrow(/may not determine it/);
    expect(classifyDomainMessage('the person who submitted this EOT claim may not determine it — a claim out and a determination back are two sides of one exchange'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('refuses a determination on a claim that was never sent', () => {
    // Answering a claim the client never received. The status graph already said so; the service
    // now honours it rather than assuming it.
    expect(() => decideEotClaim(claim(), { status: 'approved', approvedDays: 10 }, PM))
      .toThrow(/can only be determined once it has been submitted/);
    expect(classifyDomainMessage('an EOT claim can only be determined once it has been submitted (this one is draft)').status).toBe(409);
  });

  it('lets the two-person path through and reports the separation', () => {
    const decided = decideEotClaim(submitEotClaim(claim(), QS), { status: 'partially_approved', approvedDays: 9 }, PM);
    expect(decided.status).toBe('partially_approved');
    expect(decided.approvedDays).toBe(9);
    expect(decided.decidedBy).toBe(PM);
    expect(eotSeparation(decided)).toBe('enforced');
    expect(eotSeparation(claim())).toBeNull(); // undetermined — not a verdict at all
  });

  it('records an unsigned determination as unsigned, rather than as "system"', () => {
    // The controller wrote `ctx.actorId ?? 'system'`, so an unauthenticated determination named a
    // principal that exists in no roster and read afterwards as though somebody had made it.
    const decided = decideEotClaim(submitEotClaim(claim(), QS), { status: 'rejected', approvedDays: 0 }, null);
    expect(decided.decidedBy).toBeNull();
    expect(eotSeparation(decided)).toBeNull();
  });

  it('splits the claim from its determination across the two roles', () => {
    expect(role('r-pm').permissions).not.toContain('projects.*');
    for (const p of ['projects.eot-claim.create', 'projects.eot-claim.submit']) {
      expect(names('r-commercial-manager', p), `Commercial/QS must name ${p}`).toBe(true);
    }
    expect(holds('r-commercial-manager', 'projects.eot-claim.decide'), 'Commercial/QS must NOT determine its own claim').toBe(false);
    expect(names('r-pm', 'projects.eot-claim.decide')).toBe(true);
    expect(holds('r-pm', 'projects.eot-claim.submit'), 'the PM must not submit the claim it determines').toBe(false);
  });

  it('gives the roles that name a capability the permission the code actually asks for', () => {
    // THE WAVE E FINDING IN ONE ASSERTION. Both of these named their act and held nothing the
    // service checked, so the capability did not reach the route behind it.
    expect(holds('r-planning-engineer', 'projects.delay.assess'), 'the Planning Engineer assesses delays').toBe(true);
    expect(holds('r-commercial-manager', 'projects.eot-claim.create'), 'Commercial/QS raises the claim').toBe(true);
  });

  it('keeps the quantity baseline with the valuation authority, and with delivery', () => {
    for (const r of ['r-commercial-manager', 'r-pm']) {
      expect(holds(r, 'projects.quantity-ledger.baseline'), `${r} may set the sold quantity`).toBe(true);
    }
    expect(holds('r-site-engineer', 'projects.quantity-ledger.baseline')).toBe(false);
  });

  it('leaves no projects write wildcard on any role but the administrator', () => {
    for (const r of ELV_ROLE_MATRIX) {
      if (r.id === 'r-admin') continue;
      expect(r.permissions, `${r.id} holds projects.*`).not.toContain('projects.*');
    }
  });
});
