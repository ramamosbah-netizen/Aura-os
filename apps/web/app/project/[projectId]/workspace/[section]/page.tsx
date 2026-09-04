import NextLink from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CircleAlert, ExternalLink, FileText, Layers3, Users } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { fetchJson, getJson } from '@/lib/api';
import { ProjectEdit } from '@/components/project-create';
import styles from './project-section-dashboard.module.css';
import setupStyles from './project-setup.module.css';
import AuraTabLink from '@/components/aura-tab-link';

export const dynamic = 'force-dynamic';

type ProjectLinkProps = Omit<ComponentProps<typeof NextLink>, 'href'> & { href: string };

function Link({ href, children, ...props }: ProjectLinkProps) {
  const tabTitle = typeof children === 'string' ? children.replace(/[↗→]/g, '').trim() : 'Project 360';
  return <AuraTabLink href={href} tabTitle={tabTitle || 'Project 360'} tabType="Project 360" {...props}>{children}</AuraTabLink>;
}

type Row = Record<string, unknown> & { id?: string; projectId?: string };
type Section = {
  slug: string;
  label: string;
  owner: string;
  description: string;
  sources: Array<{ label: string; endpoint: string }>;
  capabilities: Array<{ label: string; description: string; href: string }>;
  actions: Array<{ label: string; href: string }>;
};

