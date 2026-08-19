'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Hash, Loader2, Mic, Paperclip, Plus, Search, Send, Square, Users } from 'lucide-react';
import { displayName } from '@aura/shared';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import DataStateNotice from '@/components/ui/data-state';
import type { DataError } from '@/lib/data-error';
import styles from '@/components/internal-chat.module.css';

/**
 * Internal Chat — the single chat implementation (C2).
 *
 * There is deliberately no second chat system: this component owns the behaviour (load, poll,
 * send, attach, unread, DM open) and both Communication and the older /workspace hub render it,
 * so a fix lands once. It talks to the same /api/comms endpoints C1 secured — channel membership,
 * DM participation and tenant/company scope are decided on the server, never here. A channel this
 * user may not see is simply not in the list, and requesting it by id returns 404.
 */

export interface ChatChannelView {
  id: string;
  kind: 'company' | 'department' | 'dm' | 'team' | 'project';
  name: string;
  members: string[];
  unread: number;
  lastMessageAt: string | null;
  lastPreview: string | null;
}

export interface ChatUserView { username: string; roleLabel?: string }

interface ChatAttachmentView { name: string; mime: string; size: number; dataUrl: string }

interface ChatMessageView {
  id: string;
  channelId: string;
  sender: string;
  kind: 'text' | 'file' | 'voice';
  text: string;
  attachment: ChatAttachmentView | null;
  sentAt: string;
}

/** Poll cadence for the open conversation. Matches the hub's existing 4s rhythm. */
const POLL_MS = 4_000;

const stamp = (iso: string): string =>
  new Intl.DateTimeFormat(DISPLAY_LOCALE, { hour: '2-digit', minute: '2-digit', timeZone: DISPLAY_TIME_ZONE }).format(new Date(iso));

const dayStamp = (iso: string): string =>
  new Intl.DateTimeFormat(DISPLAY_LOCALE, { day: 'numeric', month: 'short', timeZone: DISPLAY_TIME_ZONE }).format(new Date(iso));

const sizeLabel = (bytes: number): string =>
  bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** A DM is titled by the other participant; every other channel by its own name. */
function channelLabel(channel: ChatChannelView, me: string): string {
  if (channel.kind !== 'dm') return channel.name;
  const peer = channel.members.find((m) => m !== me);
  return peer ? displayName(peer) : channel.name;
}

