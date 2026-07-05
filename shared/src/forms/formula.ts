// Formula & expression engine for calculated fields. Hand-rolled recursive
// descent — no eval(), no dependencies — so untrusted metadata can never
// execute code. Supports math, comparisons, boolean logic, string and date
// functions, plus SUMLINES() aggregation over line-item fields.
//
// Grammar (loosest binding first):
//   or    := and  (("||" | "OR")  and)*
//   and   := not  (("&&" | "AND") not)*
//   not   := ("!" | "NOT") not | cmp
//   cmp   := add  (("==" | "=" | "!=" | ">=" | "<=" | ">" | "<") add)?
//   add   := mul  (("+" | "-") mul)*
//   mul   := unary (("*" | "/" | "%") unary)*
//   unary := "-" unary | primary
//   prim  := NUMBER | STRING | IDENT "(" args ")" | IDENT | "(" or ")"
//
// Bare identifiers are field references. TRUE/FALSE/NULL are literals.

export type FormulaValue = number | string | boolean | null;

export type FormulaFn = (...args: FormulaValue[]) => FormulaValue;

export type FormulaNode =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'null' }
  | { t: 'ref'; name: string }
  | { t: 'un'; op: '-' | '!'; a: FormulaNode }
  | { t: 'bin'; op: string; a: FormulaNode; b: FormulaNode }
  | { t: 'call'; name: string; args: FormulaNode[] };

export class FormulaError extends Error {}

const MAX_TOKENS = 512;
const MAX_DEPTH = 32;

/* ── Tokenizer ───────────────────────────────────────────────────────────── */

type Token =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'ident'; v: string }
  | { k: 'op'; v: string };

const OPS = ['==', '!=', '>=', '<=', '&&', '||', '>', '<', '=', '!', '+', '-', '*', '/', '%', '(', ')', ','];

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      const raw = src.slice(i, j).replace(/_/g, '');
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new FormulaError(`Invalid number "${raw}"`);
      out.push({ k: 'num', v });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        s += src[j] === '\\' ? src[++j] : src[j];
        j++;
      }
      if (j >= src.length) throw new FormulaError('Unterminated string');
      out.push({ k: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      out.push({ k: 'ident', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS.includes(two)) {
      out.push({ k: 'op', v: two });
      i += 2;
      continue;
    }
    if (OPS.includes(c)) {
      out.push({ k: 'op', v: c });
      i += 1;
      continue;
    }
    throw new FormulaError(`Unexpected character "${c}"`);
  }
  if (out.length > MAX_TOKENS) throw new FormulaError('Formula too long');
  return out;
}

/* ── Parser ──────────────────────────────────────────────────────────────── */

class Parser {
  private pos = 0;
  constructor(private readonly toks: Token[]) {}

  parse(): FormulaNode {
    const node = this.or(0);
    if (this.pos < this.toks.length) throw new FormulaError('Unexpected trailing input');
    return node;
  }

  private peek(): Token | undefined {
    return this.toks[this.pos];
  }

  private takeOp(...ops: string[]): string | null {
    const t = this.peek();
    if (t?.k === 'op' && ops.includes(t.v)) {
      this.pos++;
      return t.v;
    }
    if (t?.k === 'ident' && ops.includes(t.v.toUpperCase())) {
      this.pos++;
      return t.v.toUpperCase();
    }
    return null;
  }

  private or(d: number): FormulaNode {
    if (d > MAX_DEPTH) throw new FormulaError('Formula too deeply nested');
    let a = this.and(d + 1);
    while (this.takeOp('||', 'OR')) a = { t: 'bin', op: '||', a, b: this.and(d + 1) };
    return a;
  }

  private and(d: number): FormulaNode {
    let a = this.not(d + 1);
    while (this.takeOp('&&', 'AND')) a = { t: 'bin', op: '&&', a, b: this.not(d + 1) };
    return a;
  }

  private not(d: number): FormulaNode {
    if (this.takeOp('!', 'NOT')) return { t: 'un', op: '!', a: this.not(d + 1) };
    return this.cmp(d + 1);
  }

  private cmp(d: number): FormulaNode {
    const a = this.add(d + 1);
    const op = this.takeOp('==', '=', '!=', '>=', '<=', '>', '<');
    if (!op) return a;
    return { t: 'bin', op: op === '=' ? '==' : op, a, b: this.add(d + 1) };
  }

  private add(d: number): FormulaNode {
    let a = this.mul(d + 1);
    for (;;) {
      const op = this.takeOp('+', '-');
      if (!op) return a;
      a = { t: 'bin', op, a, b: this.mul(d + 1) };
    }
  }

  private mul(d: number): FormulaNode {
    let a = this.unary(d + 1);
    for (;;) {
      const op = this.takeOp('*', '/', '%');
      if (!op) return a;
      a = { t: 'bin', op, a, b: this.unary(d + 1) };
    }
  }

  private unary(d: number): FormulaNode {
    if (d > MAX_DEPTH) throw new FormulaError('Formula too deeply nested');
    if (this.takeOp('-')) return { t: 'un', op: '-', a: this.unary(d + 1) };
    return this.primary(d + 1);
  }

  private primary(d: number): FormulaNode {
    const t = this.peek();
    if (!t) throw new FormulaError('Unexpected end of formula');
    if (t.k === 'num') {
      this.pos++;
      return { t: 'num', v: t.v };
    }
    if (t.k === 'str') {
      this.pos++;
      return { t: 'str', v: t.v };
    }
    if (t.k === 'op' && t.v === '(') {
      this.pos++;
      const inner = this.or(d + 1);
      if (!this.takeOp(')')) throw new FormulaError('Missing ")"');
      return inner;
    }
    if (t.k === 'ident') {
      this.pos++;
      const upper = t.v.toUpperCase();
      if (upper === 'TRUE') return { t: 'bool', v: true };
      if (upper === 'FALSE') return { t: 'bool', v: false };
      if (upper === 'NULL') return { t: 'null' };
      if (this.takeOp('(')) {
        const args: FormulaNode[] = [];
        if (!this.takeOp(')')) {
          do args.push(this.or(d + 1));
          while (this.takeOp(','));
          if (!this.takeOp(')')) throw new FormulaError(`Missing ")" after ${t.v}(…`);
        }
        return { t: 'call', name: upper, args };
      }
      return { t: 'ref', name: t.v };
    }
    throw new FormulaError(`Unexpected token "${'v' in t ? t.v : '?'}"`);
  }
}

export function parseFormula(src: string): FormulaNode {
  return new Parser(tokenize(src)).parse();
}

/** Field names the formula reads — the edges of the dependency graph. */
export function formulaDependencies(node: FormulaNode): string[] {
  const deps = new Set<string>();
  const walk = (n: FormulaNode) => {
    if (n.t === 'ref') deps.add(n.name);
    else if (n.t === 'un') walk(n.a);
    else if (n.t === 'bin') {
      walk(n.a);
      walk(n.b);
    } else if (n.t === 'call') n.args.forEach(walk);
  };
  walk(node);
  return [...deps];
}

/* ── Evaluation ──────────────────────────────────────────────────────────── */

/** Form state stores strings; coerce numeric-looking strings for arithmetic. */
function num(v: FormulaValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new FormulaError(`"${v}" is not a number`);
  return n;
}

function str(v: FormulaValue): string {
  if (v === null) return '';
  return String(v);
}

function bool(v: FormulaValue): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null) return false;
  return v.trim() !== '' && v !== 'false' && v !== '0';
}

