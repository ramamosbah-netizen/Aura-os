'use client';

import { type CSSProperties, useState } from 'react';

interface TaxCode {
  id: string;
  code: string;
  description: string;
  rate: number;
  taxType: 'standard' | 'reverse_charge' | 'exempt' | 'zero_rated';
  isActive: boolean;
  createdAt: string;
}

interface TaxSummary {
  purchaseTaxLinesCount: number;
  totalTaxableAmount: number;
  totalTaxAmount: number;
  filingPeriod: string;
}

function money(n: number): string {
  return typeof n === 'number' ? '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

export default function TaxDashboard({
  initialTaxCodes,
  initialSummary,
}: {
  initialTaxCodes: TaxCode[];
  initialSummary: TaxSummary | null;
}) {
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>(initialTaxCodes);
  const [summary, setSummary] = useState<TaxSummary | null>(initialSummary);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState('');
  const [taxType, setTaxType] = useState<'standard' | 'reverse_charge' | 'exempt' | 'zero_rated'>('standard');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !rate.trim()) {
      setErr('Please enter tax code and rate.');
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      const res = await fetch('/api/finance/tax-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: code.toUpperCase().trim(),
          description,
          rate: Number(rate) / 100, // convert percentage (e.g. 15) to fraction (e.g. 0.15)
          taxType,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Failed to create tax code');
      } else {
        const newCodeObj = await res.json();
        setTaxCodes([...taxCodes, newCodeObj]);
        setCode('');
        setDescription('');
        setRate('');
        setTaxType('standard');

        // Refetch summary since new codes could affect it (though unlikely to have transactions immediately)
        const sumRes = await fetch('/api/finance/tax-summary');
        if (sumRes.ok) setSummary(await sumRes.json());
      }
    } catch {
      setErr('Connection error creating tax code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s.container}>
      {/* VAT / TAX Summary headlines */}
      {summary && (
        <section style={s.summaryGrid}>
          <div style={s.summaryCard}>
            <span style={s.label}>Filing Period</span>
            <span style={s.valText}>{summary.filingPeriod}</span>
            <span style={s.desc}>Current taxable quarter</span>
          </div>
          <div style={s.summaryCard}>
            <span style={s.label}>Total Taxable Amount</span>
            <span style={s.val}>{money(summary.totalTaxableAmount)}</span>
            <span style={s.desc}>Net base expenditure</span>
          </div>
          <div style={s.summaryCard}>
            <span style={s.label}>Input VAT (Paid/Recoverable)</span>
            <span style={{ ...s.val, color: 'var(--good)' }}>{money(summary.totalTaxAmount)}</span>
            <span style={s.desc}>Tax incurred on purchases</span>
          </div>
          <div style={s.summaryCard}>
            <span style={s.label}>Filing Status</span>
            <span style={s.tagStatus}>Prepared</span>
            <span style={s.desc}>{summary.purchaseTaxLinesCount} tax line items recorded</span>
          </div>
        </section>
      )}

      {err && <div style={s.error}>{err}</div>}

      <div style={s.row}>
        {/* TAX CODE CONFIGURATION PANEL */}
        <section style={s.formPanel}>
          <h3 style={s.panelTitle}>Create Corporate Tax / VAT Code</h3>
          <form onSubmit={handleSubmit} style={s.form}>
            <div style={s.field}>
              <label style={s.fieldLabel}>Tax Code identifier</label>
              <input
                style={s.input}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. VAT15, REVERSE_CHG"
              />
            </div>
            <div style={s.field}>
              <label style={s.fieldLabel}>Description</label>
              <input
                style={s.input}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Standard 15% VAT on supplies"
              />
            </div>
            <div style={s.rowInputs}>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.fieldLabel}>Rate (%)</label>
                <input
                  style={s.input}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="e.g. 15"
                  inputMode="numeric"
                />
              </div>
              <div style={{ ...s.field, flex: 1.5 }}>
                <label style={s.fieldLabel}>Tax Category</label>
                <select
                  style={s.select}
                  value={taxType}
                  onChange={(e: any) => setTaxType(e.target.value)}
                >
                  <option value="standard">Standard VAT</option>
                  <option value="reverse_charge">Reverse Charge</option>
                  <option value="zero_rated">Zero Rated</option>
                  <option value="exempt">Exempt</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={busy} style={s.btnAccent}>
              {busy ? 'Registering...' : 'Register Tax Code'}
            </button>
          </form>
        </section>

        {/* REGISTERED TAX CODES TABLE */}
        <section style={{ ...s.panel, flex: 2 }}>
          <h3 style={s.panelTitle}>Corporate Tax Code Registries</h3>
          {taxCodes.length === 0 ? (
            <div style={s.empty}>No tax codes configured yet.</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Code</th>
                  <th style={s.th}>Description</th>
                  <th style={s.th}>Rate</th>
                  <th style={s.th}>Category</th>
                  <th style={s.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {taxCodes.map((tc) => (
                  <tr key={tc.id} style={s.tr}>
                    <td style={s.td}>
                      <strong>{tc.code}</strong>
                    </td>
                    <td style={s.tdMuted}>{tc.description}</td>
                    <td style={s.td}>
                      <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                        {(tc.rate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={s.categoryTag(tc.taxType)}>
                        {tc.taxType.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={tc.isActive ? s.tagActive : s.tagInactive}>
                        {tc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 20 } as CSSProperties,
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 } as CSSProperties,
  summaryCard: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  } as CSSProperties,
  label: { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  val: { fontSize: 20, fontWeight: 700 } as CSSProperties,
  valText: { fontSize: 18, fontWeight: 600, color: 'var(--accent)' } as CSSProperties,
  desc: { fontSize: 11, color: 'var(--muted)', marginTop: 2 } as CSSProperties,
  row: { display: 'flex', gap: 20, flexWrap: 'wrap' } as CSSProperties,
  formPanel: {
    flex: 1,
    minWidth: 280,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
    alignSelf: 'flex-start',
  } as CSSProperties,
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
  } as CSSProperties,
  panelTitle: { fontSize: 15, fontWeight: 600, margin: '0 0 16px 0', letterSpacing: -0.2 } as CSSProperties,
  form: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  fieldLabel: { fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 } as CSSProperties,
  input: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '7px 12px',
    fontSize: 13.5,
    outline: 'none',
  } as CSSProperties,
  select: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '7px 12px',
    fontSize: 13.5,
    outline: 'none',
  } as CSSProperties,
  rowInputs: { display: 'flex', gap: 10 } as CSSProperties,
  btnAccent: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 13.5,
    cursor: 'pointer',
    marginTop: 6,
  } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  tr: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '11px 12px', verticalAlign: 'middle' } as CSSProperties,
  tdMuted: { padding: '11px 12px', verticalAlign: 'middle', color: 'var(--muted)' } as CSSProperties,
  empty: { color: 'var(--muted)', padding: '30px 0', textAlign: 'center' } as CSSProperties,
  error: {
    background: 'rgba(220,53,69,0.1)',
    border: '1px solid rgba(220,53,69,0.2)',
    color: '#dc3545',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
  } as CSSProperties,
  tagStatus: {
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--accent)',
    background: 'rgba(255,193,7,0.1)',
    border: '1px solid rgba(255,193,7,0.2)',
    borderRadius: 6,
    padding: '2px 8px',
    width: 'fit-content',
  } as CSSProperties,
  tagActive: {
    fontSize: 10.5,
    fontWeight: 600,
    color: 'var(--good)',
    background: 'rgba(40,167,69,0.1)',
    borderRadius: 5,
    padding: '2px 6px',
  } as CSSProperties,
  tagInactive: {
    fontSize: 10.5,
    fontWeight: 600,
    color: 'var(--muted)',
    background: 'var(--panel-2)',
    borderRadius: 5,
    padding: '2px 6px',
  } as CSSProperties,
  categoryTag: (type: string): CSSProperties => {
    let background = 'rgba(255,255,255,0.05)';
    let color = 'var(--text)';
    if (type === 'standard') {
      background = 'rgba(0,123,255,0.1)';
      color = '#007bff';
    } else if (type === 'reverse_charge') {
      background = 'rgba(111,66,193,0.1)';
      color = '#6f42c1';
    } else if (type === 'zero_rated' || type === 'exempt') {
      background = 'rgba(40,167,69,0.1)';
      color = 'var(--good)';
    }
    return {
      fontSize: 10.5,
      fontWeight: 600,
      background,
      color,
      borderRadius: 5,
      padding: '2px 5px',
      textTransform: 'uppercase',
    };
  },
};
