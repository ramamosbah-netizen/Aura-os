'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

/** The kinds of record a message can be about (MAIL-03…07) — the API's own vocabulary. */
export type CorrespondenceRecordType =
  | 'crm.account' | 'crm.contact' | 'crm.lead' | 'crm.opportunity' | 'tendering.tender' | 'procurement.supplier' | 'projects.project';

interface LinkedMail {
  id: string;
  subject: string;
  state: string;
  sentAt: string | null;
  createdAt: string;
  participants: Array<{ role: string; address: string | null; displayName: string | null; userId: string | null }>;
}

const when = (iso: string): string =>
  new Date(iso).toLocaleString(DISPLAY_LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: DISPLAY_TIME_ZONE });

/** What a reader calls each kind of record, for "No correspondence about this …". */
const NOUN: Record<CorrespondenceRecordType, string> = {
  'crm.account': 'customer', 'crm.contact': 'contact', 'crm.lead': 'enquiry', 'crm.opportunity': 'opportunity',
  'tendering.tender': 'tender', 'procurement.supplier': 'supplier', 'projects.project': 'project',
};

/**
 * MAIL-03…MAIL-07 — a business record's correspondence, on the record itself.
 *
 * Lists the messages linked to this record that THIS viewer could already read — their own drafts,
 * and messages they sent or received — and opens a new message composed FROM the record, so the link
 * is made where the work is rather than typed in afterwards. Somebody else's mail about the record is
 * not shown: linking a message to a record widens nothing.
 */
export default function RecordCorrespondence({ recordType, recordId, label, compact = false }: {
  recordType: CorrespondenceRecordType;
  recordId: string;
  /** The record's name, carried into the composer so the new message says what it is about. */
  label: string;
  compact?: boolean;
}) {
  const [items, setItems] = useState<LinkedMail[] | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams({ recordType, recordId });
    void fetch(`/api/comms/mailbox/related?${qs.toString()}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!live) return;
        if (r.status === 403 || r.status === 404) { setRefused('Correspondence is not available to you for this record.'); setItems([]); return; }
        if (!r.ok) { setRefused('Correspondence could not be read just now.'); setItems([]); return; }
        setItems((await r.json()) as LinkedMail[]);
      })
      .catch(() => { if (live) { setRefused('Correspondence could not be read just now.'); setItems([]); } });
    return () => { live = false; };
  }, [recordType, recordId]);

  const compose = `/my-work/communication?${new URLSearchParams({ view: 'email', compose: '1', relatedType: recordType, relatedId: recordId, relatedLabel: label }).toString()}`;
  const fromOf = (mail: LinkedMail) => {
    const from = mail.participants.find((p) => p.role === 'from');
    return from?.displayName || from?.address || from?.userId || 'unknown sender';
  };

  return (
    <section style={compact ? st.compact : st.wrap} data-testid="record-correspondence" aria-label="Correspondence">
      <div style={st.head}>
        <span style={st.title}>Correspondence</span>
        <a href={compose} style={st.action} data-testid="correspondence-compose">✉ Email about this {NOUN[recordType]}</a>
      </div>
      {items === null ? (
        <p style={st.muted}>Reading correspondence…</p>
      ) : refused ? (
        <p style={st.muted} data-testid="correspondence-refused">{refused}</p>
      ) : items.length === 0 ? (
        <p style={st.muted} data-testid="correspondence-empty">No correspondence you can read is linked to this {NOUN[recordType]} yet.</p>
      ) : (
        <ul style={st.list}>
          {items.map((mail) => (
            <li key={mail.id} style={st.item} data-testid={`correspondence-item-${mail.id}`}>
              <a href={`/my-work/communication?mail=${encodeURIComponent(mail.id)}`} style={st.subject}>{mail.subject || '(no subject)'}</a>
              <span style={st.meta}>
                {mail.state === 'draft' ? 'your draft' : mail.state} · {fromOf(mail)} · {when(mail.sentAt ?? mail.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const st = {
  wrap: { margin: '0 0 12px', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)', fontSize: 13 } as CSSProperties,
  compact: { padding: '8px 0', fontSize: 13 } as CSSProperties,
  head: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 } as CSSProperties,
  title: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--accent)' } as CSSProperties,
  action: { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', fontSize: 12.5 } as CSSProperties,
  muted: { color: 'var(--muted)', margin: 0, fontSize: 12.5 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 } as CSSProperties,
  item: { display: 'grid', gap: 1 } as CSSProperties,
  subject: { color: 'var(--text)', fontWeight: 600, textDecoration: 'none' } as CSSProperties,
  meta: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
};
