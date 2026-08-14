import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { type Id, makeEvent, newId, addMoney } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { FINANCE_EVENT } from './domain/invoice';
import { type Payment, type NewPayment, makePayment } from './domain/payment';
import { PAYMENT_STORE, type PaymentFilter, type PaymentStore } from './payment-store';
import { assertSameTenant, sameTenantOrNull } from './domain/tenant-guard';
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
    // Explicit @Inject: a union-typed ctor param emits `Object` and silently injects null.
    // Optional so in-memory tests need no request context.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
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
    // 1. Verify the invoice exists AND belongs to the tenant the payment is booked under.
    //    The payment declares its own tenant (input.tenantId); paying an invoice from another
    //    tenant used to fetch it freely and then, at step 4, flip THAT tenant's invoice to
    //    'paid' — a cross-tenant write. Assert ownership up front; wrong tenant → "not found".
    const invoice = assertSameTenant(await this.invoices.get(input.invoiceId), input.tenantId, 'invoice', input.invoiceId);

    // 2. Create the payment (rejects a non-positive or non-numeric amount)
    const payment = makePayment(input);

    // 3. Cumulative settlement check. An AP invoice carries no `amountPaid` column, so the paid
    //    total is folded from the payments already recorded against it. Two rules follow:
    //
    //    - a payment may not take the invoice past its own value. Nothing stopped paying a
    //      supplier twice for the same invoice, and the second payment posted a second GL entry.
    //    - the invoice becomes `paid` only once it is actually COVERED. It used to be marked paid
    //      on ANY payment of ANY amount — a 100 payment against a 50,000 invoice closed it, and so
    //      did a zero-amount payment back when the amount was silently coerced to 0. Part-payments
    //      are normal for a contractor, so the invoice now stays open until it is settled.
    const priorPayments = await this.store.list({ tenantId: payment.tenantId, invoiceId: payment.invoiceId });
    const alreadyPaid = priorPayments.reduce((sum, p) => sum + p.amount, 0);
    const cumulative = Number(addMoney(alreadyPaid, payment.amount));
    if (cumulative > invoice.value + 0.001) {
      // Phrased "insufficient …" deliberately: the error taxonomy classifies that as a 409
      // state conflict, which is what this is — the invoice's remaining balance forbids the
      // payment. The classifier reads the literal up to the first interpolation, so the
      // classifying word has to lead. Mirrors "insufficient petty cash".
      throw new Error(
        `insufficient invoice balance — payment of ${payment.amount} would take invoice ` +
          `${invoice.reference ?? invoice.id} to ${cumulative}, above its value of ` +
          `${invoice.value} (${alreadyPaid} already paid)`,
      );
    }
    await this.store.create(payment);

    // 4. Close the invoice only when it is fully settled.
    if (cumulative >= invoice.value - 0.001) {
      await this.invoices.changeStatus(payment.invoiceId, 'paid');
    }

    // 5. Double-Entry: Resolve accounts
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

    // A bank account from another tenant is treated as absent, so the journal never posts
    // against a foreign account — we fall through to this tenant's own default bank account.
    let bankAccount = sameTenantOrNull(await this.accounts.get(payment.bankAccountId), payment.tenantId);
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

  async get(id: Id): Promise<Payment | null> {
    // Getter keeps its null contract but will not return another tenant's payment.
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: PaymentFilter): Promise<Payment[]> {
    return this.store.list(filter);
  }

  listPaged(filter: PaymentFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
