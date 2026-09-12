'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';
import EmptyState from '@/components/ui/empty-state';

/**
 * O&M deliverables and client training (TC-GATE-5).
 *
 * These are the two Handover authorities that turned two of its readiness assertions into
 * projections. Both surfaces show the same thing the projection counts, so a reader can see exactly
 * why the package is or is not ready — the number on the readiness panel and the rows here cannot
 * disagree, because the panel is computed from these rows.
 *
 * Neither holds a document. `documentId` is a reference into DocControl, and the submit control asks
 * for one because "submitted" with nothing to point at is a claim rather than evidence.
 *
 * TC-GATE-6 made that reference REAL. Every row arrives with what the project register says about it,
 * resolved at read time and never stored — so the document number, title and revision shown here are
 * the register's current answer, and a reference pointing at nothing says so on the row instead of
 * looking like any other citation.
 */

/** What the register said about this row's reference. Null when there was nothing to ask about. */
export interface ResolvedDocumentRow {
  reference: string;
  document: { id: string; documentNumber: string; title: string; revision: string; status: string } | null;
  missing: boolean;
  superseded: boolean;
}

export interface OmItemRow {
  id: string;
  commissioningId: string;
  deliverable: string;
  required: boolean;
  state: 'required' | 'submitted' | 'reviewed' | 'accepted';
  documentId: string | null;
  notes: string | null;
  resolved?: ResolvedDocumentRow | null;
}

export interface TrainingRow {
  id: string;
  commissioningId: string | null;
  title: string;
  topics: string | null;
  trainer: string | null;
  sessionDate: string | null;
  attendees: string | null;
  demonstrationCompleted: boolean;
  state: 'planned' | 'completed' | 'acknowledged';
  acknowledgedBy: string | null;
}

export interface SystemRow { id: string; code: string; title: string }

const DELIVERABLE_LABELS: Record<string, string> = {
  om_manual: 'O&M manual',
  manufacturer_manuals: 'Manufacturer manuals',
  datasheets: 'Datasheets',
  maintenance_schedule: 'Preventive maintenance schedule',
  spare_parts_list: 'Recommended spare parts',
  software_configuration: 'Software and configuration',
  licences: 'Licences',
  warranty_certificate: 'Warranty certificate',
  contact_list: 'Support contacts',
};

const NEXT_STATE: Record<OmItemRow['state'], OmItemRow['state'] | null> = {
  required: 'submitted',
  submitted: 'reviewed',
  reviewed: 'accepted',
  accepted: null,
};

/**
 * One reference, as the register answered it (TC-GATE-6).
 *
 * The three failure shapes are shown apart because they need different fixes: a typo is retyped, a
 * superseded revision needs the current one, and "unverified" means document control could not be
 * reached at all — not that anything is wrong with the reference.
 */
function DocumentCell({ entry }: { entry: OmItemRow }) {
  if (!entry.documentId) return <span style={st.muted}>&mdash;</span>;
  const resolved = entry.resolved;
  if (!resolved) {
    return <span style={st.docWarn} title="Document control could not be read, so this reference is unverified.">{entry.documentId} · unverified</span>;
  }
  if (resolved.missing) {
    return <span style={st.docBad} title="No document with this number or id is in the project register.">{entry.documentId} · not in the register</span>;
  }
  const doc = resolved.document!;
  if (resolved.superseded) {
    return <span style={st.docWarn} title="The register has moved on from this revision.">{doc.documentNumber} rev {doc.revision} · superseded</span>;
  }
  return (
    <span>
      <strong>{doc.documentNumber}</strong> rev {doc.revision}
      <br />
      <small style={st.muted}>{doc.title}</small>
    </span>
  );
}

// ── O&M deliverables ────────────────────────────────────────────────────────────────────────────

