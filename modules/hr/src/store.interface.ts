import type { TxHandle } from '@aura/core';
import { Employee } from './domain/employee';
import { Leave } from './domain/leave';
import { PayrollRun } from './domain/payroll-run';
import { TimesheetEntry } from './domain/timesheet';

export interface EmployeeStore {
  save(employee: Employee, tx?: TxHandle): Promise<Employee>;
  findById(tenantId: string, id: string): Promise<Employee | null>;
  findByTenant(tenantId: string): Promise<Employee[]>;
  delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean>;
}

export interface LeaveStore {
  save(leave: Leave, tx?: TxHandle): Promise<Leave>;
  findById(tenantId: string, id: string): Promise<Leave | null>;
  findByTenant(tenantId: string): Promise<Leave[]>;
  findByEmployee(tenantId: string, employeeId: string): Promise<Leave[]>;
  delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean>;
}

export interface PayrollRunStore {
  save(payrollRun: PayrollRun, tx?: TxHandle): Promise<PayrollRun>;
  findById(tenantId: string, id: string): Promise<PayrollRun | null>;
  findByTenant(tenantId: string): Promise<PayrollRun[]>;
  findByEmployee(tenantId: string, employeeId: string): Promise<PayrollRun[]>;
  delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean>;
}

export interface TimesheetStore {
  save(entry: TimesheetEntry, tx?: TxHandle): Promise<TimesheetEntry>;
  findById(tenantId: string, id: string): Promise<TimesheetEntry | null>;
  findByTenant(tenantId: string): Promise<TimesheetEntry[]>;
  findByEmployee(tenantId: string, employeeId: string): Promise<TimesheetEntry[]>;
  findByDateRange(tenantId: string, employeeId: string, from: string, to: string): Promise<TimesheetEntry[]>;
}
