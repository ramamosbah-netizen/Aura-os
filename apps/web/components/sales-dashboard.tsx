import { BarChart3, Building2, FileText, Radar, Target, TrendingUp, Trophy, Workflow } from 'lucide-react';
import type { CSSProperties } from 'react';
import SuiteDashboardShell, {
  type SuiteAttentionItem,
  type SuiteMetric,
  type SuiteShortcut,
} from './suite-dashboard-shell';
import ContinueWorking from './continue-working';
import PipelineStrip, { type PipelineStage } from './pipeline-strip';
import AuraTabLink from './aura-tab-link';

export interface SalesKpis {
  openDeals: number;
  openValue: number;
  weighted: number;
  avgDealSize: number;
  avgAgeDays: number;
  winRate: number | null;
  won90: number;
  wonValue90: number;
  lost90: number;
}

export interface SalesAtRisk {
  id: string;
  title: string;
  value: number;
  stage: string;
  ownerId: string | null;
  accountName: string | null;
  reasons: string[];
  recommendation: string;
  daysSinceActivity: number | null;
}

export interface SalesPipeline {
  kpis: SalesKpis;
  atRisk: SalesAtRisk[];
}

export interface SalesQuote {
  id: string;
  quoteNumber: string;
  customerName: string;
  total: number;
  status: string;
  issueDate: string;
}

export interface SalesOpportunity {
  id: string;
  title: string;
  value: number;
  stage: string;
  winProbability: number;
  closeDate: string | null;
}
export interface SalesRadarSummary { total: number; open: number; new: number; reviewing: number; researching: number; promoted: number; dismissed: number; highPotential: number }

/** Sales Home is a cockpit, not an activity manager: each shortcut has one clear job in the sell cycle. */
const SHORTCUTS: SuiteShortcut[] = [
  { label: 'Radar', description: 'Discover and triage early commercial signals', href: '/crm/radar', icon: Radar, tone: 'cyan' },
  { label: 'Company Intelligence', description: 'Company-wide signals and governed decision support', href: '/intelligence', icon: BarChart3, tone: 'violet' },
  { label: 'Market Intelligence', description: 'Benchmarks and product knowledge for commercial decisions', href: '/crm/market-intelligence', icon: Building2, tone: 'cyan' },
  { label: 'Opportunities', description: 'Deals by stage — switch between Board and List', href: '/crm/pipeline?view=board', icon: Workflow, tone: 'teal' },
  { label: 'Tenders', description: 'Bid / no-bid, scope, BOQ and submissions', href: '/tendering/tenders', icon: Workflow, tone: 'amber' },
  { label: 'Estimation', description: 'Cost build-up and recommended price', href: '/tendering/pricing', icon: Target, tone: 'blue' },
  { label: 'Customers', description: 'Accounts, contacts & relationship 360', href: '/crm/customers', icon: Building2, tone: 'cyan' },
  { label: 'Quotations', description: 'Draft → review → sent → won', href: '/crm/quotations', icon: FileText, tone: 'amber' },
  { label: 'Commercial Decisions', description: 'Readiness, risk and financial context', href: '/crm/commercial', icon: BarChart3, tone: 'green' },
  { label: 'Contracts', description: 'Accepted commercial agreements', href: '/contracts/contracts', icon: FileText, tone: 'teal' },
  { label: 'Forecast', description: 'Commit, best-case & expected close', href: '/crm/forecast', icon: Target, tone: 'blue' },
  { label: 'Reports', description: 'Read-only performance and provenance views', href: '/crm/reports', icon: BarChart3, tone: 'violet' },
];

