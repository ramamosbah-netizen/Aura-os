import { describe, expect, it, vi } from 'vitest';
import {
  buildOutreach, toE164Digits, canWhatsApp, mailtoHref, whatsappHref, requestOutreachDraft,
  buildDealOutreach, requestDealOutreachDraft, personalise,
  type OutreachLead, type OutreachDeal,
} from '@/lib/lead-outreach';

const LEAD: OutreachLead = {
  name: 'Ahmed Khalil', companyName: 'ABC Contracting', email: 'ahmed@abc.co', phone: '+971 50 123 4567',
  requirement: 'CCTV & Access Control', projectName: 'Marina Tower', projectLocation: 'Dubai',
  systems: ['cctv', 'access_control'],
};

describe('buildOutreach (deterministic template — NOT called AI-generated)', () => {
  it('grounds the draft on the lead facts', () => {
    const { subject, body } = buildOutreach(LEAD);
    expect(subject).toContain('Marina Tower');
    expect(body).toContain('Hi Ahmed,');          // first name only
    expect(body).toContain('CCTV & Access Control');
    expect(body).toContain('ABC Contracting');
  });
  it('degrades gracefully with sparse facts', () => {
    const { subject, body } = buildOutreach({ ...LEAD, projectName: null, requirement: null, companyName: null });
    expect(subject).toContain('your enquiry');
    expect(body).toContain('Hi Ahmed,');
  });
});

describe('toE164Digits — never guesses a country code', () => {
  it('accepts an explicit + international number', () => {
    expect(toE164Digits('+971501234567')).toBe('971501234567');
    expect(toE164Digits('+971 50 123 4567')).toBe('971501234567');
  });
  it('accepts a 00 international prefix', () => {
    expect(toE164Digits('00971501234567')).toBe('971501234567');
  });
  it('REJECTS a bare local number (cannot know the country)', () => {
    expect(toE164Digits('0501234567')).toBeNull();
    expect(toE164Digits('050 123 4567')).toBeNull();
  });
  it('rejects a bare number with no explicit international prefix', () => {
    expect(toE164Digits('971501234567')).toBeNull(); // no +/00 → do not assume it is already E.164
  });
  it('rejects a local number wearing a + (country code cannot start with 0)', () => {
    expect(toE164Digits('+0501234567')).toBeNull();
  });
  it('rejects nonsense / too short / too long / empty', () => {
    expect(toE164Digits(null)).toBeNull();
    expect(toE164Digits('')).toBeNull();
    expect(toE164Digits('+12')).toBeNull();
    expect(toE164Digits('+1234567890123456')).toBeNull(); // 16 digits
  });
  it('canWhatsApp reflects normalisability', () => {
    expect(canWhatsApp({ phone: '+971501234567' })).toBe(true);
    expect(canWhatsApp({ phone: '0501234567' })).toBe(false);
    expect(canWhatsApp({ phone: null })).toBe(false);
  });
});

describe('href builders encode subject/body/text safely', () => {
  it('mailto encodes reserved chars, &, ?, newlines, Arabic', () => {
    const href = mailtoHref('a@b.co', 'Q4 & pricing? مرحبا', 'Line1\nLine2 & more ? مرحبا');
    expect(href.startsWith('mailto:a@b.co?subject=')).toBe(true); // address left raw
    expect(href).toContain('subject=Q4%20%26%20pricing%3F%20');   // & → %26, ? → %3F, space → %20
    expect(href).toContain('%0A');                                 // newline encoded
    expect(href).toContain('%D9%85');                              // Arabic (UTF-8) encoded
    expect(href).not.toContain('\n');
  });
  it('whatsapp encodes the text and uses the normalised number', () => {
    const href = whatsappHref('971501234567', 'Hi & bye ? مرحبا\nnext');
    expect(href.startsWith('https://wa.me/971501234567?text=')).toBe(true);
    expect(href).toContain('%26'); expect(href).toContain('%3F'); expect(href).toContain('%0A'); expect(href).toContain('%D9%85');
  });
});

describe('deal outreach (Opportunity 360)', () => {
  const DEAL: OutreachDeal = { title: 'Marina Tower ELV', accountName: 'ABC Contracting', value: 250000, stage: 'proposal' };

  it('buildDealOutreach grounds on the deal and omits the greeting (added per recipient)', () => {
    const { subject, body } = buildDealOutreach(DEAL);
    expect(subject).toContain('Marina Tower ELV');
    expect(body).toContain('ABC Contracting');
    expect(body.startsWith('Hi ')).toBe(false); // no greeting baked in
  });

  it('personalise prepends the recipient first name only', () => {
    expect(personalise('The pitch.', 'Ahmed Khalil')).toBe('Hi Ahmed,\n\nThe pitch.');
    expect(personalise('The pitch.', null)).toBe('The pitch.'); // unknown → no greeting
  });

  it('requestDealOutreachDraft calls /api/ai ONLY and never touches the deal', async () => {
    const calls: string[] = [];
    const fakeFetch = vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => ({ text: '  Following up.  ' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const out = await requestDealOutreachDraft(DEAL, fakeFetch);
    expect(out).toBe('Following up.');
    expect(calls).toEqual(['/api/ai']);
    expect(calls.some((u) => u.includes('/crm/opportunities'))).toBe(false);
    expect(calls.some((u) => u.includes('convert-to-quotation'))).toBe(false);
    expect(calls.some((u) => u.includes('start-tender'))).toBe(false);
  });

  it('requestDealOutreachDraft throws on failure (caller keeps the draft)', async () => {
    const fakeFetch = (async () => ({ ok: false, json: async () => ({ error: 'down' }) })) as unknown as typeof fetch;
    await expect(requestDealOutreachDraft(DEAL, fakeFetch)).rejects.toThrow(/down/);
  });
});

describe('requestOutreachDraft — suggest-only, /api/ai ONLY', () => {
  it('calls exactly /api/ai and returns the trimmed text — never a mutation/convert', async () => {
    const calls: string[] = [];
    const fakeFetch = vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => ({ text: '  Hi Ahmed, quick call?  ' }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const out = await requestOutreachDraft(LEAD, fakeFetch);
    expect(out).toBe('Hi Ahmed, quick call?');
    expect(calls).toEqual(['/api/ai']);
    expect(calls.some((u) => u.includes('/crm/leads'))).toBe(false);
    expect(calls.some((u) => u.includes('/convert'))).toBe(false);
    expect(calls.some((u) => u.includes('/assign'))).toBe(false);
    expect(calls.some((u) => u.includes('/qualification'))).toBe(false);
  });
  it('throws on AI failure so the caller keeps the existing draft', async () => {
    const fakeFetch = (async () => ({ ok: false, json: async () => ({ error: 'provider down' }) })) as unknown as typeof fetch;
    await expect(requestOutreachDraft(LEAD, fakeFetch)).rejects.toThrow(/provider down/);
  });
  it('treats a missing text field as empty', async () => {
    const fakeFetch = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(requestOutreachDraft(LEAD, fakeFetch)).resolves.toBe('');
  });
});
