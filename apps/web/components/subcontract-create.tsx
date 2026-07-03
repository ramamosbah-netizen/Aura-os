import CreateDrawer from './ui/create-drawer';

interface ProjectLite {
  id: string;
  title: string;
}

/** "+ New Subcontract" — a subcontractor agreement against a delivery project,
 *  with retention withheld from each claim. */
export default function SubcontractCreate({ projects }: { projects: ProjectLite[] }) {
  return (
    <CreateDrawer
      entity="Subcontract"
      subtitle="A subcontractor agreement. Retention is withheld from every certified claim until release."
      endpoint="/api/subcontracts"
      fields={[
        {
          name: 'projectId',
          label: 'Project',
          kind: 'select',
          required: true,
          labelField: 'projectName',
          placeholder: 'Select the delivery project…',
          span: 2,
          options: projects.map((p) => ({ value: p.id, label: p.title })),
        },
        { name: 'title', label: 'Scope / title', kind: 'text', required: true, placeholder: 'e.g. Containment & cable-tray installation', span: 2 },
        { name: 'subcontractorName', label: 'Subcontractor', kind: 'text', required: true, placeholder: 'e.g. Al Futtaim Engineering' },
        { name: 'value', label: 'Value (AED)', kind: 'number', required: true, placeholder: '0' },
        {
          name: 'retentionPercentage',
          label: 'Retention %',
          kind: 'number',
          defaultValue: '10',
          hint: 'Percentage withheld from each claim (default 10%).',
        },
      ]}
    />
  );
}
