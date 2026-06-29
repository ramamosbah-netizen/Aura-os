'use client';

import { type CSSProperties, useState } from 'react';

interface Contract {
  id: string;
  title: string;
  value: number;
  accountName: string | null;
  status: string;
}

interface Certificate {
  id: string;
  contractId: string;
  contractTitle: string | null;
  sequence: number;
  reference: string | null;
  grossToDate: number;
  retentionToDate: number;
  netThisCertificate: number;
  status: string;
  createdAt: string;
}

interface Summary {
  contract: { id: string; title: string; value: number } | null;
  summary: {
    contractValue: number;
    certificateCount: number;
    grossCertifiedToDate: number;
    retentionHeld: number;
    netCertifiedToDate: number;
    percentComplete: number;
  };
}

function money(n: number): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n);
}

export default function CertificatesClient({ contracts, initialCertificates }: { contracts: Contract[]; initialCertificates: Certificate[] }) {
  const [certificates, setCertificates] = useState<Certificate[]>(initialCertificates);
  const [contractId, setContractId] = useState('');
  const [workDone, setWorkDone] = useState('');
  const [materials, setMaterials] = useState('');
  const [retentionPercent, setRetentionPercent] = useState('10');
  const [retentionCapPercent, setRetentionCapPercent] = useState('5');
  const [advance, setAdvance] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState('');

  async function refresh(): Promise<void> {
    const res = await fetch('/api/contracts/certificates');
    if (res.ok) setCertificates(await res.json());
  }

  async function loadSummary(cid: string): Promise<void> {
    if (!cid) {
      setSummary(null);
      return;
    }
    const res = await fetch(`/api/contracts/certificates/summary/${cid}`);
    if (res.ok) setSummary(await res.json());
  }

  async function create(): Promise<void> {
    setErr('');
    if (!contractId || !(Number(workDone) >= 0) || workDone === '') {
      setErr('Select a contract and enter cumulative work done.');
      return;
    }
    const res = await fetch('/api/contracts/certificates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contractId,
        cumulativeWorkDone: Number(workDone),
        materialsOnSite: materials ? Number(materials) : 0,
        retentionPercent: retentionPercent ? Number(retentionPercent) : 0,
        retentionCapPercent: retentionCapPercent ? Number(retentionCapPercent) : 0,
        advanceRecoveredToDate: advance ? Number(advance) : 0,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.message ?? data.error ?? 'Create failed');
      return;
    }
    setWorkDone('');
    setMaterials('');
    setAdvance('');
    await refresh();
    await loadSummary(contractId);
  }

  async function setStatus(id: string, status: string): Promise<void> {
    await fetch(`/api/contracts/certificates/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await refresh();
    if (summary?.contract) await loadSummary(summary.contract.id);
  }

  return (
    <div>
      <div style={s.card}>
        <div style={s.row}>
          <label style={s.field}>
            <span style={s.label}>Contract</span>
            <select style={s.input} value={contractId} onChange={(e) => { setContractId(e.target.value); loadSummary(e.target.value); }}>
              <option value="">— select —</option>
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.title} ({money(c.value)})</option>)}
            </select>
          </label>
          <label style={s.fieldSm}><span style={s.label}>Work done to date</span><input style={s.input} type="number" value={workDone} onChange={(e) => setWorkDone(e.target.value)} placeholder="cumulative" /></label>
          <label style={s.fieldSm}><span style={s.label}>Materials on site</span><input style={s.input} type="number" value={materials} onChange={(e) => setMaterials(e.target.value)} /></label>
          <label style={s.fieldXs}><span style={s.label}>Retention %</span><input style={s.input} type="number" value={retentionPercent} onChange={(e) => setRetentionPercent(e.target.value)} /></label>
          <label style={s.fieldXs}><span style={s.label}>Cap % of value</span><input style={s.input} type="number" value={retentionCapPercent} onChange={(e) => setRetentionCapPercent(e.target.value)} /></label>
          <label style={s.fieldSm}><span style={s.label}>Advance recovered</span><input style={s.input} type="number" value={advance} onChange={(e) => setAdvance(e.target.value)} /></label>
          <button type="button" style={s.primary} onClick={create}>Raise IPC</button>
        </div>
        {err && <p style={s.err}>{err}</p>}
        {summary?.contract && (
          <div style={s.summary}>
            <Stat label="Contract value" value={money(summary.summary.contractValue)} />
            <Stat label="Certified to date" value={money(summary.summary.grossCertifiedToDate)} />
            <Stat label="% complete" value={`${summary.summary.percentComplete}%`} />
            <Stat label="Retention held" value={money(summary.summary.retentionHeld)} />
            <Stat label="Net certified" value={money(summary.summary.netCertifiedToDate)} accent />
            <Stat label="Certificates" value={String(summary.summary.certificateCount)} />
          </div>
        )}
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>IPC</th>
            <th style={s.th}>Contract</th>
            <th style={s.thR}>Gross to date</th>
            <th style={s.thR}>Retention</th>
            <th style={s.thR}>Net this cert</th>
            <th style={s.th}>Status</th>
            <th style={s.th} />
          </tr>
        </thead>
        <tbody>
          {certificates.length === 0 ? (
            <tr><td style={s.muted} colSpan={7}>No certificates yet — raise one above.</td></tr>
          ) : (
            certificates.map((c) => (
              <tr key={c.id} style={s.trow}>
                <td style={s.td}>{c.reference ?? `#${c.sequence}`}</td>
                <td style={s.tdMuted}>{c.contractTitle ?? c.contractId.slice(0, 8)}</td>
                <td style={s.tdR}>{money(c.grossToDate)}</td>
                <td style={s.tdOmit}>−{money(c.retentionToDate)}</td>
                <td style={s.tdAdd}>{money(c.netThisCertificate)}</td>
                <td style={s.td}><span style={s.tag(c.status)}>{c.status}</span></td>
                <td style={s.tdR}>
                  {c.status === 'draft' && <button type="button" style={s.smallBtn} onClick={() => setStatus(c.id, 'submitted')}>Submit</button>}
                  {c.status === 'submitted' && (
                    <>
                      <button type="button" style={s.approveBtn} onClick={() => setStatus(c.id, 'certified')}>Certify</button>
                      <button type="button" style={s.smallBtn} onClick={() => setStatus(c.id, 'rejected')}>Reject</button>
                    </>
                  )}
                  {c.status === 'certified' && <button type="button" style={s.approveBtn} onClick={() => setStatus(c.id, 'paid')}>Mark paid</button>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={s.stat}>
      <span style={s.statLabel}>{label}</span>
      <span style={accent ? s.statValueAccent : s.statValue}>{value}</span>
    </div>
  );
}

const tagColor = (st: string): string =>
  st === 'certified' ? 'var(--good)' : st === 'paid' ? 'var(--accent)' : st === 'rejected' ? 'var(--bad)' : st === 'submitted' ? 'var(--accent)' : 'var(--muted)';

const s = {
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 } as CSSProperties,
  row: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 180 } as CSSProperties,
  fieldSm: { display: 'flex', flexDirection: 'column', gap: 5, width: 130 } as CSSProperties,
  fieldXs: { display: 'flex', flexDirection: 'column', gap: 5, width: 100 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 14 } as CSSProperties,
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#fff', padding: '9px 16px', fontSize: 14, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '8px 2px 0' } as CSSProperties,
  summary: { display: 'flex', gap: 26, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' } as CSSProperties,
  stat: { display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  statLabel: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  statValue: { fontSize: 16, fontWeight: 600 } as CSSProperties,
  statValueAccent: { fontSize: 18, fontWeight: 700, color: 'var(--accent)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 18 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  thR: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  trow: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px' } as CSSProperties,
  tdMuted: { padding: '10px', color: 'var(--muted)' } as CSSProperties,
  tdR: { padding: '10px', textAlign: 'right' } as CSSProperties,
  tdAdd: { padding: '10px', textAlign: 'right', color: 'var(--good)', fontWeight: 600 } as CSSProperties,
  tdOmit: { padding: '10px', textAlign: 'right', color: 'var(--bad)' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '12px 10px' } as CSSProperties,
  tag: (st: string): CSSProperties => ({ fontSize: 11.5, color: tagColor(st), border: `1px solid ${tagColor(st)}`, borderRadius: 999, padding: '1px 9px', textTransform: 'capitalize' }),
  smallBtn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '6px 11px', fontSize: 12.5, cursor: 'pointer', marginLeft: 6 } as CSSProperties,
  approveBtn: { background: 'var(--good)', border: 'none', borderRadius: 8, color: '#04210f', padding: '6px 11px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
};
