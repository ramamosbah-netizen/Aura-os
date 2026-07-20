'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CommQuotation, CommContract } from './commercial-workspace';

// The Decision Queue — list on the left, preview on the right, decide without leaving.
//
// This is NOT a second Quotation 360. The discriminator is context, not content: 360 answers
// "what is the state of THIS quote", the queue answers "which of these do I act on first, and
// can I clear it now". Same data, same API, same source of truth — a different question.
//
// Its rows come from the same facts the platform's decision engine uses (a quotation in
// `internal_review` is a pending decision, see InboxService), so the queue and the universal
// inbox can never disagree about what is waiting.

const aed = (n: number): string => 'AED ' + (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

function daysOpen(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : Math.max(0, Math.floor(ms / 86400000));
}

/** Deterministic, evidence-only flags. Nothing here is inferred or scored. */
function flagsFor(q: CommQuotation): string[] {
  const f: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  if (!q.validUntil) f.push('no validity date');
  else if (q.validUntil < today) f.push('validity lapsed');
  if (!q.lines?.length) f.push('no lines');
  if ((q.revision ?? 0) > 0) f.push(`revision ${q.revision}`);
  if (daysOpen(q.issueDate) >= 7) f.push(`waiting ${daysOpen(q.issueDate)}d`);
  return f;
}

export default function CommercialDecisionQueue({ quotations, contracts }: {
  quotations: CommQuotation[]; contracts: CommContract[];
}) {
  const router = useRouter();
  // Worst money first — the queue is about triage, and the biggest exposure is the first call.
  const queue = [...quotations]
    .filter((q) => q.status === 'internal_review')
    .sort((a, b) => b.total - a.total);

  const [selectedId, setSelectedId] = useState<string | null>(queue[0]?.id ?? null);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const selected = queue.find((q) => q.id === selectedId) ?? null;

  async function decide(q: CommQuotation, action: 'approve' | 'cancel'): Promise<void> {
    if (pending) return;
    setPending(q.id);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/quotations/${q.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setErr(d.message ?? d.error ?? `Could not ${action} ${q.quoteNumber}.`);
        return;
      }
      setDone((s) => ({ ...s, [q.id]: action === 'approve' ? 'Approved' : 'Cancelled' }));
      router.refresh();
    } catch {
      setErr('Could not reach the server — nothing was changed.');
    } finally {
      setPending(null);
    }
  }

  if (queue.length === 0) {
    return (
      <p style={st.empty}>
        Nothing is waiting on a commercial decision. Quotes appear here the moment they are sent
        for internal review.
      </p>
    );
  }

  return (
    <div className="comm-queue">
      <ul style={st.list}>
        {queue.map((q) => {
          const active = q.id === selectedId;
          const settled = done[q.id];
          return (
            <li key={q.id}>
              <button
                type="button"
                style={{ ...st.row, ...(active ? st.rowOn : {}), ...(settled ? st.rowDone : {}) }}
                aria-current={active}
                onClick={() => setSelectedId(q.id)}
              >
                <span style={st.rowTop}>
                  <b>{q.quoteNumber}</b>
                  <span style={st.rowVal}>{aed(q.total)}</span>
                </span>
                <span style={st.rowSub}>{q.customerName}</span>
                <span style={st.rowFlags}>
                  {settled
                    ? <span style={{ ...st.flag, color: 'var(--good)', borderColor: 'var(--good)' }}>{settled}</span>
                    : flagsFor(q).slice(0, 2).map((f) => <span key={f} style={st.flag}>{f}</span>)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div style={st.preview}>
        {selected ? (
          <>
            <h3 style={st.pvTitle}>
              {selected.quoteNumber}
              <span style={st.pvSub}> · {selected.customerName}</span>
            </h3>
            <div style={st.pvGrid}>
              <Fact label="Total (incl. VAT)" value={aed(selected.total)} accent />
              <Fact label="Subtotal" value={aed(selected.subtotal)} />
              <Fact label="VAT" value={aed(selected.vatTotal)} />
              <Fact label="Lines" value={String(selected.lines?.length ?? 0)} />
              <Fact label="Revision" value={String(selected.revision ?? 0)} />
              <Fact label="Waiting" value={`${daysOpen(selected.issueDate)}d`} />
              <Fact label="Valid until" value={selected.validUntil ?? 'not set'} />
            </div>

            {flagsFor(selected).length > 0 && (
              <p style={st.pvFlags}>
                {flagsFor(selected).map((f) => <span key={f} style={st.flag}>{f}</span>)}
              </p>
            )}

            {/* Linked records — the chain, not a Contracts tab. */}
            <p style={st.chain}>
              {selected.sourceOpportunityId
                ? <a href={`/crm/opportunities/${selected.sourceOpportunityId}`} style={st.link}>Opportunity</a>
                : <span style={st.muted}>Opportunity —</span>}
              <span style={st.arrow}>→</span>
              <b>{selected.quoteNumber}</b>
              <span style={st.arrow}>→</span>
              {(() => {
                const c = contracts.find((x) => x.id === selected.convertedContractId);
                return c
                  ? <a href={`/contracts/contracts/${c.id}`} style={st.link}>{c.title.slice(0, 34)}</a>
                  : <span style={st.muted}>Contract (not yet)</span>;
              })()}
            </p>

            {err && <p style={st.err}>{err}</p>}

            <div style={st.actions}>
              {done[selected.id] ? (
                <span style={st.settled}>{done[selected.id]} — refreshing the queue…</span>
              ) : (
                <>
                  <button
                    type="button"
                    style={pending ? { ...st.approve, opacity: 0.6 } : st.approve}
                    disabled={!!pending}
                    aria-busy={pending === selected.id}
                    onClick={() => void decide(selected, 'approve')}
                  >
                    {pending === selected.id ? 'Approving…' : 'Approve ✓'}
                  </button>
                  <button
                    type="button"
                    style={pending ? { ...st.ghost, opacity: 0.6 } : st.ghost}
                    disabled={!!pending}
                    onClick={() => void decide(selected, 'cancel')}
                  >
                    Cancel
                  </button>
                </>
              )}
              <a href={`/crm/quotations/${selected.id}`} style={st.openLink}>Open quote →</a>
              <a href={`/crm/quotations/${selected.id}/pricing`} style={st.openLink}>Pricing sheet →</a>
            </div>
          </>
        ) : (
          <p style={st.muted}>Select a quote to review it.</p>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ ...st.factVal, ...(accent ? { color: 'var(--accent)' } : {}) }}>{value}</div>
      <div style={st.factLab}>{label}</div>
    </div>
  );
}

const st = {
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  row: {
    width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3,
    background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9,
    padding: '10px 12px', cursor: 'pointer', color: 'var(--text)',
  } as CSSProperties,
  rowOn: { borderColor: 'var(--accent)', background: 'var(--panel-2)' } as CSSProperties,
  rowDone: { opacity: 0.6 } as CSSProperties,
  rowTop: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 } as CSSProperties,
  rowVal: { color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  rowSub: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  rowFlags: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 } as CSSProperties,
  flag: { border: '1px solid var(--border-strong)', color: 'var(--muted)', borderRadius: 999, padding: '1px 7px', fontSize: 10 } as CSSProperties,
  preview: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' } as CSSProperties,
  pvTitle: { fontSize: 16, margin: '0 0 12px' } as CSSProperties,
  pvSub: { color: 'var(--muted)', fontWeight: 400, fontSize: 13 } as CSSProperties,
  pvGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12, marginBottom: 12 } as CSSProperties,
  factVal: { fontSize: 16, fontWeight: 600 } as CSSProperties,
  factLab: { color: 'var(--muted)', fontSize: 11, marginTop: 2 } as CSSProperties,
  pvFlags: { display: 'flex', flexWrap: 'wrap', gap: 5, margin: '0 0 12px' } as CSSProperties,
  chain: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 12.5, margin: '0 0 14px', paddingTop: 12, borderTop: '1px solid var(--border)' } as CSSProperties,
  arrow: { color: 'var(--muted)' } as CSSProperties,
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' } as CSSProperties,
  approve: { background: 'var(--good)', border: 'none', borderRadius: 8, color: '#04210f', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  ghost: { background: 'var(--panel-2)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', padding: '8px 14px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  settled: { color: 'var(--good)', fontSize: 13 } as CSSProperties,
  openLink: { color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12.5, margin: '0 0 10px' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 } as CSSProperties,
};
