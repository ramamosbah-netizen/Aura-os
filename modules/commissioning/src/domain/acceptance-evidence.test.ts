import { describe, expect, it } from 'vitest';
import {
  type AcceptanceMethod,
  type HandoverPackage,
  accept,
  acceptanceEvidence,
  acceptanceIsSigned,
  makeHandoverPackage,
  reject,
  submit,
} from './handover';

/**
 * HOW THE CLIENT ACCEPTED, AND WHAT PROVES IT.
 *
 * An electronic signature is not mandatory: an acceptance signed on paper at a walk-down, or
 * confirmed by email, is real, and refusing it would push people into recording a fiction. What is
 * mandatory is that the METHOD IS DECLARED and its evidence is kept — and that a `name-only`
 * acceptance can never be rendered as a signed or evidenced one.
 *
 * The distinction these tests defend is the one a certificate turns on: "has a document" and "was
 * signed" are different questions, and an emailed confirmation answers only the first.
 */

const ready = { readyToSubmit: true, items: [] as { id: string; label: string; state: string; reason: string }[] };

function submitted(submittedBy = 'u-pm'): HandoverPackage {
  return submit(makeHandoverPackage({ tenantId: 't1', projectId: 'p1', code: 'HO-01', title: 'Handover' }), ready, submittedBy);
}

const evidenceOf = (method: AcceptanceMethod) => ({ method, documentId: `doc-${method}`, hash: `sha256:${method}` });
const acceptWith = (method: AcceptanceMethod) =>
  accept(submitted(), { clientRepresentative: 'Client Rep', evidence: evidenceOf(method) }, 'u-fm');

describe('an acceptance records its method and the evidence for it', () => {
  it('keeps all three together for each declared method', () => {
    for (const method of ['electronic', 'paper', 'email'] as AcceptanceMethod[]) {
      const done = acceptWith(method);
      expect(done.acceptanceMethod, method).toBe(method);
      expect(done.acceptanceEvidenceDocumentId, method).toBe(`doc-${method}`);
      expect(done.acceptanceEvidenceHash, method).toBe(`sha256:${method}`);
    }
  });

  it('accepts with no evidence at all, which is the legacy name-only record', () => {
    // Kept deliberately: an acceptance recorded before this contract existed is still an
    // acceptance, and refusing it retroactively would be a worse record, not a better one.
    const done = accept(submitted(), { clientRepresentative: 'Client Rep' }, 'u-fm');
    expect(done.status).toBe('accepted');
    expect(done.acceptanceMethod).toBeNull();
    expect(done.acceptanceEvidenceDocumentId).toBeNull();
  });

  it('refuses a method that is not one of the three', () => {
    expect(() => accept(submitted(), {
      clientRepresentative: 'C',
      evidence: { method: 'verbal' as AcceptanceMethod, documentId: 'd', hash: 'h' },
    }, 'u-fm')).toThrow(/must be one of electronic, paper, email/i);
  });

  it('refuses a method with no document, and a document with no checksum', () => {
    // A method with no document is a claim about proof that does not exist; a reference with no
    // hash cannot be checked against the bytes. Either alone LOOKS like evidence.
    expect(() => accept(submitted(), { clientRepresentative: 'C', evidence: { method: 'paper', documentId: '', hash: 'h' } }, 'u-fm'))
      .toThrow(/requires both the stored evidence and its checksum/i);
    expect(() => accept(submitted(), { clientRepresentative: 'C', evidence: { method: 'paper', documentId: 'd', hash: '  ' } }, 'u-fm'))
      .toThrow(/requires both the stored evidence and its checksum/i);
  });

  it('still refuses the submitter, and still needs the client representative', () => {
    // The older rules are not weakened by the new one: evidence is not a way around the
    // separation, and a document does not name who accepted.
    expect(() => accept(submitted('u-pm'), { clientRepresentative: 'C', evidence: evidenceOf('electronic') }, 'u-pm'))
      .toThrow(/may not accept it/i);
    expect(() => accept(submitted(), { clientRepresentative: ' ', evidence: evidenceOf('electronic') }, 'u-fm'))
      .toThrow(/client representative is required/i);
  });
});

describe('what a surface is allowed to say about it', () => {
  it('says nothing about a package that has not been accepted', () => {
    expect(acceptanceEvidence(makeHandoverPackage({ tenantId: 't1', projectId: 'p1', code: 'HO-01', title: 'H' }))).toBeNull();
    expect(acceptanceEvidence(submitted())).toBeNull();
    expect(acceptanceEvidence(reject(submitted(), 'missing O&M'))).toBeNull();
  });

  it('reports each method as itself, because they are not interchangeable on a document', () => {
    expect(acceptanceEvidence(acceptWith('electronic'))).toBe('electronic');
    expect(acceptanceEvidence(acceptWith('paper'))).toBe('paper');
    expect(acceptanceEvidence(acceptWith('email'))).toBe('email');
  });

  it('reports a name-only acceptance as its own answer, never as a weaker signature', () => {
    const done = accept(submitted(), { clientRepresentative: 'C' }, 'u-fm');
    expect(acceptanceEvidence(done)).toBe('recorded-without-evidence');
  });

  it('calls only an electronic or paper acceptance SIGNED', () => {
    // The rule a certificate turns on. An emailed confirmation proves the client accepted and
    // proves nothing about a signature; printing it under a signature block would manufacture one.
    expect(acceptanceIsSigned(acceptWith('electronic'))).toBe(true);
    expect(acceptanceIsSigned(acceptWith('paper'))).toBe(true);
    expect(acceptanceIsSigned(acceptWith('email'))).toBe(false);
    expect(acceptanceIsSigned(accept(submitted(), { clientRepresentative: 'C' }, 'u-fm'))).toBe(false);
  });

  it('claims less, not more, if a half-record is ever seen', () => {
    // Impossible through `accept`. If some other path ever writes one, the safe direction is to
    // report no evidence rather than trust a method whose document is missing.
    const done = acceptWith('paper');
    expect(acceptanceEvidence({ ...done, acceptanceEvidenceDocumentId: null })).toBe('recorded-without-evidence');
    expect(acceptanceIsSigned({ ...done, acceptanceEvidenceDocumentId: null })).toBe(false);
    expect(acceptanceEvidence({ ...done, acceptanceMethod: null })).toBe('recorded-without-evidence');
  });
});
