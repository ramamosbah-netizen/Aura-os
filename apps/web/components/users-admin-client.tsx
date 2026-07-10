'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ErrorBanner, Pill } from './admin-ui';

// Users admin (Vol 15 §2.2): merged registry + workspace directory. Registering an
// assigned-but-unregistered id is one click; deactivation is the enforcement bit.

interface AdminUser {
  userId: string;
  displayName: string;
  email: string;
  companyId: string | null;
  active: boolean;
  workspaceRole: string | null;
  registered: boolean;
}

export default function UsersAdminClient() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ userId: '', displayName: '', email: '', companyId: '' });
  const [edit, setEdit] = useState<Record<string, { displayName: string; email: string; companyId: string }>>({});

  const load = async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      if (!res.ok) {
        setErr('Could not load users — is the API up?');
        return;
      }
      setUsers(((await res.json()) as { users: AdminUser[] }).users);
    } catch {
      setErr('Users API unreachable.');
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const upsert = async (body: { userId: string; displayName?: string; email?: string; companyId?: string | null }, note: string): Promise<void> => {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Save failed');
        return;
      }
      setMsg(note);
      setDraft({ userId: '', displayName: '', email: '', companyId: '' });
      setEdit((e) => {
        const next = { ...e };
        delete next[body.userId];
        return next;
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (u: AdminUser, active: boolean): Promise<void> => {
    if (!active && !window.confirm(`Deactivate ${u.userId}? They are refused at login and on every API request immediately.`)) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.userId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.message ?? d.error ?? 'Update failed');
        return;
      }
      setMsg(`${u.userId} ${active ? 'reactivated' : 'deactivated'}.`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (users === null && !err) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>;

  const list = users ?? [];
  const activeCount = list.filter((u) => u.registered && u.active).length;
  const inactive = list.filter((u) => u.registered && !u.active).length;
  const unregistered = list.filter((u) => !u.registered).length;

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>
      {msg && <div style={st.ok}>{msg}</div>}

      <section style={st.card}>
        <h2 style={st.h2}>
          Directory <Pill tone="good">{activeCount} active</Pill>
          {inactive > 0 && <Pill tone="bad">{inactive} deactivated</Pill>}
          {unregistered > 0 && <Pill tone="info">{unregistered} unregistered</Pill>}
        </h2>
        <p style={st.hint}>
          Every account the platform knows: registered users plus ids assigned in the workspace
          but not yet registered. Deactivation blocks login <em>and</em> every guarded request.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={st.th}>User</th>
              <th style={st.th}>Name</th>
              <th style={st.th}>Email</th>
              <th style={st.th}>Company</th>
              <th style={st.th}>Workspace role</th>
              <th style={st.th}>Status</th>
              <th style={{ ...st.th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const e = edit[u.userId];
              return (
                <tr key={u.userId} style={!u.active ? { opacity: 0.55 } : undefined}>
                  <td style={st.td}><code style={st.code}>{u.userId}</code></td>
                  <td style={st.td}>
                    {e ? (
                      <input className="input" style={st.cellInput} value={e.displayName} onChange={(ev) => setEdit({ ...edit, [u.userId]: { ...e, displayName: ev.target.value } })} />
                    ) : (
                      u.displayName || <span style={st.dim}>—</span>
                    )}
                  </td>
                  <td style={st.td}>
                    {e ? (
                      <input className="input" style={st.cellInput} value={e.email} onChange={(ev) => setEdit({ ...edit, [u.userId]: { ...e, email: ev.target.value } })} />
                    ) : (
                      u.email || <span style={st.dim}>—</span>
                    )}
                  </td>
                  <td style={st.td}>
                    {e ? (
                      <input className="input" style={st.cellInput} value={e.companyId} onChange={(ev) => setEdit({ ...edit, [u.userId]: { ...e, companyId: ev.target.value } })} />
                    ) : (
                      u.companyId || <span style={st.dim}>all</span>
                    )}
                  </td>
                  <td style={st.td}>{u.workspaceRole ?? <span style={st.dim}>—</span>}</td>
                  <td style={st.td}>
                    {!u.registered ? <Pill tone="info">unregistered</Pill> : u.active ? <Pill tone="good">active</Pill> : <Pill tone="bad">deactivated</Pill>}
                  </td>
                  <td style={{ ...st.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!u.registered ? (
                      <button className="btn" style={st.smallBtn} disabled={busy} onClick={() => void upsert({ userId: u.userId }, `${u.userId} registered.`)}>
                        Register
                      </button>
                    ) : e ? (
                      <>
                        <button
                          className="btn btn-primary"
                          style={st.smallBtn}
                          disabled={busy}
                          onClick={() => void upsert({ userId: u.userId, displayName: e.displayName, email: e.email, companyId: e.companyId.trim() || null }, `${u.userId} saved.`)}
                        >
                          Save
                        </button>{' '}
                        <button className="btn" style={st.smallBtn} onClick={() => setEdit((prev) => { const n = { ...prev }; delete n[u.userId]; return n; })}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn"
                          style={st.smallBtn}
                          disabled={busy}
                          onClick={() => setEdit({ ...edit, [u.userId]: { displayName: u.displayName, email: u.email, companyId: u.companyId ?? '' } })}
                        >
                          Edit
                        </button>{' '}
                        {u.active ? (
                          <button className="btn" style={{ ...st.smallBtn, color: 'var(--bad)' }} disabled={busy} onClick={() => void setActive(u, false)}>
                            Deactivate
                          </button>
                        ) : (
                          <button className="btn" style={st.smallBtn} disabled={busy} onClick={() => void setActive(u, true)}>
                            Reactivate
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section style={st.card}>
        <h2 style={st.h2}>Register a user</h2>
        <p style={st.hint}>
          The user id is what the token carries (<code style={st.code}>u-finance</code>, an
          Entra object id, or an email). Grant roles afterwards in Roles &amp; Access.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ width: 160 }} placeholder="user id *" value={draft.userId} onChange={(e) => setDraft({ ...draft, userId: e.target.value })} />
          <input className="input" style={{ width: 180 }} placeholder="display name" value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
          <input className="input" style={{ width: 200 }} placeholder="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <input className="input" style={{ width: 150 }} placeholder="company id (optional)" value={draft.companyId} onChange={(e) => setDraft({ ...draft, companyId: e.target.value })} />
          <button
            className="btn btn-primary"
            disabled={busy || !draft.userId.trim()}
            onClick={() =>
              void upsert(
                { userId: draft.userId.trim(), displayName: draft.displayName, email: draft.email, companyId: draft.companyId.trim() || null },
                `${draft.userId.trim()} registered.`,
              )
            }
          >
            Register
          </button>
        </div>
      </section>
    </div>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14, background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' } as CSSProperties,
  h2: { fontSize: 14.5, fontWeight: 700, margin: 0, display: 'flex', gap: 8, alignItems: 'center' } as CSSProperties,
  hint: { fontSize: 12.5, color: 'var(--muted)', margin: '5px 0 12px', lineHeight: 1.5 } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '0 4px' } as CSSProperties,
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '6px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  dim: { color: 'var(--muted)' } as CSSProperties,
  smallBtn: { fontSize: 12, padding: '4px 10px' } as CSSProperties,
  cellInput: { fontSize: 12.5, padding: '3px 6px', width: '95%' } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, background: 'var(--good-soft)', color: 'var(--good)', marginBottom: 12, fontSize: 13 } as CSSProperties,
};
