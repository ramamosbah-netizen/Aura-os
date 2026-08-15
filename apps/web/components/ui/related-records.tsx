import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

// related-records + activity-timeline — the connectivity layer.
//
// The per-page UX scorecard's worst axis was Navigation/Connectivity: 93 of 173 pages carry
// fewer than two links to related records. That is the gap between "AURA has modules" and
// "AURA is a project operating system" — a user should never copy an NCR number and go hunting
// for the drawing it came from. These two primitives are how every 360 shows its web of links
// and its history, so a Drawing 360 can render:
//
//   Drawing DRG-001
//     ├─ RFI-023        (open)
//     ├─ TQ-008         (answered)
//     ├─ IR-041         (passed)
//     └─ NCR-017        (corrective action)
//
// Each item deep-links to the real record. Pure render + <Link>; no client hooks, so it drops
// straight into a server-rendered 360. The data (which records relate) is owned by the caller's
// summary endpoint — these primitives invent nothing.

export type LinkTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'info';

const toneColor = (t?: LinkTone): string =>
  t === 'good' ? 'var(--good)'
    : t === 'bad' ? 'var(--bad)'
    : t === 'warn' ? 'var(--warn)'
    : t === 'info' ? 'var(--info)'
    : t === 'accent' ? 'var(--accent)'
    : 'var(--muted)';

export interface RelatedItem {
  /** The record's human code, e.g. "NCR-017". */
  code: string;
  /** Where clicking goes — the real record's route. Omit for records with no page yet. */
  href?: string;
  /** Short status word, shown as a soft pill. */
  status?: string;
  statusTone?: LinkTone;
  /** One extra fact, e.g. an owner or a date. */
  meta?: ReactNode;
}

export interface RelatedGroup {
  /** The relationship / entity type, e.g. "RFIs", "NCRs", "Devices". */
  label: string;
  icon?: string;
  items: RelatedItem[];
  /** Optional link to the full filtered register for this relationship. */
  seeAllHref?: string;
}

/**
 * The related-records card. Renders one section per relationship group, each a list of
 * deep-linked record chips. Empty groups are hidden; a fully empty set renders a quiet note.
 */
export function RelatedRecords({
  title = 'Related records',
  groups,
}: {
  title?: string;
  groups: RelatedGroup[];
}) {
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  return (
    <section style={st.card}>
      <div style={st.head}>{title}</div>
      {nonEmpty.length === 0 ? (
        <p style={st.none}>No linked records yet.</p>
      ) : (
        <div style={st.groups}>
          {nonEmpty.map((g) => (
            <div key={g.label} style={st.group}>
              <div style={st.groupHead}>
                <span style={st.groupLabel}>
                  {g.icon && <span aria-hidden>{g.icon} </span>}
                  {g.label}
                  <span style={st.count}>{g.items.length}</span>
                </span>
                {g.seeAllHref && (
                  <Link href={g.seeAllHref} style={st.seeAll}>See all →</Link>
                )}
              </div>
              <ul style={st.list}>
                {g.items.map((it) => (
                  <li key={it.code} style={st.li}>
                    {it.href ? (
                      <Link href={it.href} style={st.code}>{it.code}</Link>
                    ) : (
                      <span style={{ ...st.code, color: 'var(--muted)', cursor: 'default' }}>{it.code}</span>
                    )}
                    {it.status && (
                      <span style={{ ...st.statusPill, color: toneColor(it.statusTone), borderColor: toneColor(it.statusTone) }}>
                        {it.status}
                      </span>
                    )}
                    {it.meta != null && <span style={st.meta}>{it.meta}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Activity / history timeline ─────────────────────────────────────────────────────
export interface ActivityEvent {
  /** ISO timestamp; rendered via the caller-supplied formatter or raw. */
  at: string;
  /** Pre-formatted date string (caller controls locale/TZ — see lib/locale). */
  when?: string;
  actor?: string;
  title: ReactNode;
  detail?: ReactNode;
  tone?: LinkTone;
  /** Optional deep-link to the record this event concerns. */
  href?: string;
}

/**
 * A vertical event timeline for a record's Activity / History tab. Newest first is the caller's
 * choice — this renders in the order given. Server-compatible.
 */
export function ActivityTimeline({
  events,
  emptyLabel = 'No activity recorded yet.',
}: {
  events: ActivityEvent[];
  emptyLabel?: string;
}) {
  if (events.length === 0) return <p style={st.none}>{emptyLabel}</p>;
  return (
    <ol style={st.timeline}>
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} style={st.event}>
          <span style={{ ...st.dot, background: toneColor(e.tone ?? 'accent') }} aria-hidden />
          <div style={{ minWidth: 0 }}>
            <div style={st.eventTop}>
              <span style={st.eventTitle}>
                {e.href ? <Link href={e.href} style={st.eventLink}>{e.title}</Link> : e.title}
              </span>
              <span style={st.when}>{e.when ?? e.at}</span>
            </div>
            {(e.actor || e.detail) && (
              <div style={st.eventDetail}>
                {e.actor && <span style={st.actor}>{e.actor}</span>}
                {e.actor && e.detail && ' · '}
                {e.detail}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

const st: Record<string, CSSProperties> = {
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--panel)' },
  head: { fontSize: 13, fontWeight: 700, marginBottom: 12 },
  none: { color: 'var(--muted)', fontSize: 12.5, margin: 0 },
  groups: { display: 'flex', flexDirection: 'column', gap: 14 },
  group: {},
  groupHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  groupLabel: { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'inline-flex', alignItems: 'center', gap: 6 },
  count: { fontSize: 11, background: 'var(--panel-2)', borderRadius: 999, padding: '0 7px', color: 'var(--muted)', fontWeight: 700 },
  seeAll: { fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  li: { display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13, flexWrap: 'wrap' },
  code: { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' },
  statusPill: { borderWidth: 1, borderStyle: 'solid', borderRadius: 999, padding: '1px 9px', fontSize: 11, fontWeight: 600 },
  meta: { fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' },
  // timeline
  timeline: { listStyle: 'none', margin: 0, padding: 0, position: 'relative' },
  event: { display: 'flex', gap: 12, padding: '8px 0', position: 'relative' },
  dot: { width: 9, height: 9, borderRadius: 999, marginTop: 5, flexShrink: 0, boxShadow: '0 0 0 3px var(--panel)' },
  eventTop: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' },
  eventTitle: { fontSize: 13, fontWeight: 600 },
  eventLink: { color: 'var(--accent)', textDecoration: 'none' },
  when: { fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' },
  eventDetail: { fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  actor: { fontWeight: 600, color: 'var(--text)' },
};
