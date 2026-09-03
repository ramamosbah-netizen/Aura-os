'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  GitBranch,
  Plus,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import styles from './variations-client.module.css';

interface Project {
  id: string;
  title: string;
  value: number;
}

interface Variation {
  id: string;
  projectId: string;
  projectTitle: string | null;
  title: string;
  type: 'addition' | 'omission';
  amount: number;
  signedAmount: number;
  status: string;
  createdAt: string;
  reference?: string | null;
  description?: string | null;
}

interface Summary {
  project: { id: string; title: string; value: number } | null;
  impact: {
    originalValue: number;
    approvedAdditions: number;
    approvedOmissions: number;
    netVariation: number;
    revisedValue: number;
    approvedCount: number;
    pendingCount: number;
  };
}

type StatusFilter = 'all' | 'draft' | 'submitted' | 'approved' | 'rejected';

const statusMeta: Record<string, { label: string; hint: string; tone: string }> = {
  draft: { label: 'Draft', hint: 'Needs submission', tone: 'draft' },
  submitted: { label: 'Pending approval', hint: 'Awaiting decision', tone: 'submitted' },
  approved: { label: 'Approved', hint: 'Value effect applied', tone: 'approved' },
  rejected: { label: 'Rejected', hint: 'No value effect', tone: 'rejected' },
};

function money(n: number): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n);
}

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function safeStatus(status: string): { label: string; hint: string; tone: string } {
  return statusMeta[status] ?? { label: status, hint: 'Recorded state', tone: 'draft' };
}

