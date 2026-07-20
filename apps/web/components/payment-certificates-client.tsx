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

interface ArInvoice { id: string; invoiceNumber: string; total: number; status: string }

export default function CertificatesClient({ contracts, initialCertificates, arInvoices = [] }: { contracts: Contract[]; initialCertificates: Certificate[]; arInvoices?: ArInvoice[] }) {
  // A certified IPC auto-drafts an AR invoice `AR-{reference}-{contractId[:8]}` (cross-module reactor).
  // Surface it here so the certify→bill handoff isn't invisible (you had to know to go to Finance).
  const arByNumber = new Map(arInvoices.map((inv) => [inv.invoiceNumber, inv]));
  const arFor = (c: Certificate): ArInvoice | undefined =>
    arByNumber.get(`AR-${c.reference ?? `IPC-${c.sequence}`}-${c.contractId.slice(0, 8)}`);
  const [certificates, setCertificates] = useState<Certificate[]>(initialCertificates);
  /** Which certificate is mid-transition, and to what — drives the button's pending label. */
  const [pending, setPending] = useState<{ id: string; status: string } | null>(null);
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

  // A status change costs ~4.4s end to end: the PATCH, then refresh() re-reads the whole
  // certificate list and the contract summary, and each of those is a flat ~0.85s round trip.
  // Without a pending state the row simply sits there looking untouched for four seconds, with
  // the button still live — and these are `Certify` and `Mark paid`, where the natural response
  // to "nothing happened" is to click again.
  async function setStatus(id: string, status: string): Promise<void> {
    if (pending) return;
    setPending({ id, status });
    setErr('');
    try {
      const res = await fetch(`/api/contracts/certificates/${id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setErr(d.message ?? d.error ?? `Could not mark this certificate ${status}.`);
        return;
      }
      await refresh();
      if (summary?.contract) await loadSummary(summary.contract.id);
    } catch {
      setErr('Could not reach the server — the certificate was not changed.');
    } finally {
      setPending(null);
    }
  }

  function ActionBtn({ cert, to, label, busyLabel, style }: {
    cert: Certificate; to: string; label: string; busyLabel: string; style: CSSProperties;
  }) {
    const mine = pending?.id === cert.id && pending.status === to;
    return (
      <button
        type="button"
        style={pending ? { ...style, opacity: 0.6, cursor: 'default' } : style}
        disabled={!!pending}
        aria-busy={mine}
        onClick={() => setStatus(cert.id, to)}
      >
        {mine ? busyLabel : label}
      </button>
    );
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
                <td style={s.td}>
                  <span style={s.tag(c.status)}>{c.status}</span>
                  {arFor(c) && <a href="/finance/customer-invoices" style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }} title="AR invoice auto-drafted from this certified IPC">🧾 {arFor(c)!.invoiceNumber} →</a>}
                </td>
                <td style={s.tdR}>
                  {c.status === 'draft' && <ActionBtn cert={c} to="submitted" label="Submit" busyLabel="Submitting…" style={s.smallBtn} />}
                  {c.status === 'submitted' && (
                    <>
                      <ActionBtn cert={c} to="certified" label="Certify" busyLabel="Certifying…" style={s.approveBtn} />
                      <ActionBtn cert={c} to="rejected" label="Reject" busyLabel="Rejecting…" style={s.smallBtn} />
                    </>
                  )}
                  {c.status === 'certified' && <ActionBtn cert={c} to="paid" label="Mark paid" busyLabel="Marking paid…" style={s.approveBtn} />}
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
