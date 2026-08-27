import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  History,
  LayoutDashboard,
  Mail,
  MessageCircleMore,
  MessageSquareText,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { fetchJson, getJson } from '@/lib/api';
import AuraTabLink from '@/components/aura-tab-link';
import AuraTabAnchor from '@/components/aura-tab-anchor';
import InternalChat, { type ChatChannelView, type ChatUserView } from '@/components/internal-chat';
import EmailWorkspace, { type MailAccountView } from '@/components/email-workspace';
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
  kind: 'file' | 'voice';
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  sentAt: string;
}

interface RecentCommunication {
  id: string;
  title: string;
  detail: string;
  date: string;
  href: string;
  kind: 'Chat' | 'Mail';
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The Communication sections. Only Internal Chat is built here (C2); the rest are honest
 * navigation entries whose status says what actually exists today — an entry that points at a
 * working capability elsewhere links to it, and one with no implementation says so rather than
 * offering a button that does nothing.
 */
type ViewId = 'overview' | 'email' | 'chat' | 'meetings' | 'whatsapp' | 'files';

const VIEWS: Array<{ id: ViewId; label: string; status: string; icon: typeof Mail }> = [
  { id: 'overview', label: 'Overview', status: 'Live', icon: LayoutDashboard },
  { id: 'email', label: 'Email', status: 'Internal only', icon: Mail },
  { id: 'chat', label: 'Chat', status: 'Live', icon: MessageSquareText },
  { id: 'meetings', label: 'Meetings', status: 'Not implemented', icon: CalendarClock },
  { id: 'whatsapp', label: 'WhatsApp', status: 'Not connected', icon: MessageCircleMore },
  { id: 'files', label: 'Shared Files', status: 'Live', icon: Share2 },
];

export default async function MyCommunicationPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; channel?: string; mail?: string }>;
}) {
  const { view: requestedView, channel: deepLinkedChannel, mail: deepLinkedMail } = await searchParams;
  // A bare ?channel= link means "open this conversation", so it implies the chat view.
  const view: ViewId = (VIEWS.find((entry) => entry.id === requestedView)?.id
    ?? (deepLinkedChannel ? 'chat' : deepLinkedMail ? 'email' : 'overview'));

  // Channels use fetchJson so a refusal is distinguishable from an empty list. C1 conceals
  // channels a user may not see, and rendering "no conversations" for a 403 would misreport it.
  const [channelResult, mailbox, me, users, accounts, fileResult] = await Promise.all([
    fetchJson<ChatChannelView[]>('/api/comms/channels'),
    getJson<Mailbox>('/api/comms/mail'),
    getJson<WorkspaceMe>('/api/workspace/me'),
    getJson<WorkspaceUser[]>('/api/comms/people'),
    getJson<MailAccountView[]>('/api/comms/mailbox/accounts'),
    fetchJson<CommunicationFileView[]>('/api/comms/files'),
  ]);
  const channels = channelResult.ok ? channelResult.data : null;
  const files = fileResult.ok ? fileResult.data : null;

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
  ].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 10);

  const channelsAvailable = channels !== null;
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
        {VIEWS.map((entry) => {
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
            <span className={styles.stat}><strong>{channels ? channels.reduce((sum, c) => sum + c.unread, 0) : '—'}</strong><small>Unread messages</small></span>
            <span className={styles.stat}><strong>{mailbox ? mailbox.unread : '—'}</strong><small>Unread mail</small></span>
            <span className={styles.stat}><strong>{channels ? channels.length : '—'}</strong><small>Conversations you belong to</small></span>
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
            <div><h2 id="comm-meetings-title">Meetings</h2><p>Not implemented.</p></div>
          </header>
          <p className={styles.truth}><ShieldCheck aria-hidden /><span>AURA has no meeting record, participant model or provider integration yet, so nothing is shown. Scheduling, Zoom and Teams arrive with the meetings slice; until then this section deliberately offers no controls.</span></p>
        </section>
      ) : null}

      {view === 'whatsapp' ? (
        <section className={styles.section} aria-labelledby="comm-whatsapp-title">
          <header className={styles.sectionHead}>
            <div><h2 id="comm-whatsapp-title">WhatsApp</h2><p>Not connected.</p></div>
          </header>
          <p className={styles.truth}><ShieldCheck aria-hidden /><span>WhatsApp remains a target capability only. It is intentionally disabled until an approved provider, consent model, retention policy and audit trail are connected.</span></p>
        </section>
      ) : null}

      {view === 'files' ? (
        <section className={styles.section} aria-labelledby="comm-files-title">
          <header className={styles.sectionHead}>
            <div><h2 id="comm-files-title">Shared Files</h2><p>Chat attachments are searchable here; controlled documents still live in Document Control.</p></div>
          </header>
          {files === null ? (
            <p className={styles.truth}><ShieldCheck aria-hidden /><span>Chat files are currently unavailable. Document Control remains available for controlled documents.</span></p>
          ) : files.length === 0 ? (
            <p className={styles.empty}>No files have been shared in your conversations yet.</p>
          ) : (
            <div className={styles.list}>
              {files.map((file) => (
                <a key={file.id} href={file.dataUrl} download={file.name} className={styles.decision}>
                  <span className={styles.verb}>{file.kind === 'voice' ? 'Voice' : 'Chat'}</span>
                  <span className={styles.decisionMain}><strong>{file.name}</strong><small>{file.channelName} · {file.sender} · {fileSize(file.size)}</small></span>
                  <span className={styles.module}>{new Intl.DateTimeFormat(DISPLAY_LOCALE, { day: '2-digit', month: 'short', timeZone: DISPLAY_TIME_ZONE }).format(new Date(file.sentAt))}</span>
                  <ArrowRight aria-hidden />
                </a>
              ))}
            </div>
          )}
          <AuraTabLink href="/documents/control" tabTitle="Document Control" tabType="Communication" className={styles.decision}>
            <span className={styles.verb}>Files</span>
            <span className={styles.decisionMain}><strong>Open Document Control</strong><small>Shared documents, versions and permissions</small></span>
            <ArrowRight aria-hidden />
          </AuraTabLink>
        </section>
      ) : null}

    </main>
  );
}
