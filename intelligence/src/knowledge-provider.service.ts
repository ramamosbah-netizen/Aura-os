import { Injectable, Logger } from '@nestjs/common';

export interface KnowledgeProviderSource {
  id: string;
  name: string;
  type: 'pgvector' | 'documents' | 'emails' | 'contracts' | 'specifications' | 'meetings' | 'erp';
  documentCount: number;
  status: 'active' | 'indexing' | 'offline';
}

@Injectable()
export class KnowledgeProviderService {
  private readonly logger = new Logger('KnowledgeProviderService');
  private readonly sources: KnowledgeProviderSource[] = [
    { id: 'src-01', name: 'PostgreSQL pgvector Store', type: 'pgvector', documentCount: 1420, status: 'active' },
    { id: 'src-02', name: 'Contracts & Payment Certs DMS', type: 'contracts', documentCount: 380, status: 'active' },
    { id: 'src-03', name: 'Tender BOQ Specifications', type: 'specifications', documentCount: 510, status: 'active' },
    { id: 'src-04', name: 'AURA ERP Live Data Spine', type: 'erp', documentCount: 18900, status: 'active' },
  ];

  listSources(): KnowledgeProviderSource[] {
    return this.sources;
  }
}
