import type { Id, Page, PageParams } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { EngineeringDocument, DocType } from './domain/engineering-document';

export interface EngineeringDocumentFilter {
  tenantId?: Id;
  projectId?: Id;
  docType?: DocType;
  status?: EngineeringDocument['status'];
  limit?: number;
}

export interface EngineeringDocumentStore {
  create(doc: EngineeringDocument): Promise<void>;
  createWithClient(tx: TxHandle | null, doc: EngineeringDocument): Promise<void>;
  update(doc: EngineeringDocument): Promise<void>;
  updateWithClient(tx: TxHandle | null, doc: EngineeringDocument): Promise<void>;
  get(id: Id): Promise<EngineeringDocument | null>;
  list(filter?: EngineeringDocumentFilter): Promise<EngineeringDocument[]>;
  listPaged(filter: EngineeringDocumentFilter, page: PageParams): Promise<Page<EngineeringDocument>>;
}

export const ENGINEERING_DOCUMENT_STORE = Symbol('EngineeringDocumentStore');
