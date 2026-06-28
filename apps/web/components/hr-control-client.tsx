'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';

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
  const [activeTab, setActiveTab] = useState<'employees' | 'leaves' | 'payroll'>('employees');
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [leaves, setLeaves] = useState<Leave[]>(initialLeaves);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>(initialPayrollRuns);
  const [error, setError] = useState<string | null>(null);

  // Employee Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [joinedDate, setJoinedDate] = useState(new Date().toISOString().split('T')[0]);
  const [visaExpiry, setVisaExpiry] = useState('');
  const [permitExpiry, setPermitExpiry] = useState('');
  const [laborCamp, setLaborCamp] = useState('');

  // Leave Form State
  const [leaveEmployeeId, setLeaveEmployeeId] = useState(employees[0]?.id || '');
  const [leaveType, setLeaveType] = useState('annual');
  const [leaveStartDate, setLeaveStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaveEndDate, setLeaveEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaveReason, setLeaveReason] = useState('');

  // Payroll Form State
  const [payEmployeeId, setPayEmployeeId] = useState(employees[0]?.id || '');
  const [payPeriodStart, setPayPeriodStart] = useState('');
  const [payPeriodEnd, setPayPeriodEnd] = useState('');
  const [payBasic, setPayBasic] = useState<number>(0);
  const [payAllowances, setPayAllowances] = useState<number>(0);
  const [payDeductions, setPayDeductions] = useState<number>(0);

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

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email: email || null,
          phone: phone || null,
          role,
          department,
          joinedDate,
          visaExpiry: visaExpiry || null,
          permitExpiry: permitExpiry || null,
          laborCamp: laborCamp || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newEmp = await res.json();
      setEmployees([newEmp, ...employees]);
      if (!leaveEmployeeId) setLeaveEmployeeId(newEmp.id);
      if (!payEmployeeId) setPayEmployeeId(newEmp.id);
      
      // Reset form
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setRole('');
      setDepartment('');
      setVisaExpiry('');
      setPermitExpiry('');
      setLaborCamp('');
    } catch (err: any) {
      setError(err.message || 'Failed to create employee profile');
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    setError(null);
    if (!confirm('Are you sure you want to delete this employee profile?')) return;
    try {
      const res = await fetch(`/api/hr/employees/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await res.text());
      setEmployees(employees.filter((emp) => emp.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete employee profile');
    }
  };

  const handleRequestLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = leaveEmployeeId || employees[0]?.id;
    if (!targetEmpId) {
      setError('Please create at least one employee first.');
      return;
    }
    setError(null);
    try {
      const res = await fetch('/api/hr/leaves', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          employeeId: targetEmpId,
          leaveType,
          startDate: leaveStartDate,
          endDate: leaveEndDate,
          reason: leaveReason || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newLeave = await res.json();
      setLeaves([newLeave, ...leaves]);
      setLeaveReason('');
    } catch (err: any) {
      setError(err.message || 'Failed to submit leave request');
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
      const updated = await res.json();
      setLeaves(leaves.map((l) => (l.id === id ? updated : l)));
    } catch (err: any) {
      setError(err.message || 'Failed to resolve leave request');
    }
  };

  const handleRunPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = payEmployeeId || employees[0]?.id;
    if (!targetEmpId) {
      setError('Please create at least one employee first.');
      return;
    }
    if (!payPeriodStart || !payPeriodEnd) {
      setError('Please specify the pay period.');
      return;
    }
    setError(null);
    try {
      const res = await fetch('/api/hr/payroll', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          employeeId: targetEmpId,
          periodStart: payPeriodStart,
          periodEnd: payPeriodEnd,
          basicSalary: Number(payBasic),
          allowances: Number(payAllowances),
          deductions: Number(payDeductions),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newRun = await res.json();
      setPayrollRuns([newRun, ...payrollRuns]);
      setPayBasic(0);
      setPayAllowances(0);
      setPayDeductions(0);
    } catch (err: any) {
      setError(err.message || 'Failed to process payroll run');
    }
  };

  const handlePayPayroll = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hr/payroll/${id}/pay`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setPayrollRuns(payrollRuns.map((r) => (r.id === id ? updated : r)));
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
          {/* Create Employee Form */}
          <form onSubmit={handleCreateEmployee} style={st.formCard}>
            <h3 style={st.formTitle}>Add New Employee Profile</h3>
            <div style={st.formGrid}>
              <div style={st.field}>
                <label style={st.label}>First Name</label>
                <input
                  type="text"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Last Name</label>
                <input
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Job Title / Role</label>
                <input
                  type="text"
                  placeholder="e.g. Pipefitter, Site Engineer"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Department</label>
                <input
                  type="text"
                  placeholder="e.g. Operations, Corporate"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Joined Date</label>
                <input
                  type="date"
                  value={joinedDate}
                  onChange={(e) => setJoinedDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>UAE Visa Expiry (Optional)</label>
                <input
                  type="date"
                  value={visaExpiry}
                  onChange={(e) => setVisaExpiry(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Work Permit Expiry (Optional)</label>
                <input
                  type="date"
                  value={permitExpiry}
                  onChange={(e) => setPermitExpiry(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Labor Camp Designation</label>
                <input
                  type="text"
                  placeholder="e.g. Sonapur Block C, Al Quoz 2"
                  value={laborCamp}
                  onChange={(e) => setLaborCamp(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Email Address</label>
                <input
                  type="email"
                  placeholder="john.doe@aura.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Phone Number</label>
                <input
                  type="text"
                  placeholder="+971 50..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={st.input}
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Register Employee</button>
          </form>

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
          {/* Leave Request Form */}
          <form onSubmit={handleRequestLeave} style={st.formCard}>
            <h3 style={st.formTitle}>Submit Leave Request</h3>
            <div style={st.formGrid}>
              <div style={st.field}>
                <label style={st.label}>Employee</label>
                <select
                  value={leaveEmployeeId}
                  onChange={(e) => setLeaveEmployeeId(e.target.value)}
                  style={st.select}
                  required
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName} ({p.role})
                    </option>
                  ))}
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Leave Type</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  style={st.select}
                >
                  <option value="annual">Annual Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                  <option value="emergency">Emergency / Compassionate</option>
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Start Date</label>
                <input
                  type="date"
                  value={leaveStartDate}
                  onChange={(e) => setLeaveStartDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>End Date</label>
                <input
                  type="date"
                  value={leaveEndDate}
                  onChange={(e) => setLeaveEndDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Reason / Comments</label>
                <input
                  type="text"
                  placeholder="e.g. Annual travel back home, medical checkup"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  style={st.input}
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Submit Leave Request</button>
          </form>

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
          {/* Run Payroll Form */}
          <form onSubmit={handleRunPayroll} style={st.formCard}>
            <h3 style={st.formTitle}>Generate Payroll Run</h3>
            <div style={st.formGrid}>
              <div style={st.field}>
                <label style={st.label}>Employee</label>
                <select
                  value={payEmployeeId}
                  onChange={(e) => setPayEmployeeId(e.target.value)}
                  style={st.select}
                  required
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName} ({p.role})
                    </option>
                  ))}
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Period Start</label>
                <input
                  type="date"
                  value={payPeriodStart}
                  onChange={(e) => setPayPeriodStart(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Period End</label>
                <input
                  type="date"
                  value={payPeriodEnd}
                  onChange={(e) => setPayPeriodEnd(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Basic Salary (AED)</label>
                <input
                  type="number"
                  placeholder="5000"
                  value={payBasic}
                  onChange={(e) => setPayBasic(Number(e.target.value))}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Allowances (AED)</label>
                <input
                  type="number"
                  placeholder="1000"
                  value={payAllowances}
                  onChange={(e) => setPayAllowances(Number(e.target.value))}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Deductions (AED)</label>
                <input
                  type="number"
                  placeholder="200"
                  value={payDeductions}
                  onChange={(e) => setPayDeductions(Number(e.target.value))}
                  style={st.input}
                  required
                />
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
              Net Salary: <strong style={{ color: '#fff' }}>AED {(payBasic + payAllowances - payDeductions).toLocaleString()}</strong>
            </div>
            <button type="submit" style={st.btn}>Calculate & Run Payroll</button>
          </form>

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
