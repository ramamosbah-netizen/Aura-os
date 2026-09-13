'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useHydrated } from '@/lib/use-hydrated';
import Pager, { usePaged } from '@/components/ui/pager';

/**
 * Active Drawings, grouped by the project that owns them.
 *
 * A flat register answers "what drawings exist"; a delivery engineer is asking "where does each
 * project stand". Those are different questions, and the flat list answered the second one badly:
 * twenty rows could be twenty drawings on one project or one drawing on twenty, and you could not
 * tell without reading every row.
 *
 * So the unit of the list is the PROJECT. Each row carries the four facts a reader is actually
 * after — where it stands, when it last moved, how much is in it, and how to get into it — and the
 * drawings themselves are the detail behind the caret.
 *
 * ## What "latest status" means, precisely
 *
 * It is the status of the most recently UPDATED revision on the project, not a roll-up and not a
 * worst case. A project is not in one state — it has drawings in several — so any single tag is a
 * summary that can mislead. This one is at least defined: it is the last thing that happened. The
 * breakdown beside it (`4 approved · 2 in review`) is what stops the tag standing in for the whole
 * picture, and the caret shows the rows it was computed from.
 *
 * ## Files
 *
 * AURA stores no files. `fileUrl` on a revision is a REFERENCE to a document held somewhere else —
 * the same arrangement BIM models already use in this workspace. So a row offers a download when
 * the revision carries a reference and says nothing when it does not. There is deliberately no
 * upload control here: there is nowhere for the bytes to go, and a control that appears to accept a
 * file and silently keeps nothing is worse than no control.
 */
export interface DrawingRow {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  revision: string;
  status: string;
  fileUrl?: string | null;
  updatedAt?: string | null;
  createdAt: string;
}

export interface ProjectRef {
  id: string;
  title: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  revision_required: 'Revision Required',
  transmitted: 'Transmitted',
  closed: 'Closed',
  superseded: 'Superseded',
};

/** Statuses that mean the drawing is still moving — counted separately from the settled ones. */
const IN_FLIGHT = new Set(['draft', 'submitted', 'under_review', 'revision_required', 'rejected']);

function statusStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' };
  if (status === 'approved' || status === 'transmitted') return { ...base, background: 'var(--good-soft)', color: 'var(--good)' };
  if (status === 'rejected') return { ...base, background: 'var(--bad-soft)', color: 'var(--bad)' };
  if (status === 'revision_required') return { ...base, background: 'var(--warn-soft)', color: 'var(--warn)' };
  if (status === 'submitted' || status === 'under_review') return { ...base, background: 'var(--info-soft)', color: 'var(--info)' };
  return { ...base, background: 'var(--panel-2)', color: 'var(--muted)' };
}

/** `updatedAt` is what the workflow stamps; `createdAt` is the fallback for a revision never moved. */
const movedAt = (d: DrawingRow): string => d.updatedAt || d.createdAt;

function formatDay(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toISOString().slice(0, 10);
}

interface ProjectGroup {
  projectId: string;
  name: string;
  drawings: DrawingRow[];
  latest: DrawingRow;
  approved: number;
  inFlight: number;
  withFile: number;
}

export function groupByProject(drawings: DrawingRow[], projects: ProjectRef[]): ProjectGroup[] {
  const titleById = new Map(projects.map((p) => [p.id, p.title]));
  const groups = new Map<string, DrawingRow[]>();
  for (const d of drawings) {
    const key = d.projectId || 'unassigned';
    const bucket = groups.get(key);
    if (bucket) bucket.push(d);
    else groups.set(key, [d]);
  }

  return [...groups.entries()]
    .map(([projectId, rows]) => {
      // Newest movement first, so `latest` is the head and the rows read in the order they moved.
      const sorted = [...rows].sort((a, b) => movedAt(b).localeCompare(movedAt(a)));
      return {
        projectId,
        // The register's own `projectName` is a copy taken at registration; the project list is the
        // current truth, so it wins where both exist.
        name: titleById.get(projectId) ?? sorted[0].projectName ?? 'Unassigned',
        drawings: sorted,
        latest: sorted[0],
        approved: rows.filter((d) => d.status === 'approved' || d.status === 'transmitted').length,
        inFlight: rows.filter((d) => IN_FLIGHT.has(d.status)).length,
        withFile: rows.filter((d) => !!d.fileUrl).length,
      };
    })
    // The project that moved most recently is the one worth seeing first.
    .sort((a, b) => movedAt(b.latest).localeCompare(movedAt(a.latest)));
}

