'use client';

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProjectTeam from './project-team';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import AuraDataTable, { type AuraColumn } from './ui/aura-data-table';
import { DataDegradedNotice } from './ui/data-state';
import {
  RecordShell, RecordHeader, RecordBand, RecordSituation, RecordNextAction, RecordHealth,
  RecordMissing, RecordWorkflowGate, RecordCard, CardGrid, ActionButton, InsightsPanel,
  type TabDef, type KpiItem, type Insight, type HealthState, type NextBestAction,
  type WorkflowGateView, type RelatedGroup,
} from './ui/record';
import { evaluateProjectRules, assessProject, type ProjectFinding, type ProjectFacts } from '@aura/shared';
import clientStyles from './project-360-client.module.css';

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

/**
 * The schedule. It existed behind /api/projects/schedules and no project surface read it, so the
 * time half of "on plan" had no home: SPI could say a project was late while nothing on screen
 * said which activity was late, or whether the plan had ever been baselined.
 */
interface ScheduleTask {
  name: string;
  plannedStart: string;
  plannedEnd: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  percentComplete: number;
}
interface ProjectSchedule { id: string; projectId: string; tasks: ScheduleTask[]; baselineSetAt: string | null; updatedAt: string }

interface WbsNode { id: string; projectId: string; parentId: string | null; code: string; title: string; plannedValue: number; plannedValueKnown?: boolean; earnedValue: number; actualCost: number; progress: number; status: string; boqItemId: string | null; }
interface CbsNode { id: string; projectId: string; parentId: string | null; code: string; title: string; category: string; budgetAmount: number; committedAmount: number; actualAmount: number; forecastAmount: number; currency: string; }
interface DeliveryMap { id: string; projectId: string; handoverId: string; frozenItemKey: string; sourceKind: string; sourceId: string | null; sourceRevisionRef: string | null; sourceItemId: string | null; wbsNodeId: string | null; cbsNodeId: string | null; createdAt: string; }
interface QuantityTxn { id: string; boqItemId: string; type: string; quantity: number; unit: string | null; source: string; sourceRef: string | null; semantic: string | null; occurredAt: string; dedupeKey: string | null; }
interface CostTxn { id: string; cbsNodeId: string | null; wbsNodeId: string | null; type: 'budget' | 'committed' | 'actual'; amount: number; baseAmount?: number | null; baseCurrency?: string | null; source: string; sourceRef: string | null; occurredAt: string; dedupeKey: string | null; }

type Tab = 'overview' | 'variations' | 'delivery' | 'quantities' | 'cost' | 'eot' | 'closeout' | 'team';

const aed = (n: number): string => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');
const fmt = (iso: string): string => new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE });

/**
 * The sections of a project, in the order a project manager needs them.
 *
 * The previous set was a list of the screens that happened to exist — Variations sat between
 * Overview and WBS, and Cost sat two tabs away from the quantities that produce it. These are
 * grouped by the QUESTION each answers: what is it, is it planned, how is it going, what is it
 * costing, what has changed, who is doing it, can we finish.
 */
const CONTROL_TABS: TabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'delivery', label: 'Scope & plan' },
  { id: 'quantities', label: 'Progress' },
  { id: 'cost', label: 'Cost' },
  { id: 'variations', label: 'Change' },
  { id: 'eot', label: 'Time' },
  { id: 'team', label: 'Team' },
  { id: 'closeout', label: 'Closeout' },
];

