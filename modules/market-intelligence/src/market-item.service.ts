import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Id } from '@aura/shared';
import { type MarketItem, type NewMarketItem, makeMarketItem } from './domain/market-item';
import { MARKET_ITEM_STORE, type MarketItemFilter, type MarketItemStore } from './market-item-store';

/** A small, real ELV starter catalogue — so the library works the moment the module is switched on
 *  rather than showing an empty box. Benchmarks are indicative UAE market figures, dated, editable. */
const STARTER_CATALOGUE: ReadonlyArray<Omit<NewMarketItem, 'tenantId'>> = [
  { name: '2MP IP Bullet Camera', brand: 'Hikvision', category: 'CCTV', unit: 'each', benchmarkCost: 320, benchmarkSell: 520, installHours: 2, source: 'distributor offer', asOf: '2026-06-01' },
  { name: '4MP IP Dome Camera', brand: 'Hikvision', category: 'CCTV', unit: 'each', benchmarkCost: 480, benchmarkSell: 780, installHours: 2, source: 'distributor offer', asOf: '2026-06-01' },
  { name: '16ch NVR (8TB)', brand: 'Hikvision', category: 'CCTV', unit: 'each', benchmarkCost: 2400, benchmarkSell: 3600, installHours: 4, source: 'distributor offer', asOf: '2026-06-01' },
  { name: 'Card Reader (Mifare)', brand: 'Honeywell', category: 'ACCESS_CONTROL', unit: 'each', benchmarkCost: 260, benchmarkSell: 460, installHours: 2.5, source: 'market survey', asOf: '2026-05-15' },
  { name: 'Single-door Controller', brand: 'Honeywell', category: 'ACCESS_CONTROL', unit: 'each', benchmarkCost: 700, benchmarkSell: 1150, installHours: 3, source: 'market survey', asOf: '2026-05-15' },
  { name: 'Electromagnetic Lock 600lb', brand: null, category: 'ACCESS_CONTROL', unit: 'each', benchmarkCost: 180, benchmarkSell: 320, installHours: 1.5, source: 'market survey', asOf: '2026-05-15' },
  { name: 'Addressable Smoke Detector', brand: 'Notifier', category: 'FIRE_ALARM', unit: 'each', benchmarkCost: 150, benchmarkSell: 280, installHours: 1, source: 'won tender 2026', asOf: '2026-04-20' },
  { name: 'Manual Call Point', brand: 'Notifier', category: 'FIRE_ALARM', unit: 'each', benchmarkCost: 90, benchmarkSell: 170, installHours: 0.75, source: 'won tender 2026', asOf: '2026-04-20' },
  { name: 'Fire Alarm Control Panel (2-loop)', brand: 'Notifier', category: 'FIRE_ALARM', unit: 'each', benchmarkCost: 3800, benchmarkSell: 5800, installHours: 8, source: 'won tender 2026', asOf: '2026-04-20' },
  { name: 'Ceiling Speaker 6W', brand: 'Bosch', category: 'PA_VA', unit: 'each', benchmarkCost: 110, benchmarkSell: 210, installHours: 1, source: 'distributor offer', asOf: '2026-06-10' },
  { name: '24-port Gigabit PoE Switch', brand: 'Cisco', category: 'NETWORK', unit: 'each', benchmarkCost: 1600, benchmarkSell: 2500, installHours: 2, source: 'distributor offer', asOf: '2026-06-10' },
  { name: 'Cat6 UTP Cable', brand: null, category: 'STRUCTURED_CABLING', unit: 'm', benchmarkCost: 2.2, benchmarkSell: 4.5, installHours: 0.05, source: 'market survey', asOf: '2026-05-01' },
  { name: 'Cat6 Faceplate + Module', brand: null, category: 'STRUCTURED_CABLING', unit: 'point', benchmarkCost: 28, benchmarkSell: 65, installHours: 0.5, source: 'market survey', asOf: '2026-05-01' },
  { name: 'IP Video Door Station', brand: 'Hikvision', category: 'INTERCOM', unit: 'each', benchmarkCost: 620, benchmarkSell: 1050, installHours: 2.5, source: 'distributor offer', asOf: '2026-06-01' },
];

@Injectable()
export class MarketItemService {
  private readonly logger = new Logger(MarketItemService.name);

  constructor(@Inject(MARKET_ITEM_STORE) private readonly store: MarketItemStore) {}

  create(input: NewMarketItem): Promise<MarketItem> {
    const item = makeMarketItem(input);
    return this.store.save(item).then(() => item);
  }

  list(filter: MarketItemFilter): Promise<MarketItem[]> {
    return this.store.list(filter);
  }

  get(id: Id): Promise<MarketItem | null> {
    return this.store.get(id);
  }

  remove(id: Id): Promise<boolean> {
    return this.store.remove(id);
  }

  /**
   * Seed the starter catalogue — idempotent by count, so re-running never duplicates. Returns how
   * many were added (0 when the tenant already has items, so a re-seed is a no-op, not a reset).
   */
  async seed(tenantId: Id, createdBy: Id | null = null): Promise<number> {
    if ((await this.store.count(tenantId)) > 0) return 0;
    for (const spec of STARTER_CATALOGUE) {
      await this.store.save(makeMarketItem({ ...spec, tenantId, createdBy }));
    }
    this.logger.log(`Seeded ${STARTER_CATALOGUE.length} market items for ${tenantId}`);
    return STARTER_CATALOGUE.length;
  }
}
