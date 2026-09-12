import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import HandoverWorkspaceClient from '../../components/handover-workspace-client';
import type { OmItemRow, SystemRow, TrainingRow } from '../../components/handover-om-training';
import type { DossierData } from '../../components/handover-dossier';
import type { DefectsData } from '../../components/handover-defects';
import type { SpareRow } from '../../components/handover-spares';
import AuraTabAnchor from '../../components/aura-tab-anchor';
import DeliveryOperationsWorkspaceHeader from '../../components/delivery-operations-workspace-header';
import DeliveryWorkspaceSummary, { type WorkspaceAttention, type WorkspaceMetric } from '../../components/delivery-workspace-summary';

export const dynamic = 'force-dynamic';

interface Project { id: string; title: string }

interface HandoverPackage {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  status: 'draft' | 'submitted' | 'accepted' | 'rejected';
  checklist: {
    omManuals: boolean; asBuilts: boolean; testCertificates: boolean;
    warrantyDocs: boolean; training: boolean; spares: boolean;
  };
  submittedAt: string | null;
  acceptedAt: string | null;
  clientRepresentative: string | null;
  warrantyStartDate: string | null;
  warrantyMonths: number | null;
  remarks: string | null;
  systemsTotal: number;
  systemsCommissioned: number;
  readiness?: { readyToSubmit: boolean; blocking: string[]; items: { id: string; label: string; state: string; reason: string; source: string; evidence: 'projected' | 'asserted' }[] };
}

interface WorkspaceView { systems: { record: { id: string; code: string; title: string } }[] }

export default async function HandoverPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; section?: string }>;
}) {
  const filters = (await searchParams) ?? {};
  const project = filters.project ?? '';
  const scoped = project ? `?projectId=${encodeURIComponent(project)}` : '';

  const [packages, projects, workspace, omItems, trainingSessions, defects, spares] = await Promise.all([
    getJson<HandoverPackage[]>(`/api/commissioning/handovers${scoped}`),
    getJson<Project[]>('/api/projects/projects'),
    // The systems an O&M pack and a training session hang off — read from T&C, which owns them.
    project ? getJson<WorkspaceView>(`/api/commissioning/records/workspace${scoped}`) : Promise.resolve(null),
    getJson<OmItemRow[]>(`/api/commissioning/handovers/om-items${scoped}`),
    getJson<TrainingRow[]>(`/api/commissioning/handovers/training${scoped}`),
    // Both defect authorities (TC-GATE-9) — project-scoped, so only fetched with a project chosen.
    project ? getJson<DefectsData>(`/api/commissioning/handovers/defects${scoped}`) : Promise.resolve(null),
    // Spares (TC-GATE-16) — Handover's own authority, and the last readiness item to get one.
    getJson<SpareRow[]>(`/api/commissioning/handovers/spares${scoped}`),
  ]);
  const systems: SystemRow[] = (workspace?.systems ?? []).map((s) => ({ id: s.record.id, code: s.record.code, title: s.record.title }));

  /**
   * The dossier for each package in scope (TC-GATE-7).
   *
   * One read per package rather than one for the project, because a dossier belongs to a PACKAGE:
   * what was issued, and when, is a fact about the thing that was sent. Projects carry one package
   * in practice, so this is one call; the map is here so a second package does not silently show the
   * first one's manifest.
   *
   * Null when nothing could be read — the section says so rather than rendering an empty dossier,
   * which would read as "there is nothing to hand over".
   */
  const dossiers: DossierData[] | null =
    packages === null
      ? null
      : (await Promise.all(packages.map((p) => getJson<DossierData>(`/api/commissioning/handovers/${p.id}/dossier`)))).filter(
          (d): d is DossierData => d !== null && Boolean(d.view),
        );

  const metrics: WorkspaceMetric[] = [
    { label: 'In handover', value: packages === null ? null : packages.filter((row) => row.status === 'submitted' || row.status === 'draft').length, hint: 'Packages being compiled', tone: 'accent' },
    // Blocked comes from the ASSESSED readiness now, not from re-reading the checkboxes here — the
    // page and the submit guard must not be able to disagree about what is blocked.
    { label: 'Blocked', value: packages === null ? null : packages.filter((row) => row.status === 'draft' && row.readiness && !row.readiness.readyToSubmit).length, hint: 'Handover evidence still open', tone: 'critical' },
    { label: 'Needs action', value: packages === null ? null : packages.filter((row) => row.status === 'submitted' || row.status === 'rejected').length, hint: 'Client or internal decision', tone: 'warning' },
    { label: 'Accepted', value: packages === null ? null : packages.filter((row) => row.status === 'accepted').length, hint: 'Accepted packages', tone: 'good' },
  ];
  const attention: WorkspaceAttention[] | null = packages === null ? null : packages.filter((row) => row.status !== 'accepted').slice(0, 4).map((row) => ({ label: `${row.projectName ?? 'Project'} · ${row.code}`, detail: row.status === 'submitted' ? 'Awaiting client acceptance' : row.status === 'rejected' ? 'Returned for correction' : 'Evidence package is still open', href: '/handover', tone: row.status === 'rejected' ? 'critical' as const : 'warning' as const }));

  return (
    <div style={st.page}>
      {/* The workspace keeps a tab of its own, like every other Delivery Operations workspace, so it
          survives opening something else and can be returned to. The anchor href carries no section,
          so it always returns to the packages.

          It gained sections at TC-GATE-5 and a fourth at TC-GATE-7 — four, because only four have
          real data behind them. Its readiness panel is still a projection rather than a second place
          to stand, and five of the six items it shows are now derived. */}
      <AuraTabAnchor href="/handover" title="Handover" type="Delivery Operations" />
      <DeliveryOperationsWorkspaceHeader active="handover" title="Handover workspace" description="Assemble the acceptance package, track outstanding deliverables and record the governed client handover that closes delivery." />
      <DeliveryWorkspaceSummary eyebrow="HANDOVER OPERATIONS" title="Handover operating picture" description="See which acceptance packages are ready, blocked or waiting for a decision before close-out." metrics={metrics} attention={attention} emptyMessage="No handover exceptions are open for the available packages." />
      <HandoverWorkspaceClient
        packages={packages ?? []}
        projects={projects ?? []}
        systems={systems}
        omItems={omItems}
        trainingSessions={trainingSessions}
        dossiers={dossiers}
        defects={defects}
        spares={spares}
        selectedProject={project}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
};
