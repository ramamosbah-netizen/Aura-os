// evaluateForm — the single pure function behind live form behavior. Given a
// schema and the current values it returns derived values (formulas + rule
// set/clear applied) and per-field runtime state. The renderer calls it on
// every change; the API can call the exact same function to enforce rules
// server-side. Stateless and deterministic by design.
//
// Pass order (documented contract):
//   1. formulas (dependency order)      — computed fields land in values
//   2. rules                            — state actions + set/clear
//   3. formulas again                   — rule `set` outputs feed formulas
//   4. validation                       — required + declarative + plugin
// One re-run of formulas (not a fixpoint loop) keeps evaluation O(n) and
// makes formula→rule→formula cycles impossible by construction.

import type { FormFieldSchema, FormSchema, RuleAction } from './schema';
import { evaluateCondition } from './conditions';
import {
  compileFormulas,
  evaluateFormula,
  FormulaError,
  type CompiledFormula,
  type FormulaFn,
  type FormulaValue,
} from './formula';
import { getFormValidator, registeredFormulaFunctions } from './registry';

export interface FieldRuntimeState {
  hidden: boolean;
  disabled: boolean;
  required: boolean;
  /** computed fields and schema-readonly fields render non-editable */
  readonly: boolean;
}

export interface FormEvaluation {
  /** values after formulas and rule set/clear actions */
  values: Record<string, string>;
  state: Record<string, FieldRuntimeState>;
  /** non-blocking rule messages */
  warnings: string[];
  /** blocking rule messages — submit must be prevented while present */
  errors: string[];
  /** per-field validation failures (only for visible, filled fields) */
  fieldErrors: Record<string, string>;
  /** formula parse/eval problems, keyed by field — surfaced, never thrown */
  formulaErrors: Record<string, string>;
}

export interface EvaluateFormOptions {
  /** line-item rows per lines-field, for SUMLINES() */
  lines?: Record<string, Array<Record<string, FormulaValue>>>;
  /** extra formula functions (merged over builtins and registry) */
  functions?: Record<string, FormulaFn>;
  /** permission keys granted to the current session; fields demanding others hide */
  permissions?: string[];
  /** skip required-field errors (used before first submit attempt) */
  skipRequired?: boolean;
}

