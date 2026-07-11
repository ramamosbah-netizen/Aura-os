'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { validateFormOverrides, type FormSchema } from '@aura/shared';
import { ErrorBanner, Pill, Toggle } from './admin-ui';

// Form Designer (Vol 15 §2.4). P1: per-field label/placeholder/hint/required/visible
// patches. P2: designer-added cf_* custom fields, ▲▼ reordering, and the draft→publish
// cycle — edits land in a DRAFT; the live form (renderer + API enforcement) only
// changes when the admin hits Publish, which bumps the version. P3 completes the
// designable surface: per-field FORMULAS and VALIDATION, form-level business RULES
// (condition → actions), and section LAYOUT — all merged by the same shared
// applyFormOverrides, so the renderer and the API enforce exactly what is designed.

interface SchemaSummary {
  id: string;
  entity: string;
  endpoint: string;
  fieldCount: number;
  overridden: number;
}
interface SchemaField {
  name: string;
  label: string;
  kind: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  hidden?: boolean;
  transient?: boolean;
  formula?: string;
  options?: string[];
  validationCount?: number;
}
interface ValidationRule {
  type: 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern';
  value?: number | string;
  message?: string;
}
interface FieldOverride {
  label?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  hidden?: boolean;
  formula?: string;
  validation?: ValidationRule[];
}
interface AddedField {
  name: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'date' | 'textarea';
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: string[];
  formula?: string;
  validation?: ValidationRule[];
}
interface Status {
  version: number;
  hasDraft: boolean;
  publishedAt: string | null;
}

/* Flat designer models for rules + layout (serialized to the schema shapes on save). */
interface UiCond {
  field: string;
  op: string;
  value: string;
}
interface UiAction {
  type: string;
  field?: string;
  value?: string;
  message?: string;
}
interface UiRule {
  description: string;
  join: 'all' | 'any';
  conds: UiCond[];
  actions: UiAction[];
}
interface UiSection {
  label: string;
  fields: string[];
}

const ADDED_KINDS: AddedField['kind'][] = ['text', 'number', 'select', 'date', 'textarea'];
const VALIDATION_TYPES: ValidationRule['type'][] = ['min', 'max', 'minLength', 'maxLength', 'pattern'];
const COND_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'empty', 'notEmpty', 'in'] as const;
const OP_LABEL: Record<string, string> = {
  eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤',
  contains: 'contains', startsWith: 'starts with', empty: 'is empty', notEmpty: 'is not empty', in: 'is one of',
};
const ACTION_TYPES = ['show', 'hide', 'enable', 'disable', 'require', 'unrequire', 'clear', 'set', 'warn', 'error'] as const;
const FIELD_ACTIONS = new Set(['show', 'hide', 'enable', 'disable', 'require', 'unrequire', 'clear', 'set']);
const VALUELESS_OPS = new Set(['empty', 'notEmpty']);

/** Parse a stored FormRule condition tree into the flat designer model (designer-authored rules are flat). */
function parseRule(r: { description?: string; when: unknown; actions?: unknown[] }): UiRule {
  const conds: UiCond[] = [];
  let join: 'all' | 'any' = 'all';
  const asCond = (c: Record<string, unknown> | null | undefined): void => {
    if (!c || typeof c !== 'object') return;
    if (typeof c.field === 'string' && typeof c.op === 'string') {
      const v = c.value;
      conds.push({ field: c.field, op: c.op, value: Array.isArray(v) ? v.join(', ') : v === undefined ? '' : String(v) });
    }
  };
  const w = r.when as Record<string, unknown> | undefined;
  if (w && Array.isArray(w.all)) (w.all as Record<string, unknown>[]).forEach(asCond);
  else if (w && Array.isArray(w.any)) {
    join = 'any';
    (w.any as Record<string, unknown>[]).forEach(asCond);
  } else asCond(w);
  const actions: UiAction[] = [];
  for (const a of (r.actions ?? []) as Array<Record<string, unknown>>) {
    if (!a || typeof a.type !== 'string') continue;
    actions.push({
      type: a.type,
      ...(typeof a.field === 'string' ? { field: a.field } : {}),
      ...(a.value !== undefined ? { value: String(a.value) } : {}),
      ...(typeof a.message === 'string' ? { message: a.message } : {}),
    });
  }
  return { description: r.description ?? '', join, conds, actions };
}

