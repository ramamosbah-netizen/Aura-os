import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { uiSourceFiles } from './test-support/source-files';

/**
 * ADR-0019 architecture fitness function.
 *
 * `/projects/projects/[id]` remains a compatibility route, but no application code may
 * link to it as an owning Project page. API paths are intentionally excluded: the API
 * namespace did not move and remains the source of truth for Project data.
 */
const WEB = resolve(__dirname);
const LEGACY_ROUTE = join(WEB, 'app', 'projects', 'projects', '[id]', 'page.tsx');
const CANONICAL_CONTROLS = join(WEB, 'app', 'project', '[projectId]', 'controls', 'page.tsx');
const LEGACY_DETAIL_LINK = /(?<!\/api)\/projects\/projects\//;

const API_DIR = join(WEB, 'app', 'api');

function legacyLinkFindings(): string[] {
  const findings: string[] = [];
  // Reads the shared scan rather than walking the tree again. The walk this replaced skipped
  // `app/api` for cost; the shared scan does that now. The check below is kept regardless, because
  // it says something different — that the API namespace is EXEMPT from the ownership rule, being
  // the source of truth for Project data — and that must not rest on a performance decision.
  for (const { path: file, source } of uiSourceFiles()) {
    if (file === LEGACY_ROUTE || file.startsWith(API_DIR)) continue;
    source.split('\n').forEach((line, index) => {
      if (LEGACY_DETAIL_LINK.test(line)) {
        findings.push(`${relative(WEB, file).replace(/\\/g, '/')}:${index + 1}`);
      }
    });
  }
  return findings;
}

describe('ADR-0019 canonical Project 360 ownership', () => {
  it('keeps one canonical Project controls owner', () => {
    expect(existsSync(CANONICAL_CONTROLS)).toBe(true);
  });

  it('keeps the legacy detail route as a query-preserving redirect only', () => {
    const source = readFileSync(LEGACY_ROUTE, 'utf8');
    expect(source).toContain("import { redirect } from 'next/navigation'");
    expect(source).toContain('new URLSearchParams()');
    expect(source).toContain('next.append(key, value)');
    expect(source).toContain('redirect(`/project/${encodeURIComponent(id)}/controls');
    expect(source).not.toMatch(/Project360Client|fetchJson|getJson|<main|<section/);
  });

  it('prevents internal links from restoring the legacy Project-detail namespace', () => {
    const findings = legacyLinkFindings();
    expect(
      findings,
      `ADR-0019 violation: link Project records to /project/[projectId] (or its canonical child) instead.\n` +
        `The old /projects/projects/[id] route is compatibility-only.\n\nOffending:\n  ${findings.join('\n  ')}`,
    ).toEqual([]);
  }, 15_000);
});
