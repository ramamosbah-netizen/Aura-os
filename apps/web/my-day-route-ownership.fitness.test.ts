import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const WEB = resolve(__dirname);
const ROOTS = ['app', 'components', 'lib'];
const LEGACY_ROUTE = join(WEB, 'app', 'crm', 'my-day', 'page.tsx');
const CANONICAL_ROUTE = join(WEB, 'app', 'my-work', 'my-day', 'page.tsx');
const LEGACY_LINK = /(?<!\/api)\/crm\/my-day/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'e2e') continue;
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) walk(file, out);
    else if (/\.tsx?$/.test(file) && !/\.(test|spec)\.tsx?$/.test(file)) out.push(file);
  }
  return out;
}

function legacyLinkFindings(): string[] {
  const findings: string[] = [];
  for (const root of ROOTS) {
    for (const file of walk(join(WEB, root))) {
      if (file === LEGACY_ROUTE || file.startsWith(join(WEB, 'app', 'api'))) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (LEGACY_LINK.test(line)) findings.push(`${relative(WEB, file).replace(/\\/g, '/')}:${index + 1}`);
      });
    }
  }
  return findings;
}

describe('canonical My Day ownership', () => {
  it('keeps My Day under the personal My Work namespace', () => {
    expect(existsSync(CANONICAL_ROUTE)).toBe(true);
  });

  it('keeps the CRM route as a query-preserving compatibility redirect only', () => {
    const source = readFileSync(LEGACY_ROUTE, 'utf8');
    expect(source).toContain("import { permanentRedirect } from 'next/navigation'");
    expect(source).toContain('new URLSearchParams()');
    expect(source).toContain('permanentRedirect(`/my-work/my-day');
    expect(source).not.toMatch(/MyDayCommandCenter|getJson|<main|<section/);
  });

  it('prevents internal links from restoring CRM ownership of My Day', () => {
    const findings = legacyLinkFindings();
    expect(
      findings,
      `My Day ownership violation: link to /my-work/my-day. The old /crm/my-day route is compatibility-only.\n\nOffending:\n  ${findings.join('\n  ')}`,
    ).toEqual([]);
  });
});
