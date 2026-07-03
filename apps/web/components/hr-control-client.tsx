'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';

interface Employee {
  id: string;
  tenantId: string;
  companyId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string;
  department: string;
  status: 'active' | 'suspended' | 'terminated';
  joinedDate: string;
  visaExpiry: string | null;
  permitExpiry: string | null;
  laborCamp: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Leave {
  id: string;
  tenantId: string;
  companyId: string | null;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PayrollRun {
  id: string;
  tenantId: string;
  companyId: string | null;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: 'draft' | 'approved' | 'paid';
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialEmployees: Employee[];
  initialLeaves: Leave[];
  initialPayrollRuns: PayrollRun[];
}

export default function HrControlClient({
  initialEmployees,
  initialLeaves,
  initialPayrollRuns,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'employees' | 'leaves' | 'payroll'>('employees');
  const employees = initialEmployees;
  const leaves = initialLeaves;
  const payrollRuns = initialPayrollRuns;
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const employeeOptions = employees.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName} (${p.role})` }));

  // Helper: check if a date is within 30 days or passed
  const getVisaExpiryStatus = (dateStr: string | null) => {
    if (!dateStr) return { level: 'none', label: '—' };
    const date = new Date(dateStr);
    const diff = date.getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 3600 * 24));
    if (days < 0) return { level: 'danger', label: `Expired (${Math.abs(days)}d ago)` };
    if (days <= 30) return { level: 'warning', label: `Expires soon (${days}d left)` };
    return { level: 'ok', label: `${dateStr} (${days}d left)` };
  };

  const handleDeleteEmployee = async (id: string) => {
    setError(null);
    if (!confirm('Are you sure you want to delete this employee profile?')) return;
    try {
      const res = await fetch(`/api/hr/employees/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to delete employee profile');
    }
  };

