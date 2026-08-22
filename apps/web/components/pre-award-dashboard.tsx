import {
  BarChart3,
  Calculator,
  ClipboardList,
  FileText,
  ListChecks,
  MessagesSquare,
  Send,
  Trophy,
} from 'lucide-react';
import SuiteDashboardShell, {
  type SignalTone,
  type SuiteAttentionItem,
  type SuiteMetric,
  type SuiteShortcut,
} from './suite-dashboard-shell';
import ContinueWorking from './continue-working';

export interface Tender {
  id: string;
  title: string;
  reference: string | null;
  status: 'draft' | 'qualifying' | 'estimating' | 'priced' | 'submitted' | 'won' | 'lost' | 'declined';
  value: number;
  createdAt: string;
}

export interface PreAwardAnalytics {
  totalDecided: number;
  won: number;
  lost: number;
  winRate: number;
  wonValue: number;
  lostValue: number;
}

const SHORTCUTS: SuiteShortcut[] = [
  { label: 'Tenders', description: 'The tender register', href: '/tendering/tenders', icon: ClipboardList, tone: 'teal' },
  { label: 'BOQ', description: 'Bill of quantities — open a tender to manage', href: '/tendering/tenders', icon: ListChecks, tone: 'cyan' },
  { label: 'Estimation & Pricing', description: 'Cost, rate build-up, margin & selling price', href: '/tendering/pricing', icon: Calculator, tone: 'amber' },
  { label: 'Submissions', description: 'Compiled bid submissions per tender', href: '/tendering/tenders', icon: Send, tone: 'blue' },
  { label: 'Clarifications', description: 'Client Q&A per tender', href: '/tendering/tenders', icon: MessagesSquare, tone: 'violet' },
  { label: 'Outcomes & Reports', description: 'Won/Lost outcomes & hit-rate analytics', href: '/tendering/outcomes', icon: BarChart3, tone: 'slate' },
];

const DECIDED = new Set(['won', 'lost', 'declined']);
const IN_PROGRESS = new Set(['qualifying', 'estimating', 'priced']);

const aed = (n: number): string => 'AED ' + Math.round(n).toLocaleString('en-AE');

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Dubai' }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The action a tender is waiting on — derived from its lifecycle status, never invented. */
function attentionFor(status: Tender['status']): { reason: string; signal: SignalTone } | null {
  switch (status) {
    case 'qualifying': return { reason: 'Bid / no-bid decision pending', signal: 'bad' };
    case 'estimating': return { reason: 'Estimation in progress', signal: 'warn' };
    case 'priced': return { reason: 'Priced — ready to submit', signal: 'warn' };
    case 'submitted': return { reason: 'Submitted — awaiting client decision', signal: 'good' };
    default: return null; // draft (not started) or decided (won/lost/declined)
  }
}

