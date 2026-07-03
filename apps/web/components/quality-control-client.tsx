'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';

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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'ncrs' | 'irs' | 'snags' | 'audits'>('ncrs');
  const ncrs = initialNcrs;
  const inspections = initialInspections;
  const snags = initialSnags;
  const audits = initialAudits;
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inline action state (for comments on IR approval/rejection)
  const [commentsInput, setCommentsInput] = useState<{ [id: string]: string }>({});

  const today = new Date().toISOString().split('T')[0];
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.title }));

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
      router.refresh();
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
      router.refresh();
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
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to generate NCR ticket');
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
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to update NCR status');
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
      setCommentsInput({ ...commentsInput, [id]: '' });
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to resolve inspection');
    }
  };

  const handleResolveSnag = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/quality/snags/${id}/resolve`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
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
      router.refresh();
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
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="NCR"
              buttonLabel="Raise NCR"
              subtitle="Raise a non-conformance report. It moves raised → corrected → closed as the deviation is fixed and verified."
              endpoint="/api/quality/ncrs"
              fields={[
                { name: 'projectId', label: 'Project', kind: 'select', required: true, labelField: 'projectName', options: projectOptions, span: 2 },
                { name: 'ncrNumber', label: 'NCR reference number', kind: 'text', required: true, placeholder: 'e.g. NCR-CIV-002' },
                {
                  name: 'severity',
                  label: 'Severity',
                  kind: 'select',
                  defaultValue: 'minor',
                  options: [
                    { value: 'minor', label: 'Minor (Workmanship / tolerance issues)' },
                    { value: 'major', label: 'Major (Structural deviation / material failure)' },
                  ],
                },
                { name: 'assignedTo', label: 'Assigned engineer', kind: 'text', placeholder: 'Name of action owner', span: 2 },
                { name: 'description', label: 'Description of non-conformance', kind: 'textarea', required: true, placeholder: 'Detail the deviation, location, reference drawing or test report…' },
                { name: 'rootCause', label: 'Root cause analysis', kind: 'text', placeholder: 'e.g. Poor material mixing, faulty templates' },
                { name: 'proposedCorrection', label: 'Proposed correction', kind: 'text', placeholder: 'e.g. Demolish and rebuild slab section' },
              ]}
            />
          </div>

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
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Inspection Request"
              buttonLabel="Submit Inspection Request"
              subtitle="Submit an IR for QA/QC sign-off. The inspector approves or rejects it with decision comments."
              endpoint="/api/quality/irs"
              fields={[
                { name: 'projectId', label: 'Project', kind: 'select', required: true, labelField: 'projectName', options: projectOptions, span: 2 },
                { name: 'irNumber', label: 'IR reference number', kind: 'text', required: true, placeholder: 'e.g. IR-CIV-042' },
                {
                  name: 'discipline',
                  label: 'Discipline',
                  kind: 'select',
                  defaultValue: 'civil',
                  options: [
                    { value: 'civil', label: 'Civil & Structural' },
                    { value: 'mechanical', label: 'Mechanical (HVAC/Plumbing)' },
                    { value: 'electrical', label: 'Electrical & ELV' },
                    { value: 'plumbing', label: 'Plumbing & Drainage' },
                  ],
                },
                { name: 'inspectionDate', label: 'Inspection date', kind: 'date', required: true, defaultValue: today },
                { name: 'locationDetail', label: 'Location & scope details', kind: 'text', required: true, placeholder: 'e.g. Roof deck level, axis grid 4-8. Checking slab rebar spacing…', span: 2 },
              ]}
            />
          </div>

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
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Snag"
              buttonLabel="Log Snag"
              subtitle="Log a punch-list defect. It moves open → resolved → closed once verified."
              endpoint="/api/quality/snags"
              fields={[
                { name: 'projectId', label: 'Project', kind: 'select', required: true, labelField: 'projectName', options: projectOptions, span: 2 },
                {
                  name: 'severity',
                  label: 'Severity',
                  kind: 'select',
                  defaultValue: 'low',
                  span: 2,
                  options: [
                    { value: 'low', label: 'Low (Aesthetic touch-ups)' },
                    { value: 'medium', label: 'Medium (Defective switches, door hinges)' },
                    { value: 'high', label: 'High (Water leaks, no power, safety hazard)' },
                  ],
                },
                { name: 'locationDetail', label: 'Location detail', kind: 'text', required: true, placeholder: 'e.g. Unit 302, Master Bedroom Bathroom' },
                { name: 'assignedTo', label: 'Assigned subcontractor / tech', kind: 'text', placeholder: 'e.g. Apex Plumbing Co.' },
                { name: 'description', label: 'Description of defect', kind: 'textarea', required: true, placeholder: 'Describe the snag, what needs fixing…' },
              ]}
            />
          </div>

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
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Audit"
              buttonLabel="Schedule Audit"
              subtitle="Schedule an ISO checklist audit. The standard's clause checklist is generated automatically."
              endpoint="/api/quality/audits"
              fields={[
                { name: 'projectId', label: 'Project', kind: 'select', required: true, labelField: 'projectName', options: projectOptions, span: 2 },
                { name: 'auditNumber', label: 'Audit reference number', kind: 'text', required: true, placeholder: 'e.g. AUD-9001-002' },
                {
                  name: 'auditType',
                  label: 'Audit type / standard',
                  kind: 'select',
                  defaultValue: 'ISO 9001:2015',
                  options: [
                    { value: 'ISO 9001:2015', label: 'ISO 9001:2015 (Quality Management)' },
                    { value: 'ISO 14001:2015', label: 'ISO 14001:2015 (Environmental)' },
                    { value: 'ISO 45001:2018', label: 'ISO 45001:2018 (Safety Management)' },
                    { value: 'Internal HSE', label: 'Internal HSE Checklist' },
                  ],
                },
                { name: 'scheduledDate', label: 'Scheduled date', kind: 'date', required: true, defaultValue: today },
                { name: 'auditorName', label: 'Lead auditor name', kind: 'text', required: true, placeholder: 'e.g. Johnathan Smith, Quality Lead' },
              ]}
            />
          </div>

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
                            defaultValue={item.findings || ''}
                            onBlur={(e) => {
                              if (e.target.value !== (item.findings || '')) {
                                handleUpdateChecklistStatus(audit.id, index, item.status, e.target.value);
                              }
                            }}
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
  tabHeader: { display: 'flex', justifyContent: 'flex-end', margin: '0 0 12px' } as CSSProperties,
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
