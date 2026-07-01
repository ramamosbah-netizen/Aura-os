/**
 * WPS (UAE Wage Protection System) SIF generator.
 *
 * The SIF is the CSV payroll file employers submit to their WPS agent/bank. It has:
 *  - one EDR (Employer Details Record): establishment id, bank, file date/time, month,
 *    employee count, total salaries, currency;
 *  - one SCR (Salary Control Record) per employee: MOL person id, agent routing code,
 *    IBAN, pay period, days, fixed + variable income.
 * Pure + framework-free; the service feeds it payroll runs joined to employee bank details.
 */

export interface WpsEmployer {
  establishmentId: string; // MoHRE establishment / employer MOL id
  bankCode: string;        // employer bank routing code
  payMonth: string;        // YYYY-MM
}

export interface WpsEmployeeLine {
  molEmployeeId: string;
  bankRoutingCode: string;
  iban: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  days: number;
  fixedIncome: number;
  variableIncome: number;
  name?: string;
}

export interface SifResult {
  sif: string;
  recordCount: number;
  totalSalary: number;
}

function ymd(d: string): string {
  return d.replace(/-/g, ''); // YYYYMMDD
}

const two = (n: number): string => String(n).padStart(2, '0');

/** Validate one line; throws with a clear reason (surfaces as a 400). */
export function validateWpsLine(l: WpsEmployeeLine): void {
  if (!l.molEmployeeId?.trim()) throw new Error(`employee ${l.name ?? ''} missing MOL id`);
  if (!l.bankRoutingCode?.trim()) throw new Error(`employee ${l.name ?? ''} missing bank routing code`);
  if (!/^AE\d{21}$/.test(l.iban ?? '')) throw new Error(`employee ${l.name ?? ''} has an invalid UAE IBAN`);
  const total = l.fixedIncome + l.variableIncome;
  if (!(total >= 0)) throw new Error(`employee ${l.name ?? ''} has a negative salary`);
}

/**
 * Build the SIF text. `now` is injectable for deterministic tests.
 * SCR rows first, EDR trailer last — the common UAE bank layout.
 */
export function generateSif(employer: WpsEmployer, lines: WpsEmployeeLine[], now: Date = new Date()): SifResult {
  if (!employer.establishmentId?.trim()) throw new Error('employer establishmentId is required');
  if (!employer.bankCode?.trim()) throw new Error('employer bankCode is required');
  if (!/^\d{4}-\d{2}$/.test(employer.payMonth)) throw new Error('payMonth must be YYYY-MM');
  if (lines.length === 0) throw new Error('no payroll records for the period');
  lines.forEach(validateWpsLine);

  const round = (n: number): number => Math.round(n * 100) / 100;
  const totalSalary = round(lines.reduce((s, l) => s + l.fixedIncome + l.variableIncome, 0));
  const fileDate = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const fileTime = `${two(now.getHours())}${two(now.getMinutes())}`;

  const scr = lines.map((l) =>
    [
      'SCR',
      l.molEmployeeId,
      l.bankRoutingCode,
      l.iban,
      ymd(l.startDate),
      ymd(l.endDate),
      l.days,
      round(l.fixedIncome).toFixed(2),
      round(l.variableIncome).toFixed(2),
    ].join(','),
  );

  const edr = [
    'EDR',
    employer.establishmentId,
    employer.bankCode,
    fileDate,
    fileTime,
    employer.payMonth.replace('-', ''),
    lines.length,
    totalSalary.toFixed(2),
    'AED',
  ].join(',');

  return { sif: [...scr, edr].join('\n') + '\n', recordCount: lines.length, totalSalary };
}
