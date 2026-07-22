import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { MarketItem, MarketItemCategory } from './domain/market-item';
import type { MarketItemFilter, MarketItemStore } from './market-item-store';

interface Row {
  id: string;
  tenant_id: string;
  name: string;
  brand: string | null;
  category: string;
  unit: string;
  benchmark_cost: string | number;
  benchmark_sell: string | number;
  install_hours: string | number;
  source: string | null;
  as_of: string;
  notes: string | null;
  sku: string | null;
  manufacturer: string | null;
  model: string | null;
  country_of_origin: string | null;
  min_price: string | number | null;
  max_price: string | number | null;
  avg_price: string | number | null;
  lead_time_days: number | null;
  warranty_months: number | null;
  crew_size: number | null;
  alternative_ids: string[] | string | null;
  datasheet_url: string | null;
  image_url: string | null;
  confidence: number | string | null;
  created_at: Date | string;
  created_by: string | null;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());
const num = (v: string | number): number => Number(v);
const numN = (v: string | number | null): number | null => (v == null ? null : Number(v));

function rowTo(r: Row): MarketItem {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    brand: r.brand,
    category: r.category as MarketItemCategory,
    unit: r.unit,
    benchmarkCost: num(r.benchmark_cost),
    benchmarkSell: num(r.benchmark_sell),
    installHours: num(r.install_hours),
    source: r.source,
    asOf: String(r.as_of).slice(0, 10),
    notes: r.notes,
    sku: r.sku,
    manufacturer: r.manufacturer,
    model: r.model,
    countryOfOrigin: r.country_of_origin,
    minPrice: numN(r.min_price),
    maxPrice: numN(r.max_price),
    avgPrice: numN(r.avg_price),
    leadTimeDays: numN(r.lead_time_days),
    warrantyMonths: numN(r.warranty_months),
    crewSize: numN(r.crew_size),
    alternativeIds: r.alternative_ids == null ? []
      : (typeof r.alternative_ids === 'string' ? (JSON.parse(r.alternative_ids) as string[]) : r.alternative_ids),
    datasheetUrl: r.datasheet_url,
    imageUrl: r.image_url,
    confidence: r.confidence == null ? 60 : Number(r.confidence),
    createdAt: iso(r.created_at),
    createdBy: r.created_by,
  };
}

const COLS =
  'id, tenant_id, name, brand, category, unit, benchmark_cost, benchmark_sell, install_hours, source, as_of::text AS as_of, notes, ' +
  'sku, manufacturer, model, country_of_origin, min_price, max_price, avg_price, lead_time_days, warranty_months, crew_size, alternative_ids, datasheet_url, image_url, confidence, ' +
  'created_at, created_by';

export class PostgresMarketItemStore implements MarketItemStore {
  constructor(private readonly pool: Pool) {}

  async save(m: MarketItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_market_items
        (id, tenant_id, name, brand, category, unit, benchmark_cost, benchmark_sell, install_hours, source, as_of, notes,
         sku, manufacturer, model, country_of_origin, min_price, max_price, avg_price, lead_time_days, warranty_months, crew_size, alternative_ids, datasheet_url, image_url, confidence,
         created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, brand = EXCLUDED.brand, category = EXCLUDED.category, unit = EXCLUDED.unit,
         benchmark_cost = EXCLUDED.benchmark_cost, benchmark_sell = EXCLUDED.benchmark_sell,
         install_hours = EXCLUDED.install_hours, source = EXCLUDED.source, as_of = EXCLUDED.as_of, notes = EXCLUDED.notes,
         sku = EXCLUDED.sku, manufacturer = EXCLUDED.manufacturer, model = EXCLUDED.model, country_of_origin = EXCLUDED.country_of_origin,
         min_price = EXCLUDED.min_price, max_price = EXCLUDED.max_price, avg_price = EXCLUDED.avg_price,
         lead_time_days = EXCLUDED.lead_time_days, warranty_months = EXCLUDED.warranty_months, crew_size = EXCLUDED.crew_size,
         alternative_ids = EXCLUDED.alternative_ids, datasheet_url = EXCLUDED.datasheet_url, image_url = EXCLUDED.image_url, confidence = EXCLUDED.confidence`,
      [m.id, m.tenantId, m.name, m.brand, m.category, m.unit, m.benchmarkCost, m.benchmarkSell,
       m.installHours, m.source, m.asOf, m.notes,
       m.sku, m.manufacturer, m.model, m.countryOfOrigin, m.minPrice, m.maxPrice, m.avgPrice,
       m.leadTimeDays, m.warrantyMonths, m.crewSize, JSON.stringify(m.alternativeIds ?? []), m.datasheetUrl, m.imageUrl, m.confidence,
       m.createdAt, m.createdBy],
    );
  }

  async list(filter: MarketItemFilter): Promise<MarketItem[]> {
    const params: unknown[] = [filter.tenantId];
    let sql = `SELECT ${COLS} FROM public.aura_crm_market_items WHERE tenant_id = $1`;
    if (filter.q?.trim()) {
      params.push(`%${filter.q.trim()}%`);
      sql += ` AND (name ILIKE $${params.length} OR coalesce(brand,'') ILIKE $${params.length})`;
    }
    if (filter.category) {
      params.push(filter.category);
      sql += ` AND category = $${params.length}`;
    }
    params.push(filter.limit ?? 50);
    sql += ` ORDER BY name ASC LIMIT $${params.length}`;
    const res = await this.pool.query<Row>(sql, params);
    return res.rows.map(rowTo);
  }

  async get(id: Id): Promise<MarketItem | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_market_items WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async remove(id: Id): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM public.aura_crm_market_items WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async count(tenantId: Id): Promise<number> {
    const res = await this.pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM public.aura_crm_market_items WHERE tenant_id = $1', [tenantId],
    );
    return Number(res.rows[0]?.n ?? 0);
  }
}
