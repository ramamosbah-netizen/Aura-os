// Form overrides — the Form Designer's phase-1 data model (Vol 15 §2.4).
// Admins tune registered form schemas per tenant without touching code: field
// labels, hints, placeholders, required flags, and visibility. Overrides are a
// sparse patch stored per (tenant, schema id); `applyFormOverrides` merges them
// over the code schema, and BOTH the web renderer and the API's assertFormValid
// run on the merged result — what admins configure is what gets enforced.
// P3 grows the patch to the full metadata surface: per-field formulas and
// validation rules, form-level business rules, and section layout — all merged
// by the same function, so the existing renderer and enforcement paths pick
// them up with zero new code.

import type { Condition, FieldValidation, FormFieldSchema, FormRule, FormSchema, LayoutNode } from './schema';
import { layoutFieldNames } from './schema';
import { parseFormula, type FormulaNode } from './formula';

export interface FieldOverride {
  label?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** true = field is removed from the rendered/enforced form */
  hidden?: boolean;
  /**
   * Formula expression replacing the code one (P3) — the field renders
   * read-only and computes live. Empty string CLEARS a code formula, making
   * the field editable again.
   */
  formula?: string;
  /** replaces the code field's declarative validation entirely when present (P3) */
  validation?: FieldValidation[];
}

/**
 * A designer-added custom field (Form Designer P2). Names carry the `cf_` prefix so
 * they can never collide with a code field added later; the kind set is the safe
 * subset every renderer supports. Values are captured per record in
 * `aura_form_custom_values` by the enforced endpoints.
 */
export interface AddedField {
  /** payload key, `cf_`-prefixed: ^cf_[a-z0-9_]{1,40}$ */
  name: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'date' | 'textarea';
  required?: boolean;
  hint?: string;
  placeholder?: string;
  /** for kind 'select' — plain values (value doubles as label) */
  options?: string[];
  span?: 1 | 2;
  /** computed custom field (P3) — renders read-only, evaluates live + server-side */
  formula?: string;
  /** declarative validation for the custom field (P3) */
  validation?: FieldValidation[];
}

export interface FormOverrides {
  fields: Record<string, FieldOverride>;
  /** designer-added custom fields, appended to the schema (P2) */
  added?: AddedField[];
  /** full or partial field order by name; unlisted fields keep their relative order after the listed ones (P2) */
  order?: string[];
  /** designer-authored business rules, appended AFTER the code rules (P3) */
  rules?: FormRule[];
  /** designer section layout — REPLACES the code layout when non-empty (P3) */
  layout?: LayoutNode[];
}

export const ADDED_FIELD_NAME = /^cf_[a-z0-9_]{1,40}$/;

/**
 * Extract the designer-added (`cf_*`) field values from a raw request body, limited
 * to fields the merged schema actually declares — the enforced endpoints persist
 * these per record (P2; the entity tables have no columns for them).
 */
export function pickCustomFieldValues(
  schema: FormSchema,
  body: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!body) return out;
  for (const f of schema.fields) {
    if (ADDED_FIELD_NAME.test(f.name) && body[f.name] !== undefined && body[f.name] !== '') {
      out[f.name] = body[f.name];
    }
  }
  return out;
}

/** Is there anything in this override set? (Empty patches need not be stored.) */
export function hasOverrides(o: FormOverrides | null | undefined): boolean {
  return (
    !!o &&
    (Object.keys(o.fields ?? {}).length > 0 ||
      (o.added?.length ?? 0) > 0 ||
      (o.order?.length ?? 0) > 0 ||
      (o.rules?.length ?? 0) > 0 ||
      (o.layout?.length ?? 0) > 0)
  );
}

/** Convert an AddedField into a real schema field (select options expand to value=label). */
function toFieldSchema(a: AddedField): FormFieldSchema {
  return {
    name: a.name,
    label: a.label,
    kind: a.kind,
    ...(a.required !== undefined ? { required: a.required } : {}),
    ...(a.hint ? { hint: a.hint } : {}),
    ...(a.placeholder ? { placeholder: a.placeholder } : {}),
    ...(a.kind === 'select' && a.options ? { options: a.options.map((v) => ({ value: v, label: v })) } : {}),
    ...(a.span ? { span: a.span } : {}),
    ...(a.formula?.trim() ? { formula: a.formula.trim() } : {}),
    ...(a.validation?.length ? { validation: a.validation } : {}),
  };
}

/**
 * Merge a sparse override patch over a code schema. Pure — returns a new schema;
 * the registered original is never mutated. A hidden field is also force-unrequired
 * (evaluateForm validates required regardless of hidden, so hiding must defuse it).
 */
