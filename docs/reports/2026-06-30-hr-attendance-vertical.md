# Module-depth vertical — HR Attendance (daily presence)

**Date:** 2026-06-30
**Module:** `@aura/hr`
**Migration:** `0075_hr_attendance.sql` (applied live → DB at 75)

## What & why

HR had timesheets (effort against projects) but no **attendance** (presence) — a gap
flagged across the audits ("HR missing: attendance"). This adds one record per
employee per day: check-in/out clock times, a status, and worked hours derived from
the times. Feeds payroll/overtime and MoHRE compliance.

## Domain (`modules/hr/src/domain/attendance.ts`)

- `makeAttendanceRecord` — validates date `YYYY-MM-DD`, `HH:MM` times, status enum
  (`present | absent | late | half_day | leave | holiday`); derives `workedHours`.
- `computeWorkedHours(in, out)` — hours between times (0 if either missing; throws if out ≤ in).
- `checkOutAttendance(record, out)` — records a later check-out, recomputing hours;
  requires a prior check-in.
- `summariseAttendance(records)` — day-counts by status + total hours over a range.
- Events: `hr.attendance.recorded | checked_out`.

## Vertical (mirrors the timesheet vertical; HR's consolidated store)

- domain `attendance.ts` + **7 unit tests**
- store: extended `AttendanceStore` port + in-memory + postgres impls (HR's single
  store file pattern; `dateOnly()` local-parts mapping; `HH:MM` kept as text)
- migration `0075` — `aura_hr_attendance`, indexed (tenant / employee / date),
  RLS-locked (`tenant_isolation_policy`)
- service: `recordAttendance`, `checkOutAttendance`, `listAttendance`,
  `attendanceSummary`; emits on the spine. New `ATTENDANCE_STORE` token + module provider.
- API on `HrController`: `POST/GET /api/v1/hr/attendance`, `/attendance/summary`,
  `PUT /attendance/:id/checkout`
- web: BFF routes + `/hr/attendance` page + client (record form, status badges,
  inline check-out, summary bar) + nav entry

## Verification

- `pnpm typecheck` **42/42**; `pnpm test` **41/41** tasks (HR **50/50**, 7 new;
  fixed the 3 existing `hr.test.ts` `new HrService(...)` calls for the added store arg).
- **Live-DB E2E** (Supabase, API on :4143): record present + check-in 09:00 → worked 0
  → check out 17:30 → **worked 8.5** (persisted) → record absent → worked 0 →
  summary `{count 2, present 1, absent 1, totalHours 8.5}`; bad status → **400**,
  bad time → **400**.

## Next candidates

- Attendance → payroll: feed worked-hours/overtime + absence deductions into the payroll run.
- Leave ↔ attendance: auto-mark `leave`-status days from approved leave records.
- Bulk daily attendance entry (one row per employee for a date).
