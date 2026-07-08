// Server-side form enforcement — the API's half of the metadata form platform.
// The renderer runs `evaluateForm` live for UX; the API runs the SAME function on
// submit so required-fields, declarative validation (min/max/pattern/length),
// custom validators (email/phone/…) and blocking rule `error` actions cannot be
// bypassed by calling the endpoint directly (gap register Vol 23 #8, form half).
//
// The thrown message is phrased "Form validation failed" so the API's global
// error taxonomy (classifyDomainMessage) maps it to 400 VALIDATION automatically.

import type { FormSchema } from './schema';
import { evaluateForm, type EvaluateFormOptions } from './evaluate';

export interface FormValidationIssues {
  /** blocking rule `error` messages */
  errors: string[];
  /** per-field validation failures */
  fieldErrors: Record<string, string>;
}

/**
 * Run a schema's rules against a submitted record and return the blocking issues
 * (empty when the submission is valid). `input` may hold any value types — only
 * the schema's own fields are read and coerced to strings for evaluation.
 */
export function checkFormValid(
  schema: Pick<FormSchema, 'fields' | 'rules'>,
  input: object,
  opts: EvaluateFormOptions = {},
): FormValidationIssues {
  // `object` (not Record) so callers can pass class-instance DTOs directly.
  const rec = input as Record<string, unknown>;
  const values: Record<string, string> = {};
  for (const f of schema.fields) {
    const v = rec[f.name];
    values[f.name] = v === undefined || v === null ? '' : String(v);
  }
  const result = evaluateForm(schema, values, opts);
  return { errors: result.errors, fieldErrors: result.fieldErrors };
}

/**
 * Throw when a submission violates its schema; no-op when valid. The Error
 * message is taxonomy-classified to 400 VALIDATION by the global exception filter.
 */
export function assertFormValid(
  schema: Pick<FormSchema, 'fields' | 'rules'>,
  input: object,
  opts: EvaluateFormOptions = {},
): void {
  const { errors, fieldErrors } = checkFormValid(schema, input, opts);
  const fieldMsgs = Object.entries(fieldErrors).map(([field, msg]) => `${field}: ${msg}`);
  const all = [...errors, ...fieldMsgs];
  if (all.length > 0) {
    throw new Error(`Form validation failed — ${all.join('; ')}`);
  }
}
