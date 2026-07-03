'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Config-driven slide-over create form. Every list page opens one of these from
 * a "+ New X" button instead of an inline quick-add strip. The field config is
 * plain data, so server components can pass it straight through as props.
 */

export interface SelectOption {
  value: string;
  label: string;
  /** picking this option prefills these form fields (only where still empty) */
  fills?: Record<string, string>;
  /** picking this option merges these keys straight into the POST payload */
  extra?: Record<string, string | number | null>;
}

export interface FieldSpec {
  /** payload key the value is posted under */
  name: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'date' | 'textarea' | 'lines';
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: SelectOption[];
  /** for selects: also post the chosen option's label under this payload key */
  labelField?: string;
  /** grid width — drawer body is a 2-col grid */
  span?: 1 | 2;
  defaultValue?: string;
  /** payload transform: 'csv' splits into a trimmed string array; 'isoDate' posts an ISO timestamp */
  transform?: 'csv' | 'isoDate';
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

interface Props {
  /** entity noun, e.g. "Account" — renders the button and drawer title */
  entity: string;
  /** short sentence under the title explaining what this creates */
  subtitle: string;
  /** BFF route to POST (create) or PATCH (edit) the payload to */
  endpoint: string;
  fields: FieldSpec[];
  /** button label override; defaults to "+ New {entity}" (create) / "Edit" (edit) */
  buttonLabel?: string;
  /** 'edit' turns this into an edit form: PATCH, prefilled fields, ghost trigger button */
  mode?: 'create' | 'edit';
  /** current record values to prefill in edit mode, keyed by field name */
  initialValues?: Record<string, string>;
}

const EMPTY_LINE: LineItem = { description: '', quantity: 1, unitPrice: 0, vatRate: 5 };

export default function CreateDrawer({ entity, subtitle, endpoint, fields, buttonLabel, mode = 'create', initialValues: editValues }: Props) {
  const router = useRouter();
  const isEdit = mode === 'edit';
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [touched, setTouched] = useState(false);

  const initialValues = useMemo(() => {
    const v: Record<string, string> = {};
    for (const f of fields) v[f.name] = editValues?.[f.name] ?? f.defaultValue ?? '';
    return v;
  }, [fields, editValues]);

  const openDrawer = useCallback(() => {
    setValues(initialValues);
    setLines([{ ...EMPTY_LINE }]);
    setErr(null);
    setTouched(false);
    setOpen(true);
  }, [initialValues]);

  const close = useCallback(() => {
    if (!busy) setOpen(false);
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const hasLines = fields.some((f) => f.kind === 'lines');
  const missing = fields.filter((f) => f.required && f.kind !== 'lines' && !values[f.name]?.trim());
  const linesInvalid = hasLines && !lines.some((l) => l.description.trim());

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.kind === 'lines') {
        payload[f.name] = lines
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
      if (f.transform === 'csv') payload[f.name] = raw.split(',').map((s) => s.trim()).filter(Boolean);
      else if (f.transform === 'isoDate') payload[f.name] = new Date(raw).toISOString();
      else if (f.kind === 'number') payload[f.name] = Number(raw) || 0;
      else payload[f.name] = raw;
      if (f.kind === 'select') {
        const opt = f.options?.find((o) => o.value === raw);
        if (opt && f.labelField) payload[f.labelField] = opt.label;
        if (opt?.extra) Object.assign(payload, opt.extra);
      }
    }
    return payload;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (missing.length > 0 || linesInvalid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(endpoint, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setErr(d.error ?? d.message ?? `Error ${res.status}`);
      } else {
        setOpen(false);
        setToast(`${entity} ${isEdit ? 'updated' : 'created'}`);
        router.refresh();
      }
    } catch {
      setErr('Could not reach the API.');
    } finally {
      setBusy(false);
    }
  }

  const linesTotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    0,
  );

