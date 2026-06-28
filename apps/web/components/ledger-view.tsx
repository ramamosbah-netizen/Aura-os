'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Account {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parentId: string | null;
  createdAt: string;
}

interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

interface Journal {
  id: string;
  reference: string | null;
  description: string;
  postedAt: string;
  createdBy: string | null;
  lines: JournalLine[];
}

function money(n: number): string {
  return typeof n === 'number' ? '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export default function LedgerView({
  accounts,
  journals,
}: {
  accounts: Account[];
  journals: Journal[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'coa' | 'journals'>('coa');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // New Account Form State
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'asset' | 'liability' | 'equity' | 'revenue' | 'expense'>('asset');
  const [newParentId, setNewParentId] = useState('');

  // Expand Journal State
  const [expandedJournalId, setExpandedJournalId] = useState<string | null>(null);

  // Calculate dynamic balances from double-entry journal postings
  const balances: Record<string, number> = {};
  accounts.forEach((acc) => {
    balances[acc.id] = 0;
  });

  journals.forEach((j) => {
    (j.lines ?? []).forEach((line) => {
      // Find the account or its ancestors to roll up?
      // For general ledger, we apply the amount to the specific account directly.
      const acc = accounts.find((a) => a.id === line.accountId);
      if (!acc) return;

      let val = 0;
      if (acc.type === 'asset' || acc.type === 'expense') {
        val = (line.debit || 0) - (line.credit || 0);
      } else {
        // Liability, Equity, Revenue
        val = (line.credit || 0) - (line.debit || 0);
      }
      balances[acc.id] = (balances[acc.id] || 0) + val;
    });
  });

  // Sort accounts by Code to render a hierarchically correct Chart of Accounts
  const sortedAccounts = [...accounts].sort((a, b) => a.code.localeCompare(b.code));

  // Determine tree level/depth for visual indentation
  const getDepth = (acc: Account): number => {
    let depth = 0;
    let parentId = acc.parentId;
    const visited = new Set<string>(); // prevent infinite loops
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = accounts.find((a) => a.id === parentId);
      if (parent) {
        depth++;
        parentId = parent.parentId;
      } else {
        break;
      }
    }
    return depth;
  };

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) {
      setErr('Please enter both code and name.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/finance/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: newCode.trim(),
          name: newName.trim(),
          type: newType,
          parentId: newParentId || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error creating account');
      } else {
        setNewCode('');
        setNewName('');
        setNewParentId('');
        setShowAccountForm(false);
        router.refresh();
      }
    } catch {
      setErr('Failed to create account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s.container}>
      {err && <div style={s.errorBar}>{err}</div>}

      {/* Tabs */}
      <div style={s.tabHeader}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => setActiveTab('coa')}
            style={activeTab === 'coa' ? s.tabActive : s.tab}
          >
            Chart of Accounts (COA)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('journals')}
            style={activeTab === 'journals' ? s.tabActive : s.tab}
          >
            Journal Entries Log
          </button>
        </div>

        {activeTab === 'coa' && (
          <button
            type="button"
            onClick={() => setShowAccountForm(!showAccountForm)}
            style={s.btnAccent}
          >
            {showAccountForm ? 'Close Form' : '+ Add GL Account'}
          </button>
        )}
      </div>

      {/* Create Account Form */}
      {showAccountForm && activeTab === 'coa' && (
        <form onSubmit={handleCreateAccount} style={s.form}>
          <h4 style={s.formTitle}>Register General Ledger Account</h4>
          <div style={s.formFields}>
            <div style={s.formGroup}>
              <label style={s.label}>Account Code</label>
              <input
                style={s.input}
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="e.g. 1020, 5010"
              />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Account Name</label>
              <input
                style={s.input}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Petty Cash, Payroll Expense"
              />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Account Type</label>
              <select
                style={s.select}
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
              >
                <option value="asset">Asset (Debit balance)</option>
                <option value="liability">Liability (Credit balance)</option>
                <option value="equity">Equity (Credit balance)</option>
                <option value="revenue">Revenue (Credit balance)</option>
                <option value="expense">Expense (Debit balance)</option>
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Parent Account (Optional)</label>
              <select
                style={s.select}
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
              >
                <option value="">— None —</option>
                {sortedAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button type="submit" disabled={busy} style={s.btnAccent}>
              Create Account
            </button>
            <button type="button" onClick={() => setShowAccountForm(false)} style={s.btnSecondary}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* COA View */}
      {activeTab === 'coa' && (
        <div style={s.panel}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>GL Code & Name</th>
                <th style={s.th}>Type</th>
                <th style={s.thAlignRight}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {sortedAccounts.length === 0 ? (
                <tr>
                  <td colSpan={3} style={s.emptyCell}>
                    No GL accounts found. Use the form above to register your Chart of Accounts.
                  </td>
                </tr>
              ) : (
                sortedAccounts.map((acc) => {
                  const depth = getDepth(acc);
                  return (
                    <tr key={acc.id} style={depth === 0 ? s.rowParent : s.rowLeaf}>
                      <td style={{ ...s.td, paddingLeft: `${12 + depth * 22}px` }}>
                        <span style={s.codeBadge}>{acc.code}</span>{' '}
                        <strong>{acc.name}</strong>
                      </td>
                      <td style={s.td}>
                        <span style={s.typeTag(acc.type)}>{acc.type}</span>
                      </td>
                      <td style={s.tdAlignRight}>
                        <strong>{money(balances[acc.id] ?? 0)}</strong>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Journals View */}
      {activeTab === 'journals' && (
        <div style={s.panel}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Journal ID / Date</th>
                <th style={s.th}>Description</th>
                <th style={s.th}>Reference</th>
                <th style={s.thAlignRight}>Total Lines</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {journals.length === 0 ? (
                <tr>
                  <td colSpan={5} style={s.emptyCell}>No posted journal entries found.</td>
                </tr>
              ) : (
                journals.map((j) => {
                  const isExpanded = expandedJournalId === j.id;
                  return (
                    <>
                      <tr key={j.id} style={isExpanded ? s.rowSelected : s.rowLeaf}>
                        <td style={s.td}>
                          <div><strong>JNL-{j.id.slice(0, 8).toUpperCase()}</strong></div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fmt(j.postedAt)}</div>
                        </td>
                        <td style={s.td}>{j.description}</td>
                        <td style={s.tdMuted}>{j.reference ?? '—'}</td>
                        <td style={s.tdAlignRight}>{j.lines?.length ?? 0} lines</td>
                        <td style={s.td}>
                          <button
                            type="button"
                            onClick={() => setExpandedJournalId(isExpanded ? null : j.id)}
                            style={s.btnSecondary}
                          >
                            {isExpanded ? 'Hide Lines' : 'View Double-Entry'}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Journal Lines Details */}
                      {isExpanded && (
                        <tr key={`jnl-lines-${j.id}`} style={s.expandedBg}>
                          <td colSpan={5} style={s.expandedCell}>
                            <div style={s.linesContainer}>
                              <h5 style={{ margin: '0 0 8px 0', fontSize: 12.5, color: 'var(--accent)' }}>
                                Balanced Double-Entry Postings
                              </h5>
                              <table style={s.linesTable}>
                                <thead>
                                  <tr>
                                    <th style={s.linesTh}>Account</th>
                                    <th style={s.linesThAlignRight}>Debit</th>
                                    <th style={s.linesThAlignRight}>Credit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {j.lines?.map((line) => (
                                    <tr key={line.id}>
                                      <td style={s.linesTd}>
                                        <span style={s.codeBadge}>{line.accountCode}</span> {line.accountName}
                                      </td>
                                      <td style={s.linesTdAlignRight}>
                                        {line.debit > 0 ? money(line.debit) : '—'}
                                      </td>
                                      <td style={s.linesTdAlignRight}>
                                        {line.credit > 0 ? money(line.credit) : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                  <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 600 }}>
                                    <td style={s.linesTd}>Total Balance</td>
                                    <td style={s.linesTdAlignRight}>
                                      {money(j.lines?.reduce((sum, l) => sum + (l.debit || 0), 0) ?? 0)}
                                    </td>
                                    <td style={s.linesTdAlignRight}>
                                      {money(j.lines?.reduce((sum, l) => sum + (l.credit || 0), 0) ?? 0)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  tabHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 } as CSSProperties,
  tab: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: 14,
    fontWeight: 500,
    padding: '6px 12px',
    cursor: 'pointer',
    borderRadius: 8,
  } as CSSProperties,
  tabActive: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--accent)',
    fontSize: 14,
    fontWeight: 600,
    padding: '6px 12px',
    cursor: 'pointer',
    borderRadius: 8,
  } as CSSProperties,
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
  form: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px 16px',
  } as CSSProperties,
  formTitle: { margin: '0 0 10px 0', fontSize: 14, color: 'var(--accent)' } as CSSProperties,
  formFields: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 } as CSSProperties,
  formGroup: { display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  label: { fontSize: 11, color: 'var(--muted)', fontWeight: 500 } as CSSProperties,
  input: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '7px 10px',
    fontSize: 13,
    outline: 'none',
  } as CSSProperties,
  select: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '6px 10px',
    fontSize: 13,
    outline: 'none',
  } as CSSProperties,
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
  thAlignRight: {
    textAlign: 'right',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  td: { padding: '11px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', verticalAlign: 'middle' } as CSSProperties,
  tdAlignRight: { textAlign: 'right', padding: '11px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  rowParent: { borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' } as CSSProperties,
  rowLeaf: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  rowSelected: { background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' } as CSSProperties,
  codeBadge: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1.5px 5px',
    marginRight: 4,
  } as CSSProperties,
  emptyCell: { padding: '20px 12px', color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  typeTag: (type: string): CSSProperties => {
    let color = 'var(--muted)';
    let border = '1px solid var(--border)';
    let background = 'var(--panel-2)';
    if (type === 'asset' || type === 'revenue') {
      color = 'var(--good)';
      border = '1px solid rgba(40,167,69,0.2)';
      background = 'rgba(40,167,69,0.05)';
    } else if (type === 'expense' || type === 'liability') {
      color = 'var(--accent)';
      border = '1px solid rgba(255,193,7,0.2)';
      background = 'rgba(255,193,7,0.05)';
    }
    return {
      fontSize: 10.5,
      fontWeight: 500,
      background,
      border,
      color,
      borderRadius: 6,
      padding: '1.5px 5px',
      textTransform: 'uppercase',
    };
  },
  errorBar: {
    background: 'rgba(220,53,69,0.1)',
    border: '1px solid rgba(220,53,69,0.2)',
    color: '#dc3545',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 12,
  } as CSSProperties,
  expandedBg: { background: 'rgba(0,0,0,0.12)' } as CSSProperties,
  expandedCell: { padding: '14px 20px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  linesContainer: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 14px',
    maxWidth: 600,
  } as CSSProperties,
  linesTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  linesTh: { textAlign: 'left', color: 'var(--muted)', paddingBottom: 6, borderBottom: '1px solid var(--border)' } as CSSProperties,
  linesThAlignRight: { textAlign: 'right', color: 'var(--muted)', paddingBottom: 6, borderBottom: '1px solid var(--border)' } as CSSProperties,
  linesTd: { padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', verticalAlign: 'middle' } as CSSProperties,
  linesTdAlignRight: { textAlign: 'right', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', verticalAlign: 'middle' } as CSSProperties,
};
