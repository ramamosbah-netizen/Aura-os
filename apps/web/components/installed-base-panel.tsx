'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

// §26 Installed Base & White-Space — what the customer HAS, whose it is, and what that
// implies: missing systems (white space), competitor kit (displacement), our kit without AMC
// (cross-sell), warranties/AMCs running out. "Scan" raises the findings as deduplicated
// Signals on the radar — never auto-created opportunities.

interface Item {
  id: string; system: string; siteName: string | null; provider: string; competitorName: string | null;
  installedAt: string | null; warrantyExpiresAt: string | null; amcStatus: string; amcExpiresAt: string | null; notes: string | null;
}
interface Coverage { system: string; status: 'ours' | 'competitor' | 'mixed' | 'missing'; items: number }
interface Finding { kind: string; system: string; siteName: string | null; reason: string }
interface View { items: Item[]; coverage: Coverage[]; findings: Finding[] }

const SYSTEMS = ['cctv', 'access_control', 'intrusion_alarm', 'fire_alarm', 'public_address', 'structured_cabling', 'bms', 'audio_visual', 'intercom', 'nurse_call', 'gate_barrier', 'parking_management', 'other'];
const PROVIDERS = ['us', 'competitor', 'unknown'];
const AMC = ['ours', 'competitor', 'none', 'unknown'];

const nice = (s: string): string => s.replace(/_/g, ' ');
const COV_META: Record<Coverage['status'], { label: string; color: string }> = {
  ours: { label: 'ours', color: 'var(--good)' },
  competitor: { label: 'competitor', color: 'var(--bad)' },
  mixed: { label: 'mixed', color: '#d97706' },
  missing: { label: 'white space', color: 'var(--muted)' },
};
const KIND_LABEL: Record<string, string> = {
  WHITE_SPACE: 'White space', REPLACEMENT: 'Displacement', AMC_CROSS_SELL: 'AMC cross-sell',
  WARRANTY_EXPIRING: 'Warranty expiring', RENEWAL_DUE: 'Renewal due',
};

