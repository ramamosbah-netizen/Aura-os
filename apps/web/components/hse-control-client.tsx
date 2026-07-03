'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';

interface Project {
  id: string;
  title: string;
}

interface HseIncident {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  severity: 'near_miss' | 'minor' | 'major' | 'fatal';
  description: string;
  locationDetail: string;
  status: 'reported' | 'investigating' | 'closed';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PermitToWork {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  permitType: 'hot_work' | 'confined_space' | 'height_work' | 'electrical' | 'excavation';
  validFrom: string;
  validTo: string;
  description: string;
  status: 'draft' | 'requested' | 'approved' | 'expired' | 'closed';
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CapaAction {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  sourceType: 'incident' | 'audit' | 'inspection';
  sourceId: string | null;
  actionRequired: string;
  assignedTo: string | null;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SafetyTrainingRecord {
  id: string;
  tenantId: string;
  companyId: string | null;
  workerName: string;
  workerId: string;
  inductionDate: string;
  cardNumber: string | null;
  cardExpiry: string | null;
  certifications: string[];
  status: 'valid' | 'expired';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialIncidents: HseIncident[];
  initialPermits: PermitToWork[];
  initialCapas: CapaAction[];
  initialTrainingRecords: SafetyTrainingRecord[];
  projects: Project[];
}

export default function HseControlClient({
  initialIncidents,
  initialPermits,
  initialCapas,
  initialTrainingRecords,
  projects,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'incidents' | 'ptws' | 'capas' | 'training'>('incidents');
  const incidents = initialIncidents;
  const permits = initialPermits;
  const capas = initialCapas;
  const trainingRecords = initialTrainingRecords;
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.title }));

  const handleCloseIncident = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hse/incidents/${id}/close`, { method: 'PUT' });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to close safety incident');
    }
  };

  const handleApprovePermit = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hse/ptws/${id}/approve`, { method: 'PUT' });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to approve permit to work');
    }
  };

  const handleCompleteCapa = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hse/capas/${id}/complete`, { method: 'PUT' });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to complete CAPA corrective action');
    }
  };

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      {/* Tabs */}
      <div style={st.tabs}>
        <button
          onClick={() => setActiveTab('incidents')}
          style={activeTab === 'incidents' ? st.activeTabBtn : st.tabBtn}
        >
          Incident Management & Near Misses
        </button>
        <button
          onClick={() => setActiveTab('ptws')}
          style={activeTab === 'ptws' ? st.activeTabBtn : st.tabBtn}
        >
          Permit to Work (PTW)
        </button>
        <button
          onClick={() => setActiveTab('capas')}
          style={activeTab === 'capas' ? st.activeTabBtn : st.tabBtn}
        >
          CAPA Corrective Actions
        </button>
        <button
          onClick={() => setActiveTab('training')}
          style={activeTab === 'training' ? st.activeTabBtn : st.tabBtn}
        >
          Safety Training Matrix
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'incidents' && (
        <div>
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Incident"
              buttonLabel="Report Incident"
              subtitle="Log a safety incident or near miss on a project. Closing it later requires investigation sign-off."
              endpoint="/api/hse/incidents"
              fields={[
                { name: 'projectId', label: 'Project', kind: 'select', required: true, labelField: 'projectName', options: projectOptions, span: 2 },
                { name: 'date', label: 'Date of incident', kind: 'date', required: true, defaultValue: today },
                {
                  name: 'severity',
                  label: 'Severity level',
                  kind: 'select',
                  defaultValue: 'near_miss',
                  options: [
                    { value: 'near_miss', label: 'Near Miss (no injury/damage)' },
                    { value: 'minor', label: 'Minor (first aid required)' },
                    { value: 'major', label: 'Major (medical treatment / lost time)' },
                    { value: 'fatal', label: 'Fatal / severe outage' },
                  ],
                },
                { name: 'locationDetail', label: 'Location detail', kind: 'text', required: true, placeholder: 'e.g. Tower A, Shaft 3', span: 2 },
                { name: 'description', label: 'Description of incident', kind: 'textarea', required: true, placeholder: 'What transpired, immediate actions taken, individuals involved…' },
              ]}
            />
          </div>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Active Safety Register</h3>
            {incidents.length === 0 ? (
              <p style={st.muted}>No safety incidents logged yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Date', 'Severity', 'Project', 'Location', 'Description', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((i) => (
                    <tr key={i.id}>
                      <td style={st.tdCode}>{i.date}</td>
                      <td style={st.td}>
                        <span style={i.severity === 'near_miss' ? st.tagInbound : i.severity === 'minor' ? st.tagPending : st.tagOutbound}>
                          {i.severity}
                        </span>
                      </td>
                      <td style={st.tdMuted}>{i.projectName || '—'}</td>
                      <td style={st.tdMuted}>{i.locationDetail}</td>
                      <td style={st.td}>{i.description}</td>
                      <td style={st.td}>
                        <span style={i.status === 'closed' ? st.tagApproved : st.tagPending}>
                          {i.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {i.status !== 'closed' && (
                          <button
                            onClick={() => handleCloseIncident(i.id)}
                            style={st.btnApprove}
                          >
                            Close Incident
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

      {activeTab === 'ptws' && (
        <div>
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Permit to Work"
              buttonLabel="Request Permit"
              subtitle="Request a PTW for high-risk work. It must be approved before the work window opens."
              endpoint="/api/hse/ptws"
              fields={[
                { name: 'projectId', label: 'Project', kind: 'select', required: true, labelField: 'projectName', options: projectOptions, span: 2 },
                {
                  name: 'permitType',
                  label: 'Permit type',
                  kind: 'select',
                  defaultValue: 'hot_work',
                  span: 2,
                  options: [
                    { value: 'hot_work', label: 'Hot Work (welding, cutting, grinding)' },
                    { value: 'confined_space', label: 'Confined Space Entry' },
                    { value: 'height_work', label: 'Working at Heights' },
                    { value: 'electrical', label: 'High-Voltage Electrical Isolation' },
                    { value: 'excavation', label: 'Deep Excavation & Trenching' },
                  ],
                },
                { name: 'validFrom', label: 'Valid from', kind: 'date', required: true, transform: 'isoDate' },
                { name: 'validTo', label: 'Valid to', kind: 'date', required: true, transform: 'isoDate' },
                { name: 'description', label: 'Work & safety controls', kind: 'textarea', required: true, placeholder: 'Activities, safety measures, gas readings, rescue team allocations…' },
              ]}
            />
          </div>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Permits Log</h3>
            {permits.length === 0 ? (
              <p style={st.muted}>No permit to work logs registered.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Type', 'Project', 'Valid From', 'Valid To', 'Description', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permits.map((p) => (
                    <tr key={p.id}>
                      <td style={st.tdCode}>{p.permitType}</td>
                      <td style={st.tdMuted}>{p.projectName || '—'}</td>
                      <td style={st.tdMuted}>{new Date(p.validFrom).toLocaleString()}</td>
                      <td style={st.tdMuted}>{new Date(p.validTo).toLocaleString()}</td>
                      <td style={st.td}>{p.description}</td>
                      <td style={st.td}>
                        <span style={p.status === 'approved' ? st.tagApproved : st.tagPending}>
                          {p.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {p.status !== 'approved' && (
                          <button
                            onClick={() => handleApprovePermit(p.id)}
                            style={st.btnApprove}
                          >
                            Approve & Issue
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

      {activeTab === 'capas' && (
        <div>
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="CAPA Action"
              buttonLabel="Raise CAPA"
              subtitle="Raise a corrective & preventive action from an inspection, incident, or audit finding."
              endpoint="/api/hse/capas"
              fields={[
                { name: 'projectId', label: 'Project', kind: 'select', required: true, labelField: 'projectName', options: projectOptions, span: 2 },
                {
                  name: 'sourceType',
                  label: 'Source category',
                  kind: 'select',
                  defaultValue: 'inspection',
                  options: [
                    { value: 'inspection', label: 'Site Audit / Safety Walkthrough' },
                    { value: 'incident', label: 'Safety Incident Follow-up' },
                    { value: 'audit', label: 'Formal Third-Party Audit' },
                  ],
                },
                { name: 'dueDate', label: 'Due date', kind: 'date', required: true },
                { name: 'assignedTo', label: 'Assigned safety officer', kind: 'text', placeholder: 'e.g. John Doe / HSE Executive', span: 2 },
                { name: 'actionRequired', label: 'Corrective action required', kind: 'textarea', required: true, placeholder: 'Findings, deviations, risk levels, and the controls that must be erected…' },
              ]}
            />
          </div>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>CAPA Register</h3>
            {capas.length === 0 ? (
              <p style={st.muted}>No CAPA actions registered.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Source', 'Project', 'Action Required', 'Assigned To', 'Due Date', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {capas.map((c) => (
                    <tr key={c.id}>
                      <td style={st.tdCode}>{c.sourceType}</td>
                      <td style={st.tdMuted}>{c.projectName || '—'}</td>
                      <td style={st.td}>{c.actionRequired}</td>
                      <td style={st.tdMuted}>{c.assignedTo || '—'}</td>
                      <td style={st.tdCode}>{c.dueDate}</td>
                      <td style={st.td}>
                        <span style={c.status === 'completed' ? st.tagApproved : st.tagPending}>
                          {c.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {c.status !== 'completed' && (
                          <button
                            onClick={() => handleCompleteCapa(c.id)}
                            style={st.btnApprove}
                          >
                            Mark Completed
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

      {activeTab === 'training' && (
        <div>
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Training Record"
              buttonLabel="Record Induction"
              subtitle="Record a worker's safety induction, HSE card, and certifications."
              endpoint="/api/hse/training"
              fields={[
                { name: 'workerName', label: 'Worker full name', kind: 'text', required: true, placeholder: 'e.g. Ahmed Khan' },
                { name: 'workerId', label: 'Worker ID / Emirates ID', kind: 'text', required: true, placeholder: 'e.g. W-77402' },
                { name: 'inductionDate', label: 'Induction date', kind: 'date', required: true, defaultValue: today },
                { name: 'cardNumber', label: 'HSE card number', kind: 'text', placeholder: 'e.g. HSE-2026-904' },
                { name: 'cardExpiry', label: 'HSE card expiry', kind: 'date' },
                {
                  name: 'certifications',
                  label: 'Safety certifications',
                  kind: 'text',
                  transform: 'csv',
                  span: 2,
                  placeholder: 'e.g. Work at Height, Confined Space, First Aid',
                  hint: 'Comma-separated list.',
                },
              ]}
            />
          </div>

          {/* List panel */}
          <section style={st.panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Worker Safety Training Matrix</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center', marginRight: 6 }}>Status Filters:</span>
                <span style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(52, 211, 153, 0.1)',
                  color: '#34d399',
                  border: '1px solid rgba(52, 211, 153, 0.2)',
                  fontWeight: 600
                }}>
                  Valid: {trainingRecords.filter(r => r.status === 'valid').length}
                </span>
                <span style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(248, 113, 113, 0.1)',
                  color: '#f87171',
                  border: '1px solid rgba(248, 113, 113, 0.2)',
                  fontWeight: 600
                }}>
                  Expired: {trainingRecords.filter(r => r.status === 'expired').length}
                </span>
              </div>
            </div>

            {trainingRecords.length === 0 ? (
              <p style={st.muted}>No safety training records registered yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Worker Name', 'Worker ID', 'Induction Date', 'HSE Card No.', 'Card Expiry', 'Certifications', 'Status'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trainingRecords.map((r) => (
                    <tr key={r.id}>
                      <td style={{ ...st.td, fontWeight: 600, color: '#fff' }}>{r.workerName}</td>
                      <td style={st.tdCode}>{r.workerId}</td>
                      <td style={st.tdMuted}>{r.inductionDate}</td>
                      <td style={st.tdMuted}>{r.cardNumber || 'N/A'}</td>
                      <td style={st.tdCode}>{r.cardExpiry || 'No Expiry'}</td>
                      <td style={st.td}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {r.certifications.length === 0 ? (
                            <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>None</span>
                          ) : (
                            r.certifications.map((cert, index) => (
                              <span key={index} style={{
                                fontSize: 11,
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--muted)',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                padding: '1px 6px',
                              }}>
                                {cert}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td style={st.td}>
                        <span style={r.status === 'valid' ? st.tagApproved : st.tagOutbound}>
                          {r.status}
                        </span>
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
  tabHeader: { display: 'flex', justifyContent: 'flex-end', margin: '0 0 12px' } as CSSProperties,
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
