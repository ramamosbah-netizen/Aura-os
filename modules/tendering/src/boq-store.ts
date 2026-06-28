import { type Id } from '@aura/shared';
import { type BOQ, type BOQItem } from './domain/boq';

export const BOQ_STORE = Symbol('BOQ_STORE');

export interface BOQStore {
  saveBOQ(boq: BOQ): Promise<void>;
  findBOQ(tenantId: string, id: Id): Promise<BOQ | null>;
  getBOQByTender(tenantId: string, tenderId: Id): Promise<BOQ | null>;
  saveBOQItem(item: BOQItem): Promise<void>;
  deleteBOQItem(tenantId: string, id: Id): Promise<void>;
  getBOQItems(tenantId: string, boqId: Id): Promise<BOQItem[]>;
  getBOQItem(tenantId: string, id: Id): Promise<BOQItem | null>;
}