const sections: Record<string, Omit<Section, 'slug' | 'sources' | 'capabilities' | 'actions'> & Partial<Pick<Section, 'sources' | 'capabilities' | 'actions'>>> = {
  project: {
    label: 'Project Setup', owner: 'Projects', description: 'Set up the awarded project, its scope, people and operating context.',
    sources: [{ label: 'Project record', endpoint: 'project' }],
    capabilities: [
      { label: 'Setup & scope', description: 'Project identity, scope and contract context', href: '#project-setup' },
      { label: 'Team & resources', description: 'Project organization and ownership', href: '/team' },
      { label: 'Systems & disciplines', description: 'Use the project lens to focus delivery', href: '' },
      { label: 'Project information', description: 'Controlled project context and key dates', href: '/documents' },
    ],
    actions: [{ label: 'Open project setup', href: '#project-setup' }, { label: 'Open team', href: '/team' }],
  },
  plan: {
    label: 'Plan & Control', owner: 'Projects', description: 'Coordinate schedule, WBS, progress, risk and governed changes.',
    sources: [
      { label: 'Schedules', endpoint: '/api/projects/schedules' }, { label: 'WBS', endpoint: '/api/projects/wbs' },
      { label: 'Delays', endpoint: '/api/projects/delays' }, { label: 'Changes', endpoint: '/api/projects/variations' },
    ],
    capabilities: [
      { label: 'Plan & schedule', description: 'Gantt, baseline and actual schedule', href: '/projects/schedule' },
      { label: 'WBS & progress', description: 'Work breakdown and earned progress', href: '/controls?tab=wbs' },
      { label: 'Project controls', description: 'CBS, quantities, cost and EVM', href: '/controls' },
      { label: 'Risks & issues', description: 'Record and review project constraints', href: '/controls?tab=risks' },
      { label: 'Changes & claims', description: 'Governed variations and time impact', href: '/controls?tab=variations' },
    ],
    actions: [{ label: 'Add task / milestone', href: '/projects/schedule' }, { label: 'Open controls', href: '/controls' }],
  },
  engineering: {
    label: 'Engineering', owner: 'Engineering', description: 'Control technical information, decisions and deliverables for this project.',
    sources: [
      { label: 'Drawings', endpoint: '/api/engineering/drawings' }, { label: 'RFIs', endpoint: '/api/engineering/rfis' },
      { label: 'Submittals', endpoint: '/api/engineering/submittals' }, { label: 'Technical queries', endpoint: '/api/engineering/technical-queries' },
    ],
    capabilities: [
      { label: 'Engineering workspace', description: 'Drawings, RFIs, submittals and technical actions', href: '/engineering' },
      { label: 'Drawings & revisions', description: 'Controlled drawings and approval history', href: '/engineering/drawings' },
      { label: 'Technical queries', description: 'Questions, responses and decisions', href: '/engineering' },
      { label: 'Deliverables', description: 'Technical documents and design changes', href: '/engineering' },
    ],
    actions: [{ label: 'Open engineering action', href: '/engineering' }, { label: 'Open drawing register', href: '/engineering/drawings' }],
  },
  procurement: {
    label: 'Procurement', owner: 'Supply Chain', description: 'Track project material requirements through the canonical procurement authority.',
    sources: [
      { label: 'Purchase requests', endpoint: '/api/procurement/purchase-requests' }, { label: 'Purchase orders', endpoint: '/api/procurement/purchase-orders' },
      { label: 'RFQs', endpoint: '/api/procurement/rfqs' },
    ],
    capabilities: [
      { label: 'Purchase requests', description: 'Material requirements and approvals', href: '/procurement/purchase-requests' },
      { label: 'RFQs & quotations', description: 'Supplier enquiries and responses', href: '/procurement/rfqs' },
      { label: 'Purchase orders', description: 'Approved commitments and status', href: '/procurement/purchase-orders' },
      { label: 'Suppliers', description: 'Supplier records and performance context', href: '/procurement/suppliers' },
    ],
    actions: [{ label: 'Material requirement', href: '/procurement/purchase-requests' }, { label: 'Open RFQ workspace', href: '/procurement/rfqs' }],
  },
  subcontracts: {
    label: 'Subcontracts', owner: 'Subcontracts', description: 'Tender and administer defined work packages after project award.',
    sources: [{ label: 'Subcontract packages', endpoint: '/api/subcontracts' }],
    capabilities: [
      { label: 'Packages & scope', description: 'Work package, BOQ and tender basis', href: '/subcontracts/subcontracts' },
      { label: 'Bidders & evaluation', description: 'Technical and commercial comparison', href: '/subcontracts/subcontracts' },
      { label: 'Claims & certification', description: 'Progress, certification and payment context', href: '/subcontracts/claims' },
      { label: 'Variations', description: 'Subcontract change and claim records', href: '/subcontracts/variations' },
    ],
    actions: [{ label: 'New package / RFQ', href: '/subcontracts/subcontracts' }, { label: 'Open claims', href: '/subcontracts/claims' }],
  },
  site: {
    label: 'Site', owner: 'Site', description: 'Coordinate field instructions, daily reporting, progress and site evidence.',
    sources: [
      { label: 'Daily reports', endpoint: '/api/site/daily-reports' }, { label: 'Instructions', endpoint: '/api/site/instructions' },
      { label: 'Delays', endpoint: '/api/site/delay-logs' }, { label: 'Labour', endpoint: '/api/site/labour' },
    ],
    capabilities: [
      { label: 'Work instructions', description: 'Issue and track field directions', href: '/site/instructions' },
      { label: 'Daily reports', description: 'Work completed, manpower and evidence', href: '/site/daily-reports' },
      { label: 'Progress & quantities', description: 'Installed progress and site activities', href: '/site/execution' },
      { label: 'Site control', description: 'Delays, labour and field constraints', href: '/site/control' },
    ],
    actions: [{ label: 'Work instruction', href: '/site/instructions' }, { label: 'Daily report', href: '/site/daily-reports' }],
  },
  quality: {
    label: 'Quality', owner: 'Quality', description: 'Manage inspections, NCRs, snags and corrective actions with evidence.',
    sources: [
      { label: 'NCRs', endpoint: '/api/quality/ncrs' }, { label: 'Inspections', endpoint: '/api/quality/irs' },
      { label: 'Snags', endpoint: '/api/quality/snags' }, { label: 'ITP', endpoint: '/api/quality/itps' },
    ],
    capabilities: [
      { label: 'Quality control', description: 'Inspections, NCRs, snags and corrective actions', href: '/quality/control' },
      { label: 'Inspection requests', description: 'Plan and review inspection requests', href: '/quality/inspection-requests' },
      { label: 'NCR register', description: 'Resolve non-conformance records', href: '/quality/ncrs' },
      { label: 'Snags & ITP', description: 'Punch items and inspection test plans', href: '/quality/snags' },
    ],
    actions: [{ label: 'Inspection', href: '/quality/inspection-requests' }, { label: 'NCR', href: '/quality/ncrs' }],
  },
  hse: {
    label: 'HSE', owner: 'HSE', description: 'Keep project work safe through permits, observations, incidents and actions.',
    sources: [
      { label: 'Permits', endpoint: '/api/hse/ptws' }, { label: 'Incidents', endpoint: '/api/hse/incidents' },
      { label: 'Corrective actions', endpoint: '/api/hse/capas' }, { label: 'Risk assessments', endpoint: '/api/hse/risk-assessments' },
    ],
    capabilities: [
      { label: 'HSE control', description: 'Safety operating picture and actions', href: '/hse/control' },
      { label: 'Permits', description: 'Permit-to-work lifecycle and expiry', href: '/hse/permits' },
      { label: 'Risk assessments', description: 'Approved risk controls for activities', href: '/hse/risk-assessments' },
      { label: 'Toolbox talks', description: 'Site safety briefings and training', href: '/hse/toolbox-talks' },
    ],
    actions: [{ label: 'Permit / safety action', href: '/hse/permits' }, { label: 'Open HSE control', href: '/hse/control' }],
  },
  commercial: {
    label: 'Commercial', owner: 'Projects / Finance', description: 'Read the authoritative contract, cost, certification and change position.',
    sources: [{ label: 'EVM', endpoint: 'evm' }, { label: 'Variation summary', endpoint: 'variation-summary' }, { label: 'Certificates', endpoint: 'certificates' }],
    capabilities: [
      { label: 'Project controls', description: 'Cost Ledger, quantities and commercial controls', href: '/controls?tab=cost' },
      { label: 'Changes & claims', description: 'Governed project variations and claims', href: '/controls?tab=variations' },
      { label: 'Certifications', description: 'Contract certificates and billing context', href: '/contracts/certificates' },
      { label: 'Finance context', description: 'Open the canonical finance workspace', href: '/finance/dashboard' },
    ],
    actions: [{ label: 'Variation', href: '/controls?tab=variations' }, { label: 'Open cost controls', href: '/controls?tab=cost' }],
  },
  documents: {
    label: 'Documents', owner: 'Document Control', description: 'Find controlled project information without duplicating the DMS.',
    sources: [{ label: 'Document register', endpoint: '/api/doccontrol/register' }, { label: 'Submittals', endpoint: '/api/doccontrol/submittals' }, { label: 'Transmittals', endpoint: '/api/doccontrol/transmittals' }],
    capabilities: [
      { label: 'Document register', description: 'Controlled records, revisions and status', href: '/doccontrol/register' },
      { label: 'Project documents', description: 'Project-scoped evidence and files', href: '/documents' },
      { label: 'Technical documents', description: 'Engineering-owned document context', href: '/engineering' },
      { label: 'Document history', description: 'Revision and audit context', href: '/doccontrol/register' },
    ],
    actions: [{ label: 'Open document register', href: '/doccontrol/register' }, { label: 'Open project documents', href: '/documents' }],
  },
  approvals: {
    label: 'Approvals & Actions', owner: 'Canonical approvals', description: 'See decisions and action state for this project without creating a second approval engine.',
    sources: [{ label: 'Decision inbox', endpoint: '/api/inbox' }],
    capabilities: [
      { label: 'Pending approvals', description: 'Project decisions waiting for action', href: '/my-work/approvals' },
      { label: 'Project actions', description: 'Contextual work raised by project records', href: '/my-work/approvals' },
      { label: 'Decision history', description: 'Completed and returned decisions', href: '/my-work/approvals' },
    ],
    actions: [{ label: 'Open project approvals', href: '/my-work/approvals' }],
  },
  testing: {
    label: 'Testing & Commissioning', owner: 'Commissioning', description: 'Track systems, tests, failures, retests and commissioning evidence.',
    sources: [{ label: 'Commissioning records', endpoint: '/api/commissioning/records' }, { label: 'Handovers', endpoint: '/api/commissioning/handovers' }],
    capabilities: [
      { label: 'Commissioning workspace', description: 'Systems, test records and readiness', href: '/commissioning' },
      { label: 'Systems & test plans', description: 'Test planning and system status', href: '/commissioning' },
      { label: 'Failed / retest', description: 'Resolve failed tests and retest evidence', href: '/commissioning' },
      { label: 'Certificates', description: 'Witness, acceptance and certificates', href: '/handover' },
    ],
    actions: [{ label: 'Test / commissioning action', href: '/commissioning' }, { label: 'Open handover records', href: '/handover' }],
  },
  handover: {
    label: 'Handover & Closeout', owner: 'Handover / Projects', description: 'Bring together readiness, outstanding items, acceptance and closeout evidence.',
    sources: [{ label: 'Closeout', endpoint: '/api/projects/closeouts' }, { label: 'Handover', endpoint: '/api/commissioning/handovers' }],
    capabilities: [
      { label: 'Handover readiness', description: 'Readiness and outstanding evidence', href: '/controls?tab=closeout' },
      { label: 'Snags & outstanding', description: 'Open completion items and closure', href: '/quality/snags' },
      { label: 'Acceptance & certificates', description: 'Commissioning and acceptance records', href: '/handover' },
      { label: 'Closeout controls', description: 'Final project closeout workflow', href: '/controls?tab=closeout' },
    ],
    actions: [{ label: 'Open closeout', href: '/controls?tab=closeout' }, { label: 'Open handover', href: '/handover' }],
  },
  activity: {
    label: 'Activity & History', owner: 'Read-only composition', description: 'Review the project timeline assembled from canonical records and audit events.',
    sources: [{ label: 'Audit activity', endpoint: '/api/audit' }],
    capabilities: [
      { label: 'Project activity', description: 'Recent changes across owning domains', href: '#' },
      { label: 'Documents history', description: 'Document revisions and events', href: '/doccontrol/register' },
      { label: 'Decision history', description: 'Approval and action history', href: '/my-work/approvals' },
    ],
    actions: [{ label: 'Open document history', href: '/doccontrol/register' }, { label: 'Open decision history', href: '/my-work/approvals' }],
  },
};

