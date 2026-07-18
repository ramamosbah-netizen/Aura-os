// @aura/shared/forms — metadata-driven form platform, framework-free core.
//
// A FormSchema is pure, JSON-serializable data: no functions, no React. That is
// the load-bearing constraint — the same schema object works as code-defined
// metadata today, can be persisted to a database by the no-code designer, can be
// evaluated server-side for API validation, and can be shipped to any renderer.
// Extension points that need behavior (custom validators, formula functions,
// field-type renderers) are referenced BY ID and resolved through registries.

export interface FormSelectOption {
  value: string;
  label: string;
  /** picking this option prefills these form fields (only where still empty) */
  fills?: Record<string, string>;
  /** picking this option merges these keys straight into the submit payload */
  extra?: Record<string, string | number | null>;
}

/**
 * Built-in kinds match the legacy CreateDrawer set. The type stays open
 * (`string & {}`) so plugins can register custom kinds without touching core.
 */
export type FormFieldKind =
  | 'text'
  | 'number'
  | 'select'
  | 'date'
  | 'textarea'
  | 'lines'
  | (string & {});

export interface FieldValidation {
  type: 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  /** threshold for min/max/minLength/maxLength, source for pattern (regex) */
  value?: number | string;
  /** registry id of a plugin validator (type: 'custom') */
  validator?: string;
  /** user-facing message; a sensible default is generated when omitted */
  message?: string;
}

export interface FormFieldSchema {
  /** payload key the value is posted under */
  name: string;
  label: string;
  kind: FormFieldKind;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: FormSelectOption[];
  /** for selects: also post the chosen option's label under this payload key */
  labelField?: string;
  /** grid width — form body is a 2-col grid on desktop, 1-col on narrow screens */
  span?: 1 | 2;
  defaultValue?: string;
  /** payload transform: 'csv' splits into a trimmed string array; 'isoDate' posts an ISO timestamp */
  transform?: 'csv' | 'isoDate';
  /** display-only (e.g. computed totals) — excluded from the submit payload */
  transient?: boolean;
  /** payload type for custom kinds; defaults to number for kind 'number', else string */
  dataType?: 'string' | 'number';
  /** statically read-only (rules can also disable dynamically) */
  readonly?: boolean;
  /** statically hidden (rules can also hide dynamically) */
  hidden?: boolean;
  /** permission key — the renderer hides the field unless the session grants it */
  permission?: string;
  validation?: FieldValidation[];
  /**
   * Expression that computes this field from others, e.g. "quantity * rate".
   * A field with a formula renders read-only. See formula.ts for the language.
   */
  formula?: string;
}

/* ── Layout ──────────────────────────────────────────────────────────────── */

export interface LayoutTab {
  id?: string;
  label: string;
  children: LayoutNode[];
}

export interface LayoutPanel {
  id?: string;
  label: string;
  collapsed?: boolean;
  children: LayoutNode[];
}

export type LayoutNode =
  | { type: 'field'; name: string }
  | {
      type: 'section';
      id?: string;
      label?: string;
      description?: string;
      collapsible?: boolean;
      collapsed?: boolean;
      children: LayoutNode[];
    }
  | { type: 'columns'; id?: string; columns: LayoutNode[][] }
  | { type: 'tabs'; id?: string; tabs: LayoutTab[] }
  | { type: 'accordion'; id?: string; panels: LayoutPanel[] }
  | { type: 'card'; id?: string; label?: string; children: LayoutNode[] };

/* ── Business rules ──────────────────────────────────────────────────────── */

export type ConditionOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'empty'
  | 'notEmpty'
  | 'in';

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: string; op: ConditionOp; value?: unknown };

export type RuleActionType =
  | 'show'
  | 'hide'
  | 'enable'
  | 'disable'
  | 'require'
  | 'unrequire'
  | 'clear'
  | 'set'
  | 'warn'
  | 'error';

export interface RuleAction {
  type: RuleActionType;
  /** target field (required for everything except warn/error) */
  field?: string;
  /** for 'set' */
  value?: string | number;
  /** for 'warn' / 'error' */
  message?: string;
}

export interface FormRule {
  id?: string;
  description?: string;
  when: Condition;
  actions: RuleAction[];
  /**
   * Applied when `when` is false. When omitted, state actions
   * (show/hide/enable/disable/require/unrequire) auto-invert so rules behave
   * declaratively; set/clear/warn/error do NOT auto-invert.
   */
  otherwise?: RuleAction[];
}

/* ── Root schema ─────────────────────────────────────────────────────────── */

export interface FormSchema {
  /** stable id, e.g. 'hr.employee' — key for registries and persistence */
  id: string;
  /** entity noun for titles/toasts, e.g. "Employee" */
  entity: string;
  /** BFF route: POST for create, PATCH (endpoint + /:id handled by caller) for edit */
  endpoint: string;
  subtitle?: string;
  version?: number;
  fields: FormFieldSchema[];
  /** when omitted, the renderer falls back to a flat 2-col grid of all fields */
  layout?: LayoutNode[];
  rules?: FormRule[];
  /**
   * Where to send the user after a successful CREATE. A path template with `:id`
   * substituted from the created record's id (e.g. '/crm/quotations/:id/pricing').
   * Ignored on edit. Lets a create hand straight off to the next step of the flow.
   */
  createdRedirect?: string;
}

/** Every field name referenced anywhere in a layout tree, in order. */
export function layoutFieldNames(nodes: LayoutNode[]): string[] {
  const out: string[] = [];
  const walk = (list: LayoutNode[]) => {
    for (const n of list) {
      if (n.type === 'field') out.push(n.name);
      else if (n.type === 'columns') n.columns.forEach(walk);
      else if (n.type === 'tabs') n.tabs.forEach((t) => walk(t.children));
      else if (n.type === 'accordion') n.panels.forEach((p) => walk(p.children));
      else walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
