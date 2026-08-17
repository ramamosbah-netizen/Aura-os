import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * ADR-0019 architecture fitness function.
 *
 * `/projects/projects/[id]` remains a compatibility route, but no application code may
 * link to it as an owning Project page. API paths are intentionally excluded: the API
 * namespace did not move and remains the source of truth for Project data.
 */
const WEB = resolve(__dirname);
const ROOTS = ['app', 'components', 'lib'];
const LEGACY_ROUTE = join(WEB, 'app', 'projects', 'projects', '[id]', 'page.tsx');
const CANONICAL_CONTROLS = join(WEB, 'app', 'project', '[projectId]', 'controls', 'page.tsx');
const LEGACY_DETAIL_LINK = /(?<!\/api)\/projects\/projects\//;

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
      if (file === LEGACY_ROUTE) continue;
      if (file.startsWith(join(WEB, 'app', 'api'))) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (LEGACY_DETAIL_LINK.test(line)) {
          findings.push(`${relative(WEB, file).replace(/\\/g, '/')}:${index + 1}`);
        }
      });
    }
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
  });
});
