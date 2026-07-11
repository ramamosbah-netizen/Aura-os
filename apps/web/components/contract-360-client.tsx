'use client';

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';

// Contract 360 — where the deal chain closes. One page for the awarded
// contract's whole commercial life: workflow (Activate/Sign → the reactor
// creates the Project), obligations & milestones, bonds/guarantees with
// expiry watch, payment certificates (IPCs), and the chain strip
// (tender ← quotation ← CONTRACT → project).

interface Contract {
  id: string;
  title: string;
  reference: string | null;
  tenderId: string | null;
  tenderTitle: string | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}
interface Obligation {
  id: string; title: string; description: string | null; obligationType: string;
  responsibleParty: string; dueDate: string; status: string; completedDate: string | null;
}
interface Bond {
  id: string; kind: string; reference: string; bank: string | null; amount: number;
  issueDate: string | null; expiryDate: string | null; status: string;
}
interface Certificate {
  id: string; sequence: number; reference: string | null; status: string;
  grossToDate: number; netThisCertificate: number; createdAt: string;
}
interface CertSummary {
  contractValue: number; certificateCount: number; grossCertifiedToDate: number;
  retentionHeld: number; netCertifiedToDate: number; percentComplete: number;
}
interface ProjectLite { id: string; title: string; status: string; }
interface QuotationLite { id: string; quoteNumber: string; status: string; convertedContractId?: string | null; }

type Tab = 'obligations' | 'bonds' | 'certificates';

const aed = (n: number): string => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');
const fmt = (iso: string): string => new Date(iso).toLocaleDateString();
const BOND_KIND_LABEL: Record<string, string> = {
  performance: 'Performance bond', advance_payment: 'Advance payment guarantee',
  retention: 'Retention bond', warranty: 'Warranty bond', tender_bond: 'Tender bond',
};

