import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface DailyReport {
  id: string;
  projectId: string;
  projectName: string | null;
  date: string;
  workDescription: string;
  manpowerCount: number;
  equipmentCount: number;
  status: string;
  createdAt: string;
}

export default async function DailyReportPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getJson<DailyReport>(`/api/site/daily-reports/${id}`);
  if (!report) return <div style={{ padding: 40, color: '#666' }}>Daily report not found or API offline.</div>;

  return (
    <DocumentSheet
      kind="DAILY SITE REPORT"
      reference={`DR-${report.date.replace(/-/g, '')}-${report.id.slice(0, 4)}`}
      status={report.status}
      from={{ heading: 'Site / Contractor', lines: ['AURA OS Contracting LLC', 'Engineering & Operations', 'Dubai, UAE'] }}
      to={{ heading: 'Project Context', lines: [report.projectName || 'General Construction Site', `Report Date: ${report.date}`] }}
      meta={[
        { label: 'Date', value: report.date },
        { label: 'Manpower Count', value: String(report.manpowerCount) },
        { label: 'Equipment Count', value: String(report.equipmentCount) },
      ]}
      columns={[
        { key: 'item', label: 'Site Execution Details' },
        { key: 'qty', label: 'Metric', align: 'right' },
      ]}
      rows={[
        { item: report.workDescription, qty: `${report.manpowerCount} workers / ${report.equipmentCount} plant` },
      ]}
      notes="Official foreman daily report logged on site. Backs progress claims, delay evidence, and client site diaries."
      signatures={['Foreman / Site Engineer', 'Consultant Witness / QA Inspector']}
    />
  );
}
