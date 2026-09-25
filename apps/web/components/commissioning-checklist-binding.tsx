'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { elvSystemLabel, type ElvSystem } from '@aura/shared';
import { useHydrated } from '@/lib/use-hydrated';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

export interface BoundChecklist {
  itpId: string;
  revision: number;
  reference: string | null;
  status: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  unreadable: boolean;
}

/** One system's line of the project's checklist coverage, as the commissioning API reports it. */
export interface CoverageSystem {
  system: string;
  state: 'ready' | 'unbound' | 'no_approved_itp' | 'no_template';
  templateVersion: number | null;
  approved: { itpId: string; revision: number; reference: string; approvedBy: string | null; approvedAt: string | null } | null;
  inPreparation: { itpId: string; revision: number; status: string } | null;
  records: { id: string; code: string; status: string; itpId: string | null; itpRevision: number | null; legacyCommissioned: boolean }[];
}
export interface ChecklistCoverageView { readable: boolean; systems: CoverageSystem[] }

const label = (system: string) => elvSystemLabel(system as ElvSystem);
const shortDate = (iso: string | null) => (iso
  ? new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' })
  : '');

/** Why a system without an approved checklist is not ready, in the words of whose move it is. */
export function missingChecklistReason(entry: CoverageSystem | null): string {
  if (!entry || entry.state === 'no_template') return 'Quality has no published template for this system';
  if (entry.inPreparation) return `Quality is preparing revision ${entry.inPreparation.revision} (${entry.inPreparation.status}) — not yet approved`;
  return 'Quality has published a template but has not approved a checklist for this project';
}

/**
 * THE APPROVED CHECKLIST THIS SYSTEM EXECUTES (TC-08 / TC-09).
 *
 * Bound: which revision, whose approval, and — if Quality has since superseded it — that this record
 * stays on it. Unbound: the current approved revision for this project and system, and a person's
 * explicit act to bind it. Never inferred from a discipline or a name, and pinned once made.
 */
