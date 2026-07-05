# Volume 5 — Enterprise Form Platform

[← Master index](README.md)

The metadata form engine shipped 2026-07-03 (branch `feat/enterprise-form-engine`, PR #22;
milestone report `docs/reports/2026-07-03-enterprise-form-engine.md`). It replaced hardcoded
form definitions across the product with JSON metadata, without changing a single one of the 20
existing call sites (frozen adapter). This volume is the definitive documentation.

---

## 1. Architecture

Two layers with a hard boundary:

```
shared/src/forms/            ← framework-free core (runs headless: server, tests, any client)
  schema.ts        FormSchema / FormFieldSchema / LayoutNode / Condition / FormRule (pure JSON)
  conditions.ts    condition evaluator (all/any/not + 11 operators)
  formula.ts       expression engine (parser + evaluator + dependency compiler)
  evaluate.ts      evaluateForm(): formulas → rules → formulas → validation
  payload.ts       buildFormPayload(): metadata → API body (transforms, labelField, extras)
  registry.ts      headless plugin registry: validators, formula functions, form schemas

apps/web/components/form-engine/    ← React renderer
  field-registry.tsx   field-type renderers + toolbar actions (plugin registry, React side)
  FormRenderer.tsx     useFormEngine hook + metadata layout walker
  FormDrawer.tsx       slide-over shell: submit, warnings/errors, toolbar, toast
  EntityForm.tsx       Universal Create Engine surface (create/edit/clone/view by schema id)
  ai-autofill.tsx      AI auto-fill toolbar plugin
  ai-review.tsx        AI validation/review toolbar plugin
```

**Load-bearing constraint:** a `FormSchema` is pure, JSON-serializable data — no functions.
Behavior is referenced *by id* and resolved through registries. That single rule is what makes
schemas storable in a database (future no-code designer), evaluable server-side (the same
`evaluateForm` can enforce rules on the API), and portable to future shells (mobile).

Design tradeoffs (recorded at build time):

| Decision | Choice | Why |
|---|---|---|
| Engine home | `@aura/shared`, not the web app | server-side reuse + headless tests |
| Formula engine | hand-rolled recursive descent, no `eval` | untrusted metadata must never execute code |
| Rule re-evaluation | pure function on every change | stateless, deterministic, O(rules+formulas) |
| Back-compat | `CreateDrawer` props API frozen as adapter | zero migration cost for 20 call sites |
| Formula/rule interplay | formulas → rules → formulas (one re-run, no fixpoint loop) | infinite loops impossible by construction |

## 2. Renderer

`FormRenderer` draws a schema: layout nodes recurse, leaves resolve through the field-type
registry, and every keystroke re-runs `evaluateForm` so the form reacts live (no reload).

- **Layout engine:** `section` (with `collapsible`/`collapsed`), `columns` (n-column),
  `tabs`, `accordion` (panels), `card`, and implicit rows via the 2-column grid (`span: 1|2`).
  Responsive: single column under 640 px (`fe-grid` CSS). Fields present in `fields` but
  missing from `layout` are appended automatically — metadata mistakes can never silently drop
  a field.
- **State model:** user input lives in the hook; computed values come from evaluation; a field
  with a `formula` renders read-only and displays the evaluated value.
- **`useFormEngine(schema, {initialValues, permissions})`** returns values, lines, evaluation,
  setters, `reset()`, and `evaluateForSubmit()` (required checks enforced).
- **FormDrawer** owns the shell: trigger button (primary for create, ghost for edit), overlay +
  ESC close, rule warnings (amber) and blocking errors (red) rendered above the fields, plugin
  toolbar in the header, submit → POST/PATCH → toast → `router.refresh()`.

## 3. Metadata

The full `FormFieldSchema` vocabulary (every property verified in `shared/src/forms/schema.ts`):

