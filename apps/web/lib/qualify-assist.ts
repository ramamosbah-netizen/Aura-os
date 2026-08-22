// AURA Qualification Assist — a READ-ONLY advisor. It grounds a prompt on the lead's own facts and
// its qualification assessment, calls the real AI seam (POST /api/ai → {text}), and returns advice.
// It deliberately owns NO mutation: it can never change lead.status, assess, or convert — a unit
// test asserts it only ever calls `/api/ai`. All decisions stay with the human + the backend.

export interface AssistLead {
  name: string;
  companyName: string | null;
  source: string | null;
  status: string;
  requirement: string | null;
  systems: string[] | null;
  sector: string | null;
  projectName: string | null;
  projectLocation: string | null;
  consultant: string | null;
  mainContractor: string | null;
  estimatedValue: number | null;
  expectedTimeline: string | null;
}
export interface AssistAssessment {
  score: number;
  recommendation: string;
  coverage: { rated: number; total: number };
  gaps: Array<{ label: string }>;
}

const SYSTEM =
  'You are AURA, a UAE ELV sales qualification assistant. You are given a sales LEAD (captured ' +
  'interest, not yet a deal). Help the salesperson decide whether it is worth pursuing. Reply in ' +
  'concise Markdown with exactly four short sections: "Questions to ask the customer", "Missing ' +
  'evidence", "Checks to run", "Next actions". Ground every point in the facts provided. Never ' +
  'invent budgets, contacts, or authority. You ADVISE ONLY — you cannot change the lead status, ' +
  'qualify it, or convert it.';

export function buildQualifyAssistPrompt(lead: AssistLead, assessment: AssistAssessment | null): { system: string; prompt: string } {
  const facts = [
    `Contact: ${lead.name}`,
    lead.companyName ? `Company: ${lead.companyName}` : null,
    lead.source ? `Source: ${lead.source}` : null,
    `Lifecycle status: ${lead.status}`,
    lead.requirement ? `Requirement: ${lead.requirement}` : null,
    lead.systems?.length ? `ELV systems: ${lead.systems.join(', ')}` : null,
    lead.sector ? `Sector: ${lead.sector}` : null,
    lead.projectName ? `Project: ${lead.projectName}` : null,
    lead.projectLocation ? `Location: ${lead.projectLocation}` : null,
    lead.consultant ? `Consultant: ${lead.consultant}` : null,
    lead.mainContractor ? `Main contractor: ${lead.mainContractor}` : null,
    lead.estimatedValue != null ? `Budget indication: AED ${lead.estimatedValue}` : null,
    lead.expectedTimeline ? `Timeline: ${lead.expectedTimeline}` : null,
  ].filter(Boolean).join('\n');

  const assess = assessment
    ? `\n\nQualification assessment (advisory, evidence not decision): verdict ${assessment.recommendation}, ` +
      `score ${assessment.score}/100, coverage ${assessment.coverage.rated}/${assessment.coverage.total} dimensions rated.` +
      (assessment.gaps.length ? ` Evidence gaps (unrated/weak dimensions): ${assessment.gaps.map((g) => g.label).join(', ')}.` : '')
    : '\n\nQualification assessment: not assessed yet.';

  return { system: SYSTEM, prompt: `Lead facts:\n${facts}${assess}\n\nHelp me qualify this lead.` };
}

/** Call the real AI seam. Injectable fetch for tests. Returns the advice text (empty string ⇒ the
 *  model returned nothing to show). Throws on transport/API failure so the UI can show an error. */
export async function requestQualifyAssist(
  lead: AssistLead,
  assessment: AssistAssessment | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { system, prompt } = buildQualifyAssistPrompt(lead, assessment);
  const res = await fetchImpl('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, system }),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? 'AURA could not respond.');
  }
  const data = (await res.json()) as { text?: string };
  return typeof data.text === 'string' ? data.text : '';
}
