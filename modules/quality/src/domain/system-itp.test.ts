import { describe, expect, it } from 'vitest';
import { ELV_SYSTEMS } from '@aura/shared';
import { activateItp, closeItp, makeItp, recordPointResult } from './itp';
import { editTemplateDraft, makeItpTemplate, publishTemplate, retireTemplate, templateCoverage, type ChecklistPointInput } from './itp-template';
import { approveSystemItp, editSystemItp, prepareSystemItp, returnSystemItp, reviseSystemItp, submitSystemItp, supersedeSystemItp } from './system-itp';

// Points written for THIS test, by the test — the product ships none.
const points: ChecklistPointInput[] = [
  { code: 'CCTV-01', activity: 'Camera field of view against the approved layout', acceptanceCriteria: 'Every camera covers its drawn field of view', mandatory: true },
  { code: 'CCTV-02', activity: 'Recording retention on the NVR', acceptanceCriteria: '30 days at the specified resolution', mandatory: true },
  { code: 'CCTV-03', activity: 'Operator workstation layout review', acceptanceCriteria: 'Layout matches the approved drawing', mandatory: false },
];

const template = () => makeItpTemplate({ tenantId: 't1', system: 'cctv', version: 1, title: 'CCTV commissioning checklist', points, createdBy: 'qa-1' });
const published = () => publishTemplate(template(), 'qa-1');
const prepared = () => prepareSystemItp({ tenantId: 't1', projectId: 'p1', reference: 'ITP-CCTV', template: published(), revision: 1, createdBy: 'qa-1' });

/**
 * EVERY CANONICAL SYSTEM, THE SAME WAY (the owner's interpretation A of "every supported system").
 * The mechanism is keyed on the canonical id and nothing else: each of the 23 travels template →
 * publish → project revision → submit → independent approval identically, and `other` never does.
 * The points are this test's own — one per system, invented for no system in the product.
 */
describe('every canonical system', () => {
  const systems = ELV_SYSTEMS.filter((s) => s !== 'other');

  it('covers all 23, and each travels the same governed path to an approved revision', () => {
    expect(systems).toHaveLength(23);
    expect(templateCoverage([]).map((c) => c.system)).toEqual(systems);
    for (const system of systems) {
      const t = publishTemplate(makeItpTemplate({
        tenantId: 't1', system, version: 1, title: `${system} checklist`, createdBy: 'qa-1',
        points: [{ code: 'P-01', activity: 'Test-fixture point', acceptanceCriteria: 'Test-fixture criterion' }],
      }), 'qa-1');
      const draft = prepareSystemItp({ tenantId: 't1', projectId: 'p1', reference: `ITP-${system}`, template: t, revision: 1, createdBy: 'qa-1' });
      const submitted = submitSystemItp(draft, 'qa-1');
      expect(() => approveSystemItp(submitted, 'qa-1'), `${system}: the preparer may not approve`).toThrow(/may not approve/);
      const approved = approveSystemItp(submitted, 'qa-2');
      expect(approved, system).toMatchObject({ kind: 'system_commissioning', system, revision: 1, status: 'approved', approvedBy: 'qa-2' });
    }
  });
});

describe('the tenant template library', () => {
  it('names a canonical system — never free text, never "other"', () => {
    expect(() => makeItpTemplate({ tenantId: 't1', system: 'CCTV', version: 1, title: 'x', points })).toThrow(/canonical ELV systems/);
    expect(() => makeItpTemplate({ tenantId: 't1', system: 'other', version: 1, title: 'x', points })).toThrow(/names none/);
  });

  it('refuses a point without an acceptance criterion, and a duplicate code', () => {
    expect(() => makeItpTemplate({ tenantId: 't1', system: 'cctv', version: 1, title: 'x', points: [{ code: 'A', activity: 'a', acceptanceCriteria: ' ' }] }))
      .toThrow(/requires an acceptance criterion/);
    expect(() => makeItpTemplate({ tenantId: 't1', system: 'cctv', version: 1, title: 'x', points: [points[0], { ...points[1], code: 'cctv-01' }] }))
      .toThrow(/duplicate point code/);
  });

  it('is frozen once published — a change is the next version', () => {
    const p = published();
    expect(p.status).toBe('published');
    expect(() => editTemplateDraft(p, { title: 'changed' })).toThrow(/immutable once published/);
    expect(retireTemplate(p, 'qa-1').status).toBe('retired');
  });

  it('coverage lists every canonical system except "other", unready ones included', () => {
    const coverage = templateCoverage([published()]);
    expect(coverage.find((c) => c.system === 'cctv')?.publishedVersion).toBe(1);
    expect(coverage.find((c) => c.system === 'fire_alarm')?.publishedVersion).toBeNull();
    expect(coverage.some((c) => (c.system as string) === 'other')).toBe(false);
  });
});

