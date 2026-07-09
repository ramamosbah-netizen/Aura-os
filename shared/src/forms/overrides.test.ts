import { describe, it, expect } from 'vitest';
import { applyFormOverrides, hasOverrides } from './overrides';
import { checkFormValid } from './enforce';
import type { FormSchema } from './schema';

const schema: FormSchema = {
  id: 't.demo',
  entity: 'Demo',
  endpoint: '/api/demo',
  version: 1,
  fields: [
    { name: 'title', label: 'Title', kind: 'text', required: true },
    { name: 'notes', label: 'Notes', kind: 'text' },
  ],
};

describe('applyFormOverrides (Form Designer P1)', () => {
  it('merges label/hint/placeholder/required per field, leaving others untouched', () => {
    const out = applyFormOverrides(schema, {
      fields: { notes: { label: 'Remarks', required: true, hint: 'Visible to client' } },
    });
    expect(out.fields[1]).toMatchObject({ label: 'Remarks', required: true, hint: 'Visible to client' });
    expect(out.fields[0]).toEqual(schema.fields[0]);
    expect(schema.fields[1].label).toBe('Notes'); // original untouched (pure)
  });

  it('hiding a field defuses its required flag — enforcement follows the override', () => {
    const out = applyFormOverrides(schema, { fields: { title: { hidden: true } } });
    expect(out.fields[0]).toMatchObject({ hidden: true, required: false });
    // Server-side: an empty submit now passes where the code schema would 400.
    expect(Object.keys(checkFormValid(schema, {}).fieldErrors)).toContain('title');
    expect(Object.keys(checkFormValid(out, {}).fieldErrors)).toHaveLength(0);
  });

  it('making an optional field required is enforced', () => {
    const out = applyFormOverrides(schema, { fields: { notes: { required: true } } });
    expect(checkFormValid(out, { title: 'x' }).fieldErrors.notes).toMatch(/required/);
  });

  it('null/empty overrides are identity; hasOverrides reflects content', () => {
    expect(applyFormOverrides(schema, null)).toBe(schema);
    expect(applyFormOverrides(schema, { fields: {} })).toBe(schema);
    expect(hasOverrides({ fields: {} })).toBe(false);
    expect(hasOverrides({ fields: { a: { hidden: true } } })).toBe(true);
  });
});
