import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import { FINANCE_EVENT } from './domain/invoice';
import { type Payment, type NewPayment, makePayment } from './domain/payment';
import { PAYMENT_STORE, type PaymentFilter, type PaymentStore } from './payment-store';
import { InvoiceService } from './invoice.service';
import { JournalService } from './journal.service';
import { AccountService } from './account.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger('FinancePayment');

  constructor(
    @Inject(PAYMENT_STORE) private readonly store: PaymentStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
    private readonly invoices: InvoiceService,
    private readonly journals: JournalService,
    private readonly accounts: AccountService,
  ) {}

  async record(input: NewPayment, actorId?: Id): Promise<Payment> {
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      const target: AccessTarget = { permission: 'finance.payment.create', orgPath };
      this.access.assert(actorId, target);
    }

    // 1. Verify invoice exists
    const invoice = await this.invoices.get(input.invoiceId);
    if (!invoice) throw new Error(`Invoice ${input.invoiceId} not found`);

    // 2. Create the payment
    const payment = makePayment(input);
    await this.store.create(payment);

    // 3. Mark the invoice as paid
    await this.invoices.changeStatus(payment.invoiceId, 'paid');

    // 4. Double-Entry: Resolve accounts
    // Look up or auto-create AP and Bank accounts for this tenant
    let apAccount = await this.accounts.list({ tenantId: payment.tenantId, type: 'liability' })
      .then(list => list.find(a => a.code === '2010') || null);
    if (!apAccount) {
      apAccount = await this.accounts.create({
        tenantId: payment.tenantId,
        code: '2010',
        name: 'Accounts Payable',
        type: 'liability',
      });
    }

    let bankAccount = await this.accounts.get(payment.bankAccountId);
    if (!bankAccount) {
      bankAccount = await this.accounts.list({ tenantId: payment.tenantId, type: 'asset' })
        .then(list => list.find(a => a.code === '1010') || null);
      if (!bankAccount) {
        bankAccount = await this.accounts.create({
          tenantId: payment.tenantId,
          code: '1010',
          name: 'Main Bank Account',
          type: 'asset',
        });
      }
    }

    // Post double entry journal: Debit AP, Credit Cash/Bank
    await this.journals.post({
      tenantId: payment.tenantId,
      reference: payment.id,
      description: `Payment recorded for Invoice ${invoice.reference || invoice.id}`,
      createdBy: actorId,
      lines: [
        {
          accountId: apAccount.id,
          accountCode: apAccount.code,
          accountName: apAccount.name,
          debit: payment.amount,
          credit: 0,
        },
        {
          accountId: bankAccount.id,
          accountCode: bankAccount.code,
          accountName: bankAccount.name,
          debit: 0,
          credit: payment.amount,
        },
      ],
    }, actorId);

    // 5. Emit event
    await this.events.append([
      makeEvent({
        type: FINANCE_EVENT.paymentRecorded,
        tenantId: payment.tenantId,
        companyId: null,
        actorId: actorId ?? null,
        aggregateType: 'finance.payment',
        aggregateId: payment.id,
        payload: {
          invoiceId: payment.invoiceId,
          amount: payment.amount,
          reference: payment.reference,
        },
      }),
    ]);

    this.logger.log(`Payment recorded: ${payment.amount} for Invoice ${payment.invoiceId}`);
    return payment;
  }

  get(id: Id): Promise<Payment | null> {
    return this.store.get(id);
  }

  list(filter?: PaymentFilter): Promise<Payment[]> {
    return this.store.list(filter);
  }
}
