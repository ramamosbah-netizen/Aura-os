'use client';

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

// Contract 360 — where the deal chain closes. One page for the awarded
// contract's whole commercial life: workflow (Activate/Sign → the reactor
// creates the Project), obligations & milestones, bonds/guarantees with
// expiry watch, payment certificates (IPCs), and the chain strip
// (tender ← quotation ← CONTRACT → project).

interface Contract {
  id: string;
  title: string;
  reference: string | null;
  tenderId: string | null;
  tenderTitle: string | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}
interface Obligation {
  id: string; title: string; description: string | null; obligationType: string;
  responsibleParty: string; dueDate: string; status: string; completedDate: string | null;
}
interface Bond {
  id: string; kind: string; reference: string; bank: string | null; amount: number;
  issueDate: string | null; expiryDate: string | null; status: string;
}
interface Certificate {
  id: string; sequence: number; reference: string | null; status: string;
  grossToDate: number; netThisCertificate: number; createdAt: string;
}
interface CertSummary {
  contractValue: number; certificateCount: number; grossCertifiedToDate: number;
  retentionHeld: number; netCertifiedToDate: number; percentComplete: number;
}
interface ProjectLite { id: string; title: string; status: string; }
interface QuotationLite { id: string; quoteNumber: string; status: string; convertedContractId?: string | null; }
interface ContractRevision {
  id: string; contractId: string; revisionNumber: number; parentRevisionId: string | null;
  status: string; revisionReason: string | null; terms: Record<string, unknown>;
  clauses: Array<{ id: string; title: string; code: string; body: string }>;
  createdBy: string | null; createdAt: string; approvedBy: string | null; approvedAt: string | null;
  signedBy: string | null; signedAt: string | null;
}
interface LibraryClause { id: string; code: string; title: string; category: string; body: string; revision: number; active: boolean; }
interface ContractDocument { id: string; title: string; kind: string; aggregateType: string; aggregateId: string; currentVersion?: number; createdAt?: string; }
interface AuditEntry { id: string; actor_id?: string | null; action: string; entity_type?: string; entity_id?: string; metadata?: Record<string, unknown>; created_at: string; }
interface NegotiationItem { id: string; revisionId: string; type: 'comment'|'change_request'; content: string; visibility: 'internal'|'client_visible'; status: 'open'|'resolved'|'rejected'; ownerId?: string|null; resolution?: string|null; createdBy?: string|null; createdAt: string; resolvedAt?: string|null; }
interface ClientShare { id: string; revisionId: string; recipient: string; method: 'download'|'email'|'link'; state: 'prepared'|'dispatched'|'delivered'|'failed'; sharedBy?: string|null; sharedAt: string; correlationId: string; }
interface Amendment { id: string; baseRevisionId: string; amendmentNumber: number; title: string; content: string; sourceVariationId?: string|null; status: 'draft'|'review'|'approved'|'signed'|'returned'|'rejected'; createdBy?: string|null; createdAt: string; approvedBy?: string|null; approvedAt?: string|null; signedBy?: string|null; signedAt?: string|null; }
interface ContractApproval { id: string; target: 'revision'|'amendment'; targetId: string; status: 'pending'|'approved'|'returned'|'rejected'; submittedBy?: string|null; submittedAt: string; decidedBy?: string|null; decidedAt?: string|null; decisionComment?: string|null; }

type Tab = 'overview' | 'agreement' | 'negotiation' | 'approvals' | 'obligations' | 'bonds' | 'certificates' | 'documents' | 'variations' | 'history' | 'amendments' | 'closeout';

const aed = (n: number): string => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—');
const fmt = (iso: string): string => new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE });
const BOND_KIND_LABEL: Record<string, string> = {
  performance: 'Performance bond', advance_payment: 'Advance payment guarantee',
  retention: 'Retention bond', warranty: 'Warranty bond', tender_bond: 'Tender bond',
};

