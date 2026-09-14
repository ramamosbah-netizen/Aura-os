import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { inventory, helperCalls } from '../../../scripts/service-auth-inventory.mjs';
import classification from './service-scope-classification.json';
import lineage from './service-scope-helper-lineage.json';

const root=resolve(__dirname,'../../..');
describe('service authorization architecture — classified ownership, not a projectId spelling rule',()=>{
  it('accounts for 59 service assertions plus the shared Projects helper, with no silent additions/removals',()=>{
    const actual=inventory(root);
    expect(actual.filter(r=>r.file.endsWith('.service.ts'))).toHaveLength(59);
    expect(actual.map(r=>r.key).sort()).toEqual(classification.map(r=>r.key).sort());
    expect(new Set(classification.map(r=>r.key)).size).toBe(60);
    expect(actual.filter(r=>r.file.startsWith('modules/commissioning/'))).toHaveLength(0);
  });
  it('pins each reviewed target and canonical validation/load source, including intentional non-project authority',()=>{
    for(const actual of inventory(root)) {
      const declared=classification.find(r=>r.key===actual.key);
      expect(declared,actual.key).toBeDefined();
      expect({target:actual.target,checks:actual.checks,provenance:actual.provenance},actual.key).toEqual(declared!.security);
      expect(declared!.resolution.length).toBeGreaterThan(40);
      expect(declared!.evidence).toBeTruthy();
    }
    expect(classification.filter(r=>r.classification==='NOT_PROJECT_OWNED').map(r=>r.key)).toEqual([
      'modules/hse/src/hse.service.ts#recordSafetyTraining',
    ]);
    expect(classification.filter(r=>r.organizationBranch).map(r=>r.key).sort()).toEqual([
      'modules/quality/src/quality.service.ts#recordCalibration',
      'modules/quality/src/quality.service.ts#scheduleAudit',
    ]);
  });
  it('pins helper consumers so a caller cannot omit scope or replace a persisted parent with request data',()=>{
    expect(helperCalls(root)).toEqual(lineage);
    expect(lineage.length).toBeGreaterThan(25);
  });
  it('keeps creation validation wired through the module that owns Projects',()=>{
    const providers=readFileSync(resolve(root,'modules/projects/src/project-resolvers.ts'),'utf8');
    expect(providers).toContain('registerProjectLookup');
    expect(providers).toContain('project.tenantId === tenantId');
    const core=readFileSync(resolve(root,'core/src/core.module.ts'),'utf8');
    expect(core.match(/ProjectResolverRegistry/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
