'use client';

import { type CSSProperties, Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Subcontract {
  id: string;
  projectId: string;
  projectName: string | null;
  title: string;
  subcontractorName: string;
  status: 'draft' | 'active' | 'closed';
  value: number;
  retentionPercentage: number;
  createdAt: string;
}

interface Claim {
  id: string;
  subcontractId: string;
  claimNumber: number;
  status: 'draft' | 'submitted' | 'certified' | 'paid';
  workCompletedValue: number;
  previouslyCertifiedValue: number;
  thisPeriodGrossValue: number;
  retentionWithheld: number;
  netCertifiedValue: number;
  certifiedAt: string | null;
  certifiedBy: string | null;
  createdAt: string;
  isRetentionRelease?: boolean;
  retentionReleased?: number;
}

function money(n: number): string {
  return typeof n === 'number' ? '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'short' });
}

export default function SubcontractsList({
  subcontracts,
  claims,
}: {
  subcontracts: Subcontract[];
  claims: Claim[];
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // New Claim Form State
  const [showClaimFormId, setShowClaimFormId] = useState<string | null>(null);
  const [claimWorkValue, setClaimWorkValue] = useState('');
  const [isRetentionRelease, setIsRetentionRelease] = useState(false);
  const [retentionReleased, setRetentionReleased] = useState('');

  async function updateStatus(id: string, status: 'active' | 'closed') {
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/subcontracts/${id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `Error updating status to ${status}`);
      } else {
        router.refresh();
      }
    } catch {
      setErr('Failed to update subcontract status.');
    } finally {
      setBusyId(null);
    }
  }

  async function submitClaim(subcontractId: string) {
    const payload: any = { subcontractId };

    if (isRetentionRelease) {
      const relVal = Number(retentionReleased);
      if (isNaN(relVal) || relVal <= 0) {
        setErr('Please enter a valid retention release value.');
        return;
      }
      payload.isRetentionRelease = true;
      payload.retentionReleased = relVal;
      payload.workCompletedValue = 0;
    } else {
      const val = Number(claimWorkValue);
      if (isNaN(val) || val <= 0) {
        setErr('Please enter a valid work completed value.');
        return;
      }
      payload.workCompletedValue = val;
      payload.isRetentionRelease = false;
      payload.retentionReleased = 0;
    }

    setBusyId(`claim-sub-${subcontractId}`);
    setErr(null);
    try {
      const res = await fetch('/api/subcontracts/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error creating claim');
      } else {
        setClaimWorkValue('');
        setRetentionReleased('');
        setIsRetentionRelease(false);
        setShowClaimFormId(null);
        setExpandedId(subcontractId); // ensure expanded
        router.refresh();
      }
    } catch {
      setErr('Failed to submit claim.');
    } finally {
      setBusyId(null);
    }
  }

  async function certifyClaim(claimId: string, subId: string) {
    setBusyId(`cert-${claimId}`);
    setErr(null);
    try {
      const res = await fetch(`/api/subcontracts/claims/${claimId}/certify`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error certifying claim');
      } else {
        router.refresh();
      }
    } catch {
      setErr('Failed to certify claim.');
    } finally {
      setBusyId(null);
    }
  }

  async function payClaim(claimId: string, subId: string) {
    setBusyId(`pay-${claimId}`);
    setErr(null);
    try {
      const res = await fetch(`/api/subcontracts/claims/${claimId}/pay`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error paying claim');
      } else {
        router.refresh();
      }
    } catch {
      setErr('Failed to pay claim.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={s.container}>
      {err && <div style={s.errorBar}>{err}</div>}

      <div style={s.panel}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Title</th>
              <th style={s.th}>Project</th>
              <th style={s.th}>Subcontractor</th>
              <th style={s.th}>Value</th>
              <th style={s.th}>Retention</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subcontracts.map((sub) => {
              const isExpanded = expandedId === sub.id;
              const subClaims = claims.filter((c) => c.subcontractId === sub.id);
              const isBusy = busyId === sub.id || busyId === `claim-sub-${sub.id}`;

              return (
                <Fragment key={sub.id}>
                  <tr style={isExpanded ? s.rowSelected : s.row}>
                    <td style={s.td}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                        style={s.expandBtn}
                      >
                        {isExpanded ? '▼' : '▶'} <strong>{sub.title}</strong>
                      </button>
                    </td>
                    <td style={s.tdMuted}>{sub.projectName ?? '—'}</td>
                    <td style={s.td}>{sub.subcontractorName}</td>
                    <td style={s.td}>{money(sub.value)}</td>
                    <td style={s.tdMuted}>{sub.retentionPercentage}%</td>
                    <td style={s.td}>
                      <span style={s.tag(sub.status)}>{sub.status}</span>
                    </td>
                    <td style={s.td}>
                      <div style={s.actions}>
                        {sub.status === 'draft' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => updateStatus(sub.id, 'active')}
                            style={s.btnAccent}
                          >
                            Activate
                          </button>
                        )}
                        {sub.status === 'active' && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setShowClaimFormId(showClaimFormId === sub.id ? null : sub.id);
                                setClaimWorkValue('');
                                setRetentionReleased('');
                                setIsRetentionRelease(false);
                              }}
                              style={s.btnSecondary}
                            >
                              New Claim
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => updateStatus(sub.id, 'closed')}
                              style={s.btnDanger}
                            >
                              Close
                            </button>
                          </>
                        )}
                        {sub.status === 'closed' && <span style={{ color: 'var(--muted)' }}>—</span>}
                      </div>
                    </td>
                  </tr>

                  {/* Inline claim creation form */}
                  {showClaimFormId === sub.id && (
                    <tr key={`claim-form-${sub.id}`} style={s.expandedBg}>
                      <td colSpan={7} style={s.claimFormCell}>
                        <div style={s.claimFormContainer}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <h4 style={{ margin: 0, fontSize: 13, color: 'var(--accent)' }}>
                              {isRetentionRelease ? 'Submit Retention Release Claim' : 'Submit Progressive Claims (Interim Payment Certificate)'}
                            </h4>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}>
                              <input
                                type="checkbox"
                                checked={isRetentionRelease}
                                onChange={(e) => {
                                  setIsRetentionRelease(e.target.checked);
                                  setClaimWorkValue('');
                                  setRetentionReleased('');
                                }}
                              />
                              Claim Retention Release
                            </label>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {isRetentionRelease ? (
                              <input
                                style={s.input}
                                value={retentionReleased}
                                onChange={(e) => setRetentionReleased(e.target.value)}
                                placeholder="Retention release amount (e.g. 5000)"
                                inputMode="numeric"
                              />
                            ) : (
                              <input
                                style={s.input}
                                value={claimWorkValue}
                                onChange={(e) => setClaimWorkValue(e.target.value)}
                                placeholder="Cumulative work completed value (e.g. 15000)"
                                inputMode="numeric"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => submitClaim(sub.id)}
                              disabled={isBusy || (isRetentionRelease ? !retentionReleased : !claimWorkValue)}
                              style={s.btnAccent}
                            >
                              Submit Claim
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowClaimFormId(null);
                                setClaimWorkValue('');
                                setRetentionReleased('');
                                setIsRetentionRelease(false);
                              }}
                              style={s.btnSecondary}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Claims List Expansion */}
                  {isExpanded && (
                    <tr key={`claims-list-${sub.id}`} style={s.expandedBg}>
                      <td colSpan={7} style={s.expandedCell}>
                        <div style={s.claimsHeader}>
                          <h3>Interim Payment Certificates (IPCs) & Retention Releases</h3>
                        </div>
                        {subClaims.length === 0 ? (
                          <div style={s.emptyClaims}>No claims submitted against this subcontract.</div>
                        ) : (
                          <table style={s.claimsTable}>
                            <thead>
                              <tr>
                                <th style={s.thClaims}>Claim #</th>
                                <th style={s.thClaims}>Gross Work Completed</th>
                                <th style={s.thClaims}>Previously Certified</th>
                                <th style={s.thClaims}>Period Gross</th>
                                <th style={s.thClaims}>Retention / Release</th>
                                <th style={s.thClaims}>Net Certified</th>
                                <th style={s.thClaims}>Status</th>
                                <th style={s.thClaims}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {subClaims.map((c) => {
                                const isClaimBusy =
                                  busyId === `cert-${c.id}` || busyId === `pay-${c.id}`;
                                return (
                                  <tr key={c.id} style={s.claimRow}>
                                    <td style={s.tdClaims}>
                                      <strong>
                                        {c.isRetentionRelease ? `RET-${c.claimNumber}` : `IPC-${c.claimNumber}`}
                                      </strong>
                                      {c.isRetentionRelease && (
                                        <span style={{ fontSize: 10.5, color: 'var(--accent)', marginLeft: 8, background: 'rgba(255,193,7,0.1)', padding: '2px 4px', borderRadius: 4 }}>
                                          Retention Release
                                        </span>
                                      )}
                                    </td>
                                    <td style={s.tdClaims}>{c.isRetentionRelease ? '—' : money(c.workCompletedValue)}</td>
                                    <td style={s.tdClaims}>{c.isRetentionRelease ? '—' : money(c.previouslyCertifiedValue)}</td>
                                    <td style={s.tdClaims}>{c.isRetentionRelease ? '—' : money(c.thisPeriodGrossValue)}</td>
                                    <td style={{
                                      ...s.tdClaims,
                                      color: c.isRetentionRelease ? 'var(--good)' : 'var(--bad)',
                                      fontWeight: c.isRetentionRelease ? 600 : 'normal'
                                    }}>
                                      {c.isRetentionRelease ? `+ ${money(c.retentionReleased ?? 0)}` : money(c.retentionWithheld)}
                                    </td>
                                    <td style={{ ...s.tdClaims, color: 'var(--good)', fontWeight: 600 }}>
                                      {money(c.netCertifiedValue)}
                                    </td>
                                    <td style={s.tdClaims}>
                                      <span style={s.tag(c.status)}>{c.status}</span>
                                    </td>
                                    <td style={s.tdClaims}>
                                      <div style={s.actions}>
                                        {c.status === 'draft' && (
                                          <button
                                            type="button"
                                            disabled={isClaimBusy}
                                            onClick={() => certifyClaim(c.id, sub.id)}
                                            style={s.btnAccent}
                                          >
                                            Certify
                                          </button>
                                        )}
                                        {c.status === 'certified' && (
                                          <button
                                            type="button"
                                            disabled={isClaimBusy}
                                            onClick={() => payClaim(c.id, sub.id)}
                                            style={s.btnGood}
                                          >
                                            Pay
                                          </button>
                                        )}
                                        {c.status === 'paid' && (
                                          <span style={{ color: 'var(--good)', fontSize: 12 }}>✓ Paid</span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
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
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  row: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  rowSelected: { background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' } as CSSProperties,
  expandBtn: {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    font: 'inherit',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  } as CSSProperties,
  actions: { display: 'flex', gap: 8, alignItems: 'center' } as CSSProperties,
  btnAccent: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  btnSecondary: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  btnDanger: {
    background: 'none',
    border: '1px solid rgba(220,53,69,0.3)',
    color: '#dc3545',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  btnGood: {
    background: 'var(--good)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  tag: (status: string): CSSProperties => {
    let color = 'var(--muted)';
    let border = '1px solid var(--border)';
    let background = 'var(--panel-2)';
    if (status === 'active' || status === 'certified') {
      color = 'var(--good)';
      border = '1px solid rgba(40,167,69,0.2)';
      background = 'rgba(40,167,69,0.05)';
    } else if (status === 'paid') {
      color = 'var(--accent)';
      border = '1px solid rgba(255,193,7,0.2)';
      background = 'rgba(255,193,7,0.05)';
    } else if (status === 'closed') {
      color = 'var(--muted)';
    }
    return {
      fontSize: 11.5,
      fontWeight: 500,
      background,
      border,
      color,
      borderRadius: 6,
      padding: '2px 6px',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    };
  },
  errorBar: {
    background: 'rgba(220,53,69,0.1)',
    border: '1px solid rgba(220,53,69,0.2)',
    color: '#dc3545',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
  } as CSSProperties,
  expandedBg: { background: 'rgba(0,0,0,0.12)' } as CSSProperties,
  expandedCell: { padding: '16px 20px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  claimFormCell: { padding: '14px 20px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  claimFormContainer: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 14px',
  } as CSSProperties,
  input: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '7px 10px',
    fontSize: 13,
    outline: 'none',
    flex: 1,
  } as CSSProperties,
  claimsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  } as CSSProperties,
  emptyClaims: { color: 'var(--muted)', fontSize: 13, padding: '10px 0' } as CSSProperties,
  claimsTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  thClaims: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.01)',
  } as CSSProperties,
  tdClaims: { padding: '10px 10px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  claimRow: { borderBottom: '1px solid rgba(255,255,255,0.02)' } as CSSProperties,
};
