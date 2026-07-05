'use client';

// FormRenderer — draws a FormSchema: metadata in, live form out. Layout nodes
// (sections, columns, tabs, accordions, cards, collapsible groups) recurse;
// leaves resolve through the field-type registry; every change re-runs the
// shared evaluateForm() so rules and formulas react live with no reload.

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  evaluateForm,
  layoutFieldNames,
  resolveFieldDefaults,
  type FormEvaluation,
  type FormLineItem,
  type FormSchema,
  type FormSelectOption,
  type FormulaValue,
  type LayoutNode,
} from '@aura/shared';
import { EMPTY_LINE, getFieldRenderer } from './field-registry';

export interface UseFormEngineOptions {
  initialValues?: Record<string, string>;
  /** prefill for lines fields (edit/clone/view of records that carry line items) */
  initialLines?: Record<string, FormLineItem[]>;
  permissions?: string[];
}

export interface FormEngine {
  schema: FormSchema;
  values: Record<string, string>;
  lines: Record<string, FormLineItem[]>;
  touched: boolean;
  evaluation: FormEvaluation;
  setField: (name: string, value: string, option?: FormSelectOption) => void;
  setValues: (patch: Record<string, string>) => void;
  setLines: (field: string, rows: FormLineItem[]) => void;
  setTouched: (t: boolean) => void;
  reset: () => void;
  /** full evaluation with required checks enforced — call on submit */
  evaluateForSubmit: () => FormEvaluation;
  formulaLines: Record<string, Array<Record<string, FormulaValue>>>;
}

function initialLinesFor(schema: FormSchema, initial?: Record<string, FormLineItem[]>): Record<string, FormLineItem[]> {
  const out: Record<string, FormLineItem[]> = {};
  for (const f of schema.fields) {
    if (f.kind !== 'lines') continue;
    const rows = initial?.[f.name];
    out[f.name] = rows && rows.length > 0 ? rows.map((r) => ({ ...r })) : [{ ...EMPTY_LINE }];
  }
  return out;
}

const defaultsFor = (schema: FormSchema, initial?: Record<string, string>) =>
  resolveFieldDefaults(schema.fields, initial);

export function useFormEngine(schema: FormSchema, opts: UseFormEngineOptions = {}): FormEngine {
  const [values, setValuesState] = useState<Record<string, string>>(() => defaultsFor(schema, opts.initialValues));
  const [lines, setLinesState] = useState<Record<string, FormLineItem[]>>(() => initialLinesFor(schema, opts.initialLines));
  const [touched, setTouched] = useState(false);

  // line rows as plain records so formulas can SUMLINES() over them
  const formulaLines = useMemo(() => {
    const out: Record<string, Array<Record<string, FormulaValue>>> = {};
    for (const [k, rows] of Object.entries(lines)) out[k] = rows.map((r) => ({ ...r }));
    return out;
  }, [lines]);

  const evaluation = useMemo(
    () =>
      evaluateForm(schema, values, {
        lines: formulaLines,
        permissions: opts.permissions,
        skipRequired: !touched,
      }),
    [schema, values, formulaLines, opts.permissions, touched],
  );

  const setField = (name: string, value: string, option?: FormSelectOption) => {
    setValuesState((v) => {
      const next = { ...v, [name]: value };
      if (option?.fills) {
        for (const [k, fill] of Object.entries(option.fills)) if (!next[k]?.trim()) next[k] = fill;
      }
      return next;
    });
  };

  return {
    schema,
    values,
    lines,
    touched,
    evaluation,
    setField,
    setValues: (patch) => setValuesState((v) => ({ ...v, ...patch })),
    setLines: (field, rows) => setLinesState((m) => ({ ...m, [field]: rows })),
    setTouched,
    reset: () => {
      setValuesState(defaultsFor(schema, opts.initialValues));
      setLinesState(initialLinesFor(schema, opts.initialLines));
      setTouched(false);
    },
    evaluateForSubmit: () =>
      evaluateForm(schema, values, { lines: formulaLines, permissions: opts.permissions }),
    formulaLines,
  };
}

/* ── Rendering ───────────────────────────────────────────────────────────── */

interface FormRendererProps {
  engine: FormEngine;
  busy?: boolean;
}

export default function FormRenderer({ engine, busy = false }: FormRendererProps) {
  const { schema } = engine;
  const layout: LayoutNode[] = useMemo(() => {
    if (schema.layout && schema.layout.length > 0) {
      // fields not placed in the layout still render, appended at the end —
      // metadata mistakes must never silently drop data entry
      const placed = new Set(layoutFieldNames(schema.layout));
      const rest = schema.fields.filter((f) => !placed.has(f.name)).map(
        (f): LayoutNode => ({ type: 'field', name: f.name }),
      );
      return rest.length > 0 ? [...schema.layout, ...rest] : schema.layout;
    }
    return schema.fields.map((f): LayoutNode => ({ type: 'field', name: f.name }));
  }, [schema]);

  return <LayoutList nodes={layout} engine={engine} busy={busy} path="root" grid />;
}

function LayoutList({
  nodes,
  engine,
  busy,
  path,
  grid,
}: {
  nodes: LayoutNode[];
  engine: FormEngine;
  busy: boolean;
  path: string;
  grid?: boolean;
}) {
  const children = nodes.map((n, i) => (
    <LayoutNodeView key={nodeKey(n, i)} node={n} engine={engine} busy={busy} path={`${path}.${i}`} />
  ));
  return grid ? <div className="fe-grid">{children}</div> : <>{children}</>;
}

