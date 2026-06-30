import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
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
  type TaxReturn,
  type PettyCashFund,
  type PettyCashTransaction,
  type PettyCashTxType,
  type PettyCashCategory,
  PettyCashService,
  type CustomerInvoice,
  type NewCustomerInvoiceLine,
  type ArAgingReport,
  type ApAgingReport,
  CustomerInvoiceService,
  type BankGuarantee,
  type GuaranteeType,
  BankGuaranteeService,
  type PostDatedCheque,
  type ChequeDirection,
  type ChequeAction,
  type ChequeSummary,
  PostDatedChequeService,
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
  postedAt?: string | null;
  companyId?: string | null;
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
    private readonly pettyCash: PettyCashService,
    private readonly customerInvoices: CustomerInvoiceService,
    private readonly bankGuarantees: BankGuaranteeService,
    private readonly postDatedCheques: PostDatedChequeService,
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

  // literal route before :id
  @Get('invoices/aging')
  apAging(@Query('asOf') asOf?: string): Promise<ApAgingReport> {
    return this.invoices.aging(this.tenant.get().tenantId, asOf);
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
  async postJournal(@Body() dto: CreateJournalDto): Promise<Journal> {
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    if (!dto?.lines || dto.lines.length < 2) {
      throw new BadRequestException('At least 2 lines are required for a double-entry journal');
    }
    const ctx = this.tenant.get();
    try {
      return await this.journals.post(
        {
          tenantId: ctx.tenantId,
          companyId: dto.companyId ?? ctx.companyId,
          description: dto.description,
          reference: dto.reference,
          postedAt: dto.postedAt,
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
    } catch (err) {
      // Closed-period and double-entry-balance violations are client errors, not 500s.
      throw new BadRequestException(err instanceof Error ? err.message : 'journal post failed');
    }
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
  recordPayment(
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<Payment> {
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
      idempotencyKey,
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

  // ── VAT RETURNS (period filings) ─────────────────────────────────────────

  @Get('vat-returns/preview')
  previewVatReturn(@Query('from') from?: string, @Query('to') to?: string): Promise<TaxSummary> {
    if (!from || !to) throw new BadRequestException('from and to (YYYY-MM-DD) are required');
    const ctx = this.tenant.get();
    return this.tax.previewReturn(ctx.tenantId, from, to);
  }

  @Get('vat-returns')
  listVatReturns(): Promise<TaxReturn[]> {
    const ctx = this.tenant.get();
    return this.tax.listReturns(ctx.tenantId);
  }

  @Post('vat-returns')
  async generateVatReturn(@Body() dto: { periodStart: string; periodEnd: string }): Promise<TaxReturn> {
    if (!dto?.periodStart || !dto?.periodEnd) throw new BadRequestException('periodStart and periodEnd are required');
    const ctx = this.tenant.get();
    try {
      return await this.tax.generateReturn(ctx.tenantId, dto.periodStart, dto.periodEnd);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Patch('vat-returns/:id/status')
  async setVatReturnStatus(@Param('id') id: string, @Body() dto: { status: 'filed' | 'paid' }): Promise<TaxReturn> {
    if (dto?.status !== 'filed' && dto?.status !== 'paid') throw new BadRequestException("status must be 'filed' or 'paid'");
    const ctx = this.tenant.get();
    try {
      return await this.tax.setReturnStatus(id, dto.status, ctx.actorId);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── PETTY CASH (imprest floats) ──────────────────────────────────────────

  @Post('petty-cash')
  createPettyCashFund(@Body() dto: { name: string; custodianEmployeeId?: string; openingFloat?: number }): Promise<PettyCashFund> {
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    const ctx = this.tenant.get();
    try {
      return this.pettyCash.createFund({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        name: dto.name,
        custodianEmployeeId: dto.custodianEmployeeId ?? null,
        openingFloat: dto.openingFloat !== undefined ? Number(dto.openingFloat) : undefined,
        createdBy: ctx.actorId,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('petty-cash')
  listPettyCashFunds(): Promise<PettyCashFund[]> {
    return this.pettyCash.listFunds({ tenantId: this.tenant.get().tenantId, limit: 200 });
  }

  @Get('petty-cash/:id')
  async getPettyCashFund(@Param('id') id: string): Promise<{ fund: PettyCashFund; transactions: PettyCashTransaction[] }> {
    const found = await this.pettyCash.getFundWithTransactions(id);
    if (!found) throw new NotFoundException(`petty cash fund ${id} not found`);
    return found;
  }

  @Post('petty-cash/:id/transactions')
  async recordPettyCashTx(
    @Param('id') id: string,
    @Body() dto: { type: PettyCashTxType; amount: number; transactionDate: string; category?: PettyCashCategory; description?: string },
  ): Promise<{ fund: PettyCashFund; transaction: PettyCashTransaction }> {
    if (dto?.type !== 'topup' && dto?.type !== 'expense') throw new BadRequestException("type must be 'topup' or 'expense'");
    if (!(Number(dto.amount) > 0)) throw new BadRequestException('amount must be positive');
    if (!dto?.transactionDate) throw new BadRequestException('transactionDate is required');
    try {
      return await this.pettyCash.recordTransaction(id, dto.type, Number(dto.amount), dto.transactionDate, dto.category, dto.description);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── CUSTOMER INVOICES (AR / sales) ───────────────────────────────────────

  @Post('customer-invoices')
  async createCustomerInvoice(
    @Body() dto: { invoiceNumber: string; customerName: string; projectId?: string; projectName?: string; contractRef?: string; issueDate: string; dueDate?: string; lines: NewCustomerInvoiceLine[] },
  ): Promise<CustomerInvoice> {
    if (!dto?.invoiceNumber?.trim()) throw new BadRequestException('invoiceNumber is required');
    if (!dto?.customerName?.trim()) throw new BadRequestException('customerName is required');
    if (!dto?.issueDate) throw new BadRequestException('issueDate is required');
    if (!Array.isArray(dto?.lines) || dto.lines.length === 0) throw new BadRequestException('at least one line item is required');
    const ctx = this.tenant.get();
    try {
      return await this.customerInvoices.create({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        invoiceNumber: dto.invoiceNumber,
        customerName: dto.customerName,
        projectId: dto.projectId ?? null,
        projectName: dto.projectName ?? null,
        contractRef: dto.contractRef ?? null,
        issueDate: dto.issueDate,
        dueDate: dto.dueDate ?? null,
        lines: dto.lines,
        createdBy: ctx.actorId,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('customer-invoices')
  listCustomerInvoices(@Query('status') status?: CustomerInvoice['status'], @Query('projectId') projectId?: string): Promise<CustomerInvoice[]> {
    return this.customerInvoices.list({ tenantId: this.tenant.get().tenantId, status, projectId, limit: 100 });
  }

  // literal route before :id
  @Get('customer-invoices/aging')
  arAging(@Query('asOf') asOf?: string): Promise<ArAgingReport> {
    return this.customerInvoices.aging(this.tenant.get().tenantId, asOf);
  }

  // Paginated list (the pagination contract): ?limit&offset → { items, total, limit, offset, hasMore }
  @Get('customer-invoices/paged')
  pagedCustomerInvoices(
    @Query('status') status?: CustomerInvoice['status'],
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.customerInvoices.listPaged(
      { tenantId: this.tenant.get().tenantId, status, projectId },
      parsePageParams(limit, offset),
    );
  }

  @Get('customer-invoices/:id')
  async getCustomerInvoice(@Param('id') id: string): Promise<CustomerInvoice> {
    const found = await this.customerInvoices.get(id);
    if (!found) throw new NotFoundException(`customer invoice ${id} not found`);
    return found;
  }

  @Post('customer-invoices/:id/issue')
  async issueCustomerInvoice(@Param('id') id: string): Promise<CustomerInvoice> {
    try {
      return await this.customerInvoices.issue(id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('customer-invoices/:id/receipts')
  async recordReceipt(@Param('id') id: string, @Body() dto: { amount: number }): Promise<CustomerInvoice> {
    if (!(Number(dto?.amount) > 0)) throw new BadRequestException('amount must be positive');
    try {
      return await this.customerInvoices.recordReceipt(id, Number(dto.amount));
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('customer-invoices/:id/cancel')
  async cancelCustomerInvoice(@Param('id') id: string): Promise<CustomerInvoice> {
    try {
      return await this.customerInvoices.cancel(id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── BANK GUARANTEES / BONDS ──────────────────────────────────────────────

  @Post('bank-guarantees')
  async createBankGuarantee(
    @Body() dto: { reference: string; type: GuaranteeType; beneficiary: string; bankName: string; projectId?: string; projectName?: string; amount: number; currency?: string; issueDate: string; expiryDate: string; notes?: string },
  ): Promise<BankGuarantee> {
    if (!dto?.reference?.trim()) throw new BadRequestException('reference is required');
    if (!dto?.beneficiary?.trim()) throw new BadRequestException('beneficiary is required');
    if (!dto?.bankName?.trim()) throw new BadRequestException('bankName is required');
    if (!dto?.issueDate || !dto?.expiryDate) throw new BadRequestException('issueDate and expiryDate are required');
    const ctx = this.tenant.get();
    try {
      return await this.bankGuarantees.create({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        reference: dto.reference,
        type: dto.type,
        beneficiary: dto.beneficiary,
        bankName: dto.bankName,
        projectId: dto.projectId ?? null,
        projectName: dto.projectName ?? null,
        amount: Number(dto.amount),
        currency: dto.currency,
        issueDate: dto.issueDate,
        expiryDate: dto.expiryDate,
        notes: dto.notes,
        createdBy: ctx.actorId,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // literal route before :id
  @Get('bank-guarantees/expiring')
  expiringBankGuarantees(@Query('withinDays') withinDays?: string): Promise<BankGuarantee[]> {
    const days = withinDays ? Number(withinDays) : 30;
    return this.bankGuarantees.expiringSoon(this.tenant.get().tenantId, Number.isFinite(days) ? days : 30);
  }

  @Get('bank-guarantees')
  listBankGuarantees(@Query('status') status?: BankGuarantee['status'], @Query('projectId') projectId?: string): Promise<BankGuarantee[]> {
    return this.bankGuarantees.list({ tenantId: this.tenant.get().tenantId, status, projectId, limit: 200 });
  }

  @Get('bank-guarantees/:id')
  async getBankGuarantee(@Param('id') id: string): Promise<BankGuarantee> {
    const found = await this.bankGuarantees.get(id);
    if (!found) throw new NotFoundException(`bank guarantee ${id} not found`);
    return found;
  }

  @Patch('bank-guarantees/:id/status')
  async changeBankGuaranteeStatus(@Param('id') id: string, @Body() dto: { action: 'release' | 'claim' | 'expire' }): Promise<BankGuarantee> {
    if (!['release', 'claim', 'expire'].includes(dto?.action)) throw new BadRequestException("action must be 'release', 'claim', or 'expire'");
    try {
      return await this.bankGuarantees.changeStatus(id, dto.action);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── POST-DATED CHEQUES (PDC) ─────────────────────────────────────────────

  @Post('post-dated-cheques')
  async createPostDatedCheque(
    @Body() dto: { chequeNumber: string; direction: ChequeDirection; partyName: string; bankName: string; amount: number; currency?: string; issueDate: string; maturityDate: string; reference?: string; notes?: string },
  ): Promise<PostDatedCheque> {
    if (!dto?.chequeNumber?.trim()) throw new BadRequestException('chequeNumber is required');
    if (!dto?.partyName?.trim()) throw new BadRequestException('partyName is required');
    if (!dto?.bankName?.trim()) throw new BadRequestException('bankName is required');
    if (!dto?.issueDate || !dto?.maturityDate) throw new BadRequestException('issueDate and maturityDate are required');
    const ctx = this.tenant.get();
    try {
      return await this.postDatedCheques.create({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        chequeNumber: dto.chequeNumber,
        direction: dto.direction,
        partyName: dto.partyName,
        bankName: dto.bankName,
        amount: Number(dto.amount),
        currency: dto.currency,
        issueDate: dto.issueDate,
        maturityDate: dto.maturityDate,
        reference: dto.reference ?? null,
        notes: dto.notes,
        createdBy: ctx.actorId,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // literal routes before :id
  @Get('post-dated-cheques/maturing')
  maturingCheques(@Query('withinDays') withinDays?: string): Promise<PostDatedCheque[]> {
    const days = withinDays ? Number(withinDays) : 7;
    return this.postDatedCheques.maturingSoon(this.tenant.get().tenantId, Number.isFinite(days) ? days : 7);
  }

  @Get('post-dated-cheques/summary')
  chequeSummary(@Query('withinDays') withinDays?: string): Promise<ChequeSummary> {
    const days = withinDays ? Number(withinDays) : 7;
    return this.postDatedCheques.summary(this.tenant.get().tenantId, Number.isFinite(days) ? days : 7);
  }

  @Get('post-dated-cheques')
  listPostDatedCheques(@Query('status') status?: PostDatedCheque['status'], @Query('direction') direction?: ChequeDirection): Promise<PostDatedCheque[]> {
    return this.postDatedCheques.list({ tenantId: this.tenant.get().tenantId, status, direction, limit: 200 });
  }

  @Get('post-dated-cheques/:id')
  async getPostDatedCheque(@Param('id') id: string): Promise<PostDatedCheque> {
    const found = await this.postDatedCheques.get(id);
    if (!found) throw new NotFoundException(`post-dated cheque ${id} not found`);
    return found;
  }

  @Patch('post-dated-cheques/:id/status')
  async changeChequeStatus(@Param('id') id: string, @Body() dto: { action: ChequeAction }): Promise<PostDatedCheque> {
    if (!['deposit', 'clear', 'bounce', 'represent', 'cancel'].includes(dto?.action)) {
      throw new BadRequestException("action must be 'deposit', 'clear', 'bounce', 'represent', or 'cancel'");
    }
    try {
      return await this.postDatedCheques.changeStatus(id, dto.action);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
