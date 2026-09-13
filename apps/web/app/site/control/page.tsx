import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SiteControlClient from '../../../components/site-control-client';
import AuraTabAnchor from '../../../components/aura-tab-anchor';
import DeliveryOperationsWorkspaceHeader from '../../../components/delivery-operations-workspace-header';
import DeliveryWorkspaceSummary, { type WorkspaceAttention, type WorkspaceMetric } from '../../../components/delivery-workspace-summary';
import SuiteShortcutGrid from '../../../components/suite-shortcut-grid';
import { SITE_PATH, SITE_SECTIONS, sectionShortcuts } from '@/lib/workspace-sections';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
}

interface DailyReport {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  workDescription: string;
  manpowerCount: number;
  equipmentCount: number;
  status: 'draft' | 'submitted';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SiteInstruction {
  id: string;
  projectId: string;
  projectName: string | null;
  reference: string;
  issuedBy: string;
  date: string;
  instruction: string;
  costImplication: boolean;
  timeImplication: boolean;
  status: string;
}

interface DelayLog {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  delayType: 'weather' | 'material' | 'access' | 'drawings' | 'other';
  description: string;
  impactHours: number;
  status: 'logged' | 'resolved';
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MaterialConsumption {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  itemId: string;
  itemName: string;
  quantityConsumed: number;
  unit: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LabourAllocation {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  trade: string;
  headcount: number;
  hours: number;
  manHours: number;
  subcontractorName: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

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

interface ProjectSchedule {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  tasks: ScheduleTask[];
  baselineSetAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export default async function SiteControlPage() {
  const [dailyReports, delayLogs, materialConsumption, labourAllocations, schedules, projects, instructions] = await Promise.all([
    getJson<DailyReport[]>('/api/site/daily-reports'),
    getJson<DelayLog[]>('/api/site/delay-logs'),
    getJson<MaterialConsumption[]>('/api/site/material-consumption'),
    getJson<LabourAllocation[]>('/api/site/labour'),
    getJson<ProjectSchedule[]>('/api/projects/schedules'),
    getJson<Project[]>('/api/projects/projects'),
    getJson<SiteInstruction[]>('/api/site/instructions'),
  ]);

  const open = <T extends { status?: string }>(rows: T[] | null, closed: string[]) => rows === null ? null : rows.filter((row) => !closed.includes((row.status ?? '').toLowerCase())).length;
  const activeWork = schedules === null ? null : schedules.reduce((total, schedule) => total + schedule.tasks.filter((task) => task.percentComplete > 0 && task.percentComplete < 100).length, 0);
  const metrics: WorkspaceMetric[] = [
    { label: 'Active work', value: activeWork, hint: 'Schedule activities in progress', tone: 'accent' },
    { label: 'Instructions', value: open(instructions, ['closed', 'acknowledged']), hint: 'Field directions awaiting action', tone: 'warning' },
    { label: 'Reports due', value: open(dailyReports, ['submitted']), hint: 'Draft site diaries', tone: 'warning' },
    { label: 'Blocked', value: open(delayLogs, ['resolved']), hint: 'Unresolved delay logs', tone: 'critical' },
  ];
  const attention: WorkspaceAttention[] | null = [instructions, dailyReports, delayLogs].some((rows) => rows === null) ? null : [
    ...(delayLogs ?? []).filter((row) => row.status !== 'resolved').slice(0, 2).map((row) => ({ label: `${row.projectName ?? 'Project'} · delay`, detail: row.description, href: '/site/control', tone: 'critical' as const })),
    ...(dailyReports ?? []).filter((row) => row.status !== 'submitted').slice(0, 2).map((row) => ({ label: `${row.projectName ?? 'Project'} · daily report`, detail: `${row.date} · draft not submitted`, href: '/site/daily-reports', tone: 'warning' as const })),
    ...(instructions ?? []).filter((row) => !['closed', 'acknowledged'].includes(row.status.toLowerCase())).slice(0, 2).map((row) => ({ label: `${row.projectName ?? 'Project'} · ${row.reference}`, detail: 'Acknowledgement pending', href: '/site/instructions', tone: 'warning' as const })),
  ];

  return (
    <div style={st.page}>
      {/* The workspace keeps a tab of its own, so opening a section from the grid below adds a tab
          beside it rather than replacing the way back. Same contract as Engineering. */}
      <AuraTabAnchor href={SITE_PATH} title="Site" type="Delivery Operations" />
      <DeliveryOperationsWorkspaceHeader active="site" title="Site execution workspace" description="Coordinate field work through controlled instructions, daily reports, progress, delays, labour, equipment and site evidence." />

      <DeliveryWorkspaceSummary eyebrow="FIELD OPERATIONS" title="Today's operating picture" description="Keep the field moving with clear work, exception and evidence signals. Actions remain owned by Site." metrics={metrics} attention={attention} emptyMessage="No site exceptions are open for the available records." />

      <SiteControlClient
        initialDailyReports={dailyReports ?? []}
        initialDelayLogs={delayLogs ?? []}
        initialMaterialConsumption={materialConsumption ?? []}
        initialLabourAllocations={labourAllocations ?? []}
        schedules={schedules ?? []}
        projects={projects ?? []}
        initialInstructions={instructions ?? []}
        instructionsUnavailable={instructions === null}
      />

      {/* The same shortcut grid Sales and the Delivery Operations overview use. Each card opens its
          section as an AURA tab beside the workspace's own, so two sections can be held open at once
          — which is all a single tab strip could never do. No counts: the summary above already
          carries the numbers, and repeating them here would only invite the two to disagree. */}
      <div style={{ marginTop: 24 }}>
        <SuiteShortcutGrid
          kicker="Site execution workspace"
          title="Site sections"
          items={sectionShortcuts(SITE_PATH, SITE_SECTIONS, 'instructions')}
          itemTestId="site-shortcut"
          tabType="Site"
          titleId="site-sections-title"
        />
      </div>
    </div>
  );
}

const st = {
  // FULL WIDTH, the same change and for the same reason as the Engineering workspace. This was
  // `maxWidth: 1020, margin: '0 auto'`, which centred the page in a 1020px column and left the rest
  // of the screen empty on both sides. The section shortcut grid is `repeat(4, minmax(0, 1fr))`, so
  // it stretches with its container and every pixel the cap withheld came out of the cards.
  //
  // `sub` below keeps its own `maxWidth: 640`: the description stays a readable measure rather than
  // one line across the whole display.
  page: { padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};
