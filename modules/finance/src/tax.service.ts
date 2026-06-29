import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Id } from '@aura/shared';
import {
  type TaxCode, type NewTaxCode, makeTaxCode,
  type TaxLine, type NewTaxLine, makeTaxLine,
  type TaxSummary, calculateTaxSummary,
  type TaxReturn, calculateTaxReturn, makeTaxReturn,
} from './domain/tax';
import { TAX_CODE_STORE, TAX_LINE_STORE, TAX_RETURN_STORE, type TaxCodeFilter, type TaxCodeStore, type TaxLineStore, type TaxReturnStore } from './tax-store';

@Injectable()
export class TaxService {
  private readonly logger = new Logger('TaxService');

  constructor(
    @Inject(TAX_CODE_STORE) private readonly codes: TaxCodeStore,
    @Inject(TAX_LINE_STORE) private readonly lines: TaxLineStore,
    @Inject(TAX_RETURN_STORE) private readonly returns: TaxReturnStore,
  ) {}

  // ── TAX CODES ────────────────────────────────────────────────────────

  async createTaxCode(input: NewTaxCode): Promise<TaxCode> {
    const existing = await this.codes.getByCode(input.tenantId, input.code.trim().toUpperCase());
    if (existing) throw new Error(`Tax code ${input.code} already exists`);
    const code = makeTaxCode(input);
    await this.codes.create(code);
    this.logger.log(`Tax code created: ${code.code} (${code.rate}% ${code.taxType})`);
    return code;
  }

  async updateTaxCode(id: Id, patch: Partial<Pick<TaxCode, 'description' | 'rate' | 'taxType' | 'isActive' | 'effectiveFrom' | 'effectiveTo'>>): Promise<TaxCode> {
    const existing = await this.codes.get(id);
    if (!existing) throw new Error(`Tax code ${id} not found`);
    const updated: TaxCode = { ...existing, ...patch };
    await this.codes.update(updated);
    this.logger.log(`Tax code updated: ${updated.code}`);
    return updated;
  }

  async getTaxCode(id: Id): Promise<TaxCode | null> {
    return this.codes.get(id);
  }

  async listTaxCodes(filter?: TaxCodeFilter): Promise<TaxCode[]> {
    return this.codes.list(filter);
  }

  // ── TAX LINES ────────────────────────────────────────────────────────

  /**
   * Apply a tax code to an invoice line — computes tax automatically.
   * Handles both inclusive and exclusive tax pricing.
   */
  async applyTax(input: NewTaxLine): Promise<TaxLine> {
    const code = await this.codes.get(input.taxCodeId);
    if (!code) throw new Error(`Tax code ${input.taxCodeId} not found`);
    if (!code.isActive) throw new Error(`Tax code ${code.code} is inactive`);

    // Override rate from the code definition if not explicitly provided
    const lineInput: NewTaxLine = {
      ...input,
      taxRate: input.taxRate || code.rate,
    };

    const line = makeTaxLine(lineInput);
    await this.lines.create(line);
    this.logger.log(
      `Tax line applied: ${code.code} @ ${line.taxRate}% on ${line.taxableAmount} → tax=${line.taxAmount} (invoice=${line.invoiceId})`,
    );
    return line;
  }

  /**
   * Auto-apply a default tax code to an invoice based on its full value.
   * Convenience method for simple single-tax-code invoices.
   */
  async autoApplyToInvoice(tenantId: Id, invoiceId: Id, invoiceValue: number, taxCodeId: Id): Promise<TaxLine> {
    return this.applyTax({
      tenantId,
      invoiceId,
      taxCodeId,
      taxableAmount: invoiceValue,
      taxRate: 0, // will be overridden from the code
    });
  }

  async getInvoiceTaxLines(invoiceId: Id): Promise<TaxLine[]> {
    return this.lines.list({ invoiceId });
  }

  async removeInvoiceTaxLines(invoiceId: Id): Promise<void> {
    await this.lines.deleteByInvoice(invoiceId);
    this.logger.log(`Tax lines removed for invoice ${invoiceId}`);
  }

  // ── TAX SUMMARY / RETURN PREPARATION ─────────────────────────────────

  /**
   * Calculate a tax summary for a given tenant across all invoices.
   * In production this would filter by period, but for now aggregates all lines.
   */
  async getTaxSummary(tenantId: Id): Promise<TaxSummary> {
    const [lines, codes] = await Promise.all([
      this.lines.list({ tenantId }),
      this.codes.list({ tenantId }),
    ]);
    return calculateTaxSummary(lines, codes);
  }

  // ── VAT RETURNS (period filings) ─────────────────────────────────────

  /** Preview the output/input/net VAT for a period without persisting. */
  async previewReturn(tenantId: Id, periodStart: string, periodEnd: string): Promise<TaxSummary> {
    const [lines, codes] = await Promise.all([this.lines.list({ tenantId }), this.codes.list({ tenantId })]);
    return calculateTaxReturn(lines, codes, periodStart, periodEnd);
  }

  /** Generate (and persist as draft) a VAT return for a filing period. */
  async generateReturn(tenantId: Id, periodStart: string, periodEnd: string): Promise<TaxReturn> {
    const summary = await this.previewReturn(tenantId, periodStart, periodEnd);
    const ret = makeTaxReturn({ tenantId, periodStart, periodEnd, totalOutputTax: summary.totalOutputTax, totalInputTax: summary.totalInputTax });
    await this.returns.create(ret);
    this.logger.log(`VAT return ${periodStart}..${periodEnd}: output ${ret.totalOutputTax}, input ${ret.totalInputTax}, net ${ret.netTaxPayable}`);
    return ret;
  }

  /** File a draft return (or mark a filed one paid). */
  async setReturnStatus(id: Id, status: 'filed' | 'paid', filedBy?: string | null): Promise<TaxReturn> {
    const existing = await this.returns.get(id);
    if (!existing) throw new Error(`tax return ${id} not found`);
    const updated: TaxReturn = {
      ...existing,
      status,
      filedAt: status === 'filed' ? new Date().toISOString() : existing.filedAt,
      filedBy: status === 'filed' ? (filedBy ?? existing.filedBy) : existing.filedBy,
    };
    await this.returns.update(updated);
    this.logger.log(`VAT return ${id} → ${status}`);
    return updated;
  }

  getReturn(id: Id): Promise<TaxReturn | null> {
    return this.returns.get(id);
  }

  listReturns(tenantId: Id): Promise<TaxReturn[]> {
    return this.returns.list(tenantId);
  }
}
