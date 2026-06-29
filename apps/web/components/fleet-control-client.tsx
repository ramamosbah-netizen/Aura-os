'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';

interface Vehicle {
  id: string;
  tenantId: string;
  companyId: string | null;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  registrationExpiry: string | null;
  status: 'active' | 'maintenance' | 'retired';
  driverEmployeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FuelLog {
  id: string;
  tenantId: string;
  companyId: string | null;
  vehicleId: string;
  date: string;
  liters: number;
  cost: number;
  odometer: number;
  createdAt: string;
  updatedAt: string;
}

interface MaintenanceRecord {
  id: string;
  tenantId: string;
  companyId: string | null;
  vehicleId: string;
  date: string;
  description: string;
  cost: number;
  status: 'scheduled' | 'completed';
  createdAt: string;
  updatedAt: string;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface Props {
  initialVehicles: Vehicle[];
  initialFuelLogs: FuelLog[];
  initialMaintenance: MaintenanceRecord[];
  employees: Employee[];
}

export default function FleetControlClient({
  initialVehicles,
  initialFuelLogs,
  initialMaintenance,
  employees,
}: Props) {
  const [activeTab, setActiveTab] = useState<'vehicles' | 'fuel' | 'maintenance'>('vehicles');
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>(initialFuelLogs);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>(initialMaintenance);
  const [error, setError] = useState<string | null>(null);

  // Vehicle Form State
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [plateNumber, setPlateNumber] = useState('');
  const [regExpiry, setRegExpiry] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleStatus, setVehicleStatus] = useState<Vehicle['status']>('active');

  // Fuel Form State
  const [fuelVehicleId, setFuelVehicleId] = useState(vehicles[0]?.id || '');
  const [fuelDate, setFuelDate] = useState(new Date().toISOString().split('T')[0]);
  const [fuelLiters, setFuelLiters] = useState<number>(0);
  const [fuelCost, setFuelCost] = useState<number>(0);
  const [fuelOdometer, setFuelOdometer] = useState<number>(0);

  // Maintenance Form State
  const [maintVehicleId, setMaintVehicleId] = useState(vehicles[0]?.id || '');
  const [maintDate, setMaintDate] = useState(new Date().toISOString().split('T')[0]);
  const [maintDesc, setMaintDesc] = useState('');
  const [maintCost, setMaintCost] = useState<number>(0);

  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/fleet/vehicles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          make,
          model,
          year: Number(year),
          plateNumber,
          registrationExpiry: regExpiry || null,
          status: vehicleStatus,
          driverEmployeeId: driverId || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newV = await res.json();
      setVehicles([newV, ...vehicles]);
      if (!fuelVehicleId) setFuelVehicleId(newV.id);
      if (!maintVehicleId) setMaintVehicleId(newV.id);

