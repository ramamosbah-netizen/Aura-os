import CreateDrawer from './ui/create-drawer';

const STATUS_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

/** Row-level "Edit" — opens the same drawer prefilled, PATCHes the account. */
export function AccountEdit({ account }: { account: { id: string; name: string; status: string; industry: string | null; website?: string | null } }) {
  return (
    <CreateDrawer
      mode="edit"
      entity="Account"
      subtitle="Update the account's details."
      endpoint={`/api/crm/accounts/${account.id}`}
      initialValues={{
        name: account.name,
        status: account.status,
        industry: account.industry ?? '',
        website: account.website ?? '',
      }}
      fields={[
        { name: 'name', label: 'Account name', kind: 'text', required: true, span: 2 },
        { name: 'status', label: 'Status', kind: 'select', options: STATUS_OPTIONS },
        { name: 'industry', label: 'Industry', kind: 'text', placeholder: 'e.g. Real Estate' },
        { name: 'website', label: 'Website', kind: 'text', placeholder: 'https://…', span: 2 },
      ]}
    />
  );
}

/** "+ New Account" — opens the professional slide-over create form. */
export default function AccountCreate() {
  return (
    <CreateDrawer
      entity="Account"
      subtitle="A customer or prospect — the head of the deal chain (CRM → Tender → Contract → Project)."
      endpoint="/api/crm/accounts"
      fields={[
        { name: 'name', label: 'Account name', kind: 'text', required: true, placeholder: 'e.g. Emaar Properties', span: 2 },
        { name: 'status', label: 'Status', kind: 'select', defaultValue: 'lead', options: STATUS_OPTIONS },
        { name: 'industry', label: 'Industry', kind: 'text', placeholder: 'e.g. Real Estate' },
        { name: 'website', label: 'Website', kind: 'text', placeholder: 'https://…', span: 2 },
      ]}
    />
  );
}
