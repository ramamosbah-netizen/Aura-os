import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type Employee, makeEmployee } from './domain/employee';
import { type Leave, makeLeave } from './domain/leave';
import { type PayrollRun, makePayrollRun } from './domain/payroll-run';
import { type TimesheetEntry, makeTimesheetEntry, submitTimesheet, approveTimesheet, rejectTimesheet } from './domain/timesheet';
import { type ExpenseClaim, makeExpenseClaim, submitClaim, approveClaim, rejectClaim, reimburseClaim } from './domain/expense-claim';
import { type StaffAdvance, makeStaffAdvance, approveAdvance, rejectAdvance, disburseAdvance, recordRepayment } from './domain/staff-advance';
import { type DocumentExpiryReport, buildDocumentExpiryReport } from './domain/document-expiry';
import { type AttendanceRecord, type AttendanceSummary, type NewAttendanceRecord, makeAttendanceRecord, checkOutAttendance, summariseAttendance } from './domain/attendance';
import { type SifResult, type WpsEmployeeLine, generateSif } from './domain/wps';

export const EMPLOYEE_STORE = Symbol('EMPLOYEE_STORE');
export const LEAVE_STORE = Symbol('LEAVE_STORE');
export const PAYROLL_RUN_STORE = Symbol('PAYROLL_RUN_STORE');
export const TIMESHEET_STORE = Symbol('TIMESHEET_STORE');
export const EXPENSE_CLAIM_STORE = Symbol('EXPENSE_CLAIM_STORE');
export const STAFF_ADVANCE_STORE = Symbol('STAFF_ADVANCE_STORE');
export const ATTENDANCE_STORE = Symbol('ATTENDANCE_STORE');

import {
  type EmployeeStore,
  type LeaveStore,
  type PayrollRunStore,
  type TimesheetStore,
  type ExpenseClaimStore,
  type StaffAdvanceStore,
  type AttendanceStore,
} from './store.interface';

export const HR_EVENT = {
  employeeCreated: 'hr.employee.created',
  leaveRequested: 'hr.leave.requested',
  leaveApproved: 'hr.leave.approved',
  payrollRun: 'hr.payroll.run',
  timesheetSubmitted: 'hr.timesheet.submitted',
  timesheetApproved: 'hr.timesheet.approved',
  expenseSubmitted: 'hr.expense.submitted',
  expenseApproved: 'hr.expense.approved',
  expenseReimbursed: 'hr.expense.reimbursed',
  advanceRequested: 'hr.staff_advance.requested',
  advanceApproved: 'hr.staff_advance.approved',
  advanceDisbursed: 'hr.staff_advance.disbursed',
  advanceRepaid: 'hr.staff_advance.repaid',
  attendanceRecorded: 'hr.attendance.recorded',
  attendanceCheckedOut: 'hr.attendance.checked_out',
};

@Injectable()
export class HrService {
  private readonly logger = new Logger('HrControl');