function contextHref(href: string, projectId: string): string {
  if (!href || href === '#') return `/project/${encodeURIComponent(projectId)}`;
  if (href.startsWith('#')) return `/project/${encodeURIComponent(projectId)}${href}`;
  if (href.includes('?')) return `${href}&projectId=${encodeURIComponent(projectId)}`;
  return `${href}?projectId=${encodeURIComponent(projectId)}`;
}

function projectRows(data: unknown, projectId: string): Row[] {
  if (!Array.isArray(data)) return data && typeof data === 'object' ? [data as Row] : [];
  return data.filter((row) => !row || typeof row !== 'object' || !('projectId' in row) || row.projectId === projectId) as Row[];
}

function statusOf(row: Row): string { return String(row.status ?? row.state ?? row.approvalStatus ?? '').toLowerCase(); }
function timestampOf(row: Row): string { return String(row.updatedAt ?? row.createdAt ?? row.date ?? row.dueDate ?? ''); }

export default async function ProjectSectionDashboardPage({ params }: { params: Promise<{ projectId: string; section: string }> }) {
  const { projectId, section: slug } = await params;
  const definition = sections[slug];
  if (!definition) notFound();
  const section: Section = { slug, sources: definition.sources ?? [], capabilities: definition.capabilities ?? [], actions: definition.actions ?? [], ...definition };
  const project = await getJson<Row>(`/api/projects/projects/${encodeURIComponent(projectId)}`);
  if (slug === 'project') return <ProjectSetupWorkspace projectId={projectId} project={project} />;
  const sourceResults = await Promise.all(section.sources.map(async (source) => {
    const endpoint = source.endpoint === 'project'
      ? `/api/projects/projects/${encodeURIComponent(projectId)}`
      : source.endpoint === 'evm'
        ? `/api/projects/projects/${encodeURIComponent(projectId)}/evm`
        : source.endpoint === 'variation-summary'
          ? `/api/projects/variations/summary/${encodeURIComponent(projectId)}`
          : source.endpoint === 'certificates'
            ? project?.contractId ? `/api/contracts/certificates/summary/${encodeURIComponent(String(project.contractId))}` : ''
            : source.endpoint;
    if (!endpoint) return { source, result: null };
    return { source, result: await fetchJson<unknown>(endpoint) };
  }));
  const records = sourceResults.flatMap(({ result }) => result?.ok ? projectRows(result.data, projectId) : []);
  const availableSources = sourceResults.filter(({ result }) => result?.ok).length;
  const unavailableSources = sourceResults.length - availableSources;
  const statusRows = records.filter((row) => statusOf(row));
  const attention = statusRows.filter((row) => /open|pending|overdue|failed|rejected|blocked|draft|requested|investigating|in_progress/i.test(statusOf(row))).slice(0, 5);
  const recent = records.filter((row) => Number.isFinite(Date.parse(timestampOf(row)))).sort((a, b) => Date.parse(timestampOf(b)) - Date.parse(timestampOf(a))).slice(0, 5);
  const sourceState = sourceResults.length === 0 ? 'Not established' : availableSources === 0 ? 'Unavailable' : unavailableSources > 0 ? 'Partial evidence' : 'Connected';
  const recordState = records.length ? `${records.length} record${records.length === 1 ? '' : 's'}` : 'No records';
  const attentionState = statusRows.length === 0 ? 'Not established' : String(attention.length);
  const projectTitle = String(project?.title ?? 'Project');

  return (
    <main className={styles.page} data-testid={`project-section-${slug}`}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link href={`/project/${encodeURIComponent(projectId)}`} className={styles.backLink}><ArrowLeft size={14} aria-hidden /> Project 360 overview</Link>
          <span className={styles.eyebrow}>PROJECT 360 / {section.label.toUpperCase()}</span>
          <h1>{section.label}</h1>
          <p>{section.description}</p>
          <div className={styles.contextLine}><span>{projectTitle}</span><b>·</b><span>{section.owner}</span><b>·</b><span>Project context preserved</span></div>
        </div>
        <div className={styles.heroActions}><span className={styles.sourceBadge}>{sourceState}</span>{section.actions[0] ? <Link className={styles.primaryAction} href={contextHref(section.actions[0].href, projectId)}>{section.actions[0].label}<ArrowRight size={14} aria-hidden /></Link> : null}</div>
      </header>

      <section className={styles.metricGrid} aria-label={`${section.label} summary`}>
        <article className={styles.metric}><span>Connected evidence</span><strong className={availableSources ? styles.toneGood : styles.toneMuted}>{recordState}</strong><small>{availableSources} of {sourceResults.length || 'no'} sources responding</small></article>
        <article className={styles.metric}><span>Needs attention</span><strong className={attentionState === 'Not established' ? styles.toneMuted : attention.length ? styles.toneWarn : styles.toneGood}>{attentionState}</strong><small>{statusRows.length ? 'Derived from canonical status' : 'No status evidence available'}</small></article>
        <article className={styles.metric}><span>Last activity</span><strong className={recent[0] ? undefined : styles.toneMuted}>{recent[0] ? new Date(timestampOf(recent[0])).toLocaleDateString('en-AE', { day: '2-digit', month: 'short' }) : 'Not established'}</strong><small>{recent[0] ? 'From source record' : 'No dated record connected'}</small></article>
        <article className={styles.metric}><span>Authority state</span><strong className={sourceState === 'Connected' ? styles.toneGood : styles.toneMuted}>{sourceState}</strong><small>{section.owner} remains the writer</small></article>
      </section>

      <section className={styles.attentionPanel} aria-label={`${section.label} attention`}>
        <div className={styles.sectionHeading}><div><span className={styles.kicker}>ATTENTION</span><h2>What needs a decision</h2></div><span className={styles.sectionHint}>Read-only project projection</span></div>
        {attention.length ? <ul className={styles.attentionList}>{attention.map((row, index) => <li key={`${String(row.id ?? index)}-${index}`}><span className={styles.attentionDot} /><div><strong>{String(row.title ?? row.name ?? row.reference ?? row.code ?? row.ncrNumber ?? row.id ?? 'Record')}</strong><small>{statusOf(row).replace(/_/g, ' ') || 'Status evidence available'}</small></div><ArrowRight size={14} aria-hidden /></li>)}</ul> : <div className={styles.emptyState}><CircleAlert size={17} aria-hidden /><div><strong>{statusRows.length ? 'No verified exceptions in connected records' : 'Attention is not established yet'}</strong><span>{records.length ? 'The canonical source does not currently expose an actionable exception.' : 'No project records are connected to this workspace yet.'}</span></div></div>}
      </section>

      <section className={styles.capabilityPanel} aria-label={`${section.label} capabilities`}>
        <div className={styles.sectionHeading}><div><span className={styles.kicker}>WORKSPACE</span><h2>Manage {section.label.toLowerCase()}</h2></div><span className={styles.sectionHint}>Open the canonical owner with this project context</span></div>
        <div className={styles.capabilityGrid}>{section.capabilities.map((capability) => <Link key={capability.label} href={contextHref(capability.href, projectId)} className={styles.capabilityCard}><span className={styles.cardArrow}><ExternalLink size={14} aria-hidden /></span><strong>{capability.label}</strong><small>{capability.description}</small></Link>)}</div>
      </section>

      <section className={styles.activityPanel} aria-label={`${section.label} recent activity`}>
        <div className={styles.sectionHeading}><div><span className={styles.kicker}>RECENT ACTIVITY</span><h2>What changed recently</h2></div></div>
        {recent.length ? <ol className={styles.activityList}>{recent.map((row, index) => <li key={`${String(row.id ?? index)}-${index}`}><span className={styles.activityDot} /><div><strong>{String(row.title ?? row.name ?? row.reference ?? row.code ?? row.id ?? 'Record')}</strong><small>{new Date(timestampOf(row)).toLocaleString('en-AE', { dateStyle: 'medium', timeStyle: 'short' })}</small></div></li>)}</ol> : <div className={styles.emptyState}><CircleAlert size={17} aria-hidden /><div><strong>No activity is established yet</strong><span>New records from the owning authority will appear here when available.</span></div></div>}
      </section>

      <footer className={styles.footerNote}><span>Project 360 composes this view; canonical records, permissions and audit events remain with {section.owner}.</span><Link href={`/project/${encodeURIComponent(projectId)}`}>Back to overview <ArrowRight size={13} aria-hidden /></Link></footer>
    </main>
  );
}

