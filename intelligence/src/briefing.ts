import type { AiCompletionRequest } from '@aura/shared';
import { type Funnel, winRate } from './pipeline';

/** Intelligence emits its insights back onto the spine (auditable + webhook-deliverable). */
export const INSIGHT_EVENT = 'intelligence.insight.generated';

const SYSTEM = [
  'You are AURA, the executive copilot for a multi-company construction group.',
  'Given the deal-chain pipeline numbers, write a concise briefing (3-5 sentences):',
  'the shape of the funnel, the standout figure, and one concrete recommendation.',
  'Be specific with the numbers. No preamble, no markdown headers.',
].join(' ');

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Build the provider-agnostic AI request from a pipeline snapshot (pure + testable). */
export function buildBriefingPrompt(f: Funnel): AiCompletionRequest {
  const wr = winRate(f);
  const lines = [
    'Deal-chain pipeline (lead -> bid -> contract -> delivery):',
    `- Accounts (clients): ${fmt(f.accounts)}`,
    `- Tenders: ${fmt(f.tenders)} worth ${fmt(f.tenderValue)}`,
    `- Contracts: ${fmt(f.contracts)} worth ${fmt(f.contractValue)}`,
    `- Projects: ${fmt(f.projects)} worth ${fmt(f.projectValue)}`,
    `- Tender->contract conversion: ${wr === null ? 'n/a' : `${(wr * 100).toFixed(0)}%`}`,
  ];
  return { system: SYSTEM, messages: [{ role: 'user', content: lines.join('\n') }] };
}
