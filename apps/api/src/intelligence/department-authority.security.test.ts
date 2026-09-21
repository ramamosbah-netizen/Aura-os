import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { classifyDomainMessage } from '../common/all-exceptions.filter';

/**
 * SEC-01 stage 3, wave F — THE LAST WAVE, and the one where the finding was absence.
 *
 * FOUR ENTIRE MODULES HELD NO WRITE PERMISSION ON ANY SHIPPED ROLE. Measured across the whole
 * catalogue excluding the administrator:
 *
 *   amc           14 mutating routes   roles holding any write: NONE
 *   fleet         16                   NONE
 *   assets         8                   NONE
 *   intelligence   7                   NONE
 *
 * Terminating a maintenance contract, disposing of a company asset, paying a traffic fine and
 * executing an AI proposal against the business were administrator-only — not because anyone
 * decided they should be, but because the departments were never written down. That is the same
 * finding as document control in wave C and HR in wave A, and this is the fifth and sixth time.
 *
 * The records matched the authority: a work order recorded no actor anywhere, a traffic fine was
 * CHARGED TO A DRIVER by nobody, and the AI autonomy proposal carried `decided_by` and no
 * `proposed_by` — `propose()` took an actorId and dropped it.
 */

const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, p: string) => role(roleId).permissions.some((x) => permissionMatches(x, p));
const names = (roleId: string, p: string) => role(roleId).permissions.includes(p);
const anyoneButAdmin = (p: string) =>
  ELV_ROLE_MATRIX.filter((r) => r.id !== 'r-admin' && r.permissions.some((x) => permissionMatches(x, p))).map((r) => r.id);

describe('Wave F — four departments nobody could operate', () => {
  it('gives AMC a role at all — it had none', () => {
    expect(ELV_ROLE_MATRIX.map((r) => r.id)).toContain('r-service-manager');
    for (const p of ['amc.contract.create', 'amc.contract.terminate', 'amc.ticket.resolve',
      'amc.work-order.complete', 'amc.work-order.cancel', 'amc.ppm-schedule.create']) {
      expect(names('r-service-manager', p), `the Service Manager must name ${p}`).toBe(true);
    }
    // It runs the service that follows handover; it does not write the records it maintains against.
    for (const p of ['commissioning.handover.accept', 'assets.disposal.create', 'projects.project.update']) {
      expect(holds('r-service-manager', p), `the Service Manager must NOT hold ${p}`).toBe(false);
    }
  });

  it('puts the asset register on the role that already runs the stores', () => {
    for (const p of ['assets.asset.create', 'assets.asset.dispose', 'assets.disposal.create',
      'assets.maintenance.complete', 'assets.inspection.create']) {
      expect(names('r-store', p), `the Storekeeper must name ${p}`).toBe(true);
    }
  });

  it('puts the fleet on the role that already administers staff', () => {
    for (const p of ['fleet.vehicle.create', 'fleet.maintenance.complete', 'fleet.fine.assign',
      'fleet.fine.pay', 'fleet.salik.allocate']) {
      expect(names('r-hr-manager', p), `the HR Manager must name ${p}`).toBe(true);
    }
    // A fine CHARGED TO A DRIVER is a deduction against a person, which is why it sits here and
    // why the record now says who decided it.
    expect(holds('r-site-engineer', 'fleet.fine.assign')).toBe(false);
  });

  it('puts the AI decision with management, and leaves proposing open', () => {
    // Executing an autonomy proposal is the machine acting on the business. Raising one is not
    // restricted — reviewing what the machine suggests is the entire point of keeping the record.
    expect(names('r-executive', 'intelligence.proposal.execute')).toBe(true);
    expect(names('r-executive', 'intelligence.proposal.reject')).toBe(true);
    for (const r of ['r-site-engineer', 'r-store', 'r-service-manager']) {
      expect(holds(r, 'intelligence.proposal.execute'), `${r} must NOT execute an AI proposal`).toBe(false);
    }
  });

  it('leaves none of the twelve acts reachable by the administrator alone', () => {
    // THE WAVE IN ONE ASSERTION. Every one of these returned an empty list before.
    for (const act of [
      'amc.contract.terminate', 'amc.work-order.cancel', 'amc.work-order.complete', 'amc.ticket.resolve',
      'assets.disposal.create', 'assets.maintenance.complete',
      'fleet.maintenance.complete', 'fleet.fine.assign', 'fleet.fine.pay',
      'intelligence.proposal.execute', 'intelligence.proposal.reject',
      'inventory.serial.issue',
    ]) {
      expect(anyoneButAdmin(act), `${act} is still administrator-only`).not.toEqual([]);
    }
  });

  it('classifies the two refusals this wave adds', () => {
    // The proposer applying their own proposal is the wrong ACTOR, not a bad request.
    expect(classifyDomainMessage('the person who raised this proposal may not execute it — applying a suggested change to the business is the review of it, not a second half of making it'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });
    // A decision already taken is a state conflict.
    expect(classifyDomainMessage('this proposal is already executed — a decision on it has been made and does not get remade').status).toBe(409);
  });
});