const aed = (n: number): string => 'AED ' + n.toLocaleString('en-AE', { maximumFractionDigits: 0 });

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Dubai' }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function SalesDashboard({
  userName,
  pipeline,
  quotes,
  opportunities,
  leadCount,
  radarSummary,
}: {
  userName: string;
  pipeline: SalesPipeline | null;
  quotes: SalesQuote[] | null;
  opportunities: SalesOpportunity[] | null;
  leadCount: number | null;
  radarSummary: SalesRadarSummary | null;
}) {
  const kpis = pipeline?.kpis ?? null;
  const atRisk = (pipeline?.atRisk ?? []).slice(0, 5);
  const totalAtRisk = pipeline?.atRisk.length ?? 0;
  const qs = quotes ?? [];
  const opps = opportunities ?? [];
  const sentNoResponse = qs.filter((q) => q.status === 'sent').length;
  const noNextActivity = (pipeline?.atRisk ?? []).filter((d) => d.reasons.some((r) => /follow|activity|contact/i.test(r))).length;

  const stageValue = (stage: string) => opps.filter((o) => o.stage === stage).reduce((s, o) => s + (o.value || 0), 0);
  const stageCount = (stage: string) => opps.filter((o) => o.stage === stage).length;
  const stages: PipelineStage[] = [
    { label: 'Lead', count: leadCount ?? 0, value: '—', href: '/crm/pipeline', tabTitle: 'Opportunities', tabType: 'Sales & Commercial' },
    { label: 'Qualified', count: stageCount('qualification'), value: aed(stageValue('qualification')), href: '/crm/pipeline', tabTitle: 'Opportunities', tabType: 'Sales & Commercial' },
    { label: 'Proposal', count: stageCount('proposal'), value: aed(stageValue('proposal')), href: '/crm/pipeline', tabTitle: 'Opportunities', tabType: 'Sales & Commercial' },
    { label: 'Negotiation', count: stageCount('negotiation'), value: aed(stageValue('negotiation')), href: '/crm/pipeline', tabTitle: 'Opportunities', tabType: 'Sales & Commercial' },
    { label: 'Won', count: stageCount('won'), value: aed(stageValue('won')), href: '/crm/pipeline', tabTitle: 'Opportunities', tabType: 'Sales & Commercial' },
  ];
  const hasStrip = opportunities !== null || leadCount !== null;

  const metrics: SuiteMetric[] = [
    { label: 'Open pipeline', value: kpis ? aed(kpis.openValue) : '—', sub: 'un-weighted', href: '/crm/pipeline', icon: Workflow, tone: 'teal' },
    { label: 'Forecast', value: kpis ? aed(kpis.weighted) : '—', sub: 'probability-weighted', href: '/crm/forecast', icon: Target, tone: 'blue' },
    { label: 'Active deals', value: kpis ? String(kpis.openDeals) : '—', sub: 'open opportunities', href: '/crm/pipeline', icon: TrendingUp, tone: 'amber' },
    { label: 'Win rate', value: kpis?.winRate == null ? '—' : `${kpis.winRate}%`, sub: kpis ? `${kpis.won90}W · ${kpis.lost90}L (90d)` : 'no data', href: '/crm/pipeline', icon: Trophy, tone: 'green' },
  ];

  const attentionItems: SuiteAttentionItem[] | null = pipeline === null ? null : atRisk.map((deal) => ({
    id: deal.id,
    href: `/crm/opportunities/${deal.id}`,
    tabTitle: deal.title,
    tabType: 'Opportunity',
    signal: 'bad',
    title: deal.title,
    subtitle: `${deal.accountName ?? 'No account'} · ${deal.stage}`,
    detailPrimary: deal.reasons[0] ?? deal.recommendation,
    detailSecondary: deal.reasons[0] ? deal.recommendation : undefined,
    trailing: aed(deal.value),
    trailingStrong: true,
  }));

  const offline = pipeline === null && quotes === null && opportunities === null;
  const briefParts: string[] = [];
  if (!offline) {
    briefParts.push(`${totalAtRisk} opportunit${totalAtRisk === 1 ? 'y requires' : 'ies require'} action.`);
    if (kpis && kpis.weighted > 0) briefParts.push(`${aed(kpis.weighted)} weighted pipeline may close.`);
    if (sentNoResponse > 0) briefParts.push(`${sentNoResponse} quotation${sentNoResponse === 1 ? ' has' : 's have'} received no client response.`);
    if (noNextActivity > 0) briefParts.push(`${noNextActivity} deal${noNextActivity === 1 ? ' has' : 's have'} no next activity.`);
    if (radarSummary) briefParts.push(`${radarSummary.new} new sales signal${radarSummary.new === 1 ? '' : 's'} and ${radarSummary.highPotential} high-potential signal${radarSummary.highPotential === 1 ? '' : 's'} await triage.`);
  }
  const briefBody = offline
    ? 'The sales feed could not be loaded. I can still help you search AURA and prepare your next commercial move.'
    : briefParts.join(' ');

  return (
    <SuiteDashboardShell
      testId="sales-dashboard"
      anchor={{ href: '/crm/overview', title: 'Sales & Commercial', type: 'Sales & Commercial' }}
      hero={{
        eyebrow: 'AURA OS / SALES & COMMERCIAL',
        title: <>{greeting()}, <span>{userName}</span></>,
        lede: 'Your Sales & Commercial cockpit — from signal and pipeline health to the next quotation, decision and contract.',
      }}
      askAura={{ tabType: 'Sales & Commercial' }}
      metrics={metrics}
      band={
        <>
          <SalesCommercialJourney radarSummary={radarSummary} leadCount={leadCount} opportunityCount={opps.length} quoteCount={qs.length} />
          {hasStrip ? (
            <PipelineStrip
              title="Pipeline health"
              viewAll={{ href: '/crm/pipeline?view=board', label: 'Open opportunities', tabTitle: 'Opportunities', tabType: 'Sales & Commercial' }}
              stages={stages}
            />
          ) : null}
        </>
      }
      continueWorking={<ContinueWorking match={['/crm/radar', '/crm/opportunities', '/crm/quotations', '/crm/accounts', '/crm/contacts', '/crm/leads']} />}
      attention={{
        kicker: 'Pipeline engine · most valuable first',
        title: 'Needs your attention',
        headerLink: { href: '/crm/pipeline?view=board', label: 'Open opportunities', tabTitle: 'Opportunities', tabType: 'Sales & Commercial' },
        items: attentionItems,
        unavailableLabel: 'Pipeline data is unavailable. Open the Pipeline workspace to check the source.',
        emptyLabel: 'No at-risk deals — the pipeline is clean.',
        itemTestId: 'sales-attention-item',
        strip: sentNoResponse > 0 ? {
          icon: FileText,
          text: `${sentNoResponse} quotation${sentNoResponse === 1 ? '' : 's'} sent with no client response yet`,
          link: { href: '/crm/quotations', label: 'Open quotations', tabTitle: 'Quotations', tabType: 'Sales & Commercial' },
        } : null,
      }}
      brief={{
        kicker: 'Live sales signals',
        title: 'AURA Sales brief',
        body: briefBody,
        cta: { href: radarSummary?.new ? '/crm/radar' : '/crm/pipeline?view=board', label: radarSummary?.new ? 'Open Radar' : 'Review opportunities', tabTitle: radarSummary?.new ? 'Radar' : 'Opportunities', tabType: 'Sales & Commercial' },
      }}
      ownership={<>
        <FileText aria-hidden />
        <span><strong>Sales &amp; Commercial owns the journey: Signal → Lead → Opportunity → Scope → Estimate → Quotation → Contract.</strong> The cockpit composes live read models; execution stays with Lead, Opportunity, Tender, Estimation, Quotation 360 and Contracts. Activity history lives in record timelines; personal tasks and follow-ups are executed in <a href="/my-work">My Work</a>. <a href="/crm/activities">Open the all-activity register →</a></span>
      </>}
      shortcuts={{ kicker: 'Sales workspaces', title: 'Workspaces', itemTestId: 'sales-shortcut', items: SHORTCUTS }}
    />
  );
}

