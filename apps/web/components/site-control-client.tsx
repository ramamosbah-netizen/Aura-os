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

interface LabourAllocation {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  date: string;
  trade: string;
  headcount: number;
  hours: number;
  manHours: number;
  subcontractorName: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ScheduleTask {
  name: string;
  plannedStart: string;
  plannedEnd: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  percentComplete: number;
}

interface ProjectSchedule {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  tasks: ScheduleTask[];
  baselineSetAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialDailyReports: DailyReport[];
  initialDelayLogs: any[];
  initialMaterialConsumption: MaterialConsumption[];
  initialLabourAllocations: LabourAllocation[];
  schedules: ProjectSchedule[];
  projects: Project[];
}

export default function SiteControlClient({
  initialDailyReports,
  initialDelayLogs,
  initialMaterialConsumption,
  initialLabourAllocations,
  schedules,
  projects,
}: Props) {
  const [activeTab, setActiveTab] = useState<'daily-reports' | 'delay-logs' | 'material-consumption' | 'labour-allocations' | 'progress-mapping'>('daily-reports');
  const [dailyReports, setDailyReports] = useState<DailyReport[]>(initialDailyReports);
  const [delayLogs, setDelayLogs] = useState<any[]>(initialDelayLogs);
  const [materialConsumption, setMaterialConsumption] = useState<MaterialConsumption[]>(initialMaterialConsumption);
  const [labourAllocations, setLabourAllocations] = useState<LabourAllocation[]>(initialLabourAllocations);

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

  // Labour Allocation form state
  const [labourDate, setLabourDate] = useState(new Date().toISOString().split('T')[0]);
  const [labourTrade, setLabourTrade] = useState('');
  const [labourHeadcount, setLabourHeadcount] = useState<number>(0);
  const [labourHours, setLabourHours] = useState<number>(0);
  const [labourSubcontractorName, setLabourSubcontractorName] = useState('');
  const [labourNotes, setLabourNotes] = useState('');

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

  const handleCreateLabourAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!labourTrade.trim() || labourHeadcount <= 0 || labourHours <= 0) return;

