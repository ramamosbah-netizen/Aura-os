'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { findNavMatch, groupLandingHref } from './nav';
import { RECORD_TITLE_EVENT } from './record-chrome';

interface Crumb {
  label: string;
  href: string | null;
}

/**
 * Path-derived breadcrumb trail: {nav group} → {nav item} → {record}. The group and
 * item come from NAV (longest href prefix wins), so it never drifts from the sidebar.
 * The record leaf is announced by <RecordChrome> on detail pages; until (or unless)
 * that fires, [id]-looking segments are omitted rather than shown raw.
 */
export default function Breadcrumbs() {
  const pathname = usePathname();
  const [recordTitle, setRecordTitle] = useState<string | null>(null);

  // A new page means a new (or no) record — clear, then let RecordChrome re-announce.
  useEffect(() => setRecordTitle(null), [pathname]);

  useEffect(() => {
    function onTitle(e: Event) {
      const detail = (e as CustomEvent<{ title?: string }>).detail;
      if (detail?.title) setRecordTitle(detail.title);
    }
    window.addEventListener(RECORD_TITLE_EVENT, onTitle);
    return () => window.removeEventListener(RECORD_TITLE_EVENT, onTitle);
  }, []);

  if (pathname === '/' || pathname === '/login') return null;

  const match = findNavMatch(pathname);
  if (!match) return null;

  // `path`, not `href`: an item may link with a query (`/crm/pipeline?view=board`), and on its own
  // page the pathname is the path alone.
  const onItemPage = pathname === match.path;
  const crumbs: Crumb[] = [
    { label: match.group, href: groupLandingHref(match.group) },
    { label: match.label, href: onItemPage ? null : match.href },
  ];
  if (!onItemPage && recordTitle) crumbs.push({ label: recordTitle, href: null });

  return (
    <nav style={s.trail} aria-label="Breadcrumb">
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} style={s.crumbWrap(i)}>
          {i > 0 && <span style={s.sep}>›</span>}
          {c.href ? (
            <Link href={c.href} style={s.link} title={c.label}>
              {c.label}
            </Link>
          ) : (
            <span style={i === crumbs.length - 1 ? s.current : s.plain} title={c.label}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

const s = {
  trail: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  // When the bar is tight the record gives way first (its name is already on the tab strip and the
  // page heading), then the group; the nav item — where "back" goes — gives way last, capped by its
  // own max width. Every label clips its OWN text: a crumb that may shrink but does not clip paints
  // over its neighbour, which is how "Control › Executive Decisions › Pipeline…" rendered as one
  // overlapping smear.
  crumbWrap: (i: number): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0,
    flexShrink: i === 0 ? 1 : i === 1 ? 0 : 4,
  }),
  sep: { color: 'var(--muted)', fontSize: 12, flexShrink: 0 } as CSSProperties,
  link: { color: 'var(--muted)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, maxWidth: 180 } as CSSProperties,
  plain: { color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, maxWidth: 180 } as CSSProperties,
  current: {
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
    maxWidth: 260,
  } as CSSProperties,
};
