import type { Id, Page, PageParams } from '@aura/shared';
import type { FrameworkAgreement, FrameworkAgreementStatus } from './domain/framework-agreement';

/** DI token for the framework-agreement store. */
export const FRAMEWORK_AGREEMENT_STORE = Symbol('FRAMEWORK_AGREEMENT_STORE');

export interface FrameworkAgreementFilter {
  tenantId?: string;
  supplierId?: string;
  status?: FrameworkAgreementStatus;
  limit?: number;
}

export interface FrameworkAgreementStore {
  save(agreement: FrameworkAgreement): Promise<void>;
  get(id: Id): Promise<FrameworkAgreement | null>;
  list(filter?: FrameworkAgreementFilter): Promise<FrameworkAgreement[]>;
  listPaged(filter: FrameworkAgreementFilter, page: PageParams): Promise<Page<FrameworkAgreement>>;
}
