import { describe, expect, it } from 'vitest';
import {
  compileFormulas,
  evaluateCondition,
  evaluateForm,
  evaluateFormula,
  FormulaError,
  formulaDependencies,
  parseFormula,
  registerFormulaFunction,
  registerFormValidator,
  type Condition,
  type FormSchema,
} from './index';

const run = (src: string, values: Record<string, string | number> = {}, lines?: Record<string, Array<Record<string, number | string>>>) =>
  evaluateFormula(parseFormula(src), { values, lines });

describe('formula engine', () => {
  it('does arithmetic with precedence and parentheses', () => {
    expect(run('2 + 3 * 4')).toBe(14);
    expect(run('(2 + 3) * 4')).toBe(20);
    expect(run('10 / 4')).toBe(2.5);
    expect(run('10 % 3')).toBe(1);
    expect(run('-5 + 2')).toBe(-3);
  });

  it('guards division by zero instead of returning Infinity', () => {
    expect(run('10 / 0')).toBe(0);
  });

  it('reads field references and coerces numeric strings', () => {
    expect(run('quantity * rate', { quantity: '3', rate: '150.5' })).toBe(451.5);
  });

  it('supports comparisons and boolean logic', () => {
    expect(run('revenue - cost > 0 && margin >= 10', { revenue: 100, cost: 60, margin: 40 })).toBe(true);
    expect(run('NOT (a == b)', { a: '1', b: '2' })).toBe(true);
    expect(run('a = 5 OR b = 5', { a: 1, b: 5 })).toBe(true);
  });

  it('supports string functions', () => {
    expect(run('CONCAT(UPPER(first), " ", last)', { first: 'ada', last: 'Lovelace' })).toBe('ADA Lovelace');
    expect(run('LEN(TRIM(x))', { x: '  ab  ' })).toBe(2);
    expect(run('LEFT(ref, 3)', { ref: 'TND-001' })).toBe('TND');
  });

  it('supports date calculations', () => {
    expect(run('DAYS_BETWEEN("2026-07-01", "2026-07-31")')).toBe(30);
    expect(run('ADD_DAYS("2026-07-01", 14)')).toBe('2026-07-15');
    expect(run('YEAR("2026-07-03")')).toBe(2026);
  });

  it('supports IF / ROUND / MIN / MAX / COALESCE', () => {
    expect(run('IF(value > 100, "big", "small")', { value: 250 })).toBe('big');
    expect(run('ROUND(2.34567, 2)')).toBe(2.35);
    expect(run('MIN(3, 1, 2)')).toBe(1);
    expect(run('MAX(3, 1, 2)')).toBe(3);
    expect(run('COALESCE(a, b, "fallback")', { a: '', b: '' })).toBe('fallback');
  });

  it('aggregates line items with SUMLINES', () => {
    const lines = {
      items: [
        { quantity: 2, unitPrice: 100, vatRate: 5 },
        { quantity: 1, unitPrice: 50, vatRate: 5 },
      ],
    };
    expect(run('SUMLINES(items, "quantity * unitPrice")', {}, lines)).toBe(250);
    expect(run('ROUND(SUMLINES(items, "quantity * unitPrice * (1 + vatRate / 100)"), 2)', {}, lines)).toBe(262.5);
  });

  it('extracts dependencies', () => {
    expect(formulaDependencies(parseFormula('quantity * rate + IF(discount > 0, discount, 0)')).sort()).toEqual([
      'discount',
      'quantity',
      'rate',
    ]);
  });

  it('orders formulas by dependency and detects cycles', () => {
    const ordered = compileFormulas([
      { name: 'margin', formula: 'revenue - cost' },
      { name: 'marginPct', formula: 'IF(revenue > 0, ROUND(margin / revenue * 100, 1), 0)' },
      { name: 'revenue' },
      { name: 'cost' },
    ]);
    expect(ordered.map((c) => c.field)).toEqual(['margin', 'marginPct']);

    expect(() =>
      compileFormulas([
        { name: 'a', formula: 'b + 1' },
        { name: 'b', formula: 'a + 1' },
      ]),
    ).toThrow(FormulaError);
  });

  it('rejects code-like input safely', () => {
    expect(() => run('constructor.constructor("x")()')).toThrow(FormulaError);
    expect(() => run('CONSTRUCTOR("alert(1)")')).toThrow(FormulaError); // unknown function
    expect(() => parseFormula('a; b')).toThrow(FormulaError);
  });

  it('supports plugin formula functions through the registry', () => {
    registerFormulaFunction('VAT_UAE', (n) => Number(n) * 0.05);
    const schema: Pick<FormSchema, 'fields'> = {
      fields: [
        { name: 'value', label: 'Value', kind: 'number' },
        { name: 'vat', label: 'VAT', kind: 'number', formula: 'VAT_UAE(value)' },
      ],
    };
    const out = evaluateForm(schema, { value: '200' });
    expect(out.values.vat).toBe('10');
  });
});

describe('payload builder', () => {
  it('skips transient fields and types custom kinds via dataType', async () => {
    const { buildFormPayload } = await import('./payload');
    const fields = [
      { name: 'title', label: 'Title', kind: 'text' },
      { name: 'retentionPct', label: 'Retention', kind: 'percent', dataType: 'number' as const },
      { name: 'grandTotal', label: 'Total', kind: 'number', transient: true, formula: '1+1' },
    ];
    const payload = buildFormPayload(fields, { title: 'S-01', retentionPct: '10', grandTotal: '2' });
    expect(payload).toEqual({ title: 'S-01', retentionPct: 10 });
  });
});

