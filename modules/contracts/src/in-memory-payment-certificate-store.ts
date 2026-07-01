import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { PaymentCertificate } from './domain/payment-certificate';
import type { CertificateFilter, PaymentCertificateStore } from './payment-certificate-store';

/** Phase-0 payment-certificate store — keeps IPCs in memory (no-DB boots). */
export class InMemoryPaymentCertificateStore implements PaymentCertificateStore {
  private readonly rows = new Map<string, PaymentCertificate>();

  async create(cert: PaymentCertificate): Promise<void> {
    this.rows.set(cert.id, { ...cert });
  }

  async createWithClient(_tx: TxHandle | null, cert: PaymentCertificate): Promise<void> {
    return this.create(cert);
  }

  async update(cert: PaymentCertificate): Promise<void> {
    this.rows.set(cert.id, { ...cert });
  }

  async updateWithClient(_tx: TxHandle | null, cert: PaymentCertificate): Promise<void> {
    return this.update(cert);
  }

  async get(id: Id): Promise<PaymentCertificate | null> {
    const c = this.rows.get(id);
    return c ? { ...c } : null;
  }

  async list(filter: CertificateFilter = {}): Promise<PaymentCertificate[]> {
    let out = [...this.rows.values()];
    if (filter.tenantId) out = out.filter((c) => c.tenantId === filter.tenantId);
    if (filter.contractId) out = out.filter((c) => c.contractId === filter.contractId);
    if (filter.status) out = out.filter((c) => c.status === filter.status);
    out.sort((a, b) => (a.sequence < b.sequence ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: CertificateFilter, page: PageParams): Promise<Page<PaymentCertificate>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
