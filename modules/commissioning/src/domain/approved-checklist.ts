import type { SystemChecklistFact } from '../ports';
import type { CommissioningRecord } from './commissioning-record';
import { type CommissioningTestItem, makeTestItem } from './commissioning-test-item';

/**
 * T&C EXECUTES THE APPROVED CHECKLIST — layer 4 of the programme owner's contract (TC-08 / TC-09).
 *
 * A commissioning record is BOUND to the current approved system-ITP revision of its own project and
 * its own canonical system. Binding instantiates the test points from that revision — code, activity,
 * acceptance criterion and whether PASS needs it — and those are Quality's: T&C records results,
 * evidence, defects and retests against them, and writes none of them. A point missing from the
 * checklist is Quality's to add, in the next revision.
 *
 * The record stays on the revision it was bound to. A later template version or a later ITP revision
 * applies to records bound afterwards; moving a record that is already executing is a separate,
 * governed act that does not exist yet.
 *
 * The same rules are held by PostgreSQL (migration 0388); these are the ones a person reads.
 */

export function bindChecklist(rec: CommissioningRecord, fact: SystemChecklistFact, actorId: string | null): CommissioningRecord {
  if (rec.status === 'commissioned') throw new Error(`conflict: ${rec.code} is already commissioned`);
  if (rec.itpId) {
    throw new Error(`${rec.code}'s ITP revision is immutable once bound — moving it to a newer revision is a separate governed act`);
  }
  if (!actorId) throw new Error('validation: binding a checklist requires an authenticated person');
  if (fact.projectId !== rec.projectId) {
    throw new Error('the ITP revision belongs to a different project than this commissioning record');
  }
  if (fact.system !== rec.system) {
    throw new Error('the ITP revision belongs to a different system than this commissioning record — systems are matched by their canonical id, never by name');
  }
  if (fact.status !== 'approved') {
    throw new Error(`only the current approved ITP revision can be bound — revision ${fact.revision} is ${fact.status}`);
  }
  if (fact.points.length === 0) throw new Error('validation: the approved revision needs at least one test point to execute');
  const now = new Date().toISOString();
  return { ...rec, itpId: fact.itpId, itpRevision: fact.revision, itpBoundBy: actorId, itpBoundAt: now, updatedAt: now };
}

/** The approved revision's points, as test points on this record — carrying their lineage. */
export function checklistTestItems(rec: CommissioningRecord, fact: SystemChecklistFact): CommissioningTestItem[] {
  return fact.points.map((p) => makeTestItem({
    tenantId: rec.tenantId,
    companyId: rec.companyId,
    commissioningId: rec.id,
    projectId: rec.projectId,
    pointNo: p.code,
    description: p.method ? `${p.activity} — ${p.method}` : p.activity,
    expected: p.acceptanceCriteria,
    checklist: { itpId: fact.itpId, code: p.code, mandatory: p.mandatory },
  }));
}

/**
 * The points PASS is decided on: on a bound record, the mandatory points of its revision. A
 * non-mandatory point may stay unexecuted. On an unbound record, every point — which never commissions
 * it, but keeps the counts honest for a record still waiting for its checklist.
 */
export function countedPoints(rec: CommissioningRecord, items: CommissioningTestItem[]): CommissioningTestItem[] {
  return rec.itpId ? items.filter((i) => i.origin === 'itp' && i.mandatory) : items;
}

/**
 * WHAT STANDS BETWEEN THIS SYSTEM AND PASS, in words a person can act on — empty when nothing does.
 *
 * Not "every point it has passed": every MANDATORY point of its APPROVED revision executed with a
 * latest run of pass, no point failing — a recorded failure is a failure whatever its origin — and no
 * defect open. And none of it counts until the record is bound to an approved revision.
 */
export function checklistPassGaps(rec: CommissioningRecord, items: CommissioningTestItem[], openPunch: number): string[] {
  const gaps: string[] = [];
  if (!rec.itpId) {
    gaps.push('No approved checklist — bind this system to the approved ITP revision for its system');
  }
  const failing = items.filter((i) => i.result === 'fail');
  if (failing.length > 0) {
    gaps.push(`${failing.length} test point${failing.length === 1 ? '' : 's'} failing — retest required (${failing.map((i) => i.pointNo).join(', ')})`);
  }
  if (rec.itpId) {
    const open = items.filter((i) => i.origin === 'itp' && i.mandatory && i.result === 'pending');
    if (open.length > 0) {
      gaps.push(`${open.length} mandatory point${open.length === 1 ? '' : 's'} of the approved revision never executed (${open.map((i) => i.pointNo).join(', ')})`);
    }
  }
  if (openPunch > 0) gaps.push(`${openPunch} open defect${openPunch === 1 ? '' : 's'}`);
  return gaps;
}
