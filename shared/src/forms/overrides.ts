// Form overrides — the Form Designer's phase-1 data model (Vol 15 §2.4).
// Admins tune registered form schemas per tenant without touching code: field
// labels, hints, placeholders, required flags, and visibility. Overrides are a
// sparse patch stored per (tenant, schema id); `applyFormOverrides` merges them
// over the code schema, and BOTH the web renderer and the API's assertFormValid
// run on the merged result — what admins configure is what gets enforced.

import type { FormSchema } from './schema';

export interface FieldOverride {
  label?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** true = field is removed from the rendered/enforced form */
  hidden?: boolean;
}

export interface FormOverrides {
  fields: Record<string, FieldOverride>;
}

/** Is there anything in this override set? (Empty patches need not be stored.) */
export function hasOverrides(o: FormOverrides | null | undefined): boolean {
  return !!o && Object.keys(o.fields ?? {}).length > 0;
}

/**
 * Merge a sparse override patch over a code schema. Pure — returns a new schema;
 * the registered original is never mutated. A hidden field is also force-unrequired
 * (evaluateForm validates required regardless of hidden, so hiding must defuse it).
 */
export function applyFormOverrides(schema: FormSchema, overrides: FormOverrides | null | undefined): FormSchema {
  if (!hasOverrides(overrides)) return schema;
  const patch = overrides!.fields;
  return {
    ...schema,
    fields: schema.fields.map((f) => {
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
    }),
  };
}
