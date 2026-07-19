// Skeleton — placeholder shapes shown while data is in flight.
//
// Why this exists: the UX audit found that every mutation followed
// `fetch → await → router.refresh()`, which blanks the page until the server
// responds. The system is fast; it *felt* slow because nothing occupied the
// space in between. These are the shapes to render in that gap.
//
// Styling lives in globals.css (.skeleton / .skeleton-text / .skeleton-row) so
// the shimmer respects prefers-reduced-motion along with everything else.

import type { CSSProperties } from 'react';

interface SkeletonProps {
  /** css width — number is px, string passes through (e.g. '60%') */
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}

/** One placeholder block. */
export function Skeleton({ width, height, radius, style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      aria-hidden
      style={{ width: width ?? '100%', height: height ?? 12, borderRadius: radius, ...style }}
    />
  );
}

/** A paragraph of placeholder lines; the last one is short, like real text. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: i === lines - 1 ? '58%' : '100%' }}
        />
      ))}
    </div>
  );
}

/** Placeholder rows matching the .data-table rhythm. */
export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}

/**
 * Wrap any async region. Announces politely so screen-reader users are told the
 * region is loading — a purely visual skeleton is silent to them.
 */
export function SkeletonBoundary({
  loading,
  children,
  fallback,
}: {
  loading: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  if (!loading) return <>{children}</>;
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {fallback ?? <SkeletonText />}
    </div>
  );
}
