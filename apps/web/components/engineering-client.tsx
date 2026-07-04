'use client';

import { useState, useTransition } from 'react';
import type { CSSProperties } from 'react';

interface Project {
  id: string;
  title: string;
}

interface Drawing {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  revision: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  createdAt: string;
}

interface Rfi {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  question: string;
  answer: string | null;
  status: 'open' | 'answered' | 'closed';
  createdAt: string;
}

interface Submittal {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  submittalType: 'material' | 'technical' | 'sample' | 'drawing';
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  createdAt: string;
}

interface DesignChange {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  discipline: string;
  changeType: 'addition' | 'omission';
  costImpact: boolean;
  estimatedValue: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  createdAt: string;
}

interface EngineeringDocument {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  docType: string;
  ownerModule: 'engineering' | 'hse';
  discipline: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  revision: string;
  createdAt: string;
}

interface DocTypeMeta {
  docType: string;
  label: string;
  ownerModule: 'engineering' | 'hse';
  formSchemaId: string;
}

const DISCIPLINES = [
  'architectural', 'structural', 'civil', 'mechanical', 'electrical', 'plumbing', 'hvac',
  'fire_fighting', 'fire_alarm', 'elv', 'ict', 'security', 'cctv', 'access_control', 'bms', 'other',
];

type Tab = 'drawings' | 'rfis' | 'submittals' | 'design-changes' | 'documents';

interface Props {
  initialDrawings: Drawing[];
  initialRfis: Rfi[];
  initialSubmittals: Submittal[];
  initialDesignChanges: DesignChange[];
  initialDocuments: EngineeringDocument[];
  docTypes: DocTypeMeta[];
  projects: Project[];
}