type SetupState = 'complete' | 'not-linked' | 'not-established' | 'unknown';

function setupStateLabel(state: SetupState): string {
  return state === 'complete' ? 'Complete' : state === 'not-linked' ? 'Not linked' : state === 'unknown' ? 'Unknown' : 'Not established';
}

function setupStateClass(state: SetupState): string {
  return state === 'complete' ? setupStyles.stateComplete : state === 'not-linked' ? setupStyles.stateLinked : state === 'unknown' ? setupStyles.stateUnknown : setupStyles.stateMissing;
}

function setupValue(value: unknown, fallback = 'Not established'): string {
  return typeof value === 'string' && value.trim() ? value : value === 0 ? 'AED 0' : fallback;
}

async function ProjectSetupWorkspace({ projectId, project }: { projectId: string; project: Row | null }) {
  const [membersResult, wbsResult] = await Promise.all([
    fetchJson<Row[]>(`/api/projects/${encodeURIComponent(projectId)}/members`),
    fetchJson<Row[]>(`/api/projects/wbs?projectId=${encodeURIComponent(projectId)}`),
  ]);
  const members = membersResult.ok && Array.isArray(membersResult.data) ? membersResult.data : [];
  const wbs = wbsResult.ok && Array.isArray(wbsResult.data) ? wbsResult.data : [];
  const identityState: SetupState = project?.title && project?.reference ? 'complete' : 'not-established';
  const contractState: SetupState = project?.contractId || project?.contractTitle ? 'complete' : 'not-linked';
  const scopeState: SetupState = wbsResult.ok ? (wbs.length ? 'complete' : 'not-established') : 'unknown';
  const teamState: SetupState = membersResult.ok ? (members.length ? 'complete' : 'not-established') : 'unknown';
  const systemsState: SetupState = 'not-established';
  const datesState: SetupState = 'not-established';
  const progressItems = [
    ['Identity', identityState], ['Contract', contractState], ['Scope', scopeState], ['Team', teamState], ['Systems', systemsState], ['Dates', datesState],
  ] as Array<[string, SetupState]>;
  const projectBase = `/project/${encodeURIComponent(projectId)}`;
  const title = String(project?.title ?? 'Project Setup');
  const projectEdit = project ? <ProjectEdit buttonLabel="Edit project" project={{ id: projectId, title, reference: String(project.reference ?? ''), status: String(project.status ?? 'planned'), value: Number(project.value ?? 0) }} /> : null;

  return (
    <main className={setupStyles.page} data-testid="project-setup-workspace">
      <header className={setupStyles.hero}>
        <div className={setupStyles.heroCopy}>
          <span className={setupStyles.eyebrow}>PROJECT 360 / PROJECT SETUP</span>
          <h1>{title}</h1>
          <p>Project identity, scope, contract and ownership — configured before delivery starts.</p>
          <div className={setupStyles.metaLine}><code>{setupValue(project?.reference, 'Reference not established')}</code><span>{setupValue(project?.accountName, 'Client not established')}</span><span>{setupValue(project?.contractTitle, 'Contract not linked')}</span></div>
        </div>
        <div className={setupStyles.heroActions}>
          {projectEdit}
          <details className={setupStyles.actionMenu}>
            <summary>Project actions <span>⌄</span></summary>
            <div className={setupStyles.actionMenuPanel}>
              <LinkAction href={`${projectBase}/workspace/plan`} label="Open plan & control" />
              <LinkAction href={`${projectBase}/workspace/engineering`} label="Open engineering" />
              <LinkAction href={`${projectBase}/workspace/site`} label="Open site delivery" />
              <LinkAction href={`${projectBase}/team`} label="Open team" />
            </div>
          </details>
        </div>
      </header>

      <section className={setupStyles.progressPanel} aria-labelledby="setup-progress-title">
        <div className={setupStyles.sectionHeading}><div><span className={setupStyles.kicker}>SETUP PROGRESS</span><h2 id="setup-progress-title">Configure the project once, then deliver with confidence.</h2></div><span className={setupStyles.sectionHint}>Derived from Projects authority</span></div>
        <div className={setupStyles.progressGrid}>{progressItems.map(([label, state]) => <div key={label} className={setupStyles.progressItem}><span className={`${setupStyles.progressIcon} ${setupStateClass(state)}`}>{state === 'complete' ? <Check size={14} aria-hidden /> : '?'}</span><div><strong>{label}</strong><small className={setupStateClass(state)}>{setupStateLabel(state)}</small></div></div>)}</div>
      </section>

      <div className={setupStyles.primaryGrid}>
        <section className={setupStyles.panel} aria-labelledby="project-details-title">
          <div className={setupStyles.sectionHeading}><div><span className={setupStyles.kicker}>PROJECT DETAILS</span><h2 id="project-details-title">Identity and ownership</h2></div></div>
          <div className={setupStyles.detailGrid}>
            <Detail label="Project name" value={title} />
            <Detail label="Reference" value={setupValue(project?.reference)} mono />
            <Detail label="Client" value={setupValue(project?.accountName, 'Client not established')} />
            <Detail label="Contract" value={setupValue(project?.contractTitle, 'Not linked')} />
            <Detail label="Project manager" value="Not established" />
            <Detail label="Status" value={setupValue(project?.status, 'Unknown')} badge />
            <Detail label="Start date" value="Not established" icon={<CalendarDays size={14} aria-hidden />} />
            <Detail label="Target date" value="Not established" icon={<CalendarDays size={14} aria-hidden />} />
          </div>
        </section>

        <aside className={setupStyles.readinessPanel} aria-labelledby="setup-readiness-title">
          <div className={setupStyles.sectionHeading}><div><span className={setupStyles.kicker}>SETUP READINESS</span><h2 id="setup-readiness-title">What is ready to use</h2></div></div>
          <ReadinessRow label="Identity" state={identityState} />
          <ReadinessRow label="Contract" state={contractState} />
          <ReadinessRow label="Scope" state={scopeState} />
          <ReadinessRow label="Team" state={teamState} />
          <ReadinessRow label="Systems" state={systemsState} />
          <p className={setupStyles.truthNote}>A setup item only becomes complete when its canonical evidence is available. No manual READY flags are stored here.</p>
        </aside>
      </div>

      <section className={setupStyles.panel} aria-labelledby="scope-contract-title">
        <div className={setupStyles.sectionHeading}><div><span className={setupStyles.kicker}>SCOPE &amp; CONTRACT</span><h2 id="scope-contract-title">The delivery basis</h2></div><span className={setupStyles.sectionHint}>Owned by Projects and linked authorities</span></div>
        <div className={setupStyles.basisGrid}>
          <article className={setupStyles.basisCard}><span className={setupStyles.basisIcon}><Layers3 size={16} aria-hidden /></span><div><strong>Scope / WBS</strong><span className={setupStateClass(scopeState)}>{wbsResult.ok && wbs.length ? `${wbs.length} WBS record${wbs.length === 1 ? '' : 's'} connected` : setupStateLabel(scopeState)}</span><small>{wbsResult.ok ? 'Planning evidence will appear here when authored.' : 'Planning authority could not be reached.'}</small></div><LinkAction href={`${projectBase}/workspace/plan`} label="Open plan" /></article>
          <article className={setupStyles.basisCard}><span className={setupStyles.basisIcon}><FileText size={16} aria-hidden /></span><div><strong>Contract</strong><span className={setupStateClass(contractState)}>{contractState === 'complete' ? setupValue(project?.contractTitle) : 'Not linked'}</span><small>{project?.contractId ? 'Awarded contract linked to this project.' : 'No awarded contract is linked to this project.'}</small></div><LinkAction href="/contracts/contracts" label="Open contracts" /></article>
          <article className={setupStyles.basisCard}><span className={setupStyles.basisIcon}><FileText size={16} aria-hidden /></span><div><strong>Commercial handover</strong><span className={setupStyles.stateMissing}>Not established</span><small>Accepted scope, assumptions and exclusions are not recorded yet.</small></div><LinkAction href={`${projectBase}/workspace/commercial`} label="Review commercial" /></article>
        </div>
      </section>

      <div className={setupStyles.secondaryGrid}>
        <section className={setupStyles.panel} aria-labelledby="team-title"><div className={setupStyles.sectionHeading}><div><span className={setupStyles.kicker}>TEAM &amp; OWNERSHIP</span><h2 id="team-title">People who can deliver</h2></div><LinkAction href={`${projectBase}/team`} label="Manage team" /></div><div className={setupStyles.teamSummary}><Users size={18} aria-hidden /><div><strong>{members.length ? `${members.length} project member${members.length === 1 ? '' : 's'}` : teamState === 'unknown' ? 'Team is unknown' : 'Team not established'}</strong><span>{members.length ? members.map((member) => String(member.displayName ?? member.roleName ?? member.userId ?? 'Member')).join(' · ') : 'Assign a Project Manager and delivery roles when ownership is known.'}</span></div></div></section>
        <section className={setupStyles.panel} aria-labelledby="systems-title"><div className={setupStyles.sectionHeading}><div><span className={setupStyles.kicker}>SYSTEMS / DISCIPLINES</span><h2 id="systems-title">Delivery lens</h2></div><span className={setupStyles.sectionHint}>Project scope only</span></div><div className={setupStyles.systemsEmpty}><Layers3 size={18} aria-hidden /><div><strong>Systems are not established</strong><span>No project disciplines have been linked by the Projects authority yet. The global lens remains available for read-only context.</span></div></div></section>
      </div>

      <section className={setupStyles.panel} aria-labelledby="setup-activity-title"><div className={setupStyles.sectionHeading}><div><span className={setupStyles.kicker}>RECENT SETUP ACTIVITY</span><h2 id="setup-activity-title">What changed in setup</h2></div><LinkAction href={`${projectBase}/workspace/activity`} label="View history" /></div><div className={setupStyles.activityRow}><span className={setupStyles.activityDot} /><div><strong>Project record created</strong><span>{project?.createdAt ? new Date(String(project.createdAt)).toLocaleString('en-AE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date not established'} · Projects authority</span></div></div></section>

      <footer className={setupStyles.footerNote}><span>Project Setup writes only through the canonical Projects authority. Linked domains remain owners of their records.</span><LinkAction href={projectBase} label="Back to Project 360" /></footer>
    </main>
  );
}

function Detail({ label, value, mono, badge, icon }: { label: string; value: string; mono?: boolean; badge?: boolean; icon?: ReactNode }) {
  return <div className={setupStyles.detail}><span>{icon}{label}</span><strong className={`${mono ? setupStyles.mono : ''} ${badge ? setupStyles.detailBadge : ''}`}>{value}</strong></div>;
}

function ReadinessRow({ label, state }: { label: string; state: SetupState }) {
  return <div className={setupStyles.readinessRow}><span>{label}</span><strong className={setupStateClass(state)}>{setupStateLabel(state)}</strong><span aria-hidden>{state === 'complete' ? '✓' : '·'}</span></div>;
}

function LinkAction({ href, label }: { href: string; label: string }) {
  return <Link href={href} className={setupStyles.inlineAction}>{label}<ArrowRight size={13} aria-hidden /></Link>;
}
