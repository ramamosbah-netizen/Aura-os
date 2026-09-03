import {
  Boxes,
  CheckCircle2,
  FolderKanban,
  GaugeCircle,
  LayoutDashboard,
  ListChecks,
  GitBranch,
  CalendarRange,
} from 'lucide-react';
import SuiteDashboardShell, {
  type SuiteAttentionItem,
  type SuiteMetric,
  type SuiteShortcut,
} from './suite-dashboard-shell';
import ContinueWorking from './continue-working';

/** Live earned-value health per project, from `/api/projects/projects/portfolio`. */
export interface DeliveryEvm {
  budgetAtCompletion: number | null;
  plannedValue: number | null;
  earnedValue: number | null;
  actualCost: number | null;
  costVariance: number | null;
  scheduleVariance: number | null;
  cpi: number | null;
  spi: number | null;
}

export interface DeliveryProject {
  id: string;
  title: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  value: number;
  accountName: string | null;
  contractTitle: string | null;
  evm: DeliveryEvm;
  atRisk: boolean;
}

/** Delivery-owned decisions projected by the universal inbox (`/api/inbox`). */
export interface DeliveryApproval {
  id: string;
  module: string;
  kind: string;
  title: string;
  action: string;
  href: string;
}

const SHORTCUTS: SuiteShortcut[] = [
  { label: 'Projects', description: 'Official project register and Project 360', href: '/projects/projects', icon: FolderKanban, tone: 'teal' },
  { label: 'Plan & schedule', description: 'Gantt — planned vs baseline vs actual', href: '/projects/schedule', icon: CalendarRange, tone: 'slate' },
  { label: 'Project controls', description: 'Technical KPI, WBS, CBS, quantities and cost control', href: '/projects/controls', icon: GaugeCircle, tone: 'violet' },
  { label: 'Changes', description: 'Governed variations and change context', href: '/projects/variations', icon: GitBranch, tone: 'amber' },
  { label: 'Approvals & actions', description: 'Decisions requiring project action', href: '/my-work/approvals', icon: ListChecks, tone: 'blue' },
  { label: 'Project closeout', description: 'Handover readiness and closeout workflow', href: '/projects/closeout', icon: CheckCircle2, tone: 'green' },
];

const aed = (n: number): string => 'AED ' + Math.round(n).toLocaleString('en-AE');

/** Why an active project is at risk — read straight from its earned-value figures, never invented. */
function riskReason(project: DeliveryProject): string {
  const flags: string[] = [];
  if (project.evm.spi !== null && project.evm.spi < 1) flags.push('behind schedule');
  if (project.evm.costVariance !== null && project.evm.costVariance < 0) flags.push('over budget');
  return flags.length ? flags.join(' · ') : 'needs review';
}

