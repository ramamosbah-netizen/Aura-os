import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface Checklist {
  omManuals: boolean;
  asBuilts: boolean;
  testCertificates: boolean;
  warrantyDocs: boolean;
  training: boolean;
  spares: boolean;
}

interface HandoverPackage {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  status: string;
  checklist: Checklist;
  submittedAt: string | null;
  acceptedAt: string | null;
  clientRepresentative: string | null;
  warrantyStartDate: string | null;
  warrantyMonths: number | null;
  remarks: string | null;
  systemsTotal: number;
  systemsCommissioned: number;
}

export default async function HandoverPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pkg = await getJson<HandoverPackage>(`/api/commissioning/handovers/${id}`);
  if (!pkg) return <div style={{ padding: 40, color: '#666' }}>Handover package not found or API offline.</div>;

  const checkStatus = (ok: boolean) => (ok ? '✓ Complete' : '✗ Pending');

  return (
    <DocumentSheet
      kind="HANDOVER & ACCEPTANCE CERTIFICATE"
      reference={pkg.code}
      status={pkg.status}
      from={{ heading: 'Contractor', lines: ['AURA OS Systems Integration', 'Dubai, UAE', 'TRN 100000000000003'] }}
      to={{ heading: 'Client Acceptance', lines: [pkg.clientRepresentative || 'Client Representative', pkg.projectName || 'Project'] }}
      meta={[
        { label: 'Package Code', value: pkg.code },
        { label: 'Commissioned Systems', value: `${pkg.systemsCommissioned} / ${pkg.systemsTotal}` },
        ...(pkg.warrantyStartDate ? [{ label: 'Warranty Start Date', value: pkg.warrantyStartDate }] : []),
        ...(pkg.warrantyMonths ? [{ label: 'Warranty Period', value: `${pkg.warrantyMonths} Months` }] : []),
      ]}
      columns={[
        { key: 'deliverable', label: 'Handover Deliverable Item' },
        { key: 'status', label: 'Compliance Status', align: 'right' },
      ]}
      rows={[
        { deliverable: 'O&M Manuals', status: checkStatus(pkg.checklist.omManuals) },
        { deliverable: 'As-Built Drawings', status: checkStatus(pkg.checklist.asBuilts) },
        { deliverable: 'Test & Commissioning Certificates', status: checkStatus(pkg.checklist.testCertificates) },
        { deliverable: 'Warranty Documents', status: checkStatus(pkg.checklist.warrantyDocs) },
        { deliverable: 'Client Operational Training', status: checkStatus(pkg.checklist.training) },
        { deliverable: 'Spares & Consumables Handover', status: checkStatus(pkg.checklist.spares) },
      ]}
      notes={pkg.remarks || 'Project handover acceptance certificate. Signed acceptance signifies official system handover and activates the Defects Liability Period (DLP) warranty clock.'}
      signatures={['Project Manager', 'Client Representative Acceptance']}
    />
  );
}
