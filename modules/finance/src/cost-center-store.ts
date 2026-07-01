import type { Id } from '@aura/shared';
import type { CostCenter } from './domain/cost-center';

export const COST_CENTER_STORE = Symbol('COST_CENTER_STORE');

export interface CostCenterStore {
  save(cc: CostCenter): Promise<void>;
  get(id: Id): Promise<CostCenter | null>;
  list(tenantId: string): Promise<CostCenter[]>;
}
