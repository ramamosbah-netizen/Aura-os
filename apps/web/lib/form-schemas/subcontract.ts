// Subcontract form — demonstrates a plugin field type ('percent', registered
// in lib/form-plugins.tsx) plus option-driven data (projects) injected into
// otherwise-static metadata via a factory.

import type { FormSchema } from '@aura/shared';

export interface ProjectOption {
  id: string;
  title: string;
}

export function subcontractFormSchema(projects: ProjectOption[]): FormSchema {
  return {
    id: 'subcontracts.subcontract',
    entity: 'Subcontract',
    endpoint: '/api/subcontracts',
    subtitle: 'A subcontractor agreement. Retention is withheld from every certified claim until release.',
    version: 1,
    fields: [
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
        label: 'Retention',
        kind: 'percent',
        dataType: 'number',
        defaultValue: '10',
        hint: 'Percentage withheld from each claim (default 10%).',
        validation: [
          { type: 'min', value: 0 },
          { type: 'max', value: 20, message: 'Retention above 20% is outside standard UAE contract terms.' },
        ],
      },
    ],
    rules: [
      {
        id: 'high-value-retention-floor',
        description: 'High-value packages must carry retention.',
        when: { all: [{ field: 'value', op: 'gte', value: 1000000 }, { field: 'retentionPercentage', op: 'lt', value: 5 }] },
        actions: [{ type: 'warn', message: 'Packages ≥ AED 1M usually carry at least 5% retention.' }],
      },
    ],
  };
}
