import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import { ELV_ROLE_MATRIX } from '../auth/elv-roles';
import { classifyDomainMessage } from '../common/all-exceptions.filter';
import {
  approveAdvance, approveClaim, approveTimesheet, claimSeparation,
  disburseAdvance, reimburseClaim, rejectClaim, submitClaim,
  type ExpenseClaim, type StaffAdvance, type TimesheetEntry,
} from '@aura/hr';
import { HrController } from './hr.controller';

/**
 * HR — SEC-01 stage 3, wave A.
 *
 * Measured: NO SHIPPED ROLE HELD A SINGLE `hr.*` PERMISSION except `r-hse`, which holds `hr.*.read`.
 * Payroll, expense claims, staff advances, timesheets, appraisals and end-of-service were reachable
 * only through r-admin's global wildcard, and THERE WAS NO HR ROLE IN THE CATALOGUE AT ALL. 28
 * mutating routes, nine of them governing verbs — the subcontracts shape at larger scale, on the
 * department that pays people.
 *
 * The records matched. All three of the approval-bearing ones carried `approved_by` and nothing else:
 * who SUBMITTED was not recorded, who REJECTED was not recorded at all, and who PAID was a DATE with
 * no actor. And nothing stopped the claimant approving their own claim — unlike the purchase order,
 * the solution scope and the subcontractor claim, where the rule was unwritable for want of a column,
 * HERE IT WAS WRITEABLE ALL ALONG and simply was not written: `employeeId` has always been on the
 * record.
 */

const declared = (h: unknown) => Reflect.getMetadata(PERMISSIONS_KEY, h as object) as string[] | undefined;
const role = (id: string) => {
  const r = ELV_ROLE_MATRIX.find((x) => x.id === id);
  if (!r) throw new Error(`no such seeded role: ${id}`);
  return r;
};
const holds = (roleId: string, p: string) => role(roleId).permissions.some((x) => permissionMatches(x, p));
const names = (roleId: string, p: string) => role(roleId).permissions.includes(p);

describe('HR — authority', () => {
  it('declares a permission on every act that costs money', () => {
    const p = HrController.prototype;
    expect(declared(p.submitExpenseClaim)).toEqual(['hr.expense-claim.submit']);
    expect(declared(p.approveExpenseClaim)).toEqual(['hr.expense-claim.approve']);
    expect(declared(p.reimburseExpenseClaim)).toEqual(['hr.expense-claim.reimburse']);
    expect(declared(p.approveStaffAdvance)).toEqual(['hr.staff-advance.approve']);
    expect(declared(p.disburseStaffAdvance)).toEqual(['hr.staff-advance.disburse']);
    expect(declared(p.approveTimesheet)).toEqual(['hr.timesheet.approve']);
    expect(declared(p.markPayrollPaid)).toEqual(['hr.payroll.pay']);
  });

  it('gives the department a role at all, and splits capture from approval from payment', () => {
    // CAPTURE. The officer runs the department and approves nothing that costs money.
    for (const p of ['hr.employee.create', 'hr.timesheet.create', 'hr.expense-claim.create', 'hr.payroll.create']) {
      expect(names('r-hr', p), `the HR Officer must name ${p}`).toBe(true);
    }
    for (const p of ['hr.timesheet.approve', 'hr.expense-claim.approve', 'hr.staff-advance.approve']) {
      expect(holds('r-hr', p), `the HR Officer must NOT hold ${p}`).toBe(false);
    }

    // APPROVAL. The manager commits the business and pays nothing.
    for (const p of ['hr.timesheet.approve', 'hr.expense-claim.approve', 'hr.staff-advance.approve']) {
      expect(names('r-hr-manager', p), `the HR Manager must name ${p}`).toBe(true);
    }
    for (const p of ['hr.payroll.pay', 'hr.expense-claim.reimburse', 'hr.staff-advance.disburse']) {
      expect(holds('r-hr-manager', p), `the HR Manager must NOT hold ${p}`).toBe(false);
    }

    // PAYMENT. Finance releases the cash and approves none of the entitlements.
    for (const p of ['hr.payroll.pay', 'hr.expense-claim.reimburse', 'hr.staff-advance.disburse']) {
      expect(names('r-finance', p), `Finance must name ${p}`).toBe(true);
    }
    for (const p of ['hr.expense-claim.approve', 'hr.staff-advance.approve', 'hr.timesheet.approve']) {
      expect(holds('r-finance', p), `Finance must NOT hold ${p}`).toBe(false);
    }
  });
});

