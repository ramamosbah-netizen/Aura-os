import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { describeDataError, type DataError } from '@/lib/data-error';

// DataStateNotice — the counterpart to EmptyState, for when we could NOT answer the question.
//
// EmptyState says "there is nothing here yet". This says "we do not know what is here, and here
// is why". Keeping them apart is the whole point of audit gap G-05: a 500, a 403 and a genuinely
// empty table used to render identically, so a tenant looking at an empty AR list could not tell
// "you have no unpaid invoices" from "we could not load your unpaid invoices". In an ERP that
// distinction is financially material.
//
// Server-compatible (no client hooks). `role="alert"` rather than `role="status"` — this is a
// problem the user should be told about, not an ambient state.
interface DataStateNoticeProps {
  error: DataError;
  /** What the user was trying to see, e.g. "accounts" — makes the message concrete. */
  subject?: string;
  /** Compact variant for inline/table failures. */
  compact?: boolean;
}

export default function DataStateNotice({ error, subject, compact = false }: DataStateNoticeProps) {
  const { title, description } = describeDataError(error);
  const denied = error.kind === 'forbidden' || error.kind === 'unauthorized';

  return (
    <div
      role="alert"
      data-testid="data-error"
      data-error-kind={error.kind}
      style={{ ...st.wrap, ...(denied ? st.denied : st.failed), padding: compact ? '20px 18px' : '40px 24px' }}
    >
      <div style={st.icon} aria-hidden>
        {denied ? '🔒' : '⚠'}
      </div>
      <h2 style={st.title}>{title}</h2>
      <p style={st.desc}>
        {subject && !denied ? `Could not load ${subject}. ` : null}
        {description}
      </p>
      {error.kind === 'unauthorized' ? (
        <Link href="/login" style={st.action} data-testid="data-error-signin">
          Sign in again
        </Link>
      ) : null}
    </div>
  );
}

// ── DataState — the composed loading → empty → error → content contract ─────────────
//
// The per-page UX scorecard measured 161/173 pages with only *partial* state handling and
// exactly 1 with all three states explicit: everyone re-invents `if (loading) … if (error) …`
// inline and usually drops one branch. This is the single wrapper so a page never has to:
//
//   <DataState loading={loading} error={error} empty={!rows.length}
//              subject="devices" emptyTitle="No devices yet"
//              emptyDescription="Devices appear here once installation begins.">
//     <AuraDataTable … />
//   </DataState>
//
// Precedence is deliberate: error wins over empty (a failed load is not "no data"), and
// loading wins over both. Server-compatible when `loading` is false; the spinner branch is
// only reached in client components that pass a live loading flag.
interface DataStateProps {
  /** True while the data is in flight. Renders a skeleton block (or `loadingFallback`). */
  loading?: boolean;
  /** A classified load failure, or null/undefined when the load succeeded. */
  error?: DataError | null;
  /** True when the load succeeded but returned nothing. Renders the empty state. */
  empty?: boolean;
  /** What the user was trying to see, e.g. "devices" — threaded into both error and empty copy. */
  subject?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Custom loading UI; defaults to a shimmer block sized for a register. */
  loadingFallback?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}

export function DataState({
  loading = false,
  error = null,
  empty = false,
  subject,
  emptyTitle,
  emptyDescription,
  emptyAction,
  loadingFallback,
  compact = false,
  children,
}: DataStateProps) {
  if (loading) {
    return (
      <div role="status" aria-busy="true" aria-live="polite" aria-label={`Loading ${subject ?? 'data'}`}>
        <span className="sr-only">Loading {subject ?? 'data'}…</span>
        {loadingFallback ?? <div className="skeleton" style={{ height: compact ? 80 : 200, borderRadius: 12 }} />}
      </div>
    );
  }
  if (error) return <DataStateNotice error={error} subject={subject} compact={compact} />;
  if (empty) {
    return (
      <div style={{ ...st.wrap, ...st.emptyLook, padding: compact ? '20px 18px' : '40px 24px' }}>
        <div style={st.icon} aria-hidden>📭</div>
        <h2 style={st.title}>{emptyTitle ?? `No ${subject ?? 'records'} yet`}</h2>
        {emptyDescription && <p style={st.desc}>{emptyDescription}</p>}
        {emptyAction && <div style={{ marginTop: 8 }}>{emptyAction}</div>}
      </div>
    );
  }
  return <>{children}</>;
}

const st: Record<string, CSSProperties> = {
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  emptyLook: { borderColor: 'var(--border)', background: 'var(--panel)' },
  // Denied is not a fault — it is the system working. Amber, not red.
  denied: { borderColor: 'rgba(245,158,11,.4)', background: 'rgba(245,158,11,.06)' },
  failed: { borderColor: 'rgba(239,68,68,.4)', background: 'rgba(239,68,68,.06)' },
  icon: { fontSize: 22, lineHeight: 1 },
  title: { fontSize: 15, margin: 0, fontWeight: 700 },
  desc: { color: 'var(--muted)', fontSize: 13.5, margin: 0, maxWidth: 520, lineHeight: 1.5 },
  action: {
    marginTop: 6,
    color: 'var(--accent, #2563eb)',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 13.5,
  },
};