function nodeKey(n: LayoutNode, i: number): string {
  if (n.type === 'field') return `f:${n.name}`;
  return `${n.type}:${'id' in n && n.id ? n.id : i}`;
}

function LayoutNodeView({
  node,
  engine,
  busy,
  path,
}: {
  node: LayoutNode;
  engine: FormEngine;
  busy: boolean;
  path: string;
}): ReactNode {
  const [activeTab, setActiveTab] = useState(0);
  const [collapsed, setCollapsed] = useState<boolean>(
    (node.type === 'section' && node.collapsed) === true,
  );
  const [openPanels, setOpenPanels] = useState<Record<number, boolean>>(() =>
    node.type === 'accordion'
      ? Object.fromEntries(node.panels.map((p, i) => [i, p.collapsed !== true]))
      : {},
  );

  switch (node.type) {
    case 'field':
      return <FieldView name={node.name} engine={engine} busy={busy} />;

    case 'section':
      return (
        <div className="fe-section span-2">
          {node.label ? (
            node.collapsible ? (
              <button type="button" className="fe-section-head fe-collapsible" onClick={() => setCollapsed((c) => !c)}>
                <span className={`fe-chevron${collapsed ? '' : ' open'}`}>▸</span>
                {node.label}
              </button>
            ) : (
              <div className="fe-section-head">{node.label}</div>
            )
          ) : null}
          {node.description ? <p className="fe-section-desc">{node.description}</p> : null}
          {!collapsed ? <LayoutList nodes={node.children} engine={engine} busy={busy} path={path} grid /> : null}
        </div>
      );

    case 'columns':
      return (
        <div className="fe-columns span-2" style={{ gridTemplateColumns: `repeat(${node.columns.length}, 1fr)` }}>
          {node.columns.map((col, i) => (
            <div key={i} className="fe-column">
              <LayoutList nodes={col} engine={engine} busy={busy} path={`${path}.c${i}`} grid />
            </div>
          ))}
        </div>
      );

    case 'tabs':
      return (
        <div className="fe-tabs span-2">
          <div className="fe-tabbar" role="tablist">
            {node.tabs.map((t, i) => (
              <button
                key={t.id ?? i}
                type="button"
                role="tab"
                aria-selected={activeTab === i}
                className={`fe-tab${activeTab === i ? ' active' : ''}`}
                onClick={() => setActiveTab(i)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {node.tabs.map((t, i) => (
            <div key={t.id ?? i} role="tabpanel" hidden={activeTab !== i}>
              <LayoutList nodes={t.children} engine={engine} busy={busy} path={`${path}.t${i}`} grid />
            </div>
          ))}
        </div>
      );

    case 'accordion':
      return (
        <div className="fe-accordion span-2">
          {node.panels.map((p, i) => (
            <div key={p.id ?? i} className="fe-panel">
              <button
                type="button"
                className="fe-section-head fe-collapsible"
                onClick={() => setOpenPanels((s) => ({ ...s, [i]: !s[i] }))}
              >
                <span className={`fe-chevron${openPanels[i] ? ' open' : ''}`}>▸</span>
                {p.label}
              </button>
              {openPanels[i] ? <LayoutList nodes={p.children} engine={engine} busy={busy} path={`${path}.p${i}`} grid /> : null}
            </div>
          ))}
        </div>
      );

    case 'card':
      return (
        <div className="fe-card span-2">
          {node.label ? <div className="fe-section-head">{node.label}</div> : null}
          <LayoutList nodes={node.children} engine={engine} busy={busy} path={path} grid />
        </div>
      );
  }
}

function FieldView({ name, engine, busy }: { name: string; engine: FormEngine; busy: boolean }) {
  const field = engine.schema.fields.find((f) => f.name === name);
  if (!field) return null;

  const st = engine.evaluation.state[field.name];
  if (st?.hidden) return null;

  const renderer = getFieldRenderer(field.kind) ?? getFieldRenderer('text')!;
  const fieldError = engine.touched ? engine.evaluation.fieldErrors[field.name] : undefined;
  const formulaError = engine.evaluation.formulaErrors[field.name];
  const span = field.span ?? (field.kind === 'textarea' || field.kind === 'lines' ? 2 : 1);
  const disabled = busy || st?.disabled === true || st?.readonly === true;
  // computed / rule-set values come from the evaluation, user input from state
  const value = field.formula ? (engine.evaluation.values[field.name] ?? '') : (engine.values[field.name] ?? '');

  return (
    <div className={`field${span === 2 ? ' span-2' : ''}`}>
      <label className="field-label">
        {field.label}
        {st?.required ? <span className="req">*</span> : null}
      </label>
      {renderer({
        field,
        value,
        onChange: (v, option) => engine.setField(field.name, v, option),
        disabled,
        invalid: fieldError !== undefined,
        lines: field.kind === 'lines' ? engine.lines[field.name] : undefined,
        onLinesChange: field.kind === 'lines' ? (rows) => engine.setLines(field.name, rows) : undefined,
      })}
      {fieldError ? <span className="field-hint fe-field-error">{fieldError}</span> : null}
      {formulaError ? <span className="field-hint fe-field-error">Formula: {formulaError}</span> : null}
      {field.hint && !fieldError ? <span className="field-hint">{field.hint}</span> : null}
    </div>
  );
}
