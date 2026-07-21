import { describe, it, expect } from 'vitest';
import {
  makeDocumentPermission,
  resolveDocumentAccess,
  canDocument,
  permissionImplies,
  type DocumentActor,
  type DocumentPermission,
} from './document-permission';

const DOC = { id: 'doc-1', tenantId: 't1', createdBy: 'u-owner' };
const actor = (over: Partial<DocumentActor> = {}): DocumentActor => ({ userId: 'u-other', tenantId: 't1', ...over });
const share = (over: Partial<Parameters<typeof makeDocumentPermission>[0]> = {}): DocumentPermission =>
  makeDocumentPermission({
    tenantId: 't1', documentId: 'doc-1', subjectType: 'USER', subjectId: 'u-other',
    permission: 'VIEW', grantedBy: 'u-owner', ...over,
  });

describe('document access — deny by default', () => {
  it('refuses an actor with no share at all', () => {
    const d = resolveDocumentAccess(DOC, [], actor());
    expect(d.allowed).toBe(false);
    expect(d.effective).toEqual([]);
    expect(d.reason).toMatch(/not shared/);
  });

  it('ignores a share that belongs to a DIFFERENT document', () => {
    const other = share({ documentId: 'doc-2', permission: 'EDIT' });
    expect(resolveDocumentAccess(DOC, [other], actor()).allowed).toBe(false);
  });

  it('ignores a share aimed at a different user', () => {
    expect(resolveDocumentAccess(DOC, [share({ subjectId: 'someone-else' })], actor()).allowed).toBe(false);
  });
});

describe('document access — tenant isolation is absolute', () => {
  it('refuses cross-tenant even when a matching permission exists', () => {
    const foreign = actor({ tenantId: 't2' });
    const d = resolveDocumentAccess(DOC, [share({ permission: 'EDIT' })], foreign);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/cross-tenant/);
  });

  it('refuses cross-tenant even for the document owner', () => {
    const d = resolveDocumentAccess(DOC, [], { userId: 'u-owner', tenantId: 't2' });
    expect(d.allowed).toBe(false);
  });

  it('ignores a permission row carrying another tenant id', () => {
    const spoofed = { ...share({ permission: 'EDIT' }), tenantId: 't2' };
    expect(resolveDocumentAccess(DOC, [spoofed], actor()).allowed).toBe(false);
  });
});

describe('document access — the owner cannot lock themselves out, but is not an administrator', () => {
  it('gives the creator the owner policy with no shares present', () => {
    const d = resolveDocumentAccess(DOC, [], actor({ userId: 'u-owner' }));
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe('owner');
    expect(d.effective).toEqual(['VIEW', 'DOWNLOAD', 'COMMENT', 'EDIT', 'SHARE']);
  });

  // Authorship is not authority. The person who drafts a contract is exactly the person who
  // should not sign it off, and a creator who has left the company must not keep approving.
  it('does NOT give the creator APPROVE', () => {
    const d = resolveDocumentAccess(DOC, [], actor({ userId: 'u-owner' }));
    expect(d.effective).not.toContain('APPROVE');
    expect(canDocument(DOC, [], actor({ userId: 'u-owner' }), 'APPROVE')).toBe(false);
  });

  // Ownership is a floor, not a short-circuit: an earlier version returned early on ownership
  // and would have silently discarded this grant.
  it('DOES give the creator APPROVE when it is explicitly shared with them', () => {
    const granted = share({ subjectId: 'u-owner', permission: 'APPROVE' });
    const d = resolveDocumentAccess(DOC, [granted], actor({ userId: 'u-owner' }));
    expect(d.effective).toContain('APPROVE');
    expect(d.effective).toContain('EDIT');
    expect(d.reason).toMatch(/owner \+ shared/);
  });

  it('honours a tenant policy that withholds more than the default', () => {
    const readOnlyOwner = { creator: ['VIEW'] as const };
    const d = resolveDocumentAccess(DOC, [], actor({ userId: 'u-owner' }), new Date(), readOnlyOwner);
    expect(d.effective).toEqual(['VIEW']);
    expect(d.effective).not.toContain('EDIT');
  });

  it('does not treat a null creator as matching a null-ish actor', () => {
    const orphan = { ...DOC, createdBy: null };
    expect(resolveDocumentAccess(orphan, [], actor({ userId: 'u-owner' })).allowed).toBe(false);
  });
});

