'use client';

import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';

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
  const router = useRouter();
  const assets = initialAssets;
  const maintenance = initialMaintenance;
  const inspections = initialInspections;

  const [activeTab, setActiveTab] = useState<'assets' | 'maintenance' | 'inspections'>('assets');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const assetOptions = assets.map((a) => ({ value: a.id, label: `${a.name} (${a.serialNumber})` }));

  const handleDeleteAsset = async (id: string) => {
    if (!confirm('Are you sure you want to delete this asset? This will also cascade delete all maintenance and inspection logs.')) {
      return;
    }

    try {
      const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('Failed to delete asset');
      }
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleCompleteMaintenance = async (id: string) => {
    const costInput = prompt('Enter actual cost of maintenance work (AED):', '0');
    if (costInput === null) return;
    const actualCost = Number(costInput);

    if (isNaN(actualCost) || actualCost < 0) {
      alert('Please enter a valid positive cost amount');
      return;
    }

    try {
      const res = await fetch(`/api/assets/maintenance/${id}/complete`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actualCost }),
      });

      if (!res.ok) {
        throw new Error('Failed to complete maintenance');
      }

      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
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
        <div>
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Asset"
              buttonLabel="Register Asset"
              subtitle="Register a capital asset or piece of equipment with warranty, calibration, and inspection dates."
              endpoint="/api/assets"
              fields={[
                { name: 'name', label: 'Asset name', kind: 'text', required: true, placeholder: 'e.g. Generator 500kVA, Forklift Model X', span: 2 },
                { name: 'serialNumber', label: 'Serial number', kind: 'text', required: true, placeholder: 'e.g. S/N-998822' },
                {
                  name: 'category',
                  label: 'Category',
                  kind: 'select',
                  defaultValue: 'Heavy Machinery',
                  options: [
                    { value: 'Heavy Machinery', label: 'Heavy Machinery' },
                    { value: 'Power Equipment', label: 'Power Equipment' },
                    { value: 'Safety Gear', label: 'Safety Gear' },
                    { value: 'IT Hardware', label: 'IT Hardware' },
                    { value: 'HVAC / MEP', label: 'HVAC / MEP' },
                    { value: 'Tools / Instrumentation', label: 'Tools / Instrumentation' },
                  ],
                },
                { name: 'purchaseDate', label: 'Purchase date', kind: 'date', required: true, defaultValue: today },
                { name: 'purchaseCost', label: 'Purchase cost (AED)', kind: 'number', defaultValue: '0', placeholder: '0.00' },
                {
                  name: 'status',
                  label: 'Asset status',
                  kind: 'select',
                  defaultValue: 'active',
                  options: [
                    { value: 'active', label: 'Active / Operational' },
                    { value: 'maintenance', label: 'Under Maintenance' },
                    { value: 'inactive', label: 'Inactive / Reserve' },
                    { value: 'disposed', label: 'Disposed / Sold' },
                  ],
                },
                { name: 'warrantyExpiry', label: 'Warranty expiry', kind: 'date' },
                { name: 'nextCalibrationDate', label: 'Next calibration date', kind: 'date' },
                { name: 'nextInspectionDate', label: 'Next inspection date', kind: 'date' },
              ]}
            />
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
        <div>
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Maintenance"
              buttonLabel="Schedule Maintenance"
              subtitle="Schedule preventative maintenance for an asset. Completing the work later records the actual cost."
              endpoint="/api/assets/maintenance"
              fields={[
                { name: 'assetId', label: 'Asset', kind: 'select', required: true, options: assetOptions, span: 2 },
                { name: 'date', label: 'Maintenance date', kind: 'date', required: true, defaultValue: today },
                { name: 'cost', label: 'Estimated cost (AED)', kind: 'number', defaultValue: '0', placeholder: '0.00' },
                { name: 'description', label: 'Description of work', kind: 'textarea', required: true, placeholder: 'e.g. Regular 250hr engine service, load calibration, filter changeout' },
              ]}
            />
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
        <div>
          <div style={st.tabHeader}>
            <CreateDrawer
              entity="Inspection"
              buttonLabel="Record Inspection"
              subtitle="Record an inspection or calibration result for an asset."
              endpoint="/api/assets/inspections"
              fields={[
                { name: 'assetId', label: 'Asset', kind: 'select', required: true, options: assetOptions, span: 2 },
                { name: 'date', label: 'Inspection date', kind: 'date', required: true, defaultValue: today },
                { name: 'inspector', label: 'Inspector name', kind: 'text', required: true, placeholder: 'e.g. Safety Inspector, John Doe' },
                {
                  name: 'result',
                  label: 'Inspection result',
                  kind: 'select',
                  defaultValue: 'pass',
                  span: 2,
                  options: [
                    { value: 'pass', label: 'PASS (Meets all regulations / safety parameters)' },
                    { value: 'fail', label: 'FAIL (Action required / safety tags suspended)' },
                  ],
                },
                { name: 'notes', label: 'Inspection notes', kind: 'textarea', placeholder: 'e.g. Brake tests valid. Minor hydraulic line wear noted, scheduled for next preventative run.' },
              ]}
            />
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
  tabHeader: { display: 'flex', justifyContent: 'flex-end', margin: '0 0 12px' } as CSSProperties,
  cardLarge: {
    padding: '24px',
    borderRadius: '16px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
    backdropFilter: 'blur(8px)',
  } as CSSProperties,
  cardH2: { fontSize: 18, margin: '0 0 20px', fontWeight: 600, letterSpacing: -0.3 } as CSSProperties,
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
