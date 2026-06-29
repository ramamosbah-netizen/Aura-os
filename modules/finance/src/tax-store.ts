import type { Id } from '@aura/shared';
import type { TaxCode, TaxLine, TaxReturn } from './domain/tax';

export const TAX_CODE_STORE = Symbol('TAX_CODE_STORE');
export const TAX_LINE_STORE = Symbol('TAX_LINE_STORE');
export const TAX_RETURN_STORE = Symbol('TAX_RETURN_STORE');

export interface TaxCodeFilter {
  tenantId?: Id;
  isActive?: boolean;
  taxType?: string;
}

export interface TaxLineFilter {
  invoiceId?: Id;
  taxCodeId?: Id;
  tenantId?: Id;
}

export interface TaxCodeStore {
  create(code: TaxCode): Promise<void>;
  update(code: TaxCode): Promise<void>;
  get(id: Id): Promise<TaxCode | null>;
  getByCode(tenantId: Id, code: string): Promise<TaxCode | null>;
  list(filter?: TaxCodeFilter): Promise<TaxCode[]>;
}

export interface TaxLineStore {
  create(line: TaxLine): Promise<void>;
  list(filter?: TaxLineFilter): Promise<TaxLine[]>;
  deleteByInvoice(invoiceId: Id): Promise<void>;
}

export interface TaxReturnStore {
  create(ret: TaxReturn): Promise<void>;
  update(ret: TaxReturn): Promise<void>;
  get(id: Id): Promise<TaxReturn | null>;
  list(tenantId: Id): Promise<TaxReturn[]>;
}
