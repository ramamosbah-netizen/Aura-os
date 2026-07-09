'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ErrorBanner, MatrixCell, Pill } from './admin-ui';

// Roles & Access — the matrix-first admin surface (phase 1.5 professional pass).
//  · Permission matrix: roles (rows) × modules (columns); a cell = `<module>.*`.
//    A role holding the full `*` wildcard shows every cell as inherited.
//  · Grants matrix: users (rows, from the workspace directory) × roles (columns).
//  · Fine-grained keys beyond `<module>.*` stay visible as chips per role.

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
interface DirectoryUser {
  username: string;
  role: string;
  roleLabel: string;
  isAdmin: boolean;
}

/** Matrix columns — the platform's modules plus the admin surface itself. */
const MODULES = [
  'crm', 'tendering', 'contracts', 'projects', 'procurement', 'inventory', 'finance',
  'hr', 'site', 'hse', 'quality', 'engineering', 'subcontracts', 'fleet', 'assets',
  'amc', 'doccontrol', 'admin',
] as const;

const hasModule = (perms: string[], m: string): boolean => perms.includes(`${m}.*`);
const hasAll = (perms: string[]): boolean => perms.includes('*');
/** Keys that are not `*` and not a plain `<module>.*` toggle — shown as chips. */
const customKeys = (perms: string[]): string[] =>
  perms.filter((p) => p !== '*' && !MODULES.some((m) => p === `${m}.*`));

