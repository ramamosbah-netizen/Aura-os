// Internal communications — team chat (company / department / direct) and
// internal mail. Framework-free model + pure helpers shared by API and web so
// both compute channels, visibility and unread counts identically.

import { newId } from '../domain/id';
import type { WorkspaceRoleId } from '../workspace';

// ---------------------------------------------------------------- chat model

export type ChannelKind = 'company' | 'department' | 'dm';

export interface ChatChannel {
  id: string;
  kind: ChannelKind;
  name: string;
  /** usernames; empty for `company` (everyone is a member) */
  members: string[];
}

export type ChatMessageKind = 'text' | 'file' | 'voice';

export interface ChatAttachment {
  name: string;
  mime: string;
  /** bytes (of the decoded payload, as reported by the client) */
  size: number;
  /** data: URL — dev transport; a blob store can replace this behind the same shape */
  dataUrl: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  sender: string;
  kind: ChatMessageKind;
  text: string;
  attachment: ChatAttachment | null;
  sentAt: string;
}

/** Attachment cap (data-URL length ≈ 4/3 × bytes) — keeps the dev store sane. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Deterministic DM channel id for a pair of users, order-independent. */
export function dmChannelId(a: string, b: string): string {
  return `dm:${[a, b].sort().join('|')}`;
}

/** The other participant of a DM channel (or null for non-DMs). */
export function dmPeer(channelId: string, me: string): string | null {
  if (!channelId.startsWith('dm:')) return null;
  const pair = channelId.slice(3).split('|');
  return pair.find((u) => u !== me) ?? pair[0] ?? null;
}

/** Department label for a role — which team channel its users belong to. */
const ROLE_DEPARTMENT: Partial<Record<WorkspaceRoleId, string>> = {
  admin: 'Leadership',
  executive: 'Leadership',
  finance: 'Finance',
  procurement: 'Procurement',
  projects: 'Projects',
  operations: 'Operations',
  hr: 'HR',
};

/**
 * Seed channels from the workspace directory: one company-wide channel plus a
 * department channel per team that has members. Viewers only get the company channel.
 */
export function defaultChannelsForDirectory(assignments: Record<string, WorkspaceRoleId>): ChatChannel[] {
  const byDept = new Map<string, string[]>();
  for (const [username, role] of Object.entries(assignments)) {
    const dept = ROLE_DEPARTMENT[role];
    if (!dept) continue;
    byDept.set(dept, [...(byDept.get(dept) ?? []), username]);
  }
  const channels: ChatChannel[] = [
    { id: 'ch-company', kind: 'company', name: 'All company', members: [] },
  ];
  for (const [dept, members] of [...byDept.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    channels.push({ id: `ch-dept-${dept.toLowerCase()}`, kind: 'department', name: dept, members: members.sort() });
  }
  return channels;
}

/** Channels a user can see: company always; department/dm when a member; admins see all. */
export function visibleChannels(channels: ChatChannel[], username: string, isAdmin: boolean): ChatChannel[] {
  return channels.filter(
    (c) => c.kind === 'company' || isAdmin || c.members.includes(username),
  );
}

export interface NewChatMessage {
  channelId: string;
  sender: string;
  kind: ChatMessageKind;
  text?: string;
  attachment?: ChatAttachment | null;
}

/** Validate + construct a chat message. Returns an error string instead of throwing. */
export function makeChatMessage(input: NewChatMessage): ChatMessage | { error: string } {
  const text = (input.text ?? '').trim();
  const attachment = input.attachment ?? null;
  if (input.kind === 'text' && !text) return { error: 'Message text is required' };
  if ((input.kind === 'file' || input.kind === 'voice') && !attachment) {
    return { error: 'Attachment is required for file/voice messages' };
  }
  if (attachment && attachment.size > MAX_ATTACHMENT_BYTES) {
    return { error: `Attachment exceeds ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB limit` };
  }
  return {
    id: newId(),
    channelId: input.channelId,
    sender: input.sender,
    kind: input.kind,
    text,
    attachment,
    sentAt: new Date().toISOString(),
  };
}

/** Messages newer than the user's last-read marker, excluding their own. */
export function unreadChatCount(messages: ChatMessage[], username: string, lastReadAt: string | null): number {
  return messages.filter((m) => m.sender !== username && (!lastReadAt || m.sentAt > lastReadAt)).length;
}

// ---------------------------------------------------------------- mail model

export interface MailMessage {
  id: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  sentAt: string;
  /** usernames that have opened it */
  readBy: string[];
}

export interface NewMail {
  from: string;
  to: string[];
  subject?: string;
  body?: string;
}

export function makeMail(input: NewMail): MailMessage | { error: string } {
  const to = (input.to ?? []).map((t) => t.trim()).filter(Boolean);
  if (!to.length) return { error: 'At least one recipient is required' };
  const subject = (input.subject ?? '').trim();
  const body = (input.body ?? '').trim();
  if (!subject && !body) return { error: 'Subject or body is required' };
  return {
    id: newId(),
    from: input.from,
    to,
    subject: subject || '(no subject)',
    body,
    sentAt: new Date().toISOString(),
    readBy: [input.from],
  };
}

export interface Mailbox {
  inbox: MailMessage[];
  sent: MailMessage[];
  unread: number;
}

/** Split the tenant's mail into the user's inbox/sent, newest first. */
export function mailboxFor(mails: MailMessage[], username: string): Mailbox {
  const newestFirst = (a: MailMessage, b: MailMessage) => (a.sentAt < b.sentAt ? 1 : -1);
  const inbox = mails.filter((m) => m.to.includes(username)).sort(newestFirst);
  const sent = mails.filter((m) => m.from === username).sort(newestFirst);
  return { inbox, sent, unread: inbox.filter((m) => !m.readBy.includes(username)).length };
}

/** Friendly display name for a username: "u-finance" → "Finance". */
export function displayName(username: string): string {
  const base = username.replace(/^u-/, '').replace(/[-_.]+/g, ' ');
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}