  constructor(
    @Inject(EMPLOYEE_STORE) private readonly employeeStore: EmployeeStore,
    @Inject(LEAVE_STORE) private readonly leaveStore: LeaveStore,
    @Inject(PAYROLL_RUN_STORE) private readonly payrollRunStore: PayrollRunStore,
    @Inject(TIMESHEET_STORE) private readonly timesheetStore: TimesheetStore,
    @Inject(EXPENSE_CLAIM_STORE) private readonly expenseClaimStore: ExpenseClaimStore,
    @Inject(STAFF_ADVANCE_STORE) private readonly staffAdvanceStore: StaffAdvanceStore,
    @Inject(ATTENDANCE_STORE) private readonly attendanceStore: AttendanceStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  // ── Employees ──────────────────────────────────────────────────────────────

  async createEmployee(
    actorId: string | null,
    input: {
      tenantId: string;
      companyId?: string | null;
      firstName: string;
      lastName: string;
      email?: string | null;
      phone?: string | null;
      role: string;
      department: string;
      joinedDate: string;
      visaExpiry?: string | null;
      permitExpiry?: string | null;
      laborCamp?: string | null;
      iban?: string | null;
      molEmployeeId?: string | null;
      bankRoutingCode?: string | null;
    },
  ): Promise<Employee> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'hr.employee.create', orgPath });
    }

    const employee = makeEmployee(input);
    const event = makeEvent({
      type: HR_EVENT.employeeCreated,
      tenantId: employee.tenantId,
      companyId: employee.companyId,
      actorId: actorId,
      aggregateType: 'hr.employee',
      aggregateId: employee.id,
      payload: { firstName: employee.firstName, lastName: employee.lastName, role: employee.role },
    });

    await this.tx.run(async (handle) => {
      await this.employeeStore.save(employee, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Employee profile created: ${employee.firstName} ${employee.lastName} (${employee.role})`);
    return employee;
  }

  async deleteEmployee(tenantId: string, actorId: string | null, id: string): Promise<boolean> {
    const employee = await this.employeeStore.findById(tenantId, id);
    if (!employee) throw new Error(`Employee profile with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (employee.companyId) orgPath.push({ level: 'company', id: employee.companyId });
      this.access.assert(actorId, { permission: 'hr.employee.delete', orgPath });
    }

    await this.tx.run(async (handle) => {
      await this.employeeStore.delete(tenantId, id);
    });

    this.logger.log(`Employee profile deleted: ${id}`);
    return true;
  }

  getEmployee(tenantId: string, id: string): Promise<Employee | null> {
    return this.employeeStore.findById(tenantId, id);
  }

  listEmployees(tenantId: string): Promise<Employee[]> {
    return this.employeeStore.findByTenant(tenantId);
  }

  // ── Leaves ─────────────────────────────────────────────────────────────────

  async requestLeave(
    actorId: string | null,
    input: {
      tenantId: string;
      companyId?: string | null;
      employeeId: string;
      leaveType: string;
      startDate: string;
      endDate: string;
      reason?: string | null;
    },
  ): Promise<Leave> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'hr.leave.create', orgPath });
    }

    const leave = makeLeave(input);
    const event = makeEvent({
      type: HR_EVENT.leaveRequested,
      tenantId: leave.tenantId,
      companyId: leave.companyId,
      actorId: actorId,
      aggregateType: 'hr.leave',
      aggregateId: leave.id,
      payload: { employeeId: leave.employeeId, leaveType: leave.leaveType, startDate: leave.startDate },
    });

    await this.tx.run(async (handle) => {
      await this.leaveStore.save(leave, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Leave requested for employee ${leave.employeeId}: ${leave.leaveType} from ${leave.startDate} to ${leave.endDate}`);
    return leave;
  }

  async resolveLeave(
    tenantId: string,
    actorId: string | null,
    id: string,
    status: 'approved' | 'rejected',
  ): Promise<Leave> {
    const leave = await this.leaveStore.findById(tenantId, id);
    if (!leave) throw new Error(`Leave request with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (leave.companyId) orgPath.push({ level: 'company', id: leave.companyId });
      this.access.assert(actorId, { permission: 'hr.leave.approve', orgPath });
    }

    leave.status = status;
    leave.updatedAt = new Date().toISOString();

    const event = makeEvent({
      type: HR_EVENT.leaveApproved,
      tenantId: leave.tenantId,
      companyId: leave.companyId,
      actorId: actorId,
      aggregateType: 'hr.leave',
      aggregateId: leave.id,
      payload: { status, employeeId: leave.employeeId },
    });

    await this.tx.run(async (handle) => {
      await this.leaveStore.save(leave, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Leave request ${id} status updated to: ${status}`);
    return leave;
  }

  listLeaves(tenantId: string): Promise<Leave[]> {
    return this.leaveStore.findByTenant(tenantId);
  }

  // ── Payroll Runs ────────────────────────────────────────────────────────────

  async runPayroll(
    actorId: string | null,
    input: {
      tenantId: string;
      companyId?: string | null;
      employeeId: string;
      periodStart: string;
      periodEnd: string;
      basicSalary: number;
      allowances: number;
      deductions: number;
    },
  ): Promise<PayrollRun> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'hr.payroll.create', orgPath });
    }

    const run = makePayrollRun(input);
    const event = makeEvent({
      type: HR_EVENT.payrollRun,
      tenantId: run.tenantId,
      companyId: run.companyId,
      actorId: actorId,
      aggregateType: 'hr.payroll',
      aggregateId: run.id,
      payload: { employeeId: run.employeeId, netSalary: run.netSalary },
    });

    await this.tx.run(async (handle) => {
      await this.payrollRunStore.save(run, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Payroll processed for employee ${run.employeeId}: Net Salary = ${run.netSalary}`);
    return run;
  }

  async markPayrollPaid(tenantId: string, actorId: string | null, id: string): Promise<PayrollRun> {
    const run = await this.payrollRunStore.findById(tenantId, id);
    if (!run) throw new Error(`Payroll run with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (run.companyId) orgPath.push({ level: 'company', id: run.companyId });
      this.access.assert(actorId, { permission: 'hr.payroll.pay', orgPath });
    }

    run.status = 'paid';
    run.processedAt = new Date().toISOString();
    run.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.payrollRunStore.save(run, handle);
    });

    this.logger.log(`Payroll run ${id} marked as Paid`);
    return run;
  }

  listPayrollRuns(tenantId: string): Promise<PayrollRun[]> {
    return this.payrollRunStore.findByTenant(tenantId);
  }

  getPayrollRun(tenantId: string, id: string): Promise<PayrollRun | null> {
    return this.payrollRunStore.findById(tenantId, id);
  }

  // ── Timesheets ─────────────────────────────────────────────────────────────

  async createTimesheetEntry(input: {
    tenantId: string;
    employeeId: string;
    projectId?: string | null;
    wbsNodeId?: string | null;
    date: string;
    hours: number;
    overtime?: number;
    description?: string;
  }): Promise<TimesheetEntry> {
    const entry = makeTimesheetEntry(input);
    await this.timesheetStore.save(entry);
    this.logger.log(`Timesheet entry ${entry.id} created for ${entry.employeeId} on ${entry.date}`);
    return entry;
  }

  async submitTimesheetEntry(tenantId: string, id: string): Promise<TimesheetEntry> {
    const entry = await this.timesheetStore.findById(tenantId, id);
    if (!entry) throw new Error(`timesheet entry ${id} not found`);
    const updated = submitTimesheet(entry);
    await this.timesheetStore.save(updated);
    await this.events.append([
      makeEvent({
        type: HR_EVENT.timesheetSubmitted,
        tenantId,
        companyId: null,
        actorId: entry.employeeId,
        aggregateType: 'hr.timesheet',
        aggregateId: id,
        payload: { employeeId: entry.employeeId, date: entry.date, hours: entry.hours },
      }),
    ]);
    return updated;
  }

  async approveTimesheetEntry(tenantId: string, id: string, approverId: string): Promise<TimesheetEntry> {
    const entry = await this.timesheetStore.findById(tenantId, id);
    if (!entry) throw new Error(`timesheet entry ${id} not found`);
    const updated = approveTimesheet(entry, approverId);
    await this.timesheetStore.save(updated);
    await this.events.append([
      makeEvent({
        type: HR_EVENT.timesheetApproved,
        tenantId,
        companyId: null,
        actorId: approverId,
        aggregateType: 'hr.timesheet',
        aggregateId: id,
        payload: { employeeId: entry.employeeId, date: entry.date, hours: entry.hours, approvedBy: approverId },
      }),
    ]);
    return updated;
  }

  async rejectTimesheetEntry(tenantId: string, id: string): Promise<TimesheetEntry> {
    const entry = await this.timesheetStore.findById(tenantId, id);
    if (!entry) throw new Error(`timesheet entry ${id} not found`);
    const updated = rejectTimesheet(entry);
    await this.timesheetStore.save(updated);
    return updated;
  }

  listTimesheets(tenantId: string): Promise<TimesheetEntry[]> {
    return this.timesheetStore.findByTenant(tenantId);
  }

  listTimesheetsByEmployee(tenantId: string, employeeId: string): Promise<TimesheetEntry[]> {
    return this.timesheetStore.findByEmployee(tenantId, employeeId);
  }

  // ── WPS (Wage Protection System) ───────────────────────────────────────────

  /** Generate the WPS SIF for all payroll runs in a period, joined to employee bank details. */
  async generateWps(
    tenantId: string,
    params: { periodStart: string; periodEnd: string; establishmentId: string; bankCode: string },
  ): Promise<SifResult> {
    const runs = (await this.payrollRunStore.findByTenant(tenantId)).filter(
      (r) => r.periodStart === params.periodStart && r.periodEnd === params.periodEnd,
    );
    if (runs.length === 0) throw new Error(`no payroll runs for period ${params.periodStart}..${params.periodEnd}`);

    const ms = new Date(params.periodEnd).getTime() - new Date(params.periodStart).getTime();
    const days = Math.min(30, Math.max(1, Math.round(ms / 86_400_000) + 1));

    const lines: WpsEmployeeLine[] = [];
    for (const run of runs) {
      const emp = await this.employeeStore.findById(tenantId, run.employeeId);
      if (!emp) throw new Error(`employee ${run.employeeId} not found`);
      lines.push({
        molEmployeeId: emp.molEmployeeId ?? '',
        bankRoutingCode: emp.bankRoutingCode ?? '',
        iban: emp.iban ?? '',
        startDate: run.periodStart,
        endDate: run.periodEnd,
        days,
        fixedIncome: run.basicSalary,
        variableIncome: run.allowances,
        name: `${emp.firstName} ${emp.lastName}`,
      });
    }
    return generateSif(
      { establishmentId: params.establishmentId, bankCode: params.bankCode, payMonth: params.periodStart.slice(0, 7) },
      lines,
    );
  }

  // ── Attendance ───────────────────────────────────────────────────────────

  async recordAttendance(input: NewAttendanceRecord): Promise<AttendanceRecord> {
    const record = makeAttendanceRecord(input);
    await this.attendanceStore.save(record);
    await this.events.append([
      makeEvent({
        type: HR_EVENT.attendanceRecorded,
        tenantId: record.tenantId,
        companyId: record.companyId,
        actorId: record.createdBy,
        aggregateType: 'hr.attendance',
        aggregateId: record.id,
        payload: { employeeId: record.employeeId, date: record.date, status: record.status, workedHours: record.workedHours },
      }),
    ]);
    this.logger.log(`Attendance recorded: ${record.employeeName} ${record.date} (${record.status}, ${record.workedHours}h)`);
    return record;
  }

  async checkOutAttendance(tenantId: string, id: string, checkOut: string): Promise<AttendanceRecord> {
    const record = await this.attendanceStore.findById(tenantId, id);
    if (!record) throw new Error(`attendance record ${id} not found`);
    const updated = checkOutAttendance(record, checkOut);
    await this.attendanceStore.save(updated);
    await this.events.append([
      makeEvent({
        type: HR_EVENT.attendanceCheckedOut,
        tenantId,
        companyId: record.companyId,
        actorId: record.createdBy,
        aggregateType: 'hr.attendance',
        aggregateId: id,
        payload: { employeeId: record.employeeId, date: record.date, checkOut, workedHours: updated.workedHours },
      }),
    ]);
    return updated;
  }

  listAttendance(tenantId: string, employeeId?: string): Promise<AttendanceRecord[]> {
    return employeeId ? this.attendanceStore.findByEmployee(tenantId, employeeId) : this.attendanceStore.findByTenant(tenantId);
  }

  async attendanceSummary(tenantId: string, from: string, to: string, employeeId?: string): Promise<AttendanceSummary> {
    return summariseAttendance(await this.attendanceStore.findByDateRange(tenantId, from, to, employeeId));
  }

  // ── Expense Claims ───────────────────────────────────────────────────────

  async createExpenseClaim(input: {
    tenantId: string;
    employeeId: string;
    projectId?: string | null;
    category: ExpenseClaim['category'];
    amount: number;
    expenseDate: string;
    description?: string;
  }): Promise<ExpenseClaim> {
    const claim = makeExpenseClaim(input);
    await this.expenseClaimStore.save(claim);
    this.logger.log(`Expense claim ${claim.id} created for ${claim.employeeId}: ${claim.amount} AED (${claim.category})`);
    return claim;
  }

  async submitExpenseClaim(tenantId: string, id: string): Promise<ExpenseClaim> {
    const claim = await this.expenseClaimStore.findById(tenantId, id);
    if (!claim) throw new Error(`expense claim ${id} not found`);
    const updated = submitClaim(claim);
    await this.expenseClaimStore.save(updated);
    await this.events.append([
      makeEvent({
        type: HR_EVENT.expenseSubmitted,
        tenantId, companyId: null, actorId: claim.employeeId,
        aggregateType: 'hr.expense_claim', aggregateId: id,
        payload: { employeeId: claim.employeeId, amount: claim.amount, category: claim.category },
      }),
    ]);
    return updated;
  }

  async approveExpenseClaim(tenantId: string, id: string, approverId: string): Promise<ExpenseClaim> {
    const claim = await this.expenseClaimStore.findById(tenantId, id);
    if (!claim) throw new Error(`expense claim ${id} not found`);
    const updated = approveClaim(claim, approverId);
    await this.expenseClaimStore.save(updated);
    await this.events.append([
      makeEvent({
        type: HR_EVENT.expenseApproved,
        tenantId, companyId: null, actorId: approverId,
        aggregateType: 'hr.expense_claim', aggregateId: id,
        payload: { employeeId: claim.employeeId, amount: claim.amount, approvedBy: approverId },
      }),
    ]);
    return updated;
  }

  async rejectExpenseClaim(tenantId: string, id: string): Promise<ExpenseClaim> {
    const claim = await this.expenseClaimStore.findById(tenantId, id);
    if (!claim) throw new Error(`expense claim ${id} not found`);
    const updated = rejectClaim(claim);
    await this.expenseClaimStore.save(updated);
    return updated;
  }

  async reimburseExpenseClaim(tenantId: string, id: string, reimbursedDate?: string): Promise<ExpenseClaim> {
    const claim = await this.expenseClaimStore.findById(tenantId, id);
    if (!claim) throw new Error(`expense claim ${id} not found`);
    const updated = reimburseClaim(claim, reimbursedDate);
    await this.expenseClaimStore.save(updated);
    await this.events.append([
      makeEvent({
        type: HR_EVENT.expenseReimbursed,
        tenantId, companyId: null, actorId: null,
        aggregateType: 'hr.expense_claim', aggregateId: id,
        payload: { employeeId: claim.employeeId, amount: claim.amount, reimbursedDate: updated.reimbursedDate },
      }),
    ]);
    return updated;
  }

  listExpenseClaims(tenantId: string): Promise<ExpenseClaim[]> {
    return this.expenseClaimStore.findByTenant(tenantId);
  }

  // ── Staff Advances / Loans ────────────────────────────────────────────────

  async createStaffAdvance(input: { tenantId: string; employeeId: string; amount: number; reason?: string; installments?: number; requestDate: string }): Promise<StaffAdvance> {
    const advance = makeStaffAdvance(input);
    await this.staffAdvanceStore.save(advance);
    await this.events.append([
      makeEvent({
        type: HR_EVENT.advanceRequested,
        tenantId: advance.tenantId, companyId: null, actorId: advance.employeeId,
        aggregateType: 'hr.staff_advance', aggregateId: advance.id,
        payload: { employeeId: advance.employeeId, amount: advance.amount, installments: advance.installments },
      }),
    ]);
    this.logger.log(`Staff advance ${advance.id} requested for ${advance.employeeId}: ${advance.amount} over ${advance.installments} installments`);
    return advance;
  }

  async approveStaffAdvance(tenantId: string, id: string, approverId: string): Promise<StaffAdvance> {
    const advance = await this.staffAdvanceStore.findById(tenantId, id);
    if (!advance) throw new Error(`staff advance ${id} not found`);
    const updated = approveAdvance(advance, approverId);
    await this.staffAdvanceStore.save(updated);
    await this.events.append([
      makeEvent({
        type: HR_EVENT.advanceApproved,
        tenantId, companyId: null, actorId: approverId,
        aggregateType: 'hr.staff_advance', aggregateId: id,
        payload: { employeeId: advance.employeeId, amount: advance.amount, approvedBy: approverId },
      }),
    ]);
    return updated;
  }

  async rejectStaffAdvance(tenantId: string, id: string): Promise<StaffAdvance> {
    const advance = await this.staffAdvanceStore.findById(tenantId, id);
    if (!advance) throw new Error(`staff advance ${id} not found`);
    const updated = rejectAdvance(advance);
    await this.staffAdvanceStore.save(updated);
    return updated;
  }

  async disburseStaffAdvance(tenantId: string, id: string, disbursedDate?: string): Promise<StaffAdvance> {
    const advance = await this.staffAdvanceStore.findById(tenantId, id);
    if (!advance) throw new Error(`staff advance ${id} not found`);
    const updated = disburseAdvance(advance, disbursedDate);
    await this.staffAdvanceStore.save(updated);
    await this.events.append([
      makeEvent({
        type: HR_EVENT.advanceDisbursed,
        tenantId, companyId: null, actorId: null,
        aggregateType: 'hr.staff_advance', aggregateId: id,
        payload: { employeeId: advance.employeeId, amount: advance.amount, disbursedDate: updated.disbursedDate },
      }),
    ]);
    return updated;
  }

  async repayStaffAdvance(tenantId: string, id: string, amount: number): Promise<StaffAdvance> {
    const advance = await this.staffAdvanceStore.findById(tenantId, id);
    if (!advance) throw new Error(`staff advance ${id} not found`);
    const updated = recordRepayment(advance, amount);
    await this.staffAdvanceStore.save(updated);
    await this.events.append([
      makeEvent({
        type: HR_EVENT.advanceRepaid,
        tenantId, companyId: null, actorId: null,
        aggregateType: 'hr.staff_advance', aggregateId: id,
        payload: { employeeId: advance.employeeId, amount: Number(amount), amountRepaid: updated.amountRepaid, status: updated.status },
      }),
    ]);
    return updated;
  }

  listStaffAdvances(tenantId: string): Promise<StaffAdvance[]> {
    return this.staffAdvanceStore.findByTenant(tenantId);
  }

  // ── Staff Document Expiry (compliance watch-list) ─────────────────────────

  /** Visa / work-permit documents expired or expiring within `withinDays`, soonest first. */
  async documentExpiry(tenantId: string, withinDays = 90, asOf?: string): Promise<DocumentExpiryReport> {
    const employees = await this.employeeStore.findByTenant(tenantId);
    return buildDocumentExpiryReport(employees, asOf ?? new Date().toISOString().slice(0, 10), withinDays);
  }
}
