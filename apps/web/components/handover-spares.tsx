'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';
import EmptyState from '@/components/ui/empty-state';

/**
 * Spares handed to the client (TC-GATE-16) — the last of the six readiness items to get an authority.
 *
 * WHY THIS IS HANDOVER'S AND NOT INVENTORY'S. Inventory records a part being ISSUED TO A PROJECT,
 * which is how it gets installed. Handing spare parts to the building owner at handover is a
 * different event with a different counterparty, and nothing held it. The O&M pack's
 * recommended-spares list is a DOCUMENT — a list is not a delivery, and reading it as one would
 * quietly redefine the readiness item from "handed over" to "written down".
 *
 * TWO STEPS, AND THE SECOND IS THE CLIENT'S. Handing over is our record; acknowledging is theirs,
 * and only the acknowledgement satisfies readiness — the same rule client training follows.
 */

export interface SpareRow {
  id: string;
  commissioningId: string;
  description: string;
  stockItemId: string | null;
  unit: string | null;
  quantityRequired: number;
  quantityHandedOver: number;
  required: boolean;
  handedOverAt: string | null;
  acknowledgedBy: string | null;
  notes: string | null;
}

export interface SystemRow { id: string; code: string; title: string }

export function SparesSection({ systems, spares }: { systems: SystemRow[]; spares: SpareRow[] | null }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { description: string; quantity: string }>>({});
  const [ack, setAck] = useState<Record<string, string>>({});

  const bySystem = useMemo(() => {
    const map = new Map<string, SpareRow[]>();
    for (const row of spares ?? []) {
      const list = map.get(row.commissioningId) ?? [];
      list.push(row);
      map.set(row.commissioningId, list);
    }
    return map;
  }, [spares]);

  async function call(url: string, init: RequestInit, key: string): Promise<void> {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, init);
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
    <section aria-label="Spares and consumables" style={st.section}>
      <h4 style={st.heading}>Spares &amp; consumables</h4>
      {error && <p style={st.error} role="alert" data-testid="spares-error">{error}</p>}

      <p style={st.authorityNote} data-testid="spares-authority">
        Spares are <strong>Handover&rsquo;s own authority</strong>, and the last readiness item to get one. Inventory
        records a part being <strong>issued to a project</strong> — that is how it gets installed. Handing spares to the
        building owner is a different event with a different counterparty. The O&amp;M pack&rsquo;s recommended-spares
        list is a <strong>document</strong>; a list is not a delivery. Handing over is our record — only the
        client&rsquo;s <strong>acknowledgement</strong> satisfies readiness.
      </p>

      {spares === null ? (
        <div style={st.unavailable} role="alert">The spares record could not be read.</div>
      ) : systems.length === 0 ? (
        <EmptyState compact title="No systems in scope" description="Spares belong to a system; register one in Testing & Commissioning first." />
      ) : (
        <ul style={st.list} data-testid="spares-systems">
          {systems.map((system) => {
            const rows = bySystem.get(system.id) ?? [];
            const required = rows.filter((r) => r.required);
            const acknowledged = required.filter((r) => r.acknowledgedBy);
            const d = draft[system.id] ?? { description: '', quantity: '1' };
            return (
              <li key={system.id} style={st.card} data-testid={`spares-system-${system.code}`}>
                <div style={st.cardHead}>
                  <span style={st.code}>{system.code}</span>
                  <strong style={st.grow}>{system.title}</strong>
                  <span
                    style={rows.length === 0 ? st.tagWarn : acknowledged.length === required.length ? st.tagGood : st.tagMuted}
                    data-testid={`spares-state-${system.code}`}
                  >
                    {rows.length === 0 ? 'none listed' : `${acknowledged.length}/${required.length} acknowledged`}
                  </span>
                </div>

                {rows.length > 0 && (
                  <table style={st.table}>
                    <thead><tr>{['Part', 'Required', 'Handed over', 'Client', ''].map((h) => <th key={h} scope="col" style={st.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} data-testid={`spare-${row.id}`}>
                          <th scope="row" style={st.tdLabel}>
                            {row.description}
                            {!row.required && <small style={st.muted}> not required</small>}
                          </th>
                          <td style={st.tdMuted}>{row.quantityRequired}{row.unit ? ` ${row.unit}` : ''}</td>
                          <td style={st.tdMuted} data-testid={`spare-handed-${row.id}`}>
                            {row.handedOverAt ? row.quantityHandedOver : '—'}
                          </td>
                          <td style={row.acknowledgedBy ? st.tdGood : st.tdMuted} data-testid={`spare-ack-${row.id}`}>
                            {row.acknowledgedBy ?? 'not acknowledged'}
                          </td>
                          <td style={st.td}>
                            {row.required && !row.handedOverAt && (
                              <button
                                style={st.smallBtn}
                                disabled={busy !== null || !hydrated}
                                onClick={() => call(
                                  `/api/commissioning/handovers/spares/${row.id}/hand-over`,
                                  { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quantity: row.quantityRequired }) },
                                  row.id,
                                )}
                                data-testid={`spare-hand-over-${row.id}`}
                              >
                                {busy === row.id ? '…' : 'Hand over'}
                              </button>
                            )}
                            {row.required && row.handedOverAt && !row.acknowledgedBy && (
                              <span style={st.row}>
                                <input
                                  style={st.input}
                                  placeholder="Client representative"
                                  value={ack[row.id] ?? ''}
                                  onChange={(e) => setAck({ ...ack, [row.id]: e.target.value })}
                                  disabled={busy !== null || !hydrated}
                                  data-testid={`spare-ack-name-${row.id}`}
                                />
                                <button
                                  style={st.smallBtn}
                                  disabled={busy !== null || !hydrated || !(ack[row.id] ?? '').trim()}
                                  onClick={() => call(
                                    `/api/commissioning/handovers/spares/${row.id}/acknowledge`,
                                    { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acknowledgedBy: (ack[row.id] ?? '').trim() }) },
                                    row.id,
                                  )}
                                  data-testid={`spare-acknowledge-${row.id}`}
                                >
                                  {busy === row.id ? '…' : 'Client acknowledges'}
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div style={st.row}>
                  <input
                    style={st.input}
                    placeholder="Spare part"
                    value={d.description}
                    onChange={(e) => setDraft({ ...draft, [system.id]: { ...d, description: e.target.value } })}
                    // Disabled until hydrated — see the reference inputs in Testing & Commissioning:
                    // a field that takes typing before React attaches forgets it on hydration.
                    disabled={busy !== null || !hydrated}
                    data-testid={`spare-description-${system.code}`}
                  />
                  <input
                    style={st.qty}
                    type="number"
                    min={1}
                    value={d.quantity}
                    onChange={(e) => setDraft({ ...draft, [system.id]: { ...d, quantity: e.target.value } })}
                    disabled={busy !== null || !hydrated}
                    data-testid={`spare-quantity-${system.code}`}
                    aria-label="Required quantity"
                  />
                  <button
                    style={st.smallBtn}
                    disabled={busy !== null || !hydrated || !d.description.trim()}
                    onClick={() => call(
                      '/api/commissioning/handovers/spares',
                      {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                          commissioningId: system.id,
                          description: d.description.trim(),
                          quantityRequired: Number(d.quantity) || 1,
                        }),
                      },
                      `add-${system.id}`,
                    )}
                    data-testid={`spare-add-${system.code}`}
                  >
                    {busy === `add-${system.id}` ? 'Adding…' : 'List spare'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const st = {
  section: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 } as CSSProperties,
  heading: { margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' } as CSSProperties,
  authorityNote: { margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 } as CSSProperties,
  unavailable: { padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  card: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  cardHead: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 } as CSSProperties,
  code: { fontFamily: 'var(--mono, ui-monospace, monospace)', fontWeight: 700, color: 'var(--accent)' } as CSSProperties,
  grow: { flex: 1, minWidth: 140 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 11 } as CSSProperties,
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } as CSSProperties,
  th: { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' } as CSSProperties,
  td: { padding: '6px 10px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdLabel: { padding: '6px 10px', borderBottom: '1px solid var(--border, #f1f5f9)', textAlign: 'left', fontWeight: 600 } as CSSProperties,
  tdMuted: { padding: '6px 10px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  tdGood: { padding: '6px 10px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--good)', fontWeight: 600 } as CSSProperties,
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 12, background: 'var(--bg, #fff)', color: 'inherit', minWidth: 180 } as CSSProperties,
  qty: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', fontSize: 12, background: 'var(--bg, #fff)', color: 'inherit', width: 80 } as CSSProperties,
  smallBtn: { padding: '5px 11px', borderRadius: 8, border: '1px solid var(--border, #d1d5db)', background: 'transparent', color: 'inherit', fontSize: 11, cursor: 'pointer' } as CSSProperties,
  tagGood: { padding: '3px 9px', borderRadius: 999, background: 'var(--good-soft, rgba(34,197,94,.15))', color: 'var(--good)', fontSize: 11, fontWeight: 700 } as CSSProperties,
  tagWarn: { padding: '3px 9px', borderRadius: 999, background: 'var(--warn-soft, rgba(234,179,8,.15))', color: 'var(--warn)', fontSize: 11, fontWeight: 700 } as CSSProperties,
  tagMuted: { padding: '3px 9px', borderRadius: 999, background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 11, fontWeight: 700 } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 13, fontWeight: 600, margin: 0 } as CSSProperties,
};