export default function ProjectDeliveryDashboard({
  projects,
  approvals,
}: {
  projects: DeliveryProject[] | null;
  approvals: DeliveryApproval[] | null;
}) {
  const rows = projects ?? [];
  const active = rows.filter((project) => project.status === 'active');
  const atRisk = rows.filter((project) => project.atRisk);
  const behindSchedule = active.filter((project) => project.evm.spi !== null && project.evm.spi < 1);
  const pendingApprovals = approvals?.length ?? 0;

  const bac = rows.reduce((sum, project) => sum + (project.evm.budgetAtCompletion ?? 0), 0);
  const ev = rows.reduce((sum, project) => sum + (project.evm.earnedValue ?? 0), 0);
  const ac = rows.reduce((sum, project) => sum + (project.evm.actualCost ?? 0), 0);
  const portfolioCpi = ac > 0 ? ev / ac : null;

  // Worst-first: the deepest cost overrun, then the worst schedule performance.
  const attentionSorted = [...atRisk].sort((a, b) => ((a.evm.costVariance ?? 0) - (b.evm.costVariance ?? 0)) || ((a.evm.spi ?? 2) - (b.evm.spi ?? 2)));
  const worst = attentionSorted[0] ?? null;

  const metrics: SuiteMetric[] = [
    { label: 'Active projects', value: projects ? String(active.length) : '—', sub: projects ? 'in delivery now' : 'no data', href: '/projects/projects', icon: FolderKanban, tone: 'teal' },
    { label: 'Projects at risk', value: projects ? String(atRisk.length) : '—', sub: 'behind or over budget', href: '/projects/dashboard', icon: GaugeCircle, tone: atRisk.length > 0 ? 'red' : 'green' },
    { label: 'Behind schedule', value: projects ? String(behindSchedule.length) : '—', sub: 'active · SPI < 1.00', href: '/projects/schedule', icon: LayoutDashboard, tone: behindSchedule.length > 0 ? 'amber' : 'green' },
    { label: 'Pending approvals', value: approvals ? String(pendingApprovals) : '—', sub: 'variations & materials', href: '/projects/variations', icon: CheckCircle2, tone: 'blue' },
  ];

  const attentionItems: SuiteAttentionItem[] | null = projects === null ? null : attentionSorted.slice(0, 5).map((project) => ({
    id: project.id,
    href: `/project/${project.id}`,
    tabTitle: project.title,
    tabType: 'Project',
    signal: 'bad',
    title: project.title,
    subtitle: `${project.accountName ?? 'No client'} · ${project.status}`,
    detailPrimary: riskReason(project),
    detailSecondary: `SPI ${project.evm.spi === null ? 'Unavailable' : project.evm.spi.toFixed(2)} · CPI ${project.evm.cpi === null ? 'Unavailable' : project.evm.cpi.toFixed(2)}`,
    trailing: project.evm.costVariance !== null && project.evm.costVariance < 0 ? `${aed(project.evm.costVariance)}` : aed(project.value),
    trailingStrong: true,
  }));

  const spiText = 'Unavailable';
  const cpiText = portfolioCpi === null ? '—' : portfolioCpi.toFixed(2);
  const briefBody = projects === null
    ? 'The portfolio feed could not be loaded. I can still help you search projects and prepare your next delivery action.'
    : rows.length === 0
      ? 'No projects in delivery yet. Projects created from won contracts appear here with live earned-value health.'
      : atRisk.length > 0
        ? `${active.length} active project${active.length === 1 ? '' : 's'}, ${atRisk.length} needing attention. Portfolio SPI ${spiText}, CPI ${cpiText}.${worst ? ` “${worst.title}” has the largest gap — ${riskReason(worst)}.` : ''}`
        : `${active.length} active project${active.length === 1 ? '' : 's'} and none flagged at risk. Portfolio SPI ${spiText}, CPI ${cpiText}${pendingApprovals > 0 ? `, with ${pendingApprovals} approval${pendingApprovals === 1 ? '' : 's'} waiting.` : '.'}`;

  const topApproval = approvals && approvals.length > 0 ? approvals[0]! : null;

  return (
    <SuiteDashboardShell
      testId="project-delivery-dashboard"
      anchor={{ href: '/projects/dashboard', title: 'Projects', type: 'Projects' }}
      hero={{
        eyebrow: 'AURA OS / PROJECTS',
        title: <>Project <span>Management</span></>,
        lede: projects === null
          ? 'Portfolio health for planning, coordination, controls, decisions and closeout.'
          : `${active.length} active project${active.length === 1 ? '' : 's'} · portfolio SPI ${spiText} · ${atRisk.length} need attention.`,
      }}
      askAura={{ tabType: 'Projects' }}
      metrics={metrics}
      continueWorking={<ContinueWorking match={['/project']} />}
      attention={{
        kicker: 'Earned-value engine · deepest gap first',
        title: 'Projects needing attention',
        headerLink: { href: '/projects/dashboard', label: 'Open portfolio', tabTitle: 'Projects', tabType: 'Projects' },
        items: attentionItems,
        unavailableLabel: 'Portfolio data is unavailable. Open Projects to check the source workspace.',
        emptyLabel: 'No projects flagged at risk — schedule and cost are on track.',
        itemTestId: 'delivery-attention-item',
        strip: topApproval ? {
          icon: CheckCircle2,
          text: `${pendingApprovals} delivery approval${pendingApprovals === 1 ? '' : 's'} waiting · ${topApproval.kind}: ${topApproval.title}`,
          link: { href: topApproval.href, label: `${topApproval.action} →`, tabTitle: topApproval.title, tabType: topApproval.kind },
        } : null,
      }}
      brief={{
        kicker: 'Live delivery signals',
        title: 'AURA brief',
        body: briefBody,
        cta: { href: '/ai', label: 'Continue with AURA', tabTitle: 'AURA AI', tabType: 'Projects' },
      }}
      shortcuts={{
        kicker: 'Projects workspace',
        title: 'Projects',
        itemTestId: 'delivery-shortcut',
        items: SHORTCUTS,
      }}
      ownership={<><Boxes aria-hidden /><span><strong>Projects owns management.</strong> Delivery Operations owns discipline execution; this view composes portfolio health and decisions.</span></>}
    />
  );
}
