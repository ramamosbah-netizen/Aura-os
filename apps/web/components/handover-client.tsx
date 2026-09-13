'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import EmptyState from './ui/empty-state';
import Pager, { usePaged } from '@/components/ui/pager';
import ExportButton from './export-button';
import NextBestActionBanner from './ui/next-best-action-banner';
import SaveViewButton from './save-view-button';
import SignatureCanvas from './ui/signature-canvas';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

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
  /**
   * Readiness PROJECTED from the domains that own the evidence (TC-GATE-4). Two items are derived
   * and cannot be ticked; the other four are still assertions and say so on the page.
   */
  readiness?: {
    readyToSubmit: boolean;
    blocking: string[];
    items: { id: string; label: string; state: string; reason: string; source: string; evidence: 'projected' | 'asserted' }[];
  };
  submittedAt: string | null;
  acceptedAt: string | null;
  clientRepresentative: string | null;
  warrantyStartDate: string | null;
  warrantyMonths: number | null;
  remarks: string | null;
  systemsTotal: number;
  systemsCommissioned: number;
}

/**
 * THERE IS NOTHING LEFT TO TICK (TC-GATE-16).
 *
 * This list began as six checkboxes. Each gate removed one as its evidence found an owner —
 * commissioned systems and as-builts at TC-GATE-4, O&M and training at TC-GATE-5, warranty
 * certificates at TC-GATE-6, and spares last, at TC-GATE-16. The API refuses every key, so a
 * checkbox here could now only ever produce an error, and a control that always errors is worse than
 * no control: it invites someone to try, fail, and conclude the app is broken.
 *
 * The list is kept, empty and typed, rather than deleted: it is where a future tickable item would
 * go, and its emptiness is the statement.
 */
