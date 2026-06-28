'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';

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

interface Props {
  initialIncidents: HseIncident[];
  initialPermits: PermitToWork[];
  initialCapas: CapaAction[];
  projects: Project[];
}

export default function HseControlClient({
  initialIncidents,
  initialPermits,
  initialCapas,
  projects,
}: Props) {
  const [activeTab, setActiveTab] = useState<'incidents' | 'ptws' | 'capas'>('incidents');
  const [incidents, setIncidents] = useState<HseIncident[]>(initialIncidents);
  const [permits, setPermits] = useState<PermitToWork[]>(initialPermits);
  const [capas, setCapas] = useState<CapaAction[]>(initialCapas);

  // General State
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');
  const [error, setError] = useState<string | null>(null);

  // Incident Form State
  const [incDate, setIncDate] = useState(new Date().toISOString().split('T')[0]);
  const [incSeverity, setIncSeverity] = useState<HseIncident['severity']>('near_miss');
  const [incLocation, setIncLocation] = useState('');
  const [incDescription, setIncDescription] = useState('');

  // Permit Form State
  const [ptwType, setPtwType] = useState<PermitToWork['permitType']>('hot_work');
  const [ptwFrom, setPtwFrom] = useState('');
  const [ptwTo, setPtwTo] = useState('');
  const [ptwDescription, setPtwDescription] = useState('');

  // CAPA Form State
  const [capaSourceType, setCapaSourceType] = useState<CapaAction['sourceType']>('inspection');
  const [capaSourceId, setCapaSourceId] = useState('');
  const [capaActionRequired, setCapaActionRequired] = useState('');
  const [capaAssignedTo, setCapaAssignedTo] = useState('');
  const [capaDueDate, setCapaDueDate] = useState('');

  const selectedProjName = projects.find((p) => p.id === selectedProjectId)?.title || null;

  const handleReportIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incDescription.trim() || !incLocation.trim() || !incDate) return;

    setError(null);
    try {
      const res = await fetch('/api/hse/incidents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          date: incDate,
          severity: incSeverity,
          description: incDescription,
          locationDetail: incLocation,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newInc = await res.json();
      setIncidents([newInc, ...incidents]);
      setIncLocation('');
      setIncDescription('');
    } catch (err: any) {
      setError(err.message || 'Failed to report safety incident');
    }
  };

  const handleCloseIncident = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hse/incidents/${id}/close`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setIncidents(incidents.map((i) => (i.id === id ? updated : i)));
    } catch (err: any) {
      setError(err.message || 'Failed to close safety incident');
    }
  };

  const handleRequestPermit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ptwFrom || !ptwTo || !ptwDescription.trim()) return;

    setError(null);
    try {
      const res = await fetch('/api/hse/ptws', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          permitType: ptwType,
          validFrom: new Date(ptwFrom).toISOString(),
          validTo: new Date(ptwTo).toISOString(),
          description: ptwDescription,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newPermit = await res.json();
      setPermits([newPermit, ...permits]);
      setPtwDescription('');
      setPtwFrom('');
      setPtwTo('');
    } catch (err: any) {
      setError(err.message || 'Failed to request permit to work');
    }
  };

  const handleApprovePermit = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hse/ptws/${id}/approve`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setPermits(permits.map((p) => (p.id === id ? updated : p)));
    } catch (err: any) {
      setError(err.message || 'Failed to approve permit to work');
    }
  };

  const handleRaiseCapa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capaActionRequired.trim() || !capaDueDate) return;

    setError(null);
    try {
      const res = await fetch('/api/hse/capas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          sourceType: capaSourceType,
          sourceId: capaSourceId || undefined,
          actionRequired: capaActionRequired,
          assignedTo: capaAssignedTo || undefined,
          dueDate: capaDueDate,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newCapa = await res.json();
      setCapas([newCapa, ...capas]);
      setCapaActionRequired('');
      setCapaAssignedTo('');
      setCapaDueDate('');
      setCapaSourceId('');
    } catch (err: any) {
      setError(err.message || 'Failed to raise CAPA corrective action');
    }
  };

  const handleCompleteCapa = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hse/capas/${id}/complete`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setCapas(capas.map((c) => (c.id === id ? updated : c)));
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
      </div>

      {/* Tab Contents */}
      {activeTab === 'incidents' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleReportIncident} style={st.formCard}>
            <h3 style={st.formTitle}>Report Safety Incident / Near Miss</h3>
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
                <label style={st.label}>Date of Incident</label>
                <input
                  type="date"
                  value={incDate}
                  onChange={(e) => setIncDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Severity Level</label>
                <select
                  value={incSeverity}
                  onChange={(e) => setIncSeverity(e.target.value as any)}
                  style={st.select}
                >
                  <option value="near_miss">Near Miss (No Injury/Damage)</option>
                  <option value="minor">Minor (First Aid required)</option>
                  <option value="major">Major (Medical treatment / lost time)</option>
                  <option value="fatal">Fatal / Severe Outage</option>
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Location Detail</label>
                <input
                  type="text"
                  placeholder="e.g. Tower A, Shaft 3"
                  value={incLocation}
                  onChange={(e) => setIncLocation(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Description of Incident</label>
                <textarea
                  placeholder="Detailed description of what transpired, immediate actions taken, and names of individuals involved..."
                  value={incDescription}
                  onChange={(e) => setIncDescription(e.target.value)}
                  style={st.textarea}
                  required
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Report Incident</button>
          </form>

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
          {/* Create Form */}
          <form onSubmit={handleRequestPermit} style={st.formCard}>
            <h3 style={st.formTitle}>Request Permit to Work (PTW)</h3>
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
                <label style={st.label}>Permit Type</label>
                <select
                  value={ptwType}
                  onChange={(e) => setPtwType(e.target.value as any)}
                  style={st.select}
                >
                  <option value="hot_work">Hot Work (Welding, cutting, grinding)</option>
                  <option value="confined_space">Confined Space Entry</option>
                  <option value="height_work">Working at Heights</option>
                  <option value="electrical">High-Voltage Electrical Isolation</option>
                  <option value="excavation">Deep Excavation & Trenching</option>
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Valid From</label>
                <input
                  type="datetime-local"
                  value={ptwFrom}
                  onChange={(e) => setPtwFrom(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Valid To</label>
                <input
                  type="datetime-local"
                  value={ptwTo}
                  onChange={(e) => setPtwTo(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Description of Work & Safety Controls</label>
                <textarea
                  placeholder="Detail activities, safety measures, gas detector readings if applicable, and rescue team allocations..."
                  value={ptwDescription}
                  onChange={(e) => setPtwDescription(e.target.value)}
                  style={st.textarea}
                  required
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Request Permit</button>
          </form>

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
          {/* Create Form */}
          <form onSubmit={handleRaiseCapa} style={st.formCard}>
            <h3 style={st.formTitle}>Raise Corrective & Preventive Action (CAPA)</h3>
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
                <label style={st.label}>Source Category</label>
                <select
                  value={capaSourceType}
                  onChange={(e) => setCapaSourceType(e.target.value as any)}
                  style={st.select}
                >
                  <option value="inspection">Site Audit / Safety Walkthrough</option>
                  <option value="incident">Safety Incident Follow-up</option>
                  <option value="audit">Formal Third-Party Audit</option>
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Due Date</label>
                <input
                  type="date"
                  value={capaDueDate}
                  onChange={(e) => setCapaDueDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Assigned Safety Officer</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe / HSE Executive"
                  value={capaAssignedTo}
                  onChange={(e) => setCapaAssignedTo(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Corrective Action Required</label>
                <textarea
                  placeholder="Specify findings, deviations, risk levels, and detail exactly what controls must be erected..."
                  value={capaActionRequired}
                  onChange={(e) => setCapaActionRequired(e.target.value)}
                  style={st.textarea}
                  required
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Raise CAPA Task</button>
          </form>

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
