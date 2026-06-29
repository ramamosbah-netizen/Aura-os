'use client';

import { type CSSProperties, useState } from 'react';

interface Rfq {
  id: string;
  title: string;
  reference: string | null;
  prTitle: string | null;
  status: string;
  dueDate: string | null;
  createdAt: string;
}

interface Quote {
  id: string;
  supplierName: string;
  amount: number;
  leadTimeDays: number | null;
  notes: string | null;
  status: string;
}

interface Detail {
  rfq: Rfq;
  quotes: Quote[];
  recommended: Quote | null;
}

function money(n: number): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n);
}

export default function RfqClient({ initialRfqs }: { initialRfqs: Rfq[] }) {
  const [rfqs, setRfqs] = useState<Rfq[]>(initialRfqs);
  const [title, setTitle] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // add-quote form
  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [lead, setLead] = useState('');

  async function refreshList(): Promise<void> {
    const res = await fetch('/api/procurement/rfqs');
    if (res.ok) setRfqs(await res.json());
  }

  async function createRfq(): Promise<void> {
    if (!title.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/procurement/rfqs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        setErr('Failed to create RFQ');
      } else {
        setTitle('');
        await refreshList();
      }
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string): Promise<void> {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    const res = await fetch(`/api/procurement/rfqs/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  async function reloadDetail(id: string): Promise<void> {
    const res = await fetch(`/api/procurement/rfqs/${id}`);
    if (res.ok) setDetail(await res.json());
    await refreshList();
  }

  async function send(id: string): Promise<void> {
    await fetch(`/api/procurement/rfqs/${id}/send`, { method: 'PATCH' });
    await reloadDetail(id);
  }

  async function addQuote(id: string): Promise<void> {
    if (!supplier.trim() || !(Number(amount) > 0)) {
      setErr('Supplier and a positive amount are required');
      return;
    }
    setErr('');
    await fetch(`/api/procurement/rfqs/${id}/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        supplierName: supplier,
        amount: Number(amount),
        leadTimeDays: lead ? Number(lead) : null,
      }),
    });
    setSupplier('');
    setAmount('');
    setLead('');
    await reloadDetail(id);
  }

  async function award(id: string, quoteId: string): Promise<void> {
    await fetch(`/api/procurement/rfqs/${id}/award`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quoteId }),
    });
    await reloadDetail(id);
  }

  return (
    <div>
      <div style={s.createBar}>
        <input
          style={s.input}
          placeholder="New RFQ title (e.g. Structured cabling — Tower A)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createRfq()}
        />
        <button type="button" style={s.primary} onClick={createRfq} disabled={busy}>
          Raise RFQ
        </button>
      </div>
      {err && <p style={s.err}>{err}</p>}

      <ul style={s.list}>
        {rfqs.length === 0 ? (
          <li style={s.muted}>No RFQs yet — raise one above.</li>
        ) : (
          rfqs.map((r) => (
            <li key={r.id} style={s.rfqCard}>
              <button type="button" style={s.rfqHead} onClick={() => open(r.id)}>
                <span style={s.chevron}>{openId === r.id ? '▾' : '▸'}</span>
                <span style={s.rfqTitle}>{r.title}</span>
                <span style={s.tag(r.status)}>{r.status}</span>
              </button>

              {openId === r.id && (
                <div style={s.detail}>
                  {!detail ? (
                    <p style={s.muted}>Loading quotes…</p>
                  ) : (
                    <>
                      <div style={s.detailBar}>
                        <span style={s.muted}>
                          {detail.quotes.length} quote{detail.quotes.length === 1 ? '' : 's'}
                          {detail.recommended && ` · lowest: ${detail.recommended.supplierName} ${money(detail.recommended.amount)}`}
                        </span>
                        {r.status === 'draft' && (
                          <button type="button" style={s.smallBtn} onClick={() => send(r.id)}>
                            Send to vendors
                          </button>
                        )}
                      </div>

                      {detail.quotes.length > 0 && (
                        <table style={s.table}>
                          <thead>
                            <tr>
                              <th style={s.th}>Supplier</th>
                              <th style={s.thR}>Amount</th>
                              <th style={s.thR}>Lead (days)</th>
                              <th style={s.th}>Status</th>
                              <th style={s.th} />
                            </tr>
                          </thead>
                          <tbody>
                            {detail.quotes.map((q) => {
                              const isLow = detail.recommended?.id === q.id;
                              return (
                                <tr key={q.id} style={isLow ? s.rowLow : undefined}>
                                  <td style={s.td}>
                                    {q.supplierName} {isLow && <span style={s.lowTag}>lowest</span>}
                                  </td>
                                  <td style={s.tdR}>{money(q.amount)}</td>
                                  <td style={s.tdR}>{q.leadTimeDays ?? '—'}</td>
                                  <td style={s.td}>
                                    <span style={s.tag(q.status)}>{q.status}</span>
                                  </td>
                                  <td style={s.tdR}>
                                    {r.status !== 'awarded' && q.status !== 'rejected' && (
                                      <button type="button" style={s.awardBtn} onClick={() => award(r.id, q.id)}>
                                        Award
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}

                      {r.status !== 'awarded' && (
                        <div style={s.quoteForm}>
                          <input style={s.qInput} placeholder="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
                          <input style={s.qInputSm} placeholder="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
                          <input style={s.qInputSm} placeholder="Lead days" type="number" value={lead} onChange={(e) => setLead(e.target.value)} />
                          <button type="button" style={s.smallBtn} onClick={() => addQuote(r.id)}>
                            Add quote
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

const tagColor = (status: string): string =>
  status === 'awarded' ? 'var(--good)' : status === 'rejected' ? 'var(--bad)' : status === 'sent' ? 'var(--accent)' : 'var(--muted)';

const s = {
  createBar: { display: 'flex', gap: 10, marginBottom: 8 } as CSSProperties,
  input: {
    flex: 1,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '10px 12px',
    fontSize: 14,
  } as CSSProperties,
  primary: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    padding: '10px 16px',
    fontSize: 14,
    cursor: 'pointer',
    fontWeight: 600,
  } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '4px 2px' } as CSSProperties,
  list: { listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13.5, padding: '6px 2px', margin: 0 } as CSSProperties,
  rfqCard: { border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--panel)' } as CSSProperties,
  rfqHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: 'var(--text)',
    padding: '12px 14px',
    cursor: 'pointer',
    fontSize: 14.5,
    textAlign: 'left',
  } as CSSProperties,
  chevron: { color: 'var(--muted)', width: 12 } as CSSProperties,
  rfqTitle: { flex: 1 } as CSSProperties,
  tag: (status: string): CSSProperties => ({
    fontSize: 11.5,
    color: tagColor(status),
    border: `1px solid ${tagColor(status)}`,
    borderRadius: 999,
    padding: '1px 9px',
    textTransform: 'capitalize',
  }),
  detail: { borderTop: '1px solid var(--border)', padding: '12px 14px', background: 'var(--panel-2)' } as CSSProperties,
  detailBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, padding: '6px 8px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  thR: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, padding: '6px 8px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '8px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdR: { padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right' } as CSSProperties,
  rowLow: { background: 'rgba(62,207,142,0.08)' } as CSSProperties,
  lowTag: { fontSize: 10.5, color: 'var(--good)', border: '1px solid var(--good)', borderRadius: 999, padding: '0 6px', marginLeft: 6 } as CSSProperties,
  awardBtn: { background: 'var(--good)', border: 'none', borderRadius: 7, color: '#04210f', padding: '4px 10px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  quoteForm: { display: 'flex', gap: 8, marginTop: 10 } as CSSProperties,
  qInput: { flex: 1, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13 } as CSSProperties,
  qInputSm: { width: 100, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13 } as CSSProperties,
  smallBtn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 12px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
};
