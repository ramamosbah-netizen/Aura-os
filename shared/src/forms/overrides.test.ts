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
    expect(hasOverrides({ fields: {}, added: [{ name: 'cf_x', label: 'X', kind: 'text' }] })).toBe(true);
    expect(hasOverrides({ fields: {}, order: ['notes', 'title'] })).toBe(true);
  });
});

describe('applyFormOverrides (Form Designer P2 — added fields + order)', () => {
  it('appends added custom fields as real schema fields, selects expanding options', () => {
    const out = applyFormOverrides(schema, {
      fields: {},
      added: [
        { name: 'cf_badge', label: 'Badge No.', kind: 'text', required: true, hint: 'Site pass' },
        { name: 'cf_zone', label: 'Zone', kind: 'select', options: ['North', 'South'] },
      ],
    });
    expect(out.fields.map((f) => f.name)).toEqual(['title', 'notes', 'cf_badge', 'cf_zone']);
    expect(out.fields[2]).toMatchObject({ label: 'Badge No.', required: true, hint: 'Site pass' });
    expect(out.fields[3].options).toEqual([
      { value: 'North', label: 'North' },
      { value: 'South', label: 'South' },
    ]);
  });

  it('a required added field is ENFORCED like any code field', () => {
    const out = applyFormOverrides(schema, {
      fields: {},
      added: [{ name: 'cf_badge', label: 'Badge No.', kind: 'text', required: true }],
    });
    expect(checkFormValid(out, { title: 'x' }).fieldErrors.cf_badge).toMatch(/required/);
    expect(Object.keys(checkFormValid(out, { title: 'x', cf_badge: 'B-77' }).fieldErrors)).toHaveLength(0);
  });

  it('a code field always wins a name clash with an added field', () => {
    const out = applyFormOverrides(schema, {
      fields: {},
      added: [{ name: 'title', label: 'Impostor', kind: 'text' }],
    });
    expect(out.fields.filter((f) => f.name === 'title')).toHaveLength(1);
    expect(out.fields[0].label).toBe('Title');
  });

  it('order re-sorts listed fields first; unlisted keep relative order after', () => {
    const out = applyFormOverrides(schema, {
      fields: {},
      added: [{ name: 'cf_zone', label: 'Zone', kind: 'text' }],
      order: ['cf_zone', 'notes'],
    });
    expect(out.fields.map((f) => f.name)).toEqual(['cf_zone', 'notes', 'title']);
    // unknown names in the order list are ignored
    const out2 = applyFormOverrides(schema, { fields: {}, order: ['ghost', 'notes'] });
    expect(out2.fields.map((f) => f.name)).toEqual(['notes', 'title']);
  });
});