export default function PreAwardDashboard({
  userName,
  tenders,
  analytics,
}: {
  userName: string;
  tenders: Tender[] | null;
  analytics: PreAwardAnalytics | null;
}) {
  const rows = tenders ?? [];
  const active = rows.filter((t) => !DECIDED.has(t.status));
  const inProgress = rows.filter((t) => IN_PROGRESS.has(t.status));
  const submitted = rows.filter((t) => t.status === 'submitted');
  const activeValue = active.reduce((s, t) => s + (t.value || 0), 0);
  const winRate = analytics ? analytics.winRate : null;

  const attention = rows
    .map((t) => ({ tender: t, att: attentionFor(t.status) }))
    .filter((row): row is { tender: Tender; att: { reason: string; signal: SignalTone } } => row.att !== null)
    .sort((a, b) => (b.tender.value || 0) - (a.tender.value || 0))
    .slice(0, 5);

  const metrics: SuiteMetric[] = [
    { label: 'Active tenders', value: tenders ? String(active.length) : '—', sub: 'live, not yet decided', href: '/tendering/tenders', icon: ClipboardList, tone: 'teal' },
    { label: 'Total bid value', value: tenders ? aed(activeValue) : '—', sub: 'across active tenders', href: '/tendering/tenders', icon: FileText, tone: 'blue' },
    { label: 'In progress', value: tenders ? String(inProgress.length) : '—', sub: 'being prepared', href: '/tendering/pricing', icon: Calculator, tone: 'amber' },
    { label: 'Win rate', value: winRate == null ? '—' : `${winRate}%`, sub: analytics ? `${analytics.won}W · ${analytics.lost}L` : 'no outcomes yet', href: '/tendering/outcomes', icon: Trophy, tone: 'green' },
  ];

  const attentionItems: SuiteAttentionItem[] | null = tenders === null ? null : attention.map(({ tender, att }) => ({
    id: tender.id,
    href: `/tendering/tenders/${tender.id}`,
    tabTitle: tender.title,
    tabType: 'Tender',
    signal: att.signal,
    title: tender.title,
    subtitle: tender.reference ?? tender.status,
    detailPrimary: att.reason,
    detailSecondary: tender.status,
    trailing: aed(tender.value || 0),
    trailingStrong: true,
  }));

  const offline = tenders === null && analytics === null;
  const briefBody = offline
    ? 'The Pre-Award feed could not be loaded. I can still help you search tenders and prepare your next bid.'
    : rows.length === 0
      ? 'No tenders yet. New bids appear here through qualification, estimation, pricing and submission.'
      : `${active.length} active tender${active.length === 1 ? '' : 's'} worth ${aed(activeValue)}. ${inProgress.length} being prepared${submitted.length > 0 ? `, ${submitted.length} awaiting client decision` : ''}.${winRate == null ? '' : ` Win rate ${winRate}%.`}`;

  return (
    <SuiteDashboardShell
      testId="pre-award-dashboard"
      anchor={{ href: '/tendering', title: 'Pre-Award', type: 'Pre-Award' }}
      hero={{
        eyebrow: 'AURA OS / PRE-AWARD',
        title: <>{greeting()}, <span>{userName}</span></>,
        lede: 'Your tenders, estimates and submissions — everything needed to win the work before award.',
      }}
      askAura={{ tabType: 'Pre-Award' }}
      metrics={metrics}
      continueWorking={<ContinueWorking match={['/tendering/tenders']} />}
      attention={{
        kicker: 'Tender lifecycle · most valuable first',
        title: 'Needs attention',
        headerLink: { href: '/tendering/tenders', label: 'Open tenders', tabTitle: 'Tenders', tabType: 'Pre-Award' },
        items: attentionItems,
        unavailableLabel: 'Tender data is unavailable. Open Tenders to check the source.',
        emptyLabel: 'No tenders awaiting action — nothing in flight.',
        itemTestId: 'pre-award-attention-item',
        strip: submitted.length > 0 ? {
          icon: Send,
          text: `${submitted.length} tender${submitted.length === 1 ? '' : 's'} submitted, awaiting client decision`,
          link: { href: '/tendering/tenders', label: 'Review', tabTitle: 'Tenders', tabType: 'Pre-Award' },
        } : null,
      }}
      brief={{
        kicker: 'Live pre-award signals',
        title: 'AURA Pre-Award brief',
        body: briefBody,
        cta: { href: '/ai', label: 'Continue with AURA', tabTitle: 'AURA AI', tabType: 'Pre-Award' },
      }}
      shortcuts={{
        kicker: 'Pre-Award workspace',
        title: 'Pre-Award',
        itemTestId: 'pre-award-shortcut',
        items: SHORTCUTS,
      }}
      ownership={<><ClipboardList aria-hidden /><span><strong>Pre-Award owns winning the work.</strong> Bid/no-bid, approvals and deadlines are workflow states inside each tender, not separate apps.</span></>}
    />
  );
}
