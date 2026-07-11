# Module Manager + Module Settings — NEW-ERP Parity Wave

**Date:** 2026-07-11 · **Branch:** `feat/admin-modules` · Hub: 22 → **24 screens**
**Driver:** "manage and configure all platform and all app, as in the old apps" — gap-mapped
against the legacy NEW-ERP `SettingsWorkspace` (module enable/disable, VAT, purchase/VO
thresholds, low-stock, default project stages, working days, terms).

## 1. `/admin/modules` — Module Manager

- Kernel `ModulesService`: per-tenant disabled set held in memory (sync hot-path check),
  durable in the settings row **`modules.disabled`** (csv — no new table), hydrate-on-boot.
- **Enforced twice**: the PermissionsGuard rejects a disabled module's routes with 403
  (**before** the auth pass-through — tenant config applies even in dev), and the sidebar
  hides its items for every user (`GET /workspace/modules`, nav filtered by href module
  segment). Kernel surfaces (admin/workspace/search/audit…) are never gateable. Toggles
  audited; data untouched.

## 2. `/admin/module-settings` — business defaults per module

`MODULE_SETTINGS_CATALOG` (shared, typed): finance (VAT %, payment terms, fiscal year,
currency) · procurement (direct-purchase threshold, min quotes, RFQ validity) · inventory
(low-stock, valuation) · projects (default stages csv, VO threshold %) · subcontracts
(**default retention % — consumed live**: applied when a create omits retention, explicit
value wins) · HR (leave, probation, work week) · CRM / AMC / fleet / assets defaults.
Generic renderer (tabs per module, number/select/toggle/csv), values in
`aura_tenant_settings`; a **live** pill marks keys a code path reads today — the rest are
the published surface modules adopt via `SettingsService`.

## 3. Verification — 9/9 live

Dev DB: 17 modules all enabled → fleet off → `GET /fleet/vehicles` **403 "module 'fleet'
is disabled"** · crm unaffected 200 · `/workspace/modules` lists it · settings row
`modules.disabled=fleet` (durable) · re-enable → 200. In-memory: retention setting 7 →
create without retention → **7**; explicit 12 → **12**. Core 135 tests (+3 gate tests),
build 21/21, web typecheck clean, SDK 663 ops.

## 4. Remainder (recorded)

NEW-ERP items not yet mirrored: sessions list/revoke UI, backup UI (runbook exists),
PDF-template settings (print templates screen exists), per-module settings consumption
beyond retention (keys published, adopt per seam).
