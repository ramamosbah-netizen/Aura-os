// Form overrides — the Form Designer's phase-1 data model (Vol 15 §2.4).
// Admins tune registered form schemas per tenant without touching code: field
// labels, hints, placeholders, required flags, and visibility. Overrides are a
// sparse patch stored per (tenant, schema id); `applyFormOverrides` merges them
// over the code schema, and BOTH the web renderer and the API's assertFormValid
// run on the merged result — what admins configure is what gets enforced.

import type { FormFieldSchema, FormSchema } from './schema';

export interface FieldOverride {
  label?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** true = field is removed from the rendered/enforced form */
  hidden?: boolean;
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
}

export interface FormOverrides {
  fields: Record<string, FieldOverride>;
  /** designer-added custom fields, appended to the schema (P2) */
  added?: AddedField[];
  /** full or partial field order by name; unlisted fields keep their relative order after the listed ones (P2) */
  order?: string[];
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
  return !!o && (Object.keys(o.fields ?? {}).length > 0 || (o.added?.length ?? 0) > 0 || (o.order?.length ?? 0) > 0);
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
    };
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

  return { ...schema, fields };
}
