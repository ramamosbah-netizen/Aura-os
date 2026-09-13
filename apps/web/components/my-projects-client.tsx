'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Pager, { usePaged } from '@/components/ui/pager';
import EmptyState from '@/components/ui/empty-state';

/**
 * My Projects — the entry point to project work.
 *
 * Everything shown here was decided by the API: `/api/projects/mine` returns the projects this
 * caller is entitled to, and this renders them. There is deliberately no filtering in this
 * component — not even a defensive one — because a filter here would imply the list arriving might
 * contain something it should not, and that is exactly the assumption the backend boundary exists
 * to remove. If an unauthorised project ever appeared on this screen, the bug would be upstream and
 * hiding it here would only make it harder to find.
 *
 * `scope` comes from the API for the same reason: whether this is "your projects" or "the
 * organisation's" is an answer, not something to infer from how many rows came back.
 */
export interface MyProject {
  id: string;
  title: string;
  reference: string | null;
  status: string;
  accountName?: string | null;
  contractTitle?: string | null;
}

export interface MyProjectsPage {
  items: MyProject[];
  total: number;
  scope: 'organisation' | 'projects' | 'none';
}

function statusStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', textTransform: 'capitalize' };
  if (/active|in_progress|delivery/i.test(status)) return { ...base, background: 'var(--good-soft)', color: 'var(--good)' };
  if (/hold|blocked|suspend/i.test(status)) return { ...base, background: 'var(--warn-soft)', color: 'var(--warn)' };
  if (/closed|complete|handed/i.test(status)) return { ...base, background: 'var(--panel-2)', color: 'var(--muted)' };
  return { ...base, background: 'var(--info-soft)', color: 'var(--info)' };
}

export default function MyProjectsClient({ initial }: { initial: MyProjectsPage | null }) {
  const [data, setData] = useState<MyProjectsPage | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (initial !== null) return;
    let live = true;
    // Only runs when the server render could not reach the API — a genuine loading state rather
    // than a spinner shown on every visit for the look of it.
    void (async () => {
      try {
        const res = await fetch('/api/projects/mine', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        if (live) setData((await res.json()) as MyProjectsPage);
      } catch {
        if (live) setFailed(true);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [initial]);

  /**
   * Search is local to the page that was returned. The API also searches the authorised set — this
   * narrows what is already on screen and never reaches for more, so it cannot show a project the
   * server did not send. For a caller with more projects than one page, the API's own `q` is the
   * one that matters, and the count below says which set is being searched.
   */
  const projects = data?.items ?? [];
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => `${p.title} ${p.reference ?? ''} ${p.accountName ?? ''}`.toLowerCase().includes(q));
  }, [projects, query]);
  const page = usePaged(matches);

  if (loading) {
    return <div style={st.notice} data-testid="my-projects-loading">Loading your projects…</div>;
  }

  if (failed || !data) {
    // Distinguished from "you have none": one is a fault, the other is an answer, and a screen that
    // conflates them tells a user they have no work when the server is simply down.
    return (
      <div style={st.error} role="alert" data-testid="my-projects-unavailable">
        Your projects could not be read. This is a fault, not an empty list — retry, or contact your
        administrator if it persists.
      </div>
    );
  }

  if (data.scope === 'none' || projects.length === 0) {
    return (
      <div data-testid="my-projects-empty">
        <EmptyState
          title="No projects are assigned to you"
          description={
            data.scope === 'none'
              ? 'You hold no project access yet. A project manager or administrator adds you to a project from its Team screen, and it will appear here.'
              : 'You have project access, but no project matches. If you expect one here, ask its project manager to confirm your role on it.'
          }
        />
      </div>
    );
  }

  return (
    <>
      <div style={st.bar}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your projects"
          style={st.search}
          data-testid="my-projects-search"
        />
        <span style={st.count} data-testid="my-projects-count">
          {matches.length === projects.length
            ? `${data.total} project${data.total === 1 ? '' : 's'}`
            : `${matches.length} of ${projects.length} shown`}
        </span>
        {/* Said plainly rather than implied by the row count: a reader should know whether they are
            looking at their own projects or the whole organisation's. */}
        <span style={st.scope} data-testid="my-projects-scope">
          {data.scope === 'organisation' ? 'organisation-wide access' : 'projects you are assigned to'}
        </span>
      </div>

      {matches.length === 0 ? (
        <div style={st.notice} data-testid="my-projects-no-match">
          No project matches “{query.trim()}”. You have access to {projects.length}.
        </div>
      ) : (
        <>
          <ul style={st.list} data-testid="my-projects-list">
            {page.slice.map((p) => (
              <li key={p.id} style={st.card} data-testid={`my-project-${p.id}`}>
                <a href={`/project/${p.id}`} style={st.link} data-testid={`my-project-open-${p.id}`}>
                  <span style={st.head}>
                    <strong style={st.title} title={p.title}>{p.title}</strong>
                    <span style={statusStyle(p.status)}>{p.status.replace(/_/g, ' ')}</span>
                  </span>
                  <span style={st.meta}>
                    {p.reference ? <span style={st.ref}>{p.reference}</span> : null}
                    {p.accountName ? <span title={p.accountName}>· {p.accountName}</span> : null}
                    {p.contractTitle ? <span title={p.contractTitle}>· {p.contractTitle}</span> : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <Pager state={page} label="projects" testId="my-projects-pager" />
        </>
      )}
    </>
  );
}

const st = {
  bar: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 } as CSSProperties,
  search: { flex: 1, minWidth: 200, maxWidth: 380, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  count: { fontSize: 12.5, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' } as CSSProperties,
  scope: { fontSize: 11.5, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel-2)', minWidth: 0 } as CSSProperties,
  link: { display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', textDecoration: 'none', color: 'inherit', minWidth: 0 } as CSSProperties,
  head: { display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 } as CSSProperties,
  title: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 } as CSSProperties,
  meta: { display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--muted)', minWidth: 0, overflowWrap: 'anywhere' } as CSSProperties,
  ref: { fontFamily: 'var(--mono, ui-monospace, monospace)', color: 'var(--accent)' } as CSSProperties,
  notice: { border: '1px dashed var(--border)', borderRadius: 12, padding: 24, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  error: { border: '1px solid var(--bad)', background: 'var(--bad-soft)', color: 'var(--bad)', borderRadius: 12, padding: 20, fontSize: 13.5 } as CSSProperties,
};
