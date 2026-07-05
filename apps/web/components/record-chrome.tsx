'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { recordVisit } from '@/lib/recent-items';
import { openTab } from '@/lib/tabs';

export const RECORD_TITLE_EVENT = 'aura:record-title';

/**
 * Invisible companion for record detail pages. On mount it (a) logs the visit to the
 * recent-items store (feeds the ⌘K "Recent" group), (b) opens/refreshes the record's
 * tab in the shell tab strip, and (c) announces the record title so the breadcrumb can
 * name the [id] leaf. Server pages stay server-rendered; this is the one small client
 * island they embed.
 */
export default function RecordChrome({ type, title }: { type: string; title: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!title) return;
    recordVisit({ href: pathname, title, type });
    openTab({ href: pathname, title, type });
    window.dispatchEvent(new CustomEvent(RECORD_TITLE_EVENT, { detail: { title, type } }));
  }, [pathname, title, type]);

  return null;
}
