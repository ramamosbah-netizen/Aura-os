'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';

export interface ApprovalCondition {
  field: string;
  operator: string;
  value: string | number;
}
export interface ApprovalRule {
  id: string;
  label: string;
  conditions: ApprovalCondition[];
  approvers: string[];
  minApprovals: number;
  order: number;
}

const ENTITY_TYPES = ['purchase-request', 'purchase-order', 'invoice', 'subcontract'];
const OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];

export default function ApprovalMatrixClient({
  initialEntityType,
  initialRules,
}: {
  initialEntityType: string;
  initialRules: ApprovalRule[];
}) {
  const [entityType, setEntityType] = useState(initialEntityType);
  const [rules, setRules] = useState<ApprovalRule[]>(initialRules);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // add-rule form
  const [label, setLabel] = useState('');
  const [approvers, setApprovers] = useState('');
  const [minApprovals, setMinApprovals] = useState(1);
  const [cField, setCField] = useState('value');
  const [cOp, setCOp] = useState('gt');
  const [cVal, setCVal] = useState('');

  const loadFor = async (et: string): Promise<void> => {
    setErr(null);
    setMsg(null);
    const res = await fetch(`/api/admin/approval-matrix?entityType=${encodeURIComponent(et)}`, { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      setRules(d.rules ?? []);
      setDirty(false);
    }
  };

  const switchEntity = async (et: string): Promise<void> => {
    setEntityType(et);
    await loadFor(et);
  };

  const addRule = (e: FormEvent): void => {
    e.preventDefault();
    const conditions: ApprovalCondition[] = cVal.trim()
      ? [{ field: cField.trim(), operator: cOp, value: isNaN(Number(cVal)) ? cVal.trim() : Number(cVal) }]
      : [];
    const rule: ApprovalRule = {
      id: `r-${Date.now().toString(36)}`,
      label: label.trim() || 'Unnamed rule',
      conditions,
      approvers: approvers.split(',').map((s) => s.trim()).filter(Boolean),
      minApprovals: Math.max(1, Number(minApprovals) || 1),
      order: rules.length ? Math.max(...rules.map((r) => r.order)) + 1 : 1,
    };
    setRules([...rules, rule]);
    setDirty(true);
    setLabel('');
    setApprovers('');
    setMinApprovals(1);
    setCVal('');
  };

  const removeRule = (id: string): void => {
    setRules(rules.filter((r) => r.id !== id));
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/approval-matrix', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityType, rules }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Failed to save');
        return;
      }
      setDirty(false);
      setMsg(`Saved ${rules.length} rule(s) for ${entityType}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {err && <div style={st.err}>{err}</div>}
      {msg && <div style={st.ok}>{msg}</div>}

      <div style={st.bar}>
        <label style={st.lbl}>Entity type</label>
        <select style={st.input} value={entityType} onChange={(e) => switchEntity(e.target.value)}>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button style={{ ...st.btn, opacity: dirty ? 1 : 0.5 }} disabled={busy || !dirty} onClick={save}>
          {dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      <section style={st.card}>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>#</th>
              <th style={st.th}>Rule</th>
              <th style={st.th}>When</th>
              <th style={st.th}>Approvers</th>
              <th style={st.th}>Quorum</th>
              <th style={st.th}></th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr><td style={st.td} colSpan={6}>No rules — add one below.</td></tr>
            ) : (
              [...rules].sort((a, b) => a.order - b.order).map((r) => (
                <tr key={r.id}>
                  <td style={st.td}>{r.order}</td>
                  <td style={st.td}>{r.label}</td>
                  <td style={st.tdMono}>
                    {r.conditions.length === 0
                      ? <span style={{ color: 'var(--muted)' }}>always (default)</span>
                      : r.conditions.map((c, i) => <span key={i} style={st.chip}>{c.field} {c.operator} {String(c.value)}</span>)}
                  </td>
                  <td style={st.tdMono}>{r.approvers.join(', ')}</td>
                  <td style={st.td}>{r.minApprovals}</td>
                  <td style={st.td}><button style={st.btnGhost} onClick={() => removeRule(r.id)}>Remove</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={addRule} style={st.form}>
          <input style={st.input} placeholder="rule label (e.g. Over 50k → CFO)" value={label} onChange={(e) => setLabel(e.target.value)} required />
          <input style={st.inputSm} placeholder="field" value={cField} onChange={(e) => setCField(e.target.value)} />
          <select style={st.inputSm} value={cOp} onChange={(e) => setCOp(e.target.value)}>
            {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input style={st.inputSm} placeholder="value" value={cVal} onChange={(e) => setCVal(e.target.value)} />
          <input style={st.input} placeholder="approvers (comma-sep users/roles)" value={approvers} onChange={(e) => setApprovers(e.target.value)} />
          <input style={st.inputSm} type="number" min={1} value={minApprovals} onChange={(e) => setMinApprovals(Number(e.target.value))} title="min approvals" />
          <button style={st.btn} type="submit">Add rule</button>
        </form>
        <p style={st.hint}>Leave the condition value blank for a catch-all default rule. Changes are staged locally — click <strong>Save changes</strong> to persist.</p>
      </section>
    </div>
  );
}

const st = {
  bar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 } as CSSProperties,
  lbl: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 10, padding: '18px 18px 14px', background: 'var(--panel)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  tdMono: { padding: '8px', borderBottom: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace', fontSize: 12 } as CSSProperties,
  chip: { display: 'inline-block', fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 6px', margin: '2px 4px 2px 0' } as CSSProperties,
  form: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { flex: 1, minWidth: 120, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel-2)', color: 'inherit', fontSize: 13 } as CSSProperties,
  inputSm: { width: 90, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel-2)', color: 'inherit', fontSize: 13 } as CSSProperties,
  btn: { padding: '7px 14px', border: '1px solid var(--accent, #3b82f6)', borderRadius: 6, background: 'var(--accent, #3b82f6)', color: '#fff', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnGhost: { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 12, marginTop: 10 } as CSSProperties,
  err: { padding: '10px 12px', border: '1px solid #ef4444', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', marginBottom: 16, fontSize: 13 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid #22c55e', borderRadius: 8, background: 'rgba(34,197,94,0.08)', color: '#16a34a', marginBottom: 16, fontSize: 13 } as CSSProperties,
};
