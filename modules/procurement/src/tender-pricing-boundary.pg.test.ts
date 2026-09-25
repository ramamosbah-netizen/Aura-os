import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { newId } from '@aura/shared';

/**
 * THE TENDER-PRICING BOUNDARY, HELD BY THE DATABASE (migration 0387).
 *
 * A tender-pricing requisition reuses procurement's own RFQ, quotation, technical-evaluation and
 * commercial-comparison authorities to price a bid — and buys nothing. Every service that could
 * cross that line refuses to; this proves that the DATABASE refuses too, so neither a code path
 * nobody has written yet nor a direct write can. Every statement here is raw SQL. No service runs.
 *
 * It connects as `aura_app` — non-superuser, NOBYPASSRLS, the production role — so row-level
 * security applies exactly as it does in the application, and the fail-closed case at the end is a
 * real test rather than one a superuser would pass by bypassing the policy it is about.
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
    // no env file — "no database", which is a skip
  }
  return undefined;
}

const TENANT = `tpb-${Date.now()}`;
const OTHER_TENANT = `tpb-other-${Date.now()}`;
const BASIS = 'rev-1';
const OTHER_BASIS = 'rev-X';

describe('tender-pricing boundary, enforced by PostgreSQL (migration 0387)', () => {
  let pool: Pool | null = null;

  // Fixture identities, created once.
  const tender = newId();
  const otherTender = newId();
  const boq = newId();
  const otherBoq = newId();
  const boqItem = newId();
  const otherBoqItem = newId();
  const material = newId();
  const pricingPr = newId();
  const operationalPr = newId();
  const pricingLine = newId();
  const operationalLine = newId();
  const pricingRfq = newId();
  const operationalRfq = newId();
  const pricingQuoteLine = newId();

  beforeAll(async () => {
    const url = databaseUrl();
    if (!url) return;
    pool = new Pool({ connectionString: url, max: 1 });
    pool.on('connect', (client) => {
      void client.query(`SELECT set_config('app.current_tenant_id', '${TENANT}', false)`);
    });
    const q = (sql: string, params: unknown[]) => pool!.query(sql, params);

    // Two tenders, each with a BOQ projected from its own basis, each with one item.
    for (const [t, b, basis, item, code] of [
      [tender, boq, BASIS, boqItem, 'CCTV-01'],
      [otherTender, otherBoq, OTHER_BASIS, otherBoqItem, 'ACS-01'],
    ] as const) {
      await q(`INSERT INTO public.aura_tendering_tenders (id, tenant_id, title) VALUES ($1,$2,$3)`, [t, TENANT, `Tender ${code}`]);
      await q(`INSERT INTO public.aura_tendering_boqs (id, tenant_id, tender_id, source_basis_revision_id) VALUES ($1,$2,$3,$4)`, [b, TENANT, t, basis]);
      await q(`INSERT INTO public.aura_tendering_boq_items (id, tenant_id, boq_id, item_code, description, unit, quantity)
               VALUES ($1,$2,$3,$4,'IP camera, 4MP dome','no',120)`, [item, TENANT, b, code]);
    }

    // One pricing requisition and one operational one, each with a line.
    await q(`INSERT INTO public.aura_procurement_purchase_requests (id, tenant_id, title, purpose, source_tender_id, source_basis_revision_id)
             VALUES ($1,$2,'Pricing — Al Reem','tender_pricing',$3,$4)`, [pricingPr, TENANT, tender, BASIS]);
    await q(`INSERT INTO public.aura_procurement_purchase_requests (id, tenant_id, title) VALUES ($1,$2,'Operational')`, [operationalPr, TENANT]);
    await q(`INSERT INTO public.aura_procurement_purchase_request_lines
               (id, tenant_id, pr_id, line_no, material_id, material_code, material_name, uom, quantity,
                source_boq_item_id, material_mapped_by, material_mapped_at)
             VALUES ($1,$2,$3,1,$4,'CAM-4MP','IP camera 4MP','no',120,$5,'u-e2e-estimator',now())`,
      [pricingLine, TENANT, pricingPr, material, boqItem]);
    await q(`INSERT INTO public.aura_procurement_purchase_request_lines
               (id, tenant_id, pr_id, line_no, material_id, material_code, material_name, uom, quantity)
             VALUES ($1,$2,$3,1,$4,'CAM-4MP','IP camera 4MP','no',10)`,
      [operationalLine, TENANT, operationalPr, material]);

    // An RFQ on each, and a supplier quotation line answering the PRICING line.
    await q(`INSERT INTO public.aura_procurement_rfqs (id, tenant_id, title, pr_id) VALUES ($1,$2,'Pricing RFQ',$3)`, [pricingRfq, TENANT, pricingPr]);
    await q(`INSERT INTO public.aura_procurement_rfqs (id, tenant_id, title, pr_id) VALUES ($1,$2,'Operational RFQ',$3)`, [operationalRfq, TENANT, operationalPr]);
    const family = newId(); const offer = newId(); const revision = newId();
    await q(`INSERT INTO public.aura_procurement_quotation_families (id, tenant_id, rfq_id, supplier_name) VALUES ($1,$2,$3,'Supplier A')`, [family, TENANT, pricingRfq]);
    await q(`INSERT INTO public.aura_procurement_quotation_offers (id, tenant_id, family_id) VALUES ($1,$2,$3)`, [offer, TENANT, family]);
    await q(`INSERT INTO public.aura_procurement_quotation_revisions (id, tenant_id, offer_id, revision_no) VALUES ($1,$2,$3,1)`, [revision, TENANT, offer]);
    // A QUOTED line must carry a quantity and a price (`aura_quotation_lines_quoted_is_priced`).
    await q(`INSERT INTO public.aura_procurement_quotation_lines (id, tenant_id, pr_line_id, revision_id, quantity, unit_price)
             VALUES ($1,$2,$3,$4,120,410)`,
      [pricingQuoteLine, TENANT, pricingLine, revision]);
  });

  afterAll(async () => {
    if (!pool) return;
    for (const table of [
      'aura_tendering_estimate_sources',
      'aura_procurement_purchase_order_lines', 'aura_procurement_purchase_orders',
      'aura_procurement_sourcing_recommendations',
      'aura_procurement_quotation_lines', 'aura_procurement_quotation_revisions',
      'aura_procurement_quotation_offers', 'aura_procurement_quotation_families',
      'aura_procurement_rfqs',
      'aura_procurement_purchase_request_lines', 'aura_procurement_purchase_requests',
      'aura_tendering_boq_items', 'aura_tendering_boqs', 'aura_tendering_tenders',
    ]) {
      await pool.query(`DELETE FROM public.${table} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }
    await pool.end();
  });

  const skipless = (name: string, body: () => Promise<void>) =>
    it(name, async (ctx) => {
      if (!pool) { ctx.skip(); return; }
      await body();
    }, 60_000);

  /** Run a statement expected to be REFUSED, and return the database's reason. */
  const refused = async (sql: string, params: unknown[] = []): Promise<string> => {
    try {
      await pool!.query(sql, params);
    } catch (err) {
      return (err as Error).message;
    }
    throw new Error(`expected the database to refuse:\n${sql}`);
  };

  const newPr = (over: Record<string, unknown>) => {
    const row = { id: newId(), tenant_id: TENANT, title: 'probe', ...over };
    const cols = Object.keys(row);
    return pool!.query(
      `INSERT INTO public.aura_procurement_purchase_requests (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      Object.values(row),
    );
  };

  // ── THE REQUISITION ─────────────────────────────────────────────────────────────────────
  describe('a pricing requisition', () => {
    skipless('is accepted when it names a real tender and basis, and has no project', async () => {
      const r = await pool!.query(`SELECT purpose, project_id FROM public.aura_procurement_purchase_requests WHERE id = $1`, [pricingPr]);
      expect(r.rows[0]).toEqual({ purpose: 'tender_pricing', project_id: null });
    });

    skipless('is refused a project — it prices a bid, it commits no money', async () => {
      expect(await refused(`INSERT INTO public.aura_procurement_purchase_requests (id, tenant_id, title, purpose, source_tender_id, source_basis_revision_id, project_id)
                            VALUES ($1,$2,'p','tender_pricing',$3,$4,'proj-1')`, [newId(), TENANT, tender, BASIS]))
        .toMatch(/aura_pr_tender_pricing_shape/);
    });

    skipless('is refused without a tender or without a basis', async () => {
      expect(await refused(`INSERT INTO public.aura_procurement_purchase_requests (id, tenant_id, title, purpose, source_basis_revision_id)
                            VALUES ($1,$2,'p','tender_pricing',$3)`, [newId(), TENANT, BASIS])).toMatch(/aura_pr_tender_pricing_shape/);
      expect(await refused(`INSERT INTO public.aura_procurement_purchase_requests (id, tenant_id, title, purpose, source_tender_id)
                            VALUES ($1,$2,'p','tender_pricing',$3)`, [newId(), TENANT, tender])).toMatch(/aura_pr_tender_pricing_shape/);
    });

    skipless('is refused when its basis belongs to a DIFFERENT tender', async () => {
      // Both ids are real. They do not belong together, and that is the whole test.
      expect(await refused(`INSERT INTO public.aura_procurement_purchase_requests (id, tenant_id, title, purpose, source_tender_id, source_basis_revision_id)
                            VALUES ($1,$2,'p','tender_pricing',$3,$4)`, [newId(), TENANT, tender, OTHER_BASIS]))
        .toMatch(/belongs to a different tender/);
    });

    skipless('is refused an approval lifecycle — it can only be a draft', async () => {
      for (const status of ['submitted', 'approved']) {
        expect(await refused(`UPDATE public.aura_procurement_purchase_requests SET status = $2 WHERE id = $1`, [pricingPr, status]))
          .toMatch(/can only be a draft/);
      }
      expect(await refused(`INSERT INTO public.aura_procurement_purchase_requests (id, tenant_id, title, purpose, source_tender_id, source_basis_revision_id, status)
                            VALUES ($1,$2,'p','tender_pricing',$3,$4,'approved')`, [newId(), TENANT, tender, BASIS])).toMatch(/can only be a draft/);
    });

    skipless('may not be given a project afterwards', async () => {
      expect(await refused(`UPDATE public.aura_procurement_purchase_requests SET project_id = 'proj-1' WHERE id = $1`, [pricingPr]))
        .toMatch(/aura_pr_tender_pricing_shape/);
    });
  });

  // ── ITS IDENTITY IS IMMUTABLE ───────────────────────────────────────────────────────────
  describe('a requisition never changes what it is for', () => {
    skipless('pricing may not become operational', async () => {
      expect(await refused(`UPDATE public.aura_procurement_purchase_requests SET purpose = 'operational', source_tender_id = NULL, source_basis_revision_id = NULL WHERE id = $1`, [pricingPr]))
        .toMatch(/purpose is immutable/);
    });

    skipless('operational may not become pricing', async () => {
      expect(await refused(`UPDATE public.aura_procurement_purchase_requests SET purpose = 'tender_pricing', source_tender_id = $2, source_basis_revision_id = $3 WHERE id = $1`, [operationalPr, tender, BASIS]))
        .toMatch(/purpose is immutable/);
    });

    skipless('its tender and basis may not be re-pointed', async () => {
      expect(await refused(`UPDATE public.aura_procurement_purchase_requests SET source_tender_id = $2, source_basis_revision_id = $3 WHERE id = $1`, [pricingPr, otherTender, OTHER_BASIS]))
        .toMatch(/purpose is immutable/);
    });

    skipless('an operational requisition may not carry tender references', async () => {
      await expect(newPr({ source_tender_id: tender })).rejects.toThrow(/aura_pr_operational_shape/);
    });
  });

  // ── ITS LINES ───────────────────────────────────────────────────────────────────────────
  describe('a pricing line names its BOQ item and who mapped it', () => {
    const line = (over: Record<string, unknown>) => {
      const row = {
        id: newId(), tenant_id: TENANT, pr_id: pricingPr, line_no: Math.floor(Math.random() * 90000) + 10,
        material_id: material, material_code: 'CAM-4MP', material_name: 'IP camera 4MP', uom: 'no', quantity: 1,
        source_boq_item_id: boqItem, material_mapped_by: 'u-e2e-estimator', material_mapped_at: new Date().toISOString(),
        ...over,
      };
      const cols = Object.keys(row);
      return `INSERT INTO public.aura_procurement_purchase_request_lines (${cols.join(',')}) VALUES (${cols.map((v) => {
        const value = (row as Record<string, unknown>)[v];
        return value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value)}'`;
      }).join(',')})`;
    };

    skipless('is refused without a BOQ item', async () => {
      expect(await refused(line({ source_boq_item_id: null }))).toMatch(/must name its BOQ item/);
    });

    skipless('is refused without a person who confirmed the mapping', async () => {
      expect(await refused(line({ material_mapped_by: null }))).toMatch(/must name its BOQ item and who confirmed/);
      expect(await refused(line({ material_mapped_at: null }))).toMatch(/must name its BOQ item and who confirmed/);
    });

    skipless('is refused a BOQ item from ANOTHER tender', async () => {
      expect(await refused(line({ source_boq_item_id: otherBoqItem }))).toMatch(/belongs to a different tender or BOQ basis/);
    });

    skipless('may not be re-mapped once written — quotations were asked against it', async () => {
      expect(await refused(`UPDATE public.aura_procurement_purchase_request_lines SET source_boq_item_id = $2 WHERE id = $1`, [pricingLine, otherBoqItem]))
        .toMatch(/mapping is immutable/);
      expect(await refused(`UPDATE public.aura_procurement_purchase_request_lines SET material_id = $2 WHERE id = $1`, [pricingLine, newId()]))
        .toMatch(/mapping is immutable/);
    });

    skipless('an OPERATIONAL line needs none of this — the rule is scoped to pricing', async () => {
      const r = await pool!.query(`SELECT source_boq_item_id FROM public.aura_procurement_purchase_request_lines WHERE id = $1`, [operationalLine]);
      expect(r.rows[0].source_boq_item_id).toBeNull();
    });
  });

  // ── NO ORDER, BY ANY DOOR ───────────────────────────────────────────────────────────────
  describe('no purchase order from a pricing source — header door', () => {
    const po = (over: Record<string, unknown>) =>
      pool!.query(
        `INSERT INTO public.aura_procurement_purchase_orders (id, tenant_id, title, pr_id, rfq_id) VALUES ($1,$2,'PO probe',$3,$4)`,
        [newId(), TENANT, over.pr_id ?? null, over.rfq_id ?? null],
      );

    skipless('refuses an order naming the pricing requisition', async () => {
      await expect(po({ pr_id: pricingPr })).rejects.toThrow(/purchase order is not allowed for a tender-pricing requisition/);
    });

    skipless('refuses an order naming the pricing RFQ', async () => {
      await expect(po({ rfq_id: pricingRfq })).rejects.toThrow(/purchase order is not allowed for a tender-pricing requisition/);
    });

    skipless('refuses re-pointing an existing ordinary order at it', async () => {
      const id = newId();
      await pool!.query(`INSERT INTO public.aura_procurement_purchase_orders (id, tenant_id, title) VALUES ($1,$2,'ordinary')`, [id, TENANT]);
      expect(await refused(`UPDATE public.aura_procurement_purchase_orders SET pr_id = $2 WHERE id = $1`, [id, pricingPr]))
        .toMatch(/purchase order is not allowed for a tender-pricing requisition/);
    });

    skipless('CONTROL — an order from the operational requisition is accepted', async () => {
      await expect(po({ pr_id: operationalPr, rfq_id: operationalRfq })).resolves.toBeTruthy();
    });
  });

  describe('no purchase order from a pricing source — LINE door', () => {
    let ordinaryPo = '';
    const lineSql = `INSERT INTO public.aura_procurement_purchase_order_lines
      (id, tenant_id, po_id, line_no, material_id, material_code, material_name, uom, quantity, unit_price, source_type, source_pr_line_id, source_quote_line_id)
      VALUES ($1,$2,$3,$4,$5,'CAM-4MP','IP camera 4MP','no',1,100,'sourced',$6,$7)`;

    beforeAll(async () => {
      if (!pool) return;
      ordinaryPo = newId();
      // AN ORDINARY ORDER — no requisition on its header. The door a header check never sees.
      await pool.query(`INSERT INTO public.aura_procurement_purchase_orders (id, tenant_id, title) VALUES ($1,$2,'ordinary direct order')`, [ordinaryPo, TENANT]);
    });

    skipless('refuses a line naming a pricing REQUISITION line', async () => {
      await expect(pool!.query(lineSql, [newId(), TENANT, ordinaryPo, 1, material, pricingLine, null]))
        .rejects.toThrow(/purchase order line is not allowed for a tender-pricing source/);
    });

    skipless('refuses a line naming a pricing QUOTATION line — even with an operational requisition line beside it', async () => {
      // The requisition line is operational (it satisfies the table's own "sourced needs a chain" rule);
      // the quotation line answers a pricing requisition. Only the quote-line branch can catch this.
      await expect(pool!.query(lineSql, [newId(), TENANT, ordinaryPo, 2, material, operationalLine, pricingQuoteLine]))
        .rejects.toThrow(/purchase order line is not allowed for a tender-pricing source/);
    });

    skipless('refuses re-pointing an existing ordinary line at a pricing source', async () => {
      const id = newId();
      await pool!.query(lineSql, [id, TENANT, ordinaryPo, 3, material, operationalLine, null]);
      expect(await refused(`UPDATE public.aura_procurement_purchase_order_lines SET source_pr_line_id = $2 WHERE id = $1`, [id, pricingLine]))
        .toMatch(/purchase order line is not allowed for a tender-pricing source/);
    });

    skipless('CONTROL — a line from the operational requisition is accepted', async () => {
      await expect(pool!.query(lineSql, [newId(), TENANT, ordinaryPo, 4, material, operationalLine, null])).resolves.toBeTruthy();
    });
  });

  describe('no recommendation on a pricing RFQ — the comparison stays open, the award path does not', () => {
    const rec = (rfq: string) => pool!.query(
      `INSERT INTO public.aura_procurement_sourcing_recommendations (id, tenant_id, rfq_id, comparison_date, comparison_currency)
       VALUES ($1,$2,$3,current_date,'AED')`, [newId(), TENANT, rfq]);

    skipless('refuses a recommendation on the pricing RFQ', async () => {
      await expect(rec(pricingRfq)).rejects.toThrow(/sourcing recommendation is not allowed for a tender-pricing RFQ/);
    });

    skipless('CONTROL — a recommendation on the operational RFQ is accepted', async () => {
      await expect(rec(operationalRfq)).resolves.toBeTruthy();
    });
  });

  // ── FAIL-CLOSED ─────────────────────────────────────────────────────────────────────────
  // ── THE ESTIMATE'S SUPPLY PRICE ───────────────────────────────────────────────────────────
  describe('an estimate source names exactly one lineage, and a governed one completely', () => {
    const newSource = (over: Record<string, unknown>) => {
      const row = {
        id: newId(), tenant_id: TENANT, tender_id: tender, buildup_id: newId(), boq_item_id: boqItem, component_id: newId(),
        supplier_name: 'Supplier A', sourced_unit_cost: 410, previous_unit_cost: 420, ...over,
      };
      const cols = Object.keys(row);
      return pool!.query(
        `INSERT INTO public.aura_tendering_estimate_sources (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
        Object.values(row),
      );
    };
    const governed = () => ({
      quotation_line_id: pricingQuoteLine, quotation_revision_id: newId(), pr_line_id: pricingLine, material_id: material,
      currency: 'AED', technical_verdict: 'compliant', comparison_date: '2026-09-24',
    });

    skipless('accepts a governed line with its whole lineage — revision, requirement, material, currency, verdict, date', async () => {
      await newSource(governed());
    });
    skipless('refuses a source that names a quote header AND a governed line — one figure, two stories', async () => {
      expect(await refused(`INSERT INTO public.aura_tendering_estimate_sources
        (id, tenant_id, tender_id, buildup_id, boq_item_id, component_id, rfq_id, quote_id, supplier_name,
         quotation_line_id, quotation_revision_id, pr_line_id, material_id, currency, technical_verdict, comparison_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Supplier A',$9,$10,$11,$12,'AED','compliant','2026-09-24')`,
      [newId(), TENANT, tender, newId(), boqItem, newId(), pricingRfq, newId(), pricingQuoteLine, newId(), pricingLine, material]))
        .toMatch(/aura_estimate_source_one_lineage/);
    });
    skipless('refuses a source that names NEITHER — a supply price from nowhere', async () => {
      expect(await refused(`INSERT INTO public.aura_tendering_estimate_sources
        (id, tenant_id, tender_id, buildup_id, boq_item_id, component_id, supplier_name) VALUES ($1,$2,$3,$4,$5,$6,'Supplier A')`,
      [newId(), TENANT, tender, newId(), boqItem, newId()])).toMatch(/aura_estimate_source_one_lineage/);
    });
    for (const missing of ['quotation_revision_id', 'pr_line_id', 'material_id', 'currency', 'technical_verdict', 'comparison_date'] as const) {
      skipless(`refuses a governed line without its ${missing} — an incomplete lineage is not a lineage`, async () => {
        const row: Record<string, unknown> = governed();
        delete row[missing];
        let reason = '';
        try { await newSource(row); } catch (err) { reason = (err as Error).message; }
        expect(reason).toMatch(/aura_estimate_source_governed_complete/);
      });
    }
    skipless('CONTROL — a legacy quote-header source is still accepted, unchanged', async () => {
      await newSource({ rfq_id: operationalRfq, quote_id: newId() });
    });
  });

  skipless('the lookups cannot be told "no" by a row-level policy hiding the row', async () => {
    // Switch this session to ANOTHER tenant: the policy now hides every fixture row from `aura_app`.
    const client = await pool!.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [OTHER_TENANT]);
      const hidden = await client.query(`SELECT count(*)::int AS n FROM public.aura_procurement_purchase_requests WHERE id = $1`, [pricingPr]);
      expect(hidden.rows[0].n, 'the policy really does hide the row from this session').toBe(0);
      // …and the boundary still sees it. A check that returned false here would let the trigger pass.
      const seen = await client.query(`SELECT public.aura_is_tender_pricing_pr($1) AS pr, public.aura_is_tender_pricing_pr_line($2) AS line,
                                              public.aura_is_tender_pricing_quote_line($3) AS quote, public.aura_is_tender_pricing_rfq($4) AS rfq`,
        [pricingPr, pricingLine, pricingQuoteLine, pricingRfq]);
      expect(seen.rows[0]).toEqual({ pr: true, line: true, quote: true, rfq: true });
    } finally {
      await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT]);
      client.release();
    }
  });
});
