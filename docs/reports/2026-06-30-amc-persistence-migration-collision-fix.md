# AMC persistence — migration-collision fix (PPM table was missing live)

**Date:** 2026-06-30
**Branch:** `feat/module-depth-verticals-jun30` (PR #12)

## Finding

AMC persistence was **already implemented** on `main` — a full `PostgresAmcStore`
(service contracts, tickets, work orders, PPM schedules) wired in `amc.module.ts` via
`useFactory` (Postgres when `PG_POOL` is set, in-memory otherwise). The audit reports
calling AMC "in-memory only / P0 data-loss risk" were **stale**.

The real, live defect: **filename-number collisions** introduced when `main` merged
into the PR #12 branch left three of `main`'s migrations **unapplied** on the live DB,
so their tables never existed:

| Colliding pair (same number) | Applied (this branch) | Skipped (main) → table missing |
|---|---|---|
| `0074_*` | `0074_inventory_reorder_levels` | `0074_amc_ppm_schedules` → `aura_amc_ppm_schedules` |
| `0075_*` | `0075_hr_attendance` | `0075_finance_period_closes` → `aura_finance_period_closes` |
| `0076_*` | `0076_quality_material_approvals` | `0076_finance_budgets` → `aura_finance_budgets` |

The runner records by **full filename**, so the same-numbered files don't overwrite
each other — but because `main`'s files weren't on disk when this branch first ran
`db:migrate`, they were silently never applied. Net effect: AMC PPM persistence (and
`main`'s finance period-close / budgets) threw `relation does not exist` against the
live DB.

## Fix

- **Renumbered** `0074_amc_ppm_schedules.sql` → **`0078_amc_ppm_schedules.sql`**
  (resolves the `0074` collision; `0074_inventory_reorder_levels` is the applied one).
- Ran `pnpm db:migrate` → applied the 3 skipped migrations live (DB now at 78):
  `0078_amc_ppm_schedules`, `0075_finance_period_closes`, `0076_finance_budgets`.
- Verified all three tables now exist (`to_regclass`).

## Verification (live Supabase)

- **AMC PPM persistence E2E**: created service contract `AMC-2026-001` → PPM schedule
  (quarterly, start 2026-01-01) → `generate-due` → **1 work order** raised and
  `next_due_date` advanced **2026-01-01 → 2026-04-01**, `visitsGenerated 1`.
- **Direct DB read** confirms the PPM row + work order persist
  (`aura_amc_ppm_schedules`, `aura_amc_work_orders`).
- `pnpm typecheck` 42/42, `pnpm test` 41/41 unchanged (no code change — migration rename only).

## Residual debt (flagged, not changed here)

The `0075` and `0076` pairs are now both applied but **still share numbers on disk**
(`*_finance_period_closes` / `*_hr_attendance`; `*_finance_budgets` /
`*_quality_material_approvals`). Renumbering already-applied migrations is risky
(runner keys on filename), so left as-is — recommend `main`'s owner renumber the
finance files in a follow-up, alongside the long-standing `0059` duplicate.
