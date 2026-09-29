import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PostgresCustomerInvoiceStore } from './postgres-customer-invoice-store';
import { issueInvoice, makeCustomerInvoice } from './domain/customer-invoice';
import { makeCustomerReceipt } from './domain/customer-receipt';

/**
 * AR-INV-02 — EACH CUSTOMER RECEIPT IS A RECORD, AND THE PAID AMOUNT IS THEIR SUM — against real
 * PostgreSQL (migration 0400), as the API's own role (aura_app, under RLS).
 *
 *   records      each receipt persists with its amount, date, bank reference and recorder; the
 *                invoice's amount_paid equals the sum of its receipts, and the status follows it
 *   the table    a receipt with no bank reference, a hand-written legacy receipt, an edit and a delete
 *                are refused; nobody can set amount_paid, cancel an invoice carrying money, or open an
 *                invoice already "paid" — whatever writes it
 *   the rules    a receipt on a draft and one past the total are refused by the database itself
 *   concurrency  two receipts racing for the same balance: exactly one lands
 *
 * It SKIPS without a database rather than passing quietly.
 */
function databaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = path.resolve(__dirname, '../../../apps/api/.env.local');
    if (!fs.existsSync(envPath)) return undefined;
    for (const line of fs.readFileSync(envPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      if (line.startsWith('DATABASE_URL=')) return line.split('DATABASE_URL=')[1].trim();
    }
  } catch {
    // no env file — treated as "no database", which is a skip, not a failure
  }
  return undefined;
}

const TENANT = `ar-rcpt-${Date.now()}`;

