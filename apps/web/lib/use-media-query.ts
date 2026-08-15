'use client';

import { useEffect, useState } from 'react';

// use-media-query — SSR-safe responsive detection, the reusable answer to the audit's
// "Mobile 🔴" finding. The per-page UX scorecard measured 0 components using matchMedia:
// pages are desktop-only because there was no shared primitive to branch layout on. This is
// that primitive. It returns `false` on the server and on first client render (so SSR and
// hydration agree — see the locale/TZ hydration lessons), then updates after mount.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    // addEventListener is the modern API; Safari <14 used addListener — guard for both.
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

/** The platform breakpoint: below 768px we switch tables to cards and collapse chrome. */
export const MOBILE_QUERY = '(max-width: 767px)';

/** True on phones/small tablets in portrait. Use to branch to card layouts, not to hide data. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
