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

interface Evidence {
  id: string;
  fileId: string;
  category: string;
  description: string | null;
  location: string | null;
  capturedBy: string | null;
  capturedAt: string | null;
  hash: string | null;
}

/**
 * `GET /api/site/daily-reports/:id` returns the 360 DETAIL — `{ report, labour, plant, progress,
 * delays, evidence }` — and this page read it as a bare report. Every field it printed was
 * therefore `undefined`, and `report.date.replace(...)` threw before anything rendered: the
 * controlled output that "backs progress claims, delay evidence, and client site diaries"
 * answered "Site couldn't load". The 360 page beside it had the shape right all along.
 */
interface DailyReportDetail {
  report: DailyReport;
  evidence?: Evidence[];
}

export default async function DailyReportPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getJson<DailyReportDetail>(`/api/site/daily-reports/${id}`);
  const report = detail?.report;
  if (!report?.date) return <div style={{ padding: 40, color: '#666' }}>Daily report not found or API offline.</div>;

  const evidence = detail?.evidence ?? [];
  // The signature is stored like any other evidence, distinguished by what it was filed as.
  const signature = evidence.find((e) => /signature|sign-off/i.test(e.description ?? ''));
  const photos = evidence.filter((e) => e !== signature);

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
        { label: 'Evidence Attached', value: String(evidence.length) },
      ]}
      columns={[
        { key: 'item', label: 'Site Execution Details' },
        { key: 'qty', label: 'Metric', align: 'right' },
      ]}
      rows={[
        { item: report.workDescription, qty: `${report.manpowerCount} workers / ${report.equipmentCount} plant` },
        // Each photograph is named on the sheet with who captured it. A printed diary that says
        // "3 photos" without saying which is not evidence anybody can check a claim against.
        ...photos.map((e) => ({
          item: `Evidence — ${e.description ?? e.fileId}${e.location ? ` · ${e.location}` : ''}`,
          qty: e.capturedBy ? `captured by ${e.capturedBy}` : e.category,
        })),
      ]}
      notes="Official foreman daily report logged on site. Backs progress claims, delay evidence, and client site diaries."
      signatures={[
        // The captured signature where there is one, and the ruled line where there is not —
        // a blank line printed beside a signature AURA holds would be the document failing to
        // say what it knows.
        signature
          ? {
              label: 'Foreman / Site Engineer',
              src: `/api/documents/${signature.fileId}/content`,
              attribution: signature.capturedBy ? `Signed by ${signature.capturedBy}` : undefined,
            }
          : 'Foreman / Site Engineer',
        'Consultant Witness / QA Inspector',
      ]}
    />
  );
}
