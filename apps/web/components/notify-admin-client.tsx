'use client';

import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import { ErrorBanner, Pill, Toggle } from './admin-ui';

// Notification routing admin (Admin Center phase 2, Vol 15 §2.8). Channel defaults,
// tenant fallback address, and the per-user recipient map edit here — persisted as
// `notify.*` settings keys which NotificationService consults on every dispatch
// (env vars remain the fallback). Transport URLs stay env-only (secrets).

export interface NotifyStatus {
  transports: Record<string, boolean>;
  effective: {
    channels: string;
    fallbackRecipient: string;
    recipients: string;
    source: Record<string, 'settings' | 'env' | 'unset'>;
  };
  events: Array<{ type: string; title: string; rule: string | null }>;
}

const CHANNELS = ['email', 'sms', 'slack', 'teams'] as const;

const parseMap = (csv: string): Array<{ user: string; addr: string }> =>
  csv
    .split(',')
    .map((p) => {
      const i = p.indexOf('=');
      return i > 0 ? { user: p.slice(0, i).trim(), addr: p.slice(i + 1).trim() } : null;
    })
    .filter((x): x is { user: string; addr: string } => !!x);

const toCsvMap = (rows: Array<{ user: string; addr: string }>): string =>
  rows.filter((r) => r.user && r.addr).map((r) => `${r.user}=${r.addr}`).join(',');

