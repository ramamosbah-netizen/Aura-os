// Lead 360 external outreach — pure, testable helpers. AURA owns context + preparation; the actual
// send is an EXTERNAL handoff (the user's own mail app / WhatsApp). Nothing here claims a message was
// sent or delivered, and nothing here mutates the lead. The AI seam only SUGGESTS a draft.

export interface OutreachLead {
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  requirement: string | null;
  projectName: string | null;
  projectLocation: string | null;
  systems: string[] | null;
}

/**
 * A deterministic outreach draft grounded in the lead's own facts. This is a TEMPLATE — never call it
 * "AI-generated". It is the always-available fallback and the initial draft the user can edit.
 */
export function buildOutreach(lead: OutreachLead): { subject: string; body: string } {
  const first = (lead.name || '').trim().split(/\s+/)[0] || 'there';
  const topic = lead.projectName || lead.requirement || lead.companyName || 'your enquiry';
  const interest = lead.requirement ? ` in ${lead.requirement}` : '';
  const forCo = lead.companyName ? ` for ${lead.companyName}` : '';
  const proj = lead.projectName ? ` on ${lead.projectName}` : '';
  const body =
    `Hi ${first},\n\n` +
    `Thanks for your interest${interest}${forCo}. I'd like to understand your requirements${proj} ` +
    `and how we can help.\n\nWould you have time for a short call this week?\n\nBest regards`;
  return { subject: `AURA — ${topic}`, body };
}

export interface OutreachDeal {
  title: string;
  accountName: string | null;
  value: number | null;
  stage: string;
}

/**
 * A deterministic follow-up draft for an OPPORTUNITY, grounded in the deal facts. Deliberately has NO
 * greeting line — the caller prepends "Hi <first name>," per stakeholder, so one shared draft
 * personalises to each recipient. Template, never called "AI-generated".
 */
export function buildDealOutreach(deal: OutreachDeal): { subject: string; body: string } {
  const forCo = deal.accountName ? ` for ${deal.accountName}` : '';
  const body =
    `I wanted to follow up on ${deal.title}${forCo}. I'd like to make sure our proposal fits your `
    + `requirements and answer any questions you have.\n\nWould you have time for a short call this week?`
    + `\n\nBest regards`;
  return { subject: `AURA — ${deal.title}`, body };
}

/**
 * Ask AURA (real /api/ai ONLY) for a deal follow-up body — no greeting line (added per recipient),
 * grounded in the deal facts. Throws on failure so the caller keeps the existing editable draft.
 * Suggests only: never writes an event, changes the opportunity, or touches the deal in any way.
 */
export async function requestDealOutreachDraft(deal: OutreachDeal, fetchImpl: typeof fetch = fetch): Promise<string> {
  const system =
    'You are AURA, a UAE ELV sales assistant. Write a short follow-up message body (3–5 sentences) to a '
    + 'stakeholder on an open deal. Plain text only — NO greeting line (it is added separately), no markdown, '
    + 'no bracketed placeholders. Ground it strictly in the facts provided; never invent budgets or claims. '
    + 'End with a call to action for a short call.';
  const prompt =
    `Follow-up about the deal "${deal.title}"${deal.accountName ? ` for ${deal.accountName}` : ''}`
    + `${deal.value != null ? `, value AED ${deal.value}` : ''}, stage ${deal.stage}.`;
  const res = await fetchImpl('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, system }),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? 'AURA could not draft a message.');
  }
  const data = (await res.json()) as { text?: string };
  return typeof data.text === 'string' ? data.text.trim() : '';
}

/** Prepend a per-recipient greeting to a shared draft body. */
export function personalise(body: string, contactName: string | null): string {
  const first = (contactName || '').trim().split(/\s+/)[0];
  return first ? `Hi ${first},\n\n${body}` : body;
}

/**
 * Normalise a phone to E.164 digits (no leading '+') for wa.me — or null when we cannot do it SAFELY.
 * We never guess a country code: only a number carrying an explicit international prefix ('+' or '00')
 * is accepted. A bare/local number (e.g. 0501234567, or a plain 9-digit string) returns null, so the
 * UI asks for a country code rather than opening WhatsApp on a wrong number.
 */
export function toE164Digits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const raw = phone.trim();
  let digits: string | null = null;
  if (raw.startsWith('+')) {
    digits = raw.slice(1).replace(/\D/g, '');
  } else if (raw.replace(/[\s()-]/g, '').startsWith('00')) {
    digits = raw.replace(/\D/g, '').replace(/^00/, '');
  } else {
    return null; // no explicit country context — do not guess
  }
  // Approximate E.164 structure: 8–15 digits, and the first digit (start of the country code) is
  // never 0. This rejects e.g. "+0501234567" (a local number wearing a '+').
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('0')) return null;
  return digits;
}

/** True when we can offer a WhatsApp handoff for this lead. */
export function canWhatsApp(lead: Pick<OutreachLead, 'phone'>): boolean {
  return toE164Digits(lead.phone) !== null;
}

/** mailto: with subject + body prefilled. The address is left raw; subject/body are encoded. */
export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** wa.me deep link with prefilled text. `e164Digits` must already be normalised (see toE164Digits). */
export function whatsappHref(e164Digits: string, text: string): string {
  return `https://wa.me/${e164Digits}?text=${encodeURIComponent(text)}`;
}

/**
 * Ask AURA (the real /api/ai seam ONLY) to draft an outreach message, grounded in the lead's facts.
 * Returns the suggested text; throws on failure so the caller can KEEP the existing editable draft.
 * It suggests only — it never writes an event, changes lead status, qualifies, assigns or converts.
 */
export async function requestOutreachDraft(lead: OutreachLead, fetchImpl: typeof fetch = fetch): Promise<string> {
  const system =
    'You are AURA, a UAE ELV sales assistant. Write a short, warm outreach message (3–5 sentences) to a '
    + 'sales lead. Plain text only — no markdown, no bracketed placeholders. Ground it strictly in the facts '
    + 'provided; never invent budgets, names or claims. End with a call to action for a short call.';
  const prompt =
    `Write an outreach message to ${lead.name}${lead.companyName ? ` at ${lead.companyName}` : ''}. `
    + `Interest: ${lead.requirement ?? 'general enquiry'}. Project: ${lead.projectName ?? 'n/a'}. `
    + `Location: ${lead.projectLocation ?? 'n/a'}. Systems: ${lead.systems?.join(', ') || 'n/a'}.`;
  const res = await fetchImpl('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, system }),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? 'AURA could not draft a message.');
  }
  const data = (await res.json()) as { text?: string };
  return typeof data.text === 'string' ? data.text.trim() : '';
}
