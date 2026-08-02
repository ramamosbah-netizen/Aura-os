'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';

export interface Subcontract {
  id: string;
  title: string;
  subcontractorName: string;
  projectName: string | null;
  value: number;
  retentionPercentage: number;
}
export interface Claim {
  id: string;
  subcontractId: string;
  claimNumber: number;
  status: 'draft' | 'certified' | 'paid';
  workCompletedValue: number;
  previouslyCertifiedValue: number;
  thisPeriodGrossValue: number;
  retentionWithheld: number;
  netCertifiedValue: number;
  isRetentionRelease: boolean;
  retentionReleased: number;
  createdAt: string;
}

const statusColor: Record<string, string> = { draft: '#d97706', certified: '#2563eb', paid: '#16a34a' };
const aed = (n: number) => `AED ${Math.round(n).toLocaleString()}`;

export default function SubcontractClaimsClient({ initial, subcontracts }: { initial: Claim[]; subcontracts: Subcontract[] }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState({ subcontractId: subcontracts[0]?.id ?? '', workCompletedValue: '', isRetentionRelease: false, retentionReleased: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const scName = useMemo(() => {
    const m = new Map(subcontracts.map((s) => [s.id, `${s.subcontractorName} — ${s.title}`]));
    return (id: string) => m.get(id) ?? id;
  }, [subcontracts]);

  const kpi = useMemo(() => ({
    draft: rows.filter((r) => r.status === 'draft').length,
    certifiedUnpaid: rows.filter((r) => r.status === 'certified').length,
    netCertified: rows.filter((r) => r.status !== 'draft').reduce((s, r) => s + r.netCertifiedValue, 0),
  }), [rows]);

  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const create = async () => {
    setError('');
    if (!f.subcontractId) return setError('Select a subcontract');
    if (!f.isRetentionRelease && !f.workCompletedValue.trim()) return setError('Cumulative work-completed value is required');
    setBusy(true);
    try {
      const res = await fetch('/api/subcontracts/claims', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subcontractId: f.subcontractId,
          workCompletedValue: Number(f.workCompletedValue) || 0,
          isRetentionRelease: f.isRetentionRelease,
          retentionReleased: f.isRetentionRelease ? (Number(f.retentionReleased) || 0) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => [data, ...p]);
      setF({ subcontractId: f.subcontractId, workCompletedValue: '', isRetentionRelease: false, retentionReleased: '' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const act = async (id: string, action: 'certify' | 'pay') => {
    setError('');
    try {
      const res = await fetch(`/api/subcontracts/claims/${id}/${action}`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => p.map((r) => (r.id === id ? data : r)));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div style={st.kpis}>
        <Kpi label="Draft" value={String(kpi.draft)} />
        <Kpi label="Certified, unpaid" value={String(kpi.certifiedUnpaid)} />
        <Kpi label="Net certified" value={aed(kpi.netCertified)} />
      </div>

      <h2 style={st.h2}>New progress claim</h2>
      {subcontracts.length === 0 ? (
        <p style={st.muted}>No subcontracts yet — create a subcontract before raising a claim.</p>
      ) : (
        <div style={st.form}>
          <label style={{ ...st.label, minWidth: 260 }}>Subcontract<select style={st.input} value={f.subcontractId} onChange={(e) => set('subcontractId', e.target.value)}>{subcontracts.map((s) => <option key={s.id} value={s.id}>{s.subcontractorName} — {s.title}</option>)}</select></label>
          <label style={st.chk}><input type="checkbox" checked={f.isRetentionRelease} onChange={(e) => set('isRetentionRelease', e.target.checked)} /> Retention release</label>
          {f.isRetentionRelease ? (
            <label style={st.label}>Retention released<input style={{ ...st.input, minWidth: 140 }} inputMode="numeric" value={f.retentionReleased} onChange={(e) => set('retentionReleased', e.target.value)} placeholder="0" /></label>
          ) : (
            <label style={st.label}>Cumulative work done (gross)<input style={{ ...st.input, minWidth: 170 }} inputMode="numeric" value={f.workCompletedValue} onChange={(e) => set('workCompletedValue', e.target.value)} placeholder="AED" /></label>
          )}
          <button style={st.btn} onClick={create} disabled={busy}>{busy ? 'Raising…' : 'Raise claim'}</button>
          {error && <span style={st.err}>{error}</span>}
        </div>
      )}

      <h2 style={st.h2}>Claim register</h2>
      {rows.length === 0 ? (
        <EmptyState compact title="No claims raised" description="Raise a progress claim against a subcontract's cumulative work done — the period gross, retention and net payable are computed, then certify and pay." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>#</th><th style={st.th}>Subcontract</th><th style={st.thR}>Period gross</th><th style={st.thR}>Retention</th><th style={st.thR}>Net payable</th><th style={st.th}>Status</th><th style={st.th}></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={st.td}>{r.claimNumber}{r.isRetentionRelease ? ' (R)' : ''}</td>
                <td style={st.td}>{scName(r.subcontractId)}</td>
                <td style={st.tdR}>{aed(r.thisPeriodGrossValue)}</td>
                <td style={st.tdR}>{r.isRetentionRelease ? `−${aed(r.retentionReleased)}` : aed(r.retentionWithheld)}</td>
                <td style={{ ...st.tdR, fontWeight: 600 }}>{aed(r.netCertifiedValue)}</td>
                <td style={{ ...st.td, color: statusColor[r.status], fontWeight: 600 }}>{r.status}</td>
                <td style={st.td}>
                  {r.status === 'draft' && <button style={st.sm} onClick={() => act(r.id, 'certify')}>Certify</button>}
                  {r.status === 'certified' && <button style={st.smGreen} onClick={() => act(r.id, 'pay')}>Pay</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={st.kpi}>
      <div style={st.kpiLabel}>{label}</div>
      <div style={st.kpiValue}>{value}</div>
    </div>
  );
}

const st = {
  kpis: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' as const } as CSSProperties,
  kpi: { border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 150, background: 'var(--surface)' } as CSSProperties,
  kpiLabel: { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } as CSSProperties,
  kpiValue: { fontSize: 22, fontWeight: 700, letterSpacing: -0.5 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 14, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  chk: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120, background: 'var(--surface)', color: 'var(--fg)' } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', marginLeft: 12, fontSize: 13 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 14 } as CSSProperties,
  h2: { fontSize: 20, margin: '22px 0 10px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thR: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  tdR: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', textAlign: 'right' as const } as CSSProperties,
};
