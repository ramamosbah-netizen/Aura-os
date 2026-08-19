'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/lib/use-hydrated';

/** The second step sign-in can demand. `null` = the password step. */
type Challenge = { kind: 'mfa' | 'password_change'; id: string } | null;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [challenge, setChallenge] = useState<Challenge>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The form is not usable until React owns it.
  //
  // These inputs are controlled, so anything typed into the server-rendered markup before
  // hydration lands in the DOM and is then discarded when React attaches — leaving `username` and
  // `password` empty while the boxes look filled. Submitting in that window posts blank credentials
  // and the API answers, correctly, "invalid credentials". The user sees a rejection of something
  // they can plainly see they typed, and no amount of retrying the same way helps.
  //
  // `useHydrated` is false in the SSR HTML and true once React attaches, so disabling the fields
  // and the submit until then makes the form honest about when it can accept input.
  const ready = useHydrated();

  function land(): void {
    const requested = new URLSearchParams(window.location.search).get('next');
    const destination = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/';
    router.push(destination);
    router.refresh();
  }

  /**
   * One submit for both steps. A challenge is answered at its own endpoint — the exchange is
   * what mints the session, so there is no way to end up "signed in" without completing it.
   */
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (challenge?.kind === 'password_change' && newPassword !== confirmPassword) {
      setErr('The two passwords do not match.');
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const step = challenge
        ? {
            url: challenge.kind === 'mfa' ? '/api/auth/login/mfa' : '/api/auth/login/password-change',
            body:
              challenge.kind === 'mfa'
                ? { challengeId: challenge.id, code }
                : { challengeId: challenge.id, newPassword },
          }
        : { url: '/api/auth/login', body: { username, password } };

      const res = await fetch(step.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(step.body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        challenge?: string;
        challengeId?: string;
      };

      if (!res.ok) {
        setErr(data.error ?? 'Sign-in failed. Check your username and password.');
        return;
      }

      // Still owed something. Note this can arrive from EITHER step — a forced password change
      // can be followed by MFA — so the second step is a loop, not a fixed pair.
      if (data.challenge === 'mfa' || data.challenge === 'password_change') {
        setChallenge({ kind: data.challenge, id: data.challengeId ?? '' });
        setPassword('');
        setCode('');
        setNewPassword('');
        setConfirmPassword('');
        setNotice(
          data.challenge === 'mfa'
            ? 'Enter the verification code from your authenticator app.'
            : 'Your password was set by an administrator. Choose your own to continue.',
        );
        return;
      }

      land();
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
          <h1 style={s.h1}>{challenge ? 'One more step' : 'Sign in'}</h1>
          <p style={s.welcome}>
            {challenge ? notice : 'Welcome back. Enter your credentials to continue.'}
          </p>

          {!challenge ? (
            <>
              <label style={s.label} htmlFor="login-user">
                Username
              </label>
              <input
                id="login-user"
                data-testid="login-username"
                style={s.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                autoComplete="username"
                autoFocus
                disabled={!ready}
              />

              <label style={s.label} htmlFor="login-pass">
                Password
              </label>
              <input
                id="login-pass"
                data-testid="login-password"
                style={s.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                disabled={!ready}
                autoComplete="current-password"
              />
            </>
          ) : challenge.kind === 'mfa' ? (
            <>
              <label style={s.label} htmlFor="login-code">
                Verification code
              </label>
              <input
                id="login-code"
                data-testid="login-mfa-code"
                style={s.input}
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code"
                autoComplete="one-time-code"
                autoFocus
                disabled={!ready}
              />
            </>
          ) : (
            <>
              <label style={s.label} htmlFor="login-new-pass">
                New password
              </label>
              <input
                id="login-new-pass"
                data-testid="login-new-password"
                style={s.input}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                autoFocus
                disabled={!ready}
              />

              <label style={s.label} htmlFor="login-confirm-pass">
                Confirm new password
              </label>
              <input
                id="login-confirm-pass"
                data-testid="login-confirm-password"
                style={s.input}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat the new password"
                autoComplete="new-password"
                disabled={!ready}
              />
            </>
          )}

          <button type="submit" data-testid="login-submit" style={s.btn} disabled={busy || !ready}>
            {busy ? 'Working…' : challenge?.kind === 'password_change' ? 'Set password and continue' : 'Sign in'}
          </button>
          {err ? <p style={s.err} data-testid="login-error">{err}</p> : null}

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
