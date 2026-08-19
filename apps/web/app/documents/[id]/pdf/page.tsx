import type { Document, DocumentVersion } from '@aura/shared';
import AuraTabLink from '@/components/aura-tab-link';
import DocumentPdfWorkspace from '@/components/document-pdf-workspace';
import { fetchJson } from '@/lib/api';
import { isPdfContentType } from '@/lib/document-workflow';
import styles from '@/components/document-pdf-workspace.module.css';

export const dynamic = 'force-dynamic';

interface DocumentWithVersions {
  document: Document;
  versions: DocumentVersion[];
}

interface DocumentAccess { permissions: string[] }

export default async function DocumentPdfPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [result, access] = await Promise.all([
    fetchJson<DocumentWithVersions>(`/api/documents/${encodeURIComponent(id)}`),
    fetchJson<DocumentAccess>(`/api/documents/${encodeURIComponent(id)}/access`),
  ]);
  if (!result.ok) {
    const message = result.error.status === 401
      ? 'Sign in to open this document.'
      : result.error.status === 403 || result.error.status === 404
        ? 'This document is unavailable or you do not have permission to view it.'
        : 'The document service is unavailable.';
    return <main className={styles.unsupported}><h1>PDF unavailable</h1><p>{message}</p><AuraTabLink href="/documents" tabTitle="Documents" tabType="Workspace">Back to Documents</AuraTabLink></main>;
  }

  if (!access.ok || !access.data.permissions.includes('DOWNLOAD')) {
    return <main className={styles.unsupported}><h1>PDF access required</h1><p>You may be allowed to review the document record without being allowed to open its file. DOWNLOAD permission is required for PDF content.</p><AuraTabLink href={`/documents?record=${encodeURIComponent(id)}`} tabTitle={result.data.document.title} tabType="Document">Open document record</AuraTabLink></main>;
  }

  const requested = query.version ? Number(query.version) : result.data.document.currentVersion;
  const version = Number.isInteger(requested) && requested > 0
    ? result.data.versions.find((candidate) => candidate.version === requested)
    : undefined;
  if (!version || !isPdfContentType(version.contentType)) {
    return (
      <main className={styles.unsupported}>
        <h1>{version ? 'This file is not a PDF' : 'PDF version unavailable'}</h1>
        <p>{version ? 'AURA only renders application/pdf inline. Download the original file from Documents.' : 'The requested immutable version does not exist or is no longer available to this account.'}</p>
        <AuraTabLink href={`/documents?record=${encodeURIComponent(id)}`} tabTitle={result.data.document.title} tabType="Document">Open document record</AuraTabLink>
      </main>
    );
  }
  const safeVersion = {
    version: version.version,
    fileName: version.fileName,
    contentType: version.contentType,
    sizeBytes: version.sizeBytes,
    uploadedAt: version.uploadedAt,
    note: version.note,
  };
  return <DocumentPdfWorkspace document={result.data.document} version={safeVersion} />;
}
