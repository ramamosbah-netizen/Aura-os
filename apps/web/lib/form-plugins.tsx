'use client';

import { useEffect, useState } from 'react';

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

/* Custom field kind: 'project-cost-line' — a cost line (CBS) of the project chosen in the same form
   (COST-CODE-01). Its choices are read for that project only; when the project changes, a line of the
   old one is cleared rather than carried across. Empty is a real answer — "not charged to a cost
   line" — and the form says so instead of leaving a blank that reads as forgotten. */
function ProjectCostLineField({ field, value, onChange, disabled, invalid, id, describedBy, values }: Parameters<Parameters<typeof registerFieldRenderer>[1]>[0]) {
  const projectId = values?.projectId ?? '';
  const [lines, setLines] = useState<Array<{ id: string; code: string; title: string }>>([]);
  useEffect(() => {
    let live = true;
    setLines([]);
    if (!projectId) return;
    void fetch(`/api/projects/cbs?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: string; code: string; title: string }>) => {
        if (!live) return;
        setLines(rows ?? []);
        if (value && !(rows ?? []).some((row) => row.id === value)) onChange('');
      })
      .catch(() => undefined);
    return () => { live = false; };
    // The project is the dependency; the current value is checked against the lines it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  return (
    <select
      id={id}
      data-testid={`field-${field.name}`}
      className={`select${invalid ? ' input-error' : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || !projectId}
      aria-invalid={invalid}
      aria-describedby={describedBy}
    >
      <option value="">{projectId ? 'Not charged to a cost line' : 'Choose the project first'}</option>
      {lines.map((line) => <option key={line.id} value={line.id}>{line.code} · {line.title}</option>)}
    </select>
  );
}
registerFieldRenderer('project-cost-line', (props) => <ProjectCostLineField {...props} />);

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