export default function Contract360Client({ contract }: { contract: Contract }) {
  const router = useRouter();
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [certSummary, setCertSummary] = useState<CertSummary | null>(null);
  const [project, setProject] = useState<ProjectLite | null>(null);
  const [quotation, setQuotation] = useState<QuotationLite | null>(null);
  const [revisions, setRevisions] = useState<ContractRevision[]>([]);
  const [libraryClauses, setLibraryClauses] = useState<LibraryClause[]>([]);
  const [documents, setDocuments] = useState<ContractDocument[]>([]);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [negotiation, setNegotiation] = useState<NegotiationItem[]>([]);
  const [negotiationContent, setNegotiationContent] = useState('');
  const [negotiationType, setNegotiationType] = useState<'comment'|'change_request'>('comment');
  const [negotiationVisibility, setNegotiationVisibility] = useState<'internal'|'client_visible'>('internal');
  const [shares, setShares] = useState<ClientShare[]>([]);
  const [shareRecipient, setShareRecipient] = useState('');
  const [shareMethod, setShareMethod] = useState<'download'|'email'|'link'>('download');
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [approvals, setApprovals] = useState<Record<string, ContractApproval | null>>({});
  const [amendmentTitle, setAmendmentTitle] = useState('');
  const [amendmentContent, setAmendmentContent] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentKind, setDocumentKind] = useState('contract');
  const [documentContent, setDocumentContent] = useState('');
  const [selectedClauseIds, setSelectedClauseIds] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
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
    const [obl, bnd, certPayload, projects, quotes, revs, clauses, docs, audit, nego, shareRows, amendmentRows] = await Promise.all([
      j<Obligation[]>(`/api/contracts/obligations?contractId=${contract.id}`, []),
      j<Bond[]>(`/api/contracts/bonds?contractId=${contract.id}`, []),
      j<{ certificates: Certificate[]; summary: CertSummary } | null>(`/api/contracts/certificates/summary/${contract.id}`, null),
      j<ProjectLite[]>(`/api/projects/projects?contractId=${contract.id}`, []),
      j<QuotationLite[]>(`/api/crm/quotations`, []),
      j<ContractRevision[]>(`/api/contracts/contracts/${contract.id}/revisions`, []),
      j<LibraryClause[]>('/api/contracts/clauses', []),
      j<ContractDocument[]>(`/api/documents?aggregateType=contracts.contract&aggregateId=${contract.id}`, []),
      j<{ data?: AuditEntry[] }>(`/api/audit?entityType=contract&entityId=${contract.id}&limit=100`, { data: [] }),
      j<NegotiationItem[]>(`/api/contracts/contracts/${contract.id}/negotiation`, []),
      j<ClientShare[]>(`/api/contracts/contracts/${contract.id}/client-shares`, []),
      j<Amendment[]>(`/api/contracts/contracts/${contract.id}/amendments`, []),
    ]);
    setObligations(Array.isArray(obl) ? obl : []);
    setBonds(Array.isArray(bnd) ? bnd : []);
    setCerts(certPayload?.certificates ?? []);
    setCertSummary(certPayload?.summary ?? null);
    const plist = Array.isArray(projects) ? projects : [];
    setProject(plist[0] ?? null);
    const qlist = Array.isArray(quotes) ? quotes : [];
    setQuotation(qlist.find((q) => q.convertedContractId === contract.id) ?? null);
    setRevisions(Array.isArray(revs) ? revs : []);
    setLibraryClauses(Array.isArray(clauses) ? clauses.filter((c) => c.active !== false) : []);
    setDocuments(Array.isArray(docs) ? docs : []);
    setHistory(Array.isArray(audit?.data) ? audit.data : []);
    setNegotiation(Array.isArray(nego) ? nego : []);
    setShares(Array.isArray(shareRows) ? shareRows : []);
    setAmendments(Array.isArray(amendmentRows) ? amendmentRows : []);
    const approvalRows = await Promise.all([
      ...(Array.isArray(revs) ? revs : []).map(async (r) => [`revision:${r.id}`, await j<ContractApproval | null>(`/api/contracts/contracts/${contract.id}/revisions/${r.id}/approval`, null)] as const),
      ...(Array.isArray(amendmentRows) ? amendmentRows : []).map(async (a) => [`amendment:${a.id}`, await j<ContractApproval | null>(`/api/contracts/contracts/${contract.id}/amendments/${a.id}/approval`, null)] as const),
    ]);
    setApprovals(Object.fromEntries(approvalRows));
  }, [contract.id]);

  useEffect(() => { void load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const openObl = obligations.filter((o) => o.status === 'open' || o.status === 'in_progress');
    const overdueObl = openObl.filter((o) => o.dueDate < today);
    const breached = obligations.filter((o) => o.status === 'breached');
    const activeBonds = bonds.filter((b) => b.status === 'active');
    const expiring = activeBonds.filter((b) => b.expiryDate && b.expiryDate <= soon);
    return {
      openObl: openObl.length,
      overdueObl: overdueObl.length,
      breached: breached.length,
      metObl: obligations.filter((o) => o.status === 'met').length,
      activeBonds: activeBonds.length,
      bondValue: activeBonds.reduce((s, b) => s + b.amount, 0),
      expiringBonds: expiring.length,
    };
  }, [obligations, bonds, today, soon]);

  const act = async (url: string, body: unknown, note?: string): Promise<void> => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Action failed'); return; }
      if (note) setMsg(note);
      await load();
      router.refresh();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const setContractStatus = (status: string): void => {
    void act(`/api/contracts/contracts/${contract.id}/status`, { status },
      status === 'active' ? 'Contract signed — the Project is being created on the deal chain.'
      : status === 'completed' ? 'Contract completed — release the remaining bonds and close out the project.'
      : undefined);
  };

  const createRevision = async (): Promise<void> => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(`/api/contracts/contracts/${contract.id}/revisions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revisionReason: 'Contract preparation', clauses: libraryClauses.filter((c) => selectedClauseIds.includes(c.id)).map((c) => ({ id: c.id, revisionId: '', sourceClauseId: c.id, sourceClauseRevision: c.revision, code: c.code, title: c.title, category: c.category, body: c.body, createdAt: '' })) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Unable to create revision'); return; }
      setMsg(`Revision R${d.revisionNumber} created as draft.`); setSelectedClauseIds([]); await load();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const transitionRevision = async (revision: ContractRevision, status: string): Promise<void> => {
    await act(`/api/contracts/contracts/${contract.id}/revisions/${revision.id}/status`, { status }, `Revision R${revision.revisionNumber} moved to ${status.replace('_', ' ')}.`);
  };

  const addNegotiationItem = async (): Promise<void> => {
    const revision = revisions.at(-1);
    if (!revision || !negotiationContent.trim()) { setErr('Select or create a revision and enter negotiation content.'); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(`/api/contracts/contracts/${contract.id}/negotiation`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revisionId: revision.id, type: negotiationType, content: negotiationContent, visibility: negotiationVisibility }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Unable to add negotiation item'); return; }
      setNegotiationContent(''); setMsg('Negotiation item recorded.'); await load();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const resolveNegotiationItem = async (item: NegotiationItem, status: 'resolved'|'rejected'): Promise<void> => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/contracts/contracts/${contract.id}/negotiation/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, resolution: status === 'resolved' ? 'Addressed in the next contract revision.' : 'Not accepted in this negotiation round.' }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Unable to resolve negotiation item'); return; }
      setMsg(`Negotiation item ${status}.`); await load();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const prepareClientShare = async (): Promise<void> => {
    const revision = revisions.at(-1);
    if (!revision || !shareRecipient.trim()) { setErr('Select a revision and enter a client recipient.'); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(`/api/contracts/contracts/${contract.id}/client-shares`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ revisionId:revision.id, recipient:shareRecipient, method:shareMethod }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Unable to prepare client version'); return; }
      setShareRecipient(''); setMsg('Client version prepared. Internal notes are excluded from the revision snapshot.'); await load();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const dispatchShare = async (share: ClientShare): Promise<void> => {
    setBusy(true); setErr('');
    try { const res=await fetch(`/api/contracts/contracts/${contract.id}/client-shares/${share.id}/dispatch`,{method:'POST'}); const d=await res.json().catch(()=>({})); if(!res.ok){setErr(d.message??d.error??'Unable to dispatch client version');return;} setMsg('Dispatch accepted; delivery remains provider-unconfirmed.'); await load(); }
    catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const createAmendment = async (): Promise<void> => {
    const signed = [...revisions].reverse().find((r) => r.status === 'signed');
    if (!signed || !amendmentTitle.trim() || !amendmentContent.trim()) { setErr('A signed revision, amendment title and content are required.'); return; }
    setBusy(true); setErr(''); setMsg('');
    try { const res=await fetch(`/api/contracts/contracts/${contract.id}/amendments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({baseRevisionId:signed.id,title:amendmentTitle,content:amendmentContent})}); const d=await res.json().catch(()=>({})); if(!res.ok){setErr(d.message??d.error??'Unable to create amendment');return;} setAmendmentTitle('');setAmendmentContent('');setMsg('Amendment draft created.');await load(); }
    catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const transitionAmendment = async (amendment: Amendment, status: Amendment['status']): Promise<void> => {
    setBusy(true); setErr('');
    try { const res=await fetch(`/api/contracts/contracts/${contract.id}/amendments/${amendment.id}/status`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status})}); const d=await res.json().catch(()=>({})); if(!res.ok){setErr(d.message??d.error??'Unable to update amendment');return;} setMsg(`Amendment A${amendment.amendmentNumber} moved to ${status}.`);await load(); }
    catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const decideApproval = async (target: 'revision'|'amendment', targetId: string, status: 'approved'|'returned'|'rejected'): Promise<void> => {
    setBusy(true); setErr('');
    try {
      const resource = target === 'revision' ? `revisions/${targetId}` : `amendments/${targetId}`;
      const res = await fetch(`/api/contracts/contracts/${contract.id}/${resource}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Unable to decide approval'); return; }
      setMsg(`${target === 'revision' ? 'Revision' : 'Amendment'} approval ${status}.`); await load();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const completeContract = async (): Promise<void> => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(`/api/contracts/contracts/${contract.id}/complete`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Unable to complete contract'); return; }
      setMsg('Contract completed through the governed closeout command.');
      await load();
      router.refresh();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const createContractDocument = async (): Promise<void> => {
    if (!documentTitle.trim() || !documentContent.trim()) { setErr('Document title and content are required.'); return; }
    try {
      const res = await fetch('/api/documents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: documentTitle, kind: documentKind, aggregateType: 'contracts.contract', aggregateId: contract.id, content: documentContent }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Unable to create contract document'); return; }
      setDocumentTitle(''); setDocumentContent(''); setMsg('Contract document associated through Document Control.'); await load();
    } catch { setErr('Document Control is unavailable.'); }
  };

  return (
    <div>
      {err && <div style={st.err}>{err}</div>}
      {msg && <div style={st.ok}>{msg}</div>}

      {/* header */}
      <div style={st.header}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={st.h1}>{contract.title}</h1>
            <span className={contract.status === 'active' ? 'badge badge-good' : contract.status === 'completed' ? 'badge badge-accent' : contract.status === 'cancelled' ? 'badge badge-bad' : 'badge'}>{contract.status}</span>
          </div>
          <div style={st.subline}>
            {contract.reference && <span style={{ fontFamily: 'ui-monospace, monospace' }}>{contract.reference}</span>}
            {contract.accountId
              ? <a href={`/crm/accounts/${contract.accountId}`} style={st.link}>{contract.accountName ?? 'Account'}</a>
              : contract.accountName && <span>{contract.accountName}</span>}
            <span>Awarded {fmt(contract.createdAt)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {contract.status === 'draft' && (
            <button className="btn btn-primary" style={st.actBtn} disabled={busy} onClick={() => setContractStatus('active')}>
              Activate / Sign → creates Project
            </button>
          )}
          {contract.status === 'active' && (
            <button className="btn" style={{ ...st.actBtn, color: 'var(--accent)' }} disabled={busy} onClick={() => setContractStatus('completed')}>
              Complete ✓
            </button>
          )}
          {(contract.status === 'draft' || contract.status === 'active') && (
            <button className="btn btn-ghost" style={st.actBtn} disabled={busy} onClick={() => setContractStatus('cancelled')}>Cancel</button>
          )}
          <a href={`/contracts/contracts/${contract.id}/print`} style={st.linkBtn} target="_blank" rel="noopener noreferrer">🖨 Print</a>
        </div>
      </div>

      {/* commercial summary */}
      <div style={st.stats}>
        <Stat label="Contract value" value={`AED ${aed(contract.value)}`} strong />
        <Stat label="Certified to date" value={certSummary ? `AED ${aed(certSummary.grossCertifiedToDate)}` : '—'} />
        <Stat label="% complete" value={certSummary ? `${certSummary.percentComplete}%` : '—'} accent />
        <Stat label="Retention held" value={certSummary ? `AED ${aed(certSummary.retentionHeld)}` : '—'} />
        <Stat label="Obligations open" value={`${stats.openObl}${stats.overdueObl > 0 ? ` (${stats.overdueObl} overdue)` : ''}`} bad={stats.overdueObl > 0} />
        <Stat label="Breached" value={String(stats.breached)} bad={stats.breached > 0} />
        <Stat label="Active bonds" value={`${stats.activeBonds} · AED ${aed(stats.bondValue)}`} />
        <Stat label="Bonds expiring ≤30d" value={String(stats.expiringBonds)} bad={stats.expiringBonds > 0} />
      </div>

      {/* deal-chain strip */}
      <div style={st.chain}>
        {contract.tenderId
          ? <a href={`/tendering/tenders/${contract.tenderId}`} style={{ ...st.chainNode, ...st.chainOn }}>◳ Tender{contract.tenderTitle ? `: ${contract.tenderTitle}` : ''}</a>
          : <span style={st.chainNode}>◳ no tender (direct)</span>}
        <span style={st.arrow}>→</span>
        {quotation
          ? <a href="/crm/quotations" style={{ ...st.chainNode, ...st.chainOn }}>✎ {quotation.quoteNumber}</a>
          : <span style={st.chainNode}>✎ no quotation</span>}
        <span style={st.arrow}>→</span>
        <span style={{ ...st.chainNode, borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 800 }}>▤ CONTRACT</span>
        <span style={st.arrow}>→</span>
        {project
          ? <a href={`/project/${project.id}`} style={{ ...st.chainNode, ...st.chainOn, color: 'var(--good)' }}>▦ {project.title} ({project.status})</a>
          : <span style={st.chainNode}>▦ project appears on activation</span>}
      </div>

      {/* tabs */}
      <div style={st.tabs}>
        {([
          ['overview', 'Overview'],
          ['agreement', `Agreement & revisions (${revisions.length})`],
          ['negotiation', `Negotiation (${negotiation.length})`],
          ['approvals', 'Approvals'],
          ['obligations', `Obligations & milestones (${obligations.length})`],
          ['bonds', `Bonds & guarantees (${bonds.length})`],
          ['certificates', `Payment certificates (${certs.length})`],
          ['documents', `Documents (${documents.length})`],
          ['variations', 'Variations'],
          ['history', `History (${history.length})`],
          ['amendments', 'Amendments'],
          ['closeout', 'Closeout'],
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} style={{ ...st.tab, ...(tab === id ? st.tabOn : {}) }} onClick={() => setTab(id)}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {tab === 'agreement' && contract.status === 'draft' && (
          <button className="btn btn-primary" style={st.actBtn} disabled={busy} onClick={() => void createRevision()}>New draft revision</button>
        )}
        {tab === 'agreement' && revisions.length > 0 && <a href={`/contracts/contracts/${contract.id}/print`} target="_blank" rel="noreferrer" style={st.linkBtn}>Preview / download client-safe PDF →</a>}
        {tab === 'obligations' && (
          <CreateDrawer
            entity="Obligation"
            subtitle="A deliverable, milestone or compliance item this contract commits someone to — with a due date."
            endpoint="/api/contracts/obligations"
            fields={[
              { name: 'contractId', label: 'Contract id (fixed)', kind: 'text', defaultValue: contract.id, readonly: true },
              { name: 'contractTitle', label: 'Contract (fixed)', kind: 'text', defaultValue: contract.title, readonly: true },
              { name: 'title', label: 'Title', kind: 'text', required: true, placeholder: 'e.g. Submit performance bond', span: 2 },
              {
                name: 'obligationType', label: 'Type', kind: 'select', defaultValue: 'deliverable',
                options: ['deliverable', 'milestone', 'compliance', 'payment', 'insurance', 'other'].map((t) => ({ value: t, label: t })),
              },
              {
                name: 'responsibleParty', label: 'Responsible', kind: 'select', defaultValue: 'us',
                options: ['us', 'client', 'consultant', 'subcontractor', 'other'].map((t) => ({ value: t, label: t })),
              },
              { name: 'dueDate', label: 'Due date', kind: 'date', required: true },
              { name: 'description', label: 'Description', kind: 'textarea', span: 2 },
            ]}
          />
        )}
        {tab === 'bonds' && (
          <CreateDrawer
            entity="Bond"
            subtitle="A bank guarantee securing this contract — the expiry date is the commercial watchpoint."
            endpoint="/api/contracts/bonds"
            fields={[
              { name: 'contractId', label: 'Contract id (fixed)', kind: 'text', defaultValue: contract.id, readonly: true },
              {
                name: 'kind', label: 'Kind', kind: 'select', defaultValue: 'performance',
                options: Object.entries(BOND_KIND_LABEL).map(([v, l]) => ({ value: v, label: l })),
              },
              { name: 'reference', label: 'Guarantee no.', kind: 'text', required: true, placeholder: 'e.g. PB-2026-0042' },
              { name: 'bank', label: 'Bank', kind: 'text', placeholder: 'e.g. Emirates NBD' },
              { name: 'amount', label: 'Amount (AED)', kind: 'number', required: true },
              { name: 'issueDate', label: 'Issue date', kind: 'date' },
              { name: 'expiryDate', label: 'Expiry date', kind: 'date', hint: 'Watched — expiring bonds turn red on the register' },
              { name: 'notes', label: 'Notes', kind: 'textarea', span: 2 },
            ]}
          />
        )}
        {tab === 'certificates' && <a href="/contracts/certificates" style={st.linkBtn}>Open certificates register →</a>}
        {tab === 'variations' && <a href="/projects/variations" style={st.linkBtn}>Open canonical Variations workspace →</a>}
        {tab === 'documents' && <a href="/doccontrol/register" style={st.linkBtn}>Open Documents register →</a>}
        {tab === 'closeout' && contract.status === 'active' && <button className="btn btn-primary" style={st.actBtn} disabled={busy} onClick={() => void completeContract()}>Complete contract</button>}
      </div>

      <section className="panel">
        {tab === 'overview' && (
          <div style={{ padding: 16, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <div><div style={st.label}>Original contract value</div><strong>{`AED ${aed(contract.value)}`}</strong></div>
            <div><div style={st.label}>Current contractual value</div><strong>{`AED ${aed(contract.value)}`}</strong><div style={st.notes}>Approved variation effect is shown in the canonical Variations workspace.</div></div>
            <div><div style={st.label}>Certified</div><strong>{certSummary ? `AED ${aed(certSummary.grossCertifiedToDate)}` : 'Unavailable'}</strong></div>
            <div><div style={st.label}>Billed / received</div><strong>Unavailable</strong><div style={st.notes}>No authoritative receipt projection is available for this contract.</div></div>
            <div><div style={st.label}>Project</div><strong>{project?.title ?? 'Not activated'}</strong></div>
            <div><div style={st.label}>Commercial source</div><strong>{quotation?.quoteNumber ?? (contract.tenderTitle ?? 'Direct award')}</strong></div>
          </div>
        )}

        {tab === 'approvals' && (
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            <div style={st.libraryPicker}><strong>Revision and amendment approvals</strong><div style={st.notes}>Approval decisions use the canonical access/matrix authority. Authors cannot approve their own submission; signed records are frozen.</div></div>
            {revisions.map((r) => { const approval = approvals[`revision:${r.id}`]; return <article key={r.id} style={st.revision}><strong>Revision R{r.revisionNumber}</strong><span className="badge" style={{ marginLeft: 8 }}>{r.status.replace('_',' ')}</span><div style={st.notes}>{approval?.status === 'pending' ? `Pending approval — submitted ${fmt(approval.submittedAt)}.` : r.status === 'negotiation' ? 'Ready to submit for approval from Agreement.' : r.status === 'approved' ? `Approved by ${r.approvedBy ?? 'authoritative approver'} — ready to sign.` : r.status === 'signed' ? 'Signed and immutable.' : 'Approval action follows the revision state.'}</div>{approval?.status === 'pending' && <button className="btn btn-primary" style={st.smBtn} disabled={busy} onClick={() => void decideApproval('revision', r.id, 'approved')}>Approve</button>}</article>; })}
            {amendments.map((a) => { const approval = approvals[`amendment:${a.id}`]; return <article key={a.id} style={st.revision}><strong>Amendment A{a.amendmentNumber}</strong><span className="badge" style={{ marginLeft: 8 }}>{a.status}</span><div style={st.notes}>{approval?.status === 'pending' ? `Pending approval — submitted ${fmt(approval.submittedAt)}.` : a.status === 'review' ? 'Ready to submit for approval from Amendments.' : a.status === 'signed' ? 'Signed and immutable.' : 'Approval action follows the amendment state.'}</div>{approval?.status === 'pending' && <button className="btn btn-primary" style={st.smBtn} disabled={busy} onClick={() => void decideApproval('amendment', a.id, 'approved')}>Approve</button>}</article>; })}
            {revisions.length===0 && amendments.length===0 && <p style={st.muted}>No approval items are currently pending.</p>}
          </div>
        )}

        {tab === 'agreement' && (
          revisions.length === 0 ? <p style={st.muted}>No contract-specific revision exists yet. Create the first draft before review or negotiation.</p> : (
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              {revisions.map((r) => (
                <article key={r.id} style={st.revision}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div><strong>Revision R{r.revisionNumber}</strong><span className="badge" style={{ marginLeft: 8 }}>{r.status.replace('_', ' ')}</span><div style={st.notes}>{r.revisionReason ?? 'No reason recorded'} · {fmt(r.createdAt)}</div></div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {r.status === 'draft' && <button className="btn" style={st.smBtn} disabled={busy} onClick={() => void transitionRevision(r, 'internal_review')}>Send for review</button>}
                      {r.status === 'internal_review' && <button className="btn" style={st.smBtn} disabled={busy} onClick={() => void transitionRevision(r, 'negotiation')}>Start negotiation</button>}
                      {r.status === 'negotiation' && <button className="btn" style={st.smBtn} disabled={busy} onClick={async()=>{setBusy(true);setErr('');try{const res=await fetch(`/api/contracts/contracts/${contract.id}/revisions/${r.id}/submit-approval`,{method:'POST'});const d=await res.json().catch(()=>({}));if(!res.ok){setErr(d.message??d.error??'Unable to submit approval');return;}setMsg('Revision submitted for approval.');await load();}finally{setBusy(false);}}}>Submit for approval</button>}
                      {approvals[`revision:${r.id}`]?.status === 'pending' && <span style={st.notes}>Pending canonical approval</span>}
                      {r.status === 'approved' && <button className="btn btn-primary" style={st.smBtn} disabled={busy} onClick={() => void transitionRevision(r, 'signed')}>Sign revision</button>}
                    </div>
                  </div>
                  {Object.keys(r.terms).length > 0 && <div style={st.termGrid}>{Object.entries(r.terms).map(([k, v]) => <div key={k}><span style={st.termKey}>{k}</span><span>{String(v)}</span></div>)}</div>}
                  {r.clauses.length > 0 && <div style={{ marginTop: 10 }}>{r.clauses.map((c) => <div key={c.id} style={st.clause}><strong>{c.title || c.code}</strong><span>{c.body}</span></div>)}</div>}
                </article>
              ))}
              {revisions.length > 1 && <RevisionCompare revisions={revisions} />}
              {libraryClauses.length > 0 && contract.status === 'draft' && (
                <div style={st.libraryPicker}>
                  <strong>Add reusable clauses to the next draft revision</strong>
                  <div style={st.notes}>Clauses are copied as snapshots; later library edits cannot rewrite a revision.</div>
                  {libraryClauses.map((c) => <label key={c.id} style={st.checkRow}><input type="checkbox" checked={selectedClauseIds.includes(c.id)} onChange={(e) => setSelectedClauseIds((current) => e.target.checked ? [...current, c.id] : current.filter((id) => id !== c.id))} /><span><strong>{c.code} — {c.title}</strong><small style={{ display: 'block', color: 'var(--muted)' }}>{c.category} · library revision {c.revision}</small></span></label>)}
                </div>
              )}
              <div style={st.libraryPicker}>
                <strong>Prepare client version</strong>
                <div style={st.notes}>Only the selected revision snapshot is shared; internal negotiation and audit data are not included.</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <input value={shareRecipient} onChange={(e)=>setShareRecipient(e.target.value)} placeholder="Recipient email or controlled link label" />
                  <select value={shareMethod} onChange={(e)=>setShareMethod(e.target.value as ClientShare['method'])}><option value="download">Download</option><option value="email">Email dispatch</option><option value="link">Controlled link</option></select>
                  <button className="btn btn-primary" style={st.smBtn} disabled={busy || revisions.length===0} onClick={()=>void prepareClientShare()}>Prepare</button>
                </div>
                {shares.length > 0 && <div style={{ display:'grid', gap:5, marginTop:8 }}>{shares.map((s)=><div key={s.id} style={st.notes}>{s.recipient} · {s.method} · {s.state} · {fmt(s.sharedAt)} {s.state==='prepared' && <button className="btn" style={st.smBtn} disabled={busy} onClick={()=>void dispatchShare(s)}>Dispatch</button>}</div>)}</div>}
                {shares.length===0 && <div style={st.notes}>No client share history.</div>}
              </div>
            </div>
          )
        )}

        {tab === 'negotiation' && (
          <div style={{ padding: 16, display: 'grid', gap: 14 }}>
            <div style={st.libraryPicker}>
              <strong>Record negotiation activity</strong>
              <div style={st.notes}>Negotiation is pre-sign only. Internal notes never belong in a client version.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={negotiationType} onChange={(e) => setNegotiationType(e.target.value as 'comment'|'change_request')}><option value="comment">Comment</option><option value="change_request">Change request</option></select>
                <select value={negotiationVisibility} onChange={(e) => setNegotiationVisibility(e.target.value as 'internal'|'client_visible')}><option value="internal">Internal</option><option value="client_visible">Client-visible</option></select>
              </div>
              <textarea value={negotiationContent} onChange={(e) => setNegotiationContent(e.target.value)} placeholder="Describe the comment or requested change" rows={3} />
              <button className="btn btn-primary" style={st.smBtn} disabled={busy || revisions.length === 0} onClick={() => void addNegotiationItem()}>Add to current revision</button>
            </div>
            {negotiation.length === 0 ? <p style={st.muted}>No negotiation items recorded.</p> : <div style={{ display: 'grid', gap: 8 }}>{negotiation.map((n) => <article key={n.id} style={st.revision}><div><strong>{n.type === 'change_request' ? 'Change request' : 'Comment'}</strong><span className="badge" style={{ marginLeft: 8 }}>{n.visibility === 'client_visible' ? 'Client-visible' : 'Internal'}</span><span className="badge" style={{ marginLeft: 8 }}>{n.status}</span></div><p style={{ margin: '8px 0' }}>{n.content}</p>{n.resolution && <div style={st.notes}>Resolution: {n.resolution}</div>}{n.status === 'open' && <div style={{ display: 'flex', gap: 6 }}><button className="btn" style={st.smBtn} disabled={busy} onClick={() => void resolveNegotiationItem(n, 'resolved')}>Resolve</button><button className="btn btn-ghost" style={st.smBtn} disabled={busy} onClick={() => void resolveNegotiationItem(n, 'rejected')}>Reject</button></div>}</article>)}</div>}
          </div>
        )}

        {tab === 'obligations' && (
          obligations.length === 0 ? <p style={st.muted}>No obligations yet — add the contract's deliverables, milestones and compliance items.</p> : (
            <table className="data-table">
              <thead><tr>{['Type', 'Title', 'Responsible', 'Due', 'Status', 'Actions'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {obligations.map((o) => {
                  const overdue = (o.status === 'open' || o.status === 'in_progress') && o.dueDate < today;
                  return (
                    <tr key={o.id} style={o.status === 'waived' ? { opacity: 0.55 } : undefined}>
                      <td><span style={st.typeTag}>{o.obligationType}</span></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.title}</div>
                        {o.description && <div style={st.notes}>{o.description}</div>}
                      </td>
                      <td style={{ textTransform: 'capitalize', color: 'var(--muted)' }}>{o.responsibleParty}</td>
                      <td style={{ color: overdue ? 'var(--bad)' : 'var(--muted)', fontWeight: overdue ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {fmt(o.dueDate)}{overdue ? ' ✗' : ''}
                      </td>
                      <td>
                        <span className={o.status === 'met' ? 'badge badge-good' : o.status === 'breached' ? 'badge badge-bad' : 'badge'}>{o.status.replace('_', ' ')}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {(o.status === 'open' || o.status === 'in_progress') && (
                          <>
                            <button className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} disabled={busy}
                              onClick={() => void act(`/api/contracts/obligations/${o.id}/status`, { status: 'met' })}>Met ✓</button>
                            <button className="btn" style={{ ...st.smBtn, marginLeft: 6, color: 'var(--bad)' }} disabled={busy}
                              onClick={() => void act(`/api/contracts/obligations/${o.id}/status`, { status: 'breached' })}>Breach ✗</button>
                            <button className="btn btn-ghost" style={{ ...st.smBtn, marginLeft: 6 }} disabled={busy}
                              onClick={() => void act(`/api/contracts/obligations/${o.id}/status`, { status: 'waived' })}>Waive</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === 'bonds' && (
          bonds.length === 0 ? <p style={st.muted}>No bonds registered — add the performance bond and advance-payment guarantee.</p> : (
            <table className="data-table">
              <thead><tr>{['Kind', 'Reference', 'Bank', 'Amount', 'Issued', 'Expiry', 'Status', 'Actions'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {bonds.map((b) => {
                  const expSoon = b.status === 'active' && b.expiryDate && b.expiryDate <= soon && b.expiryDate >= today;
                  const expPast = b.status === 'active' && b.expiryDate && b.expiryDate < today;
                  return (
                    <tr key={b.id} style={b.status !== 'active' ? { opacity: 0.6 } : undefined}>
                      <td>{BOND_KIND_LABEL[b.kind] ?? b.kind}</td>
                      <td style={{ fontFamily: 'ui-monospace, monospace' }}>{b.reference}</td>
                      <td style={{ color: 'var(--muted)' }}>{b.bank ?? '—'}</td>
                      <td style={{ fontWeight: 600 }}>AED {aed(b.amount)}</td>
                      <td style={{ color: 'var(--muted)' }}>{b.issueDate ?? '—'}</td>
                      <td style={{ color: expPast ? 'var(--bad)' : expSoon ? 'var(--warn, var(--warn))' : 'var(--muted)', fontWeight: expPast || expSoon ? 700 : 400 }}>
                        {b.expiryDate ?? '—'}{expSoon ? ' ⚠' : ''}{expPast ? ' ✗' : ''}
                      </td>
                      <td><span className={b.status === 'active' ? 'badge badge-good' : b.status === 'called' ? 'badge badge-bad' : 'badge'}>{b.status}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {b.status === 'active' && (
                          <>
                            <button className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} disabled={busy}
                              onClick={() => void act(`/api/contracts/bonds/${b.id}/status`, { action: 'release' }, `${b.reference} released.`)}>Release</button>
                            <button className="btn" style={{ ...st.smBtn, marginLeft: 6, color: 'var(--bad)' }} disabled={busy}
                              onClick={() => void act(`/api/contracts/bonds/${b.id}/status`, { action: 'call' })}>Called</button>
                            <button className="btn btn-ghost" style={{ ...st.smBtn, marginLeft: 6 }} disabled={busy}
                              onClick={() => void act(`/api/contracts/bonds/${b.id}/status`, { action: 'expire' })}>Expired</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === 'certificates' && (
          certs.length === 0 ? <p style={st.muted}>No payment certificates yet — raise IPC 1 from the certificates register.</p> : (
            <table className="data-table">
              <thead><tr>{['IPC', 'Reference', 'Gross to date', 'Net this cert.', 'Status', 'Raised'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {certs.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>#{c.sequence}</td>
                    <td style={{ fontFamily: 'ui-monospace, monospace' }}>{c.reference ?? '—'}</td>
                    <td>AED {aed(c.grossToDate)}</td>
                    <td style={{ fontWeight: 600 }}>AED {aed(c.netThisCertificate)}</td>
                    <td><span className={c.status === 'certified' || c.status === 'paid' ? 'badge badge-good' : 'badge'}>{c.status}</span></td>
                    <td style={{ color: 'var(--muted)' }}>{fmt(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === 'documents' && (
          <div style={{ padding: 16, display: 'grid', gap: 14 }}>
            <div style={st.libraryPicker}><strong>Associate a contract document</strong><div style={st.notes}>Uses the canonical Document Control store; no second attachment table is created.</div><div style={{ display:'flex', gap:8, flexWrap:'wrap' }}><input value={documentTitle} onChange={(e)=>setDocumentTitle(e.target.value)} placeholder="Document title" /><select value={documentKind} onChange={(e)=>setDocumentKind(e.target.value)}><option value="contract">Contract</option><option value="appendix">Appendix</option><option value="correspondence">Correspondence</option><option value="amendment">Amendment</option></select></div><textarea value={documentContent} onChange={(e)=>setDocumentContent(e.target.value)} placeholder="Controlled text content or document note" rows={3} /><button className="btn btn-primary" style={st.smBtn} disabled={busy} onClick={()=>void createContractDocument()}>Associate document</button></div>
            {documents.length === 0 ? <div><p style={st.muted}>No documents are currently associated with this contract.</p><p style={st.notes}>Document Control remains the authoritative document store.</p></div> : <table className="data-table"><thead><tr>{['Document', 'Type', 'Revision', 'Opened'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{documents.map((d) => <tr key={d.id}><td><a href={`/doccontrol/register/${d.id}`} style={st.link}>{d.title}</a></td><td>{d.kind}</td><td>{d.currentVersion ?? '—'}</td><td style={{ color: 'var(--muted)' }}>{d.createdAt ? fmt(d.createdAt) : '—'}</td></tr>)}</tbody></table>}
          </div>
        )}

        {tab === 'variations' && (
          <div style={{ padding: 16 }}><p style={st.muted}>Variation authority remains in Project Delivery / C6.</p><p style={st.notes}>This Contract view intentionally does not create or approve variations. Open the canonical workspace to review pending, approved and rejected changes.</p></div>
        )}

        {tab === 'history' && (
          history.length === 0
            ? <div style={{ padding: 16 }}><p style={st.muted}>No contract-specific audit entries are available.</p><p style={st.notes}>Only authoritative audit records are shown; missing history is not replaced with fabricated events.</p></div>
            : <ol style={st.timeline}>{history.map((h) => <li key={h.id} style={st.timelineRow}><span style={st.timelineDot} /><div><strong>{h.action}</strong><div style={st.notes}>{h.entity_type ?? 'contract'} · {h.actor_id ?? 'system'} · {fmt(h.created_at)}</div></div></li>)}</ol>
        )}

        {tab === 'amendments' && (
          <div style={{ padding: 16, display:'grid', gap:14 }}>
            <div style={st.libraryPicker}><strong>Formal amendment</strong><div style={st.notes}>Amendments require a signed base revision. The original signed revision remains immutable; C6 variations are optional references, not automatic amendments.</div><input value={amendmentTitle} onChange={(e)=>setAmendmentTitle(e.target.value)} placeholder="Amendment title" /><textarea value={amendmentContent} onChange={(e)=>setAmendmentContent(e.target.value)} placeholder="Describe the contractual modification" rows={3} /><button className="btn btn-primary" style={st.smBtn} disabled={busy || !revisions.some((r)=>r.status==='signed')} onClick={()=>void createAmendment()}>Create amendment draft</button></div>
            {amendments.length===0 ? <p style={st.muted}>No amendments recorded.</p> : amendments.map((a)=><article key={a.id} style={st.revision}><div><strong>Amendment A{a.amendmentNumber} — {a.title}</strong><span className="badge" style={{marginLeft:8}}>{a.status}</span></div><p>{a.content}</p><div style={{display:'flex',gap:6}}>{a.status==='draft'&&<button className="btn" style={st.smBtn} disabled={busy} onClick={()=>void transitionAmendment(a,'review')}>Submit review</button>}{a.status==='review'&&<button className="btn" style={st.smBtn} disabled={busy} onClick={async()=>{setBusy(true);setErr('');try{const res=await fetch(`/api/contracts/contracts/${contract.id}/amendments/${a.id}/submit-approval`,{method:'POST'});const d=await res.json().catch(()=>({}));if(!res.ok){setErr(d.message??d.error??'Unable to submit approval');return;}setMsg('Amendment submitted for approval.');await load();}finally{setBusy(false);}}}>Submit for approval</button>}{a.status==='approved'&&<button className="btn btn-primary" style={st.smBtn} disabled={busy} onClick={()=>void transitionAmendment(a,'signed')}>Sign</button>}</div></article>)}
          </div>
        )}

        {tab === 'closeout' && (
          <div style={{ padding: 16, display: 'grid', gap: 14 }}>
            <div style={st.libraryPicker}>
              <strong>Closeout readiness</strong>
              <div style={st.notes}>Review authoritative open contractual items before using the governed terminal command.</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>{obligations.filter((o) => o.status === 'open' || o.status === 'in_progress').length} open obligations</li>
                <li>{bonds.filter((b) => b.status === 'active').length} active/unreleased bonds</li>
                <li>{amendments.filter((a) => ['draft', 'review'].includes(a.status)).length} open amendments</li>
              </ul>
              {contract.status === 'active' ? <p style={st.notes}>These items are warnings unless a separate domain rule marks them blocking. Completion is recorded by the Contract lifecycle authority.</p> : <p style={st.notes}>This contract is already {contract.status}; terminal actions are unavailable.</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function RevisionCompare({ revisions }: { revisions: ContractRevision[] }) {
  const previous = revisions[revisions.length - 2];
  const current = revisions[revisions.length - 1];
  const keys = [...new Set([...Object.keys(previous.terms), ...Object.keys(current.terms)])];
  const changed = keys.filter((key) => JSON.stringify(previous.terms[key]) !== JSON.stringify(current.terms[key]));
  return <div style={st.compare}><strong>R{previous.revisionNumber} → R{current.revisionNumber} comparison</strong>{changed.length === 0 ? <div style={st.notes}>No structured term changes recorded.</div> : changed.map((key) => <div key={key} style={st.compareRow}><span>{key}</span><span>{String(previous.terms[key] ?? '—')}</span><span>→</span><strong>{String(current.terms[key] ?? '—')}</strong></div>)}</div>;
}

function Stat({ label, value, strong, accent, bad }: { label: string; value: string; strong?: boolean; accent?: boolean; bad?: boolean }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: strong ? 16 : 13.5, fontWeight: strong ? 800 : 600, color: bad ? 'var(--bad)' : accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
    </div>
  );
}

const st = {
  err: { padding: '10px 12px', border: '1px solid var(--bad)', borderRadius: 10, color: 'var(--bad)', marginBottom: 12, fontSize: 13 } as CSSProperties,
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, color: 'var(--good)', marginBottom: 12, fontSize: 13 } as CSSProperties,
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 } as CSSProperties,
  h1: { fontSize: 24, margin: 0, color: 'var(--accent)' } as CSSProperties,
  subline: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)', marginTop: 6, alignItems: 'center' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  actBtn: { padding: '8px 14px', fontSize: 12.5, fontWeight: 700 } as CSSProperties,
  linkBtn: { border: '1px solid var(--border)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap' } as CSSProperties,
  stats: { display: 'flex', gap: 22, flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', marginBottom: 12 } as CSSProperties,
  chain: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 16px', border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 14, fontSize: 12.5 } as CSSProperties,
  chainNode: { border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', color: 'var(--muted)', textDecoration: 'none' } as CSSProperties,
  chainOn: { color: 'var(--text)', borderColor: 'var(--accent)' } as CSSProperties,
  arrow: { color: 'var(--muted)' } as CSSProperties,
  tabs: { display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 } as CSSProperties,
  tab: { border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 9, cursor: 'pointer' } as CSSProperties,
  tabOn: { color: 'var(--accent)', borderColor: 'var(--accent)', fontWeight: 700 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  label: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 4 } as CSSProperties,
  revision: { border: '1px solid var(--border)', borderRadius: 10, padding: 13, background: 'var(--panel)' } as CSSProperties,
  termGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' } as CSSProperties,
  termKey: { color: 'var(--muted)', marginRight: 6, textTransform: 'capitalize' } as CSSProperties,
  clause: { display: 'grid', gap: 3, padding: '8px 10px', borderLeft: '3px solid var(--accent)', background: 'var(--panel-2)', marginTop: 6, fontSize: 12.5 } as CSSProperties,
  libraryPicker: { display: 'grid', gap: 8, border: '1px dashed var(--accent)', borderRadius: 10, padding: 12, marginTop: 4 } as CSSProperties,
  checkRow: { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, padding: '6px 0', borderTop: '1px solid var(--border)' } as CSSProperties,
  compare: { display: 'grid', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginTop: 4 } as CSSProperties,
  compareRow: { display: 'grid', gridTemplateColumns: '1fr 1fr auto 1fr', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  typeTag: { fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', textTransform: 'capitalize' } as CSSProperties,
  notes: { fontSize: 12, color: 'var(--muted)', marginTop: 2, maxWidth: 460 } as CSSProperties,
  smBtn: { padding: '4px 10px', fontSize: 12 } as CSSProperties,
  timeline: { listStyle: 'none', margin: 0, padding: 16, display: 'grid', gap: 2 } as CSSProperties,
  timelineRow: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)' } as CSSProperties,
  timelineDot: { width: 8, height: 8, borderRadius: 999, background: 'var(--accent)', marginTop: 5, flex: '0 0 auto' } as CSSProperties,
};
