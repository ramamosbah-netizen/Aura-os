import { describe, expect, it } from 'vitest';
import {
  type HandoverPackage,
  accept,
  acceptanceEvidence,
  makeHandoverPackage,
  reject,
  submit,
} from './handover';

/**
 * THE SIGNATURE ON THE ACT THAT STARTS THE WARRANTY CLOCK.
 *
 * The acceptance screen has shown a pad labelled "Client Representative Acceptance Signature"
 * since this package existed, bound to `onChange={() => {}}`. So the entire evidence of the
 * contractual close was `clientRepresentative` — free text, typed by one of our own users, naming
 * somebody on the client's side. A name we typed is not a signature they gave.
 *
 * What is proved here is the DOMAIN's half: the pair is written together or not at all, and every
 * accepted package can say which of the two kinds of acceptance it is. Where the bytes go, who may
 * open them and what the certificate prints are proved at their own layers.
 */

const ready = { readyToSubmit: true, items: [] as { id: string; label: string; state: string; reason: string }[] };

function submitted(submittedBy = 'u-pm'): HandoverPackage {
  return submit(makeHandoverPackage({ tenantId: 't1', projectId: 'p1', code: 'HO-01', title: 'Handover' }), ready, submittedBy);
}

const SIG = { documentId: 'doc-sig-1', hash: 'sha256:abc' };

describe('a handover acceptance and the signature behind it', () => {
  it('records the stored signature and its checksum', () => {
    const done = accept(submitted(), { clientRepresentative: 'Client Rep', signature: SIG }, 'u-fm');
    expect(done.acceptanceSignatureDocumentId).toBe('doc-sig-1');
    expect(done.acceptanceSignatureHash).toBe('sha256:abc');
  });

  it('accepts without one, because an acceptance signed on paper is still an acceptance', () => {
    const done = accept(submitted(), { clientRepresentative: 'Client Rep' }, 'u-fm');
    expect(done.status).toBe('accepted');
    expect(done.acceptanceSignatureDocumentId).toBeNull();
    expect(done.acceptanceSignatureHash).toBeNull();
  });

  it('refuses half a pair, either way round', () => {
    // A reference with no checksum cannot be checked against the bytes; a checksum with no
    // reference names nothing. Either alone is a record that LOOKS like evidence.
    expect(() => accept(submitted(), { clientRepresentative: 'C', signature: { documentId: 'doc-1', hash: '' } }, 'u-fm'))
      .toThrow(/requires both the stored document and its checksum/i);
    expect(() => accept(submitted(), { clientRepresentative: 'C', signature: { documentId: '  ', hash: 'sha256:abc' } }, 'u-fm'))
      .toThrow(/requires both the stored document and its checksum/i);
  });

  it('still refuses the submitter, signature or not', () => {
    // The separation is the older rule and the signature must not become a way around it: a
    // signature drawn by the person issuing the handover is not the client's acceptance.
    expect(() => accept(submitted('u-pm'), { clientRepresentative: 'Client Rep', signature: SIG }, 'u-pm'))
      .toThrow(/may not accept it/i);
  });

  it('still requires a client representative — a signature does not name who gave it', () => {
    expect(() => accept(submitted(), { clientRepresentative: '  ', signature: SIG }, 'u-fm'))
      .toThrow(/client representative is required/i);
  });
});

describe('what an acceptance is evidenced by', () => {
  it('says nothing about a package that has not been accepted', () => {
    // Same contract as `handoverSeparation`: null is "there is nothing to describe", which is
    // different from "there is no signature" and must not be rendered as it.
    expect(acceptanceEvidence(makeHandoverPackage({ tenantId: 't1', projectId: 'p1', code: 'HO-01', title: 'H' }))).toBeNull();
    expect(acceptanceEvidence(submitted())).toBeNull();
    expect(acceptanceEvidence(reject(submitted(), 'missing O&M'))).toBeNull();
  });

  it('distinguishes a signed acceptance from one recorded by name alone', () => {
    expect(acceptanceEvidence(accept(submitted(), { clientRepresentative: 'C', signature: SIG }, 'u-fm'))).toBe('signed');
    expect(acceptanceEvidence(accept(submitted(), { clientRepresentative: 'C' }, 'u-fm'))).toBe('name-only');
  });

  it('never reports `signed` from a hash alone', () => {
    // The reference is what a reader can open. A package carrying a hash and no document would be
    // unopenable, and calling it signed would send somebody looking for a file that is not there.
    const done = accept(submitted(), { clientRepresentative: 'C' }, 'u-fm');
    expect(acceptanceEvidence({ ...done, acceptanceSignatureHash: 'sha256:orphan' })).toBe('name-only');
  });
});
