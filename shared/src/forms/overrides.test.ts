import { describe, it, expect } from 'vitest';
import { applyFormOverrides, hasOverrides, validateFormOverrides } from './overrides';
import { checkFormValid } from './enforce';
import { evaluateForm } from './evaluate';
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

describe('applyFormOverrides (Form Designer P3 — formulas, validation, rules, layout)', () => {
  const numSchema: FormSchema = {
    id: 't.calc',
    entity: 'Calc',
    endpoint: '/api/calc',
    fields: [
      { name: 'qty', label: 'Qty', kind: 'number' },
      { name: 'rate', label: 'Rate', kind: 'number' },
      { name: 'total', label: 'Total', kind: 'number' },
    ],
  };

  it('an override formula computes live and renders read-only', () => {
    const out = applyFormOverrides(numSchema, { fields: { total: { formula: 'qty * rate' } } });
    const ev = evaluateForm(out, { qty: '3', rate: '25', total: '' });
    expect(ev.values.total).toBe('75');
    expect(ev.state.total.readonly).toBe(true);
  });

  it('an empty-string formula CLEARS a code formula (field editable again)', () => {
    const withCode: FormSchema = {
      ...numSchema,
      fields: [numSchema.fields[0], numSchema.fields[1], { ...numSchema.fields[2], formula: 'qty * rate' }],
    };
    const out = applyFormOverrides(withCode, { fields: { total: { formula: '' } } });
    expect(out.fields[2].formula).toBeUndefined();
    expect(evaluateForm(out, { qty: '3', rate: '25', total: '9' }).state.total.readonly).toBe(false);
  });

  it('override validation replaces code validation and is enforced', () => {
    const out = applyFormOverrides(numSchema, {
      fields: { qty: { validation: [{ type: 'min', value: 1, message: 'Qty must be positive' }] } },
    });
    expect(checkFormValid(out, { qty: '0' }).fieldErrors.qty).toBe('Qty must be positive');
    expect(Object.keys(checkFormValid(out, { qty: '2' }).fieldErrors)).toHaveLength(0);
  });

  it('designer rules append after code rules and enforce (error + require)', () => {
    const out = applyFormOverrides(numSchema, {
      fields: {},
      rules: [
        {
          description: 'big orders need a rate',
          when: { field: 'qty', op: 'gt', value: 100 },
          actions: [
            { type: 'require', field: 'rate' },
            { type: 'error', message: 'Orders over 100 need review' },
          ],
        },
      ],
    });
    const bad = checkFormValid(out, { qty: '150' });
    expect(bad.errors).toContain('Orders over 100 need review');
    expect(bad.fieldErrors.rate).toMatch(/required/);
    expect(checkFormValid(out, { qty: '5' }).errors).toHaveLength(0);
  });

  it('a designer layout replaces the code layout; rules/layout count as overrides', () => {
    const layout = [{ type: 'section' as const, label: 'Pricing', children: [{ type: 'field' as const, name: 'qty' }] }];
    const out = applyFormOverrides(numSchema, { fields: {}, layout });
    expect(out.layout).toEqual(layout);
    expect(hasOverrides({ fields: {}, layout })).toBe(true);
    expect(hasOverrides({ fields: {}, rules: [{ when: { field: 'qty', op: 'empty' }, actions: [] }] })).toBe(true);
  });
});

describe('validateFormOverrides (P3 draft validation)', () => {
  it('accepts a clean draft', () => {
    expect(
      validateFormOverrides(schema, {
        fields: { notes: { formula: 'title', validation: [{ type: 'maxLength', value: 10 }] } },
        added: [{ name: 'cf_score', label: 'Score', kind: 'number', formula: 'LEN(title)' }],
        rules: [{ when: { field: 'title', op: 'notEmpty' }, actions: [{ type: 'require', field: 'notes' }] }],
        layout: [{ type: 'section', label: 'Main', children: [{ type: 'field', name: 'title' }] }],
      }),
    ).toEqual([]);
  });

  it('flags formula parse errors and unknown field refs (code + added)', () => {
    const problems = validateFormOverrides(schema, {
      fields: { notes: { formula: 'title +' } },
      added: [{ name: 'cf_x', label: 'X', kind: 'number', formula: 'ghost * 2' }],
    });
    expect(problems.some((p) => p.startsWith('field notes: formula error'))).toBe(true);
    expect(problems).toContain('field cf_x: formula references unknown field "ghost"');
  });

  it('flags bad validation values and broken regex patterns', () => {
    const problems = validateFormOverrides(schema, {
      fields: {
        title: { validation: [{ type: 'min', value: 'abc' }, { type: 'pattern', value: '(' }] },
      },
    });
    expect(problems).toContain('field title: min needs a numeric value');
    expect(problems).toContain('field title: invalid pattern regex');
  });

  it('flags rules with unknown fields, missing actions, and message-less errors', () => {
    const problems = validateFormOverrides(schema, {
      fields: {},
      rules: [
        { when: { field: 'ghost', op: 'eq', value: 'x' }, actions: [] },
        { when: { field: 'title', op: 'notEmpty' }, actions: [{ type: 'hide', field: 'phantom' }, { type: 'error' }] },
      ],
    });
    expect(problems).toContain('rule 1: condition references unknown field "ghost"');
    expect(problems).toContain('rule 1: needs at least one action');
    expect(problems).toContain('rule 2: action targets unknown field "phantom"');
    expect(problems).toContain('rule 2: action "error" needs a message');
  });

  it('flags layout placing unknown or duplicate fields', () => {
    const problems = validateFormOverrides(schema, {
      fields: {},
      layout: [
        {
          type: 'section',
          label: 'S',
          children: [
            { type: 'field', name: 'title' },
            { type: 'field', name: 'title' },
            { type: 'field', name: 'ghost' },
          ],
        },
      ],
    });
    expect(problems).toContain('layout places field "title" twice');
    expect(problems).toContain('layout places unknown field "ghost"');
  });
});
