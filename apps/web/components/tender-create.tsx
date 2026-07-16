import CreateDrawer from './ui/create-drawer';

interface AccountLite {
  id: string;
  name: string;
}

/** Row-level "Edit" — opens the drawer prefilled, PATCHes the tender. */
export function TenderEdit({ tender }: { tender: { id: string; title: string; reference?: string | null; source?: string | null; value: number; submissionDeadline?: string | null } }) {
  return (
    <CreateDrawer
      mode="edit"
      entity="Tender"
      subtitle="Update the tender's details. Status changes happen through the pipeline actions."
      endpoint={`/api/tendering/tenders/${tender.id}`}
      initialValues={{
        title: tender.title,
        reference: tender.reference ?? '',
        source: tender.source ?? '',
        value: tender.value ? String(tender.value) : '',
        submissionDeadline: tender.submissionDeadline ?? '',
      }}
      fields={[
        { name: 'title', label: 'Tender title', kind: 'text', required: true, span: 2 },
        { name: 'reference', label: 'Reference', kind: 'text' },
        {
          name: 'source',
          label: 'Source',
          kind: 'select',
          placeholder: 'Unclassified',
          options: [
            { value: 'invitation', label: 'Invitation to bid' },
            { value: 'public', label: 'Public advertisement' },
            { value: 'private', label: 'Private / single-source' },
            { value: 'opportunity', label: 'From opportunity' },
          ],
        },
        { name: 'value', label: 'Value (AED)', kind: 'number' },
        { name: 'submissionDeadline', label: 'Submission deadline', kind: 'date' },
      ]}
    />
  );
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
          name: 'source',
          label: 'Source',
          kind: 'select',
          placeholder: 'Unclassified',
          hint: 'Where this tender came from (the register groups by it)',
          options: [
            { value: 'invitation', label: 'Invitation to bid' },
            { value: 'public', label: 'Public advertisement' },
            { value: 'private', label: 'Private / single-source' },
          ],
        },
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
        { name: 'submissionDeadline', label: 'Submission deadline', kind: 'date', hint: 'When the bid must reach the client' },
      ]}
    />
  );
}
