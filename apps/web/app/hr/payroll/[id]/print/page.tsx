import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface Run {
  id: string; employeeId: string; periodStart: string; periodEnd: string;
  basicSalary: number; allowances: number; deductions: number; netSalary: number; status: string;
}
const money = (n: number) => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function PayslipPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getJson<Run>(`/api/hr/payroll/${id}`);
  if (!r) return <div style={{ padding: 40 }}>Payroll run not found or API offline.</div>;
  return (
    <DocumentSheet
      kind="PAYSLIP"
      reference={`PAY-${id.slice(0, 8)}`}
      status={r.status}
      from={{ heading: 'Employer', lines: ['AURA OS Contracting LLC', 'Dubai, UAE'] }}
      to={{ heading: 'Employee', lines: [`Employee ID: ${r.employeeId}`] }}
      meta={[{ label: 'Period From', value: r.periodStart }, { label: 'Period To', value: r.periodEnd }]}
      columns={[{ key: 'item', label: 'Component' }, { key: 'amount', label: 'Amount', align: 'right' }]}
      rows={[
        { item: 'Basic salary', amount: money(r.basicSalary) },
        { item: 'Allowances', amount: money(r.allowances) },
        { item: 'Deductions', amount: `(${money(r.deductions)})` },
      ]}
      totals={[{ label: 'Net Pay', value: money(r.netSalary), strong: true }]}
      notes="Salary disbursed via WPS. This payslip is computer-generated."
      signatures={['HR / Payroll', 'Employee']}
    />
  );
}