export default function InternalChat({
  me,
  initialChannels,
  users,
  loadError = null,
  /** Preselects a channel; also read from ?channel= so a deep link opens the exact conversation. */
  initialChannelId = null,
  /** When set, the selected channel is mirrored into this query param on the current route. */
  syncParam = null,
}: {
  me: string;
  initialChannels: ChatChannelView[] | null;
  users: ChatUserView[];
  loadError?: DataError | null;
  initialChannelId?: string | null;
  syncParam?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [channels, setChannels] = useState<ChatChannelView[]>(initialChannels ?? []);
  const [activeId, setActiveId] = useState<string | null>(initialChannelId ?? initialChannels?.[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessageView[] | null>(null);
  const [messageError, setMessageError] = useState<'forbidden' | 'unreachable' | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [dmOpen, setDmOpen] = useState(false);
  /** A conversation is being opened; the composer belongs to no settled conversation until it lands. */
  const [opening, setOpening] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const active = channels.find((c) => c.id === activeId) ?? null;

  const refreshChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/comms/channels', { cache: 'no-store' });
      if (res.ok) setChannels((await res.json()) as ChatChannelView[]);
    } catch { /* keep the last known rail rather than blanking it mid-conversation */ }
  }, []);

  const loadMessages = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}/messages`, { cache: 'no-store' });
      if (res.ok) { setMessages((await res.json()) as ChatMessageView[]); setMessageError(null); return; }
      // 404 is what C1 returns for a channel you may not read — concealed on purpose, so the UI
      // must not claim "empty conversation" for it.
      setMessageError(res.status === 403 || res.status === 404 ? 'forbidden' : 'unreachable');
      setMessages([]);
    } catch {
      setMessageError('unreachable');
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (!activeId) return;
    void loadMessages(activeId);
    const timer = setInterval(() => { void loadMessages(activeId); void refreshChannels(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeId, loadMessages, refreshChannels]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages?.length]);

  /** Keep the URL on the open conversation so it can be shared, reloaded and deep-linked. */
  const select = useCallback((channelId: string) => {
    setActiveId(channelId);
    setMessages(null);
    // Anything half-typed belonged to the conversation being left. Carrying it into the next one
    // is how a note meant for one person ends up addressed to another.
    setText('');
    setSendError(null);
    if (!syncParam) return;
    const next = new URLSearchParams(params.toString());
    next.set(syncParam, channelId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router, syncParam]);

  /**
   * Post to an EXPLICIT conversation, never to whatever `activeId` happens to hold.
   *
   * The composer used to read the open channel out of its closure at send time. Opening a
   * conversation is a round trip, so between clicking a person and that conversation becoming
   * active there is a window in which the box on screen belongs to the NEW conversation while
   * `activeId` still names the OLD one — and a message typed in that window was posted to the old
   * one. Against the in-memory adapters the window is about a millisecond and never lost a race;
   * against PostgreSQL it is hundreds of milliseconds and lost it every time. Five runs of the DM
   * spec put a line meant for a private conversation into the company-wide channel:
   *
   *     channel_id   sender    body
   *     ch-company   u-admin   c2-dm-proof-1787132513438
   *
   * It looked delivered on screen because the optimistic append below writes into whatever list is
   * being displayed. So: the target is passed in from the rendered composer, and a target that no
   * longer matches the open conversation refuses to send rather than guessing.
   */
  async function send(kind: 'text' | 'file' | 'voice', attachment: ChatAttachmentView | null = null, target: string | null = activeId) {
    if (!target || sending || opening) return;
    if (target !== activeId) return; // the view moved while this was queued — never post to the old one
    if (kind === 'text' && !text.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/comms/channels/${encodeURIComponent(target)}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, text: kind === 'text' ? text : '', attachment }),
      });
      if (!res.ok) {
        setSendError(res.status === 404 || res.status === 403
          ? 'You can no longer post in this conversation.'
          : 'Could not send — check the attachment size (max 5 MB).');
        return;
      }
      const posted = (await res.json()) as ChatMessageView;
      setText('');
      // Guard the append too: if the conversation changed while the POST was in flight, the
      // message belongs to a list that is no longer on screen.
      setMessages((prev) => (target === activeId ? [...(prev ?? []), posted] : prev));
      void refreshChannels();
    } catch {
      setSendError('Could not send — the API is unreachable.');
    } finally {
      setSending(false);
    }
  }

  function attachFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => void send('file', {
      name: file.name, mime: file.type || 'application/octet-stream', size: file.size, dataUrl: String(reader.result),
    });
    reader.readAsDataURL(file);
  }

  async function toggleRecording() {
    if (recording) { recorderRef.current?.stop(); return; }
    setSendError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const parts: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(parts, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => void send('voice', {
          name: `voice-${Date.now()}.webm`, mime: blob.type, size: blob.size, dataUrl: String(reader.result),
        });
        reader.readAsDataURL(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setSendError('Microphone unavailable — allow mic access to send voice notes.');
    }
  }

  /**
   * Open (or create) a direct message with someone.
   *
   * `opening` is set for the WHOLE round trip, not just around the fetch: until the new
   * conversation is the active one, the composer is closed. A private line must not be typeable —
   * let alone sendable — while the view still belongs to the previous conversation, however long
   * the server takes to answer.
   */
  async function openDm(peer: string) {
    setDmOpen(false);
    setOpening(true);
    try {
      const res = await fetch('/api/comms/dm', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ peer }),
      });
      if (!res.ok) return;
      const channel = (await res.json()) as ChatChannelView;
      // Switch the view BEFORE refreshing the rail, and never the other way round. Awaiting the
      // rail first left the previous conversation on screen with its composer live for the whole
      // round trip. The rail is cosmetic here and can catch up on its own.
      select(channel.id);
      void refreshChannels();
    } catch { /* the rail is unchanged; the user can retry */ } finally {
      setOpening(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return channels;
    return channels.filter((c) =>
      channelLabel(c, me).toLowerCase().includes(needle)
      || (c.lastPreview ?? '').toLowerCase().includes(needle)
      || c.members.some((m) => displayName(m).toLowerCase().includes(needle)));
  }, [channels, me, query]);

  const rooms = filtered.filter((c) => c.kind !== 'dm');
  const dms = filtered.filter((c) => c.kind === 'dm');

  // A failed channel load is not an empty inbox. C1 conceals channels you may not see, so the
  // only honest thing to say when the list itself could not be fetched is that it could not.
  if (loadError) {
    return (
      <div className={styles.chat} data-testid="internal-chat">
        <DataStateNotice error={loadError} subject="conversations" />
      </div>
    );
  }

  return (
    <div className={styles.chat} data-testid="internal-chat">
      <aside className={styles.rail} aria-label="Conversations">
        <label className={styles.search}>
          <Search aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
          />
        </label>

        <div className={styles.railGroup}>
          <p className={styles.railHead}><Hash aria-hidden />Channels</p>
          {rooms.length === 0 ? (
            <p className={styles.railEmpty}>{query ? 'No channel matches that search.' : 'No channels yet.'}</p>
          ) : rooms.map((channel) => (
            <ChannelRow key={channel.id} channel={channel} me={me} active={channel.id === activeId} onSelect={() => select(channel.id)} />
          ))}
        </div>

        <div className={styles.railGroup}>
          <p className={styles.railHead}>
            <Users aria-hidden />Direct messages
            <button type="button" className={styles.newDm} onClick={() => setDmOpen((open) => !open)} aria-expanded={dmOpen}>
              <Plus aria-hidden />New
            </button>
          </p>
          {dmOpen && (
            <div className={styles.dmPicker} role="group" aria-label="Start a direct message">
              {users.filter((user) => user.username !== me).map((user) => (
                <button key={user.username} type="button" className={styles.dmPickerRow} onClick={() => void openDm(user.username)}>
                  <strong>{displayName(user.username)}</strong>
                  {user.roleLabel ? <small>{user.roleLabel}</small> : null}
                </button>
              ))}
            </div>
          )}
          {dms.length === 0 && !dmOpen ? (
            <p className={styles.railEmpty}>Message a teammate directly — they get a notification.</p>
          ) : dms.map((channel) => (
            <ChannelRow key={channel.id} channel={channel} me={me} active={channel.id === activeId} onSelect={() => select(channel.id)} />
          ))}
        </div>
      </aside>

      <section className={styles.conversation} aria-label="Conversation">
        {!activeId ? (
          <div className={styles.placeholder} data-testid="chat-no-selection">
            <strong>Pick a conversation</strong>
            <p>Channels and direct messages you belong to appear on the left.</p>
          </div>
        ) : !active ? (
          // A deep link to a conversation that is not in this user's rail. C1 conceals those, so
          // the honest answer is "not yours", never the empty-conversation placeholder — showing
          // "pick a conversation" here would quietly turn a refusal into a shrug.
          <div className={styles.placeholder} data-testid="chat-forbidden">
            <strong>This conversation is not yours to read</strong>
            <p>It may be a direct message between other people, or a channel you are not a member of.</p>
          </div>
        ) : (
          <>
            <header className={styles.conversationHead}>
              <div>
                <h3>{channelLabel(active, me)}</h3>
                <p>
                  {active.kind === 'company' ? 'Everyone in the company'
                    : active.kind === 'dm' ? 'Direct conversation — visible only to the two of you'
                    : `${active.members.length} member${active.members.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </header>

            <div className={styles.messages} data-testid="chat-messages">
              {messages === null ? (
                <p className={styles.loading}><Loader2 aria-hidden />Loading conversation…</p>
              ) : messageError === 'forbidden' ? (
                <div className={styles.stateBox} data-testid="chat-forbidden">
                  <strong>This conversation is not yours to read</strong>
                  <p>It may have been a direct message between other people, or a channel you are not a member of.</p>
                </div>
              ) : messageError === 'unreachable' ? (
                <div className={styles.stateBox} data-testid="chat-unreachable">
                  <strong>Messages are unavailable</strong>
                  <p>The messaging service could not be reached. Nothing was lost — retry shortly.</p>
                </div>
              ) : messages.length === 0 ? (
                <div className={styles.stateBox} data-testid="chat-empty">
                  <strong>No messages yet</strong>
                  <p>Say the first thing in {channelLabel(active, me)}.</p>
                </div>
              ) : (
                messages.map((message, index) => {
                  const mine = message.sender === me;
                  const showDay = index === 0 || dayStamp(messages[index - 1]!.sentAt) !== dayStamp(message.sentAt);
                  return (
                    <div key={message.id}>
                      {showDay ? <p className={styles.dayDivider}>{dayStamp(message.sentAt)}</p> : null}
                      <article className={`${styles.message} ${mine ? styles.mine : ''}`} data-testid="chat-message">
                        <span className={styles.author}>{mine ? 'You' : displayName(message.sender)}</span>
                        {message.kind === 'voice' && message.attachment ? (
                          <audio controls src={message.attachment.dataUrl} className={styles.voice} />
                        ) : message.kind === 'file' && message.attachment ? (
                          <a className={styles.file} href={message.attachment.dataUrl} download={message.attachment.name}>
                            <Paperclip aria-hidden />
                            <span>{message.attachment.name}</span>
                            <small>{sizeLabel(message.attachment.size)}</small>
                          </a>
                        ) : (
                          <p className={styles.body}>{message.text}</p>
                        )}
                        <time className={styles.time} dateTime={message.sentAt}>{stamp(message.sentAt)}</time>
                      </article>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {sendError ? <p className={styles.sendError} role="alert">{sendError}</p> : null}

            <form
              className={styles.composer}
              onSubmit={(event) => { event.preventDefault(); void send('text', null, activeId); }}
            >
              <input
                ref={fileRef}
                type="file"
                className={styles.hiddenFile}
                onChange={(event) => { const file = event.target.files?.[0]; if (file) attachFile(file); event.target.value = ''; }}
                aria-label="Attach a file"
              />
              <button type="button" className={styles.iconButton} disabled={opening} onClick={() => fileRef.current?.click()} aria-label="Attach a file">
                <Paperclip aria-hidden />
              </button>
              <button
                type="button"
                className={`${styles.iconButton} ${recording ? styles.recording : ''}`}
                disabled={opening}
                onClick={() => void toggleRecording()}
                aria-label={recording ? 'Stop recording' : 'Record a voice note'}
              >
                {recording ? <Square aria-hidden /> : <Mic aria-hidden />}
              </button>
              <input
                className={styles.composerInput}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={recording ? 'Recording voice note…' : `Message ${channelLabel(active, me)}`}
                aria-label="Message"
                // Closed while a conversation is opening: the box on screen belongs to the conversation
                // being opened, but nothing can be addressed until that one is actually active.
                disabled={opening || messageError === 'forbidden'}
              />
              <button type="submit" className={styles.send} disabled={opening || sending || !text.trim()} aria-label="Send message">
                <Send aria-hidden />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function ChannelRow({ channel, me, active, onSelect }: {
  channel: ChatChannelView; me: string; active: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${styles.channelRow} ${active ? styles.channelActive : ''}`}
      aria-current={active ? 'true' : undefined}
      data-testid="chat-channel"
      data-channel-id={channel.id}
    >
      <span className={styles.channelMeta}>
        <strong className={channel.unread > 0 ? styles.unreadName : undefined}>{channelLabel(channel, me)}</strong>
        <small>{channel.lastPreview ?? 'No messages yet'}</small>
      </span>
      <span className={styles.channelSide}>
        {channel.lastMessageAt ? <time dateTime={channel.lastMessageAt}>{dayStamp(channel.lastMessageAt)}</time> : null}
        {channel.unread > 0 ? <span className={styles.unread} aria-label={`${channel.unread} unread`}>{channel.unread}</span> : null}
      </span>
    </button>
  );
}
