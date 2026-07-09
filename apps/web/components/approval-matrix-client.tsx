'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ErrorBanner, Pill } from './admin-ui';

// Approval matrix — a professional value-band grid (phase 1.5 pass).
// Each rule row reads as a band: "when value ≥ From (and < To) → these roles approve,
// N of them required". First matching rule wins (order ↑↓); a band-less rule is the
// catch-all default and belongs last. Saved as one ruleset per entity type.

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

/** Split a rule's conditions into the value band + everything else. */
function bandOf(rule: ApprovalRule): { from: number | null; to: number | null; other: ApprovalCondition[] } {
  let from: number | null = null;
  let to: number | null = null;
  const other: ApprovalCondition[] = [];
  for (const c of rule.conditions) {
    const n = Number(c.value);
    if (c.field === 'value' && Number.isFinite(n) && (c.operator === 'gte' || c.operator === 'gt')) from = n;
    else if (c.field === 'value' && Number.isFinite(n) && (c.operator === 'lte' || c.operator === 'lt')) to = n;
    else other.push(c);
  }
  return { from, to, other };
}

/** Rebuild conditions from an edited band, preserving non-value conditions. */
function withBand(rule: ApprovalRule, from: number | null, to: number | null): ApprovalCondition[] {
  const { other } = bandOf(rule);
  const next: ApprovalCondition[] = [...other];
  if (from !== null) next.push({ field: 'value', operator: 'gte', value: from });
  if (to !== null) next.push({ field: 'value', operator: 'lt', value: to });
  return next;
}

const fmt = (n: number | null): string => (n === null ? '' : String(n));

