'use client';

// "+ New Subcontract" — resolved from the Universal Create Engine registry
// ('subcontracts.subcontract', a factory registration in lib/form-plugins.tsx
// that receives the project options as context).

import { EntityForm } from './form-engine';
import type { ProjectOption } from '../lib/form-schemas/subcontract';

export default function SubcontractCreate({
  projects,
  initialProjectId,
}: {
  projects: ProjectOption[];
  initialProjectId?: string;
}) {
  const hasContext = Boolean(initialProjectId && projects.some((project) => project.id === initialProjectId));

  return (
    <EntityForm
      id="subcontracts.subcontract"
      ctx={{ projects }}
      initialValues={hasContext ? { projectId: initialProjectId! } : undefined}
    />
  );
}
