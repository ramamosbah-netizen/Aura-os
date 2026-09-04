'use client';

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarRange, CircleDollarSign, FileCheck2, Gauge, GitBranch, ShieldAlert } from 'lucide-react';
import ProjectTeam from './project-team';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import AuraDataTable, { type AuraColumn } from './ui/aura-data-table';
import { DataDegradedNotice } from './ui/data-state';
import { RecordTabs, type TabDef } from './ui/record';
import clientStyles from './project-360-client.module.css';
import AuraTabLink from './aura-tab-link';

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
  origin?: string | null;
  handoverId?: string | null;
  handoverSnapshotHash?: string | null;
  handoverLockedAt?: string | null;
  handoverSnapshot?: {
    schemaVersion?: number;
    source?: Record<string, unknown>;
    sourceItems?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  } | null;
  originalContractValue?: number | null;
  currency?: string | null;
  commercialBaselineId?: string | null;
  wbsBaselineSnapshot?: { baselineId?: string; approvedAt?: string; originalBac?: number; allocations?: Array<{ nodeId: string; code: string; title: string; plannedValue: number }> } | null;
}
interface Variation { id: string; reference: string | null; title: string; kind: string; value: number; status: string; createdAt: string; }
interface VariationImpact { originalValue: number; approvedAdditions: number; approvedOmissions: number; revisedValue: number; pendingValue: number; }
interface DelayEvent { id: string; title: string; causeCategory: string; startDate: string; endDate: string | null; delayDays: number; isConcurrent: boolean; linkedActivityCode: string | null; status: string; createdAt: string; }
interface EotClaim { id: string; title: string; submittedDays: number; approvedDays: number; status: string; createdAt: string; justification?: string | null; delayEventIds?: string[]; }
interface CloseoutItem { label: string; done: boolean; }
interface Closeout { id: string; status: string; items: CloseoutItem[]; handoverDate: string | null; dlpEndDate: string | null; }
interface Evm {
  budgetAtCompletion: number | null;
  plannedValue: number | null;
  earnedValue: number | null;
  actualCost: number | null;
  costVariance: number | null;
  scheduleVariance: number | null;
  cpi: number | null;
  spi: number | null;
  plannedValueStatus: 'available' | 'unavailable';
}
interface CertSummary { grossCertifiedToDate: number; retentionHeld: number; percentComplete: number; }

interface WbsNode { id: string; projectId: string; parentId: string | null; code: string; title: string; plannedValue: number; plannedValueKnown?: boolean; earnedValue: number; actualCost: number; progress: number; status: string; boqItemId: string | null; }
interface CbsNode { id: string; projectId: string; parentId: string | null; code: string; title: string; category: string; budgetAmount: number; committedAmount: number; actualAmount: number; forecastAmount: number; currency: string; }
interface DeliveryMap { id: string; projectId: string; handoverId: string; frozenItemKey: string; sourceKind: string; sourceId: string | null; sourceRevisionRef: string | null; sourceItemId: string | null; wbsNodeId: string | null; cbsNodeId: string | null; createdAt: string; }
interface QuantityTxn { id: string; boqItemId: string; type: string; quantity: number; unit: string | null; source: string; sourceRef: string | null; semantic: string | null; occurredAt: string; dedupeKey: string | null; }
interface CostTxn { id: string; cbsNodeId: string | null; wbsNodeId: string | null; type: 'budget' | 'committed' | 'actual'; amount: number; baseAmount?: number | null; baseCurrency?: string | null; source: string; sourceRef: string | null; occurredAt: string; dedupeKey: string | null; }

type Tab = 'overview' | 'variations' | 'delivery' | 'quantities' | 'cost' | 'eot' | 'closeout' | 'team';

const aed = (n: number): string => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');
const fmt = (iso: string): string => new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE });

const CONTROL_TABS: TabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'variations', label: 'Variations' },
  { id: 'delivery', label: 'WBS / CBS' },
  { id: 'quantities', label: 'Quantities' },
  { id: 'cost', label: 'Cost / EVM' },
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
  { key: 'submittedDays', label: 'Days requested', sortable: true },
  { key: 'approvedDays', label: 'Days granted', sortable: true, render: (row) => row.approvedDays || '—' },
  { key: 'status', label: 'Status', sortable: true, render: (row) => <Status value={row.status} /> },
  { key: 'createdAt', label: 'Raised', priority: 'muted', sortable: true, render: (row) => fmt(row.createdAt) },
];

