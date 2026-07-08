'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';

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

export default function NumberingAdminClient({ initialSequences }: { initialSequences: NumberSequence[] }) {
  const [sequences, setSequences] = useState<NumberSequence[]>(initialSequences);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [module, setModule] = useState('');
  const [entity, setEntity] = useState('');
  const [prefix, setPrefix] = useState('');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [currentSeq, setCurrentSeq] = useState(0);
  const [padWidth, setPadWidth] = useState(6);

  const refresh = async (): Promise<void> => {
    const res = await fetch('/api/admin/numbering', { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) setSequences(d);
    }
  };

  const editRow = (s: NumberSequence): void => {
    setModule(s.module);
    setEntity(s.entity);
    setPrefix(s.prefix);
    setFiscalYear(s.fiscalYear);
    setCurrentSeq(s.currentSeq);
    setPadWidth(s.padWidth);
    setMsg(null);
    setErr(null);
  };

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/numbering', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ module: module.trim(), entity: entity.trim(), prefix: prefix.trim(), fiscalYear: Number(fiscalYear), currentSeq: Number(currentSeq), padWidth: Number(padWidth) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? 'Failed to save sequence');
        return;
      }
      const d = await res.json();
      setMsg(`Saved. Next ${module}/${entity} number will be ${d.nextNumber}.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {err && <div style={st.err}>{err}</div>}
      {msg && <div style={st.ok}>{msg}</div>}

      <section style={st.card}>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>Module</th>
              <th style={st.th}>Entity</th>
              <th style={st.th}>Prefix</th>
              <th style={st.th}>Year</th>
              <th style={st.th}>Current</th>
              <th style={st.th}>Next</th>
              <th style={st.th}></th>
            </tr>
          </thead>
          <tbody>
            {sequences.length === 0 ? (
              <tr><td style={st.td} colSpan={7}>No sequences yet — configure one below.</td></tr>
            ) : (
              sequences.map((s, i) => (
                <tr key={`${s.module}-${s.entity}-${s.fiscalYear}-${i}`}>
                  <td style={st.td}>{s.module}</td>
                  <td style={st.td}>{s.entity}</td>
                  <td style={st.tdMono}>{s.prefix}</td>
                  <td style={st.td}>{s.fiscalYear}</td>
                  <td style={st.td}>{s.currentSeq}</td>
                  <td style={st.tdMono}>{preview(s)}</td>
                  <td style={st.td}><button style={st.btnGhost} onClick={() => editRow(s)}>Edit</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={save} style={st.form}>
          <input style={st.inputSm} placeholder="module" value={module} onChange={(e) => setModule(e.target.value)} required />
          <input style={st.inputSm} placeholder="entity" value={entity} onChange={(e) => setEntity(e.target.value)} required />
          <input style={st.inputSm} placeholder="prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          <input style={st.inputXs} type="number" title="fiscal year" value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))} />
          <input style={st.inputXs} type="number" min={0} title="current seq" value={currentSeq} onChange={(e) => setCurrentSeq(Number(e.target.value))} />
          <input style={st.inputXs} type="number" min={1} title="pad width" value={padWidth} onChange={(e) => setPadWidth(Number(e.target.value))} />
          <button style={st.btn} disabled={busy} type="submit">Set sequence</button>
        </form>
        <p style={st.hint}>Editing an existing row loads it here. Setting <strong>current</strong> to N means the next generated number is N+1.</p>
      </section>
    </div>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 10, padding: '18px 18px 14px', background: 'var(--panel)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdMono: { padding: '8px', borderBottom: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace', fontSize: 12.5 } as CSSProperties,
  form: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  inputSm: { width: 110, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel-2)', color: 'inherit', fontSize: 13 } as CSSProperties,
  inputXs: { width: 80, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel-2)', color: 'inherit', fontSize: 13 } as CSSProperties,
  btn: { padding: '7px 14px', border: '1px solid var(--accent, #3b82f6)', borderRadius: 6, background: 'var(--accent, #3b82f6)', color: '#fff', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnGhost: { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 12, marginTop: 10 } as CSSProperties,
  err: { padding: '10px 12px', border: '1px solid #ef4444', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', marginBottom: 16, fontSize: 13 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid #22c55e', borderRadius: 8, background: 'rgba(34,197,94,0.08)', color: '#16a34a', marginBottom: 16, fontSize: 13 } as CSSProperties,
};