function toDate(v: FormulaValue): Date {
  const d = new Date(str(v));
  if (Number.isNaN(d.getTime())) throw new FormulaError(`"${str(v)}" is not a date`);
  return d;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export const BUILTIN_FUNCTIONS: Record<string, FormulaFn> = {
  IF: (c, a, b) => (bool(c ?? null) ? (a ?? null) : (b ?? null)),
  COALESCE: (...args) => args.find((a) => a !== null && a !== '') ?? null,
  ROUND: (n, digits) => {
    const f = 10 ** num(digits ?? 0);
    return Math.round(num(n ?? 0) * f) / f;
  },
  FLOOR: (n) => Math.floor(num(n ?? 0)),
  CEIL: (n) => Math.ceil(num(n ?? 0)),
  ABS: (n) => Math.abs(num(n ?? 0)),
  MIN: (...args) => Math.min(...args.map(num)),
  MAX: (...args) => Math.max(...args.map(num)),
  SUM: (...args) => args.reduce<number>((s, a) => s + num(a), 0),
  CONCAT: (...args) => args.map(str).join(''),
  UPPER: (s) => str(s ?? '').toUpperCase(),
  LOWER: (s) => str(s ?? '').toLowerCase(),
  TRIM: (s) => str(s ?? '').trim(),
  LEN: (s) => str(s ?? '').length,
  LEFT: (s, n) => str(s ?? '').slice(0, num(n ?? 0)),
  RIGHT: (s, n) => {
    const k = num(n ?? 0);
    return k <= 0 ? '' : str(s ?? '').slice(-k);
  },
  NUMBER: (v) => num(v ?? 0),
  TEXT: (v) => str(v ?? ''),
  TODAY: () => isoDay(new Date()),
  NOW: () => new Date().toISOString(),
  YEAR: (d) => toDate(d ?? null).getUTCFullYear(),
  MONTH: (d) => toDate(d ?? null).getUTCMonth() + 1,
  DAY: (d) => toDate(d ?? null).getUTCDate(),
  DAYS_BETWEEN: (a, b) =>
    Math.round((toDate(b ?? null).getTime() - toDate(a ?? null).getTime()) / 86_400_000),
  ADD_DAYS: (d, n) => {
    const base = toDate(d ?? null);
    base.setUTCDate(base.getUTCDate() + num(n ?? 0));
    return isoDay(base);
  },
};

export interface FormulaContext {
  /** field name → scalar value (strings as stored by the form) */
  values: Record<string, FormulaValue>;
  /** field name → line items, for SUMLINES */
  lines?: Record<string, Array<Record<string, FormulaValue>>>;
  /** plugin-registered functions; merged over the builtins */
  functions?: Record<string, FormulaFn>;
}

export function evaluateFormula(node: FormulaNode, ctx: FormulaContext): FormulaValue {
  const fns = ctx.functions ? { ...BUILTIN_FUNCTIONS, ...ctx.functions } : BUILTIN_FUNCTIONS;

  const ev = (n: FormulaNode): FormulaValue => {
    switch (n.t) {
      case 'num':
        return n.v;
      case 'str':
        return n.v;
      case 'bool':
        return n.v;
      case 'null':
        return null;
      case 'ref':
        return ctx.values[n.name] ?? null;
      case 'un':
        return n.op === '-' ? -num(ev(n.a)) : !bool(ev(n.a));
      case 'bin': {
        if (n.op === '&&') return bool(ev(n.a)) && bool(ev(n.b));
        if (n.op === '||') return bool(ev(n.a)) || bool(ev(n.b));
        const a = ev(n.a);
        const b = ev(n.b);
        switch (n.op) {
          case '+': {
            // numeric add when both sides are numeric-ish, else concat
            if (typeof a === 'string' && a !== '' && Number.isNaN(Number(a))) return str(a) + str(b);
            if (typeof b === 'string' && b !== '' && Number.isNaN(Number(b))) return str(a) + str(b);
            return num(a) + num(b);
          }
          case '-':
            return num(a) - num(b);
          case '*':
            return num(a) * num(b);
          case '/': {
            const d = num(b);
            return d === 0 ? 0 : num(a) / d;
          }
          case '%': {
            const d = num(b);
            return d === 0 ? 0 : num(a) % d;
          }
          case '==':
            return looseEq(a, b);
          case '!=':
            return !looseEq(a, b);
          case '>':
            return num(a) > num(b);
          case '>=':
            return num(a) >= num(b);
          case '<':
            return num(a) < num(b);
          case '<=':
            return num(a) <= num(b);
          default:
            throw new FormulaError(`Unknown operator ${n.op}`);
        }
      }
      case 'call': {
        if (n.name === 'SUMLINES') {
          // SUMLINES(linesField, "perLineExpr") — aggregates over line items
          const ref = n.args[0];
          const exprArg = n.args[1];
          if (ref?.t !== 'ref' || exprArg?.t !== 'str')
            throw new FormulaError('SUMLINES(linesField, "expr") expects a field ref and a quoted expression');
          const rows = ctx.lines?.[ref.name] ?? [];
          const lineAst = parseFormula(exprArg.v);
          return rows.reduce<number>(
            (s, row) => s + num(evaluateFormula(lineAst, { ...ctx, values: row })),
            0,
          );
        }
        const fn = fns[n.name];
        if (!fn) throw new FormulaError(`Unknown function ${n.name}()`);
        return fn(...n.args.map(ev));
      }
    }
  };

  return ev(node);
}

function looseEq(a: FormulaValue, b: FormulaValue): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === 'number' || typeof b === 'number') {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an === bn;
  }
  return str(a) === str(b);
}

/* ── Dependency ordering ─────────────────────────────────────────────────── */

export interface CompiledFormula {
  field: string;
  ast: FormulaNode;
  dependencies: string[];
}

/**
 * Parse every field formula and return them in dependency order (a formula
 * runs after the formulas it reads). Throws FormulaError on circular
 * dependencies — the guard against infinite recalculation loops.
 */
export function compileFormulas(fields: Array<{ name: string; formula?: string }>): CompiledFormula[] {
  const compiled = new Map<string, CompiledFormula>();
  for (const f of fields) {
    if (!f.formula) continue;
    const ast = parseFormula(f.formula);
    compiled.set(f.name, { field: f.name, ast, dependencies: formulaDependencies(ast) });
  }

  const ordered: CompiledFormula[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (name: string, chain: string[]) => {
    const c = compiled.get(name);
    if (!c || state.get(name) === 'done') return;
    if (state.get(name) === 'visiting')
      throw new FormulaError(`Circular formula dependency: ${[...chain, name].join(' → ')}`);
    state.set(name, 'visiting');
    for (const dep of c.dependencies) visit(dep, [...chain, name]);
    state.set(name, 'done');
    ordered.push(c);
  };
  for (const name of compiled.keys()) visit(name, []);
  return ordered;
}
