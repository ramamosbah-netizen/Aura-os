'use client';

// Administrator Center — workspace access. An admin assigns users to roles and
// configures, per role, which workspace functions each role may see. Role-
// centric editing (pick a role → toggle its functions → manage its members)
// keeps it friendly rather than a 200-cell matrix. Resolution logic is the
// same pure code the API and Command Center use (@aura/shared).

import { type CSSProperties, useMemo, useState } from 'react';
import {
  WORKSPACE_ROLES,
  WORKSPACE_FUNCTIONS,
  functionsByCategory,
  getFunction,
  isAdminRole,
  visibleFunctionIds,
  type WorkspaceConfig,
  type WorkspaceRoleId,
  type WorkspaceFunctionCategory,
} from '@aura/shared';

interface WorkspaceUser {
  username: string;
  role: WorkspaceRoleId;
  roleLabel: string;
  isAdmin: boolean;
}

const CATEGORY_LABEL: Record<WorkspaceFunctionCategory, string> = {
  panel: 'Command Center panels',
  perspective: 'Command perspectives',
  action: 'Quick actions',
  suite: 'Navigation suites',
};
const CATEGORY_ORDER: WorkspaceFunctionCategory[] = ['panel', 'perspective', 'action', 'suite'];

export default function WorkspaceAdminClient({
  initialConfig,
  isAdmin,
}: {
  initialConfig: WorkspaceConfig;
  isAdmin: boolean;
}) {
  const [config, setConfig] = useState<WorkspaceConfig>(initialConfig);
  const [selectedRole, setSelectedRole] = useState<WorkspaceRoleId>('executive');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newUser, setNewUser] = useState('');

  const usersByRole = useMemo(() => {
    const m = new Map<WorkspaceRoleId, string[]>();
    for (const [username, role] of Object.entries(config.assignments)) {
      const arr = m.get(role) ?? [];
      arr.push(username);
      m.set(role, arr);
    }
    return m;
  }, [config.assignments]);

  if (!isAdmin) {
    return (
      <div style={st.denied}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🔒</div>
        <h2 style={{ margin: '0 0 6px' }}>Administrator access required</h2>
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          Only administrators can configure workspace access. Your role does not include workspace administration.
        </p>
      </div>
    );
  }

  const role = WORKSPACE_ROLES.find((r) => r.id === selectedRole)!;
  const roleIsAdmin = isAdminRole(selectedRole);
  const allowed = new Set(config.roleFunctions[selectedRole] ?? []);
  const visible = visibleFunctionIds(config, selectedRole);

  function toggleFunction(fnId: string) {
    if (roleIsAdmin) return; // admin sees everything, always
    setConfig((c) => {
      const cur = new Set(c.roleFunctions[selectedRole] ?? []);
      if (cur.has(fnId)) cur.delete(fnId);
      else cur.add(fnId);
      return { ...c, roleFunctions: { ...c.roleFunctions, [selectedRole]: [...cur] } };
    });
    setDirty(true);
    setSaved(false);
  }

  function assignUser(username: string, toRole: WorkspaceRoleId) {
    const u = username.trim();
    if (!u) return;
    setConfig((c) => ({ ...c, assignments: { ...c.assignments, [u]: toRole } }));
    setDirty(true);
    setSaved(false);
  }

  function removeUser(username: string) {
    setConfig((c) => {
      const next = { ...c.assignments };
      delete next[username];
      return { ...c, assignments: next };
    });
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/workspace/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignments: config.assignments, roleFunctions: config.roleFunctions, defaultRole: config.defaultRole }),
      });
      if (res.ok) {
        setDirty(false);
        setSaved(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function previewAs(r: WorkspaceRoleId) {
    try {
      window.localStorage.setItem('aura-view-as-role', r);
    } catch {
      /* ignore */
    }
    window.location.href = '/';
  }

  return (
    <div>
      {/* Save bar */}
      <div className="wa-savebar">
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Workspace access configuration</span>
        {dirty ? <span className="wa-dirty">● Unsaved changes</span> : saved ? <span style={{ color: 'var(--good)', fontSize: 12.5, fontWeight: 600 }}>✓ Saved</span> : null}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={() => { setConfig(initialConfig); setDirty(false); setSaved(false); }} disabled={busy || !dirty}>
            Reset
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="wa-layout">
        {/* Roles list */}
        <div>
          <div className="wa-group-title" style={{ marginTop: 0 }}>Roles</div>
          {WORKSPACE_ROLES.map((r) => {
            const count = usersByRole.get(r.id)?.length ?? 0;
            const fnCount = isAdminRole(r.id) ? WORKSPACE_FUNCTIONS.length : (config.roleFunctions[r.id]?.length ?? 0);
            return (
              <button key={r.id} type="button" className={`wa-rolecard${selectedRole === r.id ? ' active' : ''}`} onClick={() => setSelectedRole(r.id)}>
                <span className="wa-roledot" style={{ background: r.color }} />
                <span style={{ minWidth: 0 }}>
                  <div className="wa-rolecard-name">{r.label}</div>
                  <div className="wa-rolecard-meta">{count} user{count === 1 ? '' : 's'} · {fnCount} function{fnCount === 1 ? '' : 's'}</div>
                </span>
                {r.admin ? <span className="wa-admin-tag">Admin</span> : null}
              </button>
            );
          })}
        </div>

        {/* Selected role editor */}
        <div className="wa-panel">
          <div className="wa-role-header">
            <span className="wa-roledot" style={{ background: role.color, width: 16, height: 16 }} />
            <h2 className="wa-role-title">{role.label}</h2>
            {role.admin ? <span className="wa-admin-tag">Administrator</span> : null}
            <button type="button" className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '5px 12px', fontSize: 12.5 }} onClick={() => previewAs(selectedRole)}>
              👁 Preview workspace
            </button>
          </div>
          <p className="wa-role-desc">{role.description}</p>

          {/* Members */}
          <div className="wa-group-title" style={{ marginTop: 0 }}>Users in this role</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {(usersByRole.get(selectedRole) ?? []).map((u) => (
              <span key={u} className="wa-userchip">
                {u}
                <button type="button" onClick={() => removeUser(u)} aria-label={`Remove ${u}`}>✕</button>
              </span>
            ))}
            {(usersByRole.get(selectedRole) ?? []).length === 0 ? (
              <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>No users assigned yet.</span>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, maxWidth: 360 }}>
            <input
              className="input"
              placeholder="username (e.g. u-jane)"
              value={newUser}
              onChange={(e) => setNewUser(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { assignUser(newUser, selectedRole); setNewUser(''); } }}
            />
            <button type="button" className="btn" onClick={() => { assignUser(newUser, selectedRole); setNewUser(''); }} disabled={!newUser.trim()}>
              Assign
            </button>
          </div>

          {/* Functions */}
          {roleIsAdmin ? (
            <div className="wa-preview" style={{ marginTop: 18 }}>
              <div className="wa-preview-title">Administrators see every function</div>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                The admin role always has full access and cannot be restricted — it is how you configure everyone else.
              </span>
            </div>
          ) : (
            <>
              {CATEGORY_ORDER.map((cat) => {
                const fns = functionsByCategory(cat);
                if (fns.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="wa-group-title">{CATEGORY_LABEL[cat]}</div>
                    <div className="wa-fn-grid">
                      {fns.map((f) => {
                        const on = allowed.has(f.id);
                        return (
                          <div key={f.id} className={`wa-fn${on ? ' on' : ''}`} onClick={() => toggleFunction(f.id)} role="checkbox" aria-checked={on} tabIndex={0}
                            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleFunction(f.id); } }}>
                            <span className="wa-fn-toggle">{on ? '✓' : ''}</span>
                            <span>
                              <div className="wa-fn-label">{f.label}</div>
                              <div className="wa-fn-desc">{f.description}</div>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="wa-preview">
                <div className="wa-preview-title">A {role.label} will see {visible.length} function{visible.length === 1 ? '' : 's'}</div>
                <div className="wa-preview-tags">
                  {visible.map((id) => (
                    <span key={id} className="wa-preview-tag">{getFunction(id)?.label ?? id}</span>
                  ))}
                  {visible.length === 0 ? <span style={{ color: 'var(--muted)', fontSize: 12 }}>Nothing enabled — this role sees an empty workspace.</span> : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Full user directory — admin sees every user's workspace assignment */}
      <div className="wa-panel" style={{ marginTop: 18 }}>
        <div className="wa-group-title" style={{ marginTop: 0 }}>User directory · every user&apos;s workspace</div>
        <table className="wa-usertable">
          <thead>
            <tr><th>User</th><th>Role</th><th>Functions</th><th></th></tr>
          </thead>
          <tbody>
            {Object.entries(config.assignments).sort(([a], [b]) => a.localeCompare(b)).map(([username, r]) => {
              const meta = WORKSPACE_ROLES.find((x) => x.id === r);
              const fnCount = visibleFunctionIds(config, r).length;
              return (
                <tr key={username}>
                  <td style={{ fontWeight: 600 }}>{username}</td>
                  <td>
                    <select
                      className="select"
                      style={{ maxWidth: 200 }}
                      value={r}
                      onChange={(e) => assignUser(username, e.target.value as WorkspaceRoleId)}
                    >
                      {WORKSPACE_ROLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="wa-roledot" style={{ background: meta?.color }} /> {fnCount}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => previewAs(r)}>Preview →</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const st = {
  denied: {
    textAlign: 'center',
    padding: '48px 24px',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 16,
  } as CSSProperties,
};
