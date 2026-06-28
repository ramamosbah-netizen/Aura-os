import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type Invoice,
  type InvoiceStatus,
  InvoiceService,
  type Account,
  type AccountType,
  AccountService,
  type Journal,
  JournalService,
  type Payment,
  PaymentService,
  type BankTransaction,
  type BankTransactionStatus,
  BankReconciliationService,
  type TaxCode,
  type TaxLine,
  TaxService,
  type TaxSummary,
} from '@aura/finance';

interface CreateInvoiceDto {
  title: string;
  reference?: string;
  poId?: string | null;
  poTitle?: string | null;
  supplierName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  status?: InvoiceStatus;
  value?: number;
}

interface CreateAccountDto {
  code: string;
  name: string;
  type: AccountType;
  parentId?: string | null;
}

interface CreateJournalLineDto {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

interface CreateJournalDto {
  description: string;
  reference?: string | null;
  lines: CreateJournalLineDto[];
}

interface CreatePaymentDto {
  invoiceId: string;
  bankAccountId: string;
  amount: number;
  reference?: string | null;
}

interface ImportBankTransactionsDto {
  bankAccountId: string;
  transactions: Array<{
    transactionDate: string;
    amount: number;
    description: string;
    reference?: string | null;
  }>;
}

@Controller('finance')
export class FinanceController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly accounts: AccountService,
    private readonly journals: JournalService,
    private readonly payments: PaymentService,
    private readonly reconciliation: BankReconciliationService,
    private readonly tax: TaxService,
    private readonly tenant: TenantContext,
  ) {}

  // ── INVOICES ─────────────────────────────────────────────────────────────

  @Post('invoices')
  createInvoice(@Body() dto: CreateInvoiceDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<Invoice> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.invoices.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      poId: dto.poId ?? null,
      poTitle: dto.poTitle ?? null,
      supplierName: dto.supplierName ?? null,
      projectId: dto.projectId ?? null,
      projectName: dto.projectName ?? null,
      status: dto.status,
      value: dto.value,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    }, idempotencyKey);
  }

  @Get('invoices')
  listInvoices(
    @Query('status') status?: string,
    @Query('poId') poId?: string,
    @Query('projectId') projectId?: string,
  ): Promise<Invoice[]> {
    return this.invoices.list({ status, poId, projectId, limit: 100 });
  }

  @Get('invoices/:id')
  async getInvoice(@Param('id') id: string): Promise<Invoice> {
    const found = await this.invoices.get(id);
    if (!found) throw new NotFoundException(`invoice ${id} not found`);
    return found;
  }

  @Patch('invoices/:id/status')
  async changeInvoiceStatus(
    @Param('id') id: string,
    @Body() dto: { status: InvoiceStatus },
  ): Promise<Invoice> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const found = await this.invoices.get(id);
    if (!found) throw new NotFoundException(`invoice ${id} not found`);
    return this.invoices.changeStatus(id, dto.status);
  }

  // ── CHART OF ACCOUNTS ───────────────────────────────────────────────────

  @Post('accounts')
  createAccount(@Body() dto: CreateAccountDto): Promise<Account> {
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    if (!dto?.type) throw new BadRequestException('type is required');
    const ctx = this.tenant.get();
    return this.accounts.create(
      {
        tenantId: ctx.tenantId,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId,
      },
      ctx.actorId ?? undefined,
    );
  }

  @Get('accounts')
  listAccounts(@Query('type') type?: string): Promise<Account[]> {
    const ctx = this.tenant.get();
    return this.accounts.list({ tenantId: ctx.tenantId, type });
  }

  @Get('accounts/:id')
  async getAccount(@Param('id') id: string): Promise<Account> {
    const found = await this.accounts.get(id);
    if (!found) throw new NotFoundException(`account ${id} not found`);
    return found;
  }

  // ── JOURNALS ─────────────────────────────────────────────────────────────

  @Post('journals')
  postJournal(@Body() dto: CreateJournalDto): Promise<Journal> {
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    if (!dto?.lines || dto.lines.length < 2) {
      throw new BadRequestException('At least 2 lines are required for a double-entry journal');
    }
    const ctx = this.tenant.get();
    return this.journals.post(
      {
        tenantId: ctx.tenantId,
        description: dto.description,
        reference: dto.reference,
        createdBy: ctx.actorId,
        lines: dto.lines.map((l) => ({
          accountId: l.accountId,
          accountCode: l.accountCode,
          accountName: l.accountName,
          debit: l.debit ?? 0,
          credit: l.credit ?? 0,
        })),
      },
      ctx.actorId ?? undefined,
    );
  }

  @Get('journals')
  listJourels(@Query('reference') reference?: string): Promise<Journal[]> {
    const ctx = this.tenant.get();
    return this.journals.list({ tenantId: ctx.tenantId, reference, limit: 100 });
  }

  @Get('journals/:id')
  async getJournal(@Param('id') id: string): Promise<Journal> {
    const found = await this.journals.get(id);
    if (!found) throw new NotFoundException(`journal ${id} not found`);
    return found;
  }

  // ── PAYMENTS ─────────────────────────────────────────────────────────────

  @Post('payments')
  recordPayment(@Body() dto: CreatePaymentDto): Promise<Payment> {
    if (!dto?.invoiceId) throw new BadRequestException('invoiceId is required');
    if (!dto?.bankAccountId) throw new BadRequestException('bankAccountId is required');
    if (!dto?.amount || dto.amount <= 0) throw new BadRequestException('amount must be positive');
    const ctx = this.tenant.get();
    return this.payments.record(
      {
        tenantId: ctx.tenantId,
        invoiceId: dto.invoiceId,
        bankAccountId: dto.bankAccountId,
        amount: dto.amount,
        reference: dto.reference,
        createdBy: ctx.actorId,
      },
      ctx.actorId ?? undefined,
    );
  }

  @Get('payments')
  listPayments(@Query('invoiceId') invoiceId?: string): Promise<Payment[]> {
    const ctx = this.tenant.get();
    return this.payments.list({ tenantId: ctx.tenantId, invoiceId, limit: 100 });
  }

  @Get('payments/:id')
  async getPayment(@Param('id') id: string): Promise<Payment> {
    const found = await this.payments.get(id);
    if (!found) throw new NotFoundException(`payment ${id} not found`);
    return found;
  }

  // ── BANK RECONCILIATION ──────────────────────────────────────────────────

  @Post('bank-transactions/import')
  importTransactions(@Body() dto: ImportBankTransactionsDto): Promise<BankTransaction[]> {
    if (!dto?.bankAccountId) throw new BadRequestException('bankAccountId is required');
    if (!dto?.transactions || !Array.isArray(dto.transactions)) {
      throw new BadRequestException('transactions list is required');
    }
    const ctx = this.tenant.get();
    return this.reconciliation.importStatement(ctx.tenantId, dto.bankAccountId, dto.transactions);
  }

  @Get('bank-transactions')
  listBankTransactions(
    @Query('bankAccountId') bankAccountId: string,
    @Query('status') status?: BankTransactionStatus,
  ): Promise<BankTransaction[]> {
    if (!bankAccountId) throw new BadRequestException('bankAccountId is required');
    const ctx = this.tenant.get();
    return this.reconciliation.listTransactions(ctx.tenantId, bankAccountId, status);
  }

  @Post('bank-transactions/auto-match')
  autoMatchBankTransactions(@Body() dto: { bankAccountId: string }): Promise<Array<{ transactionId: string; paymentId: string; amount: number }>> {
    if (!dto?.bankAccountId) throw new BadRequestException('bankAccountId is required');
    const ctx = this.tenant.get();
    return this.reconciliation.autoMatch(ctx.tenantId, dto.bankAccountId);
  }

  @Post('bank-transactions/:id/reconcile')
  reconcileManually(
    @Param('id') id: string,
    @Body() dto: { paymentId: string },
  ): Promise<BankTransaction> {
    if (!dto?.paymentId) throw new BadRequestException('paymentId is required');
    const ctx = this.tenant.get();
    return this.reconciliation.reconcileManually(ctx.tenantId, id, dto.paymentId, ctx.actorId ?? undefined);
  }

  @Post('bank-transactions/:id/unreconcile')
  unreconcileBankTransaction(@Param('id') id: string): Promise<BankTransaction> {
    const ctx = this.tenant.get();
    return this.reconciliation.unreconcile(ctx.tenantId, id, ctx.actorId ?? undefined);
  }

  // ── VAT & TAX ENGINE ─────────────────────────────────────────────────────

  @Post('tax-codes')
  createTaxCode(@Body() dto: { code: string; description: string; rate: number; taxType?: string }): Promise<TaxCode> {
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (dto?.rate === undefined) throw new BadRequestException('rate is required');
    const ctx = this.tenant.get();
    return this.tax.createTaxCode({
      tenantId: ctx.tenantId,
      code: dto.code,
      description: dto.description || '',
      rate: dto.rate,
      taxType: dto.taxType as any,
    });
  }

  @Get('tax-codes')
  listTaxCodes(@Query('isActive') isActive?: string): Promise<TaxCode[]> {
    const ctx = this.tenant.get();
    return this.tax.listTaxCodes({
      tenantId: ctx.tenantId,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
  }

  @Post('invoices/:id/tax-lines')
  applyTaxLine(
    @Param('id') invoiceId: string,
    @Body() dto: { taxCodeId: string; taxableAmount: number; isInclusive?: boolean },
  ): Promise<TaxLine> {
    if (!dto?.taxCodeId) throw new BadRequestException('taxCodeId is required');
    if (dto?.taxableAmount === undefined) throw new BadRequestException('taxableAmount is required');
    const ctx = this.tenant.get();
    return this.tax.applyTax({
      tenantId: ctx.tenantId,
      invoiceId,
      taxCodeId: dto.taxCodeId,
      taxableAmount: dto.taxableAmount,
      taxRate: 0, // Service fetches rate from the database using taxCodeId
      isInclusive: dto.isInclusive,
    });
  }

  @Get('invoices/:id/tax-lines')
  getInvoiceTaxLines(@Param('id') invoiceId: string): Promise<TaxLine[]> {
    return this.tax.getInvoiceTaxLines(invoiceId);
  }

  @Get('tax-summary')
  getTaxSummary(): Promise<TaxSummary> {
    const ctx = this.tenant.get();
    return this.tax.getTaxSummary(ctx.tenantId);
  }
}
