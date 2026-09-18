import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresCustomerInvoiceStore } from './postgres-customer-invoice-store';
import { cancelInvoice, issueInvoice, makeCustomerInvoice } from './domain/customer-invoice';

/**
 * CUSTOMER INVOICING — REAL Postgres proof that the signatures persist and the invariants belong to
 * the database.
 *
 * The finding was silence: `issued`, `cancelled` and `receipt_recorded` all carried `actor_id = NULL`
 * because no actor reached the service, and the row held nothing at all beyond `created_by`. A
 * service-level fix alone would be a promise; the constraints are what make it a fact.
 *
 * The store's INSERT also gained six placeholders in one pass. A positional mismatch there fails
 * every invoice write at runtime while the whole in-memory suite stays green, which is the second
 * reason this file exists.
 *
 * Gated on FINANCE_PG_TEST_URL (migration 0366 applied).
 */
const URL = process.env.FINANCE_PG_TEST_URL;
const TENANT = `ci-int-${Date.now()}`;
const run = URL ? describe : describe.skip;

run('customer invoice — issue and void provenance in Postgres', () => {
  let pool: Pool;
  let store: PostgresCustomerInvoiceStore;
  let n = 0;

  const raw = async (id: string) => {
    const res = await pool.query<{ status: string; created_by: string | null; issued_by: string | null; issued_at: Date | null; cancelled_by: string | null; cancel_reason: string | null; deleted_by: string | null }>(
      'SELECT status, created_by, issued_by, issued_at, cancelled_by, cancel_reason, deleted_by FROM public.aura_finance_customer_invoices WHERE id = $1', [id]);
    return res.rows[0];
  };
  const draft = async (raisedBy: string | null = 'u-e2e-finance') => {
    const inv = makeCustomerInvoice({
      tenantId: TENANT, invoiceNumber: `INV-${TENANT}-${++n}`, customerName: 'Al Nahda Developments',
      issueDate: '2026-09-18', lines: [{ description: 'ELV works', quantity: 1, unitPrice: 100_000, vatRate: 5 }],
      createdBy: raisedBy,
    });
    await store.save(inv);
    return inv;
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL });
    pool.on('connect', (c) => { c.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT]).catch(() => undefined); });
    store = new PostgresCustomerInvoiceStore(pool);
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM public.aura_finance_customer_invoices WHERE tenant_id = $1', [TENANT]).catch(() => undefined);
    await pool?.end();
  });

  it('writes who raised it, who sent it and who voided it', async () => {
    const inv = await draft();
    expect(await raw(inv.id)).toMatchObject({ status: 'draft', created_by: 'u-e2e-finance', issued_by: null, cancelled_by: null });

    await store.save(issueInvoice((await store.get(inv.id))!, 'u-e2e-finance'));
    const afterIssue = await raw(inv.id);
    expect(afterIssue).toMatchObject({ status: 'issued', issued_by: 'u-e2e-finance' });
    expect(afterIssue.issued_at, 'the issue event carried a null actor and the row held nothing').not.toBeNull();

    await store.save(cancelInvoice((await store.get(inv.id))!, 'u-e2e-controller-a', 'raised against the wrong contract'));
    expect(await raw(inv.id)).toMatchObject({
      status: 'cancelled', issued_by: 'u-e2e-finance',
      cancelled_by: 'u-e2e-controller-a', cancel_reason: 'raised against the wrong contract',
    });

    const read = await store.get(inv.id);
    expect(read).toMatchObject({ issuedBy: 'u-e2e-finance', cancelledBy: 'u-e2e-controller-a' });
    expect(read?.issuedAt).not.toBeNull();
  });

  it('INVARIANT — an issue cannot be half-signed', async () => {
    const inv = await draft();
    for (const [sql, label] of [
      [`UPDATE public.aura_finance_customer_invoices SET issued_at = now() WHERE id = $1`, 'time, no sender'],
      [`UPDATE public.aura_finance_customer_invoices SET issued_by = 'u-x' WHERE id = $1`, 'sender, no time'],
    ] as const) {
      await expect(pool.query(sql, [inv.id]), label).rejects.toThrow(/aura_customer_invoice_issued_complete/);
    }
  });

  it('INVARIANT — a void says who, when and WHY, or says nothing', async () => {
    const inv = await draft();
    for (const [sql, label] of [
      [`UPDATE public.aura_finance_customer_invoices SET cancelled_at = now() WHERE id = $1`, 'time only'],
      [`UPDATE public.aura_finance_customer_invoices SET cancelled_at = now(), cancelled_by = 'u-x' WHERE id = $1`, 'no reason'],
      [`UPDATE public.aura_finance_customer_invoices SET cancelled_at = now(), cancelled_by = 'u-x', cancel_reason = '  ' WHERE id = $1`, 'blank reason'],
    ] as const) {
      await expect(pool.query(sql, [inv.id]), label).rejects.toThrow(/aura_customer_invoice_cancelled_complete/);
    }
    // The NULL-reason case is the one that matters, and it is the one a naive constraint lets through:
    // `btrim(NULL) <> ''` is NULL, `FALSE OR NULL` is NULL, and a CHECK passes on NULL. That exact
    // hole shipped in 0362 and was caught by its own test; 0366 tests the NULL explicitly.
  });

  it('INVARIANT — a cancelled timestamp and a non-cancelled status cannot coexist', async () => {
    const inv = await draft();
    await expect(pool.query(
      `UPDATE public.aura_finance_customer_invoices SET cancelled_at = now(), cancelled_by = 'u-x', cancel_reason = 'why' WHERE id = $1`,
      [inv.id],
    )).rejects.toThrow(/aura_customer_invoice_cancelled_status/);
  });

  it('records who deleted a draft', async () => {
    const inv = await draft();
    await store.save({ ...inv, deletedBy: 'u-e2e-controller-a' });
    await store.setDeleted(TENANT, inv.id, true);
    expect((await raw(inv.id)).deleted_by).toBe('u-e2e-controller-a');
  });

  it('never lets a later write restate who raised it', async () => {
    // `created_by` stays out of the DO UPDATE SET, as it always has. Issuing and voicing both re-save
    // the whole record, and neither may rewrite who raised the invoice.
    const inv = await draft('u-e2e-finance');
    await store.save({ ...inv, createdBy: 'u-impostor', customerName: 'Edited Customer' });
    const row = await raw(inv.id);
    expect(row.created_by).toBe('u-e2e-finance');
  });
});