  return (
    <>
      {isEdit ? (
        <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={openDrawer}>
          {buttonLabel ?? 'Edit'}
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={openDrawer}>
          <span aria-hidden>＋</span> {buttonLabel ?? `New ${entity}`}
        </button>
      )}

      {toast ? (
        <div className="toast" role="status">
          <span className="dot" /> {toast}
        </div>
      ) : null}

      {open ? (
        <>
          <div className="drawer-overlay" onClick={close} />
          <div className="drawer" role="dialog" aria-modal="true" aria-label={`New ${entity}`}>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="drawer-head">
                <div>
                  <h2 className="drawer-title">{isEdit ? `Edit ${entity}` : `New ${entity}`}</h2>
                  <p className="drawer-sub">{subtitle}</p>
                </div>
                <button type="button" className="btn btn-ghost" onClick={close} aria-label="Close">
                  ✕
                </button>
              </div>

              <div className="drawer-body">
                {err ? <div className="drawer-error">{err}</div> : null}

                {fields.map((f) => {
                  const invalid = touched && f.required && f.kind !== 'lines' && !values[f.name]?.trim();
                  const cls = `field${(f.span ?? (f.kind === 'textarea' || f.kind === 'lines' ? 2 : 1)) === 2 ? ' span-2' : ''}`;
                  return (
                    <div key={f.name} className={cls}>
                      <label className="field-label">
                        {f.label}
                        {f.required ? <span className="req">*</span> : null}
                      </label>

                      {f.kind === 'select' ? (
                        <select
                          className={`select${invalid ? ' input-error' : ''}`}
                          value={values[f.name] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            const opt = f.options?.find((o) => o.value === val);
                            setValues((v) => {
                              const next = { ...v, [f.name]: val };
                              if (opt?.fills) {
                                for (const [k, fill] of Object.entries(opt.fills)) {
                                  if (!next[k]?.trim()) next[k] = fill;
                                }
                              }
                              return next;
                            });
                          }}
                          disabled={busy}
                        >
                          <option value="">{f.placeholder ?? '— select —'}</option>
                          {(f.options ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : f.kind === 'textarea' ? (
                        <textarea
                          className={`textarea${invalid ? ' input-error' : ''}`}
                          value={values[f.name] ?? ''}
                          onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                          placeholder={f.placeholder}
                          disabled={busy}
                        />
                      ) : f.kind === 'lines' ? (
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
                                onChange={(e) =>
                                  setLines((ls) => ls.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                                }
                                disabled={busy}
                              />
                              <input
                                className="input"
                                inputMode="numeric"
                                value={l.quantity}
                                onChange={(e) =>
                                  setLines((ls) =>
                                    ls.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 0 } : x)),
                                  )
                                }
                                disabled={busy}
                              />
                              <input
                                className="input"
                                inputMode="decimal"
                                value={l.unitPrice}
                                onChange={(e) =>
                                  setLines((ls) =>
                                    ls.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) || 0 } : x)),
                                  )
                                }
                                disabled={busy}
                              />
                              <input
                                className="input"
                                inputMode="numeric"
                                value={l.vatRate}
                                onChange={(e) =>
                                  setLines((ls) =>
                                    ls.map((x, j) => (j === i ? { ...x, vatRate: Number(e.target.value) || 0 } : x)),
                                  )
                                }
                                disabled={busy}
                              />
                              <button
                                type="button"
                                className="line-remove"
                                onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}
                                aria-label="Remove line"
                                disabled={busy}
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
                              onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}
                              disabled={busy}
                            >
                              ＋ Add line
                            </button>
                            <span className="lines-total">
                              Subtotal: {linesTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <input
                          className={`input${invalid ? ' input-error' : ''}`}
                          type={f.kind === 'date' ? 'date' : 'text'}
                          inputMode={f.kind === 'number' ? 'decimal' : undefined}
                          value={values[f.name] ?? ''}
                          onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                          placeholder={f.placeholder}
                          disabled={busy}
                        />
                      )}

                      {f.hint ? <span className="field-hint">{f.hint}</span> : null}
                    </div>
                  );
                })}
              </div>

              <div className="drawer-foot">
                {touched && (missing.length > 0 || linesInvalid) ? (
                  <span style={{ color: 'var(--bad)', fontSize: 13, marginRight: 'auto' }}>
                    {linesInvalid && missing.length === 0
                      ? 'Add at least one line item.'
                      : `Required: ${missing.map((f) => f.label).join(', ')}`}
                  </span>
                ) : null}
                <button type="button" className="btn" onClick={close} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Saving…' : isEdit ? 'Save changes' : `Create ${entity}`}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
