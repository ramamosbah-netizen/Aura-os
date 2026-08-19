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
}

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
  const [composing, setComposing] = useState(false);
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
          onClick={() => { setComposing(true); setOpenId(null); syncUrl(null); }}
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
            me={me}
            accounts={accounts}
            onDone={async (message, mailId) => {
              setComposing(false);
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

function MessageReader({ mail, thread, accounts, onChanged }: {
  mail: MailView;
  thread: MailView[] | null;
  accounts: MailAccountView[];
  onChanged: (message: string) => Promise<void>;
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
        <p className={styles.failed} role="alert">{mail.failedReason}</p>
      ) : null}

      <div className={styles.body}>{mail.body}</div>

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
          {/* Honest: the domain creates a draft, and sending stays a separate, explicit act. */}
          <p className={styles.hint}>This creates a draft you can review before sending. {accounts.length} account(s) available.</p>
        </div>
      ) : null}
    </article>
  );
}

function Composer({ me, accounts, onDone }: {
  me: string; accounts: MailAccountView[]; onDone: (message: string, mailId: string) => Promise<void>;
}) {
  const sendable = useMemo(
    () => accounts.filter((account) => account.status === 'connected' && account.capabilities.includes('send')),
    [accounts],
  );
  const canSchedule = useMemo(
    () => sendable.some((account) => account.capabilities.includes('scheduled_send')),
    [sendable],
  );

  const [accountId, setAccountId] = useState(sendable[0]?.id ?? '');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The user's own zone, so "08:00" means 08:00 where they are. The API converts to UTC and keeps
  // the chosen zone beside it, which is what lets the choice be shown back to them afterwards.
  const timezone = useViewerTimeZone();
  const split = (value: string): string[] => value.split(/[,;]/).map((entry) => entry.trim()).filter(Boolean);

  /** Create the draft and stop. The backend owns every state after this. */
  async function saveDraft(): Promise<string | null> {
    setBusy(true);
    setError(null);
    const draft = await call<{ id: string }>('drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: accountId || null, to: split(to), cc: split(cc), bcc: split(bcc), subject, body }),
    });
    setBusy(false);
    if (!draft.ok) { setError('The draft could not be saved.'); return null; }
    await onDone('Saved to Drafts.', draft.data.id);
    return draft.data.id;
  }

  async function submit(schedule: boolean) {
    setBusy(true);
    setError(null);
    const draft = await call<{ id: string }>('drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: accountId || null, to: split(to), cc: split(cc), bcc: split(bcc), subject, body }),
    });
    if (!draft.ok) { setBusy(false); setError('The draft could not be saved.'); return; }

    const followUp = schedule
      ? await call(`message/${draft.data.id}/schedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ localDateTime: when, timezone }),
      })
      : await call(`message/${draft.data.id}/send`, { method: 'POST' });

    setBusy(false);
    if (!followUp.ok) {
      // Precise about what did and did not happen: the draft exists either way.
      setError(schedule
        ? 'Saved as a draft, but scheduling failed — it will not send.'
        : 'Saved as a draft, but it could not be queued.');
      return;
    }
    await onDone(schedule ? `Scheduled for ${when} (${timezone}).` : 'Queued to send.', draft.data.id);
  }

  return (
    <form className={styles.composer} data-testid="mail-composer" onSubmit={(event) => { event.preventDefault(); void submit(false); }}>
      <h3>New message</h3>

      <label>
        From
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)} aria-label="Send from account" data-testid="mail-account">
          {sendable.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
        </select>
      </label>
      {/* Only accounts an administrator actually connected appear here. Nothing in this form
          implies Gmail or Outlook is available before one is configured. */}
      {accounts.length > sendable.length ? (
        <p className={styles.hint}>{accounts.length - sendable.length} configured account(s) are not connected yet, so they cannot send.</p>
      ) : null}

      <label>To<input value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@example.com" aria-label="To" data-testid="mail-to" /></label>
      <label>CC<input value={cc} onChange={(event) => setCc(event.target.value)} aria-label="CC" data-testid="mail-cc" /></label>
      <label>BCC<input value={bcc} onChange={(event) => setBcc(event.target.value)} aria-label="BCC" data-testid="mail-bcc" /></label>
      <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Subject" data-testid="mail-subject" /></label>
      <label>Message<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} aria-label="Message" data-testid="mail-body" /></label>

      <p className={styles.attachHint}>
        <Paperclip aria-hidden />
        {/* Stated rather than drawn as a dead control: attachments reference AURA Documents, and
            that path is not wired into compose yet. */}
        Attachments come from AURA Documents and are not yet wired into compose.
      </p>

      {error ? <p className={styles.failed} role="alert">{error}</p> : null}

      <div className={styles.composerActions}>
        <button type="button" disabled={busy} onClick={() => void saveDraft()} data-testid="mail-save-draft">Save draft</button>
        <button type="submit" disabled={busy || !to.trim()} data-testid="mail-send-now">Send now</button>
        {canSchedule ? (
          <>
            <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} aria-label="Schedule date and time" data-testid="mail-schedule-at" />
            <span className={styles.hint}>{timezone}</span>
            <button type="button" disabled={busy || !to.trim() || !when} onClick={() => void submit(true)} data-testid="mail-schedule">Schedule</button>
          </>
        ) : (
          <span className={styles.hint}>No connected account supports scheduled send.</span>
        )}
      </div>
      <p className={styles.hint}>Signed in as {me}.</p>
    </form>
  );
}
