'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Pill } from './admin-ui';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

export interface UserAiWorkspaceProps {
  userRole?: string;
}

/** A real autonomy proposal, as the API serialises it (aura_autonomy_proposals). */
interface Proposal {
  id: string;
  title: string;
  description: string | null;
  category: 'pricing' | 'cost' | 'approval' | 'risk' | 'general';
  severity: 'info' | 'warning' | 'critical';
  mode: 'observe' | 'suggest' | 'assist' | 'operate';
  targetModule: string | null;
  valueAmount: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  createdAt: string;
}

const aed = (n: number): string => `AED ${new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n)}`;

const MODE_TONE: Record<Proposal['mode'], 'good' | 'warn' | 'muted'> = {
  operate: 'good', assist: 'warn', suggest: 'muted', observe: 'muted',
};
const STATUS_TONE: Record<Proposal['status'], 'good' | 'warn' | 'bad'> = {
  executed: 'good', approved: 'good', pending: 'warn', rejected: 'bad',
};

/**
 * The operational AI workspace (/ai). Every number here is READ from the autonomy queue — no
 * fabricated figures. An empty queue reads as an honest empty queue (the doctrine: refuse to show
 * something that isn't real). Approve/Reject drive the real AutonomyService; RAG ingest reports the
 * REAL chunk count the chunker produced.
 */
