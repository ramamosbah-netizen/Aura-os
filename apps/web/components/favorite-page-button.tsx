'use client';

import { type CSSProperties, useEffect, useState } from 'react';

/**
 * Favourite the current page — a real TOGGLE, backed by the existing SavedView.
 *
 * A favourite is not a new concept: it is a SavedView for this route with no querystring. The server
 * enforces one per owner per exact route+query (unique index, migration 0258), so this button cannot
 * create duplicates even if it is clicked twice before the first response lands.
 *
 * State is READ FROM THE SERVER on mount rather than assumed, so the label is correct after a
 * refresh or a login on another device — the button never claims a page is saved because this tab
 * happens to remember clicking it.
 */
export default function FavoritePageButton({ label }: { label?: string }) {
  const [state, setState] = useState<'loading' | 'on' | 'off'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/views?path=${encodeURIComponent(window.location.pathname)}`, { cache: 'no-store' });
        const views: Array<{ path: string; query: string; userId: string | null }> = res.ok ? await res.json() : [];
        // Only an OWNED, unfiltered view of this exact page counts as "favourited". A shared view
        // (userId null) is someone else's tenant-wide bookmark, not this user's favourite.
        const mine = views.some((v) => v.userId !== null && v.path === window.location.pathname && v.query === '');
        if (alive) setState(mine ? 'on' : 'off');
      } catch {
        if (alive) setState('off');
      }
    })();
    return () => { alive = false; };
  }, []);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch('/api/views/favorite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // No querystring: a favourite is the PAGE, not the filtered list showing on it right now.
        body: JSON.stringify({ label: label ?? document.title ?? window.location.pathname, path: window.location.pathname, query: '' }),
      });
      if (res.ok) {
        const body: { favorited?: boolean } = await res.json().catch(() => ({}));
        setState(body.favorited ? 'on' : 'off');
      }
    } finally { setBusy(false); }
  }

  const on = state === 'on';
  return (
    <button
      type="button"
      style={s}
      onClick={toggle}
      disabled={busy || state === 'loading'}
      aria-pressed={on}
      data-testid="favorite-page"
      title={on ? 'Remove this page from your favourites' : 'Add this page to your favourites'}
    >
      {state === 'loading' ? '…' : on ? '★ Remove from Favorites' : '☆ Add to Favorites'}
    </button>
  );
}

const s: CSSProperties = {
  background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', padding: '6px 12px', fontSize: 12.5, cursor: 'pointer',
};
