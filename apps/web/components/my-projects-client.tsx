'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Pager, { type PagerState } from '@/components/ui/pager';
import EmptyState from '@/components/ui/empty-state';
import { MY_PROJECTS_PAGE_SIZE } from '@/lib/my-projects';

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

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export default function MyProjectsClient({ initial }: { initial: MyProjectsPage | null }) {
  const [data, setData] = useState<MyProjectsPage | null>(initial);
  /** The page on screen: which search it answers and where it starts. */
  const [shown, setShown] = useState({ q: '', page: 0 });
  /** The page asked for. It becomes `shown` only when its answer arrives. */
  const [request, setRequest] = useState({ q: '', page: 0 });
  /** How many projects this caller can access at all — known from any unsearched answer. */
  const [accessTotal, setAccessTotal] = useState<number | null>(initial?.total ?? null);
  const [loading, setLoading] = useState(initial === null);
  const [fetching, setFetching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const latest = useRef(0);
  // The server already rendered the first unsearched page; asking for it again would be a round
  // trip for nothing. Only when it could not reach the API does the screen ask on its own.
  const skipFirst = useRef(initial !== null);

  /**
   * EVERY SEARCH AND EVERY PAGE IS THE API'S (J2-01). The screen used to filter and page the first
   * page it had been sent: with 1,860 projects it searched 50 of them, a project past the 50th was
   * unfindable, and "no match — you have access to 50" understated the caller's access by 1,810.
   * The API already searches, counts and pages the AUTHORISED set; the screen now asks it, and
   * every number shown is a total the server computed.
   *
   * Answers can arrive out of order (typing is faster than the network), so only the answer to the
   * latest request is kept.
   */
  const load = useCallback(async (q: string, pageIndex: number) => {
    const ticket = ++latest.current;
    setFetching(true);
    try {
      const params = new URLSearchParams({ limit: String(MY_PROJECTS_PAGE_SIZE), offset: String(pageIndex * MY_PROJECTS_PAGE_SIZE) });
      if (q) params.set('q', q);
      const res = await fetch(`/api/projects/mine?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as MyProjectsPage;
      if (ticket !== latest.current) return;
      setData(next);
      setShown({ q, page: pageIndex });
      setFailed(false);
      if (!q) setAccessTotal(next.total);
    } catch {
      if (ticket === latest.current) setFailed(true);
    } finally {
      if (ticket === latest.current) { setFetching(false); setLoading(false); }
    }
  }, []);

  // A new search starts on page one; typing is debounced so each keystroke is not a request.
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(() => setRequest((r) => (r.q === q ? r : { q, page: 0 })), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    void load(request.q, request.page);
  }, [request, load]);

  const projects = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / MY_PROJECTS_PAGE_SIZE));

  // A page past the end (the set shrank since it was counted) steps back to the last real page
  // rather than showing an empty list that reads as "none".
  useEffect(() => {
    if (!fetching && projects.length === 0 && total > 0 && shown.page > 0) setRequest({ q: shown.q, page: pages - 1 });
  }, [fetching, projects.length, total, shown, pages]);

  const pager: PagerState = {
    page: shown.page,
    pages,
    from: projects.length === 0 ? 0 : shown.page * MY_PROJECTS_PAGE_SIZE + 1,
    to: shown.page * MY_PROJECTS_PAGE_SIZE + projects.length,
    total,
    hasPrev: shown.page > 0,
    hasNext: shown.page + 1 < pages,
    prev: () => setRequest({ q: shown.q, page: Math.max(0, shown.page - 1) }),
    next: () => setRequest({ q: shown.q, page: Math.min(pages - 1, shown.page + 1) }),
  };

  if (loading) {
    return <div style={st.notice} data-testid="my-projects-loading">Loading your projects…</div>;
  }

  if (!data) {
    // Distinguished from "you have none": one is a fault, the other is an answer, and a screen that
    // conflates them tells a user they have no work when the server is simply down.
    return (
      <div style={st.error} role="alert" data-testid="my-projects-unavailable">
        Your projects could not be read. This is a fault, not an empty list — retry, or contact your
        administrator if it persists.
      </div>
    );
  }

  if (data.scope === 'none' || accessTotal === 0) {
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
          placeholder="Search your projects by title or reference"
          aria-label="Search your projects"
          style={st.search}
          data-testid="my-projects-search"
        />
        <span style={st.count} data-testid="my-projects-count" aria-live="polite">
          {shown.q ? `${plural(total, 'match', 'matches')} for “${shown.q}”` : plural(total, 'project', 'projects')}
        </span>
        {/* Said plainly rather than implied by the row count: a reader should know whether they are
            looking at their own projects or the whole organisation's. */}
        <span style={st.scope} data-testid="my-projects-scope">
          {data.scope === 'organisation' ? 'organisation-wide access' : 'projects you are assigned to'}
        </span>
      </div>

      {failed && (
        <div style={{ ...st.error, marginBottom: 12 }} role="alert" data-testid="my-projects-search-failed">
          The search could not be completed. This is a fault, not an empty result — the list below is the last one read.
        </div>
      )}

      {projects.length === 0 && shown.q ? (
        <div style={st.notice} data-testid="my-projects-no-match">
          No project matches “{shown.q}”
          {accessTotal !== null ? ` among the ${plural(accessTotal, 'project', 'projects')} you can access.` : '.'}
        </div>
      ) : (
        <>
          <ul style={{ ...st.list, opacity: fetching ? 0.6 : 1 }} data-testid="my-projects-list" aria-busy={fetching}>
            {projects.map((p) => (
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
          <Pager state={pager} label="projects" testId="my-projects-pager" />
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
