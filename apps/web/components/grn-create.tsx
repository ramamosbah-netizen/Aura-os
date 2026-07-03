import CreateDrawer from './ui/create-drawer';

interface PoLite {
  id: string;
  title: string;
  supplierName: string | null;
  projectId: string | null;
  projectName: string | null;
  value: number;
}

/** "+ Record GRN" — goods received against an issued PO; picking one inherits its
 *  supplier, project, and value (operate-chain inheritance). */
export default function GrnCreate({ pos }: { pos: PoLite[] }) {
  return (
    <CreateDrawer
      entity="Goods Receipt"
      subtitle="Record goods received on site. Pick the issued PO to inherit its supplier, project, and value."
      endpoint="/api/inventory/grns"
      buttonLabel="Record GRN"
      fields={[
        {
          name: 'poId',
          label: 'Against issued PO',
          kind: 'select',
          placeholder: pos.length ? 'No PO — direct receipt' : 'No issued POs yet',
          span: 2,
          options: pos.map((p) => ({
            value: p.id,
            label: p.supplierName ? `${p.title} · ${p.supplierName}` : p.title,
            fills: { title: `Receipt — ${p.title}`, value: p.value ? String(p.value) : '' },
            extra: { poTitle: p.title, supplierName: p.supplierName, projectId: p.projectId, projectName: p.projectName },
          })),
        },
        { name: 'title', label: 'Goods received', kind: 'text', required: true, placeholder: 'e.g. Receipt — CCTV cameras batch 1', span: 2 },
        { name: 'value', label: 'Value (AED)', kind: 'number', placeholder: '0' },
      ]}
    />
  );
}