export default function ApprovalMatrixClient({
  initialEntityType,
  initialRules,
}: {
  initialEntityType: string;
  initialRules: ApprovalRule[];
}) {
  const [entityType, setEntityType] = useState(initialEntityType);
  const [rules, setRules] = useState<ApprovalRule[]>(initialRules);
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/access', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => Array.isArray(d?.roles) && setRoles(d.roles))
      .catch(() => undefined);
  }, []);

  const sorted = [...rules].sort((a, b) => a.order - b.order);

  const mutate = (next: ApprovalRule[]): void => {
    setRules(next);
    setDirty(true);
    setMsg(null);
  };

  const patchRule = (id: string, patch: Partial<ApprovalRule>): void => {
    mutate(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const move = (id: string, dir: -1 | 1): void => {
    const idx = sorted.findIndex((r) => r.id === id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    const me = sorted[idx];
    mutate(rules.map((r) => (r.id === me.id ? { ...r, order: swap.order } : r.id === swap.id ? { ...r, order: me.order } : r)));
  };

  const addRule = (): void => {
    const order = rules.length ? Math.max(...rules.map((r) => r.order)) + 1 : 1;
    mutate([
      ...rules,
      { id: `r-${Date.now().toString(36)}`, label: 'New band', conditions: [], approvers: [], minApprovals: 1, order },
    ]);
  };

  const removeRule = (id: string): void => mutate(rules.filter((r) => r.id !== id));

  const addApprover = (rule: ApprovalRule, roleId: string): void => {
    if (!roleId || rule.approvers.includes(roleId)) return;
    patchRule(rule.id, { approvers: [...rule.approvers, roleId] });
  };

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

  const save = async (): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/approval-matrix', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityType, rules: sorted.map((r, i) => ({ ...r, order: i + 1 })) }),
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
      <ErrorBanner>{err}</ErrorBanner>
      {msg && <div style={st.ok}>{msg}</div>}

      {/* Entity tabs + save */}
      <div style={st.bar}>
        <div style={st.tabs}>
          {ENTITY_TYPES.map((t) => (
            <button
              key={t}
              style={{ ...st.tab, ...(t === entityType ? st.tabOn : {}) }}
              onClick={() => {
                setEntityType(t);
                void loadFor(t);
              }}
            >
              {t.replace(/-/g, ' ')}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {dirty ? <Pill tone="warn">unsaved changes</Pill> : <Pill tone="good">saved</Pill>}
        <button className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>
          Save matrix
        </button>
      </div>

      <section style={st.card}>
        <div style={st.scroll}>
          <table className="adm-matrix" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ width: 64 }}>Order</th>
                <th style={{ textAlign: 'left' }}>Band</th>
                <th style={{ textAlign: 'left' }}>From (AED ≥)</th>
                <th style={{ textAlign: 'left' }}>Up to (&lt;)</th>
                <th style={{ textAlign: 'left' }}>Approver roles</th>
                <th style={{ width: 90 }}>Required</th>
                <th style={{ width: 56 }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={7} style={st.empty}>No rules for this document type — add the first band below.</td></tr>
              ) : (
                sorted.map((r, i) => {
                  const band = bandOf(r);
                  const isCatchAll = band.from === null && band.to === null && band.other.length === 0;
                  return (
                    <tr key={r.id}>
                      <td>
                        <span style={st.orderNo}>{i + 1}</span>
                        <button style={st.mini} disabled={i === 0} onClick={() => move(r.id, -1)} title="Move up">▲</button>
                        <button style={st.mini} disabled={i === sorted.length - 1} onClick={() => move(r.id, 1)} title="Move down">▼</button>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input
                          className="input"
                          style={st.cellInput}
                          value={r.label}
                          onChange={(e) => patchRule(r.id, { label: e.target.value })}
                        />
                        {isCatchAll && <div style={{ marginTop: 3 }}><Pill tone="muted">catch-all default</Pill></div>}
                        {band.other.map((c, j) => (
                          <div key={j} style={{ marginTop: 3 }}>
                            <Pill tone="info">{c.field} {c.operator} {String(c.value)}</Pill>
                          </div>
                        ))}
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input
                          className="input"
                          style={{ ...st.cellInput, width: 110 }}
                          type="number"
                          placeholder="any"
                          value={fmt(band.from)}
                          onChange={(e) =>
                            patchRule(r.id, { conditions: withBand(r, e.target.value === '' ? null : Number(e.target.value), band.to) })
                          }
                        />
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input
                          className="input"
                          style={{ ...st.cellInput, width: 110 }}
                          type="number"
                          placeholder="∞"
                          value={fmt(band.to)}
                          onChange={(e) =>
                            patchRule(r.id, { conditions: withBand(r, band.from, e.target.value === '' ? null : Number(e.target.value)) })
                          }
                        />
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        {r.approvers.map((a) => (
                          <span key={a} style={st.chip}>
                            {a}
                            <button
                              style={st.chipX}
                              onClick={() => patchRule(r.id, { approvers: r.approvers.filter((x) => x !== a) })}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <select
                          className="select"
                          style={st.roleAdd}
                          value=""
                          onChange={(e) => addApprover(r, e.target.value)}
                        >
                          <option value="">+ role…</option>
                          {roles
                            .filter((ro) => !r.approvers.includes(ro.id))
                            .map((ro) => (
                              <option key={ro.id} value={ro.id}>{ro.name}</option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="input"
                          style={{ ...st.cellInput, width: 58, textAlign: 'center' }}
                          type="number"
                          min={1}
                          max={Math.max(1, r.approvers.length)}
                          value={r.minApprovals}
                          onChange={(e) => patchRule(r.id, { minApprovals: Math.max(1, Number(e.target.value) || 1) })}
                        />
                      </td>
                      <td>
                        <button className="btn btn-ghost" style={st.del} onClick={() => removeRule(r.id)} title="Delete rule">✕</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <button className="btn" style={{ marginTop: 12 }} onClick={addRule}>+ Add band</button>
        <p style={st.hint}>
          Evaluation is top-down — the first band whose conditions all match decides the approvers.
          Leave <i>From/Up to</i> empty on the last row for the catch-all default.
        </p>
      </section>
    </div>
  );
}

const st = {
  bar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' } as CSSProperties,
  tabs: {
    display: 'inline-flex',
    gap: 4,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 4,
  } as CSSProperties,
  tab: {
    border: 'none',
    background: 'transparent',
    color: 'var(--muted)',
    fontSize: 12.5,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 7,
    cursor: 'pointer',
    textTransform: 'capitalize',
  } as CSSProperties,
  tabOn: { background: 'var(--accent-grad)', color: 'var(--accent-ink)', fontWeight: 700 } as CSSProperties,
  card: {
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 18,
    background: 'var(--panel)',
    boxShadow: 'var(--shadow-sm)',
  } as CSSProperties,
  scroll: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 } as CSSProperties,
  empty: { color: 'var(--muted)', padding: 18 } as CSSProperties,
  orderNo: { fontWeight: 800, marginRight: 6 } as CSSProperties,
  mini: {
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--muted)',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 9,
    padding: '2px 4px',
    marginLeft: 2,
  } as CSSProperties,
  cellInput: { padding: '5px 8px', fontSize: 12.5, borderRadius: 7 } as CSSProperties,
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11.5,
    fontWeight: 600,
    background: 'var(--accent-soft)',
    color: 'var(--accent)',
    borderRadius: 999,
    padding: '2px 4px 2px 9px',
    margin: '2px 4px 2px 0',
  } as CSSProperties,
  chipX: {
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: 1,
    padding: '0 3px',
  } as CSSProperties,
  roleAdd: { width: 92, padding: '3px 22px 3px 8px', fontSize: 11.5, borderRadius: 7, display: 'inline-block' } as CSSProperties,
  del: { fontSize: 12, padding: '3px 8px' } as CSSProperties,
  hint: { fontSize: 12, color: 'var(--muted)', margin: '10px 2px 0', lineHeight: 1.5 } as CSSProperties,
  ok: {
    padding: '10px 12px',
    border: '1px solid var(--good)',
    borderRadius: 10,
    background: 'var(--good-soft)',
    color: 'var(--good)',
    marginBottom: 14,
    fontSize: 13,
  } as CSSProperties,
};
