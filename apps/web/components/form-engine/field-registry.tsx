'use client';

// React-side plugin registry of the form engine: field-type renderers and
// toolbar actions. Modules register against string ids; schemas reference the
// ids; the renderer resolves at draw time. The engine core never changes when
// a module adds a field type — that is the plugin contract.

import type { ReactNode } from 'react';
import type { FormFieldSchema, FormLineItem, FormSchema, FormSelectOption } from '@aura/shared';

export interface FieldRendererProps {
  field: FormFieldSchema;
  value: string;
  onChange: (value: string, option?: FormSelectOption) => void;
  disabled: boolean;
  invalid: boolean;
  /** only provided for line-item kinds */
  lines?: FormLineItem[];
  onLinesChange?: (rows: FormLineItem[]) => void;
}

export type FieldRenderer = (props: FieldRendererProps) => ReactNode;

/** How a form surface is being used; the drawer derives verb + method from it. */
export type FormMode = 'create' | 'edit' | 'clone' | 'view';

/** What a toolbar action gets to work with — enough to read and mutate the form. */
export interface FormApi {
  schema: FormSchema;
  mode: FormMode;
  values: Record<string, string>;
  setValues: (patch: Record<string, string>) => void;
  lines: Record<string, FormLineItem[]>;
  setLines: (field: string, rows: FormLineItem[]) => void;
}

export interface FormToolbarAction {
  id: string;
  /** limit to specific schemas; omit = every form */
  appliesTo?: (schema: FormSchema) => boolean;
  render: (api: FormApi) => ReactNode;
}

const fieldRenderers = new Map<string, FieldRenderer>();
const toolbarActions = new Map<string, FormToolbarAction>();

export function registerFieldRenderer(kind: string, renderer: FieldRenderer): void {
  fieldRenderers.set(kind, renderer);
}

export function getFieldRenderer(kind: string): FieldRenderer | undefined {
  return fieldRenderers.get(kind);
}

export function registerFormToolbarAction(action: FormToolbarAction): void {
  toolbarActions.set(action.id, action);
}

export function formToolbarActions(schema: FormSchema): FormToolbarAction[] {
  return [...toolbarActions.values()].filter((a) => !a.appliesTo || a.appliesTo(schema));
}

/* ── Built-in renderers (the legacy CreateDrawer set) ────────────────────── */

const EMPTY_LINE: FormLineItem = { description: '', quantity: 1, unitPrice: 0, vatRate: 5 };

registerFieldRenderer('select', ({ field, value, onChange, disabled, invalid }) => (
  <select
    className={`select${invalid ? ' input-error' : ''}`}
    value={value}
    onChange={(e) => {
      const opt = field.options?.find((o) => o.value === e.target.value);
      onChange(e.target.value, opt);
    }}
    disabled={disabled}
  >
    <option value="">{field.placeholder ?? '— select —'}</option>
    {(field.options ?? []).map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
));

registerFieldRenderer('textarea', ({ field, value, onChange, disabled, invalid }) => (
  <textarea
    className={`textarea${invalid ? ' input-error' : ''}`}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={field.placeholder}
    disabled={disabled}
  />
));

const inputRenderer =
  (type: 'text' | 'date', inputMode?: 'decimal'): FieldRenderer =>
  ({ field, value, onChange, disabled, invalid }) => (
    <input
      className={`input${invalid ? ' input-error' : ''}`}
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      disabled={disabled}
    />
  );

registerFieldRenderer('text', inputRenderer('text'));
registerFieldRenderer('number', inputRenderer('text', 'decimal'));
registerFieldRenderer('date', inputRenderer('date'));

registerFieldRenderer('lines', ({ lines = [{ ...EMPTY_LINE }], onLinesChange, disabled }) => {
  const patch = (i: number, p: Partial<FormLineItem>) =>
    onLinesChange?.(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  return (
    <div className="lines-editor">
      <div className="lines-head">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit price</span>
        <span>VAT %</span>
        <span />
      </div>
      {lines.map((l, i) => (
        <div key={i} className="lines-row">
          <input
            className="input"
            value={l.description}
            placeholder="Line description…"
            onChange={(e) => patch(i, { description: e.target.value })}
            disabled={disabled}
          />
          <input
            className="input"
            inputMode="numeric"
            value={l.quantity}
            onChange={(e) => patch(i, { quantity: Number(e.target.value) || 0 })}
            disabled={disabled}
          />
          <input
            className="input"
            inputMode="decimal"
            value={l.unitPrice}
            onChange={(e) => patch(i, { unitPrice: Number(e.target.value) || 0 })}
            disabled={disabled}
          />
          <input
            className="input"
            inputMode="numeric"
            value={l.vatRate}
            onChange={(e) => patch(i, { vatRate: Number(e.target.value) || 0 })}
            disabled={disabled}
          />
          <button
            type="button"
            className="line-remove"
            onClick={() => onLinesChange?.(lines.length > 1 ? lines.filter((_, j) => j !== i) : lines)}
            aria-label="Remove line"
            disabled={disabled}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="lines-foot">
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: '4px 10px', fontSize: 13 }}
          onClick={() => onLinesChange?.([...lines, { ...EMPTY_LINE }])}
          disabled={disabled}
        >
          ＋ Add line
        </button>
        <span className="lines-total">
          Subtotal: {subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
});

export { EMPTY_LINE };
