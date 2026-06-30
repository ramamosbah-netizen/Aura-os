import { type Id, newId } from '@aura/shared';

/**
 * Attendance — one record per employee per day: check-in/out clock times, a status, and
 * the worked hours derived from the times. Feeds payroll/overtime and MoHRE compliance.
 * (Timesheets log *effort against projects*; attendance logs *presence*.)
 */
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'leave' | 'holiday';

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'half_day', 'leave', 'holiday'];

export interface AttendanceRecord {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  employeeId: Id;
  employeeName: string;
  date: string; // YYYY-MM-DD
  checkIn: string | null; // HH:MM (24h)
  checkOut: string | null; // HH:MM (24h)
  status: AttendanceStatus;
  workedHours: number;
  notes: string;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewAttendanceRecord {
  tenantId: Id;
  companyId?: Id | null;
  employeeId: Id;
  employeeName?: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status?: AttendanceStatus;
  notes?: string;
  createdBy?: Id | null;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Worked hours between check-in and check-out (0 if either missing); throws if out ≤ in. */
export function computeWorkedHours(checkIn: string | null | undefined, checkOut: string | null | undefined): number {
  if (!checkIn || !checkOut) return 0;
  const mins = toMinutes(checkOut) - toMinutes(checkIn);
  if (mins <= 0) throw new Error('check-out must be after check-in');
  return Math.round((mins / 60) * 100) / 100;
}

export function makeAttendanceRecord(input: NewAttendanceRecord): AttendanceRecord {
  if (!input.employeeId) throw new Error('employeeId is required');
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('date must be YYYY-MM-DD');
  const status = input.status ?? 'present';
  if (!STATUSES.includes(status)) throw new Error(`invalid status: ${status}`);
  if (input.checkIn && !TIME_RE.test(input.checkIn)) throw new Error('checkIn must be HH:MM');
  if (input.checkOut && !TIME_RE.test(input.checkOut)) throw new Error('checkOut must be HH:MM');
  const workedHours = computeWorkedHours(input.checkIn, input.checkOut);

  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    employeeId: input.employeeId,
    employeeName: input.employeeName?.trim() || 'Employee',
    date: input.date,
    checkIn: input.checkIn || null,
    checkOut: input.checkOut || null,
    status,
    workedHours,
    notes: input.notes?.trim() || '',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Record a check-out on an existing record, recomputing worked hours. */
export function checkOutAttendance(record: AttendanceRecord, checkOut: string): AttendanceRecord {
  if (!TIME_RE.test(checkOut)) throw new Error('checkOut must be HH:MM');
  if (!record.checkIn) throw new Error('cannot check out without a check-in');
  const workedHours = computeWorkedHours(record.checkIn, checkOut);
  return { ...record, checkOut, workedHours };
}

export interface AttendanceSummary {
  count: number;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  leave: number;
  holiday: number;
  totalHours: number;
}

/** Roll a set of attendance records (e.g. a month) into day-counts by status + total hours. */
export function summariseAttendance(records: AttendanceRecord[]): AttendanceSummary {
  const s: AttendanceSummary = { count: records.length, present: 0, absent: 0, late: 0, halfDay: 0, leave: 0, holiday: 0, totalHours: 0 };
  for (const r of records) {
    if (r.status === 'present') s.present++;
    else if (r.status === 'absent') s.absent++;
    else if (r.status === 'late') s.late++;
    else if (r.status === 'half_day') s.halfDay++;
    else if (r.status === 'leave') s.leave++;
    else if (r.status === 'holiday') s.holiday++;
    s.totalHours += r.workedHours;
  }
  s.totalHours = Math.round(s.totalHours * 100) / 100;
  return s;
}

export const ATTENDANCE_EVENT = {
  recorded: 'hr.attendance.recorded',
  checkedOut: 'hr.attendance.checked_out',
} as const;