/** Serialize the flat designer model back to schema-shaped FormRules. */
function serializeRules(rules: UiRule[]): unknown[] {
  return rules
    .filter((r) => r.conds.length > 0 && r.actions.length > 0)
    .map((r) => {
      const leafs = r.conds.map((c) => ({
        field: c.field,
        op: c.op,
        ...(VALUELESS_OPS.has(c.op)
          ? {}
          : c.op === 'in'
            ? { value: c.value.split(',').map((s) => s.trim()).filter(Boolean) }
            : { value: c.value }),
      }));
      const actions = r.actions.map((a) => ({
        type: a.type,
        ...(FIELD_ACTIONS.has(a.type) && a.field ? { field: a.field } : {}),
        ...(a.type === 'set' ? { value: a.value ?? '' } : {}),
        ...(a.type === 'warn' || a.type === 'error' ? { message: a.message ?? '' } : {}),
      }));
      return {
        ...(r.description.trim() ? { description: r.description.trim() } : {}),
        when: leafs.length === 1 ? leafs[0] : r.join === 'any' ? { any: leafs } : { all: leafs },
        actions,
      };
    });
}

export default function FormsAdminClient({ initialSchemas }: { initialSchemas: SchemaSummary[] }) {
  const [schemas, setSchemas] = useState<SchemaSummary[]>(initialSchemas);
  const [selected, setSelected] = useState<string | null>(initialSchemas[0]?.id ?? null);
  const [meta, setMeta] = useState<{ id: string; entity: string; endpoint: string; ruleCount: number; hasLayout: boolean }>({ id: '', entity: '', endpoint: '', ruleCount: 0, hasLayout: false });
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [patch, setPatch] = useState<Record<string, FieldOverride>>({});
  const [added, setAdded] = useState<AddedField[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [rules, setRules] = useState<UiRule[]>([]);
  const [sections, setSections] = useState<UiSection[]>([]);
  const [status, setStatus] = useState<Status>({ version: 1, hasDraft: false, publishedAt: null });
  const [composer, setComposer] = useState({ name: '', label: '', kind: 'text' as AddedField['kind'], required: false, options: '' });
  const [view, setView] = useState<'fields' | 'rules' | 'layout'>('fields');
  const [logicOpen, setLogicOpen] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (id: string): Promise<void> => {
    setErr(null);
    setMsg(null);
    setLogicOpen(null);
    const res = await fetch(`/api/admin/forms/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) {
      setErr('Failed to load form');
      return;
    }
    const d = await res.json();
    const code: SchemaField[] = d.schema?.fields ?? [];
    const adds: AddedField[] = d.overrides?.added ?? [];
    setMeta({
      id: d.schema?.id ?? id,
      entity: d.schema?.entity ?? id,
      endpoint: d.schema?.endpoint ?? '',
      ruleCount: d.schema?.ruleCount ?? 0,
      hasLayout: d.schema?.hasLayout === true,
    });
    setFields(code);
    setPatch(d.overrides?.fields ?? {});
    setAdded(adds);
    // Materialize the full display order: stored order first, then any unlisted names.
    const stored: string[] = d.overrides?.order ?? [];
    const all = [...code.map((f) => f.name), ...adds.map((a) => a.name)];
    setOrder([...stored.filter((n) => all.includes(n)), ...all.filter((n) => !stored.includes(n))]);
    setRules(((d.overrides?.rules ?? []) as Array<{ description?: string; when: unknown; actions?: unknown[] }>).map(parseRule));
    setSections(
      ((d.overrides?.layout ?? []) as Array<{ type?: string; label?: string; children?: Array<{ type?: string; name?: string }> }>)
        .filter((n) => n?.type === 'section')
        .map((n) => ({ label: n.label ?? '', fields: (n.children ?? []).filter((c) => c?.type === 'field' && c.name).map((c) => c.name!) })),
    );
    setStatus(d.status ?? { version: 1, hasDraft: false, publishedAt: null });
    setDirty(false);
  };

  useEffect(() => {
    if (selected) void load(selected);
  }, [selected]);

  const refreshList = async (): Promise<void> => {
    const res = await fetch('/api/admin/forms', { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setSchemas(d);
    }
  };

  const mark = (): void => {
    setDirty(true);
    setMsg(null);
  };

  /** The effective value of a designable prop (patch wins over the code schema). */
  const eff = <K extends keyof FieldOverride>(f: SchemaField, key: K): NonNullable<FieldOverride[K]> | string | boolean => {
    const o = patch[f.name]?.[key];
    if (o !== undefined) return o as NonNullable<FieldOverride[K]>;
    return (f[key as keyof SchemaField] as string | boolean | undefined) ?? (key === 'required' || key === 'hidden' ? false : '');
  };

  const setField = (name: string, p: Partial<FieldOverride>): void => {
    setPatch({ ...patch, [name]: { ...patch[name], ...p } });
    mark();
  };

  const setAddedField = (name: string, p: Partial<AddedField>): void => {
    setAdded(added.map((a) => (a.name === name ? { ...a, ...p } : a)));
    mark();
  };

  const move = (name: string, dir: -1 | 1): void => {
    const i = order.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    mark();
  };

  const addField = (): void => {
    const raw = composer.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const name = raw.startsWith('cf_') ? raw : `cf_${raw}`;
    if (!/^cf_[a-z0-9_]{1,40}$/.test(name)) {
      setErr('Field key must be letters/digits/underscores (it is stored as cf_<key>).');
      return;
    }
    if (fields.some((f) => f.name === name) || added.some((a) => a.name === name)) {
      setErr(`A field named ${name} already exists.`);
      return;
    }
    if (!composer.label.trim()) {
      setErr('The new field needs a label.');
      return;
    }
    const options = composer.options.split(',').map((s) => s.trim()).filter(Boolean);
    if (composer.kind === 'select' && options.length === 0) {
      setErr('A select field needs at least one option (comma-separated).');
      return;
    }
    setErr(null);
    setAdded([...added, {
      name,
      label: composer.label.trim(),
      kind: composer.kind,
      required: composer.required,
      ...(composer.kind === 'select' ? { options } : {}),
    }]);
    setOrder([...order, name]);
    setComposer({ name: '', label: '', kind: 'text', required: false, options: '' });
    mark();
  };

  const removeAdded = (name: string): void => {
    setAdded(added.filter((a) => a.name !== name));
    setOrder(order.filter((n) => n !== name));
    setSections(sections.map((s) => ({ ...s, fields: s.fields.filter((f) => f !== name) })));
    if (logicOpen === name) setLogicOpen(null);
    mark();
  };

  /** The draft in wire shape — used for both save and instant client-side validation. */
  const draftBody = () => ({
    fields: patch,
    added,
    order,
    rules: serializeRules(rules),
    layout: sections
      .filter((s) => s.label.trim() || s.fields.length > 0)
      .map((s) => ({ type: 'section', label: s.label, children: s.fields.map((name) => ({ type: 'field', name })) })),
  });

  const saveDraft = async (): Promise<boolean> => {
    if (!selected) return false;
    setErr(null);
    // Same shared validator the API runs — instant feedback, nothing invalid leaves the browser.
    const pseudo = { id: meta.id, entity: meta.entity, endpoint: meta.endpoint, fields } as unknown as FormSchema;
    const body = draftBody();
    const problems = validateFormOverrides(pseudo, body as never);
    if (problems.length > 0) {
      setErr(problems.join(' · '));
      return false;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/forms/${encodeURIComponent(selected)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Failed to save');
        return false;
      }
      setDirty(false);
      setStatus({ ...status, hasDraft: true });
      setMsg('Draft saved — the live form is unchanged until you publish.');
      return true;
    } finally {
      setBusy(false);
    }
  };

  const publish = async (): Promise<void> => {
    if (!selected) return;
    if (dirty && !(await saveDraft())) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/forms/${encodeURIComponent(selected)}/publish`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Publish failed');
        return;
      }
      setMsg(`Published v${d.version} — new form opens render it, and the API enforces it.`);
      await load(selected);
      await refreshList();
    } finally {
      setBusy(false);
    }
  };

  const reset = async (): Promise<void> => {
    if (!selected || !window.confirm('Reset this form to its code defaults? Removes the published design AND the draft.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/forms/${encodeURIComponent(selected)}`, { method: 'DELETE' });
      if (!res.ok) {
        setErr('Failed to reset');
        return;
      }
      await load(selected);
      await refreshList();
      setMsg('Reset to code defaults.');
    } finally {
      setBusy(false);
    }
  };

  const isChanged = (f: SchemaField): boolean => Object.keys(patch[f.name] ?? {}).length > 0;

  // Display rows: code + added fields in the current order.
  const rowByName = new Map<string, { code?: SchemaField; add?: AddedField }>();
  for (const f of fields) rowByName.set(f.name, { code: f });
  for (const a of added) rowByName.set(a.name, { add: a });
  const rows = order.map((n) => ({ name: n, ...rowByName.get(n) })).filter((r) => r.code || r.add);

  /** name → display label for every field (rule/layout pickers). */
  const allFields: Array<{ name: string; label: string }> = rows.map((r) => ({
    name: r.name,
    label: r.add ? r.add.label : String(patch[r.name]?.label ?? r.code?.label ?? r.name),
  }));
  const placed = new Set(sections.flatMap((s) => s.fields));
  const unplaced = allFields.filter((f) => !placed.has(f.name));

  /* ── per-field logic (formula + validation) editor state helpers ─────────── */

  const effFormula = (r: { name: string; code?: SchemaField; add?: AddedField }): string =>
    r.add ? (r.add.formula ?? '') : (patch[r.name]?.formula ?? r.code?.formula ?? '');
  const effValidation = (r: { name: string; code?: SchemaField; add?: AddedField }): ValidationRule[] =>
    r.add ? (r.add.validation ?? []) : (patch[r.name]?.validation ?? []);
  const hasLogic = (r: { name: string; code?: SchemaField; add?: AddedField }): boolean =>
    effFormula(r).trim() !== '' || effValidation(r).length > 0 || (r.code?.validationCount ?? 0) > 0;
  const setLogic = (r: { name: string; code?: SchemaField; add?: AddedField }, p: { formula?: string; validation?: ValidationRule[] }): void => {
    if (r.add) setAddedField(r.name, p);
    else setField(r.name, p);
  };

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>
      {msg && <div style={st.ok}>{msg}</div>}

      {/* form picker + actions */}
      <div style={st.bar}>
        <div style={st.tabs}>
          {schemas.map((s) => (
            <button key={s.id} style={{ ...st.tab, ...(s.id === selected ? st.tabOn : {}) }} onClick={() => setSelected(s.id)}>
              {s.entity}
              {s.overridden > 0 && <span style={st.tabBadge}>{s.overridden}</span>}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <Pill tone="muted">v{status.version}</Pill>
        {dirty ? <Pill tone="warn">unsaved edits</Pill> : status.hasDraft ? <Pill tone="info">draft pending publish</Pill> : <Pill tone="good">live = published</Pill>}
        <button className="btn" disabled={busy} onClick={() => void reset()}>Reset to defaults</button>
        <button className="btn" disabled={busy || !dirty} onClick={() => void saveDraft()}>Save draft</button>
        <button className="btn btn-primary" disabled={busy || (!dirty && !status.hasDraft)} onClick={() => void publish()}>
          Publish{dirty ? ' (saves first)' : ''}
        </button>
      </div>

      {/* designer view switcher (P3) */}
      <div style={{ ...st.tabs, marginBottom: 14 }}>
        {(['fields', 'rules', 'layout'] as const).map((v) => (
          <button key={v} style={{ ...st.tab, ...(view === v ? st.tabOn : {}) }} onClick={() => setView(v)}>
            {v === 'fields' ? 'Fields' : v === 'rules' ? `Rules${rules.length > 0 ? ` (${rules.length})` : ''}` : `Layout${sections.length > 0 ? ` (${sections.length})` : ''}`}
          </button>
        ))}
      </div>

      {view === 'fields' && (
      <section style={st.card}>
        <div style={st.scroll}>
          <table className="adm-matrix" style={{ minWidth: 1020 }}>
            <thead>
              <tr>
                <th style={{ width: 64 }}>Order</th>
                <th style={{ textAlign: 'left' }}>Field</th>
                <th style={{ textAlign: 'left' }}>Label</th>
                <th style={{ textAlign: 'left' }}>Placeholder</th>
                <th style={{ textAlign: 'left' }}>Hint</th>
                <th>Required</th>
                <th>Visible</th>
                <th style={{ width: 70 }}>Logic</th>
                <th style={{ width: 88 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const orderCell = (
                  <td>
                    <button className="btn btn-ghost" style={st.moveBtn} disabled={busy || i === 0} onClick={() => move(r.name, -1)}>▲</button>
                    <button className="btn btn-ghost" style={st.moveBtn} disabled={busy || i === rows.length - 1} onClick={() => move(r.name, 1)}>▼</button>
                  </td>
                );
                const logicCell = (
                  <td>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '2px 8px', ...(logicOpen === r.name ? { background: 'var(--accent-soft)', borderRadius: 6 } : {}) }}
                      disabled={busy}
                      onClick={() => setLogicOpen(logicOpen === r.name ? null : r.name)}
                      title="Formula & validation"
                    >
                      ƒx{hasLogic(r) ? ' ●' : ''}
                    </button>
                  </td>
                );
                const logicRow = logicOpen === r.name && (
                  <tr key={`${r.name}-logic`}>
                    <td colSpan={9} style={{ background: 'var(--panel-2)', padding: '12px 16px', textAlign: 'left' }}>
                      <LogicEditor
                        row={r}
                        busy={busy}
                        formula={effFormula(r)}
                        codeFormula={r.code?.formula}
                        validation={effValidation(r)}
                        codeValidationCount={r.code?.validationCount ?? 0}
                        onChange={(p) => setLogic(r, p)}
                      />
                    </td>
                  </tr>
                );
                if (r.add) {
                  const a = r.add;
                  return (
                    <React.Fragment key={r.name}>
                    <tr style={{ background: 'var(--panel-2)' }}>
                      {orderCell}
                      <td>
                        {a.name}
                        <span style={st.kind}>{a.kind}{a.options ? ` · ${a.options.join('/')}` : ''}</span>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input className="input" style={st.cellInput} value={a.label} onChange={(e) => setAddedField(a.name, { label: e.target.value })} />
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input className="input" style={st.cellInput} value={a.placeholder ?? ''} onChange={(e) => setAddedField(a.name, { placeholder: e.target.value })} />
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input className="input" style={st.cellInput} value={a.hint ?? ''} onChange={(e) => setAddedField(a.name, { hint: e.target.value })} />
                      </td>
                      <td><Toggle on={a.required === true} disabled={busy} onChange={(next) => setAddedField(a.name, { required: next })} /></td>
                      <td><Pill tone="info">custom</Pill></td>
                      {logicCell}
                      <td>
                        <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--bad)' }} disabled={busy} onClick={() => removeAdded(a.name)}>Remove</button>
                      </td>
                    </tr>
                    {logicRow}
                    </React.Fragment>
                  );
                }
                const f = r.code!;
                const hidden = eff(f, 'hidden') === true;
                return (
                  <React.Fragment key={f.name}>
                  <tr style={hidden ? { opacity: 0.55 } : undefined}>
                    {orderCell}
                    <td>
                      {f.name}
                      <span style={st.kind}>{f.kind}{f.transient ? ' · computed' : ''}</span>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input className="input" style={st.cellInput} value={String(eff(f, 'label'))}
                        onChange={(e) => setField(f.name, { label: e.target.value })} />
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input className="input" style={st.cellInput} value={String(eff(f, 'placeholder'))}
                        onChange={(e) => setField(f.name, { placeholder: e.target.value })} />
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input className="input" style={st.cellInput} value={String(eff(f, 'hint'))}
                        onChange={(e) => setField(f.name, { hint: e.target.value })} />
                    </td>
                    <td>
                      <Toggle on={eff(f, 'required') === true} disabled={busy || hidden || !!f.transient}
                        onChange={(next) => setField(f.name, { required: next })} title={hidden ? 'Hidden fields cannot be required' : undefined} />
                    </td>
                    <td>
                      <Toggle on={!hidden} disabled={busy} onChange={(next) => setField(f.name, { hidden: !next })} />
                    </td>
                    {logicCell}
                    <td>{isChanged(f) ? <Pill tone="info">edited</Pill> : null}</td>
                  </tr>
                  {logicRow}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* add-field composer (P2) */}
        <div style={st.composer}>
          <span style={{ fontWeight: 700, fontSize: 12.5 }}>+ Add field</span>
          <input className="input" style={{ width: 130 }} placeholder="key (cf_…)" value={composer.name}
            onChange={(e) => setComposer({ ...composer, name: e.target.value })} />
          <input className="input" style={{ width: 170 }} placeholder="label *" value={composer.label}
            onChange={(e) => setComposer({ ...composer, label: e.target.value })} />
          <select className="input" style={{ width: 110 }} value={composer.kind}
            onChange={(e) => setComposer({ ...composer, kind: e.target.value as AddedField['kind'] })}>
            {ADDED_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          {composer.kind === 'select' && (
            <input className="input" style={{ width: 200 }} placeholder="options, comma-separated" value={composer.options}
              onChange={(e) => setComposer({ ...composer, options: e.target.value })} />
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <Toggle on={composer.required} disabled={busy} onChange={(next) => setComposer({ ...composer, required: next })} /> required
          </label>
          <button className="btn" disabled={busy || !composer.label.trim() || !composer.name.trim()} onClick={addField}>Add</button>
        </div>

        <p style={st.hint}>
          Edits save to a <b>draft</b>; the live form and API enforcement only change when you
          <b> publish</b> (version increments). Custom <code style={{ fontFamily: 'ui-monospace, monospace' }}>cf_*</code> fields
          render, validate, and their values persist per record. The <b>ƒx</b> column opens each field&apos;s
          formula &amp; validation editor. Hiding a field also removes its required check.
        </p>
      </section>
      )}

      {view === 'rules' && (
      <section style={st.card}>
        {meta.ruleCount > 0 && (
          <p style={{ ...st.hint, marginTop: 0 }}>
            This form has <b>{meta.ruleCount} code rule{meta.ruleCount > 1 ? 's' : ''}</b> that always run first; the rules below run after them.
          </p>
        )}
        {rules.length === 0 && <p style={{ ...st.hint, marginTop: 0 }}>No designer rules yet. A rule reacts to field values: <i>when</i> conditions hold, <i>then</i> actions apply (show/hide/require fields, set values, warn, or block the submit with an error). Rules are enforced by the API too.</p>}
        {rules.map((rule, ri) => (
          <div key={ri} style={st.ruleCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Pill tone="muted">rule {ri + 1}</Pill>
              <input className="input" style={{ ...st.cellInput, maxWidth: 340 }} placeholder="description (optional)"
                value={rule.description}
                onChange={(e) => { setRules(rules.map((r, i) => (i === ri ? { ...r, description: e.target.value } : r))); mark(); }} />
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--bad)' }} disabled={busy}
                onClick={() => { setRules(rules.filter((_, i) => i !== ri)); mark(); }}>Remove rule</button>
            </div>

            <div style={st.ruleGroupLabel}>
              WHEN
              {rule.conds.length > 1 && (
                <select className="input" style={st.miniSelect} value={rule.join}
                  onChange={(e) => { setRules(rules.map((r, i) => (i === ri ? { ...r, join: e.target.value as 'all' | 'any' } : r))); mark(); }}>
                  <option value="all">ALL match</option>
                  <option value="any">ANY match</option>
                </select>
              )}
            </div>
            {rule.conds.map((c, ci) => {
              const upd = (p: Partial<UiCond>): void => {
                setRules(rules.map((r, i) => (i === ri ? { ...r, conds: r.conds.map((x, j) => (j === ci ? { ...x, ...p } : x)) } : r)));
                mark();
              };
              const optSource = allFields.find((f) => f.name === c.field);
              const codeOpts = fields.find((f) => f.name === c.field)?.options ?? added.find((a) => a.name === c.field)?.options;
              return (
                <div key={ci} style={st.ruleRow}>
                  <select className="input" style={st.rowSelect} value={c.field} onChange={(e) => upd({ field: e.target.value })}>
                    {!optSource && <option value="">— field —</option>}
                    {allFields.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
                  </select>
                  <select className="input" style={{ ...st.rowSelect, width: 130 }} value={c.op} onChange={(e) => upd({ op: e.target.value })}>
                    {COND_OPS.map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
                  </select>
                  {!VALUELESS_OPS.has(c.op) && (codeOpts?.length && c.op === 'eq' ? (
                    <select className="input" style={st.rowSelect} value={c.value} onChange={(e) => upd({ value: e.target.value })}>
                      <option value="">— value —</option>
                      {codeOpts.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : (
                    <input className="input" style={st.rowSelect} placeholder={c.op === 'in' ? 'values, comma-separated' : 'value'}
                      value={c.value} onChange={(e) => upd({ value: e.target.value })} />
                  ))}
                  <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--bad)' }} disabled={busy}
                    onClick={() => { setRules(rules.map((r, i) => (i === ri ? { ...r, conds: r.conds.filter((_, j) => j !== ci) } : r))); mark(); }}>×</button>
                </div>
              );
            })}
            <button className="btn btn-ghost" style={st.addRowBtn} disabled={busy}
              onClick={() => { setRules(rules.map((r, i) => (i === ri ? { ...r, conds: [...r.conds, { field: allFields[0]?.name ?? '', op: 'eq', value: '' }] } : r))); mark(); }}>
              + condition
            </button>

            <div style={st.ruleGroupLabel}>THEN</div>
            {rule.actions.map((a, ai) => {
              const upd = (p: Partial<UiAction>): void => {
                setRules(rules.map((r, i) => (i === ri ? { ...r, actions: r.actions.map((x, j) => (j === ai ? { ...x, ...p } : x)) } : r)));
                mark();
              };
              return (
                <div key={ai} style={st.ruleRow}>
                  <select className="input" style={{ ...st.rowSelect, width: 130 }} value={a.type} onChange={(e) => upd({ type: e.target.value })}>
                    {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {FIELD_ACTIONS.has(a.type) && (
                    <select className="input" style={st.rowSelect} value={a.field ?? ''} onChange={(e) => upd({ field: e.target.value })}>
                      <option value="">— field —</option>
                      {allFields.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
                    </select>
                  )}
                  {a.type === 'set' && (
                    <input className="input" style={st.rowSelect} placeholder="value" value={a.value ?? ''} onChange={(e) => upd({ value: e.target.value })} />
                  )}
                  {(a.type === 'warn' || a.type === 'error') && (
                    <input className="input" style={{ ...st.rowSelect, width: 320 }} placeholder="message *" value={a.message ?? ''} onChange={(e) => upd({ message: e.target.value })} />
                  )}
                  <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--bad)' }} disabled={busy}
                    onClick={() => { setRules(rules.map((r, i) => (i === ri ? { ...r, actions: r.actions.filter((_, j) => j !== ai) } : r))); mark(); }}>×</button>
                </div>
              );
            })}
            <button className="btn btn-ghost" style={st.addRowBtn} disabled={busy}
              onClick={() => { setRules(rules.map((r, i) => (i === ri ? { ...r, actions: [...r.actions, { type: 'require', field: '' }] } : r))); mark(); }}>
              + action
            </button>
          </div>
        ))}
        <button className="btn" disabled={busy}
          onClick={() => { setRules([...rules, { description: '', join: 'all', conds: [{ field: allFields[0]?.name ?? '', op: 'notEmpty', value: '' }], actions: [{ type: 'require', field: '' }] }]); mark(); }}>
          + Add rule
        </button>
        <p style={st.hint}>
          <b>show/hide · enable/disable · require/unrequire</b> auto-invert when the condition stops matching.
          <b> error</b> blocks the submit (client AND server); <b>warn</b> shows a non-blocking notice; <b>set/clear</b> write field values.
        </p>
      </section>
      )}

      {view === 'layout' && (
      <section style={st.card}>
        {sections.length === 0 && (
          <p style={{ ...st.hint, marginTop: 0 }}>
            No designer layout — the form renders as {meta.hasLayout ? 'its code-defined layout' : 'one flat grid'}.
            Add sections to group fields{meta.hasLayout ? ' (a designer layout replaces the code layout)' : ''}; any field you don&apos;t place renders after the sections.
          </p>
        )}
        {sections.map((s, si) => (
          <div key={si} style={st.ruleCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <button className="btn btn-ghost" style={st.moveBtn} disabled={busy || si === 0}
                onClick={() => { const next = [...sections]; [next[si - 1], next[si]] = [next[si], next[si - 1]]; setSections(next); mark(); }}>▲</button>
              <button className="btn btn-ghost" style={st.moveBtn} disabled={busy || si === sections.length - 1}
                onClick={() => { const next = [...sections]; [next[si], next[si + 1]] = [next[si + 1], next[si]]; setSections(next); mark(); }}>▼</button>
              <input className="input" style={{ ...st.cellInput, maxWidth: 300, fontWeight: 700 }} placeholder="Section title"
                value={s.label}
                onChange={(e) => { setSections(sections.map((x, i) => (i === si ? { ...x, label: e.target.value } : x))); mark(); }} />
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--bad)' }} disabled={busy}
                onClick={() => { setSections(sections.filter((_, i) => i !== si)); mark(); }}>Remove section</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {s.fields.map((name, fi) => (
                <span key={name} style={st.chip}>
                  <button className="btn btn-ghost" style={st.chipBtn} disabled={busy || fi === 0}
                    onClick={() => { const nf = [...s.fields]; [nf[fi - 1], nf[fi]] = [nf[fi], nf[fi - 1]]; setSections(sections.map((x, i) => (i === si ? { ...x, fields: nf } : x))); mark(); }}>◀</button>
                  {allFields.find((f) => f.name === name)?.label ?? name}
                  <button className="btn btn-ghost" style={st.chipBtn} disabled={busy || fi === s.fields.length - 1}
                    onClick={() => { const nf = [...s.fields]; [nf[fi], nf[fi + 1]] = [nf[fi + 1], nf[fi]]; setSections(sections.map((x, i) => (i === si ? { ...x, fields: nf } : x))); mark(); }}>▶</button>
                  <button className="btn btn-ghost" style={{ ...st.chipBtn, color: 'var(--bad)' }} disabled={busy}
                    onClick={() => { setSections(sections.map((x, i) => (i === si ? { ...x, fields: x.fields.filter((f) => f !== name) } : x))); mark(); }}>×</button>
                </span>
              ))}
              {unplaced.length > 0 && (
                <select className="input" style={{ ...st.miniSelect, width: 180 }} value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setSections(sections.map((x, i) => (i === si ? { ...x, fields: [...x.fields, e.target.value] } : x)));
                    mark();
                  }}>
                  <option value="">+ add field…</option>
                  {unplaced.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
                </select>
              )}
            </div>
          </div>
        ))}
        <button className="btn" disabled={busy} onClick={() => { setSections([...sections, { label: `Section ${sections.length + 1}`, fields: [] }]); mark(); }}>
          + Add section
        </button>
        {sections.length > 0 && unplaced.length > 0 && (
          <p style={st.hint}>Unplaced ({unplaced.length}): {unplaced.map((f) => f.label).join(', ')} — these render after the sections.</p>
        )}
      </section>
      )}
    </div>
  );
}

/* ── per-field formula & validation editor (P3) ──────────────────────────── */

function LogicEditor({
  row,
  busy,
  formula,
  codeFormula,
  validation,
  codeValidationCount,
  onChange,
}: {
  row: { name: string };
  busy: boolean;
  formula: string;
  codeFormula?: string;
  validation: ValidationRule[];
  codeValidationCount: number;
  onChange: (p: { formula?: string; validation?: ValidationRule[] }) => void;
}) {
  const updRule = (i: number, p: Partial<ValidationRule>): void =>
    onChange({ validation: validation.map((v, j) => (j === i ? { ...v, ...p } : v)) });
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>ƒx Formula</span>
        <input
          className="input"
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, minWidth: 340, flex: 1, maxWidth: 560 }}
          placeholder="e.g. quantity * rate, or IF(total > 1000, total * 0.05, 0)"
          value={formula}
          disabled={busy}
          onChange={(e) => onChange({ formula: e.target.value })}
        />
        {codeFormula && <Pill tone="muted">code: {codeFormula}</Pill>}
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 12 }}>Validation</span>
          {codeValidationCount > 0 && validation.length === 0 && <Pill tone="muted">{codeValidationCount} code rule{codeValidationCount > 1 ? 's' : ''}</Pill>}
          {codeValidationCount > 0 && validation.length > 0 && <Pill tone="warn">replaces {codeValidationCount} code rule{codeValidationCount > 1 ? 's' : ''}</Pill>}
        </div>
        {validation.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 120, fontSize: 12 }} value={v.type} disabled={busy}
              onChange={(e) => updRule(i, { type: e.target.value as ValidationRule['type'] })}>
              {VALIDATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className="input" style={{ width: v.type === 'pattern' ? 220 : 100, fontSize: 12, ...(v.type === 'pattern' ? { fontFamily: 'ui-monospace, monospace' } : {}) }}
              placeholder={v.type === 'pattern' ? 'regex, e.g. ^[A-Z]{2}-\\d+$' : 'value'}
              value={String(v.value ?? '')} disabled={busy}
              onChange={(e) => updRule(i, { value: v.type === 'pattern' ? e.target.value : e.target.value })} />
            <input className="input" style={{ width: 260, fontSize: 12 }} placeholder="message (optional)"
              value={v.message ?? ''} disabled={busy}
              onChange={(e) => updRule(i, { message: e.target.value })} />
            <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--bad)' }} disabled={busy}
              onClick={() => onChange({ validation: validation.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 8px', border: '1px dashed var(--border)', borderRadius: 7 }} disabled={busy}
          onClick={() => onChange({ validation: [...validation, { type: 'min', value: '' }] })}>
          + validation rule
        </button>
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
        A formula makes <b>{row.name}</b> computed (read-only, recalculated live and on the server). Clear it to make the field editable again.
      </span>
    </div>
  );
}

const st = {
  bar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' } as CSSProperties,
  tabs: { display: 'inline-flex', gap: 4, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 } as CSSProperties,
  tab: { border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } as CSSProperties,
  tabOn: { background: 'var(--accent-grad)', color: 'var(--accent-ink)', fontWeight: 700 } as CSSProperties,
  tabBadge: { fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.18)', borderRadius: 999, padding: '1px 6px' } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' } as CSSProperties,
  scroll: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 } as CSSProperties,
  kind: { display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--muted)', fontWeight: 400 } as CSSProperties,
  cellInput: { padding: '5px 8px', fontSize: 12.5, borderRadius: 7, minWidth: 140, width: '100%' } as CSSProperties,
  moveBtn: { fontSize: 10, padding: '2px 6px' } as CSSProperties,
  composer: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12, padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 10 } as CSSProperties,
  hint: { fontSize: 12, color: 'var(--muted)', margin: '10px 2px 0', lineHeight: 1.5 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, background: 'var(--good-soft)', color: 'var(--good)', marginBottom: 14, fontSize: 13 } as CSSProperties,
  ruleCard: { border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, background: 'var(--panel-2)' } as CSSProperties,
  ruleGroupLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: 'var(--muted)', margin: '8px 0 6px', display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  ruleRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' } as CSSProperties,
  rowSelect: { width: 200, fontSize: 12, padding: '5px 8px', borderRadius: 7 } as CSSProperties,
  miniSelect: { width: 110, fontSize: 11.5, padding: '3px 6px', borderRadius: 6 } as CSSProperties,
  addRowBtn: { fontSize: 12, padding: '3px 8px', border: '1px dashed var(--border)', borderRadius: 7, marginBottom: 4 } as CSSProperties,
  chip: { display: 'inline-flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', fontSize: 12, background: 'var(--panel)' } as CSSProperties,
  chipBtn: { fontSize: 10, padding: '1px 4px' } as CSSProperties,
};
