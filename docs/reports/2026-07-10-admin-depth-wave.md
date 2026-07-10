# Admin Center Depth Wave — Users, Security Posture, Workflow Registry, Per-Event Rules

**Date:** 2026-07-10 · **Branch:** `feat/admin-depth`
**Driver:** "I should manage the whole platform from this hub" — the four Vol 15 §2
capabilities that still had no screen. Admin surface: 19 → **22 screens**.

---

## 1. `/admin/users` — the users registry (§2.2)

Until now "users" were role assignments and grants keyed by id — there was no user entity,
so nothing to deactivate. Now:

- **`aura_users`** (migration **0137** — the first under the new `@DOWN` policy, and it
  carries one) + `UsersService` in the kernel: PG write-through + hydrate-on-boot, so the
  active check is **sync in-memory on the request hot path**.
- **Enforcement is the point**: a deactivated user is refused at `POST /auth/login` (401)
  **and** on every guarded request even with a still-valid token (403, PermissionsGuard).
  Unregistered ids stay active — registry adoption is incremental, dev flow unchanged.
- Screen: merged directory (registry + workspace role assignments), inline edit
  (name/email/company), register-in-one-click for assigned-but-unregistered ids,
  deactivate/reactivate with confirm, self-deactivation blocked, all mutations audited.

## 2. `/admin/security` — the security posture (§2.2)

One guarded read (`GET admin/platform/security`) shows what the platform enforces *right
now*: token verifier (JWKS/HS256/off), anonymous-request policy, dev-token/dev-password
posture, brute-force lockout numbers, **MFA enrolments** (active vs pending — new
`MfaService.listEnrolments`, never secrets), SSO wiring (JWKS + the Entra group→role map),
and PII-crypto staging incl. rotation-in-progress. Env-bound values are deliberately
read-only with runbook pointers — the page never becomes a secrets editor.

## 3. `/admin/workflows` — the workflow registry (§2.3)

`WorkflowStore.listDefinitions` (new, both impls — tenant-scoped rows shadow global) feeds
`GET admin/platform/workflows`: every registered definition with version, scope,
state/transition counts, and live instance counts (open/completed). Read-only by design —
definitions register in code; the visual designer stays the honest P3 row (Vol 11 §11).

## 4. Per-event notification rules (§2.8 depth)

`NotificationService.record` now takes the **source event** and consults
`notify.rule.<event>` before dispatch: `off` → in-app only, a channels csv → overrides the
defaults, unset → default routing. The subscriber passes `e.type` on all six wirings. The
`/admin/notifications` "Event wirings" section became a **rules matrix**: per event —
Default / In-app only / per-channel toggles, saved as settings (clearing returns an event
to defaults).

## 5. Verification (live, dev DB)

18/18 smoke assertions green (`admin-depth-smoke`): register → login OK → deactivate →
**login 401** → **valid token 403** → reactivate → login OK · self-deactivation 400 ·
security shape (hs256 + required + lockout + MFA list + PII posture) · workflow registry
(`po.approval`: 4 states / 3 transitions) · rule set → readback `off` → cleared → `null` ·
cleanup. Migration 0137 applied to dev (137 total). Core 126 / api 30 tests green;
API build 21/21; SDK regenerated (**654 operations**, +6 routes) for the drift gate.
Page renders verified on a scratch stack (hub + 3 new pages + notifications).

## 6. What §2 still honestly lacks

API keys / service accounts (§2.5 — natural next now the SDK is published), form-designer
§2.4 remainder (add/reorder fields, versioned publish), §2.7 prompt-packs + cost meters,
digest schedules (§2.8), list-view/dashboard/menu designers (§2.4/Vol 14), workflow
*designer* (P3).
