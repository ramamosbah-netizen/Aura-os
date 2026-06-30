import type { Id } from '@aura/shared';
import type { ProfitCenter } from './domain/profit-center';

export const PROFIT_CENTER_STORE = Symbol('PROFIT_CENTER_STORE');

export interface ProfitCenterStore {
  save(pc: ProfitCenter): Promise<void>;
  get(id: Id): Promise<ProfitCenter | null>;
  list(tenantId: string): Promise<ProfitCenter[]>;
}
