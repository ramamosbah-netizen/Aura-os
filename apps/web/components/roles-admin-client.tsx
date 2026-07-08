'use client';

import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';

interface Role {
  id: string;
  name: string;
  permissions: string[];
}
interface Grant {
  userId: string;
  roleId: string;
  scope: { kind: string; level?: string; id?: string };
}

export default function RolesAdminClient({
  initialRoles,
  initialGrants,
}: {
  initialRoles: Role[];
  initialGrants: Grant[];
}) {
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [grants, setGrants] = useState<Grant[]>(initialGrants);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // create-role form
  const [rId, setRId] = useState('');
  const [rName, setRName] = useState('');
  const [rPerms, setRPerms] = useState('');

  // grant form
  const [gUser, setGUser] = useState('');
  const [gRole, setGRole] = useState('');

  const refresh = async (): Promise<void> => {
    const res = await fetch('/api/admin/access', { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      setRoles(d.roles ?? []);
      setGrants(d.grants ?? []);
    }
  };

  const fail = async (res: Response, fallback: string): Promise<void> => {
    const d = await res.json().catch(() => ({}));
    setErr(d.message ?? d.error ?? fallback);
  };

  const createRole = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/access/roles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: rId.trim(),
          name: rName.trim(),
          permissions: rPerms.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) return fail(res, 'Failed to create role');
      setRId('');
      setRName('');
      setRPerms('');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const grant = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/access/grants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: gUser.trim(), roleId: gRole }),
      });
      if (!res.ok) return fail(res, 'Failed to grant role');
      setGUser('');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (userId: string, roleId: string): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/access/grants?userId=${encodeURIComponent(userId)}&roleId=${encodeURIComponent(roleId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) return fail(res, 'Failed to revoke');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {err && <div style={st.err}>{err}</div>}

      {/* ── Roles ─────────────────────────────────────────────── */}
      <section style={st.card}>
        <h2 style={st.h2}>Roles</h2>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>ID</th>
              <th style={st.th}>Name</th>
              <th style={st.th}>Permissions</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td style={st.td} colSpan={3}>No roles yet.</td>
              </tr>
            ) : (
              roles.map((r) => (
                <tr key={r.id}>
                  <td style={st.tdMono}>{r.id}</td>
                  <td style={st.td}>{r.name}</td>
                  <td style={st.td}>
                    {r.permissions.map((p) => (
                      <span key={p} style={st.chip}>{p}</span>
                    ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={createRole} style={st.form}>
          <input style={st.input} placeholder="id (e.g. procurementMgr)" value={rId} onChange={(e) => setRId(e.target.value)} required />
          <input style={st.input} placeholder="name (e.g. Procurement Manager)" value={rName} onChange={(e) => setRName(e.target.value)} required />
          <input style={{ ...st.input, flex: 2 }} placeholder="permissions, comma-separated (e.g. procurement.*, finance.invoice.view)" value={rPerms} onChange={(e) => setRPerms(e.target.value)} />
          <button style={st.btn} disabled={busy} type="submit">Add role</button>
        </form>
      </section>

      {/* ── Grants ────────────────────────────────────────────── */}
      <section style={st.card}>
        <h2 style={st.h2}>Grants (user → role)</h2>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>User</th>
              <th style={st.th}>Role</th>
              <th style={st.th}>Scope</th>
              <th style={st.th}></th>
            </tr>
          </thead>
          <tbody>
            {grants.length === 0 ? (
              <tr>
                <td style={st.td} colSpan={4}>No grants yet.</td>
              </tr>
            ) : (
              grants.map((g, i) => (
                <tr key={`${g.userId}-${g.roleId}-${i}`}>
                  <td style={st.tdMono}>{g.userId}</td>
                  <td style={st.tdMono}>{g.roleId}</td>
                  <td style={st.td}>{g.scope.kind === 'org' ? `${g.scope.level}:${g.scope.id}` : 'resource'}</td>
                  <td style={st.td}>
                    <button style={st.btnGhost} disabled={busy} onClick={() => revoke(g.userId, g.roleId)}>Revoke</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={grant} style={st.form}>
          <input style={st.input} placeholder="userId (e.g. u-jane)" value={gUser} onChange={(e) => setGUser(e.target.value)} required />
          <select style={st.input} value={gRole} onChange={(e) => setGRole(e.target.value)} required>
            <option value="">Select role…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
            ))}
          </select>
          <button style={st.btn} disabled={busy || !gRole} type="submit">Grant</button>
        </form>
      </section>
    </div>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 10, padding: '18px 18px 14px', marginBottom: 20, background: 'var(--panel)' } as CSSProperties,
  h2: { fontSize: 16, margin: '0 0 12px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  tdMono: { padding: '8px', borderBottom: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace', fontSize: 12.5 } as CSSProperties,
  chip: { display: 'inline-block', fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 6px', margin: '2px 4px 2px 0' } as CSSProperties,
  form: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' } as CSSProperties,
  input: { flex: 1, minWidth: 140, padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel-2)', color: 'inherit', fontSize: 13 } as CSSProperties,
  btn: { padding: '7px 14px', border: '1px solid var(--accent, #3b82f6)', borderRadius: 6, background: 'var(--accent, #3b82f6)', color: '#fff', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  btnGhost: { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  err: { padding: '10px 12px', border: '1px solid #ef4444', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', marginBottom: 16, fontSize: 13 } as CSSProperties,
};
