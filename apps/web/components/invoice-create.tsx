import CreateDrawer from './ui/create-drawer';

interface PoLite {
  id: string;
  title: string;
  supplierName: string | null;
  projectId: string | null;
  projectName: string | null;
  value: number;
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
        { name: 'value', label: 'Amount (AED)', kind: 'number', placeholder: '0' },
        { name: 'supplierName', label: 'Supplier', kind: 'text', placeholder: 'Auto-filled from PO, or type one', span: 2 },
      ]}
    />
  );
}
