'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ErrorBanner, Pill } from './admin-ui';

// Document numbering — inline-editable sequence grid with a live "next number"
// preview per row (phase 1.5 professional pass). Prefix/pad/current edit in place;
// the row saves as one unit.

export interface NumberSequence {
  companyId: string | null;
  module: string;
  entity: string;
  prefix: string;
  fiscalYear: number;
  padWidth: number;
  currentSeq: number;
}

const preview = (s: { prefix: string; fiscalYear: number; padWidth: number; currentSeq: number }): string =>
  `${s.prefix}${s.fiscalYear ? `-${s.fiscalYear}` : ''}-${String(s.currentSeq + 1).padStart(s.padWidth || 6, '0')}`;

const keyOf = (s: NumberSequence): string => `${s.module}/${s.entity}/${s.fiscalYear}`;

export default function NumberingAdminClient({ initialSequences }: { initialSequences: NumberSequence[] }) {
  const [sequences, setSequences] = useState<NumberSequence[]>(initialSequences);
  const [drafts, setDrafts] = useState<Record<string, NumberSequence>>({});
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // new-sequence composer
  const [nModule, setNModule] = useState('');
  const [nEntity, setNEntity] = useState('');
  const [nPrefix, setNPrefix] = useState('');
  const [nYear, setNYear] = useState(new Date().getFullYear());

  const refresh = async (): Promise<void> => {
    const res = await fetch('/api/admin/numbering', { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setSequences(d);
    }
  };

  const persist = async (s: NumberSequence): Promise<boolean> => {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/numbering', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          module: s.module.trim(),
          entity: s.entity.trim(),
          prefix: s.prefix.trim(),
          fiscalYear: Number(s.fiscalYear),
          currentSeq: Number(s.currentSeq),
          padWidth: Number(s.padWidth),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Failed to save sequence');
        return false;
      }
      const d = await res.json().catch(() => ({}));
      if (d?.nextNumber) setMsg(`Saved — next ${s.module}/${s.entity} number: ${d.nextNumber}`);
      await refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const draftOf = (s: NumberSequence): NumberSequence => drafts[keyOf(s)] ?? s;
  const isDirty = (s: NumberSequence): boolean => {
    const d = drafts[keyOf(s)];
    return !!d && (d.prefix !== s.prefix || d.padWidth !== s.padWidth || d.currentSeq !== s.currentSeq);
  };

  const patch = (s: NumberSequence, p: Partial<NumberSequence>): void => {
    setDrafts({ ...drafts, [keyOf(s)]: { ...draftOf(s), ...p } });
  };

  const saveRow = async (s: NumberSequence): Promise<void> => {
    if (await persist(draftOf(s))) {
      const next = { ...drafts };
      delete next[keyOf(s)];
      setDrafts(next);
    }
  };

  const create = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (
      await persist({
        companyId: null,
        module: nModule,
        entity: nEntity,
        prefix: nPrefix || nEntity.slice(0, 3).toUpperCase(),
        fiscalYear: nYear,
        padWidth: 6,
        currentSeq: 0,
      })
    ) {
      setNModule('');
      setNEntity('');
      setNPrefix('');
    }
  };

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>
      {msg && <div style={st.ok}>{msg}</div>}

      <section style={st.card}>
        <div style={st.scroll}>
          <table className="adm-matrix" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Series</th>
                <th style={{ textAlign: 'left' }}>Prefix</th>
                <th>Year</th>
                <th>Pad</th>
                <th>Current</th>
                <th style={{ textAlign: 'left' }}>Next number</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {sequences.length === 0 ? (
                <tr><td colSpan={7} style={st.empty}>No sequences yet — configure the first one below.</td></tr>
              ) : (
                sequences.map((s) => {
                  const d = draftOf(s);
                  return (
                    <tr key={keyOf(s)}>
                      <td>
                        {s.module}
                        <span style={st.entity}>{s.entity}</span>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input className="input" style={st.cellInput} value={d.prefix} onChange={(e) => patch(s, { prefix: e.target.value })} />
                      </td>
                      <td>{s.fiscalYear}</td>
                      <td>
                        <input className="input" style={{ ...st.cellInput, width: 52, textAlign: 'center' }} type="number" min={1} max={12} value={d.padWidth} onChange={(e) => patch(s, { padWidth: Number(e.target.value) || 6 })} />
                      </td>
                      <td>
                        <input className="input" style={{ ...st.cellInput, width: 82, textAlign: 'center' }} type="number" min={0} value={d.currentSeq} onChange={(e) => patch(s, { currentSeq: Number(e.target.value) || 0 })} />
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <span style={st.preview}>{preview(d)}</span>
                      </td>
                      <td>
                        {isDirty(s) ? (
                          <button className="btn btn-primary" style={st.saveBtn} disabled={busy} onClick={() => void saveRow(s)}>Save</button>
                        ) : (
                          <Pill tone="muted">saved</Pill>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={create} style={st.form}>
          <input className="input" style={st.addInput} placeholder="module (e.g. finance)" value={nModule} onChange={(e) => setNModule(e.target.value)} required />
          <input className="input" style={st.addInput} placeholder="entity (e.g. invoice)" value={nEntity} onChange={(e) => setNEntity(e.target.value)} required />
          <input className="input" style={st.addInput} placeholder="prefix (e.g. INV)" value={nPrefix} onChange={(e) => setNPrefix(e.target.value)} />
          <input className="input" style={{ ...st.addInput, width: 92, flex: 'none' }} type="number" title="fiscal year" value={nYear} onChange={(e) => setNYear(Number(e.target.value))} />
          <button className="btn btn-primary" disabled={busy} type="submit">Add series</button>
        </form>
        <p style={st.hint}>
          Numbers are gapless per fiscal year. Setting <b>current</b> to N makes the next generated
          number N+1 — the preview column shows it live as you type.
        </p>
      </section>
    </div>
  );
}

const st = {
  card: {
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 18,
    background: 'var(--panel)',
    boxShadow: 'var(--shadow-sm)',
  } as CSSProperties,
  scroll: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 } as CSSProperties,
  empty: { color: 'var(--muted)', padding: 18 } as CSSProperties,
  entity: { display: 'block', fontSize: 11, color: 'var(--muted)', fontWeight: 400 } as CSSProperties,
  cellInput: { padding: '5px 8px', fontSize: 12.5, borderRadius: 7, width: 110 } as CSSProperties,
  preview: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12.5,
    fontWeight: 700,
    color: 'var(--accent)',
    background: 'var(--accent-soft)',
    borderRadius: 6,
    padding: '3px 8px',
  } as CSSProperties,
  saveBtn: { fontSize: 12, padding: '4px 12px' } as CSSProperties,
  form: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  addInput: { flex: 1, minWidth: 130, padding: '8px 10px', fontSize: 13 } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 12, marginTop: 10, lineHeight: 1.5 } as CSSProperties,
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
