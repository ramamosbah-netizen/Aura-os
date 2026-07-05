// Business-rule condition evaluator. Conditions are JSON trees (all/any/not/
// leaf) so the no-code designer can build them and the engine can run them on
// both client (live) and server (enforcement).

import type { Condition } from './schema';

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function evaluateCondition(cond: Condition, values: Record<string, unknown>): boolean {
  if ('all' in cond) return cond.all.every((c) => evaluateCondition(c, values));
  if ('any' in cond) return cond.any.some((c) => evaluateCondition(c, values));
  if ('not' in cond) return !evaluateCondition(cond.not, values);

  const actual = values[cond.field];
  switch (cond.op) {
    case 'empty':
      return isEmpty(actual);
    case 'notEmpty':
      return !isEmpty(actual);
    case 'eq':
    case 'neq': {
      const an = asNumber(actual);
      const bn = asNumber(cond.value);
      const eq = an !== null && bn !== null ? an === bn : String(actual ?? '') === String(cond.value ?? '');
      return cond.op === 'eq' ? eq : !eq;
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const an = asNumber(actual);
      const bn = asNumber(cond.value);
      if (an === null || bn === null) return false;
      if (cond.op === 'gt') return an > bn;
      if (cond.op === 'gte') return an >= bn;
      if (cond.op === 'lt') return an < bn;
      return an <= bn;
    }
    case 'contains':
      return String(actual ?? '').toLowerCase().includes(String(cond.value ?? '').toLowerCase());
    case 'startsWith':
      return String(actual ?? '').toLowerCase().startsWith(String(cond.value ?? '').toLowerCase());
    case 'in':
      return Array.isArray(cond.value) && cond.value.some((v) => String(v) === String(actual ?? ''));
    default:
      return false;
  }
}
