import {
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  FolderKanban,
  GaugeCircle,
  HardHat,
  LayoutDashboard,
  PackageCheck,
  PencilRuler,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import SuiteDashboardShell, {
  type SuiteAttentionItem,
  type SuiteMetric,
  type SuiteShortcut,
} from './suite-dashboard-shell';
import ContinueWorking from './continue-working';

/** Live earned-value health per project, from `/api/projects/projects/portfolio`. */
export interface DeliveryEvm {
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  costVariance: number;
  scheduleVariance: number;
  cpi: number;
  spi: number;
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
  { label: 'Projects', description: 'Delivery & execution register', href: '/projects/projects', icon: FolderKanban, tone: 'teal' },
  { label: 'Engineering', description: 'Drawings, RFIs & submittals', href: '/engineering', icon: PencilRuler, tone: 'violet' },
  { label: 'Site', description: 'Diaries, delays & consumption', href: '/site/control', icon: HardHat, tone: 'amber' },
  { label: 'Quality', description: 'NCRs, inspections & snags', href: '/quality/control', icon: ClipboardCheck, tone: 'cyan' },
  { label: 'HSE', description: 'Incidents, permits & CAPA', href: '/hse/control', icon: ShieldCheck, tone: 'green' },
  { label: 'Commissioning', description: 'Test, witness & handover readiness', href: '/commissioning', icon: Wrench, tone: 'teal' },
  { label: 'Handover', description: 'Acceptance package & client sign-off', href: '/handover', icon: PackageCheck, tone: 'blue' },
  { label: 'Schedule', description: 'Gantt — planned vs baseline vs actual', href: '/projects/schedule', icon: GaugeCircle, tone: 'slate' },
];

const aed = (n: number): string => 'AED ' + Math.round(n).toLocaleString('en-AE');

/** Why an active project is at risk — read straight from its earned-value figures, never invented. */
function riskReason(project: DeliveryProject): string {
  const flags: string[] = [];
  if (project.evm.spi < 1) flags.push('behind schedule');
  if (project.evm.costVariance < 0) flags.push('over budget');
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
  const behindSchedule = active.filter((project) => project.evm.spi < 1);
  const pendingApprovals = approvals?.length ?? 0;

  const pv = rows.reduce((sum, project) => sum + project.evm.plannedValue, 0);
  const ev = rows.reduce((sum, project) => sum + project.evm.earnedValue, 0);
  const ac = rows.reduce((sum, project) => sum + project.evm.actualCost, 0);
  const portfolioSpi = pv > 0 ? ev / pv : null;
  const portfolioCpi = ac > 0 ? ev / ac : null;

  // Worst-first: the deepest cost overrun, then the worst schedule performance.
  const attentionSorted = [...atRisk].sort((a, b) => (a.evm.costVariance - b.evm.costVariance) || (a.evm.spi - b.evm.spi));
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
    detailSecondary: `SPI ${project.evm.spi.toFixed(2)} · CPI ${project.evm.cpi.toFixed(2)}`,
    trailing: project.evm.costVariance < 0 ? `${aed(project.evm.costVariance)}` : aed(project.value),
    trailingStrong: true,
  }));

  const spiText = portfolioSpi === null ? '—' : portfolioSpi.toFixed(2);
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
      anchor={{ href: '/projects/dashboard', title: 'Project Delivery', type: 'Delivery' }}
      hero={{
        eyebrow: 'AURA OS / PROJECT DELIVERY',
        title: <>Project <span>Delivery</span></>,
        lede: projects === null
          ? 'Portfolio execution health across engineering, site, quality, HSE and commissioning.'
          : `${active.length} active project${active.length === 1 ? '' : 's'} · portfolio SPI ${spiText} · ${atRisk.length} need attention.`,
      }}
      askAura={{ tabType: 'Delivery' }}
      metrics={metrics}
      continueWorking={<ContinueWorking match={['/project']} />}
      attention={{
        kicker: 'Earned-value engine · deepest gap first',
        title: 'Projects needing attention',
        headerLink: { href: '/projects/dashboard', label: 'Open portfolio', tabTitle: 'Project Delivery', tabType: 'Delivery' },
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
        cta: { href: '/ai', label: 'Continue with AURA', tabTitle: 'AURA AI', tabType: 'Delivery' },
      }}
      shortcuts={{
        kicker: 'Delivery workspace',
        title: 'Project Delivery',
        itemTestId: 'delivery-shortcut',
        items: SHORTCUTS,
      }}
      ownership={<><Boxes aria-hidden /><span><strong>Delivery owns execution.</strong> Every figure is read live from the portfolio’s earned-value health.</span></>}
    />
  );
}