export function evaluateForm(
  schema: Pick<FormSchema, 'fields' | 'rules'>,
  inputValues: Record<string, string>,
  opts: EvaluateFormOptions = {},
): FormEvaluation {
  const values: Record<string, string> = { ...inputValues };
  const formulaErrors: Record<string, string> = {};
  const functions = { ...registeredFormulaFunctions(), ...opts.functions };

  let compiled: CompiledFormula[] = [];
  try {
    compiled = compileFormulas(schema.fields);
  } catch (e) {
    if (e instanceof FormulaError) formulaErrors['*'] = e.message;
    else throw e;
  }

  const runFormulas = () => {
    for (const cf of compiled) {
      try {
        const out = evaluateFormula(cf.ast, { values, lines: opts.lines, functions });
        values[cf.field] = out === null ? '' : String(out);
      } catch (e) {
        if (e instanceof FormulaError) formulaErrors[cf.field] = e.message;
        else throw e;
      }
    }
  };

  runFormulas();

  // ── rules ────────────────────────────────────────────────────────────────
  const state: Record<string, FieldRuntimeState> = {};
  for (const f of schema.fields) {
    state[f.name] = {
      hidden: f.hidden === true || (f.permission !== undefined && !(opts.permissions ?? []).includes(f.permission)),
      disabled: false,
      required: f.required === true,
      readonly: f.readonly === true || f.formula !== undefined,
    };
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  let valuesChangedByRules = false;

  const applyAction = (a: RuleAction) => {
    const target = a.field ? state[a.field] : undefined;
    switch (a.type) {
      case 'show':
        if (target) target.hidden = false;
        break;
      case 'hide':
        if (target) target.hidden = true;
        break;
      case 'enable':
        if (target) target.disabled = false;
        break;
      case 'disable':
        if (target) target.disabled = true;
        break;
      case 'require':
        if (target) target.required = true;
        break;
      case 'unrequire':
        if (target) target.required = false;
        break;
      case 'clear':
        if (a.field && values[a.field] !== '') {
          values[a.field] = '';
          valuesChangedByRules = true;
        }
        break;
      case 'set':
        if (a.field !== undefined && values[a.field] !== String(a.value ?? '')) {
          values[a.field] = String(a.value ?? '');
          valuesChangedByRules = true;
        }
        break;
      case 'warn':
        if (a.message) warnings.push(a.message);
        break;
      case 'error':
        if (a.message) errors.push(a.message);
        break;
    }
  };

  const INVERSE: Partial<Record<RuleAction['type'], RuleAction['type']>> = {
    show: 'hide',
    hide: 'show',
    enable: 'disable',
    disable: 'enable',
    require: 'unrequire',
    unrequire: 'require',
  };

  for (const rule of schema.rules ?? []) {
    const hit = evaluateCondition(rule.when, values);
    if (hit) {
      rule.actions.forEach(applyAction);
    } else if (rule.otherwise) {
      rule.otherwise.forEach(applyAction);
    } else {
      // declarative default: state actions invert so the rule fully describes
      // both sides; value/message actions only fire on the true branch
      for (const a of rule.actions) {
        const inv = INVERSE[a.type];
        if (inv) applyAction({ ...a, type: inv });
      }
    }
  }

  if (valuesChangedByRules) runFormulas();

  // ── validation ───────────────────────────────────────────────────────────
  const fieldErrors: Record<string, string> = {};
  for (const f of schema.fields) {
    const st = state[f.name];
    if (st.hidden) continue;

    if (f.kind === 'lines') {
      const rows = opts.lines?.[f.name] ?? [];
      const filled = rows.some((r) => String(r.description ?? '').trim() !== '');
      if (st.required && !filled && !opts.skipRequired) fieldErrors[f.name] = 'Add at least one line item.';
      continue;
    }

    const raw = (values[f.name] ?? '').trim();

    if (st.required && raw === '' && !opts.skipRequired) {
      fieldErrors[f.name] = `${f.label} is required`;
      continue;
    }
    if (raw === '') continue;

    for (const rule of f.validation ?? []) {
      const msg = runValidation(rule, raw, f, values);
      if (msg) {
        fieldErrors[f.name] = msg;
        break;
      }
    }
  }

  return { values, state, warnings, errors, fieldErrors, formulaErrors };
}

function runValidation(
  rule: NonNullable<FormFieldSchema['validation']>[number],
  raw: string,
  field: FormFieldSchema,
  values: Record<string, string>,
): string | null {
  switch (rule.type) {
    case 'min': {
      const n = Number(raw);
      if (Number.isFinite(n) && n < Number(rule.value)) return rule.message ?? `${field.label} must be ≥ ${rule.value}`;
      return null;
    }
    case 'max': {
      const n = Number(raw);
      if (Number.isFinite(n) && n > Number(rule.value)) return rule.message ?? `${field.label} must be ≤ ${rule.value}`;
      return null;
    }
    case 'minLength':
      return raw.length < Number(rule.value)
        ? (rule.message ?? `${field.label} must be at least ${rule.value} characters`)
        : null;
    case 'maxLength':
      return raw.length > Number(rule.value)
        ? (rule.message ?? `${field.label} must be at most ${rule.value} characters`)
        : null;
    case 'pattern':
      try {
        return new RegExp(String(rule.value)).test(raw) ? null : (rule.message ?? `${field.label} has an invalid format`);
      } catch {
        return null; // broken pattern in metadata must not block users
      }
    case 'custom': {
      const fn = rule.validator ? getFormValidator(rule.validator) : undefined;
      if (!fn) return null;
      const msg = fn(raw, field, values);
      return msg ? (rule.message ?? msg) : null;
    }
    default:
      return null;
  }
}
