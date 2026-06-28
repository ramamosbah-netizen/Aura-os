'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';

interface Project {
  id: string;
  title: string;
}

interface Transmittal {
  id: string;
  tenantId: string;
  companyId: string | null;
  code: string;
  title: string;
  projectId: string;
  projectName: string | null;
  sender: string | null;
  recipient: string | null;
  status: 'draft' | 'sent' | 'received' | 'acknowledged';
  ownerId: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface Correspondence {
  id: string;
  tenantId: string;
  companyId: string | null;
  code: string;
  subject: string;
  projectId: string;
  projectName: string | null;
  direction: 'inbound' | 'outbound';
  sender: string | null;
  recipient: string | null;
  status: 'logged' | 'pending_review' | 'closed';
  ownerId: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface Props {
  initialTransmittals: Transmittal[];
  initialCorrespondence: Correspondence[];
  projects: Project[];
}

export default function DocControlClient({
  initialTransmittals,
  initialCorrespondence,
  projects,
}: Props) {
  const [activeTab, setActiveTab] = useState<'transmittals' | 'correspondence'>('transmittals');
  const [transmittals, setTransmittals] = useState<Transmittal[]>(initialTransmittals);
  const [correspondence, setCorrespondence] = useState<Correspondence[]>(initialCorrespondence);

  // Form states
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');
  const [transCode, setTransCode] = useState('');
  const [transTitle, setTransTitle] = useState('');
  const [transSender, setTransSender] = useState('');
  const [transRecipient, setTransRecipient] = useState('');

  const [corrCode, setCorrCode] = useState('');
  const [corrSubject, setCorrSubject] = useState('');
  const [corrDirection, setCorrDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [corrSender, setCorrSender] = useState('');
  const [corrRecipient, setCorrRecipient] = useState('');

  const [error, setError] = useState<string | null>(null);

  const selectedProjName = projects.find((p) => p.id === selectedProjectId)?.title || null;

  const handleCreateTransmittal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transCode.trim() || !transTitle.trim()) return;

    setError(null);
    try {
      const res = await fetch('/api/doccontrol/transmittals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          code: transCode,
          title: transTitle,
          sender: transSender || undefined,
          recipient: transRecipient || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newT = await res.json();
      setTransmittals([newT, ...transmittals]);
      setTransCode('');
      setTransTitle('');
      setTransSender('');
      setTransRecipient('');
    } catch (err: any) {
      setError(err.message || 'Failed to create transmittal');
    }
  };

  const handleAcknowledgeTransmittal = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/doccontrol/transmittals/${id}/acknowledge`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setTransmittals(transmittals.map((t) => (t.id === id ? updated : t)));
    } catch (err: any) {
      setError(err.message || 'Failed to acknowledge transmittal');
    }
  };

  const handleCreateCorrespondence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!corrCode.trim() || !corrSubject.trim()) return;

    setError(null);
    try {
      const res = await fetch('/api/doccontrol/correspondence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          code: corrCode,
          subject: corrSubject,
          direction: corrDirection,
          sender: corrSender || undefined,
          recipient: corrRecipient || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newC = await res.json();
      setCorrespondence([newC, ...correspondence]);
      setCorrCode('');
      setCorrSubject('');
      setCorrSender('');
      setCorrRecipient('');
    } catch (err: any) {
      setError(err.message || 'Failed to log correspondence');
    }
  };

  const handleCloseCorrespondence = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/doccontrol/correspondence/${id}/close`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setCorrespondence(correspondence.map((c) => (c.id === id ? updated : c)));
    } catch (err: any) {
      setError(err.message || 'Failed to close correspondence');
    }
  };

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      {/* Tabs */}
      <div style={st.tabs}>
        <button
          onClick={() => setActiveTab('transmittals')}
          style={activeTab === 'transmittals' ? st.activeTabBtn : st.tabBtn}
        >
          Transmittals Log
        </button>
        <button
          onClick={() => setActiveTab('correspondence')}
          style={activeTab === 'correspondence' ? st.activeTabBtn : st.tabBtn}
        >
          Correspondence Log
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'transmittals' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleCreateTransmittal} style={st.formCard}>
            <h3 style={st.formTitle}>Issue New Transmittal</h3>
            <div style={st.formGrid}>
              <div style={st.field}>
                <label style={st.label}>Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  style={st.select}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Transmittal Code</label>
                <input
                  type="text"
                  placeholder="e.g. TRA-ARC-001"
                  value={transCode}
                  onChange={(e) => setTransCode(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Subject / Title</label>
                <input
                  type="text"
                  placeholder="e.g. Issued for Construction Package"
                  value={transTitle}
                  onChange={(e) => setTransTitle(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Sender (Company/Person)</label>
                <input
                  type="text"
                  placeholder="e.g. Aura Contractor Inc."
                  value={transSender}
                  onChange={(e) => setTransSender(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Recipient (Company/Person)</label>
                <input
                  type="text"
                  placeholder="e.g. Lead Architect Consultant"
                  value={transRecipient}
                  onChange={(e) => setTransRecipient(e.target.value)}
                  style={st.input}
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Dispatch & Send Transmittal</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Sent & Received Transmittals</h3>
            {transmittals.length === 0 ? (
              <p style={st.muted}>No transmittals logged yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Code', 'Title', 'Project', 'Sender', 'Recipient', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transmittals.map((t) => (
                    <tr key={t.id}>
                      <td style={st.tdCode}>{t.code}</td>
                      <td style={st.td}>{t.title}</td>
                      <td style={st.tdMuted}>{t.projectName || '—'}</td>
                      <td style={st.tdMuted}>{t.sender || '—'}</td>
                      <td style={st.tdMuted}>{t.recipient || '—'}</td>
                      <td style={st.td}>
                        <span style={t.status === 'acknowledged' ? st.tagApproved : st.tagPending}>
                          {t.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {t.status !== 'acknowledged' && (
                          <button
                            onClick={() => handleAcknowledgeTransmittal(t.id)}
                            style={st.btnApprove}
                          >
                            Acknowledge
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {activeTab === 'correspondence' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleCreateCorrespondence} style={st.formCard}>
            <h3 style={st.formTitle}>Log Formal Correspondence</h3>
            <div style={st.formGrid}>
              <div style={st.field}>
                <label style={st.label}>Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  style={st.select}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Correspondence Code</label>
                <input
                  type="text"
                  placeholder="e.g. COR-IN-002"
                  value={corrCode}
                  onChange={(e) => setCorrCode(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Delay notice response"
                  value={corrSubject}
                  onChange={(e) => setCorrSubject(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Direction</label>
                <select
                  value={corrDirection}
                  onChange={(e) => setCorrDirection(e.target.value as any)}
                  style={st.select}
                >
                  <option value="inbound">Inbound (Received)</option>
                  <option value="outbound">Outbound (Sent)</option>
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Sender</label>
                <input
                  type="text"
                  placeholder="e.g. Subcontractor / Client"
                  value={corrSender}
                  onChange={(e) => setCorrSender(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Recipient</label>
                <input
                  type="text"
                  placeholder="e.g. Aura PM"
                  value={corrRecipient}
                  onChange={(e) => setCorrRecipient(e.target.value)}
                  style={st.input}
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Log Communication Entry</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Logged Correspondence</h3>
            {correspondence.length === 0 ? (
              <p style={st.muted}>No correspondence logged yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Code', 'Subject', 'Project', 'Direction', 'Sender', 'Recipient', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {correspondence.map((c) => (
                    <tr key={c.id}>
                      <td style={st.tdCode}>{c.code}</td>
                      <td style={st.td}>{c.subject}</td>
                      <td style={st.tdMuted}>{c.projectName || '—'}</td>
                      <td style={st.td}>
                        <span style={c.direction === 'inbound' ? st.tagInbound : st.tagOutbound}>
                          {c.direction}
                        </span>
                      </td>
                      <td style={st.tdMuted}>{c.sender || '—'}</td>
                      <td style={st.tdMuted}>{c.recipient || '—'}</td>
                      <td style={st.td}>
                        <span style={c.status === 'closed' ? st.tagApproved : st.tagPending}>
                          {c.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {c.status !== 'closed' && (
                          <button
                            onClick={() => handleCloseCorrespondence(c.id)}
                            style={st.btnApprove}
                          >
                            Close Entry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const st = {
  tabs: { display: 'flex', gap: 8, margin: '0 0 24px' } as CSSProperties,
  tabBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: 14,
    transition: 'all 0.2s',
  } as CSSProperties,
  activeTabBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid var(--accent)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
  } as CSSProperties,
  formCard: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 20,
    margin: '0 0 24px',
  } as CSSProperties,
  formTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 600 } as CSSProperties,
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)', fontWeight: 500 } as CSSProperties,
  input: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--panel-2)',
    color: '#fff',
    fontSize: 13.5,
  } as CSSProperties,
  select: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--panel-2)',
    color: '#fff',
    fontSize: 13.5,
    cursor: 'pointer',
  } as CSSProperties,
  btn: {
    padding: '9px 16px',
    borderRadius: 8,
    background: '#fff',
    color: '#000',
    border: 'none',
    fontWeight: 600,
    fontSize: 13.5,
    cursor: 'pointer',
    marginTop: 16,
  } as CSSProperties,
  btnApprove: {
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(52, 211, 153, 0.1)',
    color: '#34d399',
    border: '1px solid rgba(52, 211, 153, 0.2)',
    fontWeight: 600,
    fontSize: 12,
    cursor: 'pointer',
  } as CSSProperties,
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '16px 20px',
  } as CSSProperties,
  panelTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 600 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13.5 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  td: { padding: '11px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdCode: { padding: '11px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'monospace', fontWeight: 600 } as CSSProperties,
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  tagApproved: {
    fontSize: 11,
    background: 'rgba(52, 211, 153, 0.1)',
    color: '#34d399',
    border: '1px solid rgba(52, 211, 153, 0.2)',
    borderRadius: 6,
    padding: '2px 8px',
    fontWeight: 600,
    textTransform: 'capitalize',
  } as CSSProperties,
  tagPending: {
    fontSize: 11,
    background: 'rgba(251, 191, 36, 0.1)',
    color: '#fbbf24',
    border: '1px solid rgba(251, 191, 36, 0.2)',
    borderRadius: 6,
    padding: '2px 8px',
    fontWeight: 600,
    textTransform: 'capitalize',
  } as CSSProperties,
  tagInbound: {
    fontSize: 11,
    background: 'rgba(56, 189, 248, 0.1)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.2)',
    borderRadius: 6,
    padding: '2px 8px',
    fontWeight: 600,
    textTransform: 'capitalize',
  } as CSSProperties,
  tagOutbound: {
    fontSize: 11,
    background: 'rgba(168, 85, 247, 0.1)',
    color: '#a855f7',
    border: '1px solid rgba(168, 85, 247, 0.2)',
    borderRadius: 6,
    padding: '2px 8px',
    fontWeight: 600,
    textTransform: 'capitalize',
  } as CSSProperties,
  errorPanel: {
    background: 'rgba(248, 113, 113, 0.1)',
    color: '#f87171',
    border: '1px solid rgba(248, 113, 113, 0.2)',
    borderRadius: 8,
    padding: '10px 14px',
    margin: '0 0 16px',
    fontSize: 13.5,
  } as CSSProperties,
};
