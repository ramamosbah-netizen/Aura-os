import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Id } from '@aura/shared';
import {
  type TaxCode, type NewTaxCode, makeTaxCode,
  type TaxLine, type NewTaxLine, makeTaxLine,
  type TaxSummary, calculateTaxSummary,
} from './domain/tax';
import { TAX_CODE_STORE, TAX_LINE_STORE, type TaxCodeFilter, type TaxCodeStore, type TaxLineStore } from './tax-store';

@Injectable()
export class TaxService {
  private readonly logger = new Logger('TaxService');

  constructor(
    @Inject(TAX_CODE_STORE) private readonly codes: TaxCodeStore,
    @Inject(TAX_LINE_STORE) private readonly lines: TaxLineStore,
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
}
