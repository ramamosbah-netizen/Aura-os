'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';

// Project Team — who may deliver THIS project, and in what delivery role (Project Delivery, P1).
// A member is an access grant scoped to `resource:project:<id>`; adding/removing here writes that
// grant. Only delivery-plane roles are offered (the API rejects anything else).

interface Member { userId: string; displayName: string; email: string; roleId: string; roleName: string; }
interface AssignRole { id: string; name: string; }
interface AssignUser { userId: string; displayName: string; email: string; }

export default function ProjectTeam({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<AssignRole[]>([]);
  const [users, setUsers] = useState<AssignUser[]>([]);
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = async <T,>(url: string, fallback: T): Promise<T> => {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) return fallback;
        return (await r.json()) as T;
      } catch { return fallback; }
    };
    const [m, a] = await Promise.all([
      j<Member[]>(`/api/projects/${projectId}/members`, []),
      j<{ roles: AssignRole[]; users: AssignUser[] }>(`/api/projects/${projectId}/assignable`, { roles: [], users: [] }),
    ]);
    setMembers(Array.isArray(m) ? m : []);
    setRoles(a.roles ?? []);
    setUsers(a.users ?? []);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const add = async (): Promise<void> => {
    if (!userId || !roleId) { setErr('Pick a user and a delivery role.'); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, roleId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Could not add member'); return; }
      setMsg(`Added ${d.member?.displayName ?? userId} as ${d.member?.roleName ?? roleId}.`);
      setUserId(''); setRoleId('');
      await load();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const remove = async (m: Member): Promise<void> => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${encodeURIComponent(m.userId)}?roleId=${encodeURIComponent(m.roleId)}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Could not remove member'); return; }
      setMsg(`Removed ${m.displayName} (${m.roleName}).`);
      await load();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  return (
    <div>
      {err && <div style={st.err}>{err}</div>}
      {msg && <div style={st.ok}>{msg}</div>}

      <p style={st.intro}>
        The delivery team for this project. Each member holds a delivery role <em>scoped to this project only</em> —
        it grants no authority on any other project or across the organisation.
      </p>

      {/* add member */}
      <div style={st.addRow}>
        <select style={st.select} value={userId} disabled={busy} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Select user…</option>
          {users.map((u) => (
            <option key={u.userId} value={u.userId}>{u.displayName}{u.email ? ` · ${u.email}` : ''}</option>
          ))}
        </select>
        <select style={st.select} value={roleId} disabled={busy} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">Delivery role…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <button className="btn btn-primary" style={st.addBtn} disabled={busy || !userId || !roleId} onClick={() => void add()}>
          + Add to team
        </button>
      </div>

      {members.length === 0 ? (
        <p style={st.muted}>No members yet — add the Project Manager, Site / QA-QC / HSE engineers who deliver this project.</p>
      ) : (
        <table className="data-table">
          <thead><tr>{['Member', 'Email', 'Delivery role', ''].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={`${m.userId}:${m.roleId}`}>
                <td style={{ fontWeight: 600 }}>{m.displayName}</td>
                <td style={{ color: 'var(--muted)' }}>{m.email || '—'}</td>
                <td><span className="badge badge-accent">{m.roleName}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost" style={st.rmBtn} disabled={busy} onClick={() => void remove(m)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const st = {
  err: { padding: '10px 12px', border: '1px solid var(--bad)', borderRadius: 10, color: 'var(--bad)', marginBottom: 12, fontSize: 13 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, color: 'var(--good)', marginBottom: 12, fontSize: 13 } as CSSProperties,
  intro: { color: 'var(--muted)', fontSize: 12.5, margin: '2px 2px 14px', lineHeight: 1.5 } as CSSProperties,
  addRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 } as CSSProperties,
  select: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 9, padding: '8px 10px', fontSize: 12.5, minWidth: 200 } as CSSProperties,
  addBtn: { padding: '8px 14px', fontSize: 12.5, fontWeight: 700 } as CSSProperties,
  rmBtn: { padding: '5px 12px', fontSize: 12, fontWeight: 600 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
