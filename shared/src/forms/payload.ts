// Submit-payload builder — the one place field metadata (kind, transform,
// labelField, option extras) turns form state into an API body. Framework-free
// so the client drawer and any server-side re-validation build identical
// payloads from identical metadata.

import type { FieldRuntimeState } from './evaluate';
import type { FormFieldSchema } from './schema';

/** Line-item row shape shared by the 'lines' field kind across the platform. */
export interface FormLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

export function buildFormPayload(
  fields: FormFieldSchema[],
  values: Record<string, string>,
  lines: Record<string, FormLineItem[]> = {},
  state?: Record<string, FieldRuntimeState>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.transient) continue;
    if (state?.[f.name]?.hidden) continue;

    if (f.kind === 'lines') {
      payload[f.name] = (lines[f.name] ?? [])
        .filter((l) => l.description.trim())
        .map((l) => ({
          description: l.description,
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          vatRate: Number(l.vatRate) || 0,
        }));
      continue;
    }

    const raw = values[f.name]?.trim() ?? '';
    if (raw === '') continue;

    const numeric = f.dataType === 'number' || (f.dataType === undefined && f.kind === 'number');
    if (f.transform === 'csv') payload[f.name] = raw.split(',').map((s) => s.trim()).filter(Boolean);
    else if (f.transform === 'isoDate') payload[f.name] = new Date(raw).toISOString();
    else if (numeric) payload[f.name] = Number(raw) || 0;
    else payload[f.name] = raw;

    if (f.kind === 'select') {
      const opt = f.options?.find((o) => o.value === raw);
      if (opt && f.labelField) payload[f.labelField] = opt.label;
      if (opt?.extra) Object.assign(payload, opt.extra);
    }
  }
  return payload;
}
