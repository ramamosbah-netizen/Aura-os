// Framework-free plugin registry for the form engine. Modules extend the
// platform by registering behavior against string ids that schemas reference —
// the engine core never needs to change. React-level extensions (field
// renderers, widgets, toolbar buttons) live in the web renderer's registry;
// this one holds everything that must also run headless (server validation,
// tests, future mobile shells).

import type { FormFieldSchema, FormSchema } from './schema';
import type { FormulaFn } from './formula';

/** Returns an error message, or null when the value passes. */
export type FormValidatorFn = (
  value: string,
  field: FormFieldSchema,
  values: Record<string, string>,
) => string | null;

/**
 * A registered form: either a static schema, or a factory for schemas whose
 * options come from live data (e.g. a project dropdown). The factory context
 * is whatever the rendering surface has at hand — plain data only.
 */
export type FormSchemaSource = FormSchema | ((ctx?: Record<string, unknown>) => FormSchema);

const validators = new Map<string, FormValidatorFn>();
const formulaFunctions = new Map<string, FormulaFn>();
const formSchemas = new Map<string, FormSchemaSource>();

/**
 * Universal Create Engine registration: a module registers its schema once
 * (keyed by schema id, e.g. 'crm.quotation') and every surface — create,
 * edit, clone, view — resolves it from here instead of importing form files.
 */
export function registerFormSchema(id: string, source: FormSchemaSource): void {
  formSchemas.set(id, source);
}

/** Resolve a registered schema; factories receive the caller's context. */
export function resolveFormSchema(id: string, ctx?: Record<string, unknown>): FormSchema | undefined {
  const source = formSchemas.get(id);
  if (!source) return undefined;
  return typeof source === 'function' ? source(ctx) : source;
}

export function registeredFormSchemaIds(): string[] {
  return [...formSchemas.keys()];
}

export function registerFormValidator(id: string, fn: FormValidatorFn): void {
  validators.set(id, fn);
}

export function getFormValidator(id: string): FormValidatorFn | undefined {
  return validators.get(id);
}

/** Custom formula function, callable from any field formula as NAME(...). */
export function registerFormulaFunction(name: string, fn: FormulaFn): void {
  formulaFunctions.set(name.toUpperCase(), fn);
}

export function registeredFormulaFunctions(): Record<string, FormulaFn> {
  return Object.fromEntries(formulaFunctions);
}

/* Built-in validators, registered under stable ids so schemas can reference
   them like any plugin validator. */

registerFormValidator('email', (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'Enter a valid email address',
);

registerFormValidator('phone', (value) =>
  /^\+?[0-9\s\-()]{7,20}$/.test(value) ? null : 'Enter a valid phone number',
);

registerFormValidator('url', (value) => {
  try {
    new URL(value.startsWith('http') ? value : `https://${value}`);
    return null;
  } catch {
    return 'Enter a valid URL';
  }
});
