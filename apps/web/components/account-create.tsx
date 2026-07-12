import CreateDrawer from './ui/create-drawer';

const STATUS_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const SOURCE_OPTIONS = [
  { value: 'referral', label: 'Referral' },
  { value: 'exhibition', label: 'Exhibition / event' },
  { value: 'website', label: 'Website' },
  { value: 'cold_call', label: 'Cold call' },
  { value: 'consultant', label: 'Consultant / specifier' },
  { value: 'existing_client', label: 'Existing client' },
  { value: 'other', label: 'Other' },
];

// The full commercial profile the Account 360 shows — captured at creation,
// editable later (all fields flow through the create/update DTOs from PR #61).
const PROFILE_FIELDS = [
  { name: 'industry', label: 'Industry', kind: 'text' as const, placeholder: 'e.g. Real Estate / ELV' },
  { name: 'website', label: 'Website', kind: 'text' as const, placeholder: 'company.ae' },
  { name: 'phone', label: 'Phone', kind: 'text' as const, placeholder: '+971 4 …' },
  { name: 'email', label: 'Email', kind: 'text' as const, placeholder: 'procurement@company.ae' },
  {
    name: 'billingAddress', label: 'Billing & site address', kind: 'textarea' as const,
    placeholder: 'Office, building, area, city, country', span: 2 as const,
  },
  {
    name: 'source', label: 'Source', kind: 'select' as const, placeholder: 'Where did they come from?',
    options: SOURCE_OPTIONS,
  },
  {
    name: 'paymentTerms', label: 'Credit / payment terms', kind: 'text' as const,
    placeholder: 'e.g. 30 days PDC', hint: 'Shown on the Account 360 and the customer dossier',
  },
];

/** Row-level "Edit" — opens the same drawer prefilled, PATCHes the account. */
export function AccountEdit({ account }: {
  account: {
    id: string; name: string; status: string; industry: string | null; website?: string | null;
    phone?: string | null; email?: string | null; billingAddress?: string | null;
    source?: string | null; paymentTerms?: string | null;
  };
}) {
  return (
    <CreateDrawer
      mode="edit"
      entity="Account"
      subtitle="Update the account's commercial profile."
      endpoint={`/api/crm/accounts/${account.id}`}
      initialValues={{
        name: account.name,
        status: account.status,
        industry: account.industry ?? '',
        website: account.website ?? '',
        phone: account.phone ?? '',
        email: account.email ?? '',
        billingAddress: account.billingAddress ?? '',
        source: account.source ?? '',
        paymentTerms: account.paymentTerms ?? '',
      }}
      fields={[
        { name: 'name', label: 'Account name', kind: 'text', required: true, span: 2 },
        { name: 'status', label: 'Status', kind: 'select', options: STATUS_OPTIONS },
        ...PROFILE_FIELDS,
      ]}
    />
  );
}

/** "+ New Account" — opens the professional slide-over create form. */
export default function AccountCreate() {
  return (
    <CreateDrawer
      entity="Account"
      subtitle="A customer or prospect — the persistent commercial party at the head of the deal chain. Capture the full profile the Account 360 shows."
      endpoint="/api/crm/accounts"
      fields={[
        { name: 'name', label: 'Account name', kind: 'text', required: true, placeholder: 'e.g. Emaar Properties', span: 2 },
        { name: 'status', label: 'Status', kind: 'select', defaultValue: 'lead', options: STATUS_OPTIONS },
        ...PROFILE_FIELDS,
      ]}
    />
  );
}
