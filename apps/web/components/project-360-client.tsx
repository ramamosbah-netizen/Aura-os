'use client';

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProjectTeam from './project-team';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import AuraDataTable, { type AuraColumn } from './ui/aura-data-table';
import { DataDegradedNotice } from './ui/data-state';
import {
  RecordShell, RecordHeader, RecordBand, RecordSituation, RecordNextAction, RecordHealth,
  RecordMissing, RecordWorkflowGate, RecordCard, CardGrid, ActionButton, InsightsPanel, type Tone,
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
/** One lifecycle move as the server judges it — the shape `GET /projects/:id/transitions` returns. */
interface Transition { from: string; to: string; allowed: boolean; gaps: string[] }

/** The cross-domain health read (§24). Severity and coverage are independent, deliberately. */
interface HealthSignal {
  id: string;
  domain: string;
  state: 'CLEAR' | 'WATCH' | 'AT_RISK' | 'CRITICAL' | 'UNKNOWN' | 'NOT_APPLICABLE';
  reason?: string;
  cause?: 'SEMANTICS_UNDECLARED' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_UNBOUND';
  href?: string;
  measure?: { value: number; unit?: string };
}
interface CrossDomainHealth {
  severity: 'CLEAR' | 'WATCH' | 'AT_RISK' | 'CRITICAL';
  coverage: 'COMPLETE' | 'PARTIAL';
  applicable: boolean;
  reassuring: boolean;
  concerns: HealthSignal[];
  unknown: HealthSignal[];
  notApplicable: HealthSignal[];
  assessedAt?: string;
}

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

/**
 * The closeout verdict, assembled by the domain that also enforces it at finalization.
 *
 * Rendered, never recomputed. A preview derived differently from the enforcement is how
 * "but it said I could close it" happens.
 */
type ReadinessState = 'pass' | 'blocked' | 'unknown';
interface ReadinessCheck { id: string; domain: string; label: string; state: ReadinessState; detail?: string; href?: string }
interface CloseoutReadiness { ready: boolean; checks: ReadinessCheck[]; blocked: ReadinessCheck[]; unknown: ReadinessCheck[] }

interface WbsNode { id: string; projectId: string; parentId: string | null; code: string; title: string; plannedValue: number; plannedValueKnown?: boolean; earnedValue: number; actualCost: number; progress: number; status: string; boqItemId: string | null; }
interface CbsNode { id: string; projectId: string; parentId: string | null; code: string; title: string; category: string; budgetAmount: number; committedAmount: number; actualAmount: number; forecastAmount: number; currency: string; }
interface DeliveryMap { id: string; projectId: string; handoverId: string; frozenItemKey: string; sourceKind: string; sourceId: string | null; sourceRevisionRef: string | null; sourceItemId: string | null; wbsNodeId: string | null; cbsNodeId: string | null; createdAt: string; }
interface QuantityTxn { id: string; boqItemId: string; type: string; quantity: number; unit: string | null; source: string; sourceRef: string | null; semantic: string | null; occurredAt: string; dedupeKey: string | null; }
interface CostTxn { id: string; cbsNodeId: string | null; wbsNodeId: string | null; type: 'budget' | 'committed' | 'actual'; amount: number; baseAmount?: number | null; baseCurrency?: string | null; source: string; sourceRef: string | null; occurredAt: string; dedupeKey: string | null; }

/**
 * §21 — two registers, kept as two on screen for the same reason they are two tables.
 *
 * A risk is uncertain and forward-looking; an issue exists now. Blending them into one list would
 * make the screen answer neither "what might go wrong" nor "what is going wrong".
 */
interface ProjectIssueReference { module: string; recordType: string; recordId: string; label: string | null }
interface RiskRecord {
  id: string; projectId: string; reference: string | null; title: string; description: string | null;
  area: string; likelihood: string; impact: string; severity: string;
  mitigation: string | null; acceptanceReason: string | null; owner: string | null;
  targetDate: string | null; status: string; createdAt: string;
}
interface IssueRecord {
  id: string; projectId: string; reference: string | null; title: string; description: string | null;
  area: string; severity: string; status: string; owner: string | null;
  raisedAt: string; dueDate: string | null; resolution: string | null;
  originRiskId: string | null; references: ProjectIssueReference[];
}
interface RiskSummary {
  total: number; open: number; mitigating: number; accepted: number; resolved: number;
  materialised: number; openCritical: number; openHigh: number; overdueMitigations: number; needsAttention: boolean;
}
interface IssueSummary {
  total: number; open: number; inProgress: number; resolved: number; withdrawn: number;
  openCritical: number; openMajor: number; overdue: number; fromRisk: number; needsAttention: boolean;
}
interface RiskRegister {
  risks: RiskRecord[]; issues: IssueRecord[];
  riskSummary: RiskSummary; issueSummary: IssueSummary;
  /** One date for both halves, stamped by the API — so "overdue" cannot mean two different days. */
  asOf: string;
}

type Tab = 'overview' | 'variations' | 'delivery' | 'quantities' | 'cost' | 'eot' | 'risks' | 'closeout' | 'team';

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
  // Plan & Control has linked here since before anything answered: `/controls?tab=risks` fell
  // through `validInitialTab` to Overview, so the person landed somewhere plausible and never
  // learned the screen did not exist. A 404 tells the truth; a silent fallback does not.
  { id: 'risks', label: 'Risks & issues' },
  { id: 'team', label: 'Team' },
  { id: 'closeout', label: 'Closeout' },
];

/**
 * The lifecycle states in the words a project manager uses.
 *
 * The stored values are the machine's; these are the reader's. Kept as a lookup with a fallback to
 * the raw value so a state added on the server still renders — as itself rather than as nothing.
 */
