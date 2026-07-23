import { estimateLine, type EstimationLineInput } from './estimation';

// Sheet-level Copilot — the WHOLE offer reviewed, not just a line. Pure over the same
// EstimationLineInput[] the workspace edits and the same engine, so the client can run it live on
// every keystroke with zero drift from what the server would say.
//
// Grounded by construction: every flag is arithmetic over the sheet itself — a blended margin, a
// labour share, a duplicate description, a line with no cost behind its price. No invented scores.

export interface SheetFlag {
  tone: 'ok' | 'warn' | 'bad';
  text: string;
}

export interface SheetAdvice {
  blendedMarginPercent: number;
  /** Labour as a share of DIRECT cost — the number ELV bids get wrong. */
  labourSharePercent: number;
  totalCost: number;
  totalSell: number;
  flags: SheetFlag[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function analyseSheet(lines: EstimationLineInput[]): SheetAdvice {
  const priced = lines.filter((l) => l.description.trim());
  const results = priced.map(estimateLine);

  const totalCost = results.reduce((s, r) => s + r.totalCost, 0);
  const totalSell = results.reduce((s, r) => s + r.sellPrice, 0);
  const totalDirect = results.reduce((s, r) => s + r.directCost, 0);
  const totalLabour = results.reduce((s, r) => s + r.labourCost, 0);
  const blendedMarginPercent = totalSell > 0 ? round1(((totalSell - totalCost) / totalSell) * 100) : 0;
  const labourSharePercent = totalDirect > 0 ? round1((totalLabour / totalDirect) * 100) : 0;

  const flags: SheetFlag[] = [];

  // Margin, blended — the number the approver reads first.
  if (totalSell > 0) {
    if (blendedMarginPercent < 0) flags.push({ tone: 'bad', text: `The sheet sells below cost overall (${blendedMarginPercent}%).` });
    else if (blendedMarginPercent < 10) flags.push({ tone: 'warn', text: `Blended margin is thin (${blendedMarginPercent}%) — one concession eats it.` });
    else if (blendedMarginPercent > 40) flags.push({ tone: 'warn', text: `Blended margin is high (${blendedMarginPercent}%) — competitive risk on price.` });
    else flags.push({ tone: 'ok', text: `Blended margin ${blendedMarginPercent}% is in a healthy band.` });
  }

  // Labour share — installation businesses lose bids on labour, not on cameras.
  if (totalDirect > 0 && labourSharePercent > 40) {
    flags.push({ tone: 'warn', text: `Labour is ${labourSharePercent}% of direct cost — check productivity (hours/crew) before pricing.` });
  }

  // Lines whose sell has no cost behind it — a price with no build-up is a guess wearing a number.
  const noCost = priced.filter((l, i) => results[i].sellPrice > 0 && results[i].totalCost === 0);
  if (noCost.length > 0) {
    flags.push({ tone: 'bad', text: `${noCost.length} line(s) have a sell price but NO cost build-up: ${noCost.map((l) => l.description).slice(0, 3).join(', ')}.` });
  }

  // Duplicates — the same item priced twice is either an error or an unlabelled variant.
  const seen = new Map<string, string>();
  for (const l of priced) {
    const key = norm(l.description);
    if (seen.has(key)) flags.push({ tone: 'warn', text: `Duplicate line: "${l.description}" appears more than once.` });
    else seen.set(key, l.description);
  }

  // Risk posture — a sheet with zero risk and zero contingency claims a perfect project.
  const anyRisk = priced.some((l) => (l.riskPercent ?? 0) > 0 || (l.contingencyPercent ?? 0) > 0);
  if (priced.length > 0 && !anyRisk) {
    flags.push({ tone: 'warn', text: 'No risk or contingency allowance anywhere on the sheet — priced as if nothing can go wrong.' });
  }

  return { blendedMarginPercent, labourSharePercent, totalCost: round1(totalCost), totalSell: round1(totalSell), flags };
}