export default function UserAiWorkspace({ userRole = 'you' }: UserAiWorkspaceProps) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [docTitle, setDocTitle] = useState('');
  const [docText, setDocText] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setErr(null);
    try {
      const res = await fetch('/api/admin/platform/ai/autonomy/proposals', { cache: 'no-store' });
      const data = await res.json().catch(() => []);
      if (!res.ok) { setErr((data as { error?: string })?.error ?? 'Could not load the autonomy queue.'); return; }
      setProposals(Array.isArray(data) ? data : []);
    } catch {
      setErr('Could not reach the intelligence service.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, action: 'execute' | 'reject'): Promise<void> => {
    setBusyId(id); setErr(null);
    try {
      const res = await fetch(`/api/admin/platform/ai/autonomy/proposals/${id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr((d as { message?: string; error?: string }).message ?? (d as { error?: string }).error ?? `Could not ${action} the proposal.`);
        return;
      }
      await load();
    } finally { setBusyId(null); }
  };

  const ingest = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!docTitle.trim() || !docText.trim()) return;
    setIngesting(true); setIngestMsg(null); setErr(null);
    try {
      const res = await fetch('/api/admin/platform/ai/rag/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentTitle: docTitle, rawTextContent: docText, documentType: 'tender_spec' }),
      });
      const d = await res.json().catch(() => ({})) as { documentTitle?: string; totalChunks?: number; status?: string; message?: string; error?: string };
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Ingestion failed.'); return; }
      setIngestMsg(`Indexed “${d.documentTitle}” — ${d.totalChunks ?? 0} chunk${d.totalChunks === 1 ? '' : 's'} into the vector store (${d.status ?? 'ok'}).`);
      setDocTitle(''); setDocText('');
    } finally { setIngesting(false); }
  };

  // Every stat is derived from the real queue.
  const pending = proposals.filter((p) => p.status === 'pending');
  const potentialValue = pending.reduce((s, p) => s + (p.valueAmount ?? 0), 0);
  const riskCount = proposals.filter((p) => p.category === 'risk' && p.status === 'pending').length;
  const executed = proposals.filter((p) => p.status === 'executed').length;

  return (
    <div style={st.container}>
      {/* Daily briefing — real counts from the autonomy queue */}
      <section style={st.grid}>
        <div style={st.card}>
          <div style={st.cardHeader}><span style={{ fontSize: 20 }}>🤖</span><span style={st.badge}>Pending review</span></div>
          <div style={st.statVal}>{loading ? '—' : `${pending.length}`}</div>
          <p style={st.cardSub}>Proposals awaiting your decision</p>
        </div>
        <div style={st.card}>
          <div style={st.cardHeader}><span style={{ fontSize: 20 }}>💰</span><Pill tone="good">Potential value</Pill></div>
          <div style={st.statVal}>{loading ? '—' : aed(potentialValue)}</div>
          <p style={st.cardSub}>Sum of valued pending proposals</p>
        </div>
        <div style={st.card}>
          <div style={st.cardHeader}><span style={{ fontSize: 20 }}>⚠️</span><Pill tone={riskCount > 0 ? 'warn' : 'muted'}>{riskCount} risk{riskCount === 1 ? '' : 's'}</Pill></div>
          <div style={st.statVal}>{loading ? '—' : `${riskCount}`}</div>
          <p style={st.cardSub}>Open risk-flagged proposals</p>
        </div>
        <div style={st.card}>
          <div style={st.cardHeader}><span style={{ fontSize: 20 }}>✅</span><span style={st.badge}>Executed</span></div>
          <div style={st.statVal}>{loading ? '—' : `${executed}`}</div>
          <p style={st.cardSub}>Actions dispatched to their module</p>
        </div>
      </section>

      {err && <div style={st.errorBanner}>{err}</div>}
      {ingestMsg && <div style={st.successBanner}>{ingestMsg}</div>}

      {/* The real proposal queue */}
      <section style={st.panel}>
        <h2 style={st.h2}>Recommended actions for {userRole}</h2>
        <p style={st.hint}>The autonomy engine proposes actions from business events; below $10,000 &amp; ≤5% variance it can auto-execute, otherwise it asks you. Nothing here is invented — an empty queue means no proposals yet.</p>

        {loading ? (
          <p style={st.empty}>Loading the autonomy queue…</p>
        ) : proposals.length === 0 ? (
          <p style={st.empty}>No proposals yet. As the platform observes events — cost overruns, pricing anomalies, approvals — recommendations will appear here for review.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {proposals.map((p) => (
              <div key={p.id} style={{ ...st.itemBox, borderColor: p.status === 'executed' ? 'var(--good, #10b981)' : p.status === 'rejected' ? 'var(--border)' : 'var(--border)', opacity: p.status === 'rejected' ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Pill tone="muted">{p.category}</Pill>
                    <Pill tone={MODE_TONE[p.mode]}>{p.mode}</Pill>
                    <Pill tone={STATUS_TONE[p.status]}>{p.status.toUpperCase()}</Pill>
                  </div>
                </div>
                {p.description && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>{p.description}</p>}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  {p.valueAmount != null && <span style={{ fontSize: 12.5, fontWeight: 600 }}>{aed(p.valueAmount)}</span>}
                  {p.targetModule && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>→ {p.targetModule}</span>}
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{new Date(p.createdAt).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE })}</span>
                  {p.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                      <button type="button" disabled={busyId === p.id} onClick={() => void decide(p.id, 'execute')} style={st.btnApprove}>
                        {busyId === p.id ? '…' : '✓ Approve & run'}
                      </button>
                      <button type="button" disabled={busyId === p.id} onClick={() => void decide(p.id, 'reject')} style={st.btnGhost}>Reject</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Real RAG ingestion */}
      <section style={st.panel}>
        <h2 style={st.h2}>Index a document into RAG memory</h2>
        <p style={st.hint}>Paste tender/spec text — the chunker splits it into 300-word windows, embeds each, and stores it in the vector store. The result shows the real chunk count.</p>
        <form onSubmit={(e) => void ingest(e)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text"
            placeholder="Document title (e.g. Tower B — ELV Specification)"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            style={st.input}
          />
          <textarea
            placeholder="Paste the document text to index…"
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
            rows={4}
            style={{ ...st.input, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button type="submit" disabled={ingesting || !docTitle.trim() || !docText.trim()} style={{ ...st.btnApprove, alignSelf: 'flex-start' }}>
            {ingesting ? 'Indexing…' : '📥 Ingest & index'}
          </button>
        </form>
      </section>
    </div>
  );
}

const st = {
  container: { display: 'flex', flexDirection: 'column', gap: 16 } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 } as CSSProperties,
  card: { padding: 16, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as CSSProperties,
  statVal: { fontSize: 18, fontWeight: 700 } as CSSProperties,
  cardSub: { fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.4 } as CSSProperties,
  panel: { padding: 18, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14 } as CSSProperties,
  h2: { fontSize: 15, fontWeight: 700, margin: 0 } as CSSProperties,
  hint: { fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 14px' } as CSSProperties,
  empty: { fontSize: 13, color: 'var(--muted)', margin: '6px 0', padding: '18px 0', textAlign: 'center' } as CSSProperties,
  itemBox: { padding: 14, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  btnApprove: { padding: '8px 14px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#0b0e14', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' } as CSSProperties,
  btnGhost: { padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  input: { flex: 1, padding: '8px 12px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground, var(--text))', fontSize: 13, outline: 'none' } as CSSProperties,
  successBanner: { padding: '10px 14px', borderRadius: 8, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', fontSize: 13, fontWeight: 600 } as CSSProperties,
  errorBanner: { padding: '10px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: 13, fontWeight: 600 } as CSSProperties,
  badge: { fontSize: 11, padding: '2px 6px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 4, fontWeight: 600 } as CSSProperties,
};
