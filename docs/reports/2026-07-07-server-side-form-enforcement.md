# Server-side metadata form enforcement (gap #8, form half)

**Date:** 2026-07-07 · **Branch:** `claude/dazzling-hermann-eb2ace` (commit `66d5e32`)
· Gap register Vol 23 **#8** / Vol 9 §7. Verified against the live tree.

Completes the second half of the validation-layer gap. The error-taxonomy half (PRs
#26–#31 + wrapper retirement) made domain errors map to correct 4xx; this half stops
metadata form rules being bypassable by calling the API directly.

## The problem

The form platform's `evaluateForm` (`shared/src/forms/evaluate.ts`) is a pure function
the **renderer** runs on every keystroke — required-fields, declarative validation
(min/max/pattern/length), custom validators (email/phone/url — already headless in the
shared registry), formulas, and blocking rule `error` actions. But the **server** never
ran it: `POST /hr/employees` with `email: "not-an-email"`, or a labor-camp set without
visa tracking, was accepted. The rules were advisory, not enforced.

## The fix

- **`shared/src/forms/enforce.ts`** — `assertFormValid(schema, input, opts?)` runs the
  exact same `evaluateForm`, collects blocking `errors` + `fieldErrors`, and throws
  `Error("Form validation failed — …")`. That phrasing is classified to **400 VALIDATION**
  by the global taxonomy (`classifyDomainMessage`), so no per-endpoint plumbing is needed.
  `checkFormValid` returns the issues without throwing. `input` is typed `object` so
  class-instance DTOs pass straight through.
- **Schema location = the mapping.** Every `FormSchema` already carries its own `id` and
  `endpoint`, so there is no separate mapping table to invent. Pure-data schemas move to
  `shared/src/forms/schemas/` (single source of truth for renderer + API); the employee
  schema moved first, with `apps/web/lib/form-schemas/employee.ts` reduced to a re-export
  so `registerFormSchema('hr.employee', …)` and every web import are unchanged.
- **First consumer:** `POST /hr/employees` → `assertFormValid(employeeFormSchema, dto)`
  after the existing required-field guards. Email/phone format and the
  `camp-needs-visa-tracking` rule are now enforced server-side.

## Verification

- 5 new shared tests: valid pass (+ numeric coercion), missing-required throws,
  bad-email throws, the declarative camp→visa rule throws then passes with visa set,
  `checkFormValid` reports without throwing.
- Shared **134 tests** (+5) · API **29 unit + 6 e2e** · taxonomy-fitness **2/2** (the new
  throw is a 400, not a 500-escape) · full `turbo run build` **22/22** · eslint 0 errors.

## Rollout (mechanical follow-up)

Per remaining create/update endpoint: relocate its pure-data schema to
`shared/src/forms/schemas/` (quotation is pure data and ready; subcontract needs its
web `percent` plugin field handled) and add one `assertFormValid(schema, dto)` call.
The engineering-documents schemas drive a jsonb payload and can validate the `fields`
sub-object the same way.
