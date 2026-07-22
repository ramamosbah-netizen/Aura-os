'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import type { CommQuotation } from './commercial-workspace';

// The Documents tab — the DMS access-control layer (#168) made visible and usable.
//
// The layer was real and enforced but had no surface: a document knew who could see it, why, and
// what each viewer could do, and none of that was on screen. This shows it, and lets someone act
// on it — share, revoke, download — without ever handling a storage key. Every gate stays in the
// kernel; this component only asks and relays.
//
// WHAT IT DELIBERATELY SHOWS THAT MOST SHARING UIs HIDE: the *source* of each permission. "You can
// share this because you are the owner", "Finance can view it because it was shared with the
// Finance role" — access is usually over-determined, and hiding why someone has it is how a
// share nobody remembers granting survives for years.

interface Doc {
  id: string; kind: string; title: string; aggregateId: string; createdBy: string | null;
}
type SubjectType = 'USER' | 'TEAM' | 'ROLE' | 'COMPANY';
type Level = 'VIEW' | 'DOWNLOAD' | 'COMMENT' | 'EDIT' | 'SHARE' | 'APPROVE';
interface Source { type: string; subjectId?: string; permissionId?: string; entity?: string }
interface Effective { permission: Level; sources: Source[] }
interface Access { allowed: boolean; permissions: Level[]; effective: Effective[]; policyVersion: number }
interface Permission {
  id: string; subjectType: SubjectType; subjectId: string; permission: Level;
  grantedBy: string | null; grantedAt: string; expiresAt: string | null;
}
interface UserRow { userId: string; displayName: string; workspaceRole: string }
interface SharedItem { document: Doc; permissions: Permission[] }

const LEVELS: Level[] = ['VIEW', 'DOWNLOAD', 'COMMENT', 'EDIT', 'SHARE', 'APPROVE'];
const KIND_LABEL: Record<string, string> = {
  technical_proposal: 'Technical proposal', commercial_offer: 'Commercial offer',
  vendor_quote: 'Vendor quote', datasheet: 'Datasheet', drawing: 'Drawing', other: 'Document',
};
const SOURCE_WORD: Record<string, string> = {
  owner: 'you created it', user: 'shared with you', team: 'shared with your team',
  role: 'shared with your role', company: 'shared company-wide', context: 'inherited',
};

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });

