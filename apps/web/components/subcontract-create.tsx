'use client';

// "+ New Subcontract" — resolved from the Universal Create Engine registry
// ('subcontracts.subcontract', a factory registration in lib/form-plugins.tsx
// that receives the project options as context).

import { EntityForm } from './form-engine';
import type { ProjectOption } from '../lib/form-schemas/subcontract';

export default function SubcontractCreate({ projects }: { projects: ProjectOption[] }) {
  return <EntityForm id="subcontracts.subcontract" ctx={{ projects }} />;
}
