# Runbook — Data Lifecycle: Migrations, Orphans, Archiving

**Owner:** platform ops · **Established:** 2026-07-09 (gap register Vol 23 #25, Vol 8 §5/§6/§8)

## 1. Migration policy (decided)

**Forward-only.** Recovery from a bad migration is PITR / dump-restore (`backup-dr.md`), not
authored down-scripts across the whole chain — matching the managed-Postgres posture.
Two escape hatches exist and are enforced:

- Every migration **from 0137 on must carry a `-- @DOWN` section** — `pnpm db:migrate down`
  (`migrate.mjs down`) reverts the *most recently applied* migration only: the bad-deploy
  hatch, not a rollback mechanism.
- CI gate `scripts/migration-policy-check.mjs` (in the verify job): filenames
  `NNNN_snake_case.sql`, no duplicate numbers, **no numbering gaps**, `@DOWN` present on new
  files. The `deploy-readiness` job additionally proves the whole chain applies from zero
  and is idempotent on rerun.

Writing a `@DOWN`: reverse order of the up-section (drop dependents first), and only drop
what the migration itself created — never `drop table` on a table another migration extends.

## 2. Orphan scan (snapshot-not-join mitigation)

The schema keeps one hard FK by design (ADR-0001) — cross-context references are ids +
name snapshots. The mitigation is `apps/api/scripts/orphan-scan.mjs`
(`pnpm --filter @aura/api db:orphan-scan`): checks the catalogued reference pairs
(tenders→accounts, contracts→tenders, projects→contracts, POs→projects, invoices/GRNs→POs…)
for ids that no longer resolve, tenant-scoped.

- **CI:** runs `--enforce` against the seeded deal chain on every build (zero orphans or fail).
- **Production:** run monthly (report mode). An orphan means a service-code bug or a manual
  delete — investigate before "fixing" data; the audit trail says who deleted the parent.
- New cross-context id column ⇒ add a row to `REFERENCES` in the script (part of code review).

## 3. Archiving (event spine + audit)

Policy (Vol 8 §8): **closed-period financial data stays hot** — statements need it. Only the
two append-only kernel tables roll to cold storage, once older than **12 months**:

- `apps/api/scripts/archive-events.mjs` (`pnpm --filter @aura/api db:archive`) moves
  `aura_events` (**processed rows only** — the outbox never loses pending work) and
  `aura_audit_log` into `*_archive` twins (created on demand, same shape), transactional
  batches of 5000. **Dry-run by default**; `--execute` to move; `--months=N --batch=N` to tune.
- Archive tables stay queryable in place; export them to object storage via the OLAP/CSV
  path before dropping rows older than the legal retention floor (UAE: 5 years financial).
- Cadence: quarterly, after a successful backup. Log runs below.

| Date | Table(s) | Cutoff | Rows moved | Notes |
|---|---|---|---|---|
| — | — | — | — | first production run pending |
