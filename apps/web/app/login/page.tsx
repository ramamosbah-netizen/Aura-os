'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

// Enterprise sign-in: split layout — brand story on the left, focused form on the
// right. No dev internals in end-user copy (credential policy lives in the API).
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(d.error ?? 'Sign-in failed. Check your credentials and try again.');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setErr('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.split}>
        {/* ── Brand panel ── */}
        <div style={s.brandPanel}>
          <div style={s.brand}>
            <span style={{ color: 'var(--accent)' }}>◆</span> AURA
            <span style={{ color: 'var(--muted)' }}>OS</span>
          </div>
          <h2 style={s.tagline}>One operating system for the whole enterprise.</h2>
          <p style={s.pitch}>
            CRM, tendering, contracts, projects, procurement, finance, HR and operations —
            unified on one event-driven platform.
          </p>
          <ul style={s.points}>
            <li style={s.point}><span style={s.pointDot} /> Live deal chain — from lead to project, automatically</li>
            <li style={s.point}><span style={s.pointDot} /> Real-time financials folded straight from the ledger</li>
            <li style={s.point}><span style={s.pointDot} /> AI copilot across every module</li>
          </ul>
        </div>

        {/* ── Sign-in form ── */}
        <form onSubmit={submit} style={s.card}>
          <h1 style={s.h1}>Sign in</h1>
          <p style={s.formSub}>Welcome back. Enter your workspace credentials.</p>

          <label style={s.label} htmlFor="login-user">Username</label>
          <input
            id="login-user"
            style={s.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your.username"
            autoComplete="username"
            autoFocus
          />

          <label style={s.label} htmlFor="login-pass">Password</label>
          <input
            id="login-pass"
            style={s.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />

          <button type="submit" style={busy ? { ...s.btn, opacity: 0.7 } : s.btn} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {err ? <p style={s.err}>{err}</p> : null}

          <p style={s.foot}>Access is provisioned by your administrator.</p>
        </form>
      </div>
    </div>
  );
}

const s = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  } as CSSProperties,
  split: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 0,
    width: 860,
    maxWidth: '100%',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
  } as CSSProperties,
  brandPanel: {
    flex: '1 1 380px',
    minWidth: 300,
    padding: '44px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    background:
      'radial-gradient(600px 400px at 0% 0%, var(--bg-glow) 0%, transparent 70%), var(--panel-2)',
    borderRight: '1px solid var(--border)',
  } as CSSProperties,
  brand: { fontWeight: 700, fontSize: 19, letterSpacing: 0.5 } as CSSProperties,
  tagline: { fontSize: 24, lineHeight: 1.3, margin: '18px 0 0', letterSpacing: -0.3 } as CSSProperties,
  pitch: { color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, margin: 0 } as CSSProperties,
  points: { listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  point: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--text)' } as CSSProperties,
  pointDot: { width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', flexShrink: 0 } as CSSProperties,
  card: {
    flex: '1 1 320px',
    minWidth: 280,
    display: 'flex',
    flexDirection: 'column',
    padding: '44px 40px',
  } as CSSProperties,
  h1: { fontSize: 22, margin: 0 } as CSSProperties,
  formSub: { color: 'var(--muted)', fontSize: 13.5, margin: '6px 0 24px' } as CSSProperties,
  label: {
    fontSize: 12,
    color: 'var(--muted)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as CSSProperties,
  input: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
    marginBottom: 16,
  } as CSSProperties,
  btn: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 10,
    padding: '11px 16px',
    fontSize: 14,
    cursor: 'pointer',
    marginTop: 4,
  } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '12px 0 0' } as CSSProperties,
  foot: { color: 'var(--muted)', fontSize: 12, margin: '22px 0 0' } as CSSProperties,
};