export default function Project360Client({ project, initialTab }: { project: Project360Project; initialTab?: string }) {
  const router = useRouter();
  const [variations, setVariations] = useState<Variation[]>([]);
  const [impact, setImpact] = useState<VariationImpact | null>(null);
  const [delays, setDelays] = useState<DelayEvent[]>([]);
  const [eots, setEots] = useState<EotClaim[]>([]);
  const [closeout, setCloseout] = useState<Closeout | null>(null);
  const [evm, setEvm] = useState<Evm | null>(null);
  const [certs, setCerts] = useState<CertSummary | null>(null);
  const [wbs, setWbs] = useState<WbsNode[]>([]);
  const [cbs, setCbs] = useState<CbsNode[]>([]);
  const [maps, setMaps] = useState<DeliveryMap[]>([]);
  const [quantities, setQuantities] = useState<QuantityTxn[]>([]);
  const [costs, setCosts] = useState<CostTxn[]>([]);
  const validInitialTab = CONTROL_TABS.some((item) => item.id === initialTab) ? initialTab as Tab : 'overview';
  const [tab, setTab] = useState<Tab>(validInitialTab);
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
    const [vs, imp, eot, delayData, cls, evmData, certSummary, wbsData, cbsData, mapData, quantityData, costData] = await Promise.all([
      j<Variation[]>(`/api/projects/variations?projectId=${project.id}`, []),
      j<{ impact: VariationImpact } | null>(`/api/projects/variations/summary/${project.id}`, null),
      j<EotClaim[]>(`/api/projects/eot-claims?projectId=${project.id}`, []),
      j<DelayEvent[]>(`/api/projects/delays?projectId=${project.id}`, []),
      j<Closeout[]>(`/api/projects/closeouts?projectId=${project.id}`, []),
      j<Evm | null>(`/api/projects/projects/${project.id}/evm`, null),
      project.contractId ? j<{ summary: CertSummary } | null>(`/api/contracts/certificates/summary/${project.contractId}`, null) : Promise.resolve(null),
      j<WbsNode[]>(`/api/projects/wbs?projectId=${project.id}`, []),
      j<CbsNode[]>(`/api/projects/cbs?projectId=${project.id}`, []),
      j<DeliveryMap[]>(`/api/projects/delivery-item-maps?projectId=${project.id}`, []),
      j<QuantityTxn[]>(`/api/projects/quantity-ledger?projectId=${project.id}&limit=500`, []),
      j<CostTxn[]>(`/api/projects/cost-ledger?projectId=${project.id}&limit=500`, []),
    ]);
    setVariations(Array.isArray(vs) ? vs : []);
    setImpact(imp?.impact ?? null);
    setEots(Array.isArray(eot) ? eot : []);
    setDelays(Array.isArray(delayData) ? delayData : []);
    setCloseout((Array.isArray(cls) ? cls : [])[0] ?? null);
    setEvm(evmData && (evmData.earnedValue === null || Number.isFinite(evmData.earnedValue)) ? evmData : null);
    setCerts(certSummary?.summary ?? null);
    setWbs(Array.isArray(wbsData) ? wbsData : []);
    setCbs(Array.isArray(cbsData) ? cbsData : []);
    setMaps(Array.isArray(mapData) ? mapData : []);
    setQuantities(Array.isArray(quantityData) ? quantityData : []);
    setCosts(Array.isArray(costData) ? costData : []);
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
    <div data-testid="project-controls-client" className={clientStyles.root}>
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
        <Stat label="Certified %" value={certs ? `${certs.percentComplete}%` : '—'} />
        {evm && <Stat label="BAC" value={evm.budgetAtCompletion === null ? 'Unavailable' : `AED ${aed(evm.budgetAtCompletion)}`} />}
        {evm && <Stat label="Earned value" value={evm.earnedValue === null ? 'Unavailable' : `AED ${aed(evm.earnedValue)}`} />}
        {evm && <Stat label="AC" value={evm.actualCost === null ? 'Unavailable' : `AED ${aed(evm.actualCost)}`} />}
        {evm && <Stat label="CPI" value={evm.cpi === null ? 'Unavailable' : evm.cpi.toFixed(2)} accent bad={evm.cpi !== null && evm.cpi < 1} />}
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
        {tab === 'overview' && <ControlsOverviewPanel project={project} wbs={wbs} cbs={cbs} maps={maps} variations={variations} impact={impact} evm={evm} closeout={closeout} closeoutDone={closeoutDone} />}
        {tab === 'delivery' && <DeliveryPanel project={project} wbs={wbs} cbs={cbs} maps={maps} busy={busy} call={call} />}

        {tab === 'quantities' && <QuantityPanel quantities={quantities} maps={maps} />}

        {tab === 'cost' && <CostPanel costs={costs} evm={evm} />}

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

        {tab === 'eot' && <DelayEotPanel projectId={project.id} delays={delays} eots={eots} busy={busy} call={call} />}

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

type Action = (url: string, method: string, body?: unknown, note?: string) => Promise<boolean>;

function ControlsOverviewPanel({ project, wbs, cbs, maps, variations, impact, evm, closeout, closeoutDone }: { project: Project360Project; wbs: WbsNode[]; cbs: CbsNode[]; maps: DeliveryMap[]; variations: Variation[]; impact: VariationImpact | null; evm: Evm | null; closeout: Closeout | null; closeoutDone: number }) {
  const base = `/project/${encodeURIComponent(project.id)}/controls`;
  const pendingChanges = impact ? `AED ${aed(impact.pendingValue)}` : variations.length ? `${variations.length} records` : 'Not established';
  const closeoutValue = closeout ? `${closeoutDone}/${closeout.items.length}` : 'Not established';
  return (
    <div className={clientStyles.controlsOverview} data-testid="project-controls-overview">
      <section className={clientStyles.controlsHero}>
        <div><span className={clientStyles.kicker}>PROJECT CONTROLS / OVERVIEW</span><h2>The signals that keep delivery governed</h2><p>One concise control view for structure, schedule, cost, change and closeout. Open a domain workspace to author the next decision.</p></div>
        <span className={clientStyles.authorityBadge}>Projects authority</span>
      </section>

      <section className={clientStyles.controlSummary} aria-label="Project control health">
        <div><span>WBS / CBS</span><strong>{wbs.length || '—'}</strong><small>{wbs.length ? `${wbs.length} WBS · ${cbs.length} CBS nodes` : 'Not established'}</small></div>
        <div><span>Schedule health</span><strong className={clientStyles.muted}>Unavailable</strong><small>No trusted SPI or time-phased baseline</small></div>
        <div><span>Pending change</span><strong>{pendingChanges}</strong><small>{impact ? 'Awaiting governed decision' : 'No impact projection'}</small></div>
        <div><span>Closeout</span><strong>{closeoutValue}</strong><small>{closeout ? closeout.status.replace(/_/g, ' ') : 'Not started'}</small></div>
      </section>

      <section className={clientStyles.controlAreas} aria-labelledby="control-areas-title">
        <div className={clientStyles.sectionHeading}><div><span className={clientStyles.kicker}>CONTROL AREAS</span><h2 id="control-areas-title">Open the source workspace</h2></div><span className={clientStyles.sectionHint}>Each area remains owned by its canonical authority.</span></div>
        <div className={clientStyles.controlAreaGrid}>
          <ControlArea icon={GitBranch} title="WBS / CBS" detail={wbs.length ? `${wbs.length} WBS nodes · ${cbs.length} CBS nodes` : 'Structure not established'} links={[['Open WBS & CBS', `${base}?tab=delivery`, 'WBS / CBS'], ['Open schedule', `/projects/schedule?projectId=${project.id}`, 'Plan & schedule']]} />
          <ControlArea icon={CalendarRange} title="Plan & schedule" detail="Gantt, baseline and progress evidence" links={[["Open Gantt schedule", `/projects/schedule?projectId=${project.id}`, 'Plan & schedule']]} />
          <ControlArea icon={GitBranch} title="Changes & claims" detail={variations.length ? `${variations.length} variation record${variations.length === 1 ? '' : 's'}` : 'No change records established'} links={[["Review variations", `${base}?tab=variations`, 'Variations'], ["Open delays & EOT", `${base}?tab=eot`, 'Delays & EOT']]} />
          <ControlArea icon={CircleDollarSign} title="Cost & EVM" detail={evm?.actualCost == null ? 'Cost ledger not established' : `Actual AED ${aed(evm.actualCost)}`} links={[["Open cost ledger", `${base}?tab=cost`, 'Cost / EVM']]} />
          <ControlArea icon={FileCheck2} title="Quantities & certification" detail="Trace executed quantities to source records" links={[["Open quantity ledger", `${base}?tab=quantities`, 'Quantities']]} />
          <ControlArea icon={ShieldAlert} title="Closeout & decisions" detail={closeout ? `${closeoutDone}/${closeout.items.length} checklist items complete` : 'Closeout not started'} links={[["Open closeout", `${base}?tab=closeout`, 'Closeout'], ["Open approvals", `${base}?tab=team`, 'Approvals']]} />
        </div>
      </section>

      <div className={clientStyles.controlTruth}><Gauge size={16} aria-hidden /><span>Health signals are projections from connected authorities. Unavailable means the source cannot prove a schedule or cost status.</span></div>
    </div>
  );
}

function ControlArea({ icon: Icon, title, detail, links }: { icon: typeof GitBranch; title: string; detail: string; links: Array<[string, string, string]> }) {
  return <article className={clientStyles.controlArea}><span className={clientStyles.controlAreaIcon}><Icon size={16} /></span><div><h3>{title}</h3><p>{detail}</p></div><div className={clientStyles.controlAreaLinks}>{links.map(([label, href, tabTitle]) => <AuraTabLink key={label} href={href} tabTitle={tabTitle} tabType="Project Controls">{label}<ArrowRight size={13} /></AuraTabLink>)}</div></article>;
}

function DeliveryPanel({ project, wbs, cbs, maps, busy, call }: { project: Project360Project; wbs: WbsNode[]; cbs: CbsNode[]; maps: DeliveryMap[]; busy: boolean; call: Action }) {
  const snapshot = project.handoverSnapshot;
  const [wbsCode, setWbsCode] = useState('');
  const [wbsTitle, setWbsTitle] = useState('');
  const [wbsValue, setWbsValue] = useState('');
  const [cbsCode, setCbsCode] = useState('');
  const [cbsTitle, setCbsTitle] = useState('');
  const [cbsBudget, setCbsBudget] = useState('');
  const [cbsCategory, setCbsCategory] = useState('direct');
  const [cbsNotes, setCbsNotes] = useState('');
  const [editingCbs, setEditingCbs] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('direct');
  const [editNotes, setEditNotes] = useState('');

  const createWbs = async (): Promise<void> => {
    if (!wbsCode.trim() || !wbsTitle.trim()) return;
    const plannedValue = wbsValue.trim() ? Number(wbsValue) : undefined;
    if (plannedValue !== undefined && !Number.isFinite(plannedValue)) return;
    if (await call('/api/projects/wbs', 'POST', { projectId: project.id, code: wbsCode.trim(), title: wbsTitle.trim(), plannedValue }, 'WBS node created.')) {
      setWbsCode(''); setWbsTitle(''); setWbsValue('');
    }
  };
  const createCbs = async (): Promise<void> => {
    if (!cbsCode.trim() || !cbsTitle.trim()) return;
    const budget = cbsBudget.trim() ? Number(cbsBudget) : 0;
    if (!Number.isFinite(budget) || budget < 0) return;
    if (await call('/api/projects/cbs', 'POST', { projectId: project.id, code: cbsCode.trim(), title: cbsTitle.trim(), category: cbsCategory, budgetAmount: budget, notes: cbsNotes }, 'CBS node created.')) {
      setCbsCode(''); setCbsTitle(''); setCbsBudget(''); setCbsNotes('');
    }
  };
  const beginCbsEdit = (node: CbsNode): void => { setEditingCbs(node.id); setEditTitle(node.title); setEditCategory(node.category); setEditNotes(''); };
  const saveCbsEdit = async (id: string): Promise<void> => {
    if (!editTitle.trim()) return;
    if (await call(`/api/projects/cbs/${id}`, 'PATCH', { title: editTitle.trim(), category: editCategory, notes: editNotes }, 'CBS metadata updated.')) setEditingCbs(null);
  };
  return (
    <div style={{ display: 'grid', gap: 18 }} data-testid="project-delivery-panel">
      <section className={clientStyles.wbsHero} aria-labelledby="wbs-workspace-title">
        <div>
          <span className={clientStyles.kicker}>PLAN &amp; CONTROL / WBS + CBS</span>
          <h2 id="wbs-workspace-title">Build the delivery control structure</h2>
          <p>Keep work packages, cost codes and handover mapping aligned. Projects remains the canonical writer for every change.</p>
        </div>
        <span className={clientStyles.authorityBadge}>Projects authority</span>
      </section>
      <section className={clientStyles.wbsSummary} aria-label="WBS and CBS summary">
        <div><span>WBS nodes</span><strong>{wbs.length || '—'}</strong><small>{wbs.length ? 'work packages connected' : 'Not established'}</small></div>
        <div><span>CBS nodes</span><strong>{cbs.length || '—'}</strong><small>{cbs.length ? 'cost codes connected' : 'Not established'}</small></div>
        <div><span>Mapped items</span><strong>{maps.length || '—'}</strong><small>{maps.length ? 'frozen handover links' : 'Not established'}</small></div>
        <div><span>Schedule health</span><strong className={clientStyles.muted}>Unavailable</strong><small>No trusted SPI or time-phased baseline</small></div>
      </section>
      <div>
        <h2 style={panelTitle}>Commercial handover</h2>
        <div style={detailGrid}>
          <Detail label="Origin" value={project.origin ?? 'unknown'} />
          <Detail label="Handover" value={project.handoverId ?? 'Unavailable'} mono />
          <Detail label="Snapshot hash" value={project.handoverSnapshotHash ?? 'Unavailable'} mono />
          <Detail label="Locked at" value={project.handoverLockedAt ? fmt(project.handoverLockedAt) : 'Unavailable'} />
          <Detail label="Source items" value={snapshot?.sourceItems ? String(snapshot.sourceItems.length) : 'Unknown'} />
          <Detail label="Commercial baseline" value={project.commercialBaselineId ?? 'Unavailable'} mono />
        </div>
      </div>
      <div>
        <h2 style={panelTitle}>Frozen item mapping</h2>
        {maps.length === 0 ? <p style={st.muted}>No DeliveryItemMap rows yet. Mapping is an explicit governed step after handover.</p> : (
          <SimpleTable ariaLabel="Frozen delivery item mappings" headers={['Frozen item', 'Source', 'WBS', 'CBS', 'Created']}>
            {maps.map((row) => <tr key={row.id}><td style={cellMono}>{row.frozenItemKey}</td><td>{row.sourceKind}{row.sourceItemId ? ` · ${row.sourceItemId}` : ''}</td><td style={cellMono}>{row.wbsNodeId ?? '—'}</td><td style={cellMono}>{row.cbsNodeId ?? '—'}</td><td>{fmt(row.createdAt)}</td></tr>)}
          </SimpleTable>
        )}
      </div>
      <div>
        <h2 style={panelTitle}>WBS / CBS structure</h2>
        <div style={authoringGrid}>
          <form data-testid="wbs-authoring-form" onSubmit={(e) => { e.preventDefault(); void createWbs(); }} style={authoringCard}>
            <h3 style={formTitle}>Add WBS node</h3>
            <input aria-label="WBS code" placeholder="Code (e.g. 1.1)" value={wbsCode} onChange={(e) => setWbsCode(e.target.value)} />
            <input aria-label="WBS title" placeholder="Work package" value={wbsTitle} onChange={(e) => setWbsTitle(e.target.value)} />
            <input aria-label="WBS planned value" type="number" min="0" step="0.01" placeholder="BAC allocation (optional)" value={wbsValue} onChange={(e) => setWbsValue(e.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={busy}>Create WBS</button>
            <small style={st.muted}>Blank BAC remains Unknown; no progress or actual-cost editing is exposed here.</small>
          </form>
          <form data-testid="cbs-authoring-form" onSubmit={(e) => { e.preventDefault(); void createCbs(); }} style={authoringCard}>
            <h3 style={formTitle}>Add CBS node</h3>
            <input aria-label="CBS code" placeholder="Code (e.g. 01.01)" value={cbsCode} onChange={(e) => setCbsCode(e.target.value)} />
            <input aria-label="CBS title" placeholder="Cost code" value={cbsTitle} onChange={(e) => setCbsTitle(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}><select aria-label="CBS category" value={cbsCategory} onChange={(e) => setCbsCategory(e.target.value)}><option value="direct">Direct</option><option value="indirect">Indirect</option><option value="overhead">Overhead</option><option value="contingency">Contingency</option></select><input aria-label="CBS budget" type="number" min="0" step="0.01" placeholder="Budget" value={cbsBudget} onChange={(e) => setCbsBudget(e.target.value)} /></div>
            <input aria-label="CBS notes" placeholder="Notes (optional)" value={cbsNotes} onChange={(e) => setCbsNotes(e.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={busy}>Create CBS</button>
            <small style={st.muted}>Actual and committed values are Cost Ledger/commitment projections and are not editable.</small>
          </form>
        </div>
        <SimpleTable ariaLabel="Project WBS and CBS" headers={['WBS', 'Work package', 'BAC', 'Progress', 'CBS nodes']}>
          {wbs.length === 0 ? <tr><td colSpan={5} style={st.muted}>No WBS nodes.</td></tr> : wbs.map((node) => <tr key={node.id}><td style={cellMono}>{node.code}</td><td>{node.title}</td><td>{node.plannedValueKnown === false ? 'Unknown' : `AED ${aed(node.plannedValue)}`}</td><td>{node.progress.toFixed(1)}%</td><td>{cbs.filter((x) => x.projectId === node.projectId).length}</td></tr>)}
        </SimpleTable>
      </div>
      <div>
        <h3 style={panelTitle}>CBS metadata</h3>
        {cbs.length === 0 ? <p style={st.muted}>No CBS nodes.</p> : <SimpleTable ariaLabel="Project CBS metadata" headers={['Code', 'Title', 'Category', 'Budget', 'Actual (ledger)', 'Actions']}>
          {cbs.map((node) => editingCbs === node.id ? <tr key={node.id}><td style={cellMono}>{node.code}</td><td><input aria-label={`Edit ${node.code} title`} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></td><td><select aria-label={`Edit ${node.code} category`} value={editCategory} onChange={(e) => setEditCategory(e.target.value)}><option value="direct">Direct</option><option value="indirect">Indirect</option><option value="overhead">Overhead</option><option value="contingency">Contingency</option></select></td><td>AED {aed(node.budgetAmount)}</td><td>AED {aed(node.actualAmount)}</td><td><button className="btn btn-primary" disabled={busy} onClick={() => void saveCbsEdit(node.id)}>Save</button> <button className="btn btn-ghost" disabled={busy} onClick={() => setEditingCbs(null)}>Cancel</button></td></tr> : <tr key={node.id}><td style={cellMono}>{node.code}</td><td>{node.title}</td><td>{node.category}</td><td>AED {aed(node.budgetAmount)}</td><td>AED {aed(node.actualAmount)}</td><td><button className="btn btn-ghost" disabled={busy} onClick={() => beginCbsEdit(node)}>Edit metadata</button><button className="btn btn-ghost" disabled={busy} onClick={() => void call(`/api/projects/cbs/${node.id}`, 'DELETE', undefined, 'CBS node removed.')}>Delete</button></td></tr>)}
        </SimpleTable>}
      </div>
    </div>
  );
}

function DelayEotPanel({ projectId, delays, eots, busy, call }: { projectId: string; delays: DelayEvent[]; eots: EotClaim[]; busy: boolean; call: Action }) {
  const [delayTitle, setDelayTitle] = useState('');
  const [delayStart, setDelayStart] = useState('');
  const [delayDays, setDelayDays] = useState('');
  const [delayCause, setDelayCause] = useState('employer');
  const [eotTitle, setEotTitle] = useState('');
  const [eotDays, setEotDays] = useState('');
  const [eotJustification, setEotJustification] = useState('');

  const createDelay = async (): Promise<void> => {
    if (!delayTitle.trim() || !delayStart) return;
    const days = delayDays.trim() ? Number(delayDays) : undefined;
    if (days !== undefined && (!Number.isFinite(days) || days < 0)) return;
    if (await call('/api/projects/delays', 'POST', { projectId, title: delayTitle.trim(), causeCategory: delayCause, startDate: delayStart, delayDays: days }, 'Delay event logged.')) {
      setDelayTitle(''); setDelayStart(''); setDelayDays('');
    }
  };
  const createEot = async (): Promise<void> => {
    const days = Number(eotDays);
    if (!eotTitle.trim() || !Number.isFinite(days) || days <= 0) return;
    if (await call('/api/projects/eot-claims', 'POST', { projectId, title: eotTitle.trim(), submittedDays: days, justification: eotJustification, delayEventIds: delays.map((d) => d.id) }, 'EOT claim drafted.')) {
      setEotTitle(''); setEotDays(''); setEotJustification('');
    }
  };
  return <div style={{ display: 'grid', gap: 18 }} data-testid="project-eot-panel">
    <div style={authoringGrid}>
      <form data-testid="delay-authoring-form" onSubmit={(e) => { e.preventDefault(); void createDelay(); }} style={authoringCard}>
        <h3 style={formTitle}>Log delay event</h3>
        <input aria-label="Delay title" placeholder="Delay title / cause" value={delayTitle} onChange={(e) => setDelayTitle(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}><select aria-label="Delay cause" value={delayCause} onChange={(e) => setDelayCause(e.target.value)}><option value="employer">Employer</option><option value="contractor">Contractor</option><option value="neutral">Neutral</option><option value="force_majeure">Force majeure</option></select><input aria-label="Delay start" type="date" value={delayStart} onChange={(e) => setDelayStart(e.target.value)} /></div>
        <input aria-label="Delay days" type="number" min="0" step="1" placeholder="Delay days (optional)" value={delayDays} onChange={(e) => setDelayDays(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy}>Log delay</button>
        <small style={st.muted}>Delay status and schedule effects remain governed by the Projects domain.</small>
      </form>
      <form data-testid="eot-authoring-form" onSubmit={(e) => { e.preventDefault(); void createEot(); }} style={authoringCard}>
        <h3 style={formTitle}>Draft EOT claim</h3>
        <input aria-label="EOT title" placeholder="Claim title" value={eotTitle} onChange={(e) => setEotTitle(e.target.value)} />
        <input aria-label="EOT days" type="number" min="1" step="1" placeholder="Days requested" value={eotDays} onChange={(e) => setEotDays(e.target.value)} />
        <input aria-label="EOT justification" placeholder="Justification (optional)" value={eotJustification} onChange={(e) => setEotJustification(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy}>Create EOT draft</button>
        <small style={st.muted}>{delays.length} delay event{delays.length === 1 ? '' : 's'} will be linked as supporting evidence.</small>
      </form>
    </div>
    <div><h3 style={panelTitle}>Delay event ledger</h3>{delays.length === 0 ? <p style={st.muted}>No delay events.</p> : <SimpleTable ariaLabel="Project delay events" headers={['Title', 'Cause', 'Start', 'Days', 'Status']}>
      {delays.map((d) => <tr key={d.id}><td>{d.title}</td><td>{d.causeCategory}</td><td>{d.startDate}</td><td>{d.delayDays}</td><td><Status value={d.status} /></td></tr>)}
    </SimpleTable>}</div>
    <div><h3 style={panelTitle}>EOT claim ledger</h3>{eots.length === 0 ? <p style={st.muted}>No EOT claims.</p> : <SimpleTable ariaLabel="Project EOT claims" headers={['Claim', 'Requested', 'Approved', 'Status', 'Actions']}>
      {eots.map((claim) => <tr key={claim.id}><td>{claim.title}</td><td>{claim.submittedDays}</td><td>{claim.approvedDays || '—'}</td><td><Status value={claim.status} /></td><td>{claim.status === 'draft' && <button className="btn btn-primary" disabled={busy} onClick={() => void call(`/api/projects/eot-claims/${claim.id}/submit`, 'POST', undefined, 'EOT claim submitted.')}>Submit</button>}{(claim.status === 'submitted' || claim.status === 'under_review') && <><button className="btn btn-primary" disabled={busy} onClick={() => void call(`/api/projects/eot-claims/${claim.id}/decide`, 'POST', { status: 'approved', approvedDays: claim.submittedDays }, 'EOT claim approved.')}>Approve</button><button className="btn btn-ghost" disabled={busy} onClick={() => void call(`/api/projects/eot-claims/${claim.id}/decide`, 'POST', { status: 'rejected', approvedDays: 0 }, 'EOT claim rejected.')}>Reject</button></>}</td></tr>)}
    </SimpleTable>}</div>
  </div>;
}

function QuantityPanel({ quantities, maps }: { quantities: QuantityTxn[]; maps: DeliveryMap[] }) {
  const totals = quantities.reduce<Record<string, number>>((acc, row) => { acc[row.type] = (acc[row.type] ?? 0) + row.quantity; return acc; }, {});
  const semantic = (key: string): string => key === 'boq' ? 'SOLD (explicit)' : key === 'installed' ? 'EXECUTED / installed' : key === 'invoiced' ? 'CERTIFIED or BILLED (see provenance)' : key;
  return (
    <div data-testid="project-quantities-panel">
      <h2 style={panelTitle}>Quantity ledger</h2>
      <div style={st.stats}>{Object.entries(totals).map(([key, value]) => <Stat key={key} label={semantic(key)} value={value.toLocaleString(undefined, { maximumFractionDigits: 2 })} />)}</div>
      {quantities.length === 0 ? <p style={st.muted}>No quantity transactions recorded.</p> : (
        <SimpleTable ariaLabel="Project quantity ledger" headers={['Date', 'Item', 'Type', 'Semantic', 'Quantity', 'Unit', 'Source']}>
          {quantities.map((row) => <tr key={row.id}><td>{fmt(row.occurredAt)}</td><td style={cellMono}>{row.boqItemId}</td><td>{row.type}</td><td>{row.semantic ?? 'Legacy / unclassified'}</td><td>{row.quantity}</td><td>{row.unit ?? 'Unknown'}</td><td>{row.source}</td></tr>)}
        </SimpleTable>
      )}
      {maps.length > 0 && <p style={st.muted}>Every mapped execution quantity must resolve through one of the {maps.length} immutable DeliveryItemMap record{maps.length === 1 ? '' : 's'}.</p>}
    </div>
  );
}

function CostPanel({ costs, evm }: { costs: CostTxn[]; evm: Evm | null }) {
  const totals = costs.reduce((acc, row) => { const amount = row.baseAmount ?? row.amount; acc[row.type] += amount; return acc; }, { budget: 0, committed: 0, actual: 0 });
  return (
    <div data-testid="project-cost-panel">
      <h2 style={panelTitle}>Cost Ledger and EVM</h2>
      <div style={st.stats}>
        <Stat label="Budget" value={`AED ${aed(totals.budget)}`} />
        <Stat label="Committed" value={`AED ${aed(totals.committed)}`} />
        <Stat label="Actual (ledger)" value={`AED ${aed(totals.actual)}`} />
        <Stat label="BAC" value={evm?.budgetAtCompletion == null ? 'Unavailable' : `AED ${aed(evm.budgetAtCompletion)}`} />
        <Stat label="EV" value={evm?.earnedValue == null ? 'Unavailable' : `AED ${aed(evm.earnedValue)}`} />
        <Stat label="CV" value={evm?.costVariance == null ? 'Unavailable' : `AED ${aed(evm.costVariance)}`} />
        <Stat label="CPI" value={evm?.cpi == null ? 'Unavailable' : evm.cpi.toFixed(2)} />
        <Stat label="PV / SV / SPI" value="Unavailable — no time-phased baseline" />
      </div>
      {costs.length === 0 ? <p style={st.muted}>No Cost Ledger transactions recorded.</p> : (
        <SimpleTable ariaLabel="Project cost ledger" headers={['Date', 'Type', 'Source', 'Amount', 'Currency', 'Source ref']}>
          {costs.map((row) => <tr key={row.id}><td>{fmt(row.occurredAt)}</td><td>{row.type}</td><td>{row.source}</td><td>{aed(row.baseAmount ?? row.amount)}</td><td>{row.baseCurrency ?? 'Unknown'}</td><td style={cellMono}>{row.sourceRef ?? '—'}</td></tr>)}
        </SimpleTable>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div><div style={detailLabel}>{label}</div><div style={mono ? cellMono : undefined}>{value}</div></div>;
}

function SimpleTable({ ariaLabel, headers, children }: { ariaLabel: string; headers: string[]; children: ReactNode }) {
  return <div style={{ overflowX: 'auto' }}><table aria-label={ariaLabel} style={tableStyle}><thead><tr>{headers.map((header) => <th key={header} style={thStyle}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

const panelTitle: CSSProperties = { margin: '0 0 10px', fontSize: 15, color: 'var(--accent)' };
const formTitle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--text)' };
const authoringGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12, marginBottom: 14 };
const authoringCard: CSSProperties = { display: 'grid', gap: 8, padding: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)' };
const detailGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, padding: 14, border: '1px solid var(--border)', borderRadius: 10 };
const detailLabel: CSSProperties = { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 };
const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 };
const thStyle: CSSProperties = { textAlign: 'left', padding: '8px 7px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' };
const cellMono: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 11 };

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