describe('the project system ITP revision', () => {
  it('adopts a PUBLISHED template only, taking its system from the template', () => {
    expect(() => prepareSystemItp({ tenantId: 't1', projectId: 'p1', reference: 'R', template: template(), revision: 1, createdBy: 'qa-1' }))
      .toThrow(/only a published template can be adopted/);
    const itp = prepared();
    expect(itp).toMatchObject({ kind: 'system_commissioning', system: 'cctv', revision: 1, status: 'draft', sourceTemplateVersion: 1 });
    expect(itp.points.map((p) => [p.code, p.mandatory])).toEqual([['CCTV-01', true], ['CCTV-02', true], ['CCTV-03', false]]);
  });

  it('is adapted in draft, then frozen while under review', () => {
    const adapted = editSystemItp(prepared(), { points: [...points.slice(0, 2), { ...points[2], mandatory: true }] });
    expect(adapted.points[2].mandatory).toBe(true);
    const submitted = submitSystemItp(adapted, 'qa-1');
    expect(() => editSystemItp(submitted, { title: 'late change' })).toThrow(/can only be changed in draft/);
  });

  it('is approved by somebody other than its preparer — the author is refused, by name', () => {
    const submitted = submitSystemItp(prepared(), 'qa-1');
    expect(() => approveSystemItp(submitted, 'qa-1')).toThrow(/access denied: the person who prepared ITP revision 1 may not approve it/);
    // …nor by whoever sent it for approval, if that was somebody else.
    const sentByAnother = submitSystemItp(prepared(), 'qa-3');
    expect(() => approveSystemItp(sentByAnother, 'qa-3')).toThrow(/may not approve it/);
    const approved = approveSystemItp(submitted, 'qa-2');
    expect(approved).toMatchObject({ status: 'approved', approvedBy: 'qa-2' });
    expect(() => editSystemItp(approved, { title: 'x' })).toThrow(/immutable/);
  });

  it('can be returned to its preparer with a reason, by the reviewer only', () => {
    const submitted = submitSystemItp(prepared(), 'qa-1');
    expect(() => returnSystemItp(submitted, 'qa-2', '')).toThrow(/requires a reason/);
    expect(() => returnSystemItp(submitted, 'qa-1', 'my own')).toThrow(/may not return it/);
    expect(returnSystemItp(submitted, 'qa-2', 'Retention must be 90 days on this project')).toMatchObject({ status: 'draft', returnedReason: 'Retention must be 90 days on this project' });
  });

  it('a change is the next revision, and the approved one gives way only by supersession', () => {
    const approved = approveSystemItp(submitSystemItp(prepared(), 'qa-1'), 'qa-2');
    const next = reviseSystemItp(approved, { revision: 2, createdBy: 'qa-1' });
    expect(next).toMatchObject({ revision: 2, parentItpId: approved.id, status: 'draft', approvedBy: null });
    expect(supersedeSystemItp(approved, next.id)).toMatchObject({ status: 'superseded', supersededBy: next.id });
    expect(() => reviseSystemItp(next, { revision: 3, createdBy: 'qa-1' })).toThrow(/only the current approved revision can be revised/);
  });
});

describe('installation inspection keeps its own behaviour', () => {
  it('an installation plan still activates, records and closes; a system checklist refuses those acts', () => {
    const plan = makeItp({ tenantId: 't1', projectId: 'p1', reference: 'ITP-INST', title: 'Containment', points: [{ activity: 'Tray fixing', pointType: 'hold' }] });
    expect(plan.kind).toBe('installation_inspection');
    const active = activateItp(plan, 'qa-1');
    const recorded = recordPointResult(active, 0, 'passed');
    expect(closeItp(recorded, 'qa-1').status).toBe('closed');

    const approved = approveSystemItp(submitSystemItp(prepared(), 'qa-1'), 'qa-2');
    expect(() => activateItp(approved, 'qa-1')).toThrow(/is not allowed for a system commissioning ITP/);
    expect(() => recordPointResult(approved, 0, 'passed')).toThrow(/is not allowed for a system commissioning ITP/);
    expect(() => closeItp(approved, 'qa-1')).toThrow(/is not allowed for a system commissioning ITP/);
  });
});
