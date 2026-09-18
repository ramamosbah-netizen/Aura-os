import { type Id, newId } from '@aura/shared';

export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface TimesheetEntry {
  id: Id;
  tenantId: Id;
  employeeId: Id;
  projectId: Id | null;
  wbsNodeId: Id | null;
  date: string; // YYYY-MM-DD
  hours: number;
  overtime: number;
  description: string;
  status: TimesheetStatus;
  createdAt: string;
  /** Who put the hours forward, and when. The transition took no actor. */
  submittedBy: Id | null;
  submittedAt: string | null;
  approvedBy: Id | null;
  /** Who refused them, and when. */
  rejectedBy: Id | null;
  rejectedAt: string | null;
}

export interface NewTimesheetEntry {
  tenantId: Id;
  employeeId: Id;
  projectId?: Id | null;
  wbsNodeId?: Id | null;
  date: string;
  hours: number;
  overtime?: number;
  description?: string;
}

export function makeTimesheetEntry(input: NewTimesheetEntry): TimesheetEntry {
  const h = Number(input.hours);
  if (!Number.isFinite(h) || h < 0 || h > 24) throw new Error('hours must be between 0 and 24');
  const ot = Number(input.overtime ?? 0);
  if (!Number.isFinite(ot) || ot < 0) throw new Error('overtime cannot be negative');
  if (h + ot > 24) throw new Error('total hours (regular + overtime) cannot exceed 24');
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('date must be YYYY-MM-DD');
  if (!input.employeeId) throw new Error('employeeId is required');

  return {
    id: newId(),
    tenantId: input.tenantId,
    employeeId: input.employeeId,
    projectId: input.projectId ?? null,
    wbsNodeId: input.wbsNodeId ?? null,
    date: input.date,
    hours: h,
    overtime: ot,
    description: input.description?.trim() || '',
    status: 'draft',
    createdAt: new Date().toISOString(),
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    rejectedBy: null,
    rejectedAt: null,
  };
}

export function submitTimesheet(entry: TimesheetEntry, submittedBy: Id | null = null): TimesheetEntry {
  if (entry.status !== 'draft') throw new Error(`cannot submit from status ${entry.status}`);
  return { ...entry, status: 'submitted', submittedBy, submittedAt: new Date().toISOString() };
}

/**
 * APPROVE the hours — which become cost against a project and, through payroll, money.
 *
 * THE EMPLOYEE MAY NOT APPROVE THEIR OWN HOURS. `employeeUserId` is the linked account, resolved by
 * the caller, for the same reason it is on the claim and the advance.
 */
export function approveTimesheet(entry: TimesheetEntry, approverId: Id, employeeUserId?: Id | null): TimesheetEntry {
  if (entry.status !== 'submitted') throw new Error(`cannot approve from status ${entry.status}`);
  if (approverId && employeeUserId && approverId === employeeUserId) {
    throw new Error('an employee may not approve their own timesheet — hours become cost, and a second person is what makes it an approval');
  }
  return { ...entry, status: 'approved', approvedBy: approverId };
}

export function rejectTimesheet(entry: TimesheetEntry, rejectedBy: Id | null = null): TimesheetEntry {
  if (entry.status !== 'submitted') throw new Error(`cannot reject from status ${entry.status}`);
  return { ...entry, status: 'rejected', rejectedBy, rejectedAt: new Date().toISOString() };
}

export interface WeeklySummary {
  employeeId: Id;
  weekStart: string;
  totalHours: number;
  totalOvertime: number;
  entries: TimesheetEntry[];
}

export function summarizeWeek(entries: TimesheetEntry[]): WeeklySummary | null {
  if (!entries.length) return null;
  return {
    employeeId: entries[0].employeeId,
    weekStart: entries.reduce((min, e) => (e.date < min ? e.date : min), entries[0].date),
    totalHours: entries.reduce((s, e) => s + e.hours, 0),
    totalOvertime: entries.reduce((s, e) => s + e.overtime, 0),
    entries,
  };
}
