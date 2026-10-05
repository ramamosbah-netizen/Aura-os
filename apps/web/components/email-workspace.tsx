'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Clock3, FileEdit, Inbox, Loader2, Paperclip, Search, Send } from 'lucide-react';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE, viewerTimeZone } from '@/lib/locale';
import styles from '@/components/email-workspace.module.css';

/**
 * The Email workspace inside Communication.
 *
 * It shows exactly what the backend can prove and nothing more. In particular a message whose
 * delivery outcome is UNKNOWN is never drawn as Sent or Failed — it gets its own folder and its
 * own words, because claiming either would tell the user something AURA never established.
 */

export type MailState =
  | 'draft' | 'scheduled' | 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'received' | 'needs_review';

export interface MailParticipantView {
  role: 'from' | 'to' | 'cc' | 'bcc';
  address: string | null;
  displayName?: string | null;
  userId?: string | null;
}

export interface MailView {
  id: string;
  state: MailState;
  direction: 'inbound' | 'outbound';
  subject: string;
  body: string;
  snippet: string | null;
  participants: MailParticipantView[];
  threadId: string;
  sentAt: string | null;
  failedReason: string | null;
  createdAt: string;
  accountId: string | null;
  /** Governed documents the message carries (F-09). */
  attachments?: MailAttachmentView[];
  /** The business records the message is about (MAIL-03…07). */
  links?: MailLinkView[];
}

export interface MailLinkView { id: string; recordType: string; recordId: string; recordLabel: string | null }

/** A record composed FROM: the message is linked to it on creation. */
interface ComposeAbout { recordType: string; recordId: string; label: string }

/** Where each kind of record lives, so a message's links open the record itself. */
const RECORD_HREF: Record<string, (id: string) => string> = {
  'crm.account': (id) => `/crm/accounts/${id}`,
  'crm.contact': (id) => `/crm/contacts/${id}`,
  'crm.lead': (id) => `/crm/leads/${id}`,
  'crm.opportunity': (id) => `/crm/opportunities/${id}`,
  'tendering.tender': (id) => `/tendering/tenders/${id}`,
  'procurement.supplier': (id) => `/procurement/suppliers?supplier=${id}`,
  'projects.project': (id) => `/project/${id}`,
};
const RECORD_NOUN: Record<string, string> = {
  'crm.account': 'Customer', 'crm.contact': 'Contact', 'crm.lead': 'Enquiry', 'crm.opportunity': 'Opportunity',
  'tendering.tender': 'Tender', 'procurement.supplier': 'Supplier', 'projects.project': 'Project',
};

export interface MailAccountView {
  id: string; provider: string; label: string; status: string; capabilities: string[];
}

type FolderId = 'inbox' | 'sent' | 'drafts' | 'scheduled' | 'needs-review';

const FOLDERS: Array<{ id: FolderId; label: string; icon: typeof Inbox }> = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileEdit },
  { id: 'scheduled', label: 'Scheduled', icon: Clock3 },
  { id: 'needs-review', label: 'Needs review', icon: AlertTriangle },
];

/**
 * How each state is described to a person.
 *
 * `needs_review` deliberately does not borrow the word "failed": AURA handed the message to a
 * provider that cannot confirm what became of it, and calling that a failure asserts something it
 * never established. Saying the status is uncertain is the only honest label.
 */
const STATE_LABEL: Record<MailState, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  queued: 'Queued to send',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
  received: 'Received',
  needs_review: 'Delivery status uncertain',
};

const stamp = (iso: string | null): string =>
  iso
    ? new Intl.DateTimeFormat(DISPLAY_LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: DISPLAY_TIME_ZONE }).format(new Date(iso))
    : '—';

const who = (mail: MailView, role: MailParticipantView['role']): string =>
  mail.participants
    .filter((p) => p.role === role)
    .map((p) => p.displayName || p.address || p.userId || '')
    .filter(Boolean)
    .join(', ') || '—';

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const res = await fetch(`/api/comms/mailbox/${path}`, { cache: 'no-store', ...init });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

