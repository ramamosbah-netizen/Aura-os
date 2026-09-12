'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { sectionHref } from '@/lib/workspace-sections';

/**
 * Which section of a workspace is showing — held in the URL, not in component state.
 *
 * Delivery Operations workspaces (Engineering, Site, Quality, HSE) each render a strip of sections.
 * They were `useState` only, which meant a section had no address: it could not be deep-linked,
 * could not be reopened as an AURA tab, and could not be held open alongside a second one — reaching
 * Submittals always cost you RFIs. The shortcut cards at the foot of each workspace exist because of
 * this hook: a card has to have somewhere to go.
 *
 * `select` writes the URL with `history.replaceState` rather than routing. These pages are
 * force-dynamic, so pushing the query through the router would refetch every register on each tab
 * click and turn an instant switch into a round trip. Next integrates the native history methods
 * with `useSearchParams` (docs: app/guides/single-page-applications — "Shallow routing on the
 * client"), so the URL stays the single source of truth either way: a click updates it, and the
 * effect below reads it back — including when the change came from elsewhere, such as a shortcut
 * card or a pasted link.
 *
 * Pass `sections` as a module-level constant; `fallback` is what a bare path (or an unknown
 * `?section=`) shows, and is the one section whose URL carries no query.
 */
export function useWorkspaceSection<T extends string>(
  path: string,
  sections: readonly T[],
  fallback: T,
): { active: T; select: (section: T) => void; href: (section: T) => string } {
  const searchParams = useSearchParams();
  const param = searchParams.get('section');
  const resolved: T = sections.includes(param as T) ? (param as T) : fallback;
  const [active, setActive] = useState<T>(resolved);

  useEffect(() => {
    setActive(resolved);
  }, [resolved]);

  const href = useCallback((section: T) => sectionHref(path, section, fallback), [path, fallback]);

  const select = useCallback(
    (section: T) => {
      setActive(section);
      window.history.replaceState(null, '', sectionHref(path, section, fallback));
    },
    [path, fallback],
  );

  return { active, select, href };
}
