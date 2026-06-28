'use client';

import React, { useState, useTransition } from 'react';
import type { CSSProperties } from 'react';

interface Asset {
  id: string;
  name: string;
  serialNumber: string;
  category: string;
  purchaseDate: string;
  purchaseCost: number;
  status: 'active' | 'maintenance' | 'inactive' | 'disposed';
  warrantyExpiry: string | null;
  nextCalibrationDate: string | null;
  nextInspectionDate: string | null;
}

interface AssetMaintenance {
  id: string;
  assetId: string;
  date: string;
  description: string;
  cost: number;
  status: 'scheduled' | 'completed';
}

interface AssetInspection {
  id: string;
  assetId: string;
  date: string;
  inspector: string;
  result: 'pass' | 'fail';
  notes: string | null;
}

interface Props {
  initialAssets: Asset[];
  initialMaintenance: AssetMaintenance[];
  initialInspections: AssetInspection[];
}

export default function AssetsControlClient({
  initialAssets,
  initialMaintenance,
  initialInspections,
}: Props) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [maintenance, setMaintenance] = useState<AssetMaintenance[]>(initialMaintenance);
  const [inspections, setInspections] = useState<AssetInspection[]>(initialInspections);

  const [activeTab, setActiveTab] = useState<'assets' | 'maintenance' | 'inspections'>('assets');
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form States
  const [assetForm, setAssetForm] = useState({
    name: '',
    serialNumber: '',
    category: 'Heavy Machinery',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchaseCost: 0,
    status: 'active' as Asset['status'],
    warrantyExpiry: '',
    nextCalibrationDate: '',
    nextInspectionDate: '',
  });

  const [mForm, setMForm] = useState({
    assetId: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    cost: 0,
  });

  const [insForm, setInsForm] = useState({
    assetId: '',
    date: new Date().toISOString().split('T')[0],
    inspector: '',
    result: 'pass' as 'pass' | 'fail',
    notes: '',
  });

  // Action Helpers
  const handleRegisterAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!assetForm.name.trim() || !assetForm.serialNumber.trim()) {
      setErrorMessage('Asset name and serial number are required');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...assetForm,
            purchaseCost: Number(assetForm.purchaseCost || 0),
            warrantyExpiry: assetForm.warrantyExpiry || null,
            nextCalibrationDate: assetForm.nextCalibrationDate || null,
            nextInspectionDate: assetForm.nextInspectionDate || null,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to register asset');
        }

        const newAsset = await res.json();
        setAssets((prev) => [newAsset, ...prev]);
        setAssetForm({
          name: '',
          serialNumber: '',
          category: 'Heavy Machinery',
          purchaseDate: new Date().toISOString().split('T')[0],
          purchaseCost: 0,
          status: 'active',
          warrantyExpiry: '',
          nextCalibrationDate: '',
          nextInspectionDate: '',
        });
      } catch (err: any) {
        setErrorMessage(err.message);
      }
    });
  };

  const handleDeleteAsset = async (id: string) => {
    if (!confirm('Are you sure you want to delete this asset? This will also cascade delete all maintenance and inspection logs.')) {
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          throw new Error('Failed to delete asset');
        }
        setAssets((prev) => prev.filter((item) => item.id !== id));
        setMaintenance((prev) => prev.filter((m) => m.assetId !== id));
        setInspections((prev) => prev.filter((ins) => ins.assetId !== id));
      } catch (err: any) {
        setErrorMessage(err.message);
      }
    });
  };

  const handleScheduleMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!mForm.assetId) {
      setErrorMessage('Please select an asset to maintain');
      return;
    }

    if (!mForm.description.trim()) {
      setErrorMessage('Description of maintenance is required');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/assets/maintenance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...mForm,
            cost: Number(mForm.cost || 0),
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to schedule maintenance');
        }

        const newRecord = await res.json();
        setMaintenance((prev) => [newRecord, ...prev]);
        setMForm({
          assetId: '',
          date: new Date().toISOString().split('T')[0],
          description: '',
          cost: 0,
        });
      } catch (err: any) {
        setErrorMessage(err.message);
      }
    });
  };

  const handleCompleteMaintenance = async (id: string) => {
    const costInput = prompt('Enter actual cost of maintenance work (AED):', '0');
    if (costInput === null) return;
    const actualCost = Number(costInput);

    if (isNaN(actualCost) || actualCost < 0) {
      alert('Please enter a valid positive cost amount');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/assets/maintenance/${id}/complete`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ actualCost }),
        });

        if (!res.ok) {
          throw new Error('Failed to complete maintenance');
        }

        const updated = await res.json();
        setMaintenance((prev) => prev.map((item) => (item.id === id ? updated : item)));
      } catch (err: any) {
        setErrorMessage(err.message);
      }
    });
  };

  const handleRecordInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!insForm.assetId) {
      setErrorMessage('Please select an asset to inspect');
      return;
    }

    if (!insForm.inspector.trim()) {
      setErrorMessage('Inspector name is required');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/assets/inspections', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(insForm),
        });

        if (!res.ok) {
          throw new Error('Failed to record inspection');
        }

        const newRecord = await res.json();
        setInspections((prev) => [newRecord, ...prev]);
        setInsForm({
          assetId: '',
          date: new Date().toISOString().split('T')[0],
          inspector: '',
          result: 'pass',
          notes: '',
        });
      } catch (err: any) {
        setErrorMessage(err.message);
      }
    });
  };

  const getAssetName = (id: string) => {
    const found = assets.find((a) => a.id === id);
    return found ? `${found.name} (${found.serialNumber})` : 'Unknown Asset';
  };

  const getWarrantyStatusBadge = (dateStr: string | null) => {
    if (!dateStr) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>None</span>;
    const expiry = new Date(dateStr);
    const today = new Date();
    const diff = expiry.getTime() - today.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) {
      return <span style={st.badgeRed}>Expired ({dateStr})</span>;
    } else if (days <= 30) {
      return <span style={st.badgeOrange}>Expires Soon ({days}d)</span>;
    } else {
      return <span style={st.badgeGreen}>Active (Expires {dateStr})</span>;
    }
  };

  return (
    <div>
      {/* Tabs Menu */}
      <div style={st.tabsRow}>
        <button
          onClick={() => setActiveTab('assets')}
          style={activeTab === 'assets' ? st.tabActive : st.tab}
        >
          Asset Register
        </button>
        <button
          onClick={() => setActiveTab('maintenance')}
          style={activeTab === 'maintenance' ? st.tabActive : st.tab}
        >
          Preventative Maintenance
        </button>
        <button
          onClick={() => setActiveTab('inspections')}
          style={activeTab === 'inspections' ? st.tabActive : st.tab}
        >
          Calibrations & Inspections
        </button>
      </div>

      {errorMessage && (
        <div style={st.errorBox}>
          <span style={{ fontWeight: 600 }}>Error:</span> {errorMessage}
        </div>
      )}

      {/* ── Tab: Asset Register ────────────────────────────────────────────── */}
      {activeTab === 'assets' && (
        <div style={st.grid}>
          {/* Form */}
          <div className="glass" style={st.card}>
            <h2 style={st.cardH2}>Register Capital Asset / Equipment</h2>
            <form onSubmit={handleRegisterAsset} style={st.form}>
              <div style={st.formGroup}>
                <label style={st.label}>Asset Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Generator 500kVA, Forklift Model X"
                  value={assetForm.name}
                  onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                  style={st.input}
                  disabled={isPending}
                />
              </div>

              <div style={st.formRow}>
                <div style={st.formGroup}>
                  <label style={st.label}>Serial Number *</label>
                  <input
                    type="text"
                    placeholder="e.g. S/N-998822"
                    value={assetForm.serialNumber}
                    onChange={(e) => setAssetForm({ ...assetForm, serialNumber: e.target.value })}
                    style={st.input}
                    disabled={isPending}
                  />
                </div>
                <div style={st.formGroup}>
                  <label style={st.label}>Category</label>
                  <select
                    value={assetForm.category}
                    onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })}
                    style={st.select}
                    disabled={isPending}
                  >
                    <option value="Heavy Machinery">Heavy Machinery</option>
                    <option value="Power Equipment">Power Equipment</option>
                    <option value="Safety Gear">Safety Gear</option>
                    <option value="IT Hardware">IT Hardware</option>
                    <option value="HVAC / MEP">HVAC / MEP</option>
                    <option value="Tools / Instrumentation">Tools / Instrumentation</option>
                  </select>
                </div>
              </div>

              <div style={st.formRow}>
                <div style={st.formGroup}>
                  <label style={st.label}>Purchase Date</label>
                  <input
                    type="date"
                    value={assetForm.purchaseDate}
                    onChange={(e) => setAssetForm({ ...assetForm, purchaseDate: e.target.value })}
                    style={st.input}
                    disabled={isPending}
                  />
                </div>
                <div style={st.formGroup}>
                  <label style={st.label}>Purchase Cost (AED)</label>
                  <input
                    type="number"
                    value={assetForm.purchaseCost || ''}
                    placeholder="0.00"
                    onChange={(e) => setAssetForm({ ...assetForm, purchaseCost: Number(e.target.value) })}
                    style={st.input}
                    disabled={isPending}
                  />
                </div>
              </div>

              <div style={st.formRow}>
                <div style={st.formGroup}>
                  <label style={st.label}>Warranty Expiry</label>
                  <input
                    type="date"
                    value={assetForm.warrantyExpiry}
                    onChange={(e) => setAssetForm({ ...assetForm, warrantyExpiry: e.target.value })}
                    style={st.input}
                    disabled={isPending}
                  />
                </div>
                <div style={st.formGroup}>
                  <label style={st.label}>Next Calibration Date</label>
                  <input
                    type="date"
                    value={assetForm.nextCalibrationDate}
                    onChange={(e) => setAssetForm({ ...assetForm, nextCalibrationDate: e.target.value })}
                    style={st.input}
                    disabled={isPending}
                  />
                </div>
              </div>

              <div style={st.formRow}>
                <div style={st.formGroup}>
                  <label style={st.label}>Next Inspection Date</label>
                  <input
                    type="date"
                    value={assetForm.nextInspectionDate}
                    onChange={(e) => setAssetForm({ ...assetForm, nextInspectionDate: e.target.value })}
                    style={st.input}
                    disabled={isPending}
                  />
                </div>
                <div style={st.formGroup}>
                  <label style={st.label}>Asset Status</label>
                  <select
                    value={assetForm.status}
                    onChange={(e) => setAssetForm({ ...assetForm, status: e.target.value as Asset['status'] })}
                    style={st.select}
                    disabled={isPending}
                  >
                    <option value="active">Active / Operational</option>
                    <option value="maintenance">Under Maintenance</option>
                    <option value="inactive">Inactive / Reserve</option>
                    <option value="disposed">Disposed / Sold</option>
                  </select>
                </div>
              </div>

              <button type="submit" style={st.btnSubmit} disabled={isPending}>
                {isPending ? 'Registering...' : 'Register Asset'}
              </button>
            </form>
          </div>

          {/* Directory */}
          <div className="glass" style={st.cardLarge}>
            <h2 style={st.cardH2}>Asset Register & Directory</h2>
            <div style={st.tableContainer}>
              <table style={st.table}>
                <thead>
                  <tr style={st.trHead}>
                    <th style={st.th}>Asset Name</th>
                    <th style={st.th}>S/N</th>
                    <th style={st.th}>Category</th>
                    <th style={st.th}>Status</th>
                    <th style={st.th}>Warranty Status</th>
                    <th style={st.th}>Next Calibration</th>
                    <th style={st.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={st.tdEmpty}>
                        No assets registered yet. Fill out the registration form to start tracking.
                      </td>
                    </tr>
                  ) : (
                    assets.map((item) => (
                      <tr key={item.id} style={st.trBody}>
                        <td style={st.tdTextBold}>{item.name}</td>
                        <td style={st.tdText}>{item.serialNumber}</td>
                        <td style={st.tdText}>{item.category}</td>
                        <td style={st.td}>
                          {item.status === 'active' && <span style={st.badgeGreen}>active</span>}
                          {item.status === 'maintenance' && <span style={st.badgeOrange}>maintenance</span>}
                          {item.status === 'inactive' && <span style={st.badgeGray}>inactive</span>}
                          {item.status === 'disposed' && <span style={st.badgeRed}>disposed</span>}
                        </td>
                        <td style={st.td}>
                          {getWarrantyStatusBadge(item.warrantyExpiry)}
                        </td>
                        <td style={st.tdText}>
                          {item.nextCalibrationDate || <span style={{ color: 'var(--muted)' }}>N/A</span>}
                        </td>
                        <td style={st.td}>
                          <button
                            onClick={() => handleDeleteAsset(item.id)}
                            style={st.btnDanger}
                            disabled={isPending}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Preventative Maintenance ─────────────────────────────────── */}
      {activeTab === 'maintenance' && (
        <div style={st.grid}>
          {/* Form */}
          <div className="glass" style={st.card}>
            <h2 style={st.cardH2}>Schedule Asset Preventative Maintenance</h2>
            <form onSubmit={handleScheduleMaintenance} style={st.form}>
              <div style={st.formGroup}>
                <label style={st.label}>Select Asset *</label>
                <select
                  value={mForm.assetId}
                  onChange={(e) => setMForm({ ...mForm, assetId: e.target.value })}
                  style={st.select}
                  disabled={isPending}
                >
                  <option value="">-- Choose Asset --</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.serialNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div style={st.formRow}>
                <div style={st.formGroup}>
                  <label style={st.label}>Maintenance Date *</label>
                  <input
                    type="date"
                    value={mForm.date}
                    onChange={(e) => setMForm({ ...mForm, date: e.target.value })}
                    style={st.input}
                    disabled={isPending}
                  />
                </div>
                <div style={st.formGroup}>
                  <label style={st.label}>Estimated Cost (AED)</label>
                  <input
                    type="number"
                    value={mForm.cost || ''}
                    placeholder="0.00"
                    onChange={(e) => setMForm({ ...mForm, cost: Number(e.target.value) })}
                    style={st.input}
                    disabled={isPending}
                  />
                </div>
              </div>

              <div style={st.formGroup}>
                <label style={st.label}>Description of Work *</label>
                <textarea
                  placeholder="e.g. Regular 250hr engine service, load calibration, filter changeout"
                  value={mForm.description}
                  onChange={(e) => setMForm({ ...mForm, description: e.target.value })}
                  style={st.textarea}
                  rows={3}
                  disabled={isPending}
                />
              </div>

              <button type="submit" style={st.btnSubmit} disabled={isPending}>
                {isPending ? 'Scheduling...' : 'Schedule Maintenance'}
              </button>
            </form>
          </div>

          {/* Ledger */}
          <div className="glass" style={st.cardLarge}>
            <h2 style={st.cardH2}>Maintenance Ledger</h2>
            <div style={st.tableContainer}>
              <table style={st.table}>
                <thead>
                  <tr style={st.trHead}>
                    <th style={st.th}>Asset</th>
                    <th style={st.th}>Scheduled Date</th>
                    <th style={st.th}>Description</th>
                    <th style={st.th}>Cost (AED)</th>
                    <th style={st.th}>Status</th>
                    <th style={st.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenance.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={st.tdEmpty}>
                        No scheduled or completed maintenance tasks logged.
                      </td>
                    </tr>
                  ) : (
                    maintenance.map((item) => (
                      <tr key={item.id} style={st.trBody}>
                        <td style={st.tdTextBold}>{getAssetName(item.assetId)}</td>
                        <td style={st.tdText}>{item.date}</td>
                        <td style={st.tdText}>{item.description}</td>
                        <td style={st.tdTextBold}>{item.cost.toLocaleString()} AED</td>
                        <td style={st.td}>
                          {item.status === 'scheduled' ? (
                            <span style={st.badgeOrange}>scheduled</span>
                          ) : (
                            <span style={st.badgeGreen}>completed</span>
                          )}
                        </td>
                        <td style={st.td}>
                          {item.status === 'scheduled' && (
                            <button
                              onClick={() => handleCompleteMaintenance(item.id)}
                              style={st.btnSuccess}
                              disabled={isPending}
                            >
                              Complete Work
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Calibrations & Inspections ──────────────────────────────── */}
      {activeTab === 'inspections' && (
        <div style={st.grid}>
          {/* Form */}
          <div className="glass" style={st.card}>
            <h2 style={st.cardH2}>Record Asset Inspection / Calibration</h2>
            <form onSubmit={handleRecordInspection} style={st.form}>
              <div style={st.formGroup}>
                <label style={st.label}>Select Asset *</label>
                <select
                  value={insForm.assetId}
                  onChange={(e) => setInsForm({ ...insForm, assetId: e.target.value })}
                  style={st.select}
                  disabled={isPending}
                >
                  <option value="">-- Choose Asset --</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.serialNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div style={st.formRow}>
                <div style={st.formGroup}>
                  <label style={st.label}>Inspection Date *</label>
                  <input
                    type="date"
                    value={insForm.date}
                    onChange={(e) => setInsForm({ ...insForm, date: e.target.value })}
                    style={st.input}
                    disabled={isPending}
                  />
                </div>
                <div style={st.formGroup}>
                  <label style={st.label}>Inspector Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Safety Inspector, John Doe"
                    value={insForm.inspector}
                    onChange={(e) => setInsForm({ ...insForm, inspector: e.target.value })}
                    style={st.input}
                    disabled={isPending}
                  />
                </div>
              </div>

              <div style={st.formRow}>
                <div style={st.formGroup}>
                  <label style={st.label}>Inspection Result *</label>
                  <select
                    value={insForm.result}
                    onChange={(e) => setInsForm({ ...insForm, result: e.target.value as 'pass' | 'fail' })}
                    style={st.select}
                    disabled={isPending}
                  >
                    <option value="pass">PASS (Meets all regulations / safety parameters)</option>
                    <option value="fail">FAIL (Action required / safety tags suspended)</option>
                  </select>
                </div>
              </div>

              <div style={st.formGroup}>
                <label style={st.label}>Inspection Notes</label>
                <textarea
                  placeholder="e.g. Brake tests valid. Minor hydraulic line wear noted, scheduled for next preventative run."
                  value={insForm.notes}
                  onChange={(e) => setInsForm({ ...insForm, notes: e.target.value })}
                  style={st.textarea}
                  rows={3}
                  disabled={isPending}
                />
              </div>

              <button type="submit" style={st.btnSubmit} disabled={isPending}>
                {isPending ? 'Recording...' : 'Record Inspection Result'}
              </button>
            </form>
          </div>

          {/* History */}
          <div className="glass" style={st.cardLarge}>
            <h2 style={st.cardH2}>Inspection & Calibration History</h2>
            <div style={st.tableContainer}>
              <table style={st.table}>
                <thead>
                  <tr style={st.trHead}>
                    <th style={st.th}>Asset</th>
                    <th style={st.th}>Date Inspected</th>
                    <th style={st.th}>Inspector</th>
                    <th style={st.th}>Result</th>
                    <th style={st.th}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={st.tdEmpty}>
                        No inspections or safety calibration runs logged.
                      </td>
                    </tr>
                  ) : (
                    inspections.map((item) => (
                      <tr key={item.id} style={st.trBody}>
                        <td style={st.tdTextBold}>{getAssetName(item.assetId)}</td>
                        <td style={st.tdText}>{item.date}</td>
                        <td style={st.tdText}>{item.inspector}</td>
                        <td style={st.td}>
                          {item.result === 'pass' ? (
                            <span style={st.badgeGreen}>PASS</span>
                          ) : (
                            <span style={st.badgeRed}>FAIL</span>
                          )}
                        </td>
                        <td style={st.tdText}>{item.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Glassmorphism styling tokens and rules
const st = {
  tabsRow: { display: 'flex', gap: '8px', margin: '0 0 24px' } as CSSProperties,
  tab: {
    padding: '8px 16px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: 'var(--foreground)',
    cursor: 'pointer',
    fontSize: 14,
    transition: 'all 0.2s',
  } as CSSProperties,
  tabActive: {
    padding: '8px 16px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(236, 72, 153, 0.2))',
    border: '1px solid rgba(168, 85, 247, 0.4)',
    color: 'var(--foreground)',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 14,
    boxShadow: '0 0 12px rgba(168, 85, 247, 0.25)',
  } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' } as CSSProperties,
  card: {
    padding: '24px',
    borderRadius: '16px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
    backdropFilter: 'blur(8px)',
  } as CSSProperties,
  cardLarge: {
    padding: '24px',
    borderRadius: '16px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
    backdropFilter: 'blur(8px)',
  } as CSSProperties,
  cardH2: { fontSize: 18, margin: '0 0 20px', fontWeight: 600, letterSpacing: -0.3 } as CSSProperties,
  form: { display: 'flex', flexDirection: 'column', gap: '16px' } as CSSProperties,
  formRow: { display: 'flex', gap: '16px' } as CSSProperties,
  formGroup: { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)', fontWeight: 500 } as CSSProperties,
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(0, 0, 0, 0.2)',
    color: 'var(--foreground)',
    fontSize: 14,
    outline: 'none',
  } as CSSProperties,
  select: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(0, 0, 0, 0.2)',
    color: 'var(--foreground)',
    fontSize: 14,
    outline: 'none',
    cursor: 'pointer',
  } as CSSProperties,
  textarea: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(0, 0, 0, 0.2)',
    color: 'var(--foreground)',
    fontSize: 14,
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  } as CSSProperties,
  btnSubmit: {
    margin: '10px 0 0',
    padding: '12px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #a855f7, #ec4899)',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  } as CSSProperties,
  tableContainer: { overflowX: 'auto' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  trHead: { borderBottom: '1px solid rgba(255, 255, 255, 0.08)' } as CSSProperties,
  th: { padding: '12px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500 } as CSSProperties,
  trBody: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
    transition: 'background 0.2s',
    cursor: 'default',
  } as CSSProperties,
  td: { padding: '12px 10px', verticalAlign: 'middle' } as CSSProperties,
  tdText: { padding: '12px 10px', color: 'var(--foreground)', verticalAlign: 'middle' } as CSSProperties,
  tdTextBold: { padding: '12px 10px', color: 'var(--foreground)', fontWeight: 600, verticalAlign: 'middle' } as CSSProperties,
  tdEmpty: { padding: '36px 12px', color: 'var(--muted)', textAlign: 'center', fontSize: 14 } as CSSProperties,
  badgeGreen: {
    padding: '3px 8px',
    borderRadius: '4px',
    background: 'rgba(34, 197, 94, 0.15)',
    color: '#22c55e',
    fontSize: 11,
    fontWeight: 600,
  } as CSSProperties,
  badgeOrange: {
    padding: '3px 8px',
    borderRadius: '4px',
    background: 'rgba(249, 115, 22, 0.15)',
    color: '#f97316',
    fontSize: 11,
    fontWeight: 600,
  } as CSSProperties,
  badgeGray: {
    padding: '3px 8px',
    borderRadius: '4px',
    background: 'rgba(156, 163, 175, 0.15)',
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: 600,
  } as CSSProperties,
  badgeRed: {
    padding: '3px 8px',
    borderRadius: '4px',
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    fontSize: 11,
    fontWeight: 600,
  } as CSSProperties,
  btnDanger: {
    padding: '6px 10px',
    borderRadius: '6px',
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.2s',
  } as CSSProperties,
  btnSuccess: {
    padding: '6px 10px',
    borderRadius: '6px',
    background: 'rgba(34, 197, 94, 0.12)',
    color: '#22c55e',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.2s',
  } as CSSProperties,
  errorBox: {
    padding: '12px 16px',
    borderRadius: '8px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    fontSize: 13,
    margin: '0 0 20px',
  } as CSSProperties,
};