    setError(null);
    try {
      const res = await fetch('/api/site/labour', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          projectName: selectedProjName,
          date: labourDate,
          trade: labourTrade,
          headcount: Number(labourHeadcount),
          hours: Number(labourHours),
          subcontractorName: labourSubcontractorName || null,
          notes: labourNotes || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newEntry = await res.json();
      setLabourAllocations([newEntry, ...labourAllocations]);
      setLabourTrade('');
      setLabourHeadcount(0);
      setLabourHours(0);
      setLabourSubcontractorName('');
      setLabourNotes('');
    } catch (err: any) {
      setError(err.message || 'Failed to log labour allocation');
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
        <button
          onClick={() => setActiveTab('labour-allocations')}
          style={activeTab === 'labour-allocations' ? st.activeTabBtn : st.tabBtn}
        >
          Labour Allocations
        </button>
        <button
          onClick={() => setActiveTab('progress-mapping')}
          style={activeTab === 'progress-mapping' ? st.activeTabBtn : st.tabBtn}
        >
          Progress % Mapping (vs Baselines)
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

      {activeTab === 'labour-allocations' && (
        <div>
          {/* Create Form */}
          <form onSubmit={handleCreateLabourAllocation} style={st.formCard}>
            <h3 style={st.formTitle}>Record Labour Allocation</h3>
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
                  value={labourDate}
                  onChange={(e) => setLabourDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Trade / Designation</label>
                <input
                  type="text"
                  placeholder="e.g. Mason, Steel Fixer, Carpenter"
                  value={labourTrade}
                  onChange={(e) => setLabourTrade(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Headcount</label>
                <input
                  type="number"
                  placeholder="Number of workers"
                  value={labourHeadcount}
                  onChange={(e) => setLabourHeadcount(Number(e.target.value))}
                  style={st.input}
                  min={1}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Hours worked per person</label>
                <input
                  type="number"
                  placeholder="Hours worked"
                  value={labourHours}
                  onChange={(e) => setLabourHours(Number(e.target.value))}
                  style={st.input}
                  min={1}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Subcontractor Name (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Al Falah Co."
                  value={labourSubcontractorName}
                  onChange={(e) => setLabourSubcontractorName(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Notes</label>
                <textarea
                  placeholder="Specific tasks worked, zones assigned, tool box topics discussed..."
                  value={labourNotes}
                  onChange={(e) => setLabourNotes(e.target.value)}
                  style={st.textarea}
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Log Labour Allocation</button>
          </form>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Labour Allocation Log</h3>
            {labourAllocations.length === 0 ? (
              <p style={st.muted}>No labour allocations recorded.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Date', 'Project', 'Trade / Role', 'Headcount', 'Hours', 'Man-Hours', 'Subcontractor', 'Notes'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {labourAllocations.map((l) => (
                    <tr key={l.id}>
                      <td style={st.tdCode}>{l.date}</td>
                      <td style={st.tdMuted}>{l.projectName || '—'}</td>
                      <td style={st.td}>{l.trade}</td>
                      <td style={st.tdCode}>{l.headcount}</td>
                      <td style={st.tdCode}>{l.hours}h</td>
                      <td style={st.td}>{l.manHours} mh</td>
                      <td style={st.tdMuted}>{l.subcontractorName || 'Direct'}</td>
                      <td style={st.td}>{l.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {activeTab === 'progress-mapping' && (
        <div>
          {/* Visual progress metrics vs planned baselines */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Progress % Mapping (vs Planned Baselines)</h3>
            <p style={{ ...st.muted, marginBottom: 20 }}>
              Compare actual progress (% complete) against planned baselines captured at project start.
            </p>

            {schedules.length === 0 ? (
              <p style={st.muted}>No schedules available. Please set up Gantt schedules under Projects.</p>
            ) : (
              schedules.map((sch) => {
                const totalTasks = sch.tasks.length;
                if (totalTasks === 0) return null;

                // Duration weighted planned/actual progress
                const daysBetweenDates = (a: string, b: string) => {
                  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
                };

                const totalDur = sch.tasks.reduce((sum, task) => {
                  return sum + Math.max(1, daysBetweenDates(task.plannedStart, task.plannedEnd) + 1);
                }, 0);

                const currentDoneDur = sch.tasks.reduce((sum, task) => {
                  return sum + Math.max(1, daysBetweenDates(task.plannedStart, task.plannedEnd) + 1) * (task.percentComplete / 100);
                }, 0);

                const actualProgress = Math.round((currentDoneDur / totalDur) * 100);

                return (
                  <div key={sch.id} style={st.projectScheduleCard}>
                    <div style={st.projectScheduleHeader}>
                      <h4 style={st.projectScheduleTitle}>{sch.projectName || 'Unnamed Project'}</h4>
                      <div style={st.projectSummaryStats}>
                        <span>Overall Progress: <strong>{actualProgress}%</strong></span>
                        <span style={{ color: sch.baselineSetAt ? 'var(--accent)' : 'var(--muted)', fontWeight: 600 }}>
                          {sch.baselineSetAt ? 'Baseline set' : 'No baseline snapshot'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {sch.tasks.map((task, idx) => {
                        // Check baseline dates vs planned dates
                        const hasBaseline = !!task.baselineStart && !!task.baselineEnd;
                        const slippage = hasBaseline
                          ? daysBetweenDates(task.baselineEnd!, task.plannedEnd)
                          : 0;

                        return (
                          <div key={idx} style={st.taskProgressRow}>
                            <div style={st.taskInfo}>
                              <div style={st.taskName}>{task.name}</div>
                              <div style={st.taskDates}>
                                <span>Planned: {task.plannedStart} to {task.plannedEnd}</span>
                                {hasBaseline && (
                                  <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                                    Baseline: {task.baselineStart} to {task.baselineEnd}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div style={st.visualBarsWrap}>
                              {/* Progress bar */}
                              <div style={st.barLabel}>Actual Progress:</div>
                              <div style={st.progressBarOuter}>
                                <div style={{ ...st.progressBarInner, width: `${task.percentComplete}%` }} />
                                <span style={st.progressBarText}>{task.percentComplete}%</span>
                              </div>

                              {/* Planned baseline bar */}
                              {hasBaseline ? (
                                <>
                                  <div style={st.barLabel}>Planned Baseline:</div>
                                  <div style={{ ...st.progressBarOuter, background: 'rgba(255, 255, 255, 0.05)' }}>
                                    <div
                                      style={{
                                        ...st.progressBarInner,
                                        width: '100%',
                                        background: 'rgba(255, 255, 255, 0.15)',
                                      }}
                                    />
                                    <span style={st.progressBarText}>Baseline Target (100%)</span>
                                  </div>
                                </>
                              ) : (
                                <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                                  No baseline captured to measure target timeline
                                </div>
                              )}

                              {slippage > 0 && (
                                <div style={st.slippageTag}>
                                  ⚠️ Slippage: +{slippage} days behind baseline target
                                </div>
                              )}
                              {slippage < 0 && (
                                <div style={{ ...st.slippageTag, background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.2)' }}>
                                  🚀 Ahead: {Math.abs(slippage)} days earlier than baseline
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
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
  projectScheduleCard: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  } as CSSProperties,
  projectScheduleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottom: '1px solid var(--border)',
    paddingBottom: 8,
  } as CSSProperties,
  projectScheduleTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
  } as CSSProperties,
  projectSummaryStats: {
    display: 'flex',
    gap: 16,
    fontSize: 12.5,
    color: 'var(--muted)',
  } as CSSProperties,
  taskProgressRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 20,
    padding: '10px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  } as CSSProperties,
  taskInfo: {
    flex: '1 1 40%',
  } as CSSProperties,
  taskName: {
    fontSize: 13.5,
    fontWeight: 600,
    marginBottom: 4,
  } as CSSProperties,
  taskDates: {
    fontSize: 11.5,
    color: 'var(--muted)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  } as CSSProperties,
  visualBarsWrap: {
    flex: '1 1 55%',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  } as CSSProperties,
  barLabel: {
    fontSize: 10.5,
    color: 'var(--muted)',
    fontWeight: 500,
  } as CSSProperties,
  progressBarOuter: {
    position: 'relative',
    height: 20,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    overflow: 'hidden',
  } as CSSProperties,
  progressBarInner: {
    height: '100%',
    background: 'var(--accent)',
    borderRadius: '4px 0 0 4px',
    transition: 'width 0.3s ease',
  } as CSSProperties,
  progressBarText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    pointerEvents: 'none',
  } as CSSProperties,
  slippageTag: {
    alignSelf: 'flex-start',
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    fontWeight: 600,
    marginTop: 4,
  } as CSSProperties,
};
