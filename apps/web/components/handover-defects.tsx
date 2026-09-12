'use client';

import type { CSSProperties } from 'react';

/**
 * Snag & Punch List (TC-GATE-9) — both defect authorities, side by side, and neither of them ours.
 *
 * THE HOLE THIS FILLS. Handover readiness read T&C's punch items, through the commissioning item
 * whose chain gates on them, and nothing else. It never read QUALITY's snags — a separate authority
 * with its own table, severity scale and three-state lifecycle. Projects' closeout has always
 * counted them. So a client could be handed a package with snags outstanding, and the closeout gate
 * would then refuse the same project: two gates, one project, opposite answers.
 *
 * THE TWO ARE NOT MERGED, HERE OR ANYWHERE. They are genuinely different records — one project-
 * scoped with low/medium/high and open/resolved/closed, the other system-scoped with
 * minor/major/critical and open/closed, carrying provenance back to the failing test run. Flattening
 * them into one list would mean inventing a severity mapping nobody agreed, and losing the provenance
 * that makes a punch item answerable. So each keeps its own shape and says who owns it.
 *
 * HANDOVER WRITES NEITHER. There is no control on this page that creates, resolves or closes
 * anything. Two writers for one business truth is already one too many; a third would be worse.
 */

export interface SnagRow {
  id: string;
  description: string;
  locationDetail: string;
  severity: string;
  status: string;
  assignedTo: string | null;
}

export interface PunchRow {
  id: string;
  commissioningId: string;
  description: string;
  severity: string;
  status: string;
  location: string | null;
  resolution: string | null;
  qualityNcrId: string | null;
}

export interface DefectsData {
  /** Null when Quality could not be read — which the readiness panel renders as UNKNOWN. */
  snags: SnagRow[] | null;
  punch: PunchRow[];
}

export function DefectsSection({
  defects, systems,
}: {
  defects: DefectsData | null;
  systems: { id: string; code: string; title: string }[];
}) {
  const codeById = new Map(systems.map((s) => [s.id, s.code]));

  return (
    <section aria-label="Snag and punch list" style={st.section}>
      <p style={st.authorityNote} data-testid="defects-authority">
        Two domains hold defects, and <strong>Handover holds neither</strong>. Quality owns{' '}
        <strong>snags</strong> — project-wide, its own severity scale, its own resolved/closed lifecycle.
        Testing &amp; Commissioning owns <strong>punch items</strong> — raised against a system, often
        against the exact test run that failed, and they block that system&rsquo;s sign-off. Nothing here
        creates, resolves or closes either: this reads both so the package can be judged on all of it.
      </p>

      {defects === null ? (
        <div style={st.unavailable} role="alert">The defect lists could not be read.</div>
      ) : (
        <>
          <div style={st.block} data-testid="defects-snags">
            <div style={st.blockHead}>
              <strong>Quality snags</strong>
              <small style={st.muted}>Quality</small>
              <span style={st.grow} />
              <small style={st.muted} data-testid="defects-snags-count">
                {defects.snags === null ? 'unavailable' : `${defects.snags.filter((s) => s.status === 'open').length} open of ${defects.snags.length}`}
              </small>
            </div>
            {defects.snags === null ? (
              <p style={st.warnLine} data-testid="defects-snags-unreadable">
                Quality could not be read, so it is not known whether any snag is outstanding — handover readiness
                reads UNKNOWN and blocks rather than assuming none.
              </p>
            ) : defects.snags.length === 0 ? (
              <p style={st.empty}>Quality holds no snag for this project.</p>
            ) : (
              <ul style={st.list}>
                {defects.snags.map((s) => (
                  <li key={s.id} style={st.row} data-testid={`snag-${s.id}`}>
                    <span style={s.status === 'open' ? st.markWarn : st.markGood} aria-hidden>{s.status === 'open' ? '—' : '✓'}</span>
                    <span style={st.grow}>
                      {s.description}
                      {s.locationDetail && <small style={st.muted}> · {s.locationDetail}</small>}
                      {s.assignedTo && <small style={st.muted}> · {s.assignedTo}</small>}
                    </span>
                    <small style={st.muted}>{s.severity}</small>
                    <small style={s.status === 'open' ? st.stateOpen : st.muted} data-testid={`snag-state-${s.id}`}>{s.status}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={st.block} data-testid="defects-punch">
            <div style={st.blockHead}>
              <strong>Commissioning punch items</strong>
              <small style={st.muted}>Testing &amp; commissioning</small>
              <span style={st.grow} />
              <small style={st.muted} data-testid="defects-punch-count">
                {defects.punch.filter((p) => p.status === 'open').length} open of {defects.punch.length}
              </small>
            </div>
            {defects.punch.length === 0 ? (
              <p style={st.empty}>No punch item has been raised on this project.</p>
            ) : (
              <ul style={st.list}>
                {defects.punch.map((p) => (
                  <li key={p.id} style={st.row} data-testid={`punch-${p.id}`}>
                    <span style={p.status === 'open' ? st.markWarn : st.markGood} aria-hidden>{p.status === 'open' ? '—' : '✓'}</span>
                    <span style={st.grow}>
                      <strong style={st.code}>{codeById.get(p.commissioningId) ?? '—'}</strong> {p.description}
                      {p.location && <small style={st.muted}> · {p.location}</small>}
                      {/* The Quality escalation seam from TC-GATE-3: a reference, never a copy. */}
                      {p.qualityNcrId && <small style={st.muted}> · escalated to NCR {p.qualityNcrId}</small>}
                    </span>
                    <small style={st.muted}>{p.severity}</small>
                    <small style={p.status === 'open' ? st.stateOpen : st.muted} data-testid={`punch-state-${p.id}`}>{p.status}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p style={st.footNote} data-testid="defects-gating-note">
            Handover readiness gates each of these <strong>once</strong>. Open punch items block through
            <strong> Systems commissioned and technically ready</strong>, which reads T&amp;C&rsquo;s own chain; open
            snags block through <strong>Quality snags cleared</strong>. One cause, one failure — counting a punch
            item in both would report one problem twice.
          </p>
        </>
      )}
    </section>
  );
}

const st = {
  section: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  authorityNote: { margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 } as CSSProperties,
  footNote: { margin: 0, color: 'var(--muted)', fontSize: 11, lineHeight: 1.6 } as CSSProperties,
  unavailable: { padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  block: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  blockHead: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 13 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  row: { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12 } as CSSProperties,
  grow: { flex: 1, minWidth: 140 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 11 } as CSSProperties,
  empty: { margin: 0, color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  warnLine: { margin: 0, color: 'var(--warn)', fontSize: 12, lineHeight: 1.6 } as CSSProperties,
  code: { fontFamily: 'var(--mono, ui-monospace, monospace)', fontWeight: 700, color: 'var(--accent)' } as CSSProperties,
  markGood: { color: 'var(--good)', fontWeight: 700 } as CSSProperties,
  markWarn: { color: 'var(--warn)', fontWeight: 700 } as CSSProperties,
  stateOpen: { color: 'var(--warn)', fontSize: 11, fontWeight: 700 } as CSSProperties,
};
