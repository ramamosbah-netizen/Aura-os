# Form Designer P2 — Custom Fields, Reordering, Draft→Publish

**Date:** 2026-07-10 · **Branch:** `feat/form-designer-p2`
**Closes:** the core of gap register #16's remainder (Vol 15 §2.4 / Vol 5 §10): admins now
**add fields the schema never had**, reorder the form, and ship changes through a versioned
draft→publish cycle — designed = rendered = enforced = **persisted**.

---

## 1. What shipped

### Custom fields (`cf_*`)
- `FormOverrides` grew `added: AddedField[]` — name (`cf_` prefix enforced, so a future code
  field can never clash), label, kind (text/number/select/date/textarea), required, hint,
  placeholder, select options. `applyFormOverrides` appends them as real schema fields —
  so the existing renderer (FormDrawer) and `assertFormValid` handle them with **zero new
  code paths**; a code field always wins a name clash.
- **Values persist**: the global ValidationPipe strips unknown keys from decorated DTOs, so
  the three enforced endpoints (employee/quotation/subcontract) now validate the **raw
  body** against the merged published schema and capture `cf_*` values into
  `aura_form_custom_values` (migration **0140**) keyed by the created record — read back at
  `GET /forms/:id/values/:recordId`. Without this, a required added field would have
  bricked creates while the value silently vanished.

### Reordering
- `FormOverrides.order: string[]` — listed names first, unlisted keep relative order after;
  unknown names ignored. ▲▼ controls in the designer.

### Draft → publish (versioned)
- Migration **0139**: the `overrides` column stays the PUBLISHED patch (renderer +
  enforcement read it **unchanged** — no read-path edits), plus `draft`, `version`,
  `published_at`. The designer edits the draft; **Publish** promotes it atomically
  (`SET overrides = draft, draft = NULL, version = version + 1`), audited. Half-finished
  designs can never leak into the product.
- Designer UI: version badge, `draft pending publish` / `live = published` pills,
  Save draft / Publish (auto-saves first) / Reset (clears both channels).

## 2. Verification (live, dev DB) — 9/9

Draft with required `cf_badge_no` + reorder → live overrides read shows **nothing** and a
plain create still 201s (isolation) → publish **v1→v2** → live read carries field + order →
create missing the field → **400 "Badge No."** (the designed label) → create with
`cf_badge_no: B-0077` → 201 and `GET /forms/hr.employee/values/<id>` returns it → reset →
plain create 201 again. Smoke employees deleted. Migrations 0139/0140 applied (140 total,
policy gate green) · shared 165 tests (+6: added/order/clash/enforce) · core 132 (+6:
draft/publish/custom-values) · build 21/21 · SDK regenerated (**660 ops**).

## 3. Honest remainder (§2.4)

Layout editing (sections/tabs), rule & formula editing, and validation-rule authoring stay
code-side; list-view/dashboard/menu designers are Vol 14 (register #23). The custom-value
read seam exists — record detail pages don't render `cf_*` values yet (display adoption is
per-module UI work).
