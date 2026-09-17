import { CURRENCIES } from '@aura/shared';
import CreateDrawer from './ui/create-drawer';

interface PoLite {
  id: string;
  title: string;
  supplierName: string | null;
  projectId: string | null;
  projectName: string | null;
  value: number;
}

/** Row-level "Edit" — descriptive fields only; invoice value is fixed once posted. */
export function InvoiceEdit({ invoice }: { invoice: { id: string; title: string; reference?: string | null; supplierName: string | null } }) {
  return (
    <CreateDrawer
      mode="edit"
      entity="Invoice"
      subtitle="Update descriptive fields. The invoice value is fixed once posted."
      endpoint={`/api/finance/invoices/${invoice.id}`}
      initialValues={{
        title: invoice.title,
        reference: invoice.reference ?? '',
        supplierName: invoice.supplierName ?? '',
      }}
      fields={[
        { name: 'title', label: 'Invoice title', kind: 'text', required: true, span: 2 },
        { name: 'reference', label: 'Reference', kind: 'text' },
        { name: 'supplierName', label: 'Supplier', kind: 'text' },
      ]}
    />
  );
}

/** "+ New Invoice" — raised against a received PO; picking one inherits its
 *  supplier, project, and value (the operate loop closing through the contract). */
export default function InvoiceCreate({ pos }: { pos: PoLite[] }) {
  return (
    <CreateDrawer
      entity="Invoice"
      subtitle="A supplier invoice. Pick a received PO to inherit its supplier, project, and value."
      endpoint="/api/finance/invoices"
      fields={[
        {
          name: 'poId',
          label: 'Against received PO',
          kind: 'select',
          placeholder: pos.length ? 'No PO — direct invoice' : 'No received POs yet',
          span: 2,
          options: pos.map((p) => ({
            value: p.id,
            label: p.supplierName ? `${p.title} · ${p.supplierName}` : p.title,
            fills: {
              title: `Invoice — ${p.title}`,
              value: p.value ? String(p.value) : '',
              supplierName: p.supplierName ?? '',
            },
            extra: { poTitle: p.title, projectId: p.projectId, projectName: p.projectName },
          })),
        },
        { name: 'title', label: 'Invoice title', kind: 'text', required: true, placeholder: 'e.g. Invoice — CCTV supply', span: 2 },
        { name: 'reference', label: 'Reference', kind: 'text', placeholder: 'e.g. INV-8871' },
        { name: 'value', label: 'Amount', kind: 'number', placeholder: '0' },
        /**
         * The currency is on the form because an invoice can be in one (FX-01). The label said
         * "Amount (AED)" and nothing sent a currency, so a EUR supplier bill could not be entered
         * here at all — and the refusal for an ungoverned rate had nowhere to appear.
         *
         * The list is the currencies AURA can govern a rate for. A currency with no governed rate
         * for the invoice date is refused by the API and the reason is shown on this drawer.
         */
        {
          name: 'currency',
          label: 'Currency',
          kind: 'select',
          defaultValue: 'AED',
          hint: 'A non-AED invoice needs a governed rate for its invoice date.',
          options: CURRENCIES.map((code) => ({ value: code, label: code })),
        },
        { name: 'invoiceDate', label: 'Invoice date', kind: 'date', hint: 'The supplier’s date — the rate is taken at this date.' },
        { name: 'supplierName', label: 'Supplier', kind: 'text', placeholder: 'Auto-filled from PO, or type one', span: 2 },
      ]}
    />
  );
}
