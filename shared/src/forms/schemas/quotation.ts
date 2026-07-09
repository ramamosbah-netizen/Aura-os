// Quotation form schema — pure metadata (zero React), the single source of truth
// shared by the web renderer and the API's server-side enforcement (assertFormValid).
// Moved here from apps/web (gap register Vol 23 #8) — demonstrates calculated fields:
// live subtotal / VAT / grand total computed from line items via SUMLINES formulas.
// The computed fields are transient (display-only) so the payload is unchanged.

import type { FormSchema } from '../schema';

export const quotationFormSchema: FormSchema = {
  id: 'crm.quotation',
  entity: 'Quotation',
  endpoint: '/api/crm/quotations',
  subtitle: 'A customer quote with VAT line items. Send it, then accepting converts it to a contract.',
  version: 1,
  fields: [
    { name: 'quoteNumber', label: 'Quote #', kind: 'text', required: true, placeholder: 'QT-001' },
    { name: 'issueDate', label: 'Issue date', kind: 'date', required: true, defaultValue: '=TODAY()' },
    { name: 'customerName', label: 'Customer', kind: 'text', required: true, placeholder: 'e.g. Emaar Properties', span: 2 },
    { name: 'lines', label: 'Line items', kind: 'lines', required: true },
    {
      name: 'subtotal',
      label: 'Subtotal (AED)',
      kind: 'number',
      transient: true,
      formula: 'ROUND(SUMLINES(lines, "quantity * unitPrice"), 2)',
    },
    {
      name: 'vatTotal',
      label: 'VAT (AED)',
      kind: 'number',
      transient: true,
      formula: 'ROUND(SUMLINES(lines, "quantity * unitPrice * vatRate / 100"), 2)',
    },
    {
      name: 'grandTotal',
      label: 'Grand total (AED)',
      kind: 'number',
      transient: true,
      formula: 'ROUND(subtotal + vatTotal, 2)',
      hint: 'Computed live — the API recalculates and stores the authoritative totals.',
      span: 2,
    },
  ],
  layout: [
    {
      type: 'section',
      id: 'quote-head',
      label: 'Quote',
      children: [
        { type: 'field', name: 'quoteNumber' },
        { type: 'field', name: 'issueDate' },
        { type: 'field', name: 'customerName' },
      ],
    },
    {
      type: 'section',
      id: 'quote-lines',
      label: 'Line items',
      children: [{ type: 'field', name: 'lines' }],
    },
    {
      type: 'card',
      id: 'quote-totals',
      label: 'Totals',
      children: [
        { type: 'field', name: 'subtotal' },
        { type: 'field', name: 'vatTotal' },
        { type: 'field', name: 'grandTotal' },
      ],
    },
  ],
};
