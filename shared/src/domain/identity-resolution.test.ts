import { describe, it, expect } from 'vitest';
import {
  resolveIdentity,
  normalizeCompanyName,
  normalizePhone,
  emailDomain,
  type IdentityRecord,
} from './identity-resolution';

describe('normalizers', () => {
  it('strips legal suffixes + punctuation + case from company names', () => {
    expect(normalizeCompanyName('Globex Corporation, LLC')).toBe('globex');
    expect(normalizeCompanyName('  ACME  Ltd. ')).toBe('acme');
    expect(normalizeCompanyName('Al-Falah Trading Co.')).toBe('al falah');
  });
  it('reduces phones to the last 9 digits', () => {
    expect(normalizePhone('+971 50 123 4567')).toBe('501234567');
    expect(normalizePhone('00971-50-123-4567')).toBe('501234567');
  });
  it('extracts the email domain', () => {
    expect(emailDomain('Jane.Doe@Globex.com')).toBe('globex.com');
  });
});

const ACCOUNTS: IdentityRecord[] = [
  { id: 'a1', name: 'Globex Corporation', email: 'info@globex.com', phone: '+971 50 111 2222' },
  { id: 'a2', name: 'Initech LLC', email: 'hello@initech.io', phone: '+971 55 999 8888' },
];

describe('resolveIdentity — accounts', () => {
  it('EXACT on identical email', () => {
    const r = resolveIdentity({ name: 'Different Name', email: 'info@globex.com' }, ACCOUNTS);
    expect(r.best).toBe('EXACT');
    expect(r.matches[0].id).toBe('a1');
    expect(r.matches[0].reasons).toContain('email exact');
  });

  it('EXACT on normalized company name (suffix-insensitive)', () => {
    const r = resolveIdentity({ name: 'GLOBEX, LLC' }, ACCOUNTS);
    expect(r.best).toBe('EXACT');
    expect(r.matches[0].id).toBe('a1');
  });

  it('PROBABLE on phone match with a different name', () => {
    const r = resolveIdentity({ name: 'Unknown', phone: '050-111-2222' }, ACCOUNTS);
    expect(r.best).toBe('PROBABLE');
    expect(r.matches[0].id).toBe('a1');
    expect(r.matches[0].reasons).toContain('phone match');
  });

  it('PROBABLE on a shared private email domain', () => {
    const r = resolveIdentity({ name: 'Globex Subsidiary', email: 'sales@initech.io' }, ACCOUNTS);
    // name token "globex" has no overlap with initech; domain carries it
    const initech = r.matches.find((m) => m.id === 'a2');
    expect(initech?.confidence).toBe('PROBABLE');
    expect(initech?.reasons).toContain('email domain match');
  });

  it('does NOT treat a public email domain as evidence', () => {
    const pub: IdentityRecord[] = [{ id: 'p1', name: 'Someone Else', email: 'someone@gmail.com' }];
    const r = resolveIdentity({ name: 'Nobody', email: 'another@gmail.com' }, pub);
    expect(r.best).toBe('NONE');
  });

  it('POSSIBLE on partial name-token overlap only', () => {
    const r = resolveIdentity({ name: 'Globex Ventures' }, ACCOUNTS);
    expect(r.best).toBe('POSSIBLE');
    expect(r.matches[0].id).toBe('a1');
  });

  it('NONE when nothing matches', () => {
    const r = resolveIdentity({ name: 'Wonka Industries', email: 'x@wonka.co' }, ACCOUNTS);
    expect(r.best).toBe('NONE');
    expect(r.matches).toEqual([]);
  });

  it('sorts strongest match first', () => {
    const recs: IdentityRecord[] = [
      { id: 'weak', name: 'Globex Partners' },        // POSSIBLE (token)
      { id: 'strong', name: 'Globex Corporation' },   // EXACT (name)
    ];
    const r = resolveIdentity({ name: 'Globex Corporation' }, recs);
    expect(r.matches[0].id).toBe('strong');
    expect(r.matches[0].confidence).toBe('EXACT');
  });
});

describe('resolveIdentity — contacts (personMode)', () => {
  const CONTACTS: IdentityRecord[] = [
    { id: 'c1', name: 'Jane Doe', email: 'jane@globex.com', phone: '050 111 2222' },
  ];

  it('EXACT only on identical email', () => {
    const r = resolveIdentity({ name: 'J. D.', email: 'jane@globex.com' }, CONTACTS, { personMode: true });
    expect(r.best).toBe('EXACT');
  });

  it('a shared person name is PROBABLE, not EXACT', () => {
    const r = resolveIdentity({ name: 'Jane Doe' }, CONTACTS, { personMode: true });
    expect(r.best).toBe('PROBABLE');
    expect(r.matches[0].reasons).toContain('name exact');
  });

  it('does not use email-domain evidence for people', () => {
    const r = resolveIdentity({ name: 'Totally Different', email: 'other@globex.com' }, CONTACTS, { personMode: true });
    expect(r.best).toBe('NONE');
  });
});
