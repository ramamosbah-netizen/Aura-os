// Framework-free plugin registry for the form engine. Modules extend the
// platform by registering behavior against string ids that schemas reference —
// the engine core never needs to change. React-level extensions (field
// renderers, widgets, toolbar buttons) live in the web renderer's registry;
// this one holds everything that must also run headless (server validation,
// tests, future mobile shells).

import type { FormFieldSchema } from './schema';
import type { FormulaFn } from './formula';

/** Returns an error message, or null when the value passes. */
export type FormValidatorFn = (
  value: string,
  field: FormFieldSchema,
  values: Record<string, string>,
) => string | null;

const validators = new Map<string, FormValidatorFn>();
const formulaFunctions = new Map<string, FormulaFn>();

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
