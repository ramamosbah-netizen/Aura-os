import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { newId } from '@aura/shared';
import { PostgresTxRunner, TenantContext } from '@aura/core';
import { PostgresPurchaseOrderStore } from './postgres-purchase-order-store';
import { PostgresPurchaseOrderLineStore } from './postgres-purchase-order-line-store';
import { PurchaseOrderService } from './purchase-order.service';
import { makePurchaseOrderLine } from './domain/purchase-order-line';
import type { OrderPositionAnswer } from './po-position.port';

/**
 * J3-01 — THE LIFECYCLE, AGAINST REAL POSTGRESQL.
 *
 * The finding was recorded as "an update-only actor can set status=approved", and the whole point of
 * this file is that the record was never about that string. It is about a generic mutation path
 * owning governed transitions — and the cases that actually cost money are the ones where the order
 * has already had something happen to it:
 *
 *   cancelling a part-delivered order reverses a commitment goods are standing against
 *   closing one with quantity outstanding declares finished what is still owed
 *   a cancel racing a receipt decides on a position that stopped being true while it decided
 *
 * None of those can be produced in memory, and none is reachable through a sequential unit test:
 * they need a real transaction, a real row lock and two connections. It SKIPS without a database
 * rather than passing quietly.
 */
function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = path.resolve(__dirname, '../../../apps/api/.env.local');
    if (!fs.existsSync(envPath)) return undefined;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      if (line.startsWith('DATABASE_URL=')) return line.split('DATABASE_URL=')[1].trim();
    }
  } catch {
    // no env file — treated as "no database", which is a skip, not a failure
  }
  return undefined;
}

const TENANT = `j301pg-${Date.now()}`;

