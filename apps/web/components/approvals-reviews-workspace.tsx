'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, BadgeCheck, CheckCircle2, Clock3, Eye, History, Inbox, RotateCcw, Search, ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import AuraTabLink from '@/components/aura-tab-link';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import { composeDecisionQueue, type ApiDecisionItem, type DecisionActionRequired, type DecisionAssignment, type SharedDecisionDocument } from '@/lib/decision-assignments';
import styles from './approvals-reviews-workspace.module.css';

type View = 'INBOX' | 'REVIEW' | 'APPROVAL' | 'SIGN_OFF' | 'RETURNED' | 'WAITING' | 'COMPLETED';

const viewMeta: Array<{ key: View; label: string; icon: typeof Inbox }> = [
  { key: 'INBOX', label: 'Inbox', icon: Inbox },
  { key: 'REVIEW', label: 'To Review', icon: Eye },
  { key: 'APPROVAL', label: 'To Approve', icon: CheckCircle2 },
  { key: 'SIGN_OFF', label: 'Sign-off / Decision', icon: BadgeCheck },
  { key: 'RETURNED', label: 'Returned', icon: RotateCcw },
  { key: 'WAITING', label: 'Waiting', icon: Clock3 },
  { key: 'COMPLETED', label: 'Completed', icon: History },
];

