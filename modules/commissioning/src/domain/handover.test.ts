import { describe, it, expect } from 'vitest';
import {
  makeHandoverPackage,
  updateChecklist,
  submit,
  accept,
  reject,
  isReadyToSubmit,
  type HandoverPackage,
} from './handover';

function make(): HandoverPackage {
  return makeHandoverPackage({ tenantId: 't', projectId: 'p', code: 'HO-01', title: 'Tower A handover' });
}
function withCore(p: HandoverPackage): HandoverPackage {
  return updateChecklist(p, { omManuals: true, asBuilts: true, testCertificates: true });
}

describe('handover domain', () => {
  it('starts as draft with an empty checklist', () => {
    const p = make();
    expect(p.status).toBe('draft');
    expect(isReadyToSubmit(p.checklist)).toBe(false);
  });

  it('is ready to submit only once the three core deliverables are attached', () => {
    expect(isReadyToSubmit(withCore(make()).checklist)).toBe(true);
    expect(isReadyToSubmit(updateChecklist(make(), { omManuals: true, asBuilts: true }).checklist)).toBe(false);
  });

  it('blocks submit until core deliverables are attached', () => {
    expect(() => submit(make())).toThrow(/only a package/i);
  });

  it('submits when ready', () => {
    const p = submit(withCore(make()));
    expect(p.status).toBe('submitted');
    expect(p.submittedAt).toBeTruthy();
  });

  it('accept requires a client representative', () => {
    const submitted = submit(withCore(make()));
    expect(() => accept(submitted, { clientRepresentative: '' })).toThrow(/required/i);
  });

  it('accept only from submitted, and it starts the warranty clock', () => {
    expect(() => accept(withCore(make()), { clientRepresentative: 'Client' })).toThrow(/only a submitted/i);
    const done = accept(submit(withCore(make())), { clientRepresentative: 'Client Rep', warrantyMonths: 24 });
    expect(done.status).toBe('accepted');
    expect(done.clientRepresentative).toBe('Client Rep');
    expect(done.warrantyMonths).toBe(24);
    expect(done.warrantyStartDate).toBeTruthy();
  });

  it('reject only from submitted, records the reason', () => {
    const rejected = reject(submit(withCore(make())), 'missing as-builts for level 2');
    expect(rejected.status).toBe('rejected');
    expect(rejected.remarks).toMatch(/level 2/);
  });

  it('an accepted package is immutable', () => {
    const done = accept(submit(withCore(make())), { clientRepresentative: 'C' });
    expect(() => submit(done)).toThrow(/already accepted/i);
    expect(() => updateChecklist(done, { spares: true })).toThrow(/already accepted/i);
    expect(() => reject(done, 'x')).toThrow(/already accepted/i);
  });
});
