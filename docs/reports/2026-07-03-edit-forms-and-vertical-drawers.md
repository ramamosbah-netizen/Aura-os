# Edit Forms + Depth-Vertical Drawer Conversion

**Date:** 2026-07-03 · **Branch:** `claude/vibrant-feistel-c4213d` · Extends
[2026-07-03-professional-create-forms.md](./2026-07-03-professional-create-forms.md)
(both "Not done / next" items from that report are closed here).

## Part 1 — Edit forms for the 6 spine entities (commit `f983112`)

Full update path added end-to-end for Account, Tender, Contract, Project,
Purchase Order, Supplier Invoice:

| Layer | Change |
|---|---|
| Stores | `update(id, patch)` added where missing (accounts, projects — interface + in-memory + postgres) |
| Services | `update()` strips `undefined` keys before spreading (no field wipe), emits the domain `*.updated` event |
| API | `PATCH /:id` on all six controllers |
| BFF | six `[id]/route.ts` PATCH pass-throughs |
| UI | `create-drawer.tsx` gained edit mode (`initialValues` + PATCH); per-entity Edit buttons on all six list surfaces |

Verified live (ports 4200/3200): DEWA account edited via prefilled drawer —
industry change persisted through BFF → API → store; remaining PATCH
endpoints spot-checked at API level. 12+3 test files pass; AccountService
test updated for the new constructor arg.

## Part 2 — Depth-vertical multi-tab clients converted to drawers

The six 900–1300-line multi-tab control clients still had 2019-style inline
form cards. All converted to the standard `CreateDrawer` slide-over
(button in a right-aligned tab header, list panel full width):

| Client | Drawers added | Also |
|---|---|---|
| hse-control (~1100→671 lines) | Incident, PTW, CAPA, Training record | `transform: 'csv'` (certifications) and `transform: 'isoDate'` (PTW validity) added to FieldSpec |
| hr-control (909→~700) | Employee, Leave request, Payroll run | net-salary preview dropped (API computes it) |
| assets-control (921→~700) | Asset, Maintenance, Inspection | side-by-side form/table grid → full-width table; `useTransition` removed |
| fleet-control (992→~800) | Vehicle, Fuel log, Maintenance | GPS-webhook simulator + Mulkiya expiry scanner kept as inline tools, now `router.refresh()` |
| site-control (1178→~900) | Daily report, Delay log, Material consumption, Labour allocation | progress-mapping tab untouched |
| quality-control (1269→~1000) | NCR, IR, Snag, ISO audit | interactive audit checklist kept; findings input now uncontrolled (save on blur), audit state from server via `router.refresh()` |

Consistent mechanics across all six: lists render from server props (no
`useState(initialProps)` staleness), every mutation ends in
`router.refresh()`, project/employee/vehicle/asset selects feed
`labelField`/options from props, unused inline-form styles deleted.

**Behavior note:** the drawer omits empty optional fields instead of posting
explicit `null` (as some old forms did). API DTOs already accept missing
keys (several old forms sent `|| undefined`), so this is compatible.

## Verification

- `tsc --noEmit` clean after each client conversion; final run clean.
- `turbo build --filter=@aura/web` passes (27.7s).
- Part 1 verified live earlier in the session; Part 2 verified at
  build/type level — drawer component + endpoints are the same ones already
  proven live on the 14 create flows (field names checked 1:1 against the
  old fetch bodies).

## Not done / next

- Live click-through of the six converted verticals (drawer opens, POST,
  refresh) — recommended before merge.
- Server list pages (accounts/tenders/contracts/projects) still use their
  own inline table styles rather than `.data-table`.
- ~35 smaller single-form clients (fx, salik, timesheets, ITP, budgets…)
  still use inline quick-forms; same pattern applies mechanically.
