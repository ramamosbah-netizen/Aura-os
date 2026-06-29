import type { Id } from '@aura/shared';
import type { Payment } from './domain/payment';
import type { PaymentFilter, PaymentStore } from './payment-store';

export class InMemoryPaymentStore implements PaymentStore {
  private readonly payments = new Map<string, Payment>();

  async create(payment: Payment): Promise<void> {
    this.payments.set(payment.id, { ...payment });
  }

  async get(id: Id): Promise<Payment | null> {
    const p = this.payments.get(id);
    return p ? { ...p } : null;
  }

  async list(filter: PaymentFilter = {}): Promise<Payment[]> {
    let out = [...this.payments.values()];
    if (filter.tenantId) out = out.filter((p) => p.tenantId === filter.tenantId);
    if (filter.invoiceId) out = out.filter((p) => p.invoiceId === filter.invoiceId);
    out.sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