| Property | Meaning |
|---|---|
| `name`, `label`, `kind` | payload key, display label, field type (open string — plugins) |
| `required`, `placeholder`, `hint` | basics |
| `options[]` | select options; each may carry `fills` (prefill sibling fields) and `extra` (hidden payload keys) — the deal-chain inheritance mechanism |
| `labelField` | select: also post the chosen option's label under this key |
| `span` | grid width 1/2 |
| `defaultValue` | literal, or `'=EXPR'` evaluated at open (e.g. `'=TODAY()'`) |
| `transform` | `csv` (string→array) / `isoDate` (date→ISO timestamp) |
| `transient` | display-only — excluded from payload (computed totals) |
| `dataType` | `'number' | 'string'` payload typing for custom kinds |
| `readonly`, `hidden` | static state (rules can change dynamically) |
| `permission` | permission key — hidden unless session grants it |
| `validation[]` | `min`/`max`/`minLength`/`maxLength`/`pattern`/`custom` (registry id) |
| `formula` | expression computing this field from others |

`FormSchema` adds: `id` (registry key, e.g. `hr.employee`), `entity`, `endpoint`, `subtitle`,
`version`, `fields[]`, `layout[]`, `rules[]`.

**Registered production schemas today:** `hr.employee` (tabs + rules + validators),
`crm.quotation` (computed VAT totals), `subcontracts.subcontract` (plugin `percent` field +
retention rule, factory-registered for live project options). New forms = one schema file,
zero React.

## 4. Formula & Expression Engine

Grammar (recursive descent, precedence climbing — `shared/src/forms/formula.ts`):
`|| OR` → `&& AND` → `! NOT` → comparisons (`== = != >= <= > <`) → `+ -` → `* / %` → unary
minus → literals / field refs / function calls / parentheses. Guards: 512-token cap, 32-depth
cap, no member access, unknown functions throw — code injection is structurally impossible
(tested: `constructor.constructor(...)` fails to parse/evaluate).

**Built-in functions (24):** `IF COALESCE ROUND FLOOR CEIL ABS MIN MAX SUM` ·
`CONCAT UPPER LOWER TRIM LEN LEFT RIGHT NUMBER TEXT` ·
`TODAY NOW YEAR MONTH DAY DAYS_BETWEEN ADD_DAYS` · plus **`SUMLINES(linesField, "perLineExpr")`**
which aggregates over line items (`SUMLINES(lines, "quantity * unitPrice * (1 + vatRate/100)")`).

**Dependency tracking:** `compileFormulas()` extracts field references per formula, topologically
orders them, and **throws on cycles** (`a → b → a`) at compile time — the infinite-loop guard.
Rule `set` actions may feed formulas: evaluation runs formulas once more after rules, not in a
loop, so convergence is by construction.

**Worked library examples** (Volume 13 holds the full catalog): Subtotal = `quantity * rate` ·
Margin = `revenue - cost` · Profit % = `IF(revenue > 0, ROUND((revenue-cost)/revenue*100, 1), 0)` ·
Retention = `certified * retentionPct / 100` · VAT = `ROUND(subtotal * 0.05, 2)` or plugin
`VAT_UAE(subtotal)` · Discounted = `gross * (1 - discountPct/100)` · DLP days left =
`DAYS_BETWEEN(TODAY(), dlpEnd)`.

## 5. Business Rules Engine

Conditions are JSON trees: `{all:[…]}` / `{any:[…]}` / `{not:…}` / leaf
`{field, op, value}` with 11 operators (`eq neq gt gte lt lte contains startsWith empty
notEmpty in`). Actions: **show · hide · enable · disable · require · unrequire · clear ·
set · warn · error** — exactly the requested action set; `warn` renders an amber banner,
`error` renders red and **blocks submit**.

Declarative inverse: when a rule's condition is false and no `otherwise` branch is given,
state actions auto-invert (a `show` rule hides when false) — one rule fully describes both
sides. Value/message actions never auto-invert. Rules evaluate live on every change, no reload.

Production example (`hr.employee`): labor camp filled + visa expiry empty ⇒ `require visaExpiry`;
visa without permit expiry ⇒ warning. Library: Volume 12.

## 6. Plugin System

Two registries, one contract — extend by id, never modify the engine:

| Extension | Register with | Layer |
|---|---|---|
| Custom field types | `registerFieldRenderer(kind, component)` | web |
| Custom toolbar buttons | `registerFormToolbarAction({id, appliesTo?, render(api)})` | web |
| Custom validators | `registerFormValidator(id, fn)` | headless |
| Custom formula functions | `registerFormulaFunction(name, fn)` | headless |
| Form schemas (+factories) | `registerFormSchema(id, schemaOrFactory)` | headless |
| Custom business rules | data — ship `rules[]` in any schema | metadata |
| Custom tabs/widgets | data — `layout` tabs; widget kinds via field renderers | metadata/web |

