import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { uiSourceFiles } from './test-support/source-files';
import { join, relative, resolve } from 'node:path';

const WEB = resolve(__dirname);
const LEGACY_ROUTE = join(WEB, 'app', 'crm', 'my-day', 'page.tsx');
const CANONICAL_ROUTE = join(WEB, 'app', 'my-work', 'my-day', 'page.tsx');
const LEGACY_LINK = /(?<!\/api)\/crm\/my-day/;

const API_DIR = join(WEB, 'app', 'api');

function legacyLinkFindings(): string[] {
  const findings: string[] = [];
  // Reads the shared scan instead of walking the tree again: same files, same assertion, one pass.
  // The API check is kept even though the shared scan already omits `app/api`. That omission is a
  // COST decision and could be revisited; this line is the RULE — the API namespace keeps
  // `/crm/my-day` legitimately — and it must not depend on the scan continuing to skip it.
  for (const { path: file, source } of uiSourceFiles()) {
    if (file === LEGACY_ROUTE || file.startsWith(API_DIR)) continue;
    source.split('\n').forEach((line, index) => {
      if (LEGACY_LINK.test(line)) findings.push(`${relative(WEB, file).replace(/\\/g, '/')}:${index + 1}`);
    });
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
