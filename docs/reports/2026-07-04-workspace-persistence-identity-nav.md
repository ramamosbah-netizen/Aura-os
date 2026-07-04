# Workspace access: persistence, identity-driven roles, role-gated sidebar

**Date:** 2026-07-04 · **Branch:** `feat/command-center` · **Commit:** `1480bdc` · **PR:** #23

Follow-up to `2026-07-04-role-based-workspace-admin.md` — closes the three "next steps" it named.

## What shipped

| # | Item | Implementation | Verified |
|---|------|----------------|----------|
| 1 | Config persistence | `workspace-config-store.ts` store abstraction in `apps/api/src/workspace/`: `InMemoryWorkspaceConfigStore` (no `DATABASE_URL`) / `PgWorkspaceConfigStore` (JSONB per tenant, migration `infrastructure/migrations/0127_workspace_config.sql`). Provided in `app.module.ts` via a `PG_POOL`-injected factory; service is tenant-scoped. | PUT → GET → `/me` round-trip consistent through the store |
| 2 | Identity-driven role | `WorkspaceController` resolves the user from `actorId` (JWT `sub`); login mints a token for any username in dev. Unauthenticated dev default: `u-admin`. | `u-finance` token → `role: finance`, `isAdmin: false`, suites `finance/dealChain/operate`; no token → admin |
| 3 | Role-gated sidebar | `GROUP_SUITE` map + `filterNavBySuites` in `apps/web/components/nav.ts`; layout fetches `/workspace/me` server-side and passes allowed suites to `AppShell` (no flash). Admins bypass. Workspace group always visible. | Logged in via web BFF as `u-finance`: rendered HTML shows Workspace/Deal chain/Operate only, no Intelligence/Platform, no Administrator link. `u-admin`: all five groups + Administrator link |

Also: role default suites aligned so each role reaches its own pages (finance gets
`suite.operate` — invoices/ledger live under the Operate nav group).

## Quality gates

- shared/api/web builds green; web tsc + eslint clean (pre-commit).
- 122/122 shared tests pass (16 files).
- Live verification on worktree stack (API :4100, web :3100), server-rendered HTML inspected
  for both roles.

## Remaining

- Run migration 0127 against a real Postgres (PG store code-complete, exercised in-memory).
- Per-user overrides on top of per-role functions.
- Company-level scoping (config is tenant-scoped today).
