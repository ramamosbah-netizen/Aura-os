import { TxHandle } from '@aura/core';
import { Employee } from './domain/employee';
import { Leave } from './domain/leave';
import { PayrollRun } from './domain/payroll-run';
import { EmployeeStore, LeaveStore, PayrollRunStore } from './store.interface';

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
