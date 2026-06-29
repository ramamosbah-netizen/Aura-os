import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type Employee, makeEmployee } from './domain/employee';
import { type Leave, makeLeave } from './domain/leave';
import { type PayrollRun, makePayrollRun } from './domain/payroll-run';
import { type TimesheetEntry, makeTimesheetEntry, submitTimesheet, approveTimesheet, rejectTimesheet } from './domain/timesheet';

export const EMPLOYEE_STORE = Symbol('EMPLOYEE_STORE');
export const LEAVE_STORE = Symbol('LEAVE_STORE');
export const PAYROLL_RUN_STORE = Symbol('PAYROLL_RUN_STORE');
export const TIMESHEET_STORE = Symbol('TIMESHEET_STORE');

import {
  type EmployeeStore,
  type LeaveStore,
  type PayrollRunStore,
  type TimesheetStore,
} from './store.interface';

export const HR_EVENT = {
  employeeCreated: 'hr.employee.created',
  leaveRequested: 'hr.leave.requested',
  leaveApproved: 'hr.leave.approved',
  payrollRun: 'hr.payroll.run',
  timesheetSubmitted: 'hr.timesheet.submitted',
  timesheetApproved: 'hr.timesheet.approved',
};

@Injectable()
export class HrService {
  private readonly logger = new Logger('HrControl');

  constructor(
    @Inject(EMPLOYEE_STORE) private readonly employeeStore: EmployeeStore,
    @Inject(LEAVE_STORE) private readonly leaveStore: LeaveStore,
    @Inject(PAYROLL_RUN_STORE) private readonly payrollRunStore: PayrollRunStore,
    @Inject(TIMESHEET_STORE) private readonly timesheetStore: TimesheetStore,
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
}
