import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  History,
  Inbox,
  LayoutDashboard,
  Mail,
  MessageCircleMore,
  MessageSquareText,
  Search,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { fetchJson, getJson } from '@/lib/api';
import AuraTabLink from '@/components/aura-tab-link';
import AuraTabAnchor from '@/components/aura-tab-anchor';
import InternalChat, { type ChatChannelView, type ChatUserView } from '@/components/internal-chat';
import EmailWorkspace, { type MailAccountView } from '@/components/email-workspace';
import WhatsAppInbox from '@/components/whatsapp-inbox';
import MeetingsWorkspace, { type MeetingView } from '@/components/meetings-workspace';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import styles from '@/components/my-work-center.module.css';

export const dynamic = 'force-dynamic';

interface MailItem { id: string; from: string; to: string[]; subject: string; sentAt: string; readBy: string[] }
interface Mailbox { inbox: MailItem[]; sent: MailItem[]; unread: number }
interface WorkspaceMe { username: string }
interface WorkspaceUser { username: string; roleLabel: string }
interface CommunicationFileView {
  id: string;
  channelId: string;
  channelName: string;
  sender: string;
  kind: 'file' | 'voice' | 'whatsapp-media';
  source: 'chat' | 'whatsapp';
  name: string;
  mime: string;
  size: number;
  dataUrl: string | null;
  sentAt: string;
}

interface UnreadCommunicationView {
  id: string;
  source: 'chat' | 'mail' | 'whatsapp';
  title: string;
  detail: string;
  date: string;
  channelId: string | null;
  mailId: string | null;
  threadId: string | null;
}
interface WhatsAppThreadView { id: string; displayName: string; phone: string; unread: number; lastMessageAt: string | null; lastPreview: string | null; contactId: string | null; accountId: string | null }
interface WhatsAppStatusView { configured: boolean }
interface CrmContactView { id: string; name: string; accountId: string | null; phone: string | null }
interface CrmAccountView { id: string; name: string }

