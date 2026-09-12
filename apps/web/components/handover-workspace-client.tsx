'use client';

import { useCallback, useTransition, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWorkspaceSection } from '@/lib/use-workspace-section';
import { HANDOVER_PATH, HANDOVER_SECTIONS } from '@/lib/workspace-sections';
import HandoverClient from './handover-client';
import { OmPackSection, TrainingSection, type OmItemRow, type SystemRow, type TrainingRow } from './handover-om-training';
import { DossierSection, type DossierData } from './handover-dossier';
import { DefectsSection, type DefectsData } from './handover-defects';
import { SparesSection, type SpareRow } from './handover-spares';

type Section = (typeof HANDOVER_SECTIONS)[number]['id'];
const SECTION_IDS = HANDOVER_SECTIONS.map((s) => s.id) as Section[];

/**
 * The Handover workspace (TC-GATE-5, extended by TC-GATE-7 and -9).
 *
 * Five sections, and only five, because only five have real data behind them: the acceptance
 * packages, the O&M pack, client training, the dossier those three assemble, and the snag & punch
 * list — which reads two other domains' defects and writes neither. Scope and a separate acceptance
 * surface are not here — each would need work that does not exist yet, and an empty section promises
 * something the app cannot do.
 *
 * The same URL contract as every other workspace: `?section=` addressable, `?project=` preserved
 * across a switch, and the AURA tab anchor untouched.
 */
export default function HandoverWorkspaceClient({
  projects, packages, systems, omItems, trainingSessions, dossiers, defects, spares, selectedProject,
}: {
  projects: { id: string; title: string }[];
  packages: Parameters<typeof HandoverClient>[0]['initialPackages'];
  systems: SystemRow[];
  omItems: OmItemRow[] | null;
  trainingSessions: TrainingRow[] | null;
  dossiers: DossierData[] | null;
  defects: DefectsData | null;
  spares: SpareRow[] | null;
  selectedProject: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { active } = useWorkspaceSection<Section>(HANDOVER_PATH, SECTION_IDS, 'packages');
  const [switching, startSwitch] = useTransition();

  const go = useCallback((section: Section) => {
    const next = new URLSearchParams(searchParams.toString());
    if (section === 'packages') next.delete('section'); else next.set('section', section);
    const query = next.toString();
    window.history.replaceState(null, '', query ? `${HANDOVER_PATH}?${query}` : HANDOVER_PATH);
  }, [searchParams]);

  /** Changing project changes the DATA, so this is a real navigation with a visible pending state. */
  function chooseProject(projectId: string): void {
    const next = new URLSearchParams(searchParams.toString());
    if (projectId) next.set('project', projectId); else next.delete('project');
    const query = next.toString();
    startSwitch(() => router.push(query ? `${HANDOVER_PATH}?${query}` : HANDOVER_PATH));
  }

  return (
    <div style={st.wrap} data-testid="handover-workspace">
      <div style={st.contextBar}>
        <label style={st.contextLabel}>
          <span>Project</span>
          <select value={selectedProject} onChange={(e) => chooseProject(e.target.value)} disabled={switching} style={st.select} data-testid="handover-project-filter">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        {switching && <span style={st.pending} role="status">Loading project…</span>}
      </div>

      <nav style={st.tabs} aria-label="Handover sections">
        {HANDOVER_SECTIONS.map((section) => (
          <button
            key={section.id}
            onClick={() => go(section.id)}
            // Inert while a project change is in flight: useSearchParams still reports the old query
            // until it commits, so a click landing in the gap would discard the project.
            disabled={switching}
            style={active === section.id ? st.activeTabBtn : st.tabBtn}
            aria-current={active === section.id ? 'page' : undefined}
            data-testid={`ho-section-${section.id}`}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {active === 'om' ? (
        <>
          <OmPackSection systems={systems} items={omItems} />
          {/* TC-GATE-16: spares live beside the O&M pack because that is the pack a client receives,
              but they are a separate authority with their own acknowledgement. */}
          <SparesSection systems={systems} spares={spares} />
        </>
      ) : active === 'training' ? (
        <TrainingSection projectId={selectedProject} systems={systems} sessions={trainingSessions} />
      ) : active === 'dossier' ? (
        <DossierSection dossiers={dossiers} />
      ) : active === 'snags' ? (
        <DefectsSection defects={defects} systems={systems} />
      ) : (
        <HandoverClient initialPackages={packages} projects={projects} />
      )}
    </div>
  );
}

const st = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 } as CSSProperties,
  contextBar: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  contextLabel: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  pending: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  select: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit' } as CSSProperties,
  tabs: { display: 'flex', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  tabBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontWeight: 500, fontSize: 14 } as CSSProperties,
  activeTabBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--panel-2)', color: 'var(--text)', cursor: 'pointer', fontWeight: 700, fontSize: 14 } as CSSProperties,
};