export default function CommissioningChecklistBinding({
  recordId, projectId, system, status, checklist, boundBy, boundAt, onChanged,
}: {
  recordId: string;
  projectId: string;
  system: string;
  status: string;
  checklist: BoundChecklist | null;
  boundBy: string | null;
  boundAt: string | null;
  onChanged?: () => void | Promise<void>;
}) {
  const hydrated = useHydrated();
  const [coverage, setCoverage] = useState<ChecklistCoverageView | null | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsCoverage = !checklist && status !== 'commissioned';

  useEffect(() => {
    if (!needsCoverage) return;
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`/api/commissioning/records/checklist-coverage?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
        const data = res.ok ? ((await res.json()) as ChecklistCoverageView) : null;
        if (live) setCoverage(data);
      } catch {
        if (live) setCoverage(null);
      }
    })();
    return () => { live = false; };
  }, [needsCoverage, projectId]);

  if (checklist) {
    return (
      <div style={st.bound} data-testid="cx-checklist-bound">
        <b>Approved checklist:</b>{' '}
        {checklist.reference ?? 'ITP'} · revision {checklist.revision}
        {checklist.approvedBy ? ` · approved by ${checklist.approvedBy}` : ''}
        {boundBy ? ` · bound by ${boundBy}${boundAt ? ` on ${shortDate(boundAt)}` : ''}` : ''}
        {checklist.status === 'superseded' && (
          <span style={st.note} data-testid="cx-checklist-superseded"> — Quality has since approved a later revision; this record stays on the one it was bound to.</span>
        )}
        {checklist.unreadable && <span style={st.note}> — Quality could not be read just now, so its name is not shown; the binding stands.</span>}
      </div>
    );
  }

  if (status === 'commissioned') {
    return (
      <div style={st.muted} data-testid="cx-checklist-legacy">
        Commissioned before approved checklists were required — kept as history and never re-judged.
      </div>
    );
  }

  if (coverage === 'loading') return <div style={st.muted} role="status">Reading Quality’s checklists…</div>;
  if (coverage === null || !coverage.readable) {
    return (
      <div style={st.warn} role="alert" data-testid="cx-checklist-unreadable">
        Quality’s checklists could not be read, so nothing can be bound — and this system cannot be commissioned until it is.
      </div>
    );
  }

  const entry = coverage.systems.find((s) => s.system === system) ?? null;
  if (!entry?.approved) {
    return (
      <div style={st.warn} data-testid="cx-checklist-missing">
        <b>Not ready:</b> {missingChecklistReason(entry)} ({label(system)}). This system can be tested, but it cannot be commissioned without an approved checklist.
      </div>
    );
  }

  const approved = entry.approved;
  async function bind(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/commissioning/records/${recordId}/checklist-binding`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itpId: approved.itpId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Could not bind the checklist (${res.status})`);
      }
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not bind the checklist');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={st.unbound} data-testid="cx-checklist-unbound">
      <span>
        <b>Not bound.</b> Quality has approved {approved.reference} · revision {approved.revision} for {label(system)}
        {approved.approvedBy ? ` (approved by ${approved.approvedBy})` : ''}. Binding brings in its points; points typed by hand never count toward PASS.
      </span>
      <button style={st.primary} disabled={!hydrated || busy} onClick={() => void bind()} data-testid="cx-checklist-bind">
        {busy ? 'Binding…' : `Bind to revision ${approved.revision}`}
      </button>
      {error && <span style={st.error} role="alert" data-testid="cx-checklist-error">{error}</span>}
    </div>
  );
}

/** The project's checklist coverage: every system in scope, and whose move it is where one is not ready. */
export function ChecklistCoverageTable({ coverage }: { coverage: ChecklistCoverageView | null }) {
  if (coverage === null || !coverage.readable) {
    return <div style={st.warn} role="alert" data-testid="cx-coverage-unreadable">Quality’s checklists could not be read, so no system is shown as ready.</div>;
  }
  if (coverage.systems.length === 0) {
    return <div style={st.muted} data-testid="cx-checklist-coverage">No system is in commissioning scope on this project yet.</div>;
  }
  const stateText = (s: CoverageSystem) => {
    const unbound = s.records.filter((r) => !r.itpId && r.status !== 'commissioned').length;
    switch (s.state) {
      case 'ready': return 'Ready — every record executes the approved revision';
      case 'unbound': return `Approved — ${unbound} record${unbound === 1 ? '' : 's'} not yet bound`;
      case 'no_approved_itp': return `Not ready — ${missingChecklistReason(s)}`;
      default: return 'Not ready — no template for this system';
    }
  };
  return (
    <div style={st.tableWrap}>
      <table style={st.table} data-testid="cx-checklist-coverage">
        <thead><tr>{['System', 'Checklist', 'Approved revision', 'Records'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
        <tbody>
          {coverage.systems.map((s) => (
            <tr key={s.system} data-testid={`cx-coverage-${s.system}`}>
              <td style={st.td}>{label(s.system)}</td>
              <td style={s.state === 'ready' ? st.tdGood : s.state === 'unbound' ? st.td : st.tdWarn} data-testid={`cx-coverage-state-${s.system}`}>{stateText(s)}</td>
              <td style={st.tdMuted}>{s.approved ? `${s.approved.reference} · rev ${s.approved.revision}` : '—'}</td>
              <td style={st.tdMuted}>
                {s.records.length === 0 ? '—' : s.records.map((r) => `${r.code}${r.itpRevision ? ` (rev ${r.itpRevision})` : r.legacyCommissioned ? ' (history)' : ' (unbound)'}`).join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const st = {
  bound: { fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--good-soft)', color: 'var(--good)' } as CSSProperties,
  unbound: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--info-soft)', color: 'var(--info)' } as CSSProperties,
  warn: { fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--warn-soft, rgba(234,179,8,0.12))', color: 'var(--warn)' } as CSSProperties,
  muted: { fontSize: 13, color: 'var(--muted)' } as CSSProperties,
  note: { color: 'var(--muted)' } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 13, fontWeight: 600, flexBasis: '100%' } as CSSProperties,
  primary: { padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 } as CSSProperties,
  td: { padding: '7px 12px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdGood: { padding: '7px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--good)' } as CSSProperties,
  tdWarn: { padding: '7px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--warn)' } as CSSProperties,
  tdMuted: { padding: '7px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
};
