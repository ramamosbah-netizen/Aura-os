'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import EmptyState from './ui/empty-state';

interface Project { id: string; title: string }

interface Checklist {
  omManuals: boolean;
  asBuilts: boolean;
  testCertificates: boolean;
  warrantyDocs: boolean;
  training: boolean;
  spares: boolean;
}

interface HandoverPackage {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  status: 'draft' | 'submitted' | 'accepted' | 'rejected';
  checklist: Checklist;
  submittedAt: string | null;
  acceptedAt: string | null;
  clientRepresentative: string | null;
  warrantyStartDate: string | null;
  warrantyMonths: number | null;
  remarks: string | null;
  systemsTotal: number;
  systemsCommissioned: number;
}

const CHECK_ITEMS: { key: keyof Checklist; label: string; core: boolean }[] = [
  { key: 'omManuals', label: 'O&M manuals', core: true },
  { key: 'asBuilts', label: 'As-built drawings', core: true },
  { key: 'testCertificates', label: 'Test & commissioning certificates', core: true },
  { key: 'warrantyDocs', label: 'Warranty documents', core: false },
  { key: 'training', label: 'Client training completed', core: false },
  { key: 'spares', label: 'Spares & consumables handed over', core: false },
];

export default function HandoverClient({
  initialPackages,
  projects,
}: {
  initialPackages: HandoverPackage[];
  projects: Project[];
}) {
  const [packages, setPackages] = useState<HandoverPackage[]>(initialPackages);
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [clientRep, setClientRep] = useState<Record<string, string>>({});
  const [warrantyMonths, setWarrantyMonths] = useState<Record<string, string>>({});

  const projName = projects.find((p) => p.id === projectId)?.title || null;
  const patch = (p: HandoverPackage) => setPackages((prev) => prev.map((x) => (x.id === p.id ? p : x)));

  async function call(url: string, method: string, body: unknown): Promise<HandoverPackage | null> {
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
      return data as HandoverPackage;
    } catch (e: any) {
      setError(e.message || 'Request failed');
      return null;
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !title.trim()) return;
    const created = await call('/api/commissioning/handovers', 'POST', { projectId, projectName: projName, code, title });
    if (created) { setPackages([created, ...packages]); setCode(''); setTitle(''); }
  }

  async function toggle(p: HandoverPackage, key: keyof Checklist) {
    const updated = await call(`/api/commissioning/handovers/${p.id}/checklist`, 'PUT', { [key]: !p.checklist[key] });
    if (updated) patch(updated);
  }
  async function submit(p: HandoverPackage) {
    const updated = await call(`/api/commissioning/handovers/${p.id}/submit`, 'PUT', {});
    if (updated) patch(updated);
  }
  async function accept(p: HandoverPackage) {
    const rep = clientRep[p.id];
    if (!rep?.trim()) { setError('A client representative is required to accept handover.'); return; }
    const months = warrantyMonths[p.id] ? Number(warrantyMonths[p.id]) : undefined;
    const updated = await call(`/api/commissioning/handovers/${p.id}/accept`, 'PUT', { clientRepresentative: rep, warrantyMonths: months });
    if (updated) patch(updated);
  }
  async function reject(p: HandoverPackage) {
    const reason = window.prompt(`Reason ${p.code} was rejected:`);
    if (!reason?.trim()) return;
    const updated = await call(`/api/commissioning/handovers/${p.id}/reject`, 'PUT', { reason });
    if (updated) patch(updated);
  }

  const kpi = {
    total: packages.length,
    accepted: packages.filter((p) => p.status === 'accepted').length,
    submitted: packages.filter((p) => p.status === 'submitted').length,
  };
  const statusStyle = (s: HandoverPackage['status']): CSSProperties =>
    s === 'accepted' ? st.tagGood : s === 'rejected' ? st.tagBad : s === 'submitted' ? st.tagInfo : st.tagPending;
  const coreReady = (c: Checklist) => c.omManuals && c.asBuilts && c.testCertificates;

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      <div style={st.kpiRow}>
        <div style={st.kpiCard}><span style={st.kpiNum}>{kpi.total}</span><span style={st.kpiLabel}>Packages</span></div>
        <div style={st.kpiCard}><span style={{ ...st.kpiNum, color: 'var(--good)' }}>{kpi.accepted}</span><span style={st.kpiLabel}>Accepted</span></div>
        <div style={st.kpiCard}><span style={{ ...st.kpiNum, color: 'var(--info)' }}>{kpi.submitted}</span><span style={st.kpiLabel}>Awaiting client</span></div>
      </div>

      <form onSubmit={handleCreate} style={st.formCard}>
        <h3 style={st.formTitle}>Start a handover package</h3>
        <div style={st.grid}>
          <div style={st.field}>
            <label style={st.label}>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={st.select}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div style={st.field}>
            <label style={st.label}>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. HO-001" style={st.input} required />
          </div>
          <div style={st.field}>
            <label style={st.label}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Tower A — final handover" style={st.input} required />
          </div>
        </div>
        <button type="submit" style={st.btn}>Create package</button>
      </form>

      <section style={st.panel}>
        <h3 style={st.panelTitle}>Handover Packages</h3>
        {packages.length === 0 ? (
          <EmptyState
            compact
            title="No handover packages yet"
            description="Start a package once a project's systems are commissioned. Compile the close-out deliverables, submit to the client, and record acceptance — which starts the warranty clock."
          />
        ) : (
          <div style={st.list}>
            {packages.map((p) => {
              const accepted = p.status === 'accepted';
              const commPct = p.systemsTotal > 0 ? Math.round((p.systemsCommissioned / p.systemsTotal) * 100) : 0;
              return (
                <div key={p.id} style={st.card}>
                  <div style={st.cardHead}>
                    <span style={st.code}>{p.code}</span>
                    <span style={statusStyle(p.status)}>{p.status}</span>
                  </div>
                  <h4 style={st.cardTitle}>{p.title}</h4>
                  <p style={st.meta}>
                    {p.projectName || '—'} · {p.systemsCommissioned}/{p.systemsTotal} systems commissioned ({commPct}%)
                  </p>

                  <div style={st.checkGrid}>
                    {CHECK_ITEMS.map((item) => (
                      <label key={item.key} style={{ ...st.check, opacity: accepted ? 0.7 : 1 }}>
                        <input
                          type="checkbox"
                          checked={p.checklist[item.key]}
                          disabled={accepted}
                          onChange={() => toggle(p, item.key)}
                        />
                        {item.label}{item.core ? <span style={st.coreStar} title="Required to submit"> *</span> : null}
                      </label>
                    ))}
                  </div>

                  {accepted ? (
                    <p style={st.signoff}>
                      ✓ Accepted {p.acceptedAt ? new Date(p.acceptedAt).toLocaleDateString() : ''} by <strong>{p.clientRepresentative}</strong>
                      {p.warrantyStartDate ? ` — warranty: ${p.warrantyMonths ?? 12} months from ${p.warrantyStartDate}` : ''}
                    </p>
                  ) : (
                    <div style={st.actions}>
                      {(p.status === 'draft' || p.status === 'rejected') && (
                        <button
                          onClick={() => submit(p)}
                          disabled={!coreReady(p.checklist)}
                          style={coreReady(p.checklist) ? st.btnSm : st.btnSmDisabled}
                          title={coreReady(p.checklist) ? 'Submit to client' : 'Attach O&M manuals, as-builts and test certificates first'}
                        >
                          Submit to client
                        </button>
                      )}
                      {p.status === 'submitted' && (
                        <div style={st.actionRow}>
                          <input placeholder="Client representative" value={clientRep[p.id] ?? ''} onChange={(e) => setClientRep({ ...clientRep, [p.id]: e.target.value })} style={st.smInput} />
                          <input type="number" min={0} placeholder="Warranty months (12)" value={warrantyMonths[p.id] ?? ''} onChange={(e) => setWarrantyMonths({ ...warrantyMonths, [p.id]: e.target.value })} style={{ ...st.smInput, maxWidth: 150 }} />
                          <button onClick={() => accept(p)} style={st.btnSmGood}>Accept ✓</button>
                          <button onClick={() => reject(p)} style={st.btnSmDanger}>Reject</button>
                        </div>
                      )}
                      {p.remarks && <p style={st.remarks}>Remarks: {p.remarks}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const st = {
  errorPanel: { background: 'var(--bad-soft)', color: 'var(--bad)', border: '1px solid var(--bad)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13.5 } as CSSProperties,
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 22 } as CSSProperties,
  kpiCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  kpiNum: { fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1 } as CSSProperties,
  kpiLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  formCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 24 } as CSSProperties,
  formTitle: { fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: 'var(--text)' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  select: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer' } as CSSProperties,
  btn: { background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' } as CSSProperties,
  panelTitle: { fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: 'var(--text)' } as CSSProperties,
  list: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'var(--panel-2)' } as CSSProperties,
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 12.5, fontWeight: 700, color: 'var(--text)' } as CSSProperties,
  cardTitle: { fontSize: 14.5, fontWeight: 600, margin: '2px 0 4px', color: 'var(--text)' } as CSSProperties,
  meta: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px' } as CSSProperties,
  checkGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '7px 16px', marginBottom: 12 } as CSSProperties,
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' } as CSSProperties,
  coreStar: { color: 'var(--accent)', fontWeight: 700 } as CSSProperties,
  signoff: { fontSize: 13, color: 'var(--good)', margin: '4px 0 0', background: 'var(--good-soft)', borderRadius: 8, padding: '8px 12px' } as CSSProperties,
  actions: { display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  actionRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  smInput: { flex: 1, minWidth: 150, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 12.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  btnSm: { background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 7, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)', cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'flex-start' } as CSSProperties,
  btnSmDisabled: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', cursor: 'not-allowed', whiteSpace: 'nowrap', alignSelf: 'flex-start' } as CSSProperties,
  btnSmGood: { background: 'var(--good)', border: '1px solid var(--good)', borderRadius: 7, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, color: '#04140b', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  btnSmDanger: { background: 'transparent', border: '1px solid var(--bad)', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--bad)', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  remarks: { fontSize: 12, color: 'var(--muted)', margin: '2px 0 0', fontStyle: 'italic' } as CSSProperties,
  tagGood: { fontSize: 11, background: 'var(--good-soft)', color: 'var(--good)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagBad: { fontSize: 11, background: 'var(--bad-soft)', color: 'var(--bad)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagInfo: { fontSize: 11, background: 'var(--info-soft)', color: 'var(--info)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagPending: { fontSize: 11, background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
};
