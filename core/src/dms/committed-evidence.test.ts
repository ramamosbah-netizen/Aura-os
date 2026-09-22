import { describe, expect, it, vi } from 'vitest';
import { makeDocument, makeDocumentPermission } from '@aura/shared';
import type { Document } from '@aura/shared';
import { DocumentAccessResolver } from './document-access-resolver';
import type { CommittedEvidenceProvider } from './committed-evidence';

/**
 * COMMITTED EVIDENCE CANNOT BE REWRITTEN, INCLUDING BY ITS OWNER.
 *
 * `DEFAULT_OWNER_POLICY` gives a document's creator EDIT, which is right for almost everything in
 * the system. It is wrong for evidence: `createdBy` on a signature is the person who RECORDED the
 * act, so the generic policy handed the recorder EDIT on the very signature that constrains them —
 * and `POST /documents/:id/versions` asserts exactly that level.
 *
 * The seal is applied where every grant has been gathered, so it covers owner, direct share, team,
 * role, company and context alike. A rule placed at any one command would cover the path it was
 * written for and miss the next one.
 */

const ACTOR = { userId: 'u-recorder', tenantId: 't1', companyId: 'c1' };

function doc(overrides: Partial<Document> = {}): Document {
  return {
    ...makeDocument({
      tenantId: 't1', companyId: 'c1', kind: 'signature', title: 'Witness signature',
      aggregateType: 'commissioning.record', aggregateId: 'rec-1', createdBy: 'u-recorder',
    }),
    ...overrides,
  };
}

function resolverWith(opts: { permissions?: ReturnType<typeof makeDocumentPermission>[]; provider?: CommittedEvidenceProvider } = {}) {
  const documents = { get: vi.fn() } as never;
  const permissions = { listForDocument: vi.fn().mockResolvedValue(opts.permissions ?? []) } as never;
  const resolver = new DocumentAccessResolver(documents, permissions);
  if (opts.provider) resolver.registerCommittedEvidenceProvider(opts.provider);
  return resolver;
}

const sealing = (entity: string, reason = 'relied on by a completed act'): CommittedEvidenceProvider => ({
  entity,
  isCommitted: async () => ({ committed: true, reason }),
});

describe('an unsealed document behaves exactly as it always did', () => {
  it('gives its creator the full owner policy', async () => {
    const decision = await resolverWith().authorize(doc(), ACTOR);
    expect(decision.permissions).toEqual(expect.arrayContaining(['VIEW', 'DOWNLOAD', 'COMMENT', 'EDIT', 'SHARE']));
    expect(decision.committedEvidence).toBeUndefined();
  });
});

describe('a committed document keeps its readers and loses its writers', () => {
  it('withholds EDIT and SHARE from the OWNER', async () => {
    // The case that matters. Without this the person who recorded the sign-off could replace the
    // signature the witness gave, and nothing in DMS would object.
    const decision = await resolverWith({ provider: sealing('commissioning.record') }).authorize(doc(), ACTOR);
    expect(decision.permissions).not.toContain('EDIT');
    expect(decision.permissions).not.toContain('SHARE');
  });

  it('still allows VIEW, DOWNLOAD and COMMENT', async () => {
    // Sealing is not hiding: the whole point of this evidence is that the people entitled to it
    // can open it. A seal that also blocked reading would break the capability it protects.
    const decision = await resolverWith({ provider: sealing('commissioning.record') }).authorize(doc(), ACTOR);
    expect(decision.permissions).toEqual(expect.arrayContaining(['VIEW', 'DOWNLOAD', 'COMMENT']));
    expect(decision.allowed).toBe(true);
  });

  it('withholds EDIT granted by a DIRECT SHARE, not only by ownership', async () => {
    // A seal that only covered the owner policy would be walked around by sharing EDIT to
    // somebody else — which is why it is applied after every source has been gathered.
    const d = doc({ createdBy: 'somebody-else' });
    const share = makeDocumentPermission({
      tenantId: 't1', documentId: d.id, subjectType: 'USER', subjectId: 'u-recorder', permission: 'EDIT',
    });
    const decision = await resolverWith({ permissions: [share], provider: sealing('commissioning.record') }).authorize(d, ACTOR);
    expect(decision.permissions).not.toContain('EDIT');
    expect(decision.permissions).toContain('DOWNLOAD');
  });

  it('carries the reason, so a refusal can say what is actually wrong', async () => {
    // "Access denied" sends somebody looking for a permission to grant themselves. No grant fixes
    // this: the bytes are cited by a finished act.
    const decision = await resolverWith({
      provider: sealing('commissioning.record', 'this is the witness signature on TC-01 and cannot be replaced'),
    }).authorize(doc(), ACTOR);
    expect(decision.committedEvidence?.committed).toBe(true);
    expect(decision.committedEvidence?.reason).toContain('cannot be replaced');
  });
});

describe('the seal asks only the provider that speaks for the document', () => {
  it('ignores a provider registered for a different aggregate type', async () => {
    const decision = await resolverWith({ provider: sealing('site.daily-report') }).authorize(doc(), ACTOR);
    expect(decision.permissions).toContain('EDIT');
  });

  it('leaves a document unsealed when its provider throws', async () => {
    // A module that cannot answer must not turn every write in the system into a refusal. The
    // ordinary permission check still stands behind this.
    const broken: CommittedEvidenceProvider = {
      entity: 'commissioning.record',
      isCommitted: async () => { throw new Error('store unavailable'); },
    };
    const decision = await resolverWith({ provider: broken }).authorize(doc(), ACTOR);
    expect(decision.permissions).toContain('EDIT');
  });

  it('leaves a document unsealed when the provider says it is not committed', async () => {
    const open: CommittedEvidenceProvider = {
      entity: 'commissioning.record',
      isCommitted: async () => ({ committed: false }),
    };
    const decision = await resolverWith({ provider: open }).authorize(doc(), ACTOR);
    expect(decision.permissions).toContain('EDIT');
    expect(decision.committedEvidence).toBeUndefined();
  });
});
