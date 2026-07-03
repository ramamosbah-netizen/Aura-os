import CreateDrawer from './ui/create-drawer';

interface ContractLite {
  id: string;
  title: string;
  accountId: string | null;
  accountName: string | null;
  value: number;
}

/** "+ New Project" — started from an ACTIVE contract; picking one inherits its
 *  title, value, and account (the deal chain arriving at delivery). */
export default function ProjectCreate({ contracts }: { contracts: ContractLite[] }) {
  return (
    <CreateDrawer
      entity="Project"
      subtitle="A delivery project. Pick an active contract to inherit its title, value, and account."
      endpoint="/api/projects/projects"
      fields={[
        {
          name: 'contractId',
          label: 'Active contract',
          kind: 'select',
          labelField: 'contractTitle',
          placeholder: 'No contract — internal project',
          span: 2,
          options: contracts.map((c) => ({
            value: c.id,
            label: c.title,
            fills: { title: c.title, value: c.value ? String(c.value) : '' },
            extra: { accountId: c.accountId, accountName: c.accountName },
          })),
        },
        { name: 'title', label: 'Project title', kind: 'text', required: true, placeholder: 'e.g. Marina Tower ELV Delivery', span: 2 },
        { name: 'reference', label: 'Reference', kind: 'text', placeholder: 'e.g. PRJ-2026-001' },
        { name: 'value', label: 'Budget / value (AED)', kind: 'number', placeholder: '0' },
        {
          name: 'status',
          label: 'Status',
          kind: 'select',
          defaultValue: 'planned',
          options: [
            { value: 'planned', label: 'Planned' },
            { value: 'active', label: 'Active' },
          ],
          span: 2,
        },
      ]}
    />
  );
}
