# Universal pagination adoption — fleet, HR, doc-control + dormant wirings

**Date:** 2026-07-07 · **Branch:** `claude/dazzling-hermann-eb2ace`
· Gap register Vol 23 **#9** (Vol 9 §1). Verified against the live tree per row.

The `Page<T>` primitive (`shared/src/pagination.ts`: `parsePageParams`, `makePage`,
`paginate`, clamp to `MAX_PAGE_LIMIT`) was already broadly adopted (~214 `listPaged`
across modules, 26 controllers). This pass closes the long tail: the modules whose
tenant-wide list endpoints still returned unbounded `findByTenant`/`findAll` arrays.

## Adoption pattern (confirmed platform convention)

**Additive and non-breaking.** The bare-array route stays; a sibling `GET .../paged`
route returns the `Page<T>` envelope via `parsePageParams(limit, offset)`. No existing
response shape changes → zero web-client impact. Each `/paged` route is declared before
any `:id` route so the literal segment wins.

## What shipped

| Module | Endpoints paginated | Filters | Commit |
|---|---|---|---|
| **Fleet** | vehicles*, fuel, maintenance, fines, salik | vehicle/status/make/model | `18296dd` |
| **HR** | employees, leaves, payroll, timesheets, attendance, expense-claims, staff-advances, appraisals (all 8) | employeeId (scoped) | `91a74c3` |
| **Doc-control** | transmittals, correspondence, submittals, drawing register | projectId | `cf4e69a` |
| **Assets / Site** | assets*, site daily-reports* (dormant service methods exposed) | category/status, project/status | `061fe4b` |

\* the store/service `listPaged` already existed; only the controller route was missing.

Each module: `listPaged` on every affected store (interface + postgres `COUNT` +
`LIMIT/OFFSET` + in-memory `paginate`), a service `listXxxPaged`, and the controller
route. HR and doc-control each got a small module-local `paged-query.ts` helper
(`pagePostgres` + a `where`-builder) — **not** shared across packages, to respect the
module-boundary law (all modules import only `@aura/core` + `@aura/shared`).

## Verification

- Per-module domain tests: **+5 pagination tests** (fleet 2, HR 2, doc-control 1) — each
  asserts window size, `total`, `hasMore`, and a filter (vehicle/employee/project), plus
  HR employees' soft-delete exclusion.
- Fleet 25 · HR 58 · doc-control 21 module tests green.
- API **29 unit + 6 e2e** green; full `turbo run build` **22/22**; eslint **0 errors** on
  changed files.

## Remaining

- Site's other child lists (delay logs, instructions, material consumption, labour) and
  a handful of low-traffic masters remain array-only — bounded/low-growth, deferrable.
- Frontend opt-in: pages still call the bare routes; adopting `/paged` (with UI paging
  controls) is a separate UX task, unblocked by this server-side foundation.
