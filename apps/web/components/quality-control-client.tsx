'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';

interface Project {
  id: string;
  title: string;
}

interface Ncr {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  ncrNumber: string;
  description: string;
  rootCause: string | null;
  proposedCorrection: string | null;
  severity: 'minor' | 'major';
  status: 'raised' | 'corrected' | 'closed';
  raisedBy: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InspectionRequest {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  irNumber: string;
  discipline: 'civil' | 'mechanical' | 'electrical' | 'plumbing';
  locationDetail: string;
  inspectionDate: string;
  status: 'requested' | 'approved' | 'rejected';
  inspectedBy: string | null;
  comments: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Snag {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  description: string;
  locationDetail: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'closed';
  assignedTo: string | null;
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChecklistItem {
  question: string;
  standard: string;
  status: 'pending' | 'compliant' | 'non_compliant' | 'not_applicable';
  findings: string | null;
  ncrId: string | null;
}

interface AuditSchedule {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  auditNumber: string;
  auditType: string;
  scheduledDate: string;
  auditorName: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  checklist: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialNcrs: Ncr[];
  initialInspections: InspectionRequest[];
  initialSnags: Snag[];
  projects: Project[];
  initialAudits: AuditSchedule[];
}

export default function QualityControlClient({
  initialNcrs,
  initialInspections,
  initialSnags,
  projects,
  initialAudits,
}: Props) {
  const [activeTab, setActiveTab] = useState<'ncrs' | 'irs' | 'snags' | 'audits'>('ncrs');
  const [ncrs, setNcrs] = useState<Ncr[]>(initialNcrs);
  const [inspections, setInspections] = useState<InspectionRequest[]>(initialInspections);
  const [snags, setSnags] = useState<Snag[]>(initialSnags);
  const [audits, setAudits] = useState<AuditSchedule[]>(initialAudits);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  // General State
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');
  const [error, setError] = useState<string | null>(null);

  // Audit Form State
  const [auditNumber, setAuditNumber] = useState('');
  const [auditType, setAuditType] = useState('ISO 9001:2015');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [auditorName, setAuditorName] = useState('');

  // NCR Form State
  const [ncrNumber, setNcrNumber] = useState('');
  const [ncrSeverity, setNcrSeverity] = useState<Ncr['severity']>('minor');
  const [ncrDescription, setNcrDescription] = useState('');
  const [ncrRootCause, setNcrRootCause] = useState('');
  const [ncrProposedCorrection, setNcrProposedCorrection] = useState('');
  const [ncrAssignedTo, setNcrAssignedTo] = useState('');

  // IR Form State
  const [irNumber, setIrNumber] = useState('');
  const [irDiscipline, setIrDiscipline] = useState<InspectionRequest['discipline']>('civil');
  const [irLocationDetail, setIrLocationDetail] = useState('');
  const [irInspectionDate, setIrInspectionDate] = useState(new Date().toISOString().split('T')[0]);

  // Snag Form State
  const [snagDescription, setSnagDescription] = useState('');
  const [snagLocationDetail, setSnagLocationDetail] = useState('');
  const [snagSeverity, setSnagSeverity] = useState<Snag['severity']>('low');
  const [snagAssignedTo, setSnagAssignedTo] = useState('');

  // Inline action state (for comments on IR approval/rejection)
  const [commentsInput, setCommentsInput] = useState<{ [id: string]: string }>({});

  const selectedProjName = projects.find((p) => p.id === selectedProjectId)?.title || null;

  const handleScheduleAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditNumber.trim() || !auditType.trim() || !scheduledDate || !auditorName.trim()) return;

    setError(null);
    try {
      const res = await fetch('/api/quality/audits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          auditNumber,
          auditType,
          scheduledDate,
          auditorName,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newAudit = await res.json();
      setAudits([newAudit, ...audits]);
      setAuditNumber('');
      setAuditorName('');
    } catch (err: any) {
      setError(err.message || 'Failed to schedule audit');
    }
  };

  const handleUpdateChecklistStatus = async (
    auditId: string,
    itemIndex: number,
    status: ChecklistItem['status'],
    findings?: string | null,
  ) => {
    const audit = audits.find((a) => a.id === auditId);
    if (!audit) return;

    const newChecklist = audit.checklist.map((item, idx) => {
      if (idx === itemIndex) {
        return {
          ...item,
          status,
          findings: findings !== undefined ? findings : item.findings,
        };
      }
      return item;
    });

    setError(null);
    try {
      const res = await fetch(`/api/quality/audits/${auditId}/checklist`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          checklist: newChecklist,
          status: 'in_progress',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setAudits(audits.map((a) => (a.id === auditId ? updated : a)));
    } catch (err: any) {
      setError(err.message || 'Failed to update checklist item');
    }
  };

  const handleCompleteAudit = async (auditId: string) => {
    const audit = audits.find((a) => a.id === auditId);
    if (!audit) return;
    setError(null);
    try {
      const res = await fetch(`/api/quality/audits/${auditId}/checklist`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          checklist: audit.checklist,
          status: 'completed',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setAudits(audits.map((a) => (a.id === auditId ? updated : a)));
    } catch (err: any) {
      setError(err.message || 'Failed to complete audit');
    }
  };

  const handleGenerateNcr = async (auditId: string, itemIndex: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/quality/audits/${auditId}/checklist/${itemIndex}/ncr`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
      const ncr = await res.json();
      setNcrs([ncr, ...ncrs]);

      const auditRes = await fetch(`/api/quality/audits/${auditId}`);
      if (auditRes.ok) {
        const updatedAudit = await auditRes.json();
        setAudits(audits.map((a) => (a.id === auditId ? updatedAudit : a)));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate NCR ticket');
    }
  };

  const handleRaiseNcr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ncrNumber.trim() || !ncrDescription.trim() || !ncrSeverity) return;

    setError(null);
    try {
      const res = await fetch('/api/quality/ncrs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          ncrNumber: ncrNumber,
          description: ncrDescription,
          rootCause: ncrRootCause || undefined,
          proposedCorrection: ncrProposedCorrection || undefined,
          severity: ncrSeverity,
          assignedTo: ncrAssignedTo || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newNcr = await res.json();
      setNcrs([newNcr, ...ncrs]);
      setNcrNumber('');
      setNcrDescription('');
      setNcrRootCause('');
      setNcrProposedCorrection('');
      setNcrAssignedTo('');
    } catch (err: any) {
      setError(err.message || 'Failed to raise NCR');
    }
  };

  const handleUpdateNcrStatus = async (id: string, status: Ncr['status']) => {
    setError(null);
    try {
      const res = await fetch(`/api/quality/ncrs/${id}/status`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setNcrs(ncrs.map((n) => (n.id === id ? updated : n)));
    } catch (err: any) {
      setError(err.message || 'Failed to update NCR status');
    }
  };

  const handleRequestInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!irNumber.trim() || !irLocationDetail.trim() || !irInspectionDate) return;

    setError(null);
    try {
      const res = await fetch('/api/quality/irs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          irNumber: irNumber,
          discipline: irDiscipline,
          locationDetail: irLocationDetail,
          inspectionDate: irInspectionDate,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newIr = await res.json();
      setInspections([newIr, ...inspections]);
      setIrNumber('');
      setIrLocationDetail('');
    } catch (err: any) {
      setError(err.message || 'Failed to request inspection');
    }
  };

  const handleResolveInspection = async (id: string, status: 'approved' | 'rejected') => {
    setError(null);
    const comments = commentsInput[id] || '';
    try {
      const res = await fetch(`/api/quality/irs/${id}/resolve`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, comments }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setInspections(inspections.map((ir) => (ir.id === id ? updated : ir)));
      setCommentsInput({ ...commentsInput, [id]: '' });
    } catch (err: any) {
      setError(err.message || 'Failed to resolve inspection');
    }
  };

  const handleLogSnag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snagDescription.trim() || !snagLocationDetail.trim() || !snagSeverity) return;

    setError(null);
    try {
      const res = await fetch('/api/quality/snags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          description: snagDescription,
          locationDetail: snagLocationDetail,
          severity: snagSeverity,
          assignedTo: snagAssignedTo || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newSnag = await res.json();
      setSnags([newSnag, ...snags]);
      setSnagDescription('');
      setSnagLocationDetail('');
      setSnagAssignedTo('');
    } catch (err: any) {
      setError(err.message || 'Failed to log snag');
    }
  };

  const handleResolveSnag = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/quality/snags/${id}/resolve`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setSnags(snags.map((s) => (s.id === id ? updated : s)));
    } catch (err: any) {
      setError(err.message || 'Failed to resolve snag');
    }
  };

  const handleCloseSnag = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/quality/snags/${id}/close`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setSnags(snags.map((s) => (s.id === id ? updated : s)));
    } catch (err: any) {
      setError(err.message || 'Failed to close snag');
    }
  };

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      {/* Tabs */}
      <div style={st.tabs}>
        <button
          onClick={() => setActiveTab('ncrs')}
          style={activeTab === 'ncrs' ? st.activeTabBtn : st.tabBtn}
        >
          Non-Conformance Reports (NCR)
        </button>
        <button
          onClick={() => setActiveTab('irs')}
          style={activeTab === 'irs' ? st.activeTabBtn : st.tabBtn}
        >
          Inspection Requests (IR)
        </button>
        <button
          onClick={() => setActiveTab('snags')}
          style={activeTab === 'snags' ? st.activeTabBtn : st.tabBtn}
        >
          Snagging & Punch List
        </button>
        <button
          onClick={() => setActiveTab('audits')}
          style={activeTab === 'audits' ? st.activeTabBtn : st.tabBtn}
        >
          ISO Checklist Audits
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'ncrs' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleRaiseNcr} style={st.formCard}>
            <h3 style={st.formTitle}>Raise Non-Conformance Report (NCR)</h3>
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
                <label style={st.label}>NCR Reference Number</label>
                <input
                  type="text"
                  placeholder="e.g. NCR-CIV-002"
                  value={ncrNumber}
                  onChange={(e) => setNcrNumber(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Severity</label>
                <select
                  value={ncrSeverity}
                  onChange={(e) => setNcrSeverity(e.target.value as any)}
                  style={st.select}
                >
                  <option value="minor">Minor (Workmanship / tolerance issues)</option>
                  <option value="major">Major (Structural deviation / material failure)</option>
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Assigned Engineer</label>
                <input
                  type="text"
                  placeholder="Name of action owner"
                  value={ncrAssignedTo}
                  onChange={(e) => setNcrAssignedTo(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Description of Non-Conformance</label>
                <textarea
                  placeholder="Detail specify deviation, location, reference drawing or test report..."
                  value={ncrDescription}
                  onChange={(e) => setNcrDescription(e.target.value)}
                  style={st.textarea}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Root Cause Analysis (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Poor material mixing, faulty templates"
                  value={ncrRootCause}
                  onChange={(e) => setNcrRootCause(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Proposed Correction (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Demolish and rebuild slab section"
                  value={ncrProposedCorrection}
                  onChange={(e) => setNcrProposedCorrection(e.target.value)}
                  style={st.input}
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Raise NCR</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Active NCR Registry</h3>
            {ncrs.length === 0 ? (
              <p style={st.muted}>No NCR logs recorded yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Ref #', 'Severity', 'Project', 'Description', 'Assigned To', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ncrs.map((n) => (
                    <tr key={n.id}>
                      <td style={st.tdCode}>{n.ncrNumber}</td>
                      <td style={st.td}>
                        <span style={n.severity === 'minor' ? st.tagInbound : st.tagOutbound}>
                          {n.severity}
                        </span>
                      </td>
                      <td style={st.tdMuted}>{n.projectName || '—'}</td>
                      <td style={st.td}>{n.description}</td>
                      <td style={st.tdMuted}>{n.assignedTo || '—'}</td>
                      <td style={st.td}>
                        <span style={n.status === 'closed' ? st.tagApproved : n.status === 'corrected' ? st.tagActive : st.tagPending}>
                          {n.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {n.status === 'raised' && (
                          <button
                            onClick={() => handleUpdateNcrStatus(n.id, 'corrected')}
                            style={st.btnApprove}
                          >
                            Mark Corrected
                          </button>
                        )}
                        {n.status === 'corrected' && (
                          <button
                            onClick={() => handleUpdateNcrStatus(n.id, 'closed')}
                            style={st.btnAction}
                          >
                            Verify & Close
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

      {activeTab === 'irs' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleRequestInspection} style={st.formCard}>
            <h3 style={st.formTitle}>Submit Inspection Request (IR)</h3>
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
                <label style={st.label}>IR Reference Number</label>
                <input
                  type="text"
                  placeholder="e.g. IR-CIV-042"
                  value={irNumber}
                  onChange={(e) => setIrNumber(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Discipline</label>
                <select
                  value={irDiscipline}
                  onChange={(e) => setIrDiscipline(e.target.value as any)}
                  style={st.select}
                >
                  <option value="civil">Civil & Structural</option>
                  <option value="mechanical">Mechanical (HVAC/Plumbing)</option>
                  <option value="electrical">Electrical & ELV</option>
                  <option value="plumbing">Plumbing & Drainage</option>
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Inspection Date</label>
                <input
                  type="date"
                  value={irInspectionDate}
                  onChange={(e) => setIrInspectionDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Location & Scope Details</label>
                <input
                  type="text"
                  placeholder="e.g. Roof deck level, axis grid 4-8. Checking slab rebar spacing..."
                  value={irLocationDetail}
                  onChange={(e) => setIrLocationDetail(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Submit Request</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Inspection Log</h3>
            {inspections.length === 0 ? (
              <p style={st.muted}>No inspection requests logged.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Ref #', 'Discipline', 'Project', 'Inspection Date', 'Location Details', 'Status', 'QA/QC Decision'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((ir) => (
                    <tr key={ir.id}>
                      <td style={st.tdCode}>{ir.irNumber}</td>
                      <td style={st.tdCode}>{ir.discipline}</td>
                      <td style={st.tdMuted}>{ir.projectName || '—'}</td>
                      <td style={st.tdMuted}>{ir.inspectionDate}</td>
                      <td style={st.td}>{ir.locationDetail}</td>
                      <td style={st.td}>
                        <span style={ir.status === 'approved' ? st.tagApproved : ir.status === 'rejected' ? st.tagOutbound : st.tagPending}>
                          {ir.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {ir.status === 'requested' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <input
                              type="text"
                              placeholder="Decision comments..."
                              value={commentsInput[ir.id] || ''}
                              onChange={(e) => setCommentsInput({ ...commentsInput, [ir.id]: e.target.value })}
                              style={st.smallInput}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => handleResolveInspection(ir.id, 'approved')}
                                style={st.btnApprove}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleResolveInspection(ir.id, 'rejected')}
                                style={st.btnReject}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span style={st.muted}>{ir.comments || 'No comments'}</span>
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

      {activeTab === 'snags' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleLogSnag} style={st.formCard}>
            <h3 style={st.formTitle}>Log Punch List Item / Snag</h3>
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
                <label style={st.label}>Severity</label>
                <select
                  value={snagSeverity}
                  onChange={(e) => setSnagSeverity(e.target.value as any)}
                  style={st.select}
                >
                  <option value="low">Low (Aesthetic touch-ups)</option>
                  <option value="medium">Medium (Defective switches, door hinges)</option>
                  <option value="high">High (Water leaks, no power, safety hazard)</option>
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Location Detail</label>
                <input
                  type="text"
                  placeholder="e.g. Unit 302, Master Bedroom Bathroom"
                  value={snagLocationDetail}
                  onChange={(e) => setSnagLocationDetail(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Assigned Subcontractor / Tech</label>
                <input
                  type="text"
                  placeholder="e.g. Apex Plumbing Co."
                  value={snagAssignedTo}
                  onChange={(e) => setSnagAssignedTo(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Description of Defect</label>
                <textarea
                  placeholder="Describe the snag, what needs fixing..."
                  value={snagDescription}
                  onChange={(e) => setSnagDescription(e.target.value)}
                  style={st.textarea}
                  required
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Log Snag</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Snag Registry</h3>
            {snags.length === 0 ? (
              <p style={st.muted}>No active snags logged.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Description', 'Location Details', 'Severity', 'Project', 'Assigned To', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snags.map((s) => (
                    <tr key={s.id}>
                      <td style={st.td}>{s.description}</td>
                      <td style={st.tdMuted}>{s.locationDetail}</td>
                      <td style={st.td}>
                        <span style={s.severity === 'low' ? st.tagInbound : s.severity === 'medium' ? st.tagPending : st.tagOutbound}>
                          {s.severity}
                        </span>
                      </td>
                      <td style={st.tdMuted}>{s.projectName || '—'}</td>
                      <td style={st.tdMuted}>{s.assignedTo || '—'}</td>
                      <td style={st.td}>
                        <span style={s.status === 'closed' ? st.tagApproved : s.status === 'resolved' ? st.tagActive : st.tagPending}>
                          {s.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {s.status === 'open' && (
                          <button
                            onClick={() => handleResolveSnag(s.id)}
                            style={st.btnApprove}
                          >
                            Mark Resolved
                          </button>
                        )}
                        {s.status === 'resolved' && (
                          <button
                            onClick={() => handleCloseSnag(s.id)}
                            style={st.btnAction}
                          >
                            Verify & Close
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

      {activeTab === 'audits' && (
        <div>
          {/* Schedule ISO Audit Form */}
          <form onSubmit={handleScheduleAudit} style={st.formCard}>
            <h3 style={st.formTitle}>Schedule ISO Checklist Audit</h3>
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
                <label style={st.label}>Audit Reference Number</label>
                <input
                  type="text"
                  placeholder="e.g. AUD-9001-002"
                  value={auditNumber}
                  onChange={(e) => setAuditNumber(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Audit Type / Standard</label>
                <select
                  value={auditType}
                  onChange={(e) => setAuditType(e.target.value)}
                  style={st.select}
                >
                  <option value="ISO 9001:2015">ISO 9001:2015 (Quality Management)</option>
                  <option value="ISO 14001:2015">ISO 14001:2015 (Environmental)</option>
                  <option value="ISO 45001:2018">ISO 45001:2018 (Safety Management)</option>
                  <option value="Internal HSE">Internal HSE Checklist</option>
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Scheduled Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Lead Auditor Name</label>
                <input
                  type="text"
                  placeholder="e.g. Johnathan Smith, Quality Lead"
                  value={auditorName}
                  onChange={(e) => setAuditorName(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Schedule Audit</button>
          </form>

          {/* Audits Ledger */}
          <section style={{ ...st.panel, marginBottom: 24 }}>
            <h3 style={st.panelTitle}>Audit Schedules Ledger</h3>
            {audits.length === 0 ? (
              <p style={st.muted}>No scheduled audits recorded yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={st.table}>
                  <thead>
                    <tr>
                      {['Audit #', 'Standard', 'Project', 'Scheduled Date', 'Auditor', 'Status', 'Actions'].map((h) => (
                        <th key={h} style={st.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audits.map((a) => (
                      <tr key={a.id} style={{ background: selectedAuditId === a.id ? 'rgba(255, 255, 255, 0.03)' : 'transparent' }}>
                        <td style={st.tdCode}>{a.auditNumber}</td>
                        <td style={st.tdBold}>{a.auditType}</td>
                        <td style={st.tdMuted}>{a.projectName || '—'}</td>
                        <td style={st.tdMuted}>{a.scheduledDate}</td>
                        <td style={st.td}>{a.auditorName}</td>
                        <td style={st.td}>
                          <span style={
                            a.status === 'completed' ? st.tagApproved :
                            a.status === 'in_progress' ? st.tagActive :
                            a.status === 'cancelled' ? st.tagOutbound : st.tagPending
                          }>
                            {a.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={st.td}>
                          <button
                            onClick={() => setSelectedAuditId(a.id)}
                            style={{ ...st.btnAction, marginRight: 6 }}
                          >
                            Inspect Checklist
                          </button>
                          {a.status !== 'completed' && a.status !== 'cancelled' && (
                            <button
                              onClick={() => handleCompleteAudit(a.id)}
                              style={st.btnApprove}
                            >
                              Complete Audit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Checklist Inspection Section */}
          {selectedAuditId && (() => {
            const audit = audits.find((a) => a.id === selectedAuditId);
            if (!audit) return null;
            return (
              <section style={st.panel}>
                <h3 style={st.panelTitle}>
                  ISO Checklist Verification: {audit.auditNumber} ({audit.auditType})
                </h3>
                <p style={{ ...st.muted, marginBottom: 20 }}>
                  Review standard clauses and log compliance assessments below.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {audit.checklist.map((item, index) => {
                    const matchedNcr = ncrs.find((n) => n.id === item.ncrId);
                    return (
                      <div
                        key={index}
                        style={{
                          background: 'var(--panel-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>
                              {item.standard}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>
                              {item.question}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {(['compliant', 'non_compliant', 'not_applicable'] as const).map((s) => (
                              <button
                                key={s}
                                disabled={audit.status === 'completed'}
                                onClick={() => handleUpdateChecklistStatus(audit.id, index, s)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  border: item.status === s ? '1px solid var(--accent)' : '1px solid var(--border)',
                                  background: item.status === s ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                                  color: item.status === s ? '#38bdf8' : 'var(--muted)',
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                }}
                              >
                                {s.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Findings / Notes */}
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Auditor findings / compliance remarks..."
                            disabled={audit.status === 'completed'}
                            value={item.findings || ''}
                            onChange={(e) => {
                              const newChecklist = audit.checklist.map((c, i) => {
                                if (i === index) return { ...c, findings: e.target.value };
                                return c;
                              });
                              setAudits(audits.map((a) => (a.id === audit.id ? { ...a, checklist: newChecklist } : a)));
                            }}
                            onBlur={(e) => handleUpdateChecklistStatus(audit.id, index, item.status, e.target.value)}
                            style={{ ...st.input, flex: 1, padding: '6px 10px' }}
                          />

                          {/* NCR Linkage */}
                          {item.status === 'non_compliant' && (
                            <div>
                              {item.ncrId ? (
                                <span style={{ ...st.tagOutbound, padding: '6px 12px', fontSize: 12, display: 'inline-block' }}>
                                  NCR Link: {matchedNcr ? matchedNcr.ncrNumber : 'Associated'}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={audit.status === 'completed'}
                                  onClick={() => handleGenerateNcr(audit.id, index)}
                                  style={{ ...st.btnReject, padding: '7px 12px' }}
                                >
                                  🚨 Generate NCR Ticket
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}
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
  smallInput: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--panel-2)',
    color: '#fff',
    fontSize: 12.5,
  } as CSSProperties,
  textarea: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--panel-2)',
    color: '#fff',
    fontSize: 13.5,
    minHeight: 80,
    resize: 'vertical',
    fontFamily: 'inherit',
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
  btnAction: {
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(56, 189, 248, 0.1)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.2)',
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
  tdBold: { padding: '11px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600 } as CSSProperties,
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
  tagActive: {
    fontSize: 11,
    background: 'rgba(56, 189, 248, 0.1)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.2)',
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
