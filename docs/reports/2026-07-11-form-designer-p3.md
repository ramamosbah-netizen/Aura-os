# Form Designer P3 — Rules, Formulas, Validation, Layout

**Date:** 2026-07-11 · **Branch:** `feat/form-designer-p3`
**Closes:** the remainder of gap register #16 (Vol 15 §2.4 / Vol 5 §10). The metadata surface
the runtime already speaks — business rules, calculated fields, declarative validation,
section layout — is now **designer-authorable per tenant**, riding the same overrides patch,
merge function, draft→publish cycle, and enforcement paths as P1/P2. Zero renderer or
enforcement code changed.

---

## 1. What shipped

### The patch model grew to the full metadata surface (`shared/src/forms/overrides.ts`)
- `FieldOverride` += `formula` (non-empty replaces the code formula → field computes live and
  renders read-only; **empty string clears a code formula**, making the field editable) and
  `validation` (replaces the code field's declarative rules wholesale — min/max/minLength/
  maxLength/pattern; `custom` plugin validators stay code-side).
- `AddedField` += the same two — a custom `cf_*` field can be computed and validated.
- `FormOverrides` += `rules: FormRule[]` (appended **after** code rules — later actions win
  ties) and `layout: LayoutNode[]` (designer sections **replace** the code layout; the
  renderer appends unplaced fields after, so nothing can vanish).
- `applyFormOverrides` merges all of it. Since the hr/crm/subcontracts controllers already
  run `assertFormValid` on the merged schema and FormRenderer already renders `schema.layout`
  and evaluates `schema.rules`/formulas, designed logic **enforces and renders with no new
  code paths** — the same property P2 established for custom fields.

### Draft validation — broken designs can't be stored (`validateFormOverrides`)
New pure shared function returns human-readable problems: formula parse errors and unknown
field refs (AST walk), non-numeric min/max, uncompilable regex patterns, rule conditions/
actions referencing unknown fields, unknown operators, message-less warn/error actions,
layout placing unknown or duplicate fields. The admin API refuses a draft with problems
(400, taxonomy-mapped) — **and the designer UI runs the exact same function client-side**
before saving, so admins get instant feedback with no roundtrip.

### Designer UI (`/admin/forms`) — three-tab editor
- **Fields** (existing matrix) + new **ƒx column**: expands a per-field logic editor —
  formula input (code formula shown as baseline pill) + validation rule rows (type/value/
  message), with a "replaces N code rules" warning pill.
- **Rules**: card per rule — description, WHEN condition rows (field picker · operator ·
  value; select fields offer their options as a value dropdown; ALL/ANY join) and THEN
  action rows (show/hide/enable/disable/require/unrequire/clear/set/warn/error with the
  right inputs per type). Code-rule count shown ("always run first").
- **Layout**: section cards — title, ▲▼ reorder, field chips with ◀▶/× and an add-field
  dropdown of unplaced fields; unplaced fields listed with the "render after sections" note.

### API (`admin/forms` controller)
Save sanitizes the new surface (structural checks + `cleanValidation`) then gates on
`validateFormOverrides`. Detail response now exposes each code field's `formula`, select
`options` (for the rule-builder value dropdown), `validationCount`, plus schema
`ruleCount`/`hasLayout`. No new endpoints — SDK regenerated (663 ops, shape update only).

## 2. Verification

- **Live smoke 14/14** (built API, dev DB, cleaned up after): broken-formula draft → 400 ·
  unknown-field rule draft → 400 · P3 draft saved (rule + validation + 2-section layout +
  computed `cf_initials`) · draft isolation (live untouched, create unaffected) · publish
  v1→v2 · live overrides carry rules/layout/formula · **designed rule enforced** (Operations
  without visa expiry → 400 naming `visaExpiry`) · **designed validation enforced** ("Camp
  code too short" → 400) · compliant create → 201 · `cf_initials` value persisted + read
  back · reset → same payload creates clean.
- **Browser walkthrough** (dev stack from the worktree): Fields/Rules/Layout tabs render;
  rule builder produces WHEN/THEN rows; incomplete action blocked **client-side** with
  `rule 1: action "require" needs a target field`; completed rule saved as draft
  ("draft pending publish"); ƒx editor expands with formula + validation controls.
- Suite: shared **175** tests (+10: formula merge/clear, validation replace+enforce, rules
  append+enforce, layout replace, 5 validator cases) · core **135** · workspace build 23/23
  incl. web prod build · SDK regen clean.
- One smoke iteration flagged a false failure worth recording: the employee **code** rule
  `camp-needs-visa-tracking` (laborCamp ⇒ require visaExpiry) fired on the post-reset
  payload — i.e. code rules keep enforcing exactly as before under an empty patch.

## 3. Honest remainder

Register #16 is **closed** as scoped: schema-level designers (list views, dashboards, menus)
are Vol 14 territory = register **#23**; `custom` plugin validators and code-side layout
primitives beyond sections (tabs/columns/accordion) remain code-authored by design (the
designer writes sections; the model supports the rest). Record detail pages still don't
render `cf_*` values (display adoption per module, noted since P2).