export default function InstalledBasePanel({ accountId }: { accountId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ system: 'cctv', siteName: '', provider: 'us', competitorName: '', warrantyExpiresAt: '', amcStatus: 'unknown', amcExpiresAt: '' });
  const [busy, setBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/accounts/${accountId}/installed-base`, { cache: 'no-store' });
    if (res.ok) setView(await res.json());
  }, [accountId]);
  useEffect(() => { void load(); }, [load]);

  const add = async (): Promise<void> => {
    setBusy(true);
    try {
      const body: Record<string, string> = { system: form.system, provider: form.provider, amcStatus: form.amcStatus };
      if (form.siteName.trim()) body.siteName = form.siteName;
      if (form.competitorName.trim()) body.competitorName = form.competitorName;
      if (form.warrantyExpiresAt) body.warrantyExpiresAt = form.warrantyExpiresAt;
      if (form.amcExpiresAt) body.amcExpiresAt = form.amcExpiresAt;
      const res = await fetch(`/api/crm/accounts/${accountId}/installed-base`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) { setAdding(false); setForm({ ...form, siteName: '', competitorName: '', warrantyExpiresAt: '', amcExpiresAt: '' }); await load(); }
    } finally { setBusy(false); }
  };

  const remove = async (itemId: string): Promise<void> => {
    setBusy(true);
    try { await fetch(`/api/crm/accounts/${accountId}/installed-base/${itemId}`, { method: 'DELETE' }); await load(); }
    finally { setBusy(false); }
  };

  const scan = async (): Promise<void> => {
    setBusy(true); setScanMsg(null);
    try {
      const res = await fetch(`/api/crm/accounts/${accountId}/installed-base/scan`, { method: 'POST' });
      if (res.ok) {
        const d = (await res.json()) as { findings: Finding[]; raised: number };
        setScanMsg(d.findings.length === 0
          ? 'No growth findings — the base is fully covered.'
          : `${d.findings.length} findings · ${d.raised} new signal${d.raised === 1 ? '' : 's'} raised on the radar${d.raised === 0 ? ' (all already known)' : ''}.`);
      }
    } finally { setBusy(false); }
  };

  if (view === null) return <p style={st.muted}>Loading installed base…</p>;

  return (
    <div>
      {/* The white-space board — every system, whose it is */}
      <div style={st.covGrid}>
        {view.coverage.map((c) => (
          <span key={c.system} style={{ ...st.covChip, color: COV_META[c.status].color, borderColor: c.status === 'missing' ? 'var(--border)' : COV_META[c.status].color }}
            title={`${nice(c.system)}: ${COV_META[c.status].label}`}>
            {nice(c.system)} · {COV_META[c.status].label}
          </span>
        ))}
      </div>

      {view.items.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={st.table}>
            <thead><tr>{['System', 'Site', 'Provider', 'Warranty', 'AMC', ''].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
            <tbody>
              {view.items.map((i) => (
                <tr key={i.id}>
                  <td style={{ ...st.td, fontWeight: 600, textTransform: 'capitalize' }}>{nice(i.system)}</td>
                  <td style={st.td}>{i.siteName ?? '—'}</td>
                  <td style={{ ...st.td, color: i.provider === 'us' ? 'var(--good)' : i.provider === 'competitor' ? 'var(--bad)' : 'var(--muted)' }}>
                    {i.provider === 'competitor' ? (i.competitorName ?? 'competitor') : i.provider}
                  </td>
                  <td style={st.td}>{i.warrantyExpiresAt ?? '—'}</td>
                  <td style={st.td}>{i.amcStatus}{i.amcExpiresAt ? ` · ${i.amcExpiresAt}` : ''}</td>
                  <td style={st.td}><button disabled={busy} onClick={() => void remove(i.id)} style={st.removeBtn} title="Remove">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view.findings.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={st.subTitle}>Growth findings</div>
          {view.findings.slice(0, 6).map((f) => (
            <div key={`${f.kind}-${f.system}-${f.siteName}`} style={{ fontSize: 12.5, padding: '3px 0' }}>
              <span style={st.kindTag}>{KIND_LABEL[f.kind] ?? f.kind}</span> {f.reason}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        {adding ? (
          <div style={st.form}>
            <select value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} style={st.input}>
              {SYSTEMS.map((s) => <option key={s} value={s}>{nice(s)}</option>)}
            </select>
            <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} style={st.input}>
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} placeholder="Site (optional)" style={st.input} />
            {form.provider === 'competitor' && (
              <input value={form.competitorName} onChange={(e) => setForm({ ...form, competitorName: e.target.value })} placeholder="Competitor" style={st.input} />
            )}
            <label style={st.dateLabel}>Warranty<input type="date" value={form.warrantyExpiresAt} onChange={(e) => setForm({ ...form, warrantyExpiresAt: e.target.value })} style={st.input} /></label>
            <select value={form.amcStatus} onChange={(e) => setForm({ ...form, amcStatus: e.target.value })} style={st.input}>
              {AMC.map((a) => <option key={a} value={a}>AMC: {a}</option>)}
            </select>
            {form.amcStatus === 'ours' && (
              <label style={st.dateLabel}>AMC ends<input type="date" value={form.amcExpiresAt} onChange={(e) => setForm({ ...form, amcExpiresAt: e.target.value })} style={st.input} /></label>
            )}
            <button disabled={busy} onClick={() => void add()} style={st.primaryBtn}>Add</button>
            <button disabled={busy} onClick={() => setAdding(false)} style={st.ghostBtn}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={st.ghostBtn}>+ Record a system</button>
        )}
        <button disabled={busy || view.items.length === 0} onClick={() => void scan()} style={st.scanBtn}
          title="Raise the findings as deduplicated signals on the Opportunity Radar">⚡ Scan for growth signals</button>
        {scanMsg && <span style={st.muted}>{scanMsg}</span>}
      </div>
    </div>
  );
}

const st = {
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: 0 } as CSSProperties,
  covGrid: { display: 'flex', gap: 6, flexWrap: 'wrap' } as CSSProperties,
  covChip: { fontSize: 11, border: '1px solid', borderRadius: 999, padding: '2px 9px', textTransform: 'capitalize' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 8px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '6px 8px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  removeBtn: { border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 } as CSSProperties,
  subTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 2 } as CSSProperties,
  kindTag: { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 5, padding: '0 5px', marginRight: 6 } as CSSProperties,
  form: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--fg)', borderRadius: 7, padding: '5px 8px', fontSize: 12 } as CSSProperties,
  dateLabel: { display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11, color: 'var(--muted)' } as CSSProperties,
  primaryBtn: { fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--fg)', background: 'var(--fg)', color: 'var(--panel)', cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  ghostBtn: { fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' } as CSSProperties,
  scanBtn: { fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 } as CSSProperties,
};
