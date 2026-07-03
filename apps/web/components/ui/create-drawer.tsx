'use client';

// Legacy CreateDrawer — now a thin adapter over the metadata-driven form
// engine (components/form-engine). The public props API is frozen: all
// existing call sites keep passing FieldSpec[] and get identical behavior,
// while the heavy lifting (rules, formulas, layout, plugins) lives in the
// engine. New forms should register a FormSchema instead of using this.

import { useMemo } from 'react';
import type { FormFieldSchema, FormSchema } from '@aura/shared';
import { FormDrawer } from '../form-engine';

/** @deprecated import FormSelectOption from @aura/shared */
export interface SelectOption {
  value: string;
  label: string;
  /** picking this option prefills these form fields (only where still empty) */
  fills?: Record<string, string>;
  /** picking this option merges these keys straight into the POST payload */
  extra?: Record<string, string | number | null>;
}

/** @deprecated import FormFieldSchema from @aura/shared */
export interface FieldSpec {
  /** payload key the value is posted under */
  name: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'date' | 'textarea' | 'lines';
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: SelectOption[];
  /** for selects: also post the chosen option's label under this payload key */
  labelField?: string;
  /** grid width — drawer body is a 2-col grid */
  span?: 1 | 2;
  defaultValue?: string;
  /** payload transform: 'csv' splits into a trimmed string array; 'isoDate' posts an ISO timestamp */
  transform?: 'csv' | 'isoDate';
}

/** @deprecated import FormLineItem from @aura/shared */
export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

interface Props {
  /** entity noun, e.g. "Account" — renders the button and drawer title */
  entity: string;
  /** short sentence under the title explaining what this creates */
  subtitle: string;
  /** BFF route to POST (create) or PATCH (edit) the payload to */
  endpoint: string;
  fields: FieldSpec[];
  /** button label override; defaults to "+ New {entity}" (create) / "Edit" (edit) */
  buttonLabel?: string;
  /** 'edit' turns this into an edit form: PATCH, prefilled fields, ghost trigger button */
  mode?: 'create' | 'edit';
  /** current record values to prefill in edit mode, keyed by field name */
  initialValues?: Record<string, string>;
}

export default function CreateDrawer({ entity, subtitle, endpoint, fields, buttonLabel, mode = 'create', initialValues }: Props) {
  const schema = useMemo<FormSchema>(
    () => ({
      id: `legacy.${entity.toLowerCase().replace(/\s+/g, '-')}`,
      entity,
      endpoint,
      subtitle,
      // FieldSpec is a structural subset of FormFieldSchema — pass through
      fields: fields as FormFieldSchema[],
    }),
    [entity, endpoint, subtitle, fields],
  );

  return <FormDrawer schema={schema} mode={mode} initialValues={initialValues} buttonLabel={buttonLabel} />;
}
