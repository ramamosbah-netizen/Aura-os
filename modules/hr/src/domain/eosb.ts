/**
 * End-of-Service Benefit (gratuity) calculator — UAE Labour Law, unlimited-contract basis.
 *
 * Rules applied (classic interpretation):
 *  - No gratuity under 1 year of service.
 *  - Daily wage = basic monthly salary / 30.
 *  - 21 days' wage per year for the first 5 years; 30 days' wage per year thereafter
 *    (pro-rated for partial years).
 *  - On RESIGNATION, gratuity is reduced by tenure: 1–3y → 1/3, 3–5y → 2/3, ≥5y → full.
 *    On TERMINATION there is no reduction.
 *  - Total gratuity is capped at 24 months' basic salary.
 *
 * Pure & framework-free so the numbers stay unit-tested.
 */
export type TerminationType = 'termination' | 'resignation';

export interface EosbInput {
  basicSalary: number;
  joinedDate: string; // YYYY-MM-DD
  lastWorkingDay: string; // YYYY-MM-DD
  terminationType: TerminationType;
}

export interface EosbResult {
  eligible: boolean;
  yearsOfService: number;
  dailyWage: number;
  grossDays: number;
  grossAmount: number;
  reductionFactor: number;
  cappedAmount: number;
  amount: number;
  notes: string[];
}

const round2 = (n: number): number => Number(n.toFixed(2));

function resignationFactor(years: number): number {
  if (years < 1) return 0;
  if (years < 3) return 1 / 3;
  if (years < 5) return 2 / 3;
  return 1;
}

export function calculateEosb(input: EosbInput): EosbResult {
  const basic = Number(input.basicSalary);
  if (!Number.isFinite(basic) || basic <= 0) throw new Error('basicSalary must be positive');

  const start = new Date(input.joinedDate);
  const end = new Date(input.lastWorkingDay);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('invalid dates');
  if (end <= start) throw new Error('lastWorkingDay must be after joinedDate');

  const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const dailyWage = round2(basic / 30);
  const notes: string[] = [];

  if (years < 1) {
    notes.push('No gratuity payable under 1 year of service.');
    return { eligible: false, yearsOfService: round2(years), dailyWage, grossDays: 0, grossAmount: 0, reductionFactor: 0, cappedAmount: 0, amount: 0, notes };
  }

  const firstBand = Math.min(years, 5);
  const secondBand = Math.max(years - 5, 0);
  const grossDays = round2(21 * firstBand + 30 * secondBand);
  notes.push(`${round2(firstBand)} yr × 21 days = ${round2(21 * firstBand)} days (first 5 years)`);
  if (secondBand > 0) notes.push(`${round2(secondBand)} yr × 30 days = ${round2(30 * secondBand)} days (beyond 5 years)`);

  const grossAmount = round2(dailyWage * grossDays);

  const reductionFactor = input.terminationType === 'resignation' ? resignationFactor(years) : 1;
  if (input.terminationType === 'resignation' && reductionFactor < 1) {
    notes.push(`Resignation reduction applied: ×${reductionFactor === 1 / 3 ? '1/3' : '2/3'} (tenure ${round2(years)}y).`);
  }
  const reduced = round2(grossAmount * reductionFactor);

  const cap = round2(basic * 24);
  const cappedAmount = Math.min(reduced, cap);
  if (cappedAmount < reduced) notes.push(`Capped at 24 months' basic salary (${cap}).`);

  return {
    eligible: true,
    yearsOfService: round2(years),
    dailyWage,
    grossDays,
    grossAmount,
    reductionFactor,
    cappedAmount,
    amount: cappedAmount,
    notes,
  };
}
