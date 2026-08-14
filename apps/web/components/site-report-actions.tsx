'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';

/**
 * Site daily-report action bar (G-34). Renders only the commands legal from the current status and
 * POSTs them to the state-machine endpoints (never sets `status`). The backend enforces the
 * transition; on success we refresh the server-rendered 360.
 */
export default function SiteReportActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Controls stay inert until React attaches — see `useHydrated`. A click or a keystroke
  // landing on the server-rendered markup is otherwise swallowed without trace.
  const hydrated = useHydrated();
  const locked = busy || !hydrated;
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  async function run(path: string, method: 'POST' | 'PUT', body: Record<string, unknown> = {}): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/site/daily-reports/${id}/${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Command failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Command failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={st.wrap} data-testid="report-actions" data-status={status}>
      {status === 'draft' && (
        <button style={st.primary} disabled={locked} data-testid="btn-submit" onClick={() => run('submit', 'PUT')}>Submit for review</button>
      )}
      {status === 'submitted' && (
        <button style={st.primary} disabled={locked} data-testid="btn-start-review" onClick={() => run('start-review', 'POST')}>Start review</button>
      )}
      {status === 'under_review' && (
        <div style={st.group}>
          <input style={{ ...st.input, minWidth: 240 }} placeholder="Rejection reason (required to reject)" value={reason} onChange={(e) => setReason(e.target.value)} disabled={locked} />
          <button style={st.primary} disabled={locked} data-testid="btn-approve" onClick={() => run('approve', 'POST')}>Approve</button>
          <button style={st.danger} disabled={locked} data-testid="btn-reject" onClick={() => run('reject', 'POST', { reason })}>Reject</button>
        </div>
      )}
      {status === 'approved' && <span style={st.locked} data-testid="report-locked">🔒 Approved — this report is immutable. Raise the next day&apos;s report.</span>}
      {error && <span style={st.error} data-testid="report-error">{error}</span>}
    </div>
  );
}

const st = {
  wrap: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '14px 16px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, background: 'var(--surface, rgba(0,0,0,.02))' } as CSSProperties,
  group: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 13, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 180 } as CSSProperties,
  primary: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  danger: { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' } as CSSProperties,
  locked: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  error: { color: '#dc2626', fontSize: 13, fontWeight: 600, width: '100%' } as CSSProperties,
};
