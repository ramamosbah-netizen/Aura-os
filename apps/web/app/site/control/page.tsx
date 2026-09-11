import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SiteControlClient from '../../../components/site-control-client';
import DeliveryOperationsWorkspaceHeader from '../../../components/delivery-operations-workspace-header';
import DeliveryWorkspaceSummary, { type WorkspaceAttention, type WorkspaceMetric } from '../../../components/delivery-workspace-summary';

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
    </div>
  );
}

const st = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};