interface RecentCommunication {
  id: string;
  title: string;
  detail: string;
  date: string;
  href: string;
  kind: 'Chat' | 'Mail' | 'Meeting';
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The Communication sections share one workspace: internal chat, mail, meetings, WhatsApp and
 * shared-file projections. Provider-backed channels keep an honest live status rather than
 * presenting an unconfigured integration as if it were operational.
 */
type ViewId = 'overview' | 'email' | 'chat' | 'meetings' | 'whatsapp' | 'files' | 'unread';

const VIEWS: Array<{ id: ViewId; label: string; status: string; icon: typeof Mail }> = [
  { id: 'overview', label: 'Overview', status: 'Live', icon: LayoutDashboard },
  { id: 'email', label: 'Email', status: 'Internal only', icon: Mail },
  { id: 'chat', label: 'Chat', status: 'Live', icon: MessageSquareText },
  { id: 'meetings', label: 'Meetings', status: 'Live', icon: CalendarClock },
  { id: 'whatsapp', label: 'WhatsApp', status: 'Not connected', icon: MessageCircleMore },
  { id: 'files', label: 'Shared Files', status: 'Live', icon: Share2 },
  { id: 'unread', label: 'Unread', status: 'Live', icon: Inbox },
];
const VIEW_GROUPS: Array<{ label: string; ids: ViewId[] }> = [
  { label: 'Your work', ids: ['unread', 'files'] },
  { label: 'Internal', ids: ['chat', 'meetings'] },
  { label: 'External', ids: ['whatsapp', 'email'] },
];

export default async function MyCommunicationPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; channel?: string; mail?: string; thread?: string; meeting?: string }>;
}) {
  const { view: requestedView, channel: deepLinkedChannel, mail: deepLinkedMail, thread: deepLinkedThread, meeting: deepLinkedMeeting } = await searchParams;
  // A bare ?channel= link means "open this conversation", so it implies the chat view.
  const view: ViewId = (VIEWS.find((entry) => entry.id === requestedView)?.id
    ?? (deepLinkedChannel ? 'chat' : deepLinkedMail ? 'email' : 'overview'));

  // Channels use fetchJson so a refusal is distinguishable from an empty list. C1 conceals
  // channels a user may not see, and rendering "no conversations" for a 403 would misreport it.
  const [channelResult, mailbox, me, users, accounts, fileResult, unreadResult, whatsappResult, whatsappStatusResult, meetings, crmContacts, crmAccounts] = await Promise.all([
    fetchJson<ChatChannelView[]>('/api/comms/channels'),
    getJson<Mailbox>('/api/comms/mail'),
    getJson<WorkspaceMe>('/api/workspace/me'),
    getJson<WorkspaceUser[]>('/api/comms/people'),
    getJson<MailAccountView[]>('/api/comms/mailbox/accounts'),
    fetchJson<CommunicationFileView[]>('/api/comms/files'),
    fetchJson<UnreadCommunicationView[]>('/api/comms/unread/items'),
    fetchJson<WhatsAppThreadView[]>('/api/comms/whatsapp/threads'),
    getJson<WhatsAppStatusView>('/api/comms/whatsapp/status'),
    getJson<MeetingView[]>('/api/comms/meetings?scope=all'),
    fetchJson<CrmContactView[]>('/api/crm/contacts?status=active'),
    fetchJson<CrmAccountView[]>('/api/crm/accounts?status=active'),
  ]);
  const channels = channelResult.ok ? channelResult.data : null;
  const files = fileResult.ok ? fileResult.data : null;
  const unreadItems = unreadResult.ok ? unreadResult.data : null;
  const whatsappThreads = whatsappResult.ok ? whatsappResult.data : null;
  // WhatsApp is projected by the same authenticated unread endpoint as Chat and Mail. Keeping
  // one source here prevents duplicate rows when a thread appears in both projections.
  const allUnreadItems: UnreadCommunicationView[] | null = unreadItems;
  const views = VIEWS.map((entry) => entry.id === 'whatsapp'
    ? { ...entry, status: whatsappStatusResult?.configured ? 'Connected' : 'Not connected' }
    : entry);

  const recent: RecentCommunication[] = [
    ...(channels ?? []).filter((channel) => channel.lastMessageAt).map((channel) => ({
      id: `channel-${channel.id}`,
      title: channel.name,
      detail: channel.lastPreview ?? 'Recent team conversation',
      date: channel.lastMessageAt!,
      href: `/my-work/communication?view=chat&channel=${encodeURIComponent(channel.id)}`,
      kind: 'Chat' as const,
    })),
    ...(mailbox?.inbox ?? []).map((mail) => ({
      id: `mail-${mail.id}`, title: mail.subject || '(No subject)', detail: `From ${mail.from}`,
      date: mail.sentAt, href: '/my-work/communication?view=email', kind: 'Mail' as const,
    })),
    ...(whatsappThreads ?? []).filter((thread) => thread.lastMessageAt).map((thread) => ({
      id: `whatsapp-${thread.id}`, title: thread.displayName, detail: thread.lastPreview ?? thread.phone,
      date: thread.lastMessageAt!, href: `/my-work/communication?view=whatsapp&thread=${encodeURIComponent(thread.id)}`, kind: 'Chat' as const,
    })),
    ...(meetings ?? []).map((meeting) => ({
      id: `meeting-${meeting.id}`, title: meeting.title, detail: `${meeting.status} · ${meeting.meetingType.replaceAll('_', ' ')}`,
      date: meeting.startsAt, href: `/my-work/communication?view=meetings&meeting=${encodeURIComponent(meeting.id)}`, kind: 'Meeting' as const,
    })),
  ].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 10);

  const channelsAvailable = channels !== null || whatsappThreads !== null;
  const mailboxAvailable = mailbox !== null;

  const historyList = !channelsAvailable && !mailboxAvailable
    ? <p className={styles.empty}>Communication sources are currently unavailable.</p>
    : recent.length === 0
      ? <p className={styles.empty}>No communication history is available yet.</p>
      : recent.map((item) => (
        <AuraTabLink key={item.id} href={item.href} tabTitle={item.title} tabType={item.kind} className={styles.decision}>
          <span className={styles.verb}>{item.kind}</span>
          <span className={styles.decisionMain}><strong>{item.title}</strong><small>{item.detail}</small></span>
          <span className={styles.module}>{new Intl.DateTimeFormat(DISPLAY_LOCALE, { day: '2-digit', month: 'short', timeZone: DISPLAY_TIME_ZONE }).format(new Date(item.date))}</span>
          <ArrowRight aria-hidden />
        </AuraTabLink>
      ));

  return (
    <main className={styles.page} data-testid="my-communication-page">
      <AuraTabAnchor href="/my-work/communication" title="Communication" type="My Work" />
      <AuraTabLink href="/my-work" tabTitle="My Work" tabType="Workspace" className={styles.back}><ArrowLeft aria-hidden />My Work</AuraTabLink>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>MY WORK / COMMUNICATION</p>
          <h1>Communication</h1>
          <p>Company, team and direct conversations, with document sharing and contact history alongside.</p>
        </div>
        <AuraTabLink href="/my-work/communication?view=chat" tabTitle="Chat" tabType="My Work" className={styles.heroAction}>Open chat <ArrowRight aria-hidden /></AuraTabLink>
      </header>

      <nav className={styles.channelGrid} aria-label="Communication sections">
        {VIEW_GROUPS.map((group) => (
          <section key={group.label} className={styles.channelGroup} aria-labelledby={`comm-group-${group.label.toLowerCase().replaceAll(' ', '-')}`}>
            <h2 id={`comm-group-${group.label.toLowerCase().replaceAll(' ', '-')}`} className={styles.channelGroupLabel}>{group.label}</h2>
            <div className={styles.channelGroupItems}>
              {group.ids.map((id) => {
                const entry = views.find((candidate) => candidate.id === id)!;
                const Icon = entry.icon;
                const active = entry.id === view;
                return (
                  <Link
                    key={entry.id}
                    href={`/my-work/communication?view=${entry.id}`}
                    className={`${styles.channel} ${active ? styles.channelActive : ''}`}
                    aria-current={active ? 'page' : undefined}
                    data-testid={`comm-section-${entry.id}`}
                  >
                    <span className={styles.channelIcon} aria-hidden><Icon /></span>
                    <strong>{entry.label}</strong>
                    <span className={styles.status}>{entry.status}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
        <section className={styles.channelGroup} aria-labelledby="comm-group-tools">
          <h2 id="comm-group-tools" className={styles.channelGroupLabel}>Tools</h2>
          <div className={styles.channelGroupItems}>
            <Link href="/search" className={styles.channel} data-testid="comm-tool-search">
              <span className={styles.channelIcon} aria-hidden><Search /></span>
              <strong>Search</strong>
              <span className={styles.status}>All AURA records</span>
            </Link>
          </div>
        </section>
      </nav>

      {view === 'chat' ? (
        <section className={styles.section} aria-labelledby="internal-chat-title">
          <header className={styles.sectionHead}>
            <div>
              <h2 id="internal-chat-title">Chat</h2>
              <p>Company, team and direct conversations. Messages are stored and survive a restart.</p>
            </div>
          </header>
          <InternalChat
            me={me?.username ?? ''}
            initialChannels={channels}
            users={(users ?? []) as ChatUserView[]}
            loadError={channelResult.ok ? null : channelResult.error}
            initialChannelId={deepLinkedChannel ?? null}
            syncParam="channel"
          />
        </section>
      ) : null}

      {view === 'overview' ? (
        <section className={styles.section} aria-labelledby="comm-overview-title">
          <header className={styles.sectionHead}>
            <div><h2 id="comm-overview-title">Where your communication stands</h2><p>Counts come from the live sources — nothing here is estimated.</p></div>
          </header>
          <div className={styles.stats}>
            <span className={styles.stat}><strong>{channels || whatsappThreads ? (channels?.reduce((sum, c) => sum + c.unread, 0) ?? 0) + (whatsappThreads?.reduce((sum, t) => sum + t.unread, 0) ?? 0) : '—'}</strong><small>Unread messages</small></span>
            <span className={styles.stat}><strong>{mailbox ? mailbox.unread : '—'}</strong><small>Unread mail</small></span>
            <span className={styles.stat}><strong>{channels || whatsappThreads ? (channels?.length ?? 0) + (whatsappThreads?.length ?? 0) : '—'}</strong><small>Conversations you belong to</small></span>
          </div>
          <header className={styles.sectionHead}>
            <div>
              <h2 id="comm-timeline-title">Communication timeline</h2>
              <p>What actually happened, newest first. History is part of Overview rather than a separate destination — one timeline, two lenses.</p>
            </div>
            <span className={styles.badge}><History aria-hidden /> Recent</span>
          </header>
          {historyList}
        </section>
      ) : null}

      {view === 'email' ? (
        <section className={styles.section} aria-labelledby="comm-email-title">
          <header className={styles.sectionHead}>
            <div>
              <h2 id="comm-email-title">Email</h2>
              <p>Inbox, Sent, Drafts, Scheduled and anything waiting on a delivery decision — all inside Communication.</p>
            </div>
          </header>
          <EmailWorkspace me={me?.username ?? ''} accounts={(accounts ?? []) as MailAccountView[]} initialMailId={deepLinkedMail ?? null} />
          <p className={styles.truth}><ShieldCheck aria-hidden /><span>Microsoft 365 and Gmail are not configured. Only accounts an administrator has connected can send, and none is simulated here.</span></p>
        </section>
      ) : null}

      {view === 'meetings' ? (
        <section className={styles.section} aria-labelledby="comm-meetings-title">
          <header className={styles.sectionHead}>
            <div><h2 id="comm-meetings-title">Meetings</h2><p>Schedule → Meet → Minutes → Actions → Close.</p></div>
          </header>
          <MeetingsWorkspace initialMeetings={meetings ?? []} initialMeetingId={deepLinkedMeeting ?? null} />
          <p className={styles.truth}><ShieldCheck aria-hidden /><span>AURA owns the meeting record, minutes and actions. Video links and calendar invitations remain provider integrations, so this workspace never pretends to be Zoom or Teams.</span></p>
        </section>
      ) : null}

      {view === 'whatsapp' ? (
        <section className={styles.section} aria-labelledby="comm-whatsapp-title">
          <header className={styles.sectionHead}>
            <div><h2 id="comm-whatsapp-title">WhatsApp</h2><p>Official WhatsApp Business conversations, inside the unified inbox.</p></div>
          </header>
          <WhatsAppInbox initialThreads={whatsappThreads} initialThreadId={deepLinkedThread} contacts={crmContacts.ok ? crmContacts.data : []} accounts={crmAccounts.ok ? crmAccounts.data : []} />
        </section>
      ) : null}

      {view === 'files' ? (
        <section className={styles.section} aria-labelledby="comm-files-title">
          <header className={styles.sectionHead}>
            <div><h2 id="comm-files-title">Shared Files</h2><p>Conversation attachments and WhatsApp media references are searchable here; controlled documents still live in Document Control.</p></div>
          </header>
          {files === null ? (
            <p className={styles.truth}><ShieldCheck aria-hidden /><span>Conversation files are currently unavailable. Document Control remains available for controlled documents.</span></p>
          ) : files.length === 0 ? (
            <p className={styles.empty}>No files have been shared in your conversations yet.</p>
          ) : (
            <div className={styles.list}>
              {files.map((file) => { const content = <><span className={styles.verb}>{file.source === 'whatsapp' ? 'WhatsApp' : file.kind === 'voice' ? 'Voice' : 'Chat'}</span><span className={styles.decisionMain}><strong>{file.name}</strong><small>{file.channelName} · {file.sender} · {file.size ? fileSize(file.size) : 'Media reference'}</small></span><span className={styles.module}>{new Intl.DateTimeFormat(DISPLAY_LOCALE, { day: '2-digit', month: 'short', timeZone: DISPLAY_TIME_ZONE }).format(new Date(file.sentAt))}</span><ArrowRight aria-hidden /></>; return file.dataUrl ? <a key={file.id} href={file.dataUrl} download={file.name} className={styles.decision}>{content}</a> : <div key={file.id} className={styles.decision}>{content}</div>; })}
            </div>
          )}
          <AuraTabLink href="/documents/control" tabTitle="Document Control" tabType="Communication" className={styles.decision}>
            <span className={styles.verb}>Files</span>
            <span className={styles.decisionMain}><strong>Open Document Control</strong><small>Shared documents, versions and permissions</small></span>
            <ArrowRight aria-hidden />
          </AuraTabLink>
        </section>
      ) : null}

      {view === 'unread' ? (
        <section className={styles.section} aria-labelledby="comm-unread-title">
          <header className={styles.sectionHead}>
            <div><h2 id="comm-unread-title">Unread</h2><p>One actionable list from the Chat, WhatsApp and Mail conversations you already belong to.</p></div>
          </header>
          {allUnreadItems === null ? (
            <p className={styles.truth}><ShieldCheck aria-hidden /><span>Unread communication is currently unavailable. Open Chat or Email directly to retry.</span></p>
          ) : allUnreadItems.length === 0 ? (
            <p className={styles.empty}>You are all caught up.</p>
          ) : (
            <div className={styles.list}>
              {allUnreadItems.map((item) => {
                const href = item.source === 'chat' && item.channelId
                  ? `/my-work/communication?view=chat&channel=${encodeURIComponent(item.channelId)}`
                  : item.source === 'whatsapp'
                    ? `/my-work/communication?view=whatsapp&thread=${encodeURIComponent(item.threadId ?? item.id.replace(/^whatsapp[: -]?/, ''))}`
                  : `/my-work/communication?view=email&mail=${encodeURIComponent(item.mailId ?? '')}`;
                return (
                  <AuraTabLink key={item.id} href={href} tabTitle={item.title} tabType="Communication" className={styles.decision}>
                    <span className={styles.verb}>{item.source === 'chat' ? 'Chat' : item.source === 'whatsapp' ? 'WhatsApp' : 'Mail'}</span>
                    <span className={styles.decisionMain}><strong>{item.title}</strong><small>{item.detail}</small></span>
                    <span className={styles.module}>{new Intl.DateTimeFormat(DISPLAY_LOCALE, { day: '2-digit', month: 'short', timeZone: DISPLAY_TIME_ZONE }).format(new Date(item.date))}</span>
                    <ArrowRight aria-hidden />
                  </AuraTabLink>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

    </main>
  );
}
