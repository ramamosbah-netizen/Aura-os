import type { CSSProperties } from 'react';
import { Skeleton, SkeletonTable } from './skeleton';

// Route-level loading fallback — the shape a cockpit page occupies while its
// server data is in flight. Rendered by every `loading.tsx` boundary so a
// navigation never blanks the <main> region (the UX audit's weakest dimension:
// 0 loading states across 133 pages). A direct child of #main-content, so it
// inherits the standard page gutter/max-width automatically.
//
// `label` is announced politely for screen-reader users; the shapes are aria-hidden.
export default function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>

      {/* header: title + subtitle */}
      <div aria-hidden style={st.header}>
        <Skeleton width={220} height={26} radius={8} />
        <Skeleton width={360} height={13} radius={6} style={{ marginTop: 12 }} />
      </div>

      {/* KPI card row */}
      <div aria-hidden style={st.kpiRow}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={st.kpiCard}>
            <Skeleton width="55%" height={11} radius={5} />
            <Skeleton width="70%" height={24} radius={7} style={{ marginTop: 14 }} />
          </div>
        ))}
      </div>

      {/* table */}
      <div aria-hidden style={st.table}>
        <SkeletonTable rows={7} />
      </div>
    </div>
  );
}

const st = {
  header: { paddingBottom: 8 } as CSSProperties,
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 14,
    margin: '22px 0 26px',
  } as CSSProperties,
  kpiCard: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '16px 18px',
  } as CSSProperties,
  table: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '10px 16px',
  } as CSSProperties,
};
