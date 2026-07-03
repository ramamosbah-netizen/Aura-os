'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';

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
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastSpeed: number | null;
  lastOdometer: number | null;
  lastTelemetryAt: string | null;
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'vehicles' | 'fuel' | 'maintenance' | 'telematics'>('vehicles');
  const vehicles = initialVehicles;
  const fuelLogs = initialFuelLogs;
  const maintenance = initialMaintenance;
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const vehicleOptions = vehicles.map((v) => ({ value: v.id, label: `${v.make} ${v.model} (${v.plateNumber})` }));
  const driverOptions = employees.map((emp) => ({ value: emp.id, label: `${emp.firstName} ${emp.lastName} (${emp.role})` }));

  // Telematics Form State
  const [gpsVehicleId, setGpsVehicleId] = useState(vehicles[0]?.id || '');
  const [gpsLat, setGpsLat] = useState('25.2048');
  const [gpsLng, setGpsLng] = useState('55.2708');
  const [gpsSpeed, setGpsSpeed] = useState('60');
  const [gpsOdo, setGpsOdo] = useState('10000');
  const [scanResult, setScanResult] = useState<string | null>(null);

  const handleSimulateGPS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gpsVehicleId || !gpsLat || !gpsLng || !gpsSpeed) return;
    setError(null);
    try {
      const res = await fetch('/api/fleet/telemetry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vehicleId: gpsVehicleId,
          latitude: Number(gpsLat),
          longitude: Number(gpsLng),
          speed: Number(gpsSpeed),
          odometer: gpsOdo ? Number(gpsOdo) : undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await res.json();
      router.refresh();
      setScanResult('Telemetry webhook delivered successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to send telemetry update');
    }
  };

  const handleCheckExpirations = async () => {
    setError(null);
    setScanResult(null);
    try {
      const res = await fetch('/api/fleet/vehicles/check-expiry', {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
      const triggered = await res.json();
      if (triggered.length === 0) {
        setScanResult('Scan complete: No expiring registrations found within 30 days.');
      } else {
        setScanResult(`Scan complete: Triggered renewal notifications and tasks for ${triggered.length} vehicle(s): ${triggered.map((x: any) => x.plateNumber).join(', ')}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to execute registration scan');
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
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to delete vehicle');
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
      router.refresh();
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
        <button
          onClick={() => setActiveTab('telematics')}
          style={activeTab === 'telematics' ? st.activeTabBtn : st.tabBtn}
        >
          GPS Telematics & Expirations
        </button>
      </div>

      {/* Vehicles Tab */}
      {activeTab === 'vehicles' && (
        <div>
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Vehicle"
              buttonLabel="Register Vehicle"
              subtitle="Register a vehicle or heavy machinery unit with registration (Mulkiya) expiry and driver assignment."
              endpoint="/api/fleet/vehicles"
              fields={[
                { name: 'make', label: 'Make / brand', kind: 'text', required: true, placeholder: 'e.g. Toyota' },
                { name: 'model', label: 'Model', kind: 'text', required: true, placeholder: 'e.g. Hilux Pickup' },
                { name: 'year', label: 'Manufacture year', kind: 'number', required: true, defaultValue: String(new Date().getFullYear()) },
                { name: 'plateNumber', label: 'Plate / serial number', kind: 'text', required: true, placeholder: 'e.g. DXB-12345' },
                { name: 'registrationExpiry', label: 'Registration expiry', kind: 'date' },
                {
                  name: 'status',
                  label: 'Initial status',
                  kind: 'select',
                  defaultValue: 'active',
                  options: [
                    { value: 'active', label: 'Active' },
                    { value: 'maintenance', label: 'Under Maintenance' },
                    { value: 'retired', label: 'Retired / Sold' },
                  ],
                },
                { name: 'driverEmployeeId', label: 'Assigned driver (staff link)', kind: 'select', options: driverOptions, span: 2 },
              ]}
            />
          </div>

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
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Fuel Log"
              buttonLabel="Log Fuel Entry"
              subtitle="Log a refuelling event with liters, cost, and the odometer reading at the pump."
              endpoint="/api/fleet/fuel"
              fields={[
                { name: 'vehicleId', label: 'Vehicle', kind: 'select', required: true, options: vehicleOptions, span: 2 },
                { name: 'date', label: 'Refuel date', kind: 'date', required: true, defaultValue: today },
                { name: 'liters', label: 'Liters (L)', kind: 'number', required: true, placeholder: '50' },
                { name: 'cost', label: 'Cost (AED)', kind: 'number', required: true, placeholder: '150' },
                { name: 'odometer', label: 'Odometer reading (km)', kind: 'number', required: true, placeholder: '120000' },
              ]}
            />
          </div>

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
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Maintenance"
              buttonLabel="Schedule Maintenance"
              subtitle="Schedule preventative or corrective maintenance for a fleet vehicle. Completing the work records the actual cost."
              endpoint="/api/fleet/maintenance"
              fields={[
                { name: 'vehicleId', label: 'Vehicle', kind: 'select', required: true, options: vehicleOptions, span: 2 },
                { name: 'date', label: 'Maintenance date', kind: 'date', required: true, defaultValue: today },
                { name: 'cost', label: 'Estimated cost (AED)', kind: 'number', defaultValue: '0', placeholder: '500' },
                { name: 'description', label: 'Description of work', kind: 'text', required: true, placeholder: 'e.g. 50k km Service, Brake replacement, Salik tag replacement', span: 2 },
              ]}
            />
          </div>

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

      {activeTab === 'telematics' && (
        <div>
          {/* Expiry Scanner Card */}
          <div style={st.formCard}>
            <h3 style={st.formTitle}>Mulkiya Registration Renewals</h3>
            <p style={st.muted}>
              Systematically scan vehicle documents for upcoming expirations. Vehicles with registration expiring within 30 days will trigger automated alerts and task records.
            </p>
            <button
              onClick={handleCheckExpirations}
              style={{ ...st.btn, marginTop: 12, background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }}
            >
              Scan & Trigger Renewal Tasks
            </button>
            {scanResult && <div style={{ marginTop: 12, fontSize: 13, color: '#34d399' }}>{scanResult}</div>}
          </div>

          {/* Webhook simulator */}
          <form onSubmit={handleSimulateGPS} style={st.formCard}>
            <h3 style={st.formTitle}>Simulate Telematics GPS Webhook</h3>
            <div style={st.formGrid}>
              <div style={st.field}>
                <label style={st.label}>Select Vehicle</label>
                <select
                  value={gpsVehicleId}
                  onChange={(e) => setGpsVehicleId(e.target.value)}
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
                <label style={st.label}>Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="e.g. 25.2048"
                  value={gpsLat}
                  onChange={(e) => setGpsLat(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="e.g. 55.2708"
                  value={gpsLng}
                  onChange={(e) => setGpsLng(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Speed (km/h)</label>
                <input
                  type="number"
                  placeholder="80"
                  value={gpsSpeed}
                  onChange={(e) => setGpsSpeed(e.target.value)}
                  style={st.input}
                  required
                />
              </div>
              <div style={st.field}>
                <label style={st.label}>Odometer (km)</label>
                <input
                  type="number"
                  placeholder="15000"
                  value={gpsOdo}
                  onChange={(e) => setGpsOdo(e.target.value)}
                  style={st.input}
                />
              </div>
            </div>
            <button type="submit" style={st.btn}>Dispatch Webhook Update</button>
          </form>

          {/* Telematics directory */}
          <section style={st.panel}>
            <h3 style={st.panelTitle}>Real-time GPS Fleet Positions</h3>
            {vehicles.filter(v => v.lastLatitude).length === 0 ? (
              <p style={st.muted}>No real-time telematics coordinates logged yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={st.table}>
                  <thead>
                    <tr>
                      {['Vehicle', 'Latitude', 'Longitude', 'Speed', 'Odometer', 'Last Ping'].map((h) => (
                        <th key={h} style={st.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.filter(v => v.lastLatitude).map((v) => (
                      <tr key={v.id}>
                        <td style={st.tdBold}>{v.make} {v.model} ({v.plateNumber})</td>
                        <td style={st.tdCode}>{v.lastLatitude}</td>
                        <td style={st.tdCode}>{v.lastLongitude}</td>
                        <td style={st.tdBold}>{v.lastSpeed} km/h</td>
                        <td style={st.tdCode}>{v.lastOdometer?.toLocaleString()} km</td>
                        <td style={st.tdMuted}>{v.lastTelemetryAt ? new Date(v.lastTelemetryAt).toLocaleString() : '—'}</td>
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
