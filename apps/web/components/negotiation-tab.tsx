'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import type { CommQuotation } from './commercial-workspace';

// The negotiation log — what was asked, what was answered, what the competition was doing.
//
// WHY THIS IS A RECORDING SURFACE FIRST. Measured before building: 19 quotations, one revision
// chain, zero quotes in `under_negotiation`. The stage existed and price movement was already
// recoverable from revisions, but the ASK and the ANSWER were written down nowhere — they lived
// in people's inboxes. A read-only view over that would have rendered an empty box. So the
// primary affordance here is writing an entry; the summary grows as the log does.
//
// THE RULE ON DISPLAY: price movement comes from the REVISION CHAIN, never from the log. A note
// claiming "gave them 5%" and a chain showing 2% disagree, and the chain is what bills. The panel
// labels the two differently for that reason — "asked" is a claim, "conceded" is a fact.

interface Entry {
  id: string;
  type: string;
  party: string;
  amount: number | null;
  percent: number | null;
  note: string;
  occurredAt: string;
}
interface Move { revision: number; total: number; delta: number; at: string }
interface Summary {
  entries: number;
  largestAskPercent: number | null;
  priceMovement: number;
  concessionPercent: number;
  competitorPrices: number[];
  awaitingOurAnswer: boolean;
}

const aed = (n: number): string => `AED ${Math.round(n).toLocaleString('en-AE')}`;
const day = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });

/** How each entry type reads in the log. */
const TYPE: Record<string, { label: string; icon: string; tone?: string }> = {
  DISCOUNT_REQUESTED: { label: 'Discount requested', icon: '↘', tone: 'var(--warn)' },
  COUNTER_OFFERED: { label: 'We countered', icon: '↗', tone: 'var(--accent)' },
  POSITION_HELD: { label: 'We held', icon: '⊟', tone: 'var(--good)' },
  CUSTOMER_COMMENT: { label: 'Customer said', icon: '“' },
  COMPETITOR_NOTED: { label: 'Competitor', icon: '⚔', tone: 'var(--bad)' },
  SCOPE_CHANGED: { label: 'Scope moved', icon: '⇄', tone: 'var(--warn)' },
};

/**
 * The quotes a negotiation plausibly concerns — nothing is negotiated before it is sent, and a
 * settled deal is not a pending decision.
 *
 * `revised` is deliberately absent even though a revised quote is the clearest sign of an active
 * negotiation: that status marks the SUPERSEDED parent, so including it would list the same
 * negotiation twice, once pointing at a record nobody should be adding to. The live revision
 * carries its own status and appears on its own.
 */
const NEGOTIABLE = ['sent', 'under_negotiation', 'approved'];

