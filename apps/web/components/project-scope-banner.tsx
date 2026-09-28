import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

/**
 * UX-01 — A REGISTER OPENED FOR ONE PROJECT SAYS WHICH PROJECT.
 *
 * The Project 360 workspace links into the discipline registers with `?projectId=`, and those pages
 * already ask the API for that project's rows only. What they did not do is SAY so: the engineer
 * left a page headed with the project's name and arrived on one headed "NCR register" — a list that
 * looks exactly like the company-wide one. That is the context badge not surviving the click, and
 * it invites the worst reading: "these are all the NCRs", when they are one project's.
 *
 * Renders nothing when the page is not scoped. The name is read from Projects, the authority; when
 * that read fails the banner still states the scope, by id, rather than dropping it — the rows on
 * the page ARE scoped whether or not the name could be fetched.
 */
export default async function ProjectScopeBanner({
  projectId,
  allHref,
  title,
}: {
  projectId: string | null | undefined;
  /** The same register, unscoped. */
  allHref: string;
  /** Already read by the page — skips the second fetch. */
  title?: string | null;
}) {
  const id = projectId?.trim();
  if (!id) return null;
  const name = title ?? (await getJson<{ title?: string }>(`/api/projects/projects/${encodeURIComponent(id)}`))?.title ?? null;
  return (
    <div style={st.bar} data-testid="project-scope-banner" data-project-id={id}>
      <span>
        Showing records for{' '}
        {name ? <strong data-testid="project-scope-name">{name}</strong> : <>project <code>{id}</code> <span style={st.muted}>(its name could not be read)</span></>}
      </span>
      <a href={`/project/${encodeURIComponent(id)}`} style={st.link}>Project 360</a>
      <a href={allHref} style={st.link} data-testid="project-scope-all">All projects →</a>
    </div>
  );
}

const st = {
  bar: {
    display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 16px', padding: '9px 14px',
    border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel-2)', fontSize: 13,
  } as CSSProperties,
  link: { color: 'var(--accent, #2563eb)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  muted: { color: 'var(--muted)' } as CSSProperties,
};
