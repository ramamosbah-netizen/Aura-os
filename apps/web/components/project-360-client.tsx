'use client';

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// Project 360 — delivery + commercial control in one place. The project
// INHERITS its commercial context from the chain (contract value → budget),
// tracks execution (variations, delays/EOT, EVM), and CLOSES the chain:
// finalizing closeout + completing the project completes the source contract.

interface Project {
  id: string;
  title: string;
  reference: string | null;
  contractId: string | null;
  contractTitle: string | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}
interface Variation { id: string; reference: string | null; title: string; kind: string; value: number; status: string; createdAt: string; }
interface VariationImpact { originalValue: number; approvedAdditions: number; approvedOmissions: number; revisedValue: number; pendingValue: number; }
interface EotClaim { id: string; title: string; daysRequested: number; daysGranted: number | null; status: string; createdAt: string; }
interface CloseoutItem { label: string; done: boolean; }
interface Closeout { id: string; status: string; items: CloseoutItem[]; handoverDate: string | null; dlpEndDate: string | null; }
interface Evm { plannedValue: number; earnedValue: number; actualCost: number; spi: number; cpi: number; }
interface CertSummary { grossCertifiedToDate: number; retentionHeld: number; percentComplete: number; }

type Tab = 'variations' | 'eot' | 'closeout';

const aed = (n: number): string => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');
const fmt = (iso: string): string => new Date(iso).toLocaleDateString();

