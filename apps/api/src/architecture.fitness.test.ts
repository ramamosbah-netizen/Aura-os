import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DOCUMENT_DEFINITIONS, makeDrawing, makeEngineeringDocument, makeDesignChange } from '@aura/engineering';

/**
 * Architecture Fitness Tests — make the ADRs executable, not just documents.
 *
 * These assert the *shape* of the system, not a unit of behaviour: cross-module boundaries
 * (ADR-0004), type-agnostic capabilities + declarative definitions (ADR-0017), addressable
 * aggregates (ADR-0011), and that the platform Definition Registry stays unextracted until the
 * Rule of Three fires (ADR-0011/0017). A violation here is architectural drift — fail loudly.
 */

const REPO = resolve(__dirname, '../../..');
const MODULES = [
  'amc', 'assets', 'contracts', 'crm', 'doccontrol', 'engineering', 'finance', 'fleet', 'hr',
  'hse', 'inventory', 'procurement', 'projects', 'quality', 'site', 'subcontracts', 'tendering',
];

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.turbo') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('Architecture fitness — ADR-0004: modules do not import each other', () => {
  // Pre-existing debt (cross-module imports that predate this test). Baselined so the rule is
  // enforced *going forward*; each edge should be paid down to events (ADR-0004) over time.
  // DO NOT add to this list — a new cross-module import is a design regression.
  // All cross-module import debt has been paid down — every business module imports only
  // @aura/core + @aura/shared; cross-context wiring lives at the app layer (GatesModule for the
  // quality/ITP gate ports, FinanceWiringModule for the PO-match port). Keep this set EMPTY: any
  // new module-to-module import is a design regression, route it through a port or an event.
  const KNOWN_DEBT = new Set<string>([]);

  it('introduces no new module-to-module import beyond the documented baseline', () => {
    const importRe = /(?:from|import)\s*\(?\s*['"]@aura\/([a-z]+)['"]/g;
    const edges = new Set<string>();
    for (const mod of MODULES) {
      for (const file of tsFiles(join(REPO, 'modules', mod, 'src'))) {
        const src = readFileSync(file, 'utf8');
        for (const m of src.matchAll(importRe)) {
          const target = m[1];
          if (MODULES.includes(target) && target !== mod) edges.add(`${mod}->${target}`);
        }
      }
    }
    const newViolations = [...edges].filter((e) => !KNOWN_DEBT.has(e)).sort();
    expect(newViolations, 'new cross-module import(s) — route through events (ADR-0004)').toEqual([]);

    // Keep the baseline honest: if debt was paid down, the scanner won't find that edge — remove it
    // from KNOWN_DEBT. (Also proves the scanner actually detects cross-module edges.)
    const paidDown = [...KNOWN_DEBT].filter((e) => !edges.has(e)).sort();
    expect(paidDown, 'debt fixed — delete these from KNOWN_DEBT').toEqual([]);
  });
});

describe('Architecture fitness — ADR-0017: capabilities are type-agnostic', () => {
  it('no capability branches on a docType string literal (only the registry knows types)', () => {
    // Comparing docType to another variable (a filter) is fine; comparing to a *literal*
    // (if docType === "risk_assessment") is the switch(docType) smell the registry exists to avoid.
    const literalBranch = /\bdocType\s*===\s*['"]/;
    const switchDocType = /switch\s*\(\s*[\w.]*docType\s*\)/;
    const scan = [
      ...tsFiles(join(REPO, 'modules', 'engineering', 'src')),
      ...tsFiles(join(REPO, 'apps', 'api', 'src', 'engineering')),
      join(REPO, 'apps', 'web', 'components', 'engineering-client.tsx'),
    ].filter(existsSync);
    const offenders: string[] = [];
    for (const file of scan) {
      // the registry itself is the ONE place types are named
      if (file.endsWith('engineering-document.ts')) continue;
      const src = readFileSync(file, 'utf8');
      if (literalBranch.test(src) || switchDocType.test(src)) offenders.push(file.replace(REPO, ''));
    }
    expect(offenders).toEqual([]);
  });

  it('every DocumentDefinition is declarative — data, not behaviour (no function fields)', () => {
    for (const def of Object.values(DOCUMENT_DEFINITIONS)) {
      for (const [key, value] of Object.entries(def)) {
        expect(typeof value, `${def.docType}.${key} must be declarative`).not.toBe('function');
      }
    }
  });
});

describe('Architecture fitness — ADR-0011: aggregates are addressable + tenant-scoped', () => {
  it('engineering aggregates expose id + tenantId + companyId (the addressing envelope)', () => {
    const samples = [
      makeDrawing({ tenantId: 't', projectId: 'p', code: 'C', title: 'T' }),
      makeDesignChange({ tenantId: 't', projectId: 'p', code: 'C', title: 'T' }),
      makeEngineeringDocument({ tenantId: 't', projectId: 'p', code: 'C', title: 'T', docType: 'method_statement' }),
    ];
    for (const a of samples) {
      expect(typeof a.id).toBe('string');
      expect(typeof a.tenantId).toBe('string');
      expect('companyId' in a).toBe(true); // may be null, but the field exists
    }
  });
});

describe('Architecture fitness — Rule of Three: platform Definition Registry stays unextracted', () => {
  it('DocumentDefinition lives in its owning module, not @aura/shared (one consumer today)', () => {
    // When a 2nd and 3rd module grow their own definition registries, extracting a shared one is a
    // deliberate act — update this test then. Until then, a definition registry in shared is a
    // premature framework (ADR-0011 Rule of Three, ADR-0017 scope).
    const offenders: string[] = [];
    for (const file of tsFiles(join(REPO, 'shared', 'src'))) {
      const src = readFileSync(file, 'utf8');
      if (/DocumentDefinition|DEFINITION_REGISTRY|registerDefinition/.test(src)) {
        offenders.push(file.replace(REPO, ''));
      }
    }
    expect(offenders).toEqual([]);
  });
});
