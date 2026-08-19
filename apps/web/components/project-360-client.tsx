'use client';

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProjectTeam from './project-team';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import AuraDataTable, { type AuraColumn } from './ui/aura-data-table';
import { DataDegradedNotice } from './ui/data-state';
import { RecordTabs, type TabDef } from './ui/record';

// Project 360 — delivery + commercial control in one place. The project
// INHERITS its commercial context from the chain (contract value → budget),
// tracks execution (variations, delays/EOT, EVM), and CLOSES the chain:
// finalizing closeout + completing the project completes the source contract.

export interface Project360Project {
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

type Tab = 'variations' | 'eot' | 'closeout' | 'team';

const aed = (n: number): string => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');
const fmt = (iso: string): string => new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE });

const CONTROL_TABS: TabDef[] = [
  { id: 'variations', label: 'Variations' },
  { id: 'eot', label: 'Delays & EOT' },
  { id: 'closeout', label: 'Closeout' },
  { id: 'team', label: 'Team' },
];

const VARIATION_COLUMNS: AuraColumn<Variation>[] = [
  { key: 'reference', label: 'Ref', priority: 'primary', sortable: true, render: (row) => <span style={{ fontFamily: 'ui-monospace, monospace' }}>{row.reference ?? '—'}</span> },
  { key: 'title', label: 'Title', sortable: true },
  { key: 'kind', label: 'Kind', sortable: true, render: (row) => <span style={{ textTransform: 'capitalize' }}>{row.kind}</span> },
  { key: 'value', label: 'Value', sortable: true, render: (row) => <strong style={{ color: row.value < 0 ? 'var(--bad)' : 'var(--text)' }}>AED {aed(row.value)}</strong> },
  { key: 'status', label: 'Status', sortable: true, render: (row) => <Status value={row.status} /> },
  { key: 'createdAt', label: 'Raised', priority: 'muted', sortable: true, render: (row) => fmt(row.createdAt) },
];

const EOT_COLUMNS: AuraColumn<EotClaim>[] = [
  { key: 'title', label: 'Claim', priority: 'primary', sortable: true },
  { key: 'daysRequested', label: 'Days requested', sortable: true },
  { key: 'daysGranted', label: 'Days granted', sortable: true, render: (row) => row.daysGranted ?? '—' },
  { key: 'status', label: 'Status', sortable: true, render: (row) => <Status value={row.status} /> },
  { key: 'createdAt', label: 'Raised', priority: 'muted', sortable: true, render: (row) => fmt(row.createdAt) },
];

export default function Project360Client({ project }: { project: Project360Project }) {
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
  const [loadFailures, setLoadFailures] = useState(0);

  const load = useCallback(async () => {
    let failures = 0;
    const j = async <T,>(url: string, fallback: T): Promise<T> => {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) { failures += 1; return fallback; }
        return (await r.json()) as T;
      } catch { failures += 1; return fallback; }
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
    setLoadFailures(failures);
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
    <div data-testid="project-controls-client">
      {err && <div role="alert" style={st.err}>{err}</div>}
      {msg && <div role="status" style={st.ok}>{msg}</div>}
      {loadFailures > 0 ? <DataDegradedNotice message={`${loadFailures} project-control data source${loadFailures === 1 ? ' is' : 's are'} unavailable. Available sections remain live.`} /> : null}

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
          <a href={`/project/${project.id}`} className="btn btn-primary" style={st.actBtn}>▦ Command center</a>
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
      <div style={st.controlRow}>
        <RecordTabs
          baseId="project-controls"
          tabs={CONTROL_TABS.map((item) => ({
            ...item,
            count: item.id === 'variations' ? variations.length : item.id === 'eot' ? eots.length : undefined,
          }))}
          active={tab}
          onChange={(id) => setTab(id as Tab)}
        />
        <div style={st.controlActions}>
        {tab === 'variations' && <a href="/projects/variations" style={st.linkBtn}>Variations register →</a>}
        {tab === 'closeout' && !closeout && (
          <button className="btn btn-primary" style={st.actBtn} disabled={busy}
            onClick={() => void call('/api/projects/closeouts', 'POST', { projectId: project.id, projectName: project.title }, 'Closeout checklist started.')}>
            Start closeout checklist
          </button>
        )}
        </div>
      </div>

      <section id="project-controls-panel" role="tabpanel" aria-labelledby={`project-controls-tab-${tab}`} tabIndex={0} className="panel">
        {tab === 'variations' && (
          <AuraDataTable
            ariaLabel="Project variations"
            columns={VARIATION_COLUMNS}
            data={variations}
            keyExtractor={(row) => row.id}
            searchFields={['reference', 'title', 'kind', 'status']}
            searchPlaceholder="Search variations…"
            pageSize={10}
            columnToggle
            emptyTitle="No variation orders"
            emptyDescription="Scope changes and their approved commercial impact will appear here."
          />
        )}

        {tab === 'eot' && (
          <AuraDataTable
            ariaLabel="Project delay and EOT claims"
            columns={EOT_COLUMNS}
            data={eots}
            keyExtractor={(row) => row.id}
            searchFields={['title', 'status']}
            searchPlaceholder="Search EOT claims…"
            pageSize={10}
            columnToggle
            emptyTitle="No EOT claims"
            emptyDescription="Time-impact claims from the project delay log will appear here."
          />
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

        {tab === 'team' && <ProjectTeam projectId={project.id} />}
      </section>
    </div>
  );
}

function Stat({ label, value, strong, accent, bad }: { label: string; value: string; strong?: boolean; accent?: boolean; bad?: boolean }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: strong ? 16 : 13.5, fontWeight: strong ? 800 : 600, color: bad ? 'var(--bad)' : accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const tone = /approved|granted|closed|completed/i.test(value) ? 'badge badge-good'
    : /rejected|cancelled|failed/i.test(value) ? 'badge badge-bad'
      : 'badge';
  return <span className={tone}>{value.replace(/_/g, ' ')}</span>;
}

const st = {
  err: { padding: '10px 12px', border: '1px solid var(--bad)', borderRadius: 10, color: 'var(--bad)', marginBottom: 12, fontSize: 13 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, color: 'var(--good)', marginBottom: 12, fontSize: 13 } as CSSProperties,
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 } as CSSProperties,
  h1: { fontSize: 24, margin: 0, color: 'var(--accent)' } as CSSProperties,
  subline: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)', marginTop: 6, alignItems: 'center' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  actBtn: { padding: '8px 14px', fontSize: 12.5, fontWeight: 700 } as CSSProperties,
  linkBtn: { minHeight: 44, display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap' } as CSSProperties,
  stats: { display: 'flex', gap: 22, flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', marginBottom: 12 } as CSSProperties,
  chain: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 16px', border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 14, fontSize: 12.5 } as CSSProperties,
  chainNode: { border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', color: 'var(--muted)', textDecoration: 'none' } as CSSProperties,
  chainOn: { color: 'var(--text)', borderColor: 'var(--accent)' } as CSSProperties,
  arrow: { color: 'var(--muted)' } as CSSProperties,
  controlRow: { display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 12 } as CSSProperties,
  controlActions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  checkRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderBottom: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' } as CSSProperties,
};
