import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { newId } from '@aura/shared';
import { PostgresTxRunner, LockService, TenantContext } from '@aura/core';
import { PostgresSourcingRecommendationStore } from './postgres-sourcing-recommendation-store';
import { PostgresQuotationFamilyStore } from './postgres-quotation-family-store';
import { PostgresPurchaseOrderStore } from './postgres-purchase-order-store';
import { PostgresPurchaseOrderLineStore } from './postgres-purchase-order-line-store';
import { SourcingAwardService } from './sourcing-award.service';
import { makeSourcingRecommendation, type RecommendationSelection } from './domain/sourcing-recommendation';

/**
 * SUP-14 UNDER CONCURRENCY, against REAL PostgreSQL.
 *
 * Everything else about the award is proved with one request at a time, and one request at a time is
 * not what a purchase order has to survive. Two buyers click Award within the same second; a retry
 * fires while the first attempt is still running; a supplier's revision is confirmed in the moment
 * between "this is not stale" and the orders being written. Each produces money that is wrong in a
 * way nobody notices for weeks:
 *
 *   two full sets of purchase orders for one decision, to a supplier entitled to be paid for both
 *   one supplier ordered from and the next not, with the decision still unawarded
 *   an order placed on terms that stopped being current while it was being placed
 *
 * None of these can be reproduced in memory, and none is caught by a sequential test however
 * thorough. They need two connections and a database that arbitrates between them — which is what
 * this file does.
 *
 * It SKIPS without a database rather than passing quietly.
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

const TENANT = `sup14pg-${Date.now()}`;

describe('awarding under concurrency (PostgreSQL)', () => {
  let pool: Pool | null = null;
  let recommendations: PostgresSourcingRecommendationStore;
  let families: PostgresQuotationFamilyStore;
  let orders: PostgresPurchaseOrderStore;
  let orderLines: PostgresPurchaseOrderLineStore;

  beforeAll(async () => {
    const url = databaseUrl();
    if (!url) return;
    pool = new Pool({ connectionString: url });
    pool.on('connect', (client) => {
      void client.query(`SELECT set_config('app.current_tenant_id', '${TENANT}', false)`);
    });
    recommendations = new PostgresSourcingRecommendationStore(pool);
    families = new PostgresQuotationFamilyStore(pool);
    orders = new PostgresPurchaseOrderStore(pool);
    orderLines = new PostgresPurchaseOrderLineStore(pool);
  });

  afterAll(async () => {
    if (!pool) return;
    for (const table of [
      'aura_procurement_purchase_order_lines', 'aura_procurement_purchase_orders',
      'aura_procurement_recommendation_selections', 'aura_procurement_sourcing_recommendations',
      'aura_procurement_quotation_lines', 'aura_procurement_quotation_revisions',
      'aura_procurement_quotation_offers', 'aura_procurement_quotation_families',
      'aura_procurement_purchase_request_lines', 'aura_procurement_purchase_requests',
      'aura_procurement_rfqs',
    ]) {
      await pool.query(`DELETE FROM public.${table} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }
    await pool.end();
  });

  /** A real skip, never a silent pass. */
  const skipless = (name: string, body: () => Promise<void>) =>
    it(name, async (ctx) => {
      if (!pool) { ctx.skip(); return; }
      await body();
    }, 60_000);

  /**
   * One approved recommendation with TWO suppliers, each pricing one requisition line — so an award
   * has two orders to raise and a half-done state to fall into.
   */
  async function seed(): Promise<{ recommendationId: string; selections: RecommendationSelection[]; offerIds: string[] }> {
    const db = pool!;
    const rfqId = newId();
    const prId = newId();
    await db.query(
      `INSERT INTO public.aura_procurement_purchase_requests (id, tenant_id, title, status, value, created_at)
       VALUES ($1,$2,'Concurrency PR','approved',0, now())`, [prId, TENANT]);
    await db.query(
      `INSERT INTO public.aura_procurement_rfqs (id, tenant_id, title, status, pr_id, created_at)
       VALUES ($1,$2,'Concurrency RFQ','sent',$3, now())`, [rfqId, TENANT, prId]);

    const prLineIds = [newId(), newId()];
    for (const [i, id] of prLineIds.entries()) {
      await db.query(
        `INSERT INTO public.aura_procurement_purchase_request_lines
           (id, tenant_id, pr_id, line_no, material_id, material_code, material_name, uom, quantity,
            estimated_unit_cost, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'nr',10,100, now())`,
        [id, TENANT, prId, i + 1, newId(), `MAT-${i}`, `Material ${i}`]);
    }

    const selections: RecommendationSelection[] = [];
    const offerIds: string[] = [];
    const recommendationId = newId();
    for (const [i, prLineId] of prLineIds.entries()) {
      const familyId = newId(); const offerId = newId(); const revisionId = newId();
      offerIds.push(offerId);
      await db.query(
        `INSERT INTO public.aura_procurement_quotation_families
           (id, tenant_id, rfq_id, supplier_name, created_at) VALUES ($1,$2,$3,$4, now())`,
        [familyId, TENANT, rfqId, `Supplier ${i}`]);
      await db.query(
        `INSERT INTO public.aura_procurement_quotation_offers
           (id, tenant_id, family_id, kind, label, created_at) VALUES ($1,$2,$3,'base',NULL, now())`,
        [offerId, TENANT, familyId]);
      await db.query(
        `INSERT INTO public.aura_procurement_quotation_revisions
           (id, tenant_id, offer_id, revision_no, origin, status, currency, tax_treatment, tax_rate_pct,
            received_at, created_at)
         VALUES ($1,$2,$3,0,'captured','confirmed','AED','exclusive',5, now(), now())`,
        [revisionId, TENANT, offerId]);
      await db.query(
        `INSERT INTO public.aura_procurement_quotation_lines
           (id, tenant_id, revision_id, pr_line_id, response, quantity, uom, unit_price, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'quoted',10,'nr',100, now(), now())`,
        [newId(), TENANT, revisionId, prLineId]);

      selections.push({
        id: newId(), tenantId: TENANT, recommendationId, familyId, offerId, revisionId,
        supplierName: `Supplier ${i}`, coveredPrLineIds: [prLineId], governedTotal: 1_000,
        governedTotalBasis: 'ex-tax', technicalStatus: 'eligible', commercialStatus: 'live',
        createdAt: new Date().toISOString(),
      });
    }

    const recommendation = {
      ...makeSourcingRecommendation({
        tenantId: TENANT, rfqId, comparisonDate: '2026-03-10', comparisonCurrency: 'AED',
        mode: 'split_award', reasonCode: 'lower_project_risk', reason: 'dual sourcing',
      }),
      id: recommendationId, status: 'approved' as const,
    };
    await recommendations.create(recommendation, selections);
    return { recommendationId, selections, offerIds };
  }

  /**
   * The service, wired the way the module wires it: real transaction runner, real lock.
   *
   * `award()` is wrapped in `tenant.run` because `PostgresTxRunner` binds `app.current_tenant_id`
   * transaction-locally FROM THE BOUND CONTEXT, failing closed to an empty tenant outside a request.
   * Unbound, the transaction would see nothing at all under `aura_app`'s RLS — the role doing
   * exactly its job, and a fixture mistake that would read as a product defect.
   */
  function service(overrides: { failOnSecondOrder?: boolean } = {}) {
    const tenant = new TenantContext();
    const txRunner = new PostgresTxRunner(pool!, tenant);
    const orderService = {
      raise: async (tx: unknown, input: Record<string, unknown>) => {
        if (overrides.failOnSecondOrder && String(input.title ?? '').includes('Supplier 1')) {
          throw new Error('injected failure while raising the second order');
        }
        const po = { ...input, id: newId(), reference: `PO-${newId().slice(0, 8)}`, createdAt: new Date().toISOString() };
        await orders.createWithClient(tx, po as never);
        return po;
      },
    };
    const built = new SourcingAwardService(
        recommendations, { get: async (id: string) => {
          const r = await pool!.query('SELECT id, tenant_id, title, pr_id FROM public.aura_procurement_rfqs WHERE id = $1', [id]);
          const row = r.rows[0];
          return row ? { id: row.id, tenantId: row.tenant_id, title: row.title, prId: row.pr_id } : null;
        } } as never,
        { listForRequest: async (prId: string) => {
          const r = await pool!.query(
            `SELECT id, material_id, material_code, material_name, uom, specification
               FROM public.aura_procurement_purchase_request_lines WHERE pr_id = $1 AND tenant_id = $2`,
            [prId, TENANT]);
          return r.rows.map((x) => ({
            id: x.id, materialId: x.material_id, materialCode: x.material_code,
            materialName: x.material_name, uom: x.uom, specification: x.specification ?? null,
          }));
        } } as never,
        families,
        { listByRevision: async (tenantId: string, revisionId: string) => {
          const r = await pool!.query(
            `SELECT id, pr_line_id, response, quantity, uom, unit_price, line_discount, line_discount_basis,
                    offered_manufacturer, offered_model, notes
               FROM public.aura_procurement_quotation_lines WHERE revision_id = $1 AND tenant_id = $2`,
            [revisionId, tenantId]);
          return r.rows.map((x) => ({
            id: x.id, prLineId: x.pr_line_id, response: x.response, quantity: Number(x.quantity),
            uom: x.uom, unitPrice: Number(x.unit_price),
            lineDiscount: x.line_discount === null ? null : Number(x.line_discount),
            lineDiscountBasis: x.line_discount_basis, offeredManufacturer: x.offered_manufacturer,
            offeredModel: x.offered_model, notes: x.notes,
          }));
        } } as never,
        orderService as never,
        orderLines,
        null,
        txRunner,
      new LockService(),
      null,
    );
    return {
      tenant,
      /** Bound for the whole call, so the transaction inside it can see this tenant's rows. */
      award: (actorId: string, recommendationId: string) =>
        tenant.run({ tenantId: TENANT, companyId: null, actorId } as never,
          () => built.award(TENANT, recommendationId, actorId)),
    };
  }

  const countOrders = async (recommendationId: string) =>
    Number((await pool!.query(
      'SELECT count(*)::int AS n FROM public.aura_procurement_purchase_orders WHERE sourcing_recommendation_id = $1',
      [recommendationId])).rows[0].n);

  const statusOf = async (recommendationId: string) =>
    (await pool!.query(
      'SELECT status FROM public.aura_procurement_sourcing_recommendations WHERE id = $1',
      [recommendationId])).rows[0]?.status;

  /**
   * TWO REQUESTS, ONE DECISION. Fired together, not one after the other: the failure mode only
   * exists when both read `approved` before either writes, which a sequential test can never produce.
   */
  skipless('two concurrent awards: one wins, one is refused, and exactly one set of orders exists', async () => {
    const { recommendationId } = await seed();
    const a = service();
    const b = service();

    const results = await Promise.allSettled([
      a.award('u-a', recommendationId),
      b.award('u-b', recommendationId),
    ]);

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won, 'exactly one award may succeed').toHaveLength(1);
    expect(lost, 'and the other must be told it lost, not silently no-op').toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason.message).toMatch(/awarded|cannot be awarded/i);

    // TWO suppliers, so one full set is two orders — not four, and not three.
    expect(await countOrders(recommendationId), 'one decision, one set of purchase orders').toBe(2);
    expect(await statusOf(recommendationId)).toBe('awarded');
  });

  /**
   * ATOMICITY. The second order fails; the first must not survive it, and the recommendation must
   * not be left claimed. The states this rules out are the expensive ones: a supplier ordered from
   * for a decision that still reads as unawarded, or a decision awarded with half its orders.
   */
  skipless('a failure part-way through leaves NO orders and the recommendation still approved', async () => {
    const { recommendationId } = await seed();
    const { award } = service({ failOnSecondOrder: true });

    await expect(award('u-a', recommendationId)).rejects.toThrow(/injected failure/);

    expect(await countOrders(recommendationId), 'the first order must roll back with the second').toBe(0);
    expect(await statusOf(recommendationId), 'and the decision stays awardable').toBe('approved');
  });

  /**
   * …and it is still awardable afterwards. A rollback that left the row locked or half-claimed would
   * be a different kind of stuck.
   */
  skipless('and the same recommendation can then be awarded successfully', async () => {
    const { recommendationId } = await seed();
    const failing = service({ failOnSecondOrder: true });
    await expect(failing.award('u-a', recommendationId)).rejects.toThrow();

    const { award } = service();
    const result = await award('u-a', recommendationId);
    expect(result.orders).toHaveLength(2);
    expect(await countOrders(recommendationId)).toBe(2);
    expect(await statusOf(recommendationId)).toBe('awarded');
  });

  /**
   * THE STALE-REVISION RACE. A supplier's newer revision is confirmed while the award is running.
   * Either the award refuses it as stale, or it committed on what was true and the confirmation
   * followed — what must NOT happen is an order placed on a revision that had already been
   * superseded when it was written.
   */
  skipless('an award and a concurrent revision confirmation cannot both win', async () => {
    const { recommendationId, selections, offerIds } = await seed();

    const confirmNewRevision = async () => {
      const client = await pool!.connect();
      try {
        await client.query('BEGIN');
        const next = newId();
        await client.query(
          `INSERT INTO public.aura_procurement_quotation_revisions
             (id, tenant_id, offer_id, revision_no, origin, status, currency, tax_treatment, tax_rate_pct,
              received_at, created_at)
           VALUES ($1,$2,$3,1,'captured','received','AED','exclusive',5, now(), now())`,
          [next, TENANT, offerIds[0]]);
        // Supersede first: the partial unique index refuses two confirmed revisions on one offer, so
        // this UPDATE is what an award holding the row `FOR SHARE` makes wait.
        await client.query(
          `UPDATE public.aura_procurement_quotation_revisions SET status = 'superseded'
            WHERE tenant_id = $1 AND id = $2`, [TENANT, selections[0].revisionId]);
        await client.query(
          `UPDATE public.aura_procurement_quotation_revisions SET status = 'confirmed'
            WHERE tenant_id = $1 AND id = $2`, [TENANT, next]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    };

    const { award: run } = service();
    const [award] = await Promise.allSettled([
      run('u-a', recommendationId),
      confirmNewRevision(),
    ]);

    const confirmedNow = (await pool!.query(
      `SELECT id FROM public.aura_procurement_quotation_revisions
        WHERE tenant_id = $1 AND offer_id = $2 AND status = 'confirmed'`, [TENANT, offerIds[0]])).rows[0]?.id;

    if (award.status === 'fulfilled') {
      // The award won the race. It must have been written against the revision that was current
      // when it committed — which is the one its orders name.
      expect(await countOrders(recommendationId)).toBe(2);
      const awardedRevision = (await pool!.query(
        `SELECT quotation_revision_id FROM public.aura_procurement_purchase_orders
          WHERE sourcing_recommendation_id = $1 AND quotation_revision_id = $2`,
        [recommendationId, selections[0].revisionId])).rows[0];
      expect(awardedRevision, 'the order names the revision the decision was made on').toBeTruthy();
    } else {
      // The confirmation won. The award must have refused as stale and written nothing at all.
      expect((award as PromiseRejectedResult).reason.message).toMatch(/out of date|no current revision|stale/i);
      expect(await countOrders(recommendationId), 'a refused award writes nothing').toBe(0);
      expect(await statusOf(recommendationId)).toBe('approved');
      expect(confirmedNow).not.toBe(selections[0].revisionId);
    }
  });
});
