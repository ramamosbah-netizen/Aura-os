# Verification Report — HR & Payroll (Tier-2)

**Date:** June 27, 2026  
**Scope:** Employee Profiles Registry, Leaves Tracking System, Monthly Payroll Ledger & runs, UAE visa/permits monitoring, database schema, NestJS module services & controllers, Next.js BFF proxy, sidebar menu integration.

---

## 1. Database Schema
Created tables via migration `0025_hr.sql` namespaces under `aura_hr_*` to store staff, leaves, and calculated payroll ledger records:

```sql
-- 1. Employees Registry
CREATE TABLE IF NOT EXISTS public.aura_hr_employees (
  id              UUID PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  company_id      TEXT,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  role            TEXT NOT NULL,
  department      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  joined_date     DATE NOT NULL,
  visa_expiry     DATE,
  permit_expiry   DATE,
  labor_camp      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Leave Management
CREATE TABLE IF NOT EXISTS public.aura_hr_leaves (
  id              UUID PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  company_id      TEXT,
  employee_id     UUID NOT NULL REFERENCES public.aura_hr_employees(id) ON DELETE CASCADE,
  leave_type      TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Payroll Runs
CREATE TABLE IF NOT EXISTS public.aura_hr_payroll_runs (
  id              UUID PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  company_id      TEXT,
  employee_id     UUID NOT NULL REFERENCES public.aura_hr_employees(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  basic_salary    NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  allowances      NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  deductions      NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  net_salary      NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  status          TEXT NOT NULL DEFAULT 'draft',
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 2. API Integration
- **NestJS Service & Module:** `HrService` coordinates lifecycle logic, asserts user permissions (`hr.employee.create`, `hr.leave.approve`, `hr.payroll.pay`, etc.), appends auditable events to the event store, and uses database transaction runners (`TxRunner`). The module dynamically injects `PostgresHrStore` if a database connection pool is present, or falls back to `InMemoryHrStore`.
- **NestJS Controller:** Exposes endpoints under prefix `/api/hr` (`/employees`, `/leaves`, `/payroll`) to support active registry and workflow actions.
- **Next.js BFF Integration:** Exposes dynamic App Router route handlers forwarding UI requests to NestJS with secure tenant context extraction.

---

## 3. UI Component Details
- **Employee Profiles:** Supports staff registration, labor camp designation, and monitors UAE visa/work permit countdowns (showing green badges for valid status, orange warning badges for expiries within 30 days, and red badges for expired items).
- **Leave Management:** Enables employees to submit sick, annual, or unpaid leave, showing a central approval board with quick Approve/Reject resolution actions.
- **Payroll Processing:** Allows calculating net salary (`basic + allowances - deductions`), running monthly payouts, and executing disbursements.

---

## 4. Verification Output
- **Database Migrations:** Applied and current:
  ```
  • skip  0025_hr.sql (already applied)
  Migrations: 0 applied, 25 already current.
  ```
- **Type Safety Checks:** Checked the whole workspace, compiling successfully without errors:
  ```
  Tasks:    36 successful, 36 total
  ```
- **Vitest Unit Tests:** Service unit tests successfully verified state machines:
  ```
  ✓ src/domain/hr.test.ts (4 tests) 5ms
  ```
- **E2E Integration Flow:** Verified in-browser with automated subagent, confirming new employee profile addition, leave resolution, and payroll disburse workflow.