export default function NegotiationTab({ quotations }: { quotations: CommQuotation[] }) {
  const open = quotations.filter((q) => NEGOTIABLE.includes(q.status));
  const [selectedId, setSelectedId] = useState<string | null>(open[0]?.id ?? null);
  const [data, setData] = useState<{ entries: Entry[]; moves: Move[]; summary: Summary } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = open.find((q) => q.id === selectedId) ?? null;

  const load = useCallback(async (quotationId: string) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/negotiation?quotationId=${encodeURIComponent(quotationId)}`, { cache: 'no-store' });
      if (!res.ok) { setErr('Could not load the negotiation log.'); setData(null); return; }
      setData(await res.json());
    } catch {
      setErr('Could not reach the server — the log below may be out of date.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedId) void load(selectedId); }, [selectedId, load]);

  if (open.length === 0) {
    return (
      <p style={st.empty}>
        No quote has been sent yet, so there is nothing to negotiate. A negotiation starts when a
        customer has a price in front of them.
      </p>
    );
  }

  return (
    <div className="neg-grid">
      <ul style={st.list}>
        {open.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => setSelectedId(q.id)}
              style={{ ...st.row, ...(q.id === selectedId ? st.rowOn : {}) }}
            >
              <span style={st.rowTop}>
                <b style={st.rowNum}>{q.quoteNumber}</b>
                <span style={st.rowVal}>{aed(q.total)}</span>
              </span>
              <span style={st.rowSub}>{q.customerName}</span>
            </button>
          </li>
        ))}
      </ul>

      <div style={st.panel}>
        {selected && (
          <>
            <div style={st.head}>
              <div>
                <b>{selected.quoteNumber}</b>
                <span style={st.headSub}> · {selected.customerName} · {aed(selected.total)}</span>
              </div>
              <a href={`/crm/quotations/${selected.id}`} style={st.link}>Open the quote →</a>
            </div>

            {err && <p style={st.err}>{err}</p>}
            {loading && !data && <p style={st.muted}>Loading the log…</p>}

            {data && <Summaries summary={data.summary} moves={data.moves} />}
            {data && <Recorder quotationId={selected.id} onRecorded={() => void load(selected.id)} />}
            {data && <Log entries={data.entries} moves={data.moves} />}
          </>
        )}
      </div>
    </div>
  );
}

function Summaries({ summary, moves }: { summary: Summary; moves: Move[] }) {
  // With one revision there is no movement to report — saying "0% conceded" would read as a
  // decision to hold firm rather than an absence of revisions.
  const priced = moves.length > 1;
  return (
    <div style={st.stats}>
      <Stat
        label="Largest ask"
        value={summary.largestAskPercent === null ? '—' : `${summary.largestAskPercent}%`}
        sub={summary.largestAskPercent === null ? 'none recorded as a percentage' : 'what they asked for'}
        warn={summary.largestAskPercent !== null && summary.largestAskPercent >= 10}
      />
      <Stat
        label="Actually conceded"
        value={priced ? `${summary.concessionPercent}%` : '—'}
        sub={priced ? `${aed(Math.abs(summary.priceMovement))} across ${moves.length} revisions` : 'no revision raised yet'}
        warn={priced && summary.concessionPercent >= 10}
      />
      <Stat
        label="Competitor"
        value={summary.competitorPrices.length > 0 ? aed(summary.competitorPrices[0]) : '—'}
        sub={summary.competitorPrices.length > 0 ? 'lowest price we have heard' : 'nothing heard'}
      />
      <Stat
        label="Ball in our court"
        value={summary.awaitingOurAnswer ? 'Yes' : 'No'}
        sub={summary.awaitingOurAnswer ? 'they asked, we have not answered' : 'nothing outstanding'}
        warn={summary.awaitingOurAnswer}
      />
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div style={st.stat}>
      <span style={st.statLabel}>{label}</span>
      <b style={{ ...st.statValue, ...(warn ? { color: 'var(--warn)' } : {}) }}>{value}</b>
      <span style={st.statSub}>{sub}</span>
    </div>
  );
}

/** Recording an entry. The point of the tab: today none of this is written anywhere. */
function Recorder({ quotationId, onRecorded }: { quotationId: string; onRecorded: () => void }) {
  const [type, setType] = useState('DISCOUNT_REQUESTED');
  const [note, setNote] = useState('');
  const [percent, setPercent] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const wantsPercent = type === 'DISCOUNT_REQUESTED' || type === 'COUNTER_OFFERED';
  const wantsAmount = type === 'COMPETITOR_NOTED' || type === 'COUNTER_OFFERED';

  async function submit(): Promise<void> {
    if (busy || !note.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/crm/negotiation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quotationId,
          type,
          note: note.trim(),
          ...(wantsPercent && percent ? { percent: Number(percent) } : {}),
          ...(wantsAmount && amount ? { amount: Number(amount) } : {}),
        }),
      });
      if (!res.ok) { setErr('Could not record that — nothing was saved.'); return; }
      setNote(''); setPercent(''); setAmount('');
      onRecorded();
    } catch {
      setErr('Could not reach the server — nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={st.recorder}>
      <div style={st.recorderRow}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={st.select}>
          {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {wantsPercent && (
          <input
            value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal"
            placeholder="%" style={st.num} aria-label="percent"
          />
        )}
        {wantsAmount && (
          <input
            value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric"
            placeholder="AED" style={st.num} aria-label="amount"
          />
        )}
      </div>
      <textarea
        value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={st.textarea}
        placeholder="What was said, and where it came from — “procurement asked for 8% to match budget”"
        aria-label="note"
      />
      <div style={st.recorderFoot}>
        <button type="button" onClick={() => void submit()} disabled={busy || !note.trim()} style={st.record}>
          {busy ? 'Recording…' : 'Record this'}
        </button>
        <span style={st.muted}>
          A note never changes the price. Moving the price means raising a revision on the quote.
        </span>
      </div>
      {err && <p style={st.err}>{err}</p>}
    </div>
  );
}

/** The log itself, with revisions interleaved — what was said next to what it cost. */
function Log({ entries, moves }: { entries: Entry[]; moves: Move[] }) {
  type Item =
    | { at: string; kind: 'entry'; entry: Entry }
    | { at: string; kind: 'move'; move: Move };

  const items: Item[] = [
    ...entries.map((e) => ({ at: e.occurredAt, kind: 'entry' as const, entry: e })),
    // Revision 0 is the opening price, not a movement — it belongs in the log as the starting
    // point, but only later revisions represent a change.
    ...moves.slice(1).map((m) => ({ at: m.at, kind: 'move' as const, move: m })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));

  if (items.length === 0) {
    return (
      <p style={st.empty}>
        Nothing recorded yet. The first discount request, counter-offer or competitor price you log
        here is the start of a negotiation history this deal can be reviewed against.
      </p>
    );
  }

  return (
    <ol style={st.log}>
      {items.map((i) => i.kind === 'move' ? (
        <li key={`m${i.move.revision}`} style={{ ...st.logRow, ...st.logMove }}>
          <span style={st.logIcon}>◆</span>
          <span style={st.logBody}>
            <b>Revision {i.move.revision}</b> — price moved to {aed(i.move.total)}
            <span style={{ color: i.move.delta < 0 ? 'var(--warn)' : 'var(--good)' }}>
              {' '}({i.move.delta < 0 ? '−' : '+'}{aed(Math.abs(i.move.delta))})
            </span>
            <span style={st.logWhy}> · this is the number that bills</span>
          </span>
          <span style={st.logDate}>{day(i.at)}</span>
        </li>
      ) : (
        <li key={i.entry.id} style={st.logRow}>
          <span style={{ ...st.logIcon, color: TYPE[i.entry.type]?.tone ?? 'var(--muted)' }}>
            {TYPE[i.entry.type]?.icon ?? '•'}
          </span>
          <span style={st.logBody}>
            <b>{TYPE[i.entry.type]?.label ?? i.entry.type}</b>
            {i.entry.percent !== null && <span style={st.logNum}> {i.entry.percent}%</span>}
            {i.entry.amount !== null && <span style={st.logNum}> {aed(i.entry.amount)}</span>}
            <span style={st.logNote}> — {i.entry.note}</span>
          </span>
          <span style={st.logDate}>{day(i.at)}</span>
        </li>
      ))}
    </ol>
  );
}

const st = {
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  row: { width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 11px', cursor: 'pointer', color: 'var(--text)' } as CSSProperties,
  rowOn: { borderColor: 'var(--accent)', background: 'var(--panel-2)' } as CSSProperties,
  rowTop: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 } as CSSProperties,
  rowNum: { fontSize: 13 } as CSSProperties,
  rowVal: { fontVariantNumeric: 'tabular-nums', color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  rowSub: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 11, padding: 14 } as CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 12 } as CSSProperties,
  headSub: { color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5 } as CSSProperties,
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 } as CSSProperties,
  stat: { display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 11px' } as CSSProperties,
  statLabel: { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  statValue: { fontSize: 17, fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  statSub: { color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.4 } as CSSProperties,
  recorder: { border: '1px solid var(--border)', borderRadius: 9, padding: 11, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  recorderRow: { display: 'flex', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  recorderFoot: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  select: { background: 'var(--panel-2)', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--text)', padding: '6px 9px', fontSize: 12.5 } as CSSProperties,
  num: { background: 'var(--panel-2)', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--text)', padding: '6px 9px', fontSize: 12.5, width: 92 } as CSSProperties,
  textarea: { background: 'var(--panel-2)', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--text)', padding: '7px 9px', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical' } as CSSProperties,
  record: { background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#08121f', padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  log: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 } as CSSProperties,
  logRow: { display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 9, alignItems: 'baseline', fontSize: 12.5, lineHeight: 1.5 } as CSSProperties,
  logMove: { background: 'var(--panel-2)', borderRadius: 7, padding: '6px 8px' } as CSSProperties,
  logIcon: { fontSize: 12 } as CSSProperties,
  logBody: { color: 'var(--text)' } as CSSProperties,
  logNum: { fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  logNote: { color: 'var(--muted)' } as CSSProperties,
  logWhy: { color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  logDate: { color: 'var(--muted)', fontSize: 11.5, whiteSpace: 'nowrap' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6, margin: 0 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.5 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12, margin: '6px 0 0' } as CSSProperties,
};