describe('condition evaluator', () => {
  const values = { status: 'won', value: '250000', industry: '' };

  it('evaluates leaf ops', () => {
    expect(evaluateCondition({ field: 'status', op: 'eq', value: 'won' }, values)).toBe(true);
    expect(evaluateCondition({ field: 'value', op: 'gt', value: 100000 }, values)).toBe(true);
    expect(evaluateCondition({ field: 'industry', op: 'empty' }, values)).toBe(true);
    expect(evaluateCondition({ field: 'status', op: 'in', value: ['won', 'lost'] }, values)).toBe(true);
    expect(evaluateCondition({ field: 'status', op: 'contains', value: 'WO' }, values)).toBe(true);
  });

  it('evaluates all/any/not trees', () => {
    const cond: Condition = {
      all: [
        { field: 'status', op: 'eq', value: 'won' },
        { any: [{ field: 'value', op: 'gte', value: 1000000 }, { not: { field: 'industry', op: 'notEmpty' } }] },
      ],
    };
    expect(evaluateCondition(cond, values)).toBe(true);
  });
});

describe('evaluateForm', () => {
  const schema: Pick<FormSchema, 'fields' | 'rules'> = {
    fields: [
      { name: 'severity', label: 'Severity', kind: 'select', required: true },
      { name: 'rootCause', label: 'Root cause', kind: 'text' },
      { name: 'insurance', label: 'Insurance ref', kind: 'text' },
      { name: 'quantity', label: 'Qty', kind: 'number' },
      { name: 'rate', label: 'Rate', kind: 'number' },
      { name: 'subtotal', label: 'Subtotal', kind: 'number', formula: 'quantity * rate' },
      { name: 'email', label: 'Email', kind: 'text', validation: [{ type: 'custom', validator: 'email' }] },
      { name: 'discount', label: 'Discount %', kind: 'number', validation: [{ type: 'min', value: 0 }, { type: 'max', value: 100 }] },
    ],
    rules: [
      {
        when: { field: 'severity', op: 'eq', value: 'major' },
        actions: [
          { type: 'show', field: 'rootCause' },
          { type: 'require', field: 'rootCause' },
          { type: 'warn', message: 'Major severity triggers a mandatory investigation.' },
        ],
      },
      {
        when: { all: [{ field: 'severity', op: 'eq', value: 'major' }, { field: 'insurance', op: 'empty' }] },
        actions: [{ type: 'error', message: 'Major incidents need an insurance reference.' }],
      },
    ],
  };

  it('computes formulas into values', () => {
    const out = evaluateForm(schema, { severity: 'minor', quantity: '4', rate: '25' }, { skipRequired: true });
    expect(out.values.subtotal).toBe('100');
    expect(out.state.subtotal.readonly).toBe(true);
  });

  it('applies rules live: show/require/warn/error and auto-inverse', () => {
    const minor = evaluateForm(schema, { severity: 'minor' }, { skipRequired: true });
    expect(minor.state.rootCause.hidden).toBe(true); // auto-inverse of show
    expect(minor.state.rootCause.required).toBe(false);
    expect(minor.warnings).toHaveLength(0);

    const major = evaluateForm(schema, { severity: 'major' }, { skipRequired: true });
    expect(major.state.rootCause.hidden).toBe(false);
    expect(major.state.rootCause.required).toBe(true);
    expect(major.warnings).toContain('Major severity triggers a mandatory investigation.');
    expect(major.errors).toContain('Major incidents need an insurance reference.');
  });

  it('runs declarative and plugin validation', () => {
    const out = evaluateForm(schema, { severity: 'minor', email: 'not-an-email', discount: '150' }, { skipRequired: true });
    expect(out.fieldErrors.email).toMatch(/valid email/);
    expect(out.fieldErrors.discount).toMatch(/≤ 100/);
  });

  it('enforces required only when not skipped', () => {
    expect(evaluateForm(schema, {}).fieldErrors.severity).toMatch(/required/);
    expect(evaluateForm(schema, {}, { skipRequired: true }).fieldErrors.severity).toBeUndefined();
  });

  it('hides permission-gated fields unless granted', () => {
    const s: Pick<FormSchema, 'fields'> = {
      fields: [{ name: 'costPrice', label: 'Cost', kind: 'number', permission: 'finance.cost.view' }],
    };
    expect(evaluateForm(s, {}).state.costPrice.hidden).toBe(true);
    expect(evaluateForm(s, {}, { permissions: ['finance.cost.view'] }).state.costPrice.hidden).toBe(false);
  });

  it('rule set actions feed formulas (second pass)', () => {
    const s: Pick<FormSchema, 'fields' | 'rules'> = {
      fields: [
        { name: 'kind', label: 'Kind', kind: 'select' },
        { name: 'rate', label: 'Rate', kind: 'number' },
        { name: 'fee', label: 'Fee', kind: 'number', formula: 'rate * 2' },
      ],
      rules: [{ when: { field: 'kind', op: 'eq', value: 'premium' }, actions: [{ type: 'set', field: 'rate', value: 50 }] }],
    };
    const out = evaluateForm(s, { kind: 'premium', rate: '' }, { skipRequired: true });
    expect(out.values.rate).toBe('50');
    expect(out.values.fee).toBe('100');
  });

  it('supports custom registered validators', () => {
    registerFormValidator('uae-trn', (v) => (/^\d{15}$/.test(v) ? null : 'TRN must be 15 digits'));
    const s: Pick<FormSchema, 'fields'> = {
      fields: [{ name: 'trn', label: 'TRN', kind: 'text', validation: [{ type: 'custom', validator: 'uae-trn' }] }],
    };
    expect(evaluateForm(s, { trn: '12345' }).fieldErrors.trn).toBe('TRN must be 15 digits');
    expect(evaluateForm(s, { trn: '100123456789012' }).fieldErrors.trn).toBeUndefined();
  });
});