export default function DrawingsByProject({
  drawings,
  projects,
}: {
  drawings: DrawingRow[];
  projects: ProjectRef[];
}) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const groups = useMemo(() => groupByProject(drawings, projects), [drawings, projects]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    // Matched on the project AND on its drawings: someone searching a drawing code expects to find
    // the project holding it, not an empty list because the code is not the project's name.
    return groups.filter(
      (g) => g.name.toLowerCase().includes(q) || g.drawings.some((d) => `${d.code} ${d.title}`.toLowerCase().includes(q)),
    );
  }, [groups, query]);
  const page = usePaged(matches);

  return (
    <>
      <div style={st.searchRow}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search project, drawing code or title"
          style={st.search}
          data-testid="eng-drawings-search"
        />
        <span style={st.count} data-testid="eng-drawings-count">
          {matches.length === groups.length
            ? `${groups.length} project${groups.length === 1 ? '' : 's'} · ${drawings.length} drawings`
            : `${matches.length} of ${groups.length} projects`}
        </span>
      </div>

      {matches.length === 0 ? (
        <div style={st.noMatch} data-testid="eng-drawings-no-match">
          No project matches “{query.trim()}”. {groups.length} hold drawings.
        </div>
      ) : (
        <>
          <ul style={st.list} data-testid="eng-drawings-projects">
            {page.slice.map((g) => {
              const expanded = open === g.projectId;
              return (
                <li key={g.projectId} style={st.card} data-testid={`eng-project-${g.projectId}`}>
                  <div style={st.cardHead}>
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : g.projectId)}
                      style={st.disclosure}
                      aria-expanded={expanded}
                      disabled={!hydrated}
                      data-testid={`eng-project-open-${g.projectId}`}
                    >
                      <span style={st.caret} aria-hidden>{expanded ? '▾' : '▸'}</span>
                      <strong style={st.grow} title={g.name}>{g.name}</strong>
                    </button>

                    <span style={statusStyle(g.latest.status)} data-testid={`eng-project-status-${g.projectId}`}>
                      {STATUS_LABEL[g.latest.status] ?? g.latest.status}
                    </span>
                    <span style={st.meta} data-testid={`eng-project-updated-${g.projectId}`}>
                      {formatDay(movedAt(g.latest))}
                    </span>
                    <span style={st.metaStrong} data-testid={`eng-project-count-${g.projectId}`}>
                      {g.drawings.length} drawing{g.drawings.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {/* The tag above is the LAST thing that moved, which is not the same as where the
                      project stands. This line is what keeps the tag from being read as a verdict. */}
                  <div style={st.breakdown} data-testid={`eng-project-breakdown-${g.projectId}`}>
                    <span>{g.approved} approved or issued</span>
                    <span>·</span>
                    <span>{g.inFlight} still in the workflow</span>
                    <span>·</span>
                    <span>{g.withFile} of {g.drawings.length} with a file</span>
                    <span style={st.spacer} />
                    {g.projectId !== 'unassigned' && (
                      <>
                        <a href={`/project/${g.projectId}`} style={st.link} data-testid={`eng-project-link-${g.projectId}`}>
                          Open project →
                        </a>
                        <a
                          href={`/engineering/drawings?projectId=${encodeURIComponent(g.projectId)}`}
                          style={st.link}
                          data-testid={`eng-project-register-${g.projectId}`}
                        >
                          Drawing register →
                        </a>
                      </>
                    )}
                  </div>

                  {expanded && (
                    <table style={st.table} data-testid={`eng-project-drawings-${g.projectId}`}>
                      <thead>
                        <tr>
                          {['Code', 'Title', 'Rev', 'Status', 'Updated', 'File', ''].map((h) => (
                            <th key={h} style={st.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.drawings.map((d) => (
                          <tr key={d.id} data-testid={`eng-drawing-${d.id}`}>
                            <td style={st.tdCode}>{d.code}</td>
                            <td style={st.td} title={d.title}>{d.title}</td>
                            <td style={st.tdMuted}>Rev {d.revision}</td>
                            <td style={st.td}><span style={statusStyle(d.status)}>{STATUS_LABEL[d.status] ?? d.status}</span></td>
                            <td style={st.tdMuted}>{formatDay(movedAt(d))}</td>
                            <td style={st.td}>
                              {d.fileUrl ? (
                                <a
                                  href={d.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={st.link}
                                  data-testid={`eng-drawing-file-${d.id}`}
                                >
                                  ⭳ Download
                                </a>
                              ) : (
                                <span style={st.noFile} data-testid={`eng-drawing-nofile-${d.id}`}>no file</span>
                              )}
                            </td>
                            <td style={st.td}>
                              <a href={`/engineering/drawings/${d.id}`} style={st.link} data-testid={`eng-drawing-open-${d.id}`}>
                                Manage →
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              );
            })}
          </ul>
          <Pager state={page} label="projects" testId="eng-drawings-pager" />
        </>
      )}
    </>
  );
}

const st = {
  searchRow: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 } as CSSProperties,
  search: { flex: 1, minWidth: 0, maxWidth: 420, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  count: { fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  noMatch: { border: '1px dashed var(--border)', borderRadius: 12, padding: 24, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--panel-2)' } as CSSProperties,
  cardHead: { display: 'flex', gap: 10, alignItems: 'center', minWidth: 0, fontSize: 13 } as CSSProperties,
  disclosure: { display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', fontSize: 13.5, cursor: 'pointer', textAlign: 'left', padding: 0 } as CSSProperties,
  caret: { width: 12, color: 'var(--muted)' } as CSSProperties,
  grow: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  meta: { fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' } as CSSProperties,
  metaStrong: { fontSize: 12, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' } as CSSProperties,
  breakdown: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6, fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  spacer: { flex: 1, minWidth: 12 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' } as CSSProperties,
  noFile: { color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 10 } as CSSProperties,
  th: { textAlign: 'left', padding: '7px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '7px 10px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdCode: { padding: '7px 10px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  tdMuted: { padding: '7px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap' } as CSSProperties,
};
