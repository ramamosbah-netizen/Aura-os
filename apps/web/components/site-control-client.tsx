'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';

interface Project {
  id: string;
  title: string;
}

interface DailyReport {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  workDescription: string;
  manpowerCount: number;
  equipmentCount: number;
  status: 'draft' | 'submitted';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DelayLog {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  delayType: 'weather' | 'material' | 'access' | 'drawings' | 'other';
  description: string;
  impactHours: number;
  status: 'logged' | 'resolved';
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MaterialConsumption {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  itemId: string;
  itemName: string;
  quantityConsumed: number;
  unit: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialDailyReports: DailyReport[];
  initialDelayLogs: DelayLog[];
  initialMaterialConsumption: MaterialConsumption[];
  projects: Project[];
}

export default function SiteControlClient({
  initialDailyReports,
  initialDelayLogs,
  initialMaterialConsumption,
  projects,
}: Props) {
  const [activeTab, setActiveTab] = useState<'daily-reports' | 'delay-logs' | 'material-consumption'>('daily-reports');
  const [dailyReports, setDailyReports] = useState<DailyReport[]>(initialDailyReports);
  const [delayLogs, setDelayLogs] = useState<DelayLog[]>(initialDelayLogs);
  const [materialConsumption, setMaterialConsumption] = useState<MaterialConsumption[]>(initialMaterialConsumption);

  // General state
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');
  const [error, setError] = useState<string | null>(null);

  // Daily Report form state
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [workDescription, setWorkDescription] = useState('');
  const [manpowerCount, setManpowerCount] = useState<number>(0);
  const [equipmentCount, setEquipmentCount] = useState<number>(0);

  // Delay Log form state
  const [delayDate, setDelayDate] = useState(new Date().toISOString().split('T')[0]);
  const [delayType, setDelayType] = useState<DelayLog['delayType']>('weather');
  const [delayDescription, setDelayDescription] = useState('');
  const [delayImpactHours, setDelayImpactHours] = useState<number>(0);

  // Material Consumption form state
  const [matDate, setMatDate] = useState(new Date().toISOString().split('T')[0]);
  const [matItemId, setMatItemId] = useState('');
  const [matItemName, setMatItemName] = useState('');
  const [matQuantity, setMatQuantity] = useState<number>(0);
  const [matUnit, setMatUnit] = useState('');

  const selectedProjName = projects.find((p) => p.id === selectedProjectId)?.title || null;

  const handleCreateDailyReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workDescription.trim() || !reportDate) return;

    setError(null);
    try {
      const res = await fetch('/api/site/daily-reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          date: reportDate,
          workDescription,
          manpowerCount: Number(manpowerCount),
          equipmentCount: Number(equipmentCount),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newReport = await res.json();
      setDailyReports([newReport, ...dailyReports]);
      setWorkDescription('');
      setManpowerCount(0);
      setEquipmentCount(0);
    } catch (err: any) {
      setError(err.message || 'Failed to create daily report');
    }
  };

  const handleSubmitDailyReport = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/site/daily-reports/${id}/submit`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setDailyReports(dailyReports.map((r) => (r.id === id ? updated : r)));
    } catch (err: any) {
      setError(err.message || 'Failed to submit daily report');
    }
  };

  const handleCreateDelayLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!delayDescription.trim() || !delayDate) return;

    setError(null);
    try {
      const res = await fetch('/api/site/delay-logs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          date: delayDate,
          delayType,
          description: delayDescription,
          impactHours: Number(delayImpactHours),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newLog = await res.json();
      setDelayLogs([newLog, ...delayLogs]);
      setDelayDescription('');
      setDelayImpactHours(0);
    } catch (err: any) {
      setError(err.message || 'Failed to log delay');
    }
  };

  const handleResolveDelay = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/site/delay-logs/${id}/resolve`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setDelayLogs(delayLogs.map((l) => (l.id === id ? updated : l)));
    } catch (err: any) {
      setError(err.message || 'Failed to resolve delay');
    }
  };

  const handleCreateMaterialConsumption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matItemId.trim() || !matItemName.trim() || !matUnit.trim() || matQuantity <= 0) return;

    setError(null);
    try {
      const res = await fetch('/api/site/material-consumption', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          date: matDate,
          itemId: matItemId,
          itemName: matItemName,
          quantityConsumed: Number(matQuantity),
          unit: matUnit,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newEntry = await res.json();
      setMaterialConsumption([newEntry, ...materialConsumption]);
      setMatItemId('');
      setMatItemName('');
      setMatQuantity(0);
      setMatUnit('');
    } catch (err: any) {
      setError(err.message || 'Failed to log material consumption');
    }
  };

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      {/* Tabs */}
      <div style={st.tabs}>
        <button
          onClick={() => setActiveTab('daily-reports')}
          style={activeTab === 'daily-reports' ? st.activeTabBtn : st.tabBtn}
        >
          Daily Reports / Site Diary
        </button>
        <button
          onClick={() => setActiveTab('delay-logs')}
          style={activeTab === 'delay-logs' ? st.activeTabBtn : st.tabBtn}
        >
          Site Delay Logs
        </button>
        <button
          onClick={() => setActiveTab('material-consumption')}
          style={activeTab === 'material-consumption' ? st.activeTabBtn : st.tabBtn}
        >
          Material Consumption
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'daily-reports' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleCreateDailyReport} style={st.formCard}>
            <h3 style={st.formTitle}>Draft Daily Report</h3>
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
                <label style={st.label}>Report Date</label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Manpower Count</label>
                <input
                  type="number"
                  placeholder="Total workers on site"
                  value={manpowerCount}
                  onChange={(e) => setManpowerCount(Number(e.target.value))}
                  style={st.input}
                  min={0}
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Active Heavy Equipment Count</label>
                <input
                  type="number"
                  placeholder="Total machines on site"
                  value={equipmentCount}
                  onChange={(e) => setEquipmentCount(Number(e.target.value))}
                  style={st.input}
                  min={0}
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Work Description</label>
                <textarea
                  placeholder="Describe active tasks completed, locations worked, safety meetings held..."
                  value={workDescription}
                  onChange={(e) => setWorkDescription(e.target.value)}
                  style={st.textarea}
                  required
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Save Daily Report Draft</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Daily Reports Register</h3>
            {dailyReports.length === 0 ? (
              <p style={st.muted}>No daily reports logged yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Date', 'Project', 'Work Description', 'Manpower', 'Equipment', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dailyReports.map((r) => (
                    <tr key={r.id}>
                      <td style={st.tdCode}>{r.date}</td>
                      <td style={st.tdMuted}>{r.projectName || '—'}</td>
                      <td style={st.td}>{r.workDescription}</td>
                      <td style={st.tdMuted}>{r.manpowerCount}</td>
                      <td style={st.tdMuted}>{r.equipmentCount}</td>
                      <td style={st.td}>
                        <span style={r.status === 'submitted' ? st.tagApproved : st.tagPending}>
                          {r.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {r.status !== 'submitted' && (
                          <button
                            onClick={() => handleSubmitDailyReport(r.id)}
                            style={st.btnApprove}
                          >
                            Submit Report
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

      {activeTab === 'delay-logs' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleCreateDelayLog} style={st.formCard}>
            <h3 style={st.formTitle}>Log Project Site Delay</h3>
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
                <label style={st.label}>Date</label>
                <input
                  type="date"
                  value={delayDate}
                  onChange={(e) => setDelayDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Delay Type</label>
                <select
                  value={delayType}
                  onChange={(e) => setDelayType(e.target.value as any)}
                  style={st.select}
                >
                  <option value="weather">Weather Delay</option>
                  <option value="material">Material Stock Shortage</option>
                  <option value="access">Site Access / Civil Obstruction</option>
                  <option value="drawings">Design drawing clarification / RFI pending</option>
                  <option value="other">Other Outage</option>
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Estimated Impact Hours</label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="e.g. 4.5"
                  value={delayImpactHours}
                  onChange={(e) => setDelayImpactHours(Number(e.target.value))}
                  style={st.input}
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Delay Description</label>
                <textarea
                  placeholder="Detail cause of delay, impacted tasks, immediate measures taken..."
                  value={delayDescription}
                  onChange={(e) => setDelayDescription(e.target.value)}
                  style={st.textarea}
                  required
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Log Delay Incident</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Logged Site Delays</h3>
            {delayLogs.length === 0 ? (
              <p style={st.muted}>No site delays registered.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Date', 'Type', 'Project', 'Description', 'Impact (hrs)', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {delayLogs.map((l) => (
                    <tr key={l.id}>
                      <td style={st.tdCode}>{l.date}</td>
                      <td style={st.td}>
                        <span style={st.tagOutbound}>{l.delayType}</span>
                      </td>
                      <td style={st.tdMuted}>{l.projectName || '—'}</td>
                      <td style={st.td}>{l.description}</td>
                      <td style={st.tdMuted}>{l.impactHours}</td>
                      <td style={st.td}>
                        <span style={l.status === 'resolved' ? st.tagApproved : st.tagPending}>
                          {l.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {l.status !== 'resolved' && (
                          <button
                            onClick={() => handleResolveDelay(l.id)}
                            style={st.btnApprove}
                          >
                            Resolve
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

      {activeTab === 'material-consumption' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleCreateMaterialConsumption} style={st.formCard}>
            <h3 style={st.formTitle}>Record Material Consumption</h3>
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
                <label style={st.label}>Date</label>
                <input
                  type="date"
                  value={matDate}
                  onChange={(e) => setMatDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Material Item ID</label>
                <input
                  type="text"
                  placeholder="e.g. steel-rebar-16"
                  value={matItemId}
                  onChange={(e) => setMatItemId(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Item Name</label>
                <input
                  type="text"
                  placeholder="e.g. 16mm High Tensile Rebar"
                  value={matItemName}
                  onChange={(e) => setMatItemName(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Quantity Consumed</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 12.5"
                  value={matQuantity}
                  onChange={(e) => setMatQuantity(Number(e.target.value))}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Unit of Measurement</label>
                <input
                  type="text"
                  placeholder="e.g. tons, bags, meters"
                  value={matUnit}
                  onChange={(e) => setMatUnit(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Log Material Consumption</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Material Consumption Log</h3>
            {materialConsumption.length === 0 ? (
              <p style={st.muted}>No material consumption entries recorded.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Date', 'Item ID', 'Item Name', 'Quantity Consumed', 'Unit', 'Project'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {materialConsumption.map((m) => (
                    <tr key={m.id}>
                      <td style={st.tdCode}>{m.date}</td>
                      <td style={st.tdMuted}>{m.itemId}</td>
                      <td style={st.td}>{m.itemName}</td>
                      <td style={st.tdCode}>{m.quantityConsumed}</td>
                      <td style={st.td}>{m.unit}</td>
                      <td style={st.tdMuted}>{m.projectName || '—'}</td>
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
