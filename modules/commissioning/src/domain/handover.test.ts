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

  // TC-GATE-4: submit is gated on the ASSESSED readiness, not on three booleans. Two of its items
  // are derived from Testing & Commissioning and Engineering and cannot be ticked, so the domain
  // function takes the assessment rather than reading the checklist itself.
  const notReady = {
    readyToSubmit: false,
    items: [{ id: 'commissioning', label: 'Systems commissioned and technically ready', state: 'BLOCKED', reason: '1 of 2 systems not commissioning ready.' }],
  };
  const ready = { readyToSubmit: true, items: [] };

  it('blocks submit while the assessed readiness is incomplete, and names what is missing', () => {
    expect(() => submit(make(), notReady)).toThrow(/handover evidence is complete/i);
    expect(() => submit(make(), notReady)).toThrow(/not commissioning ready/i);
  });

  it('submits when the assessment says ready', () => {
    const p = submit(withCore(make()), ready);
    expect(p.status).toBe('submitted');
    expect(p.submittedAt).toBeTruthy();
  });

  it('accept requires a client representative', () => {
    const submitted = submit(withCore(make()), ready);
    expect(() => accept(submitted, { clientRepresentative: '' })).toThrow(/required/i);
  });

  it('accept only from submitted, and it starts the warranty clock', () => {
    expect(() => accept(withCore(make()), { clientRepresentative: 'Client' })).toThrow(/only a submitted/i);
    const done = accept(submit(withCore(make()), ready), { clientRepresentative: 'Client Rep', warrantyMonths: 24 });
    expect(done.status).toBe('accepted');
    expect(done.clientRepresentative).toBe('Client Rep');
    expect(done.warrantyMonths).toBe(24);
    expect(done.warrantyStartDate).toBeTruthy();
  });

  it('reject only from submitted, records the reason', () => {
    const rejected = reject(submit(withCore(make()), ready), 'missing as-builts for level 2');
    expect(rejected.status).toBe('rejected');
    expect(rejected.remarks).toMatch(/level 2/);
  });

  it('an accepted package is immutable', () => {
    const done = accept(submit(withCore(make()), ready), { clientRepresentative: 'C' });
    expect(() => submit(done, ready)).toThrow(/already accepted/i);
    expect(() => updateChecklist(done, { spares: true })).toThrow(/already accepted/i);
    expect(() => reject(done, 'x')).toThrow(/already accepted/i);
  });
});
