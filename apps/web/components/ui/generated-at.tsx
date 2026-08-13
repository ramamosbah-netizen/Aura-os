'use client';

import { useEffect, useState } from 'react';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

/**
 * The "generated at <now>" stamp on printable documents.
 *
 * Rendering `new Date()` directly in a client component is the one hydration mismatch that
 * pinning cannot fix: the server reads its clock when it renders the HTML and the browser reads
 * its own a moment later, so the two strings differ no matter which locale or zone they agree on,
 * and React throws the subtree away.
 *
 * So the server renders nothing here. The first client render also renders nothing — which is
 * what makes it match — and the effect fills the stamp in immediately after mount. A print view
 * is read and printed after load, so the stamp is present by the time anyone sees it.
 */
export default function GeneratedAt() {
  const [stamp, setStamp] = useState('');

  useEffect(() => {
    // hydration-safe: client-only, never part of the server-rendered HTML.
    setStamp(new Date().toLocaleString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE }));
  }, []);

  return <>{stamp}</>;
}