  const handleResolveLeave = async (id: string, status: 'approved' | 'rejected') => {
    setError(null);
    try {
      const res = await fetch(`/api/hr/leaves/${id}/resolve`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to resolve leave request');
    }
  };

  const handlePayPayroll = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hr/payroll/${id}/pay`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to pay payroll run');
    }
  };

  const getEmployeeName = (id: string) => {
    const emp = employees.find((e) => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown';
  };

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      {/* Tabs */}
      <div style={st.tabs}>
        <button
          onClick={() => setActiveTab('employees')}
          style={activeTab === 'employees' ? st.activeTabBtn : st.tabBtn}
        >
          Employee Profiles
        </button>
        <button
          onClick={() => setActiveTab('leaves')}
          style={activeTab === 'leaves' ? st.activeTabBtn : st.tabBtn}
        >
          Leave Management
        </button>
        <button
          onClick={() => setActiveTab('payroll')}
          style={activeTab === 'payroll' ? st.activeTabBtn : st.tabBtn}
        >
          Payroll Processing
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'employees' && (
        <div>
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Employee"
              buttonLabel="Register Employee"
              subtitle="Register an employee profile with UAE visa, work permit, and labor camp details."
              endpoint="/api/hr/employees"
              fields={[
                { name: 'firstName', label: 'First name', kind: 'text', required: true, placeholder: 'John' },
                { name: 'lastName', label: 'Last name', kind: 'text', required: true, placeholder: 'Doe' },
                { name: 'role', label: 'Job title / role', kind: 'text', required: true, placeholder: 'e.g. Pipefitter, Site Engineer' },
                { name: 'department', label: 'Department', kind: 'text', required: true, placeholder: 'e.g. Operations, Corporate' },
                { name: 'joinedDate', label: 'Joined date', kind: 'date', required: true, defaultValue: today },
                { name: 'laborCamp', label: 'Labor camp designation', kind: 'text', placeholder: 'e.g. Sonapur Block C, Al Quoz 2' },
                { name: 'visaExpiry', label: 'UAE visa expiry', kind: 'date' },
                { name: 'permitExpiry', label: 'Work permit expiry', kind: 'date' },
                { name: 'email', label: 'Email address', kind: 'text', placeholder: 'john.doe@aura.com' },
                { name: 'phone', label: 'Phone number', kind: 'text', placeholder: '+971 50...' },
              ]}
            />
          </div>

          {/* List panel */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Active Staff Directory</h3>
            {employees.length === 0 ? (
              <p style={st.muted}>No employee profiles registered yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={st.table}>
                  <thead>
                    <tr>
                      {['Name', 'Role', 'Department', 'Camp/Housing', 'Joined Date', 'Visa Status', 'Permit Status', 'Actions'].map((h) => (
                        <th key={h} style={st.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => {
                      const visaStatus = getVisaExpiryStatus(emp.visaExpiry);
                      const permitStatus = getVisaExpiryStatus(emp.permitExpiry);

                      return (
                        <tr key={emp.id}>
                          <td style={st.tdBold}>{emp.firstName} {emp.lastName}</td>
                          <td style={st.tdCode}>{emp.role}</td>
                          <td style={st.td}>{emp.department}</td>
                          <td style={st.tdMuted}>{emp.laborCamp || '—'}</td>
                          <td style={st.tdMuted}>{emp.joinedDate}</td>
                          <td style={st.td}>
                            <span style={
                              visaStatus.level === 'danger' ? st.tagOutbound :
                              visaStatus.level === 'warning' ? st.tagPending :
                              visaStatus.level === 'ok' ? st.tagApproved : st.tagMuted
                            }>
                              {visaStatus.label}
                            </span>
                          </td>
                          <td style={st.td}>
                            <span style={
                              permitStatus.level === 'danger' ? st.tagOutbound :
                              permitStatus.level === 'warning' ? st.tagPending :
                              permitStatus.level === 'ok' ? st.tagApproved : st.tagMuted
                            }>
                              {permitStatus.label}
                            </span>
                          </td>
                          <td style={st.td}>
                            <button
                              onClick={() => handleDeleteEmployee(emp.id)}
                              style={st.btnReject}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'leaves' && (
        <div>
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Leave Request"
              buttonLabel="Submit Leave Request"
              subtitle="Submit a leave or absence request. It stays pending until HR approves or rejects it."
              endpoint="/api/hr/leaves"
              fields={[
                { name: 'employeeId', label: 'Employee', kind: 'select', required: true, options: employeeOptions, span: 2 },
                {
                  name: 'leaveType',
                  label: 'Leave type',
                  kind: 'select',
                  defaultValue: 'annual',
                  span: 2,
                  options: [
                    { value: 'annual', label: 'Annual Leave' },
                    { value: 'sick', label: 'Sick Leave' },
                    { value: 'unpaid', label: 'Unpaid Leave' },
                    { value: 'emergency', label: 'Emergency / Compassionate' },
                  ],
                },
                { name: 'startDate', label: 'Start date', kind: 'date', required: true, defaultValue: today },
                { name: 'endDate', label: 'End date', kind: 'date', required: true, defaultValue: today },
                { name: 'reason', label: 'Reason / comments', kind: 'text', placeholder: 'e.g. Annual travel back home, medical checkup', span: 2 },
              ]}
            />
          </div>

          {/* Leave Log Registry */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Leave & Absence Requests</h3>
            {leaves.length === 0 ? (
              <p style={st.muted}>No leave logs recorded.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Employee', 'Leave Type', 'Period', 'Reason', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((l) => (
                    <tr key={l.id}>
                      <td style={st.tdBold}>{getEmployeeName(l.employeeId)}</td>
                      <td style={st.tdCode}>{l.leaveType}</td>
                      <td style={st.tdMuted}>{l.startDate} to {l.endDate}</td>
                      <td style={st.td}>{l.reason || '—'}</td>
                      <td style={st.td}>
                        <span style={
                          l.status === 'approved' ? st.tagApproved :
                          l.status === 'rejected' ? st.tagOutbound : st.tagPending
                        }>
                          {l.status}
                        </span>
                      </td>
                      <td style={st.td}>
                        {l.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleResolveLeave(l.id, 'approved')}
                              style={st.btnApprove}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleResolveLeave(l.id, 'rejected')}
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

      {activeTab === 'payroll' && (
        <div>
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Payroll Run"
              buttonLabel="Generate Payroll Run"
              subtitle="Generate a payroll run for one employee and pay period. Net salary = basic + allowances − deductions, computed by the API."
              endpoint="/api/hr/payroll"
              fields={[
                { name: 'employeeId', label: 'Employee', kind: 'select', required: true, options: employeeOptions, span: 2 },
                { name: 'periodStart', label: 'Period start', kind: 'date', required: true },
                { name: 'periodEnd', label: 'Period end', kind: 'date', required: true },
                { name: 'basicSalary', label: 'Basic salary (AED)', kind: 'number', required: true, placeholder: '5000' },
                { name: 'allowances', label: 'Allowances (AED)', kind: 'number', defaultValue: '0', placeholder: '1000' },
                { name: 'deductions', label: 'Deductions (AED)', kind: 'number', defaultValue: '0', placeholder: '200' },
              ]}
            />
          </div>

          {/* Payroll Registry */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Payroll Ledger & Runs</h3>
            {payrollRuns.length === 0 ? (
              <p style={st.muted}>No payroll runs calculated yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Employee', 'Pay Period', 'Basic (AED)', 'Allowances', 'Deductions', 'Net Salary', 'Status', 'Processed At', 'Actions'].map((h) => (
                      <th key={h} style={st.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payrollRuns.map((r) => (
                    <tr key={r.id}>
                      <td style={st.tdBold}>{getEmployeeName(r.employeeId)}</td>
                      <td style={st.tdMuted}>{r.periodStart} to {r.periodEnd}</td>
                      <td style={st.tdCode}>{r.basicSalary.toLocaleString()}</td>
                      <td style={st.tdCode}>{r.allowances.toLocaleString()}</td>
                      <td style={st.tdCode}>{r.deductions.toLocaleString()}</td>
                      <td style={st.tdBold}>{r.netSalary.toLocaleString()}</td>
                      <td style={st.td}>
                        <span style={
                          r.status === 'paid' ? st.tagApproved :
                          r.status === 'approved' ? st.tagActive : st.tagPending
                        }>
                          {r.status}
                        </span>
                      </td>
                      <td style={st.tdMuted}>{r.processedAt || 'Pending Payout'}</td>
                      <td style={st.td}>
                        {r.status !== 'paid' && (
                          <button
                            onClick={() => handlePayPayroll(r.id)}
                            style={st.btnApprove}
                          >
                            Disburse & Pay
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
  errorPanel: {
    padding: '12px 16px',
    borderRadius: 8,
    background: 'rgba(248, 113, 113, 0.1)',
    color: '#f87171',
    border: '1px solid rgba(248, 113, 113, 0.2)',
    fontSize: 13.5,
    margin: '0 0 20px',
  } as CSSProperties,
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
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 20,
  } as CSSProperties,
  panelTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 600 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 14 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--muted)',
    fontWeight: 500,
  } as CSSProperties,
  td: {
    padding: '12px',
    borderBottom: '1px solid var(--border)',
    color: '#fff',
    verticalAlign: 'middle',
  } as CSSProperties,
  tdBold: {
    padding: '12px',
    borderBottom: '1px solid var(--border)',
    color: '#fff',
    fontWeight: 600,
    verticalAlign: 'middle',
  } as CSSProperties,
  tdCode: {
    padding: '12px',
    borderBottom: '1px solid var(--border)',
    color: '#fff',
    fontFamily: 'monospace',
    verticalAlign: 'middle',
  } as CSSProperties,
  tdMuted: {
    padding: '12px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--muted)',
    verticalAlign: 'middle',
  } as CSSProperties,
  tagInbound: {
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(56, 189, 248, 0.1)',
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: 500,
  } as CSSProperties,
  tagOutbound: {
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(248, 113, 113, 0.1)',
    color: '#f87171',
    fontSize: 12,
    fontWeight: 500,
  } as CSSProperties,
  tagApproved: {
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(52, 211, 153, 0.1)',
    color: '#34d399',
    fontSize: 12,
    fontWeight: 500,
  } as CSSProperties,
  tagActive: {
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(251, 191, 36, 0.1)',
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: 500,
  } as CSSProperties,
  tagPending: {
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'var(--muted)',
    fontSize: 12,
    fontWeight: 500,
  } as CSSProperties,
  tagMuted: {
    padding: '3px 8px',
    borderRadius: 6,
    color: 'var(--muted)',
    fontSize: 12,
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
};