export function OmPackSection({ systems, items }: { systems: SystemRow[]; items: OmItemRow[] | null }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docRef, setDocRef] = useState<Record<string, string>>({});

  const bySystem = useMemo(() => {
    const map = new Map<string, OmItemRow[]>();
    for (const item of items ?? []) {
      const list = map.get(item.commissioningId) ?? [];
      list.push(item);
      map.set(item.commissioningId, list);
    }
    return map;
  }, [items]);

  async function post(url: string, body: unknown, key: string, method = 'POST'): Promise<void> {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="O&M deliverables" style={st.section}>
      {error && <p style={st.error} role="alert" data-testid="om-error">{error}</p>}

      <p style={st.authorityNote} data-testid="om-authority">
        The O&amp;M pack is <strong>Handover&rsquo;s own authority</strong> — nobody else holds &ldquo;is this system&rsquo;s pack
        complete&rdquo;. DocControl owns the controlled documents and each deliverable <strong>references</strong> one;
        nothing is copied here. Every reference is <strong>checked against the project register</strong>, so a deliverable
        accepted against a document that does not exist blocks rather than passes. Handover readiness counts these rows,
        so the panel above and this list cannot disagree.
      </p>

      {items === null ? (
        <div style={st.unavailable} role="alert">The O&amp;M pack could not be read.</div>
      ) : systems.length === 0 ? (
        <EmptyState compact title="No systems in scope" description="An O&M pack belongs to a system; register one in Testing & Commissioning first." />
      ) : (
        <ul style={st.list} data-testid="om-systems">
          {systems.map((system) => {
            const pack = bySystem.get(system.id) ?? [];
            const required = pack.filter((i) => i.required);
            const accepted = required.filter((i) => i.state === 'accepted');
            return (
              <li key={system.id} style={st.card} data-testid={`om-system-${system.code}`}>
                <div style={st.cardHead}>
                  <span style={st.code}>{system.code}</span>
                  <strong style={st.grow}>{system.title}</strong>
                  <span style={pack.length === 0 ? st.tagWarn : accepted.length === required.length ? st.tagGood : st.tagMuted} data-testid={`om-state-${system.code}`}>
                    {pack.length === 0 ? 'no pack' : `${accepted.length}/${required.length} accepted`}
                  </span>
                </div>

                {pack.length === 0 ? (
                  <div style={st.row}>
                    <span style={st.muted}>No deliverables listed, so the pack cannot be judged complete.</span>
                    <button
                      style={st.primary}
                      disabled={busy !== null || !hydrated}
                      onClick={() => post('/api/commissioning/handovers/om-items?seed=1', { commissioningId: system.id }, `seed-${system.id}`)}
                      data-testid={`om-seed-${system.code}`}
                    >
                      {busy === `seed-${system.id}` ? 'Adding…' : 'Add the standard pack'}
                    </button>
                  </div>
                ) : (
                  <table style={st.table}>
                    <thead><tr>{['Deliverable', 'State', 'Document', 'Next', ''].map((h) => <th key={h} scope="col" style={st.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {pack.map((entry) => {
                        const next = NEXT_STATE[entry.state];
                        return (
                          <tr key={entry.id} data-testid={`om-item-${system.code}-${entry.deliverable}`}>
                            <th scope="row" style={st.tdLabel}>
                              {DELIVERABLE_LABELS[entry.deliverable] ?? entry.deliverable}
                              {!entry.required && <small style={st.notRequired}> not required</small>}
                            </th>
                            <td style={{ ...st.td, ...stateStyle(entry.state) }} data-testid={`om-item-state-${system.code}-${entry.deliverable}`}>{entry.state}</td>
                            <td style={st.tdMuted} data-testid={`om-doc-state-${system.code}-${entry.deliverable}`}>
                              <DocumentCell entry={entry} />
                            </td>
                            <td style={st.td}>
                              {entry.state === 'required' && entry.required && (
                                <input
                                  style={st.input}
                                  placeholder="DocControl reference"
                                  value={docRef[entry.id] ?? ''}
                                  onChange={(e) => setDocRef({ ...docRef, [entry.id]: e.target.value })}
                                  disabled={busy !== null}
                                  data-testid={`om-doc-${system.code}-${entry.deliverable}`}
                                />
                              )}
                            </td>
                            <td style={st.tdMuted}>
                              {next && entry.required ? (
                                <button
                                  style={st.smallBtn}
                                  disabled={busy !== null || !hydrated}
                                  onClick={() => post(
                                    `/api/commissioning/handovers/om-items/${entry.id}/state`,
                                    { to: next, documentId: docRef[entry.id] || undefined },
                                    entry.id,
                                    'PUT',
                                  )}
                                  data-testid={`om-advance-${system.code}-${entry.deliverable}`}
                                >
                                  {busy === entry.id ? '…' : `Mark ${next}`}
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Client training and demonstration ───────────────────────────────────────────────────────────

export function TrainingSection({
  projectId, systems, sessions,
}: { projectId: string; systems: SystemRow[]; sessions: TrainingRow[] | null }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [system, setSystem] = useState('');
  const [trainer, setTrainer] = useState('');
  const [attendees, setAttendees] = useState<Record<string, string>>({});
  const [ack, setAck] = useState<Record<string, string>>({});

  async function send(url: string, body: unknown, key: string, method = 'POST'): Promise<void> {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(data.message || data.error || `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  const codeOf = (id: string | null) => (id ? systems.find((s) => s.id === id)?.code ?? 'system' : 'whole project');

  return (
    <section aria-label="Client training and demonstration" style={st.section}>
      {error && <p style={st.error} role="alert" data-testid="training-error">{error}</p>}

      <p style={st.authorityNote} data-testid="training-authority">
        This is the <strong>client&rsquo;s</strong> training, and it is Handover&rsquo;s authority. HSE&rsquo;s training records are
        <strong> worker safety</strong> — our people, inductions, competence to work on site — and neither may stand in
        for the other. A session counts towards readiness only once the client has <strong>acknowledged</strong> it: our
        own &ldquo;completed&rdquo; is our word, and the acknowledgement is theirs.
      </p>

      {!projectId ? (
        <EmptyState compact title="Choose a project" description="Training sessions belong to a project, and to a system within it." />
      ) : (
        <>
          <div style={st.row}>
            <label style={st.field}><span>Session</span>
              <input style={st.input} placeholder="CCTV operator training" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy !== null} data-testid="training-title" />
            </label>
            <label style={st.field}><span>System</span>
              <select style={st.select} value={system} onChange={(e) => setSystem(e.target.value)} disabled={busy !== null} data-testid="training-system">
                <option value="">Whole project</option>
                {systems.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.title}</option>)}
              </select>
            </label>
            <label style={st.field}><span>Trainer</span>
              <input style={st.input} placeholder="Who delivered it" value={trainer} onChange={(e) => setTrainer(e.target.value)} disabled={busy !== null} />
            </label>
            <button
              style={st.primary}
              disabled={busy !== null || !hydrated || !title.trim()}
              onClick={() => send('/api/commissioning/handovers/training', { projectId, commissioningId: system || undefined, title, trainer: trainer || undefined }, 'plan')
                .then(() => { setTitle(''); setTrainer(''); })}
              data-testid="training-plan"
            >
              {busy === 'plan' ? 'Planning…' : 'Plan session'}
            </button>
          </div>

          {sessions === null ? (
            <div style={st.unavailable} role="alert">Training sessions could not be read.</div>
          ) : sessions.length === 0 ? (
            <EmptyState compact title="No training recorded" description="Readiness reports this as UNKNOWN rather than passing: nothing has been recorded to judge." />
          ) : (
            <ul style={st.list} data-testid="training-sessions">
              {sessions.map((s) => (
                <li key={s.id} style={st.card} data-testid={`training-${s.id}`}>
                  <div style={st.cardHead}>
                    <span style={st.code}>{codeOf(s.commissioningId)}</span>
                    <strong style={st.grow}>{s.title}</strong>
                    <span style={s.state === 'acknowledged' ? st.tagGood : s.state === 'completed' ? st.tagMuted : st.tagWarn} data-testid={`training-state-${s.id}`}>
                      {s.state}
                    </span>
                  </div>
                  <div style={st.metaRow}>
                    {s.trainer && <span style={st.muted}>trainer {s.trainer}</span>}
                    {s.sessionDate && <span style={st.muted}>· {s.sessionDate}</span>}
                    {s.attendees && <span style={st.muted}>· attended by {s.attendees}</span>}
                    {s.acknowledgedBy && <span style={st.muted}>· acknowledged by {s.acknowledgedBy}</span>}
                  </div>

                  {s.state === 'planned' && (
                    <div style={st.row}>
                      <label style={st.field}><span>Client attendees</span>
                        <input style={st.input} placeholder="Who from the client attended" value={attendees[s.id] ?? ''} onChange={(e) => setAttendees({ ...attendees, [s.id]: e.target.value })} disabled={busy !== null} data-testid={`training-attendees-${s.id}`} />
                      </label>
                      <button
                        style={st.smallBtn}
                        disabled={busy !== null || !hydrated || !(attendees[s.id] ?? '').trim()}
                        onClick={() => send(`/api/commissioning/handovers/training/${s.id}/complete`, { attendees: attendees[s.id], demonstrationCompleted: true }, s.id, 'PUT')}
                        data-testid={`training-complete-${s.id}`}
                      >
                        {busy === s.id ? '…' : 'Record as delivered'}
                      </button>
                    </div>
                  )}

                  {s.state === 'completed' && (
                    <div style={st.row}>
                      <label style={st.field}><span>Client representative</span>
                        <input style={st.input} placeholder="Who acknowledged it" value={ack[s.id] ?? ''} onChange={(e) => setAck({ ...ack, [s.id]: e.target.value })} disabled={busy !== null} data-testid={`training-ack-name-${s.id}`} />
                      </label>
                      <button
                        style={st.primary}
                        disabled={busy !== null || !hydrated || !(ack[s.id] ?? '').trim()}
                        onClick={() => send(`/api/commissioning/handovers/training/${s.id}/acknowledge`, { acknowledgedBy: ack[s.id] }, s.id, 'PUT')}
                        data-testid={`training-acknowledge-${s.id}`}
                      >
                        {busy === s.id ? '…' : 'Record client acknowledgement'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

const stateStyle = (state: string): CSSProperties => ({
  fontWeight: 700,
  color: state === 'accepted' ? 'var(--good)' : state === 'required' ? 'var(--muted)' : 'var(--info)',
});

const st = {
  section: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  authorityNote: { margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 } as CSSProperties,
  unavailable: { padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  card: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  cardHead: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 } as CSSProperties,
  metaRow: { display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 } as CSSProperties,
  code: { fontFamily: 'var(--mono, ui-monospace, monospace)', fontWeight: 700, color: 'var(--accent)' } as CSSProperties,
  grow: { flex: 1, minWidth: 140 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  row: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--muted)', minWidth: 200 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } as CSSProperties,
  th: { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' } as CSSProperties,
  td: { padding: '6px 10px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdLabel: { padding: '6px 10px', borderBottom: '1px solid var(--border, #f1f5f9)', textAlign: 'left', fontWeight: 600 } as CSSProperties,
  tdMuted: { padding: '6px 10px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  notRequired: { color: 'var(--muted)', fontWeight: 400 } as CSSProperties,
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 12, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 160 } as CSSProperties,
  select: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 12, background: 'var(--bg, #fff)', color: 'inherit' } as CSSProperties,
  primary: { padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as CSSProperties,
  smallBtn: { padding: '5px 11px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'inherit', fontSize: 11, cursor: 'pointer' } as CSSProperties,
  tagGood: { padding: '3px 9px', borderRadius: 999, background: 'var(--good-soft, rgba(34,197,94,.15))', color: 'var(--good)', fontSize: 11, fontWeight: 700 } as CSSProperties,
  tagWarn: { padding: '3px 9px', borderRadius: 999, background: 'var(--warn-soft, rgba(234,179,8,.15))', color: 'var(--warn)', fontSize: 11, fontWeight: 700 } as CSSProperties,
  tagMuted: { padding: '3px 9px', borderRadius: 999, background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 11, fontWeight: 700 } as CSSProperties,
  docWarn: { color: 'var(--warn)', fontWeight: 600 } as CSSProperties,
  docBad: { color: 'var(--bad)', fontWeight: 600 } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 13, fontWeight: 600, margin: 0 } as CSSProperties,
};
