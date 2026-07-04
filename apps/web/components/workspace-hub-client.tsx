'use client';

// My Workspace hub — chat + mail + inbox + notifications + saved views + search
// in one page. Chat/mail/notifications poll for freshness; everything else is
// server-fetched and refreshed on demand.

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ------------------------------------------------------------------- types

export interface HubMe { username: string; role: string; roleLabel: string; isAdmin: boolean; functions: string[] }
export interface HubUser { username: string; role: string; roleLabel: string; isAdmin: boolean }
export interface HubChannel {
  id: string; kind: 'company' | 'department' | 'dm'; name: string; members: string[];
  unread: number; lastMessageAt: string | null; lastPreview: string | null;
}
interface HubAttachment { name: string; mime: string; size: number; dataUrl: string }
interface HubChatMessage {
  id: string; channelId: string; sender: string; kind: 'text' | 'file' | 'voice';
  text: string; attachment: HubAttachment | null; sentAt: string;
}
export interface HubMail { id: string; from: string; to: string[]; subject: string; body: string; sentAt: string; readBy: string[] }
export interface HubMailbox { inbox: HubMail[]; sent: HubMail[]; unread: number }
export interface HubInboxItem {
  id: string; module: string; kind: string; title: string; detail: string; action: string;
  href: string; value: number | null; createdAt: string | null;
}
export interface HubSavedView { id: string; label: string; path: string; query: string; createdAt: string }
export interface HubNotification { id: string; title: string; body: string; category: string; read: boolean; createdAt: string }
interface SearchHit { type: string; id: string; title: string; subtitle: string; href: string }

type TabId = 'chat' | 'mail' | 'inbox' | 'notifications' | 'views' | 'search';

// ----------------------------------------------------------------- helpers

const displayName = (u: string) => u.replace(/^u-/, '').replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const AVATAR_COLORS = ['#7aa2f7', '#9ece6a', '#e0af68', '#f7768e', '#bb9af7', '#2ac3de', '#ff9e64'];
const avatarColor = (name: string) => AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

// -------------------------------------------------------------------- page

