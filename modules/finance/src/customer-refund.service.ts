import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type Id, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import {
  CUSTOMER_REFUND_EVENT,
  type CustomerRefund,
  type NewCustomerRefund,
  makeCustomerRefund,
  payRefund,
  cancelRefund,
} from './domain/customer-refund';
import { CUSTOMER_REFUND_STORE, type CustomerRefundFilter, type CustomerRefundStore } from './customer-refund-store';
import { assertSameTenant, sameTenantOrNull } from './domain/tenant-guard';

/**
 * Customer-refund service — owns `aura_finance_customer_refunds`, emits `finance.customer_refund.*`.
 * Paying a refund posts the GL entry (Dr AR / Cr Bank) via the `finance.customer_refund.paid` reactor.
 */
@Injectable()
export class CustomerRefundService {
  private readonly logger = new Logger('CustomerRefund');

  constructor(
    @Inject(CUSTOMER_REFUND_STORE) private readonly store: CustomerRefundStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  async create(input: NewCustomerRefund): Promise<CustomerRefund> {
    const refund = makeCustomerRefund(input);
    if (await this.store.existsByNumber(refund.tenantId, refund.refundNumber)) {
      throw new Error(`refund number ${refund.refundNumber} already exists`);
    }
    await this.store.save(refund);
    await this.events.append([
      makeEvent({
        type: CUSTOMER_REFUND_EVENT.created,
        tenantId: refund.tenantId, companyId: refund.companyId, actorId: refund.createdBy,
        aggregateType: 'finance.customer_refund', aggregateId: refund.id,
        payload: { refundNumber: refund.refundNumber, customerName: refund.customerName, amount: refund.amount },
      }),
    ]);
    this.logger.log(`Customer refund ${refund.refundNumber} drafted for ${refund.customerName}: ${refund.amount}`);
    return refund;
  }

  async pay(id: Id): Promise<CustomerRefund> {
    const refund = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'customer refund', id);
    const updated = payRefund(refund); // draft → paid (throws otherwise)
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CUSTOMER_REFUND_EVENT.paid,
        tenantId: refund.tenantId, companyId: refund.companyId, actorId: null,
        aggregateType: 'finance.customer_refund', aggregateId: id,
        // amount/currency let the GL reactor post Dr AR / Cr Bank in base currency.
        payload: { refundNumber: refund.refundNumber, customerName: refund.customerName, amount: refund.amount, currency: refund.currency },
      }),
    ]);
    this.logger.log(`Customer refund ${refund.refundNumber} paid: ${refund.amount}`);
    return updated;
  }

  async cancel(id: Id): Promise<CustomerRefund> {
    const refund = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'customer refund', id);
    const updated = cancelRefund(refund); // draft → cancelled (throws if paid)
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CUSTOMER_REFUND_EVENT.cancelled,
        tenantId: refund.tenantId, companyId: refund.companyId, actorId: null,
        aggregateType: 'finance.customer_refund', aggregateId: id,
        payload: { refundNumber: refund.refundNumber },
      }),
    ]);
    return updated;
  }

  async get(id: Id): Promise<CustomerRefund | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: CustomerRefundFilter): Promise<CustomerRefund[]> {
    return this.store.list(filter);
  }

  listPaged(filter: CustomerRefundFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }
}