export default function DocumentsTab({ quotations }: { quotations: CommQuotation[] }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [shared, setShared] = useState<SharedItem[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    try {
      const [d, s, u] = await Promise.all([
        fetch('/api/documents?aggregateType=crm.quotation', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/documents/shared-with-me', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/admin/users', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ users: [] })),
      ]);
      setDocs(Array.isArray(d) ? d : []);
      setShared(Array.isArray(s) ? s : []);
      setUsers(Array.isArray(u?.users) ? u.users : []);
    } catch {
      setErr('Could not reach the document service.');
      setDocs([]);
    }
  }, []);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  // The quote a document hangs off, for a human-readable group header.
  const quoteOf = (aggregateId: string): CommQuotation | undefined =>
    quotations.find((q) => q.id === aggregateId);

  if (docs === null) return <p style={st.muted}>Loading documents…</p>;

  if (docs.length === 0 && shared.length === 0) {
    return (
      <div>
        {err && <p style={st.err}>{err}</p>}
        <p style={st.empty}>
          No documents are attached to any commercial decision yet, and nothing has been shared with
          you. A document appears here once it is attached to a quotation — open a quote and attach
          its technical proposal, vendor quotes or datasheets, and this becomes the place to control
          who can see them.
        </p>
      </div>
    );
  }

  // Group the caller's own documents by the decision they belong to.
  const groups = new Map<string, Doc[]>();
  for (const d of docs) {
    const list = groups.get(d.aggregateId) ?? [];
    list.push(d);
    groups.set(d.aggregateId, list);
  }

  return (
    <div className="neg-grid">
      <div>
        {shared.length > 0 && (
          <div style={st.sharedBox}>
            <b style={st.sharedHead}>Shared with you</b>
            <ul style={st.list}>
              {shared.map((s) => (
                <li key={s.document.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.document.id)}
                    style={{ ...st.row, ...(s.document.id === selectedId ? st.rowOn : {}) }}
                  >
                    <span style={st.rowTitle}>{s.document.title}</span>
                    <span style={st.rowSub}>
                      {s.permissions.map((p) => p.permission.toLowerCase()).join(', ') || 'view'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {[...groups.entries()].map(([aggregateId, list]) => {
          const q = quoteOf(aggregateId);
          return (
            <div key={aggregateId} style={st.group}>
              <div style={st.groupHead}>
                {q ? <b>{q.quoteNumber}</b> : <b>Quotation</b>}
                {q && <span style={st.groupSub}> · {q.customerName}</span>}
              </div>
              <ul style={st.list}>
                {list.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(d.id)}
                      style={{ ...st.row, ...(d.id === selectedId ? st.rowOn : {}) }}
                    >
                      <span style={st.rowTitle}>{d.title}</span>
                      <span style={st.rowSub}>{KIND_LABEL[d.kind] ?? d.kind}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div style={st.panel}>
        {selectedId
          ? <DocumentDetail key={selectedId} documentId={selectedId} users={users} onChanged={() => void loadDocs()} />
          : <p style={st.muted}>Select a document to see who can access it, and to share it.</p>}
      </div>
    </div>
  );
}

function DocumentDetail({ documentId, users, onChanged }: {
  documentId: string; users: UserRow[]; onChanged: () => void;
}) {
  const [access, setAccess] = useState<Access | null>(null);
  const [perms, setPerms] = useState<Permission[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const a: Access = await fetch(`/api/documents/${documentId}/access`, { cache: 'no-store' }).then((r) => r.json());
      setAccess(a);
      // Listing who-else-can-see requires VIEW; if the caller cannot, the API 403s and we simply
      // do not show the list rather than inventing an empty one.
      const pr = await fetch(`/api/documents/${documentId}/permissions`, { cache: 'no-store' });
      setPerms(pr.ok ? await pr.json() : null);
    } catch {
      setErr('Could not load access for this document.');
    }
  }, [documentId]);

  useEffect(() => { void load(); }, [load]);

  const canShare = access?.permissions.includes('SHARE') ?? false;
  const canDownload = access?.permissions.includes('DOWNLOAD') ?? false;

  async function revoke(permissionId: string): Promise<void> {
    try {
      const res = await fetch(`/api/documents/${documentId}/permissions/${permissionId}`, { method: 'DELETE' });
      if (!res.ok) { setErr('Could not revoke that share.'); return; }
      await load();
      onChanged();
    } catch {
      setErr('Could not reach the server — nothing was revoked.');
    }
  }

  if (err && !access) return <p style={st.err}>{err}</p>;
  if (!access) return <p style={st.muted}>Loading access…</p>;

  return (
    <div>
      <div style={st.detailHead}>
        <b>What you can do with this</b>
        {canDownload && (
          <a href={`/api/documents/${documentId}/content`} style={st.download}>Download →</a>
        )}
      </div>

      {/* Effective permissions, each with WHY — the point of the whole layer. */}
      <ul style={st.effList}>
        {access.effective.map((e) => (
          <li key={e.permission} style={st.effRow}>
            <span style={st.effPerm}>{e.permission}</span>
            <span style={st.effWhy}>
              {e.sources.map((s) => SOURCE_WORD[s.type] ?? s.type).join(' · ')}
            </span>
          </li>
        ))}
      </ul>

      {perms !== null && (
        <div style={st.section}>
          <b style={st.sectionHead}>Who else can see this</b>
          {perms.length === 0
            ? <p style={st.muted}>No one else — this document has only its owner.</p>
            : (
              <ul style={st.list}>
                {perms.map((p) => (
                  <li key={p.id} style={st.permRow}>
                    <span style={st.permWho}>
                      {p.subjectType.toLowerCase()} · <b>{p.subjectId}</b>
                    </span>
                    <span style={st.permLevel}>{p.permission.toLowerCase()}</span>
                    {p.expiresAt && <span style={st.permExpiry}>until {day(p.expiresAt)}</span>}
                    {canShare && (
                      <button type="button" onClick={() => void revoke(p.id)} style={st.revoke}>revoke</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}

      {canShare
        ? <ShareForm documentId={documentId} users={users} onShared={() => { void load(); onChanged(); }} />
        : (
          <p style={st.cannot}>
            You can view this document but not share it — sharing needs the SHARE permission, which
            you do not hold here.
          </p>
        )}

      {err && access && <p style={st.err}>{err}</p>}
    </div>
  );
}

function ShareForm({ documentId, users, onShared }: {
  documentId: string; users: UserRow[]; onShared: () => void;
}) {
  const [subjectType, setSubjectType] = useState<SubjectType>('USER');
  const [subjectId, setSubjectId] = useState('');
  const [permission, setPermission] = useState<Level>('VIEW');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  async function submit(): Promise<void> {
    if (busy || !subjectId.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/share`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subjectType, subjectId: subjectId.trim(), permission }),
      });
      if (res.status === 403) {
        // The delegation rule: you cannot grant a permission you may not delegate.
        setMsg({ tone: 'bad', text: 'You cannot grant that level — it is more than you may delegate.' });
        return;
      }
      if (!res.ok) { setMsg({ tone: 'bad', text: 'Could not share — nothing was granted.' }); return; }
      setMsg({ tone: 'ok', text: 'Shared.' });
      setSubjectId('');
      onShared();
    } catch {
      setMsg({ tone: 'bad', text: 'Could not reach the server — nothing was granted.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={st.share}>
      <b style={st.sectionHead}>Share this document</b>
      <div style={st.shareRow}>
        <select value={subjectType} onChange={(e) => { setSubjectType(e.target.value as SubjectType); setSubjectId(''); }} style={st.select}>
          <option value="USER">a user</option>
          <option value="TEAM">a team</option>
          <option value="ROLE">a role</option>
          <option value="COMPANY">the company</option>
        </select>
        {subjectType === 'USER' && users.length > 0 ? (
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={st.select} aria-label="who">
            <option value="">— choose —</option>
            {users.map((u) => <option key={u.userId} value={u.userId}>{u.userId}{u.workspaceRole ? ` (${u.workspaceRole})` : ''}</option>)}
          </select>
        ) : (
          <input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder={subjectType === 'COMPANY' ? 'company id' : 'id'} style={st.input} aria-label="who" />
        )}
        <select value={permission} onChange={(e) => setPermission(e.target.value as Level)} style={st.select} aria-label="permission">
          {LEVELS.map((l) => <option key={l} value={l}>{l.toLowerCase()}</option>)}
        </select>
        <button type="button" onClick={() => void submit()} disabled={busy || !subjectId.trim()} style={st.shareBtn}>
          {busy ? 'Sharing…' : 'Share'}
        </button>
      </div>
      {msg && <p style={msg.tone === 'ok' ? st.ok : st.err}>{msg.text}</p>}
      <p style={st.muted}>
        You can only grant what you are allowed to pass on. APPROVE, in particular, is a functional
        responsibility rather than something ownership confers.
      </p>
    </div>
  );
}

const st = {
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  group: { marginBottom: 14 } as CSSProperties,
  groupHead: { fontSize: 12, color: 'var(--text)', margin: '0 0 6px', display: 'flex', alignItems: 'baseline' } as CSSProperties,
  groupSub: { color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  sharedBox: { border: '1px solid var(--accent)', borderRadius: 10, padding: 10, marginBottom: 14, background: 'var(--panel)' } as CSSProperties,
  sharedHead: { fontSize: 12, display: 'block', marginBottom: 6 } as CSSProperties,
  row: { width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', color: 'var(--text)' } as CSSProperties,
  rowOn: { borderColor: 'var(--accent)', background: 'var(--panel-2)' } as CSSProperties,
  rowTitle: { fontSize: 12.5 } as CSSProperties,
  rowSub: { color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 11, padding: 14 } as CSSProperties,
  detailHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 } as CSSProperties,
  download: { color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5 } as CSSProperties,
  effList: { listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  effRow: { display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, alignItems: 'baseline', fontSize: 12.5 } as CSSProperties,
  effPerm: { fontWeight: 600, color: 'var(--good)', fontSize: 11.5 } as CSSProperties,
  effWhy: { color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  section: { borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 14 } as CSSProperties,
  sectionHead: { fontSize: 12, display: 'block', marginBottom: 8 } as CSSProperties,
  permRow: { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, flexWrap: 'wrap' } as CSSProperties,
  permWho: { color: 'var(--text)' } as CSSProperties,
  permLevel: { color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  permExpiry: { color: 'var(--warn)', fontSize: 11 } as CSSProperties,
  revoke: { marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--bad)', fontSize: 11, padding: '2px 8px', cursor: 'pointer' } as CSSProperties,
  share: { borderTop: '1px solid var(--border)', paddingTop: 12 } as CSSProperties,
  shareRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 } as CSSProperties,
  select: { background: 'var(--panel-2)', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--text)', padding: '6px 9px', fontSize: 12.5 } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border-strong)', borderRadius: 7, color: 'var(--text)', padding: '6px 9px', fontSize: 12.5, width: 150 } as CSSProperties,
  shareBtn: { background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#08121f', padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  cannot: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 12, margin: 0 } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6, margin: 0 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12, margin: '6px 0 0' } as CSSProperties,
  ok: { color: 'var(--good)', fontSize: 12, margin: '6px 0 0' } as CSSProperties,
};
