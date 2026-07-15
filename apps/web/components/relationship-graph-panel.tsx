'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

// G6 — the account's relationship graph. Renders the typed directed edges from THIS
// account's side ("influences → Emaar" out, "influenced by ← Alpha" in), lets the user
// add/remove edges, and surfaces the leads that still name this account as free text
// (G4's consultant / main contractor) — links waiting to be made real.

interface GraphEdge {
  relationshipId: string;
  direction: 'outbound' | 'inbound';
  reading: string;
  type: string;
  notes: string | null;
  createdAt: string;
  account: { id: string; name: string; partyType: string | null; status: string };
}
interface LeadMention { leadId: string; leadName: string; role: 'consultant' | 'main_contractor'; projectName: string | null }
interface Graph { accountId: string; edges: GraphEdge[]; leadMentions: LeadMention[] }
interface AccountOption { id: string; name: string }

const EDGE_TYPES = [
  { value: 'influences', label: 'Influences' },
  { value: 'consultant_for', label: 'Consultant for' },
  { value: 'main_contractor_for', label: 'Main contractor for' },
  { value: 'subcontractor_of', label: 'Subcontractor of' },
  { value: 'supplier_to', label: 'Supplier to' },
  { value: 'partner_of', label: 'Partner of' },
  { value: 'parent_of', label: 'Parent of' },
];

const PARTY_LABEL: Record<string, string> = {
  end_client: 'End Client', consultant: 'Consultant', main_contractor: 'Main Contractor',
  developer: 'Developer', supplier: 'Supplier', partner: 'Partner',
  subcontractor: 'Subcontractor', government: 'Government', other: 'Other',
};

export default function RelationshipGraphPanel({ accountId }: { accountId: string }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [toId, setToId] = useState('');
  const [type, setType] = useState('influences');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/accounts/${accountId}/relationships`, { cache: 'no-store' });
    if (res.ok) setGraph(await res.json());
  }, [accountId]);

  useEffect(() => { void load(); }, [load]);

  const openAdd = async (): Promise<void> => {
    setAdding(true);
    setErr(null);
    if (accounts === null) {
      const res = await fetch('/api/crm/accounts', { cache: 'no-store' });
      if (res.ok) {
        const all = (await res.json()) as AccountOption[];
        setAccounts(all.filter((a) => a.id !== accountId));
      }
    }
  };

  const link = async (): Promise<void> => {
    if (!toId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/accounts/${accountId}/relationships`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toAccountId: toId, type, ...(notes.trim() ? { notes } : {}) }),
      });
      if (!res.ok) {
        setErr(((await res.json()) as { message?: string }).message ?? 'Link failed');
        return;
      }
      setToId(''); setNotes(''); setAdding(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (relId: string): Promise<void> => {
    setBusy(true);
    try {
      await fetch(`/api/crm/accounts/${accountId}/relationships/${relId}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (graph === null) return <p style={st.muted}>Loading relationships…</p>;

  return (
    <div>
      {graph.edges.length === 0 ? (
        <p style={st.muted}>No related parties yet — map who surrounds this account (consultants, contractors, developers).</p>
      ) : (
        graph.edges.map((e) => (
          <div key={e.relationshipId} style={st.edgeRow}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{e.direction === 'outbound' ? '→' : '←'} {e.reading}</span>{' '}
            <a href={`/crm/accounts/${e.account.id}`} style={st.link}>{e.account.name}</a>
            {e.account.partyType && <span style={st.partyTag}>{PARTY_LABEL[e.account.partyType] ?? e.account.partyType}</span>}
            {e.notes && <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>{e.notes}</div>}
            <button disabled={busy} onClick={() => void unlink(e.relationshipId)} title="Remove this relationship" style={st.removeBtn}>✕</button>
          </div>
        ))
      )}

      {graph.leadMentions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={st.mentionTitle}>Named on leads (not yet linked)</div>
          {graph.leadMentions.slice(0, 5).map((m) => (
            <div key={`${m.leadId}-${m.role}`} style={{ fontSize: 12.5, padding: '3px 0' }}>
              <span style={{ color: 'var(--muted)' }}>{m.role === 'consultant' ? 'consultant on' : 'main contractor on'}</span>{' '}
              {m.projectName ?? m.leadName}
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div style={st.form}>
          <select value={toId} onChange={(e) => setToId(e.target.value)} style={st.input}>
            <option value="">Select account…</option>
            {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} style={st.input}>
            {EDGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why (e.g. specified us on Marina Hotel)" style={{ ...st.input, gridColumn: '1 / -1' }} />
          {err && <div style={{ color: 'var(--bad)', fontSize: 12, gridColumn: '1 / -1' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 6, gridColumn: '1 / -1' }}>
            <button disabled={busy || !toId} onClick={() => void link()} style={st.primaryBtn}>Link</button>
            <button disabled={busy} onClick={() => setAdding(false)} style={st.ghostBtn}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => void openAdd()} style={{ ...st.ghostBtn, marginTop: 8 }}>+ Link a related party</button>
      )}
    </div>
  );
}

const st = {
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: '4px 0' } as CSSProperties,
  edgeRow: { position: 'relative', padding: '6px 22px 6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  partyTag: { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 5, padding: '0 5px', marginLeft: 6 } as CSSProperties,
  removeBtn: { position: 'absolute', right: 0, top: 6, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 } as CSSProperties,
  mentionTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 2 } as CSSProperties,
  form: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 } as CSSProperties,
  input: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--fg)', borderRadius: 7, padding: '6px 8px', fontSize: 12.5 } as CSSProperties,
  primaryBtn: { border: '1px solid var(--fg)', background: 'var(--fg)', color: 'var(--panel)', borderRadius: 7, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  ghostBtn: { border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', borderRadius: 7, padding: '5px 10px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
};