export default function Project360Client({ project }: { project: Project }) {
  const router = useRouter();
  const [variations, setVariations] = useState<Variation[]>([]);
  const [impact, setImpact] = useState<VariationImpact | null>(null);
  const [eots, setEots] = useState<EotClaim[]>([]);
  const [closeout, setCloseout] = useState<Closeout | null>(null);
  const [evm, setEvm] = useState<Evm | null>(null);
  const [certs, setCerts] = useState<CertSummary | null>(null);
  const [tab, setTab] = useState<Tab>('variations');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = async <T,>(url: string, fallback: T): Promise<T> => {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) return fallback;
        return (await r.json()) as T;
      } catch { return fallback; }
    };
    const [vs, imp, eot, cls, evmData, certSummary] = await Promise.all([
      j<Variation[]>(`/api/projects/variations?projectId=${project.id}`, []),
      j<{ impact: VariationImpact } | null>(`/api/projects/variations/summary/${project.id}`, null),
      j<EotClaim[]>(`/api/projects/eot-claims?projectId=${project.id}`, []),
      j<Closeout[]>(`/api/projects/closeouts?projectId=${project.id}`, []),
      j<Evm | null>(`/api/projects/projects/${project.id}/evm`, null),
      project.contractId ? j<{ summary: CertSummary } | null>(`/api/contracts/certificates/summary/${project.contractId}`, null) : Promise.resolve(null),
    ]);
    setVariations(Array.isArray(vs) ? vs : []);
    setImpact(imp?.impact ?? null);
    setEots(Array.isArray(eot) ? eot : []);
    setCloseout((Array.isArray(cls) ? cls : [])[0] ?? null);
    setEvm(evmData && Number.isFinite(evmData.earnedValue) ? evmData : null);
    setCerts(certSummary?.summary ?? null);
  }, [project.id, project.contractId]);

  useEffect(() => { void load(); }, [load]);

  const closeoutDone = useMemo(() => (closeout ? closeout.items.filter((i) => i.done).length : 0), [closeout]);

  const call = async (url: string, method: string, body?: unknown, note?: string): Promise<boolean> => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(url, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Action failed'); return false; }
      if (note) setMsg(note);
      await load();
      router.refresh();
      return true;
    } catch { setErr('API unreachable'); return false; } finally { setBusy(false); }
  };

  const setStatus = (status: string): void => {
    void call(`/api/projects/projects/${project.id}/status`, 'PATCH', { status },
      status === 'active' ? 'Execution started.'
      : status === 'completed' ? 'Project completed — the source contract is being closed on the deal chain.'
      : undefined);
  };

  return (
    <div>
      {err && <div style={st.err}>{err}</div>}
      {msg && <div style={st.ok}>{msg}</div>}

      {/* header */}
      <div style={st.header}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={st.h1}>{project.title}</h1>
            <span className={project.status === 'active' ? 'badge badge-good' : project.status === 'completed' ? 'badge badge-accent' : project.status === 'cancelled' ? 'badge badge-bad' : 'badge'}>{project.status}</span>
          </div>
          <div style={st.subline}>
            {project.reference && <span style={{ fontFamily: 'ui-monospace, monospace' }}>{project.reference}</span>}
            {project.accountId
              ? <a href={`/crm/accounts/${project.accountId}`} style={st.link}>{project.accountName ?? 'Account'}</a>
              : project.accountName && <span>{project.accountName}</span>}
            <span>Created {fmt(project.createdAt)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {project.status === 'planned' && (
            <button className="btn btn-primary" style={st.actBtn} disabled={busy} onClick={() => setStatus('active')}>▶ Start execution</button>
          )}
          {project.status === 'active' && (
            <button
              className="btn btn-primary"
              style={st.actBtn}
              disabled={busy}
              title={closeout && closeout.status !== 'finalized' ? 'Tip: finalize the closeout checklist first' : undefined}
              onClick={() => setStatus('completed')}
            >
              Complete ✓ → closes contract
            </button>
          )}
          {(project.status === 'planned' || project.status === 'active') && (
            <button className="btn btn-ghost" style={st.actBtn} disabled={busy} onClick={() => setStatus('cancelled')}>Cancel</button>
          )}
          <a href="/projects/schedule" style={st.linkBtn}>▤ Schedule</a>
        </div>
      </div>

      {/* commercial control — inherited from the chain */}
      <div style={st.stats}>
        <Stat label="Budget (contract)" value={`AED ${aed(project.value)}`} strong />
        <Stat label="Approved variations" value={impact ? `AED ${aed(impact.approvedAdditions - impact.approvedOmissions)}` : '—'} />
        <Stat label="Revised value" value={impact ? `AED ${aed(impact.revisedValue)}` : '—'} strong accent />
        <Stat label="Pending variations" value={impact ? `AED ${aed(impact.pendingValue)}` : '—'} />
        <Stat label="Certified to date" value={certs ? `AED ${aed(certs.grossCertifiedToDate)}` : '—'} />
        <Stat label="Billing %" value={certs ? `${certs.percentComplete}%` : '—'} />
        {evm && <Stat label="Earned value" value={`AED ${aed(evm.earnedValue)}`} />}
        {evm && <Stat label="SPI / CPI" value={`${evm.spi} / ${evm.cpi}`} accent bad={evm.spi < 1 || evm.cpi < 1} />}
        <Stat label="Closeout" value={closeout ? `${closeoutDone}/${closeout.items.length}${closeout.status === 'finalized' ? ' ✓' : ''}` : 'not started'} />
      </div>

      {/* deal-chain strip */}
      <div style={st.chain}>
        {project.accountId
          ? <a href={`/crm/accounts/${project.accountId}`} style={{ ...st.chainNode, ...st.chainOn }}>◆ {project.accountName ?? 'Account'}</a>
          : <span style={st.chainNode}>◆ no account</span>}
        <span style={st.arrow}>→</span>
        {project.contractId
          ? <a href={`/contracts/contracts/${project.contractId}`} style={{ ...st.chainNode, ...st.chainOn }}>▤ {project.contractTitle ?? 'Contract'}</a>
          : <span style={st.chainNode}>▤ no contract (direct)</span>}
        <span style={st.arrow}>→</span>
        <span style={{ ...st.chainNode, borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 800 }}>▦ PROJECT</span>
        <span style={st.arrow}>→</span>
        <span style={{ ...st.chainNode, ...(project.status === 'completed' ? { color: 'var(--good)', borderColor: 'var(--good)' } : {}) }}>
          ✓ {project.status === 'completed' ? 'delivered & closed' : 'delivery in progress'}
        </span>
      </div>

      {/* tabs */}
      <div style={st.tabs}>
        {([
          ['variations', `Variations (${variations.length})`],
          ['eot', `Delays & EOT (${eots.length})`],
          ['closeout', `Closeout${closeout ? ` (${closeoutDone}/${closeout.items.length})` : ''}`],
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} style={{ ...st.tab, ...(tab === id ? st.tabOn : {}) }} onClick={() => setTab(id)}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {tab === 'variations' && <a href="/projects/variations" style={st.linkBtn}>Variations register →</a>}
        {tab === 'closeout' && !closeout && (
          <button className="btn btn-primary" style={st.actBtn} disabled={busy}
            onClick={() => void call('/api/projects/closeouts', 'POST', { projectId: project.id, projectName: project.title }, 'Closeout checklist started.')}>
            Start closeout checklist
          </button>
        )}
      </div>

      <section className="panel">
        {tab === 'variations' && (
          variations.length === 0 ? <p style={st.muted}>No variation orders — scope changes land here (additions / omissions adjust the revised value).</p> : (
            <table className="data-table">
              <thead><tr>{['Ref', 'Title', 'Kind', 'Value', 'Status', 'Raised'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {variations.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontFamily: 'ui-monospace, monospace' }}>{v.reference ?? '—'}</td>
                    <td style={{ fontWeight: 600 }}>{v.title}</td>
                    <td style={{ textTransform: 'capitalize' }}>{v.kind}</td>
                    <td style={{ fontWeight: 600, color: v.value < 0 ? 'var(--bad)' : 'var(--fg)' }}>AED {aed(v.value)}</td>
                    <td><span className={v.status === 'approved' ? 'badge badge-good' : v.status === 'rejected' ? 'badge badge-bad' : 'badge'}>{v.status}</span></td>
                    <td style={{ color: 'var(--muted)' }}>{fmt(v.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === 'eot' && (
          eots.length === 0 ? <p style={st.muted}>No EOT claims — time-impact claims from the delay log appear here.</p> : (
            <table className="data-table">
              <thead><tr>{['Claim', 'Days requested', 'Days granted', 'Status', 'Raised'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {eots.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}>{e.title}</td>
                    <td>{e.daysRequested}</td>
                    <td>{e.daysGranted ?? '—'}</td>
                    <td><span className={e.status === 'granted' || e.status === 'approved' ? 'badge badge-good' : e.status === 'rejected' ? 'badge badge-bad' : 'badge'}>{e.status}</span></td>
                    <td style={{ color: 'var(--muted)' }}>{fmt(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === 'closeout' && (
          !closeout ? <p style={st.muted}>Closeout not started — start the checklist to track handover: as-builts, O&M manuals, testing & commissioning certificates, DLP…</p> : (
            <div style={{ padding: '6px 8px' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <span className={closeout.status === 'finalized' ? 'badge badge-good' : 'badge'}>{closeout.status}</span>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{closeoutDone}/{closeout.items.length} items done</span>
                {closeout.handoverDate && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Handover {closeout.handoverDate}</span>}
                {closeout.dlpEndDate && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>DLP until {closeout.dlpEndDate}</span>}
                {closeout.status !== 'finalized' && closeoutDone === closeout.items.length && (
                  <button className="btn btn-primary" style={st.actBtn} disabled={busy}
                    onClick={() => void call(`/api/projects/closeouts/${closeout.id}/finalize`, 'POST', { handoverDate: new Date().toISOString().slice(0, 10) }, 'Closeout finalized — now complete the project to close the contract.')}>
                    Finalize closeout ✓
                  </button>
                )}
              </div>
              {closeout.items.map((item, i) => (
                <label key={i} style={st.checkRow}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={busy || closeout.status === 'finalized'}
                    onChange={(e) => void call(`/api/projects/closeouts/${closeout.id}/items/${i}`, 'PATCH', { done: e.target.checked })}
                  />
                  <span style={item.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>{item.label}</span>
                </label>
              ))}
            </div>
          )
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, strong, accent, bad }: { label: string; value: string; strong?: boolean; accent?: boolean; bad?: boolean }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: strong ? 16 : 13.5, fontWeight: strong ? 800 : 600, color: bad ? 'var(--bad)' : accent ? 'var(--accent)' : 'var(--fg)' }}>{value}</div>
    </div>
  );
}

const st = {
  err: { padding: '10px 12px', border: '1px solid var(--bad)', borderRadius: 10, color: 'var(--bad)', marginBottom: 12, fontSize: 13 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, color: 'var(--good)', marginBottom: 12, fontSize: 13 } as CSSProperties,
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 } as CSSProperties,
  h1: { fontSize: 24, margin: 0, color: 'var(--accent)' } as CSSProperties,
  subline: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)', marginTop: 6, alignItems: 'center' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  actBtn: { padding: '8px 14px', fontSize: 12.5, fontWeight: 700 } as CSSProperties,
  linkBtn: { border: '1px solid var(--border)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none', whiteSpace: 'nowrap' } as CSSProperties,
  stats: { display: 'flex', gap: 22, flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', marginBottom: 12 } as CSSProperties,
  chain: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 16px', border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 14, fontSize: 12.5 } as CSSProperties,
  chainNode: { border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', color: 'var(--muted)', textDecoration: 'none' } as CSSProperties,
  chainOn: { color: 'var(--fg)', borderColor: 'var(--accent)' } as CSSProperties,
  arrow: { color: 'var(--muted)' } as CSSProperties,
  tabs: { display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 } as CSSProperties,
  tab: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 9, cursor: 'pointer' } as CSSProperties,
  tabOn: { color: 'var(--accent)', borderColor: 'var(--accent)', fontWeight: 700 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  checkRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderBottom: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' } as CSSProperties,
};