const STATE_LABEL: Record<string, string> = {
  planned: 'Planned',
  planning: 'Planning',
  active: 'In execution',
  testing: 'Testing & commissioning',
  handover: 'Handover',
  closeout: 'Closeout',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** What pressing the button DOES, phrased as the act rather than as the destination. */
const MOVE_LABEL: Record<string, string> = {
  planning: 'Begin planning',
  active: 'Start execution',
  testing: 'Enter testing',
  handover: 'Begin handover',
  closeout: 'Start closeout',
  completed: 'Complete project',
};

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
  const [readiness, setReadiness] = useState<CloseoutReadiness | null>(null);
  /**
   * The moves this project can make, each with the server's verdict.
   *
   * Read, never computed. This page used to derive the lifecycle from `facts` it had loaded
   * itself, which meant two implementations of the same rules — and they had already diverged:
   * "Start execution" was offered unconditionally on a `planned` project, and the API then refused
   * it for having no scope and no baseline. A button that fails when pressed is worse than no
   * button, because the person has already decided to act.
   */
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [crossHealth, setCrossHealth] = useState<CrossDomainHealth | null>(null);
  const [register, setRegister] = useState<RiskRegister | null>(null);
  /**
   * Whether the register READ has happened yet — distinct from whether it succeeded.
   *
   * Without this, `register === null` means both "not fetched yet" and "could not be read",
   * and the panel announces a failure on first paint that has not happened. A screen that
   * claims an absence it has not established is the exact failure §24 exists to prevent.
   */
  const [registerRead, setRegisterRead] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
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
    const [vs, imp, eot, delayData, cls, evmData, certSummary, wbsData, cbsData, transitionData, healthData, registerData, mapData, quantityData, costData, scheduleData, readinessData] = await Promise.all([
      j<Variation[]>(`/api/projects/variations?projectId=${project.id}`, []),
      j<{ impact: VariationImpact } | null>(`/api/projects/variations/summary/${project.id}`, null),
      j<EotClaim[]>(`/api/projects/eot-claims?projectId=${project.id}`, []),
      j<DelayEvent[]>(`/api/projects/delays?projectId=${project.id}`, []),
      j<Closeout[]>(`/api/projects/closeouts?projectId=${project.id}`, []),
      j<Evm | null>(`/api/projects/projects/${project.id}/evm`, null),
      project.contractId ? j<{ summary: CertSummary } | null>(`/api/contracts/certificates/summary/${project.contractId}`, null) : Promise.resolve(null),
      j<WbsNode[]>(`/api/projects/wbs?projectId=${project.id}`, []),
      j<CbsNode[]>(`/api/projects/cbs?projectId=${project.id}`, []),
      j<Transition[]>(`/api/projects/projects/${project.id}/transitions`, []),
      j<CrossDomainHealth | null>(`/api/projects/projects/${project.id}/health`, null),
      j<RiskRegister | null>(`/api/projects/projects/${project.id}/risk-register`, null),
      j<DeliveryMap[]>(`/api/projects/delivery-item-maps?projectId=${project.id}`, []),
      j<QuantityTxn[]>(`/api/projects/quantity-ledger?projectId=${project.id}&limit=500`, []),
      j<CostTxn[]>(`/api/projects/cost-ledger?projectId=${project.id}&limit=500`, []),
      // Absence is an answer here, not a failure: most projects have no schedule yet, and counting
      // that as an unavailable source would make the degradation notice permanent and ignorable.
      (async () => {
        try {
          const r = await fetch(`/api/projects/schedules?projectId=${project.id}`, { cache: 'no-store' });
          return r.ok ? ((await r.json()) as ProjectSchedule[]) : [];
        } catch { return [] as ProjectSchedule[]; }
      })(),
      // Not counted as a load failure either: a deployment without the readiness ports wired
      // answers 503, and the panel says so in its own words rather than through a generic banner.
      (async () => {
        try {
          const r = await fetch(`/api/projects/projects/${project.id}/closeout-readiness`, { cache: 'no-store' });
          return r.ok ? ((await r.json()) as CloseoutReadiness) : null;
        } catch { return null; }
      })(),
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
    setTransitions(Array.isArray(transitionData) ? transitionData : []);
    setCrossHealth(healthData);
    setRegister(registerData);
    setRegisterRead(true);
    setMaps(Array.isArray(mapData) ? mapData : []);
    setQuantities(Array.isArray(quantityData) ? quantityData : []);
    setCosts(Array.isArray(costData) ? costData : []);
    setSchedule((Array.isArray(scheduleData) ? scheduleData : [])[0] ?? null);
    setReadiness(readinessData);
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

  /**
   * Abandon the project, on the record.
   *
   * A separate route because it carries separate evidence. The reason is not a confirmation
   * prompt — it is the field that makes `cancelled` answerable afterwards, so it is required here
   * and required again at the API. Trimmed before sending: whitespace would satisfy a `required`
   * check and tell a later reader nothing.
   */
  const cancelProject = async (): Promise<void> => {
    const reason = cancelReason.trim();
    if (!reason) { setErr('A reason is required to cancel a project.'); return; }
    const ok = await call(`/api/projects/projects/${project.id}/cancel`, 'PATCH', { reason }, 'Project cancelled.');
    if (ok) { setCancelling(false); setCancelReason(''); }
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
    // The lifecycle is draft | submitted | approved | rejected — there is no 'pending'. Checking for
    // one meant a variation sitting in draft counted as decided, so it passed the completion gate
    // unseen. Caught by the compiler only when the same predicate was written in the domain, where
    // VariationStatus is a union rather than a string off a fetch.
    variationsPending: variations.filter((v) => v.status === 'draft' || v.status === 'submitted').length,
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

  /**
   * The lifecycle gate — the server's verdict, restated, never recomputed.
   *
   * Cancellation is excluded on purpose: it is always allowed, so showing it as the gate would
   * make the band read "you may proceed" on a project that cannot proceed to anything. The gate
   * answers "what is the next stage, and may this project enter it?" — abandonment is not a stage.
   */
  const forward = transitions.filter((t) => t.to !== 'cancelled');
  // The BLOCKED move first, deliberately. Preferring an allowed one made the band congratulate:
  // a planned project can always "begin planning", so the band said proceed while the move the
  // reader actually wanted — starting execution — was refused a few pixels away with its reasons
  // buried in a tooltip. The obstacle is the useful thing to show.
  const nextMove = forward.find((t) => !t.allowed) ?? forward[0];
  const gate: WorkflowGateView | undefined = nextMove
    ? { nextStage: STATE_LABEL[nextMove.to] ?? nextMove.to, label: MOVE_LABEL[nextMove.to] ?? `Move to ${nextMove.to}`, allowed: nextMove.allowed, gaps: nextMove.gaps }
    : undefined;

  const cancellable = transitions.some((t) => t.to === 'cancelled' && t.allowed);

  // Delivery lives in the project shell's own workspace sections; the record links to them rather
  // than duplicating registers that already have an owner.
  const related: RelatedGroup[] = [
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
      {/*
        One button per move the server offers, in the server's order. A blocked move stays VISIBLE
        and disabled with its reason attached, rather than being hidden: hiding it answers "why
        can't I complete this project?" with silence, and the reason is the useful part.
      */}
      {forward.map((t) => (
        <ActionButton
          key={t.to}
          onClick={() => setStatus(t.to)}
          disabled={busy || !t.allowed}
          title={t.allowed ? undefined : t.gaps.join(' · ')}
        >
          {MOVE_LABEL[t.to] ?? `Move to ${t.to}`}
        </ActionButton>
      ))}
      {cancellable && (
        <ActionButton kind="ghost" onClick={() => setCancelling(true)} disabled={busy}>Cancel project</ActionButton>
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

      {cancelling && (
        <div role="dialog" aria-label="Cancel project" data-testid="project-cancel-dialog" style={{ border: '1px solid var(--border)', background: 'var(--panel-2)', borderRadius: 8, padding: 16, marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 15 }}>Cancel this project</h2>
          <p style={{ ...st.muted, margin: '0 0 10px' }}>
            Cancellation is recorded against you, with the stage the project was in and the reason
            you give. It cannot be undone from here.
          </p>
          <label htmlFor="cancel-reason" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Reason</label>
          <input
            id="cancel-reason"
            data-testid="cancel-reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Why is this project stopping?"
            style={{ width: '100%', maxWidth: 520, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel)', color: 'var(--text)' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <ActionButton onClick={() => void cancelProject()} disabled={busy || !cancelReason.trim()}>Cancel project</ActionButton>
            <ActionButton kind="ghost" onClick={() => { setCancelling(false); setCancelReason(''); }} disabled={busy}>Keep it open</ActionButton>
          </div>
        </div>
      )}

      <RecordShell
        header={
          <RecordHeader
            title={project.title}
            status={STATE_LABEL[project.status] ?? project.status}
            statusTone={project.status === 'active' ? 'good'
              : project.status === 'completed' ? 'accent'
                : project.status === 'cancelled' ? 'bad'
                  // Testing, handover and closeout are the stages where a project is being handed
                  // to someone else. They are not "fine" and not "finished" — warn reads them right.
                  : project.status === 'testing' || project.status === 'handover' || project.status === 'closeout' ? 'warn'
                    : 'neutral'}
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
        related={related.length ? { title: 'Where this project came from', groups: related } : undefined}
      >
        {tab === 'overview' && <><CrossDomainHealthPanel health={crossHealth} /><ControlsOverviewPanel project={project} wbs={wbs} cbs={cbs} maps={maps} variations={variations} impact={impact} evm={evm} closeout={closeout} closeoutDone={closeoutDone} /></>}
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

        {tab === 'risks' && <RiskIssuePanel projectId={project.id} register={register} read={registerRead} busy={busy} call={call} />}

        {tab === 'closeout' && (
          <ClosePanel
            project={project}
            closeout={closeout}
            closeoutDone={closeoutDone}
            readiness={readiness}
            busy={busy}
            call={call}
          />
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

/** The record system owns the palette; this maps a tone to its variable rather than picking colours. */
const toneVar = (t: Tone): string =>
  t === 'good' ? 'var(--good)' : t === 'bad' ? 'var(--bad)' : t === 'warn' ? 'var(--warn)' : t === 'accent' ? 'var(--accent)' : 'var(--text)';

/**
 * Cross-domain health (§24) — what is wrong, how serious, who owns it, and what nobody could judge.
 *
 * Severity and coverage are shown as two separate statements because they ARE two: a project can
 * carry a known critical condition AND have evidence missing, and collapsing those into one badge
 * is precisely the defect this replaced. "CRITICAL · Partial evidence" is a real and common state.
 *
 * Every concern keeps the owning domain's name, the owning domain's words, and a link INTO that
 * domain. Project 360 explains and points; it is not the workshop where quality or HSE work gets
 * done — and a reader who cannot see who owns a problem cannot act on it.
 */
function CrossDomainHealthPanel({ health }: { health: CrossDomainHealth | null }) {
  if (!health) {
    return (
      <RecordCard title="Cross-domain health" span={2}>
        <p style={st.muted}>Health could not be read for this project.</p>
      </RecordCard>
    );
  }

  const tone = (state: string): Tone =>
    state === 'CRITICAL' ? 'bad' : state === 'AT_RISK' ? 'warn' : state === 'WATCH' ? 'warn' : state === 'CLEAR' ? 'good' : 'neutral';

  const headline = !health.applicable
    ? 'Not established'
    : health.severity === 'CLEAR'
      // "Clear" alone would read as a clean bill of health, which partial coverage has not earned.
      ? (health.coverage === 'COMPLETE' ? 'Nothing outstanding' : 'Not established')
      : health.severity === 'CRITICAL' ? 'Critical'
        : health.severity === 'AT_RISK' ? 'At risk'
          : 'Worth watching';

  return (
    <RecordCard title="Cross-domain health" span={2}>
      <div data-testid="cross-domain-health">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ fontSize: 15, color: toneVar(tone(health.severity)) }}>{headline}</strong>
        <span style={{ ...st.muted, fontSize: 12.5 }}>
          {health.coverage === 'COMPLETE'
            ? 'Every domain answered'
            : `${health.unknown.length} domain${health.unknown.length === 1 ? '' : 's'} could not be assessed`}
        </span>
      </div>

      {health.concerns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
          {health.concerns.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700, color: toneVar(tone(c.state)), minWidth: 62 }}>{c.state.replace('_', ' ')}</span>
              <span style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', minWidth: 96 }}>{c.domain}</span>
              <span style={{ fontSize: 13, flex: 1, minWidth: 180 }}>{c.reason}</span>
              {c.href && <a href={c.href} style={{ ...st.link, fontSize: 12.5, flexShrink: 0 }}>Open {c.domain} →</a>}
            </div>
          ))}
        </div>
      )}

      {health.unknown.length > 0 && (
        <div data-testid="health-unknown">
          <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>Could not be assessed</div>
          {health.unknown.map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0' }}>
              <span style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', minWidth: 96 }}>{u.domain}</span>
              <span style={{ ...st.muted, fontSize: 12.5, flex: 1 }}>{u.reason}</span>
            </div>
          ))}
          {/*
            Said plainly, because the alternative is a reader assuming the blank means fine. This
            is the sentence the whole two-axis design exists to make sayable.
          */}
          <p style={{ ...st.muted, fontSize: 12.5, marginTop: 8 }}>
            These are not clean results. Until each owning domain declares what its facts mean for
            project health, this project cannot be reported as fully assessed.
          </p>
        </div>
      )}

      {health.concerns.length === 0 && health.unknown.length === 0 && (
        <p style={st.muted}>Every domain answered, and none raised a condition.</p>
      )}
      </div>
    </RecordCard>
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

        {/*
          Approving the opening baseline — the evidence execution is gated on.
          Until this existed the gate was a dead end: it refused to start a project without an
          approved baseline, and nothing in the app could produce one. A rule the product cannot
          satisfy teaches people the product is broken, which is worse than having no rule.
        */}
        <div data-testid="wbs-baseline-control" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '10px 0 16px', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel-2)' }}>
          {project.wbsBaselineSnapshot?.baselineId ? (
            <span style={{ fontSize: 13 }}>
              <strong>Opening baseline approved</strong>
              {project.wbsBaselineSnapshot.approvedAt ? ` · ${fmt(project.wbsBaselineSnapshot.approvedAt)}` : ''}
              {project.wbsBaselineSnapshot.originalBac !== undefined ? ` · BAC AED ${aed(project.wbsBaselineSnapshot.originalBac)}` : ''}
            </span>
          ) : (
            <>
              <span style={{ ...st.muted, fontSize: 13 }}>
                {wbs.length === 0
                  ? 'Add at least one costed work package, then approve the opening baseline — execution is measured against it.'
                  : 'No opening baseline yet. Approving one freezes the planned value of every leaf package as the measure performance is judged against.'}
              </span>
              <ActionButton
                onClick={() => void call(`/api/projects/projects/${project.id}/wbs-baseline`, 'POST', {}, 'Opening baseline approved.')}
                disabled={busy || wbs.length === 0}
                title={wbs.length === 0 ? 'There are no work packages to baseline yet' : undefined}
              >
                Approve opening baseline
              </ActionButton>
            </>
          )}
        </div>

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

const AREA_OPTIONS = [
  'DESIGN', 'PROCUREMENT', 'SCHEDULE', 'COST', 'QUALITY', 'SAFETY',
  'RESOURCE', 'CLIENT', 'AUTHORITY', 'SUBCONTRACTOR', 'INTERFACE', 'OTHER',
] as const;

const areaLabel = (a: string): string => a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, ' ');

/** Terminal risk states, where the register is read-only. */
const RISK_CLOSED = ['RESOLVED', 'MATERIALISED'];

/**
 * §21 — Risks & Issues.
 *
 * TWO REGISTERS, NOT ONE LIST. A risk is an uncertain future event; an issue is a condition that
 * exists now. They have different lifecycles, different severity vocabularies and different
 * questions, so they get different tables. Blending them would answer neither question.
 *
 * THE SEVERITY SCALES ARE DELIBERATELY DIFFERENT. A risk shows LOW/MEDIUM/HIGH/CRITICAL, which is
 * COMPUTED from likelihood x impact and cannot be typed in. An issue shows minor/major/critical,
 * which is DECLARED, because an issue has already happened and has no likelihood to compute from.
 * The forms reflect that: the risk form has no severity field at all.
 *
 * WHAT "IT HAPPENED" DOES. It creates an issue and retires the risk as MATERIALISED — two records,
 * so the register can still say afterwards whether the problem was foreseen. It never edits the
 * risk into an issue, because that would erase the forecast.
 */
function RiskIssuePanel({
  projectId, register, read, busy, call,
}: { projectId: string; register: RiskRegister | null; read: boolean; busy: boolean; call: Action }) {
  const [riskTitle, setRiskTitle] = useState('');
  const [riskArea, setRiskArea] = useState<string>('OTHER');
  const [likelihood, setLikelihood] = useState('medium');
  const [impact, setImpact] = useState('medium');
  const [riskOwner, setRiskOwner] = useState('');
  const [riskTarget, setRiskTarget] = useState('');
  const [riskMitigation, setRiskMitigation] = useState('');

  const [issueTitle, setIssueTitle] = useState('');
  const [issueArea, setIssueArea] = useState<string>('OTHER');
  const [issueSeverity, setIssueSeverity] = useState('major');
  const [issueOwner, setIssueOwner] = useState('');
  const [issueDue, setIssueDue] = useState('');

  /** The actions that cannot proceed without a sentence, gathered in one place. */
  const [pending, setPending] = useState<{ kind: 'accept' | 'materialise' | 'resolve' | 'withdraw'; id: string; label: string } | null>(null);
  const [note, setNote] = useState('');

  const risks = register?.risks ?? [];
  const issues = register?.issues ?? [];
  const rs = register?.riskSummary;
  const is = register?.issueSummary;
  const issueByOriginRisk = useMemo(
    () => new Map(issues.filter((i) => i.originRiskId).map((i) => [i.originRiskId as string, i])),
    [issues],
  );

  const raiseRisk = async (): Promise<void> => {
    if (!riskTitle.trim()) return;
    if (await call('/api/projects/risks', 'POST', {
      projectId, title: riskTitle.trim(), area: riskArea, likelihood, impact,
      owner: riskOwner.trim() || undefined, targetDate: riskTarget || undefined,
      mitigation: riskMitigation.trim() || undefined,
    }, 'Risk added to the register.')) {
      setRiskTitle(''); setRiskOwner(''); setRiskTarget(''); setRiskMitigation('');
    }
  };

  const raiseIssue = async (): Promise<void> => {
    if (!issueTitle.trim()) return;
    if (await call('/api/projects/issues', 'POST', {
      projectId, title: issueTitle.trim(), area: issueArea, severity: issueSeverity,
      owner: issueOwner.trim() || undefined, dueDate: issueDue || undefined,
    }, 'Issue raised.')) {
      setIssueTitle(''); setIssueOwner(''); setIssueDue('');
    }
  };

  const submitPending = async (): Promise<void> => {
    if (!pending || !note.trim()) return;
    const ok = pending.kind === 'accept'
      ? await call(`/api/projects/risks/${pending.id}/status`, 'PATCH', { status: 'ACCEPTED', note: note.trim() }, 'Risk accepted, with the reason recorded.')
      : pending.kind === 'materialise'
        ? await call(`/api/projects/projects/${projectId}/risks/${pending.id}/materialise`, 'POST', { severity: note.trim() }, 'Risk materialised into a live issue.')
        : await call(`/api/projects/issues/${pending.id}/status`, 'PATCH', { status: pending.kind === 'resolve' ? 'resolved' : 'withdrawn', note: note.trim() }, pending.kind === 'resolve' ? 'Issue resolved.' : 'Issue withdrawn.');
    if (ok) { setPending(null); setNote(''); }
  };

  const ask = (kind: 'accept' | 'materialise' | 'resolve' | 'withdraw', id: string, label: string): void => {
    setPending({ kind, id, label }); setNote('');
  };

  return <div style={{ display: 'grid', gap: 20 }} data-testid="project-risks-panel">
    {!read && <p style={st.muted} data-testid="risk-register-loading">Reading the register…</p>}
    {read && register === null && (
      <p style={st.muted} data-testid="risk-register-unavailable">
        The risk register could not be read. Nothing is claimed about this project&apos;s exposure.
      </p>
    )}

    {rs && is && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22 }} data-testid="risk-register-summary">
        <Stat label="Open risks" value={String(rs.open)} strong bad={rs.openCritical > 0} />
        <Stat label="Critical / high" value={`${rs.openCritical} / ${rs.openHigh}`} bad={rs.openCritical > 0} />
        <Stat label="Mitigations overdue" value={String(rs.overdueMitigations)} bad={rs.overdueMitigations > 0} />
        {/* Counted apart from resolved on purpose: a risk that LANDED is a failed forecast, and a
            register that reports it as a success teaches nobody anything. */}
        <Stat label="Risks that occurred" value={String(rs.materialised)} />
        <Stat label="Open issues" value={String(is.open)} strong bad={is.openCritical > 0} />
        <Stat label="Critical issues" value={String(is.openCritical)} bad={is.openCritical > 0} />
        <Stat label="Issues overdue" value={String(is.overdue)} bad={is.overdue > 0} />
        <Stat label="Foreseen as risks" value={String(is.fromRisk)} />
      </div>
    )}

    {pending && (
      <form
        data-testid="risk-issue-note-form"
        onSubmit={(e) => { e.preventDefault(); void submitPending(); }}
        style={{ ...authoringCard, borderColor: 'var(--accent)' }}
      >
        <h3 style={formTitle}>{pending.label}</h3>
        {pending.kind === 'materialise' ? (
          <>
            <label style={st.muted} htmlFor="materialise-severity">
              How much is this hurting delivery now? The risk&apos;s severity is not carried over — it was
              computed from a likelihood that has already resolved.
            </label>
            <select id="materialise-severity" aria-label="Issue severity" value={note} onChange={(e) => setNote(e.target.value)}>
              <option value="">Choose…</option>
              <option value="minor">Minor — must be resolved, delivery unchanged if it waits</option>
              <option value="major">Major — delivery is being damaged</option>
              <option value="critical">Critical — delivery is stopped, or will stop</option>
            </select>
          </>
        ) : (
          <>
            <label style={st.muted} htmlFor="governance-note">
              {pending.kind === 'accept'
                ? 'Why is this exposure being carried? An acceptance nobody had to justify is indistinguishable from an unattended risk.'
                : pending.kind === 'resolve'
                  ? 'What actually resolved it?'
                  : 'Why is this being withdrawn — duplicate, overtaken, or not a real issue?'}
            </label>
            <input id="governance-note" aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={busy || !note.trim()}>Confirm</button>
          <button className="btn btn-ghost" type="button" onClick={() => { setPending(null); setNote(''); }}>Cancel</button>
        </div>
      </form>
    )}

    <div style={authoringGrid}>
      <form data-testid="risk-authoring-form" onSubmit={(e) => { e.preventDefault(); void raiseRisk(); }} style={authoringCard}>
        <h3 style={formTitle}>Identify a risk</h3>
        <input aria-label="Risk title" placeholder="What might go wrong?" value={riskTitle} onChange={(e) => setRiskTitle(e.target.value)} />
        <select aria-label="Risk area" value={riskArea} onChange={(e) => setRiskArea(e.target.value)}>
          {AREA_OPTIONS.map((a) => <option key={a} value={a}>{areaLabel(a)}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <select aria-label="Likelihood" value={likelihood} onChange={(e) => setLikelihood(e.target.value)}>
            <option value="low">Likelihood: low</option><option value="medium">Likelihood: medium</option><option value="high">Likelihood: high</option>
          </select>
          <select aria-label="Impact" value={impact} onChange={(e) => setImpact(e.target.value)}>
            <option value="low">Impact: low</option><option value="medium">Impact: medium</option><option value="high">Impact: high</option>
          </select>
        </div>
        <input aria-label="Risk owner" placeholder="Owner (optional)" value={riskOwner} onChange={(e) => setRiskOwner(e.target.value)} />
        <input aria-label="Mitigation target date" type="date" value={riskTarget} onChange={(e) => setRiskTarget(e.target.value)} />
        <input aria-label="Mitigation" placeholder="Mitigation (optional)" value={riskMitigation} onChange={(e) => setRiskMitigation(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy}>Add to register</button>
        {/* No severity field, deliberately: it is the OUTPUT of likelihood x impact. A typed-in
            severity would be a number the matrix never produced. */}
        <small style={st.muted}>Severity is calculated from likelihood &times; impact — it is not entered.</small>
      </form>

      <form data-testid="issue-authoring-form" onSubmit={(e) => { e.preventDefault(); void raiseIssue(); }} style={authoringCard}>
        <h3 style={formTitle}>Raise an issue</h3>
        <input aria-label="Issue title" placeholder="What is going wrong now?" value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} />
        <select aria-label="Issue area" value={issueArea} onChange={(e) => setIssueArea(e.target.value)}>
          {AREA_OPTIONS.map((a) => <option key={a} value={a}>{areaLabel(a)}</option>)}
        </select>
        <select aria-label="Issue severity" value={issueSeverity} onChange={(e) => setIssueSeverity(e.target.value)}>
          <option value="minor">Minor — delivery unchanged if it waits</option>
          <option value="major">Major — delivery is being damaged</option>
          <option value="critical">Critical — delivery is stopped, or will stop</option>
        </select>
        <input aria-label="Issue owner" placeholder="Owner (optional)" value={issueOwner} onChange={(e) => setIssueOwner(e.target.value)} />
        <input aria-label="Issue due date" type="date" value={issueDue} onChange={(e) => setIssueDue(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={busy}>Raise issue</button>
        <small style={st.muted}>
          Not for an NCR, snag, RFI, incident, delay or variation — each of those has its own register that owns it.
        </small>
      </form>
    </div>

    <div>
      <h3 style={panelTitle}>Risk register</h3>
      {register === null ? <p style={st.muted}>—</p>
        : risks.length === 0 ? <p style={st.muted}>No risks identified. That is not the same as no risk.</p> : (
        <SimpleTable ariaLabel="Project risk register" headers={['Risk', 'Area', 'Severity', 'Owner', 'Target', 'Status', 'Actions']}>
          {risks.map((r) => {
            const closed = RISK_CLOSED.includes(r.status);
            const became = issueByOriginRisk.get(r.id);
            const overdue = !closed && r.targetDate !== null && register !== null && r.targetDate < register.asOf;
            return <tr key={r.id} data-testid="risk-row">
              <td>
                {r.title}
                {r.mitigation && <div style={st.muted}>Mitigation: {r.mitigation}</div>}
                {r.acceptanceReason && <div style={st.muted}>Accepted: {r.acceptanceReason}</div>}
                {became && <div style={st.muted}>Occurred — now issue &ldquo;{became.title}&rdquo;</div>}
              </td>
              <td>{areaLabel(r.area)}</td>
              <td>
                <span className={r.severity === 'CRITICAL' ? 'badge badge-bad' : 'badge'}>{r.severity}</span>
                <div style={st.muted}>{r.likelihood} &times; {r.impact}</div>
              </td>
              <td>{r.owner ?? '—'}</td>
              <td style={overdue ? { color: 'var(--bad)' } : undefined}>{r.targetDate ?? '—'}{overdue ? ' (overdue)' : ''}</td>
              <td><Status value={r.status} /></td>
              <td>
                {closed ? <span style={st.muted}>Closed</span> : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {r.status !== 'MITIGATING' && <button className="btn btn-ghost" disabled={busy} onClick={() => void call(`/api/projects/risks/${r.id}/status`, 'PATCH', { status: 'MITIGATING' }, 'Risk moved to mitigating.')}>Mitigate</button>}
                    {r.status !== 'ACCEPTED' && <button className="btn btn-ghost" disabled={busy} onClick={() => ask('accept', r.id, `Accept: ${r.title}`)}>Accept</button>}
                    <button className="btn btn-ghost" disabled={busy} onClick={() => void call(`/api/projects/risks/${r.id}/status`, 'PATCH', { status: 'RESOLVED' }, 'Risk closed — the exposure went away.')}>No longer a risk</button>
                    {/* The one path to MATERIALISED. It creates a record rather than editing one. */}
                    <button className="btn btn-primary" disabled={busy} onClick={() => ask('materialise', r.id, `This has happened: ${r.title}`)}>It happened</button>
                  </div>
                )}
              </td>
            </tr>;
          })}
        </SimpleTable>
      )}
    </div>

    <div>
      <h3 style={panelTitle}>Issue register</h3>
      {register === null ? <p style={st.muted}>—</p>
        : issues.length === 0 ? <p style={st.muted}>No issues raised.</p> : (
        <SimpleTable ariaLabel="Project issue register" headers={['Issue', 'Area', 'Severity', 'Owner', 'Raised', 'Due', 'Status', 'Actions']}>
          {issues.map((i) => {
            const open = i.status === 'open' || i.status === 'in_progress';
            const overdue = open && i.dueDate !== null && register !== null && i.dueDate < register.asOf;
            return <tr key={i.id} data-testid="issue-row">
              <td>
                {i.title}
                {i.originRiskId && <div style={st.muted}>Foreseen — materialised from the risk register</div>}
                {i.resolution && <div style={st.muted}>{i.status === 'resolved' ? 'Resolved' : 'Withdrawn'}: {i.resolution}</div>}
                {/* References POINT. Resolving this issue closes none of them. */}
                {i.references.length > 0 && (
                  <div style={st.muted}>
                    References: {i.references.map((ref) => ref.label ?? `${ref.module}/${ref.recordType}`).join(', ')}
                    {' — resolving this issue does not close them.'}
                  </div>
                )}
              </td>
              <td>{areaLabel(i.area)}</td>
              <td><span className={i.severity === 'critical' ? 'badge badge-bad' : 'badge'}>{i.severity}</span></td>
              <td>{i.owner ?? '—'}</td>
              <td>{i.raisedAt.slice(0, 10)}</td>
              <td style={overdue ? { color: 'var(--bad)' } : undefined}>{i.dueDate ?? '—'}{overdue ? ' (overdue)' : ''}</td>
              <td><Status value={i.status} /></td>
              <td>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {i.status === 'open' && <button className="btn btn-ghost" disabled={busy} onClick={() => void call(`/api/projects/issues/${i.id}/status`, 'PATCH', { status: 'in_progress' }, 'Issue taken on.')}>Start work</button>}
                  {open && <button className="btn btn-primary" disabled={busy} onClick={() => ask('resolve', i.id, `Resolve: ${i.title}`)}>Resolve</button>}
                  {open && <button className="btn btn-ghost" disabled={busy} onClick={() => ask('withdraw', i.id, `Withdraw: ${i.title}`)}>Withdraw</button>}
                  {!open && <button className="btn btn-ghost" disabled={busy} onClick={() => void call(`/api/projects/issues/${i.id}/status`, 'PATCH', { status: 'open' }, 'Issue reopened.')}>Reopen</button>}
                </div>
              </td>
            </tr>;
          })}
        </SimpleTable>
      )}
    </div>
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
/**
 * Closeout — readiness first, checklist second.
 *
 * The checklist used to BE the gate: tick eight boxes and the project could close with open
 * critical NCRs and an incomplete SAT, because no box was ever checked against the domain that
 * owns it. It is now one voice among five, and the verdict comes from the same service that
 * refuses the write, so this panel cannot promise a close that finalization would reject.
 *
 * Every domain gets its own line with its own reason. A single green/red badge would answer
 * "can I close?" and not "what do I have to do", and the second question is the one being asked
 * by anyone reading this screen.
 */
function ClosePanel({
  project, closeout, closeoutDone, readiness, busy, call,
}: {
  project: Project360Project;
  closeout: Closeout | null;
  closeoutDone: number;
  readiness: CloseoutReadiness | null;
  busy: boolean;
  call: Action;
}) {
  const TONE: Record<ReadinessState, { color: string; label: string }> = {
    pass: { color: 'var(--good)', label: 'PASS' },
    blocked: { color: 'var(--bad)', label: 'BLOCKED' },
    unknown: { color: 'var(--warn)', label: 'UNVERIFIED' },
  };

  const headline = !readiness
    ? { text: 'Readiness could not be established', tone: 'var(--warn)' }
    : readiness.ready
      ? { text: 'READY TO CLOSE', tone: 'var(--good)' }
      : {
        text: `CLOSEOUT BLOCKED — ${readiness.blocked.length} blocker${readiness.blocked.length === 1 ? '' : 's'}`
          + (readiness.unknown.length ? ` + ${readiness.unknown.length} unverified domain${readiness.unknown.length === 1 ? '' : 's'}` : ''),
        tone: readiness.blocked.length ? 'var(--bad)' : 'var(--warn)',
      };

  return (
    <div data-testid="project-closeout-panel">
      <CardGrid>
        <RecordCard title="Closeout readiness" span={2}>
          <div data-testid="closeout-verdict" style={{ fontSize: 15, fontWeight: 800, color: headline.tone, marginBottom: 4 }}>
            {headline.text}
          </div>
          {!readiness ? (
            <p style={st.muted}>
              The readiness assessment is not available. It is not being treated as a pass: finalizing
              is refused while any domain is unverified, so this must be resolved rather than worked
              around.
            </p>
          ) : (
            <>
              <p style={st.muted}>
                Assembled from the domains that own each record — Project 360 asks, it does not decide.
                This is the same verdict finalization enforces, so nothing here can promise a close
                the write would refuse.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
                {readiness.checks.map((check) => (
                  <div key={check.id} data-testid={`readiness-${check.id}`} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ width: 92, flexShrink: 0, fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4, color: TONE[check.state].color }}>
                      {TONE[check.state].label}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ fontSize: 13 }}>{check.label}</strong>
                      {check.detail && <div style={{ ...st.muted, marginTop: 2 }}>{check.detail}</div>}
                    </span>
                    {check.href && check.state !== 'pass' && (
                      <a href={check.href} style={{ ...st.link, fontSize: 12.5, flexShrink: 0 }}>Open {check.domain} →</a>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </RecordCard>

        <RecordCard title="Handover checklist" span={2}>
          {!closeout ? (
            <>
              <p style={st.muted}>
                Not started. The checklist records the handover pack — as-builts, O&amp;M manuals,
                T&amp;C certificates, DLP — and is one of the readiness checks above, not the whole gate.
              </p>
              <ActionButton
                disabled={busy}
                onClick={() => void call('/api/projects/closeouts', 'POST', { projectId: project.id, projectName: project.title }, 'Closeout checklist started.')}
              >
                Start closeout checklist
              </ActionButton>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <span className={closeout.status === 'finalized' ? 'badge badge-good' : 'badge'}>{closeout.status}</span>
                <span style={st.muted}>{closeoutDone}/{closeout.items.length} items done</span>
                {closeout.handoverDate && <span style={st.muted}>Handover {closeout.handoverDate}</span>}
                {closeout.dlpEndDate && <span style={st.muted}>DLP until {closeout.dlpEndDate}</span>}
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

              {closeout.status !== 'finalized' && (
                <div style={{ marginTop: 12 }}>
                  <ActionButton
                    // Disabled on the SAME verdict the server enforces, so the button is not a
                    // guess at what finalization will allow. A missing assessment disables it too:
                    // the write refuses an unverified project, and offering the click anyway would
                    // be the "looks usable, gets refused" failure this codebase keeps fixing.
                    disabled={busy || !readiness?.ready}
                    onClick={() => void call(
                      `/api/projects/closeouts/${closeout.id}/finalize`,
                      'POST',
                      { handoverDate: new Date().toISOString().slice(0, 10) },
                      'Closeout finalized — now complete the project to close the contract.',
                    )}
                  >
                    Finalize closeout
                  </ActionButton>
                  {!readiness?.ready && (
                    <p style={st.muted}>
                      {readiness
                        ? 'Clear the blockers above first. Finalization is refused while any domain blocks or cannot be read.'
                        : 'Readiness is unavailable, and finalization is refused until it can be established.'}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </RecordCard>
      </CardGrid>
    </div>
  );
}

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

  /**
   * Why a package's progress is not editable, or null when it is.
   *
   * These mirror `WbsService.updateProgress`, which throws on both when the authority is manual:
   * a node carrying a DeliveryItemMap earns from the installed quantity recorded on site, and a
   * node with children earns by roll-up. Offering an input the server will refuse is the
   * "click and hope" failure this codebase keeps having to fix — and here it would be worse than
   * a swallowed click, because the number typed would look authored until the save came back.
   */
  const parents = new Set(wbs.map((n) => n.parentId).filter((id): id is string => id !== null));
  const mapped = new Set(maps.map((m) => m.wbsNodeId).filter((id): id is string => id !== null));
  const governance = (node: WbsNode): string | null =>
    mapped.has(node.id) ? 'derived from installed quantity'
      : parents.has(node.id) ? 'rolled up from children'
        : null;

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
                  const governed = governance(node);
                  return (
                    <tr key={node.id}>
                      <td style={cellMono}>{node.code}</td>
                      <td>{node.title}</td>
                      <td style={{ textAlign: 'right' }}>{node.plannedValueKnown === false ? 'Unknown' : `AED ${aed(node.plannedValue)}`}</td>
                      <td style={{ textAlign: 'right' }}>AED {aed(node.earnedValue)}</td>
                      <td>
                        {governed ? (
                          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                            <strong>{node.progress}%</strong>
                            <span style={{ ...st.muted, fontSize: 12 }}>{governed}</span>
                          </span>
                        ) : (
                          <>
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
                          </>
                        )}
                      </td>
                      <td>
                        {!governed && pending !== undefined && pending !== String(node.progress) && (
                          <ActionButton
                            disabled={busy}
                            onClick={async () => {
                              const value = Number(pending);
                              if (!Number.isFinite(value) || value < 0 || value > 100) return;
                              if (await call(`/api/projects/wbs/${node.id}/progress`, 'PATCH', { progress: value }, `${node.code} progress updated.`)) {
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
            Progress drives earned value, and earned value drives CPI and SPI. Two kinds of package
            are read-only here, and the domain refuses a manual write to either
            (<code>wbs.service.ts</code>): one mapped to a commercial item earns from the installed
            quantity recorded on site, and a parent earns from its children. Typing over those would
            be authoring a number the ledger already owns.
          </p>
          <p style={st.muted}>
            Actual cost is not editable at all: it is a Cost Ledger projection, and typing over a
            projection would make the two disagree.
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
