'use client';

import { useState } from 'react';
import type { Document, DocumentVersion } from '@aura/shared';
import { Download, ExternalLink, FileText, Send, ShieldCheck } from 'lucide-react';
import AuraTabAnchor from '@/components/aura-tab-anchor';
import AuraTabLink from '@/components/aura-tab-link';
import { resolveDocumentOwner, resolveDocumentSubmission } from '@/lib/document-workflow';
import { DISPLAY_LOCALE } from '@/lib/locale';
import styles from './document-pdf-workspace.module.css';

type SafeVersion = Pick<DocumentVersion, 'version' | 'fileName' | 'contentType' | 'sizeBytes' | 'uploadedAt' | 'note'>;

export default function DocumentPdfWorkspace({ document, version }: { document: Document; version: SafeVersion }) {
  const owner = resolveDocumentOwner(document);
  const submission = resolveDocumentSubmission(document);
  const href = `/documents/${encodeURIComponent(document.id)}/pdf?version=${version.version}`;
  const contentHref = `/api/documents/${encodeURIComponent(document.id)}/content?version=${version.version}`;
  const previewHref = `${contentHref}&inline=true`;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  async function submitToOwner(): Promise<void> {
    if (!submission || busy || submitted) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(submission.endpoint, {
        method: submission.method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        setSubmitted(true);
        setConfirming(false);
        setMessage({ tone: 'success', text: `Submitted through ${submission.label}. The source domain now owns the next workflow state.` });
        return;
      }
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
      const text = response.status === 401
        ? 'Your session has expired. Sign in again before submitting.'
        : response.status === 403
          ? 'You do not have submit authority for the source record.'
          : response.status === 409 || response.status === 400
            ? payload.message ?? 'The source record is not ready to submit or is already beyond draft.'
            : 'The source workspace could not submit this record.';
      setMessage({ tone: 'error', text });
    } catch {
      setMessage({ tone: 'error', text: 'The source workspace is unavailable. Nothing was submitted.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page} data-testid="pdf-document-workspace">
      <AuraTabAnchor href={href} title={document.title} type="PDF" tabKey={`document-pdf:${document.id}`} />
      <header className={styles.topbar}>
        <div>
          <span className={styles.eyebrow}>DOCUMENT · PDF VIEWER</span>
          <h1>{document.title}</h1>
          <p>{version.fileName} · Version {version.version}</p>
        </div>
        <div className={styles.actions}>
          <a className={styles.action} href={contentHref}><Download size={15} aria-hidden />Download</a>
          {owner && <AuraTabLink className={styles.action} href={owner.href} tabTitle={document.title} tabType={owner.label}><ExternalLink size={15} aria-hidden />Open source</AuraTabLink>}
          {submission ? (
            <button className={styles.submit} type="button" onClick={() => setConfirming(true)} disabled={busy || submitted} data-testid="document-submit">
              <Send size={15} aria-hidden />{submitted ? 'Submitted' : 'Submit'}
            </button>
          ) : (
            <button className={styles.disabled} type="button" disabled title="No verified source-domain submit command is connected for this document type">
              <Send size={15} aria-hidden />Submit unavailable
            </button>
          )}
        </div>
      </header>

      <div className={styles.layout}>
        <section className={styles.viewer} aria-label={`PDF preview for ${document.title}`}>
          <iframe src={previewHref} title={`PDF preview: ${document.title}`} />
        </section>
        <aside className={styles.side}>
          <section className={styles.card}>
            <h2>Document context</h2>
            <dl className={styles.facts}>
              <div><dt>File</dt><dd>{version.fileName}</dd></div>
              <div><dt>Version</dt><dd>v{version.version}</dd></div>
              <div><dt>Type</dt><dd>{document.kind}</dd></div>
              <div><dt>Source owner</dt><dd>{owner?.label ?? `${document.aggregateType}:${document.aggregateId}`}</dd></div>
              <div><dt>Size</dt><dd>{new Intl.NumberFormat(DISPLAY_LOCALE).format(version.sizeBytes)} bytes</dd></div>
            </dl>
          </section>
          <section className={styles.card}>
            <h2><ShieldCheck size={15} aria-hidden /> Workflow boundary</h2>
            <p className={styles.boundary}>DMS owns this immutable file version. The linked domain owns submission and later approval decisions. AURA never creates a second copy of that workflow here.</p>
            {!submission && (
              <p className={styles.notConnected}><FileText size={14} aria-hidden /><b>NOT IMPLEMENTED</b> Source submission is not connected for this document type.</p>
            )}
            {confirming && submission && !submitted && (
              <div className={styles.confirm} role="dialog" aria-label="Confirm document submission">
                <p>Submit the linked {submission.label.toLowerCase()} to its source workflow? The source module will verify your permission and current record state.</p>
                <div className={styles.confirmActions}>
                  <button className={styles.submit} type="button" onClick={() => void submitToOwner()} disabled={busy}>{busy ? 'Submitting…' : 'Confirm submit'}</button>
                  <button className={styles.cancel} type="button" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
                </div>
              </div>
            )}
            {message && <p className={`${styles.status} ${styles[message.tone]}`} role="status">{message.text}</p>}
          </section>
        </aside>
      </div>
    </main>
  );
}
