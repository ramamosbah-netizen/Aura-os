import { BarChart3, Building2, FileText, Target, TrendingUp, Trophy, Workflow } from 'lucide-react';
import SuiteDashboardShell, {
  type SuiteAttentionItem,
  type SuiteMetric,
  type SuiteShortcut,
} from './suite-dashboard-shell';
import ContinueWorking from './continue-working';
import PipelineStrip, { type PipelineStage } from './pipeline-strip';

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

/** Sales Home is a cockpit, not an activity manager: each shortcut has one clear job in the sell cycle. */
const SHORTCUTS: SuiteShortcut[] = [
  { label: 'Opportunities', description: 'Deals by stage — switch between Board and List', href: '/crm/pipeline?view=board', icon: Workflow, tone: 'teal' },
  { label: 'Customers', description: 'Accounts, contacts & relationship 360', href: '/crm/customers', icon: Building2, tone: 'cyan' },
  { label: 'Quotations', description: 'Draft → review → sent → won', href: '/crm/quotations', icon: FileText, tone: 'amber' },
  { label: 'Forecast', description: 'Commit, best-case & expected close', href: '/crm/forecast', icon: Target, tone: 'blue' },
  { label: 'Analytics', description: 'Conversion, win/loss & performance', href: '/crm/analytics?view=performance', icon: BarChart3, tone: 'violet' },
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
}: {
  userName: string;
  pipeline: SalesPipeline | null;
  quotes: SalesQuote[] | null;
  opportunities: SalesOpportunity[] | null;
  leadCount: number | null;
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
    { label: 'Lead', count: leadCount ?? 0, value: '—', href: '/crm/pipeline', tabTitle: 'Opportunities', tabType: 'Sales' },
    { label: 'Qualified', count: stageCount('qualification'), value: aed(stageValue('qualification')), href: '/crm/pipeline', tabTitle: 'Opportunities', tabType: 'Sales' },
    { label: 'Proposal', count: stageCount('proposal'), value: aed(stageValue('proposal')), href: '/crm/pipeline', tabTitle: 'Opportunities', tabType: 'Sales' },
    { label: 'Negotiation', count: stageCount('negotiation'), value: aed(stageValue('negotiation')), href: '/crm/pipeline', tabTitle: 'Opportunities', tabType: 'Sales' },
    { label: 'Won', count: stageCount('won'), value: aed(stageValue('won')), href: '/crm/pipeline', tabTitle: 'Opportunities', tabType: 'Sales' },
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
  }
  const briefBody = offline
    ? 'The sales feed could not be loaded. I can still help you search AURA and prepare your next commercial move.'
    : briefParts.join(' ');

  return (
    <SuiteDashboardShell
      testId="sales-dashboard"
      anchor={{ href: '/crm/overview', title: 'Sales', type: 'Sales' }}
      hero={{
        eyebrow: 'AURA OS / SALES',
        title: <>{greeting()}, <span>{userName}</span></>,
        lede: 'Your commercial pipeline and customer relationships — what’s happening, what needs you, and the next deal to move.',
      }}
      askAura={{ tabType: 'Sales' }}
      metrics={metrics}
      band={hasStrip ? (
        <PipelineStrip
          title="Pipeline"
          viewAll={{ href: '/crm/pipeline?view=board', label: 'Open opportunities', tabTitle: 'Opportunities', tabType: 'Sales' }}
          stages={stages}
        />
      ) : undefined}
      continueWorking={<ContinueWorking match={['/crm/opportunities', '/crm/quotations', '/crm/accounts', '/crm/contacts', '/crm/leads']} />}
      attention={{
        kicker: 'Pipeline engine · most valuable first',
        title: 'Needs your attention',
        headerLink: { href: '/crm/pipeline?view=board', label: 'Open opportunities', tabTitle: 'Opportunities', tabType: 'Sales' },
        items: attentionItems,
        unavailableLabel: 'Pipeline data is unavailable. Open the Pipeline workspace to check the source.',
        emptyLabel: 'No at-risk deals — the pipeline is clean.',
        itemTestId: 'sales-attention-item',
        strip: sentNoResponse > 0 ? {
          icon: FileText,
          text: `${sentNoResponse} quotation${sentNoResponse === 1 ? '' : 's'} sent with no client response yet`,
          link: { href: '/crm/quotations', label: 'Open quotations', tabTitle: 'Quotations', tabType: 'Sales' },
        } : null,
      }}
      brief={{
        kicker: 'Live sales signals',
        title: 'AURA Sales brief',
        body: briefBody,
        cta: { href: '/crm/pipeline?view=board', label: 'Review opportunities', tabTitle: 'Opportunities', tabType: 'Sales' },
      }}
      ownership={<>
        <FileText aria-hidden />
        <span><strong>Sales owns the sell cycle: Lead → Opportunity → Quote → Won.</strong> Email, documents, approvals and tenders are shown in context but owned by their own systems. Activity history lives in each customer, contact, opportunity and quotation timeline; personal tasks, follow-ups and reminders are executed in <a href="/my-work">My Work</a>. <a href="/crm/activities">Open the all-activity register →</a></span>
      </>}
      shortcuts={{ kicker: 'Sales workspaces', title: 'Workspaces', itemTestId: 'sales-shortcut', items: SHORTCUTS }}
    />
  );
}