export default function EmailWorkspace({ me, accounts, initialMailId = null }: {
  me: string; accounts: MailAccountView[]; initialMailId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [folder, setFolder] = useState<FolderId>('inbox');
  const [messages, setMessages] = useState<MailView[] | null>(null);
  const [loadError, setLoadError] = useState<'forbidden' | 'unreachable' | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialMailId);
  const [thread, setThread] = useState<MailView[] | null>(null);
  const [query, setQuery] = useState('');
  // Arriving from a record's "Email about this" opens the composer already about that record.
  const about: ComposeAbout | null = params.get('relatedType') && params.get('relatedId')
    ? { recordType: params.get('relatedType')!, recordId: params.get('relatedId')!, label: params.get('relatedLabel') || params.get('relatedId')! }
    : null;
  const [composing, setComposing] = useState(params.get('compose') === '1');
  // A saved draft reopened for editing (MAIL-10) — null when composing a new message.
  const [editing, setEditing] = useState<MailView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (which: FolderId, search: string) => {
    setMessages(null);
    setLoadError(null);
    const result = await call<MailView[]>(`folder/${which}${search ? `?q=${encodeURIComponent(search)}` : ''}`);
    if (!result.ok) {
      // A refusal is not an empty mailbox, and must never be drawn as one.
      setLoadError(result.status === 403 || result.status === 404 ? 'forbidden' : 'unreachable');
      setMessages([]);
      return;
    }
    setMessages(result.data);
  }, []);

  useEffect(() => { void load(folder, query); }, [folder, query, load]);

  const syncUrl = useCallback((mailId: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (mailId) next.set('mail', mailId); else next.delete('mail');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  const openById = useCallback(async (mailId: string, known?: MailView) => {
    setOpenId(mailId);
    setComposing(false);
    setThread(null);
    syncUrl(mailId);
    const result = await call<MailView[]>(`message/${mailId}/thread`);
    setThread(result.ok ? result.data : (known ? [known] : null));
    const target = result.ok ? result.data.find((m) => m.id === mailId) : known;
    // Mark read only for mail addressed to the caller; a sent item has nothing to mark.
    if (target?.direction === 'inbound') await call(`message/${mailId}/read`, { method: 'POST' });
  }, [syncUrl]);

  const open = useCallback((mail: MailView) => openById(mail.id, mail), [openById]);

  // A cold deep link opens the message even though it is not in the current folder listing. The ref
  // makes this idempotent rather than hiding the dependencies behind an empty list: once a message
  // is open, selections drive the URL, so re-running on a URL change would fight the user's own
  // navigation.
  const deepLinkOpened = useRef(false);
  useEffect(() => {
    if (deepLinkOpened.current || !initialMailId) return;
    deepLinkOpened.current = true;
    void openById(initialMailId);
  }, [initialMailId, openById]);

  const active = thread?.find((m) => m.id === openId) ?? messages?.find((m) => m.id === openId) ?? null;

  const refresh = useCallback(async () => {
    await load(folder, query);
    if (openId) {
      const result = await call<MailView[]>(`message/${openId}/thread`);
      if (result.ok) setThread(result.data);
    }
  }, [folder, query, load, openId]);

  return (
    <div className={styles.mail} data-testid="email-workspace">
      <aside className={styles.rail} aria-label="Mail folders">
        <button
          type="button"
          className={styles.compose}
          onClick={() => { setEditing(null); setComposing(true); setOpenId(null); syncUrl(null); }}
          data-testid="mail-compose"
        >
          Compose
        </button>
        {FOLDERS.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.id}
              type="button"
              className={`${styles.folder} ${folder === entry.id ? styles.folderActive : ''}`}
              onClick={() => { setFolder(entry.id); setOpenId(null); setComposing(false); syncUrl(null); }}
              aria-current={folder === entry.id ? 'true' : undefined}
              data-testid={`mail-folder-${entry.id}`}
            >
              <Icon aria-hidden />{entry.label}
            </button>
          );
        })}

        <label className={styles.search}>
          <Search aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mail" aria-label="Search mail" />
        </label>
      </aside>

      <section className={styles.list} aria-label="Messages">
        {messages === null ? (
          <p className={styles.loading}><Loader2 aria-hidden />Loading…</p>
        ) : loadError === 'forbidden' ? (
          <div className={styles.stateBox} data-testid="mail-forbidden">
            <strong>This mailbox is not yours to read</strong>
            <p>Ask an administrator if you believe you should have access.</p>
          </div>
        ) : loadError === 'unreachable' ? (
          <div className={styles.stateBox} data-testid="mail-unreachable">
            <strong>Mail is unavailable</strong>
            <p>The mail service could not be reached. Nothing was lost — retry shortly.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className={styles.stateBox} data-testid="mail-empty">
            <strong>Nothing in {FOLDERS.find((entry) => entry.id === folder)?.label}</strong>
            <p>{folder === 'needs-review' ? 'No message is waiting on a delivery decision.' : 'Messages will appear here.'}</p>
          </div>
        ) : (
          messages.map((mail) => (
            <button
              key={mail.id}
              type="button"
              className={`${styles.row} ${openId === mail.id ? styles.rowActive : ''}`}
              onClick={() => void open(mail)}
              data-testid="mail-row"
              data-mail-id={mail.id}
            >
              <span className={styles.rowMain}>
                <strong>{mail.subject || '(no subject)'}</strong>
                <small>{mail.direction === 'inbound' ? who(mail, 'from') : `To: ${who(mail, 'to')}`}</small>
                <small className={styles.snippet}>{mail.snippet || mail.body.slice(0, 90)}</small>
              </span>
              <span className={styles.rowSide}>
                <time dateTime={mail.sentAt ?? mail.createdAt}>{stamp(mail.sentAt ?? mail.createdAt)}</time>
                <span
                  className={`${styles.state} ${mail.state === 'needs_review' ? styles.stateUncertain : ''}`}
                  data-state={mail.state}
                >
                  {STATE_LABEL[mail.state]}
                </span>
              </span>
            </button>
          ))
        )}
      </section>

      <section className={styles.reader} aria-label="Message">
        {composing ? (
          <Composer
            key={editing?.id ?? 'new'}
            me={me}
            accounts={accounts}
            about={editing ? null : about}
            draft={editing}
            onCancel={() => { setComposing(false); setEditing(null); }}
            onDone={async (message, mailId) => {
              setComposing(false);
              setEditing(null);
              setNotice(message);
              await refresh();
              // Open what was just created, so the user is looking at the thing they acted on.
              await openById(mailId);
            }}
          />
        ) : !active ? (
          <div className={styles.placeholder} data-testid="mail-no-selection">
            <strong>Pick a message</strong>
            <p>It opens here, inside Communication.</p>
          </div>
        ) : (
          <MessageReader
            mail={active}
            thread={thread}
            accounts={accounts}
            onChanged={async (message) => { setNotice(message); await refresh(); }}
            onEdit={(draft) => { setEditing(draft); setComposing(true); }}
          />
        )}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      </section>
    </div>
  );
}

