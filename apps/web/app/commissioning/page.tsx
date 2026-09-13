import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import AuraTabAnchor from '../../components/aura-tab-anchor';
import DeliveryOperationsWorkspaceHeader from '../../components/delivery-operations-workspace-header';
import DeliveryWorkspaceSummary, { type WorkspaceAttention, type WorkspaceMetric } from '../../components/delivery-workspace-summary';
import CommissioningWorkspaceClient, {
  type DeviceRow, type Project, type PunchRow, type WorkspaceView,
} from '../../components/commissioning-workspace-client';
import type { QualityEvidence } from '../../components/commissioning-gate3-sections';

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

  const [view, projects, punch, devices, qualityEvidence] = await Promise.all([
    getJson<WorkspaceView>(`/api/commissioning/records/workspace${scoped}`),
    getJson<Project[]>('/api/projects/projects'),
    getJson<PunchRow[]>(`/api/commissioning/records/punch-items${scoped}`),
    // Equipment and Quality evidence both come through commissioning's own read, which goes through
    // the cross-module PORTS. Reading the ELV and Quality APIs directly here would let this page show
    // one thing while the readiness chain computed from another — the drift these ports exist to stop.
    project ? getJson<DeviceRow[]>(`/api/commissioning/records/equipment?projectId=${encodeURIComponent(project)}`) : Promise.resolve([]),
    project ? getJson<QualityEvidence>(`/api/commissioning/records/quality-evidence?projectId=${encodeURIComponent(project)}`) : Promise.resolve(null),
  ]);

  const totals = view?.totals;
  const metrics: WorkspaceMetric[] = [
    { label: 'In scope', value: totals?.inScope ?? null, hint: 'Systems registered for T&C', tone: 'accent' },
    { label: 'Failing', value: totals?.failing ?? null, hint: 'A test point stands failed', tone: 'critical' },
    { label: 'Open defects', value: totals?.openPunch ?? null, hint: 'Punch items blocking sign-off', tone: 'warning' },
    { label: 'Commissioning ready', value: totals?.commissioningReady ?? null, hint: 'Whole readiness chain satisfied', tone: 'good' },
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
        qualityEvidence={qualityEvidence}
        selectedProject={project}
      />
    </div>
  );
}

const st = {
  // Full width across the delivery suite: the fixed column left the display empty on both sides
  // while the section cards, which stretch with their container, were squeezed. The header's
  // own description stays capped at 760px, so the prose is still a readable measure.
  page: { padding: '28px 28px 64px' } as CSSProperties,
};
