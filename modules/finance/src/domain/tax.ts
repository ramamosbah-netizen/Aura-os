import { type Id, newId } from '@aura/shared';

// ── VAT / Tax Engine ───────────────────────────────────────────────────────
// Configurable tax codes with automatic tax line computation on invoices.
// Supports UAE VAT (5%), GCC reverse-charge, zero-rate, and exempt scenarios.

export type TaxType = 'output' | 'input' | 'reverse_charge';
export type TaxReturnStatus = 'draft' | 'filed' | 'paid';

export interface TaxCode {
  id: Id;
  tenantId: Id;
  code: string;          // e.g. 'VAT-5', 'VAT-0', 'EXEMPT', 'RC'
  description: string;
  rate: number;           // percentage, e.g. 5.0
  taxType: TaxType;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

export interface NewTaxCode {
  tenantId: Id;
  code: string;
  description: string;
  rate: number;
  taxType?: TaxType;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

export function makeTaxCode(input: NewTaxCode): TaxCode {
  return {
    id: newId(),
    tenantId: input.tenantId,
    code: input.code.trim().toUpperCase(),
    description: input.description.trim(),
    rate: Number(input.rate),
    taxType: input.taxType ?? 'output',
    isActive: true,
    effectiveFrom: input.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    effectiveTo: input.effectiveTo ?? null,
    createdAt: new Date().toISOString(),
  };
}

export interface TaxLine {
  id: Id;
  tenantId: Id;
  invoiceId: Id;
  taxCodeId: Id;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  isInclusive: boolean;
  /**
   * The TAX POINT — the date of supply, which is the date a VAT return is filed against.
   * Distinct from `createdAt` (when the row was written): book a March invoice on 2 April and the
   * two disagree, which used to push the VAT into the wrong return. Defaults to the creation date
   * so existing behaviour is unchanged when a caller does not supply one.
   */
  taxPointDate: string;
  createdAt: string;
}

export interface NewTaxLine {
  tenantId: Id;
  invoiceId: Id;
  taxCodeId: Id;
  taxableAmount: number;
  taxRate: number;
  isInclusive?: boolean;
  /** Date of supply (YYYY-MM-DD). Defaults to today — pass the invoice date for backdated entries. */
  taxPointDate?: string | null;
}

export function makeTaxLine(input: NewTaxLine): TaxLine {
  if (!Number.isFinite(input.taxableAmount) || !Number.isFinite(input.taxRate)) {
    throw new Error('tax line requires a numeric amount and rate');
  }
  if (input.taxRate < 0) throw new Error(`tax rate cannot be negative (got ${input.taxRate})`);

  let taxAmount: number;
  let netTaxable: number;
  if (input.isInclusive) {
    // Tax-inclusive: the amount passed in is GROSS, so extract the tax and keep the NET.
    netTaxable = Number((input.taxableAmount / (1 + input.taxRate / 100)).toFixed(2));
    taxAmount = Number((input.taxableAmount - netTaxable).toFixed(2));
  } else {
    // Tax-exclusive: the amount passed in is already net; tax goes on top.
    netTaxable = input.taxableAmount;
    taxAmount = Number((input.taxableAmount * (input.taxRate / 100)).toFixed(2));
  }

  return {
    id: newId(),
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    taxCodeId: input.taxCodeId,
    // Always the NET taxable amount, whichever way it was entered. Previously an inclusive line
    // stored the GROSS here, so `byTaxCode[].taxableAmount` silently mixed gross and net figures —
    // and the "taxable amount" box of a VAT return must be net of tax. A 105,000 inclusive line
    // reported 105,000 taxable against 5,000 of VAT, which does not reconcile at 5%.
    taxableAmount: netTaxable,
    taxRate: input.taxRate,
    taxAmount,
    isInclusive: input.isInclusive ?? false,
    taxPointDate: (input.taxPointDate || new Date().toISOString()).slice(0, 10),
    createdAt: new Date().toISOString(),
  };
}

export interface TaxReturn {
  id: Id;
  tenantId: Id;
  periodStart: string;
  periodEnd: string;
  totalOutputTax: number;
  totalInputTax: number;
  netTaxPayable: number;  // output - input
  status: TaxReturnStatus;
  filedAt: string | null;
  filedBy: string | null;
  createdAt: string;
}

export interface TaxSummary {
  totalOutputTax: number;
  totalInputTax: number;
  netPayable: number;
  lineCount: number;
  byTaxCode: Record<string, { taxableAmount: number; taxAmount: number; count: number }>;
}

export function calculateTaxSummary(lines: TaxLine[], codes: TaxCode[]): TaxSummary {
  let totalOutput = 0;
  let totalInput = 0;
  const byCode: TaxSummary['byTaxCode'] = {};

  const codeMap = new Map(codes.map((c) => [c.id, c]));

  for (const l of lines) {
    const code = codeMap.get(l.taxCodeId);
    const key = code?.code ?? l.taxCodeId;

    if (!byCode[key]) byCode[key] = { taxableAmount: 0, taxAmount: 0, count: 0 };
    byCode[key].taxableAmount += l.taxableAmount;
    byCode[key].taxAmount += l.taxAmount;
    byCode[key].count += 1;

    // Reverse charge is declared on BOTH sides, not just recovered.
    //
    // Under the UAE VAT law (and GCC/EU reverse charge generally) the RECIPIENT self-accounts for
    // tax on an imported supply: it declares the output VAT it would have been charged AND recovers
    // the same amount as input VAT. Both boxes on the return carry the amount; the net effect is
    // zero when the tax is fully recoverable.
    //
    // Treating it as input ONLY left output understated and therefore **net VAT payable understated
    // by the whole reverse-charge amount** — under-declaring to the FTA, which is a penalty matter,
    // not a presentation one. Unlike the other defects found in this module, the NET was wrong too.
    if (code?.taxType === 'reverse_charge') {
      totalOutput += l.taxAmount;
      totalInput += l.taxAmount;
    } else if (code?.taxType === 'input') {
      totalInput += l.taxAmount;
    } else {
      totalOutput += l.taxAmount;
    }
  }

  return {
    totalOutputTax: Number(totalOutput.toFixed(2)),
    totalInputTax: Number(totalInput.toFixed(2)),
    netPayable: Number((totalOutput - totalInput).toFixed(2)),
    lineCount: lines.length,
    byTaxCode: byCode,
  };
}

/** A VAT return restricted to a filing period — tax lines whose date falls in [start, end]. */
export function calculateTaxReturn(lines: TaxLine[], codes: TaxCode[], periodStart: string, periodEnd: string): TaxSummary {
  // Filter on the TAX POINT (date of supply), not when the row happened to be written. Falls back
  // to createdAt for rows predating the tax_point_date column, so a filed period never re-states.
  const inPeriod = lines.filter((l) => {
    const d = (l.taxPointDate || l.createdAt || '').slice(0, 10);
    return d >= periodStart && d <= periodEnd;
  });
  return calculateTaxSummary(inPeriod, codes);
}

export interface NewTaxReturn {
  tenantId: Id;
  periodStart: string;
  periodEnd: string;
  totalOutputTax: number;
  totalInputTax: number;
}

export function makeTaxReturn(input: NewTaxReturn): TaxReturn {
  if (!input.periodStart || !input.periodEnd) throw new Error('periodStart and periodEnd are required');
  if (input.periodEnd < input.periodStart) throw new Error('periodEnd must be on or after periodStart');
  const output = Number(input.totalOutputTax) || 0;
  const inputTax = Number(input.totalInputTax) || 0;
  return {
    id: newId(),
    tenantId: input.tenantId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    totalOutputTax: Number(output.toFixed(2)),
    totalInputTax: Number(inputTax.toFixed(2)),
    netTaxPayable: Number((output - inputTax).toFixed(2)),
    status: 'draft',
    filedAt: null,
    filedBy: null,
    createdAt: new Date().toISOString(),
  };
}