function actionLabel(action: DecisionActionRequired): string {
  return ({ REVIEW: 'Review', APPROVAL: 'Approval', SIGN_OFF: 'Sign-off', DECISION: 'Decision', ACKNOWLEDGEMENT: 'Acknowledge', COMMENT: 'Comment' })[action];
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Date not supplied';
  return new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMoney(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(DISPLAY_LOCALE, { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(value);
}

function countForView(items: DecisionAssignment[], view: View): number {
  if (view === 'INBOX') return items.length;
  if (view === 'SIGN_OFF') return items.filter((item) => item.actionRequired === 'SIGN_OFF' || item.actionRequired === 'DECISION').length;
  if (view === 'RETURNED') return items.filter((item) => item.state === 'RETURNED').length;
  if (view === 'WAITING') return items.filter((item) => item.state === 'WAITING').length;
  if (view === 'COMPLETED') return items.filter((item) => item.state === 'COMPLETED').length;
  return items.filter((item) => item.actionRequired === view).length;
}

export default function ApprovalsReviewsWorkspace({ decisions, sharedDocuments }: { decisions: ApiDecisionItem[] | null; sharedDocuments: SharedDecisionDocument[] | null }) {
  const allItems = useMemo(() => composeDecisionQueue(decisions, sharedDocuments), [decisions, sharedDocuments]);
  const unavailableSources = [decisions === null ? 'domain decisions' : null, sharedDocuments === null ? 'document access' : null].filter((value): value is string => value !== null);
  const [view, setView] = useState<View>('INBOX');
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('ALL');
  const [kind, setKind] = useState('ALL');
  const [source, setSource] = useState('ALL');

  const domains = useMemo(() => [...new Set(allItems.map((item) => item.domain))].sort(), [allItems]);
  const kinds = useMemo(() => [...new Set(allItems.map((item) => item.kind))].sort(), [allItems]);
  const formal = allItems.filter((item) => item.isFormalAssignment);
  const reviewCount = formal.filter((item) => item.actionRequired === 'REVIEW').length;
  const approvalCount = formal.filter((item) => item.actionRequired === 'APPROVAL').length;
  const decisionCount = formal.filter((item) => item.actionRequired === 'SIGN_OFF' || item.actionRequired === 'DECISION').length;
  const workflowLinkedCount = allItems.filter((item) => item.workflow !== null).length;

  const visible = allItems.filter((item) => {
    if (view === 'REVIEW' && item.actionRequired !== 'REVIEW') return false;
    if (view === 'APPROVAL' && item.actionRequired !== 'APPROVAL') return false;
    if (view === 'SIGN_OFF' && item.actionRequired !== 'SIGN_OFF' && item.actionRequired !== 'DECISION') return false;
    if (view === 'RETURNED' && item.state !== 'RETURNED') return false;
    if (view === 'WAITING' && item.state !== 'WAITING') return false;
    if (view === 'COMPLETED' && item.state !== 'COMPLETED') return false;
    if (domain !== 'ALL' && item.domain !== domain) return false;
    if (kind !== 'ALL' && item.kind !== kind) return false;
    if (source === 'WORKFLOW_LINKED' && item.workflow === null) return false;
    if (source === 'DOMAIN_ONLY' && (item.source !== 'DERIVED_DOMAIN_STATE' || item.workflow !== null)) return false;
    if (source === 'DMS_PERMISSION' && item.source !== 'DMS_PERMISSION') return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${item.title} ${item.detail} ${item.domain} ${item.kind} ${item.displayAction}`.toLowerCase().includes(needle);
  });

  const unavailableView = view === 'RETURNED' || view === 'WAITING' || view === 'COMPLETED';
  const firstFormal = formal[0];

  return (
    <div className={styles.workspace}>
      <section className={styles.hero}>
        <div><span className={styles.eyebrow}>MY WORK · DECIDE</span><h1>Approvals &amp; Reviews</h1><p>Your universal decision queue. Original records and final authority remain in their source workspace.</p></div>
        <div className={styles.heroSignal}><ShieldCheck aria-hidden /><span><b>Decision-safe</b><small>No record copies. No unverified approval actions.</small></span></div>
      </section>

      <section className={styles.metrics} aria-label="Decision queue summary">
        <Metric icon={Eye} value={reviewCount} label="To review" tone="blue" />
        <Metric icon={CheckCircle2} value={approvalCount} label="To approve" tone="green" />
        <Metric icon={Workflow} value={decisionCount} label="Sign-off / decisions" tone="orange" />
        <Metric icon={Workflow} value={workflowLinkedCount} label="Workflow-linked" tone="violet" />
      </section>

      <section className={styles.boundary}>
        <div><ShieldCheck aria-hidden /><span><b>Clear ownership</b><small>Domain owns the record · Workflow owns the decision · My Work owns your attention</small></span></div>
        <span className={styles.boundaryTag}>Tasks and My Day are not duplicated here</span>
      </section>
      {unavailableSources.length > 0 && (
        <section className={styles.sourceWarning} role="status">
          <AlertTriangle aria-hidden />
          <span><b>Source coverage is partial</b><small>{unavailableSources.join(' and ')} {unavailableSources.length === 1 ? 'is' : 'are'} currently unavailable. Zero is not presented as a verified empty queue.</small></span>
        </section>
      )}

      <div className={styles.layout}>
        <aside className={styles.rail} aria-label="Approval views">
          <p>DECISION VIEWS</p>
          {viewMeta.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" className={view === key ? styles.viewActive : styles.viewButton} onClick={() => setView(key)}>
              <Icon aria-hidden /><span>{label}</span><b>{countForView(allItems, key)}</b>
            </button>
          ))}
          <div className={styles.railNote}><AlertTriangle aria-hidden /><p><b>Coverage truth</b>Verified workflow state and history are linked where an exact record mapping exists. Returned, waiting and due dates still require a real assignment model.</p></div>
        </aside>

        <main className={styles.queue}>
          <div className={styles.queueHead}><div><span className={styles.eyebrow}>UNIVERSAL WORK QUEUE</span><h2>{viewMeta.find((item) => item.key === view)?.label}</h2></div><span className={styles.resultCount}>{visible.length} visible</span></div>
          <div className={styles.filters}>
            <label className={styles.search}><Search aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search record, project, requester…" aria-label="Search decisions" /></label>
            <select value={domain} onChange={(event) => setDomain(event.target.value)} aria-label="Filter by domain"><option value="ALL">All domains</option>{domains.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Filter by record type"><option value="ALL">All record types</option>{kinds.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={source} onChange={(event) => setSource(event.target.value)} aria-label="Filter by source"><option value="ALL">All sources</option><option value="WORKFLOW_LINKED">Workflow-linked</option><option value="DOMAIN_ONLY">Domain only</option><option value="DMS_PERMISSION">Document access</option></select>
          </div>

          {visible.length ? (
            <div className={styles.table} role="table" aria-label="Approvals and reviews">
              <div className={styles.tableHead} role="row"><span>ACTION</span><span>RECORD</span><span>SOURCE</span><span>VALUE</span><span>CREATED</span><span aria-hidden /></div>
              {visible.map((item) => <DecisionRow key={item.key} item={item} />)}
            </div>
          ) : (
            <div className={styles.empty}>{unavailableView ? <Clock3 aria-hidden /> : unavailableSources.length ? <AlertTriangle aria-hidden /> : <Search aria-hidden />}<h3>{unavailableView ? 'No verified items in this view' : unavailableSources.length ? 'Decision sources are unavailable' : 'No matching decisions'}</h3><p>{unavailableView ? 'AURA has not received a verified assignment state for this view. Workflow history is shown only on records with an exact link.' : unavailableSources.length ? 'AURA could not verify a complete queue from the connected sources. No placeholder records or false zero state were added.' : 'Try changing the search or filters. No placeholder records were added.'}</p></div>
          )}
        </main>
      </div>

      <section className={styles.aiBrief}>
        <Sparkles aria-hidden />
        <div><span className={styles.eyebrow}>AURA DECISION SUPPORT</span><h2>{firstFormal ? `${firstFormal.title} is first in the current source order.` : 'No formal decision is available.'}</h2><p>{formal.length} formal source decisions are visible; {workflowLinkedCount} have exact Workflow evidence. Assignment and due date remain unverified until the assignment model is connected.</p></div>
        {firstFormal && <AuraTabLink href={firstFormal.href} tabTitle={firstFormal.title} tabType={firstFormal.kind} className={styles.aiAction}>Open source record <ArrowRight aria-hidden /></AuraTabLink>}
      </section>
    </div>
  );
}

function Metric({ icon: Icon, value, label, tone }: { icon: typeof Eye; value: number; label: string; tone: string }) {
  return <article className={`${styles.metric} ${styles[tone]}`}><Icon aria-hidden /><span><b>{value}</b><small>{label}</small></span></article>;
}

function DecisionRow({ item }: { item: DecisionAssignment }) {
  const workflow = item.workflow;
  return (
    <AuraTabLink href={item.href} tabTitle={item.title} tabType={item.source === 'DMS_PERMISSION' ? 'PDF' : item.kind} tabKey={item.tabKey} className={styles.row} role="row">
      <span className={styles.actionCell}><b>{actionLabel(item.actionRequired)}</b><small>{workflow ? workflow.currentState.toUpperCase() : item.state === 'AVAILABLE' ? 'ACCESS AVAILABLE' : item.state}</small></span>
      <span className={styles.recordCell}><strong>{item.title}</strong><small>{item.detail || item.kind}</small><em>{item.assignmentLabel}</em>{item.workflowLabel && workflow && <em className={styles.workflowEvidence}>{item.workflowLabel} · {workflow.historyCount} history event{workflow.historyCount === 1 ? '' : 's'}</em>}</span>
      <span className={styles.sourceCell}><b>{item.domain}</b><small>{item.kind}</small></span>
      <span className={styles.valueCell}>{formatMoney(item.value)}</span>
      <span className={styles.dateCell}>{formatDate(item.createdAt)}</span>
      <span className={styles.openCell}><span>Open original</span><ArrowRight aria-hidden /></span>
    </AuraTabLink>
  );
}