export default function WorkspaceHubClient(props: {
  me: HubMe | null;
  users: HubUser[];
  initialChannels: HubChannel[];
  initialMailbox: HubMailbox;
  inboxItems: HubInboxItem[];
  savedViews: HubSavedView[];
  initialNotifications: HubNotification[];
  initialTab: string;
  initialQuery: string;
}) {
  const me = props.me?.username ?? 'u-admin';
  const validTabs: TabId[] = ['chat', 'mail', 'inbox', 'notifications', 'views', 'search'];
  const [tab, setTab] = useState<TabId>(validTabs.includes(props.initialTab as TabId) ? (props.initialTab as TabId) : 'chat');

  const [channels, setChannels] = useState<HubChannel[]>(props.initialChannels);
  const [mailbox, setMailbox] = useState<HubMailbox>(props.initialMailbox);
  const [notifications, setNotifications] = useState<HubNotification[]>(props.initialNotifications);

  const chatUnread = channels.reduce((sum, c) => sum + c.unread, 0);
  const notifUnread = notifications.filter((n) => !n.read).length;

  const refreshChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/comms/channels', { cache: 'no-store' });
      if (res.ok) setChannels(await res.json());
    } catch { /* keep last known */ }
  }, []);
  const refreshMailbox = useCallback(async () => {
    try {
      const res = await fetch('/api/comms/mail', { cache: 'no-store' });
      if (res.ok) setMailbox(await res.json());
    } catch { /* keep last known */ }
  }, []);
  const refreshNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (res.ok) setNotifications(await res.json());
    } catch { /* keep last known */ }
  }, []);

  // Badge freshness: everything (chat, mail, notifications) every 10 s.
  useEffect(() => {
    const t = setInterval(() => {
      void refreshChannels(); void refreshMailbox(); void refreshNotifications();
    }, 10_000);
    return () => clearInterval(t);
  }, [refreshChannels, refreshMailbox, refreshNotifications]);

  const tabs: Array<{ id: TabId; glyph: string; label: string; badge: number }> = [
    { id: 'chat', glyph: '💬', label: 'Chat', badge: chatUnread },
    { id: 'mail', glyph: '📧', label: 'Mail', badge: mailbox.unread },
    { id: 'inbox', glyph: '◉', label: 'Inbox', badge: props.inboxItems.length },
    { id: 'notifications', glyph: '🔔', label: 'Notifications', badge: notifUnread },
    { id: 'views', glyph: '★', label: 'Saved Views', badge: 0 },
    { id: 'search', glyph: '⌕', label: 'Search', badge: 0 },
  ];

  return (
    <div style={st.page}>
      <header style={st.header}>
        <div>
          <h1 style={st.h1}>My Workspace</h1>
          <p style={st.sub}>
            Chat with your team, send mail, clear your approvals — everything that needs you, in one place.
          </p>
        </div>
        <span style={st.mePill}>
          <span style={{ ...st.avatar(28), background: avatarColor(me) }}>{displayName(me)[0]}</span>
          {displayName(me)} · {props.me?.roleLabel ?? 'Member'}
        </span>
      </header>

      <nav style={st.tabRail}>
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} style={st.tab(tab === t.id)}>
            <span style={{ fontSize: 15 }}>{t.glyph}</span> {t.label}
            {t.badge > 0 ? <span style={st.badge(t.id === 'inbox')}>{t.badge}</span> : null}
          </button>
        ))}
      </nav>

      {tab === 'chat' && (
        <ChatPane me={me} users={props.users} channels={channels} onChannelsChanged={refreshChannels} />
      )}
      {tab === 'mail' && (
        <MailPane me={me} users={props.users} mailbox={mailbox} onChanged={() => { void refreshMailbox(); void refreshNotifications(); }} />
      )}
      {tab === 'inbox' && <InboxPane items={props.inboxItems} />}
      {tab === 'notifications' && <NotificationsPane items={notifications} onChanged={refreshNotifications} />}
      {tab === 'views' && <ViewsPane items={props.savedViews} />}
      {tab === 'search' && <SearchPane initialQuery={props.initialQuery} />}
    </div>
  );
}

// -------------------------------------------------------------------- chat