export default function NotifyAdminClient({ initial }: { initial: NotifyStatus }) {
  const [channels, setChannels] = useState<string[]>(
    initial.effective.channels.split(',').map((c) => c.trim()).filter(Boolean),
  );
  const [fallback, setFallback] = useState(initial.effective.fallbackRecipient);
  const [rows, setRows] = useState(parseMap(initial.effective.recipients));
  // Per-event rules (§2.8 depth): null = use defaults, [] = off (in-app only), else channels.
  const [rules, setRules] = useState<Record<string, string[] | null>>(
    Object.fromEntries(
      initial.events.map((e) => [
        e.type,
        e.rule === null ? null : e.rule.trim().toLowerCase() === 'off' ? [] : e.rule.split(',').map((c) => c.trim()).filter(Boolean),
      ]),
    ),
  );
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mark = (): void => {
    setDirty(true);
    setMsg(null);
  };

  const toggleChannel = (c: string): void => {
    setChannels(channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c]);
    mark();
  };

  const save = async (): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const writes: Array<[string, string, string]> = [
        ['notify.channels', channels.join(','), 'Default notification channels'],
        ['notify.fallbackRecipient', fallback.trim(), 'Tenant fallback address (ops distribution)'],
        ['notify.recipients', toCsvMap(rows), 'Per-user recipient map (userId=address)'],
      ];
      for (const [type, rule] of Object.entries(rules)) {
        // null → clear the key (defaults apply); [] → 'off'; else the channels csv.
        if (rule === null) {
          await fetch(`/api/admin/settings?key=${encodeURIComponent(`notify.rule.${type}`)}`, { method: 'DELETE' });
        } else {
          writes.push([`notify.rule.${type}`, rule.length === 0 ? 'off' : rule.join(','), `Per-event channels for ${type}`]);
        }
      }
      for (const [key, value, description] of writes) {
        const res = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key, value, description }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setErr(d.message ?? d.error ?? `Failed to save ${key}`);
          return;
        }
      }
      setDirty(false);
      setMsg('Routing saved — takes effect on the next dispatched notification.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>
      {msg && <div style={st.ok}>{msg}</div>}

      {/* Transports (env, read-only) */}
      <section style={st.card}>
        <h2 style={st.h2}>Transports</h2>
        <p style={st.hint}>
          Delivery endpoints are configured by environment (secrets never surface here):
          <code style={st.code}> SMTP_RELAY_URL · SMS_RELAY_URL · SLACK_WEBHOOK_URL · TEAMS_WEBHOOK_URL</code>.
          Unconfigured channels log instead of sending (dev fallback).
        </p>
        <div style={st.transportRow}>
          {CHANNELS.map((c) => (
            <div key={c} style={st.transport}>
              <span style={st.transportName}>{c}</span>
              <Pill tone={initial.transports[c] ? 'good' : 'muted'}>
                {initial.transports[c] ? 'configured' : 'log-only'}
              </Pill>
            </div>
          ))}
        </div>
      </section>

      {/* Routing */}
      <section style={st.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={st.h2}>Default routing</h2>
          <Pill tone={initial.effective.source.channels === 'settings' ? 'info' : 'muted'}>
            source: {initial.effective.source.channels}
          </Pill>
        </div>
        <p style={st.hint}>Channels used when an event notification carries none of its own.</p>
        <div style={st.channelRow}>
          {CHANNELS.map((c) => (
            <label key={c} style={st.channelToggle}>
              <Toggle on={channels.includes(c)} disabled={busy} onChange={() => toggleChannel(c)} />
              <span style={{ textTransform: 'capitalize' }}>{c}</span>
            </label>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={st.lbl}>Tenant fallback address</div>
          <input
            className="input"
            style={{ maxWidth: 340 }}
            placeholder="ops@company.ae"
            value={fallback}
            onChange={(e) => {
              setFallback(e.target.value);
              mark();
            }}
          />
        </div>
      </section>

      {/* Per-user recipient map */}
      <section style={st.card}>
        <h2 style={st.h2}>Per-user recipients</h2>
        <p style={st.hint}>Where each user's notifications deliver. Unmapped users fall back to the tenant address.</p>
        <table className="adm-matrix" style={{ maxWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>User id</th>
              <th style={{ textAlign: 'left' }}>Delivery address</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'left' }}>
                  <input className="input" style={st.cellInput} placeholder="u-finance" value={r.user}
                    onChange={(e) => { const next = [...rows]; next[i] = { ...r, user: e.target.value }; setRows(next); mark(); }} />
                </td>
                <td style={{ textAlign: 'left' }}>
                  <input className="input" style={{ ...st.cellInput, width: 240 }} placeholder="fin@company.ae" value={r.addr}
                    onChange={(e) => { const next = [...rows]; next[i] = { ...r, addr: e.target.value }; setRows(next); mark(); }} />
                </td>
                <td>
                  <button className="btn btn-ghost" style={st.xBtn} onClick={() => { setRows(rows.filter((_, j) => j !== i)); mark(); }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => { setRows([...rows, { user: '', addr: '' }]); mark(); }}>
          + Add mapping
        </button>
      </section>

      {/* Per-event rules matrix (§2.8 depth) */}
      <section style={st.card}>
        <h2 style={st.h2}>Per-event rules</h2>
        <p style={st.hint}>
          Route each auto-raised event to specific channels, silence its outbound delivery
          (<em>in-app only</em>), or leave it on the defaults above. Enforced on every dispatch.
        </p>
        <table className="adm-matrix" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Event</th>
              <th>Default</th>
              <th>In-app only</th>
              {CHANNELS.map((c) => (
                <th key={c} style={{ textTransform: 'capitalize' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {initial.events.map((e) => {
              const rule = rules[e.type];
              const custom = rule !== null && rule !== undefined;
              return (
                <tr key={e.type}>
                  <td style={{ textAlign: 'left' }}>
                    <code style={st.code}>{e.type}</code>
                    <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>{e.title}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <Toggle on={!custom} disabled={busy} onChange={() => { setRules({ ...rules, [e.type]: custom ? null : [] }); mark(); }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {custom ? (
                      <Toggle on={rule.length === 0} disabled={busy} onChange={() => { setRules({ ...rules, [e.type]: rule.length === 0 ? [...channels] : [] }); mark(); }} />
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  {CHANNELS.map((c) => (
                    <td key={c} style={{ textAlign: 'center' }}>
                      {custom ? (
                        <Toggle
                          on={rule.includes(c)}
                          disabled={busy}
                          onChange={() => { setRules({ ...rules, [e.type]: rule.includes(c) ? rule.filter((x) => x !== c) : [...rule, c] }); mark(); }}
                        />
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div style={st.saveBar}>
        <span style={st.dirtyNote}>{dirty ? 'Unsaved routing changes' : 'All changes saved'}</span>
        <button className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>
          Save routing
        </button>
      </div>
    </div>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14, background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' } as CSSProperties,
  h2: { fontSize: 14.5, fontWeight: 700, margin: 0 } as CSSProperties,
  hint: { fontSize: 12.5, color: 'var(--muted)', margin: '5px 0 12px', lineHeight: 1.5 } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '0 4px' } as CSSProperties,
  transportRow: { display: 'flex', gap: 14, flexWrap: 'wrap' } as CSSProperties,
  transport: { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px' } as CSSProperties,
  transportName: { fontSize: 13, fontWeight: 700, textTransform: 'capitalize' } as CSSProperties,
  channelRow: { display: 'flex', gap: 20, flexWrap: 'wrap' } as CSSProperties,
  channelToggle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 } as CSSProperties,
  lbl: { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 } as CSSProperties,
  cellInput: { padding: '5px 8px', fontSize: 12.5, borderRadius: 7, width: 160 } as CSSProperties,
  xBtn: { fontSize: 12, padding: '2px 8px' } as CSSProperties,
  eventRow: { display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)' } as CSSProperties,
  saveBar: { position: 'sticky', bottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', boxShadow: 'var(--shadow-lg)' } as CSSProperties,
  dirtyNote: { fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, background: 'var(--good-soft)', color: 'var(--good)', marginBottom: 14, fontSize: 13 } as CSSProperties,
};
