import CreateDrawer from './ui/create-drawer';

interface AccountLite {
  id: string;
  name: string;
}

/** "+ New Tender" — slide-over form, optionally linked to a CRM account. */
export default function TenderCreate({ accounts }: { accounts: AccountLite[] }) {
  return (
    <CreateDrawer
      entity="Tender"
      subtitle="A bid or proposal. Winning it auto-creates the Contract on the deal chain."
      endpoint="/api/tendering/tenders"
      fields={[
        { name: 'title', label: 'Tender title', kind: 'text', required: true, placeholder: 'e.g. Marina Tower — ELV package', span: 2 },
        { name: 'reference', label: 'Reference', kind: 'text', placeholder: 'e.g. TDR-2026-001' },
        {
          name: 'status',
          label: 'Status',
          kind: 'select',
          defaultValue: 'draft',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'submitted', label: 'Submitted' },
          ],
        },
        {
          name: 'accountId',
          label: 'Account',
          kind: 'select',
          labelField: 'accountName',
          placeholder: 'No account',
          options: accounts.map((a) => ({ value: a.id, label: a.name })),
        },
        { name: 'value', label: 'Value (AED)', kind: 'number', placeholder: '0' },
      ]}
    />
  );
}
