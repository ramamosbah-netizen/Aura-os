import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { TenderingController } from './tendering.controller';

/**
 * TENDERING — SEC-01 stage 3, wave A.
 *
 * NOTHING HERE WAS BROKEN, and that is worth writing down as plainly as the three waves that were.
 * Both governed transitions already record their actor. `won` is already refused on the generic
 * status route (ADR-0021) and routed through `award()`. `submitted` is already routed through
 * `submit()`, so "submitted implies a submission record" holds by construction rather than by
 * convention. The state machine was in order before this touched it.
 *
 * What was wrong is narrower: NO ROLE NAMED ANY TENDERING ACT. The Sales Manager held `tendering.*`,
 * one pattern covering preparation, Q&A traffic, putting a priced offer in front of a customer, and
 * capturing an award that auto-creates a Contract and closes the source Opportunity as Won — and,
 * more to the point, covering every act added to the module in future the moment it exists.
 *
 * NO NEW SEPARATION IS INVENTED. Submission is already gated on three approvals held by other people
 * — an approved technical study, an approved quantity take-off and an internally approved commercial
 * offer — which is a stronger control than a second signature, and recording the customer's award is
 * capturing an external fact rather than approving one's own work. A gate at either point would be
 * inventing a control, not closing a hole.
 */

const declared = (h: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, h as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, p: string) => role(roleId).permissions.some((x) => permissionMatches(x, p));
const names = (roleId: string, p: string) => role(roleId).permissions.includes(p);

describe('tendering — the customer-facing acts are named', () => {
  it('declares a permission on the two governed transitions', () => {
    const p = TenderingController.prototype;
    expect(declared(p.submit)).toEqual(['tendering.tender.submit']);
    expect(declared(p.award)).toEqual(['tendering.tender.award']);
    expect(declared(p.changeStatus)).toEqual(['tendering.tender.status']);
    expect(declared(p.create)).toEqual(['tendering.tender.create']);
    expect(declared(p.update)).toEqual(['tendering.tender.update']);
  });

  it('no longer grants every tendering act by the module it lives in', () => {
    // THE WILDCARD IS GONE. This is the assertion that makes the rest mean anything: with
    // `tendering.*` in place, an act added to this module tomorrow is granted to this role the moment
    // it exists, without anybody deciding that.
    expect(role('r-sales-manager').permissions).not.toContain('tendering.*');
    expect(role('r-sales-manager').permissions.filter((p) => /^tendering\.\*$/.test(p))).toEqual([]);

    // …and the role keeps, by name, everything it was doing.
    for (const p of [
      'tendering.tender.create', 'tendering.tender.update', 'tendering.tender.status',
      'tendering.tender.submit', 'tendering.tender.award',
      'tendering.tender.clarifications', 'tendering.tender.answer',
      'tendering.bid-score.create', 'tendering.bid-score.amend', 'tendering.outcome.create',
      'tendering.estimate.create', 'tendering.internal-pricing.access',
    ]) {
      expect(holds('r-sales-manager', p), `the Sales Manager must still hold ${p}`).toBe(true);
    }
  });

  it('keeps the two customer-facing acts out of every other role', () => {
    // Everyone else in the tender chain reads, prepares or approves a component. Nobody else puts the
    // offer in front of the customer or records what the customer decided.
    for (const roleId of ['r-sales', 'r-estimator', 'r-pre-sales', 'r-technical-manager', 'r-commercial-manager', 'r-executive']) {
      for (const p of ['tendering.tender.submit', 'tendering.tender.award']) {
        expect(holds(roleId, p), `${roleId} must not hold ${p}`).toBe(false);
      }
    }
    expect(names('r-sales-manager', 'tendering.tender.submit')).toBe(true);
    expect(names('r-sales-manager', 'tendering.tender.award')).toBe(true);
  });

  it('leaves the component approvals where they already were', () => {
    // The real control on a submission is upstream: three approvals held by three other people. This
    // asserts the split that makes the submission gate meaningful, and that this work did not move it.
    expect(holds('r-technical-manager', 'tendering.study.approve')).toBe(true);
    expect(holds('r-technical-manager', 'tendering.takeoff.approve')).toBe(true);
    expect(holds('r-pre-sales', 'tendering.study.create')).toBe(true);
    expect(holds('r-estimator', 'tendering.estimate.create')).toBe(true);
    // …and none of those roles can submit the bid they contributed to.
    for (const roleId of ['r-technical-manager', 'r-pre-sales', 'r-estimator']) {
      expect(holds(roleId, 'tendering.tender.submit'), `${roleId} must not submit`).toBe(false);
    }
  });
});
