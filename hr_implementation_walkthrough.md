# HR & Payroll Module Implementation Walkthrough

The HR & Payroll module has been successfully integrated into the AURA OS workspace. Below is a detailed summary of the architectural changes and completed workflows.

---

## 1. Domain Entities & Bounded Contexts
We created core domain entities representing the HR & Payroll space under `modules/hr/src/domain/`:
* **Employee** (`employee.ts`): Model representing employee data, containing first/last name, joined date, camp location, job role, and optional fields for visa and work permit tracking.
* **Leave** (`leave.ts`): Model representing employee leave requests, handling statuses (`pending`, `approved`, `rejected`), period tracking, and reason.
* **PayrollRun** (`payroll-run.ts`): Model representing monthly payroll calculations, tracking basic salary, allowances, deductions, net salary (calculated as `basic + allowances - deductions`), and payment status (`draft`, `approved`, `paid`).

---

## 2. Ports and Adapters (Repository Architecture)
* **Store Interface** (`store.interface.ts`): Exposes standard CRUD operations, query capabilities, and transactional handles.
* **In-Memory Repositories** (`in-memory-hr-store.ts`): Fallback store for local unit testing and development.
* **PostgreSQL Repositories** (`postgres-hr-store.ts`): Production database adapter mapping domains to/from PostgreSQL database tables.

---

## 3. NestJS Backend Services & Controllers
* **HrService** (`hr.service.ts`): Business logic coordinator validating domain state transitions, appending events to the kernel's event log, and managing database transactions.
* **HrModule** (`hr.module.ts`): Dependency injection wiring that automatically picks the PostgreSQL store when a connection pool is present, falling back to the InMemory store.
* **HrController** (`apps/api/src/hr/hr.controller.ts`): Exposes NestJS RESTful API endpoints for employee profile CRUD, leave resolutions, and payroll calculation.
* **AppModule Registry** (`apps/api/src/app.module.ts`): Registered the controller and module globally.

---

## 4. Next.js BFF & Interface
* **BFF Proxy Routes**: Added Next.js route handlers under `apps/web/app/api/hr/` forwarding requests to the NestJS API with automatic header and session handling.
* **Sidebar Link**: Registered the **HR & Payroll** link in the Operate section of `apps/web/components/nav.ts`.
* **Interactive Client Component** (`apps/web/components/hr-control-client.tsx`):
  * **Employee Profiles**: Form to register workers, directory table with automatic warning badges for expired/upcoming visa deadlines, and delete functions.
  * **Leave Management**: Leave submission form with employee selection and approval/rejection button actions.
  * **Payroll Run**: Input form calculating net salary, disburse & pay ledger actions.

---

## 5. Verification Actions
1. **Unit Tests**: Executed `vitest` tests confirming correct profile mapping, state machines, and calculations.
2. **End-to-End Simulation**: Ran the application locally and used a browser subagent to perform full employee setup, leave approval, and payroll disbursement.