export default function Contract360Client({ contract }: { contract: Contract }) {
  const router = useRouter();
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [certSummary, setCertSummary] = useState<CertSummary | null>(null);
  const [project, setProject] = useState<ProjectLite | null>(null);
  const [quotation, setQuotation] = useState<QuotationLite | null>(null);
  const [tab, setTab] = useState<Tab>('obligations');
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
    const [obl, bnd, certPayload, projects, quotes] = await Promise.all([
      j<Obligation[]>(`/api/contracts/obligations?contractId=${contract.id}`, []),
      j<Bond[]>(`/api/contracts/bonds?contractId=${contract.id}`, []),
      j<{ certificates: Certificate[]; summary: CertSummary } | null>(`/api/contracts/certificates/summary/${contract.id}`, null),
      j<ProjectLite[]>(`/api/projects/projects?contractId=${contract.id}`, []),
      j<QuotationLite[]>(`/api/crm/quotations`, []),
    ]);
    setObligations(Array.isArray(obl) ? obl : []);
    setBonds(Array.isArray(bnd) ? bnd : []);
    setCerts(certPayload?.certificates ?? []);
    setCertSummary(certPayload?.summary ?? null);
    const plist = Array.isArray(projects) ? projects : [];
    setProject(plist[0] ?? null);
    const qlist = Array.isArray(quotes) ? quotes : [];
    setQuotation(qlist.find((q) => q.convertedContractId === contract.id) ?? null);
  }, [contract.id]);

  useEffect(() => { void load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const openObl = obligations.filter((o) => o.status === 'open' || o.status === 'in_progress');
    const overdueObl = openObl.filter((o) => o.dueDate < today);
    const breached = obligations.filter((o) => o.status === 'breached');
    const activeBonds = bonds.filter((b) => b.status === 'active');
    const expiring = activeBonds.filter((b) => b.expiryDate && b.expiryDate <= soon);
    return {
      openObl: openObl.length,
      overdueObl: overdueObl.length,
      breached: breached.length,
      metObl: obligations.filter((o) => o.status === 'met').length,
      activeBonds: activeBonds.length,
      bondValue: activeBonds.reduce((s, b) => s + b.amount, 0),
      expiringBonds: expiring.length,
    };
  }, [obligations, bonds, today, soon]);

  const act = async (url: string, body: unknown, note?: string): Promise<void> => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Action failed'); return; }
      if (note) setMsg(note);
      await load();
      router.refresh();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const setContractStatus = (status: string): void => {
    void act(`/api/contracts/contracts/${contract.id}/status`, { status },
      status === 'active' ? 'Contract signed — the Project is being created on the deal chain.'
      : status === 'completed' ? 'Contract completed — release the remaining bonds and close out the project.'
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
            <h1 style={st.h1}>{contract.title}</h1>
            <span className={contract.status === 'active' ? 'badge badge-good' : contract.status === 'completed' ? 'badge badge-accent' : contract.status === 'cancelled' ? 'badge badge-bad' : 'badge'}>{contract.status}</span>
          </div>
          <div style={st.subline}>
            {contract.reference && <span style={{ fontFamily: 'ui-monospace, monospace' }}>{contract.reference}</span>}
            {contract.accountId
              ? <a href={`/crm/accounts/${contract.accountId}`} style={st.link}>{contract.accountName ?? 'Account'}</a>
              : contract.accountName && <span>{contract.accountName}</span>}
            <span>Awarded {fmt(contract.createdAt)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {contract.status === 'draft' && (
            <button className="btn btn-primary" style={st.actBtn} disabled={busy} onClick={() => setContractStatus('active')}>
              Activate / Sign → creates Project
            </button>
          )}
          {contract.status === 'active' && (
            <button className="btn" style={{ ...st.actBtn, color: 'var(--accent)' }} disabled={busy} onClick={() => setContractStatus('completed')}>
              Complete ✓
            </button>
          )}
          {(contract.status === 'draft' || contract.status === 'active') && (
            <button className="btn btn-ghost" style={st.actBtn} disabled={busy} onClick={() => setContractStatus('cancelled')}>Cancel</button>
          )}
          <a href={`/contracts/contracts/${contract.id}/print`} style={st.linkBtn}>🖨 Print</a>
        </div>
      </div>

      {/* commercial summary */}
      <div style={st.stats}>
        <Stat label="Contract value" value={`AED ${aed(contract.value)}`} strong />
        <Stat label="Certified to date" value={certSummary ? `AED ${aed(certSummary.grossCertifiedToDate)}` : '—'} />
        <Stat label="% complete" value={certSummary ? `${certSummary.percentComplete}%` : '—'} accent />
        <Stat label="Retention held" value={certSummary ? `AED ${aed(certSummary.retentionHeld)}` : '—'} />
        <Stat label="Obligations open" value={`${stats.openObl}${stats.overdueObl > 0 ? ` (${stats.overdueObl} overdue)` : ''}`} bad={stats.overdueObl > 0} />
        <Stat label="Breached" value={String(stats.breached)} bad={stats.breached > 0} />
        <Stat label="Active bonds" value={`${stats.activeBonds} · AED ${aed(stats.bondValue)}`} />
        <Stat label="Bonds expiring ≤30d" value={String(stats.expiringBonds)} bad={stats.expiringBonds > 0} />
      </div>

      {/* deal-chain strip */}
      <div style={st.chain}>
        {contract.tenderId
          ? <a href={`/tendering/tenders/${contract.tenderId}`} style={{ ...st.chainNode, ...st.chainOn }}>◳ Tender{contract.tenderTitle ? `: ${contract.tenderTitle}` : ''}</a>
          : <span style={st.chainNode}>◳ no tender (direct)</span>}
        <span style={st.arrow}>→</span>
        {quotation
          ? <a href="/crm/quotations" style={{ ...st.chainNode, ...st.chainOn }}>✎ {quotation.quoteNumber}</a>
          : <span style={st.chainNode}>✎ no quotation</span>}
        <span style={st.arrow}>→</span>
        <span style={{ ...st.chainNode, borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 800 }}>▤ CONTRACT</span>
        <span style={st.arrow}>→</span>
        {project
          ? <a href={`/projects/projects/${project.id}`} style={{ ...st.chainNode, ...st.chainOn, color: 'var(--good)' }}>▦ {project.title} ({project.status})</a>
          : <span style={st.chainNode}>▦ project appears on activation</span>}
      </div>

      {/* tabs */}
      <div style={st.tabs}>
        {([
          ['obligations', `Obligations & milestones (${obligations.length})`],
          ['bonds', `Bonds & guarantees (${bonds.length})`],
          ['certificates', `Payment certificates (${certs.length})`],
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} style={{ ...st.tab, ...(tab === id ? st.tabOn : {}) }} onClick={() => setTab(id)}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {tab === 'obligations' && (
          <CreateDrawer
            entity="Obligation"
            subtitle="A deliverable, milestone or compliance item this contract commits someone to — with a due date."
            endpoint="/api/contracts/obligations"
            fields={[
              { name: 'contractId', label: 'Contract id (fixed)', kind: 'text', defaultValue: contract.id, readonly: true },
              { name: 'contractTitle', label: 'Contract (fixed)', kind: 'text', defaultValue: contract.title, readonly: true },
              { name: 'title', label: 'Title', kind: 'text', required: true, placeholder: 'e.g. Submit performance bond', span: 2 },
              {
                name: 'obligationType', label: 'Type', kind: 'select', defaultValue: 'deliverable',
                options: ['deliverable', 'milestone', 'compliance', 'payment', 'insurance', 'other'].map((t) => ({ value: t, label: t })),
              },
              {
                name: 'responsibleParty', label: 'Responsible', kind: 'select', defaultValue: 'us',
                options: ['us', 'client', 'consultant', 'subcontractor', 'other'].map((t) => ({ value: t, label: t })),
              },
              { name: 'dueDate', label: 'Due date', kind: 'date', required: true },
              { name: 'description', label: 'Description', kind: 'textarea', span: 2 },
            ]}
          />
        )}
        {tab === 'bonds' && (
          <CreateDrawer
            entity="Bond"
            subtitle="A bank guarantee securing this contract — the expiry date is the commercial watchpoint."
            endpoint="/api/contracts/bonds"
            fields={[
              { name: 'contractId', label: 'Contract id (fixed)', kind: 'text', defaultValue: contract.id, readonly: true },
              {
                name: 'kind', label: 'Kind', kind: 'select', defaultValue: 'performance',
                options: Object.entries(BOND_KIND_LABEL).map(([v, l]) => ({ value: v, label: l })),
              },
              { name: 'reference', label: 'Guarantee no.', kind: 'text', required: true, placeholder: 'e.g. PB-2026-0042' },
              { name: 'bank', label: 'Bank', kind: 'text', placeholder: 'e.g. Emirates NBD' },
              { name: 'amount', label: 'Amount (AED)', kind: 'number', required: true },
              { name: 'issueDate', label: 'Issue date', kind: 'date' },
              { name: 'expiryDate', label: 'Expiry date', kind: 'date', hint: 'Watched — expiring bonds turn red on the register' },
              { name: 'notes', label: 'Notes', kind: 'textarea', span: 2 },
            ]}
          />
        )}
        {tab === 'certificates' && <a href="/contracts/certificates" style={st.linkBtn}>Open certificates register →</a>}
      </div>

      <section className="panel">
        {tab === 'obligations' && (
          obligations.length === 0 ? <p style={st.muted}>No obligations yet — add the contract's deliverables, milestones and compliance items.</p> : (
            <table className="data-table">
              <thead><tr>{['Type', 'Title', 'Responsible', 'Due', 'Status', 'Actions'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {obligations.map((o) => {
                  const overdue = (o.status === 'open' || o.status === 'in_progress') && o.dueDate < today;
                  return (
                    <tr key={o.id} style={o.status === 'waived' ? { opacity: 0.55 } : undefined}>
                      <td><span style={st.typeTag}>{o.obligationType}</span></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.title}</div>
                        {o.description && <div style={st.notes}>{o.description}</div>}
                      </td>
                      <td style={{ textTransform: 'capitalize', color: 'var(--muted)' }}>{o.responsibleParty}</td>
                      <td style={{ color: overdue ? 'var(--bad)' : 'var(--muted)', fontWeight: overdue ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {fmt(o.dueDate)}{overdue ? ' ✗' : ''}
                      </td>
                      <td>
                        <span className={o.status === 'met' ? 'badge badge-good' : o.status === 'breached' ? 'badge badge-bad' : 'badge'}>{o.status.replace('_', ' ')}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {(o.status === 'open' || o.status === 'in_progress') && (
                          <>
                            <button className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} disabled={busy}
                              onClick={() => void act(`/api/contracts/obligations/${o.id}/status`, { status: 'met' })}>Met ✓</button>
                            <button className="btn" style={{ ...st.smBtn, marginLeft: 6, color: 'var(--bad)' }} disabled={busy}
                              onClick={() => void act(`/api/contracts/obligations/${o.id}/status`, { status: 'breached' })}>Breach ✗</button>
                            <button className="btn btn-ghost" style={{ ...st.smBtn, marginLeft: 6 }} disabled={busy}
                              onClick={() => void act(`/api/contracts/obligations/${o.id}/status`, { status: 'waived' })}>Waive</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === 'bonds' && (
          bonds.length === 0 ? <p style={st.muted}>No bonds registered — add the performance bond and advance-payment guarantee.</p> : (
            <table className="data-table">
              <thead><tr>{['Kind', 'Reference', 'Bank', 'Amount', 'Issued', 'Expiry', 'Status', 'Actions'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {bonds.map((b) => {
                  const expSoon = b.status === 'active' && b.expiryDate && b.expiryDate <= soon && b.expiryDate >= today;
                  const expPast = b.status === 'active' && b.expiryDate && b.expiryDate < today;
                  return (
                    <tr key={b.id} style={b.status !== 'active' ? { opacity: 0.6 } : undefined}>
                      <td>{BOND_KIND_LABEL[b.kind] ?? b.kind}</td>
                      <td style={{ fontFamily: 'ui-monospace, monospace' }}>{b.reference}</td>
                      <td style={{ color: 'var(--muted)' }}>{b.bank ?? '—'}</td>
                      <td style={{ fontWeight: 600 }}>AED {aed(b.amount)}</td>
                      <td style={{ color: 'var(--muted)' }}>{b.issueDate ?? '—'}</td>
                      <td style={{ color: expPast ? 'var(--bad)' : expSoon ? 'var(--warn, #d97706)' : 'var(--muted)', fontWeight: expPast || expSoon ? 700 : 400 }}>
                        {b.expiryDate ?? '—'}{expSoon ? ' ⚠' : ''}{expPast ? ' ✗' : ''}
                      </td>
                      <td><span className={b.status === 'active' ? 'badge badge-good' : b.status === 'called' ? 'badge badge-bad' : 'badge'}>{b.status}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {b.status === 'active' && (
                          <>
                            <button className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} disabled={busy}
                              onClick={() => void act(`/api/contracts/bonds/${b.id}/status`, { action: 'release' }, `${b.reference} released.`)}>Release</button>
                            <button className="btn" style={{ ...st.smBtn, marginLeft: 6, color: 'var(--bad)' }} disabled={busy}
                              onClick={() => void act(`/api/contracts/bonds/${b.id}/status`, { action: 'call' })}>Called</button>
                            <button className="btn btn-ghost" style={{ ...st.smBtn, marginLeft: 6 }} disabled={busy}
                              onClick={() => void act(`/api/contracts/bonds/${b.id}/status`, { action: 'expire' })}>Expired</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === 'certificates' && (
          certs.length === 0 ? <p style={st.muted}>No payment certificates yet — raise IPC 1 from the certificates register.</p> : (
            <table className="data-table">
              <thead><tr>{['IPC', 'Reference', 'Gross to date', 'Net this cert.', 'Status', 'Raised'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {certs.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>#{c.sequence}</td>
                    <td style={{ fontFamily: 'ui-monospace, monospace' }}>{c.reference ?? '—'}</td>
                    <td>AED {aed(c.grossToDate)}</td>
                    <td style={{ fontWeight: 600 }}>AED {aed(c.netThisCertificate)}</td>
                    <td><span className={c.status === 'certified' || c.status === 'paid' ? 'badge badge-good' : 'badge'}>{c.status}</span></td>
                    <td style={{ color: 'var(--muted)' }}>{fmt(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  typeTag: { fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', textTransform: 'capitalize' } as CSSProperties,
  notes: { fontSize: 12, color: 'var(--muted)', marginTop: 2, maxWidth: 460 } as CSSProperties,
  smBtn: { padding: '4px 10px', fontSize: 12 } as CSSProperties,
};
