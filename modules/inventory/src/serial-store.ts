import type { Page, PageParams } from '@aura/shared';
import type { SerialUnit } from './domain/serial-unit';

export const SERIAL_STORE = Symbol('SERIAL_STORE');

export interface SerialStore {
  save(unit: SerialUnit): Promise<void>;
  find(id: string, tenantId: string): Promise<SerialUnit | null>;
  list(tenantId: string, filter?: { status?: string; projectId?: string; itemCode?: string }): Promise<SerialUnit[]>;
  listPaged(tenantId: string, page: PageParams, filter?: { status?: string; projectId?: string }): Promise<Page<SerialUnit>>;
}
