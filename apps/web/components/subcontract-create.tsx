'use client';

// "+ New Subcontract" — rendered by the form engine from metadata
// (lib/form-schemas/subcontract.ts). The 'percent' field kind and its
// validators come from the app plugin module, not the engine core.

import '../lib/form-plugins';
import { FormDrawer } from './form-engine';
import { subcontractFormSchema, type ProjectOption } from '../lib/form-schemas/subcontract';

export default function SubcontractCreate({ projects }: { projects: ProjectOption[] }) {
  return <FormDrawer schema={subcontractFormSchema(projects)} />;
}
