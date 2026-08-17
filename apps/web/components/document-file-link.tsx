'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isPdfContentType } from '@/lib/document-workflow';
import { openTab } from '@/lib/tabs';
import styles from './document-file-link.module.css';

interface VersionMetadata { version: number; contentType: string }
interface DocumentMetadata { document: { currentVersion: number }; versions: VersionMetadata[] }

export default function DocumentFileLink({ documentId, title, label = 'Open file' }: {
  documentId: string;
  title: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, { cache: 'no-store' });
      if (!response.ok) {
        setError(response.status === 403 ? 'Access denied' : 'File unavailable');
        return;
      }
      const metadata = await response.json() as DocumentMetadata;
      const current = metadata.versions.find((version) => version.version === metadata.document.currentVersion);
      if (!current) {
        setError('Current version unavailable');
        return;
      }
      const content = `/api/documents/${encodeURIComponent(documentId)}/content?version=${current.version}`;
      if (!isPdfContentType(current.contentType)) {
        window.location.assign(content);
        return;
      }
      const href = `/documents/${encodeURIComponent(documentId)}/pdf?version=${current.version}`;
      const query = searchParams.toString();
      const currentHref = query ? `${pathname}?${query}` : pathname;
      openTab({ href, title, type: 'PDF', key: `document-pdf:${documentId}` }, { afterHref: currentHref });
      router.push(href);
    } catch {
      setError('File service unavailable');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={styles.wrap}>
      <button type="button" className={styles.button} onClick={() => void open()} disabled={busy}>
        {busy ? 'Opening…' : label}
      </button>
      {error && <span className={styles.error} role="status">{error}</span>}
    </span>
  );
}
