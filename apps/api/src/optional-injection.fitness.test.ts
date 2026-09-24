import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AN @Optional() DEPENDENCY WITH A UNION TYPE MUST NAME ITS TOKEN.
 *
 * `@Optional() private readonly x: SomeService | null = null` looks like it injects SomeService.
 * It does not. With `strict` on, TypeScript reflects the union `SomeService | null` as `Object` in
 * `design:paramtypes`; Nest looks for a provider whose token is `Object`, finds none, and — because
 * the parameter is @Optional() — hands the constructor `null` instead of failing at boot. Nothing
 * logs, nothing throws, and every unit test that builds the class by hand passes, because a test
 * that calls `new X(real, real, realService)` never goes through the resolution that fails.
 *
 * `@Optional() @Inject(SomeService)` is immune: the explicit token is read in preference to the
 * reflected type. That is the only difference between a dependency that arrives and one that
 * silently does not.
 *
 * FOUND LIVE on 2026-09-24, not by reading code: the preparer of a commercial offer waived their
 * own supplier-quote evidence (201) because the requirements controller's QuotationService was null,
 * so the segregation rule never learned who the preparer was. A sweep then found EIGHT more, every
 * one measured null in the running application context:
 *
 *   AuthenticationService.audit         ZERO `auth` rows in the audit log — no login, failed login,
 *                                        password change or refresh-token replay was ever recorded
 *   PreAwardService.packages             the governance gate that closes the scope→quote bypass for
 *                                        governed deals never ran
 *   QuotationReferenceService.tenant     the explicit tenant-ownership check never ran
 *   SourcingAwardService.locks           the award lock was never taken (0358's unique index still
 *                                        prevented a double award — measured, 8 races)
 *   NotificationService.settings         every tenant notification routing setting was ignored
 *   CostLedgerService.companies          a company's base currency was never looked up
 *   CommsService.users                   deactivated users stayed channel members
 *   CommsService.events                  `comms.chat.message` was never published
 *
 * This guard fails on the NINTH, by file and parameter, before it ships.
 *
 * THE RULE, precisely: a constructor parameter carrying @Optional() and NO @Inject(...), whose type
 * annotation has a union at the top level. A non-union class type reflects correctly and is fine; a
 * union nested inside a generic (`Array<A | B>`) does not reflect as Object and is not this defect.
 */

const REPO = resolve(__dirname, '../../..');

const ROOTS = [
  'core/src', 'shared/src', 'intelligence/src', 'apps/api/src',
  ...readdirSync(join(REPO, 'modules'))
    .map((m) => `modules/${m}/src`)
    .filter((p) => { try { return statSync(join(REPO, p)).isDirectory(); } catch { return false; } }),
];

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (entry.name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(entry.name) && !entry.name.endsWith('.d.ts')) yield full;
  }
}

/** Every constructor's parameters, split at top-level commas, comments removed. */
function constructorParams(src: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf('constructor(', from);
    if (at < 0) break;
    let depth = 0;
    let body = '';
    let i = at + 'constructor'.length;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '(') { depth++; if (depth === 1) continue; }
      if (ch === ')') { depth--; if (depth === 0) break; }
      body += ch;
    }
    from = i + 1;
    const clean = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    let cur = '';
    let d = 0;
    for (const ch of clean) {
      if ('(<[{'.includes(ch)) d++;
      if (')>]}'.includes(ch)) d--;
      if (ch === ',' && d === 0) { if (cur.trim()) out.push(cur.replace(/\s+/g, ' ').trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.replace(/\s+/g, ' ').trim());
  }
  return out;
}

/** The type annotation of one parameter, up to any default initialiser. */
function typeOf(param: string): string | null {
  // Drop decorators, then find the `name:` colon at depth 0.
  const withoutDecorators = param.replace(/@\w+\([^()]*(?:\([^()]*\)[^()]*)*\)\s*/g, '');
  let depth = 0;
  for (let i = 0; i < withoutDecorators.length; i++) {
    const ch = withoutDecorators[i];
    if ('(<[{'.includes(ch)) depth++;
    if (')>]}'.includes(ch)) depth--;
    if (ch === ':' && depth === 0) {
      let type = '';
      let d = 0;
      for (const c of withoutDecorators.slice(i + 1)) {
        if ('(<[{'.includes(c)) d++;
        if (')>]}'.includes(c)) d--;
        if (c === '=' && d === 0) break;
        type += c;
      }
      return type.trim();
    }
  }
  return null;
}

function hasTopLevelUnion(type: string): boolean {
  let depth = 0;
  for (const ch of type) {
    if ('(<[{'.includes(ch)) depth++;
    if (')>]}'.includes(ch)) depth--;
    if (ch === '|' && depth === 0) return true;
  }
  return false;
}

interface Finding { file: string; param: string }

function scan(): { violations: Finding[]; declared: Finding[] } {
  const violations: Finding[] = [];
  const declared: Finding[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(join(REPO, root))) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('@Optional()') || !src.includes('constructor(')) continue;
      for (const param of constructorParams(src)) {
        if (!param.includes('@Optional()')) continue;
        const type = typeOf(param);
        if (!type || !hasTopLevelUnion(type)) continue;
        const finding = { file: relative(REPO, file).replaceAll('\\', '/'), param };
        (/@Inject\(/.test(param) ? declared : violations).push(finding);
      }
    }
  }
  return { violations, declared };
}

describe('an @Optional() dependency with a union type names its token', () => {
  const { violations, declared } = scan();

  it('finds none that would silently resolve to null', () => {
    expect(
      violations.map((v) => `${v.file}: ${v.param}`),
      'add @Inject(TheToken) beside @Optional() — without it the union reflects as Object and the ' +
        'dependency is silently null at runtime. See the comment at the top of this file.',
    ).toEqual([]);
  });

  /**
   * THE SCAN STILL SEES WHAT IT WAS WRITTEN AGAINST. A scanner that quietly stops matching reports
   * the same empty list as a clean codebase. These nine are known to exist and to be correctly
   * declared now, so their absence means the scan is broken, not that the code is clean.
   */
  it('still sees the nine it was written after, each now declaring its token', () => {
    const seen = (file: string, token: string) =>
      declared.some((d) => d.file === file && d.param.includes(`@Inject(${token})`));
    for (const [file, token] of [
      ['apps/api/src/documents/document-requirements.controller.ts', 'QuotationService'],
      ['core/src/identity/authentication.service.ts', 'AuditService'],
      ['modules/crm/src/pre-award.service.ts', 'PreAwardPackageService'],
      ['apps/api/src/crm/quotation-reference.service.ts', 'TenantContext'],
      ['modules/procurement/src/sourcing-award.service.ts', 'LockService'],
      ['core/src/notifications/notification.service.ts', 'SettingsService'],
      ['modules/projects/src/cost-ledger.service.ts', 'CompaniesService'],
      ['apps/api/src/comms/comms.service.ts', 'UsersService'],
      ['apps/api/src/comms/comms.service.ts', 'EventBus'],
    ] as const) {
      expect(seen(file, token), `${file} @Inject(${token})`).toBe(true);
    }
  });
});
