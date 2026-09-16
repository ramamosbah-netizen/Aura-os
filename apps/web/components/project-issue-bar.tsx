'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';

/**
 * Issuing material to a project, and taking it back (`BUY-06`).
 *
 * The stock screen could move material in and out of the WAREHOUSE and nothing else — the movement
 * it posted carried no project and no BOQ item. So a storekeeper could not issue to a job at all,
 * the quantity ledger never saw an issue, and the position every progress and wastage figure reads
 * from stayed empty. The capability was unreachable from the screen it belongs on.
 *
 * Two things have to be visible here, and both are about not letting somebody act blind:
 *
 *   WHAT IS ACTUALLY OUT THERE. Net issued — issues minus returns — for the chosen BOQ item, shown
 *   before anything is typed, because it is the balance the server will measure a return against.
 *   A storekeeper who cannot see it meets the refusal as a surprise.
 *
 *   THAT A RETURN IS BOUNDED BY IT. You cannot return more than you took; the screen says how much
 *   can come back rather than letting somebody discover the limit by being refused.
 */

interface ProjectLite { id: string; title: string }
interface LedgerRow { boqItemId: string | null; type: string; unit: string | null }
interface Position { boqItemId: string; issued: number; unit: string | null }

export default function ProjectIssueBar({ stockItemId, unit, onMoved }: {
  stockItemId: string;
  /** The stock item's own unit — what a quantity typed here means. */
  unit: string;
  onMoved: () => void | Promise<void>;
}) {
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [boqItems, setBoqItems] = useState<string[]>([]);
  const [position, setPosition] = useState<Position | null>(null);

  const [projectId, setProjectId] = useState('');
  const [boqItemId, setBoqItemId] = useState('');
  const [qty, setQty] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/projects/projects', { cache: 'no-store' });
      if (res.ok) setProjects((await res.json().catch(() => [])) as ProjectLite[]);
    })();
  }, []);

  // Only BOQ items with a baseline can be issued against: issuing to an unmeasured item would post
  // a quantity to nothing, which is how a position ends up silently empty.
  useEffect(() => {
    setBoqItemId(''); setBoqItems([]); setPosition(null);
    if (!projectId) return;
    void (async () => {
      const res = await fetch(`/api/projects/quantity-ledger?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const rows = (await res.json().catch(() => [])) as LedgerRow[];
      const measured = [...new Set(rows.filter((r) => r.type === 'boq' && r.boqItemId).map((r) => r.boqItemId as string))];
      setBoqItems(measured.sort());
    })();
  }, [projectId]);

  /** Reads the position AND returns it, so a caller can wait for it to actually move. */
  const readPosition = useCallback(async (): Promise<Position | null> => {
    if (!boqItemId) { setPosition(null); return null; }
    const res = await fetch(`/api/projects/quantity-ledger/position/${encodeURIComponent(boqItemId)}`, { cache: 'no-store' });
    const next = res.ok ? ((await res.json().catch(() => null)) as Position) : null;
    setPosition(next);
    return next;
  }, [boqItemId]);

  useEffect(() => { void readPosition(); }, [readPosition]);

  const netIssued = position?.issued ?? null;

  const move = async (direction: 'in' | 'out'): Promise<void> => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/inventory/stock/${stockItemId}/movements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          direction,
          quantity: Number(qty),
          projectId,
          boqItemId,
          reason: direction === 'out' ? 'issued to project' : 'returned from project',
          // A return re-enters stock at the item's own running cost; the FIFO/WAC engine values it.
          unitCost: undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || 'The movement was refused');
      setQty('');
      /**
       * The position is EVENTUALLY consistent, and reading it once would show the old balance.
       *
       * The movement is persisted synchronously, but the BOQ item's issued position is posted by a
       * reactor off the outbox — so for a moment after the response the ledger still says what it
       * said before. Reading once and stopping would show a storekeeper a balance their own
       * movement has already changed, which is exactly the kind of stale number this wave keeps
       * removing. Poll briefly until it moves, and stop either way rather than spinning.
       */
      const before = netIssued;
      for (let i = 0; i < 30; i++) {
        const settled = await readPosition();
        if (settled?.issued !== before) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      await onMoved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The movement was refused');
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(projectId && boqItemId && Number(qty) > 0);
  // The screen says what can come back, rather than letting somebody find the limit by being refused.
  const returnable = netIssued !== null && netIssued > 0;

  return (
    <div style={st.wrap} data-testid={`project-issue-${stockItemId}`}>
      <div style={st.bar}>
        <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}
          data-testid="issue-project" aria-label="Project">
          <option value="">Issue to project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>

        <select className="select" value={boqItemId} onChange={(e) => setBoqItemId(e.target.value)}
          disabled={!projectId} data-testid="issue-boq-item" aria-label="BOQ item">
          <option value="">{projectId ? 'Against which BOQ item…' : 'Choose a project first'}</option>
          {boqItems.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        <div style={st.qty}>
          <input className="input" style={st.narrow} value={qty} onChange={(e) => setQty(e.target.value)}
            inputMode="decimal" placeholder="Quantity" data-testid="issue-quantity" aria-label="Quantity" />
          <span style={st.unit}>{unit}</span>
        </div>

        <button type="button" className="btn btn-primary" disabled={busy || !ready}
          onClick={() => void move('out')} data-testid="issue-out">
          Issue to project
        </button>
        <button type="button" className="btn" disabled={busy || !ready || !returnable}
          onClick={() => void move('in')} data-testid="issue-return">
          Return from project
        </button>
      </div>

      {boqItemId && (
        <p style={st.position} data-testid="issue-position">
          {netIssued === null
            ? 'The issued position for this BOQ item could not be read.'
            : netIssued > 0
              ? `${netIssued}${position?.unit ? ` ${position.unit}` : ''} currently issued to this BOQ item — that is the most that can come back.`
              : 'Nothing is currently issued to this BOQ item, so there is nothing to return.'}
        </p>
      )}

      {error && <p style={st.bad} data-testid="issue-error">{error}</p>}
    </div>
  );
}

const st = {
  wrap: { marginTop: 8 } as CSSProperties,
  bar: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as CSSProperties,
  qty: { display: 'flex', alignItems: 'center', gap: 6 } as CSSProperties,
  narrow: { maxWidth: 120 } as CSSProperties,
  unit: { color: 'var(--muted)', fontSize: 12.5, minWidth: 22 } as CSSProperties,
  position: { color: 'var(--muted)', fontSize: 12, margin: '8px 0 0' } as CSSProperties,
  bad: { color: 'var(--bad)', fontSize: 12.5, margin: '8px 0 0' } as CSSProperties,
};
