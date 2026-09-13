'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Show a long list a page at a time.
 *
 * The lists this serves are already fully loaded — a commissioning workspace holds every system it
 * is scoped to — so paging here is presentational and instant: no round trip, no spinner, and the
 * filters above keep working on the WHOLE list rather than on the page you happen to be looking at.
 * Where a list is genuinely too large to hold, the answer is a paged API read, not this.
 *
 * THE PAGE INDEX RESETS WHEN THE LIST CHANGES. Without that, narrowing a filter while on page 5
 * leaves the reader on a page that no longer exists, looking at an empty list and concluding there
 * are no records — the list is not empty, they are just past the end of it.
 */
export interface PagerState {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  prev: () => void;
  next: () => void;
}

export function usePaged<T>(items: T[], size = 20): PagerState & { slice: T[] } {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));

  // Keyed on the length rather than the array: a re-render that rebuilds an equal array must not
  // throw the reader back to page one, but a filter that changes what is in it must.
  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, Math.ceil(items.length / size) - 1)));
  }, [items.length, size]);

  const slice = useMemo(() => items.slice(page * size, page * size + size), [items, page, size]);
  const from = items.length === 0 ? 0 : page * size + 1;
  const to = Math.min(items.length, page * size + size);

  return {
    page,
    pages,
    slice,
    from,
    to,
    total: items.length,
    hasPrev: page > 0,
    hasNext: page + 1 < pages,
    prev: () => setPage((p) => Math.max(0, p - 1)),
    next: () => setPage((p) => Math.min(pages - 1, p + 1)),
  };
}

/**
 * The control itself. Hidden entirely when everything fits on one page — a pager that only ever
 * says "Page 1 of 1" is furniture, and it makes a short list look truncated.
 */
export default function Pager({
  state,
  label,
  testId,
}: {
  // `PagerState`, not `ReturnType<typeof usePaged>`: the latter erases the generic, which turns
  // `slice` into `unknown[]` at every call site and takes the element type with it.
  state: PagerState;
  /** What is being counted, e.g. "systems" — so the summary reads as a sentence. */
  label: string;
  testId?: string;
}) {
  if (state.pages <= 1) return null;

  return (
    <nav style={st.bar} aria-label={`${label} pagination`} data-testid={testId}>
      <button
        type="button"
        style={st.btn}
        onClick={state.prev}
        disabled={!state.hasPrev}
        aria-label={`Previous ${label}`}
        data-testid={testId ? `${testId}-prev` : undefined}
      >
        ← Previous
      </button>
      <span style={st.info} data-testid={testId ? `${testId}-info` : undefined}>
        {state.from}–{state.to} of {state.total} {label} · page {state.page + 1} of {state.pages}
      </span>
      <button
        type="button"
        style={st.btn}
        onClick={state.next}
        disabled={!state.hasNext}
        aria-label={`Next ${label}`}
        data-testid={testId ? `${testId}-next` : undefined}
      >
        Next →
      </button>
    </nav>
  );
}

const st = {
  bar: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 } as CSSProperties,
  btn: {
    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--panel)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  } as CSSProperties,
  info: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
};