      // Reset
      setMake('');
      setModel('');
      setPlateNumber('');
      setRegExpiry('');
      setDriverId('');
    } catch (err: any) {
      setError(err.message || 'Failed to create vehicle profile');
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    setError(null);
    if (!confirm('Are you sure you want to delete this vehicle?')) return;
    try {
      const res = await fetch(`/api/fleet/vehicles/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await res.text());
      setVehicles(vehicles.filter((v) => v.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete vehicle');
    }
  };

  const handleLogFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetVehId = fuelVehicleId || vehicles[0]?.id;
    if (!targetVehId) {
      setError('Please register a vehicle first.');
      return;
    }
    setError(null);
    try {
      const res = await fetch('/api/fleet/fuel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vehicleId: targetVehId,
          date: fuelDate,
          liters: Number(fuelLiters),
          cost: Number(fuelCost),
          odometer: Number(fuelOdometer),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newLog = await res.json();
      setFuelLogs([newLog, ...fuelLogs]);

      // Reset
      setFuelLiters(0);
      setFuelCost(0);
      setFuelOdometer(0);
    } catch (err: any) {
      setError(err.message || 'Failed to log fuel entry');
    }
  };

  const handleScheduleMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetVehId = maintVehicleId || vehicles[0]?.id;
    if (!targetVehId) {
      setError('Please register a vehicle first.');
      return;
    }
    setError(null);
    try {
      const res = await fetch('/api/fleet/maintenance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vehicleId: targetVehId,
          date: maintDate,
          description: maintDesc,
          cost: Number(maintCost),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newM = await res.json();
      setMaintenance([newM, ...maintenance]);

      // Reset
      setMaintDesc('');
      setMaintCost(0);
    } catch (err: any) {
      setError(err.message || 'Failed to schedule maintenance');
    }
  };

  const handleCompleteMaintenance = async (id: string) => {
    setError(null);
    const costStr = prompt('Enter final actual maintenance cost (AED):', '0');
    if (costStr === null) return;
    const actualCost = Number(costStr);
    if (isNaN(actualCost) || actualCost < 0) {
      setError('Invalid cost entered.');
      return;
    }
    try {
      const res = await fetch(`/api/fleet/maintenance/${id}/complete`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actualCost }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setMaintenance(maintenance.map((m) => (m.id === id ? updated : m)));
    } catch (err: any) {
      setError(err.message || 'Failed to complete maintenance');
    }
  };

  const getVehicleDisplay = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.make} ${v.model} (${v.plateNumber})` : 'Unknown Vehicle';
  };

  const getDriverName = (id: string | null) => {
    if (!id) return 'Not Assigned';
    const emp = employees.find((e) => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown Staff';
  };

  const getRegExpiryStatus = (dateStr: string | null) => {
    if (!dateStr) return { level: 'none', label: '—' };
    const date = new Date(dateStr);
    const diff = date.getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 3600 * 24));
    if (days < 0) return { level: 'danger', label: `Expired (${Math.abs(days)}d ago)` };
    if (days <= 30) return { level: 'warning', label: `Expires soon (${days}d left)` };
    return { level: 'ok', label: `${dateStr} (${days}d left)` };
  };

  return (
    <div>
      {error && <div style={st.errorPanel}>{error}</div>}

      {/* Tabs */}
      <div style={st.tabs}>
        <button
          onClick={() => setActiveTab('vehicles')}
          style={activeTab === 'vehicles' ? st.activeTabBtn : st.tabBtn}
        >
          Vehicles & Equipment
        </button>
        <button
          onClick={() => setActiveTab('fuel')}
          style={activeTab === 'fuel' ? st.activeTabBtn : st.tabBtn}
        >
          Fuel Logs
        </button>
        <button
          onClick={() => setActiveTab('maintenance')}
          style={activeTab === 'maintenance' ? st.activeTabBtn : st.tabBtn}
        >
          Preventative Maintenance
        </button>
      </div>

      {/* Vehicles Tab */}
      {activeTab === 'vehicles' && (
        <div>
          {/* Create Vehicle Form */}
          <form onSubmit={handleCreateVehicle} style={st.formCard}>
            <h3 style={st.formTitle}>Register Vehicle / Heavy Machinery</h3>
            <div style={st.formGrid}>
              <div style={st.field}>
                <label style={st.label}>Make / Brand</label>
                <input
                  type="text"
                  placeholder="e.g. Toyota"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Model</label>
                <input
                  type="text"
                  placeholder="e.g. Hilux Pickup"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Manufacture Year</label>
                <input
                  type="number"
                  placeholder="2025"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Plate / Serial Number</label>
                <input
                  type="text"
                  placeholder="e.g. DXB-12345"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Registration Expiry Date</label>
                <input
                  type="date"
                  value={regExpiry}
                  onChange={(e) => setRegExpiry(e.target.value)}
                  style={st.input}
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Assigned Driver (Staff Link)</label>
                <select
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  style={st.select}
                >
                  <option value="">-- No Assigned Driver --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.role})
                    </option>
                  ))}
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Initial Status</label>
                <select
                  value={vehicleStatus}
                  onChange={(e) => setVehicleStatus(e.target.value as any)}
                  style={st.select}
                >
                  <option value="active">Active</option>
                  <option value="maintenance">Under Maintenance</option>
                  <option value="retired">Retired / Sold</option>
                </select>
              </div>
            </div>
            <button type="submit" style={st.btn}>Register Vehicle</button>
          </form>

          {/* Vehicles Table */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Active Fleet Directory</h3>
            {vehicles.length === 0 ? (
              <p style={st.muted}>No vehicles or equipment registered in the fleet yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={st.table}>
                  <thead>
                    <tr>
                      {['Make / Model', 'Year', 'Plate Number', 'Assigned Driver', 'Registration Expiry', 'Status', 'Actions'].map((h) => (
                        <th key={h} style={st.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v) => {
                      const expiryStatus = getRegExpiryStatus(v.registrationExpiry);
                      return (
                        <tr key={v.id}>
                          <td style={st.tdBold}>{v.make} {v.model}</td>
                          <td style={st.td}>{v.year}</td>
                          <td style={st.tdCode}>{v.plateNumber}</td>
                          <td style={st.tdBold}>{getDriverName(v.driverEmployeeId)}</td>
                          <td style={st.td}>
                            <span style={
                              expiryStatus.level === 'danger' ? st.tagOutbound :
                              expiryStatus.level === 'warning' ? st.tagPending :
                              expiryStatus.level === 'ok' ? st.tagApproved : st.tagMuted
                            }>
                              {expiryStatus.label}
                            </span>
                          </td>
                          <td style={st.td}>
                            <span style={
                              v.status === 'active' ? st.tagApproved :
                              v.status === 'maintenance' ? st.tagPending : st.tagMuted
                            }>
                              {v.status}
                            </span>
                          </td>
                          <td style={st.td}>
                            <button
                              onClick={() => handleDeleteVehicle(v.id)}
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

      {/* Fuel logs Tab */}
      {activeTab === 'fuel' && (
        <div>
          {/* Log Fuel Form */}
          <form onSubmit={handleLogFuel} style={st.formCard}>
            <h3 style={st.formTitle}>Log Fuel Consumption</h3>
            <div style={st.formGrid}>
              <div style={st.field}>
                <label style={st.label}>Vehicle</label>
                <select
                  value={fuelVehicleId}
                  onChange={(e) => setFuelVehicleId(e.target.value)}
                  style={st.select}
                  required
                >
                  <option value="">-- Select Vehicle --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.make} {v.model} ({v.plateNumber})
                    </option>
                  ))}
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Refuel Date</label>
                <input
                  type="date"
                  value={fuelDate}
                  onChange={(e) => setFuelDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Liters (L)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="50"
                  value={fuelLiters}
                  onChange={(e) => setFuelLiters(Number(e.target.value))}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Cost (AED)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="150"
                  value={fuelCost}
                  onChange={(e) => setFuelCost(Number(e.target.value))}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Odometer Reading (km)</label>
                <input
                  type="number"
                  placeholder="120000"
                  value={fuelOdometer}
                  onChange={(e) => setFuelOdometer(Number(e.target.value))}
                  style={st.input}
                  required
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Log Fuel Entry</button>
          </form>

          {/* Fuel Log registry */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Fuel Consumption Entries</h3>
            {fuelLogs.length === 0 ? (
              <p style={st.muted}>No fuel logs recorded yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={st.table}>
                  <thead>
                    <tr>
                      {['Vehicle', 'Refuel Date', 'Liters (L)', 'Cost (AED)', 'Odometer Reading'].map((h) => (
                        <th key={h} style={st.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fuelLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={st.tdBold}>{getVehicleDisplay(log.vehicleId)}</td>
                        <td style={st.tdMuted}>{log.date}</td>
                        <td style={st.tdCode}>{log.liters.toLocaleString()} L</td>
                        <td style={st.tdBold}>{log.cost.toLocaleString()} AED</td>
                        <td style={st.tdCode}>{log.odometer.toLocaleString()} km</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Maintenance Tab */}
      {activeTab === 'maintenance' && (
        <div>
          {/* Schedule Maintenance Form */}
          <form onSubmit={handleScheduleMaintenance} style={st.formCard}>
            <h3 style={st.formTitle}>Schedule Preventative / Corrective Maintenance</h3>
            <div style={st.formGrid}>
              <div style={st.field}>
                <label style={st.label}>Vehicle</label>
                <select
                  value={maintVehicleId}
                  onChange={(e) => setMaintVehicleId(e.target.value)}
                  style={st.select}
                  required
                >
                  <option value="">-- Select Vehicle --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.make} {v.model} ({v.plateNumber})
                    </option>
                  ))}
                </select>
              </div>
              <div style={st.field}>
                <label style={st.label}>Maintenance Date</label>
                <input
                  type="date"
                  value={maintDate}
                  onChange={(e) => setMaintDate(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Estimated Cost (AED)</label>
                <input
                  type="number"
                  placeholder="500"
                  value={maintCost}
                  onChange={(e) => setMaintCost(Number(e.target.value))}
                  style={st.input}
                />
              </div>
              <div style={{ ...st.field, gridColumn: 'span 2' }}>
                <label style={st.label}>Description of Work</label>
                <input
                  type="text"
                  placeholder="e.g. 50k km Service, Brake replacement, Salik tag replacement"
                  value={maintDesc}
                  onChange={(e) => setMaintDesc(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Schedule Maintenance</button>
          </form>

          {/* Maintenance Registry */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Maintenance Ledger</h3>
            {maintenance.length === 0 ? (
              <p style={st.muted}>No scheduled maintenance items recorded.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={st.table}>
                  <thead>
                    <tr>
                      {['Vehicle', 'Date', 'Description', 'Cost (AED)', 'Status', 'Actions'].map((h) => (
                        <th key={h} style={st.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {maintenance.map((m) => (
                      <tr key={m.id}>
                        <td style={st.tdBold}>{getVehicleDisplay(m.vehicleId)}</td>
                        <td style={st.tdMuted}>{m.date}</td>
                        <td style={st.td}>{m.description}</td>
                        <td style={st.tdBold}>{m.cost.toLocaleString()} AED</td>
                        <td style={st.td}>
                          <span style={
                            m.status === 'completed' ? st.tagApproved : st.tagPending
                          }>
                            {m.status}
                          </span>
                        </td>
                        <td style={st.td}>
                          {m.status === 'scheduled' && (
                            <button
                              onClick={() => handleCompleteMaintenance(m.id)}
                              style={st.btnApprove}
                            >
                              Complete Work
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
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5, textAlign: 'left' } as CSSProperties,
  th: {
    padding: '12px 16px',
    color: 'var(--muted)',
    fontWeight: 500,
    borderBottom: '1px solid var(--border)',
    fontSize: 12.5,
  } as CSSProperties,
  td: { padding: '14px 16px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdBold: { padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 } as CSSProperties,
  tdCode: {
    padding: '14px 16px',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'monospace',
    color: 'var(--accent)',
  } as CSSProperties,
  tdMuted: { padding: '14px 16px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13.5, margin: 0 } as CSSProperties,
  btnApprove: {
    padding: '6px 12px',
    borderRadius: 6,
    background: 'rgba(52, 211, 153, 0.1)',
    color: '#34d399',
    border: '1px solid rgba(52, 211, 153, 0.2)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  btnReject: {
    padding: '6px 12px',
    borderRadius: 6,
    background: 'rgba(248, 113, 113, 0.1)',
    color: '#f87171',
    border: '1px solid rgba(248, 113, 113, 0.2)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  tagApproved: {
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(52, 211, 153, 0.1)',
    color: '#34d399',
    border: '1px solid rgba(52, 211, 153, 0.15)',
    fontSize: 11.5,
    fontWeight: 500,
  } as CSSProperties,
  tagPending: {
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(251, 191, 36, 0.1)',
    color: '#fbbf24',
    border: '1px solid rgba(251, 191, 36, 0.15)',
    fontSize: 11.5,
    fontWeight: 500,
  } as CSSProperties,
  tagOutbound: {
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(248, 113, 113, 0.1)',
    color: '#f87171',
    border: '1px solid rgba(248, 113, 113, 0.15)',
    fontSize: 11.5,
    fontWeight: 500,
  } as CSSProperties,
  tagMuted: {
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'var(--muted)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    fontSize: 11.5,
    fontWeight: 500,
  } as CSSProperties,
};
