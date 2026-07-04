# Role-based Workspaces + Administrator Center

**Date:** 2026-07-04 · **Branch:** `feat/command-center` · **Commit:** `2bbe72b`

## Goal

Admins should see and preview **every** user's workspace; each user should see only the workspace
their role allows. In an **Administrator Center**, an admin configures the space per role — adding
functions and allowing/denying what a user can see or access — with a friendly, visual UI.

## What shipped

### Framework-free core — `@aura/shared/workspace` (6 unit tests)

- **`roles.ts`** — 8 workspace roles (admin, executive, finance, procurement, projects,
  operations, hr, viewer) with label, description, colour, admin flag.
- **`functions.ts`** — a catalog of **25 toggleable functions** in four categories: Command Center
  panels, quick actions, command perspectives, navigation suites.
- **`config.ts`** — `WorkspaceConfig` (users→roles, roles→allowed functions) with pure
  `resolveRole`, `visibleFunctionIds`, `canAccess`, `resolveWorkspaceMe`, `mergeWorkspaceConfig`,
  sensible per-role defaults, and a seeded demo directory (7 users across roles). The same pure
  code runs in the API and the web so both filter identically.

### API — `apps/api/src/workspace`

- `WorkspaceConfigService` (in-memory, seeded; a Postgres store can drop in behind it) +
  `WorkspaceController`: `GET/PUT /workspace/config`, `GET /workspace/me` (the caller's effective
  role + functions, dev-fallback identity when auth is open), `GET /workspace/users`. Registered in
  `app.module`. Three web BFF routes proxy them.

### Web

- **Administrator Center `/admin/workspace`** — role-centric (not a 200-cell matrix): role cards
  with user + function counts; per-role function toggles grouped by category with a live
  "what a {role} sees" preview; member management (assign/remove usernames); a full **user
  directory** with per-user role dropdowns and Preview→; Save persists via PUT with a dirty
  indicator. Non-admins get an access-required panel. Nav gains an **Administrator** entry.
- **Command Center honors the role** — reads `/workspace/me` and renders only the allowed panels,
  quick actions and CEO/CFO/PM perspectives. An admin **"View workspace as [role]"** switch
  (persisted in localStorage) previews any role's exact workspace with a preview banner. Falls back
  to full access when the workspace API is unavailable (backward compatible).

## Architecture / reuse

- The access model is a UI/experience layer, deliberately separate from the kernel RBAC grants
  (Vol 7) that gate the API — non-breaking, and composes cleanly with the existing Command Center.
- Pure resolution in `@aura/shared` → identical filtering server- and client-side, unit-tested.

## Verified live (demo data)

- Admin bar shows View-as + Administrator Center link; full workspace by default.
- Previewing **Viewer** hid the health ring, all perspectives and quick actions, showing only the
  AI briefing, the attention feed, and the **Financial** card — which had just been enabled for
  Viewer in the admin center (toggle → live preview "3 functions" → Save persisted).
- Exit preview restored the full admin workspace (health ring, perspectives, 9 quick actions).
- Zero console errors. 122 shared tests pass (6 new); shared/api/web builds + web tsc + eslint green.

## Remaining / next

- Persist the config to Postgres (store interface already isolated) and drive role from a real
  identity claim instead of the dev-fallback username.
- Gate the **sidebar navigation suites** by `suite.*` functions (today the suites exist in the
  catalog and are configurable; the nav itself is not yet filtered).
- Per-user overrides on top of role defaults; audit-log the config changes.