export function applyFormOverrides(schema: FormSchema, overrides: FormOverrides | null | undefined): FormSchema {
  if (!hasOverrides(overrides)) return schema;
  const patch = overrides!.fields ?? {};

  // 1. Patch code fields (P1 semantics — hiding defuses required).
  let fields = schema.fields.map((f) => {
    const o = patch[f.name];
    if (!o) return f;
    const merged = {
      ...f,
      ...(o.label !== undefined && o.label !== '' ? { label: o.label } : {}),
      ...(o.hint !== undefined ? { hint: o.hint } : {}),
      ...(o.placeholder !== undefined ? { placeholder: o.placeholder } : {}),
      ...(o.required !== undefined ? { required: o.required } : {}),
      ...(o.hidden !== undefined ? { hidden: o.hidden } : {}),
      ...(o.validation !== undefined ? { validation: o.validation } : {}),
    };
    // P3 formula: non-empty replaces the code formula; empty string clears it.
    if (o.formula !== undefined) {
      if (o.formula.trim()) merged.formula = o.formula.trim();
      else delete merged.formula;
    }
    if (merged.hidden) merged.required = false;
    return merged;
  });

  // 2. Append designer-added custom fields (P2) — code fields always win a name clash.
  const codeNames = new Set(fields.map((f) => f.name));
  for (const a of overrides!.added ?? []) {
    if (!codeNames.has(a.name)) fields.push(toFieldSchema(a));
  }

  // 3. Reorder (P2): listed names first in the given order; unlisted keep their
  //    relative order and follow. Unknown names in the list are ignored.
  const order = overrides!.order ?? [];
  if (order.length > 0) {
    const rank = new Map(order.map((name, i) => [name, i]));
    fields = fields
      .map((f, i) => ({ f, key: rank.has(f.name) ? rank.get(f.name)! : order.length + i }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.f);
  }

  // 4. Rules (P3): designer rules run AFTER code rules (later actions win ties).
  const rules =
    (overrides!.rules?.length ?? 0) > 0 ? [...(schema.rules ?? []), ...overrides!.rules!] : schema.rules;

  // 5. Layout (P3): a designer layout replaces the code layout wholesale —
  //    the renderer appends any unplaced fields after it, so nothing vanishes.
  const layout = (overrides!.layout?.length ?? 0) > 0 ? overrides!.layout : schema.layout;

  return {
    ...schema,
    fields,
    ...(rules !== undefined ? { rules } : {}),
    ...(layout !== undefined ? { layout } : {}),
  };
}

/* ── Draft validation (P3) ───────────────────────────────────────────────── */

const CONDITION_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'empty', 'notEmpty', 'in']);
const NUMERIC_VALIDATIONS = new Set(['min', 'max', 'minLength', 'maxLength']);
const STATE_ACTIONS = new Set(['show', 'hide', 'enable', 'disable', 'require', 'unrequire', 'clear', 'set']);

/** Every field reference in a formula AST. */
function formulaRefs(node: FormulaNode, out: string[] = []): string[] {
  switch (node.t) {
    case 'ref':
      out.push(node.name);
      break;
    case 'un':
      formulaRefs(node.a, out);
      break;
    case 'bin':
      formulaRefs(node.a, out);
      formulaRefs(node.b, out);
      break;
    case 'call':
      node.args.forEach((a) => formulaRefs(a, out));
      break;
  }
  return out;
}

/**
 * Validate a designer draft against its code schema — returns human-readable
 * problems (empty = clean). The admin API refuses to store a draft with
 * problems, so a broken formula or a rule pointing at a deleted field can
 * never reach the published channel. Pure and shared: the designer UI can run
 * the same checks for instant feedback.
 */
export function validateFormOverrides(schema: FormSchema, o: FormOverrides): string[] {
  const problems: string[] = [];
  const names = new Set([...schema.fields.map((f) => f.name), ...(o.added ?? []).map((a) => a.name)]);

  const checkFormula = (expr: string, where: string): void => {
    try {
      for (const ref of new Set(formulaRefs(parseFormula(expr)))) {
        if (!names.has(ref)) problems.push(`${where}: formula references unknown field "${ref}"`);
      }
    } catch (e) {
      problems.push(`${where}: formula error — ${(e as Error).message}`);
    }
  };

  const checkValidation = (rules: FieldValidation[], where: string): void => {
    for (const v of rules) {
      if (NUMERIC_VALIDATIONS.has(v.type) && !Number.isFinite(Number(v.value))) {
        problems.push(`${where}: ${v.type} needs a numeric value`);
      }
      if (v.type === 'pattern') {
        try {
          new RegExp(String(v.value ?? ''));
        } catch {
          problems.push(`${where}: invalid pattern regex`);
        }
      }
    }
  };

  for (const [name, p] of Object.entries(o.fields ?? {})) {
    if (p.formula?.trim()) checkFormula(p.formula, `field ${name}`);
    if (p.validation) checkValidation(p.validation, `field ${name}`);
  }
  for (const a of o.added ?? []) {
    if (a.formula?.trim()) checkFormula(a.formula, `field ${a.name}`);
    if (a.validation) checkValidation(a.validation, `field ${a.name}`);
  }

  const checkCondition = (c: Condition, where: string): void => {
    if ('all' in c) c.all.forEach((x) => checkCondition(x, where));
    else if ('any' in c) c.any.forEach((x) => checkCondition(x, where));
    else if ('not' in c) checkCondition(c.not, where);
    else {
      if (!names.has(c.field)) problems.push(`${where}: condition references unknown field "${c.field}"`);
      if (!CONDITION_OPS.has(c.op)) problems.push(`${where}: unknown operator "${c.op}"`);
    }
  };

  (o.rules ?? []).forEach((r, i) => {
    const where = `rule ${i + 1}${r.description ? ` (${r.description})` : ''}`;
    if (!r.when) {
      problems.push(`${where}: missing condition`);
      return;
    }
    checkCondition(r.when, where);
    if ((r.actions?.length ?? 0) === 0) problems.push(`${where}: needs at least one action`);
    for (const a of r.actions ?? []) {
      if (STATE_ACTIONS.has(a.type)) {
        if (!a.field) problems.push(`${where}: action "${a.type}" needs a target field`);
        else if (!names.has(a.field)) problems.push(`${where}: action targets unknown field "${a.field}"`);
      } else if ((a.type === 'warn' || a.type === 'error') && !a.message?.trim()) {
        problems.push(`${where}: action "${a.type}" needs a message`);
      }
    }
  });

  if (o.layout?.length) {
    const placed = layoutFieldNames(o.layout);
    const seen = new Set<string>();
    for (const n of placed) {
      if (!names.has(n)) problems.push(`layout places unknown field "${n}"`);
      if (seen.has(n)) problems.push(`layout places field "${n}" twice`);
      seen.add(n);
    }
  }

  return problems;
}
