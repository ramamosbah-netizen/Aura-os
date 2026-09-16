import { describe, it, expect } from 'vitest';
import {
  mayCountAsWorkPackageDelivery,
  deliveredToWorkPackage,
  issuedWithoutWorkPackage,
  destinationState,
  type MovementFacts,
} from './work-package-delivery';

/**
 * `BUY-07` — what counts as delivered to a work package.
 *
 * The invariant under test: an issue counted as delivered to a work package must carry an explicit
 * validated `wbsNodeId`; absence means UNKNOWN, never zero and never inferred from `boqItemId`.
 */

const move = (over: Partial<MovementFacts> = {}): MovementFacts => ({
  direction: 'out', quantity: 10, unitCost: 5,
  projectId: 'p-1', boqItemId: 'boq-1', wbsNodeId: 'wbs-1',
  ...over,
});

describe('an issue counts as delivered only when it names the work package', () => {
  it('counts an issue that declares a destination', () => {
    expect(mayCountAsWorkPackageDelivery(move())).toEqual({ eligible: true });
  });

  it('refuses to count an issue with no work package, however well coded it otherwise is', () => {
    // This is the BUY-06 shape and it stays valid as a movement — it is simply not a work-package
    // delivery, because nobody said which package it went to.
    const verdict = mayCountAsWorkPackageDelivery(move({ wbsNodeId: null }));
    expect(verdict).toEqual({ eligible: false, reason: 'no_work_package_declared' });
  });

  it('refuses an uncoded warehouse movement', () => {
    expect(mayCountAsWorkPackageDelivery(move({ projectId: null, wbsNodeId: null })))
      .toEqual({ eligible: false, reason: 'not_project_coded' });
  });

  /**
   * THE CLAUSE WITH TEETH. A resolver that matched on `boqItemId` would report the SAME material as
   * delivered to both packages below — 10 issued becoming 20 delivered — and would do it while
   * looking more complete than the truth.
   */
  it('NEVER infers the destination from boqItemId, even when work packages share one', () => {
    const undeclared = move({ wbsNodeId: null, boqItemId: 'boq-shared' });
    expect(mayCountAsWorkPackageDelivery(undeclared).eligible).toBe(false);

    // Two packages measure against the same BOQ item. Neither may claim the movement.
    expect(deliveredToWorkPackage('wbs-a', [undeclared]).quantity).toBe(0);
    expect(deliveredToWorkPackage('wbs-b', [undeclared]).quantity).toBe(0);
    expect(deliveredToWorkPackage('wbs-a', [undeclared]).movements).toBe(0);
  });
});

describe('what has been delivered to one work package', () => {
  it('counts only the movements that named it', () => {
    const d = deliveredToWorkPackage('wbs-1', [
      move({ quantity: 10 }),
      move({ quantity: 4, wbsNodeId: 'wbs-2' }),
      move({ quantity: 7, wbsNodeId: null }),
    ]);
    expect(d.quantity).toBe(10);
    expect(d.value).toBe(50);
    expect(d.movements).toBe(1);
  });

  it('nets a return coded to the SAME package, because what came back was not delivered', () => {
    const d = deliveredToWorkPackage('wbs-1', [
      move({ direction: 'out', quantity: 20, unitCost: 6 }),
      move({ direction: 'in', quantity: 5, unitCost: 6 }),
    ]);
    expect(d.quantity).toBe(15);
    expect(d.value).toBe(90);
  });

  it('does not let a return with no work package erase a recorded delivery', () => {
    // Nobody said which package it came back from, so it cannot reduce any of them.
    const d = deliveredToWorkPackage('wbs-1', [
      move({ direction: 'out', quantity: 20 }),
      move({ direction: 'in', quantity: 20, wbsNodeId: null }),
    ]);
    expect(d.quantity).toBe(20);
  });

  it('reads zero for a package nothing was delivered to, which is a measured zero', () => {
    expect(deliveredToWorkPackage('wbs-9', [move()])).toEqual({
      wbsNodeId: 'wbs-9', quantity: 0, value: 0, movements: 0,
    });
  });
});

describe('material issued to a project that named no work package', () => {
  it('is reported once at project level rather than against every package', () => {
    const movements = [
      move({ quantity: 10 }),
      move({ quantity: 7, wbsNodeId: null }),
      move({ quantity: 3, wbsNodeId: null }),
    ];
    const u = issuedWithoutWorkPackage('p-1', movements);
    expect(u.quantity).toBe(10);
    expect(u.movements).toBe(2);
    // …and it is NOT counted against any package.
    expect(deliveredToWorkPackage('wbs-1', movements).quantity).toBe(10);
  });

  it('ignores another project, and ignores uncoded warehouse movements', () => {
    expect(issuedWithoutWorkPackage('p-1', [
      move({ projectId: 'p-2', wbsNodeId: null }),
      move({ projectId: null, wbsNodeId: null }),
    ]).quantity).toBe(0);
  });

  it('nets an unattributed return against the unattributed pool', () => {
    expect(issuedWithoutWorkPackage('p-1', [
      move({ direction: 'out', quantity: 12, wbsNodeId: null }),
      move({ direction: 'in', quantity: 2, wbsNodeId: null }),
    ]).quantity).toBe(10);
  });
});

describe('a work package with no BOQ item is still a valid destination', () => {
  it('keeps the destination and the measurement linkage as separate facts', () => {
    expect(destinationState(null)).toEqual({ destination: 'known', boqMeasurementLinkage: 'absent' });
    expect(destinationState('boq-1')).toEqual({ destination: 'known', boqMeasurementLinkage: 'linked' });
  });

  it('counts delivery to a package whose BOQ linkage is absent', () => {
    // The material went there and was recorded going there. A missing measurement mapping is a
    // different absence, and must not be manufactured to make the delivery look complete.
    const d = deliveredToWorkPackage('wbs-1', [move({ boqItemId: null })]);
    expect(d.quantity).toBe(10);
  });
});
