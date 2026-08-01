import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

// EmptyState — the honest "there's nothing here yet" surface. Before this, empty
// results rendered as a bare table with no rows, which reads as "broken" rather
// than "empty". Use it for zero-result lists, unconfigured features, and
// not-yet-created records. Server-compatible (no client hooks); the optional
// action is either a link (href) or a button the caller wires up.
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Primary action as a link. */
  actionHref?: string;
  actionLabel?: string;
  /** Or a fully custom action node (e.g. a client button that opens a drawer). */
  action?: ReactNode;
  /** Compact variant for inline/table empties. */
  compact?: boolean;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div style={{ ...st.wrap, padding: compact ? '40px 24px' : '72px 24px' }} role="status">
      {icon ? (
        <div style={st.icon} aria-hidden>
          {icon}
        </div>
      ) : null}
      <h2 style={st.title}>{title}</h2>
      {description ? <p style={st.desc}>{description}</p> : null}
      {action ?? (actionHref && actionLabel ? (
        <Link href={actionHref} style={st.btn}>
          {actionLabel}
        </Link>
      ) : null)}
    </div>
  );
}

const st = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 6,
  } as CSSProperties,
  icon: {
    width: 46,
    height: 46,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 12,
    background: 'var(--accent-soft)',
    color: 'var(--accent)',
    marginBottom: 8,
  } as CSSProperties,
  title: { fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text)' } as CSSProperties,
  desc: {
    color: 'var(--muted)',
    fontSize: 13.5,
    maxWidth: 420,
    lineHeight: 1.6,
    margin: '4px 0 0',
  } as CSSProperties,
  btn: {
    marginTop: 16,
    display: 'inline-block',
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    border: '1px solid var(--accent)',
    borderRadius: 10,
    padding: '9px 18px',
    fontSize: 13.5,
    fontWeight: 600,
    textDecoration: 'none',
  } as CSSProperties,
};