function SalesCommercialJourney({ radarSummary, leadCount, opportunityCount, quoteCount }: {
  radarSummary: SalesRadarSummary | null;
  leadCount: number | null;
  opportunityCount: number;
  quoteCount: number;
}) {
  const nodes = [
    { label: 'Signal', meta: radarSummary ? `${radarSummary.open} open` : '—', href: '/crm/radar', tabTitle: 'Radar' },
    { label: 'Lead', meta: leadCount == null ? '—' : `${leadCount} active`, href: '/crm/leads', tabTitle: 'Leads' },
    { label: 'Opportunity', meta: `${opportunityCount} records`, href: '/crm/pipeline?view=board', tabTitle: 'Opportunities' },
    { label: 'Quotation', meta: `${quoteCount} records`, href: '/crm/quotations', tabTitle: 'Quotations' },
    { label: 'Decision', meta: 'readiness + risk', href: '/crm/commercial', tabTitle: 'Commercial Decisions' },
    { label: 'Contract', meta: 'post-award', href: '/contracts/contracts', tabTitle: 'Contracts' },
  ];
  return (
    <section style={journeySt.section} aria-label="Sales and Commercial journey">
      <div style={journeySt.header}>
        <div>
          <p style={journeySt.kicker}>COMMERCIAL JOURNEY</p>
          <h2 style={journeySt.title}>From signal to contract</h2>
          <p style={journeySt.copy}>One cockpit for the whole journey. Open a step to work in its canonical owner.</p>
        </div>
        <AuraTabLink href="/crm/commercial" tabTitle="Commercial Decisions" tabType="Sales" style={journeySt.link}>Open decisions <span>↗</span></AuraTabLink>
      </div>
      <div style={journeySt.nodes}>
        {nodes.map((node, index) => (
          <span key={node.label} style={journeySt.nodeWrap}>
            <AuraTabLink href={node.href} tabTitle={node.tabTitle} tabType="Sales" style={journeySt.node}>
              <span style={journeySt.nodeLabel}>{node.label}</span>
              <span style={journeySt.nodeMeta}>{node.meta}</span>
            </AuraTabLink>
            {index < nodes.length - 1 && <span style={journeySt.arrow} aria-hidden>›</span>}
          </span>
        ))}
      </div>
      <div style={journeySt.branchRow}>
        <span style={journeySt.branchLabel}>Opportunity path</span>
        <AuraTabLink href="/crm/pipeline?view=board" tabTitle="Direct opportunity" tabType="Sales" style={journeySt.branch}>Direct <span>Scope → Estimate</span></AuraTabLink>
        <AuraTabLink href="/tendering/tenders" tabTitle="Tender register" tabType="Pre-Award" style={journeySt.branch}>Tender <span>Bid / No-Bid → BOQ</span></AuraTabLink>
      </div>
    </section>
  );
}

