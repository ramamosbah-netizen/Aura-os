import type { Id, Page, PageParams } from '@aura/shared';
import type { Supplier, SupplierStatus, SupplierCategory } from './domain/supplier';

export const SUPPLIER_STORE = Symbol('SUPPLIER_STORE');

export interface SupplierFilter {
  tenantId?: string;
  status?: SupplierStatus;
  category?: SupplierCategory;
  limit?: number;
}

export interface SupplierStore {
  create(supplier: Supplier): Promise<void>;
  update(supplier: Supplier): Promise<void>;
  get(id: Id): Promise<Supplier | null>;
  getByCode(tenantId: Id, code: string): Promise<Supplier | null>;
  list(filter?: SupplierFilter): Promise<Supplier[]>;
  listPaged(filter: SupplierFilter, page: PageParams): Promise<Page<Supplier>>;
}
