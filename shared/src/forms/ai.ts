// AI auto-fill for metadata forms: build a strict JSON-extraction prompt from
// a FormSchema, and parse the model's reply back into form values. Framework-
// free and deterministic on the parsing side, so the whole round-trip minus
// the model call is unit-testable (and reusable server-side later).

import type { FormFieldSchema, FormSchema } from './schema';
import type { FormLineItem } from './payload';

export interface ExtractionPrompt {
  system: string;
  prompt: string;
}

export interface ExtractionResult {
  /** field name → value, only for fields present in the schema */
  values: Record<string, string>;
  /** lines-field name → parsed rows */
  lines: Record<string, FormLineItem[]>;
  /** keys the model returned that matched no schema field (audit trail) */
  ignored: string[];
}

/** Fields the model should attempt: visible inputs, not computed/display-only. */
function extractableFields(schema: Pick<FormSchema, 'fields'>): FormFieldSchema[] {
  return schema.fields.filter((f) => !f.transient && !f.formula && f.hidden !== true);
}

function describeField(f: FormFieldSchema): string {
  const parts = [`- "${f.name}": ${f.label}`];
  if (f.kind === 'date') parts.push('(date, format YYYY-MM-DD)');
  else if (f.kind === 'number' || f.dataType === 'number') parts.push('(number, digits only)');
  else if (f.kind === 'lines') {
    parts.push('(array of line items: {"description": string, "quantity": number, "unitPrice": number, "vatRate": number})');
  } else if (f.kind === 'select' && f.options?.length) {
    parts.push(`(one of: ${f.options.map((o) => `"${o.value}" = ${o.label}`).join(', ')})`);
  } else parts.push('(text)');
  return parts.join(' ');
}

/**
 * Prompt for extracting a schema's fields from unstructured document text
 * (invoice, PO, contract, BOQ…). The reply contract is a single JSON object.
 */
export function buildExtractionPrompt(
  schema: Pick<FormSchema, 'entity' | 'fields'>,
  documentText: string,
): ExtractionPrompt {
  const fields = extractableFields(schema);
  return {
    system: [
      'You are a strict data-extraction engine for an ERP system.',
      'Reply with EXACTLY one JSON object and nothing else — no prose, no markdown fences.',
      'Include only fields you can actually find in the document; omit anything uncertain.',
      'Never invent values.',
    ].join(' '),
    prompt: [
      `Extract the fields of a "${schema.entity}" record from the document below.`,
      '',
      'Fields (JSON keys) to look for:',
      ...fields.map(describeField),
      '',
      'Document:',
      '"""',
      documentText,
      '"""',
    ].join('\n'),
  };
}

/** Best-effort: pull the first balanced JSON object out of a model reply. */
function extractJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
    } else if (ch === '\\') {
      escape = true;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(cleaned.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function coerceLineRows(raw: unknown): FormLineItem[] {
  if (!Array.isArray(raw)) return [];
  const rows: FormLineItem[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const description = typeof r.description === 'string' ? r.description : '';
    if (!description.trim()) continue;
    rows.push({
      description,
      quantity: Number(r.quantity) || 1,
      unitPrice: Number(r.unitPrice) || 0,
      vatRate: r.vatRate === undefined ? 5 : Number(r.vatRate) || 0,
    });
  }
  return rows;
}

/**
 * Parse a model reply against the schema. Unknown keys are reported (not
 * applied); select values accept either the option value or its label
 * (case-insensitive); scalars are stringified for the form value model.
 */
export function parseExtraction(
  schema: Pick<FormSchema, 'fields'>,
  replyText: string,
): ExtractionResult | null {
  const obj = extractJsonObject(replyText);
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null;

  const byName = new Map(extractableFields(schema).map((f) => [f.name, f]));
  const values: Record<string, string> = {};
  const lines: Record<string, FormLineItem[]> = {};
  const ignored: string[] = [];

  for (const [key, raw] of Object.entries(obj as Record<string, unknown>)) {
    const field = byName.get(key);
    if (!field) {
      ignored.push(key);
      continue;
    }
    if (field.kind === 'lines') {
      const rows = coerceLineRows(raw);
      if (rows.length > 0) lines[key] = rows;
      continue;
    }
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') continue;
    let value = String(raw).trim();
    if (value === '') continue;

    if (field.kind === 'select' && field.options?.length) {
      const match =
        field.options.find((o) => o.value === value) ??
        field.options.find(
          (o) => o.value.toLowerCase() === value.toLowerCase() || o.label.toLowerCase() === value.toLowerCase(),
        );
      if (!match) continue; // never write a value outside the allowed set
      value = match.value;
    }
    values[field.name] = value;
  }

  if (Object.keys(values).length === 0 && Object.keys(lines).length === 0) return null;
  return { values, lines, ignored };
}

/* ── AI validation review ─────────────────────────────────────────────── */

export interface ReviewIssue {
  /** schema field the issue concerns, when the model could attribute one */
  field?: string;
  message: string;
  /** proposed replacement value, applicable when field is set */
  suggestion?: string;
}

/**
 * Prompt asking the model to review the current record for invalid values,
 * missing information, and unusual combinations. Advisory only — the reply
 * never blocks a save.
 */
export function buildReviewPrompt(
  schema: Pick<FormSchema, 'entity' | 'fields'>,
  values: Record<string, string>,
  lines?: Record<string, FormLineItem[]>,
): ExtractionPrompt {
  const fields = extractableFields(schema);
  const record: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === 'lines') record[f.name] = lines?.[f.name] ?? [];
    else if (values[f.name]?.trim()) record[f.name] = values[f.name];
  }
  return {
    system: [
      'You are a data-quality reviewer for an ERP system.',
      'Reply with EXACTLY one JSON array and nothing else - no prose, no markdown fences.',
      'Each element: {"field": string | null, "message": string, "suggestion": string | null}.',
      'Report only real problems: invalid values, likely typos, missing critical information, unusual combinations.',
      'An empty array [] means the record looks fine. Never invent problems.',
    ].join(' '),
    prompt: [
      `Review this draft "${schema.entity}" record.`,
      '',
      'Field definitions:',
      ...fields.map(describeField),
      '',
      'Record:',
      JSON.stringify(record, null, 2),
    ].join('\n'),
  };
}

/** Parse the review reply; null when the reply carries no valid array. */
export function parseReview(
  schema: Pick<FormSchema, 'fields'>,
  replyText: string,
): ReviewIssue[] | null {
  const cleaned = replyText.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  let arr: unknown;
  try {
    arr = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;

  const names = new Set(schema.fields.map((f) => f.name));
  const issues: ReviewIssue[] = [];
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.message !== 'string' || !r.message.trim()) continue;
    const issue: ReviewIssue = { message: r.message.trim() };
    if (typeof r.field === 'string' && names.has(r.field)) issue.field = r.field;
    if (typeof r.suggestion === 'string' && r.suggestion.trim()) issue.suggestion = r.suggestion.trim();
    issues.push(issue);
  }
  return issues;
}