describe('HR — the claimant is not the approver, and not the payer', () => {
  const claim = (over: Partial<ExpenseClaim> = {}): ExpenseClaim => ({
    id: 'c-1', tenantId: 't-1', employeeId: 'emp-1', projectId: null, category: 'travel',
    amount: 500, expenseDate: '2026-09-01', description: 'site visit', status: 'submitted',
    submittedBy: 'u-alice', submittedAt: '2026-09-01T00:00:00.000Z',
    approvedBy: null, rejectedBy: null, rejectedAt: null,
    reimbursedBy: null, reimbursedDate: null, createdAt: '2026-09-01T00:00:00.000Z', ...over,
  });
  const advance = (over: Partial<StaffAdvance> = {}): StaffAdvance => ({
    id: 'a-1', tenantId: 't-1', employeeId: 'emp-1', amount: 2_000, reason: 'relocation',
    installments: 4, amountRepaid: 0, status: 'requested', requestDate: '2026-09-01',
    approvedBy: null, rejectedBy: null, rejectedAt: null, disbursedBy: null, disbursedDate: null,
    createdAt: '2026-09-01T00:00:00.000Z', ...over,
  });
  const sheet = (over: Partial<TimesheetEntry> = {}): TimesheetEntry => ({
    id: 't-1', tenantId: 't-1', employeeId: 'emp-1', projectId: null, wbsNodeId: null,
    date: '2026-09-01', hours: 8, overtime: 0, description: '', status: 'submitted',
    createdAt: '2026-09-01T00:00:00.000Z', submittedBy: 'u-alice', submittedAt: '2026-09-01T00:00:00.000Z',
    approvedBy: null, rejectedBy: null, rejectedAt: null, ...over,
  });

  it('records who put each one forward — the transitions took no actor', () => {
    const submitted = submitClaim(claim({ status: 'draft', submittedBy: null, submittedAt: null }), 'u-alice');
    expect(submitted.submittedBy).toBe('u-alice');
    expect(submitted.submittedAt).not.toBeNull();
  });

  it('records who refused it — a refusal that costs an employee money was anonymous', () => {
    const refused = rejectClaim(claim(), 'u-manager');
    expect(refused).toMatchObject({ status: 'rejected', rejectedBy: 'u-manager' });
    expect(refused.rejectedAt).not.toBeNull();
  });

  it('refuses the claimant their own approval — 403, the actor is wrong and nothing else', () => {
    // `u-alice` is the LINKED ACCOUNT of employee `emp-1`, resolved by the service: `employeeId` is
    // the employee record and the approver is a user id, two different identifiers.
    expect(() => approveClaim(claim(), 'u-alice', 'u-alice')).toThrow(/may not approve their own claim/);
    expect(classifyDomainMessage('the employee who claimed this expense may not approve their own claim — a second person is what makes it an approval'))
      .toEqual({ status: 403, code: 'FORBIDDEN' });

    const approved = approveClaim(claim(), 'u-manager', 'u-alice');
    expect(approved).toMatchObject({ status: 'approved', approvedBy: 'u-manager' });
    expect(claimSeparation(approved, 'u-alice')).toBe('enforced');
  });

  it('refuses the approver the payment — approving and paying are two signatures', () => {
    const approved = approveClaim(claim(), 'u-manager', 'u-alice');
    expect(() => reimburseClaim(approved, { by: 'u-manager', claimantUserId: 'u-alice' })).toThrow(/may not release their own approval for payment/);
    expect(() => reimburseClaim(approved, { by: 'u-alice', claimantUserId: 'u-alice' })).toThrow(/may not reimburse their own claim/);

    const paid = reimburseClaim(approved, { by: 'u-finance', claimantUserId: 'u-alice' });
    expect(paid).toMatchObject({ status: 'reimbursed', reimbursedBy: 'u-finance' });
    expect(paid.reimbursedDate).not.toBeNull();
  });

  it('applies the same two rules to a staff advance', () => {
    expect(() => approveAdvance(advance(), 'u-alice', 'u-alice')).toThrow(/may not approve their own request/);
    const approved = approveAdvance(advance(), 'u-manager', 'u-alice');
    expect(() => disburseAdvance(approved, { by: 'u-manager', requestorUserId: 'u-alice' })).toThrow(/may not release their own approval for payment/);
    expect(() => disburseAdvance(approved, { by: 'u-alice', requestorUserId: 'u-alice' })).toThrow(/may not disburse their own/);
    expect(disburseAdvance(approved, { by: 'u-finance', requestorUserId: 'u-alice' }).disbursedBy).toBe('u-finance');
  });

  it('will not let an employee approve their own hours', () => {
    // Hours become project cost and, through payroll, money.
    expect(() => approveTimesheet(sheet(), 'u-alice', 'u-alice')).toThrow(/may not approve their own timesheet/);
    expect(approveTimesheet(sheet(), 'u-manager', 'u-alice').approvedBy).toBe('u-manager');
  });

  it('says unverifiable where the employee has no linked account', () => {
    // No link means the comparison cannot be made. The approval proceeds and says so, rather than
    // implying a control that did not run — and rather than blocking an employee's expenses over a
    // link somebody never set up.
    const approved = approveClaim(claim(), 'u-manager', null);
    expect(approved.status).toBe('approved');
    expect(claimSeparation(approved, null)).toBe('unverifiable');
    expect(claimSeparation(claim(), 'u-alice')).toBeNull(); // never approved — not a verdict at all
  });
});
