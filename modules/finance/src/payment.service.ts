import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Id, makeEvent, newId } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore } from '@aura/core';
import { FINANCE_EVENT } from './domain/invoice';
import { type Payment, type NewPayment, makePayment } from './domain/payment';
import { PAYMENT_STORE, type PaymentFilter, type PaymentStore } from './payment-store';
import { InvoiceService } from './invoice.service';
import { JournalService } from './journal.service';
import { AccountService } from './account.service';

const RECORD_PAYMENT = 'finance.payment.record';

/**
 * Finance payment service. Recording a payment is a multi-step write (payment row → mark
 * invoice paid → post the double-entry journal → emit), so it runs through the kernel
 * `CommandBus` — crucially for **idempotency**: a retried request carrying the same
 * `Idempotency-Key` returns the cached payment instead of creating a SECOND payment and a
 * SECOND ledger journal (the classic double-payment-on-retry bug).
 */
@Injectable()
export class PaymentService implements OnModuleInit {
  private readonly logger = new Logger('FinancePayment');

  constructor(
    @Inject(PAYMENT_STORE) private readonly store: PaymentStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly commands: CommandBus,
    private readonly invoices: InvoiceService,
    private readonly journals: JournalService,
    private readonly accounts: AccountService,
  ) {}

  onModuleInit(): void {
    this.commands.register<NewPayment, Payment>({
      name: RECORD_PAYMENT,
      permission: 'finance.payment.create',
      validate: (input) => {
        if (!input.invoiceId) throw new Error('invoiceId is required');
        if (!(input.amount > 0)) throw new Error('payment amount must be positive');
      },
      handler: (command) => this.doRecord(command.payload, command.actorId ?? undefined),
    });
  }

  /** Record a payment. Pass an idempotencyKey to make the (non-trivial) write safely retryable. */
  record(input: NewPayment, actorId?: Id, idempotencyKey?: string | null): Promise<Payment> {
    return this.commands.execute<Payment>({
      id: newId(),
      name: RECORD_PAYMENT,
      tenantId: input.tenantId,
      companyId: null,
      actorId: actorId ?? null,
      payload: input,
      idempotencyKey: idempotencyKey ?? null,
    });
  }

  private async doRecord(input: NewPayment, actorId?: Id): Promise<Payment> {
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

  listPaged(filter: PaymentFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
