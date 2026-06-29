import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore, PG_POOL } from '@aura/core';
import type { Pool } from 'pg';

/**
 * A single historical pricing observation (from a PO, quote, or subcontract).
 * The calibrator consumes these to derive trust-weighted calibrated rates.
 */
export interface PricingSource {
  id: string;
  tenantId: string;
  itemCode: string;
  description: string | null;
  sourceType: 'po' | 'quote' | 'subcontract' | 'manual';
  unitPrice: number;
  currency: string;
  quantity: number;
  supplierId: string | null;
  projectId: string | null;
  observedAt: Date;
}

/**
 * The output of the IEC 4-layer calibration algorithm for one catalog item.
 */
export interface PricingCalibration {
  id: string;
  tenantId: string;
  itemCode: string;
  description: string | null;
  calibratedPrice: number;
  realityGap: number;
  sourceCount: number;
  avgTrustScore: number;
  currency: string;
  calibratedAt: Date;
}

/** Trust-decay half-life constant (λ). Sources older than ~180 days carry <50% weight. */
const DECAY_LAMBDA = 0.00385; // ≈ ln(2)/180

/** Source-type weight map — actuals (POs) are ground-truth, quotes carry less certainty. */
const SOURCE_WEIGHT: Record<string, number> = {
  po: 1.0,
  subcontract: 0.9,
  manual: 0.75,
  quote: 0.6,
};

export const PRICING_CALIBRATED_EVENT = 'intelligence.pricing.calibrated';

