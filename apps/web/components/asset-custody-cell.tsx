'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

interface EmployeeOption { id: string; firstName: string; lastName: string; role: string }

/**
 * Who holds this asset.
 *
 * A picker rather than a text field: custody names a person in HR's register, and a typo there
 * would be a responsibility recorded against nobody. Clearing it hands the asset back to the
 * store — which is a real state, not an empty one.
 */
export default function AssetCustodyCell({ assetId, custodianEmployeeId, employees, disabled }: {
  assetId: string;
  custodianEmployeeId: string | null;
  employees: EmployeeOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const held = employees.find((employee) => employee.id === custodianEmployeeId);
  const name = (employee: EmployeeOption) => `${employee.firstName} ${employee.lastName}`.trim();

  async function assign(employeeId: string | null) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/assets/${assetId}/custodian`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || 'Unable to change custody');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change custody');
    } finally {
      setBusy(false);
    }
  }

  if (disabled) return <span style={st.muted}>—</span>;

  return (
    <div style={st.wrap} data-testid={`asset-custody-${assetId}`}>
      {custodianEmployeeId ? (
        <>
          <span style={st.held} data-testid={`asset-custodian-${assetId}`}>{held ? name(held) : 'Unavailable employee'}</span>
          <button type="button" style={st.button} disabled={busy} aria-label={`Return ${held ? name(held) : 'this'} custody of asset`} onClick={() => void assign(null)}>
            Return
          </button>
        </>
      ) : (
        <select
          aria-label={`Assign custody for asset ${assetId}`}
          style={st.select}
          defaultValue=""
          disabled={busy}
          onChange={(event) => void assign(event.target.value || null)}
        >
          <option value="">In store</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{name(employee)} · {employee.role}</option>
          ))}
        </select>
      )}
      {error ? <span role="alert" style={st.error}>{error}</span> : null}
    </div>
  );
}

const st = {
  wrap: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } as CSSProperties,
  held: { fontSize: 12, fontWeight: 650 } as CSSProperties,
  muted: { color: 'var(--muted)' } as CSSProperties,
  select: { padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', fontSize: 12, maxWidth: 190 } as CSSProperties,
  button: { padding: '3px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' } as CSSProperties,
  error: { color: 'var(--bad)', fontSize: 11, flexBasis: '100%' } as CSSProperties,
};
