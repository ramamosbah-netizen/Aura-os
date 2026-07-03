'use client';

// App-level form-engine plugins. This file is the worked example of the
// plugin contract: a custom field type, a custom validator, and a custom
// formula function — registered against the engine without modifying it.
// Import this module (side effects) from any client component that renders
// a schema referencing these ids.

import { registerFormSchema, registerFormulaFunction, registerFormValidator } from '@aura/shared';
import { registerFieldRenderer, registerFormToolbarAction } from '../components/form-engine';
import AiAutofill from '../components/form-engine/ai-autofill';
import AiReview from '../components/form-engine/ai-review';
import { employeeFormSchema } from './form-schemas/employee';
import { quotationFormSchema } from './form-schemas/quotation';
import { subcontractFormSchema, type ProjectOption } from './form-schemas/subcontract';

/* Custom field kind: 'percent' — numeric input with a % adornment.
   Schemas using it set dataType: 'number' so the payload stays numeric. */
registerFieldRenderer('percent', ({ field, value, onChange, disabled, invalid }) => (
  <div style={{ position: 'relative' }}>
    <input
      className={`input${invalid ? ' input-error' : ''}`}
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      disabled={disabled}
      style={{ paddingRight: 28, width: '100%' }}
    />
    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13 }}>
      %
    </span>
  </div>
));

/* Custom validator: UAE Tax Registration Number (15 digits). */
registerFormValidator('uae-trn', (value) =>
  /^\d{15}$/.test(value) ? null : 'TRN must be exactly 15 digits',
);

/* Custom formula function: UAE VAT at the standard 5% rate. */
registerFormulaFunction('VAT_UAE', (amount) => {
  const n = Number(amount ?? 0);
  return Number.isFinite(n) ? Math.round(n * 0.05 * 100) / 100 : 0;
});

/* Toolbar plugin: AI Auto-Fill on every metadata form — paste/upload a
   document, review the extracted fields, apply. Uses the kernel AI seam. */
registerFormToolbarAction({
  id: 'ai-autofill',
  render: (api) => <AiAutofill api={api} />,
});

/* Toolbar plugin: AI data-quality review of the current draft — advisory
   issues with one-click suggestions; never blocks the save. */
registerFormToolbarAction({
  id: 'ai-review',
  render: (api) => <AiReview api={api} />,
});

/* ── Universal Create Engine registrations ──────────────────────────────
   Each module registers its schema once; every Create / Edit / Clone /
   View surface resolves it via <EntityForm id="…"/>. Factory registrations
   receive the rendering surface's context (option lists etc.). */

registerFormSchema('hr.employee', employeeFormSchema);
registerFormSchema('crm.quotation', quotationFormSchema);
registerFormSchema('subcontracts.subcontract', (ctx) =>
  subcontractFormSchema((ctx?.projects as ProjectOption[]) ?? []),
);
