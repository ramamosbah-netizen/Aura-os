'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('u-admin');
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
        setErr(d.error ?? 'Login failed');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setErr('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s.wrap}>
      <form onSubmit={submit} style={s.card}>
        <div style={s.brand}>
          <span style={{ color: 'var(--accent)' }}>◆</span> AURA
          <span style={{ color: 'var(--muted)' }}>OS</span>
        </div>
        <h1 style={s.h1}>Sign in</h1>

        <label style={s.label}>User</label>
        <input style={s.input} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />

        <label style={s.label}>Password</label>
        <input
          style={s.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="dev: any (unless AUTH_DEV_PASSWORD set)"
        />

        <button type="submit" style={s.btn} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {err ? <p style={s.err}>{err}</p> : null}

        <p style={s.hint}>
          Sign in as <code style={s.code}>u-admin</code> for deal-chain permissions. Any other user is
          authenticated but unauthorized — writes return a clean 403.
        </p>
      </form>
    </div>
  );
}

const s = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 } as CSSProperties,
  card: {
    width: 360,
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '28px 26px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
  } as CSSProperties,
  brand: { fontWeight: 700, fontSize: 17, letterSpacing: 0.5, marginBottom: 18 } as CSSProperties,
  h1: { fontSize: 22, margin: '0 0 18px' } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
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
  code: {
    fontFamily: 'ui-monospace, monospace',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 5px',
  } as CSSProperties,
};
