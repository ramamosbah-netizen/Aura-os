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

/** A supplier this enquiry is (or was) sent to — BUY-03. */
interface Invitation {
  supplierId: string;
  supplierName: string;
  invitedAt: string;
  /** The supplier's approval as it stands now; asking for a price does not need it, ordering does. */
  supplierStatus: string | null;
}

interface SupplierHit {
  id: string;
  code: string;
  name: string;
  status: string;
}

interface Detail {
  rfq: Rfq & { sentAt?: string | null; sentBy?: string | null };
  quotes: Quote[];
  invitations?: Invitation[];
}

/** What the API said, so a refusal reads as the reason rather than as nothing happening. */
async function reason(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[]; error?: string };
  const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  return message || body.error || fallback;
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
  // Addressing and sending the enquiry (BUY-03).
  const [dispatchErr, setDispatchErr] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');
  const [hits, setHits] = useState<SupplierHit[]>([]);

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
    setDispatchErr('');
    setSupplierQuery('');
    setHits([]);
    const res = await fetch(`/api/procurement/rfqs/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  async function reloadDetail(id: string): Promise<void> {
    const res = await fetch(`/api/procurement/rfqs/${id}`);
    if (res.ok) setDetail(await res.json());
    await refreshList();
  }

  async function send(id: string): Promise<void> {
    setDispatchErr('');
    const res = await fetch(`/api/procurement/rfqs/${id}/send`, { method: 'PATCH' });
    if (!res.ok) setDispatchErr(await reason(res, 'The enquiry could not be sent'));
    await reloadDetail(id);
  }

  /** Suppliers from the register whose name or code contains the text — never a capped list. */
  async function searchSuppliers(text: string): Promise<void> {
    setSupplierQuery(text);
    if (!text.trim()) { setHits([]); return; }
    const res = await fetch(`/api/procurement/suppliers/search?${new URLSearchParams({ q: text.trim(), limit: '20' })}`);
    const page = (await res.json().catch(() => ({}))) as { items?: SupplierHit[] };
    setHits(res.ok && Array.isArray(page.items) ? page.items : []);
  }

  async function invite(id: string, supplierId: string): Promise<void> {
    setDispatchErr('');
    const res = await fetch(`/api/procurement/rfqs/${id}/invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supplierId }),
    });
    if (!res.ok) setDispatchErr(await reason(res, 'The supplier could not be invited'));
    else { setSupplierQuery(''); setHits([]); }
    await reloadDetail(id);
  }

  async function withdraw(id: string, supplierId: string): Promise<void> {
    setDispatchErr('');
    const res = await fetch(`/api/procurement/rfqs/${id}/invitations/${encodeURIComponent(supplierId)}`, { method: 'DELETE' });
    if (!res.ok) setDispatchErr(await reason(res, 'The invitation could not be withdrawn'));
    await reloadDetail(id);
  }

  async function addQuote(id: string): Promise<void> {
    if (!supplier.trim() || !(Number(amount) > 0)) {
      setErr('Supplier and a positive amount are required');
      return;
    }
    setErr('');
    const res = await fetch(`/api/procurement/rfqs/${id}/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        supplierName: supplier,
        amount: Number(amount),
        leadTimeDays: lead ? Number(lead) : null,
      }),
    });
    // A refused quote used to clear the form as if it had been recorded (the API refuses a header
    // lead time, for one, and says where it belongs).
    if (!res.ok) { setErr(await reason(res, 'The quote could not be recorded')); return; }
    setSupplier('');
    setAmount('');
    setLead('');
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
              <button type="button" style={s.rfqHead} data-testid={`rfq-open-${r.id}`} onClick={() => open(r.id)}>
                <span style={s.chevron}>{openId === r.id ? '▾' : '▸'}</span>
                <span style={s.rfqTitle}>{r.title}</span>
                <span style={s.tag(r.status)} data-testid={`rfq-status-${r.id}`}>{r.status}</span>
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
                        </span>
                        <a style={s.decisionLink} href={`/procurement/rfqs/${r.id}/quotations`} data-testid="rfq-quotations-link">
                          Supplier quotations →
                        </a>
                        <a style={s.decisionLink} href={`/procurement/rfqs/${r.id}/recommendation`}>
                          Sourcing decision →
                        </a>
                      </div>

                      {/*
                        WHO THE ENQUIRY GOES TO (BUY-03). "Send to vendors" moved the status and named
                        no vendor: an RFQ could be sent to nobody, and nobody could later say who had
                        been asked and had not answered.
                      */}
                      {(() => {
                        const invited = detail.invitations ?? [];
                        const draft = detail.rfq.status === 'draft';
                        return (
                          <div style={s.dispatch} data-testid="rfq-dispatch">
                            <div style={s.dispatchHead}>
                              <strong style={{ fontSize: 13 }}>
                                {draft ? 'Who this enquiry goes to' : `Sent to ${invited.length} supplier${invited.length === 1 ? '' : 's'}`}
                              </strong>
                              {!draft && (
                                <span style={s.mutedSm} data-testid="rfq-sent-note">
                                  {detail.rfq.sentAt ? `on ${detail.rfq.sentAt.slice(0, 10)}` : ''}{detail.rfq.sentBy ? ` by ${detail.rfq.sentBy}` : ''}
                                </span>
                              )}
                            </div>
                            {invited.length === 0 ? (
                              <p style={s.mutedSm} data-testid="rfq-no-invitations">
                                {draft ? 'No supplier invited yet. An enquiry is sent to named suppliers from the register.' : 'This enquiry was sent before suppliers were recorded on it.'}
                              </p>
                            ) : (
                              <ul style={s.invites}>
                                {invited.map((i) => (
                                  <li key={i.supplierId} style={s.invite} data-testid={`rfq-invitation-${i.supplierId}`}>
                                    <span style={{ fontWeight: 600 }}>{i.supplierName}</span>
                                    {i.supplierStatus && i.supplierStatus !== 'approved' && (
                                      <span style={s.caution} title="Asking for a price needs no approval; ordering from this supplier does.">
                                        {i.supplierStatus} — not yet approved to order from
                                      </span>
                                    )}
                                    <span style={{ flex: 1 }} />
                                    {draft ? (
                                      <button type="button" style={s.linkBtn} data-testid={`rfq-withdraw-${i.supplierId}`} onClick={() => withdraw(r.id, i.supplierId)}>
                                        Remove
                                      </button>
                                    ) : (
                                      <a style={s.decisionLink} data-testid={`rfq-enquiry-${i.supplierId}`}
                                        href={`/api/procurement/rfqs/${r.id}/enquiry.pdf?${new URLSearchParams({ supplierId: i.supplierId })}`}>
                                        Enquiry PDF ↓
                                      </a>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {draft && (
                              <>
                                <input style={s.qInput} placeholder="Find a supplier by name or code" data-testid="rfq-supplier-search"
                                  value={supplierQuery} onChange={(e) => void searchSuppliers(e.target.value)} />
                                {hits.length > 0 && (
                                  <ul style={s.invites} data-testid="rfq-supplier-hits">
                                    {hits.map((h) => (
                                      <li key={h.id} style={s.invite}>
                                        <span>{h.name}</span>
                                        <span style={s.mutedSm}>{h.code} · {h.status}</span>
                                        <span style={{ flex: 1 }} />
                                        <button type="button" style={s.smallBtn} data-testid={`rfq-invite-${h.id}`}
                                          disabled={invited.some((i) => i.supplierId === h.id)} onClick={() => invite(r.id, h.id)}>
                                          {invited.some((i) => i.supplierId === h.id) ? 'Invited' : 'Invite'}
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                                  <button type="button" style={s.primarySm} data-testid="rfq-send" disabled={invited.length === 0} onClick={() => send(r.id)}>
                                    {invited.length === 0 ? 'Send — invite a supplier first' : `Send to ${invited.length} supplier${invited.length === 1 ? '' : 's'}`}
                                  </button>
                                </div>
                              </>
                            )}
                            {dispatchErr && <p style={s.err} role="alert" data-testid="rfq-dispatch-error">{dispatchErr}</p>}
                          </div>
                        );
                      })()}

                      {detail.quotes.length > 0 && (
                        <>
                        {/*
                          NO "lowest" TAG AND NO Award BUTTON (SUP-13/SUP-14). The tag ranked these
                          amounts against each other, and they are not comparable: a bare figure
                          carries no currency, no tax treatment and no freight. The button awarded
                          one of them and raised a purchase order for that single number with no
                          lines. Choosing a supplier is a decision recorded and approved on the
                          sourcing screen, and it is what produces orders now.
                        */}
                        <p style={s.notComparable}>
                          These are the amounts suppliers wrote at the top of their quotations. They
                          are not comparable with each other — no currency, tax treatment or freight
                          is stated — and nothing is awarded from them.
                        </p>
                        <table style={s.table}>
                          <thead>
                            <tr>
                              <th style={s.th}>Supplier</th>
                              <th style={s.thR}>Amount</th>
                              <th style={s.thR}>Lead (days)</th>
                              <th style={s.th}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.quotes.map((q) => (
                              <tr key={q.id}>
                                <td style={s.td}>{q.supplierName}</td>
                                <td style={s.tdR}>{money(q.amount)}</td>
                                <td style={s.tdR}>{q.leadTimeDays ?? '—'}</td>
                                <td style={s.td}>
                                  <span style={s.tag(q.status)}>{q.status}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </>
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
    color: 'var(--accent-ink)',
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
  decisionLink: { color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5, fontWeight: 600 } as CSSProperties,
  notComparable: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, margin: '0 0 8px' } as CSSProperties,
  quoteForm: { display: 'flex', gap: 8, marginTop: 10 } as CSSProperties,
  qInput: { flex: 1, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13 } as CSSProperties,
  qInputSm: { width: 100, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13 } as CSSProperties,
  smallBtn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 12px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  primarySm: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'var(--accent-ink)', padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' } as CSSProperties,
  dispatch: { border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', margin: '4px 0 12px', background: 'var(--panel)', display: 'grid', gap: 6 } as CSSProperties,
  dispatchHead: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  mutedSm: { color: 'var(--muted)', fontSize: 12.5, margin: 0 } as CSSProperties,
  invites: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 } as CSSProperties,
  invite: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap', minWidth: 0 } as CSSProperties,
  caution: { color: 'var(--warn, #b45309)', fontSize: 12 } as CSSProperties,
};
