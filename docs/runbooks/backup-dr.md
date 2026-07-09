# Runbook — Backup & Disaster Recovery

**Owner:** platform ops · **Last verified:** 2026-07-09 (automated drill in CI — see §4)
**Objectives:** RPO ≤ 5 minutes (PITR) · RTO ≤ 4 hours (full restore + reboot)

Closes gap register Vol 23 #5. Recovery that isn't rehearsed doesn't exist — the drill in
§4 runs on **every CI build**, so a broken backup path fails the pipeline, not the incident.

---

## 1. What must be backed up

| Asset | Where | Mechanism |
|---|---|---|
| Postgres (all tenant data, events, projections, config) | Supabase (dev/demo) / managed PG (prod) | PITR + nightly logical dump (§2) |
| DMS binaries (uploaded documents) | Supabase Storage / blob store | bucket **versioning ON** + provider replication |
| Secrets | vault / secret store (see `secrets-rotation.md`) | the store's own backup — never in DB dumps |
| Code + migrations | GitHub (`main`) | git history; images on GHCR per main commit |

The API is stateless — nothing to back up. A lost API node is replaced by rerunning the image.

## 2. Backup procedure

**Managed PITR (primary):** enable point-in-time recovery on the Postgres provider
(Supabase: Settings → Database → PITR; Azure Flexible Server: automated backups, 7–35 d).
This is what delivers RPO ≤ 5 min.

**Logical dump (secondary, portable):** nightly, and always before a risky migration:

```sh
pg_dump "$DATABASE_URL" -Fc -f "aura-$(date +%Y%m%d-%H%M).dump"
```

Store dumps in versioned object storage with 30-day retention, a different account/region
than the primary DB. The dump format is the one the CI drill restores, so it is known-good.

## 3. Restore procedure (RTO path)

1. **Provision** an empty Postgres 16 **with pgvector** (`pgvector/pgvector:pg16` or the
   provider's `vector` extension enabled — migration 0019 requires it).
2. **Restore**: PITR to the target timestamp via the provider console, **or** from a dump:
   ```sh
   createdb -h <host> -U <user> aura
   pg_restore -h <host> -U <user> -d aura --no-owner aura-<stamp>.dump
   ```
3. **Verify** before pointing traffic (same check CI runs):
   ```sh
   SOURCE_URL=<old-or-expected> RESTORE_URL=<new> node apps/api/scripts/verify-restore.mjs
   ```
   If the source is gone (true DR), sanity-check instead: `aura_migrations` count matches the
   repo's `infrastructure/migrations` count; spot-query a business table.
4. **Re-point** the API: update `DATABASE_URL` (or its `_FILE` mount) and restart. Migrations
   are idempotent — `node scripts/migrate.mjs` on boot-out is safe and confirms schema parity.
5. **Replay stragglers**: dead-letters at `/admin/health` (dead-letter KPIs + table) —
   requeue via the events admin; failed webhook deliveries auto-retry with backoff once the
   API is up.

## 4. The rehearsed drill (automated)

The `deploy-readiness` CI job **is** the restore drill, run on every PR and push to main:
fresh Postgres → full migration chain from zero → idempotence rerun → boot the built API →
seed a realistic dataset through the live API → freeze → `pg_dump -Fc` → `pg_restore` into a
second database → `verify-restore.mjs` (per-table row counts must match; empty source fails).

**Quarterly manual drill (policy):** once a quarter, restore the latest *production* dump into
a scratch instance following §3 and record date/duration/outcome below. The CI drill proves
the mechanism; the quarterly drill proves the production dumps.

| Date | Restored from | Duration | Outcome |
|---|---|---|---|
| 2026-07-09 | CI drill (seeded dataset, pg_dump→pg_restore) | ~1 min | ✅ counts identical |

## 5. Failure scenarios

| Scenario | Response |
|---|---|
| Bad deploy / broken migration | roll back the image; `node scripts/migrate.mjs down` reverts the last migration (each file carries `-- @DOWN`) |
| Data corruption / bad bulk write | PITR to just before the write; replay from the event log where possible |
| Region loss | restore latest dump into a new region (§3); DNS/ingress re-point; DMS bucket replication covers binaries |
| Dead-letter backlog after outage | `/admin/health` → requeue; alert `OutboxDeadLetters` fires via the Prometheus pack |
