import { Controller, Get, Query } from '@nestjs/common';
import { MarketItemService, type MarketItem } from '@aura/market-intelligence';
import { QuotationService } from '@aura/crm';
import { RfqService } from '@aura/procurement';
import { StockService } from '@aura/inventory';
import { TenantContext } from '@aura/core';

/**
 * Product Knowledge — Market Intelligence as the SINGLE SOURCE. One question, one answer:
 * "what do we know about this item?" gathers the product (with productivity + alternatives),
 * what we quoted it for before, what suppliers offered, and what is on the shelf — composed
 * here in the API host, because this is the one place that may know every module. Consumers
 * (the picker, the workspace Intelligence pane) read THIS, never stitch sources themselves.
 *
 * Honest by construction: each block is real data from its owning module, and an empty block
 * means "we genuinely have nothing", not "we didn't look".
 */
@Controller('market-intelligence')
export class ProductKnowledgeController {
  constructor(
    private readonly items: MarketItemService,
    private readonly quotations: QuotationService,
    private readonly rfqs: RfqService,
    private readonly stock: StockService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('knowledge')
  async knowledge(@Query('q') q?: string): Promise<{
    products: Array<MarketItem & { alternatives: Array<{ id: string; name: string }> }>;
    history: Awaited<ReturnType<QuotationService['priceHistory']>>;
    suppliers: Array<{ supplier: string; amount: number; rfq: string; status: string }>;
    inventory: Array<{ name: string; quantityOnHand: number; avgCost: number }>;
  }> {
    const tenantId = this.tenant.get().tenantId;
    const needle = (q ?? '').trim();
    if (needle.length < 2) return { products: [], history: [], suppliers: [], inventory: [] };

    const [rawProducts, history, rfqList, stockItems] = await Promise.all([
      this.items.list({ tenantId, q: needle, limit: 3 }),
      this.quotations.priceHistory(tenantId, needle),
      this.rfqs.list({ tenantId, limit: 200 }),
      this.stock.listItems({ tenantId, limit: 200 }),
    ]);

    // Alternatives resolved to names — an id nobody can read is not knowledge.
    const products = await Promise.all(rawProducts.map(async (p) => ({
      ...p,
      alternatives: (await Promise.all(
        (p.alternativeIds ?? []).slice(0, 4).map(async (id) => {
          const alt = await this.items.get(id);
          return alt ? { id: alt.id, name: alt.name } : null;
        }),
      )).filter((a): a is { id: string; name: string } => a !== null),
    })));

    // Supplier offers: quotes received on RFQs whose title mentions the item. Vendor prices live
    // on RFQs (that is where the market answers), so that is where this block reads from.
    const lower = needle.toLowerCase();
    const matchingRfqs = rfqList.filter((r) => r.title.toLowerCase().includes(lower)).slice(0, 5);
    const suppliers: Array<{ supplier: string; amount: number; rfq: string; status: string }> = [];
    for (const r of matchingRfqs) {
      const full = await this.rfqs.getWithQuotes(r.id);
      for (const quote of full?.quotes ?? []) {
        if (quote.status === 'rejected') continue;
        suppliers.push({ supplier: quote.supplierName, amount: Number(quote.amount), rfq: r.title, status: quote.status });
      }
    }
    suppliers.sort((a, b) => a.amount - b.amount);

    const inventory = stockItems
      .filter((s) => s.name.toLowerCase().includes(lower))
      .slice(0, 3)
      .map((s) => ({ name: s.name, quantityOnHand: s.quantityOnHand, avgCost: s.avgCost }));

    return { products, history: history.slice(0, 4), suppliers: suppliers.slice(0, 4), inventory };
  }
}
