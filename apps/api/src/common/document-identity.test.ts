import { describe, expect, it } from 'vitest';
import { resolveDocumentIdentity } from './document-identity';

/**
 * F-01 — whose identity a document prints. Each company's own record speaks first; the tenant's
 * organisation profile speaks only for a tenant with one company, or for a document no company
 * issued. It may never fill a blank on one company's paper when there are several.
 */
const PROFILE: Record<string, string> = {
  'company.name': 'Group Holding',
  'company.legalName': 'Group Holding L.L.C.',
  'company.trn': '100111111111111',
  'company.address': 'Group Tower, Dubai',
  'company.phone': '+971 4 000 0000',
  'company.email': 'group@example.ae',
  'company.website': 'https://group.example.ae',
  'finance.defaultCurrency': 'AED',
};
const settings = { get: async (_tenant: string, key: string) => PROFILE[key] ?? null };
const company = (id: string, extra: Record<string, unknown> = {}) => ({
  id, tenantId: 't1', name: id.toUpperCase(), code: id, trn: '', baseCurrency: 'AED', active: true, ...extra,
});
const companiesOf = (list: Array<ReturnType<typeof company>>) => ({ list: async () => list });

describe('document identity', () => {
  it('lets the organisation profile complete the only company of a tenant', async () => {
    const one = companiesOf([company('jeet', { name: 'JEET', trn: '100222222222222' })]);
    const identity = await resolveDocumentIdentity(one as never, settings as never, 't1', 'jeet');
    expect(identity).toMatchObject({
      configured: true, name: 'JEET', legalName: 'Group Holding L.L.C.', trn: '100222222222222', address: 'Group Tower, Dubai',
    });
  });

  it('names the only company on a document no company issued — its own record first', async () => {
    const one = companiesOf([company('jeet', { name: 'JEET', trn: '100222222222222', legalName: 'JEET Systems L.L.C.' })]);
    const identity = await resolveDocumentIdentity(one as never, { get: async () => null } as never, 't1', null);
    expect(identity).toMatchObject({ configured: true, name: 'JEET', legalName: 'JEET Systems L.L.C.', trn: '100222222222222' });
  });

  it('prints each of two companies with its own identity, and never borrows the profile for either', async () => {
    const two = companiesOf([
      company('alpha', { name: 'Alpha ELV', trn: '100333333333333', legalName: 'Alpha ELV Systems L.L.C.', address: 'Office 1, Abu Dhabi', email: 'info@alpha.ae' }),
      company('beta', { name: 'Beta MEP', trn: '100444444444444' }),
    ]);
    const alpha = await resolveDocumentIdentity(two as never, settings as never, 't1', 'alpha');
    const beta = await resolveDocumentIdentity(two as never, settings as never, 't1', 'beta');
    expect(alpha).toMatchObject({ name: 'Alpha ELV', legalName: 'Alpha ELV Systems L.L.C.', trn: '100333333333333', address: 'Office 1, Abu Dhabi', email: 'info@alpha.ae' });
    // Beta recorded no legal name or address: they are blank on its paper, not the group's.
    expect(beta).toMatchObject({ name: 'Beta MEP', legalName: 'Beta MEP', trn: '100444444444444', address: '', phone: '', email: '', website: '' });
    expect(JSON.stringify(beta)).not.toContain('Group');
  });

  it('refuses to guess an unknown company among several, and lets the profile speak for an unissued document', async () => {
    const two = companiesOf([company('alpha'), company('beta')]);
    const unknown = await resolveDocumentIdentity(two as never, settings as never, 't1', 'gamma');
    expect(unknown).toMatchObject({ configured: false, name: 'Company identity not configured', trn: '', address: '' });
    const unissued = await resolveDocumentIdentity(two as never, settings as never, 't1', null);
    expect(unissued).toMatchObject({ configured: true, name: 'Group Holding L.L.C.', trn: '100111111111111' });
  });

  it('says so when nothing at all is configured', async () => {
    const empty = await resolveDocumentIdentity(companiesOf([]) as never, { get: async () => null } as never, 't1', null);
    expect(empty).toMatchObject({ configured: false, name: 'Company identity not configured', legalName: '', trn: '' });
  });
});
