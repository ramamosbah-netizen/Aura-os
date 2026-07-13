'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

// Opportunity Radar — the acquisition cockpit: triage pre-lead Signals and promote the worthy
// ones into Leads (preserving source attribution). Lives on the Leads page inside the locked
// 5-page CRM IA — not a 6th top-level page.

interface RadarSignal {
  id: string;
  title: string;
  source: string;
  type: string;
  status: string;
  accountName: string | null;
  confidence: number;
  detectedAt: string;
  evidence: string | null;
}
interface Tally { key: string; count: number }
export interface RadarData {
  counts: { open: number; new: number; reviewing: number; researching: number; promoted: number; dismissed: number };
  bySource: Tally[];
  byType: Tally[];
  signals: RadarSignal[];
}

const SOURCES = ['MANUAL', 'INBOUND', 'REFERRAL', 'MARKET', 'RELATIONSHIP', 'ACCOUNT_GROWTH', 'TENDER_DISCOVERY', 'INTELLIGENCE'];
const TYPES = ['NEW_PROJECT', 'RFQ_RECEIVED', 'TENDER_DETECTED', 'RENEWAL_DUE', 'CROSS_SELL', 'UPSELL', 'EXPANSION', 'REFERRAL', 'MARKET_EVENT', 'OTHER'];

const confColor = (c: number): string => (c >= 70 ? '#16a34a' : c >= 40 ? '#d97706' : 'var(--muted)');

export default function OpportunityRadarPanel({ data }: { data: RadarData | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', source: 'MANUAL', type: 'NEW_PROJECT', accountName: '', confidence: 50 });

  const counts = data?.counts ?? { open: 0, new: 0, reviewing: 0, researching: 0, promoted: 0, dismissed: 0 };
  const signals = data?.signals ?? [];

  const act = async (id: string, path: string, body?: unknown): Promise<void> => {
    setBusy(id);
    try {
      const res = await fetch(`/api/crm/signals/${id}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const addSignal = async (): Promise<void> => {
    if (!form.title.trim()) return;
    setBusy('new');
    try {
      const res = await fetch('/api/crm/signals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, accountName: form.accountName || undefined }),
      });
      if (!res.ok) throw new Error();
      setForm({ title: '', source: 'MANUAL', type: 'NEW_PROJECT', accountName: '', confidence: 50 });
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={st.panel}>
      <div style={st.head}>
        <div>
          <h2 style={st.h2}>Opportunity Radar</h2>
          <div style={st.counts}>
            <span><b>{counts.open}</b> open</span>
            <span>· {counts.new} new</span>
            <span>· {counts.reviewing + counts.researching} in review</span>
            <span>· {counts.promoted} promoted</span>
          </div>
        </div>
        <button style={st.addBtn} onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ Signal'}</button>
      </div>

      {adding && (
        <div style={st.form}>
          <input style={st.input} placeholder="What happened? (signal title)" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input style={st.inputSm} placeholder="Account (optional)" value={form.accountName}
            onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
          <select style={st.inputSm} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={st.inputSm} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button style={st.primaryBtn} disabled={busy === 'new'} onClick={addSignal}>Detect</button>
        </div>
      )}

      {data === null ? (
        <p style={st.empty}>Radar unavailable.</p>
      ) : signals.length === 0 ? (
        <p style={st.empty}>No open signals — the radar is clear.</p>
      ) : (
        <ul style={st.list}>
          {signals.map((s) => (
            <li key={s.id} style={st.row}>
              <span style={{ ...st.conf, color: confColor(s.confidence) }}>{s.confidence}</span>
              <div style={st.main}>
                <div style={st.title}>
                  {s.title}
                  {s.accountName ? <span style={st.account}> · {s.accountName}</span> : null}
                </div>
                <div style={st.chips}>
                  <span style={st.chip}>{s.source}</span>
                  <span style={st.chip}>{s.type}</span>
                  <span style={st.statusChip}>{s.status.toLowerCase()}</span>
                </div>
              </div>
              <div style={st.actions}>
                <button style={st.primaryBtn} disabled={busy === s.id} onClick={() => act(s.id, 'promote')}>Promote →</button>
                <button style={st.linkBtn} disabled={busy === s.id}
                  onClick={() => act(s.id, 'dismiss', { reason: 'not pursuing' })}>Dismiss</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const st = {
  panel: { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)', padding: 16, marginBottom: 22 } as CSSProperties,
  head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 } as CSSProperties,
  h2: { fontSize: 16, margin: '0 0 4px', letterSpacing: -0.3 } as CSSProperties,
  counts: { fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 6, flexWrap: 'wrap' } as CSSProperties,
  addBtn: { fontSize: 12.5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer' } as CSSProperties,
  form: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' } as CSSProperties,
  input: { flex: '1 1 240px', minWidth: 180, padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 13 } as CSSProperties,
  inputSm: { padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--fg)', fontSize: 12.5 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  row: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 4px', borderTop: '1px solid var(--border)' } as CSSProperties,
  conf: { fontSize: 15, fontWeight: 700, minWidth: 26, textAlign: 'right', marginTop: 1 } as CSSProperties,
  main: { minWidth: 0, flex: 1 } as CSSProperties,
  title: { fontSize: 14, fontWeight: 600 } as CSSProperties,
  account: { color: 'var(--muted)', fontWeight: 400 } as CSSProperties,
  chips: { display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 } as CSSProperties,
  chip: { fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--fg)' } as CSSProperties,
  statusChip: { fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', textTransform: 'capitalize' } as CSSProperties,
  actions: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 } as CSSProperties,
  primaryBtn: { fontSize: 12, padding: '4px 9px', borderRadius: 5, border: '1px solid var(--fg)', background: 'var(--fg)', color: 'var(--panel)', cursor: 'pointer' } as CSSProperties,
  linkBtn: { fontSize: 12, padding: '4px 6px', borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 13, margin: '8px 4px' } as CSSProperties,
};
