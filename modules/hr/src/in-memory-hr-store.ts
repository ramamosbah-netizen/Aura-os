import { TxHandle } from '@aura/core';
import { Employee } from './domain/employee';
import { Leave } from './domain/leave';
import { PayrollRun } from './domain/payroll-run';
import { TimesheetEntry } from './domain/timesheet';
import { ExpenseClaim } from './domain/expense-claim';
import { StaffAdvance } from './domain/staff-advance';
import { EmployeeStore, LeaveStore, PayrollRunStore, TimesheetStore, ExpenseClaimStore, StaffAdvanceStore } from './store.interface';

export class InMemoryEmployeeStore implements EmployeeStore {
  private items = new Map<string, Employee>();

  async save(employee: Employee, tx?: TxHandle): Promise<Employee> {
    const copy = { ...employee, updatedAt: new Date().toISOString() };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findById(tenantId: string, id: string): Promise<Employee | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  async findByTenant(tenantId: string): Promise<Employee[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return false;
    return this.items.delete(id);
  }
}

export class InMemoryLeaveStore implements LeaveStore {
  private items = new Map<string, Leave>();

  async save(leave: Leave, tx?: TxHandle): Promise<Leave> {
    const copy = { ...leave, updatedAt: new Date().toISOString() };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findById(tenantId: string, id: string): Promise<Leave | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  async findByTenant(tenantId: string): Promise<Leave[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<Leave[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId && item.employeeId === employeeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return false;
    return this.items.delete(id);
  }
}

export class InMemoryPayrollRunStore implements PayrollRunStore {
  private items = new Map<string, PayrollRun>();

  async save(payrollRun: PayrollRun, tx?: TxHandle): Promise<PayrollRun> {
    const copy = { ...payrollRun, updatedAt: new Date().toISOString() };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findById(tenantId: string, id: string): Promise<PayrollRun | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  async findByTenant(tenantId: string): Promise<PayrollRun[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<PayrollRun[]> {
    return Array.from(this.items.values())
      .filter((item) => item.tenantId === tenantId && item.employeeId === employeeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async delete(tenantId: string, id: string, tx?: TxHandle): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return false;
    return this.items.delete(id);
  }
}

export class InMemoryTimesheetStore implements TimesheetStore {
  private items = new Map<string, TimesheetEntry>();

  async save(entry: TimesheetEntry, tx?: TxHandle): Promise<TimesheetEntry> {
    const copy = { ...entry };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findById(tenantId: string, id: string): Promise<TimesheetEntry | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  async findByTenant(tenantId: string): Promise<TimesheetEntry[]> {
    return [...this.items.values()]
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<TimesheetEntry[]> {
    return [...this.items.values()]
      .filter((i) => i.tenantId === tenantId && i.employeeId === employeeId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async findByDateRange(tenantId: string, employeeId: string, from: string, to: string): Promise<TimesheetEntry[]> {
    return [...this.items.values()]
      .filter((i) => i.tenantId === tenantId && i.employeeId === employeeId && i.date >= from && i.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

export class InMemoryExpenseClaimStore implements ExpenseClaimStore {
  private items = new Map<string, ExpenseClaim>();

  async save(claim: ExpenseClaim, tx?: TxHandle): Promise<ExpenseClaim> {
    const copy = { ...claim };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findById(tenantId: string, id: string): Promise<ExpenseClaim | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  async findByTenant(tenantId: string): Promise<ExpenseClaim[]> {
    return [...this.items.values()]
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<ExpenseClaim[]> {
    return [...this.items.values()]
      .filter((i) => i.tenantId === tenantId && i.employeeId === employeeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class InMemoryStaffAdvanceStore implements StaffAdvanceStore {
  private items = new Map<string, StaffAdvance>();

  async save(advance: StaffAdvance, tx?: TxHandle): Promise<StaffAdvance> {
    const copy = { ...advance };
    this.items.set(copy.id, copy);
    return copy;
  }

  async findById(tenantId: string, id: string): Promise<StaffAdvance | null> {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  async findByTenant(tenantId: string): Promise<StaffAdvance[]> {
    return [...this.items.values()]
      .filter((i) => i.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findByEmployee(tenantId: string, employeeId: string): Promise<StaffAdvance[]> {
    return [...this.items.values()]
      .filter((i) => i.tenantId === tenantId && i.employeeId === employeeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
