'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';

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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'daily-reports' | 'delay-logs' | 'material-consumption' | 'labour-allocations' | 'progress-mapping'>('daily-reports');
  const dailyReports = initialDailyReports;
  const delayLogs = initialDelayLogs;
  const materialConsumption = initialMaterialConsumption;
  const labourAllocations = initialLabourAllocations;
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.title }));

  const handleSubmitDailyReport = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/site/daily-reports/${id}/submit`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to submit daily report');
    }
  };

  const handleResolveDelay = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/site/delay-logs/${id}/resolve`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to resolve delay');
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
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Daily Report"
              buttonLabel="Draft Daily Report"
              subtitle="Draft the site diary entry for the day. It stays a draft until formally submitted."
              endpoint="/api/site/daily-reports"
              fields={[
                { name: 'projectId', label: 'Project', kind: 'select', required: true, labelField: 'projectName', options: projectOptions, span: 2 },
                { name: 'date', label: 'Report date', kind: 'date', required: true, defaultValue: today, span: 2 },
                { name: 'manpowerCount', label: 'Manpower count', kind: 'number', defaultValue: '0', placeholder: 'Total workers on site' },
                { name: 'equipmentCount', label: 'Active heavy equipment count', kind: 'number', defaultValue: '0', placeholder: 'Total machines on site' },
                { name: 'workDescription', label: 'Work description', kind: 'textarea', required: true, placeholder: 'Describe active tasks completed, locations worked, safety meetings held…' },
              ]}
            />
          </div>

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
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Delay Log"
              buttonLabel="Log Delay Incident"
              subtitle="Log a site delay with its cause and estimated schedule impact in hours."
              endpoint="/api/site/delay-logs"
              fields={[
                { name: 'projectId', label: 'Project', kind: 'select', required: true, labelField: 'projectName', options: projectOptions, span: 2 },
                { name: 'date', label: 'Date', kind: 'date', required: true, defaultValue: today },
                {
                  name: 'delayType',
                  label: 'Delay type',
                  kind: 'select',
                  defaultValue: 'weather',
                  options: [
                    { value: 'weather', label: 'Weather Delay' },
                    { value: 'material', label: 'Material Stock Shortage' },
                    { value: 'access', label: 'Site Access / Civil Obstruction' },
                    { value: 'drawings', label: 'Design drawing clarification / RFI pending' },
                    { value: 'other', label: 'Other Outage' },
                  ],
                },
                { name: 'impactHours', label: 'Estimated impact hours', kind: 'number', defaultValue: '0', placeholder: 'e.g. 4.5', span: 2 },
                { name: 'description', label: 'Delay description', kind: 'textarea', required: true, placeholder: 'Detail cause of delay, impacted tasks, immediate measures taken…' },
              ]}
            />
          </div>

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
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Material Consumption"
              buttonLabel="Log Material Consumption"
              subtitle="Record materials consumed on site against a project."
              endpoint="/api/site/material-consumption"
              fields={[
                { name: 'projectId', label: 'Project', kind: 'select', required: true, labelField: 'projectName', options: projectOptions, span: 2 },
                { name: 'date', label: 'Date', kind: 'date', required: true, defaultValue: today },
                { name: 'itemId', label: 'Material item ID', kind: 'text', required: true, placeholder: 'e.g. steel-rebar-16' },
                { name: 'itemName', label: 'Item name', kind: 'text', required: true, placeholder: 'e.g. 16mm High Tensile Rebar', span: 2 },
                { name: 'quantityConsumed', label: 'Quantity consumed', kind: 'number', required: true, placeholder: 'e.g. 12.5' },
                { name: 'unit', label: 'Unit of measurement', kind: 'text', required: true, placeholder: 'e.g. tons, bags, meters' },
              ]}
            />
          </div>

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
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Labour Allocation"
              buttonLabel="Log Labour Allocation"
              subtitle="Record daily labour by trade. Man-hours = headcount × hours, computed by the API."
              endpoint="/api/site/labour"
              fields={[
                { name: 'projectId', label: 'Project', kind: 'select', required: true, labelField: 'projectName', options: projectOptions, span: 2 },
                { name: 'date', label: 'Date', kind: 'date', required: true, defaultValue: today },
                { name: 'trade', label: 'Trade / designation', kind: 'text', required: true, placeholder: 'e.g. Mason, Steel Fixer, Carpenter' },
                { name: 'headcount', label: 'Headcount', kind: 'number', required: true, placeholder: 'Number of workers' },
                { name: 'hours', label: 'Hours worked per person', kind: 'number', required: true, placeholder: 'Hours worked' },
                { name: 'subcontractorName', label: 'Subcontractor name', kind: 'text', placeholder: 'e.g. Al Falah Co.', span: 2 },
                { name: 'notes', label: 'Notes', kind: 'textarea', placeholder: 'Specific tasks worked, zones assigned, tool box topics discussed…' },
              ]}
            />
          </div>

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
  tabHeader: { display: 'flex', justifyContent: 'flex-end', margin: '0 0 12px' } as CSSProperties,
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
