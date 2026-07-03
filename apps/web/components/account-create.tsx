import CreateDrawer from './ui/create-drawer';

/** "+ New Account" — opens the professional slide-over create form. */
export default function AccountCreate() {
  return (
    <CreateDrawer
      entity="Account"
      subtitle="A customer or prospect — the head of the deal chain (CRM → Tender → Contract → Project)."
      endpoint="/api/crm/accounts"
      fields={[
        { name: 'name', label: 'Account name', kind: 'text', required: true, placeholder: 'e.g. Emaar Properties', span: 2 },
        {
          name: 'status',
          label: 'Status',
          kind: 'select',
          defaultValue: 'lead',
          options: [
            { value: 'lead', label: 'Lead' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
        },
        { name: 'industry', label: 'Industry', kind: 'text', placeholder: 'e.g. Real Estate' },
        { name: 'website', label: 'Website', kind: 'text', placeholder: 'https://…', span: 2 },
      ]}
    />
  );
}
