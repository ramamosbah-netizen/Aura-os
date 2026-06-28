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
  createdAt: string;
}

export interface NewTaxLine {
  tenantId: Id;
  invoiceId: Id;
  taxCodeId: Id;
  taxableAmount: number;
  taxRate: number;
  isInclusive?: boolean;
}

export function makeTaxLine(input: NewTaxLine): TaxLine {
  let taxAmount: number;
  if (input.isInclusive) {
    // Tax-inclusive: extract tax from the total
    taxAmount = Number((input.taxableAmount - (input.taxableAmount / (1 + input.taxRate / 100))).toFixed(2));
  } else {
    // Tax-exclusive: compute tax on top
    taxAmount = Number((input.taxableAmount * (input.taxRate / 100)).toFixed(2));
  }

  return {
    id: newId(),
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    taxCodeId: input.taxCodeId,
    taxableAmount: input.taxableAmount,
    taxRate: input.taxRate,
    taxAmount,
    isInclusive: input.isInclusive ?? false,
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

    if (code?.taxType === 'input' || code?.taxType === 'reverse_charge') {
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
