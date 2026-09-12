import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import AuraTabAnchor from '../../components/aura-tab-anchor';
import DeliveryOperationsWorkspaceHeader from '../../components/delivery-operations-workspace-header';
import DeliveryWorkspaceSummary, { type WorkspaceAttention, type WorkspaceMetric } from '../../components/delivery-workspace-summary';
import CommissioningWorkspaceClient, {
  type DeviceRow, type Project, type PunchRow, type WorkspaceView,
} from '../../components/commissioning-workspace-client';

export const dynamic = 'force-dynamic';

/**
 * Testing & commissioning (TC-GATE-2).
 *
 * Everything on this page is DERIVED from the test evidence by the API's workspace projection — the
 * same calculation the sign-off guard uses — so the operating picture cannot promise a commissioning
 * the backend will refuse, and there is no readiness flag for anyone to tick. A source that does not
 * respond shows as unavailable rather than as a zero.
 */
export default async function CommissioningPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; section?: string; filter?: string }>;
}) {
  const filters = (await searchParams) ?? {};
  const project = filters.project ?? '';
  const scoped = project ? `?projectId=${encodeURIComponent(project)}` : '';

  const [view, projects, punch, devices] = await Promise.all([
    getJson<WorkspaceView>(`/api/commissioning/records/workspace${scoped}`),
    getJson<Project[]>('/api/projects/projects'),
    getJson<PunchRow[]>(`/api/commissioning/records/punch-items${scoped}`),
    // Equipment is read from the ELV device register, which owns it. Project-scoped only: the whole
    // tenant's device schedule is not a T&C question.
    project ? getJson<DeviceRow[]>(`/api/elv/devices?projectId=${encodeURIComponent(project)}`) : Promise.resolve([]),
  ]);

  const totals = view?.totals;
  const metrics: WorkspaceMetric[] = [
    { label: 'In scope', value: totals?.inScope ?? null, hint: 'Systems registered for T&C', tone: 'accent' },
    { label: 'Failing', value: totals?.failing ?? null, hint: 'A test point stands failed', tone: 'critical' },
    { label: 'Open defects', value: totals?.openPunch ?? null, hint: 'Punch items blocking sign-off', tone: 'warning' },
    { label: 'Commissioned', value: totals?.commissioned ?? null, hint: 'Witnessed sign-off complete', tone: 'good' },
  ];
  // The exception lane names the blocker, not the status: "3 test points failing" is actionable,
  // "failed" is a label. Each row leads to the system it is about.
  const attention: WorkspaceAttention[] | null = view === null ? null : view.systems
    .filter((s) => !s.commissioned && s.blockers.length > 0)
    .slice(0, 4)
    .map((s) => ({
      label: `${s.record.projectName ?? 'Project'} · ${s.record.code}`,
      detail: s.blockers.join(' · '),
      href: `/commissioning/${s.record.id}`,
      tone: (s.pointsFailing > 0 ? 'critical' : 'warning') as 'critical' | 'warning',
    }));

  return (
    <div style={st.page}>
      {/* The workspace keeps a tab of its own, and the anchor href carries no section, so it always
          returns to the command centre. Unchanged from 08fd19e4. */}
      <AuraTabAnchor href="/commissioning" title="Testing & commissioning" type="Delivery Operations" />
      <DeliveryOperationsWorkspaceHeader active="commissioning" title="Testing & commissioning workspace" description="Turn installed systems into accepted systems through test plans, point results, witnessed sign-off and commissioning evidence." />
      <DeliveryWorkspaceSummary eyebrow="TESTING & COMMISSIONING" title="Commissioning operating picture" description="Move systems from ready to test through witnessed testing, retest and final commissioning." metrics={metrics} attention={attention} emptyMessage="No system is blocked from commissioning." />
      <CommissioningWorkspaceClient
        projects={projects ?? []}
        view={view}
        punch={punch}
        devices={devices}
        selectedProject={project}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
};
