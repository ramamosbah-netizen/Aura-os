'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

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
        setErr(d.error ?? 'Sign-in failed. Check your username and password.');
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
        <aside style={s.brandPane}>
          <div style={s.brand}>
            <span style={s.brandMark}>◆</span> AURA
            <span style={{ color: 'var(--muted)' }}>OS</span>
          </div>
          <h2 style={s.tagline}>One operating system for the whole enterprise.</h2>
          <p style={s.taglineSub}>
            CRM, tendering, contracts, projects, procurement, finance and operations — unified on a
            single event spine.
          </p>
          <div style={s.brandFoot}>© {new Date().getFullYear()} AURA OS</div>
        </aside>

        <form onSubmit={submit} style={s.card}>
          <h1 style={s.h1}>Sign in</h1>
          <p style={s.welcome}>Welcome back. Enter your credentials to continue.</p>

          <label style={s.label} htmlFor="login-user">
            Username
          </label>
          <input
            id="login-user"
            style={s.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            autoFocus
          />

          <label style={s.label} htmlFor="login-pass">
            Password
          </label>
          <input
            id="login-pass"
            style={s.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
          />

          <button type="submit" style={s.btn} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {err ? <p style={s.err}>{err}</p> : null}

          <p style={s.hint}>Need access? Contact your workspace administrator.</p>
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
    boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
  } as CSSProperties,
  brandPane: {
    flex: '1 1 340px',
    display: 'flex',
    flexDirection: 'column',
    padding: '40px 36px',
    background: 'var(--panel-2)',
    borderRight: '1px solid var(--border)',
    minHeight: 420,
  } as CSSProperties,
  brand: { fontWeight: 700, fontSize: 20, letterSpacing: 0.5, marginBottom: 28 } as CSSProperties,
  brandMark: { color: 'var(--accent)' } as CSSProperties,
  tagline: { fontSize: 24, lineHeight: 1.3, margin: '0 0 14px', letterSpacing: -0.3 } as CSSProperties,
  taglineSub: { color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 320 } as CSSProperties,
  brandFoot: { marginTop: 'auto', color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  card: {
    flex: '1 1 340px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '40px 36px',
  } as CSSProperties,
  h1: { fontSize: 22, margin: '0 0 6px' } as CSSProperties,
  welcome: { color: 'var(--muted)', fontSize: 13.5, margin: '0 0 22px' } as CSSProperties,
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
  } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '12px 0 0' } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, margin: '18px 0 0' } as CSSProperties,
};