export default function EngineeringClient({
  initialDrawings,
  initialRfis,
  initialSubmittals,
  initialDesignChanges,
  initialDocuments,
  docTypes,
  projects,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('drawings');
  const [drawings, setDrawings] = useState<Drawing[]>(initialDrawings);
  const [rfis, setRfis] = useState<Rfi[]>(initialRfis);
  const [submittals, setSubmittals] = useState<Submittal[]>(initialSubmittals);
  const [designChanges, setDesignChanges] = useState<DesignChange[]>(initialDesignChanges);
  const [documents, setDocuments] = useState<EngineeringDocument[]>(initialDocuments);

  // Form states
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');
  const [drawingCode, setDrawingCode] = useState('');
  const [drawingTitle, setDrawingTitle] = useState('');
  const [drawingRev, setDrawingRev] = useState('0');

  const [rfiCode, setRfiCode] = useState('');
  const [rfiTitle, setRfiTitle] = useState('');
  const [rfiQuestion, setRfiQuestion] = useState('');

  const [subCode, setSubCode] = useState('');
  const [subTitle, setSubTitle] = useState('');
  const [subType, setSubType] = useState<'material' | 'technical' | 'sample' | 'drawing'>('technical');

  // Design change form
  const [dcCode, setDcCode] = useState('');
  const [dcTitle, setDcTitle] = useState('');
  const [dcDiscipline, setDcDiscipline] = useState('other');
  const [dcType, setDcType] = useState<'addition' | 'omission'>('addition');
  const [dcCostImpact, setDcCostImpact] = useState(true);
  const [dcValue, setDcValue] = useState('');

  // Document form
  const [docCode, setDocCode] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState(docTypes[0]?.docType || 'method_statement');
  const [docDiscipline, setDocDiscipline] = useState('other');

  // Inline action states
  const [rfiAnswers, setRfiAnswers] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Helper
  const selectedProjName = projects.find((p) => p.id === selectedProjectId)?.title || null;

  const handleCreateDrawing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawingCode.trim() || !drawingTitle.trim()) return;

    setError(null);
    try {
      const res = await fetch('/api/engineering/drawings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          code: drawingCode,
          title: drawingTitle,
          revision: drawingRev,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newD = await res.json();
      setDrawings([newD, ...drawings]);
      setDrawingCode('');
      setDrawingTitle('');
      setDrawingRev('0');
    } catch (err: any) {
      setError(err.message || 'Failed to create drawing');
    }
  };

  const handleApproveDrawing = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/engineering/drawings/${id}/approve`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setDrawings(drawings.map((d) => (d.id === id ? updated : d)));
    } catch (err: any) {
      setError(err.message || 'Failed to approve drawing');
    }
  };

  const handleCreateRfi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfiCode.trim() || !rfiTitle.trim() || !rfiQuestion.trim()) return;

    setError(null);
    try {
      const res = await fetch('/api/engineering/rfis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          code: rfiCode,
          title: rfiTitle,
          question: rfiQuestion,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newR = await res.json();
      setRfis([newR, ...rfis]);
      setRfiCode('');
      setRfiTitle('');
      setRfiQuestion('');
    } catch (err: any) {
      setError(err.message || 'Failed to raise RFI');
    }
  };

  const handleAnswerRfi = async (id: string) => {
    const answer = rfiAnswers[id];
    if (!answer?.trim()) return;

    setError(null);
    try {
      const res = await fetch(`/api/engineering/rfis/${id}/answer`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answer }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setRfis(rfis.map((r) => (r.id === id ? updated : r)));
      setRfiAnswers({ ...rfiAnswers, [id]: '' });
    } catch (err: any) {
      setError(err.message || 'Failed to answer RFI');
    }
  };

  const handleCreateSubmittal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subCode.trim() || !subTitle.trim()) return;

    setError(null);
    try {
      const res = await fetch('/api/engineering/submittals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          code: subCode,
          title: subTitle,
          submittalType: subType,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newS = await res.json();
      setSubmittals([newS, ...submittals]);
      setSubCode('');
      setSubTitle('');
    } catch (err: any) {
      setError(err.message || 'Failed to create submittal');
    }
  };

  const handleUpdateSubmittalStatus = async (id: string, status: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/engineering/submittals/${id}/status`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setSubmittals(submittals.map((s) => (s.id === id ? updated : s)));
    } catch (err: any) {
      setError(err.message || 'Failed to update submittal status');
    }
  };

  const handleCreateDesignChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dcCode.trim() || !dcTitle.trim()) return;
    setError(null);
    try {
      const res = await fetch('/api/engineering/design-changes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId, projectName: selectedProjName,
          code: dcCode, title: dcTitle, discipline: dcDiscipline,
          changeType: dcType, costImpact: dcCostImpact,
          estimatedValue: Number(dcValue) || 0,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      setDesignChanges([created, ...designChanges]);
      setDcCode(''); setDcTitle(''); setDcValue('');
    } catch (err: any) {
      setError(err.message || 'Failed to raise design change');
    }
  };

  const handleDecideDesignChange = async (id: string, status: 'approved' | 'rejected') => {
    setError(null);
    try {
      const res = await fetch(`/api/engineering/design-changes/${id}/decision`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setDesignChanges((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch (err: any) {
      setError(err.message || 'Failed to decide design change');
    }
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docCode.trim() || !docTitle.trim()) return;
    setError(null);
    try {
      const res = await fetch('/api/engineering/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId, projectName: selectedProjName,
          code: docCode, title: docTitle, docType, discipline: docDiscipline,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      setDocuments([created, ...documents]);
      setDocCode(''); setDocTitle('');
    } catch (err: any) {
      setError(err.message || 'Failed to create document');
    }
  };

  const docTypeLabel = (t: string) => docTypes.find((d) => d.docType === t)?.label || t;

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      {/* Tabs */}
      <div style={st.tabs}>
        <button
          onClick={() => setActiveTab('drawings')}
          style={activeTab === 'drawings' ? st.activeTabBtn : st.tabBtn}
        >
          Shop Drawings
        </button>
        <button
          onClick={() => setActiveTab('rfis')}
          style={activeTab === 'rfis' ? st.activeTabBtn : st.tabBtn}
        >
          RFIs
        </button>
        <button
          onClick={() => setActiveTab('submittals')}
          style={activeTab === 'submittals' ? st.activeTabBtn : st.tabBtn}
        >
          Technical Submittals
        </button>
        <button
          onClick={() => setActiveTab('design-changes')}
          style={activeTab === 'design-changes' ? st.activeTabBtn : st.tabBtn}
        >
          Design Changes
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          style={activeTab === 'documents' ? st.activeTabBtn : st.tabBtn}
        >
          Documents
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'drawings' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleCreateDrawing} style={st.formCard}>
            <h3 style={st.formTitle}>Register Shop Drawing</h3>
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
                <label style={st.label}>Drawing Code</label>
                <input
                  type="text"
                  placeholder="e.g. A-101"
                  value={drawingCode}
                  onChange={(e) => setDrawingCode(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Drawing Title</label>
                <input
                  type="text"
                  placeholder="e.g. Architectural Layout"
                  value={drawingTitle}
                  onChange={(e) => setDrawingTitle(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Revision</label>
                <input
                  type="text"
                  placeholder="0"
                  value={drawingRev}
                  onChange={(e) => setDrawingRev(e.target.value)}
                  style={st.input}
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Register Drawing</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Active Drawings</h3>
            {drawings.length === 0 ? (
              <p style={st.muted}>No shop drawings registered yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Code', 'Title', 'Project', 'Revision', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drawings.map((d) => (
                    <tr key={d.id}>
                      <td style={st.tdCode}>{d.code}</td>
                      <td style={st.td}>{d.title}</td>
                      <td style={st.tdMuted}>{d.projectName || '—'}</td>
                      <td style={st.tdMuted}>Rev {d.revision}</td>
                      <td style={st.td}>
                        <span style={d.status === 'approved' ? st.tagApproved : st.tagPending}>
                          {d.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {d.status !== 'approved' && (
                          <button
                            onClick={() => handleApproveDrawing(d.id)}
                            style={st.btnApprove}
                          >
                            Approve
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

      {activeTab === 'rfis' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleCreateRfi} style={st.formCard}>
            <h3 style={st.formTitle}>Raise Request For Information (RFI)</h3>
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
                <label style={st.label}>RFI Code</label>
                <input
                  type="text"
                  placeholder="e.g. RFI-001"
                  value={rfiCode}
                  onChange={(e) => setRfiCode(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Title</label>
                <input
                  type="text"
                  placeholder="e.g. Rebar mismatch"
                  value={rfiTitle}
                  onChange={(e) => setRfiTitle(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
            </div>
            <div style={st.field} className="mt-2">
              <label style={st.label}>Question / Issue Description</label>
              <textarea
                placeholder="Describe the technical query..."
                value={rfiQuestion}
                onChange={(e) => setRfiQuestion(e.target.value)}
                style={st.textarea}
                rows={3}
                required
              />
            </div>
            <button type="submit" style={st.btn} className="mt-3">Raise RFI</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Active RFIs</h3>
            {rfis.length === 0 ? (
              <p style={st.muted}>No RFIs raised yet.</p>
            ) : (
              <div style={st.rfiList}>
                {rfis.map((r) => (
                  <div key={r.id} style={st.rfiCard}>
                    <div style={st.rfiHeader}>
                      <span style={st.rfiCode}>{r.code}</span>
                      <span style={r.status === 'answered' ? st.tagApproved : st.tagPending}>
                        {r.status}
                      </span>
                    </div>
                    <h4 style={st.rfiTitle}>{r.title}</h4>
                    <p style={st.rfiProject}>Project: {r.projectName || '—'}</p>
                    <p style={st.rfiQuestion}><strong>Q:</strong> {r.question}</p>
                    {r.answer ? (
                      <p style={st.rfiAnswer}><strong>A:</strong> {r.answer}</p>
                    ) : (
                      <div style={st.rfiActionRow}>
                        <input
                          type="text"
                          placeholder="Provide clarification / answer..."
                          value={rfiAnswers[r.id] || ''}
                          onChange={(e) =>
                            setRfiAnswers({ ...rfiAnswers, [r.id]: e.target.value })
                          }
                          style={st.inlineInput}
                        />
                        <button
                          onClick={() => handleAnswerRfi(r.id)}
                          style={st.btnSmall}
                        >
                          Submit Answer
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'submittals' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleCreateSubmittal} style={st.formCard}>
            <h3 style={st.formTitle}>New Material / Technical Submittal</h3>
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
                <label style={st.label}>Submittal Code</label>
                <input
                  type="text"
                  placeholder="e.g. SUB-001"
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Title</label>
                <input
                  type="text"
                  placeholder="e.g. Steel rebar certificate"
                  value={subTitle}
                  onChange={(e) => setSubTitle(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Type</label>
                <select
                  value={subType}
                  onChange={(e) => setSubType(e.target.value as any)}
                  style={st.select}
                >
                  <option value="technical">Technical Data Sheet</option>
                  <option value="material">Material Sample / Catalog</option>
                  <option value="sample">Physical Sample</option>
                  <option value="drawing">Drawing Document</option>
                </select>
              </div>
            </div>
            <button type="submit" style={st.btn}>Submit Technical Submittal</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Active Submittals</h3>
            {submittals.length === 0 ? (
              <p style={st.muted}>No submittals registered yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Code', 'Title', 'Project', 'Type', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {submittals.map((s) => (
                    <tr key={s.id}>
                      <td style={st.tdCode}>{s.code}</td>
                      <td style={st.td}>{s.title}</td>
                      <td style={st.tdMuted}>{s.projectName || '—'}</td>
                      <td style={st.tdMuted} className="capitalize">{s.submittalType}</td>
                      <td style={st.td}>
                        <span
                          style={
                            s.status === 'approved'
                              ? st.tagApproved
                              : s.status === 'rejected'
                              ? st.tagRejected
                              : st.tagPending
                          }
                        >
                          {s.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {s.status !== 'approved' && s.status !== 'rejected' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleUpdateSubmittalStatus(s.id, 'approved')}
                              style={st.btnApprove}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleUpdateSubmittalStatus(s.id, 'rejected')}
                              style={st.btnReject}
                            >
                              Reject
                            </button>
                          </div>
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

      {activeTab === 'design-changes' && (
        <div>
          <form onSubmit={handleCreateDesignChange} style={st.formCard}>
            <h3 style={st.formTitle}>Raise Design Change</h3>
            <p style={st.formHint}>
              An approved design change with a cost impact automatically raises a draft commercial
              variation on the project (QS reviews & approves it).
            </p>
            <div style={st.formGrid}>
              <div style={st.field}>
                <label style={st.label}>Project</label>
                <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} style={st.select}>
                  {projects.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Code</label>
                <input type="text" placeholder="e.g. DC-101" value={dcCode} onChange={(e) => setDcCode(e.target.value)} style={st.input} required />
              </div>
              <div style={st.field}>
                <label style={st.label}>Title</label>
                <input type="text" placeholder="e.g. Relocate main DB" value={dcTitle} onChange={(e) => setDcTitle(e.target.value)} style={st.input} required />
              </div>
              <div style={st.field}>
                <label style={st.label}>Discipline</label>
                <select value={dcDiscipline} onChange={(e) => setDcDiscipline(e.target.value)} style={st.select}>
                  {DISCIPLINES.map((d) => (<option key={d} value={d}>{d.replace('_', ' ')}</option>))}
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Change Type</label>
                <select value={dcType} onChange={(e) => setDcType(e.target.value as 'addition' | 'omission')} style={st.select}>
                  <option value="addition">Addition (+value)</option>
                  <option value="omission">Omission (−value)</option>
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Estimated Value</label>
                <input type="number" placeholder="0" value={dcValue} onChange={(e) => setDcValue(e.target.value)} style={st.input} />
              </div>
              <div style={st.field}>
                <label style={st.label}>Cost Impact</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                  <input type="checkbox" checked={dcCostImpact} onChange={(e) => setDcCostImpact(e.target.checked)} />
                  <span style={st.muted}>Raises a variation on approval</span>
                </label>
              </div>
            </div>
            <button type="submit" style={st.btn}>Raise Design Change</button>
          </form>

          <section style={st.panel}>
            <h3 style={st.panelTitle}>Design Changes</h3>
            {designChanges.length === 0 ? (
              <p style={st.muted}>No design changes raised yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>{['Code', 'Title', 'Discipline', 'Type', 'Value', 'Status', 'Actions'].map((h) => (<th key={h} style={st.th}>{h}</th>))}</tr>
                </thead>
                <tbody>
                  {designChanges.map((d) => (
                    <tr key={d.id}>
                      <td style={st.tdCode}>{d.code}</td>
                      <td style={st.td}>{d.title}</td>
                      <td style={st.tdMuted} className="capitalize">{d.discipline.replace('_', ' ')}</td>
                      <td style={st.tdMuted}>{d.changeType}{d.costImpact ? ' · cost' : ''}</td>
                      <td style={st.tdMuted}>{d.estimatedValue ? d.estimatedValue.toLocaleString() : '—'}</td>
                      <td style={st.td}>
                        <span style={d.status === 'approved' ? st.tagApproved : d.status === 'rejected' ? st.tagRejected : st.tagPending}>{d.status}</span>
                      </td>
                      <td style={st.td}>
                        {d.status !== 'approved' && d.status !== 'rejected' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => handleDecideDesignChange(d.id, 'approved')} style={st.btnApprove}>Approve</button>
                            <button onClick={() => handleDecideDesignChange(d.id, 'rejected')} style={st.btnReject}>Reject</button>
                          </div>
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

      {activeTab === 'documents' && (
        <div>
          <form onSubmit={handleCreateDocument} style={st.formCard}>
            <h3 style={st.formTitle}>Create Engineering Document</h3>
            <p style={st.formHint}>
              Method statements, risk assessments, specs, calc sheets, test reports and procedures
              are one document type family — a risk assessment is owned by HSE, the rest by Engineering.
            </p>
            <div style={st.formGrid}>
              <div style={st.field}>
                <label style={st.label}>Project</label>
                <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} style={st.select}>
                  {projects.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Document Type</label>
                <select value={docType} onChange={(e) => setDocType(e.target.value)} style={st.select}>
                  {docTypes.map((t) => (<option key={t.docType} value={t.docType}>{t.label} ({t.ownerModule})</option>))}
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Code</label>
                <input type="text" placeholder="e.g. MS-101" value={docCode} onChange={(e) => setDocCode(e.target.value)} style={st.input} required />
              </div>
              <div style={st.field}>
                <label style={st.label}>Title</label>
                <input type="text" placeholder="e.g. Concrete pour method" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} style={st.input} required />
              </div>
              <div style={st.field}>
                <label style={st.label}>Discipline</label>
                <select value={docDiscipline} onChange={(e) => setDocDiscipline(e.target.value)} style={st.select}>
                  {DISCIPLINES.map((d) => (<option key={d} value={d}>{d.replace('_', ' ')}</option>))}
                </select>
              </div>
            </div>
            <button type="submit" style={st.btn}>Create Document</button>
          </form>

          <section style={st.panel}>
            <h3 style={st.panelTitle}>Controlled Documents</h3>
            {documents.length === 0 ? (
              <p style={st.muted}>No documents created yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>{['Code', 'Title', 'Type', 'Owner', 'Discipline', 'Rev', 'Status'].map((h) => (<th key={h} style={st.th}>{h}</th>))}</tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <td style={st.tdCode}>{d.code}</td>
                      <td style={st.td}>{d.title}</td>
                      <td style={st.tdMuted}>{docTypeLabel(d.docType)}</td>
                      <td style={st.td}>
                        <span style={d.ownerModule === 'hse' ? st.tagHse : st.tagEng}>{d.ownerModule}</span>
                      </td>
                      <td style={st.tdMuted} className="capitalize">{d.discipline.replace('_', ' ')}</td>
                      <td style={st.tdMuted}>Rev {d.revision}</td>
                      <td style={st.td}>
                        <span style={d.status === 'approved' ? st.tagApproved : d.status === 'rejected' ? st.tagRejected : st.tagPending}>{d.status}</span>
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
  textarea: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--panel-2)',
    color: '#fff',
    fontSize: 13.5,
    fontFamily: 'inherit',
    resize: 'vertical',
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
  btnReject: {
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(248, 113, 113, 0.1)',
    color: '#f87171',
    border: '1px solid rgba(248, 113, 113, 0.2)',
    fontWeight: 600,
    fontSize: 12,
    cursor: 'pointer',
  } as CSSProperties,
  btnSmall: {
    padding: '6px 12px',
    borderRadius: 6,
    background: '#fff',
    color: '#000',
    border: 'none',
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
  tagRejected: {
    fontSize: 11,
    background: 'rgba(248, 113, 113, 0.1)',
    color: '#f87171',
    border: '1px solid rgba(248, 113, 113, 0.2)',
    borderRadius: 6,
    padding: '2px 8px',
    fontWeight: 600,
    textTransform: 'capitalize',
  } as CSSProperties,
  tagHse: {
    fontSize: 11,
    background: 'rgba(129, 140, 248, 0.12)',
    color: '#818cf8',
    border: '1px solid rgba(129, 140, 248, 0.25)',
    borderRadius: 6,
    padding: '2px 8px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  } as CSSProperties,
  tagEng: {
    fontSize: 11,
    background: 'rgba(148, 163, 184, 0.12)',
    color: 'var(--muted)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '2px 8px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  } as CSSProperties,
  formHint: { margin: '-8px 0 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 560 } as CSSProperties,
  errorPanel: {
    background: 'rgba(248, 113, 113, 0.1)',
    color: '#f87171',
    border: '1px solid rgba(248, 113, 113, 0.2)',
    borderRadius: 8,
    padding: '10px 14px',
    margin: '0 0 16px',
    fontSize: 13.5,
  } as CSSProperties,
  rfiList: { display: 'flex', flexDirection: 'column', gap: 16 } as CSSProperties,
  rfiCard: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 16,
  } as CSSProperties,
  rfiHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 8px' } as CSSProperties,
  rfiCode: { fontFamily: 'monospace', fontWeight: 600, fontSize: 14 } as CSSProperties,
  rfiTitle: { margin: '0 0 6px', fontSize: 15, fontWeight: 600 } as CSSProperties,
  rfiProject: { fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' } as CSSProperties,
  rfiQuestion: { fontSize: 13.5, margin: '0 0 10px', background: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' } as CSSProperties,
  rfiAnswer: { fontSize: 13.5, margin: 0, background: 'rgba(52,211,153,0.03)', padding: 10, borderRadius: 6, border: '1px solid rgba(52,211,153,0.1)' } as CSSProperties,
  rfiActionRow: { display: 'flex', gap: 10, marginTop: 10 } as CSSProperties,
  inlineInput: {
    flex: 1,
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--panel)',
    color: '#fff',
    fontSize: 13,
  } as CSSProperties,
};
