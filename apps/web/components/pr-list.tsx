'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';
import RequisitionLinesPanel from './requisition-lines-panel';
import { RegisterKpis, RegisterPanel, RegisterToolbar, registerTable } from './ui/register-view';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

interface PurchaseRequest {
  id: string;
  title: string;
  reference: string | null;
  projectId: string | null;
  projectName: string | null;
  /**
   * `submitted` was missing from this union while the API has always had it — and since BUY-01 a
   * Buyer can actually reach it, so a requisition awaiting a decision was a state this screen could
   * not name.
   */
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  /** `tender_pricing` prices a bid and buys nothing (migration 0387): it never takes a decision. */
  purpose?: 'operational' | 'tender_pricing';
  value: number;
  createdAt: string;
}

interface Project {
  id: string;
  title: string;
}

/**
 * The company's own base currency, never a hardcoded symbol.
 *
 * This read `'$' + n` while `aura_companies.base_currency` says AED — gap record J3-05 names it
 * exactly. A figure labelled in the wrong currency is not a formatting slip; it is a different
 * amount of money.
 */
function money(n: number, currency: string): string {
  return typeof n === 'number' ? `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';
}

/** `pending_approval` is a column value, not something to put in front of a buyer. */
function statusLabel(status: string): string {
  const text = status.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE });
}

export default function PrList({
  initialPrs,
  projects,
  focusedId = '',
  initialProjectId = '',
  currency,
}: {
  initialPrs: PurchaseRequest[];
  projects: Project[];
  focusedId?: string;
  initialProjectId?: string;
  /** The company's base currency, resolved on the server. */
  currency: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** Which requisition has its materials open. One at a time: the table stays readable. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<'all' | 'draft' | 'submitted' | 'approved' | 'rejected'>('all');
  const [q, setQ] = useState('');

  const inView = (pr: PurchaseRequest, key: typeof view) => key === 'all' || pr.status === key;
  const matches = (pr: PurchaseRequest) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return [pr.title, pr.reference, pr.projectName].some((f) => (f ?? '').toLowerCase().includes(needle));
  };
  const visible = initialPrs.filter((pr) => inView(pr, view) && matches(pr));
  const count = (key: typeof view) => initialPrs.filter((pr) => inView(pr, key)).length;

  /**
   * The headline figures a procurement manager reads before the table.
   *
   * `Value awaiting a decision` is the one that matters: it is money somebody is being asked to
   * commit, and until this wave a requisition's value was a header figure nobody could check. It is
   * now the sum of the lines.
   */
  const awaiting = initialPrs.filter((pr) => pr.status === 'submitted');

  useEffect(() => {
    if (!focusedId) return;
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-pr-id="${CSS.escape(focusedId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }, [focusedId]);

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
        // The API says WHY in `message` (a refused authority names the permission); `error` is the
        // BFF's own voice when the API could not be reached at all.
        const d = await res.json().catch(() => ({}));
        setErr(d.message ?? d.error ?? `Error setting status to ${status}`);
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

      <RegisterKpis
        items={[
          { label: 'Requests', value: String(initialPrs.length) },
          { label: 'Drafts', value: String(count('draft')) },
          { label: 'Awaiting a decision', value: String(awaiting.length), tone: awaiting.length > 0 ? 'warn' : undefined },
          { label: 'Approved', value: String(count('approved')), tone: 'good' },
          { label: 'Value awaiting a decision', value: `${currency} ${awaiting.reduce((sum, pr) => sum + pr.value, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, tone: 'accent' },
        ]}
      />


      <RegisterToolbar
        views={[
          { key: 'all' as const, label: 'All', count: count('all') },
          { key: 'draft' as const, label: 'Drafts', count: count('draft') },
          { key: 'submitted' as const, label: 'Awaiting a decision', count: count('submitted') },
          { key: 'approved' as const, label: 'Approved', count: count('approved') },
          { key: 'rejected' as const, label: 'Rejected', count: count('rejected') },
        ]}
        active={view}
        onView={setView}
        search={q}
        onSearch={setQ}
        placeholder="Search requests, references, projects…"
      >
        <CreateDrawer
          entity="Purchase Request"
          subtitle="A procurement request. Approving it drafts the purchase order automatically."
          endpoint="/api/procurement/purchase-requests"
          initialValues={initialProjectId ? { projectId: initialProjectId } : undefined}
          fields={[
            { name: 'title', label: 'Request title', kind: 'text', required: true, placeholder: 'e.g. Concrete supplier for Site B', span: 2 },
            { name: 'reference', label: 'Reference / memo', kind: 'text', placeholder: 'e.g. PR-2026-98' },
            { name: 'value', label: `Estimated cost (${currency})`, kind: 'number', placeholder: '0' },
            {
              name: 'projectId',
              label: 'Link to project',
              kind: 'select',
              labelField: 'projectName',
              placeholder: '— None —',
              span: 2,
              options: projects.map((p) => ({ value: p.id, label: p.title })),
            },
          ]}
        />
      </RegisterToolbar>


      <RegisterPanel testId="purchase-requests">
        <table style={registerTable.table}>
          <thead>
            <tr>
              <th style={registerTable.th}>Title</th>
              <th style={registerTable.th}>Reference</th>
              <th style={registerTable.th}>Project</th>
              <th style={registerTable.th}>Value</th>
              <th style={registerTable.th}>Status</th>
              <th style={registerTable.th}>Created</th>
              <th style={registerTable.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} style={s.emptyCell}>
                  {initialPrs.length === 0
                    ? 'No purchase requests yet — raise one above.'
                    : 'No request matches this view.'}
                </td>
              </tr>
            ) : (
              visible.map((pr) => {
                const isBusy = busyId === pr.id;
                return (
                  <tr key={pr.id} data-pr-id={pr.id} style={{ ...s.row, ...(pr.id === focusedId ? s.focusedRow : {}) }}>
                    <td style={registerTable.td}><strong>{pr.title}</strong></td>
                    <td style={registerTable.tdMuted}>{pr.reference ?? '—'}</td>
                    <td style={registerTable.tdMuted}>{pr.projectName ?? '—'}</td>
                    {/* Once a requisition has lines this figure IS their sum — one requisition, one total. */}
                    <td style={registerTable.td} data-testid={`pr-value-${pr.id}`}>{money(pr.value, currency)}</td>
                    <td style={registerTable.td}>
                      <span style={s.tag(pr.status)}>{statusLabel(pr.status)}</span>
                    </td>
                    <td style={registerTable.tdMuted}>{fmt(pr.createdAt)}</td>
                    <td style={registerTable.td}>
                      <div style={s.actions}>
                        {/*
                          The decision is offered on a SUBMITTED requisition — the one the approvals
                          inbox links here as "Approve" — and, as before, on a draft. It used to be
                          offered on drafts only, so the inbox led the Procurement Manager to a row
                          with no way to decide it. The server decides who may: a Buyer who presses
                          these is refused, in words.
                        */}
                        {pr.purpose === 'tender_pricing' && (
                          <span style={{ color: 'var(--muted)', fontSize: 12.5 }} data-testid={`pr-pricing-${pr.id}`}>
                            Prices a bid — no approval, no order
                          </span>
                        )}
                        {pr.purpose !== 'tender_pricing' && (pr.status === 'draft' || pr.status === 'submitted') && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => updateStatus(pr.id, 'approved')}
                              style={s.btnAccent}
                              data-testid={`pr-approve-${pr.id}`}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => updateStatus(pr.id, 'rejected')}
                              style={s.btnDanger}
                              data-testid={`pr-reject-${pr.id}`}
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
                        <button
                          type="button"
                          onClick={() => setOpenId(openId === pr.id ? null : pr.id)}
                          style={s.btnSecondary}
                          data-testid={`pr-materials-toggle-${pr.id}`}
                        >
                          {openId === pr.id ? 'Hide materials' : 'Materials'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            {/*
              The materials sit under their own requisition rather than on a separate page: the
              value in the row above is DERIVED from them, and a total shown away from the lines it
              came from is a number nobody can check.
            */}
            {openId && visible.some((pr) => pr.id === openId) && (
              <tr>
                <td colSpan={7} style={s.linesCell}>
                  <RequisitionLinesPanel
                    prId={openId}
                    currency={currency}
                    editable={visible.find((pr) => pr.id === openId)?.status === 'draft'}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </RegisterPanel>
    </div>
  );
}

const s = {
  linesCell: { padding: 0, background: 'var(--bg)' } as CSSProperties,
  container: { display: 'flex', flexDirection: 'column', gap: 14 } as CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as CSSProperties,
  subTitle: { fontSize: 18, margin: 0, fontWeight: 600 } as CSSProperties,
  btnAccent: {
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
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
    border: '1px solid var(--bad-soft)',
    color: 'var(--bad)',
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
  row: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  focusedRow: { outline: '2px solid var(--accent)', outlineOffset: '-2px', background: 'var(--accent-soft)' } as CSSProperties,
  emptyCell: { padding: '20px 12px', color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  tag: (status: string): CSSProperties => {
    let color = 'var(--muted)';
    let border = '1px solid var(--border)';
    let background = 'var(--panel-2)';
    if (status === 'approved') {
      color = 'var(--good)';
      border = '1px solid var(--good-soft)';
      background = 'var(--good-soft)';
    } else if (status === 'rejected') {
      color = 'var(--bad)';
      border = '1px solid var(--bad-soft)';
      background = 'var(--bad-soft)';
    }
    return { ...registerTable.chip, background, border, color };
  },
  actions: { display: 'flex', gap: 8, alignItems: 'center' } as CSSProperties,
  errorBar: {
    background: 'var(--bad-soft)',
    border: '1px solid var(--bad-soft)',
    color: 'var(--bad)',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 12,
  } as CSSProperties,
};
