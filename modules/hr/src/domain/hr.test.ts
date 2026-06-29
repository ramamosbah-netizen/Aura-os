import { describe, expect, it } from 'vitest';
import { makeEmployee } from './employee';
import { makeLeave } from './leave';
import { makePayrollRun } from './payroll-run';
import {
  InMemoryEmployeeStore,
  InMemoryLeaveStore,
  InMemoryPayrollRunStore,
  InMemoryTimesheetStore,
  InMemoryExpenseClaimStore,
} from '../in-memory-hr-store';
import { HrService } from '../hr.service';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';

const mockAccess = {
  assert: () => {},
} as unknown as AccessService;

const mockEvents = {
  appendWithClient: async () => [],
} as unknown as EventStore;

const mockTx: TxRunner = {
  run: (fn) => fn(null),
};

describe('HR & Payroll Bounded Context', () => {
  describe('Employees', () => {
    it('creates an employee profile correctly', () => {
      const emp = makeEmployee({
        tenantId: 't1',
        firstName: 'John',
        lastName: 'Doe',
        role: 'Electrician',
        department: 'Operations',
        joinedDate: '2026-01-15',
        laborCamp: 'Al Quoz Camp 2',
      });
      expect(emp.firstName).toBe('John');
      expect(emp.status).toBe('active');
      expect(emp.laborCamp).toBe('Al Quoz Camp 2');
    });

    it('manages employee life cycle via service', async () => {
      const employeeStore = new InMemoryEmployeeStore();
      const leaveStore = new InMemoryLeaveStore();
      const payrollRunStore = new InMemoryPayrollRunStore();

      const service = new HrService(employeeStore, leaveStore, payrollRunStore, new InMemoryTimesheetStore(), new InMemoryExpenseClaimStore(), mockEvents, mockTx, mockAccess);

      const emp = await service.createEmployee(null, {
        tenantId: 't1',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'HR Manager',
        department: 'Corporate',
        joinedDate: '2026-02-10',
      });

      expect(emp.status).toBe('active');

      const listed = await service.listEmployees('t1');
      expect(listed.length).toBe(1);
      expect(listed[0].id).toBe(emp.id);

      const deleted = await service.deleteEmployee('t1', null, emp.id);
      expect(deleted).toBe(true);

      const afterDelete = await service.listEmployees('t1');
      expect(afterDelete.length).toBe(0);
    });
  });

  describe('Leave Management', () => {
    it('manages leave request and approval flow', async () => {
      const employeeStore = new InMemoryEmployeeStore();
      const leaveStore = new InMemoryLeaveStore();
      const payrollRunStore = new InMemoryPayrollRunStore();

      const service = new HrService(employeeStore, leaveStore, payrollRunStore, new InMemoryTimesheetStore(), new InMemoryExpenseClaimStore(), mockEvents, mockTx, mockAccess);

      const leave = await service.requestLeave(null, {
        tenantId: 't1',
        employeeId: 'emp-123',
        leaveType: 'annual',
        startDate: '2026-07-01',
        endDate: '2026-07-15',
        reason: 'Family vacation',
      });

      expect(leave.status).toBe('pending');
      expect(leave.leaveType).toBe('annual');

      const approved = await service.resolveLeave('t1', null, leave.id, 'approved');
      expect(approved.status).toBe('approved');
    });
  });

  describe('Payroll Runs', () => {
    it('calculates net salary correctly and processes payout', async () => {
      const employeeStore = new InMemoryEmployeeStore();
      const leaveStore = new InMemoryLeaveStore();
      const payrollRunStore = new InMemoryPayrollRunStore();

      const service = new HrService(employeeStore, leaveStore, payrollRunStore, new InMemoryTimesheetStore(), new InMemoryExpenseClaimStore(), mockEvents, mockTx, mockAccess);

      const run = await service.runPayroll(null, {
        tenantId: 't1',
        employeeId: 'emp-456',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        basicSalary: 5000,
        allowances: 1200,
        deductions: 350,
      });

      // netSalary = 5000 + 1200 - 350 = 5850
      expect(run.netSalary).toBe(5850);
      expect(run.status).toBe('draft');

      const paid = await service.markPayrollPaid('t1', null, run.id);
      expect(paid.status).toBe('paid');
      expect(paid.processedAt).not.toBeNull();
    });
  });
});