/**
 * IEC Pricing Engine — the 4-layer closed-loop calibrator.
 *
 * Layer 1: Source Weighting — different evidence types carry different trust levels.
 * Layer 2: Trust Decay — older observations decay exponentially, favouring recent data.
 * Layer 3: Reality Gap — compute the % divergence between calibrated price and estimate.
 * Layer 4: Anomaly Containment — outliers beyond 2σ are soft-capped to dampen noise.
 *
 * The engine is a pure consumer — it reads pricing observations and writes calibrations.
 * It never touches another module's tables directly.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger('Intelligence:Pricing');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  /** Record a new pricing observation from a PO, quote, or subcontract. */
  async recordSource(tenantId: string, source: Omit<PricingSource, 'id' | 'tenantId' | 'observedAt'>): Promise<PricingSource> {
    const res = await this.pool.query(
      `INSERT INTO public.aura_pricing_sources
         (tenant_id, item_code, description, source_type, unit_price, currency, quantity, supplier_id, project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [tenantId, source.itemCode, source.description, source.sourceType, source.unitPrice, source.currency, source.quantity, source.supplierId, source.projectId],
    );
    return mapSource(res.rows[0]);
  }

  /** List all pricing sources for a tenant, optionally filtered by item_code. */
  async listSources(tenantId: string, itemCode?: string): Promise<PricingSource[]> {
    const sql = itemCode
      ? 'SELECT * FROM public.aura_pricing_sources WHERE tenant_id = $1 AND item_code = $2 ORDER BY observed_at DESC'
      : 'SELECT * FROM public.aura_pricing_sources WHERE tenant_id = $1 ORDER BY observed_at DESC';
    const params = itemCode ? [tenantId, itemCode] : [tenantId];
    const res = await this.pool.query(sql, params);
    return res.rows.map(mapSource);
  }

  /** Retrieve all current calibrations for a tenant. */
  async listCalibrations(tenantId: string): Promise<PricingCalibration[]> {
    const res = await this.pool.query(
      'SELECT * FROM public.aura_pricing_calibrations WHERE tenant_id = $1 ORDER BY calibrated_at DESC',
      [tenantId],
    );
    return res.rows.map(mapCalibration);
  }

  /**
   * Run the 4-layer IEC calibration for all items with pricing sources in this tenant.
   * Returns the number of items calibrated.
   */
  async calibrate(tenantId: string, actorId: Id | null = null): Promise<{ calibrated: number; items: PricingCalibration[] }> {
    // Step 1: Fetch all sources for this tenant.
    const sourcesRes = await this.pool.query(
      'SELECT * FROM public.aura_pricing_sources WHERE tenant_id = $1 ORDER BY item_code, observed_at DESC',
      [tenantId],
    );
    const sources = sourcesRes.rows.map(mapSource);

    // Group by item_code.
    const byItem = new Map<string, PricingSource[]>();
    for (const s of sources) {
      const list = byItem.get(s.itemCode) ?? [];
      list.push(s);
      byItem.set(s.itemCode, list);
    }

    const calibrated: PricingCalibration[] = [];
    const now = Date.now();

    for (const [itemCode, itemSources] of byItem) {
      // Layer 1 + 2: Compute trust-weighted average price.
      let weightedSum = 0;
      let totalWeight = 0;

      for (const s of itemSources) {
        const ageMs = now - s.observedAt.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);

        // Layer 1: Source type weight
        const typeWeight = SOURCE_WEIGHT[s.sourceType] ?? 0.5;

        // Layer 2: Exponential trust decay
        const decay = Math.exp(-DECAY_LAMBDA * ageDays);

        const w = typeWeight * decay;
        weightedSum += s.unitPrice * w;
        totalWeight += w;
      }

      if (totalWeight === 0) continue;

      let calibratedPrice = weightedSum / totalWeight;
      const avgTrust = totalWeight / itemSources.length;

      // Layer 4: Anomaly containment — soft-cap outliers beyond 2σ.
      if (itemSources.length >= 3) {
        const mean = itemSources.reduce((s, x) => s + x.unitPrice, 0) / itemSources.length;
        const variance = itemSources.reduce((s, x) => s + (x.unitPrice - mean) ** 2, 0) / itemSources.length;
        const sigma = Math.sqrt(variance);
        const lowerBound = mean - 2 * sigma;
        const upperBound = mean + 2 * sigma;
        calibratedPrice = Math.max(lowerBound, Math.min(upperBound, calibratedPrice));
      }

      // Layer 3: Reality gap — the % difference between calibrated and the simple average.
      const simpleAvg = itemSources.reduce((s, x) => s + x.unitPrice, 0) / itemSources.length;
      const realityGap = simpleAvg > 0 ? ((calibratedPrice - simpleAvg) / simpleAvg) * 100 : 0;

      // Upsert calibration result.
      const desc = itemSources[0]?.description ?? null;
      const currency = itemSources[0]?.currency ?? 'AED';
      const res = await this.pool.query(
        `INSERT INTO public.aura_pricing_calibrations
           (tenant_id, item_code, description, calibrated_price, reality_gap, source_count, avg_trust_score, currency, calibrated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (tenant_id, item_code) DO UPDATE SET
           description = EXCLUDED.description,
           calibrated_price = EXCLUDED.calibrated_price,
           reality_gap = EXCLUDED.reality_gap,
           source_count = EXCLUDED.source_count,
           avg_trust_score = EXCLUDED.avg_trust_score,
           calibrated_at = now()
         RETURNING *`,
        [tenantId, itemCode, desc, calibratedPrice, realityGap, itemSources.length, avgTrust, currency],
      );
      calibrated.push(mapCalibration(res.rows[0]));
    }

    // Emit event onto the spine.
    if (calibrated.length > 0) {
      await this.events.append([
        makeEvent({
          type: PRICING_CALIBRATED_EVENT,
          tenantId,
          actorId,
          aggregateType: 'intelligence.pricing',
          aggregateId: tenantId,
          payload: { itemsCalibrated: calibrated.length },
        }),
      ]);
    }

    this.logger.log(`Calibrated ${calibrated.length} item(s) for tenant ${tenantId}.`);
    return { calibrated: calibrated.length, items: calibrated };
  }
}

// ── Row mappers ──────────────────────────────────────────────────────────────

function mapSource(r: any): PricingSource {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    itemCode: r.item_code,
    description: r.description,
    sourceType: r.source_type,
    unitPrice: Number(r.unit_price),
    currency: r.currency,
    quantity: Number(r.quantity),
    supplierId: r.supplier_id,
    projectId: r.project_id,
    observedAt: new Date(r.observed_at),
  };
}

function mapCalibration(r: any): PricingCalibration {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    itemCode: r.item_code,
    description: r.description,
    calibratedPrice: Number(r.calibrated_price),
    realityGap: Number(r.reality_gap),
    sourceCount: r.source_count,
    avgTrustScore: Number(r.avg_trust_score),
    currency: r.currency,
    calibratedAt: new Date(r.calibrated_at),
  };
}

/**
 * Pure function: compute trust-decay weight for a single source.
 * Exported for unit testing.
 */
export function computeDecay(ageDays: number): number {
  return Math.exp(-DECAY_LAMBDA * ageDays);
}

/**
 * Pure function: compute source-type weight.
 * Exported for unit testing.
 */
export function sourceWeight(type: string): number {
  return SOURCE_WEIGHT[type] ?? 0.5;
}