Worked example in production (`apps/web/lib/form-plugins.tsx`): `percent` field kind (adorned
input, numeric payload), `uae-trn` validator (15-digit TRN), `VAT_UAE` formula function, and
both AI toolbar actions — registered from app land, engine untouched. Built-in validators ship
under the same mechanism (`email`, `phone`, `url`), proving core and plugins share one path.

## 7. AI Validation (AI Review)

`ai-review.tsx` — toolbar plugin on every metadata form. Sends the schema (field metadata) +
current draft values to the AI endpoint (`/api/ai` BFF → `POST /api/v1/ai/complete` → kernel
`AiProvider`); the prompt asks for **data-quality findings as structured JSON**: invalid
values, missing information, unusual combinations, suspected duplicates — each with a
suggested fix. Findings render as advisory chips with one-click "apply suggestion"
(`api.setValues`); the review **never blocks the save** (deterministic rules own blocking).
With no API key the local provider returns deterministic heuristics — the feature degrades,
never breaks. Risk-score surfacing on records is the designed next increment [Planned].

## 8. AI Auto Fill

`ai-autofill.tsx` — toolbar plugin: paste or upload document text (invoice, PO, contract, BOQ
excerpt), the plugin sends document + target schema (names/labels/kinds/options) to the AI
seam, receives `{field: value}` JSON, and shows a **review diff** (proposed vs current per
field) — the user applies selected values; nothing writes without confirmation. Scanned-PDF
OCR is [Gap]: the pipeline accepts text today; a vision/OCR provider slot behind the same
`AiProvider` seam is the designed extension (Volume 6 §5).

## 9. Universal Create Engine

`EntityForm.tsx` + `registerFormSchema/resolveFormSchema` (shared registry): every module
registers its schema once (keyed by id); any surface renders
`<EntityForm id="crm.quotation" mode="create|edit|clone|view" …/>`:

- **create** → POST endpoint
- **edit** → PATCH `endpoint/:id`, prefilled
- **clone** → prefilled from source record, POST as new
- **view** → read-only rendering of the same metadata (no divergent detail markup)

Factories receive the surface's context (e.g. live project options) so option-driven schemas
stay registered, not imported. Legacy call sites continue on the frozen `CreateDrawer` adapter;
new surfaces use the registry.

## 10. Future Designer (No-Code) [Planned — designed]

The admin form designer closes Phase 3. Design (agreed constraints already in place):

1. **Storage:** schemas are already pure JSON — persist to a `form_schemas` table via the
   kernel builder (`form-registry.service` exists); code-registered schemas act as defaults,
   DB rows as tenant overrides (resolution order: tenant → code).
2. **Designer UI (admin):** field palette (kinds from the renderer registry), drag layout
   builder (sections/columns/tabs/accordion), rule builder (condition tree UI over the 11
   operators), formula editor with live dependency check (`compileFormulas` already reports
   cycles), validation + permission pickers, version bump + publish.
3. **Safety:** `evaluateForm` on the server rejects schemas that fail compile; published
   versions are immutable (audit trail); preview mode renders against demo data.
4. **Sequencing:** after the Administration Center shell (Volume 15) exists to host it.

Also open in Phase 3 (tracked in Volume 23): form analytics events, offline drafts,
live-collaboration presence.

---

## Verification record

- 132 test files green including 22+ form-engine cases (formula precedence, cycles, injection
  attempts, rules auto-inverse, SUMLINES, payload transforms, validators, permissions).
- Live-verified flows: account create (required-block → success → toast → refresh), account
  edit (prefill → PATCH), employee tabs + live rules, quotation computed totals, subcontract
  percent field + retention warning, AI auto-fill review-then-apply.
- CI: typecheck + unit + build + Playwright smoke, with workspace-dep build ordering fixed
  (`ci.yml`).

---

*Next: [Volume 6 — AI Platform](vol-06-ai-platform.md)*