export default function VariationsClient({ projects, initialVariations, initialFilter = 'all' }: { projects: Project[]; initialVariations: Variation[]; initialFilter?: StatusFilter }) {
  const [variations, setVariations] = useState<Variation[]>(initialVariations);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'addition' | 'omission'>('addition');
  const [amount, setAmount] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>(initialFilter);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const approved = useMemo(() => variations.filter((variation) => variation.status === 'approved'), [variations]);
  const pending = useMemo(() => variations.filter((variation) => variation.status === 'draft' || variation.status === 'submitted'), [variations]);
  const approvedAdditions = approved.filter((variation) => variation.type === 'addition').reduce((sum, variation) => sum + variation.amount, 0);
  const approvedOmissions = approved.filter((variation) => variation.type === 'omission').reduce((sum, variation) => sum + variation.amount, 0);
  const netApproved = approvedAdditions - approvedOmissions;

  const visibleVariations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return variations.filter((variation) => {
      const matchesFilter = filter === 'all' || variation.status === filter;
      const searchable = `${variation.title} ${variation.reference ?? ''} ${variation.projectTitle ?? ''}`.toLowerCase();
      return matchesFilter && (!needle || searchable.includes(needle));
    });
  }, [filter, query, variations]);

  async function refresh(): Promise<void> {
    const res = await fetch('/api/projects/variations', { cache: 'no-store' });
    if (res.ok) setVariations(await res.json());
  }

  async function loadSummary(pid: string): Promise<void> {
    if (!pid) {
      setSummary(null);
      return;
    }
    const res = await fetch(`/api/projects/variations/summary/${pid}`, { cache: 'no-store' });
    if (res.ok) setSummary(await res.json());
  }

  async function create(): Promise<void> {
    setErr('');
    setNotice('');
    if (!projectId || !title.trim() || !(Number(amount) > 0)) {
      setErr('Project, title and a positive amount are required.');
      return;
    }
    setBusy(true);
    const proj = projects.find((project) => project.id === projectId);
    try {
      const res = await fetch('/api/projects/variations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, projectTitle: proj?.title, reference: reference.trim() || undefined, description: description.trim() || undefined, title: title.trim(), type, amount: Number(amount) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.message ?? data.error ?? 'Could not create the variation.');
        return;
      }
      setTitle('');
      setReference('');
      setDescription('');
      setAmount('');
      setNotice('Draft variation created. Submit it when the scope and value are ready for approval.');
      await refresh();
      await loadSummary(projectId);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string): Promise<void> {
    setErr('');
    setNotice('');
    setBusyId(id);
    try {
      const res = await fetch(`/api/projects/variations/${id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.message ?? data.error ?? 'The change could not be updated.');
        return;
      }
      setNotice(status === 'approved' ? 'Variation approved. The revised value has been updated from the C6 authority.' : `Variation moved to ${safeStatus(status).label.toLowerCase()}.`);
      await refresh();
      if (summary?.project) await loadSummary(summary.project.id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.page} data-testid="variations-workspace">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><GitBranch size={14} /> PROJECTS / C6 CHANGE CONTROL</div>
          <h1>Changes with <em>commercial context.</em></h1>
          <p>Raise, review and approve project variation orders without losing the original contract truth. Approved changes are the only ones that move the revised project value.</p>
          <div className={styles.heroNotes}><span><CheckCircle2 size={14} /> Governed workflow</span><span><FileText size={14} /> Auditable decisions</span><span><Sparkles size={14} /> C6 authority</span></div>
        </div>
        <div className={styles.heroAction}><span className={styles.heroActionKicker}>Need to record a change?</span><a href="#raise-variation" className={styles.heroButton}><Plus size={16} /> Raise variation</a><small>Creates a draft — approval stays explicit.</small></div>
      </header>

      <section className={styles.metricGrid} aria-label="Variation overview">
        <Metric icon={GitBranch} label="Net approved" value={`${netApproved < 0 ? '−' : ''}${money(Math.abs(netApproved))}`} hint="Approved additions less omissions" tone="amber" negative={netApproved < 0} />
        <Metric icon={Clock3} label="Awaiting decision" value={String(pending.length)} hint="Draft or submitted changes" tone="blue" />
        <Metric icon={ArrowUpRight} label="Approved additions" value={money(approvedAdditions)} hint={`${approved.filter((variation) => variation.type === 'addition').length} approved change${approved.filter((variation) => variation.type === 'addition').length === 1 ? '' : 's'}`} tone="green" />
        <Metric icon={ArrowDownLeft} label="Approved omissions" value={money(approvedOmissions)} hint={`${approved.filter((variation) => variation.type === 'omission').length} approved reduction${approved.filter((variation) => variation.type === 'omission').length === 1 ? '' : 's'}`} tone="violet" />
      </section>

      <section className={styles.workspaceGrid}>
        <div className={styles.primaryColumn}>
          <section className={styles.raiseCard} id="raise-variation">
            <div className={styles.sectionHead}><div><span className={styles.kicker}>Controlled input</span><h2>Raise a project change</h2><p>Capture the commercial impact first. The draft remains outside the revised value until it is approved.</p></div><span className={styles.c6Badge}><GitBranch size={14} /> C6</span></div>
            <div className={styles.formGrid}>
              <label className={styles.fieldWide}><span>Project <b>*</b></span><select value={projectId} onChange={(event) => { setProjectId(event.target.value); void loadSummary(event.target.value); }}><option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title} · {money(project.value)}</option>)}</select></label>
              <label className={styles.fieldWide}><span>Change title <b>*</b></span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Additional MEP containment at level 03" /></label>
              <label><span>Reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="VO-001" /></label>
              <label><span>Change type <b>*</b></span><select value={type} onChange={(event) => setType(event.target.value as 'addition' | 'omission')}><option value="addition">Addition · increases value</option><option value="omission">Omission · reduces value</option></select></label>
              <label><span>Amount (AED) <b>*</b></span><input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
              <label className={styles.fieldWide}><span>Scope note</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the scope, reason or supporting instruction…" rows={2} /></label>
            </div>
            <div className={styles.formFooter}><span><CircleAlert size={14} /> Required fields are marked with *</span><button type="button" className={styles.primaryButton} disabled={busy || projects.length === 0} onClick={() => void create()}><Plus size={16} />{busy ? 'Creating draft…' : 'Create draft variation'}</button></div>
            {err && <div className={styles.feedbackError} role="alert"><X size={15} />{err}</div>}
            {notice && <div className={styles.feedbackSuccess} role="status"><Check size={15} />{notice}</div>}
          </section>

          <section className={styles.registerCard}>
            <div className={styles.sectionHead}><div><span className={styles.kicker}>Decision register</span><h2>Variation orders</h2><p>Every row stays tied to its project and approval state.</p></div><span className={styles.countPill}>{visibleVariations.length} of {variations.length}</span></div>
            <div className={styles.toolbar}><label className={styles.search}><Search size={15} /><span className={styles.srOnly}>Search variation orders</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, reference or project" /></label><div className={styles.filters} role="group" aria-label="Filter variation status"><SlidersHorizontal size={14} />{([['all', 'All'], ['draft', 'Draft'], ['submitted', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']] as Array<[StatusFilter, string]>).map(([value, label]) => <button key={value} type="button" className={filter === value ? styles.filterActive : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
            {visibleVariations.length === 0 ? <EmptyState hasRecords={variations.length > 0} onReset={() => { setQuery(''); setFilter('all'); }} /> : <div className={styles.registerList}>{visibleVariations.map((variation) => <VariationRow key={variation.id} variation={variation} busy={busyId === variation.id} onStatus={setStatus} />)}</div>}
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.impactCard}>
            <div className={styles.sectionHead}><div><span className={styles.kicker}>Project impact</span><h2>{summary?.project?.title ?? 'Select a project'}</h2></div><BriefcaseBusiness size={18} className={styles.sectionIcon} /></div>
            {summary?.project ? <><div className={styles.valueBridge}><ValueLine label="Original contract" value={money(summary.impact.originalValue)} /><div className={styles.bridgeLine}><ArrowRight size={14} /><span>approved effect</span></div><ValueLine label="Revised contract" value={money(summary.impact.revisedValue)} accent /></div><div className={styles.impactBreakdown}><span><b>+{money(summary.impact.approvedAdditions)}</b> additions</span><span><b>−{money(summary.impact.approvedOmissions)}</b> omissions</span><span><b>{summary.impact.pendingCount}</b> awaiting decision</span></div><Link className={styles.projectLink} href={`/project/${summary.project.id}/controls?tab=variations`}>Open Project 360 <ArrowRight size={14} /></Link></> : <div className={styles.sideEmpty}><BriefcaseBusiness size={22} /><strong>Choose a project to inspect impact</strong><span>Original and revised values stay separate until an approved change exists.</span></div>}
          </section>

          <section className={styles.flowCard}><span className={styles.kicker}>C6 decision path</span><h2>Move from request to effect</h2><FlowStep icon={FileText} number="01" title="Draft" detail="Scope and value captured" /><FlowStep icon={Send} number="02" title="Submit" detail="Ready for approval" /><FlowStep icon={CheckCircle2} number="03" title="Approve" detail="Value effect becomes authoritative" /><FlowStep icon={CalendarClock} number="04" title="Read back" detail="Project 360 reflects the change" /><p className={styles.flowFoot}><RotateCcw size={13} /> Rejected and pending changes never alter revised value.</p></section>

          <section className={styles.authorityCard}><GitBranch size={18} /><div><span className={styles.kicker}>Ownership</span><strong>C6 owns variation decisions.</strong><p>Contracts and Project 360 read the approved effect; they do not create a second approval path.</p></div></section>
        </aside>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint, tone, negative }: { icon: typeof GitBranch; label: string; value: string; hint: string; tone: string; negative?: boolean }) {
  return <div className={`${styles.metric} ${styles[`metric${tone[0].toUpperCase()}${tone.slice(1)}`]} ${negative ? styles.metricNegative : ''}`}><span className={styles.metricIcon}><Icon size={17} /></span><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>;
}

function ValueLine({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className={styles.valueLine}><span>{label}</span><strong className={accent ? styles.valueAccent : undefined}>{value}</strong></div>;
}

function FlowStep({ icon: Icon, number, title, detail }: { icon: typeof FileText; number: string; title: string; detail: string }) {
  return <div className={styles.flowStep}><span className={styles.flowNumber}>{number}</span><span className={styles.flowIcon}><Icon size={14} /></span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}

function VariationRow({ variation, busy, onStatus }: { variation: Variation; busy: boolean; onStatus: (id: string, status: string) => Promise<void> }) {
  const meta = safeStatus(variation.status);
  const isAddition = variation.type === 'addition';
  return <article className={styles.variationRow} data-testid="variation-row"><div className={`${styles.changeMark} ${isAddition ? styles.changeAdd : styles.changeOmit}`}>{isAddition ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}</div><div className={styles.variationMain}><div className={styles.variationTitleLine}><strong>{variation.title}</strong><span className={`${styles.statusTag} ${styles[`status${meta.tone[0].toUpperCase()}${meta.tone.slice(1)}`]}`}>{meta.label}</span></div><div className={styles.variationMeta}><span>{variation.projectTitle ?? `Project ${variation.projectId.slice(0, 8)}`}</span>{variation.reference && <><i /> <span>{variation.reference}</span></>}<i /><span>{shortDate(variation.createdAt)}</span></div>{variation.description && <p>{variation.description}</p>}</div><div className={`${styles.amount} ${isAddition ? styles.amountAdd : styles.amountOmit}`}><span>{isAddition ? '+' : '−'}</span>{money(variation.amount)}</div><div className={styles.rowActions}>{variation.status === 'draft' && <button type="button" className={styles.submitButton} disabled={busy} onClick={() => void onStatus(variation.id, 'submitted')}><Send size={13} />{busy ? 'Updating…' : 'Submit'}</button>}{variation.status === 'submitted' && <><button type="button" className={styles.approveButton} disabled={busy} onClick={() => void onStatus(variation.id, 'approved')}><Check size={13} />{busy ? 'Updating…' : 'Approve'}</button><button type="button" className={styles.rejectButton} disabled={busy} onClick={() => void onStatus(variation.id, 'rejected')}><X size={13} />Reject</button></>}{variation.status === 'approved' && <span className={styles.immutable}><CheckCircle2 size={13} /> In effect</span>}{variation.status === 'rejected' && <span className={styles.immutable}><X size={13} /> Closed</span>}</div></article>;
}

function EmptyState({ hasRecords, onReset }: { hasRecords: boolean; onReset: () => void }) {
  return <div className={styles.emptyState}><Search size={23} /><strong>{hasRecords ? 'No matching variations' : 'No variation orders yet'}</strong><span>{hasRecords ? 'Try another search or reset the status filter.' : 'Create the first controlled change above to start the C6 decision trail.'}</span>{hasRecords && <button type="button" onClick={onReset}>Reset filters</button>}</div>;
}