const VARIATION_COLUMNS: AuraColumn<Variation>[] = [
  { key: 'reference', label: 'Ref', priority: 'primary', sortable: true, render: (row) => <span style={{ fontFamily: 'ui-monospace, monospace' }}>{row.reference ?? '—'}</span> },
  { key: 'title', label: 'Title', sortable: true },
  { key: 'kind', label: 'Kind', sortable: true, render: (row) => <span style={{ textTransform: 'capitalize' }}>{row.kind}</span> },
  { key: 'value', label: 'Value', sortable: true, render: (row) => <strong style={{ color: row.value < 0 ? 'var(--bad)' : 'var(--text)' }}>AED {aed(row.value)}</strong> },
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
  const [schedule, setSchedule] = useState<ProjectSchedule | null>(null);
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
    const [vs, imp, eot, delayData, cls, evmData, certSummary, wbsData, cbsData, mapData, quantityData, costData, scheduleData] = await Promise.all([
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
      j<ProjectSchedule[]>(`/api/projects/schedules?projectId=${project.id}`, []),
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
    setSchedule((Array.isArray(scheduleData) ? scheduleData : [])[0] ?? null);
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

  // -- The record's verdict, computed from facts by the shared rules --------------------------
  //
  // Nothing below decides a project question. `evaluateProjectRules` owns every threshold and
  // `assessProject` owns coverage; this maps their codes to words and handlers, exactly as
  // opportunity-360 does with the deal rules. A rule that lived here would be one nobody can test
  // and one the server never sees.
  const facts: ProjectFacts = useMemo(() => ({
    status: project.status,
    wbsNodes: wbs.length,
    wbsCosted: wbs.filter((n) => n.plannedValueKnown !== false && n.plannedValue > 0).length,
    cbsNodes: cbs.length,
    cpi: evm?.cpi ?? null,
    spi: evm?.spi ?? null,
    variationsPending: variations.filter((v) => v.status === 'pending' || v.status === 'submitted').length,
    delaysOpen: delays.filter((x) => x.status !== 'closed' && x.status !== 'rejected').length,
    eotsAwaitingDecision: eots.filter((e) => e.status === 'submitted').length,
    closeoutExists: closeout !== null,
    closeoutItems: closeout?.items.length ?? 0,
    closeoutDone,
    closeoutFinalized: closeout?.status === 'finalized',
  }), [project.status, wbs, cbs, evm, variations, delays, eots, closeout, closeoutDone]);

  const assessment = useMemo(() => assessProject(evaluateProjectRules(facts), facts), [facts]);

  const FINDING_UI: Record<ProjectFinding['code'], (p: ProjectFinding['data']) => Insight> = {
    NO_SCOPE_BASELINE: () => ({ tone: 'warn', title: 'No scope baseline', detail: 'Nothing is planned yet, so progress and cost performance have nothing to measure against.', action: { label: 'Build the WBS', onClick: () => setTab('delivery') } }),
    SCOPE_NOT_COSTED: (d) => ({ tone: 'warn', title: 'Scope is not costed', detail: `${String(d?.nodes ?? '')} work packages carry no planned value, so earned value cannot be computed.`, action: { label: 'Allocate budget', onClick: () => setTab('delivery') } }),
    COST_OVERRUN: (d) => ({ tone: 'bad', title: 'Spending ahead of value earned', detail: `CPI ${Number(d?.cpi ?? 0).toFixed(2)} — every dirham of work earned has cost more than planned.`, action: { label: 'Open cost', onClick: () => setTab('cost') } }),
    SCHEDULE_SLIPPING: (d) => ({ tone: 'warn', title: 'Behind the plan', detail: `SPI ${Number(d?.spi ?? 0).toFixed(2)} — less has been earned than the schedule called for by now.`, action: { label: 'Open progress', onClick: () => setTab('quantities') } }),
    CHANGE_PENDING_DECISION: (d) => ({ tone: 'warn', title: 'Change awaiting a decision', detail: `${String(d?.count ?? '')} variation(s) are neither approved nor rejected, so the revised value is provisional.`, action: { label: 'Open change', onClick: () => setTab('variations') } }),
    DELAY_UNRESOLVED: (d) => ({ tone: 'warn', title: 'Delay events still open', detail: `${String(d?.count ?? '')} recorded delay(s) have no resolution, and entitlement expires with the notice period.`, action: { label: 'Open time', onClick: () => setTab('eot') } }),
    EOT_AWAITING_DECISION: (d) => ({ tone: 'warn', title: 'Extension of time submitted', detail: `${String(d?.count ?? '')} claim(s) are with the engineer and unanswered.`, action: { label: 'Open time', onClick: () => setTab('eot') } }),
    CLOSEOUT_INCOMPLETE: (d) => ({ tone: 'neutral', title: 'Closeout in progress', detail: `${String(d?.remaining ?? '')} of ${String(d?.total ?? '')} handover items remain.`, action: { label: 'Open closeout', onClick: () => setTab('closeout') } }),
    READY_TO_CLOSE: () => ({ tone: 'good', title: 'Ready to close', detail: 'Every closeout item is done. Finalizing closes the source contract on the deal chain.', action: { label: 'Finalize', onClick: () => setTab('closeout') } }),
  };
  const insights: Insight[] = assessment.findings.map((f) => FINDING_UI[f.code](f.data));

  const money = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : `AED ${aed(n)}`);
  const revised = impact?.revisedValue ?? project.value;
  const progressPct = wbs.length
    ? Math.round(wbs.reduce((sum, n) => sum + (Number.isFinite(n.progress) ? n.progress : 0), 0) / wbs.length)
    : null;

  const kpis: KpiItem[] = [
    { label: 'Contract value', value: money(project.value), hint: 'Inherited from the awarded contract' },
    { label: 'Revised value', value: money(revised), tone: revised !== project.value ? 'accent' : undefined, hint: 'After approved variations' },
    { label: 'Certified', value: certs ? money(certs.grossCertifiedToDate) : '—', hint: certs ? `${certs.percentComplete}% of contract` : 'No certificates issued' },
    { label: 'CPI', value: evm?.cpi != null ? evm.cpi.toFixed(2) : 'Not established', tone: evm?.cpi == null ? undefined : evm.cpi < 1 ? 'bad' : 'good', hint: 'Earned value / actual cost' },
    { label: 'SPI', value: evm?.spi != null ? evm.spi.toFixed(2) : 'Not established', tone: evm?.spi == null ? undefined : evm.spi < 1 ? 'warn' : 'good', hint: 'Earned value / planned value' },
    { label: 'Progress', value: progressPct === null ? 'Not established' : `${progressPct}%`, hint: 'Mean WBS completion' },
  ];

  // Health reads the assessment rather than re-deriving it, so the band and the rail can never
  // disagree about the same project.
  const health: HealthState = assessment.needsAttention
    ? { label: 'Needs attention', tone: (evm?.cpi != null && evm.cpi < 1) ? 'bad' : 'warn', reasons: insights.filter((i) => i.tone === 'bad' || i.tone === 'warn').map((i) => i.title) }
    : facts.closeoutFinalized || project.status === 'completed'
      ? { label: 'Closed', tone: 'neutral' }
      : { label: 'On plan', tone: 'good' };

  const situationText = project.status === 'planned'
    ? `Awarded${project.contractTitle ? ` under ${project.contractTitle}` : ''} and not yet started.`
    : project.status === 'completed' ? 'Delivered and closed on the deal chain.'
    : project.status === 'cancelled' ? 'Cancelled before completion.'
    : `In execution${progressPct === null ? '' : ` at ${progressPct}% of scope`}${certs ? `, ${certs.percentComplete}% certified` : ''}.`;

  // The first insight that demands action IS the next action - one source, so the band cannot
  // advertise something the rail does not list.
  const firstActionable = insights.find((i) => i.tone === 'warn' || i.tone === 'bad') ?? insights.find((i) => i.action);
  const nba: NextBestAction | undefined = firstActionable?.action
    ? { label: firstActionable.action.label, hint: firstActionable.title, onClick: firstActionable.action.onClick }
    : undefined;

  // What the record cannot answer, named. Taken from declared coverage, not from a hand-list that
  // would drift from what the rules actually ran.
  const missing = (assessment.coverage.unverifiable ?? []).map((code) => (
    code === 'COST_PERFORMANCE' ? 'Cost performance — no earned value recorded yet'
      : code === 'SCHEDULE_PERFORMANCE' ? 'Schedule performance — no planned value to compare against'
        : code === 'CLOSEOUT_READINESS' ? 'Closeout — no checklist has been started'
          : String(code)
  ));

  // The lifecycle gate, rendered from the same conditions the action buttons obey, so the page
  // cannot offer a transition it then refuses.
  const gate: WorkflowGateView | undefined =
    project.status === 'planned' ? { nextStage: 'Active', label: 'Start execution', allowed: true, gaps: [] }
      : project.status === 'active' ? {
        nextStage: 'Completed',
        label: 'Complete the project',
        allowed: facts.closeoutExists && facts.closeoutItems > 0 && facts.closeoutDone === facts.closeoutItems,
        gaps: [
          ...(!facts.closeoutExists ? ['No closeout checklist has been started'] : []),
          ...(facts.closeoutExists && facts.closeoutDone < facts.closeoutItems ? [`${facts.closeoutItems - facts.closeoutDone} closeout item(s) outstanding`] : []),
          ...(facts.variationsPending > 0 ? [`${facts.variationsPending} variation(s) awaiting decision`] : []),
          ...(facts.eotsAwaitingDecision > 0 ? [`${facts.eotsAwaitingDecision} EOT claim(s) awaiting decision`] : []),
        ],
      }
        : undefined;

  // Delivery lives in the project shell's own workspace sections; the record links to them rather
  // than duplicating registers that already have an owner.
  const related: RelatedGroup[] = [
    {
      label: 'Delivery',
      icon: '▥',
      items: [
        { code: 'Engineering', href: `/project/${project.id}/workspace/engineering`, meta: 'Drawings, RFIs, submittals' },
        { code: 'Quality', href: `/project/${project.id}/workspace/quality`, meta: 'Inspections, NCRs, snags' },
        { code: 'HSE', href: `/project/${project.id}/workspace/hse`, meta: 'Permits, incidents, CAPA' },
        { code: 'Site', href: `/project/${project.id}/workspace/site`, meta: 'Instructions, daily reports, progress' },
        { code: 'Testing & commissioning', href: `/project/${project.id}/workspace/testing`, meta: 'System readiness and sign-off' },
        { code: 'Documents', href: `/project/${project.id}/workspace/documents`, meta: 'Controlled project information' },
      ],
    },
    {
      label: 'Commercial context',
      icon: '◈',
      items: [
        ...(project.contractId ? [{ code: project.contractTitle ?? 'Contract', href: `/contracts/contracts/${project.contractId}`, meta: 'The awarded agreement this project inherits' }] : []),
        ...(project.accountId ? [{ code: project.accountName ?? 'Account', href: `/crm/accounts/${project.accountId}`, meta: 'The customer' }] : []),
      ],
    },
  ].filter((g) => g.items.length > 0);

  const actions = (
    <>
      {project.status === 'planned' && (
        <ActionButton onClick={() => setStatus('active')} disabled={busy}>Start execution</ActionButton>
      )}
      {project.status === 'active' && (
        <ActionButton onClick={() => setStatus('completed')} disabled={busy}>Complete project</ActionButton>
      )}
      {(project.status === 'planned' || project.status === 'active') && (
        <ActionButton kind="ghost" onClick={() => setStatus('cancelled')} disabled={busy}>Cancel</ActionButton>
      )}
      {tab === 'variations' && <ActionButton kind="ghost" href="/projects/variations">Variations register</ActionButton>}
      {tab === 'closeout' && !closeout && (
        <ActionButton onClick={() => void call('/api/projects/closeouts', 'POST', { projectId: project.id, projectName: project.title }, 'Closeout checklist started.')} disabled={busy}>
          Start closeout checklist
        </ActionButton>
      )}
    </>
  );

  return (
    <div data-testid="project-controls-client" className={clientStyles.root}>
      {err && <div role="alert" style={st.err}>{err}</div>}
      {msg && <div role="status" style={st.ok}>{msg}</div>}
      {loadFailures > 0 ? <DataDegradedNotice message={`${loadFailures} project-control data source${loadFailures === 1 ? ' is' : 's are'} unavailable. Available sections remain live.`} /> : null}

      <RecordShell
        header={
          <RecordHeader
            title={project.title}
            status={project.status}
            statusTone={project.status === 'active' ? 'good' : project.status === 'completed' ? 'accent' : project.status === 'cancelled' ? 'bad' : 'neutral'}
            meta={[
              ...(project.reference ? [{ label: 'Ref', value: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{project.reference}</span> }] : []),
              ...(project.accountName ? [{ label: 'Customer', value: project.accountId ? <a href={`/crm/accounts/${project.accountId}`} style={st.link}>{project.accountName}</a> : project.accountName }] : []),
              ...(project.contractTitle ? [{ label: 'Contract', value: project.contractId ? <a href={`/contracts/contracts/${project.contractId}`} style={st.link}>{project.contractTitle}</a> : project.contractTitle }] : []),
              { label: 'Started', value: fmt(project.createdAt) },
            ]}
            score={progressPct === null ? undefined : { value: `${progressPct}%`, label: 'Scope complete', badge: health.label, badgeTone: health.tone }}
            actions={actions}
          />
        }
        kpis={kpis}
        situation={
          <RecordBand tone={health.tone}>
            <RecordSituation situation={situationText} />
            {nba && <RecordNextAction action={nba} />}
            <RecordHealth health={health} />
            <RecordMissing items={missing} />
            {gate && <RecordWorkflowGate gate={gate} />}
          </RecordBand>
        }
        tabs={CONTROL_TABS.map((item) => ({
          ...item,
          count: item.id === 'variations' ? variations.length || undefined
            : item.id === 'eot' ? (delays.length + eots.length) || undefined
              : item.id === 'delivery' ? wbs.length || undefined
                : undefined,
        }))}
        activeTab={tab}
        onTab={(id) => setTab(id as Tab)}
        aside={<InsightsPanel insights={insights} assessment={assessment.coverage} context="this project" />}
        related={{ title: 'Where the work lives', groups: related }}
      >
        {tab === 'overview' && <ControlsOverviewPanel project={project} wbs={wbs} cbs={cbs} maps={maps} variations={variations} impact={impact} evm={evm} closeout={closeout} closeoutDone={closeoutDone} />}
        {tab === 'delivery' && <DeliveryPanel project={project} wbs={wbs} cbs={cbs} maps={maps} busy={busy} call={call} />}

        {tab === 'quantities' && <ProgressPanel projectId={project.id} schedule={schedule} wbs={wbs} quantities={quantities} maps={maps} busy={busy} call={call} />}

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
      </RecordShell>
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

/**
 * Overview — what is NOT already said above it.
 *
 * The previous overview restated the numbers: a hero, a row of control counts, a health strip.
 * All three now live in the KPI row and the situation band, computed by the shared rules, so
 * repeating them here would give a reader two renderings of one fact and no way to tell which is
 * current. What is left is the part nothing else carries — the governed actions, and the delivery
 * chain's own state.
 *
 * The action links open the CANONICAL OWNER with this project's context, rather than authoring a
 * variation or an RFI inside Project 360. That is the boundary the whole page is built on: this
 * record composes other modules' work, it does not take ownership of it.
 */
function ControlsOverviewPanel({
  project, wbs, cbs, maps, variations, impact, evm, closeout, closeoutDone,
}: {
  project: Project360Project;
  wbs: WbsNode[];
  cbs: CbsNode[];
  maps: DeliveryMap[];
  variations: Variation[];
  impact: VariationImpact | null;
  evm: Evm | null;
  closeout: Closeout | null;
  closeoutDone: number;
}) {
  const id = encodeURIComponent(project.id);
  const base = `/project/${id}`;

  const ACTIONS: Array<{ group: string; links: Array<[string, string]> }> = [
    { group: 'Plan & control', links: [['Add task or milestone', `/projects/schedule?projectId=${id}`], ['Baseline the schedule', `${base}/controls?tab=quantities`], ['Allocate scope value', `${base}/controls?tab=delivery`]] },
    { group: 'Engineering', links: [['Drawing or technical action', `/engineering?projectId=${id}`], ['RFI or submittal', `/engineering/drawings?projectId=${id}`]] },
    { group: 'Procurement & subcontracts', links: [['Material requirement', `/procurement/purchase-requests?projectId=${id}`], ['New package or RFQ', `/subcontracts/subcontracts?projectId=${id}`]] },
    { group: 'Site & quality', links: [['Work instruction', `/site/instructions?projectId=${id}`], ['Daily report', `/site/daily-reports?projectId=${id}`], ['Inspection or NCR', `/quality/ncrs?projectId=${id}`]] },
    { group: 'Commercial & evidence', links: [['Raise a variation', `/projects/variations?projectId=${id}`], ['Documents', `${base}/workspace/documents`], ['Team & ownership', `${base}/controls?tab=team`]] },
  ];

  // The delivery chain, stated as evidence rather than as progress. "Not established" is a real
  // answer here: it says nobody has connected that stage yet, which is different from saying the
  // stage is empty.
  const chain: Array<{ label: string; state: string; ok: boolean }> = [
    { label: 'Scope structured', state: wbs.length ? `${wbs.length} work packages · ${cbs.length} cost nodes` : 'Not established', ok: wbs.length > 0 },
    { label: 'Handover mapped', state: maps.length ? `${maps.length} frozen items traced` : 'Not established', ok: maps.length > 0 },
    { label: 'Earned value', state: evm?.earnedValue != null ? `AED ${aed(evm.earnedValue)} earned` : 'Not established', ok: evm?.earnedValue != null },
    { label: 'Change controlled', state: variations.length ? `${variations.length} variation(s)${impact ? ` · AED ${aed(impact.pendingValue)} pending` : ''}` : 'No change raised', ok: true },
    { label: 'Closeout', state: closeout ? `${closeoutDone}/${closeout.items.length} items done` : 'Not established', ok: closeout !== null },
  ];

  return (
    <div data-testid="project-controls-overview">
      <CardGrid>
        <RecordCard title="Delivery chain" span={2}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {chain.map((step) => (
              <div key={step.label} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span aria-hidden style={{ color: step.ok ? 'var(--good)' : 'var(--muted)' }}>{step.ok ? '●' : '○'}</span>
                <strong style={{ fontSize: 13, minWidth: 150 }}>{step.label}</strong>
                <span style={{ fontSize: 13, color: step.ok ? 'var(--text)' : 'var(--muted)' }}>{step.state}</span>
              </div>
            ))}
          </div>
        </RecordCard>

        <RecordCard title="Governed actions" span={2}>
          <p style={st.muted}>
            Each opens the module that owns the record, carrying this project as context. Project 360
            composes their work; it does not take ownership of it.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginTop: 10 }}>
            {ACTIONS.map((section) => (
              <div key={section.group}>
                <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>{section.group}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {section.links.map(([label, href]) => (
                    <a key={label} href={href} style={{ ...st.link, fontSize: 13 }}>{label}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </RecordCard>
      </CardGrid>
    </div>
  );
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

/**
 * Progress — the tab that answers "how far along, against what plan".
 *
 * It brings together three things that were previously in different places or nowhere at all:
 * the schedule (which no project surface read, so SPI could report lateness with nothing on
 * screen saying WHICH activity was late), the per-package progress that produces earned value,
 * and the quantity ledger.
 *
 * Progress is EDITABLE here because it is the one input earned value cannot be computed without,
 * and the previous UI said so in a footnote — "no progress or actual-cost editing is exposed here"
 * — while the record's own CPI/SPI depended on it. A number the product demands and refuses to let
 * anyone enter is not a gap in a screen, it is a gap in the method.
 */
function ProgressPanel({
  projectId, schedule, wbs, quantities, maps, busy, call,
}: {
  projectId: string;
  schedule: ProjectSchedule | null;
  wbs: WbsNode[];
  quantities: QuantityTxn[];
  maps: DeliveryMap[];
  busy: boolean;
  call: Action;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const tasks = schedule?.tasks ?? [];
  const slip = tasks.reduce((worst, t) => {
    if (!t.baselineEnd) return worst;
    const days = Math.round((Date.parse(t.plannedEnd) - Date.parse(t.baselineEnd)) / 86_400_000);
    return days > worst ? days : worst;
  }, 0);

  return (
    <div data-testid="project-progress-panel">
      <CardGrid>
        <RecordCard title="Schedule" span={2}>
          {!schedule || tasks.length === 0 ? (
            <p style={st.muted}>
              No schedule is established for this project. Without one there is no baseline to
              measure against, and schedule performance stays unverifiable rather than green.
            </p>
          ) : (
            <>
              <div style={st.stats}>
                <Stat label="Activities" value={String(tasks.length)} />
                <Stat label="Baseline" value={schedule.baselineSetAt ? fmt(schedule.baselineSetAt) : 'Not set'} accent={!schedule.baselineSetAt} />
                <Stat label="Worst slippage" value={schedule.baselineSetAt ? `${slip} day(s)` : 'No baseline'} bad={slip > 0} />
              </div>
              <table className="table" style={{ marginTop: 10 }}>
                <thead>
                  <tr><th>Activity</th><th>Planned</th><th>Baseline</th><th>Actual</th><th style={{ textAlign: 'right' }}>Complete</th></tr>
                </thead>
                <tbody>
                  {tasks.map((t) => {
                    const late = t.baselineEnd ? Date.parse(t.plannedEnd) > Date.parse(t.baselineEnd) : false;
                    return (
                      <tr key={t.name}>
                        <td>{t.name}</td>
                        <td style={{ color: late ? 'var(--bad)' : undefined }}>{t.plannedStart} - {t.plannedEnd}</td>
                        <td style={{ color: 'var(--muted)' }}>{t.baselineStart ? `${t.baselineStart} - ${t.baselineEnd}` : 'Not baselined'}</td>
                        <td style={{ color: 'var(--muted)' }}>{t.actualStart ? `${t.actualStart} - ${t.actualEnd ?? 'open'}` : 'Not started'}</td>
                        <td style={{ textAlign: 'right' }}>{t.percentComplete}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!schedule.baselineSetAt && (
                <div style={{ marginTop: 10 }}>
                  <ActionButton
                    disabled={busy}
                    onClick={() => void call(`/api/projects/schedules/${projectId}/baseline`, 'POST', {}, 'Schedule baselined.')}
                  >
                    Set the baseline
                  </ActionButton>
                  <p style={st.muted}>
                    Freezing the plan is what makes slippage measurable. Until then every date is
                    just the current intention.
                  </p>
                </div>
              )}
            </>
          )}
        </RecordCard>

        <RecordCard title="Work package progress" span={2}>
          {wbs.length === 0 ? (
            <p style={st.muted}>No work packages yet. Build the WBS under Scope &amp; plan first.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Code</th><th>Work package</th><th style={{ textAlign: 'right' }}>Planned</th><th style={{ textAlign: 'right' }}>Earned</th><th>Progress</th><th /></tr>
              </thead>
              <tbody>
                {wbs.map((node) => {
                  const pending = draft[node.id];
                  return (
                    <tr key={node.id}>
                      <td style={cellMono}>{node.code}</td>
                      <td>{node.title}</td>
                      <td style={{ textAlign: 'right' }}>{node.plannedValueKnown === false ? 'Unknown' : `AED ${aed(node.plannedValue)}`}</td>
                      <td style={{ textAlign: 'right' }}>AED {aed(node.earnedValue)}</td>
                      <td>
                        <input
                          aria-label={`${node.code} progress`}
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          disabled={busy}
                          value={pending ?? String(node.progress)}
                          onChange={(e) => setDraft((d) => ({ ...d, [node.id]: e.target.value }))}
                          style={{ width: 80 }}
                        />
                        <span style={st.muted}> %</span>
                      </td>
                      <td>
                        {pending !== undefined && pending !== String(node.progress) && (
                          <ActionButton
                            disabled={busy}
                            onClick={async () => {
                              const value = Number(pending);
                              if (!Number.isFinite(value) || value < 0 || value > 100) return;
                              if (await call(`/api/projects/wbs/${node.id}/progress`, 'PUT', { progress: value }, `${node.code} progress updated.`)) {
                                setDraft((d) => { const next = { ...d }; delete next[node.id]; return next; });
                              }
                            }}
                          >
                            Save
                          </ActionButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p style={st.muted}>
            Progress drives earned value, and earned value drives CPI and SPI. Actual cost is not
            editable here on purpose: it is a Cost Ledger projection, and typing over a projection
            would make the two disagree.
          </p>
        </RecordCard>
      </CardGrid>

      <QuantityPanel quantities={quantities} maps={maps} />
    </div>
  );
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
