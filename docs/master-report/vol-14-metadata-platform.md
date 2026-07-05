# Volume 14 — Metadata Platform

[← Master index](README.md)

The strategic bet (Volume 1 principle #3): behavior as data. This volume inventories each
metadata surface — what is configurable today vs code, and the path to Dynamics/Salesforce-
grade "everything is metadata".

---

## 1. Entities

- **Today:** entity shape lives in code (domain types + store ports + migrations) — the
  uniform module template makes new entities mechanical but still code.
- **Kernel ready:** `core/src/builder/entity-registry.service.ts` holds entity descriptors
  over API (`apps/api/src/builder`).
- **[Planned]:** custom fields on registered entities (JSONB extension column pattern —
  line-item JSONB precedent exists), then designer-created custom entities (generated table +
  registered schema + generic CRUD via the Universal Create Engine).

## 2. Fields

✅ **Fully metadata for forms** — the complete field vocabulary (kind, label, placeholder,
required, visibility, readonly, defaults incl. `=EXPR`, validation, permissions, transforms,
transient, dataType, formulas) is JSON (Volume 5 §3). Field *storage* remains code+migration
until custom-fields lands (§1).

## 3. Layouts

✅ Metadata: sections, columns, tabs, accordions, cards, collapsible groups, responsive grid —
`LayoutNode` trees rendered by the layout engine. Missing-field auto-append protects against
metadata drift. Record-page layouts (detail views) are still hand-built [Gap — the `view` mode
of EntityForm is the convergence point].

## 4. Views

◐ **Saved views** (kernel service + store, migration 0115, `/views` page): per-user persisted
filter/column sets. List-view *definitions* (which columns a register shows) are still code
[Planned: view schemas through the same registry pattern as forms].

## 5. Menus

◐ Single-source navigation (`nav.ts` feeds sidebar + ⌘K) — one file, trivially convertible to
tenant metadata; per-role menu trimming [Planned] (depends on permission taxonomy, Vol 7 §2).

## 6. Dashboards

❌ Code today (five dashboard pages). Target: widget registry + dashboard schemas (same
registry pattern; the form-engine plugin mechanism is the template) [Planned — Volume 16].

## 7. Permissions

◐ Engine is data-driven (roles/grants evaluated at runtime); role *definitions* registered in
code, storage in-memory. Path: DB-backed roles + admin UI (Vol 15) + field-level `permission`
keys already honored by the form engine.

## 8. Reports

◐ Reporting SQL views (migration 0113) + OLAP export are the data layer; report *definitions*
[Planned — Volume 16].

## 9. Actions

◐ Palette verbs + lifecycle endpoints exist in code; toolbar actions are registrable
(`registerFormToolbarAction`). Generic action metadata (buttons → workflow triggers)
[Planned — with the workflow designer].

## 10. Plugins

✅ The contract is live (Volume 5 §6): field types, validators, formula functions, toolbar
actions, schemas — all registered by id from app land, core untouched. This registry pattern
is the template every other metadata surface (widgets, views, actions) will reuse.

## Maturity matrix

| Surface | Metadata today | Designer UI | Tenant overrides |
|---|---|---|---|
| Forms (fields/layout/rules/formulas) | ✅ | [Planned] | [Planned — DB schemas] |
| Saved views | ✅ per-user | ✅ (implicit) | ✅ |
| Navigation | ◐ single source | ❌ | ❌ |
| Entities/custom fields | ❌ | ❌ | ❌ |
| List views | ❌ | ❌ | ❌ |
| Dashboards/widgets | ❌ | ❌ | ❌ |
| Permissions | ◐ engine data-driven | ❌ | ❌ |
| Workflows | ◐ definitions as data | ❌ | ❌ |

The sequence (Volume 20): form designer → list-view schemas → dashboard widgets → custom
fields → workflow designer → custom entities.

---

*Next: [Volume 15 — Administration Center](vol-15-administration.md)*