const journeySt: Record<string, CSSProperties> = {
  section: { margin: '0 0 12px', padding: '18px 20px', border: '1px solid var(--border)', borderRadius: 16, background: 'linear-gradient(125deg, color-mix(in srgb, var(--accent) 8%, var(--panel)), var(--panel) 52%)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 },
  kicker: { margin: '0 0 6px', color: 'var(--accent)', fontSize: 9.5, fontWeight: 850, letterSpacing: '.16em' },
  title: { margin: 0, fontSize: 20, letterSpacing: '-.03em' },
  copy: { margin: '6px 0 0', color: 'var(--muted)', fontSize: 12, lineHeight: 1.45 },
  link: { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' },
  nodes: { display: 'flex', alignItems: 'stretch', gap: 4, overflowX: 'auto', paddingBottom: 2 },
  nodeWrap: { display: 'inline-flex', alignItems: 'center', gap: 4, flex: '1 0 112px' },
  node: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, width: '100%', padding: '10px 11px', border: '1px solid var(--border)', borderRadius: 11, background: 'var(--panel)', color: 'var(--text)', textDecoration: 'none' },
  nodeLabel: { fontSize: 12.5, fontWeight: 800 },
  nodeMeta: { color: 'var(--muted)', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  arrow: { color: 'var(--accent)', fontSize: 18, lineHeight: 1 },
  branchRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 13, paddingTop: 12, borderTop: '1px solid var(--border)' },
  branchLabel: { color: 'var(--muted)', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' },
  branch: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--panel-2)', color: 'var(--text)', fontSize: 11.5, fontWeight: 750, textDecoration: 'none' },
};
