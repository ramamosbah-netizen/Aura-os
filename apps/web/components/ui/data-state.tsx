import type { CSSProperties } from 'react';
import Link from 'next/link';
import { describeDataError, type DataError } from '@/lib/api';

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
