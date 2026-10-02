'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import ExecutiveDecisionRecords, { type DecisionRecord } from './executive-decision-records';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

/** Which figure was opened: its words, and the drill the API answers it with. */
export interface ExecDrillRequest { label: string; query: Record<string, string> }

interface ExecRecords {
  period: { days: number; from: string; asOf: string };
  deals: Array<{
    id: string; title: string; accountName: string | null; stage: 'won' | 'lost'; value: number;
    reason: string | null; competitors: string | null; updatedAt: string;
  }>;
  total: { deals: number; value: number };
  complete: boolean;
}

const day = (iso: string): string => new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE });

/**
 * F-06 — the exact deals behind one figure of the executive read. It asks for the figure's own
 * window (the read's `asOf`), so the list is the deals that figure was over, and it states its own
 * count and value so the two can be held side by side.
 */
export default function ExecutiveCrmDrill({ request, days, asOf, onClose }: {
  request: ExecDrillRequest; days: number; asOf: string; onClose: () => void;
}) {
  const [data, setData] = useState<ExecRecords | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setErr(null);
    const qs = new URLSearchParams({ days: String(days), asOf, ...request.query });
    fetch(`/api/crm/executive/records?${qs.toString()}`, { cache: 'no-store' })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as ExecRecords & { message?: string };
        if (!r.ok) throw new Error(body.message ?? `The deals could not be read (${r.status}).`);
        return body;
      })
      .then((d) => { if (live) setData(d); })
      .catch((e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [request, days, asOf]);

  const records: DecisionRecord[] = (data?.deals ?? []).map((d) => ({
    id: d.id,
    label: d.accountName ? `${d.title} · ${d.accountName}` : d.title,
    href: `/crm/opportunities/${d.id}`,
    value: d.value,
    unit: 'currency',
    status: d.stage,
    note: [
      d.reason ?? `no ${d.stage === 'won' ? 'win' : 'loss'} reason recorded`,
      `decided ${day(d.updatedAt)}`,
      d.stage === 'lost' && d.competitors ? `against ${d.competitors}` : '',
    ].filter(Boolean).join(' · '),
  }));

  return (
    <section style={s.panel} data-testid="exec-drill" aria-label={`Deals behind: ${request.label}`}>
      <div style={s.head}>
        <div>
          <div style={s.title} data-testid="exec-drill-title">Deals behind: {request.label}</div>
          {data && (
            <div style={s.sub} data-testid="exec-drill-total">
              {data.total.deals} {data.total.deals === 1 ? 'deal' : 'deals'} · AED {data.total.value.toLocaleString(DISPLAY_LOCALE, { maximumFractionDigits: 0 })}
              {' '}— decided {day(data.period.from)} to {day(data.period.asOf)}, as the figure was read
              {!data.complete && '. The deals changed while they were being read, so this may not be every one — open it again'}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} style={s.close} data-testid="exec-drill-close">Close</button>
      </div>
      {err ? <p role="alert" style={s.err} data-testid="exec-drill-error">{err}</p>
        : data === null ? <p style={s.sub}>Reading the deals…</p>
          : <ExecutiveDecisionRecords records={records} currency="AED" />}
    </section>
  );
}

const s = {
  panel: { gridColumn: '1 / -1', background: 'var(--panel)', border: '1px solid var(--accent)', borderRadius: 12, padding: '12px 14px', minWidth: 0 } as CSSProperties,
  head: { display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap' } as CSSProperties,
  title: { fontSize: 13, fontWeight: 800, color: 'var(--text)' } as CSSProperties,
  sub: { fontSize: 12, color: 'var(--muted)', marginTop: 3 } as CSSProperties,
  close: { padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 12 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12.5, margin: 0 } as CSSProperties,
};