export default function RolesAdminClient({
  initialRoles,
  initialGrants,
}: {
  initialRoles: Role[];
  initialGrants: Grant[];
}) {
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [grants, setGrants] = useState<Grant[]>(initialGrants);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // new-role composer
  const [rId, setRId] = useState('');
  const [rName, setRName] = useState('');

  useEffect(() => {
    fetch('/api/workspace/users', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setUsers(d))
      .catch(() => undefined);
  }, []);

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

  /** Persist a role (create or update — the API upserts by id). */
  const saveRole = async (role: Role): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/access/roles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(role),
      });
      if (!res.ok) return fail(res, 'Failed to save role');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleModule = (role: Role, m: string): void => {
    const key = `${m}.*`;
    const permissions = hasModule(role.permissions, m)
      ? role.permissions.filter((p) => p !== key)
      : [...role.permissions, key];
    void saveRole({ ...role, permissions });
  };

  const toggleAll = (role: Role): void => {
    const permissions = hasAll(role.permissions)
      ? role.permissions.filter((p) => p !== '*')
      : [...role.permissions, '*'];
    void saveRole({ ...role, permissions });
  };

  const removeCustomKey = (role: Role, key: string): void => {
    void saveRole({ ...role, permissions: role.permissions.filter((p) => p !== key) });
  };

  const addCustomKey = (role: Role): void => {
    const key = window.prompt('Permission key (module.entity.action — e.g. finance.invoice.approve):');
    if (!key?.trim()) return;
    void saveRole({ ...role, permissions: [...role.permissions, key.trim()] });
  };

  const createRole = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    await saveRole({ id: rId.trim(), name: rName.trim(), permissions: [] });
    setRId('');
    setRName('');
  };

  const granted = (userId: string, roleId: string): boolean =>
    grants.some((g) => g.userId === userId && g.roleId === roleId);

  const toggleGrant = async (userId: string, roleId: string): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const isOn = granted(userId, roleId);
      const res = isOn
        ? await fetch(`/api/admin/access/grants?userId=${encodeURIComponent(userId)}&roleId=${encodeURIComponent(roleId)}`, { method: 'DELETE' })
        : await fetch('/api/admin/access/grants', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ userId, roleId }),
          });
      if (!res.ok) return fail(res, 'Failed to update grant');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const resetMfa = async (userId: string): Promise<void> => {
    if (!window.confirm(`Remove ${userId}'s MFA enrolment? They can re-enrol at next login.`)) return;
    setErr(null);
    const res = await fetch(`/api/admin/mfa?account=${encodeURIComponent(userId)}`, { method: 'DELETE' });
    if (!res.ok) return fail(res, 'Failed to reset MFA');
  };

  // Grants matrix rows: the workspace directory, plus any granted user not in it.
  const matrixUsers: Array<{ id: string; label?: string }> = [
    ...users.map((u) => ({ id: u.username, label: u.roleLabel })),
    ...[...new Set(grants.map((g) => g.userId))]
      .filter((id) => !users.some((u) => u.username === id))
      .map((id) => ({ id })),
  ];

  return (
    <div>
      <ErrorBanner>{err}</ErrorBanner>

      {/* ── Permission matrix: roles × modules ─────────────────────────── */}
      <section style={st.card}>
        <div style={st.cardHead}>
          <div>
            <h2 style={st.h2}>Permission matrix</h2>
            <p style={st.sub}>
              A filled cell grants the whole module (<code style={st.code}>module.*</code>). <b>ALL</b> = the
              full <code style={st.code}>*</code> wildcard (soft cells are inherited from it). Finer keys
              appear as chips — the guard enforces down to <code style={st.code}>module.entity.action</code>.
            </p>
          </div>
        </div>

        <div style={st.scroll}>
          <table className="adm-matrix">
            <thead>
              <tr>
                <th>Role</th>
                <th>ALL</th>
                {MODULES.map((m) => (
                  <th key={m}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr><td colSpan={MODULES.length + 2} style={{ color: 'var(--muted)' }}>No roles yet — add one below.</td></tr>
              ) : (
                roles.map((r) => {
                  const all = hasAll(r.permissions);
                  const extra = customKeys(r.permissions);
                  return (
                    <React.Fragment key={r.id}>
                      <tr>
                        <td>
                          {r.name}
                          <span style={st.roleId}>{r.id}</span>
                        </td>
                        <td>
                          <MatrixCell on={all} onToggle={() => toggleAll(r)} disabled={busy} title="Grant everything (*)" />
                        </td>
                        {MODULES.map((m) => (
                          <td key={m}>
                            <MatrixCell
                              on={hasModule(r.permissions, m)}
                              inherited={all}
                              onToggle={() => toggleModule(r, m)}
                              disabled={busy}
                              title={`${m}.*`}
                            />
                          </td>
                        ))}
                      </tr>
                      {extra.length > 0 && (
                        <tr>
                          <td colSpan={MODULES.length + 2} style={st.chipRow}>
                            {extra.map((k) => (
                              <span key={k} style={st.chip}>
                                {k}
                                <button style={st.chipX} title="Remove key" onClick={() => removeCustomKey(r, k)}>×</button>
                              </span>
                            ))}
                            <button style={st.chipAdd} onClick={() => addCustomKey(r)}>+ key</button>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={createRole} style={st.form}>
          <input className="input" style={st.inp} placeholder="role id (e.g. procurementMgr)" value={rId} onChange={(e) => setRId(e.target.value)} required />
          <input className="input" style={st.inp} placeholder="display name (e.g. Procurement Manager)" value={rName} onChange={(e) => setRName(e.target.value)} required />
          <button className="btn btn-primary" disabled={busy} type="submit">Add role</button>
        </form>
      </section>

      {/* ── Grants matrix: users × roles ───────────────────────────────── */}
      <section style={st.card}>
        <div style={st.cardHead}>
          <div>
            <h2 style={st.h2}>User grants</h2>
            <p style={st.sub}>
              Click a cell to grant or revoke a role (tenant scope). Users come from the workspace
              directory; grants persist to Postgres and survive restarts.
            </p>
          </div>
        </div>

        <div style={st.scroll}>
          <table className="adm-matrix">
            <thead>
              <tr>
                <th>User</th>
                {roles.map((r) => (
                  <th key={r.id} title={r.id}>{r.name}</th>
                ))}
                <th>Security</th>
              </tr>
            </thead>
            <tbody>
              {matrixUsers.length === 0 ? (
                <tr><td colSpan={roles.length + 2} style={{ color: 'var(--muted)' }}>No users in the directory yet.</td></tr>
              ) : (
                matrixUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.id}
                      {u.label ? <span style={st.roleId}>{u.label}</span> : null}
                    </td>
                    {roles.map((r) => (
                      <td key={r.id}>
                        <MatrixCell
                          on={granted(u.id, r.id)}
                          onToggle={() => void toggleGrant(u.id, r.id)}
                          disabled={busy}
                          title={`${u.id} → ${r.id}`}
                        />
                      </td>
                    ))}
                    <td>
                      <button className="btn btn-ghost" style={st.mfaBtn} onClick={() => void resetMfa(u.id)} title="Remove this user's TOTP enrolment">
                        Reset MFA
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p style={st.legend}>
          <Pill tone="info">tip</Pill> Deal-chain dev roles are seeded; new grants write through to
          <code style={st.code}> aura_access_grants</code> and hydrate on boot.
        </p>
      </section>
    </div>
  );
}

const st = {
  card: {
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    background: 'var(--panel)',
    boxShadow: 'var(--shadow-sm)',
  } as CSSProperties,
  cardHead: { marginBottom: 12 } as CSSProperties,
  h2: { fontSize: 15, fontWeight: 700, margin: 0 } as CSSProperties,
  sub: { fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.5, maxWidth: 720 } as CSSProperties,
  scroll: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 } as CSSProperties,
  roleId: {
    display: 'block',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10.5,
    color: 'var(--muted)',
    fontWeight: 400,
  } as CSSProperties,
  chipRow: { textAlign: 'left', background: 'var(--panel-2)', padding: '4px 10px' } as CSSProperties,
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '1px 4px 1px 7px',
    margin: '2px 4px 2px 0',
  } as CSSProperties,
  chipX: {
    border: 'none',
    background: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: 13,
    lineHeight: 1,
    padding: '0 2px',
  } as CSSProperties,
  chipAdd: {
    border: '1px dashed var(--border-strong)',
    background: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: 11,
    borderRadius: 6,
    padding: '2px 8px',
  } as CSSProperties,
  form: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' } as CSSProperties,
  inp: { flex: 1, minWidth: 180, padding: '8px 10px', fontSize: 13 } as CSSProperties,
  mfaBtn: { fontSize: 11.5, padding: '4px 10px' } as CSSProperties,
  legend: { fontSize: 12, color: 'var(--muted)', margin: '10px 2px 0' } as CSSProperties,
  code: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11.5,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '0 4px',
  } as CSSProperties,
};