function ChatPane({ me, users, channels, onChannelsChanged }: {
  me: string; users: HubUser[]; channels: HubChannel[]; onChannelsChanged: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(channels[0]?.id ?? null);
  const [messages, setMessages] = useState<HubChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const active = channels.find((c) => c.id === activeId) ?? null;

  const loadMessages = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/comms/channels/${encodeURIComponent(channelId)}/messages`, { cache: 'no-store' });
      if (res.ok) setMessages(await res.json());
    } catch { /* keep last known */ }
  }, []);

  // Load + poll the open conversation (4 s), refresh the rail on the way.
  useEffect(() => {
    if (!activeId) return;
    void loadMessages(activeId);
    const t = setInterval(() => { void loadMessages(activeId); onChannelsChanged(); }, 4_000);
    return () => clearInterval(t);
  }, [activeId, loadMessages, onChannelsChanged]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  async function send(kind: 'text' | 'file' | 'voice', attachment: HubAttachment | null = null) {
    if (!activeId || sending) return;
    if (kind === 'text' && !text.trim()) return;
    setSending(true);
    setChatError(null);
    const posted = await postJson<HubChatMessage>(`/api/comms/channels/${encodeURIComponent(activeId)}/messages`, {
      kind, text: kind === 'text' ? text : '', attachment,
    });
    setSending(false);
    if (!posted) { setChatError('Could not send — check the attachment size (max 5 MB).'); return; }
    setText('');
    setMessages((prev) => [...prev, posted]);
    onChannelsChanged();
  }

  function attachFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      void send('file', { name: file.name, mime: file.type || 'application/octet-stream', size: file.size, dataUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
  }

  async function toggleRecording() {
    if (recording) { recorderRef.current?.stop(); return; }
    setChatError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const parts: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(parts, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          void send('voice', { name: `voice-${Date.now()}.webm`, mime: blob.type, size: blob.size, dataUrl: String(reader.result) });
        };
        reader.readAsDataURL(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setChatError('Microphone unavailable — allow mic access to send voice notes.');
    }
  }

  async function openDm(peer: string) {
    setDmPickerOpen(false);
    const ch = await postJson<HubChannel>('/api/comms/dm', { peer });
    if (ch) { onChannelsChanged(); setActiveId(ch.id); }
  }

  const groups = useMemo(() => ({
    channels: channels.filter((c) => c.kind !== 'dm'),
    dms: channels.filter((c) => c.kind === 'dm'),
  }), [channels]);

  return (
    <div style={st.split}>
      <aside style={st.rail}>
        <div style={st.railHeader}>Channels</div>
        {groups.channels.map((c) => (
          <ChannelRow key={c.id} channel={c} me={me} active={c.id === activeId} onSelect={() => setActiveId(c.id)} />
        ))}
        <div style={{ ...st.railHeader, marginTop: 14, display: 'flex', alignItems: 'center' }}>
          Direct messages
          <button type="button" style={st.newDmBtn} onClick={() => setDmPickerOpen((v) => !v)}>＋ New</button>
        </div>
        {dmPickerOpen && (
          <div style={st.dmPicker}>
            {users.filter((u) => u.username !== me).map((u) => (
              <button key={u.username} type="button" style={st.dmPickerRow} onClick={() => void openDm(u.username)}>
                <span style={{ ...st.avatar(22), background: avatarColor(u.username) }}>{displayName(u.username)[0]}</span>
                {displayName(u.username)} <span style={st.dmRole}>{u.roleLabel}</span>
              </button>
            ))}
          </div>
        )}
        {groups.dms.length === 0 && !dmPickerOpen ? (
          <p style={st.railEmpty}>Message a teammate directly — they’ll get a notification.</p>
        ) : (
          groups.dms.map((c) => (
            <ChannelRow key={c.id} channel={c} me={me} active={c.id === activeId} onSelect={() => setActiveId(c.id)} />
          ))
        )}
      </aside>

      <section style={st.chatMain}>
        {active ? (
          <>
            <div style={st.chatHeader}>
              <span style={{ ...st.avatar(30), background: avatarColor(channelLabel(active, me)) }}>{channelLabel(active, me)[0]}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{channelLabel(active, me)}</div>
                <div style={st.chatHeaderSub}>
                  {active.kind === 'company' ? 'Everyone in the company'
                    : active.kind === 'department' ? `${active.members.length} members · ${active.members.map(displayName).join(', ')}`
                    : 'Direct conversation'}
                </div>
              </div>
            </div>
            <div style={st.messages}>
              {messages.length === 0 ? (
                <p style={st.emptyChat}>No messages yet — say hello 👋</p>
              ) : (
                messages.map((m) => <MessageBubble key={m.id} m={m} mine={m.sender === me} />)
              )}
              <div ref={bottomRef} />
            </div>
            {chatError ? <div style={st.chatErr}>{chatError}</div> : null}
            <div style={st.composer}>
              <input ref={fileRef} type="file" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) attachFile(f); e.target.value = ''; }} />
              <button type="button" title="Share a document" style={st.iconBtn(false)} onClick={() => fileRef.current?.click()}>📎</button>
              <button type="button" title={recording ? 'Stop recording' : 'Record a voice note'} style={st.iconBtn(recording)}
                onClick={() => void toggleRecording()}>
                {recording ? '⏹' : '🎤'}
              </button>
              <input
                style={st.composerInput}
                placeholder={recording ? 'Recording voice note…' : `Message ${channelLabel(active, me)}`}
                value={text}
                disabled={recording}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send('text'); } }}
              />
              <button type="button" style={st.sendBtn} disabled={sending || recording || !text.trim()} onClick={() => void send('text')}>
                Send
              </button>
            </div>
          </>
        ) : (
          <p style={st.emptyChat}>Pick a channel to start chatting.</p>
        )}
      </section>
    </div>
  );
}

function channelLabel(c: HubChannel, me: string): string {
  if (c.kind !== 'dm') return c.name;
  const peer = c.members.find((u) => u !== me) ?? c.members[0] ?? c.name;
  return displayName(peer);
}

function ChannelRow({ channel, me, active, onSelect }: { channel: HubChannel; me: string; active: boolean; onSelect: () => void }) {
  const label = channelLabel(channel, me);
  return (
    <button type="button" onClick={onSelect} style={st.channelRow(active)}>
      <span style={{ ...st.avatar(26), background: avatarColor(label) }}>{label[0]}</span>
      <span style={st.channelMeta}>
        <span style={st.channelName(channel.unread > 0)}>{label}</span>
        {channel.lastPreview ? <span style={st.channelPreview}>{channel.lastPreview}</span> : null}
      </span>
      <span style={st.channelSide}>
        {channel.lastMessageAt ? <span style={st.channelTime}>{timeAgo(channel.lastMessageAt)}</span> : null}
        {channel.unread > 0 ? <span style={st.unreadDot}>{channel.unread}</span> : null}
      </span>
    </button>
  );
}

function MessageBubble({ m, mine }: { m: HubChatMessage; mine: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <div style={st.bubbleMeta}>
        {!mine ? <strong style={{ color: avatarColor(m.sender) }}>{displayName(m.sender)}</strong> : null}
        <span>{clock(m.sentAt)}</span>
      </div>
      <div style={st.bubble(mine)}>
        {m.kind === 'voice' && m.attachment ? (
          <audio controls src={m.attachment.dataUrl} style={{ maxWidth: 260 }} />
        ) : m.kind === 'file' && m.attachment ? (
          <a href={m.attachment.dataUrl} download={m.attachment.name} style={st.fileLink}>
            📎 {m.attachment.name}
            <span style={st.fileSize}>{m.attachment.size > 1048576 ? `${(m.attachment.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(m.attachment.size / 1024))} KB`}</span>
          </a>
        ) : (
          m.text
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- mail

function MailPane({ me, users, mailbox, onChanged }: {
  me: string; users: HubUser[]; mailbox: HubMailbox; onChanged: () => void;
}) {
  const [folder, setFolder] = useState<'inbox' | 'sent'>('inbox');
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);

  const list = folder === 'inbox' ? mailbox.inbox : mailbox.sent;
  const open = list.find((m) => m.id === openId) ?? null;

  async function openMail(m: HubMail) {
    setOpenId(m.id);
    if (folder === 'inbox' && !m.readBy.includes(me)) {
      await postJson(`/api/comms/mail/${encodeURIComponent(m.id)}/read`, {});
      onChanged();
    }
  }

  async function sendMail() {
    if (sending) return;
    setSending(true);
    setMailError(null);
    const sent = await postJson<HubMail>('/api/comms/mail', { to, subject, body });
    setSending(false);
    if (!sent) { setMailError('Could not send — pick at least one recipient and add a subject or body.'); return; }
    setComposing(false); setTo([]); setSubject(''); setBody('');
    setFolder('sent'); setOpenId(sent.id);
    onChanged();
  }

  return (
    <div style={st.split}>
      <aside style={st.rail}>
        <button type="button" style={st.composeBtn} onClick={() => { setComposing(true); setOpenId(null); }}>✎ Compose</button>
        <button type="button" style={st.folderRow(folder === 'inbox')} onClick={() => { setFolder('inbox'); setOpenId(null); setComposing(false); }}>
          📥 Inbox {mailbox.unread > 0 ? <span style={st.unreadDot}>{mailbox.unread}</span> : null}
        </button>
        <button type="button" style={st.folderRow(folder === 'sent')} onClick={() => { setFolder('sent'); setOpenId(null); setComposing(false); }}>
          📤 Sent
        </button>
        <div style={{ marginTop: 12 }}>
          {list.length === 0 ? (
            <p style={st.railEmpty}>{folder === 'inbox' ? 'No mail yet.' : 'Nothing sent yet.'}</p>
          ) : (
            list.map((m) => {
              const unread = folder === 'inbox' && !m.readBy.includes(me);
              const who = folder === 'inbox' ? m.from : m.to.join(', ');
              return (
                <button key={m.id} type="button" style={st.mailRow(m.id === openId)} onClick={() => void openMail(m)}>
                  <span style={{ ...st.avatar(24), background: avatarColor(who) }}>{displayName(who.split(',')[0])[0]}</span>
                  <span style={st.channelMeta}>
                    <span style={st.channelName(unread)}>{folder === 'inbox' ? displayName(m.from) : `To: ${m.to.map(displayName).join(', ')}`}</span>
                    <span style={st.channelPreview}>{m.subject}</span>
                  </span>
                  <span style={st.channelSide}>
                    <span style={st.channelTime}>{timeAgo(m.sentAt)}</span>
                    {unread ? <span style={st.unreadBullet} /> : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section style={st.chatMain}>
        {composing ? (
          <div style={st.composeForm}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>New mail</h3>
            <label style={st.label}>To</label>
            <div style={st.recipientWrap}>
              {users.filter((u) => u.username !== me).map((u) => {
                const picked = to.includes(u.username);
                return (
                  <button key={u.username} type="button" style={st.recipientChip(picked)}
                    onClick={() => setTo((prev) => picked ? prev.filter((x) => x !== u.username) : [...prev, u.username])}>
                    {picked ? '✓ ' : ''}{displayName(u.username)}
                  </button>
                );
              })}
            </div>
            <label style={st.label}>Subject</label>
            <input style={st.input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What is it about?" />
            <label style={st.label}>Message</label>
            <textarea style={st.textarea} rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your mail…" />
            {mailError ? <div style={st.chatErr}>{mailError}</div> : null}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="button" style={st.sendBtn} disabled={sending || to.length === 0} onClick={() => void sendMail()}>
                Send mail
              </button>
              <button type="button" style={st.ghostBtn} onClick={() => setComposing(false)}>Cancel</button>
            </div>
            <p style={st.hint}>Recipients get an in-app notification the moment it lands.</p>
          </div>
        ) : open ? (
          <div style={st.mailOpen}>
            <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>{open.subject}</h3>
            <div style={st.mailMeta}>
              <span style={{ ...st.avatar(26), background: avatarColor(open.from) }}>{displayName(open.from)[0]}</span>
              <span><strong>{displayName(open.from)}</strong> → {open.to.map(displayName).join(', ')}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{new Date(open.sentAt).toLocaleString()}</span>
            </div>
            <div style={st.mailBody}>{open.body || <em style={{ color: 'var(--muted)' }}>(no body)</em>}</div>
          </div>
        ) : (
          <p style={st.emptyChat}>{list.length ? 'Open a mail to read it.' : 'Compose your first mail — recipients are notified instantly.'}</p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------- inbox / notifications

function InboxPane({ items }: { items: HubInboxItem[] }) {
  const byModule = new Map<string, HubInboxItem[]>();
  for (const item of items) byModule.set(item.module, [...(byModule.get(item.module) ?? []), item]);
  if (items.length === 0) return <section style={st.panel}><p style={st.emptyChat}>All clear — nothing is waiting on you. ✅</p></section>;
  return (
    <div>
      {[...byModule.entries()].map(([module, moduleItems]) => (
        <section key={module} style={{ marginBottom: 18 }}>
          <h2 style={st.groupTitle}>{module} <span style={st.groupCount}>{moduleItems.length}</span></h2>
          <div style={st.panel}>
            {moduleItems.map((item) => (
              <div key={`${item.kind}-${item.id}`} style={st.inboxRow}>
                <span style={st.actionPill(item.action)}>{item.action}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={item.href} style={st.inboxTitle}>{item.title}</a>
                  <div style={st.inboxDetail}>{item.kind}{item.detail ? ` · ${item.detail}` : ''}</div>
                </div>
                {item.value !== null ? <span style={st.inboxValue}>{money(item.value)}</span> : null}
                <span style={st.channelTime}>{timeAgo(item.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function NotificationsPane({ items, onChanged }: { items: HubNotification[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function markRead(id: string) {
    setBusy(true);
    try { await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' }); onChanged(); } finally { setBusy(false); }
  }
  async function markAll() {
    setBusy(true);
    try {
      await Promise.all(items.filter((n) => !n.read).map((n) => fetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' })));
      onChanged();
    } finally { setBusy(false); }
  }
  const unread = items.filter((n) => !n.read).length;
  if (items.length === 0) return <section style={st.panel}><p style={st.emptyChat}>No notifications yet — chat messages, mail and approvals will show up here. 🔔</p></section>;
  return (
    <div>
      {unread > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button type="button" style={st.ghostBtn} disabled={busy} onClick={() => void markAll()}>Mark all read ({unread})</button>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((n) => (
          <div key={n.id} style={st.notifCard(n.read)}>
            <span style={st.notifCat(n.category)}>{n.category}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: n.read ? 500 : 700, fontSize: 14 }}>{n.title}</div>
              {n.body ? <div style={st.inboxDetail}>{n.body}</div> : null}
              <div style={{ ...st.channelTime, marginTop: 4 }}>{new Date(n.createdAt).toLocaleString()}</div>
            </div>
            {!n.read ? (
              <button type="button" style={st.ghostBtn} disabled={busy} onClick={() => void markRead(n.id)}>Mark read</button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------- views / search

function ViewsPane({ items }: { items: HubSavedView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function del(id: string) {
    setBusy(id);
    try { await fetch(`/api/views/${id}`, { method: 'DELETE' }); router.refresh(); } finally { setBusy(null); }
  }
  if (items.length === 0) {
    return <section style={st.panel}><p style={st.emptyChat}>No saved views yet — use “☆ Save view” on any list page to pin a filter here.</p></section>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((v) => (
        <div key={v.id} style={st.viewRow}>
          <Link href={`${v.path}${v.query ? '?' + v.query : ''}`} style={st.inboxTitle}><strong>★ {v.label}</strong></Link>
          <span style={st.viewPath}>{v.path}{v.query ? `?${v.query}` : ''}</span>
          <div style={{ flex: 1 }} />
          <button type="button" style={st.ghostBtn} disabled={busy === v.id} onClick={() => void del(v.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

function SearchPane({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const run = useCallback(async (q: string) => {
    if (!q.trim()) { setHits(null); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=100`, { cache: 'no-store' });
      setHits(res.ok ? await res.json() : []);
    } catch { setHits([]); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => { if (initialQuery) void run(initialQuery); }, [initialQuery, run]);

  const byType = new Map<string, SearchHit[]>();
  for (const hit of hits ?? []) byType.set(hit.type, [...(byType.get(hit.type) ?? []), hit]);

  return (
    <div>
      <form style={{ display: 'flex', gap: 10, marginBottom: 20 }}
        onSubmit={(e) => { e.preventDefault(); void run(query); }}>
        <input style={{ ...st.input, flex: 1, margin: 0 }} value={query} autoFocus
          placeholder="Search accounts, tenders, projects, invoices, people…" onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" style={st.sendBtn} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
      </form>
      {hits === null ? (
        <p style={{ color: 'var(--muted)' }}>Type a name, title or reference — results come from every module.</p>
      ) : hits.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No results.</p>
      ) : (
        [...byType.entries()].map(([type, typeHits]) => (
          <section key={type} style={{ marginBottom: 18 }}>
            <h2 style={st.groupTitle}>{type} <span style={st.groupCount}>{typeHits.length}</span></h2>
            <div style={st.panel}>
              {typeHits.map((hit) => (
                <div key={hit.id} style={st.inboxRow}>
                  <a href={hit.href} style={{ ...st.inboxTitle, color: 'var(--accent)' }}>{hit.title}</a>
                  <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 13 }}>{hit.subtitle}</span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

// ------------------------------------------------------------------ styles

const st = {
  page: { maxWidth: 1160, margin: '0 auto', padding: '24px 28px 64px' } as CSSProperties,
  header: { display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 } as CSSProperties,
  h1: { fontSize: 27, margin: 0, letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '6px 0 0', maxWidth: 560, lineHeight: 1.5, fontSize: 13.5 } as CSSProperties,
  mePill: {
    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600,
    background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 14px 6px 7px', whiteSpace: 'nowrap',
  } as CSSProperties,
  avatar: (size: number): CSSProperties => ({
    width: size, height: size, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: '#0b0e14', fontWeight: 800, fontSize: size * 0.46, flexShrink: 0,
  }),
  tabRail: { display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' } as CSSProperties,
  tab: (active: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', cursor: 'pointer',
    padding: '9px 14px', fontSize: 14, fontWeight: active ? 700 : 500,
    color: active ? 'var(--text)' : 'var(--muted)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1,
  }),
  badge: (neutral: boolean): CSSProperties => ({
    fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 7px',
    background: neutral ? 'var(--panel-2)' : 'var(--accent)', color: neutral ? 'var(--muted)' : '#0b0e14',
    border: neutral ? '1px solid var(--border)' : 'none',
  }),
  split: { display: 'flex', gap: 18, alignItems: 'stretch', minHeight: 480 } as CSSProperties,
  rail: { width: 280, flexShrink: 0 } as CSSProperties,
  railHeader: { fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '0 0 8px' } as CSSProperties,
  railEmpty: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.5, margin: '4px 0 0' } as CSSProperties,
  newDmBtn: {
    marginLeft: 'auto', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 7,
    color: 'var(--accent)', fontSize: 11.5, fontWeight: 700, padding: '2px 8px', cursor: 'pointer', textTransform: 'none', letterSpacing: 0,
  } as CSSProperties,
  dmPicker: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, marginBottom: 8 } as CSSProperties,
  dmPickerRow: {
    display: 'flex', alignItems: 'center', gap: 9, width: '100%', background: 'transparent', border: 'none',
    color: 'var(--text)', fontSize: 13.5, padding: '7px 8px', cursor: 'pointer', borderRadius: 8, textAlign: 'left',
  } as CSSProperties,
  dmRole: { marginLeft: 'auto', color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  channelRow: (active: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
    background: active ? 'var(--panel)' : 'transparent', border: active ? '1px solid var(--border)' : '1px solid transparent',
    borderRadius: 10, padding: '8px 10px', marginBottom: 2, color: 'var(--text)',
  }),
  channelMeta: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 } as CSSProperties,
  channelName: (unread: boolean): CSSProperties => ({
    fontSize: 13.5, fontWeight: unread ? 700 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  }),
  channelPreview: { fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as CSSProperties,
  channelSide: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 } as CSSProperties,
  channelTime: { fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' } as CSSProperties,
  unreadDot: {
    background: 'var(--accent)', color: '#0b0e14', fontSize: 10.5, fontWeight: 800, borderRadius: 999,
    minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
  } as CSSProperties,
  unreadBullet: { width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' } as CSSProperties,
  chatMain: {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
    background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden',
  } as CSSProperties,
  chatHeader: { display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  chatHeaderSub: { fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 560 } as CSSProperties,
  messages: { flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 520 } as CSSProperties,
  emptyChat: { color: 'var(--muted)', margin: 'auto', padding: 24, textAlign: 'center' } as CSSProperties,
  bubbleMeta: { display: 'flex', gap: 8, fontSize: 11, color: 'var(--muted)', margin: '0 4px 3px' } as CSSProperties,
  bubble: (mine: boolean): CSSProperties => ({
    maxWidth: '72%', padding: '9px 13px', borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
    background: mine ? 'var(--accent)' : 'var(--panel-2)', color: mine ? '#0b0e14' : 'var(--text)',
    border: mine ? 'none' : '1px solid var(--border)', fontSize: 14, lineHeight: 1.45, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
  }),
  fileLink: { color: 'inherit', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  fileSize: { fontSize: 11.5, opacity: 0.75, fontWeight: 500 } as CSSProperties,
  chatErr: { color: 'var(--bad, #f7768e)', fontSize: 12.5, padding: '6px 16px' } as CSSProperties,
  composer: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderTop: '1px solid var(--border)' } as CSSProperties,
  iconBtn: (active: boolean): CSSProperties => ({
    background: active ? 'var(--accent)' : 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9,
    fontSize: 16, width: 38, height: 38, cursor: 'pointer', flexShrink: 0,
  }),
  composerInput: {
    flex: 1, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10,
    color: 'var(--text)', padding: '10px 13px', fontSize: 14, outline: 'none',
  } as CSSProperties,
  sendBtn: {
    background: 'var(--accent)', color: '#0b0e14', fontWeight: 700, border: 'none', borderRadius: 10,
    padding: '10px 18px', fontSize: 13.5, cursor: 'pointer',
  } as CSSProperties,
  ghostBtn: {
    background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)',
    padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
  } as CSSProperties,
  composeBtn: {
    width: '100%', background: 'var(--accent)', color: '#0b0e14', fontWeight: 700, border: 'none', borderRadius: 10,
    padding: '10px 14px', fontSize: 13.5, cursor: 'pointer', marginBottom: 12,
  } as CSSProperties,
  folderRow: (active: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer',
    background: active ? 'var(--panel)' : 'transparent', border: active ? '1px solid var(--border)' : '1px solid transparent',
    borderRadius: 10, padding: '9px 12px', marginBottom: 2, color: 'var(--text)', fontSize: 13.5, fontWeight: active ? 700 : 500,
  }),
  mailRow: (active: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', cursor: 'pointer',
    background: active ? 'var(--panel)' : 'transparent', border: active ? '1px solid var(--border)' : '1px solid transparent',
    borderRadius: 10, padding: '8px 10px', marginBottom: 2, color: 'var(--text)',
  }),
  composeForm: { padding: '18px 22px', display: 'flex', flexDirection: 'column' } as CSSProperties,
  label: { fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', margin: '10px 0 6px' } as CSSProperties,
  recipientWrap: { display: 'flex', flexWrap: 'wrap', gap: 7 } as CSSProperties,
  recipientChip: (picked: boolean): CSSProperties => ({
    background: picked ? 'var(--accent)' : 'var(--panel-2)', color: picked ? '#0b0e14' : 'var(--text)',
    border: '1px solid var(--border)', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  }),
  input: {
    background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)',
    padding: '10px 13px', fontSize: 14, outline: 'none',
  } as CSSProperties,
  textarea: {
    background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)',
    padding: '10px 13px', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
  } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 12, marginTop: 12 } as CSSProperties,
  mailOpen: { padding: '20px 24px', overflowY: 'auto' } as CSSProperties,
  mailMeta: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, margin: '10px 0 16px', flexWrap: 'wrap' } as CSSProperties,
  mailBody: { fontSize: 14.5, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '4px 4px' } as CSSProperties,
  groupTitle: { fontSize: 14.5, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  groupCount: {
    fontSize: 11, fontWeight: 600, color: 'var(--muted)', background: 'var(--panel-2)',
    border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px',
  } as CSSProperties,
  inboxRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  actionPill: (verb: string): CSSProperties => ({
    fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
    color: verb === 'Pay' ? 'var(--good)' : 'var(--accent)', background: 'var(--panel-2)',
    border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px', whiteSpace: 'nowrap', minWidth: 58, textAlign: 'center',
  }),
  inboxTitle: {
    color: 'var(--text)', textDecoration: 'none', fontSize: 13.5, fontWeight: 600, display: 'block',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  } as CSSProperties,
  inboxDetail: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2 } as CSSProperties,
  inboxValue: { fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' } as CSSProperties,
  notifCard: (read: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'flex-start', gap: 12, background: 'var(--panel)',
    border: read ? '1px solid var(--border)' : '1px solid var(--accent)', borderRadius: 12, padding: '12px 14px', opacity: read ? 0.72 : 1,
  }),
  notifCat: (category: string): CSSProperties => ({
    fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
    color: category === 'chat' || category === 'mail' ? '#0b0e14' : 'var(--muted)',
    background: category === 'chat' ? '#9ece6a' : category === 'mail' ? '#7aa2f7' : 'var(--panel-2)',
    border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap',
  }),
  viewRow: {
    display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel)',
    border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px',
  } as CSSProperties,
  viewPath: { color: 'var(--muted)', fontSize: 12, fontFamily: 'ui-monospace, monospace' } as CSSProperties,
};
