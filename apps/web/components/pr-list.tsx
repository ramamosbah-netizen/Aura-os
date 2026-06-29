'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';

interface PurchaseRequest {
  id: string;
  title: string;
  reference: string | null;
  projectId: string | null;
  projectName: string | null;
  status: 'draft' | 'approved' | 'rejected';
  value: number;
  createdAt: string;
}

interface Project {
  id: string;
  title: string;
}

function money(n: number): string {
  return typeof n === 'number' ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function PrList({
  initialPrs,
  projects,
}: {
  initialPrs: PurchaseRequest[];
  projects: Project[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [value, setValue] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setErr('Title is required.');
      return;
    }

    setBusyId('create-pr');
    setErr(null);

    const project = projects.find((p) => p.id === selectedProjectId);

    try {
      const res = await fetch('/api/procurement/purchase-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          reference: reference.trim() || undefined,
          projectId: selectedProjectId || null,
          projectName: project ? project.title : null,
          value: Number(value) || 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error creating PR');
      } else {
        setTitle('');
        setReference('');
        setSelectedProjectId('');
        setValue('');
        setShowForm(false);
        router.refresh();
      }
    } catch {
      setErr('Failed to create purchase request.');
    } finally {
      setBusyId(null);
    }
  }

  async function updateStatus(id: string, status: 'approved' | 'rejected') {
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/procurement/purchase-requests/${id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `Error setting status to ${status}`);
      } else {
        router.refresh();
      }
    } catch {
      setErr(`Failed to update status to ${status}.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={s.container}>
      {err && <div style={s.errorBar}>{err}</div>}

      <div style={s.header}>
        <h2 style={s.subTitle}>Active Requests</h2>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          style={s.btnAccent}
        >
          {showForm ? 'Cancel' : '+ Create Purchase Request'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={s.form}>
          <h4 style={s.formHeader}>Create New Purchase Request</h4>
          <div style={s.fieldsGrid}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Request Title</label>
              <input
                style={s.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Concrete Supplier for Site B"
                required
              />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Reference / Memo</label>
              <input
                style={s.input}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. PR-2026-98"
              />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Link to Project</label>
              <select
                style={s.select}
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Estimated Cost ($)</label>
              <input
                style={s.input}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Value"
                inputMode="numeric"
              />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button type="submit" disabled={busyId === 'create-pr'} style={s.btnAccent}>
              Submit for Approval
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={s.btnSecondary}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div style={s.panel}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Title</th>
              <th style={s.th}>Reference</th>
              <th style={s.th}>Project</th>
              <th style={s.th}>Value</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Created</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialPrs.length === 0 ? (
              <tr>
                <td colSpan={7} style={s.emptyCell}>
                  No purchase requests submitted yet.
                </td>
              </tr>
            ) : (
              initialPrs.map((pr) => {
                const isBusy = busyId === pr.id;
                return (
                  <tr key={pr.id} style={s.row}>
                    <td style={s.td}><strong>{pr.title}</strong></td>
                    <td style={s.tdMuted}>{pr.reference ?? '—'}</td>
                    <td style={s.tdMuted}>{pr.projectName ?? '—'}</td>
                    <td style={s.td}>{money(pr.value)}</td>
                    <td style={s.td}>
                      <span style={s.tag(pr.status)}>{pr.status}</span>
                    </td>
                    <td style={s.tdMuted}>{fmt(pr.createdAt)}</td>
                    <td style={s.td}>
                      <div style={s.actions}>
                        {pr.status === 'draft' && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => updateStatus(pr.id, 'approved')}
                              style={s.btnAccent}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => updateStatus(pr.id, 'rejected')}
                              style={s.btnDanger}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {pr.status === 'approved' && (
                          <span style={{ color: 'var(--good)', fontSize: 12.5 }}>✓ PO Drafted</span>
                        )}
                        {pr.status === 'rejected' && (
                          <span style={{ color: 'var(--bad)', fontSize: 12.5 }}>⚠ Rejected</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as CSSProperties,
  subTitle: { fontSize: 18, margin: 0, fontWeight: 600 } as CSSProperties,
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
  form: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px 16px',
  } as CSSProperties,
  formHeader: { margin: '0 0 10px 0', fontSize: 14, color: 'var(--accent)' } as CSSProperties,
  fieldsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 } as CSSProperties,
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
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
  td: { padding: '11px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', verticalAlign: 'middle' } as CSSProperties,
  row: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  emptyCell: { padding: '20px 12px', color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  tag: (status: string): CSSProperties => {
    let color = 'var(--muted)';
    let border = '1px solid var(--border)';
    let background = 'var(--panel-2)';
    if (status === 'approved') {
      color = 'var(--good)';
      border = '1px solid rgba(40,167,69,0.2)';
      background = 'rgba(40,167,69,0.05)';
    } else if (status === 'rejected') {
      color = '#dc3545';
      border = '1px solid rgba(220,53,69,0.2)';
      background = 'rgba(220,53,69,0.05)';
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
  actions: { display: 'flex', gap: 8, alignItems: 'center' } as CSSProperties,
  errorBar: {
    background: 'rgba(220,53,69,0.1)',
    border: '1px solid rgba(220,53,69,0.2)',
    color: '#dc3545',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 12,
  } as CSSProperties,
};
