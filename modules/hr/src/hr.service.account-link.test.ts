import { describe, expect, it } from 'vitest';
import { AccessService, UsersService, type EventStore, type TxRunner } from '@aura/core';
import { AccessDeniedError } from '@aura/shared';
import { HrService } from './hr.service';
import {
  InMemoryAppraisalStore, InMemoryAttendanceStore, InMemoryEmployeeStore, InMemoryExpenseClaimStore,
  InMemoryLeaveStore, InMemoryPayrollRunStore, InMemoryStaffAdvanceStore, InMemoryTimesheetStore,
} from './in-memory-hr-store';

const events: string[] = [];
const mockEvents = {
  appendWithClient: async (_handle: unknown, list: Array<{ type: string }>) => {
    events.push(...list.map((event) => event.type));
    return [];
  },
} as unknown as EventStore;
const mockTx: TxRunner = { run: (fn) => fn(null) };

function service(options: {
  accounts?: Record<string, { active: boolean }>;
  permitted?: boolean;
} = {}) {
  const accounts = options.accounts ?? { 'u-maya': { active: true }, 'u-sami': { active: true } };
  const employeeStore = new InMemoryEmployeeStore();
  const access = {
    assert: () => {
      if (options.permitted === false) throw new AccessDeniedError('hr.employee.link-account');
    },
  } as unknown as AccessService;
  const users = {
    ensureTenant: async () => {},
    get: (tenantId: string, userId: string) =>
      accounts[userId] ? { tenantId, userId, displayName: userId, email: '', companyId: null, active: accounts[userId].active } : null,
  } as unknown as UsersService;
  const hr = new HrService(
    employeeStore, new InMemoryLeaveStore(), new InMemoryPayrollRunStore(), new InMemoryTimesheetStore(),
    new InMemoryExpenseClaimStore(), new InMemoryStaffAdvanceStore(), new InMemoryAttendanceStore(),
    new InMemoryAppraisalStore(), mockEvents, mockTx, access, users,
  );
  return { hr, employeeStore };
}

const newEmployee = (hr: HrService, first: string) =>
  hr.createEmployee(null, { tenantId: 't1', firstName: first, lastName: 'Haddad', role: 'Site Engineer', department: 'Projects', joinedDate: '2026-01-01' });

describe('HrService employee ↔ account link', () => {
  it('links a registered active account and announces it', async () => {
    events.length = 0;
    const { hr } = service();
    const employee = await newEmployee(hr, 'Maya');
    const linked = await hr.linkEmployeeAccount('t1', 'u-admin', employee.id, 'u-maya');
    expect(linked.userId).toBe('u-maya');
    expect(linked.userLinkedBy).toBe('u-admin');
    expect(events).toContain('hr.employee.account_linked');
    expect(await hr.findEmployeeByAccount('t1', 'u-maya')).toMatchObject({ id: employee.id });
  });

  it('refuses an account the tenant has never registered', async () => {
    const { hr } = service();
    const employee = await newEmployee(hr, 'Maya');
    await expect(hr.linkEmployeeAccount('t1', 'u-admin', employee.id, 'u-ghost')).rejects.toThrow(/not registered/);
    expect(await hr.findEmployeeByAccount('t1', 'u-ghost')).toBeNull();
  });

  it('refuses a deactivated account', async () => {
    const { hr } = service({ accounts: { 'u-maya': { active: false } } });
    const employee = await newEmployee(hr, 'Maya');
    await expect(hr.linkEmployeeAccount('t1', 'u-admin', employee.id, 'u-maya')).rejects.toThrow(/deactivated/);
  });

  it('refuses to give one account to a second employee', async () => {
    const { hr } = service();
    const first = await newEmployee(hr, 'Maya');
    const second = await newEmployee(hr, 'Sami');
    await hr.linkEmployeeAccount('t1', 'u-admin', first.id, 'u-maya');
    await expect(hr.linkEmployeeAccount('t1', 'u-admin', second.id, 'u-maya')).rejects.toThrow(/already linked/);
    expect(await hr.findEmployeeByAccount('t1', 'u-maya')).toMatchObject({ id: first.id });
  });

  it('refuses an actor without the link permission', async () => {
    const { hr } = service({ permitted: false });
    const employee = await newEmployee(hr, 'Maya');
    await expect(hr.linkEmployeeAccount('t1', 'u-site', employee.id, 'u-maya')).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('unlinks, frees the account for another employee and announces it', async () => {
    events.length = 0;
    const { hr } = service();
    const first = await newEmployee(hr, 'Maya');
    const second = await newEmployee(hr, 'Sami');
    await hr.linkEmployeeAccount('t1', 'u-admin', first.id, 'u-maya');
    await hr.unlinkEmployeeAccount('t1', 'u-admin', first.id);
    expect(await hr.findEmployeeByAccount('t1', 'u-maya')).toBeNull();
    expect(events).toContain('hr.employee.account_unlinked');
    const relinked = await hr.linkEmployeeAccount('t1', 'u-admin', second.id, 'u-maya');
    expect(relinked.userId).toBe('u-maya');
  });

  it('keeps a tenant from reading another tenant’s link', async () => {
    const { hr } = service();
    const employee = await newEmployee(hr, 'Maya');
    await hr.linkEmployeeAccount('t1', 'u-admin', employee.id, 'u-maya');
    expect(await hr.findEmployeeByAccount('t2', 'u-maya')).toBeNull();
  });
});