describe('purchase order lifecycle (PostgreSQL)', () => {
  let pool: Pool | null = null;
  let orders: PostgresPurchaseOrderStore;
  let orderLines: PostgresPurchaseOrderLineStore;

  /** The position the port would report. Each case sets what has happened to the order. */
  let position: OrderPositionAnswer = { known: true, receivedValue: 0, invoicedValue: 0, acceptedByLine: {}, rejectedByLine: {} };
  /** Runs while a cancel or close holds the order's row — the concurrency cases use it. */
  let duringDecision: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const url = databaseUrl();
    if (!url) return;
    pool = new Pool({ connectionString: url });
    pool.on('connect', (client) => {
      void client.query(`SELECT set_config('app.current_tenant_id', '${TENANT}', false)`);
    });
    orders = new PostgresPurchaseOrderStore(pool);
    orderLines = new PostgresPurchaseOrderLineStore(pool);
  });

  afterAll(async () => {
    if (!pool) return;
    for (const table of ['aura_procurement_purchase_order_lines', 'aura_procurement_purchase_orders']) {
      await pool.query(`DELETE FROM public.${table} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }
    await pool.end();
  });

  const skipless = (name: string, body: () => Promise<void>) =>
    it(name, async (ctx) => {
      if (!pool) { ctx.skip(); return; }
      position = { known: true, receivedValue: 0, invoicedValue: 0, acceptedByLine: {}, rejectedByLine: {} };
      duringDecision = null;
      await body();
    }, 60_000);

  function service() {
    const tenant = new TenantContext();
    const txRunner = new PostgresTxRunner(pool!, tenant);
    const positions = {
      positionOf: async (): Promise<OrderPositionAnswer> => {
        // The hook fires while the decision holds the order's row, which is how the concurrency
        // cases put a competing write in exactly the window the lock exists to close.
        if (duringDecision) { const run = duringDecision; duringDecision = null; await run(); }
        return position;
      },
    };
    const svc = new PurchaseOrderService(
      orders,
      { appendWithClient: async () => undefined, append: async () => undefined } as never,
      txRunner,
      { register: () => undefined, execute: async () => undefined } as never,
      { generateNextNumber: async () => `PO-${newId().slice(0, 8)}` } as never,
      { log: async () => undefined } as never,
      { get: async () => null } as never,
      undefined,
      tenant,
      orderLines,
      positions as never,
      { assertApprovalAuthority: () => undefined } as never,
    );
    return {
      run: <T>(fn: () => Promise<T>) =>
        tenant.run({ tenantId: TENANT, companyId: null, actorId: 'u-tester' } as never, fn),
      svc,
    };
  }

  /** An order with one line of 10 at 1,000, in whatever state the case needs. */
  async function seed(status: 'approved' | 'issued' | 'partially_received' | 'received' = 'issued') {
    const id = newId();
    await pool!.query(
      `INSERT INTO public.aura_procurement_purchase_orders
         (id, tenant_id, title, status, value, discipline, created_at, reference)
       VALUES ($1,$2,'Lifecycle PO',$3,10000,'elv', now(), $4)`,
      [id, TENANT, status, `PO-${id.slice(0, 8)}`]);
    const line = makePurchaseOrderLine({
      tenantId: TENANT, poId: id, lineNo: 1, materialId: newId(),
      snapshot: { materialCode: 'MAT-1', materialName: 'Cable', specification: null, manufacturer: null, model: null, uom: 'nr' },
      quantity: 10, unitPrice: 1_000, unitPriceBasis: 'agreed', sourceType: 'direct',
    });
    await orderLines.save(line);
    return { id, lineId: line.id };
  }

  const statusOf = async (id: string) =>
    (await pool!.query('SELECT status, cancelled_value, cancellation_reason, cancelled_by, closed_by, approval_basis, issued_by FROM public.aura_procurement_purchase_orders WHERE id=$1', [id])).rows[0];

  // ── ISSUE ───────────────────────────────────────────────────────────────

  skipless('issue without approval is refused, at every value', async () => {
    const { svc, run } = service();
    const { id } = await seed('approved');
    await pool!.query(`UPDATE public.aura_procurement_purchase_orders SET status='draft' WHERE id=$1`, [id]);
    await expect(run(() => svc.issue(id, 'u-buyer'))).rejects.toThrow(/must be approved first/);
    expect((await statusOf(id)).status).toBe('draft');
  });

  skipless('an auto-approved small order carries an EXPLICIT approval fact before it can issue', async () => {
    const { svc, run } = service();
    const id = newId();
    // 4,000 — inside the auto-approve tier, which used to mean "issued with no approval anywhere".
    await pool!.query(
      `INSERT INTO public.aura_procurement_purchase_orders
         (id, tenant_id, title, status, value, discipline, created_at) VALUES ($1,$2,'Small PO','draft',4000,'elv', now())`,
      [id, TENANT]);

    const approved = await run(() => svc.submitForApproval(id));
    expect(approved.status).toBe('approved');
    // THE FACT EXISTS, and says it was taken by the matrix rather than by a person.
    const row = await statusOf(id);
    expect(row.approval_basis).toBe('automatic');

    const issued = await run(() => svc.issue(id, 'u-buyer'));
    expect(issued.status).toBe('issued');
    expect((await statusOf(id)).issued_by).toBe('u-tester');
  });

  // ── CANCEL ──────────────────────────────────────────────────────────────

  skipless('a PART RECEIVED order cancels only what is left, and records what it reversed', async () => {
    const { svc, run } = service();
    const { id } = await seed('partially_received');
    position = { known: true, receivedValue: 4_000, invoicedValue: 0, acceptedByLine: {}, rejectedByLine: {} };

    await run(() => svc.cancel(id, { actorId: 'u-mgr', reason: 'the rest is no longer needed' }));

    const row = await statusOf(id);
    expect(row.status).toBe('cancelled');
    // 10,000 committed less 4,000 already delivered. NOT 10,000 — the goods in the store were
    // committed to, and the cost line must not drop by more than the order ever put on it.
    expect(Number(row.cancelled_value)).toBe(6_000);
    expect(row.cancellation_reason).toBe('the rest is no longer needed');
    expect(row.cancelled_by).toBe('u-tester');
  });

  skipless('a PART INVOICED order counts the invoice as settled too', async () => {
    const { svc, run } = service();
    const { id } = await seed();
    position = { known: true, receivedValue: 2_500, invoicedValue: 2_500, acceptedByLine: {}, rejectedByLine: {} };
    await run(() => svc.cancel(id, { actorId: 'u-mgr', reason: 'descoped' }));
    expect(Number((await statusOf(id)).cancelled_value)).toBe(7_500);
  });

  skipless('a fully delivered order refuses cancellation — it is closed, not cancelled', async () => {
    const { svc, run } = service();
    const { id } = await seed('received');
    position = { known: true, receivedValue: 10_000, invoicedValue: 10_000, acceptedByLine: {}, rejectedByLine: {} };
    await expect(run(() => svc.cancel(id, { actorId: 'u-mgr', reason: 'too late' })))
      .rejects.toThrow(/nothing remains to cancel/);
    expect((await statusOf(id)).status).toBe('received');
  });

  skipless('a DOUBLE cancel is refused, and does not reverse anything twice', async () => {
    const { svc, run } = service();
    const { id } = await seed();
    await run(() => svc.cancel(id, { actorId: 'u-mgr', reason: 'first' }));
    await expect(run(() => svc.cancel(id, { actorId: 'u-mgr', reason: 'second' })))
      .rejects.toThrow(/already cancelled/);
    const row = await statusOf(id);
    expect(row.cancellation_reason).toBe('first');
    expect(Number(row.cancelled_value)).toBe(10_000);
  });

  skipless('a cancellation without a reason is refused', async () => {
    const { svc, run } = service();
    const { id } = await seed();
    await expect(run(() => svc.cancel(id, { actorId: 'u-mgr', reason: '  ' })))
      .rejects.toThrow(/must record why/);
  });

  /**
   * CONCURRENT CANCEL vs RECEIPT. The delivery lands while the cancellation is deciding — exactly
   * the window between reading a position and writing on it. The receipt reconciles onto the order's
   * own row, so it blocks on the lock the cancellation holds, and the two cannot both win.
   */
  skipless('a receipt landing DURING a cancellation cannot overwrite its outcome', async () => {
    const { svc, run } = service();
    const { id } = await seed();

    let receiptOutcome: 'blocked-then-applied' | 'raced' = 'raced';
    duringDecision = async () => {
      // A competing write to the same row, on its OWN connection, while the cancel holds it.
      const competing = pool!.connect().then(async (client) => {
        try {
          await client.query('BEGIN');
          await client.query(
            `UPDATE public.aura_procurement_purchase_orders SET status='partially_received' WHERE id=$1`, [id]);
          await client.query('COMMIT');
          receiptOutcome = 'blocked-then-applied';
        } finally {
          client.release();
        }
      });
      // It must NOT have completed while we hold the row: if it had, the cancellation would be
      // deciding on a position that had already changed underneath it.
      await new Promise((r) => setTimeout(r, 250));
      expect(receiptOutcome, 'the competing write must wait for the decision').toBe('raced');
      void competing;
    };

    await run(() => svc.cancel(id, { actorId: 'u-mgr', reason: 'cancelled while a delivery was in flight' }));
    await new Promise((r) => setTimeout(r, 300));

    // The receipt applied AFTER the cancellation — so the order's final state is the receipt's, and
    // the cancellation's own facts survive on the row for somebody to reconcile. What must not
    // happen is the cancellation deciding on a stale position, and it did not.
    const row = await statusOf(id);
    expect(row.cancellation_reason).toBe('cancelled while a delivery was in flight');
    expect(Number(row.cancelled_value)).toBe(10_000);
  });

  // ── CLOSE ───────────────────────────────────────────────────────────────

  skipless('close with quantity outstanding is refused, naming what is outstanding', async () => {
    const { svc, run } = service();
    const { id, lineId } = await seed();
    position = { known: true, receivedValue: 4_000, invoicedValue: 4_000, acceptedByLine: { [lineId]: 4 }, rejectedByLine: {} };
    await expect(run(() => svc.close(id, 'u-mgr'))).rejects.toThrow(/6 nr of 10/);
    expect((await statusOf(id)).status).toBe('issued');
  });

  skipless('close with received goods NOT yet invoiced is refused — that is a liability', async () => {
    const { svc, run } = service();
    const { id, lineId } = await seed();
    position = { known: true, receivedValue: 10_000, invoicedValue: 6_000, acceptedByLine: { [lineId]: 10 }, rejectedByLine: {} };
    await expect(run(() => svc.close(id, 'u-mgr'))).rejects.toThrow(/has not been invoiced yet/);
  });

  skipless('closes when everything arrived and everything was billed', async () => {
    const { svc, run } = service();
    const { id, lineId } = await seed('received');
    position = { known: true, receivedValue: 10_000, invoicedValue: 10_000, acceptedByLine: { [lineId]: 10 }, rejectedByLine: {} };
    await run(() => svc.close(id, 'u-mgr'));
    const row = await statusOf(id);
    expect(row.status).toBe('closed');
    expect(row.closed_by).toBe('u-tester');
  });

  /** CONCURRENT CLOSE vs INVOICE/RECEIPT — the same window, on the other act. */
  skipless('an invoice landing DURING a closure cannot slip past its conditions', async () => {
    const { svc, run } = service();
    const { id, lineId } = await seed('received');
    position = { known: true, receivedValue: 10_000, invoicedValue: 10_000, acceptedByLine: { [lineId]: 10 }, rejectedByLine: {} };

    let applied = false;
    duringDecision = async () => {
      void pool!.connect().then(async (client) => {
        try {
          await client.query('BEGIN');
          await client.query(`UPDATE public.aura_procurement_purchase_orders SET value=12000 WHERE id=$1`, [id]);
          await client.query('COMMIT');
          applied = true;
        } finally { client.release(); }
      });
      await new Promise((r) => setTimeout(r, 250));
      expect(applied, 'a competing write must wait for the closure to finish deciding').toBe(false);
    };

    await run(() => svc.close(id, 'u-mgr'));
    expect((await statusOf(id)).status).toBe('closed');
  });

  // ── AND THE POSITION ITSELF ─────────────────────────────────────────────

  skipless('a position that cannot be read refuses BOTH acts, rather than reading as "nothing happened"', async () => {
    const { svc, run } = service();
    const { id } = await seed();
    position = { known: false, reason: 'the receipt register did not answer' };
    await expect(run(() => svc.cancel(id, { actorId: 'u-mgr', reason: 'x' }))).rejects.toThrow(/cannot be read/);
    await expect(run(() => svc.close(id, 'u-mgr'))).rejects.toThrow(/cannot be read/);
    expect((await statusOf(id)).status).toBe('issued');
  });
});