/**
 * The viewer's own zone, adopted only after mount.
 *
 * The zone is both sent to the API and shown on screen, and the server cannot know it: rendering
 * it directly made the server print one zone and the browser another, which is the hydration
 * mismatch that discards the subtree. Starting from the display policy and swapping after mount
 * keeps the server and the first client render identical, and every schedule the user submits
 * happens after mount — so the value that actually reaches the API is always their real zone.
 */
function useViewerTimeZone(): string {
  const [zone, setZone] = useState(DISPLAY_TIME_ZONE);
  useEffect(() => {
    setZone(viewerTimeZone());
  }, []);
  return zone;
}

function MessageReader({ mail, thread, accounts, onChanged, onEdit }: {
  mail: MailView;
  thread: MailView[] | null;
  accounts: MailAccountView[];
  onChanged: (message: string) => Promise<void>;
  /** Reopen a saved draft in the composer — the only way to correct one on screen. */
  onEdit?: (draft: MailView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [mode, setMode] = useState<'none' | 'reply' | 'replyAll' | 'forward'>('none');
  const [forwardTo, setForwardTo] = useState('');
  const [when, setWhen] = useState('');
  // The reader schedules in the reader's own zone, for the same reason the composer does: the
  // user picked a wall-clock time, and the API keeps the zone beside the instant.
  const timezone = useViewerTimeZone();

  const act = async (path: string, body: unknown, message: string) => {
    setBusy(true);
    const result = await call(path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    setBusy(false);
    await onChanged(result.ok ? message : 'That action could not be completed.');
    setMode('none');
    setReplyBody('');
  };

  return (
    <article className={styles.message} data-testid="mail-message">
      <header>
        <h3>{mail.subject || '(no subject)'}</h3>
        <p className={styles.meta}>
          <span>From: {who(mail, 'from')}</span>
          <span>To: {who(mail, 'to')}</span>
          {mail.participants.some((p) => p.role === 'cc') ? <span>CC: {who(mail, 'cc')}</span> : null}
          <time dateTime={mail.sentAt ?? mail.createdAt}>{stamp(mail.sentAt ?? mail.createdAt)}</time>
        </p>
        <span
          className={`${styles.state} ${mail.state === 'needs_review' ? styles.stateUncertain : ''}`}
          data-state={mail.state}
        >
          {STATE_LABEL[mail.state]}
        </span>
      </header>

      {mail.state === 'needs_review' ? (
        <p className={styles.uncertain} data-testid="mail-uncertain">
          <AlertTriangle aria-hidden />
          <span>
            <strong>AURA cannot confirm whether this was delivered.</strong>{' '}
            {mail.failedReason ?? 'It was interrupted while sending and the provider cannot say whether it went out. It has NOT been resent automatically, to avoid a duplicate.'}
          </span>
        </p>
      ) : null}
      {mail.state === 'failed' && mail.failedReason ? (
        <p className={styles.failed} role="alert" data-testid="mail-failed">{mail.failedReason}</p>
      ) : null}
      {/* THE WAY OUT OF NEEDS REVIEW (MAIL-10). A failed or uncertain message sat there with nothing
          its sender could do; it goes back to Drafts so it can be corrected and sent deliberately. */}
      {mail.state === 'failed' || mail.state === 'needs_review' ? (
        <p className={styles.hint}>
          <button type="button" disabled={busy} data-testid="mail-return-to-draft"
            onClick={() => void act(`message/${mail.id}/return-to-draft`, {}, 'Returned to Drafts — correct it, then send it again.')}>
            Return to Drafts
          </button>{' '}
          {mail.state === 'needs_review'
            ? 'It may already have arrived — sending it again may give the recipient a second copy.'
            : 'Correct what stopped it, then send it again.'}
        </p>
      ) : null}

      <div className={styles.body}>{mail.body}</div>

      {(mail.links ?? []).length > 0 ? (
        <p className={styles.hint} data-testid="mail-links">
          About:{' '}
          {(mail.links ?? []).map((link, i) => (
            <span key={link.id}>
              {i > 0 ? ' · ' : ''}
              <a href={(RECORD_HREF[link.recordType] ?? (() => '#'))(link.recordId)} data-testid={`mail-link-${link.recordType}`}>
                {RECORD_NOUN[link.recordType] ?? link.recordType} — {link.recordLabel ?? link.recordId}
              </a>
            </span>
          ))}
        </p>
      ) : null}

      {(mail.attachments ?? []).length > 0 ? (
        <ul className={styles.attachmentList} aria-label="Attachments" data-testid="mail-attachment-list">
          {(mail.attachments ?? []).map((a) => (
            <li key={a.id}>
              {/* Opened under the reader's OWN document access: the API checks the envelope and the
                  DMS checks them, so a link here is never a way round either. */}
              <a href={`/api/comms/mail-attachment/${mail.id}/${a.id}`} download={a.name} data-testid={`mail-attachment-link-${a.documentId}`}>
                <Paperclip aria-hidden />{a.name}
              </a>
              <small>rev {a.version} · {sizeLabel(a.sizeBytes)}</small>
            </li>
          ))}
        </ul>
      ) : null}

      {thread && thread.length > 1 ? (
        <details className={styles.thread} data-testid="mail-thread">
          <summary>{thread.length} messages in this conversation</summary>
          {thread.filter((m) => m.id !== mail.id).map((m) => (
            <p key={m.id}><strong>{who(m, 'from')}</strong> · {stamp(m.sentAt ?? m.createdAt)} — {m.snippet || m.body.slice(0, 80)}</p>
          ))}
        </details>
      ) : null}

      {mail.state === 'draft' || mail.state === 'scheduled' ? (
        <div className={styles.replyBox} data-testid="mail-schedule-box">
          <label className={styles.hint} htmlFor="reader-schedule-at">
            {mail.state === 'scheduled' ? 'Reschedule' : 'Schedule this message'} ({timezone})
          </label>
          <input
            id="reader-schedule-at"
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            aria-label="Schedule date and time"
            data-testid="mail-reader-schedule-at"
          />
          <button
            type="button"
            disabled={busy || !when}
            onClick={() => void act(`message/${mail.id}/schedule`, { localDateTime: when, timezone }, `Scheduled for ${when} (${timezone}).`)}
            data-testid="mail-reader-schedule"
          >
            {mail.state === 'scheduled' ? 'Reschedule' : 'Schedule'}
          </button>
        </div>
      ) : null}

      <div className={styles.actions}>
        {mail.state === 'draft' && onEdit ? (
          <button type="button" disabled={busy} onClick={() => onEdit(mail)} data-testid="mail-edit-draft">Edit</button>
        ) : null}
        {mail.state === 'draft' ? (
          <button type="button" disabled={busy} onClick={() => void act(`message/${mail.id}/send`, {}, 'Queued to send.')} data-testid="mail-send-draft">Send</button>
        ) : null}
        {mail.state === 'scheduled' || mail.state === 'queued' ? (
          <button type="button" disabled={busy} onClick={() => void act(`message/${mail.id}/cancel`, {}, 'Cancelled — it will not be sent.')} data-testid="mail-cancel">Cancel send</button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => setMode('reply')} data-testid="mail-reply">Reply</button>
        <button type="button" disabled={busy} onClick={() => setMode('replyAll')} data-testid="mail-reply-all">Reply all</button>
        <button type="button" disabled={busy} onClick={() => setMode('forward')} data-testid="mail-forward">Forward</button>
      </div>

      {mode !== 'none' ? (
        <div className={styles.replyBox}>
          {mode === 'forward' ? (
            <input value={forwardTo} onChange={(event) => setForwardTo(event.target.value)} placeholder="name@example.com" aria-label="Forward to" data-testid="mail-forward-to" />
          ) : null}
          <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="Write your message" aria-label="Reply body" rows={4} data-testid="mail-reply-body" />
          <button
            type="button"
            disabled={busy || (mode === 'forward' && !forwardTo.trim())}
            onClick={() => void (mode === 'forward'
              ? act(`message/${mail.id}/forward`, { to: [forwardTo.trim()], body: replyBody }, 'Forward saved as a draft.')
              : act(`message/${mail.id}/reply`, { body: replyBody, all: mode === 'replyAll' }, 'Reply saved as a draft.'))}
            data-testid="mail-reply-submit"
          >
            {mode === 'forward' ? 'Create forward' : 'Create reply'}
          </button>
          {mode === 'forward' && (mail.attachments ?? []).length > 0 ? (
            <p className={styles.hint} data-testid="mail-forward-attachments-note">Attachments are not forwarded — attach them again to the new draft, where who can open them is checked.</p>
          ) : null}
          {/* Honest: the domain creates a draft, and sending stays a separate, explicit act. */}
          <p className={styles.hint}>This creates a draft you can review before sending. {accounts.length} account(s) available.</p>
        </div>
      ) : null}
    </article>
  );
}

/** A governed document carried by a message (F-09): a reference at the revision that was attached. */
export interface MailAttachmentView {
  id: string; documentId: string; version: number; name: string; mime: string; sizeBytes: number;
}

/** The API's answer to "who on this envelope could not open each attachment". */
interface AttachmentAccessView {
  attachmentId: string;
  documentId: string;
  name: string;
  version: number;
  cannotOpen: Array<{ userId: string | null; address: string | null; why: 'no-access' | 'outside-aura' }>;
  senderMayShare: boolean;
}

interface DirectoryPerson { username: string; roleLabel: string }
interface DocumentSummary { id: string; title: string; kind: string; currentVersion: number }

/** Like `call`, but keeps the API's own sentence when it refuses — the sender needs to read why. */
async function callWithReason<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; reason: string | null }> {
  try {
    const res = await fetch(path.startsWith('/') ? path : `/api/comms/mailbox/${path}`, { cache: 'no-store', ...init });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      const reason = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message ?? null;
      return { ok: false, status: res.status, reason };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, reason: null };
  }
}

const sizeLabel = (bytes: number): string =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

function Composer({ me, accounts, about, draft = null, onDone, onCancel }: {
  me: string; accounts: MailAccountView[]; onDone: (message: string, mailId: string) => Promise<void>;
  /** A saved draft to continue — its recipients, subject, body and attachments are where it left them. */
  draft?: MailView | null;
  /** The record this message is composed from (MAIL-03…07); linked when the draft is created. */
  about?: ComposeAbout | null;
  /** Abandon the message. A composer you cannot back out of traps the user in it. */
  onCancel: () => void;
}) {
  const sendable = useMemo(
    () => accounts.filter((account) => account.status === 'connected' && account.capabilities.includes('send')),
    [accounts],
  );
  const canSchedule = useMemo(
    () => sendable.some((account) => account.capabilities.includes('scheduled_send')),
    [sendable],
  );

  // Addresses typed by hand are the participants with no AURA user; colleagues are the ones with one.
  const typed = (role: string) => (draft?.participants ?? [])
    .filter((p) => p.role === role && !p.userId && p.address).map((p) => p.address).join(', ');
  const [accountId, setAccountId] = useState(draft?.accountId ?? sendable[0]?.id ?? '');
  const [to, setTo] = useState(typed('to'));
  const [cc, setCc] = useState(typed('cc'));
  const [bcc, setBcc] = useState(typed('bcc'));
  const [subject, setSubject] = useState(draft?.subject ?? '');
  const [body, setBody] = useState(draft?.body ?? '');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Discarding typed content is destructive and unrecoverable, so a dirty composer asks once.
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // ── AURA colleagues, addressed as users rather than as strings that look like addresses ──
  const [people, setPeople] = useState<DirectoryPerson[] | null>(null);
  const [colleagues, setColleagues] = useState<string[]>(
    (draft?.participants ?? []).filter((p) => p.role === 'to' && p.userId).map((p) => p.userId as string),
  );
  useEffect(() => {
    let live = true;
    void callWithReason<DirectoryPerson[]>('/api/comms/people').then((result) => {
      if (live) setPeople(result.ok ? result.data : []);
    });
    return () => { live = false; };
  }, []);

  // ── Governed attachments (F-09) ──
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [attachments, setAttachments] = useState<MailAttachmentView[]>(draft?.attachments ?? []);
  const [access, setAccess] = useState<AttachmentAccessView[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [docQuery, setDocQuery] = useState('');
  const account = sendable.find((a) => a.id === accountId);
  const canAttach = Boolean(account?.capabilities.includes('attachments'));

  // The user's own zone, so "08:00" means 08:00 where they are. The API converts to UTC and keeps
  // the chosen zone beside it, which is what lets the choice be shown back to them afterwards.
  const timezone = useViewerTimeZone();
  const split = (value: string): string[] => value.split(/[,;]/).map((entry) => entry.trim()).filter(Boolean);
  const envelope = () => ({
    accountId: accountId || null,
    to: [...colleagues.map((userId) => ({ role: 'to', address: null, userId })), ...split(to)],
    cc: split(cc),
    bcc: split(bcc),
    subject,
    body,
    // Read by the API only when the draft is CREATED; an edit never rewrites what a message is about.
    ...(about ? { relatedTo: [{ recordType: about.recordType, recordId: about.recordId }] } : {}),
  });

  /**
   * The message as a draft on the server, created once and kept current. An attachment needs a
   * message to belong to, so the first one saves the draft; every later step patches it.
   */
  async function ensureDraft(): Promise<string | null> {
    const result = draftId
      ? await callWithReason<{ id: string }>(`drafts/${draftId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope()) })
      : await callWithReason<{ id: string }>('drafts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope()) });
    if (!result.ok) { setError(result.reason ?? 'The draft could not be saved.'); return null; }
    if (!draftId) setDraftId(result.data.id);
    return result.data.id;
  }

  /** Who could not open what, asked of the API against the envelope as it stands now. */
  async function checkAccess(id: string): Promise<AttachmentAccessView[] | null> {
    const result = await callWithReason<AttachmentAccessView[]>(`message/${id}/attachment-access`);
    if (!result.ok) { setError(result.reason ?? 'Could not check who can open the attachments.'); return null; }
    setAccess(result.data);
    return result.data;
  }

  async function openPicker() {
    setPicking(true);
    if (documents !== null) return;
    const result = await callWithReason<DocumentSummary[]>('/api/documents');
    setDocuments(result.ok ? result.data : []);
    if (!result.ok) setError(result.reason ?? 'AURA Documents could not be listed.');
  }

  async function attach(documentId: string) {
    setBusy(true);
    setError(null);
    const id = await ensureDraft();
    if (id) {
      const result = await callWithReason<{ attachments?: MailAttachmentView[] }>(`drafts/${id}/attachments`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documentId }),
      });
      if (result.ok) {
        setAttachments(result.data.attachments ?? []);
        setPicking(false);
        await checkAccess(id);
      } else {
        setError(result.reason ?? 'The document could not be attached.');
      }
    }
    setBusy(false);
  }

  async function detach(attachmentId: string) {
    if (!draftId) return;
    setBusy(true);
    const result = await callWithReason<{ attachments?: MailAttachmentView[] }>(`drafts/${draftId}/attachments/${attachmentId}`, { method: 'DELETE' });
    if (result.ok) {
      setAttachments(result.data.attachments ?? []);
      await checkAccess(draftId);
    } else {
      setError(result.reason ?? 'The attachment could not be removed.');
    }
    setBusy(false);
  }

  /**
   * Give one colleague DOWNLOAD on one document — the DMS's own share, made by the sender as an
   * explicit act and recorded there. Mail grants nothing; this button is only offered where the DMS
   * says the sender may share, and the DMS checks again when it is pressed.
   */
  async function giveAccess(documentId: string, userId: string) {
    setBusy(true);
    setError(null);
    const result = await callWithReason(`/api/documents/${documentId}/share`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subjectType: 'USER', subjectId: userId, permission: 'DOWNLOAD' }),
    });
    if (!result.ok) setError(result.reason ?? 'Access could not be given.');
    if (draftId) await checkAccess(draftId);
    setBusy(false);
  }

  // Recipients changed after something was attached: what was openable may no longer be.
  async function recheck() {
    if (!draftId || attachments.length === 0) return;
    const id = await ensureDraft();
    if (id) await checkAccess(id);
  }
  useEffect(() => { void recheck(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [colleagues]);

  /** Create the draft and stop. The backend owns every state after this. */
  async function saveDraft(): Promise<string | null> {
    setBusy(true);
    setError(null);
    const id = await ensureDraft();
    setBusy(false);
    if (!id) return null;
    await onDone('Saved to Drafts.', id);
    return id;
  }

  async function submit(schedule: boolean) {
    setBusy(true);
    setError(null);
    const id = await ensureDraft();
    if (!id) { setBusy(false); return; }
    if (attachments.length > 0) {
      const now = await checkAccess(id);
      if (!now || now.some((a) => a.cannotOpen.length > 0)) {
        setBusy(false);
        setError('Saved as a draft. It cannot be sent until everyone on it can open what it carries — see above.');
        return;
      }
    }

    const followUp = schedule
      ? await callWithReason(`message/${id}/schedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ localDateTime: when, timezone }),
      })
      : await callWithReason(`message/${id}/send`, { method: 'POST' });

    setBusy(false);
    if (!followUp.ok) {
      // Precise about what did and did not happen: the draft exists either way.
      setError(followUp.reason
        ? `Saved as a draft, but it was not ${schedule ? 'scheduled' : 'queued'}: ${followUp.reason}`
        : schedule
          ? 'Saved as a draft, but scheduling failed — it will not send.'
          : 'Saved as a draft, but it could not be queued.');
      return;
    }
    await onDone(schedule ? `Scheduled for ${when} (${timezone}).` : 'Queued to send.', id);
  }

  const blocked = (access ?? []).filter((a) => a.cannotOpen.length > 0);
  const hasRecipient = colleagues.length > 0 || to.trim().length > 0;
  const matches = (documents ?? []).filter((d) => d.title.toLowerCase().includes(docQuery.trim().toLowerCase()));
  const attachedIds = new Set(attachments.map((a) => a.documentId));

  return (
    <form className={styles.composer} data-testid="mail-composer" onInput={() => setConfirmDiscard(false)} onSubmit={(event) => { event.preventDefault(); void submit(false); }}>
      <h3>New message</h3>
      {about ? (
        <p className={styles.hint} data-testid="mail-about">
          About {RECORD_NOUN[about.recordType] ?? 'record'} — <strong>{about.label}</strong>. The message is linked to it when saved,
          and shows on that record to you and to the people it is sent to — nobody else.
        </p>
      ) : null}

      <label>
        From
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)} aria-label="Send from account" data-testid="mail-account">
          {sendable.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      {/* Only accounts an administrator actually connected appear here. Nothing in this form
          implies Gmail or Outlook is available before one is configured. */}
      {accounts.length > sendable.length ? (
        <p className={styles.hint}>{accounts.length - sendable.length} configured account(s) are not connected yet, so they cannot send.</p>
      ) : null}

      <label>
        AURA colleagues
        <select
          value=""
          onChange={(event) => { const u = event.target.value; if (u && !colleagues.includes(u)) setColleagues([...colleagues, u]); }}
          aria-label="Add an AURA colleague"
          data-testid="mail-colleague-select"
          disabled={people === null}
        >
          <option value="">{people === null ? 'Loading the directory…' : 'Add a colleague…'}</option>
          {(people ?? []).filter((p) => !colleagues.includes(p.username)).map((p) => (
            <option key={p.username} value={p.username}>{p.username} — {p.roleLabel}</option>
          ))}
        </select>
      </label>
      {colleagues.length > 0 ? (
        <p className={styles.chips} data-testid="mail-colleagues">
          {colleagues.map((u) => (
            <span key={u} className={styles.chip} data-testid={`mail-colleague-${u}`}>
              {u}
              <button type="button" aria-label={`Remove ${u}`} onClick={() => setColleagues(colleagues.filter((c) => c !== u))}>×</button>
            </span>
          ))}
        </p>
      ) : null}

      {/* NOTHING CARRIES MAIL OUT OF AURA YET (MAIL-10). Typed addresses are outside AURA; on internal
          mail they would fail at delivery, so the composer says so before the user relies on it. */}
      {accountId === 'aura-internal' && [to, cc, bcc].some((v) => v.trim()) ? (
        <p className={styles.failed} role="note" data-testid="mail-outside-warning">
          AURA internal mail reaches AURA users only. The addresses typed below are outside AURA, and no external
          mail account is connected to carry them — the message will fail for them. Choose colleagues above instead.
        </p>
      ) : null}
      <label>To (email addresses)<input value={to} onChange={(event) => setTo(event.target.value)} onBlur={() => void recheck()} placeholder="name@example.com" aria-label="To" data-testid="mail-to" /></label>
      <label>CC<input value={cc} onChange={(event) => setCc(event.target.value)} onBlur={() => void recheck()} aria-label="CC" data-testid="mail-cc" /></label>
      <label>BCC<input value={bcc} onChange={(event) => setBcc(event.target.value)} onBlur={() => void recheck()} aria-label="BCC" data-testid="mail-bcc" /></label>
      <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Subject" data-testid="mail-subject" /></label>
      <label>Message<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} aria-label="Message" data-testid="mail-body" /></label>

      <section className={styles.attachments} aria-label="Attachments" data-testid="mail-attachments">
        {attachments.map((a) => (
          <span key={a.id} className={styles.chip} data-testid={`mail-attachment-${a.documentId}`}>
            <Paperclip aria-hidden />{a.name} · rev {a.version} · {sizeLabel(a.sizeBytes)}
            <button type="button" aria-label={`Remove ${a.name}`} disabled={busy} onClick={() => void detach(a.id)}>×</button>
          </span>
        ))}
        {canAttach ? (
          <button type="button" className={styles.attachButton} disabled={busy} onClick={() => void openPicker()} data-testid="mail-attach-open">
            <Paperclip aria-hidden />Attach from AURA Documents
          </button>
        ) : (
          <p className={styles.attachHint}><Paperclip aria-hidden />This account cannot carry attachments.</p>
        )}
      </section>

      {picking ? (
        <div className={styles.picker} role="dialog" aria-label="Attach from AURA Documents" data-testid="mail-doc-picker">
          <input value={docQuery} onChange={(event) => setDocQuery(event.target.value)} placeholder="Find a document by title" aria-label="Find a document" data-testid="mail-doc-search" autoFocus />
          {documents === null ? (
            <p className={styles.hint}><Loader2 aria-hidden />Loading the documents you may see…</p>
          ) : matches.length === 0 ? (
            <p className={styles.hint}>{documents.length === 0 ? 'You may not see any documents.' : 'No document matches that title.'}</p>
          ) : (
            <ul>
              {matches.slice(0, 20).map((d) => (
                <li key={d.id}>
                  <span><strong>{d.title}</strong> <small>{d.kind} · rev {d.currentVersion}</small></span>
                  <button type="button" disabled={busy || attachedIds.has(d.id)} onClick={() => void attach(d.id)} data-testid={`mail-doc-attach-${d.id}`}>
                    {attachedIds.has(d.id) ? 'Attached' : 'Attach'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {matches.length > 20 ? <p className={styles.hint}>Showing 20 of {matches.length} — refine the title to find the rest.</p> : null}
          <button type="button" onClick={() => setPicking(false)} data-testid="mail-doc-picker-close">Close</button>
        </div>
      ) : null}

      {blocked.length > 0 ? (
        <div className={styles.failed} role="alert" data-testid="mail-access-warning">
          <strong>Not everyone on this message can open what it carries.</strong>
          <ul>
            {blocked.flatMap((a) => a.cannotOpen.map((who) => (
              <li key={`${a.attachmentId}-${who.userId ?? who.address}`}>
                {who.why === 'outside-aura'
                  ? <>{who.address} is outside AURA and cannot receive “{a.name}”.</>
                  : <>{who.userId} cannot open “{a.name}”. </>}
                {who.why === 'no-access' && who.userId && a.senderMayShare ? (
                  <button type="button" disabled={busy} onClick={() => void giveAccess(a.documentId, who.userId!)} data-testid={`mail-give-access-${who.userId}`}>
                    Give {who.userId} download access
                  </button>
                ) : who.why === 'no-access' ? (
                  <em> You may not share this document — ask someone who can, or remove it.</em>
                ) : null}
              </li>
            )))}
          </ul>
        </div>
      ) : null}

      {error ? <p className={styles.failed} role="alert">{error}</p> : null}

      <div className={styles.composerActions}>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const dirty = [to, cc, bcc, subject, body].some((v) => v.trim().length > 0) || colleagues.length > 0 || attachments.length > 0;
            if (!dirty || confirmDiscard) {
              // A draft saved only to hold attachments goes with the message the user discarded.
              if (draftId) void callWithReason(`drafts/${draftId}`, { method: 'DELETE' });
              onCancel();
              return;
            }
            setConfirmDiscard(true);
          }}
          data-testid="mail-cancel-compose"
        >
          {confirmDiscard ? 'Discard message?' : 'Cancel'}
        </button>
        <button type="button" disabled={busy} onClick={() => void saveDraft()} data-testid="mail-save-draft">Save draft</button>
        <button type="submit" disabled={busy || !hasRecipient || blocked.length > 0} data-testid="mail-send-now">Send now</button>
        {canSchedule ? (
          <>
            <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} aria-label="Schedule date and time" data-testid="mail-schedule-at" />
            <span className={styles.hint}>{timezone}</span>
            <button type="button" disabled={busy || !hasRecipient || !when || blocked.length > 0} onClick={() => void submit(true)} data-testid="mail-schedule">Schedule</button>
          </>
        ) : (
          <span className={styles.hint}>No connected account supports scheduled send.</span>
        )}
      </div>
      <p className={styles.hint}>Signed in as {me}.</p>
    </form>
  );
}
