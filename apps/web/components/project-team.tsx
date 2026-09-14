'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Project Team — who may deliver THIS project, and in what delivery role (Project Delivery, P1).
// A member is an access grant scoped to `resource:project:<id>`; adding/removing here writes that
// grant. Only delivery-plane roles are offered (the API rejects anything else).

interface Member { userId: string; displayName: string; email: string; roleId: string; roleName: string; }
interface AssignRole { id: string; name: string; }
interface AssignUser { userId: string; displayName: string; email: string; }
type ResponsibilityStatus = 'assigned' | 'accepted' | 'in_progress' | 'completed';
interface Responsibility {
  id: string; workstream: string; title: string; description: string | null; assigneeId: string;
  assigneeName: string; assigneeEmail: string; dueDate: string | null; status: ResponsibilityStatus; canAct: boolean;
}
const WORKSTREAMS = [
  ['project_management', 'Project management'], ['engineering_release', 'Engineering release'],
  ['planning', 'Planning'], ['procurement', 'Procurement'], ['site_execution', 'Site execution'],
  ['commercial', 'Commercial'], ['quality', 'QA / QC'], ['hse', 'HSE'],
  ['commissioning', 'Testing & commissioning'], ['handover', 'Handover'],
] as const;

export default function ProjectTeam({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<AssignRole[]>([]);
  const [users, setUsers] = useState<AssignUser[]>([]);
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]);
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [responsibilityBusy, setResponsibilityBusy] = useState(false);
  const [workstream, setWorkstream] = useState('engineering_release');
  const [responsibilityTitle, setResponsibilityTitle] = useState('');
  const [responsibilityAssignee, setResponsibilityAssignee] = useState('');
  const [responsibilityDue, setResponsibilityDue] = useState('');

  const load = useCallback(async () => {
    const j = async <T,>(url: string, fallback: T): Promise<T> => {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) return fallback;
        return (await r.json()) as T;
      } catch { return fallback; }
    };
    const [m, a, r] = await Promise.all([
      j<Member[]>(`/api/projects/${projectId}/members`, []),
      j<{ roles: AssignRole[]; users: AssignUser[] }>(`/api/projects/${projectId}/assignable`, { roles: [], users: [] }),
      j<Responsibility[]>(`/api/projects/${projectId}/responsibilities`, []),
    ]);
    setMembers(Array.isArray(m) ? m : []);
    setRoles(a.roles ?? []);
    setUsers(a.users ?? []);
    setResponsibilities(Array.isArray(r) ? r : []);
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

  const openChat = async (): Promise<void> => {
    setChatBusy(true); setErr('');
    try {
      const res = await fetch(`/api/comms/projects/${encodeURIComponent(projectId)}`, { cache: 'no-store' });
      const channel = await res.json().catch(() => ({}));
      if (!res.ok || typeof channel?.id !== 'string') { setErr(channel?.message ?? channel?.error ?? 'Project chat is only available to team members.'); return; }
      router.push(`/my-work/communication?view=chat&channel=${encodeURIComponent(channel.id)}`);
    } catch { setErr('Could not open project chat'); } finally { setChatBusy(false); }
  };

  const assignResponsibility = async (): Promise<void> => {
    if (!responsibilityTitle.trim() || !responsibilityAssignee) { setErr('Add a responsibility title and choose a project member.'); return; }
    setResponsibilityBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(`/api/projects/${projectId}/responsibilities`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workstream, title: responsibilityTitle, assigneeId: responsibilityAssignee, dueDate: responsibilityDue || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.message ?? data.error ?? 'Could not assign responsibility.'); return; }
      setResponsibilityTitle(''); setResponsibilityAssignee(''); setResponsibilityDue('');
      setMsg(`Assigned “${data.title}” to ${data.assigneeName}. It is now visible in their My Work.`);
      await load();
    } catch { setErr('Projects API unreachable'); } finally { setResponsibilityBusy(false); }
  };

  const progressResponsibility = async (row: Responsibility, action: 'accept' | 'start' | 'complete'): Promise<void> => {
    setResponsibilityBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(`/api/projects/${projectId}/responsibilities/${encodeURIComponent(row.id)}/${action}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.message ?? data.error ?? 'Could not update responsibility.'); return; }
      setMsg(action === 'accept' ? 'Responsibility accepted.' : action === 'start' ? 'Work started.' : 'Responsibility completed.');
      await load();
    } catch { setErr('Projects API unreachable'); } finally { setResponsibilityBusy(false); }
  };

  const projectMembers = [...new Map(members.map((member) => [member.userId, member])).values()];

  return (
    <div>
      {err && <div style={st.err}>{err}</div>}
      {msg && <div style={st.ok}>{msg}</div>}

      <div style={st.teamToolbar}>
        <p style={st.intro}>
        The delivery team for this project. Each member holds a delivery role <em>scoped to this project only</em> —
        it grants no authority on any other project or across the organisation.
        </p>
        <button className="btn btn-ghost" style={st.chatBtn} disabled={chatBusy} onClick={() => void openChat()}>
          {chatBusy ? 'Opening chat…' : 'Open project chat →'}
        </button>
      </div>

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

      <section style={st.responsibilitySection} aria-labelledby="delivery-responsibilities-title">
        <div style={st.responsibilityHead}>
          <div>
            <h3 id="delivery-responsibilities-title" style={st.responsibilityTitle}>Delivery responsibilities</h3>
            <p style={st.intro}>Assign concrete work separately from access. The owner receives it in My Work, accepts it, starts it and completes it with the project context retained.</p>
          </div>
        </div>

        {roles.length > 0 ? <div style={st.assignmentBox}>
          <select aria-label="Responsibility workstream" style={st.select} value={workstream} disabled={responsibilityBusy} onChange={(e) => setWorkstream(e.target.value)}>
            {WORKSTREAMS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input aria-label="Responsibility title" style={st.input} value={responsibilityTitle} disabled={responsibilityBusy} onChange={(e) => setResponsibilityTitle(e.target.value)} placeholder="What must this person deliver?" />
          <select aria-label="Responsibility assignee" style={st.select} value={responsibilityAssignee} disabled={responsibilityBusy} onChange={(e) => setResponsibilityAssignee(e.target.value)}>
            <option value="">Choose project member…</option>
            {projectMembers.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
          </select>
          <input aria-label="Responsibility due date" style={st.input} type="date" value={responsibilityDue} disabled={responsibilityBusy} onChange={(e) => setResponsibilityDue(e.target.value)} />
          <button className="btn btn-primary" style={st.addBtn} disabled={responsibilityBusy || !responsibilityTitle.trim() || !responsibilityAssignee} onClick={() => void assignResponsibility()}>Assign work</button>
        </div> : null}

        {responsibilities.length === 0 ? <p style={st.muted}>No delivery responsibilities assigned yet.</p> : <div style={st.responsibilityList}>
          {responsibilities.map((row) => <article key={row.id} style={st.responsibilityCard} data-responsibility-id={row.id}>
            <div style={st.responsibilityBody}>
              <span className="badge badge-accent">{WORKSTREAMS.find(([value]) => value === row.workstream)?.[1] ?? row.workstream}</span>
              <strong>{row.title}</strong>
              <small style={st.meta}>{row.assigneeName}{row.dueDate ? ` · Due ${row.dueDate}` : ' · No due date'} · {row.status.replaceAll('_', ' ')}</small>
            </div>
            {row.canAct && row.status !== 'completed' ? <div style={st.responsibilityActions}>
              {row.status === 'assigned' ? <button className="btn btn-ghost" disabled={responsibilityBusy} onClick={() => void progressResponsibility(row, 'accept')}>Accept</button> : null}
              {['assigned', 'accepted'].includes(row.status) ? <button className="btn btn-ghost" disabled={responsibilityBusy} onClick={() => void progressResponsibility(row, 'start')}>Start</button> : null}
              {row.status === 'in_progress' ? <button className="btn btn-primary" disabled={responsibilityBusy} onClick={() => void progressResponsibility(row, 'complete')}>Complete</button> : null}
            </div> : null}
          </article>)}
        </div>}
      </section>
    </div>
  );
}

const st = {
  err: { padding: '10px 12px', border: '1px solid var(--bad)', borderRadius: 10, color: 'var(--bad)', marginBottom: 12, fontSize: 13 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, color: 'var(--good)', marginBottom: 12, fontSize: 13 } as CSSProperties,
  intro: { color: 'var(--muted)', fontSize: 12.5, margin: '2px 2px 14px', lineHeight: 1.5 } as CSSProperties,
  teamToolbar: { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' } as CSSProperties,
  chatBtn: { padding: '8px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' } as CSSProperties,
  addRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 } as CSSProperties,
  select: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 9, padding: '8px 10px', fontSize: 12.5, minWidth: 200 } as CSSProperties,
  addBtn: { padding: '8px 14px', fontSize: 12.5, fontWeight: 700 } as CSSProperties,
  rmBtn: { padding: '5px 12px', fontSize: 12, fontWeight: 600 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  input: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 9, padding: '8px 10px', fontSize: 12.5, minWidth: 190 } as CSSProperties,
  responsibilitySection: { borderTop: '1px solid var(--border)', marginTop: 24, paddingTop: 22 } as CSSProperties,
  responsibilityHead: { display: 'flex', justifyContent: 'space-between', gap: 16 } as CSSProperties,
  responsibilityTitle: { margin: '0 0 4px', fontSize: 18 } as CSSProperties,
  assignmentBox: { display: 'grid', gridTemplateColumns: 'minmax(160px, .8fr) minmax(240px, 1.4fr) minmax(190px, 1fr) 170px auto', gap: 8, alignItems: 'center', padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' } as CSSProperties,
  responsibilityList: { display: 'grid', gap: 8, marginTop: 14 } as CSSProperties,
  responsibilityCard: { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 12 } as CSSProperties,
  responsibilityBody: { display: 'grid', gap: 5 } as CSSProperties,
  meta: { color: 'var(--muted)', textTransform: 'capitalize' } as CSSProperties,
  responsibilityActions: { display: 'flex', gap: 7, flexWrap: 'wrap' } as CSSProperties,
};
