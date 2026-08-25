/**
 * Opportunity 360 display rule — whether to nudge "won but not yet quoted/contracted".
 *
 * It must NEVER fire for a deal already won via an accepted quotation (award provenance is set):
 * that deal IS quoted and priced, so the prompt would contradict the record. Only a legacy win with
 * no award provenance AND a zero contracted value still gets the nudge.
 *
 * Local to the 360 view on purpose — it is a presentation rule, not a domain rule.
 */
export function shouldPromptQuoteOnWon(outcome: {
  status: 'open' | 'won' | 'lost';
  contractedValue: number | null;
  awardSource: string | null;
}): boolean {
  return outcome.status === 'won' && outcome.awardSource == null && outcome.contractedValue === 0;
}
