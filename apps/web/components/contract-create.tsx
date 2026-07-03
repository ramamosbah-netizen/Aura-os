import CreateDrawer from './ui/create-drawer';

interface TenderLite {
  id: string;
  title: string;
  accountId: string | null;
  accountName: string | null;
  value: number;
}

/** Row-level "Edit" — opens the drawer prefilled, PATCHes the contract. */
export function ContractEdit({ contract }: { contract: { id: string; title: string; reference?: string | null; value: number } }) {
  return (
    <CreateDrawer
      mode="edit"
      entity="Contract"
      subtitle="Update the contract's details. Status changes happen through the sign/complete actions."
      endpoint={`/api/contracts/contracts/${contract.id}`}
      initialValues={{
        title: contract.title,
        reference: contract.reference ?? '',
        value: contract.value ? String(contract.value) : '',
      }}
      fields={[
        { name: 'title', label: 'Contract title', kind: 'text', required: true, span: 2 },
        { name: 'reference', label: 'Reference', kind: 'text' },
        { name: 'value', label: 'Value (AED)', kind: 'number' },
      ]}
    />
  );
}

/** "+ New Contract" — raised from a WON tender; picking one inherits its
 *  title, value, and account (deal-chain inheritance, composed in the UI). */
export default function ContractCreate({ tenders }: { tenders: TenderLite[] }) {
  return (
    <CreateDrawer
      entity="Contract"
      subtitle="An awarded engagement. Pick a won tender to inherit its title, value, and account."
      endpoint="/api/contracts/contracts"
      fields={[
        {
          name: 'tenderId',
          label: 'Won tender',
          kind: 'select',
          labelField: 'tenderTitle',
          placeholder: 'No tender — standalone contract',
          span: 2,
          options: tenders.map((t) => ({
            value: t.id,
            label: t.title,
            fills: { title: t.title, value: t.value ? String(t.value) : '' },
            extra: { accountId: t.accountId, accountName: t.accountName },
          })),
        },
        { name: 'title', label: 'Contract title', kind: 'text', required: true, placeholder: 'e.g. Marina Tower — ELV works', span: 2 },
        { name: 'reference', label: 'Reference', kind: 'text', placeholder: 'e.g. CTR-2026-001' },
        { name: 'value', label: 'Value (AED)', kind: 'number', placeholder: '0' },
        {
          name: 'status',
          label: 'Status',
          kind: 'select',
          defaultValue: 'draft',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'active', label: 'Active (signed)' },
          ],
          hint: 'Setting Active marks the contract as signed and starts delivery.',
          span: 2,
        },
      ]}
    />
  );
}
