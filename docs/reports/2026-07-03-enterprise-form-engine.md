# Enterprise Form Engine — Phase 1 complete + AI Auto-Fill (Phase 2 M4)

**Date:** 2026-07-03 · **Branch:** `feat/enterprise-form-engine` · **Commits:** `9c4d3d0`, `5ea9782`, `591dfbc`, `c5c498e`

## Milestones shipped

| # | Milestone | Commit | Verified |
|---|---|---|---|
| M1 | Framework-free form core in `@aura/shared` (schema, formula, conditions, registry, evaluate, payload) | 9c4d3d0 | 103 unit tests |
| M2 | Web `FormRenderer` + layout engine + `FormDrawer`; legacy `CreateDrawer` becomes a thin adapter | 5ea9782 | live: account create/edit through the new engine |
| M3 | Metadata schemas on real surfaces + app plugin module | 591dfbc | live: all three forms exercised E2E |
| M4 | AI Auto-Fill toolbar plugin (Phase 2 start) | c5c498e | live: extract → review → apply → formulas recompute |

## Phase 1 scorecard (all five pillars ✅)

1. **Metadata-driven forms** — `FormSchema`: kind, label, placeholder, required,
   hidden, readonly, defaultValue (incl. `'=TODAY()'` formula defaults),
   validation (min/max/length/pattern/custom), `permission` gating, layout,
   groups, tabs. New forms are data files (`apps/web/lib/form-schemas/*`), zero React.
2. **Layout engine** — section (collapsible), columns, tabs, accordion, card;
   recursively nested; responsive via the existing design-system CSS.
3. **Business rules** — JSON condition trees `all`/`any`/`not` + 12 operators;
   actions show/hide/enable/disable/require/clear/set/warn/error; re-evaluated
   on every keystroke (verified: labor camp ⇒ visa expiry became required live).
4. **Formula engine** — tokenizer/parser/evaluator, math/comparison/string/date/
   boolean, `SUMLINES` aggregation, dependency-ordered compilation (cycle-safe
   by construction: formulas → rules → formulas, one pass each).
5. **Plugin system** — headless registry in shared (validators, formula fns) +
   React registry (field renderers, toolbar actions). Worked examples in
   `lib/form-plugins.tsx`: `percent` field kind, `uae-trn` validator,
   `VAT_UAE()` formula, `ai-autofill` toolbar action. Loaded once app-wide
   from `app-shell`.

## Live forms on the new engine

- **hr.employee** — 3-tab layout, 2 live rules, plugin email/phone validators.
- **crm.quotation** — transient computed subtotal/VAT/grand-total via SUMLINES
  (API payload unchanged; server totals matched: 200k → 210k with VAT).
- **subcontracts.subcontract** — `percent` plugin kind, min/max with custom
  message (blocked retention 25%, passed 10%), high-value retention warning.
- All 20+ legacy `CreateDrawer` surfaces run through the adapter unchanged.

## AI Auto-Fill (Phase 2, first slice)

- `shared/src/forms/ai.ts`: prompt built from schema metadata; reply parser
  with balanced-brace JSON recovery, allowed-set select coercion, unknown-key
  audit trail. Unit-tested.
- Toolbar plugin on every form: paste/upload text → extract via the kernel
  `AiService` seam (`POST /api/ai`) → review panel → apply. Verified live:
  applied invoice text filled the quotation incl. a line item and the formula
  engine recomputed totals instantly. Without a model key the local provider
  degrades to a clear "nothing extracted" message.

## Architectural decisions

- Core is framework-free in `@aura/shared` → reusable server-side (future:
  API-side validation of the same schemas) and testable headless.
- One evaluation pass (formulas → rules → formulas) instead of a fixpoint
  loop — O(n), infinite loops impossible by construction.
- Select coercion never writes values outside the schema's allowed set (AI
  or rules cannot inject invalid enum values).
- PO/Invoice value immutability preserved: transient fields exist only in
  the UI, `buildFormPayload` drops them.

## Backward compatibility

- `CreateDrawer` props unchanged; it adapts legacy configs to `FormSchema`.
- API payloads byte-identical for converted forms (verified against stored records).

## Remaining work / suggested next milestones

1. **M5 — AI validation + duplicate detection** (Phase 2): schema-aware
   anomaly prompt + `GET` probe for near-duplicate records before save.
2. **M6 — Universal Create Engine** (Phase 3): schema registry keyed by id
   (`crm.account` …), generate Create/Edit/Clone/View from one registration;
   migrate remaining legacy configs into `form-schemas/`.
3. **M7 — Form designer** (Phase 3): admin CRUD over serialized `FormSchema`
   rows (the schemas are already plain JSON — the designer is an editor over
   them, backed by the existing `builder` module).
4. PDF/OCR upload needs a server-side document endpoint (client is text-only today).
5. Collaboration/offline/analytics (Phase 3) — need websocket + storage
   decisions; not started.

## Risks

- Formula/rule authoring errors in metadata surface as non-blocking
  `formulaErrors`; a designer UI (M7) should lint schemas before save.
- The AI reply contract depends on model discipline; the parser rejects
  malformed replies rather than guessing, so worst case = no autofill.
