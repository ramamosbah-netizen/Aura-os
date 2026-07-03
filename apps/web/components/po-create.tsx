import CreateDrawer from './ui/create-drawer';

interface ProjectLite {
  id: string;
  title: string;
}

/** "+ New Purchase Order" — commits spend, optionally against a delivery project
 *  (committed cost lands on the project ledger via the spine). */
export default function PoCreate({ projects }: { projects: ProjectLite[] }) {
  return (
    <CreateDrawer
      entity="Purchase Order"
      subtitle="Committed procurement spend. Linking a project posts the committed cost to its ledger."
      endpoint="/api/procurement/purchase-orders"
      fields={[
        { name: 'title', label: 'PO title', kind: 'text', required: true, placeholder: 'e.g. CCTV cameras & NVRs — main supply', span: 2 },
        { name: 'reference', label: 'Reference', kind: 'text', placeholder: 'e.g. PO-2026-001' },
        { name: 'value', label: 'Value (AED)', kind: 'number', placeholder: '0' },
        {
          name: 'projectId',
          label: 'Project',
          kind: 'select',
          labelField: 'projectName',
          placeholder: 'No project — overhead spend',
          span: 2,
          options: projects.map((p) => ({ value: p.id, label: p.title })),
        },
        { name: 'supplierName', label: 'Supplier', kind: 'text', placeholder: 'e.g. Gulf Cables & Electrical', span: 2 },
      ]}
    />
  );
}
