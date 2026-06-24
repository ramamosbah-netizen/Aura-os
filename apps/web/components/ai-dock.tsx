'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  provider?: string;
}

/**
 * The AURA AI dock — a persistent assistant in the shell. Posts to the web app's
 * own /api/ai route (BFF), which proxies to the kernel AiService. Runs in local-echo
 * mode until an ANTHROPIC_API_KEY is set on the API; the provider badge shows which.
 */
export default function AiDock() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: prompt }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsgs((m) => [...m, { role: 'assistant', text: data?.error ?? 'Something went wrong.' }]);
      } else {
        setMsgs((m) => [
          ...m,
          { role: 'assistant', text: data.text ?? '(no response)', provider: data.provider },
        ]);
      }
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', text: 'Could not reach the AI service.' }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" style={s.fab} onClick={() => setOpen(true)} aria-label="Open AURA AI">
        <span style={{ fontSize: 16 }}>✦</span> Ask AURA
      </button>
    );
  }

  return (
    <div style={s.panel}>
      <header style={s.header}>
        <span style={s.title}>
          <span style={{ color: 'var(--accent)' }}>✦</span> AURA AI
        </span>
        <button type="button" style={s.close} onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </header>

      <div style={s.thread}>
        {msgs.length === 0 ? (
          <p style={s.hint}>
            Ask anything about your workspace. The assistant runs on the kernel AI provider
            (Claude when a key is set, local echo otherwise).
          </p>
        ) : (
          msgs.map((m, i) => (
            <div key={i} style={m.role === 'user' ? s.userMsg : s.aiMsg}>
              <div style={s.msgText}>{m.text}</div>
              {m.provider ? <div style={s.badge}>via {m.provider}</div> : null}
            </div>
          ))
        )}
        {busy ? <div style={s.aiMsg}><div style={s.msgText}>…</div></div> : null}
      </div>

      <form onSubmit={send} style={s.inputRow}>
        <input
          style={s.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask AURA…"
          disabled={busy}
        />
        <button type="submit" style={s.send} disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

const s = {
  fab: {
    position: 'fixed',
    right: 20,
    bottom: 20,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    fontSize: 14,
    border: 'none',
    borderRadius: 999,
    padding: '11px 18px',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  } as CSSProperties,
  panel: {
    position: 'fixed',
    right: 20,
    bottom: 20,
    width: 360,
    maxWidth: 'calc(100vw - 40px)',
    height: 460,
    maxHeight: 'calc(100vh - 40px)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
    overflow: 'hidden',
  } as CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  title: { fontWeight: 600, fontSize: 14 } as CSSProperties,
  close: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: 20,
    lineHeight: 1,
    cursor: 'pointer',
  } as CSSProperties,
  thread: { flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, margin: 0 } as CSSProperties,
  userMsg: { alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--accent)', color: '#0b0e14', borderRadius: '12px 12px 2px 12px', padding: '8px 11px' } as CSSProperties,
  aiMsg: { alignSelf: 'flex-start', maxWidth: '85%', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: '12px 12px 12px 2px', padding: '8px 11px' } as CSSProperties,
  msgText: { fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } as CSSProperties,
  badge: { marginTop: 4, fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  inputRow: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)' } as CSSProperties,
  input: {
    flex: 1,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '9px 11px',
    fontSize: 13.5,
    outline: 'none',
  } as CSSProperties,
  send: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 10,
    padding: '0 14px',
    fontSize: 13.5,
    cursor: 'pointer',
  } as CSSProperties,
};