describe('document access — subjects', () => {
  it('matches a TEAM share through the actor teams', () => {
    const p = share({ subjectType: 'TEAM', subjectId: 'team-eng', permission: 'COMMENT' });
    expect(resolveDocumentAccess(DOC, [p], actor({ teamIds: ['team-eng'] })).allowed).toBe(true);
    expect(resolveDocumentAccess(DOC, [p], actor({ teamIds: ['team-fin'] })).allowed).toBe(false);
  });

  it('matches a ROLE share through the actor roles', () => {
    const p = share({ subjectType: 'ROLE', subjectId: 'role-approver', permission: 'APPROVE' });
    expect(canDocument(DOC, [p], actor({ roleIds: ['role-approver'] }), 'APPROVE')).toBe(true);
    expect(canDocument(DOC, [p], actor({ roleIds: [] }), 'APPROVE')).toBe(false);
  });

  it('scopes a COMPANY share to that company, not the whole tenant', () => {
    const p = share({ subjectType: 'COMPANY', subjectId: 'co-1', permission: 'VIEW' });
    expect(resolveDocumentAccess(DOC, [p], actor({ companyId: 'co-1' })).allowed).toBe(true);
    expect(resolveDocumentAccess(DOC, [p], actor({ companyId: 'co-2' })).allowed).toBe(false);
    // a user with no company must not fall through a company-wide share
    expect(resolveDocumentAccess(DOC, [p], actor({ companyId: null })).allowed).toBe(false);
  });
});

describe('document access — expiry', () => {
  const past = new Date('2020-01-01T00:00:00.000Z').toISOString();
  const future = new Date('2999-01-01T00:00:00.000Z').toISOString();

  it('refuses an expired share', () => {
    expect(resolveDocumentAccess(DOC, [share({ expiresAt: past })], actor()).allowed).toBe(false);
  });

  it('honours a share that has not expired', () => {
    expect(resolveDocumentAccess(DOC, [share({ expiresAt: future })], actor()).allowed).toBe(true);
  });
});

describe('document permission implications — a lattice, not a ladder', () => {
  it('makes everything imply VIEW', () => {
    for (const level of ['DOWNLOAD', 'COMMENT', 'EDIT', 'SHARE', 'APPROVE'] as const) {
      expect(permissionImplies(level, 'VIEW')).toBe(true);
    }
  });

  it('lets EDIT read and comment', () => {
    expect(permissionImplies('EDIT', 'DOWNLOAD')).toBe(true);
    expect(permissionImplies('EDIT', 'COMMENT')).toBe(true);
  });

  // The rule that keeps approval and authorship separable.
  it('does NOT let an approver edit, nor an editor approve', () => {
    expect(permissionImplies('APPROVE', 'EDIT')).toBe(false);
    expect(permissionImplies('EDIT', 'APPROVE')).toBe(false);
  });

  it('does NOT let a sharer edit, nor an editor re-share', () => {
    expect(permissionImplies('SHARE', 'EDIT')).toBe(false);
    expect(permissionImplies('EDIT', 'SHARE')).toBe(false);
  });

  it('does not let VIEW reach the bytes', () => {
    expect(canDocument(DOC, [share({ permission: 'VIEW' })], actor(), 'DOWNLOAD')).toBe(false);
    expect(canDocument(DOC, [share({ permission: 'DOWNLOAD' })], actor(), 'DOWNLOAD')).toBe(true);
  });
});

describe('document access — combining shares', () => {
  it('unions every matching share, across subject kinds', () => {
    const d = resolveDocumentAccess(
      DOC,
      [
        share({ permission: 'DOWNLOAD' }),
        share({ subjectType: 'TEAM', subjectId: 'team-eng', permission: 'COMMENT' }),
        share({ subjectType: 'ROLE', subjectId: 'role-dir', permission: 'APPROVE' }),
      ],
      actor({ teamIds: ['team-eng'], roleIds: ['role-dir'] }),
    );
    expect(d.allowed).toBe(true);
    expect(d.effective).toEqual(['VIEW', 'DOWNLOAD', 'COMMENT', 'APPROVE']);
    expect(d.effective).not.toContain('EDIT');
    expect(d.effective).not.toContain('SHARE');
  });

  it('reports effective levels in a stable order', () => {
    const d = resolveDocumentAccess(DOC, [share({ permission: 'EDIT' })], actor());
    expect(d.effective).toEqual(['VIEW', 'DOWNLOAD', 'COMMENT', 'EDIT']);
  });
});

describe('makeDocumentPermission', () => {
  it('refuses a share with no subject', () => {
    expect(() => share({ subjectId: '   ' })).toThrow(/subject/);
  });

  it('records who granted it and when', () => {
    const p = share({ grantedBy: 'u-owner' });
    expect(p.grantedBy).toBe('u-owner');
    expect(p.grantedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(p.expiresAt).toBeNull();
  });
});
