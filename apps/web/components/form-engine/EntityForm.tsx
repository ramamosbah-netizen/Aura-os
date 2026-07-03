'use client';

// EntityForm — the Universal Create Engine surface. A module registers its
// schema once (registerFormSchema); every Create / Edit / Clone / View
// button anywhere in the app is then just <EntityForm id="crm.quotation"
// mode="…"/> — no form imports, no per-surface React code.

import { resolveFormSchema, type FormLineItem } from '@aura/shared';
import FormDrawer, { type FormDrawerMode } from './FormDrawer';
// Schema registration happens in lib/form-plugins.tsx, loaded once from the
// app shell before any page content renders — never import it from here
// (engine code must not depend on app plugins).

export interface EntityFormProps {
  /** registered schema id, e.g. 'crm.quotation' */
  id: string;
  mode?: FormDrawerMode;
  /** context for factory schemas (e.g. { projects } for option lists) */
  ctx?: Record<string, unknown>;
  /** record id — used for edit-mode PATCH (`${endpoint}/${recordId}`) */
  recordId?: string;
  initialValues?: Record<string, string>;
  initialLines?: Record<string, FormLineItem[]>;
  buttonLabel?: string;
  permissions?: string[];
}

export default function EntityForm({ id, ctx, ...rest }: EntityFormProps) {
  const schema = resolveFormSchema(id, ctx);
  if (!schema) {
    // A missing registration is a wiring bug — make it loud in dev, silent in prod.
    if (process.env.NODE_ENV !== 'production') {
      return <span style={{ color: 'var(--bad)', fontSize: 12 }}>form schema “{id}” is not registered</span>;
    }
    return null;
  }
  return <FormDrawer schema={schema} {...rest} />;
}