const CHECK_ITEMS: { key: keyof Checklist; label: string; core: boolean }[] = [];

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
  // The acceptance register grows for the life of a project; paged so the open ones are not
  // buried under every package already accepted.
  const page = usePaged(packages);

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
  // Submission eligibility is the BACKEND's assessment, not a re-derivation from the checkboxes —
  // so the button cannot offer something the API will refuse, and cannot hide something it allows.
  const coreReady = (p: HandoverPackage) => p.readiness?.readyToSubmit ?? false;
  const blockedReason = (p: HandoverPackage) =>
    (p.readiness?.items ?? []).filter((i) => i.state !== 'READY').map((i) => `${i.label}: ${i.reason}`).join(' ') ||
    'Readiness has not been assessed.';

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      <div style={st.kpiRow}>
        <div style={st.kpiCard}><span style={st.kpiNum}>{kpi.total}</span><span style={st.kpiLabel}>Packages</span></div>
        <div style={st.kpiCard}><span style={{ ...st.kpiNum, color: 'var(--good)' }}>{kpi.accepted}</span><span style={st.kpiLabel}>Accepted</span></div>
        <div style={st.kpiCard}><span style={{ ...st.kpiNum, color: 'var(--info)' }}>{kpi.submitted}</span><span style={st.kpiLabel}>Awaiting client</span></div>
        <div style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', gap: 8 }}>
          <SaveViewButton />
          <ExportButton
            filename="handover-packages"
            title="Handover Packages Register"
            rows={packages as unknown as Array<Record<string, unknown>>}
            columns={[
              { key: 'code', label: 'Code' },
              { key: 'title', label: 'Title' },
              { key: 'projectName', label: 'Project' },
              { key: 'clientRepresentative', label: 'Client Rep' },
              { key: 'status', label: 'Status' },
            ]}
          />
        </div>
      </div>

      <section style={st.readinessPanel} aria-labelledby="handover-readiness-heading">
        <div style={st.readinessCopy}>
          <div style={st.readinessEyebrow}>HANDOVER READINESS</div>
          <h3 id="handover-readiness-heading" style={st.readinessTitle}>Evidence gates for acceptance</h3>
          <p style={st.readinessDescription}>
            <strong>Every one of these is derived from the domain that owns the evidence</strong> — Testing &amp; Commissioning for
            the systems, Quality for the snags, document control for the as-builts, and this workspace&rsquo;s own O&amp;M pack,
            training record and spares record for the rest. <strong>Nothing here can be ticked.</strong> A domain that cannot
            be read reads UNKNOWN and blocks the submission rather than passing.
          </p>
        </div>
        <div style={st.readinessGrid} data-testid="handover-readiness">
          {packages.length === 0 ? (
            <div style={st.readinessItem}><span style={st.readinessLabel}>No packages</span><strong style={st.readinessUnknown}>Not established</strong></div>
          ) : (
            (packages[0].readiness?.items ?? []).map((item) => (
              <div key={item.id} style={st.readinessItem} data-testid={`handover-item-${item.id}`}>
                <span style={st.readinessLabel}>
                  {item.label}
                  <small style={{ display: 'block', opacity: 0.7 }}>
                    {item.evidence === 'projected' ? `derived · ${item.source}` : 'asserted · nothing verifies this'}
                  </small>
                  {/* The reason, inline — the same treatment the T&C chain gives its gates. A state on
                      its own is a colour; "none marked as-built" is the sentence to act on. */}
                  <small style={st.readinessReason} title={item.reason}>{item.reason}</small>
                </span>
                <strong
                  style={item.state === 'READY' ? st.readinessGood : item.state === 'BLOCKED' ? st.readinessOpen : st.readinessUnknown}
                  data-testid={`handover-item-${item.id}-state`}
                  title={item.reason}
                >
                  {item.state}
                </strong>
              </div>
            ))
          )}
        </div>
      </section>

      <div style={{ marginBottom: 20 }}>
        <NextBestActionBanner
          status={kpi.submitted > 0 ? 'Awaiting Client Sign-Off' : kpi.accepted > 0 ? 'Warranty DLP Clock Active' : 'Close-Out Compilation'}
          recommendedAction={kpi.submitted > 0 ? 'Obtain Client Representative Signature' : 'Compile Deliverables & Submit Handover Package'}
          explanation={
            kpi.submitted > 0
              ? 'Complete client walk-down, attach O&M/as-builts, and capture client representative digital acceptance.'
              : 'Compile O&M manuals, as-built drawings, and commissioning certificates for client review.'
          }
        />
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
          <>
          <div style={st.list} data-testid="handover-package-list">
            {page.slice.map((p) => {
              const accepted = p.status === 'accepted';
              const commPct = p.systemsTotal > 0 ? Math.round((p.systemsCommissioned / p.systemsTotal) * 100) : 0;
              return (
                <div key={p.id} style={st.card}>
                  <div style={st.cardHead}>
                    <span style={st.code} title={p.code}>{p.code}</span>
                    <span style={statusStyle(p.status)}>{p.status}</span>
                  </div>
                  <h4 style={st.cardTitle} title={p.title}>{p.title}</h4>
                  <p style={st.meta}>
                    {p.projectName || '—'} · {p.systemsCommissioned}/{p.systemsTotal} systems commissioned ({commPct}%)
                  </p>

                  <div style={st.checkGrid} data-testid={`handover-checklist-${p.code}`}>
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
                    {/* Said where the ticks used to be: the items that left this list did not become
                        optional — they became evidence, one gate at a time, and spares was the last. */}
                    <span style={st.derivedNote} data-testid={`handover-derived-note-${p.code}`}>
                      There is nothing to tick. Commissioned systems, Quality snags, as-built drawings, O&amp;M
                      deliverables, warranty certificates, client training and <strong>spares</strong> are all
                      <strong> derived</strong> from the domains that hold the evidence, and are shown in handover
                      readiness above.
                    </span>
                  </div>

                  {accepted ? (
                    <p style={st.signoff}>
                      ✓ Accepted {p.acceptedAt ? new Date(p.acceptedAt).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE }) : ''} by <strong>{p.clientRepresentative}</strong>
                      {p.warrantyStartDate ? ` — warranty: ${p.warrantyMonths ?? 12} months from ${p.warrantyStartDate}` : ''}
                    </p>
                  ) : (
                    <div style={st.actions}>
                      {(p.status === 'draft' || p.status === 'rejected') && (
                        <button
                          onClick={() => submit(p)}
                          disabled={!coreReady(p)}
                          style={coreReady(p) ? st.btnSm : st.btnSmDisabled}
                          title={coreReady(p) ? 'Submit to client' : blockedReason(p)}
                          data-testid={`handover-submit-${p.code}`}
                        >
                          Submit to client
                        </button>
                      )}
                      {p.status === 'submitted' && (
                        <>
                          <div style={st.actionRow}>
                            <input placeholder="Client representative" value={clientRep[p.id] ?? ''} onChange={(e) => setClientRep({ ...clientRep, [p.id]: e.target.value })} style={st.smInput} />
                            <input type="number" min={0} placeholder="Warranty months (12)" value={warrantyMonths[p.id] ?? ''} onChange={(e) => setWarrantyMonths({ ...warrantyMonths, [p.id]: e.target.value })} style={{ ...st.smInput, maxWidth: 150 }} />
                            <button onClick={() => accept(p)} style={st.btnSmGood}>Accept ✓</button>
                            <button onClick={() => reject(p)} style={st.btnSmDanger}>Reject</button>
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <SignatureCanvas label="Client Representative Acceptance Signature" onChange={() => {}} height={110} />
                          </div>
                        </>
                      )}
                      {p.remarks && <p style={st.remarks}>Remarks: {p.remarks}</p>}
                      <div style={{ marginTop: 8 }}>
                        <a href={`/handover/${p.id}/print`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                          🖨 Print Handover Certificate (PDF) →
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pager state={page} label="packages" testId="handover-packages-pager" />
          </>
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
  readinessPanel: { display: 'grid', gridTemplateColumns: 'minmax(230px, 0.8fr) minmax(0, 1.6fr)', gap: 18, alignItems: 'center', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 20 } as CSSProperties,
  readinessCopy: { minWidth: 0 } as CSSProperties,
  readinessEyebrow: { color: 'var(--accent)', fontSize: 10.5, fontWeight: 800, letterSpacing: 1.1, marginBottom: 5 } as CSSProperties,
  readinessTitle: { margin: 0, fontSize: 15, color: 'var(--text)' } as CSSProperties,
  readinessDescription: { margin: '6px 0 0', color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.45 } as CSSProperties,
  readinessGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 } as CSSProperties,
  readinessItem: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', minWidth: 0 } as CSSProperties,
  readinessLabel: { display: 'block', color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.3, minHeight: 29, minWidth: 0 } as CSSProperties,
  // Two lines, not one: "none marked as-built" fits, and a reason naming three systems still shows
  // enough of itself to be recognised. Truncation that hides everything is not containment.
  readinessReason: {
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
    opacity: 0.85, marginTop: 2,
  } as CSSProperties,
  readinessGood: { display: 'block', color: 'var(--good)', fontSize: 12, marginTop: 4 } as CSSProperties,
  readinessOpen: { display: 'block', color: 'var(--warn)', fontSize: 12, marginTop: 4 } as CSSProperties,
  readinessUnknown: { display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 4 } as CSSProperties,
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
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6, minWidth: 0 } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 12.5, fontWeight: 700, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  cardTitle: { fontSize: 14.5, fontWeight: 600, margin: '2px 0 4px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  meta: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px' } as CSSProperties,
  checkGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '7px 16px', marginBottom: 12 } as CSSProperties,
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' } as CSSProperties,
  derivedNote: { gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 } as CSSProperties,
  coreStar: { color: 'var(--accent)', fontWeight: 700 } as CSSProperties,
  signoff: { fontSize: 13, color: 'var(--good)', margin: '4px 0 0', background: 'var(--good-soft)', borderRadius: 8, padding: '8px 12px' } as CSSProperties,
  actions: { display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  actionRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  smInput: { flex: 1, minWidth: 150, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 12.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  btnSm: { background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 7, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)', cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'flex-start' } as CSSProperties,
  btnSmDisabled: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', cursor: 'not-allowed', whiteSpace: 'nowrap', alignSelf: 'flex-start' } as CSSProperties,
  btnSmGood: { background: 'var(--good)', border: '1px solid var(--good)', borderRadius: 7, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  btnSmDanger: { background: 'transparent', border: '1px solid var(--bad)', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--bad)', cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  remarks: { fontSize: 12, color: 'var(--muted)', margin: '2px 0 0', fontStyle: 'italic' } as CSSProperties,
  tagGood: { fontSize: 11, background: 'var(--good-soft)', color: 'var(--good)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagBad: { fontSize: 11, background: 'var(--bad-soft)', color: 'var(--bad)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagInfo: { fontSize: 11, background: 'var(--info-soft)', color: 'var(--info)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
  tagPending: { fontSize: 11, background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 6, padding: '2px 8px', fontWeight: 600, textTransform: 'capitalize' } as CSSProperties,
};
