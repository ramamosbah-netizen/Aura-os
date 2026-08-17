import {
  ArrowLeft,
  ArrowRight,
  ContactRound,
  History,
  Mail,
  MessageCircleMore,
  MessageSquareText,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { getJson } from '@/lib/api';
import AuraTabLink from '@/components/aura-tab-link';
import AuraTabAnchor from '@/components/aura-tab-anchor';
import styles from '@/components/my-work-center.module.css';

export const dynamic = 'force-dynamic';

interface Channel { id: string; name: string; kind: string; unread: number; lastMessageAt: string | null; lastPreview: string | null }
interface MailItem { id: string; from: string; to: string[]; subject: string; sentAt: string; readBy: string[] }
interface Mailbox { inbox: MailItem[]; sent: MailItem[]; unread: number }

interface RecentCommunication {
  id: string;
  title: string;
  detail: string;
  date: string;
  href: string;
  kind: 'Chat' | 'Mail';
}

export default async function MyCommunicationPage() {
  const [channels, mailbox] = await Promise.all([
    getJson<Channel[]>('/api/comms/channels'),
    getJson<Mailbox>('/api/comms/mail'),
  ]);
  const recent: RecentCommunication[] = [
    ...(channels ?? []).filter((channel) => channel.lastMessageAt).map((channel) => ({
      id: `channel-${channel.id}`, title: channel.name, detail: channel.lastPreview ?? 'Recent team conversation',
      date: channel.lastMessageAt!, href: '/workspace?tab=chat', kind: 'Chat' as const,
    })),
    ...(mailbox?.inbox ?? []).map((mail) => ({
      id: `mail-${mail.id}`, title: mail.subject || '(No subject)', detail: `From ${mail.from}`,
      date: mail.sentAt, href: '/workspace?tab=mail', kind: 'Mail' as const,
    })),
  ].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 10);

  const channelsAvailable = channels !== null;
  const mailboxAvailable = mailbox !== null;
  const cards = [
    { label: 'Chat', description: 'Latest project and team conversations', href: '/workspace?tab=chat', icon: MessageSquareText, status: channelsAvailable ? 'Live' : 'Unavailable' },
    { label: 'Mail', description: 'Internal inbox, sent items and compose', href: '/workspace?tab=mail', icon: Mail, status: mailboxAvailable ? 'Live' : 'Unavailable' },
    { label: 'WhatsApp', description: 'External messaging integration', icon: MessageCircleMore, status: 'Not connected' },
    { label: 'Share document', description: 'Open documents and manage sharing', href: '/documents/control', icon: Share2, status: 'Live' },
    { label: 'Contact link', description: 'Find a person or organization', href: '/crm/contacts', icon: ContactRound, status: 'Live' },
  ];

  return (
    <main className={styles.page} data-testid="my-communication-page">
      <AuraTabAnchor href="/my-work/communication" title="Communication" type="My Work" />
      <AuraTabLink href="/my-work" tabTitle="My Work" tabType="Workspace" className={styles.back}><ArrowLeft aria-hidden />My Work</AuraTabLink>
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>MY WORK / COMMUNICATION</p><h1>Communication</h1><p>One launch point for available communication channels, document sharing and the latest contact history.</p></div>
        <AuraTabLink href="/workspace?tab=chat" tabTitle="Communication Hub" tabType="My Work" className={styles.heroAction}>Open communication hub <ArrowRight aria-hidden /></AuraTabLink>
      </header>

      <section className={styles.channelGrid} aria-label="Communication tools">
        {cards.map((card) => {
          const Icon = card.icon;
          const content = <><span className={styles.channelIcon} aria-hidden><Icon /></span><strong>{card.label}</strong><small>{card.description}</small><span className={styles.status}>{card.status}</span></>;
          return card.href
            ? <AuraTabLink key={card.label} href={card.href} tabTitle={card.label} tabType="Communication" className={styles.channel}>{content}</AuraTabLink>
            : <div key={card.label} className={`${styles.channel} ${styles.channelDisabled}`} aria-disabled="true">{content}</div>;
        })}
      </section>

      <section className={styles.section} aria-labelledby="recent-communication">
        <header className={styles.sectionHead}><div><h2 id="recent-communication">Latest communication history</h2><p>Most recent available chat and mail activity.</p></div><span className={styles.badge}><History aria-hidden /> Recent</span></header>
        {!channelsAvailable && !mailboxAvailable ? <p className={styles.empty}>Communication sources are currently unavailable.</p> : recent.length === 0 ? <p className={styles.empty}>No communication history is available yet.</p> : recent.map((item) => (
          <AuraTabLink key={item.id} href={item.href} tabTitle={item.title} tabType={item.kind} className={styles.decision}>
            <span className={styles.verb}>{item.kind}</span><span className={styles.decisionMain}><strong>{item.title}</strong><small>{item.detail}</small></span><span className={styles.module}>{new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Dubai' }).format(new Date(item.date))}</span><ArrowRight aria-hidden />
          </AuraTabLink>
        ))}
      </section>
      <p className={styles.truth}><ShieldCheck aria-hidden /><span>WhatsApp remains a target capability only. It is intentionally disabled until an approved provider, consent model, retention policy and audit trail are connected.</span></p>
    </main>
  );
}
