// Per-entity postgres stores — split from the former consolidated file.
// This barrel keeps existing `from './postgres-hr-store'` imports working.
export { PostgresEmployeeStore } from './postgres-employee-store';
export { PostgresLeaveStore } from './postgres-leave-store';
export { PostgresPayrollRunStore } from './postgres-payroll-run-store';
export { PostgresTimesheetStore } from './postgres-timesheet-store';
export { PostgresExpenseClaimStore } from './postgres-expense-claim-store';
export { PostgresStaffAdvanceStore } from './postgres-staff-advance-store';
export { PostgresAttendanceStore } from './postgres-attendance-store';
export { PostgresAppraisalStore } from './postgres-appraisal-store';
