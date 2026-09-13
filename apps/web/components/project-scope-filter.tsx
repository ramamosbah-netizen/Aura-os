'use client';

import { useTransition } from 'react';
import type { CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';

/**
 * The project a delivery workspace is scoped to.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. It is a FILTER, not a permission. It writes `?project=` and the
 * page turns that into `?projectId=` on the API, so the narrowing happens on the SERVER and the rows
 * for other projects never reach the browser. That matters: a selector that hid rows client-side
 * would leave the same data on the wire, readable from the API or devtools, while the page looked
 * restricted — a control that reads as a guarantee and is not one.
 *
 * It is still not authorisation. Any signed-in user may pick any project here today. When
 * "see only my projects" arrives, the enforcement belongs in the API — the server deciding which
 * projects this user may read — and this control does not change shape: the option list narrows and
 * a projectId the user has no claim to stops being answered. Trimming only the dropdown would be
 * bypassable by editing the URL, which is the same failure this component exists to avoid.
 *
 * Hence "All projects" as the default label, and not "My projects": the honest name for what it does.
 *
 * Extracted from the hand-rolled copies in the Testing and Handover workspaces so the seven delivery
 * workspaces cannot drift into seven slightly different project pickers.
 */
export default function ProjectScopeFilter({
  projects,
  selected,
  path,
  testId = 'project-filter',
}: {
  projects: { id: string; title: string }[];
  selected: string;
  /** The workspace's own path, e.g. `/site/control` — the target of the navigation. */
  path: string;
  /** Overridable so a workspace that already had its own picker keeps its spec's handle. */
  testId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useHydrated();
  const [switching, startSwitch] = useTransition();

  /** Changing project changes the DATA, so this is a real navigation, with a visible pending state. */
  function choose(projectId: string): void {
    const next = new URLSearchParams(searchParams.toString());
    if (projectId) next.set('project', projectId);
    else next.delete('project');
    const query = next.toString();
    startSwitch(() => router.push(query ? `${path}?${query}` : path));
  }

  return (
    <div style={st.bar}>
      <label style={st.label}>
        <span>Project</span>
        <select
          value={selected}
          onChange={(e) => choose(e.target.value)}
          // `!hydrated` as well as `switching`: server-rendered markup is not interactive yet, and a
          // change that lands before React attaches is silently lost.
          disabled={switching || !hydrated}
          style={st.select}
          data-testid={testId}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </label>
      {switching && (
        <span style={st.pending} role="status" data-testid="project-switching">Loading project…</span>
      )}
    </div>
  );
}

const st = {
  bar: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 18px' } as CSSProperties,
  label: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  select: {
    padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
    fontSize: 13, background: 'var(--panel)', color: 'var(--text)',
  } as CSSProperties,
  pending: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
};