describe('customer receipts are records and the paid amount is their sum (PostgreSQL)', () => {
  let pool: Pool | null = null;
  let store: PostgresCustomerInvoiceStore;
  let n = 0;

  /** An issued invoice of 1,000 net + 5% VAT = 1,050. */
  const issued = async (): Promise<string> => {
    const inv = makeCustomerInvoice({
      tenantId: TENANT, invoiceNumber: `AR-RCPT-${TENANT}-${++n}`, customerName: 'Al Nahda Developments',
      issueDate: '2026-09-28', lines: [{ description: 'ELV works', quantity: 1, unitPrice: 1000, vatRate: 5 }], createdBy: 'u-ar',
    });
    await store.save(inv);
    await store.save(issueInvoice(inv, 'u-ar'));
    return inv.id;
  };
  const receipt = (invoiceId: string, amount: number, bankReference: string) =>
    makeCustomerReceipt({ tenantId: TENANT, invoiceId, amount, receivedOn: '2026-09-28', bankReference, recordedBy: 'u-ar' });
  const row = async (id: string) =>
    (await pool!.query<{ amount_paid: string; status: string; receipts_sum: string }>(
      `SELECT amount_paid, status,
              (SELECT coalesce(sum(amount), 0) FROM public.aura_finance_customer_receipts r WHERE r.invoice_id = i.id) AS receipts_sum
       FROM public.aura_finance_customer_invoices i WHERE id = $1`, [id])).rows[0];

  beforeAll(async () => {
    const url = databaseUrl();
    if (!url) return;
    pool = new Pool({ connectionString: url });
    pool.on('connect', (client) => {
      void client.query(`SELECT set_config('app.current_tenant_id', '${TENANT}', false)`);
    });
    store = new PostgresCustomerInvoiceStore(pool);
  });

  afterAll(async () => { await pool?.end(); });

  it('persists each receipt with its amount, date, bank reference and recorder, and derives the paid amount from them', async (ctx) => {
    if (!pool) { ctx.skip(); return; }
    const id = await issued();
    const afterFirst = await store.addReceipt(receipt(id, 500, 'TT-0001'));
    expect(afterFirst).toMatchObject({ amountPaid: 500, status: 'partially_paid' });
    await store.addReceipt(makeCustomerReceipt({ tenantId: TENANT, invoiceId: id, amount: 500, receivedOn: '2026-09-29', bankReference: 'CHQ-17', recordedBy: 'u-ar2' }));
    const afterLast = await store.addReceipt(receipt(id, 50, 'TT-0002'));
    expect(afterLast).toMatchObject({ amountPaid: 1050, status: 'paid' });

    const rows = await store.listReceipts(TENANT, id);
    expect(rows.map((r) => ({ amount: r.amount, receivedOn: r.receivedOn, bankReference: r.bankReference, recordedBy: r.recordedBy, legacy: r.legacy }))).toEqual([
      { amount: 500, receivedOn: '2026-09-28', bankReference: 'TT-0001', recordedBy: 'u-ar', legacy: false },
      { amount: 500, receivedOn: '2026-09-29', bankReference: 'CHQ-17', recordedBy: 'u-ar2', legacy: false },
      { amount: 50, receivedOn: '2026-09-28', bankReference: 'TT-0002', recordedBy: 'u-ar', legacy: false },
    ]);
    expect(rows.every((r) => r.recordedAt !== null)).toBe(true);
    const stored = await row(id);
    expect(Number(stored.amount_paid), 'the column reconciles to its receipts').toBe(Number(stored.receipts_sum));
  });

  it('the database refuses a receipt on a draft and one past the total — without the domain in front of it', async (ctx) => {
    if (!pool) { ctx.skip(); return; }
    const draft = makeCustomerInvoice({
      tenantId: TENANT, invoiceNumber: `AR-RCPT-${TENANT}-${++n}`, customerName: 'Draft Co', issueDate: '2026-09-28',
      lines: [{ description: 'x', quantity: 1, unitPrice: 100, vatRate: 5 }],
    });
    await store.save(draft);
    await expect(store.addReceipt(receipt(draft.id, 10, 'TT-D'))).rejects.toThrow('cannot record a receipt from status draft');

    const id = await issued();
    await store.addReceipt(receipt(id, 1000, 'TT-A'));
    await expect(store.addReceipt(receipt(id, 50.01, 'TT-B'))).rejects.toThrow('receipt exceeds invoice balance');
    expect(Number((await row(id)).amount_paid), 'the refused receipt left nothing behind').toBe(1000);
  });

  it('the table refuses an unevidenced receipt, a hand-written legacy one, and any edit or delete', async (ctx) => {
    if (!pool) { ctx.skip(); return; }
    const id = await issued();
    const insert = (ref: string | null, receivedOn: string | null, legacy = false) =>
      pool!.query(
        `INSERT INTO public.aura_finance_customer_receipts (id, tenant_id, invoice_id, amount, received_on, bank_reference, recorded_by, recorded_at, legacy)
         VALUES ($1,$2,$3,10,$4,$5,'u-ar',$6,$7)`,
        [randomUUID(), TENANT, id, receivedOn, ref, legacy ? null : new Date().toISOString(), legacy],
      );
    await expect(insert(null, '2026-09-28'), 'no bank reference').rejects.toThrow(/chk_aura_customer_receipt_evidence/);
    await expect(insert('  ', '2026-09-28'), 'a blank bank reference').rejects.toThrow(/chk_aura_customer_receipt_evidence/);
    await expect(insert('TT-1', null), 'no date').rejects.toThrow(/chk_aura_customer_receipt_evidence/);

    const kept = await store.addReceipt(receipt(id, 10, 'TT-KEEP'));
    expect(kept.amountPaid).toBe(10);
    const receiptId = (await store.listReceipts(TENANT, id))[0].id;
    await expect(pool.query(`UPDATE public.aura_finance_customer_receipts SET amount = 1 WHERE id = $1`, [receiptId]), 'an edit').rejects.toThrow(/permission denied|never edited or deleted/);
    await expect(pool.query(`DELETE FROM public.aura_finance_customer_receipts WHERE id = $1`, [receiptId]), 'a delete').rejects.toThrow(/permission denied|never edited or deleted/);
    expect((await store.listReceipts(TENANT, id)).map((r) => r.amount)).toEqual([10]);
  });

  it('nobody writes the paid amount but the receipts, and an invoice carrying money cannot be cancelled', async (ctx) => {
    if (!pool) { ctx.skip(); return; }
    const id = await issued();
    await store.addReceipt(receipt(id, 300, 'TT-G'));
    await expect(pool.query(`UPDATE public.aura_finance_customer_invoices SET amount_paid = 1050, status = 'paid' WHERE id = $1`, [id]), 'a second total').rejects.toThrow(/never a number of its own/);
    await expect(pool.query(`UPDATE public.aura_finance_customer_invoices SET status = 'cancelled' WHERE id = $1`, [id]), 'a void with money on it').rejects.toThrow(/its status follows its receipts/);
    // The stale-save race the service cannot see: an invoice read before the receipt, cancelled after it.
    const stale = (await store.get(id))!;
    await expect(store.save({ ...stale, status: 'cancelled', cancelledBy: 'u-controller', cancelledAt: new Date().toISOString(), cancelReason: 'raced' })).rejects.toThrow(/its status follows its receipts/);
    // And a new invoice cannot arrive already paid.
    await expect(pool.query(
      `INSERT INTO public.aura_finance_customer_invoices (id, tenant_id, invoice_number, customer_name, issue_date, total, amount_paid, status)
       VALUES ($1,$2,$3,'Seeded Co','2026-09-28',100,100,'paid')`, [randomUUID(), TENANT, `AR-SEED-${TENANT}`],
    ), 'an invoice born paid').rejects.toThrow(/paid only by its receipts/);
    expect(await row(id)).toMatchObject({ amount_paid: '300.00', status: 'partially_paid' });
  });

  it('two receipts racing for the same balance: exactly one lands, and the total still reconciles', async (ctx) => {
    if (!pool) { ctx.skip(); return; }
    const id = await issued();
    const first: PoolClient = await pool.connect();
    const second: PoolClient = await pool.connect();
    try {
      const sql = `INSERT INTO public.aura_finance_customer_receipts (id, tenant_id, invoice_id, amount, received_on, bank_reference, recorded_by, recorded_at)
                   VALUES ($1,$2,$3,600,'2026-09-28',$4,'u-ar',now())`;
      await first.query('BEGIN');
      await second.query('BEGIN');
      await first.query(sql, [randomUUID(), TENANT, id, 'TT-RACE-1']);
      // Blocks on the invoice row the first transaction holds …
      const racing = second.query(sql, [randomUUID(), TENANT, id, 'TT-RACE-2']).then(() => 'landed', (e: Error) => e.message);
      await new Promise((r) => setTimeout(r, 300));
      await first.query('COMMIT');
      // … and, once it can see the first receipt, finds no room for its own.
      expect(await racing).toMatch(/receipt exceeds invoice balance/);
      await second.query('ROLLBACK');
    } finally {
      first.release();
      second.release();
    }
    expect((await store.listReceipts(TENANT, id)).map((r) => r.bankReference)).toEqual(['TT-RACE-1']);
    expect(await row(id)).toMatchObject({ amount_paid: '600.00', status: 'partially_paid', receipts_sum: '600.00' });

    // The same race through the store, both at once: one fulfils, one is refused.
    const id2 = await issued();
    const results = await Promise.allSettled([store.addReceipt(receipt(id2, 600, 'TT-P1')), store.addReceipt(receipt(id2, 600, 'TT-P2'))]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    expect(results.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason))).toEqual([expect.stringMatching(/exceeds invoice balance/)]);
    expect(Number((await row(id2)).amount_paid)).toBe(600);
  });
});
